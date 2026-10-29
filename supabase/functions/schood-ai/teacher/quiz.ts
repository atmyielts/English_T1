import { quizQuestions } from '../../../../packages/ai-core/src/materials/mod.ts';
import { integer, oneOf, optionalText, record, text, uuid } from '../input.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { teacherDeps } from './deps.ts';
import { approvedPage } from './library.ts';
import { recordListingUse } from './market.ts';
import type { QuizAnswer, QuizPlayer, QuizSession } from './store.ts';

// T10 Live Quiz: any approved material with choice questions becomes a class game.
// The questions are a snapshot taken when the game opens, so playing makes no AI
// call. Students join on their phones with a six-digit code and a nickname; the
// teacher's screen (focus mode) and the phones poll for state (Supabase Realtime is
// not used by this project). One answer per player and question, scored by speed;
// results stay with the game and its class.

const MAX_PLAYERS = 200;
const GRACE_MS = 2_000;
const NICKNAME = /^[\p{L}\p{N}][\p{L}\p{N} ._'-]{0,23}$/u;

const encoder = new TextEncoder();
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
const randomToken = () => [...crypto.getRandomValues(new Uint8Array(24))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const randomCode = () => String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));

/** Points for a correct answer: 1,000 for an instant answer, falling to 500 at the buzzer. */
export function quizPoints(correct: boolean, elapsedMs: number, seconds: number): number {
  if (!correct) return 0;
  const share = Math.min(1, Math.max(0, elapsedMs / (seconds * 1000)));
  return Math.round(1000 - 500 * share);
}

const remainingMs = (session: QuizSession, now: Date) => session.status === 'question' && session.questionStartedAt ? Math.max(0, Date.parse(session.questionStartedAt) + session.secondsPerQuestion * 1000 - now.getTime()) : 0;

/** Time is up (with a little grace for slow phones): the question is revealed for everyone. */
async function autoReveal(ctx: RequestContext, session: QuizSession): Promise<QuizSession> {
  if (session.status !== 'question' || !session.questionStartedAt) return session;
  if (ctx.now().getTime() < Date.parse(session.questionStartedAt) + session.secondsPerQuestion * 1000 + GRACE_MS) return session;
  const { store } = await teacherDeps();
  return (await store.updateQuizSession(session.id, { status: 'reveal' }, ['question'])) ?? (await store.quizSession(session.id)) ?? session;
}

const leaderboard = (players: QuizPlayer[], limit: number) => players.slice(0, limit).map((player, index) => ({ rank: index + 1, nickname: player.nickname, score: player.score, correct: player.correct }));

async function hostView(ctx: RequestContext, session: QuizSession) {
  const { store } = await teacherDeps();
  const [players, answers] = await Promise.all([store.quizPlayers(session.id), session.currentIndex >= 0 ? store.quizAnswers(session.id, session.currentIndex) : Promise.resolve([] as QuizAnswer[])]);
  const question = session.questions[session.currentIndex] ?? null;
  const counts: Record<string, number> = {};
  for (const answer of answers) counts[answer.choice] = (counts[answer.choice] ?? 0) + 1;
  return {
    id: session.id, title: session.title, code: session.code, status: session.status, index: session.currentIndex, total: session.questions.length,
    seconds: session.secondsPerQuestion, remaining_ms: remainingMs(session, ctx.now()), class_label: session.classLabel, group: session.group,
    question: question ? { prompt: question.prompt, options: question.options, context: question.context ?? null, ...(session.status !== 'question' ? { answer: question.answer, explanation: question.explanation ?? null } : {}) } : null,
    answered: answers.length, counts: session.status === 'question' ? null : counts,
    players: players.length, leaderboard: leaderboard(players, 10), created_at: session.createdAt, finished_at: session.finishedAt,
  };
}

async function hostSession(ctx: RequestContext, id: unknown): Promise<QuizSession> {
  const access = await ctx.workspace();
  const { store } = await teacherDeps();
  const session = await store.quizSession(uuid(id, 'id'));
  if (!session || session.workspaceId !== access.workspace.id || session.hostId !== ctx.user.id) throw new SchoodAIError('not_found', 'Game not found.', 404);
  return session;
}

