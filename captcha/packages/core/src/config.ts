/** Tuned constants — values copied verbatim from the legacy api.js. */
export const DEFAULT_API_BASE = 'https://api.proofmark.com';
export const MOBILE_BREAKPOINT_PX = 480;
/** Local token-expiry reset, ms. Fires before the server token's ~5-min TTL lapses. */
export const TOKEN_EXPIRY_MS = 270 * 1000;
export const MESSAGE_SOURCE = 'proofmark-verify';
export const HIDDEN_INPUT_NAME = 'pm-verify-response';

/** Reads <meta name="..."> content, else fallback. */
export function readMeta(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const el = document.querySelector('meta[name="' + name + '"]');
  return (el && el.getAttribute('content')) || fallback;
}

/** Resolve the API base. Overridable via <meta name="pmv-api-base">. */
export function resolveApiBase(): string {
  return readMeta('pmv-api-base', DEFAULT_API_BASE);
}

/** Iframe-ready deadline: 30s against localhost (slow dev compiles), else 5s. */
export function iframeReadyTimeoutMs(apiBase: string): number {
  return apiBase.indexOf('localhost') !== -1 ? 30000 : 5000;
}
