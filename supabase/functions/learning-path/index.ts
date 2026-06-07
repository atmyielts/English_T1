import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors } });
const getEnv = (k: string) => { const v = Deno.env.get(k); if (!v) throw new Error(`Missing ${k}`); return v; };
const bearer = (req: Request) => { const h = req.headers.get("Authorization") ?? ""; return h.startsWith("Bearer ") ? h.slice(7) : h || null; };

// Maps band gaps to recommended activities per skill
const ACTIVITIES: Record<string, string[]> = {
  reading: ["Timed reading passage (academic texts)", "Skimming & scanning practice", "Vocabulary in context exercise", "IELTS Reading mock section", "Note completion task"],
  writing: ["Task 2 timed essay (40 min)", "Task 1 graph description practice", "Vocabulary paraphrase drill", "Cohesion & coherence rewriting", "Model answer analysis"],
  listening: ["Dictation exercise", "IELTS Listening section 1-4", "Note-taking from podcast", "Gap-fill listening task", "Summary completion task"],
  speaking: ["Part 2 cue card practice (2 min)", "Vocabulary expansion - topic words", "Fluency warm-up (1 min monologue)", "Part 3 discussion practice", "Record & self-assess"],
  vocabulary: ["Learn 15 Academic Word List words", "Collocations drill", "Synonyms & antonyms practice", "Word form practice (noun/verb/adj)", "Gap-fill with AWL vocabulary"],
  grammar: ["Complex sentence construction", "Passive voice transformation", "Conditional sentences practice", "Articles & prepositions drill", "Error correction exercise"],
};

const SKILL_DESCRIPTIONS: Record<string, string> = {
  reading: "Build comprehension speed and accuracy",
  writing: "Improve task response, cohesion, and vocabulary",
  listening: "Sharpen note-taking and understanding of accents",
  speaking: "Develop fluency, coherence, and range",
  vocabulary: "Expand academic vocabulary range",
  grammar: "Master complex grammatical structures",
};

function generatePlan(targetBand: number, sectionGaps: Record<string, number>, weeks: number): Array<{ week: number; skill: string; activity: string; description: string; day: number; duration_min: number; position: number }> {
  const items: Array<{ week: number; skill: string; activity: string; description: string; day: number; duration_min: number; position: number }> = [];
  // Sort skills by gap size (weakest first)
  const skills = Object.entries(sectionGaps)
    .sort((a, b) => b[1] - a[1])
    .map(([skill]) => skill);

  const baseSkills = skills.length > 0 ? skills : ["reading", "writing", "listening", "speaking"];
  let pos = 0;

  for (let week = 1; week <= weeks; week++) {
    const dayAssignments: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    const primarySkill = baseSkills[0];
    const secondarySkill = baseSkills[1] ?? "vocabulary";

    // 5 activities per week, rotating through weak skills
    const weekSkills = [primarySkill, secondarySkill, primarySkill, baseSkills[2] ?? "grammar", secondarySkill];
    weekSkills.forEach((skill, i) => {
      const day = i + 1;
      const acts = ACTIVITIES[skill] ?? ACTIVITIES.reading;
      const actIndex = ((week - 1) * 5 + i) % acts.length;
      items.push({
        week, skill, activity: acts[actIndex],
        description: SKILL_DESCRIPTIONS[skill] ?? "",
        day, duration_min: skill === "writing" ? 45 : 30,
        position: pos++,
      });
    });
  }
  return items;
}

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
    const action = String(url.searchParams.get("action") || body?.action || "get").toLowerCase();

    if (action === "get") {
      const { data: plan } = await sb.from("learning_path_plans").select("*").eq("user_id", userId).eq("status", "active").order("generated_at", { ascending: false }).limit(1).maybeSingle();
      if (!plan) return json(200, { plan: null, items: [] });
      const { data: items } = await sb.from("learning_path_items").select("*").eq("plan_id", plan.id).order("position");
      return json(200, { plan, items: items ?? [] });
    }

    if (action === "generate") {
      const examType = String(body?.exam_type ?? "ielts").toLowerCase();
      const targetBand = typeof body?.target_band === "number" ? body.target_band : 7.0;
      const weeks = Math.min(Math.max(1, Number(body?.weeks ?? 4)), 12);

      // Analyze last 5 exam outcomes for section gaps
      const { data: outcomes } = await sb.from("exam_outcomes")
        .select("overall_band, section_scores, skill_breakdown")
        .eq("user_id", userId).eq("status", "completed")
        .order("computed_at", { ascending: false }).limit(5);

      const sectionGaps: Record<string, number> = {};
      let currentBand: number | null = null;

      if (outcomes && outcomes.length > 0) {
        const latestOutcome = outcomes[0] as Record<string, unknown>;
        currentBand = typeof latestOutcome.overall_band === "number" ? latestOutcome.overall_band : null;

        // Compute average section scores
        const sectionTotals: Record<string, number[]> = {};
        for (const outcome of outcomes as Array<Record<string, unknown>>) {
          const ss = (outcome.section_scores ?? {}) as Record<string, Record<string, unknown>>;
          for (const [key, val] of Object.entries(ss)) {
            const band = typeof val === "object" && val !== null ? Number((val as any).band ?? (val as any).score ?? NaN) : Number(val);
            if (Number.isFinite(band)) {
              if (!sectionTotals[key]) sectionTotals[key] = [];
              sectionTotals[key].push(band);
            }
          }
        }
        for (const [skill, vals] of Object.entries(sectionTotals)) {
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          sectionGaps[skill] = Math.max(0, targetBand - avg);
        }
      }

      // Default gaps if no history
      if (Object.keys(sectionGaps).length === 0) {
        ["writing", "speaking", "reading", "listening"].forEach((s, i) => { sectionGaps[s] = 2 - i * 0.4; });
      }

      const planItems = generatePlan(targetBand, sectionGaps, weeks);

      // Archive existing active plans
      await sb.from("learning_path_plans").update({ status: "archived" }).eq("user_id", userId).eq("status", "active");

      const { data: plan, error } = await sb.from("learning_path_plans").insert({
        user_id: userId, exam_type: examType, target_band: targetBand,
        current_band: currentBand, weeks,
        metadata: { section_gaps: sectionGaps, data_points: outcomes?.length ?? 0 },
      }).select().maybeSingle();

      if (error || !plan?.id) return json(500, { error: "Failed to create plan" });

      const rows = planItems.map((item) => ({ ...item, plan_id: plan.id, user_id: userId }));
      await sb.from("learning_path_items").insert(rows);

      const { data: items } = await sb.from("learning_path_items").select("*").eq("plan_id", plan.id).order("position");
      return json(200, { plan, items: items ?? [], section_gaps: sectionGaps });
    }

    if (action === "complete_item") {
      const itemId = String(body?.item_id ?? "").trim();
      if (!itemId) return json(400, { error: "item_id is required" });
      await sb.from("learning_path_items").update({ completed: true, completed_at: new Date().toISOString() }).eq("id", itemId).eq("user_id", userId);
      return json(200, { ok: true });
    }

    return json(404, { error: "Not found" });
  } catch (err) { return json(500, { error: err instanceof Error ? err.message : "Unknown" }); }
});
