// Badges for steady practice. Fair by design: each one rewards what a person did
// themselves, at any level and in any job, none compares people, and none can be lost.

export interface BadgeFacts {
  plans: number;
  reviews: number;
  shadow: number;
  lessons: number;
  roleplays: number;
  writing: number;
  best_streak: number;
  weeks_met: number;
  level_steps: number;
}

export const BADGES = [
  { code: 'first_plan', fact: 'plans', target: 1 },
  { code: 'plans_10', fact: 'plans', target: 10 },
  { code: 'plans_50', fact: 'plans', target: 50 },
  { code: 'reviews_100', fact: 'reviews', target: 100 },
  { code: 'reviews_500', fact: 'reviews', target: 500 },
  { code: 'shadow_25', fact: 'shadow', target: 25 },
  { code: 'lessons_5', fact: 'lessons', target: 5 },
  { code: 'roleplay_5', fact: 'roleplays', target: 5 },
  { code: 'writing_5', fact: 'writing', target: 5 },
  { code: 'streak_7', fact: 'best_streak', target: 7 },
  { code: 'streak_30', fact: 'best_streak', target: 30 },
  { code: 'weeks_4', fact: 'weeks_met', target: 4 },
  { code: 'level_up', fact: 'level_steps', target: 1 },
] as const satisfies readonly { code: string; fact: keyof BadgeFacts; target: number }[];

export type BadgeCode = (typeof BADGES)[number]['code'];
export const BADGE_CODES = BADGES.map((badge) => badge.code) as readonly BadgeCode[];

export function evaluateBadges(facts: BadgeFacts) {
  return BADGES.map((badge) => {
    const value = facts[badge.fact];
    return { code: badge.code, target: badge.target, value: Math.min(value, badge.target), earned: value >= badge.target };
  });
}
