// Read-only progress links for parents and teachers. Pure rules:
// _shared/english-progress-link.ts.
//
//   GET  /progress-links               the learner's links (never the token)
//   POST /progress-links               { label? } → { link, url } (the URL is shown once)
//   POST /progress-links/revoke        { id } → stops the page and its Telegram reports
//   GET  /public/progress/:token       the public page data (no session)
//
// The bot side (a parent starting @schoodstudentbot with pl_<token>) is
// subscribeWatcher/stopWatcher, called from ./social-bot.ts.
import { corsHeaders, json, parseBody, toText } from "../_shared/english-learning.ts";
import {
  cleanLinkLabel,
  composePublicProgress,
  generateProgressToken,
  hashProgressToken,
  isProgressToken,
  MAX_ACTIVE_PROGRESS_LINKS,
  MAX_WATCHERS_PER_LINK,
  progressPageUrl,
  tokenHint,
} from "../_shared/english-progress-link.ts";
import { duelFirstName } from "../_shared/english-duel.ts";
import { currentStreak, TODAY_SKILLS, type TodaySkill } from "../_shared/english-today.ts";
import { leagueWeek } from "../_shared/english-xp.ts";

type Row = Record<string, unknown>;

const PUBLIC_PREFIX = "/public/progress/";
const LINK_COLUMNS = "id, token_hint, label, created_at, revoked_at, last_viewed_at, view_count";

const appUrl = () => Deno.env.get("ENGLISH_APP_URL") ?? "https://english.schood.online";

export const isPublicProgressRoute = (method: string, route: string): boolean =>
  method === "GET" && route.startsWith(PUBLIC_PREFIX);

/** The learner's first name only (kid-safe). */
export const learnerFirstName = async (sb: any, userId: string): Promise<string> => {
  const [profile, user] = await Promise.all([
    sb.from("user_profiles").select("first_name").eq("user_id", userId).maybeSingle(),
    sb.from("users").select("full_name").eq("id", userId).maybeSingle(),
  ]);
  return duelFirstName({ first: profile.data?.first_name, full: user.data?.full_name });
};

/** An active link for a token, or null. */
export const findActiveLink = async (sb: any, token: unknown): Promise<Row | null> => {
  if (!isProgressToken(token)) return null;
  const { data, error } = await sb.from("english_progress_links")
    .select("id, user_id, language_id, revoked_at, view_count")
    .eq("token_hash", await hashProgressToken(token))
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new Error(`Failed to load progress link: ${error.message}`);
  return (data as Row | null) ?? null;
};

const DONE_STATUSES = ["submitted", "scored", "failed"];

