// Fluency signals a browser can honestly give for a spoken answer, and the
// comparison of two attempts at the same speaking prompt.
//
// While the learner speaks, browser speech recognition sends a growing
// transcript. The app keeps a timeline of "marks": the time (ms since Record)
// and the number of words recognised so far, each time that number changes.
// From it we get:
//   - words per minute over the Record → Stop time,
//   - long pauses: gaps of more than 2.5 s with no new words between two
//     recognised words (silence before the first word is reported separately
//     as "time to first word"; silence after the last word is ignored),
//   - filler words in the transcript.
// Recognition arrives in bursts and some browsers drop "um" and "uh", so
// these are approximate signals, never a pronunciation or fluency grade.
//
// Pure module with no imports, so the English app bundles it too.

export type SpeechMark = { at: number; words: number };

export const LONG_PAUSE_MS = 2500;
const MAX_MARKS = 600;

export type FluencySignals = {
  words: number;
  speaking_seconds: number | null;
  wpm: number | null;
  long_pauses: number;
  longest_pause_seconds: number | null;
  first_word_seconds: number | null;
  fillers: string[];
  filler_count: number;
};

const SINGLE_FILLERS = new Set(["um", "umm", "uh", "uhh", "er", "erm", "hmm", "ah", "eh"]);
const PHRASE_FILLERS = ["you know", "i mean", "kind of", "sort of"];

const words = (text: string): string[] =>
  String(text ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}'\s-]+/gu, " ").split(/\s+/).filter(Boolean);

export const countSpokenWords = (text: string): number => words(text).length;

/** Fillers found in the transcript, each listed once per use ("um", "you know"). */
export const findFillers = (text: string): string[] => {
  const tokens = words(text);
  const found = tokens.filter((token) => SINGLE_FILLERS.has(token));
  const joined = ` ${tokens.join(" ")} `;
  for (const phrase of PHRASE_FILLERS) {
    let from = 0;
    for (;;) {
      const at = joined.indexOf(` ${phrase} `, from);
      if (at < 0) break;
      found.push(phrase);
      from = at + phrase.length + 1;
    }
  }
  return found;
};

/** Keeps a timeline usable: finite, non-negative, in time order, word counts never going down, capped in size. */
export const cleanMarks = (raw: unknown): SpeechMark[] => {
  if (!Array.isArray(raw)) return [];
  const out: SpeechMark[] = [];
  for (const entry of raw.slice(0, MAX_MARKS * 2)) {
    if (!entry || typeof entry !== "object") continue;
    const at = Number((entry as Record<string, unknown>).at);
    const count = Number((entry as Record<string, unknown>).words);
    if (!Number.isFinite(at) || !Number.isFinite(count) || at < 0 || count < 0) continue;
    const previous = out[out.length - 1];
    if (previous && (at < previous.at || count <= previous.words)) continue;
    out.push({ at: Math.round(at), words: Math.round(count) });
    if (out.length >= MAX_MARKS) break;
  }
  return out;
};

/** Gaps (ms) between consecutive marks where the word count grew, i.e. pauses between words. */
export const pauseGaps = (marks: SpeechMark[]): number[] => {
  const gaps: number[] = [];
  for (let index = 1; index < marks.length; index += 1) gaps.push(marks[index]!.at - marks[index - 1]!.at);
  return gaps;
};

/** All signals from a transcript, the Record → Stop time and the timeline (if any). */
export const fluencySignals = (input: { transcript: string; speakingSeconds: number | null; marks?: SpeechMark[] }): FluencySignals => {
  const count = countSpokenWords(input.transcript);
  const seconds = input.speakingSeconds !== null && Number.isFinite(input.speakingSeconds) && input.speakingSeconds > 0
    ? Math.round(input.speakingSeconds)
    : null;
  const marks = cleanMarks(input.marks ?? []);
  const gaps = pauseGaps(marks);
  const long = gaps.filter((gap) => gap > LONG_PAUSE_MS);
  const fillers = findFillers(input.transcript);
  return {
    words: count,
    speaking_seconds: seconds,
    wpm: seconds && seconds >= 5 ? Math.round((count / seconds) * 60) : null,
    long_pauses: long.length,
    longest_pause_seconds: long.length ? Math.round(Math.max(...long) / 100) / 10 : null,
    first_word_seconds: marks.length ? Math.round(marks[0]!.at / 100) / 10 : null,
    fillers: [...new Set(fillers)],
    filler_count: fillers.length,
  };
};

