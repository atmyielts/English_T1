// Schood English in Telegram (telegram-app actions).
//
// Mini App (initData-verified, linked learner; same auth as other actions):
//   english_today          streak, XP today, level, due reviews, next 3 plan tasks
//   english_review_next    { exclude?: [id] } → due cards: missed questions, then saved words
//   english_review_answer  { kind: "item", id, answer } | { kind: "word", id, outcome: "correct"|"incorrect" }
// Student bot Worker (x-worker-secret = TELEGRAM_INTERNAL_SECRET, before initData):
//   english_bot_status     { telegram_user_id, language_code } → /english text + buttons
//   english_bot_quiz       { telegram_user_id, language_code, enabled } → toggles the daily quiz
//
// Review uses the same rows and rules as hub /review and vocabulary-notebook,
// with no entitlement gate (the hub review routes have none either), so
// progress is one system. Pure rules: _shared/english-telegram-app.ts.
import { isInternalRequest } from "../_shared/internal-auth.ts";
import { checkReviewAnswer, parseReviewPayload, RETIRED_BOX } from "../_shared/english-review.ts";
import { mergeReminderSettings, readReminderSettings } from "../_shared/english-reminders.ts";
import { currentStreak, isCefr, TODAY_SKILLS, type TodaySkill } from "../_shared/english-today.ts";
import { learnerDate, xpByDay } from "../_shared/english-xp.ts";
import {
  buildReviewCards,
  englishBotMessage,
  englishBotToast,
  type EnglishBotStatus,
  isUuid,
  nextTasks,
  planTasks,
  reviewAnswerWasDue,
  reviewItemPatch,
  tgLocale,
  wordReviewPatch,
} from "../_shared/english-telegram-app.ts";

type Row = Record<string, unknown>;
type Result = { status: number; body: Record<string, unknown> };

export const ENGLISH_APP_ACTIONS = new Set(["english_today", "english_review_next", "english_review_answer"]);
export const ENGLISH_WORKER_ACTIONS = new Set(["english_bot_status", "english_bot_quiz"]);

// Same primary activity types as hub/xp.ts: sub-items earn no XP of their own.
const PRIMARY_CONTENT_TYPES = new Set([
  "reading.article", "listening.item", "writing.prompt", "speaking.prompt", "grammar.unit", "immersion.mission", "vocabulary.deck",
]);
const DONE_STATUSES = ["submitted", "scored", "failed"];
const LEARNER_OFFSET_MS = 5 * 3_600_000;

const record = (value: unknown): Row => (value && typeof value === "object" && !Array.isArray(value) ? value as Row : {});
const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const appUrl = (): string => (Deno.env.get("ENGLISH_APP_URL") ?? "https://english.schood.online").replace(/\/$/, "");

const englishLanguageId = async (sb: any): Promise<string> => {
  const { data, error } = await sb.from("languages").select("id").eq("code", "en").maybeSingle();
  if (error || !data?.id) throw new Error("Language not found");
  return String(data.id);
};

const scoreOf = (row: Row): number | null => {
  const raw = row.correctness_ratio ?? row.overall_score;
  const value = Number(raw);
  return raw === null || raw === undefined || !Number.isFinite(value) ? null : Math.max(0, Math.min(1, value));
};

/** Start of the learner's (UTC+5) day containing `now`, as an instant. */
const learnerDayStart = (now: Date): string => {
  const local = new Date(now.getTime() + LEARNER_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - LEARNER_OFFSET_MS).toISOString();
};

const countOf = (result: { count?: number | null; error?: { message: string } | null }, what: string): number => {
  if (result.error) throw new Error(`Failed to count ${what}: ${result.error.message}`);
  return Number(result.count ?? 0) || 0;
};

