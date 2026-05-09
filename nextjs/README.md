# ShowAd Next.js SDK

Protect your Next.js content with video ad verification. This SDK handles fingerprint collection, redirect ticket processing, and JWT validation.

Supported Next.js versions: 13.x, 14.x, 15.x, and 16.x.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT SIDE                               │
│  - Collects fingerprint (FingerprintJS)                         │
│  - Stores fingerprint in cookie                                  │
│  - Reads verification state from cookies                         │
│  - Provides UI components for gating content                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Cookie: fingerprint
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SERVER SIDE                               │
│  - Middleware intercepts requests to protected paths             │
│  - Checks for redirect_ticket in URL (returning from video ad)  │
│  - Claims ticket from ShowAd backend (using secret)              │
│  - Sets JWT token in cookie                                      │
│  - Validates existing tokens                                     │
│  - Redirects to video ad if not verified                         │
└─────────────────────────────────────────────────────────────────┘
```

## Version Compatibility

| Next.js Version | Status | File Convention |
|-----------------|--------|-----------------|
| 13.x | Supported | `middleware.ts` |
| 14.x | Supported | `middleware.ts` |
| 15.x | Supported | `middleware.ts` |
| 16.x | Supported | `proxy.ts` |

Notes:

- Next.js 16 renamed the root interception file from `middleware.ts` to `proxy.ts`.
- Pages Router projects are supported through `getVerificationFromCookies()` and `buildVideoAdRedirectUrl()`.
- React 18+ is required.

## What Gets Stored In Cookies

| Cookie Name | Description | Set By | Readable By Client |
|-------------|-------------|--------|--------------------|
| `showad_fingerprint` | Browser fingerprint (FingerprintJS visitorId) | Client | Yes |
| `showad_creator` | Creator hash bound to the verification flow | Client + Server | Yes |
| `showad_token` | JWT verification token | Server | No (`httpOnly`) |
| `showad_ticket` | Redirect ticket ID from the claim response | Server | Yes |
| `showad_verified` | Lightweight verification signal cookie | Server | Yes |
| `showad_expires` | Verification expiry timestamp as unix seconds | Server | Yes |

`showad_token` is the real authorization artifact. `showad_verified` and `showad_expires` are convenience cookies used only for client-side UX.

## Installation

```bash
npm install @showad/nextjs-sdk
```

## Quick Start

### 1. Environment Variables

```env
# ===== PUBLIC (exposed to browser) =====
NEXT_PUBLIC_SHOWAD_CREATOR_HASH=your-creator-hash

# ===== PRIVATE (server-side only) =====
SHOWAD_API_KEY=sk-your-api-key
SHOWAD_REDIRECT_SECRET=your-redirect-secret

# Optional
NEXT_PUBLIC_SHOWAD_API_URL=https://ad.proofmark.io
NEXT_PUBLIC_SHOWAD_VIDEO_URL=https://showad.proofmark.io
```

### 2. Create The Server Interceptor (Required)

Use the root file that matches your Next.js version.

#### Next.js 16+: `proxy.ts`

Create `proxy.ts` at your project root:

```typescript
import type { NextRequest } from 'next/server';
import { createShowAdMiddleware } from '@showad/nextjs-sdk/middleware';

const showAdMiddleware = createShowAdMiddleware({
  creatorHash: process.env.NEXT_PUBLIC_SHOWAD_CREATOR_HASH!,
  apiKey: process.env.SHOWAD_API_KEY!,
  redirectSecret: process.env.SHOWAD_REDIRECT_SECRET!,
  debug: process.env.NODE_ENV === 'development',
}, {
  protectedPaths: ['/protected/*', '/premium/*'],
  excludePaths: ['/api/*', '/_next/*', '/favicon.ico'],
});

export function proxy(request: NextRequest) {
  return showAdMiddleware(request);
}

export const config = {
  matcher: ['/protected/:path*', '/premium/:path*'],
};
```

#### Next.js 13-15: `middleware.ts`

Create `middleware.ts` at your project root:

```typescript
import type { NextRequest } from 'next/server';
import { createShowAdMiddleware } from '@showad/nextjs-sdk/middleware';

const showAdMiddleware = createShowAdMiddleware({
  // Required - your creator hash
  creatorHash: process.env.NEXT_PUBLIC_SHOWAD_CREATOR_HASH!,
  // Required - API key (server-side only)
  apiKey: process.env.SHOWAD_API_KEY!,
  // Required - redirect secret (server-side only)
  redirectSecret: process.env.SHOWAD_REDIRECT_SECRET!,
  // Optional
  debug: process.env.NODE_ENV === 'development',
}, {
  // Paths to protect
  protectedPaths: ['/protected/*', '/premium/*'],
  // Paths to exclude
  excludePaths: ['/api/*', '/_next/*', '/favicon.ico'],
});

export async function middleware(request: NextRequest) {
  return showAdMiddleware(request);
}

