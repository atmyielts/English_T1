import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildTutorChatRequest,
  buildTutorContext,
  checkLessonAnswer,
  contextActions,
  fitContext,
  fitMessages,
  lessonTopicFor,
  mergeActions,
  normalizeLesson,
  normalizeTutorReply,
  publicLesson,
  safeTutorRoute,
  threadTitle,
  TUTOR_LIMITS,
  type TutorContextInput,
} from "./english-tutor.ts";

const input = (overrides: Partial<TutorContextInput> = {}): TutorContextInput => ({
  goal: {
    current_cefr_estimate: "A2",
    target_cefr: "B2",
    goal_keys: ["ielts", "work"],
    daily_time_minutes: 20,
    metadata: {
      skill_ratings: {
        version: 1,
        skills: { writing: { level: "B1", progress: 42.4 }, speaking: { level: "A2", progress: null } },
        overall: { level: "B1" },
      },
      placement: { per_skill: { reading: "B1", writing: "A2" } },
      goal_plan: { target_date: "2027-06-01" },
    },
  },
  mistakes: [
    { topic: "articles", subskill: "grammar.articles", example: "I have car → I have a car", times: 3 },
    { topic: "articles", subskill: "grammar.articles", example: "Article missing before singular noun", times: 2 },
    { topic: null, subskill: "writing.spelling", example: "recieve → receive", times: 1 },
    { topic: "present-perfect", subskill: "grammar.present-perfect", example: "I live here since 2020 → I have lived here since 2020", times: 4 },
  ],
  recent: [{ skill: "writing", score: 66, at: "2026-10-20T10:00:00Z" }, { skill: "reading", score: null, at: "2026-10-19T10:00:00Z" }],
  dueWords: { count: 7, words: ["decide", "improve", "rarely", "afford", "borrow", "commute"] },
  assignments: [{ title: "Essay: my city", skill: "writing", due: "2026-10-30", route: "/writing/my-city" }, { title: "Bad link", skill: null, due: null, route: "https://evil.example" }],
  memories: [{ kind: "goal", text: "You aim for IELTS 6.5 by June." }],
  project: { key: "weekend-trip", title: "Plan a weekend trip", day: 2, days: 3 },
  lessons: { articles: "articles-basic-control" },
  ...overrides,
});

Deno.test("context: ratings first, placement as fallback, goal date, grouped mistakes with lessons", () => {
  const context = buildTutorContext(input());
  assertEquals(context.level, "B1");
  assertEquals(context.levels, { writing: "B1 42%", speaking: "A2", reading: "B1" });
  assertEquals(context.target, "B2");
  assertEquals(context.goal_date, "2027-06-01");
  assertEquals(context.goals, ["ielts", "work"]);
  assertEquals(context.mistakes[0], { topic: "articles", times: 5, example: "I have car → I have a car", lesson: "articles-basic-control" });
  assertEquals(context.mistakes[1]?.topic, "present-perfect");
  assertEquals(context.mistakes[1]?.lesson, null);
  assertEquals(context.words_due, 7);
  assertEquals(context.practise_words.length, 5);
  assertEquals(context.assignments.map((entry) => entry.route), ["/writing/my-city", null]);
  assertEquals(context.recent, ["writing 66 (10-20)", "reading - (10-19)"]);
  assertEquals(context.project, "Plan a weekend trip: day 2 of 3");
});

Deno.test("context without any data stays empty and honest", () => {
  const context = buildTutorContext({ goal: null, mistakes: [], recent: [], dueWords: { count: 0, words: [] }, assignments: [], memories: [], project: null, lessons: {} });
  assertEquals(context.level, null);
  assertEquals(context.levels, {});
  assertEquals(context.mistakes, []);
  assertEquals(contextActions(context), []);
});

