// Content studio: turns an admin's edit of one English item (parent + child
// rows) into rows that are safe to write, or a list of field errors.
//
// Pure: no I/O. The admin-english-content function does the writes. Every
// answer shape is checked with the same rules the learner functions use to
// grade, so a saved item can always be graded:
//   reading    reading_articles.questions          (english-reading normalizeQuestions)
//   listening  listening_items.questions           (english-listening parseQuestions) + listening_segments
//   writing    writing_prompts guidance_text lines + metadata.checklist_keywords
//   speaking   speaking_prompts.cue_points + metadata.cue_keywords / model_answer
//   grammar    grammar_drills.expected_answer_json.accepted_answers (english-grammar checkGrammarAnswer)
//   immersion  immersion_mission_steps.expected_answer_json { questions[answer] | goal, points[{label, any}] }
//   vocabulary vocabulary_deck_words (quiz options are the deck's own words)

import { normalizeQuestions as normalizeReadingQuestions, READING_SUBSKILLS } from "./english-reading.ts";
import { parseQuestions as parseListeningQuestions } from "./english-listening.ts";
import { blankFills, normalizeAnswer } from "./english-grammar.ts";
import { parsePoints, parseQuestions as parseImmersionQuestions } from "./english-immersion.ts";
import { normalizeChoice, parseCollocations, parseWordFamily } from "./english-vocabulary.ts";

type JsonRecord = Record<string, unknown>;

export type StudioServiceKey = "reading" | "listening" | "writing" | "speaking" | "grammar" | "immersion" | "vocabulary";

export const STUDIO_SERVICE_KEYS: readonly StudioServiceKey[] = [
  "reading",
  "listening",
  "writing",
  "speaking",
  "grammar",
  "immersion",
  "vocabulary",
];

export type FieldError = { field: string; message: string };

export type RegistryDraft = {
  service_key: StudioServiceKey;
  content_type: string;
  source_table: string;
  source_ref: string;
  title: string;
  description: string | null;
  skill_key: string;
  subskill_keys: string[];
  cefr_level: string | null;
  difficulty: number;
  estimated_minutes: number;
  learning_objective: string | null;
  tags: string[];
  status: string;
  payload_json: JsonRecord;
};

export type StudioOk = {
  ok: true;
  parent: JsonRecord;
  children: JsonRecord[];
  registry: RegistryDraft;
  /** "provided": parent.metadata is the full new metadata. "default": merge it over the stored metadata. */
  metadataSource: "provided" | "default";
};

export type StudioResult = StudioOk | { ok: false; errors: FieldError[] };

export type StudioSkillConfig = {
  table: string;
  contentType: string;
  childTable: string | null;
  childForeignKey: string | null;
  /** Column children are ordered by. */
  childOrderColumn: string | null;
  /** Table has created_by / updated_by columns. */
  hasCreatedBy: boolean;
  hasPresentationMeta: boolean;
  /** metadata keys the studio form owns; anything else in metadata is kept as is. */
  managedMetadataKeys: string[];
  /** Slug is unique per language (vocabulary) instead of per product + language. */
  slugScope: "product_language" | "language";
};

export const STUDIO_SKILLS: Record<StudioServiceKey, StudioSkillConfig> = {
  reading: {
    table: "reading_articles",
    contentType: "reading.article",
    childTable: null,
    childForeignKey: null,
    childOrderColumn: null,
    hasCreatedBy: true,
    hasPresentationMeta: true,
    managedMetadataKeys: [],
    slugScope: "product_language",
  },
  listening: {
    table: "listening_items",
    contentType: "listening.item",
    childTable: "listening_segments",
    childForeignKey: "listening_item_id",
    childOrderColumn: "segment_index",
    hasCreatedBy: true,
    hasPresentationMeta: true,
    managedMetadataKeys: [],
    slugScope: "product_language",
  },
  writing: {
    table: "writing_prompts",
    contentType: "writing.prompt",
    childTable: null,
    childForeignKey: null,
    childOrderColumn: null,
    hasCreatedBy: true,
    hasPresentationMeta: true,
    managedMetadataKeys: ["audience", "checklist_keywords"],
    slugScope: "product_language",
  },
  speaking: {
    table: "speaking_prompts",
    contentType: "speaking.prompt",
    childTable: null,
    childForeignKey: null,
    childOrderColumn: null,
    hasCreatedBy: true,
    hasPresentationMeta: true,
    managedMetadataKeys: ["task_type", "cue_keywords", "model_answer", "model_opening"],
    slugScope: "product_language",
  },
  grammar: {
    table: "grammar_units",
    contentType: "grammar.unit",
    childTable: "grammar_drills",
    childForeignKey: "grammar_unit_id",
    childOrderColumn: "sort_order",
    hasCreatedBy: true,
    hasPresentationMeta: true,
    managedMetadataKeys: [],
    slugScope: "product_language",
  },
  immersion: {
    table: "immersion_missions",
    contentType: "immersion.mission",
    childTable: "immersion_mission_steps",
    childForeignKey: "mission_id",
    childOrderColumn: "step_index",
    hasCreatedBy: true,
    hasPresentationMeta: true,
    managedMetadataKeys: [],
    slugScope: "product_language",
  },
  vocabulary: {
    table: "vocabulary_decks",
    contentType: "vocabulary.deck",
    childTable: "vocabulary_deck_words",
    childForeignKey: "deck_id",
    childOrderColumn: "sort_order",
    hasCreatedBy: false,
    hasPresentationMeta: false,
    managedMetadataKeys: [],
    slugScope: "language",
  },
};

export const isStudioServiceKey = (value: unknown): value is StudioServiceKey =>
  typeof value === "string" && (STUDIO_SERVICE_KEYS as readonly string[]).includes(value);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const CONTENT_STATUSES = ["draft", "published", "archived"] as const;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const READING_TONES = ["lime", "mint", "sky", "peach", "lavender", "sand"] as const;
export const LISTENING_SPEEDS = ["slow", "natural", "fast"] as const;
export const SPEAKING_PROMPT_TYPES = ["guided_response", "roleplay", "storytelling", "shadowing", "read_aloud"] as const;
export const SPEAKING_TASK_TYPES = ["describe", "explain", "opinion", "story", "roleplay", "presentation"] as const;
export const GRAMMAR_DRILL_TYPES = ["fill", "error_correction", "transformation"] as const;
export const MISSION_TYPES = ["travel", "workplace", "study", "service", "social", "problem_solving"] as const;
export const STEP_KINDS = ["read", "listen", "reply", "speak"] as const;

const STEP_SERVICE: Record<(typeof STEP_KINDS)[number], string> = {
  read: "reading",
  listen: "listening",
  reply: "writing",
  speak: "speaking",
};

const STEP_SKILL: Record<(typeof STEP_KINDS)[number], string> = {
  read: "reading.detail",
  listen: "listening.detail",
  reply: "writing.task_completion",
  speak: "speaking.task_completion",
};

const DIFFICULTY_BY_LEVEL: Record<string, number> = { A1: 0.2, A2: 0.3, B1: 0.45, B2: 0.6, C1: 0.75, C2: 0.9 };

