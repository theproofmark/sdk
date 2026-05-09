<?php

declare(strict_types=1);

namespace ProofMark\ShowAd\Http;

/**
 * Tiny HTTP client abstraction the SDK uses to talk to the ShowAd backend.
 *
 * Implementations MUST NOT throw on non-2xx status codes; instead they return
 * an HttpResponse so callers can handle 401/403/410 explicitly. Network-level
 * failures (DNS, TLS, timeout) MUST be surfaced as HttpClientException.
 */
interface HttpClient
{
    /**
     * @param array<string, string> $headers Header name => value
     * @throws HttpClientException on transport errors
     */
    public function post(string $url, array $headers, string $body): HttpResponse;

    /**
     * @param array<string, string> $headers
     * @throws HttpClientException on transport errors
     */
    public function get(string $url, array $headers = []): HttpResponse;
}
