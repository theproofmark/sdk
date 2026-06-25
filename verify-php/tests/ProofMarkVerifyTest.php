<?php

declare(strict_types=1);

namespace ProofMark\Verify\Tests;

use PHPUnit\Framework\TestCase;
use ProofMark\Verify\ProofMarkVerify;
use ProofMark\Verify\ProofMarkVerifyException;
use ProofMark\Verify\VerifyResult;

class ProofMarkVerifyTest extends TestCase
{
    public function testEmptyTokenReturnsFailureWithoutHttpCall(): void
    {
        $transportCalled = false;
        $transport = function (string $url, array $fields, int $timeoutMs) use (&$transportCalled): array {
            $transportCalled = true;
            return ['status' => 200, 'body' => '{}'];
        };

        $client = new ProofMarkVerify('test-secret', 'https://api.proofmark.com', 5000, $transport);
        $result = $client->verify('');

        $this->assertFalse($transportCalled, 'Transport should not be called for empty token');
        $this->assertFalse($result->success);
        $this->assertEquals(0.0, $result->score);
        $this->assertEquals(['missing-input-response'], $result->errorCodes);
    }

    public function testSuccessfulVerification(): void
    {
        $transport = function (string $url, array $fields, int $timeoutMs): array {
            return [
                'status' => 200,
                'body' => json_encode([
                    'success' => true,
                    'score' => 0.9,
                    'flags' => [],
                    'credit' => true,
                    'challenge_ts' => '2026-06-25T12:00:00Z',
                    'hostname' => 'example.com',
                    'action' => 'signup'
                ])
            ];
        };

        $client = new ProofMarkVerify('test-secret', 'https://api.proofmark.com', 5000, $transport);
        $result = $client->verify('test-token');

        $this->assertTrue($result->success);
        $this->assertEquals(0.9, $result->score);
        $this->assertTrue($result->credit);
        $this->assertTrue($result->isHuman());
        $this->assertTrue($result->isHuman(0.5));
        $this->assertEquals('2026-06-25T12:00:00Z', $result->challengeTs);
        $this->assertEquals('example.com', $result->hostname);
        $this->assertEquals('signup', $result->action);
    }

    public function testLowScoreFailsIsHuman(): void
    {
        $transport = function (string $url, array $fields, int $timeoutMs): array {
            return [
                'status' => 200,
                'body' => json_encode([
                    'success' => true,
                    'score' => 0.3,
                    'flags' => ['datacenter_ip'],
                    'credit' => false
                ])
            ];
        };

        $client = new ProofMarkVerify('test-secret', 'https://api.proofmark.com', 5000, $transport);
        $result = $client->verify('test-token');

        $this->assertTrue($result->success);
        $this->assertEquals(0.3, $result->score);
        $this->assertFalse($result->isHuman(0.5));
        $this->assertTrue($result->isHuman(0.2));
        $this->assertEquals(['datacenter_ip'], $result->flags);
    }

    public function testTransportReceivesCorrectFields(): void
    {
        $capturedUrl = null;
        $capturedFields = null;

        $transport = function (string $url, array $fields, int $timeoutMs) use (&$capturedUrl, &$capturedFields): array {
            $capturedUrl = $url;
            $capturedFields = $fields;
            return [
                'status' => 200,
                'body' => json_encode(['success' => true, 'score' => 0.8, 'flags' => [], 'credit' => true])
            ];
        };

        $client = new ProofMarkVerify('my-secret', 'https://api.proofmark.com', 5000, $transport);
        $client->verify('my-token', '192.168.1.1');

        $this->assertEquals('https://api.proofmark.com/v1/verify/siteverify', $capturedUrl);
        $this->assertEquals('my-secret', $capturedFields['secret']);
        $this->assertEquals('my-token', $capturedFields['response']);
        $this->assertEquals('192.168.1.1', $capturedFields['remoteip']);
    }

