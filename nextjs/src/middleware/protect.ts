/**
 * Server-side middleware for ShowAd SDK
 * 
 * ALL verification logic happens here:
 * 1. Read fingerprint from cookie (set by client)
 * 2. Check for redirect_ticket in URL
 * 3. Claim ticket and get JWT from backend
 * 4. Set token cookie
 * 5. Validate existing tokens
 * 6. Redirect to video ad if not verified
 */

import { NextRequest, NextResponse } from 'next/server.js';
import type { 
  MiddlewareVerificationResult,
  ProtectMiddlewareOptions,
  ClaimTicketResponse,
} from '../types';
import { 
  getTokenExpiry,
  validateTokenClaims, 
  isTokenExpired,
} from '../utils/jwt';
import {
  evaluateAccessPolicy,
  type AccessPolicyOptions,
} from '../server/access-policy';
import { validateToken } from '../utils/api';

// Cookie names (must match client)
const COOKIE_PREFIX = 'showad';
const COOKIE_FINGERPRINT = `${COOKIE_PREFIX}_fingerprint`;
const COOKIE_TOKEN = `${COOKIE_PREFIX}_token`;
const COOKIE_CREATOR = `${COOKIE_PREFIX}_creator`;
const COOKIE_TICKET = `${COOKIE_PREFIX}_ticket`;
const COOKIE_VERIFIED = `${COOKIE_PREFIX}_verified`;
const COOKIE_EXPIRES = `${COOKIE_PREFIX}_expires`;

/**
 * Server-side config with secrets
 */
