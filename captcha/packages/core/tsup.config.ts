import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2020',
    outExtension({ format }) {
      return { js: format === 'esm' ? '.mjs' : '.cjs' };
    },
  },
  {
    entry: { api: 'src/index.ts' },
    format: ['iife'],
    globalName: 'PMVerifyBundle',
    dts: false,
    sourcemap: false,
    minify: true,
    clean: false,
    target: 'es2020',
    outExtension() {
      return { js: '.js' };
    },
  },
]);
