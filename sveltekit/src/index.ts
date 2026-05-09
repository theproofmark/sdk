/**
 * @showad/sveltekit
 *
 * Content-gating SDK for SvelteKit. Exposes a `handle` hook factory that
 * protects routes behind a video ad, plus loader-level helpers.
 *
 * @example
 * ```ts
 * // src/hooks.server.ts
 * import { createShowAdHandle } from '@showad/sveltekit/server';
 * import { env } from '$env/dynamic/private';
 *
 * export const handle = createShowAdHandle(
 *   {
 *     creatorHash: env.SHOWAD_CREATOR_HASH,
 *     apiKey: env.SHOWAD_API_KEY,
 *     redirectSecret: env.SHOWAD_REDIRECT_SECRET,
 *   },
 *   { protectedPaths: ['/premium/*'] }
 * );
 * ```
 */

export * from './types';
export * from './server';
