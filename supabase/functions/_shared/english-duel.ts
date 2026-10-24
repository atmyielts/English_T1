// Vocabulary duels: two learners, ten questions, sixty seconds each.
//
// Pure rules only (codes, question building, server-side timing, scoring,
// outcomes, XP and what each player may see), so all of it is testable
// without a database. Loading and saving live in english-duel-service.ts.
//
// Fairness: both players get the same ten questions in the same order with
// the same options. Four come from the creator's side (their vocabulary level
// and saved words), four from the opponent's side and two from the level in
// between, interleaved. Each side contributes at most two of its own saved
// words, so neither player gets more "home" words than the other.
//
// Timing is server-authoritative: the clock starts when the server records
// the start, and an answer counts only if the server receives it before the
// player's deadline (plus a small network grace).

import { CEFR_ORDER, type Cefr, isCefr } from "./english-today.ts";

export const DUEL_QUESTION_COUNT = 10;
export const DUEL_OPTION_COUNT = 4;
export const DUEL_SECONDS = 60;
/** Accepts answers that left the player's device just before the deadline. */
export const DUEL_GRACE_MS = 2_500;
/** An invite nobody accepted stops working after a day. */
export const DUEL_INVITE_HOURS = 24;
/** After the friend joins, both have two days to play. */
export const DUEL_PLAY_HOURS = 48;
/** New duels one learner may create in 24 hours (rematches included). */
export const DUEL_CREATE_DAILY_LIMIT = 15;
/** Saved words each side may contribute. */
export const DUEL_SAVED_PER_SIDE = 2;
/** Ties on correct answers and mistakes are split by speed only beyond this. */
export const DUEL_TIE_MS = 1_000;

// XP: small and capped, so duels never outweigh real practice.
export const DUEL_XP_PLAYED = 5;
export const DUEL_XP_WIN = 5;
export const DUEL_XP_DRAW = 2;
export const DUEL_XP_DAILY_CAP = 20;

