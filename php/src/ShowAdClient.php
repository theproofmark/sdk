<?php

declare(strict_types=1);

namespace ProofMark\ShowAd;

use ProofMark\ShowAd\AccessPolicy\AccessPolicyEvaluator;
use ProofMark\ShowAd\Cookies\CookieJar;
use ProofMark\ShowAd\Http\CurlHttpClient;
use ProofMark\ShowAd\Http\HttpClient;
use ProofMark\ShowAd\Middleware\MiddlewareResult;
use ProofMark\ShowAd\Middleware\RequestHandler;
use ProofMark\ShowAd\Middleware\Verifier;
use ProofMark\ShowAd\Request\Adapter\GlobalsAdapter;
use ProofMark\ShowAd\Request\RequestContext;

/**
 * Top-level facade.
 *
 * Wires Config, HttpClient, CookieJar, Verifier, AccessPolicyEvaluator and
 * RequestHandler together so that callers can use the SDK with a single
 * object. All collaborators are still injectable for testing.
 */
final class ShowAdClient
{
    private Config $config;
    private HttpClient $httpClient;
    private CookieJar $cookieJar;
    private Verifier $verifier;
    private AccessPolicyEvaluator $accessPolicy;
    private RequestHandler $handler;

    /**
     * @param array<string, mixed>|Config $config
     */
    public function __construct(
        $config,
        ?HttpClient $httpClient = null,
        ?CookieJar $cookieJar = null,
        ?Verifier $verifier = null,
        ?AccessPolicyEvaluator $accessPolicy = null
    ) {
        $this->config = $config instanceof Config ? $config : new Config($config);
        $this->httpClient = $httpClient ?? new CurlHttpClient(
            $this->config->httpTimeout(),
            $this->config->httpConnectTimeout()
        );
        $this->cookieJar = $cookieJar ?? new CookieJar($this->config);
        $this->verifier = $verifier ?? new Verifier($this->config, $this->cookieJar);
        $this->accessPolicy = $accessPolicy ?? new AccessPolicyEvaluator();
        $this->handler = new RequestHandler(
            $this->config,
            $this->httpClient,
            $this->cookieJar,
            $this->verifier,
            $this->accessPolicy
        );
    }

    public function config(): Config
    {
        return $this->config;
    }

    public function httpClient(): HttpClient
    {
        return $this->httpClient;
    }

    public function cookieJar(): CookieJar
    {
        return $this->cookieJar;
    }

    public function verifier(): Verifier
    {
        return $this->verifier;
    }

    public function handler(): RequestHandler
    {
        return $this->handler;
    }

    public function accessPolicy(): AccessPolicyEvaluator
    {
        return $this->accessPolicy;
    }

    /**
     * Convenience entry point for plain-PHP integrations.
     *
     * Reads the request from PHP superglobals, runs the protect pipeline,
     * and on a redirect/ticket-claim outcome emits headers and cookies and
     * exits the script. On allow, the call returns the result so callers
     * can attach metadata to their response if they want to.
     *
     * Pass a custom RequestContext to use this from a framework whose
     * request can be normalised via one of the adapters.
     */
    public function protect(?RequestContext $request = null, bool $exitOnRedirect = true): MiddlewareResult
    {
        $context = $request ?? GlobalsAdapter::fromGlobals();
        $result = $this->handler->protect($context);

        if ($result->isRedirect()) {
            $result->applyToGlobals();
            if ($exitOnRedirect) {
                exit;
            }
        } elseif (!empty($result->cookies)) {
            CookieJar::applyToGlobals($result->cookies);
        }

        return $result;
    }

    public function isVerified(?RequestContext $request = null): bool
    {
        $context = $request ?? GlobalsAdapter::fromGlobals();
        $preflight = $this->verifier->verify($context);
        if (!$preflight['verified'] || empty($preflight['token'])) {
            return false;
        }

        try {
            $this->handler->validateToken((string) $preflight['token']);
        } catch (ShowAdException $e) {
            return false;
        }

        return true;
    }

    public function buildVideoAdRedirectUrl(?string $returnUrl = null): string
    {
        return $this->handler->buildVideoAdRedirectUrl($returnUrl);
    }
}
