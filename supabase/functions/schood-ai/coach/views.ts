import {
  dailyPlan, nodeLevel, overallScale, planWeeks, predict, recurringErrors, summarizePeriod, weeklyReport, weeksLeft,
  type CoachPack, type DayPlan, type MasteryState, type Prediction, type WeeklyReport,
} from '../../../../packages/coach-packs/src/mod.ts';
import type { CoachStore, Enrollment, Goal, Session } from './store.ts';
import { addDays, DEFAULT_TZ, localParts, weekStart, zonedTime } from './time.ts';

// Data the bot, the Mini App and the reminder cron all show: today's plan, the
// weekly report and progress. Built from stored results only.

export interface ViewDeps { store: CoachStore; pack: CoachPack; enrollment: Enrollment; now: Date }
const DAY = 86_400_000;
const tzOf = (enrollment: Enrollment) => enrollment.settings.timeZone ?? DEFAULT_TZ;

/** The plan slot a session counted for. */
export function slotOf(pack: CoachPack, session: Pick<Session, 'kind' | 'activityId' | 'mode'>): string {
  switch (session.kind) {
    case 'speaking_exam': return session.mode === 'mock' ? 'mock' : 'speaking';
    case 'roleplay': return 'roleplay';
    case 'writing': return 'writing';
    case 'quiz_set': {
      // A mini-mock is the week's mock; the mistake notebook counts as practice.
      if (session.mode === 'mock') return 'mock';
      const activity = session.activityId ? pack.byId.get(session.activityId) : undefined;
      return activity?.kind === 'quiz_set' && session.mode !== 'mistakes' ? activity.mode : 'practice';
    }
    case 'deck': return 'vocab';
    case 'drill': return 'drill';
    case 'shadowing': return 'shadowing';
    case 'lesson': return 'lesson';
    case 'photo_help': return 'photo';
    default: return 'other';
  }
}

/** The goal in force: the learner's own, or the pack default from their start. */
export function goalOf(pack: CoachPack, enrollment: Enrollment): Goal {
  return enrollment.goal ?? { target: pack.plan.goal.default, examDate: null, dailyMinutes: pack.plan.dailyMinutes.default, startedAt: enrollment.createdAt };
}

export async function masteryMap(deps: ViewDeps): Promise<Map<string, MasteryState>> {
  return new Map((await deps.store.mastery(deps.enrollment.userId, deps.pack.manifest.id)).map((row) => [row.node, row]));
}

export async function todayPlan(deps: ViewDeps): Promise<DayPlan> {
  const { store, pack, enrollment, now } = deps;
  const tz = tzOf(enrollment), local = localParts(now, tz);
  const [mastery, recent, dueCards] = await Promise.all([
    masteryMap(deps),
    store.sessions(enrollment.userId, pack.manifest.id, { limit: 60, status: 'finished', since: new Date(now.getTime() - 45 * DAY).toISOString() }),
    store.countDue(enrollment.userId, pack.manifest.id, now.toISOString()),
  ]);
  const monday = zonedTime(weekStart(local.day), '00:00', tz).getTime();
  const mockId = pack.plan.weeklyMock?.activity;
  return dailyPlan({
    pack, goal: goalOf(pack, enrollment), mastery,
    recent: recent.map((session) => ({ activityId: session.activityId ?? '', slot: slotOf(pack, session), at: session.finishedAt ?? session.startedAt, part: session.mode })),
    dueCards,
    recurring: recurringErrors([...mastery.values()], now),
    today: local.day, weekday: local.weekday,
    mockDoneThisWeek: recent.some((session) => session.activityId === mockId && session.mode === 'mock' && Date.parse(session.finishedAt ?? session.startedAt) >= monday),
    seed: enrollment.userId,
  });
}

export interface WeekView { from: string; to: string; report: WeeklyReport; hasData: boolean }