/** POST teacher/quiz: open a game from an approved material. No AI call. */
export async function createQuiz(ctx: RequestContext) {
  const body = record(await ctx.body());
  await ctx.requireFeature('T10');
  const { page, access, material } = await approvedPage(ctx, body.page_id);
  const questions = quizQuestions(material).slice(0, 60);
  if (!questions.length) throw new SchoodAIError('not_playable', 'This material has no choice questions to play. Make a Live Quiz pack instead.', 409);
  const seconds = body.seconds === undefined ? 20 : integer(body.seconds, 'seconds', 5, 120);
  const classLabel = optionalText(body.class_label, 'class_label', { max: 120 });
  const academy = body.academy && typeof body.academy === 'object' ? record(body.academy, 'academy') : null;
  const group = academy ? { academy_id: uuid(academy.academy_id, 'academy.academy_id'), classroom_id: text(academy.classroom_id, 'academy.classroom_id', { max: 64 }), classroom_name: text(academy.classroom_name ?? 'Group', 'academy.classroom_name', { max: 200 }) } : null;
  const { store } = await teacherDeps();
  let session: QuizSession | null = null;
  for (let attempt = 0; attempt < 6 && !session; attempt++) {
    session = await store.createQuizSession({
      workspaceId: access.workspace.id, hostId: ctx.user.id, pageId: page.id, title: material.title.slice(0, 200), code: randomCode(), questions,
      secondsPerQuestion: seconds, classLabel: classLabel ?? group?.classroom_name ?? null, group,
    });
  }
  if (!session) throw new SchoodAIError('code_unavailable', 'Could not open a game right now. Try again.', 503);
  await recordListingUse(ctx, page, 'live_quiz');
  await ctx.audit('quiz.opened', { questions: questions.length }, { type: 'quiz', id: session.id });
  return { quiz: await hostView(ctx, session) };
}

/** GET teacher/quiz?id=: the teacher's screen. */
export async function getQuiz(ctx: RequestContext) {
  const session = await autoReveal(ctx, await hostSession(ctx, ctx.query.get('id')));
  return { quiz: await hostView(ctx, session) };
}

/** POST teacher/quiz-control: start, reveal, next, finish, remove a player. */
export async function controlQuiz(ctx: RequestContext) {
  const body = record(await ctx.body());
  const session = await hostSession(ctx, body.id);
  const command = oneOf(body.command, 'command', ['start', 'reveal', 'next', 'finish', 'remove_player'] as const);
  const { store } = await teacherDeps();
  const now = ctx.now().toISOString();
  let next: QuizSession | null = null;
  switch (command) {
    case 'start': next = await store.updateQuizSession(session.id, { status: 'question', currentIndex: 0, questionStartedAt: now }, ['lobby']); break;
    case 'reveal': next = await store.updateQuizSession(session.id, { status: 'reveal' }, ['question']); break;
    case 'next': {
      const last = session.currentIndex + 1 >= session.questions.length;
      next = last
        ? await store.updateQuizSession(session.id, { status: 'finished', finishedAt: now }, ['question', 'reveal'])
        : await store.updateQuizSession(session.id, { status: 'question', currentIndex: session.currentIndex + 1, questionStartedAt: now }, ['question', 'reveal']);
      break;
    }
    case 'finish': next = await store.updateQuizSession(session.id, { status: 'finished', finishedAt: now }, ['lobby', 'question', 'reveal']); break;
    case 'remove_player': await store.removeQuizPlayer(session.id, uuid(body.player_id, 'player_id')); break;
  }
  if (command === 'finish' || (command === 'next' && next?.status === 'finished')) await ctx.audit('quiz.finished', { players: (await store.quizPlayers(session.id)).length }, { type: 'quiz', id: session.id });
  // A second click or another tab moved first: show where the game is now.
  return { quiz: await hostView(ctx, next ?? (await store.quizSession(session.id))!) };
}

