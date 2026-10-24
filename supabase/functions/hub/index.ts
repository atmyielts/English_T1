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
  CEFR_ORDER,
  type Cefr,
  currentStreak,
  dailyCounts,
  isCefr as isTodayCefr,
  type LevelStatus,
  levelStatus,
  longestStreak,
  matchesGoals,
  nextCefr,
  pickFixes,
  practiceLevel,
  planToday,
  skillProgress,
  TODAY_SKILLS,
  topicWeek,
  type TodaySkill,
  type TodayTask,
  weekStrip,
} from "../_shared/english-today.ts";
import { loadPracticeWords } from "../_shared/english-words.ts";
import { checkActivityAccess } from "../_shared/english-allowance.ts";
import { checkReviewAnswer, parseReviewPayload, publicReviewPayload, RETIRED_BOX, scheduleAfterAnswer } from "../_shared/english-review.ts";
import { topicFromSubskill } from "../_shared/english-mistakes.ts";
import { mergeReminderSettings, readReminderSettings, REMINDER_HOURS } from "../_shared/english-reminders.ts";
import { isReminderWorker, runReminderCycle } from "./reminders.ts";
import { appendLevelHistory, levelCheckStatus, perSkillLevels, readLevelHistory } from "../_shared/english-levels.ts";
import { handleCertificateRoute, handlePublicCertificate, isPublicCertificateRoute } from "./certificate.ts";
import { measurementMethod, testResultRecord } from "../_shared/english-certificate.ts";

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

/**
 * Mistakes for Review. Grammar mistakes are grouped by topic (all the different
 * sentences where the learner made the same kind of error) and linked to the
 * lesson that practises it; other mistakes are listed one by one.
 */
const TUTOR_MEMORY_KINDS = ["goal", "preference", "struggle", "win", "context", "deadline"];
type TutorMemory = { id: string; kind: string; text: string; added_at: string };

const loadTutorMemories = async (sb: any, userId: string, languageId: string): Promise<TutorMemory[]> => {
  const { data } = await sb.from("learner_language_goals")
    .select("metadata")
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .maybeSingle();
  const raw = ((data as Record<string, unknown> | null)?.metadata as Record<string, unknown> | undefined)?.tutor_memories;
  return (Array.isArray(raw) ? raw : [])
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object" && !Array.isArray(m))
    .map((m) => ({ id: String(m.id ?? ""), kind: String(m.kind ?? "context"), text: String(m.text ?? ""), added_at: String(m.added_at ?? "") }))
    .filter((m) => m.id && m.text)
    .slice(-30);
};

const saveTutorMemories = async (sb: any, userId: string, languageId: string, memories: TutorMemory[]): Promise<void> => {
  const { data } = await sb.from("learner_language_goals")
    .select("metadata")
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .maybeSingle();
  const meta = ((data as Record<string, unknown> | null)?.metadata ?? {}) as Record<string, unknown>;
  const row = { user_id: userId, language_id: languageId, metadata: { ...meta, tutor_memories: memories.slice(-30) } };
  const { error } = await sb.from("learner_language_goals").upsert(row, { onConflict: "user_id,language_id" });
  if (error) throw new Error(`Failed to save tutor memory: ${error.message}`);
};

/** A compact, factual picture of the learner for the tutor: no invented numbers. */
const buildTutorProfile = async (sb: any, userId: string, languageId: string) => {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [goalRes, errorsRes, attemptsRes, words] = await Promise.all([
    sb.from("learner_language_goals")
      .select("current_cefr_estimate, target_cefr, goal_keys, daily_time_minutes, metadata")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .maybeSingle(),
    sb.from("learner_language_errors")
      .select("service_key, subskill_key, error_type, error_frequency, mastery_status, last_seen_at")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .in("mastery_status", ["open", "reopened"])
      .gte("last_seen_at", since)
      .order("error_frequency", { ascending: false })
      .limit(40),
    sb.from("learning_attempts")
      .select("service_key, correctness_ratio, overall_score, submitted_at, content_item_id")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(8),
    loadPracticeWords(sb, userId, languageId, 5).catch(() => []),
  ]);
  const goal = (goalRes.data ?? {}) as Record<string, unknown>;
  const placement = ((goal.metadata as Record<string, unknown> | undefined)?.placement ?? {}) as Record<string, unknown>;
  const perSkillRaw = (placement.per_skill ?? {}) as Record<string, unknown>;
  const perSkill: Record<string, string> = {};
  for (const [skill, entry] of Object.entries(perSkillRaw)) {
    const level = typeof entry === "string" ? entry : (entry as Record<string, unknown> | undefined)?.level;
    if (typeof level === "string") perSkill[skill] = level;
  }
  const topics = new Map<string, { count: number; examples: string[] }>();
  for (const row of (errorsRes.data ?? []) as Array<Record<string, unknown>>) {
    const topic = topicFromSubskill(String(row.subskill_key ?? "")) ?? String(row.subskill_key ?? "other");
    const entry = topics.get(topic) ?? { count: 0, examples: [] };
    entry.count += Number(row.error_frequency ?? 1);
    if (entry.examples.length < 2) entry.examples.push(String(row.error_type ?? "").slice(0, 120));
    topics.set(topic, entry);
  }
  return {
    level: goal.current_cefr_estimate ?? null,
    level_by_skill: perSkill,
    target_level: goal.target_cefr ?? null,
    goals: Array.isArray(goal.goal_keys) ? goal.goal_keys : [],
    daily_minutes: goal.daily_time_minutes ?? null,
    recurring_mistakes: [...topics.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 4)
      .map(([topic, entry]) => ({ topic, times: entry.count, examples: entry.examples })),
    recent_results: ((attemptsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const score = Number(row.correctness_ratio ?? row.overall_score);
      return { skill: String(row.service_key ?? ""), score: Number.isFinite(score) ? Math.round(score * 100) : null, when: String(row.submitted_at ?? "").slice(0, 10) };
    }),
    words_to_practise: words.map((word) => word.word),
  };
};

/** How the learner is doing at their own level in each skill (scored attempts, newest first). */
const statusesByLevel = (
  attempts: AttemptRow[],
  levelById: Map<string, Cefr | null>,
  levelFor: (skill: TodaySkill) => Cefr | null,
): Record<TodaySkill, LevelStatus> => {
  const out = {} as Record<TodaySkill, LevelStatus>;
  for (const skill of TODAY_SKILLS) {
    const level = levelFor(skill);
    const scores = attempts
      .filter((attempt) => attempt.skill === skill && attempt.score !== null && level && levelById.get(attempt.content_item_id) === level)
      .map((attempt) => attempt.score as number);
    out[skill] = levelStatus(scores);
  }
  return out;
};

