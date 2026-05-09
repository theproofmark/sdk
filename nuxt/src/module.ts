import { fileURLToPath } from 'node:url'
import {
  addImportsDir,
  addPlugin,
  addServerHandler,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'
import { defu } from 'defu'

import type { ShowAdModuleOptions } from './types'

export type { ShowAdModuleOptions } from './types'
export * from './types'

const DEFAULT_API = 'https://ad.proofmark.io'
const DEFAULT_VIDEO = 'https://showad.proofmark.io'
const DEFAULT_MAX_AGE = 3600

export default defineNuxtModule<ShowAdModuleOptions>({
  meta: {
    name: '@showad/nuxt',
    configKey: 'showad',
    compatibility: {
      nuxt: '>=3.0.0',
    },
  },
  defaults: {
    apiBaseUrl: DEFAULT_API,
    videoAdUrl: DEFAULT_VIDEO,
    cookieMaxAge: DEFAULT_MAX_AGE,
    protectedPaths: [],
    excludePaths: [],
    debug: false,
    enabled: true,
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const runtimeDir = fileURLToPath(new URL('./runtime', import.meta.url))

    nuxt.options.build.transpile.push(runtimeDir)

    nuxt.options.runtimeConfig.public = nuxt.options.runtimeConfig.public || {}
    nuxt.options.runtimeConfig.public.showad = defu(
      (nuxt.options.runtimeConfig.public as Record<string, unknown>).showad as object,
      {
        creatorHash: options.creatorHash || '',
        apiBaseUrl: options.apiBaseUrl || DEFAULT_API,
        videoAdUrl: options.videoAdUrl || DEFAULT_VIDEO,
        cookieMaxAge: options.cookieMaxAge ?? DEFAULT_MAX_AGE,
      },
    )

    nuxt.options.runtimeConfig.showad = defu(
      (nuxt.options.runtimeConfig as Record<string, unknown>).showad as object,
      {
        apiKey: options.apiKey || '',
        redirectSecret: options.redirectSecret || '',
        protectedPaths: options.protectedPaths || [],
        excludePaths: options.excludePaths || [],
        accessPolicy: options.accessPolicy || undefined,
        debug: !!options.debug,
        enabled: options.enabled !== false,
      },
    )

    if (options.enabled !== false) {
      addServerHandler({
        middleware: true,
        handler: resolver.resolve('./runtime/server/middleware/showad'),
      })
    }

    addImportsDir(resolver.resolve('./runtime/composables'))

    addPlugin({
      src: resolver.resolve('./runtime/plugin.client'),
      mode: 'client',
    })
  },
})
