# proofmark-verify

Ruby SDK for **ProofMark Verify** — the CAPTCHA replacement that pays you instead of charging you.

Drop-in replacement for `hcaptcha`, `recaptcha`, or `cloudflare-turnstile` server-side SDKs.

## Install

```bash
gem install proofmark-verify
```

Or in your `Gemfile`:

```ruby
gem "proofmark-verify"
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

**Plain Ruby:**

```ruby
require "proofmark-verify"

client = ProofMark::Verify::Client.new(secret: ENV["PMV_SECRET_KEY"])

token = params["pm-verify-response"]
result = client.verify(token, remoteip: request.remote_ip)

if result.human?(0.5)
  puts "Verified human! Score: #{result.score}"
  # ... proceed with signup
else
  puts "Verification failed"
end
```

**Rails controller:**

```ruby
class SignupsController < ApplicationController
  def create
    client = ProofMark::Verify::Client.new(secret: ENV["PMV_SECRET_KEY"])
    token = params["pm-verify-response"]
    result = client.verify(token, remoteip: request.remote_ip)

    if result.human?(0.5)
      # Human verified!
      user = User.create!(email: params[:email], ...)
      redirect_to dashboard_path, notice: "Welcome!"
    else
      flash.now[:error] = "Please complete the verification"
      render :new, status: :unprocessable_entity
    end
  rescue ProofMark::Verify::Error => e
    # Network/timeout error — fail-closed or fail-open policy
    Rails.logger.error "ProofMark error: [#{e.code}] #{e.message}"
    flash.now[:error] = "Verification unavailable. Try again."
    render :new, status: :service_unavailable
  end
end
```

See [`examples/rails_controller.rb`](./examples/rails_controller.rb) for a complete example.

## API

### `ProofMark::Verify::Client.new(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `secret` | String | (required) | Your secret key (`pmvs_live_…`) |
| `base_url` | String | `https://api.proofmark.com` | Override for self-hosted / dev |
| `timeout` | Integer | `5` | HTTP timeout in seconds |

Convenience shorthand: `ProofMark::Verify.new(...)` returns a `Client`.

### `client.verify(token, remoteip: nil)`

Returns a `ProofMark::Verify::Result`. Raises `ProofMark::Verify::Error` on network/timeout/HTTP errors.

| Argument | Type | Description |
|---|---|---|
| `token` | String | The string from `pm-verify-response` form field |
| `remoteip` | String (optional) | The user's IP address (recommended) |

### `Result` fields

| Field | Type | Description |
|---|---|---|
| `success` | Boolean | Token valid + unredeemed + matches your secret |
| `success?` | Boolean | Alias for `success` |
| `score` | Float | 0.0–1.0; higher = more confident human |
| `flags` | Array<String> | Risk signals (`datacenter_ip`, `fast_completion`, …) |
| `credit` | Boolean | True if this was a billable verification |
| `challenge_ts` | String | ISO timestamp when challenge solved |
| `hostname` | String | Where the challenge ran |
| `action` | String | Action label if set |
| `error_codes` | Array<String> | Present only when success=false |

### `result.human?(min_score = 0.5)`

Convenience method that returns `true` if `success && score >= min_score`.

```ruby
result.human?       # uses default 0.5 threshold
result.human?(0.7)  # custom threshold
```

## Error handling

When the SDK can't reach the siteverify endpoint or receives an invalid response, it raises a `ProofMark::Verify::Error`:

```ruby
begin
  result = client.verify(token)
rescue ProofMark::Verify::Error => e
  puts "Error code: #{e.code}"
  puts "Message: #{e.message}"
end
```

Error codes:

| Code | Meaning |
|---|---|
| `PMV_TIMEOUT` | Request timed out |
| `PMV_NETWORK_ERROR` | Network failure (DNS, connection refused, etc.) |
| `PMV_HTTP_ERROR` | HTTP 4xx/5xx response |
| `PMV_INVALID_RESPONSE` | Response body was not valid JSON |

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

## Requirements

- Ruby >= 2.6
- Standard library only (no external gem dependencies)

## License

MIT
