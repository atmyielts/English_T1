import { assertEquals, assertRejects, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callOpenRouterJson, callOpenRouterJsonWithStatus } from "./sat-ai.ts";

const options = { systemPrompt: "Explain the question", userPayload: '{"question":"owned fixture"}', modelOverride: "fixture:free" };
// Explicitly restore the process environment; never use a real provider key.
async function withKey(run: () => Promise<void>, key: string | null = "synthetic-test-key") {
  const previous = Deno.env.get("OPENROUTER_API_KEY"), oldOpenAi = Deno.env.get("OPENAI_API_KEY");
  if (key === null) Deno.env.delete("OPENROUTER_API_KEY"); else Deno.env.set("OPENROUTER_API_KEY", key);
  Deno.env.delete("OPENAI_API_KEY");
  try { await run(); } finally {
    if (previous === undefined) Deno.env.delete("OPENROUTER_API_KEY"); else Deno.env.set("OPENROUTER_API_KEY", previous);
    if (oldOpenAi === undefined) Deno.env.delete("OPENAI_API_KEY"); else Deno.env.set("OPENAI_API_KEY", oldOpenAi);
  }
}
const response = (content: unknown) => Response.json({ choices: [{ message: { content } }] });

Deno.test("SAT provider sends one bounded explicit model request", () => withKey(async () => {
  let calls = 0;
  const result = await callOpenRouterJson(options, async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assertEquals(body.model, "fixture:free");
    assertEquals(body.max_tokens, 2048);
    assert(init?.signal instanceof AbortSignal);
    return response('{"steps":["Use the saved question"]}');
  });
  assertEquals(result, { steps: ["Use the saved question"] });
  assertEquals(calls, 1);
}));

Deno.test("unavailable models never invoke a fallback or expose provider bodies", () => withKey(async () => {
  for (const status of [400, 404, 429, 500]) {
    let calls = 0;
    const result = await callOpenRouterJsonWithStatus(options, { steps: [] }, async () => {
      calls++;
      return new Response('no endpoints: private-learner-text secret-provider-value', { status });
    });
    assertEquals(calls, 1);
    assertEquals(result.status, "failed");
    assert(!JSON.stringify(result).includes("private-learner-text"));
    assert(!JSON.stringify(result).includes("secret-provider-value"));
  }
}));

Deno.test("missing configuration does not dispatch", () => withKey(async () => {
  let calls = 0;
  const result = await callOpenRouterJsonWithStatus(options, {}, async () => { calls++; return response('{}'); });
  assertEquals(result.status, "unconfigured");
  assertEquals(calls, 0);
}, null));

Deno.test("auto routing and oversized input are rejected before dispatch", () => withKey(async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return response('{}'); };
  await assertRejects(() => callOpenRouterJson({ ...options, modelOverride: "openrouter/auto" }, fetcher));
  await assertRejects(() => callOpenRouterJson({ ...options, userPayload: "a".repeat(50001) }, fetcher));
  await assertRejects(() => callOpenRouterJson({ ...options, systemPrompt: "a".repeat(10001) }, fetcher));
  assertEquals(calls, 0);
}));

Deno.test("oversized, malformed and non-object provider responses cannot succeed", () => withKey(async () => {
  for (const content of [null, 'not json', '[]', 'null', '"string"', '9']) {
    await assertRejects(() => callOpenRouterJson(options, async () => response(content)));
  }
  await assertRejects(() => callOpenRouterJson(options, async () => new Response(" ".repeat(65537))));
}));

Deno.test("transport failures expose only recovery copy", () => withKey(async () => {
  const result = await callOpenRouterJsonWithStatus(options, {}, () => { throw new Error("private credential and prompt"); });
  assertEquals(result.status, "failed");
  assert(!JSON.stringify(result).includes("private credential"));
}));

Deno.test("free-model JSON wrapped in a fence or a sentence is accepted; arrays and prose are not", () => withKey(async () => {
  for (const content of ['```json\n{"steps":["a"]}\n```', 'Here is the JSON: {"steps":["a"]} Hope it helps.', ' {"steps":["a"]} ']) {
    assertEquals(await callOpenRouterJson(options, async () => response(content)), { steps: ["a"] });
  }
  for (const content of ['```json\n[1]\n```', 'no json here', '{broken']) {
    await assertRejects(() => callOpenRouterJson(options, async () => response(content)));
  }
}));
