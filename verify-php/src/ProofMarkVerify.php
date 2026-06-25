<?php

declare(strict_types=1);

namespace ProofMark\Verify;

class ProofMarkVerify
{
    private string $secret;
    private string $baseUrl;
    private int $timeoutMs;
    /** @var ?callable(string, array, int): array{status: int, body: string} */
    private $transport;

    /**
     * @param string $secret Your secret key (pmvs_live_…)
     * @param string $baseUrl Base URL for ProofMark Verify API
     * @param int $timeoutMs HTTP timeout in milliseconds
     * @param ?callable(string, array, int): array{status: int, body: string} $transport Custom transport for testing
     */
    public function __construct(
        string $secret,
        string $baseUrl = 'https://api.proofmark.com',
        int $timeoutMs = 5000,
        ?callable $transport = null
    ) {
        if ($secret === '') {
            throw new \InvalidArgumentException('secret cannot be empty');
        }

        $this->secret = $secret;
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->timeoutMs = $timeoutMs;
        $this->transport = $transport ?? $this->defaultCurlTransport(...);
    }

    /**
     * Verify a ProofMark Verify token.
     *
     * @param string $token The pm-verify-response token from the client
     * @param string|null $remoteip The user's IP address (recommended)
     * @return VerifyResult
     * @throws ProofMarkVerifyException On network/timeout/HTTP/JSON errors
     */
    public function verify(string $token, ?string $remoteip = null): VerifyResult
    {
        // Early return for empty token (no HTTP call)
        if ($token === '') {
            return VerifyResult::fromArray([
                'success' => false,
                'score' => 0,
                'error-codes' => ['missing-input-response']
            ]);
        }

        $fields = [
            'secret' => $this->secret,
            'response' => $token,
        ];
        if ($remoteip !== null && $remoteip !== '') {
            $fields['remoteip'] = $remoteip;
        }

        $url = $this->baseUrl . '/v1/verify/siteverify';

        try {
            $response = ($this->transport)($url, $fields, $this->timeoutMs);
        } catch (ProofMarkVerifyException $e) {
            throw $e; // Re-throw our own exceptions
        } catch (\Throwable $e) {
            throw new ProofMarkVerifyException('PMV_NETWORK_ERROR', $e->getMessage(), $e);
        }

        $status = $response['status'];
        $body = $response['body'];

        if ($status >= 400) {
            throw new ProofMarkVerifyException(
                'PMV_HTTP_ERROR',
                "siteverify returned HTTP {$status}"
            );
        }

        $decoded = json_decode($body, true);
        if (!is_array($decoded)) {
            throw new ProofMarkVerifyException(
                'PMV_INVALID_RESPONSE',
                'siteverify response is not valid JSON'
            );
        }

        return VerifyResult::fromArray($decoded);
    }

    /**
     * Default cURL-based HTTP transport.
     *
     * @param string $url
     * @param array $fields
     * @param int $timeoutMs
     * @return array{status: int, body: string}
     * @throws ProofMarkVerifyException
     */
    private function defaultCurlTransport(string $url, array $fields, int $timeoutMs): array
    {
        $ch = curl_init($url);
        if ($ch === false) {
            throw new ProofMarkVerifyException('PMV_NETWORK_ERROR', 'curl_init failed');
        }

        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query($fields),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT_MS => $timeoutMs,
            CURLOPT_CONNECTTIMEOUT_MS => $timeoutMs,
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
        ]);

        $body = curl_exec($ch);
        $errno = curl_errno($ch);
        $error = curl_error($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno !== 0) {
            $code = ($errno === CURLE_OPERATION_TIMEDOUT) ? 'PMV_TIMEOUT' : 'PMV_NETWORK_ERROR';
            throw new ProofMarkVerifyException($code, "cURL error {$errno}: {$error}");
        }

        if (!is_string($body)) {
            throw new ProofMarkVerifyException('PMV_NETWORK_ERROR', 'curl_exec returned non-string');
        }

        return [
            'status' => $httpCode,
            'body' => $body,
        ];
    }
}
