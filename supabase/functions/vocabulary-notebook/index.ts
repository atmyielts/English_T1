import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { guardActivity } from "../_shared/english-allowance.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildFeedbackPayload,
  calculateAttemptScore,
  extractRoute,
  recordEvaluatedAttempt,
  resolveEnglishProducts,
  resolveOrCreateContentItem,
  toNumber,
} from "../_shared/english-learning.ts";
import { firstReviewAt, missedFirst, parseDeckAnswers, scoreDeckQuiz, parseCollocations, parseWordFamily, wordExtras } from "../_shared/english-vocabulary.ts";
import { gradeFromOutcome, notebookReviewPatch, parseGrade } from "../_shared/english-srs.ts";
import { importDrillCards } from "../_shared/english-word-store.ts";

type JsonRecord = Record<string, unknown>;

const routeMarker = "/vocabulary-notebook";

const NOTEBOOK_COLUMNS =
  "id, word, normalized_word, context_text, source_type, source_label, source_ref, notes, leitner_box, next_review_at, last_reviewed_at, review_count, correct_count, incorrect_count, metadata, lexicon_entry_id, updated_at";

const DECK_COLUMNS = "id, product_id, slug, title, level, topic, description, sort_order";
const DECK_MINUTES = 6;
const DECK_SOURCE_TYPE = "english-vocabulary-deck";

type LanguageRow = {
  id: string;
  code: string;
  name: string;
};

type LexiconRow = {
  id: string;
  normalized_word: string;
  display_word: string;
  definition: string | null;
  example: string | null;
};

type NotebookRow = {
  id: string;
  word: string;
  normalized_word: string;
  context_text: string | null;
  source_type: string;
  source_label: string | null;
  source_ref: string | null;
  notes: string | null;
  leitner_box: number;
  next_review_at: string;
  last_reviewed_at: string | null;
  review_count: number;
  correct_count: number;
  incorrect_count: number;
  metadata: JsonRecord | null;
  lexicon_entry_id: string | null;
  updated_at: string;
};

