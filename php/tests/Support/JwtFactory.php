<?php

declare(strict_types=1);

namespace ProofMark\ShowAd\Tests\Support;

/**
 * Builds unsigned JWTs for tests.
 *
 * The SDK never verifies signatures locally; it only decodes claims, so we
 * can produce tokens without any signing key.
 */
final class JwtFactory
{
    /**
     * @param array<string, mixed> $claims
     */
    public static function make(array $claims): string
    {
        $header = self::base64UrlEncode((string) json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $payload = self::base64UrlEncode((string) json_encode($claims));
        return $header . '.' . $payload . '.signature';
    }

    private static function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
