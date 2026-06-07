import { edgeBase, supabaseAnonKey } from "./supabase";

const readJsonOrText = async (res: Response): Promise<unknown> => {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return res.json();
  return res.text();
};

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type ReadingArticleTone = "lime" | "mint" | "sky" | "peach" | "lavender" | "sand";
export type PresentationMeta = {
  scene_label?: string;
  hero_note?: string;
  cover_style_key?: string;
  coach_tone?: string;
  difficulty_badge?: string;
  support_mode_labels?: string[];
  target_badges?: string[];
  ambient_audio_key?: string;
  celebration_copy?: string;
  preview_media_url?: string;
};

export type ReadingArticle = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  contentMarkdown: string | null;
  level: CefrLevel;
  category: string;
  theme: string;
  readTimeMinutes: number;
  tone: ReadingArticleTone;
  hot: boolean;
  status: "draft" | "published" | "archived";
  sortOrder: number;
  presentationMeta?: PresentationMeta | null;
};

type ListArticlesResponse = {
  articles?: Array<Record<string, unknown>>;
  filters?: {
    levels?: string[];
    categories?: string[];
    themes?: string[];
  };
};

type ArticleMutationResponse = {
  article?: Record<string, unknown>;
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
  contentMarkdown: toText(input.content_markdown) || null,
  level: toLevel(input.level),
  category: toText(input.category),
  theme: toText(input.theme),
  readTimeMinutes: Math.max(1, Math.min(60, Math.floor(toNumber(input.read_time_minutes, 6)))),
  tone: toTone(input.tone),
  hot: input.is_hot === true,
  status: (toText(input.status).toLowerCase() as "draft" | "published" | "archived") || "published",
  sortOrder: Math.floor(toNumber(input.sort_order, 100)),
  presentationMeta:
    input.presentation_meta && typeof input.presentation_meta === "object"
      ? (input.presentation_meta as PresentationMeta)
      : null,
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

export const getReadingArticleBySlug = async (
  accessToken: string,
  slug: string,
  status?: "draft" | "published" | "archived",
): Promise<ReadingArticle | null> => {
  const safeSlug = slug.trim();
  if (!safeSlug) return null;

  const url = new URL(`${edgeBase}/reading-articles`);
  url.searchParams.set("language_code", "en");
  url.searchParams.set("slug", safeSlug);
  url.searchParams.set("limit", "1");
  if (status) url.searchParams.set("status", status);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const details = await readJsonOrText(res);
    const err = new Error(`reading-articles slug lookup failed (${res.status}): ${JSON.stringify(details)}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }

  const payload = (await readJsonOrText(res)) as ListArticlesResponse;
  const rows = Array.isArray(payload.articles) ? payload.articles : [];
  const row = rows[0];
  if (!row || typeof row !== "object") return null;
  const article = mapArticle(row);
  return article.id ? article : null;
};

type ArticleInput = {
  title: string;
  slug?: string;
  summary: string;
  content_markdown?: string;
  level: CefrLevel;
  category: string;
  theme: string;
  tone: ReadingArticleTone;
  read_time_minutes: number;
  status: "draft" | "published" | "archived";
  sort_order: number;
  is_hot: boolean;
  presentation_meta?: PresentationMeta | null;
};

const postOrPatch = async (
  accessToken: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
): Promise<ReadingArticle> => {
  const res = await fetch(`${edgeBase}/reading-articles`, {
    method,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const details = await readJsonOrText(res);
    const err = new Error(`reading-articles ${method} failed (${res.status}): ${JSON.stringify(details)}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }

  const payload = (await readJsonOrText(res)) as ArticleMutationResponse;
  if (!payload.article || typeof payload.article !== "object") {
    throw new Error("reading-articles returned empty article payload");
  }
  return mapArticle(payload.article);
};

export const createReadingArticle = async (
  accessToken: string,
  input: ArticleInput,
): Promise<ReadingArticle> => postOrPatch(accessToken, "POST", input);

export const updateReadingArticle = async (
  accessToken: string,
  id: string,
  patch: Partial<ArticleInput>,
): Promise<ReadingArticle> =>
  postOrPatch(accessToken, "PATCH", {
    id,
    patch,
  });

export const archiveReadingArticle = async (
  accessToken: string,
  id: string,
): Promise<void> => {
  const url = new URL(`${edgeBase}/reading-articles`);
  url.searchParams.set("id", id);
  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const details = await readJsonOrText(res);
    const err = new Error(`reading-articles DELETE failed (${res.status}): ${JSON.stringify(details)}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }
};
