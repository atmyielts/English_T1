import { s } from '../../../../packages/ai-core/src/mod.ts';
import { meetingLevel } from '../../_shared/english-duel.ts';
import { record, text } from '../input.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { isCefr, learnerInput, receipt, requireLearner, store, systemFor, type Cefr } from './common.ts';
import { APP_URL, type DuelQuestion, type DuelRow, type EnglishDuelState } from './store.ts';
import { loadProfile } from './tutor.ts';

// L17 Challenge a friend: an AI-made 10-question duel on a topic, at the level
// between the two players, played with Schood English's existing duels
// (english_duels, the hub /duel page, the student bot's duel_<code> start link
// and the Mini App), so the clock, scoring, XP and Telegram results are theirs.
// The quiz is made (and paid) by the challenger; the invited friend plays it with
// no model call, so it is free for them and gives them no other AI use. The
// friend's sign-up link carries the challenger's referral code (referrals).

const QUESTIONS = s.object({
  questions: s.array(s.object({ prompt: s.string({ min: 5, max: 220 }), options: s.array(s.string({ min: 1, max: 40 }), { min: 4, max: 4 }), answer_index: s.number({ min: 0, max: 3, integer: true }) }), { min: 10, max: 14 }),
});

/** Ten fair questions: four distinct options, one key, the answer not spelled out in the prompt. */
export function duelQuestions(raw: { prompt: string; options: string[]; answer_index: number }[], level: Cefr): DuelQuestion[] {
  const seen = new Set<string>();
  return raw.filter((question) => {
    const options = question.options.map((option) => option.trim().toLowerCase());
    const prompt = question.prompt.trim().toLowerCase();
    if (new Set(options).size !== 4 || seen.has(prompt)) return false;
    if (options[question.answer_index].length > 3 && prompt.includes(options[question.answer_index])) return false;
    seen.add(prompt);
    return true;
  }).slice(0, 10).map((question) => ({ prompt: question.prompt.trim(), options: question.options.map((option) => option.trim()), correct_index: question.answer_index, side: 'shared' as const, level }));
}

const links = (ctx: RequestContext, code: string, referral: string | null, created: { webUrl?: string; botUrl?: string } = {}) => {
  // The referral code is public (it is how sign-ups are attributed), never student data.
  const landing = `${APP_URL.replace(/\/$/, '')}/duel/${code}${referral ? `?ref=${encodeURIComponent(referral)}` : ''}`;
  return {
    landing,
    bot: created.botUrl ?? `https://t.me/schoodstudentbot?start=duel_${code}`,
    web: created.webUrl ?? `https://english.schood.online/duel/${code}`,
    // A new friend signs up through the challenger's referral code, then lands back on the duel.
    signup: `https://schood.online/auth?mode=signup${referral ? `&ref=${encodeURIComponent(referral)}` : ''}&returnTo=${encodeURIComponent(landing)}`,
    share: `https://t.me/share/url?url=${encodeURIComponent(landing)}`,
  };
};

// POST learner/duel-create { topic, friend_level? }
export async function createDuel(ctx: RequestContext) {
  return makeDuel(ctx, record(await ctx.body()));
}
/** Makes the quiz (charged duel.quiz), then the English duel and its links. */
export async function makeDuel(ctx: RequestContext, body: Record<string, unknown>) {
  const access = await requireLearner(ctx, 'duel.quiz');
  const topic = text(body.topic, 'topic', { max: 80 });
  let mine: Cefr | null = null;
  try { const profile = await loadProfile(ctx); mine = isCefr(profile?.cefr_estimate) ? profile!.cefr_estimate as Cefr : null; } catch { mine = null; }
  const friend = isCefr(body.friend_level) ? body.friend_level : null;
  const level = meetingLevel(mine, friend) as Cefr;
  const out = await ctx.ai.charged({ key: 'duel.quiz', mode: 'json' }, async (session) => {
    const data = await session.json({
      schema: QUESTIONS, maxTokens: 2000, temperature: 0.7,
      messages: [
        { role: 'system', content: systemFor(ctx, access, { name: 'Duel quiz maker', instructions: [
          `Write 12 quick multiple-choice English questions on the learner's topic at CEFR ${level}: vocabulary, phrases and grammar, each answerable in under 6 seconds.`,
          'Each question: a prompt of at most 200 characters, exactly 4 short options (at most 30 characters each, they must fit on a phone button), exactly one correct (answer_index 0-3). Write the questions in English. No trick questions, nothing unsafe or rude.',
        ] }) },
        { role: 'user', content: learnerInput({ topic, level }) },
      ],
    });
    const questions = duelQuestions(data.questions, level);
    if (questions.length < 10) throw new SchoodAIError('ai_failed', 'The quiz did not pass its checks. Your credits were returned.', 502);
    return questions;
  });
  const created = await store(ctx).createEnglishDuel(ctx.user.id, { questions: out.result, locale: ctx.locale, channel: ctx.user.via === 'service' ? 'telegram' : 'web' });
  const referral = await store(ctx).referralCode(ctx.user.id).catch(() => null);
  await store(ctx).saveDuel({ duelId: created.duelId, code: created.code, creatorId: ctx.user.id, workspaceId: access.workspace.id, topic, level, referralCode: referral });
  return { duel: { code: created.code, topic, level, links: links(ctx, created.code, referral, created) }, ...receipt(out) };
}

