import { edgeBase, supabaseAnonKey } from "./supabase";

const readJsonOrText = async (res: Response): Promise<unknown> => {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return res.json();
  return res.text();
};

const call = async (
  accessToken: string,
  pathname: string,
  init: RequestInit = {},
): Promise<unknown> => {
  const res = await fetch(`${edgeBase}/speaking-studio${pathname}`, {
    ...init,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const details = await readJsonOrText(res);
    const err = new Error(`speaking-studio failed (${res.status}): ${JSON.stringify(details)}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }

  return readJsonOrText(res);
};

export type SpeakingPrompt = {
  id: string;
  slug: string;
  title: string;
  prompt_text: string;
  prompt_type: string;
  level: string;
  target_duration_seconds: number;
  target_grammar?: string | null;
  target_vocabulary?: string[];
  fluency_objective?: string | null;
  pronunciation_objective?: string | null;
  cue_points?: string[];
  presentation_meta?: Record<string, unknown> | null;
};

export type SpeakingSubmitResult = {
  feedback?: { summary?: string | null; issues?: Array<Record<string, unknown>> } | null;
  scoring?: {
    overall_score?: number | null;
    correctness_ratio?: number | null;
    correction_quality_ratio?: number | null;
  } | null;
  evaluation?: {
    word_count?: number;
    filler_count?: number;
    target_words_used?: string[];
    missed_target_words?: string[];
    comparison?: Record<string, unknown>;
  } | null;
  note?: string;
};

export const listSpeakingPrompts = async (accessToken: string): Promise<SpeakingPrompt[]> => {
  const res = (await call(accessToken, "/prompts?language_code=en", { method: "GET" })) as {
    prompts?: SpeakingPrompt[];
  };
  return Array.isArray(res.prompts) ? res.prompts : [];
};

export const getSpeakingPrompt = async (
  accessToken: string,
  identifier: string,
): Promise<{ prompt: SpeakingPrompt }> =>
  (await call(accessToken, `/prompts/${encodeURIComponent(identifier)}`, {
    method: "GET",
  })) as { prompt: SpeakingPrompt };

export const submitSpeakingPractice = async (
  accessToken: string,
  body: Record<string, unknown>,
): Promise<SpeakingSubmitResult> =>
  (await call(accessToken, "/practice/submit", {
    method: "POST",
    body: JSON.stringify(body),
  })) as SpeakingSubmitResult;
