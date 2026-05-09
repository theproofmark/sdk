/**
 * Pure JWT decoder + claim validator.
 *
 * The backend is the only authority on token signatures. The SDK only inspects
 * claims to short-circuit the network round-trip when a token is obviously bad.
 */

import type { ShowAdJWTClaims } from '../types';

const EXPECTED_ISSUER = 'showad-backend';

/**
 * Decode the payload of a JWT without verifying its signature.
 * Returns `null` on malformed input.
 */
export function decodeToken(token: string): ShowAdJWTClaims | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const json = base64UrlDecode(parts[1]);
    const claims = JSON.parse(json);
    if (!claims || typeof claims !== 'object') return null;
    return claims as ShowAdJWTClaims;
  } catch {
    return null;
  }
}

/** Returns true if the token is missing/expired/not-yet-valid. */
export function isTokenExpired(token: string): boolean {
  const claims = decodeToken(token);
  if (!claims) return true;

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp && claims.exp < now) return true;
  if (claims.nbf && claims.nbf > now) return true;
  return false;
}

/** Returns the token expiry as a unix-seconds value, or null. */
export function getTokenExpiry(token: string): number | null {
  const claims = decodeToken(token);
  return claims?.exp ?? null;
}

/**
 * Validate token claims against the expected creator (and optional fingerprint).
 *
 * This does NOT verify the JWT signature. The backend is responsible for that.
 */
export function validateTokenClaims(
  token: string,
  expectedCreatorHash: string,
  expectedFingerprint?: string | null
): { valid: boolean; reason?: string } {
  const claims = decodeToken(token);
  if (!claims) return { valid: false, reason: 'invalid_format' };

  if (isTokenExpired(token)) {
    return { valid: false, reason: 'expired' };
  }

  if (!claims.creator_hash || claims.creator_hash !== expectedCreatorHash) {
    return { valid: false, reason: 'creator_mismatch' };
  }

  if (expectedFingerprint && claims.fingerprint && claims.fingerprint !== expectedFingerprint) {
    return { valid: false, reason: 'fingerprint_mismatch' };
  }

  if (claims.iss && claims.iss !== EXPECTED_ISSUER) {
    return { valid: false, reason: 'invalid_issuer' };
  }

  return { valid: true };
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padLength);
  return Buffer.from(base64, 'base64').toString('utf8');
}
