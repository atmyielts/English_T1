type JsonRecord = Record<string, unknown>;

export type AuthedContext = {
  userId: string;
  token: string;
  email: string | null;
};

export type ResolvedLanguageScope = {
  languageId: string;
  languageCode: string;
  languageName: string;
};

export type EnglishProductInfo = {
  serviceKey: EnglishServiceKey;
  slug: string;
  productId: string;
  name: string;
  appUrl: string | null;
};

export type ContentRegistryRow = {
  id: string;
  product_id: string;
  language_id: string;
  service_key: string;
  content_type: string;
  source_ref: string;
  title: string;
  description: string | null;
  skill_key: string;
  subskill_keys: string[] | null;
  cefr_level: string | null;
  difficulty: number | null;
  estimated_minutes: number | null;
  learning_objective: string | null;
  tags: string[] | null;
  payload_json: JsonRecord | null;
  metadata: JsonRecord | null;
  status: string;
};

export type RecommendationRow = {
  id: string;
  recommended_product_id: string | null;
  recommended_content_item_id: string | null;
  recommended_service_key: string;
  recommendation_type: string;
  title: string;
  reason: string;
  intent: string | null;
  skill_key: string | null;
  priority: number;
  estimated_minutes: number | null;
  payload: JsonRecord | null;
  status: string;
  expires_at: string | null;
};

export type HubPlanTask = {
  id: string;
  recommendation_id: string | null;
  service_key: string;
  service_label: string;
  title: string;
  reason: string;
  intent: string;
  skill: string;
  estimated_minutes: number;
  href: string | null;
  content_item_id: string | null;
};

const hubToneForGap = (gap: number): string => {
  if (gap >= 42) return "recovery";
  if (gap >= 24) return "focus";
  return "momentum";
};

export type EnglishServiceKey =
  | "reading"
  | "listening"
  | "writing"
  | "speaking"
  | "grammar"
  | "vocabulary"
  | "immersion";

export type EnglishRuleServiceKey = EnglishServiceKey | "*";

export type EnglishRuleConfig = {
  ruleKey: string;
  serviceKey: EnglishRuleServiceKey;
  enabled: boolean;
  thresholds: JsonRecord;
  notes: string | null;
  metadata: JsonRecord | null;
};

export type NotebookStatsSummary = {
  dueCount: number;
  totalCount: number;
  activationCandidateCount: number;
};

export type RecommendationTriggerEvaluation = {
  grammarLookbackDays: number;
  grammarErrorFrequencyThreshold: number;
  vocabularyIdleDays: number;
  listeningLookbackDays: number;
  listeningAccuracyBelow: number;
  listeningRepeatCount: number;
  writingLookbackDays: number;
  writingQualityBelow: number;
  writingLowAttempts: number;
  speakingMinIssueCount: number;
  speakingRequiresStableGrammar: boolean;
  immersionMinStableUnits: number;
  handoffSuccessWindowDays: number;
  handoffSuccessScore: number;
  grammarTriggerError: Record<string, unknown> | null;
  repeatedGrammarError: boolean;
  vocabularyActivationNeeded: boolean;
  listeningRecoveryEntry: [string, number] | null;
  hasListeningRecovery: boolean;
  writingNeedsRecovery: boolean;
  speakingTransferNeeded: boolean;
  immersionApplicationNeeded: boolean;
};

export type MasteryReopenDerivation = {
  sourceServiceKey: EnglishServiceKey | null;
  previousState: "stable" | "mastered";
  previousConfidence: number;
  update: {
    state: "unstable";
    confidence: number;
    failure_count: number;
    reopened_count: number;
    metadata: JsonRecord;
    updated_at: string;
  };
  analyticsPayload: JsonRecord;
};

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

export const SERVICE_LABELS: Record<EnglishServiceKey, string> = {
  reading: "Reading",
  listening: "Listening",
  writing: "Writing",
  speaking: "Speaking",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  immersion: "Immersion",
};

export const SERVICE_PRODUCT_SLUGS: Record<EnglishServiceKey, string> = {
  reading: "english-reading",
  listening: "english-listening",
  writing: "english-writing",
  speaking: "english-speaking",
  grammar: "english-grammar",
  vocabulary: "english-vocabulary",
  immersion: "english-immersion",
};

const serviceKeys = Object.keys(SERVICE_PRODUCT_SLUGS) as EnglishServiceKey[];

export const DEFAULT_ENGLISH_RULE_CONFIGS: Record<string, EnglishRuleConfig> = {
  grammar_remediation: {
    ruleKey: "grammar_remediation",
    serviceKey: "grammar",
    enabled: true,
    thresholds: {
      error_frequency: 3,
      lookback_days: 7,
      priority: 90,
      estimated_minutes: 12,
    },
    notes: "Assign grammar remediation after repeated grammar errors within the active lookback window.",
    metadata: { generated_by: "english.rules.defaults" },
  },
  vocabulary_activation: {
    ruleKey: "vocabulary_activation",
    serviceKey: "vocabulary",
    enabled: true,
    thresholds: {
      idle_days: 5,
      min_correct_count: 0,
      priority: 88,
      estimated_minutes: 10,
    },
    notes: "Push saved vocabulary into activation tasks when items stay unused for too long.",
    metadata: { generated_by: "english.rules.defaults" },
  },
  listening_recovery: {
    ruleKey: "listening_recovery",
    serviceKey: "listening",
    enabled: true,
    thresholds: {
      accuracy_below: 0.7,
      repeat_count: 2,
      lookback_days: 30,
      priority: 86,
      estimated_minutes: 12,
    },
    notes: "Trigger controlled listening recovery when the same weak pattern repeats.",
    metadata: { generated_by: "english.rules.defaults" },
  },
  writing_recovery: {
    ruleKey: "writing_recovery",
    serviceKey: "writing",
    enabled: true,
    thresholds: {
      quality_below: 0.6,
      low_attempts: 3,
      lookback_days: 30,
      priority: 84,
      estimated_minutes: 12,
    },
    notes: "Fallback to simpler guided writing when revision quality stays low.",
    metadata: { generated_by: "english.rules.defaults" },
  },
  speaking_transfer: {
    ruleKey: "speaking_transfer",
    serviceKey: "speaking",
    enabled: true,
    thresholds: {
      min_issue_count: 1,
      require_stable_grammar: true,
      priority: 83,
      estimated_minutes: 10,
    },
    notes: "Use speaking transfer tasks when grammar looks stable in drills but not in speech.",
    metadata: { generated_by: "english.rules.defaults" },
  },
  immersion_application: {
    ruleKey: "immersion_application",
    serviceKey: "immersion",
    enabled: true,
    thresholds: {
      min_stable_units: 1,
      priority: 82,
      estimated_minutes: 15,
    },
    notes: "Validate real transfer in immersion once stable units exist in other services.",
    metadata: { generated_by: "english.rules.defaults" },
  },
  handoff_effectiveness: {
    ruleKey: "handoff_effectiveness",
    serviceKey: "*",
    enabled: true,
    thresholds: {
      success_window_days: 7,
      success_score: 0.65,
    },
    notes: "Shared evaluation window and success threshold for recommendation handoff analytics.",
    metadata: { generated_by: "english.rules.defaults" },
  },
};

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

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const roundTo = (value: number, precision = 4): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

export const isObject = (value: unknown): value is JsonRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

export const asRecord = (value: unknown): JsonRecord =>
  isObject(value) ? value : {};

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
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim() || null;
  return auth.trim() || null;
};

export const extractRoute = (url: URL, marker: string): string => {
  const idx = url.pathname.indexOf(marker);
  if (idx < 0) return "";
  const tail = url.pathname.slice(idx + marker.length);
  return tail.startsWith("/") ? tail : tail ? `/${tail}` : "";
};

export const authUser = async (sb: any, req: Request): Promise<AuthedContext | null> => {
  const token = getBearerToken(req);
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return {
    userId: String(data.user.id),
    token,
    email: data.user.email ?? null,
  };
};

export const normalizeServiceKey = (raw: unknown): EnglishServiceKey | null => {
  const text = toText(raw, 64).toLowerCase();
  if (!text) return null;
  const cleaned = text.replace(/^english-/, "");
  if (serviceKeys.includes(cleaned as EnglishServiceKey)) return cleaned as EnglishServiceKey;
  return null;
};

export const normalizeRuleServiceKey = (raw: unknown): EnglishRuleServiceKey | null => {
  const text = toText(raw, 64).toLowerCase();
  if (!text) return null;
  if (text === "*" || text === "all") return "*";
  return normalizeServiceKey(text);
};

export const loadEnglishRuleConfigs = async (
  sb: any,
  languageId: string,
): Promise<Record<string, EnglishRuleConfig>> => {
  const merged: Record<string, EnglishRuleConfig> = Object.fromEntries(
    Object.entries(DEFAULT_ENGLISH_RULE_CONFIGS).map(([key, value]) => [key, {
      ...value,
      thresholds: { ...value.thresholds },
      metadata: value.metadata ? { ...value.metadata } : null,
    }]),
  );

  const { data, error } = await sb
    .from("english_learning_rule_configs")
    .select("rule_key, service_key, enabled, thresholds, notes, metadata")
    .eq("language_id", languageId);
  if (error) return merged;

  for (const row of Array.isArray(data) ? data as Array<Record<string, unknown>> : []) {
    const ruleKey = toText(row.rule_key, 120);
    if (!ruleKey) continue;
    const serviceKey = normalizeRuleServiceKey(row.service_key) ?? merged[ruleKey]?.serviceKey ?? "*";
    const base = merged[ruleKey] ?? {
      ruleKey,
      serviceKey,
      enabled: true,
      thresholds: {},
      notes: null,
      metadata: {},
    };
    merged[ruleKey] = {
      ruleKey,
      serviceKey,
      enabled: typeof row.enabled === "boolean" ? row.enabled : base.enabled,
      thresholds: {
        ...base.thresholds,
        ...asRecord(row.thresholds),
      },
      notes: toNullableText(row.notes, 1000) ?? base.notes,
      metadata: {
        ...(base.metadata ?? {}),
        ...asRecord(row.metadata),
      },
    };
  }

  return merged;
};

