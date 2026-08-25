import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: {
      GEMINI_API_KEY: 'test-key-not-used',
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_ANON_KEY: 'test-anon',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
      APP_HMAC_SECRET: 'test-only-hmac-secret-0123456789abcdef0123456789abcdef',
      APP_ENV: 'test',
      GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
    },
    hookTimeout: 120_000,
    testTimeout: 60_000,
    fileParallelism: false,
  },
})
