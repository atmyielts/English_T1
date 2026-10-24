import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyDuelAnswer,
  buildDuelQuestions,
  buildDuelView,
  cappedDuelXp,
  compareScores,
  DUEL_GRACE_MS,
  DUEL_QUESTION_COUNT,
  DUEL_SIDES,
  DUEL_XP_DAILY_CAP,
  type DuelPlayerRecord,
  type DuelPlayerState,
  type DuelQuestion,
  type DuelRecord,
  type DuelWord,
  duelFirstName,
  duelXp,
  effectiveFinish,
  generateDuelCode,
  meetingLevel,
  normalizeDuelCode,
  parseDuelQuestions,
  scoreOf,
  secondsLeft,
  settleDuel,
  startClock,
} from "./english-duel.ts";
import { CEFR_ORDER } from "./english-today.ts";

const seeded = (seed = 7) => {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
};

const deckWords = (): DuelWord[] =>
  CEFR_ORDER.flatMap((level) =>
    Array.from({ length: 12 }, (_, index) => ({
      word: `${level.toLowerCase()}word${String.fromCharCode(97 + index)}`,
      definition: `meaning number ${index} at level ${level}`,
      level,
    }))
  );

const questions = (): DuelQuestion[] =>
  buildDuelQuestions({
    creator: { level: "A2", saved: [] },
    opponent: { level: "B2", saved: [] },
    deck: deckWords(),
    random: seeded(),
  })!;

Deno.test("invite codes are 10 unambiguous characters and normalise", () => {
  const code = generateDuelCode();
  assertEquals(code.length, 10);
  assert(!/[IO01]/.test(code));
  assertEquals(normalizeDuelCode(` ${code.slice(0, 5).toLowerCase()}-${code.slice(5)} `), code);
  assertEquals(normalizeDuelCode("SHORT"), null);
  assertEquals(normalizeDuelCode("ABCDEFGHIO"), null);
  assertEquals(normalizeDuelCode(42), null);
  // Every byte maps to one of 32 characters, so the code is unbiased.
  assertEquals(generateDuelCode(() => new Uint8Array(10).fill(255)), "9999999999");
});

Deno.test("both players get the same ten questions, mixed fairly from both sides", () => {
  const built = questions();
  assertEquals(built.length, DUEL_QUESTION_COUNT);
  assertEquals(built.map((question) => question.side), [...DUEL_SIDES]);
  assertEquals(built.filter((question) => question.side === "creator").length, built.filter((question) => question.side === "opponent").length);
  for (const question of built) {
    assertEquals(question.options.length, 4);
    assertEquals(new Set(question.options).size, 4);
    assert(question.correct_index >= 0 && question.correct_index < 4);
  }
  // Each word appears once as an answer.
  assertEquals(new Set(built.map((question) => question.options[question.correct_index])).size, 10);
  // Creator questions sit at the creator's level, opponent ones at theirs, shared ones in between.
  assert(built.filter((question) => question.side === "creator").every((question) => question.level === "A2"));
  assert(built.filter((question) => question.side === "opponent").every((question) => question.level === "B2"));
  assert(built.filter((question) => question.side === "shared").every((question) => question.level === "B1"));
});

Deno.test("each side contributes at most two saved words", () => {
  const saved = (prefix: string): DuelWord[] =>
    Array.from({ length: 6 }, (_, index) => ({ word: `${prefix}saved${index}`, definition: `a saved meaning ${prefix} ${index}`, level: null }));
  const built = buildDuelQuestions({
    creator: { level: "B1", saved: saved("c") },
    opponent: { level: "B1", saved: saved("o") },
    deck: deckWords(),
    random: seeded(3),
  })!;
  const answers = built.map((question) => question.options[question.correct_index]!);
  assertEquals(answers.filter((word) => word.startsWith("csaved")).length, 2);
  assertEquals(answers.filter((word) => word.startsWith("osaved")).length, 2);
});

Deno.test("no duel without enough words, and definitions never give the word away", () => {
  assertEquals(buildDuelQuestions({ creator: { level: null, saved: [] }, opponent: { level: null, saved: [] }, deck: deckWords().slice(0, 8) }), null);
  const leaky: DuelWord[] = [{ word: "apple", definition: "an apple is a round fruit", level: "A1" }];
  const built = buildDuelQuestions({ creator: { level: "A1", saved: leaky }, opponent: { level: "A1", saved: [] }, deck: deckWords(), random: seeded(5) })!;
  assert(!built.some((question) => question.options.includes("apple")));
});

Deno.test("meeting level sits between both players", () => {
  assertEquals(meetingLevel("A1", "C1"), "B1");
  assertEquals(meetingLevel(null, "B2"), "B2");
  assertEquals(meetingLevel(null, null), "A2");
});

