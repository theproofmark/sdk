<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Creator Hash
    |--------------------------------------------------------------------------
    |
    | Your unique creator hash obtained from the ShowAd dashboard.
    | This identifies your creator account for ad verification.
    |
    */
    'creator_hash' => env('SHOWAD_CREATOR_HASH', ''),

    /*
    |--------------------------------------------------------------------------
    | API Key
    |--------------------------------------------------------------------------
    |
    | Your secret API key for authenticating with the ShowAd backend.
    | Keep this value secret and never expose it to the client.
    |
    */
    'api_key' => env('SHOWAD_API_KEY', ''),

    /*
    |--------------------------------------------------------------------------
    | Redirect Secret
    |--------------------------------------------------------------------------
    |
    | Secret used to claim redirect tickets from the backend.
    | Keep this value secret and never expose it to the client.
    |
    */
    'redirect_secret' => env('SHOWAD_REDIRECT_SECRET', ''),

    /*
    |--------------------------------------------------------------------------
    | API Base URL
    |--------------------------------------------------------------------------
    |
    | The base URL for the ShowAd backend API.
    |
    */
    'api_base_url' => env('SHOWAD_API_URL', 'https://ad.proofmark.io'),

    /*
    |--------------------------------------------------------------------------
    | Video Ad URL
    |--------------------------------------------------------------------------
    |
    | The URL where users are redirected to watch video ads.
    |
    */
    'video_ad_url' => env('SHOWAD_VIDEO_URL', 'https://showad.proofmark.io'),

    /*
    |--------------------------------------------------------------------------
    | Cookie Settings
    |--------------------------------------------------------------------------
    |
    | Configure how ShowAd cookies are stored in the browser.
    |
    */
    'cookie' => [
        'prefix' => env('SHOWAD_COOKIE_PREFIX', 'showad'),
        'max_age' => env('SHOWAD_COOKIE_MAX_AGE', 3600), // 1 hour in seconds
        'secure' => env('SHOWAD_COOKIE_SECURE', null),    // null = auto-detect
        'same_site' => env('SHOWAD_COOKIE_SAME_SITE', 'lax'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Protected Paths
    |--------------------------------------------------------------------------
    |
    | URL patterns that require ShowAd verification. Supports wildcards (*).
    | Example: ['premium/*', 'protected/*', 'content/exclusive/*']
    |
    */
    'protected_paths' => [],

    /*
    |--------------------------------------------------------------------------
    | Excluded Paths
    |--------------------------------------------------------------------------
    |
    | URL patterns that are excluded from verification even if they match
    | a protected path. Supports wildcards (*).
    | Example: ['api/*', 'webhook/*', '_debugbar/*']
    |
    */
    'excluded_paths' => [],

    /*
    |--------------------------------------------------------------------------
    | Inertia Support
    |--------------------------------------------------------------------------
    |
    | When enabled, ShowAd verification state is automatically shared
    | with Inertia.js as page props (works with Vue, React, Svelte).
    |
    */
    'inertia' => [
        'enabled' => env('SHOWAD_INERTIA_ENABLED', false),
        'share_key' => 'showad', // The key under which data is shared
    ],

    /*
    |--------------------------------------------------------------------------
    | Access Policy (server-only bypass rules)
    |--------------------------------------------------------------------------
    |
    | Server-evaluated rules that run before ShowAd verification on a protected
    | path. Use these to allow verified search/AI crawlers, trusted IP ranges,
    | or your own authenticated/premium users without forcing the ad flow.
    |
    | Important: never trust client-controlled headers as authorization. The
    | `trusted_ip_headers` list must only contain headers your reverse proxy
    | sets (e.g. CF-Connecting-IP behind Cloudflare). The `before_protect`
    | callback should resolve the user/premium flag from your own session
    | store or database, not from request headers.
    |
    */
    'access_policy' => [
        // Headers your trusted edge sets for the real client IP. The first
        // matching header is used; falls back to $request->ip().
        'trusted_ip_headers' => [],

        // CIDR ranges allowed to bypass verification (resolved from the IP
        // produced above).
        'allow_cidrs' => [],

        // Verified-crawler policy. UA matching alone is insufficient: an IP
        // must also match a published range, a trusted Cloudflare verified
        // bot signal, or a custom rDNS verifier.
        'crawler' => [
            'enabled' => false,
            // Families to consider; defaults to all known families.
            'families' => null,
            'allow_cloudflare_verified_bot' => false,
            // ['google' => ['66.249.64.0/19'], ...]
            'family_cidrs' => [],
            // 'reverse_dns_verifier' => fn ($ip, $family) => ...,
        ],

        // Optional Closure: fn (Request $request, array $context): array|string
        // Return ['action' => 'allow', 'reason' => 'premium'] or 'continue'.
        'before_protect' => null,
    ],

    /*
    |--------------------------------------------------------------------------
    | Debug Mode
    |--------------------------------------------------------------------------
    |
    | Enable verbose logging for debugging integration issues.
    | Automatically enabled when APP_DEBUG is true if set to null.
    |
    */
    'debug' => env('SHOWAD_DEBUG', null),

];
