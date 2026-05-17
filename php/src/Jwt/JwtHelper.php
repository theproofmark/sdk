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
 *
 * Defense-in-depth: rejects tokens whose header `alg` is `none` or outside the
 * HS256/HS384/HS512/RS256/RS384/RS512/ES256/ES384 whitelist.
 */
final class JwtHelper
{
    public const ISSUER = 'showad-backend';

    /** Tokens signed with these algorithms are accepted for local inspection. */
    public const ALLOWED_ALGORITHMS = [
        'HS256', 'HS384', 'HS512',
        'RS256', 'RS384', 'RS512',
        'ES256', 'ES384',
    ];

    public const DEFAULT_LEEWAY_SECONDS = 60;

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

        $headerJson = self::base64UrlDecode($parts[0]);
        if ($headerJson === null) {
            return null;
        }
        $header = json_decode($headerJson, true);
        if (!is_array($header) || !isset($header['alg']) || !is_string($header['alg'])) {
            return null;
        }
        if (!in_array($header['alg'], self::ALLOWED_ALGORITHMS, true)) {
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

    public static function isTokenExpired(string $token, ?int $now = null, int $leewaySeconds = self::DEFAULT_LEEWAY_SECONDS): bool
    {
        $claims = self::decodeToken($token);
        if ($claims === null) {
            return true;
        }

        $now = $now ?? time();

        if (isset($claims['exp']) && is_numeric($claims['exp']) && ((int) $claims['exp'] + $leewaySeconds) < $now) {
            return true;
        }

        if (isset($claims['nbf']) && is_numeric($claims['nbf']) && ((int) $claims['nbf'] - $leewaySeconds) > $now) {
            return true;
        }

        if (isset($claims['iat']) && is_numeric($claims['iat']) && ((int) $claims['iat'] - $leewaySeconds) > $now) {
            return true;
        }

        return false;
    }

    /**
     * Returns the token expiry as Unix seconds (matches JWT `exp` claim).
     */
    public static function getTokenExpiry(string $token): ?int
    {
        $claims = self::decodeToken($token);
        if ($claims === null || !isset($claims['exp']) || !is_numeric($claims['exp'])) {
            return null;
        }

        return (int) $claims['exp'];
    }

    public static function getTimeUntilExpiry(string $token, ?int $now = null): int
    {
        $expiry = self::getTokenExpiry($token);
        if ($expiry === null) {
            return -1;
        }

        $now = $now ?? time();
        return $expiry - $now;
    }

    /**
     * Validate the locally-checkable claims of a token.
     *
     * @param array{leeway_seconds?: int, require_issuer?: bool} $options
     * @return array{valid: bool, reason: ?string}
     */
    public static function validateTokenClaims(
        string $token,
        string $expectedCreatorHash,
        ?string $expectedFingerprint = null,
        array $options = []
    ): array {
        $leeway = isset($options['leeway_seconds']) ? (int) $options['leeway_seconds'] : self::DEFAULT_LEEWAY_SECONDS;
        $requireIssuer = array_key_exists('require_issuer', $options) ? (bool) $options['require_issuer'] : true;

        $claims = self::decodeToken($token);
        if ($claims === null) {
            return ['valid' => false, 'reason' => 'Invalid token format'];
        }

        if (self::isTokenExpired($token, null, $leeway)) {
            return ['valid' => false, 'reason' => 'Token expired'];
        }

        if (!isset($claims['creator_hash']) || !is_string($claims['creator_hash'])
            || !hash_equals((string) $claims['creator_hash'], $expectedCreatorHash)) {
            return ['valid' => false, 'reason' => 'Creator hash mismatch'];
        }

        if ($expectedFingerprint !== null) {
            if (!isset($claims['fingerprint']) || !is_string($claims['fingerprint'])
                || !hash_equals((string) $claims['fingerprint'], $expectedFingerprint)) {
                return ['valid' => false, 'reason' => 'Fingerprint mismatch'];
            }
        }

        if ($requireIssuer) {
            if (!isset($claims['iss']) || $claims['iss'] !== self::ISSUER) {
                return ['valid' => false, 'reason' => 'Invalid issuer'];
            }
        } elseif (isset($claims['iss']) && $claims['iss'] !== self::ISSUER) {
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
