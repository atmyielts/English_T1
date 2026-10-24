import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { aiFeatureForRoute, createEnglishAIGateway, type EnglishAIGatewayDeps, type ProviderResult } from "./english-ai.ts";
import type { EnglishAICallRecord } from "./english-ai-ledger.ts";
import { ledgerRow } from "./english-ai-ledger.ts";
import { defaultEnglishSettings, parseEnglishSettingsRows } from "./english-settings.ts";
import { createAICreditSession, callEnglishAIWithCredit, type AICreditDeps } from "./english-ai-quota.ts";

const okResult: ProviderResult = {
  data: { answer: 42 },
  provider: "openai",
  model: "gpt-4o-mini-2024-07-18",
  outputChars: 13,
  promptTokens: 120,
  completionTokens: 9,
};

const fakeDeps = (overrides: Partial<EnglishAIGatewayDeps> = {}) => {
  const records: EnglishAICallRecord[] = [];
  let calls = 0;
  let clock = 1_000;
  const deps: EnglishAIGatewayDeps = {
    isConfigured: () => true,
    loadSettings: () => Promise.resolve(defaultEnglishSettings({})),
    callProvider: () => {
      calls += 1;
      clock += 250;
      return Promise.resolve(okResult);
    },
    record: (record) => records.push(record),
    primaryProvider: () => "openai",
    primaryModel: () => "gpt-4o-mini",
    now: () => clock,
    ...overrides,
  };
  return { deps, records, calls: () => calls };
};

const request = { systemPrompt: "Be brief.", userPayload: "{\"q\":1}", feature: "tutor-chat", userId: "6f1c2a8e-1111-4222-8333-444455556666" };

Deno.test("a successful call returns the data and logs tokens, latency and sizes", async () => {
  const { deps, records } = fakeDeps();
  const result = await createEnglishAIGateway(deps)(request, { answer: 0 });
  assertEquals(result, { data: { answer: 42 }, status: "ok", provider: "openai" });
  assertEquals(records, [{
    feature: "tutor-chat",
    userId: request.userId,
    inputChars: request.systemPrompt.length + request.userPayload.length,
    status: "ok",
    provider: "openai",
    model: "gpt-4o-mini-2024-07-18",
    latencyMs: 250,
    outputChars: 13,
    promptTokens: 120,
    completionTokens: 9,
  }]);
});

Deno.test("the global switch turns every feature off without calling a provider", async () => {
  const off = parseEnglishSettingsRows([{ key: "ai", value: { enabled: false } }], defaultEnglishSettings({}));
  const { deps, records, calls } = fakeDeps({ loadSettings: () => Promise.resolve(off) });
  const result = await createEnglishAIGateway(deps)(request, "fallback");
  assertEquals(result.status, "unconfigured");
  assertEquals(result.data, "fallback");
  assertEquals(calls(), 0);
  assertEquals(records.map((record) => [record.status, record.error]), [["disabled", "ai_off"]]);
});

Deno.test("a per-feature switch only affects that feature", async () => {
  const settings = parseEnglishSettingsRows([{ key: "ai", value: { features: { "tutor-chat": false } } }], defaultEnglishSettings({}));
  const { deps, records, calls } = fakeDeps({ loadSettings: () => Promise.resolve(settings) });
  const gateway = createEnglishAIGateway(deps);
  assertEquals((await gateway(request, null)).status, "unconfigured");
  assertEquals((await gateway({ ...request, feature: "essay-grade" }, null)).status, "ok");
  assertEquals(calls(), 1);
  assertEquals(records.map((record) => `${record.feature}:${record.status}`), ["tutor-chat:disabled", "essay-grade:ok"]);
});

Deno.test("no provider key: unconfigured, logged, no provider call", async () => {
  const { deps, records, calls } = fakeDeps({ isConfigured: () => false });
  const result = await createEnglishAIGateway(deps)(request, null);
  assertEquals(result.status, "unconfigured");
  assertEquals(calls(), 0);
  assertEquals(records[0]?.status, "unconfigured");
});

Deno.test("provider errors return the fallback and are logged as failed", async () => {
  const { deps, records } = fakeDeps({ callProvider: () => Promise.reject(new Error("openai_http_500: boom")) });
  const result = await createEnglishAIGateway(deps)({ ...request, feature: undefined, userId: undefined }, []);
  assertEquals(result, { data: [], status: "failed", provider: "openai", error: "openai_http_500: boom" });
  assertEquals(records[0]?.status, "failed");
  assertEquals(records[0]?.feature, "unknown");
  assertEquals(records[0]?.userId, null);
  assertEquals(records[0]?.model, "gpt-4o-mini");
});

Deno.test("unreadable settings and a broken ledger never block the call", async () => {
  const { deps } = fakeDeps({
    loadSettings: () => Promise.reject(new Error("db down")),
    record: () => {
      throw new Error("ledger down");
    },
  });
  assertEquals((await createEnglishAIGateway(deps)(request, null)).status, "ok");
});

