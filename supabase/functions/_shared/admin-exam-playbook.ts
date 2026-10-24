// Admin authoring for the SAT and TOEFL playbooks (one function, `?exam=sat|toefl`).
// Modelled on admin-ielts-playbook: pages, sections, sources, plan templates,
// publish/unpublish, preview (drafts included), QA coverage and analytics.
// Authorisation uses the shared admin-access helper (MFA/session policy, rate
// limit, audit log) plus the same permission keys as the IELTS console.

import { contractSlugs } from "./exam-playbook-diagnostic.ts";
import {
  type ExamPlaybookConfig,
  type JsonRecord,
  PlaybookError,
  corsHeaders,
  extractRoute,
  isObject,
  isSlug,
  isUuid,
  json,
  loadPageDetail,
  parseBody,
  toNullableText,
  toNumber,
  toText,
} from "./exam-playbook.ts";
import { normalizeTemplateWeeks } from "./exam-playbook-plan.ts";
import { SAT_PLAYBOOK_CONFIG } from "./sat-playbook.ts";
import { TOEFL_PLAYBOOK_CONFIG } from "./toefl-playbook.ts";

export const ADMIN_ROUTE_MARKER = "/admin-exam-playbook";

export const EXAM_CONFIGS: Record<"sat" | "toefl", ExamPlaybookConfig> = {
  sat: SAT_PLAYBOOK_CONFIG,
  toefl: TOEFL_PLAYBOOK_CONFIG,
};

export const PAGE_TYPES = ["module", "guide", "study_plan", "resource", "myth", "update", "test_day", "result_strategy", "faq"];
export const STATUSES = ["draft", "review", "published", "archived"];
export const VISIBILITIES = ["public", "authenticated", "premium"];
export const SOURCE_TYPES = ["official_url", "provider_url", "news", "internal_note"];
export const PLAN_TYPES = ["crash", "balanced", "improvement", "skill_recovery"];

export type AdminContext = { userId: string; permissions: string[]; role?: string };
export type AdminAuthorize = (req: Request, exam: "sat" | "toefl") => Promise<{ ok: true; context: AdminContext } | { ok: false; response: Response }>;

export type AdminDeps = {
  db: any;
  authorize: AdminAuthorize;
  now: () => Date;
  log: (level: "info" | "warn" | "error", event: string, detail: JsonRecord) => void;
};

export const hasPermission = (context: AdminContext, permission: string) =>
  context.permissions.includes("admin.*") || context.permissions.includes(permission);

const must = <T>(result: { data: T; error: unknown }, what: string): T => {
  if (result.error) {
    const err = result.error as JsonRecord;
    const code = String(err?.code ?? "");
    if (code === "23505") throw new PlaybookError(409, "duplicate", "Another row already uses this slug or URL.");
    if (code === "23514" || code === "22P02" || code === "23502") throw new PlaybookError(400, "invalid_field", "A field has an unsupported value.");
    if (code === "23503") throw new PlaybookError(400, "invalid_reference", "A referenced row does not exist.");
    throw new Error(`${what}: ${String(err?.message ?? err)}`);
  }
  return result.data;
};

const list = (value: unknown): JsonRecord[] => (Array.isArray(value) ? value.filter(isObject) : []);

const enumField = (value: unknown, allowed: string[], field: string, fallback?: string): string => {
  const text = toText(value, 64);
  if (!text && fallback) return fallback;
  if (!allowed.includes(text)) throw new PlaybookError(400, "invalid_field", `${field} must be one of: ${allowed.join(", ")}.`, { field });
  return text;
};

const stringArray = (value: unknown, max = 40, maxLen = 120): string[] =>
  Array.isArray(value) ? value.map((v) => toText(v, maxLen)).filter(Boolean).slice(0, max) : [];

const uuidArray = (value: unknown, field: string): string[] => {
  const ids = stringArray(value, 50, 60);
  for (const id of ids) if (!isUuid(id)) throw new PlaybookError(400, "invalid_field", `${field} must contain ids.`, { field });
  return ids;
};

