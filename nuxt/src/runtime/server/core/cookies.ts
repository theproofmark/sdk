export const COOKIE_PREFIX = 'showad'
export const COOKIE_FINGERPRINT = `${COOKIE_PREFIX}_fingerprint`
export const COOKIE_TOKEN = `${COOKIE_PREFIX}_token`
export const COOKIE_CREATOR = `${COOKIE_PREFIX}_creator`
export const COOKIE_TICKET = `${COOKIE_PREFIX}_ticket`
export const COOKIE_VERIFIED = `${COOKIE_PREFIX}_verified`
export const COOKIE_EXPIRES = `${COOKIE_PREFIX}_expires`

export interface CookieOptions {
  path: string
  maxAge: number
  httpOnly?: boolean
  sameSite: 'lax' | 'strict' | 'none'
  secure: boolean
}

export function buildCookieOptions(secure: boolean, maxAge: number, httpOnly = false): CookieOptions {
  return {
    path: '/',
    maxAge,
    httpOnly,
    sameSite: 'lax',
    secure,
  }
}
