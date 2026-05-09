/**
 * JWT helpers for ProofMark ShowAd. Mirrors @showad/nextjs-sdk/utils/jwt
 * but uses base64url decode + JSON only — no jose dependency. Verification
 * is claim-only; signature verification happens server-side via the backend
 * /api/sdk/validate endpoint.
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

export function decodeToken(token: string): ShowAdJWTClaims | null {
  if (typeof token !== 'string' || !token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    const payload = base64UrlDecode(parts[1]);
    const claims = JSON.parse(payload) as ShowAdJWTClaims;
    if (!claims || typeof claims !== 'object') return null;
    return claims;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const claims = decodeToken(token);
  if (!claims) return true;
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === 'number' && claims.exp < now) return true;
  if (typeof claims.nbf === 'number' && claims.nbf > now) return true;
  return false;
}

export function getTokenExpiry(token: string): number | null {
  const claims = decodeToken(token);
  if (!claims || typeof claims.exp !== 'number') return null;
  return claims.exp * 1000;
}

export function getTimeUntilExpiry(token: string): number {
  const expiry = getTokenExpiry(token);
  if (expiry === null) return -1;
  return Math.floor((expiry - Date.now()) / 1000);
}

export interface ValidateClaimsResult {
  valid: boolean;
  reason?: string;
  claims?: ShowAdJWTClaims | null;
}

export function validateTokenClaims(
  token: string,
  expectedCreatorHash: string,
  expectedFingerprint?: string
): ValidateClaimsResult {
  const claims = decodeToken(token);
  if (!claims) return { valid: false, reason: 'Invalid token format', claims: null };
  if (!claims.creator_hash || !claims.session_hash) {
    return { valid: false, reason: 'Missing required claims', claims };
  }
  if (isTokenExpired(token)) return { valid: false, reason: 'Token expired', claims };
  if (claims.creator_hash !== expectedCreatorHash) {
    return { valid: false, reason: 'Creator hash mismatch', claims };
  }
  if (expectedFingerprint && claims.fingerprint !== expectedFingerprint) {
    return { valid: false, reason: 'Fingerprint mismatch', claims };
  }
  if (claims.iss && claims.iss !== 'showad-backend') {
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
  const padding = padded.length % 4 === 0 ? 0 : 4 - (padded.length % 4);
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
