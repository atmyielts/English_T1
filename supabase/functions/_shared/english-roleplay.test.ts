import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  basicFinish,
  buildTurnRequest,
  cleanLearnerText,
  decideRoleplayStart,
  issuesFromRoleplay,
  parseFinishOutput,
  parseTurnOutput,
  partnerLevel,
  publicScenario,
  ROLEPLAY_MAX_TURNS,
  ROLEPLAY_SCENARIOS,
  ROLEPLAY_SESSIONS_PER_DAY,
  roleplayScenario,
  roleplayScore,
} from "./english-roleplay.ts";
import { CEFR_ORDER } from "./english-today.ts";

Deno.test("scenario data is complete and valid", () => {
  assertEquals(ROLEPLAY_SCENARIOS.length, 12);
  const ids = new Set<string>();
  for (const scenario of ROLEPLAY_SCENARIOS) {
    assert(/^[a-z0-9-]{2,64}$/.test(scenario.id), scenario.id);
    assert(!ids.has(scenario.id), `duplicate ${scenario.id}`);
    ids.add(scenario.id);
    const [low, high] = scenario.levels;
    assert(CEFR_ORDER.indexOf(low) <= CEFR_ORDER.indexOf(high), `${scenario.id} level band`);
    assert(scenario.goals.length >= 3 && scenario.goals.length <= 4, `${scenario.id} has ${scenario.goals.length} goals`);
    assertEquals(new Set(scenario.goals.map((goal) => goal.id)).size, scenario.goals.length, `${scenario.id} goal ids`);
    assert(scenario.phrases.length >= 4, `${scenario.id} phrases`);
    assert(scenario.opening.length > 5 && scenario.brief.length > 30 && scenario.partner.name && scenario.partner.role);
    for (const lang of ["en", "ru", "uz"] as const) {
      for (const text of [scenario.title[lang], scenario.situation[lang], scenario.role_card[lang], ...scenario.goals.map((goal) => goal.text[lang])]) {
        assert(text.trim().length > 2, `${scenario.id} ${lang} text`);
      }
    }
    for (const text of [scenario.title.ru, scenario.situation.ru, ...scenario.phrases.map((phrase) => phrase.ru)]) {
      assert(/[а-яё]/i.test(text), `${scenario.id} Russian should be Cyrillic: ${text}`);
    }
    for (const text of [scenario.title.uz, scenario.situation.uz, scenario.role_card.uz, ...scenario.goals.map((goal) => goal.text.uz), ...scenario.phrases.map((phrase) => phrase.uz)]) {
      assert(!/[og]'/i.test(text), `${scenario.id} Uzbek must use ʻ: ${text}`);
    }
  }
  for (const id of ["visa-interview", "job-interview", "university-interview", "hotel-check-in", "airport-immigration", "doctor-visit", "market-shopping", "cafe-order", "landlord-call", "new-colleague", "ielts-part1", "complaint"]) {
    assert(roleplayScenario(id), `missing ${id}`);
  }
});

Deno.test("public scenario is localized and keeps English phrases", () => {
  const scenario = roleplayScenario("cafe-order")!;
  const ru = publicScenario(scenario, "ru");
  assertEquals(ru.title, scenario.title.ru);
  assertEquals(ru.phrases[0], { en: scenario.phrases[0]!.en, meaning: scenario.phrases[0]!.ru });
  assertEquals(publicScenario(scenario, "en").phrases[0]!.meaning, null);
  // The partner's instructions never go to the learner.
  assert(!("brief" in ru));
});

Deno.test("partner level stays inside the scenario band", () => {
  const cafe = roleplayScenario("cafe-order")!; // A1–A2
  assertEquals(partnerLevel(cafe, "C1"), "A2");
  assertEquals(partnerLevel(cafe, "A1"), "A1");
  assertEquals(partnerLevel(cafe, null), "A1");
  const uni = roleplayScenario("university-interview")!; // B1–C1
  assertEquals(partnerLevel(uni, "B2"), "B2");
  assertEquals(partnerLevel(uni, "A2"), "B1");
});

Deno.test("start decision: Speaking owners up to the daily cap, others one free session", () => {
  assertEquals(decideRoleplayStart({ admin: false, entitled: true, freeLeft: 0, sessionsToday: 0, freeSessionsToday: 0 }), { allowed: true, basis: "entitled" });
  assertEquals(decideRoleplayStart({ admin: false, entitled: true, freeLeft: 0, sessionsToday: ROLEPLAY_SESSIONS_PER_DAY, freeSessionsToday: 0 }).allowed, false);
  assertEquals(decideRoleplayStart({ admin: true, entitled: false, freeLeft: 0, sessionsToday: 3, freeSessionsToday: 0 }), { allowed: true, basis: "admin" });
  assertEquals(decideRoleplayStart({ admin: false, entitled: false, freeLeft: 1, sessionsToday: 0, freeSessionsToday: 0 }), { allowed: true, basis: "free" });
  // An abandoned free session still uses the day's free role-play.
  assertEquals(decideRoleplayStart({ admin: false, entitled: false, freeLeft: 1, sessionsToday: 1, freeSessionsToday: 1 }), { allowed: false, code: "english_free_limit_reached" });
  assertEquals(decideRoleplayStart({ admin: false, entitled: false, freeLeft: 0, sessionsToday: 0, freeSessionsToday: 0 }), { allowed: false, code: "english_free_limit_reached" });
  assert(ROLEPLAY_MAX_TURNS >= 6 && ROLEPLAY_MAX_TURNS <= 12);
});

Deno.test("learner text is cleaned and bounded", () => {
  assertEquals(cleanLearnerText("  Hello,   I'd like a   coffee "), "Hello, I'd like a coffee");
  assertEquals(cleanLearnerText("   "), null);
  assertEquals(cleanLearnerText("12345 !!!"), null);
  assertEquals(cleanLearnerText("a".repeat(900))!.length, 500);
});

Deno.test("turn prompt carries the persona, level and goals, history bounded", () => {
  const scenario = roleplayScenario("hotel-check-in")!;
  const history = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "learner" as const : "partner" as const, text: `line ${i}` }));
  const request = buildTurnRequest(scenario, "A2", history, "Hi, I have a booking");
  assert(request.systemPrompt.includes(scenario.partner.role));
  assert(request.systemPrompt.includes("A2"));
  for (const goal of scenario.goals) assert(request.systemPrompt.includes(goal.id));
  const payload = JSON.parse(request.userPayload);
  assertEquals(payload.conversation.length, 16);
  assertEquals(payload.learner_says, "Hi, I have a booking");
});

