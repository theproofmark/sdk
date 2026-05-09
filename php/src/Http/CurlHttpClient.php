<?php

declare(strict_types=1);

namespace ProofMark\ShowAd\Http;

/**
 * Default cURL-based HttpClient.
 *
 * Uses no third-party dependencies and works on every supported PHP runtime
 * that ships with ext-curl (which is effectively all of them).
 */
final class CurlHttpClient implements HttpClient
{
    private int $timeout;
    private int $connectTimeout;
    private string $userAgent;

    public function __construct(int $timeout = 10, int $connectTimeout = 5, string $userAgent = 'ProofMark-ShowAd-PHP/1.0')
    {
        $this->timeout = $timeout;
        $this->connectTimeout = $connectTimeout;
        $this->userAgent = $userAgent;
    }

    public function post(string $url, array $headers, string $body): HttpResponse
    {
        return $this->execute('POST', $url, $headers, $body);
    }

    public function get(string $url, array $headers = []): HttpResponse
    {
        return $this->execute('GET', $url, $headers, null);
    }

    /**
     * @param array<string, string> $headers
     */
    private function execute(string $method, string $url, array $headers, ?string $body): HttpResponse
    {
        if (!function_exists('curl_init')) {
            throw new HttpClientException('ext-curl is required for the default HttpClient');
        }

        $ch = curl_init();
        if ($ch === false) {
            throw new HttpClientException('Failed to initialise cURL handle');
        }

        $headerLines = [];
        foreach ($headers as $name => $value) {
            $headerLines[] = $name . ': ' . $value;
        }

        $responseHeaders = [];

        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_CONNECTTIMEOUT => $this->connectTimeout,
            CURLOPT_USERAGENT => $this->userAgent,
            CURLOPT_HTTPHEADER => $headerLines,
            CURLOPT_HEADERFUNCTION => static function ($curl, $headerLine) use (&$responseHeaders) {
                $length = strlen($headerLine);
                $colon = strpos($headerLine, ':');
                if ($colon !== false) {
                    $name = strtolower(trim(substr($headerLine, 0, $colon)));
                    $value = trim(substr($headerLine, $colon + 1));
                    if ($name !== '') {
                        $responseHeaders[$name] = $value;
                    }
                }
                return $length;
            },
        ]);

        if ($method === 'POST' && $body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }

        $rawBody = curl_exec($ch);
        if ($rawBody === false) {
            $error = curl_error($ch) ?: 'unknown cURL error';
            $errno = curl_errno($ch);
            curl_close($ch);
            throw new HttpClientException("HTTP transport error ({$errno}): {$error}");
        }

        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        return new HttpResponse($status, (string) $rawBody, $responseHeaders);
    }
}
