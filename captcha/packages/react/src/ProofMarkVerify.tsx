import {
  forwardRef, useEffect, useImperativeHandle, useRef, useState,
} from 'react';
import { loadVerifyScript } from './loadScript';
import type { ProofMarkVerifyHandle, ProofMarkVerifyProps } from './types';

export const ProofMarkVerify = forwardRef<ProofMarkVerifyHandle, ProofMarkVerifyProps>(
  function ProofMarkVerify(
    { siteKey, onToken, onExpire, onError, theme = 'auto', action, lang, scriptBaseUrl },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<number | null>(null);
    const onTokenRef = useRef(onToken);
    const onExpireRef = useRef(onExpire);
    const onErrorRef = useRef(onError);
    onTokenRef.current = onToken;
    onExpireRef.current = onExpire;
    onErrorRef.current = onError;

    const [ready, setReady] = useState(false);

    useImperativeHandle(ref, () => ({
      reset() {
        if (widgetIdRef.current !== null && window.pmverify) {
          window.pmverify.reset(widgetIdRef.current);
        }
      },
    }));

    useEffect(() => {
      let cancelled = false;
      loadVerifyScript(scriptBaseUrl)
        .then(() => { if (!cancelled) setReady(true); })
        .catch(() => { if (!cancelled) onErrorRef.current?.('script-load-failed'); });
      return () => { cancelled = true; };
    }, [scriptBaseUrl]);

    useEffect(() => {
      if (!ready || !containerRef.current || !window.pmverify || !siteKey) return;
      if (widgetIdRef.current !== null) {
        window.pmverify.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
      widgetIdRef.current = window.pmverify.render(containerRef.current, {
        sitekey: siteKey,
        callback: (t) => onTokenRef.current(t),
        'expired-callback': () => onExpireRef.current?.(),
        'error-callback': (c) => onErrorRef.current?.(c),
        theme,
        action,
        lang,
      });
      return () => {
        if (widgetIdRef.current !== null && window.pmverify) {
          window.pmverify.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
      };
    }, [ready, siteKey, theme, action, lang]);

    return <div ref={containerRef} />;
  }
);