export const difficultyForLevel = (level: string | null | undefined): number =>
  DIFFICULTY_BY_LEVEL[String(level ?? "").toUpperCase()] ?? 0.5;

const isRecord = (value: unknown): value is JsonRecord => !!value && typeof value === "object" && !Array.isArray(value);

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");

const clampInt = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, Math.round(value)));

/** Turns a title into a slug suggestion: lowercase words joined by hyphens. */
export const slugify = (value: string): string =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");

/** "<slug>-copy", "<slug>-copy-2", … : the first one not in `taken`. */
export const copySlug = (slug: string, taken: Iterable<string>): string => {
  const used = new Set(taken);
  const base = `${slug.slice(0, 110).replace(/-+$/g, "")}-copy`;
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
};

class Collector {
  errors: FieldError[] = [];

  add(field: string, message: string): void {
    this.errors.push({ field, message });
  }

  /** Required text, trimmed, up to `max` characters. */
  text(field: string, value: unknown, max: number, label: string, required = true): string {
    const clean = str(value);
    if (!clean) {
      if (required) this.add(field, `${label} is required.`);
      return "";
    }
    if (clean.length > max) this.add(field, `${label} must be at most ${max} characters (now ${clean.length}).`);
    return clean;
  }

  optionalText(field: string, value: unknown, max: number, label: string): string | null {
    if (value !== null && value !== undefined && typeof value !== "string" && typeof value !== "number") {
      this.add(field, `${label} must be text.`);
      return null;
    }
    const clean = this.text(field, value, max, label, false);
    return clean || null;
  }

  int(field: string, value: unknown, min: number, max: number, label: string, fallback?: number): number {
    if (value === null || value === undefined || value === "") {
      if (fallback === undefined) {
        this.add(field, `${label} is required.`);
        return min;
      }
      return fallback;
    }
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      this.add(field, `${label} must be a whole number.`);
      return fallback ?? min;
    }
    if (parsed < min || parsed > max) {
      this.add(field, `${label} must be between ${min} and ${max}.`);
      return clampInt(parsed, min, max);
    }
    return parsed;
  }

  oneOf<T extends string>(field: string, value: unknown, allowed: readonly T[], label: string, fallback?: T): T {
    const raw = str(value);
    if (!raw) {
      if (fallback !== undefined) return fallback;
      this.add(field, `${label} is required.`);
      return allowed[0]!;
    }
    if (!(allowed as readonly string[]).includes(raw)) {
      this.add(field, `${label} must be one of: ${allowed.join(", ")}.`);
      return fallback ?? allowed[0]!;
    }
    return raw as T;
  }

  /** A list of short strings: an array, or text split on new lines / commas. */
  list(field: string, value: unknown, maxItems: number, maxLen: number, label: string): string[] {
    if (value === null || value === undefined || value === "") return [];
    let raw: unknown[];
    if (Array.isArray(value)) raw = value;
    else if (typeof value === "string") raw = value.split(/\r?\n|,/);
    else {
      this.add(field, `${label} must be a list.`);
      return [];
    }
    const out: string[] = [];
    const seen = new Set<string>();
    for (const entry of raw) {
      const clean = str(entry);
      if (!clean) continue;
      if (clean.length > maxLen) {
        this.add(field, `Each ${label.toLowerCase()} entry must be at most ${maxLen} characters ("${clean.slice(0, 30)}…").`);
        continue;
      }
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
    }
    if (out.length > maxItems) this.add(field, `${label}: at most ${maxItems} entries (now ${out.length}).`);
    return out.slice(0, maxItems);
  }

  array(field: string, value: unknown, label: string): unknown[] {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value)) {
      this.add(field, `${label} must be a list.`);
      return [];
    }
    return value;
  }
}

type Common = {
  slug: string;
  title: string;
  level: string;
  status: string;
  sort_order: number;
  presentation_meta?: JsonRecord;
  metadata: JsonRecord;
  metadataSource: "provided" | "default";
};

export type NormalizeOptions = {
  /** Status used when the payload has none: "draft" on create, the stored status on update. */
  defaultStatus?: string;
  /** Parent id, when known (update / after insert): used in the registry payload. */
  id?: string | null;
};

const readCommon = (c: Collector, item: JsonRecord, config: StudioSkillConfig, options: NormalizeOptions): Common => {
  const slug = str(item.slug).toLowerCase();
  if (!slug) c.add("slug", "Slug is required.");
  else if (slug.length < 3 || slug.length > 120) c.add("slug", "Slug must be 3–120 characters.");
  else if (!SLUG_PATTERN.test(slug)) c.add("slug", "Slug may only use lowercase letters, digits and single hyphens (e.g. a2-train-tickets).");

  const title = c.text("title", item.title, 220, "Title");
  const level = c.oneOf("level", str(item.level).toUpperCase(), CEFR_LEVELS, "Level");
  const fallbackStatus = (CONTENT_STATUSES as readonly string[]).includes(options.defaultStatus ?? "")
    ? options.defaultStatus as (typeof CONTENT_STATUSES)[number]
    : "draft";
  const status = c.oneOf("status", item.status, CONTENT_STATUSES, "Status", fallbackStatus);
  const sortOrder = c.int("sort_order", item.sort_order, -100000, 100000, "Sort order", 100);

  let presentation: JsonRecord | undefined;
  if (config.hasPresentationMeta && item.presentation_meta !== undefined && item.presentation_meta !== null) {
    if (isRecord(item.presentation_meta)) presentation = item.presentation_meta;
    else c.add("presentation_meta", "Presentation meta must be a JSON object.");
  }

  let metadata: JsonRecord = {};
  let metadataSource: "provided" | "default" = "default";
  if (item.metadata !== undefined && item.metadata !== null) {
    if (isRecord(item.metadata)) {
      metadata = { ...item.metadata };
      metadataSource = "provided";
    } else c.add("metadata", "Metadata must be a JSON object.");
  }
  for (const key of config.managedMetadataKeys) delete metadata[key];

  return { slug, title, level, status, sort_order: sortOrder, presentation_meta: presentation, metadata, metadataSource };
};

const commonColumns = (common: Common): JsonRecord => {
  const row: JsonRecord = {
    slug: common.slug,
    title: common.title,
    level: common.level,
    status: common.status,
    sort_order: common.sort_order,
    metadata: common.metadata,
  };
  if (common.presentation_meta) row.presentation_meta = common.presentation_meta;
  return row;
};

/** Sets managed metadata keys, dropping empty ones so they disappear from the stored row. */
const setMeta = (metadata: JsonRecord, key: string, value: unknown): void => {
  const empty = value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
  if (empty) delete metadata[key];
  else metadata[key] = value;
};

/**
 * Stored metadata after an edit: with `source: "provided"` the new object
 * replaces it; otherwise the managed keys are replaced and every other stored
 * key (seeded_by, tts, speakers, …) is kept.
 */
export const mergeMetadata = (
  stored: unknown,
  next: JsonRecord,
  managedKeys: string[],
  source: "provided" | "default",
): JsonRecord => {
  if (source === "provided" || !isRecord(stored)) return { ...next };
  const kept: JsonRecord = { ...stored };
  for (const key of managedKeys) delete kept[key];
  return { ...kept, ...next };
};

