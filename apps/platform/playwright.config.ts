import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PW_PORT ?? 4178);
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
    timeout: 60_000,
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'platform-route-smoke-anon-key',
      VITE_PLATFORM_URL: baseURL,
      VITE_ACADEMY_URL: 'https://academy.schood.online',
      VITE_ALLOWED_RETURN_HOSTS: `${new URL(baseURL).host},schood.online,academy.schood.online`,
      // The fixture runs on loopback; inherited production cookie domains
      // would discard SDK session writes during real account-switch tests.
      VITE_AUTH_COOKIE_DOMAIN: '',
      VITE_AUTH_SHARED_COOKIE: 'false',
    },
  },
});
