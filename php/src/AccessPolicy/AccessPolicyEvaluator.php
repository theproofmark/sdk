<?php

declare(strict_types=1);

namespace ProofMark\ShowAd\AccessPolicy;

use Closure;
use ProofMark\ShowAd\Request\RequestContext;

/**
 * Server-only access policy that runs before ShowAd verification.
 *
 * Pipeline (in order):
 *   1. Verified crawler (UA + trusted IP range OR Cloudflare verified-bot OR rDNS)
 *   2. CIDR allowlist resolved from a trusted IP header
 *   3. Publisher-defined `before_protect` callback (premium users, app sessions, ...)
 *
 * UA detection alone is NEVER sufficient to allow access. It only narrows
 * which IP/rDNS rules to apply for the matching family.
 *
 * This is the framework-agnostic counterpart to the Laravel SDK's evaluator.
 * Behaviour is byte-for-byte equivalent on the wire.
 */
final class AccessPolicyEvaluator
{
    /**
     * Default crawler user-agent fragments per family.
     *
     * @var array<string, array<int, string>>
     */
    public const DEFAULT_CRAWLER_USER_AGENTS = [
        'google' => ['googlebot', 'google-inspectiontool', 'apis-google'],
        'bing' => ['bingbot'],
        'duckduckgo' => ['duckduckbot'],
        'yandex' => ['yandexbot'],
        'baidu' => ['baiduspider'],
        'openai' => ['gptbot', 'chatgpt-user', 'oai-searchbot'],
        'anthropic' => ['claudebot', 'anthropic-ai'],
        'perplexity' => ['perplexitybot'],
        'commoncrawl' => ['ccbot'],
        'facebook' => ['facebookexternalhit', 'facebot'],
        'twitter' => ['twitterbot'],
        'linkedin' => ['linkedinbot'],
    ];

    /**
     * Evaluate the access policy for a request.
     *
     * @param array<string, mixed> $config
     * @return array{action: string, reason?: string, redirect_url?: string}
     */
    public function evaluate(RequestContext $request, array $config): array
    {
        $clientIp = $this->resolveClientIp($request, $config['trusted_ip_headers'] ?? []);
        $userAgent = $request->userAgent();

        $crawler = $this->verifyCrawler(
            $clientIp,
            $userAgent,
            is_array($config['crawler'] ?? null) ? $config['crawler'] : [],
            $request
        );

        if ($crawler['verified']) {
            return [
                'action' => 'allow',
                'reason' => 'crawler:' . ($crawler['family'] ?? 'unknown'),
            ];
        }

        $cidrs = isset($config['allow_cidrs']) && is_array($config['allow_cidrs'])
            ? $config['allow_cidrs']
            : [];

        if ($clientIp !== null && $clientIp !== '' && $this->ipInCidrs($clientIp, $cidrs)) {
            return ['action' => 'allow', 'reason' => 'cidr_allowlist'];
        }

        $callback = $config['before_protect'] ?? null;
        if ($callback instanceof Closure) {
            $decision = $callback($request, [
                'client_ip' => $clientIp,
                'user_agent' => $userAgent,
            ]);
            return $this->normaliseDecision($decision);
        }

        return ['action' => 'continue'];
    }

    /**
     * Resolve the client IP from a configured list of trusted edge headers,
     * falling back to the request-level remote address.
     *
     * @param array<int, string> $trustedIpHeaders
     */
    public function resolveClientIp(RequestContext $request, array $trustedIpHeaders): ?string
    {
        foreach ($trustedIpHeaders as $header) {
            $value = $request->header((string) $header);
            if ($value === null || $value === '') {
                continue;
            }
            $first = trim(explode(',', $value)[0]);
            if ($first !== '') {
                return $first;
            }
        }

        $ip = $request->ip;
        return $ip === '' ? null : $ip;
    }

