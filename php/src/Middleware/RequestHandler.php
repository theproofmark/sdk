<?php

declare(strict_types=1);

namespace ProofMark\ShowAd\Middleware;

use ProofMark\ShowAd\AccessPolicy\AccessPolicyEvaluator;
use ProofMark\ShowAd\Config;
use ProofMark\ShowAd\Cookies\CookieJar;
use ProofMark\ShowAd\Http\HttpClient;
use ProofMark\ShowAd\Http\HttpClientException;
use ProofMark\ShowAd\Jwt\JwtHelper;
use ProofMark\ShowAd\Request\RequestContext;
use ProofMark\ShowAd\ShowAdException;

/**
 * Main entry point for the SDK middleware logic.
 *
 * Applies the protocol contract step-for-step:
 *   1. Skip excluded paths.
 *   2. If protected_paths is configured, only protect matching paths.
 *   3. Run access policy (verified crawler, CIDR allowlist, before_protect).
 *   4. If `?redirect_ticket=` is present, claim the ticket and redirect to a
 *      clean URL with verification cookies attached.
 *   5. If a valid token cookie is present, allow (refreshing cookies if any
 *      derived state is stale).
 *   6. Otherwise, redirect to the video ad.
 */
final class RequestHandler
{
    private Config $config;
    private HttpClient $httpClient;
    private CookieJar $cookieJar;
    private Verifier $verifier;
    private AccessPolicyEvaluator $accessPolicy;

    public function __construct(
        Config $config,
        HttpClient $httpClient,
        ?CookieJar $cookieJar = null,
        ?Verifier $verifier = null,
        ?AccessPolicyEvaluator $accessPolicy = null
    ) {
        $this->config = $config;
        $this->httpClient = $httpClient;
        $this->cookieJar = $cookieJar ?? new CookieJar($config);
        $this->verifier = $verifier ?? new Verifier($config, $this->cookieJar);
        $this->accessPolicy = $accessPolicy ?? new AccessPolicyEvaluator();
    }

    /**
     * Run the protect pipeline against a normalised request context.
     */
    public function protect(RequestContext $request): MiddlewareResult
    {
        $path = $request->path;

        if ($this->pathMatchesAny($path, $this->config->excludedPaths())) {
            return MiddlewareResult::allow([], 'excluded_path');
        }

        $protectedPaths = $this->config->protectedPaths();
        if (!empty($protectedPaths) && !$this->pathMatchesAny($path, $protectedPaths)) {
            return MiddlewareResult::allow([], 'unprotected_path');
        }

        $policyConfig = $this->config->accessPolicy();
        if (!empty($policyConfig)) {
            $decision = $this->accessPolicy->evaluate($request, $policyConfig);
            $action = $decision['action'] ?? 'continue';
            if ($action === 'allow') {
                return MiddlewareResult::allow([], $decision['reason'] ?? 'access_policy_allow');
            }
            if ($action === 'redirect') {
                $target = $decision['redirect_url'] ?? $this->buildVideoAdRedirectUrl($request->fullUrl);
                return MiddlewareResult::redirect(
                    $target,
                    $this->cookieJar->buildClearCookies($request->isHttps()),
                    302,
                    [],
                    $decision['reason'] ?? 'access_policy_redirect'
                );
            }
        }

        $redirectTicket = $request->query('redirect_ticket');
        if ($redirectTicket !== null && $redirectTicket !== '') {
            return $this->handleRedirectTicket($request, $redirectTicket);
        }

        $existingToken = $request->cookie($this->cookieJar->name(CookieJar::COOKIE_TOKEN));
        if ($existingToken !== null && $existingToken !== '') {
            return $this->handleExistingToken($request, $existingToken);
        }

        return $this->redirectToVideoAd($request);
    }

