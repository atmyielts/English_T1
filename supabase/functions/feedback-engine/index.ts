import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  authUser,
  buildFeedbackPayload,
  corsHeaders,
  getEnv,
  json,
  normalizeServiceKey,
  parseBody,
  toNullableText,
  toNumber,
} from "../_shared/english-learning.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json(405, { error: "Method not allowed" });

    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const auth = await authUser(sb, req);
    if (!auth) return json(401, { error: "Unauthorized" });

    const body = await parseBody(req);
    const serviceKey = normalizeServiceKey(body.service_key);
    if (!serviceKey) return json(422, { error: "service_key is required" });

    const payload = buildFeedbackPayload({
      serviceKey,
      score: Math.max(0, Math.min(1, toNumber(body.score) ?? 0.72)),
      title: toNullableText(body.title, 220),
      reason: toNullableText(body.reason, 400),
      issues: body.issues,
    });

    return json(200, {
      ok: true,
      feedback: payload,
    });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
