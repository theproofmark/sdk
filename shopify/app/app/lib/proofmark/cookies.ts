/**
 * Server-side cookie helpers (storefront cookies set via the App Proxy
 * response). Same `showad_*` naming as @showad/nextjs-sdk.
 *
 * NOTE: Shopify's app proxy returns the response under the merchant's
 * storefront domain, so any `Set-Cookie` here lands on the merchant origin
 * and is sent back on subsequent storefront requests.
 */

export const COOKIE_PREFIX = 'showad';
export const COOKIE_FINGERPRINT = `${COOKIE_PREFIX}_fingerprint`;
export const COOKIE_TOKEN = `${COOKIE_PREFIX}_token`;
export const COOKIE_CREATOR = `${COOKIE_PREFIX}_creator`;
export const COOKIE_TICKET = `${COOKIE_PREFIX}_ticket`;
export const COOKIE_VERIFIED = `${COOKIE_PREFIX}_verified`;
export const COOKIE_EXPIRES = `${COOKIE_PREFIX}_expires`;

export interface CookieOptions {
  path?: string;
  maxAge?: number;
  domain?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export function parseCookieHeader(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  if (!/^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/.test(name)) {
    throw new Error('Invalid cookie name');
  }
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  parts.push(`Path=${options.path || '/'}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  return parts.join('; ');
}

export interface VerificationCookieData {
  token: string;
  creatorHash: string;
  ticketId?: string | null;
  fingerprint?: string | null;
  expiresAt?: number | null;
  cookieMaxAge: number;
  secure: boolean;
}

export function buildVerificationCookies(data: VerificationCookieData): string[] {
  const base: CookieOptions = {
    path: '/',
    maxAge: data.cookieMaxAge,
    secure: data.secure,
    sameSite: 'Lax',
  };
  const cookies = [
    serializeCookie(COOKIE_TOKEN, data.token, { ...base, httpOnly: true }),
    serializeCookie(COOKIE_VERIFIED, '1', base),
    serializeCookie(COOKIE_CREATOR, data.creatorHash, base),
  ];
  if (data.ticketId) cookies.push(serializeCookie(COOKIE_TICKET, data.ticketId, base));
  if (data.fingerprint) cookies.push(serializeCookie(COOKIE_FINGERPRINT, data.fingerprint, base));
  if (typeof data.expiresAt === 'number') {
    cookies.push(serializeCookie(COOKIE_EXPIRES, String(data.expiresAt), base));
  }
  return cookies;
}

export function buildClearCookies(secure: boolean): string[] {
  const opts: CookieOptions = { path: '/', maxAge: 0, secure, sameSite: 'Lax' };
  return [
    serializeCookie(COOKIE_TOKEN, '', { ...opts, httpOnly: true }),
    serializeCookie(COOKIE_VERIFIED, '', opts),
    serializeCookie(COOKIE_CREATOR, '', opts),
    serializeCookie(COOKIE_TICKET, '', opts),
    serializeCookie(COOKIE_EXPIRES, '', opts),
  ];
}