    public function testTransportWithoutRemoteipOmitsField(): void
    {
        $capturedFields = null;

        $transport = function (string $url, array $fields, int $timeoutMs) use (&$capturedFields): array {
            $capturedFields = $fields;
            return [
                'status' => 200,
                'body' => json_encode(['success' => true, 'score' => 0.8, 'flags' => [], 'credit' => true])
            ];
        };

        $client = new ProofMarkVerify('my-secret', 'https://api.proofmark.com', 5000, $transport);
        $client->verify('my-token');

        $this->assertArrayNotHasKey('remoteip', $capturedFields);
    }

    public function testNon2xxStatusThrowsHttpError(): void
    {
        $transport = function (string $url, array $fields, int $timeoutMs): array {
            return [
                'status' => 403,
                'body' => 'Forbidden'
            ];
        };

        $client = new ProofMarkVerify('test-secret', 'https://api.proofmark.com', 5000, $transport);

        $this->expectException(ProofMarkVerifyException::class);
        $this->expectExceptionMessage('siteverify returned HTTP 403');
        $client->verify('test-token');

        try {
            $client->verify('test-token');
        } catch (ProofMarkVerifyException $e) {
            $this->assertEquals('PMV_HTTP_ERROR', $e->errorCode);
            throw $e;
        }
    }

    public function testInvalidJsonThrowsInvalidResponse(): void
    {
        $transport = function (string $url, array $fields, int $timeoutMs): array {
            return [
                'status' => 200,
                'body' => 'not json'
            ];
        };

        $client = new ProofMarkVerify('test-secret', 'https://api.proofmark.com', 5000, $transport);

        $this->expectException(ProofMarkVerifyException::class);
        $this->expectExceptionMessage('siteverify response is not valid JSON');
        $client->verify('test-token');

        try {
            $client->verify('test-token');
        } catch (ProofMarkVerifyException $e) {
            $this->assertEquals('PMV_INVALID_RESPONSE', $e->errorCode);
            throw $e;
        }
    }

    public function testEmptySecretThrowsInvalidArgumentException(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('secret cannot be empty');
        new ProofMarkVerify('');
    }

    public function testBaseUrlTrimsTrailingSlash(): void
    {
        $capturedUrl = null;

        $transport = function (string $url, array $fields, int $timeoutMs) use (&$capturedUrl): array {
            $capturedUrl = $url;
            return [
                'status' => 200,
                'body' => json_encode(['success' => true, 'score' => 0.8, 'flags' => [], 'credit' => true])
            ];
        };

        $client = new ProofMarkVerify('test-secret', 'https://api.proofmark.com/', 5000, $transport);
        $client->verify('test-token');

        $this->assertEquals('https://api.proofmark.com/v1/verify/siteverify', $capturedUrl);
    }

    public function testVerifyResultFromArrayDefensiveNormalization(): void
    {
        // Missing fields
        $result = VerifyResult::fromArray([]);
        $this->assertFalse($result->success);
        $this->assertEquals(0.0, $result->score);
        $this->assertEquals([], $result->flags);
        $this->assertFalse($result->credit);
        $this->assertNull($result->challengeTs);
        $this->assertNull($result->hostname);
        $this->assertNull($result->action);
        $this->assertEquals([], $result->errorCodes);

        // Invalid types
        $result = VerifyResult::fromArray([
            'success' => 'yes',  // Not a boolean
            'score' => '0.5',    // String coerced to float
            'flags' => 'not-an-array',
            'credit' => 1,       // Truthy but not === true
            'error-codes' => null
        ]);
        $this->assertFalse($result->success);
        $this->assertEquals(0.5, $result->score);
        $this->assertEquals([], $result->flags);
        $this->assertFalse($result->credit);
        $this->assertEquals([], $result->errorCodes);

        // Valid with string filtering in arrays
        $result = VerifyResult::fromArray([
            'success' => true,
            'score' => 0.8,
            'flags' => ['datacenter_ip', 123, null, 'vpn_suspected'],
            'credit' => true,
            'error-codes' => ['invalid-secret', false, 'timeout-or-duplicate']
        ]);
        $this->assertEquals(['datacenter_ip', 'vpn_suspected'], $result->flags);
        $this->assertEquals(['invalid-secret', 'timeout-or-duplicate'], $result->errorCodes);
    }
}
