import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [MyModule],
  showad: {
    creatorHash: 'creator_test',
    apiKey: 'apikey_test',
    redirectSecret: 'redirect_test',
    apiBaseUrl: 'http://stub.invalid',
    videoAdUrl: 'http://video.invalid',
    cookieMaxAge: 3600,
    protectedPaths: ['/premium/*'],
    excludePaths: ['/premium/public'],
    accessPolicy: {
      allowCidrs: ['203.0.113.0/24'],
      trustedIpHeaders: ['cf-connecting-ip'],
    },
    debug: false,
  },
  compatibilityDate: '2024-08-01',
  nitro: {
    plugins: [],
  },
})
