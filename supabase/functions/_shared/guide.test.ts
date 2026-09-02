import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type Answers,
  type Catalog,
  changeAnswer,
  checkBank,
  copy,
  type GuideFlow,
  includedProducts,
  matches,
  nextQuestion,
  normalizeAnswers,
  type OfferRule,
  publicFlow,
  recommend,
  safeProductUrl,
  scoreCheck,
  validAnswer,
  validateFlow,
  visibleQuestions,
} from "./guide.ts";
import { createGuideDraft } from "./guide-seed.ts";
import { goalChanges, goalTarget } from "./guide-goals.ts";

const P = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const PLAN = "33333333-3333-4333-8333-333333333333";
const catalog = (): Catalog => ({
  products: [P, P2].map((id, i) => ({
    id,
    name: `Practice ${i}`,
    status: "active",
    description: "Practice",
    metadata: { app_url: "https://practice.ielts.schood.online", slug: `practice-${i}` },
  })),
  plans: [{
    id: PLAN,
    product_id: P,
    name: "30 days",
    amount: 100000,
    currency: "UZS",
    duration_days: 30,
    is_active: true,
    metadata: {},
  }],
});
const rule = (patch: Partial<OfferRule> = {}): OfferRule => ({
  ...createGuideDraft().offers[0],
  id: "learner_offer",
  priority: 100,
  kind: "plan",
  productId: P,
  planId: PLAN,
  enabled: true,
  when: { any: [{ all: [{ question: "exam", op: "is", value: "ielts" }] }] },
  ...patch,
});
function completed(flow: GuideFlow, choices: Answers = {}): Answers {
  let answers: Answers = {};
  for (let i = 0; i < 81; i++) {
    const q = nextQuestion(flow, answers);
    if (!q) return answers;
    const answer = Object.hasOwn(choices, q.id)
      ? choices[q.id]
      : !q.required
      ? null
      : q.kind === "multi"
      ? [q.options[0].id]
      : q.options[0].id;
    answers = changeAnswer(flow, answers, q.id, answer);
  }
  throw new Error("Interview did not terminate");
}