/** GET teacher/quiz-sessions: the teacher's games, newest first (results stay with the class). */
export async function listQuizzes(ctx: RequestContext) {
  const access = await ctx.workspace();
  const { store } = await teacherDeps();
  const sessions = await store.quizSessions(access.workspace.id, ctx.user.id, 50);
  return { quizzes: await Promise.all(sessions.map(async (session) => ({ id: session.id, title: session.title, code: session.status === 'finished' ? null : session.code, status: session.status, class_label: session.classLabel, questions: session.questions.length, players: (await store.quizPlayers(session.id)).length, created_at: session.createdAt, finished_at: session.finishedAt }))) };
}

/** GET teacher/quiz-results?id=: every player and every question. */
export async function quizResults(ctx: RequestContext) {
  const session = await hostSession(ctx, ctx.query.get('id'));
  const { store } = await teacherDeps();
  const [players, answers] = await Promise.all([store.quizPlayers(session.id), store.quizAnswers(session.id)]);
  const byPlayer = new Map<string, QuizAnswer[]>();
  for (const answer of answers) byPlayer.set(answer.playerId, [...(byPlayer.get(answer.playerId) ?? []), answer]);
  return {
    quiz: { id: session.id, title: session.title, status: session.status, class_label: session.classLabel, group: session.group, created_at: session.createdAt, finished_at: session.finishedAt },
    players: players.map((player, index) => ({ id: player.id, rank: index + 1, nickname: player.nickname, signed_in: !!player.userId, score: player.score, correct: player.correct, answered: player.answered, answers: (byPlayer.get(player.id) ?? []).map((answer) => ({ index: answer.index, choice: answer.choice, correct: answer.correct, points: answer.points })) })),
    questions: session.questions.map((question, index) => {
      const mine = answers.filter((answer) => answer.index === index);
      return { index, prompt: question.prompt, answer: question.answer, options: question.options, answered: mine.length, correct: mine.filter((answer) => answer.correct).length };
    }),
  };
}

// --- Players -------------------------------------------------------------------------------

async function openSession(code: unknown): Promise<QuizSession> {
  const value = typeof code === 'string' ? code.replace(/\s+/g, '') : '';
  if (!/^[0-9]{6}$/.test(value)) throw new SchoodAIError('quiz_not_found', 'Check the code and try again.', 404);
  const { store } = await teacherDeps();
  const session = await store.quizSessionByCode(value);
  if (!session) throw new SchoodAIError('quiz_not_found', 'Check the code and try again.', 404);
  return session;
}
async function playerFor(ctx: RequestContext, session: QuizSession, tokenValue: unknown): Promise<QuizPlayer> {
  const { store } = await teacherDeps();
  const player = typeof tokenValue === 'string' && /^[0-9a-f]{48}$/.test(tokenValue) ? await store.quizPlayer(session.id, await sha256(tokenValue)) : await store.quizPlayerByUser(session.id, ctx.user.id);
  if (!player) throw new SchoodAIError('not_joined', 'Join the game first.', 403);
  return player;
}

/** POST teacher/quiz-join: a student joins with the code and a nickname. No plan needed: no AI is used. */
export async function joinQuiz(ctx: RequestContext) {
  const body = record(await ctx.body());
  const session = await openSession(body.code);
  if (session.status === 'finished') throw new SchoodAIError('quiz_finished', 'This game has ended.', 409);
  const { store } = await teacherDeps();
  const existing = await store.quizPlayerByUser(session.id, ctx.user.id);
  if (existing) return { joined: { session_id: session.id, nickname: existing.nickname, token: null } };
  const nickname = text(body.nickname, 'nickname', { max: 24 }).replace(/\s+/g, ' ');
  if (!NICKNAME.test(nickname)) throw new SchoodAIError('invalid_nickname', 'Use letters and numbers for your nickname.', 400, { field: 'nickname' });
  if ((await store.quizPlayers(session.id)).length >= MAX_PLAYERS) throw new SchoodAIError('quiz_full', 'This game is full.', 409);
  const secret = randomToken();
  const player = await store.addQuizPlayer({ sessionId: session.id, userId: ctx.user.id, nickname, tokenHash: await sha256(secret) });
  if (!player) throw new SchoodAIError('nickname_taken', 'Someone already uses this nickname here. Pick another.', 409, { field: 'nickname' });
  return { joined: { session_id: session.id, nickname: player.nickname, token: secret } };
}

