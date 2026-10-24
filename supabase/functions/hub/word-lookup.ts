// GET /hub/word?w=<word>&context=<sentence> — tap-to-translate for every
// signed-in learner (free plan included).
//
// Lookup order: shared cache (english_word_glosses) → vocabulary decks and the
// lexicon → AI (then cached for everyone). Only new AI lookups count against
// the learner's daily cap; cached words are free. The sentence only helps the
// AI recognise the word: it is never part of the cache key or stored.
import { json } from "../_shared/english-learning.ts";
import { callEnglishAIWithStatus, englishAIAvailable } from "../_shared/english-ai.ts";
import { recordEnglishAICall } from "../_shared/english-ai-ledger.ts";
import { loadEnglishSettings } from "../_shared/english-settings.ts";
import { learnerDayStart } from "../_shared/english-allowance.ts";
import {
  buildWordLookupPayload,
  decideAiLookup,
  type DeckWordRow,
  existingGloss,
  type Gloss,
  type LexiconRow,
  normalizeLookupWord,
  normalizePartOfSpeech,
  parseAiGloss,
  publicGloss,
  trimContext,
  WORD_LOOKUP_SYSTEM_PROMPT,
} from "../_shared/english-word-lookup.ts";

type CacheRow = {
  word: string;
  lemma: string | null;
  found: boolean;
  pos: string | null;
  definition: string | null;
  example: string | null;
  ru: string | null;
  uz: string | null;
};

const CACHE_COLUMNS = "word, lemma, found, pos, definition, example, ru, uz";

const notFound = () =>
  json(404, { error: "We could not find this word.", code: "english_word_not_found" });

const glossFromCache = (row: CacheRow): Gloss | null => {
  if (!row.found || !row.definition) return null;
  return {
    lemma: normalizeLookupWord(row.lemma) ?? row.word,
    part_of_speech: normalizePartOfSpeech(row.pos),
    definition: row.definition,
    example: row.example,
    ru: row.ru,
    uz: row.uz,
  };
};

/** Whether the learner already has the word (or its dictionary form) in My words. */
const isSaved = async (sb: any, userId: string, languageId: string, forms: string[]): Promise<boolean> => {
  const { count, error } = await sb
    .from("user_vocabulary_notebook_entries")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .eq("is_archived", false)
    .in("normalized_word", [...new Set(forms)]);
  if (error) return false;
  return (count ?? 0) > 0;
};

const loadExisting = async (sb: any, languageId: string, word: string) => {
  const [deckRes, lexiconRes] = await Promise.all([
    sb.from("vocabulary_deck_words")
      .select("word, part_of_speech, definition, example, translation_ru, translation_uz, vocabulary_decks!inner(language_id, status)")
      // The word is validated to letters, apostrophes and hyphens, so it has no LIKE wildcards.
      .ilike("word", word)
      .eq("vocabulary_decks.language_id", languageId)
      .eq("vocabulary_decks.status", "published")
      .limit(5),
    sb.from("language_lexicon_entries")
      .select("part_of_speech, definition, example")
      .eq("language_id", languageId)
      .eq("normalized_word", word)
      .maybeSingle(),
  ]);
  return existingGloss(
    word,
    deckRes.error ? [] : ((deckRes.data ?? []) as DeckWordRow[]),
    lexiconRes.error ? null : ((lexiconRes.data ?? null) as LexiconRow | null),
  );
};

export const handleWordLookup = async (input: {
  sb: any;
  userId: string;
  languageId: string;
  url: URL;
}): Promise<Response> => {
  const { sb, userId, languageId, url } = input;
  const word = normalizeLookupWord(url.searchParams.get("w"));
  if (!word) {
    return json(400, { error: "Send one English word (letters only, up to 40).", code: "english_word_invalid" });
  }
  const context = trimContext(url.searchParams.get("context"));
  const respond = async (gloss: Gloss, source: Parameters<typeof publicGloss>[2], notice: "limit" | "unavailable" | null = null) =>
    json(200, {
      ok: true,
      gloss: publicGloss(word, gloss, source, await isSaved(sb, userId, languageId, [word, gloss.lemma]), notice),
    });

  // 1. Shared cache: free and unlimited.
  const { data: cached, error: cacheError } = await sb
    .from("english_word_glosses")
    .select(CACHE_COLUMNS)
    .eq("word", word)
    .maybeSingle();
  if (cacheError) throw new Error(`Failed to read word cache: ${cacheError.message}`);
  if (cached) {
    const gloss = glossFromCache(cached as CacheRow);
    return gloss ? await respond(gloss, "cache") : notFound();
  }

  // 2. Our own content: deck words carry translations; lexicon entries only definitions.
  const existing = await loadExisting(sb, languageId, word);
  if (existing?.complete) return await respond(existing.gloss, existing.source);

  // 3. AI, within the learner's daily cap of new words.
  const fallback = (notice: "limit" | "unavailable") => {
    if (existing) return respond(existing.gloss, existing.source, notice);
    return Promise.resolve(notice === "limit"
      ? json(429, {
        error: "You have looked up many new words today. Words you looked up before still work.",
        code: "english_word_lookup_limit",
      })
      : json(503, { error: "Word meanings are not available right now.", code: "english_word_lookup_unavailable" }));
  };
  if (!(await englishAIAvailable("word-lookup"))) return await fallback("unavailable");

  const { count: usedToday, error: countError } = await sb
    .from("english_word_glosses")
    .select("word", { head: true, count: "exact" })
    .eq("created_by", userId)
    .gte("created_at", learnerDayStart());
  if (countError) throw new Error(`Failed to count word lookups: ${countError.message}`);
  const { ai: aiSettings } = await loadEnglishSettings(sb);
  if (!decideAiLookup(usedToday ?? 0, aiSettings.word_lookup_daily_limit).allowed) {
    recordEnglishAICall({ feature: "word-lookup", userId, status: "over_limit" }, sb);
    return await fallback("limit");
  }

  const ai = await callEnglishAIWithStatus<unknown>(
    {
      systemPrompt: WORD_LOOKUP_SYSTEM_PROMPT,
      userPayload: buildWordLookupPayload(word, context, existing?.gloss ?? null),
      temperature: 0.2,
      feature: "word-lookup",
      userId,
    },
    null,
  );
  const parsed = ai.status === "ok" ? parseAiGloss(ai.data, word) : null;
  if (!parsed) {
    console.error(JSON.stringify({ event: "english_word_lookup_ai_failed", status: ai.status, error: ai.error?.slice(0, 200) ?? "invalid_json" }));
    return await fallback("unavailable");
  }

  const row = parsed.known
    ? {
      word,
      lemma: parsed.gloss.lemma,
      found: true,
      pos: parsed.gloss.part_of_speech,
      definition: parsed.gloss.definition,
      example: parsed.gloss.example,
      ru: parsed.gloss.ru,
      uz: parsed.gloss.uz,
    }
    : { word, lemma: null, found: false, pos: null, definition: null, example: null, ru: null, uz: null };
  // Two learners may look up the same new word at once; the first row wins.
  const { error: insertError } = await sb
    .from("english_word_glosses")
    .upsert({ ...row, source: "ai", created_by: userId }, { onConflict: "word", ignoreDuplicates: true });
  if (insertError) console.error(JSON.stringify({ event: "english_word_cache_write_failed", error: insertError.message }));

  return parsed.known ? await respond(parsed.gloss, "ai") : notFound();
};
