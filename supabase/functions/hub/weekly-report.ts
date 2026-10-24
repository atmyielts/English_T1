// Sunday-evening weekly report (Tashkent time), run from the hourly reminder
// cron (POST /hub/internal/reminders, see ./reminders.ts). Goes to learners who
// switched it on in Settings → Telegram reminders, and to every parent or
// teacher following one of the learner's progress links in Telegram.
// Delivery uses send-telegram (quiet hours, the study-habit cap and dedupe).
// Composition and text: _shared/english-weekly-report.ts.
import { readLevelHistory } from "../_shared/english-levels.ts";
import { topicFromSubskill } from "../_shared/english-mistakes.ts";
import { learnerClock, readReminderSettings } from "../_shared/english-reminders.ts";
import { currentStreak, TODAY_SKILLS, type TodaySkill } from "../_shared/english-today.ts";
import { leagueWeek } from "../_shared/english-xp.ts";
import {
  levelChangesBetween,
  pickNextFocus,
  summarizeWeek,
  WEEKLY_REPORT_BATCH,
  WEEKLY_REPORT_HOURS,
  weeklyReportButton,
  weeklyReportText,
} from "../_shared/english-weekly-report.ts";
import type { SocialLocale } from "../_shared/english-social-telegram.ts";
import { learnerFirstName } from "./progress-link.ts";
import { loadWeekXp } from "./xp.ts";

type Row = Record<string, unknown>;

type Options = {
  sb: any;
  languageId: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  appUrl: string;
  now?: Date;
  dryRun?: boolean;
  onlyUserIds?: string[];
};

const isLocale = (value: unknown): value is SocialLocale => value === "en" || value === "ru" || value === "uz";

