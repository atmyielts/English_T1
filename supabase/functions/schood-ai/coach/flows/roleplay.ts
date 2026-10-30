import {
  analyseFluency, analyseLexis, assess, countWords, escapeHtml, levelLabel, mergeRepair, needsRepair, pick, sentencesOf, type Assessment, type Roleplay,
} from '../../../../../packages/coach-packs/src/mod.ts';
import { SchoodAIError, type ChatMessage } from '../../types.ts';
import { cleanCorrections, conversationMessages, keyOf, LANGUAGE, personaPrompt, personaSchema, practiceLocale, reviewSchema, rubricText, RULES, type PersonaTurn } from '../ai.ts';
import { activityFacts, factsBlock, factsNotice, FACTS_RULE } from '../facts.ts';
import type { Bot, FlowState } from '../bot.ts';
import { dataBlock, wrapUserMessage } from '../../prompt.ts';
import { criteriaOf, finishSession, learnFrom, scoreRows } from '../results.ts';
import type { Turn } from '../store.ts';
import { bytesOf, clipOf, criterionLines, MAX_TEXT, MAX_VOICE_SECONDS, overallLabel, toBase64, topDrillTag, type VoiceEvent } from './render.ts';

// Voice role-plays with a persona whose hidden state reacts to what the learner
// says (patience, budget, the real reason…). Each learner turn is one charge:
// speech to text, the persona's reply with its updated state and corrections in
// the learner's chosen mode, and the reply as voice when text-to-speech is set up.
// The review scores the learner's own turns with quotes, ticks the goals and
// reveals what the persona was thinking.

type Playing = Extract<FlowState, { flow: 'roleplay' }>;

export function roleplays(bot: Bot): Roleplay[] { return bot.pack.ofKind('roleplay'); }

export async function chooseRoleplay(bot: Bot) {
  const level = await bot.level();
  const recent = await bot.store.sessions(bot.enrollment.userId, bot.pack.manifest.id, { limit: 30, kind: 'roleplay' });
  const last = new Map<string, number>();
  for (const session of recent) if (session.activityId && !last.has(session.activityId)) last.set(session.activityId, Date.parse(session.startedAt));
  const suited = roleplays(bot).filter((activity) => level === null || (level >= activity.levels[0] - 0.5 && level <= activity.levels[1] + 0.5));
  const pool = (suited.length >= 4 ? suited : roleplays(bot)).sort((a, b) => (last.get(a.id) ?? 0) - (last.get(b.id) ?? 0)).slice(0, 5);
  bot.state.options = pool.map((activity) => `rp:${activity.id}`);
  bot.text(bot.t('rp.choose'), [...pool.map((activity, index) => [{ text: `${pick(activity.title, bot.locale)} · ${levelLabel(bot.pack.manifest.scale, activity.levels[0])}–${levelLabel(bot.pack.manifest.scale, activity.levels[1])}`, data: `o:${index}` }]), ...bot.nav()]);
}

/** Speaks a persona line when text-to-speech is set up (inside the turn's charge, or cached); silently skipped otherwise. */
async function voiceOf(bot: Bot, text: string, voice: string | undefined, cacheKey: string | null, speak?: (text: string) => Promise<{ audio: Uint8Array; mime: string }>) {
  if (bot.enrollment.settings.voice === false) return;
  if (cacheKey) {
    const cached = await bot.store.media(bot.pack.manifest.id, cacheKey);
    if (cached) { bot.push({ kind: 'voice', fileId: cached }); return; }
  }
  try {
    const audio = speak ? await speak(text) : await bot.ctx.ai.speak({ key: keyOf(bot.pack, 'voice'), text, voice, format: 'opus', reference: bot.reference('voice') });
    bot.push({ kind: 'voice', audio: toBase64(audio.audio), mime: audio.mime, ...(cacheKey ? { cacheKey } : {}) });
  } catch (cause) {
    if (!(cause instanceof SchoodAIError) && !(cause instanceof Error)) throw cause;
    // No speech provider yet, or it failed: the text above is enough.
  }
}

