type JsonRecord = Record<string, unknown>;

export type AuthedContext = {
  userId: string;
  token: string;
  email: string | null;
};

export type PlaybookScope = {
  playbookProductId: string;
  simulatorProductId: string;
  practiceProductId: string;
  languageCode: string;
};

export type PlaybookProfileRow = {
  user_id: string;
  product_id: string;
  target_overall_band: number;
  current_band_or_estimate: number | null;
  deadline_date: string | null;
  weakest_skill: string | null;
  purpose: string;
  destination_country_code: string | null;
  test_market_country_code: string | null;
  preferred_delivery_mode: string | null;
  provider_key: string;
  program_requires_academic: boolean;
  metadata: JsonRecord;
  created_at: string;
  updated_at: string;
};

export type MarketGuidanceRow = {
  id: string;
  country_code: string;
  provider_key: string;
  summary: string;
  status: string;
  ukvi_available: boolean;
  computer_available: boolean;
  writing_on_paper_available: boolean;
  one_skill_retake_available: boolean;
  result_timing_note: string | null;
  booking_url: string | null;
  verified_at: string | null;
  published_at: string | null;
  metadata: JsonRecord;
};

export type PlanTemplateRow = {
  id: string;
  slug: string;
  plan_type: "crash" | "balanced" | "improvement" | "skill_recovery";
  title: string;
  summary: string;
  duration_days: number;
  band_min: number;
  band_max: number;
  focus_skill: string | null;
  intensity: string;
  schedule_json: JsonRecord;
  metadata: JsonRecord;
};

export type PageRow = {
  id: string;
  parent_page_id: string | null;
  page_type: string;
  module_key: string | null;
  slug: string;
  title: string;
  summary: string;
  status: string;
  visibility: string;
  locale_code: string;
  country_scope: string[];
  variant_scope: JsonRecord;
  sort_order: number;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  metadata: JsonRecord;
};

export type PageSectionRow = {
  id: string;
  page_id: string;
  block_type: string;
  heading: string | null;
  status: string;
  sort_order: number;
  content: JsonRecord;
  metadata: JsonRecord;
};

export type SourceRow = {
  id: string;
  source_type: string;
  provider_key: string | null;
  title: string;
  url: string | null;
  summary: string;
  status: string;
  verified_at: string | null;
  published_at: string | null;
  last_checked_at: string | null;
  metadata: JsonRecord;
};

export type OutcomeRow = {
  id: string;
  session_id: string;
  overall_band: number | null;
  section_scores: JsonRecord;
  computed_at: string;
};

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-jwt",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

export const PLAYBOOK_PRODUCT_SLUG = "ielts-playbook";
export const PLAYBOOK_PRODUCT_ID_FALLBACK = "9de6c9e7-31df-4d1d-9574-1f8f84a53b54";
export const SIMULATOR_PRODUCT_SLUG = "ielts-academic-simulator";
export const SIMULATOR_PRODUCT_ID_FALLBACK = "ead05eae-aa97-4bda-a07c-51e5dbb062c0";
export const PRACTICE_PRODUCT_SLUG = "ielts-practice";
export const PRACTICE_PRODUCT_ID_FALLBACK = "a74195fd-b4f3-4fd4-93bf-c807e42250c6";
export const PLAYBOOK_DEFAULT_PROVIDER = "british-council";
export const MODULE_ORDER = [
  "essentials",
  "test-types-booking",
  "listening-master-guide",
  "reading-master-guide",
  "writing-master-guide",
  "speaking-master-guide",
  "band-scores-improvement-map",
  "intricacies-traps-myths",
  "updates-policy",
  "study-plans",
  "test-day-guide",
  "retake-results-strategy",
];

export const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

export const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

export const toText = (value: unknown, maxLen = 320): string => String(value ?? "").trim().slice(0, maxLen);
export const toNullableText = (value: unknown, maxLen = 320): string | null => {
  const clean = toText(value, maxLen);
  return clean.length > 0 ? clean : null;
};

export const toNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const isObject = (value: unknown): value is JsonRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
export const roundTo = (value: number, precision = 2): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

