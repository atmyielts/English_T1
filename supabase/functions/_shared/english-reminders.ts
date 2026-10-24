// Opt-in Telegram reminders for English learners: one nudge on days the
// learner has not practised yet, and a short summary on Sunday. Delivery goes
// through send-telegram, so quiet hours, the daily cap and dedupe still apply.

export type ReminderLocale = "en" | "ru" | "uz";

export type ReminderSettings = {
  enabled: boolean;
  hour: number;
  weekly: boolean;
  /** Daily review quiz in Telegram (english-telegram-quiz.ts); works with or without the nudge. */
  quiz: boolean;
  /** Sunday-evening weekly report in Telegram (english-weekly-report.ts); replaces the short summary. */
  report: boolean;
  locale: ReminderLocale;
};

export const DEFAULT_REMINDER_HOUR = 19;
export const REMINDER_HOURS = { min: 7, max: 22 } as const;
const LEARNER_UTC_OFFSET_HOURS = 5;

const isLocale = (value: unknown): value is ReminderLocale => value === "en" || value === "ru" || value === "uz";

const clampHour = (value: unknown): number => {
  const hour = Math.round(Number(value));
  if (!Number.isFinite(hour)) return DEFAULT_REMINDER_HOUR;
  return Math.min(REMINDER_HOURS.max, Math.max(REMINDER_HOURS.min, hour));
};

/** Reads settings from learner_language_goals.metadata; off unless the learner turned them on. */
export const readReminderSettings = (metadata: unknown): ReminderSettings => {
  const meta = metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {};
  const raw = meta.telegram_reminder && typeof meta.telegram_reminder === "object"
    ? meta.telegram_reminder as Record<string, unknown>
    : {};
  return {
    enabled: raw.enabled === true,
    hour: clampHour(raw.hour ?? DEFAULT_REMINDER_HOUR),
    weekly: raw.weekly !== false,
    quiz: raw.quiz === true,
    report: raw.report === true,
    locale: isLocale(raw.locale) ? raw.locale : "en",
  };
};

export const mergeReminderSettings = (current: ReminderSettings, patch: Record<string, unknown>): ReminderSettings => ({
  enabled: typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
  hour: patch.hour === undefined ? current.hour : clampHour(patch.hour),
  weekly: typeof patch.weekly === "boolean" ? patch.weekly : current.weekly,
  quiz: typeof patch.quiz === "boolean" ? patch.quiz : current.quiz,
  report: typeof patch.report === "boolean" ? patch.report : current.report,
  locale: isLocale(patch.locale) ? patch.locale : current.locale,
});

/** Learner-local (UTC+5) clock: date, hour and whether it is Sunday. */
export const learnerClock = (now = new Date()) => {
  const local = new Date(now.getTime() + LEARNER_UTC_OFFSET_HOURS * 3_600_000);
  return {
    date: local.toISOString().slice(0, 10),
    hour: local.getUTCHours(),
    sunday: local.getUTCDay() === 0,
  };
};

export type DailyFacts = {
  practisedToday: boolean;
  streak: number;
  dueReviews: number;
  topic: string | null;
};

export type WeeklyFacts = {
  activities: number;
  activeDays: number;
  skills: number;
  topic: string | null;
  themeDone: number;
  themeTotal: number;
};

const TOPIC_NAMES: Record<ReminderLocale, Record<string, string>> = {
  en: { travel: "Travel", work: "Work", study: "Study", health: "Health and sport", city: "City life", technology: "Technology", environment: "Environment", culture: "Culture" },
  ru: { travel: "Путешествия", work: "Работа", study: "Учёба", health: "Здоровье и спорт", city: "Жизнь в городе", technology: "Технологии", environment: "Окружающая среда", culture: "Культура" },
  uz: { travel: "Sayohat", work: "Ish", study: "Oʻqish", health: "Salomatlik va sport", city: "Shahar hayoti", technology: "Texnologiya", environment: "Atrof-muhit", culture: "Madaniyat" },
};

