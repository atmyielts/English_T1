import {
  escapeHtml, levelLabel, overallScale, pick, plain, type CopyKey, type ReportRow,
} from '../../../../../packages/coach-packs/src/mod.ts';
import type { Bot } from '../bot.ts';
import { goalOf, planView, progressView, todayPlan, weekView } from '../views.ts';

// Today's plan, progress, the weekly report, the goal, settings, help and examples.

export function taskTitle(bot: Bot, activityId: string, part?: string): string {
  const activity = bot.pack.byId.get(activityId);
  if (!activity) return activityId;
  if (activity.kind === 'speaking_exam' && part) {
    const found = activity.parts.find((entry) => entry.id === part);
    if (found) return `${pick(activity.title, bot.locale)} · ${pick(found.title, bot.locale)}`;
  }
  return pick(activity.title, bot.locale);
}

export async function showToday(bot: Bot) {
  const plan = await todayPlan({ store: bot.store, pack: bot.pack, enrollment: bot.enrollment, now: bot.ctx.now() });
  const day = bot.local().day;
  bot.state.plan = { day, tasks: plan.tasks };
  const lines = plan.tasks.map((task, index) => {
    const reasonKey = `today.reason.${task.reason}` as CopyKey;
    const error = task.errorTag ? pick(bot.pack.errorById.get(task.errorTag)?.name, bot.locale) : '';
    return bot.t('today.task', { n: index + 1, title: task.slot === 'mock' && bot.pack.plan.weeklyMock ? pick(bot.pack.plan.weeklyMock.title, bot.locale) : taskTitle(bot, task.activityId, task.part), minutes: task.minutes, reason: plain(bot.locale, reasonKey, { error, count: task.cards ?? 0 }) });
  });
  const head = bot.t('today.title', { minutes: plan.minutes, phase: pick(plan.phase.title, bot.locale) });
  const days = plan.daysLeft !== null ? `\n${bot.t('today.days_left', { days: plan.daysLeft })}` : '';
  const buttons = plan.tasks.map((_, index) => ({ text: `▶️ ${index + 1}`, data: `t:${index}` }));
  bot.text(`${head}${days}\n\n${lines.join('\n')}`, [buttons, [{ text: bot.p('btn.menu'), data: 'm:menu' }, bot.app(bot.p('btn.open_app'))]]);
}

const arrow = (row: ReportRow) => (row.verdict === 'better' ? '✅' : row.verdict === 'worse' ? '🔻' : row.verdict === 'same' ? '➖' : '');

export function rowLabel(bot: Bot, row: ReportRow): string {
  const pack = bot.pack;
  if (row.key === 'result') return pick(pack.rubricById.get(row.ref ?? '')?.name, bot.locale) || String(row.ref);
  if (row.key === 'criterion') {
    const [rubricId, criterionId] = [row.ref!.slice(0, row.ref!.lastIndexOf('.')), row.ref!.slice(row.ref!.lastIndexOf('.') + 1)];
    return pick(pack.rubricById.get(rubricId)?.criteria.find((criterion) => criterion.id === criterionId)?.name, bot.locale) || criterionId;
  }
  if (row.key === 'quiz') return bot.p('report.row.quiz', { mode: bot.p(`mode.${row.ref}` as CopyKey) });
  return bot.p(`report.row.${row.key}` as CopyKey);
}
export function rowValue(bot: Bot, row: ReportRow, value: number | null): string {
  if (value === null) return '—';
  if (row.key === 'result') { const rubric = bot.pack.rubricById.get(row.ref ?? ''); return rubric ? levelLabel(overallScale(rubric), value) : String(value); }
  if (row.key === 'criterion') { const rubric = bot.pack.rubricById.get(row.ref!.slice(0, row.ref!.lastIndexOf('.'))); return rubric ? String(Math.round(value * 10) / 10) : String(value); }
  return String(Math.round(value * 10) / 10);
}

export async function showReport(bot: Bot) {
  const view = await weekView({ store: bot.store, pack: bot.pack, enrollment: bot.enrollment, now: bot.ctx.now() });
  const head = bot.t('report.title', { from: view.from.split('-').reverse().slice(0, 2).join('.'), to: view.to.split('-').reverse().slice(0, 2).join('.') });
  if (!view.hasData) { bot.text(`${head}\n\n${bot.t('report.empty')}`, bot.nav([bot.app(bot.p('btn.full_report'), '/report')])); return; }
  const rows = view.report.rows.filter((row) => row.key !== 'criterion' || row.after !== null).slice(0, 12).map((row) => bot.t('report.row', {
    label: rowLabel(bot, row), before: rowValue(bot, row, row.before ?? row.start), after: rowValue(bot, row, row.after), arrow: arrow(row),
  }));
  const focus = view.report.focus.length ? `\n\n${bot.t('report.focus', { errors: view.report.focus.map((entry) => `${pick(bot.pack.errorById.get(entry.tag)?.name, bot.locale) || entry.tag} ×${entry.count}`).join(', ') })}` : '';
  bot.text(`${head}\n\n${rows.join('\n')}${focus}`, bot.nav([bot.app(bot.p('btn.full_report'), '/report')]));
}