Deno.test("stored questions are validated when read back", () => {
  const built = questions();
  assertEquals(parseDuelQuestions(JSON.parse(JSON.stringify(built))), built);
  assertEquals(parseDuelQuestions(built.slice(0, 9)), null);
  assertEquals(parseDuelQuestions([...built.slice(0, 9), { ...built[9], correct_index: 7 }]), null);
});

Deno.test("answers count only in order and before the server deadline (+ grace)", () => {
  const built = questions();
  const start = new Date("2026-10-26T10:00:00Z");
  const state = { ...startClock(start), finished_at: null, answers: [] };
  assertEquals(state.deadline_at, "2026-10-26T10:01:00.000Z");
  assertEquals(applyDuelAnswer({ ...state, started_at: null, deadline_at: null }, built, { index: 0, choice: 0 }, start).ok, false);

  const first = applyDuelAnswer(state, built, { index: 0, choice: built[0]!.correct_index }, new Date(start.getTime() + 3_000));
  assert(first.ok);
  assertEquals(first.correct, true);
  assertEquals(first.state.answers[0]!.ms, 3_000);

  const again = applyDuelAnswer(first.state, built, { index: 0, choice: 1 }, new Date(start.getTime() + 4_000));
  assertEquals(again.ok ? null : again.reason, "already_answered");
  const skip = applyDuelAnswer(first.state, built, { index: 2, choice: 1 }, new Date(start.getTime() + 4_000));
  assertEquals(skip.ok ? null : skip.reason, "wrong_question");
  const bad = applyDuelAnswer(first.state, built, { index: 1, choice: 4 }, new Date(start.getTime() + 4_000));
  assertEquals(bad.ok ? null : bad.reason, "bad_choice");

  // Within the grace window an answer still counts; after it, the run closes at the deadline.
  const late = applyDuelAnswer(first.state, built, { index: 1, choice: 0 }, new Date(start.getTime() + 60_000 + DUEL_GRACE_MS - 100));
  assert(late.ok);
  assertEquals(late.state.answers[1]!.ms, 60_000);
  const tooLate = applyDuelAnswer(first.state, built, { index: 1, choice: 0 }, new Date(start.getTime() + 60_000 + DUEL_GRACE_MS + 1));
  assertEquals(tooLate.ok ? null : tooLate.reason, "time_up");
  assertEquals(tooLate.state.finished_at, state.deadline_at);
});

Deno.test("ten answers finish the run; an unfinished run ends at the deadline", () => {
  const built = questions();
  const start = new Date("2026-10-26T10:00:00Z");
  let state: DuelPlayerState = { ...startClock(start), finished_at: null, answers: [] };
  for (let index = 0; index < 10; index += 1) {
    const result = applyDuelAnswer(state, built, { index, choice: built[index]!.correct_index }, new Date(start.getTime() + (index + 1) * 2_000));
    assert(result.ok);
    state = result.state;
  }
  assertEquals(state.finished_at, "2026-10-26T10:00:20.000Z");
  assertEquals(scoreOf(state.answers), { correct: 10, wrong: 0, answered: 10, elapsed_ms: 20_000 });

  const idle = { ...startClock(start), finished_at: null, answers: [] };
  assertEquals(effectiveFinish(idle, new Date(start.getTime() + 30_000)), null);
  assertEquals(effectiveFinish(idle, new Date(start.getTime() + 70_000)), "2026-10-26T10:01:00.000Z");
  assertEquals(secondsLeft(idle, new Date(start.getTime() + 30_500)), 30);
  assertEquals(secondsLeft(idle, new Date(start.getTime() + 90_000)), 0);
});

Deno.test("winner: more correct, then fewer mistakes, then clearly faster", () => {
  const score = (correct: number, wrong: number, elapsed: number) => ({ correct, wrong, answered: correct + wrong, elapsed_ms: elapsed });
  assertEquals(compareScores(score(7, 3, 59_000), score(6, 0, 10_000)), "a");
  assertEquals(compareScores(score(6, 4, 30_000), score(6, 1, 50_000)), "b");
  assertEquals(compareScores(score(6, 1, 30_000), score(6, 1, 40_000)), "a");
  assertEquals(compareScores(score(6, 1, 30_000), score(6, 1, 30_800)), "draw");
});

