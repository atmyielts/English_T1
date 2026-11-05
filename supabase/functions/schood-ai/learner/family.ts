import { s } from '../../../../packages/ai-core/src/mod.ts';
import { switchesOf } from '../ai.ts';
import { record, text, uuid } from '../input.ts';
import { registerPlanSource } from '../plan.ts';
import { SchoodAIError, type Locale, type RequestContext, type WorkspaceAccess } from '../types.ts';
import { CONSENT_VERSION, learnerInput, LANGUAGE, receipt, store, systemFor, today, userActor, type Actor } from './common.ts';
import { escapeHtml, scheduleView, saveScheduleFrom, type TelegramMessage } from './brief.ts';
import { APP_URL, learnerStore, type FamilyLink } from './store.ts';
import { recentActivity } from './tutor.ts';
import { childUsage } from '../seams/learner-engage.ts';

// Plus Family: one parent and up to 3 children. The parent invites a child with a
// one-time code (shown once, stored as a hash); the child accepts it in their own
// account, which is their agreement that this parent sees a summary of their
// Schood progress. Either side can unlink at any time. While the parent holds
// Plus Family, each linked child has Plus in their personal workspace
// (registerPlanSource). In a centre workspace, a parent member can link a student
// member of the same centre when the centre has switched parent features on.
//
// P1 Parent brief (weekly in Telegram, also on the web) and P2 Ask about my child
// answer only about the parent's own linked child, only from that child's data:
// their Schood AI activity, the summaries of their results they last saw, and
// their completed Schood exam results. Never their chats or texts.

export const FAMILY_LIMIT = 3;
const INVITE_DAYS = 7;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
const normaliseCode = (value: unknown) => (typeof value === 'string' ? value.toUpperCase().replace(/[\s-]+/g, '') : '');

/** Children of a Plus Family holder get Plus in their own personal workspace. */
export function registerFamilyPlanSource(): void {
  registerPlanSource('learner.family', async ({ user, workspace, repo, store: storeOf, plansOf }) => {
    if (workspace.kind !== 'personal') return null;
    const links = await storeOf(learnerStore).familyLinks({ childId: user.id, statuses: ['active'] });
    for (const link of links) {
      const home = await repo.workspace(link.workspaceId);
      if (!home || home.kind !== 'personal' || home.ownerId !== link.parentId) continue;
      if ((await plansOf(link.parentId)).includes('family')) return { plans: ['plus'] };
    }
    return null;
  });
}

/** Parent features here: Plus Family in a personal workspace; in a centre, a parent member when the centre switched them on. */
async function requireParent(ctx: RequestContext, key: 'parent.brief' | 'parent.ask' | 'P1'): Promise<WorkspaceAccess> {
  const access = await ctx.requireFeature(key);
  if (access.workspace.kind === 'centre') {
    if (access.role !== 'parent') throw new SchoodAIError('role_required', 'Only parents can do this.', 403, { roles: ['parent'] });
    const switches = switchesOf(access) ?? {};
    if (switches.parent !== true && switches['parent.brief'] !== true) throw new SchoodAIError('centre_parent_off', 'Your centre has not switched on parent features.', 403);
  }
  return access;
}

/** The parent's active link to this child in this workspace, or not_found. */
async function ownChild(ctx: RequestContext, access: WorkspaceAccess, childId: string): Promise<FamilyLink> {
  const [link] = await store(ctx).familyLinks({ workspaceId: access.workspace.id, parentId: ctx.user.id, childId, statuses: ['active'] });
  if (!link) throw new SchoodAIError('not_found', 'This child is not linked to you.', 404);
  return link;
}

const linkView = async (ctx: RequestContext, link: FamilyLink, side: 'parent' | 'child') => ({
  id: link.id, status: link.status, child_label: side === 'parent' ? link.childLabel : null,
  name: side === 'parent' ? (link.childId ? await store(ctx).displayName(link.childId).catch(() => null) : null) : await store(ctx).displayName(link.parentId).catch(() => null),
  child_id: side === 'parent' ? link.childId : null, invite_hint: link.status === 'invited' ? link.inviteHint : null, invite_expires_at: link.status === 'invited' ? link.inviteExpiresAt : null,
  created_at: link.createdAt, accepted_at: link.acceptedAt,
});

