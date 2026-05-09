<?php

declare(strict_types=1);

namespace ProofMark\ShowAd\Request\Adapter;

use ProofMark\ShowAd\Request\RequestContext;

/**
 * Builds a RequestContext from a Symfony HttpFoundation Request.
 *
 * Symfony is treated as a soft dependency. We only require an object that
 * exposes the well-known Symfony Request shape, which makes this adapter
 * usable from Symfony, Laravel, and any other framework whose request
 * extends \Symfony\Component\HttpFoundation\Request.
 */
final class SymfonyAdapter
{
    /**
     * @param object $request \Symfony\Component\HttpFoundation\Request (or compatible)
     */
    public static function fromRequest(object $request): RequestContext
    {
        if (!isset($request->headers, $request->cookies, $request->query, $request->server)) {
            throw new \InvalidArgumentException(
                'Request does not look like a Symfony HttpFoundation Request'
            );
        }

        $method = method_exists($request, 'getMethod') ? (string) $request->getMethod() : 'GET';
        $path = method_exists($request, 'getPathInfo') ? (string) $request->getPathInfo() : '/';

        $query = [];
        if (method_exists($request->query, 'all')) {
            $query = $request->query->all();
        }

        $headers = [];
        if (method_exists($request->headers, 'all')) {
            foreach ($request->headers->all() as $name => $values) {
                $headers[strtolower((string) $name)] = is_array($values)
                    ? implode(', ', array_map('strval', $values))
                    : (string) $values;
            }
        }

        $cookies = [];
        if (method_exists($request->cookies, 'all')) {
            foreach ($request->cookies->all() as $name => $value) {
                if (is_scalar($value)) {
                    $cookies[(string) $name] = (string) $value;
                }
            }
        }

        $ip = method_exists($request, 'getClientIp')
            ? (string) ($request->getClientIp() ?? '')
            : '';

        $fullUrl = method_exists($request, 'getUri') ? (string) $request->getUri() : '';
        $scheme = method_exists($request, 'getScheme') ? (string) $request->getScheme() : 'https';
        $host = method_exists($request, 'getHost') ? (string) $request->getHost() : '';

        return new RequestContext(
            $method,
            $path,
            is_array($query) ? $query : [],
            $headers,
            $cookies,
            $ip,
            $fullUrl,
            $scheme === '' ? 'https' : $scheme,
            $host
        );
    }
}
