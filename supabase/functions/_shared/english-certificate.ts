// Shareable level certificates ("Schood English level record"). Pure helpers:
// verification codes, which measurement a certificate may be issued from,
// learner-chosen names, and the public payload anyone with the link can see.
// The hub (hub/certificate.ts) does the database work.
import { type Cefr, isCefr } from "./english-today.ts";
import type { LevelEntry } from "./english-levels.ts";

/** Crockford base32: no I, L, O or U, so codes survive being read aloud or retyped. */
export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** 12 characters = 60 random bits: not guessable, short enough to type. */
export const CODE_LENGTH = 12;

/** The four skills the placement test and monthly check actually measure. */
export const TESTED_SKILLS = ["reading", "listening", "writing", "grammar"] as const;
export type TestedSkill = (typeof TESTED_SKILLS)[number];

export type MeasuredBy = "placement" | "check";

/** A placement-test result is accepted as "measured" only if saved soon after the test. */
export const TEST_RESULT_TTL_MS = 6 * 60 * 60 * 1000;

const NAME_MIN = 2;
const NAME_MAX = 60;

export const generateCertificateCode = (random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string => {
  const bytes = random(new Uint8Array(CODE_LENGTH));
  let out = "";
  // 256 is a multiple of 32, so `byte % 32` is unbiased.
  for (let index = 0; index < CODE_LENGTH; index += 1) out += CODE_ALPHABET[bytes[index]! % 32];
  return out;
};

/** Canonical code from what a person typed or pasted ("abcd-efgh-jkmn", O for 0...), or null. */
export const normalizeCertificateCode = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const cleaned = raw.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (cleaned.length !== CODE_LENGTH) return null;
  for (const char of cleaned) if (!CODE_ALPHABET.includes(char)) return null;
  return cleaned;
};

/** "ABCDEFGHJKMN" → "ABCD-EFGH-JKMN" for display. */
export const formatCertificateCode = (code: string): string => code.match(/.{1,4}/g)?.join("-") ?? code;

/** Control, zero-width and bidi-override characters: invisible, or able to disguise a name. */
const isInvisible = (code: number): boolean =>
  code < 0x20 || (code >= 0x7f && code <= 0x9f) || (code >= 0x200b && code <= 0x200f)
  || (code >= 0x2028 && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069) || code === 0xfeff;

/**
 * The name printed on the certificate: the learner's choice, cleaned. Control
 * characters and markup-ish brackets are dropped, whitespace collapsed. Null
 * when too short to be a name.
 */
export const cleanDisplayName = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .normalize("NFC")
    .split("").filter((char) => !isInvisible(char.codePointAt(0) ?? 0)).join("")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if ([...cleaned].length < NAME_MIN) return null;
  return [...cleaned].slice(0, NAME_MAX).join("").trim();
};

/** Only the tested skills, so a check entry never carries levels that came from practice. */
export const testedLevels = (perSkill: Record<string, unknown>): Partial<Record<TestedSkill, Cefr>> => {
  const out: Partial<Record<TestedSkill, Cefr>> = {};
  for (const skill of TESTED_SKILLS) {
    const level = perSkill[skill];
    if (isCefr(level)) out[skill] = level;
  }
  return out;
};

// --- Was this placement measured by the test, or chosen by the learner? ---

export type StoredTestResult = { at: string; overall: Cefr; per_skill: Partial<Record<TestedSkill, Cefr>> };

/** What the hub keeps in metadata.placement_test_result when the AI test finishes. */
export const testResultRecord = (overall: unknown, perSkill: Record<string, unknown>, now = new Date()): StoredTestResult | null => {
  const level = typeof overall === "string" ? overall.toUpperCase() : overall;
  if (!isCefr(level)) return null;
  const levels: Record<string, unknown> = {};
  for (const [skill, entry] of Object.entries(perSkill)) {
    const value = typeof entry === "string" ? entry : (entry as Record<string, unknown> | null)?.level;
    levels[skill] = typeof value === "string" ? value.toUpperCase() : value;
  }
  return { at: now.toISOString(), overall: level, per_skill: testedLevels(levels) };
};

/**
 * "test" when the saved placement is exactly the result the server produced
 * for this learner a little earlier; otherwise "self" (the learner picked a
 * level, or the save does not match).
 */
