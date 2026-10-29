import { s } from '../../../../packages/ai-core/src/mod.ts';
import { record, text } from '../input.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { audioFrom, learnerInput, receipt, requireLearner, store, systemFor, today, track } from './common.ts';
import { DRILL_PER_DAY, DRILL_SENTENCES, type DrillSentence } from './data/speaking.ts';
import { loadProfile } from './tutor.ts';

// L13 Pronunciation coach: read a sentence aloud; speech recognition (the
// provider's when configured, otherwise the browser's) says which words came
// through. Word-level feedback is a deterministic alignment of what was expected
// with what was heard; a short tip for the missed words is one pronunciation.drill.
// A daily set of five sentences, and a streak of days with three passed.

export const PASS = 80;
const DAY_GOAL = 3;
const tokens = (value: string) => value.toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9'\s]+/g, ' ').split(/\s+/).filter(Boolean);

export type WordStatus = 'ok' | 'missed' | 'changed';
/** Aligns expected words with heard words (longest common subsequence); a missed word next to an extra heard word is "changed". */
export function alignWords(expected: string, heard: string): { words: { word: string; status: WordStatus; heard: string | null }[]; score: number } {
  const want = tokens(expected), got = tokens(heard);
  const table = Array.from({ length: want.length + 1 }, () => new Array<number>(got.length + 1).fill(0));
  for (let i = want.length - 1; i >= 0; i--) for (let j = got.length - 1; j >= 0; j--) table[i][j] = want[i] === got[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  type Op = { type: 'match'; w: string; h: string } | { type: 'del'; w: string } | { type: 'ins'; h: string };
  const ops: Op[] = [];
  let i = 0, j = 0;
  while (i < want.length && j < got.length) {
    if (want[i] === got[j]) { ops.push({ type: 'match', w: want[i], h: got[j] }); i++; j++; }
    else if (table[i + 1][j] >= table[i][j + 1]) ops.push({ type: 'del', w: want[i++] });
    else ops.push({ type: 'ins', h: got[j++] });
  }
  while (i < want.length) ops.push({ type: 'del', w: want[i++] });
  while (j < got.length) ops.push({ type: 'ins', h: got[j++] });
  const words: { word: string; status: WordStatus; heard: string | null }[] = [];
  const extra: string[] = [];
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    if (op.type === 'match') { extra.length = 0; words.push({ word: op.w, status: 'ok', heard: op.h }); }
    else if (op.type === 'ins') extra.push(op.h);
    else if (extra.length) words.push({ word: op.w, status: 'changed', heard: extra.shift()! });
    else if (ops[k + 1]?.type === 'ins') { words.push({ word: op.w, status: 'changed', heard: (ops[k + 1] as { h: string }).h }); k++; }
    else words.push({ word: op.w, status: 'missed', heard: null });
  }
  const ok = words.filter((entry) => entry.status === 'ok').length;
  return { words, score: want.length ? Math.round((ok / want.length) * 100) : 0 };
}

const LEVELS: DrillSentence['level'][] = ['A2', 'B1', 'B2', 'C1'];
const nearLevel = (level: string): DrillSentence['level'][] => {
  const mapped = level === 'A1' ? 'A2' : level === 'C2' ? 'C1' : level;
  const index = Math.max(0, LEVELS.indexOf(mapped as DrillSentence['level']));
  return LEVELS.slice(Math.max(0, index - 1), index + 2);
};
const hash = (value: string) => [...value].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
/** Five sentences for this learner today, the same all day. */
export function dailySet(userId: string, day: string, level: string): DrillSentence[] {
  const pool = DRILL_SENTENCES.filter((sentence) => nearLevel(level).includes(sentence.level));
  const seed = hash(`${userId}:${day}`);
  return [...pool].sort((a, b) => hash(`${seed}:${a.id}`) - hash(`${seed}:${b.id}`)).slice(0, DRILL_PER_DAY);
}

async function history(ctx: RequestContext) {
  const rows = await store(ctx).activity(ctx.user.id, { kinds: ['pronunciation'], since: new Date(ctx.now().getTime() - 120 * 86_400_000).toISOString(), limit: 2000 });
  const byDay = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const day = String(row.summary.day ?? row.createdAt.slice(0, 10)), id = String(row.summary.sentence ?? '');
    const scores = byDay.get(day) ?? new Map<string, number>();
    scores.set(id, Math.max(scores.get(id) ?? 0, Number(row.score ?? 0)));
    byDay.set(day, scores);
  }
  return byDay;
}
/** Consecutive days (ending today, or yesterday if today is not done yet) with three passed sentences. */
export function streakFrom(byDay: Map<string, Map<string, number>>, day: string): number {
  const passed = (d: string) => [...(byDay.get(d)?.values() ?? [])].filter((score) => score >= PASS).length >= DAY_GOAL;
  let cursor = new Date(`${day}T12:00:00Z`), count = 0;
  if (!passed(day)) cursor = new Date(cursor.getTime() - 86_400_000);
  while (passed(cursor.toISOString().slice(0, 10))) { count++; cursor = new Date(cursor.getTime() - 86_400_000); }
  return count;
}

async function levelOf(ctx: RequestContext): Promise<string> {
  try { const profile = await loadProfile(ctx); if (typeof profile?.cefr_estimate === 'string') return profile.cefr_estimate; } catch { /* default */ }
  return 'B1';
}

