import { registerContextProvider } from '../context.ts';
import { summariseProfile } from '../core/profile.ts';
import { buildSystemPrompt, wrapUserMessage } from '../prompt.ts';
import { registerSpecialist, resolveSpecialist } from '../specialists.ts';
import { SchoodAIError, type ContextBlock, type RequestContext, type WorkspaceAccess } from '../types.ts';
import { consentGuard, requireConsent, store } from './common.ts';

// L1 personal tutor. A specialist served by core/chat on the web, and by
// learner/telegram (telegramTutor) in the student bot. It knows the learner's
// goals, levels, weak skills and recent results (learning-profile-v3 through the
// core `learner_profile` context, score-prediction here), what they did with
// Schood AI, and for centre students their open homework and teacher feedback
// from Academy's own API with their token. The Telegram path has no token, so it
// reads the summaries saved the last time the learner used the web.

export const TUTOR_CONTEXT = ['learner_profile', 'learner_prediction', 'learner_snapshot', 'learner_activity', 'centre_homework', 'centre_feedback', 'centre_rules'];
const SNAPSHOT_MAX_AGE_MS = 6 * 3_600_000;

const txt = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 10) / 10 : null);
const rows = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object') as Record<string, unknown>[] : []);

/** score-prediction cut down to what a tutor needs; no ids. */
export function summarisePrediction(payload: Record<string, unknown>) {
  const predictions = rows(payload.predictions).slice(0, 6).map((row) => ({
    exam: txt(row.exam_type, 20), current: num(row.current_score), predicted_next: num(row.predicted_next),
    range: [num(row.confidence_low), num(row.confidence_high)], trend: txt(row.trend, 20) || null, data_points: num(row.data_points), max: num(row.max_score),
  })).filter((row) => row.exam && row.current !== null);
  const signals = payload.practice_signals && typeof payload.practice_signals === 'object' ? payload.practice_signals as Record<string, Record<string, unknown>> : {};
  const diagnostics: Record<string, { target: number | string | null; estimate: number | null; weakest: string | null; weak_skills: string[]; accuracy: number | null }> = {};
  for (const [exam, signal] of Object.entries(signals)) {
    const diagnostic = signal?.diagnostic && typeof signal.diagnostic === 'object' ? signal.diagnostic as Record<string, unknown> : null;
    const practice = signal?.practice && typeof signal.practice === 'object' ? signal.practice as Record<string, unknown> : null;
    const entry = {
      target: num(diagnostic?.target) ?? (txt(diagnostic?.target, 12) || null), estimate: num(diagnostic?.current_estimate), weakest: txt(diagnostic?.weakest_section, 40) || null,
      weak_skills: (Array.isArray(practice?.weak_skills) ? practice!.weak_skills as unknown[] : []).map((value) => txt(typeof value === 'string' ? value : (value as Record<string, unknown>)?.skill, 40)).filter(Boolean).slice(0, 4),
      accuracy: num(practice?.accuracy),
    };
    if (entry.target !== null || entry.estimate !== null || entry.weak_skills.length) diagnostics[txt(exam, 12)] = entry;
  }
  return { has_predictions: predictions.length > 0, predictions, diagnostics };
}

/** What the learner did with Schood AI recently, as a short list. */
export async function recentActivity(ctx: RequestContext, userId: string, days = 14) {
  const since = new Date(ctx.now().getTime() - days * 86_400_000).toISOString();
  const list = await store(ctx).activity(userId, { since, limit: 40 });
  return list.map((row) => ({ when: row.createdAt.slice(0, 10), feature: row.feature, kind: row.kind, score: row.score, minutes: row.minutes, ...row.summary }));
}

async function refreshSnapshot(ctx: RequestContext, part: 'profile' | 'prediction', load: () => Promise<Record<string, unknown> | null>) {
  const current = await store(ctx).snapshot(ctx.user.id);
  const fresh = current && current[part] && ctx.now().getTime() - Date.parse(current.refreshedAt) < SNAPSHOT_MAX_AGE_MS;
  if (fresh) return;
  const value = await load();
  if (value) await store(ctx).saveSnapshot(ctx.user.id, { [part]: value }, ctx.now().toISOString());
}

