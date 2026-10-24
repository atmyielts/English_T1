// ONE word store for a learner: the English notebook
// (user_vocabulary_notebook_entries) is the source of truth everywhere.
//
// The platform vocabulary drill (`vocab-drill`, /vocab-drill), the Telegram
// Mini App practice tab (`vocab_next`, `vocab_review`) and the student bot's
// /drill used their own table, vocab_drill_cards (SM-2, a 120-word IELTS AWL
// deck). They now read and write the notebook through this module, with the
// same FSRS scheduler as the English app (english-srs.ts), so a word reviewed
// anywhere is reviewed everywhere.
//
// Old drill cards are moved into the notebook once (migration
// 20261026140000_english_word_store_unify.sql, and lazily here for anything
// written by old code after it ran): a learner who actually used the drill
// keeps every card and its schedule; cards that were only auto-seeded and
// never reviewed are not copied (they would flood My words). A learner with
// no saved words who opens a drill gets the AWL starter words, twenty a day.
//
// The drill APIs keep their response shapes ({ id, word, definition, example,
// interval, repetitions, last_review }), so old clients keep working; `id` is
// now the notebook entry id (old card ids are still accepted on review).

import {
  easeFromDifficulty,
  type Grade,
  notebookReviewPatch,
  parseSrsState,
  type SrsState,
  starterDueAt,
  stateFromSm2,
} from "./english-srs.ts";

type Row = Record<string, unknown>;

export const DRILL_SOURCE_TYPE = "vocab-drill";
export const STARTER_SOURCE_TYPE = "ielts-awl";
export const STARTER_SOURCE_LABEL = "IELTS Academic Word List";
const DAY_MS = 86_400_000;

const asRecord = (value: unknown): Row => (value && typeof value === "object" && !Array.isArray(value) ? value as Row : {});
const text = (value: unknown, max = 400): string => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Same normalisation as vocabulary-notebook: lower case, single spaces, no punctuation at the ends. */
export const normalizeWord = (raw: string): string =>
  String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");

// ---------------------------------------------------------------------------
// Pure mapping (tested)
// ---------------------------------------------------------------------------

export type DrillCard = {
  id: string;
  word: string;
  definition: string;
  example: string | null;
  interval: number;
  repetitions: number;
  last_review: string | null;
};

/** A notebook entry in the drill's card shape. */
export const notebookToDrillCard = (row: Row, lexiconDefinition: string | null = null): DrillCard => {
  const meta = asRecord(row.metadata);
  const state = parseSrsState(meta.srs);
  const last = text(row.last_reviewed_at, 40) || null;
  const next = text(row.next_review_at, 40);
  const intervalDays = last && next ? Math.max(1, Math.round((Date.parse(next) - Date.parse(last)) / DAY_MS)) : 1;
  return {
    id: String(row.id ?? ""),
    word: text(row.word, 200),
    definition: text(meta.definition, 600) || lexiconDefinition || "",
    example: text(meta.example, 600) || text(row.context_text, 600) || null,
    interval: Number.isFinite(intervalDays) ? intervalDays : 1,
    repetitions: state ? state.reps : Math.max(0, Number(row.correct_count ?? 0) || 0),
    last_review: last ? last.slice(0, 10) : null,
  };
};

export type DrillCardRow = {
  id: string;
  word: string;
  definition: string | null;
  example: string | null;
  interval: number | null;
  ease_factor: number | null;
  repetitions: number | null;
  next_review: string | null;
  last_review: string | null;
  created_at: string | null;
};

/** A learner "used" the drill if they reviewed a card or added their own words (after the auto-seed). */
const engaged = (card: DrillCardRow, deckCreatedAt: string | null): boolean => {
  if (card.last_review || Number(card.repetitions ?? 0) > 0) return true;
  if (!card.created_at || !deckCreatedAt) return false;
  return Date.parse(card.created_at) - Date.parse(deckCreatedAt) > 60_000;
};