const groupMistakes = (
  rows: Array<Record<string, unknown>>,
  units: Array<Record<string, unknown>>,
  grammarLevel: string | null,
) => {
  const target = CEFR_ORDER.indexOf((grammarLevel ?? "B1") as Cefr);
  const lessonFor = (topic: string) => {
    const unit = units
      .filter((entry) => entry.focus_area === topic)
      .sort((a, b) => Math.abs(CEFR_ORDER.indexOf(a.level as Cefr) - target) - Math.abs(CEFR_ORDER.indexOf(b.level as Cefr) - target))[0];
    return unit ? { slug: String(unit.slug), title: String(unit.title ?? "") } : null;
  };
  const groups = new Map<string, {
    key: string; topic: string | null; skill: string; count: number; examples: string[];
    status: "open" | "improving"; last_seen_at: string; lesson: { slug: string; title: string } | null;
  }>();
  for (const row of rows) {
    const topic = topicFromSubskill(String(row.subskill_key ?? ""));
    const example = String(row.error_type ?? "").trim();
    if (!example) continue;
    const key = topic ? `topic:${topic}` : `one:${String(row.service_key)}:${example}`;
    const status = row.mastery_status === "improving" ? "improving" : "open";
    const group = groups.get(key) ?? {
      key,
      topic,
      skill: topic ? "grammar" : String(row.service_key ?? ""),
      count: 0,
      examples: [],
      status,
      last_seen_at: String(row.last_seen_at ?? ""),
      lesson: topic ? lessonFor(topic) : null,
    };
    group.count += Number(row.error_frequency ?? 1);
    // For a topic, show only the learner's own sentences ("wrong → right"), not lesson descriptions.
    const isLearnerSentence = !topic || example.includes("→");
    if (isLearnerSentence && group.examples.length < 3 && !group.examples.includes(example)) group.examples.push(example);
    if (status === "open") group.status = "open";
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "open" ? -1 : 1) || b.count - a.count)
    .slice(0, 12);
};

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

    // === Reminder worker (pg_cron, private secret; no learner session) ===
    if (req.method === "POST" && extractRoute(new URL(req.url), routeMarker) === "/internal/reminders") {
      if (!(await isReminderWorker(sb, req))) return json(401, { error: "Unauthorized" });
      const body = await parseBody(req) as Record<string, unknown>;
      const workerScope = await resolveLanguageScope(sb, "en");
      const result = await runReminderCycle({
        sb,
        languageId: workerScope.languageId,
        supabaseUrl,
        serviceRoleKey,
        appUrl: Deno.env.get("ENGLISH_APP_URL") ?? "https://english.schood.online",
        dryRun: body.dry_run === true,
        // A dry run may pretend it is another time, to preview messages.
        now: body.dry_run === true && typeof body.now === "string" && Number.isFinite(Date.parse(body.now)) ? new Date(body.now) : undefined,
        onlyUserIds: Array.isArray(body.user_ids) ? body.user_ids.map(String).slice(0, 20) : undefined,
      });
      console.log(JSON.stringify({ event: "english_reminder_cycle", hour: result.hour, considered: result.considered, sent: result.sent.length }));
      return json(200, { ok: true, ...result });
    }

    // === Public certificate lookup (anyone with the link; no learner session) ===
    const publicRoute = extractRoute(new URL(req.url), routeMarker);
    if (isPublicCertificateRoute(req.method, publicRoute)) return await handlePublicCertificate(sb, publicRoute);

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

    const certificateResponse = await handleCertificateRoute({ sb, req, route, userId: auth.userId, languageId: scope.languageId });
    if (certificateResponse) return certificateResponse;

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

    if (req.method === "GET" && (route === "/today" || route === "/catalog" || route === "/history" || route === "/progress" || route === "/week")) {
      const skillFilter = toText(url.searchParams.get("skill"), 24).toLowerCase();
      const wantSkill = (TODAY_SKILLS as readonly string[]).includes(skillFilter) ? skillFilter : null;

      const loadCatalog = async (): Promise<CatalogItem[]> => {
        let query = sb
          .from("learning_content_registry_items")
          .select("id, service_key, source_ref, title, cefr_level, estimated_minutes, difficulty, tags")
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
            tags: Array.isArray(row.tags) ? (row.tags as unknown[]).map(String).slice(0, 12) : [],
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
        const [catalogItems, attempts, goalRes] = await Promise.all([
          loadCatalog(),
          loadAttempts(3650, 2000),
          sb.from("learner_language_goals").select("goal_keys").eq("user_id", auth.userId).eq("language_id", scope.languageId).maybeSingle(),
        ]);
        const goalKeys = Array.isArray(goalRes.data?.goal_keys) ? (goalRes.data!.goal_keys as unknown[]).map(String) : [];
        const items = catalogItems.map((entry) => ({ ...entry, goal_match: matchesGoals(entry, goalKeys) }));
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

      if (route === "/week") {
        const [items, attemptRows, goalRes] = await Promise.all([
          loadCatalog(),
          loadAttempts(120, 800),
          sb.from("learner_language_goals")
            .select("current_cefr_estimate, metadata")
            .eq("user_id", auth.userId)
            .eq("language_id", scope.languageId)
            .maybeSingle(),
        ]);
        const goal = goalRes.data as Record<string, unknown> | null;
        const meta = (goal?.metadata && typeof goal.metadata === "object" ? goal.metadata : {}) as Record<string, unknown>;
        const placement = (meta.placement && typeof meta.placement === "object" ? meta.placement : {}) as Record<string, unknown>;
        const perSkill = (placement.per_skill && typeof placement.per_skill === "object" ? placement.per_skill : {}) as Record<string, unknown>;
        const overall = isTodayCefr(goal?.current_cefr_estimate) ? goal!.current_cefr_estimate as Cefr : null;
        const levelFor = (skill: TodaySkill): Cefr | null => {
          const entry = perSkill[skill];
          const level = typeof entry === "string" ? entry : (entry as Record<string, unknown> | undefined)?.level;
          return isTodayCefr(level) ? level : overall;
        };
        const attempts: AttemptRow[] = attemptRows
          .filter((row) => (TODAY_SKILLS as readonly string[]).includes(String(row.service_key)))
          .map((row) => ({
            content_item_id: String(row.content_item_id ?? ""),
            skill: String(row.service_key) as TodaySkill,
            score: scoreOf(row),
            submitted_at: String(row.submitted_at),
          }));
        const requestedDate = toText(url.searchParams.get("date"), 10);
        const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : new Date().toISOString().slice(0, 10);
        return json(200, { ok: true, week: topicWeek({ date, items, attempts, levelFor }) });
      }

      if (route === "/progress") {
        const [items, attemptRows, goalRes, errorsRes, unitsRes] = await Promise.all([
          loadCatalog(),
          loadAttempts(3650, 2000),
          sb.from("learner_language_goals")
            .select("current_cefr_estimate, metadata")
            .eq("user_id", auth.userId)
            .eq("language_id", scope.languageId)
            .maybeSingle(),
          sb.from("learner_language_errors")
            .select("service_key, subskill_key, error_type, error_frequency, last_seen_at, mastery_status")
            .eq("user_id", auth.userId)
            .eq("language_id", scope.languageId)
            .in("mastery_status", ["open", "reopened", "improving"])
            .order("last_seen_at", { ascending: false })
            .limit(300),
          sb.from("grammar_units")
            .select("slug, title, focus_area, level")
            .eq("language_id", scope.languageId)
            .eq("status", "published"),
        ]);
        const attempts: AttemptRow[] = attemptRows
          .filter((row) => (TODAY_SKILLS as readonly string[]).includes(String(row.service_key)))
          .map((row) => ({
            content_item_id: String(row.content_item_id ?? ""),
            skill: String(row.service_key) as TodaySkill,
            score: scoreOf(row),
            submitted_at: String(row.submitted_at),
          }));
        const levelById = new Map(items.map((entry) => [entry.id, entry.level]));
        const goal = goalRes.data as Record<string, unknown> | null;
        const meta = (goal?.metadata && typeof goal.metadata === "object" ? goal.metadata : {}) as Record<string, unknown>;
        const placement = (meta.placement && typeof meta.placement === "object" ? meta.placement : {}) as Record<string, unknown>;
        const perSkill = (placement.per_skill && typeof placement.per_skill === "object" ? placement.per_skill : {}) as Record<string, unknown>;
        const overall = isTodayCefr(goal?.current_cefr_estimate) ? goal!.current_cefr_estimate as Cefr : null;
        const levelFor = (skill: TodaySkill): Cefr | null => {
          const entry = perSkill[skill];
          const level = typeof entry === "string" ? entry : (entry as Record<string, unknown> | undefined)?.level;
          return isTodayCefr(level) ? level : overall;
        };
        const requestedDate = toText(url.searchParams.get("date"), 10);
        const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : new Date().toISOString().slice(0, 10);
        const days = dailyCounts(attempts, date, 126);
        return json(200, {
          ok: true,
          level_history: readLevelHistory(meta),
          level_check: levelCheckStatus(meta),
          streak: { current: currentStreak(attempts, date), longest: longestStreak(attempts) },
          totals: {
            last_7_days: days.slice(-7).reduce((sum, day) => sum + day.count, 0),
            last_30_days: days.slice(-30).reduce((sum, day) => sum + day.count, 0),
            all_time: attempts.length,
          },
          days,
          skills: (() => {
            const statuses = statusesByLevel(attempts, levelById, levelFor);
            return skillProgress(attempts, (id) => levelById.get(id) ?? null, levelFor)
              .map((row) => {
                const level = levelFor(row.skill);
                return { ...row, level, status: statuses[row.skill], next_level: level ? nextCefr(level) : null };
              });
          })(),
          mistakes: groupMistakes(
            (errorsRes.data ?? []) as Array<Record<string, unknown>>,
            (unitsRes.data ?? []) as Array<Record<string, unknown>>,
            levelFor("grammar"),
          ),
        });
      }

      // /today
      const requestedDate = toText(url.searchParams.get("date"), 10);
      const utcToday = new Date().toISOString().slice(0, 10);
      const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
        && Math.abs(Date.parse(requestedDate) - Date.parse(utcToday)) <= 86_400_000;
      const planDate = dateOk ? requestedDate : utcToday;

      const [items, attemptRows, goalRes, notebook, access, existingRes, mistakesRes, unitsRes, reviewDueRes] = await Promise.all([
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
        sb.from("learner_language_errors")
          .select("subskill_key, error_type, error_frequency, last_seen_at")
          .eq("user_id", auth.userId)
          .eq("language_id", scope.languageId)
          .like("subskill_key", "grammar.%")
          .in("mastery_status", ["open", "reopened"])
          .gte("last_seen_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
          .limit(200),
        sb.from("grammar_units")
          .select("slug, focus_area, level")
          .eq("language_id", scope.languageId)
          .eq("status", "published"),
        sb.from("learner_review_items")
          .select("id", { head: true, count: "exact" })
          .eq("user_id", auth.userId)
          .eq("language_id", scope.languageId)
          .lt("box", RETIRED_BOX)
          .lte("next_due_at", new Date().toISOString()),
      ]);
      // Words and missed questions are reviewed together on the Review page.
      const reviewItemsDue = Number(reviewDueRes.count ?? 0) || 0;
      const dueReviews = notebook.dueCount + reviewItemsDue;

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

      const ownedSkills = access.admin
        ? [...TODAY_SKILLS]
        : TODAY_SKILLS.filter((skill) => {
          const productId = (products as Record<string, { productId?: string }>)[skill]?.productId;
          return Boolean(productId && access.entitlementProductIds.includes(productId));
        });
      // Learners without a plan still get today's free activity in any skill.
      const allowance = ownedSkills.length
        ? null
        : await checkActivityAccess(sb, { userId: auth.userId, languageId: scope.languageId, products, skill: null });
      const availableSkills = ownedSkills.length ? ownedSkills : [...TODAY_SKILLS];

      const attempts: AttemptRow[] = attemptRows
        .filter((row) => (TODAY_SKILLS as readonly string[]).includes(String(row.service_key)))
        .map((row) => ({
          content_item_id: String(row.content_item_id ?? ""),
          skill: String(row.service_key) as TodaySkill,
          score: scoreOf(row),
          submitted_at: String(row.submitted_at),
        }));

      // Adapt to recent results: step down a level in a skill while scores there stay low.
      const levelById = new Map(items.map((entry) => [entry.id, entry.level]));
      const levelStatuses = statusesByLevel(attempts, levelById, (skill) => perSkillLevel[skill] ?? overallLevel);
      const practiceLevels: Partial<Record<TodaySkill, Cefr>> = {};
      for (const skill of TODAY_SKILLS) {
        const level = practiceLevel(perSkillLevel[skill] ?? overallLevel, levelStatuses[skill]);
        if (level) practiceLevels[skill] = level;
      }

      const dailyMinutes = Number(goal?.daily_time_minutes ?? 20) || 20;
      // A stored plan is reused only while the inputs that shaped it are unchanged.
      const planKey = [overallLevel ?? "-", dailyMinutes, availableSkills.join(","), JSON.stringify(practiceLevels)].join("|");
      const existingSummary = (existingRes.data?.summary ?? {}) as Record<string, unknown>;
      const existing = existingSummary.generated_by === "hub.today.v1"
          && existingSummary.plan_key === planKey
          && Array.isArray(existingSummary.today_tasks)
        ? existingSummary.today_tasks as TodayTask[]
        : null;

      const grammarBySlug = new Map(items.filter((entry) => entry.skill === "grammar").map((entry) => [entry.slug, entry]));
      const lessonFor = (topic: string): CatalogItem | null => {
        const target = CEFR_ORDER.indexOf(perSkillLevel.grammar ?? overallLevel ?? "B1");
        const units = ((unitsRes.data ?? []) as Array<Record<string, unknown>>)
          .filter((unit) => unit.focus_area === topic && grammarBySlug.has(String(unit.slug)))
          .sort((a, b) =>
            Math.abs(CEFR_ORDER.indexOf(a.level as Cefr) - target) - Math.abs(CEFR_ORDER.indexOf(b.level as Cefr) - target));
        return units[0] ? grammarBySlug.get(String(units[0].slug)) ?? null : null;
      };
      const fixes = pickFixes({
        mistakes: ((mistakesRes.data ?? []) as Array<Record<string, unknown>>).flatMap((row) => {
          const topic = topicFromSubskill(String(row.subskill_key ?? ""));
          return topic
            ? [{ topic, count: Number(row.error_frequency ?? 1), example: String(row.error_type ?? ""), last_seen_at: String(row.last_seen_at ?? "") }]
            : [];
        }),
        lessonFor,
        attempts,
      });

      const plan = planToday({
        date: planDate,
        dailyMinutes,
        overallLevel,
        perSkillLevel: practiceLevels,
        items,
        attempts,
        dueReviews,
        availableSkills,
        existing,
        fixes,
        goalKeys: Array.isArray(goal?.goal_keys) ? (goal!.goal_keys as unknown[]).map(String) : [],
        // A free learner's plan holds today's free activity (kept once done) plus review.
        maxActivities: allowance ? Math.max(allowance.free_left, existing ? 1 : 0) : undefined,
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
        level_status: levelStatuses,
        daily_minutes: dailyMinutes,
        placement_done: Boolean(placement?.completed_at),
        level_check: levelCheckStatus(meta),
        available_skills: availableSkills,
        free: allowance ? { left: allowance.free_left, per_day: allowance.free_per_day } : null,
        tasks: plan.tasks,
        minutes_total: plan.minutes_total,
        done_count: plan.done_count,
        due_reviews: dueReviews,
        due_words: notebook.dueCount,
        due_review_items: reviewItemsDue,
        total_words: notebook.totalCount,
        streak: currentStreak(attempts, planDate),
        week: weekStrip(attempts, planDate),
      });
    }

    // === What the learner can open: skills in their plan and today's free activities ===
    if (req.method === "GET" && route === "/access") {
      const overview = await checkActivityAccess(sb, { userId: auth.userId, languageId: scope.languageId, products, skill: null });
      // Today's free activities stay open, so the learner can see the result and redo them.
      const ids = overview.free_item_ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
      const { data: freeRows } = ids.length
        ? await sb.from("learning_content_registry_items").select("service_key, source_ref").in("id", ids)
        : { data: [] };
      return json(200, {
        ok: true,
        entitled_skills: overview.entitled_skills,
        free_left: overview.free_left,
        free_per_day: overview.free_per_day,
        free_today: ((freeRows ?? []) as Array<Record<string, unknown>>)
          .map((row) => ({ skill: String(row.service_key), slug: String(row.source_ref ?? "") }))
          .filter((row) => row.slug),
      });
    }

    // === Telegram reminders: opt-in, only once Telegram is linked ===
    if (route === "/reminders" && (req.method === "GET" || req.method === "POST")) {
      const [goalRes, userRes] = await Promise.all([
        sb.from("learner_language_goals")
          .select("user_id, metadata")
          .eq("user_id", auth.userId)
          .eq("language_id", scope.languageId)
          .maybeSingle(),
        sb.from("users").select("telegram_chat_id").eq("id", auth.userId).maybeSingle(),
      ]);
      const linked = Boolean(userRes.data?.telegram_chat_id);
      const metadata = (goalRes.data?.metadata && typeof goalRes.data.metadata === "object" ? goalRes.data.metadata : {}) as Record<string, unknown>;
      let settings = readReminderSettings(metadata);
      if (req.method === "POST") {
        if (!goalRes.data) return json(409, { error: "Finish the level test first", code: "english_onboarding_required" });
        const body = await parseBody(req) as Record<string, unknown>;
        const next = mergeReminderSettings(settings, body);
        if (next.enabled && !linked) {
          return json(409, { error: "Link Telegram on your Schood account first", code: "telegram_not_linked" });
        }
        const { error } = await sb.from("learner_language_goals")
          .update({ metadata: { ...metadata, telegram_reminder: next } })
          .eq("user_id", auth.userId)
          .eq("language_id", scope.languageId);
        if (error) throw new Error(`Failed to save reminders: ${error.message}`);
        settings = next;
      }
      return json(200, { ok: true, telegram_linked: linked, ...settings, hours: REMINDER_HOURS });
    }

    // === Tutor memory: notes the learner chose to keep, on every device ===
    if (route === "/tutor/memory" && (req.method === "GET" || req.method === "POST")) {
      if (req.method === "GET") {
        return json(200, { ok: true, memories: await loadTutorMemories(sb, auth.userId, scope.languageId) });
      }
      const body = await parseBody(req) as Record<string, unknown>;
      const action = toText(body.action, 16);
      const current = await loadTutorMemories(sb, auth.userId, scope.languageId);
      let next = current;
      if (action === "add") {
        const items = (Array.isArray(body.memories) ? body.memories : [body.memory])
          .filter((m): m is Record<string, unknown> => !!m && typeof m === "object" && !Array.isArray(m))
          .map((m) => ({
            id: `mem_${crypto.randomUUID().slice(0, 12)}`,
            kind: TUTOR_MEMORY_KINDS.includes(toText(m.kind, 24)) ? toText(m.kind, 24) : "context",
            text: toText(m.text, 320),
            added_at: new Date().toISOString(),
          }))
          .filter((m) => m.text && !current.some((existing) => existing.text.toLowerCase() === m.text.toLowerCase()));
        next = [...current, ...items].slice(-30);
      } else if (action === "remove") {
        const id = toText(body.id, 64);
        next = current.filter((memory) => memory.id !== id);
      } else {
        return json(422, { error: "action must be add or remove" });
      }
      await saveTutorMemories(sb, auth.userId, scope.languageId, next);
      return json(200, { ok: true, memories: next });
    }

    // === Moving up a level in one skill ===
    // Only when recent results at the current level show the learner is ready.
    if (req.method === "POST" && route === "/level/up") {
      const body = await parseBody(req) as Record<string, unknown>;
      const skill = toText(body.skill, 24) as TodaySkill;
      if (!(TODAY_SKILLS as readonly string[]).includes(skill)) return json(422, { error: "Unknown skill" });
      const { data: goal } = await sb.from("learner_language_goals")
        .select("current_cefr_estimate, metadata")
        .eq("user_id", auth.userId)
        .eq("language_id", scope.languageId)
        .maybeSingle();
      const meta = ((goal as Record<string, unknown> | null)?.metadata ?? {}) as Record<string, unknown>;
      const placement = (meta.placement && typeof meta.placement === "object" ? { ...(meta.placement as Record<string, unknown>) } : {}) as Record<string, unknown>;
      const perSkill = (placement.per_skill && typeof placement.per_skill === "object" ? { ...(placement.per_skill as Record<string, unknown>) } : {}) as Record<string, unknown>;
      const entry = perSkill[skill];
      const stored = typeof entry === "string" ? entry : (entry as Record<string, unknown> | undefined)?.level;
      const overall = (goal as Record<string, unknown> | null)?.current_cefr_estimate;
      const current = isTodayCefr(stored) ? stored : isTodayCefr(overall) ? overall : null;
      if (!current) return json(409, { error: "Set your level first", code: "no_level" });
      const next = nextCefr(current);
      if (!next) return json(409, { error: "You are already at the highest level", code: "top_level" });

      const { data: catalogRows } = await sb.from("learning_content_registry_items")
        .select("id, cefr_level")
        .eq("language_id", scope.languageId)
        .eq("service_key", skill)
        .eq("status", "published");
      const levelOfItem = new Map(((catalogRows ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), isTodayCefr(row.cefr_level) ? row.cefr_level : null]));
      const { data: attemptRows } = await sb.from("learning_attempts")
        .select("content_item_id, correctness_ratio, overall_score, submitted_at")
        .eq("user_id", auth.userId)
        .eq("language_id", scope.languageId)
        .eq("service_key", skill)
        .in("status", ["submitted", "scored", "failed"])
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false })
        .limit(50);
      const scores = ((attemptRows ?? []) as Array<Record<string, unknown>>)
        .filter((row) => levelOfItem.get(String(row.content_item_id)) === current)
        .map((row) => Number(row.correctness_ratio ?? row.overall_score))
        .filter((value) => Number.isFinite(value));
      if (levelStatus(scores) !== "ready") {
        return json(409, { error: "Keep practising at your level first", code: "not_ready" });
      }

      const movedAt = new Date().toISOString();
      perSkill[skill] = { level: next, moved_up_from: current, moved_up_at: movedAt };
      placement.per_skill = perSkill;
      const level_history = appendLevelHistory(meta, {
        at: movedAt,
        source: "level_up",
        overall: isTodayCefr(overall) ? overall : null,
        per_skill: perSkillLevels({ per_skill: perSkill }),
      });
      const { error } = await sb.from("learner_language_goals")
        .update({ metadata: { ...meta, placement, level_history } })
        .eq("user_id", auth.userId)
        .eq("language_id", scope.languageId);
      if (error) throw new Error(`Failed to save level: ${error.message}`);
      return json(200, { ok: true, skill, level: next, previous_level: current });
    }

    // === Mixed review: missed questions and dictation sentences ===

    if (req.method === "GET" && route === "/review/items") {
      const limit = Math.max(1, Math.min(20, Number(url.searchParams.get("limit") ?? 10) || 10));
      const nowIso = new Date().toISOString();
      const [dueRes, countRes] = await Promise.all([
        sb.from("learner_review_items")
          .select("id, kind, payload, box")
          .eq("user_id", auth.userId)
          .eq("language_id", scope.languageId)
          .lt("box", RETIRED_BOX)
          .lte("next_due_at", nowIso)
          .order("next_due_at", { ascending: true })
          .limit(limit),
        sb.from("learner_review_items")
          .select("id", { head: true, count: "exact" })
          .eq("user_id", auth.userId)
          .eq("language_id", scope.languageId)
          .lt("box", RETIRED_BOX)
          .lte("next_due_at", nowIso),
      ]);
      if (dueRes.error) throw new Error(`Failed to load review items: ${dueRes.error.message}`);
      const items = ((dueRes.data ?? []) as Array<Record<string, unknown>>).flatMap((row) => {
        const payload = parseReviewPayload(row.payload);
        return payload ? [{ id: String(row.id), kind: String(row.kind), step: Number(row.box ?? 1), ...publicReviewPayload(payload) }] : [];
      });
      return json(200, { ok: true, due: Number(countRes.count ?? items.length), items });
    }

    if (req.method === "POST" && route === "/review/answer") {
      const body = await parseBody(req) as Record<string, unknown>;
      const id = toText(body.id, 64);
      if (!id) return json(422, { error: "id is required" });
      const { data: row, error } = await sb.from("learner_review_items")
        .select("id, payload, box, times_reviewed")
        .eq("id", id)
        .eq("user_id", auth.userId)
        .maybeSingle();
      if (error) throw new Error(`Failed to load review item: ${error.message}`);
      const payload = row ? parseReviewPayload((row as Record<string, unknown>).payload) : null;
      if (!row || !payload) return json(404, { error: "Review item not found" });
      const checked = checkReviewAnswer(payload, body.answer);
      const next = scheduleAfterAnswer(Number((row as Record<string, unknown>).box ?? 1), checked.correct, new Date());
      const { error: updateError } = await sb.from("learner_review_items")
        .update({
          box: next.box,
          next_due_at: next.next_due_at,
          last_result: checked.correct ? "correct" : "incorrect",
          times_reviewed: Number((row as Record<string, unknown>).times_reviewed ?? 0) + 1,
        })
        .eq("id", id)
        .eq("user_id", auth.userId);
      if (updateError) throw new Error(`Failed to save review answer: ${updateError.message}`);
      return json(200, { ok: true, ...checked, retired: next.box >= RETIRED_BOX, next_due_at: next.next_due_at });
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
        const isCheck = body.source === "check";
        const tested = placementIn.per_skill && typeof placementIn.per_skill === "object" && !Array.isArray(placementIn.per_skill)
          ? placementIn.per_skill as Record<string, unknown>
          : {};
        // A monthly check re-measures the skills it tested and keeps the rest.
        const previousPerSkill = (meta.placement && typeof meta.placement === "object"
          ? (meta.placement as Record<string, unknown>).per_skill
          : null) as Record<string, unknown> | null;
        const perSkill = isCheck && previousPerSkill && typeof previousPerSkill === "object"
          ? { ...previousPerSkill, ...tested }
          : tested;
        if (isCefr(overall)) row.current_cefr_estimate = overall;
        const completedAt = new Date().toISOString();
        // Measured by the test only if this is the result the hub itself produced
        // (certificates are issued from tested levels, never chosen ones).
        const method = measurementMethod({ overall, per_skill: perSkillLevels({ per_skill: tested }) }, meta.placement_test_result);
        delete meta.placement_test_result;
        meta.level_history = appendLevelHistory(meta, {
          at: completedAt,
          source: isCheck ? "check" : "placement",
          overall: isCefr(overall) ? overall as Cefr : null,
          per_skill: perSkillLevels({ per_skill: perSkill }),
          method,
        });
        meta.placement = {
          overall_level: isCefr(overall) ? overall : null,
          per_skill: perSkill,
          completed_at: completedAt,
          method,
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

    // Vocabulary in context: weaves the learner's due / recent notebook words
    // into a short passage at their level. Without AI (or when the model's
    // passage does not actually use the words) it returns the same words with
    // their saved meanings and example sentences, flagged `fallback: true`.
    if (req.method === "POST" && route === "/ai/vocab-in-context") {
      const body = await parseBody(req) as Record<string, unknown>;
      const requestedWords: string[] = Array.isArray(body.words)
        ? (body.words as unknown[]).map((w) => toText(w, 60)).filter(Boolean).slice(0, 8)
        : [];
      const topic = toText(body.topic, 120);
      const levelIn = toText(body.target_level, 8).toUpperCase();
      const level = ["A1", "A2", "B1", "B2", "C1", "C2"].includes(levelIn) ? levelIn : "B1";

      type NotebookRow = { id: string; word: string; context_text: string | null; metadata: unknown; lexicon_entry_id: string | null };
      const columns = "id, word, context_text, metadata, lexicon_entry_id";
      const base = () => sb
        .from("user_vocabulary_notebook_entries")
        .select(columns)
        .eq("user_id", auth.userId)
        .eq("language_id", scope.languageId)
        .eq("is_archived", false);
      const { data: dueRows } = await base()
        .lte("next_review_at", new Date().toISOString())
        .order("next_review_at", { ascending: true })
        .limit(8);
      let rows = (dueRows ?? []) as NotebookRow[];
      if (rows.length < 8) {
        const { data: recentRows } = await base().order("updated_at", { ascending: false }).limit(8);
        const seen = new Set(rows.map((r) => r.id));
        rows = [...rows, ...((recentRows ?? []) as NotebookRow[]).filter((r) => !seen.has(r.id))].slice(0, 8);
      }
      const lexiconIds = rows.map((r) => r.lexicon_entry_id).filter((v): v is string => Boolean(v));
      const lexicon = new Map<string, { definition: string; example: string }>();
      if (lexiconIds.length) {
        const { data: lexRows } = await sb
          .from("language_lexicon_entries")
          .select("id, definition, example")
          .in("id", lexiconIds);
        for (const l of (lexRows ?? []) as Array<{ id: string; definition: unknown; example: unknown }>) {
          lexicon.set(l.id, { definition: toText(l.definition, 240), example: toText(l.example, 400) });
        }
      }
      const notebookEntries = rows
        .map((r) => {
          const meta = (r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata))
            ? r.metadata as Record<string, unknown>
            : {};
          const lex = r.lexicon_entry_id ? lexicon.get(r.lexicon_entry_id) : undefined;
          return {
            word: toText(r.word, 60),
            definition: toText(meta.definition, 240) || lex?.definition || "",
            example: toText(meta.example, 400) || lex?.example || toText(r.context_text, 400),
          };
        })
        .filter((e) => e.word);

      const requestedSet = new Set(requestedWords.map((w) => w.toLowerCase()));
      const matchingEntries = notebookEntries.filter((e) => requestedSet.has(e.word.toLowerCase()));
      const entries = requestedWords.length && matchingEntries.length ? matchingEntries : notebookEntries;
      const words = requestedWords.length ? requestedWords : notebookEntries.map((e) => e.word);

      if (words.length === 0) {
        return json(200, {
          ok: true,
          ai_available: isEnglishAIConfigured(),
          ai_status: "ok",
          fallback: false,
          empty: true,
          words: [],
          entries: [],
          passage: "",
          translations: {},
          topic: topic || null,
        });
      }

      const { data: result, status: aiStatus, error: aiError } = await callEnglishAIWithStatus<{
        passage?: unknown;
        translations?: unknown;
      }>(
        {
          systemPrompt:
            "You are an English teacher writing a short, natural reading passage that uses the given words IN CONTEXT. Write 90-150 words at the given CEFR level: everyday, friendly, easy to follow, with no difficult words beyond the level except the given words. Use each given word at least once, naturally, so its meaning is clear from the sentence. Avoid real people, brands, politics and religion. Reply in strict JSON: {passage: string, translations: { word: one short plain-English meaning for each given word }}.",
          userPayload: JSON.stringify({ level, topic: topic || "an everyday situation", words }),
          temperature: 0.6,
        },
        { passage: "", translations: {} },
      );
      if (aiStatus === "failed") console.error(JSON.stringify({ event: "english_ai_failed", route, request_id: requestId, error: String(aiError ?? "").slice(0, 300) }));

      const passage = aiStatus === "ok" ? toText(result.passage, 1600) : "";
      const lowerPassage = passage.toLowerCase();
      const usedWords = words.filter((w) => lowerPassage.includes(w.toLowerCase()));
      const passageUsable = passage.length >= 60 && usedWords.length >= Math.ceil(words.length / 2);
      const translations: Record<string, string> = {};
      if (passageUsable && result.translations && typeof result.translations === "object" && !Array.isArray(result.translations)) {
        const wanted = new Set(words.map((w) => w.toLowerCase()));
        for (const [k, v] of Object.entries(result.translations as Record<string, unknown>)) {
          const key = String(k).toLowerCase().trim();
          const meaning = toText(v, 240);
          if (wanted.has(key) && meaning) translations[key] = meaning;
        }
      }
      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        fallback: !passageUsable,
        empty: false,
        words: passageUsable ? usedWords : words,
        entries,
        passage: passageUsable ? passage : "",
        translations,
        topic: topic || null,
        generated_at: new Date().toISOString(),
      });
    }

    // Grammar decoder: explains how one English sentence is built. Without AI
    // it returns rule-based "things to notice" (modal verbs, perfect forms,
    // possible passives, conditions, linking words) flagged `fallback: true`.
    if (req.method === "POST" && route === "/ai/grammar-decode") {
      const body = await parseBody(req);
      const sentence = toText((body as Record<string, unknown>).sentence, 600);
      if (!sentence || sentence.length < 5) {
        return json(400, { error: "sentence is required (min 5 characters)", code: "sentence_too_short" });
      }

      const { data: result, status: aiStatus, error: aiError } = await callEnglishAIWithStatus<{
        clauses?: unknown;
        tense?: unknown;
        voice?: unknown;
        register?: unknown;
        notes?: unknown;
        rephrasings?: unknown;
      }>(
        {
          systemPrompt:
            "You are a friendly English grammar teacher explaining one sentence to an intermediate learner (CEFR A2-B2). Use short, plain English and simple grammar names. Return strict JSON with: clauses (array of {role: 'main'|'subordinate'|'relative'|'noun'|'adverbial'|'participial', text: an exact substring of the sentence, function: one short sentence saying what this part does}), tense (e.g. 'present perfect'), voice ('active'|'passive'), register ('formal'|'neutral'|'informal'), notes (1-3 short tips on what to notice or where learners make mistakes), rephrasings (2 other correct ways to say the same idea, each {text, why_different: one short sentence}).",
          userPayload: JSON.stringify({ sentence }),
          temperature: 0.3,
        },
        { clauses: [], tense: "", voice: "", register: "", notes: [], rephrasings: [] },
      );
      if (aiStatus === "failed") console.error(JSON.stringify({ event: "english_ai_failed", route, request_id: requestId, error: String(aiError ?? "").slice(0, 300) }));

      const lowerSentence = sentence.toLowerCase();
      const clauseRoles = ["main", "subordinate", "relative", "noun", "adverbial", "participial"];
      const clauses = aiStatus === "ok" && Array.isArray(result.clauses)
        ? (result.clauses as unknown[])
            .filter((c): c is Record<string, unknown> => !!c && typeof c === "object" && !Array.isArray(c))
            .map((c) => ({
              role: clauseRoles.includes(toText(c.role, 32).toLowerCase()) ? toText(c.role, 32).toLowerCase() : "main",
              text: toText(c.text, 600),
              function: toText(c.function, 300),
            }))
            .filter((c) => c.text && lowerSentence.includes(c.text.toLowerCase()))
            .slice(0, 8)
        : [];
      const notes = aiStatus === "ok" && Array.isArray(result.notes)
        ? (result.notes as unknown[]).map((n) => toText(n, 300)).filter(Boolean).slice(0, 4)
        : [];
      const rephrasings = aiStatus === "ok" && Array.isArray(result.rephrasings)
        ? (result.rephrasings as unknown[])
            .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r))
            .map((r) => ({
              text: toText(r.text, 600),
              why_different: toText(r.why_different, 300),
            }))
            .filter((r) => r.text)
            .slice(0, 3)
        : [];
      const voiceRaw = toText(result.voice, 24).toLowerCase();
      const registerRaw = toText(result.register, 32).toLowerCase();
      const tense = aiStatus === "ok" ? toText(result.tense, 60) : "";
      const usable = aiStatus === "ok" && (clauses.length > 0 || Boolean(tense) || notes.length > 0);

      // Rule-based signals: only patterns that are reliable enough to point at.
      const signals: Array<{ label: string; match: string; tip: string }> = [];
      if (!usable) {
        const participles = "built|made|written|given|taken|seen|done|known|found|told|sold|held|brought|bought|sent|kept|paid|spent|shown|chosen|driven|eaten|broken|spoken|stolen|forgotten|hidden|understood|born|left|lost|won|grown|thrown|worn|caught|taught";
        const rules: Array<{ re: RegExp; label: string; tip: string }> = [
          {
            re: /\b(can|could|may|might|must|should|would|will|shall)(?:\s+not|n't)?\s+\w+/i,
            label: "Modal verb",
            tip: "After can, must, should, will and other modal verbs, use the base verb: 'can swim', not 'can swims'.",
          },
          {
            re: new RegExp(`\\b(have|has|had)(?:\\s+(?:not|never|already|just|ever|always))?\\s+(been|gone|come|become|begun|run|met|felt|thought|said|\\w+ed|${participles})\\b`, "i"),
            label: "Perfect form (have / has / had + past participle)",
            tip: "This form connects two times, for example the past and now (I have lived here for two years).",
          },
          {
            re: new RegExp(`\\b(am|is|are|was|were|be|been|being)(?:\\s+not)?\\s+(\\w+ed|${participles})\\b`, "i"),
            label: "Maybe passive (be + past participle)",
            tip: "The passive puts the focus on what happens, not on who does it (The road was built in 2010). Some words after 'be' are just adjectives (I am tired).",
          },
          {
            re: /\b(am|is|are|was|were)(?:\s+not)?\s+(\w{2,}ing)\b/i,
            label: "be + -ing",
            tip: "This often shows an action in progress (She is working now). Some -ing words are adjectives (The film was interesting).",
          },
          {
            re: /\b(if|unless)\b/i,
            label: "Condition (if / unless)",
            tip: "Look at the verb in each half of the sentence: the condition and the result often use different tenses.",
          },
          {
            re: /\b(who|whom|whose|which)\b/i,
            label: "who / which / whose",
            tip: "These words often start extra information about a noun (the teacher who helped me).",
          },
          {
            re: /\b(although|even though|though|because|since|while|whereas|however|despite|therefore|so that|in order to)\b/i,
            label: "Linking word",
            tip: "Linking words join ideas. Find the idea on each side and how they connect: reason, contrast or result.",
          },
        ];
        for (const rule of rules) {
          const m = sentence.match(rule.re);
          if (m && m[0]) signals.push({ label: rule.label, match: m[0], tip: rule.tip });
        }
        const wordCount = sentence.split(/\s+/).filter(Boolean).length;
        if (wordCount > 25) {
          signals.push({
            label: "Long sentence",
            match: `${wordCount} words`,
            tip: "Split it at the commas and linking words, then find the main subject and verb first.",
          });
        }
      }

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        fallback: !usable,
        sentence,
        clauses: usable ? clauses : [],
        tense: usable ? tense : "",
        voice: usable && ["active", "passive"].includes(voiceRaw) ? voiceRaw : "",
        register: usable && ["formal", "neutral", "informal", "literary", "spoken"].includes(registerRaw) ? registerRaw : "",
        notes: usable ? notes : [],
        rephrasings: usable ? rephrasings : [],
        signals,
        generated_at: new Date().toISOString(),
      });
    }

    // Writing feedback (general English, CEFR-aligned). With AI: a level per
    // criterion, strengths, things to improve, one next step and a short
    // rewrite. Always: honest text statistics and rule-based checks
    // (capital letters, very long sentences, repeated words, paragraphs,
    // linking words). Without AI the response is flagged `fallback: true` and
    // carries no level, because a level cannot be measured by rules.
    if (req.method === "POST" && route === "/ai/essay-grade") {
      const body = await parseBody(req);
      const text = toText((body as Record<string, unknown>).text, 5000);
      const targetLevel = toText((body as Record<string, unknown>).target_level, 8).toUpperCase() || "B1";
      const prompt = toText((body as Record<string, unknown>).prompt, 600);
      if (!text || text.length < 40) {
        return json(400, { error: "text is required (min 40 characters)", code: "text_too_short" });
      }
      if (!["A1", "A2", "B1", "B2", "C1", "C2"].includes(targetLevel)) {
        return json(400, { error: "target_level must be one of A1 A2 B1 B2 C1 C2", code: "invalid_level" });
      }

      const words = text.split(/\s+/).filter(Boolean);
      const wordCount = words.length;
      const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => /[a-z]/i.test(s));
      const paragraphs = text.split(/\n\s*\n|\r\n\s*\r\n/).map((p) => p.trim()).filter(Boolean);
      const stats = {
        words: wordCount,
        sentences: sentences.length,
        paragraphs: paragraphs.length,
        avg_sentence_words: sentences.length ? Math.round(wordCount / sentences.length) : wordCount,
      };

      // Rule-based checks: facts about the text, not a grade.
      const checks: string[] = [];
      const positives: string[] = [];
      if (/(^|[\s"(])i(?=[\s,!?;:'’]|\.(?!\w)|$)/.test(text)) {
        checks.push("Write the word 'I' with a capital letter.");
      }
      const lowerStarts = sentences.filter((s) => /^[a-z]/.test(s)).length;
      if (lowerStarts > 0) {
        checks.push(lowerStarts === 1
          ? "One sentence starts with a small letter. Start every sentence with a capital letter."
          : `${lowerStarts} sentences start with a small letter. Start every sentence with a capital letter.`);
      }
      const longSentences = sentences.filter((s) => s.split(/\s+/).filter(Boolean).length > 35).length;
      if (longSentences > 0) {
        checks.push(longSentences === 1
          ? "One sentence is very long (more than 35 words). Try splitting it into two."
          : `${longSentences} sentences are very long (more than 35 words). Try splitting them.`);
      }
      if (/\s[,.!?;:]/.test(text)) {
        checks.push("Remove the space before commas, full stops and question marks.");
      }
      if (!/[.!?]["')\]]?\s*$/.test(text)) {
        checks.push("End your last sentence with a full stop, question mark or exclamation mark.");
      }
      const stopWords = new Set(["that", "this", "with", "have", "they", "there", "their", "them", "then", "than", "from", "were", "what", "when", "will", "would", "your", "about", "which", "because", "also", "very", "some", "more", "into", "been", "just", "like", "many", "much", "only", "other", "people", "these", "those", "think"]);
      const counts = new Map<string, number>();
      for (const w of words) {
        const clean = w.toLowerCase().replace(/[^a-z']/g, "");
        if (clean.length < 4 || stopWords.has(clean)) continue;
        counts.set(clean, (counts.get(clean) ?? 0) + 1);
      }
      const [topWord, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
      if (topWord && topCount >= 4 && topCount / Math.max(1, wordCount) > 0.03) {
        checks.push(`You used '${topWord}' ${topCount} times. Try a different word sometimes.`);
      }
      if (paragraphs.length === 1 && wordCount >= 120) {
        checks.push("Try dividing your text into paragraphs: one main idea in each.");
      } else if (paragraphs.length >= 2) {
        positives.push(`You organised your text into ${paragraphs.length} paragraphs.`);
      }
      const linkers = ["because", "but", "however", "although", "so", "also", "first", "then", "finally", "for example", "in addition", "on the other hand", "therefore", "while"];
      const lowerText = ` ${text.toLowerCase().replace(/[^a-z\s]/g, " ")} `;
      const usedLinkers = linkers.filter((l) => lowerText.includes(` ${l} `));
      if (usedLinkers.length >= 3) {
        positives.push(`You used linking words to connect ideas (${usedLinkers.slice(0, 4).join(", ")}).`);
      } else if (wordCount >= 80) {
        checks.push("Use more linking words (because, however, for example) to connect your ideas.");
      }

      const { data: result, status: aiStatus, error: aiError } = await callEnglishAIWithStatus<{
        overall_level?: unknown;
        criteria?: unknown;
        strengths?: unknown;
        improvements?: unknown;
        actionable_next_step?: unknown;
        rewrite_sample?: unknown;
      }>(
        {
          systemPrompt:
            "You are a kind, CEFR-aligned English writing teacher. Give feedback on the learner's text against the target level using four criteria: TASK (does it answer the prompt and stay on topic), COHERENCE (order of ideas, paragraphs, linking words), RANGE (variety of words and grammar), ACCURACY (grammar and spelling). Write all comments in short, simple English that a B1 learner can understand. Return strict JSON: {overall_level: one of A1 A2 B1 B2 C1 C2, criteria: {task: {level, comment}, coherence: {level, comment}, range: {level, comment}, accuracy: {level, comment}}, strengths: 2-3 short strings, improvements: 2-3 short strings, actionable_next_step: 1-2 sentences with one concrete thing to do next, rewrite_sample: a better version of the 1-2 most important sentences from the text}.",
          userPayload: JSON.stringify({
            target_level: targetLevel,
            prompt: prompt || "(no task given)",
            response_text: text,
            word_count: wordCount,
          }),
          temperature: 0.3,
        },
        {
          overall_level: "",
          criteria: {},
          strengths: [],
          improvements: [],
          actionable_next_step: "",
          rewrite_sample: "",
        },
      );
      if (aiStatus === "failed") console.error(JSON.stringify({ event: "english_ai_failed", route, request_id: requestId, error: String(aiError ?? "").slice(0, 300) }));

      const validLevel = (raw: unknown): string | null => {
        const v = String(raw ?? "").trim().toUpperCase();
        return ["A1", "A2", "B1", "B2", "C1", "C2"].includes(v) ? v : null;
      };
      const criteriaIn = (aiStatus === "ok" && result.criteria && typeof result.criteria === "object" && !Array.isArray(result.criteria))
        ? result.criteria as Record<string, unknown>
        : {};
      const criteria: Record<string, { level: string; comment: string }> = {};
      for (const key of ["task", "coherence", "range", "accuracy"]) {
        const c = criteriaIn[key];
        if (c && typeof c === "object" && !Array.isArray(c)) {
          const cr = c as Record<string, unknown>;
          const level = validLevel(cr.level);
          const comment = toText(cr.comment, 500);
          if (level && comment) criteria[key] = { level, comment };
        }
      }
      const overallLevel = aiStatus === "ok" ? validLevel(result.overall_level) : null;
      const aiStrengths = aiStatus === "ok" && Array.isArray(result.strengths)
        ? (result.strengths as unknown[]).map((s) => toText(s, 240)).filter(Boolean).slice(0, 4)
        : [];
      const aiImprovements = aiStatus === "ok" && Array.isArray(result.improvements)
        ? (result.improvements as unknown[]).map((s) => toText(s, 240)).filter(Boolean).slice(0, 4)
        : [];
      const usable = Boolean(overallLevel) && Object.keys(criteria).length > 0;

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        fallback: !usable,
        target_level: targetLevel,
        word_count: wordCount,
        stats,
        checks,
        overall_level: usable ? overallLevel : null,
        criteria: usable ? criteria : {},
        strengths: usable ? aiStrengths : positives,
        improvements: usable ? aiImprovements : checks,
        actionable_next_step: usable ? toText(result.actionable_next_step, 500) : "",
        rewrite_sample: usable ? toText(result.rewrite_sample, 1000) : "",
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

      const { data: result, status: aiStatus, error: aiError } = await callEnglishAIWithStatus<{
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
      if (aiStatus === "failed") console.error(JSON.stringify({ event: "english_ai_failed", route, request_id: requestId, error: String(aiError ?? "").slice(0, 300) }));

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

      const { data: result, status: aiStatus, error: aiError } = await callEnglishAIWithStatus<{
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
      if (aiStatus === "failed") console.error(JSON.stringify({ event: "english_ai_failed", route, request_id: requestId, error: String(aiError ?? "").slice(0, 300) }));

      const cleanList = <T extends Record<string, unknown>>(rows: unknown, mapper: (r: Record<string, unknown>) => T, max: number): T[] =>
        Array.isArray(rows)
          ? (rows as unknown[])
              .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r))
              .map(mapper)
              .filter((r) => Object.values(r).some(Boolean))
              .slice(0, max)
          : [];

      // Only keep phrases that really appear in the learner's text.
      const lowerSource = sourceText.toLowerCase();
      const inSource = (phrase: string) => Boolean(phrase) && lowerSource.includes(phrase.toLowerCase());
      const idioms = (aiStatus === "ok" ? cleanList(result.idioms, (r) => ({
        phrase: toText(r.phrase, 200),
        meaning: toText(r.meaning, 400),
        register: toText(r.register, 24),
        example: toText(r.example, 400),
      }), 6) : []).filter((r) => inSource(r.phrase) && r.meaning);
      const collocations = (aiStatus === "ok" ? cleanList(result.collocations, (r) => ({
        phrase: toText(r.phrase, 160),
        type: toText(r.type, 24),
        meaning: toText(r.meaning, 240),
        example: toText(r.example, 400),
      }), 8) : []).filter((r) => inSource(r.phrase) && r.meaning);
      const culturalNotes = aiStatus === "ok" && Array.isArray(result.cultural_notes)
        ? (result.cultural_notes as unknown[]).map((n) => toText(n, 400)).filter(Boolean).slice(0, 4)
        : [];

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        target_level: targetLevel,
        source_text_length: sourceText.length,
        idioms,
        collocations,
        cultural_notes: culturalNotes,
        generated_at: new Date().toISOString(),
      });
    }

    // Dictation: a short passage the browser reads aloud; the learner types
    // what they hear and the card scores it word by word. With AI the passage
    // follows the learner's topic; without AI (or if the model's passage is
    // unusable) a written passage from a small library at the same level is
    // returned, flagged `fallback: true`.
    if (req.method === "POST" && route === "/ai/dictation/generate") {
      const body = await parseBody(req);
      const targetLevel = toText((body as Record<string, unknown>).target_level, 8).toUpperCase() || "B1";
      const topic = toText((body as Record<string, unknown>).topic, 120);
      const accent = toText((body as Record<string, unknown>).accent, 24).toLowerCase() || "neutral";
      const speed = toText((body as Record<string, unknown>).speed, 16).toLowerCase() === "slow" ? "slow" : "normal";
      const previousText = toText((body as Record<string, unknown>).previous_text, 600);
      if (!["A1", "A2", "B1", "B2", "C1", "C2"].includes(targetLevel)) {
        return json(400, { error: "target_level must be one of A1 A2 B1 B2 C1 C2", code: "invalid_level" });
      }

      type DictationItem = { text: string; tricky: string[]; question: string; answer: string };
      const library: Record<string, DictationItem[]> = {
        A1: [
          { text: "My name is Aziz. I live in Samarkand with my family. Every morning I drink green tea and eat bread.", tricky: ["Samarkand", "family", "morning"], question: "What does Aziz drink every morning?", answer: "green tea" },
          { text: "Today is Sunday. The weather is sunny and warm. We are going to the park with our friends.", tricky: ["weather", "warm", "friends"], question: "What day is it today?", answer: "Sunday" },
          { text: "This is my classroom. There are twenty desks and a big window. Our teacher is kind and funny.", tricky: ["classroom", "twenty", "window"], question: "How many desks are there?", answer: "twenty" },
        ],
        A2: [
          { text: "Last weekend I visited my grandparents in the village. My grandmother cooked plov, and we ate it in the garden. In the evening we walked to the river.", tricky: ["grandparents", "village", "evening"], question: "Where did they eat the plov?", answer: "in the garden" },
          { text: "The bus to the city centre leaves every twenty minutes. You can buy a ticket from the driver or pay with a card.", tricky: ["centre", "leaves", "ticket"], question: "How often does the bus leave?", answer: "every twenty minutes" },
          { text: "On Saturdays I help my uncle at his shop. I put fruit and vegetables on the shelves and talk to the customers. It is tiring, but I enjoy it.", tricky: ["vegetables", "shelves", "customers"], question: "Who does the speaker help on Saturdays?", answer: "uncle" },
        ],
        B1: [
          { text: "Although it was raining, we decided to walk to the new museum because the bus was running late. When we arrived, our shoes were wet, but the exhibition was worth it.", tricky: ["although", "decided", "exhibition", "worth"], question: "Why did they walk to the museum?", answer: "the bus was late" },
          { text: "My sister has been learning to cook for six months. At first she burned almost everything, but now she can make soup, salads and even fresh bread.", tricky: ["has been learning", "burned", "almost", "salads"], question: "How long has she been learning to cook?", answer: "six months" },
          { text: "When I started my new job, I was nervous about speaking English in meetings. My manager suggested that I prepare a few notes before each meeting, and it really helped.", tricky: ["nervous", "manager", "suggested", "prepare"], question: "What did the manager suggest?", answer: "prepare notes" },
        ],
        B2: [
          { text: "If I had known about the meeting earlier, I would have prepared a more detailed proposal. Next time, I'll ask the team to share the agenda at least a day in advance.", tricky: ["would have", "detailed", "proposal", "agenda"], question: "What will the speaker ask the team to share?", answer: "the agenda" },
          { text: "Many students choose to study online because it lets them work part-time while they finish their degrees. However, they often say that staying motivated at home is harder than they expected.", tricky: ["part-time", "degrees", "motivated", "expected"], question: "What do the students find harder than they expected?", answer: "staying motivated" },
        ],
        C1: [
          { text: "The committee acknowledged that, despite the complexity of the proposal, its underlying logic was surprisingly convincing. Nevertheless, they postponed the final decision until further research could be carried out.", tricky: ["acknowledged", "underlying", "nevertheless", "postponed"], question: "What did the committee do with the final decision?", answer: "postponed it" },
          { text: "Learning a language as an adult requires patience, but it has its advantages: adults are often good at noticing patterns and at setting realistic goals for themselves.", tricky: ["requires", "advantages", "noticing", "realistic"], question: "What are adults often good at noticing?", answer: "patterns" },
        ],
        C2: [
          { text: "Notwithstanding the initial scepticism, the restoration of the old caravanserai has been widely praised, not least because the architects resisted the temptation to modernise its character.", tricky: ["notwithstanding", "scepticism", "caravanserai", "temptation"], question: "What did the architects resist?", answer: "the temptation to modernise" },
          { text: "Had the negotiations collapsed, the consequences for regional trade would have been considerable; as it was, both sides emerged with a compromise that, while imperfect, proved remarkably durable.", tricky: ["had the negotiations", "consequences", "considerable", "durable"], question: "What did both sides emerge with?", answer: "a compromise" },
        ],
      };

      const { data: result, status: aiStatus, error: aiError } = await callEnglishAIWithStatus<{
        text?: unknown;
        tricky_tokens?: unknown;
        comprehension_question?: unknown;
        comprehension_answer?: unknown;
      }>(
        {
          systemPrompt:
            "You are an English listening teacher writing a short dictation passage. Write 2-3 sentences (about 25-50 words) at the target CEFR level, on the requested topic, in natural spoken English that is easy to read aloud. Avoid real people, brands, politics and religion. Return strict JSON: {text: the passage exactly as it should be heard, tricky_tokens: array (max 5) of words from the passage the learner may mishear or misspell, comprehension_question: one short question about the passage, comprehension_answer: the answer in 1-4 words taken from the passage}.",
          userPayload: JSON.stringify({
            target_level: targetLevel,
            topic: topic || "an everyday situation a learner would meet",
            accent_hint: accent,
          }),
          temperature: 0.7,
        },
        { text: "", tricky_tokens: [], comprehension_question: "", comprehension_answer: "" },
      );
      if (aiStatus === "failed") console.error(JSON.stringify({ event: "english_ai_failed", route, request_id: requestId, error: String(aiError ?? "").slice(0, 300) }));

      const aiText = aiStatus === "ok" ? toText(result.text, 600) : "";
      const aiWords = aiText.split(/\s+/).filter(Boolean).length;
      const usable = aiWords >= 8 && aiWords <= 90;
      let item: DictationItem;
      if (usable) {
        const lowerText = aiText.toLowerCase();
        const question = toText(result.comprehension_question, 200);
        const answer = toText(result.comprehension_answer, 60);
        item = {
          text: aiText,
          tricky: Array.isArray(result.tricky_tokens)
            ? (result.tricky_tokens as unknown[]).map((t) => toText(t, 60)).filter((t) => t && lowerText.includes(t.toLowerCase())).slice(0, 5)
            : [],
          question: question && answer ? question : "",
          answer: question && answer ? answer : "",
        };
      } else {
        const pool = library[targetLevel] ?? library.B1!;
        const options = pool.filter((p) => p.text !== previousText);
        const pick = options.length ? options : pool;
        item = pick[Math.floor(Math.random() * pick.length)]!;
      }

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        fallback: !usable,
        target_level: targetLevel,
        topic: usable ? topic || null : null,
        accent,
        speed,
        text: item.text,
        tricky_tokens: item.tricky,
        comprehension_question: item.question,
        comprehension_answer: item.answer,
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

      const { data: result, status: aiStatus, error: aiError } = await callEnglishAIWithStatus<{
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
      if (aiStatus === "failed") console.error(JSON.stringify({ event: "english_ai_failed", route, request_id: requestId, error: String(aiError ?? "").slice(0, 300) }));

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

      const { data: result, status: aiStatus, error: aiError } = await callEnglishAIWithStatus<{
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
      if (aiStatus === "failed") console.error(JSON.stringify({ event: "english_ai_failed", route, request_id: requestId, error: String(aiError ?? "").slice(0, 300) }));

      const safeArrayOfStrings = (raw: unknown): string[] =>
        Array.isArray(raw) ? (raw as unknown[]).map((r) => toText(r, 400)).filter(Boolean).slice(0, 6) : [];

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
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

      const { data: result, status: aiStatus, error: aiError } = await callEnglishAIWithStatus<{
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
      if (aiStatus === "failed") console.error(JSON.stringify({ event: "english_ai_failed", route, request_id: requestId, error: String(aiError ?? "").slice(0, 300) }));

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

      const { data: result, status: aiStatus, error: aiError } = await callEnglishAIWithStatus<{
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
      if (aiStatus === "failed") console.error(JSON.stringify({ event: "english_ai_failed", route, request_id: requestId, error: String(aiError ?? "").slice(0, 300) }));

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

      const { data: result, status: aiStatus, error: aiError } = await callEnglishAIWithStatus<{
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
      if (aiStatus === "failed") console.error(JSON.stringify({ event: "english_ai_failed", route, request_id: requestId, error: String(aiError ?? "").slice(0, 300) }));

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

      const { data: result, status: aiStatus, error: aiError } = await callEnglishAIWithStatus<{
        chunks?: unknown;
        global_tips?: unknown;
        warm_up?: unknown;
      }>(
        {
          systemPrompt:
            "You are an English pronunciation and prosody coach preparing a passage for SHADOWING practice. Split the source into 6-12 chunks of 4-7 seconds spoken time (~10-22 words each, naturally bounded by clauses or breath groups — never mid-phrase). For each chunk pick the SINGLE most useful pronunciation focus for a learner at the target level. Return strict JSON: {chunks: array of {index: 0-based, text: the exact words to shadow (preserve casing/punctuation as it should be spoken), focus_label: 1-3 word skill name (e.g. 'linking', 'weak forms', 'rising intonation', 'sentence stress', 'consonant clusters'), focus_explanation: 1 short sentence in simple English telling the learner exactly what to do with their voice on THIS chunk, watch_for: 1-3 words from the chunk to say carefully}, warm_up: 1-2 short sentences in simple English to start the practice, global_tips: array (max 3) of short reminders in simple English}.",
          userPayload: JSON.stringify({
            source_text: sourceText,
            target_level: targetLevel,
            accent_hint: accent,
          }),
          temperature: 0.4,
        },
        { chunks: [], global_tips: [], warm_up: "" },
      );
      if (aiStatus === "failed") console.error(JSON.stringify({ event: "english_ai_failed", route, request_id: requestId, error: String(aiError ?? "").slice(0, 300) }));

      const aiChunks = aiStatus === "ok" && Array.isArray(result.chunks)
        ? (result.chunks as unknown[])
            .filter((c): c is Record<string, unknown> => !!c && typeof c === "object" && !Array.isArray(c))
            .map((c) => ({
              text: toText(c.text, 400),
              focus_label: toText(c.focus_label, 60),
              focus_explanation: toText(c.focus_explanation, 300),
              watch_for: Array.isArray(c.watch_for)
                ? (c.watch_for as unknown[]).map((w) => toText(w, 60)).filter(Boolean).slice(0, 4)
                : [],
            }))
            .filter((c) => c.text && c.focus_label)
            .slice(0, 14)
            .map((c, index) => ({ index, ...c }))
        : [];
      const usable = aiChunks.length >= 2;

      // Without AI: split the passage into short breath groups (sentences,
      // then commas, then about 12 words) so shadowing still works.
      const splitIntoChunks = (passage: string): string[] => {
        const out: string[] = [];
        const wordsOf = (s: string) => s.split(/\s+/).filter(Boolean);
        for (const sentence of passage.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/)) {
          const trimmed = sentence.trim();
          if (!trimmed) continue;
          if (wordsOf(trimmed).length <= 18) {
            out.push(trimmed);
            continue;
          }
          let current = "";
          for (const part of trimmed.split(/(?<=[,;:])\s+|\s+(?=[–—-]\s)/)) {
            const candidate = current ? `${current} ${part}` : part;
            if (current && wordsOf(candidate).length > 18) {
              out.push(current);
              current = part;
            } else {
              current = candidate;
            }
          }
          if (current) out.push(current);
        }
        const final: string[] = [];
        for (const chunk of out) {
          const w = wordsOf(chunk);
          if (w.length <= 22) {
            final.push(chunk);
          } else {
            for (let i = 0; i < w.length; i += 12) final.push(w.slice(i, i + 12).join(" "));
          }
        }
        return final.slice(0, 14);
      };
      const chunks = usable
        ? aiChunks
        : splitIntoChunks(sourceText).map((text, index) => ({ index, text, focus_label: "", focus_explanation: "", watch_for: [] as string[] }));

      const globalTips = usable && Array.isArray(result.global_tips)
        ? (result.global_tips as unknown[]).map((t) => toText(t, 300)).filter(Boolean).slice(0, 3)
        : [];

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        fallback: !usable,
        target_level: targetLevel,
        accent,
        source_text_length: sourceText.length,
        warm_up: usable ? toText(result.warm_up, 300) : "",
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

      // Remember the graded result, so saving it can be told apart from a chosen level.
      const testRecord = aiStatus === "ok" ? testResultRecord(overallLevel, perSkill) : null;
      if (testRecord) {
        const { data: goalRow } = await sb.from("learner_language_goals")
          .select("metadata")
          .eq("user_id", auth.userId)
          .eq("language_id", scope.languageId)
          .maybeSingle();
        const goalMeta = ((goalRow as Record<string, unknown> | null)?.metadata ?? {}) as Record<string, unknown>;
        const { error: recordError } = await sb.from("learner_language_goals").upsert(
          { user_id: auth.userId, language_id: scope.languageId, metadata: { ...goalMeta, placement_test_result: testRecord } },
          { onConflict: "user_id,language_id" },
        );
        if (recordError) console.error(JSON.stringify({ event: "english_placement_record_failed", request_id: requestId, error: recordError.message }));
      }

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

      // Everything the tutor should know about this learner, built on the server.
      const profile = await buildTutorProfile(sb, auth.userId, scope.languageId);
      const savedMemories = await loadTutorMemories(sb, auth.userId, scope.languageId);
      const knownTexts = new Set(savedMemories.map((memory) => memory.text.toLowerCase()));
      const allMemories = [
        ...savedMemories.map((memory) => ({ id: memory.id, text: memory.text, kind: memory.kind })),
        ...memories.filter((memory) => !knownTexts.has(memory.text.toLowerCase())),
      ].slice(0, 30);

      const { data: result, status: aiStatus, error: aiError } = await callEnglishAIWithStatus<{
        reply?: unknown;
        suggested_memories?: unknown;
        suggested_actions?: unknown;
      }>(
        {
          systemPrompt:
            "You are an English study tutor with personal continuity. The learner's message history and a list of MEMORIES (facts they previously asked you to remember about them — goals, preferences, struggles, wins, context) are provided. Use the memories naturally; do NOT recite them. A LEARNER_PROFILE built from their real activity is also provided: their level per skill, goal, the grammar mistakes they keep making (with examples), recent results and saved words they are practising. Personalise with it: when a question touches a recurring mistake, point it out kindly and give a short example; weave their saved words into examples; never invent progress that is not in the profile. Reply in 1-3 paragraphs, warm but concise, in the same language they wrote in (default English). When something in the conversation looks worth remembering long-term — a stated goal, a recurring weakness, a deadline, a preference about how they want to be coached, a notable win — propose 1-3 NEW memories to add. Do NOT suggest memories that duplicate what's already saved. Optionally suggest 1-2 short next-actions with relative routes ('/reading', '/writing', '/grammar', '/vocabulary', '/speaking', '/listening', '/immersion', '/review', '/progress', '/today', or a specific lesson like '/grammar/<lesson-slug>' taken from the profile). Return strict JSON: {reply: the assistant message, suggested_memories: array (max 3) of {kind: 'goal'|'preference'|'struggle'|'win'|'context'|'deadline', text: 1-sentence fact in second person ('You prefer...', 'You aim to...')}, suggested_actions: array (max 2) of {label: 3-5 word CTA, route: relative URL, why: 1 short sentence}}.",
          userPayload: JSON.stringify({
            learner_profile: profile,
            existing_memories: allMemories,
            messages,
          }),
          temperature: 0.6,
        },
        { reply: "", suggested_memories: [], suggested_actions: [] },
      );
      if (aiStatus === "failed") console.error(JSON.stringify({ event: "english_ai_failed", route, request_id: requestId, error: String(aiError ?? "").slice(0, 300) }));

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

      const { data: result, status: aiStatus, error: aiError } = await callEnglishAIWithStatus<{
        per_word?: unknown;
        prosody_notes?: unknown;
        l1_interference?: unknown;
        retry_priority?: unknown;
      }>(
        {
          systemPrompt:
            "You are an English pronunciation coach analysing a learner's spoken attempt. You receive (a) the canonical target text, (b) what a speech recognizer heard, (c) optional learner L1, (d) target CEFR level. Compare carefully — recognizer errors include substitutions ('three'→'tree'), omissions, and run-ons (worst-case word boundaries). Diagnose the likely pronunciation issues (specific phonemes, stress placement, weak forms, linking) — NOT spelling. Write every tip in short, simple English that a B1 learner understands. Return strict JSON: {per_word: array of {target_word, what_was_heard, likely_issue: 1 line on the phonetic problem, fix_tip: 1 line on how to articulate it}, prosody_notes: array (max 3) of observations on stress / rhythm / linking based on the divergence pattern, l1_interference: array (max 2) of common L1-driven issues likely behind these errors (only if user_l1 hints at it; else empty), retry_priority: 1 sentence telling the learner the SINGLE most useful thing to fix on the next attempt}.",
          userPayload: JSON.stringify({
            target_text: targetText,
            recognized_text: recognized,
            user_l1: userL1 || null,
            target_level: targetLevel,
          }),
          temperature: 0.3,
        },
        { per_word: [], prosody_notes: [], l1_interference: [], retry_priority: "" },
      );
      if (aiStatus === "failed") console.error(JSON.stringify({ event: "english_ai_failed", route, request_id: requestId, error: String(aiError ?? "").slice(0, 300) }));

      // Rule-based word match (always returned): which words of the target
      // the speech recognizer heard. This is a measured number, not a guess.
      const normalizeWords = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9'\s-]/g, " ").split(/[\s-]+/).filter(Boolean);
      const targetWords = normalizeWords(targetText);
      const heardCounts = new Map<string, number>();
      for (const w of normalizeWords(recognized)) heardCounts.set(w, (heardCounts.get(w) ?? 0) + 1);
      const missed: string[] = [];
      let matched = 0;
      for (const w of targetWords) {
        const left = heardCounts.get(w) ?? 0;
        if (left > 0) {
          matched += 1;
          heardCounts.set(w, left - 1);
        } else if (!missed.includes(w)) {
          missed.push(w);
        }
      }
      const wordsTotal = targetWords.length;
      const accuracyScore = wordsTotal ? Math.round((matched / wordsTotal) * 100) : 0;

      const lowerTarget = targetText.toLowerCase();
      const perWord = aiStatus === "ok" && Array.isArray(result.per_word)
        ? (result.per_word as unknown[])
            .filter((w): w is Record<string, unknown> => !!w && typeof w === "object" && !Array.isArray(w))
            .map((w) => ({
              target_word: toText(w.target_word, 60),
              what_was_heard: toText(w.what_was_heard, 60),
              likely_issue: toText(w.likely_issue, 240),
              fix_tip: toText(w.fix_tip, 300),
            }))
            .filter((w) => w.target_word && w.likely_issue && lowerTarget.includes(w.target_word.toLowerCase()))
            .slice(0, 12)
        : [];
      const prosodyNotes = aiStatus === "ok" && Array.isArray(result.prosody_notes)
        ? (result.prosody_notes as unknown[]).map((n) => toText(n, 300)).filter(Boolean).slice(0, 3)
        : [];
      const l1Interference = aiStatus === "ok" && Array.isArray(result.l1_interference)
        ? (result.l1_interference as unknown[]).map((n) => toText(n, 300)).filter(Boolean).slice(0, 2)
        : [];
      const retryPriority = aiStatus === "ok" ? toText(result.retry_priority, 300) : "";
      const usable = Boolean(retryPriority) || perWord.length > 0 || prosodyNotes.length > 0;

      return json(200, {
        ok: true,
        ai_available: isEnglishAIConfigured(),
        ai_status: aiStatus,
        fallback: !usable,
        target_text: targetText,
        recognized_text: recognized,
        user_l1: userL1 || null,
        target_level: targetLevel,
        accuracy_score: accuracyScore,
        words_total: wordsTotal,
        words_matched: matched,
        missed_words: missed.slice(0, 15),
        per_word: perWord,
        prosody_notes: prosodyNotes,
        l1_interference: l1Interference,
        retry_priority: retryPriority,
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

      const { data: result, status: aiStatus, error: aiError } = await callEnglishAIWithStatus<{
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
      if (aiStatus === "failed") console.error(JSON.stringify({ event: "english_ai_failed", route, request_id: requestId, error: String(aiError ?? "").slice(0, 300) }));

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
