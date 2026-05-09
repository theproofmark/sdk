<?php

declare(strict_types=1);

namespace ProofMark\ShowAd\Middleware;

use ProofMark\ShowAd\Cookies\CookieJar;
use ProofMark\ShowAd\Request\Adapter\Psr7Adapter;

/**
 * Optional PSR-15 wrapper around RequestHandler.
 *
 * The PSR-15 / PSR-17 / PSR-7 packages are soft dependencies. When those
 * interfaces aren't on the autoload path, this class becomes a stub that
 * will throw a clear error if anyone tries to use it. We avoid `implements
 * MiddlewareInterface` at compile time by deferring the interface check to
 * runtime via class_exists/interface_exists.
 *
 * Once the optional interfaces are present (e.g. via require-dev or the
 * host application's composer.json), this class transparently behaves as a
 * proper PSR-15 middleware.
 */
if (interface_exists('Psr\\Http\\Server\\MiddlewareInterface')
    && interface_exists('Psr\\Http\\Server\\RequestHandlerInterface')
    && interface_exists('Psr\\Http\\Message\\ResponseFactoryInterface')) {

    final class Psr15Middleware implements \Psr\Http\Server\MiddlewareInterface
    {
        private RequestHandler $handler;
        private \Psr\Http\Message\ResponseFactoryInterface $responseFactory;

        public function __construct(RequestHandler $handler, \Psr\Http\Message\ResponseFactoryInterface $responseFactory)
        {
            $this->handler = $handler;
            $this->responseFactory = $responseFactory;
        }

        public function process(
            \Psr\Http\Message\ServerRequestInterface $request,
            \Psr\Http\Server\RequestHandlerInterface $handler
        ): \Psr\Http\Message\ResponseInterface {
            $context = Psr7Adapter::fromRequest($request);
            $result = $this->handler->protect($context);

            if ($result->isAllow()) {
                $response = $handler->handle($request);
                return $this->applyCookies($response, $result);
            }

            $status = $result->statusCode > 0 ? $result->statusCode : 302;
            $response = $this->responseFactory->createResponse($status);

            if ($result->redirectUrl !== null) {
                $response = $response->withHeader('Location', $result->redirectUrl);
            }
            foreach ($result->headers as $name => $value) {
                $response = $response->withHeader($name, $value);
            }
            return $this->applyCookies($response, $result);
        }

        private function applyCookies(
            \Psr\Http\Message\ResponseInterface $response,
            MiddlewareResult $result
        ): \Psr\Http\Message\ResponseInterface {
            foreach ($result->cookies as $cookie) {
                $response = $response->withAddedHeader('Set-Cookie', CookieJar::toSetCookieHeader($cookie));
            }
            return $response;
        }
    }
} else {
    final class Psr15Middleware
    {
        public function __construct(...$args)
        {
            throw new \RuntimeException(
                'PSR-15 middleware requires psr/http-server-middleware, '
                . 'psr/http-server-handler, and psr/http-message to be installed.'
            );
        }
    }
}
