import { reviewCard, type SrsState } from '../../../_shared/english-srs.ts';
import {
  answerMatches, cohortPercentile, countWords, escapeHtml, levelLabel, MIN_COHORT, nodeLevel, overallScale, pick, pickByMastery, predict, snap, weeksLeft,
  type DeckCard, type QuizQuestion, type QuizSet,
} from '../../../../../packages/coach-packs/src/mod.ts';
import type { Bot, FlowState } from '../bot.ts';
import { keyOf } from '../ai.ts';
import { emit, finishSession, learnAccuracy } from '../results.ts';
import { goalOf, masteryMap } from '../views.ts';
import { localParts } from '../time.ts';
import { toBase64 } from './render.ts';

// Timed Reading and Listening mini-sets with checked keys, explanations quoting the
// passage, and the strategy for the question types that cost marks; and
// vocabulary or phrase cards reviewed as Telegram quiz polls on a spaced-repetition
// schedule (FSRS, supabase/functions/_shared/english-srs.ts). No AI is needed for
// either, except text-to-speech for listening audio once per set (then cached).
//
// Topic banks (B3 Admission Maths): a set with `draw` deals a few questions per session
// from its bank (never answered first, then the ones answered wrong); a set with `mock`
// is a timed mini-mock dealt from every bank by topic weight, recorded on its keyed
// rubric with the forecast, the projection onto the exam blocks and the anonymous
// percentile; the mistake notebook deals the questions whose latest answer was wrong.
// Each question is `<set id>#<question id>` in the session, so a session can mix banks.

