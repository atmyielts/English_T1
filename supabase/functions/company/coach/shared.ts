// Helpers every coach route shares: who is practising, their settings, the log that
// makes every event count once, and how practice reaches company_activity.
import { logActivity } from '../core.ts';
import { DAILY_POINTS } from '../training/glossary.ts';
import { learner, requireSeat, selfReportedMinutes } from '../training/shared.ts';
import { check, type Ctx, type MemberRow } from '../types.ts';
import { tashkentDay } from '../util.ts';
import type { LeaveRange } from './streak.ts';

/** The caller as a learner: a member with a working seat (a pilot includes tests only). */
export function seated(ctx: Ctx): MemberRow {
  const member = learner(ctx);
  requireSeat(ctx);
  return member;
}

export const today = (ctx: Ctx) => tashkentDay(ctx.now());

export interface SettingsRow {
  member_id: string; weekly_goal: number; daily_minutes: 5 | 10; rest_days: number[]; leave: LeaveRange[]; kudos_opt_in: boolean; sync_key: string | null;
}
export const SETTINGS_COLUMNS = 'member_id,weekly_goal,daily_minutes,rest_days,leave,kudos_opt_in,sync_key';

/** Saturday and Sunday are rest days until the person says otherwise. */
const DEFAULTS = { weekly_goal: 3, daily_minutes: 10 as const, rest_days: [0, 6], leave: [] as LeaveRange[], kudos_opt_in: false, sync_key: null };

export async function readSettings(ctx: Ctx, member: MemberRow): Promise<SettingsRow> {
  const row = check<Partial<SettingsRow> | null>(await ctx.db.from('company_coach_settings').select(SETTINGS_COLUMNS).eq('member_id', member.id).eq('org_id', ctx.org!.id).maybeSingle());
  // A column left unset keeps its default.
  const set = Object.fromEntries(Object.entries(row ?? {}).filter(([, value]) => value !== null));
  return { member_id: member.id, ...DEFAULTS, ...set } as SettingsRow;
}

/** Changes only the given settings; the first save creates the row. */
export async function saveSettings(ctx: Ctx, member: MemberRow, patch: Partial<Omit<SettingsRow, 'member_id'>>): Promise<void> {
  check(await ctx.db.from('company_coach_settings').upsert({ member_id: member.id, org_id: ctx.org!.id, user_id: member.user_id, ...patch }, { onConflict: 'member_id' }));
}

export type LogKind = 'review' | 'review_new' | 'shadow' | 'finder' | 'plan_done' | 'credit';

/** Records an event once. True when this call recorded it, false when it was already there. */
export async function logOnce(ctx: Ctx, member: MemberRow, day: string, kind: LogKind, ref: string, score: number | null = null): Promise<boolean> {
  const rows = check<{ id: unknown }[]>(await ctx.db.from('company_coach_log').upsert(
    { org_id: ctx.org!.id, member_id: member.id, user_id: member.user_id, day, kind, ref: ref.slice(0, 120), score },
    { onConflict: 'member_id,day,kind,ref', ignoreDuplicates: true },
  ).select('id'));
  return rows.length > 0;
}

export async function countLog(ctx: Ctx, member: MemberRow, kinds: readonly LogKind[], day?: string): Promise<number> {
  let query = ctx.db.from('company_coach_log').select('id', { count: 'exact', head: true }).eq('member_id', member.id).in('kind', [...kinds]);
  if (day) query = query.eq('day', day);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

const dayStart = (day: string) => new Date(`${day}T00:00:00+05:00`).toISOString();

/**
 * Adds to company_activity as `glossary` practice, so insights and challenges see it like any
 * other, under training's limits: the day's minutes and glossary points are shared, so more
 * clicks cannot top a challenge. Nothing is written once both are used up.
 */
export async function grant(ctx: Ctx, member: MemberRow, day: string, asked: { minutes: number; points: number; ref: string }): Promise<void> {
  const earlier = check<{ points: number }[]>(await ctx.db.from('company_activity').select('points').eq('member_id', member.id).eq('kind', 'glossary').gt('points', 0).gte('created_at', dayStart(day)));
  const left = Math.max(0, DAILY_POINTS - earlier.reduce((sum, row) => sum + row.points, 0));
  const minutes = asked.minutes > 0 ? await selfReportedMinutes(ctx, member.id, asked.minutes) : 0;
  const points = Math.min(left, asked.points);
  if (minutes > 0 || points > 0) await logActivity(ctx.db, { org_id: ctx.org!.id, member_id: member.id, user_id: member.user_id, kind: 'glossary', minutes, points, ref: asked.ref });
}

/** Five reviews or shadowed phrases are about two minutes of practice. */
export const EVENTS_PER_CREDIT = 5;
const CREDIT = { minutes: 2, points: 3 };

/**
 * Turns the day's practice events into activity, one credit per five. The log's unique index
 * lets each credit through once, even when two tabs answer at the same moment. A day with a
 * credit in company_activity is also what makes it a practice day for the streak.
 */
export async function creditPractice(ctx: Ctx, member: MemberRow, day: string): Promise<void> {
  const events = await countLog(ctx, member, ['review', 'shadow'], day);
  const earned = Math.floor(events / EVENTS_PER_CREDIT);
  if (!earned) return;
  const given = await countLog(ctx, member, ['credit'], day);
  for (let credit = given + 1; credit <= earned; credit++) {
    if (await logOnce(ctx, member, day, 'credit', String(credit))) await grant(ctx, member, day, { ...CREDIT, ref: 'coach:practice' });
  }
}
