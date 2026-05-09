<?php

namespace ProofMark\ShowAd\Tests;

use PHPUnit\Framework\TestCase;
use ProofMark\ShowAd\ShowAdException;

class ShowAdExceptionTest extends TestCase
{
    public function testExceptionCodes()
    {
        $e = new ShowAdException('Test error', ShowAdException::TICKET_NOT_FOUND);
        $this->assertEquals(ShowAdException::TICKET_NOT_FOUND, $e->getCode());
        $this->assertEquals('TICKET_NOT_FOUND', $e->getErrorName());
        $this->assertEquals('Test error', $e->getMessage());
    }

    public function testExceptionDetails()
    {
        $e = new ShowAdException('Error', ShowAdException::NETWORK_ERROR, null, ['url' => 'https://example.com']);
        $this->assertEquals(['url' => 'https://example.com'], $e->getDetails());
    }

    public function testAllErrorCodes()
    {
        $codes = [
            ShowAdException::FINGERPRINT_FAILED => 'FINGERPRINT_FAILED',
            ShowAdException::TICKET_NOT_FOUND => 'TICKET_NOT_FOUND',
            ShowAdException::TICKET_EXPIRED => 'TICKET_EXPIRED',
            ShowAdException::TICKET_CLAIM_FAILED => 'TICKET_CLAIM_FAILED',
            ShowAdException::TOKEN_INVALID => 'TOKEN_INVALID',
            ShowAdException::TOKEN_EXPIRED => 'TOKEN_EXPIRED',
            ShowAdException::CREATOR_MISMATCH => 'CREATOR_MISMATCH',
            ShowAdException::NETWORK_ERROR => 'NETWORK_ERROR',
            ShowAdException::CONFIG_ERROR => 'CONFIG_ERROR',
        ];

        foreach ($codes as $code => $name) {
            $e = new ShowAdException('Test', $code);
            $this->assertEquals($name, $e->getErrorName(), "Error name for code {$code}");
        }
    }

    public function testUnknownErrorCode()
    {
        $e = new ShowAdException('Test', 9999);
        $this->assertEquals('UNKNOWN_ERROR', $e->getErrorName());
    }
}
