import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createSpeakingCoachHandler } from "./handler.ts";
import {
  createSpeakingGrader,
  speakingFeedback,
  speakingInput,
} from "./grading.ts";
const actor = "11111111-1111-4111-8111-111111111111",
  lease = "22222222-2222-4222-8222-222222222222";
const body = {
  request_id: actor,
  transcript: "This is a carefully prepared transcript about my hometown.",
  topic: "Describe your hometown.",
  task_type: "part1",
  duration_secs: null,
};
const raw = {
  observations: {
    coherence: "Connected ideas",
    vocabulary: "Specific nouns",
    grammar: "Consistent tense",
  },
  strengths: ["A clear example"],
  improvements: ["Explain your reasons"],
  feedback: "Develop your example.",
};
const feedback = speakingFeedback(raw, speakingInput(body), "synthetic");
function fixture(status = "reserved", failSave = 0) {
  let generated = 0, completed = 0;
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const filters: unknown[][] = [];
  const query = {
    select() {
      return this;
    },
    eq(...args: unknown[]) {
      filters.push(args);
      return this;
    },
    order() {
      return this;
    },
    limit: async () => ({
      data: [{
        id: lease,
        assessment_scope: "legacy_unverified",
        overall_band: 9,
        criteria: { P: 9 },
      }],
      error: null,
    }),
    maybeSingle: async () => ({
      data: { charged: 1, attempts: 1 },
      error: null,
    }),
  };
  const client = {
    from: () => query,
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "reserve_ai_request") {
        return {
          data: {
            status,
            lease_token: lease,
            replay: status !== "reserved",
            result: { ...feedback, session_id: lease },
          },
          error: null,
        };
      }
      if (name === "begin_ai_request") return { data: true, error: null };
      if (name === "complete_speaking_coach_request") {
        return ++completed <= failSave
          ? { data: null, error: new Error("private-db-error") }
          : { data: { ...feedback, session_id: lease }, error: null };
      }
      return { data: true, error: null };
    },
  } as unknown as SupabaseClient;
  return {
    calls,
    filters,
    generated: () => generated,
    handler: createSpeakingCoachHandler({
      client,
      authenticate: async () => actor,
      allowance: async () => ({
        limit: 2,
        paid: false,
        addonAvailable: false,
        serviceLimit: 100,
        enabled: true,
      }),
      generate: async () => {
        generated++;
        return feedback;
      },
    }),
  };
}
const request = (value: unknown = body) =>
  new Request("https://test.invalid/?action=score", {
    method: "POST",
    headers: { Authorization: "Bearer synthetic" },
    body: JSON.stringify(value),
  });
Deno.test("speaking dispatch uses its own ledger scope and atomically saves the transcript", async () => {
  const f = fixture("reserved", 1);
  const response = await f.handler(request());
  const data = await response.json();
  assertEquals(response.status, 200);
  assertEquals(data.overall_band, null);
  assertEquals(data.criteria, null);
  assertEquals(data.assessment_scope, "transcript_only");
  assertEquals(f.generated(), 1);
  assertEquals(f.calls[0].args.p_service, "speaking-coach");
  assertEquals(f.calls[1].args.p_service, "speaking-coach");
  assertEquals(f.calls[2].args.p_transcript, body.transcript);
  assertEquals(f.calls[2], f.calls[3]);
});
Deno.test("speaking duplicate, pending and denied requests never call the provider", async () => {
  for (
    const status of [
      "succeeded",
      "started",
      "uncertain",
      "user_limit",
      "service_limit",
      "conflict",
    ]
  ) {
    const f = fixture(status);
    const response = await f.handler(request());
    assertEquals(f.generated(), 0);
    assertEquals(response.ok, status === "succeeded");
  }
});
Deno.test("speaking failed persistence remains unconfirmed and does not leak errors", async () => {
  const f = fixture("reserved", 2);
  const response = await f.handler(request());
  assertEquals(response.status, 503);
  assertEquals(f.generated(), 1);
  assertEquals(f.calls.at(-1)?.args.p_status, "uncertain");
  assertEquals((await response.text()).includes("private-db-error"), false);
});
Deno.test("speaking history is actor-scoped and removes legacy audio scores", async () => {
  const f = fixture();
  const response = await f.handler(
    new Request("https://test.invalid/?action=history", {
      headers: { Authorization: "Bearer test" },
    }),
  );
  const data = await response.json();
  assertEquals(data.sessions[0].overall_band, null);
  assertEquals(data.sessions[0].criteria, null);
  assertEquals(f.filters, [["user_id", actor]]);
});
Deno.test("speaking rejects unsupported inputs and audio claims", () => {
  for (
    const patch of [
      { transcript: "x".repeat(20001) },
      { topic: "" },
      { task_type: "exam" },
      { duration_secs: 901 },
      { duration_secs: 1.2 },
    ]
  ) assertThrows(() => speakingInput({ ...body, ...patch }));
  for (
    const patch of [
      { overall_band: 8 },
      { criteria: { P: 8 } },
      { observations: { ...raw.observations, pronunciation: "clear" } },
      { feedback: "" },
      { strengths: [3] },
    ]
  ) {
    assertThrows(() =>
      speakingFeedback({ ...raw, ...patch }, speakingInput(body), "synthetic")
    );
  }
});
Deno.test("speaking provider is bounded, transcript-only, validated and called once", async () => {
  let calls = 0;
  const grader = createSpeakingGrader(
    {
      key: "synthetic",
      model: "test",
      baseUrl: "https://test.invalid",
      referer: "https://test.invalid",
    },
    ((_url, init) => {
      calls++;
      const sent = JSON.parse(String(init?.body));
      assertEquals(sent.max_tokens, 1800);
      assertEquals(Boolean(init?.signal), true);
      assertEquals(
        sent.messages[0].content.includes("There is no audio"),
        true,
      );
      return Promise.resolve(
        Response.json({
          choices: [{
            finish_reason: "stop",
            message: { content: JSON.stringify({ ...raw, overall_band: 8 }) },
          }],
        }),
      );
    }) as typeof fetch,
  );
  await assertRejects(
    () => grader(speakingInput(body)),
    Error,
    "unsupported_audio_assessment",
  );
  assertEquals(calls, 1);
});
