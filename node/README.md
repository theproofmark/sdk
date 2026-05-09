# @showad/node-sdk

ShowAd SDK for Node.js — protect server-rendered content behind the ProofMark
ShowAd video-ad gate. The SDK ships first-class adapters for **Express**,
**Fastify**, and **NestJS** plus a framework-free core.

> Visitors that have not watched the video ad are redirected to the ShowAd
> creator page. After watching, the visitor is sent back with a
> `redirect_ticket` query param; the SDK exchanges that ticket for a JWT
> (server-to-server) and stores the verification in cookies.

## Install

```bash
npm install @showad/node-sdk
```

Node 18+ is required (we use the global `fetch`).

## Environment variables

The SDK reads these as defaults; you can also pass values explicitly to
`createShowAdMiddleware`/`showAdPlugin`/`ShowAdModule.forRoot`.

| Variable | Description |
| --- | --- |
| `SHOWAD_CREATOR_HASH` | Public creator hash. |
| `SHOWAD_API_KEY` | Server-side API key. **Secret.** |
| `SHOWAD_REDIRECT_SECRET` | Redirect-ticket secret used to claim tickets. **Secret.** |
| `SHOWAD_API_URL` | Backend base URL. Defaults to `https://ad.proofmark.io`. |
| `SHOWAD_VIDEO_URL` | Video ad frontend URL. Defaults to `https://showad.proofmark.io`. |

Never commit secrets. Load them from your secret manager / `.env`.

## Express

```ts
import express from 'express';
import { createShowAdMiddleware } from '@showad/node-sdk/express';

const app = express();

app.use(
  createShowAdMiddleware(
    {
      creatorHash: process.env.SHOWAD_CREATOR_HASH!,
      apiKey: process.env.SHOWAD_API_KEY!,
      redirectSecret: process.env.SHOWAD_REDIRECT_SECRET!,
    },
    {
      protectedPaths: ['/premium/*', '/articles/*'],
      excludePaths: ['/api/*', '/healthz'],
    }
  )
);

app.get('/premium/article', (req, res) => res.send('Verified content'));
app.listen(3000);
```

If your app sits behind a reverse proxy / CDN, enable Express trust-proxy so
`req.ip` is correct:

```ts
app.set('trust proxy', true);
```

## Fastify

```ts
import Fastify from 'fastify';
import { showAdPlugin } from '@showad/node-sdk/fastify';

const app = Fastify();

await app.register(showAdPlugin, {
  config: {
    creatorHash: process.env.SHOWAD_CREATOR_HASH!,
    apiKey: process.env.SHOWAD_API_KEY!,
    redirectSecret: process.env.SHOWAD_REDIRECT_SECRET!,
  },
  protectedPaths: ['/premium/*'],
});

app.get('/premium/article', async () => 'Verified content');
await app.listen({ port: 3000 });
```

## NestJS

```ts
import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ShowAdModule, ShowAdMiddleware } from '@showad/node-sdk/nestjs';

@Module({
  imports: [
    ShowAdModule.forRoot(
      {
        creatorHash: process.env.SHOWAD_CREATOR_HASH!,
        apiKey: process.env.SHOWAD_API_KEY!,
        redirectSecret: process.env.SHOWAD_REDIRECT_SECRET!,
      },
      { protectedPaths: ['/premium/*'] }
    ),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ShowAdMiddleware).forRoutes('*');
  }
}
```

For API endpoints you can use `ShowAdGuard` instead of the middleware to
respond 401 instead of redirecting:

```ts
import { UseGuards, Controller, Get } from '@nestjs/common';
import { ShowAdGuard } from '@showad/node-sdk/nestjs';

@UseGuards(ShowAdGuard)
@Controller('premium')
export class PremiumController {
  @Get() get() { return { ok: true }; }
}
```

## Access policy

Bypass the ad flow for verified crawlers, your own premium users, or trusted
IP ranges. UA matching alone never grants bypass — you must combine it with a
trusted IP range, a Cloudflare verified-bot header, or a custom rDNS verifier.

```ts
import { createShowAdMiddleware } from '@showad/node-sdk/express';

app.use(
  createShowAdMiddleware(config, {
    protectedPaths: ['/premium/*'],
    accessPolicy: {
      trustedIpHeaders: ['cf-connecting-ip', 'x-forwarded-for'],
      allowCidrs: ['203.0.113.0/24'], // office IPs
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
        if (request.headers['x-publisher-premium'] === '1') {
          return { action: 'allow', reason: 'premium_user' };
        }
        return 'continue';
      },
    },
  })
);
```

The pipeline runs in this order:

1. **Verified crawler** — UA family matches **AND** (IP in `familyCidrs` OR
   Cloudflare verified-bot header OR `reverseDnsVerifier` returns true).
2. **CIDR allowlist** — `allowCidrs` checked against the trusted IP.
3. **`beforeProtect` callback** — your custom logic. Return `'allow'`,
   `'continue'`, `'redirect'`, or `{ action, reason, redirectUrl }`.

## Cookies

| Cookie | Set by | Attributes | Purpose |
| --- | --- | --- | --- |
| `showad_fingerprint` | client JS | readable | browser fingerprint (input to JWT validation) |
| `showad_token` | SDK | `HttpOnly`, `SameSite=Lax`, `Secure*` | JWT issued by the backend |
| `showad_creator` | SDK | readable | creator hash |
| `showad_ticket` | SDK | readable | last claimed ticket id |
| `showad_verified` | SDK | readable | `1` UX signal |
| `showad_expires` | SDK | readable | expiry epoch seconds |

`Secure` is set automatically when the request is HTTPS (or when
`config.secure: true`).

## Security notes

- **Trust proxy.** The SDK only trusts the IP headers you list in
  `accessPolicy.trustedIpHeaders`. Don't trust `X-Forwarded-For` unless your
  edge actually sets it. With Express also call `app.set('trust proxy', ...)`.
- **Secrets.** `apiKey` and `redirectSecret` are server-only. Never expose
  them to the browser or include them in client bundles.
- **Token verification.** The SDK decodes the JWT to short-circuit the network
  round-trip but does **not** verify the signature. The backend is the
  authority. Use `validateToken(config, token)` for an authoritative check.
- **HTTPS.** Run the SDK behind HTTPS in production so `Secure` cookies stick.
- **Replay.** Tickets are single-use; `claimRedirectTicket` returns 410 if the
  ticket is already consumed.

## Programmatic API

```ts
import {
  decodeToken,
  isTokenExpired,
  validateTokenClaims,
  claimRedirectTicket,
  validateToken,
  checkHealth,
  buildVideoAdRedirectUrl,
  evaluateAccessPolicy,
  isIpInCidrs,
} from '@showad/node-sdk';
```

## Build & test

```bash
npm install
npm run build
npm test
```

## License

MIT — © ProofMark
