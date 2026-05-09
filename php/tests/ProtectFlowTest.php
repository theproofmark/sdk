<?php

declare(strict_types=1);

namespace ProofMark\ShowAd\Tests;

use PHPUnit\Framework\TestCase;
use ProofMark\ShowAd\Config;
use ProofMark\ShowAd\Cookies\CookieJar;
use ProofMark\ShowAd\Http\HttpResponse;
use ProofMark\ShowAd\Jwt\JwtHelper;
use ProofMark\ShowAd\Middleware\MiddlewareResult;
use ProofMark\ShowAd\Middleware\RequestHandler;
use ProofMark\ShowAd\Request\RequestContext;
use ProofMark\ShowAd\ShowAdClient;
use ProofMark\ShowAd\Tests\Support\FakeHttpClient;
use ProofMark\ShowAd\Tests\Support\JwtFactory;

final class ProtectFlowTest extends TestCase
{
    private function makeConfig(array $overrides = []): Config
    {
        return new Config(array_replace_recursive([
            'creator_hash' => 'creator-1',
            'api_key' => 'api-key-1',
            'redirect_secret' => 'secret-1',
            'api_base_url' => 'https://ad.example.com',
            'video_ad_url' => 'https://showad.example.com',
            'cookie' => ['prefix' => 'showad', 'secure' => false],
        ], $overrides));
    }

    private function makeRequest(array $opts = []): RequestContext
    {
        return new RequestContext(
            $opts['method'] ?? 'GET',
            $opts['path'] ?? '/protected',
            $opts['query'] ?? [],
            $opts['headers'] ?? [],
            $opts['cookies'] ?? [],
            $opts['ip'] ?? '127.0.0.1',
            $opts['fullUrl'] ?? 'https://site.example.com/protected',
            $opts['scheme'] ?? 'https',
            $opts['host'] ?? 'site.example.com'
        );
    }

    public function testNoTokenRedirectsToVideoAd(): void
    {
        $config = $this->makeConfig();
        $http = new FakeHttpClient();
        $handler = new RequestHandler($config, $http);

        $result = $handler->protect($this->makeRequest());

        self::assertTrue($result->isRedirect());
        self::assertSame(MiddlewareResult::TYPE_REDIRECT, $result->type);
        self::assertNotNull($result->redirectUrl);
        self::assertStringStartsWith('https://showad.example.com/c/creator-1', $result->redirectUrl);
        self::assertStringContainsString('return_url=', $result->redirectUrl);
        self::assertStringContainsString('sdk%3D1', urlencode($result->redirectUrl) /* sanity */);
    }

    public function testValidTokenAllowsAccess(): void
    {
        $config = $this->makeConfig();
        $http = new FakeHttpClient();
        $http->pushJson(200, ['valid' => true]);
        $handler = new RequestHandler($config, $http);

        $token = JwtFactory::make([
            'creator_hash' => 'creator-1',
            'fingerprint' => 'fp-1',
            'iss' => JwtHelper::ISSUER,
            'exp' => time() + 3600,
        ]);
        $expiry = JwtHelper::getTokenExpiry($token);

        $cookies = [
            'showad_token' => $token,
            'showad_fingerprint' => 'fp-1',
            'showad_creator' => 'creator-1',
            'showad_verified' => '1',
            'showad_expires' => (string) $expiry,
        ];

        $request = $this->makeRequest(['cookies' => $cookies]);
        $result = $handler->protect($request);

        self::assertTrue($result->isAllow());
        self::assertSame([], $result->cookies, 'No cookie refresh needed when state is consistent');
        self::assertCount(1, $http->calls);
        self::assertSame('https://ad.example.com/api/sdk/validate', $http->calls[0]['url']);
        self::assertSame('{"token":"' . $token . '","sdk_key":"api-key-1"}', $http->calls[0]['body']);
    }

