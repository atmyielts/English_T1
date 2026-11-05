import { analyseLexis, countWords, escapeHtml, levelLabel, pick, type Assessment, type DataTable, type WritingTask } from '../../../../../packages/coach-packs/src/mod.ts';
import { SchoodAIError } from '../../types.ts';
import { assessInSession, keyOf, ladderMessages, ladderSchema, ocrMessages, ocrSchema } from '../ai.ts';
import { activityFacts, factsNotice } from '../facts.ts';
import type { Bot, FlowState } from '../bot.ts';
import { criteriaOf, emit, finishSession, learnFrom, scoreRows } from '../results.ts';
import { compareRows, criterionLines, errorsBlock, MAX_TEXT, overallLabel, quoteHtml, topDrillTag, upgradesBlock } from './render.ts';

// Writing: a task (Task 1 with its chart as a table, Task 2, a letter), the
// answer as text or a photo of handwriting (read first, confirmed by the learner,
// so a misread word is never marked as their error), a band per criterion with
// quotes, corrections tagged by error type, "say it better", the essay ladder, and
// rewrites compared with the previous draft.

type Writing = Extract<FlowState, { flow: 'writing' }>;
const MAX_PHOTO_BYTES = 6_000_000;

export const writingTasks = (bot: Bot): WritingTask[] => bot.pack.ofKind('writing');

/** A small text table of the task's data for the chat; the chart itself opens in the Mini App. */
export function tableText(data: DataTable): string {
  const rows = [data.columns, ...data.rows.map((row) => row.map(String))];
  const widths = data.columns.map((_, column) => Math.min(18, Math.max(...rows.map((row) => String(row[column] ?? '').length))));
  return rows.map((row) => row.map((cell, column) => String(cell).slice(0, 18).padEnd(widths[column])).join(' | ')).join('\n');
}