const send = async (options: Options, body: Row) => {
  const response = await fetch(`${options.supabaseUrl}/functions/v1/send-telegram`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.serviceRoleKey}` },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  return { status: response.status, outcome: String((result as Row).outcome ?? "") };
};

/** Everything the report says about one learner's week. */
const loadFacts = async (options: Options, userId: string, goal: Row | null, now: Date) => {
  const { sb, languageId } = options;
  const week = leagueWeek(now);
  const [firstName, attemptsRes, errorsRes, xp] = await Promise.all([
    learnerFirstName(sb, userId),
    sb.from("learning_attempts")
      .select("service_key, submitted_at, time_spent_seconds")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .in("status", ["submitted", "scored", "failed"])
      .not("submitted_at", "is", null)
      .gte("submitted_at", new Date(now.getTime() - 60 * 86_400_000).toISOString())
      .order("submitted_at", { ascending: false })
      .limit(600),
    sb.from("learner_language_errors")
      .select("subskill_key, error_frequency")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .like("subskill_key", "grammar.%")
      .in("mastery_status", ["open", "reopened"])
      .gte("last_seen_at", new Date(now.getTime() - 30 * 86_400_000).toISOString())
      .limit(200),
    loadWeekXp(sb, languageId, [userId], week, now).then((map) => map.get(userId)?.total ?? 0).catch(() => 0),
  ]);
  if (attemptsRes.error) throw new Error(`Failed to load attempts: ${attemptsRes.error.message}`);
  const attempts = ((attemptsRes.data ?? []) as Row[]).map((row) => ({
    skill: String(row.service_key ?? ""),
    submitted_at: String(row.submitted_at),
    seconds: Number(row.time_spent_seconds ?? 0) || null,
  }));
  const summary = summarizeWeek(attempts, week.starts_at, now.toISOString());
  const topics = new Map<string, number>();
  for (const row of (errorsRes.data ?? []) as Row[]) {
    const topic = topicFromSubskill(String(row.subskill_key ?? ""));
    if (topic) topics.set(topic, (topics.get(topic) ?? 0) + Math.max(1, Number(row.error_frequency ?? 1) || 1));
  }
  const known = attempts.filter((attempt) => (TODAY_SKILLS as readonly string[]).includes(attempt.skill));
  const meta = (goal?.metadata && typeof goal.metadata === "object" ? goal.metadata : {}) as Row;
  return {
    firstName,
    week: summary,
    xp,
    streak: currentStreak(
      known.map((attempt) => ({
        content_item_id: "",
        skill: attempt.skill as TodaySkill,
        score: null,
        submitted_at: new Date(Date.parse(attempt.submitted_at) + 5 * 3_600_000).toISOString(),
      })),
      learnerClock(now).date,
    ),
    levelChanges: levelChangesBetween(readLevelHistory(meta), week.starts_at, week.ends_at),
    focus: pickNextFocus({
      topics: [...topics.entries()].map(([topic, count]) => ({ topic, count })),
      week: summary,
      practised: [...new Set(known.map((attempt) => attempt.skill))],
    }),
  };
};

export const runWeeklyReportCycle = async (options: Options) => {
  const { sb, languageId } = options;
  const now = options.now ?? new Date();
  const clock = learnerClock(now);
  const forced = Boolean(options.onlyUserIds?.length);
  if (!forced && !(clock.sunday && (WEEKLY_REPORT_HOURS as readonly number[]).includes(clock.hour))) {
    return { ran: false, considered: 0, sent: [] as unknown[] };
  }
  const week = leagueWeek(now);

  // Learners who asked for the report.
  let goalsQuery = sb.from("learner_language_goals")
    .select("user_id, metadata")
    .eq("language_id", languageId)
    .eq("metadata->telegram_reminder->>report", "true")
    .limit(2000);
  if (forced) goalsQuery = goalsQuery.in("user_id", options.onlyUserIds);
  // Parents and teachers following an active link.
  let watchersQuery = sb.from("english_progress_link_watchers")
    .select("id, chat_id, locale, english_progress_links!inner(user_id, language_id, revoked_at)")
    .is("stopped_at", null)
    .is("english_progress_links.revoked_at", null)
    .eq("english_progress_links.language_id", languageId)
    .limit(5000);
  if (forced) watchersQuery = watchersQuery.in("english_progress_links.user_id", options.onlyUserIds);
  const [goalsRes, watchersRes] = await Promise.all([goalsQuery, watchersQuery]);
  if (goalsRes.error) throw new Error(`Failed to load report settings: ${goalsRes.error.message}`);
  if (watchersRes.error) throw new Error(`Failed to load report followers: ${watchersRes.error.message}`);

  const optedIn = new Map<string, Row>();
  for (const row of (goalsRes.data ?? []) as Row[]) {
    if (readReminderSettings(row.metadata).report) optedIn.set(String(row.user_id), row);
  }
  const watchersBy = new Map<string, Array<{ id: string; chat_id: string; locale: SocialLocale }>>();
  for (const row of (watchersRes.data ?? []) as Row[]) {
    const link = row.english_progress_links as Row | null;
    if (!link) continue;
    const user = String(link.user_id);
    watchersBy.set(user, [...(watchersBy.get(user) ?? []), { id: String(row.id), chat_id: String(row.chat_id), locale: isLocale(row.locale) ? row.locale : "en" }]);
  }
  const candidates = [...new Set([...optedIn.keys(), ...watchersBy.keys()])];
  if (!candidates.length) return { ran: true, considered: 0, sent: [] as unknown[] };

  const { data: doneRows } = await sb.from("english_weekly_report_log")
    .select("user_id")
    .eq("language_id", languageId)
    .eq("week_start", week.start_date)
    .in("user_id", candidates.slice(0, 2000));
  const done = new Set(((doneRows ?? []) as Row[]).map((row) => String(row.user_id)));
  const batch = candidates.filter((id) => forced || !done.has(id)).slice(0, WEEKLY_REPORT_BATCH);

  // Goals for learners only followed by a parent (their locale is the parent's own).
  const missing = batch.filter((id) => !optedIn.has(id));
  const goalsBy = new Map(optedIn);
  if (missing.length) {
    const { data } = await sb.from("learner_language_goals").select("user_id, metadata").eq("language_id", languageId).in("user_id", missing);
    for (const row of (data ?? []) as Row[]) goalsBy.set(String(row.user_id), row);
  }

  const appUrl = options.appUrl.replace(/\/$/, "");
  const sent: unknown[] = [];
  for (const userId of batch) {
    try {
      const goal = goalsBy.get(userId) ?? null;
      const facts = await loadFacts(options, userId, goal, now);
      let learnerSent = false;
      let watchersSent = 0;
      if (optedIn.has(userId)) {
        const locale = readReminderSettings(goal?.metadata).locale;
        const text = weeklyReportText(locale, facts, "learner");
        if (options.dryRun) {
          sent.push({ user_id: userId, audience: "learner", text, dry_run: true });
        } else {
          const delivery = await send(options, {
            user_id: userId,
            text,
            parse_mode: "HTML",
            notification_type: "english_weekly_report",
            category: "study_habit",
            dedupe_key: `english-weekly-report:${week.start_date}`,
            cta_url: `${appUrl}/progress`,
            reply_markup: { inline_keyboard: [[{ text: weeklyReportButton(locale), url: `${appUrl}/progress` }]] },
          });
          learnerSent = delivery.status === 200 && delivery.outcome === "sent";
          sent.push({ user_id: userId, audience: "learner", status: delivery.status, outcome: delivery.outcome });
        }
      }
      for (const watcher of watchersBy.get(userId) ?? []) {
        const text = weeklyReportText(watcher.locale, facts, "parent");
        if (options.dryRun) {
          sent.push({ user_id: userId, audience: "parent", watcher_id: watcher.id, text, dry_run: true });
          continue;
        }
        const delivery = await send(options, {
          chat_id: watcher.chat_id,
          text,
          parse_mode: "HTML",
          notification_type: "english_weekly_report_parent",
          category: "study_habit",
          dedupe_key: `english-weekly-report:${week.start_date}:${watcher.id}`,
        });
        if (delivery.status === 200 && delivery.outcome === "sent") watchersSent += 1;
        sent.push({ user_id: userId, audience: "parent", watcher_id: watcher.id, status: delivery.status, outcome: delivery.outcome });
      }
      if (!options.dryRun) {
        await sb.from("english_weekly_report_log").upsert({
          user_id: userId,
          language_id: languageId,
          week_start: week.start_date,
          learner_sent: learnerSent,
          watchers_sent: watchersSent,
        }, { onConflict: "user_id,language_id,week_start" });
      }
    } catch (error) {
      sent.push({ user_id: userId, error: error instanceof Error ? error.message : "unknown" });
    }
  }
  return { ran: true, considered: batch.length, sent };
};