// --- Pages --------------------------------------------------------------------

const pageFields = (cfg: ExamPlaybookConfig, input: JsonRecord, partial: boolean): JsonRecord => {
  const row: JsonRecord = {};
  const set = (key: string, fn: () => unknown) => {
    if (!partial || key in input) row[key] = fn();
  };
  set("slug", () => {
    const slug = toText(input.slug, 160).toLowerCase();
    if (!isSlug(slug)) throw new PlaybookError(400, "invalid_field", "slug must be lowercase words joined by hyphens.", { field: "slug" });
    return slug;
  });
  set("title", () => {
    const title = toText(input.title, 240);
    if (!title) throw new PlaybookError(400, "invalid_field", "title is required.", { field: "title" });
    return title;
  });
  set("summary", () => toText(input.summary, 4000));
  set("page_type", () => enumField(input.page_type, PAGE_TYPES, "page_type", "module"));
  set("visibility", () => enumField(input.visibility, VISIBILITIES, "visibility", "public"));
  set("status", () => enumField(input.status, STATUSES, "status", "draft"));
  set("module_key", () => toNullableText(input.module_key, 120));
  set("parent_page_id", () => {
    const id = toNullableText(input.parent_page_id, 60);
    if (id && !isUuid(id)) throw new PlaybookError(400, "invalid_field", "parent_page_id must be an id.", { field: "parent_page_id" });
    return id;
  });
  set("sort_order", () => Math.floor(toNumber(input.sort_order) ?? 0));
  set("seo_title", () => toNullableText(input.seo_title, 240));
  set("seo_description", () => toNullableText(input.seo_description, 400));
  set("seo_keywords", () => stringArray(input.seo_keywords, 30, 80));
  set("country_scope", () => stringArray(input.country_scope, 60, 16));
  set("metadata", () => (isObject(input.metadata) ? input.metadata : {}));
  if (!partial) {
    row.product_id = cfg.playbookProductId;
    row.locale_code = "en";
  }
  return row;
};

const replaceSourceLinks = async (cfg: ExamPlaybookConfig, db: any, pageId: string, sourceIds: string[]) => {
  must(await db.from(cfg.tables.pageSources).delete().eq("page_id", pageId), "clear page sources");
  if (sourceIds.length === 0) return;
  must(await db.from(cfg.tables.pageSources).insert(sourceIds.map((sourceId, index) => ({
    page_id: pageId,
    source_id: sourceId,
    sort_order: index + 1,
    is_primary: index === 0,
  }))), "link page sources");
};

const publishStamp = (row: JsonRecord, now: Date) => {
  if (row.status === "published" && !row.published_at) row.published_at = now.toISOString();
};

// --- Sections, sources, templates ----------------------------------------------

const sectionFields = (cfg: ExamPlaybookConfig, input: JsonRecord, partial: boolean): JsonRecord => {
  const row: JsonRecord = {};
  const set = (key: string, fn: () => unknown) => {
    if (!partial || key in input) row[key] = fn();
  };
  if (!partial) {
    const pageId = toText(input.page_id, 60);
    if (!isUuid(pageId)) throw new PlaybookError(400, "invalid_field", "page_id is required.", { field: "page_id" });
    row.page_id = pageId;
  }
  set("block_type", () => enumField(input.block_type, cfg.blockTypes, "block_type", "rich_text"));
  set("heading", () => toNullableText(input.heading, 240));
  set("status", () => enumField(input.status, STATUSES, "status", "draft"));
  set("sort_order", () => Math.floor(toNumber(input.sort_order) ?? 0));
  set("content", () => {
    if (!isObject(input.content)) throw new PlaybookError(400, "invalid_field", "content must be a JSON object.", { field: "content" });
    if (JSON.stringify(input.content).length > 200000) throw new PlaybookError(413, "too_large", "Section content is too large.");
    return input.content;
  });
  set("metadata", () => (isObject(input.metadata) ? input.metadata : {}));
  return row;
};

