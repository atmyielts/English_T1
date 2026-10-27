import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  MODULE_ORDER,
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
  listMarkets,
  loadCurrentRecommendation,
  loadOutcomeForSession,
  loadPageDetail,
  loadPageRef,
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
  matchPlaybookRoute,
  pageCacheControl,
  pathHasRoute,
} from "../_shared/ielts-playbook-routes.ts";
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

    const url = new URL(req.url);
    const route = extractRoute(url, routeMarker);
    const matched = matchPlaybookRoute(req.method, route);
    if (!matched) {
      return pathHasRoute(route)
        ? json(405, { error: "Method not allowed" })
        : json(404, { error: "Not found" });
    }
    const params = matched.params;

    const sb = createClient(supabaseUrl, supabaseServiceRole, { auth: { persistSession: false } });
    // Scope (cached per isolate) and the session check are independent, so run
    // them together instead of one after the other.
    const [scope, auth] = await Promise.all([resolveScope(sb), authUser(sb, req)]);

    const requirePremium = async () => {
      if (!auth) return { ok: false as const, response: json(401, unauthorizedPayload) };
      const allowed = await hasPremiumAccess(supabaseUrl, supabaseAnonKey, auth.token, scope.playbookProductId);
      if (!allowed) return { ok: false as const, response: json(403, premiumPayload) };
      return { ok: true as const };
    };

    if (matched.name === "catalog") {
      return json(200, await listCatalog(sb, scope));
    }

    if (matched.name === "updates") {
      return json(200, await loadUpdatesPayload(sb, scope));
    }

    if (matched.name === "markets") {
      return json(200, { markets: await listMarkets(sb, scope) }, { "Cache-Control": "public, max-age=300" });
    }

    if (matched.name === "market_guidance") {
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

    if (matched.name === "page_detail") {
      const slug = toText(params.slug, 160);
      if (!slug) return json(404, { error: "Page not found" });
      const payload = await loadPageDetail(sb, scope, slug);
      if (!payload) return json(404, { error: "Page not found" });

      const page = payload.page as Record<string, unknown>;
      const visibility = String(page.visibility ?? "public");
      const noStore = { "Cache-Control": "private, no-store" };
      if (visibility === "authenticated" && !auth) {
        return json(401, { ...unauthorizedPayload, page_slug: slug }, noStore);
      }
      if (visibility === "premium") {
        const gate = await requirePremium();
        if (!gate.ok) {
          // Locked guides still show what is inside (title, summary, section
          // headings) so the app can render an honest upgrade screen.
          const status = gate.response.status;
          const sections = Array.isArray(payload.sections) ? payload.sections as Array<Record<string, unknown>> : [];
          return json(status, {
            ...(status === 401 ? unauthorizedPayload : premiumPayload),
            page_slug: slug,
            teaser: {
              slug,
              title: toText(page.title, 200),
              summary: toText(page.summary, 600),
              module_key: page.module_key ?? null,
              page_type: page.page_type ?? null,
              section_count: sections.length,
              headings: sections.map((sec) => toText(sec.heading, 160)).filter(Boolean).slice(0, 14),
            },
          }, noStore);
        }
      }
      return json(200, payload, {
        "Cache-Control": pageCacheControl({ visibility, authenticated: Boolean(auth) }),
        Vary: "Authorization, x-user-jwt",
      });
    }

    if (matched.name === "plan_detail") {
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;

      const slug = toText(params.slug, 160);
      const templates = await loadPlanTemplates(sb, scope);
      const plan = templates.find((row) => row.slug === slug);
      if (!plan) return json(404, { error: "Plan not found" });

      const recommendation = auth ? await loadCurrentRecommendation(sb, scope, auth.userId) : null;
      return json(200, {
        plan,
        latest_recommendation: recommendation,
      });
    }

    if (matched.name === "dashboard") {
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;

      // Single round-trip: own dashboard payload + the three cross-app insights
      // (trajectory / activity / mastery) the frontend used to fetch separately.
      // Running them in parallel server-side avoids 3 extra browser round-trips
      // and lets the playbook frontend hydrate everything from one response.
      const languageId = scope.languageId ?? "";
      const anchorSessionId = toText(url.searchParams.get("session_id"), 80);
      const [base, trajectory, activity, mastery, anchorOutcome] = await Promise.all([
        buildDashboardPayload(sb, scope, auth!.userId),
        buildPracticeTrajectory(sb, scope.practiceProductId, auth!.userId).catch(() => null),
        languageId
          ? buildPracticeActivity(sb, languageId, scope.practiceProductId, auth!.userId).catch(() => null)
          : Promise.resolve(null),
        languageId
          ? buildPracticeMasteryOverview(sb, languageId, auth!.userId).catch(() => null)
          : Promise.resolve(null),
        anchorSessionId
          ? loadOutcomeForSession(sb, scope, auth!.userId, anchorSessionId).catch(() => null)
          : Promise.resolve(null),
      ]);

      return new Response(
        JSON.stringify({
          ...base,
          simulator_anchor: anchorSessionId
            ? {
              session_id: anchorSessionId,
              found: Boolean(anchorOutcome),
              computed_at: anchorOutcome?.computed_at ?? null,
              overall_band: anchorOutcome?.overall_band ?? null,
            }
            : null,
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

    if (matched.name === "profile_get") {
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;
      // Short-cache so the onboarding wizard's repeated reads (when navigating
      // between stages) don't all re-hit the database. Browser cache only —
      // any PATCH on /profile invalidates by force-reload from the client.
      return new Response(
        JSON.stringify({ profile: await loadProfile(sb, scope, auth!.userId) }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "private, max-age=15",
            ...corsHeaders,
          },
        },
      );
    }

    if (matched.name === "profile_patch") {
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;
      const body = await parseBody(req);
      const profile = await saveProfile(sb, scope, auth!.userId, body);
      return json(200, { ok: true, profile });
    }

    if (matched.name === "recommendation_generate") {
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;
      const body = await parseBody(req);
      const profile = await saveProfile(sb, scope, auth!.userId, body);
      const recommendation = await generateRecommendation(sb, scope, auth!.userId, profile, {
        anchorSessionId: toText(body.session_id, 80) || null,
      });
      const snapshot = await persistRecommendation(sb, scope, auth!.userId, profile, recommendation);
      return json(200, { ok: true, snapshot, recommendation });
    }

    if (matched.name === "events") {
      const body = await parseBody(req);
      await recordEvent(sb, scope, body, auth?.userId ?? null);
      return json(200, { ok: true });
    }

    // AI strategy explainer: takes a playbook page slug + the authenticated
    // user's recent mistakes for the matching question type, and returns a
    // personalized walkthrough of the strategy grounded in the user's actual
    // errors. Powered by OpenRouter; degrades to a generic explanation when
    // the API key isn't set.
    if (matched.name === "page_explain") {
      const slug = toText(params.slug, 160);
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
    if (matched.name === "page_drills") {
      const slug = toText(params.slug, 160);
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
    if (matched.name === "page_drills_submit") {
      const slug = toText(params.slug, 160);
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
    if (matched.name === "page_diagnostic") {
      const slug = toText(params.slug, 160);
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
    if (matched.name === "page_diagnostic_submit") {
      const slug = toText(params.slug, 160);
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
    if (matched.name === "section_ask") {
      const slug = toText(params.slug, 160);
      const sectionId = toText(params.sectionId, 80);
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

    if (matched.name === "section_thread") {
      const slug = toText(params.slug, 160);
      const sectionId = toText(params.sectionId, 80);
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
    if (matched.name === "page_worked_example") {
      const slug = toText(params.slug, 160);
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
    if (matched.name === "page_band_render") {
      const slug = toText(params.slug, 160);
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
    if (matched.name === "notes_list") {
      if (!auth) return json(401, unauthorizedPayload);
      const { data: rows } = await sb
        .from("ielts_playbook_user_notes")
        .select("id, page_id, section_id, anchor_text, body, color, updated_at, page:ielts_playbook_pages(slug, title, module_key)")
        .eq("user_id", auth.userId)
        .order("updated_at", { ascending: false })
        .limit(200);
      return json(200, { ok: true, notes: rows ?? [] });
    }

    if (matched.name === "notes_create") {
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;
      const body = await parseBody(req);
      const pageSlug = toText(body.page_slug, 160);
      if (!pageSlug) return json(400, { error: "page_slug required" });
      const page = await loadPageRef(sb, scope, pageSlug);
      if (!page) return json(404, { error: "Page not found" });

      const { data: created, error: createError } = await sb
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
      if (createError || !created) return json(500, { error: "Could not save the note" });

      return json(200, { ok: true, note: created });
    }

    if (matched.name === "notes_delete") {
      if (!auth) return json(401, unauthorizedPayload);
      const id = toText(params.id, 60);
      if (!id) return json(400, { error: "note id required" });
      await sb.from("ielts_playbook_user_notes").delete().eq("user_id", auth.userId).eq("id", id);
      return json(200, { ok: true });
    }

    // ===== Deep diagnostic: AI skills probe + synthesis + AI plan =====

    if (matched.name === "diagnostic_probe") {
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;
      const body = await parseBody(req);
      const targetBand = Math.max(4, Math.min(9, Number(body.target_band) || 6.5));
      const selfAssessment = body.self_assessment && typeof body.self_assessment === "object" ? body.self_assessment : {};

      const fallbackProbe = {
        prompts: [
          { section: "reading", id: "p-reading", instruction: "AI probe unavailable. Run a practice lab instead.", kind: "info" },
          { section: "listening", id: "p-listening", instruction: "AI probe unavailable.", kind: "info" },
          { section: "writing", id: "p-writing", instruction: "AI probe unavailable.", kind: "info" },
          { section: "speaking", id: "p-speaking", instruction: "AI probe unavailable.", kind: "info" },
        ],
      };

      const { data: result, status: aiStatus, error: aiError } = await callOpenRouterJsonWithStatus<{ prompts?: unknown }>(
        {
          systemPrompt: "You are an IELTS examiner designing a 4-task diagnostic probe — one prompt for each of reading, listening, writing, speaking. Each prompt must be answerable in ~2 minutes via short typed responses. Return strict JSON: {prompts: [{section: 'reading'|'listening'|'writing'|'speaking', id: short slug, instruction: 1-2 sentences telling the student what to do, kind: 'mcq'|'short_text'|'essay_seed'|'speaking_outline', passage_or_audio_transcript: string (for reading: a 80-150 word passage; for listening: a 80-150 word transcript snippet; otherwise empty), options: optional [4 strings for mcq], expected_format: short hint on what a good answer looks like}]}. Calibrate difficulty to the student's target band ± 0.5. Do NOT include answer keys.",
          userPayload: JSON.stringify({ target_band: targetBand, self_assessment: selfAssessment }),
          temperature: 0.55,
        },
        fallbackProbe,
      );

      const prompts = Array.isArray(result.prompts)
        ? (result.prompts as unknown[])
            .filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && !Array.isArray(p))
            .map((p, idx) => {
              const sectionRaw = String(p.section ?? "").toLowerCase();
              const section = ["reading", "listening", "writing", "speaking"].includes(sectionRaw)
                ? sectionRaw
                : ["reading", "listening", "writing", "speaking"][idx % 4];
              const options = Array.isArray(p.options)
                ? (p.options as unknown[]).map((o) => toText(o, 240)).filter(Boolean).slice(0, 4)
                : [];
              return {
                section,
                id: toText(p.id, 80) || `${section}-probe`,
                instruction: toText(p.instruction, 600),
                kind: toText(p.kind, 32) || "short_text",
                passage_or_audio_transcript: toText(p.passage_or_audio_transcript, 1200) || null,
                options: options.length > 0 ? options : null,
                expected_format: toText(p.expected_format, 200) || null,
              };
            })
            .filter((p) => p.instruction)
            .slice(0, 4)
        : [];

      const finalPrompts = prompts.length === 4 ? prompts : fallbackProbe.prompts;

      const { data: probeRow } = await sb
        .from("ielts_playbook_skills_probes")
        .insert({
          user_id: auth!.userId,
          prompts: finalPrompts,
          responses: {},
          ai_estimates: {},
          ai_status: aiStatus,
        })
        .select("id")
        .single();

      return json(200, {
        ok: true,
        probe_id: (probeRow as Record<string, unknown> | null)?.id ?? null,
        ai_status: aiStatus,
        ai_error: aiError ?? null,
        prompts: finalPrompts,
      });
    }

    if (matched.name === "diagnostic_probe_grade") {
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;
      const body = await parseBody(req);
      const probeId = toText(body.probe_id, 60);
      if (!probeId) return json(400, { error: "probe_id required" });
      const responses = body.responses && typeof body.responses === "object" ? body.responses : {};

      const { data: existing } = await sb
        .from("ielts_playbook_skills_probes")
        .select("prompts")
        .eq("user_id", auth!.userId)
        .eq("id", probeId)
        .maybeSingle();
      if (!existing) return json(404, { error: "Probe not found" });
      const prompts = Array.isArray((existing as Record<string, unknown>).prompts)
        ? ((existing as Record<string, unknown>).prompts as Array<Record<string, unknown>>)
        : [];

      const fallbackGrade = {
        per_skill: {
          reading: { band_estimate: null, reasoning: "AI grading unavailable." },
          listening: { band_estimate: null, reasoning: "AI grading unavailable." },
          writing: { band_estimate: null, reasoning: "AI grading unavailable." },
          speaking: { band_estimate: null, reasoning: "AI grading unavailable." },
        },
        overall_band_estimate: null,
        confidence: "low",
        notes: "Connect AI to enable empirical band estimates.",
      };

      const { data: graded, status: aiStatus, error: aiError } = await callOpenRouterJsonWithStatus<{
        per_skill?: unknown;
        overall_band_estimate?: unknown;
        confidence?: unknown;
        notes?: unknown;
      }>(
        {
          systemPrompt: "You are an IELTS examiner grading a 4-task diagnostic probe. For each section (reading, listening, writing, speaking) you have the prompt + the student's response. Return strict JSON: {per_skill: {reading: {band_estimate: number 0-9 in 0.5 steps, reasoning: 2-3 sentences citing what they did or didn't do}, listening: {...}, writing: {...}, speaking: {...}}, overall_band_estimate: number, confidence: 'low'|'medium'|'high', notes: 2-3 sentences calling out the single most important gap}. Be honest — if a response is empty or 1-word, the estimate must be low and you must say so. Score in 0.5 increments only.",
          userPayload: JSON.stringify({ prompts, student_responses: responses }),
          temperature: 0.3,
        },
        fallbackGrade,
      );

      const overall = Number(graded.overall_band_estimate);
      const overallSafe = Number.isFinite(overall) ? Math.max(0, Math.min(9, overall)) : null;

      await sb
        .from("ielts_playbook_skills_probes")
        .update({
          responses,
          ai_estimates: {
            per_skill: graded.per_skill ?? {},
            overall_band_estimate: overallSafe,
            confidence: toText(graded.confidence, 16) || "low",
            notes: toText(graded.notes, 600),
            ai_status: aiStatus,
          },
          overall_band_estimate: overallSafe,
          ai_status: aiStatus,
          completed_at: new Date().toISOString(),
        })
        .eq("user_id", auth!.userId)
        .eq("id", probeId);

      return json(200, {
        ok: true,
        ai_status: aiStatus,
        ai_error: aiError ?? null,
        per_skill: graded.per_skill ?? fallbackGrade.per_skill,
        overall_band_estimate: overallSafe,
        confidence: toText(graded.confidence, 16) || "low",
        notes: toText(graded.notes, 600) || "",
      });
    }

    if (matched.name === "diagnostic_synthesize") {
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;

      const profile = await loadProfile(sb, scope, auth!.userId);
      const { data: latestProbe } = await sb
        .from("ielts_playbook_skills_probes")
        .select("ai_estimates, overall_band_estimate, completed_at")
        .eq("user_id", auth!.userId)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let practiceMastery: Array<Record<string, unknown>> = [];
      try {
        if (scope.languageId) {
          const mastery = await buildPracticeMasteryOverview(sb, scope.languageId, auth!.userId);
          if (mastery && typeof mastery === "object") {
            const byStatus = (mastery as Record<string, unknown>).by_status;
            if (byStatus && typeof byStatus === "object") {
              practiceMastery = Object.values(byStatus as Record<string, unknown>)
                .flatMap((rows) => (Array.isArray(rows) ? rows : []))
                .filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row))
                .slice(0, 25);
            }
          }
        }
      } catch {
        practiceMastery = [];
      }

      const fallback = {
        narrative: "AI synthesis unavailable. Your profile + the rule-based recommendation on the diagnostic page still apply.",
        section_priority: ["reading", "listening", "writing", "speaking"],
        risks: [],
        weekly_hours_needed: null,
        feasibility: "unknown",
      };

      // Restructure the payload into clearly-labelled buckets so the model
      // doesn't conflate self-assessment numbers (the student's perception of
      // their CURRENT band per skill) with the target band. We hit this when
      // the prompt fused them under "profile/metadata" and AI invented
      // "target section bands all 9" out of self-assessment ratings.
      const meta = (profile.metadata && typeof profile.metadata === "object" && !Array.isArray(profile.metadata))
        ? profile.metadata as Record<string, unknown>
        : {};
      const goalBlock = {
        target_overall_band: profile.target_overall_band,
        exam_date: profile.deadline_date,
        purpose: profile.purpose,
        destination_country: (profile as Record<string, unknown>).destination_country_code ?? null,
        delivery_mode: profile.preferred_delivery_mode,
        provider: profile.provider_key,
      };
      const currentStateBlock = {
        self_reported_current_band_overall: profile.current_band_or_estimate,
        self_assessment_per_skill_NOT_TARGET: meta.self_assessment ?? null,
        ielts_history: meta.ielts_history ?? null,
        weakest_skill_user_reported: profile.weakest_skill,
        latest_ai_probe: latestProbe,
        practice_mastery_top_signals: practiceMastery,
      };
      const constraintsBlock = {
        weekly_hours_available: (meta.constraints && typeof meta.constraints === "object")
          ? (meta.constraints as Record<string, unknown>).hoursPerWeek ?? null
          : null,
        days_per_week: (meta.constraints && typeof meta.constraints === "object")
          ? (meta.constraints as Record<string, unknown>).daysPerWeek ?? null
          : null,
        learner_style: meta.style ?? null,
      };

      const { data: synth, status: aiStatus, error: aiError } = await callOpenRouterJsonWithStatus<{
        narrative?: unknown;
        section_priority?: unknown;
        risks?: unknown;
        weekly_hours_needed?: unknown;
        feasibility?: unknown;
      }>(
        {
          systemPrompt: "You are an IELTS strategist synthesizing a student's diagnostic. The input is structured into THREE clearly-labelled buckets: `goal` (what they're aiming for), `current_state` (where they are now, including their own self-assessment AND any AI probe / practice signals), and `constraints` (time available, style). CRITICAL: the field `self_assessment_per_skill_NOT_TARGET` contains the student's own perception of their CURRENT level — these are NOT target bands; do not confuse the two. Only `goal.target_overall_band` is the target. Return strict JSON: {narrative: 3-5 paragraphs of personalised analysis citing specific signals by name (e.g. 'your probe scored writing 5.5 while your target_overall_band is 7'), section_priority: ordered array of 4 sections by ROI starting with the highest priority, risks: array (max 5) of {risk: 1-sentence callout, severity: 'low'|'medium'|'high', mitigation: 1-sentence action they can take this week}, weekly_hours_needed: integer estimate of weekly study hours to hit goal on time, feasibility: 'comfortable'|'tight'|'aggressive'|'unrealistic'}. Be honest about feasibility.",
          userPayload: JSON.stringify({
            goal: goalBlock,
            current_state: currentStateBlock,
            constraints: constraintsBlock,
            today: new Date().toISOString().slice(0, 10),
          }),
          temperature: 0.55,
        },
        fallback,
      );

      const risks = Array.isArray(synth.risks)
        ? (synth.risks as unknown[])
            .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r))
            .map((r) => ({
              risk: toText(r.risk, 320),
              severity: ["low", "medium", "high"].includes(String(r.severity ?? "")) ? String(r.severity) : "medium",
              mitigation: toText(r.mitigation, 320),
            }))
            .filter((r) => r.risk)
            .slice(0, 5)
        : [];

      const sectionPriority = Array.isArray(synth.section_priority)
        ? (synth.section_priority as unknown[])
            .map((s) => String(s ?? "").toLowerCase())
            .filter((s) => ["reading", "listening", "writing", "speaking"].includes(s))
            .slice(0, 4)
        : [];

      return json(200, {
        ok: true,
        ai_status: aiStatus,
        ai_error: aiError ?? null,
        narrative: toText(synth.narrative, 4000) || fallback.narrative,
        section_priority: sectionPriority.length === 4 ? sectionPriority : fallback.section_priority,
        risks,
        weekly_hours_needed: Number.isFinite(Number(synth.weekly_hours_needed))
          ? Math.max(0, Math.min(60, Number(synth.weekly_hours_needed)))
          : null,
        feasibility: ["comfortable", "tight", "aggressive", "unrealistic"].includes(String(synth.feasibility ?? ""))
          ? String(synth.feasibility)
          : fallback.feasibility,
        generated_at: new Date().toISOString(),
      });
    }

    if (matched.name === "plan_generate_ai") {
      const slug = toText(params.slug, 160);
      if (!slug) return json(400, { error: "plan slug required" });
      const gate = await requirePremium();
      if (!gate.ok) return gate.response;

      const templates = await loadPlanTemplates(sb, scope);
      const plan = templates.find((row) => row.slug === slug);
      if (!plan) return json(404, { error: "Plan not found" });

      const profile = await loadProfile(sb, scope, auth!.userId);
      const body = await parseBody(req);
      const weeklyHours = Math.max(0, Math.min(60, Number(body.weekly_hours) || 10));
      const sectionPriority = Array.isArray(body.section_priority) ? body.section_priority : [];

      const fallback = {
        intro: "AI plan generation unavailable. The base plan template still applies.",
        weeks: [],
      };

      const { data: result, status: aiStatus, error: aiError } = await callOpenRouterJsonWithStatus<{
        intro?: unknown;
        weeks?: unknown;
      }>(
        {
          systemPrompt: `You are an IELTS coach drafting a concrete week-by-week study plan for a single student. You have: a base plan template, the student's profile, available weekly hours, and a prioritized section order. Return strict JSON: {intro: 2-3 sentences framing how this plan was tailored, weeks: [{week_number: 1..N, theme: short label, focus_sections: array of 1-3 section names, hours: total hours, key_activities: 3-5 specific bullets, success_criteria: 1-2 sentences, playbook_modules: optional array of module slugs chosen ONLY from: ${MODULE_ORDER.join(", ")}}]}. Generate up to 8 weeks. Front-load the highest-priority section. Adapt to deadline: if 3 weeks out, make 3 weeks; if 12+ weeks, make 8.`,
          userPayload: JSON.stringify({
            plan_template: {
              title: plan.title,
              summary: plan.summary,
              duration_days: plan.duration_days,
              intensity: plan.intensity,
              focus_skill: plan.focus_skill,
              band_min: plan.band_min,
              band_max: plan.band_max,
            },
            profile: {
              target_band: profile.target_overall_band,
              current_band_estimate: profile.current_band_or_estimate,
              deadline: profile.deadline_date,
              weakest_skill: profile.weakest_skill,
            },
            weekly_hours: weeklyHours,
            section_priority: sectionPriority,
            today: new Date().toISOString().slice(0, 10),
          }),
          temperature: 0.5,
        },
        fallback,
      );

      const weeks = Array.isArray(result.weeks)
        ? (result.weeks as unknown[])
            .filter((w): w is Record<string, unknown> => !!w && typeof w === "object" && !Array.isArray(w))
            .map((w, idx) => ({
              week_number: Number.isFinite(Number(w.week_number)) ? Number(w.week_number) : idx + 1,
              theme: toText(w.theme, 160),
              focus_sections: Array.isArray(w.focus_sections)
                ? (w.focus_sections as unknown[]).map((s) => toText(s, 32)).filter(Boolean).slice(0, 4)
                : [],
              hours: Number.isFinite(Number(w.hours)) ? Math.max(0, Math.min(40, Number(w.hours))) : weeklyHours,
              key_activities: Array.isArray(w.key_activities)
                ? (w.key_activities as unknown[]).map((a) => toText(a, 320)).filter(Boolean).slice(0, 6)
                : [],
              success_criteria: toText(w.success_criteria, 600),
              // Only real module slugs, so every chip in the plan opens a page.
              playbook_modules: Array.isArray(w.playbook_modules)
                ? (w.playbook_modules as unknown[]).map((m) => toText(m, 80)).filter((m) => MODULE_ORDER.includes(m)).slice(0, 4)
                : [],
            }))
            .filter((w) => w.theme)
            .slice(0, 12)
        : [];

      return json(200, {
        ok: true,
        ai_status: aiStatus,
        ai_error: aiError ?? null,
        plan_slug: slug,
        intro: toText(result.intro, 1500) || fallback.intro,
        weeks,
        weekly_hours: weeklyHours,
        generated_at: new Date().toISOString(),
      });
    }

    // Mark a playbook module as visited so the dashboard can show progress.
    // Idempotent — repeated visits just refresh the timestamp.
    if (matched.name === "module_visit") {
      const slug = toText(params.slug, 160);
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

    // Every matched route returns above; reaching here means a route was added
    // to the table without a handler.
    return json(501, { error: "Route not implemented", route: matched.name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(500, { error: message });
  }
});
