import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    middleware: 'src/middleware/index.ts',
    client: 'src/client/index.ts',
    server: 'src/server/index.ts',
    'access-policy': 'src/server/access-policy.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', 'next'],
  treeshake: true,
  minify: false,
});

