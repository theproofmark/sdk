import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    server: 'src/server/index.ts',
    client: 'src/client/index.ts',
    'access-policy': 'src/core/access-policy.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['@remix-run/node', '@remix-run/server-runtime', 'react', 'react-dom'],
  treeshake: true,
  minify: false,
});
