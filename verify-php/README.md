# proofmark/verify-php

PHP SDK for **ProofMark Verify** — the CAPTCHA replacement that pays you instead of charging you.

Drop-in replacement for `recaptcha`, `hcaptcha`, or `turnstile` server-side PHP libraries.

## Install

```bash
composer require proofmark/verify-php
```

## Quick start

### 1. Add the widget to your HTML

```html
<script src="https://verify.proofmark.com/api.js" async defer></script>
<form action="/signup" method="POST">
  <input type="email" name="email" required />
  <div class="pm-verify" data-sitekey="pmv_live_xxxxxxxx"></div>
  <button type="submit">Sign up</button>
</form>
```

### 2. Verify the token server-side

#### Plain PHP

```php
<?php
require 'vendor/autoload.php';

use ProofMark\Verify\ProofMarkVerify;

$token = $_POST['pm-verify-response'] ?? '';
$pmv = new ProofMarkVerify($_ENV['PMV_SECRET_KEY']);

try {
    $result = $pmv->verify($token, $_SERVER['REMOTE_ADDR']);

    if ($result->isHuman()) {
        // Proceed with signup
        echo "Welcome!";
    } else {
        http_response_code(400);
        echo "Verification failed";
    }
} catch (\ProofMark\Verify\ProofMarkVerifyException $e) {
    error_log("ProofMark error: {$e->getMessage()}");
    http_response_code(500);
    echo "Service unavailable";
}
```

#### Laravel

```php
use ProofMark\Verify\ProofMarkVerify;
use ProofMark\Verify\ProofMarkVerifyException;

class SignupController extends Controller
{
    public function store(Request $request)
    {
        $token = $request->input('pm-verify-response');
        $pmv = new ProofMarkVerify(env('PMV_SECRET_KEY'));

        try {
            $result = $pmv->verify($token, $request->ip());

            if (!$result->isHuman(0.5)) {
                return back()->withErrors([
                    'pm-verify-response' => 'Verification failed'
                ]);
            }

            // ... proceed with signup
            return redirect()->route('dashboard');

        } catch (ProofMarkVerifyException $e) {
            \Log::error('ProofMark error', ['code' => $e->errorCode]);
            return back()->withErrors([
                'pm-verify-response' => 'Service unavailable'
            ]);
        }
    }
}
```

See [`examples/laravel-controller.php`](./examples/laravel-controller.php) for a complete Laravel example.

## API

### `new ProofMarkVerify(string $secret, string $baseUrl = 'https://api.proofmark.com', int $timeoutMs = 5000)`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `$secret` | string | (required) | Your secret key (`pmvs_live_…`) |
| `$baseUrl` | string | `https://api.proofmark.com` | Override for self-hosted / dev |
| `$timeoutMs` | int | `5000` | HTTP timeout in milliseconds |

### `verify(string $token, ?string $remoteip = null): VerifyResult`

Verifies a ProofMark Verify token.

| Parameter | Type | Description |
|---|---|---|
| `$token` | string | The `pm-verify-response` token from the client |
| `$remoteip` | string\|null | The user's IP address (recommended) |

**Returns:** `VerifyResult`

**Throws:** `ProofMarkVerifyException` on network/timeout/HTTP/JSON errors

### `VerifyResult`

| Property | Type | Description |
|---|---|---|
| `$success` | bool | Token valid + unredeemed + matches your secret |
| `$score` | float | 0.0–1.0; higher = more confident human |
| `$flags` | string[] | Risk signals (`datacenter_ip`, `fast_completion`, …) |
| `$credit` | bool | True if this was a billable verification |
| `$challengeTs` | string\|null | ISO timestamp when challenge solved |
| `$hostname` | string\|null | Where the challenge ran |
| `$action` | string\|null | Action label if set |
| `$errorCodes` | string[] | Present only when success=false |

#### `isHuman(float $minScore = 0.5): bool`

Convenience method: returns `$success && $score >= $minScore`.

```php
if ($result->isHuman()) {
    // Default threshold 0.5
}

if ($result->isHuman(0.7)) {
    // Stricter threshold for sensitive operations
}
```

## Error handling

`ProofMarkVerify::verify()` throws `ProofMarkVerifyException` on network/HTTP/JSON errors. The exception has a public readonly `$errorCode` property:

| Code | Meaning |
|---|---|
| `PMV_TIMEOUT` | HTTP request timed out |
| `PMV_NETWORK_ERROR` | Network/cURL error |
| `PMV_HTTP_ERROR` | siteverify returned non-2xx status |
| `PMV_INVALID_RESPONSE` | Response is not valid JSON |

```php
try {
    $result = $pmv->verify($token, $remoteip);
} catch (ProofMarkVerifyException $e) {
    if ($e->errorCode === 'PMV_TIMEOUT') {
        // Handle timeout
    }
    error_log("ProofMark error [{$e->errorCode}]: {$e->getMessage()}");
}
```

## Test keys

For local dev / CI, use these test keys that bypass real verification:

| Site key | Secret key | Behavior |
|---|---|---|
| `pmv_test_always_pass` | `pmvs_test_always_pass` | Always succeeds, score 0.8 |
| `pmv_test_always_fail` | `pmvs_test_always_fail` | Always fails |
| `pmv_test_score_low` | `pmvs_test_score_low` | Succeeds with score 0.1 |

## Score thresholds (recommended)

| Use case | Min score |
|---|---|
| Newsletter signup | `0.3` |
| Free trial signup | `0.5` |
| Paid signup w/ card | `0.6` |
| Forum post | `0.4` |
| Password reset | `0.7` |
| Login (suspicious context) | `0.7` |

## Risk flags

Use `$result->flags` to make finer-grained decisions:

| Flag | Meaning |
|---|---|
| `datacenter_ip` | Traffic from a known datacenter |
| `vpn_suspected` | VPN/proxy indicators |
| `fast_completion` | Submitted faster than 90% of humans |
| `low_diversity_session` | Many recent challenges from this IP |
| `no_challenge_shown` | Fail-open token (no ad inventory) |
| `replayed` | Token already redeemed |

```php
$result = $pmv->verify($token, $remoteip);

if (in_array('datacenter_ip', $result->flags)) {
    // Additional checks for datacenter traffic
}
```

## Requirements

- PHP 8.1 or higher
- ext-curl
- ext-json

## License

MIT
