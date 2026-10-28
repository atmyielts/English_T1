import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { signStorageRef } from "../_shared/media-storage.ts";
import { scoreToefl2026Unit } from "../_shared/toefl-2026.ts";
import { productIdsGrantingAccess } from "../_shared/product-bundles.ts";

type Json = Record<string, unknown>;

type SectionRow = { id: string; name: string; display_order: number; metadata: Json | null };
type PartRow = { id: string; section_id: string; name: string; display_order: number };
type UnitRow = { id: string; part_id: string; type: string; data: Json; display_order: number; metadata: Json | null };
type ResponseRow = { content_unit_id: string; data: unknown; submitted_at: string };
type AnswerKeyRow = { content_unit_id: string; correct: unknown };
type AdaptiveRule = {
  source_section_id: string;
  threshold: number;
  metric?: string;
};

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
  sb: any,
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
  const token = tokenRow as Record<string, unknown>;
  if (String(token.experience_id ?? "") !== String(experienceId)) return { ok: false, reason: "Session mismatch" };
  if (String(token.claimed_by ?? "") !== String(userId)) return { ok: false, reason: "Unauthorized" };
  if (String(token.status ?? "") !== "claimed") return { ok: false, reason: "Candidate session is not active" };

  return { ok: true };
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const toPositiveNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const sectionType = (section: SectionRow | null): string => {
  const metadata = isObject(section?.metadata) ? (section?.metadata as Record<string, unknown>) : {};
  return String((metadata as any).type ?? "").trim().toLowerCase();
};

const audioDurationSeconds = (unit: Pick<UnitRow, "type" | "data">): number | null => {
  if (String(unit.type) !== "audio") return null;
  const data = isObject(unit.data) ? (unit.data as Record<string, unknown>) : {};
  return (
    toPositiveNumber((data as any).duration_seconds) ??
    toPositiveNumber((data as any).duration) ??
    toPositiveNumber((data as any).tone?.duration_seconds) ??
    null
  );
};

const deriveSectionDurationSeconds = (section: SectionRow, units: Array<Pick<UnitRow, "type" | "data">>): number => {
  const metadata = isObject(section.metadata) ? (section.metadata as Record<string, unknown>) : {};
  const configuredDuration = toPositiveNumber((metadata as any).duration_seconds) ?? 0;
  if (sectionType(section) !== "listening") return configuredDuration;
  // TOEFL 2026 listening modules use the ETS blueprint time, not audio length + review.
  if (String((metadata as any).duration_mode ?? "") === "fixed") return configuredDuration;

  const audioTotal = units.reduce((sum, unit) => sum + (audioDurationSeconds(unit) ?? 0), 0);
  if (audioTotal <= 0) return configuredDuration;

  const reviewSeconds =
    toPositiveNumber((metadata as any).listening_review_seconds) ??
    toPositiveNumber((metadata as any).answer_review_seconds) ??
    120;

  return Math.ceil(audioTotal + reviewSeconds);
};