/** GET /hub/public/progress/:token — 404 for unknown or revoked links. */
export const handlePublicProgress = async (sb: any, route: string): Promise<Response> => {
  const token = decodeURIComponent(route.slice(PUBLIC_PREFIX.length));
  const link = await findActiveLink(sb, token);
  if (!link) return json(404, { error: "Progress link not found", code: "progress_link_not_found" });
  const userId = String(link.user_id);
  const languageId = String(link.language_id);
  const now = new Date();
  const week = leagueWeek(now);
  const [firstName, goalRes, attemptsRes, badgesRes, mistakesRes] = await Promise.all([
    learnerFirstName(sb, userId),
    sb.from("learner_language_goals").select("current_cefr_estimate, per_skill:metadata->placement->per_skill").eq("user_id", userId).eq("language_id", languageId).maybeSingle(),
    sb.from("learning_attempts")
      .select("service_key, submitted_at, time_spent_seconds")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .in("status", DONE_STATUSES)
      .not("submitted_at", "is", null)
      .gte("submitted_at", new Date(now.getTime() - 60 * 86_400_000).toISOString())
      .order("submitted_at", { ascending: false })
      .limit(600),
    sb.from("learner_badges").select("badge_key, earned_at").eq("user_id", userId).eq("language_id", languageId).order("earned_at", { ascending: false }).limit(6),
    sb.from("learner_language_errors")
      .select("service_key, skill_key, subskill_key, error_frequency")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .in("mastery_status", ["open", "reopened"])
      .gte("last_seen_at", new Date(now.getTime() - 30 * 86_400_000).toISOString())
      .limit(300),
  ]);
  if (attemptsRes.error) throw new Error(`Failed to load progress: ${attemptsRes.error.message}`);
  const attempts = ((attemptsRes.data ?? []) as Row[]).map((row) => ({
    skill: String(row.service_key ?? ""),
    submitted_at: String(row.submitted_at),
    seconds: Number(row.time_spent_seconds ?? 0) || null,
  }));
  const learnerToday = new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
  const streak = currentStreak(
    attempts
      .filter((attempt) => (TODAY_SKILLS as readonly string[]).includes(attempt.skill))
      .map((attempt) => ({
        content_item_id: "",
        skill: attempt.skill as TodaySkill,
        score: null,
        submitted_at: new Date(Date.parse(attempt.submitted_at) + 5 * 3_600_000).toISOString(),
      })),
    learnerToday,
  );
  const goal = goalRes.data as Row | null;
  const progress = composePublicProgress({
    firstName,
    goal: goal ? { current_cefr_estimate: goal.current_cefr_estimate, per_skill: (goal.per_skill ?? {}) as Record<string, unknown> } : null,
    streak,
    attempts,
    weekFrom: week.starts_at,
    weekTo: week.ends_at,
    badges: (badgesRes.data ?? []) as Row[],
    mistakes: (mistakesRes.data ?? []) as Row[],
    now,
  });
  // Best effort: a failed counter never hides the page.
  await sb.from("english_progress_links")
    .update({ last_viewed_at: now.toISOString(), view_count: Number((link as Row).view_count ?? 0) + 1 })
    .eq("id", link.id)
    .then(() => null, () => null);
  return new Response(JSON.stringify({ ok: true, progress }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=60", ...corsHeaders },
  });
};

const listLinks = async (sb: any, userId: string, languageId: string) => {
  const { data, error } = await sb.from("english_progress_links")
    .select(LINK_COLUMNS)
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`Failed to load progress links: ${error.message}`);
  const links = (data ?? []) as Row[];
  const ids = links.map((link) => String(link.id));
  const { data: watchers } = ids.length
    ? await sb.from("english_progress_link_watchers").select("link_id").in("link_id", ids).is("stopped_at", null)
    : { data: [] };
  const watching = new Map<string, number>();
  for (const row of (watchers ?? []) as Row[]) watching.set(String(row.link_id), (watching.get(String(row.link_id)) ?? 0) + 1);
  return links.map((link) => ({
    id: String(link.id),
    hint: String(link.token_hint),
    label: link.label ? String(link.label) : null,
    created_at: String(link.created_at),
    revoked_at: link.revoked_at ? String(link.revoked_at) : null,
    last_viewed_at: link.last_viewed_at ? String(link.last_viewed_at) : null,
    views: Number(link.view_count ?? 0) || 0,
    telegram_followers: link.revoked_at ? 0 : watching.get(String(link.id)) ?? 0,
  }));
};

type Input = { sb: any; req: Request; route: string; userId: string; languageId: string };

