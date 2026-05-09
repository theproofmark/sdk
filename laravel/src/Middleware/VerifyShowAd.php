<?php

namespace ProofMark\ShowAd\Middleware;

use Closure;
use Illuminate\Http\Request;
use ProofMark\ShowAd\ShowAdManager;
use ProofMark\ShowAd\ShowAdException;
use ProofMark\ShowAd\JwtHelper;
use ProofMark\ShowAd\AccessPolicy\AccessPolicyEvaluator;

/**
 * Middleware that verifies ShowAd access.
 *
 * Flow:
 * 1. Check if path is excluded → allow
 * 2. Check if path is protected → continue verification
 * 3. Check for redirect_ticket in URL → claim token
 * 4. Check existing token in cookie → validate
 * 5. No verification → redirect to video ad
 *
 * Usage in routes:
 *   Route::middleware('showad.verify')->group(function () { ... });
 *
 * Or with custom paths:
 *   Route::middleware('showad.verify:premium/*,content/*')->group(function () { ... });
 */
class VerifyShowAd
{
    /**
     * @var ShowAdManager
     */
    protected $manager;

    /**
     * Create a new middleware instance.
     *
     * @param ShowAdManager $manager
     */
    public function __construct(ShowAdManager $manager)
    {
        $this->manager = $manager;
    }

    /**
     * Handle an incoming request.
     *
     * @param Request $request
     * @param Closure $next
     * @param string ...$guards Additional path patterns (optional)
     * @return mixed
     */
    public function handle(Request $request, Closure $next, ...$guards)
    {
        $path = '/' . ltrim($request->path(), '/');

        // Check excluded paths from config
        $excludedPaths = config('showad.excluded_paths', []);
        if ($this->manager->pathMatchesAny($path, $excludedPaths)) {
            return $next($request);
        }

        // If specific guards (paths) are passed as middleware parameters, check them
        // Otherwise, if applied to a route group, it protects all routes in the group
        if (!empty($guards)) {
            $shouldProtect = false;
            foreach ($guards as $guard) {
                if ($this->manager->pathMatches($path, $guard)) {
                    $shouldProtect = true;
                    break;
                }
            }
            if (!$shouldProtect) {
                return $next($request);
            }
        }

        $this->manager->debug('Processing protected path: ' . $path);

        $policyConfig = config('showad.access_policy', []);
        if (!empty($policyConfig)) {
            $evaluator = new AccessPolicyEvaluator();
            $decision = $evaluator->evaluate($request, $policyConfig);
            if (($decision['action'] ?? 'continue') === 'allow') {
                $this->manager->debug('Access policy bypass: ' . ($decision['reason'] ?? 'unknown'));
                return $next($request);
            }
            if (($decision['action'] ?? 'continue') === 'redirect') {
                $this->manager->debug('Access policy redirect: ' . ($decision['reason'] ?? 'unknown'));
                $target = $decision['redirect_url'] ?? $this->manager->buildVideoAdRedirectUrl($request->fullUrl());
                return redirect()->away($target);
            }
        }

        // Read cookies
        $fingerprint = $request->cookie($this->manager->getCookieName(ShowAdManager::COOKIE_FINGERPRINT));
        $existingToken = $request->cookie($this->manager->getCookieName(ShowAdManager::COOKIE_TOKEN));
        $storedCreator = $request->cookie($this->manager->getCookieName(ShowAdManager::COOKIE_CREATOR));
        $existingVerified = $request->cookie($this->manager->getCookieName(ShowAdManager::COOKIE_VERIFIED));
        $existingExpires = $request->cookie($this->manager->getCookieName(ShowAdManager::COOKIE_EXPIRES));

        // Check for redirect_ticket in URL (user returning from video ad)
        $redirectTicket = $request->query('redirect_ticket');

        if ($redirectTicket) {
            return $this->handleRedirectTicket(
                $request,
                $next,
                $redirectTicket,
                $fingerprint
            );
        }

        // No redirect ticket - check existing token
        if ($existingToken) {
            if (!$fingerprint) {
                $this->manager->debug('Token present without fingerprint - bootstrapping fingerprint collection');
                return $this->renderFingerprintBootstrap($request, $request->fullUrl());
            }

            return $this->handleExistingToken(
                $request,
                $next,
                $existingToken,
                $fingerprint,
                $existingVerified,
                $storedCreator,
                $existingExpires
            );
        }

        // No token and no redirect ticket - redirect to video ad
        if (!$fingerprint) {
            $this->manager->debug('No fingerprint found - bootstrapping fingerprint collection');
            return $this->renderFingerprintBootstrap(
                $request,
                $this->manager->buildVideoAdRedirectUrl($request->fullUrl())
            );
        }

        $this->manager->debug('No verification found - redirecting to video ad');
        return $this->redirectToVideoAd($request);
    }

