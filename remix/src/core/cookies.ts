/**
 * Cookie name constants and Set-Cookie builders.
 *
 * Cookie semantics (must mirror the other SDKs):
 *   showad_fingerprint  - client-set, readable, browser fingerprint.
 *   showad_token        - server-set, HttpOnly, JWT.
 *   showad_creator      - server-set, readable, creator hash.
 *   showad_ticket       - server-set, readable, ticket id.
 *   showad_verified     - '1', readable, UX signal.
 *   showad_expires      - readable, expiry epoch seconds.
 */

const DEFAULT_COOKIE_PREFIX = 'showad';
export const DEFAULT_COOKIE_MAX_AGE = 3600;

export interface CookieNames {
  fingerprint: string;
  token: string;
  creator: string;
  ticket: string;
  verified: string;
  expires: string;
}

export function getCookieNames(prefix: string = DEFAULT_COOKIE_PREFIX): CookieNames {
  return {
    fingerprint: `${prefix}_fingerprint`,
    token: `${prefix}_token`,
    creator: `${prefix}_creator`,
    ticket: `${prefix}_ticket`,
    verified: `${prefix}_verified`,
    expires: `${prefix}_expires`,
  };
}

export interface CookieOptions {
  maxAge: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  path?: string;
}

/** Build a Set-Cookie header value. */
export function buildSetCookieHeader(
  name: string,
  value: string,
  options: CookieOptions
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || '/'}`);
  parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

export interface VerificationCookieInput {
  token: string;
  creatorHash: string;
  ticketId?: string;
  /** Expiry as unix-seconds. Falls back to now+maxAge when null. */
  tokenExpiry: number | null;
  cookieMaxAge: number;
  cookiePrefix?: string;
  secure: boolean;
}

/**
 * Build the full set of Set-Cookie headers that must be emitted when a
 * visitor is verified (token issued or refreshed).
 */
export function buildVerificationSetCookieHeaders(input: VerificationCookieInput): string[] {
  const names = getCookieNames(input.cookiePrefix);
  const base: CookieOptions = {
    maxAge: input.cookieMaxAge,
    sameSite: 'Lax',
    secure: input.secure,
    path: '/',
  };

  const headers = [
    buildSetCookieHeader(names.token, input.token, { ...base, httpOnly: true }),
    buildSetCookieHeader(names.verified, '1', base),
    buildSetCookieHeader(names.creator, input.creatorHash, base),
  ];
  if (input.ticketId) {
    headers.push(buildSetCookieHeader(names.ticket, input.ticketId, base));
  }
  if (input.tokenExpiry !== null) {
    headers.push(buildSetCookieHeader(names.expires, String(input.tokenExpiry), base));
  }
  return headers;
}

/** Build Set-Cookie headers that clear all SDK cookies. */
export function buildClearSetCookieHeaders(cookiePrefix?: string): string[] {
  const names = getCookieNames(cookiePrefix);
  const opts: CookieOptions = { maxAge: 0, sameSite: 'Lax', path: '/' };
  return [
    buildSetCookieHeader(names.token, '', { ...opts, httpOnly: true }),
    buildSetCookieHeader(names.verified, '', opts),
    buildSetCookieHeader(names.creator, '', opts),
    buildSetCookieHeader(names.ticket, '', opts),
    buildSetCookieHeader(names.expires, '', opts),
  ];
}

/** Parse a `Cookie:` header into a name->value map. */
export function parseCookieHeader(cookieHeader: string | null | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const piece of cookieHeader.split(';')) {
    const idx = piece.indexOf('=');
    if (idx === -1) continue;
    const name = piece.slice(0, idx).trim();
    const value = piece.slice(idx + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

/** Read all relevant SDK cookies from a Web Request. */
export interface ParsedShowAdCookies {
  fingerprint: string | null;
  token: string | null;
  creator: string | null;
  ticket: string | null;
  verified: string | null;
  expires: string | null;
}

export function readShowAdCookies(
  request: Request,
  cookiePrefix?: string
): ParsedShowAdCookies {
  const names = getCookieNames(cookiePrefix);
  const cookies = parseCookieHeader(request.headers.get('cookie'));
  return {
    fingerprint: cookies[names.fingerprint] ?? null,
    token: cookies[names.token] ?? null,
    creator: cookies[names.creator] ?? null,
    ticket: cookies[names.ticket] ?? null,
    verified: cookies[names.verified] ?? null,
    expires: cookies[names.expires] ?? null,
  };
}
