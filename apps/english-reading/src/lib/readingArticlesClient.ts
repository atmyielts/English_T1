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

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type ReadingArticleTone = "lime" | "mint" | "sky" | "peach" | "lavender" | "sand";

export type ReadingArticle = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  level: CefrLevel;
  category: string;
  theme: string;
  readTimeMinutes: number;
  tone: ReadingArticleTone;
  hot: boolean;
  status: "draft" | "published" | "archived";
  sortOrder: number;
};

type ListArticlesResponse = {
  articles?: Array<Record<string, unknown>>;
  filters?: {
    levels?: string[];
    categories?: string[];
    themes?: string[];
  };
};

const toText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const toNumber = (value: unknown, fallback: number): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toLevel = (value: unknown): CefrLevel => {
  const level = toText(value).toUpperCase();
  if (level === "A1" || level === "A2" || level === "B1" || level === "B2" || level === "C1" || level === "C2") {
    return level;
  }
  return "B1";
};

const toTone = (value: unknown): ReadingArticleTone => {
  const tone = toText(value).toLowerCase();
  if (
    tone === "lime" ||
    tone === "mint" ||
    tone === "sky" ||
    tone === "peach" ||
    tone === "lavender" ||
    tone === "sand"
  ) {
    return tone;
  }
  return "mint";
};

const mapArticle = (input: Record<string, unknown>): ReadingArticle => ({
  id: toText(input.id),
  slug: toText(input.slug),
  title: toText(input.title),
  summary: toText(input.summary),
  level: toLevel(input.level),
  category: toText(input.category),
  theme: toText(input.theme),
  readTimeMinutes: Math.max(1, Math.min(60, Math.floor(toNumber(input.read_time_minutes, 6)))),
  tone: toTone(input.tone),
  hot: input.is_hot === true,
  status: (toText(input.status).toLowerCase() as "draft" | "published" | "archived") || "published",
  sortOrder: Math.floor(toNumber(input.sort_order, 100)),
});

export const listReadingArticles = async (
  accessToken: string,
  params: {
    level?: CefrLevel | "all";
    category?: string;
    theme?: string;
    status?: "draft" | "published" | "archived";
    limit?: number;
  } = {},
): Promise<{
  articles: ReadingArticle[];
  filters: { levels: string[]; categories: string[]; themes: string[] };
}> => {
  const url = new URL(`${edgeBase}/reading-articles`);
  url.searchParams.set("language_code", "en");
  if (params.level && params.level !== "all") url.searchParams.set("level", params.level);
  if (params.category && params.category !== "all") url.searchParams.set("category", params.category);
  if (params.theme && params.theme !== "all") url.searchParams.set("theme", params.theme);
  if (params.status) url.searchParams.set("status", params.status);
  if (typeof params.limit === "number" && Number.isFinite(params.limit)) {
    url.searchParams.set("limit", String(Math.max(1, Math.min(200, Math.floor(params.limit)))));
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const details = await readJsonOrText(res);
    const err = new Error(`reading-articles failed (${res.status}): ${JSON.stringify(details)}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }

  const payload = (await readJsonOrText(res)) as ListArticlesResponse;
  const rows = Array.isArray(payload.articles) ? payload.articles : [];
  const articles = rows
    .map((row) => mapArticle(row))
    .filter((row) => row.id && row.title && row.level && row.category && row.theme);

  const levels = Array.isArray(payload.filters?.levels) ? payload.filters?.levels.filter((entry) => typeof entry === "string") : [];
  const categories = Array.isArray(payload.filters?.categories)
    ? payload.filters?.categories.filter((entry) => typeof entry === "string")
    : [];
  const themes = Array.isArray(payload.filters?.themes) ? payload.filters?.themes.filter((entry) => typeof entry === "string") : [];

  return {
    articles,
    filters: {
      levels,
      categories,
      themes,
    },
  };
};