/** This week (Monday to now, local) against last week and the learner's first week. */
export async function weekView(deps: ViewDeps, weekOf?: string): Promise<WeekView> {
  const { store, pack, enrollment, now } = deps;
  const tz = tzOf(enrollment), today = localParts(now, tz).day;
  const monday = weekStart(weekOf && /^\d{4}-\d{2}-\d{2}$/.test(weekOf) && weekOf <= today ? weekOf : today);
  const startOf = (day: string) => zonedTime(day, '00:00', tz).toISOString();
  const from = startOf(monday), to = startOf(addDays(monday, 7)), prevFrom = startOf(addDays(monday, -7));
  const firstDay = localParts(new Date(enrollment.createdAt), tz).day;
  const baseFrom = startOf(firstDay), baseTo = startOf(addDays(firstDay, 7));
  const since = baseFrom < prevFrom ? baseFrom : prevFrom;
  const [sessions, turns, cards] = await Promise.all([
    store.sessions(enrollment.userId, pack.manifest.id, { limit: 1000, status: 'finished', since }),
    store.learnerTurns(enrollment.userId, pack.manifest.id, since),
    store.cardReviews(enrollment.userId, pack.manifest.id, since),
  ]);
  const data = {
    sessions: sessions.map((session) => ({
      rubric: session.rubric, overall: session.overall, criteria: (session.summary.criteria ?? {}) as Record<string, number | null>, minutes: session.minutes,
      at: session.finishedAt ?? session.startedAt, kind: session.kind, quiz: (session.summary.quiz ?? null) as { mode: string; correct: number; total: number } | null,
    })),
    turns: turns.filter((turn) => typeof turn.metrics.words === 'number').map((turn) => ({
      at: turn.createdAt, words: Number(turn.metrics.words ?? 0), wpm: (turn.metrics.wpm ?? null) as number | null, fillersPerMinute: (turn.metrics.fillersPerMinute ?? null) as number | null,
      fillersPer100: (turn.metrics.fillersPer100 ?? null) as number | null, range: (turn.metrics.range ?? null) as number | null, errors: Array.isArray(turn.metrics.errors) ? turn.metrics.errors.map(String) : [],
    })),
    cards,
  };
  const dayOf = (at: string) => localParts(new Date(at), tz).day;
  const current = summarizePeriod(from, to, data, dayOf);
  const previous = summarizePeriod(prevFrom, from, data, dayOf);
  const baseline = baseFrom < from ? summarizePeriod(baseFrom, baseTo, data, dayOf) : null;
  const hasPrevious = previous.sessions > 0 || previous.cards.reviewed > 0;
  return { from: monday, to: addDays(monday, 6), report: weeklyReport(pack, current, hasPrevious ? previous : null, baseline), hasData: current.sessions > 0 || current.cards.reviewed > 0 };
}

export interface ProgressView {
  skills: { node: string; level: number | null; mastery: number; evidence: number }[];
  forecasts: { rubric: string; prediction: Prediction; points: { at: string; value: number }[] }[];
  errors: { tag: string; weight: number; count: number }[];
  streak: { current: number; best: number; minutes: number };
  weeksLeft: number;
  daysLeft: number | null;
}

export async function progressView(deps: ViewDeps): Promise<ProgressView> {
  const { store, pack, enrollment, now } = deps;
  const mastery = await masteryMap(deps);
  const goal = goalOf(pack, enrollment);
  const today = localParts(now, tzOf(enrollment)).day;
  const left = weeksLeft(goal, today, pack.plan.goal.defaultWeeks);
  const forecasts = [];
  for (const rubric of pack.rubrics) {
    const sessions = await store.results(enrollment.userId, pack.manifest.id, { rubric: rubric.id, limit: 40 });
    const points = sessions.map((session) => ({ at: session.finishedAt ?? session.startedAt, value: session.overall! })).reverse();
    forecasts.push({ rubric: rubric.id, prediction: predict(overallScale(rubric), points, left.weeks, rubric.overall.round), points });
  }
  // A last-known streak that has lapsed reads as zero.
  const lapsed = enrollment.lastActiveDay && enrollment.lastActiveDay < addDays(today, -1);
  return {
    skills: pack.manifest.skills.map((skill) => ({ node: skill.id, level: nodeLevel(pack, mastery, skill.id), mastery: mastery.get(skill.id)?.mastery ?? 0, evidence: mastery.get(skill.id)?.evidence ?? 0 })),
    forecasts,
    errors: recurringErrors([...mastery.values()], now),
    streak: { current: lapsed ? 0 : enrollment.streakCurrent, best: enrollment.streakBest, minutes: enrollment.verifiedMinutes },
    weeksLeft: left.weeks,
    daysLeft: goal.examDate ? left.days : null,
  };
}

export const planView = (pack: CoachPack, enrollment: Enrollment, now: Date) => {
  const goal = goalOf(pack, enrollment), today = localParts(now, tzOf(enrollment)).day;
  return { goal, weeks: planWeeks(pack, goal, today), left: weeksLeft(goal, today, pack.plan.goal.defaultWeeks) };
};
