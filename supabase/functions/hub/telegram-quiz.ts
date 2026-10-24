// Daily review quiz in Telegram. The hourly reminder cycle sends the first
// question through send-telegram (study_habit, so quiet hours, the daily cap
// and dedupe apply). Each answer is a button tap that the student bot Worker
// forwards to POST /hub/internal/telegram-quiz; the reply to that tap carries
// the next question (up to three a day), so only the first one counts against
// the notification cap; the daily nudge, when due, rides on that first message.
import { isInternalRequest } from "../_shared/internal-auth.ts";
import { learnerClock } from "../_shared/english-reminders.ts";
import { RETIRED_BOX, scheduleAfterAnswer } from "../_shared/english-review.ts";
import { intervalDaysForBox } from "../_shared/english-words.ts";
import {
  alreadyAnsweredToast,
  answeredText,
  isQuizLocale,
  MAX_QUIZ_QUESTIONS,
  newQuizId,
  parseQuizCallbackData,
  pickNextQuestion,
  type QuizLocale,
  type QuizQuestion,
  type QuizWord,
  questionText,
  quizKeyboard,
  reviewItemQuestion,
  unavailableToast,
  wordQuestion,
} from "../_shared/english-telegram-quiz.ts";

const TABLE = "english_telegram_quiz_questions";
const QUESTION_COLUMNS =
  "id, user_id, language_id, batch_date, position, batch_size, source, source_id, locale, prompt, options, correct_index, explanation, created_at, answered_at, chosen_index, is_correct";

type Row = Record<string, unknown>;
type Pools = { reviews: QuizQuestion[]; words: QuizQuestion[] };

/** The student bot Worker calls with x-worker-secret = TELEGRAM_INTERNAL_SECRET, like telegram-link. */
export const isQuizWorker = (req: Request, serviceRoleKey: string): Promise<boolean> =>
  isInternalRequest(req, serviceRoleKey, Deno.env.get("TELEGRAM_INTERNAL_SECRET"));

const asRecord = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";

/** Due multiple-choice review items and due saved words, as ready questions. */
const loadQuizPools = async (sb: any, userId: string, languageId: string, locale: QuizLocale): Promise<Pools> => {
  const nowIso = new Date().toISOString();
  const [reviewRes, wordRes] = await Promise.all([
    sb.from("learner_review_items")
      .select("id, payload")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .lt("box", RETIRED_BOX)
      .lte("next_due_at", nowIso)
      .order("next_due_at", { ascending: true })
      .limit(30),
    sb.from("user_vocabulary_notebook_entries")
      .select("id, word, next_review_at, metadata, lexicon_entry_id")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .eq("is_archived", false)
      .order("next_review_at", { ascending: true })
      .limit(80),
  ]);
  if (reviewRes.error) throw new Error(`Failed to load review items: ${reviewRes.error.message}`);
  if (wordRes.error) throw new Error(`Failed to load saved words: ${wordRes.error.message}`);

  const reviews = ((reviewRes.data ?? []) as Row[])
    .map((row) => reviewItemQuestion({ id: String(row.id), payload: row.payload }))
    .filter((question): question is QuizQuestion => question !== null);

  const rows = (wordRes.data ?? []) as Row[];
  // Words saved from a deck keep their definition in metadata; others use the shared lexicon.
  const lexiconIds = [...new Set(rows
    .filter((row) => !text(asRecord(row.metadata).definition) && row.lexicon_entry_id)
    .map((row) => String(row.lexicon_entry_id)))].slice(0, 80);
  const lexicon = new Map<string, Row>();
  if (lexiconIds.length) {
    const { data } = await sb.from("language_lexicon_entries").select("id, definition, example").in("id", lexiconIds);
    for (const entry of (data ?? []) as Row[]) lexicon.set(String(entry.id), entry);
  }
  const words: Array<QuizWord & { due: boolean }> = rows.map((row) => {
    const meta = asRecord(row.metadata);
    const fallback = row.lexicon_entry_id ? lexicon.get(String(row.lexicon_entry_id)) : undefined;
    return {
      id: String(row.id),
      word: text(row.word),
      definition: text(meta.definition) || text(fallback?.definition) || null,
      example: text(meta.example) || text(fallback?.example) || null,
      due: String(row.next_review_at ?? "") <= nowIso,
    };
  }).filter((word) => word.word && word.definition);

  const due = words.filter((word) => word.due).slice(0, 10);
  if (!due.length) return { reviews, words: [] };

  const pool = words.map((word) => word.definition!);
  if (new Set(pool.map((entry) => entry.toLowerCase())).size < 4) {
    // Not enough of the learner's own words for wrong answers: borrow deck definitions.
    const { data: decks } = await sb.from("vocabulary_decks")
      .select("id")
      .eq("language_id", languageId)
      .eq("status", "published")
      .limit(40);
    const deckIds = ((decks ?? []) as Row[]).map((deck) => String(deck.id));
    if (deckIds.length) {
      const { data: deckWords } = await sb.from("vocabulary_deck_words").select("definition").in("deck_id", deckIds).limit(120);
      for (const entry of (deckWords ?? []) as Row[]) if (text(entry.definition)) pool.push(text(entry.definition));
    }
  }
  return {
    reviews,
    words: due
      .map((word) => wordQuestion(word, locale, pool))
      .filter((question): question is QuizQuestion => question !== null),
  };
};

