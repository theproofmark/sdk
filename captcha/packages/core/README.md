# @proofmark/verify-js

Browser widget for **ProofMark Verify** — the CAPTCHA replacement that plays a short video ad and asks a comprehension question instead of a puzzle.

Framework-agnostic JavaScript CAPTCHA widget. Browser counterpart to [`@proofmark/verify-node`](../../verify-node/) for server-side verification.

## Install

### Via CDN (simplest)

```html
<script src="https://verify.proofmark.com/api.js" async defer></script>
```

### Via npm

```bash
npm install @proofmark/verify-js
```

## Quick start

### Auto-render (HTML)

Add the widget to your form by placing a `<div>` with the class `pm-verify`:

```html
<script src="https://verify.proofmark.com/api.js" async defer></script>
<form action="/verify" method="POST">
  <input type="email" name="email" required />
  <div class="pm-verify" data-sitekey="pmv_live_xxxxxxxx"></div>
  <button type="submit">Submit</button>
</form>
```

When the user completes the challenge, the widget injects a hidden form input named `pm-verify-response` containing the token. A normal POST will include it:

```html
<!-- After completion, the widget adds: -->
<input type="hidden" name="pm-verify-response" value="token_xxxxx" />
```

**Supported data-* attributes:**

| Attribute | Type | Description |
|---|---|---|
| `data-sitekey` | string | Your site key (required) |
| `data-action` | string | Action label (optional) |
| `data-theme` | string | `'light'`, `'dark'`, or `'auto'` (default: `'auto'`) |
| `data-lang` | string | Locale string (default: browser language) |
| `data-callback` | string | Global function name to call on success |
| `data-error-callback` | string | Global function name to call on error |
| `data-expired-callback` | string | Global function name to call on expiry |

### Explicit render

Load the script with `?render=explicit` and call `render()` manually:

```html
<script src="https://verify.proofmark.com/api.js?render=explicit" async defer></script>
<div id="my-widget"></div>

<script>
  function onVerifySuccess(token) {
    console.log('Token:', token);
  }

  function onVerifyExpired() {
    console.log('Token expired');
  }

  function onVerifyError(errorCode) {
    console.log('Error:', errorCode);
  }

  // Call this when your page is ready
  window.pmverify.render('my-widget', {
    sitekey: 'pmv_live_xxxxxxxx',
    callback: onVerifySuccess,
    'expired-callback': onVerifyExpired,
    'error-callback': onVerifyError,
    theme: 'light',
    action: 'contact_form'
  });
</script>
```

## API

### `window.pmverify.render(container, options)`

Renders a widget into a DOM element. Returns a numeric widget ID.

**Parameters:**

- `container` (HTMLElement | string): DOM element or element ID where the widget will render
- `options` (object): Widget configuration

**Options:**

| Key | Type | Required | Description |
|---|---|---|---|
| `sitekey` | string | yes | Your site key (`pmv_live_…`) |
| `callback` | function(token) | no | Called on successful completion with the token |
| `'expired-callback'` | function() | no | Called when the token expires (~270s after success) |
| `'error-callback'` | function(code) | no | Called if the widget encounters an error |
| `theme` | string | no | `'light'`, `'dark'`, or `'auto'` (default: `'auto'`) |
| `action` | string | no | Action label sent with the verification |
| `lang` | string | no | Locale code (e.g., `'en'`, `'es'`, `'fr'`) |

### Other methods

| Method | Returns | Description |
|---|---|---|
| `getResponse(widgetId)` | string | Returns the current token (empty string if none or expired) |
| `reset(widgetId)` | void | Resets the widget; token is cleared and state returns to idle |
| `remove(widgetId)` | void | Removes the widget from the DOM |
| `execute(widgetId)` | void | Programmatically opens the challenge modal for an idle widget |

## Configuration

### Local / self-hosted backend

Add a meta tag in your `<head>` to point the widget at a non-default backend:

```html
<meta name="pmv-api-base" content="http://localhost:8080" />
```

Default is `https://api.proofmark.com`. Useful for local development or self-hosted deployments.

## Token lifecycle

- **Single-use:** Each token can only be verified once server-side.
- **Short-lived:** Tokens expire automatically ~270 seconds after a successful challenge. The `'expired-callback'` fires when this happens.
- **Auto-reset:** After expiry, the widget returns to idle state. Call `reset(widgetId)` if you need to clear the token immediately (e.g., after a failed form submission).

## Localization

18 locales supported with automatic right-to-left (RTL) text direction for Arabic (`ar`), Hebrew (`he`), and Farsi (`fa`). Pass the locale code via `data-lang` or the `lang` option.

## Theme

When `theme` is set to `'auto'` (the default), the widget respects the user's `prefers-color-scheme` system preference. Choose `'light'` or `'dark'` to override.

## Server-side verification

Tokens must be verified server-side using [`@proofmark/verify-node`](../../verify-node/). After the browser submits the form with the `pm-verify-response` field, your backend should POST that token to your verification endpoint:

```js
const token = req.body['pm-verify-response'];
const result = await pmv.verify(token, { remoteip: req.ip });

if (!result.success) {
  return res.status(400).send('Verification failed');
}
// proceed with your logic
```

See [`@proofmark/verify-node` README](../../verify-node/) for full server-side API and score thresholds.

## License

MIT
