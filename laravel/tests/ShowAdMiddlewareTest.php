<?php

namespace ProofMark\ShowAd\Tests;

use Illuminate\Http\Request;
use ProofMark\ShowAd\Middleware\VerifyShowAd;
use ProofMark\ShowAd\ShowAdException;
use ProofMark\ShowAd\ShowAdManager;

class ShowAdMiddlewareTest extends TestCase
{
    protected function defineRoutes($router)
    {
        $router->get('/premium', function () {
            return 'premium-content';
        })->middleware('showad.verify');

        $router->get('/premium-return', function () {
            return 'premium-return-content';
        })->middleware('showad.verify');
    }

    public function testFirstProtectedVisitBootstrapsFingerprintBeforeRedirectingToShowAd()
    {
        $response = $this->get('/premium');

        $response->assertStatus(200);
        $response->assertSee('Preparing secure verification');
        $response->assertSee('secure browser fingerprint');
        $response->assertSee('https://showad.proofmark.io/c/test_creator_hash?');
    }

    public function testRedirectTicketWithoutFingerprintBootstrapsAndResumesCurrentRequest()
    {
        $response = $this->get('/premium-return?redirect_ticket=ticket_123');

        $response->assertStatus(200);
        $response->assertSee('Preparing secure verification');
        $response->assertSee('redirect_ticket=ticket_123');
    }

    public function testFingerprintWithoutTokenRedirectsToShowAd()
    {
        $response = $this->withCookie('showad_fingerprint', 'fp_123')
            ->get('/premium');

        $response->assertRedirect('https://showad.proofmark.io/c/test_creator_hash?sdk=1&return_url=' . urlencode('http://localhost/premium'));
    }

    public function testValidTokenAndFingerprintAllowAccess()
    {
        $token = $this->makeToken([
            'creator_hash' => 'test_creator_hash',
            'fingerprint' => 'fp_123',
            'session_hash' => 'sess_123',
            'iss' => 'showad-backend',
            'iat' => time(),
            'nbf' => time() - 60,
            'exp' => time() + 3600,
        ]);

        $request = Request::create('/premium', 'GET');
        $request->cookies->set('showad_fingerprint', 'fp_123');
        $request->cookies->set('showad_token', $token);

        $manager = $this->makeValidatingManager(['valid' => true]);
        $middleware = new VerifyShowAd($manager);
        $response = $middleware->handle($request, function () {
            return response('premium-content', 200);
        });

        $this->assertEquals(200, $response->getStatusCode());
        $this->assertEquals('premium-content', $response->getContent());
        $this->assertNotEmpty($response->headers->getCookies());
        $this->assertSame([$token], $manager->validatedTokens);
    }

    public function testForgedTokenAndFingerprintRedirectsWhenBackendRejects()
    {
        $token = $this->makeToken([
            'creator_hash' => 'test_creator_hash',
            'fingerprint' => 'fp_123',
            'session_hash' => 'sess_123',
            'iss' => 'showad-backend',
            'iat' => time(),
            'nbf' => time() - 60,
            'exp' => time() + 3600,
        ]);

        $request = Request::create('/premium', 'GET');
        $request->cookies->set('showad_fingerprint', 'fp_123');
        $request->cookies->set('showad_token', $token);
        $request->cookies->set('showad_creator', 'test_creator_hash');
        $request->cookies->set('showad_verified', '1');

        $manager = $this->makeValidatingManager(
            ['valid' => false],
            new ShowAdException('signature invalid', ShowAdException::TOKEN_INVALID)
        );
        $middleware = new VerifyShowAd($manager);
        $response = $middleware->handle($request, function () {
            return response('premium-content', 200);
        });

        $this->assertTrue($response->isRedirect());
        $this->assertStringStartsWith('https://showad.proofmark.io/c/test_creator_hash', $response->headers->get('Location'));
        $this->assertSame([$token], $manager->validatedTokens);

        $cookieNames = array_map(function ($cookie) {
            return $cookie->getName();
        }, $response->headers->getCookies());
        $this->assertContains('showad_token', $cookieNames);
        $this->assertContains('showad_verified', $cookieNames);
    }