const insertQuestion = async (
  sb: any,
  input: { id: string; userId: string; languageId: string; date: string; position: number; batchSize: number; locale: QuizLocale; question: QuizQuestion; sentAt: string | null },
): Promise<"inserted" | "taken"> => {
  const { error } = await sb.from(TABLE).insert({
    id: input.id,
    user_id: input.userId,
    language_id: input.languageId,
    batch_date: input.date,
    position: input.position,
    batch_size: input.batchSize,
    source: input.question.source,
    source_id: input.question.source_id,
    locale: input.locale,
    prompt: input.question.prompt,
    options: input.question.options,
    correct_index: input.question.correct_index,
    explanation: input.question.explanation,
    sent_at: input.sentAt,
  });
  if (error?.code === "23505") return "taken";
  if (error) throw new Error(`Failed to save quiz question: ${error.message}`);
  return "inserted";
};

type Gateway = (body: Record<string, unknown>) => Promise<{ status: number; result: any }>;

/**
 * Sends the day's first question, once per learner-local day. `intro` (the
 * daily nudge) goes on top of it; `carried` says the nudge needs no message
 * of its own.
 */
export const startDailyQuiz = async (input: {
  sb: any;
  userId: string;
  languageId: string;
  locale: QuizLocale;
  date: string;
  appUrl: string;
  intro?: string | null;
  dryRun?: boolean;
  send: Gateway;
}): Promise<{ carried: boolean; report: Record<string, unknown> }> => {
  const { sb, userId, languageId, locale, date } = input;
  const kind = "english_review_quiz";
  const done = (carried: boolean, report: Record<string, unknown>) => ({ carried, report: { user_id: userId, kind, ...report } });
  const { data: existing, error } = await sb.from(TABLE)
    .select("id")
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .eq("batch_date", date)
    .limit(1);
  if (error) throw new Error(`Failed to load quiz history: ${error.message}`);
  if ((existing ?? []).length) return done(true, { skipped: "already_sent" });

  const pools = await loadQuizPools(sb, userId, languageId, locale);
  const question = pickNextQuestion(pools, [], 1);
  if (!question) return done(false, { skipped: "nothing_due" });
  const batchSize = Math.min(MAX_QUIZ_QUESTIONS, pools.reviews.length + pools.words.length);
  const intro = input.intro?.trim();
  const body = intro
    ? `${intro}\n\n${questionText(locale, question, 1, batchSize)}`.slice(0, 4096)
    : questionText(locale, question, 1, batchSize);
  if (input.dryRun) return done(true, { text: body, dry_run: true });

  const id = newQuizId();
  if (await insertQuestion(sb, { id, userId, languageId, date, position: 1, batchSize, locale, question, sentAt: null }) === "taken") {
    return done(true, { skipped: "already_sent" });
  }
  const delivery = await input.send({
    user_id: userId,
    text: body,
    parse_mode: null,
    notification_type: kind,
    category: "study_habit",
    dedupe_key: `english-quiz:${date}`,
    cta_url: `${input.appUrl.replace(/\/$/, "")}/review`,
    reply_markup: quizKeyboard(id, question.options.length),
  });
  const outcome = String(delivery.result?.outcome ?? "");
  if (delivery.status === 200 && outcome === "sent") {
    await sb.from(TABLE).update({ sent_at: new Date().toISOString() }).eq("id", id);
  } else if (!(delivery.status === 200 && outcome.startsWith("defer"))) {
    // Suppressed (cap, quiet preference, blocked) or failed: nothing reached the learner.
    await sb.from(TABLE).delete().eq("id", id).is("answered_at", null);
  }
  // Whatever the gateway decided for this message it would decide for the nudge too.
  return done(true, { status: delivery.status, outcome });
};

