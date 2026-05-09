# ShowAd Remix SDK

Protect your Remix or React Router v7 content with ProofMark ShowAd video ad
verification. Drop into a loader, an action, or `entry.server.tsx` — the SDK
handles redirect-ticket claims, JWT inspection, and cookie management.

Compatible with Remix v2.x and React Router v7. Uses Web `Request` /
`Response` exclusively, no Express types.

## Installation

```bash
npm install @showad/remix
```

## Cookies

| Name | Purpose | Set by | Readable from JS |
|------|---------|--------|------------------|
| `showad_fingerprint` | Browser fingerprint (FingerprintJS visitorId) | Client | Yes |
| `showad_token` | JWT verification token | Server | No (`HttpOnly`) |
| `showad_creator` | Creator hash bound to the verification flow | Server | Yes |
| `showad_ticket` | Redirect ticket id from the claim response | Server | Yes |
| `showad_verified` | UX signal cookie (`1` when verified) | Server | Yes |
| `showad_expires` | JWT `exp` epoch seconds for UI countdowns | Server | Yes |

`showad_token` is the only authoritative artifact. The rest are for client UX.

## Configuration

```ts
// app/showad.server.ts
import type { ShowAdConfig } from '@showad/remix/server';

export const showadConfig: ShowAdConfig = {
  creatorHash: process.env.SHOWAD_CREATOR_HASH!,
  apiKey: process.env.SHOWAD_API_KEY!,
  redirectSecret: process.env.SHOWAD_REDIRECT_SECRET!,
  apiBaseUrl: process.env.SHOWAD_API_URL,       // default https://ad.proofmark.io
  videoAdUrl: process.env.SHOWAD_VIDEO_URL,     // default https://showad.proofmark.io
  cookieMaxAge: 3600,
  debug: process.env.NODE_ENV !== 'production',
};
```

## Usage

### Option A: Wrap `handleRequest` in `entry.server.tsx`

Enforces verification on every document request before Remix renders.

```tsx
// app/entry.server.tsx
import type { EntryContext } from '@remix-run/node';
import { RemixServer } from '@remix-run/react';
import { renderToReadableStream } from 'react-dom/server';
import { wrapHandleRequest } from '@showad/remix/server';
import { showadConfig } from './showad.server';

async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext
) {
  const body = await renderToReadableStream(
    <RemixServer context={remixContext} url={request.url} />
  );
  responseHeaders.set('Content-Type', 'text/html');
  return new Response(body, {
    status: responseStatusCode,
    headers: responseHeaders,
  });
}

export default wrapHandleRequest(handleRequest, showadConfig, {
  protectedPaths: ['/premium/*', '/protected/*'],
  excludePaths: ['/api/*', '/healthz'],
});
```

### Option B: Per-route loader / action

```ts
// app/routes/premium.$slug.tsx
import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { protectLoader } from '@showad/remix/server';
import { showadConfig } from '~/showad.server';

async function loader({ params }: LoaderFunctionArgs) {
  return json({ slug: params.slug });
}

export const loader = protectLoader(loader, showadConfig);
```

For actions:

```ts
import { protectAction } from '@showad/remix/server';
export const action = protectAction(action, showadConfig);
```

### Option C: Manual `requireShowAdVerification`

For full control inside a loader:

```ts
import { requireShowAdVerification } from '@showad/remix/server';

export async function loader({ request }: LoaderFunctionArgs) {
  const guard = await requireShowAdVerification(request, showadConfig);
  if (guard) return guard; // redirect / 204 cookie refresh
  // ... your loader body
}
```

`requireShowAdVerification` returns:

- a `Response` with `Location` (redirect to the video ad or back to a clean URL after claiming a ticket) — return it directly,
- a `Response` with `status: 204` and `Set-Cookie` headers — these refresh the
  UX-signal cookies; merge them into your loader response (the `protectLoader`
  helper does this for you),
- or `undefined` when the request is verified and the loader should proceed.

### Server-side Access Policy

