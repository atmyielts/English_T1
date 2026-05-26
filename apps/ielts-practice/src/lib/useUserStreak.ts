// Cross-app streak hook + stateless ping helper. Calls the user-streak
// edge function. Same shape can be copied verbatim into any other schood
// app — just change APP_SLUG and the import for supabaseAnonKey if the
// env var name differs.

import { useCallback, useEffect, useState } from 'react';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
const edgeBase = `${supabaseUrl}/functions/v1`;

const APP_SLUG = 'ielts-practice';

// Stateless ping helper that can be called from anywhere (e.g. inside an
// async submit handler) without instantiating the hook. Best-effort; never
// throws.
export const pingUserStreak = async (
  accessToken: string,
  opts: { activity_type?: string; xp?: number; minutes?: number },
): Promise<void> => {
  if (!accessToken) return;
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
    await fetch(`${edgeBase}/user-streak/ping`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_slug: APP_SLUG,
        activity_type: opts.activity_type ?? 'generic',
        xp: opts.xp ?? 10,
        minutes: opts.minutes ?? 0,
        timezone,
      }),
    });
  } catch {
    // swallow
  }
};

export type StreakSummary = {
  ok: boolean;
  current_streak: number;
  longest_streak: number;
  total_xp: number;
  last_activity_date: string | null;
  this_week_minutes: number;
  today: string;
};

export const useUserStreak = (accessToken: string | null) => {
  const [data, setData] = useState<StreakSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchMe = useCallback(async () => {
    if (!accessToken) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
      const res = await fetch(`${edgeBase}/user-streak/me?timezone=${encodeURIComponent(timezone)}`, {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (res.ok) {
        setData(await res.json());
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  // Call this from the app whenever the user does a meaningful action
  // (session completed, review completed, drill submitted). Fires-and-forgets;
  // on success refreshes the local state.
  const ping = useCallback(
    async (opts?: { activity_type?: string; xp?: number; minutes?: number }) => {
      if (!accessToken) return;
      try {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
        const res = await fetch(`${edgeBase}/user-streak/ping`, {
          method: 'POST',
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            app_slug: APP_SLUG,
            activity_type: opts?.activity_type ?? 'generic',
            xp: opts?.xp ?? 10,
            minutes: opts?.minutes ?? 0,
            timezone,
          }),
        });
        if (res.ok) {
          await fetchMe();
        }
      } catch {
        // Pinging is best-effort; never throw from this hook.
      }
    },
    [accessToken, fetchMe],
  );

  return { data, loading, ping, refresh: fetchMe };
};