// GET learner/family: as a parent (children, invites, schedule, last briefs) and as a child (who sees my progress).
export async function family(ctx: RequestContext) {
  const access = await ctx.workspace();
  const [asParent, asChild] = await Promise.all([
    store(ctx).familyLinks({ workspaceId: access.workspace.id, parentId: ctx.user.id, statuses: ['invited', 'active'] }),
    store(ctx).familyLinks({ childId: ctx.user.id, statuses: ['active'] }),
  ]);
  const briefs = await store(ctx).records(ctx.user.id, { kind: 'parent_brief', workspaceId: access.workspace.id, limit: 12 });
  const access1 = await ctx.access('P1');
  return {
    can_invite: access1.allowed, limit: FAMILY_LIMIT, consent_version: CONSENT_VERSION,
    children: await Promise.all(asParent.map(async (link) => ({ ...await linkView(ctx, link, 'parent'), last_brief: briefs.find((row) => row.input.child_id === link.childId)?.output ?? null }))),
    parents: await Promise.all(asChild.map((link) => linkView(ctx, link, 'child'))),
    ...await scheduleView(ctx, 'parent'),
  };
}

// POST learner/family-invite { child_label, consent: true }: the code is shown once.
export async function familyInvite(ctx: RequestContext) {
  const body = record(await ctx.body());
  const access = await requireParent(ctx, 'P1');
  if (body.consent !== true) throw new SchoodAIError('consent_required', 'Confirm that you are the child\'s parent or guardian.', 400, { field: 'consent' });
  const label = text(body.child_label, 'child_label', { max: 60 });
  const code = Array.from(crypto.getRandomValues(new Uint8Array(10)), (byte) => ALPHABET[byte & 31]).join('');
  const expiresAt = new Date(ctx.now().getTime() + INVITE_DAYS * 86_400_000).toISOString();
  const result = await store(ctx).familyInvite({ workspaceId: access.workspace.id, parentId: ctx.user.id, label, hash: await sha256(code), hint: code.slice(-4), expiresAt, consentVersion: CONSENT_VERSION, now: ctx.now().toISOString(), limit: FAMILY_LIMIT });
  if (!result.ok) throw new SchoodAIError('family_limit', `A family can have up to ${FAMILY_LIMIT} children.`, 409, { limit: FAMILY_LIMIT });
  await ctx.audit('learner.family_invited', { link_id: result.id }, { type: 'family_link', id: result.id });
  return { invite: { id: result.id, code: `${code.slice(0, 5)}-${code.slice(5)}`, expires_at: expiresAt, url: `${APP_URL.replace(/\/$/, '')}/family/join` } };
}

// POST learner/family-accept { code }: the child agrees to share their progress summary.
export async function familyAccept(ctx: RequestContext) {
  const body = record(await ctx.body());
  const code = normaliseCode(body.code);
  if (!/^[A-HJ-NP-Z2-9]{10}$/.test(code)) throw new SchoodAIError('invite_not_found', 'This code is not valid.', 404);
  const hash = await sha256(code);
  const result = await store(ctx).familyAccept(hash, ctx.user.id, ctx.now().toISOString(), FAMILY_LIMIT);
  if (!result.ok) throw new SchoodAIError(result.code === 'not_found' ? 'invite_not_found' : `invite_${result.code}`, 'This invite cannot be used.', result.code === 'not_found' ? 404 : 409);
  const home = await ctx.repo.workspace(result.workspaceId);
  if (home?.kind === 'centre') {
    const member = await ctx.repo.membership(home.id, ctx.user.id);
    if (!member || member.status !== 'active' || member.role !== 'student') {
      await store(ctx).endFamilyLink(result.id, 'declined', ctx.user.id, ctx.now().toISOString());
      throw new SchoodAIError('invite_not_member', 'This invite is for a student of that centre.', 403);
    }
  }
  // A linked parent counts as the guardian's agreement for the under-18 consent step.
  const consent = await store(ctx).consent(ctx.user.id);
  if (consent && consent.ageBand !== 'adult') await store(ctx).saveConsent({ ...consent, guardianUserId: result.parentId, guardianConfirmed: true });
  await ctx.audit('learner.family_accepted', { link_id: result.id }, { type: 'family_link', id: result.id });
  return { linked: { id: result.id, parent: await store(ctx).displayName(result.parentId).catch(() => null) } };
}

