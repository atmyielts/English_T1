import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  authUser,
  corsHeaders,
  getEnv,
  json,
  normalizeServiceKey,
  parseBody,
  resolveLanguageScope,
  resolveOrCreateContentItem,
  toNullableText,
  toNumber,
  toText,
} from "../_shared/english-learning.ts";

const isAdmin = async (sb: any, userId: string): Promise<boolean> => {
  const { data } = await sb.from("users").select("role").eq("id", userId).maybeSingle();
  return String((data as any)?.role ?? "").toLowerCase() === "admin";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const auth = await authUser(sb, req);
    if (!auth) return json(401, { error: "Unauthorized" });

    const url = new URL(req.url);
    const scope = await resolveLanguageScope(sb, toText(url.searchParams.get("language_code"), 16) || "en");

    if (req.method === "GET") {
      const serviceKey = normalizeServiceKey(url.searchParams.get("service_key"));
      const limit = Math.max(1, Math.min(200, Math.floor(toNumber(url.searchParams.get("limit")) ?? 50)));

      let query = sb
        .from("learning_content_registry_items")
        .select("*")
        .eq("language_id", scope.languageId)
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (serviceKey) query = query.eq("service_key", serviceKey);

      const { data, error } = await query;
      if (error) return json(500, { error: "Failed to load content registry", details: error.message });
      return json(200, {
        scope: { language_id: scope.languageId, language_code: scope.languageCode },
        items: data ?? [],
      });
    }

    if (req.method !== "POST") return json(405, { error: "Method not allowed" });
    if (!(await isAdmin(sb, auth.userId))) return json(403, { error: "Admin access required" });

    const body = await parseBody(req);
    const serviceKey = normalizeServiceKey(body.service_key);
    if (!serviceKey) return json(422, { error: "service_key is required" });

    const productId = toText(body.product_id, 80);
    if (!productId) return json(422, { error: "product_id is required" });

    const item = await resolveOrCreateContentItem(sb, {
      productId,
      languageId: scope.languageId,
      serviceKey,
      contentType: toNullableText(body.content_type, 80),
      sourceRef: toNullableText(body.source_ref, 160),
      title: toNullableText(body.title, 220),
      description: toNullableText(body.description, 900),
      skillKey: toNullableText(body.skill_key, 120),
      subskillKeys: Array.isArray(body.subskill_keys)
        ? body.subskill_keys.map((entry) => String(entry ?? "")).filter(Boolean)
        : null,
      cefrLevel: toNullableText(body.cefr_level, 8),
      difficulty: toNumber(body.difficulty),
      estimatedMinutes: toNumber(body.estimated_minutes),
      learningObjective: toNullableText(body.learning_objective, 900),
      tags: Array.isArray(body.tags) ? body.tags.map((entry) => String(entry ?? "")).filter(Boolean) : null,
      payloadJson: body.payload_json && typeof body.payload_json === "object" ? body.payload_json as Record<string, unknown> : {},
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata as Record<string, unknown> : {},
    });

    return json(200, {
      ok: true,
      item,
      scope: { language_id: scope.languageId, language_code: scope.languageCode },
    });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
