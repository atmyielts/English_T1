// POST /functions/v1/toefl-speaking { session_id, force? }
// Scores the Speaking items of a completed TOEFL iBT 2026 session from the
// browser transcripts saved with each answer, stores the estimate as the
// `ai_speaking` evaluation (read by score-session) and returns it.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { UNIT_SPEAKING_INTERVIEW, UNIT_SPEAKING_REPEAT } from "../_shared/toefl-2026.ts";
import { isToefl2026Experience } from "../_shared/toefl-2026-session.ts";
import { TOEFL_2026_FREE_MODEL } from "../_shared/toefl-2026-writing.ts";
import { createOpenRouterInterviewRater, scoreSpeakingItems, type SpeakingItemInput } from "./scoring.ts";

type Json = Record<string, unknown>;

const TOEFL_PRODUCT_ID = "b262ffa8-9912-4eba-93d7-58af3164d1cc";
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
const env = (key: string): string | null => {
  const v = Deno.env.get(key)?.trim();
  return v ? v : null;
};
const isRecord = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed", code: "method_not_allowed" });
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  try {
    const url = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json(503, { error: "Service is temporarily unavailable.", code: "service_not_configured" });
    const header = req.headers.get("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : header;
    if (!token) return json(401, { error: "Unauthorized", code: "unauthorized" });
    const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: authData, error: authError } = await sb.auth.getUser(token);
    const userId = authData?.user?.id ?? null;
    if (authError || !userId) return json(401, { error: "Unauthorized", code: "unauthorized" });

    const body = await req.json().catch(() => ({})) as Json;
    const sessionId = String(body.session_id ?? "");
    const force = body.force === true;
    if (!sessionId) return json(400, { error: "session_id is required", code: "bad_request" });

    const { data: userRow } = await sb.from("users").select("role").eq("id", userId).maybeSingle();
    const isAdmin = String(userRow?.role ?? "").toLowerCase().startsWith("admin");
    const { data: session } = await sb.from("sessions").select("id, user_id, experience_id, status, metadata").eq("id", sessionId).maybeSingle();
    if (!session) return json(404, { error: "Session not found", code: "not_found" });
    if (session.user_id !== userId && !isAdmin) return json(403, { error: "Forbidden", code: "forbidden" });
    if (String(session.status) !== "completed") return json(409, { error: "Session is not completed.", code: "session_not_completed" });

    const { data: experience } = await sb.from("experiences").select("id, product_id, metadata").eq("id", session.experience_id).maybeSingle();
    if (!experience || String(experience.product_id) !== TOEFL_PRODUCT_ID || !isToefl2026Experience(experience.metadata)) {
      return json(400, { error: "Not a TOEFL iBT 2026 test.", code: "not_toefl_2026" });
    }

    if (!force) {
      const { data: existing } = await sb.from("evaluations").select("id, method, status, result, evaluated_at")
        .eq("session_id", sessionId).eq("method", "ai_speaking").maybeSingle();
      if (existing) return json(200, { evaluation: existing });
    }

    const allowed = Array.isArray(session.metadata?.allowed_section_ids) ? (session.metadata.allowed_section_ids as unknown[]).map(String) : [];
    const { data: sections } = await sb.from("sections").select("id, metadata").eq("experience_id", experience.id);
    const speakingSectionIds = ((sections ?? []) as Array<{ id: string; metadata: Json | null }>)
      .filter((s) => String(s.metadata?.type ?? "") === "speaking" && (allowed.length === 0 || allowed.includes(s.id)))
      .map((s) => s.id);
    if (speakingSectionIds.length === 0) return json(400, { error: "No speaking section in this session.", code: "no_speaking_section" });

    const { data: parts } = await sb.from("parts").select("id, section_id, display_order").in("section_id", speakingSectionIds);
    const partIds = ((parts ?? []) as Array<{ id: string }>).map((p) => p.id);
    const partOrder = new Map(((parts ?? []) as Array<{ id: string; display_order: number }>).map((p) => [p.id, p.display_order]));
    const { data: unitRows } = await sb.from("content_units").select("id, part_id, type, display_order").in("part_id", partIds);
    const units = ((unitRows ?? []) as Array<{ id: string; part_id: string; type: string; display_order: number }>)
      .filter((u) => u.type === UNIT_SPEAKING_REPEAT || u.type === UNIT_SPEAKING_INTERVIEW)
      .sort((a, b) => (partOrder.get(a.part_id) ?? 0) - (partOrder.get(b.part_id) ?? 0) || a.display_order - b.display_order);
    const unitIds = units.map((u) => u.id);
    if (unitIds.length === 0) return json(400, { error: "No speaking items in this session.", code: "no_speaking_items" });

    const { data: keys } = await sb.from("answer_keys").select("content_unit_id, correct").in("content_unit_id", unitIds);
    const keyBy = new Map(((keys ?? []) as Array<{ content_unit_id: string; correct: unknown }>).map((k) => [k.content_unit_id, k.correct]));
    const { data: responses } = await sb.from("responses").select("content_unit_id, data, submitted_at")
      .eq("session_id", sessionId).in("content_unit_id", unitIds).order("submitted_at", { ascending: true });
    const latest = new Map<string, unknown>();
    for (const r of (responses ?? []) as Array<{ content_unit_id: string; data: unknown }>) latest.set(r.content_unit_id, r.data);

    const items: SpeakingItemInput[] = units.map((u) => {
      const correct = keyBy.get(u.id);
      const reference = isRecord(correct)
        ? String((u.type === UNIT_SPEAKING_REPEAT ? correct.text : correct.question_text) ?? "")
        : "";
      return { content_unit_id: u.id, type: u.type, reference, response: latest.get(u.id) };
    });

    // AI interview rating respects the platform AI switch and daily limit; otherwise the basic estimate is used.
    let aiAllowed = false;
    const apiKey = env("OPENROUTER_API_KEY");
    if (apiKey) {
      const { data: settings } = await sb.from("platform_settings").select("writing_ai_enabled, writing_ai_daily_limit").eq("id", 1).maybeSingle();
      const enabled = Boolean(settings?.writing_ai_enabled ?? true);
      const limit = Math.max(0, Math.floor(Number(settings?.writing_ai_daily_limit ?? 0) || 0));
      if (isAdmin) aiAllowed = true;
      else if (enabled && limit > 0) {
        const now = new Date();
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
        const { count } = await sb.from("ai_usage_events").select("id", { count: "exact", head: true })
          .eq("user_id", userId).eq("kind", "toefl-speaking").gte("created_at", start);
        aiAllowed = (count ?? 0) < limit;
      }
    }
    const model = env("TOEFL_SPEAKING_MODEL") ?? env("OPENROUTER_MODEL") ?? TOEFL_2026_FREE_MODEL;
    const rater = aiAllowed && apiKey
      ? createOpenRouterInterviewRater({
        apiKey,
        models: Array.from(new Set([model, TOEFL_2026_FREE_MODEL])),
        baseUrl: env("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1",
        referer: env("OPENROUTER_REFERER") ?? "https://toefl.schood.online",
      })
      : null;

    const scored = await scoreSpeakingItems(items, rater);
    const nowIso = new Date().toISOString();
    const result = {
      items: scored.items,
      unscored: scored.unscored,
      scope: "transcript_only",
      scale: "0-5",
      score_version: "toefl-2026-speaking-estimate-v1",
      is_estimated: true,
      interview_rater: scored.ai_used ? "ai" : "basic",
      model: scored.ai_used ? model : null,
      graded_at: nowIso,
    };
    const { data: evaluation, error: evalError } = await sb.from("evaluations").upsert(
      { session_id: sessionId, method: "ai_speaking", status: "completed", result, evaluated_at: nowIso },
      { onConflict: "session_id,method" },
    ).select("id, method, status, result, evaluated_at").maybeSingle();
    if (evalError) {
      console.error("toefl-speaking: failed to write evaluation", { request_id: requestId, error: evalError.message });
      return json(500, { error: "Service is temporarily unavailable.", code: "db_error", request_id: requestId });
    }
    if (scored.ai_used) {
      await sb.from("ai_usage_events").insert({
        user_id: userId, kind: "toefl-speaking", session_id: sessionId,
        metadata: { model, status: "success", request_id: requestId },
      });
    }
    return json(200, { evaluation });
  } catch (err) {
    console.error("toefl-speaking: unhandled", { request_id: requestId, message: err instanceof Error ? err.message : String(err) });
    return json(500, { error: "Speaking estimate is temporarily unavailable.", code: "internal_error", request_id: requestId });
  }
});
