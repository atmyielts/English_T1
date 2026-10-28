// In-app inbox (hub):
//
//   GET  /inbox          ?summary=1 for just the unread count (the bell)
//   POST /inbox/read     { ids: [...] } or { all: true }
//
// Notices are derived from existing data (level history, badges,
// certificates, streak, due reviews, the monthly check, paused services,
// last week's activity) and stored in english_inbox the first time they are
// shown, so "read" follows the learner across devices. Other features add
// notices with pushInbox() (_shared/english-inbox.ts).
import { json, loadNotebookStats, parseBody } from "../_shared/english-learning.ts";
import { checkActivityAccess } from "../_shared/english-allowance.ts";
import {
  deriveInbox,
  inboxRow,
  type InboxFacts,
  type InboxRow,
  mergeInbox,
  missingDerived,
} from "../_shared/english-inbox.ts";
import { levelCheckStatus, readLevelHistory } from "../_shared/english-levels.ts";
import { RETIRED_BOX } from "../_shared/english-review.ts";
import { countByDay, streakGuard } from "../_shared/english-streak.ts";
import { learnerDate, leagueWeek, previousWeekStart, weekFromStartDate } from "../_shared/english-xp.ts";

type Row = Record<string, unknown>;
type Ctx = { sb: any; req: Request; url: URL; route: string; userId: string; languageId: string; products: Record<string, { productId?: string | null }> };

const DAY_MS = 86_400_000;
const DONE_STATUSES = ["submitted", "scored", "failed"];
// One learner-facing activity per row (as hub/xp.ts): sub-items such as single grammar drills are left out.
const PRIMARY_CONTENT_TYPES = [
  "reading.article",
  "listening.item",
  "writing.prompt",
  "speaking.prompt",
  "speaking.roleplay",
  "speaking.mock",
  "grammar.unit",
  "immersion.mission",
  "vocabulary.deck",
];
const STREAK_DAYS = 60;
const STORED_DAYS = 60;

const loadFacts = async (ctx: Ctx, now: Date): Promise<InboxFacts> => {
  const { sb, userId, languageId } = ctx;
  const announceSince = new Date(now.getTime() - 14 * DAY_MS).toISOString();
  const lastWeek = weekFromStartDate(previousWeekStart(leagueWeek(now).start_date));
  const [goalRes, badgesRes, certificatesRes, attemptsRes, notebook, reviewDueRes, access, lastWeekRes] = await Promise.all([
    sb.from("learner_language_goals").select("metadata").eq("user_id", userId).eq("language_id", languageId).maybeSingle(),
    sb.from("learner_badges").select("badge_key, earned_at").eq("user_id", userId).eq("language_id", languageId).gte("earned_at", announceSince),
    sb.from("english_certificates").select("code, overall, issued_at").eq("user_id", userId).is("revoked_at", null).gte("issued_at", announceSince),
    // Same activities as the streak on Today (GET /streak).
    sb.from("learning_attempts")
      .select("submitted_at, learning_content_registry_items!inner(content_type)")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .in("status", DONE_STATUSES)
      .in("learning_content_registry_items.content_type", PRIMARY_CONTENT_TYPES)
      .gte("submitted_at", new Date(now.getTime() - STREAK_DAYS * DAY_MS).toISOString())
      .order("submitted_at", { ascending: false })
      .limit(1000),
    loadNotebookStats(sb, userId, languageId).catch(() => ({ dueCount: 0 })),
    sb.from("learner_review_items")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .lt("box", RETIRED_BOX)
      .lte("next_due_at", now.toISOString()),
    checkActivityAccess(sb, { userId, languageId, products: ctx.products, skill: null }).catch(() => null),
    sb.from("learning_attempts")
      .select("id, learning_content_registry_items!inner(content_type)", { head: true, count: "exact" })
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .in("status", DONE_STATUSES)
      .in("learning_content_registry_items.content_type", PRIMARY_CONTENT_TYPES)
      .gte("submitted_at", lastWeek.starts_at)
      .lt("submitted_at", lastWeek.ends_at),
  ]);

  const rawMeta = (goalRes.data as Row | null)?.metadata;
  const meta = rawMeta && typeof rawMeta === "object" && !Array.isArray(rawMeta) ? rawMeta as Row : {};
  const times = ((attemptsRes.data ?? []) as Row[]).map((row) => String(row.submitted_at ?? ""));
  const guard = attemptsRes.error ? null : streakGuard(countByDay(times, learnerDate), learnerDate(now));
  // Paused services the learner would actually use: their skills, and the tutor with any plan.
  const owned = new Set(access?.entitled_skills ?? []);
  const paused = access && !access.admin
    ? access.paused_services.filter((service) => owned.has(service) || (service === "tutor" && owned.size > 0))
    : [];
  const check = levelCheckStatus(meta, now);

  return {
    now,
    levels: readLevelHistory(meta),
    badges: badgesRes.error ? [] : ((badgesRes.data ?? []) as Row[]).map((row) => ({ key: String(row.badge_key), earned_at: String(row.earned_at) })),
    certificates: certificatesRes.error ? [] : ((certificatesRes.data ?? []) as Row[]).map((row) => ({ code: String(row.code), overall: String(row.overall), issued_at: String(row.issued_at) })),
    streak: guard ? { current: guard.current, at_risk: guard.at_risk } : null,
    dueReviews: (Number((notebook as { dueCount?: number }).dueCount ?? 0) || 0) + (Number(reviewDueRes.count ?? 0) || 0),
    check: { due: check.due, next_at: check.next_at },
    paused,
    lastWeek: lastWeekRes.error ? null : { start_date: lastWeek.start_date, activities: Number(lastWeekRes.count ?? 0) || 0 },
  };
};

