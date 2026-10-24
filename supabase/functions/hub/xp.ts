// XP, weekly leagues and badges (hub routes). The rules live in
// _shared/english-xp.ts; this module only loads rows and stores results.
//
//   GET  /xp                    today's and this week's XP (+ what the latest
//                               attempt at ?skill=&slug= earned)
//   GET  /league                this week's group, ranking and zones
//   GET  /league/settings       privacy settings only (never joins a group)
//   POST /league/settings       { hidden?, opted_out? }
//   GET  /achievements          badges: earned, new, progress toward the rest
//   POST /achievements/seen     { keys: [...] } after the celebration is shown
import { json, loadNotebookStats, parseBody, toText } from "../_shared/english-learning.ts";
import { readLevelHistory } from "../_shared/english-levels.ts";
import { RETIRED_BOX } from "../_shared/english-review.ts";
import { TODAY_SKILLS } from "../_shared/english-today.ts";
import {
  attemptFacts,
  BADGE_KEYS,
  evaluateBadges,
  finalizeStandings,
  isLeagueTier,
  LEAGUE_DEMOTE,
  LEAGUE_GROUP_SIZE,
  LEAGUE_PROMOTE,
  LEAGUE_TIERS,
  type LeagueSettings,
  type LeagueTier,
  leagueName,
  leagueWeek,
  leagueZone,
  learnerDate,
  mergeLeagueSettings,
  rankLeague,
  readLeagueSettings,
  tierAfter,
  type XpAttempt,
  xpByDay,
  type XpDay,
  xpGainedBy,
  type XpReviewAnswer,
  weekFromStartDate,
} from "../_shared/english-xp.ts";

// One learner-facing activity per row; sub-items (single drills, dictation
// sentences) are recorded separately and earn no XP of their own.
const PRIMARY_CONTENT_TYPES = [
  "reading.article",
  "listening.item",
  "writing.prompt",
  "speaking.prompt",
  // Finished role-plays and speaking mocks (./practice.ts).
  "speaking.roleplay",
  "speaking.mock",
  "grammar.unit",
  "immersion.mission",
  "vocabulary.deck",
];
const DONE_STATUSES = ["submitted", "scored", "failed"];
const PAGE_SIZE = 1000;
const DAY_MS = 86_400_000;
const RECENT_GAIN_MS = 30 * 60_000;

type Ctx = { sb: any; userId: string; languageId: string };
type Row = Record<string, unknown>;
type Week = ReturnType<typeof weekFromStartDate>;

const scoreOf = (row: Row): number | null => {
  const raw = row.correctness_ratio ?? row.overall_score;
  const value = Number(raw);
  return raw === null || raw === undefined || !Number.isFinite(value) ? null : Math.max(0, Math.min(1, value));
};

