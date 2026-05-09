# ShowAd Content Gate — WordPress SDK

Production-ready WordPress plugin for gating content behind ProofMark ShowAd video ad verification.

**Requires:** WordPress 5.0+ | PHP 7.2+  
**Compatible with:** WordPress 5.0 – 6.7+ (tested through Classic Editor & Gutenberg)

---

## Features

- **Shortcodes** — `[showad_gate]`, `[showad_verified]`, `[showad_unverified]`, `[showad_redirect_button]`, `[showad_expiry]`
- **Gutenberg Block** — "ShowAd Content Gate" block with InnerBlocks support
- **Classic Widget** — Sidebar widget for gated content
- **Path-Based Protection** — Protect entire URL paths with glob patterns
- **Template Tags** — PHP functions for theme developers: `showad_is_verified()`, `showad_gate()`, etc.
- **Admin Settings UI** — Full settings page under Settings → ShowAd
- **REST API** — `/wp-json/showad/v1/claim-ticket`, `/wp-json/showad/v1/validate-token`, `/wp-json/showad/v1/health`
- **Client-Side SDK** — `window.ShowAd` JavaScript API with fingerprint collection, expiry countdown, event system
- **Security** — httpOnly JWT cookie, nonce verification, input sanitization, capability checks, CSRF protection
- **Internationalization** — Full i18n support with text domain `showad-content-gate`
- **PHP 7.2+ compatibility** — SameSite cookie workaround for PHP < 7.3

---

## Installation

### Manual Installation

1. Copy the `showad-content-gate` folder to `wp-content/plugins/`
2. Activate the plugin from the WordPress admin → Plugins page
3. Go to **Settings → ShowAd** and enter your API credentials

### From ZIP

1. Download the plugin ZIP
2. In WordPress admin, go to Plugins → Add New → Upload Plugin
3. Upload and activate
4. Configure under Settings → ShowAd

---

## Configuration

### Required Settings

| Setting | Description |
|---------|-------------|
| **Creator Hash** | Your unique creator identifier from ProofMark |
| **API Key** | Secret API key (starts with `sk-`) |
| **Redirect Secret** | Secret used for claiming redirect tickets |

### Optional Settings

| Setting | Default | Description |
|---------|---------|-------------|
| API Base URL | `https://ad.proofmark.io` | ShowAd backend API |
| Video Ad URL | `https://showad.proofmark.io` | Video ad frontend |
| Cookie Prefix | `showad` | Prefix for all cookies |
| Cookie Max Age | `3600` (1 hour) | Verification duration in seconds |
| Cookie Secure | Auto-detect | Force HTTPS-only cookies |
| SameSite | `Lax` | Cookie SameSite policy |
| Protected Paths | (empty) | Glob patterns for path protection |
| Excluded Paths | (empty) | Glob patterns to exclude |
| Debug Mode | `false` | Enable debug logging |

### Environment Variables (wp-config.php)

You can define credentials in `wp-config.php` for version-controlled deployments:

```php
// In wp-config.php (recommended for production)
define( 'SHOWAD_CREATOR_HASH', 'your-creator-hash' );
define( 'SHOWAD_API_KEY', 'sk-your-api-key' );
define( 'SHOWAD_REDIRECT_SECRET', 'your-redirect-secret' );
```

---

## Usage

### Shortcodes

#### Gate Content

```
[showad_gate]
This premium content is only visible after watching a video ad.
[/showad_gate]
```

#### With Custom Locked Message

```
[showad_gate unverified="<p>Watch a short ad to read this article.</p>"]
Full article content here...
[/showad_gate]
```

#### Auto-Redirect

```
[showad_gate auto_redirect="true"]
Protected page content.
[/showad_gate]
```

#### Conditional Content

```
[showad_verified]
Thank you for watching! Here's your exclusive content.
[/showad_verified]

[showad_unverified]
This content requires verification.
[showad_redirect_button text="Watch Ad to Unlock"]
[/showad_unverified]
```

#### Expiry Countdown

```
Your access expires in: [showad_expiry format="mm:ss"]
```

Formats: `mm:ss`, `seconds`, `human`

### Gutenberg Block

1. Add a new block and search for **"ShowAd Content Gate"**
2. Place your protected content inside the block
3. Configure button text, custom locked message, and auto-redirect in the block sidebar

### Widget