const optionalUuid = (c: Collector, field: string, value: unknown): string | null => {
  const raw = str(value);
  if (!raw) return null;
  if (!UUID_PATTERN.test(raw)) {
    c.add(field, "Row id is not valid; remove it to create a new row.");
    return null;
  }
  return raw;
};

const childMetadata = (value: unknown): JsonRecord => (isRecord(value) ? { ...value } : {});

// ---------------------------------------------------------------------------
// Multiple-choice questions (reading, listening, immersion read/listen steps)
// ---------------------------------------------------------------------------

type ChoiceInput = { id: string; prompt: string; options: string[]; answer_index: number; explanation: string; skill?: string };

const readChoiceQuestions = (
  c: Collector,
  field: string,
  value: unknown,
  opts: { maxQuestions: number; answerKey: "answer_index" | "answer"; withSkill: boolean },
): ChoiceInput[] => {
  const raw = c.array(field, value, "Questions");
  if (raw.length > opts.maxQuestions) c.add(field, `At most ${opts.maxQuestions} questions (now ${raw.length}).`);
  const seen = new Set<string>();
  const out: ChoiceInput[] = [];
  raw.slice(0, opts.maxQuestions).forEach((entry, index) => {
    const at = `${field}[${index}]`;
    if (!isRecord(entry)) {
      c.add(at, "Question must be an object.");
      return;
    }
    let id = str(entry.id).slice(0, 40);
    if (!id || seen.has(id)) {
      id = `q${index + 1}`;
      let n = index + 1;
      while (seen.has(id)) id = `q${++n}`;
    }
    seen.add(id);
    const prompt = c.text(`${at}.prompt`, entry.prompt, 400, "Question");
    const rawOptions = Array.isArray(entry.options) ? entry.options : [];
    const options = rawOptions.map((option) => str(option));
    if (options.length < 2 || options.length > 6) c.add(`${at}.options`, "Give 2–6 answer options.");
    options.forEach((option, optionIndex) => {
      if (!option) c.add(`${at}.options[${optionIndex}]`, "Answer options cannot be empty.");
      else if (option.length > 300) c.add(`${at}.options[${optionIndex}]`, "Answer options must be at most 300 characters.");
    });
    const lowered = options.map((option) => option.toLowerCase());
    if (new Set(lowered).size !== lowered.length) c.add(`${at}.options`, "Answer options must all be different.");
    const rawAnswer = entry[opts.answerKey] ?? entry.answer_index ?? entry.answer;
    const answer = typeof rawAnswer === "number" ? rawAnswer : rawAnswer === "" || rawAnswer == null ? Number.NaN : Number(rawAnswer);
    if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) {
      c.add(`${at}.answer_index`, "Mark which option is correct.");
    }
    const explanation = c.text(`${at}.explanation`, entry.explanation, 500, "Explanation", false);
    let skill: string | undefined;
    if (opts.withSkill) {
      const rawSkill = str(entry.skill) || "reading.detail";
      skill = rawSkill.startsWith("reading.") ? rawSkill : `reading.${rawSkill}`;
      if (!(READING_SUBSKILLS as readonly string[]).includes(skill)) {
        c.add(`${at}.skill`, `Skill must be one of: ${READING_SUBSKILLS.join(", ")}.`);
      }
    }
    out.push({ id, prompt, options, answer_index: answer, explanation, ...(skill ? { skill } : {}) });
  });
  return out;
};

// ---------------------------------------------------------------------------
// Per-skill normalisers
// ---------------------------------------------------------------------------

type Built = { parent: JsonRecord; children: JsonRecord[] };

const buildReading = (c: Collector, item: JsonRecord, common: Common): Built => {
  const summary = c.text("summary", item.summary, 900, "Summary");
  const content = c.text("content_markdown", item.content_markdown, 120000, "Article text");
  const category = c.text("category", item.category, 120, "Category");
  const theme = c.text("theme", item.theme, 120, "Theme");
  const tone = c.oneOf("tone", item.tone, READING_TONES, "Tone", "mint");
  const words = content ? content.split(/\s+/).filter(Boolean).length : 0;
  const readTime = c.int("read_time_minutes", item.read_time_minutes, 1, 60, "Read time", clampInt(Math.ceil(words / 120) || 1, 1, 60));
  const questions = readChoiceQuestions(c, "questions", item.questions, { maxQuestions: 15, answerKey: "answer_index", withSkill: true });
  if (c.errors.length === 0 && normalizeReadingQuestions(questions).length !== questions.length) {
    c.add("questions", "Some questions cannot be graded by the reading activity; check prompts, options and answers.");
  }
  return {
    parent: {
      ...commonColumns(common),
      summary,
      content_markdown: content,
      category,
      theme,
      tone,
      read_time_minutes: readTime,
      is_hot: item.is_hot === true,
      questions: questions.map((q) => ({
        id: q.id,
        type: "mcq",
        prompt: q.prompt,
        options: q.options,
        answer_index: q.answer_index,
        explanation: q.explanation,
        skill: q.skill ?? "reading.detail",
      })),
    },
    children: [],
  };
};

const buildListening = (c: Collector, item: JsonRecord, children: unknown[], common: Common): Built => {
  const summary = c.text("summary", item.summary, 900, "Summary");
  const transcript = c.text("transcript_text", item.transcript_text, 8000, "Transcript");
  const category = c.text("category", item.category, 120, "Category");
  const accent = c.text("accent", item.accent, 40, "Accent", false) || "general";
  const speedLabel = c.oneOf("speed_label", item.speed_label, LISTENING_SPEEDS, "Speed", "natural");
  const speedWpm = c.int("speed_wpm", item.speed_wpm, 60, 240, "Words per minute", 130);
  const words = transcript ? transcript.split(/\s+/).filter(Boolean).length : 0;
  const duration = c.int(
    "duration_seconds",
    item.duration_seconds,
    5,
    900,
    "Duration",
    clampInt((words / speedWpm) * 60 || 20, 5, 900),
  );
  const audioUrl = c.optionalText("audio_url", item.audio_url, 1000, "Audio URL");
  if (audioUrl && !/^https:\/\/\S+$/i.test(audioUrl)) c.add("audio_url", "Audio URL must start with https://.");
  const focusSkill = c.text("focus_skill", item.focus_skill, 60, "Focus skill", false) || "listening";
  const tags = c.list("tags", item.tags, 12, 60, "Tags");
  const questions = readChoiceQuestions(c, "questions", item.questions, { maxQuestions: 15, answerKey: "answer_index", withSkill: false });
  if (common.status === "published" && questions.length === 0) c.add("questions", "Add at least one question before publishing.");
  if (c.errors.length === 0 && parseListeningQuestions(questions).length !== questions.length) {
    c.add("questions", "Some questions cannot be graded by the listening activity; check prompts, options and answers.");
  }

  if (children.length > 60) c.add("children", "At most 60 segments.");
  const segments = children.slice(0, 60).map((entry, index): JsonRecord => {
    const at = `children[${index}]`;
    const row = isRecord(entry) ? entry : {};
    const id = optionalUuid(c, `${at}.id`, row.id);
    const segmentText = c.text(`${at}.segment_text`, row.segment_text, 1000, "Segment text");
    const focus = c.optionalText(`${at}.focus_phrase`, row.focus_phrase, 200, "Focus phrase");
    if (focus && segmentText && !segmentText.toLowerCase().includes(focus.toLowerCase())) {
      c.add(`${at}.focus_phrase`, "The focus phrase must appear in the segment text.");
    }
    const timing = (key: string, label: string): number | null => {
      const value = row[key];
      if (value === null || value === undefined || value === "") return null;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 3600) {
        c.add(`${at}.${key}`, `${label} must be a number of seconds (0–3600).`);
        return null;
      }
      return Math.round(parsed * 100) / 100;
    };
    const starts = timing("starts_at_seconds", "Start");
    const ends = timing("ends_at_seconds", "End");
    if (starts !== null && ends !== null && ends <= starts) c.add(`${at}.ends_at_seconds`, "End must be after start.");
    return {
      ...(id ? { id } : {}),
      segment_index: index,
      segment_text: segmentText,
      focus_phrase: focus,
      starts_at_seconds: starts,
      ends_at_seconds: ends,
      metadata: childMetadata(row.metadata),
    };
  });

  return {
    parent: {
      ...commonColumns(common),
      summary,
      transcript_text: transcript,
      category,
      accent,
      speed_label: speedLabel,
      speed_wpm: speedWpm,
      duration_seconds: duration,
      audio_url: audioUrl,
      focus_skill: focusSkill,
      tags,
      questions: questions.map((q) => ({
        id: q.id,
        type: "mcq",
        prompt: q.prompt,
        options: q.options,
        answer_index: q.answer_index,
        explanation: q.explanation,
      })),
    },
    children: segments,
  };
};

