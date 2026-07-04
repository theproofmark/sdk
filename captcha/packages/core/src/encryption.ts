/**
 * Best-effort AES-256-GCM + RSA-OAEP envelope encryption for the widget's
 * initial /v1/verify/challenge POST.
 *
 * Unlike the main product (browser <-> Next.js <-> Go, each hop separately
 * encrypted), the widget talks to the Go backend directly, so only one
 * encryption leg is needed. The envelope shape matches
 * backend/services/encryption_service.go's EncryptedEnvelope exactly:
 * `payload` is base64(AES-GCM ciphertext || 16-byte tag) — WebCrypto's
 * AES-GCM `encrypt()` already appends the tag, so no manual splicing is
 * needed on this side. AAD binding is intentionally NOT used here — it
 * defaults to off server-side (ENCRYPTION_BIND_AAD), and sending an AAD the
 * server doesn't expect would make every decrypt fail closed.
 *
 * Encryption is defense-in-depth, not secrecy the flow depends on: every
 * failure mode here (no key endpoint, WebCrypto unavailable, insecure http
 * context) falls back to a plaintext POST rather than blocking the widget.
 */

export interface EncryptedEnvelope {
  key: string;
  iv: string;
  payload: string;
  key_id?: string;
}

interface CachedKey {
  keyId: string;
  cryptoKey: CryptoKey;
  expiresAt: number;
}

const KEY_CACHE_TTL_MS = 5 * 60_000;

let cachedKey: CachedKey | null = null;
let inflight: Promise<CachedKey | null> | null = null;

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const clean = pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function fetchPublicKey(apiBase: string): Promise<{ pem: string; keyId: string } | null> {
  try {
    const res = await fetch(apiBase + '/v1/verify/security/public-key', { method: 'GET' });
    if (!res.ok) return null;
    const body = (await res.json()) as { public_key?: unknown; key_id?: unknown };
    if (!body || typeof body.public_key !== 'string' || !body.public_key) return null;
    return { pem: body.public_key, keyId: typeof body.key_id === 'string' ? body.key_id : '' };
  } catch {
    return null;
  }
}

async function resolveKey(apiBase: string): Promise<CachedKey | null> {
  if (cachedKey && cachedKey.expiresAt > Date.now()) return cachedKey;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const fetched = await fetchPublicKey(apiBase);
      if (!fetched) return null;
      const cryptoKey = await crypto.subtle.importKey(
        'spki',
        pemToArrayBuffer(fetched.pem),
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['encrypt'],
      );
      cachedKey = { keyId: fetched.keyId, cryptoKey, expiresAt: Date.now() + KEY_CACHE_TTL_MS };
      return cachedKey;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Encrypt `payload` for the Go backend. Returns null (never throws) when
 * the public key is unavailable or WebCrypto is missing — callers should
 * fall back to a plaintext POST.
 */
export async function encryptEnvelope(apiBase: string, payload: unknown): Promise<EncryptedEnvelope | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;

  const key = await resolveKey(apiBase);
  if (!key) return null;

  try {
    const plaintext = new TextEncoder().encode(JSON.stringify(payload ?? {}));
    const aesKeyRaw = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const aesKey = await crypto.subtle.importKey('raw', aesKeyRaw, 'AES-GCM', false, ['encrypt']);
    const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext as BufferSource);
    const encryptedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key.cryptoKey, aesKeyRaw);

    return {
      key: bufToBase64(encryptedKey),
      iv: bufToBase64(iv),
      payload: bufToBase64(cipherBuffer),
      key_id: key.keyId || undefined,
    };
  } catch {
    return null;
  }
}
