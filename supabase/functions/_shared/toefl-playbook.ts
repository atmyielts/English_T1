// Shared helpers for the toefl-playbook edge function and its admin counterpart.
// Mirrors `_shared/ielts-playbook.ts` so the editor and recommendation surfaces
// behave identically across exams, with TOEFL iBT context (4 skills:
// reading/listening/speaking/writing, 0-120 score scale, home edition +
// test centre delivery).

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-jwt",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

export const PLAYBOOK_PRODUCT_SLUG = "toefl-playbook";
export const PLAYBOOK_PRODUCT_ID_FALLBACK = "f9512c15-ec1c-4fcb-a5ec-a2c6ac3a020e";
export const SIMULATOR_PRODUCT_SLUG = "toefl-ibt-simulator";
export const SIMULATOR_PRODUCT_ID_FALLBACK = "b262ffa8-9912-4eba-93d7-58af3164d1cc";
export const PRACTICE_PRODUCT_SLUG = "toefl-practice";

export const TOEFL_SECTIONS = ["reading", "listening", "speaking", "writing"] as const;
export type ToeflSection = (typeof TOEFL_SECTIONS)[number];

export const MODULE_ORDER = [
  "format_overview",
  "scoring_engine",
  "skill_reading",
  "skill_listening",
  "skill_speaking",
  "skill_writing",
  "test_day_protocol",
  "result_strategy",
  "myths",
];

export type JsonRecord = Record<string, unknown>;

export const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

export const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};

export const toText = (value: unknown, maxLen = 320): string =>
  String(value ?? "").trim().slice(0, maxLen);

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

export const isObject = (value: unknown): value is JsonRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const parseBody = async (req: Request): Promise<JsonRecord> => {
  try {
    const body = await req.json();
    return isObject(body) ? body : {};
  } catch {
    return {};
  }
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
  return tail.startsWith("/") ? tail : tail ? `/${tail}` : "";
};

export type AuthResult = { token: string; userId: string };

export const authUser = async (sb: any, req: Request): Promise<AuthResult | null> => {
  const token = getBearerToken(req);
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return { token, userId: data.user.id };
};

// Resolve scope = product IDs + language ID. Called once per request.
export type PlaybookScope = {
  playbookProductId: string;
  simulatorProductId: string;
  practiceProductId: string;
  languageId: string | null;
};

const resolveProductIdBySlug = async (sb: any, slug: string): Promise<string | null> => {
  const { data } = await sb
    .from("products")
    .select("id, metadata")
    .or(`metadata->>slug.eq.${slug}`)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
};

const resolveLanguageId = async (sb: any): Promise<string | null> => {
  const { data } = await sb
    .from("languages")
    .select("id")
    .eq("code", "en")
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
};

export const resolveScope = async (sb: any): Promise<PlaybookScope> => {
  const [playbook, simulator, practice, languageId] = await Promise.all([
    resolveProductIdBySlug(sb, PLAYBOOK_PRODUCT_SLUG).catch(() => null),
    resolveProductIdBySlug(sb, SIMULATOR_PRODUCT_SLUG).catch(() => null),
    resolveProductIdBySlug(sb, PRACTICE_PRODUCT_SLUG).catch(() => null),
    resolveLanguageId(sb).catch(() => null),
  ]);
  return {
    playbookProductId: playbook ?? PLAYBOOK_PRODUCT_ID_FALLBACK,
    simulatorProductId: simulator ?? SIMULATOR_PRODUCT_ID_FALLBACK,
    practiceProductId: practice ?? "",
    languageId,
  };
};

// Premium access via access-effective edge function — same gating pattern as
// the IELTS Playbook so we don't have to re-implement entitlement logic.
export const hasPremiumAccess = async (
  supabaseUrl: string,
  supabaseAnonKey: string,
  userToken: string,
  productId: string,
): Promise<boolean> => {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/access-effective`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${userToken}`,
      },
    });
    if (!res.ok) return false;
    const payload = (await res.json()) as { effective_product_ids?: string[] };
    return Array.isArray(payload?.effective_product_ids)
      && payload.effective_product_ids.includes(productId);
  } catch {
    return false;
  }
};

