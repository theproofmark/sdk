# proofmark-verify

Python SDK for **ProofMark Verify** — the CAPTCHA replacement that pays you instead of charging you.

Drop-in replacement for `hcaptcha`, `recaptcha`, or `turnstile` server-side SDKs.

## Install

```bash
pip install proofmark-verify
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

**Flask:**

```python
from flask import Flask, request, jsonify
from proofmark_verify import ProofMarkVerify
import os

app = Flask(__name__)
pmv = ProofMarkVerify(secret=os.environ['PMV_SECRET_KEY'])

@app.route('/signup', methods=['POST'])
def signup():
    token = request.form.get('pm-verify-response')
    result = pmv.verify(token, remoteip=request.remote_addr)

    if not result.is_human():
        return jsonify({'error': 'Verification failed'}), 400

    # ... proceed with signup
    return jsonify({'message': 'Welcome!'})
```

**Django:**

```python
from django.http import HttpResponse, HttpResponseBadRequest
from proofmark_verify import ProofMarkVerify
import os

pmv = ProofMarkVerify(secret=os.environ['PMV_SECRET_KEY'])

def signup_view(request):
    token = request.POST.get('pm-verify-response')
    result = pmv.verify(token, remoteip=request.META.get('REMOTE_ADDR'))

    if not result.is_human():
        return HttpResponseBadRequest('Verification failed')

    # ... proceed with signup
    return HttpResponse('Welcome!')
```

**Framework-free:**

```python
from proofmark_verify import ProofMarkVerify
import os

pmv = ProofMarkVerify(secret=os.environ['PMV_SECRET_KEY'])
token = form_data.get('pm-verify-response')
result = pmv.verify(token, remoteip=user_ip)

if result.is_human():
    # Proceed with action
    pass
```

## API

### `ProofMarkVerify(secret, base_url=..., timeout=...)`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `secret` | str | (required) | Your secret key (`pmvs_live_…`) |
| `base_url` | str | `https://api.proofmark.com` | Override for self-hosted / dev |
| `timeout` | float | `5.0` | HTTP timeout in seconds |

### `pmv.verify(token, remoteip=None)`

Verify a ProofMark Verify token. Returns `VerifyResult`.

| Parameter | Type | Description |
|---|---|---|
| `token` | str | The `pm-verify-response` token from the client |
| `remoteip` | str | The user's IP address (recommended) |

**Raises:**
- `ProofMarkVerifyError` on network errors, timeouts, or invalid responses

### `VerifyResult`

| Field | Type | Description |
|---|---|---|
| `success` | bool | Token valid + unredeemed + matches your secret |
| `score` | float | 0.0–1.0; higher = more confident human |
| `flags` | list[str] | Risk signals (`datacenter_ip`, `fast_completion`, …) |
| `credit` | bool | True if this was a billable verification |
| `challenge_ts` | str | ISO timestamp when challenge solved |
| `hostname` | str | Where the challenge ran |
| `action` | str | Action label if set |
| `error_codes` | list[str] | Present only when success=False |

### `result.is_human(min_score=0.5)`

Convenience method that returns `result.success and result.score >= min_score`.

## Error handling

The SDK raises `ProofMarkVerifyError` for network/timeout/protocol errors:

```python
from proofmark_verify import ProofMarkVerify, ProofMarkVerifyError

try:
    result = pmv.verify(token)
except ProofMarkVerifyError as e:
    print(f"Error: {e.code} - {e}")
    # e.code is one of:
    # - PMV_TIMEOUT: Request timed out
    # - PMV_NETWORK_ERROR: Network failure
    # - PMV_HTTP_ERROR: Server returned 4xx/5xx
    # - PMV_INVALID_RESPONSE: Invalid JSON response
```

For typical verification failures (invalid token, wrong secret, etc.), `verify()` returns a `VerifyResult` with `success=False` and `error_codes` populated — it does NOT raise an exception.

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

Use `result.flags` to make finer-grained decisions:

| Flag | Meaning |
|---|---|
| `datacenter_ip` | Traffic from a known datacenter |
| `vpn_suspected` | VPN/proxy indicators |
| `fast_completion` | Submitted faster than 90% of humans |
| `low_diversity_session` | Many recent challenges from this IP |
| `no_challenge_shown` | Fail-open token (no ad inventory) |
| `replayed` | Token already redeemed |

## Browser widget

This is the **server-side** SDK. For the browser widget, use:

```html
<script src="https://verify.proofmark.com/api.js" async defer></script>
```

Or install the npm package for programmatic control:

```bash
npm install @proofmark/verify-js
```

## Examples

See [`examples/`](./examples/) for complete Flask and Django applications.

## License

MIT
