// Shared engine for the SAT and TOEFL playbook edge functions.
//
// Both services use the same table layout (copied from the IELTS Playbook,
// prefixed `sat_playbook_` / `toefl_playbook_`), so one handler serves both and
// each function only supplies an ExamPlaybookConfig (see sat-playbook.ts and
// toefl-playbook.ts). Everything that touches the network or the database goes
// through `PlaybookDeps` so the handler is exercised by Deno tests with an
// in-memory database.

import {
  type DiagnosticResult,
  contractSlugs,
} from "./exam-playbook-diagnostic.ts";
import {
  isoDate,
  normalizeTemplateWeeks,
  planItemsFromSchedule,
  scheduleTemplateWeeks,
} from "./exam-playbook-plan.ts";

export type JsonRecord = Record<string, unknown>;

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-jwt",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

export const PUBLIC_CACHE = "public, max-age=300, stale-while-revalidate=86400";

export const json = (status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders, ...extraHeaders },
  });

export class PlaybookError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly extra: JsonRecord = {}) {
    super(message);
  }
}

export const isObject = (value: unknown): value is JsonRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

export const toText = (value: unknown, maxLen = 320): string => String(value ?? "").trim().slice(0, maxLen);

export const toNullableText = (value: unknown, maxLen = 320): string | null => {
  const text = toText(value, maxLen);
  return text.length === 0 ? null : text;
};