const rowQuestion = (row: Row): QuizQuestion | null => {
  const options = Array.isArray(row.options) ? (row.options as unknown[]).map(String) : [];
  const correct = Number(row.correct_index);
  if (options.length < 2 || !Number.isInteger(correct) || correct < 0 || correct >= options.length) return null;
  return {
    source: row.source === "notebook_word" ? "notebook_word" : "review_item",
    source_id: String(row.source_id),
    prompt: String(row.prompt ?? ""),
    options,
    correct_index: correct,
    explanation: text(row.explanation) || null,
  };
};

/** Same scheduling as /hub/review/answer and the notebook flashcards. Skipped if already reviewed elsewhere since sending. */
const recordAnswer = async (sb: any, userId: string, row: Row, correct: boolean): Promise<void> => {
  const now = new Date();
  const sentAt = Date.parse(String(row.created_at ?? ""));
  const reviewedSince = (dueAt: unknown) => Number.isFinite(sentAt) && Date.parse(String(dueAt ?? "")) > sentAt;
  const sourceId = String(row.source_id);
  if (row.source === "review_item") {
    const { data: item } = await sb.from("learner_review_items")
      .select("id, box, next_due_at, times_reviewed")
      .eq("id", sourceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!item || Number(item.box ?? 1) >= RETIRED_BOX || reviewedSince(item.next_due_at)) return;
    const next = scheduleAfterAnswer(Number(item.box ?? 1), correct, now);
    const { error } = await sb.from("learner_review_items").update({
      box: next.box,
      next_due_at: next.next_due_at,
      last_result: correct ? "correct" : "incorrect",
      times_reviewed: Number(item.times_reviewed ?? 0) + 1,
    }).eq("id", sourceId).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return;
  }
  const { data: entry } = await sb.from("user_vocabulary_notebook_entries")
    .select("id, leitner_box, next_review_at, review_count, correct_count, incorrect_count")
    .eq("id", sourceId)
    .eq("user_id", userId)
    .eq("is_archived", false)
    .maybeSingle();
  if (!entry || reviewedSince(entry.next_review_at)) return;
  const box = correct ? Math.min(5, Math.max(1, Number(entry.leitner_box ?? 1)) + 1) : 1;
  const { error } = await sb.from("user_vocabulary_notebook_entries").update({
    leitner_box: box,
    next_review_at: new Date(now.getTime() + intervalDaysForBox(box) * 86_400_000).toISOString(),
    last_reviewed_at: now.toISOString(),
    review_count: Number(entry.review_count ?? 0) + 1,
    correct_count: Number(entry.correct_count ?? 0) + (correct ? 1 : 0),
    incorrect_count: Number(entry.incorrect_count ?? 0) + (correct ? 0 : 1),
  }).eq("id", sourceId).eq("user_id", userId);
  if (error) throw new Error(error.message);
};

export type QuizAnswerResult = {
  ok: boolean;
  status: "answered" | "already_answered" | "unavailable";
  toast: string;
  /** Replacement text for the question message (buttons are removed), or null to leave it. */
  edit_text: string | null;
  /** The next question to send as a reply, with its buttons. */
  next: { text: string; reply_markup: unknown } | null;
};

