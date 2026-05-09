import {
  type H3Event,
  deleteCookie,
  getCookie,
  getQuery,
  getRequestHeader,
  getRequestURL,
  sendRedirect,
  setCookie,
} from 'h3'

import type { AccessPolicyOptions, ShowAdJWTClaims } from '../../types'
import { evaluateAccessPolicy } from './core/access-policy'
import { TicketClaimError, claimTicket, validateToken, type BackendConfig } from './core/api'
import {
  COOKIE_CREATOR,
  COOKIE_EXPIRES,
  COOKIE_FINGERPRINT,
  COOKIE_TICKET,
  COOKIE_TOKEN,
  COOKIE_VERIFIED,
  buildCookieOptions,
} from './core/cookies'
import { decodeToken, getTokenExpiry, isTokenExpired, validateTokenClaims } from './core/jwt'
import { isPathExcluded, isPathProtected } from './core/path-match'
import { buildVideoAdRedirectUrl, stripRedirectTicket } from './core/url'

export interface ProtectConfig {
  creatorHash: string
  apiKey: string
  redirectSecret: string
  apiBaseUrl: string
  videoAdUrl: string
  cookieMaxAge: number
  protectedPaths: string[]
  excludePaths: string[]
  accessPolicy?: AccessPolicyOptions
  debug: boolean
}

export type ProtectOutcome =
  | { kind: 'allow' }
  | { kind: 'redirect' }

function debugLog(cfg: ProtectConfig, ...args: unknown[]) {
  if (cfg.debug) {
    // eslint-disable-next-line no-console
    console.log('[ShowAd]', ...args)
  }
}

function isHttps(event: H3Event): boolean {
  const proto = getRequestHeader(event, 'x-forwarded-proto')
  if (proto) {
    return proto.split(',')[0]!.trim() === 'https'
  }
  try {
    return getRequestURL(event).protocol === 'https:'
  }
  catch {
    return false
  }
}

function buildHeadersAdapter(event: H3Event) {
  return {
    get(name: string): string | null {
      return getRequestHeader(event, name) ?? getRequestHeader(event, name.toLowerCase()) ?? null
    },
  }
}

function getRemoteAddress(event: H3Event): string | null {
  const remote = event.node?.req?.socket?.remoteAddress
  return remote ? remote.replace(/^::ffff:/, '') : null
}

function getReturnUrl(event: H3Event): string {
  try {
    return getRequestURL(event).toString()
  }
  catch {
    const path = event.path || '/'
    const host = getRequestHeader(event, 'host') || 'localhost'
    const proto = isHttps(event) ? 'https' : 'http'
    return `${proto}://${host}${path}`
  }
}

function clearVerificationCookies(event: H3Event): void {
  const opts = { path: '/' }
  deleteCookie(event, COOKIE_TOKEN, opts)
  deleteCookie(event, COOKIE_VERIFIED, opts)
  deleteCookie(event, COOKIE_CREATOR, opts)
  deleteCookie(event, COOKIE_TICKET, opts)
  deleteCookie(event, COOKIE_EXPIRES, opts)
}

function setVerificationCookies(
  event: H3Event,
  cfg: ProtectConfig,
  data: { token: string, creatorHash: string, ticketId?: string },
): void {
  const secure = isHttps(event)
  const optsPublic = buildCookieOptions(secure, cfg.cookieMaxAge, false)
  const optsHttpOnly = buildCookieOptions(secure, cfg.cookieMaxAge, true)

  setCookie(event, COOKIE_TOKEN, data.token, optsHttpOnly)
  setCookie(event, COOKIE_VERIFIED, '1', optsPublic)
  setCookie(event, COOKIE_CREATOR, data.creatorHash, optsPublic)

  if (data.ticketId) {
    setCookie(event, COOKIE_TICKET, data.ticketId, optsPublic)
  }

  const expiry = getTokenExpiry(data.token)
  if (expiry !== null) {
    setCookie(event, COOKIE_EXPIRES, String(expiry), optsPublic)
  }
}

async function redirectToVideoAd(event: H3Event, cfg: ProtectConfig): Promise<ProtectOutcome> {
  const target = buildVideoAdRedirectUrl(cfg.videoAdUrl, cfg.creatorHash, getReturnUrl(event))
  clearVerificationCookies(event)
  await sendRedirect(event, target, 302)
  return { kind: 'redirect' }
}

/**
 * Pure protect handler for an H3 event. Resolves the middleware decision.
 *
 * Order: path → access policy → ticket claim → token validate → redirect.
 */