export interface ShowAdServerConfig {
  /** Creator hash */
  creatorHash: string;
  /** API key (secret) */
  apiKey: string;
  /** Redirect ticket secret (secret) */
  redirectSecret: string;
  /** Backend API URL */
  apiBaseUrl?: string;
  /** Video ad frontend URL */
  videoAdUrl?: string;
  /** Cookie max age in seconds */
  cookieMaxAge?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Create ShowAd protection middleware for Next.js
 */
export function createShowAdMiddleware(
  config: ShowAdServerConfig,
  options?: ProtectMiddlewareOptions
) {
  const {
    protectedPaths = [],
    excludePaths = [],
    onVerificationFailed,
    accessPolicy,
  } = options || {};

  const apiBaseUrl = config.apiBaseUrl || 'https://ad.proofmark.io';
  const videoAdUrl = config.videoAdUrl || 'https://showad.proofmark.io';
  const cookieMaxAge = config.cookieMaxAge || 3600;

  const debugLog = (...args: unknown[]) => {
    if (config.debug) {
      console.log('[ShowAd Middleware]', ...args);
    }
  };

  return async function showAdMiddleware(request: NextRequest): Promise<NextResponse> {
    const pathname = request.nextUrl.pathname;

    // Check if path should be excluded
    if (isPathExcluded(pathname, excludePaths)) {
      return NextResponse.next();
    }

    // Check if path should be protected
    if (!isPathProtected(pathname, protectedPaths)) {
      return NextResponse.next();
    }

    debugLog('Processing protected path:', pathname);

    if (accessPolicy) {
      const decision = await evaluateAccessPolicy(request, accessPolicy);
      if (decision.action === 'allow') {
        debugLog('Access policy bypass:', decision.reason);
        return NextResponse.next();
      }
      if (decision.action === 'redirect') {
        debugLog('Access policy redirect:', decision.reason);
        const redirectUrl = decision.redirectUrl
          ? new URL(decision.redirectUrl, request.url)
          : new URL(`/c/${config.creatorHash}`, videoAdUrl);
        return NextResponse.redirect(redirectUrl);
      }
    }

    // Get cookies
    const fingerprint = request.cookies.get(COOKIE_FINGERPRINT)?.value;
    const existingToken = request.cookies.get(COOKIE_TOKEN)?.value;
    const storedCreatorHash = request.cookies.get(COOKIE_CREATOR)?.value;
    const existingVerified = request.cookies.get(COOKIE_VERIFIED)?.value;
    const existingExpires = request.cookies.get(COOKIE_EXPIRES)?.value;

    // Check for redirect_ticket in URL (user returning from video ad)
    const redirectTicket = request.nextUrl.searchParams.get('redirect_ticket');

    // If we have a redirect ticket, claim it
    if (redirectTicket) {
      debugLog('Found redirect ticket:', redirectTicket);

      if (!fingerprint) {
        debugLog('No fingerprint in cookie - redirecting to video ad');
        onVerificationFailed?.('no_fingerprint');
        return redirectToVideoAd(request, config, videoAdUrl);
      }

      try {
        // Claim the ticket from backend
        const claim = await claimTicketFromBackend(
          apiBaseUrl,
          redirectTicket,
          config.creatorHash,
          config.apiKey,
          config.redirectSecret
        );

        debugLog('Ticket claimed successfully');

        // Verify creator hash matches
        if (claim.creator_hash !== config.creatorHash) {
          debugLog('Creator hash mismatch');
          onVerificationFailed?.('creator_mismatch');
          return redirectToVideoAd(request, config, videoAdUrl);
        }

        // Create response that removes ticket from URL
        const cleanUrl = new URL(request.url);
        cleanUrl.searchParams.delete('redirect_ticket');
        
        const response = NextResponse.redirect(cleanUrl);

        setVerificationCookies(response, request, {
          token: claim.token,
          creatorHash: claim.creator_hash,
          ticketId: claim.ticket_id,
          cookieMaxAge,
        });

        debugLog('Token cookie set, redirecting to clean URL');
        return response;
      } catch (error) {
        debugLog('Ticket claim failed:', error);
        onVerificationFailed?.('ticket_claim_failed');
        return redirectToVideoAd(request, config, videoAdUrl);
      }
    }

    // No redirect ticket - check existing token
    if (existingToken) {
      debugLog('Checking existing token');

      // Check token expiry
      if (isTokenExpired(existingToken)) {
        debugLog('Token expired');
        onVerificationFailed?.('expired_token');
        return redirectToVideoAd(request, config, videoAdUrl);
      }

      // Validate token claims
      const validation = validateTokenClaims(
        existingToken,
        config.creatorHash,
        fingerprint
      );

      if (!validation.valid) {
        debugLog('Token validation failed:', validation.reason);
        onVerificationFailed?.('invalid_token');
        return redirectToVideoAd(request, config, videoAdUrl);
      }

      try {
        await validateToken(config, existingToken);
      } catch (error) {
        debugLog('Backend token validation failed:', error);
        onVerificationFailed?.('invalid_token');
        return redirectToVideoAd(request, config, videoAdUrl);
      }

      debugLog('Token valid - allowing access');
      const tokenExpiry = getTokenExpiry(existingToken);

      if (
        existingVerified !== '1' ||
        storedCreatorHash !== config.creatorHash ||
        (tokenExpiry !== null && existingExpires !== String(tokenExpiry))
      ) {
        const response = NextResponse.next();
        setVerificationCookies(response, request, {
          token: existingToken,
          creatorHash: config.creatorHash,
          ticketId: request.cookies.get(COOKIE_TICKET)?.value,
          cookieMaxAge,
        });
        return response;
      }

      return NextResponse.next();
    }

    // No token and no redirect ticket - need verification
    debugLog('No verification found - redirecting to video ad');
    onVerificationFailed?.('no_verification');
    return redirectToVideoAd(request, config, videoAdUrl);
  };
}

/**
 * Claim ticket from ShowAd backend
 */
async function claimTicketFromBackend(
  apiBaseUrl: string,
  ticketId: string,
  creatorHash: string,
  apiKey: string,
  redirectSecret: string
): Promise<ClaimTicketResponse> {
  const url = `${apiBaseUrl}/api/redirect-ticket/${ticketId}/claim`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Redirect-Ticket-Secret': redirectSecret,
      'X-ShowAd-API-Key': apiKey,
      'X-ShowAd-Creator-Hash': creatorHash,
    },
    body: JSON.stringify({
      creator_hash: creatorHash,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Ticket claim failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Create redirect response to video ad
 */
function redirectToVideoAd(
  request: NextRequest,
  config: ShowAdServerConfig,
  videoAdUrl: string
): NextResponse {
  const returnUrl = request.url;
  const redirectUrl = new URL(`/c/${config.creatorHash}`, videoAdUrl);
  redirectUrl.searchParams.set('return_url', returnUrl);
  redirectUrl.searchParams.set('sdk', '1');

  const response = NextResponse.redirect(redirectUrl);
  clearVerificationCookies(response);
  return response;
}

function getCookieOptions(request: NextRequest, maxAge: number, httpOnly: boolean = false) {
  return {
    path: '/',
    maxAge,
    httpOnly,
    sameSite: 'lax' as const,
    secure: request.url.startsWith('https'),
  };
}

function setVerificationCookies(
  response: NextResponse,
  request: NextRequest,
  options: {
    token: string;
    creatorHash: string;
    ticketId?: string;
    cookieMaxAge: number;
  }
): void {
  const { token, creatorHash, ticketId, cookieMaxAge } = options;
  const tokenExpiry = getTokenExpiry(token);

  response.cookies.set(COOKIE_TOKEN, token, getCookieOptions(request, cookieMaxAge, true));
  response.cookies.set(COOKIE_VERIFIED, '1', getCookieOptions(request, cookieMaxAge));
  response.cookies.set(COOKIE_CREATOR, creatorHash, getCookieOptions(request, cookieMaxAge));

  if (ticketId) {
    response.cookies.set(COOKIE_TICKET, ticketId, getCookieOptions(request, cookieMaxAge));
  }

  if (tokenExpiry !== null) {
    response.cookies.set(COOKIE_EXPIRES, String(tokenExpiry), getCookieOptions(request, cookieMaxAge));
  } else {
    response.cookies.set(COOKIE_EXPIRES, '', getCookieOptions(request, 0));
  }
}

function clearVerificationCookies(response: NextResponse): void {
  const expiredCookie = { path: '/', maxAge: 0 };

  response.cookies.set(COOKIE_TOKEN, '', { ...expiredCookie, httpOnly: true });
  response.cookies.set(COOKIE_VERIFIED, '', expiredCookie);
  response.cookies.set(COOKIE_CREATOR, '', expiredCookie);
  response.cookies.set(COOKIE_TICKET, '', expiredCookie);
  response.cookies.set(COOKIE_EXPIRES, '', expiredCookie);
}

/**
 * Check if pathname matches any protected patterns
 */
function isPathProtected(pathname: string, patterns: string[]): boolean {
  if (patterns.length === 0) {
    return false;
  }
  return patterns.some(pattern => matchPath(pathname, pattern));
}

/**
 * Check if pathname matches any excluded patterns
 */
function isPathExcluded(pathname: string, patterns: string[]): boolean {
  return patterns.some(pattern => matchPath(pathname, pattern));
}

/**
 * Simple glob pattern matching (supports * wildcard)
 */
function matchPath(pathname: string, pattern: string): boolean {
  if (pattern === pathname) {
    return true;
  }

  if (pattern.includes('*')) {
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\//g, '\\/');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(pathname);
  }

  return false;
}

/**
 * Verify a request (for use in API routes or getServerSideProps)
 */
export function verifyRequest(
  request: NextRequest,
  config: ShowAdServerConfig
): MiddlewareVerificationResult {
  const fingerprint = request.cookies.get(COOKIE_FINGERPRINT)?.value;
  const token = request.cookies.get(COOKIE_TOKEN)?.value;

  if (!token) {
    return {
      verified: false,
      reason: 'no_ticket',
    };
  }

  if (isTokenExpired(token)) {
    return {
      verified: false,
      reason: 'expired_token',
    };
  }

  const validation = validateTokenClaims(token, config.creatorHash, fingerprint);
  
  if (!validation.valid) {
    return {
      verified: false,
      reason: 'invalid_ticket',
    };
  }

  return {
    verified: true,
    reason: 'valid_token',
    token,
    creatorHash: config.creatorHash,
  };
}

/**
 * Get verification from cookies object (for Pages Router getServerSideProps)
 */
export function getVerificationFromCookies(
  cookies: Record<string, string>,
  config: ShowAdServerConfig
): {
  isVerified: boolean;
  fingerprint: string | null;
  token: string | null;
  error: string | null;
} {
  const fingerprint = cookies[COOKIE_FINGERPRINT] || null;
  const token = cookies[COOKIE_TOKEN] || null;

  if (!token) {
    return {
      isVerified: false,
      fingerprint,
      token: null,
      error: 'No verification token',
    };
  }

  if (isTokenExpired(token)) {
    return {
      isVerified: false,
      fingerprint,
      token: null,
      error: 'Token expired',
    };
  }

  const validation = validateTokenClaims(token, config.creatorHash, fingerprint || undefined);
  
  if (!validation.valid) {
    return {
      isVerified: false,
      fingerprint,
      token: null,
      error: validation.reason || 'Invalid token',
    };
  }

  return {
    isVerified: true,
    fingerprint,
    token,
    error: null,
  };
}

/**
 * Build video ad redirect URL
 */
export function buildVideoAdRedirectUrl(
  config: ShowAdServerConfig,
  returnUrl: string
): string {
  const videoAdUrl = config.videoAdUrl || 'https://showad.proofmark.io';
  const url = new URL(`/c/${config.creatorHash}`, videoAdUrl);
  url.searchParams.set('return_url', returnUrl);
  url.searchParams.set('sdk', '1');
  return url.toString();
}