```ts
import { wrapHandleRequest } from '@showad/remix/server';

export default wrapHandleRequest(handleRequest, showadConfig, {
  protectedPaths: ['/premium/*'],
  accessPolicy: {
    trustedIpHeaders: ['cf-connecting-ip'],
    allowCidrs: ['203.0.113.0/24'],
    crawler: {
      enabled: true,
      families: ['google', 'bing', 'openai'],
      familyCidrs: {
        google: ['66.249.64.0/19'],
        bing: ['157.55.39.0/24'],
        openai: ['20.15.240.64/28'],
      },
    },
    beforeProtect: async ({ request }) => {
      const session = await getSessionFromRequest(request);
      return session?.user?.isPremium
        ? { action: 'allow', reason: 'premium' }
        : 'continue';
    },
  },
});
```

User-Agent matching alone never grants bypass. A crawler family must also
match a published IP range, a configurable reverse-DNS verifier, or a
Cloudflare verified-bot signal forwarded from a trusted edge.

`trustedIpHeaders` MUST only list headers your reverse proxy sets. If you
list `X-Forwarded-For` without a trusted edge, attackers can spoof bypass.
Resolve premium status from your own session/database in `beforeProtect`,
never from a request header you don't sign.

### Client-side state hook

```tsx
'use client';
import { useShowAdState } from '@showad/remix/client';

export function VerifiedBadge() {
  const { isVerified, expiresInMs } = useShowAdState();
  if (!isVerified) return null;
  return <span>Verified · expires in {Math.max(0, Math.floor(expiresInMs! / 1000))}s</span>;
}
```

The hook reads only the public UX-signal cookies — `showad_token` is
`HttpOnly` and is never exposed to JS.

## Verification flow

```
User → /premium/article
        │
        ▼
┌────────────────────────┐
│ requireShowAdVerifi-   │
│   cation(request, …)   │
└────────────┬───────────┘
             │
   ┌─────────┴──────────┐
   │                    │
   ▼                    ▼
?redirect_ticket=    showad_token cookie
   │                    │
Claim from backend   Inspect claims
   │                    │  exp / nbf / creator / fingerprint / iss
   ▼                    ▼
Set HttpOnly token   ✓ continue → loader runs
+ UX cookies
Redirect to clean URL

If no token + no ticket:
   → 302 https://showad.proofmark.io/c/<creator>?return_url=…&sdk=1
```

## API surface

### Server (`@showad/remix/server`)

- `requireShowAdVerification(request, config, options?) -> Promise<Response | undefined>`
- `protectLoader(loader, config, options?)`
- `protectAction(action, config, options?)` (alias)
- `wrapHandleRequest(handler, config, options?)`
- `getVerificationFromRequest(request, config)`
- `evaluateAccessPolicy`, `verifyCrawlerRequest`, `isIpInCidrs`, `getClientIp`
- `decodeToken`, `isTokenExpired`, `getTokenExpiry`, `validateTokenClaims`
- `claimRedirectTicket`, `validateToken`, `checkHealth`
- `buildVideoAdRedirectUrl`, `buildResourceRedirectUrl`
- `parseCookieHeader`, `readShowAdCookies`, `buildVerificationSetCookieHeaders`,
  `buildClearSetCookieHeaders`

### Client (`@showad/remix/client`)

- `useShowAdState({ cookiePrefix?, pollIntervalMs? })`
- `readShowAdState(cookiePrefix?)`

### Standalone (`@showad/remix/access-policy`)

Re-export of access-policy utilities for use outside the protect helpers.

## Security notes

- `apiKey` and `redirectSecret` MUST stay server-side. Loaders and
  `entry.server.tsx` are server-only.
- The JWT token cookie is `HttpOnly`. Only UX-signal cookies are readable
  from JS.
- The backend is the token authority. Local validation (`exp`, `nbf`,
  `creator_hash`, `fingerprint`, `iss`) only short-circuits obvious failures;
  existing token cookies are still checked with `/api/sdk/validate` before
  protected content is allowed.

## Testing

```bash
npm install
npm test
```

## License

MIT
