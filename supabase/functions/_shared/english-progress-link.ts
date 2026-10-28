// Read-only progress links for parents and teachers (/p/:token).
//
// Pure: token creation and checks, and what the public page may show. The
// token is 24 random bytes (base64url, 32 characters); only its SHA-256 hash
// is stored, so a database read never reveals a working link. The page shows
// a first name, levels, streak, this week's practice, recent badges and the
// three most common kinds of mistake: never an email, a surname or anything
// the learner wrote.

import { topicFromSubskill } from "./english-mistakes.ts";
import { type Cefr, isCefr, TODAY_SKILLS, type TodaySkill } from "./english-today.ts";
import { summarizeWeek, type WeekAttempt, type WeekSummary } from "./english-weekly-report.ts";

export const PROGRESS_TOKEN_LENGTH = 32;
export const MAX_ACTIVE_PROGRESS_LINKS = 5;
export const MAX_WATCHERS_PER_LINK = 5;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const generateProgressToken = (
  randomBytes: (size: number) => Uint8Array = (size) => crypto.getRandomValues(new Uint8Array(size)),
): string => base64url(randomBytes(24));

export const isProgressToken = (value: unknown): value is string => typeof value === "string" && TOKEN_PATTERN.test(value);

/** Hex SHA-256 of a token: what the database stores and looks up. */
export const hashProgressToken = async (token: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const tokenHint = (token: string): string => token.slice(-4);

/** An optional label ("Mum", "Teacher"): trimmed, one line, at most 40 characters. */
export const cleanLinkLabel = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  // deno-lint-ignore no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim();
  return text ? Array.from(text).slice(0, 40).join("") : null;
};

export const progressPageUrl = (appUrl: string, token: string) => `${appUrl.replace(/\/$/, "")}/p/${token}`;

// === The public page ===

export type PublicMistake = { kind: "topic"; topic: string; count: number } | { kind: "skill"; skill: TodaySkill; count: number };

export type PublicProgress = {
  first_name: string;
  level: { overall: Cefr | null; per_skill: Partial<Record<TodaySkill, Cefr>> };
  streak: number;
  week: WeekSummary;
  achievements: Array<{ key: string; earned_at: string }>;
  mistakes: PublicMistake[];
  updated_at: string;
};

/**
 * The three most common kinds of open mistake: a grammar topic, or the skill
 * the mistake was made in. Only category names and counts, never the text.
 */
export const topMistakes = (rows: Array<{ service_key?: unknown; skill_key?: unknown; subskill_key?: unknown; error_frequency?: unknown }>): PublicMistake[] => {
  const counts = new Map<string, PublicMistake>();
  for (const row of rows) {
    const times = Math.max(1, Number(row.error_frequency ?? 1) || 1);
    const topic = topicFromSubskill(String(row.subskill_key ?? ""));
    const service = row.service_key === "academy_homework" ? String(row.skill_key ?? "") : String(row.service_key ?? "");
    const key = topic ? `topic:${topic}` : `skill:${service}`;
    if (!topic && !(TODAY_SKILLS as readonly string[]).includes(service)) continue;
    const entry = counts.get(key) ?? (topic ? { kind: "topic" as const, topic, count: 0 } : { kind: "skill" as const, skill: service as TodaySkill, count: 0 });
    entry.count += times;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 3);
};

export const composePublicProgress = (input: {
  firstName: string;
  goal: { current_cefr_estimate?: unknown; per_skill?: Record<string, unknown> } | null;
  streak: number;
  attempts: WeekAttempt[];
  weekFrom: string;
  weekTo: string;
  badges: Array<{ badge_key?: unknown; earned_at?: unknown }>;
  mistakes: Array<{ service_key?: unknown; skill_key?: unknown; subskill_key?: unknown; error_frequency?: unknown }>;
  now: Date;
}): PublicProgress => {
  const perSkill: Partial<Record<TodaySkill, Cefr>> = {};
  for (const skill of TODAY_SKILLS) {
    const entry = input.goal?.per_skill?.[skill];
    const level = typeof entry === "string" ? entry : (entry as Record<string, unknown> | undefined)?.level;
    if (isCefr(level)) perSkill[skill] = level;
  }
  return {
    first_name: input.firstName,
    level: { overall: isCefr(input.goal?.current_cefr_estimate) ? input.goal!.current_cefr_estimate as Cefr : null, per_skill: perSkill },
    streak: Math.max(0, Math.floor(input.streak)),
    week: summarizeWeek(input.attempts, input.weekFrom, input.weekTo),
    achievements: input.badges
      .filter((badge) => typeof badge.badge_key === "string" && typeof badge.earned_at === "string")
      .map((badge) => ({ key: String(badge.badge_key), earned_at: String(badge.earned_at) }))
      .sort((a, b) => b.earned_at.localeCompare(a.earned_at))
      .slice(0, 6),
    mistakes: topMistakes(input.mistakes),
    updated_at: input.now.toISOString(),
  };
};
