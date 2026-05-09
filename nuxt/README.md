# @showad/nuxt

Nuxt 3 module that gates content with ProofMark ShowAd. The Nitro server middleware enforces video ad verification on protected paths and the composable lets pages read verification state.

## Install

```bash
npm install @showad/nuxt
```

## Configure

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@showad/nuxt'],

  showad: {
    creatorHash: process.env.NUXT_PUBLIC_SHOWAD_CREATOR_HASH,

    apiKey: process.env.NUXT_SHOWAD_API_KEY,
    redirectSecret: process.env.NUXT_SHOWAD_REDIRECT_SECRET,

    apiBaseUrl: 'https://ad.proofmark.io',
    videoAdUrl: 'https://showad.proofmark.io',
    cookieMaxAge: 3600,

    protectedPaths: ['/premium/*'],
    excludePaths: ['/premium/public'],

    accessPolicy: {
      trustedIpHeaders: ['cf-connecting-ip', 'x-forwarded-for'],
      crawler: {
        enabled: true,
        families: ['google', 'bing'],
        familyCidrs: {
          google: ['66.249.64.0/19'],
        },
      },
    },

    debug: false,
  },

  runtimeConfig: {
    showad: {
      apiKey: '',
      redirectSecret: '',
    },
    public: {
      showad: {
        creatorHash: '',
      },
    },
  },
})
```

Server-only secrets (`apiKey`, `redirectSecret`) are read from `runtimeConfig.showad`. Provide them through `.env`:

```
NUXT_SHOWAD_API_KEY=...
NUXT_SHOWAD_REDIRECT_SECRET=...
NUXT_PUBLIC_SHOWAD_CREATOR_HASH=...
```

## Module options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `creatorHash` | `string` | – | Creator hash from the ShowAd dashboard. |
| `apiKey` | `string` | – | Server-only API key. |
| `redirectSecret` | `string` | – | Server-only redirect ticket secret. |
| `apiBaseUrl` | `string` | `https://ad.proofmark.io` | ShowAd backend base URL. |
| `videoAdUrl` | `string` | `https://showad.proofmark.io` | Video ad frontend URL. |
| `cookieMaxAge` | `number` | `3600` | Cookie lifetime in seconds. |
| `protectedPaths` | `string[]` | `[]` | Glob patterns to protect, e.g. `/premium/*`. |
| `excludePaths` | `string[]` | `[]` | Glob patterns to skip. |
| `accessPolicy` | `AccessPolicyOptions` | – | Allow verified crawlers / CIDR ranges before redirecting. |
| `debug` | `boolean` | `false` | Server console logs for the middleware. |
| `enabled` | `boolean` | `true` | Disable the auto-registered middleware. |

## How it runs

For every request, the Nitro middleware applies this order:

1. **Path match** – skip if the URL matches `excludePaths` or does not match `protectedPaths`.
2. **Access policy** – verified crawlers (UA + trusted CIDR or reverse DNS) and trusted IP allowlists short-circuit to allow. User-agent alone never bypasses.
3. **Ticket claim** – when `?redirect_ticket=...` is present and the visitor has a `showad_fingerprint` cookie, claim the ticket against `POST /api/redirect-ticket/:id/claim` and persist the JWT in cookies.
4. **Token validate** – if a `showad_token` cookie exists, locally pre-check `exp/nbf/creator_hash/fingerprint/iss`, then call `/api/sdk/validate` before allowing content.
5. **Redirect** – send the visitor to `${videoAdUrl}/c/${creatorHash}?return_url=${current}&sdk=1`.

### Cookies

| Name | Scope | Purpose |
| --- | --- | --- |
| `showad_fingerprint` | client + server | Fingerprint set by the ShowAd browser SDK. |
| `showad_token` | server (HttpOnly) | Verification JWT. |
| `showad_creator` | both | Verified creator hash. |
| `showad_ticket` | both | Last claimed ticket id. |
| `showad_verified` | both | `1` after successful verification. |
| `showad_expires` | both | Token `exp` as unix seconds. |

## Composable

```vue
<script setup lang="ts">
const { state, refresh } = useShowAd()
</script>

<template>
  <div v-if="state.isVerified">premium content</div>
  <button @click="refresh">re-read cookies</button>
</template>
```

`useShowAd()` reads cookies on both server (via `useRequestHeaders`) and client (`document.cookie`). The HttpOnly `showad_token` is intentionally not exposed.

## Development

```bash
npm install
npm run dev:prepare
npm run dev          # plays in ./nuxt.config.ts
npm run prepack      # build the published module
npm test             # run unit + e2e tests
```

## License

MIT © ProofMark