/** Learner routes; null when the route is not a progress-link route. */
export const handleProgressLinkRoute = async ({ sb, req, route, userId, languageId }: Input): Promise<Response | null> => {
  if (route !== "/progress-links" && route !== "/progress-links/revoke") return null;
  if (req.method === "GET" && route === "/progress-links") {
    return json(200, { ok: true, links: await listLinks(sb, userId, languageId), max_active: MAX_ACTIVE_PROGRESS_LINKS });
  }
  if (req.method !== "POST") return null;
  const body = await parseBody(req) as Row;

  if (route === "/progress-links/revoke") {
    const id = toText(body.id, 64);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json(404, { error: "Link not found", code: "progress_link_not_found" });
    const { data, error } = await sb.from("english_progress_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`Failed to revoke link: ${error.message}`);
    if (!data) return json(404, { error: "Link not found", code: "progress_link_not_found" });
    return json(200, { ok: true, links: await listLinks(sb, userId, languageId) });
  }

  const { count, error: countError } = await sb.from("english_progress_links")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .is("revoked_at", null);
  if (countError) throw new Error(`Failed to count links: ${countError.message}`);
  if (Number(count ?? 0) >= MAX_ACTIVE_PROGRESS_LINKS) {
    return json(429, { error: "Revoke a link before creating another", code: "progress_link_limit" });
  }
  const token = generateProgressToken();
  const { data, error } = await sb.from("english_progress_links").insert({
    user_id: userId,
    language_id: languageId,
    token_hash: await hashProgressToken(token),
    token_hint: tokenHint(token),
    label: cleanLinkLabel(body.label),
  }).select(LINK_COLUMNS).single();
  if (error) throw new Error(`Failed to create link: ${error.message}`);
  const botName = Deno.env.get("TELEGRAM_STUDENT_BOT_NAME") ?? "schoodstudentbot";
  return json(201, {
    ok: true,
    link: { id: String(data.id), hint: String(data.token_hint), label: data.label ?? null, created_at: String(data.created_at) },
    url: progressPageUrl(appUrl(), token),
    telegram_url: `https://t.me/${botName}?start=pl_${token}`,
  });
};

// === Telegram followers (parents and teachers) ===

export type SubscribeResult =
  | { status: "subscribed" | "again"; watcherId: string; firstName: string; pageUrl: string }
  | { status: "invalid" | "full" };

/** A parent started the bot with pl_<token>: they get the weekly report from now on. */
export const subscribeWatcher = async (sb: any, token: string, chatId: string, locale: "en" | "ru" | "uz"): Promise<SubscribeResult> => {
  if (!/^-?\d{1,20}$/.test(chatId)) return { status: "invalid" };
  const link = await findActiveLink(sb, token);
  if (!link) return { status: "invalid" };
  const firstName = await learnerFirstName(sb, String(link.user_id));
  const pageUrl = progressPageUrl(appUrl(), token);
  const { data: existing } = await sb.from("english_progress_link_watchers")
    .select("id, stopped_at")
    .eq("link_id", link.id)
    .eq("chat_id", chatId)
    .maybeSingle();
  if (existing && !existing.stopped_at) return { status: "again", watcherId: String(existing.id), firstName, pageUrl };
  const { count } = await sb.from("english_progress_link_watchers")
    .select("id", { count: "exact", head: true })
    .eq("link_id", link.id)
    .is("stopped_at", null);
  if (Number(count ?? 0) >= MAX_WATCHERS_PER_LINK) return { status: "full" };
  if (existing) {
    await sb.from("english_progress_link_watchers").update({ stopped_at: null, locale }).eq("id", existing.id);
    return { status: "subscribed", watcherId: String(existing.id), firstName, pageUrl };
  }
  const { data, error } = await sb.from("english_progress_link_watchers")
    .insert({ link_id: link.id, chat_id: chatId, locale })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to follow progress: ${error.message}`);
  return { status: "subscribed", watcherId: String(data.id), firstName, pageUrl };
};

/** "Stop weekly reports" from the chat that subscribed. */
export const stopWatcher = async (sb: any, watcherId: string, chatId: string): Promise<boolean> => {
  const { data, error } = await sb.from("english_progress_link_watchers")
    .update({ stopped_at: new Date().toISOString() })
    .eq("id", watcherId)
    .eq("chat_id", chatId)
    .is("stopped_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Failed to stop reports: ${error.message}`);
  return Boolean(data);
};
