<?php

declare(strict_types=1);

/**
 * Slim 4 (PSR-15) integration.
 *
 * Register the SDK's PSR-15 middleware on either the entire app or any
 * route group that needs to be gated. The middleware translates
 * MiddlewareResult into a PSR-7 response with proper Set-Cookie headers.
 */

require __DIR__ . '/../vendor/autoload.php';

use ProofMark\ShowAd\Http\CurlHttpClient;
use ProofMark\ShowAd\Middleware\Psr15Middleware;
use ProofMark\ShowAd\Middleware\RequestHandler;
use ProofMark\ShowAd\ShowAdClient;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Factory\AppFactory;

$client = new ShowAdClient([
    'creator_hash' => getenv('SHOWAD_CREATOR_HASH'),
    'api_key' => getenv('SHOWAD_API_KEY'),
    'redirect_secret' => getenv('SHOWAD_REDIRECT_SECRET'),
    'protected_paths' => ['/premium/*'],
]);

$app = AppFactory::create();
$responseFactory = $app->getResponseFactory();

$middleware = new Psr15Middleware($client->handler(), $responseFactory);

$app->group('/premium', function ($group) {
    $group->get('/{slug}', function (ServerRequestInterface $req, ResponseInterface $res, array $args) {
        $res->getBody()->write('<h1>Premium ' . htmlspecialchars($args['slug']) . '</h1>');
        return $res->withHeader('Content-Type', 'text/html');
    });
})->add($middleware);

$app->run();
