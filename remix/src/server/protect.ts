/**
 * Core ShowAd protection for Remix.
 *
 * `requireShowAdVerification(request, config, options?)` returns:
 *   - `Response` when the request must be redirected/short-circuited
 *     (claim ticket, redirect to video ad, set/clear cookies).
 *   - `undefined` when the request is verified and the loader/route
 *     should continue executing normally.
 *
 * Middleware order (mirrors other SDKs):
 *   path -> access policy -> ticket claim -> token validate -> redirect.
 */

import type {
  ShowAdConfig,
  ProtectOptions,
  ClaimTicketResponse,
} from '../types';
import {
  buildVerificationSetCookieHeaders,
  buildClearSetCookieHeaders,
  readShowAdCookies,
  DEFAULT_COOKIE_MAX_AGE,
} from '../core/cookies';
import { getTokenExpiry, isTokenExpired, validateTokenClaims } from '../core/jwt';
import { isPathExcluded, isPathProtected } from '../core/path-match';
import {
  buildVideoAdRedirectUrl,
  removeQueryParam,
  resolveVideoAdUrl,
} from '../core/url';
import {
  evaluateAccessPolicy,
  type AccessPolicyOptions,
} from '../core/access-policy';
import {
  claimRedirectTicket as claimRedirectTicketViaApi,
  validateToken as validateTokenViaApi,
} from '../core/api';

const REDIRECT_TICKET_PARAM = 'redirect_ticket';

function debugLog(config: Pick<ShowAdConfig, 'debug'>, ...args: unknown[]): void {
  if (config.debug) {
    // eslint-disable-next-line no-console
    console.log('[ShowAd Remix]', ...args);
  }
}

function isHttps(request: Request, config: ShowAdConfig): boolean {
  if (config.secure === true) return true;
  if (config.secure === false) return false;
  try {
    const protocol = new URL(request.url).protocol;
    if (protocol === 'https:') return true;
    if (protocol === 'http:') return false;
  } catch {
    // ignore
  }
  const proto = request.headers.get('x-forwarded-proto');
  return (proto || '').toLowerCase().includes('https');
}

function appendSetCookies(headers: Headers, setCookies: string[]): void {
  for (const value of setCookies) {
    headers.append('Set-Cookie', value);
  }
}

function buildRedirectResponse(
  location: string,
  setCookies: string[] = [],
  status: number = 302
): Response {
  const headers = new Headers({ Location: location });
  appendSetCookies(headers, setCookies);
  return new Response(null, { status, headers });
}

function redirectToVideoAd(
  request: Request,
  config: ShowAdConfig,
  options?: ProtectOptions,
  reason?: string
): Response {
  if (reason) options?.onVerificationFailed?.(reason);
  const cleanReturnUrl = removeQueryParam(request.url, REDIRECT_TICKET_PARAM);
  const target = buildVideoAdRedirectUrl({
    videoAdUrl: resolveVideoAdUrl(config.videoAdUrl),
    creatorHash: config.creatorHash,
    returnUrl: cleanReturnUrl,
  });
  return buildRedirectResponse(target, buildClearSetCookieHeaders(config.cookiePrefix));
}

async function handleRedirectTicket(
  request: Request,
  config: ShowAdConfig,
  options: ProtectOptions | undefined,
  ticketId: string,
  fingerprint: string | null
): Promise<Response> {
  if (!fingerprint) {
    debugLog(config, 'Redirect ticket without fingerprint cookie - sending to video ad');
    return redirectToVideoAd(request, config, options, 'no_fingerprint');
  }

  let claim: ClaimTicketResponse;
  try {
    claim = await claimRedirectTicketViaApi(config, ticketId);
  } catch (err) {
    debugLog(config, 'Ticket claim failed:', (err as Error).message);
    return redirectToVideoAd(request, config, options, 'ticket_claim_failed');
  }

  if (claim.creator_hash !== config.creatorHash) {
    debugLog(config, 'Ticket creator mismatch');
    return redirectToVideoAd(request, config, options, 'creator_mismatch');
  }

  const cleanUrl = removeQueryParam(request.url, REDIRECT_TICKET_PARAM);
  const cookieHeaders = buildVerificationSetCookieHeaders({
    token: claim.token,
    creatorHash: claim.creator_hash,
    ticketId: claim.ticket_id,
    tokenExpiry: getTokenExpiry(claim.token),
    cookieMaxAge: config.cookieMaxAge ?? DEFAULT_COOKIE_MAX_AGE,
    cookiePrefix: config.cookiePrefix,
    secure: isHttps(request, config),
  });

  return buildRedirectResponse(cleanUrl, cookieHeaders);
}

function pathSelectionMatches(pathname: string, options?: ProtectOptions): boolean {
  if (!options) return true;
  if (isPathExcluded(pathname, options.excludePaths || [])) return false;
  if ((options.protectedPaths || []).length === 0) return true;
  return isPathProtected(pathname, options.protectedPaths || []);
}

type PolicyOutcome =
  | { kind: 'allow' }
  | { kind: 'continue' }
  | { kind: 'response'; response: Response };