Deno.test("turn output validation keeps only real goals and real quotes", () => {
  const scenario = roleplayScenario("cafe-order")!;
  const said = "I want two coffee and one cake";
  const turn = parseTurnOutput({
    reply: "  Sure! Small or large?  ",
    goals_met: ["order", "made-up", "order"],
    tip: { said: "two coffee", better: "two coffees" },
    end: "yes",
  }, scenario, said);
  assertEquals(turn, { reply: "Sure! Small or large?", goals_met: ["order"], tip: { said: "two coffee", better: "two coffees" }, end: false });
  // A tip that doesn't quote the learner is dropped.
  assertEquals(parseTurnOutput({ reply: "OK.", tip: { said: "I goed", better: "I went" } }, scenario, said)?.tip, null);
  // Unusable output.
  assertEquals(parseTurnOutput(null, scenario, said), null);
  assertEquals(parseTurnOutput({ reply: "" }, scenario, said), null);
  assertEquals(parseTurnOutput(["reply"], scenario, said), null);
  assertEquals(parseTurnOutput({ reply: "x".repeat(900) }, scenario, said)?.reply.length, 400);
});

Deno.test("finish output: tracked goals stay met, fixes must quote the learner, phrases filled from the scenario", () => {
  const scenario = roleplayScenario("cafe-order")!;
  const learner = "Hello. I want a cappuccino big.\nHow much it costs?";
  const result = parseFinishOutput({
    goals: [{ id: "order", achieved: true, note: "Clear order." }, { id: "details", achieved: false }, { id: "pay", achieved: false }],
    fixes: [
      { said: "a cappuccino big", better: "a large cappuccino", why: "Adjective before the noun." },
      { said: "How much it costs", better: "How much does it cost", why: "Questions need does." },
      { said: "I goed there", better: "I went there", why: "Invented." },
      { said: "Hello", better: "Hello", why: "No change." },
    ],
    phrases: ["Could I get it to go?", { phrase: "Can I pay by card?" }, "<script>alert(1)</script>"],
    summary: "Nice ordering!",
    score: 140,
  }, scenario, learner, ["pay"])!;
  assertEquals(result.source, "ai");
  assertEquals(result.goals.map((goal) => goal.achieved), [true, false, true]);
  assertEquals(result.goals_met, 2);
  assertEquals(result.fixes.map((fix) => fix.said), ["a cappuccino big", "How much it costs"]);
  assertEquals(result.fixes[1]!.l1, "question-do");
  assert(result.phrases.length <= 5 && result.phrases.length >= 3);
  assertEquals(result.phrases[0], { en: "Could I get it to go?", meaning: null });
  assert(!result.phrases.some((phrase) => phrase.en.includes("<")));
  // "Can I pay by card?" came from the model and the scenario: listed once.
  assertEquals(result.phrases.filter((phrase) => phrase.en === "Can I pay by card?").length, 1);
  assertEquals(result.score, roleplayScore(2, 3, 100));
  assertEquals(parseFinishOutput({ fixes: [] }, scenario, learner, []), null);
});

Deno.test("basic finish and issues without AI", () => {
  const scenario = roleplayScenario("market-shopping")!;
  const result = basicFinish(scenario, ["ask", "price"], [{ said: "much apples", better: "many apples" }], "I want much apples. How much is it?");
  assertEquals(result.source, "basic");
  assertEquals(result.goals_met, 2);
  assertEquals(result.fixes[0]!.l1, "many-much");
  // The phrase the learner already used is not offered again.
  assert(!result.phrases.some((phrase) => phrase.en === "How much is it?"));
  assertEquals(result.score, 67);
  const issues = issuesFromRoleplay(result, scenario.id);
  assertEquals(issues.length, 2);
  assertEquals(issues[0]!.subskill_key, "grammar.quantifiers");
  assertEquals(issues[1]!.subskill_key, "speaking.task_completion");
});
