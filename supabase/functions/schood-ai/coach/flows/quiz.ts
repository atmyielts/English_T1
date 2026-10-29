import { reviewCard, type SrsState } from '../../../_shared/english-srs.ts';
import { answerMatches, countWords, escapeHtml, levelLabel, pick, type DeckCard, type QuizQuestion, type QuizSet } from '../../../../../packages/coach-packs/src/mod.ts';
import type { Bot, FlowState } from '../bot.ts';
import { keyOf } from '../ai.ts';
import { emit, finishSession, learnAccuracy } from '../results.ts';
import { toBase64 } from './render.ts';

// Timed Reading and Listening mini-sets with checked keys, explanations quoting the
// passage, and the strategy for the question types that cost marks; and
// vocabulary or phrase cards reviewed as Telegram quiz polls on a spaced-repetition
// schedule (FSRS, supabase/functions/_shared/english-srs.ts). No AI is needed for
// either, except text-to-speech for listening audio once per set (then cached).

type Quiz = Extract<FlowState, { flow: 'quiz' }>;
type DeckFlow = Extract<FlowState, { flow: 'deck' }>;
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const hash = (text: string) => { let h = 2166136261; for (const char of text) { h ^= char.codePointAt(0)!; h = Math.imul(h, 16777619); } return h >>> 0; };

export const quizSets = (bot: Bot, mode?: string): QuizSet[] => bot.pack.ofKind('quiz_set').filter((set) => !mode || set.mode === mode);

async function pickSet(bot: Bot, mode: string): Promise<QuizSet | undefined> {
  const recent = await bot.store.sessions(bot.enrollment.userId, bot.pack.manifest.id, { limit: 60, kind: 'quiz_set' });
  const last = new Map<string, number>();
  for (const session of recent) if (session.activityId && !last.has(session.activityId)) last.set(session.activityId, Date.parse(session.startedAt));
  const level = await bot.level(mode);
  const sets = quizSets(bot, mode);
  const suited = sets.filter((set) => level === null || (level >= set.levels[0] - 0.5 && level <= set.levels[1] + 0.5));
  return [...(suited.length ? suited : sets)].sort((a, b) => (last.get(a.id) ?? 0) - (last.get(b.id) ?? 0) || hash(`${bot.enrollment.userId}:${a.id}`) - hash(`${bot.enrollment.userId}:${b.id}`))[0];
}

