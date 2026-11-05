import {
  aggregate, analyseFluency, analyseLexis, countWords, escapeHtml, paceFor, pick, type Assessment, type FluencyMetrics, type SpeakingExam, type TimedWord,
} from '../../../../../packages/coach-packs/src/mod.ts';
import { SchoodAIError } from '../../types.ts';
import { assessInSession, keyOf, mockMessages } from '../ai.ts';
import { activityFacts, factsNotice } from '../facts.ts';
import type { Bot, FlowState, SpeakItem } from '../bot.ts';
import { criteriaOf, emit, finishSession, learnFrom, recordPractice, scoreRows } from '../results.ts';
import { recordCoachVoice } from '../../seams/coach-engage.ts';
import type { Session, Turn } from '../store.ts';
import { bytesOf, clipOf, compareRows, criterionLines, errorsBlock, fluencyLine, MAX_TEXT, MAX_VOICE_SECONDS, overallLabel, topDrillTag, upgradesBlock, type VoiceEvent } from './render.ts';

// Exam-style speaking (IELTS Parts 1–3; any pack's speaking_exam). Two modes:
//   mock: the real test flow, no feedback between questions, one holistic review
//         at the end (the `review` credit), timing checked on the long turn;
//   practice: one part at a time, each answer scored with quotes, fluency numbers
//         and "say it better" lines, then re-record to see before and after.

type Speaking = Extract<FlowState, { flow: 'speaking' }>;
class TooShort extends Error {}

const hash = (text: string) => { let h = 2166136261; for (const char of text) { h ^= char.codePointAt(0)!; h = Math.imul(h, 16777619); } return h >>> 0; };
function pickFrom<T extends { id: string }>(items: T[], avoid: string[], seed: string, count: number): T[] {
  const fresh = items.filter((item) => !avoid.includes(item.id));
  const pool = fresh.length >= count ? fresh : items;
  return [...pool].sort((a, b) => hash(`${seed}:${a.id}`) - hash(`${seed}:${b.id}`)).slice(0, count);
}

export function speakingExams(bot: Bot): SpeakingExam[] { return bot.pack.ofKind('speaking_exam'); }

/** The choice of part (and the full mock) for practice. */
export function chooseSpeaking(bot: Bot) {
  const options: string[] = [], rows = [];
  for (const exam of speakingExams(bot)) {
    for (const part of exam.parts) { options.push(`${exam.id}|${part.id}`); rows.push([{ text: pick(part.title, bot.locale), data: `o:${options.length - 1}` }]); }
    if (exam.mock) { options.push(`${exam.id}|mock`); rows.push([{ text: bot.p('speak.mock'), data: `o:${options.length - 1}` }]); }
  }
  bot.state.options = options.map((option) => `speak:${option}`);
  bot.text(bot.t('speak.choose'), [...rows, ...bot.nav()]);
}

function buildQueue(bot: Bot, exam: SpeakingExam, mode: string, seed: string): SpeakItem[] {
  const recent = bot.state.recent ?? {};
  const queue: SpeakItem[] = [];
  const longTurn = exam.parts.find((part) => part.kind === 'long_turn');
  const card = longTurn?.cards?.length ? pickFrom(longTurn.cards, recent.cards ?? [], seed, 1)[0] : undefined;
  const parts = mode === 'mock' ? exam.parts : exam.parts.filter((part) => part.id === mode);
  for (const part of parts) {
    const label = pick(part.title, bot.locale);
    if (part.kind === 'long_turn' && card) {
      queue.push({ part: part.id, label, question: card.topic, ref: card.id, kind: 'cue', card: card.id });
      if (mode === 'mock' && card.roundOff[0]) queue.push({ part: part.id, label, question: card.roundOff[0], ref: `${card.id}:r0`, kind: 'question', card: card.id });
    } else if (part.kind === 'questions' && part.fromCard) {
      const source = card ?? longTurn?.cards?.[0];
      for (const [index, question] of (source?.discussion ?? []).slice(0, mode === 'mock' ? part.askPerTopic ?? 4 : 3).entries()) queue.push({ part: part.id, label, question, ref: `${source!.id}:d${index}`, kind: 'question', card: source!.id });
    } else if (part.kind === 'questions') {
      const topics = pickFrom(part.topics ?? [], recent.topics ?? [], seed, mode === 'mock' ? part.pickTopics ?? 1 : 1);
      for (const topic of topics) for (const [index, question] of topic.questions.slice(0, part.askPerTopic ?? 3).entries()) queue.push({ part: part.id, label, question, ref: `${topic.id}:${index}`, kind: 'question' });
    }
  }
  const used = { cards: card ? [card.id] : [], topics: [...new Set(queue.filter((item) => !item.card).map((item) => item.ref.split(':')[0]))] };
  bot.state.recent = { ...recent, cards: [...used.cards, ...(recent.cards ?? [])].slice(0, 10), topics: [...used.topics, ...(recent.topics ?? [])].slice(0, 12) };
  return queue;
}

