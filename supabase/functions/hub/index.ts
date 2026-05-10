import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  authUser,
  buildDailyPlanForUser,
  corsHeaders,
  extractRoute,
  getEnv,
  json,
  resolveEnglishProducts,
  resolveLanguageScope,
  toText,
} from "../_shared/english-learning.ts";
import {
  buildCefrSnapshot,
  buildCrossSkillActivity,
  buildUnifiedMistakeNotebook,
} from "../_shared/english-insights.ts";
import { callEnglishAIWithStatus, isEnglishAIConfigured } from "../_shared/english-ai.ts";
import { parseBody } from "../_shared/english-learning.ts";

const routeMarker = "/hub";

const jsonCached = (status: number, body: unknown, maxAgeSeconds = 60): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `private, max-age=${maxAgeSeconds}`,
      ...corsHeaders,
    },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const auth = await authUser(sb, req);
    if (!auth) return json(401, { error: "Unauthorized" });

    const url = new URL(req.url);
    const route = extractRoute(url, routeMarker);
    const scope = await resolveLanguageScope(sb, toText(url.searchParams.get("language_code"), 16) || "en");
    const products = await resolveEnglishProducts(sb);

    // Existing daily plan endpoint (unchanged).
    if (req.method === "GET" && route === "/plan") {
      const rebuild = String(url.searchParams.get("rebuild") ?? "").toLowerCase() === "true"
        || String(url.searchParams.get("rebuild") ?? "") === "1";
      const payload = await buildDailyPlanForUser(sb, {
        userId: auth.userId,
        languageId: scope.languageId,
        products,
        rebuild,
      });
      return json(200, payload);
    }

    // === New cross-skill insights endpoints (Tier A foundation) ===

    if (req.method === "GET" && route === "/insights/cefr") {
      const data = await buildCefrSnapshot(sb, scope.languageId, auth.userId);
      return jsonCached(200, data, 300);
    }

    if (req.method === "GET" && route === "/insights/activity") {
      const data = await buildCrossSkillActivity(sb, scope.languageId, auth.userId);
      return jsonCached(200, { ok: true, ...data }, 60);
    }

    if (req.method === "GET" && route === "/insights/mistakes") {
      const items = await buildUnifiedMistakeNotebook(sb, scope.languageId, auth.userId);
      return jsonCached(200, { ok: true, items }, 60);
    }

    // Combined dashboard payload — single round-trip for the english-hub UI.
    if (req.method === "GET" && route === "/dashboard") {
      const [cefr, activity, mistakes, plan] = await Promise.all([
        buildCefrSnapshot(sb, scope.languageId, auth.userId).catch(() => null),
        buildCrossSkillActivity(sb, scope.languageId, auth.userId).catch(() => null),
        buildUnifiedMistakeNotebook(sb, scope.languageId, auth.userId).catch(() => []),
        buildDailyPlanForUser(sb, {
          userId: auth.userId,
          languageId: scope.languageId,
          products,
          rebuild: false,
        }).catch(() => null),
      ]);
      return jsonCached(200, {
        ok: true,
        cefr,
        activity: activity ? { ok: true, ...activity } : null,
        mistakes,
        plan,
      }, 60);
    }

    // Tier B-style cross-skill AI study coach. Uses the new English AI helper
    // (OpenAI direct by default, with Anthropic / Google / OpenRouter
    // fallbacks selectable via ENGLISH_AI_PROVIDER env).
    if (req.method === "GET" && route === "/insights/coach-summary") {
      const [cefr, activity] = await Promise.all([
        buildCefrSnapshot(sb, scope.languageId, auth.userId).catch(() => null),
        buildCrossSkillActivity(sb, scope.languageId, auth.userId).catch(() => null),
      ]);
      const context = {
        overall_cefr: cefr?.overall ?? null,
        skill_levels: cefr?.estimates ?? [],
        streak_days: activity?.streak.current_days ?? 0,
        last_30_days_events: activity?.totals.last_30_days ?? 0,
      };
      const { data: result, status: aiStatus, error: aiError, provider } = await callEnglishAIWithStatus<{
        summary?: unknown;
        insights?: unknown;
      }>(
        {
          systemPrompt: "You are an English study coach reviewing a learner's recent activity across reading, writing, listening, speaking, grammar, and vocabulary. From the JSON context, generate 3-4 SPECIFIC actionable insights. Each insight cites the actual data and gives one next action with a route. Return strict JSON: {summary: 1-2 sentence overall read, insights: array (3-4 items) of {type: 'progress'|'risk'|'recommendation'|'celebration', title: 5-8 words, body: 1-2 sentences citing actual numbers, action_label: 3-5 word CTA, action_route: relative URL like '/reading' or '/speaking' or '/vocabulary'}}.",
          userPayload: JSON.stringify(context),
          temperature: 0.4,
        },
        { summary: "", insights: [] },
      );

      const summary = typeof result.summary === "string" ? result.summary : "";
      const insights = Array.isArray(result.insights)
        ? (result.insights as unknown[])
            .filter((i): i is Record<string, unknown> => !!i && typeof i === "object" && !Array.isArray(i))
            .map((i) => ({
              type: ["progress", "risk", "recommendation", "celebration"].includes(String(i.type ?? "")) ? String(i.type) : "recommendation",
              title: toText(i.title, 120),
              body: toText(i.body, 600),
              action_label: toText(i.action_label, 60),
              action_route: toText(i.action_route, 120) || "/",
            }))
            .filter((i) => i.title && i.body)
            .slice(0, 4)
        : [];

      return new Response(JSON.stringify({
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        ai_provider: provider,
        ai_error: aiError ?? null,
        summary,
        insights,
        generated_at: new Date().toISOString(),
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=28800",
          ...corsHeaders,
        },
      });
    }

    // Tier B #12 — vocab-in-context generator. Pulls the user's weakest
    // vocabulary notebook entries (or accepts an explicit words list) and
    // asks AI to produce a short passage featuring them naturally, with
    // word-level highlights so the learner sees them in context.
    if (req.method === "POST" && route === "/ai/vocab-in-context") {
      const body = await parseBody(req);
      const requestedWords: string[] = Array.isArray((body as Record<string, unknown>).words)
        ? ((body as Record<string, unknown>).words as unknown[]).map((w) => String(w ?? "").trim()).filter(Boolean)
        : [];
      const topic = toText((body as Record<string, unknown>).topic, 200);

      let words = requestedWords.slice(0, 8);
      if (words.length === 0) {
        // Pull the user's lowest-Leitner-box vocab as a default.
        const { data: rows } = await sb
          .from("user_vocabulary_notebook_entries")
          .select("word")
          .eq("user_id", auth.userId)
          .eq("language_id", scope.languageId)
          .eq("is_archived", false)
          .lte("leitner_box", 2)
          .order("created_at", { ascending: false })
          .limit(8);
        words = ((rows ?? []) as Array<{ word: string }>).map((r) => r.word).filter(Boolean);
      }

      if (words.length === 0) {
        return json(200, {
          ok: true,
          ai_available: isEnglishAIConfigured(),
          ai_status: "ok",
          words: [],
          passage: "",
          translations: {},
          message: "Add a few words to your notebook (or pass words: [...] in the request body) to generate a contextual passage.",
        });
      }

      const { data: result, status: aiStatus, error: aiError, provider } = await callEnglishAIWithStatus<{
        passage?: unknown;
        translations?: unknown;
      }>(
        {
          systemPrompt:
            "You are an English teacher generating a short, natural reading passage that uses the given words IN CONTEXT. The passage should be 110-160 words at upper-intermediate (B2) reading level — readable but not artificial. Use each given word at least once, naturally, in a way that demonstrates its meaning. Reply in strict JSON: {passage: string, translations: { word: 1-line plain-English definition for each given word }}.",
          userPayload: JSON.stringify({ topic: topic || "any natural everyday topic", words }),
          temperature: 0.6,
        },
        { passage: "", translations: {} },
      );

      const passage = typeof result.passage === "string" ? result.passage : "";
      const translations: Record<string, string> = {};
      if (result.translations && typeof result.translations === "object" && !Array.isArray(result.translations)) {
        for (const [k, v] of Object.entries(result.translations as Record<string, unknown>)) {
          translations[String(k).toLowerCase()] = toText(v, 240);
        }
      }
      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        ai_provider: provider,
        ai_error: aiError ?? null,
        words,
        passage,
        translations,
        topic: topic || null,
        generated_at: new Date().toISOString(),
      });
    }

    // Tier B #14 — grammar pattern decoder. Takes one English sentence and
    // returns its parsed grammatical structure with annotated explanation.
    // For advanced learners hitting pattern walls.
    if (req.method === "POST" && route === "/ai/grammar-decode") {
      const body = await parseBody(req);
      const sentence = toText((body as Record<string, unknown>).sentence, 1000);
      if (!sentence || sentence.length < 5) {
        return json(400, { error: "sentence is required (min 5 characters)" });
      }

      const { data: result, status: aiStatus, error: aiError, provider } = await callEnglishAIWithStatus<{
        clauses?: unknown;
        tense?: unknown;
        voice?: unknown;
        register?: unknown;
        notes?: unknown;
        rephrasings?: unknown;
      }>(
        {
          systemPrompt:
            "You are an English grammar tutor parsing a sentence for an advanced learner. Decode its structure and return strict JSON with: clauses (array of {role: 'main'|'subordinate'|'relative'|'noun'|'adverbial'|'participial', text: exact substring, function: one-sentence purpose}), tense (e.g., 'past perfect continuous'), voice ('active'|'passive'), register ('formal'|'neutral'|'informal'|'literary'|'spoken'), notes (1-3 short observations on what makes this sentence work or where learners stumble), rephrasings (array of 2 alternate ways to express the same idea, each {text, why_different}).",
          userPayload: JSON.stringify({ sentence }),
          temperature: 0.3,
        },
        { clauses: [], tense: "", voice: "", register: "", notes: [], rephrasings: [] },
      );

      const clauses = Array.isArray(result.clauses)
        ? (result.clauses as unknown[])
            .filter((c): c is Record<string, unknown> => !!c && typeof c === "object" && !Array.isArray(c))
            .map((c) => ({
              role: toText(c.role, 32),
              text: toText(c.text, 600),
              function: toText(c.function, 400),
            }))
            .filter((c) => c.text)
            .slice(0, 8)
        : [];
      const notes = Array.isArray(result.notes)
        ? (result.notes as unknown[]).map((n) => toText(n, 400)).filter(Boolean).slice(0, 4)
        : [];
      const rephrasings = Array.isArray(result.rephrasings)
        ? (result.rephrasings as unknown[])
            .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r))
            .map((r) => ({
              text: toText(r.text, 600),
              why_different: toText(r.why_different, 400),
            }))
            .filter((r) => r.text)
            .slice(0, 3)
        : [];

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        ai_provider: provider,
        ai_error: aiError ?? null,
        sentence,
        clauses,
        tense: toText(result.tense, 80),
        voice: toText(result.voice, 24),
        register: toText(result.register, 32),
        notes,
        rephrasings,
        generated_at: new Date().toISOString(),
      });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
