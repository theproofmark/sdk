<?php

declare(strict_types=1);

namespace ProofMark\ShowAd\Tests;

use PHPUnit\Framework\TestCase;
use ProofMark\ShowAd\AccessPolicy\AccessPolicyEvaluator;
use ProofMark\ShowAd\Request\RequestContext;

final class AccessPolicyEvaluatorTest extends TestCase
{
    private function makeRequest(string $ua = '', string $ip = '127.0.0.1', array $headers = []): RequestContext
    {
        $headers = array_merge(['user-agent' => $ua], $headers);
        return new RequestContext(
            'GET',
            '/protected',
            [],
            $headers,
            [],
            $ip,
            'https://example.com/protected'
        );
    }

    public function testAllowsCidrAllowlist(): void
    {
        $evaluator = new AccessPolicyEvaluator();
        $request = $this->makeRequest('Mozilla/5.0', '10.0.0.5');
        $decision = $evaluator->evaluate($request, [
            'allow_cidrs' => ['10.0.0.0/24'],
        ]);

        self::assertSame('allow', $decision['action']);
        self::assertSame('cidr_allowlist', $decision['reason']);
    }

    public function testAllowsIpv6CidrAllowlist(): void
    {
        $evaluator = new AccessPolicyEvaluator();
        $request = $this->makeRequest('Mozilla/5.0', '2001:db8::1');
        $decision = $evaluator->evaluate($request, [
            'allow_cidrs' => ['2001:db8::/32'],
        ]);

        self::assertSame('allow', $decision['action']);
    }

    public function testCrawlerUaAloneNeverAllows(): void
    {
        $evaluator = new AccessPolicyEvaluator();
        $request = $this->makeRequest(
            'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            '203.0.113.5'
        );

        $decision = $evaluator->evaluate($request, [
            'crawler' => [
                'enabled' => true,
                'family_cidrs' => [
                    'google' => ['66.249.64.0/19'],
                ],
            ],
        ]);

        self::assertSame('continue', $decision['action']);
    }

    public function testCrawlerVerifiedByCidr(): void
    {
        $evaluator = new AccessPolicyEvaluator();
        $request = $this->makeRequest(
            'Mozilla/5.0 (compatible; Googlebot/2.1)',
            '66.249.64.50'
        );

        $decision = $evaluator->evaluate($request, [
            'crawler' => [
                'enabled' => true,
                'family_cidrs' => [
                    'google' => ['66.249.64.0/19'],
                ],
            ],
        ]);

        self::assertSame('allow', $decision['action']);
        self::assertSame('crawler:google', $decision['reason']);
    }

    public function testCrawlerVerifiedByCloudflareHeader(): void
    {
        $evaluator = new AccessPolicyEvaluator();
        $request = $this->makeRequest(
            'Mozilla/5.0 (compatible; bingbot/2.0)',
            '8.8.8.8',
            ['cf-verified-bot' => 'true']
        );

        $decision = $evaluator->evaluate($request, [
            'crawler' => [
                'enabled' => true,
                'allow_cloudflare_verified_bot' => true,
                'family_cidrs' => [],
            ],
        ]);

        self::assertSame('allow', $decision['action']);
        self::assertSame('crawler:bing', $decision['reason']);
    }

    public function testTrustedIpHeaderTakesPriority(): void
    {
        $evaluator = new AccessPolicyEvaluator();
        $request = $this->makeRequest(
            'Mozilla/5.0',
            '127.0.0.1',
            ['x-forwarded-for' => '198.51.100.42, 10.0.0.1']
        );

        $resolved = $evaluator->resolveClientIp($request, ['X-Forwarded-For']);
        self::assertSame('198.51.100.42', $resolved);
    }

    public function testBeforeProtectCallbackCanRedirect(): void
    {
        $evaluator = new AccessPolicyEvaluator();
        $request = $this->makeRequest('Mozilla/5.0', '127.0.0.1');
        $decision = $evaluator->evaluate($request, [
            'before_protect' => static function () {
                return ['action' => 'redirect', 'redirect_url' => 'https://other.example.com'];
            },
        ]);

        self::assertSame('redirect', $decision['action']);
        self::assertSame('https://other.example.com', $decision['redirect_url']);
    }

    public function testBeforeProtectCallbackCanAllow(): void
    {
        $evaluator = new AccessPolicyEvaluator();
        $request = $this->makeRequest('Mozilla/5.0', '127.0.0.1');
        $decision = $evaluator->evaluate($request, [
            'before_protect' => static function () {
                return ['action' => 'allow', 'reason' => 'premium_user'];
            },
        ]);

        self::assertSame('allow', $decision['action']);
        self::assertSame('premium_user', $decision['reason']);
    }

    public function testIpInCidrsHandlesSingleIp(): void
    {
        $evaluator = new AccessPolicyEvaluator();
        self::assertTrue($evaluator->ipInCidrs('192.0.2.5', ['192.0.2.5']));
        self::assertFalse($evaluator->ipInCidrs('192.0.2.6', ['192.0.2.5']));
    }
}