export async function chooseWriting(bot: Bot) {
  const recent = await bot.store.sessions(bot.enrollment.userId, bot.pack.manifest.id, { limit: 40, kind: 'writing' });
  const last = new Map<string, number>();
  for (const session of recent) if (session.activityId && !last.has(session.activityId)) last.set(session.activityId, Date.parse(session.startedAt));
  // One task per kind of writing (Task 2, a report with data, a letter), least recent first.
  const groups = new Map<string, WritingTask[]>();
  for (const task of writingTasks(bot)) {
    const key = `${task.node}:${task.data ? 'data' : 'text'}`;
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  const options = [...groups.values()].map((tasks) => [...tasks].sort((a, b) => (last.get(a.id) ?? 0) - (last.get(b.id) ?? 0))[0]);
  bot.state.options = options.map((task) => `write:${task.id}`);
  bot.text(bot.t('write.choose'), [...options.map((task, index) => [{ text: pick(task.title, bot.locale), data: `o:${index}` }]), ...bot.nav()]);
}

export async function startWriting(bot: Bot, activityId: string, previousSessionId: string | null = null) {
  const task = writingTasks(bot).find((entry) => entry.id === activityId);
  if (!task) { await chooseWriting(bot); return; }
  const session = await bot.store.createSession({ enrollmentId: bot.enrollment.id, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, packVersion: bot.pack.manifest.version, kind: 'writing', activityId: task.id, mode: previousSessionId ? 'rewrite' : null, rubric: task.rubric, source: 'telegram' });
  bot.set({ flow: 'writing', sessionId: session.id, activityId: task.id, awaiting: 'answer', pendingTurnId: null, previousSessionId });
  if (previousSessionId) { bot.text(bot.t('write.rewrite_prompt')); return; }
  bot.text(`✍️ <b>${escapeHtml(pick(task.title, bot.locale))}</b>\n\n${escapeHtml(task.prompt)}`);
  if (task.data) {
    bot.text(bot.t('write.data', { title: task.data.title, note: task.data.note, table: tableText(task.data) }, { unit: task.data.unit ? ` (${escapeHtml(task.data.unit)})` : '' }), [[bot.app(bot.p('write.chart'), `/chart/${task.id}`)]]);
  }
  const notice = factsNotice(activityFacts(bot.pack, task), bot.locale, bot.ctx.now());
  if (notice) bot.text(notice);
  bot.text(bot.t('write.hint', { words: task.minWords, minutes: task.recommendedMinutes }), bot.nav());
}

export async function onWritingText(bot: Bot, text: string, forceShort = false) {
  const state = bot.state.current as Writing;
  const task = writingTasks(bot).find((entry) => entry.id === state.activityId);
  if (!task) { bot.set({ flow: 'idle' }); bot.menu(); return; }
  if (text.length > MAX_TEXT * 2) { bot.text(bot.t('error.too_long', { max: MAX_TEXT * 2 })); return; }
  const words = countWords(text);
  if (words < 10) { bot.text(bot.t('write.hint', { words: task.minWords, minutes: task.recommendedMinutes })); return; }
  if (!forceShort && words < task.minWords * 0.4) {
    const turn = await bot.store.addTurn({ sessionId: state.sessionId, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, role: 'learner', kind: 'draft', promptRef: task.id, content: text, inputMode: 'text', clip: null, metrics: { words }, timing: {}, keep: false });
    state.awaiting = 'confirm'; state.pendingTurnId = turn.id;
    bot.text(bot.t('write.too_short', { count: words, min: task.minWords }), [[{ text: bot.p('write.score_anyway'), data: 'w:sc' }]]);
    return;
  }
  await scoreWriting(bot, task, text, 'text');
}

export async function onWritingPhoto(bot: Bot, image: string, mime: string) {
  const state = bot.state.current as Writing;
  const task = writingTasks(bot).find((entry) => entry.id === state.activityId);
  if (!task) { bot.set({ flow: 'idle' }); bot.menu(); return; }
  if (!(await bot.allowed())) { bot.paywall(); return; }
  if (image.length * 0.75 > MAX_PHOTO_BYTES) { bot.text(bot.t('error.photo_unreadable')); return; }
  let read: { text: string; legible: boolean };
  try {
    read = (await bot.ctx.ai.json({ key: keyOf(bot.pack, 'photo'), messages: ocrMessages(bot.pack, image, mime || 'image/jpeg', 'writing'), schema: ocrSchema, temperature: 0, maxTokens: 2500, reference: bot.reference('tg') })).data;
  } catch (cause) { bot.aiError(cause); return; }
  if (!read.legible || countWords(read.text) < 10) { bot.text(bot.t('error.photo_unreadable')); return; }
  const turn = await bot.store.addTurn({ sessionId: state.sessionId, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, role: 'learner', kind: 'ocr', promptRef: task.id, content: read.text, inputMode: 'photo', clip: null, metrics: { words: countWords(read.text) }, timing: {}, keep: false });
  state.awaiting = 'confirm'; state.pendingTurnId = turn.id;
  bot.text(bot.t('write.ocr', { count: countWords(read.text) }, { text: quoteHtml(read.text) }), [[{ text: `${bot.p('write.score')} · ${bot.p('cost', { count: 5 })}`, data: 'w:sc' }]]);
}

/** "Score it" after a photo was read or a short draft was sent. */
export async function confirmWriting(bot: Bot) {
  const state = bot.state.current as Writing;
  const task = writingTasks(bot).find((entry) => entry.id === state.activityId);
  const pending = state.pendingTurnId ? await bot.store.turn(state.pendingTurnId) : null;
  if (!task || !pending) { bot.menu(); return; }
  await scoreWriting(bot, task, pending.content, pending.inputMode === 'photo' ? 'photo' : 'text');
}

async function scoreWriting(bot: Bot, task: WritingTask, text: string, mode: 'text' | 'photo') {
  const state = bot.state.current as Writing;
  if (!(await bot.allowed())) { bot.paywall(); return; }
  const rubric = bot.pack.rubricById.get(task.rubric)!;
  const level = await bot.level(task.node);
  const words = countWords(text);
  let assessment: Assessment;
  try {
    const result = await bot.ctx.ai.charged({ key: keyOf(bot.pack, 'writing'), mode: 'json', reference: bot.reference('write') }, (session) => assessInSession(session, {
      pack: bot.pack, rubric, explain: bot.explainIn(level), answer: text, fluency: null, facts: activityFacts(bot.pack, task), now: bot.ctx.now(),
      task: { prompt: task.prompt, data: task.data ?? null, min_words: task.minWords, word_count: words, what_a_strong_answer_covers: task.assessorNotes },
      extra: [`- The answer has ${words} words; the task asks for at least ${task.minWords}. Apply the rubric's length rule.`, '- Corrections must quote the learner\'s exact words; prefer the errors that cost the most marks.'],
    }));
    assessment = result.result;
  } catch (cause) {
    if (cause instanceof SchoodAIError) { bot.aiError(cause); return; }
    throw cause;
  }
  const session = (await bot.store.session(state.sessionId))!;
  const lexis = analyseLexis(text, bot.pack.fluency, bot.pack.ofKind('deck').flatMap((deck) => deck.cards.map((card) => card.front)));
  const turn = await bot.store.addTurn({
    sessionId: session.id, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, role: 'learner', kind: 'essay', promptRef: task.id, content: text, inputMode: mode, clip: null,
    metrics: { words, range: lexis.range, distinct: lexis.distinct, longWords: lexis.longWords, overall: assessment.overall, criteria: criteriaOf(assessment), errors: assessment.errors.map((error) => error.tag), assessment }, timing: {}, keep: false,
  });
  await bot.store.addScores(scoreRows(bot, session, turn, assessment));
  await learnFrom(bot, rubric, assessment);
  await finishSession(bot, session, {
    overall: assessment.overall, minutes: task.recommendedMinutes, event: 'turn_scored', node: task.node,
    summary: { criteria: criteriaOf(assessment), evidence: Object.fromEntries(assessment.criteria.map((criterion) => [criterion.id, criterion.evidence])), errors: assessment.errors, upgrades: assessment.upgrades, summary: assessment.summary, words, previous: state.previousSessionId },
  });
  state.awaiting = 'after'; state.pendingTurnId = turn.id;
  const blocks = [
    `${bot.t('write.result', { task: pick(task.title, bot.locale), words, overall: overallLabel(rubric, assessment.overall) })}\n${criterionLines(bot, rubric, assessment).join('\n')}`,
    errorsBlock(bot, assessment, 4),
    upgradesBlock(bot, assessment, 2),
  ].filter(Boolean) as string[];
  if (state.previousSessionId) {
    const previous = await bot.store.session(state.previousSessionId);
    if (previous) blocks.push(compareRows(bot, rubric, { overall: previous.overall, criteria: (previous.summary.criteria ?? {}) as Record<string, number | null>, wpm: null, fillers: null }, { overall: assessment.overall, criteria: criteriaOf(assessment), wpm: null, fillers: null }));
  }
  blocks.push(bot.t('write.estimate_note'));
  const drill = topDrillTag(bot, assessment);
  bot.text(blocks.join('\n\n'), [
    ...(task.ladder?.length ? [[{ text: `${bot.p('write.ladder')} · ${bot.p('cost', { count: 8 })}`, data: 'w:ld' }]] : []),
    ...(drill ? [[{ text: bot.p('write.drill', { error: pick(bot.pack.errorById.get(drill)?.name, bot.locale) }), data: `dr:${drill}` }]] : []),
    [{ text: bot.p('write.rewrite'), data: 'w:rw' }, bot.app(bot.p('btn.full_report'), `/session/${session.id}`)],
    ...bot.nav(),
  ]);
}

/** The learner's own essay rewritten at the ladder's levels, with what changed (the `ladder` credit). */
export async function writingLadder(bot: Bot) {
  const state = bot.state.current as Writing;
  const task = writingTasks(bot).find((entry) => entry.id === state.activityId);
  const essay = state.pendingTurnId ? await bot.store.turn(state.pendingTurnId) : null;
  if (!task || !essay || !task.ladder?.length) { bot.menu(); return; }
  if (!(await bot.allowed())) { bot.paywall(); return; }
  const rubric = bot.pack.rubricById.get(task.rubric)!;
  const level = await bot.level(task.node);
  let ladder: { levels: { level: number; text: string; changes: string[] }[] };
  try {
    ladder = (await bot.ctx.ai.json({ key: keyOf(bot.pack, 'ladder'), messages: ladderMessages(bot.pack, rubric, task.prompt, essay.content, task.ladder, bot.explainIn(level)), schema: ladderSchema(task.ladder), temperature: 0.3, maxTokens: 6000, reference: bot.reference('ladder') })).data;
  } catch (cause) { bot.aiError(cause); return; }
  await bot.store.addTurn({ sessionId: state.sessionId, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, role: 'coach', kind: 'ladder', promptRef: essay.id, content: JSON.stringify(ladder.levels).slice(0, 20000), inputMode: null, clip: null, metrics: {}, timing: {}, keep: false });
  emit(bot, 'lesson_viewed', { node: task.node, ref: state.sessionId });
  for (const step of ladder.levels) {
    bot.text(bot.t('write.ladder_title', { level: levelLabel(rubric.scale, step.level) }, { text: quoteHtml(step.text, 3000), changes: step.changes.map((change) => `• ${escapeHtml(change)}`).join('\n') }));
  }
  bot.text(bot.t('write.ladder_note'), [[bot.app(bot.p('btn.full_report'), `/session/${state.sessionId}`)], ...bot.nav()]);
}

export async function writingRewrite(bot: Bot) {
  const state = bot.state.current as Writing;
  await startWriting(bot, state.activityId, state.sessionId);
}
