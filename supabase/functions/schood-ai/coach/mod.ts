import { levelLabel, overallScale, pick, recurringErrors } from '../../../../packages/coach-packs/src/mod.ts';
import { registerContextProvider } from '../context.ts';
import type { FeatureModule } from '../types.ts';
import { registerCoachPlanSources } from './access.ts';
import { coachRoutes } from './routes.ts';
import { coachRuntime, setCoachRuntime, type CoachRuntime } from './runtime.ts';

// Schood Coaches (B1–B6): the Telegram coach engine and the /coach/<pack> Mini App
// screens. Most conversation routes are called by the trusted worker
// (workers/schood-coach-bots, `service: true`). See ../CONTRACT.md and
// packages/coach-packs/README.md.

registerCoachPlanSources(() => coachRuntime());

// The tutor (L1) and other assistants may see the caller's own coach progress.
registerContextProvider('coach_progress', async (ctx) => {
  const rt = await coachRuntime();
  const rows = await rt.store.enrollments(ctx.user.id);
  if (!rows.length) return null;
  const coaches = [];
  for (const row of rows) {
    const pack = rt.packs.get(row.pack);
    if (!pack) continue;
    const mastery = await rt.store.mastery(ctx.user.id, pack.manifest.id);
    const results = [];
    for (const rubric of pack.rubrics) {
      const [latest] = await rt.store.results(ctx.user.id, pack.manifest.id, { rubric: rubric.id, limit: 1 });
      if (latest?.overall !== null && latest?.overall !== undefined) results.push({ rubric: pick(rubric.name, 'en'), latest: levelLabel(overallScale(rubric), latest.overall), at: latest.finishedAt });
    }
    coaches.push({
      coach: pick(pack.manifest.name, 'en'),
      goal: row.goal ? { target: levelLabel(pack.manifest.scale, row.goal.target), exam_date: row.goal.examDate } : null,
      placement: row.placement ? levelLabel(pack.manifest.scale, row.placement.overall) : null,
      streak_days: row.streakCurrent,
      latest_results: results,
      recurring_errors: recurringErrors(mastery, ctx.now()).slice(0, 4).map((error) => pick(pack.errorById.get(error.tag)?.name, 'en') || error.tag),
    });
  }
  return { kind: 'coach_progress', title: 'Your Schood Coaches', data: { coaches } };
}, { selfView: true, allowCustom: false, maxChars: 4000 });

/** The coach module; tests pass their own runtime (memory store, fake config). */
export function createCoachModule(runtime?: CoachRuntime): FeatureModule {
  if (runtime) setCoachRuntime(runtime);
  return { area: 'coach', routes: coachRoutes(() => coachRuntime()) };
}

export const coachModule: FeatureModule = createCoachModule();
