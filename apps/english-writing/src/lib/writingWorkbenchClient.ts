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
  const res = await fetch(`${edgeBase}/writing-workbench${pathname}`, {
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
    const err = new Error(`writing-workbench failed (${res.status}): ${JSON.stringify(details)}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }

  return readJsonOrText(res);
};

export type WritingPrompt = {
  id: string;
  slug: string;
  title: string;
  prompt_text: string;
  guidance_text?: string | null;
  level: string;
  genre: string;
  target_grammar?: string | null;
  target_vocabulary?: string[];
  target_structure?: string | null;
  expected_length_min: number;
  expected_length_max: number;
  presentation_meta?: Record<string, unknown> | null;
};

export type WritingDraft = {
  id: string;
  prompt_id: string;
  status: string;
  current_text: string;
  word_count: number;
  revision_count: number;
};

export type WritingSubmitResult = {
  draft: WritingDraft;
  prompt: WritingPrompt;
  revision_cycle?: {
    revision_index?: number;
    feedback_summary?: string | null;
    improvement_ratio?: number | null;
  } | null;
  feedback?: { summary?: string | null; issues?: Array<Record<string, unknown>> } | null;
  raw_issues?: Array<Record<string, unknown>>;
  scoring?: {
    overall_score?: number | null;
    correctness_ratio?: number | null;
    correction_quality_ratio?: number | null;
  } | null;
};

export const listWritingPrompts = async (accessToken: string): Promise<WritingPrompt[]> => {
  const res = (await call(accessToken, "/prompts?language_code=en", { method: "GET" })) as {
    prompts?: WritingPrompt[];
  };
  return Array.isArray(res.prompts) ? res.prompts : [];
};

export const startWritingDraft = async (
  accessToken: string,
  body: Record<string, unknown>,
): Promise<{
  draft: WritingDraft;
  prompt: WritingPrompt;
}> =>
  (await call(accessToken, "/drafts/start", {
    method: "POST",
    body: JSON.stringify(body),
  })) as {
    draft: WritingDraft;
    prompt: WritingPrompt;
  };

export const submitWritingDraft = async (
  accessToken: string,
  body: Record<string, unknown>,
): Promise<WritingSubmitResult> =>
  (await call(accessToken, "/drafts/submit", {
    method: "POST",
    body: JSON.stringify(body),
  })) as WritingSubmitResult;
