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
import {
  buildRegistryRow,
  copySlug,
  type FieldError,
  isStudioServiceKey,
  mergeMetadata,
  normalizeStudioItem,
  type RegistryDraft,
  rowToStudioPayload,
  STUDIO_SKILLS,
  type StudioServiceKey,
} from "../_shared/english-content-studio.ts";

type JsonRecord = Record<string, unknown>;
type ServiceKey = "reading" | "listening" | "writing" | "speaking" | "grammar" | "vocabulary" | "immersion";
type ServiceConfig = {
  serviceKey: ServiceKey;
  label: string;
  table: string;
  productKey: ServiceKey;
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
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
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

const SERVICE_CONFIGS: Record<ServiceKey, ServiceConfig> = {
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
  vocabulary: {
    serviceKey: "vocabulary",
    label: "Vocabulary",
    table: "vocabulary_decks",
    productKey: "vocabulary",
    select: "id, slug, title, level, topic, description, status, sort_order, updated_at",
    childTable: "vocabulary_deck_words",
    childForeignKey: "deck_id",
    normalize: (row, relatedCount) => ({
      id: row.id,
      service_key: "vocabulary",
      item_kind: "deck",
      slug: toText(row.slug, 160),
      title: toText(row.title, 220),
      summary: toText(row.description, 900),
      level: toText(row.level, 16),
      status: toText(row.status, 32),
      sort_order: Math.floor(toNumber(row.sort_order) ?? 0),
      updated_at: row.updated_at ?? null,
      presentation_meta: null,
      detail_badges: [toText(row.topic, 120), `${relatedCount} words`].filter(Boolean),
      metrics: {
        word_count: relatedCount,
      },
      raw: row,
    }),
    buildUpdate: (patch) => {
      const update: JsonRecord = {};
      if (patch.title != null) update.title = toText(patch.title, 220);
      if (patch.level != null) update.level = toText(patch.level, 16).toUpperCase();
      if (patch.topic != null) update.topic = toText(patch.topic, 80);
      if (patch.description != null) update.description = toNullableText(patch.description, 900);
      if (patch.status != null) update.status = toText(patch.status, 32).toLowerCase();
      if (patch.sort_order != null) update.sort_order = Math.floor(toNumber(patch.sort_order) ?? 0);
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

  return summaryRows;
};

// ---------------------------------------------------------------------------
// Content studio: full item read / create / update / duplicate
// ---------------------------------------------------------------------------

type Scope = { languageId: string; languageCode: string };
type StudioContext = { sb: any; scope: Scope; productId: string; userId: string };

const validationFailed = (errors: FieldError[]): Response =>
  json(422, { error: "Some fields need fixing before this can be saved.", errors });

const isUniqueViolation = (error: unknown): boolean =>
  !!error && typeof error === "object" && String((error as JsonRecord).code ?? "") === "23505";

const describeError = (error: unknown): string =>
  error && typeof error === "object" ? toText((error as JsonRecord).message, 400) || "unknown error" : String(error ?? "unknown error");

const studioProductId = (products: Record<string, { productId?: string | null }>, key: StudioServiceKey): string =>
  toText(products[key]?.productId, 64);

const loadParent = async (ctx: StudioContext, key: StudioServiceKey, id: string): Promise<JsonRecord | null> => {
  const { data, error } = await ctx.sb
    .from(STUDIO_SKILLS[key].table)
    .select("*")
    .eq("id", id)
    .eq("language_id", ctx.scope.languageId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load item: ${error.message}`);
  return (data as JsonRecord | null) ?? null;
};

const loadChildren = async (ctx: StudioContext, key: StudioServiceKey, parentId: string): Promise<JsonRecord[]> => {
  const config = STUDIO_SKILLS[key];
  if (!config.childTable || !config.childForeignKey || !config.childOrderColumn) return [];
  const { data, error } = await ctx.sb
    .from(config.childTable)
    .select("*")
    .eq(config.childForeignKey, parentId)
    .order(config.childOrderColumn, { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load child rows: ${error.message}`);
  return Array.isArray(data) ? data as JsonRecord[] : [];
};

const findRegistryRow = async (ctx: StudioContext, key: StudioServiceKey, parentId: string, slug: string): Promise<JsonRecord | null> => {
  const config = STUDIO_SKILLS[key];
  const byRecord = await ctx.sb
    .from("learning_content_registry_items")
    .select("*")
    .eq("source_table", config.table)
    .eq("source_record_id", parentId)
    .limit(1)
    .maybeSingle();
  if (byRecord.data) return byRecord.data as JsonRecord;
  if (!slug) return null;
  const byRef = await ctx.sb
    .from("learning_content_registry_items")
    .select("*")
    .eq("language_id", ctx.scope.languageId)
    .eq("service_key", key)
    .eq("content_type", config.contentType)
    .eq("source_ref", slug)
    .limit(1)
    .maybeSingle();
  return (byRef.data as JsonRecord | null) ?? null;
};

const loadStudioItem = async (ctx: StudioContext, key: StudioServiceKey, id: string): Promise<JsonRecord | null> => {
  const parent = await loadParent(ctx, key, id);
  if (!parent) return null;
  const children = await loadChildren(ctx, key, id);
  const registry = await findRegistryRow(ctx, key, id, toText(parent.slug, 160));
  return {
    service_key: key,
    item: parent,
    children,
    registry,
    editor: rowToStudioPayload(key, parent, children),
  };
};

/** Is `slug` used by another item of this skill (same scope as the table's unique key)? */
const slugTaken = async (ctx: StudioContext, key: StudioServiceKey, slug: string, excludeId: string | null): Promise<boolean> => {
  const config = STUDIO_SKILLS[key];
  let query = ctx.sb.from(config.table).select("id").eq("language_id", ctx.scope.languageId).eq("slug", slug);
  if (config.slugScope === "product_language") query = query.eq("product_id", ctx.productId);
  const { data, error } = await query.limit(2);
  if (error) throw new Error(`Failed to check slug: ${error.message}`);
  return (Array.isArray(data) ? data as JsonRecord[] : []).some((row) => String(row.id) !== excludeId);
};

const slugConflict = (slug: string): Response =>
  json(409, {
    error: `The slug "${slug}" is already used by another item.`,
    errors: [{ field: "slug", message: "This slug is already used by another item. Choose a different one." }],
  });

/** Creates or updates the item's catalog row (matched by record id, then by slug). */
const upsertRegistry = async (
  ctx: StudioContext,
  key: StudioServiceKey,
  parentId: string,
  registry: RegistryDraft,
): Promise<{ error: string | null }> => {
  const existing = await findRegistryRow(ctx, key, parentId, registry.source_ref);
  const row: JsonRecord = {
    ...registry,
    product_id: ctx.productId,
    language_id: ctx.scope.languageId,
    source_record_id: parentId,
    metadata: {
      ...(isObject(existing?.metadata) ? existing!.metadata as JsonRecord : {}),
      edited_with: "admin-english-content",
    },
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  };
  if (existing?.id) {
    const { error } = await ctx.sb.from("learning_content_registry_items").update(row).eq("id", String(existing.id));
    return { error: error ? describeError(error) : null };
  }
  const { error } = await ctx.sb.from("learning_content_registry_items").insert({ ...row, created_by: ctx.userId });
  return { error: error ? describeError(error) : null };
};

const withForeignKey = (key: StudioServiceKey, parentId: string, child: JsonRecord): JsonRecord => ({
  ...child,
  [STUDIO_SKILLS[key].childForeignKey!]: parentId,
});

/** Inserts a new item with its children and catalog row. Undoes the insert if a later write fails. */
const createStudioItem = async (
  ctx: StudioContext,
  key: StudioServiceKey,
  itemIn: unknown,
  childrenIn: unknown,
): Promise<Response> => {
  const config = STUDIO_SKILLS[key];
  const result = normalizeStudioItem(key, itemIn, childrenIn, { defaultStatus: "draft" });
  if (!result.ok) return validationFailed(result.errors);
  const slug = String(result.parent.slug);
  if (await slugTaken(ctx, key, slug, null)) return slugConflict(slug);

  const parentRow: JsonRecord = {
    ...result.parent,
    product_id: ctx.productId,
    language_id: ctx.scope.languageId,
  };
  if (config.hasCreatedBy) {
    parentRow.created_by = ctx.userId;
    parentRow.updated_by = ctx.userId;
  }
  const inserted = await ctx.sb.from(config.table).insert(parentRow).select("id").maybeSingle();
  if (inserted.error || !inserted.data?.id) {
    if (isUniqueViolation(inserted.error)) return slugConflict(slug);
    return json(500, { error: "Could not create the item. Nothing was saved.", details: describeError(inserted.error) });
  }
  const parentId = String(inserted.data.id);
  const undo = async () => {
    // Children cascade with the parent.
    await ctx.sb.from(config.table).delete().eq("id", parentId);
  };

  if (config.childTable && result.children.length) {
    const rows = result.children.map(({ id: _id, ...child }) => withForeignKey(key, parentId, child));
    const { error } = await ctx.sb.from(config.childTable).insert(rows);
    if (error) {
      await undo();
      return json(500, { error: "Could not save the child rows. Nothing was saved.", details: describeError(error) });
    }
  }

  const registry = await upsertRegistry(ctx, key, parentId, buildRegistryRow(key, result.parent, result.children, parentId));
  if (registry.error) {
    await undo();
    return json(500, { error: "Could not add the item to the learner catalog. Nothing was saved.", details: registry.error });
  }

  return json(201, { ok: true, ...(await loadStudioItem(ctx, key, parentId)) });
};

/** Puts the children back exactly as they were before a failed save. */
const restoreChildren = async (ctx: StudioContext, key: StudioServiceKey, parentId: string, snapshot: JsonRecord[]): Promise<boolean> => {
  const config = STUDIO_SKILLS[key];
  if (!config.childTable || !config.childForeignKey) return true;
  const removed = await ctx.sb.from(config.childTable).delete().eq(config.childForeignKey, parentId);
  if (removed.error) return false;
  if (!snapshot.length) return true;
  const { error } = await ctx.sb.from(config.childTable).insert(snapshot);
  return !error;
};

/** A value for the unique ordering column that cannot clash with final values while rows are re-ordered. */
const temporaryOrder = (key: StudioServiceKey, index: number, id: string): JsonRecord => {
  switch (key) {
    case "listening":
      return { segment_index: 100000 + index };
    case "immersion":
      return { step_index: 100000 + index };
    case "grammar":
      return { sort_order: 100000 + index };
    case "vocabulary":
      return { word: `~studio-tmp~${id}`, sort_order: 100000 + index };
    default:
      return {};
  }
};

const syncChildren = async (
  ctx: StudioContext,
  key: StudioServiceKey,
  parentId: string,
  existing: JsonRecord[],
  next: JsonRecord[],
): Promise<string | null> => {
  const config = STUDIO_SKILLS[key];
  if (!config.childTable || !config.childForeignKey) return null;
  const keptIds = new Set(next.map((child) => String(child.id ?? "")).filter(Boolean));
  const removedIds = existing.map((row) => String(row.id)).filter((id) => !keptIds.has(id));

  if (removedIds.length) {
    const { error } = await ctx.sb.from(config.childTable).delete().in("id", removedIds);
    if (error) return `removing rows: ${describeError(error)}`;
  }

  const kept = next.filter((child) => child.id);
  for (const [index, child] of kept.entries()) {
    const temp = temporaryOrder(key, index, String(child.id));
    if (!Object.keys(temp).length) continue;
    const { error } = await ctx.sb.from(config.childTable).update(temp).eq("id", String(child.id));
    if (error) return `re-ordering rows: ${describeError(error)}`;
  }
  const now = new Date().toISOString();
  for (const child of kept) {
    const { id, ...fields } = child;
    const { error } = await ctx.sb
      .from(config.childTable)
      .update({ ...fields, updated_at: now })
      .eq("id", String(id))
      .eq(config.childForeignKey, parentId);
    if (error) return `updating a row: ${describeError(error)}`;
  }

  const fresh = next.filter((child) => !child.id).map((child) => withForeignKey(key, parentId, child));
  if (fresh.length) {
    const { error } = await ctx.sb.from(config.childTable).insert(fresh);
    if (error) return `adding rows: ${describeError(error)}`;
  }
  return null;
};

const updateStudioItem = async (
  ctx: StudioContext,
  key: StudioServiceKey,
  id: string,
  itemIn: unknown,
  childrenIn: unknown,
): Promise<Response> => {
  const config = STUDIO_SKILLS[key];
  const existing = await loadParent(ctx, key, id);
  if (!existing) return json(404, { error: "Item not found" });
  const existingChildren = await loadChildren(ctx, key, id);

  const result = normalizeStudioItem(key, itemIn, childrenIn, { defaultStatus: String(existing.status ?? "draft"), id });
  if (!result.ok) return validationFailed(result.errors);

  const ownIds = new Set(existingChildren.map((row) => String(row.id)));
  const foreign: FieldError[] = [];
  result.children.forEach((child, index) => {
    if (child.id && !ownIds.has(String(child.id))) {
      foreign.push({ field: `children[${index}].id`, message: "This row belongs to another item; remove its id to add it as new." });
    }
  });
  if (foreign.length) return validationFailed(foreign);

  const slug = String(result.parent.slug);
  if (slug !== String(existing.slug) && await slugTaken(ctx, key, slug, id)) return slugConflict(slug);

  // Children first: if they fail, the item is untouched and the old children are restored.
  const childError = await syncChildren(ctx, key, id, existingChildren, result.children);
  if (childError) {
    const restored = await restoreChildren(ctx, key, id, existingChildren);
    return json(500, {
      error: restored
        ? "Could not save the child rows; the item was left unchanged."
        : "Could not save the child rows, and restoring the previous rows also failed. Reload and check this item.",
      details: childError,
    });
  }

  const update: JsonRecord = {
    ...result.parent,
    metadata: mergeMetadata(existing.metadata, result.parent.metadata as JsonRecord, config.managedMetadataKeys, result.metadataSource),
    updated_at: new Date().toISOString(),
  };
  if (config.hasCreatedBy) update.updated_by = ctx.userId;
  const saved = await ctx.sb.from(config.table).update(update).eq("id", id).select("id").maybeSingle();
  if (saved.error || !saved.data?.id) {
    const restored = await restoreChildren(ctx, key, id, existingChildren);
    if (isUniqueViolation(saved.error)) return slugConflict(slug);
    return json(500, {
      error: restored
        ? "Could not save the item; nothing was changed."
        : "Could not save the item, and restoring its previous child rows failed. Reload and check this item.",
      details: describeError(saved.error),
    });
  }

  const registry = await upsertRegistry(ctx, key, id, buildRegistryRow(key, result.parent, result.children, id));
  const payload = await loadStudioItem(ctx, key, id);
  if (registry.error) {
    return json(500, {
      error: "The item was saved, but the learner catalog entry could not be updated. Save again to retry.",
      details: registry.error,
      ...payload,
    });
  }
  return json(200, { ok: true, ...payload });
};

const duplicateStudioItem = async (ctx: StudioContext, key: StudioServiceKey, id: string): Promise<Response> => {
  const config = STUDIO_SKILLS[key];
  const existing = await loadParent(ctx, key, id);
  if (!existing) return json(404, { error: "Item not found" });
  const children = await loadChildren(ctx, key, id);
  const baseSlug = toText(existing.slug, 160);

  let query = ctx.sb
    .from(config.table)
    .select("slug")
    .eq("language_id", ctx.scope.languageId)
    .like("slug", `${baseSlug.slice(0, 110)}-copy%`);
  if (config.slugScope === "product_language") query = query.eq("product_id", ctx.productId);
  const { data: taken, error } = await query.limit(1000);
  if (error) return json(500, { error: "Could not check existing copies", details: describeError(error) });

  const editor = rowToStudioPayload(key, existing, children);
  const item = {
    ...editor.item,
    slug: copySlug(baseSlug, (Array.isArray(taken) ? taken as JsonRecord[] : []).map((row) => String(row.slug))),
    title: `${toText(existing.title, 200)} (copy)`,
    status: "draft",
  };
  const childCopies = editor.children.map(({ id: _id, ...child }) => child);
  return await createStudioItem(ctx, key, item, childCopies);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const route = extractRoute(url, routeMarker);
    const isWrite = req.method === "PATCH" || req.method === "POST" || req.method === "PUT";
    const body = isWrite ? await parseBody(req) : {};
    const serviceKey = toText(url.searchParams.get("service_key") ?? body.service_key, 32).toLowerCase() as ServiceKey;

    const requiredPermission =
      isWrite
        ? "admin.products.manage"
        : route === "/content" || route.startsWith("/content/")
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

    if (route === "/content/item" || route === "/content/item/duplicate") {
      if (!isStudioServiceKey(serviceKey)) return json(422, { error: "A valid service_key is required" });
      const productId = studioProductId(products, serviceKey);
      if (!productId) return json(500, { error: `The English ${serviceKey} product is not configured` });
      const ctx: StudioContext = { sb, scope, productId, userId: authz.context.userId };
      const id = toText(url.searchParams.get("id") ?? body.id, 64);

      if (req.method === "GET" && route === "/content/item") {
        if (!id) return json(422, { error: "id is required" });
        const payload = await loadStudioItem(ctx, serviceKey, id);
        return payload ? json(200, payload) : json(404, { error: "Item not found" });
      }
      if (req.method === "POST" && route === "/content/item") {
        return await createStudioItem(ctx, serviceKey, body.item, body.children);
      }
      if (req.method === "PUT" && route === "/content/item") {
        if (!id) return json(422, { error: "id is required" });
        return await updateStudioItem(ctx, serviceKey, id, body.item, body.children);
      }
      if (req.method === "POST" && route === "/content/item/duplicate") {
        if (!id) return json(422, { error: "id is required" });
        return await duplicateStudioItem(ctx, serviceKey, id);
      }
      return json(405, { error: "Method not allowed" });
    }

    if (req.method === "GET" && route === "/content") {
      if (!serviceKey) return json(422, { error: "service_key is required" });

      const config = SERVICE_CONFIGS[serviceKey];
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
      if (!serviceKey) return json(422, { error: "Editable service_key is required" });
      const config = SERVICE_CONFIGS[serviceKey];
      if (!config) return json(404, { error: "Unknown service_key" });
      const id = toText(body.id, 120);
      if (!id) return json(422, { error: "id is required" });
      const patch = isObject(body.patch) ? body.patch : {};
      const update = config.buildUpdate(patch);
      if (Object.keys(update).length === 0) return json(422, { error: "No supported fields were provided in patch" });
      if (isStudioServiceKey(serviceKey) && STUDIO_SKILLS[serviceKey].hasCreatedBy) update.updated_by = authz.context.userId;

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
