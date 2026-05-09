/**
 * Loader-level helpers.
 *
 * Use these inside `+page.server.ts` / `+layout.server.ts` / `+server.ts`
 * loaders or actions to inspect verification without going through the
 * `handle` hook (e.g. on routes you opted out of `protectedPaths`).
 */

import type {
  RequestEventLike,
  ShowAdConfig,
  VerificationResult,
} from '../types';
import { getCookieNames, parseCookieHeader } from '../core/cookies';
import { isTokenExpired, validateTokenClaims } from '../core/jwt';
import { buildVideoAdRedirectUrl } from '../core/url';
import { validateToken } from '../core/api';

/**
 * Inspect the verification state of a request.
 * Pure: never throws, never mutates state.
 */
export async function inspectShowAdVerification(
  event: RequestEventLike,
  config: ShowAdConfig
): Promise<VerificationResult> {
  const names = getCookieNames(config.cookiePrefix);
  const cookies = readCookies(event, names);
  const token = cookies[names.token] || null;
  const fingerprint = cookies[names.fingerprint] || null;

  if (!token) {
    return { verified: false, reason: 'no_token' };
  }
  if (isTokenExpired(token)) {
    return { verified: false, reason: 'expired_token' };
  }

  const validation = validateTokenClaims(token, config.creatorHash, fingerprint);
  if (!validation.valid) {
    const reason =
      validation.reason === 'creator_mismatch'
        ? 'creator_mismatch'
        : validation.reason === 'fingerprint_mismatch'
          ? 'fingerprint_mismatch'
          : 'invalid_token';
    return { verified: false, reason };
  }

  try {
    await validateToken(config, token);
  } catch {
    return { verified: false, reason: 'invalid_token' };
  }

  return {
    verified: true,
    reason: 'valid_token',
    token,
    creatorHash: config.creatorHash,
  };
}

/**
 * Boolean shortcut for use inside a loader: returns true if the request has
 * a valid verification cookie matching the configured creator.
 */
export function hasShowAdVerification(
  event: RequestEventLike,
  config: ShowAdConfig
): Promise<boolean> {
  return inspectShowAdVerification(event, config).then((result) => result.verified);
}

/**
 * `requireShowAdVerification` - throws a `ShowAdRedirect` (carrying the URL
 * the publisher should send the user to) if the request is not verified.
 * Designed to be used in a `+page.server.ts` loader:
 *
 * ```ts
 * import { redirect } from '@sveltejs/kit';
 * import { requireShowAdVerification } from '@showad/sveltekit/server';
 *
 * export const load = async (event) => {
 *   try {
 *     requireShowAdVerification(event, config);
 *   } catch (err) {
 *     if (err instanceof ShowAdRedirect) {
 *       throw redirect(302, err.location);
 *     }
 *     throw err;
 *   }
 * };
 * ```
 *
 * Returns the verification result on success.
 */
export function requireShowAdVerification(
  event: RequestEventLike,
  config: ShowAdConfig
): Promise<VerificationResult> {
  return inspectShowAdVerification(event, config).then((result) => {
    if (!result.verified) {
      throw new ShowAdRedirect(
        buildVideoAdRedirectUrl({
          videoAdUrl: config.videoAdUrl,
          creatorHash: config.creatorHash,
          returnUrl: event.url.toString(),
        }),
        result.reason
      );
    }
    return result;
  });
}

/**
 * Thrown by `requireShowAdVerification` when the visitor must be redirected.
 * The publisher catches it and forwards via SvelteKit's `redirect(302, location)`.
 */
export class ShowAdRedirect extends Error {
  readonly status = 302 as const;
  readonly location: string;
  readonly reason?: string;

  constructor(location: string, reason?: string) {
    super(`ShowAd verification required: ${reason || 'no_token'}`);
    this.name = 'ShowAdRedirect';
    this.location = location;
    this.reason = reason;
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
