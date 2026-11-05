import {
  diagnosticQuestion, diagnosticResultText, levelLabel, pick, scoreDiagnostic, updateMastery, type Locale,
} from '../../../../../packages/coach-packs/src/mod.ts';
import type { Bot } from '../bot.ts';
import type { Goal } from '../store.ts';
import { localParts, nextDaily, nextWeekly, parseDate, REMINDER_TIMES, validReminder } from '../time.ts';
import { showToday } from './info.ts';

// First contact: language, the free placement test, then the goal (target, exam
// date, minutes a day, reminder time) and the first daily plan.

export function welcome(bot: Bot, name: string | null) {
  const { manifest } = bot.pack;
  if (bot.enrollment.placement) {
    bot.text(bot.t('welcome.back', { name: name ?? '', streak: bot.enrollment.streakCurrent }));
    bot.menu();
    return;
  }
  bot.text(bot.t('welcome', { name: name ?? '', coach: pick(manifest.name, bot.locale), tagline: pick(manifest.tagline, bot.locale), minutes: bot.pack.diagnostic.minutes }), [
    manifest.uiLanguages.map((locale) => ({ text: bot.languageName(locale), data: `l:${locale}` })),
    [{ text: bot.p('onboard.test'), data: 'm:test' }],
    [{ text: bot.p('onboard.skip_test'), data: 'g:skip' }, { text: bot.p('paywall.samples'), data: 'm:samples' }],
  ]);
}

export function languagePicker(bot: Bot) {
  bot.text(bot.t('language.choose'), [bot.pack.manifest.uiLanguages.map((locale) => ({ text: bot.languageName(locale), data: `l:${locale}` }))]);
}

export function setLanguage(bot: Bot, locale: Locale) {
  if (!bot.pack.manifest.uiLanguages.includes(locale)) return;
  bot.update({ locale });
  bot.text(bot.t('language.set'));
  if (!bot.enrollment.placement) welcome(bot, null); else bot.menu();
}

export function startDiagnostic(bot: Bot) {
  bot.set({ flow: 'idle' });
  bot.text(pick(bot.pack.diagnostic.intro, bot.locale));
  const first = diagnosticQuestion(bot.pack, bot.locale, []);
  if (first) bot.push(first);
}

/** A finished placement test (from the worker): stored, then the goal. */
export async function savePlacement(bot: Bot, answers: number[], code: string) {
  const { pack } = bot;
  if (answers.length !== pack.diagnostic.items.length) { startDiagnostic(bot); return; }
  const result = scoreDiagnostic(pack, answers);
  const at = bot.ctx.now().toISOString();
  bot.update({ placement: { overall: result.overall, skills: result.skills, at, answers: code } });
  // Seed the learner model where nothing is measured yet, so the first plan targets real gaps.
  const rows = await bot.mastery(), seeds = [];
  for (const skill of result.skills) if (skill.level !== null && !rows.get(skill.skill)?.evidence) seeds.push(updateMastery(null, skill.skill, { score: skill.level, scale: pack.manifest.scale, at: bot.ctx.now() }));
  await bot.store.saveMastery(bot.enrollment.userId, pack.manifest.id, seeds);
  const session = await bot.store.createSession({ enrollmentId: bot.enrollment.id, userId: bot.enrollment.userId, pack: pack.manifest.id, packVersion: pack.manifest.version, kind: 'diagnostic', activityId: null, mode: null, rubric: null, source: 'telegram' });
  await bot.store.updateSession(session.id, { status: 'finished', summary: { placement: { overall: result.overall, skills: result.skills, correct: result.correct, questions: result.questions } }, minutes: pack.diagnostic.minutes, finishedAt: at });
  bot.text(`${diagnosticResultText(pack, bot.locale, result)}\n\n${bot.t('diag.saved')}`);
  if (!(await bot.allowed())) { bot.paywall(); return; }
  askTarget(bot, result.suggestedTarget);
}

export function askTarget(bot: Bot, suggested?: number) {
  const { goal } = bot.pack.plan, scale = bot.pack.manifest.scale;
  const options = [...goal.options].sort((a, b) => a - b);
  const rows = [];
  for (let i = 0; i < options.length; i += 4) rows.push(options.slice(i, i + 4).map((value) => ({ text: `${value === suggested ? '⭐ ' : ''}${levelLabel(scale, value)}`, data: `g:t:${value}` })));
  bot.set({ flow: 'onboard', step: 'target', draft: {} });
  bot.text(bot.t('goal.target'), rows);
}

function askMinutes(bot: Bot, draft: { target?: number; examDate?: string | null }) {
  bot.set({ flow: 'onboard', step: 'minutes', draft });
  bot.text(bot.t('goal.minutes'), [bot.pack.plan.dailyMinutes.options.map((minutes) => ({ text: `${minutes}′`, data: `g:m:${minutes}` }))]);
}

function askReminder(bot: Bot, draft: { target?: number; examDate?: string | null; minutes?: number }) {
  bot.set({ flow: 'onboard', step: 'reminder', draft });
  const times = REMINDER_TIMES.map((time) => ({ text: time, data: `g:r:${time.replace(':', '')}` }));
  bot.text(bot.t('goal.reminder'), [times.slice(0, 4), times.slice(4), [{ text: bot.p('goal.no_reminder'), data: 'g:r:off' }]]);
}

