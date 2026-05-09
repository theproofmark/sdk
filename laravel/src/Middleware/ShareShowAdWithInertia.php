<?php

namespace ProofMark\ShowAd\Middleware;

use Closure;
use Illuminate\Http\Request;
use ProofMark\ShowAd\ShowAdManager;

/**
 * Middleware that shares ShowAd verification state with Inertia.js.
 *
 * Add this to your HandleInertiaRequests middleware's share() method,
 * or use this standalone middleware.
 *
 * Option 1 - Standalone middleware (add to web middleware group):
 *   \ProofMark\ShowAd\Middleware\ShareShowAdWithInertia::class
 *
 * Option 2 - Manual share in HandleInertiaRequests:
 *   public function share(Request $request) {
 *       return array_merge(parent::share($request), [
 *           'showad' => fn () => app('showad')->getVerificationState($request),
 *       ]);
 *   }
 */
class ShareShowAdWithInertia
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
        if (!config('showad.inertia.enabled', false)) {
            return $next($request);
        }

        if (!class_exists('Inertia\Inertia')) {
            return $next($request);
        }

        $shareKey = config('showad.inertia.share_key', 'showad');

        \Inertia\Inertia::share($shareKey, function () use ($request) {
            return $this->manager->getVerificationState($request);
        });

        return $next($request);
    }
}
