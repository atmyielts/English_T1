// GET/POST /hub/goal: the learner's target level and date, and a plan built
// from their real practice time. Settings live in learner_language_goals
// (target_cefr, daily_time_minutes, metadata.goal_plan.target_date).
import { json, parseBody } from "../_shared/english-learning.ts";
import { isCefr, TODAY_SKILLS } from "../_shared/english-today.ts";
import {
  attemptMinutes,
  buildGoalPlan,
  learnerDate,
  parseGoalUpdate,
  type PracticeSession,
  readCurrentLevels,
  readGoalDate,
  weekStart,
  WEEKS_SHOWN,
} from "../_shared/english-goal.ts";

const DAY_MS = 86_400_000;
const MAX_ATTEMPTS = 3000;
const LOOKBACK_LIMIT_DAYS = 365;

type GoalRow = Record<string, unknown> | null;

const metaOf = (row: GoalRow): Record<string, unknown> =>
  row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};

const loadRow = async (sb: any, userId: string, languageId: string): Promise<GoalRow> => {
  const { data, error } = await sb.from("learner_language_goals")
    .select("current_cefr_estimate, target_cefr, daily_time_minutes, metadata")
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load goal: ${error.message}`);
  return data as GoalRow;
};

/** Practice minutes per attempt, falling back to the item's estimated minutes. */
const loadSessions = async (sb: any, userId: string, languageId: string, since: Date): Promise<PracticeSession[]> => {
  const { data, error } = await sb.from("learning_attempts")
    .select("content_item_id, service_key, submitted_at, time_spent_seconds")
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .in("status", ["submitted", "scored", "failed"])
    .in("service_key", [...TODAY_SKILLS])
    .not("submitted_at", "is", null)
    .gte("submitted_at", since.toISOString())
    .order("submitted_at", { ascending: false })
    .limit(MAX_ATTEMPTS);
  if (error) throw new Error(`Failed to load practice time: ${error.message}`);
  const rows = (data ?? []) as Array<Record<string, unknown>>;

  const missing = [...new Set(rows
    .filter((row) => !(Number(row.time_spent_seconds) > 0) && row.content_item_id)
    .map((row) => String(row.content_item_id)))];
  const estimates = new Map<string, number>();
  for (let index = 0; index < missing.length; index += 150) {
    const { data: items } = await sb.from("learning_content_registry_items")
      .select("id, estimated_minutes")
      .in("id", missing.slice(index, index + 150));
    for (const item of (items ?? []) as Array<Record<string, unknown>>) {
      estimates.set(String(item.id), Number(item.estimated_minutes));
    }
  }
  return rows
    .map((row) => ({
      at: String(row.submitted_at),
      minutes: attemptMinutes(row.time_spent_seconds, estimates.get(String(row.content_item_id ?? ""))),
    }))
    .filter((session) => session.minutes > 0);
};

const loadFirstActivity = async (sb: any, userId: string, languageId: string): Promise<string | null> => {
  const { data } = await sb.from("learning_attempts")
    .select("submitted_at")
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .in("status", ["submitted", "scored", "failed"])
    .in("service_key", [...TODAY_SKILLS])
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: true })
    .limit(1);
  const first = (data ?? [])[0] as Record<string, unknown> | undefined;
  return typeof first?.submitted_at === "string" ? first.submitted_at : null;
};

export const loadGoalPlan = async (sb: any, userId: string, languageId: string, row?: GoalRow, now = new Date()) => {
  const goal = row === undefined ? await loadRow(sb, userId, languageId) : row;
  const meta = metaOf(goal);
  const { levels, measuredAt } = readCurrentLevels(meta);

  // Enough history for the eight-week chart and for practice since the last level check.
  const chartStart = Date.parse(`${weekStart(learnerDate(now))}T00:00:00.000Z`) - (WEEKS_SHOWN - 1) * 7 * DAY_MS - 5 * 3_600_000;
  const measured = measuredAt ? Date.parse(measuredAt) : Number.NaN;
  const since = Math.max(
    now.getTime() - LOOKBACK_LIMIT_DAYS * DAY_MS,
    Number.isFinite(measured) ? Math.min(chartStart, measured) : chartStart,
  );
  const [sessions, firstActivityAt] = await Promise.all([
    loadSessions(sb, userId, languageId, new Date(since)),
    loadFirstActivity(sb, userId, languageId),
  ]);

  return buildGoalPlan({
    now,
    targetLevel: isCefr(goal?.target_cefr) ? goal!.target_cefr : null,
    targetDate: readGoalDate(meta),
    levels,
    overallLevel: isCefr(goal?.current_cefr_estimate) ? goal!.current_cefr_estimate : null,
    levelMeasuredAt: measuredAt,
    dailyMinutes: Number(goal?.daily_time_minutes ?? 20) || 20,
    sessions,
    firstActivityAt,
  });
};

export const handleGoalRoute = async (
  req: Request,
  ctx: { sb: any; userId: string; languageId: string },
): Promise<Response> => {
  const { sb, userId, languageId } = ctx;
  if (req.method === "GET") {
    return json(200, { ok: true, ...(await loadGoalPlan(sb, userId, languageId)) });
  }

  const row = await loadRow(sb, userId, languageId);
  if (!row) return json(409, { error: "Finish the level test first", code: "english_onboarding_required" });
  const parsed = parseGoalUpdate(await parseBody(req));
  if (!parsed.ok) return json(422, { error: "Invalid goal", code: parsed.code });

  const { update } = parsed;
  const meta = metaOf(row);
  const patch: Record<string, unknown> = {};
  if (update.target_cefr) patch.target_cefr = update.target_cefr;
  if (update.daily_time_minutes) patch.daily_time_minutes = update.daily_time_minutes;
  if (update.target_date !== undefined) {
    patch.metadata = { ...meta, goal_plan: { target_date: update.target_date, updated_at: new Date().toISOString() } };
  }
  const { error } = await sb.from("learner_language_goals")
    .update(patch)
    .eq("user_id", userId)
    .eq("language_id", languageId);
  if (error) throw new Error(`Failed to save goal: ${error.message}`);

  const saved = { ...row, ...patch } as GoalRow;
  return json(200, { ok: true, ...(await loadGoalPlan(sb, userId, languageId, saved)) });
};
