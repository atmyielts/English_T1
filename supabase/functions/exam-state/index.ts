import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { signStorageRef } from "../_shared/media-storage.ts";

type Json = Record<string, unknown>;

type SectionRow = { id: string; name: string; display_order: number; metadata: Json | null };
type PartRow = { id: string; section_id: string; name: string; display_order: number };
type UnitRow = { id: string; part_id: string; type: string; data: Json; display_order: number; metadata: Json | null };
type ResponseRow = { content_unit_id: string; data: unknown; submitted_at: string };

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Signed URLs must survive a full IELTS sitting (up to ~2h 45m) plus review time.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 6;

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

const isActiveEntitlement = (row: { starts_at: string | null; ends_at: string | null }): boolean => {
  const now = Date.now();
  const startsAt = row.starts_at ? Date.parse(row.starts_at) : null;
  const endsAt = row.ends_at ? Date.parse(row.ends_at) : null;
  if (startsAt && now < startsAt) return false;
  if (endsAt && now > endsAt) return false;
  return true;
};

const validateTokenSession = async (
  sb: ReturnType<typeof createClient>,
  tokenId: string,
  userId: string,
  experienceId: string,
): Promise<{ ok: boolean; reason?: string }> => {
  const { data: tokenRow, error } = await sb
    .from("exam_tokens")
    .select("id, status, expires_at, claimed_by, experience_id")
    .eq("id", tokenId)
    .maybeSingle();

  if (error || !tokenRow) return { ok: false, reason: "Invalid candidate session" };
  if (String(tokenRow.experience_id) !== String(experienceId)) return { ok: false, reason: "Session mismatch" };
  if (String(tokenRow.claimed_by ?? "") !== String(userId)) return { ok: false, reason: "Unauthorized" };
  if (String(tokenRow.status) !== "claimed") return { ok: false, reason: "Candidate session is not active" };

  return { ok: true };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const authedUserId = authData.user.id;

    const { data: userRow } = await supabase.from("users").select("role").eq("id", authedUserId).maybeSingle();
    const isAdmin = String((userRow as any)?.role ?? "").toLowerCase() === "admin";

    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");
    const sectionId = url.searchParams.get("section_id");
    const prefetch = String(url.searchParams.get("prefetch") ?? "").toLowerCase() === "true";

    if (!sessionId || !sectionId) {
      return new Response(JSON.stringify({ error: "session_id and section_id are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: sessionRow, error: sessionError } = await supabase
      .from("sessions")
      .select("id, user_id, experience_id, status, metadata, started_at, completed_at, created_at, token_id")
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

    if (sessionRow.user_id !== authedUserId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const experienceId = sessionRow.experience_id as string;

    const { data: experienceRow, error: experienceError } = await supabase
      .from("experiences")
      .select("id, name, product_id")
      .eq("id", experienceId)
      .maybeSingle();

    if (experienceError) {
      return new Response(JSON.stringify({ error: "Failed to load experience", details: experienceError }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!experienceRow) {
      return new Response(JSON.stringify({ error: "Experience not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const productId = experienceRow.product_id as string;
    const tokenId = String((sessionRow as any)?.token_id ?? "");
    let tokenMode = false;
    if (tokenId) {
      const tokenCheck = await validateTokenSession(supabase, tokenId, authedUserId, experienceId);
      if (!tokenCheck.ok) {
        return new Response(JSON.stringify({ error: tokenCheck.reason ?? "Unauthorized" }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      tokenMode = true;

      const sessionStatus = String((sessionRow as any)?.status ?? "").toLowerCase();
      if (sessionStatus === "completed") {
        return new Response(JSON.stringify({ error: "Candidate session is completed" }), {
          status: 409,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      if (sessionStatus === "abandoned" || sessionStatus === "expired") {
        return new Response(JSON.stringify({ error: "Candidate session is closed" }), {
          status: 409,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    if (!tokenMode && !isAdmin) {
      // Enforce entitlement (service-role bypasses RLS, so we check explicitly).
      const { data: memberships, error: membershipError } = await supabase
        .from("tenant_memberships")
        .select("tenant_id")
        .eq("user_id", authedUserId)
        .eq("status", "active");

      if (membershipError) {
        return new Response(JSON.stringify({ error: "Failed to load memberships", details: membershipError }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const tenantIds = (memberships ?? []).map((m: any) => m.tenant_id).filter(Boolean);
      if (tenantIds.length === 0) {
        return new Response(JSON.stringify({ error: "No active tenant membership" }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { data: entitlements, error: entitlementError } = await supabase
        .from("entitlements")
        .select("id, tenant_id, starts_at, ends_at, is_active")
        .in("tenant_id", tenantIds)
        .eq("resource_type", "product")
        .eq("resource_id", productId)
        .eq("is_active", true);

      if (entitlementError) {
        return new Response(JSON.stringify({ error: "Failed to load entitlements", details: entitlementError }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const hasAccess = (entitlements ?? []).some((e: any) => isActiveEntitlement(e));
      if (!hasAccess) {
        return new Response(JSON.stringify({ error: "No entitlement for product" }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    const { data: sections, error: sectionsError } = await supabase
      .from("sections")
      .select("id, name, display_order, metadata")
      .eq("experience_id", experienceId)
      .order("display_order", { ascending: true });

    if (sectionsError) {
      return new Response(JSON.stringify({ error: "Failed to load sections", details: sectionsError }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const sessionMetadata = (sessionRow.metadata ?? {}) as Json;
    const allowedSectionIdsRaw = (sessionMetadata as any).allowed_section_ids;
    const allowedSectionIds =
      Array.isArray(allowedSectionIdsRaw) && allowedSectionIdsRaw.length > 0 ? allowedSectionIdsRaw.map(String) : null;

    let sectionRows = (sections ?? []) as SectionRow[];
    if (allowedSectionIds) sectionRows = sectionRows.filter((s) => allowedSectionIds.includes(s.id));

    const currentSection = sectionRows.find((s) => s.id === sectionId) ?? null;
    if (!currentSection) {
      return new Response(JSON.stringify({ error: allowedSectionIds ? "Section not allowed for session" : "Section not found for experience" }), {
        status: allowedSectionIds ? 403 : 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const currentIndex = sectionRows.findIndex((s) => s.id === sectionId);
    const nextSectionId = currentIndex >= 0 ? sectionRows[currentIndex + 1]?.id ?? null : null;

    const { data: parts, error: partsError } = await supabase
      .from("parts")
      .select("id, section_id, name, display_order")
      .eq("section_id", sectionId)
      .order("display_order", { ascending: true });

    if (partsError) {
      return new Response(JSON.stringify({ error: "Failed to load parts", details: partsError }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const partRows = (parts ?? []) as PartRow[];
    const partIds = partRows.map((p) => p.id);
    const partOrder = new Map(partRows.map((p) => [p.id, p.display_order]));
    const partName = new Map(partRows.map((p) => [p.id, p.name]));

    const { data: units, error: unitsError } = await supabase
      .from("content_units")
      .select("id, part_id, type, data, display_order, metadata")
      .in("part_id", partIds);

    if (unitsError) {
      return new Response(JSON.stringify({ error: "Failed to load content units", details: unitsError }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const unitRows = (units ?? []) as UnitRow[];
    unitRows.sort((a, b) => {
      const pa = partOrder.get(a.part_id) ?? 0;
      const pb = partOrder.get(b.part_id) ?? 0;
      if (pa !== pb) return pa - pb;
      return (a.display_order ?? 0) - (b.display_order ?? 0);
    });

    // Playback state is tracked server-side in sessions.metadata.audio_playback so refresh cannot
    // be used to replay "play_once" audios. We only lock after "end" so refresh can resume.
    const audioPlayback =
      sessionMetadata.audio_playback && typeof sessionMetadata.audio_playback === "object"
        ? (sessionMetadata.audio_playback as Json)
        : {};

    const signFromStorage = async (storage: any): Promise<string | null> => {
      return await signStorageRef(supabase, storage, SIGNED_URL_TTL_SECONDS, {
        requestId,
        route: "/functions/v1/exam-state",
        userId: authedUserId,
      });
    };

    // Resolve private Storage references into short-lived signed URLs for playback/viewing.
    const resolvedUnits = await Promise.all(
      unitRows.map(async (u) => {
        const type = String(u.type);

        if (type === "audio") {
          const d: any = u.data ?? {};

          const playback = (audioPlayback as any)[u.id];
          const playbackObj = playback && typeof playback === "object" && !Array.isArray(playback) ? playback : null;
          const resumeFrom =
            typeof playbackObj?.last_time_seconds === "number" && Number.isFinite(playbackObj.last_time_seconds)
              ? Math.max(0, playbackObj.last_time_seconds)
              : null;
          const endedAt =
            typeof playbackObj?.ended_at === "string" && playbackObj.ended_at.length > 0 ? playbackObj.ended_at : null;

          const playOnce = d.play_once === true;
          const locked = playOnce && endedAt != null;

          const baseData = {
            ...d,
            ...(playbackObj ? { playback: playbackObj } : {}),
            ...(resumeFrom != null ? { resume_from_seconds: resumeFrom } : {}),
            ...(locked ? { locked: true } : {}),
          };

          // Don't return a playable URL if the audio has been consumed.
          if (locked) return { ...u, data: baseData };

          const hasUrl = typeof d.url === "string" && d.url.length > 0;
          if (hasUrl) return { ...u, data: baseData };

          const signedUrl = await signFromStorage(d.storage);
          if (!signedUrl) return { ...u, data: baseData };

          return { ...u, data: { ...baseData, url: signedUrl } };
        }

        if (type === "image") {
          const d: any = u.data ?? {};
          const hasUrl = typeof d.url === "string" && d.url.length > 0;
          if (hasUrl) return u;
          const signedUrl = await signFromStorage(d.storage);
          if (!signedUrl) return u;
          return { ...u, data: { ...d, url: signedUrl } };
        }

        if (type === "question_diagram_labeling") {
          const d: any = u.data ?? {};
          const img = d.image;
          if (!img || typeof img !== "object") return u;
          const hasUrl = typeof (img as any).url === "string" && String((img as any).url).length > 0;
          if (hasUrl) return u;
          const signedUrl = await signFromStorage((img as any).storage);
          if (!signedUrl) return u;
          return { ...u, data: { ...d, image: { ...(img as any), url: signedUrl } } };
        }

        return u;
      }),
    );

    const unitIds = unitRows.map((u) => u.id);

    const { data: responses, error: responsesError } = await supabase
      .from("responses")
      .select("content_unit_id, data, submitted_at")
      .eq("session_id", sessionId)
      .in("content_unit_id", unitIds)
      .order("submitted_at", { ascending: true });

    if (responsesError) {
      return new Response(JSON.stringify({ error: "Failed to load responses", details: responsesError }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const latestAnswers: Record<string, unknown> = {};
    for (const r of (responses ?? []) as ResponseRow[]) latestAnswers[r.content_unit_id] = r.data;

    // Per-section deadline stored in session.metadata.deadlines[section_id]
    const durationSeconds = Number((currentSection.metadata as any)?.duration_seconds ?? 0);
    const currentMetadata: Json = sessionMetadata;
    const deadlines =
      currentMetadata.deadlines && typeof currentMetadata.deadlines === "object" ? (currentMetadata.deadlines as Json) : {};
    const existingDeadline = deadlines[sectionId];
    const deadlineIso = typeof existingDeadline === "string" && existingDeadline.length > 0 ? existingDeadline : null;

    let updatedMetadata = currentMetadata;
    let effectiveDeadlineIso: string | null = deadlineIso;

    if (!prefetch) {
      // Track current section id for resume.
      if (currentMetadata.current_section_id !== sectionId) {
        updatedMetadata = { ...updatedMetadata, current_section_id: sectionId };
      }

      // Create the deadline the first time the user enters a section. This must NOT happen during prefetch.
      if (!deadlineIso && durationSeconds > 0) {
        effectiveDeadlineIso = new Date(Date.now() + Math.max(1, durationSeconds) * 1000).toISOString();
        updatedMetadata = {
          ...updatedMetadata,
          deadlines: {
            ...deadlines,
            [sectionId]: effectiveDeadlineIso,
          },
        };
      }

      if (updatedMetadata !== currentMetadata) {
        await supabase.from("sessions").update({ metadata: updatedMetadata }).eq("id", sessionId);
      }
    }

    return new Response(
      JSON.stringify({
        session: {
          id: sessionRow.id,
          status: sessionRow.status,
          metadata: updatedMetadata,
          started_at: sessionRow.started_at,
          completed_at: sessionRow.completed_at,
          created_at: sessionRow.created_at,
        },
        experience: { id: experienceRow.id, name: experienceRow.name, product_id: productId },
        sections: sectionRows,
        current_section: currentSection,
        next_section_id: nextSectionId,
        deadline_iso: effectiveDeadlineIso,
        units: resolvedUnits.map((u) => ({
          id: u.id,
          part_id: u.part_id,
          part_name: partName.get(u.part_id) ?? null,
          part_order: partOrder.get(u.part_id) ?? null,
          type: u.type,
          data: u.data,
          display_order: u.display_order,
          metadata: u.metadata ?? {},
        })),
        answers: latestAnswers,
        server_time_iso: new Date().toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
