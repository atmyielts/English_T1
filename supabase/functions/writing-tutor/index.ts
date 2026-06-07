import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const getEnv = (k: string) => { const v = Deno.env.get(k); if (!v) throw new Error(`Missing ${k}`); return v; };
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...corsHeaders } });
const getBearerToken = (req: Request) => { const h = req.headers.get("Authorization") ?? ""; return h.startsWith("Bearer ") ? h.slice(7) : h || null; };

const DAILY_FREE_LIMIT = 2;
const DAILY_PAID_LIMIT = 20;

const IELTS_SYSTEM_PROMPT = `You are an expert IELTS examiner. Grade the given writing task strictly using the official IELTS Writing Band Descriptors.
Respond ONLY with a valid JSON object matching this exact schema (no markdown, no extra text):
{
  "overall_band": number (0.0-9.0, increments of 0.5),
  "criteria": {
    "TR": number (0-9),
    "CC": number (0-9),
    "LR": number (0-9),
    "GRA": number (0-9)
  },
  "strengths": [string (max 3 items)],
  "improvements": [string (max 3 items)],
  "actionable_feedback": [string (max 3 concrete tips)],
  "feedback": string (2-3 paragraph overall commentary),
  "word_count_comment": string (brief note on word count adequacy)
}`;

const ITEP_SYSTEM_PROMPT = `You are an expert iTEP Academic examiner. Grade the given writing task using the iTEP Academic Plus Writing rubric (0-6 scale).
Respond ONLY with a valid JSON object matching this exact schema (no markdown, no extra text):
{
  "overall_band": number (0.0-6.0, one decimal),
  "criteria": {
    "TR": number (0-6, Task Completion),
    "CC": number (0-6, Organization),
    "LR": number (0-6, Vocabulary),
    "GRA": number (0-6, Grammar)
  },
  "strengths": [string (max 3)],
  "improvements": [string (max 3)],
  "actionable_feedback": [string (max 3 concrete tips)],
  "feedback": string (2-3 paragraph overall commentary),
  "word_count_comment": string
}`;

