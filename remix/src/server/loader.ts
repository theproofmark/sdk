/**
 * Higher-order function helpers for Remix loaders/actions.
 *
 * Wraps a Remix loader (or action) so that ShowAd verification runs first.
 * If verification needs to short-circuit (redirect/cookie set), the wrapped
 * loader resolves with that `Response` directly. Otherwise the original
 * loader runs and any verification cookies are merged into its `Response`.
 */

import type { ShowAdConfig, ProtectOptions } from '../types';
import { requireShowAdVerification } from './protect';

/** Minimal loader/action arg shape compatible with Remix v2 / RR v7. */
export interface LoaderArgsLike {
  request: Request;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context?: any;
}

export type Loader<Args extends LoaderArgsLike = LoaderArgsLike, Result = unknown> = (
  args: Args
) => Result | Promise<Result>;

/**
 * Wrap a Remix loader or action with ShowAd verification.
 *
 * The 204 "refresh-cookies" response emitted by `requireShowAdVerification`
 * is detected and merged into the inner loader's response so the route still
 * renders normally while the SDK refreshes its UX-signal cookies.
 */
export function protectLoader<Args extends LoaderArgsLike, Result>(
  loader: Loader<Args, Result>,
  config: ShowAdConfig,
  options?: ProtectOptions
): Loader<Args, Result | Response> {
  return async (args: Args): Promise<Result | Response> => {
    const guard = await requireShowAdVerification(args.request, config, options);

    if (guard) {
      // 204 = "verified, just refresh cookies". Run the loader and propagate
      // the cookies onto whatever it returns.
      if (guard.status === 204) {
        const cookieHeaders = guard.headers.getSetCookie?.() ?? [];
        const result = await loader(args);
        return mergeSetCookies(result, cookieHeaders) as Result | Response;
      }
      return guard;
    }

    return loader(args);
  };
}

/**
 * Convenience alias. Action handlers have the same call signature so we
 * reuse `protectLoader`.
 */
export const protectAction = protectLoader;

function mergeSetCookies<T>(result: T, setCookies: string[]): T | Response {
  if (!setCookies.length) return result;

  if (result instanceof Response) {
    const headers = new Headers(result.headers);
    for (const value of setCookies) headers.append('Set-Cookie', value);
    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers,
    });
  }

  return result;
}