/** Pairs of { text, keywords[] } used for writing checklist points and speaking cue points. */
const readPointsWithKeywords = (
  c: Collector,
  field: string,
  value: unknown,
  textKey: string,
  label: string,
  maxItems: number,
  maxLen: number,
): Array<{ text: string; keywords: string[] }> => {
  const raw = c.array(field, value, label);
  if (raw.length > maxItems) c.add(field, `At most ${maxItems} ${label.toLowerCase()} (now ${raw.length}).`);
  return raw.slice(0, maxItems).map((entry, index) => {
    const at = `${field}[${index}]`;
    const row = isRecord(entry) ? entry : { [textKey]: entry };
    const text = c.text(`${at}.${textKey}`, row[textKey], maxLen, label.replace(/s$/, ""));
    if (/\r|\n/.test(text)) c.add(`${at}.${textKey}`, "Keep each point on one line.");
    const keywords = c.list(`${at}.keywords`, row.keywords, 20, 60, "Keywords");
    return { text, keywords };
  });
};

const buildWriting = (c: Collector, item: JsonRecord, common: Common): Built => {
  const prompt = c.text("prompt_text", item.prompt_text, 2000, "Task");
  const genre = c.text("genre", item.genre, 80, "Genre");
  const audience = c.optionalText("audience", item.audience, 200, "Audience");
  const targetGrammar = c.optionalText("target_grammar", item.target_grammar, 200, "Target grammar");
  const targetStructure = c.optionalText("target_structure", item.target_structure, 300, "Target structure");
  const targetVocabulary = c.list("target_vocabulary", item.target_vocabulary, 30, 60, "Target vocabulary");
  const min = c.int("expected_length_min", item.expected_length_min, 10, 1000, "Minimum words", 60);
  const max = c.int("expected_length_max", item.expected_length_max, 10, 2000, "Maximum words", 180);
  if (max < min) c.add("expected_length_max", "Maximum words must be at least the minimum.");

  let points: Array<{ text: string; keywords: string[] }>;
  if (item.checklist !== undefined) {
    points = readPointsWithKeywords(c, "checklist", item.checklist, "point", "Task points", 8, 200);
  } else {
    const guidance = c.text("guidance_text", item.guidance_text, 2000, "Guidance", false);
    points = guidance
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
      .filter(Boolean)
      .map((text) => ({ text, keywords: [] }));
    if (points.length > 8) c.add("guidance_text", "At most 8 task points (one per line).");
  }
  if (common.status === "published" && points.length === 0) c.add("checklist", "Add at least one task point before publishing.");
  const guidanceText = points.length ? points.map((point) => `- ${point.text}`).join("\n") : null;
  const keywords = points.some((point) => point.keywords.length) ? points.map((point) => point.keywords) : [];

  const metadata = { ...common.metadata };
  setMeta(metadata, "audience", audience);
  setMeta(metadata, "checklist_keywords", keywords);

  return {
    parent: {
      ...commonColumns(common),
      metadata,
      prompt_text: prompt,
      guidance_text: guidanceText,
      genre,
      target_grammar: targetGrammar,
      target_structure: targetStructure,
      target_vocabulary: targetVocabulary,
      expected_length_min: min,
      expected_length_max: max,
    },
    children: [],
  };
};

const buildSpeaking = (c: Collector, item: JsonRecord, common: Common): Built => {
  const prompt = c.text("prompt_text", item.prompt_text, 1200, "Task");
  const promptType = c.oneOf("prompt_type", item.prompt_type, SPEAKING_PROMPT_TYPES, "Prompt type", "guided_response");
  const taskType = str(item.task_type)
    ? c.oneOf("task_type", item.task_type, SPEAKING_TASK_TYPES, "Task type")
    : null;
  const duration = c.int("target_duration_seconds", item.target_duration_seconds, 10, 600, "Target duration", 60);
  const targetGrammar = c.optionalText("target_grammar", item.target_grammar, 160, "Target grammar");
  const targetVocabulary = c.list("target_vocabulary", item.target_vocabulary, 12, 120, "Target vocabulary");
  const fluency = c.optionalText("fluency_objective", item.fluency_objective, 600, "Fluency objective");
  const pronunciation = c.optionalText("pronunciation_objective", item.pronunciation_objective, 600, "Pronunciation objective");
  const modelAnswer = c.optionalText("model_answer", item.model_answer, 2400, "Model answer");
  const modelOpening = c.optionalText("model_opening", item.model_opening, 300, "Model opening");

  const cues = readPointsWithKeywords(c, "cues", item.cues ?? item.cue_points, "text", "Cue points", 6, 200);
  if (common.status === "published" && cues.length === 0) c.add("cues", "Add at least one cue point before publishing.");

  const metadata = { ...common.metadata };
  setMeta(metadata, "task_type", taskType);
  setMeta(metadata, "cue_keywords", cues.some((cue) => cue.keywords.length) ? cues.map((cue) => cue.keywords) : []);
  setMeta(metadata, "model_answer", modelAnswer);
  setMeta(metadata, "model_opening", modelOpening);

  return {
    parent: {
      ...commonColumns(common),
      metadata,
      prompt_text: prompt,
      prompt_type: promptType,
      target_duration_seconds: duration,
      target_grammar: targetGrammar,
      target_vocabulary: targetVocabulary,
      fluency_objective: fluency,
      pronunciation_objective: pronunciation,
      cue_points: cues.map((cue) => cue.text),
    },
    children: [],
  };
};

const FOCUS_AREA_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

