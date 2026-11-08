// The learner's own progress: streak, weekly goal, points, practice calendar, badges and
// then-versus-now test scores. It all comes from company_activity, the coach log and graded
// company tests, so the points here are the same points insights and challenges count.
// Nobody else can read this page.
import { isLevel, levelIndex, SKILLS } from '../../../../packages/company-core/src/mod.ts';
import { englishVisibleFrom } from '../insights/english.ts';
import { fetchAll } from '../people/shared.ts';
import { memberProgress } from '../training/lessons.ts';
import { check, CompanyError, type Ctx, type MemberRow, type Route } from '../types.ts';
import { inChunks, int, isCalendarDate, obj, tashkentDay } from '../util.ts';
import { evaluateBadges, type BadgeFacts } from './badges.ts';
import { deckCounts, syncDeck } from './deck.ts';
import { countLog, readSettings, saveSettings, seated, today, type SettingsRow } from './shared.ts';
import { addDay, daysBetween } from './srs.ts';
import { computeStreak, mondayOf, practiceCalendar, weekGoal, type LeaveRange } from './streak.ts';

/** Learning kinds. A test is an assessment, not practice, so it does not hold up a streak. */
const PRACTICE_KINDS = new Set(['lesson', 'lesson_retry', 'roleplay', 'writing', 'glossary', 'session', 'english']);
const MAX_LEAVE_DAYS = 60;
const MAX_LEAVE_RANGES = 24;

interface ActivityRow { kind: string; minutes: number; points: number; created_at: string }

export async function practiceHistory(ctx: Ctx, member: MemberRow) {
  const rows = await fetchAll<ActivityRow>(() => ctx.db.from('company_activity').select('kind,minutes,points,created_at').eq('org_id', ctx.org!.id).eq('member_id', member.id).order('id'));
  // Schood English time counts only from when the person joined and agreed.
  const englishFrom = englishVisibleFrom(member, ctx.now()).toISOString();
  const counted = rows.filter((row) => row.kind !== 'english' || row.created_at >= englishFrom);
  const practiced = new Set<string>();
  const minutes = new Map<string, number>();
  for (const row of counted) {
    if (!PRACTICE_KINDS.has(row.kind)) continue;
    const day = tashkentDay(new Date(row.created_at));
    practiced.add(day);
    minutes.set(day, (minutes.get(day) ?? 0) + (row.minutes ?? 0));
  }
  return { rows: counted, practiced, minutes };
}

export function streakOf(today: string, practiced: ReadonlySet<string>, settings: SettingsRow) {
  return computeStreak({ today, practiced, restDays: settings.rest_days, leave: settings.leave });
}

interface AttemptRow { id: string; assessment_id: string; overall_level: string | null; overall_score: number | null; skill_results: Record<string, { score?: unknown; level?: unknown }> | null; graded_at: string | null }

/** The first and the latest graded company test, side by side, with each skill's movement. */
export async function thenAndNow(ctx: Ctx, member: MemberRow) {
  const attempts = check<AttemptRow[]>(await ctx.db.from('company_attempts').select('id,assessment_id,overall_level,overall_score,skill_results,graded_at').eq('org_id', ctx.org!.id).eq('member_id', member.id).eq('status', 'graded').order('graded_at').limit(200));
  if (!attempts.length) return { first: null, latest: null, tests: 0, skills: [], level_steps: 0 };
  const first = attempts[0], latest = attempts[attempts.length - 1];
  const titles = new Map((await inChunks([...new Set([first.assessment_id, latest.assessment_id])], async (chunk) => check<{ id: string; title: string }[]>(await ctx.db.from('company_assessments').select('id,title').eq('org_id', ctx.org!.id).in('id', chunk)))).map((row) => [row.id, row.title]));
  const view = (row: AttemptRow) => ({ title: titles.get(row.assessment_id) ?? null, level: row.overall_level, score: row.overall_score === null ? null : Number(row.overall_score), graded_at: row.graded_at });
  const score = (row: AttemptRow, skill: string) => {
    const value = Number(row.skill_results?.[skill]?.score);
    return Number.isFinite(value) ? Math.round(value) : null;
  };
  // The best level since the first test, so a weaker day later does not take a badge back.
  const start = isLevel(first.overall_level) ? levelIndex(first.overall_level) : null;
  const steps = start === null ? 0 : Math.max(0, ...attempts.map((row) => isLevel(row.overall_level) ? levelIndex(row.overall_level) - start : 0));
  return {
    first: view(first), latest: attempts.length > 1 ? view(latest) : null, tests: attempts.length, level_steps: steps,
    skills: attempts.length > 1 ? SKILLS.map((skill) => ({ skill, then: score(first, skill), now: score(latest, skill) })).filter((row) => row.then !== null || row.now !== null) : [],
  };
}

/** Everything the badges look at. Shared with the team feed, which checks a badge before sharing it. */
export async function badgeFacts(ctx: Ctx, member: MemberRow, history: Awaited<ReturnType<typeof practiceHistory>>, settings: SettingsRow, levelSteps: number): Promise<BadgeFacts> {
  const day = today(ctx);
  const streak = streakOf(day, history.practiced, settings);
  const lessons = (await memberProgress(ctx, member.id)).filter((row) => row.status === 'completed').length;
  // Weeks with three practice days, whatever the personal goal is now, so changing the goal never takes a badge back.
  const firstDay = [...history.practiced].sort()[0];
  const weeks = firstDay ? Math.min(160, Math.floor(daysBetween(mondayOf(firstDay), day) / 7) + 1) : 0;
  return {
    plans: await countLog(ctx, member, ['plan_done']),
    reviews: await countLog(ctx, member, ['review']),
    shadow: await countLog(ctx, member, ['shadow']),
    lessons,
    roleplays: history.rows.filter((row) => row.kind === 'roleplay').length,
    writing: history.rows.filter((row) => row.kind === 'writing').length,
    best_streak: streak.best,
    weeks_met: weeks ? weekGoal(day, history.practiced, 3, weeks).history.filter((week) => week.met).length : 0,
    level_steps: levelSteps,
  };
}

