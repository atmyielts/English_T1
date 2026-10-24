// Schood English inside Telegram: the Mini App's English section and the
// student bot's /english command (telegram-app/english.ts does the I/O).
//
// Pure helpers only. Review answers use the same rules as the English app:
// missed questions follow english-review.ts (1, 3, 7 days, retired after box
// 3) and saved words follow the vocabulary-notebook flashcards (Leitner boxes
// 1-5 with english-words.ts spacing), so a card answered in Telegram is
// answered everywhere.
import { parseReviewPayload, publicReviewPayload, RETIRED_BOX, scheduleAfterAnswer } from "./english-review.ts";
import { intervalDaysForBox } from "./english-words.ts";

export type TgLocale = "en" | "ru" | "uz";

export const tgLocale = (code: unknown): TgLocale => {
  const value = String(code ?? "").trim().toLowerCase();
  if (value.startsWith("ru")) return "ru";
  if (value.startsWith("uz")) return "uz";
  return "en";
};

export const escapeTelegramHtml = (value: unknown): string =>
  String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

// === Today: the next tasks from the learner's stored plan ===

export type MiniTask = {
  id: string;
  kind: "review" | "activity";
  skill: string;
  title: string;
  minutes: number;
  /** Exact English app route (activities); review tasks open in the Mini App. */
  href: string;
  done: boolean;
};

/**
 * Keeps a link on the English app's own origin; anything else (or nothing)
 * becomes `fallbackPath` on that origin.
 */
export const englishHref = (appUrl: string, href: unknown, fallbackPath: string): string => {
  const base = new URL(appUrl);
  const fallback = new URL(fallbackPath.startsWith("/") ? fallbackPath : `/${fallbackPath}`, base).toString();
  if (typeof href !== "string" || !href.trim()) return fallback;
  try {
    const url = new URL(href.trim(), base);
    return url.origin === base.origin && (url.protocol === "https:" || url.protocol === "http:") ? url.toString() : fallback;
  } catch {
    return fallback;
  }
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/**
 * Tasks from learner_language_daily_plans.tasks (written by hub /today), with
 * done refreshed from today's attempts: an activity is done once its item was
 * submitted today, the review task once nothing is due.
 */
export const planTasks = (input: {
  tasks: unknown;
  appUrl: string;
  doneItemIds: ReadonlySet<string>;
  dueReviews: number;
}): MiniTask[] => {
  const rows = Array.isArray(input.tasks) ? input.tasks : [];
  return rows.flatMap((raw, index) => {
    const row = record(raw);
    const kind = row.intent === "review" || row.kind === "review" ? "review" : "activity";
    const skill = String(row.skill ?? row.service_key ?? "").trim();
    const title = String(row.title ?? "").trim().slice(0, 160);
    if (!skill || (!title && kind === "activity")) return [];
    const itemId = String(row.content_item_id ?? "");
    const done = kind === "review"
      ? input.dueReviews === 0
      : row.done === true || (itemId !== "" && input.doneItemIds.has(itemId));
    const minutes = Math.max(1, Math.min(240, Math.round(Number(row.estimated_minutes ?? row.minutes ?? 10)) || 10));
    return [{
      id: String(row.id ?? `task-${index}`).slice(0, 80),
      kind,
      skill,
      title,
      minutes,
      href: kind === "review" ? englishHref(input.appUrl, "/review", "/review") : englishHref(input.appUrl, row.href, `/${skill}`),
      done,
    }];
  });
};

/** The next `limit` tasks still to do, in plan order. */
export const nextTasks = (tasks: MiniTask[], limit = 3): MiniTask[] => tasks.filter((task) => !task.done).slice(0, limit);

// === Review cards ===

export type ItemCard = { kind: "item"; id: string; step: number } & Record<string, unknown>;
export type WordCard = { kind: "word"; id: string; word: string; definition: string | null; example: string | null };
export type ReviewCard = ItemCard | WordCard;

/**
 * Due missed questions first (oldest due first), then due saved words, skipping
 * ids the learner already passed over in this session. No answer keys leave the server.
 */
export const buildReviewCards = (input: {
  items: Array<{ id?: unknown; kind?: unknown; box?: unknown; payload?: unknown }>;
  words: Array<{ id?: unknown; word?: unknown; definition?: unknown; example?: unknown }>;
  exclude?: Iterable<string>;
  limit?: number;
}): ReviewCard[] => {
  const skip = new Set(input.exclude ?? []);
  const limit = Math.max(1, Math.min(20, input.limit ?? 10));
  const cards: ReviewCard[] = [];
  for (const row of input.items) {
    const id = String(row.id ?? "");
    if (!isUuid(id) || skip.has(id)) continue;
    const payload = parseReviewPayload(row.payload);
    if (!payload) continue;
    cards.push({ kind: "item", id, step: Math.max(1, Number(row.box ?? 1) || 1), ...publicReviewPayload(payload) });
  }
  for (const row of input.words) {
    const id = String(row.id ?? "");
    const word = typeof row.word === "string" ? row.word.trim() : "";
    if (!isUuid(id) || skip.has(id) || !word) continue;
    const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim().slice(0, 400) : null);
    cards.push({ kind: "word", id, word: word.slice(0, 120), definition: text(row.definition), example: text(row.example) });
  }
  return cards.slice(0, limit);
};

