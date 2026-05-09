/** @type {import('@remix-run/dev').AppConfig} */
export default {
  ignoredRouteFiles: ['**/.*', '**/*.test.*'],
  serverModuleFormat: 'esm',
  serverPlatform: 'node',
  future: {
    v3_fetcherPersist: true,
    v3_relativeSplatPath: true,
    v3_throwAbortReason: true,
    v3_routeConfig: true,
  },
};