export const parseBody = async (req: Request): Promise<JsonRecord> => {
  try {
    const parsed = await req.json();
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const getBearerToken = (req: Request): string | null => {
  const auth = req.headers.get("Authorization") ?? "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  if (auth.trim()) return auth.trim();
  const fallback = req.headers.get("x-user-jwt") ?? "";
  return fallback.trim() || null;
};

export const extractRoute = (url: URL, marker: string): string => {
  const idx = url.pathname.indexOf(marker);
  if (idx < 0) return "";
  const tail = url.pathname.slice(idx + marker.length);
  return tail.startsWith("/") ? tail : tail ? `/${tail}` : "";
};

const resolveProductIdBySlug = async (sb: any, slug: string): Promise<string | null> => {
  const { data, error } = await sb
    .from("products")
    .select("id")
    .eq("metadata->>slug", slug)
    .maybeSingle();
  if (error) return null;
  return data?.id ? String((data as any).id) : null;
};

export const authUser = async (sb: any, req: Request): Promise<AuthedContext | null> => {
  const token = getBearerToken(req);
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return { userId: data.user.id, token, email: data.user.email ?? null };
};

export const resolveScope = async (sb: any): Promise<PlaybookScope> => ({
  playbookProductId: (await resolveProductIdBySlug(sb, PLAYBOOK_PRODUCT_SLUG)) ?? PLAYBOOK_PRODUCT_ID_FALLBACK,
  simulatorProductId: (await resolveProductIdBySlug(sb, SIMULATOR_PRODUCT_SLUG)) ?? SIMULATOR_PRODUCT_ID_FALLBACK,
  practiceProductId: (await resolveProductIdBySlug(sb, PRACTICE_PRODUCT_SLUG)) ?? PRACTICE_PRODUCT_ID_FALLBACK,
  languageCode: "en",
});

export const resolveEffectiveProductIds = async (
  supabaseUrl: string,
  anonKey: string,
  token: string,
  productId?: string,
): Promise<string[]> => {
  const qs = new URLSearchParams();
  if (productId) qs.set("product_id", productId);
  const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/access-effective${qs.toString() ? `?${qs.toString()}` : ""}`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) return [];
  const body = await res.json().catch(() => null);
  if (!body || !Array.isArray(body.effective_product_ids)) return [];
  return body.effective_product_ids.map((entry: unknown) => String(entry ?? "")).filter(Boolean);
};

export const hasPremiumAccess = async (
  supabaseUrl: string,
  anonKey: string,
  token: string,
  productId: string,
): Promise<boolean> => {
  const effectiveIds = await resolveEffectiveProductIds(supabaseUrl, anonKey, token, productId);
  return effectiveIds.includes(productId);
};

export const defaultProfile = (scope: PlaybookScope, userId: string): PlaybookProfileRow => ({
  user_id: userId,
  product_id: scope.playbookProductId,
  target_overall_band: 6.5,
  current_band_or_estimate: null,
  deadline_date: null,
  weakest_skill: null,
  purpose: "study",
  destination_country_code: null,
  test_market_country_code: "GLOBAL",
  preferred_delivery_mode: null,
  provider_key: PLAYBOOK_DEFAULT_PROVIDER,
  program_requires_academic: false,
  metadata: {},
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
});

export const loadProfile = async (sb: any, scope: PlaybookScope, userId: string): Promise<PlaybookProfileRow> => {
  const { data } = await sb
    .from("ielts_playbook_user_profiles")
    .select("*")
    .eq("user_id", userId)
    .eq("product_id", scope.playbookProductId)
    .maybeSingle();
  if (!data) return defaultProfile(scope, userId);
  return {
    ...(data as PlaybookProfileRow),
    metadata: isObject((data as any).metadata) ? ((data as any).metadata as JsonRecord) : {},
  };
};

export const saveProfile = async (
  sb: any,
  scope: PlaybookScope,
  userId: string,
  body: JsonRecord,
): Promise<PlaybookProfileRow> => {
  const current = await loadProfile(sb, scope, userId);
  const targetOverallBand = clamp(roundTo(toNumber(body.target_overall_band) ?? current.target_overall_band, 1), 0, 9);
  const currentBand = body.current_band_or_estimate === null
    ? null
    : (() => {
      const value = toNumber(body.current_band_or_estimate);
      return value == null ? current.current_band_or_estimate : clamp(roundTo(value, 1), 0, 9);
    })();

  const weakestSkill = ["listening", "reading", "writing", "speaking"].includes(toText(body.weakest_skill, 32).toLowerCase())
    ? toText(body.weakest_skill, 32).toLowerCase()
    : current.weakest_skill;

  const purpose = ["study", "work", "migration", "job", "visa"].includes(toText(body.purpose, 32).toLowerCase())
    ? toText(body.purpose, 32).toLowerCase()
    : current.purpose;

  const row = {
    user_id: userId,
    product_id: scope.playbookProductId,
    target_overall_band: targetOverallBand,
    current_band_or_estimate: currentBand,
    deadline_date: body.deadline_date === null ? null : (toNullableText(body.deadline_date, 32) ?? current.deadline_date),
    weakest_skill: weakestSkill,
    purpose,
    destination_country_code: body.destination_country_code === null ? null : (toNullableText(body.destination_country_code, 12) ?? current.destination_country_code),
    test_market_country_code: body.test_market_country_code === null ? null : (toNullableText(body.test_market_country_code, 12) ?? current.test_market_country_code ?? "GLOBAL"),
    preferred_delivery_mode: body.preferred_delivery_mode === null
      ? null
      : (["computer", "writing_on_paper", "paper", "unsure"].includes(toText(body.preferred_delivery_mode, 32).toLowerCase())
        ? toText(body.preferred_delivery_mode, 32).toLowerCase()
        : current.preferred_delivery_mode),
    provider_key: toNullableText(body.provider_key, 64) ?? current.provider_key ?? PLAYBOOK_DEFAULT_PROVIDER,
    program_requires_academic: typeof body.program_requires_academic === "boolean"
      ? body.program_requires_academic
      : current.program_requires_academic,
    metadata: isObject(body.metadata) ? { ...(current.metadata ?? {}), ...body.metadata } : current.metadata,
  };

  const { data, error } = await sb
    .from("ielts_playbook_user_profiles")
    .upsert(row, { onConflict: "user_id,product_id" })
    .select("*")
    .maybeSingle();

  if (error || !data) throw new Error("Failed to save onboarding profile");
  return data as PlaybookProfileRow;
};

export const loadRules = async (sb: any, scope: PlaybookScope): Promise<Map<string, JsonRecord>> => {
  const { data } = await sb
    .from("ielts_playbook_rule_sets")
    .select("rule_key,config")
    .eq("product_id", scope.playbookProductId)
    .eq("status", "active")
    .order("sort_order", { ascending: true });

  const out = new Map<string, JsonRecord>();
  for (const row of Array.isArray(data) ? data : []) {
    const key = toText((row as any).rule_key, 120);
    if (!key) continue;
    out.set(key, isObject((row as any).config) ? ((row as any).config as JsonRecord) : {});
  }
  return out;
};

export const loadLatestOutcome = async (sb: any, scope: PlaybookScope, userId: string): Promise<OutcomeRow | null> => {
  const { data } = await sb
    .from("exam_outcomes")
    .select("id,session_id,overall_band,section_scores,computed_at")
    .eq("user_id", userId)
    .eq("product_id", scope.simulatorProductId)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    ...(data as OutcomeRow),
    section_scores: isObject((data as any).section_scores) ? ((data as any).section_scores as JsonRecord) : {},
  };
};

export const extractSectionBands = (outcome: OutcomeRow | null): Record<string, number> => {
  const out: Record<string, number> = {};
  const sectionScores = isObject(outcome?.section_scores) ? (outcome?.section_scores as JsonRecord) : {};
  for (const value of Object.values(sectionScores)) {
    if (!isObject(value)) continue;
    const sectionType = toText(value.type, 24).toLowerCase();
    const band = toNumber(value.band);
    if (!sectionType || band == null) continue;
    out[sectionType] = band;
  }
  return out;
};

export const resolveMarketGuidance = async (
  sb: any,
  scope: PlaybookScope,
  countryCode: string | null | undefined,
  providerKey: string | null | undefined,
): Promise<MarketGuidanceRow | null> => {
  const provider = providerKey?.trim() || PLAYBOOK_DEFAULT_PROVIDER;
  const requestedCountry = countryCode?.trim() || "GLOBAL";
  const candidates = Array.from(new Set([requestedCountry, "GLOBAL"]));

  const { data } = await sb
    .from("ielts_playbook_market_guidance")
    .select("*")
    .eq("product_id", scope.playbookProductId)
    .eq("provider_key", provider)
    .eq("status", "published")
    .in("country_code", candidates)
    .order("country_code", { ascending: false });

  if (!Array.isArray(data) || data.length === 0) return null;
  const exact = data.find((row: any) => String(row.country_code) === requestedCountry);
  const row = (exact ?? data[0]) as MarketGuidanceRow;
  return { ...row, metadata: isObject((row as any).metadata) ? ((row as any).metadata as JsonRecord) : {} };
};

export const loadPlanTemplates = async (sb: any, scope: PlaybookScope): Promise<PlanTemplateRow[]> => {
  const { data } = await sb
    .from("ielts_playbook_plan_templates")
    .select("*")
    .eq("product_id", scope.playbookProductId)
    .eq("status", "published")
    .order("duration_days", { ascending: true });
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    ...(row as PlanTemplateRow),
    schedule_json: isObject(row.schedule_json) ? row.schedule_json : {},
    metadata: isObject(row.metadata) ? row.metadata : {},
  }));
};

export const pickDeadlineBucket = (rules: Map<string, JsonRecord>, deadlineDate: string | null): "crash" | "balanced" | "improvement" | "extended" => {
  if (!deadlineDate) return "improvement";
  const diff = Math.max(0, Math.ceil((Date.parse(deadlineDate) - Date.now()) / (1000 * 60 * 60 * 24)));
  const config = rules.get("deadline_bucket") ?? {};
  const crashMax = Math.max(1, Math.floor(toNumber(config.crash_max_days) ?? 14));
  const balancedMax = Math.max(crashMax + 1, Math.floor(toNumber(config.balanced_max_days) ?? 35));
  const improvementMax = Math.max(balancedMax + 1, Math.floor(toNumber(config.improvement_max_days) ?? 84));
  if (diff <= crashMax) return "crash";
  if (diff <= balancedMax) return "balanced";
  if (diff <= improvementMax) return "improvement";
  return "extended";
};

export const resolveTrack = (rules: Map<string, JsonRecord>, profile: PlaybookProfileRow): "academic" | "general" => {
  if (profile.program_requires_academic) return "academic";
  const purposeRule = rules.get("purpose_default_track") ?? {};
  const fromRule = toText(purposeRule[profile.purpose], 24).toLowerCase();
  return fromRule === "academic" ? "academic" : "general";
};

export const resolveWeakestSkill = (
  profile: PlaybookProfileRow,
  sectionBands: Record<string, number>,
): string => {
  const candidates = ["listening", "reading", "writing", "speaking"];
  const scored = candidates
    .map((skill) => ({ skill, band: sectionBands[skill] }))
    .filter((entry) => typeof entry.band === "number");

  if (scored.length > 0) {
    scored.sort((a, b) => a.band - b.band || a.skill.localeCompare(b.skill));
    return scored[0].skill;
  }

  if (profile.weakest_skill && candidates.includes(profile.weakest_skill)) return profile.weakest_skill;
  return "writing";
};

export const resolveDeliveryMode = (
  rules: Map<string, JsonRecord>,
  profile: PlaybookProfileRow,
  market: MarketGuidanceRow | null,
): string => {
  const configuredDefault = toText(rules.get("delivery_mode_preference")?.default_mode, 32).toLowerCase() || "computer";
  const preferred = toText(profile.preferred_delivery_mode, 32).toLowerCase();

  if (preferred === "writing_on_paper" && market?.writing_on_paper_available) return "writing_on_paper";
  if (preferred === "paper" && market?.writing_on_paper_available) return "writing_on_paper";
  if (preferred === "computer" && (market?.computer_available ?? true)) return "computer";
  if (market?.writing_on_paper_available && configuredDefault === "writing_on_paper") return "writing_on_paper";
  return market?.computer_available === false && market?.writing_on_paper_available ? "writing_on_paper" : "computer";
};

const pickTemplate = (
  templates: PlanTemplateRow[],
  bucket: "crash" | "balanced" | "improvement" | "extended",
  weakestSkill: string,
): PlanTemplateRow | null => {
  if (bucket !== "crash" && bucket !== "balanced" && weakestSkill === "writing") {
    const writingRecovery = templates.find((row) => row.plan_type === "skill_recovery" && row.focus_skill === "writing");
    if (writingRecovery) return writingRecovery;
  }

  const slugMap: Record<string, string> = {
    crash: "crash-14",
    balanced: "balanced-28",
    improvement: "improvement-56",
    extended: "extended-84",
  };
  return templates.find((row) => row.slug === slugMap[bucket]) ?? templates[0] ?? null;
};

const moduleForSkill = (skill: string): string => {
  if (skill === "listening") return "listening-master-guide";
  if (skill === "reading") return "reading-master-guide";
  if (skill === "writing") return "writing-master-guide";
  return "speaking-master-guide";
};

const buildPriorityModules = (weakestSkill: string, bucket: string): Array<{ slug: string; reason: string }> => {
  const modules: Array<{ slug: string; reason: string }> = [
    { slug: moduleForSkill(weakestSkill), reason: `Primary repair should start with ${weakestSkill}.` },
    { slug: "band-scores-improvement-map", reason: "Use the band map to identify what is actually holding the score down." },
    { slug: "intricacies-traps-myths", reason: "Remove common IELTS mistakes before adding more practice volume." },
    { slug: "study-plans", reason: `Use a ${bucket} planning frame so the routine matches the deadline.` },
  ];

  if (weakestSkill !== "writing") {
    modules.push({ slug: "writing-master-guide", reason: "Writing often becomes the second hidden bottleneck even when another skill feels weaker." });
  }

  modules.push({ slug: "test-day-guide", reason: "Keep logistics and panic management out of the score loss equation." });
  return modules.filter((entry, index, arr) => arr.findIndex((other) => other.slug === entry.slug) === index);
};

const buildLikelyBottlenecks = (weakestSkill: string, track: string, bandGap: number): string[] => {
  const items = [
    `Score progress will probably stay uneven across skills while ${weakestSkill} is lagging.`,
    weakestSkill === "writing"
      ? "Task response and weak development will usually hurt more than a few isolated grammar mistakes."
      : `Raw English ability will not be enough unless ${weakestSkill} execution becomes exam-specific and repeatable.`,
    track === "general"
      ? "Do not assume General Training is easy; timing and task response still punish weak habits."
      : "Academic task demands stay manageable only when structure and paraphrase recognition are deliberate.",
  ];

  if (bandGap >= 1) items.push("A full-band jump usually needs repeated feedback loops, not just more untimed practice.");
  return items;
};

const buildTimelineAssessment = (bucket: string, bandGap: number): string => {
  if (bucket === "crash") {
    return bandGap <= 0.5
      ? "The timeline is tight but realistic if execution errors are the main problem."
      : "The timeline is aggressive; expect score stabilization before major band movement.";
  }
  if (bucket === "balanced") {
    return bandGap <= 1
      ? "This is a realistic window for measurable improvement if practice stays focused."
      : "The goal is possible, but improvement has to be highly targeted and consistent.";
  }
  return bandGap <= 1.5
    ? "The timeline supports solid improvement and repeated diagnostic resets."
    : "The timeline is workable, but the gap suggests a longer feedback cycle may still be needed.";
};

export const generateRecommendation = async (
  sb: any,
  scope: PlaybookScope,
  userId: string,
  profile: PlaybookProfileRow,
): Promise<JsonRecord> => {
  const [rules, templates, outcome, market] = await Promise.all([
    loadRules(sb, scope),
    loadPlanTemplates(sb, scope),
    loadLatestOutcome(sb, scope, userId),
    resolveMarketGuidance(sb, scope, profile.test_market_country_code, profile.provider_key),
  ]);

  const sectionBands = extractSectionBands(outcome);
  const weakestSkill = resolveWeakestSkill(profile, sectionBands);
  const currentOverallBand = outcome?.overall_band ?? profile.current_band_or_estimate ?? null;
  const bandGap = currentOverallBand == null ? Math.max(0, profile.target_overall_band - 6) : Math.max(0, profile.target_overall_band - currentOverallBand);
  const bucket = pickDeadlineBucket(rules, profile.deadline_date);
  const track = resolveTrack(rules, profile);
  const deliveryMode = resolveDeliveryMode(rules, profile, market);
  const template = pickTemplate(templates, bucket, weakestSkill);
  const ukviNeeded = profile.purpose === "visa" && (profile.destination_country_code ?? "").toUpperCase() === "GB";
  const oneSkillRetakeRule = rules.get("one_skill_retake_eligibility") ?? {};
  const osrWindowDays = Math.max(1, Math.floor(toNumber(oneSkillRetakeRule.window_days) ?? 60));
  const sectionEntries = Object.entries(sectionBands).sort((a, b) => a[1] - b[1]);
  const blockerCount = sectionEntries.length > 0 && currentOverallBand != null
    ? sectionEntries.filter(([, band]) => band + 0.49 < profile.target_overall_band).length
    : 0;
  const osrEligible = blockerCount === 1 && Boolean(market?.one_skill_retake_available);

  const templateSchedule = isObject(template?.schedule_json) ? (template?.schedule_json as JsonRecord) : {};
  const dailyRoutine = Array.isArray(templateSchedule.daily_routine)
    ? templateSchedule.daily_routine.map((entry) => String(entry))
    : ["Target weakest skill first", "Run one timed task or drill", "Log mistakes and next actions"];
  const weeklyRoutine = Array.isArray(templateSchedule.weekly_rhythm)
    ? templateSchedule.weekly_rhythm.map((entry) => String(entry))
    : ["1 diagnostic review", "3-4 focused skill sessions", "1 full or section-level timed simulation"];

  return {
    generated_at: new Date().toISOString(),
    profile,
    scope: {
      playbook_product_id: scope.playbookProductId,
      simulator_product_id: scope.simulatorProductId,
      practice_product_id: scope.practiceProductId,
    },
    outcome_summary: {
      latest_exam_outcome_id: outcome?.id ?? null,
      latest_session_id: outcome?.session_id ?? null,
      latest_computed_at: outcome?.computed_at ?? null,
      current_overall_band: currentOverallBand,
      section_bands: sectionBands,
      used_simulator_outcome: Boolean(outcome),
    },
    decision: {
      selected_track: track,
      ukvi_needed: ukviNeeded,
      recommended_delivery_mode: deliveryMode,
      one_skill_retake_eligible: osrEligible,
      one_skill_retake_window_days: osrWindowDays,
      market_guidance_id: market?.id ?? null,
    },
    planning: {
      deadline_bucket: bucket,
      band_gap: roundTo(bandGap, 1),
      weakest_skill: weakestSkill,
      likely_bottlenecks: buildLikelyBottlenecks(weakestSkill, track, bandGap),
      realistic_timeline: buildTimelineAssessment(bucket, bandGap),
    },
    recommended_module_order: buildPriorityModules(weakestSkill, bucket),
    plan_template: template
      ? {
        id: template.id,
        slug: template.slug,
        title: template.title,
        summary: template.summary,
        duration_days: template.duration_days,
        intensity: template.intensity,
        schedule_json: template.schedule_json,
      }
      : null,
    daily_routine: dailyRoutine,
    weekly_routine: weeklyRoutine,
    simulator_cta: {
      label: "Run a scored simulator session",
      url: `https://ielts.schood.online/?source=playbook&target=${encodeURIComponent(String(profile.target_overall_band))}&skill=${encodeURIComponent(weakestSkill)}`,
    },
    practice_cta: {
      label: "Open targeted practice",
      url: `https://practice.ielts.schood.online/dashboard?source=playbook&weak_skill=${encodeURIComponent(weakestSkill)}`,
    },
    post_result_strategy: {
      recommended_path: osrEligible ? "one_skill_retake" : "full_retake",
      rationale: osrEligible
        ? "Exactly one skill is acting as the blocker and the current market guidance supports One Skill Retake."
        : "A broader retake path is safer because either multiple skills are blocking the goal or One Skill Retake is not supported in the selected market.",
      eor_note: "Enquiry on Results should be treated as informational only, not as guaranteed score movement.",
    },
    market_guidance: market,
  };
};

