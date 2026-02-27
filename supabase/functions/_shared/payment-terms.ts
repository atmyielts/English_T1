type JsonObject = Record<string, unknown>;

export type PlanTermsSource = {
  id: string;
  product_id: string;
  name?: string | null;
  amount?: number | null;
  currency?: string | null;
  duration_days?: number | null;
  metadata?: JsonObject | null;
};

export type EntitlementTerms = {
  source_plan_id: string | null;
  duration_days: number | null;
  included_product_ids: string[];
  limits: Record<string, number>;
  captured_at: string;
};

const looksLikeUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const isObject = (value: unknown): value is JsonObject =>
  !!value && typeof value === "object" && !Array.isArray(value);

const normalizePositiveInt = (raw: unknown): number | null => {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const out = Math.floor(n);
  return out > 0 ? out : null;
};

const normalizeDurationDays = (raw: unknown): number | null => {
  if (raw === null || typeof raw === "undefined") return null;
  return normalizePositiveInt(raw);
};

export const extractIncludedProductIds = (meta: unknown): string[] => {
  if (!isObject(meta)) return [];
  const raw = meta.included_product_ids;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => String(v ?? "").trim())
    .filter((v) => looksLikeUuid(v));
};

export const extractPlanLimits = (meta: unknown): Record<string, number> => {
  if (!isObject(meta)) return {};
  const raw = meta.limits;
  if (!isObject(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    const num = normalizePositiveInt(value);
    if (num !== null) out[String(key)] = num;
  }
  return out;
};

export const buildEntitlementTerms = (plan: PlanTermsSource): EntitlementTerms => ({
  source_plan_id: plan.id ?? null,
  duration_days: normalizeDurationDays(plan.duration_days),
  included_product_ids: extractIncludedProductIds(plan.metadata ?? null),
  limits: extractPlanLimits(plan.metadata ?? null),
  captured_at: new Date().toISOString(),
});

export const buildPlanSnapshot = (plan: PlanTermsSource): JsonObject => ({
  id: plan.id,
  product_id: plan.product_id,
  name: plan.name ?? null,
  amount: plan.amount ?? null,
  currency: plan.currency ?? null,
  duration_days: normalizeDurationDays(plan.duration_days),
  metadata: isObject(plan.metadata) ? plan.metadata : {},
  captured_at: new Date().toISOString(),
});

export const parseEntitlementTerms = (raw: unknown): EntitlementTerms | null => {
  if (!isObject(raw)) return null;
  const sourcePlanId = raw.source_plan_id ? String(raw.source_plan_id) : null;
  const included = Array.isArray(raw.included_product_ids)
    ? raw.included_product_ids.map((v) => String(v ?? "").trim()).filter((v) => looksLikeUuid(v))
    : [];
  const limits = extractPlanLimits({ limits: raw.limits });
  const durationDays = normalizeDurationDays(raw.duration_days);
  const capturedAt = typeof raw.captured_at === "string" && raw.captured_at.trim()
    ? raw.captured_at
    : new Date().toISOString();

  const hasPayload =
    sourcePlanId !== null ||
    Array.isArray(raw.included_product_ids) ||
    typeof raw.duration_days !== "undefined" ||
    isObject(raw.limits);

  if (!hasPayload) return null;

  return {
    source_plan_id: sourcePlanId,
    duration_days: durationDays,
    included_product_ids: included,
    limits,
    captured_at: capturedAt,
  };
};
