import type { ShowAdJWTClaims } from '../../../types'

export const ISSUER = 'showad-backend'
export const ALLOWED_ALGORITHMS = new Set([
  'HS256', 'HS384', 'HS512',
  'RS256', 'RS384', 'RS512',
  'ES256', 'ES384',
])

export interface ClaimValidationOptions {
  leewaySeconds?: number
  requireIssuer?: boolean
}

function base64UrlDecode(input: string): string {
  const pad = input.length % 4
  const padded = pad === 0 ? input : input + '='.repeat(4 - pad)
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(base64, 'base64').toString('utf8')
}

export function decodeToken(token: string): ShowAdJWTClaims | null {
  if (!token || typeof token !== 'string') {
    return null
  }
  const parts = token.split('.')
  if (parts.length !== 3) {
    return null
  }
  try {
    const header = JSON.parse(base64UrlDecode(parts[0])) as { alg?: string }
    if (!header || typeof header.alg !== 'string' || !ALLOWED_ALGORITHMS.has(header.alg)) {
      return null
    }
  }
  catch {
    return null
  }

  try {
    const json = base64UrlDecode(parts[1])
    return JSON.parse(json) as ShowAdJWTClaims
  }
  catch {
    return null
  }
}

export function isTokenExpired(token: string, leewaySeconds = 60): boolean {
  const claims = decodeToken(token)
  if (!claims) return true

  const now = Math.floor(Date.now() / 1000)
  if (typeof claims.exp === 'number' && claims.exp + leewaySeconds < now) {
    return true
  }
  if (typeof claims.nbf === 'number' && claims.nbf - leewaySeconds > now) {
    return true
  }
  if (typeof claims.iat === 'number' && claims.iat - leewaySeconds > now) {
    return true
  }
  return false
}

/** Returns the token expiry as a Unix-seconds value, or null. */
export function getTokenExpiry(token: string): number | null {
  const claims = decodeToken(token)
  if (!claims || typeof claims.exp !== 'number') return null
  return claims.exp
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export function validateTokenClaims(
  token: string,
  expectedCreatorHash: string,
  expectedFingerprint?: string,
  options: ClaimValidationOptions = {},
): { valid: boolean, reason?: string } {
  const { leewaySeconds = 60, requireIssuer = true } = options
  const claims = decodeToken(token)
  if (!claims) {
    return { valid: false, reason: 'Invalid token format' }
  }
  if (isTokenExpired(token, leewaySeconds)) {
    return { valid: false, reason: 'Token expired' }
  }
  if (!claims.creator_hash || !safeEqual(claims.creator_hash, expectedCreatorHash)) {
    return { valid: false, reason: 'Creator hash mismatch' }
  }
  if (expectedFingerprint) {
    if (!claims.fingerprint || !safeEqual(claims.fingerprint, expectedFingerprint)) {
      return { valid: false, reason: 'Fingerprint mismatch' }
    }
  }
  if (requireIssuer) {
    if (!claims.iss || claims.iss !== ISSUER) {
      return { valid: false, reason: 'Invalid issuer' }
    }
  }
  else if (claims.iss && claims.iss !== ISSUER) {
    return { valid: false, reason: 'Invalid issuer' }
  }
  return { valid: true }
}
