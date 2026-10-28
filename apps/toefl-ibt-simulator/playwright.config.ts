import { defineConfig, devices } from '@playwright/test';

// Mocked-network route tests for the TOEFL iBT 2026 screens. Every Supabase call
// is answered from fixtures and media playback / speech recognition are stubbed,
// so the suite runs without a backend. Port 5110 is reserved for this app.
const PORT = 5110;

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts$/,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
    viewport: { width: 375, height: 812 },
    locale: 'en-GB',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: process.env.PW_REUSE_SERVER === '1',
    timeout: 90_000,
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'toefl-route-smoke-anon-key',
      VITE_PLATFORM_URL: '',
      VITE_DISABLE_PAYWALL: 'false',
      VITE_AUTH_COOKIE_DOMAIN: '',
      VITE_AUTH_SHARED_COOKIE: 'false',
    },
  },
});