const COLUMNS = "id, kind, dedupe_key, params, title, body, link, created_at, read_at, expires_at";

const getInbox = async (ctx: Ctx): Promise<Response> => {
  const now = new Date();
  const derived = deriveInbox(await loadFacts(ctx, now));
  // Recent notices, plus any stored row for a notice derived now (a live one may be older).
  const keys = derived.map((item) => item.key);
  const [recentRes, derivedRes] = await Promise.all([
    ctx.sb.from("english_inbox")
      .select(COLUMNS)
      .eq("user_id", ctx.userId)
      .gte("created_at", new Date(now.getTime() - STORED_DAYS * DAY_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(120),
    keys.length
      ? ctx.sb.from("english_inbox").select(COLUMNS).eq("user_id", ctx.userId).in("dedupe_key", keys)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const storedRes = recentRes.error ? recentRes : derivedRes.error ? derivedRes : {
    data: [...new Map([...(recentRes.data ?? []), ...(derivedRes.data ?? [])].map((row: InboxRow) => [row.id, row])).values()],
    error: null,
  };

  let stored: InboxRow[];
  if (storedRes.error) {
    // Table not there yet (or unreadable): show what can be derived, unread, without storing.
    console.error(JSON.stringify({ event: "english_inbox_read_failed", message: storedRes.error.message }));
    stored = derived.flatMap((item) => {
      const row = inboxRow(ctx.userId, item);
      return row ? [{ ...row, id: `derived:${item.key}`, read_at: null }] : [];
    });
  } else {
    stored = (storedRes.data ?? []) as InboxRow[];
    const fresh = missingDerived(derived, stored).flatMap((item) => {
      const row = inboxRow(ctx.userId, item);
      return row ? [row] : [];
    });
    if (fresh.length) {
      const { data, error } = await ctx.sb.from("english_inbox")
        .upsert(fresh, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
        .select(COLUMNS);
      if (error) console.error(JSON.stringify({ event: "english_inbox_store_failed", message: error.message }));
      else stored = [...stored, ...((data ?? []) as InboxRow[])];
    }
  }

  const view = mergeInbox(stored, derived, now);
  const summary = ctx.url.searchParams.get("summary") === "1";
  return json(200, summary ? { ok: true, unread: view.unread } : { ok: true, unread: view.unread, items: view.items });
};

const markRead = async (ctx: Ctx): Promise<Response> => {
  const body = await parseBody(ctx.req) as Row;
  const nowIso = new Date().toISOString();
  let query = ctx.sb.from("english_inbox").update({ read_at: nowIso }).eq("user_id", ctx.userId).is("read_at", null);
  if (body.all !== true) {
    const ids = (Array.isArray(body.ids) ? body.ids : [])
      .map(String)
      .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
      .slice(0, 100);
    if (!ids.length) return json(200, { ok: true, updated: 0 });
    query = query.in("id", ids);
  }
  const { data, error } = await query.select("id");
  if (error) throw new Error(`Failed to mark notices read: ${error.message}`);
  return json(200, { ok: true, updated: (data ?? []).length });
};

/** Hub dispatch for the inbox; null when the route is not one of these. */
export const handleInboxRoute = async (ctx: Ctx): Promise<Response | null> => {
  if (ctx.req.method === "GET" && ctx.route === "/inbox") return await getInbox(ctx);
  if (ctx.req.method === "POST" && ctx.route === "/inbox/read") return await markRead(ctx);
  return null;
};
