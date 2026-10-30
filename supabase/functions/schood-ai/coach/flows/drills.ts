import { answerMatches, escapeHtml, pick, recurringErrors, shadowMatch, type Drill, type Shadowing } from '../../../../../packages/coach-packs/src/mod.ts';
import { SchoodAIError } from '../../types.ts';
import { checkDrillItems, drillMessages, drillSchema, keyOf } from '../ai.ts';
import type { Bot, FlowState, InlineItem } from '../bot.ts';
import { finishSession, learnAccuracy, recordPractice } from '../results.ts';
import { bytesOf, clipOf, toBase64, type VoiceEvent } from './render.ts';

// Drills on the learner's recurring errors (authored items first; five fresh,
// checked items made by AI when those run out), and pronunciation shadowing:
// listen, repeat, and see how much of the sentence speech recognition heard.

type DrillFlow = Extract<FlowState, { flow: 'drill' }>;
type ShadowFlow = Extract<FlowState, { flow: 'shadow' }>;
const LETTERS = ['A', 'B', 'C', 'D'];
const PER_SESSION = 6;

export const drills = (bot: Bot): Drill[] => bot.pack.ofKind('drill');

export async function chooseDrill(bot: Bot) {
  const recurring = recurringErrors([...(await bot.mastery()).values()], bot.ctx.now()).filter((error) => bot.pack.errorById.get(error.tag)?.drill);
  const pool = recurring.length ? recurring.map((error) => error.tag) : drills(bot).map((drill) => drill.errorTag);
  const tags = [...new Set(pool)].slice(0, 6);
  bot.state.options = tags.map((tag) => `drill:${tag}`);
  bot.text(recurring.length ? bot.t('drill.choose') : `${bot.t('drill.none')}\n\n${bot.t('drill.choose')}`, [
    ...tags.map((tag, index) => [{ text: `${recurring.some((error) => error.tag === tag) ? '🔁 ' : ''}${pick(bot.pack.errorById.get(tag)?.name, bot.locale)}`, data: `o:${index}` }]),
    ...bot.nav(),
  ]);
}

const inline = (bot: Bot, drill: Drill, ids: string[]): InlineItem[] => drill.items.filter((item) => ids.includes(item.id)).map((item) => ({ id: item.id, prompt: item.prompt, options: item.options, answer: item.answer, explanation: pick(item.explanation, bot.locale) }));

export async function startDrill(bot: Bot, tag: string, fresh: InlineItem[] | null = null) {
  const drill = drills(bot).find((entry) => entry.errorTag === tag);
  if (!drill) { await chooseDrill(bot); return; }
  const recent = new Set(bot.state.recent?.items ?? []);
  let items = fresh;
  if (!items) {
    const unseen = drill.items.filter((item) => !recent.has(`${drill.id}:${item.id}`));
    if (unseen.length < 3 && drill.aiVariants && !fresh) {
      bot.state.options = [`drill-fresh:${tag}`, `drill-repeat:${tag}`];
      bot.text(bot.t('drill.fresh_offer'), [[{ text: `${bot.p('drill.fresh')} · ${bot.p('cost', { count: 2 })}`, data: 'o:0' }, { text: bot.p('btn.retry'), data: 'o:1' }], ...bot.nav()]);
      return;
    }
    const chosen = (unseen.length >= 3 ? unseen : drill.items).slice(0, PER_SESSION).map((item) => item.id);
    items = inline(bot, drill, chosen);
  }
  const session = await bot.store.createSession({ enrollmentId: bot.enrollment.id, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, packVersion: bot.pack.manifest.version, kind: 'drill', activityId: drill.id, mode: fresh ? 'fresh' : null, rubric: null, source: 'telegram' });
  bot.set({ flow: 'drill', sessionId: session.id, activityId: drill.id, items, index: 0, correct: 0, tag });
  bot.state.recent = { ...bot.state.recent, items: [...items.map((item) => `${drill.id}:${item.id}`), ...(bot.state.recent?.items ?? [])].slice(0, 120) };
  bot.text(bot.t('drill.intro', { error: pick(bot.pack.errorById.get(tag)?.name, bot.locale), explain: pick(drill.explain, bot.locale) }));
  askItem(bot);
}

/** Repeats the authored items even though they were seen recently. */
export async function repeatDrill(bot: Bot, tag: string) {
  const drill = drills(bot).find((entry) => entry.errorTag === tag);
  if (!drill) { await chooseDrill(bot); return; }
  await startDrill(bot, tag, inline(bot, drill, drill.items.slice(0, PER_SESSION).map((item) => item.id)));
}

