import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { combinedWeakSkills, examNextSteps, loadSisterSignals, type SisterSignals } from "../_shared/sister-signals.ts";

type JsonRecord = Record<string, unknown>;

type ExamOutcomeRow = {
  id: string;
  session_id: string;
  user_id: string;
  product_id: string;
  experience_id: string;
  score_method: string;
  status: string;
  schema_version: string;
  overall_score: number | null;
  overall_band: number | null;
  section_scores: JsonRecord | null;
  skill_breakdown: JsonRecord | null;
  computed_at: string;
};

type LearnerSkillProfileRow = {
  user_id: string;
  product_id: string;
  schema_version: string;
  signals_count: number;
  sessions_count: number;
  profile: JsonRecord | null;
  latest_result: JsonRecord | null;
  latest_event_id: string | null;
  latest_event_at: string | null;
  updated_at: string;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const toNumber = (value: unknown): number | null => {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const roundNumber = (value: number, precision = 3): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const computeProfileFromOutcomes = (outcomes: ExamOutcomeRow[]): Record<string, unknown> => {
  const skillStats = new Map<
    string,
    {
      samples: number;
      ratioTotal: number;
      ratioCount: number;
      score40Total: number;
      score40Count: number;
      score800Total: number;
      score800Count: number;
      bandTotal: number;
      bandCount: number;
      lastComputedAt: string | null;
    }
  >();

  for (const outcome of outcomes) {
    const skillBreakdown = outcome.skill_breakdown && typeof outcome.skill_breakdown === "object"
      ? outcome.skill_breakdown
      : {};
    for (const [skill, rawValue] of Object.entries(skillBreakdown)) {
      if (!rawValue || typeof rawValue !== "object") continue;
      const value = rawValue as JsonRecord;
      const stat = skillStats.get(skill) ?? {
        samples: 0,
        ratioTotal: 0,
        ratioCount: 0,
        score40Total: 0,
        score40Count: 0,
        score800Total: 0,
        score800Count: 0,
        bandTotal: 0,
        bandCount: 0,
        lastComputedAt: null,
      };

      const ratio = toNumber(value.ratio);
      const scaled40 = toNumber(value.scaled_score_40);
      const scaled800 = toNumber(value.scaled_score_800);
      const band = toNumber(value.band);

      stat.samples += 1;
      if (ratio != null) {
        stat.ratioTotal += ratio;
        stat.ratioCount += 1;
      }
      if (scaled40 != null) {
        stat.score40Total += scaled40;
        stat.score40Count += 1;
      }
      if (scaled800 != null) {
        stat.score800Total += scaled800;
        stat.score800Count += 1;
      }
      if (band != null) {
        stat.bandTotal += band;
        stat.bandCount += 1;
      }
      stat.lastComputedAt = outcome.computed_at;
      skillStats.set(skill, stat);
    }
  }

  const profile: Record<string, unknown> = {};
  for (const [skill, stat] of skillStats.entries()) {
    profile[skill] = {
      samples: stat.samples,
      ratio_avg: stat.ratioCount > 0 ? roundNumber(stat.ratioTotal / stat.ratioCount, 4) : null,
      scaled_score_40_avg: stat.score40Count > 0 ? Math.round(stat.score40Total / stat.score40Count) : null,
      scaled_score_800_avg: stat.score800Count > 0 ? Math.round(stat.score800Total / stat.score800Count) : null,
      band_avg: stat.bandCount > 0 ? roundNumber(stat.bandTotal / stat.bandCount, 2) : null,
      last_computed_at: stat.lastComputedAt,
    };
  }
  return profile;
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
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const authedUserId = userData.user.id;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: profileRow } = await userClient.from("users").select("role").eq("id", authedUserId).maybeSingle();
    const role = String(profileRow?.role ?? "").toLowerCase();
    const isAdmin = role === "admin";

    const url = new URL(req.url);
    const requestedUserId = String(url.searchParams.get("user_id") ?? "").trim();
    const targetUserId = requestedUserId || authedUserId;
    if (requestedUserId && requestedUserId !== authedUserId && !isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const requestedLimit = Number(url.searchParams.get("limit") ?? 25);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.floor(requestedLimit))) : 25;
    const productId = String(url.searchParams.get("product_id") ?? "").trim();

    let query = userClient
      .from("exam_outcomes")
      .select(
        "id, session_id, user_id, product_id, experience_id, score_method, status, schema_version, overall_score, overall_band, section_scores, skill_breakdown, computed_at",
      )
      .eq("user_id", targetUserId)
      .order("computed_at", { ascending: false })
      .limit(limit);

    if (productId) query = query.eq("product_id", productId);

    const { data: rows, error: rowsError } = await query;
    if (rowsError) {
      return new Response(JSON.stringify({ error: "Failed to load exam outcomes", details: rowsError }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const outcomes = (rows ?? []) as ExamOutcomeRow[];
    let projection: LearnerSkillProfileRow | null = null;
    if (productId) {
      const { data: projectionRow } = await userClient
        .from("learner_skill_profiles")
        .select(
          "user_id, product_id, schema_version, signals_count, sessions_count, profile, latest_result, latest_event_id, latest_event_at, updated_at",
        )
        .eq("user_id", targetUserId)
        .eq("product_id", productId)
        .maybeSingle();
      projection = (projectionRow as LearnerSkillProfileRow | null) ?? null;
    }

    const profile = projection?.profile && typeof projection.profile === "object"
      ? projection.profile
      : computeProfileFromOutcomes(outcomes);
    const latestOutcome = projection?.latest_result ?? outcomes[0] ?? null;

    // Practice and playbook evidence from the sister apps (service-role read,
    // scoped to the already-authorised target user). Never fails the profile.
    let sisterSignals: SisterSignals | null = null;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (serviceRoleKey) {
      try {
        const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
        sisterSignals = await loadSisterSignals(serviceClient, targetUserId);
      } catch {
        sisterSignals = null;
      }
    }

    return new Response(
      JSON.stringify({
        user_id: targetUserId,
        generated_at: new Date().toISOString(),
        source: { rows: outcomes.length, schema: "exam.result.v1" },
        latest_outcome: latestOutcome,
        skill_profile: profile,
        // Mock profile plus practice evidence, weakest first.
        weak_skills: combinedWeakSkills(profile as Record<string, unknown>, sisterSignals),
        sister_signals: sisterSignals,
        next_steps: sisterSignals ? examNextSteps(sisterSignals) : [],
        projection: projection
          ? {
              schema_version: projection.schema_version,
              signals_count: projection.signals_count,
              sessions_count: projection.sessions_count,
              latest_event_id: projection.latest_event_id,
              latest_event_at: projection.latest_event_at,
              updated_at: projection.updated_at,
            }
          : null,
        outcomes,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
