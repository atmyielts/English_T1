import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  PLAYBOOK_PRODUCT_SLUG,
  authUser,
  buildDashboardPayload,
  corsHeaders,
  extractRoute,
  generateRecommendation,
  getEnv,
  hasPremiumAccess,
  json,
  listCatalog,
  loadCurrentRecommendation,
  loadPageDetail,
  loadPlanTemplates,
  loadProfile,
  loadUpdatesPayload,
  parseBody,
  persistRecommendation,
  recordEvent,
  resolveMarketGuidance,
  resolveScope,
  saveProfile,
  toText,
} from "../_shared/ielts-playbook.ts";
import {
  buildPracticeActivity,
  buildPracticeMasteryOverview,
  buildPracticeTrajectory,
} from "../_shared/ielts-insights.ts";
import {
  callOpenRouterJsonWithStatus,
  isOpenRouterConfigured,
} from "../_shared/ielts-ai.ts";

const routeMarker = "/ielts-playbook";

const unauthorizedPayload = {
  error: "Unauthorized",
  product_slug: PLAYBOOK_PRODUCT_SLUG,
};

const premiumPayload = {
  error: "Premium access required",
  code: "premium_required",
  product_slug: PLAYBOOK_PRODUCT_SLUG,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRole = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const sb = createClient(supabaseUrl, supabaseServiceRole, { auth: { persistSession: false } });
    const scope = await resolveScope(sb);
    const url = new URL(req.url);
    const route = extractRoute(url, routeMarker);
    const auth = await authUser(sb, req);

    const requirePremium = async () => {
      if (!auth) return { ok: false as const, response: json(401, unauthorizedPayload) };
      const allowed = await hasPremiumAccess(supabaseUrl, supabaseAnonKey, auth.token, scope.playbookProductId);
      if (!allowed) return { ok: false as const, response: json(403, premiumPayload) };
      return { ok: true as const };
    };

    if (req.method === "GET" && route === "/catalog") {
      return json(200, await listCatalog(sb, scope));
    }

    if (req.method === "GET" && route === "/updates") {
      return json(200, await loadUpdatesPayload(sb, scope));
    }

    if (req.method === "GET" && route === "/market-guidance") {
      const countryCode = toText(url.searchParams.get("country_code"), 16) || "GLOBAL";
      const providerKey = toText(url.searchParams.get("provider_key"), 64) || "british-council";
      const guidance = await resolveMarketGuidance(sb, scope, countryCode, providerKey);
      if (!guidance) return json(404, { error: "Market guidance not found" });

      const { data: sourceRows } = await sb
        .from("ielts_playbook_market_sources")
        .select("sort_order,source:ielts_playbook_sources(*)")
        .eq("market_guidance_id", guidance.id)
        .order("sort_order", { ascending: true });

      return json(200, {
        market_guidance: guidance,
        sources: sourceRows ?? [],
      });
    }

    if (req.method === "GET" && route.startsWith("/pages/")) {
      const slug = toText(route.replace("/pages/", ""), 160);
      if (!slug) return json(404, { error: "Page not found" });
      const payload = await loadPageDetail(sb, scope, slug);
      if (!payload) return json(404, { error: "Page not found" });

      const page = payload.page as Record<string, unknown>;
      const visibility = String(page.visibility ?? "public");
      if (visibility === "authenticated" && !auth) {
        return json(401, { ...unauthorizedPayload, page_slug: slug });
      }
      if (visibility === "premium") {
        const gate = await requirePremium();
        if (!gate.ok) return gate.response;
      }
      return json(200, payload);
    }

    if (req.method === "GET" && route.startsWith("/plans/")) {
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;

      const slug = toText(route.replace("/plans/", ""), 160);
      const templates = await loadPlanTemplates(sb, scope);
      const plan = templates.find((row) => row.slug === slug);
      if (!plan) return json(404, { error: "Plan not found" });

      const recommendation = auth ? await loadCurrentRecommendation(sb, scope, auth.userId) : null;
      return json(200, {
        plan,
        latest_recommendation: recommendation,
      });
    }

    if (req.method === "GET" && route === "/dashboard") {
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;

      // Single round-trip: own dashboard payload + the three cross-app insights
      // (trajectory / activity / mastery) the frontend used to fetch separately.
      // Running them in parallel server-side avoids 3 extra browser round-trips
      // and lets the playbook frontend hydrate everything from one response.
      const languageId = scope.languageId ?? "";
      const [base, trajectory, activity, mastery] = await Promise.all([
        buildDashboardPayload(sb, scope, auth!.userId),
        buildPracticeTrajectory(sb, scope.practiceProductId, auth!.userId).catch(() => null),
        languageId
          ? buildPracticeActivity(sb, languageId, scope.practiceProductId, auth!.userId).catch(() => null)
          : Promise.resolve(null),
        languageId
          ? buildPracticeMasteryOverview(sb, languageId, auth!.userId).catch(() => null)
          : Promise.resolve(null),
      ]);

      return new Response(
        JSON.stringify({
          ...base,
          insights: {
            trajectory,
            activity,
            mastery,
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "private, max-age=20",
            ...corsHeaders,
          },
        },
      );
    }

    if (req.method === "GET" && route === "/profile") {
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;
      return json(200, { profile: await loadProfile(sb, scope, auth!.userId) });
    }

    if (req.method === "PATCH" && route === "/profile") {
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;
      const body = await parseBody(req);
      const profile = await saveProfile(sb, scope, auth!.userId, body);
      return json(200, { ok: true, profile });
    }

    if (req.method === "POST" && route === "/recommendations/generate") {
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;
      const body = await parseBody(req);
      const profile = await saveProfile(sb, scope, auth!.userId, body);
      const recommendation = await generateRecommendation(sb, scope, auth!.userId, profile);
      const snapshot = await persistRecommendation(sb, scope, auth!.userId, profile, recommendation);
      return json(200, { ok: true, snapshot, recommendation });
    }

    if (req.method === "POST" && route === "/events") {
      const body = await parseBody(req);
      await recordEvent(sb, scope, body, auth?.userId ?? null);
      return json(200, { ok: true });
    }

    // AI strategy explainer: takes a playbook page slug + the authenticated
    // user's recent mistakes for the matching question type, and returns a
    // personalized walkthrough of the strategy grounded in the user's actual
    // errors. Powered by OpenRouter; degrades to a generic explanation when
    // the API key isn't set.
    if (req.method === "POST" && route.startsWith("/pages/") && route.endsWith("/explain")) {
      const slug = toText(route.replace("/pages/", "").replace(/\/explain$/, ""), 160);
      if (!slug) return json(400, { error: "page slug required" });
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;

      const pagePayload = await loadPageDetail(sb, scope, slug);
      if (!pagePayload) return json(404, { error: "Page not found" });
      const page = pagePayload.page as Record<string, unknown>;

      // Pull a small sample of the user's recent active mistakes so the AI
      // can reference real errors. Best-effort — empty array if anything fails.
      let recentMistakes: Array<{ question_type: string; trap_type: string; pattern: string }> = [];
      try {
        const { data: mistakeRows } = await sb
          .from("ielts_practice_mistake_notebook")
          .select("question_type, trap_type, mistake_pattern, last_seen_at")
          .eq("user_id", auth!.userId)
          .eq("status", "active")
          .order("last_seen_at", { ascending: false })
          .limit(8);
        recentMistakes = ((mistakeRows ?? []) as Array<Record<string, unknown>>).map((row) => ({
          question_type: String(row.question_type ?? ""),
          trap_type: String(row.trap_type ?? ""),
          pattern: String(row.mistake_pattern ?? ""),
        }));
      } catch {
        recentMistakes = [];
      }

      // Build a compact text representation of the page's sections.
      const sections = Array.isArray(pagePayload.sections) ? pagePayload.sections : [];
      const sectionsSummary = sections.slice(0, 6).map((sec) => {
        const r = sec as Record<string, unknown>;
        const block = r.content && typeof r.content === "object" ? r.content as Record<string, unknown> : {};
        return {
          title: toText(r.title ?? block.title ?? "", 200),
          body: toText(block.body ?? block.text ?? r.summary ?? "", 600),
        };
      });

      const fallbackExplanation = recentMistakes.length === 0
        ? `Open a few practice labs first — the AI explainer is most useful once your mistake notebook has entries to anchor the strategy to.`
        : `This strategy walks through ${toText(page.title ?? "the technique", 80)}. ` +
          `Re-read the page and try the strategy on your most recent missed attempt before moving on.`;

      const { data: result, status: aiStatus, error: aiError } = await callOpenRouterJsonWithStatus<{
        explanation?: unknown;
        examples?: unknown;
      }>(
        {
          systemPrompt: "You are an IELTS tutor explaining a strategy to a student. Read the strategy below and the student's recent mistakes. In strict JSON, return {explanation: 2-4 sentences grounded in the strategy text, citing how it would have caught their mistakes, examples: array (max 3) of {mistake_pattern, how_strategy_applies} where each item shows the named strategy step that resolves a real mistake the student made}. Be concrete; do NOT give generic test-taking advice. If the student has no recent mistakes, instead return {explanation: 2-3 sentences distilling the single most important point in the strategy, examples: []}.",
          userPayload: JSON.stringify({
            page_title: page.title,
            page_module: page.module_key,
            sections: sectionsSummary,
            student_recent_mistakes: recentMistakes,
          }),
          temperature: 0.4,
        },
        { explanation: fallbackExplanation, examples: [] },
      );

      const explanation = typeof result.explanation === "string" && result.explanation.trim().length > 0
        ? result.explanation.trim()
        : fallbackExplanation;
      const examples = Array.isArray(result.examples)
        ? (result.examples as unknown[])
            .filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && !Array.isArray(e))
            .map((e) => ({
              mistake_pattern: toText(e.mistake_pattern, 200),
              how_strategy_applies: toText(e.how_strategy_applies, 400),
            }))
            .filter((e) => e.mistake_pattern && e.how_strategy_applies)
            .slice(0, 3)
        : [];

      return json(200, {
        ok: true,
        ai_available: isOpenRouterConfigured(),
        ai_status: aiStatus,
        ai_error: aiError ?? null,
        explanation,
        examples,
        recent_mistake_count: recentMistakes.length,
        generated_at: new Date().toISOString(),
      });
    }

    // Generate mini-drills for a module. 4 MCQs that test whether the user
    // internalized the strategy. AI-generated, not stored — frontend keeps the
    // answer key in memory between generate and submit calls. The drill text
    // is grounded in the page's actual section bodies so it doesn't drift.
    if (req.method === "POST" && route.startsWith("/pages/") && route.endsWith("/drills")) {
      const slug = toText(route.replace("/pages/", "").replace(/\/drills$/, ""), 160);
      if (!slug) return json(400, { error: "page slug required" });
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;

      const pagePayload = await loadPageDetail(sb, scope, slug);
      if (!pagePayload) return json(404, { error: "Page not found" });
      const page = pagePayload.page as Record<string, unknown>;
      const sections = Array.isArray(pagePayload.sections) ? pagePayload.sections : [];
      const sectionsSummary = sections.slice(0, 8).map((sec) => {
        const r = sec as Record<string, unknown>;
        const block = r.content && typeof r.content === "object" ? r.content as Record<string, unknown> : {};
        return {
          heading: toText(r.heading ?? "", 200),
          body: toText(block.body ?? block.text ?? block.lead ?? r.summary ?? "", 800),
        };
      });

      const fallback = {
        drills: [
          {
            id: "fallback-1",
            prompt: `What is the single most important takeaway from "${toText(page.title ?? "this module", 80)}"?`,
            options: ["Re-read the strategy and write your own answer.", "Skip this module.", "Wait for AI to be configured."],
            correct_index: 0,
            explanation: "AI mini-drills require an OpenRouter API key — the system is running without one right now.",
          },
        ],
      };

      const { data: result, status: aiStatus, error: aiError } = await callOpenRouterJsonWithStatus<{
        drills?: unknown;
      }>(
        {
          systemPrompt: "You are an IELTS tutor designing a 4-question check-for-understanding quiz on a strategy article. Each question must be answerable strictly from the article text below. Return strict JSON: {drills: [{id: string, prompt: string, options: [string,string,string,string], correct_index: 0|1|2|3, explanation: string (1-2 sentences citing the article)}]}. Exactly 4 questions. Mix of: 1 question on the technique's MAIN step, 1 on a common pitfall the article warns about, 1 on when to apply the technique, 1 on what to do when it fails. Keep prompts under 200 chars. Do not invent IELTS test content not present in the article.",
          userPayload: JSON.stringify({
            page_title: page.title,
            page_module: page.module_key,
            sections: sectionsSummary,
          }),
          temperature: 0.4,
        },
        fallback,
      );

      const drills = Array.isArray(result.drills)
        ? (result.drills as unknown[])
            .filter((d): d is Record<string, unknown> => !!d && typeof d === "object" && !Array.isArray(d))
            .map((d, idx) => {
              const options = Array.isArray(d.options)
                ? (d.options as unknown[]).map((o) => toText(o, 240)).filter(Boolean).slice(0, 4)
                : [];
              const correctIdx = Number(d.correct_index);
              return {
                id: toText(d.id, 80) || `drill-${idx + 1}`,
                prompt: toText(d.prompt, 400),
                options,
                correct_index: Number.isFinite(correctIdx) && correctIdx >= 0 && correctIdx < options.length ? correctIdx : 0,
                explanation: toText(d.explanation, 400),
              };
            })
            .filter((d) => d.prompt && d.options.length >= 2)
            .slice(0, 4)
        : [];

      return json(200, {
        ok: true,
        ai_available: isOpenRouterConfigured(),
        ai_status: aiStatus,
        ai_error: aiError ?? null,
        drills: drills.length > 0 ? drills : fallback.drills,
        question_type: toText(page.module_key ?? "", 80),
        generated_at: new Date().toISOString(),
      });
    }

    // Record a mini-drill attempt. Frontend posts the drill_id and whether the
    // user got it right; we persist for the dashboard's curriculum progress.
    // No SRS seeding here — playbook drills are reinforcement of strategy
    // understanding, distinct from question-type mastery which the simulator
    // pipeline owns.
    if (req.method === "POST" && route.startsWith("/pages/") && route.endsWith("/drills/submit")) {
      const slug = toText(route.replace("/pages/", "").replace(/\/drills\/submit$/, ""), 160);
      if (!slug) return json(400, { error: "page slug required" });
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;

      const pagePayload = await loadPageDetail(sb, scope, slug);
      if (!pagePayload) return json(404, { error: "Page not found" });
      const page = pagePayload.page as Record<string, unknown>;
      const body = await parseBody(req);
      const drillId = toText(body.drill_id, 80);
      const isCorrect = Boolean(body.is_correct);
      const response = body.response && typeof body.response === "object" ? body.response : {};
      const questionType = toText(page.module_key ?? "", 80);

      await sb.from("ielts_playbook_drill_attempts").insert({
        user_id: auth!.userId,
        page_id: page.id,
        drill_id: drillId || "unknown",
        question_type: questionType || null,
        is_correct: isCorrect,
        response,
      });

      return json(200, { ok: true });
    }

    // Diagnostic starter quiz — 3 MCQs that decide whether the user should
    // read the module or can skip it. Less rigorous than the mini-drills;
    // the threshold is 2/3 to skip.
    if (req.method === "POST" && route.startsWith("/pages/") && route.endsWith("/diagnostic")) {
      const slug = toText(route.replace("/pages/", "").replace(/\/diagnostic$/, ""), 160);
      if (!slug) return json(400, { error: "page slug required" });
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;

      const pagePayload = await loadPageDetail(sb, scope, slug);
      if (!pagePayload) return json(404, { error: "Page not found" });
      const page = pagePayload.page as Record<string, unknown>;
      const sections = Array.isArray(pagePayload.sections) ? pagePayload.sections : [];
      const sectionsSummary = sections.slice(0, 6).map((sec) => {
        const r = sec as Record<string, unknown>;
        const block = r.content && typeof r.content === "object" ? r.content as Record<string, unknown> : {};
        return {
          heading: toText(r.heading ?? "", 200),
          body: toText(block.body ?? block.text ?? block.lead ?? r.summary ?? "", 600),
        };
      });

      const fallback = {
        questions: [
          {
            id: "diag-1",
            prompt: `Have you previously studied "${toText(page.title ?? "this technique", 80)}"?`,
            options: ["No, I'm new to this", "Yes, briefly", "Yes, in depth"],
            correct_index: 2,
            explanation: "Self-assessment fallback while AI is unavailable.",
          },
        ],
      };

      const { data: result, status: aiStatus, error: aiError } = await callOpenRouterJsonWithStatus<{
        questions?: unknown;
      }>(
        {
          systemPrompt: "You are an IELTS tutor designing a 3-question pre-test for a strategy article. The pre-test should determine whether a student already knows the core concepts in the article and can SKIP reading it. Return strict JSON: {questions: [{id, prompt, options: [string,string,string], correct_index: 0|1|2, explanation: 1 sentence}]}. Exactly 3 questions, all on the article's most distinctive concepts (not generic test-taking trivia). A student getting 2/3 correct demonstrates mastery and can skip.",
          userPayload: JSON.stringify({
            page_title: page.title,
            page_module: page.module_key,
            sections: sectionsSummary,
          }),
          temperature: 0.3,
        },
        fallback,
      );

      const questions = Array.isArray(result.questions)
        ? (result.questions as unknown[])
            .filter((q): q is Record<string, unknown> => !!q && typeof q === "object" && !Array.isArray(q))
            .map((q, idx) => {
              const options = Array.isArray(q.options)
                ? (q.options as unknown[]).map((o) => toText(o, 240)).filter(Boolean).slice(0, 3)
                : [];
              const correctIdx = Number(q.correct_index);
              return {
                id: toText(q.id, 80) || `diag-${idx + 1}`,
                prompt: toText(q.prompt, 400),
                options,
                correct_index: Number.isFinite(correctIdx) && correctIdx >= 0 && correctIdx < options.length ? correctIdx : 0,
                explanation: toText(q.explanation, 320),
              };
            })
            .filter((q) => q.prompt && q.options.length >= 2)
            .slice(0, 3)
        : [];

      return json(200, {
        ok: true,
        ai_available: isOpenRouterConfigured(),
        ai_status: aiStatus,
        ai_error: aiError ?? null,
        questions: questions.length > 0 ? questions : fallback.questions,
        generated_at: new Date().toISOString(),
      });
    }

    // Record diagnostic result so the dashboard can show "skipped: yes" for
    // modules the user pre-tested out of.
    if (req.method === "POST" && route.startsWith("/pages/") && route.endsWith("/diagnostic/submit")) {
      const slug = toText(route.replace("/pages/", "").replace(/\/diagnostic\/submit$/, ""), 160);
      if (!slug) return json(400, { error: "page slug required" });
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;

      const pagePayload = await loadPageDetail(sb, scope, slug);
      if (!pagePayload) return json(404, { error: "Page not found" });
      const page = pagePayload.page as Record<string, unknown>;
      const body = await parseBody(req);
      const score = Math.max(0, Math.min(99, Number(body.score) || 0));
      const total = Math.max(1, Math.min(99, Number(body.total) || 1));
      const recommendedSkip = score >= Math.ceil(total * (2 / 3));
      const detail = body.detail && typeof body.detail === "object" ? body.detail : {};

      await sb.from("ielts_playbook_diagnostic_results").insert({
        user_id: auth!.userId,
        page_id: page.id,
        score,
        total,
        recommended_skip: recommendedSkip,
        detail,
      });

      return json(200, { ok: true, score, total, recommended_skip: recommendedSkip });
    }

    // Per-section ask-the-coach: user reads a paragraph, asks a follow-up,
    // gets an inline AI reply scoped to that section. Thread persists per
    // (user, page, section).
    if (req.method === "POST" && route.startsWith("/pages/") && /\/sections\/[^/]+\/ask$/.test(route)) {
      const match = route.match(/^\/pages\/(.+?)\/sections\/(.+?)\/ask$/);
      if (!match) return json(400, { error: "bad ask route" });
      const slug = toText(match[1], 160);
      const sectionId = toText(match[2], 80);
      if (!slug || !sectionId) return json(400, { error: "page slug + section id required" });
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;

      const pagePayload = await loadPageDetail(sb, scope, slug);
      if (!pagePayload) return json(404, { error: "Page not found" });
      const page = pagePayload.page as Record<string, unknown>;
      const sections = Array.isArray(pagePayload.sections) ? pagePayload.sections : [];
      const targetSection = sections.find((sec) => String((sec as Record<string, unknown>).id) === sectionId) as Record<string, unknown> | undefined;
      if (!targetSection) return json(404, { error: "Section not found" });

      const body = await parseBody(req);
      const userMessage = toText(body.message, 1000);
      if (!userMessage) return json(400, { error: "message required" });

      const { data: existing } = await sb
        .from("ielts_playbook_section_threads")
        .select("messages")
        .eq("user_id", auth!.userId)
        .eq("page_id", page.id)
        .eq("section_id", sectionId)
        .maybeSingle();

      const priorMessages: Array<{ role: string; content: string; at: string }> = Array.isArray((existing as Record<string, unknown> | null)?.messages)
        ? ((existing as Record<string, unknown>).messages as Array<{ role: string; content: string; at: string }>)
        : [];

      const block = targetSection.content && typeof targetSection.content === "object" ? targetSection.content as Record<string, unknown> : {};
      const sectionText = toText(block.body ?? block.text ?? block.lead ?? targetSection.summary ?? "", 1500);
      const heading = toText(targetSection.heading ?? "", 200);

      const fallback = { reply: "AI coach is unavailable right now. Re-read the section above and the next paragraph — most follow-up questions resolve there." };

      const { data: result, status: aiStatus } = await callOpenRouterJsonWithStatus<{ reply?: unknown }>(
        {
          systemPrompt: "You are an IELTS tutor answering a student's follow-up question about a specific paragraph from a strategy article. Stay scoped to the section text — don't introduce concepts not present in it. Return strict JSON: {reply: 2-4 sentences, concrete, references the section's own wording where possible}.",
          userPayload: JSON.stringify({
            page_title: page.title,
            section_heading: heading,
            section_text: sectionText,
            prior_messages: priorMessages.slice(-6),
            student_question: userMessage,
          }),
          temperature: 0.5,
        },
        fallback,
      );

      const reply = toText(result.reply, 1200) || fallback.reply;
      const now = new Date().toISOString();
      const nextMessages = [
        ...priorMessages,
        { role: "user", content: userMessage, at: now },
        { role: "assistant", content: reply, at: now },
      ].slice(-30);

      await sb.from("ielts_playbook_section_threads").upsert(
        {
          user_id: auth!.userId,
          page_id: page.id,
          section_id: sectionId,
          messages: nextMessages,
        },
        { onConflict: "user_id,page_id,section_id" },
      );

      return json(200, { ok: true, ai_status: aiStatus, reply, messages: nextMessages });
    }

    if (req.method === "GET" && route.startsWith("/pages/") && /\/sections\/[^/]+\/thread$/.test(route)) {
      const match = route.match(/^\/pages\/(.+?)\/sections\/(.+?)\/thread$/);
      if (!match) return json(400, { error: "bad thread route" });
      const slug = toText(match[1], 160);
      const sectionId = toText(match[2], 80);
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;

      const pagePayload = await loadPageDetail(sb, scope, slug);
      if (!pagePayload) return json(404, { error: "Page not found" });
      const page = pagePayload.page as Record<string, unknown>;

      const { data: existing } = await sb
        .from("ielts_playbook_section_threads")
        .select("messages, updated_at")
        .eq("user_id", auth!.userId)
        .eq("page_id", page.id)
        .eq("section_id", sectionId)
        .maybeSingle();

      const messages = Array.isArray((existing as Record<string, unknown> | null)?.messages)
        ? ((existing as Record<string, unknown>).messages as Array<{ role: string; content: string; at: string }>)
        : [];
      return json(200, { ok: true, messages });
    }

    // Interactive worked example. AI walks through a real-shaped example of
    // the technique step-by-step. Returns an array of steps, each with a
    // reveal label and explanation, so the frontend can show progressively.
    if (req.method === "POST" && route.startsWith("/pages/") && route.endsWith("/worked-example")) {
      const slug = toText(route.replace("/pages/", "").replace(/\/worked-example$/, ""), 160);
      if (!slug) return json(400, { error: "page slug required" });
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;

      const pagePayload = await loadPageDetail(sb, scope, slug);
      if (!pagePayload) return json(404, { error: "Page not found" });
      const page = pagePayload.page as Record<string, unknown>;
      const sections = Array.isArray(pagePayload.sections) ? pagePayload.sections : [];
      const sectionsSummary = sections.slice(0, 6).map((sec) => {
        const r = sec as Record<string, unknown>;
        const block = r.content && typeof r.content === "object" ? r.content as Record<string, unknown> : {};
        return {
          heading: toText(r.heading ?? "", 200),
          body: toText(block.body ?? block.text ?? block.lead ?? r.summary ?? "", 600),
        };
      });

      const fallback = {
        setup: "AI worked example unavailable.",
        steps: [
          { reveal_label: "Look at the article", explanation: "Re-read the strategy sections above and try the technique yourself on a recent practice attempt." },
        ],
      };

      const { data: result, status: aiStatus, error: aiError } = await callOpenRouterJsonWithStatus<{
        setup?: unknown;
        steps?: unknown;
      }>(
        {
          systemPrompt: "You are an IELTS tutor demonstrating a strategy on a realistic worked example. Return strict JSON: {setup: 2-3 sentences describing a representative example scenario (a passage excerpt, a writing prompt, a listening clip transcript snippet, etc — pick whatever fits the article's question type), steps: [{reveal_label: short verb phrase (e.g. 'Scan for keywords'), explanation: 1-3 sentences showing the technique applied to THIS specific example, evidence: optional exact quote from your setup}]}. Aim for 4-6 steps. The setup must be self-contained and authentic — do NOT use placeholders like [passage here].",
          userPayload: JSON.stringify({
            page_title: page.title,
            page_module: page.module_key,
            sections: sectionsSummary,
          }),
          temperature: 0.55,
        },
        fallback,
      );

      const steps = Array.isArray(result.steps)
        ? (result.steps as unknown[])
            .filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && !Array.isArray(s))
            .map((s) => ({
              reveal_label: toText(s.reveal_label, 120),
              explanation: toText(s.explanation, 800),
              evidence: toText(s.evidence, 400) || null,
            }))
            .filter((s) => s.reveal_label && s.explanation)
            .slice(0, 7)
        : [];

      return json(200, {
        ok: true,
        ai_available: isOpenRouterConfigured(),
        ai_status: aiStatus,
        ai_error: aiError ?? null,
        setup: toText(result.setup, 1200) || fallback.setup,
        steps: steps.length > 0 ? steps : fallback.steps,
        generated_at: new Date().toISOString(),
      });
    }

    // Band-aware re-rendering. Same module, re-framed for a target band so a
    // band-5 reader gets simpler examples and a band-7 reader gets nuance.
    if (req.method === "POST" && route.startsWith("/pages/") && route.endsWith("/band-render")) {
      const slug = toText(route.replace("/pages/", "").replace(/\/band-render$/, ""), 160);
      if (!slug) return json(400, { error: "page slug required" });
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;

      const pagePayload = await loadPageDetail(sb, scope, slug);
      if (!pagePayload) return json(404, { error: "Page not found" });
      const page = pagePayload.page as Record<string, unknown>;
      const sections = Array.isArray(pagePayload.sections) ? pagePayload.sections : [];
      const body = await parseBody(req);
      const targetBand = Math.max(4, Math.min(9, Number(body.target_band) || 6.5));
      const sectionsSummary = sections.slice(0, 6).map((sec) => {
        const r = sec as Record<string, unknown>;
        const block = r.content && typeof r.content === "object" ? r.content as Record<string, unknown> : {};
        return {
          heading: toText(r.heading ?? "", 200),
          body: toText(block.body ?? block.text ?? block.lead ?? r.summary ?? "", 700),
        };
      });

      const fallback = {
        framing: `Targeting band ${targetBand}: re-read the original sections above; AI re-framing is unavailable right now.`,
        focus_points: [],
      };

      const { data: result, status: aiStatus, error: aiError } = await callOpenRouterJsonWithStatus<{
        framing?: unknown;
        focus_points?: unknown;
      }>(
        {
          systemPrompt: "You are an IELTS tutor adapting a strategy article for a SPECIFIC target band. Return strict JSON: {framing: 3-5 sentences re-framing the article's core technique for the target band — for band 4-5 use simpler vocabulary and emphasize foundational steps, for band 7-9 emphasize subtlety, common edge cases, and what separates a 7 from an 8, focus_points: 3-5 bullet strings the student at this band should prioritize from the article}. Do not summarize generically; tailor specifically to the band.",
          userPayload: JSON.stringify({
            page_title: page.title,
            target_band: targetBand,
            sections: sectionsSummary,
          }),
          temperature: 0.5,
        },
        fallback,
      );

      const focusPoints = Array.isArray(result.focus_points)
        ? (result.focus_points as unknown[]).map((p) => toText(p, 320)).filter(Boolean).slice(0, 6)
        : [];

      return json(200, {
        ok: true,
        ai_available: isOpenRouterConfigured(),
        ai_status: aiStatus,
        ai_error: aiError ?? null,
        target_band: targetBand,
        framing: toText(result.framing, 2000) || fallback.framing,
        focus_points: focusPoints,
        generated_at: new Date().toISOString(),
      });
    }

    // Notes / highlights — personal study sheet aggregated across pages.
    if (req.method === "GET" && route === "/notes") {
      if (!auth) return json(401, unauthorizedPayload);
      const { data: rows } = await sb
        .from("ielts_playbook_user_notes")
        .select("id, page_id, section_id, anchor_text, body, color, updated_at, page:ielts_playbook_pages(slug, title, module_key)")
        .eq("user_id", auth.userId)
        .order("updated_at", { ascending: false })
        .limit(200);
      return json(200, { ok: true, notes: rows ?? [] });
    }

    if (req.method === "POST" && route === "/notes") {
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;
      const body = await parseBody(req);
      const pageSlug = toText(body.page_slug, 160);
      if (!pageSlug) return json(400, { error: "page_slug required" });
      const pagePayload = await loadPageDetail(sb, scope, pageSlug);
      if (!pagePayload) return json(404, { error: "Page not found" });
      const page = pagePayload.page as Record<string, unknown>;

      const { data: created } = await sb
        .from("ielts_playbook_user_notes")
        .insert({
          user_id: auth!.userId,
          page_id: page.id,
          section_id: toText(body.section_id, 80) || null,
          anchor_text: toText(body.anchor_text, 1000),
          body: toText(body.body, 4000),
          color: toText(body.color, 32) || "amber",
        })
        .select("id, page_id, section_id, anchor_text, body, color, updated_at")
        .single();

      return json(200, { ok: true, note: created });
    }

    if (req.method === "DELETE" && route.startsWith("/notes/")) {
      if (!auth) return json(401, unauthorizedPayload);
      const id = toText(route.replace("/notes/", ""), 60);
      if (!id) return json(400, { error: "note id required" });
      await sb.from("ielts_playbook_user_notes").delete().eq("user_id", auth.userId).eq("id", id);
      return json(200, { ok: true });
    }

    // Mark a playbook module as visited so the dashboard can show progress.
    // Idempotent — repeated visits just refresh the timestamp.
    if (req.method === "POST" && route.startsWith("/modules/") && route.endsWith("/visit")) {
      const slug = toText(route.replace("/modules/", "").replace(/\/visit$/, ""), 160);
      if (!slug) return json(400, { error: "module slug required" });
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;
      const profile = await loadProfile(sb, scope, auth!.userId);
      const meta = (profile.metadata && typeof profile.metadata === "object" && !Array.isArray(profile.metadata))
        ? profile.metadata as Record<string, unknown>
        : {};
      const existingVisited = (meta.visited_modules && typeof meta.visited_modules === "object" && !Array.isArray(meta.visited_modules))
        ? meta.visited_modules as Record<string, string>
        : {};
      const nextVisited = { ...existingVisited, [slug]: new Date().toISOString() };
      await saveProfile(sb, scope, auth!.userId, {
        metadata: { ...meta, visited_modules: nextVisited },
      });
      return json(200, { ok: true, visited_modules: Object.keys(nextVisited), last_visited_slug: slug });
    }

    return json(404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(500, { error: message });
  }
});
