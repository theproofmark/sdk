<?php

namespace ProofMark\ShowAd;

use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\Blade;
use Illuminate\Routing\Router;

class ShowAdServiceProvider extends ServiceProvider
{
    /**
     * Register any package services.
     *
     * @return void
     */
    public function register()
    {
        $this->mergeConfigFrom(__DIR__ . '/../config/showad.php', 'showad');

        $this->app->singleton(ShowAdManager::class, function ($app) {
            return new ShowAdManager(
                $app['config']->get('showad', [])
            );
        });

        $this->app->alias(ShowAdManager::class, 'showad');
    }

    /**
     * Bootstrap any package services.
     *
     * @return void
     */
    public function boot()
    {
        $this->publishes([
            __DIR__ . '/../config/showad.php' => config_path('showad.php'),
        ], 'showad-config');

        $this->loadViewsFrom(__DIR__ . '/../resources/views', 'showad');

        $this->publishes([
            __DIR__ . '/../resources/views' => resource_path('views/vendor/showad'),
        ], 'showad-views');

        $this->publishes([
            __DIR__ . '/../resources/js' => resource_path('js/vendor/showad'),
        ], 'showad-assets');

        $this->registerBladeDirectives();
        $this->registerMiddlewareAlias();
        $this->registerInertiaSharing();
    }

    /**
     * Register Blade directives.
     *
     * @return void
     */
    protected function registerBladeDirectives()
    {
        Blade::directive('showadVerified', function () {
            return '<?php if(app(\ProofMark\ShowAd\ShowAdManager::class)->isVerified(request())): ?>';
        });

        Blade::directive('endshowadVerified', function () {
            return '<?php endif; ?>';
        });

        Blade::directive('showadUnverified', function () {
            return '<?php if(!app(\ProofMark\ShowAd\ShowAdManager::class)->isVerified(request())): ?>';
        });

        Blade::directive('endshowadUnverified', function () {
            return '<?php endif; ?>';
        });

        Blade::directive('showadGate', function ($expression) {
            return '<?php if(app(\ProofMark\ShowAd\ShowAdManager::class)->isVerified(request())): ?>';
        });

        Blade::directive('elseshowadGate', function () {
            return '<?php else: ?>';
        });

        Blade::directive('endshowadGate', function () {
            return '<?php endif; ?>';
        });

        Blade::directive('showadRedirectUrl', function ($expression) {
            $expression = $expression ?: 'null';
            return "<?php echo e(app(\ProofMark\ShowAd\ShowAdManager::class)->buildVideoAdRedirectUrl({$expression})); ?>";
        });

        Blade::directive('showadMeta', function () {
            return '<?php echo app(\ProofMark\ShowAd\ShowAdManager::class)->renderMetaTags(); ?>';
        });

        Blade::directive('showadScripts', function () {
            return '<?php echo app(\ProofMark\ShowAd\ShowAdManager::class)->renderScripts(); ?>';
        });
    }

    /**
     * Register middleware alias.
     *
     * @return void
     */
    protected function registerMiddlewareAlias()
    {
        $router = $this->app->make(Router::class);

        // Use aliasMiddleware (available since Laravel 5.4)
        if (method_exists($router, 'aliasMiddleware')) {
            $router->aliasMiddleware('showad.verify', Middleware\VerifyShowAd::class);
            $router->aliasMiddleware('showad.inject', Middleware\InjectShowAdState::class);
            $router->aliasMiddleware('showad.inertia', Middleware\ShareShowAdWithInertia::class);
            $router->aliasMiddleware('showad.global', Middleware\ShowAdGlobalProtect::class);
        } else {
            $router->middleware('showad.verify', Middleware\VerifyShowAd::class);
            $router->middleware('showad.inject', Middleware\InjectShowAdState::class);
            $router->middleware('showad.inertia', Middleware\ShareShowAdWithInertia::class);
            $router->middleware('showad.global', Middleware\ShowAdGlobalProtect::class);
        }
    }

    /**
     * Register automatic Inertia shared data when enabled.
     *
     * @return void
     */
    protected function registerInertiaSharing()
    {
        if (!config('showad.inertia.enabled', false)) {
            return;
        }

        if (!class_exists('Inertia\\Inertia')) {
            return;
        }

        $shareKey = config('showad.inertia.share_key', 'showad');

        \Inertia\Inertia::share($shareKey, function () {
            return $this->app->make(ShowAdManager::class)
                ->getVerificationState($this->app['request']);
        });
    }
}