    public function testValidTokenWithStaleCookiesRefreshes(): void
    {
        $config = $this->makeConfig();
        $http = new FakeHttpClient();
        $http->pushJson(200, ['valid' => true]);
        $handler = new RequestHandler($config, $http);

        $token = JwtFactory::make([
            'creator_hash' => 'creator-1',
            'fingerprint' => 'fp-1',
            'iss' => JwtHelper::ISSUER,
            'exp' => time() + 3600,
        ]);

        $cookies = [
            'showad_token' => $token,
            'showad_fingerprint' => 'fp-1',
            // stale derived state
            'showad_verified' => '0',
        ];

        $request = $this->makeRequest(['cookies' => $cookies]);
        $result = $handler->protect($request);

        self::assertTrue($result->isAllow());
        self::assertNotEmpty($result->cookies);
        $names = array_map(static fn ($c) => $c['name'], $result->cookies);
        self::assertContains('showad_token', $names);
        self::assertContains('showad_verified', $names);
        self::assertCount(1, $http->calls);
        self::assertSame('https://ad.example.com/api/sdk/validate', $http->calls[0]['url']);
    }

    public function testForgedTokenRedirectsWhenBackendRejects(): void
    {
        $config = $this->makeConfig();
        $http = new FakeHttpClient();
        $http->pushJson(200, ['valid' => false, 'message' => 'signature invalid']);
        $handler = new RequestHandler($config, $http);

        $token = JwtFactory::make([
            'creator_hash' => 'creator-1',
            'fingerprint' => 'fp-1',
            'iss' => JwtHelper::ISSUER,
            'exp' => time() + 3600,
        ]);

        $result = $handler->protect($this->makeRequest([
            'cookies' => [
                'showad_token' => $token,
                'showad_fingerprint' => 'fp-1',
                'showad_creator' => 'creator-1',
                'showad_verified' => '1',
                'showad_expires' => (string) JwtHelper::getTokenExpiry($token),
            ],
        ]));

        self::assertTrue($result->isRedirect());
        self::assertStringStartsWith('https://showad.example.com/c/creator-1', (string) $result->redirectUrl);
        self::assertCount(1, $http->calls);
        $names = array_map(static fn ($c) => $c['name'], $result->cookies);
        self::assertContains('showad_token', $names);
        self::assertContains('showad_verified', $names);
    }

    public function testTokenValidationNetworkFailureRedirects(): void
    {
        $config = $this->makeConfig();
        $http = new FakeHttpClient();
        $http->pushFailure(new \ProofMark\ShowAd\Http\HttpClientException('timeout'));
        $handler = new RequestHandler($config, $http);

        $token = JwtFactory::make([
            'creator_hash' => 'creator-1',
            'fingerprint' => 'fp-1',
            'iss' => JwtHelper::ISSUER,
            'exp' => time() + 3600,
        ]);

        $result = $handler->protect($this->makeRequest([
            'cookies' => [
                'showad_token' => $token,
                'showad_fingerprint' => 'fp-1',
            ],
        ]));

        self::assertTrue($result->isRedirect());
        self::assertStringStartsWith('https://showad.example.com/c/creator-1', (string) $result->redirectUrl);
        self::assertCount(1, $http->calls);
    }

    public function testTokenValidationBackendErrorRedirectsEvenWithJsonBody(): void
    {
        $config = $this->makeConfig();
        $http = new FakeHttpClient();
        $http->pushJson(503, ['valid' => true]);
        $handler = new RequestHandler($config, $http);

        $token = JwtFactory::make([
            'creator_hash' => 'creator-1',
            'fingerprint' => 'fp-1',
            'iss' => JwtHelper::ISSUER,
            'exp' => time() + 3600,
        ]);

        $result = $handler->protect($this->makeRequest([
            'cookies' => [
                'showad_token' => $token,
                'showad_fingerprint' => 'fp-1',
            ],
        ]));

        self::assertTrue($result->isRedirect());
        self::assertCount(1, $http->calls);
    }

