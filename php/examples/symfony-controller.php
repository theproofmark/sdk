<?php

declare(strict_types=1);

/**
 * Symfony 6/7 controller integration.
 *
 * Wire the ShowAdClient into your container (services.yaml below) and call
 * `protect()` from inside any controller that should be gated.
 *
 * # config/services.yaml
 * services:
 *   ProofMark\ShowAd\ShowAdClient:
 *     arguments:
 *       $config:
 *         creator_hash: '%env(SHOWAD_CREATOR_HASH)%'
 *         api_key: '%env(SHOWAD_API_KEY)%'
 *         redirect_secret: '%env(SHOWAD_REDIRECT_SECRET)%'
 *         protected_paths: ['/premium/*']
 */

namespace App\Controller;

use ProofMark\ShowAd\Middleware\MiddlewareResult;
use ProofMark\ShowAd\Cookies\CookieJar;
use ProofMark\ShowAd\Request\Adapter\SymfonyAdapter;
use ProofMark\ShowAd\ShowAdClient;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

final class PremiumController
{
    public function __construct(private ShowAdClient $showad)
    {
    }

    #[Route('/premium/{slug}', name: 'premium')]
    public function show(Request $request, string $slug): Response
    {
        $context = SymfonyAdapter::fromRequest($request);
        $result = $this->showad->handler()->protect($context);

        if ($result->isRedirect()) {
            return $this->translateToSymfonyResponse($result);
        }

        $response = new Response('<h1>Premium: ' . htmlspecialchars($slug) . '</h1>');
        $this->attachCookies($response, $result);
        return $response;
    }

    private function translateToSymfonyResponse(MiddlewareResult $result): RedirectResponse
    {
        $response = new RedirectResponse(
            $result->redirectUrl ?? '/',
            $result->statusCode ?: 302
        );
        foreach ($result->headers as $name => $value) {
            $response->headers->set($name, $value);
        }
        $this->attachCookies($response, $result);
        return $response;
    }

    private function attachCookies(Response $response, MiddlewareResult $result): void
    {
        foreach ($result->cookies as $cookie) {
            $options = $cookie['options'];
            $response->headers->setCookie(new Cookie(
                $cookie['name'],
                $cookie['value'],
                (int) ($options['expires'] ?? 0),
                $options['path'] ?? '/',
                $options['domain'] ?? null,
                (bool) ($options['secure'] ?? false),
                (bool) ($options['httponly'] ?? false),
                false,
                $options['samesite'] ?? 'lax'
            ));
        }
    }
}
