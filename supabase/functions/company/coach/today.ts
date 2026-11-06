// Today: a five or ten minute plan built from due reviews, the next lesson, a role-play or
// writing task and a little shadowing, weighted to the job role and weak skills. The plan
// is built once per Tashkent day and each step ticks itself off from what really happened.
import { fetchAll } from '../people/shared.ts';
import { ASSIGNMENT_COLUMNS, appliesTo, type AssignmentRow } from '../training/assignments.ts';
import { memberProgress, type ProgressRow } from '../training/lessons.ts';
import { findLesson, findScenario, findTemplate, findTrack } from '../training/tracks/index.ts';
import { check, CompanyError, type Ctx, type MemberRow, type Route } from '../types.ts';
import { int, obj, tashkentDay } from '../util.ts';
import { deckCounts, syncDeck } from './deck.ts';
import { findSituation, phrasesFor } from './phrasebook/index.ts';
import { buildPlan, seededPick, situationsFor, type MainKind, type PlanItem } from './plan.ts';
import { practiceHistory, streakOf } from './progress.ts';
import { weakSkills } from './skills.ts';
import { SHADOW_TARGET } from './practice.ts';
import { countLog, grant, logOnce, readSettings, seated, today } from './shared.ts';
import { addDay } from './srs.ts';
import { weekGoal } from './streak.ts';

interface PlanRow { member_id: string; day: string; minutes: number; items: PlanItem[]; finished_at: string | null; created_at?: string }
const PLAN_COLUMNS = 'member_id,day,minutes,items,finished_at,created_at';
const PLAN_POINTS = 5;

const firstOpen = (trackCode: string, progress: ProgressRow[]) => findTrack(trackCode)?.lessons.find((lesson) => !progress.some((row) => row.lesson_code === lesson.code && row.status === 'completed'))?.code ?? null;

/** The lesson touched last, else the next from an assignment, the job role's track, then general. */
async function nextLesson(ctx: Ctx, member: MemberRow, progress: ProgressRow[]): Promise<string | null> {
  const started = progress.filter((row) => row.status === 'started').sort((a, b) => String(b.updated_at ?? '') < String(a.updated_at ?? '') ? -1 : 1)[0];
  if (started && findLesson(started.lesson_code)) return started.lesson_code;
  const active = () => ctx.db.from('company_assignments').select(ASSIGNMENT_COLUMNS).eq('org_id', ctx.org!.id).eq('status', 'active');
  const assigned = [
    ...await fetchAll<AssignmentRow>(() => active().eq('member_id', member.id).order('id')),
    ...await fetchAll<AssignmentRow>(() => active().is('member_id', null).order('id')),
  ].filter((row) => appliesTo(row, member) && row.track_code).sort((a, b) => (a.due_date ?? '9999') < (b.due_date ?? '9999') ? -1 : 1);
  for (const row of assigned) {
    const open = firstOpen(row.track_code!, progress);
    if (open) return open;
  }
  return firstOpen(member.job_role, progress) ?? firstOpen('general', progress);
}

/** Something from the job role's track the person has not tried lately. */
async function notTriedLately(ctx: Ctx, member: MemberRow, table: string, column: string, codes: string[], seed: string): Promise<string | null> {
  const rows = check<Record<string, string | null>[]>(await ctx.db.from(table).select(column).eq('org_id', ctx.org!.id).eq('member_id', member.id).order('created_at', { ascending: false }).limit(50));
  const tried = new Set(rows.map((row) => row[column]));
  const fresh = codes.filter((code) => !tried.has(code));
  return seededPick(fresh.length ? fresh : codes, seed) ?? null;
}

async function loadOrBuild(ctx: Ctx, member: MemberRow, day: string, minutes: 5 | 10, progress: ProgressRow[]): Promise<PlanRow> {
  const read = () => ctx.db.from('company_coach_plans').select(PLAN_COLUMNS).eq('member_id', member.id).eq('day', day).maybeSingle();
  const existing = check<PlanRow | null>(await read());
  if (existing) return existing;
  const counts = await deckCounts(ctx, member, day);
  const track = findTrack(member.job_role) ?? findTrack('general')!;
  const seed = `${member.id}:${day}`;
  const yesterday = check<{ items: PlanItem[] } | null>(await ctx.db.from('company_coach_plans').select('items').eq('member_id', member.id).eq('day', addDay(day, -1)).maybeSingle());
  const previous = (yesterday?.items ?? []).find((item) => item.type === 'lesson' || item.type === 'roleplay' || item.type === 'writing')?.type as MainKind | undefined;
  const items = buildPlan({
    minutes, reviewable: counts.due + counts.new_today,
    lesson: await nextLesson(ctx, member, progress),
    scenario: await notTriedLately(ctx, member, 'company_roleplay_sessions', 'scenario_code', track.scenarios.map((scenario) => scenario.code), `${seed}:rp`),
    template: await notTriedLately(ctx, member, 'company_writing_checks', 'template_code', track.templates.map((template) => template.code), `${seed}:wr`),
    situation: seededPick(situationsFor(member.job_role), seed)!,
    jobRole: member.job_role, weak: await weakSkills(ctx, member), previous: previous ?? null, seed,
  });
  // Two tabs may build at once: the first one stored wins, and both then read that one.
  check(await ctx.db.from('company_coach_plans').upsert({ member_id: member.id, org_id: ctx.org!.id, user_id: member.user_id, day, minutes, items }, { onConflict: 'member_id,day', ignoreDuplicates: true }));
  return check<PlanRow>(await ctx.db.from('company_coach_plans').select(PLAN_COLUMNS).eq('member_id', member.id).eq('day', day).single());
}

