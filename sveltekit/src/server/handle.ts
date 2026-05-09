/**
 * SvelteKit `handle` hook factory.
 *
 * The protocol matches every other ShowAd content-gating SDK:
 *
 *   1. Skip if path is excluded or not in `protectedPaths`.
 *   2. Run access policy (verified crawler / CIDR allowlist / beforeProtect).
 *   3. If `?redirect_ticket=<id>` is present, claim it, set verification
 *      cookies, and 302 to the cleaned URL.
 *   4. If a `showad_token` cookie exists, validate claims; allow on success.
 *   5. Otherwise redirect to the video ad.
 *
 * Cookies are written as Set-Cookie headers on the final Response so the
 * helper works whether a publisher returns from `resolve(event)` or a
 * synthesized redirect.
 */

import type {
  RequestEventLike,
  ResolveLike,
  ShowAdConfig,
  ShowAdHandle,
  ShowAdHandleOptions,
  VerificationFailureReason,
} from '../types';
import {
  appendSetCookieHeaders,
  buildClearSetCookieHeaders,
  buildVerificationSetCookieHeaders,
  getCookieNames,
  parseCookieHeader,
} from '../core/cookies';
import {
  getTokenExpiry,
  isTokenExpired,
  validateTokenClaims,
} from '../core/jwt';
import { isPathExcluded, isPathProtected } from '../core/path-match';
import {
  buildVideoAdRedirectUrl,
  removeQueryParam,
  resolveVideoAdUrl,
} from '../core/url';
import { claimRedirectTicket, validateToken } from '../core/api';
import { evaluateAccessPolicy } from '../core/access-policy';

const DEFAULT_COOKIE_MAX_AGE = 3600;

/**
 * Create a SvelteKit `Handle` that gates protected paths behind a video ad.
 *
 * @example
 * ```ts
 * // src/hooks.server.ts
 * import { createShowAdHandle } from '@showad/sveltekit/server';
 *
 * export const handle = createShowAdHandle(
 *   {
 *     creatorHash: process.env.SHOWAD_CREATOR_HASH!,
 *     apiKey: process.env.SHOWAD_API_KEY!,
 *     redirectSecret: process.env.SHOWAD_REDIRECT_SECRET!,
 *   },
 *   { protectedPaths: ['/premium/*'] }
 * );
 * ```
 */
