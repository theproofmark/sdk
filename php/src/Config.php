<?php

declare(strict_types=1);

namespace ProofMark\ShowAd;

/**
 * Immutable configuration container for the ShowAd SDK.
 *
 * The container intentionally avoids any framework coupling: it accepts a
 * plain array, exposes a dot-notation accessor, and provides a small helper
 * to hydrate from environment variables for plain-PHP deployments.
 */
final class Config
{
    public const DEFAULT_API_BASE_URL = 'https://ad.proofmark.io';
    public const DEFAULT_VIDEO_AD_URL = 'https://showad.proofmark.io';
    public const DEFAULT_COOKIE_PREFIX = 'showad';
    public const DEFAULT_COOKIE_MAX_AGE = 3600;
    public const DEFAULT_COOKIE_SAME_SITE = 'lax';
    public const DEFAULT_HTTP_TIMEOUT = 10;
    public const DEFAULT_HTTP_CONNECT_TIMEOUT = 5;

    /** @var array<string, mixed> */
    private array $values;

    /**
     * @param array<string, mixed> $values
     */
    public function __construct(array $values)
    {
        $this->values = self::mergeDefaults($values);
        $this->assertRequired();
    }

    /**
     * Build a Config from environment variables. Useful for plain-PHP and CGI
     * deployments. Reads SHOWAD_* keys, falling back to the supplied overrides.
     *
     * @param array<string, mixed> $overrides
     */
    public static function fromEnv(array $overrides = []): self
    {
        $env = static function (string $key, $default = null) {
            $value = getenv($key);
            if ($value === false || $value === '') {
                return $default;
            }
            return $value;
        };

        $values = array_replace_recursive([
            'creator_hash' => $env('SHOWAD_CREATOR_HASH'),
            'api_key' => $env('SHOWAD_API_KEY'),
            'redirect_secret' => $env('SHOWAD_REDIRECT_SECRET'),
            'api_base_url' => $env('SHOWAD_API_BASE_URL', self::DEFAULT_API_BASE_URL),
            'video_ad_url' => $env('SHOWAD_VIDEO_AD_URL', self::DEFAULT_VIDEO_AD_URL),
            'debug' => filter_var($env('SHOWAD_DEBUG', false), FILTER_VALIDATE_BOOLEAN),
            'cookie' => [
                'prefix' => $env('SHOWAD_COOKIE_PREFIX', self::DEFAULT_COOKIE_PREFIX),
                'max_age' => (int) $env('SHOWAD_COOKIE_MAX_AGE', self::DEFAULT_COOKIE_MAX_AGE),
                'secure' => $env('SHOWAD_COOKIE_SECURE') !== null
                    ? filter_var($env('SHOWAD_COOKIE_SECURE'), FILTER_VALIDATE_BOOLEAN)
                    : null,
                'same_site' => $env('SHOWAD_COOKIE_SAMESITE', self::DEFAULT_COOKIE_SAME_SITE),
            ],
        ], $overrides);

        return new self($values);
    }

    /**
     * Returns a value from the config using dot notation.
     *
     * @return mixed
     */
    public function get(string $key, $default = null)
    {
        if (array_key_exists($key, $this->values)) {
            return $this->values[$key];
        }

        $cursor = $this->values;
        foreach (explode('.', $key) as $segment) {
            if (!is_array($cursor) || !array_key_exists($segment, $cursor)) {
                return $default;
            }
            $cursor = $cursor[$segment];
        }

        return $cursor;
    }

    /**
     * @return array<string, mixed>
     */
    public function all(): array
    {
        return $this->values;
    }

    public function creatorHash(): string
    {
        return (string) $this->get('creator_hash', '');
    }

    public function apiKey(): string
    {
        return (string) $this->get('api_key', '');
    }

    public function redirectSecret(): string
    {
        return (string) $this->get('redirect_secret', '');
    }

    public function apiBaseUrl(): string
    {
        return rtrim((string) $this->get('api_base_url', self::DEFAULT_API_BASE_URL), '/');
    }

    public function videoAdUrl(): string
    {
        return rtrim((string) $this->get('video_ad_url', self::DEFAULT_VIDEO_AD_URL), '/');
    }

    public function cookiePrefix(): string
    {
        return (string) $this->get('cookie.prefix', self::DEFAULT_COOKIE_PREFIX);
    }

    public function cookieMaxAge(): int
    {
        return (int) $this->get('cookie.max_age', self::DEFAULT_COOKIE_MAX_AGE);
    }

    public function cookieSameSite(): string
    {
        return (string) $this->get('cookie.same_site', self::DEFAULT_COOKIE_SAME_SITE);
    }

    public function cookieSecure(): ?bool
    {
        $value = $this->get('cookie.secure');
        if ($value === null) {
            return null;
        }
        return (bool) $value;
    }

    public function debug(): bool
    {
        return (bool) $this->get('debug', false);
    }

    /**
     * @return array<int, string>
     */
    public function excludedPaths(): array
    {
        $value = $this->get('excluded_paths', []);
        return is_array($value) ? array_values(array_map('strval', $value)) : [];
    }

    /**
     * @return array<int, string>
     */
    public function protectedPaths(): array
    {
        $value = $this->get('protected_paths', []);
        return is_array($value) ? array_values(array_map('strval', $value)) : [];
    }

    /**
     * @return array<string, mixed>
     */
    public function accessPolicy(): array
    {
        $value = $this->get('access_policy', []);
        return is_array($value) ? $value : [];
    }

    public function httpTimeout(): int
    {
        return (int) $this->get('http.timeout', self::DEFAULT_HTTP_TIMEOUT);
    }

    public function httpConnectTimeout(): int
    {
        return (int) $this->get('http.connect_timeout', self::DEFAULT_HTTP_CONNECT_TIMEOUT);
    }

    /**
     * Returns a new Config with $overrides merged on top.
     *
     * @param array<string, mixed> $overrides
     */
    public function with(array $overrides): self
    {
        return new self(array_replace_recursive($this->values, $overrides));
    }

    /**
     * @param array<string, mixed> $values
     * @return array<string, mixed>
     */
    private static function mergeDefaults(array $values): array
    {
        $defaults = [
            'creator_hash' => null,
            'api_key' => null,
            'redirect_secret' => null,
            'api_base_url' => self::DEFAULT_API_BASE_URL,
            'video_ad_url' => self::DEFAULT_VIDEO_AD_URL,
            'debug' => false,
            'excluded_paths' => [],
            'protected_paths' => [],
            'access_policy' => [],
            'cookie' => [
                'prefix' => self::DEFAULT_COOKIE_PREFIX,
                'max_age' => self::DEFAULT_COOKIE_MAX_AGE,
                'secure' => null,
                'same_site' => self::DEFAULT_COOKIE_SAME_SITE,
            ],
            'http' => [
                'timeout' => self::DEFAULT_HTTP_TIMEOUT,
                'connect_timeout' => self::DEFAULT_HTTP_CONNECT_TIMEOUT,
            ],
        ];

        return array_replace_recursive($defaults, $values);
    }

    private function assertRequired(): void
    {
        // creator_hash is the only universally required value at construction
        // time. api_key and redirect_secret are only required when the SDK
        // performs network operations; they are validated lazily.
        if ($this->creatorHash() === '') {
            throw new ShowAdException(
                'Missing required ShowAd configuration: creator_hash',
                ShowAdException::CONFIG_ERROR,
                null,
                ['key' => 'creator_hash']
            );
        }
    }
}
