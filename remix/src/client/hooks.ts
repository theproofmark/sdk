/**
 * Client-side hook for ShowAd verification state.
 *
 * Reads UX-signal cookies (`showad_verified`, `showad_creator`,
 * `showad_expires`, `showad_fingerprint`) from `document.cookie` so the UI
 * can show "verified" / "expiring soon" / "needs ad" affordances without an
 * extra round-trip. The httpOnly `showad_token` is intentionally NOT read.
 */

import { useEffect, useState } from 'react';
import { getCookieNames, parseCookieHeader } from '../core/cookies';

export interface ShowAdState {
  isVerified: boolean;
  creatorHash: string | null;
  fingerprint: string | null;
  /** Expiry as unix-seconds, mirrors the JWT `exp` claim. */
  expiresAt: number | null;
  /** Milliseconds until expiry. Negative when expired. */
  expiresInMs: number | null;
}

export interface UseShowAdStateOptions {
  cookiePrefix?: string;
  /** Polling interval to detect cookie changes (ms). Default 1000. */
  pollIntervalMs?: number;
}

const EMPTY_STATE: ShowAdState = {
  isVerified: false,
  creatorHash: null,
  fingerprint: null,
  expiresAt: null,
  expiresInMs: null,
};

function readState(cookiePrefix?: string): ShowAdState {
  if (typeof document === 'undefined') return EMPTY_STATE;
  const names = getCookieNames(cookiePrefix);
  const cookies = parseCookieHeader(document.cookie);
  const expiresStr = cookies[names.expires];
  const expiresAt = expiresStr && /^\d+$/.test(expiresStr) ? Number(expiresStr) : null;
  const expiresInMs = expiresAt !== null ? expiresAt * 1000 - Date.now() : null;

  return {
    isVerified: cookies[names.verified] === '1' && (expiresInMs === null || expiresInMs > 0),
    creatorHash: cookies[names.creator] ?? null,
    fingerprint: cookies[names.fingerprint] ?? null,
    expiresAt,
    expiresInMs,
  };
}

/**
 * React hook returning the visitor's verification state.
 * Re-reads cookies on visibility change and on a configurable poll interval.
 */
export function useShowAdState(options: UseShowAdStateOptions = {}): ShowAdState {
  const { cookiePrefix, pollIntervalMs = 1000 } = options;
  const [state, setState] = useState<ShowAdState>(() => readState(cookiePrefix));

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setState((prev) => {
        const next = readState(cookiePrefix);
        if (
          prev.isVerified === next.isVerified &&
          prev.creatorHash === next.creatorHash &&
          prev.fingerprint === next.fingerprint &&
          prev.expiresAt === next.expiresAt
        ) {
          return prev;
        }
        return next;
      });
    };

    tick();
    const interval = window.setInterval(tick, Math.max(250, pollIntervalMs));
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', tick);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', tick);
    };
  }, [cookiePrefix, pollIntervalMs]);

  return state;
}

/** Synchronous read for non-hook usage (e.g. inside event handlers). */
export function readShowAdState(cookiePrefix?: string): ShowAdState {
  return readState(cookiePrefix);
}