/**
 * Which old drill cards to copy: all of them for a learner who used the drill
 * (so they keep the whole deck), none for one whose cards were only seeded.
 */
export const drillCardsToImport = (cards: DrillCardRow[], deckCreatedAt: string | null): DrillCardRow[] =>
  cards.some((card) => engaged(card, deckCreatedAt)) ? cards : [];

/** The notebook row for one old drill card. Unreviewed cards are introduced twenty a day. */
export const drillCardToNotebookRow = (
  card: DrillCardRow,
  input: { userId: string; languageId: string; now: Date; newIndex: number },
): Row | null => {
  const normalized = normalizeWord(card.word);
  if (!normalized) return null;
  const state: SrsState | null = stateFromSm2(card, input.now);
  const reps = Math.max(0, Math.floor(Number(card.repetitions ?? 0) || 0));
  const nextReview = card.next_review && Number.isFinite(Date.parse(card.next_review))
    ? new Date(card.next_review).toISOString()
    : input.now.toISOString();
  return {
    user_id: input.userId,
    language_id: input.languageId,
    word: text(card.word, 200),
    normalized_word: normalized,
    source_type: DRILL_SOURCE_TYPE,
    source_label: STARTER_SOURCE_LABEL,
    leitner_box: state ? (state.s < 2 ? 1 : state.s < 4 ? 2 : state.s < 8 ? 3 : state.s < 16 ? 4 : 5) : 1,
    next_review_at: state ? nextReview : starterDueAt(input.newIndex, input.now),
    last_reviewed_at: state ? state.last : null,
    review_count: state ? reps : 0,
    correct_count: state ? reps : 0,
    incorrect_count: 0,
    metadata: {
      definition: text(card.definition, 600) || null,
      example: text(card.example, 600) || null,
      imported_from: "vocab_drill",
      ...(state ? { srs: state } : {}),
    },
  };
};

/** Notebook rows for the starter deck, for a learner with no saved words. */
export const starterRows = (
  seed: ReadonlyArray<readonly [string, string, string]>,
  input: { userId: string; languageId: string; now: Date },
): Row[] =>
  seed.flatMap(([word, definition, example], index) => {
    const normalized = normalizeWord(word);
    if (!normalized) return [];
    return [{
      user_id: input.userId,
      language_id: input.languageId,
      word,
      normalized_word: normalized,
      source_type: STARTER_SOURCE_TYPE,
      source_label: STARTER_SOURCE_LABEL,
      next_review_at: starterDueAt(index, input.now),
      metadata: { definition, example, starter_deck: "ielts_awl" },
    }];
  });

// ---------------------------------------------------------------------------
// Database operations
// ---------------------------------------------------------------------------

const NOTEBOOK_COLUMNS =
  "id, word, normalized_word, context_text, leitner_box, next_review_at, last_reviewed_at, review_count, correct_count, incorrect_count, metadata, lexicon_entry_id";

export const englishLanguageId = async (sb: any): Promise<string | null> => {
  const { data } = await sb.from("languages").select("id").eq("code", "en").limit(1).maybeSingle();
  return data?.id ? String(data.id) : null;
};

/**
 * Moves any old drill cards not yet moved (written by old code) into the
 * notebook. Cheap when there is nothing to do: one indexed query. Never
 * throws; a missing `imported_at` column (migration not run yet) just skips.
 */
