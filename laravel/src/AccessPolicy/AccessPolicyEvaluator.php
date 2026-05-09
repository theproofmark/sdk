<?php

namespace ProofMark\ShowAd\AccessPolicy;

use Closure;
use Illuminate\Http\Request;

/**
 * Server-only access policy that runs before ShowAd verification.
 *
 * Pipeline (in order):
 *   1. Verified crawler (UA + trusted IP range OR Cloudflare verified bot OR rDNS)
 *   2. CIDR allowlist resolved from a trusted IP header
 *   3. Publisher-defined `before_protect` callback (premium users, app sessions, ...)
 *
 * The middleware translates a non-`continue` decision into either allowing the
 * request through or short-circuiting with a redirect/abort response.
 */
class AccessPolicyEvaluator
{
    /**
     * Default crawler user-agent fragments per family. UA detection alone is
     * never sufficient to allow access; it only narrows which IP/rDNS rules to
     * apply.
     *
     * @var array<string, string[]>
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
     * @return array{action: string, reason?: string, redirect_url?: string}
     */
    public function evaluate(Request $request, array $config): array
    {
        $clientIp = $this->resolveClientIp($request, $config['trusted_ip_headers'] ?? []);
        $userAgent = (string) $request->userAgent();

        $crawler = $this->verifyCrawler(
            $clientIp,
            $userAgent,
            $config['crawler'] ?? [],
            $request
        );

        if ($crawler['verified']) {
            return [
                'action' => 'allow',
                'reason' => 'crawler:' . ($crawler['family'] ?? 'unknown'),
            ];
        }

        if ($clientIp && $this->ipInCidrs($clientIp, $config['allow_cidrs'] ?? [])) {
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
     * falling back to the framework-resolved IP.
     */
    public function resolveClientIp(Request $request, array $trustedIpHeaders): ?string
    {
        foreach ($trustedIpHeaders as $header) {
            $value = $request->headers->get($header);
            if ($value === null || $value === '') {
                continue;
            }

            $first = trim(explode(',', $value)[0]);
            if ($first !== '') {
                return $first;
            }
        }

        return $request->ip();
    }

    /**
     * Verify a crawler request by combining a known user-agent family with
     * trusted IP-range or rDNS evidence. Returns the family on a verified hit.
     *
     * @return array{verified: bool, reason: string, family?: string}
     */
    public function verifyCrawler(?string $ip, string $userAgent, array $crawlerConfig, ?Request $request = null): array
    {
        if (empty($crawlerConfig['enabled'])) {
            return ['verified' => false, 'reason' => 'disabled'];
        }

        $families = $crawlerConfig['families'] ?? array_keys(self::DEFAULT_CRAWLER_USER_AGENTS);
        $userAgents = $crawlerConfig['user_agents'] ?? self::DEFAULT_CRAWLER_USER_AGENTS;

        $family = $this->matchCrawlerFamily($userAgent, $families, $userAgents);
        if ($family === null) {
            return ['verified' => false, 'reason' => 'no_family_match'];
        }

        if ($ip === null || $ip === '') {
            return ['verified' => false, 'reason' => 'missing_ip', 'family' => $family];
        }

        if (!empty($crawlerConfig['allow_cloudflare_verified_bot']) && $request) {
            $verifiedBot = $request->headers->get('CF-Verified-Bot')
                ?? $request->headers->get('X-ProofMark-CF-Verified-Bot');
            if (in_array(strtolower((string) $verifiedBot), ['1', 'true', 'yes', 'on'], true)) {
                return ['verified' => true, 'reason' => 'cloudflare_verified_bot', 'family' => $family];
            }
        }

        $cidrs = $crawlerConfig['family_cidrs'][$family] ?? [];
        if ($this->ipInCidrs($ip, $cidrs)) {
            return ['verified' => true, 'reason' => 'cidr_match', 'family' => $family];
        }

        $verifier = $crawlerConfig['reverse_dns_verifier'] ?? null;
        if ($verifier instanceof Closure && $verifier($ip, $family)) {
            return ['verified' => true, 'reason' => 'reverse_dns_match', 'family' => $family];
        }

        return ['verified' => false, 'reason' => 'ip_not_verified', 'family' => $family];
    }

    public function ipInCidrs(string $ip, array $cidrs): bool
    {
        foreach ($cidrs as $cidr) {
            if ($this->ipMatchesCidr($ip, $cidr)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param string[] $families
     * @param array<string, string[]> $userAgentMap
     */
    protected function matchCrawlerFamily(string $userAgent, array $families, array $userAgentMap): ?string
    {
        $needle = strtolower($userAgent);
        if ($needle === '') {
            return null;
        }

        foreach ($families as $family) {
            foreach ($userAgentMap[$family] ?? [] as $fragment) {
                if ($fragment !== '' && strpos($needle, strtolower($fragment)) !== false) {
                    return $family;
                }
            }
        }

        return null;
    }

    /**
     * @param array{action?: string, reason?: string, redirect_url?: string}|string $decision
     * @return array{action: string, reason?: string, redirect_url?: string}
     */
    protected function normaliseDecision($decision): array
    {
        if (is_string($decision)) {
            return ['action' => $decision];
        }

        if (is_array($decision) && isset($decision['action'])) {
            return $decision;
        }

        return ['action' => 'continue'];
    }

    protected function ipMatchesCidr(string $ip, string $cidr): bool
    {
        if (strpos($cidr, '/') === false) {
            return inet_pton($ip) === inet_pton($cidr);
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
