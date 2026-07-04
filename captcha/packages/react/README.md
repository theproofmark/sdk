# @proofmark/verify-react

React component for **ProofMark Verify** — the CAPTCHA replacement that plays a short video ad and asks a comprehension question instead of a puzzle.

Thin React wrapper around [`@proofmark/verify-js`](../core/). Loads the core widget script and exposes both a component and a hook for flexible integration.

## Install

```bash
npm install @proofmark/verify-react
```

**Peer dependencies:** react and react-dom >= 18

## Quick start

Use the `<ProofMarkVerify>` component in your form:

```tsx
import { ProofMarkVerify } from '@proofmark/verify-react';

export function SignupForm() {
  const [token, setToken] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState(false);

  const handleToken = (newToken: string) => {
    setToken(newToken);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) {
      alert('Please complete the verification');
      return;
    }

    const formData = new FormData(e.currentTarget);
    formData.append('pm-verify-response', token);

    const response = await fetch('/api/signup', {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      setSubmitted(true);
    } else {
      alert('Signup failed');
      setToken(null);
    }
  };

  if (submitted) {
    return <p>Welcome!</p>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="email" name="email" placeholder="Email" required />
      <ProofMarkVerify
        siteKey="pmv_live_xxxxxxxx"
        onToken={handleToken}
        theme="auto"
      />
      <button type="submit">Sign up</button>
    </form>
  );
}
```

## Props

### `<ProofMarkVerify>`

| Prop | Type | Required | Description |
|---|---|---|---|
| `siteKey` | string | yes | Your site key (`pmv_live_…`) |
| `onToken` | (token: string) => void | yes | Called when the user completes the challenge |
| `onExpire` | () => void | no | Called when the token expires (~270s after success) |
| `onError` | (code: string) => void | no | Called on error |
| `onLockout` | (info: LockoutInfo) => void | no | Called when the server applies a penalty lockout (see [Security model](#security-model)). Falls back to `onError('locked-out')` if not set |
| `theme` | `'light'` \| `'dark'` \| `'auto'` | no | Default: `'auto'` |
| `action` | string | no | Action label sent with verification |
| `lang` | string | no | Locale code (e.g., `'en'`, `'es'`, `'fr'`) |
| `scriptBaseUrl` | string | no | Override where `api.js` loads from (default: `https://verify.proofmark.com`) |

## Imperative control via ref

Use a ref to programmatically reset the widget after a failed submission:

```tsx
import { useRef } from 'react';
import { ProofMarkVerify, ProofMarkVerifyHandle } from '@proofmark/verify-react';

export function MyForm() {
  const verifyRef = useRef<ProofMarkVerifyHandle>(null);
  const [token, setToken] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const response = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      // Reset the widget on failure
      verifyRef.current?.reset();
      setToken(null);
      alert('Verification failed, please try again');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <ProofMarkVerify
        ref={verifyRef}
        siteKey="pmv_live_xxxxxxxx"
        onToken={setToken}
      />
      <button type="submit" disabled={!token}>
        Submit
      </button>
    </form>
  );
}
```

### `LockoutInfo`

```ts
interface LockoutInfo {
  code: string; // 'locked-out'
  tier?: 'minor' | 'moderate' | 'severe';
  retryAfterSec?: number;
}
```

```tsx
<ProofMarkVerify
  siteKey="pmv_live_xxxxxxxx"
  onToken={setToken}
  onLockout={(info) => {
    setLockoutMessage(`Too many attempts, try again in ${info.retryAfterSec}s`);
  }}
/>
```

The widget itself renders a disabled state and re-enables automatically once
`retryAfterSec` elapses — `onLockout` is for surfacing a message in your own UI (e.g.
disabling the submit button, showing a toast), not for resetting the widget.

## Hook API

For non-JSX usage or more granular control, use the `useProofMarkVerify` hook:

```tsx
import { useProofMarkVerify } from '@proofmark/verify-react';

export function CustomWidget() {
  const { ready, render, reset, getResponse } = useProofMarkVerify({
    scriptBaseUrl: 'https://verify.proofmark.com',
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const [widgetId, setWidgetId] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (ready && containerRef.current && !widgetId) {
      const id = render(containerRef.current, {
        sitekey: 'pmv_live_xxxxxxxx',
        callback: (token) => {
          console.log('Token:', token);
        },
      });
      setWidgetId(id);
    }
  }, [ready, render, widgetId]);

  return (
    <div>
      <div ref={containerRef} />
      <button onClick={() => widgetId !== null && reset(widgetId)}>
        Reset
      </button>
      <button
        onClick={() => {
          const token = widgetId !== null ? getResponse(widgetId) : '';
          console.log('Current token:', token);
        }}
      >
        Get Token
      </button>
    </div>
  );
}
```

**Hook return object:**

| Property | Type | Description |
|---|---|---|
| `ready` | boolean | True when the core script has loaded |
| `render(el, args)` | (el: HTMLElement \| string, args: RenderOptions) => number | Renders the widget; returns widget ID |
| `reset(id)` | (id: number) => void | Resets widget state and clears token |
| `getResponse(id)` | (id: number) => string | Returns the current token (empty if none or expired) |

## Local development

To point the widget at a local or self-hosted backend, pass `scriptBaseUrl`:

```tsx
<ProofMarkVerify
  siteKey="pmv_test_always_pass"
  onToken={handleToken}
  scriptBaseUrl="http://localhost:8080"
/>
```

This overrides the default `https://verify.proofmark.com` and is useful for testing against a local backend.

## Token lifecycle

- **Single-use:** Each token can only be verified once server-side.
- **Short-lived:** Tokens expire automatically ~270 seconds after successful completion. Call `onExpire` when this happens.
- **Reset on error:** After a failed server-side verification, call the ref's `reset()` method to clear the token and let the user try again.

## Security model

Every challenge is protected by the same signal collection and encrypted transport used
by the core widget (fingerprinting, traffic-integrity signals, AES/RSA-encrypted
requests, and per-challenge ECDSA-signed submissions from the challenge iframe) plus
server-side penalty escalation and frequency capping. This all happens transparently —
the only integration surface is the optional `onLockout` prop above. See the
[`@proofmark/verify-js` security model](../core/README.md#security-model) for details.

## Server-side verification

Tokens must be verified server-side using [`@proofmark/verify-node`](../../verify-node/). Pass the token from `onToken` to your backend and verify it:

```js
const token = req.body.token;
const result = await pmv.verify(token, { remoteip: req.ip });

if (!result.success) {
  return res.status(400).json({ error: 'Verification failed' });
}
// proceed with your logic
```

See [`@proofmark/verify-node` README](../../verify-node/) for full server-side API and score thresholds.

## License

MIT
