// "Draft with AI" for the English content studio. The model is shown one real,
// published item of the same skill (in the studio's editor shape) and asked for
// a new one on the admin's topic. The result goes through the same validator as
// a manual save, and nothing is written until the admin saves it.
import { type StudioServiceKey, slugify } from "./english-content-studio.ts";

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Fields the model should never fill: ids, internal metadata, display settings, ordering. */
const STRIP_KEYS = new Set(["id", "metadata", "presentation_meta", "sort_order", "status", "audio_url", "expected_answer_json"]);

const strip = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(strip);
  if (!isRecord(value)) return value;
  const out: JsonRecord = {};
  for (const [key, entry] of Object.entries(value)) {
    if (STRIP_KEYS.has(key)) continue;
    out[key] = strip(entry);
  }
  return out;
};

/** A published item in editor shape, minus everything the model shouldn't copy. */
export const draftExample = (editor: { item: JsonRecord; children: JsonRecord[] }) => ({
  item: strip(editor.item) as JsonRecord,
  children: (strip(editor.children) as JsonRecord[]) ?? [],
});

const SKILL_BRIEF: Record<StudioServiceKey, string> = {
  reading: "a reading article with comprehension questions. content_markdown is the article (short paragraphs, Markdown allowed). Questions test understanding of this article only; answer_index points at the correct option.",
  listening: "a listening activity. transcript_text is natural spoken English for audio; segments split it into short sentences for dictation; questions test understanding of the transcript.",
  writing: "a writing task with a clear prompt, audience, and a checklist of what a good answer includes.",
  speaking: "a speaking task with a prompt, cues the learner can follow, and a short model answer.",
  grammar: "a grammar lesson: a clear explanation, contrast examples (bad → good), and practice drills. Fill drills put ___ where the answer goes and list every correct answer in accepted_answers. Correction drills give a wrong sentence and the corrected sentence(s).",
  immersion: "a real-life mission made of steps (read, listen, reply, speak) set in one situation, with success conditions.",
  vocabulary: "a vocabulary word set on one topic: each word with part of speech, a learner-friendly definition, an example sentence, and Russian and Uzbek (Latin script) translations.",
};

export const DRAFT_SYSTEM_PROMPT = [
  "You write English learning content for Schood, used by learners in Uzbekistan (Uzbek and Russian speakers).",
  "Return ONE new item as JSON with exactly the same shape as the example: {\"item\": {...}, \"children\": [...]}.",
  "Keep every key of the example; do not add keys; keep arrays of the same kind of objects.",
  "Write for the requested CEFR level: vocabulary, sentence length and grammar must fit that level.",
  "Content must be original, accurate, culturally appropriate, and about the requested topic. No real people's private details, no brand endorsements, no invented statistics presented as fact.",
  "Make the title short and specific. Every answer must be unambiguous and match the text.",
  "Reply with JSON only.",
].join("\n");

export type DraftRequest = {
  serviceKey: StudioServiceKey;
  topic: string;
  level: string;
  notes: string;
};

export const draftUserPayload = (
  request: DraftRequest,
  example: { item: JsonRecord; children: JsonRecord[] },
): string =>
  JSON.stringify({
    task: `Write ${SKILL_BRIEF[request.serviceKey]}`,
    skill: request.serviceKey,
    level: request.level,
    topic: request.topic,
    notes: request.notes || undefined,
    example_shape: example,
  });

export const repairUserPayload = (
  request: DraftRequest,
  draft: unknown,
  errors: Array<{ field: string; message: string }>,
): string =>
  JSON.stringify({
    task: "Fix this draft so it passes every check below. Keep the topic, level and shape; change only what the errors require.",
    skill: request.serviceKey,
    level: request.level,
    draft,
    errors,
  });

/** Pulls {item, children} out of the model's reply and makes it a safe new draft. */
export const cleanDraft = (
  raw: unknown,
  request: DraftRequest,
): { item: JsonRecord; children: JsonRecord[] } | null => {
  const root = isRecord(raw) && isRecord(raw.item) ? raw : isRecord(raw) && isRecord(raw.draft) ? raw.draft as JsonRecord : null;
  if (!root || !isRecord(root.item)) return null;
  const item = strip(root.item) as JsonRecord;
  const children = Array.isArray(root.children) ? (strip(root.children) as unknown[]).filter(isRecord) : [];
  item.level = request.level;
  item.status = "draft";
  const title = typeof item.title === "string" ? item.title.trim() : "";
  const slug = typeof item.slug === "string" ? slugify(item.slug) : "";
  item.slug = slug || slugify(title || request.topic);
  return { item, children: children as JsonRecord[] };
};
