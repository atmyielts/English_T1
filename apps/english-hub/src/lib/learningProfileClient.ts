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

export type LearningProfileSnapshot = {
  generated_at?: string;
  scope?: {
    language_id?: string | null;
    language_code?: string | null;
    language_name?: string | null;
    resolved_by?: string | null;
    product_id?: string | null;
  } | null;
  language_profile?: Record<string, unknown> | null;
  service_breakdown?: Record<string, unknown> | null;
  outcomes?: Array<Record<string, unknown>>;
};

export const getLearningProfileSnapshot = async (
  accessToken: string,
  query: { languageCode?: string; limit?: number; productId?: string } = {},
): Promise<LearningProfileSnapshot> => {
  const params = new URLSearchParams();
  params.set('language_code', query.languageCode ?? 'en');
  params.set('limit', String(query.limit ?? 40));
  if (query.productId) params.set('product_id', query.productId);

  const res = await fetch(`${edgeBase}/learning-profile-v2?${params.toString()}`, {
    method: 'GET',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const details = await readJsonOrText(res);
    const err = new Error(`learning-profile-v2 failed (${res.status}): ${JSON.stringify(details)}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }

  return (await readJsonOrText(res)) as LearningProfileSnapshot;
};