export const persistRecommendation = async (
  sb: any,
  scope: PlaybookScope,
  userId: string,
  profile: PlaybookProfileRow,
  recommendation: JsonRecord,
): Promise<{ id: string; created_at: string }> => {
  await sb
    .from("ielts_playbook_recommendation_snapshots")
    .update({ is_current: false })
    .eq("user_id", userId)
    .eq("product_id", scope.playbookProductId)
    .eq("is_current", true);

  const planTemplate = isObject(recommendation.plan_template) ? (recommendation.plan_template as JsonRecord) : null;
  const outcomeSummary = isObject(recommendation.outcome_summary) ? (recommendation.outcome_summary as JsonRecord) : null;
  const inputsJson = {
    target_overall_band: profile.target_overall_band,
    current_band_or_estimate: profile.current_band_or_estimate,
    deadline_date: profile.deadline_date,
    weakest_skill: profile.weakest_skill,
    purpose: profile.purpose,
    destination_country_code: profile.destination_country_code,
    test_market_country_code: profile.test_market_country_code,
    preferred_delivery_mode: profile.preferred_delivery_mode,
  };

  const { data, error } = await sb
    .from("ielts_playbook_recommendation_snapshots")
    .insert({
      user_id: userId,
      product_id: scope.playbookProductId,
      plan_template_id: toNullableText(planTemplate?.id, 80),
      latest_exam_outcome_id: toNullableText(outcomeSummary?.latest_exam_outcome_id, 80),
      recommendation_slug: toNullableText(planTemplate?.slug, 120),
      recommendation_json: recommendation,
      inputs_json: inputsJson,
      derived_context: {
        deadline_bucket: isObject(recommendation.planning) ? recommendation.planning.deadline_bucket : null,
        selected_track: isObject(recommendation.decision) ? recommendation.decision.selected_track : null,
      },
      is_current: true,
      metadata: { source: "ielts-playbook.edge" },
    })
    .select("id,created_at")
    .maybeSingle();

  if (error || !data) throw new Error("Failed to save recommendation snapshot");
  return { id: String((data as any).id), created_at: String((data as any).created_at) };
};

