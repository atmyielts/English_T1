// Pure helpers for Homework OS. No I/O here, so everything is unit-tested.

import type { RubricCriterion } from "../_shared/homework-ai.ts";

export type Row = Record<string, unknown>;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_RE.test(value);

export const text = (value: unknown, max = 500): string => String(value ?? "").trim().slice(0, max);

export const escapeHtml = (value: unknown): string =>
  String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Rubric criteria exactly as academy_grading_command reads them. */
export const rubricCriteria = (criteria: unknown): RubricCriterion[] | null => {
  if (!Array.isArray(criteria) || criteria.length === 0) return null;
  const out: RubricCriterion[] = [];
  criteria.forEach((raw, index) => {
    const c = (raw && typeof raw === "object" ? raw : {}) as Row;
    const max = Number(c.max_points ?? c.max_score);
    out.push({
      id: typeof c.id === "string" && c.id ? c.id : `criterion-${index + 1}`,
      title: text(c.title ?? c.name ?? c.label ?? `Criterion ${index + 1}`, 200),
      max: Number.isFinite(max) && max > 0 ? max : 0,
      description: text(c.description, 400) || undefined,
    });
  });
  return out.every((c) => c.max > 0) ? out : null;
};

// ---------------------------------------------------------------------------
// Telegram message parsing
// ---------------------------------------------------------------------------

export type TelegramItem = {
  kind: "photo" | "document" | "voice" | "audio" | "video" | "video_note";
  file_id: string;
  file_unique_id: string | null;
  file_size: number | null;
  mime_type: string;
  file_name: string | null;
  duration: number | null;
};

const MIME_BY_KIND: Record<TelegramItem["kind"], string> = {
  photo: "image/jpeg",
  document: "application/octet-stream",
  voice: "audio/ogg",
  audio: "audio/mpeg",
  video: "video/mp4",
  video_note: "video/mp4",
};

export const TELEGRAM_DOWNLOAD_LIMIT = 20 * 1024 * 1024;

/** The one file a Telegram message carries, if any (largest photo size). */
export const telegramItem = (message: Row): TelegramItem | null => {
  const pick = (kind: TelegramItem["kind"], raw: unknown): TelegramItem | null => {
    if (!raw || typeof raw !== "object") return null;
    const f = raw as Row;
    if (typeof f.file_id !== "string" || !f.file_id) return null;
    const size = Number(f.file_size);
    const duration = Number(f.duration);
    return {
      kind,
      file_id: f.file_id,
      file_unique_id: typeof f.file_unique_id === "string" ? f.file_unique_id : null,
      file_size: Number.isFinite(size) ? size : null,
      mime_type: typeof f.mime_type === "string" && /^[a-z]+\/[a-z0-9.+-]+$/i.test(f.mime_type) ? f.mime_type.toLowerCase() : MIME_BY_KIND[kind],
      file_name: typeof f.file_name === "string" ? f.file_name.slice(0, 160) : null,
      duration: Number.isFinite(duration) ? duration : null,
    };
  };
  if (Array.isArray(message.photo) && message.photo.length) {
    const sizes = [...message.photo] as Row[];
    const area = (size: Row) => Number(size.width ?? 0) * Number(size.height ?? 0);
    sizes.sort((a, b) => area(a) - area(b) || Number(a.file_size ?? 0) - Number(b.file_size ?? 0));
    return pick("photo", sizes[sizes.length - 1]);
  }
  for (const kind of ["document", "voice", "audio", "video", "video_note"] as const) {
    const found = pick(kind, message[kind]);
    if (found) return found;
  }
  return null;
};

/** Upload policy shared with the Academy web route: application, audio, image, text and video only. */
export const allowedMime = (mime: string): boolean => /^(application|audio|image|text|video)\//.test(mime);

export const fileExtension = (item: Pick<TelegramItem, "mime_type" | "file_name" | "kind">): string => {
  const fromName = item.file_name?.match(/\.([a-zA-Z0-9]{1,10})$/)?.[1];
  if (fromName) return fromName.toLowerCase();
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "audio/ogg": "ogg", "audio/mpeg": "mp3",
    "video/mp4": "mp4", "application/pdf": "pdf",
  };
  return map[item.mime_type] ?? (item.kind === "photo" ? "jpg" : "bin");
};

export type BotCommand = { command: string; args: string } | null;

export const botCommand = (value: unknown): BotCommand => {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith("/")) return null;
  const [head, ...rest] = raw.split(/\s+/);
  return { command: head.replace(/@\w+$/, "").toLowerCase(), args: rest.join(" ") };
};

export type CallbackAction =
  | { kind: "center"; academyId: string | null }
  | { kind: "view"; assignmentId: string }
  | { kind: "pick"; draftId: string; index: number }
  | { kind: "cancel"; draftId: string };

/** Callback data stays under Telegram's 64-byte limit: "hw:p:<uuid>:<n>" is 44 bytes. */
export const parseCallback = (data: unknown): CallbackAction | null => {
  const value = String(data ?? "");
  let m = value.match(/^ctr:(all|[0-9a-f-]{36})$/i);
  if (m) return { kind: "center", academyId: m[1].toLowerCase() === "all" ? null : isUuid(m[1]) ? m[1] : null };
  m = value.match(/^hw:v:([0-9a-f-]{36})$/i);
  if (m && isUuid(m[1])) return { kind: "view", assignmentId: m[1] };
  m = value.match(/^hw:p:([0-9a-f-]{36}):(\d{1,2})$/i);
  if (m && isUuid(m[1])) return { kind: "pick", draftId: m[1], index: Number(m[2]) };
  m = value.match(/^hw:x:([0-9a-f-]{36})$/i);
  if (m && isUuid(m[1])) return { kind: "cancel", draftId: m[1] };
  return null;
};

