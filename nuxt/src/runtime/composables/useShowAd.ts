// @ts-expect-error - Nuxt aliases resolved at runtime
import { useRequestHeaders, useState, useRuntimeConfig } from '#imports'

import type { VerificationState } from '../../types'

const COOKIE_PREFIX = 'showad'

function parseCookieHeader(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {}
  if (!header) return result
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (!name) continue
    result[name] = decodeURIComponent(rest.join('='))
  }
  return result
}

function readClientCookies(): Record<string, string> {
  if (typeof document === 'undefined') return {}
  return parseCookieHeader(document.cookie)
}

/**
 * Read ShowAd verification status. Server-side reads request cookies; on the
 * client reads `document.cookie`. The `showad_token` cookie is HttpOnly so it
 * is intentionally not exposed here.
 */
export function useShowAd() {
  const state = useState<VerificationState>('showad:state', () => ({
    isVerified: false,
    creatorHash: null,
    expiresAt: null,
  }))

  const refresh = () => {
    let cookies: Record<string, string> = {}

    if (typeof document === 'undefined') {
      const headers = useRequestHeaders(['cookie']) as Record<string, string>
      cookies = parseCookieHeader(headers.cookie)
    }
    else {
      cookies = readClientCookies()
    }

    const verified = cookies[`${COOKIE_PREFIX}_verified`] === '1'
    const creator = cookies[`${COOKIE_PREFIX}_creator`] || null
    const expiresRaw = cookies[`${COOKIE_PREFIX}_expires`]
    const expires = expiresRaw ? Number(expiresRaw) : null

    state.value = {
      isVerified: verified,
      creatorHash: creator,
      expiresAt: Number.isFinite(expires) ? expires : null,
    }

    return state.value
  }

  refresh()

  const config = (useRuntimeConfig() as { public?: { showad?: { creatorHash?: string } } }).public?.showad

  return {
    state,
    refresh,
    creatorHash: config?.creatorHash || null,
  }
}
