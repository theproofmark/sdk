# ShowAd Laravel SDK

Protect your content with video ad verification. This SDK integrates with the ShowAd platform to gate content behind video ads, supporting traditional Blade views as well as modern starter kits using Inertia.js with Vue, React, or Svelte.

Protected routes rely on browser fingerprinting. For first-time visitors, the middleware now serves a short fingerprint-bootstrap page before sending the visitor to the ShowAd flow, so direct hits to protected URLs work correctly.

## Requirements

- PHP >= 7.1
- Laravel >= 5.5

The server-side package API supports Laravel 5.5 and above. The published Inertia frontend helpers are intended for current Laravel starter-kit stacks using Inertia with Vue 3 or React.

## Installation

```bash
composer require proofmark/showad-laravel
```

The package uses Laravel's auto-discovery, so the service provider and facade are registered automatically.

### Publish Configuration

```bash
php artisan vendor:publish --tag=showad-config
```

### Environment Variables

Add to your `.env`:

```env
SHOWAD_CREATOR_HASH=your_creator_hash
SHOWAD_API_KEY=sk-your-api-key
SHOWAD_REDIRECT_SECRET=secret_your-redirect-secret
SHOWAD_API_URL=https://ad.proofmark.io
SHOWAD_VIDEO_URL=https://showad.proofmark.io
```

---

## Usage

### 1. Route Middleware (Recommended)

Apply the `showad.verify` middleware to any route or group that should require verification:

```php
// Protect a route group
Route::middleware('showad.verify')->group(function () {
    Route::get('/premium', [PremiumController::class, 'index']);
    Route::get('/premium/{slug}', [PremiumController::class, 'show']);
});

// Protect a single route
Route::get('/exclusive-content', [ContentController::class, 'show'])
    ->middleware('showad.verify');
```

This middleware works for direct visits as well as in-app navigation. On a first visit, it briefly renders a bootstrap page that collects the browser fingerprint and then continues the verification flow automatically.

#### With Path Parameters

You can pass path patterns directly to the middleware:

```php
Route::middleware('showad.verify:premium/*,content/*')->group(function () {
    // Only /premium/* and /content/* paths are verified
    Route::get('/premium/{id}', [PremiumController::class, 'show']);
    Route::get('/content/{slug}', [ContentController::class, 'show']);
    Route::get('/about', [PageController::class, 'about']); // Not verified
});
```

### 2. Global Protection (Config-Based)

In Laravel 11/12, register the global middleware from `bootstrap/app.php`:

```php
use ProofMark\ShowAd\Middleware\ShowAdGlobalProtect;

->withMiddleware(function (Middleware $middleware) {
    $middleware->append(ShowAdGlobalProtect::class);
})
```

For older Laravel applications that still use `app/Http/Kernel.php`, register:

```php
protected $middleware = [
    // ... other global middleware
    \ProofMark\ShowAd\Middleware\ShowAdGlobalProtect::class,
];
```

Then configure protected paths in `config/showad.php`:

```php
'protected_paths' => [
    'premium/*',
    'exclusive/*',
    'vip',
],

'excluded_paths' => [
    'api/*',
    'webhook/*',
    '_debugbar/*',
],
```

### 3. Blade Directives

Use Blade directives for conditional content:

```blade
{{-- Show content only to verified users --}}
@showadVerified
    <h1>Premium Content</h1>
    <p>You have access!</p>
@endshowadVerified

{{-- Show content only to unverified users --}}
@showadUnverified
    <div class="paywall">
        <p>Watch an ad to unlock this content.</p>
        <a href="@showadRedirectUrl(request()->fullUrl())">Watch Ad</a>
    </div>
@endshowadUnverified

{{-- Gate with else --}}
@showadGate
    <article>{{ $content }}</article>
@elseshowadGate
    <p>Content locked. <a href="@showadRedirectUrl">Unlock now</a></p>
@endshowadGate
```

### 4. Include Client Scripts

Add fingerprint collection and client-side helpers to your layout:

```blade
<head>
    @showadMeta
</head>
<body>
    {{-- Your content --}}

    @showadScripts
</body>
```

The client script is still useful for proactively setting fingerprint state on public pages, but protected routes no longer depend on the user having visited an unprotected page first.

### 5. Debug Panel (Development Only)

Include the debug panel in your layout (only renders when `APP_DEBUG=true`):

```blade
@include('showad::components.debug')
```

### Server-Side Access Policy

The middleware can run a server-only access policy before redirecting to the
ad flow. Use it to allow verified search/AI crawlers, trusted CIDR ranges, and
your own authenticated/premium users without touching client-controlled
signals.