    /**
     * Claim a redirect ticket via the backend, returning a TICKET_CLAIMED
     * result with verification cookies and a cleaned URL on success.
     */
    public function claimRedirectTicket(string $ticketId): array
    {
        $this->assertRequired(['creator_hash', 'api_key', 'redirect_secret']);

        $url = $this->config->apiBaseUrl() . '/api/redirect-ticket/' . rawurlencode($ticketId) . '/claim';

        try {
            $response = $this->httpClient->post(
                $url,
                [
                    'Content-Type' => 'application/json',
                    'Accept' => 'application/json',
                    'X-Redirect-Ticket-Secret' => $this->config->redirectSecret(),
                    'X-ShowAd-API-Key' => $this->config->apiKey(),
                    'X-ShowAd-Creator-Hash' => $this->config->creatorHash(),
                ],
                (string) json_encode(['creator_hash' => $this->config->creatorHash()], JSON_UNESCAPED_SLASHES)
            );
        } catch (HttpClientException $e) {
            throw new ShowAdException(
                'Failed to claim redirect ticket: ' . $e->getMessage(),
                ShowAdException::NETWORK_ERROR,
                $e
            );
        }

        if ($response->status === 410) {
            throw new ShowAdException(
                'Redirect ticket not found or already consumed',
                ShowAdException::TICKET_NOT_FOUND
            );
        }
        if ($response->status === 401) {
            throw new ShowAdException(
                'Invalid redirect ticket secret',
                ShowAdException::TICKET_CLAIM_FAILED
            );
        }
        if ($response->status === 403) {
            throw new ShowAdException(
                'Creator hash does not match ticket',
                ShowAdException::CREATOR_MISMATCH
            );
        }
        if (!$response->isSuccess()) {
            throw new ShowAdException(
                'Ticket claim failed with status ' . $response->status,
                ShowAdException::TICKET_CLAIM_FAILED,
                null,
                ['status' => $response->status, 'body' => $response->body]
            );
        }

        $data = $response->json();
        if ($data === null || empty($data['token']) || empty($data['creator_hash'])) {
            throw new ShowAdException(
                'Invalid ticket claim response from ShowAd backend',
                ShowAdException::TICKET_CLAIM_FAILED,
                null,
                ['body' => $response->body]
            );
        }

        return $data;
    }

    /**
     * Validate a token directly with the backend (rarely needed - JWT decode
     * is sufficient for most flows).
     *
     * @return array<string, mixed>
     */
    public function validateToken(string $token): array
    {
        $this->assertRequired(['creator_hash', 'api_key']);

        $url = $this->config->apiBaseUrl() . '/api/sdk/validate';

        try {
            $response = $this->httpClient->post(
                $url,
                [
                    'Content-Type' => 'application/json',
                    'Accept' => 'application/json',
                    'X-ShowAd-API-Key' => $this->config->apiKey(),
                    'X-ShowAd-Creator-Hash' => $this->config->creatorHash(),
                ],
                (string) json_encode([
                    'token' => $token,
                    'sdk_key' => $this->config->apiKey(),
                ], JSON_UNESCAPED_SLASHES)
            );
        } catch (HttpClientException $e) {
            throw new ShowAdException(
                'Failed to validate token: ' . $e->getMessage(),
                ShowAdException::NETWORK_ERROR,
                $e
            );
        }

        if (!$response->isSuccess()) {
            throw new ShowAdException(
                'Token validation failed with status ' . $response->status,
                ShowAdException::TOKEN_INVALID,
                null,
                ['status' => $response->status, 'body' => $response->body]
            );
        }

        $data = $response->json();
        if ($data === null) {
            throw new ShowAdException(
                'Invalid token validation response from ShowAd backend',
                ShowAdException::TOKEN_INVALID
            );
        }

        if (empty($data['valid'])) {
            throw new ShowAdException(
                isset($data['message']) ? (string) $data['message'] : 'Token is invalid',
                ShowAdException::TOKEN_INVALID,
                null,
                ['response' => $data]
            );
        }

        return $data;
    }

    public function buildVideoAdRedirectUrl(?string $returnUrl = null): string
    {
        $url = $this->config->videoAdUrl() . '/c/' . rawurlencode($this->config->creatorHash());
        $params = ['sdk' => '1'];
        if ($returnUrl !== null && $returnUrl !== '') {
            $params['return_url'] = $returnUrl;
        }

        // http_build_query encodes unreserved chars correctly for application/x-www-form-urlencoded
        return $url . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
    }

    public function pathMatches(string $path, string $pattern): bool
    {
        $path = '/' . ltrim($path, '/');
        $pattern = '/' . ltrim($pattern, '/');

        if ($path === $pattern) {
            return true;
        }
        if (strpos($pattern, '*') !== false) {
            $regex = preg_quote($pattern, '/');
            $regex = str_replace('\\*', '.*', $regex);
            return (bool) preg_match('/^' . $regex . '$/', $path);
        }
        return false;
    }

    /**
     * @param array<int, string> $patterns
     */
    public function pathMatchesAny(string $path, array $patterns): bool
    {
        foreach ($patterns as $pattern) {
            if ($this->pathMatches($path, (string) $pattern)) {
                return true;
            }
        }
        return false;
    }