Deno.test("fitContext drops details until the JSON fits the budget", () => {
  const big = buildTutorContext(input({
    memories: Array.from({ length: 10 }, (_, index) => ({ kind: "context", text: `Memory number ${index} `.repeat(8) })),
    recent: Array.from({ length: 6 }, (_, index) => ({ skill: "writing", score: index, at: "2026-10-20T00:00:00Z" })),
  }));
  assert(JSON.stringify(big).length > TUTOR_LIMITS.contextChars);
  const fitted = fitContext(big);
  assert(JSON.stringify(fitted).length <= TUTOR_LIMITS.contextChars, `${JSON.stringify(fitted).length}`);
  // The essentials survive.
  assertEquals(fitted.level, "B1");
  assert(fitted.mistakes.length > 0);
  // The original is not changed.
  assertEquals(big.memories.length, 10);
});

Deno.test("fitMessages: newest few, each cut short, total budget, the last message always kept", () => {
  const messages = Array.from({ length: 20 }, (_, index) => ({ role: (index % 2 ? "assistant" : "user") as "user" | "assistant", content: `message ${index} ${"x".repeat(900)}` }));
  const fitted = fitMessages(messages);
  assert(fitted.length <= TUTOR_LIMITS.recentMessages);
  assert(fitted.every((message) => message.content.length <= TUTOR_LIMITS.messageChars));
  assert(fitted.reduce((sum, message) => sum + message.content.length, 0) <= TUTOR_LIMITS.historyChars);
  assert(fitted[fitted.length - 1]!.content.startsWith("message 19"));
  const one = fitMessages([{ role: "user", content: "y".repeat(5000) }], { recentMessages: 6, messageChars: 500, historyChars: 100 });
  assertEquals(one.length, 1);
  assertEquals(fitMessages([{ role: "user", content: "   " }]), []);
});

Deno.test("the chat request stays small however long the thread is", () => {
  const context = buildTutorContext(input());
  const messages = Array.from({ length: 200 }, (_, index) => ({ role: (index % 2 ? "assistant" : "user") as "user" | "assistant", content: "word ".repeat(400) }));
  const request = buildTutorChatRequest({ context, summary: "s".repeat(5000), messages });
  const payload = JSON.parse(request.userPayload);
  assert(request.userPayload.length < TUTOR_LIMITS.contextChars + TUTOR_LIMITS.historyChars + TUTOR_LIMITS.summaryChars + 1200, `${request.userPayload.length}`);
  assertEquals(payload.RECENT.length <= TUTOR_LIMITS.recentMessages, true);
  assert(payload.SUMMARY.length <= TUTOR_LIMITS.summaryChars);
  assert(Array.isArray(payload.TOPICS));
});

Deno.test("routes: only in-app paths the app really has", () => {
  assertEquals(safeTutorRoute("/review"), "/review");
  assertEquals(safeTutorRoute("/grammar/articles-basic-control"), "/grammar/articles-basic-control");
  assertEquals(safeTutorRoute("/grammar/handbook#articles"), "/grammar/handbook#articles");
  assertEquals(safeTutorRoute("/immersion/projects/weekend-trip"), "/immersion/projects/weekend-trip");
  assertEquals(safeTutorRoute("//evil.example"), null);
  assertEquals(safeTutorRoute("https://evil.example"), null);
  assertEquals(safeTutorRoute("/admin"), null);
  assertEquals(safeTutorRoute("/writing/a/b/c"), null);
  assertEquals(safeTutorRoute("javascript:alert(1)"), null);
});

Deno.test("context actions and merging: assignment, review, lesson, project; no duplicate routes; at most 3", () => {
  const context = buildTutorContext(input());
  const actions = contextActions(context, "weekend-trip");
  assertEquals(actions.map((action) => action.kind), ["assignment", "review", "lesson", "project"]);
  const merged = mergeActions([{ kind: "ai", route: "/review", label: "Review words", why: null }, { kind: "ai", route: "/bad", label: "x", why: null }], actions);
  assertEquals(merged.map((action) => action.route), ["/review", "/writing/my-city", "/grammar/articles-basic-control"]);
});

