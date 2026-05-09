<?php

declare(strict_types=1);

/**
 * Plain PHP integration.
 *
 * Drop this snippet at the very top of any page (or include it from a
 * shared header) to gate the request behind ShowAd verification. The SDK
 * reads the request from PHP superglobals, validates the token cookie,
 * claims a `redirect_ticket` if present, and otherwise redirects the
 * visitor to watch the video ad.
 */

require __DIR__ . '/../vendor/autoload.php';

use ProofMark\ShowAd\ShowAdClient;

$client = new ShowAdClient([
    'creator_hash' => getenv('SHOWAD_CREATOR_HASH') ?: 'your-creator-hash',
    'api_key' => getenv('SHOWAD_API_KEY') ?: 'your-api-key',
    'redirect_secret' => getenv('SHOWAD_REDIRECT_SECRET') ?: 'your-redirect-secret',
    'protected_paths' => ['/premium/*', '/locked/*'],
    'excluded_paths' => ['/health', '/api/public/*'],
    'access_policy' => [
        'trusted_ip_headers' => ['CF-Connecting-IP', 'X-Forwarded-For'],
        'crawler' => [
            'enabled' => true,
            'allow_cloudflare_verified_bot' => true,
        ],
        'allow_cidrs' => ['10.0.0.0/8'],
    ],
]);

// Will exit with a redirect when the visitor isn't verified.
$client->protect();

// If we made it past `protect()`, the visitor is verified. Render the page.
header('Content-Type: text/html; charset=utf-8');
echo '<h1>Premium content unlocked</h1>';