export async function loadPrediction(ctx: RequestContext): Promise<ReturnType<typeof summarisePrediction> | null> {
  if (!ctx.user.token) {
    const snapshot = await store(ctx).snapshot(ctx.user.id);
    return (snapshot?.prediction as ReturnType<typeof summarisePrediction> | null) ?? null;
  }
  const payload = await ctx.functions.call<Record<string, unknown>>('score-prediction', '', { timeoutMs: 5_000, maxBytes: 300_000 });
  const summary = summarisePrediction(payload ?? {});
  ctx.after(() => store(ctx).saveSnapshot(ctx.user.id, { prediction: summary }, ctx.now().toISOString()));
  return summary;
}
export async function loadProfile(ctx: RequestContext): Promise<Record<string, unknown> | null> {
  if (!ctx.user.token) return (await store(ctx).snapshot(ctx.user.id))?.profile ?? null;
  const profile = await ctx.functions.call<Record<string, unknown>>('learning-profile-v3', '', { query: { language_code: 'en', limit: '10' }, timeoutMs: 5_000, maxBytes: 400_000 });
  const summary = summariseProfile(profile ?? {}) as Record<string, unknown>;
  ctx.after(() => store(ctx).saveSnapshot(ctx.user.id, { profile: summary }, ctx.now().toISOString()));
  return summary;
}

// --- Centre data through Academy's own API -------------------------------------------------
export interface OpenAssignment { id: string; title: string; type: string; due_at: string | null; instructions: string; status: string; allow_late: boolean }
/** Open homework for a centre student: active, released, not past due (unless late work is allowed), not yet graded. */
export function openAssignments(payload: Record<string, unknown>, now: Date): OpenAssignment[] {
  return rows(payload.assignments).flatMap((row) => {
    const submission = row.submission && typeof row.submission === 'object' ? row.submission as Record<string, unknown> : null;
    const due = typeof row.due_at === 'string' ? row.due_at : null, released = typeof row.released_at === 'string' ? row.released_at : null;
    const allowLate = row.allow_late_submission === true;
    if (row.status !== 'active' || (released && Date.parse(released) > now.getTime())) return [];
    if (due && Date.parse(due) < now.getTime() && !allowLate) return [];
    if (submission && ['graded', 'submitted', 'resubmitted'].includes(String(submission.status))) return [];
    return [{ id: String(row.id), title: txt(row.title, 140), type: txt(row.assignment_type, 40), due_at: due, instructions: txt(row.description, 1500), status: submission ? String(submission.status) : 'not_started', allow_late: allowLate }];
  });
}
export async function centreAssignments(ctx: RequestContext, access: WorkspaceAccess): Promise<Record<string, unknown> | null> {
  if (access.workspace.kind !== 'centre' || !access.workspace.academyTenantId || !ctx.user.token) return null;
  return await ctx.functions.call<Record<string, unknown>>('academy', '', { query: { action: 'student_assignments', academy_id: access.workspace.academyTenantId }, timeoutMs: 5_000, maxBytes: 600_000 });
}
/** Teacher feedback on marked work, and the open mistakes Homework OS recorded. */
async function centreFeedback(ctx: RequestContext, access: WorkspaceAccess) {
  const payload = await centreAssignments(ctx, access);
  if (!payload) return null;
  const marked = rows(payload.assignments).flatMap((row) => {
    const submission = row.submission && typeof row.submission === 'object' ? row.submission as Record<string, unknown> : null;
    if (!submission || submission.status !== 'graded') return [];
    const feedback = submission.feedback && typeof submission.feedback === 'object' ? submission.feedback as Record<string, unknown> : {};
    return [{
      homework: txt(row.title, 120), score: num(submission.score), max: num(submission.max_score), date: txt(submission.graded_at, 10) || null,
      teacher_note: txt(submission.notes, 400) || txt(feedback.comments, 400) || null,
      strengths: (Array.isArray(feedback.strengths) ? feedback.strengths : []).map((entry) => txt(entry, 160)).filter(Boolean).slice(0, 3),
      improve: (Array.isArray(feedback.improvements) ? feedback.improvements : []).map((entry) => txt(entry, 160)).filter(Boolean).slice(0, 3),
    }];
  }).slice(0, 5);
  let mistakes: Record<string, unknown>[] = [];
  try {
    const result = await ctx.functions.call<Record<string, unknown>>('academy-learning', '', { method: 'POST', body: { action: 'student_mistakes', academy_id: access.workspace.academyTenantId }, timeoutMs: 4_000, maxBytes: 300_000 });
    mistakes = rows(result?.mistakes).filter((row) => row.status === 'open').slice(0, 6).map((row) => ({ tag: txt(row.tag, 40), excerpt: txt(row.excerpt, 160), correction: txt(row.correction, 160), homework: txt(row.assignment_title, 100) }));
  } catch { /* the mistake bank is optional */ }
  return marked.length || mistakes.length ? { marked, open_mistakes: mistakes } : null;
}