const ruDays = (count: number): string => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дня";
  return "дней";
};

/** Plain-text daily nudge, or null when the learner already practised today. */
export const dailyReminderText = (locale: ReminderLocale, facts: DailyFacts): string | null => {
  if (facts.practisedToday) return null;
  const topic = facts.topic ? TOPIC_NAMES[locale][facts.topic] ?? null : null;
  if (locale === "ru") {
    return [
      facts.streak > 0
        ? `Ваша серия: ${facts.streak} ${ruDays(facts.streak)} подряд. Одно короткое занятие сегодня сохранит её.`
        : "Ваше занятие по английскому на сегодня готово.",
      facts.dueReviews > 0 ? `Слов к повторению: ${facts.dueReviews}.` : null,
      topic ? `Тема недели: ${topic}.` : null,
    ].filter(Boolean).join("\n");
  }
  if (locale === "uz") {
    return [
      facts.streak > 0
        ? `Ketma-ket ${facts.streak} kun shugʻullandingiz. Bugun bitta qisqa mashq seriyani saqlaydi.`
        : "Bugungi ingliz tili mashgʻulotingiz tayyor.",
      facts.dueReviews > 0 ? `Takrorlash uchun soʻzlar: ${facts.dueReviews}.` : null,
      topic ? `Hafta mavzusi: ${topic}.` : null,
    ].filter(Boolean).join("\n");
  }
  return [
    facts.streak > 0
      ? `You're on a ${facts.streak}-day streak. One short session today keeps it going.`
      : "Your English for today is ready.",
    facts.dueReviews > 0 ? `${facts.dueReviews} ${facts.dueReviews === 1 ? "word is" : "words are"} due for review.` : null,
    topic ? `Theme of the week: ${topic}.` : null,
  ].filter(Boolean).join("\n");
};

/** Plain-text Sunday summary of the last seven days. */
export const weeklySummaryText = (locale: ReminderLocale, facts: WeeklyFacts): string => {
  const topic = facts.topic ? TOPIC_NAMES[locale][facts.topic] ?? null : null;
  const theme = topic && facts.themeTotal > 0;
  if (locale === "ru") {
    if (facts.activities === 0) return "На этой неделе занятий не было. Новая неделя — хорошее время начать: одно задание в день уже даёт результат.";
    return [
      "Ваша неделя английского:",
      `• заданий: ${facts.activities}`,
      `• дней с практикой: ${facts.activeDays} из 7`,
      `• разделов: ${facts.skills} из 7`,
      theme ? `• тема «${topic}»: ${facts.themeDone} из ${facts.themeTotal}` : null,
    ].filter(Boolean).join("\n");
  }
  if (locale === "uz") {
    if (facts.activities === 0) return "Bu hafta mashq qilinmadi. Yangi hafta boshlash uchun yaxshi vaqt: kuniga bitta mashq ham natija beradi.";
    return [
      "Ingliz tili haftangiz:",
      `• mashqlar: ${facts.activities}`,
      `• mashq qilingan kunlar: 7 dan ${facts.activeDays}`,
      `• boʻlimlar: 7 dan ${facts.skills}`,
      theme ? `• «${topic}» mavzusi: ${facts.themeTotal} dan ${facts.themeDone}` : null,
    ].filter(Boolean).join("\n");
  }
  if (facts.activities === 0) return "No English practice this week. A new week is a good time to start: one activity a day already adds up.";
  return [
    "Your English week:",
    `• ${facts.activities} ${facts.activities === 1 ? "activity" : "activities"}`,
    `• ${facts.activeDays} of 7 days practised`,
    `• ${facts.skills} of 7 skills`,
    theme ? `• ${topic} theme: ${facts.themeDone} of ${facts.themeTotal}` : null,
  ].filter(Boolean).join("\n");
};
