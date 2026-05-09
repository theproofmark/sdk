<?php

declare(strict_types=1);

/**
 * CodeIgniter 4 filter integration.
 *
 * Place this file at app/Filters/ShowAdFilter.php and register it in
 * app/Config/Filters.php as documented in the README. The filter normalises
 * the CI request through the GlobalsAdapter — CI4 already syncs $_SERVER /
 * $_GET / $_COOKIE so the same adapter works.
 */

namespace App\Filters;

use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;
use ProofMark\ShowAd\Cookies\CookieJar;
use ProofMark\ShowAd\Request\Adapter\GlobalsAdapter;
use ProofMark\ShowAd\ShowAdClient;

final class ShowAdFilter implements FilterInterface
{
    public function before(RequestInterface $request, $arguments = null)
    {
        $client = new ShowAdClient([
            'creator_hash' => env('SHOWAD_CREATOR_HASH'),
            'api_key' => env('SHOWAD_API_KEY'),
            'redirect_secret' => env('SHOWAD_REDIRECT_SECRET'),
            'protected_paths' => $arguments ?: ['/premium/*'],
        ]);

        $context = GlobalsAdapter::fromGlobals();
        $result = $client->handler()->protect($context);

        if ($result->isAllow()) {
            if (!empty($result->cookies)) {
                CookieJar::applyToGlobals($result->cookies);
            }
            return null;
        }

        $response = service('response');
        foreach ($result->cookies as $cookie) {
            $response->setHeader('Set-Cookie', CookieJar::toSetCookieHeader($cookie));
        }
        foreach ($result->headers as $name => $value) {
            $response->setHeader($name, $value);
        }
        $response->redirect($result->redirectUrl, 'auto', $result->statusCode ?: 302);
        return $response;
    }

    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
        // No-op
    }
}