/** Goal buttons and the exam date reply. Returns false when the input was not for the goal flow. */
export async function onGoal(bot: Bot, input: { data?: string; text?: string }): Promise<boolean> {
  const current = bot.state.current;
  if (input.data === 'g:skip') { if (!(await bot.allowed())) { bot.paywall(); return true; } askTarget(bot); return true; }
  if (input.data === 'g:goal') { askTarget(bot); return true; }
  if (current.flow === 'settings' && input.data?.startsWith('g:r:')) {
    const raw = input.data.slice(4), time = raw === 'off' ? null : `${raw.slice(0, 2)}:${raw.slice(2)}`;
    if (time !== null && !validReminder(time)) return true;
    bot.update({ settings: { ...bot.enrollment.settings, reminder: time } });
    await setReminders(bot, time);
    bot.set({ flow: 'idle' });
    bot.text(bot.t('settings.saved'), bot.nav());
    return true;
  }
  if (current.flow !== 'onboard') return false;
  const draft = { ...current.draft };
  const { goal } = bot.pack.plan;
  if (current.step === 'target' && input.data?.startsWith('g:t:')) {
    const value = Number(input.data.slice(4));
    if (!goal.options.includes(value)) return true;
    draft.target = value;
    if (goal.examDate === 'none') { draft.examDate = null; askMinutes(bot, draft); return true; }
    bot.set({ flow: 'onboard', step: 'date', draft });
    bot.text(bot.t('goal.date'), [[{ text: bot.p('goal.no_date'), data: 'g:d:none' }]]);
    return true;
  }
  if (current.step === 'date') {
    if (input.data === 'g:d:none') {
      if (goal.examDate === 'required') { bot.text(bot.t('goal.date')); return true; }
      draft.examDate = null; askMinutes(bot, draft); return true;
    }
    if (input.text !== undefined) {
      const date = parseDate(input.text);
      if (!date) { bot.text(bot.t('goal.date_bad')); return true; }
      if (date <= localParts(bot.ctx.now(), bot.tz).day) { bot.text(bot.t('goal.date_past')); return true; }
      draft.examDate = date; askMinutes(bot, draft); return true;
    }
    return false;
  }
  if (current.step === 'minutes' && input.data?.startsWith('g:m:')) {
    const minutes = Number(input.data.slice(4));
    if (!bot.pack.plan.dailyMinutes.options.includes(minutes)) return true;
    draft.minutes = minutes; askReminder(bot, draft); return true;
  }
  if (current.step === 'reminder' && input.data?.startsWith('g:r:')) {
    const raw = input.data.slice(4), time = raw === 'off' ? null : `${raw.slice(0, 2)}:${raw.slice(2)}`;
    if (time !== null && !validReminder(time)) return true;
    const fresh = !bot.enrollment.goal;
    const finalGoal: Goal = {
      target: draft.target ?? bot.enrollment.goal?.target ?? goal.default,
      examDate: draft.examDate === undefined ? bot.enrollment.goal?.examDate ?? null : draft.examDate,
      dailyMinutes: draft.minutes ?? bot.enrollment.goal?.dailyMinutes ?? bot.pack.plan.dailyMinutes.default,
      startedAt: fresh ? bot.ctx.now().toISOString() : bot.enrollment.goal!.startedAt,
    };
    bot.update({ goal: finalGoal, settings: { ...bot.enrollment.settings, reminder: time } });
    await setReminders(bot, time);
    bot.ctx.events.emit({ kind: 'goal_set', area: 'coach', feature: bot.feature, outcome: `target_${String(finalGoal.target).replace('.', '_')}`.slice(0, 40), ref: bot.enrollment.id });
    bot.set({ flow: 'idle' });
    const scale = bot.pack.manifest.scale;
    bot.text(bot.t('goal.done', { target: levelLabel(scale, finalGoal.target), minutes: finalGoal.dailyMinutes }, { date: finalGoal.examDate ? bot.t('goal.by_date', { date: finalGoal.examDate.split('-').reverse().join('.') }) : '' }));
    await showToday(bot);
    return true;
  }
  return false;
}

/** The daily reminder at the chosen time and the weekly report (Sunday, same time), or both off. */
export async function setReminders(bot: Bot, time: string | null) {
  const now = bot.ctx.now(), tz = bot.tz, base = { enrollmentId: bot.enrollment.id, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, timeZone: tz };
  await bot.store.saveSchedule({ ...base, kind: 'daily', localTime: time ?? '09:00', weekday: null, nextAt: nextDaily(now, time ?? '09:00', tz).toISOString(), enabled: time !== null });
  await bot.store.saveSchedule({ ...base, kind: 'weekly', localTime: time ?? '09:00', weekday: 0, nextAt: nextWeekly(now, 0, time ?? '09:00', tz).toISOString(), enabled: time !== null });
}

export function reminderPicker(bot: Bot) {
  bot.set({ flow: 'settings', step: 'reminder' });
  const times = REMINDER_TIMES.map((time) => ({ text: time, data: `g:r:${time.replace(':', '')}` }));
  bot.text(bot.t('goal.reminder'), [times.slice(0, 4), times.slice(4), [{ text: bot.p('goal.no_reminder'), data: 'g:r:off' }]]);
}
