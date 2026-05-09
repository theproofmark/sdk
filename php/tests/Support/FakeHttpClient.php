<?php

declare(strict_types=1);

namespace ProofMark\ShowAd\Tests\Support;

use ProofMark\ShowAd\Http\HttpClient;
use ProofMark\ShowAd\Http\HttpClientException;
use ProofMark\ShowAd\Http\HttpResponse;

/**
 * Deterministic HttpClient fake used in tests.
 *
 * Tests register a stack of canned responses; the fake records every call so
 * assertions can verify URL, headers, and bodies. Throwing scenarios are
 * modelled by pushing an HttpClientException onto the stack.
 */
final class FakeHttpClient implements HttpClient
{
    /** @var array<int, HttpResponse|HttpClientException> */
    private array $responses = [];
    /** @var array<int, array{method:string,url:string,headers:array<string,string>,body:?string}> */
    public array $calls = [];

    public function pushResponse(HttpResponse $response): void
    {
        $this->responses[] = $response;
    }

    public function pushFailure(HttpClientException $e): void
    {
        $this->responses[] = $e;
    }

    public function pushJson(int $status, array $payload): void
    {
        $this->pushResponse(new HttpResponse($status, (string) json_encode($payload)));
    }

    public function post(string $url, array $headers, string $body): HttpResponse
    {
        return $this->next('POST', $url, $headers, $body);
    }

    public function get(string $url, array $headers = []): HttpResponse
    {
        return $this->next('GET', $url, $headers, null);
    }

    /**
     * @param array<string, string> $headers
     */
    private function next(string $method, string $url, array $headers, ?string $body): HttpResponse
    {
        $this->calls[] = [
            'method' => $method,
            'url' => $url,
            'headers' => $headers,
            'body' => $body,
        ];
        if (empty($this->responses)) {
            throw new HttpClientException('No fake response queued for ' . $method . ' ' . $url);
        }
        $next = array_shift($this->responses);
        if ($next instanceof HttpClientException) {
            throw $next;
        }
        return $next;
    }
}
