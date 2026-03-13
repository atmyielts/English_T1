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

export type CaptureWordItem = {
  word: string;
  definition?: string | null;
  example?: string | null;
  context_text?: string | null;
  source_type?: string | null;
  source_product_id?: string | null;
  source_label?: string | null;
  metadata?: Record<string, unknown> | null;
};

export const captureNotebookWords = async (
  accessToken: string,
  items: CaptureWordItem[],
): Promise<{ saved: number }> => {
  const res = await fetch(`${edgeBase}/vocabulary-notebook`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "capture",
      language_code: "en",
      items,
    }),
  });

  if (!res.ok) {
    const details = await readJsonOrText(res);
    const err = new Error(`vocabulary-notebook failed (${res.status}): ${JSON.stringify(details)}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }

  return (await readJsonOrText(res)) as { saved: number };
};