/** Reads every page of a query (stable order required), up to `maxPages`. */
const readPages = async (build: (from: number, to: number) => any, maxPages: number): Promise<Row[]> => {
  const out: Row[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const { data, error } = await build(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
};

export type WeekXp = { attempts: XpAttempt[]; days: Map<string, XpDay>; total: number };

/** Weekly XP for up to one group of learners, from attempts, review answers, completed plans and duels. */
export const loadWeekXp = async (sb: any, languageId: string, userIds: string[], week: Week, until = new Date()): Promise<Map<string, WeekXp>> => {
  const out = new Map<string, WeekXp>();
  if (!userIds.length) return out;
  const from = week.starts_at;
  const to = new Date(Math.min(Date.parse(week.ends_at), until.getTime() + 60_000)).toISOString();
  const [attemptRows, reviewRows, planRows, duelRows] = await Promise.all([
    readPages((start, end) => sb.from("learning_attempts")
      .select("id, user_id, content_item_id, correctness_ratio, overall_score, submitted_at, learning_content_registry_items!inner(content_type)")
      .in("user_id", userIds)
      .eq("language_id", languageId)
      .in("status", DONE_STATUSES)
      // Attempts are inserted on submission; this keeps the user/created_at index in play.
      .gte("created_at", new Date(Date.parse(from) - DAY_MS).toISOString())
      .gte("submitted_at", from)
      .lt("submitted_at", to)
      .in("learning_content_registry_items.content_type", PRIMARY_CONTENT_TYPES)
      .order("submitted_at", { ascending: true })
      .order("id", { ascending: true })
      .range(start, end), 10),
    readPages((start, end) => sb.from("learner_review_answer_log")
      .select("id, user_id, review_item_id, answered_at")
      .in("user_id", userIds)
      .eq("language_id", languageId)
      .eq("correct", true)
      .eq("was_due", true)
      .gte("answered_at", from)
      .lt("answered_at", to)
      .order("id", { ascending: true })
      .range(start, end), 5),
    readPages((start, end) => sb.from("learner_language_daily_plans")
      .select("user_id, plan_date")
      .in("user_id", userIds)
      .eq("language_id", languageId)
      .eq("status", "completed")
      .gte("plan_date", week.dates[0])
      .lte("plan_date", week.dates[6])
      .order("plan_date", { ascending: true })
      .range(start, end), 1),
    // Finished vocabulary duels (english-duel.ts). A missing table never breaks XP.
    readPages((start, end) => sb.from("english_duel_players")
      .select("user_id, duel_id, xp, xp_at")
      .in("user_id", userIds)
      .eq("language_id", languageId)
      .gt("xp", 0)
      .gte("xp_at", from)
      .lt("xp_at", to)
      .order("xp_at", { ascending: true })
      .order("duel_id", { ascending: true })
      .range(start, end), 1).catch(() => [] as Row[]),
  ]);
  const attemptsBy = new Map<string, XpAttempt[]>();
  for (const row of attemptRows) {
    const user = String(row.user_id);
    const list = attemptsBy.get(user) ?? [];
    list.push({ id: String(row.id), content_item_id: String(row.content_item_id ?? ""), score: scoreOf(row), submitted_at: String(row.submitted_at) });
    attemptsBy.set(user, list);
  }
  const reviewsBy = new Map<string, XpReviewAnswer[]>();
  for (const row of reviewRows) {
    const user = String(row.user_id);
    const list = reviewsBy.get(user) ?? [];
    list.push({ item_id: String(row.review_item_id), correct: true, was_due: true, answered_at: String(row.answered_at) });
    reviewsBy.set(user, list);
  }
  const goalsBy = new Map<string, string[]>();
  for (const row of planRows) {
    const user = String(row.user_id);
    goalsBy.set(user, [...(goalsBy.get(user) ?? []), String(row.plan_date)]);
  }
  const duelsBy = new Map<string, Array<{ xp: number; at: string }>>();
  for (const row of duelRows) {
    const user = String(row.user_id);
    duelsBy.set(user, [...(duelsBy.get(user) ?? []), { xp: Number(row.xp ?? 0) || 0, at: String(row.xp_at) }]);
  }
  for (const user of userIds) {
    const attempts = attemptsBy.get(user) ?? [];
    const days = xpByDay({ attempts, reviews: reviewsBy.get(user) ?? [], goalDates: goalsBy.get(user) ?? [], duels: duelsBy.get(user) ?? [] });
    // Days outside the week (plan dates are client dates) never count.
    for (const date of [...days.keys()]) if (!week.dates.includes(date)) days.delete(date);
    out.set(user, { attempts, days, total: [...days.values()].reduce((sum, day) => sum + day.total, 0) });
  }
  return out;
};

const loadSettings = async (ctx: Ctx): Promise<{ exists: boolean; metadata: Row; settings: LeagueSettings }> => {
  const { data } = await ctx.sb.from("learner_language_goals")
    .select("metadata")
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .maybeSingle();
  const metadata = (data?.metadata && typeof data.metadata === "object" ? data.metadata : {}) as Row;
  return { exists: Boolean(data), metadata, settings: readLeagueSettings(metadata) };
};

/** Writes final ranks and outcomes for a group whose week has ended. Idempotent. */
const finalizeGroup = async (sb: any, languageId: string, groupId: string, now = new Date()): Promise<void> => {
  const { data: group } = await sb.from("english_league_groups")
    .select("id, week_start, tier, finalized_at")
    .eq("id", groupId)
    .maybeSingle();
  if (!group || group.finalized_at || !isLeagueTier(group.tier)) return;
  const week = weekFromStartDate(String(group.week_start));
  if (now.getTime() < Date.parse(week.ends_at)) return;
  const { data: memberRows, error } = await sb.from("english_league_members")
    .select("id, user_id, joined_at, left_at")
    .eq("group_id", groupId)
    .limit(LEAGUE_GROUP_SIZE * 2);
  if (error) throw new Error(`Failed to load league group: ${error.message}`);
  const members = (memberRows ?? []) as Row[];
  const active = members.filter((row) => !row.left_at);
  const xp = await loadWeekXp(sb, languageId, active.map((row) => String(row.user_id)), week, new Date(week.ends_at));
  const standings = finalizeStandings(group.tier, active.map((row) => ({
    user_id: String(row.user_id),
    xp: xp.get(String(row.user_id))?.total ?? 0,
    joined_at: String(row.joined_at),
  })));
  const byUser = new Map(standings.map((row) => [row.user_id, row]));
  const results = await Promise.all(members.map((row) => {
    const standing = byUser.get(String(row.user_id));
    return sb.from("english_league_members")
      .update(standing
        ? { final_rank: standing.rank, final_xp: standing.xp, outcome: standing.outcome }
        : { final_rank: null, final_xp: null, outcome: "stayed" })
      .eq("id", row.id);
  }));
  const failed = results.find((result: { error?: { message: string } | null }) => result.error);
  if (failed) throw new Error(`Failed to save league results: ${failed.error.message}`);
  await sb.from("english_league_groups").update({ finalized_at: new Date().toISOString() }).eq("id", groupId).is("finalized_at", null);
};

type Membership = { id: string; group_id: string; tier: LeagueTier; week_start: string; joined_at: string; left_at: string | null };

const MEMBER_COLUMNS = "id, group_id, tier, week_start, joined_at, left_at, outcome, final_rank, final_xp";

const toMembership = (row: Row): Membership => ({
  id: String(row.id),
  group_id: String(row.group_id),
  tier: isLeagueTier(row.tier) ? row.tier : "bronze",
  week_start: String(row.week_start),
  joined_at: String(row.joined_at),
  left_at: row.left_at ? String(row.left_at) : null,
});

/** The learner's most recent week before `weekStart`, finalized so its outcome is known. */
const lastWeekResult = async (ctx: Ctx, weekStart: string): Promise<Row | null> => {
  const { data } = await ctx.sb.from("english_league_members")
    .select(MEMBER_COLUMNS)
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .lt("week_start", weekStart)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  if (data.outcome) return data as Row;
  try {
    await finalizeGroup(ctx.sb, ctx.languageId, String(data.group_id));
  } catch (error) {
    // Without a final result the learner keeps their tier; the next visit retries.
    console.error(JSON.stringify({ event: "english_league_finalize_failed", group_id: data.group_id, message: String((error as Error).message ?? error) }));
    return data as Row;
  }
  const { data: fresh } = await ctx.sb.from("english_league_members").select(MEMBER_COLUMNS).eq("id", data.id).maybeSingle();
  return (fresh ?? data) as Row;
};

/**
 * This week's membership, placing the learner in a group of their tier on
 * first contact. Learners who left leagues are never placed.
 */
const ensureMembership = async (ctx: Ctx, settings: LeagueSettings, now = new Date()): Promise<Membership | null> => {
  if (settings.opted_out) return null;
  const week = leagueWeek(now);
  const { data: existing } = await ctx.sb.from("english_league_members")
    .select(MEMBER_COLUMNS)
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .eq("week_start", week.start_date)
    .maybeSingle();
  if (existing) {
    if (existing.left_at) {
      // Rejoining in the same week keeps the same seat.
      await ctx.sb.from("english_league_members").update({ left_at: null }).eq("id", existing.id);
      return toMembership({ ...existing, left_at: null });
    }
    return toMembership(existing as Row);
  }
  const previous = await lastWeekResult(ctx, week.start_date);
  const tier = previous && isLeagueTier(previous.tier)
    ? tierAfter(previous.tier, (previous.outcome as "promoted" | "stayed" | "demoted" | null) ?? null)
    : "bronze";
  const { error } = await ctx.sb.rpc("english_league_join", {
    p_user_id: ctx.userId,
    p_language_id: ctx.languageId,
    p_week_start: week.start_date,
    p_tier: tier,
  });
  if (error) throw new Error(`Failed to join league: ${error.message}`);
  const { data: joined } = await ctx.sb.from("english_league_members")
    .select(MEMBER_COLUMNS)
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .eq("week_start", week.start_date)
    .maybeSingle();
  return joined ? toMembership(joined as Row) : null;
};

/** Public names for a group: first name + last initial, or "Learner". Never emails. */
const loadNames = async (sb: any, languageId: string, userIds: string[]) => {
  const [profilesRes, usersRes, goalsRes] = await Promise.all([
    sb.from("user_profiles").select("user_id, first_name, last_name").in("user_id", userIds),
    sb.from("users").select("id, full_name, is_active").in("id", userIds),
    sb.from("learner_language_goals").select("user_id, league:metadata->league").eq("language_id", languageId).in("user_id", userIds),
  ]);
  const profiles = new Map(((profilesRes.data ?? []) as Row[]).map((row) => [String(row.user_id), row]));
  const users = new Map(((usersRes.data ?? []) as Row[]).map((row) => [String(row.id), row]));
  const hidden = new Set(((goalsRes.data ?? []) as Row[])
    .filter((row) => readLeagueSettings({ league: row.league }).hidden)
    .map((row) => String(row.user_id)));
  return (userId: string) => {
    const user = users.get(userId);
    const profile = profiles.get(userId);
    return {
      active: user ? user.is_active !== false : true,
      name: leagueName({ first: profile?.first_name, last: profile?.last_name, full: user?.full_name, hidden: hidden.has(userId) }),
    };
  };
};

const getXp = async (ctx: Ctx, url: URL): Promise<Response> => {
  const now = new Date();
  const week = leagueWeek(now);
  const mine = (await loadWeekXp(ctx.sb, ctx.languageId, [ctx.userId], week, now)).get(ctx.userId);
  const today = learnerDate(now);
  const todayXp = mine?.days.get(today);

  // What the activity the learner just finished earned, for the result screen.
  let lastGain: { xp: number; at: string } | null = null;
  const skill = toText(url.searchParams.get("skill"), 24);
  const slug = toText(url.searchParams.get("slug"), 160);
  if (mine && slug && (TODAY_SKILLS as readonly string[]).includes(skill)) {
    const { data: items } = await ctx.sb.from("learning_content_registry_items")
      .select("id")
      .eq("language_id", ctx.languageId)
      .eq("service_key", skill)
      .eq("source_ref", slug)
      .limit(5);
    const ids = new Set(((items ?? []) as Row[]).map((row) => String(row.id)));
    const latest = mine.attempts
      .filter((attempt) => ids.has(attempt.content_item_id) && now.getTime() - Date.parse(attempt.submitted_at) <= RECENT_GAIN_MS)
      .at(-1);
    if (latest) lastGain = { xp: xpGainedBy(mine.attempts, latest.id), at: latest.submitted_at };
  }

  // A learner joins this week's league the first time they earn XP.
  if ((mine?.total ?? 0) > 0) {
    try {
      const { settings } = await loadSettings(ctx);
      await ensureMembership(ctx, settings, now);
    } catch (error) {
      console.error(JSON.stringify({ event: "english_league_join_failed", user_id: ctx.userId, message: String((error as Error).message ?? error) }));
    }
  }

  return json(200, {
    ok: true,
    today: {
      date: today,
      xp: todayXp?.total ?? 0,
      goal_bonus: (todayXp?.bonus ?? 0) > 0,
    },
    week: {
      start_date: week.start_date,
      ends_at: week.ends_at,
      xp: mine?.total ?? 0,
      days: week.dates.map((date) => ({ date, xp: mine?.days.get(date)?.total ?? 0 })),
    },
    last_gain: lastGain,
  });
};

const getLeague = async (ctx: Ctx): Promise<Response> => {
  const now = new Date();
  const week = leagueWeek(now);
  const { settings } = await loadSettings(ctx);
  const membership = await ensureMembership(ctx, settings, now);
  const previous = await lastWeekResult(ctx, week.start_date);
  const lastWeek = previous && isLeagueTier(previous.tier)
    ? {
      week_start: String(previous.week_start),
      tier: previous.tier,
      rank: previous.final_rank === null || previous.final_rank === undefined ? null : Number(previous.final_rank),
      xp: previous.final_xp === null || previous.final_xp === undefined ? null : Number(previous.final_xp),
      outcome: (previous.outcome as string | null) ?? null,
    }
    : null;
  const base = {
    ok: true,
    settings,
    tiers: LEAGUE_TIERS,
    week: { start_date: week.start_date, ends_at: week.ends_at },
    last_week: lastWeek,
  };
  if (!membership) return json(200, { ...base, tier: null, group: null });

  const { data: memberRows, error } = await ctx.sb.from("english_league_members")
    .select("user_id, joined_at, left_at")
    .eq("group_id", membership.group_id)
    .limit(LEAGUE_GROUP_SIZE * 2);
  if (error) throw new Error(`Failed to load league group: ${error.message}`);
  const seated = ((memberRows ?? []) as Row[]).filter((row) => !row.left_at);
  const ids = seated.map((row) => String(row.user_id));
  const [xp, nameOf] = await Promise.all([
    loadWeekXp(ctx.sb, ctx.languageId, ids, week, now),
    loadNames(ctx.sb, ctx.languageId, ids),
  ]);
  const ranked = rankLeague(seated
    .filter((row) => String(row.user_id) === ctx.userId || nameOf(String(row.user_id)).active)
    .map((row) => ({ user_id: String(row.user_id), xp: xp.get(String(row.user_id))?.total ?? 0, joined_at: String(row.joined_at) })));
  const size = ranked.length;
  const members = ranked.map((row) => ({
    rank: row.rank,
    name: nameOf(row.user_id).name,
    xp: row.xp,
    me: row.user_id === ctx.userId,
    zone: leagueZone({ rank: row.rank, size, tier: membership.tier, xp: row.xp }),
  }));
  return json(200, {
    ...base,
    tier: membership.tier,
    group: {
      size,
      capacity: LEAGUE_GROUP_SIZE,
      promote: LEAGUE_PROMOTE,
      demote: LEAGUE_DEMOTE,
      members,
    },
  });
};

const saveLeagueSettings = async (ctx: Ctx, req: Request): Promise<Response> => {
  const current = await loadSettings(ctx);
  if (!current.exists) return json(409, { error: "Finish the level test first", code: "english_onboarding_required" });
  const next = mergeLeagueSettings(current.settings, await parseBody(req) as Row);
  const { error } = await ctx.sb.from("learner_language_goals")
    .update({ metadata: { ...current.metadata, league: next } })
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId);
  if (error) throw new Error(`Failed to save league settings: ${error.message}`);
  if (next.opted_out && !current.settings.opted_out) {
    // Leaving takes the learner out of this week's ranking straight away.
    await ctx.sb.from("english_league_members")
      .update({ left_at: new Date().toISOString() })
      .eq("user_id", ctx.userId)
      .eq("language_id", ctx.languageId)
      .eq("week_start", leagueWeek().start_date)
      .is("left_at", null);
  }
  return json(200, { ok: true, settings: next });
};

const getAchievements = async (ctx: Ctx): Promise<Response> => {
  const since = new Date(Date.now() - 400 * DAY_MS).toISOString();
  const [countRes, attemptRows, notebook, goalRes, promotionsRes, earnedRes] = await Promise.all([
    ctx.sb.from("learning_attempts")
      .select("id, learning_content_registry_items!inner(content_type)", { count: "exact", head: true })
      .eq("user_id", ctx.userId)
      .eq("language_id", ctx.languageId)
      .in("status", DONE_STATUSES)
      .not("submitted_at", "is", null)
      .in("learning_content_registry_items.content_type", PRIMARY_CONTENT_TYPES),
    readPages((start, end) => ctx.sb.from("learning_attempts")
      .select("id, content_item_id, service_key, correctness_ratio, overall_score, submitted_at, learning_content_registry_items!inner(content_type)")
      .eq("user_id", ctx.userId)
      .eq("language_id", ctx.languageId)
      .in("status", DONE_STATUSES)
      .gte("created_at", since)
      .not("submitted_at", "is", null)
      .in("learning_content_registry_items.content_type", PRIMARY_CONTENT_TYPES)
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: true })
      .range(start, end), 4),
    loadNotebookStats(ctx.sb, ctx.userId, ctx.languageId).catch(() => ({ totalCount: 0 })),
    ctx.sb.from("learner_language_goals")
      .select("level_history:metadata->level_history")
      .eq("user_id", ctx.userId)
      .eq("language_id", ctx.languageId)
      .maybeSingle(),
    ctx.sb.from("english_league_members")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId)
      .eq("language_id", ctx.languageId)
      .eq("outcome", "promoted"),
    ctx.sb.from("learner_badges")
      .select("badge_key, earned_at, seen_at")
      .eq("user_id", ctx.userId)
      .eq("language_id", ctx.languageId),
  ]);
  if (earnedRes.error) throw new Error(`Failed to load badges: ${earnedRes.error.message}`);

  const fromAttempts = attemptFacts(attemptRows.map((row) => ({
    content_item_id: String(row.content_item_id ?? row.id),
    skill: String(row.service_key ?? ""),
    score: scoreOf(row),
    submitted_at: String(row.submitted_at),
  })));
  const history = readLevelHistory({ level_history: (goalRes.data as Row | null)?.level_history });
  const facts = {
    activities: Math.max(Number(countRes.count ?? 0) || 0, attemptRows.length),
    longest_streak: fromAttempts.longest_streak,
    saved_words: Number(notebook.totalCount ?? 0) || 0,
    best_week_skills: fromAttempts.best_week_skills,
    level_ups: history.filter((entry) => entry.source === "level_up").length,
    level_checks: history.filter((entry) => entry.source === "check").length,
    perfect_scores: fromAttempts.perfect_scores,
    promotions: Number(promotionsRes.count ?? 0) || 0,
  };

  const stored = new Map(((earnedRes.data ?? []) as Row[]).map((row) => [String(row.badge_key), row]));
  const statuses = evaluateBadges(facts, stored.keys());
  const nowIso = new Date().toISOString();
  const fresh = statuses.filter((badge) => badge.earned && !stored.has(badge.key));
  if (fresh.length) {
    const { error } = await ctx.sb.from("learner_badges").upsert(
      fresh.map((badge) => ({ user_id: ctx.userId, language_id: ctx.languageId, badge_key: badge.key, earned_at: nowIso })),
      { onConflict: "user_id,language_id,badge_key", ignoreDuplicates: true },
    );
    if (error) throw new Error(`Failed to save badges: ${error.message}`);
  }
  return json(200, {
    ok: true,
    badges: statuses.map((badge) => {
      const row = stored.get(badge.key);
      return {
        ...badge,
        earned_at: row ? String(row.earned_at) : badge.earned ? nowIso : null,
        new: badge.earned && !row?.seen_at,
      };
    }),
  });
};

