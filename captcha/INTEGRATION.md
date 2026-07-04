# ProofMark Verify — End-to-End Integration Guide

This guide walks through integrating **ProofMark Verify** into a real application,
client through server. It covers all three client paths (CDN/vanilla, npm/explicit,
React) plus server-side token verification (`@proofmark/verify-node`).

A full working reference implementation (Next.js login flow) lives at
[`integrations/captcha`](../../integrations/captcha) — this guide explains the pieces
it wires together.

## Architecture

```
┌────────────┐   1. render widget    ┌──────────────────┐
│  Browser   │──────────────────────▶│ verify.proofmark  │  api.js + challenge UI
│ (your site)│                       │   .com            │  (video ad + question)
└─────┬──────┘◀──────────────────────└──────────────────-┘
      │ 2. pm-verify-response token
      ▼
┌────────────┐   3. POST siteverify  ┌──────────────────┐
│ Your server │─────────────────────▶│ api.proofmark.com │  validates token,
│ (verify-node)│◀─────────────────────│ /v1/verify/       │  returns score+flags
└────────────┘   4. {success,score}  │ siteverify         │
                                     └──────────────────-┘
```

1. The widget (client SDK) renders a checkbox; on click it opens a modal, plays a
   short video ad + comprehension question, and on success mints a single-use token.
2. The token is placed into a hidden form field (`pm-verify-response`) or handed to
   your `onToken` callback.
3. Your backend sends that token to ProofMark's `siteverify` endpoint using
   `@proofmark/verify-node` (or a raw HTTP POST in any other language).
4. ProofMark returns `{ success, score, flags, ... }`. Your backend decides whether
   to proceed based on `score` and `flags`.

**Never trust the token client-side.** The only trustworthy signal is the server-side
`verify()` result.

### Security model (what happens under the hood)

