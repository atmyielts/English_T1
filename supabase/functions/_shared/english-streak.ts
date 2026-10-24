// Streak freezes and "Win it back", as a layer over the plain streak.
//
// The plain streak (`currentStreak` in english-today.ts) stays exactly as it
// is for every other caller. This module replays the learner's activity days
// and adds two kind rules on top:
//
//   * Freeze: every 7 practice days in a row earn one freeze (at most 2 held).
//     A single missed day uses one automatically and the streak survives. Two
//     missed days in a row break the streak; the freeze used on the first of
//     them is given back, since it saved nothing.
//   * Win it back: when a streak of 3+ days breaks, the learner has the next
//     3 learner days to finish 3 activities. Doing so restores the old streak
//     (plus the days practised since). Missing days inside that window does
//     not cost anything extra.
//
// Pure functions only, derived from activity counts per learner day (UTC+5),
// so nothing has to be stored and the result is the same on every device.

export const FREEZE_EARN_DAYS = 7;
export const MAX_FREEZES = 2;
export const COMEBACK_DAYS = 3;
export const COMEBACK_ACTIVITIES = 3;
export const MIN_COMEBACK_STREAK = 3;
const DAY_MS = 86_400_000;
const SHOW_WON_DAYS = 2;

export type Comeback = {
  status: "open" | "won" | "lost";
  /** The streak that broke and can be restored. */
  old_streak: number;
  /** First and last learner day of the window, inclusive. */
  starts: string;
  ends: string;
  done: number;
  needed: number;
  /** The day the third activity was finished. */
  won_on: string | null;
};

export type StreakGuard = {
  /** The streak with freezes and won-back streaks applied. */
  current: number;
  freezes: number;
  max_freezes: number;
  /** Practice days until the next freeze; null while holding the maximum. */
  next_freeze_in: number | null;
  /** Days a freeze covered, newest last (last 30 days only). */
  frozen_days: string[];
  today_done: boolean;
  /** A streak is running and today has no activity yet. */
  at_risk: boolean;
  /** An open challenge, or one won in the last two days (to celebrate). */
  comeback: Comeback | null;
};

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));

/** Activities per learner day from submission times, using `toDate` (e.g. learnerDate). */
export const countByDay = (submittedAt: string[], toDate: (at: string) => string): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const at of submittedAt) {
    if (!Number.isFinite(Date.parse(at))) continue;
    const day = toDate(at);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return counts;
};

/**
 * Replays every day from the first activity to `today` (the learner's date).
 * `today` itself is never counted as missed: the day is not over yet.
 */
export const streakGuard = (counts: Map<string, number>, today: string): StreakGuard => {
  const empty: StreakGuard = {
    current: 0,
    freezes: 0,
    max_freezes: MAX_FREEZES,
    next_freeze_in: FREEZE_EARN_DAYS,
    frozen_days: [],
    today_done: false,
    at_risk: false,
    comeback: null,
  };
  if (!isDate(today)) return empty;
  const active = [...counts.entries()].filter(([day, count]) => count > 0 && isDate(day) && day <= today).map(([day]) => day).sort();
  if (!active.length) return empty;

  let streak = 0;
  let freezes = 0;
  let earn = 0;
  let pendingFreeze: string | null = null;
  const frozen: string[] = [];
  let comeback: Comeback | null = null;
  let windowDays = 0;

  const breakStreak = (day: string) => {
    const old = streak;
    streak = 0;
    earn = 0;
    pendingFreeze = null;
    windowDays = 0;
    comeback = old >= MIN_COMEBACK_STREAK
      ? { status: "open", old_streak: old, starts: addDays(day, 1), ends: addDays(day, COMEBACK_DAYS), done: 0, needed: COMEBACK_ACTIVITIES, won_on: null }
      : null;
  };

  const earnDay = () => {
    earn += 1;
    if (earn >= FREEZE_EARN_DAYS) {
      earn = 0;
      freezes = Math.min(MAX_FREEZES, freezes + 1);
    }
  };

  for (let day = active[0]!; day <= today; day = addDays(day, 1)) {
    const count = counts.get(day) ?? 0;
    const isToday = day === today;
    const open = comeback as Comeback | null;

    if (open && open.status === "open" && day > open.ends) open.status = "lost";

    if (open && open.status === "open" && day >= open.starts) {
      // Inside the window: a fresh streak runs, and three activities bring the old one back.
      if (count > 0) {
        streak += 1;
        windowDays += 1;
        earnDay();
        open.done += count;
        if (open.done >= open.needed) {
          open.done = open.needed;
          open.status = "won";
          open.won_on = day;
          streak = open.old_streak + windowDays;
        }
      } else if (!isToday) {
        streak = 0;
        earn = 0;
      }
      continue;
    }

    if (count > 0) {
      streak += 1;
      pendingFreeze = null;
      earnDay();
      continue;
    }
    if (isToday || streak === 0) continue;
    if (pendingFreeze) {
      // Second missed day in a row: the streak breaks and the freeze comes back.
      frozen.pop();
      freezes = Math.min(MAX_FREEZES, freezes + 1);
      breakStreak(day);
    } else if (freezes > 0) {
      freezes -= 1;
      frozen.push(day);
      pendingFreeze = day;
    } else {
      breakStreak(day);
    }
  }

  const todayDone = (counts.get(today) ?? 0) > 0;
  const last = comeback as Comeback | null;
  const showComeback = last && (
    last.status === "open"
    || (last.status === "won" && last.won_on !== null && last.won_on >= addDays(today, -SHOW_WON_DAYS))
  );
  return {
    current: streak,
    freezes,
    max_freezes: MAX_FREEZES,
    next_freeze_in: freezes >= MAX_FREEZES ? null : FREEZE_EARN_DAYS - earn,
    frozen_days: frozen.filter((day) => day >= addDays(today, -30)),
    today_done: todayDone,
    at_risk: !todayDone && streak > 0,
    comeback: showComeback ? { ...last } : null,
  };
};
