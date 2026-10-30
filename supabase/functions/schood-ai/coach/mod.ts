import { levelLabel, overallScale, pick, recurringErrors } from '../../../../packages/coach-packs/src/mod.ts';
import { PACK_SOURCES } from '../../../../packages/coach-packs/src/registry.ts';
import { registerContextProvider } from '../context.ts';
import { registerNotifyKind } from '../registries.ts';
import type { FeatureModule } from '../types.ts';
import { registerCoachPlanSources } from './access.ts';
import { coachRoutes } from './routes.ts';
import { runtimeOf } from './runtime.ts';

// Schood Coaches (B1–B6): the Telegram coach engine and the /coach/<pack> Mini App
// screens. Most conversation routes are called by the trusted worker
// (workers/schood-coach-bots, `service: true`). See ../CONTRACT.md and
// packages/coach-packs/README.md.

registerCoachPlanSources();

// Each coach's reminders and weekly reports are one kind of notification
// (`coach.<pack>`): Settings → Notifications lists them, and muting `coach` mutes all.
for (const source of PACK_SOURCES) {
  const name = source.manifest.name;
  registerNotifyKind(`coach.${source.manifest.id}`, {
    area: 'coach',
    label: { en: `${name.en ?? source.manifest.id}: reminders and weekly reports`.slice(0, 80), uz: `${name.uz ?? name.en ?? source.manifest.id}: eslatmalar va haftalik hisobotlar`.slice(0, 80), ru: `${name.ru ?? name.en ?? source.manifest.id}: напоминания и недельные отчёты`.slice(0, 80) },
  });
}

// The tutor (L1) and other assistants may see the caller's own coach progress.
registerContextProvider('coach_progress', async (ctx) => {
  const rt = runtimeOf((handle) => ctx.store(handle));
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
}, { selfView: true, allowCustom: false, maxChars: 4000, label: { en: 'Your Schood Coaches progress', uz: 'Schood murabbiylaridagi natijalaringiz', ru: 'Ваш прогресс с коучами Schood' } });

export const coachModule: FeatureModule = { area: 'coach', routes: coachRoutes() };
export { coachServices, coachStore } from './runtime.ts';