export async function showProgress(bot: Bot) {
  const view = await progressView({ store: bot.store, pack: bot.pack, enrollment: bot.enrollment, now: bot.ctx.now() });
  const goal = goalOf(bot.pack, bot.enrollment), scale = bot.pack.manifest.scale;
  const lines = [bot.t('progress.title', { coach: bot.coachName }), bot.t('progress.level', { level: bot.label(await bot.level()), target: levelLabel(scale, goal.target) })];
  for (const forecast of view.forecasts) {
    if (!forecast.points.length) continue;
    const rubric = bot.pack.rubricById.get(forecast.rubric)!;
    const name = pick(rubric.name, bot.locale);
    if (forecast.prediction.predicted === null) lines.push(`${escapeHtml(name)}: <b>${levelLabel(overallScale(rubric), forecast.prediction.current!)}</b> · ${bot.t('progress.need_more')}`);
    else lines.push(`${escapeHtml(name)}: <b>${levelLabel(overallScale(rubric), forecast.prediction.current!)}</b> · ${bot.t('progress.predicted', {
      when: bot.p(goal.examDate ? 'progress.exam' : 'progress.plan_end'), level: levelLabel(overallScale(rubric), forecast.prediction.predicted),
      confidence: bot.p(forecast.prediction.confidence === 'medium' ? 'progress.confidence.medium' : 'progress.confidence.low'),
    })}`);
  }
  const roots = view.skills.filter((skill) => !bot.pack.skillById.get(skill.node)?.parent && skill.level !== null);
  if (roots.length) lines.push(roots.map((skill) => bot.t('progress.skill', { skill: pick(bot.pack.skillById.get(skill.node)?.name, bot.locale), level: bot.label(skill.level) })).join('\n'));
  lines.push(bot.t('progress.streak', { streak: view.streak.current, best: view.streak.best }));
  if (view.errors.length) lines.push(bot.t('progress.errors', { errors: view.errors.slice(0, 3).map((error) => pick(bot.pack.errorById.get(error.tag)?.name, bot.locale) || error.tag).join(', ') }));
  const certificates = (await bot.store.certificates(bot.enrollment.userId, bot.pack.manifest.id)).filter((cert) => !cert.revokedAt);
  if (certificates.length) lines.push(bot.t('progress.certificates', { list: certificates.map((cert) => cert.levelLabel).join(', ') }));
  bot.text(lines.join('\n'), bot.nav([bot.app(bot.p('btn.open_app'))]));
}

export function showPlan(bot: Bot) {
  const view = planView(bot.pack, bot.enrollment, bot.ctx.now()), scale = bot.pack.manifest.scale;
  const phase = view.weeks[0]?.phase ?? bot.pack.plan.phases.at(-1)!;
  const phases = [...new Map(view.weeks.map((week) => [week.phase.id, pick(week.phase.title, bot.locale)])).values()].join(' → ');
  const date = view.goal.examDate ? bot.t('goal.by_date', { date: view.goal.examDate.split('-').reverse().join('.') }) : '';
  const links = bot.pack.plan.links.map((link) => ({ text: pick(link.label, bot.locale), url: link.url }));
  bot.text(`${bot.t('plan.title', { target: levelLabel(scale, view.goal.target), minutes: view.goal.dailyMinutes, phase: pick(phase.title, bot.locale) }, { date })}\n${bot.t('plan.weeks', { weeks: view.weeks.length, phases })}`, [
    [{ text: bot.p('plan.change_goal'), data: 'g:goal' }, bot.app(bot.p('btn.open_app'), '/plan')],
    ...links.map((link) => [link]),
    [{ text: bot.p('btn.today'), data: 'm:today' }],
  ]);
}

export function showSettings(bot: Bot) {
  const settings = bot.enrollment.settings, modes = bot.pack.manifest.correctionModes ?? [];
  const correction = modes.length ? bot.t('settings.correction', { mode: bot.p(settings.correction === 'strict' ? 'correction.strict' : 'correction.gentle') }) : '';
  bot.text(bot.t('settings.title', { language: bot.languageName(bot.locale), reminder: settings.reminder ?? bot.p('settings.none') }, { correction }), [
    [{ text: bot.p('settings.language'), data: 's:lang' }, { text: bot.p('settings.reminder'), data: 's:rem' }],
    ...(modes.length ? [[{ text: bot.p('settings.correction_btn'), data: 's:cor' }]] : []),
    [{ text: bot.p('settings.voice', { state: bot.p(settings.voice === false ? 'settings.off' : 'settings.on') }), data: 's:voice' }],
    [{ text: bot.p('plan.change_goal'), data: 'g:goal' }, bot.app(bot.p('btn.open_app'), '/settings')],
  ]);
}

export function showHelp(bot: Bot) { bot.text(bot.t('help', { coach: bot.coachName }), bot.nav()); }

export function showSamples(bot: Bot) {
  for (const sample of bot.pack.samples) {
    bot.text(`<i>${bot.t('sample.label')}</i>\n<b>${escapeHtml(pick(sample.title, bot.locale))}</b>\n${escapeHtml(pick(sample.preview, bot.locale))}`, [[bot.app(bot.p('sample.open'), `/samples/${sample.id}`)]]);
  }
}
