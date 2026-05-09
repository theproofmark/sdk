<?php

namespace ProofMark\ShowAd;

use Exception;

class ShowAdException extends Exception
{
    const FINGERPRINT_FAILED = 1001;
    const TICKET_NOT_FOUND = 1002;
    const TICKET_EXPIRED = 1003;
    const TICKET_CLAIM_FAILED = 1004;
    const TOKEN_INVALID = 1005;
    const TOKEN_EXPIRED = 1006;
    const CREATOR_MISMATCH = 1007;
    const NETWORK_ERROR = 1008;
    const CONFIG_ERROR = 1009;

    /**
     * @var array
     */
    protected $details;

    /**
     * Create a new ShowAdException instance.
     *
     * @param string $message
     * @param int $code
     * @param Exception|null $previous
     * @param array $details
     */
    public function __construct($message = '', $code = 0, $previous = null, array $details = [])
    {
        parent::__construct($message, $code, $previous);
        $this->details = $details;
    }

    /**
     * Get error details.
     *
     * @return array
     */
    public function getDetails()
    {
        return $this->details;
    }

    /**
     * Get the error code name.
     *
     * @return string
     */
    public function getErrorName()
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

        return isset($map[$this->getCode()]) ? $map[$this->getCode()] : 'UNKNOWN_ERROR';
    }
}
