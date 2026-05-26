// Cross-app streak + XP edge function.
//
// Endpoints:
//   POST /user-streak/ping  — record activity for "today" from an app
//   GET  /user-streak/me    — read current streak + XP + last 30 days
//
// Designed to be called from any schood app. Activity rows accumulate in
// user_daily_activity; user_streak_state is the cached summary the nav badge
// reads from. Streak recomputation happens inline on ping (cheap — just
// checks yesterday vs today).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-jwt",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (status: number, body: unknown, cacheable = false): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(cacheable ? { "Cache-Control": "private, max-age=15" } : {}),
      ...corsHeaders,
    },
  });

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};

const todayInTimezone = (timezone: string): string => {
  const now = new Date();
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
};

const daysBetween = (a: string, b: string): number => {
  const aD = new Date(a);
  const bD = new Date(b);
  return Math.round((bD.getTime() - aD.getTime()) / (24 * 60 * 60 * 1000));
};

const extractRoute = (url: URL, marker: string): string => {
  const idx = url.pathname.indexOf(marker);
  if (idx < 0) return "";
  const tail = url.pathname.slice(idx + marker.length);
  return tail.startsWith("/") ? tail : tail ? `/${tail}` : "";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceRole = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, supabaseServiceRole, { auth: { persistSession: false } });

    // Authenticate the caller.
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json(401, { error: "Unauthorized" });

    const { data: userResult, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !userResult?.user?.id) return json(401, { error: "Unauthorized" });
    const userId = userResult.user.id;

    const url = new URL(req.url);
    const route = extractRoute(url, "/user-streak");

    // ===== POST /ping =====
    // Body: { app_slug: string, activity_type?: string, xp?: number, minutes?: number, timezone?: string }
    if (req.method === "POST" && route === "/ping") {
      const body = await req.json().catch(() => ({}));
      const appSlug = String(body?.app_slug ?? "").trim().slice(0, 60);
      const xpEarned = Math.max(0, Math.min(1000, Number(body?.xp) || 0));
      const minutes = Math.max(0, Math.min(240, Number(body?.minutes) || 0));
      const timezone = String(body?.timezone ?? "UTC").slice(0, 64);
      if (!appSlug) return json(400, { error: "app_slug required" });

      const today = todayInTimezone(timezone);

      // Upsert today's activity row.
      const { data: existing } = await sb
        .from("user_daily_activity")
        .select("attempts_count, minutes_studied, xp_earned, apps_touched")
        .eq("user_id", userId)
        .eq("day", today)
        .maybeSingle();

      const prior = existing as Record<string, unknown> | null;
      const priorApps = Array.isArray(prior?.apps_touched) ? prior.apps_touched as string[] : [];
      const apps = priorApps.includes(appSlug) ? priorApps : [...priorApps, appSlug];

      const nextRow = {
        user_id: userId,
        day: today,
        attempts_count: (Number(prior?.attempts_count) || 0) + 1,
        minutes_studied: (Number(prior?.minutes_studied) || 0) + minutes,
        xp_earned: (Number(prior?.xp_earned) || 0) + xpEarned,
        apps_touched: apps,
      };

      await sb.from("user_daily_activity").upsert(nextRow, { onConflict: "user_id,day" });

      // Recompute streak.
      const { data: streakRow } = await sb
        .from("user_streak_state")
        .select("current_streak, longest_streak, total_xp, last_activity_date")
        .eq("user_id", userId)
        .maybeSingle();

      const prevDate = (streakRow as Record<string, unknown> | null)?.last_activity_date as string | null;
      const prevStreak = Number((streakRow as Record<string, unknown> | null)?.current_streak ?? 0);
      const prevLongest = Number((streakRow as Record<string, unknown> | null)?.longest_streak ?? 0);
      const prevXp = Number((streakRow as Record<string, unknown> | null)?.total_xp ?? 0);

      let newStreak: number;
      if (!prevDate) {
        newStreak = 1;
      } else if (prevDate === today) {
        newStreak = prevStreak || 1;
      } else {
        const gap = daysBetween(prevDate, today);
        newStreak = gap === 1 ? prevStreak + 1 : 1;
      }
      const newLongest = Math.max(prevLongest, newStreak);
      const newXp = prevXp + xpEarned;

      await sb.from("user_streak_state").upsert(
        {
          user_id: userId,
          current_streak: newStreak,
          longest_streak: newLongest,
          total_xp: newXp,
          last_activity_date: today,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      return json(200, {
        ok: true,
        current_streak: newStreak,
        longest_streak: newLongest,
        total_xp: newXp,
        today,
      });
    }

    // ===== GET /me =====
    if (req.method === "GET" && route === "/me") {
      const timezone = url.searchParams.get("timezone") ?? "UTC";
      const today = todayInTimezone(timezone);

      const { data: state } = await sb
        .from("user_streak_state")
        .select("current_streak, longest_streak, total_xp, last_activity_date")
        .eq("user_id", userId)
        .maybeSingle();

      const stateRow = (state ?? null) as Record<string, unknown> | null;
      const lastDate = stateRow?.last_activity_date as string | null;
      let currentStreak = Number(stateRow?.current_streak ?? 0);

      // If they have a streak but haven't logged activity yesterday or today,
      // the live streak is broken even though we haven't updated the row yet.
      // Be honest about the displayed value.
      if (lastDate && currentStreak > 0) {
        const gap = daysBetween(lastDate, today);
        if (gap > 1) currentStreak = 0;
      }

      // Last 30 days of activity for a sparkline.
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const { data: history } = await sb
        .from("user_daily_activity")
        .select("day, attempts_count, minutes_studied, xp_earned")
        .eq("user_id", userId)
        .gte("day", cutoff.toISOString().slice(0, 10))
        .order("day", { ascending: true });

      const weekMinutes = Array.isArray(history)
        ? (history as Array<Record<string, unknown>>)
            .filter((r) => {
              const diff = daysBetween(String(r.day), today);
              return diff >= 0 && diff < 7;
            })
            .reduce((sum, r) => sum + (Number(r.minutes_studied) || 0), 0)
        : 0;

      return json(
        200,
        {
          ok: true,
          current_streak: currentStreak,
          longest_streak: Number(stateRow?.longest_streak ?? 0),
          total_xp: Number(stateRow?.total_xp ?? 0),
          last_activity_date: lastDate,
          this_week_minutes: weekMinutes,
          history_30d: history ?? [],
          today,
        },
        true,
      );
    }

    return json(404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(500, { error: message });
  }
});