/** learner_review_items after an answer: same schedule as hub /review/answer. */
export const reviewItemPatch = (row: { box?: unknown; times_reviewed?: unknown }, correct: boolean, now: Date) => {
  const next = scheduleAfterAnswer(Number(row.box ?? 1) || 1, correct, now);
  return {
    patch: {
      box: next.box,
      next_due_at: next.next_due_at,
      last_result: correct ? "correct" : "incorrect",
      times_reviewed: (Number(row.times_reviewed ?? 0) || 0) + 1,
    },
    retired: next.box >= RETIRED_BOX,
  };
};

/** A correct answer earns XP only if the item was due (hub/xp.ts logReviewAnswer). */
export const reviewAnswerWasDue = (box: unknown, nextDueAt: unknown, now: Date): boolean => {
  const due = Date.parse(String(nextDueAt ?? ""));
  return (Number(box ?? 1) || 1) < RETIRED_BOX && Number.isFinite(due) && due <= now.getTime();
};

/** user_vocabulary_notebook_entries after a flashcard answer: same as vocabulary-notebook "review". */
export const wordReviewPatch = (
  entry: { leitner_box?: unknown; review_count?: unknown; correct_count?: unknown; incorrect_count?: unknown },
  correct: boolean,
  now: Date,
) => {
  const current = Number(entry.leitner_box ?? 1) || 1;
  const box = correct ? Math.min(5, Math.max(1, current + 1)) : 1;
  return {
    leitner_box: box,
    next_review_at: new Date(now.getTime() + intervalDaysForBox(box) * DAY_MS).toISOString(),
    last_reviewed_at: now.toISOString(),
    review_count: (Number(entry.review_count ?? 0) || 0) + 1,
    correct_count: (Number(entry.correct_count ?? 0) || 0) + (correct ? 1 : 0),
    incorrect_count: (Number(entry.incorrect_count ?? 0) || 0) + (correct ? 0 : 1),
  };
};

// === /english in the student bot ===

export const ENGLISH_CALLBACK_PREFIX = "eng:";
export type EnglishCallback = "quiz_on" | "quiz_off" | "status";

export const englishCallbackData = (action: EnglishCallback): string =>
  `${ENGLISH_CALLBACK_PREFIX}${action === "quiz_on" ? "quiz:on" : action === "quiz_off" ? "quiz:off" : "status"}`;

export const parseEnglishCallback = (data: unknown): EnglishCallback | null => {
  if (data === "eng:quiz:on") return "quiz_on";
  if (data === "eng:quiz:off") return "quiz_off";
  if (data === "eng:status") return "status";
  return null;
};

/** Mini App launch parameters (TelegramAppPage reads view and section). */
export const MINI_APP_ENGLISH_ROUTE = "view=english";
export const MINI_APP_REVIEW_ROUTE = "view=english&section=review";

/** A button the Worker turns into Telegram markup: web_app (Mini App route), url or callback. */
export type BotButton = { text: string; web_app_route?: string; url?: string; callback_data?: string };

export type EnglishBotStatus =
  | { linked: false }
  | {
    linked: true;
    placement_done: boolean;
    level: string | null;
    streak: number;
    xp_today: number;
    due_total: number;
    next_task: string | null;
    /** null when the learner cannot set it yet (no English profile). */
    quiz_enabled: boolean | null;
  };

type BotWording = {
  title: string;
  unlinked: string;
  openApp: string;
  noPlacement: string;
  levelTest: string;
  level: (level: string) => string;
  streak: (days: number) => string;
  xp: (xp: number) => string;
  due: (count: number) => string;
  dueNone: string;
  next: string;
  quizOn: string;
  quizOff: string;
  open: string;
  review: (count: number) => string;
  turnOn: string;
  turnOff: string;
  toastOn: string;
  toastOff: string;
  needProfile: string;
};

