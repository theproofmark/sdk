/**
 * JWT validation utilities for ShowAd SDK
 * Uses jose library for payload decoding; header alg is whitelisted locally
 * as a defense-in-depth check (signature verification is the backend's job).
 */

import * as jose from 'jose';
import type { ShowAdJWTClaims, ShowAdClientConfig } from '../types';
import { ShowAdError, ShowAdErrorCode } from '../types';

export const EXPECTED_ISSUER = 'showad-backend';
export const ALLOWED_ALGORITHMS = new Set([
  'HS256', 'HS384', 'HS512',
  'RS256', 'RS384', 'RS512',
  'ES256', 'ES384',
]);

export interface ClaimValidationOptions {
  leewaySeconds?: number;
  requireIssuer?: boolean;
}

/**
 * Decode a JWT token without verifying the signature, and reject tokens whose
 * header `alg` is `none` or outside the whitelist.
 * WARNING: This does NOT verify the token signature. Use only for display purposes.
 */
export function decodeToken(token: string): ShowAdJWTClaims | null {
  try {
    const header = jose.decodeProtectedHeader(token) as { alg?: string };
    if (!header || typeof header.alg !== 'string' || !ALLOWED_ALGORITHMS.has(header.alg)) {
      return null;
    }
    const decoded = jose.decodeJwt(token);
    return decoded as unknown as ShowAdJWTClaims;
  } catch {
    return null;
  }
}

/**
 * Check if a token is expired based on its claims.
 */
export function isTokenExpired(token: string, leewaySeconds = 60): boolean {
  const claims = decodeToken(token);
  if (!claims) return true;

  const now = Math.floor(Date.now() / 1000);

  if (typeof claims.exp === 'number' && claims.exp + leewaySeconds < now) {
    return true;
  }
  if (typeof claims.nbf === 'number' && claims.nbf - leewaySeconds > now) {
    return true;
  }
  if (typeof claims.iat === 'number' && claims.iat - leewaySeconds > now) {
    return true;
  }
  return false;
}

/**
 * Get token expiry timestamp as Unix seconds (matches JWT `exp` claim).
 */
export function getTokenExpiry(token: string): number | null {
  const claims = decodeToken(token);
  if (!claims || !claims.exp) return null;

  return claims.exp;
}

/**
 * Get time until token expires (in seconds).
 * Returns negative value if already expired.
 */
export function getTimeUntilExpiry(token: string): number {
  const expiry = getTokenExpiry(token);
  if (!expiry) return -1;

  return expiry - Math.floor(Date.now() / 1000);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Validate token claims match expected values.
 */
export function validateTokenClaims(
  token: string,
  expectedCreatorHash: string,
  expectedFingerprint?: string,
  options: ClaimValidationOptions = {}
): { valid: boolean; reason?: string } {
  const { leewaySeconds = 60, requireIssuer = true } = options;
  const claims = decodeToken(token);

  if (!claims) {
    return { valid: false, reason: 'Invalid token format' };
  }

  if (isTokenExpired(token, leewaySeconds)) {
    return { valid: false, reason: 'Token expired' };
  }

  if (!claims.creator_hash || !safeEqual(claims.creator_hash, expectedCreatorHash)) {
    return { valid: false, reason: 'Creator hash mismatch' };
  }

  if (expectedFingerprint) {
    if (!claims.fingerprint || !safeEqual(claims.fingerprint, expectedFingerprint)) {
      return { valid: false, reason: 'Fingerprint mismatch' };
    }
  }

  if (requireIssuer) {
    if (!claims.iss || claims.iss !== EXPECTED_ISSUER) {
      return { valid: false, reason: 'Invalid issuer' };
    }
  } else if (claims.iss && claims.iss !== EXPECTED_ISSUER) {
    return { valid: false, reason: 'Invalid issuer' };
  }

  return { valid: true };
}

/**
 * Extract creator hash from token
 */
export function getCreatorHashFromToken(token: string): string | null {
  const claims = decodeToken(token);
  return claims?.creator_hash || null;
}

/**
 * Extract fingerprint from token
 */
export function getFingerprintFromToken(token: string): string | null {
  const claims = decodeToken(token);
  return claims?.fingerprint || null;
}

/**
 * Extract session hash from token
 */
export function getSessionHashFromToken(token: string): string | null {
  const claims = decodeToken(token);
  return claims?.session_hash || null;
}

/**
 * Client-side token verification (claim validation only)
 * This checks the token structure and claims but does NOT verify the signature
 * Signature verification should be done server-side
 */
export function verifyTokenClient(
  config: Pick<ShowAdClientConfig, 'creatorHash'>,
  token: string,
  fingerprint?: string
): { valid: boolean; claims: ShowAdJWTClaims | null; error?: string } {
  try {
    const claims = decodeToken(token);

    if (!claims) {
      return { valid: false, claims: null, error: 'Invalid token format' };
    }

    // Check basic structure
    if (!claims.creator_hash || !claims.session_hash) {
      return { valid: false, claims: null, error: 'Missing required claims' };
    }

    // Check expiry
    if (isTokenExpired(token)) {
      return { valid: false, claims, error: 'Token expired' };
    }

    // Check creator hash matches config
    if (claims.creator_hash !== config.creatorHash) {
      return { valid: false, claims, error: 'Creator hash mismatch' };
    }

    // Check fingerprint if provided
    if (fingerprint && claims.fingerprint !== fingerprint) {
      return { valid: false, claims, error: 'Fingerprint mismatch' };
    }

    return { valid: true, claims };
  } catch (error) {
    return { 
      valid: false, 
      claims: null, 
      error: `Token verification failed: ${(error as Error).message}` 
    };
  }
}

/**
 * Create a verification result from token validation
 */
export function createVerificationResult(
  token: string,
  config: Pick<ShowAdClientConfig, 'creatorHash'>,
  fingerprint?: string
): {
  verified: boolean;
  creatorHash: string | null;
  fingerprint: string | null;
  expiresAt: number | null;
  error: string | null;
} {
  const result = verifyTokenClient(config, token, fingerprint);

  return {
    verified: result.valid,
    creatorHash: result.claims?.creator_hash || null,
    fingerprint: result.claims?.fingerprint || null,
    expiresAt: result.claims?.exp ?? null,
    error: result.error || null,
  };
}

