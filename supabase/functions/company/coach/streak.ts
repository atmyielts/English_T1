// Streaks, weekly goals and the practice calendar, worked out from the days a person
// practised. Nothing is stored, so nothing can be lost or double counted: the same
// days always give the same answer. Rest days, leave and a few automatic freezes keep
// a normal working life from breaking a streak; there is nothing to buy or rush.
import { addDay } from './srs.ts';

/** Missed working days forgiven per calendar month, used automatically. */
export const FREEZES_PER_MONTH = 2;
/** How far back the walk goes. */
export const STREAK_WINDOW_DAYS = 800;

export interface LeaveRange { from: string; to: string }
export interface StreakInput {
  today: string;
  practiced: ReadonlySet<string>;
  /** Weekdays (0 is Sunday) that never break a streak. */
  restDays: readonly number[];
  leave: readonly LeaveRange[];
}
export type DayStatus = 'practiced' | 'frozen' | 'rest' | 'leave' | 'missed' | 'open';
export interface StreakResult {
  current: number;
  best: number;
  freezes_left: number;
  freezes_per_month: number;
  /** What each day counted as, from the first practice on. */
  days: Map<string, DayStatus>;
}

export const weekdayOf = (day: string): number => new Date(`${day}T00:00:00Z`).getUTCDay();
/** The Monday of the week holding this day (weeks run Monday to Sunday in Uzbekistan). */
export const mondayOf = (day: string): string => addDay(day, -((weekdayOf(day) + 6) % 7));

export function computeStreak({ today, practiced, restDays, leave }: StreakInput): StreakResult {
  const floor = addDay(today, -STREAK_WINDOW_DAYS);
  const first = [...practiced].filter((day) => day >= floor && day <= today).sort()[0];
  const days = new Map<string, DayStatus>();
  const used = new Map<string, number>();
  let current = 0, best = 0;
  if (first) {
    for (let day = first; day <= today; day = addDay(day, 1)) {
      if (practiced.has(day)) {
        current++;
        best = Math.max(best, current);
        days.set(day, 'practiced');
      } else if (day === today) {
        days.set(day, 'open'); // The day is not over.
      } else if (restDays.includes(weekdayOf(day))) {
        days.set(day, 'rest');
      } else if (leave.some((range) => range.from <= day && day <= range.to)) {
        days.set(day, 'leave');
      } else {
        const month = day.slice(0, 7), spent = used.get(month) ?? 0;
        if (current > 0 && spent < FREEZES_PER_MONTH) {
          used.set(month, spent + 1);
          days.set(day, 'frozen');
        } else {
          current = 0;
          days.set(day, 'missed');
        }
      }
    }
  }
  return { current, best, freezes_left: FREEZES_PER_MONTH - (used.get(today.slice(0, 7)) ?? 0), freezes_per_month: FREEZES_PER_MONTH, days };
}

/** Practice days in the week holding `today`, and the last weeks with whether the goal was met. */
export function weekGoal(today: string, practiced: ReadonlySet<string>, goal: number, weeks = 8) {
  const thisMonday = mondayOf(today);
  const history = Array.from({ length: weeks }, (_, index) => {
    const monday = addDay(thisMonday, -7 * (weeks - 1 - index));
    const count = Array.from({ length: 7 }, (_, offset) => addDay(monday, offset)).filter((day) => practiced.has(day)).length;
    return { monday, days: count, met: count >= goal };
  });
  return { done: history[weeks - 1].days, goal, met: history[weeks - 1].days >= goal, history };
}

/** The whole-week calendar ending this Sunday: `weeks` columns of seven days, for the practice grid. */
export function practiceCalendar(today: string, status: ReadonlyMap<string, DayStatus>, minutes: ReadonlyMap<string, number>, weeks = 18) {
  const start = addDay(mondayOf(today), -7 * (weeks - 1));
  return Array.from({ length: weeks * 7 }, (_, index) => {
    const day = addDay(start, index);
    return { day, status: day > today ? 'future' as const : status.get(day) ?? 'none' as const, minutes: minutes.get(day) ?? 0 };
  });
}
