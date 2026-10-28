import { defineConfig, devices } from '@playwright/test';

// Mocked-network route tests: no Supabase, no platform, no real learner data.
const port = Number(process.env.PLAYBOOK_TEST_PORT ?? 5117);

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure', ...devices['Desktop Chrome'] },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: process.env.PW_REUSE_SERVER === '1',
    timeout: 90_000,
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'toefl-playbook-route-anon-key',
      VITE_PLATFORM_URL: `http://127.0.0.1:${port}/__platform`,
      VITE_DISABLE_PAYWALL: 'false',
    },
  },
});
