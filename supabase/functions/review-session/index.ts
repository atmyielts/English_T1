import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { signStorageRef } from "../_shared/media-storage.ts";
import { scoreToefl2026Unit } from "../_shared/toefl-2026.ts";
import { toefl2026TierFilterFor } from "../_shared/toefl-2026-session.ts";
import { productIdsGrantingAccess } from "../_shared/product-bundles.ts";

type Json = Record<string, unknown>;

type SectionRow = { id: string; name: string; display_order: number; metadata: Json | null };
type PartRow = { id: string; section_id: string; name: string; display_order: number };
type UnitRow = { id: string; part_id: string; type: string; data: Json; display_order: number; metadata: Json | null };
type KeyRow = { content_unit_id: string; correct: any };
type ResponseRow = { content_unit_id: string; data: any; submitted_at: string };

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Review pages should remain functional long after the test is completed.
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
  if (String(tokenRow.experience_id) !== String(experienceId)) return { ok: false, reason: "Session mismatch" };
  if (String(tokenRow.claimed_by ?? "") !== String(userId)) return { ok: false, reason: "Unauthorized" };
  if (String(tokenRow.status) !== "claimed") return { ok: false, reason: "Candidate session is not active" };

  return { ok: true };
};

const normalizeText = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[’`´]/g, "'")
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

const normalizeTfngToken = (raw: string): string => {
  const v = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (v === "t" || v === "true") return "T";
  if (v === "f" || v === "false") return "F";
  if (v === "ng" || v === "notgiven") return "NG";
  return "";
};

const normalizeYnngToken = (raw: string): string => {
  const v = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (v === "y" || v === "yes") return "Y";
  if (v === "n" || v === "no") return "N";
  if (v === "ng" || v === "notgiven") return "NG";
  return "";
};

const toCandidateStrings = (value: unknown): string[] => {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap((entry) => toCandidateStrings(entry));
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.value === "string") return [v.value];
    if (typeof v.text === "string") return [v.text];
    if (typeof v.answer === "string") return [v.answer];
  }
  return [String(value)];
};

const firstNormalized = (value: unknown, normalizer: (raw: string) => string): string => {
  const candidates = toCandidateStrings(value).map((entry) => normalizer(entry)).filter(Boolean);
  return candidates[0] ?? "";
};

const arraysEqualAsSets = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  if (sa.size !== a.length) return false;
  for (const x of b) if (!sa.has(x)) return false;
  return true;
};

type UnitScore = { score: number; max: number };

const scoreTextMap = (expected: Record<string, unknown>, actual: Record<string, unknown> | null): UnitScore => {
  const keys = Object.keys(expected);
  if (keys.length === 0) return { score: 0, max: 0 };
  let score = 0;
  for (const k of keys) {
    const expectedAnswers = toCandidateStrings(expected[k]).map((value) => normalizeText(value)).filter(Boolean);
    const actualAnswers = toCandidateStrings(actual?.[k]).map((value) => normalizeText(value)).filter(Boolean);
    if (expectedAnswers.length > 0 && actualAnswers.some((actualNorm) => expectedAnswers.includes(actualNorm))) score += 1;
  }
  return { score, max: keys.length };
};

const scoreTokenMap = (
  expected: Record<string, unknown>,
  actual: Record<string, unknown> | null,
  normalizer: (raw: string) => string,
): UnitScore => {
  const keys = Object.keys(expected);
  if (keys.length === 0) return { score: 0, max: 0 };
  let score = 0;
  for (const key of keys) {
    const expectedToken = firstNormalized(expected[key], normalizer);
    const actualTokens = toCandidateStrings(actual?.[key]).map((entry) => normalizer(entry)).filter(Boolean);
    if (expectedToken && actualTokens.includes(expectedToken)) score += 1;
  }
  return { score, max: keys.length };
};

const scoreUnit = (unitType: string, correct: any, responseData: any): UnitScore => {
  if (!correct) return { score: 0, max: 0 };

  if (unitType === "question_single_choice") {
    const expected = normalizeChoiceToken(String(correct.option_id ?? ""));
    const actualRaw =
      typeof responseData === "string"
        ? responseData
        : String(responseData?.selected_option ?? responseData?.option_id ?? "");
    const actual = normalizeChoiceToken(actualRaw);
    return { score: expected !== "" && actual === expected ? 1 : 0, max: expected !== "" ? 1 : 0 };
  }

  if (unitType === "question_multi_choice") {
    const expected: string[] = Array.isArray(correct.option_ids) ? correct.option_ids.map((entry: unknown) => normalizeChoiceToken(String(entry))).filter(Boolean) : [];
    const actual: string[] = Array.isArray(responseData)
      ? responseData.map((entry: unknown) => normalizeChoiceToken(String(entry))).filter(Boolean)
      : Array.isArray(responseData?.selected_options)
        ? responseData.selected_options.map((entry: unknown) => normalizeChoiceToken(String(entry))).filter(Boolean)
        : [];
    return { score: expected.length > 0 && arraysEqualAsSets(expected, actual) ? 1 : 0, max: expected.length > 0 ? 1 : 0 };
  }

  if (unitType === "question_text") {
    const expected: string[] = Array.isArray(correct.answers) ? correct.answers.map((entry: unknown) => String(entry)) : [];
    const actualRaw =
      typeof responseData === "string" ? responseData : String(responseData?.text ?? responseData?.answer ?? "");
    const actual = normalizeText(actualRaw);
    const ok = expected.some((e) => normalizeText(e) === actual);
    return { score: ok ? 1 : 0, max: expected.length > 0 ? 1 : 0 };
  }

  if (
    unitType === "question_matching" ||
    unitType === "question_matching_headings" ||
    unitType === "question_sentence_endings"
  ) {
    const expected = correct.matches && typeof correct.matches === "object" ? (correct.matches as Record<string, unknown>) : null;
    const actualSource =
      responseData && typeof responseData === "object" && (responseData as any).matches && typeof (responseData as any).matches === "object"
        ? (responseData as any).matches
        : responseData;
    const actual = actualSource && typeof actualSource === "object" ? (actualSource as Record<string, unknown>) : null;
    if (!expected) return { score: 0, max: 0 };
    return scoreTokenMap(expected, actual, normalizeChoiceToken);
  }

  if (unitType === "question_true_false_not_given") {
    const expected = correct.matches && typeof correct.matches === "object" ? (correct.matches as Record<string, unknown>) : null;
    const actualSource =
      responseData && typeof responseData === "object" && (responseData as any).matches && typeof (responseData as any).matches === "object"
        ? (responseData as any).matches
        : responseData;
    const actual = actualSource && typeof actualSource === "object" ? (actualSource as Record<string, unknown>) : null;
    if (!expected) return { score: 0, max: 0 };
    return scoreTokenMap(expected, actual, normalizeTfngToken);
  }

  if (unitType === "question_yes_no_not_given") {
    const expected = correct.matches && typeof correct.matches === "object" ? (correct.matches as Record<string, unknown>) : null;
    const actualSource =
      responseData && typeof responseData === "object" && (responseData as any).matches && typeof (responseData as any).matches === "object"
        ? (responseData as any).matches
        : responseData;
    const actual = actualSource && typeof actualSource === "object" ? (actualSource as Record<string, unknown>) : null;
    if (!expected) return { score: 0, max: 0 };
    return scoreTokenMap(expected, actual, normalizeYnngToken);
  }

  if (unitType === "question_gap_fill" || unitType === "question_select_from_list") {
    const expected = correct.blanks && typeof correct.blanks === "object" ? (correct.blanks as Record<string, unknown>) : null;
    const actualSource =
      responseData && typeof responseData === "object" && (responseData as any).blanks && typeof (responseData as any).blanks === "object"
        ? (responseData as any).blanks
        : responseData;
    const actual = actualSource && typeof actualSource === "object" ? (actualSource as Record<string, unknown>) : null;
    if (!expected) return { score: 0, max: 0 };
    return unitType === "question_select_from_list"
      ? scoreTokenMap(expected, actual, normalizeChoiceToken)
      : scoreTextMap(expected, actual);
  }

  if (unitType === "question_table_completion") {
    const expected = correct.cells && typeof correct.cells === "object" ? (correct.cells as Record<string, unknown>) : null;
    const actualSource =
      responseData && typeof responseData === "object" && (responseData as any).cells && typeof (responseData as any).cells === "object"
        ? (responseData as any).cells
        : responseData;
    const actual = actualSource && typeof actualSource === "object" ? (actualSource as Record<string, unknown>) : null;
    if (!expected) return { score: 0, max: 0 };
    return scoreTextMap(expected, actual);
  }

  if (unitType === "question_diagram_labeling") {
    const expected = correct.labels && typeof correct.labels === "object" ? (correct.labels as Record<string, unknown>) : null;
    const actualSource =
      responseData && typeof responseData === "object" && (responseData as any).labels && typeof (responseData as any).labels === "object"
        ? (responseData as any).labels
        : responseData;
    const actual = actualSource && typeof actualSource === "object" ? (actualSource as Record<string, unknown>) : null;
    if (!expected) return { score: 0, max: 0 };
    return scoreTextMap(expected, actual);
  }

  if (unitType === "question_drag_drop") {
    const expected = correct.targets && typeof correct.targets === "object" ? (correct.targets as Record<string, unknown>) : null;
    const actualSource =
      responseData && typeof responseData === "object" && (responseData as any).targets && typeof (responseData as any).targets === "object"
        ? (responseData as any).targets
        : responseData;
    const actual = actualSource && typeof actualSource === "object" ? (actualSource as Record<string, unknown>) : null;
    if (!expected) return { score: 0, max: 0 };
    return scoreTokenMap(expected, actual, normalizeChoiceToken);
  }

  // TOEFL 2026 unit types only; null for every other type.
  const toefl2026Score = scoreToefl2026Unit(unitType, correct, responseData);
  if (toefl2026Score) return toefl2026Score;

  return { score: 0, max: 0 };
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
    const onlySectionId = url.searchParams.get("section_id");
    const expectedProductId = String(url.searchParams.get("product_id") ?? "").trim();

    if (!sessionId) {
      return new Response(JSON.stringify({ error: "session_id is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: sessionRow, error: sessionError } = await supabase
      .from("sessions")
      .select("id, user_id, experience_id, status, started_at, completed_at, created_at, token_id")
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

    if (String(sessionRow.status) !== "completed") {
      return new Response(JSON.stringify({ error: "Session is not completed" }), {
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
    if (expectedProductId && expectedProductId !== productId) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

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
    }

    if (!tokenMode && !isAdmin) {
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

    const sectionRows = (sections ?? []) as SectionRow[];
    const selectedSectionIds = onlySectionId ? [onlySectionId] : sectionRows.map((s) => s.id);

    if (onlySectionId && !sectionRows.some((s) => s.id === onlySectionId)) {
      return new Response(JSON.stringify({ error: "section_id not found for experience" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: parts, error: partsError } = await supabase
      .from("parts")
      .select("id, section_id, name, display_order")
      .in("section_id", selectedSectionIds)
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
    const partToSectionId = new Map(partRows.map((p) => [p.id, p.section_id]));

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

    // TOEFL 2026 adaptive tests: hide the second-module tier the learner did not take.
    const toefl2026Visible = await toefl2026TierFilterFor(supabase, String(sessionRow.id), (experienceRow as any).metadata);
    const unitRows = ((units ?? []) as UnitRow[]).filter((u) => toefl2026Visible(u, partToSectionId.get(u.part_id)));
    unitRows.sort((a, b) => {
      const pa = partOrder.get(a.part_id) ?? 0;
      const pb = partOrder.get(b.part_id) ?? 0;
      if (pa !== pb) return pa - pb;
      return (a.display_order ?? 0) - (b.display_order ?? 0);
    });

    const signFromStorage = async (storage: any): Promise<string | null> => {
      return await signStorageRef(supabase, storage, SIGNED_URL_TTL_SECONDS, {
        requestId,
        route: "/functions/v1/review-session",
        userId: authedUserId,
      });
    };

    // Resolve private Storage references into short-lived signed URLs for review playback/viewing.
    const resolvedUnitRows = await Promise.all(
      unitRows.map(async (u) => {
        const type = String(u.type);

        if (type === "audio") {
          const d: any = u.data ?? {};
          const hasUrl = typeof d.url === "string" && d.url.length > 0;
          if (hasUrl) return u;
          const signedUrl = await signFromStorage(d.storage);
          if (!signedUrl) return u;
          return { ...u, data: { ...d, url: signedUrl } };
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

    const { data: keys, error: keysError } = await supabase
      .from('answer_keys')
      .select('content_unit_id, correct')
      .in('content_unit_id', unitIds);

    if (keysError) {
      return new Response(JSON.stringify({ error: "Failed to load answer keys", details: keysError }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const keyRows = (keys ?? []) as KeyRow[];
    const keyByUnitId = new Map(keyRows.map((k) => [k.content_unit_id, k.correct]));

    const reviewUnits = resolvedUnitRows.map((u) => {
      const answer = latestAnswers[u.id] ?? null;
      const correct = (keyByUnitId.has(u.id) ? keyByUnitId.get(u.id) : null) as Json | null;
      const scored = correct ? scoreUnit(u.type, correct, answer) : null;
      const score = scored ? scored.score : null;
      const max_score = scored ? scored.max : null;
      const is_correct = scored && scored.max > 0 ? scored.score === scored.max : null;
      const section_id = partToSectionId.get(u.part_id) ?? "";

      return {
        id: u.id,
        section_id,
        part_id: u.part_id,
        part_name: partName.get(u.part_id) ?? null,
        part_order: partOrder.get(u.part_id) ?? null,
        type: u.type,
        data: u.data,
        display_order: u.display_order,
        metadata: u.metadata ?? {},
        answer,
        correct,
        is_correct,
        score,
        max_score,
      };
    });

    return new Response(
      JSON.stringify({
        session: {
          id: sessionRow.id,
          status: sessionRow.status,
          started_at: sessionRow.started_at,
          completed_at: sessionRow.completed_at,
          created_at: sessionRow.created_at,
        },
        experience: { id: experienceRow.id, name: experienceRow.name, product_id: productId },
        sections: sectionRows,
        units: reviewUnits,
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