1. Go to **Appearance → Widgets**
2. Add the **"ShowAd Content Gate"** widget to any sidebar
3. Configure title, verified/unverified content, and button text

### Path-Based Protection

Protect entire sections of your site:

1. Go to **Settings → ShowAd → Content Protection**
2. Enter paths (one per line, supports `*` wildcards):

```
/premium/*
/members/*
/exclusive-content/*
```

3. Optionally exclude paths:

```
/premium/free-preview
/wp-admin/*
/wp-login.php
```

### Server-Side Access Policy (Crawlers, Premium, IP Allowlists)

The plugin exposes two filters so a theme or companion plugin can register a
server-only access policy that runs before the ShowAd flow. User-Agent
matching alone never grants bypass; a crawler family must also match a
published IP range or pass a custom verifier.

```php
// In your theme's functions.php or a small mu-plugin:
add_filter( 'showad_access_policy', function ( $config ) {
    return array(
        // Headers your reverse proxy sets for the real client IP.
        'trusted_ip_headers' => array( 'CF-Connecting-IP' ),
        // CIDRs allowed to bypass verification.
        'allow_cidrs'        => array( '203.0.113.0/24' ),
        // Verified-crawler policy.
        'crawler' => array(
            'enabled'                       => true,
            'families'                      => array( 'google', 'bing', 'openai' ),
            'allow_cloudflare_verified_bot' => true,
            'family_cidrs'                  => array(
                'google' => array( '66.249.64.0/19' ),
                'bing'   => array( '157.55.39.0/24' ),
                'openai' => array( '20.15.240.64/28' ),
            ),
        ),
    );
} );

// Resolve premium status from your own membership plugin / user meta.
add_filter( 'showad_access_policy_decision', function ( $decision, $context ) {
    if ( is_user_logged_in() && get_user_meta( get_current_user_id(), 'is_premium', true ) ) {
        return array( 'action' => 'allow', 'reason' => 'premium_user' );
    }
    return $decision;
}, 10, 2 );
```

The pipeline runs **verified crawler -> CIDR allowlist -> filter decision ->
ShowAd verification**. Only list headers your reverse proxy actually sets in
`trusted_ip_headers`; otherwise attackers can spoof IP rules through
`X-Forwarded-For`. Resolve membership from server-side state, never from a
header.

