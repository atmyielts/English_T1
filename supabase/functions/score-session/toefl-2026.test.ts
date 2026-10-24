// End-to-end TOEFL iBT 2026 scoring through the real handlers: toefl-speaking
// writes the speaking estimate, score-session (v1 and v2) reads it together
// with the AI writing scores and the adaptive route decisions.
//
// Run with --import-map=supabase/functions/_testing/import-map.json

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { installFakeDb } from "../_testing/fake-supabase.ts";
import { loadHandler } from "../_testing/serve-capture.ts";
import { buildDb, TOEFL_2026, TOKEN } from "../_testing/exam-fixtures.ts";

Deno.env.set("SUPABASE_URL", "http://fake.supabase.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
Deno.env.delete("OPENROUTER_API_KEY");

const speaking = await loadHandler(new URL("../toefl-speaking/index.ts", import.meta.url));
const scorers: Array<[string, (req: Request) => Response | Promise<Response>]> = [
  ["score-session", await loadHandler(new URL("./index.ts", import.meta.url))],
  ["score-session-v2", await loadHandler(new URL("../score-session-v2/index.ts", import.meta.url))],
];

const post = (handler: (req: Request) => Response | Promise<Response>, sessionId: string) =>
  Promise.resolve(handler(new Request("http://fake.supabase.test/fn", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  }))).then(async (res) => ({ status: res.status, body: await res.json() }));

const setup = (allTranscripts: boolean) => {
  const db = buildDb(TOEFL_2026);
  const id = (n: number) => db.unitIds[n - 1];
  if (allTranscripts) {
    const r = db.tables.responses.find((row) => row.content_unit_id === id(17))!;
    r.data = { transcript: "Please sign in at the front desk", stt: "browser" };
  }
  db.tables.evaluations.push({
    id: "w-eval", session_id: db.sessionId, method: "ai", status: "completed", evaluated_at: "2026-10-01T10:00:00.000Z",
    result: { rubric: "toefl-2026", tasks: [{ content_unit_id: id(14), score: 4 }, { content_unit_id: id(15), score: 3 }] },
  });
  return { db, fake: installFakeDb(db), id };
};

for (const [label, scoreHandler] of scorers) {
  Deno.test(`${label}: TOEFL 2026 bands, adaptive filtering and pending speaking`, async () => {
    const { db, fake, id } = setup(false);
    const spoken = await post(speaking, db.sessionId);
    assertEquals(spoken.status, 200);
    const result = spoken.body.evaluation.result;
    assertEquals(result.unscored, [id(17)]);
    assertEquals(result.items.find((i: { content_unit_id: string }) => i.content_unit_id === id(16)).score, 5);
    assertEquals(result.items.find((i: { content_unit_id: string }) => i.content_unit_id === id(18)).source, "basic");
    assertEquals(result.interview_rater, "basic");
    assert(fake.writes.some((w) => w.table === "evaluations" && w.rows[0]?.method === "ai_speaking"));

    const scored = await post(scoreHandler, db.sessionId);
    assertEquals(scored.status, 200);
    const t = scored.body.result.toefl;
    assertEquals(t.format, "toefl-2026");
    assertEquals(t.is_estimated, true);
    assertEquals(t.sections.reading.module_path, "upper");
    assertEquals([t.sections.reading.raw, t.sections.reading.max, t.sections.reading.band], [6, 8, 4.5]);
    assertEquals(t.sections.listening.module_path, "lower");
    assertEquals([t.sections.listening.raw, t.sections.listening.max, t.sections.listening.band], [1, 3, 2.5]);
    assertEquals([t.sections.writing.raw, t.sections.writing.max, t.sections.writing.band], [8, 12, 4]);
    assertEquals(t.sections.speaking.band, null);
    assertEquals(t.sections.speaking.pending_reason, "speaking_no_transcript");
    assertEquals(t.overall_band, null);
    assertEquals(t.overall_pending_reason, "missing:speaking");
    // Shared section rows carry the tier-filtered points and the skill band.
    const second = scored.body.result.sections["toefl-2026-sec-0002"];
    assertEquals([second.raw_score, second.max_score, second.band], [2, 3, 4.5]);
    assertEquals(scored.body.result.overall_band, null);
  });

  Deno.test(`${label}: TOEFL 2026 overall band when every section is scored`, async () => {
    const { db } = setup(true);
    assertEquals((await post(speaking, db.sessionId)).status, 200);
    const scored = await post(scoreHandler, db.sessionId);
    const t = scored.body.result.toefl;
    assertEquals(t.sections.speaking.band, 4.5); // (5 + 5 + 2) / 15 -> 24 -> 4.5
    assertEquals(t.overall_band, 4); // (4.5 + 2.5 + 4 + 4.5) / 4 = 3.875 -> 4
    assertEquals(t.overall_cefr, "B2");
    assertEquals(t.overall_legacy_total_min, 72);
    assertEquals(scored.body.result.overall_band, 4);
    assertEquals(scored.body.result.overall_score, 4);
    const tasks = Object.fromEntries(t.tasks.map((x: { task: string; raw: number; max: number }) => [x.task, [x.raw, x.max]]));
    assertEquals(tasks.build_sentence, [1, 2]);
    assertEquals(tasks.write_email, [4, 5]);
    assertEquals(tasks.listen_repeat, [10, 10]);
  });
}

Deno.test("toefl-speaking refuses sessions that are not TOEFL 2026", async () => {
  const db = buildDb({ ...TOEFL_2026, experienceMetadata: { catalog: "full_test" } });
  installFakeDb(db);
  const res = await post(speaking, db.sessionId);
  assertEquals(res.status, 400);
  assertEquals(res.body.code, "not_toefl_2026");
});
