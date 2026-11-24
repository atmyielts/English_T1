import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildDb,
  TOKEN,
  TOEFL_2026,
  USER_ID,
} from "../_shared/testing/exam-fixtures.ts";
import { installFakeDb } from "../_shared/testing/fake-supabase.ts";
import { loadHandler } from "../_shared/testing/serve-capture.ts";

Deno.env.set("SUPABASE_URL", "http://fake.supabase.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");

const review = await loadHandler(new URL("./index.ts", import.meta.url));
const model = {
  model_response: "Could you confirm whether we can use the rehearsal room?",
  annotations: [{ point: "Register", excerpt: "Could you confirm", note: "Makes a polite request." }],
};
const makePractice = () => {
  const db = buildDb({
    ...TOEFL_2026,
    experienceMetadata: { format: "toefl-2026", catalog: "practice_bank_2026" },
    sections: [
      {
        type: "writing",
        parts: [[{
          type: "question_text",
          data: { prompt: "Confirm a room booking", task_type: "toefl_email" },
          metadata: { toefl_task: "write_email" },
          correct: {},
          response: { text: "Is the room available?" },
        }]],
      },
      TOEFL_2026.sections[0],
    ],
  });
  db.tables.sessions[0].metadata = { mode: "practice", allowed_section_ids: [db.sectionIds[0]] };
  db.tables.answer_keys[0].metadata = { feedback: model };
  db.tables.tenant_memberships = [{ user_id: USER_ID, tenant_id: "learner-tenant", status: "active" }];
  db.tables.entitlements = [{
    id: "toefl-access",
    tenant_id: "learner-tenant",
    resource_type: "product",
    resource_id: TOEFL_2026.productId,
    is_active: true,
    starts_at: null,
    ends_at: null,
  }];
  return db;
};
const request = (sessionId: string, sectionId?: string) => {
  const params = new URLSearchParams({ session_id: sessionId });
  if (sectionId) params.set("section_id", sectionId);
  return new Request(`http://fake.supabase.test/functions/v1/review-session?${params}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
};

Deno.test("paid TOEFL practice review releases the model only for its completed section", async () => {
  const db = makePractice();
  installFakeDb(db);

  const response = await review(request(db.sessionId));
  assertEquals(response.status, 200);
  const { sections, units } = await response.json();
  assertEquals(sections.map((row: { id: string }) => row.id), [db.sectionIds[0]]);
  assertEquals(units.map((row: { id: string }) => row.id), [db.unitIds[0]]);
  assertEquals(units[0].review_feedback, model);
  assertEquals(units[0].data.model_response, undefined);
  assertEquals(units[0].max_score, 0);
  assertEquals((await review(request(db.sessionId, db.sectionIds[1]))).status, 404);
});

Deno.test("unfinished and inaccessible TOEFL sessions do not release models", async () => {
  const active = makePractice();
  active.tables.sessions[0].status = "in_progress";
  installFakeDb(active);
  const pending = await review(request(active.sessionId));
  assertEquals(pending.status, 403);
  assertEquals(await pending.json(), { error: "Session is not completed" });

  const unpaid = makePractice();
  unpaid.tables.entitlements = [];
  installFakeDb(unpaid);
  const denied = await review(request(unpaid.sessionId));
  assertEquals(denied.status, 403);
  assertEquals(await denied.json(), { error: "No entitlement for product" });
});

Deno.test("a completed TOEFL reading response keeps its correct score and explanation", async () => {
  const db = makePractice();
  const choiceId = db.unitIds[2];
  const choice = db.tables.answer_keys.find((key) => key.content_unit_id === choiceId)!;
  const feedback = { explanation: "The notice names the earliest collection time." };
  choice.metadata = { feedback };
  db.tables.sessions[0].metadata = { mode: "practice", allowed_section_ids: [db.sectionIds[1]] };
  installFakeDb(db);

  const response = await review(request(db.sessionId, db.sectionIds[1]));
  assertEquals(response.status, 200);
  const { units } = await response.json();
  const item = units.find((unit: { id: string }) => unit.id === choiceId);
  assertEquals(item.review_feedback, feedback);
  assertEquals(item.is_correct, true);
  assertEquals(item.score, 1);
});
