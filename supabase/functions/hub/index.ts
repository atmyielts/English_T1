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

    // Tier B #11 — AI essay grader (general English, CEFR-aligned).
    // Stateless. Takes a written response + target level, returns
    // per-criterion scores with concrete feedback. Distinct from the
    // IELTS rubric path; this one anchors to CEFR descriptors so it's
    // useful for general English learners outside the test-prep flow.
    if (req.method === "POST" && route === "/ai/essay-grade") {
      const body = await parseBody(req);
      const text = toText((body as Record<string, unknown>).text, 5000);
      const targetLevel = toText((body as Record<string, unknown>).target_level, 8).toUpperCase() || "B2";
      const prompt = toText((body as Record<string, unknown>).prompt, 1200);
      if (!text || text.length < 40) {
        return json(400, { error: "text is required (min 40 characters)" });
      }
      if (!["A1", "A2", "B1", "B2", "C1", "C2"].includes(targetLevel)) {
        return json(400, { error: "target_level must be one of A1 A2 B1 B2 C1 C2" });
      }

      const wordCount = text.split(/\s+/).filter(Boolean).length;
      const { data: result, status: aiStatus, error: aiError, provider } = await callEnglishAIWithStatus<{
        overall_level?: unknown;
        criteria?: unknown;
        strengths?: unknown;
        improvements?: unknown;
        actionable_next_step?: unknown;
        rewrite_sample?: unknown;
      }>(
        {
          systemPrompt:
            "You are a CEFR-aligned English writing examiner. Grade the response below against the target level using the four criteria: TASK (whether the response addresses the prompt fully and stays on topic), COHERENCE (logical flow, paragraph structure, cohesive devices), RANGE (lexical and grammatical range — variety, idiom, register), ACCURACY (grammatical and spelling correctness). Return strict JSON: {overall_level: one of A1 A2 B1 B2 C1 C2, criteria: {task: {level, comment}, coherence: {level, comment}, range: {level, comment}, accuracy: {level, comment}}, strengths: array of 2-3 short strings, improvements: array of 2-3 short strings, actionable_next_step: 1-2 sentence concrete next move for THIS learner, rewrite_sample: a short rewrite of the most pivotal 1-2 sentences from their text demonstrating the target level}.",
          userPayload: JSON.stringify({
            target_level: targetLevel,
            prompt: prompt || "(no prompt provided)",
            response_text: text,
            word_count: wordCount,
          }),
          temperature: 0.3,
        },
        {
          overall_level: targetLevel,
          criteria: {},
          strengths: [],
          improvements: [],
          actionable_next_step: "",
          rewrite_sample: "",
        },
      );

      const safeLevel = (raw: unknown): string => {
        const v = String(raw ?? "").toUpperCase();
        return ["A1", "A2", "B1", "B2", "C1", "C2"].includes(v) ? v : targetLevel;
      };
      const criteriaIn = (result.criteria && typeof result.criteria === "object" && !Array.isArray(result.criteria))
        ? result.criteria as Record<string, unknown>
        : {};
      const criteria: Record<string, { level: string; comment: string }> = {};
      for (const key of ["task", "coherence", "range", "accuracy"]) {
        const c = criteriaIn[key];
        if (c && typeof c === "object" && !Array.isArray(c)) {
          const cr = c as Record<string, unknown>;
          criteria[key] = { level: safeLevel(cr.level), comment: toText(cr.comment, 600) };
        } else {
          criteria[key] = { level: targetLevel, comment: "" };
        }
      }

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        ai_provider: provider,
        ai_error: aiError ?? null,
        target_level: targetLevel,
        word_count: wordCount,
        overall_level: safeLevel(result.overall_level),
        criteria,
        strengths: Array.isArray(result.strengths)
          ? (result.strengths as unknown[]).map((s) => toText(s, 240)).filter(Boolean).slice(0, 4)
          : [],
        improvements: Array.isArray(result.improvements)
          ? (result.improvements as unknown[]).map((s) => toText(s, 240)).filter(Boolean).slice(0, 4)
          : [],
        actionable_next_step: toText(result.actionable_next_step, 600),
        rewrite_sample: toText(result.rewrite_sample, 1200),
        generated_at: new Date().toISOString(),
      });
    }

    // Tier D #22 — Translation comparison. Useful for advanced learners
    // refining nuance: paste a sentence in your L1, AI returns multiple
    // English translations with register/style differences explained.
    if (req.method === "POST" && route === "/ai/translation-compare") {
      const body = await parseBody(req);
      const sourceText = toText((body as Record<string, unknown>).source_text, 800);
      const sourceLanguage = toText((body as Record<string, unknown>).source_language, 32) || "auto";
      if (!sourceText || sourceText.length < 3) {
        return json(400, { error: "source_text is required" });
      }

      const { data: result, status: aiStatus, error: aiError, provider } = await callEnglishAIWithStatus<{
        detected_language?: unknown;
        translations?: unknown;
        nuance_summary?: unknown;
      }>(
        {
          systemPrompt:
            "You are an expert translator. Translate the source sentence into THREE distinct English versions chosen to demonstrate different registers and stylistic choices. Each translation should be natural English a competent speaker might actually say or write. Return strict JSON: {detected_language: ISO 639-1 code or 'unknown', translations: array of exactly 3 objects each {text: the English translation, register: 'formal'|'neutral'|'informal'|'literary'|'academic'|'conversational', style_note: 1 sentence describing what's distinctive about this version (word choice, structure, register)}, nuance_summary: 1-2 sentences explaining what the source carries that English forces a choice on}.",
          userPayload: JSON.stringify({ source_text: sourceText, source_language: sourceLanguage }),
          temperature: 0.5,
        },
        { detected_language: sourceLanguage, translations: [], nuance_summary: "" },
      );

      const translations = Array.isArray(result.translations)
        ? (result.translations as unknown[])
            .filter((t): t is Record<string, unknown> => !!t && typeof t === "object" && !Array.isArray(t))
            .map((t) => ({
              text: toText(t.text, 800),
              register: toText(t.register, 32),
              style_note: toText(t.style_note, 400),
            }))
            .filter((t) => t.text)
            .slice(0, 4)
        : [];

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        ai_provider: provider,
        ai_error: aiError ?? null,
        source_text: sourceText,
        detected_language: toText(result.detected_language, 16) || "unknown",
        translations,
        nuance_summary: toText(result.nuance_summary, 600),
        generated_at: new Date().toISOString(),
      });
    }

    // Tier C #17 — Idiom & collocation explorer. Paste any English text
    // (article, podcast transcript, dialogue), AI extracts notable idioms
    // and collocations with definitions, register, and example sentences.
    if (req.method === "POST" && route === "/ai/idiom-extract") {
      const body = await parseBody(req);
      const sourceText = toText((body as Record<string, unknown>).source_text, 4000);
      const targetLevel = toText((body as Record<string, unknown>).target_level, 8).toUpperCase() || "B2";
      if (!sourceText || sourceText.length < 30) {
        return json(400, { error: "source_text is required (min 30 characters)" });
      }

      const { data: result, status: aiStatus, error: aiError, provider } = await callEnglishAIWithStatus<{
        idioms?: unknown;
        collocations?: unknown;
        cultural_notes?: unknown;
      }>(
        {
          systemPrompt:
            "You are an English vocabulary specialist. From the source text below, extract the most teaching-worthy idioms and collocations for a learner aiming at the target CEFR level. An IDIOM is a fixed expression whose meaning isn't deducible from its parts (e.g., 'cut to the chase'). A COLLOCATION is a strong, common word pairing (e.g., 'heavy traffic', 'make a decision', 'utterly convinced'). Return strict JSON: {idioms: array (max 6) of {phrase: exact phrase from text, meaning: 1 sentence, register: 'formal'|'neutral'|'informal'|'literary', example: 1 fresh example sentence using the idiom}, collocations: array (max 8) of {phrase: exact phrase from text, type: 'verb_noun'|'adj_noun'|'adv_adj'|'verb_adv'|'noun_noun', meaning: 1 short note, example: 1 fresh example}, cultural_notes: array (max 3) of short observations on cultural references, register choices, or US/UK differences worth knowing}.",
          userPayload: JSON.stringify({ target_level: targetLevel, source_text: sourceText }),
          temperature: 0.4,
        },
        { idioms: [], collocations: [], cultural_notes: [] },
      );

      const cleanList = <T extends Record<string, unknown>>(rows: unknown, mapper: (r: Record<string, unknown>) => T, max: number): T[] =>
        Array.isArray(rows)
          ? (rows as unknown[])
              .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r))
              .map(mapper)
              .filter((r) => Object.values(r).some(Boolean))
              .slice(0, max)
          : [];

      const idioms = cleanList(result.idioms, (r) => ({
        phrase: toText(r.phrase, 200),
        meaning: toText(r.meaning, 400),
        register: toText(r.register, 24),
        example: toText(r.example, 400),
      }), 6);
      const collocations = cleanList(result.collocations, (r) => ({
        phrase: toText(r.phrase, 160),
        type: toText(r.type, 24),
        meaning: toText(r.meaning, 240),
        example: toText(r.example, 400),
      }), 8);
      const culturalNotes = Array.isArray(result.cultural_notes)
        ? (result.cultural_notes as unknown[]).map((n) => toText(n, 400)).filter(Boolean).slice(0, 4)
        : [];

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        ai_provider: provider,
        ai_error: aiError ?? null,
        target_level: targetLevel,
        source_text_length: sourceText.length,
        idioms,
        collocations,
        cultural_notes: culturalNotes,
        generated_at: new Date().toISOString(),
      });
    }

    // Tier B #13 — Listening dictation drill. Generates a passage at the
    // requested CEFR level (the frontend speaks it via browser TTS) plus
    // optional difficulty knobs (speed cue, accent cue, contains_numbers).
    // The AI returns BOTH the canonical text AND a list of tricky tokens
    // so the frontend can score the user's typed transcription generously
    // (case-insensitive, ignore terminal punctuation).
    if (req.method === "POST" && route === "/ai/dictation/generate") {
      const body = await parseBody(req);
      const targetLevel = toText((body as Record<string, unknown>).target_level, 8).toUpperCase() || "B2";
      const topic = toText((body as Record<string, unknown>).topic, 200);
      const accent = toText((body as Record<string, unknown>).accent, 24).toLowerCase() || "neutral";
      const speed = toText((body as Record<string, unknown>).speed, 16).toLowerCase() || "normal";
      if (!["A1", "A2", "B1", "B2", "C1", "C2"].includes(targetLevel)) {
        return json(400, { error: "target_level must be one of A1 A2 B1 B2 C1 C2" });
      }

      const { data: result, status: aiStatus, error: aiError, provider } = await callEnglishAIWithStatus<{
        text?: unknown;
        tricky_tokens?: unknown;
        comprehension_question?: unknown;
        comprehension_answer?: unknown;
      }>(
        {
          systemPrompt:
            "You are an English listening teacher generating a short dictation passage. Write 2-3 sentences (about 30-55 words) at the target CEFR reading-aloud level, on the requested topic, in natural spoken English suitable for being read aloud once. Return strict JSON: {text: the passage exactly as it should be heard, tricky_tokens: array (max 5) of words/phrases the learner is most likely to mishear or misspell, comprehension_question: 1 short follow-up question to confirm understanding, comprehension_answer: the expected answer in 1-3 words}.",
          userPayload: JSON.stringify({
            target_level: targetLevel,
            topic: topic || "an everyday situation a learner would naturally encounter",
            accent_hint: accent,
            speed_hint: speed,
          }),
          temperature: 0.7,
        },
        { text: "", tricky_tokens: [], comprehension_question: "", comprehension_answer: "" },
      );

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        ai_provider: provider,
        ai_error: aiError ?? null,
        target_level: targetLevel,
        topic: topic || null,
        accent,
        speed,
        text: toText(result.text, 1200),
        tricky_tokens: Array.isArray(result.tricky_tokens)
          ? (result.tricky_tokens as unknown[]).map((t) => toText(t, 80)).filter(Boolean).slice(0, 8)
          : [],
        comprehension_question: toText(result.comprehension_question, 240),
        comprehension_answer: toText(result.comprehension_answer, 80),
        generated_at: new Date().toISOString(),
      });
    }

    // Tier D #19 — Daily cross-skill challenge. Assembles a 5-task daily
    // mission spanning all 6 skills, calibrated to the user's CEFR estimate
    // and time budget. Pure compose — pulls from the existing skill catalogues
    // via the daily plan; AI-shaped for variety + theming.
    if (req.method === "POST" && route === "/ai/daily-challenge") {
      const body = await parseBody(req);
      const minutesBudget = Math.max(10, Math.min(120, Number((body as Record<string, unknown>).minutes_budget) || 30));
      const cefr = await buildCefrSnapshot(sb, scope.languageId, auth.userId).catch(() => null);
      const overallLevel = cefr?.overall.level ?? "B1";

      const { data: result, status: aiStatus, error: aiError, provider } = await callEnglishAIWithStatus<{
        theme?: unknown;
        why_this_theme?: unknown;
        tasks?: unknown;
      }>(
        {
          systemPrompt:
            "You are an English study coach generating a single daily cross-skill challenge for a learner. Pick ONE concrete theme (e.g., 'climate adaptation', 'how a sourdough starter works', 'ordering coffee in a noisy café'), then design EXACTLY 5 tasks that span the four core skills (reading, listening, writing, speaking) plus one of grammar or vocabulary. Each task should fit inside the time budget. Return strict JSON: {theme: 5-8 word theme, why_this_theme: 1 sentence connecting the theme to the learner's level, tasks: array of exactly 5 objects each {skill: 'reading'|'writing'|'listening'|'speaking'|'grammar'|'vocabulary', label: 4-8 word task name, instruction: 1-2 sentences telling the learner exactly what to do, estimated_minutes: integer 3-15, route_hint: relative URL like '/reading' or '/speaking' the learner can open in the matching skill app}}.",
          userPayload: JSON.stringify({
            cefr_level: overallLevel,
            minutes_budget: minutesBudget,
            recent_skill_snapshot: cefr?.estimates ?? [],
          }),
          temperature: 0.7,
        },
        { theme: "", why_this_theme: "", tasks: [] },
      );

      const tasks = Array.isArray(result.tasks)
        ? (result.tasks as unknown[])
            .filter((t): t is Record<string, unknown> => !!t && typeof t === "object" && !Array.isArray(t))
            .map((t) => ({
              skill: ["reading", "writing", "listening", "speaking", "grammar", "vocabulary"].includes(String(t.skill ?? "").toLowerCase())
                ? String(t.skill).toLowerCase()
                : "reading",
              label: toText(t.label, 120),
              instruction: toText(t.instruction, 600),
              estimated_minutes: Math.max(2, Math.min(30, Number(t.estimated_minutes) || 5)),
              route_hint: toText(t.route_hint, 120) || "/",
            }))
            .filter((t) => t.label && t.instruction)
            .slice(0, 6)
        : [];

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        ai_provider: provider,
        ai_error: aiError ?? null,
        theme: toText(result.theme, 200),
        why_this_theme: toText(result.why_this_theme, 600),
        tasks,
        cefr_level: overallLevel,
        minutes_budget: minutesBudget,
        generated_at: new Date().toISOString(),
      });
    }

    // Tier C #18 — Cultural context notes. Paste a passage; AI surfaces
    // cultural references, register choices, and US/UK/AU usage notes worth
    // knowing. Useful for advanced learners who want to read like a native
    // and avoid the accidental tone mismatches that plague learners at C1+.
    if (req.method === "POST" && route === "/ai/cultural-notes") {
      const body = await parseBody(req);
      const sourceText = toText((body as Record<string, unknown>).source_text, 4000);
      if (!sourceText || sourceText.length < 30) {
        return json(400, { error: "source_text is required (min 30 characters)" });
      }

      const { data: result, status: aiStatus, error: aiError, provider } = await callEnglishAIWithStatus<{
        cultural_references?: unknown;
        register_observations?: unknown;
        regional_variants?: unknown;
        tone_pitfalls?: unknown;
      }>(
        {
          systemPrompt:
            "You are an English cultural and stylistic analyst. From the passage below, surface the most useful cultural and register-aware observations a non-native learner would benefit from. Return strict JSON with these arrays (each item brief, max 6 across each list): cultural_references (specific names/events/icons + 1-line meaning), register_observations (what the writer's register reveals + how to spot it elsewhere), regional_variants (US vs UK vs AU usage choices, with the alternative form noted), tone_pitfalls (where a learner might mistake the tone — sarcastic, polite-but-cool, formal, etc. — and what flags it).",
          userPayload: JSON.stringify({ source_text: sourceText }),
          temperature: 0.4,
        },
        { cultural_references: [], register_observations: [], regional_variants: [], tone_pitfalls: [] },
      );

      const safeArrayOfStrings = (raw: unknown): string[] =>
        Array.isArray(raw) ? (raw as unknown[]).map((r) => toText(r, 400)).filter(Boolean).slice(0, 6) : [];

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        ai_provider: provider,
        ai_error: aiError ?? null,
        cultural_references: safeArrayOfStrings(result.cultural_references),
        register_observations: safeArrayOfStrings(result.register_observations),
        regional_variants: safeArrayOfStrings(result.regional_variants),
        tone_pitfalls: safeArrayOfStrings(result.tone_pitfalls),
        generated_at: new Date().toISOString(),
      });
    }

    // Tier D #20 — Goal templates. Learner picks a high-level life goal
    // (study abroad, business, immigration, academic, conversational,
    // exam-prep) plus a target horizon; AI returns a tailored 12-week
    // curriculum shape: weekly hour mix per skill, top 3 priorities,
    // recommended skill apps + how to combine them, and a definition of
    // "done" they should aim for.
    if (req.method === "POST" && route === "/ai/goal-templates") {
      const body = await parseBody(req);
      const goalKey = toText((body as Record<string, unknown>).goal, 32).toLowerCase();
      const horizonWeeks = Math.max(2, Math.min(52, Number((body as Record<string, unknown>).horizon_weeks) || 12));
      const minutesPerDay = Math.max(10, Math.min(180, Number((body as Record<string, unknown>).minutes_per_day) || 30));
      const validGoals = [
        "study_abroad",
        "business",
        "immigration",
        "academic",
        "conversational",
        "exam_prep",
      ];
      if (!validGoals.includes(goalKey)) {
        return json(400, { error: `goal must be one of ${validGoals.join(", ")}` });
      }
      const cefr = await buildCefrSnapshot(sb, scope.languageId, auth.userId).catch(() => null);
      const overallLevel = cefr?.overall.level ?? "B1";

      const { data: result, status: aiStatus, error: aiError, provider } = await callEnglishAIWithStatus<{
        plan_title?: unknown;
        narrative?: unknown;
        weekly_hours?: unknown;
        priorities?: unknown;
        skill_focus?: unknown;
        recommended_routes?: unknown;
        success_criteria?: unknown;
        risks?: unknown;
      }>(
        {
          systemPrompt:
            "You are an English study planner. The learner has chosen a real-life GOAL (one of: study_abroad, business, immigration, academic, conversational, exam_prep). Build a tailored learning plan shape for the next N weeks at their current CEFR level and daily time budget. Return strict JSON: {plan_title: 6-10 words capturing the goal, narrative: 2-3 sentence motivation grounded in the goal + level, weekly_hours: object {reading, writing, listening, speaking, grammar, vocabulary} with integer hour totals per week (sum should be close to minutes_per_day*7/60), priorities: array (max 3) of {skill: one of the six, why: 1 sentence}, skill_focus: object {reading: 1-line micro-focus, writing: ..., listening: ..., speaking: ..., grammar: ..., vocabulary: ...}, recommended_routes: array (max 6) of {label: 3-6 word link label, route: relative URL like '/reading' or '/speaking', why: 1 sentence}, success_criteria: array (max 4) of concrete observable outcomes (e.g., 'Hold a 5-minute conversation about academic plans without translating in your head'), risks: array (max 3) of plausible failure modes + how to avoid them}.",
          userPayload: JSON.stringify({
            goal: goalKey,
            horizon_weeks: horizonWeeks,
            minutes_per_day: minutesPerDay,
            cefr_level: overallLevel,
            recent_skill_snapshot: cefr?.estimates ?? [],
          }),
          temperature: 0.55,
        },
        {
          plan_title: "",
          narrative: "",
          weekly_hours: {},
          priorities: [],
          skill_focus: {},
          recommended_routes: [],
          success_criteria: [],
          risks: [],
        },
      );

      const safeStr = (v: unknown, max: number) => toText(v, max);
      const skills = ["reading", "writing", "listening", "speaking", "grammar", "vocabulary"] as const;

      const weeklyHoursRaw = (result.weekly_hours && typeof result.weekly_hours === "object" && !Array.isArray(result.weekly_hours))
        ? (result.weekly_hours as Record<string, unknown>)
        : {};
      const weeklyHours: Record<string, number> = {};
      for (const s of skills) {
        const v = Number(weeklyHoursRaw[s]);
        weeklyHours[s] = Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
      }

      const skillFocusRaw = (result.skill_focus && typeof result.skill_focus === "object" && !Array.isArray(result.skill_focus))
        ? (result.skill_focus as Record<string, unknown>)
        : {};
      const skillFocus: Record<string, string> = {};
      for (const s of skills) skillFocus[s] = safeStr(skillFocusRaw[s], 240);

      const priorities = Array.isArray(result.priorities)
        ? (result.priorities as unknown[])
            .filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && !Array.isArray(p))
            .map((p) => ({
              skill: skills.includes(String(p.skill ?? "").toLowerCase() as typeof skills[number])
                ? String(p.skill).toLowerCase()
                : "reading",
              why: safeStr(p.why, 320),
            }))
            .filter((p) => p.why)
            .slice(0, 4)
        : [];

      const recommendedRoutes = Array.isArray(result.recommended_routes)
        ? (result.recommended_routes as unknown[])
            .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r))
            .map((r) => ({
              label: safeStr(r.label, 120),
              route: safeStr(r.route, 200) || "/",
              why: safeStr(r.why, 320),
            }))
            .filter((r) => r.label && r.why)
            .slice(0, 6)
        : [];

      const arrOfStrings = (raw: unknown, max: number, charLimit: number) =>
        Array.isArray(raw)
          ? (raw as unknown[]).map((r) => safeStr(r, charLimit)).filter(Boolean).slice(0, max)
          : [];

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        ai_provider: provider,
        ai_error: aiError ?? null,
        goal: goalKey,
        cefr_level: overallLevel,
        horizon_weeks: horizonWeeks,
        minutes_per_day: minutesPerDay,
        plan_title: safeStr(result.plan_title, 200),
        narrative: safeStr(result.narrative, 1200),
        weekly_hours: weeklyHours,
        priorities,
        skill_focus: skillFocus,
        recommended_routes: recommendedRoutes,
        success_criteria: arrOfStrings(result.success_criteria, 4, 320),
        risks: arrOfStrings(result.risks, 3, 320),
        generated_at: new Date().toISOString(),
      });
    }

    // Tier D #21 — Writing rubric calibration. Given a single prompt, AI
    // produces 3 sample answers — at A2/B1, B2, and C1/C2 — plus a delta
    // analysis explaining what concretely changes between levels (cohesion,
    // range, accuracy, register, lexical density). Lets the learner SEE
    // what "next level" actually looks like for their writing.
    if (req.method === "POST" && route === "/ai/rubric-calibrate") {
      const body = await parseBody(req);
      const prompt = toText((body as Record<string, unknown>).prompt, 800);
      const lowerLevel = toText((body as Record<string, unknown>).lower_level, 8).toUpperCase() || "A2";
      const midLevel = toText((body as Record<string, unknown>).mid_level, 8).toUpperCase() || "B2";
      const upperLevel = toText((body as Record<string, unknown>).upper_level, 8).toUpperCase() || "C1";
      const validLevels = ["A1", "A2", "B1", "B2", "C1", "C2"];
      for (const lv of [lowerLevel, midLevel, upperLevel]) {
        if (!validLevels.includes(lv)) return json(400, { error: `levels must be one of ${validLevels.join(", ")}` });
      }
      if (!prompt || prompt.length < 20) {
        return json(400, { error: "prompt is required (min 20 characters)" });
      }

      const { data: result, status: aiStatus, error: aiError, provider } = await callEnglishAIWithStatus<{
        samples?: unknown;
        deltas?: unknown;
        what_to_practise?: unknown;
      }>(
        {
          systemPrompt:
            "You are a CEFR writing examiner producing CALIBRATION samples. For the same writing prompt, write THREE complete sample answers at three target levels (lower, mid, upper). Each sample MUST sound authentic for that level (typical errors at the lower level, controlled fluency at mid, sophisticated range at upper). Then explain the deltas between consecutive levels along five rubric axes (task achievement, coherence, lexical range, grammatical range/accuracy, register). Return strict JSON: {samples: array of EXACTLY 3 objects {level: CEFR string, word_count_target: integer 80-260, text: the full essay/answer (do NOT use markdown headers), examiner_note: 1-2 sentence assessment of the sample's defining traits}, deltas: array of EXACTLY 2 objects {from_level, to_level, axes: {task: 1 sentence, coherence: 1 sentence, range: 1 sentence, accuracy: 1 sentence, register: 1 sentence}}, what_to_practise: array (max 4) of concrete drills the learner can do this week to climb one level}.",
          userPayload: JSON.stringify({
            prompt,
            lower_level: lowerLevel,
            mid_level: midLevel,
            upper_level: upperLevel,
          }),
          temperature: 0.5,
        },
        { samples: [], deltas: [], what_to_practise: [] },
      );

      const samples = Array.isArray(result.samples)
        ? (result.samples as unknown[])
            .filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && !Array.isArray(s))
            .map((s) => ({
              level: toText(s.level, 8).toUpperCase(),
              word_count_target: Math.max(40, Math.min(400, Number(s.word_count_target) || 150)),
              text: toText(s.text, 4000),
              examiner_note: toText(s.examiner_note, 400),
            }))
            .filter((s) => s.text && s.level)
            .slice(0, 3)
        : [];

      const deltas = Array.isArray(result.deltas)
        ? (result.deltas as unknown[])
            .filter((d): d is Record<string, unknown> => !!d && typeof d === "object" && !Array.isArray(d))
            .map((d) => {
              const axesRaw = (d.axes && typeof d.axes === "object" && !Array.isArray(d.axes))
                ? (d.axes as Record<string, unknown>)
                : {};
              return {
                from_level: toText(d.from_level, 8).toUpperCase(),
                to_level: toText(d.to_level, 8).toUpperCase(),
                axes: {
                  task: toText(axesRaw.task, 320),
                  coherence: toText(axesRaw.coherence, 320),
                  range: toText(axesRaw.range, 320),
                  accuracy: toText(axesRaw.accuracy, 320),
                  register: toText(axesRaw.register, 320),
                },
              };
            })
            .filter((d) => d.from_level && d.to_level)
            .slice(0, 2)
        : [];

      const whatToPractise = Array.isArray(result.what_to_practise)
        ? (result.what_to_practise as unknown[]).map((r) => toText(r, 320)).filter(Boolean).slice(0, 4)
        : [];

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        ai_provider: provider,
        ai_error: aiError ?? null,
        prompt,
        lower_level: lowerLevel,
        mid_level: midLevel,
        upper_level: upperLevel,
        samples,
        deltas,
        what_to_practise: whatToPractise,
        generated_at: new Date().toISOString(),
      });
    }

    // Tier C #5 — Coordinated themed week. ONE theme, 7 days of activities,
    // each day surfacing the same vocabulary/concepts through a different
    // skill — so what you read on Monday you write about on Wednesday and
    // discuss on Friday. Returns a deep-linkable schedule the learner can
    // actually open in each skill app.
    if (req.method === "POST" && route === "/ai/themed-week") {
      const body = await parseBody(req);
      const themeHint = toText((body as Record<string, unknown>).theme, 200);
      const minutesPerDay = Math.max(10, Math.min(120, Number((body as Record<string, unknown>).minutes_per_day) || 25));
      const cefr = await buildCefrSnapshot(sb, scope.languageId, auth.userId).catch(() => null);
      const overallLevel = cefr?.overall.level ?? "B1";

      const { data: result, status: aiStatus, error: aiError, provider } = await callEnglishAIWithStatus<{
        theme?: unknown;
        why_this_theme?: unknown;
        anchor_vocabulary?: unknown;
        days?: unknown;
        weekend_review?: unknown;
      }>(
        {
          systemPrompt:
            "You are an English curriculum designer building a themed-week study schedule. Pick ONE concrete, evocative theme (or use the learner's hint if provided) and design 7 days that recycle the SAME core vocabulary and concepts through DIFFERENT skills — Mon: input, Tue: deeper input, Wed: production, Thu: interaction, Fri: refinement, Sat: stretch, Sun: review. Each day's activity should fit the daily minutes budget. Return strict JSON: {theme: 5-10 word theme, why_this_theme: 1-2 sentence pitch, anchor_vocabulary: array (8-12) of single words / short phrases that should recur across the week (these are the spine), days: array of EXACTLY 7 objects {day_index: 0-6 (Monday=0), day_label: 'Monday' etc, skill: 'reading'|'writing'|'listening'|'speaking'|'grammar'|'vocabulary', activity_label: 4-8 words, instruction: 2-3 sentences telling the learner exactly what to do, recycles_words: array of 2-4 anchor words this day's activity must surface, route_hint: relative URL the learner can open}, weekend_review: 1-2 sentence note on what 'success' looks like by Sunday}.",
          userPayload: JSON.stringify({
            theme_hint: themeHint || null,
            cefr_level: overallLevel,
            minutes_per_day: minutesPerDay,
          }),
          temperature: 0.7,
        },
        { theme: "", why_this_theme: "", anchor_vocabulary: [], days: [], weekend_review: "" },
      );

      const allowedSkills = ["reading", "writing", "listening", "speaking", "grammar", "vocabulary"];
      const days = Array.isArray(result.days)
        ? (result.days as unknown[])
            .filter((d): d is Record<string, unknown> => !!d && typeof d === "object" && !Array.isArray(d))
            .map((d) => ({
              day_index: Math.max(0, Math.min(6, Number(d.day_index) || 0)),
              day_label: toText(d.day_label, 24),
              skill: allowedSkills.includes(String(d.skill ?? "").toLowerCase())
                ? String(d.skill).toLowerCase()
                : "reading",
              activity_label: toText(d.activity_label, 160),
              instruction: toText(d.instruction, 800),
              recycles_words: Array.isArray(d.recycles_words)
                ? (d.recycles_words as unknown[]).map((w) => toText(w, 80)).filter(Boolean).slice(0, 6)
                : [],
              route_hint: toText(d.route_hint, 200) || "/",
            }))
            .filter((d) => d.activity_label && d.instruction)
            .slice(0, 7)
        : [];

      const anchorVocabulary = Array.isArray(result.anchor_vocabulary)
        ? (result.anchor_vocabulary as unknown[]).map((w) => toText(w, 80)).filter(Boolean).slice(0, 14)
        : [];

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        ai_provider: provider,
        ai_error: aiError ?? null,
        theme: toText(result.theme, 200),
        why_this_theme: toText(result.why_this_theme, 600),
        cefr_level: overallLevel,
        minutes_per_day: minutesPerDay,
        anchor_vocabulary: anchorVocabulary,
        days,
        weekend_review: toText(result.weekend_review, 400),
        generated_at: new Date().toISOString(),
      });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