const buildUserPrompt = (examType: string, taskType: string | null, prompt: string, essay: string, wordCount: number): string => {
  const taskLabel = examType === "ielts"
    ? (taskType === "task1" ? "IELTS Academic Writing Task 1" : "IELTS Academic Writing Task 2")
    : "iTEP Academic Writing Task";
  return `${taskLabel}\n\nPrompt:\n${prompt}\n\nCandidate's response (${wordCount} words):\n${essay}`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const sbUrl = getEnv("SUPABASE_URL");
    const sbService = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sbAnon = getEnv("SUPABASE_ANON_KEY");

    const bearerToken = getBearerToken(req);
    if (!bearerToken) return json(401, { error: "Unauthorized" });

    const authSb = createClient(sbUrl, sbAnon, { auth: { persistSession: false } });
    const sb = createClient(sbUrl, sbService, { auth: { persistSession: false } });
    const { data: auth, error: authErr } = await authSb.auth.getUser(bearerToken);
    if (authErr || !auth?.user) return json(401, { error: "Unauthorized" });

    const userId = auth.user.id;
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = String(url.searchParams.get("action") || body?.action || "grade").toLowerCase();

    // ── GET quota ─────────────────────────────────────────────────────────────
    if (action === "quota") {
      const today = new Date().toISOString().slice(0, 10);
      const { count } = await sb
        .from("writing_tutor_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", `${today}T00:00:00Z`);

      // Check if user has a paid entitlement for writing-tutor
      const { data: entitlements } = await sb
        .from("entitlements")
        .select("id, resource_type, resource_id, ends_at, is_active")
        .eq("user_id", userId)
        .eq("is_active", true);

      const hasPaidAccess = (entitlements ?? []).some((e) => {
        if (!e.is_active) return false;
        if (e.ends_at && new Date(e.ends_at) < new Date()) return false;
        return true; // any active entitlement gives paid access
      });

      const limit = hasPaidAccess ? DAILY_PAID_LIMIT : DAILY_FREE_LIMIT;
      const used = count ?? 0;

      return json(200, { used, limit, remaining: Math.max(0, limit - used), has_paid_access: hasPaidAccess });
    }

    // ── POST grade ────────────────────────────────────────────────────────────
    if (action === "grade") {
      const essayText = String(body?.essay ?? "").trim();
      const promptText = String(body?.prompt ?? "").trim();
      const examType = String(body?.exam_type ?? "ielts").toLowerCase();
      const taskType = String(body?.task_type ?? "task2").toLowerCase();

      if (!essayText) return json(400, { error: "essay is required" });
      if (essayText.length < 50) return json(400, { error: "Essay is too short to grade (minimum 50 characters)" });
      if (essayText.length > 20000) return json(400, { error: "Essay is too long (maximum 20,000 characters)" });

      // Count words
      const wordCount = essayText.split(/\s+/).filter(Boolean).length;

      // Check daily quota
      const today = new Date().toISOString().slice(0, 10);
      const { count: usedToday } = await sb
        .from("writing_tutor_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", `${today}T00:00:00Z`);

      const { data: entitlements } = await sb
        .from("entitlements")
        .select("id, ends_at, is_active")
        .eq("user_id", userId)
        .eq("is_active", true);

      const hasPaidAccess = (entitlements ?? []).some((e) => {
        if (!e.is_active) return false;
        if (e.ends_at && new Date(e.ends_at) < new Date()) return false;
        return true;
      });

      const limit = hasPaidAccess ? DAILY_PAID_LIMIT : DAILY_FREE_LIMIT;
      if ((usedToday ?? 0) >= limit) {
        return json(429, {
          error: hasPaidAccess
            ? `Daily limit of ${limit} grading sessions reached. Try again tomorrow.`
            : `Free limit of ${DAILY_FREE_LIMIT} daily gradings reached. Upgrade for ${DAILY_PAID_LIMIT}/day.`,
          quota_exceeded: true,
          has_paid_access: hasPaidAccess,
        });
      }

      // Build prompt
      const systemPrompt = examType === "itep" ? ITEP_SYSTEM_PROMPT : IELTS_SYSTEM_PROMPT;
      const userPrompt = buildUserPrompt(examType, taskType, promptText || "[No specific prompt provided — general writing assessment]", essayText, wordCount);

      // Call OpenRouter
      const apiKey = getEnv("OPENROUTER_API_KEY");
      const model = Deno.env.get("OPENROUTER_MODEL") ?? "google/gemma-3-27b-it:free";
      const baseUrl = (Deno.env.get("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
      const appName = Deno.env.get("OPENROUTER_APP_NAME") ?? "Schood Writing Tutor";
      const referer = Deno.env.get("OPENROUTER_REFERER") ?? "https://schood.online";

      const aiRes = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": appName, "HTTP-Referer": referer },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
          temperature: 0.3,
          max_tokens: 1500,
          response_format: { type: "json_object" },
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text().catch(() => "");
        return json(502, { error: "AI grading service unavailable", detail: errText.slice(0, 200) });
      }

      const aiJson = await aiRes.json();
      const rawContent = aiJson?.choices?.[0]?.message?.content ?? "";
      const tokensUsed = aiJson?.usage?.total_tokens ?? null;

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        return json(502, { error: "AI returned invalid JSON", raw: rawContent.slice(0, 300) });
      }

      const overallBand = typeof parsed.overall_band === "number" ? parsed.overall_band : null;
      const criteria = parsed.criteria && typeof parsed.criteria === "object" ? parsed.criteria : null;

      // Store session
      const { data: sessionRow } = await sb
        .from("writing_tutor_sessions")
        .insert({
          user_id: userId,
          exam_type: examType,
          task_type: taskType,
          word_count: wordCount,
          overall_band: overallBand,
          criteria: criteria,
          feedback: String(parsed.feedback ?? ""),
          model,
          tokens_used: tokensUsed,
        })
        .select("id, created_at")
        .maybeSingle();

      return json(200, {
        session_id: sessionRow?.id ?? null,
        exam_type: examType,
        task_type: taskType,
        word_count: wordCount,
        overall_band: overallBand,
        criteria,
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
        actionable_feedback: Array.isArray(parsed.actionable_feedback) ? parsed.actionable_feedback : [],
        feedback: String(parsed.feedback ?? ""),
        word_count_comment: String(parsed.word_count_comment ?? ""),
        model,
        graded_at: sessionRow?.created_at ?? new Date().toISOString(),
        quota: { used: (usedToday ?? 0) + 1, limit, has_paid_access: hasPaidAccess },
      });
    }

    // ── GET history ───────────────────────────────────────────────────────────
    if (action === "history") {
      const { data, error } = await sb
        .from("writing_tutor_sessions")
        .select("id, exam_type, task_type, word_count, overall_band, criteria, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return json(500, { error: "Failed to load history" });
      return json(200, { sessions: data ?? [] });
    }

    return json(404, { error: "Not found" });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : "Unknown error" });
  }
});
