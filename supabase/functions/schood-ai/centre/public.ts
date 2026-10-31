import { publicTest } from '../../../../packages/ai-core/src/centre/placement.ts';
import { tashkentDay } from '../../../../packages/ai-core/src/mod.ts';
import { brandingView } from '../core/views.ts';
import { registerSystemJob } from '../registries.ts';
import type { StoreHandle } from '../stores.ts';
import { SchoodAIError, type Locale, type RequestContext, type Workspace } from '../types.ts';
import { runRetention } from './admin.ts';
import { agentTurn, LIMITS, openThread, say, T, type AgentMessage } from './admissions.ts';
import { centreDeps, centreStore, type CentreDeps } from './binding.ts';
import { botToken, sendText, webhookSecretHash } from './bot.ts';
import { briefDue, buildBrief, deliverBrief } from './brief.ts';
import { computeByokFees } from './byok.ts';
import { sha256Hex, timingSafeEqual } from './crypto.ts';
import { embedView } from './embed.ts';
import { computeInsights } from './insights.ts';
import { aiMark, cleanAnswers, loadTest, submitAttempt } from './placement.ts';
import { computeWholesale } from './resell.ts';
import { asCentre } from './runner.ts';
import { asRecord, clean, monthOf, requireCentre, tashkentWeek } from './shared.ts';
import { StoreConflict } from './store-memory.ts';
import type { AdmissionsRow, SettingsRow } from './store.ts';

// The centre's work with nobody signed in, on core's anonymous routes (mod.ts) and
// core's scheduler (registerSystemJob, bottom of this file):
//   POST centre/bot-webhook?bot=<ref>       the centre's own Telegram bot (C8), checked by
//                                           Telegram's X-Telegram-Bot-Api-Secret-Token;
//   GET  centre/embed-config?key=           the website widgets (C14, C8), answered only for
//   POST centre/embed-chat | embed-poll |   an Origin on the centre's own list (CORS for any
//        embed-placement                    Origin is core's; the check is here);
//   job  centre.monday_brief                Monday briefs, every 15 minutes;
//   job  centre.daily                       retention, monthly ledgers, insights.
// AI here is paid by the centre's pool through ctx.paidBy (runner.ts asCentre), and
// only after the centre's own switch for that widget, bot or brief is on.

const SESSION = /^[A-Za-z0-9_-]{16,64}$/;
const LANG = (value: unknown): Locale => (typeof value === 'string' && /^ru/i.test(value) ? 'ru' : typeof value === 'string' && /^en/i.test(value) ? 'en' : 'uz');
const workspaceLocale = (workspace: Workspace): Locale => (workspace.houseStyle.instruction_language === 'ru' ? 'ru' : workspace.houseStyle.instruction_language === 'en' ? 'en' : 'uz');
const keyboard = (message: AgentMessage) => message.buttons?.length ? { reply_markup: { inline_keyboard: message.buttons.reduce<{ text: string; callback_data: string }[][]>((rows, button, index) => { if (index % 2 === 0) rows.push([]); rows.at(-1)!.push({ text: button.label, callback_data: button.data.slice(0, 64) }); return rows; }, []) } } : {};

// --- Telegram (anonymous) ---------------------------------------------------------------------

const SECRET_HEADER = 'x-telegram-bot-api-secret-token';
const presentedSecret = (headers: Headers) => {
  const value = headers.get(SECRET_HEADER) ?? '';
  return value.length >= 16 && value.length <= 256 ? value : null;
};

/**
 * Whose rate budget a webhook call uses: its bot's, when the secret token belongs to a
 * bot we know (Telegram calls every centre's bot from a few addresses). Unknown or made-up
 * tokens return null and stay limited per address.
 */
export async function botRateKey(req: Request, input: { store<T>(handle: StoreHandle<T>): T }): Promise<string | null> {
  const token = presentedSecret(req.headers);
  if (!token) return null;
  const deps = await input.store(centreStore).deps();
  const row = await deps.store.table('admissions').get({ webhook_secret_hash: await webhookSecretHash(token) });
  return row ? `centre-bot:${row.workspace_id}` : null;
}

/**
 * POST centre/bot-webhook?bot=<ref>: an update from a centre's own bot, with Telegram's
 * secret token for that bot in its header (compared by hash, in constant time, never
 * logged). Telegram gets its 200 at once; the reply is sent after it.
 */
