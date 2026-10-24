// Route-level permission checks for /classes with an in-memory stand-in for
// the Supabase client (only the calls these routes make).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { clearEnglishSettingsCache } from "../_shared/english-settings.ts";
import { handleClassesRoute } from "./classes.ts";

type Row = Record<string, unknown>;

const TEACHER = "00000000-0000-4000-8000-000000000001";
const LEARNER = "00000000-0000-4000-8000-000000000002";
const STRANGER = "00000000-0000-4000-8000-000000000003";
const CLASS_ID = "00000000-0000-4000-8000-0000000000c1";
const LANGUAGE = "00000000-0000-4000-8000-0000000000e1";

/** A tiny query builder: filters with eq/in/is, everything else is accepted and ignored. */
const fakeDb = (tables: Record<string, Row[]>, calls: string[] = []) => {
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    let op = "select";
    let patch: Row | null = null;
    const builder: Record<string, unknown> = {};
    const chain = (fn?: () => void) => () => {
      fn?.();
      return builder;
    };
    builder.select = chain();
    builder.order = chain();
    builder.limit = chain();
    builder.range = chain();
    builder.not = chain();
    builder.gte = chain();
    builder.gt = chain();
    builder.lte = chain();
    builder.like = chain();
    builder.or = chain();
    builder.eq = (column: string, value: unknown) => {
      if (!column.includes(".")) rows = rows.filter((row) => !(column in row) || row[column] === value);
      return builder;
    };
    builder.in = (column: string, values: unknown[]) => {
      if (!column.includes(".")) rows = rows.filter((row) => !(column in row) || values.includes(row[column]));
      return builder;
    };
    builder.is = (column: string, value: unknown) => {
      rows = rows.filter((row) => (row[column] ?? null) === value);
      return builder;
    };
    builder.update = (value: Row) => {
      op = "update";
      patch = value;
      return builder;
    };
    builder.insert = (value: Row) => {
      op = "insert";
      patch = value;
      return builder;
    };
    const run = () => {
      if (op === "update" && patch) {
        calls.push(`update:${table}`);
        for (const row of rows) Object.assign(row, patch);
      }
      if (op === "insert" && patch) {
        calls.push(`insert:${table}`);
        const row = { id: crypto.randomUUID(), ...patch };
        (tables[table] ??= []).push(row);
        rows = [row];
      }
      return { data: rows, error: null, count: rows.length };
    };
    builder.maybeSingle = () => {
      const result = run();
      return Promise.resolve({ ...result, data: result.data[0] ?? null });
    };
    builder.then = (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject);
    return builder;
  };
  return {
    from,
    rpc: (name: string, args: Row) => {
      calls.push(`rpc:${name}`);
      const members = tables.english_class_members ??= [];
      members.push({ class_id: args.p_class_id, user_id: args.p_user_id, status: "active", joined_at: new Date().toISOString() });
      return Promise.resolve({ data: "joined", error: null });
    },
  };
};

const world = (services: Row = {}): Record<string, Row[]> => ({
  english_service_settings: [{ key: "services", value: services }],
  english_classes: [{
    id: CLASS_ID,
    language_id: LANGUAGE,
    teacher_id: TEACHER,
    name: "7A",
    level: "B1",
    school_name: null,
    join_code: "HJK234",
    status: "active",
    digest_telegram: false,
    digest_locale: "en",
    created_at: "2026-10-20T00:00:00Z",
  }],
  english_class_members: [{ class_id: CLASS_ID, user_id: LEARNER, status: "active", joined_at: "2026-10-21T00:00:00Z" }],
  english_class_assignments: [],
  user_profiles: [],
  users: [],
});

const call = async (sb: unknown, userId: string, method: string, route: string, body?: unknown) => {
  clearEnglishSettingsCache();
  const url = new URL(`https://x.supabase.co/functions/v1/hub${route}?language_code=en`);
  const req = new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "Content-Type": "application/json" } });
  const response = await handleClassesRoute({ sb, req, url, route, userId, languageId: LANGUAGE, products: {} });
  assert(response, `${route} is a classes route`);
  return { status: response.status, body: await response.json() };
};

