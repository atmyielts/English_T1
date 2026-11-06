// Executive one-pager and monthly snapshots. A month's numbers can be frozen, by the
// nightly job (company_take_monthly_snapshots) or on demand, so what was shown to the
// board does not change later. The AI narrative sees numbers and department names only.
import { HR_ROLES, isLevel, type Level } from '../../../../packages/company-core/src/mod.ts';
import { consumeAi } from '../core.ts';
import { check, checkUnique, CompanyError, UUID, type Ctx, type MemberRow, type Route } from '../types.ts';
import { obj, oneOf, storable } from '../util.ts';
import { activitySummary, addDays, averageScore, dayStart, emptyLevels, fetchAll, isLearner, levelsAt, loadScope, localDate, memberScore, monthOf, sharingIds, type GradedAttempt, type LevelCounts } from './common.ts';
import { movementOf } from './cohorts.ts';
import { gradedWithSkills, latestSkills, monthEnd, readRequirements, standingOf } from './framework.ts';

export interface ExecData {
  version: number;
  period: { month: string; from: string; to: string };
  people: { people: number; learners: number; sharing: number; tested: number };
  levels: LevelCounts;
  avg_score: number | null;
  compliance: { with_requirement: number; meets: number; overdue: number };
  activity: { active: number; minutes: number; lessons: number };
  movement: { up: number; down: number; same: number; first: number; levels_gained: number };
  hiring: { graded: number; shortlisted: number };
  departments: { id: string | null; name: string | null; people: number; tested: number; with_requirement: number; meets: number; active: number; minutes: number; moved_up: number }[];
  spend: { currency: string; total: number }[];
}

interface SnapshotRow { id: string; org_id: string; period: string; kind: 'monthly' | 'manual'; taken_on: string; data: ExecData; narratives: Record<string, Narrative> | null; source: 'app' | 'cron'; created_at: string }
const SNAPSHOT_COLUMNS = 'id,org_id,period,kind,taken_on,data,narratives,source,created_at';
const LIST_COLUMNS = 'id,period,kind,taken_on,source,created_at,data';

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
function monthInput(value: unknown, today: string): string {
  const month = value === undefined || value === null || value === '' ? today.slice(0, 7) : value;
  if (typeof month !== 'string' || !PERIOD.test(month)) throw new CompanyError('invalid_field', 'month must be YYYY-MM.', 400, { field: 'month' });
  if (month > today.slice(0, 7) || month < '2020-01') throw new CompanyError('invalid_field', 'month cannot be in the future.', 400, { field: 'month' });
  return month;
}
const lastMonth = (today: string) => monthOf(today, -1).slice(0, 7);

/**
 * One month's numbers for the whole workspace, in the shape of company_snapshot_data().
 * The current month reads today's levels; a finished month reads what tests had shown by
 * its end, falling back to a stored level only if it was set before then.
 */