    public function testClientIsVerifiedRequiresBackendValidation(): void
    {
        $config = $this->makeConfig();
        $http = new FakeHttpClient();
        $http->pushJson(200, ['valid' => false, 'message' => 'signature invalid']);
        $client = new ShowAdClient($config, $http);

        $token = JwtFactory::make([
            'creator_hash' => 'creator-1',
            'fingerprint' => 'fp-1',
            'iss' => JwtHelper::ISSUER,
            'exp' => time() + 3600,
        ]);

        $request = $this->makeRequest([
            'cookies' => [
                'showad_token' => $token,
                'showad_fingerprint' => 'fp-1',
            ],
        ]);

        self::assertFalse($client->isVerified($request));
        self::assertCount(1, $http->calls);
        self::assertSame('https://ad.example.com/api/sdk/validate', $http->calls[0]['url']);
    }

    public function testTicketClaimSucceeds(): void
    {
        $config = $this->makeConfig();
        $http = new FakeHttpClient();
        $token = JwtFactory::make([
            'creator_hash' => 'creator-1',
            'iss' => JwtHelper::ISSUER,
            'exp' => time() + 3600,
        ]);
        $http->pushJson(200, [
            'creator_hash' => 'creator-1',
            'ticket_id' => 'ticket-xyz',
            'token' => $token,
            'header_name' => 'X-ShowAd-Token',
            'scheme' => 'Bearer',
            'destination_url' => 'https://site.example.com/protected',
            'require_jwt' => true,
        ]);

        $handler = new RequestHandler($config, $http);
        $request = $this->makeRequest([
            'query' => ['redirect_ticket' => 'ticket-xyz'],
            'fullUrl' => 'https://site.example.com/protected?redirect_ticket=ticket-xyz',
            'cookies' => ['showad_fingerprint' => 'fp-1'],
        ]);

        $result = $handler->protect($request);

        self::assertSame(MiddlewareResult::TYPE_TICKET_CLAIMED, $result->type);
        self::assertSame('https://site.example.com/protected', $result->redirectUrl);

        self::assertCount(1, $http->calls);
        $call = $http->calls[0];
        self::assertSame('POST', $call['method']);
        self::assertSame(
            'https://ad.example.com/api/redirect-ticket/ticket-xyz/claim',
            $call['url']
        );
        self::assertSame('secret-1', $call['headers']['X-Redirect-Ticket-Secret']);
        self::assertSame('api-key-1', $call['headers']['X-ShowAd-API-Key']);
        self::assertSame('creator-1', $call['headers']['X-ShowAd-Creator-Hash']);
        self::assertSame('{"creator_hash":"creator-1"}', $call['body']);

        $names = array_map(static fn ($c) => $c['name'], $result->cookies);
        self::assertContains('showad_token', $names);
        self::assertContains('showad_creator', $names);
        self::assertContains('showad_ticket', $names);
        self::assertContains('showad_verified', $names);
    }

    public function testTicketClaimWithMismatchedCreatorRedirectsToVideoAd(): void
    {
        $config = $this->makeConfig();
        $http = new FakeHttpClient();
        $http->pushJson(200, [
            'creator_hash' => 'creator-2',
            'ticket_id' => 'ticket-xyz',
            'token' => JwtFactory::make(['creator_hash' => 'creator-2', 'exp' => time() + 3600]),
        ]);

        $handler = new RequestHandler($config, $http);
        $request = $this->makeRequest([
            'query' => ['redirect_ticket' => 'ticket-xyz'],
            'fullUrl' => 'https://site.example.com/protected?redirect_ticket=ticket-xyz',
        ]);

        $result = $handler->protect($request);

        self::assertSame(MiddlewareResult::TYPE_REDIRECT, $result->type);
        self::assertStringStartsWith('https://showad.example.com/c/creator-1', (string) $result->redirectUrl);
    }