const player = (user: string, role: "creator" | "opponent", answers: Array<{ correct: boolean; ms: number }>, started = true): DuelPlayerRecord => ({
  user_id: user,
  role,
  started_at: started ? "2026-10-26T10:00:00.000Z" : null,
  deadline_at: started ? "2026-10-26T10:01:00.000Z" : null,
  finished_at: started && answers.length === 10 ? "2026-10-26T10:00:40.000Z" : null,
  answers: answers.map((answer, q) => ({ q, choice: 0, correct: answer.correct, ms: answer.ms })),
});
const run = (correct: number, ms = 40_000) => Array.from({ length: 10 }, (_, index) => ({ correct: index < correct, ms: Math.round(((index + 1) / 10) * ms) }));
const duel = (status: DuelRecord["status"] = "active"): DuelRecord => ({
  status,
  invite_expires_at: "2026-10-27T10:00:00.000Z",
  play_expires_at: "2026-10-28T10:00:00.000Z",
  creator_id: "c",
  opponent_id: "o",
});

Deno.test("a duel finishes when both have played, with XP for each", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  const settled = settleDuel(duel(), [player("c", "creator", run(8)), player("o", "opponent", run(5))], now);
  assertEquals(settled.status, "finished");
  assertEquals(settled.winner_id, "c");
  assertEquals(settled.players.map((entry) => [entry.outcome, entry.xp]), [["win", 10], ["loss", 5]]);

  const draw = settleDuel(duel(), [player("c", "creator", run(6)), player("o", "opponent", run(6))], now);
  assertEquals(draw.winner_id, null);
  assertEquals(draw.players.map((entry) => entry.xp), [7, 7]);
  assertEquals(duelXp("forfeit"), 0);
});

Deno.test("a duel waits for the second player until the play window closes", () => {
  const players = [player("c", "creator", run(8)), player("o", "opponent", [], false)];
  assertEquals(settleDuel(duel(), players, new Date("2026-10-27T12:00:00Z")).status, "active");
  const closed = settleDuel(duel(), players, new Date("2026-10-28T12:00:00Z"));
  assertEquals(closed.status, "finished");
  // A walkover earns the played XP only, so an unplayed second account cannot farm wins.
  assertEquals(closed.players.map((entry) => [entry.outcome, entry.xp]), [["walkover", 5], ["forfeit", 0]]);
  const nobody = settleDuel(duel(), [player("c", "creator", [], false), player("o", "opponent", [], false)], new Date("2026-10-28T12:00:00Z"));
  assertEquals(nobody.status, "expired");
  assertEquals(settleDuel(duel("open"), [player("c", "creator", [], false)], new Date("2026-10-27T11:00:00Z")).status, "expired");
});

Deno.test("duel XP is capped per learner day", () => {
  const capped = cappedDuelXp([
    { date: "2026-10-26", xp: 10 },
    { date: "2026-10-26", xp: 10 },
    { date: "2026-10-26", xp: 10 },
    { date: "2026-10-27", xp: 5 },
    { date: "2026-10-27", xp: -3 },
  ]);
  assertEquals(capped.get("2026-10-26"), DUEL_XP_DAILY_CAP);
  assertEquals(capped.get("2026-10-27"), 5);
});

Deno.test("other players see a first name only", () => {
  assertEquals(duelFirstName({ first: "  Aziza ", full: "Aziza Karimova" }), "Aziza");
  assertEquals(duelFirstName({ full: "Bobur Aliyev" }), "Bobur");
  assertEquals(duelFirstName({ full: "bobur@example.com" }), "");
  assertEquals(duelFirstName({ first: "user12345" }), "");
  assertEquals(duelFirstName({}), "");
});

Deno.test("the view never leaks the answer key or the opponent's score early", () => {
  const built = questions();
  const now = new Date("2026-10-26T10:00:10Z");
  const me = { ...player("c", "creator", []), finished_at: null };
  const them = player("o", "opponent", run(9));
  const view = buildDuelView({ code: "ABCDEFGHJK", duel: duel(), questions: built, me, them, opponentName: "Aziza", now });
  assertEquals(view.question?.index, 0);
  assertEquals(Object.keys(view.question!).sort(), ["index", "options", "prompt", "total"]);
  assertEquals(view.opponent?.correct, null);
  assertEquals(view.review, null);
  assertEquals(view.me.seconds_left, 50);
  assert(!JSON.stringify(view).includes("correct_index"));

  const finished = buildDuelView({
    code: "ABCDEFGHJK",
    duel: { ...duel("finished") },
    questions: built,
    me: { ...player("c", "creator", run(7)), outcome: "loss", xp: 5 },
    them: { ...them, outcome: "win" },
    opponentName: "Aziza",
    now,
  });
  assertEquals(finished.question, null);
  assertEquals(finished.opponent?.correct, 9);
  assertEquals(finished.review?.length, 10);
  assertEquals(finished.can_rematch, true);
  assertNotEquals(finished.review?.[0]?.correct_index, undefined);
});
