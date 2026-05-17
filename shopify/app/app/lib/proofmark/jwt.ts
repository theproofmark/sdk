/**
 * JWT helpers for ProofMark ShowAd. Mirrors @showad/nextjs-sdk/utils/jwt
 * but uses base64url decode + JSON only — no jose dependency. Verification
 * is claim-only; signature verification happens server-side via the backend
 * /api/sdk/validate endpoint.
 *
 * Defense-in-depth: rejects tokens whose header `alg` is `none` or outside
 * the HS256/HS384/HS512/RS256/RS384/RS512/ES256/ES384 whitelist.
 */

export interface ShowAdJWTClaims {
  iss?: string;
  aud?: string;
  sub?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  creator_hash?: string;
  fingerprint?: string;
  session_hash?: string;
  project_hash?: string;
  resource_hash?: string;
  [key: string]: unknown;
}

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
  if (typeof token !== 'string' || !token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    const header = JSON.parse(base64UrlDecode(parts[0])) as { alg?: string };
    if (!header || typeof header.alg !== 'string' || !ALLOWED_ALGORITHMS.has(header.alg)) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const payload = base64UrlDecode(parts[1]);
    const claims = JSON.parse(payload) as ShowAdJWTClaims;
    if (!claims || typeof claims !== 'object') return null;
    return claims;
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

/** Returns the token expiry as a Unix-seconds value, or null. */
export function getTokenExpiry(token: string): number | null {
  const claims = decodeToken(token);
  if (!claims || typeof claims.exp !== 'number') return null;
  return claims.exp;
}

export function getTimeUntilExpiry(token: string): number {
  const expiry = getTokenExpiry(token);
  if (expiry === null) return -1;
  return expiry - Math.floor(Date.now() / 1000);
}

export interface ValidateClaimsResult {
  valid: boolean;
  reason?: string;
  claims?: ShowAdJWTClaims | null;
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
  expectedFingerprint?: string,
  options: ClaimValidationOptions = {}
): ValidateClaimsResult {
  const { leewaySeconds = 60, requireIssuer = true } = options;
  const claims = decodeToken(token);
  if (!claims) return { valid: false, reason: 'Invalid token format', claims: null };
  if (!claims.creator_hash || !claims.session_hash) {
    return { valid: false, reason: 'Missing required claims', claims };
  }
  if (isTokenExpired(token, leewaySeconds)) return { valid: false, reason: 'Token expired', claims };
  if (!safeEqual(claims.creator_hash, expectedCreatorHash)) {
    return { valid: false, reason: 'Creator hash mismatch', claims };
  }
  if (expectedFingerprint) {
    if (!claims.fingerprint || !safeEqual(claims.fingerprint, expectedFingerprint)) {
      return { valid: false, reason: 'Fingerprint mismatch', claims };
    }
  }
  if (requireIssuer) {
    if (!claims.iss || claims.iss !== 'showad-backend') {
      return { valid: false, reason: 'Invalid issuer', claims };
    }
  } else if (claims.iss && claims.iss !== 'showad-backend') {
    return { valid: false, reason: 'Invalid issuer', claims };
  }
  return { valid: true, claims };
}

export function getCreatorHashFromToken(token: string): string | null {
  return decodeToken(token)?.creator_hash || null;
}

export function getFingerprintFromToken(token: string): string | null {
  return decodeToken(token)?.fingerprint || null;
}

export function getSessionHashFromToken(token: string): string | null {
  return decodeToken(token)?.session_hash || null;
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (padded.length % 4)) % 4;
  const normalized = padded + '='.repeat(padding);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(normalized, 'base64').toString('utf-8');
  }
  if (typeof atob === 'function') {
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }
  throw new Error('No base64 decoder available');
}
