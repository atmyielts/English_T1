import { escapeHtml, pick, type Lesson, type PhotoHelp } from '../../../../../packages/coach-packs/src/mod.ts';
import { s } from '../../../../../packages/ai-core/src/mod.ts';
import { keyOf, LANGUAGE, ocrMessages, RULES } from '../ai.ts';
import type { Bot } from '../bot.ts';
import { emit, finishSession, recordPractice } from '../results.ts';

// The activity kinds the next coaches use: photo help (a photo of a problem gives
// a ladder of hints, then the worked solution only when asked, one `photo` charge
// for the whole ladder) and micro-lessons with a check question.

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const photoSchema = (levels: number) => s.object({
  problem: s.string({ min: 1, max: 4000 }),
  legible: s.boolean(),
  hints: s.array(s.string({ min: 1, max: 800 }), { min: 1, max: levels }),
  solution: s.string({ min: 1, max: 6000 }),
  answer: s.string({ max: 400 }),
});

export async function onPhotoHelp(bot: Bot, image: string, mime: string) {
  const activity = bot.pack.ofKind('photo_help')[0] as PhotoHelp | undefined;
  if (!activity) { bot.menu(); return; }
  if (!(await bot.allowed())) { bot.paywall(); return; }
  const level = await bot.level(activity.node);
  const explain = bot.explainIn(level);
  let made: { problem: string; legible: boolean; hints: string[]; solution: string; answer: string };
  try {
    const messages = ocrMessages(bot.pack, image, mime || 'image/jpeg', 'problem');
    messages[0] = { role: 'system', content: [RULES(bot.pack), '', `Subject: ${activity.subject}. ${activity.instructions}`,
      `1. Transcribe the problem in the photo exactly (problem). If it cannot be read, set legible to false.`,
      `2. Write ${activity.hintLevels} hints that lead the learner to the method step by step without giving the answer away; each hint builds on the previous one.`,
      '3. Write the full worked solution (solution) and the final answer (answer). They are shown only when the learner asks.',
      `Write hints and the solution in ${LANGUAGE[explain]}. Use \\( \\) for maths.`].join('\n') };
    made = (await bot.ctx.ai.json({ key: keyOf(bot.pack, 'photo'), messages, schema: photoSchema(activity.hintLevels), temperature: 0.2, maxTokens: 3000, reference: bot.reference('photo') })).data;
  } catch (cause) { bot.aiError(cause); return; }
  if (!made.legible) { bot.text(bot.t('error.photo_unreadable')); return; }
  const session = await bot.store.createSession({ enrollmentId: bot.enrollment.id, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, packVersion: bot.pack.manifest.version, kind: 'photo_help', activityId: activity.id, mode: null, rubric: null, source: 'telegram' });
  await bot.store.addTurn({ sessionId: session.id, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, role: 'coach', kind: 'photo_help', promptRef: activity.id, content: JSON.stringify(made).slice(0, 20000), inputMode: 'photo', clip: null, metrics: { hints: made.hints.length }, timing: {}, keep: false });
  bot.state.options = [`ph:${session.id}`];
  bot.text(`📷 <b>${escapeHtml(made.problem)}</b>\n\n💡 1/${made.hints.length}: ${escapeHtml(made.hints[0])}`, hintButtons(bot, 1, made.hints.length, activity.solutionOnRequest));
}

const hintButtons = (bot: Bot, shown: number, total: number, solution: boolean) => [
  ...(shown < total ? [[{ text: `💡 ${shown + 1}/${total}`, data: `ph:h:${shown}` }]] : []),
  ...(solution ? [[{ text: bot.p('photo.solution'), data: 'ph:s' }]] : []),
  ...bot.nav(),
];

export async function onPhotoStep(bot: Bot, data: string) {
  const sessionId = bot.state.options?.[0]?.startsWith('ph:') ? bot.state.options[0].slice(3) : null;
  const turn = sessionId ? (await bot.store.turns(sessionId)).find((entry) => entry.kind === 'photo_help') : undefined;
  const activity = bot.pack.ofKind('photo_help')[0] as PhotoHelp | undefined;
  if (!turn || !activity || !sessionId) { bot.menu(); return; }
  const made = JSON.parse(turn.content) as { problem: string; hints: string[]; solution: string; answer: string };
  if (data.startsWith('ph:h:')) {
    const index = Number(data.slice(5));
    if (!Number.isInteger(index) || index < 1 || index >= made.hints.length) return;
    bot.text(`💡 ${index + 1}/${made.hints.length}: ${escapeHtml(made.hints[index])}`, hintButtons(bot, index + 1, made.hints.length, activity.solutionOnRequest));
    return;
  }
  if (data === 'ph:s' && activity.solutionOnRequest) {
    bot.text(`✅ ${escapeHtml(made.solution)}\n\n<b>${escapeHtml(made.answer)}</b>`, bot.nav());
    const session = await bot.store.session(sessionId);
    if (session?.status === 'active') await finishSession(bot, session, { overall: null, minutes: activity.minutes, event: null, node: activity.node, summary: { hintsUsed: made.hints.length } });
  }
}

export async function startLesson(bot: Bot) {
  const lessons = bot.pack.ofKind('lesson') as Lesson[];
  const recent = await bot.store.sessions(bot.enrollment.userId, bot.pack.manifest.id, { limit: 40, kind: 'lesson' });
  const done = new Set(recent.map((session) => session.activityId));
  const lesson = lessons.find((entry) => !done.has(entry.id)) ?? lessons[0];
  if (!lesson) { bot.menu(); return; }
  const session = await bot.store.createSession({ enrollmentId: bot.enrollment.id, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, packVersion: bot.pack.manifest.version, kind: 'lesson', activityId: lesson.id, mode: null, rubric: null, source: 'telegram' });
  bot.state.options = [`lesson:${session.id}`];
  emit(bot, 'lesson_viewed', { node: lesson.node, ref: session.id });
  bot.text(`📘 <b>${escapeHtml(pick(lesson.title, bot.locale))}</b>\n\n${escapeHtml(pick(lesson.body, bot.locale))}\n\n<i>${escapeHtml(lesson.example)}</i>`);
  bot.text(`${escapeHtml(lesson.check.prompt)}\n${lesson.check.options.map((option, i) => `<b>${LETTERS[i]}</b>. ${escapeHtml(option)}`).join('\n')}`, [lesson.check.options.map((_, i) => ({ text: LETTERS[i], data: `ls:${i}` }))]);
}

export async function onLessonCheck(bot: Bot, choice: number) {
  const sessionId = bot.state.options?.[0]?.startsWith('lesson:') ? bot.state.options[0].slice(7) : null;
  const session = sessionId ? await bot.store.session(sessionId) : null;
  const lesson = session?.activityId ? bot.pack.byId.get(session.activityId) as Lesson | undefined : undefined;
  if (!session || !lesson || session.status !== 'active') return;
  const right = choice === lesson.check.answer;
  bot.clearButtons = true;
  bot.text(`${right ? '✅' : '❌'} ${escapeHtml(pick(lesson.check.explanation, bot.locale))}`, bot.nav());
  await finishSession(bot, session, { overall: null, minutes: lesson.minutes, event: right ? 'check_passed' : null, node: lesson.node, score: right ? 1 : 0, summary: { right } });
  if (!right) { recordPractice(bot, 0); emit(bot, 'check_failed', { node: lesson.node, ref: session.id }); }
}
