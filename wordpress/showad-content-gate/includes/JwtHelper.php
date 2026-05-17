<?php
/**
 * JWT helper — decode and validate JWT tokens.
 *
 * Client-side only: does NOT verify signatures.
 * Signature verification happens on the ShowAd backend via /api/sdk/validate.
 *
 * Defense-in-depth: rejects tokens whose header `alg` is `none` or outside
 * the HS256/HS384/HS512/RS256/RS384/RS512/ES256/ES384 whitelist.
 *
 * @package ShowAd
 */

namespace ShowAd;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class JwtHelper {

    const ISSUER = 'showad-backend';

    const DEFAULT_LEEWAY_SECONDS = 60;

    /**
     * @return string[]
     */
    public static function allowed_algorithms() {
        return array(
            'HS256', 'HS384', 'HS512',
            'RS256', 'RS384', 'RS512',
            'ES256', 'ES384',
        );
    }

    /**
     * Decode a JWT token without verifying the signature.
     *
     * @param string $token JWT token string.
     * @return array|null Decoded claims, or null on failure.
     */
    public static function decode_token( $token ) {
        $parts = explode( '.', $token );
        if ( 3 !== count( $parts ) ) {
            return null;
        }

        $header_json = self::base64url_decode( $parts[0] );
        if ( false === $header_json ) {
            return null;
        }
        $header = json_decode( $header_json, true );
        if ( ! is_array( $header ) || empty( $header['alg'] ) || ! is_string( $header['alg'] ) ) {
            return null;
        }
        if ( ! in_array( $header['alg'], self::allowed_algorithms(), true ) ) {
            return null;
        }

        $payload = self::base64url_decode( $parts[1] );
        if ( false === $payload ) {
            return null;
        }

        $claims = json_decode( $payload, true );
        if ( ! is_array( $claims ) ) {
            return null;
        }

        return $claims;
    }

    /**
     * Check if a token is expired.
     *
     * @param string $token  JWT token.
     * @param int    $leeway Clock-skew tolerance in seconds.
     * @return bool True if expired or invalid.
     */
    public static function is_token_expired( $token, $leeway = self::DEFAULT_LEEWAY_SECONDS ) {
        $claims = self::decode_token( $token );
        if ( null === $claims ) {
            return true;
        }

        $now    = time();
        $leeway = (int) $leeway;

        if ( isset( $claims['exp'] ) && ( (int) $claims['exp'] + $leeway ) < $now ) {
            return true;
        }
        if ( isset( $claims['nbf'] ) && ( (int) $claims['nbf'] - $leeway ) > $now ) {
            return true;
        }
        if ( isset( $claims['iat'] ) && ( (int) $claims['iat'] - $leeway ) > $now ) {
            return true;
        }

        return false;
    }

    /**
     * Get the token expiry as Unix seconds (matches JWT `exp` claim).
     *
     * @param string $token JWT token.
     * @return int|null Expiry in seconds, or null.
     */
    public static function get_token_expiry( $token ) {
        $claims = self::decode_token( $token );
        if ( null === $claims || ! isset( $claims['exp'] ) ) {
            return null;
        }
        return (int) $claims['exp'];
    }

    /**
     * Get seconds until token expiry.
     *
     * @param string $token JWT token.
     * @return int Seconds remaining, or -1 if no expiry.
     */
    public static function get_time_until_expiry( $token ) {
        $claims = self::decode_token( $token );
        if ( null === $claims || ! isset( $claims['exp'] ) ) {
            return -1;
        }
        return max( 0, (int) $claims['exp'] - time() );
    }

    /**
     * Validate token claims against expected values.
     *
     * @param string      $token                JWT token.
     * @param string      $expected_creator_hash Expected creator_hash.
     * @param string|null $expected_fingerprint  Expected fingerprint (optional).
     * @param array       $options { leeway_seconds?: int, require_issuer?: bool }
     * @return array { @type bool $valid, @type string|null $reason }
     */
    public static function validate_token_claims( $token, $expected_creator_hash, $expected_fingerprint = null, $options = array() ) {
        $leeway          = isset( $options['leeway_seconds'] ) ? (int) $options['leeway_seconds'] : self::DEFAULT_LEEWAY_SECONDS;
        $require_issuer  = array_key_exists( 'require_issuer', $options ) ? (bool) $options['require_issuer'] : true;

        $claims = self::decode_token( $token );
        if ( null === $claims ) {
            return array( 'valid' => false, 'reason' => 'invalid_format' );
        }

        if ( self::is_token_expired( $token, $leeway ) ) {
            return array( 'valid' => false, 'reason' => 'expired' );
        }

        $token_creator = isset( $claims['creator_hash'] ) && is_string( $claims['creator_hash'] ) ? $claims['creator_hash'] : '';
        if ( ! empty( $expected_creator_hash ) ) {
            if ( ! hash_equals( (string) $expected_creator_hash, $token_creator ) ) {
                return array( 'valid' => false, 'reason' => 'creator_mismatch' );
            }
        }

        if ( null !== $expected_fingerprint ) {
            $token_fp = isset( $claims['fingerprint'] ) && is_string( $claims['fingerprint'] ) ? $claims['fingerprint'] : '';
            if ( ! hash_equals( (string) $expected_fingerprint, $token_fp ) ) {
                return array( 'valid' => false, 'reason' => 'fingerprint_mismatch' );
            }
        }

        $issuer = isset( $claims['iss'] ) && is_string( $claims['iss'] ) ? $claims['iss'] : '';
        if ( $require_issuer ) {
            if ( self::ISSUER !== $issuer ) {
                return array( 'valid' => false, 'reason' => 'invalid_issuer' );
            }
        } elseif ( ! empty( $issuer ) && self::ISSUER !== $issuer ) {
            return array( 'valid' => false, 'reason' => 'invalid_issuer' );
        }

        return array( 'valid' => true, 'reason' => null );
    }

    /**
     * Extract creator_hash claim from token.
     *
     * @param string $token JWT token.
     * @return string|null
     */
    public static function get_creator_hash_from_token( $token ) {
        $claims = self::decode_token( $token );
        return ( $claims && isset( $claims['creator_hash'] ) ) ? $claims['creator_hash'] : null;
    }

    /**
     * Extract fingerprint claim from token.
     *
     * @param string $token JWT token.
     * @return string|null
     */
    public static function get_fingerprint_from_token( $token ) {
        $claims = self::decode_token( $token );
        return ( $claims && isset( $claims['fingerprint'] ) ) ? $claims['fingerprint'] : null;
    }

    /**
     * Extract session_hash claim from token.
     *
     * @param string $token JWT token.
     * @return string|null
     */
    public static function get_session_hash_from_token( $token ) {
        $claims = self::decode_token( $token );
        return ( $claims && isset( $claims['session_hash'] ) ) ? $claims['session_hash'] : null;
    }

    /**
     * Base64URL decode.
     *
     * @param string $data Base64URL encoded string.
     * @return string|false Decoded data or false.
     */
    private static function base64url_decode( $data ) {
        $remainder = strlen( $data ) % 4;
        if ( $remainder ) {
            $data .= str_repeat( '=', 4 - $remainder );
        }
        $decoded = base64_decode( strtr( $data, '-_', '+/' ), true );
        return $decoded;
    }
}
