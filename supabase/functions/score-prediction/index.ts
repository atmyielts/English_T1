import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const getEnv = (k: string) => { const v = Deno.env.get(k); if (!v) throw new Error(`Missing ${k}`); return v; };
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...corsHeaders } });

// Simple linear regression on (index → score) pairs.
// Returns { slope, intercept, r2 }.
const linearRegression = (ys: number[]): { slope: number; intercept: number; r2: number } => {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, r2: 0 };
  const xs = ys.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  const ssXX = xs.reduce((a, x) => a + (x - meanX) ** 2, 0);
  const ssXY = xs.reduce((a, x, i) => a + (x - meanX) * (ys[i] - meanY), 0);
  const slope = ssXX === 0 ? 0 : ssXY / ssXX;
  const intercept = meanY - slope * meanX;
  // R-squared
  const ssTot = ys.reduce((a, y) => a + (y - meanY) ** 2, 0);
  const ssRes = ys.reduce((a, y, i) => a + (y - (slope * xs[i] + intercept)) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  return { slope, intercept, r2 };
};

// Round to nearest 0.5 (IELTS band style)
const roundBand = (v: number, max: number): number => Math.min(max, Math.max(0, Math.round(v * 2) / 2));

// Classify trend
const classifyTrend = (slope: number, stdDev: number): "improving" | "stable" | "declining" => {
  const threshold = Math.max(0.15, stdDev * 0.3);
  if (slope > threshold) return "improving";
  if (slope < -threshold) return "declining";
  return "stable";
};

const stdDev = (values: number[]): number => {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json(405, { error: "Method not allowed" });

  try {
    const sbUrl = getEnv("SUPABASE_URL");
    const sbAnon = getEnv("SUPABASE_ANON_KEY");
    const sbService = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

    const authSb = createClient(sbUrl, sbAnon, { auth: { persistSession: false } });
    const { data: auth, error: authErr } = await authSb.auth.getUser(token);
    if (authErr || !auth?.user) return json(401, { error: "Unauthorized" });
    const userId = auth.user.id;

    const sb = createClient(sbUrl, sbService, { auth: { persistSession: false } });
    const url = new URL(req.url);
    const examTypeFilter = url.searchParams.get("exam_type") ?? null;

    // Load last 10 outcomes for this user, ordered by computed_at
    let query = sb
      .from("exam_outcomes")
      .select("id, product_id, experience_id, exam_type, overall_band, overall_score, section_scores, skill_breakdown, computed_at, products(name, metadata)")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("computed_at", { ascending: true })
      .limit(20);

    if (examTypeFilter) query = query.eq("exam_type", examTypeFilter);

    const { data: outcomes, error } = await query;
    if (error) return json(500, { error: "Failed to load outcomes", detail: error.message });

    const rows = (outcomes ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) return json(200, { predictions: [], message: "No completed exams yet. Take at least one practice exam to get score predictions." });

    // Group by exam_type (product)
    const byType = new Map<string, Array<{ band: number | null; score: number | null; date: string; id: string }>>();
    for (const row of rows) {
      const examType = String(row.exam_type ?? (row.products as any)?.metadata?.exam_type ?? "unknown");
      const date = String(row.computed_at ?? "");
      if (!byType.has(examType)) byType.set(examType, []);
      byType.get(examType)!.push({
        band: typeof row.overall_band === "number" ? row.overall_band : null,
        score: typeof row.overall_score === "number" ? row.overall_score : null,
        date,
        id: String(row.id ?? ""),
      });
    }

    const predictions: Array<Record<string, unknown>> = [];

    for (const [examType, points] of byType.entries()) {
      const bandsWithValue = points.filter((p) => p.band !== null) as Array<{ band: number; date: string; id: string }>;
      const scoresWithValue = points.filter((p) => p.score !== null) as Array<{ score: number; date: string; id: string }>;

      const primaryValues = bandsWithValue.length > 0 ? bandsWithValue.map((p) => p.band) : scoresWithValue.map((p) => p.score);
      const usesBand = bandsWithValue.length > 0;

      if (primaryValues.length === 0) continue;

      const maxVal = examType === "sat" ? 1600 : examType === "toefl" ? 120 : 9;
      const { slope, intercept, r2 } = linearRegression(primaryValues);
      const nextIndex = primaryValues.length;
      const rawPrediction = intercept + slope * nextIndex;
      const predBand = roundBand(rawPrediction, maxVal);

      const sd = stdDev(primaryValues);
      const trend = classifyTrend(slope, sd);

      // Confidence interval (±1 std dev, tighter when r2 is high)
      const confidenceHalfWidth = sd * (1 - r2 * 0.5) + 0.25;
      const confidenceLow = roundBand(predBand - confidenceHalfWidth, maxVal);
      const confidenceHigh = roundBand(predBand + confidenceHalfWidth, maxVal);

      const dataForUpsert = {
        user_id: userId,
        exam_type: examType,
        predicted_band: predBand,
        confidence_low: confidenceLow,
        confidence_high: confidenceHigh,
        trend,
        data_points: primaryValues.length,
        computed_at: new Date().toISOString(),
        metadata: { r2, slope, sd },
      };

      // Cache in DB (non-blocking)
      sb.from("score_predictions").upsert(dataForUpsert, { onConflict: "user_id,exam_type" }).then(() => {});

      predictions.push({
        exam_type: examType,
        current_score: primaryValues[primaryValues.length - 1],
        predicted_next: predBand,
        confidence_low: confidenceLow,
        confidence_high: confidenceHigh,
        trend,
        data_points: primaryValues.length,
        uses_band: usesBand,
        max_score: maxVal,
        history: points.slice(-5).map((p, i) => ({
          index: i,
          date: usesBand ? (bandsWithValue[i]?.date ?? p.date) : (scoresWithValue[i]?.date ?? p.date),
          score: usesBand ? (p as any).band : (p as any).score,
        })),
        r2: Math.round(r2 * 100) / 100,
        message: trend === "improving"
          ? `You're improving! Based on your last ${primaryValues.length} sessions, you're on track to reach ${predBand}${usesBand ? "" : " pts"}.`
          : trend === "declining"
          ? `Your recent scores have dipped. Focus on consistency — your predicted next score is ${predBand}${usesBand ? "" : " pts"}.`
          : `Your scores are stable around ${primaryValues[primaryValues.length - 1]}${usesBand ? "" : " pts"}. Keep practicing to push higher.`,
      });
    }

    return json(200, { predictions, total_exams: rows.length });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : "Unknown error" });
  }
});