Deno.test("starter supports every audience, 206 reachable paths, maximum twelve questions", () => {
  const flow = createGuideDraft();
  const result = validateFlow(flow);
  assertEquals(result.errors, []);
  assertEquals(result.maxPath, 12);
  assertEquals(result.paths, 206);
  for (const audience of ["learner", "parent", "teacher", "center"]) {
    const answers = completed(flow, { audience });
    assertEquals(answers.audience, audience);
    assert(!nextQuestion(flow, answers));
    assert(visibleQuestions(flow, answers).length <= 12);
  }
});
Deno.test("learner, teacher and parent existing-access journeys terminate without sales questions", () => {
  const flow = createGuideDraft();
  const learner = completed(flow, { audience: "learner", access: "code" });
  assertEquals(Object.keys(learner).length, 2);
  assertEquals(recommend(flow, learner, catalog()).primary?.href, "/redeem");
  const parent = completed(flow, { audience: "parent", parent_intent: "progress" });
  assertEquals(Object.keys(parent).length, 2);
  assertEquals(recommend(flow, parent, catalog()).primary?.href, "/contact");
  assertEquals(checkBank(parent), null);
  const teacher = completed(flow, { audience: "teacher", teacher_setup: "invite" });
  assertEquals(recommend(flow, teacher, catalog()).primary?.href, "/academy/teacher");
  assertEquals(checkBank(teacher), null);
});
Deno.test("unknown exam asks purpose but does not invent a level or force a skills check", () => {
  const answers = completed(createGuideDraft(), {
    audience: "learner",
    access: "new",
    exam: "unsure",
    purpose: "study",
  });
  assertEquals(answers.purpose, "study");
  assertEquals(answers.level, undefined);
  assertEquals(checkBank(answers), null);
});
Deno.test("exam and writing answers reveal only the appropriate follow-up", () => {
  const flow = createGuideDraft();
  const answers = completed(flow, { exam: "ielts", difficulty: ["writing"], writing_obstacle: "feedback" });
  assertEquals(answers.writing_obstacle, "feedback");
  assertEquals(answers.math_obstacle, undefined);
});
Deno.test("changing an ancestor invalidates its descendants even when they remain visible", () => {
  const flow = createGuideDraft();
  const answers = completed(flow, { exam: "ielts", difficulty: ["writing"], writing_obstacle: "feedback" });
  const changed = changeAnswer(flow, answers, "exam", "sat");
  assertEquals(changed.writing_obstacle, undefined);
  assertEquals(changed.target_ielts, undefined);
  assertEquals(changed.level, undefined);
  assertEquals(nextQuestion(flow, changed)?.id, "target_sat");
});
Deno.test("hidden and forged answers are dropped rather than stored", () => {
  const flow = createGuideDraft();
  const answers = normalizeAnswers(flow, {
    audience: "teacher",
    target_ielts: 8,
    admin_role: "admin",
    center_context: "existing",
  });
  assertEquals(answers, { audience: "teacher" });
});
Deno.test("answer validation bounds numbers, selection count and real calendar dates", () => {
  const flow = createGuideDraft();
  const score = flow.questions.find((q) => q.id === "target_ielts")!;
  assert(validAnswer(score, 7.5));
  assert(validAnswer(score, null));
  assert(!validAnswer(score, Infinity));
  assert(!validAnswer(score, 10));
  assert(!validAnswer(score, "7"));
  const date = flow.questions.find((q) => q.id === "deadline")!;
  assert(validAnswer(date, "2028-02-29"));
  assert(!validAnswer(date, "2027-02-29"));
  assert(!validAnswer(date, "tomorrow"));
  const multi = flow.questions.find((q) => q.id === "difficulty")!;
  assert(!validAnswer(multi, ["reading", "reading"]));
  assert(!validAnswer(multi, ["reading", "writing", "math"]));
  assertThrows(() => changeAnswer(flow, {}, "audience", "admin"));
});
Deno.test("condition builder uses OR groups, AND comparisons, and unknown does not mean not", () => {
  const condition = {
    any: [{
      all: [{ question: "score", op: "gte" as const, value: 5 }, {
        question: "skills",
        op: "has" as const,
        value: "writing",
      }],
    }, { all: [{ question: "kind", op: "is" as const, value: "center" }] }],
  };
  assert(matches(condition, { score: 6, skills: ["writing"] }));
  assert(matches(condition, { kind: "center" }));
  assert(!matches(condition, { score: 6, skills: ["reading"] }));
  assert(!matches({ any: [{ all: [{ question: "missing", op: "not", value: "yes" }] }] }, {}));
});
Deno.test("public projection contains no answer key, explanation, unpublished checks, or offer engine", () => {
  const flow = createGuideDraft();
  flow.checks[0].reviewed = false;
  const visible = publicFlow(flow);
  assertEquals(visible.offers, []);
  assertEquals(visible.checks.length, 11);
  const json = JSON.stringify(visible);
  assert(!json.includes("correctOption"));
  assert(!json.includes("explanation"));
  assert(!json.includes("learner_offer"));
});
Deno.test("skipped audio reduces coverage without becoming an incorrect answer", () => {
  const flow = createGuideDraft();
  const answers = completed(flow);
  const responses = Object.fromEntries(
    flow.checks.filter((q) => q.bank === "english").map(
      (q) => [q.id, q.skill === "listening" ? null : q.correctOption!],
    ),
  );
  const signals = scoreCheck(flow, answers, responses);
  assertEquals(signals.find((s) => s.skill === "listening"), {
    skill: "listening",
    available: 2,
    answered: 0,
    correct: 0,
  });
  assertEquals(signals.find((s) => s.skill === "reading")?.correct, 2);
  assertEquals(scoreCheck(flow, { audience: "center" }, responses), []);
});
Deno.test("a sampled signal cannot steer offers with fewer than two answered questions", () => {
  const flow = createGuideDraft();
  flow.offers = [rule({ when: { any: [{ all: [{ question: "signal_reading", op: "lte", value: 0.5 }] }] } })];
  const answers = completed(flow, { budget: "paid" });
  assertEquals(
    recommend(flow, answers, catalog(), [], [{ skill: "reading", available: 2, answered: 1, correct: 0 }])
      .primary,
    null,
  );
  assert(
    recommend(flow, answers, catalog(), [], [{ skill: "reading", available: 2, answered: 2, correct: 0 }])
      .primary,
  );
});
Deno.test("no catalog offer is recommended until explicitly approved", () => {
  const flow = createGuideDraft();
  flow.offers = [rule({ enabled: false })];
  assertEquals(recommend(flow, completed(flow, { budget: "paid" }), catalog()).primary, null);
});
Deno.test("existing access outranks an otherwise equivalent upsell", () => {
  const flow = createGuideDraft();
  flow.offers = [rule(), rule({ id: "owned", kind: "product", productId: P2, priority: 1 })];
  const result = recommend(flow, completed(flow, { budget: "paid" }), catalog(), [P2]);
  assertEquals(result.primary?.rule.id, "owned");
  assertEquals(result.primary?.owned, true);
  assertEquals(result.alternative?.rule.id, "learner_offer");
});
Deno.test("free-only preference excludes paid offers but preserves suitable owned access", () => {
  const flow = createGuideDraft();
  flow.offers = [rule()];
  const answers = completed(flow, { budget: "free" });
  assertEquals(recommend(flow, answers, catalog()).primary, null);
  assertEquals(recommend(flow, answers, catalog(), [P]).primary?.owned, true);
  const data = catalog();
  data.plans[0].amount = 0;
  assert(recommend(flow, answers, data).primary);
});
Deno.test("hidden products, disabled plans, unavailable bundles and invalid prices cannot sell", () => {
  const flow = createGuideDraft();
  flow.offers = [rule()];
  const answers = completed(flow, { budget: "paid" });
  for (
    const mutate of [(c: Catalog) => {
      c.products[0].metadata!.hidden = true;
    }, (c: Catalog) => {
      c.plans[0].is_active = false;
    }, (c: Catalog) => {
      c.plans[0].metadata = { included_product_ids: ["missing"] };
    }, (c: Catalog) => {
      c.plans[0].amount = -1;
    }, (c: Catalog) => {
      c.products[0].status = "draft";
    }]
  ) {
    const data = catalog();
    mutate(data);
    assertEquals(recommend(flow, answers, data).primary, null);
  }
});
Deno.test("bundle access matches checkout target semantics, including primary product", () => {
  const data = catalog();
  data.plans[0].metadata = { included_product_ids: [P2, P2] };
  assertEquals(includedProducts(data.plans[0], data)?.map((p) => p.id), [P, P2]);
  const flow = createGuideDraft();
  flow.offers = [rule()];
  const answers = completed(flow, { budget: "paid" });
  assertEquals(recommend(flow, answers, data, [P]).primary?.owned, false);
  assertEquals(recommend(flow, answers, data, [P, P2]).primary?.owned, true);
});
Deno.test("live catalog price is authoritative and recommendation never invents a bundle", () => {
  const flow = createGuideDraft();
  flow.offers = [rule()];
  const data = catalog();
  data.plans[0].amount = 123456;
  const match = recommend(flow, completed(flow, { budget: "paid" }), data).primary!;
  assertEquals(match.plan?.amount, 123456);
  assertEquals(match.included.map((p) => p.id), [P]);
  assert(match.href.startsWith(`/checkout?plan_id=${PLAN}`));
});
Deno.test("redirects accept only HTTPS Schood domains without credentials or ports", () => {
  assert(safeProductUrl("https://ielts.schood.online/practice"));
  for (
    const url of [
      "javascript:alert(1)",
      "//evil.example",
      "https://schood.online.evil.example",
      "https://evil.example/schood.online",
      "https://user@schood.online",
      "https://schood.online:8443",
      "http://schood.online",
    ]
  ) assertEquals(safeProductUrl(url), null);
});
Deno.test("publication rejects missing translations, forward references, impossible routes and paths over twelve", () => {
  const translation = createGuideDraft();
  translation.questions[0].title.ru = "";
  assert(validateFlow(translation).errors.some((e) => e.includes("translations")));
  const forward = createGuideDraft();
  forward.questions[1].when = { any: [{ all: [{ question: "center_need", op: "is", value: "classroom" }] }] };
  assert(validateFlow(forward).errors.some((e) => e.includes("earlier question")));
  const impossible = createGuideDraft();
  impossible.questions.push({
    ...structuredClone(impossible.questions[1]),
    id: "impossible",
    when: {
      any: [{
        all: [{ question: "audience", op: "is", value: "learner" }, {
          question: "audience",
          op: "is",
          value: "parent",
        }],
      }],
    },
  });
  assert(validateFlow(impossible).errors.some((e) => e.includes("unreachable")));
  const long = createGuideDraft();
  long.questions.push({ ...structuredClone(long.questions[1]), id: "extra", when: { any: [] } });
  assert(validateFlow(long).errors.some((e) => e.includes("maximum is 12")));
});
Deno.test("publication requires two complete reviewed six-question banks and safe audio", () => {
  const flow = createGuideDraft();
  flow.checks[0].reviewed = false;
  assert(validateFlow(flow).errors.some((e) => e.includes("six reviewed")));
  const audio = createGuideDraft();
  audio.checks.find((q) => q.skill === "listening")!.audioUrl = "https://outside.example/file.wav";
  assert(validateFlow(audio).errors.some((e) => e.includes("audio")));
});
Deno.test("malformed untrusted configurations return validation failures, not exceptions", () => {
  for (
    const input of [null, [], { schemaVersion: 1 }, { ...createGuideDraft(), questions: [null] }, {
      ...createGuideDraft(),
      offers: [null],
    }, { ...createGuideDraft(), fallback: {} }]
  ) assert(validateFlow(input).errors.length > 0);
});
Deno.test("admin preview and server result are deterministic, independent of offer array order", () => {
  const flow = createGuideDraft();
  const a = rule({ id: "a" });
  const b = rule({ id: "b" });
  flow.offers = [b, a];
  const answers = completed(flow, { budget: "paid" });
  const first = recommend(flow, answers, catalog());
  flow.offers.reverse();
  assertEquals(recommend(flow, answers, catalog()), first);
  assertEquals(first.primary?.rule.id, "a");
});
Deno.test("every learner-facing seed question and answer has all three languages", () => {
  const flow = createGuideDraft();
  for (const q of flow.questions) {
    for (const locale of ["en", "uz", "ru"] as const) {
      assert(q.title[locale].trim());
      assert(q.help[locale].trim());
      for (const o of q.options) assert(o.label[locale].trim());
    }
  }
  assertEquals(copy("a", "b", "c"), { en: "a", uz: "b", ru: "c" });
});
Deno.test("SAT asks its own difficulties and no learner sees an irrelevant math option", () => {
  const flow = createGuideDraft();
  const answers = completed(flow, { exam: "sat", sat_difficulty: ["math"], math_obstacle: "foundations" });
  assertEquals(answers.math_obstacle, "foundations");
  assertEquals(answers.difficulty, undefined);
  assert(!flow.questions.find((q) => q.id === "difficulty")!.options.some((o) => o.id === "math"));
});
Deno.test("goal transfer updates only confirmed goals and preserves measured fields", () => {
  const flow = createGuideDraft();
  const answers = completed(flow, { target_ielts: 7.5, deadline: "2026-10-01", minutes: 45 });
  const target = goalTarget(catalog().products[0])!;
  const current = {
    target_overall_band: 6.5,
    current_band_or_estimate: 6,
    daily_practice_minutes: 60,
    practice_start_date: "2026-09-02",
    target_section_bands: { writing: 6 },
  };
  const changes = goalChanges(flow, answers, target, current, "2026-09-02");
  assert(changes.some((c) => c.field === "target_overall_band" && c.next === 7.5));
  assert(changes.some((c) => c.field === "target_date" && c.next === "2026-10-01"));
  assert(
    !changes.some((c) =>
      c.field === "current_band_or_estimate" || c.field === "target_section_bands" ||
      c.field === "target_cefr"
    ),
  );
  assertEquals(current.target_section_bands, { writing: 6 });
  const updated = { ...current, ...Object.fromEntries(changes.map((c) => [c.field, c.next])) };
  assertEquals(goalChanges(flow, answers, target, updated, "2026-09-02"), []);
});
Deno.test("goal transfer rejects other audiences, other exams, unsafe and unsupported apps", () => {
  const flow = createGuideDraft();
  const product = catalog().products[0];
  const target = goalTarget(product)!;
  assertEquals(goalChanges(flow, completed(flow, { audience: "teacher" }), target, null, "2026-09-02"), []);
  assertEquals(
    goalChanges(flow, completed(flow, { exam: "sat", target_sat: 1500 }), target, null, "2026-09-02"),
    [],
  );
  assertEquals(goalTarget({ ...product, metadata: { app_url: "https://attacker.example" } }), null);
  assertEquals(goalTarget({ ...product, metadata: { app_url: "https://ielts.schood.online" } }), null);
});
Deno.test("native goal units are explicit in preview and past dates are never applied", () => {
  const flow = createGuideDraft();
  const sat = goalTarget({
    ...catalog().products[0],
    metadata: { app_url: "https://practice.sat.schood.online" },
  })!;
  const answers = completed(flow, { exam: "sat", target_sat: 1500, minutes: 30, deadline: "2025-01-01" });
  const changes = goalChanges(flow, answers, sat, null, "2026-09-02");
  assert(changes.some((c) => c.field === "hours_per_week" && c.next === 4));
  assert(!changes.some((c) => c.field === "test_date"));
});
