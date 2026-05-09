<?php

declare(strict_types=1);

namespace ProofMark\ShowAd\Middleware;

/**
 * Discriminated-union result describing what a host application should do
 * after running the SDK's middleware logic.
 *
 * Three terminal outcomes:
 *   - ALLOW          → continue handling the request as normal
 *   - REDIRECT       → emit an HTTP redirect to the supplied URL
 *   - TICKET_CLAIMED → emit an HTTP redirect to the cleaned URL after a
 *                      successful ticket claim, attaching verification cookies
 *
 * The host applies the cookies and headers however its framework requires;
 * `applyToGlobals()` provides a convenience implementation for plain PHP.
 */
final class MiddlewareResult
{
    public const TYPE_ALLOW = 'allow';
    public const TYPE_REDIRECT = 'redirect';
    public const TYPE_TICKET_CLAIMED = 'ticket_claimed';

    public string $type;
    public ?string $redirectUrl;
    public int $statusCode;
    /** @var array<int, array{name:string,value:string,options:array<string,mixed>}> */
    public array $cookies;
    /** @var array<string, string> */
    public array $headers;
    public ?string $reason;

    /**
     * @param array<int, array{name:string,value:string,options:array<string,mixed>}> $cookies
     * @param array<string, string> $headers
     */
    private function __construct(
        string $type,
        ?string $redirectUrl,
        int $statusCode,
        array $cookies,
        array $headers,
        ?string $reason
    ) {
        $this->type = $type;
        $this->redirectUrl = $redirectUrl;
        $this->statusCode = $statusCode;
        $this->cookies = $cookies;
        $this->headers = $headers;
        $this->reason = $reason;
    }

    /**
     * @param array<int, array{name:string,value:string,options:array<string,mixed>}> $cookies
     */
    public static function allow(array $cookies = [], ?string $reason = null): self
    {
        return new self(self::TYPE_ALLOW, null, 200, $cookies, [], $reason);
    }

    /**
     * @param array<int, array{name:string,value:string,options:array<string,mixed>}> $cookies
     * @param array<string, string> $headers
     */
    public static function redirect(string $url, array $cookies = [], int $statusCode = 302, array $headers = [], ?string $reason = null): self
    {
        return new self(self::TYPE_REDIRECT, $url, $statusCode, $cookies, $headers, $reason);
    }

    /**
     * @param array<int, array{name:string,value:string,options:array<string,mixed>}> $cookies
     */
    public static function ticketClaimed(string $cleanUrl, array $cookies, ?string $reason = null): self
    {
        return new self(self::TYPE_TICKET_CLAIMED, $cleanUrl, 302, $cookies, [], $reason);
    }

    public function isAllow(): bool
    {
        return $this->type === self::TYPE_ALLOW;
    }

    public function isRedirect(): bool
    {
        return $this->type === self::TYPE_REDIRECT || $this->type === self::TYPE_TICKET_CLAIMED;
    }

    /**
     * Convenience helper for plain-PHP integrations: emit redirect headers
     * and cookies, then halt the script. Skips when a redirect URL is absent.
     */
    public function applyToGlobals(): void
    {
        \ProofMark\ShowAd\Cookies\CookieJar::applyToGlobals($this->cookies);

        foreach ($this->headers as $name => $value) {
            header($name . ': ' . $value, true);
        }

        if ($this->isRedirect() && $this->redirectUrl !== null) {
            header('Location: ' . $this->redirectUrl, true, $this->statusCode);
        }
    }
}