// DELETE learner/family-link { id }: a parent cancels an invite or unlinks; a child unlinks.
export async function familyUnlink(ctx: RequestContext) {
  const body = record(await ctx.body());
  const link = await store(ctx).familyLink(uuid(body.id, 'id'));
  if (!link || (link.parentId !== ctx.user.id && link.childId !== ctx.user.id)) throw new SchoodAIError('not_found', 'Not found.', 404);
  const ended = await store(ctx).endFamilyLink(link.id, link.status === 'invited' ? 'expired' : 'unlinked', ctx.user.id, ctx.now().toISOString());
  if (!ended) throw new SchoodAIError('not_found', 'Not found.', 404);
  if (link.childId) {
    const consent = await store(ctx).consent(link.childId);
    if (consent?.guardianUserId === link.parentId) await store(ctx).saveConsent({ ...consent, guardianUserId: null, guardianConfirmed: consent.ageBand === '13_17' ? consent.guardianConfirmed : false });
  }
  await ctx.audit('learner.family_unlinked', { link_id: link.id, by: link.parentId === ctx.user.id ? 'parent' : 'child' }, { type: 'family_link', id: link.id });
  return { unlinked: true };
}

// --- The child's data, as a parent may see it ------------------------------------------------
export async function childData(ctx: RequestContext, link: FamilyLink) {
  const childId = link.childId!;
  const since = new Date(ctx.now().getTime() - 7 * 86_400_000).toISOString();
  const [week, recent, snapshot, outcomes, name, usage] = await Promise.all([
    store(ctx).activity(childId, { since, limit: 300 }),
    recentActivity(ctx, childId, 30),
    store(ctx).snapshot(childId),
    store(ctx).examOutcomes(childId, 5).catch(() => []),
    store(ctx).displayName(childId).catch(() => null),
    // Engage's verified learning time across Schood, for a child under 18 (seams/learner-engage.ts).
    childUsage(ctx, childId),
  ]);
  const days = new Set(week.map((row) => row.createdAt.slice(0, 10)));
  const byFeature: Record<string, number> = {};
  for (const row of week) byFeature[row.feature] = (byFeature[row.feature] ?? 0) + 1;
  const scored = week.filter((row) => row.score !== null && ['mock', 'writing', 'interview', 'reading'].includes(row.kind)).slice(0, 8).map((row) => ({ kind: row.kind, feature: row.feature, score: row.score, date: row.createdAt.slice(0, 10) }));
  return {
    name: name ?? link.childLabel,
    stats: {
      minutes_7d: week.reduce((sum, row) => sum + row.minutes, 0), active_days_7d: days.size, ai_actions_7d: week.length, by_feature_7d: byFeature, scored_7d: scored,
      ...(usage ? { practice_minutes_7d: usage.total_minutes, practice_days_7d: usage.active_days, streak: usage.streak, daily_limit_minutes: usage.daily_limit_minutes, limit_reached_days_7d: usage.limit_reached_days } : {}),
    },
    recent: recent.slice(0, 25),
    results: snapshot?.profile ?? null, predictions: snapshot?.prediction ?? null, results_as_of: snapshot?.refreshedAt?.slice(0, 10) ?? null,
    exams: outcomes,
  };
}
const hasData = (data: Awaited<ReturnType<typeof childData>>) => data.stats.ai_actions_7d > 0 || (data.stats.practice_minutes_7d ?? 0) > 0 || data.exams.length > 0 || !!data.results;

// --- P1 -------------------------------------------------------------------------------------------
const BRIEF_SCHEMA = s.object({
  effort: s.string({ min: 3, max: 400 }), progress: s.string({ min: 3, max: 500 }), praise: s.string({ min: 3, max: 300 }),
  watch: s.string({ min: 3, max: 300 }), suggestion: s.string({ min: 3, max: 300 }),
});
const NO_DATA: Record<Locale, string> = {
  en: 'No Schood activity this week yet. A short daily practice helps; you could ask them to try today\'s Schood AI brief.',
  uz: 'Bu hafta Schoodda faollik boʻlmadi. Kunlik qisqa mashq foydali; farzandingizdan bugungi Schood AI mashqini sinab koʻrishni soʻrang.',
  ru: 'На этой неделе активности в Schood пока не было. Помогает короткая ежедневная практика: предложите ребёнку попробовать сегодняшнюю разминку Schood AI.',
};