// --- Domain ops ------------------------------------------------------------

type PageRow = {
  id: string;
  product_id: string;
  parent_page_id: string | null;
  page_type: string;
  module_key: string | null;
  slug: string;
  title: string;
  summary: string;
  status: string;
  visibility: string;
  locale_code: string;
  sort_order: number;
  published_at: string | null;
  metadata: JsonRecord | null;
};

export const listCatalog = async (sb: any, scope: PlaybookScope) => {
  const { data: pageRows } = await sb
    .from("toefl_playbook_pages")
    .select("id, parent_page_id, slug, module_key, title, summary, page_type, sort_order, visibility, metadata, published_at")
    .eq("product_id", scope.playbookProductId)
    .eq("locale_code", "en")
    .eq("status", "published")
    .order("sort_order", { ascending: true });

  const allPages = (pageRows ?? []) as Array<PageRow & { parent_page_id: string | null }>;
  const modules = allPages
    .filter((p) => p.page_type === "module" && p.parent_page_id === null)
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      module_key: p.module_key,
      title: p.title,
      summary: p.summary,
      sort_order: p.sort_order,
      metadata: isObject(p.metadata) ? p.metadata : {},
      published_at: p.published_at,
    }));

  const premium_guides = allPages
    .filter((p) => p.visibility === "premium")
    .map((p) => ({
      id: p.id,
      parent_page_id: p.parent_page_id,
      module_key: p.module_key,
      slug: p.slug,
      title: p.title,
      summary: p.summary,
      page_type: p.page_type,
      published_at: p.published_at,
    }));

  return {
    product_slug: PLAYBOOK_PRODUCT_SLUG,
    modules,
    premium_guides,
  };
};

export const loadPageDetail = async (sb: any, scope: PlaybookScope, slug: string): Promise<JsonRecord | null> => {
  const { data: pageData } = await sb
    .from("toefl_playbook_pages")
    .select("*")
    .eq("product_id", scope.playbookProductId)
    .eq("locale_code", "en")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (!pageData) return null;
  const page = pageData as PageRow;

  const [{ data: sectionData }, { data: childPages }, { data: pageSources }] = await Promise.all([
    sb
      .from("toefl_playbook_page_sections")
      .select("*")
      .eq("page_id", page.id)
      .eq("status", "published")
      .order("sort_order", { ascending: true }),
    sb
      .from("toefl_playbook_pages")
      .select("id, parent_page_id, page_type, module_key, slug, title, summary, visibility, sort_order, published_at, metadata")
      .eq("parent_page_id", page.id)
      .eq("status", "published")
      .order("sort_order", { ascending: true }),
    sb
      .from("toefl_playbook_page_sources")
      .select("sort_order, citation_note, is_primary, source:toefl_playbook_sources(*)")
      .eq("page_id", page.id)
      .order("sort_order", { ascending: true }),
  ]);

  return {
    page: {
      ...page,
      metadata: isObject(page.metadata) ? page.metadata : {},
    },
    sections: (Array.isArray(sectionData) ? sectionData : []).map((row: any) => ({
      ...row,
      content: isObject(row.content) ? row.content : {},
      metadata: isObject(row.metadata) ? row.metadata : {},
    })),
    child_pages: (Array.isArray(childPages) ? childPages : []).map((row: any) => ({
      ...row,
      metadata: isObject(row.metadata) ? row.metadata : {},
    })),
    sources: (Array.isArray(pageSources) ? pageSources : []).map((row: any) => ({
      sort_order: Number(row.sort_order ?? 0),
      citation_note: row.citation_note ? String(row.citation_note) : null,
      is_primary: Boolean(row.is_primary),
      source: row.source && typeof row.source === "object"
        ? { ...row.source, metadata: isObject(row.source.metadata) ? row.source.metadata : {} }
        : null,
    })),
  };
};

// --- User profile + recommendations ----------------------------------------

export const loadProfile = async (sb: any, scope: PlaybookScope, userId: string): Promise<JsonRecord> => {
  const { data } = await sb
    .from("toefl_playbook_user_profiles")
    .select("*")
    .eq("user_id", userId)
    .eq("product_id", scope.playbookProductId)
    .maybeSingle();
  if (!data) return {};
  return data as JsonRecord;
};