export const config = {
  matcher: ['/protected/:path*', '/premium/:path*'],
};
```

#### Pages Router And API Route Fallback

If you are protecting Pages Router routes, you can verify cookies inside `getServerSideProps` or API handlers:

```typescript
import {
  getVerificationFromCookies,
  buildVideoAdRedirectUrl,
} from '@showad/nextjs-sdk/server';

const serverConfig = {
  creatorHash: process.env.NEXT_PUBLIC_SHOWAD_CREATOR_HASH!,
  apiKey: process.env.SHOWAD_API_KEY!,
  redirectSecret: process.env.SHOWAD_REDIRECT_SECRET!,
};

export async function getServerSideProps(context) {
  const verification = getVerificationFromCookies(context.req.cookies, serverConfig);

  if (!verification.isVerified) {
    return {
      redirect: {
        destination: buildVideoAdRedirectUrl(serverConfig, context.resolvedUrl),
        permanent: false,
      },
    };
  }

  return { props: {} };
}
```

### Server-Side Access Policy

Pass an `accessPolicy` block to allow verified crawlers, trusted IP ranges,
or your own authenticated/premium users **before** the ShowAd flow runs.
Everything below is evaluated server-side; client-controlled signals are not
trusted.

```typescript
import { createShowAdMiddleware } from '@showad/nextjs-sdk/middleware';

const showAdMiddleware = createShowAdMiddleware({
  creatorHash: process.env.NEXT_PUBLIC_SHOWAD_CREATOR_HASH!,
  apiKey: process.env.SHOWAD_API_KEY!,
  redirectSecret: process.env.SHOWAD_REDIRECT_SECRET!,
}, {
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
      const user = await getUserFromSession(request);
      return user?.isPremium ? { action: 'allow', reason: 'premium' } : 'continue';
    },
  },
});
```

User-Agent matching alone never grants bypass. A crawler family must also
match a published IP range, a configurable reverse-DNS verifier, or a
Cloudflare verified-bot signal forwarded from a trusted edge.

`trustedIpHeaders` must only list headers your reverse proxy sets. If you
list headers a browser can spoof (`X-Forwarded-For` without a trusted edge),
attackers can bypass `allowCidrs` and crawler IP checks. Resolve premium
status from your own session/database in `beforeProtect` rather than from a
request header.

For subscription-style gates, pair the bypass with Google's
[paywalled content structured data](https://developers.google.com/search/docs/appearance/structured-data/paywalled-content)
to keep crawlers from treating the gate as cloaking.

### 3. Add Client Provider

In your layout `app/layout.tsx`:

```tsx
'use client';

import { ShowAdProvider } from '@showad/nextjs-sdk/client';

// Client config (no secrets!)
const clientConfig = {
  creatorHash: process.env.NEXT_PUBLIC_SHOWAD_CREATOR_HASH!,
  debug: process.env.NODE_ENV === 'development',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ShowAdProvider config={clientConfig}>
          {children}
        </ShowAdProvider>
      </body>
    </html>
  );
}
```

### 4. Use in Protected Pages (Optional UI)

The middleware handles protection, but you can add client-side UI:

```tsx
'use client';

import { ShowAdGate, ShowAdDebug } from '@showad/nextjs-sdk/client';

export default function ProtectedPage() {
  return (
    <>
      <ShowAdGate
        loadingContent={<div>Loading...</div>}
        unverifiedContent={<div>Please watch an ad to continue.</div>}
      >
        <h1>Protected Content</h1>
        <p>This is only visible after verification.</p>
      </ShowAdGate>
      
      {/* Debug panel (dev only) */}
      <ShowAdDebug />
    </>
  );
}
```

## Flow Diagram

```
User visits /protected/page
         │
         ▼
┌─────────────────────────┐
│ Next.js Middleware      │
│ (server-side)           │
└────────────┬────────────┘
             │
    ┌────────┴────────┐
    │                 │
    ▼                 ▼
Has token?         Has redirect_ticket?
    │                 │
  Valid?           Claim from backend
    │                 │
   Yes              Set token cookie
    │                 │
    │              Redirect to clean URL
    │                 │
    └────────┬────────┘
             │
         Allow access
             │
             ▼
┌─────────────────────────┐
│ Client loads            │
│ - Collects fingerprint  │
│ - Stores in cookie      │
│ - Reads verification    │
│   signal cookies        │
│   (set by server)       │
└─────────────────────────┘

If NO token and NO ticket:
         │
         ▼
┌─────────────────────────┐
│ Redirect to video ad    │
│ https://showad.../c/xyz │
│ ?return_url=...         │
└─────────────────────────┘
         │
         ▼
User watches video ad
         │
         ▼
Redirect back with ?redirect_ticket=xxx
         │
         ▼
