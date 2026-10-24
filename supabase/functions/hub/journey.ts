// The learner's journey (hub):
//
//   GET /journey   ?week=YYYY-MM-DD (any day of the week; default this week)
//                  &skill=<skill> (optional) &locale=en|ru|uz
//
// One learner-local week of everything they did, wherever they did it:
// activities in every skill, role-plays, speaking mocks, review answers (the
// app and the Telegram Mini App), Telegram quiz answers, saved words, level
// changes, badges and certificates. Read-only, from existing tables; the
// rules live in _shared/english-journey.ts.
import { corsHeaders, toText } from "../_shared/english-learning.ts";
import {
  buildJourneyWeek,
  type JourneyAttempt,
  type JourneyInput,
  journeyWeekStart,
  type JourneyReviewAnswer,
} from "../_shared/english-journey.ts";
import { readLevelHistory } from "../_shared/english-levels.ts";
import { asLocale, roleplayScenario } from "../_shared/english-roleplay.ts";
import { TODAY_SKILLS, type TodaySkill } from "../_shared/english-today.ts";
import { weekFromStartDate } from "../_shared/english-xp.ts";

type Row = Record<string, unknown>;
type Ctx = { sb: any; url: URL; userId: string; languageId: string };

const DONE_STATUSES = ["submitted", "scored", "failed"];
const ROW_LIMIT = 1000;

const relation = (row: Row): Row => {
  const value = row.learning_content_registry_items;
  return ((Array.isArray(value) ? value[0] : value) ?? {}) as Row;
};
const ratio = (row: Row): number | null => {
  const raw = row.correctness_ratio ?? row.overall_score;
  const value = Number(raw);
  return raw === null || raw === undefined || !Number.isFinite(value) ? null : value;
};
const rows = (result: { data?: unknown; error?: { message: string } | null }, what: string): Row[] => {
  if (result.error) throw new Error(`Failed to load ${what}: ${result.error.message}`);
  return (result.data ?? []) as Row[];
};

/** Review answers in a range; `channel` arrives with migration 20261026160200 (older databases: all "app"). */
const loadReviewAnswers = async (ctx: Ctx, from: string, to: string): Promise<JourneyReviewAnswer[]> => {
  const query = (columns: string) => ctx.sb.from("learner_review_answer_log")
    .select(columns)
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .gte("answered_at", from)
    .lt("answered_at", to)
    .order("answered_at", { ascending: false })
    .limit(2000);
  let result = await query("answered_at, correct, channel");
  if (result.error) result = await query("answered_at, correct");
  return rows(result, "review answers").map((row) => ({
    answered_at: String(row.answered_at),
    correct: row.correct === true,
    channel: typeof row.channel === "string" ? row.channel : null,
  }));
};