export const saveProfile = async (
  sb: any,
  scope: PlaybookScope,
  userId: string,
  patch: JsonRecord,
): Promise<JsonRecord> => {
  const allowed = [
    "target_total_score",
    "current_score_or_estimate",
    "deadline_date",
    "weakest_section",
    "purpose",
    "destination_country_code",
    "test_market_country_code",
    "preferred_delivery_mode",
    "prep_intensity",
    "metadata",
  ];
  const cleaned: JsonRecord = {};
  for (const key of allowed) {
    if (key in patch) cleaned[key] = (patch as JsonRecord)[key];
  }
  const row = {
    user_id: userId,
    product_id: scope.playbookProductId,
    ...cleaned,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await sb
    .from("toefl_playbook_user_profiles")
    .upsert(row, { onConflict: "user_id,product_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as JsonRecord;
};

export const loadPlanTemplates = async (sb: any, scope: PlaybookScope) => {
  const { data } = await sb
    .from("toefl_playbook_plan_templates")
    .select("*")
    .eq("product_id", scope.playbookProductId)
    .eq("status", "published")
    .order("duration_days", { ascending: true });
  return Array.isArray(data) ? (data as Array<JsonRecord>) : [];
};

export const loadCurrentRecommendation = async (sb: any, scope: PlaybookScope, userId: string): Promise<JsonRecord | null> => {
  const { data } = await sb
    .from("toefl_playbook_recommendation_snapshots")
    .select("*")
    .eq("user_id", userId)
    .eq("product_id", scope.playbookProductId)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as JsonRecord | null) ?? null;
};

// Heuristic SAT plan recommendation. Reads the user's profile and the latest
// simulator outcome (if any) and picks a plan template. Intentionally simple
// in v1 — sophistication comes via the AI synthesise endpoint (later).
export const generateRecommendation = async (
  sb: any,
  scope: PlaybookScope,
  userId: string,
  profile: JsonRecord,
): Promise<JsonRecord> => {
  const target = Number(profile.target_total_score ?? 90);
  const current = profile.current_score_or_estimate != null ? Number(profile.current_score_or_estimate) : null;
  const gap = current != null ? Math.max(0, target - current) : null;
  const deadline = profile.deadline_date ? new Date(String(profile.deadline_date)) : null;
  const daysToTest = deadline ? Math.max(0, Math.round((deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : null;

  // Pull latest simulator outcome.
  const { data: outcome } = await sb
    .from("exam_outcomes")
    .select("id, total_score, skill_breakdown, computed_at")
    .eq("user_id", userId)
    .eq("product_id", scope.simulatorProductId)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const simulatorScore = outcome && typeof outcome === "object" ? Number((outcome as JsonRecord).total_score) || null : null;
  const sectionBreakdown = outcome && typeof outcome === "object" && (outcome as JsonRecord).skill_breakdown
    ? (outcome as JsonRecord).skill_breakdown as JsonRecord
    : null;

  // Pick plan type by deadline + gap.
  let planType: "crash" | "balanced" | "improvement" | "skill_recovery" = "balanced";
  if (daysToTest != null) {
    if (daysToTest <= 21) planType = "crash";
    else if (daysToTest > 90) planType = "improvement";
  }
  // TOEFL total is 0-120; a 15+ point gap signals a longer improvement track.
  if (gap != null && gap >= 15) planType = "improvement";

  const templates = await loadPlanTemplates(sb, scope);
  const plan = templates.find((t) => String(t.plan_type) === planType) ?? templates[0] ?? null;

  // Recommended module order: lead with weakest section.
  const weakestSection = String(profile.weakest_section ?? "").trim() || (sectionBreakdown
    ? Object.entries(sectionBreakdown).sort(([, a], [, b]) => Number(a) - Number(b))[0]?.[0] ?? null
    : null);
  const moduleOrder: Array<JsonRecord> = MODULE_ORDER.map((slug) => ({
    slug,
    reason: weakestSection && slug === `skill_${weakestSection}`
      ? "Your weakest skill — prioritise this."
      : "Foundational coverage.",
  }));

  return {
    decision: {
      selected_track: planType,
      recommended_delivery_mode: String(profile.preferred_delivery_mode ?? "home_edition"),
      one_skill_retake_eligible: false,
    },
    planning: {
      deadline_bucket: daysToTest == null ? "no_date" : daysToTest <= 21 ? "imminent" : daysToTest <= 90 ? "near" : "long_runway",
      weakest_section: weakestSection,
      realistic_timeline: daysToTest != null
        ? `~${Math.max(1, Math.round(daysToTest / 7))} weeks until your test date.`
        : "Set a target date to get pace recommendations.",
      likely_bottlenecks: [],
    },
    plan_template: plan
      ? {
          slug: plan.slug,
          title: plan.title,
          summary: plan.summary,
          duration_days: plan.duration_days,
          intensity: plan.intensity,
          focus_section: plan.focus_section,
          plan_type: plan.plan_type,
          score_min: plan.score_min,
          score_max: plan.score_max,
        }
      : null,
    outcome_summary: {
      current_total_score: current,
      target_total_score: target,
      score_gap: gap,
      simulator_total_score: simulatorScore,
    },
    evidence_summary: {
      simulator: {
        connected: simulatorScore != null,
        total_score: simulatorScore,
        latest_computed_at: outcome && typeof outcome === "object" ? (outcome as JsonRecord).computed_at : null,
      },
    },
    recommended_module_order: moduleOrder,
  };
};

export const persistRecommendation = async (
  sb: any,
  scope: PlaybookScope,
  userId: string,
  profile: JsonRecord,
  recommendation: JsonRecord,
): Promise<JsonRecord> => {
  // Mark prior snapshots as not current.
  await sb
    .from("toefl_playbook_recommendation_snapshots")
    .update({ is_current: false })
    .eq("user_id", userId)
    .eq("product_id", scope.playbookProductId)
    .eq("is_current", true);

  const slug = `${String(profile.purpose ?? "university")}-${String(((recommendation.decision as JsonRecord | undefined)?.selected_track) ?? "balanced")}`;

  const { data, error } = await sb
    .from("toefl_playbook_recommendation_snapshots")
    .insert({
      user_id: userId,
      product_id: scope.playbookProductId,
      snapshot_type: "recommendation",
      recommendation_slug: slug,
      recommendation_json: recommendation,
      inputs_json: { profile_snapshot: profile },
      derived_context: { generated_at: new Date().toISOString() },
      is_current: true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as JsonRecord;
};

// --- Dashboard payload -----------------------------------------------------

export const buildDashboardPayload = async (sb: any, scope: PlaybookScope, userId: string): Promise<JsonRecord> => {
  const [profile, recommendation, plans] = await Promise.all([
    loadProfile(sb, scope, userId),
    loadCurrentRecommendation(sb, scope, userId),
    loadPlanTemplates(sb, scope),
  ]);

  return {
    profile,
    recommendation,
    plans: plans.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      summary: p.summary,
      plan_type: p.plan_type,
      duration_days: p.duration_days,
      intensity: p.intensity,
      focus_section: p.focus_section,
    })),
  };
};

// --- Event tracking --------------------------------------------------------

const ALLOWED_EVENT_NAMES = new Set([
  "page_view",
  "premium_gate_seen",
  "premium_gate_clicked",
  "onboarding_completed",
  "recommendation_generated",
  "simulator_referral_opened",
  "practice_referral_opened",
  "resource_clicked",
  "official_source_clicked",
]);

export const recordEvent = async (
  sb: any,
  scope: PlaybookScope,
  body: JsonRecord,
  userId: string | null,
): Promise<void> => {
  const eventName = toText(body.event_name, 64);
  if (!ALLOWED_EVENT_NAMES.has(eventName)) return;

  await sb.from("toefl_playbook_events").insert({
    user_id: userId,
    product_id: scope.playbookProductId,
    page_id: toText(body.page_id, 60) || null,
    event_name: eventName,
    page_type: toNullableText(body.page_type, 40),
    module_key: toNullableText(body.module_key, 80),
    market_country_code: toNullableText(body.market_country_code, 16),
    metadata: isObject(body.metadata) ? body.metadata : {},
  });
};