// GET learner/pronunciation: today's five sentences, what is done, the streak.
export async function pronunciationToday(ctx: RequestContext) {
  await ctx.workspace();
  const day = today(ctx.now()), level = ctx.query.get('level') ?? await levelOf(ctx);
  const byDay = await history(ctx);
  const done = Object.fromEntries(byDay.get(day) ?? []);
  return { day, level, sentences: dailySet(ctx.user.id, day, level).map((sentence) => ({ id: sentence.id, text: sentence.text, focus: sentence.focus, level: sentence.level })), done, goal: DAY_GOAL, pass: PASS, streak: streakFrom(byDay, day) };
}

const TIPS_SCHEMA = s.object({ tips: s.array(s.object({ word: s.string({ max: 40 }), tip: s.string({ max: 300 }) }), { max: 3 }), encouragement: s.string({ max: 200 }) });

// POST learner/pronunciation-check { sentence_id, transcript? | audio+mime }
export async function pronunciationCheck(ctx: RequestContext) {
  const body = record(await ctx.body());
  const sentence = DRILL_SENTENCES.find((entry) => entry.id === body.sentence_id);
  if (!sentence) throw new SchoodAIError('invalid_request', 'Unknown sentence.', 400, { field: 'sentence_id' });
  const audio = audioFrom(body);
  const transcript = audio ? null : text(body.transcript, 'transcript', { max: 600 });
  const access = await requireLearner(ctx, audio ? 'pronunciation.drill' : 'L13');
  const day = today(ctx.now());
  const reference = `pronounce:${sentence.id}:${ctx.idempotencyKey ?? crypto.randomUUID()}`;
  /** The tip request for the words that did not come through, or null when all did. */
  const tipsRequest = (spoken: string, words: ReturnType<typeof alignWords>['words']) => {
    const missed = words.filter((entry) => entry.status !== 'ok');
    if (!missed.length) return null;
    return {
      schema: TIPS_SCHEMA, maxTokens: 600, temperature: 0.3,
      messages: [
        { role: 'system' as const, content: systemFor(ctx, access, { name: 'Pronunciation coach', instructions: [
          `The learner read a sentence aloud (focus: ${sentence.focus}). Speech recognition did not catch some words, which usually means they were pronounced unclearly.`,
          'For up to 3 of those words give one practical tip each (mouth position, stress, a similar word they know). encouragement: one short line. Do not claim certainty about sounds you cannot hear.',
        ] }) },
        { role: 'user' as const, content: learnerInput({ sentence: sentence.text, heard: spoken, not_caught: missed.map((entry) => ({ word: entry.word, heard_instead: entry.heard })) }) },
      ],
    };
  };

  let heard: string, aligned: ReturnType<typeof alignWords>, tips: { tips: { word: string; tip: string }[]; encouragement: string } | null = null;
  let charge: { credits: number; balance?: number } = { credits: 0 }, pauses: number | null = null;
  if (audio) {
    const out = await ctx.ai.charged({ key: 'pronunciation.drill', mode: 'stt', reference }, async (session) => {
      const result = await session.transcribe({ audio: audio.audio, mime: audio.mime, language: 'en' });
      const spoken = result.text.trim();
      const alignment = alignWords(sentence.text, spoken);
      const request = tipsRequest(spoken, alignment.words);
      return {
        spoken, alignment, tips: request ? await session.json(request) : null,
        gaps: result.words.length ? result.words.slice(1).filter((word, index) => word.start - result.words[index].end > 0.8).length : null,
      };
    });
    heard = out.result.spoken; aligned = out.result.alignment; tips = out.result.tips; pauses = out.result.gaps;
    charge = receipt(out);
  } else {
    // Browser recognition: the alignment is free; only a tip is charged.
    heard = transcript!;
    aligned = alignWords(sentence.text, heard);
    const request = tipsRequest(heard, aligned.words);
    if (request) {
      const out = await ctx.ai.json({ key: 'pronunciation.drill', reference, ...request });
      tips = out.data;
      charge = receipt(out);
    }
  }
  const before = await history(ctx);
  const passedBefore = [...(before.get(day)?.values() ?? [])].filter((score) => score >= PASS).length;
  const passed = aligned.score >= PASS;
  const firstPassToday = passed && (before.get(day)?.get(sentence.id) ?? 0) < PASS;
  track(ctx, access, {
    feature: 'L13', kind: 'pronunciation', score: aligned.score, minutes: 0,
    summary: { day, sentence: sentence.id, focus: sentence.focus, missed: aligned.words.filter((entry) => entry.status !== 'ok').map((entry) => entry.word).slice(0, 5) },
    event: { kind: passed ? 'check_passed' : 'check_failed', skill: `pronunciation.${sentence.focus}`, score: aligned.score, verified_minutes: passed ? 1 : 0, ref: `${day}:${sentence.id}` },
  });
  const dayDone = firstPassToday && passedBefore + 1 === DAY_GOAL;
  if (dayDone) ctx.events.emit({ kind: 'drill_finished', area: 'learner', feature: 'L13', skill: 'pronunciation.daily', verified_minutes: 3, score: 100, ref: day });
  const scores = new Map(before.get(day) ?? []);
  scores.set(sentence.id, Math.max(scores.get(sentence.id) ?? 0, aligned.score));
  before.set(day, scores);
  return { sentence_id: sentence.id, heard, score: aligned.score, passed, words: aligned.words, pauses, tips: tips?.tips ?? [], encouragement: tips?.encouragement ?? null, day_done: dayDone, streak: streakFrom(before, day), ...charge };
}

export const pronunciationRoutes = {
  pronunciation: { GET: pronunciationToday },
  'pronunciation-check': { POST: pronunciationCheck, maxBody: 4_500_000 },
};
