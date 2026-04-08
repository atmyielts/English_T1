import { supabase } from './supabase';

const getEnv = (key: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string => {
  const value = import.meta.env[key] as string | undefined;
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL').replace(/\/$/, '');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');
const edgeBase = `${supabaseUrl}/functions/v1`;

const readJsonOrText = async (res: Response): Promise<unknown> => {
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return res.json();
  return res.text();
};

const runEdgeGet = async (url: string, accessToken: string): Promise<Response> =>
  fetch(url, {
    method: 'GET',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

const resolveLatestAccessToken = async (): Promise<string | null> => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (!error && data.session?.access_token) return data.session.access_token;
  } catch {
    // Ignore and fall through to refresh attempt.
  }

  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session?.access_token) return data.session.access_token;
  } catch {
    // Ignore: caller will handle final 401.
  }

  return null;
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
  summary: {
    due_count: number;
    total_count: number;
  };
  cards: NotebookCard[];
};

export const getNotebookSnapshot = async (
  accessToken: string,
  mode: 'daily' | 'recent',
  limit: number,
): Promise<NotebookSnapshot> => {
  const url = `${edgeBase}/vocabulary-notebook?mode=${encodeURIComponent(mode)}&limit=${encodeURIComponent(String(limit))}&language_code=en`;
  const primaryToken = accessToken.trim();
  let res = await runEdgeGet(url, primaryToken);

  if (res.status === 401) {
    const latestToken = (await resolveLatestAccessToken())?.trim() ?? '';
    if (latestToken && latestToken !== primaryToken) {
      res = await runEdgeGet(url, latestToken);
    }
  }

  if (!res.ok) {
    const details = await readJsonOrText(res);
    const err = new Error(`vocabulary-notebook failed (${res.status}): ${JSON.stringify(details)}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }

  return (await readJsonOrText(res)) as NotebookSnapshot;
};
