import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors } });
const getEnv = (k: string) => { const v = Deno.env.get(k); if (!v) throw new Error(`Missing ${k}`); return v; };
const bearer = (req: Request) => { const h = req.headers.get("Authorization") ?? ""; return h.startsWith("Bearer ") ? h.slice(7) : h || null; };

const IELTS_SPEAKING_PROMPT = `You are an expert IELTS examiner. Score the candidate's spoken response (provided as a transcript) on IELTS Speaking Band Descriptors.
Respond ONLY with valid JSON:
{
  "overall_band": number (0.0-9.0 in 0.5 increments),
  "criteria": {
    "FC": number (0-9, Fluency and Coherence),
    "LR": number (0-9, Lexical Resource),
    "GRA": number (0-9, Grammatical Range and Accuracy),
    "P": number (0-9, Pronunciation - estimate from vocabulary range and phrasing)
  },
  "strengths": [string],
  "improvements": [string],
  "feedback": string,
  "estimated_word_count_note": string
}`;

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
    const action = String(url.searchParams.get("action") || body?.action || "score").toLowerCase();

    if (action === "history") {
      const { data } = await sb.from("speaking_coach_sessions").select("id, topic, task_type, overall_band, criteria, word_count, duration_secs, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
      return json(200, { sessions: data ?? [] });
    }

    if (action === "score") {
      const transcript = String(body?.transcript ?? "").trim();
      const topic = String(body?.topic ?? "").trim() || null;
      const taskType = String(body?.task_type ?? "part2");
      const durationSecs = typeof body?.duration_secs === "number" ? body.duration_secs : null;
      if (!transcript) return json(400, { error: "transcript is required" });
      if (transcript.length < 20) return json(400, { error: "Transcript too short" });

      const wordCount = transcript.split(/\s+/).filter(Boolean).length;
      const userPrompt = `IELTS Speaking ${taskType.toUpperCase()}${topic ? ` — Topic: ${topic}` : ""}\n\nTranscript (${wordCount} words):\n${transcript}`;

      const apiKey = getEnv("OPENROUTER_API_KEY");
      const model = Deno.env.get("OPENROUTER_MODEL") ?? "google/gemma-3-27b-it:free";
      const baseUrl = (Deno.env.get("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");

      const aiRes = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "Schood Speaking Coach", "HTTP-Referer": Deno.env.get("OPENROUTER_REFERER") ?? "https://schood.online" },
        body: JSON.stringify({ model, messages: [{ role: "system", content: IELTS_SPEAKING_PROMPT }, { role: "user", content: userPrompt }], temperature: 0.3, max_tokens: 800, response_format: { type: "json_object" } }),
      });

      if (!aiRes.ok) return json(502, { error: "AI service unavailable" });
      const aiJson = await aiRes.json();
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(aiJson?.choices?.[0]?.message?.content ?? "{}"); } catch { return json(502, { error: "AI returned invalid JSON" }); }

      const { data: session } = await sb.from("speaking_coach_sessions").insert({
        user_id: userId, topic, task_type: taskType, transcript, word_count: wordCount,
        overall_band: parsed.overall_band ?? null, criteria: parsed.criteria ?? null,
        feedback: String(parsed.feedback ?? ""), model, duration_secs: durationSecs,
      }).select("id, created_at").maybeSingle();

      return json(200, { session_id: session?.id ?? null, overall_band: parsed.overall_band, criteria: parsed.criteria, strengths: parsed.strengths ?? [], improvements: parsed.improvements ?? [], feedback: parsed.feedback, word_count: wordCount, graded_at: session?.created_at ?? new Date().toISOString() });
    }

    return json(404, { error: "Not found" });
  } catch (err) { return json(500, { error: err instanceof Error ? err.message : "Unknown" }); }
});