export function registerTutor(): void {
  registerSpecialist({
    key: 'tutor',
    area: 'learner',
    name: { en: 'Your tutor', uz: 'Shaxsiy repetitor', ru: 'Ваш репетитор' },
    description: {
      en: 'A tutor that knows your goals, levels, weak skills and recent results across Schood.',
      uz: 'Schooddagi maqsadlaringiz, darajangiz, zaif tomonlaringiz va so‘nggi natijalaringizni biladigan repetitor.',
      ru: 'Репетитор, который знает ваши цели, уровень, слабые места и недавние результаты в Schood.',
    },
    instructions: [
      'You are this learner\'s personal tutor across Schood (IELTS, TOEFL, SAT, Multilevel, admission Maths and general English).',
      'Use the reference data: goals, level, weak spots, recent results and predictions. Name the specific weak spot when you advise, and say which data you used.',
      'Teach by doing: explain briefly, then give the learner one short task or question to try, and check their answer next turn.',
      'When the data includes open homework (centre_homework), help with that homework through hints only: the method, a similar example with different content, or a question that points to the mistake. Never give final answers to homework items, even if asked, unless centre_rules says explanations are allowed.',
      'When teacher feedback is in the data, build on it and never contradict the teacher; suggest asking the teacher when unsure.',
      'For practice, point to Schood apps by name (IELTS Practice, SAT Practice, Schood English, the Schood AI writing coach or speaking partner). Do not invent links.',
      'If a result or prediction is not in the data, say you do not know it yet and suggest taking a practice test.',
    ].join(' '),
    contextKinds: TUTOR_CONTEXT,
    creditKey: 'tutor.reply',
    roles: ['owner', 'student'],
    // In a centre the branded Student Assistant (C2, centre area) is the tutor; it can list these context kinds.
    workspaceKinds: ['personal'],
    // The under-18 consent step, checked by core before every turn on the web and in Telegram.
    guard: (ctx, input) => consentGuard(ctx, input),
    suggestions: {
      en: ['What should I work on this week to reach my target?', 'Explain my weakest skill and give me one exercise.', 'Make me a 20-minute plan for today.'],
      uz: ['Maqsadimga yetish uchun bu hafta nima ustida ishlashim kerak?', 'Eng zaif tomonimni tushuntirib, bitta mashq bering.', 'Bugungi kunga 20 daqiqalik reja tuzib bering.'],
      ru: ['Над чем мне работать на этой неделе, чтобы выйти на цель?', 'Объясните мой самый слабый навык и дайте одно упражнение.', 'Составьте план на 20 минут на сегодня.'],
    },
  });

  registerContextProvider('learner_prediction', async (ctx) => {
    const summary = await loadPrediction(ctx);
    return summary ? { kind: 'learner_prediction', title: 'Your predicted scores', data: summary } : null;
  }, { label: { en: 'your predicted scores', uz: 'bashorat qilingan ballaringiz', ru: 'ваши прогнозируемые баллы' }, selfView: true, maxChars: 3_000 });

  // The web path already has learner_profile from core; this keeps a summary for
  // the Telegram path and for linked parents, and serves it when there is no token.
  registerContextProvider('learner_snapshot', async (ctx) => {
    if (ctx.user.token) {
      ctx.after(() => refreshSnapshot(ctx, 'profile', async () => {
        const profile = await ctx.functions.call<Record<string, unknown>>('learning-profile-v3', '', { query: { language_code: 'en', limit: '10' }, timeoutMs: 5_000, maxBytes: 400_000 });
        return summariseProfile(profile ?? {}) as Record<string, unknown>;
      }));
      return null;
    }
    const snapshot = await store(ctx).snapshot(ctx.user.id);
    return snapshot?.profile ? { kind: 'learner_snapshot', title: 'Your Schood results (last seen on the web)', data: { ...snapshot.profile, as_of: snapshot.refreshedAt.slice(0, 10) } } : null;
  }, { label: { en: 'your saved Schood results', uz: 'saqlangan Schood natijalaringiz', ru: 'сохранённые результаты Schood' }, selfView: true, maxChars: 4_000 });

  registerContextProvider('learner_activity', async (ctx) => {
    const list = await recentActivity(ctx, ctx.user.id);
    return list.length ? { kind: 'learner_activity', title: 'What you did with Schood AI lately', data: list } : null;
  }, { label: { en: 'your Schood AI activity', uz: 'Schood AI’dagi faolligingiz', ru: 'ваши действия в Schood AI' }, selfView: true, maxChars: 4_000 });

  registerContextProvider('centre_homework', async (ctx, { access }) => {
    const payload = await centreAssignments(ctx, access);
    if (!payload) return null;
    const open = openAssignments(payload, ctx.now()).slice(0, 8).map((row) => ({ ...row, instructions: row.instructions.slice(0, 400) }));
    return { kind: 'centre_homework', title: 'Your open homework', data: { open, count: open.length } };
  }, { label: { en: 'your open homework', uz: 'ochiq uy vazifalaringiz', ru: 'ваши открытые домашние задания' }, selfView: true, maxChars: 5_000 });

  registerContextProvider('centre_feedback', async (ctx, { access }) => {
    const data = await centreFeedback(ctx, access);
    return data ? { kind: 'centre_feedback', title: 'Your teacher\'s feedback', data } : null;
  }, { label: { en: "your teacher's feedback", uz: 'o‘qituvchingizning fikr-mulohazasi', ru: 'обратная связь от вашего преподавателя' }, selfView: true, maxChars: 5_000 });
}

