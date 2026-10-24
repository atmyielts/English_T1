// In-app inbox for Schood English: one place for notices (the bell in the
// top bar and the Inbox page). Table: english_inbox (service role only).
//
// Two ways a notice gets in:
//
//  1. Derived (deriveInbox, below): the hub works notices out from data that
//     already exists every time the inbox is read, and stores each one the
//     first time it is shown so "read" survives across devices. "Live" kinds
//     (review_due, streak_risk, check_ready, service_paused) are shown only
//     while they are still true, with today's numbers.
//
//  2. Pushed: any edge function can add a notice with pushInbox():
//
//       import { pushInbox } from "../_shared/english-inbox.ts";
//       await pushInbox(sb, userId, {
//         kind: "assignment_due",                 // one of INBOX_KINDS
//         key: `assignment:${assignmentId}`,      // one notice per key per learner
//         params: { title: "Essay 3", due: "2026-11-02" },  // used by the app's text
//         link: "/writing",                       // an English app path (optional)
//         expiresAt: "2026-11-03T00:00:00Z",      // hide after (optional)
//       });
//
//     It never throws (a notice must not break the caller) and returns
//     whether a new row was added. Pushing the same key again does nothing.
//     For an operator message use kind "system" with `title` and `body`.
//     To show a new kind, add it to INBOX_KINDS and give it text in the
//     app (apps/english-hub/src/i18n/glue.*.ts, keys inbox.kind.<kind>.*).

import { type Cefr, CEFR_ORDER } from "./english-today.ts";
import type { LevelEntry } from "./english-levels.ts";
import { learnerDate } from "./english-xp.ts";

export const INBOX_KINDS = [
  "level_up",
  "badge",
  "streak_risk",
  "review_due",
  "check_ready",
  "assignment_due",
  "weekly_report",
  "certificate",
  "service_paused",
  "system",
] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];

/** Shown only while still true, with fresh numbers; never shown from storage alone. */
export const LIVE_KINDS: readonly InboxKind[] = ["review_due", "streak_risk", "check_ready", "service_paused"];

const LEARNER_UTC_OFFSET_MS = 5 * 3_600_000;
const DAY_MS = 86_400_000;
/** Level changes and badges older than this are not announced any more. */
export const ANNOUNCE_DAYS = 14;
/** The streak is "at risk" from this learner-local hour on a day without practice. */
export const STREAK_RISK_HOUR = 16;
export const INBOX_LIMIT = 40;

export type InboxParams = Record<string, string | number | boolean | null>;

export type InboxItemInput = {
  kind: InboxKind;
  /** One notice per learner per key, e.g. "badge:streak_7". */
  key: string;
  params?: InboxParams;
  title?: string | null;
  body?: string | null;
  /** An English app path ("/progress"); anything else is dropped. */
  link?: string | null;
  createdAt?: string | null;
  expiresAt?: string | null;
};

/** A stored row (english_inbox). */
export type InboxRow = {
  id: string;
  kind: string;
  dedupe_key: string;
  params: unknown;
  title: string | null;
  body: string | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
  expires_at: string | null;
};

export type InboxView = {
  id: string;
  kind: InboxKind;
  key: string;
  params: InboxParams;
  title: string | null;
  body: string | null;
  link: string | null;
  created_at: string;
  read: boolean;
  live: boolean;
};

export const isInboxKind = (value: unknown): value is InboxKind => (INBOX_KINDS as readonly string[]).includes(String(value));

const cleanText = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
};

/** Only app-internal paths, so a notice can never send a learner elsewhere. */
export const cleanLink = (value: unknown): string | null => {
  const link = cleanText(value, 300);
  return link && /^\/(?!\/)[A-Za-z0-9\-._~/%?=&#:+]*$/.test(link) ? link : null;
};

const cleanParams = (value: unknown): InboxParams => {
  const out: InboxParams = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 12)) {
    if (!/^[a-z_]{1,32}$/.test(key)) continue;
    if (typeof raw === "string") out[key] = raw.slice(0, 200);
    else if (typeof raw === "number" && Number.isFinite(raw)) out[key] = raw;
    else if (typeof raw === "boolean" || raw === null) out[key] = raw;
  }
  return out;
};

