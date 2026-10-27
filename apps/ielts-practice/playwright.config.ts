import { defineConfig, devices } from '@playwright/test';

// Mocked-network route tests: no Supabase is needed. Port 5102 is reserved for
// IELTS Practice so parallel app suites do not collide.
const PORT = 5102;

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts$/,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
    locale: 'en-GB',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: process.env.PW_REUSE_SERVER === '1',
    timeout: 90_000,
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'ielts-practice-route-smoke-anon-key',
      VITE_PLATFORM_URL: '',
      VITE_DISABLE_PAYWALL: 'false',
    },
  },
});
