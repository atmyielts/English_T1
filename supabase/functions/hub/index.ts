import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  authUser,
  buildDailyPlanForUser,
  corsHeaders,
  extractRoute,
  getEnv,
  json,
  loadNotebookStats,
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
import {
  consumeEnglishAiDailyQuota,
  parseEnglishAiDailyLimit,
  requireEnglishSuiteAccess,
} from "../_shared/english-access.ts";
import { parseBody } from "../_shared/english-learning.ts";
import { parseEnglishClientRecoveryEvent } from "../_shared/english-client-recovery.ts";
import {
  type AttemptRow,
  type CatalogItem,
  type Cefr,
  currentStreak,
  isCefr as isTodayCefr,
  planToday,
  TODAY_SKILLS,
  type TodaySkill,
  type TodayTask,
  weekStrip,
} from "../_shared/english-today.ts";

const routeMarker = "/hub";

// One learner-facing activity per row: lessons, articles, prompts and missions.
// Sub-items such as individual grammar drills are recorded separately and excluded.
const PRIMARY_CONTENT_TYPES = [
  "reading.article",
  "listening.item",
  "writing.prompt",
  "speaking.prompt",
  "grammar.unit",
  "immersion.mission",
  "vocabulary.deck",
];

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

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const auth = await authUser(sb, req);
    if (!auth) return json(401, { error: "Unauthorized" });

    const url = new URL(req.url);
    const route = extractRoute(url, routeMarker);

    if (req.method === "POST" && route === "/client-events/recovery") {
      const event = parseEnglishClientRecoveryEvent(await parseBody(req));
      if (!event) {
        return json(400, {
          error: "Invalid recovery event",
          code: "invalid_english_recovery_event",
          request_id: requestId,
        });
      }

      console.error(JSON.stringify({
        event: "english_client_recovery",
        request_id: requestId,
        user_id: auth.userId,
        kind: event.kind,
        path: event.path,
        release: event.release,
        error_name: event.errorName,
      }));
      return new Response(JSON.stringify({ ok: true, request_id: requestId }), {
        status: 202,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-Request-Id": requestId,
          ...corsHeaders,
        },
      });
    }

    const scope = await resolveLanguageScope(sb, toText(url.searchParams.get("language_code"), 16) || "en");
    const products = await resolveEnglishProducts(sb);

    const isEnglishAiRequest = (req.method === "GET" && route === "/insights/coach-summary")
      || (req.method === "POST" && route.startsWith("/ai/"));
    if (isEnglishAiRequest) {
      // The placement test is the front door, so it is open to every signed-in
      // learner; it still counts against the daily AI quota below.
      const isFreeAiRequest = route === "/ai/placement-test";
      const access = isFreeAiRequest ? { allowed: true } : await requireEnglishSuiteAccess(sb, auth.userId, products);
      if (!access.allowed) {
        return json(403, {
          error: "An active English service entitlement is required",
          code: "english_entitlement_required",
        });
      }

      if (isEnglishAIConfigured()) {
        const quota = await consumeEnglishAiDailyQuota(
          sb,
          auth.userId,
          parseEnglishAiDailyLimit(Deno.env.get("ENGLISH_AI_DAILY_LIMIT")),
        );
        if (!quota.allowed) {
          return json(429, {
            error: "Daily English AI limit reached. Try again tomorrow.",
            code: "english_ai_daily_limit_reached",
            remaining: quota.remaining,
            total: quota.total,
          });
        }
      }
    }

    // === Today, catalog and history (learner home) ===
    // Built only from the learner's placement, real attempts and due reviews.

    if (req.method === "GET" && (route === "/today" || route === "/catalog" || route === "/history")) {
      const skillFilter = toText(url.searchParams.get("skill"), 24).toLowerCase();
      const wantSkill = (TODAY_SKILLS as readonly string[]).includes(skillFilter) ? skillFilter : null;

      const loadCatalog = async (): Promise<CatalogItem[]> => {
        let query = sb
          .from("learning_content_registry_items")
          .select("id, service_key, source_ref, title, cefr_level, estimated_minutes, difficulty")
          .eq("language_id", scope.languageId)
          .eq("status", "published")
          .in("content_type", PRIMARY_CONTENT_TYPES)
          .limit(2000);
        if (wantSkill) query = query.eq("service_key", wantSkill);
        const { data, error } = await query;
        if (error) throw new Error(`Failed to load catalog: ${error.message}`);
        return (data ?? [])
          .filter((row: Record<string, unknown>) => (TODAY_SKILLS as readonly string[]).includes(String(row.service_key)))
          .map((row: Record<string, unknown>) => ({
            id: String(row.id),
            skill: String(row.service_key) as TodaySkill,
            slug: String(row.source_ref),
            title: String(row.title ?? ""),
            level: isTodayCefr(row.cefr_level) ? row.cefr_level : null,
            minutes: Math.max(1, Number(row.estimated_minutes ?? 10)),
            difficulty: Number(row.difficulty ?? 0.5),
          }));
      };

      const loadAttempts = async (days: number, limit: number) => {
        let query = sb
          .from("learning_attempts")
          .select("id, content_item_id, service_key, overall_score, correctness_ratio, submitted_at, time_spent_seconds")
          .eq("user_id", auth.userId)
          .eq("language_id", scope.languageId)
          // "failed" means a low score, not a broken attempt; it still counts as done.
          .in("status", ["submitted", "scored", "failed"])
          .not("submitted_at", "is", null)
          .gte("submitted_at", new Date(Date.now() - days * 86_400_000).toISOString())
          .order("submitted_at", { ascending: false })
          .limit(limit);
        if (wantSkill) query = query.eq("service_key", wantSkill);
        const { data, error } = await query;
        if (error) throw new Error(`Failed to load attempts: ${error.message}`);
        return (data ?? []) as Array<Record<string, unknown>>;
      };

      const scoreOf = (row: Record<string, unknown>): number | null => {
        // Learners see accuracy; overall_score also blends speed and hint use.
        const raw = row.correctness_ratio ?? row.overall_score;
        const value = Number(raw);
        return raw === null || raw === undefined || !Number.isFinite(value) ? null : Math.max(0, Math.min(1, value));
      };

      if (route === "/catalog") {
        const [items, attempts] = await Promise.all([loadCatalog(), loadAttempts(3650, 2000)]);
        const best: Record<string, number> = {};
        for (const row of attempts) {
          const id = String(row.content_item_id ?? "");
          const score = scoreOf(row);
          if (!id) continue;
          best[id] = Math.max(best[id] ?? 0, Math.round((score ?? 0) * 100));
        }
        return jsonCached(200, { ok: true, items, best_scores: best }, 30);
      }

      if (route === "/history") {
        const [items, attempts] = await Promise.all([loadCatalog(), loadAttempts(3650, 60)]);
        const byId = new Map(items.map((entry) => [entry.id, entry]));
        return json(200, {
          ok: true,
          attempts: attempts.map((row) => {
            const entry = byId.get(String(row.content_item_id ?? ""));
            const score = scoreOf(row);
            return {
              id: String(row.id),
              skill: entry?.skill ?? String(row.service_key ?? ""),
              title: entry?.title ?? null,
              slug: entry?.slug ?? null,
              level: entry?.level ?? null,
              score: score === null ? null : Math.round(score * 100),
              submitted_at: String(row.submitted_at),
              time_spent_seconds: Number(row.time_spent_seconds ?? 0) || null,
            };
          }),
        });
      }

      // /today
      const requestedDate = toText(url.searchParams.get("date"), 10);
      const utcToday = new Date().toISOString().slice(0, 10);
      const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
        && Math.abs(Date.parse(requestedDate) - Date.parse(utcToday)) <= 86_400_000;
      const planDate = dateOk ? requestedDate : utcToday;

      const [items, attemptRows, goalRes, notebook, access, existingRes] = await Promise.all([
        loadCatalog(),
        loadAttempts(60, 400),
        sb.from("learner_language_goals")
          .select("current_cefr_estimate, target_cefr, daily_time_minutes, goal_keys, metadata")
          .eq("user_id", auth.userId)
          .eq("language_id", scope.languageId)
          .maybeSingle(),
        loadNotebookStats(sb, auth.userId, scope.languageId),
        requireEnglishSuiteAccess(sb, auth.userId, products),
        sb.from("learner_language_daily_plans")
          .select("summary")
          .eq("user_id", auth.userId)
          .eq("language_id", scope.languageId)
          .eq("plan_date", planDate)
          .maybeSingle(),
      ]);

      const goal = goalRes.data as Record<string, unknown> | null;
      const meta = (goal?.metadata && typeof goal.metadata === "object" ? goal.metadata : {}) as Record<string, unknown>;
      const placement = (meta.placement && typeof meta.placement === "object" ? meta.placement : null) as Record<string, unknown> | null;
      const perSkillRaw = (placement?.per_skill && typeof placement.per_skill === "object" ? placement.per_skill : {}) as Record<string, unknown>;
      const perSkillLevel: Partial<Record<TodaySkill, Cefr>> = {};
      for (const skill of TODAY_SKILLS) {
        const entry = perSkillRaw[skill];
        const level = typeof entry === "string" ? entry : (entry as Record<string, unknown> | undefined)?.level;
        if (isTodayCefr(level)) perSkillLevel[skill] = level;
      }
      const overallLevel = isTodayCefr(goal?.current_cefr_estimate) ? goal!.current_cefr_estimate as Cefr : null;

      const availableSkills = access.admin
        ? [...TODAY_SKILLS]
        : TODAY_SKILLS.filter((skill) => {
          const productId = (products as Record<string, { productId?: string }>)[skill]?.productId;
          return Boolean(productId && access.entitlementProductIds.includes(productId));
        });

      const attempts: AttemptRow[] = attemptRows
        .filter((row) => (TODAY_SKILLS as readonly string[]).includes(String(row.service_key)))
        .map((row) => ({
          content_item_id: String(row.content_item_id ?? ""),
          skill: String(row.service_key) as TodaySkill,
          score: scoreOf(row),
          submitted_at: String(row.submitted_at),
        }));

      const dailyMinutes = Number(goal?.daily_time_minutes ?? 20) || 20;
      // A stored plan is reused only while the inputs that shaped it are unchanged.
      const planKey = [overallLevel ?? "-", dailyMinutes, availableSkills.join(","), JSON.stringify(perSkillLevel)].join("|");
      const existingSummary = (existingRes.data?.summary ?? {}) as Record<string, unknown>;
      const existing = existingSummary.generated_by === "hub.today.v1"
          && existingSummary.plan_key === planKey
          && Array.isArray(existingSummary.today_tasks)
        ? existingSummary.today_tasks as TodayTask[]
        : null;

      const plan = planToday({
        date: planDate,
        dailyMinutes,
        overallLevel,
        perSkillLevel,
        items,
        attempts,
        dueReviews: notebook.dueCount,
        availableSkills,
        existing,
      });

      // Persist so the selection stays stable all day and Student Center can show it.
      const appUrl = (Deno.env.get("ENGLISH_APP_URL") ?? "https://english.schood.online").replace(/\/$/, "");
      await sb.from("learner_language_daily_plans").upsert({
        user_id: auth.userId,
        language_id: scope.languageId,
        plan_date: planDate,
        minutes_budget: Math.max(5, Math.min(240, Math.round(dailyMinutes))),
        total_estimated_minutes: plan.minutes_total,
        status: plan.tasks.length > 0 && plan.done_count === plan.tasks.length ? "completed" : "active",
        tasks: plan.tasks.map((task) => ({
          id: task.id,
          service_key: task.skill,
          service_label: task.skill.slice(0, 1).toUpperCase() + task.skill.slice(1),
          title: task.kind === "review" ? "Review due vocabulary" : task.title,
          reason: task.reason,
          intent: task.kind,
          skill: task.skill,
          estimated_minutes: task.minutes,
          content_item_id: task.content_item_id,
          href: task.kind === "review" ? `${appUrl}/review` : `${appUrl}/${task.skill}/${task.slug ?? ""}`,
          done: task.done,
        })),
        summary: { generated_by: "hub.today.v1", plan_key: planKey, today_tasks: plan.tasks, done_count: plan.done_count },
      }, { onConflict: "user_id,language_id,plan_date" });

      return json(200, {
        ok: true,
        date: plan.date,
        level: overallLevel,
        target_level: isTodayCefr(goal?.target_cefr) ? goal!.target_cefr : null,
        per_skill_level: perSkillLevel,
        daily_minutes: dailyMinutes,
        placement_done: Boolean(placement?.completed_at),
        available_skills: availableSkills,
        tasks: plan.tasks,
        minutes_total: plan.minutes_total,
        done_count: plan.done_count,
        due_reviews: notebook.dueCount,
        total_words: notebook.totalCount,
        streak: currentStreak(attempts, planDate),
        week: weekStrip(attempts, planDate),
      });
    }

    // Legacy daily plan endpoint, kept for older clients.
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

    // === Front-door onboarding (placement + goal) persistence ===
    // The hub gates new learners through an adaptive CEFR placement and a goal
    // selection. Both were previously stateless AI calls; these endpoints make
    // their results durable in learner_language_goals so the gate can detect
    // completion across sessions/devices and the dashboard can show a real CEFR
    // estimate instead of hardcoded fallback scores.

    if (req.method === "GET" && route === "/onboarding/status") {
      const { data } = await sb
        .from("learner_language_goals")
        .select("current_cefr_estimate, target_cefr, goal_keys, daily_time_minutes, metadata")
        .eq("user_id", auth.userId)
        .eq("language_id", scope.languageId)
        .maybeSingle();
      const meta = (data?.metadata ?? {}) as Record<string, unknown>;
      const placement = (meta.placement && typeof meta.placement === "object" && !Array.isArray(meta.placement)
        ? meta.placement as Record<string, unknown>
        : null);
      const goalKeys = Array.isArray(data?.goal_keys) ? data!.goal_keys as string[] : [];
      return json(200, {
        ok: true,
        placement_done: !!(placement && placement.completed_at),
        goal_set: goalKeys.length > 0,
        cefr_estimate: data?.current_cefr_estimate ?? null,
        target_cefr: data?.target_cefr ?? null,
        goal_keys: goalKeys,
        daily_time_minutes: Number(data?.daily_time_minutes ?? 40),
        placement,
      });
    }

    if (req.method === "POST" && route === "/onboarding/save") {
      const isCefr = (v: string) => /^(A1|A2|B1|B2|C1|C2)$/.test(v);
      const body = await parseBody(req) as Record<string, unknown>;
      const placementIn = body.placement && typeof body.placement === "object" && !Array.isArray(body.placement)
        ? body.placement as Record<string, unknown>
        : null;
      const goalIn = body.goal && typeof body.goal === "object" && !Array.isArray(body.goal)
        ? body.goal as Record<string, unknown>
        : null;
      if (!placementIn && !goalIn) {
        return json(400, { error: "Provide a placement and/or goal payload to save." });
      }

      // Merge with any existing row so a placement-only or goal-only save never
      // clobbers the other half of the learner's onboarding state.
      const { data: existing } = await sb
        .from("learner_language_goals")
        .select("goal_keys, target_cefr, daily_time_minutes, current_cefr_estimate, metadata")
        .eq("user_id", auth.userId)
        .eq("language_id", scope.languageId)
        .maybeSingle();

      const meta = (existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? existing.metadata as Record<string, unknown>
        : {}) as Record<string, unknown>;
      const row: Record<string, unknown> = {
        user_id: auth.userId,
        language_id: scope.languageId,
        goal_keys: Array.isArray(existing?.goal_keys) ? existing!.goal_keys : [],
        target_cefr: existing?.target_cefr ?? null,
        daily_time_minutes: Number(existing?.daily_time_minutes ?? 40),
        current_cefr_estimate: existing?.current_cefr_estimate ?? null,
        metadata: meta,
      };

      if (placementIn) {
        const overall = toText(placementIn.overall_level, 8).toUpperCase();
        const perSkill = placementIn.per_skill && typeof placementIn.per_skill === "object" && !Array.isArray(placementIn.per_skill)
          ? placementIn.per_skill
          : {};
        if (isCefr(overall)) row.current_cefr_estimate = overall;
        meta.placement = {
          overall_level: isCefr(overall) ? overall : null,
          per_skill: perSkill,
          completed_at: new Date().toISOString(),
        };
        row.metadata = meta;
      }

      if (goalIn) {
        const keys = Array.isArray(goalIn.goal_keys)
          ? (goalIn.goal_keys as unknown[]).map((k) => toText(k, 40)).filter(Boolean).slice(0, 12)
          : [];
        if (keys.length) row.goal_keys = keys;
        const target = toText(goalIn.target_cefr, 8).toUpperCase();
        if (isCefr(target)) row.target_cefr = target;
        const mins = Number(goalIn.daily_time_minutes);
        if (Number.isFinite(mins) && mins >= 5 && mins <= 240) row.daily_time_minutes = Math.round(mins);
      }

      const { error } = await sb
        .from("learner_language_goals")
        .upsert(row, { onConflict: "user_id,language_id" });
      if (error) return json(500, { error: "Failed to save onboarding", details: error.message });

      const savedPlacement = (row.metadata as Record<string, unknown>)?.placement as Record<string, unknown> | undefined;
      return json(200, {
        ok: true,
        placement_done: !!(savedPlacement && savedPlacement.completed_at),
        goal_set: Array.isArray(row.goal_keys) && (row.goal_keys as unknown[]).length > 0,
        cefr_estimate: row.current_cefr_estimate ?? null,
        target_cefr: row.target_cefr ?? null,
        goal_keys: row.goal_keys ?? [],
        daily_time_minutes: row.daily_time_minutes ?? 40,
      });
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

    // Tier C #15 — Real content recommendation. Given learner interests +
    // their current CEFR + time-per-session preference, AI returns 6-10
    // pieces of authentic English content (books, articles, podcasts,
    // YouTube channels, films, newsletters) calibrated to comprehensible
    // input territory (level minus 0 to +1). Each item: type, title,
    // creator, why_for_you, where_to_find (no concrete URLs — those rot;
    // we surface search hints), difficulty_note, and 1-line first-step.
    if (req.method === "POST" && route === "/ai/content-recommend") {
      const body = await parseBody(req);
      const interestsRaw = (body as Record<string, unknown>).interests;
      const interests = Array.isArray(interestsRaw)
        ? (interestsRaw as unknown[]).map((i) => toText(i, 60)).filter(Boolean).slice(0, 8)
        : [];
      const sessionMinutes = Math.max(5, Math.min(180, Number((body as Record<string, unknown>).session_minutes) || 20));
      const formatsRaw = (body as Record<string, unknown>).formats;
      const requestedFormats = Array.isArray(formatsRaw)
        ? (formatsRaw as unknown[]).map((f) => toText(f, 24).toLowerCase()).filter(Boolean)
        : [];
      const cefr = await buildCefrSnapshot(sb, scope.languageId, auth.userId).catch(() => null);
      const overallLevel = cefr?.overall.level ?? "B1";

      const { data: result, status: aiStatus, error: aiError, provider } = await callEnglishAIWithStatus<{
        items?: unknown;
        immersion_tip?: unknown;
      }>(
        {
          systemPrompt:
            "You are an English-immersion librarian recommending AUTHENTIC, real-world English content (NOT learner-graded readers). The learner's CEFR level and interests are given. Pick 6-10 pieces calibrated to their comprehensible-input zone (current level to one step above). Mix formats unless the learner restricted formats. Avoid suggesting specific URLs (they rot); instead give precise search hints (e.g., 'search YouTube for: Numberphile + topology'). Return strict JSON: {items: array of {type: 'book'|'article'|'podcast'|'youtube'|'film'|'newsletter'|'tv_show', title: exact title, creator: author/host/channel/director, why_for_you: 1-2 sentence connection to the learner's interests + level, where_to_find: 1-line search hint or platform name (no full URL), difficulty_note: 1 line on what makes it appropriate (vocabulary density, accent, pacing), first_step: 1 specific 5-minute starter task (e.g. 'read the first chapter and underline 5 unfamiliar phrasal verbs')}, immersion_tip: 1-2 sentences on how to extract the most language gain from this batch}.",
          userPayload: JSON.stringify({
            cefr_level: overallLevel,
            interests: interests.length ? interests : ["general curiosity"],
            session_minutes: sessionMinutes,
            preferred_formats: requestedFormats.length ? requestedFormats : null,
          }),
          temperature: 0.7,
        },
        { items: [], immersion_tip: "" },
      );

      const allowedTypes = ["book", "article", "podcast", "youtube", "film", "newsletter", "tv_show"];
      const items = Array.isArray(result.items)
        ? (result.items as unknown[])
            .filter((i): i is Record<string, unknown> => !!i && typeof i === "object" && !Array.isArray(i))
            .map((i) => ({
              type: allowedTypes.includes(String(i.type ?? "").toLowerCase()) ? String(i.type).toLowerCase() : "article",
              title: toText(i.title, 200),
              creator: toText(i.creator, 200),
              why_for_you: toText(i.why_for_you, 600),
              where_to_find: toText(i.where_to_find, 200),
              difficulty_note: toText(i.difficulty_note, 240),
              first_step: toText(i.first_step, 320),
            }))
            .filter((i) => i.title && i.why_for_you)
            .slice(0, 12)
        : [];

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        ai_provider: provider,
        ai_error: aiError ?? null,
        cefr_level: overallLevel,
        interests,
        session_minutes: sessionMinutes,
        items,
        immersion_tip: toText(result.immersion_tip, 600),
        generated_at: new Date().toISOString(),
      });
    }

    // Tier C #16 — Live caption shadowing. Paste a transcript (or any
    // English passage); AI splits it into shadowing CHUNKS calibrated for
    // the learner's level: 4-7 seconds each, with a focus tip per chunk
    // (intonation, linking, weak forms, rhythm). The frontend uses browser
    // SpeechSynthesis to read each chunk; the learner shadows aloud and
    // self-rates. Stateless: no audio storage server-side.
    if (req.method === "POST" && route === "/ai/shadowing-prep") {
      const body = await parseBody(req);
      const sourceText = toText((body as Record<string, unknown>).source_text, 4000);
      const targetLevel = toText((body as Record<string, unknown>).target_level, 8).toUpperCase() || "B1";
      const accent = toText((body as Record<string, unknown>).accent, 24).toLowerCase() || "neutral";
      if (!["A1", "A2", "B1", "B2", "C1", "C2"].includes(targetLevel)) {
        return json(400, { error: "target_level must be one of A1 A2 B1 B2 C1 C2" });
      }
      if (!sourceText || sourceText.length < 30) {
        return json(400, { error: "source_text is required (min 30 characters)" });
      }

      const { data: result, status: aiStatus, error: aiError, provider } = await callEnglishAIWithStatus<{
        chunks?: unknown;
        global_tips?: unknown;
        warm_up?: unknown;
      }>(
        {
          systemPrompt:
            "You are an English pronunciation and prosody coach preparing a passage for SHADOWING practice. Split the source into 6-12 chunks of 4-7 seconds spoken time (~10-22 words each, naturally bounded by clauses or breath groups — never mid-phrase). For each chunk pick the SINGLE most useful pronunciation focus for a learner at the target level. Return strict JSON: {chunks: array of {index: 0-based, text: the exact words to shadow (preserve casing/punctuation as it should be spoken), focus_label: 1-3 word skill name (e.g. 'linking', 'weak forms', 'rising intonation', 'sentence stress', 'consonant clusters'), focus_explanation: 1 sentence telling the learner exactly what to do with their voice on THIS chunk, watch_for: 1-3 specific words/sounds in the chunk to nail}, warm_up: 1-2 sentence overall framing for the practice session, global_tips: array (max 3) of session-wide reminders}.",
          userPayload: JSON.stringify({
            source_text: sourceText,
            target_level: targetLevel,
            accent_hint: accent,
          }),
          temperature: 0.4,
        },
        { chunks: [], global_tips: [], warm_up: "" },
      );

      const chunks = Array.isArray(result.chunks)
        ? (result.chunks as unknown[])
            .filter((c): c is Record<string, unknown> => !!c && typeof c === "object" && !Array.isArray(c))
            .map((c, idx) => ({
              index: Number.isFinite(Number(c.index)) ? Number(c.index) : idx,
              text: toText(c.text, 600),
              focus_label: toText(c.focus_label, 80),
              focus_explanation: toText(c.focus_explanation, 400),
              watch_for: Array.isArray(c.watch_for)
                ? (c.watch_for as unknown[]).map((w) => toText(w, 80)).filter(Boolean).slice(0, 5)
                : [],
            }))
            .filter((c) => c.text && c.focus_label)
            .slice(0, 14)
        : [];

      const globalTips = Array.isArray(result.global_tips)
        ? (result.global_tips as unknown[]).map((t) => toText(t, 320)).filter(Boolean).slice(0, 4)
        : [];

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        ai_provider: provider,
        ai_error: aiError ?? null,
        target_level: targetLevel,
        accent,
        source_text_length: sourceText.length,
        warm_up: toText(result.warm_up, 400),
        chunks,
        global_tips: globalTips,
        generated_at: new Date().toISOString(),
      });
    }

    // Tier A #7 — Adaptive CEFR placement test. Stateless multi-round flow:
    //   round 0  → POST {} → AI returns 4 calibration questions targeting
    //                          a guess level (start at B1) across 4 skills
    //   round N  → POST {answers, history} → AI grades + either generates
    //                          another round narrower in band, OR finalizes
    //                          with per-skill estimates + overall CEFR.
    // Frontend tracks the conversation state in component memory; backend
    // is purely a function of the request body. Hard cap of 3 rounds (12 Q).
    if (req.method === "POST" && route === "/ai/placement-test") {
      const body = await parseBody(req);
      const round = Math.max(0, Math.min(3, Number((body as Record<string, unknown>).round) || 0));
      const historyRaw = (body as Record<string, unknown>).history;
      const history = Array.isArray(historyRaw)
        ? (historyRaw as unknown[])
            .filter((h): h is Record<string, unknown> => !!h && typeof h === "object" && !Array.isArray(h))
            .slice(0, 8)
        : [];
      const finalize = Boolean((body as Record<string, unknown>).finalize) || round >= 3;

      if (!finalize) {
        // Generate next round of questions.
        const { data: result, status: aiStatus, error: aiError, provider } = await callEnglishAIWithStatus<{
          target_level_guess?: unknown;
          questions?: unknown;
          rationale?: unknown;
        }>(
          {
            systemPrompt:
              "You are an adaptive CEFR placement examiner. Based on the conversation history (prior questions + the learner's answers, possibly empty for round 0), produce the NEXT round of EXACTLY 4 short questions, ONE per skill (reading, writing, listening, grammar). For listening, give a short script the frontend will speak via TTS plus the question about it; for reading, give a 2-3 sentence passage + question; for writing, give a sentence-completion or short rewrite prompt; for grammar, give a multiple-choice question with 4 options. Calibrate difficulty: round 0 target B1; subsequent rounds narrow in band based on prior performance. Return strict JSON: {target_level_guess: CEFR letter+digit (e.g. 'B1'), rationale: 1 sentence on why this band, questions: array of EXACTLY 4 objects {skill: 'reading'|'writing'|'listening'|'grammar', prompt: the question/instruction, passage: optional supporting text or listening script, choices: optional array of 2-4 strings (only for grammar MCQ), expected_answer_pattern: 1 line describing what 'correct' looks like (used for AI grading next round)}}.",
            userPayload: JSON.stringify({ round, history }),
            temperature: 0.5,
          },
          { target_level_guess: "B1", questions: [], rationale: "" },
        );

        const allowed = ["reading", "writing", "listening", "grammar"];
        const questions = Array.isArray(result.questions)
          ? (result.questions as unknown[])
              .filter((q): q is Record<string, unknown> => !!q && typeof q === "object" && !Array.isArray(q))
              .map((q) => ({
                skill: allowed.includes(String(q.skill ?? "").toLowerCase()) ? String(q.skill).toLowerCase() : "reading",
                prompt: toText(q.prompt, 600),
                passage: toText(q.passage, 1200),
                choices: Array.isArray(q.choices)
                  ? (q.choices as unknown[]).map((c) => toText(c, 200)).filter(Boolean).slice(0, 5)
                  : [],
                expected_answer_pattern: toText(q.expected_answer_pattern, 400),
              }))
              .filter((q) => q.prompt)
              .slice(0, 4)
          : [];

        return json(200, {
          ok: true,
          ai_available: isEnglishAIConfigured(),
          ai_status: aiStatus,
          ai_provider: provider,
          ai_error: aiError ?? null,
          finalized: false,
          round,
          target_level_guess: toText(result.target_level_guess, 8) || "B1",
          rationale: toText(result.rationale, 400),
          questions,
          generated_at: new Date().toISOString(),
        });
      }

      // Finalize: AI grades the full transcript + emits a CEFR estimate.
      const { data: result, status: aiStatus, error: aiError, provider } = await callEnglishAIWithStatus<{
        overall_level?: unknown;
        per_skill?: unknown;
        narrative?: unknown;
        next_steps?: unknown;
      }>(
        {
          systemPrompt:
            "You are a CEFR placement examiner finalizing a learner's level after a short adaptive interview. Read the full history (questions, the learner's answers, expected_answer_patterns) and produce a calibrated assessment. Be honest — a learner who clearly struggles at B1 should land at A2, not B1. Return strict JSON: {overall_level: 'A1'|'A2'|'B1'|'B2'|'C1'|'C2', per_skill: object with keys reading, writing, listening, grammar — each value an object {level, evidence: 1 line citing the answer that anchored this estimate}, narrative: 2-3 sentence summary of the learner's profile, next_steps: array (max 4) of concrete recommendations for closing the gap to the next CEFR band}.",
          userPayload: JSON.stringify({ history }),
          temperature: 0.3,
        },
        { overall_level: "B1", per_skill: {}, narrative: "", next_steps: [] },
      );

      const validLevels = ["A1", "A2", "B1", "B2", "C1", "C2"];
      const overallLevel = validLevels.includes(toText(result.overall_level, 8).toUpperCase())
        ? toText(result.overall_level, 8).toUpperCase()
        : "B1";

      const perSkillRaw = (result.per_skill && typeof result.per_skill === "object" && !Array.isArray(result.per_skill))
        ? (result.per_skill as Record<string, unknown>)
        : {};
      const skills = ["reading", "writing", "listening", "grammar"] as const;
      const perSkill: Record<string, { level: string; evidence: string }> = {};
      for (const s of skills) {
        const row = perSkillRaw[s];
        if (row && typeof row === "object" && !Array.isArray(row)) {
          const r = row as Record<string, unknown>;
          const lv = toText(r.level, 8).toUpperCase();
          perSkill[s] = {
            level: validLevels.includes(lv) ? lv : overallLevel,
            evidence: toText(r.evidence, 400),
          };
        } else {
          perSkill[s] = { level: overallLevel, evidence: "" };
        }
      }

      const nextSteps = Array.isArray(result.next_steps)
        ? (result.next_steps as unknown[]).map((n) => toText(n, 320)).filter(Boolean).slice(0, 4)
        : [];

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        ai_provider: provider,
        ai_error: aiError ?? null,
        finalized: true,
        overall_level: overallLevel,
        per_skill: perSkill,
        narrative: toText(result.narrative, 1200),
        next_steps: nextSteps,
        generated_at: new Date().toISOString(),
      });
    }

    // Tier A #8 — Personal AI tutor with cross-session memory.
    // Stateless backend; the frontend persists chat history + a list of
    // "memories" (facts the learner has chosen to remember about themselves)
    // in localStorage and passes both on every turn. The AI uses memories
    // as context AND proposes new memories to add — the learner approves.
    // This avoids a new RLS-gated table while still giving genuine
    // cross-session continuity for as long as the browser holds storage.
    if (req.method === "POST" && route === "/ai/tutor-chat") {
      const body = await parseBody(req);
      const messagesRaw = (body as Record<string, unknown>).messages;
      const memoriesRaw = (body as Record<string, unknown>).memories;

      const messages = Array.isArray(messagesRaw)
        ? (messagesRaw as unknown[])
            .filter((m): m is Record<string, unknown> => !!m && typeof m === "object" && !Array.isArray(m))
            .map((m) => ({
              role: ["user", "assistant"].includes(String(m.role ?? "")) ? String(m.role) : "user",
              content: toText(m.content, 4000),
            }))
            .filter((m) => m.content)
            .slice(-12)
        : [];
      if (messages.length === 0) {
        return json(400, { error: "messages must contain at least one entry with role/content" });
      }

      const memories = Array.isArray(memoriesRaw)
        ? (memoriesRaw as unknown[])
            .filter((m): m is Record<string, unknown> => !!m && typeof m === "object" && !Array.isArray(m))
            .map((m) => ({
              id: toText(m.id, 64),
              text: toText(m.text, 600),
              kind: toText(m.kind, 24),
            }))
            .filter((m) => m.text)
            .slice(0, 30)
        : [];

      const cefr = await buildCefrSnapshot(sb, scope.languageId, auth.userId).catch(() => null);

      const { data: result, status: aiStatus, error: aiError, provider } = await callEnglishAIWithStatus<{
        reply?: unknown;
        suggested_memories?: unknown;
        suggested_actions?: unknown;
      }>(
        {
          systemPrompt:
            "You are an English study tutor with personal continuity. The learner's message history and a list of MEMORIES (facts they previously asked you to remember about them — goals, preferences, struggles, wins, context) are provided. Use the memories naturally; do NOT recite them. Reply in 1-3 paragraphs, warm but concise, in the same language they wrote in (default English). When something in the conversation looks worth remembering long-term — a stated goal, a recurring weakness, a deadline, a preference about how they want to be coached, a notable win — propose 1-3 NEW memories to add. Do NOT suggest memories that duplicate what's already saved. Optionally suggest 1-2 short next-actions with relative routes ('/reading', '/writing', '/grammar', '/vocabulary', '/speaking', '/listening', '/'). Return strict JSON: {reply: the assistant message, suggested_memories: array (max 3) of {kind: 'goal'|'preference'|'struggle'|'win'|'context'|'deadline', text: 1-sentence fact in second person ('You prefer...', 'You aim to...')}, suggested_actions: array (max 2) of {label: 3-5 word CTA, route: relative URL, why: 1 short sentence}}.",
          userPayload: JSON.stringify({
            cefr_level: cefr?.overall.level ?? "B1",
            existing_memories: memories,
            messages,
          }),
          temperature: 0.6,
        },
        { reply: "", suggested_memories: [], suggested_actions: [] },
      );

      const allowedKinds = ["goal", "preference", "struggle", "win", "context", "deadline"];
      const suggestedMemories = Array.isArray(result.suggested_memories)
        ? (result.suggested_memories as unknown[])
            .filter((m): m is Record<string, unknown> => !!m && typeof m === "object" && !Array.isArray(m))
            .map((m) => ({
              kind: allowedKinds.includes(String(m.kind ?? "").toLowerCase()) ? String(m.kind).toLowerCase() : "context",
              text: toText(m.text, 320),
            }))
            .filter((m) => m.text)
            .slice(0, 3)
        : [];

      const suggestedActions = Array.isArray(result.suggested_actions)
        ? (result.suggested_actions as unknown[])
            .filter((a): a is Record<string, unknown> => !!a && typeof a === "object" && !Array.isArray(a))
            .map((a) => ({
              label: toText(a.label, 120),
              route: toText(a.route, 200) || "/",
              why: toText(a.why, 240),
            }))
            .filter((a) => a.label)
            .slice(0, 3)
        : [];

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        ai_provider: provider,
        ai_error: aiError ?? null,
        reply: toText(result.reply, 4000),
        suggested_memories: suggestedMemories,
        suggested_actions: suggestedActions,
        generated_at: new Date().toISOString(),
      });
    }

    // Tier B #9 — Pronunciation analysis (browser-mediated). The frontend
    // captures the learner reading the target text aloud via Web Speech
    // Recognition (Chrome/Edge) and sends BOTH the canonical target and
    // what the recognizer transcribed. AI infers likely pronunciation
    // problems from divergences (substitutions, omissions, run-ons) and
    // gives per-word + prosodic feedback calibrated to common L1
    // interference patterns the learner can self-correct.
    if (req.method === "POST" && route === "/ai/pronunciation-feedback") {
      const body = await parseBody(req);
      const targetText = toText((body as Record<string, unknown>).target_text, 2000);
      const recognized = toText((body as Record<string, unknown>).recognized_text, 2000);
      const userL1 = toText((body as Record<string, unknown>).user_l1, 60);
      const targetLevel = toText((body as Record<string, unknown>).target_level, 8).toUpperCase() || "B1";
      if (!targetText || targetText.length < 10) {
        return json(400, { error: "target_text is required (min 10 chars)" });
      }
      if (!recognized) {
        return json(400, { error: "recognized_text is required (the speech-recognition transcript)" });
      }
      if (!["A1", "A2", "B1", "B2", "C1", "C2"].includes(targetLevel)) {
        return json(400, { error: "target_level must be one of A1 A2 B1 B2 C1 C2" });
      }

      const { data: result, status: aiStatus, error: aiError, provider } = await callEnglishAIWithStatus<{
        accuracy_score?: unknown;
        per_word?: unknown;
        prosody_notes?: unknown;
        l1_interference?: unknown;
        retry_priority?: unknown;
      }>(
        {
          systemPrompt:
            "You are an English pronunciation coach analysing a learner's spoken attempt. You receive (a) the canonical target text, (b) what a speech recognizer heard, (c) optional learner L1, (d) target CEFR level. Compare carefully — recognizer errors include substitutions ('three'→'tree'), omissions, and run-ons (worst-case word boundaries). Diagnose the likely pronunciation issues (specific phonemes, stress placement, weak forms, linking) — NOT spelling. Return strict JSON: {accuracy_score: integer 0-100 (rough overall match), per_word: array of {target_word, what_was_heard, likely_issue: 1 line on the phonetic problem, fix_tip: 1 line on how to articulate it}, prosody_notes: array (max 3) of observations on stress / rhythm / linking based on the divergence pattern, l1_interference: array (max 2) of common L1-driven issues likely behind these errors (only if user_l1 hints at it; else empty), retry_priority: 1 sentence telling the learner the SINGLE most useful thing to fix on the next attempt}.",
          userPayload: JSON.stringify({
            target_text: targetText,
            recognized_text: recognized,
            user_l1: userL1 || null,
            target_level: targetLevel,
          }),
          temperature: 0.3,
        },
        { accuracy_score: 0, per_word: [], prosody_notes: [], l1_interference: [], retry_priority: "" },
      );

      const accuracyScore = Math.max(0, Math.min(100, Number(result.accuracy_score) || 0));
      const perWord = Array.isArray(result.per_word)
        ? (result.per_word as unknown[])
            .filter((w): w is Record<string, unknown> => !!w && typeof w === "object" && !Array.isArray(w))
            .map((w) => ({
              target_word: toText(w.target_word, 80),
              what_was_heard: toText(w.what_was_heard, 80),
              likely_issue: toText(w.likely_issue, 240),
              fix_tip: toText(w.fix_tip, 320),
            }))
            .filter((w) => w.target_word && w.likely_issue)
            .slice(0, 12)
        : [];
      const prosodyNotes = Array.isArray(result.prosody_notes)
        ? (result.prosody_notes as unknown[]).map((n) => toText(n, 320)).filter(Boolean).slice(0, 4)
        : [];
      const l1Interference = Array.isArray(result.l1_interference)
        ? (result.l1_interference as unknown[]).map((n) => toText(n, 320)).filter(Boolean).slice(0, 3)
        : [];

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        ai_provider: provider,
        ai_error: aiError ?? null,
        target_text: targetText,
        recognized_text: recognized,
        user_l1: userL1 || null,
        target_level: targetLevel,
        accuracy_score: accuracyScore,
        per_word: perWord,
        prosody_notes: prosodyNotes,
        l1_interference: l1Interference,
        retry_priority: toText(result.retry_priority, 400),
        generated_at: new Date().toISOString(),
      });
    }

    // Tier B #4 — Voice conversation partner. Stateless turn endpoint:
    // frontend captures the learner's spoken turn via Web Speech
    // Recognition, sends transcript + scenario + history; AI replies with
    // (a) the partner's spoken response (frontend speaks via TTS),
    // (b) one gentle correction (only if there's a clear error worth
    // flagging — otherwise empty string), and (c) one suggested follow-up
    // the learner could say next, to prevent dead-end conversations.
    // Stays calibrated to the learner's CEFR level so it doesn't outpace
    // them.
    if (req.method === "POST" && route === "/ai/voice-conversation-turn") {
      const body = await parseBody(req);
      const messagesRaw = (body as Record<string, unknown>).messages;
      const scenario = toText((body as Record<string, unknown>).scenario, 240);
      const personaName = toText((body as Record<string, unknown>).persona_name, 60);
      const targetLevel = toText((body as Record<string, unknown>).target_level, 8).toUpperCase();

      const messages = Array.isArray(messagesRaw)
        ? (messagesRaw as unknown[])
            .filter((m): m is Record<string, unknown> => !!m && typeof m === "object" && !Array.isArray(m))
            .map((m) => ({
              role: ["user", "assistant"].includes(String(m.role ?? "")) ? String(m.role) : "user",
              content: toText(m.content, 2000),
            }))
            .filter((m) => m.content)
            .slice(-12)
        : [];
      if (messages.length === 0) {
        return json(400, { error: "messages must contain at least one entry with role/content" });
      }

      const cefr = await buildCefrSnapshot(sb, scope.languageId, auth.userId).catch(() => null);
      const effectiveLevel = ["A1", "A2", "B1", "B2", "C1", "C2"].includes(targetLevel)
        ? targetLevel
        : cefr?.overall.level ?? "B1";

      const { data: result, status: aiStatus, error: aiError, provider } = await callEnglishAIWithStatus<{
        partner_reply?: unknown;
        correction?: unknown;
        suggested_user_reply?: unknown;
        scenario_progress?: unknown;
      }>(
        {
          systemPrompt:
            "You are a conversational English-practice partner playing a defined PERSONA in a specific SCENARIO. Speak as that persona — natural, human, calibrated to the learner's CEFR level (do NOT use vocabulary or sentence length above level+1). Keep your turn to 1-3 short sentences (under 60 words) so it sounds spoken, not written. After your reply, decide: did the learner's last message contain a clear English mistake (grammar, word choice, awkward phrasing) worth flagging? If yes, give ONE brief correction (the original phrase, the better version, 1-line why). If their message was fine, leave correction empty. Then suggest ONE concrete follow-up the learner could try next ('You could ask...', 'Try saying...') so the conversation doesn't stall. Return strict JSON: {partner_reply: your spoken response (no stage directions), correction: '' or {original, better, why}, suggested_user_reply: 1 short sentence the learner could say back, scenario_progress: 1 short note on whether the scenario is still going or naturally winding down}.",
          userPayload: JSON.stringify({
            scenario: scenario || "an everyday English conversation",
            persona_name: personaName || "Alex",
            cefr_level: effectiveLevel,
            messages,
          }),
          temperature: 0.7,
        },
        {
          partner_reply: "",
          correction: "",
          suggested_user_reply: "",
          scenario_progress: "",
        },
      );

      let correctionOut: { original: string; better: string; why: string } | null = null;
      const corrRaw = result.correction;
      if (corrRaw && typeof corrRaw === "object" && !Array.isArray(corrRaw)) {
        const c = corrRaw as Record<string, unknown>;
        const original = toText(c.original, 320);
        const better = toText(c.better, 320);
        const why = toText(c.why, 320);
        if (original && better) correctionOut = { original, better, why };
      }

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        ai_provider: provider,
        ai_error: aiError ?? null,
        cefr_level: effectiveLevel,
        partner_reply: toText(result.partner_reply, 1200),
        correction: correctionOut,
        suggested_user_reply: toText(result.suggested_user_reply, 320),
        scenario_progress: toText(result.scenario_progress, 240),
        generated_at: new Date().toISOString(),
      });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    console.error(JSON.stringify({
      event: "english_hub_request_failed",
      request_id: requestId,
      error_name: error instanceof Error ? error.name : "UnknownError",
      error: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
      duration_ms: Date.now() - startedAt,
    }));
    return new Response(JSON.stringify({
      error: "English service request failed",
      code: "english_service_unavailable",
      request_id: requestId,
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
        ...corsHeaders,
      },
    });
  }
});
