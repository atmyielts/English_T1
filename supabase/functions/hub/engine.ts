// The learning engine: one coach across the seven skills (hub routes).
//
//   GET  /ratings             fine-grained level per skill ("B1 · 62%") and an
//                             IELTS band estimate; cached in
//                             learner_language_goals.metadata.skill_ratings
//   GET  /next                the single best next step across all skills
//                             (?date=&skill=&slug= of the activity just
//                             finished, ?from_skill= the skill open now,
//                             ?locale= for the title of a role-play to continue)
//   GET  /streak              streak with freezes and "Win it back"
//   POST /ai/progress-check   the monthly check: a 2-round placement test
//
// The rules live in pure _shared modules (english-rating, english-next,
// english-streak, english-progress-check); this file only loads rows and
// stores results.
import { json, loadNotebookStats, parseBody, toText } from "../_shared/english-learning.ts";
import { callEnglishAIWithStatus, isEnglishAIConfigured } from "../_shared/english-ai.ts";
import { checkActivityAccess } from "../_shared/english-allowance.ts";
import { testResultRecord } from "../_shared/english-certificate.ts";
import { perSkillLevels, readLevelHistory } from "../_shared/english-levels.ts";
import { topicFromSubskill } from "../_shared/english-mistakes.ts";
import { pickNextStep } from "../_shared/english-next.ts";
import {
  CHECK_FINAL_PROMPT,
  CHECK_ROUND_PROMPT,
  checkRound,
  checkStartLevel,
  cleanCheckHistory,
  cleanCheckQuestions,
  currentTestedLevels,
  parseCheckResult,
} from "../_shared/english-progress-check.ts";
import { ieltsEstimate, isRatingFresh, type RatedAttempt, rateSkills, type RatingSummary, readRatingSummary } from "../_shared/english-rating.ts";
import { RETIRED_BOX } from "../_shared/english-review.ts";
import { countByDay, streakGuard } from "../_shared/english-streak.ts";
import {
  type AttemptRow,
  type CatalogItem,
  CEFR_ORDER,
  type Cefr,
  isCefr,
  levelStatus,
  pickFixes,
  practiceLevel,
  TODAY_SKILLS,
  type TodaySkill,
  type TodayTask,
} from "../_shared/english-today.ts";
import { learnerDate } from "../_shared/english-xp.ts";
import { loadResumeItems } from "./resume.ts";

type Row = Record<string, unknown>;
type Ctx = { sb: any; userId: string; languageId: string };

// One learner-facing activity per row (sub-items such as single drills are excluded).
const PRIMARY_CONTENT_TYPES = [
  "reading.article",
  "listening.item",
  "writing.prompt",
  "speaking.prompt",
  "grammar.unit",
  "immersion.mission",
  "vocabulary.deck",
];
const DONE_STATUSES = ["submitted", "scored", "failed"];
const DAY_MS = 86_400_000;
const RATING_LOOKBACK_DAYS = 120;
const RATING_ATTEMPT_LIMIT = 800;
const STREAK_LOOKBACK_DAYS = 400;
const PAGE_SIZE = 1000;
const MISTAKE_DAYS = 14;

const isSkill = (value: unknown): value is TodaySkill => (TODAY_SKILLS as readonly string[]).includes(String(value));
const metaOf = (row: Row | null): Row =>
  row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Row : {};
const scoreOf = (row: Row): number | null => {
  // Learners see accuracy; overall_score also blends speed and hint use.
  const raw = row.correctness_ratio ?? row.overall_score;
  const value = Number(raw);
  return raw === null || raw === undefined || !Number.isFinite(value) ? null : Math.max(0, Math.min(1, value));
};
const relation = (row: Row): Row => {
  const value = row.learning_content_registry_items;
  return (Array.isArray(value) ? value[0] : value) as Row ?? {};
};

