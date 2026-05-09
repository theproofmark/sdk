# ShowAd Content Gate — Shopify SDK

Production-ready Shopify integration for ProofMark **ShowAd**. Drop the
**ShowAd Gate** app block on any storefront page or section to gate the
content behind a short video ad. Visitors who watch the ad get a JWT-backed
unlock that lasts for the configured cookie lifetime.

> **Requires:** A Shopify Partner account, an installed app with `app_proxy`
> enabled, and a public HTTPS URL for the Node app (`SHOPIFY_APP_URL`).

---

## Why Shopify is different

Shopify storefronts have **no merchant-controlled server middleware**, so we
cannot run protect() inline like the WordPress / Next.js / Laravel SDKs do.
Instead we use the two officially-supported integration points:

1. **Theme App Extension** — a Liquid app block (`extensions/showad-content-gate/blocks/showad-gate.liquid`) plus a small vanilla-JS client. The block is installed by the merchant from the theme editor.
2. **App Proxy** — a configurable URL prefix (`/apps/showad-gate/*` on the storefront domain) that Shopify forwards to your Node app. Used to keep all secrets server-side.

```
                       (storefront domain — same origin as the page)
   visitor ─► /apps/showad-gate/proxy/state  ─► [Shopify edge]
                                              │   verifies merchant + signs req
                                              ▼
                                   your Node app (Remix on SHOPIFY_APP_URL)
                                              │
                                              ├─ verify HMAC
                                              ├─ load shop config (Prisma)
                                              ├─ run protect() (ProofMark JWT)
                                              ▼
                                          { verified, redirectUrl }
   visitor ◄─ 200 application/json     ◄──────┘
```

---

## Architecture

### Two cookies, one origin

The visitor stores two **first-party storefront cookies** (`showad_token` and
`showad_fingerprint`) on the merchant's `*.myshopify.com` (or custom) domain.
The theme block reads them from `document.cookie` and forwards them to the
proxy in the request body.

### Why JS-managed cookies (and not `Set-Cookie` from the proxy)?

