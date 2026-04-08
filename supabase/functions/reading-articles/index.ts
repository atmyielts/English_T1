import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;

type ReadingArticleRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content_markdown: string | null;
  level: string;
  category: string;
  theme: string;
  tone: string;
  read_time_minutes: number;
  is_hot: boolean;
  status: string;
  sort_order: number;
  metadata: JsonRecord | null;
  created_at: string;
  updated_at: string;
};

type Scope = {
  languageId: string;
  languageCode: string;
  productId: string;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const READING_PRODUCT_SLUG = "english-reading";
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const STATUSES = ["draft", "published", "archived"] as const;
const TONES = ["lime", "mint", "sky", "peach", "lavender", "sand"] as const;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const toText = (value: unknown, maxLen = 320): string => String(value ?? "").trim().slice(0, maxLen);
const toNullableText = (value: unknown, maxLen = 320): string | null => {
  const out = toText(value, maxLen);
  return out.length > 0 ? out : null;
};
const toNumber = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const isObject = (value: unknown): value is JsonRecord => !!value && typeof value === "object" && !Array.isArray(value);
const isUuid = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const parseBody = async (req: Request): Promise<JsonRecord> => {
  try {
    const parsed = await req.json();
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const getBearerToken = (req: Request): string | null => {
  const header = req.headers.get("Authorization") ?? "";
  if (!header) return null;
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  return token.trim() || null;
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

const uniqueSorted = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));

const resolveScope = async (sb: any, url: URL): Promise<Scope> => {
  const languageInput = toText(url.searchParams.get("language_id") ?? url.searchParams.get("language_code") ?? "en", 64);
  let languageQuery = sb
    .from("languages")
    .select("id, code")
    .limit(1);
  languageQuery = isUuid(languageInput)
    ? languageQuery.eq("id", languageInput)
    : languageQuery.eq("code", languageInput.toLowerCase());

  const { data: languageRow, error: languageError } = await languageQuery.maybeSingle();
  if (languageError || !languageRow?.id) {
    throw new Error("Language not found");
  }

  const requestedProductId = toText(url.searchParams.get("product_id"), 64);
  if (requestedProductId) {
    const { data: productRow, error: productError } = await sb
      .from("products")
      .select("id")
      .eq("id", requestedProductId)
      .maybeSingle();
    if (productError || !productRow?.id) throw new Error("Product not found");

    return {
      languageId: String((languageRow as any).id),
      languageCode: String((languageRow as any).code ?? "en").toLowerCase(),
      productId: String((productRow as any).id),
    };
  }

  const { data: slugProductRow, error: slugProductError } = await sb
    .from("products")
    .select("id")
    .eq("metadata->>slug", READING_PRODUCT_SLUG)
    .maybeSingle();
  if (slugProductError || !slugProductRow?.id) throw new Error("Reading product not found");

  return {
    languageId: String((languageRow as any).id),
    languageCode: String((languageRow as any).code ?? "en").toLowerCase(),
    productId: String((slugProductRow as any).id),
  };
};

const resolveIsAdmin = async (sb: any, userId: string): Promise<boolean> => {
  const { data } = await sb.from("users").select("role").eq("id", userId).maybeSingle();
  const role = toText((data as any)?.role, 32).toLowerCase();
  return role === "admin";
};

const toStatus = (value: unknown, fallback: "draft" | "published" | "archived" = "published"): "draft" | "published" | "archived" => {
  const status = toText(value, 32).toLowerCase();
  if (status === "draft" || status === "published" || status === "archived") return status;
  return fallback;
};

const toLevel = (value: unknown): string => {
  const level = toText(value, 8).toUpperCase();
  if ((LEVELS as readonly string[]).includes(level)) return level;
  return "";
};

const toTone = (value: unknown): string => {
  const tone = toText(value, 32).toLowerCase();
  if ((TONES as readonly string[]).includes(tone)) return tone;
  return "mint";
};

const listArticles = async (sb: any, scope: Scope, url: URL, isAdmin: boolean): Promise<Response> => {
  const levelFilter = toLevel(url.searchParams.get("level"));
  const categoryFilter = toText(url.searchParams.get("category"), 120);
  const themeFilter = toText(url.searchParams.get("theme"), 120);
  const requestedStatus = toText(url.searchParams.get("status"), 24).toLowerCase();
  const limit = clamp(Math.floor(toNumber(url.searchParams.get("limit")) ?? 120), 1, 500);

  const selectedStatus = isAdmin && (STATUSES as readonly string[]).includes(requestedStatus)
    ? requestedStatus
    : "published";

  let query = sb
    .from("reading_articles")
    .select("id,slug,title,summary,content_markdown,level,category,theme,tone,read_time_minutes,is_hot,status,sort_order,metadata,created_at,updated_at")
    .eq("product_id", scope.productId)
    .eq("language_id", scope.languageId)
    .eq("status", selectedStatus)
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (levelFilter) query = query.eq("level", levelFilter);
  if (categoryFilter) query = query.eq("category", categoryFilter);
  if (themeFilter) query = query.eq("theme", themeFilter);

  const { data, error } = await query;
  if (error) return json(500, { error: "Failed to load reading articles", details: error.message });

  const { data: filterRows, error: filterError } = await sb
    .from("reading_articles")
    .select("level,category,theme")
    .eq("product_id", scope.productId)
    .eq("language_id", scope.languageId)
    .eq("status", selectedStatus);
  if (filterError) return json(500, { error: "Failed to load article filters", details: filterError.message });

  const rows = (data ?? []) as ReadingArticleRow[];
  const filterData = (filterRows ?? []) as Array<{ level: string; category: string; theme: string }>;

  return json(200, {
    articles: rows,
    filters: {
      levels: uniqueSorted(filterData.map((row) => toText(row.level, 8).toUpperCase())),
      categories: uniqueSorted(filterData.map((row) => toText(row.category, 120))),
      themes: uniqueSorted(filterData.map((row) => toText(row.theme, 120))),
    },
    scope: {
      language_id: scope.languageId,
      language_code: scope.languageCode,
      product_id: scope.productId,
      status: selectedStatus,
    },
  });
};

const createArticle = async (sb: any, scope: Scope, body: JsonRecord, userId: string): Promise<Response> => {
  const title = toText(body.title, 220);
  const summary = toText(body.summary, 900);
  const level = toLevel(body.level);
  const category = toText(body.category, 120);
  const theme = toText(body.theme, 120);
  if (!title || !summary || !level || !category || !theme) {
    return json(422, { error: "title, summary, level, category, and theme are required" });
  }

  const slug = slugify(toText(body.slug, 140) || title);
  if (!slug) return json(422, { error: "slug could not be generated" });

  const row = {
    product_id: scope.productId,
    language_id: scope.languageId,
    slug,
    title,
    summary,
    content_markdown: toNullableText(body.content_markdown, 120000),
    level,
    category,
    theme,
    tone: toTone(body.tone),
    read_time_minutes: clamp(Math.floor(toNumber(body.read_time_minutes) ?? 6), 1, 60),
    is_hot: body.is_hot === true,
    status: toStatus(body.status, "draft"),
    sort_order: Math.floor(toNumber(body.sort_order) ?? 100),
    metadata: isObject(body.metadata) ? body.metadata : {},
    created_by: userId,
    updated_by: userId,
  };

  const { data, error } = await sb
    .from("reading_articles")
    .insert(row)
    .select("id,slug,title,summary,level,category,theme,tone,read_time_minutes,is_hot,status,sort_order,updated_at")
    .maybeSingle();
  if (error || !data) return json(500, { error: "Failed to create reading article", details: error?.message ?? null });
  return json(200, { article: data });
};

const patchArticle = async (sb: any, body: JsonRecord, userId: string): Promise<Response> => {
  const id = toText(body.id, 64);
  if (!id || !isUuid(id)) return json(422, { error: "id is required" });

  const patch = isObject(body.patch) ? body.patch : {};
  const update: JsonRecord = { updated_by: userId };

  if (typeof patch.title === "string") update.title = toText(patch.title, 220);
  if (typeof patch.summary === "string") update.summary = toText(patch.summary, 900);
  if (typeof patch.slug === "string") update.slug = slugify(toText(patch.slug, 140));
  if (typeof patch.content_markdown === "string" || patch.content_markdown === null) {
    update.content_markdown = toNullableText(patch.content_markdown, 120000);
  }
  if (patch.level != null) {
    const level = toLevel(patch.level);
    if (!level) return json(422, { error: "Invalid level; expected A1-A2-B1-B2-C1-C2" });
    update.level = level;
  }
  if (typeof patch.category === "string") update.category = toText(patch.category, 120);
  if (typeof patch.theme === "string") update.theme = toText(patch.theme, 120);
  if (patch.tone != null) update.tone = toTone(patch.tone);
  if (patch.read_time_minutes != null) {
    update.read_time_minutes = clamp(Math.floor(toNumber(patch.read_time_minutes) ?? 6), 1, 60);
  }
  if (patch.is_hot != null) update.is_hot = patch.is_hot === true;
  if (patch.status != null) update.status = toStatus(patch.status, "published");
  if (patch.sort_order != null) update.sort_order = Math.floor(toNumber(patch.sort_order) ?? 100);
  if (patch.metadata != null && isObject(patch.metadata)) update.metadata = patch.metadata;

  const { data, error } = await sb
    .from("reading_articles")
    .update(update)
    .eq("id", id)
    .select("id,slug,title,summary,level,category,theme,tone,read_time_minutes,is_hot,status,sort_order,updated_at")
    .maybeSingle();
  if (error || !data) return json(500, { error: "Failed to update reading article", details: error?.message ?? null });
  return json(200, { article: data });
};

const archiveArticle = async (sb: any, id: string, userId: string): Promise<Response> => {
  if (!id || !isUuid(id)) return json(422, { error: "id is required" });

  const { data, error } = await sb
    .from("reading_articles")
    .update({ status: "archived", updated_by: userId })
    .eq("id", id)
    .select("id,status,updated_at")
    .maybeSingle();
  if (error || !data) return json(500, { error: "Failed to archive reading article", details: error?.message ?? null });
  return json(200, { article: data });
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!["GET", "POST", "PATCH", "DELETE"].includes(req.method)) {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Unauthorized" });

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !userData?.user) return json(401, { error: "Unauthorized" });
    const authedUserId = userData.user.id;

    const url = new URL(req.url);
    const scope = await resolveScope(serviceClient, url);
    const isAdmin = await resolveIsAdmin(serviceClient, authedUserId);

    if (req.method === "GET") {
      return await listArticles(serviceClient, scope, url, isAdmin);
    }

    if (!isAdmin) return json(403, { error: "Forbidden" });
    const body = await parseBody(req);

    if (req.method === "POST") return await createArticle(serviceClient, scope, body, authedUserId);
    if (req.method === "PATCH") return await patchArticle(serviceClient, body, authedUserId);

    const id = toText(url.searchParams.get("id") ?? body.id, 64);
    return await archiveArticle(serviceClient, id, authedUserId);
  } catch (error) {
    return json(500, {
      error: "reading-articles failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

