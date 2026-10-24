// Proves the TOEFL 2026 work leaves every other exam's scoring unchanged.
//
// The real score-session and score-session-v2 handlers run against an
// in-memory database (see ../_testing). For IELTS, SAT, iTEP and the pre-2026
// TOEFL format the HTTP response and every row they write must equal the
// golden snapshot recorded from main before the 2026 changes
// (legacy-golden.json). Timestamps and random row ids are the only fields
// removed before comparing.
//
// Run: deno test --no-lock --allow-env --allow-read --allow-write
//   --import-map=supabase/functions/_testing/import-map.json supabase/functions/score-session/
// Regenerate (only when an intended legacy change lands): add GOLDEN_WRITE=1.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { installFakeDb } from "../_testing/fake-supabase.ts";
import { loadHandler } from "../_testing/serve-capture.ts";
import { buildDb, LEGACY_SPECS, TOKEN } from "../_testing/exam-fixtures.ts";

Deno.env.set("SUPABASE_URL", "http://fake.supabase.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");

const VOLATILE = new Set(["computed_at", "evaluated_at", "occurred_at", "graded_at", "request_id"]);
const normalize = (value: unknown, dropId = false): unknown => {
  if (Array.isArray(value)) return value.map((v) => normalize(v, dropId));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (VOLATILE.has(k) || (dropId && k === "id")) continue;
    out[k] = normalize(v, false);
  }
  return out;
};

const goldenUrl = new URL("./legacy-golden.json", import.meta.url);
const writing = Deno.env.get("GOLDEN_WRITE") === "1";
const golden: Record<string, Record<string, unknown>> = writing ? {} : JSON.parse(await Deno.readTextFile(goldenUrl));

const handlers: Array<[string, URL]> = [
  ["score-session", new URL("./index.ts", import.meta.url)],
  ["score-session-v2", new URL("../score-session-v2/index.ts", import.meta.url)],
];

for (const [label, moduleUrl] of handlers) {
  const handler = await loadHandler(moduleUrl);
  for (const spec of LEGACY_SPECS) {
    Deno.test(`${label}: ${spec.key} scoring is unchanged`, async () => {
      const db = buildDb(spec);
      const fake = installFakeDb(db);
      const res = await handler(new Request("http://fake.supabase.test/functions/v1/score-session", {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: db.sessionId, method: "auto" }),
      }));
      const body = await res.json();
      const snapshot = {
        status: res.status,
        body: { ...(normalize(body) as Record<string, unknown>), evaluation: normalize(body.evaluation, true) },
        writes: fake.writes.map((w) => ({ table: w.table, op: w.op, rows: w.rows.map((r) => normalize(r, true)) })),
      };
      if (writing) {
        (golden[label] ??= {})[spec.key] = snapshot;
        await Deno.writeTextFile(goldenUrl, JSON.stringify(golden, null, 1) + "\n");
        return;
      }
      assertEquals(snapshot, golden[label]?.[spec.key]);
    });
  }
}
