<?php
/**
 * JWT helper — decode and validate JWT tokens.
 *
 * Client-side only: does NOT verify signatures.
 * Signature verification happens on the ShowAd backend via /api/sdk/validate.
 *
 * @package ShowAd
 */

namespace ShowAd;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class JwtHelper {

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
     * @param string $token JWT token.
     * @return bool True if expired or invalid.
     */
    public static function is_token_expired( $token ) {
        $claims = self::decode_token( $token );
        if ( null === $claims ) {
            return true;
        }

        // Check expiry.
        if ( isset( $claims['exp'] ) && $claims['exp'] < time() ) {
            return true;
        }

        // Check not-before.
        if ( isset( $claims['nbf'] ) && $claims['nbf'] > time() ) {
            return true;
        }

        return false;
    }

    /**
     * Get the token expiry as milliseconds timestamp.
     *
     * @param string $token JWT token.
     * @return int|null Expiry in milliseconds, or null.
     */
    public static function get_token_expiry( $token ) {
        $claims = self::decode_token( $token );
        if ( null === $claims || ! isset( $claims['exp'] ) ) {
            return null;
        }
        return $claims['exp'] * 1000;
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
        return max( 0, $claims['exp'] - time() );
    }

    /**
     * Validate token claims against expected values.
     *
     * @param string      $token                JWT token.
     * @param string      $expected_creator_hash Expected creator_hash.
     * @param string|null $expected_fingerprint  Expected fingerprint (optional).
     * @return array { @type bool $valid, @type string|null $reason }
     */
    public static function validate_token_claims( $token, $expected_creator_hash, $expected_fingerprint = null ) {
        $claims = self::decode_token( $token );
        if ( null === $claims ) {
            return array( 'valid' => false, 'reason' => 'invalid_format' );
        }

        if ( self::is_token_expired( $token ) ) {
            return array( 'valid' => false, 'reason' => 'expired' );
        }

        $token_creator = isset( $claims['creator_hash'] ) ? $claims['creator_hash'] : '';
        if ( ! empty( $expected_creator_hash ) && $token_creator !== $expected_creator_hash ) {
            return array( 'valid' => false, 'reason' => 'creator_mismatch' );
        }

        if ( null !== $expected_fingerprint ) {
            $token_fp = isset( $claims['fingerprint'] ) ? $claims['fingerprint'] : '';
            if ( $token_fp !== $expected_fingerprint ) {
                return array( 'valid' => false, 'reason' => 'fingerprint_mismatch' );
            }
        }

        // Verify issuer.
        $issuer = isset( $claims['iss'] ) ? $claims['iss'] : '';
        if ( ! empty( $issuer ) && 'showad-backend' !== $issuer ) {
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