const buildGrammar = (c: Collector, item: JsonRecord, children: unknown[], common: Common): Built => {
  const focusArea = str(item.focus_area).toLowerCase();
  if (!focusArea) c.add("focus_area", "Focus area is required.");
  else if (focusArea.length > 60 || !FOCUS_AREA_PATTERN.test(focusArea)) {
    c.add("focus_area", "Focus area is a short key like present-simple or articles (lowercase, hyphens).");
  }
  const explanation = c.text("explanation_text", item.explanation_text, 8000, "Explanation");
  const contrast = c.optionalText("contrast_text", item.contrast_text, 4000, "Contrast");
  const errorPattern = c.optionalText("common_error_pattern", item.common_error_pattern, 600, "Common error");
  const tags = c.list("tags", item.tags, 12, 60, "Tags");

  const rawExamples = c.array("examples", item.examples ?? item.examples_json, "Examples");
  if (rawExamples.length > 12) c.add("examples", "At most 12 examples.");
  const examples = rawExamples.slice(0, 12).map((entry, index) => {
    const row = isRecord(entry) ? entry : {};
    const bad = c.text(`examples[${index}].bad`, row.bad, 300, "Wrong sentence");
    const good = c.text(`examples[${index}].good`, row.good, 300, "Correct sentence");
    if (bad && good && normalizeAnswer(bad) === normalizeAnswer(good)) {
      c.add(`examples[${index}].good`, "The correct sentence must differ from the wrong one.");
    }
    return { bad, good };
  });

  if (children.length > 30) c.add("children", "At most 30 practice items.");
  const drills = children.slice(0, 30).map((entry, index): JsonRecord => {
    const at = `children[${index}]`;
    const row = isRecord(entry) ? entry : {};
    const id = optionalUuid(c, `${at}.id`, row.id);
    const drillType = c.oneOf(`${at}.drill_type`, row.drill_type, GRAMMAR_DRILL_TYPES, "Practice type", "fill");
    const defaults: Record<string, { title: string; instructions: string }> = {
      fill: { title: "Fill the gap", instructions: "Write the missing words." },
      error_correction: { title: "Correct the sentence", instructions: "Find the mistake and write the whole sentence correctly." },
      transformation: { title: "Rewrite the sentence", instructions: "Rewrite the sentence as the task asks." },
    };
    const title = c.text(`${at}.title`, str(row.title) || defaults[drillType]?.title, 220, "Title");
    const instructions = c.text(`${at}.instructions`, str(row.instructions) || defaults[drillType]?.instructions, 900, "Instructions");
    const prompt = c.text(`${at}.prompt_text`, row.prompt_text, 900, "Prompt");
    const status = c.oneOf(`${at}.status`, row.status, CONTENT_STATUSES, "Status", "published");
    const expected = isRecord(row.expected_answer_json) ? row.expected_answer_json : {};
    const accepted = c.list(`${at}.accepted_answers`, row.accepted_answers ?? expected.accepted_answers, 12, 400, "Accepted answers");
    if (accepted.length === 0) c.add(`${at}.accepted_answers`, "Add at least one accepted answer.");
    const hasBlank = /_{2,}/.test(prompt);
    if (drillType === "fill" && prompt) {
      if (!hasBlank) c.add(`${at}.prompt_text`, "A fill-the-gap prompt needs a gap written as ___.");
      else if (accepted.length && blankFills(prompt, accepted).length === 0) {
        c.add(`${at}.accepted_answers`, "The answers only repeat words around the gap; give the words that go in the gap.");
      }
    }
    if (drillType !== "fill" && hasBlank) c.add(`${at}.prompt_text`, "Only fill-the-gap prompts use ___.");
    if (drillType === "error_correction" && prompt) {
      const wrong = normalizeAnswer(prompt);
      if (accepted.some((answer) => normalizeAnswer(answer) === wrong)) {
        c.add(`${at}.accepted_answers`, "An accepted answer is the same as the wrong sentence.");
      }
    }
    const targetSkill = str(row.target_skill_key) || (focusArea ? `grammar.${focusArea}` : "grammar");
    if (targetSkill.length > 120) c.add(`${at}.target_skill_key`, "Skill key must be at most 120 characters.");
    return {
      ...(id ? { id } : {}),
      drill_type: drillType,
      title,
      instructions,
      prompt_text: prompt,
      expected_answer_json: { ...expected, accepted_answers: accepted },
      target_skill_key: targetSkill,
      status,
      sort_order: (index + 1) * 10,
      metadata: childMetadata(row.metadata),
    };
  });
  if (common.status === "published" && !drills.some((drill) => drill.status === "published")) {
    c.add("children", "Add at least one published practice item before publishing the unit.");
  }

  return {
    parent: {
      ...commonColumns(common),
      focus_area: focusArea,
      explanation_text: explanation,
      contrast_text: contrast,
      common_error_pattern: errorPattern,
      examples_json: examples,
      tags,
    },
    children: drills,
  };
};