const winStreak = (rows: { row: DuelRow; state: EnglishDuelState | null }[], userId: string) => {
  let streak = 0;
  for (const { state } of rows) {
    if (!state || state.status !== 'finished') continue;
    if (state.winnerId !== userId) break;
    streak++;
  }
  return streak;
};

// GET learner/duels: my AI duels with their results and my win streak.
export async function myDuels(ctx: RequestContext) {
  const access = await ctx.workspace();
  const rows = await store(ctx).duels(ctx.user.id, 20);
  const withState = await Promise.all(rows.map(async (row) => ({ row, state: await store(ctx).englishDuel(row.code).catch(() => null) })));
  for (const { row, state } of withState) {
    // A finished duel counts once as practice for the challenger.
    if (state?.status === 'finished' && !row.scoredAt && await store(ctx).markDuelScored(row.duelId, ctx.now().toISOString())) {
      const me = state.players.find((player) => player.userId === ctx.user.id);
      if (me) ctx.events.emit({ kind: 'drill_finished', area: 'learner', feature: 'L17', skill: 'duel.vocabulary', score: me.correct * 10, verified_minutes: 1, outcome: state.winnerId === ctx.user.id ? 'win' : state.winnerId ? 'loss' : 'draw', ref: row.duelId });
      if (me) void store(ctx).addActivity([{ userId: ctx.user.id, workspaceId: access.workspace.id, feature: 'L17', kind: 'duel', score: me.correct, summary: { topic: row.topic, won: state.winnerId === ctx.user.id } }]);
    }
  }
  return {
    duels: withState.map(({ row, state }) => ({
      code: row.code, topic: row.topic, level: row.level, created_at: row.createdAt, status: state?.status ?? 'expired',
      result: state?.status === 'finished' ? { won: state.winnerId === ctx.user.id, draw: !state.winnerId, me: state.players.find((player) => player.userId === ctx.user.id)?.correct ?? 0, friend: state.players.find((player) => player.userId !== ctx.user.id)?.correct ?? null } : null,
      links: links(ctx, row.code, row.referralCode),
    })),
    win_streak: winStreak(withState, ctx.user.id),
  };
}

// GET learner/duel?code=: the invite as the friend sees it (no model call, no plan needed).
export async function duelInvite(ctx: RequestContext) {
  await ctx.workspace();
  const code = String(ctx.query.get('code') ?? '').toUpperCase().replace(/[\s-]+/g, '');
  if (!/^[A-HJ-NP-Z2-9]{10}$/.test(code)) throw new SchoodAIError('not_found', 'This duel was not found.', 404);
  const row = await store(ctx).duelByCode(code);
  const state = row ? await store(ctx).englishDuel(code) : null;
  if (!row || !state) throw new SchoodAIError('not_found', 'This duel was not found.', 404);
  const name = await store(ctx).displayName(row.creatorId).catch(() => null);
  return {
    duel: {
      code, topic: row.topic, level: row.level, challenger: name, mine: row.creatorId === ctx.user.id, status: state.status, invite_expires_at: state.inviteExpiresAt,
      joined: state.players.some((player) => player.userId === ctx.user.id), links: links(ctx, code, row.referralCode),
    },
  };
}

export const duelRoutes = {
  'duel-create': { POST: createDuel, service: true },
  duels: { GET: myDuels },
  duel: { GET: duelInvite },
};