export const logEnglishAnalyticsEvents = async (
  sb: any,
  events: Array<{
    actorUserId?: string | null;
    learnerUserId?: string | null;
    languageId: string;
    eventType: "mastery_reopened" | "rule_updated";
    sourceServiceKey?: EnglishServiceKey | null;
    targetServiceKey?: EnglishServiceKey | null;
    relatedAttemptId?: string | null;
    payload?: JsonRecord | null;
  }>,
): Promise<void> => {
  if (!Array.isArray(events) || events.length === 0) return;
  const rows = events.map((event) => ({
    actor_user_id: event.actorUserId ?? null,
    learner_user_id: event.learnerUserId ?? null,
    language_id: event.languageId,
    event_type: event.eventType,
    source_service_key: event.sourceServiceKey ?? null,
    target_service_key: event.targetServiceKey ?? null,
    related_attempt_id: event.relatedAttemptId ?? null,
    payload: event.payload ?? {},
  }));
  const { error } = await sb.from("english_learning_analytics_events").insert(rows);
  if (error) throw new Error(`Failed to write English analytics events: ${error.message}`);
};

const mapProductSlugToService = (slug: string): EnglishServiceKey | null => {
  for (const key of serviceKeys) {
    if (SERVICE_PRODUCT_SLUGS[key] === slug) return key;
  }
  return null;
};

export const resolveEnglishProducts = async (sb: any): Promise<Record<EnglishServiceKey, EnglishProductInfo>> => {
  const { data, error } = await sb.from("products").select("id, name, metadata, status");
  if (error) throw new Error(`Failed to load products: ${error.message}`);

  const out = {} as Record<EnglishServiceKey, EnglishProductInfo>;
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const meta = asRecord(row.metadata);
    const slug = toText(meta.slug, 120).toLowerCase();
    const serviceKey = mapProductSlugToService(slug);
    if (!serviceKey) continue;
    out[serviceKey] = {
      serviceKey,
      slug,
      productId: String(row.id ?? ""),
      name: toText(row.name, 160) || `English ${SERVICE_LABELS[serviceKey]}`,
      appUrl: toNullableText(meta.app_url, 400),
    };
  }
  return out;
};

export const resolveLanguageScope = async (
  sb: any,
  requestedLanguageCode = "en",
): Promise<ResolvedLanguageScope> => {
  const { data, error } = await sb
    .from("languages")
    .select("id, code, name")
    .eq("code", requestedLanguageCode.toLowerCase())
    .maybeSingle();
  if (error || !data?.id) throw new Error("Language not found");
  return {
    languageId: String((data as any).id),
    languageCode: String((data as any).code ?? "en").toLowerCase(),
    languageName: String((data as any).name ?? "English"),
  };
};

export const buildDashboardHref = (
  appUrl: string | null,
  payload: { intent: string; skill: string; reason: string; sourceService?: string },
): string | null => {
  if (!appUrl) return null;
  const url = new URL(`${appUrl.replace(/\/$/, "")}/dashboard`);
  url.searchParams.set("from", "english-hub");
  url.searchParams.set("intent", payload.intent);
  url.searchParams.set("skill", payload.skill);
  url.searchParams.set("reason", payload.reason);
  if (payload.sourceService) url.searchParams.set("source_service", payload.sourceService);
  return url.toString();
};

const normalizeMetricScore = (keyPath: string, raw: number): number | null => {
  if (!Number.isFinite(raw)) return null;
  const key = keyPath.toLowerCase();
  if (key.includes("gap") || key.includes("delta") || key.includes("error") || key.includes("incorrect")) return null;
  if (key.includes("band")) return clamp((raw / 9) * 100, 0, 100);
  if (key.includes("ratio") || key.includes("accuracy") || key.includes("confidence") || key.includes("score")) {
    return raw <= 1 ? clamp(raw * 100, 0, 100) : clamp(raw, 0, 100);
  }
  if (raw <= 1) return clamp(raw * 100, 0, 100);
  return clamp(raw, 0, 100);
};

const collectScores = (value: unknown, keyPath = ""): number[] => {
  if (typeof value === "number") {
    const normalized = normalizeMetricScore(keyPath, value);
    return normalized == null ? [] : [normalized];
  }
  if (Array.isArray(value)) return value.flatMap((item, index) => collectScores(item, `${keyPath}[${index}]`));
  const rec = isObject(value) ? value : null;
  if (!rec) return [];
  return Object.entries(rec).flatMap(([key, nested]) => collectScores(nested, keyPath ? `${keyPath}.${key}` : key));
};