For subscription-style gates, pair the bypass with Google's
[paywalled content structured data](https://developers.google.com/search/docs/appearance/structured-data/paywalled-content)
so search engines distinguish intentional gating from cloaking.

### Template Tags (for Theme Developers)

```php
// Check verification status
if ( showad_is_verified() ) {
    echo 'Welcome back!';
}

// Get full state
$state = showad_get_verification_state();
// $state['is_verified'], $state['expires_at'], $state['redirect_url']

// Conditional rendering
showad_gate(
    '<p>Premium content here</p>',
    '<p>Please <a href="' . showad_redirect_url() . '">watch an ad</a> to unlock.</p>'
);

// Output in <head>
echo showad_meta_tags();

// Get redirect URL
$url = showad_redirect_url( 'https://mysite.com/return-page' );
```

### JavaScript API

The plugin exposes `window.ShowAd` globally:

```javascript
// Check verification
ShowAd.isVerified();          // boolean

// Time remaining
ShowAd.getTimeUntilExpiry();  // seconds, or -1

// Get stored fingerprint
ShowAd.getFingerprint();      // string or null

// Redirect to video ad
ShowAd.redirectToVideoAd();
ShowAd.redirectToVideoAd('https://mysite.com/callback');

// Listen for events
document.addEventListener('showad:expired', function () {
    alert('Your access has expired.');
});

document.addEventListener('showad:expiring', function (e) {
    console.log('Expires in', e.detail.secondsRemaining, 'seconds');
});
```

---

## How It Works

```
USER VISITS PROTECTED PAGE
         │
         ▼
  ┌──────────────┐
  │ Has valid     │──── YES ──→ Show Content
  │ JWT token?    │
  └──────┬───────┘
         │ NO
         ▼
  ┌──────────────┐
  │ redirect_ticket│──── YES ──→ Claim ticket → Set cookie → Redirect clean
  │ in URL?       │
  └──────┬───────┘
         │ NO
         ▼
  Redirect to ShowAd Video Ad
  (https://showad.proofmark.io/c/{creatorHash}?return_url=...)
         │
  User watches video ad
         │
         ▼
  Redirected back with ?redirect_ticket={id}
         │
         ▼
  Server claims ticket → receives JWT → sets httpOnly cookie
         │
         ▼
  Content unlocked for cookie duration
```

---

## File Structure

```
showad-content-gate/
├── showad-content-gate.php     # Main plugin file
├── uninstall.php               # Cleanup on plugin deletion
├── README.md                   # This file
├── assets/
│   ├── css/
│   │   ├── showad-gate.css     # Frontend gate styles
│   │   ├── admin.css           # Admin settings styles
│   │   └── block-editor.css    # Gutenberg editor styles
│   └── js/
│       ├── showad-client.js    # Client-side SDK (window.ShowAd)
│       ├── fingerprint.js      # FingerprintJS loader
│       ├── block-editor.js     # Gutenberg block registration
│       └── admin.js            # Admin settings JS
├── includes/
│   ├── Plugin.php              # Main plugin orchestrator (singleton)
│   ├── Manager.php             # Core business logic
│   ├── JwtHelper.php           # JWT decode & validation
│   ├── Middleware.php           # Request interceptor for path protection
│   ├── Shortcodes.php          # All shortcode handlers
│   ├── Block.php               # Gutenberg block registration
│   ├── Widget.php              # Classic WordPress widget
│   ├── ShowAdException.php     # Exception class with error codes
│   ├── template-tags.php       # Theme developer helper functions
│   └── Admin/
│       ├── Settings.php        # Admin settings page & registration
│       └── AjaxHandler.php     # AJAX endpoints (connection test)
└── languages/                  # Translation files
```

---

## Security

- **JWT tokens** stored as `httpOnly` cookies — not accessible via JavaScript
- **Signal cookie** (`showad_verified`) is readable by JS for UI state only
- **Nonce verification** on all admin AJAX calls
- **Capability checks** — only `manage_options` users can modify settings
- **Input sanitization** — all user inputs sanitized with WordPress functions
- **Output escaping** — all HTML output escaped with `esc_html()`, `esc_attr()`, `esc_url()`, `wp_kses_post()`
- **CSRF protection** — WordPress Settings API nonce built-in
- **Cookie security** — Secure flag auto-detected, SameSite policy configurable
- **No direct file access** — all PHP files check `ABSPATH`
- **Ticket ID validation** — alphanumeric regex check before API calls

---

## Compatibility

| WordPress | Status |
|-----------|--------|
| 5.0 – 5.9 | ✅ Compatible (Classic Editor + Gutenberg) |
| 6.0 – 6.5 | ✅ Fully tested |
| 6.6+ | ✅ Compatible |

| PHP | Status |
|-----|--------|
| 7.2 – 7.4 | ✅ Compatible (SameSite workaround included) |
| 8.0 – 8.3 | ✅ Fully tested |

---

## API Endpoints

The plugin registers REST API routes under `showad/v1`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/wp-json/showad/v1/claim-ticket` | POST | Claim a redirect ticket |
| `/wp-json/showad/v1/validate-token` | POST | Validate a JWT token |
| `/wp-json/showad/v1/health` | GET | Check backend health |

---

## Hooks & Filters

### Actions

```php
// Fired after successful ticket claim
do_action( 'showad_ticket_claimed', $ticket_id, $token );

// Fired when verification cookies are set
do_action( 'showad_cookies_set', $data );
```

### Filters

```php
// Modify the video ad redirect URL
add_filter( 'showad_redirect_url', function( $url, $return_url ) {
    return $url;
}, 10, 2 );

// Modify gate HTML output
add_filter( 'showad_gate_locked_html', function( $html ) {
    return $html;
} );
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Configuration incomplete" notice | Enter all three required credentials in Settings → ShowAd |
| Connection test fails | Check API Base URL and ensure your server can make outgoing HTTPS requests |
| Cookies not being set | Check that your site uses HTTPS, or set Cookie Secure to "Never" for local dev |
| Content not locking | Verify protected paths are configured, or ensure shortcodes are placed correctly |
| Redirect loop | Check excluded paths include `/wp-admin/*` and `/wp-login.php` |

---

## Testing

```bash
php tests/verify-request-smoke.php
```

The smoke test runs the token-verification path with lightweight WordPress
function shims and confirms existing cookies are checked through the backend
validation call before being accepted.

---

## License

GPL-2.0-or-later — Compatible with WordPress core license.