export async function botWebhook(ctx: RequestContext) {
  const deps = await centreDeps(ctx);
  const ref = ctx.query.get('bot') ?? '', presented = presentedSecret(ctx.headers);
  const row = /^[A-Za-z0-9_-]{16,40}$/.test(ref) ? await deps.store.table('admissions').get({ bot_ref: ref }) : null;
  if (!row || !row.webhook_secret_hash || !presented || !timingSafeEqual(await webhookSecretHash(presented), row.webhook_secret_hash)) throw new SchoodAIError('unauthorized', 'Unknown bot.', 401);
  const update = await ctx.body();
  const updateId = Number(update.update_id);
  if (!Number.isSafeInteger(updateId)) return { ok: true };
  try {
    await deps.store.table('tg_updates').insert({ workspace_id: row.workspace_id, update_id: updateId });
  } catch (cause) {
    if (cause instanceof StoreConflict) return { ok: true };
    throw cause;
  }
  ctx.after(() => handleUpdate(ctx, deps, row, update).catch((cause) => console.error(JSON.stringify({ event: 'schood_ai_centre_bot_failed', error: String(cause).slice(0, 300) }))));
  return { ok: true };
}

async function handleUpdate(ctx: RequestContext, deps: CentreDeps, row: AdmissionsRow, update: Record<string, unknown>) {
  const workspace = await ctx.repo.workspace(row.workspace_id);
  const token = await botToken(deps, row.workspace_id);
  if (!workspace || workspace.kind !== 'centre' || workspace.status !== 'active' || !token) return;
  const callback = asRecord(update.callback_query), message = asRecord(update.message);
  const source = callback.id ? asRecord(callback.message) : message;
  const chat = asRecord(source.chat), from = asRecord(callback.id ? callback.from : message.from);
  if (callback.id) await deps.telegram.call(token, 'answerCallbackQuery', { callback_query_id: String(callback.id) });
  if (chat.type !== 'private' || chat.id === undefined) return;
  const chatId = String(chat.id), locale = LANG(from.language_code);
  const content = callback.id ? clean(callback.data, 64) : clean(message.text ?? message.caption, 2000);
  if (!content) {
    await sendText(deps, token, chatId, say({ en: 'Please write your question as text.', uz: 'Savolingizni matn bilan yozing, iltimos.', ru: 'Пожалуйста, напишите вопрос текстом.' }, locale));
    return;
  }
  const staff = /^\/(?:start\s+staff_|staff\s+)([A-Z0-9]{8})$/i.exec(content);
  if (staff) {
    const linked = await deps.store.claimStaffCode(row.workspace_id, await sha256Hex(`staff:${staff[1].toUpperCase()}`), chatId, ctx.now());
    await sendText(deps, token, chatId, say(linked ? T.staffLinked : T.staffFailed, locale, { centre: workspace.name }));
    if (linked) await ctx.repo.audit({ workspaceId: workspace.id, actorId: linked, event: 'centre.staff_chat_linked', targetType: 'member', targetId: linked, details: {} });
    return;
  }
  if (!row.enabled) return;
  let thread = await openThread(deps, workspace.id, 'telegram', chatId, locale, ctx.now());
  if (!thread) { await sendText(deps, token, chatId, say(T.limit, locale, { centre: workspace.name })); return; }
  const username = clean(from.username, 40);
  if (username && thread.contact.telegram !== username) [thread] = await deps.store.table('threads').update({ id: thread.id }, { contact: { ...thread.contact, telegram: username } });
  const centre = await asCentre(ctx, workspace, thread.language);
  const replies = await agentTurn({ ctx: centre, deps, workspace, config: row, thread, text: content, channel: 'telegram', now: ctx.now() });
  for (const reply of replies) await sendText(deps, token, chatId, reply.text, keyboard(reply));
}

// --- Website widgets (anonymous) ----------------------------------------------------------------

interface Embed { deps: CentreDeps; settings: SettingsRow; workspace: Workspace; locale: Locale; body: Record<string, unknown>; centre: RequestContext; chatOn: boolean; placementOn: boolean; admissions: AdmissionsRow | null }

