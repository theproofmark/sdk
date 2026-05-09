<?php

declare(strict_types=1);

namespace ProofMark\ShowAd\Cookies;

use ProofMark\ShowAd\Config;
use ProofMark\ShowAd\Jwt\JwtHelper;

/**
 * Builds Set-Cookie headers for the ShowAd verification cookies.
 *
 * Produces both:
 *   - "applied" tuples (name, value, options) suitable for setcookie() and
 *     for translating into framework-specific Cookie objects, and
 *   - encoded Set-Cookie header lines for PSR-7/PSR-15 responses.
 */
final class CookieJar
{
    public const COOKIE_FINGERPRINT = 'fingerprint';
    public const COOKIE_TOKEN = 'token';
    public const COOKIE_CREATOR = 'creator';
    public const COOKIE_TICKET = 'ticket';
    public const COOKIE_VERIFIED = 'verified';
    public const COOKIE_EXPIRES = 'expires';

    private Config $config;

    public function __construct(Config $config)
    {
        $this->config = $config;
    }

    public function name(string $suffix): string
    {
        return $this->config->cookiePrefix() . '_' . $suffix;
    }

    /**
     * Build verification cookies for a successful claim or token refresh.
     *
     * @param array<string, mixed> $data    Expected keys: token, creator_hash, ticket_id
     * @param bool|null $isHttps            When null, falls back to $_SERVER detection.
     * @return array<int, array{name:string,value:string,options:array<string,mixed>}>
     */
    public function buildVerificationCookies(array $data, ?bool $isHttps = null): array
    {
        $maxAge = $this->config->cookieMaxAge();
        $secure = $this->resolveSecure($isHttps);
        $sameSite = $this->config->cookieSameSite();
        $expires = time() + $maxAge;

        $cookies = [];

        if (!empty($data['token'])) {
            $cookies[] = $this->makeCookie(
                $this->name(self::COOKIE_TOKEN),
                (string) $data['token'],
                $expires,
                true,
                $secure,
                $sameSite
            );

            $cookies[] = $this->makeCookie(
                $this->name(self::COOKIE_VERIFIED),
                '1',
                $expires,
                false,
                $secure,
                $sameSite
            );
        }

        if (!empty($data['creator_hash'])) {
            $cookies[] = $this->makeCookie(
                $this->name(self::COOKIE_CREATOR),
                (string) $data['creator_hash'],
                $expires,
                false,
                $secure,
                $sameSite
            );
        }

        if (!empty($data['ticket_id'])) {
            $cookies[] = $this->makeCookie(
                $this->name(self::COOKIE_TICKET),
                (string) $data['ticket_id'],
                $expires,
                false,
                $secure,
                $sameSite
            );
        }

        if (!empty($data['token'])) {
            $expiry = JwtHelper::getTokenExpiry((string) $data['token']);
            if ($expiry !== null) {
                $cookies[] = $this->makeCookie(
                    $this->name(self::COOKIE_EXPIRES),
                    (string) $expiry,
                    $expires,
                    false,
                    $secure,
                    $sameSite
                );
            }
        }

        return $cookies;
    }

    /**
     * Build cookies that clear all ShowAd verification state.
     *
     * @return array<int, array{name:string,value:string,options:array<string,mixed>}>
     */
    public function buildClearCookies(?bool $isHttps = null): array
    {
        $secure = $this->resolveSecure($isHttps);
        $sameSite = $this->config->cookieSameSite();
        $expires = time() - 3600;

        $cookies = [];
        foreach ([
            self::COOKIE_TOKEN => true,
            self::COOKIE_VERIFIED => false,
            self::COOKIE_CREATOR => false,
            self::COOKIE_TICKET => false,
            self::COOKIE_EXPIRES => false,
        ] as $suffix => $httpOnly) {
            $cookies[] = $this->makeCookie(
                $this->name($suffix),
                '',
                $expires,
                $httpOnly,
                $secure,
                $sameSite
            );
        }

        return $cookies;
    }

    /**
     * Encode an SDK cookie tuple as a Set-Cookie header value.
     *
     * @param array{name:string,value:string,options:array<string,mixed>} $cookie
     */
    public static function toSetCookieHeader(array $cookie): string
    {
        $parts = [$cookie['name'] . '=' . rawurlencode($cookie['value'])];
        $options = $cookie['options'];

        if (isset($options['expires']) && $options['expires'] > 0) {
            $parts[] = 'Expires=' . gmdate('D, d-M-Y H:i:s', (int) $options['expires']) . ' GMT';
        }
        if (isset($options['max-age'])) {
            $parts[] = 'Max-Age=' . (int) $options['max-age'];
        }
        if (!empty($options['path'])) {
            $parts[] = 'Path=' . $options['path'];
        }
        if (!empty($options['domain'])) {
            $parts[] = 'Domain=' . $options['domain'];
        }
        if (!empty($options['secure'])) {
            $parts[] = 'Secure';
        }
        if (!empty($options['httponly'])) {
            $parts[] = 'HttpOnly';
        }
        if (!empty($options['samesite'])) {
            $parts[] = 'SameSite=' . $options['samesite'];
        }
        return implode('; ', $parts);
    }

    /**
     * Apply a list of cookies to the running PHP request via setcookie().
     *
     * Useful for plain-PHP integrations that just want a one-line apply.
     *
     * @param array<int, array{name:string,value:string,options:array<string,mixed>}> $cookies
     */
    public static function applyToGlobals(array $cookies): void
    {
        foreach ($cookies as $cookie) {
            $options = $cookie['options'];
            $opts = [
                'expires' => isset($options['expires']) ? (int) $options['expires'] : 0,
                'path' => $options['path'] ?? '/',
                'secure' => !empty($options['secure']),
                'httponly' => !empty($options['httponly']),
                'samesite' => $options['samesite'] ?? 'Lax',
            ];
            if (!empty($options['domain'])) {
                $opts['domain'] = $options['domain'];
            }
            // setcookie raw value preserved; PHP handles its own encoding via
            // setcookie name=value semantics. We mirror Laravel/Symfony output.
            setcookie($cookie['name'], $cookie['value'], $opts);
        }
    }

    /**
     * @return array{name:string,value:string,options:array<string,mixed>}
     */
    private function makeCookie(string $name, string $value, int $expires, bool $httpOnly, bool $secure, string $sameSite): array
    {
        return [
            'name' => $name,
            'value' => $value,
            'options' => [
                'expires' => $expires,
                'max-age' => max(0, $expires - time()),
                'path' => '/',
                'domain' => null,
                'secure' => $secure,
                'httponly' => $httpOnly,
                'samesite' => self::canonicaliseSameSite($sameSite),
            ],
        ];
    }

    private function resolveSecure(?bool $isHttps): bool
    {
        $configured = $this->config->cookieSecure();
        if ($configured !== null) {
            return $configured;
        }
        if ($isHttps !== null) {
            return $isHttps;
        }
        return isset($_SERVER['HTTPS']) && is_string($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    }

    private static function canonicaliseSameSite(string $value): string
    {
        $normalised = strtolower($value);
        switch ($normalised) {
            case 'strict':
                return 'Strict';
            case 'none':
                return 'None';
            case 'lax':
            default:
                return 'Lax';
        }
    }
}