export const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const getBearerToken = (req: Request): string | null => {
  const header = req.headers.get("Authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
};

export const extractRoute = (url: URL, marker: string): string => {
  const idx = url.pathname.indexOf(marker);
  if (idx < 0) return "";
  const tail = url.pathname.slice(idx + marker.length);
  return tail.startsWith("/") ? tail.replace(/\/+$/, "") || "/" : tail ? `/${tail}` : "";
};

export const parseBody = async (req: Request, maxBytes = 32768): Promise<JsonRecord> => {
  const raw = await req.text().catch(() => "");
  if (!raw.trim()) return {};
  if (raw.length > maxBytes) throw new PlaybookError(413, "body_too_large", "Request body is too large.");
  try {
    const parsed = JSON.parse(raw);
    return isObject(parsed) ? parsed : {};
  } catch {
    throw new PlaybookError(400, "invalid_json", "Request body must be JSON.");
  }
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isSlug = (value: string) => SLUG_RE.test(value) && value.length <= 160;
export const isUuid = (value: string) => UUID_RE.test(value);

// --- Config -----------------------------------------------------------------

export type PlaybookTables = {
  pages: string;
  sections: string;
  sources: string;
  pageSources: string;
  planTemplates: string;
  profiles: string;
  snapshots: string;
  events: string;
  userPlans: string;
  planItems: string;
  sectionProgress: string;
  notes: string;
  threads: string;
};

export const tablesFor = (prefix: "sat_playbook" | "toefl_playbook"): PlaybookTables => ({
  pages: `${prefix}_pages`,
  sections: `${prefix}_page_sections`,
  sources: `${prefix}_sources`,
  pageSources: `${prefix}_page_sources`,
  planTemplates: `${prefix}_plan_templates`,
  profiles: `${prefix}_user_profiles`,
  snapshots: `${prefix}_recommendation_snapshots`,
  events: `${prefix}_events`,
  userPlans: `${prefix}_user_plans`,
  planItems: `${prefix}_user_plan_items`,
  sectionProgress: `${prefix}_section_progress`,
  notes: `${prefix}_user_notes`,
  threads: `${prefix}_section_threads`,
});

export type DiagnosticInputs = {
  profile: JsonRecord;
  outcomes: JsonRecord[];
  mastery: JsonRecord[];
  templates: JsonRecord[];
  today: Date;
};

export type ExamPlaybookConfig = {
  exam: "sat" | "toefl";
  examLabel: string;
  functionName: string;
  routeMarker: string;
  tables: PlaybookTables;
  playbookProductId: string;
  playbookProductSlug: string;
  simulatorProductId: string;
  /** SAT Practice; TOEFL has no separate practice product (practice lives in the simulator). */
  practiceProductId: string | null;
  blockTypes: string[];
  focusSections: string[];
  /** Validates and cleans a PATCH /profile body. Throws PlaybookError(400) on bad input. */
  cleanProfilePatch: (patch: JsonRecord, existing: JsonRecord) => JsonRecord;
  /** Profile keys whose change re-runs the diagnostic. */
  diagnosticFields: string[];
  buildDiagnostic: (input: DiagnosticInputs) => DiagnosticResult;
  /** Short description of the exam for AI prompts. */
  aiExamContext: string;
};

// --- Dependencies -------------------------------------------------------------

export type AIStatus = "ok" | "unconfigured" | "failed";
export type AiCall = <T>(options: { systemPrompt: string; userPayload: string; temperature?: number }, fallback: T) => Promise<{ data: T; status: AIStatus }>;

export type PlaybookDeps = {
  db: any;
  getUser: (token: string) => Promise<{ id: string } | null>;
  hasProduct: (token: string, productId: string) => Promise<boolean>;
  ai: AiCall;
  now: () => Date;
  log: (level: "info" | "warn" | "error", event: string, detail: JsonRecord) => void;
  anonEventsPerMinute?: number;
  anonEventsPerIpPerMinute?: number;
};

export const defaultLog = (fn: string) => (level: "info" | "warn" | "error", event: string, detail: JsonRecord) => {
  const line = JSON.stringify({ fn, level, event, ...detail });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

/** Premium access via access-effective (bundles and sponsored grants included there). */
export const accessEffectiveHasProduct = (supabaseUrl: string, anonKey: string) =>
  async (token: string, productId: string): Promise<boolean> => {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/access-effective`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return false;
      const payload = (await res.json()) as { effective_product_ids?: unknown };
      return Array.isArray(payload?.effective_product_ids) && payload.effective_product_ids.includes(productId);
    } catch {
      return false;
    }
  };

// --- Data access ----------------------------------------------------------------

const rows = (value: unknown): JsonRecord[] => (Array.isArray(value) ? value.filter(isObject) : []);

const must = <T>(result: { data: T; error: unknown }, what: string): T => {
  if (result.error) {
    const message = isObject(result.error) ? String(result.error.message ?? "") : String(result.error);
    throw new Error(`${what}: ${message}`);
  }
  return result.data;
};

const PAGE_LIST_COLUMNS = "id, parent_page_id, slug, module_key, title, summary, page_type, sort_order, visibility, metadata, published_at";

export const loadPublishedPages = async (cfg: ExamPlaybookConfig, db: any): Promise<JsonRecord[]> => {
  const result = await db
    .from(cfg.tables.pages)
    .select(PAGE_LIST_COLUMNS)
    .eq("product_id", cfg.playbookProductId)
    .eq("locale_code", "en")
    .eq("status", "published")
    .order("sort_order", { ascending: true });
  return rows(must(result, "load pages"));
};

export const loadTemplates = async (cfg: ExamPlaybookConfig, db: any, opts: { includeSchedule?: boolean } = {}): Promise<JsonRecord[]> => {
  const columns = opts.includeSchedule
    ? "*"
    : "id, slug, plan_type, title, summary, duration_days, score_min, score_max, focus_section, intensity, published_at, metadata";
  const result = await db
    .from(cfg.tables.planTemplates)
    .select(columns)
    .eq("product_id", cfg.playbookProductId)
    .eq("status", "published")
    .order("duration_days", { ascending: true });
  return rows(must(result, "load plan templates"));
};

const catalogEntry = (p: JsonRecord) => ({
  id: String(p.id),
  parent_page_id: p.parent_page_id ? String(p.parent_page_id) : null,
  slug: String(p.slug ?? ""),
  module_key: p.module_key ? String(p.module_key) : null,
  title: String(p.title ?? ""),
  summary: String(p.summary ?? ""),
  page_type: String(p.page_type ?? "module"),
  visibility: String(p.visibility ?? "public"),
  sort_order: Number(p.sort_order ?? 0),
  metadata: isObject(p.metadata) ? p.metadata : {},
  published_at: p.published_at ? String(p.published_at) : null,
});

export const buildCatalog = async (cfg: ExamPlaybookConfig, db: any) => {
  const [pages, templates] = await Promise.all([loadPublishedPages(cfg, db), loadTemplates(cfg, db)]);
  const entries = pages.map(catalogEntry).filter((p) => isSlug(p.slug) && p.title.trim());
  return {
    product_slug: cfg.playbookProductSlug,
    exam: cfg.exam,
    modules: entries.filter((p) => p.visibility !== "premium" && p.parent_page_id === null && p.page_type !== "study_plan"),
    premium_guides: entries.filter((p) => p.visibility === "premium"),
    plan_templates: templates.map((t) => ({
      id: String(t.id),
      slug: String(t.slug ?? ""),
      title: String(t.title ?? ""),
      summary: String(t.summary ?? ""),
      plan_type: String(t.plan_type ?? ""),
      duration_days: Number(t.duration_days ?? 0),
      focus_section: t.focus_section ? String(t.focus_section) : null,
      intensity: String(t.intensity ?? ""),
    })),
  };
};

export const loadPageBySlug = async (cfg: ExamPlaybookConfig, db: any, slug: string): Promise<JsonRecord | null> => {
  const result = await db
    .from(cfg.tables.pages)
    .select("*")
    .eq("product_id", cfg.playbookProductId)
    .eq("locale_code", "en")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  const page = must(result, "load page");
  return isObject(page) ? page : null;
};

export const loadPageDetail = async (cfg: ExamPlaybookConfig, db: any, page: JsonRecord, opts: { includeDrafts?: boolean } = {}) => {
  let sectionQuery = db.from(cfg.tables.sections).select("*").eq("page_id", page.id);
  if (!opts.includeDrafts) sectionQuery = sectionQuery.eq("status", "published");
  let childQuery = db
    .from(cfg.tables.pages)
    .select("id, parent_page_id, page_type, module_key, slug, title, summary, visibility, sort_order, published_at, metadata, status")
    .eq("parent_page_id", page.id);
  if (!opts.includeDrafts) childQuery = childQuery.eq("status", "published");
  const [sectionResult, childResult, linkResult] = await Promise.all([
    sectionQuery.order("sort_order", { ascending: true }),
    childQuery.order("sort_order", { ascending: true }),
    db.from(cfg.tables.pageSources).select("source_id, sort_order, citation_note, is_primary").eq("page_id", page.id).order("sort_order", { ascending: true }),
  ]);
  const links = rows(must(linkResult, "load page sources"));
  const sourceIds = links.map((l) => String(l.source_id)).filter(Boolean);
  let sourceRows: JsonRecord[] = [];
  if (sourceIds.length > 0) {
    let q = db.from(cfg.tables.sources).select("id, source_type, provider_key, title, url, summary, status, verified_at, metadata").in("id", sourceIds);
    if (!opts.includeDrafts) q = q.eq("status", "published");
    sourceRows = rows(must(await q, "load sources"));
  }
  return {
    page: { ...page, metadata: isObject(page.metadata) ? page.metadata : {} },
    sections: rows(must(sectionResult, "load sections")).map((row) => ({
      ...row,
      content: isObject(row.content) ? row.content : {},
      metadata: isObject(row.metadata) ? row.metadata : {},
    })),
    child_pages: rows(must(childResult, "load child pages")).map((row) => ({ ...row, metadata: isObject(row.metadata) ? row.metadata : {} })),
    sources: links
      .map((link) => {
        const source = sourceRows.find((s) => String(s.id) === String(link.source_id));
        return source
          ? {
            sort_order: Number(link.sort_order ?? 0),
            citation_note: link.citation_note ? String(link.citation_note) : null,
            is_primary: Boolean(link.is_primary),
            source: { ...source, metadata: isObject(source.metadata) ? source.metadata : {} },
          }
          : null;
      })
      .filter(Boolean),
  };
};

export const loadProfile = async (cfg: ExamPlaybookConfig, db: any, userId: string): Promise<JsonRecord> => {
  const result = await db.from(cfg.tables.profiles).select("*").eq("user_id", userId).eq("product_id", cfg.playbookProductId).maybeSingle();
  const data = must(result, "load profile");
  return isObject(data) ? data : {};
};

export const saveProfile = async (cfg: ExamPlaybookConfig, db: any, userId: string, cleaned: JsonRecord, now: Date): Promise<JsonRecord> => {
  const result = await db
    .from(cfg.tables.profiles)
    .upsert({ user_id: userId, product_id: cfg.playbookProductId, ...cleaned, updated_at: now.toISOString() }, { onConflict: "user_id,product_id" })
    .select("*")
    .single();
  return must(result, "save profile") as JsonRecord;
};

export const loadLatestSnapshot = async (cfg: ExamPlaybookConfig, db: any, userId: string): Promise<JsonRecord | null> => {
  const result = await db
    .from(cfg.tables.snapshots)
    .select("*")
    .eq("user_id", userId)
    .eq("product_id", cfg.playbookProductId)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const data = must(result, "load snapshot");
  return isObject(data) ? data : null;
};

const loadOutcomes = async (cfg: ExamPlaybookConfig, db: any, userId: string): Promise<JsonRecord[]> => {
  const result = await db
    .from("exam_outcomes")
    .select("id, overall_score, overall_band, section_scores, skill_breakdown, raw_result, computed_at, status")
    .eq("user_id", userId)
    .eq("product_id", cfg.simulatorProductId)
    .eq("status", "completed")
    .order("computed_at", { ascending: false })
    .limit(10);
  return rows(must(result, "load simulator outcomes"));
};

const loadMastery = async (cfg: ExamPlaybookConfig, db: any, userId: string): Promise<JsonRecord[]> => {
  if (cfg.exam !== "sat") return [];
  const result = await db
    .from("sat_practice_mastery")
    .select("section_type, domain, difficulty, attempts, rolling_accuracy, last_accuracy, mastery_level, mastery_status, last_practiced_at")
    .eq("user_id", userId)
    .limit(500);
  // Mastery is optional evidence; a missing table or outage must not block the diagnostic.
  if (result.error) return [];
  return rows(result.data);
};

export const runDiagnostic = async (cfg: ExamPlaybookConfig, deps: PlaybookDeps, userId: string, profile: JsonRecord, trigger: string) => {
  const db = deps.db;
  const [outcomes, mastery, templates] = await Promise.all([
    loadOutcomes(cfg, db, userId),
    loadMastery(cfg, db, userId),
    loadTemplates(cfg, db, { includeSchedule: true }),
  ]);
  const now = deps.now();
  const result = cfg.buildDiagnostic({ profile, outcomes, mastery, templates, today: now });
  const template = templates.find((t) => String(t.slug) === result.plan_suggestion.template_slug);

  must(
    await db.from(cfg.tables.snapshots).update({ is_current: false }).eq("user_id", userId).eq("product_id", cfg.playbookProductId).eq("is_current", true),
    "retire snapshots",
  );
  const insert = await db
    .from(cfg.tables.snapshots)
    .insert({
      user_id: userId,
      product_id: cfg.playbookProductId,
      plan_template_id: template?.id ?? null,
      latest_exam_outcome_id: result.latest_outcome_id,
      snapshot_type: "diagnostic",
      recommendation_slug: `diagnostic-${result.plan_suggestion.template_slug ?? "none"}`,
      recommendation_json: result,
      inputs_json: {
        profile_snapshot: profile,
        simulator_outcome_ids: outcomes.map((o) => o.id).filter(Boolean),
        practice_mastery_rows: mastery.length,
      },
      derived_context: { generated_at: now.toISOString(), trigger, engine: result.version },
      is_current: true,
    })
    .select("*")
    .single();
  const snapshot = must(insert, "save snapshot") as JsonRecord;
  await recordEventRow(cfg, deps, {
    event_name: "diagnostic_run",
    user_id: userId,
    metadata: { trigger, template_slug: result.plan_suggestion.template_slug, bottlenecks: result.bottlenecks.length },
  });
  return snapshot;
};

// --- Events -----------------------------------------------------------------------

export const ALLOWED_EVENTS = new Set([
  "page_view",
  "premium_gate_seen",
  "premium_gate_clicked",
  "onboarding_completed",
  "recommendation_generated",
  "simulator_referral_opened",
  "practice_referral_opened",
  "resource_clicked",
  "official_source_clicked",
  "module_open",
  "section_complete",
  "diagnostic_run",
  "plan_adopted",
  "note_saved",
  "practice_click",
  "upgrade_click",
]);

/** Events an anonymous visitor may send (all others require a signed-in learner). */
export const ANONYMOUS_EVENTS = new Set(["page_view", "upgrade_click", "practice_click", "premium_gate_seen", "official_source_clicked"]);

const recordEventRow = async (cfg: ExamPlaybookConfig, deps: PlaybookDeps, row: JsonRecord) => {
  try {
    const result = await deps.db.from(cfg.tables.events).insert({
      product_id: cfg.playbookProductId,
      user_id: row.user_id ?? null,
      page_id: row.page_id ?? null,
      event_name: row.event_name,
      page_type: row.page_type ?? null,
      module_key: row.module_key ?? null,
      market_country_code: row.market_country_code ?? null,
      metadata: isObject(row.metadata) ? row.metadata : {},
    });
    if (result?.error) deps.log("warn", "event_insert_failed", { event_name: String(row.event_name), message: String(result.error.message ?? "") });
  } catch (error) {
    // Analytics never break the learner flow.
    deps.log("warn", "event_insert_failed", { event_name: String(row.event_name), message: error instanceof Error ? error.message : String(error) });
  }
};

const ipBuckets = new Map<string, { windowStart: number; count: number }>();

const clientIp = (req: Request) =>
  (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();

/** Two-level throttle for anonymous events: per-IP (per isolate) and a global per-minute cap in the table. */
const allowAnonymousEvent = async (cfg: ExamPlaybookConfig, deps: PlaybookDeps, req: Request): Promise<boolean> => {
  const nowMs = deps.now().getTime();
  const ip = clientIp(req);
  const perIp = deps.anonEventsPerIpPerMinute ?? 30;
  const bucket = ipBuckets.get(ip);
  if (!bucket || nowMs - bucket.windowStart > 60000) ipBuckets.set(ip, { windowStart: nowMs, count: 1 });
  else {
    bucket.count += 1;
    if (bucket.count > perIp) return false;
  }
  if (ipBuckets.size > 5000) ipBuckets.clear();

  const since = new Date(nowMs - 60000).toISOString();
  const result = await deps.db
    .from(cfg.tables.events)
    .select("id", { count: "exact", head: true })
    .eq("product_id", cfg.playbookProductId)
    .is("user_id", null)
    .gte("occurred_at", since);
  if (result.error) return false;
  return Number(result.count ?? 0) < (deps.anonEventsPerMinute ?? 300);
};

export const __resetEventThrottle = () => ipBuckets.clear();

// --- Profile helpers -------------------------------------------------------------

export const parseDateOnly = (value: unknown, field: string): string | null => {
  if (value == null || value === "") return null;
  const text = toText(value, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new PlaybookError(400, "invalid_field", `${field} must be a date (YYYY-MM-DD).`, { field });
  }
  return text;
};

export const pickEnum = (value: unknown, allowed: string[], field: string, nullable = true): string | null => {
  if (value == null || value === "") {
    if (nullable) return null;
    throw new PlaybookError(400, "invalid_field", `${field} is required.`, { field });
  }
  const text = toText(value, 64);
  if (!allowed.includes(text)) throw new PlaybookError(400, "invalid_field", `${field} has an unsupported value.`, { field });
  return text;
};

export const pickInt = (value: unknown, min: number, max: number, field: string, step = 1): number | null => {
  if (value == null || value === "") return null;
  const n = toNumber(value);
  if (n == null || n < min || n > max) throw new PlaybookError(400, "invalid_field", `${field} must be between ${min} and ${max}.`, { field });
  return Math.round(n / step) * step;
};

// --- Notes, plans -------------------------------------------------------------------

const ITEM_COLUMNS = "id, user_plan_id, kind, page_slug, title, week_number, due_date, status, done_at, sort_order, metadata, created_at, updated_at";

const loadActivePlan = async (cfg: ExamPlaybookConfig, db: any, userId: string): Promise<JsonRecord | null> => {
  const result = await db
    .from(cfg.tables.userPlans)
    .select("*")
    .eq("user_id", userId)
    .eq("product_id", cfg.playbookProductId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const data = must(result, "load plan");
  return isObject(data) ? data : null;
};

const loadMyPlan = async (cfg: ExamPlaybookConfig, db: any, userId: string) => {
  const plan = await loadActivePlan(cfg, db, userId);
  const itemsResult = await db
    .from(cfg.tables.planItems)
    .select(ITEM_COLUMNS)
    .eq("user_id", userId)
    .eq("product_id", cfg.playbookProductId)
    .order("sort_order", { ascending: true })
    .limit(500);
  const items = rows(must(itemsResult, "load plan items"));
  const planItems = plan ? items.filter((i) => String(i.user_plan_id ?? "") === String(plan.id)) : [];
  const moduleItems = items.filter((i) => i.kind === "module" && !i.user_plan_id);
  const done = planItems.filter((i) => i.status === "done").length;
  return {
    plan,
    plan_items: planItems,
    module_items: moduleItems,
    progress: { total: planItems.length, done, modules_total: moduleItems.length, modules_done: moduleItems.filter((i) => i.status === "done").length },
  };
};

const sectionText = (section: JsonRecord): string => {
  const content = isObject(section.content) ? section.content : {};
  const parts: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 3 || parts.join(" ").length > 4000) return;
    if (typeof value === "string") parts.push(value);
    else if (Array.isArray(value)) value.forEach((v) => visit(v, depth + 1));
    else if (isObject(value)) Object.values(value).forEach((v) => visit(v, depth + 1));
  };
  visit(content, 0);
  return parts.join("\n").slice(0, 4000);
};

// --- Handler -----------------------------------------------------------------------------

const PREMIUM_REQUIRED = "premium_required";

export const createPlaybookHandler = (cfg: ExamPlaybookConfig, makeDeps: () => PlaybookDeps) =>
  async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    const url = new URL(req.url);
    const route = extractRoute(url, cfg.routeMarker);
    let deps: PlaybookDeps | null = null;
    try {
      deps = makeDeps();
      const db = deps.db;
      const token = getBearerToken(req);
      const user = token ? await deps.getUser(token) : null;
      const userId = user?.id ?? null;
      let premiumCache: boolean | null = null;
      const isPremium = async () => {
        if (!token || !userId) return false;
        if (premiumCache == null) premiumCache = await deps!.hasProduct(token, cfg.playbookProductId);
        return premiumCache;
      };
      const requireUser = () => {
        if (!userId) throw new PlaybookError(401, "auth_required", "Sign in to continue.", { product_slug: cfg.playbookProductSlug });
        return userId;
      };
      const requirePremium = async () => {
        const id = requireUser();
        if (!(await isPremium())) {
          throw new PlaybookError(403, PREMIUM_REQUIRED, "This needs Premium access.", { product_slug: cfg.playbookProductSlug });
        }
        return id;
      };
      const method = req.method;
      const match = (re: RegExp) => route.match(re);

      // ---- Public catalog ----
      if (method === "GET" && route === "/catalog") {
        return json(200, await buildCatalog(cfg, db), { "Cache-Control": PUBLIC_CACHE });
      }

      // ---- Page (public / authenticated / premium per page) ----
      let m = match(/^\/pages\/([^/]+)$/);
      if (method === "GET" && m) {
        const slug = decodeURIComponent(m[1]).toLowerCase();
        if (!isSlug(slug)) throw new PlaybookError(404, "not_found", "Page not found.");
        const page = await loadPageBySlug(cfg, db, slug);
        if (!page) throw new PlaybookError(404, "not_found", "Page not found.");
        const visibility = String(page.visibility ?? "public");
        const teaser = {
          slug: page.slug,
          title: page.title,
          summary: page.summary,
          page_type: page.page_type,
          visibility,
          module_key: page.module_key ?? null,
        };
        if (visibility === "authenticated" && !userId) {
          throw new PlaybookError(401, "auth_required", "Sign in to read this page.", { product_slug: cfg.playbookProductSlug, teaser });
        }
        if (visibility === "premium") {
          if (!userId) throw new PlaybookError(401, "auth_required", "Sign in to read this page.", { product_slug: cfg.playbookProductSlug, teaser });
          if (!(await isPremium())) throw new PlaybookError(403, PREMIUM_REQUIRED, "This guide is part of Premium.", { product_slug: cfg.playbookProductSlug, teaser });
        }
        const detail = await loadPageDetail(cfg, db, page);
        const cache = visibility === "public" && !token ? PUBLIC_CACHE : visibility === "public" ? "private, max-age=60" : "private, no-store";
        return json(200, detail, { "Cache-Control": cache });
      }

      // ---- Events ----
      if (method === "POST" && route === "/events") {
        const body = await parseBody(req, 8192);
        const eventName = toText(body.event_name, 64);
        if (!ALLOWED_EVENTS.has(eventName)) throw new PlaybookError(400, "invalid_event", "Unknown event.");
        if (!userId) {
          if (!ANONYMOUS_EVENTS.has(eventName)) throw new PlaybookError(401, "auth_required", "Sign in to record this event.");
          if (!(await allowAnonymousEvent(cfg, deps, req))) return json(202, { ok: true, accepted: false });
        }
        const pageId = toText(body.page_id, 60);
        if (pageId && !isUuid(pageId)) throw new PlaybookError(400, "invalid_field", "page_id must be a UUID.");
        if (pageId && !userId) {
          // Anonymous rows must point at a real published page.
          const exists = must(await db.from(cfg.tables.pages).select("id").eq("id", pageId).eq("status", "published").maybeSingle(), "check page");
          if (!exists) return json(202, { ok: true, accepted: false });
        }
        const metadata = isObject(body.metadata) ? body.metadata : {};
        const metaText = JSON.stringify(metadata);
        await recordEventRow(cfg, deps, {
          event_name: eventName,
          user_id: userId,
          page_id: pageId || null,
          page_type: toNullableText(body.page_type, 40),
          module_key: toNullableText(body.module_key, 80),
          market_country_code: toNullableText(body.market_country_code, 16),
          metadata: metaText.length <= 2000 ? metadata : {},
        });
        return json(200, { ok: true, accepted: true });
      }

      // ---- Learner state for one page (premium) ----
      m = match(/^\/pages\/([^/]+)\/me$/);
      if (method === "GET" && m) {
        const uid = await requirePremium();
        const slug = decodeURIComponent(m[1]).toLowerCase();
        const page = isSlug(slug) ? await loadPageBySlug(cfg, db, slug) : null;
        if (!page) throw new PlaybookError(404, "not_found", "Page not found.");
        const [progressResult, itemResult, notesResult] = await Promise.all([
          db.from(cfg.tables.sectionProgress).select("section_id, completed_at").eq("user_id", uid).eq("page_id", page.id),
          db.from(cfg.tables.planItems).select(ITEM_COLUMNS).eq("user_id", uid).eq("product_id", cfg.playbookProductId).eq("page_slug", slug),
          db.from(cfg.tables.notes).select("id, page_id, section_id, anchor_text, body, color, created_at, updated_at").eq("user_id", uid).eq("page_id", page.id).order("created_at", { ascending: false }),
        ]);
        const items = rows(must(itemResult, "load plan items"));
        return json(200, {
          premium: true,
          completed_section_ids: rows(must(progressResult, "load progress")).map((r) => String(r.section_id)),
          module_item: items.find((i) => i.kind === "module" && !i.user_plan_id) ?? null,
          plan_tasks: items.filter((i) => i.kind === "task"),
          notes: rows(must(notesResult, "load notes")),
        }, { "Cache-Control": "private, no-store" });
      }

      m = match(/^\/pages\/([^/]+)\/sections\/([^/]+)\/complete$/);
      if (method === "POST" && m) {
        const uid = await requirePremium();
        const slug = decodeURIComponent(m[1]).toLowerCase();
        const sectionId = decodeURIComponent(m[2]);
        if (!isSlug(slug) || !isUuid(sectionId)) throw new PlaybookError(400, "invalid_field", "Unknown section.");
        const page = await loadPageBySlug(cfg, db, slug);
        if (!page) throw new PlaybookError(404, "not_found", "Page not found.");
        const section = must(await db.from(cfg.tables.sections).select("id").eq("id", sectionId).eq("page_id", page.id).eq("status", "published").maybeSingle(), "load section");
        if (!section) throw new PlaybookError(404, "not_found", "Section not found.");
        const body = await parseBody(req, 1024);
        const done = body.done !== false;
        if (done) {
          must(await db.from(cfg.tables.sectionProgress).upsert(
            { user_id: uid, product_id: cfg.playbookProductId, page_id: page.id, section_id: sectionId, completed_at: deps.now().toISOString() },
            { onConflict: "user_id,page_id,section_id" },
          ), "save progress");
          await recordEventRow(cfg, deps, { event_name: "section_complete", user_id: uid, page_id: page.id, page_type: page.page_type, module_key: page.module_key, metadata: { section_id: sectionId, slug } });
        } else {
          must(await db.from(cfg.tables.sectionProgress).delete().eq("user_id", uid).eq("page_id", page.id).eq("section_id", sectionId), "clear progress");
        }
        return json(200, { ok: true, done });
      }

      // ---- Section coach (premium, AI via the free-model helper) ----
      m = match(/^\/pages\/([^/]+)\/sections\/([^/]+)\/(ask|thread)$/);
      if (m && ((method === "POST" && m[3] === "ask") || (method === "GET" && m[3] === "thread"))) {
        const uid = await requirePremium();
        const slug = decodeURIComponent(m[1]).toLowerCase();
        const sectionId = decodeURIComponent(m[2]);
        if (!isSlug(slug) || !isUuid(sectionId)) throw new PlaybookError(400, "invalid_field", "Unknown section.");
        const page = await loadPageBySlug(cfg, db, slug);
        if (!page) throw new PlaybookError(404, "not_found", "Page not found.");
        const section = must(await db.from(cfg.tables.sections).select("*").eq("id", sectionId).eq("page_id", page.id).eq("status", "published").maybeSingle(), "load section") as JsonRecord | null;
        if (!section) throw new PlaybookError(404, "not_found", "Section not found.");
        const existing = must(await db.from(cfg.tables.threads).select("messages").eq("user_id", uid).eq("page_id", page.id).eq("section_id", sectionId).maybeSingle(), "load thread") as JsonRecord | null;
        const prior = Array.isArray(existing?.messages) ? (existing!.messages as JsonRecord[]).filter(isObject) : [];
        if (m[3] === "thread") return json(200, { ok: true, messages: prior }, { "Cache-Control": "private, no-store" });

        const body = await parseBody(req, 4096);
        const question = toText(body.message, 1000);
        if (!question) throw new PlaybookError(400, "invalid_field", "Write a question first.");
        const userTurns = prior.filter((p) => p.role === "user").length;
        if (userTurns >= 20) throw new PlaybookError(429, "coach_limit", "This section's coach thread is full. Start a note instead.");
        const fallback = { reply: "" };
        const { data, status } = await deps.ai(
          {
            systemPrompt:
              `You are a ${cfg.aiExamContext} tutor answering a learner's follow-up question about ONE section of a strategy guide. ` +
              "Use only the section text provided; if the answer is not in it, say so and point to what the section does cover. " +
              "Never invent scores, statistics, dates, prices or official rules. Return strict JSON: {\"reply\": \"2-5 sentences\"}.",
            userPayload: JSON.stringify({
              page_title: toText(page.title, 200),
              section_heading: toText(section.heading, 200),
              section_text: sectionText(section),
              prior_messages: prior.slice(-6).map((p) => ({ role: p.role, content: toText(p.content, 600) })),
              question,
            }),
            temperature: 0.4,
          },
          fallback,
        );
        const reply = status === "ok" ? toText((data as JsonRecord).reply, 1500) : "";
        if (!reply) {
          return json(200, { ok: false, ai_status: status === "ok" ? "failed" : status, code: "coach_unavailable", messages: prior });
        }
        const at = deps.now().toISOString();
        const messages = [...prior, { role: "user", content: question, at }, { role: "assistant", content: reply, at, ai: true }].slice(-40);
        must(await db.from(cfg.tables.threads).upsert(
          { user_id: uid, product_id: cfg.playbookProductId, page_id: page.id, section_id: sectionId, messages, updated_at: at },
          { onConflict: "user_id,page_id,section_id" },
        ), "save thread");
        return json(200, { ok: true, ai_status: status, messages });
      }

      // ---- Plan template (premium) ----
      m = match(/^\/plans\/([^/]+)$/);
      if (method === "GET" && m) {
        const uid = await requirePremium();
        const slug = decodeURIComponent(m[1]).toLowerCase();
        const templates = await loadTemplates(cfg, db, { includeSchedule: true });
        const plan = templates.find((t) => t.slug === slug);
        if (!plan) throw new PlaybookError(404, "not_found", "Plan not found.");
        const [profile, myPlan] = await Promise.all([loadProfile(cfg, db, uid), loadMyPlan(cfg, db, uid)]);
        const known = new Set([...contractSlugs(cfg.exam).modules, ...contractSlugs(cfg.exam).guides]);
        const weeks = normalizeTemplateWeeks(plan.schedule_json, Number(plan.duration_days ?? 0), known);
        const preview = scheduleTemplateWeeks(weeks, { startDate: isoDate(deps.now()), testDate: (profile.deadline_date as string | null) ?? null });
        const adopted = myPlan.plan && String(myPlan.plan.template_slug) === slug ? myPlan : null;
        return json(200, { plan, weeks, schedule_preview: preview, adopted }, { "Cache-Control": "private, no-store" });
      }

      m = match(/^\/plans\/([^/]+)\/adopt$/);
      if (method === "POST" && m) {
        const uid = await requirePremium();
        const slug = decodeURIComponent(m[1]).toLowerCase();
        const body = await parseBody(req, 2048);
        const templates = await loadTemplates(cfg, db, { includeSchedule: true });
        const template = templates.find((t) => t.slug === slug);
        if (!template) throw new PlaybookError(404, "not_found", "Plan not found.");
        const profile = await loadProfile(cfg, db, uid);
        const today = isoDate(deps.now());
        const startDate = parseDateOnly(body.start_date, "start_date") ?? today;
        if (startDate < today) throw new PlaybookError(400, "invalid_field", "The start date cannot be in the past.", { field: "start_date" });
        const testDate = parseDateOnly(body.test_date, "test_date") ?? ((profile.deadline_date as string | null) ?? null);
        if (testDate && testDate <= startDate) throw new PlaybookError(400, "invalid_field", "The test date must be after the start date.", { field: "test_date" });
        const known = new Set([...contractSlugs(cfg.exam).modules, ...contractSlugs(cfg.exam).guides]);
        const weeks = normalizeTemplateWeeks(template.schedule_json, Number(template.duration_days ?? 0), known);
        if (weeks.length === 0) throw new PlaybookError(409, "template_empty", "This plan has no schedule yet.");
        const schedule = scheduleTemplateWeeks(weeks, { startDate, testDate });
        const drafts = planItemsFromSchedule(schedule);

        must(await db.from(cfg.tables.userPlans).update({ status: "archived", updated_at: deps.now().toISOString() })
          .eq("user_id", uid).eq("product_id", cfg.playbookProductId).eq("status", "active"), "archive plan");
        const planRow = must(await db.from(cfg.tables.userPlans).insert({
          user_id: uid,
          product_id: cfg.playbookProductId,
          plan_template_id: template.id ?? null,
          template_slug: slug,
          start_date: schedule.start_date,
          test_date: schedule.test_date,
          status: "active",
          schedule,
          metadata: { template_title: template.title ?? null, compressed: schedule.compressed, buffer_weeks: schedule.buffer_weeks },
        }).select("*").single(), "save plan") as JsonRecord;
        if (drafts.length > 0) {
          must(await db.from(cfg.tables.planItems).insert(drafts.map((d) => ({
            ...d,
            user_id: uid,
            product_id: cfg.playbookProductId,
            user_plan_id: planRow.id,
            status: "todo",
          }))), "save plan items");
        }
        await recordEventRow(cfg, deps, { event_name: "plan_adopted", user_id: uid, metadata: { template_slug: slug, weeks: schedule.weeks.length, compressed: schedule.compressed } });
        return json(200, { ok: true, ...(await loadMyPlan(cfg, db, uid)) });
      }

      // ---- My plan ----
      if (method === "GET" && route === "/my-plan") {
        const uid = await requirePremium();
        return json(200, await loadMyPlan(cfg, db, uid), { "Cache-Control": "private, no-store" });
      }

      if (method === "POST" && route === "/my-plan/items") {
        const uid = await requirePremium();
        const body = await parseBody(req, 2048);
        const slug = toText(body.page_slug, 160).toLowerCase();
        if (!isSlug(slug)) throw new PlaybookError(400, "invalid_field", "Choose a module to add.");
        const page = await loadPageBySlug(cfg, db, slug);
        if (!page) throw new PlaybookError(404, "not_found", "Page not found.");
        const existing = rows(must(await db.from(cfg.tables.planItems).select(ITEM_COLUMNS).eq("user_id", uid).eq("product_id", cfg.playbookProductId).eq("kind", "module").eq("page_slug", slug), "load item"));
        const current = existing.find((i) => !i.user_plan_id);
        if (current) return json(200, { ok: true, item: current, created: false });
        const countResult = await db.from(cfg.tables.planItems).select("id", { count: "exact", head: true }).eq("user_id", uid).eq("product_id", cfg.playbookProductId).eq("kind", "module");
        if (Number(countResult.count ?? 0) >= 100) throw new PlaybookError(409, "plan_full", "Your plan already has 100 modules.");
        const item = must(await db.from(cfg.tables.planItems).insert({
          user_id: uid,
          product_id: cfg.playbookProductId,
          user_plan_id: null,
          kind: "module",
          page_slug: slug,
          title: toText(page.title, 240),
          status: "todo",
          sort_order: Number(countResult.count ?? 0),
          metadata: { page_type: page.page_type ?? null, visibility: page.visibility ?? null },
        }).select(ITEM_COLUMNS).single(), "add item");
        return json(200, { ok: true, item, created: true });
      }

      m = match(/^\/my-plan\/items\/([^/]+)$/);
      if (m && (method === "PATCH" || method === "DELETE")) {
        const uid = await requirePremium();
        const id = decodeURIComponent(m[1]);
        if (!isUuid(id)) throw new PlaybookError(404, "not_found", "Item not found.");
        const item = must(await db.from(cfg.tables.planItems).select(ITEM_COLUMNS).eq("id", id).eq("user_id", uid).eq("product_id", cfg.playbookProductId).maybeSingle(), "load item") as JsonRecord | null;
        if (!item) throw new PlaybookError(404, "not_found", "Item not found.");
        if (method === "DELETE") {
          if (item.kind !== "module") throw new PlaybookError(409, "not_removable", "Plan tasks can be ticked off but not removed.");
          must(await db.from(cfg.tables.planItems).delete().eq("id", id).eq("user_id", uid), "remove item");
          return json(200, { ok: true });
        }
        const body = await parseBody(req, 1024);
        const status = pickEnum(body.status, ["todo", "done"], "status", false)!;
        const updated = must(await db.from(cfg.tables.planItems).update({
          status,
          done_at: status === "done" ? deps.now().toISOString() : null,
          updated_at: deps.now().toISOString(),
        }).eq("id", id).eq("user_id", uid).select(ITEM_COLUMNS).single(), "update item");
        return json(200, { ok: true, item: updated });
      }

      // ---- Profile + diagnostic (premium) ----
      if (method === "GET" && route === "/profile") {
        const uid = await requirePremium();
        return json(200, { profile: await loadProfile(cfg, db, uid) }, { "Cache-Control": "private, no-store" });
      }

      if (method === "PATCH" && route === "/profile") {
        const uid = await requirePremium();
        const body = await parseBody(req);
        const existing = await loadProfile(cfg, db, uid);
        const cleaned = cfg.cleanProfilePatch(body, existing);
        const profile = await saveProfile(cfg, db, uid, cleaned, deps.now());
        const changed = cfg.diagnosticFields.some((key) => JSON.stringify(existing[key] ?? null) !== JSON.stringify(profile[key] ?? null));
        let snapshot: JsonRecord | null = null;
        if (changed || body.run_diagnostic === true) snapshot = await runDiagnostic(cfg, deps, uid, profile, changed ? "profile_change" : "explicit");
        if (body.onboarding === true) await recordEventRow(cfg, deps, { event_name: "onboarding_completed", user_id: uid, metadata: {} });
        return json(200, { ok: true, profile, snapshot, diagnostic_rerun: !!snapshot });
      }

      if (method === "GET" && route === "/diagnostic") {
        const uid = await requirePremium();
        const [profile, snapshot] = await Promise.all([loadProfile(cfg, db, uid), loadLatestSnapshot(cfg, db, uid)]);
        return json(200, { profile, snapshot }, { "Cache-Control": "private, no-store" });
      }

      if (method === "POST" && (route === "/diagnostic/run" || route === "/recommendations/generate")) {
        const uid = await requirePremium();
        const profile = await loadProfile(cfg, db, uid);
        const snapshot = await runDiagnostic(cfg, deps, uid, profile, "explicit");
        return json(200, { ok: true, snapshot, recommendation: snapshot.recommendation_json });
      }

      if (method === "POST" && route === "/diagnostic/narrative") {
        const uid = await requirePremium();
        const snapshot = await loadLatestSnapshot(cfg, db, uid);
        if (!snapshot) throw new PlaybookError(409, "no_diagnostic", "Run the diagnostic first.");
        const metadata = isObject(snapshot.metadata) ? snapshot.metadata : {};
        const cached = isObject(metadata.ai_narrative) ? metadata.ai_narrative : null;
        if (cached && toText(cached.text, 10)) return json(200, { ok: true, narrative: cached, cached: true });
        const result = isObject(snapshot.recommendation_json) ? snapshot.recommendation_json : {};
        const { data, status } = await deps.ai(
          {
            systemPrompt:
              `You are a ${cfg.aiExamContext} study coach. You receive a computed diagnostic (JSON). ` +
              "Write a short, encouraging explanation of what it means and what to do this week. " +
              "Use ONLY numbers that appear in the JSON; never invent scores, percentages, hours, gains or dates. " +
              "If evidence is missing, say which test or practice would fill the gap. " +
              "Return strict JSON: {\"summary\": \"2-4 sentences\", \"this_week\": [\"up to 4 short actions\"]}.",
            userPayload: JSON.stringify({
              current: result.current,
              target: result.target,
              gap: result.gap,
              bottlenecks: Array.isArray(result.bottlenecks) ? (result.bottlenecks as unknown[]).slice(0, 6) : [],
              untested: result.untested,
              module_priorities: Array.isArray(result.module_priorities) ? (result.module_priorities as unknown[]).slice(0, 8) : [],
              plan_suggestion: isObject(result.plan_suggestion) ? { template_slug: result.plan_suggestion.template_slug, weeks_until_test: result.plan_suggestion.weeks_until_test } : null,
              data_quality: result.data_quality,
            }).slice(0, 20000),
            temperature: 0.3,
          },
          { summary: "", this_week: [] as string[] },
        );
        const summary = status === "ok" ? toText((data as JsonRecord).summary, 1200) : "";
        if (!summary) return json(200, { ok: false, ai_status: status === "ok" ? "failed" : status, code: "narrative_unavailable" });
        const actions = Array.isArray((data as JsonRecord).this_week) ? ((data as JsonRecord).this_week as unknown[]).map((a) => toText(a, 240)).filter(Boolean).slice(0, 4) : [];
        const narrative = { text: summary, this_week: actions, generated_at: deps.now().toISOString(), source: "ai_free_model" };
        must(await db.from(cfg.tables.snapshots).update({ metadata: { ...metadata, ai_narrative: narrative } }).eq("id", snapshot.id).eq("user_id", uid), "save narrative");
        return json(200, { ok: true, narrative, cached: false });
      }

      // ---- Dashboard ----
      if (method === "GET" && route === "/dashboard") {
        const uid = await requirePremium();
        const [profile, snapshot, myPlan, templates, progressResult, notesCount] = await Promise.all([
          loadProfile(cfg, db, uid),
          loadLatestSnapshot(cfg, db, uid),
          loadMyPlan(cfg, db, uid),
          loadTemplates(cfg, db),
          db.from(cfg.tables.sectionProgress).select("page_id, section_id").eq("user_id", uid).eq("product_id", cfg.playbookProductId).limit(2000),
          db.from(cfg.tables.notes).select("id", { count: "exact", head: true }).eq("user_id", uid).eq("product_id", cfg.playbookProductId),
        ]);
        const progressRows = rows(must(progressResult, "load progress"));
        const byPage: Record<string, number> = {};
        for (const row of progressRows) byPage[String(row.page_id)] = (byPage[String(row.page_id)] ?? 0) + 1;
        return json(200, {
          profile,
          diagnostic: snapshot,
          ...myPlan,
          plans: templates,
          sections_completed_by_page: byPage,
          notes_count: Number(notesCount.count ?? 0),
        }, { "Cache-Control": "private, no-store" });
      }

      // ---- Notes / highlights (premium to write, owner to read/delete) ----
      if (method === "GET" && route === "/notes") {
        const uid = await requirePremium();
        const notes = rows(must(await db.from(cfg.tables.notes).select("id, page_id, section_id, anchor_text, body, color, created_at, updated_at")
          .eq("user_id", uid).eq("product_id", cfg.playbookProductId).order("updated_at", { ascending: false }).limit(300), "load notes"));
        const pageIds = [...new Set(notes.map((n) => String(n.page_id)))];
        const pages = pageIds.length
          ? rows(must(await db.from(cfg.tables.pages).select("id, slug, title, module_key").in("id", pageIds), "load note pages"))
          : [];
        return json(200, {
          ok: true,
          notes: notes.map((n) => ({ ...n, page: pages.find((p) => String(p.id) === String(n.page_id)) ?? null })),
        }, { "Cache-Control": "private, no-store" });
      }

      if (method === "POST" && route === "/notes") {
        const uid = await requirePremium();
        const body = await parseBody(req, 8192);
        const slug = toText(body.page_slug, 160).toLowerCase();
        const page = isSlug(slug) ? await loadPageBySlug(cfg, db, slug) : null;
        if (!page) throw new PlaybookError(404, "not_found", "Page not found.");
        const anchor = toText(body.anchor_text, 1000);
        const noteBody = toText(body.body, 4000);
        if (!anchor && !noteBody) throw new PlaybookError(400, "invalid_field", "Select text or write a note first.");
        const sectionId = toText(body.section_id, 60);
        const countResult = await db.from(cfg.tables.notes).select("id", { count: "exact", head: true }).eq("user_id", uid).eq("product_id", cfg.playbookProductId);
        if (Number(countResult.count ?? 0) >= 1000) throw new PlaybookError(409, "notes_full", "You have reached 1,000 notes. Delete some to add more.");
        const note = must(await db.from(cfg.tables.notes).insert({
          user_id: uid,
          product_id: cfg.playbookProductId,
          page_id: page.id,
          section_id: sectionId && isUuid(sectionId) ? sectionId : null,
          anchor_text: anchor,
          body: noteBody,
          color: pickEnum(body.color, ["amber", "green", "blue", "pink"], "color") ?? "amber",
        }).select("id, page_id, section_id, anchor_text, body, color, created_at, updated_at").single(), "save note");
        await recordEventRow(cfg, deps, { event_name: "note_saved", user_id: uid, page_id: page.id, page_type: page.page_type, module_key: page.module_key, metadata: { highlight: !!anchor } });
        return json(200, { ok: true, note });
      }

      m = match(/^\/notes\/([^/]+)$/);
      if (m && (method === "DELETE" || method === "PATCH")) {
        const uid = requireUser();
        const id = decodeURIComponent(m[1]);
        if (!isUuid(id)) throw new PlaybookError(404, "not_found", "Note not found.");
        if (method === "DELETE") {
          must(await db.from(cfg.tables.notes).delete().eq("id", id).eq("user_id", uid), "delete note");
          return json(200, { ok: true });
        }
        await requirePremium();
        const body = await parseBody(req, 8192);
        const note = must(await db.from(cfg.tables.notes).update({ body: toText(body.body, 4000), updated_at: deps.now().toISOString() })
          .eq("id", id).eq("user_id", uid).select("id, page_id, section_id, anchor_text, body, color, created_at, updated_at").maybeSingle(), "update note");
        if (!note) throw new PlaybookError(404, "not_found", "Note not found.");
        return json(200, { ok: true, note });
      }

      throw new PlaybookError(404, "not_found", "Not found.");
    } catch (error) {
      if (error instanceof PlaybookError) {
        return json(error.status, { error: error.message, code: error.code, ...error.extra });
      }
      const detail = { route, method: req.method, message: error instanceof Error ? error.message : String(error) };
      if (deps) deps.log("error", "unhandled_error", detail);
      else console.error(JSON.stringify({ fn: cfg.functionName, event: "unhandled_error", ...detail }));
      return json(500, { error: "Something went wrong. Please try again.", code: "internal_error" });
    }
  };
