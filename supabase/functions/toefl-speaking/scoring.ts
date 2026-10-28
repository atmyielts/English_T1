// TOEFL iBT 2026 Speaking estimate from browser speech-recognition transcripts.
//
// Honest scope: the platform has no server-side speech-to-text and no
// pronunciation model. The learner's browser transcribes each answer; we score
// WHAT was said:
// - Listen and Repeat: word-level comparison with the target sentence
//   (estimateListenRepeat, deterministic, no AI).
// - Take an Interview: an AI rater (free OpenRouter model) applies a summary of
//   the ETS 0-5 interview guide to the transcript; without AI a basic length /
//   topic check is used and labelled "basic".
// Pronunciation, rhythm and intonation are never assessed. Items recorded on a
// device without speech recognition are reported as unscored, not as zero.

import { basicInterviewEstimate, estimateListenRepeat, UNIT_SPEAKING_INTERVIEW, UNIT_SPEAKING_REPEAT } from "../_shared/toefl-2026.ts";

type Json = Record<string, unknown>;

export type SpeakingItemInput = {
  content_unit_id: string;
  type: string;
  /** Repeat: target sentence. Interview: interviewer question. */
  reference: string;
  response: unknown;
};

export type SpeakingItemResult = {
  content_unit_id: string;
  task: "listen_repeat" | "take_interview";
  score: number;
  source: "transcript_match" | "ai" | "basic";
  transcript: string;
  feedback: string | null;
  details: Json;
};

export type InterviewRater = (items: Array<{ content_unit_id: string; question: string; transcript: string }>) =>
  Promise<Array<{ content_unit_id: string; score: number; feedback: string }> | null>;

const isRecord = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);

export const readSpeakingResponse = (value: unknown): { transcript: string; stt: string; answered: boolean } => {
  if (!isRecord(value)) return { transcript: "", stt: "none", answered: false };
  const transcript = String(value.transcript ?? "").replace(/\s+/g, " ").trim().slice(0, 4000);
  const stt = String(value.stt ?? "browser").toLowerCase();
  return { transcript, stt, answered: true };
};

/** Speech recognition was not available, so silence cannot be told apart from "no transcript". */
const sttUnavailable = (stt: string): boolean => ["unsupported", "denied", "error", "none"].includes(stt);

export const scoreSpeakingItems = async (
  items: SpeakingItemInput[],
  rateInterviews: InterviewRater | null,
): Promise<{ items: SpeakingItemResult[]; unscored: string[]; ai_used: boolean }> => {
  const results: SpeakingItemResult[] = [];
  const unscored: string[] = [];
  const interviews: Array<{ content_unit_id: string; question: string; transcript: string }> = [];

  for (const item of items) {
    const response = readSpeakingResponse(item.response);
    if (response.answered && !response.transcript && sttUnavailable(response.stt)) {
      unscored.push(item.content_unit_id);
      continue;
    }
    if (item.type === UNIT_SPEAKING_REPEAT) {
      const estimate = estimateListenRepeat(item.reference, response.transcript);
      results.push({
        content_unit_id: item.content_unit_id,
        task: "listen_repeat",
        score: estimate.score,
        source: "transcript_match",
        transcript: response.transcript,
        feedback: null,
        details: { ...estimate, target: item.reference },
      });
    } else if (item.type === UNIT_SPEAKING_INTERVIEW) {
      interviews.push({ content_unit_id: item.content_unit_id, question: item.reference, transcript: response.transcript });
    }
  }

  let aiUsed = false;
  const answered = interviews.filter((i) => i.transcript.length > 0);
  let rated: Map<string, { score: number; feedback: string }> = new Map();
  if (rateInterviews && answered.length > 0) {
    try {
      const out = await rateInterviews(answered);
      if (out && out.length > 0) {
        rated = new Map(out.map((r) => [r.content_unit_id, { score: r.score, feedback: r.feedback }]));
        aiUsed = true;
      }
    } catch {
      rated = new Map();
    }
  }
  for (const interview of interviews) {
    const ai = rated.get(interview.content_unit_id);
    const basic = basicInterviewEstimate(interview.question, interview.transcript);
    const useAi = ai && interview.transcript.length > 0;
    results.push({
      content_unit_id: interview.content_unit_id,
      task: "take_interview",
      score: useAi ? Math.max(0, Math.min(5, Math.round(ai.score))) : basic.score,
      source: useAi ? "ai" : "basic",
      transcript: interview.transcript,
      feedback: useAi ? ai.feedback : null,
      details: { words: basic.words, on_topic: basic.on_topic, question: interview.question },
    });
  }
  return { items: results, unscored, ai_used: aiUsed };
};