/** One brief per child per week; reused when it exists, charged parent.brief once otherwise (the signed-in parent). */
export function parentBriefs(ctx: RequestContext, access: WorkspaceAccess, onlyChild?: string) {
  return parentBriefsFor(ctx, userActor(ctx, access), onlyChild);
}
/** The same for any parent (a scheduled job pays with ctx.paidBy for the workspace the links are in). */
export async function parentBriefsFor(ctx: RequestContext, actor: Actor, onlyChild?: string) {
  const access = actor.access;
  const links = (await store(ctx).familyLinks({ workspaceId: access.workspace.id, parentId: actor.userId, statuses: ['active'] })).filter((link) => link.childId && (!onlyChild || link.childId === onlyChild));
  if (!links.length) throw new SchoodAIError('no_children', 'Link a child first.', 409);
  const week = today(ctx.now());
  const existing = await store(ctx).records(actor.userId, { kind: 'parent_brief', workspaceId: access.workspace.id, limit: 30 });
  const out: { recordId: string; childId: string; name: string; brief: Record<string, unknown>; credits: number }[] = [];
  for (const link of links) {
    const found = existing.find((row) => row.input.child_id === link.childId && row.input.week === week);
    if (found) { out.push({ recordId: found.id, childId: link.childId!, name: String(found.output.name ?? link.childLabel), brief: found.output, credits: 0 }); continue; }
    const data = await childData(ctx, link);
    let brief: Record<string, unknown>, credits = 0;
    if (!hasData(data)) {
      brief = { name: data.name, stats: data.stats, no_data: true, effort: NO_DATA[actor.locale] };
    } else {
      const result = await actor.ai.json({
        key: 'parent.brief', schema: BRIEF_SCHEMA, maxTokens: 900, temperature: 0.3, reference: `parent-brief:${actor.userId}:${link.childId}:${week}`,
        messages: [
          { role: 'system', content: systemFor(ctx, access, { name: 'Parent brief', instructions: [
            `Write a weekly brief for a parent about their child ${data.name}, from the child's data only. Write in ${LANGUAGE[actor.locale]} for a parent, warm and plain.`,
            'effort: how much and how regularly they practised. progress: what improved or stayed weak, citing results only from the data. praise: one specific thing to praise. watch: one thing to keep an eye on. suggestion: one small thing the parent can do this week.',
            'Never invent scores, dates or activity; if the data does not show something, say so. Never quote the child\'s private messages; there are none in the data.',
          ] }, [{ kind: 'child_data', title: `${data.name}'s Schood data`, data }], actor.locale) },
          { role: 'user', content: learnerInput({ request: 'weekly parent brief', week }) },
        ],
      });
      brief = { name: data.name, stats: data.stats, exams: data.exams.slice(0, 3), ...result.data };
      credits = result.credits;
    }
    const row = await store(ctx).createRecord({ userId: actor.userId, workspaceId: access.workspace.id, kind: 'parent_brief', credits, input: { child_id: link.childId, week }, output: brief });
    out.push({ recordId: row.id, childId: link.childId!, name: data.name, brief, credits });
  }
  return out;
}

const PARENT_COPY: Record<Locale, { title: string; minutes: string; days: string; effort: string; progress: string; praise: string; watch: string; suggestion: string; streak: string; limit: string }> = {
  en: { title: 'Weekly brief', minutes: 'minutes of practice', days: 'active days', effort: 'Effort', progress: 'Progress', praise: 'Praise', watch: 'Watch', suggestion: 'This week', streak: 'day streak', limit: 'Daily limit {limit} min, reached on {days} days' },
  uz: { title: 'Haftalik hisobot', minutes: 'daqiqa mashq', days: 'faol kun', effort: 'Harakat', progress: 'O‘sish', praise: 'Maqtang', watch: 'E’tibor bering', suggestion: 'Bu hafta', streak: 'kunlik seriya', limit: 'Kunlik chegara {limit} daqiqa, {days} kun yetib borildi' },
  ru: { title: 'Недельный отчёт', minutes: 'минут практики', days: 'активных дней', effort: 'Старание', progress: 'Прогресс', praise: 'Похвалите', watch: 'Обратите внимание', suggestion: 'На этой неделе', streak: 'дней подряд', limit: 'Дневной лимит {limit} мин, достигнут в {days} дн.' },
};
type BriefStats = { minutes_7d?: number; active_days_7d?: number; practice_minutes_7d?: number; practice_days_7d?: number; streak?: number; daily_limit_minutes?: number | null; limit_reached_days_7d?: number };
/** Minutes and days (engage's verified learning when there is a summary), then the streak and the daily limit. */
function statsLines(copy: (typeof PARENT_COPY)[Locale], stats: BriefStats): string[] {
  const minutes = stats.practice_minutes_7d ?? stats.minutes_7d ?? 0, days = stats.practice_days_7d ?? stats.active_days_7d ?? 0;
  const lines = [`${minutes} ${copy.minutes} · ${days} ${copy.days}${stats.streak ? ` · ${stats.streak} ${copy.streak}` : ''}`];
  if (stats.daily_limit_minutes) lines.push(copy.limit.replace('{limit}', String(stats.daily_limit_minutes)).replace('{days}', String(stats.limit_reached_days_7d ?? 0)));
  return lines;
}
export function parentBriefMessage(entry: { name: string; brief: Record<string, unknown> }, locale: Locale): TelegramMessage {
  const copy = PARENT_COPY[locale], brief = entry.brief, stats = (brief.stats ?? {}) as BriefStats;
  const line = (label: string, value: unknown) => (typeof value === 'string' && value ? `<b>${label}:</b> ${escapeHtml(value)}` : null);
  return {
    text: [
      `👪 <b>${copy.title}: ${escapeHtml(entry.name)}</b>`,
      ...statsLines(copy, stats).map(escapeHtml), '',
      line(copy.effort, brief.effort), line(copy.progress, brief.progress), line(copy.praise, brief.praise), line(copy.watch, brief.watch), line(copy.suggestion, brief.suggestion),
    ].filter((entry) => entry !== null).join('\n').slice(0, 4000),
  };
}

