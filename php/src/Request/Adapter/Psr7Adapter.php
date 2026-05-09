<?php

declare(strict_types=1);

namespace ProofMark\ShowAd\Request\Adapter;

use ProofMark\ShowAd\Request\RequestContext;

/**
 * Builds a RequestContext from a PSR-7 ServerRequestInterface.
 *
 * The PSR-7 interfaces are a soft dependency: they are only declared in
 * require-dev / suggest. We avoid importing the interface at compile time
 * so the SDK keeps loading even when psr/http-message is not installed.
 */
final class Psr7Adapter
{
    /**
     * @param object $request A psr/http-message ServerRequestInterface
     */
    public static function fromRequest(object $request): RequestContext
    {
        if (!method_exists($request, 'getUri') || !method_exists($request, 'getMethod')) {
            throw new \InvalidArgumentException('Request does not implement Psr\\Http\\Message\\ServerRequestInterface');
        }

        $uri = $request->getUri();
        $path = method_exists($uri, 'getPath') ? (string) $uri->getPath() : '/';
        $scheme = method_exists($uri, 'getScheme') ? (string) $uri->getScheme() : 'https';
        $host = method_exists($uri, 'getHost') ? (string) $uri->getHost() : '';
        $port = method_exists($uri, 'getPort') ? $uri->getPort() : null;

        $queryString = method_exists($uri, 'getQuery') ? (string) $uri->getQuery() : '';
        $query = [];
        if ($queryString !== '') {
            parse_str($queryString, $query);
        } elseif (method_exists($request, 'getQueryParams')) {
            $query = $request->getQueryParams();
        }

        $headers = [];
        if (method_exists($request, 'getHeaders')) {
            foreach ($request->getHeaders() as $name => $values) {
                $headers[strtolower((string) $name)] = is_array($values)
                    ? implode(', ', array_map('strval', $values))
                    : (string) $values;
            }
        }

        $cookies = method_exists($request, 'getCookieParams') ? $request->getCookieParams() : [];
        $cookies = array_filter($cookies, 'is_scalar');
        $cookieMap = [];
        foreach ($cookies as $name => $value) {
            $cookieMap[(string) $name] = (string) $value;
        }

        $serverParams = method_exists($request, 'getServerParams') ? $request->getServerParams() : [];
        $ip = isset($serverParams['REMOTE_ADDR']) ? (string) $serverParams['REMOTE_ADDR'] : '';

        $hostWithPort = $host;
        if ($port !== null) {
            $isStandard = ($scheme === 'http' && $port === 80) || ($scheme === 'https' && $port === 443);
            if (!$isStandard) {
                $hostWithPort = $host . ':' . $port;
            }
        }

        $fullUrl = ($scheme !== '' ? $scheme . '://' : '')
            . $hostWithPort
            . ($path === '' ? '/' : $path)
            . ($queryString !== '' ? '?' . $queryString : '');

        return new RequestContext(
            $request->getMethod(),
            $path,
            is_array($query) ? $query : [],
            $headers,
            $cookieMap,
            $ip,
            $fullUrl,
            $scheme === '' ? 'https' : $scheme,
            $host
        );
    }
}
