const getEnv = (key: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY"): string => {
  const value = import.meta.env[key] as string | undefined;
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};

const supabaseUrl = getEnv("VITE_SUPABASE_URL").replace(/\/$/, "");
const supabaseAnonKey = getEnv("VITE_SUPABASE_ANON_KEY");
const edgeBase = `${supabaseUrl}/functions/v1`;

const readJsonOrText = async (res: Response): Promise<unknown> => {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return res.json();
  return res.text();
};

export type NotebookCard = {
  id: string;
  word: string;
  normalized_word: string;
  definition: string | null;
  example: string | null;
  context_text: string | null;
  source_type: string;
  source_label: string | null;
  source_ref: string | null;
  notes: string | null;
  leitner_box: number;
  next_review_at: string;
  last_reviewed_at: string | null;
  review_count: number;
  correct_count: number;
  incorrect_count: number;
  updated_at: string;
};

export type NotebookSnapshot = {
  scope: {
    user_id: string;
    language_id: string;
    language_code: string;
    mode: "daily" | "recent";
  };
  summary: {
    due_count: number;
    total_count: number;
  };
  cards: NotebookCard[];
};

export type CaptureWordItem = {
  word: string;
  lemma?: string | null;
  part_of_speech?: string | null;
  definition?: string | null;
  example?: string | null;
  context_text?: string | null;
  source_type?: string | null;
  source_product_id?: string | null;
  source_label?: string | null;
  source_ref?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
};

const callVocabularyNotebook = async (
  accessToken: string,
  init: RequestInit,
  query = "",
): Promise<unknown> => {
  const res = await fetch(`${edgeBase}/vocabulary-notebook${query}`, {
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
    const err = new Error(`vocabulary-notebook failed (${res.status}): ${JSON.stringify(details)}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }

  return readJsonOrText(res);
};

export const getNotebookSnapshot = async (
  accessToken: string,
  mode: "daily" | "recent",
  limit: number,
): Promise<NotebookSnapshot> => {
  const payload = await callVocabularyNotebook(
    accessToken,
    { method: "GET" },
    `?mode=${encodeURIComponent(mode)}&limit=${encodeURIComponent(String(limit))}&language_code=en`,
  );

  return payload as NotebookSnapshot;
};

export const captureNotebookWords = async (
  accessToken: string,
  items: CaptureWordItem[],
): Promise<{ saved: number; cards: NotebookCard[] }> => {
  const payload = await callVocabularyNotebook(accessToken, {
    method: "POST",
    body: JSON.stringify({
      action: "capture",
      language_code: "en",
      items,
    }),
  });

  return payload as { saved: number; cards: NotebookCard[] };
};

export const reviewNotebookCard = async (
  accessToken: string,
  entryId: string,
  outcome: "correct" | "incorrect",
): Promise<{ updated: boolean; card: NotebookCard }> => {
  const payload = await callVocabularyNotebook(accessToken, {
    method: "POST",
    body: JSON.stringify({
      action: "review",
      language_code: "en",
      entry_id: entryId,
      outcome,
    }),
  });

  return payload as { updated: boolean; card: NotebookCard };
};
