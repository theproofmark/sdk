<?php

declare(strict_types=1);

namespace ProofMark\ShowAd\Http;

/**
 * Minimal value object describing an HTTP response.
 */
final class HttpResponse
{
    public int $status;
    public string $body;
    /** @var array<string, string> */
    public array $headers;

    /**
     * @param array<string, string> $headers
     */
    public function __construct(int $status, string $body, array $headers = [])
    {
        $this->status = $status;
        $this->body = $body;
        $this->headers = $headers;
    }

    public function isSuccess(): bool
    {
        return $this->status >= 200 && $this->status < 300;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function json(): ?array
    {
        $decoded = json_decode($this->body, true);
        return is_array($decoded) ? $decoded : null;
    }
}