export function createShowAdHandle(
  config: ShowAdConfig,
  options: ShowAdHandleOptions = {}
): ShowAdHandle {
  const cookieMaxAge = config.cookieMaxAge ?? DEFAULT_COOKIE_MAX_AGE;
  const videoAdUrl = resolveVideoAdUrl(config.videoAdUrl);
  const cookiePrefix = config.cookiePrefix;
  const cookieNames = getCookieNames(cookiePrefix);

  const debugLog = (...args: unknown[]): void => {
    if (config.debug) {
      // eslint-disable-next-line no-console
      console.log('[ShowAd SvelteKit]', ...args);
    }
  };

  return async ({ event, resolve }): Promise<Response> => {
    const pathname = event.url.pathname;

    if (isPathExcluded(pathname, options.excludePaths)) {
      return resolve(event);
    }

    if (!isPathProtected(pathname, options.protectedPaths)) {
      return resolve(event);
    }

    debugLog('Protected path:', pathname);

    if (options.accessPolicy) {
      const decision = await evaluateAccessPolicy(event, options.accessPolicy);
      if (decision.action === 'allow') {
        debugLog('Access policy allow:', decision.reason);
        return resolve(event);
      }
      if (decision.action === 'redirect') {
        debugLog('Access policy redirect:', decision.reason);
        const target = decision.redirectUrl
          ? new URL(decision.redirectUrl, event.url).toString()
          : new URL(`/c/${config.creatorHash}`, videoAdUrl).toString();
        return buildRedirect(target);
      }
    }

    const cookies = readCookies(event, cookieNames);
    const fingerprint = cookies[cookieNames.fingerprint] || null;
    const existingToken = cookies[cookieNames.token] || null;
    const existingVerified = cookies[cookieNames.verified] || null;
    const storedCreatorHash = cookies[cookieNames.creator] || null;
    const existingExpires = cookies[cookieNames.expires] || null;
    const existingTicket = cookies[cookieNames.ticket] || null;

    const redirectTicket = event.url.searchParams.get('redirect_ticket');
    const isSecure = computeSecure(config, event);

    if (redirectTicket) {
      debugLog('Redirect ticket present:', redirectTicket);

      if (!fingerprint) {
        debugLog('Missing fingerprint cookie');
        notifyFailure(options, 'no_fingerprint');
        return videoAdRedirect(config, event);
      }

      try {
        const claim = await claimRedirectTicket(config, redirectTicket);
        if (claim.creator_hash !== config.creatorHash) {
          debugLog('Creator mismatch on claim');
          notifyFailure(options, 'creator_mismatch');
          return videoAdRedirect(config, event);
        }

        const cleanUrl = removeQueryParam(event.url.toString(), 'redirect_ticket');
        const response = buildRedirect(cleanUrl);

        const setCookies = buildVerificationSetCookieHeaders({
          token: claim.token,
          creatorHash: claim.creator_hash,
          ticketId: claim.ticket_id,
          tokenExpiry: getTokenExpiry(claim.token),
          cookieMaxAge,
          cookiePrefix,
          secure: isSecure,
        });
        appendSetCookieHeaders(response.headers, setCookies);
        return response;
      } catch (err) {
        debugLog('Ticket claim failed:', (err as Error).message);
        notifyFailure(options, 'ticket_claim_failed');
        return videoAdRedirect(config, event);
      }
    }

    if (existingToken) {
      if (isTokenExpired(existingToken)) {
        debugLog('Token expired');
        notifyFailure(options, 'expired_token');
        return videoAdRedirect(config, event);
      }

      const validation = validateTokenClaims(existingToken, config.creatorHash, fingerprint);
      if (!validation.valid) {
        debugLog('Token invalid:', validation.reason);
        notifyFailure(options, 'invalid_token');
        return videoAdRedirect(config, event);
      }

      try {
        await validateToken(config, existingToken);
      } catch (err) {
        debugLog('Backend token validation failed:', (err as Error).message);
        notifyFailure(options, 'invalid_token');
        return videoAdRedirect(config, event);
      }

      const tokenExpiry = getTokenExpiry(existingToken);
      const needsRefresh =
        existingVerified !== '1' ||
        storedCreatorHash !== config.creatorHash ||
        (tokenExpiry !== null && existingExpires !== String(tokenExpiry));

      const response = await resolve(event);
      if (needsRefresh) {
        const setCookies = buildVerificationSetCookieHeaders({
          token: existingToken,
          creatorHash: config.creatorHash,
          ticketId: existingTicket || undefined,
          tokenExpiry,
          cookieMaxAge,
          cookiePrefix,
          secure: isSecure,
        });
        appendSetCookieHeaders(response.headers, setCookies);
      }
      return response;
    }

    debugLog('No verification - redirecting to video ad');
    notifyFailure(options, 'no_verification');
    return videoAdRedirect(config, event);
  };
}

function videoAdRedirect(config: ShowAdConfig, event: RequestEventLike): Response {
  const target = buildVideoAdRedirectUrl({
    videoAdUrl: config.videoAdUrl,
    creatorHash: config.creatorHash,
    returnUrl: event.url.toString(),
  });
  const response = buildRedirect(target);
  appendSetCookieHeaders(response.headers, buildClearSetCookieHeaders(config.cookiePrefix));
  return response;
}

function buildRedirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location },
  });
}

function notifyFailure(
  options: ShowAdHandleOptions,
  reason: VerificationFailureReason
): void {
  if (typeof options.onVerificationFailed === 'function') {
    try {
      options.onVerificationFailed(reason);
    } catch {
      /* swallow callback errors */
    }
  }
}

function readCookies(
  event: RequestEventLike,
  names: ReturnType<typeof getCookieNames>
): Record<string, string> {
  if (event.cookies && typeof event.cookies.get === 'function') {
    const out: Record<string, string> = {};
    for (const name of Object.values(names)) {
      const value = event.cookies.get(name);
      if (value !== undefined && value !== null) out[name] = value;
    }
    return out;
  }
  return parseCookieHeader(event.request.headers.get('cookie'));
}

function computeSecure(config: ShowAdConfig, event: RequestEventLike): boolean {
  if (typeof config.secure === 'boolean') return config.secure;
  return event.url.protocol === 'https:';
}

export type { ShowAdHandle };

/** @internal - exported for tests. */
export const __internal = {
  buildRedirect,
  readCookies,
};
