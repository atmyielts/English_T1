// Personal targets for real-life tasks: saved words to use and recent
// mistakes to watch (see _shared/english-immersion-depth.ts).
import { topicFromSubskill } from "../_shared/english-mistakes.ts";
import { creditUsedWords, loadPracticeWords } from "../_shared/english-words.ts";
import { pickWatchItems, type WatchItem, watchOutcomes, type WatchOutcome } from "../_shared/english-immersion-depth.ts";

export type PersonalTargets = {
  words: Array<{ id: string; word: string; definition: string | null }>;
  watch: WatchItem[];
};

/** The learner's open mistakes with a "wrong → right" example, newest and most frequent first. */
export const loadWatchItems = async (sb: any, userId: string, languageId: string, max = 2): Promise<WatchItem[]> => {
  const { data, error } = await sb
    .from("learner_language_errors")
    .select("id, subskill_key, error_type, error_frequency, last_seen_at")
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .in("mastery_status", ["open", "reopened"])
    .order("last_seen_at", { ascending: false })
    .limit(40);
  if (error) return [];
  return pickWatchItems(
    ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      error_type: row.error_type,
      topic: topicFromSubskill(String(row.subskill_key ?? "")),
      times: Number(row.error_frequency ?? 1),
      last_seen_at: row.last_seen_at ? String(row.last_seen_at) : null,
    })),
    max,
  );
};

export const loadPersonalTargets = async (sb: any, userId: string, languageId: string): Promise<PersonalTargets> => {
  const [words, watch] = await Promise.all([
    loadPracticeWords(sb, userId, languageId, 3).catch(() => []),
    loadWatchItems(sb, userId, languageId).catch(() => [] as WatchItem[]),
  ]);
  return { words: words.map((entry) => ({ id: entry.id, word: entry.word, definition: entry.definition })), watch };
};

export type PersonalResult = { words_suggested: number; words_used: string[]; watch: WatchOutcome[] };

/**
 * After checking: which suggested words the learner used (each counts as a
 * review) and whether each watched mistake came back. The watch list is
 * loaded again here, so nothing from the client decides it.
 */
export const personalResult = async (
  sb: any,
  input: { userId: string; languageId: string; wordIds: string[]; texts: string[] },
): Promise<PersonalResult> => {
  const text = input.texts.filter(Boolean).join("\n");
  const [used, watch] = await Promise.all([
    text ? creditUsedWords(sb, { userId: input.userId, languageId: input.languageId, wordIds: input.wordIds, text }).catch(() => [] as string[]) : Promise.resolve([] as string[]),
    loadWatchItems(sb, input.userId, input.languageId).catch(() => [] as WatchItem[]),
  ]);
  return { words_suggested: Math.min(5, new Set(input.wordIds).size), words_used: used, watch: watchOutcomes(input.texts, watch) };
};
