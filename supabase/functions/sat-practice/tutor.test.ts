import { assert, assertEquals, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createSatTutorHandler, prepareTutorInput, tutorFeedback, tutorInput, type TutorMode } from "./tutor.ts";

const actor = "11111111-1111-4111-8111-111111111111", questionId = "22222222-2222-4222-8222-222222222222", attemptId = "33333333-3333-4333-8333-333333333333", requestId = "44444444-4444-4444-8444-444444444444", lease = "55555555-5555-4555-8555-555555555555";
const question = { id: questionId, data: { prompt: "An original saved question" }, correct: { option_id: "A" }, domain: "algebra" };
const advice = { steps: ["Use the original saved rule."], key_concept: "Linear equations", why_distractors_wrong: { B: "Does not satisfy the equation." } };
const policy = { limit: 2, paid: false, addonAvailable: false, serviceLimit: 100, enabled: true };
type Options = { owned?: boolean; scored?: boolean; legacy?: boolean; dbFailure?: boolean; reserve?: string; providerFailure?: boolean; saveFailure?: number; disabled?: boolean; queryFailure?: boolean };
function fixture(options: Options = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [], queries: { table: string; filters: Record<string, unknown> }[] = [];
  let generated = 0, saves = 0;
  const result = { ok: true, ai_status: "ok", data: advice, mode: "explain", attempt_id: attemptId, question_id: questionId };
  const attempt = { id: attemptId, user_id: actor, status: options.scored === false ? "in_progress" : "scored", answers: { [questionId]: { option_id: "B" } } };
  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      queries.push({ table, filters });
      return { select() { return this; }, eq(key: string, value: unknown) { filters[key] = value; return this; },
        maybeSingle: async () => ({
          data: table === "sat_practice_lab_attempts" ? (options.owned === false ? null : attempt)
            : table === "sat_practice_attempt_results" ? { result: options.legacy ? null : { attempt, questions: [question] } }
            : table === "ai_request_ledger" ? { status: "succeeded", result, failure_code: null }
            : { charged: 1, attempts: 1 },
          error: options.dbFailure && table.startsWith("sat_") || options.queryFailure && table === "ai_request_usage_daily" ? new Error("private-database-error") : null,
        }),
      };
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "reserve_ai_request") return { data: { status: options.reserve ?? (args.p_global_limit === 0 ? "service_limit" : "reserved"), result, lease_token: lease, replay: options.reserve === "succeeded" }, error: null };
      if (name === "begin_ai_request") return { data: true, error: null };
      if (name === "finish_ai_request" && args.p_status === "succeeded") {
        if (++saves <= (options.saveFailure ?? 0)) return { data: null, error: new Error("lost save acknowledgement") };
        return { data: { status: "succeeded", result: args.p_result }, error: null };
      }
      return { data: { status: "uncertain", result: null }, error: null };
    },
  } as unknown as SupabaseClient;
  const handler = createSatTutorHandler({ client, authenticate: async token => token === "owned-token" ? actor : null,
    allowance: async () => ({ ...policy, enabled: !options.disabled }), generate: async input => {
      generated++;
      assertEquals(input.question, question);
      assertEquals(input.user_answer, { option_id: "B" });
      if (options.providerFailure) throw new Error("private-provider-text");
      return advice;
    },
  }, actor, "explain");
  return { handler, client, calls, queries, generated: () => generated };
}
const request = (body: Record<string, unknown> = {}, query = "") => new Request("https://example.test/sat-practice/tutor/explain" + query, {
  method: "POST", headers: { Authorization: "Bearer owned-token", "Content-Type": "application/json" },
  body: JSON.stringify({ request_id: requestId, attempt_id: attemptId, question_id: questionId, user_answer: "forged answer", ...body }),
});