export const importDrillCards = async (sb: any, userId: string, languageId: string, now = new Date()): Promise<number> => {
  try {
    const { data, error } = await sb
      .from("vocab_drill_cards")
      .select("id, word, definition, example, interval, ease_factor, repetitions, next_review, last_review, created_at, vocab_drill_decks(created_at)")
      .eq("user_id", userId)
      .is("imported_at", null)
      .limit(500);
    if (error || !Array.isArray(data) || !data.length) return 0;
    const cards = data as Array<DrillCardRow & { vocab_drill_decks?: unknown }>;
    const deck = asRecord(Array.isArray(cards[0]?.vocab_drill_decks) ? (cards[0]!.vocab_drill_decks as unknown[])[0] : cards[0]?.vocab_drill_decks);
    const chosen = drillCardsToImport(cards, text(deck.created_at, 40) || null);
    let newIndex = 0;
    const rows = chosen.flatMap((card) => {
      const row = drillCardToNotebookRow(card, { userId, languageId, now, newIndex });
      if (row && !row.last_reviewed_at) newIndex += 1;
      return row ? [row] : [];
    });
    if (rows.length) {
      // The notebook wins: words already saved keep their own history.
      const { error: insertError } = await sb
        .from("user_vocabulary_notebook_entries")
        .upsert(rows, { onConflict: "user_id,language_id,normalized_word", ignoreDuplicates: true });
      if (insertError) return 0;
    }
    await sb.from("vocab_drill_cards").update({ imported_at: now.toISOString() }).in("id", cards.map((card) => card.id));
    return rows.length;
  } catch {
    return 0;
  }
};

/**
 * For a learner who has never saved a word (archived ones count, so a learner
 * who cleared their list is not refilled), adds the starter deck when they
 * open a drill. Returns words added.
 */
export const ensureStarterWords = async (
  sb: any,
  userId: string,
  languageId: string,
  seed: ReadonlyArray<readonly [string, string, string]>,
  now = new Date(),
): Promise<number> => {
  const { count, error: countError } = await sb
    .from("user_vocabulary_notebook_entries")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", userId)
    .eq("language_id", languageId);
  if (countError || (count ?? 0) > 0) return 0;
  // Marks that the starter deck was offered (also what old code looked for).
  const { data: deck } = await sb.from("vocab_drill_decks").select("id").eq("user_id", userId).eq("source", "ielts_awl").maybeSingle();
  if (!deck?.id) await sb.from("vocab_drill_decks").insert({ user_id: userId, name: STARTER_SOURCE_LABEL, source: "ielts_awl" });
  const rows = starterRows(seed, { userId, languageId, now });
  const { data, error } = await sb
    .from("user_vocabulary_notebook_entries")
    .upsert(rows, { onConflict: "user_id,language_id,normalized_word", ignoreDuplicates: true })
    .select("id");
  return error ? 0 : (data ?? []).length;
};