const getJourney = async (ctx: Ctx): Promise<Response> => {
  const { sb, url, userId, languageId } = ctx;
  const weekStart = journeyWeekStart(toText(url.searchParams.get("week"), 10));
  const week = weekFromStartDate(weekStart);
  const from = week.starts_at;
  const to = week.ends_at;
  const skillParam = toText(url.searchParams.get("skill"), 24);
  const skill = (TODAY_SKILLS as readonly string[]).includes(skillParam) ? skillParam as TodaySkill : null;
  const locale = asLocale(url.searchParams.get("locale"));

  const [attemptsRes, reviews, quizRes, wordsRes, roleplaysRes, mocksRes, goalRes, badgesRes, certificatesRes, earliestRes] = await Promise.all([
    sb.from("learning_attempts")
      .select("id, service_key, correctness_ratio, overall_score, submitted_at, time_spent_seconds, learning_content_registry_items(content_type, source_ref, title, cefr_level)")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .in("status", DONE_STATUSES)
      .gte("submitted_at", from)
      .lt("submitted_at", to)
      .order("submitted_at", { ascending: false })
      .limit(ROW_LIMIT),
    loadReviewAnswers(ctx, from, to),
    sb.from("english_telegram_quiz_questions")
      .select("answered_at, is_correct")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .gte("answered_at", from)
      .lt("answered_at", to)
      .limit(500),
    sb.from("user_vocabulary_notebook_entries")
      .select("created_at")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .gte("created_at", from)
      .lt("created_at", to)
      .limit(ROW_LIMIT),
    sb.from("english_roleplay_sessions")
      .select("id, scenario_id, level, started_at, finished_at, result")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .eq("status", "finished")
      .gte("finished_at", from)
      .lt("finished_at", to)
      .limit(200),
    sb.from("english_speaking_mocks")
      .select("id, started_at, finished_at, overall_band")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .eq("status", "finished")
      .gte("finished_at", from)
      .lt("finished_at", to)
      .limit(100),
    sb.from("learner_language_goals")
      .select("metadata")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .maybeSingle(),
    sb.from("learner_badges")
      .select("badge_key, earned_at")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .gte("earned_at", from)
      .lt("earned_at", to),
    sb.from("english_certificates")
      .select("code, overall, issued_at")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .gte("issued_at", from)
      .lt("issued_at", to),
    sb.from("learning_attempts")
      .select("submitted_at")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .in("status", DONE_STATUSES)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const meta = ((goalRes.data as Row | null)?.metadata ?? {}) as Row;
  const levels = readLevelHistory(meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {});

  const attempts: JourneyAttempt[] = rows(attemptsRes, "attempts").map((row) => {
    const item = relation(row);
    return {
      id: String(row.id),
      skill: String(row.service_key ?? ""),
      content_type: typeof item.content_type === "string" ? item.content_type : null,
      slug: typeof item.source_ref === "string" ? item.source_ref : null,
      title: typeof item.title === "string" ? item.title : null,
      level: typeof item.cefr_level === "string" ? item.cefr_level : null,
      score: ratio(row),
      submitted_at: String(row.submitted_at),
      seconds: Number(row.time_spent_seconds ?? 0) || null,
    };
  });

  // Optional tables (Telegram quiz, certificates) may be missing on an older database; the week still shows.
  const optional = (result: { data?: unknown; error?: unknown }): Row[] => (result.error ? [] : (result.data ?? []) as Row[]);

  const input: JourneyInput = {
    attempts,
    reviews,
    quiz: optional(quizRes).map((row) => ({ answered_at: String(row.answered_at), correct: row.is_correct === true })),
    words: rows(wordsRes, "saved words").map((row) => ({ created_at: String(row.created_at) })),
    roleplays: optional(roleplaysRes).map((row) => {
      const result = (row.result ?? {}) as Row;
      const scenario = roleplayScenario(String(row.scenario_id ?? ""));
      return {
        id: String(row.id),
        scenario_id: String(row.scenario_id ?? ""),
        title: scenario ? scenario.title[locale] || scenario.title.en : null,
        level: typeof row.level === "string" ? row.level : null,
        started_at: typeof row.started_at === "string" ? row.started_at : null,
        finished_at: String(row.finished_at),
        score: Number.isFinite(Number(result.score)) ? Number(result.score) : null,
        goals_met: Number.isFinite(Number(result.goals_met)) ? Number(result.goals_met) : null,
        goals_total: Number.isFinite(Number(result.goals_total)) ? Number(result.goals_total) : null,
      };
    }),
    mocks: optional(mocksRes).map((row) => ({
      id: String(row.id),
      started_at: typeof row.started_at === "string" ? row.started_at : null,
      finished_at: String(row.finished_at),
      band: row.overall_band === null || row.overall_band === undefined ? null : Number(row.overall_band),
    })),
    levels,
    badges: optional(badgesRes).map((row) => ({ key: String(row.badge_key), earned_at: String(row.earned_at) })),
    certificates: optional(certificatesRes).map((row) => ({ code: String(row.code), overall: String(row.overall), issued_at: String(row.issued_at) })),
  };

  const firstActivity = (earliestRes.data as Row | null)?.submitted_at;
  const firstLevel = levels[0]?.at;
  const candidates = [firstActivity, firstLevel].filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)));
  const earliestAt = candidates.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;

  const journey = buildJourneyWeek(input, { weekStart, skill, earliestAt });
  return new Response(JSON.stringify({ ok: true, ...journey, first_at: earliestAt }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=30", ...corsHeaders },
  });
};

/** Hub dispatch for the journey; null when the route is not this one. */
export const handleJourneyRoute = async (ctx: Ctx & { req: Request; route: string }): Promise<Response | null> => {
  if (ctx.req.method === "GET" && ctx.route === "/journey") return await getJourney(ctx);
  return null;
};