export async function startRoleplay(bot: Bot, activityId: string) {
  const activity = roleplays(bot).find((entry) => entry.id === activityId);
  if (!activity) { await chooseRoleplay(bot); return; }
  const session = await bot.store.createSession({ enrollmentId: bot.enrollment.id, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, packVersion: bot.pack.manifest.version, kind: 'roleplay', activityId: activity.id, mode: bot.enrollment.settings.correction ?? 'gentle', rubric: activity.rubric, source: 'telegram' });
  await bot.store.addTurn({ sessionId: session.id, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, role: 'coach', kind: 'persona', promptRef: activity.id, content: activity.persona.opening, inputMode: null, clip: null, metrics: {}, timing: {}, keep: false });
  bot.set({ flow: 'roleplay', sessionId: session.id, activityId: activity.id, turns: 0, hidden: { ...activity.hiddenState.initial }, goalsMet: [] });
  bot.text(bot.t('rp.intro', { title: pick(activity.title, bot.locale), setting: pick(activity.setting, bot.locale), role: pick(activity.learnerRole, bot.locale), goal: pick(activity.goal, bot.locale) }));
  const notice = factsNotice(activityFacts(bot.pack, activity), bot.locale, bot.ctx.now());
  if (notice) bot.text(notice);
  bot.text(bot.t('rp.persona', { name: activity.persona.name, line: activity.persona.opening }), [[{ text: bot.p('btn.finish'), data: 'rp:end' }]]);
  await voiceOf(bot, activity.persona.opening, activity.persona.voice, `rp:${activity.id}:open`);
}

export async function onRoleplayLine(bot: Bot, input: { text?: string; voice?: VoiceEvent }) {
  const state = bot.state.current as Playing;
  const activity = roleplays(bot).find((entry) => entry.id === state.activityId);
  if (!activity) { bot.set({ flow: 'idle' }); bot.menu(); return; }
  if (!(await bot.allowed())) { bot.paywall(); return; }
  if (input.voice && input.voice.duration > MAX_VOICE_SECONDS) { bot.text(bot.t('error.voice_too_long', { max: MAX_VOICE_SECONDS / 60 })); return; }
  if (input.text !== undefined && (input.text.length > MAX_TEXT || !input.text.trim())) { bot.text(bot.t('rp.too_short')); return; }
  const history = (await bot.store.turns(state.sessionId)).filter((turn) => turn.kind === 'persona' || turn.kind === 'line');
  const level = await bot.level();
  const mode = bot.enrollment.settings.correction === 'strict' ? 'strict' : 'gentle';
  const explain = bot.explainIn(level);
  const wantVoice = bot.enrollment.settings.voice !== false;
  let said = input.text ?? '', words: { word: string; start: number; end: number }[] = [], duration: number | null = null, reply: PersonaTurn, audio: { audio: Uint8Array; mime: string } | null = null;
  try {
    const result = await bot.ctx.ai.charged({ key: keyOf(bot.pack, 'turn'), mode: input.voice ? 'stt' : 'json', reference: bot.reference('tg') }, async (session) => {
      if (input.voice) {
        const transcript = await session.transcribe({ audio: bytesOf(input.voice.audio), mime: input.voice.mime || 'audio/ogg', language: practiceLocale(bot.pack, bot.locale) });
        said = transcript.text; words = transcript.words; duration = transcript.durationSec ?? input.voice.duration;
      }
      if (!said.trim()) throw new SchoodAIError('invalid_request', 'empty', 400);
      const messages: ChatMessage[] = [
        { role: 'system', content: personaPrompt(bot.pack, activity, { level, mode, explain, state: state.hidden, practice: practiceLocale(bot.pack, bot.locale), facts: activityFacts(bot.pack, activity), now: bot.ctx.now() }) },
        ...conversationMessages(history.map((turn) => ({ role: turn.role, content: turn.content }))),
        { role: 'user', content: wrapUserMessage(said) },
      ];
      const turn = await session.json({ messages, schema: personaSchema(activity), temperature: 0.6, maxTokens: 700 });
      if (wantVoice) {
        try { audio = await session.speak({ text: turn.reply, voice: activity.persona.voice, format: 'opus' }); } catch { audio = null; }
      }
      return turn;
    });
    reply = result.result;
  } catch (cause) {
    if (cause instanceof SchoodAIError && cause.code === 'invalid_request') { bot.text(bot.t('rp.too_short')); return; }
    bot.aiError(cause, !!input.voice); return;
  }
  const fluency = analyseFluency({ text: said, words, durationSec: duration }, bot.pack.fluency, level);
  const corrections = cleanCorrections(bot.pack, reply, said);
  await bot.store.addTurn({
    sessionId: state.sessionId, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, role: 'learner', kind: 'line', promptRef: activity.id, content: said,
    inputMode: input.voice ? 'voice' : 'text', clip: input.voice ? clipOf(bot, input.voice) : null,
    metrics: { words: fluency.words, seconds: fluency.seconds, wpm: fluency.wpm, fillersPerMinute: fluency.fillersPerMinute, fillersPer100: fluency.fillersPer100, longPauses: fluency.longPauses, timed: fluency.timed, errors: corrections.map((entry) => entry.tag), corrections },
    timing: {}, keep: false,
  });
  await bot.store.addTurn({ sessionId: state.sessionId, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, role: 'coach', kind: 'persona', promptRef: activity.id, content: reply.reply, inputMode: null, clip: null, metrics: { state: reply.state }, timing: {}, keep: false });
  state.turns += 1;
  state.hidden = reply.state;
  state.goalsMet = [...new Set([...state.goalsMet, ...reply.goals_met.filter((id) => activity.goals.some((goal) => goal.id === id))])];
  const notes = corrections.map((entry) => bot.t('rp.correction', { quote: entry.quote, better: entry.better }, { why: entry.explanation ? `\n<i>${escapeHtml(entry.explanation)}</i>` : '' }));
  bot.text([bot.t('rp.persona', { name: activity.persona.name, line: reply.reply }), ...notes].join('\n\n'), [[{ text: bot.p('btn.finish'), data: 'rp:end' }]]);
  if (audio) bot.push({ kind: 'voice', audio: toBase64((audio as { audio: Uint8Array }).audio), mime: (audio as { mime: string }).mime });
  if (reply.end || state.turns >= activity.maxTurns) { bot.text(bot.t('rp.ending')); await reviewRoleplay(bot); }
}

