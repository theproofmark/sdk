# ProofMark Verify — Client SDKs

Embeddable client SDK for [ProofMark Verify](https://proofmark.com/verify) — the
CAPTCHA replacement that runs a short video ad + comprehension question instead of
a puzzle. This is the browser counterpart to the server-side `@proofmark/verify-node`.

## Packages

| Package | Use it when |
|---|---|
| [`@proofmark/verify-js`](./packages/core) | Any website. Load via `<script>` (CDN) or `import`. Framework-agnostic. |
| [`@proofmark/verify-react`](./packages/react) | React apps. Thin `<ProofMarkVerify>` wrapper around the core. |

Server-side token verification lives in `@proofmark/verify-node` (separate package).

## Quick start (vanilla)

```html
<script src="https://verify.proofmark.com/api.js" async defer></script>
<form action="/login" method="POST">
  <input name="email" type="email" />
  <div class="pm-verify" data-sitekey="pmv_live_xxx"></div>
  <button type="submit">Sign in</button>
</form>
```

## Development

```bash
npm install          # installs all workspaces
npm run build        # builds core then react
npm test             # runs all workspace tests
npm run sync         # copies core/dist/api.js -> ../../frontend/public/verify/api.js
```