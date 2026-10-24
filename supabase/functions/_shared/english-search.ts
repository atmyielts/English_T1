// Search inside Schood English content (hub /search, the Ctrl+K switcher):
// lessons in every skill (by title, topic or level), words in the learner's
// notebook, their recent mistakes and the grammar handbook's rules.
//
// Pure: the hub loads the candidates and passes them in. Ranking is by how
// well the text matches, then by how personal the result is (the learner's
// own words and mistakes first among equals), then by level closeness.

import { type Cefr, CEFR_ORDER, isCefr, TODAY_SKILLS, type TodaySkill } from "./english-today.ts";

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 80;
export const SEARCH_LIMIT = 12;
const PER_KIND_LIMIT = 6;

export type SearchKind = "lesson" | "word" | "mistake" | "rule";

export type SearchLesson = { id: string; skill: string; slug: string; title: string; level: string | null; tags: string[] };
export type SearchWord = { id: string; word: string; definition: string | null };
export type SearchMistake = { id: string; skill: string; subskill: string; text: string; topic: string | null; lesson_slug: string | null };
export type SearchRule = { slug: string; title: string; level: string | null; focus_area: string | null };

export type SearchAccess = {
  /** Skills in the learner's plan (all for admins). */
  owned: readonly string[];
  /** Free activities left today. */
  freeLeft: number;
};

export type SearchResult = {
  kind: SearchKind;
  id: string;
  title: string;
  /** A second line: definition, topic, skill. */
  detail: string | null;
  skill: TodaySkill | null;
  level: Cefr | null;
  href: string;
  /** open: in the plan or always free; free: uses today's free activity; locked: not in the plan. */
  access: "open" | "free" | "locked";
  score: number;
};

/** Lower case, accents and apostrophes removed, punctuation to spaces (same idea as the handbook search). */
export const foldSearch = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[ʻʼʹ‘’‛`´']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** The query as words, or null when it is too short to search. */
export const searchTerms = (query: unknown): { words: string[]; levels: Cefr[]; text: string } | null => {
  if (typeof query !== "string") return null;
  const text = foldSearch(query.slice(0, SEARCH_MAX_LENGTH));
  if (text.replace(/\s/g, "").length < SEARCH_MIN_LENGTH) return null;
  const all = text.split(" ").filter(Boolean);
  const levels = all.map((word) => word.toUpperCase()).filter(isCefr);
  const words = all.filter((word) => !isCefr(word.toUpperCase()));
  return { words, levels: [...new Set(levels)], text: words.join(" ") };
};

/**
 * How well `title` (and the extra text) matches every word: 0 = no match.
 * Whole title = 100, title starts with the query = 80, every word starts a
 * title word = 60, all words inside the title = 40, found only in the extra
 * text (topic, tags, definition) = 20.
 */
export const matchScore = (words: string[], title: string, extra = ""): number => {
  if (!words.length) return 10;
  const folded = foldSearch(title);
  const phrase = words.join(" ");
  if (folded === phrase) return 100;
  if (folded.startsWith(phrase)) return 80;
  const titleWords = folded.split(" ");
  if (words.every((word) => titleWords.some((part) => part.startsWith(word)))) return 60;
  if (words.every((word) => folded.includes(word))) return 40;
  const haystack = `${folded} ${foldSearch(extra)}`;
  if (words.every((word) => haystack.includes(word))) return 20;
  return 0;
};

const levelGap = (level: Cefr | null, learner: Cefr | null): number =>
  level && learner ? Math.abs(CEFR_ORDER.indexOf(level) - CEFR_ORDER.indexOf(learner)) : 2;

const isSkill = (value: unknown): value is TodaySkill => (TODAY_SKILLS as readonly string[]).includes(String(value));

const topicWords = (topic: string | null): string => (topic ? topic.replace(/[_.-]+/g, " ") : "");

/** Ranked results across every kind. Pure. */
export const rankSearch = (
  query: unknown,
  sources: { lessons: SearchLesson[]; words: SearchWord[]; mistakes: SearchMistake[]; rules: SearchRule[] },
  options: { access: SearchAccess; learnerLevel?: Cefr | null; limit?: number },
): SearchResult[] => {
  const terms = searchTerms(query);
  if (!terms) return [];
  const { words, levels } = terms;
  const learnerLevel = options.learnerLevel ?? null;
  const owned = new Set(options.access.owned);
  const results: SearchResult[] = [];
  const levelOk = (level: Cefr | null) => !levels.length || (level !== null && levels.includes(level));

  const lessons: SearchResult[] = [];
  for (const lesson of sources.lessons) {
    if (!isSkill(lesson.skill)) continue;
    const level = isCefr(lesson.level) ? lesson.level : null;
    if (!levelOk(level)) continue;
    const match = matchScore(words, lesson.title, `${lesson.skill} ${lesson.tags.map(topicWords).join(" ")}`);
    if (!match) continue;
    const access = owned.has(lesson.skill) ? "open" : options.access.freeLeft > 0 ? "free" : "locked";
    lessons.push({
      kind: "lesson",
      id: lesson.id,
      title: lesson.title,
      detail: null,
      skill: lesson.skill,
      level,
      href: `/${lesson.skill}/${encodeURIComponent(lesson.slug)}`,
      access,
      // Closer to the learner's level ranks higher among equal matches; locked lessons sink a little.
      score: match - levelGap(level, learnerLevel) * 2 - (access === "locked" ? 6 : 0),
    });
  }

  const personal: SearchResult[] = [];
  if (!levels.length) {
    for (const word of sources.words) {
      const match = matchScore(words, word.word, word.definition ?? "");
      if (!match) continue;
      personal.push({
        kind: "word", id: word.id, title: word.word, detail: word.definition, skill: "vocabulary", level: null,
        href: "/vocabulary", access: "open", score: match + 8,
      });
    }
    for (const mistake of sources.mistakes) {
      const match = matchScore(words, mistake.text, `${topicWords(mistake.topic)} ${topicWords(mistake.subskill)}`);
      if (!match) continue;
      const skill = isSkill(mistake.skill) ? mistake.skill : null;
      personal.push({
        kind: "mistake", id: mistake.id, title: mistake.text, detail: mistake.topic, skill, level: null,
        href: mistake.lesson_slug ? `/grammar/${encodeURIComponent(mistake.lesson_slug)}` : "/review",
        access: "open", score: match + 6,
      });
    }
  }

  const rules: SearchResult[] = [];
  for (const rule of sources.rules) {
    const level = isCefr(rule.level) ? rule.level : null;
    if (!levelOk(level)) continue;
    const match = matchScore(words, rule.title, topicWords(rule.focus_area));
    if (!match) continue;
    rules.push({
      kind: "rule", id: rule.slug, title: rule.title, detail: rule.focus_area, skill: "grammar", level,
      // The handbook is reference for every signed-in learner.
      href: `/grammar/handbook#${encodeURIComponent(rule.slug)}`, access: "open",
      score: match + 2 - levelGap(level, learnerLevel),
    });
  }

  const byScore = (a: SearchResult, b: SearchResult) => b.score - a.score || a.title.localeCompare(b.title);
  for (const group of [lessons, personal, rules]) results.push(...group.sort(byScore).slice(0, PER_KIND_LIMIT * (group === lessons ? 2 : 1)));
  return results.sort(byScore).slice(0, options.limit ?? SEARCH_LIMIT);
};

/** Escapes a value for a PostgREST ilike pattern (% and _ are wildcards there). */
export const ilikePattern = (value: string): string => `%${value.replace(/[\\%_]/g, (char) => `\\${char}`).replace(/[,()]/g, " ")}%`;
