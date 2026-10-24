// Level history: every placement, monthly check and move-up is kept in
// learner_language_goals.metadata.level_history so learners can see how far
// they have come. Pure helpers; the hub reads and writes the metadata.
import { type Cefr, isCefr } from "./english-today.ts";

export type LevelSource = "placement" | "check" | "level_up";

export type LevelEntry = {
  at: string;
  source: LevelSource;
  overall: Cefr | null;
  per_skill: Record<string, Cefr>;
  /** How a placement or check was made: the test, or a level the learner chose. Absent on older entries. */
  method?: "test" | "self";
};

export const CHECK_INTERVAL_DAYS = 28;
const HISTORY_LIMIT = 24;

type Meta = Record<string, unknown>;

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Skill → level from a stored placement (entries are "B1" or { level: "B1" }). */
export const perSkillLevels = (placement: unknown): Record<string, Cefr> => {
  const out: Record<string, Cefr> = {};
  for (const [skill, entry] of Object.entries(asObject(asObject(placement).per_skill))) {
    const level = typeof entry === "string" ? entry : asObject(entry).level;
    if (isCefr(level)) out[skill] = level;
  }
  return out;
};

export const readLevelHistory = (meta: Meta): LevelEntry[] => {
  const raw = Array.isArray(meta.level_history) ? meta.level_history : [];
  const history = raw
    .map((entry) => asObject(entry))
    .filter((entry) => typeof entry.at === "string" && !Number.isNaN(Date.parse(String(entry.at))))
    .map((entry) => ({
      at: String(entry.at),
      source: (["placement", "check", "level_up"].includes(String(entry.source)) ? entry.source : "placement") as LevelSource,
      overall: isCefr(entry.overall) ? entry.overall : null,
      per_skill: perSkillLevels({ per_skill: entry.per_skill }),
      ...(entry.method === "test" || entry.method === "self" ? { method: entry.method as "test" | "self" } : {}),
    }));
  if (history.length) return history;
  // Learners placed before history existed: their placement is the first entry.
  const placement = asObject(meta.placement);
  if (typeof placement.completed_at !== "string") return [];
  return [{
    at: placement.completed_at,
    source: "placement",
    overall: isCefr(placement.overall_level) ? placement.overall_level : null,
    per_skill: perSkillLevels(placement),
    ...(placement.method === "test" || placement.method === "self" ? { method: placement.method as "test" | "self" } : {}),
  }];
};

/** History with one more entry, oldest first, capped. */
export const appendLevelHistory = (meta: Meta, entry: LevelEntry): LevelEntry[] =>
  [...readLevelHistory(meta), entry].slice(-HISTORY_LIMIT);

/** A check is due four weeks after the last placement or check. */
export const levelCheckStatus = (meta: Meta, now = new Date()) => {
  const last = readLevelHistory(meta)
    .filter((entry) => entry.source !== "level_up")
    .at(-1);
  if (!last) return { due: false, last_at: null as string | null, next_at: null as string | null };
  const next = new Date(Date.parse(last.at) + CHECK_INTERVAL_DAYS * 86_400_000);
  return { due: now >= next, last_at: last.at, next_at: next.toISOString() };
};