const BOT_WORDING: Record<TgLocale, BotWording> = {
  en: {
    title: "📚 Schood English",
    unlinked: "Link your Schood account first: open the Mini App, sign in once and press Link Telegram.",
    openApp: "Open Schood Mini App",
    noPlacement: "Take the free level test to get your daily plan.",
    levelTest: "Free level test",
    level: (level) => `Level: ${level}`,
    streak: (days) => `Streak: ${days} day${days === 1 ? "" : "s"}`,
    xp: (xp) => `XP today: ${xp}`,
    due: (count) => `Due for review: ${count}`,
    dueNone: "Nothing to review right now.",
    next: "Next",
    quizOn: "Daily quiz in Telegram: on",
    quizOff: "Daily quiz in Telegram: off",
    open: "Open English",
    review: (count) => count > 0 ? `Review now (${count})` : "Review",
    turnOn: "Turn daily quiz on",
    turnOff: "Turn daily quiz off",
    toastOn: "Daily quiz is on.",
    toastOff: "Daily quiz is off.",
    needProfile: "Finish the free level test first.",
  },
  ru: {
    title: "📚 Schood English",
    unlinked: "Сначала привяжите аккаунт Schood: откройте мини-приложение, войдите один раз и нажмите «Привязать Telegram».",
    openApp: "Открыть мини-приложение",
    noPlacement: "Пройдите бесплатный тест уровня, чтобы получить план на каждый день.",
    levelTest: "Бесплатный тест уровня",
    level: (level) => `Уровень: ${level}`,
    streak: (days) => `Серия: ${days} дн.`,
    xp: (xp) => `XP сегодня: ${xp}`,
    due: (count) => `На повторение: ${count}`,
    dueNone: "Сейчас повторять нечего.",
    next: "Дальше",
    quizOn: "Ежедневный квиз в Telegram: вкл.",
    quizOff: "Ежедневный квиз в Telegram: выкл.",
    open: "Открыть English",
    review: (count) => count > 0 ? `Повторить (${count})` : "Повторение",
    turnOn: "Включить ежедневный квиз",
    turnOff: "Выключить ежедневный квиз",
    toastOn: "Ежедневный квиз включён.",
    toastOff: "Ежедневный квиз выключен.",
    needProfile: "Сначала пройдите бесплатный тест уровня.",
  },
  uz: {
    title: "📚 Schood English",
    unlinked: "Avval Schood akkauntingizni ulang: mini ilovani oching, bir marta kiring va «Telegramni ulash» tugmasini bosing.",
    openApp: "Mini ilovani ochish",
    noPlacement: "Kunlik reja olish uchun bepul daraja testidan oʻting.",
    levelTest: "Bepul daraja testi",
    level: (level) => `Daraja: ${level}`,
    streak: (days) => `Ketma-ketlik: ${days} kun`,
    xp: (xp) => `Bugungi XP: ${xp}`,
    due: (count) => `Takrorlash uchun: ${count}`,
    dueNone: "Hozircha takrorlash yoʻq.",
    next: "Keyingisi",
    quizOn: "Telegramda kunlik test: yoqilgan",
    quizOff: "Telegramda kunlik test: oʻchirilgan",
    open: "English ni ochish",
    review: (count) => count > 0 ? `Takrorlash (${count})` : "Takrorlash",
    turnOn: "Kunlik testni yoqish",
    turnOff: "Kunlik testni oʻchirish",
    toastOn: "Kunlik test yoqildi.",
    toastOff: "Kunlik test oʻchirildi.",
    needProfile: "Avval bepul daraja testidan oʻting.",
  },
};

export const englishBotToast = (locale: TgLocale, key: "on" | "off" | "need_profile"): string =>
  key === "on" ? BOT_WORDING[locale].toastOn : key === "off" ? BOT_WORDING[locale].toastOff : BOT_WORDING[locale].needProfile;

/** The /english reply: Telegram HTML (escaped) plus buttons. */
export const englishBotMessage = (
  locale: TgLocale,
  status: EnglishBotStatus,
  placementUrl: string,
): { text: string; buttons: BotButton[][] } => {
  const words = BOT_WORDING[locale];
  if (!status.linked) {
    return {
      text: `<b>${escapeTelegramHtml(words.title)}</b>\n\n${escapeTelegramHtml(words.unlinked)}`,
      buttons: [[{ text: words.openApp, web_app_route: "" }]],
    };
  }
  if (!status.placement_done) {
    return {
      text: `<b>${escapeTelegramHtml(words.title)}</b>\n\n${escapeTelegramHtml(words.noPlacement)}`,
      buttons: [[{ text: words.levelTest, url: placementUrl }], [{ text: words.open, web_app_route: MINI_APP_ENGLISH_ROUTE }]],
    };
  }
  const facts = [
    status.level ? words.level(status.level) : null,
    words.streak(Math.max(0, status.streak)),
    words.xp(Math.max(0, status.xp_today)),
  ].filter((line): line is string => line !== null).join(" · ");
  const lines = [
    `<b>${escapeTelegramHtml(words.title)}</b>`,
    "",
    escapeTelegramHtml(facts),
    escapeTelegramHtml(status.due_total > 0 ? words.due(status.due_total) : words.dueNone),
  ];
  if (status.next_task) lines.push(`${escapeTelegramHtml(words.next)}: <i>${escapeTelegramHtml(status.next_task.slice(0, 120))}</i>`);
  if (status.quiz_enabled !== null) lines.push("", escapeTelegramHtml(status.quiz_enabled ? words.quizOn : words.quizOff));
  const buttons: BotButton[][] = [
    [{ text: words.open, web_app_route: MINI_APP_ENGLISH_ROUTE }],
    [{ text: words.review(status.due_total), web_app_route: MINI_APP_REVIEW_ROUTE }],
  ];
  if (status.quiz_enabled !== null) {
    buttons.push([status.quiz_enabled
      ? { text: words.turnOff, callback_data: englishCallbackData("quiz_off") }
      : { text: words.turnOn, callback_data: englishCallbackData("quiz_on") }]);
  }
  return { text: lines.join("\n"), buttons };
};