const buildImmersion = (c: Collector, item: JsonRecord, children: unknown[], common: Common): Built => {
  const context = c.text("context_text", item.context_text, 2000, "Situation");
  const objective = c.text("objective_text", item.objective_text, 900, "Goal");
  const missionType = c.oneOf("mission_type", item.mission_type, MISSION_TYPES, "Mission type");
  const targetVocabulary = c.list("target_vocabulary", item.target_vocabulary, 20, 80, "Target vocabulary");
  const targetGrammar = c.optionalText("target_grammar", item.target_grammar, 160, "Target grammar");
  const culturalNote = c.optionalText("cultural_note", item.cultural_note, 1000, "Cultural note");
  const successConditions = c.list(
    "success_conditions",
    item.success_conditions ?? item.success_conditions_json,
    8,
    300,
    "Success conditions",
  );

  if (children.length > 8) c.add("children", "At most 8 steps.");
  const steps = children.slice(0, 8).map((entry, index): JsonRecord => {
    const at = `children[${index}]`;
    const row = isRecord(entry) ? entry : {};
    const id = optionalUuid(c, `${at}.id`, row.id);
    const rawKind = str(row.kind ?? row.step_type).toLowerCase();
    const aliases: Record<string, (typeof STEP_KINDS)[number]> = { reading: "read", listening: "listen", writing: "reply", speaking: "speak" };
    const kind = c.oneOf(`${at}.kind`, aliases[rawKind] ?? rawKind, STEP_KINDS, "Step type");
    const title = c.text(`${at}.title`, row.title, 220, "Title");
    const instructions = c.text(`${at}.instructions`, row.instructions, 900, "Instructions");
    const prompt = c.text(`${at}.prompt_text`, row.prompt_text, 4000, kind === "read" ? "Notice text" : kind === "listen" ? "Script" : "Cue");
    const minutes = c.int(`${at}.estimated_minutes`, row.estimated_minutes, 1, 90, "Minutes", 3);
    const status = c.oneOf(`${at}.status`, row.status, CONTENT_STATUSES, "Status", "published");
    const metadata = childMetadata(row.metadata);
    const stored = isRecord(row.expected_answer_json) ? row.expected_answer_json : {};
    let expected: JsonRecord;
    if (kind === "read" || kind === "listen") {
      const questions = readChoiceQuestions(c, `${at}.questions`, row.questions ?? stored.questions, {
        maxQuestions: 6,
        answerKey: "answer",
        withSkill: false,
      });
      if (questions.length === 0) c.add(`${at}.questions`, "Add at least one question to this step.");
      expected = {
        questions: questions.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options, answer: q.answer_index, explanation: q.explanation })),
      };
      if (c.errors.length === 0 && parseImmersionQuestions(expected).length !== questions.length) {
        c.add(`${at}.questions`, "Some questions cannot be graded; check prompts, options and answers.");
      }
      if (kind === "listen") {
        const accent = str(row.accent ?? metadata.accent).toLowerCase();
        if (accent && accent !== "us" && accent !== "gb") c.add(`${at}.accent`, "Accent must be us, gb or empty.");
        setMeta(metadata, "accent", accent === "us" || accent === "gb" ? accent : null);
      } else delete metadata.accent;
    } else {
      delete metadata.accent;
      const goal = c.text(`${at}.goal`, row.goal ?? stored.goal, 400, "Goal");
      const rawPoints = c.array(`${at}.points`, row.points ?? stored.points, "Points");
      if (rawPoints.length === 0) c.add(`${at}.points`, "Add at least one point the reply must cover.");
      if (rawPoints.length > 6) c.add(`${at}.points`, "At most 6 points.");
      const points = rawPoints.slice(0, 6).map((point, pointIndex) => {
        const p = isRecord(point) ? point : {};
        const label = c.text(`${at}.points[${pointIndex}].label`, p.label, 160, "Point");
        const any = c.list(`${at}.points[${pointIndex}].any`, p.any, 30, 80, "Accepted phrases");
        if (any.length === 0) c.add(`${at}.points[${pointIndex}].any`, "Give at least one word or phrase that shows this point is covered.");
        return { label, any };
      });
      const modelAnswer = c.optionalText(`${at}.model_answer`, row.model_answer ?? stored.model_answer, 1200, "Model answer");
      const rawMin = row.min_words ?? stored.min_words;
      const minWords = rawMin === undefined || rawMin === null || rawMin === ""
        ? null
        : c.int(`${at}.min_words`, rawMin, 3, 300, "Minimum words");
      expected = { goal, points, ...(modelAnswer ? { model_answer: modelAnswer } : {}), ...(minWords ? { min_words: minWords } : {}) };
      if (c.errors.length === 0 && parsePoints(expected).length !== points.length) {
        c.add(`${at}.points`, "Some points cannot be checked; each needs a label and phrases.");
      }
    }
    const targetSkill = str(row.target_skill_key) || STEP_SKILL[kind];
    return {
      ...(id ? { id } : {}),
      step_index: index,
      service_key: STEP_SERVICE[kind],
      step_type: kind,
      title,
      instructions,
      prompt_text: prompt,
      expected_answer_json: expected,
      target_skill_key: targetSkill.slice(0, 120),
      estimated_minutes: minutes,
      status,
      metadata,
    };
  });
  const published = steps.filter((step) => step.status === "published");
  if (common.status === "published" && published.length === 0) {
    c.add("children", "Add at least one published step before publishing the mission.");
  }
  const skillMix = [...new Set(published.map((step) => String(step.service_key)))];

  return {
    parent: {
      ...commonColumns(common),
      context_text: context,
      objective_text: objective,
      mission_type: missionType,
      target_vocabulary: targetVocabulary,
      target_grammar: targetGrammar,
      cultural_note: culturalNote,
      success_conditions_json: successConditions,
      skill_mix: skillMix,
    },
    children: steps,
  };
};

/** Collocations ("make a decision") and word family members, validated; empty lists are left out. */
const wordKnowledgeColumns = (c: Collector, at: string, row: JsonRecord): JsonRecord => {
  const out: JsonRecord = {};
  if (row.collocations !== undefined && row.collocations !== null) {
    if (!Array.isArray(row.collocations)) c.add(`${at}.collocations`, "Collocations must be a list of short phrases.");
    else if (row.collocations.length > 8) c.add(`${at}.collocations`, "At most 8 collocations.");
    const list = parseCollocations(row.collocations);
    if (list.length) out.collocations = list;
  }
  if (row.word_family !== undefined && row.word_family !== null) {
    if (!Array.isArray(row.word_family)) c.add(`${at}.word_family`, "Word family must be a list of { word, part_of_speech }.");
    else if (row.word_family.length > 6) c.add(`${at}.word_family`, "At most 6 word family members.");
    const family = parseWordFamily(row.word_family);
    if (family.length) out.word_family = family;
  }
  return out;
};

const buildVocabulary = (c: Collector, item: JsonRecord, children: unknown[], common: Common): Built => {
  const topic = c.text("topic", item.topic, 80, "Topic");
  const description = c.text("description", item.description, 900, "Description");
  if (children.length > 100) c.add("children", "At most 100 words in one set.");
  const seen = new Map<string, number>();
  const words = children.slice(0, 100).map((entry, index): JsonRecord => {
    const at = `children[${index}]`;
    const row = isRecord(entry) ? entry : {};
    const id = optionalUuid(c, `${at}.id`, row.id);
    const word = c.text(`${at}.word`, row.word, 120, "Word");
    const key = normalizeChoice(word);
    if (key) {
      if (seen.has(key)) c.add(`${at}.word`, `"${word}" is already word ${seen.get(key)! + 1} in this set.`);
      else seen.set(key, index);
    }
    return {
      ...(id ? { id } : {}),
      word,
      part_of_speech: c.optionalText(`${at}.part_of_speech`, row.part_of_speech, 40, "Part of speech"),
      definition: c.text(`${at}.definition`, row.definition, 400, "Meaning"),
      example: c.optionalText(`${at}.example`, row.example, 400, "Example"),
      translation_ru: c.optionalText(`${at}.translation_ru`, row.translation_ru, 200, "Russian translation"),
      translation_uz: c.optionalText(`${at}.translation_uz`, row.translation_uz, 200, "Uzbek translation"),
      sort_order: index + 1,
      // Optional word knowledge; only written when given, so sets without it never need the columns.
      ...wordKnowledgeColumns(c, at, row),
    };
  });
  if (common.status === "published" && words.length < 4) {
    c.add("children", "A word set needs at least 4 words before publishing (the quiz uses the other words as options).");
  }
  const parent = commonColumns(common);
  return { parent: { ...parent, topic: topic.toLowerCase(), description }, children: words };
};

// ---------------------------------------------------------------------------
// Registry row (learning_content_registry_items) — same conventions as the seeds
// ---------------------------------------------------------------------------