Deno.test("SAT tutor validates drill identity and normalizes IDs", () => {
  assertEquals(tutorInput({ attempt_id: attemptId.toUpperCase(), question_id: questionId }, "explain"), { attempt_id: attemptId, question_id: questionId, mode: "explain" });
  assertThrows(() => tutorInput({ question_id: questionId }, "explain"));
  assertThrows(() => tutorInput({ attempt_id: "all", question_id: questionId }, "explain"));
});
Deno.test("tutoring uses immutable owned results and ignores claimed answers", async () => {
  const f = fixture();
  const response = await f.handler(request());
  const value = await response.json();
  assertEquals(response.status, 200);
  assertEquals(value.data, advice);
  assertEquals(value.ai_status, "ok");
  assertEquals(value.request_id, requestId);
  assertEquals(response.headers.get("X-SAT-Tutor-Version"), "2");
  assertEquals(f.generated(), 1);
  for (const query of f.queries.filter(row => row.table.startsWith("sat_"))) assertEquals(query.filters.user_id, actor);
  assertEquals(f.calls.map(call => call.name), ["reserve_ai_request", "begin_ai_request", "finish_ai_request"]);
  assertEquals(f.calls[2].args.p_service, "sat-tutor");
  assertEquals(f.calls[2].args.p_lease_token, lease);
});
Deno.test("unowned, unfinished, legacy and unavailable questions never reserve or dispatch", async () => {
  for (const [options, status] of [[{ owned: false }, 404], [{ scored: false }, 409], [{ legacy: true }, 409], [{ dbFailure: true }, 503]] as [Options, number][]) {
    const f = fixture(options), response = await f.handler(request());
    assertEquals(response.status, status);
    assertEquals(f.generated(), 0);
    assertEquals(f.calls.length, 0);
    assert(!(await response.text()).includes("private-database-error"));
  }
  const f = fixture();
  await assertRejects(() => prepareTutorInput(f.client, actor, { attempt_id: attemptId, question_id: lease, mode: "explain" }));
});
Deno.test("saved receipt replay, exhausted budgets and duplicate dispatch are bounded", async () => {
  for (const [status, expected] of [["succeeded", 200], ["user_limit", 429], ["service_limit", 503], ["started", 409], ["uncertain", 409], ["conflict", 409]] as [string, number][]) {
    const f = fixture({ reserve: status }), response = await f.handler(request());
    assertEquals(response.status, expected);
    assertEquals(f.generated(), 0);
    assertEquals(f.calls.length, 1);
    if (status === "succeeded") assertEquals((await response.json()).data, advice);
  }
  const f = fixture({ disabled: true });
  assertEquals((await f.handler(request())).status, 503);
  assertEquals(f.generated(), 0);
  assertEquals(f.calls[0].args.p_global_limit, 0);
});
Deno.test("lost save acknowledgements retry SQL only; provider errors stay private", async () => {
  const saved = fixture({ saveFailure: 1 });
  assertEquals((await saved.handler(request())).status, 200);
  assertEquals(saved.generated(), 1);
  assertEquals(saved.calls.filter(call => call.name === "finish_ai_request").length, 2);
  const failed = fixture({ providerFailure: true }), response = await failed.handler(request());
  assertEquals(response.status, 502);
  assert(!(await response.text()).includes("private-provider-text"));
  assertEquals(failed.calls.at(-1)?.args.p_status, "uncertain");
});
Deno.test("receipt lookup remains scoped and saved feedback survives quota outages", async () => {
  const f = fixture({ disabled: true });
  const response = await f.handler(new Request(`https://example.test/sat-practice/tutor/explain?action=result&request_id=${requestId}`, { headers: { Authorization: "Bearer owned-token" } }));
  assertEquals(response.status, 200);
  assertEquals((await response.json()).data, advice);
  const query = f.queries.find(row => row.table === "ai_request_ledger")!;
  assertEquals(query.filters, { user_id: actor, service: "sat-tutor", request_id: requestId });
  assertEquals(f.generated(), 0);
  const outage = fixture({ queryFailure: true });
  const saved = await outage.handler(request());
  assertEquals(saved.status, 200);
  assertEquals((await saved.json()).quota, null);
});
Deno.test("missing request IDs, oversized bodies and unauthorized callers do not dispatch", async () => {
  const f = fixture();
  assertEquals((await f.handler(request({ request_id: undefined }))).status, 400);
  assertEquals((await f.handler(request({ arbitrary: "a".repeat(100001) }))).status, 413);
  assertEquals((await f.handler(new Request("https://example.test/sat-practice/tutor/explain"))).status, 401);
  assertEquals(f.generated(), 0);
  assertEquals(f.calls.length, 0);
});
Deno.test("feedback rejects fabricated schemas and strips unrelated provider fields", () => {
  assertEquals(tutorFeedback({ ...advice, private_provider_field: "discard" }, "explain"), advice);
  for (const raw of [null, [], { ...advice, steps: [] }, { ...advice, steps: ["a".repeat(1201)] }, { ...advice, key_concept: 1 }, { ...advice, why_distractors_wrong: { constructor: "unsafe" } }]) assertThrows(() => tutorFeedback(raw, "explain"));
  assertThrows(() => tutorFeedback(advice, "similar"));
  const similar = { prompt: "An example", choices: ["A", "B", "C", "D"].map(id => ({ id, text: id + " choice" })), correct_choice: "B", explanation: "Why B works" };
  assertEquals(tutorFeedback({ ...advice, similar_question: similar }, "similar").similar_question, similar);
  assertThrows(() => tutorFeedback({ ...advice, similar_question: { ...similar, correct_choice: "Z" } }, "similar"));
  assertThrows(() => tutorFeedback({ ...advice, similar_question: { ...similar, choices: similar.choices.map(() => similar.choices[0]) } }, "similar"));
  for (const mode of ["explain", "simpler", "why-wrong"] as TutorMode[]) assertEquals(tutorFeedback({ ...advice, similar_question: similar }, mode), advice);
});