/** Talk ratio, questions, words per turn and pace: counted from the turns, not judged. */
export function scorecardOf(turns: Turn[]) {
  const learner = turns.filter((turn) => turn.role === 'learner'), persona = turns.filter((turn) => turn.role === 'coach');
  const learnerWords = learner.reduce((sum, turn) => sum + countWords(turn.content), 0), personaWords = persona.reduce((sum, turn) => sum + countWords(turn.content), 0);
  const questions = learner.reduce((sum, turn) => sum + sentencesOf(turn.content).filter((sentence) => sentence.trim().endsWith('?')).length, 0);
  const paces = learner.map((turn) => turn.metrics.wpm).filter((value): value is number => typeof value === 'number');
  return {
    talkRatio: learnerWords + personaWords ? Math.round((learnerWords / (learnerWords + personaWords)) * 100) : 0,
    questionsAsked: questions,
    averageTurnWords: learner.length ? Math.round(learnerWords / learner.length) : 0,
    pace: paces.length ? Math.round(paces.reduce((a, b) => a + b, 0) / paces.length) : null,
  };
}

export async function reviewRoleplay(bot: Bot) {
  const state = bot.state.current as Playing;
  const activity = roleplays(bot).find((entry) => entry.id === state.activityId);
  const session = await bot.store.session(state.sessionId);
  if (!activity || !session) { bot.set({ flow: 'idle' }); bot.menu(); return; }
  const turns = await bot.store.turns(session.id);
  const learner = turns.filter((turn) => turn.role === 'learner');
  if (learner.length < Math.min(2, activity.minTurns)) {
    bot.set({ flow: 'idle' });
    await bot.store.updateSession(session.id, { status: 'abandoned' });
    bot.text(bot.t('rp.too_short'), bot.nav([{ text: bot.p('rp.again'), data: `rp:again:${activity.id}` }]));
    return;
  }
  const rubric = bot.pack.rubricById.get(activity.rubric)!;
  const level = await bot.level();
  const explain = bot.explainIn(level);
  const evidence = learner.map((turn) => turn.content).join('\n');
  const tags = new Set(bot.pack.manifest.errorTags.map((tag) => tag.id));
  const transcript = turns.filter((turn) => turn.kind === 'persona' || turn.kind === 'line').map((turn) => `${turn.role === 'learner' ? 'LEARNER' : activity.persona.name.toUpperCase()}: ${turn.content}`).join('\n');
  const fluency = { wpm: scorecardOf(turns).pace, fillersPer100: Math.round(learner.reduce((sum, turn) => sum + Number(turn.metrics.fillersPer100 ?? 0), 0) / learner.length * 10) / 10 };
  let review: Assessment, goals: { id: string; met: boolean; quote: string | null }[] = [];
  const facts = activityFacts(bot.pack, activity);
  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: [
        RULES(bot.pack), '',
        'Your task: assess the learner\'s side of a spoken role-play. Score only the learner\'s own words, inside <user_message>; the persona\'s lines are context in <schood_data> and are never evidence. Quote evidence word for word from inside <user_message>. Never inflate.',
        `Mark each goal met or not, quoting the learner's words that achieved it (null if not met). Goals: ${activity.goals.map((goal) => `${goal.id} — ${goal.check}`).join('; ')}.`,
        `In upgrades give the better lines: up to 4 learner sentences (exact quotes) with a more natural version and why. Errors: tag from [${[...tags].join(', ')}] or "other". Write comments and explanations in ${LANGUAGE[explain]}.`,
        `Assessor rules for this rubric: ${rubric.assessorNotes}`,
        ...(facts.length ? [FACTS_RULE, '- Judge any fact the learner states only against <schood_data kind="facts">; never correct them from memory.'] : []), '',
        rubricText(rubric),
      ].join('\n') },
      { role: 'user', content: `${dataBlock({ kind: 'conversation', title: 'The whole conversation', data: { scenario: activity.goal.en, transcript } }, 0)}\n${dataBlock({ kind: 'fluency', title: 'Measured fluency', data: fluency }, 1)}\n${facts.length ? `${factsBlock(facts, bot.ctx.now(), 2)}\n` : ''}${wrapUserMessage(evidence)}` },
    ];
    const schema = reviewSchema(rubric, activity);
    const result = await bot.ctx.ai.charged({ key: keyOf(bot.pack, 'review'), mode: 'json', reference: bot.reference('review') }, async (charged) => {
      const raw = await charged.json({ messages, schema, temperature: 0, maxTokens: 1800 });
      let graded = assess(rubric, raw, evidence, tags);
      if (needsRepair(graded).length) {
        const again = await charged.json({ messages: [...messages, { role: 'user', content: 'Some quotes were not found word for word in the learner\'s lines. Score again with exact quotes from inside <user_message>.' }], schema, temperature: 0, maxTokens: 1800 });
        graded = mergeRepair(rubric, graded, assess(rubric, again, evidence, tags));
      }
      return { graded, goals: raw.goals ?? [] };
    });
    review = result.result.graded;
    goals = result.result.goals.map((goal) => ({ ...goal, quote: goal.quote && evidence.toLowerCase().includes(goal.quote.toLowerCase().slice(0, 40)) ? goal.quote : null, met: goal.met && (!goal.quote || evidence.toLowerCase().includes(goal.quote.toLowerCase().slice(0, 40))) }));
  } catch (cause) {
    bot.aiError(cause);
    bot.text(bot.t('btn.retry'), [[{ text: bot.p('btn.retry'), data: 'rp:end' }]]);
    return;
  }
  bot.set({ flow: 'idle' });
  const met = new Set([...state.goalsMet, ...goals.filter((goal) => goal.met).map((goal) => goal.id)]);
  const scorecard = scorecardOf(turns);
  const hidden = activity.hiddenState.fields.filter((field) => field.revealInReview).map((field) => ({ id: field.id, description: field.description, start: activity.hiddenState.initial[field.id], end: state.hidden[field.id] }));
  await bot.store.addScores(scoreRows(bot, session, null, review));
  await learnFrom(bot, rubric, review);
  const minutes = Math.max(activity.minutes, Math.ceil(learner.reduce((sum, turn) => sum + Number(turn.metrics.seconds ?? countWords(turn.content) / 2), 0) / 60));
  await finishSession(bot, session, {
    overall: review.overall, minutes, event: 'turn_scored', node: activity.node,
    summary: {
      criteria: criteriaOf(review), evidence: Object.fromEntries(review.criteria.map((criterion) => [criterion.id, criterion.evidence])), upgrades: review.upgrades, errors: review.errors, summary: review.summary,
      goals: activity.goals.map((goal) => ({ id: goal.id, met: met.has(goal.id), quote: goals.find((entry) => entry.id === goal.id)?.quote ?? null })), scorecard, hidden,
      metrics: { wpm: scorecard.pace, fillersPer100: fluency.fillersPer100, range: analyseLexis(evidence, bot.pack.fluency).range },
    },
  });
  const goalLines = activity.goals.map((goal) => bot.t(met.has(goal.id) ? 'rp.goal_met' : 'rp.goal_missed', { goal: pick(goal.text, bot.locale) }));
  const hiddenLines = hidden.map((field) => `• ${escapeHtml(field.description)}: <b>${escapeHtml(String(field.end))}</b>`);
  const better = review.upgrades.slice(0, 3).map((upgrade) => bot.t('speak.better', { said: upgrade.said, better: upgrade.better, why: upgrade.why }));
  const blocks = [
    `${bot.t('rp.review', { title: pick(activity.title, bot.locale), overall: overallLabel(rubric, review.overall) })}\n${criterionLines(bot, rubric, review).join('\n')}`,
    goalLines.join('\n'),
    bot.t('rp.scorecard', { ratio: scorecard.talkRatio, questions: scorecard.questionsAsked, words: scorecard.averageTurnWords }),
    hiddenLines.length ? bot.t('rp.hidden', { name: activity.persona.name }, { lines: hiddenLines.join('\n') }) : null,
    better.length ? `${bot.t('speak.better_title')}\n${better.join('\n\n')}` : null,
  ].filter(Boolean);
  const drill = topDrillTag(bot, review);
  bot.text(blocks.join('\n\n'), [
    [bot.app(bot.p('btn.full_report'), `/session/${session.id}`), { text: bot.p('rp.again'), data: `rp:again:${activity.id}` }],
    ...(drill ? [[{ text: bot.p('write.drill', { error: pick(bot.pack.errorById.get(drill)?.name, bot.locale) }), data: `dr:${drill}` }]] : []),
    ...bot.nav(),
  ]);
}