const markBadgesSeen = async (ctx: Ctx, req: Request): Promise<Response> => {
  const body = await parseBody(req) as Row;
  const keys = (Array.isArray(body.keys) ? body.keys : []).map((key) => toText(key, 64)).filter((key) => BADGE_KEYS.includes(key));
  if (!keys.length) return json(422, { error: "keys must list badge keys" });
  const { error } = await ctx.sb.from("learner_badges")
    .update({ seen_at: new Date().toISOString() })
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .in("badge_key", keys)
    .is("seen_at", null);
  if (error) throw new Error(`Failed to save badges: ${error.message}`);
  return json(200, { ok: true });
};

/** Hub dispatch for XP, leagues and badges; null when the route is not one of these. */
export const handleXpRoute = async (input: Ctx & { req: Request; url: URL; route: string }): Promise<Response | null> => {
  const { req, url, route } = input;
  const ctx: Ctx = { sb: input.sb, userId: input.userId, languageId: input.languageId };
  if (req.method === "GET" && route === "/xp") return await getXp(ctx, url);
  if (req.method === "GET" && route === "/league") return await getLeague(ctx);
  // Settings alone, so opening Settings never places the learner in a group.
  if (req.method === "GET" && route === "/league/settings") {
    const { exists, settings } = await loadSettings(ctx);
    return json(200, { ok: true, settings, can_save: exists });
  }
  if (req.method === "POST" && route === "/league/settings") return await saveLeagueSettings(ctx, req);
  if (req.method === "GET" && route === "/achievements") return await getAchievements(ctx);
  if (req.method === "POST" && route === "/achievements/seen") return await markBadgesSeen(ctx, req);
  return null;
};

/**
 * Logs an answer on the Review page. A correct answer earns XP only if the
 * item was due, so re-answering a retired or not-yet-due item earns nothing.
 * Never fails the answer itself.
 */
export const logReviewAnswer = async (
  sb: any,
  input: { userId: string; languageId: string; itemId: string; correct: boolean; box: number; nextDueAt: unknown; now?: Date },
): Promise<void> => {
  const now = input.now ?? new Date();
  const due = Date.parse(String(input.nextDueAt ?? ""));
  const wasDue = input.box < RETIRED_BOX && Number.isFinite(due) && due <= now.getTime();
  const { error } = await sb.from("learner_review_answer_log").insert({
    user_id: input.userId,
    language_id: input.languageId,
    review_item_id: input.itemId,
    correct: input.correct,
    was_due: wasDue,
    answered_at: now.toISOString(),
  });
  if (error) console.error(JSON.stringify({ event: "english_review_answer_log_failed", user_id: input.userId, message: error.message }));
};