```php
// config/showad.php
'access_policy' => [
    // Headers your reverse proxy sets for the real client IP. Only list
    // headers you trust -- otherwise attackers can spoof IP rules.
    'trusted_ip_headers' => ['CF-Connecting-IP'],

    // CIDRs allowed to bypass verification (resolved from the IP above).
    'allow_cidrs' => ['203.0.113.0/24'],

    // Verified crawler policy. UA matching alone is never sufficient.
    'crawler' => [
        'enabled' => true,
        'families' => ['google', 'bing', 'openai'],
        'allow_cloudflare_verified_bot' => true,
        'family_cidrs' => [
            'google' => ['66.249.64.0/19'],
            'bing' => ['157.55.39.0/24'],
            'openai' => ['20.15.240.64/28'],
        ],
    ],

    // Resolve premium status from your own session/database. Never trust
    // a request header alone.
    'before_protect' => function (\Illuminate\Http\Request $request) {
        $user = $request->user();
        if ($user && $user->isPremium()) {
            return ['action' => 'allow', 'reason' => 'premium_user'];
        }
        return 'continue';
    },
],
```

The pipeline runs **verified crawler -> CIDR allowlist -> publisher callback ->
ShowAd verification**. Returning `'continue'` falls through to the normal
ShowAd verification + ad redirect; returning `['action' => 'allow']` skips the
gate, and `['action' => 'redirect', 'redirect_url' => $url]` short-circuits to
your URL of choice.

### 6. Controller Usage

Inject state or check verification in controllers:

```php
use ProofMark\ShowAd\Facades\ShowAd;

class ContentController extends Controller
{
    public function show(Request $request)
    {
        // Check verification
        if (!ShowAd::isVerified($request)) {
            return redirect(ShowAd::buildVideoAdRedirectUrl($request->fullUrl()));
        }

        return view('content.show', ['content' => $content]);
    }

    // Or get full state
    public function index(Request $request)
    {
        $showadState = ShowAd::getVerificationState($request);

        return view('content.index', [
            'showad' => $showadState,
            'content' => Content::all(),
        ]);
    }
}
```

### 7. InjectShowAdState Middleware

For pages that show different content based on verification but don't block access:

```php
Route::middleware('showad.inject')->group(function () {
    Route::get('/content/{slug}', [ContentController::class, 'show']);
});
```

The state is available as `$showad` in all views and `$request->attributes->get('showad')` in controllers.

---

## Inertia.js Integration (Vue / React / Svelte)

For Laravel Starter Kits using Inertia.js:

### 1. Enable Inertia Support

Set in `.env`:
```env
SHOWAD_INERTIA_ENABLED=true
```

When this flag is enabled, the package automatically shares `showad` props with Inertia responses via the service provider. That works with modern Laravel starter kits using Inertia + Vue or Inertia + React.

### 2. Add Middleware

**Option A: Standalone Middleware** — Add to your `web` middleware group in `app/Http/Kernel.php` if you want explicit middleware-based sharing instead of the built-in auto-share:

```php
protected $middlewareGroups = [
    'web' => [
        // ... existing middleware
        \ProofMark\ShowAd\Middleware\ShareShowAdWithInertia::class,
    ],
];
```

**Option B: Manual Share** — In your `HandleInertiaRequests` middleware:

```php
public function share(Request $request): array
{
    return array_merge(parent::share($request), [
        'showad' => fn () => app('showad')->getVerificationState($request),
    ]);
}
```

### 3. Publish Frontend Components

```bash
php artisan vendor:publish --tag=showad-assets
```

This copies Vue and React components to `resources/js/vendor/showad/`.

### 4. Vue Setup (Vue 3 + Inertia)

In `resources/js/app.js`:

```js
import { ShowAdPlugin } from './vendor/showad/vue';

createInertiaApp({
    setup({ el, App, props, plugin }) {
        createApp({ render: () => h(App, props) })
            .use(plugin)
            .use(ShowAdPlugin)  // Register ShowAd components
            .mount(el);
    },
});
```

Use in Vue components:

```vue
<template>
    <ShowAdGate>
        <template #default>
            <h1>Premium Content</h1>
            <p>Verified users see this.</p>
        </template>
        <template #unverified>
            <p>Watch an ad to unlock.</p>
        </template>
    </ShowAdGate>

    <ShowAdExpiryCountdown format="mm:ss" @expired="handleExpired" />
</template>

<script setup>
import { useShowAd } from './vendor/showad/vue';
const showAd = useShowAd();
</script>
```

### 5. React Setup (React + Inertia)

In `resources/js/app.jsx`:

```jsx
import { InertiaShowAdProvider } from './vendor/showad/react';

createInertiaApp({
    setup({ el, App, props }) {
        createRoot(el).render(
            <InertiaShowAdProvider>
                <App {...props} />
            </InertiaShowAdProvider>
        );
    },
});
```

Use in React components:

```jsx
import { ShowAdGate, useShowAd, ShowAdExpiryCountdown } from './vendor/showad/react';

function PremiumPage({ content }) {
    const { isVerified, redirectToVideoAd } = useShowAd();

    return (
        <ShowAdGate
            unverified={
                <div>
                    <p>Watch an ad to unlock.</p>
                    <button onClick={() => redirectToVideoAd()}>Verify</button>
                </div>
            }
        >
            <article>{content}</article>
            <ShowAdExpiryCountdown format="mm:ss" />
        </ShowAdGate>
    );
}
```

### 6. Composable / Hook API

**Vue:**
```js
import { useShowAd } from './vendor/showad/vue';

const { isVerified, creatorHash, expiresAt, redirectUrl, redirectToVideoAd } = useShowAd();
```

**React:**
```jsx
import { useShowAd, useIsVerified, useExpiryCountdown } from './vendor/showad/react';

const { isVerified, redirectToVideoAd } = useShowAd();
const verified = useIsVerified();
const { remaining, formatted, isExpired } = useExpiryCountdown();
```

---

## Verification Flow

```
User visits /premium/article
    │
    ├─ VerifyShowAd middleware runs
    │   ├─ Read cookies: fingerprint, token
    │   ├─ Missing fingerprint?
    │   │  └─ Serve bootstrap page → collect fingerprint → continue
    │   ├─ Check for ?redirect_ticket in URL
    │   │
    │   └─ DECISION:
    │       ├─ Has redirect_ticket?
    │       │  ├─ Claim token from backend (POST /api/redirect-ticket/{id}/claim)
    │       │  ├─ Set httpOnly token cookie
    │       │  └─ Redirect to clean URL → Allow access ✓
    │       │
    │       ├─ Has valid token in cookie?
    │       │  ├─ Validate expiry + creator hash + fingerprint
    │       │  └─ Allow access ✓
    │       │
    │       └─ No verification → Redirect to video ad
    │           (https://showad.proofmark.io/c/{creatorHash}?return_url=...)
    │
    └─ User watches ad → Redirected back with ?redirect_ticket → Flow restarts
```

---

## Cookie Security

| Cookie | httpOnly | Purpose |
|--------|----------|---------|
| `showad_token` | ✓ | JWT token (XSS-safe) |
| `showad_verified` | ✗ | JS-readable signal ("1") |
| `showad_creator` | ✗ | Creator hash |
| `showad_fingerprint` | ✗ | Browser fingerprint |
| `showad_expires` | ✗ | Token expiry (ms) |
| `showad_ticket` | ✗ | Redirect ticket ID |

All cookies use `Secure` flag on HTTPS, `SameSite=Lax`, and `Path=/`.

---

## API Reference

### Facade Methods

```php
use ProofMark\ShowAd\Facades\ShowAd;

ShowAd::isVerified($request);                          // bool
ShowAd::verifyRequest($request);                       // array
ShowAd::getVerificationState($request);                // array
ShowAd::claimRedirectTicket($ticketId);               // array (backend call)
ShowAd::validateToken($token);                         // array (backend call)
ShowAd::checkHealth();                                 // bool
ShowAd::buildVideoAdRedirectUrl($returnUrl);           // string
ShowAd::buildResourceRedirectUrl($proj, $res, $url);   // string
ShowAd::renderMetaTags();                              // string (HTML)
ShowAd::renderScripts();                               // string (HTML)
```

### Blade Directives

| Directive | Description |
|-----------|-------------|
| `@showadVerified` / `@endshowadVerified` | Verified-only content |
| `@showadUnverified` / `@endshowadUnverified` | Unverified-only content |
| `@showadGate` / `@elseshowadGate` / `@endshowadGate` | If/else gate |
| `@showadRedirectUrl($returnUrl)` | Output redirect URL |
| `@showadMeta` | Output meta tags |
| `@showadScripts` | Output client-side JS |

### Middleware

| Alias | Class | Purpose |
|-------|-------|---------|
| `showad.verify` | `VerifyShowAd` | Block unverified requests |
| `showad.inject` | `InjectShowAdState` | Inject state without blocking |
| `showad.inertia` | `ShareShowAdWithInertia` | Middleware-based Inertia prop sharing |
| `showad.global` | `ShowAdGlobalProtect` | Alias for config-based global protection |
| (global) | `ShowAdGlobalProtect` | Config-based path protection |
| (global) | `ShareShowAdWithInertia` | Share state with Inertia |

---

## Testing

```bash
composer install
composer test
```

---

## Customization

### Publish Views

```bash
php artisan vendor:publish --tag=showad-views
```

Views are copied to `resources/views/vendor/showad/` where you can customize them.

### Client-Side Events

The JavaScript SDK dispatches events on `window`:

```js
window.addEventListener('showad:expired', () => {
    // Token expired, re-verify
    window.ShowAd.redirectToVideoAd();
});

window.addEventListener('showad:expiring', (e) => {
    console.log('Expiring in:', e.detail.remainingMs, 'ms');
});
```

---

## License

MIT
