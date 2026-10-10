import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createWritingTutorHandler } from "./handler.ts";
import {
  boundedJson,
  createWritingGrader,
  writingFeedback,
  writingInput,
} from "./grading.ts";
import { resolveWritingAllowance } from "./allowance.ts";

const id = "11111111-1111-4111-8111-111111111111",
  lease = "22222222-2222-4222-8222-222222222222";
const body = {
  request_id: id,
  essay: "A carefully written practice essay about learning. ".repeat(8),
  prompt: "Discuss the benefits of learning a second language.",
  exam_type: "ielts",
  task_type: "task2",
};
const raw = {
  overall_band: 6.5,
  criteria: { TR: 6, CC: 7, LR: 6, GRA: 7 },
  strengths: ["Clear position"],
  improvements: ["More detail"],
  actionable_feedback: ["Add an example"],
  feedback: "Develop your supporting examples.",
  word_count_comment: "Enough words.",
};
const feedback = writingFeedback(raw, writingInput(body), "test-model", 100);
const saved = {
  ...feedback,
  session_id: lease,
  graded_at: "2026-10-03T12:00:00Z",
};
const policy = {
  limit: 2,
  paid: false,
  addonAvailable: false,
  serviceLimit: 100,
  enabled: true,
};
function fixture(
  options: {
    status?: string;
    replay?: boolean;
    saveFailures?: number;
    providerFailure?: boolean;
    queryFailure?: boolean;
    authFailure?: boolean;
    started?: boolean;
  } = {},
) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  let generated = 0, saves = 0;
  const query = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return Promise.resolve({
        data: [],
        error: options.queryFailure ? new Error("private-db-error") : null,
      });
    },
    maybeSingle() {
      return Promise.resolve({
        data: { charged: 1, attempts: 1 },
        error: options.queryFailure ? new Error("private-db-error") : null,
      });
    },
  };
  const client = {
    from: () => query,
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "reserve_ai_request") {
        return {
          data: {
            status: options.status ?? "reserved",
            replay: options.replay ?? false,
            lease_token: lease,
            result: saved,
          },
          error: null,
        };
      }
      if (name === "begin_ai_request") {
        return {
          data: options.started ?? true,
          error: null,
        };
      }
      if (name === "complete_writing_tutor_request") {
        return ++saves <= (options.saveFailures ?? 0)
          ? { data: null, error: new Error("lost acknowledgement") }
          : { data: saved, error: null };
      }
      return { data: true, error: null };
    },
  } as unknown as SupabaseClient;
  const handler = createWritingTutorHandler({
    client,
    authenticate: async () => {
      if (options.authFailure) throw new Error("auth outage");
      return id;
    },
    allowance: async () => policy,
    generate: async () => {
      generated++;
      if (options.providerFailure) throw new Error("private-provider-error");
      return feedback;
    },
  });
  return { handler, calls, generated: () => generated };
}
const request = (value: unknown = body) =>
  new Request("https://test.invalid/writing-tutor", {
    method: "POST",
    headers: { Authorization: "Bearer test" },
    body: JSON.stringify(value),
  });