type CaptureItem = {
  word: string;
  lemma?: string | null;
  part_of_speech?: string | null;
  definition?: string | null;
  example?: string | null;
  context_text?: string | null;
  source_type?: string | null;
  source_product_id?: string | null;
  source_label?: string | null;
  source_ref?: string | null;
  notes?: string | null;
  metadata?: JsonRecord | null;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const readJson = async (req: Request): Promise<JsonRecord> => {
  try {
    return (await req.json()) as JsonRecord;
  } catch {
    return {};
  }
};

const toText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const normalizeWord = (raw: string): string => {
  const lowered = raw.trim().toLowerCase();
  const compact = lowered.replace(/\s+/g, " ");
  return compact.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
};


const asJsonRecord = (value: unknown): JsonRecord => (value && typeof value === "object" && !Array.isArray(value))
  ? (value as JsonRecord)
  : {};

const resolveLanguage = async (
  serviceClient: any,
  languageCodeOrId: string,
): Promise<LanguageRow | null> => {
  const key = languageCodeOrId.trim().toLowerCase() || "en";
  const byId = /^[0-9a-f-]{36}$/.test(key);

  let query = serviceClient
    .from("languages")
    .select("id, code, name")
    .limit(1);

  query = byId ? query.eq("id", key) : query.eq("code", key);
  const { data } = await query.maybeSingle();
  if (!data) return null;

  return {
    id: String((data as any).id),
    code: String((data as any).code ?? "").toLowerCase(),
    name: String((data as any).name ?? ""),
  };
};

const loadLexiconMap = async (
  serviceClient: any,
  lexiconIds: string[],
): Promise<Map<string, LexiconRow>> => {
  if (lexiconIds.length === 0) return new Map();

  const { data } = await serviceClient
    .from("language_lexicon_entries")
    .select("id, normalized_word, display_word, definition, example")
    .in("id", lexiconIds);

  const rows = (data ?? []) as LexiconRow[];
  return new Map(rows.map((row) => [row.id, row]));
};

const enrichRows = async (
  serviceClient: any,
  rows: NotebookRow[],
) => {
  const lexiconIds = Array.from(
    new Set(
      rows
        .map((row) => row.lexicon_entry_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const lexiconMap = await loadLexiconMap(serviceClient, lexiconIds);

  return rows.map((row) => {
    const lexicon = row.lexicon_entry_id ? lexiconMap.get(row.lexicon_entry_id) : null;
    const meta = asJsonRecord(row.metadata ?? {});
    const localDefinition = toText(meta.definition);
    const localExample = toText(meta.example);
    const activationTargets = Array.isArray(meta.activation_targets)
      ? meta.activation_targets.map((entry) => toText(entry)).filter(Boolean)
      : row.source_type.includes("reading")
      ? ["speaking", "writing"]
      : row.source_type.includes("listening")
      ? ["speaking", "reading"]
      : row.source_type.includes("speaking")
      ? ["immersion", "writing"]
      : ["reading", "speaking"];
    const pronunciationHint = toText(meta.pronunciation_hint) || (row.word
      ? `Say "${row.word}" once slowly, then once in a full sentence before you mark it correct.`
      : "");

    return {
      id: row.id,
      word: row.word,
      normalized_word: row.normalized_word,
      definition: localDefinition || lexicon?.definition || null,
      example: localExample || lexicon?.example || null,
      context_text: row.context_text,
      source_type: row.source_type,
      source_label: row.source_label,
      source_ref: row.source_ref,
      notes: row.notes,
      leitner_box: row.leitner_box,
      next_review_at: row.next_review_at,
      last_reviewed_at: row.last_reviewed_at,
      review_count: row.review_count,
      correct_count: row.correct_count,
      incorrect_count: row.incorrect_count,
      updated_at: row.updated_at,
      activation_targets: activationTargets,
      pronunciation_hint: pronunciationHint || null,
      ...wordExtras(meta),
    };
  });
};

const respond = (status: number, payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

type CaptureOutcome =
  | { ok: true; cards: Awaited<ReturnType<typeof enrichRows>> }
  | { ok: false; status: number; body: JsonRecord };

/**
 * Saves words to the learner's notebook: adds missing lexicon entries, then
 * upserts one notebook row per word. Used by the `capture` action and when a
 * learner adds a whole deck. `nextReviewAt` (keyed by normalized word) sets
 * when each word is first due; it must cover every item when given.
 */
const captureNotebookItems = async (
  serviceClient: any,
  authedUserId: string,
  language: LanguageRow,
  rawItems: unknown[],
  options: { nextReviewAt?: Map<string, string> } = {},
): Promise<CaptureOutcome> => {
  const items = rawItems
    .map((value) => (value && typeof value === "object" ? value as CaptureItem : null))
    .filter((value): value is CaptureItem => Boolean(value));

  if (items.length === 0) {
    return { ok: false, status: 422, body: { error: "No capture items provided" } };
  }

  if (items.length > 50) {
    return { ok: false, status: 422, body: { error: "Too many items", max: 50 } };
  }

  const cleaned = items
    .map((item) => {
      const word = toText(item.word);
      const normalizedWord = normalizeWord(word);
      if (!normalizedWord) return null;
      return {
        word,
        normalized_word: normalizedWord,
        lemma: toText(item.lemma) || null,
        part_of_speech: toText(item.part_of_speech) || null,
        definition: toText(item.definition) || null,
        example: toText(item.example) || null,
        context_text: toText(item.context_text) || null,
        source_type: toText(item.source_type) || "manual",
        source_product_id: toText(item.source_product_id) || null,
        source_label: toText(item.source_label) || null,
        source_ref: toText(item.source_ref) || null,
        notes: toText(item.notes) || null,
        metadata: asJsonRecord(item.metadata ?? {}),
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  if (cleaned.length === 0) {
    return { ok: false, status: 422, body: { error: "No valid words after normalization" } };
  }

  const sourceProductIds = Array.from(
    new Set(
      cleaned
        .map((item) => item.source_product_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (sourceProductIds.length > 0) {
    const { data: allowedProducts } = await serviceClient
      .from("product_languages")
      .select("product_id")
      .eq("language_id", language.id)
      .eq("included_in_shared_profile", true)
      .in("product_id", sourceProductIds);

    const allowedSet = new Set((allowedProducts ?? []).map((row: any) => String(row.product_id)));
    const disallowed = sourceProductIds.filter((id) => !allowedSet.has(id));
    if (disallowed.length > 0) {
      return {
        ok: false,
        status: 422,
        body: {
          error: "Source product is not mapped to requested language scope",
          language_code: language.code,
          disallowed_product_ids: disallowed,
        },
      };
    }
  }

  const words = Array.from(new Set(cleaned.map((item) => item.normalized_word)));
  const { data: existingLexiconRows } = await serviceClient
    .from("language_lexicon_entries")
    .select("id, normalized_word")
    .eq("language_id", language.id)
    .in("normalized_word", words);

  const lexiconMap = new Map(
    ((existingLexiconRows ?? []) as { id: string; normalized_word: string }[]).map((row) => [row.normalized_word, row.id]),
  );

  const missingLexiconRows = words.filter((word) => !lexiconMap.has(word)).map((word) => {
    const seed = cleaned.find((item) => item.normalized_word === word)!;
    return {
      language_id: language.id,
      normalized_word: word,
      display_word: seed.word,
      lemma: seed.lemma,
      part_of_speech: seed.part_of_speech,
      definition: seed.definition,
      example: seed.example,
      metadata: {
        seeded_by: "vocabulary-notebook.capture",
      },
    };
  });

  if (missingLexiconRows.length > 0) {
    const { data: insertedLexiconRows, error: lexiconInsertError } = await serviceClient
      .from("language_lexicon_entries")
      .upsert(missingLexiconRows, { onConflict: "language_id,normalized_word" })
      .select("id, normalized_word");

    if (lexiconInsertError) {
      return { ok: false, status: 500, body: { error: "Failed to upsert lexicon entries", details: lexiconInsertError.message } };
    }

    for (const row of (insertedLexiconRows ?? []) as { id: string; normalized_word: string }[]) {
      lexiconMap.set(row.normalized_word, row.id);
    }
  }

  // One row per word: a request that repeats a word would otherwise make the
  // upsert touch the same row twice and fail.
  const firstByWord = new Map<string, (typeof cleaned)[number]>();
  for (const item of cleaned) if (!firstByWord.has(item.normalized_word)) firstByWord.set(item.normalized_word, item);
  const uniqueCleaned = [...firstByWord.values()];
  const capturedAt = new Date().toISOString();
  const notebookRows = uniqueCleaned.map((item) => {
    const nextReviewAt = options.nextReviewAt?.get(item.normalized_word);
    return {
      user_id: authedUserId,
      language_id: language.id,
      lexicon_entry_id: lexiconMap.get(item.normalized_word) ?? null,
      word: item.word,
      normalized_word: item.normalized_word,
      context_text: item.context_text,
      source_type: item.source_type,
      source_product_id: item.source_product_id,
      source_label: item.source_label,
      source_ref: item.source_ref,
      notes: item.notes,
      is_archived: false,
      ...(options.nextReviewAt ? { next_review_at: nextReviewAt ?? capturedAt } : {}),
      metadata: {
        ...item.metadata,
        definition: item.definition,
        example: item.example,
        captured_at: capturedAt,
      },
    };
  });

  const { data: upsertedRows, error: notebookUpsertError } = await serviceClient
    .from("user_vocabulary_notebook_entries")
    .upsert(notebookRows, { onConflict: "user_id,language_id,normalized_word" })
    .select(NOTEBOOK_COLUMNS);

  if (notebookUpsertError) {
    return { ok: false, status: 500, body: { error: "Failed to save notebook words", details: notebookUpsertError.message } };
  }

  return { ok: true, cards: await enrichRows(serviceClient, (upsertedRows ?? []) as NotebookRow[]) };
};

type DeckRow = {
  id: string;
  product_id: string;
  slug: string;
  title: string;
  level: string | null;
  topic: string | null;
  description: string | null;
  sort_order: number;
};

type DeckWordRow = {
  id: string;
  word: string;
  part_of_speech: string | null;
  definition: string;
  example: string | null;
  translation_ru: string | null;
  translation_uz: string | null;
  sort_order: number;
  /** Word partners and other forms, where the deck content has them. */
  collocations: string[];
  word_family: Array<{ word: string; part_of_speech: string | null }>;
};

const loadDeck = async (serviceClient: any, languageId: string, slug: string): Promise<DeckRow | null> => {
  const { data, error } = await serviceClient
    .from("vocabulary_decks")
    .select(DECK_COLUMNS)
    .eq("language_id", languageId)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error || !data?.id) return null;
  return data as DeckRow;
};

const loadDeckWords = async (serviceClient: any, deckId: string): Promise<DeckWordRow[]> => {
  // "*" so this works before and after the collocations / word_family columns exist.
  const { data, error } = await serviceClient
    .from("vocabulary_deck_words")
    .select("*")
    .eq("deck_id", deckId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`Failed to load deck words: ${error.message}`);
  return ((data ?? []) as JsonRecord[]).map((row) => ({
    id: String(row.id),
    word: String(row.word ?? ""),
    part_of_speech: typeof row.part_of_speech === "string" ? row.part_of_speech : null,
    definition: String(row.definition ?? ""),
    example: typeof row.example === "string" ? row.example : null,
    translation_ru: typeof row.translation_ru === "string" ? row.translation_ru : null,
    translation_uz: typeof row.translation_uz === "string" ? row.translation_uz : null,
    sort_order: Number(row.sort_order ?? 0),
    collocations: parseCollocations(row.collocations),
    word_family: parseWordFamily(row.word_family),
  }));
};

/**
 * Adds a finished deck's words to the learner's notebook. New words are
 * scheduled so missed ones are due now and known ones tomorrow. Words already
 * in the notebook keep their schedule, except a missed word is brought forward
 * to now so it comes up first in Review.
 */
const saveDeckWords = async (
  serviceClient: any,
  authedUserId: string,
  language: LanguageRow,
  deck: DeckRow,
  ordered: Array<{ word: DeckWordRow; correct: boolean }>,
): Promise<{ added: number; already_saved: number }> => {
  const now = new Date();
  const byNormalized = new Map(ordered.map((entry) => [normalizeWord(entry.word.word), entry]));
  const normalized = [...byNormalized.keys()].filter(Boolean);

  const { data: existingRows, error: existingError } = await serviceClient
    .from("user_vocabulary_notebook_entries")
    .select("id, normalized_word, next_review_at")
    .eq("user_id", authedUserId)
    .eq("language_id", language.id)
    .eq("is_archived", false)
    .in("normalized_word", normalized);
  if (existingError) throw new Error(`Failed to read notebook: ${existingError.message}`);
  const existing = (existingRows ?? []) as Array<{ id: string; normalized_word: string; next_review_at: string }>;
  const existingSet = new Set(existing.map((row) => row.normalized_word));

  const fresh = normalized.filter((key) => !existingSet.has(key));
  if (fresh.length) {
    const schedule = new Map(fresh.map((key) => [key, firstReviewAt(byNormalized.get(key)!.correct, now)]));
    const outcome = await captureNotebookItems(
      serviceClient,
      authedUserId,
      language,
      fresh.map((key) => {
        const { word } = byNormalized.get(key)!;
        return {
          word: word.word,
          part_of_speech: word.part_of_speech,
          definition: word.definition,
          example: word.example,
          source_type: DECK_SOURCE_TYPE,
          source_label: deck.title,
          source_ref: deck.slug,
          metadata: {
            deck_slug: deck.slug,
            part_of_speech: word.part_of_speech,
            translation_ru: word.translation_ru,
            translation_uz: word.translation_uz,
            ...(word.collocations.length ? { collocations: word.collocations } : {}),
            ...(word.word_family.length ? { word_family: word.word_family } : {}),
          },
        } satisfies CaptureItem;
      }),
      { nextReviewAt: schedule },
    );
    if (!outcome.ok) throw new Error(String(outcome.body.error ?? "Failed to save words"));
  }

  const missedExistingIds = existing
    .filter((row) => byNormalized.get(row.normalized_word)?.correct === false && Date.parse(row.next_review_at) > now.getTime())
    .map((row) => row.id);
  if (missedExistingIds.length) {
    const { error: bumpError } = await serviceClient
      .from("user_vocabulary_notebook_entries")
      .update({ next_review_at: now.toISOString() })
      .eq("user_id", authedUserId)
      .eq("language_id", language.id)
      .in("id", missedExistingIds);
    if (bumpError) throw new Error(`Failed to reschedule words: ${bumpError.message}`);
  }

  return { added: fresh.length, already_saved: existing.length };
};

/** GET /decks, GET /decks/:slug, POST /decks/:slug/submit. */
const handleDeckRoute = async (
  req: Request,
  route: string,
  body: JsonRecord,
  serviceClient: any,
  authedUserId: string,
  language: LanguageRow,
): Promise<Response> => {
  if (req.method === "GET" && route === "/decks") {
    const { data, error } = await serviceClient
      .from("vocabulary_decks")
      .select(`${DECK_COLUMNS}, vocabulary_deck_words(count)`)
      .eq("language_id", language.id)
      .eq("status", "published")
      .order("sort_order", { ascending: true });
    if (error) return respond(500, { error: "Failed to load decks" });
    const decks = ((data ?? []) as Array<DeckRow & { vocabulary_deck_words?: Array<{ count: number }> }>).map((deck) => ({
      id: deck.id,
      slug: deck.slug,
      title: deck.title,
      level: deck.level,
      topic: deck.topic,
      description: deck.description,
      word_count: Number(deck.vocabulary_deck_words?.[0]?.count ?? 0),
      minutes: DECK_MINUTES,
    }));
    return respond(200, { decks });
  }

  const submitMatch = /^\/decks\/([^/]+)\/submit$/.exec(route);
  if (req.method === "POST" && submitMatch) {
    // Paid skills, or today's free activity.
    const blocked = await guardActivity(serviceClient, authedUserId, language.id, "vocabulary", route);
    if (blocked) return blocked;
  }
  const deckMatch = /^\/decks\/([^/]+)$/.exec(route);
  const slug = decodeURIComponent((submitMatch ?? deckMatch)?.[1] ?? "").trim().slice(0, 120);
  if (!slug) return respond(404, { error: "Deck not found" });

  const deck = await loadDeck(serviceClient, language.id, slug);
  if (!deck) return respond(404, { error: "Deck not found" });

  if (req.method === "GET" && deckMatch) {
    const words = await loadDeckWords(serviceClient, deck.id);
    return respond(200, {
      deck: {
        id: deck.id,
        slug: deck.slug,
        title: deck.title,
        level: deck.level,
        topic: deck.topic,
        description: deck.description,
        minutes: DECK_MINUTES,
      },
      words,
    });
  }

  if (req.method !== "POST" || !submitMatch) return respond(404, { error: "Not found" });

  const words = await loadDeckWords(serviceClient, deck.id);
  if (!words.length) return respond(422, { error: "This word set has no words yet" });

  const answers = parseDeckAnswers(body.answers).filter((answer) => answer.option);
  if (!answers.length) return respond(422, { error: "Answer at least one question first" });
  const score = scoreDeckQuiz(words, answers);
  const wordById = new Map(words.map((word) => [word.id, word]));
  const missed = score.results.filter((result) => !result.correct);
  const timeSpentSeconds = toNumber(body.time_spent_seconds);

  const products = await resolveEnglishProducts(serviceClient);
  const productId = products.vocabulary?.productId || deck.product_id;
  const contentItem = await resolveOrCreateContentItem(serviceClient, {
    productId,
    languageId: language.id,
    serviceKey: "vocabulary",
    contentType: "vocabulary.deck",
    sourceRef: deck.slug,
    title: deck.title,
    description: deck.description,
    skillKey: "vocabulary",
    subskillKeys: ["vocabulary.recall", "vocabulary.usage"],
    cefrLevel: deck.level,
    estimatedMinutes: DECK_MINUTES,
    tags: [deck.topic ?? ""].filter(Boolean),
  });

  const attemptScore = calculateAttemptScore({
    correctnessRatio: score.ratio,
    estimatedMinutes: Number(contentItem.estimated_minutes ?? DECK_MINUTES),
    timeSpentSeconds,
    hintUsageCount: 0,
    retryCount: 0,
    correctionQualityRatio: score.ratio,
  });
  // One issue per deck (not per word) so Review's "mistakes" list stays readable.
  const issues = missed.length
    ? [{
        category: "vocabulary",
        subskill_key: "vocabulary.recall",
        location_ref: deck.slug,
        explanation: `Word meanings from "${deck.title}": ${missed.map((result) => result.word).slice(0, 6).join(", ")}`,
        correction_hint: "Review these words, then try the set again.",
        severity: score.ratio < 0.5 ? 0.7 : 0.45,
      }]
    : [];
  const feedback = buildFeedbackPayload({
    serviceKey: "vocabulary",
    score: attemptScore.overallScore,
    title: deck.title,
    reason: deck.description,
    issues,
  });
  const recorded = await recordEvaluatedAttempt(serviceClient, {
    userId: authedUserId,
    languageId: language.id,
    productId,
    serviceKey: "vocabulary",
    contentItem,
    attemptType: "vocabulary.deck",
    responseJson: { deck_id: deck.id, results: score.results },
    metadata: { deck_id: deck.id, deck_slug: deck.slug, correct: score.correct, total: score.total },
    timeSpentSeconds,
    score: attemptScore,
    feedback,
    products,
  });

  // The attempt is recorded either way; a failed save is reported, not fatal.
  let saved: { added: number; already_saved: number } | null = null;
  if (body.save_words === true) {
    try {
      saved = await saveDeckWords(
        serviceClient,
        authedUserId,
        language,
        deck,
        missedFirst(score.results).map((result) => ({ word: wordById.get(result.word_id)!, correct: result.correct })),
      );
    } catch (cause) {
      console.error(JSON.stringify({ event: "vocabulary_deck_save_failed", deck: deck.slug, error: String(cause) }));
    }
  }

  return respond(200, {
    ok: true,
    attempt_id: String(recorded.attempt.id ?? ""),
    score: Math.round(score.ratio * 100),
    correct: score.correct,
    total: score.total,
    results: score.results.map((result) => ({
      ...result,
      definition: wordById.get(result.word_id)?.definition ?? null,
    })),
    save_requested: body.save_words === true,
    saved,
  });
};


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });
    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const authedUserId = userData.user.id;

    const url = new URL(req.url);
    const body = req.method === "POST" ? await readJson(req) : {};
    const requestedLanguage = toText(url.searchParams.get("language_code") ?? body.language_code ?? "en") || "en";
    const language = await resolveLanguage(serviceClient, requestedLanguage);
    if (!language) {
      return new Response(JSON.stringify({ error: "Language not found", language: requestedLanguage }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const route = extractRoute(url, routeMarker);
    if (route === "/decks" || route.startsWith("/decks/")) {
      return await handleDeckRoute(req, route, body, serviceClient, authedUserId, language);
    }

    if (req.method === "GET") {
      // Words practised in the platform drill or the Telegram Mini App by older code join this list.
      await importDrillCards(serviceClient, authedUserId, language.id);
      const mode = toText(url.searchParams.get("mode")).toLowerCase() || "daily";
      const requestedLimit = Number(url.searchParams.get("limit") ?? (mode === "recent" ? 12 : 10));
      const limit = clamp(Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 10, 1, 50);
      const nowIso = new Date().toISOString();

      let query = serviceClient
        .from("user_vocabulary_notebook_entries")
        .select(
          "id, word, normalized_word, context_text, source_type, source_label, source_ref, notes, leitner_box, next_review_at, last_reviewed_at, review_count, correct_count, incorrect_count, metadata, lexicon_entry_id, updated_at",
        )
        .eq("user_id", authedUserId)
        .eq("language_id", language.id)
        .eq("is_archived", false)
        .limit(limit);

      if (mode === "recent") {
        query = query.order("updated_at", { ascending: false });
      } else {
        query = query.lte("next_review_at", nowIso).order("next_review_at", { ascending: true });
      }

      const { data: notebookRows, error: notebookError } = await query;
      if (notebookError) {
        return new Response(JSON.stringify({ error: "Failed to load notebook", details: notebookError.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { count: dueCount } = await serviceClient
        .from("user_vocabulary_notebook_entries")
        .select("id", { head: true, count: "exact" })
        .eq("user_id", authedUserId)
        .eq("language_id", language.id)
        .eq("is_archived", false)
        .lte("next_review_at", nowIso);

      const { count: totalCount } = await serviceClient
        .from("user_vocabulary_notebook_entries")
        .select("id", { head: true, count: "exact" })
        .eq("user_id", authedUserId)
        .eq("language_id", language.id)
        .eq("is_archived", false);

      const cards = await enrichRows(serviceClient, (notebookRows ?? []) as NotebookRow[]);
      return new Response(
        JSON.stringify({
          scope: {
            user_id: authedUserId,
            language_id: language.id,
            language_code: language.code,
            mode,
          },
          summary: {
            due_count: dueCount ?? 0,
            total_count: totalCount ?? 0,
          },
          cards,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    const action = toText(body.action).toLowerCase();
    if (action !== "capture" && action !== "review" && action !== "archive") {
      return new Response(JSON.stringify({ error: "Unsupported action", action }), {
        status: 422,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (action === "capture") {
      const outcome = await captureNotebookItems(
        serviceClient,
        authedUserId,
        language,
        Array.isArray(body.items) ? body.items as unknown[] : [],
      );
      if (!outcome.ok) return respond(outcome.status, outcome.body);
      return respond(200, { saved: outcome.cards.length, cards: outcome.cards });
    }

    if (action === "archive") {
      const entryId = toText(body.entry_id);
      if (!entryId) {
        return new Response(JSON.stringify({ error: "entry_id is required" }), {
          status: 422,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { error: archiveError } = await serviceClient
        .from("user_vocabulary_notebook_entries")
        .update({ is_archived: true })
        .eq("id", entryId)
        .eq("user_id", authedUserId)
        .eq("language_id", language.id);

      if (archiveError) {
        return new Response(JSON.stringify({ error: "Failed to archive card", details: archiveError.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      return new Response(JSON.stringify({ archived: true, entry_id: entryId }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const entryId = toText(body.entry_id);
    const outcome = toText(body.outcome).toLowerCase();
    // grade 1 again / 2 hard / 3 good / 4 easy; older clients send outcome correct|incorrect.
    const grade = parseGrade(body.grade) ?? (outcome === "correct" || outcome === "incorrect" ? gradeFromOutcome(outcome === "correct") : null);
    if (!entryId || !grade) {
      return new Response(JSON.stringify({ error: "entry_id and grade (1-4) or outcome (correct|incorrect) are required" }), {
        status: 422,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: currentRow, error: currentError } = await serviceClient
      .from("user_vocabulary_notebook_entries")
      .select(NOTEBOOK_COLUMNS)
      .eq("id", entryId)
      .eq("user_id", authedUserId)
      .eq("language_id", language.id)
      .eq("is_archived", false)
      .maybeSingle();

    if (currentError) {
      return new Response(JSON.stringify({ error: "Failed to load notebook card", details: currentError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!currentRow) {
      return new Response(JSON.stringify({ error: "Card not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // One FSRS schedule for every place a word is reviewed (_shared/english-srs.ts).
    const { data: updatedRow, error: updateError } = await serviceClient
      .from("user_vocabulary_notebook_entries")
      .update(notebookReviewPatch(currentRow as NotebookRow, grade, new Date()))
      .eq("id", entryId)
      .eq("user_id", authedUserId)
      .eq("language_id", language.id)
      .select(NOTEBOOK_COLUMNS)
      .maybeSingle();

    if (updateError || !updatedRow) {
      return new Response(JSON.stringify({ error: "Failed to update review card", details: updateError?.message ?? null }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const [card] = await enrichRows(serviceClient, [updatedRow as NotebookRow]);
    return new Response(
      JSON.stringify({
        updated: true,
        card,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