const avg = (values: number[]): number | null => {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const collectServiceScores = (source: unknown, serviceKey: string): number[] => {
  const rec = isObject(source) ? source : null;
  if (!rec) return [];
  const key = serviceKey.toLowerCase();
  const direct = collectScores(rec[key], key);
  if (direct.length > 0) return direct;
  return Object.entries(rec)
    .filter(([entryKey]) => entryKey.toLowerCase().includes(key))
    .flatMap(([entryKey, value]) => collectScores(value, entryKey));
};

export const computeServiceReadiness = (
  languageProfile: unknown,
  serviceBreakdown: unknown,
): Array<{ serviceKey: EnglishServiceKey; label: string; score: number; gap: number }> =>
  serviceKeys.map((serviceKey) => {
    const computed = avg([
      ...collectServiceScores(serviceBreakdown, serviceKey),
      ...collectServiceScores(languageProfile, serviceKey),
    ]);
    const fallback = {
      reading: 82,
      listening: 78,
      writing: 73,
      speaking: 69,
      grammar: 81,
      vocabulary: 76,
      immersion: 71,
    }[serviceKey];
    const score = Math.round(clamp(computed == null ? fallback : computed, 0, 100));
    return {
      serviceKey,
      label: SERVICE_LABELS[serviceKey],
      score,
      gap: Math.max(0, 100 - score),
    };
  });

export const cefrFromPercent = (percent: number): string => {
  if (percent < 35) return "A1";
  if (percent < 50) return "A2";
  if (percent < 65) return "B1";
  if (percent < 78) return "B2";
  if (percent < 89) return "C1";
  return "C2";
};

export const difficultyFromCefr = (level: string | null | undefined): number => {
  switch ((level ?? "").toUpperCase()) {
    case "A1":
      return 0.2;
    case "A2":
      return 0.3;
    case "B1":
      return 0.45;
    case "B2":
      return 0.6;
    case "C1":
      return 0.75;
    case "C2":
      return 0.9;
    default:
      return 0.5;
  }
};

export const defaultSubskillsForService = (serviceKey: EnglishServiceKey): string[] => {
  switch (serviceKey) {
    case "reading":
      return ["reading.gist", "reading.detail", "reading.inference"];
    case "listening":
      return ["listening.word-recognition", "listening.detail", "listening.decoding"];
    case "writing":
      return ["writing.grammar", "writing.coherence", "writing.revision"];
    case "speaking":
      return ["speaking.fluency", "speaking.grammar", "speaking.pronunciation"];
    case "grammar":
      return ["grammar.accuracy", "grammar.word-order", "grammar.transfer"];
    case "vocabulary":
      return ["vocabulary.recall", "vocabulary.usage", "vocabulary.retention"];
    case "immersion":
      return ["immersion.transfer", "immersion.communication", "immersion.problem-solving"];
  }
};

const retryIntentForService = (serviceKey: EnglishServiceKey): string => {
  switch (serviceKey) {
    case "reading":
      return "interactive-text";
    case "listening":
      return "dictation";
    case "writing":
      return "active-correction";
    case "speaking":
      return "guided-speaking";
    case "grammar":
      return "targeted-drill";
    case "vocabulary":
      return "leitner-review";
    case "immersion":
      return "scenario-task";
  }
};

const transferTargetForService = (serviceKey: EnglishServiceKey): EnglishServiceKey => {
  switch (serviceKey) {
    case "reading":
      return "writing";
    case "listening":
      return "speaking";
    case "writing":
      return "speaking";
    case "speaking":
      return "grammar";
    case "grammar":
      return "writing";
    case "vocabulary":
      return "speaking";
    case "immersion":
      return "writing";
  }
};

export const calculateAttemptScore = (input: {
  correctnessRatio?: number | null;
  estimatedMinutes?: number | null;
  timeSpentSeconds?: number | null;
  hintUsageCount?: number | null;
  retryCount?: number | null;
  correctionQualityRatio?: number | null;
}): {
  correctnessRatio: number;
  timeEfficiencyRatio: number;
  correctionQualityRatio: number;
  hintScoreRatio: number;
  retryPenaltyRatio: number;
  overallScore: number;
} => {
  const correctnessRatio = clamp(toNumber(input.correctnessRatio) ?? 0.72, 0, 1);
  const correctionQualityRatio = clamp(
    toNumber(input.correctionQualityRatio) ?? correctnessRatio,
    0,
    1,
  );
  const estimatedSeconds = Math.max(60, (toNumber(input.estimatedMinutes) ?? 10) * 60);
  const actualSeconds = Math.max(1, toNumber(input.timeSpentSeconds) ?? estimatedSeconds);
  const timeEfficiencyRatio = roundTo(clamp(estimatedSeconds / actualSeconds, 0.2, 1), 4);
  const hintScoreRatio = roundTo(clamp(1 - Math.min(0.75, (toNumber(input.hintUsageCount) ?? 0) * 0.15), 0, 1), 4);
  const retryPenaltyRatio = roundTo(clamp(1 - Math.min(0.65, (toNumber(input.retryCount) ?? 0) * 0.12), 0, 1), 4);
  const overallScore = roundTo(clamp(
    correctnessRatio * 0.5
      + correctionQualityRatio * 0.2
      + timeEfficiencyRatio * 0.15
      + hintScoreRatio * 0.075
      + retryPenaltyRatio * 0.075,
    0,
    1,
  ), 4);

  return {
    correctnessRatio,
    timeEfficiencyRatio,
    correctionQualityRatio,
    hintScoreRatio,
    retryPenaltyRatio,
    overallScore,
  };
};

export const buildFeedbackPayload = (input: {
  serviceKey: EnglishServiceKey;
  score: number;
  title?: string | null;
  reason?: string | null;
  issues?: unknown;
}): {
  summary: string;
  issues: Array<Record<string, unknown>>;
  retry_task: JsonRecord;
  related_drill: JsonRecord;
  handoff_targets: Array<Record<string, unknown>>;
  normalized_payload: JsonRecord;
} => {
  const rawIssues = Array.isArray(input.issues) ? input.issues : [];
  const normalizedIssues = rawIssues
    .map((entry) => {
      const rec = asRecord(entry);
      const category = toText(rec.category ?? rec.skill_key ?? rec.skill ?? input.serviceKey, 80).toLowerCase() || input.serviceKey;
      const subskill = toText(rec.subskill_key ?? rec.subskill ?? rec.area ?? "*", 120) || "*";
      const explanation = toText(rec.explanation ?? rec.message ?? rec.reason, 400)
        || `This task showed instability in ${subskill === "*" ? category : subskill}.`;
      const correctionHint = toText(rec.correction_hint ?? rec.hint ?? rec.fix, 240)
        || "Retry with one smaller step and focus on clarity first.";
      return {
        category,
        subskill_key: subskill,
        location_ref: toNullableText(rec.location_ref ?? rec.location, 160),
        explanation,
        correction_hint: correctionHint,
        severity: clamp(toNumber(rec.severity) ?? (input.score < 0.55 ? 0.8 : 0.45), 0, 1),
      };
    })
    .filter((issue) => issue.category.length > 0);

  const summary = input.score >= 0.85
    ? `Strong ${SERVICE_LABELS[input.serviceKey]} result. Keep momentum with one transfer task.`
    : input.score >= 0.65
    ? `Solid progress in ${SERVICE_LABELS[input.serviceKey]}. One focused retry should stabilize this skill.`
    : `This ${SERVICE_LABELS[input.serviceKey]} attempt needs a recovery loop before moving on.`;

  const topIssue = normalizedIssues[0] ?? null;
  const relatedService = topIssue?.category.includes("grammar")
    ? "grammar"
    : topIssue?.category.includes("vocabulary")
    ? "vocabulary"
    : topIssue?.category.includes("pronunciation") || topIssue?.category.includes("fluency")
    ? "speaking"
    : input.serviceKey;
  const transferService = transferTargetForService(input.serviceKey);

  const retryTask = {
    title: `Retry ${input.title ?? `${SERVICE_LABELS[input.serviceKey]} task`}`.trim(),
    service_key: input.serviceKey,
    intent: retryIntentForService(input.serviceKey),
    reason: topIssue?.explanation ?? input.reason ?? "One smaller retry should improve stability.",
  };

  const relatedDrill = {
    title: `${SERVICE_LABELS[relatedService]} drill`,
    service_key: relatedService,
    intent: retryIntentForService(relatedService),
    reason: topIssue?.correction_hint ?? "Use a shorter drill to repair the weak pattern before trying again.",
  };

  const handoffTargets = [
    {
      service_key: relatedService,
      label: SERVICE_LABELS[relatedService],
      reason: "Repair the weakness directly.",
    },
    {
      service_key: transferService,
      label: SERVICE_LABELS[transferService],
      reason: "Apply the same language in a transfer task.",
    },
  ];

  return {
    summary,
    issues: normalizedIssues,
    retry_task: retryTask,
    related_drill: relatedDrill,
    handoff_targets: handoffTargets,
    normalized_payload: {
      summary,
      issues: normalizedIssues,
      retry_task: retryTask,
      related_drill: relatedDrill,
      handoff_targets: handoffTargets,
    },
  };
};

export const resolveOrCreateContentItem = async (
  sb: any,
  input: {
    contentItemId?: string | null;
    productId: string;
    languageId: string;
    serviceKey: EnglishServiceKey;
    contentType?: string | null;
    sourceRef?: string | null;
    title?: string | null;
    description?: string | null;
    skillKey?: string | null;
    subskillKeys?: string[] | null;
    cefrLevel?: string | null;
    difficulty?: number | null;
    estimatedMinutes?: number | null;
    learningObjective?: string | null;
    tags?: string[] | null;
    payloadJson?: JsonRecord | null;
    metadata?: JsonRecord | null;
  },
): Promise<ContentRegistryRow> => {
  if (input.contentItemId) {
    const { data, error } = await sb
      .from("learning_content_registry_items")
      .select("*")
      .eq("id", input.contentItemId)
      .maybeSingle();
    if (error || !data?.id) throw new Error("Content item not found");
    return data as ContentRegistryRow;
  }

  const contentType = toText(input.contentType, 80) || `${input.serviceKey}.task`;
  const sourceRef = toText(input.sourceRef, 160) || `manual:${crypto.randomUUID()}`;
  const existing = await sb
    .from("learning_content_registry_items")
    .select("*")
    .eq("language_id", input.languageId)
    .eq("service_key", input.serviceKey)
    .eq("content_type", contentType)
    .eq("source_ref", sourceRef)
    .maybeSingle();
  if (!existing.error && existing.data?.id) return existing.data as ContentRegistryRow;

  if (input.serviceKey === "reading" && contentType === "reading.article") {
    const articleLookup = await sb
      .from("reading_articles")
      .select("id, product_id, language_id, slug, title, summary, level, category, theme, tone, read_time_minutes, is_hot, status, metadata, created_by, updated_by")
      .or(`slug.eq.${sourceRef},id.eq.${sourceRef}`)
      .limit(1)
      .maybeSingle();

    if (!articleLookup.error && articleLookup.data?.id) {
      const article = articleLookup.data as Record<string, unknown>;
      const payload = {
        product_id: String(article.product_id ?? input.productId),
        language_id: String(article.language_id ?? input.languageId),
        service_key: "reading",
        content_type: "reading.article",
        source_table: "reading_articles",
        source_record_id: String(article.id),
        source_ref: String(article.slug ?? sourceRef),
        title: toText(article.title, 220) || input.title || "Reading article",
        description: toNullableText(article.summary, 900),
        skill_key: "reading",
        subskill_keys: ["reading.gist", "reading.detail", "reading.inference", "vocabulary.context"],
        cefr_level: toNullableText(article.level, 8),
        difficulty: difficultyFromCefr(toNullableText(article.level, 8)),
        estimated_minutes: Math.max(1, Math.min(240, Math.floor(toNumber(article.read_time_minutes) ?? 6))),
        learning_objective: toNullableText(article.summary, 900) ?? "Read and interpret the article with a comprehension focus.",
        tags: [toText(article.category, 120), toText(article.theme, 120)].filter(Boolean),
        status: toText(article.status, 24) || "published",
        payload_json: {
          tone: toText(article.tone, 40),
          is_hot: article.is_hot === true,
        },
        metadata: asRecord(article.metadata),
        created_by: article.created_by ?? null,
        updated_by: article.updated_by ?? null,
      };

      const inserted = await sb
        .from("learning_content_registry_items")
        .upsert(payload, { onConflict: "language_id,service_key,content_type,source_ref" })
        .select("*")
        .eq("language_id", payload.language_id)
        .eq("service_key", payload.service_key)
        .eq("content_type", payload.content_type)
        .eq("source_ref", payload.source_ref)
        .maybeSingle();
      if (inserted.error || !inserted.data?.id) throw new Error("Failed to register reading content");
      return inserted.data as ContentRegistryRow;
    }
  }

  const inserted = await sb
    .from("learning_content_registry_items")
    .insert({
      product_id: input.productId,
      language_id: input.languageId,
      service_key: input.serviceKey,
      content_type: contentType,
      source_ref: sourceRef,
      title: toText(input.title, 220) || `${SERVICE_LABELS[input.serviceKey]} task`,
      description: toNullableText(input.description, 900),
      skill_key: toText(input.skillKey, 120) || input.serviceKey,
      subskill_keys: (input.subskillKeys ?? defaultSubskillsForService(input.serviceKey)).filter(Boolean),
      cefr_level: toNullableText(input.cefrLevel, 8),
      difficulty: clamp(toNumber(input.difficulty) ?? 0.5, 0, 1),
      estimated_minutes: Math.max(1, Math.min(240, Math.floor(toNumber(input.estimatedMinutes) ?? 10))),
      learning_objective: toNullableText(input.learningObjective, 900),
      tags: Array.isArray(input.tags) ? input.tags.map((entry) => toText(entry, 120)).filter(Boolean) : [],
      payload_json: input.payloadJson ?? {},
      metadata: input.metadata ?? {},
      status: "published",
    })
    .select("*")
    .maybeSingle();
  if (inserted.error || !inserted.data?.id) throw new Error("Failed to create content item");
  return inserted.data as ContentRegistryRow;
};

export const rebuildLanguageProfile = async (sb: any, languageId: string, userId: string): Promise<void> => {
  await sb.rpc("rebuild_all_learner_language_profiles", {
    p_language_id: languageId,
    p_user_id: userId,
  });
};

export const upsertAttemptSignals = async (
  sb: any,
  input: {
    attemptId: string;
    userId: string;
    languageId: string;
    productId: string;
    serviceKey: EnglishServiceKey;
    contentItem: ContentRegistryRow;
    overallScore: number;
    correctnessRatio: number;
    correctionQualityRatio: number;
    timeEfficiencyRatio: number;
  },
): Promise<number> => {
  const nowIso = new Date().toISOString();
  const baseSourceType = `english.${input.serviceKey}`;
  const subskillKeys = (input.contentItem.subskill_keys ?? []).filter(Boolean);
  const rows = [
    {
      user_id: input.userId,
      language_id: input.languageId,
      product_id: input.productId,
      session_id: null,
      source_type: baseSourceType,
      skill_key: input.contentItem.skill_key || input.serviceKey,
      metric_key: "overall_score",
      metric_value: input.overallScore,
      confidence: 0.92,
      occurred_at: nowIso,
      idempotency_key: `${input.attemptId}:${baseSourceType}:overall_score`,
      payload: {
        attempt_id: input.attemptId,
        content_item_id: input.contentItem.id,
        content_type: input.contentItem.content_type,
      },
    },
    {
      user_id: input.userId,
      language_id: input.languageId,
      product_id: input.productId,
      session_id: null,
      source_type: baseSourceType,
      skill_key: input.contentItem.skill_key || input.serviceKey,
      metric_key: "correctness_ratio",
      metric_value: input.correctnessRatio,
      confidence: 0.9,
      occurred_at: nowIso,
      idempotency_key: `${input.attemptId}:${baseSourceType}:correctness_ratio`,
      payload: { attempt_id: input.attemptId, content_item_id: input.contentItem.id },
    },
    {
      user_id: input.userId,
      language_id: input.languageId,
      product_id: input.productId,
      session_id: null,
      source_type: baseSourceType,
      skill_key: input.contentItem.skill_key || input.serviceKey,
      metric_key: "correction_quality_ratio",
      metric_value: input.correctionQualityRatio,
      confidence: 0.84,
      occurred_at: nowIso,
      idempotency_key: `${input.attemptId}:${baseSourceType}:correction_quality_ratio`,
      payload: { attempt_id: input.attemptId, content_item_id: input.contentItem.id },
    },
    {
      user_id: input.userId,
      language_id: input.languageId,
      product_id: input.productId,
      session_id: null,
      source_type: baseSourceType,
      skill_key: input.contentItem.skill_key || input.serviceKey,
      metric_key: "time_efficiency_ratio",
      metric_value: input.timeEfficiencyRatio,
      confidence: 0.7,
      occurred_at: nowIso,
      idempotency_key: `${input.attemptId}:${baseSourceType}:time_efficiency_ratio`,
      payload: { attempt_id: input.attemptId, content_item_id: input.contentItem.id },
    },
    ...subskillKeys.map((subskillKey) => ({
      user_id: input.userId,
      language_id: input.languageId,
      product_id: input.productId,
      session_id: null,
      source_type: baseSourceType,
      skill_key: subskillKey,
      metric_key: "overall_score",
      metric_value: input.overallScore,
      confidence: 0.82,
      occurred_at: nowIso,
      idempotency_key: `${input.attemptId}:${baseSourceType}:${subskillKey}:overall_score`,
      payload: {
        attempt_id: input.attemptId,
        content_item_id: input.contentItem.id,
        parent_skill_key: input.contentItem.skill_key || input.serviceKey,
      },
    })),
  ];

  const { error } = await sb.from("language_signals").upsert(rows, { onConflict: "idempotency_key" });
  if (error) throw new Error(`Failed to write language signals: ${error.message}`);
  return rows.length;
};

export const upsertErrorsFromFeedback = async (
  sb: any,
  input: {
    userId: string;
    languageId: string;
    serviceKey: EnglishServiceKey;
    attemptId: string;
    contentItemId: string;
    issues: Array<Record<string, unknown>>;
  },
): Promise<number> => {
  let changed = 0;
  for (const issue of input.issues) {
    const category = toText(issue.category, 80).toLowerCase() || input.serviceKey;
    const skillKey = category.includes(".") ? category.split(".")[0] : category;
    const subskillKey = toText(issue.subskill_key, 120) || "*";
    const errorType = toText(issue.explanation, 240) || toText(issue.category, 120) || "unknown";
    const severity = clamp(toNumber(issue.severity) ?? 0.5, 0, 1);

    const existing = await sb
      .from("learner_language_errors")
      .select("id, error_frequency, severity_score, mastery_status")
      .eq("user_id", input.userId)
      .eq("language_id", input.languageId)
      .eq("service_key", input.serviceKey)
      .eq("skill_key", skillKey)
      .eq("subskill_key", subskillKey)
      .eq("error_type", errorType)
      .maybeSingle();

    if (!existing.error && existing.data?.id) {
      const current = existing.data as Record<string, unknown>;
      const nextFrequency = Number(current.error_frequency ?? 0) + 1;
      const nextSeverity = roundTo(clamp((Number(current.severity_score ?? severity) * 0.65) + (severity * 0.35), 0, 1), 4);
      const { error } = await sb
        .from("learner_language_errors")
        .update({
          last_source_attempt_id: input.attemptId,
          last_content_item_id: input.contentItemId,
          last_seen_at: new Date().toISOString(),
          error_frequency: nextFrequency,
          severity_score: nextSeverity,
          mastery_status: nextFrequency >= 3 ? "reopened" : current.mastery_status ?? "open",
        })
        .eq("id", String(current.id));
      if (error) throw new Error(`Failed to update learner error: ${error.message}`);
    } else {
      const { error } = await sb.from("learner_language_errors").insert({
        user_id: input.userId,
        language_id: input.languageId,
        service_key: input.serviceKey,
        skill_key: skillKey,
        subskill_key: subskillKey,
        error_type: errorType,
        last_source_attempt_id: input.attemptId,
        last_content_item_id: input.contentItemId,
        severity_score: severity,
        mastery_status: "open",
      });
      if (error) throw new Error(`Failed to insert learner error: ${error.message}`);
    }
    changed += 1;
  }
  return changed;
};

export const upsertMasteryFromAttempt = async (
  sb: any,
  input: {
    userId: string;
    languageId: string;
    serviceKey: EnglishServiceKey;
    contentItem: ContentRegistryRow;
    overallScore: number;
  },
): Promise<void> => {
  const unitKey = input.contentItem.source_ref || input.contentItem.id;
  const existing = await sb
    .from("learner_language_mastery")
    .select("*")
    .eq("user_id", input.userId)
    .eq("language_id", input.languageId)
    .eq("service_key", input.serviceKey)
    .eq("skill_key", input.contentItem.skill_key)
    .eq("unit_key", unitKey)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  const current = !existing.error && existing.data ? (existing.data as Record<string, unknown>) : null;
  const currentConfidence = clamp(toNumber(current?.confidence) ?? 0, 0, 1);
  const decayedConfidence = current?.last_practiced_at
    ? roundTo(currentConfidence * 0.96, 4)
    : currentConfidence;
  const nextConfidence = roundTo(clamp((decayedConfidence * 0.7) + (input.overallScore * 0.3), 0, 1), 4);
  const successCount = Number(current?.success_count ?? 0) + (input.overallScore >= 0.75 ? 1 : 0);
  const failureCount = Number(current?.failure_count ?? 0) + (input.overallScore < 0.6 ? 1 : 0);
  const reopenedCount = Number(current?.reopened_count ?? 0)
    + ((String(current?.state ?? "") === "stable" || String(current?.state ?? "") === "mastered") && input.overallScore < 0.45 ? 1 : 0);

  let state = "learning";
  if (successCount >= 4 && nextConfidence >= 0.85) state = "mastered";
  else if (successCount >= 2 && nextConfidence >= 0.7) state = "stable";
  else if (failureCount >= 2 && nextConfidence < 0.55) state = "unstable";
  else if (successCount === 0 && failureCount === 0) state = "new";

  const payload = {
    user_id: input.userId,
    language_id: input.languageId,
    service_key: input.serviceKey,
    skill_key: input.contentItem.skill_key,
    unit_key: unitKey,
    state,
    confidence: nextConfidence,
    success_count: successCount,
    failure_count: failureCount,
    reopened_count: reopenedCount,
    last_practiced_at: nowIso,
    metadata: {
      content_item_id: input.contentItem.id,
      content_type: input.contentItem.content_type,
      last_score: input.overallScore,
    },
  };

  if (current) {
    const { error } = await sb
      .from("learner_language_mastery")
      .update(payload)
      .eq("user_id", input.userId)
      .eq("language_id", input.languageId)
      .eq("service_key", input.serviceKey)
      .eq("skill_key", input.contentItem.skill_key)
      .eq("unit_key", unitKey);
    if (error) throw new Error(`Failed to update mastery: ${error.message}`);
  } else {
    const { error } = await sb.from("learner_language_mastery").insert(payload);
    if (error) throw new Error(`Failed to insert mastery: ${error.message}`);
  }
};

export const reopenMasteryFromTransferFailure = async (
  sb: any,
  input: {
    userId: string;
    languageId: string;
    serviceKeys: EnglishServiceKey[];
    reason: string;
    metadata?: JsonRecord | null;
  },
): Promise<number> => {
  const serviceKeys = Array.from(new Set(
    input.serviceKeys
      .map((entry) => normalizeServiceKey(entry))
      .filter((entry): entry is EnglishServiceKey => !!entry && entry !== "immersion"),
  ));
  if (serviceKeys.length === 0) return 0;

  const { data, error } = await sb
    .from("learner_language_mastery")
    .select("*")
    .eq("user_id", input.userId)
    .eq("language_id", input.languageId)
    .in("service_key", serviceKeys)
    .in("state", ["stable", "mastered"])
    .order("updated_at", { ascending: false })
    .limit(16);
  if (error) throw new Error(`Failed to load mastery for transfer reopening: ${error.message}`);

  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  let reopened = 0;
  const analyticsEvents: Array<{
    learnerUserId: string;
    languageId: string;
    eventType: "mastery_reopened";
    sourceServiceKey: EnglishServiceKey;
    targetServiceKey: EnglishServiceKey;
    payload: JsonRecord;
  }> = [];
  for (const row of rows) {
    const derived = deriveMasteryReopenUpdate(row, {
      reason: input.reason,
      metadata: input.metadata ?? undefined,
    });
    if (!derived) continue;
    const { error: updateError } = await sb
      .from("learner_language_mastery")
      .update(derived.update)
      .eq("user_id", input.userId)
      .eq("language_id", input.languageId)
      .eq("service_key", String(row.service_key ?? ""))
      .eq("skill_key", String(row.skill_key ?? ""))
      .eq("unit_key", String(row.unit_key ?? ""));
    if (updateError) throw new Error(`Failed to reopen mastery from transfer failure: ${updateError.message}`);
    reopened += 1;
    if (derived.sourceServiceKey) {
      analyticsEvents.push({
        learnerUserId: input.userId,
        languageId: input.languageId,
        eventType: "mastery_reopened",
        sourceServiceKey: derived.sourceServiceKey,
        targetServiceKey: "immersion",
        payload: derived.analyticsPayload,
      });
    }
  }

  await logEnglishAnalyticsEvents(sb, analyticsEvents);

  return reopened;
};

export const recordEvaluatedAttempt = async (
  sb: any,
  input: {
    userId: string;
    languageId: string;
    productId: string;
    serviceKey: EnglishServiceKey;
    contentItem: ContentRegistryRow;
    attemptType: string;
    responseJson: JsonRecord;
    metadata?: JsonRecord | null;
    hintUsageCount?: number | null;
    retryCount?: number | null;
    timeSpentSeconds?: number | null;
    score: {
      correctnessRatio: number;
      timeEfficiencyRatio: number;
      correctionQualityRatio: number;
      hintScoreRatio: number;
      retryPenaltyRatio: number;
      overallScore: number;
    };
    feedback: {
      summary: string;
      issues: Array<Record<string, unknown>>;
      retry_task: JsonRecord;
      related_drill: JsonRecord;
      handoff_targets: Array<Record<string, unknown>>;
      normalized_payload: JsonRecord;
    };
    products: Record<EnglishServiceKey, EnglishProductInfo>;
  },
): Promise<{
  attempt: Record<string, unknown>;
  feedbackRow: Record<string, unknown>;
  signalsCount: number;
  errorsCount: number;
  recommendationsCount: number;
}> => {
  const nowIso = new Date().toISOString();
  const nextStatus = input.score.overallScore >= 0.6 ? "scored" : "failed";
  const scoringJson = {
    correctness_ratio: input.score.correctnessRatio,
    time_efficiency_ratio: input.score.timeEfficiencyRatio,
    correction_quality_ratio: input.score.correctionQualityRatio,
    hint_score_ratio: input.score.hintScoreRatio,
    retry_penalty_ratio: input.score.retryPenaltyRatio,
    overall_score: input.score.overallScore,
  };

  const { data: attemptData, error: attemptError } = await sb
    .from("learning_attempts")
    .insert({
      user_id: input.userId,
      language_id: input.languageId,
      product_id: input.productId,
      content_item_id: input.contentItem.id,
      service_key: input.serviceKey,
      attempt_type: input.attemptType,
      status: nextStatus,
      response_json: input.responseJson,
      scoring_json: scoringJson,
      hint_usage_count: Math.max(0, Math.floor(toNumber(input.hintUsageCount) ?? 0)),
      retry_count: Math.max(0, Math.floor(toNumber(input.retryCount) ?? 0)),
      time_spent_seconds: Math.max(
        0,
        Math.floor(toNumber(input.timeSpentSeconds) ?? Number(input.contentItem.estimated_minutes ?? 10) * 60),
      ),
      correctness_ratio: input.score.correctnessRatio,
      time_efficiency_ratio: input.score.timeEfficiencyRatio,
      correction_quality_ratio: input.score.correctionQualityRatio,
      overall_score: input.score.overallScore,
      started_at: nowIso,
      submitted_at: nowIso,
      scored_at: nowIso,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .maybeSingle();
  if (attemptError || !attemptData?.id) throw new Error(`Failed to record attempt: ${attemptError?.message ?? "Unknown error"}`);

  const attemptId = String((attemptData as Record<string, unknown>).id);
  const feedbackRes = await sb
    .from("learning_attempt_feedback")
    .upsert({
      attempt_id: attemptId,
      user_id: input.userId,
      language_id: input.languageId,
      summary: input.feedback.summary,
      issues: input.feedback.issues,
      retry_task: input.feedback.retry_task,
      related_drill: input.feedback.related_drill,
      handoff_targets: input.feedback.handoff_targets,
      normalized_payload: input.feedback.normalized_payload,
    }, { onConflict: "attempt_id" })
    .select("*")
    .eq("attempt_id", attemptId)
    .maybeSingle();
  if (feedbackRes.error || !feedbackRes.data?.id) {
    throw new Error(`Failed to store attempt feedback: ${feedbackRes.error?.message ?? "Unknown error"}`);
  }

  const signalsCount = await upsertAttemptSignals(sb, {
    attemptId,
    userId: input.userId,
    languageId: input.languageId,
    productId: input.productId,
    serviceKey: input.serviceKey,
    contentItem: input.contentItem,
    overallScore: input.score.overallScore,
    correctnessRatio: input.score.correctnessRatio,
    correctionQualityRatio: input.score.correctionQualityRatio,
    timeEfficiencyRatio: input.score.timeEfficiencyRatio,
  });
  const errorsCount = await upsertErrorsFromFeedback(sb, {
    userId: input.userId,
    languageId: input.languageId,
    serviceKey: input.serviceKey,
    attemptId,
    contentItemId: input.contentItem.id,
    issues: input.feedback.issues,
  });
  await upsertMasteryFromAttempt(sb, {
    userId: input.userId,
    languageId: input.languageId,
    serviceKey: input.serviceKey,
    contentItem: input.contentItem,
    overallScore: input.score.overallScore,
  });
  await rebuildLanguageProfile(sb, input.languageId, input.userId);
  const recommendations = await rebuildRecommendationsForUser(sb, {
    userId: input.userId,
    languageId: input.languageId,
    products: input.products,
  });

  return {
    attempt: attemptData as Record<string, unknown>,
    feedbackRow: feedbackRes.data as Record<string, unknown>,
    signalsCount,
    errorsCount,
    recommendationsCount: recommendations.length,
  };
};

export const loadNotebookStats = async (
  sb: any,
  userId: string,
  languageId: string,
  activationAgeDays = 5,
): Promise<NotebookStatsSummary> => {
  const nowIso = new Date().toISOString();
  const activationSinceIso = new Date(Date.now() - (Math.max(1, activationAgeDays) * 24 * 60 * 60 * 1000)).toISOString();
  const [dueRes, totalRes, activationRes] = await Promise.all([
    sb
      .from("user_vocabulary_notebook_entries")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .eq("is_archived", false)
      .lte("next_review_at", nowIso),
    sb
      .from("user_vocabulary_notebook_entries")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .eq("is_archived", false),
    sb
      .from("user_vocabulary_notebook_entries")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .eq("is_archived", false)
      .lte("created_at", activationSinceIso)
      .eq("correct_count", 0),
  ]);

  return {
    dueCount: Number(dueRes.count ?? 0),
    totalCount: Number(totalRes.count ?? 0),
    activationCandidateCount: Number(activationRes.count ?? 0),
  };
};

export const countListeningRecoveryPatterns = (
  rows: Array<Record<string, unknown>>,
): Record<string, number> => {
  const grouped: Record<string, number> = {};
  for (const row of rows) {
    const key = toText(row.content_item_id ?? "listening", 160) || "listening";
    grouped[key] = (grouped[key] ?? 0) + 1;
  }
  return grouped;
};

export const evaluateRecommendationTriggers = (
  input: {
    rules: Record<string, EnglishRuleConfig>;
    notebookStats: NotebookStatsSummary;
    grammarErrors: Array<Record<string, unknown>>;
    listeningPatternCounts: Record<string, number>;
    writingRecoveryCount: number;
    speakingGrammarIssuesCount: number;
    stableGrammarUnitsCount: number;
    stableTransferUnitsCount: number;
  },
): RecommendationTriggerEvaluation => {
  const grammarRule = input.rules.grammar_remediation ?? DEFAULT_ENGLISH_RULE_CONFIGS.grammar_remediation;
  const vocabularyRule = input.rules.vocabulary_activation ?? DEFAULT_ENGLISH_RULE_CONFIGS.vocabulary_activation;
  const listeningRule = input.rules.listening_recovery ?? DEFAULT_ENGLISH_RULE_CONFIGS.listening_recovery;
  const writingRule = input.rules.writing_recovery ?? DEFAULT_ENGLISH_RULE_CONFIGS.writing_recovery;
  const speakingRule = input.rules.speaking_transfer ?? DEFAULT_ENGLISH_RULE_CONFIGS.speaking_transfer;
  const immersionRule = input.rules.immersion_application ?? DEFAULT_ENGLISH_RULE_CONFIGS.immersion_application;
  const handoffRule = input.rules.handoff_effectiveness ?? DEFAULT_ENGLISH_RULE_CONFIGS.handoff_effectiveness;

  const grammarLookbackDays = Math.max(1, Math.floor(toNumber(grammarRule.thresholds.lookback_days) ?? 7));
  const grammarErrorFrequencyThreshold = Math.max(1, Math.floor(toNumber(grammarRule.thresholds.error_frequency) ?? 3));
  const vocabularyIdleDays = Math.max(1, Math.floor(toNumber(vocabularyRule.thresholds.idle_days) ?? 5));
  const listeningLookbackDays = Math.max(1, Math.floor(toNumber(listeningRule.thresholds.lookback_days) ?? 30));
  const listeningAccuracyBelow = clamp(toNumber(listeningRule.thresholds.accuracy_below) ?? 0.7, 0.1, 0.99);
  const listeningRepeatCount = Math.max(1, Math.floor(toNumber(listeningRule.thresholds.repeat_count) ?? 2));
  const writingLookbackDays = Math.max(1, Math.floor(toNumber(writingRule.thresholds.lookback_days) ?? 30));
  const writingQualityBelow = clamp(toNumber(writingRule.thresholds.quality_below) ?? 0.6, 0.1, 0.99);
  const writingLowAttempts = Math.max(1, Math.floor(toNumber(writingRule.thresholds.low_attempts) ?? 3));
  const speakingMinIssueCount = Math.max(1, Math.floor(toNumber(speakingRule.thresholds.min_issue_count) ?? 1));
  const speakingRequiresStableGrammar = Boolean(speakingRule.thresholds.require_stable_grammar ?? true);
  const immersionMinStableUnits = Math.max(1, Math.floor(toNumber(immersionRule.thresholds.min_stable_units) ?? 1));
  const handoffSuccessWindowDays = Math.max(1, Math.floor(toNumber(handoffRule.thresholds.success_window_days) ?? 7));
  const handoffSuccessScore = clamp(toNumber(handoffRule.thresholds.success_score) ?? 0.65, 0.1, 0.99);

  const grammarTriggerError = input.grammarErrors.find((row) =>
    Number(row.error_frequency ?? 0) >= grammarErrorFrequencyThreshold
  ) ?? null;
  const listeningRecoveryEntry = Object.entries(input.listeningPatternCounts)
    .find(([, count]) => count >= listeningRepeatCount) ?? null;

  return {
    grammarLookbackDays,
    grammarErrorFrequencyThreshold,
    vocabularyIdleDays,
    listeningLookbackDays,
    listeningAccuracyBelow,
    listeningRepeatCount,
    writingLookbackDays,
    writingQualityBelow,
    writingLowAttempts,
    speakingMinIssueCount,
    speakingRequiresStableGrammar,
    immersionMinStableUnits,
    handoffSuccessWindowDays,
    handoffSuccessScore,
    grammarTriggerError,
    repeatedGrammarError: grammarRule.enabled && !!grammarTriggerError,
    vocabularyActivationNeeded: vocabularyRule.enabled && input.notebookStats.activationCandidateCount > 0,
    listeningRecoveryEntry,
    hasListeningRecovery: listeningRule.enabled && !!listeningRecoveryEntry,
    writingNeedsRecovery: writingRule.enabled && input.writingRecoveryCount >= writingLowAttempts,
    speakingTransferNeeded: speakingRule.enabled
      && input.speakingGrammarIssuesCount >= speakingMinIssueCount
      && (!speakingRequiresStableGrammar || input.stableGrammarUnitsCount > 0),
    immersionApplicationNeeded: immersionRule.enabled && input.stableTransferUnitsCount >= immersionMinStableUnits,
  };
};

const recommendationToHubPlanTask = (
  row: RecommendationRow,
  estimatedMinutes: number,
): HubPlanTask => {
  const serviceKey = normalizeServiceKey(row.recommended_service_key) ?? "reading";
  const payload = asRecord(row.payload);
  return {
    id: row.id,
    recommendation_id: row.id,
    service_key: serviceKey,
    service_label: SERVICE_LABELS[serviceKey],
    title: row.title,
    reason: row.reason,
    intent: toText(row.intent, 80) || retryIntentForService(serviceKey),
    skill: toText(row.skill_key, 120) || serviceKey,
    estimated_minutes: estimatedMinutes,
    href: toNullableText(payload.dashboard_href, 500),
    content_item_id: row.recommended_content_item_id,
  };
};

export const buildHubPlanFromRecommendations = (
  recommendations: RecommendationRow[],
  minutesBudget: number,
): {
  tasks: HubPlanTask[];
  carryoverTasks: HubPlanTask[];
  totalEstimatedMinutes: number;
} => {
  const tasks: HubPlanTask[] = [];
  const remaining = [...recommendations];
  let usedMinutes = 0;

  const scheduleRow = (
    row: RecommendationRow | null,
    reserveMinutesAfter = 0,
  ): boolean => {
    if (!row) return false;
    const remainingBudget = minutesBudget - usedMinutes;
    if (remainingBudget < 5) return false;
    const estimated = Math.max(5, Math.min(40, Math.floor(Number(row.estimated_minutes ?? 10))));
    const maxForThisTask = reserveMinutesAfter > 0
      ? Math.max(5, remainingBudget - reserveMinutesAfter)
      : remainingBudget;
    if (maxForThisTask < 5) return false;
    const scheduledMinutes = Math.min(estimated, maxForThisTask);
    tasks.push(recommendationToHubPlanTask(row, scheduledMinutes));
    usedMinutes += scheduledMinutes;
    return true;
  };

  const takeByType = (types: string[]): RecommendationRow | null => {
    const index = remaining.findIndex((row) => types.includes(row.recommendation_type));
    if (index < 0) return null;
    const [picked] = remaining.splice(index, 1);
    return picked ?? null;
  };

  const priorityRows = [
    takeByType(["review"]),
    takeByType(["weakness", "remediation", "recovery"]),
    takeByType(["application"]) ?? takeByType(["transfer"]),
  ].filter((row): row is RecommendationRow => !!row);

  for (let index = 0; index < priorityRows.length; index += 1) {
    const reserveMinutesAfter = (priorityRows.length - index - 1) * 5;
    if (!scheduleRow(priorityRows[index], reserveMinutesAfter)) {
      remaining.push(priorityRows[index]);
    }
  }

  for (let index = 0; index < remaining.length;) {
    const row = remaining[index];
    if (scheduleRow(row)) {
      remaining.splice(index, 1);
      continue;
    }
    index += 1;
  }

  return {
    tasks,
    carryoverTasks: remaining.map((row) =>
      recommendationToHubPlanTask(
        row,
        Math.max(5, Math.min(40, Math.floor(Number(row.estimated_minutes ?? 10)))),
      )
    ),
    totalEstimatedMinutes: usedMinutes,
  };
};

export const deriveMasteryReopenUpdate = (
  row: Record<string, unknown>,
  input: {
    reason: string;
    metadata?: JsonRecord | null;
    nowIso?: string;
  },
): MasteryReopenDerivation | null => {
  const currentState = toText(row.state, 32).toLowerCase();
  if (currentState !== "stable" && currentState !== "mastered") return null;

  const previousConfidence = clamp(toNumber(row.confidence) ?? 0.7, 0, 1);
  const sourceServiceKey = normalizeServiceKey(row.service_key) ?? null;
  const updatedAt = toText(input.nowIso, 64) || new Date().toISOString();
  const metadata = {
    ...(asRecord(row.metadata)),
    ...(input.metadata ?? {}),
    transfer_reopened_by: "immersion-missions",
    transfer_reopened_reason: input.reason,
    transfer_reopened_at: updatedAt,
  };

  return {
    sourceServiceKey,
    previousState: currentState,
    previousConfidence,
    update: {
      state: "unstable",
      confidence: roundTo(clamp(Math.max(0.25, previousConfidence * 0.72), 0, 1), 4),
      failure_count: Math.max(0, Number(row.failure_count ?? 0)) + 1,
      reopened_count: Math.max(0, Number(row.reopened_count ?? 0)) + 1,
      metadata,
      updated_at: updatedAt,
    },
    analyticsPayload: {
      reason: input.reason,
      previous_state: currentState,
      previous_confidence: previousConfidence,
      reopened_unit_key: toText(row.unit_key, 160),
      reopened_skill_key: toText(row.skill_key, 120),
      reopened_count: Math.max(0, Number(row.reopened_count ?? 0)) + 1,
      ...metadata,
    },
  };
};

const pickContentItemForService = async (
  sb: any,
  languageId: string,
  serviceKey: EnglishServiceKey,
): Promise<ContentRegistryRow | null> => {
  const { data } = await sb
    .from("learning_content_registry_items")
    .select("*")
    .eq("language_id", languageId)
    .eq("service_key", serviceKey)
    .eq("status", "published")
    .order("difficulty", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(1);

  const rows = Array.isArray(data) ? data : [];
  return rows[0] ? (rows[0] as ContentRegistryRow) : null;
};

const buildRecommendationTitle = (type: string, serviceKey: EnglishServiceKey): string => {
  if (type === "review" && serviceKey === "vocabulary") return "Review due vocabulary cards";
  if (type === "activation" && serviceKey === "vocabulary") return "Activate saved vocabulary in real tasks";
  if (type === "remediation" && serviceKey === "grammar") return "Repair repeated grammar errors";
  if (type === "recovery" && serviceKey === "listening") return "Controlled listening recovery loop";
  if (type === "recovery" && serviceKey === "writing") return "Guided writing recovery task";
  if (type === "application" && serviceKey === "immersion") return "Validate progress in an immersion mission";
  if (type === "application") return `Apply progress in ${SERVICE_LABELS[serviceKey]}`;
  if (type === "transfer") return `Transfer progress into ${SERVICE_LABELS[serviceKey]}`;
  return `Focused ${SERVICE_LABELS[serviceKey]} task`;
};

export const rebuildRecommendationsForUser = async (
  sb: any,
  input: {
    userId: string;
    languageId: string;
    products: Record<EnglishServiceKey, EnglishProductInfo>;
  },
): Promise<RecommendationRow[]> => {
  const rules = await loadEnglishRuleConfigs(sb, input.languageId);
  const grammarRule = rules.grammar_remediation ?? DEFAULT_ENGLISH_RULE_CONFIGS.grammar_remediation;
  const vocabularyRule = rules.vocabulary_activation ?? DEFAULT_ENGLISH_RULE_CONFIGS.vocabulary_activation;
  const listeningRule = rules.listening_recovery ?? DEFAULT_ENGLISH_RULE_CONFIGS.listening_recovery;
  const writingRule = rules.writing_recovery ?? DEFAULT_ENGLISH_RULE_CONFIGS.writing_recovery;
  const speakingRule = rules.speaking_transfer ?? DEFAULT_ENGLISH_RULE_CONFIGS.speaking_transfer;
  const immersionRule = rules.immersion_application ?? DEFAULT_ENGLISH_RULE_CONFIGS.immersion_application;

  const preloadTriggerState = evaluateRecommendationTriggers({
    rules,
    notebookStats: {
      dueCount: 0,
      totalCount: 0,
      activationCandidateCount: 0,
    },
    grammarErrors: [],
    listeningPatternCounts: {},
    writingRecoveryCount: 0,
    speakingGrammarIssuesCount: 0,
    stableGrammarUnitsCount: 0,
    stableTransferUnitsCount: 0,
  });

  const [languageProfileRes, notebookStats, goalsRes, activeGrammarErrorsRes, masteryRes, listeningRecoveryRes, writingRecoveryRes, speakingGrammarRes] = await Promise.all([
    sb
      .from("learner_language_profiles")
      .select("profile, service_breakdown")
      .eq("user_id", input.userId)
      .eq("language_id", input.languageId)
      .maybeSingle(),
    loadNotebookStats(sb, input.userId, input.languageId, preloadTriggerState.vocabularyIdleDays),
    sb
      .from("learner_language_goals")
      .select("*")
      .eq("user_id", input.userId)
      .eq("language_id", input.languageId)
      .maybeSingle(),
    sb
      .from("learner_language_errors")
      .select("*")
      .eq("user_id", input.userId)
      .eq("language_id", input.languageId)
      .eq("skill_key", "grammar")
      .gte("last_seen_at", new Date(Date.now() - (preloadTriggerState.grammarLookbackDays * 24 * 60 * 60 * 1000)).toISOString())
      .order("severity_score", { ascending: false }),
    sb
      .from("learner_language_mastery")
      .select("*")
      .eq("user_id", input.userId)
      .eq("language_id", input.languageId)
      .in("state", ["stable", "mastered"]),
    sb
      .from("learning_attempts")
      .select("content_item_id, correctness_ratio, created_at")
      .eq("user_id", input.userId)
      .eq("language_id", input.languageId)
      .eq("service_key", "listening")
      .lt("correctness_ratio", preloadTriggerState.listeningAccuracyBelow)
      .gte("created_at", new Date(Date.now() - (preloadTriggerState.listeningLookbackDays * 24 * 60 * 60 * 1000)).toISOString())
      .order("created_at", { ascending: false })
      .limit(30),
    sb
      .from("learning_attempts")
      .select("id")
      .eq("user_id", input.userId)
      .eq("language_id", input.languageId)
      .eq("service_key", "writing")
      .lt("correction_quality_ratio", preloadTriggerState.writingQualityBelow)
      .gte("created_at", new Date(Date.now() - (preloadTriggerState.writingLookbackDays * 24 * 60 * 60 * 1000)).toISOString())
      .order("created_at", { ascending: false })
      .limit(10),
    sb
      .from("learner_language_errors")
      .select("*")
      .eq("user_id", input.userId)
      .eq("language_id", input.languageId)
      .eq("service_key", "speaking")
      .eq("skill_key", "grammar")
      .order("severity_score", { ascending: false })
      .limit(5),
  ]);

  const languageProfile = asRecord(languageProfileRes.data?.profile);
  const serviceBreakdown = asRecord(languageProfileRes.data?.service_breakdown);
  const serviceReadiness = computeServiceReadiness(languageProfile, serviceBreakdown).sort((a, b) => a.score - b.score);
  const weakestService = serviceReadiness[0]?.serviceKey ?? "reading";
  const weakestScore = serviceReadiness[0]?.score ?? 70;
  const dailyMinutes = Math.max(5, Math.min(240, Number(goalsRes.data?.daily_time_minutes ?? 40)));
  const grammarErrors = Array.isArray(activeGrammarErrorsRes.data) ? activeGrammarErrorsRes.data as Array<Record<string, unknown>> : [];
  const stableMasteryRows = Array.isArray(masteryRes.data) ? masteryRes.data as Array<Record<string, unknown>> : [];
  const stableGrammarUnits = Array.isArray(masteryRes.data)
    ? (masteryRes.data as Array<Record<string, unknown>>).filter((row) => String(row.service_key ?? "") === "grammar")
    : [];
  const stableTransferUnits = stableMasteryRows.filter((row) => String(row.service_key ?? "") !== "immersion");
  const listeningRows = Array.isArray(listeningRecoveryRes.data) ? listeningRecoveryRes.data as Array<Record<string, unknown>> : [];
  const writingRecoveryCount = Array.isArray(writingRecoveryRes.data) ? writingRecoveryRes.data.length : 0;
  const speakingGrammarIssues = Array.isArray(speakingGrammarRes.data) ? speakingGrammarRes.data as Array<Record<string, unknown>> : [];
  const triggerState = evaluateRecommendationTriggers({
    rules,
    notebookStats,
    grammarErrors,
    listeningPatternCounts: countListeningRecoveryPatterns(listeningRows),
    writingRecoveryCount,
    speakingGrammarIssuesCount: speakingGrammarIssues.length,
    stableGrammarUnitsCount: stableGrammarUnits.length,
    stableTransferUnitsCount: stableTransferUnits.length,
  });
  const stableTransferSourceService = normalizeServiceKey(stableTransferUnits[0]?.service_key ?? null);
  const listeningPatternKey = triggerState.listeningRecoveryEntry?.[0] ?? null;

  const buildRecommendation = async (
    serviceKey: EnglishServiceKey,
    type: string,
    reason: string,
    priority: number,
    estimatedMinutes: number,
    contentItem?: ContentRegistryRow | null,
    details?: {
      ruleKey?: string;
      sourceServiceKey?: EnglishServiceKey | null;
      sourceAttemptId?: string | null;
      sourceErrorId?: string | null;
      payload?: JsonRecord;
      metadata?: JsonRecord;
    },
  ) => {
    const product = input.products[serviceKey];
    const intent = type === "transfer" ? retryIntentForService(serviceKey) : retryIntentForService(serviceKey);
    return {
      user_id: input.userId,
      language_id: input.languageId,
      recommended_product_id: product?.productId ?? null,
      recommended_content_item_id: contentItem?.id ?? null,
      recommended_service_key: serviceKey,
      recommendation_type: type,
      title: buildRecommendationTitle(type, serviceKey),
      reason,
      intent,
      skill_key: contentItem?.skill_key ?? serviceKey,
      priority,
      estimated_minutes: estimatedMinutes,
      source_attempt_id: details?.sourceAttemptId ?? null,
      source_error_id: details?.sourceErrorId ?? null,
      status: "active",
      expires_at: new Date(Date.now() + (3 * 24 * 60 * 60 * 1000)).toISOString(),
      payload: {
        dashboard_href: buildDashboardHref(product?.appUrl ?? null, {
          intent,
          skill: contentItem?.skill_key ?? serviceKey,
          reason: type,
        }),
        content_item_id: contentItem?.id ?? null,
        source_ref: contentItem?.source_ref ?? null,
        minutes_budget: dailyMinutes,
        source_service_key: details?.sourceServiceKey ?? null,
        rule_key: details?.ruleKey ?? type,
        success_window_days: triggerState.handoffSuccessWindowDays,
        success_score_threshold: triggerState.handoffSuccessScore,
        ...(details?.payload ?? {}),
      },
      metadata: {
        generated_by: "recommendations.rules.v1",
        rule_key: details?.ruleKey ?? type,
        source_service_key: details?.sourceServiceKey ?? null,
        success_window_days: triggerState.handoffSuccessWindowDays,
        success_score_threshold: triggerState.handoffSuccessScore,
        ...(details?.metadata ?? {}),
      },
    };
  };

  const recommendations: Array<Record<string, unknown>> = [];
  if (notebookStats.dueCount > 0) {
    recommendations.push(await buildRecommendation(
      "vocabulary",
      "review",
      `${notebookStats.dueCount} vocabulary cards are due in the shared notebook.`,
      100,
      Math.min(12, Math.max(6, notebookStats.dueCount)),
      null,
      {
        ruleKey: "vocabulary_due_review",
        sourceServiceKey: "vocabulary",
        payload: {
          due_count: notebookStats.dueCount,
        },
      },
    ));
  }

  const weakestContent = await pickContentItemForService(sb, input.languageId, weakestService);
  recommendations.push(await buildRecommendation(
    weakestService,
    "weakness",
    `${SERVICE_LABELS[weakestService]} is the weakest current area at ${weakestScore}% readiness.`,
    92,
    weakestContent?.estimated_minutes ?? 12,
    weakestContent,
    {
      ruleKey: "weakness_routing",
      sourceServiceKey: weakestService,
      payload: {
        readiness_score: weakestScore,
      },
    },
  ));

  if (triggerState.repeatedGrammarError) {
    recommendations.push(await buildRecommendation(
      "grammar",
      "remediation",
      "Repeated grammar errors crossed the 3 times in 7 days threshold.",
      Math.max(1, Math.floor(toNumber(grammarRule.thresholds.priority) ?? 90)),
      Math.max(5, Math.floor(toNumber(grammarRule.thresholds.estimated_minutes) ?? 12)),
      null,
      {
        ruleKey: "grammar_remediation",
        sourceServiceKey: normalizeServiceKey(triggerState.grammarTriggerError?.service_key ?? null),
        sourceErrorId: triggerState.grammarTriggerError?.id ? String(triggerState.grammarTriggerError.id) : null,
        payload: {
          error_frequency: Number(triggerState.grammarTriggerError?.error_frequency ?? 0),
          lookback_days: triggerState.grammarLookbackDays,
        },
      },
    ));
  }

  if (triggerState.vocabularyActivationNeeded) {
    recommendations.push(await buildRecommendation(
      "vocabulary",
      "activation",
      `${notebookStats.activationCandidateCount} saved vocabulary items still need real use after ${triggerState.vocabularyIdleDays} days.`,
      Math.max(1, Math.floor(toNumber(vocabularyRule.thresholds.priority) ?? 88)),
      Math.max(5, Math.floor(toNumber(vocabularyRule.thresholds.estimated_minutes) ?? 10)),
      null,
      {
        ruleKey: "vocabulary_activation",
        sourceServiceKey: "vocabulary",
        payload: {
          activation_candidate_count: notebookStats.activationCandidateCount,
          idle_days: triggerState.vocabularyIdleDays,
        },
      },
    ));

    recommendations.push(await buildRecommendation(
      "speaking",
      "transfer",
      `Use ${notebookStats.activationCandidateCount} saved vocabulary items in a speaking response so they move from memory into real use.`,
      Math.max(1, Math.floor(toNumber(vocabularyRule.thresholds.priority) ?? 88) - 2),
      Math.max(5, Math.floor(toNumber(vocabularyRule.thresholds.estimated_minutes) ?? 10)),
      null,
      {
        ruleKey: "vocabulary_transfer",
        sourceServiceKey: "vocabulary",
        payload: {
          activation_candidate_count: notebookStats.activationCandidateCount,
          idle_days: triggerState.vocabularyIdleDays,
          activation_target_service: "speaking",
        },
      },
    ));
  }

  if (triggerState.hasListeningRecovery) {
    recommendations.push(await buildRecommendation(
      "listening",
      "recovery",
      `Listening accuracy stayed below ${Math.round(triggerState.listeningAccuracyBelow * 100)}% on the same pattern ${triggerState.listeningRepeatCount} times.`,
      Math.max(1, Math.floor(toNumber(listeningRule.thresholds.priority) ?? 86)),
      Math.max(5, Math.floor(toNumber(listeningRule.thresholds.estimated_minutes) ?? 12)),
      null,
      {
        ruleKey: "listening_recovery",
        sourceServiceKey: "listening",
        payload: {
          pattern_key: listeningPatternKey,
          repeat_count: triggerState.listeningRecoveryEntry?.[1] ?? 0,
          accuracy_below: triggerState.listeningAccuracyBelow,
          lookback_days: triggerState.listeningLookbackDays,
        },
      },
    ));
  }

  if (triggerState.writingNeedsRecovery) {
    recommendations.push(await buildRecommendation(
      "writing",
      "recovery",
      `Writing revision quality stayed low across the last ${triggerState.writingLowAttempts} recovery cycles.`,
      Math.max(1, Math.floor(toNumber(writingRule.thresholds.priority) ?? 84)),
      Math.max(5, Math.floor(toNumber(writingRule.thresholds.estimated_minutes) ?? 12)),
      null,
      {
        ruleKey: "writing_recovery",
        sourceServiceKey: "writing",
        payload: {
          low_attempts: writingRecoveryCount,
          quality_below: triggerState.writingQualityBelow,
          lookback_days: triggerState.writingLookbackDays,
        },
      },
    ));
  }

  if (triggerState.speakingTransferNeeded) {
    recommendations.push(await buildRecommendation(
      "speaking",
      "transfer",
      "Speaking grammar still looks weak even though grammar drills are already stable.",
      Math.max(1, Math.floor(toNumber(speakingRule.thresholds.priority) ?? 83)),
      Math.max(5, Math.floor(toNumber(speakingRule.thresholds.estimated_minutes) ?? 10)),
      null,
      {
        ruleKey: "speaking_transfer",
        sourceServiceKey: triggerState.speakingRequiresStableGrammar ? "grammar" : "speaking",
        sourceErrorId: speakingGrammarIssues[0]?.id ? String(speakingGrammarIssues[0].id) : null,
        payload: {
          issue_count: speakingGrammarIssues.length,
          stable_grammar_units: stableGrammarUnits.length,
        },
      },
    ));
  }

  if (triggerState.immersionApplicationNeeded) {
    const immersionContent = await pickContentItemForService(sb, input.languageId, "immersion");
    recommendations.push(await buildRecommendation(
      "immersion",
      "application",
      "Use an immersion mission to validate whether isolated skill work transfers into real English use.",
      Math.max(1, Math.floor(toNumber(immersionRule.thresholds.priority) ?? 82)),
      immersionContent?.estimated_minutes ?? Math.max(5, Math.floor(toNumber(immersionRule.thresholds.estimated_minutes) ?? 15)),
      immersionContent,
      {
        ruleKey: "immersion_application",
        sourceServiceKey: stableTransferSourceService,
        payload: {
          stable_unit_count: stableTransferUnits.length,
        },
      },
    ));
  }

  const transferService = transferTargetForService(weakestService);
  recommendations.push(await buildRecommendation(
    transferService,
    "application",
    `Use ${SERVICE_LABELS[transferService]} to transfer progress out of ${SERVICE_LABELS[weakestService]}.`,
    80,
    10,
    null,
    {
      ruleKey: "transfer_route",
      sourceServiceKey: weakestService,
      payload: {
        source_gap: serviceReadiness[0]?.gap ?? 0,
        source_score: weakestScore,
      },
    },
  ));

  await sb
    .from("learner_language_recommendations")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("user_id", input.userId)
    .eq("language_id", input.languageId)
    .eq("status", "active");

  if (recommendations.length === 0) return [];

  const { data, error } = await sb
    .from("learner_language_recommendations")
    .insert(recommendations)
    .select("*");
  if (error) throw new Error(`Failed to insert recommendations: ${error.message}`);
  return (data ?? []) as RecommendationRow[];
};

export const loadActiveRecommendations = async (
  sb: any,
  userId: string,
  languageId: string,
): Promise<RecommendationRow[]> => {
  const { data, error } = await sb
    .from("learner_language_recommendations")
    .select("*")
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .eq("status", "active")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load recommendations: ${error.message}`);
  return (data ?? []) as RecommendationRow[];
};

export const buildDailyPlanForUser = async (
  sb: any,
  input: {
    userId: string;
    languageId: string;
    products: Record<EnglishServiceKey, EnglishProductInfo>;
    rebuild: boolean;
  },
): Promise<{
    generated_at: string;
    scope: { user_id: string; language_id: string; minutes_budget: number; plan_date: string };
    urgent_reviews: { vocabulary_due_count: number };
    weakest_skills: Array<{ service_key: string; label: string; score: number; gap: number }>;
    suggested_focus: string[];
    focus_story: string;
    transfer_context: string;
    priority_tone: string;
    celebration_level: string;
    carryover_tasks: HubPlanTask[];
    today_plan: { plan_date: string; minutes_budget: number; total_estimated_minutes: number; tasks: HubPlanTask[] };
  }> => {
  const [profileRes, goalsRes, notebookStats] = await Promise.all([
    sb
      .from("learner_language_profiles")
      .select("profile, service_breakdown")
      .eq("user_id", input.userId)
      .eq("language_id", input.languageId)
      .maybeSingle(),
    sb
      .from("learner_language_goals")
      .select("*")
      .eq("user_id", input.userId)
      .eq("language_id", input.languageId)
      .maybeSingle(),
    loadNotebookStats(sb, input.userId, input.languageId),
  ]);

  const minutesBudget = Math.max(5, Math.min(240, Number(goalsRes.data?.daily_time_minutes ?? 40)));
  const serviceReadiness = computeServiceReadiness(asRecord(profileRes.data?.profile), asRecord(profileRes.data?.service_breakdown))
    .sort((a, b) => a.score - b.score);
  const weakest = serviceReadiness[0];

  let recommendations = await loadActiveRecommendations(sb, input.userId, input.languageId);
  if (input.rebuild || recommendations.length === 0) {
    recommendations = await rebuildRecommendationsForUser(sb, {
      userId: input.userId,
      languageId: input.languageId,
      products: input.products,
    });
  }
  const planned = buildHubPlanFromRecommendations(recommendations, minutesBudget);

  const planDate = new Date().toISOString().slice(0, 10);
  const focusStory = weakest
    ? notebookStats.dueCount > 0
      ? `${weakest.label} needs recovery, and ${notebookStats.dueCount} vocabulary cards are due before transfer work starts.`
      : `${weakest.label} is the main pressure point today, so the plan opens with focused repair before application work.`
    : "Your plan balances review, maintenance, and one application task across the English ecosystem.";
  const transferTask = planned.tasks.find((task) => ["application", "transfer", "activation"].includes(String(task.intent ?? "").toLowerCase()));
  const transferContext = transferTask
    ? `${SERVICE_LABELS[normalizeServiceKey(transferTask.service_key) ?? "reading"]} is your transfer checkpoint after the repair work, so progress gets validated in real use.`
    : "No transfer checkpoint was scheduled yet, so the plan stays in repair mode until more evidence is collected.";
  const weakestGap = Math.max(0, Number(weakest?.gap ?? 0));
  const priorityTone = hubToneForGap(weakestGap);
  const celebrationLevel = planned.tasks.length >= 4 && weakestGap < 28
    ? "high"
    : notebookStats.dueCount > 0 || weakestGap >= 35
    ? "steady"
    : "medium";
  const summary = {
    urgent_reviews: notebookStats.dueCount,
    weakness_service: serviceReadiness[0]?.serviceKey ?? "reading",
    tasks_count: planned.tasks.length,
    generated_by: "hub.plan.v1",
    focus_story: focusStory,
    transfer_context: transferContext,
    priority_tone: priorityTone,
    celebration_level: celebrationLevel,
  };

  await sb
    .from("learner_language_daily_plans")
    .upsert({
      user_id: input.userId,
      language_id: input.languageId,
      plan_date: planDate,
      minutes_budget: minutesBudget,
      total_estimated_minutes: planned.totalEstimatedMinutes,
      status: "active",
      tasks: planned.tasks,
      summary,
      recommendation_snapshot: recommendations.map((row) => ({
        id: row.id,
        service_key: row.recommended_service_key,
        recommendation_type: row.recommendation_type,
        priority: row.priority,
      })),
    }, { onConflict: "user_id,language_id,plan_date" });

  return {
    generated_at: new Date().toISOString(),
    scope: {
      user_id: input.userId,
      language_id: input.languageId,
      minutes_budget: minutesBudget,
      plan_date: planDate,
    },
    urgent_reviews: {
      vocabulary_due_count: notebookStats.dueCount,
    },
    weakest_skills: serviceReadiness.slice(0, 4).map((entry) => ({
      service_key: entry.serviceKey,
      label: entry.label,
      score: entry.score,
      gap: entry.gap,
    })),
    suggested_focus: serviceReadiness.slice(0, 3).map((entry) => `${entry.label}: ${entry.gap}% gap`),
    focus_story: focusStory,
    transfer_context: transferContext,
    priority_tone: priorityTone,
    celebration_level: celebrationLevel,
    carryover_tasks: planned.carryoverTasks.slice(0, 4),
    today_plan: {
      plan_date: planDate,
      minutes_budget: minutesBudget,
      total_estimated_minutes: planned.totalEstimatedMinutes,
      tasks: planned.tasks,
    },
  };
};
