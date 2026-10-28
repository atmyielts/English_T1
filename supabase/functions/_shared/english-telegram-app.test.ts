import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { scheduleAfterAnswer } from "./english-review.ts";
import { notebookReviewPatch, RELEARN_MINUTES } from "./english-srs.ts";
import {
  buildReviewCards,
  englishBotMessage,
  englishCallbackData,
  englishHref,
  escapeTelegramHtml,
  MINI_APP_ENGLISH_ROUTE,
  MINI_APP_REVIEW_ROUTE,
  nextTasks,
  parseEnglishCallback,
  planTasks,
  reviewAnswerWasDue,
  reviewItemPatch,
  tgLocale,
  wordReviewPatch,
} from "./english-telegram-app.ts";

const NOW = new Date("2026-10-24T10:00:00Z");
const DAY = 86_400_000;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

Deno.test("tg english: missed questions follow the hub schedule (1, 3, 7 days, then retired)", () => {
  for (const box of [1, 2, 3]) {
    for (const correct of [true, false]) {
      const { patch } = reviewItemPatch({ box, times_reviewed: 4 }, correct, NOW);
      const expected = scheduleAfterAnswer(box, correct, NOW);
      assertEquals(patch.box, expected.box);
      assertEquals(patch.next_due_at, expected.next_due_at);
      assertEquals(patch.times_reviewed, 5);
      assertEquals(patch.last_result, correct ? "correct" : "incorrect");
    }
  }
  assertEquals(reviewItemPatch({ box: 1 }, true, NOW).patch.next_due_at, new Date(NOW.getTime() + 3 * DAY).toISOString());
  assertEquals(reviewItemPatch({ box: 3 }, true, NOW).retired, true);
  assertEquals(reviewItemPatch({ box: 3 }, false, NOW), {
    patch: { box: 1, next_due_at: new Date(NOW.getTime() + DAY).toISOString(), last_result: "incorrect", times_reviewed: 1 },
    retired: false,
  });
});

Deno.test("tg english: saved words follow the shared FSRS schedule", () => {
  const entry = { leitner_box: 2, review_count: 3, correct_count: 2, incorrect_count: 1, last_reviewed_at: "2026-10-22T10:00:00Z", metadata: { definition: "d" } };
  const right = wordReviewPatch(entry, true, NOW);
  assertEquals(right, notebookReviewPatch(entry, 3, NOW));
  assertEquals([right.review_count, right.correct_count, right.incorrect_count], [4, 3, 1]);
  assertEquals(right.last_reviewed_at, NOW.toISOString());
  assertEquals(right.metadata.definition, "d");
  assert(Date.parse(right.next_review_at) > NOW.getTime() + DAY);

  const wrong = wordReviewPatch({ leitner_box: 4, review_count: 1, correct_count: 1, incorrect_count: 0 }, false, NOW);
  assertEquals(wrong.leitner_box, 1);
  assertEquals(wrong.next_review_at, new Date(NOW.getTime() + RELEARN_MINUTES * 60_000).toISOString());
  assertEquals([wrong.review_count, wrong.correct_count, wrong.incorrect_count], [2, 1, 1]);
});

Deno.test("tg english: XP only for answers to due, unretired items", () => {
  assert(reviewAnswerWasDue(1, "2026-10-24T09:00:00Z", NOW));
  assert(reviewAnswerWasDue(3, NOW.toISOString(), NOW));
  assert(!reviewAnswerWasDue(2, "2026-10-25T09:00:00Z", NOW));
  assert(!reviewAnswerWasDue(4, "2026-10-20T09:00:00Z", NOW));
  assert(!reviewAnswerWasDue(1, null, NOW));
});