const loadGoal = async (ctx: Ctx): Promise<Row | null> => {
  const { data, error } = await ctx.sb.from("learner_language_goals")
    .select("current_cefr_estimate, target_cefr, goal_keys, metadata")
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load goal: ${error.message}`);
  return (data ?? null) as Row | null;
};

/**
 * Writes one metadata key. Uses the atomic database function when it is
 * there; until that migration is applied, falls back to re-reading the row
 * just before writing, which keeps the window for overwriting other keys tiny.
 */
const setMetaKey = async (ctx: Ctx, key: string, value: unknown): Promise<void> => {
  const { error } = await ctx.sb.rpc("english_set_goal_metadata_key", {
    p_user_id: ctx.userId,
    p_language_id: ctx.languageId,
    p_key: key,
    p_value: value,
  });
  if (!error) return;
  const { data } = await ctx.sb.from("learner_language_goals")
    .select("metadata")
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .maybeSingle();
  if (!data) return;
  const { error: updateError } = await ctx.sb.from("learner_language_goals")
    .update({ metadata: { ...metaOf(data as Row), [key]: value } })
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId);
  if (updateError) throw new Error(`Failed to save ${key}: ${updateError.message}`);
};

type EngineAttempt = AttemptRow & { level: Cefr | null };

/** Recent primary activities with their item level, newest first. */
const loadRecentAttempts = async (ctx: Ctx, days: number, limit: number): Promise<EngineAttempt[]> => {
  const since = new Date(Date.now() - days * DAY_MS).toISOString();
  const { data, error } = await ctx.sb.from("learning_attempts")
    .select("content_item_id, service_key, correctness_ratio, overall_score, submitted_at, learning_content_registry_items!inner(cefr_level, content_type)")
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .in("status", DONE_STATUSES)
    .not("submitted_at", "is", null)
    .gte("submitted_at", since)
    .in("learning_content_registry_items.content_type", PRIMARY_CONTENT_TYPES)
    .order("submitted_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load attempts: ${error.message}`);
  return ((data ?? []) as Row[])
    .filter((row) => isSkill(row.service_key))
    .map((row) => {
      const level = relation(row).cefr_level;
      return {
        content_item_id: String(row.content_item_id ?? ""),
        skill: row.service_key as TodaySkill,
        score: scoreOf(row),
        submitted_at: String(row.submitted_at),
        level: isCefr(level) ? level : null,
      };
    });
};

/** The learner's stored level per skill (placement, checks and move-ups), falling back to the overall level. */
const levelsFrom = (goal: Row | null) => {
  const stored = perSkillLevels(metaOf(goal).placement);
  const overall = isCefr(goal?.current_cefr_estimate) ? goal!.current_cefr_estimate as Cefr : null;
  return (skill: TodaySkill): Cefr | null => stored[skill] ?? overall;
};

const lastLevelChangeAt = (meta: Row): string | null => readLevelHistory(meta).at(-1)?.at ?? null;

/**
 * Ratings from the cache while nothing changed, otherwise recomputed and
 * cached. Pass `attempts` when they are already loaded.
 */
const ratingsFor = async (ctx: Ctx, goal: Row | null, attempts?: EngineAttempt[]): Promise<RatingSummary> => {
  const meta = metaOf(goal);
  const cached = readRatingSummary(meta.skill_ratings);
  let latestAt = attempts ? attempts[0]?.submitted_at ?? null : null;
  if (!attempts) {
    const { data } = await ctx.sb.from("learning_attempts")
      .select("submitted_at")
      .eq("user_id", ctx.userId)
      .eq("language_id", ctx.languageId)
      .in("status", DONE_STATUSES)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    latestAt = data?.submitted_at ? String(data.submitted_at) : null;
  }
  if (isRatingFresh({ cached, latestAttemptAt: latestAt, placementAt: lastLevelChangeAt(meta) })) return cached!;

  const rows = attempts ?? await loadRecentAttempts(ctx, RATING_LOOKBACK_DAYS, RATING_ATTEMPT_LIMIT);
  const summary = rateSkills({ attempts: rows as RatedAttempt[], baseLevelFor: levelsFrom(goal) });
  if (goal) {
    try {
      await setMetaKey(ctx, "skill_ratings", summary);
    } catch (error) {
      // The rating is still right; it is just computed again next time.
      console.error(JSON.stringify({ event: "english_rating_cache_failed", user_id: ctx.userId, message: String((error as Error).message ?? error) }));
    }
  }
  return summary;
};

