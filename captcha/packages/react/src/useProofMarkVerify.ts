import { useCallback, useEffect, useRef, useState } from 'react';
import { loadVerifyScript } from './loadScript';
import type { ProofMarkVerifyProps } from './types';

type RenderArgs = Omit<ProofMarkVerifyProps, 'scriptBaseUrl'>;

export function useProofMarkVerify(scriptBaseUrl?: string) {
  const [ready, setReady] = useState(false);
  const idRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadVerifyScript(scriptBaseUrl).then(() => { if (!cancelled) setReady(true); }).catch(() => {});
    return () => { cancelled = true; };
  }, [scriptBaseUrl]);

  const render = useCallback((el: HTMLElement, args: RenderArgs) => {
    if (!window.pmverify) return null;
    if (idRef.current !== null) window.pmverify.remove(idRef.current);
    idRef.current = window.pmverify.render(el, {
      sitekey: args.siteKey,
      callback: (t) => args.onToken(t),
      'expired-callback': () => args.onExpire?.(),
      'error-callback': (c) => args.onError?.(c),
      'lockout-callback': (info) => args.onLockout?.(info),
      theme: args.theme ?? 'auto',
      action: args.action,
      lang: args.lang,
    });
    return idRef.current;
  }, []);

  const reset = useCallback(() => {
    if (idRef.current !== null && window.pmverify) window.pmverify.reset(idRef.current);
  }, []);

  const getResponse = useCallback(() => {
    if (idRef.current !== null && window.pmverify) return window.pmverify.getResponse(idRef.current);
    return '';
  }, []);

  return { ready, render, reset, getResponse };
}
