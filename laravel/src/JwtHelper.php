<?php

namespace ProofMark\ShowAd;

class JwtHelper
{
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
     * @return bool
     */
    public static function isTokenExpired($token)
    {
        $claims = static::decodeToken($token);
        if (!$claims) {
            return true;
        }

        $now = time();

        // Check exp claim
        if (isset($claims['exp']) && $claims['exp'] < $now) {
            return true;
        }

        // Check nbf claim (not before)
        if (isset($claims['nbf']) && $claims['nbf'] > $now) {
            return true;
        }

        return false;
    }

    /**
     * Get token expiry timestamp in milliseconds.
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

        return $claims['exp'] * 1000;
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

        return (int) floor(($expiry - (time() * 1000)) / 1000);
    }

    /**
     * Validate token claims against expected values.
     *
     * @param string $token
     * @param string $expectedCreatorHash
     * @param string|null $expectedFingerprint
     * @return array ['valid' => bool, 'reason' => string|null]
     */
    public static function validateTokenClaims($token, $expectedCreatorHash, $expectedFingerprint = null)
    {
        $claims = static::decodeToken($token);

        if (!$claims) {
            return ['valid' => false, 'reason' => 'Invalid token format'];
        }

        // Check expiry
        if (static::isTokenExpired($token)) {
            return ['valid' => false, 'reason' => 'Token expired'];
        }

        // Check creator hash
        if (!isset($claims['creator_hash']) || $claims['creator_hash'] !== $expectedCreatorHash) {
            return ['valid' => false, 'reason' => 'Creator hash mismatch'];
        }

        // Check fingerprint if provided
        if ($expectedFingerprint !== null && (!isset($claims['fingerprint']) || $claims['fingerprint'] !== $expectedFingerprint)) {
            return ['valid' => false, 'reason' => 'Fingerprint mismatch'];
        }

        // Check issuer
        if (isset($claims['iss']) && $claims['iss'] !== 'showad-backend') {
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
