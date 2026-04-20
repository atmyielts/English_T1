import { edgeBase, supabaseAnonKey } from "./runtimeConfig";

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
  const res = await fetch(`${edgeBase}/immersion-missions${pathname}`, {
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
    const err = new Error(`immersion-missions failed (${res.status}): ${JSON.stringify(details)}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }

  return readJsonOrText(res);
};

export type ImmersionMissionStep = {
  id: string;
  mission_id: string;
  step_index: number;
  service_key: string;
  step_type: string;
  title: string;
  instructions: string;
  prompt_text: string;
  target_skill_key: string;
  estimated_minutes: number;
  expected_answer_json?: Record<string, unknown>;
};

export type ImmersionMission = {
  id: string;
  slug: string;
  title: string;
  context_text: string;
  objective_text: string;
  mission_type: string;
  level: string;
  target_vocabulary?: string[];
  target_grammar?: string | null;
  skill_mix?: string[];
  success_conditions_json?: string[];
  cultural_note?: string | null;
  steps?: ImmersionMissionStep[];
  presentation_meta?: Record<string, unknown> | null;
};

export type ImmersionSubmitResult = {
  feedback?: { summary?: string | null; issues?: Array<Record<string, unknown>> } | null;
  scoring?: {
    overall_score?: number | null;
    correctness_ratio?: number | null;
    correction_quality_ratio?: number | null;
    completion_ratio?: number | null;
  } | null;
  evaluation?: {
    used_target_vocabulary?: string[];
    missed_target_vocabulary?: string[];
    comparison?: Record<string, unknown>;
  } | null;
  step_results?: Array<{
    step_id: string;
    title: string;
    service_key: string;
    step_type: string;
    word_count: number;
    matched_keywords?: string[];
    missing_keywords?: string[];
    score: number;
  }>;
  mastery_reopened_count?: number;
  note?: string;
};

export const listImmersionMissions = async (accessToken: string): Promise<ImmersionMission[]> => {
  const res = (await call(accessToken, "/missions?language_code=en", { method: "GET" })) as {
    missions?: ImmersionMission[];
  };
  return Array.isArray(res.missions) ? res.missions : [];
};

export const getImmersionMission = async (
  accessToken: string,
  identifier: string,
): Promise<{
  mission: ImmersionMission;
  steps: ImmersionMissionStep[];
}> =>
  (await call(accessToken, `/missions/${encodeURIComponent(identifier)}?language_code=en`, {
    method: "GET",
  })) as {
    mission: ImmersionMission;
    steps: ImmersionMissionStep[];
  };

export const submitImmersionMission = async (
  accessToken: string,
  body: Record<string, unknown>,
): Promise<ImmersionSubmitResult> =>
  (await call(accessToken, "/missions/submit", {
    method: "POST",
    body: JSON.stringify(body),
  })) as ImmersionSubmitResult;
