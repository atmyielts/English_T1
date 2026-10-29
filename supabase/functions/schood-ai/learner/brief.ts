import { s } from '../../../../packages/ai-core/src/mod.ts';
import { bool, integer, record, text, uuid } from '../input.ts';
import { SchoodAIError, type Locale, type RequestContext, type WorkspaceAccess } from '../types.ts';
import { learnerInput, ownRecord, requireLearner, saveRecord, store, systemFor, today, track } from './common.ts';
import type { BriefKind, BriefSchedule, RecordRow } from './store.ts';

// L14 Daily brief in Telegram: every morning a 10-minute set built from
// yesterday's mistakes: three questions, one word, one tip, answered in the chat.
// The student bot's cron asks learner/telegram-brief for each learner whose brief
// is due (ai_learner_briefs.next_due_at); sends respect ctx.notify (at most 2 a day
// per person across bots, never in quiet hours 22:00–08:00 local). One brief per
// learner per day; its charge is idempotent for that day.

// --- Schedules ---------------------------------------------------------------------------
export const validTimeZone = (zone: string) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(zone); } catch { return false; }
};
/** The UTC instant of a local wall-clock time in a time zone. */
export function zonedToUtc(day: string, time: string, timeZone: string): Date {
  const guess = new Date(`${day}T${time}:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(guess).map((part) => [part.type, part.value]));
  const offset = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute)) - guess.getTime();
  return new Date(guess.getTime() - offset);
}
/** The next time this schedule fires after `after` (a weekday for the weekly parent brief). */
export function nextOccurrence(after: Date, time: string, timeZone: string, weekday: number | null): string {
  for (let add = 0; add <= 8; add++) {
    const day = today(new Date(after.getTime() + add * 86_400_000), timeZone);
    if (weekday !== null && new Date(`${day}T12:00:00Z`).getUTCDay() !== weekday) continue;
    const at = zonedToUtc(day, time, timeZone);
    if (at.getTime() > after.getTime()) return at.toISOString();
  }
  return new Date(after.getTime() + 86_400_000).toISOString();
}

export async function scheduleView(ctx: RequestContext, kind: BriefKind) {
  const row = await store(ctx).schedule(ctx.user.id, kind);
  return { schedule: row ? { enabled: row.enabled, time: row.sendTime, weekday: row.weekday, time_zone: row.timeZone, next_at: row.enabled ? row.nextDueAt : null, last_sent_at: row.lastSentAt } : null, telegram_linked: !!ctx.user.telegramChatId, bot_url: 'https://t.me/schoodstudentbot' };
}
/** PUT body { enabled, time, time_zone?, weekday? }; turning it on needs Telegram linked. */
export async function saveScheduleFrom(ctx: RequestContext, kind: BriefKind, body: Record<string, unknown>) {
  const enabled = bool(body.enabled, 'enabled');
  const time = text(body.time ?? '08:30', 'time', { max: 5 });
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || time < '08:00' || time >= '22:00') throw new SchoodAIError('quiet_hours', 'Pick a time between 08:00 and 21:59.', 400, { field: 'time' });
  const timeZone = body.time_zone === undefined ? 'Asia/Tashkent' : text(body.time_zone, 'time_zone', { max: 64 });
  if (!validTimeZone(timeZone)) throw new SchoodAIError('invalid_request', 'Unknown time zone.', 400, { field: 'time_zone' });
  const weekday = kind === 'parent' ? integer(body.weekday ?? 0, 'weekday', 0, 6) : null;
  if (enabled && !ctx.user.telegramChatId) throw new SchoodAIError('telegram_not_linked', 'Link Telegram in your Schood account first.', 409);
  const previous = await store(ctx).schedule(ctx.user.id, kind);
  const row: BriefSchedule = {
    userId: ctx.user.id, kind, enabled, sendTime: time, weekday, timeZone, locale: ctx.locale,
    nextDueAt: enabled ? nextOccurrence(ctx.now(), time, timeZone, weekday) : null, lastSentAt: previous?.lastSentAt ?? null,
  };
  await store(ctx).saveSchedule(row);
  return scheduleView(ctx, kind);
}

// --- Telegram text -------------------------------------------------------------------------
export const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Model Markdown to the small HTML Telegram accepts. */
export function telegramHtml(markdown: string): string {
  return escapeHtml(markdown)
    .replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .slice(0, 4000);
}
export interface TelegramButton { text: string; callback_data?: string; url?: string }
export interface TelegramMessage { text: string; buttons?: TelegramButton[][]; force_reply?: boolean }

const COPY: Record<Locale, { title: string; word: string; tip: string; question: string; right: string; wrong: string; done: (score: number) => string; open: string }> = {
  en: { title: 'Your daily brief', word: 'Word of the day', tip: 'Tip', question: 'Question', right: 'Correct!', wrong: 'Not quite.', done: (score) => `Done: ${score}/3. See you tomorrow.`, open: 'Open Schood AI' },
  uz: { title: 'Kunlik mashqingiz', word: 'Kun soʻzi', tip: 'Maslahat', question: 'Savol', right: 'Toʻgʻri!', wrong: 'Unchalik emas.', done: (score) => `Tayyor: ${score}/3. Ertaga koʻrishguncha.`, open: 'Schood AI ni ochish' },
  ru: { title: 'Ваша ежедневная разминка', word: 'Слово дня', tip: 'Совет', question: 'Вопрос', right: 'Верно!', wrong: 'Не совсем.', done: (score) => `Готово: ${score}/3. До завтра.`, open: 'Открыть Schood AI' },
};

// --- The brief -----------------------------------------------------------------------------
const BRIEF_SCHEMA = s.object({
  based_on: s.string({ max: 300 }),
  questions: s.array(s.object({ prompt: s.string({ min: 5, max: 300 }), options: s.array(s.string({ min: 1, max: 60 }), { min: 3, max: 4 }), answer_index: s.number({ min: 0, max: 3, integer: true }), explanation: s.string({ max: 300 }) }), { min: 3, max: 4 }),
  word: s.object({ word: s.string({ min: 1, max: 40 }), meaning_en: s.string({ max: 200 }), meaning_uz: s.string({ max: 200 }), meaning_ru: s.string({ max: 200 }), example: s.string({ max: 240 }) }),
  tip: s.string({ min: 5, max: 400 }),
});
interface Brief { based_on: string; questions: { prompt: string; options: string[] }[]; word: { word: string; meaning_en: string; meaning_uz: string; meaning_ru: string; example: string }; tip: string }

/** Yesterday's mistakes from the learner's own activity (summaries only). */
export async function recentMistakes(ctx: RequestContext, userId: string, hours = 40) {
  const since = new Date(ctx.now().getTime() - hours * 3_600_000).toISOString();
  const rows = await store(ctx).activity(userId, { since, limit: 60 });
  const out: string[] = [];
  for (const row of rows) {
    const summary = row.summary as Record<string, unknown>;
    const pairs = [...((summary.issues ?? summary.fixes ?? summary.improve ?? []) as { said?: string; better?: string }[])];
    for (const pair of pairs) if (pair?.said) out.push(`said "${pair.said}" → better "${pair.better ?? ''}"`);
    if (row.kind === 'mistake' && summary.rule) out.push(`got wrong: ${summary.question ?? ''} (rule: ${summary.rule})`);
    if (row.kind === 'check' && row.score === 0 && summary.rule) out.push(`missed a check on: ${summary.rule}`);
    if (row.kind === 'pronunciation' && Array.isArray(summary.missed) && summary.missed.length) out.push(`unclear words: ${(summary.missed as string[]).join(', ')}`);
    if (row.kind === 'brief_answer' && row.score === 0 && summary.prompt) out.push(`missed brief question: ${summary.prompt}`);
    if (row.kind === 'reading' && typeof summary.correct === 'number' && typeof summary.total === 'number' && summary.correct < summary.total) out.push(`reading at ${summary.level}: ${summary.correct}/${summary.total}`);
  }
  return [...new Set(out.map((entry) => entry.slice(0, 200)))].slice(0, 10);
}

export function briefView(row: RecordRow) {
  const answers = (row.state.answers ?? {}) as Record<string, { choice: number; correct: boolean }>;
  const keys = (row.secret.keys ?? []) as { answer_index: number; explanation: string }[];
  const output = row.output as unknown as Brief;
  return {
    id: row.id, day: row.day, based_on: output.based_on, word: output.word, tip: output.tip,
    questions: output.questions.map((question, index) => ({ ...question, answer: answers[index] ? { ...answers[index], answer_index: keys[index]?.answer_index, explanation: keys[index]?.explanation } : null })),
    score: Object.values(answers).filter((answer) => answer.correct).length, answered: Object.keys(answers).length, sent_at: row.state.sent_at ?? null,
  };
}

function questionMessage(row: RecordRow, index: number, locale: Locale): TelegramMessage | null {
  const output = row.output as unknown as Brief;
  const question = output.questions[index];
  if (!question) return null;
  return {
    text: `<b>${COPY[locale].question} ${index + 1}/${output.questions.length}</b>\n${escapeHtml(question.prompt)}`,
    buttons: question.options.map((option, choice) => [{ text: option.slice(0, 60), callback_data: `aib:${row.id}:${index}:${choice}` }]),
  };
}
export function briefMessages(row: RecordRow, locale: Locale, appUrl: string): TelegramMessage[] {
  const output = row.output as unknown as Brief, copy = COPY[locale];
  const meaning = locale === 'uz' ? output.word.meaning_uz : locale === 'ru' ? output.word.meaning_ru : output.word.meaning_en;
  return [
    {
      text: [`☀️ <b>${copy.title}</b>`, '', `<b>${copy.word}:</b> ${escapeHtml(output.word.word)} — ${escapeHtml(meaning)}`, `<i>${escapeHtml(output.word.example)}</i>`, '', `<b>${copy.tip}:</b> ${escapeHtml(output.tip)}`].join('\n'),
      buttons: [[{ text: copy.open, url: `${appUrl.replace(/\/$/, '')}/brief` }]],
    },
    questionMessage(row, 0, locale)!,
  ];
}

export type BriefOutcome =
  | { status: 'ready'; record: RecordRow; fresh: boolean }
  | { status: 'skipped'; reason: string; retry_at: string | null };

/** Today's brief: the stored one, or a new one (charged once per day). The worker path respects the notification budget. */
export async function dailyBrief(ctx: RequestContext, access: WorkspaceAccess): Promise<BriefOutcome> {
  const schedule = await store(ctx).schedule(ctx.user.id, 'daily');
  const zone = schedule?.timeZone ?? 'Asia/Tashkent';
  const day = today(ctx.now(), zone);
  const existing = await store(ctx).recordOfDay(ctx.user.id, 'brief', day);
  if (existing) return { status: 'ready', record: existing, fresh: false };
  if (ctx.user.via === 'service') {
    const allowed = await ctx.notify.allowed(ctx.user.id, 'telegram.brief');
    if (!allowed.allowed) return { status: 'skipped', reason: allowed.reason, retry_at: allowed.retryAt };
  }
  const mistakes = await recentMistakes(ctx, ctx.user.id);
  const snapshot = await store(ctx).snapshot(ctx.user.id);
  const out = await ctx.ai.json({
    key: 'daily.brief', schema: BRIEF_SCHEMA, maxTokens: 1500, temperature: 0.5, reference: `daily-brief:${ctx.user.id}:${day}`,
    messages: [
      { role: 'system', content: systemFor(ctx, access, { name: 'Daily brief', instructions: [
        'Make today\'s 10-minute brief for this learner, for Telegram.',
        mistakes.length ? 'Build it from their mistakes in the last day (in the data): each question practises one of them with new content.' : 'They have no mistakes recorded yesterday: build it from their weak spots in the data, or general practice at their level.',
        'questions: exactly 3 multiple-choice questions (3-4 short options, one correct, a one-sentence explanation). Questions and options are in English.',
        'word: one useful word at their level with meanings and an example. tip: one practical study tip. based_on: one short line saying what today\'s set practises.',
      ] }, [{ kind: 'recent_mistakes', title: 'Mistakes in the last day', data: mistakes }, ...(snapshot?.profile ? [{ kind: 'learner_snapshot', title: 'Schood results', data: snapshot.profile }] : [])]) },
      { role: 'user', content: learnerInput({ day, mistakes_count: mistakes.length }) },
    ],
  });
  const questions = out.data.questions.filter((question) => question.answer_index < question.options.length).slice(0, 3);
  if (questions.length < 3) throw new SchoodAIError('ai_failed', 'The brief could not be made just now.', 502);
  let row: RecordRow;
  try {
    row = await store(ctx).createRecord({
      userId: ctx.user.id, workspaceId: access.workspace.id, kind: 'brief', day, credits: out.credits,
      input: { mistakes }, output: { based_on: out.data.based_on, word: out.data.word, tip: out.data.tip, questions: questions.map((question) => ({ prompt: question.prompt, options: question.options })) },
      secret: { keys: questions.map((question) => ({ answer_index: question.answer_index, explanation: question.explanation })) }, state: { answers: {} },
    });
  } catch {
    // Two runs raced for the day: the first one's brief stands (the charge was replayed, not doubled).
    const first = await store(ctx).recordOfDay(ctx.user.id, 'brief', day);
    if (!first) throw new SchoodAIError('ai_failed', 'The brief could not be saved.', 502);
    return { status: 'ready', record: first, fresh: false };
  }
  track(ctx, access, { feature: 'L14', kind: 'brief', summary: { day, based_on: out.data.based_on, from_mistakes: mistakes.length } });
  return { status: 'ready', record: row, fresh: true };
}

// POST learner/brief-answer { id, q, choice }: web and Telegram.
export async function answerBrief(ctx: RequestContext, input: { id: string; q: number; choice: number }) {
  const access = await requireLearner(ctx, 'L14');
  const row = await ownRecord(ctx, access, input.id, 'brief');
  const keys = (row.secret.keys ?? []) as { answer_index: number; explanation: string }[];
  const key = keys[input.q];
  if (!key || input.choice < 0 || input.choice > 3) throw new SchoodAIError('invalid_request', 'Unknown question.', 400);
  const answers = { ...(row.state.answers ?? {}) as Record<string, { choice: number; correct: boolean }> };
  let saved = row;
  const first = !answers[input.q];
  if (first) {
    answers[input.q] = { choice: input.choice, correct: key.answer_index === input.choice };
    saved = await saveRecord(ctx, row, { state: { ...row.state, answers }, status: Object.keys(answers).length >= keys.length ? 'finished' : row.status });
    const correct = answers[input.q].correct;
    const prompt = ((row.output.questions ?? []) as { prompt: string }[])[input.q]?.prompt ?? '';
    track(ctx, access, { feature: 'L14', kind: 'brief_answer', score: correct ? 1 : 0, summary: { prompt: prompt.slice(0, 160) }, event: { kind: correct ? 'check_passed' : 'check_failed', skill: 'daily.brief', verified_minutes: correct ? 2 : 0, ref: `${row.id}:${input.q}` } });
    if (Object.keys(answers).length === keys.length) {
      const score = Object.values(answers).filter((answer) => answer.correct).length;
      ctx.events.emit({ kind: 'drill_finished', area: 'learner', feature: 'L14', skill: 'daily.brief', score: Math.round((score / keys.length) * 100), verified_minutes: 3, ref: row.id });
    }
  }
  const answer = answers[input.q];
  const copy = COPY[ctx.locale];
  const view = briefView(saved);
  const prompt = view.questions[input.q]?.prompt ?? '';
  const nextIndex = view.questions.findIndex((_question, index) => !answers[index]);
  return {
    first, correct: answer.correct, answer_index: key.answer_index, explanation: key.explanation, brief: view,
    telegram: {
      toast: answer.correct ? copy.right : copy.wrong,
      edit: `${escapeHtml(prompt)}\n\n${answer.correct ? '✅' : '❌'} ${answer.correct ? copy.right : copy.wrong} ${escapeHtml(key.explanation)}`,
      next: nextIndex >= 0 ? questionMessage(saved, nextIndex, ctx.locale) : { text: copy.done(view.score) },
    },
  };
}

export async function briefSent(ctx: RequestContext, kind: BriefKind, ids: string[]) {
  const schedule = await store(ctx).schedule(ctx.user.id, kind);
  for (const id of ids) {
    const row = await store(ctx).record(id);
    if (row && row.userId === ctx.user.id && !row.state.sent_at) await store(ctx).updateRecord(row.id, row.version, { state: { ...row.state, sent_at: ctx.now().toISOString() } });
  }
  if (schedule) {
    await ctx.notify.take(ctx.user.id, kind === 'daily' ? 'telegram.brief' : 'telegram.parent_brief');
    await store(ctx).saveSchedule({ ...schedule, lastSentAt: ctx.now().toISOString(), nextDueAt: schedule.enabled ? nextOccurrence(new Date(ctx.now().getTime() + 3_600_000), schedule.sendTime, schedule.timeZone, schedule.weekday) : null });
  }
  return { ok: true };
}

/** After a skipped or failed attempt, try again later the same day (never in quiet hours). */
export async function retryLater(ctx: RequestContext, kind: BriefKind, at: string | null) {
  const schedule = await store(ctx).schedule(ctx.user.id, kind);
  if (!schedule) return;
  const fallback = new Date(ctx.now().getTime() + 3_600_000).toISOString();
  let next = at && Date.parse(at) > ctx.now().getTime() ? at : fallback;
  const local = new Intl.DateTimeFormat('en-GB', { timeZone: schedule.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(next));
  if (local >= '22:00' || local < '08:00') next = nextOccurrence(new Date(next), schedule.sendTime, schedule.timeZone, schedule.weekday);
  await store(ctx).saveSchedule({ ...schedule, nextDueAt: next });
}

export const briefRoutes = {
  brief: {
    async GET(ctx: RequestContext) {
      const access = await ctx.workspace();
      const view = await scheduleView(ctx, 'daily');
      const schedule = await store(ctx).schedule(ctx.user.id, 'daily');
      const day = today(ctx.now(), schedule?.timeZone ?? 'Asia/Tashkent');
      const row = await store(ctx).recordOfDay(ctx.user.id, 'brief', day);
      return { ...view, today: row && row.workspaceId === access.workspace.id ? briefView(row) : null };
    },
    async PUT(ctx: RequestContext) {
      const body = record(await ctx.body());
      if (body.enabled === true) await requireLearner(ctx, 'L14');
      return saveScheduleFrom(ctx, 'daily', body);
    },
    /** Today's brief now (the web "get it now" button), charged once per day. */
    async POST(ctx: RequestContext) {
      const access = await requireLearner(ctx, 'daily.brief');
      const outcome = await dailyBrief(ctx, access);
      if (outcome.status !== 'ready') throw new SchoodAIError('notify_later', 'Try again later.', 409, { reason: outcome.reason });
      return { today: briefView(outcome.record), fresh: outcome.fresh };
    },
  },
  'brief-answer': {
    service: true,
    async POST(ctx: RequestContext) {
      const body = record(await ctx.body());
      return answerBrief(ctx, { id: uuid(body.id, 'id'), q: integer(body.q, 'q', 0, 3), choice: integer(body.choice, 'choice', 0, 3) });
    },
  },
};
