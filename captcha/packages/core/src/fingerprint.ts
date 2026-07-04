/**
 * Lightweight widget-side composite fingerprint.
 *
 * Deliberately NOT FingerprintJS — this runs on arbitrary customer sites, so
 * every extra byte/dependency here is a tax on someone else's page. It
 * mirrors the *fallback* path of frontend/lib/fingerprint.ts: a
 * localStorage-persisted device id combined with a few browser signals,
 * SHA-256 hashed.
 *
 * The embed page (frontend/app/verify/c/[challengeId], same origin as the
 * backend) collects the full FingerprintJS-based composite fingerprint
 * separately. The two are cross-checked server-side — a solver farm that
 * opens the embed iframe directly, bypassing the widget/customer site
 * entirely, produces no widget-side fingerprint to correlate against.
 */

const DEVICE_ID_STORAGE_KEY = 'pmv_device_id';
const FINGERPRINT_TTL_MS = 5 * 60_000;

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'r' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getOrCreateDeviceId(): string {
  try {
    const store = window.localStorage;
    let id = store.getItem(DEVICE_ID_STORAGE_KEY);
    if (!id) {
      id = randomId();
      store.setItem(DEVICE_ID_STORAGE_KEY, id);
    }
    return id;
  } catch {
    // localStorage may be blocked (quota, privacy mode) — an ephemeral id
    // still lets the request proceed, just without cross-page stability.
    return randomId();
  }
}

async function sha256Hex(text: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('WebCrypto unavailable');
  }
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Cheap non-cryptographic fallback when SubtleCrypto is unavailable (e.g. insecure http:// context). */
function fallbackHash(raw: string): string {
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function rawSignals(deviceId: string): string {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const scr = typeof window !== 'undefined' ? window.screen : undefined;
  return [
    nav ? nav.userAgent : '',
    nav ? nav.language : '',
    scr ? scr.width : '',
    scr ? scr.height : '',
    scr ? scr.colorDepth : '',
    new Date().getTimezoneOffset(),
    deviceId,
  ].join('|');
}

let cached: { value: string; expires: number } | null = null;

/**
 * Compute (or return the cached) widget-side composite fingerprint.
 * Never throws — resolves to a fallback hash if WebCrypto is unavailable.
 */
export async function getWidgetFingerprint(): Promise<string> {
  if (cached && cached.expires > Date.now()) return cached.value;
  if (typeof window === 'undefined') return '';

  const deviceId = getOrCreateDeviceId();
  const raw = rawSignals(deviceId);
  let value: string;
  try {
    value = await sha256Hex(raw);
  } catch {
    value = fallbackHash(raw);
  }
  cached = { value, expires: Date.now() + FINGERPRINT_TTL_MS };
  return value;
}
