<?php

declare(strict_types=1);

namespace ProofMark\ShowAd\Tests;

use PHPUnit\Framework\TestCase;
use ProofMark\ShowAd\Jwt\JwtHelper;
use ProofMark\ShowAd\Tests\Support\JwtFactory;

final class JwtHelperTest extends TestCase
{
    public function testDecodeReturnsClaims(): void
    {
        $token = JwtFactory::make(['creator_hash' => 'abc', 'exp' => time() + 3600]);
        $claims = JwtHelper::decodeToken($token);

        self::assertIsArray($claims);
        self::assertSame('abc', $claims['creator_hash']);
        self::assertGreaterThan(time(), $claims['exp']);
    }

    public function testDecodeReturnsNullOnMalformedToken(): void
    {
        self::assertNull(JwtHelper::decodeToken('not-a-jwt'));
        self::assertNull(JwtHelper::decodeToken('only.two'));
        self::assertNull(JwtHelper::decodeToken('a.b.c'));
    }

    public function testIsTokenExpiredHandlesPastExp(): void
    {
        $token = JwtFactory::make(['exp' => time() - 60]);
        self::assertTrue(JwtHelper::isTokenExpired($token));
    }

    public function testIsTokenExpiredHonoursNbf(): void
    {
        $token = JwtFactory::make(['exp' => time() + 3600, 'nbf' => time() + 1800]);
        self::assertTrue(JwtHelper::isTokenExpired($token));
    }

    public function testGetTokenExpiryReturnsMilliseconds(): void
    {
        $exp = time() + 1234;
        $token = JwtFactory::make(['exp' => $exp]);
        self::assertSame($exp * 1000, JwtHelper::getTokenExpiry($token));
    }

    public function testValidateClaimsHappyPath(): void
    {
        $token = JwtFactory::make([
            'creator_hash' => 'creator-1',
            'fingerprint' => 'fp-1',
            'iss' => JwtHelper::ISSUER,
            'exp' => time() + 3600,
        ]);

        $result = JwtHelper::validateTokenClaims($token, 'creator-1', 'fp-1');
        self::assertTrue($result['valid']);
    }

    public function testValidateClaimsCreatorMismatch(): void
    {
        $token = JwtFactory::make(['creator_hash' => 'a', 'exp' => time() + 3600]);
        $result = JwtHelper::validateTokenClaims($token, 'b');
        self::assertFalse($result['valid']);
        self::assertSame('Creator hash mismatch', $result['reason']);
    }

    public function testValidateClaimsFingerprintMismatch(): void
    {
        $token = JwtFactory::make([
            'creator_hash' => 'a',
            'fingerprint' => 'fp-1',
            'exp' => time() + 3600,
        ]);
        $result = JwtHelper::validateTokenClaims($token, 'a', 'fp-2');
        self::assertFalse($result['valid']);
        self::assertSame('Fingerprint mismatch', $result['reason']);
    }

    public function testValidateClaimsRejectsBadIssuer(): void
    {
        $token = JwtFactory::make([
            'creator_hash' => 'a',
            'iss' => 'attacker',
            'exp' => time() + 3600,
        ]);
        $result = JwtHelper::validateTokenClaims($token, 'a');
        self::assertFalse($result['valid']);
        self::assertSame('Invalid issuer', $result['reason']);
    }
}