export async function startSpeaking(bot: Bot, input: { activityId?: string; mode: string }) {
  const exam = (input.activityId ? speakingExams(bot).find((entry) => entry.id === input.activityId) : undefined)
    ?? (input.mode === 'mock' ? speakingExams(bot).find((entry) => entry.mock) : speakingExams(bot)[0]);
  if (!exam) { bot.menu(); return; }
  const mode = input.mode === 'mock' && exam.mock ? 'mock' : exam.parts.some((part) => part.id === input.mode) ? input.mode : exam.parts[0].id;
  const session = await bot.store.createSession({ enrollmentId: bot.enrollment.id, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, packVersion: bot.pack.manifest.version, kind: 'speaking_exam', activityId: exam.id, mode, rubric: exam.rubric, source: 'telegram' });
  const queue = buildQueue(bot, exam, mode, session.id);
  if (!queue.length) { bot.menu(); return; }
  bot.set({ flow: 'speaking', sessionId: session.id, activityId: exam.id, mock: mode === 'mock', queue, index: 0, askedAt: bot.ctx.now().toISOString(), awaiting: 'answer', lastTurnId: null });
  if (mode === 'mock') bot.text(bot.t('speak.mock_note'));
  const notice = factsNotice(activityFacts(bot.pack, exam), bot.locale, bot.ctx.now());
  if (notice) bot.text(notice);
  ask(bot, exam);
}

function ask(bot: Bot, exam: SpeakingExam) {
  const state = bot.state.current as Speaking;
  const item = state.queue[state.index];
  const part = exam.parts.find((entry) => entry.id === item.part)!;
  const previous = state.queue[state.index - 1];
  if (!previous || previous.part !== item.part) bot.text(`${bot.t('speak.part_intro', { part: pick(part.title, bot.locale) })}\n<i>${escapeHtml(part.intro)}</i>`);
  state.askedAt = bot.ctx.now().toISOString();
  state.awaiting = 'answer';
  if (item.kind === 'cue') {
    const card = part.cards!.find((entry) => entry.id === item.card)!;
    bot.text(bot.t('speak.cue', { topic: card.topic }, { points: card.points.map((point) => `• ${point.replace(/[<>&]/g, '')}`).join('\n') }), [
      [bot.app(bot.p('speak.timer'), `/timer?prep=${card.prepSeconds}&talk=${card.talkSeconds}`)],
    ]);
    return;
  }
  const position = state.queue.slice(0, state.index + 1).filter((entry) => entry.part === item.part).length;
  bot.text(`${bot.t('speak.question', { label: `${item.label} · ${position}`, question: item.question })}\n\n${bot.t('speak.answer_hint')}`, state.mock ? undefined : [[{ text: bot.p('btn.finish'), data: 'sp:end' }]]);
}

interface Heard { text: string; scored: string; words: TimedWord[]; duration: number | null; mode: 'voice' | 'text'; timing: Record<string, number> }

/** Long-turn timing from Telegram's own clock: when the card was sent, when recording started, how long it ran. */
function timingOf(exam: SpeakingExam, item: SpeakItem, askedAt: string, event: VoiceEvent | null): Record<string, number> {
  if (item.kind !== 'cue' || !event) return {};
  const card = exam.parts.flatMap((part) => part.cards ?? []).find((entry) => entry.id === item.card);
  const started = event.date - event.duration;
  return { prep: Math.max(0, Math.round(started - Date.parse(askedAt) / 1000)), talk: event.duration, limit: card?.talkSeconds ?? 120, min: card?.minTalkSeconds ?? 60 };
}