export async function protectEvent(event: H3Event, cfg: ProtectConfig): Promise<ProtectOutcome> {
  const url = getRequestURL(event)
  const pathname = url.pathname

  if (isPathExcluded(pathname, cfg.excludePaths)) {
    return { kind: 'allow' }
  }
  if (!isPathProtected(pathname, cfg.protectedPaths)) {
    return { kind: 'allow' }
  }

  debugLog(cfg, 'protecting path', pathname)

  if (cfg.accessPolicy) {
    const decision = await evaluateAccessPolicy(
      {
        headers: buildHeadersAdapter(event),
        url,
        pathname,
        ip: getRemoteAddress(event),
      },
      cfg.accessPolicy,
    )
    if (decision.action === 'allow') {
      debugLog(cfg, 'access policy allow:', decision.reason)
      return { kind: 'allow' }
    }
    if (decision.action === 'redirect') {
      const target = decision.redirectUrl
        || buildVideoAdRedirectUrl(cfg.videoAdUrl, cfg.creatorHash, getReturnUrl(event))
      await sendRedirect(event, target, 302)
      return { kind: 'redirect' }
    }
  }

  const fingerprint = getCookie(event, COOKIE_FINGERPRINT)
  const existingToken = getCookie(event, COOKIE_TOKEN)
  const existingCreator = getCookie(event, COOKIE_CREATOR)
  const existingVerified = getCookie(event, COOKIE_VERIFIED)
  const existingExpires = getCookie(event, COOKIE_EXPIRES)

  const query = getQuery(event)
  const redirectTicket = typeof query.redirect_ticket === 'string' ? query.redirect_ticket : null

  if (redirectTicket) {
    debugLog(cfg, 'claiming ticket', redirectTicket)
    if (!fingerprint) {
      debugLog(cfg, 'missing fingerprint cookie; redirecting to video ad')
      return redirectToVideoAd(event, cfg)
    }

    const backend: BackendConfig = {
      apiBaseUrl: cfg.apiBaseUrl,
      apiKey: cfg.apiKey,
      creatorHash: cfg.creatorHash,
      redirectSecret: cfg.redirectSecret,
    }

    try {
      const claim = await claimTicket(backend, redirectTicket)
      if (claim.creator_hash !== cfg.creatorHash) {
        debugLog(cfg, 'creator hash mismatch on claim')
        return redirectToVideoAd(event, cfg)
      }
      const claims = decodeToken(claim.token)
      if (!claims || isTokenExpired(claim.token)) {
        debugLog(cfg, 'claimed token invalid/expired')
        return redirectToVideoAd(event, cfg)
      }

      setVerificationCookies(event, cfg, {
        token: claim.token,
        creatorHash: claim.creator_hash,
        ticketId: claim.ticket_id,
      })

      const cleanPath = stripRedirectTicket(url.toString())
      await sendRedirect(event, cleanPath, 302)
      return { kind: 'redirect' }
    }
    catch (err) {
      const status = err instanceof TicketClaimError ? err.status : 0
      debugLog(cfg, 'ticket claim failed', { status, err: (err as Error).message })
      return redirectToVideoAd(event, cfg)
    }
  }

  if (existingToken) {
    if (isTokenExpired(existingToken)) {
      debugLog(cfg, 'token expired')
      return redirectToVideoAd(event, cfg)
    }
    const validation = validateTokenClaims(existingToken, cfg.creatorHash, fingerprint)
    if (!validation.valid) {
      debugLog(cfg, 'token invalid:', validation.reason)
      return redirectToVideoAd(event, cfg)
    }

    const backend: BackendConfig = {
      apiBaseUrl: cfg.apiBaseUrl,
      apiKey: cfg.apiKey,
      creatorHash: cfg.creatorHash,
      redirectSecret: cfg.redirectSecret,
    }
    try {
      const backendValidation = await validateToken(backend, existingToken)
      if (!backendValidation.valid) {
        debugLog(cfg, 'backend token validation failed:', backendValidation.message)
        return redirectToVideoAd(event, cfg)
      }
    }
    catch (err) {
      debugLog(cfg, 'backend token validation failed:', (err as Error).message)
      return redirectToVideoAd(event, cfg)
    }

    const tokenExpiry = getTokenExpiry(existingToken)
    if (
      existingVerified !== '1'
      || existingCreator !== cfg.creatorHash
      || (tokenExpiry !== null && existingExpires !== String(tokenExpiry))
    ) {
      const ticketId = getCookie(event, COOKIE_TICKET)
      setVerificationCookies(event, cfg, {
        token: existingToken,
        creatorHash: cfg.creatorHash,
        ticketId,
      })
    }
    return { kind: 'allow' }
  }

  debugLog(cfg, 'no verification; redirecting to video ad')
  return redirectToVideoAd(event, cfg)
}

export type { ShowAdJWTClaims }