/** The centre behind a widget key, answered only for a website the centre allowed and a plan with C14. */
async function embed(ctx: RequestContext): Promise<Embed> {
  const body = ctx.method === 'GET' ? {} : await ctx.body();
  const key = String(ctx.query.get('key') ?? body.key ?? ''), site = (ctx.origin ?? '').toLowerCase();
  const deps = await centreDeps(ctx);
  const settings = /^[A-Za-z0-9_-]{20,40}$/.test(key) ? await deps.store.table('settings').get({ public_key: key }) : null;
  const workspace = settings ? await ctx.repo.workspace(settings.workspace_id) : null;
  if (!settings || !workspace || workspace.kind !== 'centre' || workspace.status !== 'active') throw new SchoodAIError('not_found', 'Unknown widget key.', 404);
  // Core answers CORS for any Origin on these routes; only the centre's own sites get an answer.
  if (!site || !settings.embed_domains.includes(site)) throw new SchoodAIError('origin_denied', 'This website is not allowed to show the centre’s widget.', 403);
  const locale = LANG(body.lang ?? ctx.query.get('lang'));
  const centre = await asCentre(ctx, workspace, locale);
  const [c14, c8, c5] = await Promise.all([centre.access('C14'), centre.access('C8'), centre.access('C5')]);
  if (!c14.allowed) throw new SchoodAIError('plan_required', 'This centre’s plan does not include website widgets.', 402);
  const view = embedView(settings, deps.config.appUrl), admissions = await deps.store.table('admissions').get({ workspace_id: workspace.id });
  return {
    deps, settings, workspace, locale, body, centre, admissions,
    chatOn: view.widgets.admissions_chat && c8.allowed && admissions?.enabled === true,
    placementOn: view.widgets.placement && c5.allowed && !!view.widgets.placement_page_id,
  };
}
async function sessionOf(body: Record<string, unknown>): Promise<string> {
  const session = typeof body.session === 'string' && SESSION.test(body.session) ? body.session : null;
  if (!session) throw new SchoodAIError('invalid_request', 'session is required.', 400, { field: 'session' });
  return (await sha256Hex(`widget:${session}`)).slice(0, 40);
}

/** GET centre/embed-config?key=&lang=: what the widget shows (branding, which widgets are on). */
export async function embedConfig(ctx: RequestContext) {
  const { deps, settings, workspace, locale, placementOn, chatOn } = await embed(ctx);
  const view = embedView(settings, deps.config.appUrl), branding = brandingView(workspace.branding);
  let placement = null;
  if (placementOn) {
    try {
      const { test } = await loadTest(ctx.repo, workspace.id, view.widgets.placement_page_id!, { approvedOnly: true });
      placement = { title: test.title, minutes: test.minutes ?? null, questions: test.sections.reduce((n, sec) => n + (sec.items?.length ?? 0), 0) };
    } catch { placement = null; }
  }
  return {
    centre: workspace.name, assistant_name: branding.assistant_name ?? workspace.name, logo_url: branding.logo_url, avatar_url: view.white_label.avatar_url,
    primary_color: branding.primary_color, accent_color: branding.accent_color, position: view.widgets.position,
    greeting: (view.widgets.greeting as Record<string, string>)[locale] ?? say(T.greeting, locale, { centre: workspace.name }),
    launcher_label: (view.white_label.launcher_label as Record<string, string>)[locale] ?? null,
    widgets: { admissions_chat: chatOn, placement: !!placement }, placement,
  };
}

/** POST centre/embed-chat { key, session, message, lang }: one admissions turn, paid by the centre. */
export async function embedChat(ctx: RequestContext) {
  const { deps, workspace, locale, body, chatOn, admissions } = await embed(ctx);
  if (!chatOn || !admissions) throw new SchoodAIError('widget_off', 'The chat is not switched on.', 409);
  const external = await sessionOf(body);
  const message = clean(body.message, 2000);
  if (!message) throw new SchoodAIError('invalid_request', 'message is required.', 400, { field: 'message' });
  const thread = await openThread(deps, workspace.id, 'widget', external, locale, ctx.now());
  if (!thread) return { messages: [{ role: 'agent', text: say(T.limit, locale, { centre: workspace.name }) }], status: 'open' };
  const centre = await asCentre(ctx, workspace, thread.language);
  const replies = await agentTurn({ ctx: centre, deps, workspace, config: admissions, thread, text: message, channel: 'widget', now: ctx.now() });
  const last = (await deps.store.table('admissions_messages').list({ thread_id: thread.id }, { order: 'id', desc: true, limit: 1 }))[0];
  const fresh = await deps.store.table('threads').get({ id: thread.id });
  return { messages: replies.map((reply) => ({ role: 'agent', text: reply.text, buttons: reply.buttons ?? [] })), status: fresh?.status ?? thread.status, last_id: last?.id ?? 0 };
}