const lexiconDefinitions = async (sb: any, rows: Row[]): Promise<Map<string, string>> => {
  const ids = [...new Set(rows.filter((row) => !text(asRecord(row.metadata).definition)).map((row) => String(row.lexicon_entry_id ?? "")).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data } = await sb.from("language_lexicon_entries").select("id, definition").in("id", ids);
  return new Map(((data ?? []) as Row[]).filter((row) => text(row.definition)).map((row) => [String(row.id), text(row.definition, 600)]));
};

/** Due words in the drill card shape, oldest due first. */
export const dueDrillCards = async (sb: any, userId: string, languageId: string, limit: number, now = new Date()): Promise<DrillCard[]> => {
  const { data, error } = await sb
    .from("user_vocabulary_notebook_entries")
    .select(NOTEBOOK_COLUMNS)
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .eq("is_archived", false)
    .lte("next_review_at", now.toISOString())
    .order("next_review_at", { ascending: true })
    .limit(Math.max(1, Math.min(50, limit)));
  if (error) throw new Error(`Failed to load due words: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const lexicon = await lexiconDefinitions(sb, rows);
  return rows.map((row) => notebookToDrillCard(row, lexicon.get(String(row.lexicon_entry_id ?? "")) ?? null));
};

export type WordStats = { total: number; due: number; learned: number };

export const wordStats = async (sb: any, userId: string, languageId: string, now = new Date()): Promise<WordStats> => {
  const base = () =>
    sb.from("user_vocabulary_notebook_entries")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .eq("is_archived", false);
  const [total, due, learned] = await Promise.all([
    base(),
    base().lte("next_review_at", now.toISOString()),
    base().gt("review_count", 0),
  ]);
  return { total: total.count ?? 0, due: due.count ?? 0, learned: learned.count ?? 0 };
};

/** Finds the notebook entry for an id that may be an old vocab_drill_cards id. */
const findEntry = async (sb: any, userId: string, languageId: string, cardId: string): Promise<Row | null> => {
  const { data } = await sb
    .from("user_vocabulary_notebook_entries")
    .select(NOTEBOOK_COLUMNS)
    .eq("id", cardId)
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .eq("is_archived", false)
    .maybeSingle();
  if (data?.id) return data as Row;
  const { data: old } = await sb.from("vocab_drill_cards").select("word").eq("id", cardId).eq("user_id", userId).maybeSingle();
  const normalized = old?.word ? normalizeWord(String(old.word)) : "";
  if (!normalized) return null;
  const { data: byWord } = await sb
    .from("user_vocabulary_notebook_entries")
    .select(NOTEBOOK_COLUMNS)
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .eq("normalized_word", normalized)
    .eq("is_archived", false)
    .maybeSingle();
  return byWord?.id ? byWord as Row : null;
};

export type GradeResult =
  | { ok: true; entry_id: string; next_review: string; next_review_at: string; interval: number; ease_factor: number; box: number }
  | { ok: false; status: number; error: string };

/** Reviews one word with a grade (1 again .. 4 easy) in the notebook. */
export const gradeWord = async (
  sb: any,
  userId: string,
  languageId: string,
  cardId: string,
  grade: Grade,
  now = new Date(),
): Promise<GradeResult> => {
  if (!cardId) return { ok: false, status: 400, error: "card_id is required" };
  const entry = await findEntry(sb, userId, languageId, cardId);
  if (!entry) return { ok: false, status: 404, error: "Card not found" };
  const patch = notebookReviewPatch(entry, grade, now);
  const { error } = await sb
    .from("user_vocabulary_notebook_entries")
    .update(patch)
    .eq("id", String(entry.id))
    .eq("user_id", userId);
  if (error) return { ok: false, status: 500, error: "Failed to save the review" };
  const interval = Math.max(0, Math.round((Date.parse(patch.next_review_at) - now.getTime()) / DAY_MS));
  return {
    ok: true,
    entry_id: String(entry.id),
    next_review: patch.next_review_at.slice(0, 10),
    next_review_at: patch.next_review_at,
    interval,
    ease_factor: easeFromDifficulty(patch.metadata.srs.d),
    box: patch.leitner_box,
  };
};

/** Adds words typed on the drill page; words already saved are left as they are. */
export const addDrillWords = async (
  sb: any,
  userId: string,
  languageId: string,
  words: Array<{ word?: unknown; definition?: unknown; example?: unknown }>,
  now = new Date(),
): Promise<number> => {
  const seen = new Set<string>();
  const rows = words.slice(0, 50).flatMap((entry) => {
    const word = text(entry.word, 200);
    const normalized = normalizeWord(word);
    const definition = text(entry.definition, 600);
    if (!normalized || !definition || seen.has(normalized)) return [];
    seen.add(normalized);
    return [{
      user_id: userId,
      language_id: languageId,
      word,
      normalized_word: normalized,
      source_type: DRILL_SOURCE_TYPE,
      source_label: "Vocabulary drill",
      next_review_at: now.toISOString(),
      metadata: { definition, example: text(entry.example, 600) || null, captured_at: now.toISOString() },
    }];
  });
  if (!rows.length) return 0;
  const { data, error } = await sb
    .from("user_vocabulary_notebook_entries")
    .upsert(rows, { onConflict: "user_id,language_id,normalized_word", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length;
};
