# React login example

The component usage mirrors `integrations/captcha` (the in-repo demo app), but
imports from the published package instead of a local file:

```tsx
'use client';
import { useRef, useState } from 'react';
import { ProofMarkVerify, type ProofMarkVerifyHandle } from '@proofmark/verify-react';

export function LoginForm({ siteKey }: { siteKey: string }) {
  const verifyRef = useRef<ProofMarkVerifyHandle>(null);
  const [token, setToken] = useState<string | null>(null);

  return (
    <form onSubmit={/* attach token, POST to your server action */ undefined}>
      <input name="email" type="email" required />
      <ProofMarkVerify
        ref={verifyRef}
        siteKey={siteKey}
        onToken={setToken}
        onExpire={() => setToken(null)}
        action="login"
        // scriptBaseUrl="http://localhost:8080"  // dev override
      />
      <button type="submit" disabled={!token}>Sign in</button>
    </form>
  );
}
```

Server-side, verify the token with `@proofmark/verify-node`
(`POST /v1/verify/siteverify`). See `sdks/verify-node`.