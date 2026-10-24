import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type NextInput, pickNextStep, rankWeakest } from "./english-next.ts";
import { type CatalogItem, TODAY_SKILLS, type TodaySkill, type TodayTask } from "./english-today.ts";

const item = (skill: TodaySkill, slug: string, level: CatalogItem["level"] = "B1"): CatalogItem =>
  ({ id: `${skill}-${slug}`, skill, slug, title: `${skill} ${slug}`, level, minutes: 10, difficulty: 0.5 });

const ITEMS: CatalogItem[] = TODAY_SKILLS.flatMap((skill) => [item(skill, "one"), item(skill, "two")]);

const base = (patch: Partial<NextInput> = {}): NextInput => ({
  items: ITEMS,
  attempts: [],
  dueReviews: 0,
  fixes: [],
  ratings: {
    reading: { value: 2.8, level: "B1", progress: 80, attempts: 6 },
    listening: { value: 2.2, level: "B1", progress: 20, attempts: 6 },
    writing: { value: 1.6, level: "A2", progress: 60, attempts: 4 },
    speaking: { value: 2.4, level: "B1", progress: 40, attempts: 3 },
    grammar: { value: 2.5, level: "B1", progress: 50, attempts: 5 },
    vocabulary: { value: 2.6, level: "B1", progress: 60, attempts: 5 },
    immersion: { value: 2.9, level: "B1", progress: 90, attempts: 2 },
  },
  targetLevel: "B2",
  levelFor: () => "B1",
  planTasks: [],
  access: { owned: [...TODAY_SKILLS], freeLeft: 0, freeItemIds: [] },
  ...patch,
});

const planTask = (entry: CatalogItem, done = false): TodayTask => ({
  id: `activity:${entry.id}`,
  kind: "activity",
  skill: entry.skill,
  content_item_id: entry.id,
  slug: entry.slug,
  title: entry.title,
  level: entry.level,
  minutes: 10,
  reason: "balance",
  item_kind: "new",
  previous_score: null,
  done,
});

Deno.test("due reviews come first", () => {
  const { step, locked } = pickNextStep(base({ dueReviews: 4 }));
  assertEquals([step?.kind, step?.reason, step?.due, locked], ["review", "review_due", 4, null]);
});

Deno.test("then a lesson for a repeated mistake", () => {
  const lesson = item("grammar", "articles");
  const { step } = pickNextStep(base({ items: [...ITEMS, lesson], fixes: [{ topic: "articles", count: 3, example: "a apple → an apple", item: lesson }] }));
  assertEquals([step?.reason, step?.slug, step?.detail], ["fix_mistake", "articles", "a apple → an apple"]);
});

Deno.test("then the weakest skill against the goal, preferring its planned task", () => {
  assertEquals(rankWeakest(base())[0], "writing");
  const plain = pickNextStep(base());
  assertEquals([plain.step?.reason, plain.step?.skill, plain.step?.rating?.level, plain.step?.target_level], ["weakest_skill", "writing", "A2", "B2"]);
  const planned = item("writing", "two");
  const withPlan = pickNextStep(base({ planTasks: [planTask(item("reading", "one")), planTask(planned)] }));
  assertEquals(withPlan.step?.content_item_id, planned.id);
});

Deno.test("the finished activity and the current skill are not suggested straight away", () => {
  const { step } = pickNextStep(base({ fromSkill: "writing", excludeItemId: "writing-one" }));
  assertEquals(step?.skill, "listening");
  const fix = item("grammar", "tenses");
  const afterFix = pickNextStep(base({ items: [...ITEMS, fix], fixes: [{ topic: "tenses", count: 2, example: "", item: fix }], excludeItemId: fix.id }));
  assertEquals(afterFix.step?.reason, "weakest_skill");
});

Deno.test("unrated skills fall back to their level; without a goal the lowest rating is weakest", () => {
  const ranked = rankWeakest(base({ ratings: { reading: { value: 1.2, level: "A2", progress: 20, attempts: 3 } }, targetLevel: null, levelFor: (skill) => (skill === "speaking" ? "A1" : "B1") }));
  assertEquals(ranked.slice(0, 2), ["speaking", "reading"]);
});

Deno.test("a locked best step is offered as optional and the best owned one is chosen", () => {
  const { step, locked } = pickNextStep(base({ access: { owned: ["reading"], freeLeft: 0, freeItemIds: [] } }));
  assertEquals([locked?.skill, locked?.reason], ["writing", "weakest_skill"]);
  assertEquals([step?.skill, step?.uses_free], ["reading", false]);
});

Deno.test("today's free activity opens any skill; once used, only owned skills and today's free item", () => {
  const free = pickNextStep(base({ access: { owned: [], freeLeft: 1, freeItemIds: [] } }));
  assertEquals([free.step?.skill, free.step?.uses_free, free.locked], ["writing", true, null]);
  const reopen = pickNextStep(base({ access: { owned: [], freeLeft: 0, freeItemIds: ["speaking-one"] } }));
  assertEquals([reopen.step?.content_item_id, reopen.step?.uses_free, reopen.locked?.skill], ["speaking-one", false, "writing"]);
  const nothing = pickNextStep(base({ access: { owned: [], freeLeft: 0, freeItemIds: [] } }));
  assertEquals([nothing.step, nothing.locked?.skill], [null, "writing"]);
  // Reviews are always open, so a free learner can still continue.
  const review = pickNextStep(base({ dueReviews: 2, access: { owned: [], freeLeft: 0, freeItemIds: [] } }));
  assertEquals([review.step?.kind, review.locked], ["review", null]);
});

Deno.test("today's plan comes after the weakest skills, and finished tasks are skipped", () => {
  const readingOne = item("reading", "one");
  const { step } = pickNextStep(base({
    items: [readingOne, item("writing", "one")],
    planTasks: [planTask(item("writing", "one"), true), planTask(readingOne)],
    access: { owned: ["reading"], freeLeft: 0, freeItemIds: [] },
    ratings: {},
    levelFor: (skill) => (skill === "writing" ? "A2" : "B1"),
  }));
  // Writing is weakest but locked; reading is both the second weakest and in the plan.
  assertEquals([step?.content_item_id, step?.reason], [readingOne.id, "weakest_skill"]);
  const onlyPlan = pickNextStep(base({
    items: [readingOne],
    planTasks: [planTask(readingOne)],
    ratings: {},
    levelFor: () => null,
    fromSkill: "reading",
  }));
  assertEquals(onlyPlan.step?.content_item_id, readingOne.id);
  assertEquals(pickNextStep(base({ items: [] })).step, null);
});
