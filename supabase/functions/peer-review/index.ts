import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors } });
const getEnv = (k: string) => { const v = Deno.env.get(k); if (!v) throw new Error(`Missing ${k}`); return v; };
const bearer = (req: Request) => { const h = req.headers.get("Authorization") ?? ""; return h.startsWith("Bearer ") ? h.slice(7) : h || null; };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const token = bearer(req);
    if (!token) return json(401, { error: "Unauthorized" });
    const sb = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const authSb = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
    const { data: auth } = await authSb.auth.getUser(token);
    if (!auth?.user) return json(401, { error: "Unauthorized" });
    const userId = auth.user.id;

    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = String(url.searchParams.get("action") || body?.action || "queue").toLowerCase();

    if (action === "submit") {
      const essayText = String(body?.essay_text ?? "").trim();
      const promptText = String(body?.prompt_text ?? "").trim() || null;
      const examType = String(body?.exam_type ?? "ielts").toLowerCase();
      const taskType = String(body?.task_type ?? "task2");
      if (!essayText) return json(400, { error: "essay_text is required" });
      if (essayText.length < 100) return json(400, { error: "Essay too short (min 100 characters)" });

      const wordCount = essayText.split(/\s+/).filter(Boolean).length;

      const { data: submission, error } = await sb.from("peer_review_submissions").insert({
        user_id: userId, exam_type: examType, task_type: taskType, prompt_text: promptText,
        essay_text: essayText, word_count: wordCount, target_band: typeof body?.target_band === "number" ? body.target_band : null,
      }).select("id, status, reviews_needed, created_at").maybeSingle();

      if (error) return json(500, { error: error.message });
      return json(200, { submission });
    }

    if (action === "queue") {
      // Return submissions waiting for review (not the user's own, not already reviewed by this user)
      const { data } = await sb.from("peer_review_submissions")
        .select("id, exam_type, task_type, prompt_text, word_count, target_band, reviews_needed, reviews_count, created_at")
        .eq("status", "pending_review")
        .neq("user_id", userId)
        .not("id", "in", `(select submission_id from public.peer_reviews where reviewer_id = '${userId}')`)
        .order("created_at").limit(10);
      return json(200, { submissions: data ?? [] });
    }

    if (action === "get_submission") {
      const subId = String(url.searchParams.get("submission_id") || body?.submission_id ?? "").trim();
      if (!subId) return json(400, { error: "submission_id required" });
      const { data } = await sb.from("peer_review_submissions")
        .select("id, user_id, exam_type, task_type, prompt_text, essay_text, word_count, target_band, status, reviews_count, reviews_needed, created_at")
        .eq("id", subId).maybeSingle();
      if (!data) return json(404, { error: "Not found" });
      // Only show essay if it's the submitter's own OR they're in the reviewer pool
      if (String(data.user_id) !== userId && data.status === "closed") return json(403, { error: "Submission is closed" });
      return json(200, { submission: data });
    }

    if (action === "submit_review") {
      const subId = String(body?.submission_id ?? "").trim();
      if (!subId) return json(400, { error: "submission_id required" });
      if (!body?.overall_comment && !body?.band_score) return json(400, { error: "band_score or overall_comment required" });

      // Verify submission exists and is open
      const { data: sub } = await sb.from("peer_review_submissions").select("id, user_id, reviews_needed, reviews_count, status").eq("id", subId).maybeSingle();
      if (!sub) return json(404, { error: "Submission not found" });
      if (String(sub.user_id) === userId) return json(400, { error: "Cannot review your own submission" });
      if (sub.status === "closed") return json(400, { error: "Submission is closed for review" });

      const { data: review, error } = await sb.from("peer_reviews").insert({
        submission_id: subId, reviewer_id: userId,
        band_score: typeof body.band_score === "number" ? body.band_score : null,
        criteria: body.criteria && typeof body.criteria === "object" ? body.criteria : null,
        strengths: String(body.strengths ?? "").trim() || null,
        improvements: String(body.improvements ?? "").trim() || null,
        overall_comment: String(body.overall_comment ?? "").trim() || null,
      }).select("id, created_at").maybeSingle();

      if (error) {
        if (String(error.code) === "23505") return json(409, { error: "You already reviewed this submission" });
        return json(500, { error: error.message });
      }

      // Update reviews_count and status
      const newCount = (sub.reviews_count ?? 0) + 1;
      const newStatus = newCount >= (sub.reviews_needed ?? 2) ? "reviewed" : "reviewing";
      await sb.from("peer_review_submissions").update({ reviews_count: newCount, status: newStatus }).eq("id", subId);

      return json(200, { review });
    }

    if (action === "my_submissions") {
      const { data } = await sb.from("peer_review_submissions")
        .select("id, exam_type, task_type, word_count, status, reviews_count, reviews_needed, created_at")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(20);

      // Load reviews for each submission
      const ids = (data ?? []).map((s: any) => s.id);
      const { data: reviews } = ids.length > 0
        ? await sb.from("peer_reviews").select("submission_id, band_score, criteria, strengths, improvements, overall_comment, created_at").in("submission_id", ids)
        : { data: [] };

      return json(200, { submissions: data ?? [], reviews: reviews ?? [] });
    }

    if (action === "my_reviews") {
      const { data } = await sb.from("peer_reviews")
        .select("id, submission_id, band_score, overall_comment, created_at, peer_review_submissions(exam_type, task_type, word_count)")
        .eq("reviewer_id", userId).order("created_at", { ascending: false }).limit(20);
      return json(200, { reviews: data ?? [] });
    }

    if (action === "rate_helpful") {
      const reviewId = String(body?.review_id ?? "").trim();
      const isHelpful = Boolean(body?.is_helpful);
      if (!reviewId) return json(400, { error: "review_id required" });
      // Verify caller owns the submission
      const { data: review } = await sb.from("peer_reviews").select("submission_id").eq("id", reviewId).maybeSingle();
      if (!review) return json(404, { error: "Review not found" });
      const { data: sub } = await sb.from("peer_review_submissions").select("user_id").eq("id", review.submission_id).maybeSingle();
      if (!sub || String(sub.user_id) !== userId) return json(403, { error: "Forbidden" });
      await sb.from("peer_reviews").update({ is_helpful: isHelpful, status: isHelpful ? "helpful" : "not_helpful" }).eq("id", reviewId);
      return json(200, { ok: true });
    }

    return json(404, { error: "Not found" });
  } catch (err) { return json(500, { error: err instanceof Error ? err.message : "Unknown" }); }
});