const getRatings = async (ctx: Ctx): Promise<Response> => {
  const goal = await loadGoal(ctx);
  const summary = await ratingsFor(ctx, goal);
  return json(200, {
    ok: true,
    computed_at: summary.computed_at,
    target_level: isCefr(goal?.target_cefr) ? goal!.target_cefr : null,
    skills: TODAY_SKILLS.map((skill) => summary.skills[skill]),
    overall: summary.overall,
    ielts: ieltsEstimate(summary.skills),
  });
};

/** Same date rule as /today, so the stored plan for the learner's day is found. */
const planDateFrom = (url: URL): string => {
  const requested = toText(url.searchParams.get("date"), 10);
  const utcToday = new Date().toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(requested) && Math.abs(Date.parse(requested) - Date.parse(utcToday)) <= DAY_MS
    ? requested
    : utcToday;
};

const loadCatalog = async (ctx: Ctx): Promise<CatalogItem[]> => {
  const { data, error } = await ctx.sb.from("learning_content_registry_items")
    .select("id, service_key, source_ref, title, cefr_level, estimated_minutes, difficulty, tags")
    .eq("language_id", ctx.languageId)
    .eq("status", "published")
    .in("content_type", PRIMARY_CONTENT_TYPES)
    .limit(2000);
  if (error) throw new Error(`Failed to load catalog: ${error.message}`);
  return ((data ?? []) as Row[])
    .filter((row) => isSkill(row.service_key) && row.source_ref)
    .map((row) => ({
      id: String(row.id),
      skill: row.service_key as TodaySkill,
      slug: String(row.source_ref),
      title: String(row.title ?? ""),
      level: isCefr(row.cefr_level) ? row.cefr_level : null,
      minutes: Math.max(1, Number(row.estimated_minutes ?? 10)),
      difficulty: Number(row.difficulty ?? 0.5),
      tags: Array.isArray(row.tags) ? (row.tags as unknown[]).map(String).slice(0, 12) : [],
    }));
};