/** The weekly parent brief as plain text for ctx.notify.send (one message for all children). */
export function parentBriefPlain(entries: { name: string; brief: Record<string, unknown> }[], locale: Locale): string {
  const copy = PARENT_COPY[locale];
  return entries.map(({ name, brief }) => {
    const stats = (brief.stats ?? {}) as BriefStats;
    const line = (label: string, value: unknown) => (typeof value === 'string' && value ? `${label}: ${value}` : null);
    return [`👪 ${copy.title}: ${name}`, ...statsLines(copy, stats),
      line(copy.effort, brief.effort), line(copy.progress, brief.progress), line(copy.praise, brief.praise), line(copy.watch, brief.watch), line(copy.suggestion, brief.suggestion)].filter((entry) => entry !== null).join('\n');
  }).join('\n\n').slice(0, 4000);
}

// --- P2 ---------------------------------------------------------------------------------------------
/** An answer only about this parent's own linked child, only from that child's data. */
export async function askAboutChild(ctx: RequestContext, childId: string, question: string) {
  const access = await requireParent(ctx, 'parent.ask');
  const link = await ownChild(ctx, access, childId);
  const data = await childData(ctx, link);
  const out = await ctx.ai.text({
    key: 'parent.ask', maxTokens: 700, temperature: 0.3,
    messages: [
      { role: 'system', content: systemFor(ctx, access, { name: 'Parent assistant', instructions: [
        `A parent asks about their child ${data.name}. Answer only about this child and only from the child data below. Write in ${LANGUAGE[ctx.locale]}.`,
        'If the data does not answer the question (for example readiness for an exam with no results yet), say what the data does show and what would tell you more, like a mock test in Schood. Never guess scores, dates or behaviour.',
        'Do not answer questions about other children or people. You have no access to the child\'s private chats.',
      ] }, [{ kind: 'child_data', title: `${data.name}'s Schood data`, data }]) },
      { role: 'user', content: learnerInput({ question }) },
    ],
  });
  return { child: { id: childId, name: data.name }, answer: out.text.trim().slice(0, 4000), ...receipt(out) };
}

export const familyRoutes = {
  family: {
    GET: family,
    /** The weekly parent brief schedule { enabled, time, weekday, time_zone? }. */
    async PUT(ctx: RequestContext) {
      const body = record(await ctx.body());
      if (body.enabled === true) await requireParent(ctx, 'P1');
      return saveScheduleFrom(ctx, 'parent', body);
    },
  },
  'family-invite': { POST: familyInvite },
  'family-accept': { POST: familyAccept },
  'family-link': { DELETE: familyUnlink },
  'parent-brief': {
    async POST(ctx: RequestContext) {
      const body = record(await ctx.body());
      const access = await requireParent(ctx, 'parent.brief');
      const list = await parentBriefs(ctx, access, body.child_id === undefined ? undefined : uuid(body.child_id, 'child_id'));
      return { briefs: list.map((entry) => ({ child_id: entry.childId, name: entry.name, ...entry.brief, credits: entry.credits })) };
    },
  },
  'parent-ask': {
    service: true,
    async POST(ctx: RequestContext) {
      const body = record(await ctx.body());
      return askAboutChild(ctx, uuid(body.child_id, 'child_id'), text(body.question, 'question', { max: 1000 }));
    },
  },
};
export { requireParent };