/**
 * Timing summary sent by the app with a spoken answer, checked on the server:
 * numbers in range, consistent with the transcript; anything odd is dropped.
 */
export const sanitizeClientFluency = (raw: unknown, transcript: string, speakingSeconds: number | null): Pick<FluencySignals, "long_pauses" | "longest_pause_seconds" | "first_word_seconds"> | null => {
  if (!raw || typeof raw !== "object" || speakingSeconds === null) return null;
  const rec = raw as Record<string, unknown>;
  const limit = Math.max(1, speakingSeconds);
  const pauses = Number(rec.long_pauses);
  const longest = rec.longest_pause_seconds === null ? null : Number(rec.longest_pause_seconds);
  const first = rec.first_word_seconds === null ? null : Number(rec.first_word_seconds);
  if (!Number.isInteger(pauses) || pauses < 0 || pauses > Math.max(1, countSpokenWords(transcript))) return null;
  if (longest !== null && (!Number.isFinite(longest) || longest < 0 || longest > limit)) return null;
  if (first !== null && (!Number.isFinite(first) || first < 0 || first > limit)) return null;
  if (pauses > 0 && longest === null) return null;
  return {
    long_pauses: pauses,
    longest_pause_seconds: longest === null ? null : Math.round(longest * 10) / 10,
    first_word_seconds: first === null ? null : Math.round(first * 10) / 10,
  };
};

export type AttemptSnapshot = {
  overall: number | null;
  task: number | null;
  vocabulary: number | null;
  grammar: number | null;
  fluency: number | null;
  wpm: number | null;
  long_pauses: number | null;
  filler_count: number | null;
  words: number | null;
};

export type CompareRow = {
  key: keyof AttemptSnapshot;
  before: number | null;
  after: number | null;
  delta: number | null;
  /** better / worse / same, judged by whether higher or lower is better for this signal; null when unknown. */
  verdict: "better" | "worse" | "same" | null;
};

const LOWER_IS_BETTER = new Set<keyof AttemptSnapshot>(["long_pauses", "filler_count"]);

/**
 * Row-by-row comparison of two attempts. Pace (wpm) is "better" when it moves
 * toward the level's band, so it needs the band; outside it, more words and
 * higher scores are better and fewer pauses or fillers are better.
 */
export const compareAttempts = (before: AttemptSnapshot, after: AttemptSnapshot, paceBand: [number, number] | null): CompareRow[] => {
  const keys: Array<keyof AttemptSnapshot> = ["overall", "task", "vocabulary", "grammar", "fluency", "wpm", "long_pauses", "filler_count", "words"];
  return keys
    .map((key): CompareRow => {
      const x = before[key];
      const y = after[key];
      if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) return { key, before: x, after: y, delta: null, verdict: null };
      const delta = Math.round((y - x) * 10) / 10;
      let verdict: CompareRow["verdict"];
      if (key === "wpm") {
        if (!paceBand) verdict = null;
        else {
          const distance = (value: number) => (value < paceBand[0] ? paceBand[0] - value : value > paceBand[1] ? value - paceBand[1] : 0);
          const dx = distance(x);
          const dy = distance(y);
          verdict = dy < dx ? "better" : dy > dx ? "worse" : "same";
        }
      } else if (delta === 0) verdict = "same";
      else verdict = (LOWER_IS_BETTER.has(key) ? delta < 0 : delta > 0) ? "better" : "worse";
      return { key, before: x, after: y, delta, verdict };
    })
    .filter((row) => row.before !== null || row.after !== null);
};