async function runAccessPolicy(
  request: Request,
  config: ShowAdConfig,
  policy: AccessPolicyOptions
): Promise<PolicyOutcome> {
  const decision = await evaluateAccessPolicy(request, policy);
  if (decision.action === 'allow') {
    debugLog(config, 'Access policy allow:', decision.reason);
    return { kind: 'allow' };
  }
  if (decision.action === 'redirect') {
    debugLog(config, 'Access policy redirect:', decision.reason);
    const target = decision.redirectUrl
      ? new URL(decision.redirectUrl, request.url).toString()
      : buildVideoAdRedirectUrl({
          videoAdUrl: resolveVideoAdUrl(config.videoAdUrl),
          creatorHash: config.creatorHash,
          returnUrl: removeQueryParam(request.url, REDIRECT_TICKET_PARAM),
        });
    return { kind: 'response', response: buildRedirectResponse(target) };
  }
  return { kind: 'continue' };
}

/**
 * Verify a Remix Web `Request`. Returns:
 *   - a `Response` (redirect) when the visitor needs to be sent through the
 *     ad flow or back to a clean URL after claiming a ticket.
 *   - `undefined` when the visitor is verified and the route may proceed.
 *
 * Use inside loaders/actions, in `entry.server.tsx`, or via the provided
 * `protectLoader` / `wrapHandleRequest` helpers.
 */
export async function requireShowAdVerification(
  request: Request,
  config: ShowAdConfig,
  options?: ProtectOptions
): Promise<Response | undefined> {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return undefined;
  }

  const pathname = url.pathname;
  if (!pathSelectionMatches(pathname, options)) {
    return undefined;
  }

  if (options?.accessPolicy) {
    const outcome = await runAccessPolicy(request, config, options.accessPolicy);
    if (outcome.kind === 'response') return outcome.response;
    if (outcome.kind === 'allow') return undefined;
  }

  const cookies = readShowAdCookies(request, config.cookiePrefix);
  const ticketId = url.searchParams.get(REDIRECT_TICKET_PARAM);

  if (ticketId) {
    return handleRedirectTicket(request, config, options, ticketId, cookies.fingerprint);
  }

  if (cookies.token) {
    if (isTokenExpired(cookies.token)) {
      debugLog(config, 'Token expired');
      return redirectToVideoAd(request, config, options, 'expired_token');
    }

    const validation = validateTokenClaims(
      cookies.token,
      config.creatorHash,
      cookies.fingerprint
    );

    if (!validation.valid) {
      debugLog(config, 'Token invalid:', validation.reason);
      return redirectToVideoAd(request, config, options, validation.reason || 'invalid_token');
    }

    try {
      await validateTokenViaApi(config, cookies.token);
    } catch (err) {
      debugLog(config, 'Backend token validation failed:', (err as Error).message);
      return redirectToVideoAd(request, config, options, 'invalid_token');
    }

    const tokenExpiry = getTokenExpiry(cookies.token);
    const stored = cookies.expires;
    const verifiedFlag = cookies.verified === '1';
    const creatorMatches = cookies.creator === config.creatorHash;

    if (
      !verifiedFlag ||
      !creatorMatches ||
      (tokenExpiry !== null && stored !== String(tokenExpiry))
    ) {
      const headers = new Headers();
      const cookieHeaders = buildVerificationSetCookieHeaders({
        token: cookies.token,
        creatorHash: config.creatorHash,
        ticketId: cookies.ticket || undefined,
        tokenExpiry,
        cookieMaxAge: config.cookieMaxAge ?? DEFAULT_COOKIE_MAX_AGE,
        cookiePrefix: config.cookiePrefix,
        secure: isHttps(request, config),
      });
      appendSetCookies(headers, cookieHeaders);
      return new Response(null, { status: 204, headers });
    }

    return undefined;
  }

  return redirectToVideoAd(request, config, options, 'no_verification');
}

/**
 * Inspect cookies without performing any redirect. Useful for conditional UI
 * inside loaders that already passed `requireShowAdVerification`.
 */
export function getVerificationFromRequest(
  request: Request,
  config: ShowAdConfig
): {
  isVerified: boolean;
  fingerprint: string | null;
  token: string | null;
  error: string | null;
} {
  const cookies = readShowAdCookies(request, config.cookiePrefix);

  if (!cookies.token) {
    return {
      isVerified: false,
      fingerprint: cookies.fingerprint,
      token: null,
      error: 'no_token',
    };
  }

  if (isTokenExpired(cookies.token)) {
    return {
      isVerified: false,
      fingerprint: cookies.fingerprint,
      token: null,
      error: 'expired_token',
    };
  }

  const validation = validateTokenClaims(
    cookies.token,
    config.creatorHash,
    cookies.fingerprint
  );
  if (!validation.valid) {
    return {
      isVerified: false,
      fingerprint: cookies.fingerprint,
      token: null,
      error: validation.reason || 'invalid_token',
    };
  }

  return {
    isVerified: true,
    fingerprint: cookies.fingerprint,
    token: cookies.token,
    error: null,
  };
}
