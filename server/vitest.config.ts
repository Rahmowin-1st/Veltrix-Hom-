import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Services validate their config at import time. Tests never call a real
    // provider — the fake adapter stands in — but importing a service must not
    // crash on a missing key, so supply inert placeholders.
    env: {
      GEMINI_API_KEY: 'test-key-not-used',
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_ANON_KEY: 'test-anon',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
    },
    // Booting a real PostgreSQL engine and applying the whole migration chain
    // takes ~15s, so the default 10s hook timeout is far too tight.
    hookTimeout: 120_000,
    testTimeout: 60_000,
    // Each file gets its own database; running them in one process keeps the
    // WASM engine from being instantiated many times over in parallel.
    fileParallelism: false,
  },
})