/** What the examiner would hear: words past the talk limit are cut. */
function heardText(text: string, words: TimedWord[], limit: number | undefined): string {
  if (!limit || !words.length || words.at(-1)!.end <= limit + 5) return text;
  return words.filter((word) => word.start <= limit).map((word) => word.word).join(' ').replace(/\s+([,.!?;:])/g, '$1');
}

function timingLine(bot: Bot, timing: Record<string, number>): string | null {
  if (timing.talk === undefined) return null;
  const lines = [bot.t('speak.timing.prep', { prep: timing.prep })];
  if (timing.talk > timing.limit + 5) lines.push(bot.t('speak.timing.long', { talk: timing.talk }));
  else if (timing.talk < timing.min) lines.push(bot.t('speak.timing.short', { talk: timing.talk }));
  else lines.push(bot.t('speak.timing.ok', { talk: timing.talk }));
  return lines.join('\n');
}

export async function onSpeakingAnswer(bot: Bot, input: { text?: string; voice?: VoiceEvent }) {
  const state = bot.state.current as Speaking;
  const exam = await examOf(bot, state);
  if (!exam) { bot.set({ flow: 'idle' }); bot.menu(); return; }
  if (state.index >= state.queue.length) { await finishMock(bot, exam); return; }
  if (!(await bot.allowed())) { bot.paywall(); return; }
  if (input.voice && input.voice.duration > MAX_VOICE_SECONDS) { bot.text(bot.t('error.voice_too_long', { max: MAX_VOICE_SECONDS / 60 })); return; }
  if (input.text && input.text.length > MAX_TEXT) { bot.text(bot.t('error.too_long', { max: MAX_TEXT })); return; }
  const item = state.queue[state.index];
  const rubric = bot.pack.rubricById.get(exam.rubric)!;
  const level = await bot.level(exam.node);
  const timing = timingOf(exam, item, state.askedAt, input.voice ?? null);
  const reference = bot.reference('tg');
  const part = exam.parts.find((entry) => entry.id === item.part)!;
  if (input.text !== undefined && countWords(input.text) < 4) { bot.text(bot.t('speak.too_short')); return; }

  if (state.mock) {
    // The real test: record the answer, give no feedback, ask the next question.
    let heard: Heard;
    try {
      heard = input.voice ? await transcribeOnly(bot, input.voice, reference, timing.limit) : { text: input.text!, scored: input.text!, words: [], duration: null, mode: 'text', timing: {} };
    } catch (cause) { bot.aiError(cause, !!input.voice); return; }
    heard.timing = timing;
    await saveAnswer(bot, state, item, heard, input.voice ?? null, level);
    state.index += 1;
    if (state.index < state.queue.length) { bot.text(bot.t('speak.saved_plain')); ask(bot, exam); return; }
    await finishMock(bot, exam);
    return;
  }

  // Practice: transcribe (voice) and score under one charge.
  let heard: Heard, assessment: Assessment;
  try {
    const result = await bot.ctx.ai.charged({ key: keyOf(bot.pack, 'turn'), mode: input.voice ? 'stt' : 'json', reference }, async (session) => {
      let got: Heard = { text: input.text ?? '', scored: input.text ?? '', words: [], duration: null, mode: 'text', timing };
      if (input.voice) {
        const transcript = await session.transcribe({ audio: bytesOf(input.voice.audio), mime: input.voice.mime || 'audio/ogg', language: practiceLanguage(bot) });
        got = { text: transcript.text, scored: heardText(transcript.text, transcript.words, timing.limit), words: transcript.words, duration: transcript.durationSec ?? input.voice.duration, mode: 'voice', timing };
        if (countWords(got.text) < 4) throw new TooShort();
      }
      const fluency = analyseFluency({ text: got.scored, words: got.words, durationSec: got.duration }, bot.pack.fluency, level);
      const graded = await assessInSession(session, {
        pack: bot.pack, rubric, explain: bot.explainIn(level), answer: got.scored, fluency, facts: activityFacts(bot.pack, exam), now: bot.ctx.now(),
        task: { exam: pick(exam.title, 'en'), part: pick(part.title, 'en'), question: item.question, expected_seconds: part.answerSeconds, ...(item.kind === 'cue' ? { cue_card: part.cards?.find((card) => card.id === item.card) } : {}), mode: got.mode },
      });
      return { got, graded };
    });
    heard = result.result.got;
    assessment = result.result.graded;
  } catch (cause) {
    if (cause instanceof TooShort) { bot.text(bot.t('speak.too_short')); return; }
    if (cause instanceof SchoodAIError) { bot.aiError(cause, !!input.voice); return; }
    throw cause;
  }
  const fluency = analyseFluency({ text: heard.scored, words: heard.words, durationSec: heard.duration }, bot.pack.fluency, level);
  const previousId = state.awaiting === 'after' ? state.lastTurnId : null;
  const turn = await saveAnswer(bot, state, item, heard, input.voice ?? null, level, assessment, fluency);
  const session = (await bot.store.session(state.sessionId))!;
  await bot.store.addScores(scoreRows(bot, session, turn, assessment));
  await learnFrom(bot, rubric, assessment);
  const minutes = Math.max(1, Math.ceil((heard.duration ?? countWords(heard.text) / 2) / 60));
  recordPractice(bot, minutes);
  emit(bot, 'turn_scored', { node: exam.node, minutes, score: assessment.overall, ref: turn.id });

  const lines = [bot.t('speak.result', { overall: overallLabel(rubric, assessment.overall) }), ...criterionLines(bot, rubric, assessment)];
  const extra = [fluencyLine(bot, fluency), timingLine(bot, heard.timing)].filter(Boolean);
  const blocks = [lines.join('\n'), extra.join('\n'), errorsBlock(bot, assessment), upgradesBlock(bot, assessment)].filter(Boolean);
  if (previousId) {
    const before = await bot.store.turn(previousId);
    if (before) blocks.push(compareRows(bot, rubric, snapshotOf(before), { overall: assessment.overall, criteria: criteriaOf(assessment), wpm: fluency.wpm, fillers: fluency.fillersPer100 }));
  }
  if (assessment.upgrades.length) blocks.push(bot.t('speak.rerecord_prompt'));
  state.awaiting = 'after';
  state.lastTurnId = turn.id;
  const drill = topDrillTag(bot, assessment);
  bot.text(blocks.join('\n\n'), [
    [{ text: bot.p('speak.rerecord'), data: 'sp:rr' }, { text: bot.p('speak.next'), data: 'sp:nx' }],
    ...(drill ? [[{ text: bot.p('write.drill', { error: pick(bot.pack.errorById.get(drill)?.name, bot.locale) }), data: `dr:${drill}` }]] : []),
    [{ text: bot.p('btn.finish'), data: 'sp:end' }],
  ]);
}