Deno.test("hub routes map to feature names", () => {
  assertEquals(aiFeatureForRoute("/ai/tutor-chat"), "tutor-chat");
  assertEquals(aiFeatureForRoute("/ai/dictation/generate"), "dictation-generate");
  assertEquals(aiFeatureForRoute("/insights/coach-summary"), "coach-summary");
  assertEquals(aiFeatureForRoute("/ai/"), "unknown");
});

Deno.test("ledger rows are clamped and scrubbed of keys", () => {
  const row = ledgerRow({
    feature: "Tutor-Chat",
    userId: "not-a-uuid",
    status: "failed",
    latencyMs: -5,
    promptTokens: 12.6,
    error: "openai_http_401: Incorrect API key provided: sk-proj-abcdefghijklmnop. Bearer abc.def",
  });
  assertEquals(row.feature, "tutor-chat");
  assertEquals(row.user_id, null);
  assertEquals(row.latency_ms, null);
  assertEquals(row.prompt_tokens, 13);
  assertEquals(row.error, "openai_http_401: Incorrect API key provided: [key]. Bearer [key]");
});

// --- Learner credits ---------------------------------------------------------

const creditDeps = (input: { available?: boolean; allowed?: boolean; status?: "ok" | "failed" | "unconfigured"; consumeThrows?: boolean }) => {
  const log: string[] = [];
  const deps: AICreditDeps = {
    available: () => Promise.resolve(input.available ?? true),
    consume: () => {
      log.push("consume");
      if (input.consumeThrows) return Promise.reject(new Error("rpc down"));
      return Promise.resolve({ allowed: input.allowed ?? true, remaining: 3, total: 30 });
    },
    refund: () => {
      log.push("refund");
      return Promise.resolve();
    },
    call: <T>(req: { feature?: string; userId?: string | null }, fallback: T) => {
      log.push(`call:${req.feature}:${req.userId}`);
      const status = input.status ?? "ok";
      return Promise.resolve({ data: status === "ok" ? ("answer" as unknown as T) : fallback, status, provider: "openai" as const });
    },
    record: (record) => log.push(`record:${record.status}`),
  };
  return { deps, log };
};

Deno.test("a successful call keeps its credit", async () => {
  const { deps, log } = creditDeps({});
  const session = createAICreditSession({ userId: "u1", feature: "essay-grade", deps });
  assertEquals((await session.charge())?.allowed, true);
  assertEquals((await session.call({ systemPrompt: "", userPayload: "" }, null)).status, "ok");
  assertEquals(log, ["consume", "call:essay-grade:u1"]);
});

Deno.test("a failed call gives its credit back, once", async () => {
  const { deps, log } = creditDeps({ status: "failed" });
  const session = createAICreditSession({ userId: "u1", feature: "essay-grade", deps });
  await session.charge();
  await session.call({ systemPrompt: "", userPayload: "" }, null);
  await session.call({ systemPrompt: "", userPayload: "" }, null);
  assertEquals(log, ["consume", "call:essay-grade:u1", "refund", "call:essay-grade:u1"]);
});

Deno.test("AI that is off takes no credit and refunds nothing", async () => {
  const { deps, log } = creditDeps({ available: false, status: "unconfigured" });
  const session = createAICreditSession({ userId: "u1", feature: "essay-grade", deps });
  assertEquals(await session.charge(), null);
  await session.call({ systemPrompt: "", userPayload: "" }, null);
  assertEquals(log, ["call:essay-grade:u1"]);
});

Deno.test("an empty quota is logged as over_limit and the AI is not called", async () => {
  const { deps, log } = creditDeps({ allowed: false });
  const result = await callEnglishAIWithCredit(deps, "u1", { systemPrompt: "", userPayload: "", feature: "immersion-judge" }, "basic");
  assertEquals(result.over_limit, true);
  assertEquals(result.data, "basic");
  assertEquals(log, ["consume", "record:over_limit"]);
});

Deno.test("a quota error falls back to basic feedback instead of throwing", async () => {
  const { deps, log } = creditDeps({ consumeThrows: true });
  const result = await callEnglishAIWithCredit(deps, "u1", { systemPrompt: "", userPayload: "", feature: "immersion-judge" }, "basic");
  assertEquals(result.status, "failed");
  assertEquals(result.data, "basic");
  assertEquals(log, ["consume"]);
});

Deno.test("an uncharged session never refunds, even when the call fails", async () => {
  const { deps, log } = creditDeps({ status: "failed" });
  const session = createAICreditSession({ userId: "u1", feature: "word-lookup", deps });
  await session.call({ systemPrompt: "", userPayload: "", feature: "other", userId: "u2" }, null);
  assertEquals(log, ["call:other:u2"]);
});