/** Checks a button tap, records it, and returns the feedback and the next question. */
export const answerTelegramQuiz = async (input: { sb: any; languageId: string; body: Row }): Promise<QuizAnswerResult> => {
  const { sb, languageId, body } = input;
  const hint = isQuizLocale(body.locale) ? body.locale : "en";
  const unavailable = (locale: unknown = hint): QuizAnswerResult => ({
    ok: true, status: "unavailable", toast: unavailableToast(locale), edit_text: null, next: null,
  });

  const tap = parseQuizCallbackData(body.data);
  const telegramUserId = String(body.telegram_user_id ?? "").trim();
  if (!tap || !/^\d{1,20}$/.test(telegramUserId)) return unavailable();

  const [userRes, rowRes] = await Promise.all([
    sb.from("users").select("id").eq("telegram_chat_id", telegramUserId).limit(1),
    sb.from(TABLE).select(QUESTION_COLUMNS).eq("id", tap.id).maybeSingle(),
  ]);
  if (userRes.error) throw new Error(`Failed to resolve Telegram user: ${userRes.error.message}`);
  if (rowRes.error) throw new Error(`Failed to load quiz question: ${rowRes.error.message}`);
  const userId = ((userRes.data ?? []) as Row[])[0]?.id ? String(((userRes.data ?? []) as Row[])[0]!.id) : null;
  const row = rowRes.data as Row | null;
  // A forwarded question tapped by someone else, or an unlinked chat, cannot answer it.
  if (!userId || !row || String(row.user_id) !== userId || String(row.language_id) !== languageId) return unavailable();
  const locale: QuizLocale = isQuizLocale(row.locale) ? row.locale : "en";
  const question = rowQuestion(row);
  if (!question || tap.option >= question.options.length) return unavailable(locale);
  const position = Number(row.position ?? 1);
  const batchSize = Number(row.batch_size ?? 1);

  if (row.answered_at) {
    const chosen = Number(row.chosen_index);
    return {
      ok: true,
      status: "already_answered",
      toast: alreadyAnsweredToast(locale),
      // Re-applying the result clears buttons left behind if the first edit failed.
      edit_text: Number.isInteger(chosen) ? answeredText(locale, question, position, batchSize, chosen).text : null,
      next: null,
    };
  }

  const correct = tap.option === question.correct_index;
  const { data: claimed, error: claimError } = await sb.from(TABLE)
    .update({ answered_at: new Date().toISOString(), chosen_index: tap.option, is_correct: correct })
    .eq("id", tap.id)
    .is("answered_at", null)
    .select("id")
    .maybeSingle();
  if (claimError) throw new Error(`Failed to save quiz answer: ${claimError.message}`);
  if (!claimed) return { ok: true, status: "already_answered", toast: alreadyAnsweredToast(locale), edit_text: null, next: null };

  try {
    await recordAnswer(sb, userId, row, correct);
  } catch (error) {
    console.warn(JSON.stringify({ event: "english_quiz_record_failed", error: error instanceof Error ? error.message : "unknown" }));
  }

  // The next question is a reply to this tap, so it does not use the notification cap.
  const date = String(row.batch_date);
  let next: QuizAnswerResult["next"] = null;
  const { data: batchRows } = await sb.from(TABLE)
    .select("id, position, source_id, is_correct")
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .eq("batch_date", date);
  const batch = (batchRows ?? []) as Row[];
  const isLatest = !batch.some((entry) => Number(entry.position) > position);
  if (isLatest && position < batchSize && date === learnerClock().date) {
    try {
      const pools = await loadQuizPools(sb, userId, languageId, locale);
      const following = pickNextQuestion(pools, batch.map((entry) => String(entry.source_id)), position + 1);
      if (following) {
        const id = newQuizId();
        const saved = await insertQuestion(sb, {
          id, userId, languageId, date, position: position + 1, batchSize, locale, question: following, sentAt: new Date().toISOString(),
        });
        if (saved === "inserted") {
          next = { text: questionText(locale, following, position + 1, batchSize), reply_markup: quizKeyboard(id, following.options.length) };
        }
      }
    } catch (error) {
      console.warn(JSON.stringify({ event: "english_quiz_next_failed", error: error instanceof Error ? error.message : "unknown" }));
    }
  }

  const summary = !next && isLatest && batch.length > 1
    ? { correct: batch.filter((entry) => entry.is_correct === true).length, total: batch.length }
    : null;
  const verdict = answeredText(locale, question, position, batchSize, tap.option, summary);
  return { ok: true, status: "answered", toast: verdict.toast, edit_text: verdict.text, next };
};
