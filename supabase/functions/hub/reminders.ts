// Hourly reminder cycle (pg_cron → POST /hub/internal/reminders). Only learners
// who switched the reminder on and linked Telegram are considered; delivery goes
// through send-telegram, which applies quiet hours, caps and dedupe.
import { loadNotebookStats } from "../_shared/english-learning.ts";
import {
  type AttemptRow,
  type CatalogItem,
  type Cefr,
  currentStreak,
  isCefr as isTodayCefr,
  TODAY_SKILLS,
  type TodaySkill,
  topicWeek,
} from "../_shared/english-today.ts";
import {
  dailyReminderText,
  learnerClock,
  readReminderSettings,
  weeklySummaryText,
} from "../_shared/english-reminders.ts";
import { RETIRED_BOX } from "../_shared/english-review.ts";
import { startDailyQuiz } from "./telegram-quiz.ts";

const MAX_LEARNERS_PER_RUN = 300;

const digestEqual = async (left: string, right: string): Promise<boolean> => {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let mismatch = 0;
  for (let index = 0; index < x.length; index += 1) mismatch |= x[index]! ^ y[index]!;
  return mismatch === 0;
};

/** Cron calls carry the private english_reminder_secret from internal_runtime_secrets. */
export const isReminderWorker = async (sb: any, req: Request): Promise<boolean> => {
  const supplied = req.headers.get("x-worker-secret")?.trim() ?? "";
  if (supplied.length < 32) return false;
  const { data } = await sb
    .from("internal_runtime_secrets")
    .select("secret")
    .eq("key", "english_reminder_secret")
    .maybeSingle();
  const expected = String(data?.secret ?? "").trim();
  return expected.length >= 32 && await digestEqual(supplied, expected);
};

type CycleOptions = {
  sb: any;
  languageId: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  appUrl: string;
  now?: Date;
  dryRun?: boolean;
  /** Test hook: run for these learners whatever their chosen hour. */
  onlyUserIds?: string[];
};

const loadCatalog = async (sb: any, languageId: string): Promise<CatalogItem[]> => {
  const { data, error } = await sb
    .from("learning_content_registry_items")
    .select("id, service_key, source_ref, title, cefr_level, estimated_minutes, difficulty, tags, content_type")
    .eq("language_id", languageId)
    .eq("status", "published")
    .in("content_type", [
      "reading.article",
      "listening.item",
      "writing.prompt",
      "speaking.prompt",
      "grammar.unit",
      "immersion.mission",
      "vocabulary.deck",
    ])
    .limit(2000);
  if (error) throw new Error(`Failed to load catalog: ${error.message}`);
  return (data ?? [])
    .filter((row: Record<string, unknown>) => (TODAY_SKILLS as readonly string[]).includes(String(row.service_key)))
    .map((row: Record<string, unknown>) => ({
      id: String(row.id),
      skill: String(row.service_key) as TodaySkill,
      slug: String(row.source_ref),
      title: String(row.title ?? ""),
      level: isTodayCefr(row.cefr_level) ? row.cefr_level : null,
      minutes: Math.max(1, Number(row.estimated_minutes ?? 10)),
      difficulty: Number(row.difficulty ?? 0.5),
      tags: Array.isArray(row.tags) ? (row.tags as unknown[]).map(String).slice(0, 12) : [],
    }));
};

const loadAttempts = async (sb: any, userId: string, languageId: string): Promise<AttemptRow[]> => {
  const { data } = await sb
    .from("learning_attempts")
    .select("content_item_id, service_key, overall_score, correctness_ratio, submitted_at")
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .in("status", ["submitted", "scored", "failed"])
    .not("submitted_at", "is", null)
    .gte("submitted_at", new Date(Date.now() - 60 * 86_400_000).toISOString())
    .order("submitted_at", { ascending: false })
    .limit(400);
  return ((data ?? []) as Array<Record<string, unknown>>)
    .filter((row) => (TODAY_SKILLS as readonly string[]).includes(String(row.service_key)))
    .map((row) => {
      const raw = row.correctness_ratio ?? row.overall_score;
      const value = Number(raw);
      return {
        content_item_id: String(row.content_item_id ?? ""),
        skill: String(row.service_key) as TodaySkill,
        score: raw === null || raw === undefined || !Number.isFinite(value) ? null : Math.max(0, Math.min(1, value)),
        submitted_at: String(row.submitted_at),
      };
    });
};

const levelReader = (goal: Record<string, unknown>) => {
  const meta = (goal.metadata && typeof goal.metadata === "object" ? goal.metadata : {}) as Record<string, unknown>;
  const placement = (meta.placement && typeof meta.placement === "object" ? meta.placement : {}) as Record<string, unknown>;
  const perSkill = (placement.per_skill && typeof placement.per_skill === "object" ? placement.per_skill : {}) as Record<string, unknown>;
  const overall = isTodayCefr(goal.current_cefr_estimate) ? goal.current_cefr_estimate as Cefr : null;
  return (skill: TodaySkill): Cefr | null => {
    const entry = perSkill[skill];
    const level = typeof entry === "string" ? entry : (entry as Record<string, unknown> | undefined)?.level;
    return isTodayCefr(level) ? level : overall;
  };
};