/** POST teacher/quiz-play: what a phone shows now. */
export async function playQuiz(ctx: RequestContext) {
  const body = record(await ctx.body());
  // By id, so a finished game still shows its final board after its code is free again.
  let session = await sessionById(body.session_id);
  const player = await playerFor(ctx, session, body.token);
  session = await autoReveal(ctx, session);
  const { store } = await teacherDeps();
  const players = await store.quizPlayers(session.id);
  const rank = players.findIndex((entry) => entry.id === player.id) + 1;
  const question = session.questions[session.currentIndex] ?? null;
  const mine = session.currentIndex >= 0 ? (await store.quizAnswers(session.id, session.currentIndex)).find((answer) => answer.playerId === player.id) ?? null : null;
  const me = players.find((entry) => entry.id === player.id) ?? player;
  return {
    play: {
      title: session.title, status: session.status, index: session.currentIndex, total: session.questions.length, remaining_ms: remainingMs(session, ctx.now()), seconds: session.secondsPerQuestion,
      question: question && session.status !== 'lobby' ? { prompt: question.prompt, options: question.options, ...(session.status !== 'question' ? { answer: question.answer, explanation: question.explanation ?? null } : {}) } : null,
      my_answer: mine ? { choice: mine.choice, ...(session.status !== 'question' ? { correct: mine.correct, points: mine.points } : {}) } : null,
      me: { nickname: me.nickname, score: me.score, correct: me.correct, rank },
      players: players.length, leaderboard: session.status === 'question' ? [] : leaderboard(players, 5),
    },
  };
}
async function sessionById(id: unknown): Promise<QuizSession> {
  const { store } = await teacherDeps();
  const session = await store.quizSession(uuid(id, 'session_id'));
  if (!session) throw new SchoodAIError('quiz_not_found', 'This game was not found.', 404);
  return session;
}

/** POST teacher/quiz-answer: one tap per question; points for speed when right. */
export async function answerQuiz(ctx: RequestContext) {
  const body = record(await ctx.body());
  const session = await sessionById(body.session_id);
  const player = await playerFor(ctx, session, body.token);
  const index = integer(body.index, 'index', 0, 99);
  if (session.status !== 'question' || session.currentIndex !== index || !session.questionStartedAt) throw new SchoodAIError('question_closed', 'This question is closed.', 409);
  const elapsed = ctx.now().getTime() - Date.parse(session.questionStartedAt);
  if (elapsed > session.secondsPerQuestion * 1000 + GRACE_MS) throw new SchoodAIError('question_closed', 'Time is up for this question.', 409);
  const question = session.questions[index];
  const choice = text(body.choice, 'choice', { max: 8 });
  if (!question.options.some((option) => option.id === choice)) throw new SchoodAIError('invalid_request', 'Pick one of the options.', 400, { field: 'choice' });
  const correct = choice === question.answer;
  const { store } = await teacherDeps();
  const accepted = await store.answerQuiz({ sessionId: session.id, playerId: player.id, index, choice, correct, points: quizPoints(correct, Math.max(0, elapsed), session.secondsPerQuestion) });
  if (!accepted) throw new SchoodAIError('already_answered', 'You already answered this one.', 409);
  // A checked answer is a learning event for the student; the score is the teacher's game, not XP.
  ctx.events.emit({ kind: correct ? 'check_passed' : 'check_failed', area: 'teacher', feature: 'T10', ref: session.id.slice(0, 200), outcome: correct ? 'passed' : 'failed' });
  return { answered: { index, choice } };
}
