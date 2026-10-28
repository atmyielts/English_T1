// "Continue anywhere": the unfinished activities a learner can pick up on any
// device (hub /resume, the Continue card on Today, "Up next").
//
// Sources:
//   * english_resume_points: the last activity opened in each skill, with
//     where they were when the skill can say (a writing draft; listening
//     answers and dictation so far). Written by the app while they work.
//   * english_roleplay_sessions: an active role-play still inside its time limit.
//   * english_speaking_mocks: a mock started and not scored yet, still resumable.
// A point is dropped once that activity was submitted after it, and after
// RESUME_MAX_AGE_DAYS. Pure: the hub loads rows and passes them in.

import { TODAY_SKILLS, type TodaySkill } from "./english-today.ts";

export const RESUME_MAX_AGE_DAYS = 7;
/** A submission this close before the point still counts as finishing it (late autosaves). */
export const RESUME_GRACE_MS = 90_000;
export const WRITING_DRAFT_MAX = 8000;
const DAY_MS = 86_400_000;

export type ResumeKind = "activity" | "roleplay" | "mock";

export type ResumePosition = {
  /** writing: the text so far. */
  draft?: string;
  /** listening: chosen options by question id, dictation by segment index, times played. */
  answers?: Record<string, number>;
  typed?: Record<string, string>;
  plays?: number;
  /** Any skill: how far through (step of total). */
  step?: number;
  total?: number;
};

export type StoredResumePoint = {
  skill: string;
  slug: string;
  title: string | null;
  position: unknown;
  updated_at: string;
};

export type ResumeItem = {
  kind: ResumeKind;
  skill: TodaySkill;
  /** Activity slug, role-play scenario id, or "mock". */
  ref: string;
  title: string | null;
  href: string;
  position: ResumePosition | null;
  /** 0..100 when known. */
  progress: number | null;
  /** For a writing draft: words written. */
  words: number | null;
  updated_at: string;
};

const isSkill = (value: unknown): value is TodaySkill => (TODAY_SKILLS as readonly string[]).includes(String(value));
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const smallInt = (value: unknown, max: number): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max ? value : undefined;
const countWords = (text: string): number => text.trim() ? text.trim().split(/\s+/).length : 0;

/** A position the server will keep for this skill, or null. Unknown fields are dropped. */
export const cleanPosition = (skill: TodaySkill, raw: unknown): ResumePosition | null => {
  if (!isObject(raw)) return null;
  const out: ResumePosition = {};
  const step = smallInt(raw.step, 500);
  const total = smallInt(raw.total, 500);
  if (step !== undefined && total !== undefined && total > 0) {
    out.step = Math.min(step, total);
    out.total = total;
  }
  if (skill === "writing" && typeof raw.draft === "string" && raw.draft.trim()) {
    out.draft = raw.draft.slice(0, WRITING_DRAFT_MAX);
  }
  if (skill === "listening") {
    if (isObject(raw.answers)) {
      const answers: Record<string, number> = {};
      for (const [id, value] of Object.entries(raw.answers).slice(0, 40)) {
        const option = smallInt(value, 9);
        if (/^[A-Za-z0-9_-]{1,64}$/.test(id) && option !== undefined) answers[id] = option;
      }
      if (Object.keys(answers).length) out.answers = answers;
    }
    if (isObject(raw.typed)) {
      const typed: Record<string, string> = {};
      for (const [index, value] of Object.entries(raw.typed).slice(0, 40)) {
        if (/^\d{1,3}$/.test(index) && typeof value === "string" && value.trim()) typed[index] = value.slice(0, 400);
      }
      if (Object.keys(typed).length) out.typed = typed;
    }
    const plays = smallInt(raw.plays, 50);
    if (plays) out.plays = plays;
  }
  return Object.keys(out).length ? out : null;
};

