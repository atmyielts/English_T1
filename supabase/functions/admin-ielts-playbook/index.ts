import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAdminRequest } from "../_shared/admin-access.ts";
import {
  MODULE_ORDER,
  corsHeaders,
  defaultProfile,
  extractRoute,
  generateRecommendation,
  getEnv,
  isObject,
  json,
  loadPlanTemplates,
  loadProfile,
  loadRules,
  parseBody,
  resolveScope,
  toNullableText,
  toNumber,
  toText,
} from "../_shared/ielts-playbook.ts";

type JsonRecord = Record<string, unknown>;

const routeMarker = "/admin-ielts-playbook";

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const hasPermission = (permissions: string[], permission: string): boolean =>
  permissions.includes("admin.*") || permissions.includes(permission);

const upsertJoinRows = async (
  sb: any,
  table: "ielts_playbook_page_sources" | "ielts_playbook_market_sources",
  foreignKey: "page_id" | "market_guidance_id",
  id: string,
  sourceIds: string[],
) => {
  await sb.from(table).delete().eq(foreignKey, id);
  if (sourceIds.length === 0) return;
  await sb.from(table).insert(
    sourceIds.map((sourceId, index) => ({
      [foreignKey]: id,
      source_id: sourceId,
      sort_order: index + 1,
      is_primary: table === "ielts_playbook_page_sources" ? index === 0 : undefined,
    })),
  );
};

const getSourceCountForPage = async (sb: any, pageId: string): Promise<number> => {
  const { count } = await sb
    .from("ielts_playbook_page_sources")
    .select("*", { count: "exact", head: true })
    .eq("page_id", pageId);
  return count ?? 0;
};

const getSourceCountForMarket = async (sb: any, marketId: string): Promise<number> => {
  const { count } = await sb
    .from("ielts_playbook_market_sources")
    .select("*", { count: "exact", head: true })
    .eq("market_guidance_id", marketId);
  return count ?? 0;
};

const validatePagePublish = async (sb: any, pageId: string | null, payload: JsonRecord, sourceIds?: string[]) => {
  const nextStatus = toText(payload.status, 32).toLowerCase();
  if (nextStatus !== "published") return;

  const pageType = toText(payload.page_type, 32).toLowerCase();
  const visibility = toText(payload.visibility, 32).toLowerCase();
  const moduleKey = toText(payload.module_key, 120).toLowerCase();
  const summary = toText(payload.summary, 4000);
  const publishedAt = toNullableText(payload.published_at, 64);
  const metadata = isObject(payload.metadata) ? payload.metadata : {};
  const verifiedAt = toNullableText(metadata.verified_at, 64);
  const countryScope = Array.isArray(payload.country_scope) ? payload.country_scope.map((entry) => String(entry ?? "").trim()).filter(Boolean) : [];

  const sourceCount = Array.isArray(sourceIds)
    ? sourceIds.length
    : pageId
      ? await getSourceCountForPage(sb, pageId)
      : 0;

  if (pageType === "update") {
    if (!summary) throw new Error("Published updates require a summary");
    if (!publishedAt) throw new Error("Published updates require published_at");
    if (!verifiedAt) throw new Error("Published updates require metadata.verified_at");
    if (countryScope.length === 0 && !toText(metadata.scope, 120)) throw new Error("Published updates require scope or country_scope");
    if (sourceCount === 0) throw new Error("Published updates require at least one linked source");
  }

  if (visibility === "premium" && ["guide", "result_strategy", "study_plan"].includes(pageType)) {
    const { data } = await sb
      .from("ielts_playbook_pages")
      .select("id")
      .eq("module_key", moduleKey)
      .eq("status", "published")
      .eq("visibility", "public")
      .limit(1)
      .maybeSingle();
    if (!data) throw new Error("Published premium deep guides require a public overview or teaser sibling in the same module");
  }
};