const getNext = async (ctx: Ctx, url: URL, products: Record<string, { productId?: string | null }>): Promise<Response> => {
  const date = planDateFrom(url);
  const [goal, items, attempts, mistakesRes, unitsRes, notebook, reviewDueRes, access, planRes, resume] = await Promise.all([
    loadGoal(ctx),
    loadCatalog(ctx),
    loadRecentAttempts(ctx, RATING_LOOKBACK_DAYS, RATING_ATTEMPT_LIMIT),
    ctx.sb.from("learner_language_errors")
      .select("subskill_key, error_type, error_frequency, last_seen_at")
      .eq("user_id", ctx.userId)
      .eq("language_id", ctx.languageId)
      .like("subskill_key", "grammar.%")
      .in("mastery_status", ["open", "reopened"])
      .gte("last_seen_at", new Date(Date.now() - MISTAKE_DAYS * DAY_MS).toISOString())
      .limit(200),
    ctx.sb.from("grammar_units")
      .select("slug, focus_area, level")
      .eq("language_id", ctx.languageId)
      .eq("status", "published"),
    loadNotebookStats(ctx.sb, ctx.userId, ctx.languageId).catch(() => ({ dueCount: 0 })),
    ctx.sb.from("learner_review_items")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", ctx.userId)
      .eq("language_id", ctx.languageId)
      .lt("box", RETIRED_BOX)
      .lte("next_due_at", new Date().toISOString()),
    checkActivityAccess(ctx.sb, { userId: ctx.userId, languageId: ctx.languageId, products, skill: null }),
    ctx.sb.from("learner_language_daily_plans")
      .select("summary")
      .eq("user_id", ctx.userId)
      .eq("language_id", ctx.languageId)
      .eq("plan_date", date)
      .maybeSingle(),
    // Something started on any device and not finished comes first ("Continue").
    loadResumeItems(ctx.sb, ctx.userId, ctx.languageId, url.searchParams.get("locale")),
  ]);

  const stored = levelsFrom(goal);
  // Practise a level lower while results at the learner's level stay low (as Today does).
  const levelById = new Map(items.map((item) => [item.id, item.level]));
  const levelFor = (skill: TodaySkill): Cefr | null => {
    const level = stored(skill);
    const scores = attempts
      .filter((attempt) => attempt.skill === skill && attempt.score !== null && level && levelById.get(attempt.content_item_id) === level)
      .map((attempt) => attempt.score as number);
    return practiceLevel(level, levelStatus(scores));
  };

  const grammarBySlug = new Map(items.filter((item) => item.skill === "grammar").map((item) => [item.slug, item]));
  const lessonFor = (topic: string): CatalogItem | null => {
    const target = CEFR_ORDER.indexOf(stored("grammar") ?? "B1");
    const units = ((unitsRes.data ?? []) as Row[])
      .filter((unit) => unit.focus_area === topic && grammarBySlug.has(String(unit.slug)))
      .sort((a, b) => Math.abs(CEFR_ORDER.indexOf(a.level as Cefr) - target) - Math.abs(CEFR_ORDER.indexOf(b.level as Cefr) - target));
    return units[0] ? grammarBySlug.get(String(units[0].slug)) ?? null : null;
  };
  const fixes = pickFixes({
    mistakes: ((mistakesRes.data ?? []) as Row[]).flatMap((row) => {
      const topic = topicFromSubskill(String(row.subskill_key ?? ""));
      return topic ? [{ topic, count: Number(row.error_frequency ?? 1), example: String(row.error_type ?? ""), last_seen_at: String(row.last_seen_at ?? "") }] : [];
    }),
    lessonFor,
    attempts,
  });

  const summary = (planRes.data?.summary ?? {}) as Row;
  const doneToday = new Set(attempts.filter((attempt) => attempt.submitted_at.slice(0, 10) === date).map((attempt) => attempt.content_item_id));
  const planTasks = (summary.generated_by === "hub.today.v1" && Array.isArray(summary.today_tasks) ? summary.today_tasks as TodayTask[] : [])
    .map((task) => ({ ...task, done: task.done || Boolean(task.content_item_id && doneToday.has(task.content_item_id)) }));

  const fromSkill = toText(url.searchParams.get("from_skill") || url.searchParams.get("skill"), 24);
  const slug = toText(url.searchParams.get("slug"), 160);
  const finished = slug && isSkill(fromSkill) ? items.find((item) => item.skill === fromSkill && item.slug === slug) : undefined;

  const ratings = await ratingsFor(ctx, goal, attempts);
  const owned = access.entitled_skills.filter(isSkill);
  const result = pickNextStep({
    items,
    attempts,
    dueReviews: (Number(notebook.dueCount ?? 0) || 0) + (Number(reviewDueRes.count ?? 0) || 0),
    fixes,
    ratings: ratings.skills,
    targetLevel: isCefr(goal?.target_cefr) ? goal!.target_cefr as Cefr : null,
    levelFor,
    planTasks,
    access: { owned: access.basis === "admin" ? [...TODAY_SKILLS] : owned, freeLeft: access.free_left, freeItemIds: access.free_item_ids },
    excludeItemId: finished?.id ?? null,
    fromSkill: isSkill(fromSkill) ? fromSkill : null,
    goalKeys: Array.isArray(goal?.goal_keys) ? (goal!.goal_keys as unknown[]).map(String) : [],
    resume,
  });
  return json(200, { ok: true, date, ...result });
};

