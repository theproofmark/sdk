<?php

namespace ProofMark\ShowAd\Tests;

use Orchestra\Testbench\TestCase as Orchestra;
use ProofMark\ShowAd\ShowAdServiceProvider;

abstract class TestCase extends Orchestra
{
    /**
     * Register package service providers.
     *
     * @param \Illuminate\Foundation\Application $app
     * @return array
     */
    protected function getPackageProviders($app)
    {
        return [
            ShowAdServiceProvider::class,
        ];
    }

    /**
     * Define package environment.
     *
     * @param \Illuminate\Foundation\Application $app
     * @return void
     */
    protected function defineEnvironment($app)
    {
        $app['config']->set('app.key', 'base64:MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=');
        $app['config']->set('app.cipher', 'AES-256-CBC');
        $app['config']->set('showad.creator_hash', 'test_creator_hash');
        $app['config']->set('showad.api_key', 'sk-test-api-key');
        $app['config']->set('showad.redirect_secret', 'secret_test');
        $app['config']->set('showad.api_base_url', 'https://ad.proofmark.io');
        $app['config']->set('showad.video_ad_url', 'https://showad.proofmark.io');
        $app['config']->set('showad.cookie.prefix', 'showad');
        $app['config']->set('showad.cookie.max_age', 3600);
        $app['config']->set('showad.cookie.secure', false);
        $app['config']->set('showad.cookie.same_site', 'lax');
        $app['config']->set('showad.debug', false);
    }
}