/** The body of a save (POST /resume), checked; null when it can't be stored. */
export const parseResumeWrite = (body: unknown): { skill: TodaySkill; slug: string; title: string | null; position: ResumePosition | null } | null => {
  if (!isObject(body) || !isSkill(body.skill)) return null;
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._~-]{0,159}$/.test(slug)) return null;
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 220) : null;
  return { skill: body.skill, slug, title, position: cleanPosition(body.skill, body.position) };
};

const progressOf = (position: ResumePosition | null): number | null =>
  position?.step !== undefined && position.total ? Math.round((position.step / position.total) * 100) : null;

export type ResumeInput = {
  now: Date;
  points: StoredResumePoint[];
  /** Latest submission per activity (skill + slug), any status that counts as done. */
  finished: Array<{ skill: string; slug: string; submitted_at: string }>;
  roleplays: Array<{ id: string; scenario_id: string; title: string | null; learner_turns: number; max_turns: number; updated_at: string }>;
  mocks: Array<{ id: string; started_at: string }>;
  roleplayTtlMs: number;
  mockResumeMs: number;
};

/** What can be continued now, newest first, at most one per skill and kind. */
export const selectResume = (input: ResumeInput): ResumeItem[] => {
  const now = input.now.getTime();
  const oldest = now - RESUME_MAX_AGE_DAYS * DAY_MS;
  const doneAt = new Map<string, number>();
  for (const row of input.finished) {
    const at = Date.parse(row.submitted_at);
    const key = `${row.skill}|${row.slug}`;
    if (Number.isFinite(at) && at > (doneAt.get(key) ?? 0)) doneAt.set(key, at);
  }

  const items: ResumeItem[] = [];
  const seen = new Set<string>();
  const points = [...input.points].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  for (const point of points) {
    const at = Date.parse(point.updated_at);
    if (!isSkill(point.skill) || !Number.isFinite(at) || at < oldest || seen.has(`activity|${point.skill}`)) continue;
    const finished = doneAt.get(`${point.skill}|${point.slug}`);
    if (finished !== undefined && finished >= at - RESUME_GRACE_MS) continue;
    seen.add(`activity|${point.skill}`);
    const position = cleanPosition(point.skill, point.position);
    items.push({
      kind: "activity",
      skill: point.skill,
      ref: point.slug,
      title: point.title,
      href: `/${point.skill}/${encodeURIComponent(point.slug)}`,
      position,
      progress: progressOf(position),
      words: position?.draft ? countWords(position.draft) : null,
      updated_at: new Date(at).toISOString(),
    });
  }

  const roleplay = [...input.roleplays]
    .filter((row) => Number.isFinite(Date.parse(row.updated_at)) && now - Date.parse(row.updated_at) < input.roleplayTtlMs && row.learner_turns > 0)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];
  if (roleplay) {
    items.push({
      kind: "roleplay",
      skill: "speaking",
      ref: roleplay.scenario_id,
      title: roleplay.title,
      href: `/roleplay/${encodeURIComponent(roleplay.scenario_id)}?session=${encodeURIComponent(roleplay.id)}`,
      position: { step: Math.min(roleplay.learner_turns, roleplay.max_turns), total: roleplay.max_turns },
      progress: roleplay.max_turns ? Math.round((Math.min(roleplay.learner_turns, roleplay.max_turns) / roleplay.max_turns) * 100) : null,
      words: null,
      updated_at: new Date(Date.parse(roleplay.updated_at)).toISOString(),
    });
  }

  const mock = [...input.mocks]
    .filter((row) => Number.isFinite(Date.parse(row.started_at)) && now - Date.parse(row.started_at) < input.mockResumeMs)
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))[0];
  if (mock) {
    items.push({
      kind: "mock",
      skill: "speaking",
      ref: "mock",
      title: null,
      href: "/speaking-mock",
      position: null,
      progress: null,
      words: null,
      updated_at: new Date(Date.parse(mock.started_at)).toISOString(),
    });
  }

  return items.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
};
