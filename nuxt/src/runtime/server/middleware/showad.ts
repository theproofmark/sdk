import { defineEventHandler } from 'h3'
// @ts-expect-error - resolved at runtime by Nuxt; types via #imports.
import { useRuntimeConfig } from '#imports'

import type { AccessPolicyOptions } from '../../../types'
import { protectEvent, type ProtectConfig } from '../protect'

export default defineEventHandler(async (event) => {
  const runtime = useRuntimeConfig() as {
    showad?: {
      apiKey?: string
      redirectSecret?: string
      protectedPaths?: string[]
      excludePaths?: string[]
      debug?: boolean
      enabled?: boolean
      accessPolicy?: AccessPolicyOptions
      public?: {
        creatorHash?: string
        apiBaseUrl?: string
        videoAdUrl?: string
        cookieMaxAge?: number
      }
    }
    public?: {
      showad?: {
        creatorHash?: string
        apiBaseUrl?: string
        videoAdUrl?: string
        cookieMaxAge?: number
      }
    }
  }

  const priv = runtime.showad || {}
  const pub = runtime.public?.showad || {}

  if (priv.enabled === false) return

  const cfg: ProtectConfig = {
    creatorHash: pub.creatorHash || '',
    apiKey: priv.apiKey || '',
    redirectSecret: priv.redirectSecret || '',
    apiBaseUrl: pub.apiBaseUrl || 'https://ad.proofmark.io',
    videoAdUrl: pub.videoAdUrl || 'https://showad.proofmark.io',
    cookieMaxAge: pub.cookieMaxAge || 3600,
    protectedPaths: priv.protectedPaths || [],
    excludePaths: priv.excludePaths || [],
    accessPolicy: priv.accessPolicy,
    debug: !!priv.debug,
  }

  if (!cfg.creatorHash || cfg.protectedPaths.length === 0) {
    return
  }

  await protectEvent(event, cfg)
})