export const INTERVIEW_RATER_INSTRUCTION = [
  "You rate TOEFL iBT practice answers in the 2026 'Take an Interview' task from a speech-recognition transcript.",
  "Give each answer one whole number from 0 to 5:",
  "5 = fully answers the question with clear, well-developed, on-topic elaboration and a range of accurate grammar and vocabulary;",
  "4 = answers the question with reasonable elaboration; connectors or precision may be limited; language adequate for general meaning;",
  "3 = generally on topic but elaboration is limited and limited range or accuracy restricts clarity;",
  "2 = only loosely connected to the question, little relevant elaboration, or mostly repeats the question's words;",
  "1 = only vaguely connected, isolated words or phrases;",
  "0 = no answer, not English, unrelated, or only phrases like 'I don't know'.",
  "You only see a transcript produced by a browser: do not judge pronunciation, rhythm, intonation or pace; fillers like 'um' are normal and are not errors; ignore obvious recognition mistakes.",
  "Write one or two short, concrete sentences of feedback in English for each answer.",
  'Return ONLY JSON: {"items":[{"content_unit_id":"...","score":0,"feedback":"..."}]}',
].join(" ");

export const parseInterviewRating = (raw: unknown, ids: string[]): Array<{ content_unit_id: string; score: number; feedback: string }> | null => {
  const list = isRecord(raw) && Array.isArray(raw.items) ? raw.items : null;
  if (!list) return null;
  const allowed = new Set(ids);
  const out: Array<{ content_unit_id: string; score: number; feedback: string }> = [];
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const id = String(entry.content_unit_id ?? "");
    const score = Number(entry.score);
    if (!allowed.has(id) || !Number.isFinite(score)) continue;
    out.push({ content_unit_id: id, score: Math.max(0, Math.min(5, Math.round(score))), feedback: String(entry.feedback ?? "").slice(0, 600) });
  }
  return out.length > 0 ? out : null;
};

const firstJsonObject = (text: string): unknown => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
};

export const createOpenRouterInterviewRater = (opts: {
  apiKey: string;
  models: string[];
  baseUrl: string;
  referer?: string | null;
  fetcher?: typeof fetch;
}): InterviewRater => async (items) => {
  const fetcher = opts.fetcher ?? fetch;
  const ids = items.map((i) => i.content_unit_id);
  for (const model of opts.models) {
    try {
      const res = await fetcher(`${opts.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "Schood TOEFL iBT",
          ...(opts.referer ? { "HTTP-Referer": opts.referer } : {}),
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 900,
          messages: [
            { role: "system", content: INTERVIEW_RATER_INSTRUCTION },
            { role: "user", content: JSON.stringify({ items }) },
          ],
        }),
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) continue;
      const payload = await res.json() as Json;
      const choices = Array.isArray(payload.choices) ? payload.choices as Json[] : [];
      const message = isRecord(choices[0]?.message) ? choices[0].message as Json : {};
      const content = typeof message.content === "string" ? message.content : "";
      const parsed = parseInterviewRating(firstJsonObject(content), ids);
      if (parsed) return parsed;
    } catch {
      // try the next model
    }
  }
  return null;
};
