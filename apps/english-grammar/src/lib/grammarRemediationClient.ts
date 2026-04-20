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
  const res = await fetch(`${edgeBase}/grammar-remediation${pathname}`, {
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
    const err = new Error(`grammar-remediation failed (${res.status}): ${JSON.stringify(details)}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }

  return readJsonOrText(res);
};

export type GrammarUnit = {
  id: string;
  slug: string;
  title: string;
  level: string;
  focus_area: string;
  explanation_text: string;
  contrast_text?: string | null;
  common_error_pattern?: string | null;
  examples_json?: Array<{ bad?: string; good?: string }>;
  tags?: string[];
  presentation_meta?: Record<string, unknown> | null;
};

export type GrammarDrill = {
  id: string;
  grammar_unit_id: string;
  drill_type: string;
  title: string;
  instructions: string;
  prompt_text: string;
  expected_answer_json?: Record<string, unknown>;
  sort_order: number;
  presentation_meta?: Record<string, unknown> | null;
};

export type GrammarAssignment = {
  id: string;
  grammar_unit_id: string;
  source_service_key?: string | null;
  reason: string;
  priority: number;
  status: string;
};

export type GrammarDashboard = {
  units: GrammarUnit[];
  drills: GrammarDrill[];
  assignments: GrammarAssignment[];
};

export type GrammarSubmitResult = {
  feedback?: { summary?: string | null; issues?: Array<Record<string, unknown>> } | null;
  scoring?: {
    overall_score?: number | null;
    correctness_ratio?: number | null;
    correction_quality_ratio?: number | null;
  } | null;
  evaluation?: {
    accepted_answers?: string[];
    exact_match?: boolean;
    partial_match?: boolean;
  } | null;
};

export const getGrammarDashboard = async (
  accessToken: string,
  options: { rebuild?: boolean } = {},
): Promise<GrammarDashboard> => {
  const query = options.rebuild ? "?language_code=en&rebuild=1" : "?language_code=en";
  return (await call(accessToken, `/dashboard${query}`, { method: "GET" })) as GrammarDashboard;
};

export const submitGrammarDrill = async (
  accessToken: string,
  body: Record<string, unknown>,
): Promise<GrammarSubmitResult> =>
  (await call(accessToken, "/drills/submit", {
    method: "POST",
    body: JSON.stringify(body),
  })) as GrammarSubmitResult;
