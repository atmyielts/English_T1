import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ALLOWED_EVENT_TYPES = new Set([
  "focus_loss",
  "focus_return",
  "tab_hidden",
  "tab_visible",
  "fullscreen_enter",
  "fullscreen_exit",
  "paste",
  "copy",
  "cut",
  "context_menu",
  "reload",
  "devtools_suspected",
  "auto_submit",
  "manual_submit",
  "instructions_acknowledged",
  "headphones_checked",
  "identity_acknowledged",
  "audio_blocked",
  "audio_resumed",
  "lock_warning",
  "note",
]);

const ALLOWED_SEVERITY = new Set(["info", "warn", "high"]);

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const getBearerToken = (req: Request): string | null => {
  const header = req.headers.get("Authorization") ?? "";
  if (!header) return null;
  return header.startsWith("Bearer ") ? header.slice(7) : header;
};

const safeObj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST" && req.method !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Unauthorized" });

    const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const { data: authData, error: authError } = await sb.auth.getUser(token);
    if (authError || !authData?.user) return json(401, { error: "Unauthorized" });

    const authedUserId = authData.user.id;

    const { data: userRow } = await sb.from("users").select("role").eq("id", authedUserId).maybeSingle();
    const isAdmin = String((userRow as any)?.role ?? "").toLowerCase().startsWith("admin");

    if (req.method === "GET") {
      const url = new URL(req.url);
      const sessionId = url.searchParams.get("session_id") ?? "";
      if (!sessionId) return json(400, { error: "session_id is required" });

      const { data: sessionRow, error: sessionError } = await sb
        .from("sessions")
        .select("id, user_id")
        .eq("id", sessionId)
        .maybeSingle();
      if (sessionError) return json(500, { error: "Failed to load session", details: sessionError });
      if (!sessionRow) return json(404, { error: "Session not found" });

      const ownerId = String((sessionRow as any).user_id ?? "");
      if (!isAdmin && ownerId !== authedUserId) return json(403, { error: "Forbidden" });

      const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") ?? "200")));
      const { data: events, error: eventsError } = await sb
        .from("exam_integrity_events")
        .select("id, session_id, section_id, event_type, severity, data, created_at, user_id")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (eventsError) return json(500, { error: "Failed to load events", details: eventsError });

      return json(200, { events: events ?? [] });
    }

    // POST: log an event (and update session.metadata for ack events)
    const body = (await req.json()) as Json;
    const sessionId = String((body as any)?.session_id ?? "");
    const sectionId = String((body as any)?.section_id ?? "") || null;
    const eventType = String((body as any)?.event_type ?? "");
    const severity = String((body as any)?.severity ?? "info");
    const data = safeObj((body as any)?.data);

    if (!sessionId) return json(400, { error: "session_id is required" });
    if (!ALLOWED_EVENT_TYPES.has(eventType)) return json(400, { error: "Invalid event_type" });
    if (!ALLOWED_SEVERITY.has(severity)) return json(400, { error: "Invalid severity" });

    const { data: sessionRow, error: sessionError } = await sb
      .from("sessions")
      .select("id, user_id, metadata, status")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError) return json(500, { error: "Failed to load session", details: sessionError });
    if (!sessionRow) return json(404, { error: "Session not found" });

    const ownerId = String((sessionRow as any).user_id ?? "");
    if (!isAdmin && ownerId !== authedUserId) return json(403, { error: "Forbidden" });

    // Insert the event row.
    const insertPayload = {
      session_id: sessionId,
      user_id: ownerId,
      section_id: sectionId,
      event_type: eventType,
      severity,
      data,
    };
    const { error: insertError } = await sb.from("exam_integrity_events").insert(insertPayload);
    if (insertError) return json(500, { error: "Failed to insert event", details: insertError });

    // Mirror acknowledgement events onto session.metadata so the client can gate UI
    // without needing to query the events table on every page load. This bypasses the
    // sessions_integrity_guard because we use the service role.
    const ackKeyMap: Record<string, string> = {
      instructions_acknowledged: "instructions_acknowledged_at",
      headphones_checked: "headphones_checked_at",
      identity_acknowledged: "identity_acknowledged_at",
    };
    const ackKey = ackKeyMap[eventType];
    if (ackKey) {
      const meta = safeObj((sessionRow as any).metadata ?? {});
      const existing = typeof (meta as any)[ackKey] === "string" ? String((meta as any)[ackKey]) : null;
      if (!existing) {
        const nowIso = new Date().toISOString();
        const nextMeta = { ...meta, [ackKey]: nowIso };
        const { error: updateError } = await sb.from("sessions").update({ metadata: nextMeta }).eq("id", sessionId);
        if (updateError) {
          // The event row is already saved; surface the metadata write failure but keep status 200.
          return json(200, { ok: true, ack: false, ack_error: updateError });
        }
        return json(200, { ok: true, ack: true, [ackKey]: nowIso });
      }
      return json(200, { ok: true, ack: true, [ackKey]: existing });
    }

    return json(200, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(500, { error: message });
  }
});
