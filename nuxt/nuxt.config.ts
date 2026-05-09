export default defineNuxtConfig({
  modules: ['./src/module'],
  showad: {
    creatorHash: 'dev_creator_hash',
    apiKey: 'dev_api_key',
    redirectSecret: 'dev_redirect_secret',
    protectedPaths: ['/premium/*'],
    debug: true,
  },
  compatibilityDate: '2024-08-01',
})