The Shopify docs explicitly state that the **App Proxy strips both
`Cookie` (request) and `Set-Cookie` (response) headers** for security
reasons (because the proxy runs under the shop's own domain). See:
<https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies#handling-proxy-requests>.

So instead of:

```
proxy response  ──► Set-Cookie: showad_token=…; HttpOnly      ❌ stripped
```

we do:

```
proxy response  ──► { token: "…", expiresAt: …, … }            ✅ JSON
storefront JS   ──► document.cookie = "showad_token=…; …"      ✅ first-party
```

The token cookie is therefore JS-readable (not `HttpOnly`). To compensate:

* `cookieMaxAge` defaults to **3600s** (1 hour) and is configurable per-shop.
* Every storefront → proxy call still goes through Shopify's **HMAC-signed
  app-proxy URL** so a third-party site cannot forge it.
* Tokens are pre-checked server-side for creator hash, fingerprint, issuer,
  and expiry, then validated against `/api/sdk/validate`; a forged cookie value
  cannot unlock protected content.
* Shop credentials (`SHOWAD_API_KEY`, `SHOWAD_REDIRECT_SECRET`) **never leave
  the Node app**.

### Flow

```
                   ┌─────────────────────────────────┐
 1. Visitor opens  │  storefront page with the block │
 the gated page    └─────────────┬───────────────────┘
                                 │ POST /apps/showad-gate/proxy/state
                                 │ { token, fingerprint, protected_path }
                                 ▼
                       ┌────────────────────┐
                       │  /proxy/state      │  ── HMAC ── shop config ──
                       │  (Remix loader)    │      protect() (no API call when token already valid)
                       └─────────┬──────────┘
                                 │ JSON: { verified: false, redirectUrl: "https://showad.proofmark.io/c/<creator>?return_url=…&sdk=1" }
                                 ▼
              ┌───────────────────────────────────────┐
              │  block reveals locked state + button  │
              └───────────────┬───────────────────────┘
                              │ click
                              ▼
                  https://showad.proofmark.io/c/<creator>?return_url=<storefront page>&sdk=1
                              │
                  visitor watches video ad
                              │
                              ▼
                  storefront page reopens with ?redirect_ticket=<id>
                              │ POST /apps/showad-gate/proxy/claim
                              │ { redirect_ticket, fingerprint, return_path }
                              ▼
                       ┌────────────────────┐
                       │  /proxy/claim      │  ── HMAC ── claimRedirectTicket ──
                       │  (Remix action)    │       returns JWT (ProofMark signed)
                       └─────────┬──────────┘
                                 │ JSON: { verified: true, token, expiresAt, cookieMaxAge }
                                 ▼
                  block stores token cookie, strips ?redirect_ticket from URL,
                  re-runs /state which now returns { verified: true } and reveals content.
```

---

## Repository layout

```
sdks/shopify/
├── README.md                  ← this file
├── package.json               ← root: tsx + typescript for running tests
├── extensions/
│   └── showad-content-gate/   ← Theme App Extension (deployable with `shopify app deploy`)
│       ├── shopify.extension.toml   type = "theme", api_version = "2024-10"
│       ├── blocks/
│       │   └── showad-gate.liquid   App block schema (button text, locked message, paths)
│       ├── snippets/
│       │   └── showad-fingerprint.liquid   Generates and persists `showad_fingerprint`
│       └── assets/
│           ├── showad-client.js     Vanilla JS client — calls /state, /claim, manages cookie
│           └── showad-gate.css      Light + dark theme styles
└── app/                       ← Remix-style Node app for the App Proxy + embedded admin
    ├── package.json           Shopify App Remix template (run with `shopify app dev`)
    ├── shopify.app.toml       App config (app_proxy: prefix=apps, subpath=showad-gate)
    ├── shopify.web.toml       Web config (predev runs `prisma generate`)
    ├── prisma/schema.prisma   `Session` and `ShowAdConfig` models (sqlite by default)
    ├── env.example            All required env vars
    └── app/
        ├── routes/
        │   ├── proxy.state.tsx    GET/POST: HMAC verify → protect() → JSON verdict
        │   ├── proxy.claim.tsx    POST: HMAC verify → claim ticket → JSON { token }
        │   ├── app.dashboard.tsx  Embedded admin (Polaris): status + protected paths
        │   └── app.settings.tsx   Embedded admin: per-shop credentials + paths + access policy
        ├── lib/
        │   ├── shopify-proxy-hmac.ts   Pure HMAC-SHA256 verifier
        │   ├── shop-config.ts          Per-shop config (Prisma) with optional AES-256-GCM at rest
        │   └── proofmark/
        │       ├── jwt.ts              Claim-only validation (mirrors @showad/nextjs-sdk)
        │       ├── api.ts              claimRedirectTicket + validateToken
        │       ├── access-policy.ts    Crawler/CIDR/beforeProtect (port from Next SDK)
        │       ├── cookies.ts          Cookie name constants + helpers
        │       ├── url.ts              buildVideoAdRedirectUrl
        │       └── verify.ts           Pure protect() — input is { token, fingerprint, ticket }
        ├── shopify.server.ts
        ├── db.server.ts
        └── root.tsx
└── tests/
    ├── jwt.test.mjs                    13 tests for JWT helpers
    ├── access-policy.test.mjs          9 tests mirroring the Next SDK fixtures
    └── shopify-proxy-hmac.test.mjs     9 tests, including both official Shopify docs fixtures
```

---

## Wire protocol (identical to all other ShowAd SDKs)

| Endpoint | Method | Purpose |
|---|---|---|
| `https://ad.proofmark.io/api/redirect-ticket/:id/claim` | POST | Exchange a `redirect_ticket` for a JWT |
| `https://ad.proofmark.io/api/sdk/validate` | POST | Verify a JWT signature server-side |

Cookie names: `showad_token`, `showad_fingerprint`, `showad_creator`,
`showad_ticket`, `showad_verified`, `showad_expires`. JWT decoding is base64url
+ JSON; signature verification is delegated to the backend.

---

## Installation

### 1. Create the app in Shopify Partners

1. Go to <https://partners.shopify.com> → **Apps** → **Create app**.
2. Pick **Custom app** (or Public if you intend to distribute).
3. Note the **Client ID** and **Client secret**.

### 2. Configure the Node app

```bash
cd sdks/shopify/app
cp env.example .env
# fill in SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL, SCOPES, …
npm install
npx prisma migrate dev --name init
npm run dev    # equivalent: `shopify app dev`
```

`shopify app dev` will:

* Tunnel `localhost:3000` to a public HTTPS URL.
* Update `application_url`, `auth.redirect_urls`, and `app_proxy.url` in
  `shopify.app.toml` to that tunnel URL.
* Open the embedded admin in your dev store.

> **Important:** running the embedded admin requires the [Shopify CLI](https://shopify.dev/docs/api/shopify-cli) and a Shopify Partner account. There is no offline mock for `shopify app dev`.

### 3. Configure per-shop credentials

In the embedded admin (`/app/settings`), enter:

* **Creator hash** (from <https://dashboard.proofmark.io>)
* **API key** (`sk-…`)
* **Redirect secret**
* Optional: protected paths (one per line, glob-style), excluded paths,
  cookie max age, JSON access policy.

### 4. Add the theme block

The merchant goes to **Theme editor → Sections** and adds the **ShowAd Gate**
app block to any page or section that should be gated. They can configure:

* Locked-state message and button text.
* The protected slug (defaults to the current `request.path`).
* Verified-state content (rich text or nested theme blocks).

---

## Running the tests

```bash
cd sdks/shopify
npm install
npm test
```

The tests use Node's built-in test runner with [`tsx`](https://github.com/privatenumber/tsx) so no compile step is needed:

```
✔ 13 jwt tests
✔ 9 access-policy tests (mirrors Next SDK fixtures)
✔ 9 shopify-proxy-hmac tests (incl. both official Shopify docs fixtures)
ℹ tests 28
ℹ pass 28
ℹ fail 0
```

The HMAC tests pin both Shopify docs fixtures (logged-in customer +
anonymous customer) using the documented shared secret `hush`, so any
regression in canonicalization will fail loudly. There's also a
fresh-roundtrip test to catch generic encoder bugs.

---

## Security checklist

| Concern | Mitigation |
|---|---|
| Forged App Proxy requests | Every proxy route verifies the HMAC signature with `crypto.createHmac('sha256', SHOPIFY_API_SECRET)`. Mismatch → 401. |
| Open redirect via `return_url` / `return_path` | `sanitizeReturnPath` rejects `//` and non-`/` paths. The proxy only ever redirects to `https://<shop>.myshopify.com<sanitized path>`. |
| Stolen token replay | JWT claims are bound to `creator_hash` + `fingerprint`. `validateTokenClaims` rejects mismatches, expired tokens, and the wrong issuer. |
| API key / redirect secret leakage | Both stay server-side. Never echoed back to the embedded admin. Encrypted at rest with AES-256-GCM when `SHOWAD_CONFIG_ENCRYPTION_KEY` is set. |
| XSS reading the token cookie | Token is JS-readable (Shopify constraint). `cookieMaxAge` defaults to 1h to limit damage; merchants can tighten further. |
| HMAC timing attacks | Uses `crypto.timingSafeEqual` on the hex digests. |
| Crawler bypass spoofing | Crawler bypass requires both UA match and a verified IP/CIDR (mirrors Next SDK semantics). |
| App-proxy `logged_in_customer_id` spoofing | Not relied on for auth — we only consume it for path-prefix display. |

---

## Limitations & follow-ups

1. **`Set-Cookie` from the proxy is impossible.** The token cookie is set
   client-side by the theme block. This is documented Shopify behavior, not
   a workaround we chose — see the architecture notes above.
2. **You must register the app in Shopify Partners** and set
   `SHOPIFY_APP_URL`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` before
   `shopify app dev` will work.
3. **Prisma migrations are not pre-baked** — run `npx prisma migrate dev --name init` once after install to create `dev.sqlite`.
4. **Polaris is bundled** as a peer dep of the Remix template. Heavy but
   matches the official Shopify scaffold; switch to a leaner UI if you
   never expose the embedded admin.
5. **Webhook auto-uninstall handler** (`/webhooks/app/uninstalled`) is
   declared in `shopify.app.toml` but not implemented in this scaffold —
   add a `webhooks.app.uninstalled.tsx` route if you want to delete the
   per-shop config on uninstall.
6. The `showad_verified` cookie is informational only (the real check is the
   token signature + claims). UIs that display "you're verified" can read it
   safely.

---

## Reference docs

* [Shopify Theme App Extensions](https://shopify.dev/docs/apps/online-store/theme-app-extensions)
* [Shopify App Proxies (overview)](https://shopify.dev/docs/apps/build/online-store/display-dynamic-data)
* [App Proxy authentication / HMAC](https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies)
* [@shopify/shopify-app-remix](https://shopify.dev/docs/api/shopify-app-remix)
* [ProofMark ShowAd Next.js SDK](../nextjs/README.md) — protocol reference
* [ProofMark ShowAd WordPress plugin](../wordpress/showad-content-gate/README.md) — closest functional reference for the gating philosophy
