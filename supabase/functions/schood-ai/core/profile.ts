import { registerContextProvider } from '../context.ts';

// The `learner_profile` context: the person's results across Schood, read from
// learning-profile-v3 with their own token (so its permission rules apply), cut
// down to what helps a tutor. No ids or raw records reach the model.

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 10) / 10 : null);
const list = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object') as Record<string, unknown>[] : []);

export function summariseProfile(profile: Record<string, unknown>) {
  const outcomes = list(profile.outcomes);
  // Without any signals the profile endpoint still returns a default estimate; it must not be presented as the learner's level.
  const hasData = !!profile.projection || outcomes.length > 0;
  if (!hasData) return { has_results: false, note: 'This person has no Schood results yet.' };
  const scores = profile.skill_scores && typeof profile.skill_scores === 'object' ? Object.fromEntries(Object.entries(profile.skill_scores as Record<string, unknown>).map(([key, value]) => [text(key, 40), num(value)]).filter(([, value]) => value !== null).slice(0, 10)) : {};
  return {
    has_results: true,
    cefr_estimate: text(profile.cefr_estimate, 8) || null,
    target_cefr: text(profile.target_cefr, 8) || null,
    goals: (Array.isArray(profile.learner_goals) ? profile.learner_goals : []).map((goal) => text(goal, 60)).filter(Boolean).slice(0, 5),
    daily_minutes: num(profile.daily_time_preference_minutes),
    skill_scores: scores,
    weak_spots: list(profile.recent_error_clusters).slice(0, 5).map((row) => ({
      skill: text(row.subskill_key, 80) || text(row.skill_key, 80), mistake: text(row.error_type, 120), times: num(row.error_frequency),
    })).filter((row) => row.skill || row.mistake),
    recent_results: outcomes.slice(0, 5).map((row) => ({ band: text(row.overall_band, 20) || null, score: num(row.overall_score), date: text(row.computed_at, 10) || null })),
    suggested_next: list((profile.recommendation_summary as { queue?: unknown } | undefined)?.queue).slice(0, 3).map((row) => text(row.title, 100)).filter(Boolean),
  };
}

export function registerLearnerProfile(): void {
  registerContextProvider('learner_profile', async (ctx) => {
    // The Telegram worker has no learner token; coach packs bring their own context.
    if (!ctx.user.token) return null;
    const profile = await ctx.functions.call<Record<string, unknown>>('learning-profile-v3', '', { query: { language_code: 'en', limit: '10' }, timeoutMs: 5_000, maxBytes: 400_000 });
    return { kind: 'learner_profile', title: 'Your Schood results', data: summariseProfile(profile ?? {}) };
  }, { allowCustom: true, selfView: true, maxChars: 4_000 });
}