const send = async (options: CycleOptions, body: Record<string, unknown>) => {
  const response = await fetch(`${options.supabaseUrl}/functions/v1/send-telegram`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.serviceRoleKey}` },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  return { status: response.status, result };
};

export const runReminderCycle = async (options: CycleOptions) => {
  const { sb, languageId } = options;
  const clock = learnerClock(options.now);
  // Learners with the nudge on, plus learners who only want the review quiz.
  const optedIn = async (flag: "enabled" | "quiz") => {
    let query = sb
      .from("learner_language_goals")
      .select("user_id, current_cefr_estimate, metadata")
      .eq("language_id", languageId)
      .eq(`metadata->telegram_reminder->>${flag}`, "true")
      .limit(MAX_LEARNERS_PER_RUN);
    if (options.onlyUserIds?.length) query = query.in("user_id", options.onlyUserIds);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to load reminder settings: ${error.message}`);
    return (data ?? []) as Array<Record<string, unknown>>;
  };
  const [nudgeGoals, quizGoals] = await Promise.all([optedIn("enabled"), optedIn("quiz")]);
  const goals = [...new Map([...nudgeGoals, ...quizGoals].map((goal) => [String(goal.user_id), goal])).values()];

  const due = goals
    .map((goal) => ({ goal, settings: readReminderSettings(goal.metadata) }))
    .filter(({ settings }) => (settings.enabled || settings.quiz) && (options.onlyUserIds?.length || settings.hour === clock.hour));
  if (!due.length) return { hour: clock.hour, considered: 0, sent: [] as unknown[] };

  const userIds = due.map(({ goal }) => String(goal.user_id));
  const { data: users } = await sb.from("users").select("id, telegram_chat_id").in("id", userIds);
  const linked = new Set(((users ?? []) as Array<Record<string, unknown>>)
    .filter((row) => row.telegram_chat_id)
    .map((row) => String(row.id)));
  const catalog = await loadCatalog(sb, languageId);
  const ctaUrl = `${options.appUrl.replace(/\/$/, "")}/today`;
  const sent: unknown[] = [];

  for (const { goal, settings } of due) {
    const userId = String(goal.user_id);
    if (!linked.has(userId)) {
      sent.push({ user_id: userId, skipped: "telegram_not_linked" });
      continue;
    }
    const [attempts, notebook, reviewDue] = await Promise.all([
      loadAttempts(sb, userId, languageId),
      loadNotebookStats(sb, userId, languageId),
      sb.from("learner_review_items")
        .select("id", { head: true, count: "exact" })
        .eq("user_id", userId)
        .eq("language_id", languageId)
        .lt("box", RETIRED_BOX)
        .lte("next_due_at", new Date().toISOString()),
    ]);
    const theme = topicWeek({ date: clock.date, items: catalog, attempts, levelFor: levelReader(goal) });
    const dayStart = new Date(Date.parse(`${clock.date}T00:00:00.000Z`) - 5 * 3_600_000).toISOString();
    const messages: Array<{ kind: string; text: string; dedupe: string }> = [];

    const daily = settings.enabled && dailyReminderText(settings.locale, {
      practisedToday: attempts.some((attempt) => attempt.submitted_at >= dayStart),
      streak: currentStreak(attempts, clock.date),
      dueReviews: notebook.dueCount + (Number(reviewDue.count ?? 0) || 0),
      topic: theme?.topic ?? null,
    });

    // With the quiz on, the nudge rides on the first question: one study-habit
    // message a day instead of two, so the gateway's 24-hour cap is not used up.
    let dailyCarried = false;
    if (settings.quiz) {
      try {
        const quiz = await startDailyQuiz({
          sb,
          userId,
          languageId,
          locale: settings.locale,
          date: clock.date,
          appUrl: options.appUrl,
          intro: daily || null,
          dryRun: options.dryRun,
          send: (body) => send(options, body),
        });
        dailyCarried = quiz.carried;
        sent.push(quiz.report);
      } catch (error) {
        sent.push({ user_id: userId, kind: "english_review_quiz", error: error instanceof Error ? error.message : "unknown" });
      }
    }
    if (daily && !dailyCarried) messages.push({ kind: "english_daily_reminder", text: daily, dedupe: `english-daily:${clock.date}` });

    if (settings.enabled && clock.sunday && settings.weekly) {
      const weekAgo = new Date(Date.parse(dayStart) - 6 * 86_400_000).toISOString();
      const thisWeek = attempts.filter((attempt) => attempt.submitted_at >= weekAgo);
      messages.push({
        kind: "english_weekly_summary",
        text: weeklySummaryText(settings.locale, {
          activities: thisWeek.length,
          activeDays: new Set(thisWeek.map((attempt) => new Date(Date.parse(attempt.submitted_at) + 5 * 3_600_000).toISOString().slice(0, 10))).size,
          skills: new Set(thisWeek.map((attempt) => attempt.skill)).size,
          topic: theme?.topic ?? null,
          themeDone: theme?.steps.filter((step) => step.done).length ?? 0,
          themeTotal: theme?.steps.length ?? 0,
        }),
        dedupe: `english-weekly:${clock.date}`,
      });
    }

    for (const message of messages) {
      if (options.dryRun) {
        sent.push({ user_id: userId, kind: message.kind, text: message.text, dry_run: true });
        continue;
      }
      const delivery = await send(options, {
        user_id: userId,
        text: message.text,
        parse_mode: null,
        notification_type: message.kind,
        category: "study_habit",
        dedupe_key: message.dedupe,
        cta_url: ctaUrl,
      });
      sent.push({ user_id: userId, kind: message.kind, status: delivery.status });
    }
  }
  return { hour: clock.hour, considered: due.length, sent };
};
