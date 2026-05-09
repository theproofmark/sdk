/**
 * Cookie management utility for ShowAd SDK
 * Handles storing and retrieving verification data in cookies
 */

import type { ShowAdCookieData, ShowAdConfig } from '../types';

const DEFAULT_COOKIE_PREFIX = 'showad';
const DEFAULT_COOKIE_MAX_AGE = 3600; // 1 hour in seconds

/**
 * Get the full cookie name with prefix
 */
function getCookieName(config: ShowAdConfig, suffix: string): string {
  const prefix = config.cookiePrefix || DEFAULT_COOKIE_PREFIX;
  return `${prefix}_${suffix}`;
}

/**
 * Set a cookie with the given value
 */
function setCookie(name: string, value: string, maxAge: number, secure: boolean = true): void {
  if (typeof document === 'undefined') return;

  const sameSite = secure ? 'Strict' : 'Lax';
  const secureFlag = secure ? '; Secure' : '';

  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=${sameSite}${secureFlag}`;
}

/**
 * Get a cookie value by name
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;

  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [cookieName, cookieValue] = cookie.trim().split('=');
    if (cookieName === name) {
      return decodeURIComponent(cookieValue);
    }
  }
  return null;
}

/**
 * Delete a cookie by name
 */
function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; Path=/; Max-Age=0`;
}

/**
 * Store ShowAd verification data in cookies
 */
export function setShowAdCookie(config: ShowAdConfig, data: ShowAdCookieData): void {
  const maxAge = config.cookieMaxAge || DEFAULT_COOKIE_MAX_AGE;
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';

  // Store fingerprint
  setCookie(
    getCookieName(config, 'fingerprint'),
    data.fingerprint,
    maxAge,
    isSecure
  );

  // Store redirect ticket ID if present
  if (data.redirectTicketId) {
    setCookie(
      getCookieName(config, 'ticket'),
      data.redirectTicketId,
      maxAge,
      isSecure
    );
  }

  // Store token if present
  if (data.token) {
    setCookie(
      getCookieName(config, 'token'),
      data.token,
      maxAge,
      isSecure
    );
  }

  // Store creator hash
  setCookie(
    getCookieName(config, 'creator'),
    data.creatorHash,
    maxAge,
    isSecure
  );

  // Store metadata (created at, expires at)
  const metadata = JSON.stringify({
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
  });
  setCookie(
    getCookieName(config, 'meta'),
    metadata,
    maxAge,
    isSecure
  );
}

/**
 * Get ShowAd verification data from cookies
 */
export function getShowAdCookie(config: ShowAdConfig): ShowAdCookieData | null {
  const fingerprint = getCookie(getCookieName(config, 'fingerprint'));
  const creatorHash = getCookie(getCookieName(config, 'creator'));

  // Fingerprint and creator hash are required
  if (!fingerprint || !creatorHash) {
    return null;
  }

  const redirectTicketId = getCookie(getCookieName(config, 'ticket'));
  const token = getCookie(getCookieName(config, 'token'));
  const metadataStr = getCookie(getCookieName(config, 'meta'));

  let createdAt = Date.now();
  let expiresAt: number | null = null;

  if (metadataStr) {
    try {
      const metadata = JSON.parse(metadataStr);
      createdAt = metadata.createdAt || createdAt;
      expiresAt = metadata.expiresAt || null;
    } catch {
      // Ignore parse errors
    }
  }

  return {
    fingerprint,
    redirectTicketId: redirectTicketId || null,
    token: token || null,
    creatorHash,
    createdAt,
    expiresAt,
  };
}

/**
 * Clear all ShowAd cookies
 */
export function clearShowAdCookies(config: ShowAdConfig): void {
  deleteCookie(getCookieName(config, 'fingerprint'));
  deleteCookie(getCookieName(config, 'ticket'));
  deleteCookie(getCookieName(config, 'token'));
  deleteCookie(getCookieName(config, 'creator'));
  deleteCookie(getCookieName(config, 'meta'));
}

/**
 * Update only the token in cookies (after verification)
 */
export function updateShowAdToken(config: ShowAdConfig, token: string, expiresAt: number | null): void {
  const maxAge = config.cookieMaxAge || DEFAULT_COOKIE_MAX_AGE;
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';

  setCookie(
    getCookieName(config, 'token'),
    token,
    maxAge,
    isSecure
  );

  // Update metadata with new expiry
  const existing = getShowAdCookie(config);
  if (existing) {
    const metadata = JSON.stringify({
      createdAt: existing.createdAt,
      expiresAt,
    });
    setCookie(
      getCookieName(config, 'meta'),
      metadata,
      maxAge,
      isSecure
    );
  }
}

/**
 * Check if verification cookie is expired
 */
export function isShowAdCookieExpired(config: ShowAdConfig): boolean {
  const data = getShowAdCookie(config);
  if (!data) return true;

  if (data.expiresAt && data.expiresAt < Date.now()) {
    return true;
  }

  return false;
}

/**
 * Get redirect ticket from URL query params
 * Used when user is redirected back from video ad
 */
export function getRedirectTicketFromUrl(): string | null {
  if (typeof window === 'undefined') return null;

  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('redirect_ticket');
}

/**
 * Remove redirect ticket from URL without page reload
 */
export function removeRedirectTicketFromUrl(): void {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  url.searchParams.delete('redirect_ticket');

  // Update URL without reload
  window.history.replaceState({}, '', url.toString());
}

/**
 * Parse cookies from a cookie header string (for SSR)
 */
export function parseCookieHeader(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach((cookie) => {
    const [name, value] = cookie.trim().split('=');
    if (name && value) {
      cookies[name] = decodeURIComponent(value);
    }
  });

  return cookies;
}

/**
 * Get ShowAd cookie data from parsed cookies (for SSR)
 */
export function getShowAdCookieFromParsed(
  config: ShowAdConfig,
  cookies: Record<string, string>
): ShowAdCookieData | null {
  const prefix = config.cookiePrefix || DEFAULT_COOKIE_PREFIX;

  const fingerprint = cookies[`${prefix}_fingerprint`];
  const creatorHash = cookies[`${prefix}_creator`];

  if (!fingerprint || !creatorHash) {
    return null;
  }

  const redirectTicketId = cookies[`${prefix}_ticket`] || null;
  const token = cookies[`${prefix}_token`] || null;
  const metadataStr = cookies[`${prefix}_meta`];

  let createdAt = Date.now();
  let expiresAt: number | null = null;

  if (metadataStr) {
    try {
      const metadata = JSON.parse(metadataStr);
      createdAt = metadata.createdAt || createdAt;
      expiresAt = metadata.expiresAt || null;
    } catch {
      // Ignore parse errors
    }
  }

  return {
    fingerprint,
    redirectTicketId,
    token,
    creatorHash,
    createdAt,
    expiresAt,
  };
}

