import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cleanPosition, parseResumeWrite, type ResumeInput, selectResume, WRITING_DRAFT_MAX } from "./english-resume.ts";
import { type NextInput, pickNextStep } from "./english-next.ts";
import { type CatalogItem, TODAY_SKILLS } from "./english-today.ts";

const NOW = new Date("2026-10-24T12:00:00Z");
const HOUR = 3_600_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const input = (patch: Partial<ResumeInput> = {}): ResumeInput => ({
  now: NOW,
  points: [],
  finished: [],
  roleplays: [],
  mocks: [],
  roleplayTtlMs: 3 * HOUR,
  mockResumeMs: 3 * HOUR,
  ...patch,
});

Deno.test("positions: only what each skill can use, and small", () => {
  assertEquals(cleanPosition("writing", { draft: "My essay", answers: { q1: 2 }, step: 2, total: 5 }), { step: 2, total: 5, draft: "My essay" });
  assertEquals(cleanPosition("writing", { draft: "x".repeat(WRITING_DRAFT_MAX + 50) })?.draft?.length, WRITING_DRAFT_MAX);
  assertEquals(
    cleanPosition("listening", { answers: { q1: 2, "bad id!": 1, q2: 99 }, typed: { "0": "hello", "x": "no", "3": "" }, plays: 2 }),
    { answers: { q1: 2 }, typed: { "0": "hello" }, plays: 2 },
  );
  assertEquals(cleanPosition("reading", { draft: "ignored" }), null);
  assertEquals(cleanPosition("grammar", { step: 9, total: 4 }), { step: 4, total: 4 });
  assertEquals(cleanPosition("grammar", "nope"), null);
});

Deno.test("a save needs a real skill and a slug", () => {
  assertEquals(parseResumeWrite({ skill: "writing", slug: "my-day", position: { draft: "Hi" } }), { skill: "writing", slug: "my-day", title: null, position: { draft: "Hi" } });
  assertEquals(parseResumeWrite({ skill: "cooking", slug: "x" }), null);
  assertEquals(parseResumeWrite({ skill: "reading", slug: "../etc" }), null);
  assertEquals(parseResumeWrite(null), null);
});

Deno.test("newest first, one per skill; finished, stale and unknown points are dropped", () => {
  const items = selectResume(input({
    points: [
      { skill: "writing", slug: "my-day", title: "My day", position: { draft: "I woke up early today" }, updated_at: ago(2 * HOUR) },
      { skill: "listening", slug: "airport", title: "At the airport", position: { step: 2, total: 4 }, updated_at: ago(1 * HOUR) },
      { skill: "reading", slug: "done-article", title: "Done", position: null, updated_at: ago(5 * HOUR) },
      { skill: "grammar", slug: "old", title: "Old", position: null, updated_at: ago(8 * 24 * HOUR) },
      { skill: "cooking", slug: "soup", title: "Soup", position: null, updated_at: ago(HOUR) },
    ],
    finished: [
      { skill: "reading", slug: "done-article", submitted_at: ago(4 * HOUR) },
      // An older submission of the draft's activity does not finish today's draft.
      { skill: "writing", slug: "my-day", submitted_at: ago(30 * HOUR) },
    ],
  }));
  assertEquals(items.map((item) => [item.skill, item.ref, item.progress, item.words, item.href]), [
    ["listening", "airport", 50, null, "/listening/airport"],
    ["writing", "my-day", null, 5, "/writing/my-day"],
  ]);
});

Deno.test("a submission just before the last autosave still counts as finished", () => {
  const items = selectResume(input({
    points: [{ skill: "writing", slug: "my-day", title: null, position: { draft: "Done" }, updated_at: ago(60_000) }],
    finished: [{ skill: "writing", slug: "my-day", submitted_at: ago(90_000) }],
  }));
  assertEquals(items, []);
});

Deno.test("an active role-play and an unscored mock can be continued while still open", () => {
  const items = selectResume(input({
    roleplays: [
      { id: "r-old", scenario_id: "hotel", title: "Hotel", learner_turns: 3, max_turns: 10, updated_at: ago(4 * HOUR) },
      { id: "r-new", scenario_id: "visa-interview", title: "Visa", learner_turns: 4, max_turns: 10, updated_at: ago(HOUR / 2) },
      { id: "r-empty", scenario_id: "job", title: "Job", learner_turns: 0, max_turns: 10, updated_at: ago(60_000) },
    ],
    mocks: [{ id: "m1", started_at: ago(HOUR) }],
  }));
  assertEquals(items.map((item) => [item.kind, item.ref, item.progress, item.href]), [
    ["roleplay", "visa-interview", 40, "/roleplay/visa-interview?session=r-new"],
    ["mock", "mock", null, "/speaking-mock"],
  ]);
  assertEquals(selectResume(input({ mocks: [{ id: "m1", started_at: ago(4 * HOUR) }] })), []);
});

const ITEMS: CatalogItem[] = TODAY_SKILLS.map((skill) => ({ id: `${skill}-1`, skill, slug: "one", title: `${skill} one`, level: "B1", minutes: 10, difficulty: 0.5 }));
const nextInput = (patch: Partial<NextInput>): NextInput => ({
  items: ITEMS,
  attempts: [],
  dueReviews: 5,
  fixes: [],
  ratings: {},
  targetLevel: null,
  levelFor: () => "B1",
  planTasks: [],
  access: { owned: ["writing"], freeLeft: 0, freeItemIds: [] },
  ...patch,
});

Deno.test("Up next: something unfinished comes before due reviews", () => {
  const { step } = pickNextStep(nextInput({ resume: [{ kind: "activity", skill: "writing", ref: "one", title: "writing one", href: "/writing/one", progress: 40 }] }));
  assertEquals([step?.reason, step?.skill, step?.slug, step?.detail], ["continue", "writing", "one", "40"]);
});

Deno.test("Up next: a started role-play opens even without Speaking in the plan; the activity just finished is not offered", () => {
  const roleplay = pickNextStep(nextInput({ resume: [{ kind: "roleplay", skill: "speaking", ref: "visa", title: "Visa", href: "/roleplay/visa?session=1", progress: 30 }] }));
  assertEquals([roleplay.step?.reason, roleplay.step?.href, roleplay.step?.detail, roleplay.step?.uses_free], ["continue", "/roleplay/visa?session=1", "roleplay", false]);
  const justDone = pickNextStep(nextInput({
    excludeItemId: "writing-1",
    resume: [{ kind: "activity", skill: "writing", ref: "one", title: null, href: "/writing/one", progress: null }],
  }));
  assertEquals(justDone.step?.reason, "review_due");
  // Not in the plan and no free activity left: not offered as "continue".
  const locked = pickNextStep(nextInput({ resume: [{ kind: "activity", skill: "reading", ref: "one", title: null, href: "/reading/one", progress: null }] }));
  assertEquals([locked.step?.reason, locked.locked?.reason], ["review_due", "continue"]);
});