export const recordEvent = async (
  sb: any,
  scope: PlaybookScope,
  body: JsonRecord,
  userId?: string | null,
): Promise<void> => {
  const eventName = toText(body.event_name, 80);
  const allowed = new Set([
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
  if (!allowed.has(eventName)) throw new Error("Unsupported event_name");

  await sb.from("ielts_playbook_events").insert({
    user_id: userId ?? null,
    product_id: scope.playbookProductId,
    page_id: toNullableText(body.page_id, 80),
    event_name: eventName,
    page_type: toNullableText(body.page_type, 80),
    module_key: toNullableText(body.module_key, 80),
    market_country_code: toNullableText(body.market_country_code, 16),
    metadata: isObject(body.metadata) ? body.metadata : {},
    occurred_at: toNullableText(body.occurred_at, 64) ?? new Date().toISOString(),
  });
};

export const loadCurrentRecommendation = async (sb: any, scope: PlaybookScope, userId: string): Promise<JsonRecord | null> => {
  const { data } = await sb
    .from("ielts_playbook_recommendation_snapshots")
    .select("recommendation_json,created_at,id")
    .eq("user_id", userId)
    .eq("product_id", scope.playbookProductId)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data || !isObject((data as any).recommendation_json)) return null;
  return {
    id: String((data as any).id),
    created_at: String((data as any).created_at),
    ...((data as any).recommendation_json as JsonRecord),
  };
};

export const listCatalog = async (sb: any, scope: PlaybookScope): Promise<JsonRecord> => {
  const { data } = await sb
    .from("ielts_playbook_pages")
    .select("id,parent_page_id,page_type,module_key,slug,title,summary,visibility,sort_order,metadata,published_at")
    .eq("product_id", scope.playbookProductId)
    .eq("status", "published")
    .order("sort_order", { ascending: true });

  const pages = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
  const modules = pages.filter((page) => String(page.page_type) === "module").sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
  const premiumGuides = pages
    .filter((page) => String(page.visibility) === "premium")
    .map((page) => ({
      id: String(page.id),
      parent_page_id: page.parent_page_id ? String(page.parent_page_id) : null,
      module_key: page.module_key ? String(page.module_key) : null,
      slug: String(page.slug),
      title: String(page.title),
      summary: String(page.summary ?? ""),
      page_type: String(page.page_type),
      published_at: page.published_at ? String(page.published_at) : null,
    }));

  return {
    product_slug: PLAYBOOK_PRODUCT_SLUG,
    modules: modules.map((page) => ({
      id: String(page.id),
      slug: String(page.slug),
      module_key: page.module_key ? String(page.module_key) : null,
      title: String(page.title),
      summary: String(page.summary ?? ""),
      sort_order: Number(page.sort_order ?? 0),
      metadata: isObject(page.metadata) ? page.metadata : {},
      published_at: page.published_at ? String(page.published_at) : null,
    })),
    premium_guides: premiumGuides,
  };
};

export const loadPageDetail = async (sb: any, scope: PlaybookScope, slug: string): Promise<JsonRecord | null> => {
  const { data: pageData } = await sb
    .from("ielts_playbook_pages")
    .select("*")
    .eq("product_id", scope.playbookProductId)
    .eq("locale_code", "en")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (!pageData) return null;
  const page = {
    ...(pageData as PageRow),
    variant_scope: isObject((pageData as any).variant_scope) ? ((pageData as any).variant_scope as JsonRecord) : {},
    metadata: isObject((pageData as any).metadata) ? ((pageData as any).metadata as JsonRecord) : {},
    country_scope: Array.isArray((pageData as any).country_scope) ? ((pageData as any).country_scope as string[]) : [],
  };

  const [{ data: sectionData }, { data: childPages }, { data: pageSources }] = await Promise.all([
    sb
      .from("ielts_playbook_page_sections")
      .select("*")
      .eq("page_id", page.id)
      .eq("status", "published")
      .order("sort_order", { ascending: true }),
    sb
      .from("ielts_playbook_pages")
      .select("id,parent_page_id,page_type,module_key,slug,title,summary,visibility,sort_order,published_at,metadata")
      .eq("parent_page_id", page.id)
      .eq("status", "published")
      .order("sort_order", { ascending: true }),
    sb
      .from("ielts_playbook_page_sources")
      .select("sort_order,citation_note,is_primary,source:ielts_playbook_sources(*)")
      .eq("page_id", page.id)
      .order("sort_order", { ascending: true }),
  ]);

  return {
    page,
    sections: (Array.isArray(sectionData) ? sectionData : []).map((row: any) => ({
      ...(row as PageSectionRow),
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
        ? {
          ...(row.source as SourceRow),
          metadata: isObject((row.source as any).metadata) ? ((row.source as any).metadata as JsonRecord) : {},
        }
        : null,
    })),
  };
};

export const loadUpdatesPayload = async (sb: any, scope: PlaybookScope): Promise<JsonRecord> => {
  const [updatesModule, recentSources, markets] = await Promise.all([
    loadPageDetail(sb, scope, "updates-policy"),
    sb
      .from("ielts_playbook_sources")
      .select("*")
      .eq("status", "published")
      .order("verified_at", { ascending: false })
      .limit(10),
    sb
      .from("ielts_playbook_market_guidance")
      .select("*")
      .eq("product_id", scope.playbookProductId)
      .eq("status", "published")
      .order("verified_at", { ascending: false })
      .limit(20),
  ]);

  return {
    updates_page: updatesModule,
    recent_sources: (Array.isArray(recentSources.data) ? recentSources.data : []).map((row: any) => ({
      ...row,
      metadata: isObject(row.metadata) ? row.metadata : {},
    })),
    markets: (Array.isArray(markets.data) ? markets.data : []).map((row: any) => ({
      ...row,
      metadata: isObject(row.metadata) ? row.metadata : {},
    })),
  };
};

export const buildDashboardPayload = async (sb: any, scope: PlaybookScope, userId: string): Promise<JsonRecord> => {
  const [profile, recommendation, outcome, premiumGuides] = await Promise.all([
    loadProfile(sb, scope, userId),
    loadCurrentRecommendation(sb, scope, userId),
    loadLatestOutcome(sb, scope, userId),
    sb
      .from("ielts_playbook_pages")
      .select("id,slug,title,summary,module_key,page_type,sort_order")
      .eq("product_id", scope.playbookProductId)
      .eq("status", "published")
      .eq("visibility", "premium")
      .order("sort_order", { ascending: true })
      .limit(8),
  ]);

  return {
    profile,
    latest_recommendation: recommendation,
    latest_outcome: outcome ? { ...outcome, section_bands: extractSectionBands(outcome) } : null,
    premium_guides: premiumGuides.data ?? [],
  };
};
