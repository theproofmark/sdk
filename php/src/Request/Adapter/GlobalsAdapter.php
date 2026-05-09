<?php

declare(strict_types=1);

namespace ProofMark\ShowAd\Request\Adapter;

use ProofMark\ShowAd\Request\RequestContext;

/**
 * Builds a RequestContext from PHP superglobals.
 *
 * Use this in plain-PHP integrations and any framework that exposes a global
 * request (CodeIgniter, classic WordPress, custom routers, etc.).
 */
final class GlobalsAdapter
{
    /**
     * @param array<string, mixed>|null $server
     * @param array<string, mixed>|null $get
     * @param array<string, string>|null $cookie
     */
    public static function fromGlobals(?array $server = null, ?array $get = null, ?array $cookie = null): RequestContext
    {
        $server = $server ?? $_SERVER;
        $get = $get ?? $_GET;
        $cookie = $cookie ?? $_COOKIE;

        $method = isset($server['REQUEST_METHOD']) ? (string) $server['REQUEST_METHOD'] : 'GET';

        $uri = isset($server['REQUEST_URI']) ? (string) $server['REQUEST_URI'] : '/';
        $path = parse_url($uri, PHP_URL_PATH);
        if (!is_string($path) || $path === '') {
            $path = '/';
        }

        $headers = self::extractHeaders($server);

        $scheme = self::resolveScheme($server);
        $host = self::resolveHost($server);
        $port = isset($server['SERVER_PORT']) ? (int) $server['SERVER_PORT'] : null;

        $hostHeader = $host;
        if ($port !== null && $port !== 0) {
            $isStandardHttp = ($scheme === 'http' && $port === 80);
            $isStandardHttps = ($scheme === 'https' && $port === 443);
            if (!$isStandardHttp && !$isStandardHttps && strpos($host, ':') === false) {
                $hostHeader = $host . ':' . $port;
            }
        }

        $fullUrl = $scheme . '://' . $hostHeader . $uri;

        $ip = isset($server['REMOTE_ADDR']) ? (string) $server['REMOTE_ADDR'] : '';

        // Normalise cookies to scalar strings only.
        $cookieMap = [];
        foreach ($cookie as $name => $value) {
            if (is_scalar($value)) {
                $cookieMap[(string) $name] = (string) $value;
            }
        }

        return new RequestContext(
            $method,
            $path,
            $get,
            $headers,
            $cookieMap,
            $ip,
            $fullUrl,
            $scheme,
            $host
        );
    }

    /**
     * @param array<string, mixed> $server
     * @return array<string, string>
     */
    private static function extractHeaders(array $server): array
    {
        $headers = [];
        foreach ($server as $key => $value) {
            if (!is_string($key) || !is_scalar($value)) {
                continue;
            }
            if (strpos($key, 'HTTP_') === 0) {
                $name = strtolower(str_replace('_', '-', substr($key, 5)));
                $headers[$name] = (string) $value;
            } elseif ($key === 'CONTENT_TYPE' || $key === 'CONTENT_LENGTH') {
                $name = strtolower(str_replace('_', '-', $key));
                $headers[$name] = (string) $value;
            }
        }
        return $headers;
    }

    /**
     * @param array<string, mixed> $server
     */
    private static function resolveScheme(array $server): string
    {
        if (isset($server['HTTPS']) && is_string($server['HTTPS']) && strtolower($server['HTTPS']) !== 'off' && $server['HTTPS'] !== '') {
            return 'https';
        }
        if (isset($server['REQUEST_SCHEME']) && is_string($server['REQUEST_SCHEME']) && $server['REQUEST_SCHEME'] !== '') {
            return strtolower((string) $server['REQUEST_SCHEME']);
        }
        if (isset($server['SERVER_PORT']) && (int) $server['SERVER_PORT'] === 443) {
            return 'https';
        }
        return 'http';
    }

    /**
     * @param array<string, mixed> $server
     */
    private static function resolveHost(array $server): string
    {
        if (isset($server['HTTP_HOST']) && is_string($server['HTTP_HOST']) && $server['HTTP_HOST'] !== '') {
            $host = $server['HTTP_HOST'];
        } elseif (isset($server['SERVER_NAME']) && is_string($server['SERVER_NAME'])) {
            $host = (string) $server['SERVER_NAME'];
        } else {
            $host = 'localhost';
        }
        // Strip port if embedded so callers can reattach when needed.
        $colon = strpos($host, ':');
        if ($colon !== false) {
            $host = substr($host, 0, $colon);
        }
        return $host;
    }
}
