// Schood English app activity for one learner (only with consent and a seat).
// Read defensively: these tables belong to Schood English, so any missing
// table, column or error simply means "nothing to show".
//   languages                      → the English language id (code 'en')
//   learner_language_goals         → current_cefr_estimate, target_cefr, daily_time_minutes
//   learning_attempts              → submitted activities: skill, time spent, accuracy
//   learner_review_answer_log      → review answers (count only)
//   learner_badges                 → badges earned (count only)
// XP follows the hub's rule (supabase/functions/_shared/english-xp.ts): 10 per
// activity plus up to 10 for accuracy, best result per activity per day.
// Private AI-tutor chats (english_tutor_*) are never read.
import { isLevel, type Level } from '../../../../packages/company-core/src/mod.ts';
import type { Db } from '../types.ts';
import { addDays, DAY, dayStart, localDate, weekOf } from './common.ts';

export interface EnglishSummary {
  level: Level | null;
  target: Level | null;
  daily_goal_minutes: number | null;
  days: number;
  activities: number;
  minutes: number;
  active_days: number;
  xp: number;
  reviews: number | null;
  badges: number | null;
  skills: Record<string, { activities: number; minutes: number; accuracy: number | null }>;
  weeks: { week: string; minutes: number; activities: number }[];
  last_at: string | null;
}

const ENGLISH_SKILLS = ['reading', 'listening', 'writing', 'speaking', 'grammar', 'vocabulary', 'immersion'];

async function read<T>(run: () => PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  try {
    const { data, error } = await run();
    return error ? null : data;
  } catch {
    return null;
  }
}

const cefr = (value: unknown): Level | null => {
  const lower = String(value ?? '').trim().toLowerCase();
  return isLevel(lower) ? lower : null;
};

/** The learner's Schood English activity over the last `days` days, or null when none can be read. */
export async function englishSummary(db: Db, userId: string, now: Date, days = 30): Promise<EnglishSummary | null> {
  const language = await read<{ id: string } | null>(() => db.from('languages').select('id').eq('code', 'en').limit(1).maybeSingle());
  if (!language?.id) return null;
  const firstWeek = addDays(weekOf(localDate(now)), -7 * 7);
  const windowStart = now.getTime() - days * DAY;
  // Read back to the first of the eight weekly bars (at least `days` days).
  const since = new Date(Math.min(windowStart, dayStart(firstWeek).getTime())).toISOString();
  const [goal, attempts, reviews, badges] = await Promise.all([
    read<Record<string, unknown> | null>(() => db.from('learner_language_goals').select('current_cefr_estimate,target_cefr,daily_time_minutes').eq('user_id', userId).eq('language_id', language.id).maybeSingle()),
    read<Record<string, unknown>[]>(() => db.from('learning_attempts').select('id,content_item_id,service_key,time_spent_seconds,correctness_ratio,overall_score,submitted_at')
      .eq('user_id', userId).eq('language_id', language.id).in('status', ['submitted', 'scored', 'failed']).gte('submitted_at', since)
      .order('submitted_at', { ascending: false }).limit(1000)),
    read<unknown>(() => db.from('learner_review_answer_log').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('language_id', language.id).gte('answered_at', new Date(windowStart).toISOString())
      .then((result: { count?: number | null; error: unknown }) => ({ data: result.error ? null : result.count ?? 0, error: result.error }))),
    read<unknown>(() => db.from('learner_badges').select('badge_key', { count: 'exact', head: true }).eq('user_id', userId).eq('language_id', language.id)
      .then((result: { count?: number | null; error: unknown }) => ({ data: result.error ? null : result.count ?? 0, error: result.error }))),
  ]);
  if (!goal && !attempts) return null;

  const skills: EnglishSummary['skills'] = {};
  const accuracy: Record<string, number[]> = {};
  const dayset = new Set<string>();
  const best = new Map<string, number>();
  const weeks = new Map<string, { week: string; minutes: number; activities: number }>();
  for (let index = 0; index < 8; index++) {
    const week = addDays(firstWeek, index * 7);
    weeks.set(week, { week, minutes: 0, activities: 0 });
  }
  let minutes = 0, activities = 0, lastAt: string | null = null;
  for (const row of attempts ?? []) {
    if (!row.submitted_at) continue;
    const at = Date.parse(String(row.submitted_at));
    if (!Number.isFinite(at)) continue;
    const day = localDate(at);
    const spent = Math.min(180, Math.max(0, Number(row.time_spent_seconds) || 0) / 60);
    const week = weeks.get(weekOf(day));
    if (week) { week.minutes += spent; week.activities += 1; }
    if (!lastAt || at > Date.parse(lastAt)) lastAt = new Date(at).toISOString();
    if (at < windowStart) continue;
    const skill = ENGLISH_SKILLS.includes(String(row.service_key)) ? String(row.service_key) : 'other';
    const raw = row.correctness_ratio ?? row.overall_score;
    const ratio = raw === null || raw === undefined ? Number.NaN : Number(raw);
    const entry = skills[skill] ??= { activities: 0, minutes: 0, accuracy: null };
    entry.activities += 1;
    entry.minutes += spent;
    if (Number.isFinite(ratio)) (accuracy[skill] ??= []).push(Math.max(0, Math.min(1, ratio)));
    minutes += spent;
    activities += 1;
    dayset.add(day);
    const key = `${day}|${row.content_item_id ?? row.id}`;
    const xp = 10 + (Number.isFinite(ratio) ? Math.round(Math.max(0, Math.min(1, ratio)) * 10) : 0);
    best.set(key, Math.max(best.get(key) ?? 0, xp));
  }
  for (const [skill, values] of Object.entries(accuracy)) {
    if (skills[skill] && values.length) skills[skill].accuracy = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100);
  }
  for (const entry of Object.values(skills)) entry.minutes = Math.round(entry.minutes);
  const goalMinutes = Number(goal?.daily_time_minutes);
  return {
    level: cefr(goal?.current_cefr_estimate),
    target: cefr(goal?.target_cefr),
    daily_goal_minutes: Number.isFinite(goalMinutes) && goalMinutes > 0 ? goalMinutes : null,
    days,
    activities,
    minutes: Math.round(minutes),
    active_days: dayset.size,
    xp: [...best.values()].reduce((sum, value) => sum + value, 0),
    reviews: typeof reviews === 'number' ? reviews : null,
    badges: typeof badges === 'number' ? badges : null,
    skills,
    weeks: [...weeks.values()].map((week) => ({ ...week, minutes: Math.round(week.minutes) })),
    last_at: lastAt,
  };
}