Deno.test("writing dispatch requires a fresh reservation and successful begin", async () => {
  for (
    const status of [
      "user_limit",
      "service_limit",
      "conflict",
      "started",
      "uncertain",
      "cancelled",
    ]
  ) {
    const f = fixture({ status });
    const response = await f.handler(request());
    assertEquals(response.ok, false);
    assertEquals(f.generated(), 0);
  }
  for (const options of [{ replay: true }, { started: false }]) {
    const f = fixture(options);
    assertEquals((await f.handler(request())).status, 409);
    assertEquals(f.generated(), 0);
  }
});
Deno.test("cached writing success never dispatches again", async () => {
  const f = fixture({ status: "succeeded", replay: true });
  const response = await f.handler(request());
  assertEquals(response.status, 200);
  assertEquals((await response.json()).session_id, lease);
  assertEquals(f.generated(), 0);
  assertEquals(f.calls.length, 1);
});
Deno.test("lost save acknowledgement retries only the atomic completion command", async () => {
  const f = fixture({ saveFailures: 1 });
  const response = await f.handler(request());
  assertEquals(response.status, 200);
  assertEquals(f.generated(), 1);
  assertEquals(f.calls.map((c) => c.name), [
    "reserve_ai_request",
    "begin_ai_request",
    "complete_writing_tutor_request",
    "complete_writing_tutor_request",
  ]);
  assertEquals(f.calls[2].args, f.calls[3].args);
  assertEquals(f.calls[0].args.p_user_id, id);
  assertEquals(f.calls[0].args.p_user_limit, 2);
});
Deno.test("failed persistence cannot return success; uncertain provider is never retried", async () => {
  for (const options of [{ saveFailures: 2 }, { providerFailure: true }]) {
    const f = fixture(options);
    const response = await f.handler(request());
    assertEquals(response.ok, false);
    assertEquals(f.generated(), 1);
    assertEquals(f.calls.at(-1)?.args.p_status, "uncertain");
    assertEquals((await response.text()).includes("private-"), false);
  }
});
Deno.test("quota outage does not erase confirmed feedback, but history outage is explicit", async () => {
  const f = fixture({ queryFailure: true });
  const response = await f.handler(request());
  assertEquals(response.status, 200);
  assertEquals((await response.json()).quota, null);
  assertEquals(
    (await f.handler(
      new Request("https://test.invalid/?action=history", {
        headers: { Authorization: "Bearer test" },
      }),
    )).status,
    503,
  );
});
Deno.test("invalid inputs and auth outage never reserve allowance", async () => {
  for (
    const value of [
      { ...body, request_id: undefined },
      { ...body, prompt: "" },
      { ...body, essay: "x".repeat(20001) },
      { ...body, essay: "x".repeat(100001) },
    ]
  ) {
    const f = fixture();
    assertEquals((await f.handler(request(value))).ok, false);
    assertEquals(f.calls.length, 0);
  }
  const f = fixture({ authFailure: true });
  assertEquals((await f.handler(request())).status, 503);
  assertEquals(f.calls.length, 0);
});
Deno.test("provider score and advice validation rejects malformed feedback and truncated output", async () => {
  for (
    const patch of [
      { overall_band: 9.5 },
      { overall_band: 6.2 },
      { criteria: { TR: 6, CC: 7, LR: 6, GRA: 10 } },
      { strengths: [{}] },
      { feedback: "x".repeat(8001) },
    ]
  ) {
    assertThrows(() =>
      writingFeedback({ ...raw, ...patch }, writingInput(body), "test", 0)
    );
  }
  assertThrows(() =>
    writingFeedback(
      { ...raw, overall_band: 7 },
      writingInput({ ...body, exam_type: "itep" }),
      "test",
      0,
    )
  );
  const checked = writingFeedback(
    { ...raw, secret: "discard" },
    writingInput(body),
    "test",
    0,
  );
  assertEquals("secret" in checked, false);
  await assertRejects(
    () => boundedJson(new Response('"' + "x".repeat(100) + '"'), 50),
    Error,
    "body_too_large",
  );
  let calls = 0;
  const grader = createWritingGrader(
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
      assertEquals(sent.stream, false);
      assertEquals(Boolean(init?.signal), true);
      return Promise.resolve(
        Response.json({
          choices: [{
            finish_reason: "length",
            message: { content: JSON.stringify(raw) },
          }],
        }),
      );
    }) as typeof fetch,
  );
  await assertRejects(() => grader(writingInput(body)));
  assertEquals(calls, 1);
});
Deno.test("only the configured active AI add-on grants higher allowance", async () => {
  const clientFor = (status: string) =>
    ({
      from: () => ({
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => ({ data: { id, status }, error: null }),
      }),
    }) as unknown as SupabaseClient;
  const config = {
    client: clientFor("active"),
    base: "https://test.invalid",
    anon: "public-test",
    addonId: id,
    serviceLimit: 100,
    providerConfigured: true,
  };
  for (
    const [products, limit] of [[[lease], 2], [[id], 20], [[], 2]] as [
      string[],
      number,
    ][]
  ) {
    const result = await resolveWritingAllowance(
      config,
      "test",
      (() =>
        Promise.resolve(
          Response.json({ effective_product_ids: products }),
        )) as typeof fetch,
    );
    assertEquals(result.limit, limit);
    assertEquals(result.paid, limit === 20);
  }
  const never = (() => {
    throw new Error("unexpected access query");
  }) as typeof fetch;
  assertEquals(
    (await resolveWritingAllowance({ ...config, addonId: "" }, "test", never))
      .limit,
    2,
  );
  assertEquals(
    (await resolveWritingAllowance(
      { ...config, client: clientFor("archived") },
      "test",
      never,
    )).limit,
    2,
  );
  await assertRejects(() =>
    resolveWritingAllowance(
      config,
      "test",
      (() =>
        Promise.resolve(new Response("", { status: 503 }))) as typeof fetch,
    )
  );
});
Deno.test("AI add-on verification rejects malformed and oversized access responses", async () => {
  const client = {
    from: () => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle: async () => ({
        data: { id, status: "active" },
        error: null,
      }),
    }),
  } as unknown as SupabaseClient;
  const config = {
    client,
    base: "https://test.invalid",
    anon: "public-test",
    addonId: id,
    serviceLimit: 100,
    providerConfigured: true,
  };
  for (
    const access of [{ effective_product_ids: [id, 42] }, {
      effective_product_ids: id,
    }, { effective_product_ids: [id], padding: "x".repeat(65536) }]
  ) {
    await assertRejects(() =>
      resolveWritingAllowance(
        config,
        "test",
        (() => Promise.resolve(Response.json(access))) as typeof fetch,
      )
    );
  }
});