const practiceLanguage = (bot: Bot) => (bot.pack.manifest.practiceLanguage === 'mixed' ? undefined : bot.pack.manifest.practiceLanguage);

function examOf(bot: Bot, state: Speaking): Promise<SpeakingExam | undefined> {
  return Promise.resolve(speakingExams(bot).find((entry) => entry.id === state.activityId));
}

async function transcribeOnly(bot: Bot, voice: VoiceEvent, reference: string, limit?: number): Promise<Heard> {
  const { transcript } = await bot.ctx.ai.transcribe({ key: keyOf(bot.pack, 'turn'), audio: bytesOf(voice.audio), mime: voice.mime || 'audio/ogg', language: practiceLanguage(bot), reference });
  return { text: transcript.text, scored: heardText(transcript.text, transcript.words, limit), words: transcript.words, duration: transcript.durationSec ?? voice.duration, mode: 'voice', timing: {} };
}

function metricsOf(fluency: FluencyMetrics, lexis: ReturnType<typeof analyseLexis>, assessment?: Assessment) {
  return {
    words: fluency.words, seconds: fluency.seconds, wpm: fluency.wpm, fillersPerMinute: fluency.fillersPerMinute, fillersPer100: fluency.fillersPer100, longPauses: fluency.longPauses,
    longestPause: fluency.longestPause, meanRunWords: fluency.meanRunWords, repetitions: fluency.repetitions, timed: fluency.timed, range: lexis.range, distinct: lexis.distinct,
    ...(assessment ? { overall: assessment.overall, criteria: criteriaOf(assessment), errors: assessment.errors.map((error) => error.tag), upgrades: assessment.upgrades.length } : {}),
  };
}
const snapshotOf = (turn: Turn) => ({
  overall: (turn.metrics.overall ?? null) as number | null, criteria: (turn.metrics.criteria ?? {}) as Record<string, number | null>,
  wpm: (turn.metrics.wpm ?? null) as number | null, fillers: (turn.metrics.fillersPer100 ?? null) as number | null,
});