Deno.test("other routes are not handled here", async () => {
  const url = new URL("https://x/hub/today");
  assertEquals(await handleClassesRoute({ sb: fakeDb(world()), req: new Request(url), url, route: "/today", userId: TEACHER, languageId: LANGUAGE, products: {} }), null);
});

Deno.test("only the teacher sees the dashboard and manages the class", async () => {
  for (const userId of [LEARNER, STRANGER]) {
    const tables = world();
    const calls: string[] = [];
    const sb = fakeDb(tables, calls);
    assertEquals((await call(sb, userId, "GET", `/classes/${CLASS_ID}`)).status, 403);
    assertEquals((await call(sb, userId, "GET", `/classes/${CLASS_ID}/digest`)).status, 403);
    assertEquals((await call(sb, userId, "POST", `/classes/${CLASS_ID}/remove`, { user_id: LEARNER })).status, 403);
    assertEquals((await call(sb, userId, "POST", `/classes/${CLASS_ID}/code`)).status, 403);
    assertEquals((await call(sb, userId, "POST", `/classes/${CLASS_ID}/archive`)).status, 403);
    assertEquals((await call(sb, userId, "POST", `/classes/${CLASS_ID}/assignments`, { kind: "speaking_mock", due_date: "2099-01-01" })).status, 403);
    assertEquals(calls.filter((entry) => !entry.startsWith("select")), [], "nothing was written");
    assertEquals(tables.english_classes[0]!.status, "active");
  }
  assertEquals((await call(fakeDb(world()), TEACHER, "GET", "/classes/not-a-uuid")).status, 404);
});

Deno.test("the teacher can remove a learner; the code at removal is remembered", async () => {
  const tables = world();
  const result = await call(fakeDb(tables), TEACHER, "POST", `/classes/${CLASS_ID}/remove`, { user_id: LEARNER });
  assertEquals(result.status, 200);
  assertEquals([tables.english_class_members[0]!.status, tables.english_class_members[0]!.removed_code], ["removed", "HJK234"]);
});

Deno.test("joining needs consent and a valid code; the teacher cannot join their own class", async () => {
  const tables = world();
  const calls: string[] = [];
  const sb = fakeDb(tables, calls);
  assertEquals((await call(sb, STRANGER, "POST", "/classes/join", { code: "hjk-234" })).body.code, "class_consent_required");
  assertEquals((await call(sb, STRANGER, "POST", "/classes/join", { code: "ZZZ999", consent: true })).status, 404);
  assertEquals((await call(sb, TEACHER, "POST", "/classes/join", { code: "HJK234", consent: true })).body.code, "class_own");
  assertEquals(calls.includes("rpc:english_class_join"), false);
  const joined = await call(sb, STRANGER, "POST", "/classes/join", { code: "hjk 234", consent: true });
  assertEquals([joined.status, joined.body.result], [200, "joined"]);
});

Deno.test("leaving only touches the caller's own membership", async () => {
  const tables = world();
  assertEquals((await call(fakeDb(tables), LEARNER, "POST", `/classes/${CLASS_ID}/leave`)).status, 200);
  assertEquals(tables.english_class_members[0]!.status, "left");
});

Deno.test("switched off: lists are empty and every change is refused", async () => {
  const sb = fakeDb(world({ classes: false }));
  const list = await call(sb, LEARNER, "GET", "/classes");
  assertEquals([list.status, list.body.enabled], [200, false]);
  assertEquals((await call(sb, LEARNER, "GET", "/classes/assignments")).body.assignments, []);
  assertEquals((await call(sb, STRANGER, "POST", "/classes/join", { code: "HJK234", consent: true })).status, 503);
  assertEquals((await call(sb, TEACHER, "POST", "/classes", { name: "8B" })).status, 503);
});