Deno.test("tg english: review cards hide answer keys, skip passed cards, items before words", () => {
  const cards = buildReviewCards({
    items: [
      { id: id(1), kind: "grammar", box: 2, payload: { type: "grammar", prompt: "She ___ (go) home.", instructions: "Fill the gap", accepted: ["goes"], source_title: "Present simple", source_slug: "present" } },
      { id: id(2), kind: "reading", box: 1, payload: { type: "choice", prompt: "Why?", options: ["a", "b"], answer_index: 1, explanation: "Because", source_title: "T", source_slug: "t" } },
      { id: id(3), kind: "listening", box: 1, payload: { type: "dictation", sentence: "I like tea.", source_title: "L", source_slug: "l" } },
      { id: "not-a-uuid", payload: { type: "dictation", sentence: "x" } },
      { id: id(4), payload: { type: "unknown" } },
      { id: id(5), payload: { type: "grammar", prompt: "Skip me", accepted: ["x"] } },
    ],
    words: [
      { id: id(6), word: " assess ", definition: "to judge", example: null },
      { id: id(7), word: "", definition: "no word" },
    ],
    exclude: [id(5)],
  });
  assertEquals(cards.map((card) => card.id), [id(1), id(2), id(3), id(6)]);
  const json = JSON.stringify(cards);
  assert(!json.includes("goes"));
  assert(!json.includes("answer_index"));
  assert(!json.includes("Because"));
  assert(!json.includes("accepted"));
  assertEquals(cards[0], { kind: "item", id: id(1), step: 2, type: "grammar", prompt: "She ___ (go) home.", instructions: "Fill the gap", source_title: "Present simple", source_slug: "present" });
  assertEquals((cards[2] as Record<string, unknown> | undefined)?.speak, "I like tea.");
  assertEquals(cards[3], { kind: "word", id: id(6), word: "assess", definition: "to judge", example: null });
  assertEquals(buildReviewCards({ items: [], words: Array.from({ length: 30 }, (_, n) => ({ id: id(100 + n), word: `w${n}` })), limit: 4 }).length, 4);
});

Deno.test("tg english: task links stay on the English app", () => {
  const app = "https://english.schood.online";
  assertEquals(englishHref(app, "https://english.schood.online/reading/a-day", "/today"), "https://english.schood.online/reading/a-day");
  assertEquals(englishHref(app, "/grammar/articles", "/today"), "https://english.schood.online/grammar/articles");
  assertEquals(englishHref(app, "https://evil.example/phish", "/reading"), "https://english.schood.online/reading");
  assertEquals(englishHref(app, "javascript:alert(1)", "/reading"), "https://english.schood.online/reading");
  assertEquals(englishHref(app, "//evil.example/x", "today"), "https://english.schood.online/today");
  assertEquals(englishHref(app, null, "/today"), "https://english.schood.online/today");
});

Deno.test("tg english: next tasks from the stored plan, done refreshed from today's attempts", () => {
  const tasks = planTasks({
    appUrl: "https://english.schood.online",
    dueReviews: 4,
    doneItemIds: new Set(["item-b"]),
    tasks: [
      { id: "review", intent: "review", skill: "vocabulary", title: "Review due vocabulary", estimated_minutes: 5, href: "https://english.schood.online/review", done: false },
      { id: "a", intent: "activity", skill: "reading", title: "A day in Tashkent", estimated_minutes: 12, content_item_id: "item-a", href: "https://english.schood.online/reading/a-day", done: true },
      { id: "b", intent: "activity", skill: "grammar", title: "Articles", estimated_minutes: 8, content_item_id: "item-b", href: "https://english.schood.online/grammar/articles", done: false },
      { id: "c", intent: "activity", skill: "listening", title: "At the bazaar", estimated_minutes: 900, content_item_id: "item-c", href: "https://evil.example/x", done: false },
      { id: "d", intent: "activity", skill: "speaking", title: "Introduce yourself", content_item_id: "item-d", href: "https://english.schood.online/speaking/intro" },
      { id: "e", intent: "activity", skill: "", title: "Broken" },
      "garbage",
    ],
  });
  assertEquals(tasks.map((task) => [task.id, task.done]), [["review", false], ["a", true], ["b", true], ["c", false], ["d", false]]);
  assertEquals(tasks[3]?.href, "https://english.schood.online/listening");
  assertEquals(tasks[3]?.minutes, 240);
  assertEquals(tasks[4]?.minutes, 10);
  assertEquals(nextTasks(tasks).map((task) => task.id), ["review", "c", "d"]);
  const cleared = planTasks({ appUrl: "https://english.schood.online", dueReviews: 0, doneItemIds: new Set(), tasks: [{ id: "review", intent: "review", skill: "vocabulary", title: "Review" }] });
  assertEquals(cleared[0]?.done, true);
  assertEquals(planTasks({ appUrl: "https://english.schood.online", dueReviews: 0, doneItemIds: new Set(), tasks: null }), []);
});

