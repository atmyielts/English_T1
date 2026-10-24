import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CLAIM_STALE_MS,
  type ClaimRow,
  type ClaimStore,
  decideClaim,
  isSubmitPath,
  parseClientAttemptId,
  storableResponse,
  withClientAttempt,
} from "./english-client-attempt.ts";

/** In-memory claim store with the same semantics as the table (primary key per learner + id). */
const memoryStore = (options: { failGet?: boolean } = {}) => {
  const rows = new Map<string, ClaimRow>();
  const key = (userId: string, id: string) => `${userId}|${id}`;
  const store: ClaimStore = {
    get: async (userId, id) => {
      if (options.failGet) throw new Error("relation does not exist");
      return rows.get(key(userId, id)) ?? null;
    },
    claim: async (userId, id) => {
      if (rows.has(key(userId, id))) return false;
      rows.set(key(userId, id), { status: "pending", response: null, created_at: new Date().toISOString() });
      return true;
    },
    reclaim: async (userId, id, staleBeforeIso) => {
      const row = rows.get(key(userId, id));
      if (!row || row.status !== "pending" || Date.parse(row.created_at) >= Date.parse(staleBeforeIso)) return false;
      row.created_at = new Date().toISOString();
      return true;
    },
    complete: async (userId, id, response) => {
      const row = rows.get(key(userId, id));
      if (row) Object.assign(row, { status: "done", response });
    },
    release: async (userId, id) => {
      if (rows.get(key(userId, id))?.status === "pending") rows.delete(key(userId, id));
    },
  };
  return { store, rows };
};

const ok = (body: Record<string, unknown>) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

Deno.test("client attempt ids are short safe tokens", () => {
  assertEquals(parseClientAttemptId("off_2c1f9a7e-4b1d-4a7e-9c11-0f5d2a9e8b31"), "off_2c1f9a7e-4b1d-4a7e-9c11-0f5d2a9e8b31");
  assertEquals(parseClientAttemptId("short"), null);
  assertEquals(parseClientAttemptId("has space in it"), null);
  assertEquals(parseClientAttemptId("x".repeat(65)), null);
  assertEquals(parseClientAttemptId(12345678), null);
});

Deno.test("submit routes are recognised per collection", () => {
  assert(isSubmitPath("/units/past-simple/submit", "units"));
  assert(!isSubmitPath("/units/past-simple", "units"));
  assert(!isSubmitPath("/drills/submit", "units"));
  assert(!isSubmitPath("/decks/a/submit", "units"));
  assert(!isSubmitPath("/units//submit", "units"));
});

Deno.test("claim decisions: new, replay, in progress, stale", () => {
  const now = Date.parse("2026-10-26T10:00:00Z");
  assertEquals(decideClaim(null, now), "new");
  assertEquals(decideClaim({ status: "done", response: { score: 80 }, created_at: "2026-10-26T09:00:00Z" }, now), "replay");
  assertEquals(decideClaim({ status: "pending", response: null, created_at: "2026-10-26T09:59:00Z" }, now), "in_progress");
  assertEquals(decideClaim({ status: "pending", response: null, created_at: new Date(now - CLAIM_STALE_MS - 1).toISOString() }, now), "stale");
});

Deno.test("the same client attempt id is recorded once and replayed after", async () => {
  const { store } = memoryStore();
  let recorded = 0;
  const submit = async () => {
    recorded += 1;
    return ok({ ok: true, attempt_id: `a${recorded}`, score: 75 });
  };
  const input = { userId: "u1", clientAttemptId: "off_abcdefgh123", serviceKey: "reading", route: "/articles/x/submit" };
  const first = await withClientAttempt(store, input, submit);
  const second = await withClientAttempt(store, input, submit);
  assertEquals(recorded, 1);
  assertEquals((await first.json()).attempt_id, "a1");
  const replay = await second.json();
  assertEquals(replay.attempt_id, "a1");
  assertEquals(replay.replayed, true);
});

Deno.test("another learner's identical id is a different attempt", async () => {
  const { store } = memoryStore();
  let recorded = 0;
  const submit = async () => ok({ ok: true, n: ++recorded });
  await withClientAttempt(store, { userId: "u1", clientAttemptId: "off_abcdefgh123", serviceKey: "grammar", route: "/units/a/submit" }, submit);
  await withClientAttempt(store, { userId: "u2", clientAttemptId: "off_abcdefgh123", serviceKey: "grammar", route: "/units/a/submit" }, submit);
  assertEquals(recorded, 2);
});

Deno.test("a refused or failed submit frees the id for a later retry", async () => {
  const { store, rows } = memoryStore();
  const input = { userId: "u1", clientAttemptId: "off_retry_0001", serviceKey: "vocabulary", route: "/decks/a/submit" };
  const refused = await withClientAttempt(store, input, async () => new Response("{}", { status: 503 }));
  assertEquals(refused.status, 503);
  assertEquals(rows.size, 0);
  let thrown = false;
  try {
    await withClientAttempt(store, input, async () => { throw new Error("db down"); });
  } catch {
    thrown = true;
  }
  assert(thrown);
  assertEquals(rows.size, 0);
  const later = await withClientAttempt(store, input, async () => ok({ ok: true }));
  assertEquals(later.status, 200);
  assertEquals(rows.get("u1|off_retry_0001")?.status, "done");
});

Deno.test("a repeat while the first is still running gets 409, and a stale claim is taken over", async () => {
  const { store, rows } = memoryStore();
  const input = { userId: "u1", clientAttemptId: "off_parallel_01", serviceKey: "listening", route: "/items/a/submit" };
  await store.claim("u1", "off_parallel_01", "listening", "/items/a/submit");
  let recorded = 0;
  const busy = await withClientAttempt(store, input, async () => ok({ n: ++recorded }));
  assertEquals(busy.status, 409);
  assertEquals((await busy.json()).code, "client_attempt_in_progress");
  assertEquals(recorded, 0);
  rows.get("u1|off_parallel_01")!.created_at = new Date(Date.now() - CLAIM_STALE_MS - 1000).toISOString();
  const taken = await withClientAttempt(store, input, async () => ok({ n: ++recorded }));
  assertEquals(taken.status, 200);
  assertEquals(recorded, 1);
});

Deno.test("without an id, or without the table, submits run exactly as before", async () => {
  const { store } = memoryStore({ failGet: true });
  let recorded = 0;
  const submit = async () => ok({ n: ++recorded });
  await withClientAttempt(store, { userId: "u1", clientAttemptId: null, serviceKey: "reading", route: "/articles/a/submit" }, submit);
  await withClientAttempt(store, { userId: "u1", clientAttemptId: "off_abcdefgh123", serviceKey: "reading", route: "/articles/a/submit" }, submit);
  assertEquals(recorded, 2);
});

Deno.test("large responses keep only their headline fields", () => {
  const big = { ok: true, score: 90, correct: 9, total: 10, attempt_id: "a", results: Array.from({ length: 4000 }, (_, i) => ({ text: `sentence ${i}` })) };
  const stored = storableResponse(big);
  assertEquals(stored, { trimmed: true, ok: true, attempt_id: "a", score: 90, correct: 9, total: 10 });
  assertEquals(storableResponse({ ok: true, score: 1 }), { ok: true, score: 1 });
});