function settingsView(settings: SettingsRow, day: string) {
  const leave = settings.leave.filter((range) => range.to >= day).sort((a, b) => a.from < b.from ? -1 : 1)[0] ?? null;
  return { weekly_goal: settings.weekly_goal, daily_minutes: settings.daily_minutes, rest_days: settings.rest_days, leave, kudos_opt_in: settings.kudos_opt_in };
}

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/coach/progress', access: 'org',
    async handle(ctx) {
      const member = seated(ctx);
      const day = today(ctx);
      const settings = await syncDeck(ctx, member, await readSettings(ctx, member));
      const history = await practiceHistory(ctx, member);
      const streak = streakOf(day, history.practiced, settings);
      const monday = mondayOf(day);
      const weekRows = history.rows.filter((row) => tashkentDay(new Date(row.created_at)) >= monday);
      const scores = await thenAndNow(ctx, member);
      const facts = await badgeFacts(ctx, member, history, settings, scores.level_steps);
      const counts = await deckCounts(ctx, member, day);
      const sum = (rows: ActivityRow[], key: 'minutes' | 'points') => rows.reduce((total, row) => total + (row[key] ?? 0), 0);
      return {
        day,
        streak: { current: streak.current, best: streak.best, freezes_left: streak.freezes_left, freezes_per_month: streak.freezes_per_month, practiced_today: history.practiced.has(day) },
        week: weekGoal(day, history.practiced, settings.weekly_goal),
        points: { week: sum(weekRows, 'points'), total: sum(history.rows, 'points') },
        minutes: { week: sum(weekRows, 'minutes'), total: sum(history.rows, 'minutes') },
        calendar: practiceCalendar(day, streak.days, history.minutes),
        badges: evaluateBadges(facts),
        facts,
        scores,
        level: { current: member.level, target: member.target_level, target_date: member.target_date },
        deck: counts,
        settings: settingsView(settings, day),
        consent: Boolean(member.consent_at),
      };
    },
  },
  {
    method: 'PUT', path: 'orgs/:org/coach/settings', access: 'org',
    async handle(ctx, _params, body) {
      const member = seated(ctx);
      const input = obj(body);
      const patch: Partial<SettingsRow> = {};
      if (input.weekly_goal !== undefined) patch.weekly_goal = int(input.weekly_goal, 'weekly_goal', { min: 1, max: 7 })!;
      if (input.daily_minutes !== undefined) {
        if (input.daily_minutes !== 5 && input.daily_minutes !== 10) throw new CompanyError('invalid_field', 'daily_minutes must be 5 or 10.', 400, { field: 'daily_minutes' });
        patch.daily_minutes = input.daily_minutes;
      }
      if (input.rest_days !== undefined) {
        if (!Array.isArray(input.rest_days) || input.rest_days.length > 3 || input.rest_days.some((value) => !Number.isInteger(value) || value < 0 || value > 6)) {
          throw new CompanyError('invalid_field', 'Pick up to three rest days.', 400, { field: 'rest_days' });
        }
        patch.rest_days = [...new Set(input.rest_days as number[])];
      }
      if (Object.keys(patch).length) await saveSettings(ctx, member, patch);
      return { settings: settingsView({ ...await readSettings(ctx, member), ...patch }, today(ctx)) };
    },
  },
  {
    // Leave from today until a date: those days do not touch the streak, and it picks up on return.
    method: 'POST', path: 'orgs/:org/coach/leave', access: 'org',
    async handle(ctx, _params, body) {
      const member = seated(ctx);
      const until = obj(body).until;
      const day = today(ctx);
      if (!isCalendarDate(until) || until < day || daysBetween(day, until) > MAX_LEAVE_DAYS) {
        throw new CompanyError('invalid_field', `Pick a date within the next ${MAX_LEAVE_DAYS} days.`, 400, { field: 'until', max: MAX_LEAVE_DAYS });
      }
      const settings = await readSettings(ctx, member);
      const past = settings.leave.filter((range) => range.to < day);
      const current = settings.leave.find((range) => range.to >= day && range.from <= day);
      const leave: LeaveRange[] = [...past, { from: current?.from ?? day, to: until }].slice(-MAX_LEAVE_RANGES);
      await saveSettings(ctx, member, { leave });
      return { settings: settingsView({ ...settings, leave }, day) };
    },
  },
  {
    // Back early: the leave ends yesterday, so today counts as a normal day again.
    method: 'DELETE', path: 'orgs/:org/coach/leave', access: 'org',
    async handle(ctx) {
      const member = seated(ctx);
      const day = today(ctx);
      const settings = await readSettings(ctx, member);
      const yesterday = addDay(day, -1);
      const leave = settings.leave.flatMap((range) => range.to < day ? [range] : range.from >= day ? [] : [{ from: range.from, to: yesterday }]);
      await saveSettings(ctx, member, { leave });
      return { settings: settingsView({ ...settings, leave }, day) };
    },
  },
];
