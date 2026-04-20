import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAdminRequest } from "../_shared/admin-access.ts";
import {
  resolveEnglishProducts,
  resolveLanguageScope,
  toNullableText,
  toNumber,
  toText,
} from "../_shared/english-learning.ts";

type JsonRecord = Record<string, unknown>;
type ServiceKey = "reading" | "listening" | "writing" | "speaking" | "grammar" | "vocabulary" | "immersion";
type ServiceConfig = {
  serviceKey: Exclude<ServiceKey, "vocabulary">;
  label: string;
  table: string;
  productKey: Exclude<ServiceKey, "vocabulary">;
  select: string;
  childTable?: string;
  childForeignKey?: string;
  normalize: (row: Record<string, unknown>, relatedCount: number) => Record<string, unknown>;
  buildUpdate: (patch: JsonRecord) => JsonRecord;
};

const routeMarker = "/admin-english-content";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const isObject = (value: unknown): value is JsonRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

const parseBody = async (req: Request): Promise<JsonRecord> => {
  try {
    const parsed = await req.json();
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const extractRoute = (url: URL, marker: string): string => {
  const idx = url.pathname.indexOf(marker);
  if (idx < 0) return "";
  const tail = url.pathname.slice(idx + marker.length);
  return tail.startsWith("/") ? tail : tail ? `/${tail}` : "";
};

const clip = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((entry) => toText(entry, 120)).filter(Boolean)
    : [];

const toPresentationMeta = (value: unknown): JsonRecord | null => (isObject(value) ? value : null);

const countChildren = async (
  sb: any,
  childTable: string,
  foreignKey: string,
  ids: string[],
): Promise<Map<string, number>> => {
  if (ids.length === 0) return new Map();
  const { data } = await sb.from(childTable).select(`id, ${foreignKey}`).in(foreignKey, ids);
  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const parentId = toText(row[foreignKey], 120);
    if (!parentId) continue;
    counts.set(parentId, (counts.get(parentId) ?? 0) + 1);
  }
  return counts;
};

const SERVICE_CONFIGS: Record<Exclude<ServiceKey, "vocabulary">, ServiceConfig> = {
  reading: {
    serviceKey: "reading",
    label: "Reading",
    table: "reading_articles",
    productKey: "reading",
    select:
      "id, slug, title, summary, level, category, theme, tone, read_time_minutes, is_hot, status, sort_order, updated_at, presentation_meta",
    normalize: (row, _relatedCount) => ({
      id: row.id,
      service_key: "reading",
      item_kind: "article",
      slug: toText(row.slug, 160),
      title: toText(row.title, 220),
      summary: toText(row.summary, 900),
      level: toText(row.level, 16),
      status: toText(row.status, 32),
      sort_order: Math.floor(toNumber(row.sort_order) ?? 0),
      updated_at: row.updated_at ?? null,
      presentation_meta: toPresentationMeta(row.presentation_meta),
      detail_badges: [
        toText(row.category, 120),
        toText(row.theme, 120),
        `${Math.floor(toNumber(row.read_time_minutes) ?? 0)} min`,
      ].filter(Boolean),
      notes: row.is_hot === true ? ["Trending article"] : [],
      raw: row,
    }),
    buildUpdate: (patch) => {
      const update: JsonRecord = {};
      if (patch.title != null) update.title = toText(patch.title, 220);
      if (patch.summary != null) update.summary = toText(patch.summary, 900);
      if (patch.level != null) update.level = toText(patch.level, 16).toUpperCase();
      if (patch.category != null) update.category = toText(patch.category, 120);
      if (patch.theme != null) update.theme = toText(patch.theme, 120);
      if (patch.status != null) update.status = toText(patch.status, 32).toLowerCase();
      if (patch.sort_order != null) update.sort_order = Math.floor(toNumber(patch.sort_order) ?? 0);
      if (patch.read_time_minutes != null) update.read_time_minutes = clip(Math.floor(toNumber(patch.read_time_minutes) ?? 6), 1, 60);
      if (patch.tone != null) update.tone = toText(patch.tone, 32).toLowerCase();
      if (patch.is_hot != null) update.is_hot = patch.is_hot === true;
      if (patch.presentation_meta != null && isObject(patch.presentation_meta)) update.presentation_meta = patch.presentation_meta;
      return update;
    },
  },
  listening: {
    serviceKey: "listening",
    label: "Listening",
    table: "listening_items",
    productKey: "listening",
    select:
      "id, slug, title, summary, level, category, accent, speed_label, speed_wpm, duration_seconds, focus_skill, status, sort_order, updated_at, presentation_meta",
    childTable: "listening_segments",
    childForeignKey: "listening_item_id",
    normalize: (row, relatedCount) => ({
      id: row.id,
      service_key: "listening",
      item_kind: "clip",
      slug: toText(row.slug, 160),
      title: toText(row.title, 220),
      summary: toText(row.summary, 900),
      level: toText(row.level, 16),
      status: toText(row.status, 32),
      sort_order: Math.floor(toNumber(row.sort_order) ?? 0),
      updated_at: row.updated_at ?? null,
      presentation_meta: toPresentationMeta(row.presentation_meta),
      detail_badges: [
        toText(row.category, 120),
        toText(row.accent, 120),
        toText(row.speed_label, 120),
        `${Math.floor(toNumber(row.duration_seconds) ?? 0)}s`,
      ].filter(Boolean),
      metrics: {
        segment_count: relatedCount,
        speed_wpm: Math.floor(toNumber(row.speed_wpm) ?? 0),
      },
      raw: row,
    }),
    buildUpdate: (patch) => {
      const update: JsonRecord = {};
      if (patch.title != null) update.title = toText(patch.title, 220);
      if (patch.summary != null) update.summary = toText(patch.summary, 900);
      if (patch.level != null) update.level = toText(patch.level, 16).toUpperCase();
      if (patch.category != null) update.category = toText(patch.category, 120);
      if (patch.accent != null) update.accent = toText(patch.accent, 120);
      if (patch.speed_label != null) update.speed_label = toText(patch.speed_label, 120);
      if (patch.focus_skill != null) update.focus_skill = toText(patch.focus_skill, 120);
      if (patch.duration_seconds != null) update.duration_seconds = Math.max(10, Math.floor(toNumber(patch.duration_seconds) ?? 20));
      if (patch.status != null) update.status = toText(patch.status, 32).toLowerCase();
      if (patch.sort_order != null) update.sort_order = Math.floor(toNumber(patch.sort_order) ?? 0);
      if (patch.presentation_meta != null && isObject(patch.presentation_meta)) update.presentation_meta = patch.presentation_meta;
      return update;
    },
  },
  writing: {
    serviceKey: "writing",
    label: "Writing",
    table: "writing_prompts",
    productKey: "writing",
    select:
      "id, slug, title, prompt_text, guidance_text, level, genre, target_grammar, target_vocabulary, target_structure, expected_length_min, expected_length_max, status, sort_order, updated_at, presentation_meta",
    normalize: (row, _relatedCount) => ({
      id: row.id,
      service_key: "writing",
      item_kind: "prompt",
      slug: toText(row.slug, 160),
      title: toText(row.title, 220),
      summary: toText(row.prompt_text, 900),
      level: toText(row.level, 16),
      status: toText(row.status, 32),
      sort_order: Math.floor(toNumber(row.sort_order) ?? 0),
      updated_at: row.updated_at ?? null,
      presentation_meta: toPresentationMeta(row.presentation_meta),
      detail_badges: [
        toText(row.genre, 120),
        toText(row.target_grammar, 120),
        `${Math.floor(toNumber(row.expected_length_min) ?? 0)}-${Math.floor(toNumber(row.expected_length_max) ?? 0)} words`,
      ].filter(Boolean),
      notes: asStringArray(row.target_vocabulary).length > 0
        ? [`Target vocabulary: ${asStringArray(row.target_vocabulary).slice(0, 4).join(", ")}`]
        : [],
      raw: row,
    }),
    buildUpdate: (patch) => {
      const update: JsonRecord = {};
      if (patch.title != null) update.title = toText(patch.title, 220);
      if (patch.prompt_text != null) update.prompt_text = toText(patch.prompt_text, 8000);
      if (patch.guidance_text != null) update.guidance_text = toNullableText(patch.guidance_text, 4000);
      if (patch.level != null) update.level = toText(patch.level, 16).toUpperCase();
      if (patch.genre != null) update.genre = toText(patch.genre, 120);
      if (patch.target_grammar != null) update.target_grammar = toNullableText(patch.target_grammar, 120);
      if (patch.target_structure != null) update.target_structure = toNullableText(patch.target_structure, 220);
      if (patch.target_vocabulary != null) update.target_vocabulary = asStringArray(patch.target_vocabulary);
      if (patch.expected_length_min != null) update.expected_length_min = Math.max(10, Math.floor(toNumber(patch.expected_length_min) ?? 60));
      if (patch.expected_length_max != null) update.expected_length_max = Math.max(20, Math.floor(toNumber(patch.expected_length_max) ?? 180));
      if (patch.status != null) update.status = toText(patch.status, 32).toLowerCase();
      if (patch.sort_order != null) update.sort_order = Math.floor(toNumber(patch.sort_order) ?? 0);
      if (patch.presentation_meta != null && isObject(patch.presentation_meta)) update.presentation_meta = patch.presentation_meta;
      return update;
    },
  },
  speaking: {
    serviceKey: "speaking",
    label: "Speaking",
    table: "speaking_prompts",
    productKey: "speaking",
    select:
      "id, slug, title, prompt_text, prompt_type, level, target_duration_seconds, target_grammar, target_vocabulary, fluency_objective, pronunciation_objective, status, sort_order, updated_at, presentation_meta",
    normalize: (row, _relatedCount) => ({
      id: row.id,
      service_key: "speaking",
      item_kind: "prompt",
      slug: toText(row.slug, 160),
      title: toText(row.title, 220),
      summary: toText(row.prompt_text, 900),
      level: toText(row.level, 16),
      status: toText(row.status, 32),
      sort_order: Math.floor(toNumber(row.sort_order) ?? 0),
      updated_at: row.updated_at ?? null,
      presentation_meta: toPresentationMeta(row.presentation_meta),
      detail_badges: [
        toText(row.prompt_type, 120),
        `${Math.floor(toNumber(row.target_duration_seconds) ?? 0)}s target`,
        toText(row.target_grammar, 120),
      ].filter(Boolean),
      notes: asStringArray(row.target_vocabulary).length > 0
        ? [`Target vocabulary: ${asStringArray(row.target_vocabulary).slice(0, 4).join(", ")}`]
        : [],
      raw: row,
    }),
    buildUpdate: (patch) => {
      const update: JsonRecord = {};
      if (patch.title != null) update.title = toText(patch.title, 220);
      if (patch.prompt_text != null) update.prompt_text = toText(patch.prompt_text, 8000);
      if (patch.prompt_type != null) update.prompt_type = toText(patch.prompt_type, 120);
      if (patch.level != null) update.level = toText(patch.level, 16).toUpperCase();
      if (patch.target_duration_seconds != null) update.target_duration_seconds = Math.max(15, Math.floor(toNumber(patch.target_duration_seconds) ?? 45));
      if (patch.target_grammar != null) update.target_grammar = toNullableText(patch.target_grammar, 120);
      if (patch.target_vocabulary != null) update.target_vocabulary = asStringArray(patch.target_vocabulary);
      if (patch.fluency_objective != null) update.fluency_objective = toNullableText(patch.fluency_objective, 600);
      if (patch.pronunciation_objective != null) update.pronunciation_objective = toNullableText(patch.pronunciation_objective, 600);
      if (patch.status != null) update.status = toText(patch.status, 32).toLowerCase();
      if (patch.sort_order != null) update.sort_order = Math.floor(toNumber(patch.sort_order) ?? 0);
      if (patch.presentation_meta != null && isObject(patch.presentation_meta)) update.presentation_meta = patch.presentation_meta;
      return update;
    },
  },
  grammar: {
    serviceKey: "grammar",
    label: "Grammar",
    table: "grammar_units",
    productKey: "grammar",
    select:
      "id, slug, title, level, focus_area, explanation_text, contrast_text, common_error_pattern, tags, status, sort_order, updated_at, presentation_meta",
    childTable: "grammar_drills",
    childForeignKey: "grammar_unit_id",
    normalize: (row, relatedCount) => ({
      id: row.id,
      service_key: "grammar",
      item_kind: "unit",
      slug: toText(row.slug, 160),
      title: toText(row.title, 220),
      summary: toText(row.explanation_text, 900),
      level: toText(row.level, 16),
      status: toText(row.status, 32),
      sort_order: Math.floor(toNumber(row.sort_order) ?? 0),
      updated_at: row.updated_at ?? null,
      presentation_meta: toPresentationMeta(row.presentation_meta),
      detail_badges: [toText(row.focus_area, 120), ...asStringArray(row.tags).slice(0, 3)].filter(Boolean),
      metrics: {
        drill_count: relatedCount,
      },
      notes: [
        toText(row.common_error_pattern, 220),
        toText(row.contrast_text, 220),
      ].filter(Boolean),
      raw: row,
    }),
    buildUpdate: (patch) => {
      const update: JsonRecord = {};
      if (patch.title != null) update.title = toText(patch.title, 220);
      if (patch.level != null) update.level = toText(patch.level, 16).toUpperCase();
      if (patch.focus_area != null) update.focus_area = toText(patch.focus_area, 120);
      if (patch.explanation_text != null) update.explanation_text = toText(patch.explanation_text, 8000);
      if (patch.contrast_text != null) update.contrast_text = toNullableText(patch.contrast_text, 4000);
      if (patch.common_error_pattern != null) update.common_error_pattern = toNullableText(patch.common_error_pattern, 600);
      if (patch.tags != null) update.tags = asStringArray(patch.tags);
      if (patch.status != null) update.status = toText(patch.status, 32).toLowerCase();
      if (patch.sort_order != null) update.sort_order = Math.floor(toNumber(patch.sort_order) ?? 0);
      if (patch.presentation_meta != null && isObject(patch.presentation_meta)) update.presentation_meta = patch.presentation_meta;
      return update;
    },
  },
  immersion: {
    serviceKey: "immersion",
    label: "Immersion",
    table: "immersion_missions",
    productKey: "immersion",
    select:
      "id, slug, title, context_text, objective_text, mission_type, level, target_vocabulary, target_grammar, cultural_note, status, sort_order, updated_at, presentation_meta",
    childTable: "immersion_mission_steps",
    childForeignKey: "mission_id",
    normalize: (row, relatedCount) => ({
      id: row.id,
      service_key: "immersion",
      item_kind: "mission",
      slug: toText(row.slug, 160),
      title: toText(row.title, 220),
      summary: toText(row.objective_text, 900) || toText(row.context_text, 900),
      level: toText(row.level, 16),
      status: toText(row.status, 32),
      sort_order: Math.floor(toNumber(row.sort_order) ?? 0),
      updated_at: row.updated_at ?? null,
      presentation_meta: toPresentationMeta(row.presentation_meta),
      detail_badges: [
        toText(row.mission_type, 120),
        toText(row.target_grammar, 120),
      ].filter(Boolean),
      metrics: {
        step_count: relatedCount,
      },
      notes: [
        asStringArray(row.target_vocabulary).length > 0
          ? `Target vocabulary: ${asStringArray(row.target_vocabulary).slice(0, 4).join(", ")}`
          : "",
        toText(row.cultural_note, 220),
      ].filter(Boolean),
      raw: row,
    }),
    buildUpdate: (patch) => {
      const update: JsonRecord = {};
      if (patch.title != null) update.title = toText(patch.title, 220);
      if (patch.context_text != null) update.context_text = toText(patch.context_text, 8000);
      if (patch.objective_text != null) update.objective_text = toText(patch.objective_text, 4000);
      if (patch.mission_type != null) update.mission_type = toText(patch.mission_type, 120);
      if (patch.level != null) update.level = toText(patch.level, 16).toUpperCase();
      if (patch.target_grammar != null) update.target_grammar = toNullableText(patch.target_grammar, 120);
      if (patch.target_vocabulary != null) update.target_vocabulary = asStringArray(patch.target_vocabulary);
      if (patch.cultural_note != null) update.cultural_note = toNullableText(patch.cultural_note, 1000);
      if (patch.status != null) update.status = toText(patch.status, 32).toLowerCase();
      if (patch.sort_order != null) update.sort_order = Math.floor(toNumber(patch.sort_order) ?? 0);
      if (patch.presentation_meta != null && isObject(patch.presentation_meta)) update.presentation_meta = patch.presentation_meta;
      return update;
    },
  },
};

const loadServiceSummary = async (
  sb: any,
  scope: { languageId: string; languageCode: string },
  products: Record<string, { productId?: string | null }>,
): Promise<Array<Record<string, unknown>>> => {
  const summaryRows: Array<Record<string, unknown>> = [];

  for (const config of Object.values(SERVICE_CONFIGS)) {
    const productId = products[config.productKey]?.productId;
    let query = sb.from(config.table).select("status, updated_at").eq("language_id", scope.languageId);
    if (productId) query = query.eq("product_id", productId);
    const { data } = await query.limit(1000);
    const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
    const total = rows.length;
    const published = rows.filter((row) => toText(row.status, 32).toLowerCase() === "published").length;
    const draft = rows.filter((row) => toText(row.status, 32).toLowerCase() === "draft").length;
    const archived = rows.filter((row) => toText(row.status, 32).toLowerCase() === "archived").length;
    const latestUpdatedAt = rows
      .map((row) => String(row.updated_at ?? ""))
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a))[0] ?? null;

    summaryRows.push({
      service_key: config.serviceKey,
      label: config.label,
      total_count: total,
      published_count: published,
      draft_count: draft,
      archived_count: archived,
      latest_updated_at: latestUpdatedAt,
      readiness: total === 0 ? "empty" : draft > 0 ? "needs-publishing" : "ready",
    });
  }

  summaryRows.push({
    service_key: "vocabulary",
    label: "Vocabulary",
    total_count: 0,
    published_count: 0,
    draft_count: 0,
    archived_count: 0,
    latest_updated_at: null,
    readiness: "service-driven",
    note:
      "Vocabulary is fed by learner capture and activation rules rather than a curated authored content table.",
  });

  return summaryRows;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const route = extractRoute(url, routeMarker);
    const body = req.method === "PATCH" ? await parseBody(req) : {};
    const serviceKey = toText(url.searchParams.get("service_key") ?? body.service_key, 32).toLowerCase() as ServiceKey;

    const requiredPermission =
      req.method === "PATCH"
        ? "admin.products.manage"
        : route === "/content"
        ? "admin.products.manage"
        : "admin.analytics.view";

    const sb = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
      requiredPermission,
      action: "admin.english_content.manage",
    });
    if (!authz.ok) return authz.response;

    const scope = await resolveLanguageScope(
      sb,
      toText(url.searchParams.get("language_code") ?? body.language_code, 16) || "en",
    );
    const products = await resolveEnglishProducts(sb) as Record<string, { productId?: string | null }>;

    if (req.method === "GET" && (route === "" || route === "/" || route === "/summary")) {
      const services = await loadServiceSummary(sb, scope, products);
      return json(200, {
        generated_at: new Date().toISOString(),
        scope: {
          language_id: scope.languageId,
          language_code: scope.languageCode,
        },
        services,
      });
    }

    if (req.method === "GET" && route === "/content") {
      if (!serviceKey) return json(422, { error: "service_key is required" });
      if (serviceKey === "vocabulary") {
        return json(200, {
          service_key: "vocabulary",
          label: "Vocabulary",
          items: [],
          note:
            "Vocabulary content is learner-captured and activation-driven. Use rules and service prompts to shape the experience.",
        });
      }

      const config = SERVICE_CONFIGS[serviceKey as Exclude<ServiceKey, "vocabulary">];
      if (!config) return json(404, { error: "Unknown service_key" });
      const status = toText(url.searchParams.get("status"), 32).toLowerCase();
      const limit = clip(Math.floor(toNumber(url.searchParams.get("limit")) ?? 120), 1, 300);
      const productId = products[config.productKey]?.productId ?? null;

      let query = sb.from(config.table).select(config.select).eq("language_id", scope.languageId).order("sort_order", { ascending: true }).limit(limit);
      if (productId) query = query.eq("product_id", productId);
      if (status && status !== "all") query = query.eq("status", status);
      const { data, error } = await query;
      if (error) return json(500, { error: `Failed to load ${config.serviceKey} content`, details: error.message });

      const rows = Array.isArray(data) ? data as unknown as Array<Record<string, unknown>> : [];
      const ids = rows.map((row) => toText(row.id, 120)).filter(Boolean);
      const relatedCounts = config.childTable && config.childForeignKey
        ? await countChildren(sb, config.childTable, config.childForeignKey, ids)
        : new Map<string, number>();

      return json(200, {
        service_key: config.serviceKey,
        label: config.label,
        items: rows.map((row) => config.normalize(row, relatedCounts.get(toText(row.id, 120)) ?? 0)),
      });
    }

    if (req.method === "PATCH" && route === "/content") {
      if (!serviceKey || serviceKey === "vocabulary") return json(422, { error: "Editable service_key is required" });
      const config = SERVICE_CONFIGS[serviceKey as Exclude<ServiceKey, "vocabulary">];
      if (!config) return json(404, { error: "Unknown service_key" });
      const id = toText(body.id, 120);
      if (!id) return json(422, { error: "id is required" });
      const patch = isObject(body.patch) ? body.patch : {};
      const update = config.buildUpdate(patch);
      if (Object.keys(update).length === 0) return json(422, { error: "No supported fields were provided in patch" });

      const { data, error } = await sb
        .from(config.table)
        .update(update)
        .eq("id", id)
        .select(config.select)
        .maybeSingle();
      if (error || !data) {
        return json(500, {
          error: `Failed to update ${config.serviceKey} content`,
          details: error?.message ?? null,
        });
      }

      const relatedCounts = config.childTable && config.childForeignKey
        ? await countChildren(sb, config.childTable, config.childForeignKey, [id])
        : new Map<string, number>();

      return json(200, {
        ok: true,
        item: config.normalize(data as unknown as Record<string, unknown>, relatedCounts.get(id) ?? 0),
      });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
