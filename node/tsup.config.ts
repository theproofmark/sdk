import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    express: 'src/express/index.ts',
    fastify: 'src/fastify/index.ts',
    nestjs: 'src/nestjs/index.ts',
    'access-policy': 'src/core/access-policy.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    'express',
    'fastify',
    '@nestjs/common',
    '@nestjs/core',
    'rxjs',
  ],
  treeshake: true,
  minify: false,
  target: 'node18',
});
