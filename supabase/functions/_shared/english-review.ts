// Mixed review: questions a learner got wrong come back until they get them right.
//
// Grammar questions, reading and listening questions, and dictation sentences
// that were missed are queued in learner_review_items. They return after
// 1 day, then 3, then 7; a wrong answer starts the item again. Three correct
// reviews retire it. Answer keys stay in `payload` on the server.
// Homework mistakes a learner chose to share from their centre (D4) arrive as
// grammar items keyed `homework:<mistake id>`, with the teacher's explanation.

import { checkGrammarAnswer } from "./english-grammar.ts";
import { scoreDictation } from "./english-listening.ts";

export type ReviewKind = "grammar" | "reading" | "listening";

export type GrammarReviewPayload = {
  type: "grammar";
  prompt: string;
  instructions: string;
  accepted: string[];
  /** Shown after answering; set for homework mistakes. */
  explanation?: string;
  source_title: string;
  source_slug: string;
};

export type ChoiceReviewPayload = {
  type: "choice";
  prompt: string;
  options: string[];
  answer_index: number;
  explanation: string;
  source_title: string;
  source_slug: string;
};

export type DictationReviewPayload = {
  type: "dictation";
  sentence: string;
  source_title: string;
  source_slug: string;
};

export type ReviewPayload = GrammarReviewPayload | ChoiceReviewPayload | DictationReviewPayload;

export type QueuedReviewItem = { kind: ReviewKind; item_key: string; payload: ReviewPayload };

/** Days until the next review for each box. Box 4 means retired. */
export const REVIEW_DAYS: Record<number, number> = { 1: 1, 2: 3, 3: 7 };
export const RETIRED_BOX = 4;

export const scheduleAfterAnswer = (box: number, correct: boolean, now: Date): { box: number; next_due_at: string } => {
  const nextBox = correct ? Math.min(RETIRED_BOX, Math.max(1, box) + 1) : 1;
  const days = REVIEW_DAYS[nextBox] ?? 30;
  return { box: nextBox, next_due_at: new Date(now.getTime() + days * 86_400_000).toISOString() };
};

/** What the learner sees before answering: no answer key, no explanation. */
export const publicReviewPayload = (payload: ReviewPayload): Record<string, unknown> => {
  if (payload.type === "grammar") {
    return { type: "grammar", prompt: payload.prompt, instructions: payload.instructions, source_title: payload.source_title, source_slug: payload.source_slug };
  }
  if (payload.type === "choice") {
    return { type: "choice", prompt: payload.prompt, options: payload.options, source_title: payload.source_title, source_slug: payload.source_slug };
  }
  // The sentence is played aloud; the text is revealed only after answering.
  return { type: "dictation", source_title: payload.source_title, source_slug: payload.source_slug, speak: payload.sentence };
};

export type ReviewCheck = { correct: boolean; expected: string; explanation: string | null; accuracy?: number };

export const checkReviewAnswer = (payload: ReviewPayload, answer: unknown): ReviewCheck => {
  if (payload.type === "grammar") {
    const result = checkGrammarAnswer({ prompt: payload.prompt, accepted: payload.accepted, response: String(answer ?? "") });
    return { correct: result.correct, expected: result.expected, explanation: payload.explanation || null };
  }
  if (payload.type === "choice") {
    const chosen = Number(answer);
    return {
      correct: Number.isInteger(chosen) && chosen === payload.answer_index,
      expected: payload.options[payload.answer_index] ?? "",
      explanation: payload.explanation || null,
    };
  }
  const scored = scoreDictation(payload.sentence, String(answer ?? ""));
  return { correct: scored.accuracy >= 0.9, expected: payload.sentence, explanation: null, accuracy: Math.round(scored.accuracy * 100) };
};

/** Parses a stored payload, or null when it is malformed. */
export const parseReviewPayload = (raw: unknown): ReviewPayload | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const text = (key: string) => (typeof value[key] === "string" ? String(value[key]) : "");
  const base = { source_title: text("source_title"), source_slug: text("source_slug") };
  if (value.type === "grammar" && text("prompt") && Array.isArray(value.accepted)) {
    return {
      type: "grammar",
      prompt: text("prompt"),
      instructions: text("instructions"),
      accepted: (value.accepted as unknown[]).map(String),
      ...(text("explanation") ? { explanation: text("explanation") } : {}),
      ...base,
    };
  }
  if (value.type === "choice" && text("prompt") && Array.isArray(value.options) && Number.isInteger(value.answer_index)) {
    return {
      type: "choice",
      prompt: text("prompt"),
      options: (value.options as unknown[]).map(String),
      answer_index: Number(value.answer_index),
      explanation: text("explanation"),
      ...base,
    };
  }
  if (value.type === "dictation" && text("sentence")) return { type: "dictation", sentence: text("sentence"), ...base };
  return null;
};

/**
 * Queues missed items for review (best effort: a failure here never fails the
 * activity). An item already in review starts again from box 1.
 */
export const queueReviewItems = async (
  sb: any,
  input: { userId: string; languageId: string; attemptId: string | null; items: QueuedReviewItem[] },
): Promise<number> => {
  if (!input.items.length) return 0;
  const dueAt = new Date(Date.now() + REVIEW_DAYS[1]! * 86_400_000).toISOString();
  const rows = input.items.slice(0, 20).map((item) => ({
    user_id: input.userId,
    language_id: input.languageId,
    kind: item.kind,
    item_key: item.item_key.slice(0, 300),
    payload: item.payload,
    source_attempt_id: input.attemptId,
    box: 1,
    next_due_at: dueAt,
  }));
  try {
    const { error } = await sb.from("learner_review_items").upsert(rows, { onConflict: "user_id,language_id,item_key" });
    if (error) {
      console.warn(JSON.stringify({ event: "english_review_queue_failed", error: error.message }));
      return 0;
    }
    return rows.length;
  } catch (error) {
    console.warn(JSON.stringify({ event: "english_review_queue_failed", error: error instanceof Error ? error.message : "unknown" }));
    return 0;
  }
};
