/**
 * Framework-free middleware kernel.
 *
 * Adapters convert their native request to a `NormalizedRequest`, call
 * `runProtect`, and translate the resulting `ProtectResult` back into
 * native response actions (cookies, redirects, next()).
 */

import type {
  NormalizedRequest,
  ProtectMiddlewareOptions,
  ShowAdConfig,
} from '../types';
import { isPathExcluded, isPathProtected } from './path-match';
import {
  evaluateAccessPolicy,
  type AccessPolicyDecision,
} from './access-policy';
import {
  buildClearSetCookieHeaders,
  buildVerificationSetCookieHeaders,
  getCookieNames,
} from './cookies';
import { claimRedirectTicket, validateToken } from './api';
import { getTokenExpiry, isTokenExpired, validateTokenClaims } from './jwt';
import {
  buildVideoAdRedirectUrl,
  removeQueryParam,
  resolveVideoAdUrl,
} from './url';

export type ProtectAction = 'next' | 'redirect';

export interface ProtectResult {
  action: ProtectAction;
  /** Absolute URL to redirect to (only when action === 'redirect'). */
  redirectUrl?: string;
  /** Set-Cookie header values to emit. */
  setCookies: string[];
  /** Reason code (mostly for logging/onVerificationFailed). */
  reason?: string;
}

const DEBUG_TAG = '[ShowAd Middleware]';

export async function runProtect(
  request: NormalizedRequest,
  config: ShowAdConfig,
  options: ProtectMiddlewareOptions = {}
): Promise<ProtectResult> {
  const debug = (...args: unknown[]) => {
    if (config.debug) {
      // eslint-disable-next-line no-console
      console.log(DEBUG_TAG, ...args);
    }
  };

  const cookieMaxAge = config.cookieMaxAge ?? 3600;
  const secure = config.secure === true || request.isHttps;
  const cookiePrefix = config.cookiePrefix;
  const names = getCookieNames(cookiePrefix);

  if (isPathExcluded(request.pathname, options.excludePaths)) {
    return { action: 'next', setCookies: [], reason: 'excluded' };
  }

  if (!isPathProtected(request.pathname, options.protectedPaths)) {
    return { action: 'next', setCookies: [], reason: 'not_protected' };
  }

  debug('Processing protected path:', request.pathname);

  if (options.accessPolicy) {
    const decision = await evaluateAccessPolicy(request, options.accessPolicy);
    if (decision.action === 'allow') {
      debug('Access policy bypass:', decision.reason);
      return { action: 'next', setCookies: [], reason: `policy_allow:${decision.reason || ''}` };
    }
    if (decision.action === 'redirect') {
      debug('Access policy redirect:', decision.reason);
      const redirectUrl = decision.redirectUrl
        ? toAbsolute(decision.redirectUrl, request.url)
        : buildVideoAdRedirectUrl({
            videoAdUrl: config.videoAdUrl,
            creatorHash: config.creatorHash,
            returnUrl: request.url,
          });
      return {
        action: 'redirect',
        redirectUrl,
        setCookies: [],
        reason: `policy_redirect:${decision.reason || ''}`,
      };
    }
  }

  const fingerprint = request.cookies[names.fingerprint] || null;
  const existingToken = request.cookies[names.token] || null;
  const storedCreator = request.cookies[names.creator] || null;
  const existingVerified = request.cookies[names.verified] || null;
  const existingExpires = request.cookies[names.expires] || null;
  const redirectTicket = request.searchParams.get('redirect_ticket');

  if (redirectTicket) {
    debug('Found redirect ticket:', redirectTicket);
    try {
      const claim = await claimRedirectTicket(config, redirectTicket);
      if (claim.creator_hash !== config.creatorHash) {
        options.onVerificationFailed?.('creator_mismatch');
        return redirectResponse(request, config, 'creator_mismatch', cookiePrefix);
      }
      const cleanUrl = removeQueryParam(request.url, 'redirect_ticket');
      const cookies = buildVerificationSetCookieHeaders({
        token: claim.token,
        creatorHash: claim.creator_hash,
        ticketId: claim.ticket_id,
        tokenExpiry: getTokenExpiry(claim.token),
        cookieMaxAge,
        cookiePrefix,
        secure,
      });
      return {
        action: 'redirect',
        redirectUrl: cleanUrl,
        setCookies: cookies,
        reason: 'ticket_claimed',
      };
    } catch (err) {
      debug('Ticket claim failed:', (err as Error).message);
      options.onVerificationFailed?.('ticket_claim_failed');
      return redirectResponse(request, config, 'ticket_claim_failed', cookiePrefix);
    }
  }

  if (existingToken) {
    if (isTokenExpired(existingToken)) {
      options.onVerificationFailed?.('expired_token');
      return redirectResponse(request, config, 'expired_token', cookiePrefix);
    }

    const validation = validateTokenClaims(existingToken, config.creatorHash, fingerprint);
    if (!validation.valid) {
      options.onVerificationFailed?.(validation.reason || 'invalid_token');
      return redirectResponse(request, config, validation.reason || 'invalid_token', cookiePrefix);
    }

    try {
      await validateToken(config, existingToken);
    } catch (err) {
      debug('Backend token validation failed:', (err as Error).message);
      options.onVerificationFailed?.('invalid_token');
      return redirectResponse(request, config, 'invalid_token', cookiePrefix);
    }

    const tokenExpiry = getTokenExpiry(existingToken);
    const needsRefresh =
      existingVerified !== '1' ||
      storedCreator !== config.creatorHash ||
      (tokenExpiry !== null && existingExpires !== String(tokenExpiry));

    if (needsRefresh) {
      const cookies = buildVerificationSetCookieHeaders({
        token: existingToken,
        creatorHash: config.creatorHash,
        ticketId: request.cookies[names.ticket],
        tokenExpiry,
        cookieMaxAge,
        cookiePrefix,
        secure,
      });
      return { action: 'next', setCookies: cookies, reason: 'token_valid_refreshed' };
    }

    return { action: 'next', setCookies: [], reason: 'token_valid' };
  }

  options.onVerificationFailed?.('no_verification');
  return redirectResponse(request, config, 'no_verification', cookiePrefix);
}

function redirectResponse(
  request: NormalizedRequest,
  config: ShowAdConfig,
  reason: string,
  cookiePrefix?: string
): ProtectResult {
  const redirectUrl = buildVideoAdRedirectUrl({
    videoAdUrl: config.videoAdUrl,
    creatorHash: config.creatorHash,
    returnUrl: request.url,
  });
  return {
    action: 'redirect',
    redirectUrl,
    setCookies: buildClearSetCookieHeaders(cookiePrefix),
    reason,
  };
}

function toAbsolute(target: string, baseUrl: string): string {
  try {
    return new URL(target, baseUrl).toString();
  } catch {
    return target;
  }
}

export type { AccessPolicyDecision };
export { resolveVideoAdUrl };
