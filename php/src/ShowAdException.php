<?php

declare(strict_types=1);

namespace ProofMark\ShowAd;

use Exception;
use Throwable;

/**
 * Domain-specific exception thrown by the ShowAd SDK.
 *
 * Codes mirror the Laravel SDK so downstream tooling and logs share a
 * consistent vocabulary across language bindings.
 */
class ShowAdException extends Exception
{
    public const FINGERPRINT_FAILED = 1001;
    public const TICKET_NOT_FOUND = 1002;
    public const TICKET_EXPIRED = 1003;
    public const TICKET_CLAIM_FAILED = 1004;
    public const TOKEN_INVALID = 1005;
    public const TOKEN_EXPIRED = 1006;
    public const CREATOR_MISMATCH = 1007;
    public const NETWORK_ERROR = 1008;
    public const CONFIG_ERROR = 1009;

    /** @var array<string, mixed> */
    protected array $details;

    /**
     * @param array<string, mixed> $details
     */
    public function __construct(string $message = '', int $code = 0, ?Throwable $previous = null, array $details = [])
    {
        parent::__construct($message, $code, $previous);
        $this->details = $details;
    }

    /**
     * @return array<string, mixed>
     */
    public function getDetails(): array
    {
        return $this->details;
    }

    public function getErrorName(): string
    {
        $map = [
            self::FINGERPRINT_FAILED => 'FINGERPRINT_FAILED',
            self::TICKET_NOT_FOUND => 'TICKET_NOT_FOUND',
            self::TICKET_EXPIRED => 'TICKET_EXPIRED',
            self::TICKET_CLAIM_FAILED => 'TICKET_CLAIM_FAILED',
            self::TOKEN_INVALID => 'TOKEN_INVALID',
            self::TOKEN_EXPIRED => 'TOKEN_EXPIRED',
            self::CREATOR_MISMATCH => 'CREATOR_MISMATCH',
            self::NETWORK_ERROR => 'NETWORK_ERROR',
            self::CONFIG_ERROR => 'CONFIG_ERROR',
        ];

        return $map[$this->getCode()] ?? 'UNKNOWN_ERROR';
    }
}
