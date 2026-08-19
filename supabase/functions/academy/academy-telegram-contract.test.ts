import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => Deno.readTextFile(new URL(path, root));

Deno.test("Academy Telegram schema is service-only, tenant-scoped, and disabled by default", async () => {
  const migration = await read("supabase/migrations/20260819150000_academy_telegram_operations.sql");
  for (const table of [
    "academy_telegram_settings",
    "academy_telegram_chats",
    "academy_telegram_chat_subscriptions",
    "academy_telegram_link_tokens",
  ]) {
    assertMatch(migration, new RegExp(`create table public\\.${table}`));
    assertMatch(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assertMatch(migration, new RegExp(`revoke all on public\\.${table} from anon, authenticated`));
  }
  assertMatch(migration, /enabled boolean not null default false/);
  assertMatch(migration, /foreign key \(academy_id, branch_id\)/);
  assertMatch(migration, /foreign key \(academy_id, classroom_id\)/);
  assertMatch(migration, /bot_kind text not null default 'academy_staff' check \(bot_kind = 'academy_staff'\)/);
  assertEquals(/cron\.schedule\s*\(/i.test(migration), false, "migration must not silently activate delivery");
});

Deno.test("receptionist is branch-scoped and never gains finance, staff, or automation administration", async () => {
  const migration = await read("supabase/migrations/20260819150000_academy_telegram_operations.sql");
  const access = await read("supabase/functions/academy/access.ts");
  assertMatch(migration, /'branch_manager','receptionist','salesperson'/);
  assertMatch(access, /const receptionist = role === "receptionist"/);
  assertMatch(access, /markAttendance: classroomLms \|\| receptionist/);
  assertMatch(access, /dispatchNotifications: ops \|\| receptionist \|\| parentLiaison/);
  assertEquals(access.includes("manageAutomation: ownerAdmin || centerAdmin || receptionist"), false);
  assertEquals(access.includes("manageFinance: ownerAdmin || centerAdmin || receptionist"), false);
  assertEquals(access.includes("manageStaff: ownerAdmin || centerAdmin || receptionist"), false);
});

Deno.test("Academy Telegram write actions are replay-safe and attendance is atomic", async () => {
  const migration = await read("supabase/migrations/20260819150000_academy_telegram_operations.sql");
  const edge = await read("supabase/functions/academy-telegram/index.ts");
  assertMatch(migration, /academy_assignments_telegram_idempotency_uidx/);
  assertMatch(migration, /academy_record_telegram_attendance_batch/);
  assertMatch(migration, /academy_update_telegram_service_request/);
  assertMatch(migration, /security definer set search_path = pg_catalog, public/g);
  assertMatch(migration, /revoke all on function public\.academy_record_telegram_attendance_batch[\s\S]*?from public,anon,authenticated/);
  assertMatch(migration, /revoke all on function public\.academy_update_telegram_service_request[\s\S]*?from public,anon,authenticated/);
  assertMatch(edge, /academy_record_telegram_attendance_batch/);
  assertMatch(edge, /academy_update_telegram_service_request/);
  assert(edge.split('idempotency_key is required').length >= 4);
});

Deno.test("group delivery has bounded retry and releases daily digests exactly once", async () => {
  const delivery = await read("supabase/functions/send-academy-telegram/index.ts");
  assertMatch(delivery, /digest_released/);
  assertMatch(delivery, /nextClockOccurrence/);
  assertMatch(delivery, /Number\(notification\.attempts \?\? 0\) \+ 1 < 5/);
  assertMatch(delivery, /classifyTelegramFailure/);
  assertMatch(delivery, /\.eq\("status", "queued"\)/);
});

Deno.test("Academy bot remains isolated from public and student bot credentials", async () => {
  const edge = await read("supabase/functions/academy-telegram/index.ts");
  const provider = await read("supabase/functions/academy-telegram/provider-config.ts");
  const delivery = await read("supabase/functions/send-academy-telegram/index.ts");
  const worker = await read("workers/schood-academy-bot/src/index.ts");
  for (const source of [edge, delivery]) {
    assert(source.includes('ACADEMY_TELEGRAM_BOT_TOKEN'));
    assertEquals(source.includes('Deno.env.get("TELEGRAM_BOT_TOKEN")'), false);
    assertEquals(source.includes('Deno.env.get("TELEGRAM_PUBLIC_BOT_TOKEN")'), false);
  }
  assertEquals(worker.includes("TELEGRAM_BOT_TOKEN"), false, "the webhook Worker must not hold the bot token");
  assertMatch(worker, /x-worker-secret/);
  assertMatch(worker, /ACADEMY_TELEGRAM_WEBHOOK_SECRET_PREVIOUS/);
  assertMatch(edge, /ensureTelegramProviderConfiguration/);
  assertMatch(provider, /Academy Telegram token does not match the configured bot username/);
  assertMatch(edge, /ACADEMY_TELEGRAM_WEBHOOK_SECRET/);
  assertMatch(edge, /ACADEMY_TELEGRAM_INTERNAL_SECRET/);
});

Deno.test("personal warnings are scope-checked and handed to the student notification gateway", async () => {
  const edge = await read("supabase/functions/academy-telegram/index.ts");
  assertMatch(edge, /action === "send_private_warning"/);
  assertMatch(edge, /requirePermission\(access, "manageMessages"\)/);
  assertMatch(edge, /loadScopedContacts\(sb, access\)/);
  assertMatch(edge, /functions\/v1\/send-telegram/);
  assertMatch(edge, /bot_kind: "student"/);
  assertMatch(edge, /audience_kind: "student_private"/);
  assertMatch(edge, /private_content_redacted: true/);
  assertMatch(edge, /parse_mode: null/);
  assertEquals(edge.includes('text: `${title}\\n\\n${message}`'), true);
});

Deno.test("Mini App is a dedicated lazy route with phone overflow protection", async () => {
  const main = await read("apps/academy/src/main.tsx");
  const app = await read("apps/academy/src/components/telegram/AcademyTelegramApp.tsx");
  const css = await read("apps/academy/src/components/telegram/academy-telegram.css");
  assertMatch(main, /lazy\(\(\) => import\('\.\/components\/telegram\/AcademyTelegramApp'\)\)/);
  assert(main.includes("const telegramRoute = /^\\/(?:academy\\/)?telegram(?:\\/|$)/"));
  assertMatch(app, /type Tab = 'today' \| 'compose' \| 'groups' \| 'inbox' \| 'more'/);
  assertMatch(css, /@media \(max-width: 380px\)/);
  assertMatch(css, /overflow-x:\s*(?:hidden|clip)/);
});
