// Weekly English report (Sunday evening, Tashkent time) for a learner and the
// parents or teachers who follow their progress link in Telegram.
//
// Pure: summarising a week of attempts, level changes, the focus for next
// week and the Telegram text (HTML parse mode; every value is escaped).
// Loading and sending live in hub/weekly-report.ts.

import type { LevelEntry } from "./english-levels.ts";
import { escapeTelegramHtml, type SocialLocale } from "./english-social-telegram.ts";
import { type Cefr, TODAY_SKILLS, type TodaySkill } from "./english-today.ts";

/** The report goes out on Sunday from this learner-local hour (cron is hourly; later hours catch up). */
export const WEEKLY_REPORT_HOURS = [19, 20, 21] as const;
/** Learners handled per cron run. */
export const WEEKLY_REPORT_BATCH = 150;

const LEARNER_OFFSET_MS = 5 * 3_600_000;

export type WeekAttempt = { skill: string; submitted_at: string; seconds: number | null };

export type WeekSummary = {
  minutes: number;
  activities: number;
  active_days: number;
  by_skill: Partial<Record<TodaySkill, number>>;
};

/** Practice in [from, to): minutes (from time on task), activities per skill and active learner days. */
export const summarizeWeek = (attempts: WeekAttempt[], from: string, to: string): WeekSummary => {
  const start = Date.parse(from);
  const end = Date.parse(to);
  const inWeek = attempts.filter((attempt) => {
    const at = Date.parse(attempt.submitted_at);
    return Number.isFinite(at) && at >= start && at < end && (TODAY_SKILLS as readonly string[]).includes(attempt.skill);
  });
  const by_skill: Partial<Record<TodaySkill, number>> = {};
  for (const attempt of inWeek) by_skill[attempt.skill as TodaySkill] = (by_skill[attempt.skill as TodaySkill] ?? 0) + 1;
  // Time on task is capped per activity so a tab left open does not count as hours of study.
  const seconds = inWeek.reduce((sum, attempt) => sum + Math.max(0, Math.min(3_600, Number(attempt.seconds ?? 0) || 0)), 0);
  return {
    minutes: Math.round(seconds / 60),
    activities: inWeek.length,
    active_days: new Set(inWeek.map((attempt) => new Date(Date.parse(attempt.submitted_at) + LEARNER_OFFSET_MS).toISOString().slice(0, 10))).size,
    by_skill,
  };
};

export type LevelChange = { skill: string; from: Cefr | null; to: Cefr };

/** Per-skill and overall levels that changed during [from, to), comparing each entry to the one before it. */
export const levelChangesBetween = (history: LevelEntry[], from: string, to: string): LevelChange[] => {
  const start = Date.parse(from);
  const end = Date.parse(to);
  const sorted = [...history].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const before = sorted.filter((entry) => Date.parse(entry.at) < start).at(-1) ?? null;
  const during = sorted.filter((entry) => Date.parse(entry.at) >= start && Date.parse(entry.at) < end);
  if (!during.length) return [];
  const last = during.at(-1)!;
  const changes: LevelChange[] = [];
  for (const [skill, level] of Object.entries(last.per_skill)) {
    const previous = (before?.per_skill[skill] ?? null) as Cefr | null;
    if (previous !== level) changes.push({ skill, from: previous, to: level });
  }
  if (last.overall && last.overall !== (before?.overall ?? null)) changes.unshift({ skill: "overall", from: before?.overall ?? null, to: last.overall });
  return changes.slice(0, 8);
};

export type NextFocus =
  | { kind: "topic"; topic: string }
  | { kind: "skill"; skill: TodaySkill }
  | { kind: "habit" };

/**
 * Next week's focus: the grammar topic the learner keeps getting wrong (seen
 * at least twice); otherwise a skill they practise but skipped this week;
 * otherwise simply "a little every day".
 */
export const pickNextFocus = (input: {
  topics: Array<{ topic: string; count: number }>;
  week: WeekSummary;
  /** Skills practised in the last 60 days. */
  practised: string[];
}): NextFocus => {
  const topic = [...input.topics].sort((a, b) => b.count - a.count)[0];
  if (topic && topic.count >= 2) return { kind: "topic", topic: topic.topic };
  const skipped = TODAY_SKILLS.filter((skill) => input.practised.includes(skill) && !input.week.by_skill[skill]);
  if (skipped[0]) return { kind: "skill", skill: skipped[0] };
  if (input.week.activities > 0 && input.week.active_days < 5) return { kind: "habit" };
  const least = TODAY_SKILLS.filter((skill) => input.practised.includes(skill))
    .sort((a, b) => (input.week.by_skill[a] ?? 0) - (input.week.by_skill[b] ?? 0))[0];
  return least ? { kind: "skill", skill: least } : { kind: "habit" };
};

export type WeeklyReportFacts = {
  firstName: string;
  week: WeekSummary;
  xp: number;
  streak: number;
  levelChanges: LevelChange[];
  focus: NextFocus;
};