    private function handleRedirectTicket(RequestContext $request, string $ticketId): MiddlewareResult
    {
        try {
            $claim = $this->claimRedirectTicket($ticketId);
        } catch (ShowAdException $e) {
            return $this->redirectToVideoAd($request);
        }

        $expectedCreator = $this->config->creatorHash();
        $claimedCreator = isset($claim['creator_hash']) ? (string) $claim['creator_hash'] : '';
        if ($claimedCreator === '' || $claimedCreator !== $expectedCreator) {
            return $this->redirectToVideoAd($request);
        }

        $cleanUrl = self::removeQueryParam($request->fullUrl, 'redirect_ticket');
        $cookies = $this->cookieJar->buildVerificationCookies(
            [
                'token' => $claim['token'],
                'creator_hash' => $claimedCreator,
                'ticket_id' => isset($claim['ticket_id']) ? (string) $claim['ticket_id'] : $ticketId,
            ],
            $request->isHttps()
        );

        return MiddlewareResult::ticketClaimed($cleanUrl, $cookies, 'ticket_claimed');
    }

    private function handleExistingToken(RequestContext $request, string $token): MiddlewareResult
    {
        $fingerprint = $request->cookie($this->cookieJar->name(CookieJar::COOKIE_FINGERPRINT));

        if (JwtHelper::isTokenExpired($token)) {
            return $this->redirectToVideoAd($request);
        }

        $validation = JwtHelper::validateTokenClaims($token, $this->config->creatorHash(), $fingerprint);
        if (!$validation['valid']) {
            return $this->redirectToVideoAd($request);
        }

        try {
            $this->validateToken($token);
        } catch (ShowAdException $e) {
            return $this->redirectToVideoAd($request);
        }

        $existingVerified = $request->cookie($this->cookieJar->name(CookieJar::COOKIE_VERIFIED));
        $storedCreator = $request->cookie($this->cookieJar->name(CookieJar::COOKIE_CREATOR));
        $existingExpires = $request->cookie($this->cookieJar->name(CookieJar::COOKIE_EXPIRES));
        $tokenExpiry = JwtHelper::getTokenExpiry($token);

        $needsRefresh = $existingVerified !== '1'
            || $storedCreator !== $this->config->creatorHash()
            || ($tokenExpiry !== null && $existingExpires !== (string) $tokenExpiry);

        if ($needsRefresh) {
            $ticketCookie = $request->cookie($this->cookieJar->name(CookieJar::COOKIE_TICKET));
            $cookies = $this->cookieJar->buildVerificationCookies(
                [
                    'token' => $token,
                    'creator_hash' => $this->config->creatorHash(),
                    'ticket_id' => $ticketCookie,
                ],
                $request->isHttps()
            );
            return MiddlewareResult::allow($cookies, 'token_valid_refreshed');
        }

        return MiddlewareResult::allow([], Verifier::REASON_VALID_TOKEN);
    }

    private function redirectToVideoAd(RequestContext $request): MiddlewareResult
    {
        $redirectUrl = $this->buildVideoAdRedirectUrl($request->fullUrl);
        return MiddlewareResult::redirect(
            $redirectUrl,
            $this->cookieJar->buildClearCookies($request->isHttps()),
            302,
            [
                'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
                'Pragma' => 'no-cache',
            ],
            'redirect_to_video_ad'
        );
    }

    /**
     * @param array<int, string> $keys
     */
    private function assertRequired(array $keys): void
    {
        foreach ($keys as $key) {
            $value = $this->config->get($key, '');
            if ($value === null || $value === '') {
                throw new ShowAdException(
                    'Missing required ShowAd configuration: ' . $key,
                    ShowAdException::CONFIG_ERROR,
                    null,
                    ['key' => $key]
                );
            }
        }
    }

    public static function removeQueryParam(string $url, string $param): string
    {
        $parsed = parse_url($url);
        if ($parsed === false) {
            return $url;
        }
        $query = [];
        if (isset($parsed['query'])) {
            parse_str((string) $parsed['query'], $query);
        }
        unset($query[$param]);

        $base = (isset($parsed['scheme']) ? $parsed['scheme'] . '://' : '')
            . ($parsed['host'] ?? '')
            . (isset($parsed['port']) ? ':' . $parsed['port'] : '')
            . ($parsed['path'] ?? '');

        if (!empty($query)) {
            $base .= '?' . http_build_query($query);
        }
        if (isset($parsed['fragment'])) {
            $base .= '#' . $parsed['fragment'];
        }

        return $base;
    }
}