export const isHomeworkCallback = (data: unknown): boolean => /^(hw|ctr):/.test(String(data ?? ""));

// ---------------------------------------------------------------------------
// Open work selection
// ---------------------------------------------------------------------------

export type OpenWork = {
  type: "assignment" | "correction";
  assignment_id: string;
  submission_id: string | null;
  academy_id: string;
  classroom_id: string;
  contact_id: string;
  title: string;
  center_name: string;
  due_at: string | null;
};

export type AssignmentRow = {
  id: string; academy_id: string; classroom_id: string; title: string; due_at: string | null;
  released_at: string | null; status: string; attempts_allowed: number | null; allow_late_submission: boolean | null;
};
export type SubmissionRow = { id: string; assignment_id: string; contact_id: string; attempt_number: number | null; status: string };

/**
 * Which assignments a learner can hand in now, mirroring the checks the
 * academy_assignment_written_command RPC enforces (it remains the authority).
 */
export const openAssignments = (
  assignments: AssignmentRow[],
  submissions: SubmissionRow[],
  contactByClassroom: Map<string, string>,
  now: number,
): AssignmentRow[] =>
  assignments.filter((a) => {
    if (a.status !== "active") return false;
    if (a.released_at && Date.parse(a.released_at) > now) return false;
    if (a.due_at && Date.parse(a.due_at) < now && a.allow_late_submission === false) return false;
    const contact = contactByClassroom.get(a.classroom_id);
    if (!contact) return false;
    const sub = submissions.find((s) => s.assignment_id === a.id && s.contact_id === contact);
    const used = Number(sub?.attempt_number ?? 0);
    return used < Math.max(1, Number(a.attempts_allowed ?? 1));
  });

export const sortOpenWork = (items: OpenWork[]): OpenWork[] =>
  [...items].sort((left, right) => {
    if (left.type !== right.type) return left.type === "correction" ? -1 : 1;
    const l = left.due_at ? Date.parse(left.due_at) : Number.MAX_SAFE_INTEGER;
    const r = right.due_at ? Date.parse(right.due_at) : Number.MAX_SAFE_INTEGER;
    return l - r || left.title.localeCompare(right.title);
  });

export const formatDue = (dueAt: string | null, locale = "en-GB"): string => {
  if (!dueAt) return "";
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" });
};

// ---------------------------------------------------------------------------
// Trusted homework
// ---------------------------------------------------------------------------

const shingles = (value: string, size = 3): Set<string> => {
  const words = value.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + size <= words.length; i += 1) out.add(words.slice(i, i + size).join(" "));
  return out;
};

/** Jaccard similarity of word 3-grams; 0 for texts too short to compare fairly. */
export const textSimilarity = (left: string, right: string): number => {
  const a = shingles(left), b = shingles(right);
  if (a.size < 12 || b.size < 12) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  return shared / (a.size + b.size - shared);
};

export const SIMILAR_TEXT_THRESHOLD = 0.6;

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export type MistakeInput = { tag: string; excerpt: string | null; correction: string | null; explanation: string | null; source: "ai" | "teacher" };

export const cleanMistakes = (value: unknown, source: "ai" | "teacher"): MistakeInput[] => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const m = raw as Row;
    const tag = String(m.tag ?? "").toLowerCase().trim().replace(/[^a-z0-9_.:-]+/g, "_").replace(/^[_.:-]+|[_.:-]+$/g, "").slice(0, 80);
    const excerpt = text(m.excerpt, 600) || null, correction = text(m.correction, 600) || null, explanation = text(m.explanation, 1200) || null;
    if (!excerpt && !correction && !explanation) return [];
    return [{ tag: tag.length >= 2 ? tag : "general", excerpt, correction, explanation, source: m.source === "ai" ? "ai" : source }];
  });
};

export const studentFeedbackMessage = (args: {
  title: string; centerName: string; decision: "graded" | "returned"; score?: number | null; maxScore?: number | null;
  comments?: string | null; mistakes: MistakeInput[];
}): string => {
  const lines = [`<b>${escapeHtml(args.title)}</b> · ${escapeHtml(args.centerName)}`];
  if (args.decision === "graded" && args.score != null) {
    lines.push(`✅ Checked: <b>${escapeHtml(args.score)}${args.maxScore ? ` / ${escapeHtml(args.maxScore)}` : ""}</b>`);
  } else {
    lines.push("↩️ Your teacher asked you to fix a few things.");
  }
  if (args.comments) lines.push("", escapeHtml(args.comments.slice(0, 1500)));
  if (args.mistakes.length) {
    lines.push("", "<b>Fix these:</b>");
    args.mistakes.slice(0, 6).forEach((m, i) => {
      const fix = m.correction ? ` → <i>${escapeHtml(m.correction)}</i>` : "";
      lines.push(`${i + 1}. ${escapeHtml(m.excerpt ?? m.explanation ?? m.tag)}${fix}`);
    });
    if (args.decision === "returned") lines.push("", "Send your corrected work here as text or a photo.");
  }
  return lines.join("\n").slice(0, 4000);
};