Beyond the token flow above, every challenge attempt carries defense-in-depth signal
collection and encrypted transport — none of it requires integration work on your part
beyond optionally handling a lockout (see [Error handling](#error-handling)):

- **Two independent device fingerprints.** The widget (running on *your* origin)
  collects a lightweight composite fingerprint; the challenge iframe (running on
  `verify.proofmark.com`) independently collects a full FingerprintJS-based composite
  fingerprint. ProofMark cross-checks the two — a mismatch (e.g. a solver farm driving
  the iframe directly, skipping your site entirely) is a strong fraud signal that's
  only possible to catch *because* Verify is cross-origin.
- **Traffic-integrity signals.** WebGL vendor/renderer, screen/timezone/language
  signals are collected to flag headless or automated browsers (e.g. SwiftShader /
  llvmpipe software-rendering signatures).
- **Encrypted + signed requests.** The initial challenge request and the final answer
  submission are encrypted (AES-256-GCM + RSA-OAEP, using a public key ProofMark
  rotates and exposes at `/v1/verify/security/public-key`). The submission from the
  challenge iframe is additionally signed with a per-challenge, non-extractable ECDSA
  P-256 key to prevent replay.
- **Enforced video watch-time.** The server tracks real viewability telemetry
  (play/pause/quartiles/visibility) from the challenge iframe and rejects submissions
  that don't meet a minimum watch-time threshold — the video is not just decorative.
- **Penalty escalation + frequency capping.** Repeated failures or fraud signals from
  the same fingerprint+IP escalate through minor → moderate → severe lockout tiers
  (surfaced to your integration via `onLockout`/`'lockout-callback'`, see below).
  Frequency capping avoids repeatedly showing the same clip/question to the same
  visitor.

## Step 0 — Get your keys

Sign up at the [ProofMark dashboard](https://proofmark.com) and create a site to get:

- A **site key** (`pmv_live_…`) — public, goes in client code.
- A **secret key** (`pmvs_live_…`) — private, server-only, never ship to the browser.

For local development without real credentials, use the built-in [test keys](#test-keys-for-local-dev--ci).

## Step 1 — Add the client widget

Pick the path that matches your stack.

### 1a. Plain HTML / CDN (framework-agnostic)

Fastest path, no build step. Auto-renders any `.pm-verify` element:

```html
<script src="https://verify.proofmark.com/api.js" async defer></script>
<form action="/login" method="POST">
  <input type="email" name="email" required />
  <div class="pm-verify" data-sitekey="pmv_live_xxxxxxxx" data-action="login"></div>
  <button type="submit">Sign in</button>
</form>
```

On success the widget injects `<input type="hidden" name="pm-verify-response" value="...">`
into the form automatically — a normal POST carries the token, no JS required.

Supported `data-*` attributes: `data-sitekey` (required), `data-action`, `data-theme`
(`light`/`dark`/`auto`), `data-lang`, `data-callback`, `data-error-callback`,
`data-expired-callback`, `data-lockout-callback`. See [`packages/core/README.md`](./packages/core/README.md).

### 1b. npm + explicit render (any framework)

```bash
npm install @proofmark/verify-js
```

```html
<script src="https://verify.proofmark.com/api.js?render=explicit" async defer></script>
<div id="my-widget"></div>
<script>
  window.pmverify.render('my-widget', {
    sitekey: 'pmv_live_xxxxxxxx',
    action: 'login',
    callback: (token) => console.log('token:', token),
    'expired-callback': () => console.log('expired'),
    'error-callback': (code) => console.log('error:', code),
  });
</script>
```

Use this when you need to control *when* the widget renders (SPA route changes,
conditionally-shown forms, etc).

### 1c. React

```bash
npm install @proofmark/verify-react
```

```tsx
'use client';
import { useRef, useState } from 'react';
import { ProofMarkVerify, type ProofMarkVerifyHandle } from '@proofmark/verify-react';

export function LoginForm({ siteKey }: { siteKey: string }) {
  const verifyRef = useRef<ProofMarkVerifyHandle>(null);
  const [token, setToken] = useState<string | null>(null);
  const [lockoutMsg, setLockoutMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (token) fd.set('pm-verify-response', token);

    const res = await fetch('/api/login', { method: 'POST', body: fd });
    if (!res.ok) {
      verifyRef.current?.reset(); // tokens are single-use — always reset on failure
      setToken(null);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="email" type="email" required />
      <ProofMarkVerify
        ref={verifyRef}
        siteKey={siteKey}
        onToken={setToken}
        onExpire={() => setToken(null)}
        onLockout={(info) => setLockoutMsg(`Too many attempts, try again in ${info.retryAfterSec}s`)}
        action="login"
      />
      {lockoutMsg && <p role="alert">{lockoutMsg}</p>}
      <button type="submit" disabled={!token}>Sign in</button>
    </form>
  );
}
```

Full prop/hook reference: [`packages/react/README.md`](./packages/react/README.md).
Runnable snippet: [`examples/react-login/README.md`](./examples/react-login/README.md).
Working Next.js app: [`integrations/captcha/app/login/login-form.tsx`](../../integrations/captcha/app/login/login-form.tsx).

## Step 2 — Send the token to your server

However your framework does it — form POST, `fetch`, server action — the token must
reach your backend as `pm-verify-response` (or whatever field name you choose, if
you're using the raw API rather than the hidden-input convention).

## Step 3 — Verify server-side

```bash
npm install @proofmark/verify-node
```

### Manual verification

```js
import { ProofMarkVerify } from '@proofmark/verify-node';

const pmv = new ProofMarkVerify({ secret: process.env.PMV_SECRET_KEY });

const token = req.body['pm-verify-response'];
const result = await pmv.verify(token, { remoteip: req.ip });

if (!result.success || result.score < 0.5) {
  return res.status(400).send('Verification failed');
}
// proceed
```

### Express middleware (optional shortcut)

```js
import { proofmarkVerifyMiddleware } from '@proofmark/verify-node/middleware';

app.post(
  '/signup',
  proofmarkVerifyMiddleware({ secret: process.env.PMV_SECRET_KEY, minScore: 0.5 }),
  (req, res) => {
    console.log('score:', req.proofmark.score, 'flags:', req.proofmark.flags);
    res.send('Welcome!');
  }
);
```

### Not using Node?

POST directly to the same endpoint the SDK calls:

```
POST {PMV_API_BASE}/v1/verify/siteverify
Content-Type: application/json

{ "secret": "pmvs_live_xxx", "response": "<token>", "remoteip": "1.2.3.4" }
```

Response shape matches `VerifyResult` below.

### `VerifyResult`

| Field | Type | Description |
|---|---|---|
| `success` | boolean | Token valid + unredeemed + matches your secret |
| `challenge_ts` | string | ISO timestamp when challenge solved |
| `hostname` | string | Where the challenge ran |
| `action` | string | Action label if set |
| `score` | number | 0.0–1.0; higher = more confident human |
| `flags` | string[] | Risk signals (see below) |
| `credit` | boolean | True if this was a billable verification |
| `error-codes` | string[]? | Present only when `success=false` |

Full server API (options, error types): [`sdks/verify-node/README.md`](../verify-node/README.md).

## Step 4 — Choose a score threshold

`score` is 0–1; there's no universal cutoff — pick based on how costly a false
accept is for that specific action:

| Use case | Min score |
|---|---|
| Newsletter signup | `0.3` |
| Free trial signup | `0.5` |
| Paid signup w/ card | `0.6` |
| Forum post | `0.4` |
| Password reset | `0.7` |
| Login (suspicious context) | `0.7` |

Use `result.flags` for finer-grained decisions instead of a hard reject:

| Flag | Meaning |
|---|---|
| `datacenter_ip` | Traffic from a known datacenter |
| `vpn_suspected` | VPN/proxy indicators |
| `fast_completion` | Submitted faster than 90% of humans |
| `low_diversity_session` | Many recent challenges from this IP |
| `no_challenge_shown` | Fail-open token (no ad inventory) |
| `replayed` | Token already redeemed |
| `known_bot_ua` / `automation_ua` | User-agent matches a known bot or automation tool signature |
| `automation_webgl` | WebGL renderer indicates headless/software rendering (e.g. SwiftShader, llvmpipe) |
| `header_fingerprint_mismatch` | HTTP header fingerprint changed between challenge and submit (possible replay from a different network) |
| `fingerprint_mismatch_cross_origin` | Widget-side and embed-iframe fingerprints don't correlate (possible solver farm bypassing your site) |
| `high_velocity_fingerprint_ip` / `high_velocity_fingerprint_hostname` | Unusually high challenge rate for this fingerprint+IP or fingerprint+hostname pair |
| `missing_hostname` / `missing_ua` | Required request context absent — often scripted traffic |

A lockout (see [Error handling](#error-handling)) is distinct from these flags — it's a
penalty state applied server-side after repeated failures/fraud, surfaced via
`error-codes: ['locked-out']` rather than as a `flags` entry on a successful `verify()`.

## Local development

### Test keys for local dev / CI

Bypass real ad delivery + verification entirely:

| Site key | Secret key | Behavior |
|---|---|---|
| `pmv_test_always_pass` | `pmvs_test_always_pass` | Always succeeds, score 0.8 |
| `pmv_test_always_fail` | `pmvs_test_always_fail` | Always fails |
| `pmv_test_score_low` | `pmvs_test_score_low` | Succeeds with score 0.1 |

### Pointing at a local/self-hosted backend

The widget defaults to `https://verify.proofmark.com` (script) and
`https://api.proofmark.com` (challenge/verify API). Override per client:

| Client | How |
|---|---|
| Vanilla HTML | `<meta name="pmv-api-base" content="http://localhost:8080" />` in `<head>` |
| `@proofmark/verify-js` | same meta tag |
| `@proofmark/verify-react` | `<ProofMarkVerify scriptBaseUrl="http://localhost:8080" />` |
| `@proofmark/verify-node` | `new ProofMarkVerify({ secret, baseUrl: 'http://localhost:8080' })` |

The full-stack example wires these through env vars — see
[`integrations/captcha/.env.local`](../../integrations/captcha/.env.local) and its
[README](../../integrations/captcha/README.md) for the four-variable pattern
(`NEXT_PUBLIC_PMV_SITE_KEY`, `NEXT_PUBLIC_PMV_SCRIPT_BASE_URL`,
`NEXT_PUBLIC_PMV_API_BASE`, `PMV_SECRET_KEY`, `PMV_API_BASE`).

### Building the SDKs from source

If consuming via local `file:` link (monorepo dev) rather than the npm registry:

```bash
cd sdks/captcha
npm install
npm run build     # builds core, then react
npm test          # runs all workspace tests
npm run sync      # copies core/dist/api.js -> frontend/public/verify/api.js
```

## Token lifecycle

- **Single-use** — each token can only be verified once server-side; a second
  `verify()` call for the same token returns `success: false` with the `replayed` flag.
- **Short-lived** — tokens expire ~270s after the challenge completes. The
  `expired-callback` / `onExpire` fires when this happens; treat the widget as
  needing a fresh challenge.
- **Reset after server failure** — since tokens are single-use, always call
  `reset(widgetId)` (vanilla/core) or `ref.current.reset()` (React) after a failed
  server-side verification, so the user can retry without a stale token blocking them.

## Error handling

Client-side errors surface via `error-callback` / `onError` with a string code
(e.g. `script-load-failed`, `network-error`). A penalty lockout (see
[Security model](#security-model-what-happens-under-the-hood) above) is a distinct
case: it surfaces via `'lockout-callback'` / `onLockout` with
`{ code: 'locked-out', tier, retryAfterSec }` instead of `error-callback`, so you can
show a "try again in Ns" message rather than a generic error. If you don't register a
lockout callback, it falls back to `error-callback('locked-out')`. The widget itself
already renders a disabled, non-interactive checkbox for the duration of the lockout
and re-enables automatically — you don't need to call `reset()` for this case.

Server-side, `verify()` throws
`ProofMarkVerifyError` on network/timeout/non-2xx/invalid-JSON — decide whether to
fail open or fail closed:

```js
try {
  const result = await pmv.verify(token);
  if (!result.success || result.score < threshold) return reject();
} catch {
  // Network/backend issue reaching ProofMark, not a failed verification.
  // Fail closed in production; consider failing open in dev/self-hosted setups
  // where the backend may not be running.
  if (process.env.NODE_ENV === 'production') return reject();
}
```

## Security checklist

- [ ] Secret key (`pmvs_live_…`) only ever referenced server-side (env var), never
      bundled into client JS.
- [ ] Server always calls `verify()` — never trust `success`/`score` if computed
      client-side or skip verification because "the widget already checked it".
- [ ] Pass `remoteip` to `verify()` when available for better bot signal.
- [ ] Reject on missing/empty token rather than treating it as optional, once a
      secret key is configured for that environment.
- [ ] Don't log full tokens or secret keys.

## Production deployment checklist

- [ ] Site key allow-list in the ProofMark dashboard includes your production domain(s).
- [ ] `scriptBaseUrl`/`baseUrl`/meta-tag overrides are dev-only and removed (or
      env-gated) in production builds, so the widget/SDK hit the real
      `verify.proofmark.com` / `api.proofmark.com`.
- [ ] Score threshold chosen per-action (see table above), not a single global value.
- [ ] Server-side verification failure path fails closed (rejects the request) in
      production.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Widget never renders | `api.js` blocked/failed to load, or wrong `data-sitekey` |
| `onError('script-load-failed')` | Script blocked by CSP, adblock, or network; check `scriptBaseUrl` |
| Server `verify()` always fails | Secret/site key mismatch, or token already consumed (`replayed`) |
| Works locally, fails in prod | Domain not allow-listed for the site key, or dev-only `baseUrl` override shipped to prod |
| Token missing in form POST | Field name isn't `pm-verify-response`, or widget hasn't completed yet — gate submit on token presence |
| Widget shows a disabled/locked checkbox after a few failed attempts | Expected — penalty escalation locked out this fingerprint+IP; it re-enables automatically after `retryAfterSec` (see `onLockout`/`'lockout-callback'`) |

## Reference implementation

See [`integrations/captcha`](../../integrations/captcha) for a complete, runnable
Next.js app wiring `@proofmark/verify-react` (client) and `@proofmark/verify-node`
(server action) together end to end, including dev-mode fallback when no secret key
is configured.

## Per-package docs

- [`sdks/captcha/README.md`](./README.md) — SDK repo overview
- [`sdks/captcha/packages/core/README.md`](./packages/core/README.md) — `@proofmark/verify-js` full API
- [`sdks/captcha/packages/react/README.md`](./packages/react/README.md) — `@proofmark/verify-react` full API
- [`sdks/verify-node/README.md`](../verify-node/README.md) — `@proofmark/verify-node` full API
