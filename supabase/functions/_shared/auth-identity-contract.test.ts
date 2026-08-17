import { assert, assertMatch } from 'jsr:@std/assert@1';

const read = (path: string) => Deno.readTextFile(new URL(path, import.meta.url));

Deno.test('Telegram auth blocks direct user creation and requires verified email linking', async () => {
  const migration = await read('../../migrations/20260817120000_auth_identity_safety.sql');
  assertMatch(migration, /provider\s*=\s*'custom:telegram'/);
  assertMatch(migration, /telegram_requires_verified_email/);
  assertMatch(migration, /grant execute.+supabase_auth_admin/is);
  assertMatch(migration, /revoke execute.+anon, authenticated, public/is);
});

Deno.test('manual identity linking and the before-user hook are enabled locally', async () => {
  const config = await read('../../config.toml');
  assertMatch(config, /enable_manual_linking\s*=\s*true/);
  assertMatch(config, /\[auth\.hook\.before_user_created\][\s\S]*enabled\s*=\s*true/);
  assertMatch(config, /before_user_created_require_email/);
});

Deno.test('platform implements email-first Telegram linking and phone completion', async () => {
  const authPage = await read('../../../apps/platform/src/pages/AuthPage.tsx');
  assertMatch(authPage, /signInWithOtp/);
  assertMatch(authPage, /authIntent=telegram-link/);
  assertMatch(authPage, /linkIdentity/);
  assertMatch(authPage, /TELEGRAM_AUTH_PROVIDER/);
  assertMatch(authPage, /normalizePhone/);
});

Deno.test('public bot exposes login and signup without putting credentials in links', async () => {
  const bot = await read('../../../workers/schood-online-bot/src/index.ts');
  assertMatch(bot, /command === "\/login"/);
  assertMatch(bot, /command === "\/signup"/);
  assertMatch(bot, /url\.searchParams\.set\('provider', 'telegram'\)/);
  assert(!/access_token|refresh_token/.test(bot.match(/const authUrl[\s\S]*?\n};/)?.[0] ?? ''));
});