/** POST centre/embed-poll { key, session, after }: staff replies since `after` (no AI). */
export async function embedPoll(ctx: RequestContext) {
  const { deps, workspace, body, chatOn } = await embed(ctx);
  if (!chatOn) throw new SchoodAIError('widget_off', 'The chat is not switched on.', 409);
  const thread = await deps.store.table('threads').get({ workspace_id: workspace.id, channel: 'widget', external_id: await sessionOf(body) });
  if (!thread) return { messages: [], status: 'new' };
  const after = Number(body.after ?? 0);
  const rows = await deps.store.table('admissions_messages').list({ thread_id: thread.id }, { order: 'id', gte: { id: Number.isFinite(after) ? after + 1 : 0 }, limit: 50 });
  return { status: thread.status, messages: rows.filter((entry) => entry.role === 'agent' || entry.role === 'staff').map((entry) => ({ id: entry.id, role: entry.role, text: entry.content })) };
}

/** POST centre/embed-placement { key, session, step: start | answer | submit, … }: the website placement test. */
export async function embedPlacement(ctx: RequestContext) {
  const { deps, settings, workspace, locale, body, centre, placementOn } = await embed(ctx);
  if (!placementOn) throw new SchoodAIError('widget_off', 'The placement test is not switched on.', 409);
  const external = await sessionOf(body);
  const view = embedView(settings, deps.config.appUrl);
  const { page, test } = await loadTest(ctx.repo, workspace.id, view.widgets.placement_page_id!, { approvedOnly: true });
  const step = typeof body.step === 'string' ? body.step : '';
  const day = tashkentDay(ctx.now());
  if (step === 'start') {
    if (!await deps.store.takePublic(workspace.id, 'placement_starts', day, LIMITS.newThreadsPerDay)) throw new SchoodAIError('capped', 'Too many tests today.', 429);
    const name = clean(body.name, 120), phone = clean(body.phone, 30);
    const attempt = await deps.store.table('attempts').insert({ workspace_id: workspace.id, test_page_id: page.id, test_revision: page.revision, channel: 'widget', prospect: { name, phone: phone && /^\+?[0-9][0-9 ()-]{6,18}$/.test(phone) ? phone : null, session: external } });
    return { attempt_id: attempt.id, test: publicTest(test) };
  }
  const attempt = typeof body.attempt_id === 'string' ? await deps.store.table('attempts').get({ id: body.attempt_id, workspace_id: workspace.id }) : null;
  if (!attempt || attempt.prospect.session !== external) throw new SchoodAIError('not_found', 'Attempt not found.', 404);
  if (step === 'answer') {
    if (attempt.status !== 'in_progress') throw new SchoodAIError('attempt_closed', 'Already handed in.', 409);
    const answers = cleanAnswers(test, { ...attempt.answers, ...asRecord(body.answers) });
    await deps.store.table('attempts').update({ id: attempt.id, status: 'in_progress' }, { answers });
    return { saved: Object.keys(answers).length };
  }
  if (step !== 'submit') throw new SchoodAIError('invalid_request', 'step must be start, answer or submit.', 400, { field: 'step' });
  const submitted = attempt.status === 'in_progress' ? await submitAttempt(deps.store, attempt, test, ctx.now()) : attempt;
  let marked = false;
  if (test.sections.some((sec) => sec.kind !== 'objective' && typeof submitted.answers[sec.id] === 'string') && !submitted.ai_marks && await deps.store.takePublic(workspace.id, 'placement_marks', day, 100)) {
    try { await aiMark(centre, deps.store, submitted, test); marked = true; } catch (cause) { if (!(cause instanceof SchoodAIError)) throw cause; }
  }
  const objective = asRecord(submitted.objective);
  return { level: submitted.level, percent: objective.percent ?? null, correct: objective.correct ?? null, total: objective.total ?? null, marked, note: say({ en: 'A teacher confirms your level.', uz: 'Darajangizni o‘qituvchi tasdiqlaydi.', ru: 'Уровень подтвердит преподаватель.' }, locale) };
}

// --- Scheduled jobs (core's scheduler) -----------------------------------------------------------
// Core's scheduler runs these on its five-minute tick (registerSystemJob); each run does a
// bounded amount of work, and what is left waits for the next run.

