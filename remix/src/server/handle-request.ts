/**
 * Wrapper for Remix `entry.server.tsx` `handleRequest` that enforces ShowAd
 * verification on every document request before Remix renders the route tree.
 *
 * Usage (Remix v2 / React Router v7):
 *
 * ```ts
 * // app/entry.server.tsx
 * import { wrapHandleRequest } from '@showad/remix/server';
 * import { renderToReadableStream } from 'react-dom/server';
 *
 * async function handleRequest(request, status, headers, ctx) {
 *   // ... your existing renderer
 * }
 *
 * export default wrapHandleRequest(handleRequest, showadConfig, {
 *   protectedPaths: ['/premium/*'],
 * });
 * ```
 *
 * Verification short-circuit responses (redirect to video ad, ticket claim,
 * cookie refresh) are returned directly without invoking the renderer.
 */

import type { ShowAdConfig, ProtectOptions } from '../types';
import { requireShowAdVerification } from './protect';

/**
 * Loose signature compatible with Remix v2 and React Router v7
 * `entry.server` `handleRequest` / `handleDocumentRequest` exports.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HandleRequestFn = (...args: any[]) => Promise<Response> | Response;

export function wrapHandleRequest<T extends HandleRequestFn>(
  handler: T,
  config: ShowAdConfig,
  options?: ProtectOptions
): T {
  const wrapped = async (...args: Parameters<T>): Promise<Response> => {
    const request = args[0] as Request;
    const guard = await requireShowAdVerification(request, config, options);

    if (guard) {
      if (guard.status === 204) {
        const cookieHeaders = guard.headers.getSetCookie?.() ?? [];
        const response = await handler(...args);
        if (!cookieHeaders.length) return response;
        const headers = new Headers(response.headers);
        for (const value of cookieHeaders) headers.append('Set-Cookie', value);
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
      return guard;
    }

    return handler(...args);
  };

  return wrapped as unknown as T;
}
