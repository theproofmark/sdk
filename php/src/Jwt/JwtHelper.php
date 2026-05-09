<?php

declare(strict_types=1);

namespace ProofMark\ShowAd\Jwt;

/**
 * JWT decoding helper.
 *
 * IMPORTANT: this helper does NOT verify the signature. The ShowAd backend
 * issues and verifies tokens; the SDK only inspects unsigned claims to make
 * cheap, local decisions (expiry, creator hash match, fingerprint match).
 * Treat decoded values as untrusted hints, not authoritative facts.
 */
final class JwtHelper
{
    public const ISSUER = 'showad-backend';

    /**
     * Decode the payload section of a JWT into an associative array.
     *
     * @return array<string, mixed>|null
     */
    public static function decodeToken(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        $payload = self::base64UrlDecode($parts[1]);
        if ($payload === null) {
            return null;
        }

        $claims = json_decode($payload, true);
        if (!is_array($claims)) {
            return null;
        }

        return $claims;
    }

    public static function isTokenExpired(string $token, ?int $now = null): bool
    {
        $claims = self::decodeToken($token);
        if ($claims === null) {
            return true;
        }

        $now = $now ?? time();

        if (isset($claims['exp']) && is_numeric($claims['exp']) && (int) $claims['exp'] < $now) {
            return true;
        }

        if (isset($claims['nbf']) && is_numeric($claims['nbf']) && (int) $claims['nbf'] > $now) {
            return true;
        }

        return false;
    }

    /**
     * Returns the token expiry in milliseconds (matches Laravel SDK behaviour).
     */
    public static function getTokenExpiry(string $token): ?int
    {
        $claims = self::decodeToken($token);
        if ($claims === null || !isset($claims['exp']) || !is_numeric($claims['exp'])) {
            return null;
        }

        return ((int) $claims['exp']) * 1000;
    }

    public static function getTimeUntilExpiry(string $token, ?int $nowMs = null): int
    {
        $expiry = self::getTokenExpiry($token);
        if ($expiry === null) {
            return -1;
        }

        $nowMs = $nowMs ?? (time() * 1000);
        return (int) floor(($expiry - $nowMs) / 1000);
    }

    /**
     * Validate the locally-checkable claims of a token.
     *
     * @return array{valid: bool, reason: ?string}
     */
    public static function validateTokenClaims(string $token, string $expectedCreatorHash, ?string $expectedFingerprint = null): array
    {
        $claims = self::decodeToken($token);
        if ($claims === null) {
            return ['valid' => false, 'reason' => 'Invalid token format'];
        }

        if (self::isTokenExpired($token)) {
            return ['valid' => false, 'reason' => 'Token expired'];
        }

        if (!isset($claims['creator_hash']) || $claims['creator_hash'] !== $expectedCreatorHash) {
            return ['valid' => false, 'reason' => 'Creator hash mismatch'];
        }

        if ($expectedFingerprint !== null) {
            if (!isset($claims['fingerprint']) || $claims['fingerprint'] !== $expectedFingerprint) {
                return ['valid' => false, 'reason' => 'Fingerprint mismatch'];
            }
        }

        if (isset($claims['iss']) && $claims['iss'] !== self::ISSUER) {
            return ['valid' => false, 'reason' => 'Invalid issuer'];
        }

        return ['valid' => true, 'reason' => null];
    }

    public static function getCreatorHashFromToken(string $token): ?string
    {
        $claims = self::decodeToken($token);
        if ($claims === null || !isset($claims['creator_hash'])) {
            return null;
        }
        return (string) $claims['creator_hash'];
    }

    public static function getFingerprintFromToken(string $token): ?string
    {
        $claims = self::decodeToken($token);
        if ($claims === null || !isset($claims['fingerprint'])) {
            return null;
        }
        return (string) $claims['fingerprint'];
    }

    private static function base64UrlDecode(string $value): ?string
    {
        $value = strtr($value, '-_', '+/');
        $padding = strlen($value) % 4;
        if ($padding > 0) {
            $value .= str_repeat('=', 4 - $padding);
        }
        $decoded = base64_decode($value, true);
        return $decoded === false ? null : $decoded;
    }
}