const isoOrNull = (value: unknown): string | null =>
  typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

/** The row to insert for a notice, or null when it is not valid. */
export const inboxRow = (userId: string, item: InboxItemInput) => {
  const key = cleanText(item.key, 160);
  if (!userId || !isInboxKind(item.kind) || !key || key.length < 3) return null;
  return {
    user_id: userId,
    kind: item.kind,
    dedupe_key: key,
    params: cleanParams(item.params),
    title: cleanText(item.title, 160),
    body: cleanText(item.body, 600),
    link: cleanLink(item.link),
    created_at: isoOrNull(item.createdAt) ?? new Date().toISOString(),
    expires_at: isoOrNull(item.expiresAt),
  };
};

/**
 * Adds one notice to a learner's inbox. Safe to call from any edge function
 * with a service-role client: never throws, ignores a key already used.
 * Returns true when a new notice was added.
 */
export const pushInbox = async (sb: any, userId: string, item: InboxItemInput): Promise<boolean> => {
  const row = inboxRow(userId, item);
  if (!row) return false;
  try {
    const { data, error } = await sb.from("english_inbox")
      .upsert(row, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
      .select("id");
    if (error) {
      console.error(JSON.stringify({ event: "english_inbox_push_failed", kind: item.kind, message: error.message }));
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (error) {
    console.error(JSON.stringify({ event: "english_inbox_push_failed", kind: item.kind, message: String((error as Error)?.message ?? error) }));
    return false;
  }
};

// --- Derived notices ----------------------------------------------------------

export type InboxFacts = {
  now: Date;
  /** Level history, oldest first. */
  levels: LevelEntry[];
  badges: Array<{ key: string; earned_at: string }>;
  certificates: Array<{ code: string; overall: string; issued_at: string }>;
  streak: { current: number; at_risk: boolean } | null;
  /** Words and missed questions due now. */
  dueReviews: number;
  check: { due: boolean; next_at: string | null };
  /** Paused services the learner would use (their skills, the tutor). */
  paused: string[];
  /** Practice days and activities last week (learner time), for the weekly report notice. */
  lastWeek: { start_date: string; activities: number } | null;
};

const learnerHour = (now: Date): number => new Date(now.getTime() + LEARNER_UTC_OFFSET_MS).getUTCHours();
/** End of the learner's day (UTC+5) as an instant. */
const endOfLearnerDay = (now: Date): string => {
  const date = learnerDate(now);
  return new Date(Date.parse(`${date}T00:00:00Z`) - LEARNER_UTC_OFFSET_MS + DAY_MS).toISOString();
};
const levelIndex = (level: Cefr | null | undefined): number => (level ? CEFR_ORDER.indexOf(level) : -1);

/** Level rises announced as notices: overall or per skill, compared with the entry before. */
const levelUps = (levels: LevelEntry[], since: number): InboxItemInput[] => {
  const sorted = [...levels].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const out: InboxItemInput[] = [];
  sorted.forEach((entry, index) => {
    if (index === 0 || entry.source === "placement" || Date.parse(entry.at) < since) return;
    const before = sorted[index - 1]!;
    const risen = Object.entries(entry.per_skill)
      .filter(([skill, level]) => levelIndex(level) > levelIndex(before.per_skill[skill] ?? before.overall))
      .map(([skill, level]) => ({ skill, level }));
    const overallUp = levelIndex(entry.overall) > levelIndex(before.overall);
    if (!overallUp && !risen.length) return;
    const single = !overallUp && risen.length === 1 ? risen[0]! : null;
    out.push({
      kind: "level_up",
      key: `level:${entry.at}`,
      params: single
        ? { skill: single.skill, level: single.level }
        : { level: entry.overall ?? risen[0]?.level ?? null, skills: risen.length },
      link: "/progress",
      createdAt: entry.at,
    });
  });
  return out;
};

/** Notices that follow from the learner's data now. Pure. */
export const deriveInbox = (facts: InboxFacts): InboxItemInput[] => {
  const now = facts.now;
  const today = learnerDate(now);
  const since = now.getTime() - ANNOUNCE_DAYS * DAY_MS;
  const endOfDay = endOfLearnerDay(now);
  const items: InboxItemInput[] = [];

  items.push(...levelUps(facts.levels, since));

  for (const badge of facts.badges) {
    if (!Number.isFinite(Date.parse(badge.earned_at)) || Date.parse(badge.earned_at) < since) continue;
    items.push({ kind: "badge", key: `badge:${badge.key}`, params: { badge: badge.key }, link: "/progress", createdAt: badge.earned_at });
  }

  for (const certificate of facts.certificates) {
    if (!Number.isFinite(Date.parse(certificate.issued_at)) || Date.parse(certificate.issued_at) < since) continue;
    items.push({ kind: "certificate", key: `certificate:${certificate.code}`, params: { level: certificate.overall }, link: "/certificate", createdAt: certificate.issued_at });
  }

  if (facts.streak && facts.streak.at_risk && facts.streak.current >= 2 && learnerHour(now) >= STREAK_RISK_HOUR) {
    items.push({ kind: "streak_risk", key: `streak_risk:${today}`, params: { days: facts.streak.current }, link: "/today", expiresAt: endOfDay });
  }

  if (facts.dueReviews > 0) {
    items.push({ kind: "review_due", key: `review_due:${today}`, params: { count: facts.dueReviews }, link: "/review", expiresAt: endOfDay });
  }

  if (facts.check.due) {
    // One notice per due date; shown from the first time it is noticed.
    const due = facts.check.next_at && Number.isFinite(Date.parse(facts.check.next_at)) ? facts.check.next_at.slice(0, 10) : today;
    items.push({ kind: "check_ready", key: `check_ready:${due}`, link: "/check" });
  }

  for (const service of facts.paused) {
    items.push({ kind: "service_paused", key: `paused:${service}:${today}`, params: { service }, expiresAt: endOfDay });
  }

  if (facts.lastWeek && facts.lastWeek.activities > 0) {
    const weekEnd = new Date(Date.parse(`${facts.lastWeek.start_date}T00:00:00Z`) - LEARNER_UTC_OFFSET_MS + 7 * DAY_MS);
    items.push({
      kind: "weekly_report",
      key: `weekly:${facts.lastWeek.start_date}`,
      params: { week: facts.lastWeek.start_date, activities: facts.lastWeek.activities },
      link: `/journey?week=${facts.lastWeek.start_date}`,
      createdAt: weekEnd.toISOString(),
      expiresAt: new Date(weekEnd.getTime() + 7 * DAY_MS).toISOString(),
    });
  }

  return items;
};

/** Derived notices not stored yet (to insert before showing). */
export const missingDerived = (derived: InboxItemInput[], stored: Array<Pick<InboxRow, "dedupe_key">>): InboxItemInput[] => {
  const have = new Set(stored.map((row) => row.dedupe_key));
  return derived.filter((item) => !have.has(item.key));
};

/**
 * What the learner sees: stored notices that have not expired, where live
 * kinds appear only while derived now (with the current numbers), newest
 * first; plus the unread count for the bell.
 */
export const mergeInbox = (
  stored: InboxRow[],
  derived: InboxItemInput[],
  now: Date = new Date(),
  limit = INBOX_LIMIT,
): { items: InboxView[]; unread: number } => {
  const current = new Map(derived.map((item) => [item.key, item]));
  const items: InboxView[] = [];
  for (const row of stored) {
    if (!isInboxKind(row.kind)) continue;
    if (row.expires_at && Date.parse(row.expires_at) <= now.getTime()) continue;
    const live = LIVE_KINDS.includes(row.kind);
    const fresh = current.get(row.dedupe_key);
    if (live && !fresh) continue;
    items.push({
      id: row.id,
      kind: row.kind,
      key: row.dedupe_key,
      params: cleanParams(live && fresh ? fresh.params : row.params),
      title: row.title,
      body: row.body,
      link: cleanLink(row.link),
      created_at: row.created_at,
      read: Boolean(row.read_at),
      live,
    });
  }
  items.sort((a, b) => Number(a.read) - Number(b.read) || Date.parse(b.created_at) - Date.parse(a.created_at));
  const visible = items.slice(0, limit);
  return { items: visible, unread: visible.filter((item) => !item.read).length };
};
