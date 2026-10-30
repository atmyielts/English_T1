import { bool, oneOf, record } from '../input.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { CONSENT_VERSION, consentState, store, today } from './common.ts';
import { scheduleView } from './brief.ts';
import { streakFrom } from './pronunciation.ts';
import { loadPrediction, loadProfile } from './tutor.ts';
import type { AgeBand } from './store.ts';

// The under-18 consent step, the learner home summary and deleting history.
// Consent text lives in the app ([VERIFY: owner review]); the function stores
// which version was accepted. Adults confirm once; 13–17 need a parent's or
// guardian's agreement (confirmed by the learner, or a linked Plus Family parent);
// under 13 need a linked parent.

const consentView = async (ctx: RequestContext) => {
  const row = await store(ctx).consent(ctx.user.id);
  const parents = await store(ctx).familyLinks({ childId: ctx.user.id, statuses: ['active'] });
  return { state: consentState(row), age_band: row?.withdrawnAt ? null : row?.ageBand ?? null, version: CONSENT_VERSION, accepted_version: row?.textVersion ?? null, linked_parent: parents.length > 0 };
};

export const consentRoutes = {
  consent: {
    GET: async (ctx: RequestContext) => ({ consent: await consentView(ctx) }),
    /** { age_band, guardian_confirmed?, accept: true } */
    async POST(ctx: RequestContext) {
      const body = record(await ctx.body());
      if (body.accept !== true) throw new SchoodAIError('invalid_request', 'Accept the terms to continue.', 400, { field: 'accept' });
      const band = oneOf(body.age_band, 'age_band', ['adult', '13_17', 'under_13'] as const) as AgeBand;
      const confirmed = body.guardian_confirmed === undefined ? false : bool(body.guardian_confirmed, 'guardian_confirmed');
      const [parent] = await store(ctx).familyLinks({ childId: ctx.user.id, statuses: ['active'] });
      await store(ctx).saveConsent({
        userId: ctx.user.id, ageBand: band, textVersion: CONSENT_VERSION, acceptedAt: ctx.now().toISOString(), withdrawnAt: null,
        guardianUserId: band === 'adult' ? null : parent?.parentId ?? null,
        guardianConfirmed: band === 'adult' ? false : band === '13_17' ? confirmed || !!parent : !!parent,
      });
      await ctx.audit('learner.consent_saved', { age_band: band, version: CONSENT_VERSION });
      return { consent: await consentView(ctx) };
    },
    /** Withdraws consent: the assistant asks again before the next use. */
    async DELETE(ctx: RequestContext) {
      const row = await store(ctx).consent(ctx.user.id);
      if (row) await store(ctx).saveConsent({ ...row, withdrawnAt: ctx.now().toISOString() });
      await ctx.audit('learner.consent_withdrawn', {});
      return { consent: await consentView(ctx) };
    },
  },
};

// GET learner/home: what the learner pages show on top (no model call).
export async function home(ctx: RequestContext) {
  const access = await ctx.workspace();
  if (ctx.user.token) {
    // Keep the summaries Telegram and linked parents read fresh (in the background).
    ctx.after(async () => { await Promise.allSettled([loadProfile(ctx), loadPrediction(ctx)]); });
  }
  const [consent, recent, pronunciation, plans, parents, children, brief] = await Promise.all([
    consentView(ctx),
    store(ctx).activity(ctx.user.id, { limit: 8 }),
    store(ctx).activity(ctx.user.id, { kinds: ['pronunciation'], since: new Date(ctx.now().getTime() - 60 * 86_400_000).toISOString(), limit: 600 }),
    store(ctx).records(ctx.user.id, { kind: 'plan', workspaceId: access.workspace.id, limit: 1, status: ['active'] }),
    store(ctx).familyLinks({ childId: ctx.user.id, statuses: ['active'] }),
    store(ctx).familyLinks({ workspaceId: access.workspace.id, parentId: ctx.user.id, statuses: ['active', 'invited'] }),
    scheduleView(ctx, 'daily'),
  ]);
  const byDay = new Map<string, Map<string, number>>();
  for (const row of pronunciation) {
    const day = String(row.summary.day ?? row.createdAt.slice(0, 10));
    const scores = byDay.get(day) ?? new Map<string, number>();
    scores.set(String(row.summary.sentence ?? row.id), Math.max(scores.get(String(row.summary.sentence ?? row.id)) ?? 0, Number(row.score ?? 0)));
    byDay.set(day, scores);
  }
  const plan = plans[0];
  return {
    consent,
    recent: recent.map((row) => ({ feature: row.feature, kind: row.kind, score: row.score, created_at: row.createdAt })),
    streaks: { pronunciation: streakFrom(byDay, today(ctx.now())) },
    plan: plan ? { id: plan.id, exam: plan.input.exam, target: plan.input.target, exam_date: plan.input.exam_date } : null,
    family: { parents: parents.length, children: children.length },
    brief,
  };
}

// DELETE learner/history { all: true }: deletes this learner's Schood AI records and activity in this workspace.
export async function deleteHistory(ctx: RequestContext) {
  const body = record(await ctx.body());
  if (body.all !== true) throw new SchoodAIError('invalid_request', 'Send { all: true } to delete your history.', 400, { field: 'all' });
  const access = await ctx.workspace();
  const deleted = await store(ctx).deleteRecords(ctx.user.id, access.workspace.id);
  await ctx.audit('learner.history_deleted', { deleted });
  return { deleted };
}