async function saveAnswer(bot: Bot, state: Speaking, item: SpeakItem, heard: Heard, voice: VoiceEvent | null, level: number | null, assessment?: Assessment, measured?: FluencyMetrics): Promise<Turn> {
  const fluency = measured ?? analyseFluency({ text: heard.scored, words: heard.words, durationSec: heard.duration }, bot.pack.fluency, level);
  const terms = bot.pack.ofKind('deck').flatMap((deck) => deck.cards.map((card) => card.front));
  const lexis = analyseLexis(heard.scored, bot.pack.fluency, terms);
  const turn = await bot.store.addTurn({
    sessionId: state.sessionId, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, role: 'learner', kind: 'answer', promptRef: item.ref,
    content: heard.text, inputMode: heard.mode, clip: voice ? clipOf(bot, voice) : null,
    metrics: { ...metricsOf(fluency, lexis, assessment), ...(assessment ? { assessment } : {}) }, timing: heard.timing, keep: false,
  });
  // Engage's then-vs-now: one scored voice answer per coach a week (seams/coach-engage.ts).
  if (voice && assessment) {
    recordCoachVoice(bot.ctx, {
      pack: bot.pack.manifest.id, feature: bot.pack.manifest.feature, audio: bytesOf(voice.audio), mime: voice.mime || 'audio/ogg', transcript: heard.text,
      durationSec: heard.duration ?? voice.duration, scores: { overall: assessment.overall, ...criteriaOf(assessment) }, promptKey: item.ref,
    });
  }
  return turn;
}

/** Practice: the next question, or the end of the part. */
export async function speakingNext(bot: Bot) {
  const state = bot.state.current as Speaking;
  const exam = await examOf(bot, state);
  if (!exam) { bot.menu(); return; }
  state.index += 1;
  if (state.index < state.queue.length) { ask(bot, exam); return; }
  await finishPractice(bot, exam);
}

export async function speakingRerecord(bot: Bot) {
  const state = bot.state.current as Speaking;
  state.awaiting = 'after';
  bot.text(bot.t('speak.rerecord_prompt'));
}

/** Ends practice: the session's result from its scored answers (the last attempt at each question). */
export async function finishPractice(bot: Bot, exam?: SpeakingExam) {
  const state = bot.state.current as Speaking;
  exam ??= await examOf(bot, state);
  const session = await bot.store.session(state.sessionId);
  bot.set({ flow: 'idle' });
  if (!exam || !session) { bot.menu(); return; }
  if (state.mock) { bot.set(state); await finishMock(bot, exam); return; }
  const rubric = bot.pack.rubricById.get(exam.rubric)!;
  const turns = (await bot.store.turns(session.id)).filter((turn) => turn.role === 'learner' && turn.metrics.assessment);
  const latest = [...new Map(turns.map((turn) => [turn.promptRef, turn])).values()];
  if (!latest.length) { await bot.store.updateSession(session.id, { status: 'abandoned' }); bot.menu(); return; }
  const summary = aggregate(rubric, latest.map((turn) => ({ assessment: turn.metrics.assessment as Assessment, weight: Number(turn.metrics.words ?? 1) })));
  const minutes = latest.reduce((sum, turn) => sum + Math.max(1, Math.ceil(Number(turn.timing.talk ?? Number(turn.metrics.words ?? 30) / 2) / 60)), 0);
  await bot.store.addScores(scoreRows(bot, session, null, summary, 'aggregate'));
  await finishSession(bot, session, { overall: summary.overall, minutes, event: null, node: exam.node, credited: true, summary: sessionSummary(summary, latest) });
  bot.text(`${bot.t('speak.result', { overall: overallLabel(rubric, summary.overall) })}\n${criterionLines(bot, rubric, summary).join('\n')}`, bot.nav([bot.app(bot.p('btn.full_report'), `/session/${session.id}`)]));
}

function sessionSummary(assessment: Assessment, turns: Turn[]) {
  const mean = (key: string) => { const values = turns.map((turn) => turn.metrics[key]).filter((value): value is number => typeof value === 'number'); return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10 : null; };
  return {
    criteria: criteriaOf(assessment), evidence: Object.fromEntries(assessment.criteria.map((criterion) => [criterion.id, criterion.evidence])),
    upgrades: assessment.upgrades, errors: assessment.errors, summary: assessment.summary,
    metrics: { wpm: mean('wpm'), fillersPerMinute: mean('fillersPerMinute'), fillersPer100: mean('fillersPer100'), longPauses: mean('longPauses'), range: mean('range') },
    answers: turns.length,
  };
}