/** Five new items for this error, made by AI and checked like T2 keys (the `drill` credit). */
export async function freshDrill(bot: Bot, tag: string) {
  const error = bot.pack.errorById.get(tag);
  if (!error) { await chooseDrill(bot); return; }
  if (!(await bot.allowed())) { bot.paywall(); return; }
  const level = await bot.level(error.node);
  const explain = bot.explainIn(level);
  const examples = (await bot.store.learnerTurns(bot.enrollment.userId, bot.pack.manifest.id, new Date(bot.ctx.now().getTime() - 30 * 86_400_000).toISOString()))
    .flatMap((turn) => (turn.metrics.assessment as { errors?: { quote: string; tag: string }[] } | undefined)?.errors ?? []).filter((entry) => entry.tag === tag).map((entry) => entry.quote);
  let items: InlineItem[];
  try {
    const result = await bot.ctx.ai.charged({ key: keyOf(bot.pack, 'drill'), mode: 'json', reference: bot.reference('drill') }, async (session) => {
      const made = await session.json({ messages: drillMessages(bot.pack, { id: tag, name: pick(error.name, 'en'), explain: pick(error.explain, 'en') }, examples, level, explain), schema: drillSchema, temperature: 0.7, maxTokens: 2000 });
      const checked = checkDrillItems(made.items);
      // Too few items passed the checks: refunded rather than serving a broken drill.
      if (checked.length < 3) throw new SchoodAIError('ai_failed', 'Generated items failed the checks.', 502, { reason: 'checks' });
      return checked;
    });
    items = result.result.slice(0, 5).map((item, index) => ({ id: `ai${index + 1}`, prompt: item.prompt, options: item.options, answer: item.answer, explanation: item.explanation }));
  } catch (cause) { bot.aiError(cause); return; }
  await startDrill(bot, tag, items);
}

function askItem(bot: Bot) {
  const state = bot.state.current as DrillFlow;
  const item = state.items[state.index];
  const head = bot.t('drill.item', { n: state.index + 1, total: state.items.length, prompt: item.prompt });
  if (typeof item.answer === 'number' && item.options) {
    const long = item.options.some((option) => option.length > 30);
    const body = long ? `\n${item.options.map((option, i) => `<b>${LETTERS[i]}</b>. ${escapeHtml(option)}`).join('\n')}` : '';
    bot.text(`${head}${body}`, long ? [item.options.map((_, i) => ({ text: LETTERS[i], data: `a:${state.index}:${i}` }))] : item.options.map((option, i) => [{ text: option, data: `a:${state.index}:${i}` }]));
    return;
  }
  bot.text(`${head}\n\n${bot.t('drill.type')}`);
}

export async function onDrillAnswer(bot: Bot, input: { index?: number; choice?: number; text?: string }) {
  const state = bot.state.current as DrillFlow;
  if (input.index !== undefined && input.index !== state.index) return;
  const item = state.items[state.index];
  if (!item) return;
  let right: boolean, answer: string;
  if (typeof item.answer === 'number') {
    if (input.choice === undefined) { askItem(bot); return; }
    right = input.choice === item.answer; answer = item.options?.[item.answer] ?? '';
    bot.clearButtons = true;
  } else {
    if (input.text === undefined) return;
    right = answerMatches(input.text, item.answer); answer = item.answer[0];
  }
  if (right) state.correct += 1;
  bot.text(right ? bot.t('drill.right', { explanation: item.explanation }) : bot.t('drill.wrong', { answer, explanation: item.explanation }));
  state.index += 1;
  if (state.index < state.items.length) { askItem(bot); return; }
  bot.set({ flow: 'idle' });
  const drill = drills(bot).find((entry) => entry.id === state.activityId)!;
  const session = (await bot.store.session(state.sessionId))!;
  const accuracy = state.correct / state.items.length;
  await finishSession(bot, session, { overall: null, minutes: drill.minutes, event: 'drill_finished', node: drill.node, score: Math.round(accuracy * 100), summary: { correct: state.correct, total: state.items.length, tag: state.tag, items: state.items.map((entry) => entry.id) } });
  await learnAccuracy(bot, drill.node, accuracy, { tag: state.tag, correct: state.correct });
  bot.text(bot.t('drill.done', { correct: state.correct, total: state.items.length, error: pick(bot.pack.errorById.get(state.tag)?.name, bot.locale) }), bot.nav([{ text: `🎯 ${bot.p('btn.next')}`, data: 'm:drill' }]));
}

// --- shadowing -------------------------------------------------------------------------------------------------

export const shadowSets = (bot: Bot): Shadowing[] => bot.pack.ofKind('shadowing');