type Quiz = Extract<FlowState, { flow: 'quiz' }>;
type DeckFlow = Extract<FlowState, { flow: 'deck' }>;
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const DAY = 86_400_000;
const hash = (text: string) => { let h = 2166136261; for (const char of text) { h ^= char.codePointAt(0)!; h = Math.imul(h, 16777619); } return h >>> 0; };
/** A small seeded generator (mulberry32), so a session's deal is repeatable. */
const random = (seed: string) => { let a = hash(seed); return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

export const quizSets = (bot: Bot, mode?: string): QuizSet[] => bot.pack.ofKind('quiz_set').filter((set) => !mode || set.mode === mode);
/** Sets for daily practice: not the mini-mocks. */
const practiceSets = (bot: Bot, mode: string) => quizSets(bot, mode).filter((set) => !set.mock);
export const mockSets = (bot: Bot): QuizSet[] => quizSets(bot).filter((set) => !!set.mock);

/** A question and the set it comes from. */
export interface Item { set: QuizSet; question: QuizQuestion; ref: string }
export const refOf = (set: QuizSet, question: QuizQuestion) => `${set.id}#${question.id}`;
export function itemOf(bot: Bot, ref: string): Item | null {
  const at = ref.indexOf('#');
  const set = at > 0 ? bot.pack.byId.get(ref.slice(0, at)) : undefined;
  if (set?.kind !== 'quiz_set') return null;
  const question = set.questions.find((entry) => entry.id === ref.slice(at + 1));
  return question ? { set, question, ref } : null;
}
/** The questions of the session in progress: dealt ones, or the whole set in order. */
function itemsOf(bot: Bot, state: Quiz, set: QuizSet): Item[] {
  if (state.items?.length) return state.items.map((ref) => itemOf(bot, ref)).filter((item): item is Item => !!item);
  return set.questions.map((question) => ({ set, question, ref: refOf(set, question) }));
}

interface Answered { ref: string; right: boolean; at: string }
/** Every checked answer in recent sets, newest first. */
async function answerHistory(bot: Bot, days = 120): Promise<Answered[]> {
  const since = new Date(bot.ctx.now().getTime() - days * DAY).toISOString();
  const sessions = await bot.store.sessions(bot.enrollment.userId, bot.pack.manifest.id, { limit: 300, kind: 'quiz_set', status: 'finished', since });
  const out: Answered[] = [];
  for (const session of sessions) {
    const at = session.finishedAt ?? session.startedAt;
    for (const answer of (session.summary.answers as { id: string; ref?: string; right: boolean }[] | undefined) ?? []) out.push({ ref: answer.ref ?? `${session.activityId}#${answer.id}`, right: !!answer.right, at });
  }
  // Newest first by when each set was finished (stable for answers of the same set).
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** The mistake notebook: questions whose latest answer was wrong, newest first, with how often they were missed. */
export async function openMistakes(bot: Bot): Promise<{ ref: string; at: string; misses: number; item: Item }[]> {
  const latest = new Map<string, Answered>(), misses = new Map<string, number>();
  for (const answer of await answerHistory(bot)) {
    if (!latest.has(answer.ref)) latest.set(answer.ref, answer);
    if (!answer.right) misses.set(answer.ref, (misses.get(answer.ref) ?? 0) + 1);
  }
  const out = [];
  for (const answer of latest.values()) {
    if (answer.right) continue;
    const item = itemOf(bot, answer.ref);
    // A mini-mock never lands its own questions twice: they live in the banks.
    if (item) out.push({ ref: answer.ref, at: answer.at, misses: misses.get(answer.ref) ?? 1, item });
  }
  return out;
}

/** The difficulty to start at: near the learner's level on the topic. */
function targetDifficulty(bot: Bot, level: number | null): number {
  if (level === null) return 2;
  const scale = bot.pack.manifest.scale, share = (level - scale.min) / (scale.max - scale.min || 1);
  return share < 0.45 ? 1 : share < 0.75 ? 2 : 3;
}

/** A bank's questions for one session: never answered first, then missed ones; none answered right this week. */
function deal(set: QuizSet, count: number, history: Answered[], now: Date, seed: string, target: number, forMock = false): string[] {
  const latest = new Map<string, Answered>();
  for (const answer of history) if (!latest.has(answer.ref)) latest.set(answer.ref, answer);
  const week = new Date(now.getTime() - 7 * DAY).toISOString();
  const rank = (ref: string) => {
    const last = latest.get(ref);
    if (!last) return 0;
    // A mock prefers questions not seen lately, right or wrong; practice brings back the misses.
    if (forMock) return last.at >= week ? 3 : 1;
    return !last.right ? 1 : last.at >= week ? 3 : 2;
  };
  const pool = set.questions.map((question) => ({ question, ref: refOf(set, question) }))
    .sort((a, b) => rank(a.ref) - rank(b.ref) || Math.abs((a.question.difficulty ?? 2) - target) - Math.abs((b.question.difficulty ?? 2) - target) || hash(`${seed}:${a.ref}`) - hash(`${seed}:${b.ref}`))
    .slice(0, count);
  // Easier first, as a set builds up.
  return pool.sort((a, b) => (a.question.difficulty ?? 2) - (b.question.difficulty ?? 2) || hash(`${seed}:${a.ref}`) - hash(`${seed}:${b.ref}`)).map((entry) => entry.ref);
}

/** A mini-mock: each question's topic drawn by node weight (the exam blueprint), then a question from that bank. */
function assembleMock(bot: Bot, mock: QuizSet, history: Answered[], seed: string): string[] {
  const nodes = mock.mock?.nodes ?? [];
  const banks = practiceSets(bot, 'practice').filter((set) => set.questions.length && (!nodes.length || nodes.includes(set.node)));
  const perNode = new Map<string, number>();
  for (const bank of banks) perNode.set(bank.node, (perNode.get(bank.node) ?? 0) + 1);
  const weightOf = (bank: QuizSet) => (bot.pack.skillById.get(bank.node)?.weight ?? 1) / (perNode.get(bank.node) ?? 1);
  const taken = new Map<string, number>(), next = random(seed);
  const total = Math.min(mock.mock!.questions, banks.reduce((sum, bank) => sum + bank.questions.length, 0));
  for (let i = 0; i < total; i++) {
    const open = banks.filter((bank) => (taken.get(bank.id) ?? 0) < bank.questions.length);
    // Spread over topics: a bank already used weighs less, like a real paper.
    const weights = open.map((bank) => weightOf(bank) / (1 + 3 * (taken.get(bank.id) ?? 0)));
    let roll = next() * weights.reduce((a, b) => a + b, 0), chosen = open[open.length - 1];
    for (const [index, bank] of open.entries()) { roll -= weights[index]; if (roll <= 0) { chosen = bank; break; } }
    taken.set(chosen.id, (taken.get(chosen.id) ?? 0) + 1);
  }
  const refs = [...taken].flatMap(([id, count]) => deal(bot.pack.byId.get(id) as QuizSet, count, history, bot.ctx.now(), seed, 2, true));
  // Exam order: easier questions first, topics mixed.
  return refs.map((ref) => ({ ref, item: itemOf(bot, ref)! })).sort((a, b) => (a.item.question.difficulty ?? 2) - (b.item.question.difficulty ?? 2) || hash(`${seed}:${a.ref}`) - hash(`${seed}:${b.ref}`)).map((entry) => entry.ref);
}

async function pickSet(bot: Bot, mode: string): Promise<QuizSet | undefined> {
  const recent = await bot.store.sessions(bot.enrollment.userId, bot.pack.manifest.id, { limit: 60, kind: 'quiz_set' });
  const sets = practiceSets(bot, mode);
  if (bot.pack.plan.selection === 'mastery') {
    // The topic graph: the weakest topic worth the most, after its prerequisites.
    const mastery = await masteryMap({ store: bot.store, pack: bot.pack, enrollment: bot.enrollment, now: bot.ctx.now() });
    return pickByMastery(bot.pack, sets, {
      mastery, target: goalOf(bot.pack, bot.enrollment).target, fallback: bot.enrollment.placement?.overall ?? null,
      recent: recent.filter((session) => session.status === 'finished').map((session) => ({ activityId: session.activityId ?? '', at: session.finishedAt ?? session.startedAt })),
      today: bot.local().day, seed: hash(`${bot.enrollment.userId}:${bot.local().day}`),
    }) ?? undefined;
  }
  const last = new Map<string, number>();
  for (const session of recent) if (session.activityId && !last.has(session.activityId)) last.set(session.activityId, Date.parse(session.startedAt));
  const level = await bot.level(mode);
  const suited = sets.filter((set) => level === null || (level >= set.levels[0] - 0.5 && level <= set.levels[1] + 0.5));
  return [...(suited.length ? suited : sets)].sort((a, b) => (last.get(a.id) ?? 0) - (last.get(b.id) ?? 0) || hash(`${bot.enrollment.userId}:${a.id}`) - hash(`${bot.enrollment.userId}:${b.id}`))[0];
}

/** The script as it is read aloud: speaker labels ("Receptionist:") are dropped. */
export const spokenScript = (script: string) => script.split('\n').map((line) => line.replace(/^\s*[A-Z][A-Za-z .'-]{0,30}:\s+/, '').trim()).filter(Boolean).join('\n');

export async function startQuiz(bot: Bot, mode: 'reading' | 'listening' | 'practice', activityId?: string) {
  const set = (activityId ? quizSets(bot).find((entry) => entry.id === activityId) : undefined) ?? await pickSet(bot, mode);
  if (!set) { bot.menu(); return; }
  await runSet(bot, set, null);
}

/** The timed mini-mock (B3): the first mock set, or a named one. */
export async function startMock(bot: Bot, activityId?: string) {
  const set = (activityId ? mockSets(bot).find((entry) => entry.id === activityId) : undefined) ?? mockSets(bot)[0];
  if (!set) { bot.menu(); return; }
  await runSet(bot, set, null);
}

/** The mistake notebook: up to ten questions whose latest answer was wrong. */
export async function startMistakes(bot: Bot) {
  const open = await openMistakes(bot);
  if (!open.length) { bot.text(bot.t('mistakes.empty'), bot.nav()); return; }
  const items = open.slice(0, 10).map((entry) => entry.ref);
  await runSet(bot, open[0].item.set, { items, kind: 'mistakes' });
}

async function runSet(bot: Bot, set: QuizSet, preset: { items: string[]; kind: 'mistakes' } | null) {
  const kind = preset?.kind ?? (set.mock ? 'mock' : undefined);
  const history = set.draw || set.mock ? await answerHistory(bot) : [];
  const session = await bot.store.createSession({
    enrollmentId: bot.enrollment.id, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, packVersion: bot.pack.manifest.version, kind: 'quiz_set', activityId: set.id,
    mode: kind ?? set.mode, rubric: kind === 'mistakes' ? null : set.rubric ?? null, source: 'telegram',
  });
  let items = preset?.items;
  if (!items && set.mock) items = assembleMock(bot, set, history, session.id);
  else if (!items && set.draw) {
    const mastery = await bot.mastery();
    items = deal(set, set.draw, history, bot.ctx.now(), session.id, targetDifficulty(bot, nodeLevel(bot.pack, mastery, set.node) ?? bot.enrollment.placement?.overall ?? null));
  }
  if (items && !items.length) { await bot.store.updateSession(session.id, { status: 'abandoned' }); bot.menu(); return; }
  const limit = kind === 'mistakes' ? items!.length * 150 : undefined;
  bot.set({ flow: 'quiz', sessionId: session.id, activityId: set.id, index: 0, answers: [], startedAt: bot.ctx.now().toISOString(), ...(items ? { items } : {}), ...(kind ? { kind } : {}), ...(limit ? { limit } : {}) });
  const count = items?.length ?? set.questions.length;
  const minutes = Math.round((limit ?? set.timeLimitSeconds) / 60);
  if (kind === 'mock') bot.text(bot.t('quiz.mock_intro', { title: pick(set.title, bot.locale), count, minutes }));
  else if (kind === 'mistakes') bot.text(bot.t('quiz.mistakes_intro', { count }));
  else if (set.mode === 'listening' && set.audio) {
    bot.text(bot.t('quiz.listening', { title: pick(set.title, bot.locale), count, minutes }));
    await listeningAudio(bot, set);
  } else if (set.mode === 'practice' && !set.passage) bot.text(bot.t('quiz.practice', { title: pick(set.title, bot.locale), count, minutes }));
  else {
    bot.text(bot.t('quiz.reading', { title: pick(set.title, bot.locale), count, minutes }));
    if (set.passage) bot.text(`<b>${escapeHtml(set.passage.title)}</b>\n\n${escapeHtml(set.passage.text)}`);
  }
  askQuestion(bot, set);
}

async function listeningAudio(bot: Bot, set: QuizSet) {
  const cacheKey = bot.mediaKey(`l:${set.id}`);
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

function questionText(bot: Bot, state: Quiz, items: Item[], item: Item, index: number) {
  const type = bot.pack.questionTypes.find((entry) => entry.id === item.question.type);
  const head = bot.t('quiz.question', { n: index + 1, total: items.length, type: type ? pick(type.name, bot.locale) : item.question.type, prompt: item.question.prompt });
  // The notebook says which topic a question is from; a mock never does, as on exam day.
  return state.kind === 'mistakes' ? `${head}\n${bot.t('quiz.topic', { topic: pick(bot.pack.skillById.get(item.set.node)?.name, bot.locale) || pick(item.set.title, bot.locale) })}` : head;
}

function askQuestion(bot: Bot, set: QuizSet) {
  const state = bot.state.current as Quiz;
  const items = itemsOf(bot, state, set);
  const item = items[state.index];
  if (!item) return;
  const { question } = item;
  // Hints while practising; a mock has none.
  const hint = question.hints?.length && state.kind !== 'mock' ? [{ text: bot.p('quiz.hint'), data: `qh:${state.index}:0` }] : null;
  if (typeof question.answer === 'number' && question.options) {
    const long = question.options.some((option) => option.length > 30);
    const body = long ? `\n${question.options.map((option, i) => `<b>${LETTERS[i]}</b>. ${escapeHtml(option)}`).join('\n')}` : '';
    const buttons = long ? [question.options.map((_, i) => ({ text: LETTERS[i], data: `a:${state.index}:${i}` }))] : question.options.map((option, i) => [{ text: option, data: `a:${state.index}:${i}` }]);
    bot.text(`${questionText(bot, state, items, item, state.index)}${body}`, hint ? [...buttons, hint] : buttons);
    return;
  }
  const typed = typeof question.answer === 'object' && !Array.isArray(question.answer) ? bot.t('quiz.type_number') : bot.t('quiz.type_answer', { limit: question.wordLimit ?? 3 });
  bot.text(`${questionText(bot, state, items, item, state.index)}\n\n${typed}`, hint ? [hint] : undefined);
}

/** Practice sets (maths): hints one at a time before the answer. */
export function quizHint(bot: Bot, index: number, n: number) {
  const state = bot.state.current;
  if (state.flow !== 'quiz' || state.index !== index || state.kind === 'mock') return;
  const set = quizSets(bot).find((entry) => entry.id === state.activityId);
  const hints = set ? itemsOf(bot, state, set)[index]?.question.hints ?? [] : [];
  if (!hints[n]) return;
  bot.text(`💡 ${n + 1}/${hints.length}: ${escapeHtml(pick(hints[n], bot.locale))}`, n + 1 < hints.length ? [[{ text: bot.p('quiz.hint'), data: `qh:${index}:${n + 1}` }]] : undefined);
}

export async function onQuizAnswer(bot: Bot, input: { index?: number; choice?: number; text?: string }) {
  const state = bot.state.current as Quiz;
  const set = quizSets(bot).find((entry) => entry.id === state.activityId);
  if (!set) { bot.set({ flow: 'idle' }); bot.menu(); return; }
  if (input.index !== undefined && input.index !== state.index) return; // a stale tap
  const items = itemsOf(bot, state, set);
  const question = items[state.index]?.question;
  if (!question) { bot.set({ flow: 'idle' }); bot.menu(); return; }
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
  if (state.index < items.length) { askQuestion(bot, set); return; }
  await finishQuiz(bot, set, items);
}

/** "-2,5", "−3", "1/4", "2 1/2": numbers as people type them. */
export function parseNumber(text: string): number | null {
  const value = text.trim().replace(/[−–—]/g, '-').replace(/\s+/g, ' ').replace(/(\d),(\d)/g, '$1.$2');
  const mixed = /^(-?)(\d+) (\d+)\/(\d+)$/.exec(value);
  if (mixed) return (mixed[1] ? -1 : 1) * (Number(mixed[2]) + Number(mixed[3]) / Number(mixed[4]));
  const fraction = /^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(value);
  if (fraction) return Number(fraction[2]) === 0 ? null : Number(fraction[1]) / Number(fraction[2]);
  const number = Number(value);
  return value !== '' && Number.isFinite(number) ? number : null;
}

export function isRight(question: QuizQuestion, given: number | string | null): boolean {
  if (given === null) return false;
  if (typeof question.answer === 'number') return given === question.answer;
  if (Array.isArray(question.answer)) return typeof given === 'string' && answerMatches(given, question.answer);
  const value = parseNumber(String(given));
  return value !== null && Math.abs(value - question.answer.numeric) <= (question.answer.tolerance ?? 0) + 1e-9;
}
const answerText = (question: QuizQuestion) => (typeof question.answer === 'number' ? `${LETTERS[question.answer]}. ${question.options?.[question.answer] ?? ''}` : Array.isArray(question.answer) ? question.answer[0] : String(question.answer.numeric));
const givenText = (question: QuizQuestion, given: number | string | null) => (given === null ? '—' : typeof given === 'number' ? `${LETTERS[given]}. ${question.options?.[given] ?? ''}` : given);

async function finishQuiz(bot: Bot, set: QuizSet, items: Item[]) {
  const state = bot.state.current as Quiz;
  bot.set({ flow: 'idle' });
  const seconds = Math.round((bot.ctx.now().getTime() - Date.parse(state.startedAt)) / 1000);
  const limit = state.limit ?? set.timeLimitSeconds;
  const results = items.map((item, index) => ({ item, question: item.question, given: state.answers[index] ?? null, right: isRight(item.question, state.answers[index] ?? null) }));
  const correct = results.filter((result) => result.right).length;
  const types: Record<string, [number, number]> = {};
  for (const result of results) { const entry = types[result.question.type] ?? [0, 0]; entry[1] += 1; if (result.right) entry[0] += 1; types[result.question.type] = entry; }
  const topics: Record<string, [number, number]> = {};
  for (const result of results) { const entry = topics[result.item.set.node] ?? [0, 0]; entry[1] += 1; if (result.right) entry[0] += 1; topics[result.item.set.node] = entry; }
  const session = (await bot.store.session(state.sessionId))!;
  const minutes = Math.max(1, Math.round(seconds / 60));
  const percent = Math.round((correct / Math.max(1, results.length)) * 100);
  const rubric = state.kind !== 'mistakes' && set.rubric ? bot.pack.rubricById.get(set.rubric) : undefined;
  const overall = rubric ? snap(overallScale(rubric), (correct / Math.max(1, results.length)) * (rubric.scale.max - rubric.scale.min) + rubric.scale.min, rubric.overall.round) : null;
  await finishSession(bot, session, {
    overall, minutes: Math.min(minutes, Math.round(limit / 60) + 5), event: state.kind === 'mock' ? 'mock_finished' : 'drill_finished', node: set.node, score: percent,
    summary: {
      quiz: { mode: set.mode, correct, total: results.length }, types, seconds, ...(state.kind ? { kind: state.kind } : {}),
      ...(bot.pack.plan.selection === 'mastery' ? { topics } : {}),
      answers: results.map((result) => ({ id: result.question.id, ref: result.item.ref, given: result.given, right: result.right })),
    },
  });
  if (bot.pack.plan.selection === 'mastery') {
    // Topic-graph packs: each topic (the bank's node) moves by its own share right.
    for (const [node, [right, total]] of Object.entries(topics)) await learnAccuracy(bot, node, right / total);
  } else {
    // Each question type moves its own skill node.
    for (const [type, [right, total]] of Object.entries(types)) {
      const node = bot.pack.questionTypes.find((entry) => entry.id === type)?.node;
      if (node) await learnAccuracy(bot, node, right / total);
    }
  }
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const lines = [bot.t('quiz.result', { correct, total: results.length, time }, { over: seconds > limit ? bot.t('quiz.over_time') : '' })];
  const wrong = results.map((result, index) => ({ ...result, index })).filter((result) => !result.right);
  if (!wrong.length) lines.push(bot.t('quiz.all_right'));
  for (const result of wrong.slice(0, 5)) {
    lines.push(bot.t('quiz.wrong', { n: result.index + 1, given: givenText(result.question, result.given), answer: answerText(result.question), explanation: pick(result.question.explanation, bot.locale), evidence: result.question.evidence ?? '' }).replace(/\n📌 “”|\n📌 «»/, ''));
  }
  if (state.kind === 'mistakes') {
    const left = (await openMistakes(bot)).length;
    lines.push(bot.t('quiz.cleared', { count: correct, left }));
  } else {
    const weakest = Object.entries(types).filter(([, [right, total]]) => right < total).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1])[0];
    const type = weakest ? bot.pack.questionTypes.find((entry) => entry.id === weakest[0]) : undefined;
    if (type) lines.push(bot.t('quiz.strategy', { type: pick(type.name, bot.locale), strategy: pick(type.strategy, bot.locale) }));
  }
  if (rubric && overall !== null) lines.push(...await keyedLines(bot, rubric.id, overall));
  else {
    const estimate = await quizEstimate(bot, set.mode);
    if (estimate) lines.push(bot.t('quiz.estimate', { mode: bot.p(`mode.${set.mode}` as 'mode.reading'), level: estimate.level, count: estimate.questions }));
  }
  const open = bot.pack.manifest.menu.some((entry) => entry.action === 'mistakes') ? (await openMistakes(bot)).length : 0;
  const again = state.kind === 'mock' ? { text: `⏱ ${bot.p('btn.next')}`, data: 'm:mock' } : { text: `${set.mode === 'listening' ? '🎧' : set.mode === 'reading' ? '📖' : '🧮'} ${bot.p('btn.next')}`, data: `m:${set.mode}` };
  bot.text(lines.join('\n\n'), [...(open ? [[{ text: bot.p('mistakes.button', { count: open }), data: 'm:mistakes' }]] : []), ...bot.nav([again])]);
}

/**
 * After a keyed result (a mini-mock): the forecast from the learner's own results, the
 * projection onto the exam blocks, and the anonymous percentile when the window holds
 * enough people.
 */
export async function keyedLines(bot: Bot, rubricId: string, overall: number): Promise<string[]> {
  const rubric = bot.pack.rubricById.get(rubricId)!;
  const scale = overallScale(rubric);
  const lines = [bot.t('quiz.mock_score', { level: levelLabel(scale, overall) })];
  const share = (overall - rubric.scale.min) / (rubric.scale.max - rubric.scale.min || 1);
  const projections = (rubric.projections ?? []).map((block) => bot.t('quiz.projection', { count: Math.round(share * block.questions), total: block.questions, name: pick(block.name, bot.locale) }));
  if (projections.length) lines.push(projections.join('\n'));
  const goal = goalOf(bot.pack, bot.enrollment);
  const sessions = await bot.store.results(bot.enrollment.userId, bot.pack.manifest.id, { rubric: rubric.id, limit: 40 });
  const points = sessions.map((session) => ({ at: session.finishedAt ?? session.startedAt, value: session.overall! })).reverse();
  const forecast = predict(scale, points, weeksLeft(goal, localParts(bot.ctx.now(), bot.tz).day, bot.pack.plan.goal.defaultWeeks).weeks, rubric.overall.round);
  lines.push(forecast.predicted === null ? bot.t('progress.need_more') : bot.t('progress.predicted', {
    when: bot.p(goal.examDate ? 'progress.exam' : 'progress.plan_end'), level: levelLabel(scale, forecast.predicted),
    confidence: bot.p(forecast.confidence === 'medium' ? 'progress.confidence.medium' : 'progress.confidence.low'),
  }));
  const place = await percentileOf(bot, rubric.id, overall);
  if (place) lines.push(place.percentile === null ? bot.t('quiz.percentile_soon', { min: MIN_COHORT, days: place.days }) : bot.t('quiz.percentile', { percentile: place.percentile, people: place.people, days: place.days }));
  return lines;
}

/** The anonymous percentile on the pack's percentile rubric: null when the pack has none for this rubric. */
export async function percentileOf(bot: Bot, rubricId: string, overall: number): Promise<{ percentile: number | null; people: number; days: number } | null> {
  const config = bot.pack.percentile;
  if (!config || config.rubric !== rubricId) return null;
  const since = new Date(bot.ctx.now().getTime() - config.windowDays * DAY).toISOString();
  const place = cohortPercentile(await bot.store.cohort(bot.pack.manifest.id, rubricId, since), Math.round(overall));
  return place ? { ...place, days: config.windowDays } : { percentile: null, people: 0, days: config.windowDays };
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