interface DayFacts { reviews: number; reviewable: number; shadow: number; kinds: Set<string>; touched: Set<string> }

function itemDone(item: PlanItem, facts: DayFacts): boolean {
  switch (item.type) {
    case 'review': return facts.reviews >= item.target || facts.reviewable === 0;
    case 'shadow': return facts.shadow >= item.target;
    case 'lesson': return facts.touched.has(item.code);
    case 'roleplay': return facts.kinds.has('roleplay');
    case 'writing': return facts.kinds.has('writing');
  }
}

function itemView(item: PlanItem, index: number, facts: DayFacts) {
  const base = { index, type: item.type, minutes: item.minutes, done: itemDone(item, facts), skipped: Boolean(item.skipped), why: item.why ?? null };
  switch (item.type) {
    case 'review': return { ...base, target: item.target, count: Math.min(item.target, facts.reviews) };
    case 'shadow': return { ...base, target: item.target, count: Math.min(item.target, facts.shadow), situation: item.situation, title: findSituation(item.situation)?.title ?? null };
    case 'lesson': {
      const found = findLesson(item.code);
      return { ...base, lesson: item.code, track: found?.track.code ?? null, title: found?.lesson.title ?? null };
    }
    case 'roleplay': return { ...base, scenario: item.scenario, title: findScenario(item.scenario)?.scenario.title ?? null };
    case 'writing': return { ...base, template: item.template, title: findTemplate(item.template)?.template.title ?? null };
  }
}

/** What has really happened today, for ticking the plan off. */
async function factsOf(ctx: Ctx, member: MemberRow, day: string, progress: ProgressRow[]): Promise<DayFacts> {
  const counts = await deckCounts(ctx, member, day);
  const since = new Date(`${day}T00:00:00+05:00`).toISOString();
  const activity = await fetchAll<{ kind: string }>(() => ctx.db.from('company_activity').select('kind').eq('member_id', member.id).in('kind', ['roleplay', 'writing']).gte('created_at', since).order('id'));
  return {
    reviews: await countLog(ctx, member, ['review'], day),
    reviewable: counts.due + counts.new_today,
    shadow: await countLog(ctx, member, ['shadow'], day),
    kinds: new Set(activity.map((row) => row.kind)),
    touched: new Set(progress.filter((row) => row.updated_at && tashkentDay(new Date(row.updated_at)) === day).map((row) => row.lesson_code)),
  };
}

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/coach/today', access: 'org',
    async handle(ctx) {
      const member = seated(ctx);
      const day = today(ctx);
      const settings = await syncDeck(ctx, member, await readSettings(ctx, member));
      const progress = await memberProgress(ctx, member.id);
      const plan = await loadOrBuild(ctx, member, day, settings.daily_minutes, progress);
      const facts = await factsOf(ctx, member, day, progress);
      const items = plan.items.map((item, index) => itemView(item, index, facts));
      const allSettled = items.every((item) => item.done || item.skipped) && items.some((item) => item.done);

      let finishedAt = plan.finished_at;
      if (allSettled && !finishedAt) {
        // Whichever tab gets here first finishes the plan; the points go out once.
        const at = ctx.now().toISOString();
        const moved = check<{ day: string }[]>(await ctx.db.from('company_coach_plans').update({ finished_at: at }).eq('member_id', member.id).eq('day', day).is('finished_at', null).select('day'));
        finishedAt = at;
        if (moved.length && await logOnce(ctx, member, day, 'plan_done', day)) await grant(ctx, member, day, { minutes: 0, points: PLAN_POINTS, ref: 'coach:plan' });
      }

      const history = await practiceHistory(ctx, member);
      const streak = streakOf(day, history.practiced, settings);
      const week = weekGoal(day, history.practiced, settings.weekly_goal, 1);
      const phrases = phrasesFor(seededPick(situationsFor(member.job_role), `${member.id}:${day}:phrase`)!, member.level);
      return {
        day,
        plan: { minutes: items.reduce((sum, item) => sum + (item.skipped ? 0 : item.minutes), 0), length: settings.daily_minutes, items, finished: Boolean(finishedAt), finished_at: finishedAt },
        streak: { current: streak.current, best: streak.best, freezes_left: streak.freezes_left, practiced_today: history.practiced.has(day) },
        week: { done: week.done, goal: week.goal, met: week.met },
        phrase: seededPick(phrases, `${member.id}:${day}:phrase-of-day`) ?? null,
        shadow_target: SHADOW_TARGET,
      };
    },
  },
  {
    // "Not today": leaves a step out of the plan, say when the AI practice is not possible right now.
    method: 'POST', path: 'orgs/:org/coach/today/skip', access: 'org',
    async handle(ctx, _params, body) {
      const member = seated(ctx);
      const input = obj(body);
      const index = int(input.index, 'index', { max: 10 })!;
      const skipped = input.skipped !== false;
      const day = today(ctx);
      const plan = check<PlanRow | null>(await ctx.db.from('company_coach_plans').select(PLAN_COLUMNS).eq('member_id', member.id).eq('day', day).maybeSingle());
      if (!plan || !plan.items[index]) throw new CompanyError('plan_item_not_found', 'This step is not in today’s plan.', 404);
      const items = plan.items.map((item, position) => position === index ? { ...item, skipped } : item);
      check(await ctx.db.from('company_coach_plans').update({ items }).eq('member_id', member.id).eq('day', day));
      return { ok: true };
    },
  },
];