/** The Today summary shared by the Mini App and /english. */
const loadToday = async (sb: any, userId: string, languageId: string, now = new Date()) => {
  const nowIso = now.toISOString();
  const utcToday = nowIso.slice(0, 10);
  const localToday = learnerDate(now);
  const [goalRes, attemptsRes, reviewLogRes, itemsDueRes, wordsDueRes, plansRes, duelsRes] = await Promise.all([
    sb.from("learner_language_goals")
      .select("current_cefr_estimate, target_cefr, metadata")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .maybeSingle(),
    sb.from("learning_attempts")
      .select("id, content_item_id, service_key, correctness_ratio, overall_score, submitted_at, learning_content_registry_items(content_type)")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .in("status", DONE_STATUSES)
      .not("submitted_at", "is", null)
      .gte("submitted_at", new Date(now.getTime() - 60 * 86_400_000).toISOString())
      .order("submitted_at", { ascending: false })
      .limit(400),
    sb.from("learner_review_answer_log")
      .select("review_item_id, answered_at")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .eq("correct", true)
      .eq("was_due", true)
      .gte("answered_at", learnerDayStart(now))
      .limit(500),
    sb.from("learner_review_items")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .lt("box", RETIRED_BOX)
      .lte("next_due_at", nowIso),
    sb.from("user_vocabulary_notebook_entries")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .eq("is_archived", false)
      .lte("next_review_at", nowIso),
    sb.from("learner_language_daily_plans")
      .select("plan_date, status, tasks")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .in("plan_date", [...new Set([localToday, utcToday])]),
    // Today's XP from finished vocabulary duels (capped in xpByDay).
    sb.from("english_duel_players")
      .select("xp, xp_at")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .gt("xp", 0)
      .gte("xp_at", learnerDayStart(now))
      .limit(50),
  ]);
  if (goalRes.error) throw new Error(`Failed to load English profile: ${goalRes.error.message}`);
  if (attemptsRes.error) throw new Error(`Failed to load attempts: ${attemptsRes.error.message}`);
  if (plansRes.error) throw new Error(`Failed to load today's plan: ${plansRes.error.message}`);

  const goal = goalRes.data as Row | null;
  const meta = record(goal?.metadata);
  const placement = record(meta.placement);
  const attempts = ((attemptsRes.data ?? []) as Row[]).filter((row) => (TODAY_SKILLS as readonly string[]).includes(String(row.service_key)));
  const streak = currentStreak(attempts.map((row) => ({
    content_item_id: String(row.content_item_id ?? ""),
    skill: String(row.service_key) as TodaySkill,
    score: scoreOf(row),
    submitted_at: String(row.submitted_at),
  })), utcToday);

  const plans = (plansRes.data ?? []) as Row[];
  const plan = plans.find((row) => row.plan_date === localToday) ?? plans.find((row) => row.plan_date === utcToday) ?? null;
  const xpDays = xpByDay({
    attempts: attempts
      .filter((row) => PRIMARY_CONTENT_TYPES.has(String(record(row.learning_content_registry_items).content_type ?? "")))
      .map((row) => ({ id: String(row.id), content_item_id: String(row.content_item_id ?? ""), score: scoreOf(row), submitted_at: String(row.submitted_at) })),
    reviews: reviewLogRes.error ? [] : ((reviewLogRes.data ?? []) as Row[]).map((row) => ({
      item_id: String(row.review_item_id), correct: true, was_due: true, answered_at: String(row.answered_at),
    })),
    goalDates: plans.filter((row) => row.status === "completed").map((row) => String(row.plan_date)),
    duels: duelsRes.error ? [] : ((duelsRes.data ?? []) as Row[]).map((row) => ({ xp: Number(row.xp ?? 0) || 0, at: String(row.xp_at) })),
  });

  const dueItems = countOf(itemsDueRes, "review items");
  const dueWords = countOf(wordsDueRes, "saved words");
  const planDate = plan ? String(plan.plan_date) : null;
  const doneItemIds = new Set(attempts
    .filter((row) => planDate && (String(row.submitted_at).slice(0, 10) === planDate || learnerDate(String(row.submitted_at)) === planDate))
    .map((row) => String(row.content_item_id ?? "")));
  const tasks = plan ? planTasks({ tasks: plan.tasks, appUrl: appUrl(), doneItemIds, dueReviews: dueItems + dueWords }) : [];

  return {
    goal_exists: Boolean(goal),
    reminder: readReminderSettings(meta),
    summary: {
      placement_done: Boolean(placement.completed_at) || isCefr(goal?.current_cefr_estimate),
      level: isCefr(goal?.current_cefr_estimate) ? String(goal!.current_cefr_estimate) : null,
      target_level: isCefr(goal?.target_cefr) ? String(goal!.target_cefr) : null,
      streak,
      xp_today: xpDays.get(localToday)?.total ?? 0,
      due: { items: dueItems, words: dueWords, total: dueItems + dueWords },
      plan: {
        ready: Boolean(plan),
        date: planDate,
        total: tasks.length,
        done: tasks.filter((task) => task.done).length,
        next: nextTasks(tasks, 3),
      },
      app_url: appUrl(),
    },
  };
};