const textOf = (value: unknown, max: number): string => str(value).slice(0, max);
const listOf = (value: unknown): string[] => (Array.isArray(value) ? value.map((entry) => str(entry)).filter(Boolean) : []);
const numOf = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** The catalog row for an item, built from its normalised parent and child rows. */
export const buildRegistryRow = (
  serviceKey: StudioServiceKey,
  parent: JsonRecord,
  children: JsonRecord[],
  parentId: string | null = null,
): RegistryDraft => {
  const level = textOf(parent.level, 8) || null;
  const base = {
    service_key: serviceKey,
    content_type: STUDIO_SKILLS[serviceKey].contentType,
    source_table: STUDIO_SKILLS[serviceKey].table,
    source_ref: textOf(parent.slug, 160),
    title: textOf(parent.title, 220),
    skill_key: serviceKey,
    cefr_level: level,
    difficulty: difficultyForLevel(level),
    status: textOf(parent.status, 16) || "draft",
  };
  const metadata = parent.metadata && typeof parent.metadata === "object" ? parent.metadata as JsonRecord : {};
  switch (serviceKey) {
    case "reading": {
      const questions = Array.isArray(parent.questions) ? parent.questions.length : 0;
      return {
        ...base,
        description: textOf(parent.summary, 900) || null,
        subskill_keys: ["reading.gist", "reading.detail", "reading.inference", "vocabulary.context"],
        estimated_minutes: clampInt(numOf(parent.read_time_minutes, 6) + 3, 1, 240),
        learning_objective: textOf(parent.summary, 900) || null,
        tags: [textOf(parent.category, 120), textOf(parent.theme, 120)].filter(Boolean),
        payload_json: {
          ...(parentId ? { reading_article_id: parentId } : {}),
          tone: parent.tone ?? "mint",
          is_hot: parent.is_hot === true,
          question_count: questions,
        },
      };
    }
    case "listening":
      return {
        ...base,
        description: textOf(parent.summary, 900) || null,
        subskill_keys: ["listening.word_recognition", "listening.detail_recall", "vocabulary.recall"],
        estimated_minutes: clampInt(Math.ceil(numOf(parent.duration_seconds, 60) / 60) + 4, 1, 30),
        learning_objective: textOf(parent.summary, 900) || null,
        tags: listOf(parent.tags),
        payload_json: {
          accent: parent.accent ?? "general",
          speed_label: parent.speed_label ?? "natural",
          speed_wpm: numOf(parent.speed_wpm, 130),
          duration_seconds: numOf(parent.duration_seconds, 20),
          focus_skill: parent.focus_skill ?? "listening",
          question_count: Array.isArray(parent.questions) ? parent.questions.length : 0,
        },
      };
    case "writing": {
      const band = (level ?? "B").charAt(0);
      return {
        ...base,
        description: textOf(parent.prompt_text, 900) || null,
        subskill_keys: ["writing.task_completion", "writing.organisation", "writing.vocabulary", "writing.grammar"],
        estimated_minutes: band === "A" ? 8 : band === "B" ? 15 : 25,
        learning_objective: textOf(parent.guidance_text, 2000) || textOf(parent.prompt_text, 2000) || null,
        tags: [textOf(parent.genre, 120), textOf(parent.target_grammar, 200)].filter(Boolean),
        payload_json: {
          genre: parent.genre ?? null,
          target_grammar: parent.target_grammar ?? null,
          target_structure: parent.target_structure ?? null,
          expected_length_min: numOf(parent.expected_length_min, 60),
          expected_length_max: numOf(parent.expected_length_max, 180),
          target_vocabulary: listOf(parent.target_vocabulary),
        },
      };
    }
    case "speaking":
      return {
        ...base,
        description: textOf(parent.prompt_text, 900) || null,
        subskill_keys: ["speaking.fluency", "speaking.grammar", "speaking.task_completion", "vocabulary.usage"],
        estimated_minutes: clampInt(Math.ceil(numOf(parent.target_duration_seconds, 60) / 60) + 4, 1, 240),
        learning_objective: textOf(parent.fluency_objective, 600) || textOf(parent.prompt_text, 1200) || null,
        tags: [textOf(metadata.task_type, 40), textOf(parent.target_grammar, 160)].filter(Boolean),
        payload_json: {
          task_type: metadata.task_type ?? null,
          prompt_type: parent.prompt_type ?? null,
          target_duration_seconds: numOf(parent.target_duration_seconds, 60),
          target_grammar: parent.target_grammar ?? null,
          target_vocabulary: listOf(parent.target_vocabulary),
          cue_points: listOf(parent.cue_points),
        },
      };
    case "grammar": {
      const focus = textOf(parent.focus_area, 60);
      return {
        ...base,
        description: textOf(parent.explanation_text, 900) || null,
        subskill_keys: ["grammar.accuracy", ...(focus ? [`grammar.${focus}`] : []), "grammar.transfer"],
        estimated_minutes: 8,
        learning_objective: textOf(parent.contrast_text, 4000) || textOf(parent.explanation_text, 4000) || null,
        tags: listOf(parent.tags),
        payload_json: {
          focus_area: focus || null,
          common_error_pattern: parent.common_error_pattern ?? null,
          examples: Array.isArray(parent.examples_json) ? parent.examples_json : [],
        },
      };
    }
    case "immersion": {
      const published = children.filter((step) => step.status === "published");
      const minutes = published.reduce((sum, step) => sum + numOf(step.estimated_minutes, 0), 0);
      const skillMix = listOf(parent.skill_mix);
      return {
        ...base,
        description: textOf(parent.objective_text, 900) || null,
        subskill_keys: ["immersion.transfer", "immersion.communication", "immersion.problem-solving"],
        estimated_minutes: clampInt(minutes || 10, 1, 240),
        learning_objective: textOf(parent.objective_text, 900) || null,
        tags: [textOf(parent.mission_type, 40), ...skillMix].filter(Boolean),
        payload_json: {
          mission_type: parent.mission_type ?? null,
          skill_mix: skillMix,
          step_count: published.length,
          format: "steps_v2",
        },
      };
    }
    case "vocabulary":
      return {
        ...base,
        description: textOf(parent.description, 900) || null,
        subskill_keys: ["vocabulary.recall", "vocabulary.usage"],
        estimated_minutes: 6,
        learning_objective: "Learn the words in this set, then match each meaning to the right word.",
        tags: [textOf(parent.topic, 80)].filter(Boolean),
        payload_json: { topic: parent.topic ?? null, word_count: children.length },
      };
  }
};

// ---------------------------------------------------------------------------
// Stored rows -> editor payload (the shape normalizeStudioItem accepts)
// ---------------------------------------------------------------------------

const pick = (row: JsonRecord, keys: string[]): JsonRecord => {
  const out: JsonRecord = {};
  for (const key of keys) out[key] = row[key] ?? null;
  return out;
};

const zipKeywords = (texts: string[], keywords: unknown, textKey: string): Array<JsonRecord> =>
  texts.map((text, index) => ({
    [textKey]: text,
    keywords: Array.isArray(keywords) && Array.isArray(keywords[index]) ? listOf(keywords[index]) : [],
  }));

const editorQuestions = (value: unknown, answerKey: "answer_index" | "answer", withSkill: boolean): JsonRecord[] =>
  (Array.isArray(value) ? value : []).filter(isRecord).map((q) => ({
    id: q.id ?? null,
    prompt: q.prompt ?? "",
    options: Array.isArray(q.options) ? q.options : [],
    answer_index: typeof q[answerKey] === "number" ? q[answerKey] : null,
    explanation: q.explanation ?? "",
    ...(withSkill ? { skill: q.skill ?? "reading.detail" } : {}),
  }));

