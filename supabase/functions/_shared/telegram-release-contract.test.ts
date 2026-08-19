import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";

const root = new URL("../../../", import.meta.url);
const read = (relativePath: string) => Deno.readTextFile(new URL(relativePath, root));

Deno.test("Telegram schema migration is inert until the explicit morning-brief enable step", async () => {
  const migration = await read("supabase/migrations/20260812130000_telegram_growth_system.sql");
  const enable = await read("scripts/telegram-morning-brief-enable.sql");
  const disable = await read("scripts/telegram-morning-brief-disable.sql");

  assertEquals(/cron\.schedule\s*\(/i.test(migration), false);
  assertMatch(enable, /cron\.schedule\s*\(/i);
  assertMatch(enable, /morning_brief/i);
  assertMatch(disable, /cron\.unschedule/i);
});

Deno.test("Telegram growth tables enable RLS and service-only RPCs revoke public execution", async () => {
  const migration = await read("supabase/migrations/20260812130000_telegram_growth_system.sql");
  for (const table of [
    "telegram_update_receipts",
    "telegram_acquisition_sessions",
    "telegram_public_rate_limits",
    "telegram_public_request_receipts",
  ]) {
    assertMatch(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  for (const fn of [
    "claim_telegram_update",
    "complete_telegram_update",
    "apply_telegram_journey_transition",
    "issue_telegram_link_token",
    "consume_telegram_link_token",
    "confirm_telegram_link_token",
    "telegram_public_rate_limit_consume",
  ]) {
    assertMatch(migration, new RegExp(`revoke all on function public\\.${fn}[\\s\\S]*? from public`, "i"));
  }

  const securityDefinerCount = migration.match(/security definer/gi)?.length ?? 0;
  const pinnedSearchPaths = [...migration.matchAll(/security definer\s+set search_path\s*=\s*pg_catalog,\s*public/gi)];
  assertEquals(pinnedSearchPaths.length, securityDefinerCount, "every SECURITY DEFINER function must pin pg_catalog before public");
});

Deno.test("runtime bot-token contract matches the isolated production bindings without cross-bot fallback", async () => {
  const publicEdge = await read("supabase/functions/telegram-public/index.ts");
  assert(publicEdge.includes('Deno.env.get("TELEGRAM_PUBLIC_BOT_TOKEN")'));
  assertEquals(publicEdge.includes('Deno.env.get("TELEGRAM_BOT_TOKEN")'), false);

  for (const path of ["supabase/functions/send-telegram/index.ts", "supabase/functions/telegram-app/index.ts"]) {
    const source = await read(path);
    assert(source.includes('TELEGRAM_BOT_TOKEN'), `${path} must use the existing student token binding`);
    assertEquals(source.includes('TELEGRAM_PUBLIC_BOT_TOKEN'), false, `${path} must not fall back to the public bot`);
  }

  for (const path of ["supabase/functions/academy-telegram/index.ts", "supabase/functions/send-academy-telegram/index.ts"]) {
    const source = await read(path);
    assert(source.includes('ACADEMY_TELEGRAM_BOT_TOKEN'), `${path} must use the dedicated Academy token binding`);
    assertEquals(source.includes('Deno.env.get("TELEGRAM_BOT_TOKEN")'), false);
    assertEquals(source.includes('Deno.env.get("TELEGRAM_PUBLIC_BOT_TOKEN")'), false);
  }

  const academyWorker = await read("workers/schood-academy-bot/src/index.ts");
  assertEquals(academyWorker.includes("TELEGRAM_BOT_TOKEN"), false, "Academy webhook Worker must not hold any bot token");

  for (const path of ["workers/schood-bot/src/index.ts", "workers/schood-online-bot/src/index.ts"]) {
    const source = await read(path);
    assert(source.includes('TELEGRAM_BOT_TOKEN'), `${path} must use its Worker-local token binding`);
    assertEquals(source.includes('TELEGRAM_PUBLIC_BOT_TOKEN') || source.includes('TELEGRAM_STUDENT_BOT_TOKEN'), false);
  }
});

Deno.test("both Workers support webhook-secret rotation overlap and synchronous acknowledgement", async () => {
  for (const path of ["workers/schood-bot/src/index.ts", "workers/schood-online-bot/src/index.ts"]) {
    const source = await read(path);
    assert(source.includes("WEBHOOK_SECRET_PREVIOUS"), `${path} lacks previous-secret overlap`);
    assertEquals(source.includes("waitUntil("), false, `${path} acknowledges before processing completes`);
    assertMatch(source, /outcome === "busy" \? 503 : 200/);
    assertMatch(source, /response\.status === 429 \|\| response\.status >= 500/);
  }
});

Deno.test("academy lead replay repairs both the lead reference and analytics event", async () => {
  const source = await read("supabase/functions/telegram-public/index.ts");
  assertMatch(source, /error\?\.code === "23505"[\s\S]*?academy_lead_created:[^\n]+[\s\S]*?return existing\.data/);
  assertMatch(source, /current\?\.last_step === "academy_lead_ready"[\s\S]*?createAcademyLead[\s\S]*?academy_lead_id/);
  assertEquals(source.includes(".then(() => undefined, () => undefined)"), false, "acquisition writes must not swallow database failures");
  assertMatch(source, /touchError && touchError\.code !== "23505"/);
});

Deno.test("the visible global Telegram toggle updates both legacy and channel preferences", async () => {
  const source = await read("apps/platform/src/pages/TelegramAppPage.tsx");
  assertMatch(source, /key === 'notifications_enabled' \? \{ telegram_enabled: Boolean\(value\) \}/);
  assertMatch(source, /notifications_enabled && data\.preferences\.telegram_enabled/);
});
