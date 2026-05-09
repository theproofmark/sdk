<?php

namespace ProofMark\ShowAd\Tests;

use PHPUnit\Framework\TestCase;
use Illuminate\Http\Request;
use ProofMark\ShowAd\ShowAdException;
use ProofMark\ShowAd\ShowAdManager;

class ShowAdManagerTest extends TestCase
{
    protected function makeManager(array $configOverride = [])
    {
        $config = array_merge([
            'creator_hash' => 'test_creator_hash',
            'api_key' => 'sk-test-api-key',
            'redirect_secret' => 'secret_test',
            'api_base_url' => 'https://ad.proofmark.io',
            'video_ad_url' => 'https://showad.proofmark.io',
            'cookie' => [
                'prefix' => 'showad',
                'max_age' => 3600,
                'secure' => false,
                'same_site' => 'lax',
            ],
            'debug' => false,
        ], $configOverride);

        return new ShowAdManager($config);
    }

    public function testGetConfig()
    {
        $manager = $this->makeManager();
        $this->assertEquals('test_creator_hash', $manager->getConfig('creator_hash'));
        $this->assertEquals('sk-test-api-key', $manager->getConfig('api_key'));
        $this->assertEquals('showad', $manager->getConfig('cookie.prefix'));
    }

    public function testGetConfigDefault()
    {
        $manager = $this->makeManager();
        $this->assertEquals('fallback', $manager->getConfig('nonexistent', 'fallback'));
    }

    public function testGetCookieName()
    {
        $manager = $this->makeManager();
        $this->assertEquals('showad_token', $manager->getCookieName('token'));
        $this->assertEquals('showad_fingerprint', $manager->getCookieName('fingerprint'));
        $this->assertEquals('showad_verified', $manager->getCookieName('verified'));
    }

    public function testGetCookieNameCustomPrefix()
    {
        $manager = $this->makeManager([
            'cookie' => ['prefix' => 'myapp', 'max_age' => 3600],
        ]);
        $this->assertEquals('myapp_token', $manager->getCookieName('token'));
    }

    public function testBuildVideoAdRedirectUrl()
    {
        $manager = $this->makeManager();
        $url = $manager->buildVideoAdRedirectUrl('https://example.com/page');

        $this->assertStringContainsString('https://showad.proofmark.io/c/test_creator_hash', $url);
        $this->assertStringContainsString('sdk=1', $url);
        $this->assertStringContainsString('return_url=', $url);
        $this->assertStringContainsString(urlencode('https://example.com/page'), $url);
    }

    public function testBuildVideoAdRedirectUrlWithoutReturn()
    {
        $manager = $this->makeManager();
        $url = $manager->buildVideoAdRedirectUrl();

        $this->assertStringContainsString('https://showad.proofmark.io/c/test_creator_hash', $url);
        $this->assertStringContainsString('sdk=1', $url);
        $this->assertStringNotContainsString('return_url', $url);
    }

    public function testBuildResourceRedirectUrl()
    {
        $manager = $this->makeManager();
        $url = $manager->buildResourceRedirectUrl('proj_123', 'res_456', 'https://example.com');

        $this->assertStringContainsString('/c/test_creator_hash/proj_123/res_456', $url);
        $this->assertStringContainsString('sdk=1', $url);
        $this->assertStringContainsString(urlencode('https://example.com'), $url);
    }

    public function testBuildVideoAdRedirectUrlRequiresCreatorHash()
    {
        $this->expectException(ShowAdException::class);
        $this->expectExceptionCode(ShowAdException::CONFIG_ERROR);

        $manager = $this->makeManager([
            'creator_hash' => '',
        ]);

        $manager->buildVideoAdRedirectUrl('https://example.com/page');
    }

    public function testGetVerificationStateShape()
    {
        $manager = $this->makeManager();
        $request = Request::create('/premium/article', 'GET');

        $state = $manager->getVerificationState($request);

        $this->assertFalse($state['is_verified']);
        $this->assertFalse($state['is_loading']);
        $this->assertEquals('no_token', $state['error']);
        $this->assertEquals('test_creator_hash', $state['creator_hash']);
        $this->assertNull($state['fingerprint']);
        $this->assertNull($state['redirect_ticket_id']);
        $this->assertNull($state['expires_at']);
        $this->assertStringContainsString('/c/test_creator_hash', $state['redirect_url']);
    }

    public function testPathMatchesExact()
    {
        $manager = $this->makeManager();
        $this->assertTrue($manager->pathMatches('/premium', '/premium'));
        $this->assertFalse($manager->pathMatches('/premium', '/other'));
    }

    public function testPathMatchesWildcard()
    {
        $manager = $this->makeManager();
        $this->assertTrue($manager->pathMatches('/premium/content', '/premium/*'));
        $this->assertTrue($manager->pathMatches('/premium/deep/nested', '/premium/*'));
        $this->assertFalse($manager->pathMatches('/other/content', '/premium/*'));
    }

    public function testPathMatchesAny()
    {
        $manager = $this->makeManager();
        $patterns = ['/premium/*', '/content/*', '/vip'];

        $this->assertTrue($manager->pathMatchesAny('/premium/page', $patterns));
        $this->assertTrue($manager->pathMatchesAny('/content/article', $patterns));
        $this->assertTrue($manager->pathMatchesAny('/vip', $patterns));
        $this->assertFalse($manager->pathMatchesAny('/public/page', $patterns));
    }

    public function testPathMatchesAnyEmptyPatterns()
    {
        $manager = $this->makeManager();
        $this->assertFalse($manager->pathMatchesAny('/any/path', []));
    }

    public function testPathMatchesLeadingSlash()
    {
        $manager = $this->makeManager();
        $this->assertTrue($manager->pathMatches('premium', 'premium'));
        $this->assertTrue($manager->pathMatches('/premium', 'premium'));
        $this->assertTrue($manager->pathMatches('premium', '/premium'));
    }
}