    public function testBackendValidationFailureRedirectsClosed()
    {
        $token = $this->makeToken([
            'creator_hash' => 'test_creator_hash',
            'fingerprint' => 'fp_123',
            'iss' => 'showad-backend',
            'exp' => time() + 3600,
        ]);

        $request = Request::create('/premium', 'GET');
        $request->cookies->set('showad_fingerprint', 'fp_123');
        $request->cookies->set('showad_token', $token);

        $manager = $this->makeValidatingManager(
            null,
            new ShowAdException('backend unavailable', ShowAdException::NETWORK_ERROR)
        );
        $middleware = new VerifyShowAd($manager);
        $response = $middleware->handle($request, function () {
            return response('premium-content', 200);
        });

        $this->assertTrue($response->isRedirect());
        $this->assertSame([$token], $manager->validatedTokens);
    }

    public function testPublisherAccessPolicyCallbackCanAllowPremiumUser()
    {
        config()->set('showad.access_policy.before_protect', function (Request $request) {
            return $request->headers->get('X-Publisher-Premium') === '1'
                ? ['action' => 'allow', 'reason' => 'premium_user']
                : 'continue';
        });

        $request = Request::create('/premium', 'GET', [], [], [], [
            'HTTP_X_PUBLISHER_PREMIUM' => '1',
        ]);

        $middleware = $this->app->make(VerifyShowAd::class);
        $response = $middleware->handle($request, function () {
            return response('premium-content', 200);
        });

        $this->assertEquals(200, $response->getStatusCode());
        $this->assertEquals('premium-content', $response->getContent());
    }

    public function testTrustedCidrAllowlistCanBypassVerification()
    {
        config()->set('showad.access_policy.allow_cidrs', ['203.0.113.0/24']);
        config()->set('showad.access_policy.trusted_ip_headers', ['CF-Connecting-IP']);

        $request = Request::create('/premium', 'GET', [], [], [], [
            'HTTP_CF_CONNECTING_IP' => '203.0.113.42',
        ]);

        $middleware = $this->app->make(VerifyShowAd::class);
        $response = $middleware->handle($request, function () {
            return response('premium-content', 200);
        });

        $this->assertEquals(200, $response->getStatusCode());
        $this->assertEquals('premium-content', $response->getContent());
    }

    public function testCrawlerUserAgentAloneDoesNotBypassVerification()
    {
        config()->set('showad.access_policy.crawler.enabled', true);
        config()->set('showad.access_policy.crawler.families', ['google']);
        config()->set('showad.access_policy.crawler.family_cidrs.google', ['66.249.64.0/19']);

        $response = $this->withHeader(
            'User-Agent',
            'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
        )->get('/premium');

        $response->assertStatus(200);
        $response->assertSee('Preparing secure verification');
    }

    public function testVerifiedCrawlerByTrustedRangeCanBypassVerification()
    {
        config()->set('showad.access_policy.trusted_ip_headers', ['CF-Connecting-IP']);
        config()->set('showad.access_policy.crawler.enabled', true);
        config()->set('showad.access_policy.crawler.families', ['google']);
        config()->set('showad.access_policy.crawler.family_cidrs.google', ['66.249.64.0/19']);

        $request = Request::create('/premium', 'GET', [], [], [], [
            'HTTP_USER_AGENT' => 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'HTTP_CF_CONNECTING_IP' => '66.249.66.1',
        ]);

        $middleware = $this->app->make(VerifyShowAd::class);
        $response = $middleware->handle($request, function () {
            return response('premium-content', 200);
        });

        $this->assertEquals(200, $response->getStatusCode());
        $this->assertEquals('premium-content', $response->getContent());
    }

    protected function makeToken(array $claims)
    {
        $header = rtrim(strtr(base64_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT'])), '+/', '-_'), '=');
        $payload = rtrim(strtr(base64_encode(json_encode($claims)), '+/', '-_'), '=');
        $signature = rtrim(strtr(base64_encode('test-signature'), '+/', '-_'), '=');

        return $header . '.' . $payload . '.' . $signature;
    }

    protected function makeValidatingManager($validationResult = ['valid' => true], $validationException = null)
    {
        return new class($this->showAdConfig(), $validationResult, $validationException) extends ShowAdManager {
            public $validatedTokens = [];
            protected $validationResult;
            protected $validationException;

            public function __construct(array $config, $validationResult, $validationException)
            {
                parent::__construct($config);
                $this->validationResult = $validationResult;
                $this->validationException = $validationException;
            }

            public function validateToken($token)
            {
                $this->validatedTokens[] = $token;

                if ($this->validationException) {
                    throw $this->validationException;
                }

                return $this->validationResult;
            }
        };
    }

    protected function showAdConfig()
    {
        return [
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
        ];
    }
}
