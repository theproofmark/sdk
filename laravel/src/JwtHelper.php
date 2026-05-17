<?php

namespace ProofMark\ShowAd;

/**
 * JWT decoding helper.
 *
 * IMPORTANT: this helper does NOT verify the signature. The ShowAd backend
 * issues and verifies tokens; the SDK only inspects unsigned claims to make
 * cheap local decisions (expiry, creator-hash, fingerprint).
 *
 * Defense-in-depth: rejects tokens whose header `alg` is `none` or outside
 * the HS256/HS384/HS512/RS256/RS384/RS512/ES256/ES384 whitelist.
 */
class JwtHelper
{
    const ISSUER = 'showad-backend';

    const ALLOWED_ALGORITHMS = [
        'HS256', 'HS384', 'HS512',
        'RS256', 'RS384', 'RS512',
        'ES256', 'ES384',
    ];

    const DEFAULT_LEEWAY_SECONDS = 60;

    /**
     * Decode a JWT token without signature verification.
     * Used for reading claims (expiry, creator_hash, etc.)
     *
     * WARNING: This does NOT verify the token signature.
     * Signature verification is done by the ShowAd backend.
     *
     * @param string $token
     * @return array|null
     */
    public static function decodeToken($token)
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        $headerJson = static::decodeBase64Url($parts[0]);
        if ($headerJson === false) {
            return null;
        }
        $header = json_decode($headerJson, true);
        if (!is_array($header) || !isset($header['alg']) || !is_string($header['alg'])) {
            return null;
        }
        if (!in_array($header['alg'], static::ALLOWED_ALGORITHMS, true)) {
            return null;
        }

        $payload = static::decodeBase64Url($parts[1]);

        if ($payload === false) {
            return null;
        }

        $claims = json_decode($payload, true);

        if (!is_array($claims)) {
            return null;
        }

        return $claims;
    }

    /**
     * Check if a token is expired.
     *
     * @param string $token
     * @param int    $leewaySeconds
     * @return bool
     */
    public static function isTokenExpired($token, $leewaySeconds = self::DEFAULT_LEEWAY_SECONDS)
    {
        $claims = static::decodeToken($token);
        if (!$claims) {
            return true;
        }

        $now = time();

        if (isset($claims['exp']) && ((int) $claims['exp'] + $leewaySeconds) < $now) {
            return true;
        }

        if (isset($claims['nbf']) && ((int) $claims['nbf'] - $leewaySeconds) > $now) {
            return true;
        }

        if (isset($claims['iat']) && ((int) $claims['iat'] - $leewaySeconds) > $now) {
            return true;
        }

        return false;
    }

    /**
     * Get token expiry as Unix seconds (matches JWT `exp` claim).
     *
     * @param string $token
     * @return int|null
     */
    public static function getTokenExpiry($token)
    {
        $claims = static::decodeToken($token);
        if (!$claims || !isset($claims['exp'])) {
            return null;
        }

        return (int) $claims['exp'];
    }

    /**
     * Get time until token expires in seconds.
     * Returns negative value if already expired.
     *
     * @param string $token
     * @return int
     */
    public static function getTimeUntilExpiry($token)
    {
        $expiry = static::getTokenExpiry($token);
        if ($expiry === null) {
            return -1;
        }

        return $expiry - time();
    }

    /**
     * Validate token claims against expected values.
     *
     * @param string $token
     * @param string $expectedCreatorHash
     * @param string|null $expectedFingerprint
     * @param array  $options { leeway_seconds?: int, require_issuer?: bool }
     * @return array ['valid' => bool, 'reason' => string|null]
     */
    public static function validateTokenClaims($token, $expectedCreatorHash, $expectedFingerprint = null, array $options = [])
    {
        $leeway = isset($options['leeway_seconds']) ? (int) $options['leeway_seconds'] : static::DEFAULT_LEEWAY_SECONDS;
        $requireIssuer = array_key_exists('require_issuer', $options) ? (bool) $options['require_issuer'] : true;

        $claims = static::decodeToken($token);

        if (!$claims) {
            return ['valid' => false, 'reason' => 'Invalid token format'];
        }

        if (static::isTokenExpired($token, $leeway)) {
            return ['valid' => false, 'reason' => 'Token expired'];
        }

        if (!isset($claims['creator_hash']) || !is_string($claims['creator_hash'])
            || !hash_equals((string) $claims['creator_hash'], (string) $expectedCreatorHash)) {
            return ['valid' => false, 'reason' => 'Creator hash mismatch'];
        }

        if ($expectedFingerprint !== null) {
            if (!isset($claims['fingerprint']) || !is_string($claims['fingerprint'])
                || !hash_equals((string) $claims['fingerprint'], (string) $expectedFingerprint)) {
                return ['valid' => false, 'reason' => 'Fingerprint mismatch'];
            }
        }

        if ($requireIssuer) {
            if (!isset($claims['iss']) || $claims['iss'] !== static::ISSUER) {
                return ['valid' => false, 'reason' => 'Invalid issuer'];
            }
        } elseif (isset($claims['iss']) && $claims['iss'] !== static::ISSUER) {
            return ['valid' => false, 'reason' => 'Invalid issuer'];
        }

        return ['valid' => true, 'reason' => null];
    }

    /**
     * Extract creator hash from token.
     *
     * @param string $token
     * @return string|null
     */
    public static function getCreatorHashFromToken($token)
    {
        $claims = static::decodeToken($token);
        return $claims && isset($claims['creator_hash']) ? $claims['creator_hash'] : null;
    }

    /**
     * Extract fingerprint from token.
     *
     * @param string $token
     * @return string|null
     */
    public static function getFingerprintFromToken($token)
    {
        $claims = static::decodeToken($token);
        return $claims && isset($claims['fingerprint']) ? $claims['fingerprint'] : null;
    }

    /**
     * Extract session hash from token.
     *
     * @param string $token
     * @return string|null
     */
    public static function getSessionHashFromToken($token)
    {
        $claims = static::decodeToken($token);
        return $claims && isset($claims['session_hash']) ? $claims['session_hash'] : null;
    }

    /**
     * Decode a base64url string.
     *
     * @param string $value
     * @return string|false
     */
    protected static function decodeBase64Url($value)
    {
        $value = str_replace(['-', '_'], ['+', '/'], $value);
        $padding = strlen($value) % 4;

        if ($padding > 0) {
            $value .= str_repeat('=', 4 - $padding);
        }

        return base64_decode($value, true);
    }
}