const loadReviewCards = async (sb: any, userId: string, languageId: string, exclude: string[]) => {
  const nowIso = new Date().toISOString();
  const [itemsRes, wordsRes, itemsDueRes, wordsDueRes] = await Promise.all([
    sb.from("learner_review_items")
      .select("id, kind, payload, box")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .lt("box", RETIRED_BOX)
      .lte("next_due_at", nowIso)
      .order("next_due_at", { ascending: true })
      .limit(30),
    sb.from("user_vocabulary_notebook_entries")
      .select("id, word, context_text, metadata, lexicon_entry_id")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .eq("is_archived", false)
      .lte("next_review_at", nowIso)
      .order("next_review_at", { ascending: true })
      .limit(30),
    sb.from("learner_review_items")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .lt("box", RETIRED_BOX)
      .lte("next_due_at", nowIso),
    sb.from("user_vocabulary_notebook_entries")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .eq("is_archived", false)
      .lte("next_review_at", nowIso),
  ]);
  if (itemsRes.error) throw new Error(`Failed to load review items: ${itemsRes.error.message}`);
  if (wordsRes.error) throw new Error(`Failed to load saved words: ${wordsRes.error.message}`);
  const wordRows = (wordsRes.data ?? []) as Row[];
  // Words saved from a deck keep their definition in metadata; others use the shared lexicon.
  const lexiconIds = [...new Set(wordRows
    .filter((row) => !text(record(row.metadata).definition) && row.lexicon_entry_id)
    .map((row) => String(row.lexicon_entry_id)))];
  const lexicon = new Map<string, Row>();
  if (lexiconIds.length) {
    const { data } = await sb.from("language_lexicon_entries").select("id, definition, example").in("id", lexiconIds);
    for (const entry of (data ?? []) as Row[]) lexicon.set(String(entry.id), entry);
  }
  const items = countOf(itemsDueRes, "review items");
  const words = countOf(wordsDueRes, "saved words");
  return {
    due: { items, words, total: items + words },
    cards: buildReviewCards({
      items: (itemsRes.data ?? []) as Row[],
      words: wordRows.map((row) => {
        const meta = record(row.metadata);
        const fallback = row.lexicon_entry_id ? lexicon.get(String(row.lexicon_entry_id)) : undefined;
        return {
          id: row.id,
          word: row.word,
          definition: text(meta.definition) || text(fallback?.definition) || null,
          example: text(meta.example) || text(fallback?.example) || text(row.context_text) || null,
        };
      }),
      exclude,
      limit: 10,
    }),
  };
};

const answerItem = async (sb: any, userId: string, languageId: string, id: string, answer: unknown): Promise<Result> => {
  const { data: row, error } = await sb.from("learner_review_items")
    .select("id, payload, box, times_reviewed, next_due_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load review item: ${error.message}`);
  const payload = row ? parseReviewPayload((row as Row).payload) : null;
  if (!row || !payload) return { status: 404, body: { error: "Review item not found" } };
  const now = new Date();
  const checked = checkReviewAnswer(payload, answer);
  const next = reviewItemPatch(row as Row, checked.correct, now);
  const { error: updateError } = await sb.from("learner_review_items").update(next.patch).eq("id", id).eq("user_id", userId);
  if (updateError) throw new Error(`Failed to save review answer: ${updateError.message}`);
  // XP log, as hub/xp.ts logReviewAnswer: never fails the answer itself.
  const { error: logError } = await sb.from("learner_review_answer_log").insert({
    user_id: userId,
    language_id: languageId,
    review_item_id: id,
    correct: checked.correct,
    was_due: reviewAnswerWasDue((row as Row).box, (row as Row).next_due_at, now),
    answered_at: now.toISOString(),
  });
  if (logError) console.error(JSON.stringify({ event: "english_review_answer_log_failed", user_id: userId, message: logError.message }));
  return { status: 200, body: { ok: true, ...checked, retired: next.retired, next_due_at: next.patch.next_due_at } };
};

const answerWord = async (sb: any, userId: string, languageId: string, id: string, outcome: unknown): Promise<Result> => {
  if (outcome !== "correct" && outcome !== "incorrect") return { status: 422, body: { error: "outcome must be correct or incorrect" } };
  const { data: entry, error } = await sb.from("user_vocabulary_notebook_entries")
    .select("id, leitner_box, review_count, correct_count, incorrect_count")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .eq("is_archived", false)
    .maybeSingle();
  if (error) throw new Error(`Failed to load saved word: ${error.message}`);
  if (!entry) return { status: 404, body: { error: "Card not found" } };
  const patch = wordReviewPatch(entry as Row, outcome === "correct", new Date());
  const { error: updateError } = await sb.from("user_vocabulary_notebook_entries")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId)
    .eq("language_id", languageId);
  if (updateError) throw new Error(`Failed to save word review: ${updateError.message}`);
  return { status: 200, body: { ok: true, correct: outcome === "correct", box: patch.leitner_box, next_review_at: patch.next_review_at } };
};

