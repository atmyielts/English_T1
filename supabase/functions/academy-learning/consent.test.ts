import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { signTelegramInitDataForTest } from "../_shared/telegram-init-data.ts";
import { GRAMMAR_TOPICS } from "../_shared/english-mistakes.ts";
import { guardianConsent, learnerConsents, setGuardianConsent, setLearnerConsent, shapeConsent } from "./consent.ts";
import { HttpError } from "./core.ts";
import { miniAppFeedConsent, miniAppSetFeedConsent } from "./miniapp.ts";
import { FakeDb } from "./test-fakes.ts";

type Row = Record<string, unknown>;
const TOKEN = "123456:test-token";
const U = "11111111-1111-4111-8111-111111111111";
const A1 = "a1a1a1a1-0000-4000-8000-000000000001", C1 = "c1c1c1c1-0000-4000-8000-000000000001";
const A2 = "a2a2a2a2-0000-4000-8000-000000000002", C2 = "c2c2c2c2-0000-4000-8000-000000000002";
const R1 = "e1e1e1e1-0000-4000-8000-000000000001";

const setup = (overrides: Record<string, (args: Row) => { data?: unknown; error?: { code?: string; message?: string } }> = {}) => {
  const db = new FakeDb({
    users: [{ id: U, telegram_chat_id: "555", full_name: "Ali" }],
    tenants: [{ id: A1, name: "Alpha Centre" }, { id: A2, name: "Beta School" }],
  }, {
    academy_student_contacts_command: () => ({ data: { actor_id: U, contacts: [{ id: C1, academy_id: A1 }, { id: C2, academy_id: A2 }] } }),
    academy_homework_feed_state: (args) => ({
      data: args.p_academy === A1
        ? { academy_id: A1, contact_id: C1, status: "granted", granted_at: "2026-10-24T08:00:00Z", granted_by_role: "learner", revoked_at: null, copied: 4 }
        : { academy_id: A2, contact_id: C2, status: "off", copied: 0 },
    }),
    academy_homework_feed_learner_command: (args) => ({
      data: { consents: [{ academy_id: args.p_academy, status: args.p_grant ? "granted" : "revoked", granted_at: "2026-10-24T09:00:00Z",
        granted_by_role: "learner", revoked_at: args.p_grant ? null : "2026-10-24T09:00:00Z", copied: args.p_grant ? 2 : 0 }] },
    }),
    academy_homework_feed_guardian_state: () => ({ data: { academy_id: A1, status: "off", copied: 0, account_linked: true } }),
    academy_homework_feed_guardian_command: (args) => ({ data: { academy_id: A1, status: args.p_grant ? "granted" : "revoked", granted_by_role: "guardian", granted_at: "2026-10-24T10:00:00Z", copied: 3 } }),
    ...overrides,
  });
  return db;
};

Deno.test("a learner sees one practice setting per centre, off unless they turned it on", async () => {
  const db = setup();
  const out = await learnerConsents(db, U, null);
  assertEquals(out.consents.map((c) => [c.center_name, c.status, c.copied]), [["Alpha Centre", "granted", 4], ["Beta School", "off", 0]]);
  assertEquals(out.practice_url, "https://english.schood.online/review");
  const one = await learnerConsents(db, U, A2);
  assertEquals(one.consents.map((c) => c.academy_id), [A2]);
});

Deno.test("turning it on sends the 18+ confirmation only when ticked, and the source is whitelisted", async () => {
  const db = setup();
  const out = await setLearnerConsent(db, U, { academy_id: A1, enabled: true, confirmed_adult: true, source: "evil" }, "academy_web");
  assertEquals(out.consent.status, "granted");
  assertEquals(out.consent.center_name, "Alpha Centre");
  const call = db.rpcCalls.find((c) => c.name === "academy_homework_feed_learner_command")!.args;
  assertEquals(call, { p_actor: U, p_academy: A1, p_grant: true, p_confirmed_adult: true, p_source: "academy_web" });
  await setLearnerConsent(db, U, { academy_id: A1, enabled: true, confirmed_adult: "yes" }, "telegram_app");
  const second = db.rpcCalls.filter((c) => c.name === "academy_homework_feed_learner_command")[1]!.args;
  assertEquals(second.p_confirmed_adult, false);
  assertEquals(second.p_source, "telegram_app");
});

Deno.test("turning it off is reported with when it stopped", async () => {
  const out = await setLearnerConsent(setup(), U, { academy_id: A1, enabled: false }, "academy_web");
  assertEquals(out.consent.status, "revoked");
  assertEquals(out.consent.granted_at, null);
  assertEquals(out.consent.revoked_at, "2026-10-24T09:00:00Z");
  assertEquals(out.consent.copied, 0);
});

