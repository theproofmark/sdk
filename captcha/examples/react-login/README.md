# React login example

The component usage mirrors `integrations/captcha` (the in-repo demo app), but
imports from the published package instead of a local file:

```tsx
'use client';
import { useRef, useState } from 'react';
import { ProofMarkVerify, type LockoutInfo, type ProofMarkVerifyHandle } from '@proofmark/verify-react';

export function LoginForm({ siteKey }: { siteKey: string }) {
  const verifyRef = useRef<ProofMarkVerifyHandle>(null);
  const [token, setToken] = useState<string | null>(null);
  const [lockout, setLockout] = useState<LockoutInfo | null>(null);

  return (
    <form onSubmit={/* attach token, POST to your server action */ undefined}>
      <input name="email" type="email" required />
      <ProofMarkVerify
        ref={verifyRef}
        siteKey={siteKey}
        onToken={setToken}
        onExpire={() => setToken(null)}
        onLockout={setLockout}
        action="login"
        // scriptBaseUrl="http://localhost:8080"  // dev override
      />
      {lockout && <p>Too many attempts — try again in {lockout.retryAfterSec}s.</p>}
      <button type="submit" disabled={!token || !!lockout}>Sign in</button>
    </form>
  );
}
```

`onLockout` fires when the visitor's fingerprint+IP is under an active
penalty escalation (repeated failures/fraud signals) — distinct from
`onError`, since retrying immediately won't help. Omitting it is safe;
the widget's checkbox still renders locked either way. See the core
package's README for the full security model.

Server-side, verify the token with `@proofmark/verify-node`
(`POST /v1/verify/siteverify`). See `sdks/verify-node`.