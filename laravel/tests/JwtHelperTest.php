<?php

namespace ProofMark\ShowAd\Tests;

use PHPUnit\Framework\TestCase;
use ProofMark\ShowAd\JwtHelper;

class JwtHelperTest extends TestCase
{
    /**
     * Create a test JWT token with given claims.
     */
    protected function makeToken(array $claims)
    {
        $header = base64_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $header = rtrim(strtr($header, '+/', '-_'), '=');

        $payload = base64_encode(json_encode($claims));
        $payload = rtrim(strtr($payload, '+/', '-_'), '=');

        // Fake signature (not verified by our code)
        $signature = rtrim(strtr(base64_encode('test-signature'), '+/', '-_'), '=');

        return "{$header}.{$payload}.{$signature}";
    }

    public function testDecodeValidToken()
    {
        $claims = [
            'creator_hash' => 'test_creator',
            'fingerprint' => 'fp_123',
            'session_hash' => 'sess_456',
            'iss' => 'showad-backend',
            'iat' => time(),
            'exp' => time() + 3600,
            'nbf' => time() - 60,
        ];

        $token = $this->makeToken($claims);
        $decoded = JwtHelper::decodeToken($token);

        $this->assertNotNull($decoded);
        $this->assertEquals('test_creator', $decoded['creator_hash']);
        $this->assertEquals('fp_123', $decoded['fingerprint']);
        $this->assertEquals('showad-backend', $decoded['iss']);
    }

    public function testDecodeInvalidToken()
    {
        $this->assertNull(JwtHelper::decodeToken('not-a-jwt'));
        $this->assertNull(JwtHelper::decodeToken(''));
        $this->assertNull(JwtHelper::decodeToken('a.b'));
    }

    public function testIsTokenExpired()
    {
        // Valid token
        $validToken = $this->makeToken(['exp' => time() + 3600]);
        $this->assertFalse(JwtHelper::isTokenExpired($validToken));

        // Expired token
        $expiredToken = $this->makeToken(['exp' => time() - 60]);
        $this->assertTrue(JwtHelper::isTokenExpired($expiredToken));

        // Not yet valid (nbf in the future)
        $nbfToken = $this->makeToken(['exp' => time() + 3600, 'nbf' => time() + 3600]);
        $this->assertTrue(JwtHelper::isTokenExpired($nbfToken));
    }

    public function testGetTokenExpiry()
    {
        $exp = time() + 3600;
        $token = $this->makeToken(['exp' => $exp]);

        $this->assertEquals($exp, JwtHelper::getTokenExpiry($token));
    }

    public function testGetTokenExpiryNull()
    {
        $token = $this->makeToken(['iat' => time()]);
        $this->assertNull(JwtHelper::getTokenExpiry($token));
    }

    public function testGetTimeUntilExpiry()
    {
        $token = $this->makeToken(['exp' => time() + 120]);
        $ttl = JwtHelper::getTimeUntilExpiry($token);
        $this->assertGreaterThan(100, $ttl);
        $this->assertLessThanOrEqual(120, $ttl);
    }

    public function testValidateTokenClaimsValid()
    {
        $token = $this->makeToken([
            'creator_hash' => 'test_creator',
            'fingerprint' => 'fp_123',
            'iss' => 'showad-backend',
            'exp' => time() + 3600,
        ]);

        $result = JwtHelper::validateTokenClaims($token, 'test_creator', 'fp_123');
        $this->assertTrue($result['valid']);
        $this->assertNull($result['reason']);
    }

    public function testValidateTokenClaimsCreatorMismatch()
    {
        $token = $this->makeToken([
            'creator_hash' => 'other_creator',
            'exp' => time() + 3600,
        ]);

        $result = JwtHelper::validateTokenClaims($token, 'test_creator');
        $this->assertFalse($result['valid']);
        $this->assertEquals('Creator hash mismatch', $result['reason']);
    }

    public function testValidateTokenClaimsFingerprintMismatch()
    {
        $token = $this->makeToken([
            'creator_hash' => 'test_creator',
            'fingerprint' => 'fp_abc',
            'exp' => time() + 3600,
        ]);

        $result = JwtHelper::validateTokenClaims($token, 'test_creator', 'fp_different');
        $this->assertFalse($result['valid']);
        $this->assertEquals('Fingerprint mismatch', $result['reason']);
    }

    public function testValidateTokenClaimsExpired()
    {
        $token = $this->makeToken([
            'creator_hash' => 'test_creator',
            'exp' => time() - 60,
        ]);

        $result = JwtHelper::validateTokenClaims($token, 'test_creator');
        $this->assertFalse($result['valid']);
        $this->assertEquals('Token expired', $result['reason']);
    }

    public function testValidateTokenClaimsInvalidIssuer()
    {
        $token = $this->makeToken([
            'creator_hash' => 'test_creator',
            'iss' => 'some-other-service',
            'exp' => time() + 3600,
        ]);

        $result = JwtHelper::validateTokenClaims($token, 'test_creator');
        $this->assertFalse($result['valid']);
        $this->assertEquals('Invalid issuer', $result['reason']);
    }

    public function testGetCreatorHashFromToken()
    {
        $token = $this->makeToken(['creator_hash' => 'test_creator']);
        $this->assertEquals('test_creator', JwtHelper::getCreatorHashFromToken($token));
    }

    public function testGetFingerprintFromToken()
    {
        $token = $this->makeToken(['fingerprint' => 'fp_123']);
        $this->assertEquals('fp_123', JwtHelper::getFingerprintFromToken($token));
    }

    public function testGetSessionHashFromToken()
    {
        $token = $this->makeToken(['session_hash' => 'sess_456']);
        $this->assertEquals('sess_456', JwtHelper::getSessionHashFromToken($token));
    }

    public function testNullReturnForMissingClaims()
    {
        $token = $this->makeToken(['iat' => time()]);
        $this->assertNull(JwtHelper::getCreatorHashFromToken($token));
        $this->assertNull(JwtHelper::getFingerprintFromToken($token));
        $this->assertNull(JwtHelper::getSessionHashFromToken($token));
    }
}
