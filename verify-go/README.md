# verify-go

Go SDK for **ProofMark Verify** — the CAPTCHA replacement that pays you instead of charging you.

Drop-in replacement for `hcaptcha`, `recaptcha`, or `turnstile` server-side SDKs.

## Install

```bash
go get github.com/proofmark/verify-go
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

#### net/http

```go
package main

import (
    "context"
    "net/http"
    "os"

    "github.com/proofmark/verify-go"
)

func signupHandler(w http.ResponseWriter, r *http.Request) {
    token := r.FormValue("pm-verify-response")

    client := proofmarkverify.New(os.Getenv("PMV_SECRET_KEY"))
    result, err := client.Verify(r.Context(), token, r.RemoteAddr)
    if err != nil {
        http.Error(w, "Verification failed", http.StatusInternalServerError)
        return
    }

    if !result.IsHuman(0.5) {
        http.Error(w, "Verification failed", http.StatusBadRequest)
        return
    }

    // ... proceed with signup
    w.Write([]byte("Welcome!"))
}

func main() {
    http.HandleFunc("/signup", signupHandler)
    http.ListenAndServe(":8080", nil)
}
```

#### Gin

```go
import (
    "github.com/gin-gonic/gin"
    "github.com/proofmark/verify-go"
)

func signupHandler(c *gin.Context) {
    token := c.PostForm("pm-verify-response")

    client := proofmarkverify.New(os.Getenv("PMV_SECRET_KEY"))
    result, err := client.Verify(c.Request.Context(), token, c.ClientIP())
    if err != nil {
        c.JSON(500, gin.H{"error": "verification failed"})
        return
    }

    if !result.IsHuman(0.5) {
        c.JSON(400, gin.H{"error": "verification failed"})
        return
    }

    c.JSON(200, gin.H{"message": "Welcome!", "score": result.Score})
}
```

## API

### `proofmarkverify.New(secret, opts...)`

Creates a new client for server-side token verification.

| Option | Description |
|---|---|
| `WithBaseURL(url)` | Override default base URL (`https://api.proofmark.com`) for self-hosted / dev |
| `WithTimeout(duration)` | Set HTTP timeout (default: 5 seconds) |
| `WithHTTPClient(client)` | Use a custom `*http.Client` for testing or custom transport |

```go
client := proofmarkverify.New(
    "pmvs_live_xxxxxxxx",
    proofmarkverify.WithBaseURL("http://localhost:8080"),
    proofmarkverify.WithTimeout(10 * time.Second),
)
```

### `client.Verify(ctx, token, remoteip)`

Verifies a ProofMark Verify token server-side.

| Parameter | Type | Description |
|---|---|---|
| `ctx` | `context.Context` | Request context (use `context.Background()` if none available) |
| `token` | `string` | The `pm-verify-response` value from the client form |
| `remoteip` | `string` | The end-user's IP address (optional but recommended) |

Returns `(*VerifyResult, error)`. On success or typical verification failures (e.g., invalid token, low score), returns a `VerifyResult` and `nil` error. Returns a non-nil `error` only on network errors, timeouts, non-2xx HTTP responses, or invalid JSON.

### `VerifyResult`

| Field | Type | Description |
|---|---|---|
| `Success` | `bool` | Token valid + unredeemed + matches your secret |
| `Score` | `float64` | 0.0–1.0; higher = more confident human |
| `Flags` | `[]string` | Risk signals (`datacenter_ip`, `fast_completion`, …) |
| `Credit` | `bool` | True if this was a billable verification |
| `ChallengeTS` | `string` | ISO timestamp when challenge solved |
| `Hostname` | `string` | Where the challenge ran |
| `Action` | `string` | Action label if set |
| `ErrorCodes` | `[]string` | Present only when `Success=false` |

### `result.IsHuman(minScore)`

Helper method that returns `true` if `Success && Score >= minScore`.

```go
if result.IsHuman(0.5) {
    // User is human with score >= 0.5
}
```

### `VerifyError`

Returned on network errors, timeouts, HTTP errors, or invalid responses. Implements `error` and supports `errors.As` / `errors.Is`.

| Code | Description |
|---|---|
| `PMV_CONFIG` | Missing or invalid configuration (e.g., empty secret) |
| `PMV_TIMEOUT` | Verification request timed out |
| `PMV_NETWORK_ERROR` | Network error during request |
| `PMV_HTTP_ERROR` | Non-2xx HTTP response |
| `PMV_INVALID_RESPONSE` | Invalid JSON response |

```go
result, err := client.Verify(ctx, token, remoteip)
if err != nil {
    var verifyErr *proofmarkverify.VerifyError
    if errors.As(err, &verifyErr) {
        log.Printf("verify error [%s]: %s", verifyErr.Code, verifyErr.Message)
    }
    return
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

Use `result.Flags` to make finer-grained decisions:

| Flag | Meaning |
|---|---|
| `datacenter_ip` | Traffic from a known datacenter |
| `vpn_suspected` | VPN/proxy indicators |
| `fast_completion` | Submitted faster than 90% of humans |
| `low_diversity_session` | Many recent challenges from this IP |
| `no_challenge_shown` | Fail-open token (no ad inventory) |
| `replayed` | Token already redeemed |

## Examples

See [`examples/main.go`](./examples/main.go) for a runnable net/http application.

## Browser widget

This SDK verifies tokens server-side. For the browser widget, use:

```html
<script src="https://verify.proofmark.com/api.js" async defer></script>
```

Or install via npm:

```bash
npm install @proofmark/verify-js
```

## License

MIT
