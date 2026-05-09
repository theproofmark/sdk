<?php

namespace ProofMark\ShowAd\Middleware;

use Closure;
use Illuminate\Http\Request;
use ProofMark\ShowAd\ShowAdManager;

/**
 * Middleware that automatically protects paths based on config.
 *
 * Instead of applying middleware to individual routes, register this
 * as a global middleware and it will check paths against the
 * 'showad.protected_paths' and 'showad.excluded_paths' config.
 *
 * Usage in Kernel.php:
 *   protected $middleware = [
 *       \ProofMark\ShowAd\Middleware\ShowAdGlobalProtect::class,
 *   ];
 */
class ShowAdGlobalProtect
{
    /**
     * @var ShowAdManager
     */
    protected $manager;

    /**
     * @var VerifyShowAd
     */
    protected $verifier;

    /**
     * Create a new middleware instance.
     *
     * @param ShowAdManager $manager
     * @param VerifyShowAd $verifier
     */
    public function __construct(ShowAdManager $manager, VerifyShowAd $verifier)
    {
        $this->manager = $manager;
        $this->verifier = $verifier;
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
        $path = '/' . ltrim($request->path(), '/');
        $protectedPaths = config('showad.protected_paths', []);
        $excludedPaths = config('showad.excluded_paths', []);

        // Skip if no protected paths configured
        if (empty($protectedPaths)) {
            return $next($request);
        }

        // Skip excluded paths
        if ($this->manager->pathMatchesAny($path, $excludedPaths)) {
            return $next($request);
        }

        // Only intercept if path matches protected patterns
        if (!$this->manager->pathMatchesAny($path, $protectedPaths)) {
            return $next($request);
        }

        // Delegate to the main verification middleware
        return $this->verifier->handle($request, $next);
    }
}
