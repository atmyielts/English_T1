import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAdminRequest } from "../_shared/admin-access.ts";

type JsonRecord = Record<string, unknown>;

type MappingPatch = {
  product_id?: string;
  language_id?: string;
  language_code?: string;
  included_in_shared_profile?: boolean;
  metadata?: JsonRecord;
};

type WeightPatch = {
  language_id?: string;
  language_code?: string;
  source_type?: string;
  skill_key?: string;
  metric_key?: string;
  weight?: number;
  max_age_days?: number | null;
  half_life_days?: number | null;
  metadata?: JsonRecord;
};

type PatchBody = {
  mappings?: MappingPatch[];
  weights?: WeightPatch[];
  rebuild?: {
    language_id?: string;
    language_code?: string;
    user_id?: string;
  };
};

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

const normalizeText = (value: unknown, maxLen = 120): string => String(value ?? "").trim().slice(0, maxLen);

const normalizePositiveNumber = (value: unknown): number | null => {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
};

const normalizeOptionalPositiveInt = (value: unknown): number | null => {
  if (value == null) return null;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.floor(num);
};

const isObject = (value: unknown): value is JsonRecord => !!value && typeof value === "object" && !Array.isArray(value);

const resolveLanguageId = async (
  sb: any,
  languageIdRaw: unknown,
  languageCodeRaw: unknown,
): Promise<string | null> => {
  const languageId = normalizeText(languageIdRaw, 80);
  if (languageId) {
    const { data } = await sb.from("languages").select("id").eq("id", languageId).maybeSingle();
    if (data) return String((data as any).id);
  }

  const languageCode = normalizeText(languageCodeRaw, 24).toLowerCase();
  if (languageCode) {
    const { data } = await sb.from("languages").select("id").eq("code", languageCode).maybeSingle();
    if (data) return String((data as any).id);
  }

  return null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
      requiredPermission: "admin.settings.manage",
      action: "admin.language_config",
    });
    if (!authz.ok) return authz.response;

    const url = new URL(req.url);
    const scope = normalizeText(url.searchParams.get("scope"), 32).toLowerCase() || "mappings";

    if (req.method === "GET") {
      if (scope === "languages") {
        const { data, error } = await sb
          .from("languages")
          .select("id, code, name, status, metadata, created_at, updated_at")
          .order("code", { ascending: true });
        if (error) return json(500, { error: "Failed to load languages", details: error });
        return json(200, { languages: data ?? [] });
      }

      if (scope === "weights") {
        const languageId = normalizeText(url.searchParams.get("language_id"), 80);
        const languageCode = normalizeText(url.searchParams.get("language_code"), 24).toLowerCase();

        let query = sb
          .from("language_signal_weights")
          .select("language_id, source_type, skill_key, metric_key, weight, max_age_days, half_life_days, metadata, created_at, updated_at")
          .order("updated_at", { ascending: false })
          .limit(500);

        if (languageId) query = query.eq("language_id", languageId);
        if (languageCode) {
          const resolvedLanguageId = await resolveLanguageId(sb, null, languageCode);
          if (!resolvedLanguageId) return json(404, { error: "language_code not found" });
          query = query.eq("language_id", resolvedLanguageId);
        }

        const { data, error } = await query;
        if (error) return json(500, { error: "Failed to load language weights", details: error });
        return json(200, { weights: data ?? [] });
      }

      const { data, error } = await sb
        .from("product_languages")
        .select(
          "product_id, language_id, included_in_shared_profile, metadata, updated_at, products!inner(id, name, metadata), languages!inner(id, code, name, status)",
        )
        .order("updated_at", { ascending: false })
        .limit(500);

      if (error) return json(500, { error: "Failed to load product-language mappings", details: error });
      return json(200, { mappings: data ?? [] });
    }

    if (req.method !== "PATCH") return json(405, { error: "Method not allowed" });

    const bodyRaw = await req.json();
    const body = isObject(bodyRaw) ? (bodyRaw as PatchBody) : {};

    const mappingRows: Array<Record<string, unknown>> = [];
    const weightRows: Array<Record<string, unknown>> = [];
    const touchedLanguageIds = new Set<string>();

    for (const patch of Array.isArray(body.mappings) ? body.mappings : []) {
      const productId = normalizeText(patch?.product_id, 80);
      if (!productId) continue;

      const languageId = await resolveLanguageId(sb, patch?.language_id, patch?.language_code);
      if (!languageId) {
        return json(400, { error: `Could not resolve language for product_id=${productId}` });
      }

      mappingRows.push({
        product_id: productId,
        language_id: languageId,
        included_in_shared_profile: patch?.included_in_shared_profile !== false,
        metadata: isObject(patch?.metadata) ? patch.metadata : {},
      });
      touchedLanguageIds.add(languageId);
    }

    for (const patch of Array.isArray(body.weights) ? body.weights : []) {
      const languageId = await resolveLanguageId(sb, patch?.language_id, patch?.language_code);
      if (!languageId) {
        return json(400, { error: "Could not resolve language for one or more weight rows" });
      }

      const sourceType = normalizeText(patch?.source_type ?? "*", 80) || "*";
      const skillKey = normalizeText(patch?.skill_key ?? "*", 80) || "*";
      const metricKey = normalizeText(patch?.metric_key ?? "*", 80) || "*";
      const weight = normalizePositiveNumber(patch?.weight ?? 1);
      if (weight == null) {
        return json(400, { error: "weight must be a positive number" });
      }

      weightRows.push({
        language_id: languageId,
        source_type: sourceType,
        skill_key: skillKey,
        metric_key: metricKey,
        weight,
        max_age_days: normalizeOptionalPositiveInt(patch?.max_age_days),
        half_life_days: normalizeOptionalPositiveInt(patch?.half_life_days),
        metadata: isObject(patch?.metadata) ? patch.metadata : {},
      });
      touchedLanguageIds.add(languageId);
    }

    let upsertedMappings = 0;
    let upsertedWeights = 0;

    if (mappingRows.length > 0) {
      const { data, error } = await sb
        .from("product_languages")
        .upsert(mappingRows, { onConflict: "product_id" })
        .select("product_id");
      if (error) return json(500, { error: "Failed to upsert product-language mappings", details: error });
      upsertedMappings = (data ?? []).length;
    }

    if (weightRows.length > 0) {
      const { data, error } = await sb
        .from("language_signal_weights")
        .upsert(weightRows, { onConflict: "language_id,source_type,skill_key,metric_key" })
        .select("language_id");
      if (error) return json(500, { error: "Failed to upsert language weights", details: error });
      upsertedWeights = (data ?? []).length;
    }

    let rebuildCount = 0;
    if (isObject(body.rebuild)) {
      const rebuildLanguageId = await resolveLanguageId(sb, body.rebuild.language_id, body.rebuild.language_code);
      const rebuildUserId = normalizeText(body.rebuild.user_id, 80) || null;
      const { data, error } = await sb.rpc("rebuild_all_learner_language_profiles", {
        p_language_id: rebuildLanguageId,
        p_user_id: rebuildUserId,
      });
      if (error) return json(500, { error: "Failed to rebuild learner language profiles", details: error });
      rebuildCount += Number(data ?? 0);
    }

    if (!isObject(body.rebuild) && touchedLanguageIds.size > 0) {
      for (const languageId of touchedLanguageIds) {
        const { data, error } = await sb.rpc("rebuild_all_learner_language_profiles", {
          p_language_id: languageId,
          p_user_id: null,
        });
        if (error) return json(500, { error: "Failed to rebuild learner language profiles", details: error });
        rebuildCount += Number(data ?? 0);
      }
    }

    return json(200, {
      ok: true,
      upserted_mappings: upsertedMappings,
      upserted_weights: upsertedWeights,
      rebuild_profiles: rebuildCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(500, { error: message });
  }
});