/** Active centres, in a stable order (settings rows are one per centre). */
async function* activeCentres(ctx: RequestContext, deps: CentreDeps): AsyncGenerator<Workspace> {
  for (const row of await deps.store.table('settings').list({}, { order: 'workspace_id', limit: 5000 })) {
    const workspace = await ctx.repo.workspace(row.workspace_id);
    if (workspace && workspace.kind === 'centre' && workspace.status === 'active') yield workspace;
  }
}
const failed = (job: string, workspace: Workspace, cause: unknown) => console.error(JSON.stringify({ event: 'schood_ai_centre_job_failed', job, workspace_id: workspace.id, error: String(cause instanceof Error ? cause.name : 'error') }));
export const JOB_LIMITS = { briefBuilds: 8, dailyCentres: 100 } as const;

/**
 * Builds due Monday briefs (from each centre's chosen hour, Tashkent time) and delivers
 * them, and retries deliveries quiet hours or the daily limit held back. At most
 * `JOB_LIMITS.briefBuilds` new briefs a run, since each is a model call.
 */
export async function runBriefs(ctx: RequestContext, builds: number = JOB_LIMITS.briefBuilds) {
  const deps = await centreDeps(ctx);
  const at = ctx.now(), week = tashkentWeek(at);
  const summary = { centres: 0, built: 0, delivered: 0, waiting: 0, failed: 0 };
  for await (const workspace of activeCentres(ctx, deps)) {
    summary.centres++;
    try {
      const existing = await deps.store.table('briefs').get({ workspace_id: workspace.id, week });
      const settings = await deps.store.table('settings').get({ workspace_id: workspace.id });
      if (!settings || (settings.brief as { enabled?: boolean }).enabled !== true) continue;
      const centre = await asCentre(ctx, workspace, workspaceLocale(workspace));
      const full = await requireCentre(centre);
      const due = briefDue(full, at, existing);
      if (!due || !(await centre.access('C10')).allowed) continue;
      if (due === 'build' && summary.built >= builds) { summary.waiting++; continue; }
      const brief = due === 'build' ? await buildBrief(centre, full, 'scheduled') : existing!;
      if (due === 'build') summary.built++;
      const sent = await deliverBrief(centre, full, brief);
      summary.delivered += (sent.deliveries as { status: string }[]).filter((entry) => entry.status === 'sent').length;
    } catch (cause) {
      summary.failed++;
      failed('brief', workspace, cause);
    }
  }
  return summary;
}

/**
 * Once a day per centre: retention, this and last month's ledgers, insights. At most
 * `limit` centres a run; a centre done today is skipped, so the day's runs finish the rest.
 */
export async function runDaily(ctx: RequestContext, limit: number = JOB_LIMITS.dailyCentres) {
  const deps = await centreDeps(ctx);
  const at = ctx.now(), day = tashkentDay(at), month = monthOf(at);
  const previous = monthOf(new Date(Date.parse(`${month}-01T00:00:00+05:00`) - 86_400_000));
  const summary = { done: 0, retention: 0, ledgers: 0, insights: 0, failed: 0, more: false };
  for await (const workspace of activeCentres(ctx, deps)) {
    if (summary.done >= limit) { summary.more = true; break; }
    if (!await deps.store.takePublic(workspace.id, 'cron_daily', day, 1)) continue;
    summary.done++;
    try {
      const centre = await asCentre(ctx, workspace, workspaceLocale(workspace));
      const full = await requireCentre(centre);
      const insights = (await centre.access('C6')).allowed;
      const removed = await runRetention(centre, full);
      summary.retention += removed.chats + removed.conversations;
      if (await computeWholesale(deps.store, workspace.id, month)) summary.ledgers++;
      await computeByokFees(deps.store, workspace.id, month);
      if (insights) { await computeInsights(centre, full, month); summary.insights++; }
      if (await deps.store.takePublic(workspace.id, `cron_month_${previous}`, day, 1)) {
        await computeWholesale(deps.store, workspace.id, previous);
        await computeByokFees(deps.store, workspace.id, previous);
        if (insights) await computeInsights(centre, full, previous);
      }
    } catch (cause) {
      summary.failed++;
      failed('daily', workspace, cause);
    }
  }
  return summary;
}

export function registerCentreJobs(): void {
  registerSystemJob('centre.monday_brief', { area: 'centre', schedule: { everyMinutes: 15 }, timeoutMs: 110_000, run: (ctx) => runBriefs(ctx) });
  registerSystemJob('centre.daily', { area: 'centre', schedule: { everyMinutes: 30 }, timeoutMs: 110_000, run: (ctx) => runDaily(ctx) });
}
