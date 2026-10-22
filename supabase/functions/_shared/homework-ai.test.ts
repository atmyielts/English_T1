import { assertEquals, assertMatch, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildPremarkMessages, callPremarkModel, normalizeTag, parsePremark, type PremarkInput, PremarkError, resolvePremarkModel,
} from "./homework-ai.ts";

const base: PremarkInput = {
  assignmentTitle: "Unit 5 essay", assignmentType: "writing", instructions: "Write about your city.", maxScore: 10,
  rubric: null, text: "My city are big.", imageUrls: [],
};

Deno.test("parses a plain score, clamps it to the maximum and keeps tagged mistakes", () => {
  const result = parsePremark('```json\n{"suggested_score": 14, "summary": "Good try", "strengths": ["clear"], "improvements": [], ' +
    '"mistakes": [{"tag": "Grammar Agreement!", "excerpt": "My city are", "correction": "My city is", "explanation": "singular"}, {"tag": "x"}], "confidence": 2}\n```', base);
  assertEquals(result.suggested_score, 10);
  assertEquals(result.mistakes.length, 1);
  assertEquals(result.mistakes[0].tag, "grammar_agreement");
  assertEquals(result.confidence, 1);
});

Deno.test("with a rubric the score is the sum of bounded criterion scores", () => {
  const input = { ...base, maxScore: 8, rubric: [{ id: "tr", title: "Task", max: 4 }, { id: "gra", title: "Grammar", max: 4 }] };
  const result = parsePremark({ suggested_score: 99, rubric_scores: { tr: 3.4, gra: 9 }, summary: "", mistakes: [] }, input);
  assertEquals(result.rubric_scores, { tr: 3.5, gra: 4 });
  assertEquals(result.suggested_score, 7.5);
  assertEquals((assertThrows(() => parsePremark({ rubric_scores: { tr: 1 } }, input), PremarkError) as PremarkError).code, "missing_rubric_score");
});

Deno.test("rejects output that is not JSON", () => {
  assertThrows(() => parsePremark("I think this is a 7", base), PremarkError, "invalid_json");
});

Deno.test("refuses paid models unless explicitly allowed", () => {
  const envOf = (values: Record<string, string>) => (key: string) => values[key];
  assertEquals(resolvePremarkModel(envOf({})), "google/gemma-4-31b-it:free");
  assertEquals(resolvePremarkModel(envOf({ HOMEWORK_AI_MODEL: "google/gemma-3-27b-it:free" })), "google/gemma-3-27b-it:free");
  assertEquals((assertThrows(() => resolvePremarkModel(envOf({ OPENROUTER_MODEL: "openai/gpt-4o" })), PremarkError) as PremarkError).code, "paid_model_not_allowed");
  assertEquals(resolvePremarkModel(envOf({ OPENROUTER_MODEL: "openai/gpt-4o", HOMEWORK_AI_ALLOW_PAID: "true" })), "openai/gpt-4o");
});

Deno.test("photos are sent as image parts after the task text", () => {
  const messages = buildPremarkMessages({ ...base, text: null, imageUrls: ["https://s3/a.jpg", "https://s3/b.jpg"] });
  const content = messages[1].content as Array<Record<string, unknown>>;
  assertEquals(content.length, 3);
  assertMatch(String(content[0].text), /sent 2 photo/);
  assertEquals((content[2].image_url as Record<string, unknown>).url, "https://s3/b.jpg");
});

Deno.test("a model without vision is reported so the sweep can skip photos", async () => {
  const fetcher = () => Promise.resolve(new Response('{"error":{"message":"No endpoints support image input"}}', { status: 404 }));
  await assertRejects(
    () => callPremarkModel({ ...base, imageUrls: ["https://s3/a.jpg"] }, { apiKey: "k", model: "m:free", fetcher: fetcher as typeof fetch }),
    PremarkError, "vision_unavailable");
});

Deno.test("a successful call returns the parsed draft and model", async () => {
  let sent: Record<string, unknown> = {};
  const fetcher = (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return Promise.resolve(new Response(JSON.stringify({
      model: "google/gemma-4-31b-it:free", usage: { total_tokens: 321 },
      choices: [{ message: { content: '{"suggested_score":6,"summary":"ok","mistakes":[],"confidence":0.7}' } }],
    })));
  };
  const out = await callPremarkModel(base, { apiKey: "k", model: "google/gemma-4-31b-it:free", fetcher: fetcher as typeof fetch });
  assertEquals(out.result.suggested_score, 6);
  assertEquals(out.tokens, 321);
  assertEquals((sent.response_format as Record<string, unknown>).type, "json_object");
});

Deno.test("tags are normalised to short codes", () => {
  assertEquals(normalizeTag("  Vocabulary / Word choice "), "vocabulary_word_choice");
  assertEquals(normalizeTag("?"), "general");
});