Deno.test("bad input and the database's refusals become clear errors", async () => {
  await assertRejects(() => setLearnerConsent(setup(), U, { academy_id: "x", enabled: true }, "academy_web"), HttpError, "academy_id");
  await assertRejects(() => setLearnerConsent(setup(), U, { academy_id: A1, enabled: "on" }, "academy_web"), HttpError, "on or off");
  const minor = setup({
    academy_homework_feed_learner_command: () => ({ error: { code: "P0001", message: "If you are under 18, a parent or guardian turns this on from the parent page." } }),
  });
  const error = await assertRejects(() => setLearnerConsent(minor, U, { academy_id: A1, enabled: true }, "academy_web"), HttpError);
  assertEquals((error as HttpError).status, 400);
  assert((error as HttpError).message.includes("parent or guardian"));
  const stranger = setup({ academy_homework_feed_learner_command: () => ({ error: { code: "42501", message: "You are not a learner at this centre." } }) });
  const denied = await assertRejects(() => setLearnerConsent(stranger, U, { academy_id: A1, enabled: true, confirmed_adult: true }, "academy_web"), HttpError);
  assertEquals((denied as HttpError).status, 403);
});

Deno.test("guardians decide through their parent relationship", async () => {
  const db = setup();
  await assertRejects(() => guardianConsent(db, U, {}), HttpError, "relationship_id");
  const state = await guardianConsent(db, U, { relationship_id: R1 });
  assertEquals([state.consent.status, state.account_linked], ["off", true]);
  const on = await setGuardianConsent(db, U, { relationship_id: R1, enabled: true });
  assertEquals([on.consent.status, on.consent.granted_by_role, on.consent.copied], ["granted", "guardian", 3]);
  assertEquals(db.rpcCalls.at(-1)!.args, { p_actor: U, p_relationship: R1, p_grant: true, p_source: "guardian_portal" });
});

Deno.test("the Mini App setting needs a signed Telegram session of a linked account", async () => {
  const db = setup();
  const initData = await signTelegramInitDataForTest(
    { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 555, first_name: "Ali" }) }, TOKEN);
  const out = await miniAppFeedConsent({ sb: db, botToken: TOKEN }, { initData });
  assertEquals(out.consents.length, 2);
  const set = await miniAppSetFeedConsent({ sb: db, botToken: TOKEN }, { initData, academy_id: A2, enabled: true, confirmed_adult: true });
  assertEquals(set.consent.status, "granted");
  assertEquals(db.rpcCalls.at(-1)!.args.p_source, "telegram_app");
  await assertRejects(() => miniAppFeedConsent({ sb: db, botToken: TOKEN }, { initData: "user=%7B%22id%22%3A555%7D&hash=bad" }), HttpError, "Telegram bot again");
});

Deno.test("a revoked or unknown state never shows stale grant details", () => {
  assertEquals(shapeConsent({ status: "revoked", granted_at: "2026-10-01", granted_by_role: "guardian", revoked_at: "2026-10-02" }, "X"),
    { academy_id: "", center_name: "X", status: "revoked", granted_at: null, granted_by_role: null, revoked_at: "2026-10-02", copied: 0 });
  assertEquals(shapeConsent(null, "X").status, "off");
  assertEquals(shapeConsent({ status: "weird" }, "X").status, "off");
});

// The SQL that copies mistakes must agree with the English loop and stay closed to browsers.
const migration = await Deno.readTextFile(new URL("../../migrations/20261025210000_academy_homework_mistake_feed.sql", import.meta.url));

Deno.test("homework tags map onto the same grammar topics as Schood English lessons", () => {
  const start = migration.indexOf("function public.academy_homework_feed_topic(");
  const fn = migration.slice(start, migration.indexOf("$$;", start));
  const block = fn.match(/v = any \(array\[([\s\S]*?)\]\)/);
  assert(block, "topic list not found");
  const topics = [...block[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
  assertEquals([...topics].sort(), [...GRAMMAR_TOPICS].sort());
  for (const alias of fn.matchAll(/then '([a-z-]+)'/g)) {
    assert((GRAMMAR_TOPICS as readonly string[]).includes(alias[1]), `alias maps to unknown topic ${alias[1]}`);
  }
});

Deno.test("copies are removed before a mistake is deleted, and nothing is reachable from a browser", () => {
  assert(/create trigger academy_homework_mistake_unfeed before delete on public\.academy_homework_mistakes/.test(migration));
  for (const table of ["academy_homework_feed_consents", "academy_homework_feed_consent_events", "academy_homework_mistake_feed"]) {
    assert(migration.includes(`alter table public.${table} enable row level security;`), `${table} needs RLS`);
    assert(migration.includes(`revoke all on public.${table} from anon, authenticated;`), `${table} must not be granted to browsers`);
  }
  const functions = [...migration.matchAll(/create or replace function (public\.[a-z_]+)\(/g)].map((m) => m[1]);
  const revoked = migration.slice(migration.indexOf("$grants$"));
  for (const fn of functions) assert(revoked.includes(`'${fn}(`), `${fn} must be revoked from browsers`);
  assert(!/grant execute[^;]*to (anon|authenticated)/.test(migration));
  // Only rows this feature created are ever deleted from the learner's English data.
  assert(migration.includes("where id = p_error and service_key = 'academy_homework'"));
  assert(migration.includes("item_key like 'homework:%'"));
});
