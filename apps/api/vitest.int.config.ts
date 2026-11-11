import { defineConfig } from 'vitest/config';

// Integration tests need `supabase start` and a filled-in .env at the repo root.
process.loadEnvFile('../../.env');

export default defineConfig({
  test: { include: ['src/**/*.int.test.ts'], fileParallelism: false, testTimeout: 20_000 },
});