    /**
     * Verify a crawler request by combining a known user-agent family with
     * trusted IP-range or rDNS evidence.
     *
     * @param array<string, mixed> $crawlerConfig
     * @return array{verified: bool, reason: string, family?: string}
     */
    public function verifyCrawler(?string $ip, string $userAgent, array $crawlerConfig, ?RequestContext $request = null): array
    {
        if (empty($crawlerConfig['enabled'])) {
            return ['verified' => false, 'reason' => 'disabled'];
        }

        $families = isset($crawlerConfig['families']) && is_array($crawlerConfig['families'])
            ? $crawlerConfig['families']
            : array_keys(self::DEFAULT_CRAWLER_USER_AGENTS);

        $userAgents = isset($crawlerConfig['user_agents']) && is_array($crawlerConfig['user_agents'])
            ? $crawlerConfig['user_agents']
            : self::DEFAULT_CRAWLER_USER_AGENTS;

        $family = $this->matchCrawlerFamily($userAgent, $families, $userAgents);
        if ($family === null) {
            return ['verified' => false, 'reason' => 'no_family_match'];
        }

        if ($ip === null || $ip === '') {
            return ['verified' => false, 'reason' => 'missing_ip', 'family' => $family];
        }

        if (!empty($crawlerConfig['allow_cloudflare_verified_bot']) && $request !== null) {
            $verifiedBot = $request->header('cf-verified-bot')
                ?? $request->header('x-proofmark-cf-verified-bot');
            if ($verifiedBot !== null && in_array(strtolower($verifiedBot), ['1', 'true', 'yes', 'on'], true)) {
                return ['verified' => true, 'reason' => 'cloudflare_verified_bot', 'family' => $family];
            }
        }

        $cidrs = [];
        if (isset($crawlerConfig['family_cidrs'][$family]) && is_array($crawlerConfig['family_cidrs'][$family])) {
            $cidrs = $crawlerConfig['family_cidrs'][$family];
        }
        if ($this->ipInCidrs($ip, $cidrs)) {
            return ['verified' => true, 'reason' => 'cidr_match', 'family' => $family];
        }

        $verifier = $crawlerConfig['reverse_dns_verifier'] ?? null;
        if ($verifier instanceof Closure && $verifier($ip, $family)) {
            return ['verified' => true, 'reason' => 'reverse_dns_match', 'family' => $family];
        }

        return ['verified' => false, 'reason' => 'ip_not_verified', 'family' => $family];
    }

    /**
     * @param array<int, string> $cidrs
     */
    public function ipInCidrs(string $ip, array $cidrs): bool
    {
        foreach ($cidrs as $cidr) {
            if ($this->ipMatchesCidr($ip, (string) $cidr)) {
                return true;
            }
        }
        return false;
    }

    /**
     * @param array<int, string> $families
     * @param array<string, array<int, string>> $userAgentMap
     */
    private function matchCrawlerFamily(string $userAgent, array $families, array $userAgentMap): ?string
    {
        $needle = strtolower($userAgent);
        if ($needle === '') {
            return null;
        }

        foreach ($families as $family) {
            $family = (string) $family;
            $fragments = $userAgentMap[$family] ?? [];
            foreach ($fragments as $fragment) {
                $fragment = (string) $fragment;
                if ($fragment !== '' && strpos($needle, strtolower($fragment)) !== false) {
                    return $family;
                }
            }
        }
        return null;
    }

    /**
     * @param mixed $decision
     * @return array{action: string, reason?: string, redirect_url?: string}
     */
    private function normaliseDecision($decision): array
    {
        if (is_string($decision)) {
            return ['action' => $decision];
        }
        if (is_array($decision) && isset($decision['action'])) {
            return $decision;
        }
        return ['action' => 'continue'];
    }

    private function ipMatchesCidr(string $ip, string $cidr): bool
    {
        if (strpos($cidr, '/') === false) {
            $a = @inet_pton($ip);
            $b = @inet_pton($cidr);
            return $a !== false && $b !== false && $a === $b;
        }

        [$range, $bits] = explode('/', $cidr, 2);
        if (!is_numeric($bits)) {
            return false;
        }

        $rangeBin = @inet_pton($range);
        $ipBin = @inet_pton($ip);
        if ($rangeBin === false || $ipBin === false || strlen($rangeBin) !== strlen($ipBin)) {
            return false;
        }

        $bits = (int) $bits;
        $maxBits = strlen($ipBin) * 8;
        if ($bits < 0 || $bits > $maxBits) {
            return false;
        }

        $bytes = intdiv($bits, 8);
        $remainder = $bits % 8;

        if ($bytes > 0 && substr($rangeBin, 0, $bytes) !== substr($ipBin, 0, $bytes)) {
            return false;
        }

        if ($remainder === 0) {
            return true;
        }

        $mask = chr((0xFF << (8 - $remainder)) & 0xFF);
        return (substr($rangeBin, $bytes, 1) & $mask) === (substr($ipBin, $bytes, 1) & $mask);
    }
}
