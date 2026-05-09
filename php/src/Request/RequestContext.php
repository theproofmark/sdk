<?php

declare(strict_types=1);

namespace ProofMark\ShowAd\Request;

/**
 * Framework-agnostic snapshot of an incoming HTTP request.
 *
 * The SDK never touches superglobals or PSR-7 directly inside the verifier;
 * adapters are responsible for normalising the inbound request into this
 * value object. Header names are stored case-insensitively (lowercased keys)
 * and cookie values are kept as plain strings.
 */
final class RequestContext
{
    public string $method;
    public string $path;
    /** @var array<string, mixed> */
    public array $query;
    /** @var array<string, string|array<int, string>> Lowercased header name => value (string or array for multi-value). */
    public array $headers;
    /** @var array<string, string> */
    public array $cookies;
    public string $ip;
    public string $fullUrl;
    public string $scheme;
    public string $host;

    /**
     * @param array<string, mixed> $query
     * @param array<string, string|array<int, string>> $headers Header name => value (case-insensitive; will be lowercased)
     * @param array<string, string> $cookies
     */
    public function __construct(
        string $method,
        string $path,
        array $query,
        array $headers,
        array $cookies,
        string $ip,
        string $fullUrl,
        string $scheme = 'https',
        string $host = ''
    ) {
        $this->method = strtoupper($method);
        $this->path = '/' . ltrim($path, '/');
        $this->query = $query;
        $this->headers = self::lowerHeaders($headers);
        $this->cookies = $cookies;
        $this->ip = $ip;
        $this->fullUrl = $fullUrl;
        $this->scheme = $scheme;
        $this->host = $host;
    }

    public function header(string $name, ?string $default = null): ?string
    {
        $key = strtolower($name);
        if (!isset($this->headers[$key])) {
            return $default;
        }
        $value = $this->headers[$key];
        if (is_array($value)) {
            return $value[0] ?? $default;
        }
        return (string) $value;
    }

    public function cookie(string $name, ?string $default = null): ?string
    {
        return $this->cookies[$name] ?? $default;
    }

    public function query(string $key, ?string $default = null): ?string
    {
        if (!array_key_exists($key, $this->query)) {
            return $default;
        }
        $value = $this->query[$key];
        if (is_array($value)) {
            $value = reset($value);
        }
        return $value === null ? $default : (string) $value;
    }

    public function userAgent(): string
    {
        return (string) $this->header('user-agent', '');
    }

    public function isHttps(): bool
    {
        return $this->scheme === 'https';
    }

    /**
     * @param array<string, string|array<int, string>> $headers
     * @return array<string, string|array<int, string>>
     */
    private static function lowerHeaders(array $headers): array
    {
        $out = [];
        foreach ($headers as $name => $value) {
            $out[strtolower((string) $name)] = $value;
        }
        return $out;
    }
}
