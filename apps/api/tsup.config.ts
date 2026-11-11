import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/workers/main.ts'],
  format: 'esm',
  target: 'node22',
  outDir: 'dist',
  // shared is TypeScript source, so it must be bundled
  noExternal: ['@provecheck/shared'],
});