/** The mock is over: one holistic review of every answer (the `review` credit). */
export async function finishMock(bot: Bot, exam: SpeakingExam) {
  const state = bot.state.current as Speaking;
  const session = (await bot.store.session(state.sessionId)) as Session;
  const rubric = bot.pack.rubricById.get(exam.rubric)!;
  const answers = (await bot.store.turns(session.id)).filter((turn) => turn.role === 'learner');
  if (!answers.length) { bot.set({ flow: 'idle' }); bot.menu(); return; }
  bot.text(bot.t('speak.mock_scoring'));
  const level = await bot.level(exam.node);
  const items = answers.map((turn, index) => {
    const item = state.queue.find((entry) => entry.ref === turn.promptRef);
    const measured = { words: turn.metrics.words, seconds: turn.metrics.seconds, wpm: turn.metrics.wpm, longPauses: turn.metrics.longPauses, fillersPerMinute: turn.metrics.fillersPerMinute, timed: turn.metrics.timed };
    return { label: `${item?.label ?? 'Q'} ${index + 1}`, question: item?.question ?? '', answer: turn.content, fluency: measured as unknown as FluencyMetrics };
  });
  const evidence = answers.map((turn) => turn.content).join('\n\n');
  let review: Assessment;
  try {
    const input = { pack: bot.pack, rubric, explain: bot.explainIn(level), answer: evidence, fluency: null, facts: activityFacts(bot.pack, exam), now: bot.ctx.now(), task: { exam: pick(exam.title, 'en'), parts: exam.parts.map((part) => pick(part.title, 'en')), answers: items.length } };
    const result = await bot.ctx.ai.charged({ key: keyOf(bot.pack, 'review'), mode: 'json', reference: bot.reference('review') }, (charged) => assessInSession(charged, input, { messages: mockMessages({ ...input, answers: items }), evidenceSource: evidence }));
    review = result.result;
  } catch (cause) {
    state.index = state.queue.length;
    bot.aiError(cause);
    bot.text(bot.t('btn.retry'), [[{ text: bot.p('btn.retry'), data: 'sp:score' }]]);
    return;
  }
  bot.set({ flow: 'idle' });
  await bot.store.addScores(scoreRows(bot, session, null, review));
  await learnFrom(bot, rubric, review);
  const talk = answers.reduce((sum, turn) => sum + Number(turn.timing.talk ?? Number(turn.metrics.words ?? 30) / 2), 0);
  const minutes = Math.max(exam.minutes, Math.ceil(talk / 60));
  const finished = await finishSession(bot, session, { overall: review.overall, minutes, event: 'mock_finished', node: exam.node, summary: { ...sessionSummary(review, answers), mock: true } });
  const fluency = (finished.summary.metrics ?? {}) as Record<string, number | null>;
  const blocks = [
    `${bot.t('speak.mock_result', { overall: overallLabel(rubric, review.overall) })}\n${criterionLines(bot, rubric, review).join('\n')}`,
    typeof fluency.wpm === 'number' ? bot.t('speak.fluency', { wpm: fluency.wpm, min: paceFor(bot.pack.fluency, level)?.min ?? '—', max: paceFor(bot.pack.fluency, level)?.max ?? '—', pauses: fluency.longPauses ?? 0, fillers: fluency.fillersPerMinute ?? 0, filler_words: '' }) : null,
    review.summary ? `<i>${review.summary.replace(/[<>&]/g, '')}</i>` : null,
    upgradesBlock(bot, review, 3),
    bot.t('speak.estimate_note'),
  ].filter(Boolean);
  const drill = topDrillTag(bot, review);
  bot.text(blocks.join('\n\n'), [
    [bot.app(bot.p('btn.full_report'), `/session/${session.id}`)],
    ...(drill ? [[{ text: bot.p('write.drill', { error: pick(bot.pack.errorById.get(drill)?.name, bot.locale) }), data: `dr:${drill}` }]] : []),
    ...bot.pack.plan.links.slice(0, 1).map((link) => [{ text: pick(link.label, bot.locale), url: link.url }]),
    ...bot.nav(),
  ]);
}
