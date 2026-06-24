/** Escape HTML special chars before injecting localized strings via innerHTML. */
export function escapeHtml(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}

/** Append a query param, choosing ? or & correctly. */
export function appendQueryParam(url: string, key: string, value: string): string {
  if (!url) return url;
  const sep = url.indexOf('?') === -1 ? '?' : '&';
  return url + sep + encodeURIComponent(key) + '=' + encodeURIComponent(value);
}

/** Origin of a URL resolved against the current page; null on parse failure. */
export function originOf(url: string | null): string | null {
  if (!url) return null;
  try {
    // In a browser, resolve relative URLs against the current page.
    // In Node (tests), only accept absolute URLs.
    const base = typeof window !== 'undefined' && window.location ? window.location.href : undefined;
    return new URL(url, base).origin;
  } catch {
    return null;
  }
}

/** Coerce a callback option (fn, or global fn-name string) into a callable or null. */
export function resolveCallback<T extends (...a: never[]) => void>(
  cb: T | string | undefined
): T | null {
  if (typeof cb === 'function') return cb;
  if (typeof cb === 'string' && cb) {
    return ((arg: never) => {
      const fn = (globalThis as Record<string, unknown>)[cb];
      if (typeof fn === 'function') (fn as (a: never) => void)(arg);
    }) as unknown as T;
  }
  return null;
}