    public function testTicketGoneRedirectsToVideoAd(): void
    {
        $config = $this->makeConfig();
        $http = new FakeHttpClient();
        $http->pushResponse(new HttpResponse(410, '{"message":"gone"}'));

        $handler = new RequestHandler($config, $http);
        $request = $this->makeRequest([
            'query' => ['redirect_ticket' => 'ticket-old'],
            'fullUrl' => 'https://site.example.com/protected?redirect_ticket=ticket-old',
        ]);

        $result = $handler->protect($request);
        self::assertSame(MiddlewareResult::TYPE_REDIRECT, $result->type);
    }

    public function testCrawlerCidrBypassAllowsWithoutBackendCall(): void
    {
        $config = $this->makeConfig([
            'access_policy' => [
                'crawler' => [
                    'enabled' => true,
                    'family_cidrs' => [
                        'google' => ['66.249.64.0/19'],
                    ],
                ],
            ],
        ]);
        $http = new FakeHttpClient();
        $handler = new RequestHandler($config, $http);

        $request = $this->makeRequest([
            'ip' => '66.249.64.50',
            'headers' => ['user-agent' => 'Mozilla/5.0 (compatible; Googlebot/2.1)'],
        ]);

        $result = $handler->protect($request);

        self::assertTrue($result->isAllow());
        self::assertSame('crawler:google', $result->reason);
        self::assertCount(0, $http->calls);
    }

    public function testCidrAllowlistBypassesProtection(): void
    {
        $config = $this->makeConfig([
            'access_policy' => [
                'allow_cidrs' => ['10.0.0.0/24'],
            ],
        ]);
        $http = new FakeHttpClient();
        $handler = new RequestHandler($config, $http);

        $request = $this->makeRequest(['ip' => '10.0.0.5']);
        $result = $handler->protect($request);

        self::assertTrue($result->isAllow());
        self::assertSame('cidr_allowlist', $result->reason);
    }

    public function testExcludedPathSkipsProtection(): void
    {
        $config = $this->makeConfig(['excluded_paths' => ['/health', '/api/*']]);
        $http = new FakeHttpClient();
        $handler = new RequestHandler($config, $http);

        $result = $handler->protect($this->makeRequest(['path' => '/api/public/ping']));

        self::assertTrue($result->isAllow());
        self::assertSame('excluded_path', $result->reason);
    }

    public function testNonProtectedPathPassesThroughWhenWhitelistConfigured(): void
    {
        $config = $this->makeConfig(['protected_paths' => ['/premium/*']]);
        $http = new FakeHttpClient();
        $handler = new RequestHandler($config, $http);

        $result = $handler->protect($this->makeRequest(['path' => '/blog/post-1']));

        self::assertTrue($result->isAllow());
        self::assertSame('unprotected_path', $result->reason);
    }

    public function testCookieJarBuildsExpectedCookies(): void
    {
        $config = $this->makeConfig();
        $jar = new CookieJar($config);

        $token = JwtFactory::make(['creator_hash' => 'creator-1', 'exp' => time() + 1800]);
        $cookies = $jar->buildVerificationCookies([
            'token' => $token,
            'creator_hash' => 'creator-1',
            'ticket_id' => 'ticket-1',
        ], false);

        $byName = [];
        foreach ($cookies as $cookie) {
            $byName[$cookie['name']] = $cookie;
        }

        self::assertArrayHasKey('showad_token', $byName);
        self::assertArrayHasKey('showad_verified', $byName);
        self::assertArrayHasKey('showad_creator', $byName);
        self::assertArrayHasKey('showad_ticket', $byName);
        self::assertArrayHasKey('showad_expires', $byName);

        self::assertTrue($byName['showad_token']['options']['httponly']);
        self::assertFalse($byName['showad_verified']['options']['httponly']);
        self::assertSame('1', $byName['showad_verified']['value']);
    }
}
