/**
 * JWT validation utilities for ShowAd SDK
 * Uses jose library for JWT handling
 */

import * as jose from 'jose';
import type { ShowAdJWTClaims, ShowAdClientConfig } from '../types';
import { ShowAdError, ShowAdErrorCode } from '../types';

/**
 * Decode a JWT token without verification (for client-side inspection)
 * WARNING: This does NOT verify the token signature. Use only for display purposes.
 */
export function decodeToken(token: string): ShowAdJWTClaims | null {
  try {
    const decoded = jose.decodeJwt(token);
    return decoded as unknown as ShowAdJWTClaims;
  } catch {
    return null;
  }
}

/**
 * Check if a token is expired based on its claims
 */
export function isTokenExpired(token: string): boolean {
  const claims = decodeToken(token);
  if (!claims) return true;

  const now = Math.floor(Date.now() / 1000);

  // Check exp claim
  if (claims.exp && claims.exp < now) {
    return true;
  }

  // Check nbf claim (not before)
  if (claims.nbf && claims.nbf > now) {
    return true;
  }

  return false;
}

/**
 * Get token expiry timestamp in milliseconds
 */
export function getTokenExpiry(token: string): number | null {
  const claims = decodeToken(token);
  if (!claims || !claims.exp) return null;

  return claims.exp * 1000;
}

/**
 * Get time until token expires (in seconds)
 * Returns negative value if already expired
 */
export function getTimeUntilExpiry(token: string): number {
  const expiry = getTokenExpiry(token);
  if (!expiry) return -1;

  return Math.floor((expiry - Date.now()) / 1000);
}

/**
 * Validate token claims match expected values
 */
export function validateTokenClaims(
  token: string,
  expectedCreatorHash: string,
  expectedFingerprint?: string
): { valid: boolean; reason?: string } {
  const claims = decodeToken(token);

  if (!claims) {
    return { valid: false, reason: 'Invalid token format' };
  }

  // Check expiry
  if (isTokenExpired(token)) {
    return { valid: false, reason: 'Token expired' };
  }

  // Check creator hash
  if (claims.creator_hash !== expectedCreatorHash) {
    return { valid: false, reason: 'Creator hash mismatch' };
  }

  // Check fingerprint if provided
  if (expectedFingerprint && claims.fingerprint !== expectedFingerprint) {
    return { valid: false, reason: 'Fingerprint mismatch' };
  }

  // Check issuer
  if (claims.iss && claims.iss !== 'showad-backend') {
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
    expiresAt: result.claims?.exp ? result.claims.exp * 1000 : null,
    error: result.error || null,
  };
}