export async function startShadow(bot: Bot, activityId?: string) {
  const level = await bot.level();
  const sets = shadowSets(bot);
  const set = (activityId ? sets.find((entry) => entry.id === activityId) : undefined)
    ?? sets.find((entry) => level !== null && level >= entry.levels[0] && level < entry.levels[1]) ?? sets.find((entry) => level !== null && level <= entry.levels[1]) ?? sets[0];
  if (!set) { bot.menu(); return; }
  const recent = new Set(bot.state.recent?.items ?? []);
  const unseen = set.sentences.filter((sentence) => !recent.has(`${set.id}:${sentence.id}`));
  const chosen = (unseen.length >= 5 ? unseen : set.sentences).slice(0, 5).map((sentence) => sentence.id);
  const session = await bot.store.createSession({ enrollmentId: bot.enrollment.id, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, packVersion: bot.pack.manifest.version, kind: 'shadowing', activityId: set.id, mode: null, rubric: null, source: 'telegram' });
  bot.set({ flow: 'shadow', sessionId: session.id, activityId: set.id, sentences: chosen, index: 0, scores: [] });
  bot.state.recent = { ...bot.state.recent, items: [...chosen.map((id) => `${set.id}:${id}`), ...(bot.state.recent?.items ?? [])].slice(0, 120) };
  await sendSentence(bot, set);
}

async function sendSentence(bot: Bot, set: Shadowing) {
  const state = bot.state.current as ShadowFlow;
  const sentence = set.sentences.find((entry) => entry.id === state.sentences[state.index])!;
  bot.text(bot.t('sh.sentence', { n: state.index + 1, total: state.sentences.length, text: sentence.text, focus: pick(sentence.focus, bot.locale) }), [[bot.app(bot.p('sh.listen_in_app'), `/shadow/${set.id}/${sentence.id}`)], [{ text: bot.p('btn.finish'), data: 'sh:end' }]]);
  const cacheKey = `sh:${sentence.id}`.slice(0, 120);
  const cached = await bot.store.media(bot.pack.manifest.id, cacheKey);
  if (cached) { bot.push({ kind: 'voice', fileId: cached }); return; }
  try {
    const audio = await bot.ctx.ai.speak({ key: keyOf(bot.pack, 'voice'), text: sentence.text, format: 'opus', reference: bot.reference('model') });
    bot.push({ kind: 'voice', audio: toBase64(audio.audio), mime: audio.mime, cacheKey });
  } catch {
    // Without a speech provider the Mini App plays the sentence with the browser's voice (button above).
  }
}

export async function onShadowVoice(bot: Bot, voice: VoiceEvent | null) {
  const state = bot.state.current as ShadowFlow;
  const set = shadowSets(bot).find((entry) => entry.id === state.activityId);
  if (!set) { bot.set({ flow: 'idle' }); bot.menu(); return; }
  if (!voice) { bot.text(bot.t('sh.voice_needed')); return; }
  if (!(await bot.allowed())) { bot.paywall(); return; }
  const sentence = set.sentences.find((entry) => entry.id === state.sentences[state.index])!;
  let heard: string;
  try {
    heard = (await bot.ctx.ai.charged({ key: keyOf(bot.pack, 'shadow'), mode: 'stt', reference: bot.reference('shadow') }, async (session) => (await session.transcribe({ audio: bytesOf(voice.audio), mime: voice.mime || 'audio/ogg', language: 'en' })).text)).result;
  } catch (cause) { bot.aiError(cause, true); return; }
  const match = shadowMatch(sentence.text, heard);
  await bot.store.addTurn({ sessionId: state.sessionId, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, role: 'learner', kind: 'shadow', promptRef: sentence.id, content: heard, inputMode: 'voice', clip: clipOf(bot, voice), metrics: { score: match.score, missed: match.missed }, timing: { talk: voice.duration }, keep: false });
  state.scores.push(match.score);
  recordPractice(bot, 1);
  bot.text(bot.t('sh.result', { score: match.score }, { missed: match.missed.length ? bot.t('sh.missed', { words: match.missed.slice(0, 6).join(', ') }) : '' }));
  state.index += 1;
  if (state.index < state.sentences.length) { await sendSentence(bot, set); return; }
  await finishShadow(bot);
}

export async function finishShadow(bot: Bot) {
  const state = bot.state.current as ShadowFlow;
  bot.set({ flow: 'idle' });
  const set = shadowSets(bot).find((entry) => entry.id === state.activityId);
  const session = await bot.store.session(state.sessionId);
  if (!set || !session || !state.scores.length) { if (session) await bot.store.updateSession(session.id, { status: 'abandoned' }); bot.menu(); return; }
  const average = Math.round(state.scores.reduce((a, b) => a + b, 0) / state.scores.length);
  await finishSession(bot, session, { overall: null, minutes: Math.max(1, state.scores.length), event: 'drill_finished', node: set.node, score: average, credited: true, summary: { scores: state.scores, average } });
  await learnAccuracy(bot, set.node, average / 100);
  bot.text(bot.t('sh.done', { score: average }), bot.nav([{ text: `🔁 ${bot.p('btn.next')}`, data: 'm:shadowing' }]));
}
