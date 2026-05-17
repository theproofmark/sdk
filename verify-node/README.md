# @proofmark/verify-node

Node.js SDK for **ProofMark Verify** — the CAPTCHA replacement that pays you instead of charging you.

Drop-in replacement for `hcaptcha`, `recaptcha`, or `@cloudflare/turnstile` server-side SDKs.

## Install

```bash
npm install @proofmark/verify-node
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

```js
import express from 'express';
import { ProofMarkVerify } from '@proofmark/verify-node';

const app = express();
app.use(express.urlencoded({ extended: true }));

const pmv = new ProofMarkVerify({ secret: process.env.PMV_SECRET_KEY });

app.post('/signup', async (req, res) => {
  const token = req.body['pm-verify-response'];
  const result = await pmv.verify(token, { remoteip: req.ip });

  if (!result.success || result.score < 0.5) {
    return res.status(400).send('Verification failed');
  }

  // ... proceed with signup
  res.send('Welcome!');
});

app.listen(3000);
```

### 3. (Optional) Use the Express middleware

```js
import { proofmarkVerifyMiddleware } from '@proofmark/verify-node/middleware';

app.post(
  '/signup',
  proofmarkVerifyMiddleware({
    secret: process.env.PMV_SECRET_KEY,
    minScore: 0.5,
  }),
  (req, res) => {
    // req.proofmark contains the full VerifyResult
    console.log('score:', req.proofmark.score, 'flags:', req.proofmark.flags);
    res.send('Welcome!');
  }
);
```

## API

### `new ProofMarkVerify(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `secret` | string | (required) | Your secret key (`pmvs_live_…`) |
| `baseUrl` | string | `https://api.proofmark.com` | Override for self-hosted / dev |
| `timeoutMs` | number | `5000` | HTTP timeout in ms |
| `fetchImpl` | `typeof fetch` | global `fetch` | Custom fetch for testing |

### `pmv.verify(token, options?)`

Returns `Promise<VerifyResult>`. Throws `ProofMarkVerifyError` on network errors.

| Option | Type | Description |
|---|---|---|
| `remoteip` | string | The user's IP address (recommended) |

### `VerifyResult`

| Field | Type | Description |
|---|---|---|
| `success` | boolean | Token valid + unredeemed + matches your secret |
| `challenge_ts` | string | ISO timestamp when challenge solved |
| `hostname` | string | Where the challenge ran |
| `action` | string | Action label if set |
| `score` | number | 0.0–1.0; higher = more confident human |
| `flags` | string[] | Risk signals (`datacenter_ip`, `fast_completion`, …) |
| `credit` | boolean | True if this was a billable verification |
| `error-codes` | string[]? | Present only when success=false |

### `proofmarkVerifyMiddleware(options)`

Express middleware. Verifies on `pm-verify-response` from the request body.

| Option | Default | Description |
|---|---|---|
| `secret` | (required) | Your secret key |
| `minScore` | `0` | Reject below this score |
| `tokenField` | `'pm-verify-response'` | Form field name |
| `onFail` | 400 JSON error | Custom failure handler |
| `attachAs` | `'proofmark'` | Property on `req` for the result |
| `baseUrl` | default | Override base URL |
| `timeoutMs` | `5000` | HTTP timeout |
| `failOpenOnNetworkError` | `false` | If true, allow request when siteverify unreachable |

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

## Examples

See [`examples/`](./examples/) for runnable Express applications.

## License

MIT
