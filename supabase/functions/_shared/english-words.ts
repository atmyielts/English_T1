// Brings saved words back into speaking and writing.
//
// A word the learner saved while reading or listening is only half learned
// until they use it. Writing and speaking tasks suggest up to three saved
// words; when the learner uses one, it counts as a successful review and moves
// up the same Leitner boxes as a flashcard answered correctly.

export type NotebookWord = {
  id: string;
  word: string;
  definition: string | null;
  leitner_box: number;
  next_review_at: string;
  correct_count: number;
};

/** Same spacing as flashcard review in vocabulary-notebook. */
export const intervalDaysForBox = (box: number): number => {
  if (box <= 1) return 1;
  if (box === 2) return 2;
  if (box === 3) return 4;
  if (box === 4) return 8;
  return 16;
};

/**
 * Words worth practising now: due ones first, then the least secure.
 * Long phrases are skipped because they rarely fit a task naturally.
 */
export const choosePracticeWords = (rows: NotebookWord[], nowIso: string, count = 3): NotebookWord[] =>
  rows
    .filter((row) => row.word.trim() && row.word.trim().split(/\s+/).length <= 3)
    .sort((a, b) => {
      const dueA = a.next_review_at <= nowIso ? 0 : 1;
      const dueB = b.next_review_at <= nowIso ? 0 : 1;
      return dueA - dueB || a.leitner_box - b.leitner_box || a.correct_count - b.correct_count || a.word.localeCompare(b.word);
    })
    .slice(0, count);

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Common inflected forms of one English word (decide → decided, deciding; study → studies, studied). */
export const wordForms = (word: string): string[] => {
  const base = word.toLowerCase().trim();
  const forms = new Set([base, `${base}s`, `${base}es`, `${base}ed`, `${base}d`, `${base}ing`, `${base}er`, `${base}ly`]);
  if (/[^aeiou]y$/.test(base)) {
    const stem = base.slice(0, -1);
    forms.add(`${stem}ies`).add(`${stem}ied`).add(`${stem}ier`).add(`${stem}ily`);
  }
  if (/e$/.test(base)) {
    const stem = base.slice(0, -1);
    forms.add(`${stem}ing`).add(`${stem}ed`);
  }
  if (/[^aeiou][aeiou][bdgmnprt]$/.test(base)) {
    const last = base.slice(-1);
    forms.add(`${base}${last}ed`).add(`${base}${last}ing`).add(`${base}${last}er`);
  }
  return [...forms];
};

/** Whether the learner's text uses the word or phrase, in any common form (turn out → turned out). */
export const usesWord = (text: string, word: string): boolean => {
  const tokens = word.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  const body = tokens.map((token) => `(?:${wordForms(token).map(escapeRegExp).join("|")})`).join("\\s+");
  return new RegExp(`(?<![\\p{L}'])${body}(?![\\p{L}'])`, "iu").test(text.replace(/[’‘]/g, "'"));
};

/** Ids of the suggested words that the text actually uses. */
export const usedWordIds = (text: string, words: Array<Pick<NotebookWord, "id" | "word">>): string[] =>
  words.filter((entry) => usesWord(text, entry.word)).map((entry) => entry.id);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const toWord = (row: Record<string, unknown>): NotebookWord => {
  const meta = asRecord(row.metadata);
  const definition = typeof meta.definition === "string" && meta.definition.trim() ? meta.definition.trim() : null;
  return {
    id: String(row.id),
    word: String(row.word ?? ""),
    definition,
    leitner_box: Number(row.leitner_box ?? 1) || 1,
    next_review_at: String(row.next_review_at ?? ""),
    correct_count: Number(row.correct_count ?? 0) || 0,
  };
};

const WORD_COLUMNS = "id, word, leitner_box, next_review_at, correct_count, metadata";

/** Up to `count` saved words to suggest in a writing or speaking task. */
export const loadPracticeWords = async (sb: any, userId: string, languageId: string, count = 3): Promise<NotebookWord[]> => {
  const { data, error } = await sb
    .from("user_vocabulary_notebook_entries")
    .select(WORD_COLUMNS)
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .eq("is_archived", false)
    .order("next_review_at", { ascending: true })
    .limit(60);
  if (error) return [];
  return choosePracticeWords(((data ?? []) as Array<Record<string, unknown>>).map(toWord), new Date().toISOString(), count);
};

/**
 * Checks which of the suggested words the learner used and counts each use as
 * a correct review. Returns the words that were used.
 */
export const creditUsedWords = async (
  sb: any,
  input: { userId: string; languageId: string; wordIds: string[]; text: string },
): Promise<string[]> => {
  const ids = [...new Set(input.wordIds.map(String).filter(Boolean))].slice(0, 5);
  if (!ids.length || !input.text.trim()) return [];
  const { data, error } = await sb
    .from("user_vocabulary_notebook_entries")
    .select(`${WORD_COLUMNS}, review_count`)
    .eq("user_id", input.userId)
    .eq("language_id", input.languageId)
    .in("id", ids);
  if (error || !Array.isArray(data)) return [];
  const rows = data as Array<Record<string, unknown>>;
  const used = new Set(usedWordIds(input.text, rows.map(toWord)));
  const now = new Date();
  const out: string[] = [];
  for (const row of rows) {
    if (!used.has(String(row.id))) continue;
    const box = Math.min(5, (Number(row.leitner_box ?? 1) || 1) + 1);
    await sb
      .from("user_vocabulary_notebook_entries")
      .update({
        leitner_box: box,
        next_review_at: new Date(now.getTime() + intervalDaysForBox(box) * 86_400_000).toISOString(),
        last_reviewed_at: now.toISOString(),
        review_count: (Number(row.review_count ?? 0) || 0) + 1,
        correct_count: (Number(row.correct_count ?? 0) || 0) + 1,
      })
      .eq("id", String(row.id))
      .eq("user_id", input.userId);
    out.push(String(row.word ?? ""));
  }
  return out;
};
