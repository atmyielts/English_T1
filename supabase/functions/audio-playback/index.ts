import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

type AudioPlaybackEventInput = {
  session_id: string;
  content_unit_id: string;
  event: "start" | "progress" | "end";
  current_time_seconds?: number | null;
  duration_seconds?: number | null;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const { data: authData, error: authError } = await sb.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const authedUserId = authData.user.id;

    const body = (await req.json()) as AudioPlaybackEventInput;
    const sessionId = String((body as any)?.session_id ?? "");
    const unitId = String((body as any)?.content_unit_id ?? "");
    const event = String((body as any)?.event ?? "");

    if (!sessionId || !unitId || !event) {
      return new Response(JSON.stringify({ error: "session_id, content_unit_id, event are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (event !== "start" && event !== "progress" && event !== "end") {
      return new Response(JSON.stringify({ error: "Invalid event" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const currentTime =
      typeof body.current_time_seconds === "number" && Number.isFinite(body.current_time_seconds)
        ? Math.max(0, body.current_time_seconds)
        : null;
    const duration =
      typeof body.duration_seconds === "number" && Number.isFinite(body.duration_seconds)
        ? Math.max(0, body.duration_seconds)
        : null;

    const { data: sessionRow, error: sessionError } = await sb
      .from("sessions")
      .select("id, user_id, metadata")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError) {
      return new Response(JSON.stringify({ error: "Failed to load session", details: sessionError }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!sessionRow) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if ((sessionRow as any).user_id !== authedUserId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const nowIso = new Date().toISOString();
    const metadata = safeObj((sessionRow as any).metadata ?? {});
    const audioPlayback = safeObj((metadata as any).audio_playback);
    const existing = safeObj((audioPlayback as any)[unitId]);

    const entry: Json = { ...existing };
    const endedAt = typeof entry.ended_at === "string" && entry.ended_at.length > 0 ? entry.ended_at : null;
    const locked = endedAt != null;

    if (locked) {
      // Audio already consumed. Keep idempotent response.
      return new Response(JSON.stringify({ ok: true, locked: true, playback: entry }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (typeof entry.started_at !== "string" || entry.started_at.length === 0) {
      if (event === "start" || event === "progress" || event === "end") entry.started_at = nowIso;
    }

    const prevLast = typeof entry.last_time_seconds === "number" && Number.isFinite(entry.last_time_seconds) ? entry.last_time_seconds : 0;
    if (currentTime != null) entry.last_time_seconds = Math.max(prevLast, currentTime);

    const prevDur = typeof entry.duration_seconds === "number" && Number.isFinite(entry.duration_seconds) ? entry.duration_seconds : 0;
    if (duration != null) entry.duration_seconds = Math.max(prevDur, duration);

    if (event === "end") {
      entry.ended_at = nowIso;
      // If the caller doesn't have currentTime (some browsers), treat duration as the final position.
      if (currentTime == null && duration != null) {
        entry.last_time_seconds = Math.max(
          typeof entry.last_time_seconds === "number" ? entry.last_time_seconds : 0,
          duration,
        );
      }
    }

    entry.updated_at = nowIso;

    const nextMetadata: Json = {
      ...metadata,
      audio_playback: { ...audioPlayback, [unitId]: entry },
    };

    const { error: updateError } = await sb.from("sessions").update({ metadata: nextMetadata }).eq("id", sessionId);
    if (updateError) {
      return new Response(JSON.stringify({ error: "Failed to update session", details: updateError }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ ok: true, locked: false, playback: entry }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

