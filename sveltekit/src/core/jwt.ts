/**
 * Pure JWT decoder + claim validator.
 *
 * The backend is the only authority on token signatures. The SDK only inspects
 * claims to short-circuit the network round-trip when a token is obviously bad.
 *
 * Defense-in-depth: rejects tokens whose header `alg` is `none` or outside the
 * HS256/HS384/HS512/RS256/RS384/RS512/ES256/ES384 whitelist.
 */

import type { ShowAdJWTClaims } from '../types';

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

export function decodeToken(token: string): ShowAdJWTClaims | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(base64UrlDecode(parts[0])) as { alg?: string };
    if (!header || typeof header.alg !== 'string' || !ALLOWED_ALGORITHMS.has(header.alg)) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const json = base64UrlDecode(parts[1]);
    const claims = JSON.parse(json);
    if (!claims || typeof claims !== 'object') return null;
    return claims as ShowAdJWTClaims;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string, leewaySeconds = 60): boolean {
  const claims = decodeToken(token);
  if (!claims) return true;

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === 'number' && claims.exp + leewaySeconds < now) return true;
  if (typeof claims.nbf === 'number' && claims.nbf - leewaySeconds > now) return true;
  if (typeof claims.iat === 'number' && claims.iat - leewaySeconds > now) return true;
  return false;
}

export function getTokenExpiry(token: string): number | null {
  const claims = decodeToken(token);
  return claims?.exp ?? null;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function validateTokenClaims(
  token: string,
  expectedCreatorHash: string,
  expectedFingerprint?: string | null,
  options: ClaimValidationOptions = {}
): { valid: boolean; reason?: string } {
  const { leewaySeconds = 60, requireIssuer = true } = options;
  const claims = decodeToken(token);
  if (!claims) return { valid: false, reason: 'invalid_format' };

  if (isTokenExpired(token, leewaySeconds)) {
    return { valid: false, reason: 'expired' };
  }

  if (!claims.creator_hash || !safeEqual(claims.creator_hash, expectedCreatorHash)) {
    return { valid: false, reason: 'creator_mismatch' };
  }

  if (expectedFingerprint) {
    if (!claims.fingerprint || !safeEqual(claims.fingerprint, expectedFingerprint)) {
      return { valid: false, reason: 'fingerprint_mismatch' };
    }
  }

  if (requireIssuer) {
    if (!claims.iss || claims.iss !== EXPECTED_ISSUER) {
      return { valid: false, reason: 'invalid_issuer' };
    }
  } else if (claims.iss && claims.iss !== EXPECTED_ISSUER) {
    return { valid: false, reason: 'invalid_issuer' };
  }

  return { valid: true };
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padLength);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64').toString('utf8');
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Encode a base64url payload (test helper for synthesizing JWTs in tests).
 */
export function base64UrlEncode(input: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(input, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