/**
 * The editor's view of a stored item: the same field names normalizeStudioItem
 * reads, so loading and saving an unchanged item is a no-op.
 */
export const rowToStudioPayload = (
  serviceKey: StudioServiceKey,
  row: JsonRecord,
  childRows: JsonRecord[],
): { item: JsonRecord; children: JsonRecord[] } => {
  const config = STUDIO_SKILLS[serviceKey];
  const metadata: JsonRecord = isRecord(row.metadata) ? { ...row.metadata } : {};
  const stored = isRecord(row.metadata) ? row.metadata : {};
  for (const key of config.managedMetadataKeys) delete metadata[key];
  const item: JsonRecord = {
    slug: row.slug ?? "",
    title: row.title ?? "",
    level: row.level ?? "",
    status: row.status ?? "draft",
    sort_order: row.sort_order ?? 100,
    metadata,
  };
  if (config.hasPresentationMeta) item.presentation_meta = isRecord(row.presentation_meta) ? row.presentation_meta : {};

  switch (serviceKey) {
    case "reading":
      return {
        item: {
          ...item,
          ...pick(row, ["summary", "content_markdown", "category", "theme", "tone", "read_time_minutes", "is_hot"]),
          questions: editorQuestions(row.questions, "answer_index", true),
        },
        children: [],
      };
    case "listening":
      return {
        item: {
          ...item,
          ...pick(row, ["summary", "transcript_text", "category", "accent", "speed_label", "speed_wpm", "duration_seconds", "audio_url", "focus_skill"]),
          tags: listOf(row.tags),
          questions: editorQuestions(row.questions, "answer_index", false),
        },
        children: childRows.map((s) => pick(s, ["id", "segment_text", "focus_phrase", "starts_at_seconds", "ends_at_seconds", "metadata"])),
      };
    case "writing": {
      const points = String(row.guidance_text ?? "")
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 8);
      return {
        item: {
          ...item,
          ...pick(row, ["prompt_text", "genre", "target_grammar", "target_structure", "expected_length_min", "expected_length_max"]),
          target_vocabulary: listOf(row.target_vocabulary),
          audience: stored.audience ?? null,
          checklist: zipKeywords(points, stored.checklist_keywords, "point"),
        },
        children: [],
      };
    }
    case "speaking":
      return {
        item: {
          ...item,
          ...pick(row, [
            "prompt_text",
            "prompt_type",
            "target_duration_seconds",
            "target_grammar",
            "fluency_objective",
            "pronunciation_objective",
          ]),
          target_vocabulary: listOf(row.target_vocabulary),
          task_type: stored.task_type ?? null,
          model_answer: stored.model_answer ?? null,
          model_opening: stored.model_opening ?? null,
          cues: zipKeywords(listOf(row.cue_points), stored.cue_keywords, "text"),
        },
        children: [],
      };
    case "grammar":
      return {
        item: {
          ...item,
          ...pick(row, ["focus_area", "explanation_text", "contrast_text", "common_error_pattern"]),
          tags: listOf(row.tags),
          examples: (Array.isArray(row.examples_json) ? row.examples_json : []).filter(isRecord).map((e) => ({
            bad: e.bad ?? "",
            good: e.good ?? "",
          })),
        },
        children: childRows.map((d) => {
          const expected = isRecord(d.expected_answer_json) ? d.expected_answer_json : {};
          return {
            ...pick(d, ["id", "drill_type", "title", "instructions", "prompt_text", "status", "target_skill_key", "metadata"]),
            expected_answer_json: expected,
            accepted_answers: listOf(expected.accepted_answers),
          };
        }),
      };
    case "immersion":
      return {
        item: {
          ...item,
          ...pick(row, ["context_text", "objective_text", "mission_type", "target_grammar", "cultural_note"]),
          target_vocabulary: listOf(row.target_vocabulary),
          success_conditions: listOf(row.success_conditions_json),
        },
        children: childRows.map((s) => {
          const expected = isRecord(s.expected_answer_json) ? s.expected_answer_json : {};
          const stepMeta: JsonRecord = isRecord(s.metadata) ? { ...s.metadata } : {};
          const accent = stepMeta.accent ?? null;
          delete stepMeta.accent;
          const kind = ({ reading: "read", listening: "listen", writing: "reply", speaking: "speak" } as Record<string, string>)[
            String(s.step_type)
          ] ?? s.step_type;
          return {
            ...pick(s, ["id", "title", "instructions", "prompt_text", "estimated_minutes", "status", "target_skill_key"]),
            kind,
            metadata: stepMeta,
            accent,
            questions: editorQuestions(expected.questions, "answer", false),
            goal: expected.goal ?? "",
            points: (Array.isArray(expected.points) ? expected.points : []).filter(isRecord).map((p) => ({
              label: p.label ?? "",
              any: listOf(p.any),
            })),
            model_answer: expected.model_answer ?? null,
            min_words: expected.min_words ?? null,
          };
        }),
      };
    case "vocabulary":
      return {
        item: { ...item, ...pick(row, ["topic", "description"]) },
        children: childRows.map((w) =>
          pick(w, ["id", "word", "part_of_speech", "definition", "example", "translation_ru", "translation_uz", "collocations", "word_family"])
        ),
      };
  }
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Validates one admin edit. `item` holds the parent fields, `children` the
 * child rows in display order (segments, drills, steps or words). Returns the
 * rows to write (without product_id, language_id, foreign keys or audit
 * columns) and the catalog row, or every problem found.
 */
export const normalizeStudioItem = (
  serviceKey: StudioServiceKey,
  item: unknown,
  children: unknown,
  options: NormalizeOptions = {},
): StudioResult => {
  const c = new Collector();
  if (!isStudioServiceKey(serviceKey)) return { ok: false, errors: [{ field: "service_key", message: "Unknown skill." }] };
  const config = STUDIO_SKILLS[serviceKey];
  if (!isRecord(item)) return { ok: false, errors: [{ field: "item", message: "item must be an object." }] };
  if (children !== undefined && children !== null && !Array.isArray(children)) {
    return { ok: false, errors: [{ field: "children", message: "children must be a list." }] };
  }
  const childList = Array.isArray(children) ? children : [];
  if (!config.childTable && childList.length) c.add("children", "This skill has no child rows.");
  const common = readCommon(c, item, config, options);

  let built: Built;
  switch (serviceKey) {
    case "reading":
      built = buildReading(c, item, common);
      break;
    case "listening":
      built = buildListening(c, item, childList, common);
      break;
    case "writing":
      built = buildWriting(c, item, common);
      break;
    case "speaking":
      built = buildSpeaking(c, item, common);
      break;
    case "grammar":
      built = buildGrammar(c, item, childList, common);
      break;
    case "immersion":
      built = buildImmersion(c, item, childList, common);
      break;
    case "vocabulary":
      built = buildVocabulary(c, item, childList, common);
      break;
  }

  const ids = built.children.map((child) => child.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) c.add("children", "The same row id appears twice.");

  if (c.errors.length) return { ok: false, errors: c.errors };
  return {
    ok: true,
    parent: built.parent,
    children: built.children,
    registry: buildRegistryRow(serviceKey, built.parent, built.children, options.id ?? null),
    metadataSource: common.metadataSource,
  };
};