const sourceFields = (input: JsonRecord, partial: boolean): JsonRecord => {
  const row: JsonRecord = {};
  const set = (key: string, fn: () => unknown) => {
    if (!partial || key in input) row[key] = fn();
  };
  set("title", () => {
    const title = toText(input.title, 240);
    if (!title) throw new PlaybookError(400, "invalid_field", "title is required.", { field: "title" });
    return title;
  });
  set("source_type", () => enumField(input.source_type, SOURCE_TYPES, "source_type", "official_url"));
  set("provider_key", () => toNullableText(input.provider_key, 80));
  set("url", () => {
    const url = toNullableText(input.url, 800);
    if (url && !/^https:\/\//i.test(url)) throw new PlaybookError(400, "invalid_field", "url must start with https://", { field: "url" });
    return url;
  });
  set("summary", () => toText(input.summary, 4000));
  set("status", () => enumField(input.status, STATUSES, "status", "draft"));
  set("verified_at", () => toNullableText(input.verified_at, 64));
  set("metadata", () => (isObject(input.metadata) ? input.metadata : {}));
  return row;
};

const templateFields = (cfg: ExamPlaybookConfig, input: JsonRecord, partial: boolean): JsonRecord => {
  const row: JsonRecord = {};
  const set = (key: string, fn: () => unknown) => {
    if (!partial || key in input) row[key] = fn();
  };
  const scoreBounds = cfg.exam === "sat" ? [400, 1600] : [0, 120];
  set("slug", () => {
    const slug = toText(input.slug, 160).toLowerCase();
    if (!isSlug(slug)) throw new PlaybookError(400, "invalid_field", "slug must be lowercase words joined by hyphens.", { field: "slug" });
    return slug;
  });
  set("title", () => {
    const title = toText(input.title, 240);
    if (!title) throw new PlaybookError(400, "invalid_field", "title is required.", { field: "title" });
    return title;
  });
  set("summary", () => toText(input.summary, 4000));
  set("plan_type", () => enumField(input.plan_type, PLAN_TYPES, "plan_type", "balanced"));
  set("duration_days", () => {
    const days = Math.floor(toNumber(input.duration_days) ?? 0);
    if (days < 1 || days > 400) throw new PlaybookError(400, "invalid_field", "duration_days must be between 1 and 400.", { field: "duration_days" });
    return days;
  });
  set("score_min", () => Math.max(scoreBounds[0], Math.min(scoreBounds[1], Math.floor(toNumber(input.score_min) ?? scoreBounds[0]))));
  set("score_max", () => Math.max(scoreBounds[0], Math.min(scoreBounds[1], Math.floor(toNumber(input.score_max) ?? scoreBounds[1]))));
  set("focus_section", () => {
    const value = toNullableText(input.focus_section, 40);
    if (value && !cfg.focusSections.includes(value)) throw new PlaybookError(400, "invalid_field", `focus_section must be one of: ${cfg.focusSections.join(", ")}.`, { field: "focus_section" });
    return value;
  });
  set("intensity", () => toText(input.intensity, 40) || "moderate");
  set("status", () => enumField(input.status, STATUSES, "status", "draft"));
  set("schedule_json", () => {
    if (!isObject(input.schedule_json)) throw new PlaybookError(400, "invalid_field", "schedule_json must be a JSON object.", { field: "schedule_json" });
    return input.schedule_json;
  });
  set("metadata", () => (isObject(input.metadata) ? input.metadata : {}));
  if (!partial) row.product_id = cfg.playbookProductId;
  return row;
};

// --- QA + analytics -----------------------------------------------------------------

export const buildQaReport = async (cfg: ExamPlaybookConfig, db: any) => {
  const [pagesResult, sectionsResult, linksResult, templatesResult] = await Promise.all([
    db.from(cfg.tables.pages).select("id, slug, title, status, visibility, page_type, seo_title, seo_description").eq("product_id", cfg.playbookProductId),
    db.from(cfg.tables.sections).select("id, page_id, status"),
    db.from(cfg.tables.pageSources).select("page_id"),
    db.from(cfg.tables.planTemplates).select("id, slug, title, status, duration_days, schedule_json").eq("product_id", cfg.playbookProductId),
  ]);
  const pages = list(must(pagesResult, "qa pages"));
  const sections = list(must(sectionsResult, "qa sections"));
  const links = list(must(linksResult, "qa links"));
  const templates = list(must(templatesResult, "qa templates"));
  const expected = contractSlugs(cfg.exam);
  const coverage = (slugs: string[], rowsList: JsonRecord[]) =>
    slugs.map((slug) => {
      const row = rowsList.find((r) => r.slug === slug);
      return { slug, status: row ? String(row.status) : "missing", id: row?.id ?? null };
    });
  const published = pages.filter((p) => p.status === "published");
  const cited = new Set(links.map((l) => String(l.page_id)));
  const publishedSections = (pageId: unknown) => sections.filter((s) => String(s.page_id) === String(pageId) && s.status === "published").length;
  return {
    modules: coverage(expected.modules, pages),
    guides: coverage(expected.guides, pages),
    plan_templates: coverage(expected.templates, templates).map((entry) => {
      const template = templates.find((t) => t.slug === entry.slug);
      return { ...entry, weeks: template ? normalizeTemplateWeeks(template.schedule_json, Number(template.duration_days ?? 0)).length : 0 };
    }),
    pages_missing_citations: published.filter((p) => !cited.has(String(p.id))).map((p) => ({ id: p.id, slug: p.slug })),
    pages_missing_seo: published.filter((p) => !p.seo_title || !p.seo_description).map((p) => ({ id: p.id, slug: p.slug })),
    published_pages_without_sections: published.filter((p) => publishedSections(p.id) === 0).map((p) => ({ id: p.id, slug: p.slug })),
    unexpected_slugs: pages.filter((p) => ![...expected.modules, ...expected.guides].includes(String(p.slug))).map((p) => ({ id: p.id, slug: p.slug, status: p.status })),
  };
};

export const buildAnalytics = async (cfg: ExamPlaybookConfig, db: any, days: number, now: Date) => {
  const since = new Date(now.getTime() - days * 86400000).toISOString();
  const result = await db
    .from(cfg.tables.events)
    .select("event_name, module_key, page_id, page_type, user_id, occurred_at")
    .eq("product_id", cfg.playbookProductId)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(20000);
  const events = list(must(result, "load events"));
  const totals: Record<string, number> = {};
  const byPage = new Map<string, number>();
  const users = new Set<string>();
  let anonymous = 0;
  for (const e of events) {
    const name = String(e.event_name ?? "unknown");
    totals[name] = (totals[name] ?? 0) + 1;
    if (e.page_id) byPage.set(String(e.page_id), (byPage.get(String(e.page_id)) ?? 0) + 1);
    if (e.user_id) users.add(String(e.user_id));
    else anonymous += 1;
  }
  const topPageIds = [...byPage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  const pageRows = topPageIds.length
    ? list(must(await db.from(cfg.tables.pages).select("id, slug, title").in("id", topPageIds.map(([id]) => id)), "load analytic pages"))
    : [];
  return {
    window_days: days,
    since,
    total_events: events.length,
    truncated: events.length >= 20000,
    signed_in_learners: users.size,
    anonymous_events: anonymous,
    totals,
    top_pages: topPageIds.map(([id, count]) => {
      const page = pageRows.find((p) => String(p.id) === id);
      return { page_id: id, slug: page?.slug ?? null, title: page?.title ?? null, events: count };
    }),
    funnel: {
      page_view: totals.page_view ?? 0,
      upgrade_click: totals.upgrade_click ?? 0,
      onboarding_completed: totals.onboarding_completed ?? 0,
      diagnostic_run: totals.diagnostic_run ?? 0,
      plan_adopted: totals.plan_adopted ?? 0,
    },
  };
};

// --- Handler --------------------------------------------------------------------------

export const createAdminExamPlaybookHandler = (makeDeps: () => AdminDeps) =>
  async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    const url = new URL(req.url);
    const route = extractRoute(url, ADMIN_ROUTE_MARKER);
    let deps: AdminDeps | null = null;
    try {
      deps = makeDeps();
      const examParam = toText(url.searchParams.get("exam"), 10).toLowerCase();
      if (examParam !== "sat" && examParam !== "toefl") throw new PlaybookError(400, "invalid_exam", "exam must be sat or toefl.");
      const cfg = EXAM_CONFIGS[examParam];
      const authz = await deps.authorize(req, examParam);
      if (!authz.ok) return authz.response;
      const context = authz.context;
      const need = (permission: string) => {
        if (!hasPermission(context, permission)) throw new PlaybookError(403, "forbidden", "You do not have permission for this action.");
      };
      const db = deps.db;
      const now = deps.now();
      const method = req.method;
      const t = cfg.tables;
      const by = (row: JsonRecord, create: boolean) => ({ ...row, updated_by: context.userId, ...(create ? { created_by: context.userId } : {}) });

      if (method === "GET" && route === "/overview") {
        need("admin.products.manage");
        return json(200, { exam: cfg.exam, block_types: cfg.blockTypes, focus_sections: cfg.focusSections, page_types: PAGE_TYPES, statuses: STATUSES, visibilities: VISIBILITIES, source_types: SOURCE_TYPES, plan_types: PLAN_TYPES, contract: contractSlugs(cfg.exam), qa: await buildQaReport(cfg, db) });
      }

      // Pages
      if (method === "GET" && route === "/pages") {
        need("admin.products.manage");
        let q = db.from(t.pages).select("id, parent_page_id, slug, title, summary, page_type, module_key, status, visibility, sort_order, published_at, updated_at, seo_title, seo_description").eq("product_id", cfg.playbookProductId);
        for (const key of ["status", "visibility", "page_type"]) {
          const value = toText(url.searchParams.get(key), 40);
          if (value) q = q.eq(key, value);
        }
        return json(200, { pages: list(must(await q.order("sort_order", { ascending: true }).limit(500), "list pages")) });
      }
      let m = route.match(/^\/pages\/([^/]+)$/);
      if (method === "GET" && m) {
        need("admin.products.manage");
        const id = decodeURIComponent(m[1]);
        if (!isUuid(id)) throw new PlaybookError(404, "not_found", "Page not found.");
        const page = must(await db.from(t.pages).select("*").eq("id", id).eq("product_id", cfg.playbookProductId).maybeSingle(), "load page") as JsonRecord | null;
        if (!page) throw new PlaybookError(404, "not_found", "Page not found.");
        const detail = await loadPageDetail(cfg, db, page, { includeDrafts: true });
        const links = list(must(await db.from(t.pageSources).select("source_id, sort_order").eq("page_id", id).order("sort_order", { ascending: true }), "load links"));
        return json(200, { ...detail, source_ids: links.map((l) => String(l.source_id)) });
      }
      if (method === "POST" && route === "/pages") {
        need("admin.products.manage");
        const body = await parseBody(req, 65536);
        const row = pageFields(cfg, body, false);
        publishStamp(row, now);
        const page = must(await db.from(t.pages).insert(by(row, true)).select("*").single(), "create page") as JsonRecord;
        if ("source_ids" in body) await replaceSourceLinks(cfg, db, String(page.id), uuidArray(body.source_ids, "source_ids"));
        return json(200, { page });
      }
      if (method === "PATCH" && route === "/pages") {
        need("admin.products.manage");
        const body = await parseBody(req, 65536);
        const id = toText(body.id, 60);
        if (!isUuid(id)) throw new PlaybookError(400, "invalid_field", "id is required.", { field: "id" });
        const row = pageFields(cfg, isObject(body.patch) ? body.patch : {}, true);
        publishStamp(row, now);
        const page = must(await db.from(t.pages).update(by(row, false)).eq("id", id).eq("product_id", cfg.playbookProductId).select("*").maybeSingle(), "update page");
        if (!page) throw new PlaybookError(404, "not_found", "Page not found.");
        if ("source_ids" in body) await replaceSourceLinks(cfg, db, id, uuidArray(body.source_ids, "source_ids"));
        return json(200, { page });
      }

      // Sections
      if (method === "GET" && route === "/sections") {
        need("admin.products.manage");
        const pageId = toText(url.searchParams.get("page_id"), 60);
        if (!isUuid(pageId)) throw new PlaybookError(400, "invalid_field", "page_id is required.", { field: "page_id" });
        return json(200, { sections: list(must(await db.from(t.sections).select("*").eq("page_id", pageId).order("sort_order", { ascending: true }), "list sections")) });
      }
      if (method === "POST" && route === "/sections") {
        need("admin.products.manage");
        const row = sectionFields(cfg, await parseBody(req, 262144), false);
        const page = must(await db.from(t.pages).select("id").eq("id", row.page_id).eq("product_id", cfg.playbookProductId).maybeSingle(), "check page");
        if (!page) throw new PlaybookError(404, "not_found", "Page not found.");
        return json(200, { section: must(await db.from(t.sections).insert(by(row, true)).select("*").single(), "create section") });
      }
      if (method === "PATCH" && route === "/sections") {
        need("admin.products.manage");
        const body = await parseBody(req, 262144);
        const id = toText(body.id, 60);
        if (!isUuid(id)) throw new PlaybookError(400, "invalid_field", "id is required.", { field: "id" });
        const section = must(await db.from(t.sections).update(by(sectionFields(cfg, isObject(body.patch) ? body.patch : {}, true), false)).eq("id", id).select("*").maybeSingle(), "update section");
        if (!section) throw new PlaybookError(404, "not_found", "Section not found.");
        return json(200, { section });
      }

      // Sources
      if (method === "GET" && route === "/sources") {
        need("admin.products.manage");
        return json(200, { sources: list(must(await db.from(t.sources).select("*").order("updated_at", { ascending: false }).limit(500), "list sources")) });
      }
      if (method === "POST" && route === "/sources") {
        need("admin.products.manage");
        const row = sourceFields(await parseBody(req), false);
        publishStamp(row, now);
        return json(200, { source: must(await db.from(t.sources).insert(by(row, true)).select("*").single(), "create source") });
      }
      if (method === "PATCH" && route === "/sources") {
        need("admin.products.manage");
        const body = await parseBody(req);
        const id = toText(body.id, 60);
        if (!isUuid(id)) throw new PlaybookError(400, "invalid_field", "id is required.", { field: "id" });
        const row = sourceFields(isObject(body.patch) ? body.patch : {}, true);
        publishStamp(row, now);
        const source = must(await db.from(t.sources).update(by(row, false)).eq("id", id).select("*").maybeSingle(), "update source");
        if (!source) throw new PlaybookError(404, "not_found", "Source not found.");
        return json(200, { source });
      }

      // Plan templates
      if (method === "GET" && route === "/plan-templates") {
        need("admin.products.manage");
        const templates = list(must(await db.from(t.planTemplates).select("*").eq("product_id", cfg.playbookProductId).order("duration_days", { ascending: true }), "list templates"));
        const known = new Set([...contractSlugs(cfg.exam).modules, ...contractSlugs(cfg.exam).guides]);
        return json(200, { plan_templates: templates.map((tpl) => ({ ...tpl, normalized_weeks: normalizeTemplateWeeks(tpl.schedule_json, Number(tpl.duration_days ?? 0), known) })) });
      }
      if (method === "POST" && route === "/plan-templates") {
        need("admin.products.manage");
        const row = templateFields(cfg, await parseBody(req, 262144), false);
        publishStamp(row, now);
        return json(200, { plan_template: must(await db.from(t.planTemplates).insert(by(row, true)).select("*").single(), "create template") });
      }
      if (method === "PATCH" && route === "/plan-templates") {
        need("admin.products.manage");
        const body = await parseBody(req, 262144);
        const id = toText(body.id, 60);
        if (!isUuid(id)) throw new PlaybookError(400, "invalid_field", "id is required.", { field: "id" });
        const row = templateFields(cfg, isObject(body.patch) ? body.patch : {}, true);
        publishStamp(row, now);
        const template = must(await db.from(t.planTemplates).update(by(row, false)).eq("id", id).eq("product_id", cfg.playbookProductId).select("*").maybeSingle(), "update template");
        if (!template) throw new PlaybookError(404, "not_found", "Plan template not found.");
        return json(200, { plan_template: template });
      }

      // Publish / unpublish
      if (method === "POST" && route === "/publish") {
        need("admin.products.manage");
        const body = await parseBody(req);
        const kind = enumField(body.kind, ["page", "section", "source", "plan_template"], "kind");
        const id = toText(body.id, 60);
        if (!isUuid(id)) throw new PlaybookError(400, "invalid_field", "id is required.", { field: "id" });
        const publish = body.published !== false;
        const table = kind === "page" ? t.pages : kind === "section" ? t.sections : kind === "source" ? t.sources : t.planTemplates;
        const patch: JsonRecord = { status: publish ? "published" : "draft", updated_by: context.userId };
        if (publish && kind !== "section") patch.published_at = now.toISOString();
        let q = db.from(table).update(patch).eq("id", id);
        if (kind === "page" || kind === "plan_template") q = q.eq("product_id", cfg.playbookProductId);
        const row = must(await q.select("*").maybeSingle(), "publish");
        if (!row) throw new PlaybookError(404, "not_found", "Row not found.");
        deps.log("info", "admin_publish", { exam: cfg.exam, kind, id, publish, admin: context.userId });
        return json(200, { ok: true, row });
      }

      // Preview a page as learners would see it, drafts included.
      m = route.match(/^\/preview\/pages\/([^/]+)$/);
      if (method === "GET" && m) {
        need("admin.products.manage");
        const slug = decodeURIComponent(m[1]).toLowerCase();
        if (!isSlug(slug)) throw new PlaybookError(404, "not_found", "Page not found.");
        const page = must(await db.from(t.pages).select("*").eq("product_id", cfg.playbookProductId).eq("slug", slug).maybeSingle(), "load page") as JsonRecord | null;
        if (!page) throw new PlaybookError(404, "not_found", "Page not found.");
        return json(200, { preview: true, ...(await loadPageDetail(cfg, db, page, { includeDrafts: true })) });
      }

      // Preview the diagnostic for a hypothetical profile (nothing is saved).
      if (method === "POST" && route === "/preview/diagnostic") {
        need("admin.products.manage");
        const body = await parseBody(req);
        const profile = cfg.cleanProfilePatch(isObject(body.profile) ? body.profile : {}, {});
        const templates = list(must(await db.from(t.planTemplates).select("*").eq("product_id", cfg.playbookProductId).eq("status", "published"), "load templates"));
        const outcomes = Array.isArray(body.outcomes) ? (body.outcomes as unknown[]).filter(isObject).slice(0, 10) : [];
        const mastery = Array.isArray(body.mastery) ? (body.mastery as unknown[]).filter(isObject).slice(0, 200) : [];
        return json(200, { diagnostic: cfg.buildDiagnostic({ profile, outcomes, mastery, templates, today: now }) });
      }

      if (method === "GET" && route === "/qa") {
        need("admin.products.manage");
        return json(200, await buildQaReport(cfg, db));
      }

      if (method === "GET" && route === "/analytics") {
        need("admin.analytics.view");
        const days = Math.max(1, Math.min(365, Math.floor(toNumber(url.searchParams.get("days")) ?? 30)));
        return json(200, await buildAnalytics(cfg, db, days, now));
      }

      throw new PlaybookError(404, "not_found", "Not found.");
    } catch (error) {
      if (error instanceof PlaybookError) return json(error.status, { error: error.message, code: error.code, ...error.extra });
      const detail = { route, method: req.method, message: error instanceof Error ? error.message : String(error) };
      if (deps) deps.log("error", "unhandled_error", detail);
      else console.error(JSON.stringify({ fn: "admin-exam-playbook", event: "unhandled_error", ...detail }));
      return json(500, { error: "Something went wrong. Please try again.", code: "internal_error" });
    }
  };