Deno.test("reply normalisation: keeps safe parts, falls back to the old summary, rejects empty replies", () => {
  const reply = normalizeTutorReply({
    reply: "  Great question!  ",
    summary: "",
    lesson_topic: "articles",
    suggested_actions: [{ label: "Practise articles", route: "/grammar/articles-basic-control", why: "Your top mistake" }, { label: "Hack", route: "http://x" }],
    suggested_memories: [{ kind: "GOAL", text: "You want IELTS 7." }, { kind: "weird", text: "You like mornings." }, { kind: "win", text: "" }],
  }, "Earlier summary");
  assertEquals(reply?.reply, "Great question!");
  assertEquals(reply?.summary, "Earlier summary");
  assertEquals(reply?.lesson_topic, "articles");
  assertEquals(reply?.actions.map((action) => action.route), ["/grammar/articles-basic-control"]);
  assertEquals(reply?.memories, [{ kind: "goal", text: "You want IELTS 7." }, { kind: "context", text: "You like mornings." }]);
  assertEquals(normalizeTutorReply({ reply: "" }), null);
  assertEquals(normalizeTutorReply("x"), null);
  assertEquals(normalizeTutorReply({ reply: "ok", lesson_topic: "not-a-topic" })?.lesson_topic, null);
  assertEquals(threadTitle("  How do I use the present perfect with since and for in my essays?  ").length <= 60, true);
});

const rawLesson = {
  title: "Articles: a, an, the",
  explain: "Use a or an with one countable thing the first time; use the when we both know which one.",
  example: { wrong: "I have car.", right: "I have a car." },
  items: [
    { type: "fill", prompt: "She is ___ engineer.", answer: "an", accept: [], why: "Engineer starts with a vowel sound." },
    { type: "choose", prompt: "Pick the right one: I saw ___ moon.", options: ["a", "the", "an"], answer: "the", why: "There is only one moon." },
    { type: "fix", prompt: "He bought new phone.", answer: "He bought a new phone.", accept: ["He's bought a new phone."], why: "One countable thing needs a." },
    { type: "fill", prompt: "No blank here", answer: "x" },
  ],
  check: { type: "fix", prompt: "I want to be doctor.", answer: "I want to be a doctor.", why: "Jobs take a/an." },
};

Deno.test("lesson: valid lesson parsed, answers checked leniently without AI, hidden until answered", () => {
  const lesson = normalizeLesson(rawLesson, "articles", "a2");
  assert(lesson);
  assertEquals(lesson.level, "A2");
  assertEquals(lesson.items.length, 3);
  assertEquals(lesson.items.map((item) => item.id), ["i1", "i2", "i3"]);
  assertEquals(checkLessonAnswer(lesson.items[0]!, " AN ").correct, true);
  assertEquals(checkLessonAnswer(lesson.items[1]!, "1").correct, true);
  assertEquals(checkLessonAnswer(lesson.items[1]!, "a").correct, false);
  assertEquals(checkLessonAnswer(lesson.items[2]!, "he’s bought a new phone").correct, true);
  assertEquals(checkLessonAnswer(lesson.items[2]!, "").correct, false);
  const hidden = publicLesson(lesson);
  assertEquals(JSON.stringify(hidden).includes("He bought a new phone."), false);
  assertEquals(hidden.progress, { answered: 0, correct: 0, total: 4, done: false });
  const shown = publicLesson(lesson, { i1: { given: "an", correct: true }, check: { given: "I want to be doctor", correct: false } });
  assertEquals(shown.items[0]?.result?.expected, "an");
  assertEquals(shown.check.result?.correct, false);
  assertEquals(shown.progress, { answered: 2, correct: 1, total: 4, done: false });
});

Deno.test("lesson: broken model output is rejected", () => {
  assertEquals(normalizeLesson({ ...rawLesson, items: rawLesson.items.slice(0, 2) }, "articles", "B1"), null);
  assertEquals(normalizeLesson({ ...rawLesson, check: { type: "choose", prompt: "x", options: ["a", "b"], answer: "c" } }, "articles", "B1"), null);
  assertEquals(normalizeLesson({ ...rawLesson, title: "" }, "articles", "B1"), null);
  assertEquals(normalizeLesson(null, "articles", "B1"), null);
});

Deno.test("lesson topic: a known topic as asked, else the learner's top grammar mistake", () => {
  const context = buildTutorContext(input());
  assertEquals(lessonTopicFor("passive", context), "passive");
  assertEquals(lessonTopicFor("made-up", context), "articles");
  assertEquals(lessonTopicFor(null, buildTutorContext(input({ mistakes: [] }))), null);
});
