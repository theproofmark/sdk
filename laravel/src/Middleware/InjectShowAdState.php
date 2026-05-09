<?php

namespace ProofMark\ShowAd\Middleware;

use Closure;
use Illuminate\Http\Request;
use ProofMark\ShowAd\ShowAdManager;

/**
 * Middleware that injects ShowAd verification state into the request.
 *
 * This does NOT enforce verification - it only reads state.
 * Useful for pages that show different content based on verification
 * but don't block access entirely.
 *
 * Usage:
 *   Route::middleware('showad.inject')->group(function () { ... });
 *
 * Access in controllers:
 *   $state = $request->attributes->get('showad');
 *   $isVerified = $state['is_verified'];
 */
class InjectShowAdState
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
     * @return mixed
     */
    public function handle(Request $request, Closure $next)
    {
        $state = $this->manager->getVerificationState($request);

        // Attach to request attributes (accessible in controllers/views)
        $request->attributes->set('showad', $state);

        // Also share with views if not using Inertia
        view()->share('showad', $state);

        return $next($request);
    }
}