export const measurementMethod = (
  saved: { overall: unknown; per_skill: Record<string, unknown> },
  stored: unknown,
  now = new Date(),
): "test" | "self" => {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return "self";
  const record = stored as Record<string, unknown>;
  const at = Date.parse(String(record.at ?? ""));
  if (!Number.isFinite(at) || now.getTime() - at > TEST_RESULT_TTL_MS || at - now.getTime() > 60_000) return "self";
  if (!isCefr(record.overall) || record.overall !== saved.overall) return "self";
  const expected = testedLevels((record.per_skill ?? {}) as Record<string, unknown>);
  const got = testedLevels(saved.per_skill);
  if (!Object.keys(expected).length) return "self";
  for (const skill of TESTED_SKILLS) if (expected[skill] !== got[skill]) return "self";
  return "test";
};

// --- Which measurement a certificate is issued from ---

export type Measurement = {
  measured_by: MeasuredBy;
  measured_at: string;
  overall: Cefr;
  per_skill: Partial<Record<TestedSkill, Cefr>>;
};

export type MeasurementLookup =
  | { status: "ok"; measurement: Measurement }
  /** The latest placement or check was a level the learner chose, not a test. */
  | { status: "self_assessed"; at: string }
  | { status: "none" };

/** Entries saved before the method was recorded: a placement with per-skill levels came from the test. */
const wasTested = (entry: LevelEntry): boolean => {
  if (entry.method === "test") return true;
  if (entry.method === "self") return false;
  return entry.source === "placement" && Object.keys(testedLevels(entry.per_skill)).length > 0;
};

/**
 * The learner's latest placement or monthly check, if the test measured it.
 * Move-ups from practice are not measurements, so they are skipped; an older
 * test is never used when a newer self-chosen level replaced it.
 */
export const latestMeasurement = (history: LevelEntry[]): MeasurementLookup => {
  const latest = history.filter((entry) => entry.source !== "level_up").at(-1);
  if (!latest) return { status: "none" };
  if (!latest.overall || !wasTested(latest)) return { status: "self_assessed", at: latest.at };
  return {
    status: "ok",
    measurement: {
      measured_by: latest.source === "check" ? "check" : "placement",
      measured_at: latest.at,
      overall: latest.overall,
      per_skill: testedLevels(latest.per_skill),
    },
  };
};

// --- What the world sees ---

export type CertificateRow = {
  id?: string;
  code: string;
  user_id?: string;
  display_name: string;
  overall: string;
  per_skill: unknown;
  measured_by: string;
  measured_at: string;
  activities_count: number;
  issued_at: string;
  revoked_at: string | null;
};

export type PublicCertificate = {
  code: string;
  display_name: string;
  overall: Cefr;
  per_skill: Partial<Record<TestedSkill, Cefr>>;
  measured_by: MeasuredBy;
  measured_at: string;
  activities_count: number;
  issued_at: string;
};

/** Public fields only: never the user id, email or row id. Null for a revoked or malformed row. */
export const publicCertificate = (row: CertificateRow | null | undefined): PublicCertificate | null => {
  if (!row || row.revoked_at) return null;
  const code = normalizeCertificateCode(row.code);
  if (!code || !isCefr(row.overall)) return null;
  const perSkill = row.per_skill && typeof row.per_skill === "object" && !Array.isArray(row.per_skill)
    ? testedLevels(row.per_skill as Record<string, unknown>)
    : {};
  return {
    code,
    display_name: String(row.display_name ?? ""),
    overall: row.overall,
    per_skill: perSkill,
    measured_by: row.measured_by === "check" ? "check" : "placement",
    measured_at: String(row.measured_at),
    activities_count: Math.max(0, Math.floor(Number(row.activities_count) || 0)),
    issued_at: String(row.issued_at),
  };
};

/** The learner's own view of a certificate: public fields plus status. */
export const ownCertificate = (row: CertificateRow) => ({
  code: row.code,
  display_name: row.display_name,
  overall: row.overall,
  per_skill: row.per_skill && typeof row.per_skill === "object" && !Array.isArray(row.per_skill)
    ? testedLevels(row.per_skill as Record<string, unknown>)
    : {},
  measured_by: row.measured_by === "check" ? "check" : "placement",
  measured_at: row.measured_at,
  activities_count: Math.max(0, Math.floor(Number(row.activities_count) || 0)),
  issued_at: row.issued_at,
  revoked_at: row.revoked_at,
});