Middleware claims ticket → sets token → allows access
```

## API Reference

### Server-Side (`@showad/nextjs-sdk/middleware`)

#### `createShowAdMiddleware(config, options)`

Creates the protection middleware.

```typescript
interface ShowAdServerConfig {
  creatorHash: string;      // Required
  apiKey: string;           // Required (secret)
  redirectSecret: string;   // Required (secret)
  apiBaseUrl?: string;      // Default: https://ad.proofmark.io
  videoAdUrl?: string;      // Default: https://showad.proofmark.io
  cookieMaxAge?: number;    // Default: 3600
  debug?: boolean;
}

interface ProtectMiddlewareOptions {
  protectedPaths?: string[];  // Glob patterns to protect
  excludePaths?: string[];    // Glob patterns to exclude
  onVerificationFailed?: (reason: string) => void;
  accessPolicy?: AccessPolicyOptions; // Server-side crawler / CIDR / premium bypass policy
}
```

#### `getVerificationFromCookies(cookies, config)`

For use in getServerSideProps or API routes:

```typescript
// In getServerSideProps
export async function getServerSideProps(context) {
  const verification = getVerificationFromCookies(
    context.req.cookies,
    serverConfig
  );
  
  if (!verification.isVerified) {
    return {
      redirect: {
        destination: buildVideoAdRedirectUrl(serverConfig, context.resolvedUrl),
        permanent: false,
      },
    };
  }
  
  return { props: { ... } };
}
```

### Client-Side (`@showad/nextjs-sdk/client`)

#### `ShowAdProvider`

```tsx
<ShowAdProvider
  config={{
    creatorHash: 'xxx',
    debug: true,
  }}
  onStateChange={(state) => console.log(state)}
>
  {children}
</ShowAdProvider>
```

#### Hooks

```typescript
// Main hook
const { isVerified, isLoading, error, redirectToVideoAd, refresh } = useShowAd();

// Simple hooks
const isVerified = useIsVerified();
const isLoading = useIsLoading();
const error = useVerificationError();

// Fingerprint (collected on client)
const { fingerprint, isLoading } = useFingerprint();

// Expiry tracking
const { expiresIn, isExpired } = useVerificationExpiry();
```

#### Components

```tsx
// Gate content
<ShowAdGate loadingContent={...} unverifiedContent={...}>
  {children}
</ShowAdGate>

// Conditional rendering
<ShowAdVerified>Shown when verified</ShowAdVerified>
<ShowAdUnverified>Shown when not verified</ShowAdUnverified>
<ShowAdLoading>Shown while checking</ShowAdLoading>

// Expiry countdown
<ShowAdExpiryCountdown format="mm:ss" onExpired={() => {}} />

// Debug panel
<ShowAdDebug />
```

## Important Notes

### Fingerprint Matching

The SDK uses **FingerprintJS** to generate a `visitorId`. This MUST match the fingerprint generated by the ShowAd video ad frontend. The SDK uses the exact same implementation:

```typescript
import FingerprintJS from '@fingerprintjs/fingerprintjs';
const fp = await FingerprintJS.load();
const result = await fp.get();
return result.visitorId;  // This is stored in cookie
```

### Security

- **API Key** and **Redirect Secret** are server-side only
- Never expose these to the client (no `NEXT_PUBLIC_` prefix)
- All ticket claiming happens in `middleware.ts` or `proxy.ts` (server-side)
- Client only collects fingerprint and reads signal cookies
- The JWT token cookie is `httpOnly` and cannot be read by client JavaScript

### Cookie Security

Cookies are set with:
- `Path=/`
- `SameSite=Lax`
- `Secure` (when using HTTPS)
- Configurable `Max-Age` (default: 1 hour)
- `showad_token` is `httpOnly`
- `showad_verified` and `showad_expires` are client-readable UX cookies only

## Troubleshooting

### "Fingerprint mismatch" error

The fingerprint collected by your site must match what ShowAd's video ad frontend collected. Both use FingerprintJS `visitorId`. If they don't match:

1. Ensure you're using the same FingerprintJS version
2. Check that the fingerprint cookie is being set correctly
3. The fallback fingerprint algorithm must match exactly

### Middleware not triggering

1. Check `matcher` config in `middleware.ts` or `proxy.ts`
2. Ensure protected paths are correct
3. Check for typos in glob patterns
4. On Next.js 16+, confirm you used `proxy.ts`, not `middleware.ts`

### Verified UI looks stale after expiry

1. Ensure the server interceptor is running for protected routes
2. Confirm `showad_expires` is being set alongside `showad_verified`
3. Confirm the backend is returning a JWT with a valid `exp` claim

### Token validation failing

1. Check that `creatorHash` matches between client and server config
2. Verify the token hasn't expired
3. Enable `debug: true` to see detailed logs

## Testing

```bash
npm install
npm test
```

The SDK tests build the package and verify access-policy behavior plus the
middleware's authoritative backend token-validation path.

## License

MIT
