import { defineConfig, devices } from '@playwright/test';

// Mocked-network route smoke for SAT Practice. Port 5104 is reserved for this app's tests.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5104',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5104 --strictPort',
    url: 'http://127.0.0.1:5104',
    reuseExistingServer: process.env.PW_REUSE_SERVER === '1',
    timeout: 90_000,
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'sat-practice-route-smoke-anon-key',
      VITE_PLATFORM_URL: 'http://127.0.0.1:5104',
      VITE_AUTH_COOKIE_DOMAIN: '',
      VITE_AUTH_SHARED_COOKIE: 'false',
      VITE_DISABLE_PAYWALL: 'false',
    },
  },
});
