# ProofMark ShowAd — PHP SDK

Framework-agnostic PHP SDK for [ProofMark](https://proofmark.io) ShowAd
content gating. Visitors who haven't watched a video ad get redirected;
verified visitors are allowed through. The SDK runs server-side, has zero
hard dependencies (only `ext-curl`), and works with plain PHP, Symfony,
Slim (PSR-15), CodeIgniter 4, Laminas, and any custom router.

> Looking for a Laravel-specific package? Use
> [`proofmark/showad-laravel`](../laravel/). For WordPress, use the bundled
> `showad-content-gate` plugin.

---

## Why this SDK exists

ProofMark gates premium pages behind a short video ad. The flow is:

1. Visitor hits a protected URL on your site.
2. SDK checks for a valid JWT in cookies. No token → redirect to
   `https://showad.proofmark.io/c/{creator_hash}?return_url=...&sdk=1`.
3. Visitor watches the ad, then comes back with `?redirect_ticket=...`.
4. SDK posts the ticket to ProofMark, receives a JWT, sets cookies, and
   sends the visitor to a clean URL.
5. Future requests carry the cookie and pass through untouched.

The same wire format is implemented in the Laravel and WordPress SDKs.

---

## Install

```bash
composer require proofmark/showad-php
```

Requirements: PHP 7.4+, `ext-json`, `ext-curl`. No third-party runtime
dependencies. PSR-7/PSR-15 and Symfony HttpFoundation are *soft*
dependencies — install them only if you need the matching adapter.

---

## Configuration reference

```php
$config = [
    // Required
    'creator_hash' => 'creator-1',         // Your ProofMark creator hash
    'api_key' => '...',                    // SDK API key (publisher dashboard)
    'redirect_secret' => '...',            // Ticket claim secret

    // Optional - all defaults shown
    'api_base_url' => 'https://ad.proofmark.io',
    'video_ad_url' => 'https://showad.proofmark.io',
    'debug' => false,

    'protected_paths' => ['/premium/*'],   // Empty = protect everything
    'excluded_paths' => ['/health'],

    'cookie' => [
        'prefix' => 'showad',              // → showad_token, showad_verified, ...
        'max_age' => 3600,
        'secure' => null,                  // null = auto-detect via HTTPS
        'same_site' => 'lax',              // lax | strict | none
    ],

    'access_policy' => [
        'trusted_ip_headers' => ['CF-Connecting-IP', 'X-Forwarded-For'],
        'allow_cidrs' => ['10.0.0.0/8'],   // Office IPs, etc.
        'crawler' => [
            'enabled' => true,
            'allow_cloudflare_verified_bot' => true,
            // Override or extend the default bot CIDR families when needed:
            // 'family_cidrs' => ['google' => ['66.249.64.0/19']],
            // 'reverse_dns_verifier' => fn ($ip, $family) => ...,
        ],
        'before_protect' => function ($request, $context) {
            // Custom bypass: return ['action' => 'allow'] for premium users etc.
            return ['action' => 'continue'];
        },
    ],

    'http' => [
        'timeout' => 10,
        'connect_timeout' => 5,
    ],
];
```

You can also build a `Config` from environment variables with
`Config::fromEnv($overrides)` — useful for plain-PHP / CGI deployments.

---

## Plain PHP

```php
<?php
require __DIR__ . '/vendor/autoload.php';

use ProofMark\ShowAd\ShowAdClient;

$client = new ShowAdClient([
    'creator_hash' => getenv('SHOWAD_CREATOR_HASH'),
    'api_key' => getenv('SHOWAD_API_KEY'),
    'redirect_secret' => getenv('SHOWAD_REDIRECT_SECRET'),
]);

$client->protect(); // exits with a redirect when the visitor isn't verified

echo '<h1>Premium content unlocked</h1>';
```

See `examples/plain-php.php` for the full snippet.

---

## Symfony 6 / 7

```php
use ProofMark\ShowAd\Request\Adapter\SymfonyAdapter;
use ProofMark\ShowAd\ShowAdClient;
use Symfony\Component\HttpFoundation\{Cookie, RedirectResponse, Request, Response};

final class PremiumController
{
    public function __construct(private ShowAdClient $showad) {}

    public function show(Request $request): Response
    {
        $context = SymfonyAdapter::fromRequest($request);
        $result = $this->showad->handler()->protect($context);

        if ($result->isRedirect()) {
            $response = new RedirectResponse($result->redirectUrl);
        } else {
            $response = new Response('<h1>Premium</h1>');
        }

        foreach ($result->cookies as $c) {
            $opts = $c['options'];
            $response->headers->setCookie(new Cookie(
                $c['name'], $c['value'],
                (int) ($opts['expires'] ?? 0),
                $opts['path'] ?? '/',
                $opts['domain'] ?? null,
                (bool) ($opts['secure'] ?? false),
                (bool) ($opts['httponly'] ?? false),
                false,
                $opts['samesite'] ?? 'lax'
            ));
        }
        return $response;
    }
}
```

Full example: `examples/symfony-controller.php`.

---

## Slim 4 (PSR-15)

```php
use ProofMark\ShowAd\Middleware\Psr15Middleware;
use ProofMark\ShowAd\ShowAdClient;
use Slim\Factory\AppFactory;

$client = new ShowAdClient([...]);
$app = AppFactory::create();

$middleware = new Psr15Middleware($client->handler(), $app->getResponseFactory());

$app->group('/premium', function ($group) {
    $group->get('/{slug}', PremiumHandler::class);
})->add($middleware);
```

Requires `psr/http-server-middleware` and `psr/http-message`. Full
example: `examples/slim-psr15.php`.

---

## CodeIgniter 4

```php
// app/Filters/ShowAdFilter.php
use ProofMark\ShowAd\Request\Adapter\GlobalsAdapter;
use ProofMark\ShowAd\Cookies\CookieJar;
use ProofMark\ShowAd\ShowAdClient;

final class ShowAdFilter implements FilterInterface
{
    public function before(RequestInterface $request, $arguments = null)
    {
        $client = new ShowAdClient([...]);
        $result = $client->handler()->protect(GlobalsAdapter::fromGlobals());

        if ($result->isAllow()) {
            CookieJar::applyToGlobals($result->cookies);
            return null;
        }

        $response = service('response');
        foreach ($result->cookies as $c) {
            $response->setHeader('Set-Cookie', CookieJar::toSetCookieHeader($c));
        }
        return $response->redirect($result->redirectUrl);
    }
    public function after(...) {}
}
```

Then register in `app/Config/Filters.php`:

```php
public array $aliases = ['showad' => \App\Filters\ShowAdFilter::class];
public array $filters = ['showad' => ['before' => ['premium/*']]];
```

Full example: `examples/codeigniter-filter.php`.

---

## Laminas / Mezzio

Both Laminas Mezzio and any other PSR-15 framework can use
`Psr15Middleware` directly. The pattern is the same as the Slim example
above; just register the middleware in your pipeline.

---

## Architecture

```
ShowAdClient                    Top-level facade — wires everything together
├── Config                      Immutable config (array or env)
├── Http\CurlHttpClient         Default cURL transport (no Guzzle)
├── Cookies\CookieJar           Builds Set-Cookie tuples + headers
├── Jwt\JwtHelper               Decode + validate (no signature verification)
├── AccessPolicy\…              Crawler verification, CIDR allowlist, callback
├── Middleware\Verifier         Pure verification logic (RequestContext → verdict)
├── Middleware\RequestHandler   protect() — main entry point, returns MiddlewareResult
├── Middleware\Psr15Middleware  Soft PSR-15 wrapper
└── Request\Adapter\…           GlobalsAdapter, Psr7Adapter, SymfonyAdapter
```

Adapters convert framework-specific request objects into a normalised
`RequestContext`. The `RequestHandler` operates only on `RequestContext`,
which makes the SDK trivially testable and keeps the surface area small.

---

## Cookies & wire format

The SDK uses cookies prefixed with `showad_` (configurable):

| Cookie | HttpOnly | Purpose |
|---|---|---|
| `showad_token` | yes | Signed JWT issued by the backend |
| `showad_verified` | no | `'1'` flag readable by JS |
| `showad_creator` | no | Creator hash that token belongs to |
| `showad_ticket` | no | Last claimed ticket id |
| `showad_expires` | no | Token `exp` as unix seconds |
| `showad_fingerprint` | no | Set by client-side JS, bound into the token |

Endpoints (matching the Laravel SDK byte-for-byte):

* `POST {api}/api/redirect-ticket/:id/claim` with headers
  `X-Redirect-Ticket-Secret`, `X-ShowAd-API-Key`, `X-ShowAd-Creator-Hash`
  and JSON body `{"creator_hash": ...}`. Status codes:
  * `200` → `{creator_hash, ticket_id, token, ...}`
  * `401` → bad redirect secret (`TICKET_CLAIM_FAILED`)
  * `403` → creator mismatch (`CREATOR_MISMATCH`)
  * `410` → ticket consumed/missing (`TICKET_NOT_FOUND`)
* `POST {api}/api/sdk/validate` with body `{token, sdk_key}`.
* Redirect URL: `{video_ad_url}/c/{creator_hash}?return_url=...&sdk=1`.

JWT decode is used only as a cheap local preflight. Existing token cookies are
authoritatively checked with `/api/sdk/validate` before protected content is
allowed.

---

## Testing

```bash
composer install
./vendor/bin/phpunit
```

The default suite (`AccessPolicyEvaluatorTest`, `JwtHelperTest`,
`ConfigTest`, `ProtectFlowTest`) uses a fake HTTP client and covers
ticket claim, valid-token allow, no-token redirect, crawler bypass via
CIDR, CIDR allowlist, and excluded/protected paths.

---

## License

MIT © ProofMark.