/** The script as it is read aloud: speaker labels ("Receptionist:") are dropped. */
export const spokenScript = (script: string) => script.split('\n').map((line) => line.replace(/^\s*[A-Z][A-Za-z .'-]{0,30}:\s+/, '').trim()).filter(Boolean).join('\n');

export async function startQuiz(bot: Bot, mode: 'reading' | 'listening' | 'practice', activityId?: string) {
  const set = (activityId ? quizSets(bot).find((entry) => entry.id === activityId) : undefined) ?? await pickSet(bot, mode);
  if (!set) { bot.menu(); return; }
  const session = await bot.store.createSession({ enrollmentId: bot.enrollment.id, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, packVersion: bot.pack.manifest.version, kind: 'quiz_set', activityId: set.id, mode: set.mode, rubric: null, source: 'telegram' });
  bot.set({ flow: 'quiz', sessionId: session.id, activityId: set.id, index: 0, answers: [], startedAt: bot.ctx.now().toISOString() });
  const minutes = Math.round(set.timeLimitSeconds / 60);
  if (set.mode === 'listening' && set.audio) {
    bot.text(bot.t('quiz.listening', { title: pick(set.title, bot.locale), count: set.questions.length, minutes }));
    await listeningAudio(bot, set);
  } else {
    bot.text(bot.t('quiz.reading', { title: pick(set.title, bot.locale), count: set.questions.length, minutes }));
    if (set.passage) bot.text(`<b>${escapeHtml(set.passage.title)}</b>\n\n${escapeHtml(set.passage.text)}`);
  }
  askQuestion(bot, set);
}

async function listeningAudio(bot: Bot, set: QuizSet) {
  const cacheKey = `l:${set.id}`.slice(0, 120);
  const cached = await bot.store.media(bot.pack.manifest.id, cacheKey);
  if (cached) { bot.push({ kind: 'voice', fileId: cached }); return; }
  try {
    const audio = await bot.ctx.ai.speak({ key: keyOf(bot.pack, 'voice'), text: spokenScript(set.audio!.script).slice(0, 4000), voice: set.audio!.voice, format: 'opus', reference: bot.reference('listen') });
    bot.push({ kind: 'voice', audio: toBase64(audio.audio), mime: audio.mime, cacheKey });
  } catch {
    // No speech provider yet: the Mini App reads the script aloud with the browser's own voice.
    bot.text(bot.t('quiz.listen_in_app'), [[bot.app(bot.p('quiz.listen'), `/listen/${set.id}`)]]);
  }
}

function questionText(bot: Bot, set: QuizSet, question: QuizQuestion, index: number) {
  const type = bot.pack.questionTypes.find((entry) => entry.id === question.type);
  return bot.t('quiz.question', { n: index + 1, total: set.questions.length, type: type ? pick(type.name, bot.locale) : question.type, prompt: question.prompt });
}

function askQuestion(bot: Bot, set: QuizSet) {
  const state = bot.state.current as Quiz;
  const question = set.questions[state.index];
  if (typeof question.answer === 'number' && question.options) {
    const long = question.options.some((option) => option.length > 30);
    const body = long ? `\n${question.options.map((option, i) => `<b>${LETTERS[i]}</b>. ${escapeHtml(option)}`).join('\n')}` : '';
    const buttons = long ? [question.options.map((_, i) => ({ text: LETTERS[i], data: `a:${state.index}:${i}` }))] : question.options.map((option, i) => [{ text: option, data: `a:${state.index}:${i}` }]);
    bot.text(`${questionText(bot, set, question, state.index)}${body}`, buttons);
    return;
  }
  const hint = question.hints?.length ? [[{ text: bot.p('quiz.hint'), data: `qh:${state.index}:0` }]] : undefined;
  bot.text(`${questionText(bot, set, question, state.index)}\n\n${bot.t('quiz.type_answer', { limit: question.wordLimit ?? 3 })}`, hint);
}

/** Practice sets (maths): hints one at a time before the answer. */
export function quizHint(bot: Bot, index: number, n: number) {
  const state = bot.state.current;
  if (state.flow !== 'quiz' || state.index !== index) return;
  const set = quizSets(bot).find((entry) => entry.id === state.activityId);
  const hints = set?.questions[index]?.hints ?? [];
  if (!hints[n]) return;
  bot.text(`💡 ${n + 1}/${hints.length}: ${escapeHtml(pick(hints[n], bot.locale))}`, n + 1 < hints.length ? [[{ text: bot.p('quiz.hint'), data: `qh:${index}:${n + 1}` }]] : undefined);
}

export async function onQuizAnswer(bot: Bot, input: { index?: number; choice?: number; text?: string }) {
  const state = bot.state.current as Quiz;
  const set = quizSets(bot).find((entry) => entry.id === state.activityId);
  if (!set) { bot.set({ flow: 'idle' }); bot.menu(); return; }
  if (input.index !== undefined && input.index !== state.index) return; // a stale tap
  const question = set.questions[state.index];
  if (input.text !== undefined) {
    if (typeof question.answer === 'number') { askQuestion(bot, set); return; }
    if (question.wordLimit && countWords(input.text) > question.wordLimit) { bot.text(bot.t('quiz.over_limit', { limit: question.wordLimit })); return; }
    state.answers.push(input.text.trim().slice(0, 200));
  } else if (input.choice !== undefined) {
    if (typeof question.answer !== 'number') return;
    bot.clearButtons = true;
    state.answers.push(input.choice);
  } else return;
  state.index += 1;
  if (state.index < set.questions.length) { askQuestion(bot, set); return; }
  await finishQuiz(bot, set);
}

export function isRight(question: QuizQuestion, given: number | string | null): boolean {
  if (given === null) return false;
  if (typeof question.answer === 'number') return given === question.answer;
  if (Array.isArray(question.answer)) return typeof given === 'string' && answerMatches(given, question.answer);
  const value = Number(String(given).replace(',', '.'));
  return Number.isFinite(value) && Math.abs(value - question.answer.numeric) <= (question.answer.tolerance ?? 0);
}
const answerText = (question: QuizQuestion) => (typeof question.answer === 'number' ? `${LETTERS[question.answer]}. ${question.options?.[question.answer] ?? ''}` : Array.isArray(question.answer) ? question.answer[0] : String(question.answer.numeric));
const givenText = (question: QuizQuestion, given: number | string | null) => (given === null ? '—' : typeof given === 'number' ? `${LETTERS[given]}. ${question.options?.[given] ?? ''}` : given);

async function finishQuiz(bot: Bot, set: QuizSet) {
  const state = bot.state.current as Quiz;
  bot.set({ flow: 'idle' });
  const seconds = Math.round((bot.ctx.now().getTime() - Date.parse(state.startedAt)) / 1000);
  const results = set.questions.map((question, index) => ({ question, given: state.answers[index] ?? null, right: isRight(question, state.answers[index] ?? null) }));
  const correct = results.filter((result) => result.right).length;
  const types: Record<string, [number, number]> = {};
  for (const result of results) { const entry = types[result.question.type] ?? [0, 0]; entry[1] += 1; if (result.right) entry[0] += 1; types[result.question.type] = entry; }
  const session = (await bot.store.session(state.sessionId))!;
  const minutes = Math.max(1, Math.round(seconds / 60));
  await finishSession(bot, session, {
    overall: null, minutes: Math.min(minutes, Math.round(set.timeLimitSeconds / 60) + 5), event: 'drill_finished', node: set.node, score: Math.round((correct / set.questions.length) * 100),
    summary: { quiz: { mode: set.mode, correct, total: set.questions.length }, types, seconds, answers: results.map((result) => ({ id: result.question.id, given: result.given, right: result.right })) },
  });
  // Each question type moves its own skill node.
  for (const [type, [right, total]] of Object.entries(types)) {
    const node = bot.pack.questionTypes.find((entry) => entry.id === type)?.node;
    if (node) await learnAccuracy(bot, node, right / total);
  }
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const lines = [bot.t('quiz.result', { correct, total: set.questions.length, time }, { over: seconds > set.timeLimitSeconds ? bot.t('quiz.over_time') : '' })];
  const wrong = results.map((result, index) => ({ ...result, index })).filter((result) => !result.right);
  if (!wrong.length) lines.push(bot.t('quiz.all_right'));
  for (const result of wrong.slice(0, 5)) {
    lines.push(bot.t('quiz.wrong', { n: result.index + 1, given: givenText(result.question, result.given), answer: answerText(result.question), explanation: pick(result.question.explanation, bot.locale), evidence: result.question.evidence ?? '' }).replace(/\n📌 “”|\n📌 «»/, ''));
  }
  const weakest = Object.entries(types).filter(([, [right, total]]) => right < total).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1])[0];
  const type = weakest ? bot.pack.questionTypes.find((entry) => entry.id === weakest[0]) : undefined;
  if (type) lines.push(bot.t('quiz.strategy', { type: pick(type.name, bot.locale), strategy: pick(type.strategy, bot.locale) }));
  const estimate = await quizEstimate(bot, set.mode);
  if (estimate) lines.push(bot.t('quiz.estimate', { mode: bot.p(`mode.${set.mode}` as 'mode.reading'), level: estimate.level, count: estimate.questions }));
  bot.text(lines.join('\n\n'), bot.nav([{ text: `${set.mode === 'listening' ? '🎧' : '📖'} ${bot.p('btn.next')}`, data: `m:${set.mode}` }]));
}

/** The level estimate from recent sets of one mode: at least 18 questions, the pack's own accuracy table. */
export async function quizEstimate(bot: Bot, mode: string): Promise<{ level: string; questions: number; value: number } | null> {
  const table = bot.pack.plan.estimates?.[mode as 'reading' | 'listening' | 'practice'];
  if (!table?.length) return null;
  const sessions = (await bot.store.sessions(bot.enrollment.userId, bot.pack.manifest.id, { limit: 6, kind: 'quiz_set', status: 'finished' }))
    .filter((session) => (session.summary.quiz as { mode?: string } | undefined)?.mode === mode);
  let correct = 0, total = 0;
  for (const session of sessions) { const quiz = session.summary.quiz as { correct: number; total: number }; correct += quiz.correct; total += quiz.total; }
  if (total < 18) return null;
  const accuracy = correct / total;
  const value = [...table].reverse().find(([threshold]) => accuracy >= threshold - 1e-9)?.[1] ?? table[0][1];
  return { level: levelLabel(bot.pack.manifest.scale, value), questions: total, value };
}

// --- cards ------------------------------------------------------------------------------------------------

export async function startDeck(bot: Bot, cardType: 'word' | 'phrase') {
  const now = bot.ctx.now().toISOString();
  const decks = bot.pack.ofKind('deck').filter((deck) => deck.cardType === cardType);
  if (!decks.length) { bot.menu(); return; }
  const due = (await bot.store.dueCards(bot.enrollment.userId, bot.pack.manifest.id, now, 40)).filter((card) => bot.pack.cardById.get(card.cardId)?.deck.cardType === cardType).slice(0, 10);
  const known = new Set((await bot.store.cards(bot.enrollment.userId, bot.pack.manifest.id)).map((card) => card.cardId));
  const level = await bot.level();
  // New cards from the deck with the fewest cards learnt, at the learner's level.
  const ordered = [...decks].sort((a, b) => a.cards.filter((card) => known.has(card.id)).length / a.cards.length - b.cards.filter((card) => known.has(card.id)).length / b.cards.length
    || Number(level !== null && !(level >= b.levels[0] - 0.5 && level <= b.levels[1] + 0.5)) - Number(level !== null && !(level >= a.levels[0] - 0.5 && level <= a.levels[1] + 0.5)));
  const fresh = ordered.flatMap((deck) => deck.cards.filter((card) => !known.has(card.id)).map((card) => card.id)).slice(0, Math.min(6, Math.max(0, 10 - due.length)));
  const queue = [...due.map((card) => card.cardId), ...fresh];
  if (!queue.length) { bot.text(bot.t('deck.done', { correct: 0, total: 0, next: bot.p('deck.next_none') }), bot.nav()); return; }
  const session = await bot.store.createSession({ enrollmentId: bot.enrollment.id, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, packVersion: bot.pack.manifest.version, kind: 'deck', activityId: bot.pack.cardById.get(queue[0])!.deck.id, mode: cardType, rubric: null, source: 'telegram' });
  bot.set({ flow: 'deck', sessionId: session.id, queue, index: 0, correct: 0, fresh: fresh.length });
  bot.text(bot.t('deck.intro', { count: queue.length, due: due.length, fresh: fresh.length }));
  sendPoll(bot);
}

function cardPoll(bot: Bot, card: DeckCard, cardType: 'word' | 'phrase', seed: string) {
  const right = cardType === 'word' ? card.meaning : card.front;
  const options = [right, ...card.distractors.slice(0, 3)];
  const order = options.map((option, index) => ({ option, index, key: hash(`${seed}:${option}`) })).sort((a, b) => a.key - b.key);
  const question = cardType === 'word' ? bot.p('deck.question_word', { term: card.front }) : bot.p('deck.question_phrase', { situation: (card.situation ?? '').replace(/^when\s+/i, '') });
  const translation = card.translations[bot.locale] ?? '';
  const explanation = `${cardType === 'word' ? `${card.front}: ` : ''}${translation ? `${translation}. ` : ''}${card.example}`.slice(0, 200);
  return { question: question.slice(0, 300), options: order.map((entry) => entry.option.slice(0, 100)), correct: order.findIndex((entry) => entry.index === 0), explanation };
}

function sendPoll(bot: Bot) {
  const state = bot.state.current as DeckFlow;
  const entry = bot.pack.cardById.get(state.queue[state.index]);
  if (!entry) return;
  const poll = cardPoll(bot, entry.card, entry.deck.cardType, `${state.sessionId}:${state.index}`);
  bot.push({ kind: 'poll', ...poll, ref: `${state.sessionId}:${state.index}` });
}

/** The worker sent a poll; remember which card it asks so the answer can be graded. */
export async function pollSent(bot: Bot, ref: string, pollId: string) {
  const [sessionId, index] = ref.split(':');
  const session = await bot.store.session(sessionId);
  if (!session || session.userId !== bot.enrollment.userId || session.kind !== 'deck') return;
  const state = bot.state.current;
  const cardId = state.flow === 'deck' && state.sessionId === sessionId ? state.queue[Number(index)] : undefined;
  const entry = cardId ? bot.pack.cardById.get(cardId) : undefined;
  if (!entry) return;
  await bot.store.addPoll({ pollId, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, sessionId, cardId: entry.card.id, correct: cardPoll(bot, entry.card, entry.deck.cardType, ref).correct });
}

export async function onPollAnswer(bot: Bot, pollId: string, chosen: number[]) {
  const poll = await bot.store.answerPoll(pollId, bot.ctx.now().toISOString());
  if (!poll || poll.userId !== bot.enrollment.userId) return;
  const right = chosen.length === 1 && chosen[0] === poll.correct;
  const entry = bot.pack.cardById.get(poll.cardId);
  if (!entry) return;
  const [existing] = await bot.store.cards(bot.enrollment.userId, bot.pack.manifest.id, [poll.cardId]);
  const outcome = reviewCard((existing?.srs as SrsState | undefined) ?? null, right ? 3 : 1, bot.ctx.now());
  await bot.store.saveCard(bot.enrollment.userId, bot.pack.manifest.id, { cardId: poll.cardId, srs: outcome.state as unknown as Record<string, unknown>, dueAt: outcome.due.toISOString(), reps: outcome.state.reps, lapses: outcome.state.lapses });
  await bot.store.addTurn({ sessionId: poll.sessionId, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, role: 'learner', kind: 'card', promptRef: poll.cardId, content: '', inputMode: 'text', clip: null, metrics: { correct: right, next: outcome.due.toISOString() }, timing: {}, keep: false });
  emit(bot, right ? 'check_passed' : 'check_failed', { node: entry.deck.node, minutes: 0, score: right ? 1 : 0, ref: poll.cardId });
  const state = bot.state.current;
  if (state.flow !== 'deck' || state.sessionId !== poll.sessionId) return;
  if (right) state.correct += 1;
  state.index += 1;
  if (state.index < state.queue.length) { sendPoll(bot); return; }
  bot.set({ flow: 'idle' });
  const session = (await bot.store.session(poll.sessionId))!;
  const minutes = Math.max(1, Math.round(state.queue.length / 2));
  await finishSession(bot, session, { overall: null, minutes, event: null, node: entry.deck.node, summary: { cards: state.queue.length, correct: state.correct, fresh: state.fresh } });
  const next = (await bot.store.cards(bot.enrollment.userId, bot.pack.manifest.id)).map((card) => card.dueAt).sort()[0];
  const local = next ? new Date(next) : null;
  bot.text(bot.t('deck.done', { correct: state.correct, total: state.queue.length, next: local ? local.toISOString().slice(0, 10).split('-').reverse().join('.') : bot.p('deck.next_none') }), bot.nav());
}
