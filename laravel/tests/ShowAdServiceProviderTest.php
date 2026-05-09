<?php

namespace ProofMark\ShowAd\Tests;

use Illuminate\Routing\Router;
use ProofMark\ShowAd\Facades\ShowAd;
use ProofMark\ShowAd\ShowAdManager;

class ShowAdServiceProviderTest extends TestCase
{
    public function testManagerIsBoundInContainer()
    {
        $manager = $this->app->make(ShowAdManager::class);

        $this->assertInstanceOf(ShowAdManager::class, $manager);
        $this->assertSame($manager, $this->app->make('showad'));
    }

    public function testFacadeResolvesManager()
    {
        $this->assertSame(
            $this->app->make('showad')->getConfig('creator_hash'),
            ShowAd::getConfig('creator_hash')
        );
    }

    public function testMiddlewareAliasesAreRegistered()
    {
        $router = $this->app->make(Router::class);
        $middleware = $router->getMiddleware();

        $this->assertArrayHasKey('showad.verify', $middleware);
        $this->assertArrayHasKey('showad.inject', $middleware);
        $this->assertArrayHasKey('showad.inertia', $middleware);
        $this->assertArrayHasKey('showad.global', $middleware);
    }

    public function testBladeDirectivesRenderWithoutFailure()
    {
        $html = $this->app['blade.compiler']->compileString(
            '@showadUnverified unlocked @endshowadUnverified'
        );

        $this->assertStringContainsString('ShowAdManager', $html);
    }
}