/** Mini App actions for a linked learner. */
export const handleEnglishAppAction = async (sb: any, userId: string, action: string, body: Row): Promise<Result> => {
  const languageId = await englishLanguageId(sb);
  if (action === "english_today") {
    const today = await loadToday(sb, userId, languageId);
    return { status: 200, body: { ok: true, ...today.summary, quiz: { enabled: today.reminder.quiz, can_toggle: today.goal_exists } } };
  }
  if (action === "english_review_next") {
    const exclude = (Array.isArray(body.exclude) ? body.exclude : []).map(String).filter(isUuid).slice(0, 200);
    return { status: 200, body: { ok: true, ...(await loadReviewCards(sb, userId, languageId, exclude)) } };
  }
  const id = String(body.id ?? "").trim();
  if (!isUuid(id)) return { status: 422, body: { error: "id is required" } };
  if (body.kind === "word") return await answerWord(sb, userId, languageId, id, body.outcome);
  if (body.kind === "item") return await answerItem(sb, userId, languageId, id, body.answer);
  return { status: 422, body: { error: "kind must be item or word" } };
};

const statusFor = async (sb: any, userId: string, languageId: string): Promise<{ status: EnglishBotStatus; goalExists: boolean }> => {
  const today = await loadToday(sb, userId, languageId);
  return {
    goalExists: today.goal_exists,
    status: {
      linked: true,
      placement_done: today.summary.placement_done,
      level: today.summary.level,
      streak: today.summary.streak,
      xp_today: today.summary.xp_today,
      due_total: today.summary.due.total,
      next_task: today.summary.plan.next.find((task) => task.kind === "activity")?.title ?? null,
      quiz_enabled: today.goal_exists ? today.reminder.quiz : null,
    },
  };
};

/** Student bot Worker actions; null when the request is not one of them. */
export const handleEnglishWorkerAction = async (
  sb: any,
  req: Request,
  action: string,
  body: Row,
  serviceRoleKey: string,
): Promise<Result | null> => {
  if (!ENGLISH_WORKER_ACTIONS.has(action)) return null;
  if (!(await isInternalRequest(req, serviceRoleKey, Deno.env.get("TELEGRAM_INTERNAL_SECRET")))) {
    return { status: 401, body: { error: "Unauthorized" } };
  }
  const locale = tgLocale(body.language_code);
  const placementUrl = `${appUrl()}/check`;
  const telegramUserId = String(body.telegram_user_id ?? "").trim();
  if (!/^\d{1,20}$/.test(telegramUserId)) return { status: 400, body: { error: "valid telegram_user_id required" } };
  const { data: users, error } = await sb.from("users").select("id").eq("telegram_chat_id", telegramUserId).limit(1);
  if (error) throw new Error(`Failed to resolve linked user: ${error.message}`);
  const userId = ((users ?? []) as Row[])[0]?.id ? String(((users ?? []) as Row[])[0]!.id) : null;
  if (!userId) return { status: 200, body: { ok: true, linked: false, toast: null, message: englishBotMessage(locale, { linked: false }, placementUrl) } };

  const languageId = await englishLanguageId(sb);
  let toast: string | null = null;
  if (action === "english_bot_quiz") {
    const { data: goal, error: goalError } = await sb.from("learner_language_goals")
      .select("metadata")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .maybeSingle();
    if (goalError) throw new Error(`Failed to load English profile: ${goalError.message}`);
    if (!goal) {
      toast = englishBotToast(locale, "need_profile");
    } else {
      const metadata = record((goal as Row).metadata);
      const enabled = body.enabled === true;
      // A learner who never opened reminder settings gets quiz questions in their Telegram language.
      const patch: Row = { quiz: enabled };
      if (!metadata.telegram_reminder) patch.locale = locale;
      const next = mergeReminderSettings(readReminderSettings(metadata), patch);
      const { error: saveError } = await sb.from("learner_language_goals")
        .update({ metadata: { ...metadata, telegram_reminder: next } })
        .eq("user_id", userId)
        .eq("language_id", languageId);
      if (saveError) throw new Error(`Failed to save reminders: ${saveError.message}`);
      toast = englishBotToast(locale, enabled ? "on" : "off");
    }
  }
  const { status } = await statusFor(sb, userId, languageId);
  return { status: 200, body: { ok: true, linked: true, toast, message: englishBotMessage(locale, status, placementUrl) } };
};
