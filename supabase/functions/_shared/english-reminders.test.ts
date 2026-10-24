import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  dailyReminderText,
  learnerClock,
  mergeReminderSettings,
  readReminderSettings,
  weeklySummaryText,
} from "./english-reminders.ts";

Deno.test("reminders are off until the learner turns them on, and hours stay in range", () => {
  assertEquals(readReminderSettings(null), { enabled: false, hour: 19, weekly: true, quiz: false, locale: "en" });
  assertEquals(readReminderSettings({ telegram_reminder: { enabled: "yes", hour: 3 } }).enabled, false);
  assertEquals(readReminderSettings({ telegram_reminder: { enabled: true, hour: 3 } }).hour, 7);
  const next = mergeReminderSettings(readReminderSettings({}), { enabled: true, hour: 30, locale: "ru", weekly: false });
  assertEquals(next, { enabled: true, hour: 22, weekly: false, quiz: false, locale: "ru" });
  assertEquals(mergeReminderSettings(next, { locale: "fr" }).locale, "ru");
  assertEquals(readReminderSettings({ telegram_reminder: { quiz: "true" } }).quiz, false);
  assertEquals(mergeReminderSettings(next, { quiz: true }).quiz, true);
});

Deno.test("the learner clock is Tashkent time", () => {
  assertEquals(learnerClock(new Date("2026-10-24T20:30:00Z")), { date: "2026-10-25", hour: 1, sunday: true });
  assertEquals(learnerClock(new Date("2026-10-22T14:00:00Z")).hour, 19);
});

Deno.test("no nudge after practice; the nudge mentions streak, reviews and theme", () => {
  assertEquals(dailyReminderText("en", { practisedToday: true, streak: 4, dueReviews: 2, topic: "travel" }), null);
  const en = dailyReminderText("en", { practisedToday: false, streak: 4, dueReviews: 1, topic: "travel" })!;
  assertStringIncludes(en, "4-day streak");
  assertStringIncludes(en, "1 word is due");
  assertStringIncludes(en, "Theme of the week: Travel");
  assertStringIncludes(dailyReminderText("ru", { practisedToday: false, streak: 3, dueReviews: 0, topic: null })!, "3 дня подряд");
  assertStringIncludes(dailyReminderText("ru", { practisedToday: false, streak: 11, dueReviews: 0, topic: null })!, "11 дней");
  assertStringIncludes(dailyReminderText("uz", { practisedToday: false, streak: 0, dueReviews: 0, topic: null })!, "tayyor");
});

Deno.test("the weekly summary counts the week and encourages a fresh start", () => {
  const text = weeklySummaryText("en", { activities: 6, activeDays: 4, skills: 5, topic: "work", themeDone: 2, themeTotal: 5 });
  assertStringIncludes(text, "6 activities");
  assertStringIncludes(text, "4 of 7 days");
  assertStringIncludes(text, "Work theme: 2 of 5");
  assertStringIncludes(weeklySummaryText("ru", { activities: 0, activeDays: 0, skills: 0, topic: null, themeDone: 0, themeTotal: 0 }), "Новая неделя");
});
