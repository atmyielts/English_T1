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
  const res = await fetch(`${edgeBase}/listening-content${pathname}`, {
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
    const err = new Error(`listening-content failed (${res.status}): ${JSON.stringify(details)}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }

  return readJsonOrText(res);
};

export type ListeningItem = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  transcript_text: string;
  level: string;
  category: string;
  accent: string;
  speed_label: string;
  speed_wpm: number;
  duration_seconds: number;
  focus_skill: string;
  tags?: string[];
  presentation_meta?: Record<string, unknown> | null;
};

export type ListeningPracticeResult = {
  feedback?: { summary?: string | null; issues?: Array<Record<string, unknown>> } | null;
  scoring?: { overall_score?: number | null; correctness_ratio?: number | null } | null;
  evaluation?: {
    missing_words?: string[];
    extra_words?: string[];
    expected_transcript?: string;
  } | null;
  notebook_words?: Array<Record<string, unknown>>;
};

export const listListeningItems = async (accessToken: string): Promise<ListeningItem[]> => {
  const res = (await call(accessToken, "/items?language_code=en", { method: "GET" })) as {
    items?: ListeningItem[];
  };
  return Array.isArray(res.items) ? res.items : [];
};

export const getListeningItem = async (
  accessToken: string,
  identifier: string,
): Promise<{
  item: ListeningItem;
  segments?: Array<Record<string, unknown>>;
  task_sets?: Array<Record<string, unknown>>;
}> =>
  (await call(accessToken, `/items/${encodeURIComponent(identifier)}`, {
    method: "GET",
  })) as {
    item: ListeningItem;
    segments?: Array<Record<string, unknown>>;
    task_sets?: Array<Record<string, unknown>>;
  };

export const submitListeningPractice = async (
  accessToken: string,
  body: Record<string, unknown>,
): Promise<ListeningPracticeResult> =>
  (await call(accessToken, "/practice/submit", {
    method: "POST",
    body: JSON.stringify(body),
  })) as ListeningPracticeResult;
