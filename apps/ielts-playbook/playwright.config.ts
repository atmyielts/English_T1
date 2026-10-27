import { defineConfig, devices } from '@playwright/test';

// Mocked-network route tests. Port 5103 is reserved for this app's tests.
const port = Number(process.env.PW_PORT ?? 5103);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: process.env.PW_REUSE_SERVER === '1',
    timeout: 90_000,
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'ielts-playbook-route-smoke-anon-key',
      VITE_PLATFORM_URL: 'https://schood.online',
      VITE_IELTS_PRACTICE_URL: 'https://practice.ielts.schood.online',
      VITE_IELTS_SIMULATOR_URL: 'https://ielts.schood.online',
      VITE_AUTH_COOKIE_DOMAIN: '',
      VITE_AUTH_SHARED_COOKIE: 'false',
    },
  },
});
