import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { examKeyOf, loadSisterSignals } from "../_shared/sister-signals.ts";
import { mockExamType, predictSeries, seriesPoint } from "./logic.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const getEnv = (k: string) => { const v = Deno.env.get(k); if (!v) throw new Error(`Missing ${k}`); return v; };
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...corsHeaders } });

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
    const examTypeFilter = (url.searchParams.get("exam_type") ?? "").trim().toLowerCase() || null;

    // Full mocks only. exam_outcomes has no exam_type column: the exam comes
    // from the product (practice and playbook products are not mocks).
    const [{ data: outcomes, error }, signals] = await Promise.all([
      sb
        .from("exam_outcomes")
        .select("id, product_id, overall_band, overall_score, computed_at, toefl:raw_result->toefl, products(name, metadata)")
        .eq("user_id", userId)
        .eq("status", "completed")
        .order("computed_at", { ascending: false })
        .limit(60),
      loadSisterSignals(sb, userId),
    ]);
    if (error) return json(500, { error: "Failed to load outcomes", detail: error.message });

    const byType = new Map<string, Array<{ band: number | null; score: number | null; date: string }>>();
    // Newest 60 were loaded; walk them oldest first so series run in time order.
    for (const row of ((outcomes ?? []) as Array<Record<string, unknown>>).slice().reverse()) {
      const product = (row.products ?? null) as { metadata?: Record<string, unknown> | null } | null;
      const productType = mockExamType(product?.metadata ?? null);
      const point = productType ? seriesPoint(productType, row) : null;
      if (!point || (examTypeFilter && point.examType !== examTypeFilter)) continue;
      const list = byType.get(point.examType) ?? [];
      list.push({ band: point.band, score: point.score, date: String(row.computed_at ?? "") });
      byType.set(point.examType, list);
    }

    const practiceSignals = examTypeFilter
      ? { [examTypeFilter]: examKeyOf(examTypeFilter) ? signals[examKeyOf(examTypeFilter)!] ?? null : null }
      : { ielts: signals.ielts, sat: signals.sat, toefl: signals.toefl };

    const predictions: Array<Record<string, unknown>> = [];
    let totalExams = 0;
    for (const [examType, rawPoints] of byType.entries()) {
      const points = rawPoints.slice(-20);
      totalExams += points.length;
      const banded = points.filter((p) => p.band !== null);
      const usesBand = banded.length > 0;
      const series = usesBand ? banded : points.filter((p) => p.score !== null);
      const values = series.map((p) => (usesBand ? p.band : p.score) as number);
      const examKey = examKeyOf(examType);
      const prediction = predictSeries(examType, values, usesBand, examKey ? signals[examKey].practice : null);
      if (!prediction) continue;

      // Cache in DB (non-blocking)
      sb.from("score_predictions").upsert({
        user_id: userId,
        exam_type: examType,
        predicted_band: prediction.predicted_next,
        confidence_low: prediction.confidence_low,
        confidence_high: prediction.confidence_high,
        trend: prediction.trend,
        data_points: prediction.data_points,
        computed_at: new Date().toISOString(),
        metadata: { r2: prediction.r2, confidence_adjustment: prediction.confidence_adjustment },
      }, { onConflict: "user_id,exam_type" }).then(() => {});

      const unit = usesBand ? "" : " pts";
      predictions.push({
        ...prediction,
        history: series.slice(-5).map((p, i) => ({ index: i, date: p.date, score: usesBand ? p.band : p.score })),
        message: prediction.trend === "improving"
          ? `You're improving! Based on your last ${prediction.data_points} mock tests, you're on track to reach ${prediction.predicted_next}${unit}.`
          : prediction.trend === "declining"
          ? `Your recent scores have dipped. Focus on consistency — your predicted next score is ${prediction.predicted_next}${unit}.`
          : `Your scores are stable around ${prediction.current_score}${unit}. Keep practicing to push higher.`,
      });
    }

    if (predictions.length === 0) {
      return json(200, {
        predictions: [],
        total_exams: 0,
        practice_signals: practiceSignals,
        message: "No completed mock tests yet. Take at least one full mock test to get score predictions.",
      });
    }
    return json(200, { predictions, total_exams: totalExams, practice_signals: practiceSignals });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : "Unknown error" });
  }
});
