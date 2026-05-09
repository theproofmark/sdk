// @ts-expect-error - Nuxt aliases resolved at runtime
import { defineNuxtPlugin } from '#imports'
import { useShowAd } from './composables/useShowAd'

export default defineNuxtPlugin(() => {
  const showad = useShowAd()
  return {
    provide: {
      showad,
    },
  }
})