const validateMarketPublish = async (sb: any, marketId: string | null, payload: JsonRecord, sourceIds?: string[]) => {
  const nextStatus = toText(payload.status, 32).toLowerCase();
  if (nextStatus !== "published") return;

  const summary = toText(payload.summary, 4000);
  const publishedAt = toNullableText(payload.published_at, 64);
  const verifiedAt = toNullableText(payload.verified_at, 64);
  const countryCode = toText(payload.country_code, 16);
  const providerKey = toText(payload.provider_key, 64);
  const sourceCount = Array.isArray(sourceIds)
    ? sourceIds.length
    : marketId
      ? await getSourceCountForMarket(sb, marketId)
      : 0;

  if (!summary) throw new Error("Published market guidance requires a summary");
  if (!publishedAt) throw new Error("Published market guidance requires published_at");
  if (!verifiedAt) throw new Error("Published market guidance requires verified_at");
  if (!countryCode || !providerKey) throw new Error("Published market guidance requires country_code and provider_key");
  if (sourceCount === 0) throw new Error("Published market guidance requires at least one linked source");
};

const listRows = async (sb: any, table: string, filters: Record<string, string | number | null | undefined>, orderBy = "updated_at") => {
  let query = sb.from(table).select("*").order(orderBy, { ascending: false }).limit(500);
  for (const [key, value] of Object.entries(filters)) {
    if (value == null || value === "") continue;
    query = query.eq(key, value);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Failed to list ${table}`);
  return data ?? [];
};

const createPage = async (sb: any, body: JsonRecord, adminUserId: string, productId: string) => {
  const sourceIds = Array.isArray(body.source_ids) ? body.source_ids.map((entry) => String(entry ?? "")).filter(Boolean) : [];
  await validatePagePublish(sb, null, body, sourceIds);

  const row = {
    product_id: productId,
    parent_page_id: toNullableText(body.parent_page_id, 80),
    page_type: toText(body.page_type, 32) || "module",
    module_key: toNullableText(body.module_key, 120),
    slug: toText(body.slug, 160),
    title: toText(body.title, 240),
    summary: toText(body.summary, 4000),
    status: toText(body.status, 32) || "draft",
    visibility: toText(body.visibility, 32) || "public",
    locale_code: toText(body.locale_code, 12) || "en",
    country_scope: Array.isArray(body.country_scope) ? body.country_scope.map((entry) => String(entry ?? "")).filter(Boolean) : [],
    variant_scope: isObject(body.variant_scope) ? body.variant_scope : {},
    sort_order: Math.floor(toNumber(body.sort_order) ?? 0),
    seo_title: toNullableText(body.seo_title, 240),
    seo_description: toNullableText(body.seo_description, 400),
    seo_keywords: Array.isArray(body.seo_keywords) ? body.seo_keywords.map((entry) => String(entry ?? "")).filter(Boolean) : [],
    published_at: toNullableText(body.published_at, 64),
    metadata: isObject(body.metadata) ? body.metadata : {},
    created_by: adminUserId,
    updated_by: adminUserId,
  };

  const { data, error } = await sb.from("ielts_playbook_pages").insert(row).select("*").maybeSingle();
  if (error || !data) throw new Error("Failed to create page");
  await upsertJoinRows(sb, "ielts_playbook_page_sources", "page_id", String((data as any).id), sourceIds);
  return data;
};

const patchPage = async (sb: any, body: JsonRecord, adminUserId: string) => {
  const id = toText(body.id, 80);
  if (!id) throw new Error("Page id is required");
  const sourceIds = Array.isArray(body.source_ids) ? body.source_ids.map((entry) => String(entry ?? "")).filter(Boolean) : undefined;
  const patch = isObject(body.patch) ? body.patch : {};
  await validatePagePublish(sb, id, patch, sourceIds);

  const update: JsonRecord = { updated_by: adminUserId };
  const assignText = (key: string, maxLen: number) => {
    if (key in patch) update[key] = key.includes("seo_") ? toNullableText(patch[key], maxLen) : toText(patch[key], maxLen);
  };

  for (const [key, maxLen] of [["parent_page_id", 80], ["page_type", 32], ["module_key", 120], ["slug", 160], ["title", 240], ["summary", 4000], ["status", 32], ["visibility", 32], ["locale_code", 12], ["seo_title", 240], ["seo_description", 400], ["published_at", 64]] as Array<[string, number]>) {
    if (key in patch) assignText(key, maxLen);
  }
  if ("country_scope" in patch && Array.isArray(patch.country_scope)) update.country_scope = patch.country_scope.map((entry) => String(entry ?? "")).filter(Boolean);
  if ("variant_scope" in patch && isObject(patch.variant_scope)) update.variant_scope = patch.variant_scope;
  if ("sort_order" in patch) update.sort_order = Math.floor(toNumber(patch.sort_order) ?? 0);
  if ("seo_keywords" in patch && Array.isArray(patch.seo_keywords)) update.seo_keywords = patch.seo_keywords.map((entry) => String(entry ?? "")).filter(Boolean);
  if ("metadata" in patch && isObject(patch.metadata)) update.metadata = patch.metadata;

  const { data, error } = await sb.from("ielts_playbook_pages").update(update).eq("id", id).select("*").maybeSingle();
  if (error || !data) throw new Error("Failed to update page");
  if (sourceIds) await upsertJoinRows(sb, "ielts_playbook_page_sources", "page_id", id, sourceIds);
  return data;
};

const upsertSimpleRow = async (
  sb: any,
  table: string,
  body: JsonRecord,
  adminUserId: string,
  mode: "create" | "patch",
) => {
  const patch = mode === "patch" && isObject(body.patch) ? body.patch : body;
  const id = mode === "patch" ? toText(body.id, 80) : "";
  if (mode === "patch" && !id) throw new Error("Row id is required");
  const row: JsonRecord = mode === "patch" ? { updated_by: adminUserId } : { created_by: adminUserId, updated_by: adminUserId };

  for (const [key, maxLen] of [["title", 240], ["source_type", 32], ["provider_key", 80], ["url", 800], ["summary", 4000], ["status", 32], ["published_at", 64], ["verified_at", 64], ["last_checked_at", 64], ["country_code", 16], ["result_timing_note", 400], ["booking_url", 800], ["slug", 160], ["plan_type", 40], ["focus_skill", 40], ["intensity", 40], ["rule_key", 120], ["rule_name", 240], ["description", 2000]] as Array<[string, number]>) {
    if (key in patch) row[key] = key.endsWith("_at") || key === "url" || key === "booking_url" || key === "focus_skill" || key === "provider_key" || key === "country_code"
      ? toNullableText(patch[key], maxLen)
      : toText(patch[key], maxLen);
  }

  if ("sort_order" in patch) row.sort_order = Math.floor(toNumber(patch.sort_order) ?? 0);
  if ("duration_days" in patch) row.duration_days = Math.max(1, Math.floor(toNumber(patch.duration_days) ?? 1));
  if ("band_min" in patch) row.band_min = clamp(toNumber(patch.band_min) ?? 0, 0, 9);
  if ("band_max" in patch) row.band_max = clamp(toNumber(patch.band_max) ?? 9, 0, 9);
  if ("product_id" in patch) row.product_id = toNullableText(patch.product_id, 80);
  if ("page_id" in patch) row.page_id = toNullableText(patch.page_id, 80);
  if ("block_type" in patch) row.block_type = toText(patch.block_type, 40);
  if ("heading" in patch) row.heading = toNullableText(patch.heading, 240);
  if ("ukvi_available" in patch) row.ukvi_available = Boolean(patch.ukvi_available);
  if ("computer_available" in patch) row.computer_available = Boolean(patch.computer_available);
  if ("writing_on_paper_available" in patch) row.writing_on_paper_available = Boolean(patch.writing_on_paper_available);
  if ("one_skill_retake_available" in patch) row.one_skill_retake_available = Boolean(patch.one_skill_retake_available);
  if ("content" in patch && isObject(patch.content)) row.content = patch.content;
  if ("schedule_json" in patch && isObject(patch.schedule_json)) row.schedule_json = patch.schedule_json;
  if ("config" in patch && isObject(patch.config)) row.config = patch.config;
  if ("metadata" in patch && isObject(patch.metadata)) row.metadata = patch.metadata;

  if (mode === "create") {
    const { data, error } = await sb.from(table).insert(row).select("*").maybeSingle();
    if (error || !data) throw new Error(`Failed to create ${table}`);
    return data;
  }

  const { data, error } = await sb.from(table).update(row).eq("id", id).select("*").maybeSingle();
  if (error || !data) throw new Error(`Failed to update ${table}`);
  return data;
};

const getQaReport = async (sb: any, productId: string) => {
  const [pages, pageSourceLinks, sources, markets] = await Promise.all([
    sb.from("ielts_playbook_pages").select("id,slug,title,status,visibility,seo_title,seo_description,module_key,published_at").eq("product_id", productId),
    sb.from("ielts_playbook_page_sources").select("page_id"),
    sb.from("ielts_playbook_sources").select("id,title,url,status,verified_at,metadata"),
    sb.from("ielts_playbook_market_guidance").select("id,country_code,provider_key,status,verified_at,published_at,summary").eq("product_id", productId),
  ]);

  const publishedPages = (pages.data ?? []).filter((row: any) => row.status === "published");
  const citedPageIds = new Set((pageSourceLinks.data ?? []).map((row: any) => String(row.page_id)));
  const pagesMissingCitations = publishedPages.filter((row: any) => !citedPageIds.has(String(row.id)));
  const pagesMissingSeo = publishedPages.filter((row: any) => !row.seo_title || !row.seo_description);
  const brokenSources = (sources.data ?? []).filter((row: any) => row.status === "published" && (!row.url || row.metadata?.broken === true));
  const staleMarkets = (markets.data ?? []).filter((row: any) => {
    if (row.status !== "published" || !row.verified_at) return false;
    return Date.now() - Date.parse(String(row.verified_at)) > 45 * 24 * 60 * 60 * 1000;
  });
  const publishedModuleSet = new Set(publishedPages.filter((row: any) => row.visibility === "public").map((row: any) => String(row.module_key ?? "")));
  const unpublishedModuleGaps = MODULE_ORDER.filter((moduleKey) => !publishedModuleSet.has(moduleKey));

  return {
    stale_markets: staleMarkets,
    pages_missing_citations: pagesMissingCitations,
    broken_source_links: brokenSources,
    missing_seo_metadata: pagesMissingSeo,
    unpublished_module_gaps: unpublishedModuleGaps,
  };
};

const getAnalytics = async (sb: any, productId: string, days: number) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from("ielts_playbook_events")
    .select("event_name,module_key,page_type,market_country_code,occurred_at")
    .eq("product_id", productId)
    .gte("occurred_at", since)
    .limit(10000);
  if (error) throw new Error("Failed to load analytics");

  const rows = Array.isArray(data) ? data : [];
  const totals = new Map<string, number>();
  const byModule = new Map<string, number>();
  const byPageType = new Map<string, number>();
  const byMarket = new Map<string, number>();

  for (const row of rows) {
    const eventName = String((row as any).event_name ?? "unknown");
    totals.set(eventName, (totals.get(eventName) ?? 0) + 1);
    const moduleKey = String((row as any).module_key ?? "");
    if (moduleKey) byModule.set(moduleKey, (byModule.get(moduleKey) ?? 0) + 1);
    const pageType = String((row as any).page_type ?? "");
    if (pageType) byPageType.set(pageType, (byPageType.get(pageType) ?? 0) + 1);
    const market = String((row as any).market_country_code ?? "");
    if (market) byMarket.set(market, (byMarket.get(market) ?? 0) + 1);
  }

  return {
    window_days: days,
    since,
    totals: Object.fromEntries(totals),
    by_module: Array.from(byModule.entries()).map(([key, value]) => ({ module_key: key, events: value })).sort((a, b) => b.events - a.events),
    by_page_type: Array.from(byPageType.entries()).map(([key, value]) => ({ page_type: key, events: value })).sort((a, b) => b.events - a.events),
    by_market: Array.from(byMarket.entries()).map(([key, value]) => ({ market_country_code: key, events: value })).sort((a, b) => b.events - a.events),
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceRole = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, supabaseServiceRole, { auth: { persistSession: false } });

    const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
      action: "admin.ielts_playbook",
    });
    if (!authz.ok) return authz.response;

    const scope = await resolveScope(sb);
    const url = new URL(req.url);
    const route = extractRoute(url, routeMarker);
    const requirePermission = (permission: string) => {
      if (!hasPermission(authz.context.permissions, permission)) {
        throw new Error("Forbidden");
      }
    };

    if (req.method === "GET" && route === "/pages") {
      requirePermission("admin.products.manage");
      return json(200, { pages: await listRows(sb, "ielts_playbook_pages", { product_id: scope.playbookProductId, status: url.searchParams.get("status") ?? undefined, visibility: url.searchParams.get("visibility") ?? undefined, page_type: url.searchParams.get("page_type") ?? undefined }) });
    }
    if (req.method === "POST" && route === "/pages") {
      const body = await parseBody(req);
      requirePermission(body.page_type === "update" && body.status === "published" ? "admin.announcements.manage" : "admin.products.manage");
      return json(200, { page: await createPage(sb, body, authz.context.userId, scope.playbookProductId) });
    }
    if (req.method === "PATCH" && route === "/pages") {
      const body = await parseBody(req);
      const patch = isObject(body.patch) ? body.patch : {};
      requirePermission(patch.page_type === "update" || patch.status === "published" ? "admin.announcements.manage" : "admin.products.manage");
      return json(200, { page: await patchPage(sb, body, authz.context.userId) });
    }

    if (req.method === "GET" && route === "/sections") {
      requirePermission("admin.products.manage");
      return json(200, { sections: await listRows(sb, "ielts_playbook_page_sections", { page_id: url.searchParams.get("page_id") ?? undefined, status: url.searchParams.get("status") ?? undefined }) });
    }
    if (req.method === "POST" && route === "/sections") {
      requirePermission("admin.products.manage");
      return json(200, { section: await upsertSimpleRow(sb, "ielts_playbook_page_sections", await parseBody(req), authz.context.userId, "create") });
    }
    if (req.method === "PATCH" && route === "/sections") {
      requirePermission("admin.products.manage");
      return json(200, { section: await upsertSimpleRow(sb, "ielts_playbook_page_sections", await parseBody(req), authz.context.userId, "patch") });
    }

    if (req.method === "GET" && route === "/sources") {
      requirePermission("admin.products.manage");
      return json(200, { sources: await listRows(sb, "ielts_playbook_sources", { status: url.searchParams.get("status") ?? undefined }) });
    }
    if (req.method === "POST" && route === "/sources") {
      requirePermission("admin.products.manage");
      return json(200, { source: await upsertSimpleRow(sb, "ielts_playbook_sources", await parseBody(req), authz.context.userId, "create") });
    }
    if (req.method === "PATCH" && route === "/sources") {
      requirePermission("admin.products.manage");
      return json(200, { source: await upsertSimpleRow(sb, "ielts_playbook_sources", await parseBody(req), authz.context.userId, "patch") });
    }

    if (req.method === "GET" && route === "/markets") {
      requirePermission("admin.products.manage");
      return json(200, { markets: await listRows(sb, "ielts_playbook_market_guidance", { product_id: scope.playbookProductId, status: url.searchParams.get("status") ?? undefined, country_code: url.searchParams.get("country_code") ?? undefined, provider_key: url.searchParams.get("provider_key") ?? undefined }) });
    }
    if (req.method === "POST" && route === "/markets") {
      requirePermission("admin.announcements.manage");
      const body = await parseBody(req);
      const sourceIds = Array.isArray(body.source_ids) ? body.source_ids.map((entry) => String(entry ?? "")).filter(Boolean) : [];
      await validateMarketPublish(sb, null, body, sourceIds);
      const market = await upsertSimpleRow(sb, "ielts_playbook_market_guidance", { ...body, product_id: scope.playbookProductId }, authz.context.userId, "create");
      await upsertJoinRows(sb, "ielts_playbook_market_sources", "market_guidance_id", String((market as any).id), sourceIds);
      return json(200, { market });
    }
    if (req.method === "PATCH" && route === "/markets") {
      requirePermission("admin.announcements.manage");
      const body = await parseBody(req);
      const sourceIds = Array.isArray(body.source_ids) ? body.source_ids.map((entry) => String(entry ?? "")).filter(Boolean) : undefined;
      const patch = isObject(body.patch) ? body.patch : {};
      await validateMarketPublish(sb, toText(body.id, 80), patch, sourceIds);
      const market = await upsertSimpleRow(sb, "ielts_playbook_market_guidance", body, authz.context.userId, "patch");
      if (sourceIds) await upsertJoinRows(sb, "ielts_playbook_market_sources", "market_guidance_id", toText(body.id, 80), sourceIds);
      return json(200, { market });
    }

    if (req.method === "GET" && route === "/plan-templates") {
      requirePermission("admin.products.manage");
      return json(200, { plan_templates: await listRows(sb, "ielts_playbook_plan_templates", { product_id: scope.playbookProductId, status: url.searchParams.get("status") ?? undefined }) });
    }
    if (req.method === "POST" && route === "/plan-templates") {
      requirePermission("admin.products.manage");
      return json(200, { plan_template: await upsertSimpleRow(sb, "ielts_playbook_plan_templates", { ...(await parseBody(req)), product_id: scope.playbookProductId }, authz.context.userId, "create") });
    }
    if (req.method === "PATCH" && route === "/plan-templates") {
      requirePermission("admin.products.manage");
      return json(200, { plan_template: await upsertSimpleRow(sb, "ielts_playbook_plan_templates", await parseBody(req), authz.context.userId, "patch") });
    }

    if (req.method === "GET" && route === "/rules") {
      requirePermission("admin.products.manage");
      const rules = await loadRules(sb, scope);
      return json(200, { rules: Array.from(rules.entries()).map(([rule_key, config]) => ({ rule_key, config })) });
    }
    if (req.method === "PATCH" && route === "/rules") {
      requirePermission("admin.products.manage");
      const body = await parseBody(req);
      const rules = Array.isArray(body.rules) ? body.rules : [];
      const rows = rules.filter(isObject).map((row) => ({
        product_id: scope.playbookProductId,
        rule_key: toText(row.rule_key, 120),
        rule_name: toText(row.rule_name, 240) || toText(row.rule_key, 120),
        description: toNullableText(row.description, 2000),
        status: toText(row.status, 32) || "active",
        sort_order: Math.floor(toNumber(row.sort_order) ?? 0),
        config: isObject(row.config) ? row.config : {},
        metadata: isObject(row.metadata) ? row.metadata : {},
        updated_by: authz.context.userId,
      }));
      const { data, error } = await sb.from("ielts_playbook_rule_sets").upsert(rows, { onConflict: "product_id,rule_key" }).select("*");
      if (error) throw new Error("Failed to update rules");
      return json(200, { ok: true, rules: data ?? [] });
    }

    if (req.method === "POST" && route === "/preview") {
      requirePermission("admin.products.manage");
      const body = await parseBody(req);
      const userId = toText(body.user_id, 80);
      if (!userId) throw new Error("user_id is required for preview");
      const existing = await loadProfile(sb, scope, userId);
      const previewProfile = {
        ...(existing.user_id ? existing : defaultProfile(scope, userId)),
        ...(isObject(body.profile) ? body.profile : {}),
      };
      const recommendation = await generateRecommendation(sb, scope, userId, previewProfile as any);
      return json(200, { recommendation });
    }

    if (req.method === "GET" && route === "/qa") {
      requirePermission("admin.products.manage");
      return json(200, await getQaReport(sb, scope.playbookProductId));
    }

    if (req.method === "GET" && route === "/analytics") {
      requirePermission("admin.analytics.view");
      const days = clamp(Math.floor(toNumber(url.searchParams.get("days")) ?? 30), 1, 365);
      return json(200, await getAnalytics(sb, scope.playbookProductId, days));
    }

    return json(404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Forbidden" ? 403 : message === "Unauthorized" ? 401 : 500;
    return json(status, { error: message });
  }
});