Deno.test("tg english: /english callbacks round-trip and fit Telegram's 64 bytes", () => {
  for (const action of ["quiz_on", "quiz_off", "status"] as const) {
    const data = englishCallbackData(action);
    assertEquals(parseEnglishCallback(data), action);
    assert(new TextEncoder().encode(data).length <= 64);
  }
  assertEquals(parseEnglishCallback("enq:abc:1"), null);
  assertEquals(parseEnglishCallback(undefined), null);
  assertEquals(tgLocale("uz-UZ"), "uz");
  assertEquals(tgLocale("de"), "en");
});

Deno.test("tg english: /english message is escaped Telegram HTML with the right buttons", () => {
  const message = englishBotMessage("en", {
    linked: true,
    placement_done: true,
    level: "B1",
    streak: 1,
    xp_today: 22,
    due_total: 7,
    next_task: "Tom & <Jerry>",
    quiz_enabled: false,
  }, "https://english.schood.online/check");
  assertStringIncludes(message.text, "Level: B1 · Streak: 1 day · XP today: 22");
  assertStringIncludes(message.text, "Due for review: 7");
  assertStringIncludes(message.text, "<i>Tom &amp; &lt;Jerry&gt;</i>");
  assertEquals(message.buttons[0]?.[0]?.web_app_route, MINI_APP_ENGLISH_ROUTE);
  assertEquals(message.buttons[1]?.[0], { text: "Review now (7)", web_app_route: MINI_APP_REVIEW_ROUTE });
  assertEquals(message.buttons[2]?.[0]?.callback_data, "eng:quiz:on");

  const on = englishBotMessage("ru", { linked: true, placement_done: true, level: null, streak: 3, xp_today: 0, due_total: 0, next_task: null, quiz_enabled: true }, "u");
  assertStringIncludes(on.text, "Сейчас повторять нечего.");
  assertStringIncludes(on.text, "вкл.");
  assertEquals(on.buttons[2]?.[0]?.callback_data, "eng:quiz:off");

  const noProfile = englishBotMessage("uz", { linked: true, placement_done: false, level: null, streak: 0, xp_today: 0, due_total: 0, next_task: null, quiz_enabled: null }, "https://english.schood.online/check");
  assertStringIncludes(noProfile.text, "daraja testidan oʻting");
  assertEquals(noProfile.buttons[0]?.[0]?.url, "https://english.schood.online/check");

  const unlinked = englishBotMessage("en", { linked: false }, "u");
  assertEquals(unlinked.buttons, [[{ text: "Open Schood Mini App", web_app_route: "" }]]);

  // No quiz button while the learner has no English profile.
  const hidden = englishBotMessage("en", { linked: true, placement_done: true, level: "A2", streak: 0, xp_today: 0, due_total: 1, next_task: null, quiz_enabled: null }, "u");
  assertEquals(hidden.buttons.length, 2);
  assertEquals(escapeTelegramHtml("a<b>&\"c"), "a&lt;b&gt;&amp;&quot;c");
});