const normalizeText = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[â€™`Â´]/g, "'")
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeChoiceToken = (raw: string): string =>
  raw
    .trim()
    .toUpperCase()
    .replace(/^OPTION[\s_-]*/i, "")
    .replace(/[^A-Z0-9_-]+/g, "");

const toCandidateStrings = (value: unknown): string[] => {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap((entry) => toCandidateStrings(entry));
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (isObject(value)) {
    if (typeof value.value === "string") return [value.value];
    if (typeof value.text === "string") return [value.text];
    if (typeof value.answer === "string") return [value.answer];
  }
  return [String(value)];
};

const arraysEqualAsSets = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  if (sa.size !== a.length) return false;
  for (const x of b) if (!sa.has(x)) return false;
  return true;
};

const scoreUnit = (unitType: string, correct: any, responseData: any): { score: number; max: number } => {
  if (!correct) return { score: 0, max: 0 };

  // TOEFL 2026 unit types only (router accuracy for Complete the Words); null for every other type.
  const toefl2026Score = scoreToefl2026Unit(unitType, correct, responseData);
  if (toefl2026Score) return toefl2026Score;

  if (unitType === "question_single_choice") {
    const expected = normalizeChoiceToken(String((correct as any).option_id ?? ""));
    const actualRaw =
      typeof responseData === "string"
        ? responseData
        : String((responseData as any)?.selected_option ?? (responseData as any)?.option_id ?? "");
    const actual = normalizeChoiceToken(actualRaw);
    return { score: expected !== "" && actual === expected ? 1 : 0, max: expected !== "" ? 1 : 0 };
  }

  if (unitType === "question_multi_choice") {
    const expected: string[] = Array.isArray((correct as any).option_ids)
      ? (correct as any).option_ids.map((entry: unknown) => normalizeChoiceToken(String(entry))).filter(Boolean)
      : [];
    const actual: string[] = Array.isArray(responseData)
      ? responseData.map((entry: unknown) => normalizeChoiceToken(String(entry))).filter(Boolean)
      : Array.isArray((responseData as any)?.selected_options)
        ? (responseData as any).selected_options.map((entry: unknown) => normalizeChoiceToken(String(entry))).filter(Boolean)
        : [];
    return { score: expected.length > 0 && arraysEqualAsSets(expected, actual) ? 1 : 0, max: expected.length > 0 ? 1 : 0 };
  }

  if (unitType === "question_text") {
    const expected = Array.isArray((correct as any).answers) ? (correct as any).answers.map((entry: unknown) => String(entry)) : [];
    const actualRaw =
      typeof responseData === "string" ? responseData : String((responseData as any)?.text ?? (responseData as any)?.answer ?? "");
    const actual = normalizeText(actualRaw);
    const ok = expected.some((candidate: string) => normalizeText(candidate) === actual);
    return { score: ok ? 1 : 0, max: expected.length > 0 ? 1 : 0 };
  }

  if (unitType === "question_gap_fill" || unitType === "question_select_from_list") {
    const expected = isObject((correct as any).blanks) ? ((correct as any).blanks as Record<string, unknown>) : null;
    const actualSource =
      isObject(responseData) && isObject((responseData as any).blanks)
        ? ((responseData as any).blanks as Record<string, unknown>)
        : isObject(responseData)
          ? (responseData as Record<string, unknown>)
          : null;
    if (!expected || !actualSource) return { score: 0, max: expected ? Object.keys(expected).length : 0 };

    let score = 0;
    const keys = Object.keys(expected);
    for (const key of keys) {
      const expectedTokens = toCandidateStrings(expected[key]).map((value) => normalizeText(value)).filter(Boolean);
      const actualTokens = toCandidateStrings(actualSource[key]).map((value) => normalizeText(value)).filter(Boolean);
      if (expectedTokens.length > 0 && actualTokens.some((token) => expectedTokens.includes(token))) score += 1;
    }
    return { score, max: keys.length };
  }

  return { score: 0, max: 0 };
};

const readAdaptivePath = (metadata: Json): Record<string, AdaptiveRule> => {
  const raw = isObject((metadata as any).adaptive_path) ? ((metadata as any).adaptive_path as Record<string, unknown>) : null;
  if (!raw) return {};
  const out: Record<string, AdaptiveRule> = {};
  for (const [sectionId, candidate] of Object.entries(raw)) {
    if (!isObject(candidate)) continue;
    const sourceSectionId = String((candidate as any).source_section_id ?? "").trim();
    if (!sourceSectionId) continue;
    const thresholdRaw = Number((candidate as any).threshold ?? 0.7);
    const threshold = Number.isFinite(thresholdRaw) ? Math.max(0, Math.min(1, thresholdRaw)) : 0.7;
    out[sectionId] = {
      source_section_id: sourceSectionId,
      threshold,
      metric: typeof (candidate as any).metric === "string" ? String((candidate as any).metric) : "accuracy",
    };
  }
  return out;
};

const deriveAdaptivePathFromSections = (sections: SectionRow[]): Record<string, AdaptiveRule> => {
  const out: Record<string, AdaptiveRule> = {};
  for (const section of sections) {
    const meta = isObject(section.metadata) ? (section.metadata as Record<string, unknown>) : {};
    const sourceSectionId = String((meta as any).adaptive_source_section_id ?? "").trim();
    if (!sourceSectionId) continue;
    const thresholdRaw = Number((meta as any).adaptive_threshold ?? 0.7);
    const threshold = Number.isFinite(thresholdRaw) ? Math.max(0, Math.min(1, thresholdRaw)) : 0.7;
    out[section.id] = {
      source_section_id: sourceSectionId,
      threshold,
      metric: "accuracy",
    };
  }
  return out;
};

const mergeAdaptivePaths = (
  existing: Record<string, AdaptiveRule>,
  derived: Record<string, AdaptiveRule>,
): Record<string, AdaptiveRule> => ({ ...derived, ...existing });

const readRouteDecisions = (metadata: Json): Record<string, Json> => {
  const raw = isObject((metadata as any).route_decisions) ? ((metadata as any).route_decisions as Record<string, unknown>) : null;
  if (!raw) return {};
  const out: Record<string, Json> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!isObject(val)) continue;
    out[key] = val as Json;
  }
  return out;
};

const pickDefaultNextSectionId = (currentSection: SectionRow, sectionRows: SectionRow[]): string | null => {
  const meta = isObject(currentSection.metadata) ? (currentSection.metadata as Record<string, unknown>) : {};
  const fixed = String((meta as any).default_next_section_id ?? "").trim();
  if (fixed && sectionRows.some((section) => section.id === fixed)) return fixed;
  const currentIndex = sectionRows.findIndex((section) => section.id === currentSection.id);
  return currentIndex >= 0 ? sectionRows[currentIndex + 1]?.id ?? null : null;
};

const computeSectionAccuracy = async (
  supabase: any,
  sessionId: string,
  sourceSectionId: string,
): Promise<{ ratio: number | null; raw: number; max: number }> => {
  const { data: sourceParts, error: partsError } = await supabase
    .from("parts")
    .select("id")
    .eq("section_id", sourceSectionId);
  if (partsError) return { ratio: null, raw: 0, max: 0 };

  const partIds = (sourceParts ?? []).map((row: any) => String(row.id)).filter(Boolean);
  if (partIds.length === 0) return { ratio: null, raw: 0, max: 0 };

  const { data: sourceUnits, error: unitsError } = await supabase
    .from("content_units")
    .select("id, type")
    .in("part_id", partIds);
  if (unitsError) return { ratio: null, raw: 0, max: 0 };

  const units = (sourceUnits ?? []) as Array<{ id: string; type: string }>;
  const unitIds = units.map((unit) => unit.id);
  if (unitIds.length === 0) return { ratio: null, raw: 0, max: 0 };

  const { data: keys, error: keysError } = await supabase
    .from("answer_keys")
    .select("content_unit_id, correct")
    .in("content_unit_id", unitIds);
  if (keysError) return { ratio: null, raw: 0, max: 0 };

  const { data: responses, error: responsesError } = await supabase
    .from("responses")
    .select("content_unit_id, data, submitted_at")
    .eq("session_id", sessionId)
    .in("content_unit_id", unitIds)
    .order("submitted_at", { ascending: true });
  if (responsesError) return { ratio: null, raw: 0, max: 0 };

  const latestResponseByUnit = new Map<string, unknown>();
  for (const response of (responses ?? []) as ResponseRow[]) latestResponseByUnit.set(response.content_unit_id, response.data);

  const keyByUnit = new Map<string, unknown>();
  for (const key of (keys ?? []) as AnswerKeyRow[]) keyByUnit.set(key.content_unit_id, key.correct);

  let raw = 0;
  let max = 0;
  for (const unit of units) {
    const correct = keyByUnit.get(unit.id);
    if (!correct) continue;
    const responseData = latestResponseByUnit.get(unit.id);
    const score = scoreUnit(String(unit.type ?? ""), correct, responseData);
    raw += score.score;
    max += score.max;
  }
  return { ratio: max > 0 ? raw / max : null, raw, max };
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
    const isAdmin = String((userRow as any)?.role ?? "").toLowerCase().startsWith("admin");

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

    if (sessionRow.user_id !== authedUserId && !isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const experienceId = sessionRow.experience_id as string;

    const { data: experienceRow, error: experienceError } = await supabase
      .from("experiences")
      .select("id, name, product_id, metadata")
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
    if (tokenId && !isAdmin) {
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
        // The product itself or an exam "Complete" bundle that contains it.
        .in("resource_id", productIdsGrantingAccess(productId))
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

    let nextSectionId = pickDefaultNextSectionId(currentSection, sectionRows);

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

    const isListeningSection = sectionType(currentSection) === "listening";

    const audioPlaybackWallClockUpdates: Record<string, Json> = {};

    // Resolve private Storage references into short-lived signed URLs for playback/viewing.
    const resolvedUnits = await Promise.all(
      unitRows.map(async (u) => {
        const type = String(u.type);

        if (type === "audio") {
          const originalData: any = u.data ?? {};
          const d: any = isListeningSection
            ? { ...originalData, play_once: true, auto_start: true, auto_start_delay_seconds: 10 }
            : originalData;

          const playback = (audioPlayback as any)[u.id];
          const playbackObj = playback && typeof playback === "object" && !Array.isArray(playback) ? playback : null;
          const declaredDuration =
            audioDurationSeconds({ type: u.type, data: d }) ??
            toPositiveNumber((playbackObj as any)?.duration_seconds) ??
            null;
          const startedAt =
            typeof playbackObj?.started_at === "string" && playbackObj.started_at.length > 0 ? playbackObj.started_at : null;
          const elapsedSinceStart =
            startedAt ? Math.max(0, (Date.now() - Date.parse(startedAt)) / 1000) : null;
          const resumeFrom =
            elapsedSinceStart != null && declaredDuration != null
              ? Math.min(declaredDuration, elapsedSinceStart)
              : typeof playbackObj?.last_time_seconds === "number" && Number.isFinite(playbackObj.last_time_seconds)
                ? Math.max(0, playbackObj.last_time_seconds)
                : null;
          const endedByWallClock =
            elapsedSinceStart != null && declaredDuration != null && elapsedSinceStart >= Math.max(0.1, declaredDuration - 0.25);
          const endedAt =
            typeof playbackObj?.ended_at === "string" && playbackObj.ended_at.length > 0
              ? playbackObj.ended_at
              : endedByWallClock
                ? new Date(Date.parse(startedAt as string) + Math.ceil(declaredDuration as number) * 1000).toISOString()
                : null;
          const finalPlaybackObj =
            playbackObj && endedByWallClock && !playbackObj.ended_at
              ? {
                  ...playbackObj,
                  last_time_seconds: declaredDuration,
                  duration_seconds: declaredDuration,
                  ended_at: endedAt,
                  updated_at: endedAt,
                }
              : null;
          if (finalPlaybackObj) audioPlaybackWallClockUpdates[u.id] = finalPlaybackObj as Json;

          const playOnce = d.play_once === true;
          const locked = playOnce && endedAt != null;

          const baseData = {
            ...d,
            ...(playbackObj || finalPlaybackObj ? { playback: finalPlaybackObj ?? playbackObj } : {}),
            ...(resumeFrom != null ? { resume_from_seconds: resumeFrom } : {}),
            ...(locked ? { locked: true } : {}),
            ...(isListeningSection ? { playback_mode: "ielts_listening_single_run" } : {}),
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

    const currentMetadata: Json = sessionMetadata;
    const existingAdaptivePath = readAdaptivePath(currentMetadata);
    const derivedAdaptivePath = deriveAdaptivePathFromSections(sectionRows);
    const effectiveAdaptivePath = mergeAdaptivePaths(existingAdaptivePath, derivedAdaptivePath);
    const routeDecisions = readRouteDecisions(currentMetadata);
    const adaptiveRule = effectiveAdaptivePath[sectionId] ?? null;

    let adaptiveTier: string | null = null;
    if (adaptiveRule) {
      const existingDecision = isObject(routeDecisions[sectionId]) ? (routeDecisions[sectionId] as Record<string, unknown>) : null;
      const existingTier = existingDecision ? String(existingDecision.tier ?? "").trim().toLowerCase() : "";
      if (existingTier === "standard" || existingTier === "advanced") {
        adaptiveTier = existingTier;
      } else {
        const accuracy = await computeSectionAccuracy(supabase, sessionId, adaptiveRule.source_section_id);
        const ratio = typeof accuracy.ratio === "number" ? accuracy.ratio : 0;
        adaptiveTier = ratio >= adaptiveRule.threshold ? "advanced" : "standard";
        if (!prefetch) {
          routeDecisions[sectionId] = {
            source_section_id: adaptiveRule.source_section_id,
            threshold: adaptiveRule.threshold,
            metric: adaptiveRule.metric ?? "accuracy",
            ratio,
            raw_score: accuracy.raw,
            max_score: accuracy.max,
            tier: adaptiveTier,
            decided_at: new Date().toISOString(),
          };
        }
      }
    }

    const visibleUnits = adaptiveTier
      ? resolvedUnits.filter((unit) => {
          const tier = String((unit.metadata as any)?.difficulty_tier ?? "").trim().toLowerCase();
          return tier.length === 0 || tier === adaptiveTier;
        })
      : resolvedUnits;
    const visibleUnitIds = new Set(visibleUnits.map((unit) => unit.id));
    const visibleAnswers: Record<string, unknown> = {};
    for (const [unitId, answer] of Object.entries(latestAnswers)) {
      if (visibleUnitIds.has(unitId)) visibleAnswers[unitId] = answer;
    }

    // Per-section deadline stored in session.metadata.deadlines[section_id]
    const tierDurations = isObject((currentSection.metadata as any)?.duration_seconds_by_tier)
      ? ((currentSection.metadata as any).duration_seconds_by_tier as Record<string, unknown>)
      : null;
    // TOEFL 2026: lower and upper listening modules have different ETS times.
    const tierDuration = adaptiveTier && tierDurations ? toPositiveNumber(tierDurations[adaptiveTier]) : null;
    const durationSeconds = tierDuration ?? deriveSectionDurationSeconds(currentSection, visibleUnits);
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

      if (Object.keys(effectiveAdaptivePath).length > 0) {
        const currentAdaptivePath = isObject((updatedMetadata as any).adaptive_path) ? ((updatedMetadata as any).adaptive_path as Record<string, unknown>) : null;
        if (JSON.stringify(currentAdaptivePath ?? {}) !== JSON.stringify(effectiveAdaptivePath)) {
          updatedMetadata = { ...updatedMetadata, adaptive_path: effectiveAdaptivePath };
        }
      }

      if (Object.keys(routeDecisions).length > 0) {
        const currentRouteDecisions = isObject((updatedMetadata as any).route_decisions)
          ? ((updatedMetadata as any).route_decisions as Record<string, unknown>)
          : null;
        if (JSON.stringify(currentRouteDecisions ?? {}) !== JSON.stringify(routeDecisions)) {
          updatedMetadata = { ...updatedMetadata, route_decisions: routeDecisions };
        }
      }

      if (Object.keys(audioPlaybackWallClockUpdates).length > 0) {
        updatedMetadata = {
          ...updatedMetadata,
          audio_playback: {
            ...audioPlayback,
            ...audioPlaybackWallClockUpdates,
          },
        };
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
        experience: {
          id: experienceRow.id,
          name: experienceRow.name,
          product_id: productId,
          metadata: (experienceRow as any).metadata ?? {},
        },
        sections: sectionRows,
        current_section: currentSection,
        next_section_id: nextSectionId,
        deadline_iso: effectiveDeadlineIso,
        units: visibleUnits.map((u) => ({
          id: u.id,
          part_id: u.part_id,
          part_name: partName.get(u.part_id) ?? null,
          part_order: partOrder.get(u.part_id) ?? null,
          type: u.type,
          data: u.data,
          display_order: u.display_order,
          metadata: u.metadata ?? {},
        })),
        answers: visibleAnswers,
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
