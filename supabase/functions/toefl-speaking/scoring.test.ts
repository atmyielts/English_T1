import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createOpenRouterInterviewRater, parseInterviewRating, scoreSpeakingItems } from "./scoring.ts";

Deno.test("speaking items: repeat by transcript, interview by rater, missing STT is unscored", async () => {
  const rater = () => Promise.resolve([{ content_unit_id: "i1", score: 4.6, feedback: "Good detail." }]);
  const out = await scoreSpeakingItems([
    { content_unit_id: "r1", type: "question_speaking_repeat", reference: "We have a variety of wildlife.", response: { transcript: "we have a variety of wildlife", stt: "browser" } },
    { content_unit_id: "r2", type: "question_speaking_repeat", reference: "Bears are to the right.", response: { transcript: "", stt: "unsupported" } },
    { content_unit_id: "r3", type: "question_speaking_repeat", reference: "Bears are to the right.", response: undefined },
    { content_unit_id: "i1", type: "question_speaking_interview", reference: "Why did you travel?", response: { transcript: "I travelled to see my family", stt: "browser" } },
    { content_unit_id: "i2", type: "question_speaking_interview", reference: "Why?", response: { transcript: "", stt: "browser" } },
  ], rater);
  assertEquals(out.unscored, ["r2"]);
  const by = Object.fromEntries(out.items.map((i) => [i.content_unit_id, [i.score, i.source]]));
  assertEquals(by.r1, [5, "transcript_match"]);
  assertEquals(by.r3, [0, "transcript_match"]);
  assertEquals(by.i1, [5, "ai"]);
  assertEquals(by.i2, [0, "basic"]);
  assertEquals(out.ai_used, true);
});

Deno.test("rater failures fall back to the basic estimate", async () => {
  const out = await scoreSpeakingItems([
    { content_unit_id: "i1", type: "question_speaking_interview", reference: "Tell me about cities.", response: { transcript: "cities are busy", stt: "browser" } },
  ], () => Promise.reject(new Error("down")));
  assertEquals(out.items[0].source, "basic");
  assertEquals(out.ai_used, false);
});

Deno.test("rating parser keeps only known ids and clamps scores", () => {
  assertEquals(parseInterviewRating({ items: [{ content_unit_id: "a", score: 9, feedback: "x" }, { content_unit_id: "z", score: 3 }] }, ["a"]),
    [{ content_unit_id: "a", score: 5, feedback: "x" }]);
  assertEquals(parseInterviewRating({ nope: 1 }, ["a"]), null);
});

Deno.test("OpenRouter rater uses the given model and parses JSON from the reply", async () => {
  let seenModel = "";
  const fetcher = ((_url: string, init: RequestInit) => {
    seenModel = JSON.parse(String(init.body)).model;
    return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: 'Here: {"items":[{"content_unit_id":"a","score":3,"feedback":"ok"}]}' } }] })));
  }) as unknown as typeof fetch;
  const rater = createOpenRouterInterviewRater({ apiKey: "k", models: ["google/gemma-4-31b-it:free"], baseUrl: "https://x.test/v1", fetcher });
  assertEquals(await rater([{ content_unit_id: "a", question: "q", transcript: "t" }]), [{ content_unit_id: "a", score: 3, feedback: "ok" }]);
  assertEquals(seenModel, "google/gemma-4-31b-it:free");
});