export async function executiveData(ctx: Ctx, month: string): Promise<ExecData> {
  const org = ctx.org!, today = localDate(ctx.now());
  const start = dayStart(`${month}-01`), end = monthEnd(`${month}-01`);
  const current = month === today.slice(0, 7);
  const lastDay = addDays(localDate(new Date(end.getTime() - 1)), 0);
  const asOf = lastDay < today ? lastDay : today;
  const { members, departments } = await loadScope(ctx);
  const active = members.filter((member) => member.status === 'active');
  const sharing = sharingIds(active);
  const [summary, attempts, requirements, spendRows, candidates] = await Promise.all([
    activitySummary(ctx.db, org.id, start, end, sharing),
    gradedWithSkills(ctx.db, org.id, end),
    readRequirements(ctx.db, org.id),
    fetchAll<{ currency: string; amount: number | string }>(() => ctx.db.from('company_training_spend').select('currency,amount').eq('org_id', org.id).gte('spent_on', `${month}-01`).lte('spent_on', lastDay).order('id')),
    fetchAll<{ decision: string | null }>(() => ctx.db.from('company_attempts').select('decision').eq('org_id', org.id).is('member_id', null).eq('status', 'graded').gte('graded_at', start.toISOString()).lt('graded_at', end.toISOString()).order('id')),
  ]);
  const inWorkspace = new Set(active.map((member) => member.id));
  const scoped = attempts.filter((attempt) => attempt.member_id && inWorkspace.has(attempt.member_id));
  const latest = levelsAt(scoped as GradedAttempt[], end);
  const skills = latestSkills(scoped, end);
  const levelThen = (member: MemberRow): Level | null => {
    if (current) return isLevel(member.level) ? member.level : null;
    const attempt = latest.get(member.id);
    if (attempt) return attempt.overall_level as Level;
    return isLevel(member.level) && member.level_at && Date.parse(member.level_at) < end.getTime() ? member.level : null;
  };
  const scoreThen = (member: MemberRow): number | null => {
    if (current) return isLevel(member.level) ? memberScore(member) : null;
    const attempt = latest.get(member.id);
    if (attempt) return attempt.overall_score === null ? null : Number(attempt.overall_score);
    return levelThen(member) ? memberScore(member) : null;
  };

  const levels = emptyLevels();
  for (const member of active) {
    const level = levelThen(member);
    if (level) levels[level] += 1;
    else if (isLearner(member)) levels.none += 1;
  }
  const judged = active.filter(isLearner).map((member) => ({ member, standing: standingOf(requirements, member, levelThen(member), skills.get(member.id), asOf) }));
  const answering = judged.filter((row) => row.standing.requirement);
  const movement = movementOf(scoped, active, { start, end });
  const totals = new Map(summary.members.map((row) => [row.member_id, row]));

  const groups: { id: string | null; name: string | null }[] = departments.map((entry) => ({ id: entry.id, name: entry.name }));
  if (active.some((member) => !member.department_id)) groups.push({ id: null, name: null });
  const money = new Map<string, number>();
  for (const row of spendRows) money.set(row.currency, (money.get(row.currency) ?? 0) + Number(row.amount));
  const scores = active.map(scoreThen).filter((value): value is number => value !== null);

  return {
    version: 1,
    period: { month, from: `${month}-01`, to: asOf },
    people: { people: active.length, learners: active.filter(isLearner).length, sharing: sharing.length, tested: active.filter((member) => levelThen(member)).length },
    levels,
    avg_score: averageScore(scores).score,
    compliance: { with_requirement: answering.length, meets: answering.filter((row) => row.standing.meets).length, overdue: answering.filter((row) => row.standing.overdue).length },
    activity: { active: summary.members.filter((row) => row.events > 0).length, minutes: summary.members.reduce((sum, row) => sum + row.minutes, 0), lessons: summary.members.reduce((sum, row) => sum + row.lessons, 0) },
    movement: { up: movement.up, down: movement.down, same: movement.same, first: movement.first, levels_gained: movement.levels_gained },
    hiring: { graded: candidates.length, shortlisted: candidates.filter((row) => row.decision === 'shortlist').length },
    departments: groups.map((group) => {
      const people = active.filter((member) => (member.department_id ?? null) === group.id);
      const ids = new Set(people.map((member) => member.id));
      const rows = answering.filter((row) => ids.has(row.member.id));
      return {
        id: group.id, name: group.name, people: people.length, tested: people.filter((member) => levelThen(member)).length,
        with_requirement: rows.length, meets: rows.filter((row) => row.standing.meets).length,
        active: people.filter((member) => (totals.get(member.id)?.events ?? 0) > 0).length,
        minutes: people.reduce((sum, member) => sum + (totals.get(member.id)?.minutes ?? 0), 0),
        moved_up: movement.moves.filter((move) => ids.has(move.member.id) && move.change > 0).length,
      };
    }),
    spend: [...money.entries()].map(([currency, total]) => ({ currency, total: Math.round(total * 100) / 100 })).sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}

/** Numbers shown in the history table, from a frozen snapshot. */
const headline = (data: ExecData) => ({
  compliance_percent: data.compliance?.with_requirement ? Math.round(data.compliance.meets / data.compliance.with_requirement * 100) : null,
  active: data.activity?.active ?? 0, minutes: data.activity?.minutes ?? 0, tested: data.people?.tested ?? 0, people: data.people?.people ?? 0, levels_gained: data.movement?.levels_gained ?? 0,
});

/** Saves the last finished month if the nightly job has not, for instance where pg_cron is not installed. Never throws. */
async function catchUp(ctx: Ctx): Promise<void> {
  const org = ctx.org!, today = localDate(ctx.now()), period = lastMonth(today);
  if (org.status !== 'pilot' && org.status !== 'active') return;
  if (Date.parse(org.created_at) >= dayStart(`${today.slice(0, 7)}-01`).getTime()) return;
  try {
    const existing = check<{ id: string }[]>(await ctx.db.from('company_insight_snapshots').select('id').eq('org_id', org.id).eq('period', period).eq('kind', 'monthly').limit(1));
    if (existing.length) return;
    const { error } = await ctx.db.from('company_insight_snapshots').insert({ org_id: org.id, period, kind: 'monthly', taken_on: today, data: await executiveData(ctx, period), source: 'app' });
    if (error && error.code !== '23505') console.error(JSON.stringify({ company_insights: 'snapshot_catch_up_failed', error: error.message }));
  } catch (cause) {
    console.error(JSON.stringify({ company_insights: 'snapshot_catch_up_failed', error: String(cause) }));
  }
}

async function snapshotById(ctx: Ctx, id: string): Promise<SnapshotRow> {
  if (!UUID.test(id)) throw new CompanyError('snapshot_not_found', 'Snapshot not found.', 404);
  const row = check<SnapshotRow | null>(await ctx.db.from('company_insight_snapshots').select(SNAPSHOT_COLUMNS).eq('org_id', ctx.org!.id).eq('id', id).maybeSingle());
  if (!row) throw new CompanyError('snapshot_not_found', 'Snapshot not found.', 404);
  return row;
}

/** A frozen month if one exists (the monthly one first), else null. */
async function frozen(ctx: Ctx, month: string): Promise<SnapshotRow | null> {
  const rows = check<SnapshotRow[]>(await ctx.db.from('company_insight_snapshots').select(SNAPSHOT_COLUMNS).eq('org_id', ctx.org!.id).eq('period', month).order('created_at', { ascending: false }).limit(20));
  return rows.find((row) => row.kind === 'monthly') ?? rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// AI narrative
// ---------------------------------------------------------------------------

export interface Narrative { headline: string; paragraphs: string[]; generated_at: string; numbers_to_check: string[] }
const LANGUAGES = { en: 'English', ru: 'Russian', uz: 'Uzbek (Latin script, use the ‘ apostrophe as in o‘ and g‘)' } as const;
const clean = (value: unknown, max: number) => typeof value === 'string' ? storable(value.replace(/\s+/g, ' ').trim().slice(0, max)) : '';

/** A commentary already on screen, kept with the numbers being saved. Its numbers are checked against those numbers here. */
function narrativesInput(value: unknown, data: ExecData, at: string): Record<string, Narrative> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, Narrative> = {};
  for (const locale of ['en', 'ru', 'uz'] as const) {
    const entry = (value as Record<string, unknown>)[locale] as { headline?: unknown; paragraphs?: unknown } | undefined;
    if (!entry || typeof entry !== 'object') continue;
    const headlineText = clean(entry.headline, 160);
    const paragraphs = (Array.isArray(entry.paragraphs) ? entry.paragraphs : []).map((item) => clean(item, 500)).filter(Boolean).slice(0, 2);
    if (headlineText || paragraphs.length) out[locale] = { headline: headlineText, paragraphs, generated_at: at, numbers_to_check: unknownNumbers([headlineText, ...paragraphs].join(' '), narrativePayload(data)) };
  }
  return out;
}

/** Only counts and department names go to the AI: no names or contacts of people. */
export function narrativePayload(data: ExecData) {
  return {
    period: data.period, people: data.people, levels: data.levels, average_score: data.avg_score, compliance: data.compliance, activity: data.activity,
    level_movement: data.movement, hiring_tests: data.hiring, spend: data.spend,
    departments: data.departments.map((row) => ({ name: row.name ?? 'no department', people: row.people, tested: row.tested, with_requirement: row.with_requirement, meets_requirement: row.meets, active: row.active, minutes: row.minutes, moved_up: row.moved_up })),
  };
}

/** Numbers in the narrative that are not in the data, so the page can ask a human to check them. */
export function unknownNumbers(text: string, data: unknown): string[] {
  const known = new Set<string>();
  const walk = (value: unknown) => {
    if (typeof value === 'number') known.add(String(value));
    else if (typeof value === 'string') for (const match of value.match(/\d+(?:\.\d+)?/g) ?? []) known.add(match);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(data);
  const payload = data as ReturnType<typeof narrativePayload>;
  // Hours and shares of the numbers given are fair to state.
  known.add(String(Math.round((payload.activity?.minutes ?? 0) / 60)));
  const rows = [payload.compliance, ...(payload.departments ?? []).map((row) => ({ with_requirement: row.with_requirement, meets: row.meets_requirement }))];
  for (const row of rows) if (row?.with_requirement) known.add(String(Math.round(row.meets / row.with_requirement * 100)));
  if (payload.people?.people) {
    known.add(String(Math.round(payload.people.tested / payload.people.people * 100)));
    known.add(String(Math.round(payload.people.sharing / payload.people.people * 100)));
  }
  const found = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return [...new Set(found.map((value) => value.replace(',', '.')).filter((value) => !known.has(value)))].slice(0, 12);
}

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/insights/executive', access: 'org', roles: HR_ROLES, allowSuspended: true,
    async handle(ctx, _params, _body, query) {
      const today = localDate(ctx.now());
      const org = ctx.org!;
      await catchUp(ctx);
      const snapshotId = query.get('snapshot');
      const month = monthInput(query.get('month'), today);
      // The current month stays live unless a snapshot is asked for by id: the page can then compare.
      const snapshot = snapshotId ? await snapshotById(ctx, snapshotId) : month === today.slice(0, 7) ? null : await frozen(ctx, month);
      const data = snapshot ? snapshot.data : await executiveData(ctx, month);
      const history = check<{ id: string; period: string; kind: string; taken_on: string; source: string; created_at: string; data: ExecData }[]>(
        await ctx.db.from('company_insight_snapshots').select(LIST_COLUMNS).eq('org_id', org.id).order('period', { ascending: false }).order('created_at', { ascending: false }).limit(60));
      return {
        today, month: data.period.month, org: { name: org.name, industry: org.industry },
        frozen: snapshot ? { id: snapshot.id, kind: snapshot.kind, taken_on: snapshot.taken_on, source: snapshot.source } : null,
        data, narratives: snapshot?.narratives ?? {},
        history: history.map(({ data: past, ...row }) => ({ ...row, ...headline(past) })),
      };
    },
  },
  {
    // Freezes the numbers of a month as they stand now.
    method: 'POST', path: 'orgs/:org/insights/snapshots', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const input = obj(body ?? {}), today = localDate(ctx.now());
      const month = monthInput(input.month, today);
      const data = await executiveData(ctx, month);
      const row = checkUnique<SnapshotRow>(await ctx.db.from('company_insight_snapshots').insert({
        org_id: ctx.org!.id, period: month, kind: 'manual', taken_on: today, data, narratives: narrativesInput(input.narratives, data, ctx.now().toISOString()), source: 'app', created_by: ctx.user,
      }).select(SNAPSHOT_COLUMNS).single(), () => new CompanyError('snapshot_exists', 'This month was already saved today.', 409));
      await ctx.audit('snapshot.saved', row.id, { period: month });
      return { snapshot: { id: row.id, period: row.period, kind: row.kind, taken_on: row.taken_on } };
    },
  },
  {
    // Spends AI, so unlike the read-only views it stays off while a workspace is suspended.
    method: 'POST', path: 'orgs/:org/insights/executive/narrative', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const input = obj(body ?? {}), today = localDate(ctx.now());
      const locale = oneOf(input.locale, ['en', 'ru', 'uz'] as const, 'locale', 'en');
      const month = monthInput(input.month, today);
      const snapshot = input.snapshot ? await snapshotById(ctx, String(input.snapshot)) : month === today.slice(0, 7) ? null : await frozen(ctx, month);
      const data = snapshot ? snapshot.data : await executiveData(ctx, month);
      if (!(await consumeAi(ctx))) return { status: 'limit', narrative: null };
      const payload = narrativePayload(data);
      const result = await ctx.ai<{ headline?: unknown; paragraphs?: unknown }>({
        feature: 'company-executive-narrative',
        userId: ctx.user,
        temperature: 0.2,
        systemPrompt: [
          'You write the short commentary on a one-page report for the CEO of a company in Uzbekistan or Central Asia about its staff English training.',
          'Use only the numbers in the data. Never invent numbers, names, prices, benchmarks, causes or outcomes, do not compare with other companies, and do not promise results.',
          'Levels are Schood estimates on the CEFR scale, not official certificates. Activity counts only people who agreed to share their progress.',
          `Write in ${LANGUAGES[locale]}. Be plain and brief; no marketing words.`,
          'Reply with strict JSON only: {"headline": string (max 120 characters), "paragraphs": string[] (1 or 2, each max 350 characters)}.',
        ].join('\n'),
        userPayload: JSON.stringify(payload),
      }, {});
      if (result.status !== 'ok' || !result.data || typeof result.data !== 'object') return { status: 'unavailable', narrative: null };
      const headlineText = clean(result.data.headline, 160);
      const paragraphs = (Array.isArray(result.data.paragraphs) ? result.data.paragraphs : []).map((value) => clean(value, 500)).filter(Boolean).slice(0, 2);
      if (!headlineText && !paragraphs.length) return { status: 'unavailable', narrative: null };
      const narrative: Narrative = { headline: headlineText, paragraphs, generated_at: ctx.now().toISOString(), numbers_to_check: unknownNumbers([headlineText, ...paragraphs].join(' '), payload) };
      // Kept with the frozen numbers, so the board copy stays with them. A failure here still returns the text.
      if (snapshot) {
        const { error } = await ctx.db.from('company_insight_snapshots').update({ narratives: { ...(snapshot.narratives ?? {}), [locale]: narrative } }).eq('id', snapshot.id).eq('org_id', ctx.org!.id);
        if (error) console.error(JSON.stringify({ company_insights: 'narrative_save_failed', error: error.message }));
      }
      return { status: 'ok', narrative, locale };
    },
  },
];