const getStreak = async (ctx: Ctx): Promise<Response> => {
  const since = new Date(Date.now() - STREAK_LOOKBACK_DAYS * DAY_MS).toISOString();
  const times: string[] = [];
  for (let page = 0; page < 4; page += 1) {
    const { data, error } = await ctx.sb.from("learning_attempts")
      .select("id, submitted_at, learning_content_registry_items!inner(content_type)")
      .eq("user_id", ctx.userId)
      .eq("language_id", ctx.languageId)
      .in("status", DONE_STATUSES)
      .gte("submitted_at", since)
      .in("learning_content_registry_items.content_type", PRIMARY_CONTENT_TYPES)
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load activity days: ${error.message}`);
    const rows = (data ?? []) as Row[];
    times.push(...rows.map((row) => String(row.submitted_at ?? "")));
    if (rows.length < PAGE_SIZE) break;
  }
  const today = learnerDate(new Date());
  return json(200, { ok: true, today, ...streakGuard(countByDay(times, learnerDate), today) });
};

/** The monthly progress check: two short rounds, then a calibrated verdict. */
const progressCheck = async (ctx: Ctx, req: Request, requestId: string): Promise<Response> => {
  const goal = await loadGoal(ctx);
  const meta = metaOf(goal);
  const placement = meta.placement && typeof meta.placement === "object" ? meta.placement as Row : null;
  if (!goal || !placement?.completed_at) {
    return json(409, { error: "Finish the level test first", code: "english_onboarding_required" });
  }
  const body = await parseBody(req) as Row;
  const { round, finalize } = checkRound(body);
  const history = cleanCheckHistory(body.history);
  const levels = currentTestedLevels(meta, goal.current_cefr_estimate);
  const start = checkStartLevel(levels);

  if (!finalize) {
    const { data, status, error } = await callEnglishAIWithStatus<{ questions?: unknown }>(
      {
        systemPrompt: CHECK_ROUND_PROMPT,
        userPayload: JSON.stringify({ round, levels: levels.per_skill, start_level: start, history }),
        temperature: 0.5,
        feature: "progress-check",
        userId: ctx.userId,
      },
      { questions: [] },
    );
    return json(200, {
      ok: true,
      ai_available: isEnglishAIConfigured(),
      ai_status: status,
      ai_error: error ?? null,
      finalized: false,
      round,
      questions: cleanCheckQuestions(data.questions),
      before: levels,
    });
  }

  if (!history.length) return json(422, { error: "Answer the questions first", code: "check_no_answers" });
  const { data, status, error } = await callEnglishAIWithStatus<Record<string, unknown>>(
    {
      systemPrompt: CHECK_FINAL_PROMPT,
      userPayload: JSON.stringify({ levels_before: levels.per_skill, overall_before: levels.overall, history }),
      temperature: 0.3,
      feature: "progress-check",
      userId: ctx.userId,
    },
    {},
  );
  const result = parseCheckResult(data, levels.overall ?? start);
  // Remember the graded result, so saving it counts as measured (certificates use it).
  const record = status === "ok" ? testResultRecord(result.overall_level, result.per_skill) : null;
  if (record) {
    await setMetaKey(ctx, "placement_test_result", record).catch((cause) =>
      console.error(JSON.stringify({ event: "english_check_record_failed", request_id: requestId, message: String((cause as Error).message ?? cause) })));
  }
  return json(200, {
    ok: true,
    ai_available: isEnglishAIConfigured(),
    ai_status: status,
    ai_error: error ?? null,
    finalized: true,
    ...result,
    before: levels,
  });
};

/** Hub dispatch for the learning engine; null when the route is not one of these. */
export const handleEngineRoute = async (input: Ctx & {
  req: Request;
  url: URL;
  route: string;
  products: unknown;
  requestId: string;
}): Promise<Response | null> => {
  const { req, url, route } = input;
  const ctx: Ctx = { sb: input.sb, userId: input.userId, languageId: input.languageId };
  if (req.method === "GET" && route === "/ratings") return await getRatings(ctx);
  if (req.method === "GET" && route === "/next") return await getNext(ctx, url, input.products as Record<string, { productId?: string | null }>);
  if (req.method === "GET" && route === "/streak") return await getStreak(ctx);
  if (req.method === "POST" && route === "/ai/progress-check") return await progressCheck(ctx, req, input.requestId);
  return null;
};