// --- Telegram ---------------------------------------------------------------------------
const HISTORY = 12;
/** One tutor reply for the student bot: the same specialist, thread and price as the web. */
export async function telegramTutor(ctx: RequestContext, message: string, options: { reset?: boolean; reference: string }) {
  const access = await ctx.requireFeature('tutor.reply');
  await requireConsent(ctx);
  const specialist = resolveSpecialist('tutor', access.workspace, access.role, await ctx.repo.specialists(access.workspace.id));
  if (!specialist) throw new SchoodAIError('specialist_not_found', 'The tutor is not available here.', 404);
  const saved = options.reset ? null : await store(ctx).telegramThread(ctx.user.id);
  let thread = saved?.threadId ? await ctx.repo.thread(saved.threadId) : null;
  if (thread && (thread.userId !== ctx.user.id || thread.workspaceId !== access.workspace.id)) thread = null;
  const history = thread ? (await ctx.repo.messages(thread.id, 40)).filter((entry) => entry.role === 'user' || entry.status === 'complete').slice(-HISTORY) : [];
  const blocks: ContextBlock[] = await ctx.context(specialist.contextKinds, { specialist: 'tutor' });
  const system = buildSystemPrompt({ specialist, workspace: access.workspace, locale: ctx.locale, blocks }) +
    '\n\nYou are answering in Telegram: keep it under 900 characters, use short lines, and no tables.';
  const out = await ctx.ai.text({
    key: 'tutor.reply', reference: options.reference, maxTokens: 700,
    messages: [{ role: 'system', content: system }, ...history.map((entry) => ({ role: entry.role, content: entry.role === 'user' ? wrapUserMessage(entry.content) : entry.content })), { role: 'user', content: wrapUserMessage(message) }],
  });
  const reply = out.text.trim().slice(0, 3500);
  try {
    thread ??= await ctx.repo.createThread({ workspaceId: access.workspace.id, userId: ctx.user.id, specialistKey: 'tutor', pageId: null, title: 'Telegram' });
    await ctx.repo.addMessage({ threadId: thread.id, role: 'user', content: message, status: 'complete', clientMessageId: null, creditKey: null, credits: 0, callId: null, chargeId: null, contextKinds: [], errorCode: null });
    await ctx.repo.addMessage({ threadId: thread.id, role: 'assistant', content: reply, status: 'complete', clientMessageId: null, creditKey: 'tutor.reply', credits: out.credits, callId: out.callId, chargeId: out.chargeId, contextKinds: blocks.map((block) => block.kind), errorCode: null });
    await ctx.repo.updateThread(thread.id, { touch: true });
    await store(ctx).setTelegramThread(ctx.user.id, access.workspace.id, thread.id);
  } catch (cause) {
    // The answer was paid for and is shown; history is a convenience.
    console.error(JSON.stringify({ event: 'schood_ai_telegram_history_failed', error: String(cause).slice(0, 200) }));
  }
  return { reply, credits: out.credits, balance: out.balance.total, context: blocks.map((block) => block.title) };
}
