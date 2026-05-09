# @showad/sveltekit

Content-gating SDK for SvelteKit 2.x. Drops a `handle` hook into
`src/hooks.server.ts` that protects routes behind a ProofMark video ad and
issues a session JWT (HttpOnly cookie) on success.

- **Framework**: SvelteKit 2.x (peer dep, optional)
- **Runtime**: Web `Request` / `Response` everywhere
- **Auth**: pure base64url + JSON JWT decoding (no `jose`)
- **Cookies**: `event.cookies` when present, falls back to `Set-Cookie` headers

## Install

```bash
npm install @showad/sveltekit
```

## Quick start

```ts
// src/hooks.server.ts
import { createShowAdHandle } from '@showad/sveltekit/server';
import { env } from '$env/dynamic/private';

export const handle = createShowAdHandle(
  {
    creatorHash: env.SHOWAD_CREATOR_HASH,
    apiKey: env.SHOWAD_API_KEY,
    redirectSecret: env.SHOWAD_REDIRECT_SECRET,
  },
  {
    protectedPaths: ['/premium/*'],
    excludePaths: ['/premium/public/*'],
    onVerificationFailed: (reason) => console.warn('[ShowAd]', reason),
  }
);
```

The hook intercepts requests in this order:

1. Skips paths that match `excludePaths` or do not match `protectedPaths`.
2. Runs the optional `accessPolicy` (verified crawler, CIDR allowlist, or
   `beforeProtect` callback). UA detection alone never bypasses.
3. Claims `?redirect_ticket=<id>` returning from the video ad, sets the
   verification cookies, and 302s back to the cleaned URL.
4. Validates an existing `showad_token` cookie (claims only — backend signs).
5. Otherwise redirects to `https://showad.proofmark.io/c/<creator>` with a
   `return_url` so the visitor returns post-ad.

## Composing with other handles

```ts
// src/hooks.server.ts
import { sequence } from '@sveltejs/kit/hooks';
import { createShowAdHandle } from '@showad/sveltekit/server';

const showAd = createShowAdHandle(config, { protectedPaths: ['/premium/*'] });

const auth: Handle = async ({ event, resolve }) => {
  event.locals.user = await loadUser(event);
  return resolve(event);
};

export const handle = sequence(auth, showAd);
```

## Loader-level checks

For routes you handle outside `protectedPaths`, you can require verification
inside any `+page.server.ts` / `+layout.server.ts`:

```ts
import { redirect } from '@sveltejs/kit';
import { requireShowAdVerification, ShowAdRedirect } from '@showad/sveltekit/server';

export const load = async (event) => {
  try {
    requireShowAdVerification(event, config);
  } catch (err) {
    if (err instanceof ShowAdRedirect) {
      throw redirect(302, err.location);
    }
    throw err;
  }
  return { ok: true };
};
```

Or non-throwing inspection:

```ts
import { inspectShowAdVerification } from '@showad/sveltekit/server';

export const load = (event) => {
  const result = inspectShowAdVerification(event, config);
  return { verified: result.verified, reason: result.reason };
};
```

## Access policies

Allow verified Googlebot, internal monitoring, or your own premium users to
bypass the gate without ever touching the ad flow:

```ts
import { createShowAdHandle } from '@showad/sveltekit/server';

export const handle = createShowAdHandle(config, {
  protectedPaths: ['/premium/*'],
  accessPolicy: {
    trustedIpHeaders: ['cf-connecting-ip', 'x-forwarded-for'],
    allowCidrs: ['10.0.0.0/8'],
    crawler: {
      enabled: true,
      families: ['google', 'bing', 'openai'],
      familyCidrs: {
        google: ['66.249.64.0/19'],
        bing: ['157.55.39.0/24'],
      },
      allowCloudflareVerifiedBot: true,
    },
    beforeProtect: ({ request }) => {
      return request.request.headers.get('x-publisher-premium') === '1'
        ? { action: 'allow', reason: 'premium_user' }
        : 'continue';
    },
  },
});
```

The pipeline runs in order: verified crawler → CIDR allowlist → `beforeProtect`.
A `user-agent` header alone is never sufficient to bypass — a trusted IP range,
Cloudflare-verified-bot signal, or rDNS verification is required.

## Configuration

| Field            | Required | Default                          |
| ---------------- | -------- | -------------------------------- |
| `creatorHash`    | yes      | —                                |
| `apiKey`         | yes      | —                                |
| `redirectSecret` | yes      | —                                |
| `apiBaseUrl`     | no       | `https://ad.proofmark.io`        |
| `videoAdUrl`     | no       | `https://showad.proofmark.io`    |
| `cookiePrefix`   | no       | `showad`                         |
| `cookieMaxAge`   | no       | `3600`                           |
| `secure`         | no       | inferred from request scheme     |
| `debug`          | no       | `false`                          |

## Cookie surface

| Cookie               | Set by    | HttpOnly | Purpose                       |
| -------------------- | --------- | -------- | ----------------------------- |
| `showad_fingerprint` | client    | no       | Browser fingerprint           |
| `showad_token`       | server    | **yes**  | JWT issued by the backend     |
| `showad_creator`     | server    | no       | Creator hash (UX signal)      |
| `showad_ticket`      | server    | no       | Last claimed ticket id        |
| `showad_verified`    | server    | no       | `'1'` once verified           |
| `showad_expires`     | server    | no       | Token expiry (unix seconds)   |

## Build & test

```bash
npm install
npm run build
npm test
```

## License

MIT
