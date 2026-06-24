const DEFAULT_BASE = 'https://verify.proofmark.com';
const loaders = new Map<string, Promise<void>>();

/** Load api.js once per base URL (explicit-render mode). Resolves when window.pmverify exists. */
export function loadVerifyScript(scriptBaseUrl?: string): Promise<void> {
  const base = (scriptBaseUrl || DEFAULT_BASE).replace(/\/+$/, '');
  const src = `${base}/api.js?render=explicit`;
  if (typeof window !== 'undefined' && window.pmverify) return Promise.resolve();
  const existing = loaders.get(src);
  if (existing) return existing;

  const p = new Promise<void>((resolve, reject) => {
    if (typeof document === 'undefined') { reject(new Error('no document')); return; }
    let el = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (!el) {
      el = document.createElement('script');
      el.src = src;
      el.async = true;
      document.head.appendChild(el);
    }
    el.addEventListener('load', () => resolve());
    el.addEventListener('error', () => { loaders.delete(src); reject(new Error('failed to load api.js')); });
    // If the script was already present and finished loading before our
    // listeners attached, the 'load' event won't fire again — re-check on a
    // microtask so we still resolve.
    Promise.resolve().then(() => { if (window.pmverify) resolve(); });
  });
  loaders.set(src, p);
  return p;
}

/** Test-only: clear the dedupe cache. */
export function __resetLoaders(): void { loaders.clear(); }