const SKILL_NAMES: Record<SocialLocale, Record<string, string>> = {
  en: { reading: "Reading", listening: "Listening", writing: "Writing", speaking: "Speaking", grammar: "Grammar", vocabulary: "Vocabulary", immersion: "Immersion", overall: "Overall" },
  ru: { reading: "Чтение", listening: "Аудирование", writing: "Письмо", speaking: "Говорение", grammar: "Грамматика", vocabulary: "Лексика", immersion: "Погружение", overall: "Общий уровень" },
  uz: { reading: "Oʻqish", listening: "Tinglash", writing: "Yozish", speaking: "Gapirish", grammar: "Grammatika", vocabulary: "Lugʻat", immersion: "Immersion", overall: "Umumiy daraja" },
};

const T: Record<SocialLocale, Record<string, string>> = {
  en: {
    titleLearner: "📊 <b>Your English week</b>",
    titleParent: "📊 <b>{name}'s English week</b>",
    learner: "Learner",
    minutes: "⏱ {count} min of practice",
    activities: "✅ {count} activities on {days} of 7 days",
    none: "No practice this week. One short activity a day already makes a difference.",
    xp: "⭐ {count} XP",
    streak: "🔥 {count}-day streak",
    levels: "📈 Level changes:",
    focusTitle: "🎯 <b>Next week:</b>",
    focusTopic: "grammar: {topic}",
    focusSkill: "a {skill} activity",
    focusHabit: "a little English every day",
    open: "Open Schood English",
  },
  ru: {
    titleLearner: "📊 <b>Ваша неделя английского</b>",
    titleParent: "📊 <b>Неделя английского: {name}</b>",
    learner: "Ученик",
    minutes: "⏱ {count} мин практики",
    activities: "✅ заданий: {count}, дней с практикой: {days} из 7",
    none: "На этой неделе занятий не было. Даже одно короткое задание в день даёт результат.",
    xp: "⭐ {count} XP",
    streak: "🔥 серия: {count} дн. подряд",
    levels: "📈 Изменения уровня:",
    focusTitle: "🎯 <b>На следующей неделе:</b>",
    focusTopic: "грамматика: {topic}",
    focusSkill: "задание по разделу «{skill}»",
    focusHabit: "немного английского каждый день",
    open: "Открыть Schood English",
  },
  uz: {
    titleLearner: "📊 <b>Ingliz tili haftangiz</b>",
    titleParent: "📊 <b>{name}: ingliz tili haftasi</b>",
    learner: "Oʻquvchi",
    minutes: "⏱ {count} daqiqa mashq",
    activities: "✅ {count} ta mashq, 7 kundan {days} kun",
    none: "Bu hafta mashq qilinmadi. Kuniga bitta qisqa mashq ham natija beradi.",
    xp: "⭐ {count} XP",
    streak: "🔥 ketma-ket {count} kun",
    levels: "📈 Daraja oʻzgarishlari:",
    focusTitle: "🎯 <b>Keyingi hafta:</b>",
    focusTopic: "grammatika: {topic}",
    focusSkill: "«{skill}» boʻlimidan mashq",
    focusHabit: "har kuni ozgina ingliz tili",
    open: "Schood English ni ochish",
  },
};

const fill = (template: string, params: Record<string, unknown>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => escapeTelegramHtml(params[key] ?? ""));

/** "present-perfect" → "present perfect". */
export const topicLabel = (topic: string): string => topic.replace(/[-_]+/g, " ").trim();

/**
 * The report text. `audience` "parent" names the learner (first name only)
 * and never includes anything the learner wrote.
 */
export const weeklyReportText = (locale: SocialLocale, facts: WeeklyReportFacts, audience: "learner" | "parent"): string => {
  const t = T[locale];
  const skills = SKILL_NAMES[locale];
  const lines: string[] = [
    audience === "parent" ? fill(t.titleParent, { name: facts.firstName || t.learner }) : t.titleLearner,
    "",
  ];
  if (facts.week.activities === 0) {
    lines.push(t.none);
  } else {
    lines.push(fill(t.minutes, { count: facts.week.minutes }));
    lines.push(fill(t.activities, { count: facts.week.activities, days: facts.week.active_days }));
    const bySkill = TODAY_SKILLS
      .filter((skill) => facts.week.by_skill[skill])
      .map((skill) => `${escapeTelegramHtml(skills[skill])} ${facts.week.by_skill[skill]}`);
    if (bySkill.length) lines.push(`   ${bySkill.join(" · ")}`);
    if (facts.xp > 0) lines.push(fill(t.xp, { count: facts.xp }));
  }
  if (facts.streak > 1) lines.push(fill(t.streak, { count: facts.streak }));
  if (facts.levelChanges.length) {
    lines.push("", t.levels);
    for (const change of facts.levelChanges) {
      lines.push(`   ${escapeTelegramHtml(skills[change.skill] ?? change.skill)}: ${change.from ? `${escapeTelegramHtml(change.from)} → ` : ""}<b>${escapeTelegramHtml(change.to)}</b>`);
    }
  }
  const focus = facts.focus.kind === "topic"
    ? fill(t.focusTopic, { topic: topicLabel(facts.focus.topic) })
    : facts.focus.kind === "skill"
    ? fill(t.focusSkill, { skill: skills[facts.focus.skill] })
    : escapeTelegramHtml(t.focusHabit);
  lines.push("", `${t.focusTitle} ${focus}`);
  return lines.join("\n").slice(0, 4000);
};

export const weeklyReportButton = (locale: SocialLocale) => T[locale].open;
