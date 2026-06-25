<?php

declare(strict_types=1);

namespace ProofMark\Verify;

class ProofMarkVerifyException extends \RuntimeException
{
    public readonly string $errorCode;

    public function __construct(
        string $errorCode,
        string $message = '',
        ?\Throwable $previous = null
    ) {
        $this->errorCode = $errorCode;
        parent::__construct($message !== '' ? $message : $errorCode, 0, $previous);
    }
}
