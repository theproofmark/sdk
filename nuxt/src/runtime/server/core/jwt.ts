import type { ShowAdJWTClaims } from '../../../types'

const ISSUER = 'showad-backend'

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
    const json = base64UrlDecode(parts[1])
    return JSON.parse(json) as ShowAdJWTClaims
  }
  catch {
    return null
  }
}

export function isTokenExpired(token: string): boolean {
  const claims = decodeToken(token)
  if (!claims) return true

  const now = Math.floor(Date.now() / 1000)
  if (typeof claims.exp === 'number' && claims.exp < now) {
    return true
  }
  if (typeof claims.nbf === 'number' && claims.nbf > now) {
    return true
  }
  return false
}

export function getTokenExpiry(token: string): number | null {
  const claims = decodeToken(token)
  if (!claims || typeof claims.exp !== 'number') return null
  return claims.exp * 1000
}

export function validateTokenClaims(
  token: string,
  expectedCreatorHash: string,
  expectedFingerprint?: string,
): { valid: boolean, reason?: string } {
  const claims = decodeToken(token)
  if (!claims) {
    return { valid: false, reason: 'Invalid token format' }
  }
  if (isTokenExpired(token)) {
    return { valid: false, reason: 'Token expired' }
  }
  if (claims.creator_hash !== expectedCreatorHash) {
    return { valid: false, reason: 'Creator hash mismatch' }
  }
  if (expectedFingerprint && claims.fingerprint && claims.fingerprint !== expectedFingerprint) {
    return { valid: false, reason: 'Fingerprint mismatch' }
  }
  if (claims.iss && claims.iss !== ISSUER) {
    return { valid: false, reason: 'Invalid issuer' }
  }
  return { valid: true }
}