export const DUEL_CODE_LENGTH = 10;
/** 32 characters without I and O (they look like 1 and 0). */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${DUEL_CODE_LENGTH}}$`);

export type DuelStatus = "open" | "active" | "finished" | "expired";
export type DuelRole = "creator" | "opponent";
export type DuelOutcome = "win" | "loss" | "draw" | "walkover" | "forfeit";
export type DuelSide = "creator" | "opponent" | "shared";

/** A random invite code: 10 of 32 characters (50 bits), unbiased. */
export const generateDuelCode = (
  randomBytes: (size: number) => Uint8Array = (size) => crypto.getRandomValues(new Uint8Array(size)),
): string => Array.from(randomBytes(DUEL_CODE_LENGTH), (byte) => CODE_ALPHABET[byte & 31]).join("");

/** Uppercases and drops spaces/dashes; null unless it is a well-formed code. */
export const normalizeDuelCode = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const code = value.toUpperCase().replace(/[\s-]+/g, "");
  return CODE_PATTERN.test(code) ? code : null;
};

// === Questions ===

export type DuelWord = { word: string; definition: string; level: Cefr | null };
export type DuelPlayerWords = { level: Cefr | null; saved: DuelWord[] };

export type DuelQuestion = {
  /** The definition the player matches to a word. */
  prompt: string;
  /** Four words; the same order for both players. */
  options: string[];
  correct_index: number;
  side: DuelSide;
  level: Cefr | null;
};

const clip = (value: string, max: number): string => {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
};

const norm = (value: string): string => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const shuffle = <T>(items: T[], random: () => number): T[] => {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [out[index], out[swap]] = [out[swap]!, out[index]!];
  }
  return out;
};

const levelIndex = (level: Cefr | null): number => (level ? CEFR_ORDER.indexOf(level) : 1);

/** The level between two players' levels (rounded down); A2 when neither is known. */
export const meetingLevel = (a: Cefr | null, b: Cefr | null): Cefr => {
  if (!a && !b) return "A2";
  const index = Math.floor((levelIndex(a ?? b) + levelIndex(b ?? a)) / 2);
  return CEFR_ORDER[index]!;
};

/** Which side each of the ten questions comes from, interleaved. */
export const DUEL_SIDES: readonly DuelSide[] = [
  "creator", "opponent", "creator", "opponent", "shared",
  "opponent", "creator", "opponent", "creator", "shared",
];

const usable = (word: DuelWord): boolean => {
  const w = word.word.trim();
  const d = word.definition.trim();
  // One or two words that fit on a button, with a definition that does not give the word away.
  return w.length >= 2 && w.length <= 32 && w.split(/\s+/).length <= 3 && d.length >= 8 && !norm(d).split(" ").includes(norm(w));
};

/**
 * Ten questions for a duel, or null when there are not enough distinct words.
 * `deck` is the published vocabulary (word, definition, level).
 */
export const buildDuelQuestions = (input: {
  creator: DuelPlayerWords;
  opponent: DuelPlayerWords;
  deck: DuelWord[];
  random?: () => number;
}): DuelQuestion[] | null => {
  const random = input.random ?? Math.random;
  const seen = new Set<string>();
  const deck = input.deck.filter(usable).filter((word) => {
    const key = norm(word.word);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (deck.length < DUEL_QUESTION_COUNT + DUEL_OPTION_COUNT - 1) return null;

  const used = new Set<string>();
  const take = (candidates: DuelWord[]): DuelWord | null => {
    for (const word of shuffle(candidates, random)) {
      const key = norm(word.word);
      if (!used.has(key) && usable(word)) {
        used.add(key);
        return word;
      }
    }
    return null;
  };

  // Deck words ordered by closeness to a level, so a sparse level borrows from its neighbours.
  const nearLevel = (level: Cefr): DuelWord[] => {
    const target = CEFR_ORDER.indexOf(level);
    const byDistance = new Map<number, DuelWord[]>();
    for (const word of deck) {
      const distance = word.level ? Math.abs(CEFR_ORDER.indexOf(word.level) - target) : 3;
      byDistance.set(distance, [...(byDistance.get(distance) ?? []), word]);
    }
    return [...byDistance.keys()].sort((a, b) => a - b).flatMap((distance) => shuffle(byDistance.get(distance)!, random));
  };
  const takeNear = (level: Cefr): DuelWord | null => {
    for (const word of nearLevel(level)) {
      const key = norm(word.word);
      if (!used.has(key)) {
        used.add(key);
        return word;
      }
    }
    return null;
  };

  const savedLeft: Record<"creator" | "opponent", number> = { creator: DUEL_SAVED_PER_SIDE, opponent: DUEL_SAVED_PER_SIDE };
  const levelOf = (side: DuelSide): Cefr =>
    side === "shared"
      ? meetingLevel(input.creator.level, input.opponent.level)
      : (input[side].level ?? meetingLevel(input.creator.level, input.opponent.level));

  const targets: Array<{ word: DuelWord; side: DuelSide }> = [];
  for (const side of DUEL_SIDES) {
    let word: DuelWord | null = null;
    if (side !== "shared" && savedLeft[side] > 0) {
      word = take(input[side].saved);
      if (word) savedLeft[side] -= 1;
    }
    word = word ?? takeNear(levelOf(side));
    if (!word) return null;
    targets.push({ word, side });
  }

  const questions: DuelQuestion[] = [];
  for (const { word, side } of targets) {
    const target = norm(word.word);
    const level = word.level ?? levelOf(side);
    const distractors: string[] = [];
    for (const other of nearLevel(level)) {
      const key = norm(other.word);
      if (key === target || distractors.some((entry) => norm(entry) === key)) continue;
      if (norm(other.definition) === norm(word.definition)) continue;
      distractors.push(other.word.trim());
      if (distractors.length === DUEL_OPTION_COUNT - 1) break;
    }
    if (distractors.length < DUEL_OPTION_COUNT - 1) return null;
    const options = shuffle([word.word.trim(), ...distractors], random);
    questions.push({
      prompt: clip(word.definition, 220),
      options,
      correct_index: options.findIndex((option) => norm(option) === target),
      side,
      level,
    });
  }
  return questions;
};

/** Questions read back from the database; null if anything is malformed. */
export const parseDuelQuestions = (value: unknown): DuelQuestion[] | null => {
  if (!Array.isArray(value) || value.length !== DUEL_QUESTION_COUNT) return null;
  const out: DuelQuestion[] = [];
  for (const raw of value) {
    const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const options = Array.isArray(row.options) ? row.options.map((option) => String(option)) : [];
    const correct = Number(row.correct_index);
    if (typeof row.prompt !== "string" || options.length !== DUEL_OPTION_COUNT) return null;
    if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) return null;
    out.push({
      prompt: row.prompt,
      options,
      correct_index: correct,
      side: row.side === "creator" || row.side === "opponent" ? row.side : "shared",
      level: isCefr(row.level) ? row.level : null,
    });
  }
  return out;
};

// === One player's run ===

export type DuelAnswer = { q: number; choice: number; correct: boolean; ms: number };

export type DuelPlayerState = {
  started_at: string | null;
  deadline_at: string | null;
  finished_at: string | null;
  answers: DuelAnswer[];
};

export const parseDuelAnswers = (value: unknown): DuelAnswer[] =>
  (Array.isArray(value) ? value : [])
    .map((raw) => (raw && typeof raw === "object" ? raw as Record<string, unknown> : {}))
    .map((row) => ({ q: Number(row.q), choice: Number(row.choice), correct: row.correct === true, ms: Number(row.ms) }))
    .filter((row) => Number.isInteger(row.q) && Number.isInteger(row.choice) && Number.isFinite(row.ms))
    .slice(0, DUEL_QUESTION_COUNT);

/** The clock a start sets: deadline = start + 60 s. */
export const startClock = (now: Date): { started_at: string; deadline_at: string } => ({
  started_at: now.toISOString(),
  deadline_at: new Date(now.getTime() + DUEL_SECONDS * 1000).toISOString(),
});

/** Whole seconds left on the player's clock (0 when not started or over). */
export const secondsLeft = (state: Pick<DuelPlayerState, "deadline_at" | "finished_at">, now: Date): number => {
  if (!state.deadline_at || state.finished_at) return 0;
  return Math.max(0, Math.ceil((Date.parse(state.deadline_at) - now.getTime()) / 1000));
};

/** True once the server can no longer accept an answer from this player. */
export const isTimeUp = (state: Pick<DuelPlayerState, "deadline_at">, now: Date): boolean =>
  Boolean(state.deadline_at) && now.getTime() > Date.parse(state.deadline_at!) + DUEL_GRACE_MS;

/** Finished: all ten answered, or the clock ran out (recorded at the deadline). */
export const effectiveFinish = (state: DuelPlayerState, now: Date): string | null => {
  if (state.finished_at) return state.finished_at;
  if (!state.started_at) return null;
  if (state.answers.length >= DUEL_QUESTION_COUNT) {
    return new Date(Date.parse(state.started_at) + scoreOf(state.answers).elapsed_ms).toISOString();
  }
  if (isTimeUp(state, now)) return state.deadline_at;
  return null;
};

export type AnswerRejection = "not_started" | "finished" | "time_up" | "already_answered" | "wrong_question" | "bad_choice";

export type AnswerResult =
  | { ok: true; state: DuelPlayerState; correct: boolean; correct_index: number; finished: boolean }
  | { ok: false; reason: AnswerRejection; state: DuelPlayerState };

/**
 * Records the answer to question `index` (answered in order). The server's
 * clock decides: after the deadline (+ grace) the run is closed instead.
 */
export const applyDuelAnswer = (
  state: DuelPlayerState,
  questions: DuelQuestion[],
  input: { index: number; choice: number },
  now: Date,
): AnswerResult => {
  if (!state.started_at || !state.deadline_at) return { ok: false, reason: "not_started", state };
  if (state.finished_at || state.answers.length >= questions.length) return { ok: false, reason: "finished", state };
  if (isTimeUp(state, now)) return { ok: false, reason: "time_up", state: { ...state, finished_at: state.deadline_at } };
  if (!Number.isInteger(input.index) || input.index < 0) return { ok: false, reason: "wrong_question", state };
  if (input.index < state.answers.length) return { ok: false, reason: "already_answered", state };
  if (input.index > state.answers.length) return { ok: false, reason: "wrong_question", state };
  const question = questions[input.index]!;
  if (!Number.isInteger(input.choice) || input.choice < 0 || input.choice >= question.options.length) {
    return { ok: false, reason: "bad_choice", state };
  }
  const correct = input.choice === question.correct_index;
  const ms = Math.max(0, Math.min(DUEL_SECONDS * 1000, now.getTime() - Date.parse(state.started_at)));
  const answers = [...state.answers, { q: input.index, choice: input.choice, correct, ms }];
  const finished = answers.length >= questions.length;
  return {
    ok: true,
    correct,
    correct_index: question.correct_index,
    finished,
    state: { ...state, answers, finished_at: finished ? now.toISOString() : null },
  };
};

export type DuelScore = { correct: number; wrong: number; answered: number; elapsed_ms: number };

export const scoreOf = (answers: DuelAnswer[]): DuelScore => {
  const correct = answers.filter((answer) => answer.correct).length;
  return {
    correct,
    wrong: answers.length - correct,
    answered: answers.length,
    elapsed_ms: answers.length ? Math.max(...answers.map((answer) => answer.ms)) : DUEL_SECONDS * 1000,
  };
};

/**
 * Who won: more correct answers; then fewer wrong ones; then the faster run
 * if it was more than a second faster. Otherwise a draw.
 */
export const compareScores = (a: DuelScore, b: DuelScore): "a" | "b" | "draw" => {
  if (a.correct !== b.correct) return a.correct > b.correct ? "a" : "b";
  if (a.wrong !== b.wrong) return a.wrong < b.wrong ? "a" : "b";
  if (Math.abs(a.elapsed_ms - b.elapsed_ms) > DUEL_TIE_MS) return a.elapsed_ms < b.elapsed_ms ? "a" : "b";
  return "draw";
};

export const duelXp = (outcome: DuelOutcome): number => {
  if (outcome === "win") return DUEL_XP_PLAYED + DUEL_XP_WIN;
  if (outcome === "draw") return DUEL_XP_PLAYED + DUEL_XP_DRAW;
  // A walkover earns the played XP only, so an unplayed second account cannot farm wins.
  if (outcome === "loss" || outcome === "walkover") return DUEL_XP_PLAYED;
  return 0;
};

// === The whole duel ===

export type DuelRecord = {
  status: DuelStatus;
  invite_expires_at: string;
  play_expires_at: string | null;
  creator_id: string;
  opponent_id: string | null;
};

export type DuelPlayerRecord = DuelPlayerState & { user_id: string; role: DuelRole };

export type DuelSettlement = {
  status: DuelStatus;
  /** Set when the duel just ended or had ended. */
  winner_id: string | null;
  players: Array<{ user_id: string; finished_at: string | null; outcome: DuelOutcome | null; xp: number; score: DuelScore }>;
};

/**
 * Where a duel stands at `now`: expired invites, players whose clock ran out,
 * and, once both are done (or the play window closed), the result.
 */
export const settleDuel = (duel: DuelRecord, players: DuelPlayerRecord[], now: Date): DuelSettlement => {
  const base = players.map((player) => ({
    user_id: player.user_id,
    finished_at: effectiveFinish(player, now),
    outcome: null as DuelOutcome | null,
    xp: 0,
    score: scoreOf(player.answers),
  }));
  if (duel.status === "open") {
    return { status: now.getTime() > Date.parse(duel.invite_expires_at) ? "expired" : "open", winner_id: null, players: base };
  }
  if (duel.status === "expired") return { status: "expired", winner_id: null, players: base };

  const creator = base.find((player) => player.user_id === duel.creator_id);
  const opponent = base.find((player) => player.user_id === duel.opponent_id);
  if (!creator || !opponent) return { status: duel.status, winner_id: null, players: base };

  const windowClosed = duel.play_expires_at !== null && now.getTime() > Date.parse(duel.play_expires_at);
  const bothDone = Boolean(creator.finished_at && opponent.finished_at);
  if (!bothDone && !windowClosed) return { status: "active", winner_id: null, players: base };

  const played = (entry: typeof creator) => Boolean(entry.finished_at) && entry.score.answered > 0;
  const set = (entry: typeof creator, outcome: DuelOutcome) => {
    entry.outcome = outcome;
    entry.xp = duelXp(outcome);
    entry.finished_at = entry.finished_at ?? now.toISOString();
  };
  if (bothDone && played(creator) && played(opponent)) {
    const result = compareScores(creator.score, opponent.score);
    set(creator, result === "a" ? "win" : result === "b" ? "loss" : "draw");
    set(opponent, result === "b" ? "win" : result === "a" ? "loss" : "draw");
  } else if (played(creator) !== played(opponent)) {
    set(played(creator) ? creator : opponent, "walkover");
    set(played(creator) ? opponent : creator, "forfeit");
  } else if (!played(creator) && !played(opponent)) {
    // Nobody answered anything: no result, no XP.
    return { status: "expired", winner_id: null, players: base };
  }
  const winner = [creator, opponent].find((entry) => entry.outcome === "win" || entry.outcome === "walkover");
  return { status: "finished", winner_id: winner?.user_id ?? null, players: base };
};

/** XP from duels per learner day, never above the daily cap. */
export const cappedDuelXp = (rows: Array<{ date: string; xp: number }>): Map<string, number> => {
  const out = new Map<string, number>();
  for (const row of rows) {
    if (!(row.xp > 0)) continue;
    out.set(row.date, Math.min(DUEL_XP_DAILY_CAP, (out.get(row.date) ?? 0) + Math.floor(row.xp)));
  }
  return out;
};

// === Names ===

/**
 * The only name another player sees: a first name, or "" when none is known.
 * Never a surname, never an email (kid-safe).
 */
export const duelFirstName = (input: { first?: unknown; full?: unknown }): string => {
  const clean = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
  const first = clean(input.first) || clean(input.full).split(" ")[0] || "";
  const word = first.split(" ")[0] ?? "";
  if (!word || word.includes("@") || /\d{3,}/.test(word)) return "";
  return Array.from(word).slice(0, 20).join("");
};

// === What a player sees ===

export type DuelView = {
  code: string;
  status: DuelStatus;
  role: DuelRole;
  server_now: string;
  invite_expires_at: string;
  play_expires_at: string | null;
  opponent_name: string;
  opponent_joined: boolean;
  me: {
    started: boolean;
    finished: boolean;
    deadline_at: string | null;
    seconds_left: number;
    answered: number;
    correct: number;
    outcome: DuelOutcome | null;
    xp: number;
  };
  /** The next question while the player's clock runs; never the answer key. */
  question: { index: number; total: number; prompt: string; options: string[] } | null;
  /** The opponent's result: only once this player has finished. */
  opponent: { started: boolean; finished: boolean; correct: number | null; answered: number | null; outcome: DuelOutcome | null } | null;
  /** Every question with the right answer and both choices, once the duel is over. */
  review: Array<{ prompt: string; options: string[]; correct_index: number; mine: number | null; theirs: number | null }> | null;
  can_rematch: boolean;
  rematch_code: string | null;
};

export const buildDuelView = (input: {
  code: string;
  duel: DuelRecord & { rematch_code?: string | null };
  questions: DuelQuestion[] | null;
  me: DuelPlayerRecord & { outcome?: DuelOutcome | null; xp?: number };
  them: (DuelPlayerRecord & { outcome?: DuelOutcome | null }) | null;
  opponentName: string;
  now: Date;
}): DuelView => {
  const { duel, questions, me, them, now } = input;
  const myFinish = effectiveFinish(me, now);
  const myScore = scoreOf(me.answers);
  const playing = duel.status === "active" && Boolean(me.started_at) && !myFinish && questions !== null;
  const next = playing ? questions![me.answers.length] : undefined;
  const over = duel.status === "finished" || duel.status === "expired";
  const theirFinish = them ? effectiveFinish(them, now) : null;
  const choiceAt = (answers: DuelAnswer[], index: number) => answers.find((answer) => answer.q === index)?.choice ?? null;
  return {
    code: input.code,
    status: duel.status,
    role: me.role,
    server_now: now.toISOString(),
    invite_expires_at: duel.invite_expires_at,
    play_expires_at: duel.play_expires_at,
    opponent_name: input.opponentName,
    opponent_joined: Boolean(them),
    me: {
      started: Boolean(me.started_at),
      finished: Boolean(myFinish),
      deadline_at: me.deadline_at,
      seconds_left: secondsLeft({ deadline_at: me.deadline_at, finished_at: myFinish }, now),
      answered: myScore.answered,
      correct: myScore.correct,
      outcome: me.outcome ?? null,
      xp: me.xp ?? 0,
    },
    question: next
      ? { index: me.answers.length, total: questions!.length, prompt: next.prompt, options: next.options }
      : null,
    opponent: them && (myFinish || over)
      ? {
        started: Boolean(them.started_at),
        finished: Boolean(theirFinish),
        correct: theirFinish ? scoreOf(them.answers).correct : null,
        answered: theirFinish ? them.answers.length : null,
        outcome: them.outcome ?? null,
      }
      : them
      ? { started: Boolean(them.started_at), finished: Boolean(theirFinish), correct: null, answered: null, outcome: null }
      : null,
    review: duel.status === "finished" && questions
      ? questions.map((question, index) => ({
        prompt: question.prompt,
        options: question.options,
        correct_index: question.correct_index,
        mine: choiceAt(me.answers, index),
        theirs: them ? choiceAt(them.answers, index) : null,
      }))
      : null,
    can_rematch: duel.status === "finished" && Boolean(them) && !input.duel.rematch_code,
    rematch_code: input.duel.rematch_code ?? null,
  };
};
