/**
 * Shopify App Proxy HMAC verification.
 *
 * Spec: https://shopify.dev/docs/apps/online-store/app-proxies#calculate-a-digital-signature
 *
 * Algorithm:
 *   1. Take all query parameters except `signature`.
 *   2. Sort them alphabetically by key.
 *   3. For each key, join multi-values with `,`.
 *   4. Concatenate as `key=value` pairs with NO separator.
 *   5. HMAC-SHA256 the resulting string with SHOPIFY_API_SECRET.
 *   6. Hex-encode and constant-time compare to `signature`.
 */

import crypto from 'node:crypto';

export interface ProxyVerifyResult {
  valid: boolean;
  reason?: 'missing_signature' | 'mismatch';
  message?: string;
}

export function verifyAppProxyRequest(
  url: URL | string,
  secret: string
): ProxyVerifyResult {
  if (!secret) {
    return { valid: false, reason: 'mismatch', message: 'Missing SHOPIFY_API_SECRET' };
  }
  const parsed = typeof url === 'string' ? new URL(url, 'https://placeholder.invalid') : url;
  const params = parsed.searchParams;

  const signature = params.get('signature');
  if (!signature) {
    return { valid: false, reason: 'missing_signature', message: 'Missing signature param' };
  }

  const message = canonicalQueryString(params);
  const computed = crypto.createHmac('sha256', secret).update(message).digest('hex');

  if (!constantTimeEqualHex(computed, signature)) {
    return { valid: false, reason: 'mismatch', message: 'HMAC signature mismatch' };
  }
  return { valid: true };
}

export function canonicalQueryString(params: URLSearchParams): string {
  const grouped = new Map<string, string[]>();
  for (const [key, value] of params.entries()) {
    if (key === 'signature') continue;
    const list = grouped.get(key) || [];
    list.push(value);
    grouped.set(key, list);
  }
  const sortedKeys = [...grouped.keys()].sort();
  return sortedKeys.map((k) => `${k}=${grouped.get(k)!.join(',')}`).join('');
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  // Compare hex strings as raw bytes (hex is ASCII; using 'hex' decoder
  // ensures byte-by-byte timing-safe comparison of the decoded signatures).
  try {
    const aBytes = Buffer.from(a, 'hex');
    const bBytes = Buffer.from(b, 'hex');
    if (aBytes.length !== bBytes.length || aBytes.length === 0) {
      return false;
    }
    return crypto.timingSafeEqual(aBytes, bBytes);
  } catch {
    return false;
  }
}