    /**
     * Handle a redirect ticket from the video ad flow.
     *
     * @param Request $request
     * @param Closure $next
     * @param string $ticketId
     * @param string|null $fingerprint
     * @return mixed
     */
    protected function handleRedirectTicket(Request $request, Closure $next, $ticketId, $fingerprint)
    {
        $this->manager->debug('Found redirect ticket: ' . $ticketId);

        if (!$fingerprint) {
            $this->manager->debug('No fingerprint in cookie - bootstrapping fingerprint collection');
            return $this->renderFingerprintBootstrap($request, $request->fullUrl());
        }

        try {
            $claim = $this->manager->claimRedirectTicket($ticketId);

            if (empty($claim['token'])) {
                $this->manager->debug('Ticket claim missing token');
                return $this->redirectToVideoAd($request);
            }

            $this->manager->debug('Ticket claimed successfully');

            // Verify creator hash matches
            $expectedCreator = $this->manager->getConfig('creator_hash');
            if (empty($claim['creator_hash']) || $claim['creator_hash'] !== $expectedCreator) {
                $this->manager->debug('Creator hash mismatch');
                return $this->redirectToVideoAd($request);
            }

            // Build clean URL (remove redirect_ticket param)
            $cleanUrl = $this->removeQueryParam($request->fullUrl(), 'redirect_ticket');

            // Create redirect response with verification cookies
            $response = redirect($cleanUrl);

            $this->manager->setVerificationCookies($response, [
                'token' => isset($claim['token']) ? $claim['token'] : null,
                'creator_hash' => isset($claim['creator_hash']) ? $claim['creator_hash'] : $expectedCreator,
                'ticket_id' => isset($claim['ticket_id']) ? $claim['ticket_id'] : $ticketId,
            ]);

            $this->manager->debug('Token cookie set, redirecting to clean URL');
            return $response;
        } catch (ShowAdException $e) {
            $this->manager->debug('Ticket claim failed: ' . $e->getMessage());
            return $this->redirectToVideoAd($request);
        }
    }

    /**
     * Handle an existing token in cookies.
     *
     * @param Request $request
     * @param Closure $next
     * @param string $token
     * @param string|null $fingerprint
     * @param string|null $existingVerified
     * @param string|null $storedCreator
     * @param string|null $existingExpires
     * @return mixed
     */
    protected function handleExistingToken(
        Request $request,
        Closure $next,
        $token,
        $fingerprint,
        $existingVerified,
        $storedCreator,
        $existingExpires
    ) {
        $this->manager->debug('Checking existing token');

        // Check token expiry
        if (JwtHelper::isTokenExpired($token)) {
            $this->manager->debug('Token expired');
            return $this->redirectToVideoAd($request);
        }

        // Validate token claims
        $validation = JwtHelper::validateTokenClaims(
            $token,
            $this->manager->getConfig('creator_hash'),
            $fingerprint
        );

        if (!$validation['valid']) {
            $this->manager->debug('Token validation failed: ' . $validation['reason']);
            return $this->redirectToVideoAd($request);
        }

        try {
            $backendValidation = $this->manager->validateToken($token);
        } catch (ShowAdException $e) {
            $this->manager->debug('Backend token validation failed: ' . $e->getMessage());
            return $this->redirectToVideoAd($request);
        }

        if (empty($backendValidation['valid'])) {
            $this->manager->debug('Backend token validation rejected token');
            return $this->redirectToVideoAd($request);
        }

        $this->manager->debug('Token valid - allowing access');

        // Check if cookies need refreshing
        $tokenExpiry = JwtHelper::getTokenExpiry($token);
        $expectedCreator = $this->manager->getConfig('creator_hash');

        if (
            $existingVerified !== '1' ||
            $storedCreator !== $expectedCreator ||
            ($tokenExpiry !== null && $existingExpires !== (string) $tokenExpiry)
        ) {
            $response = $next($request);

            $ticketCookie = $request->cookie(
                $this->manager->getCookieName(ShowAdManager::COOKIE_TICKET)
            );

            $this->manager->setVerificationCookies($response, [
                'token' => $token,
                'creator_hash' => $expectedCreator,
                'ticket_id' => $ticketCookie,
            ]);

            return $response;
        }

        return $next($request);
    }

    /**
     * Redirect to the video ad page.
     *
     * @param Request $request
     * @return \Illuminate\Http\RedirectResponse
     */
    protected function redirectToVideoAd(Request $request)
    {
        $returnUrl = $request->fullUrl();
        $redirectUrl = $this->manager->buildVideoAdRedirectUrl($returnUrl);

        $response = redirect()->away($redirectUrl);
        $this->manager->clearVerificationCookies($response);

        return $response;
    }

    /**
     * Render a small bootstrap page that collects fingerprint data before continuing.
     *
     * @param Request $request
     * @param string $targetUrl
     * @return \Illuminate\Http\Response
     */
    protected function renderFingerprintBootstrap(Request $request, $targetUrl)
    {
        $response = response()->view('showad::bootstrap', [
            'targetUrl' => $targetUrl,
            'cookiePrefix' => $this->manager->getConfig('cookie.prefix', 'showad'),
            'debug' => $this->resolveDebug(),
        ]);

        $response->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        $response->header('Pragma', 'no-cache');
        $response->header('X-Robots-Tag', 'noindex, nofollow');

        return $response;
    }

    /**
     * Resolve the debug flag for the bootstrap view.
     *
     * @return bool
     */
    protected function resolveDebug()
    {
        $debug = $this->manager->getConfig('debug');

        if ($debug === null && function_exists('config')) {
            return (bool) config('app.debug', false);
        }

        return (bool) $debug;
    }

    /**
     * Remove a query parameter from a URL.
     *
     * @param string $url
     * @param string $param
     * @return string
     */
    protected function removeQueryParam($url, $param)
    {
        $parsed = parse_url($url);
        $query = [];

        if (isset($parsed['query'])) {
            parse_str($parsed['query'], $query);
        }

        unset($query[$param]);

        $base = (isset($parsed['scheme']) ? $parsed['scheme'] . '://' : '')
            . (isset($parsed['host']) ? $parsed['host'] : '')
            . (isset($parsed['port']) ? ':' . $parsed['port'] : '')
            . (isset($parsed['path']) ? $parsed['path'] : '');

        if (!empty($query)) {
            $base .= '?' . http_build_query($query);
        }

        if (isset($parsed['fragment'])) {
            $base .= '#' . $parsed['fragment'];
        }

        return $base;
    }
}
