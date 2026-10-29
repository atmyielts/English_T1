import { publicTest } from '../../../../packages/ai-core/src/materials/centre-placement.ts';
import { tashkentDay } from '../../../../packages/ai-core/src/mod.ts';
import { brandingView } from '../core/views.ts';
import { createRequestContext } from '../context.ts';
import type { Stores } from '../stores.ts';
import type { HandlerDeps } from '../handler.ts';
import { SchoodAIError, type Locale, type RequestContext, type Workspace } from '../types.ts';
import { runRetention } from './admin.ts';
import { agentTurn, LIMITS, openThread, say, T, type AgentMessage } from './admissions.ts';
import { centreStore, type CentreDeps } from './binding.ts';
import { botToken, sendText, webhookSecretHash } from './bot.ts';
import { briefDue, buildBrief, deliverBrief } from './brief.ts';
import { computeByokFees } from './byok.ts';
import { sha256Hex, timingSafeEqual } from './crypto.ts';
import { embedView } from './embed.ts';
import { computeInsights } from './insights.ts';
import { aiMark, cleanAnswers, loadTest, submitAttempt } from './placement.ts';
import { computeWholesale } from './resell.ts';
import { asRecord, clean, monthOf, requireCentre, tashkentWeek } from './shared.ts';
import { StoreConflict } from './store-memory.ts';
import type { AdmissionsRow, SettingsRow } from './store.ts';

// The centre's public routes, for callers without a Schood session:
//   POST /schood-ai/public/centre/telegram/<bot ref>   the centre's own Telegram bot (C8), checked by
//                                                      Telegram's X-Telegram-Bot-Api-Secret-Token header;
//   GET  /schood-ai/public/centre/embed/config?key=    website widgets (C14), answered only for Origins on
//   POST /schood-ai/public/centre/embed/<op>?key=      the centre's allowed list (chat, poll, placement);
//   POST /schood-ai/public/centre/cron                 the scheduler (X-Schood-Service-Secret): Monday
//                                                      briefs, retention, monthly ledgers, insights.
// Core's router only serves signed-in people, so index.ts mounts this handler in
// front of it (docs/product/ai-requests/centre.md). AI work here runs as the
// centre's owner, so it is charged to the centre's pooled credits under its plan.

export interface PublicOptions { serviceSecret?: string | null; now?: () => Date; after?: (work: Promise<unknown>) => void }
/** The handler's own dependencies, with the same area stores (core passes `stores` in index.ts). */
type Deps = Pick<HandlerDeps, 'repository' | 'gateway' | 'plans' | 'isAdmin' | 'callFunction'> & { stores: Stores };

const PATH = /\/schood-ai\/public\/centre\/(telegram\/([A-Za-z0-9_-]{16,40})|embed\/(config|chat|poll|placement)|cron)\/?$/;
const SESSION = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_BODY = 64 * 1024;
const LANG = (value: unknown): Locale => (typeof value === 'string' && /^ru/i.test(value) ? 'ru' : typeof value === 'string' && /^en/i.test(value) ? 'en' : 'uz');

/** A request context acting as the centre's owner (the system actor for public and scheduled work). */
export function systemContext(deps: Deps, workspace: Workspace, locale: Locale, action: string, options: { now: () => Date; after: (work: Promise<unknown>) => void }): RequestContext {
  return createRequestContext(
    { repo: deps.repository, gateway: deps.gateway, plans: deps.plans, stores: deps.stores, isAdmin: deps.isAdmin, callFunction: deps.callFunction, after: options.after, now: options.now, responseHeaders: {} },
    {
      url: new URL(`https://internal.invalid/functions/v1/schood-ai/centre/${action}?workspace_id=${workspace.id}`), headers: new Headers({ 'x-schood-locale': locale }),
      area: 'centre', action, method: 'POST', requestId: crypto.randomUUID(),
      user: { id: workspace.ownerId, email: null, token: null, via: 'service', telegramChatId: null }, readBody: () => Promise.resolve(new Uint8Array()),
    },
  );
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY) throw new SchoodAIError('payload_too_large', 'The request is too large.', 413);
  const raw = await req.text();
  if (raw.length > MAX_BODY) throw new SchoodAIError('payload_too_large', 'The request is too large.', 413);
  if (!raw.trim()) return {};
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch { /* fall through */ }
  throw new SchoodAIError('invalid_request', 'The request body must be a JSON object.', 400);
}

const keyboard = (message: AgentMessage) => message.buttons?.length ? { reply_markup: { inline_keyboard: message.buttons.reduce<{ text: string; callback_data: string }[][]>((rows, button, index) => { if (index % 2 === 0) rows.push([]); rows.at(-1)!.push({ text: button.label, callback_data: button.data.slice(0, 64) }); return rows; }, []) } } : {};

export function createCentrePublicHandler(deps: Deps, options: PublicOptions = {}) {
  const now = options.now ?? (() => new Date());
  const after = options.after ?? ((work: Promise<unknown>) => { void work; });
  const secret = options.serviceSecret && options.serviceSecret.length >= 32 ? options.serviceSecret : null;
  const keep = (work: () => Promise<unknown>) => after(work().catch((cause) => console.error(JSON.stringify({ event: 'schood_ai_centre_public_failed', error: String(cause).slice(0, 300) }))));
  const system = (workspace: Workspace, locale: Locale, action: string) => systemContext(deps, workspace, locale, action, { now, after });

  async function centreByKey(cdeps: CentreDeps, key: string | null): Promise<{ settings: SettingsRow; workspace: Workspace } | null> {
    if (!key || !/^[A-Za-z0-9_-]{20,40}$/.test(key)) return null;
    const settings = await cdeps.store.table('settings').get({ public_key: key });
    const workspace = settings ? await deps.repository.workspace(settings.workspace_id) : null;
    return settings && workspace && workspace.kind === 'centre' && workspace.status === 'active' ? { settings, workspace } : null;
  }

  // --- Telegram ------------------------------------------------------------------------------
  async function telegram(req: Request, ref: string): Promise<Response> {
    const cdeps = await deps.stores.get(centreStore).deps();
    const row = await cdeps.store.table('admissions').get({ bot_ref: ref });
    const presented = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
    if (!row || !row.webhook_secret_hash || !timingSafeEqual(await webhookSecretHash(presented), row.webhook_secret_hash)) return new Response('unauthorized', { status: 401 });
    const update = await readJson(req);
    const updateId = Number(update.update_id);
    if (!Number.isSafeInteger(updateId)) return new Response('ok', { status: 200 });
    try {
      await cdeps.store.table('tg_updates').insert({ workspace_id: row.workspace_id, update_id: updateId });
    } catch (cause) {
      if (cause instanceof StoreConflict) return new Response('ok', { status: 200 });
      throw cause;
    }
    // Telegram wants a quick 200; the reply is sent after it.
    keep(() => handleUpdate(cdeps, row, update));
    return new Response('ok', { status: 200 });
  }

  async function handleUpdate(cdeps: CentreDeps, row: AdmissionsRow, update: Record<string, unknown>) {
    const workspace = await deps.repository.workspace(row.workspace_id);
    const token = await botToken(cdeps, row.workspace_id);
    if (!workspace || workspace.status !== 'active' || !token) return;
    const callback = asRecord(update.callback_query), message = asRecord(update.message);
    const source = callback.id ? asRecord(callback.message) : message;
    const chat = asRecord(source.chat), from = asRecord(callback.id ? callback.from : message.from);
    if (callback.id) await cdeps.telegram.call(token, 'answerCallbackQuery', { callback_query_id: String(callback.id) });
    if (chat.type !== 'private' || chat.id === undefined) return;
    const chatId = String(chat.id), locale = LANG(from.language_code);
    const content = callback.id ? clean(callback.data, 64) : clean(message.text ?? message.caption, 2000);
    if (!content) {
      await sendText(cdeps, token, chatId, say({ en: 'Please write your question as text.', uz: 'Savolingizni matn bilan yozing, iltimos.', ru: 'Пожалуйста, напишите вопрос текстом.' }, locale));
      return;
    }
    const staff = /^\/(?:start\s+staff_|staff\s+)([A-Z0-9]{8})$/i.exec(content);
    if (staff) {
      const linked = await cdeps.store.claimStaffCode(row.workspace_id, await sha256Hex(`staff:${staff[1].toUpperCase()}`), chatId, now());
      await sendText(cdeps, token, chatId, say(linked ? T.staffLinked : T.staffFailed, locale, { centre: workspace.name }));
      if (linked) await deps.repository.audit({ workspaceId: workspace.id, actorId: linked, event: 'centre.staff_chat_linked', targetType: 'member', targetId: linked, details: {} });
      return;
    }
    if (!row.enabled) return;
    let thread = await openThread(cdeps, workspace.id, 'telegram', chatId, locale, now());
    if (!thread) { await sendText(cdeps, token, chatId, say(T.limit, locale, { centre: workspace.name })); return; }
    const username = clean(from.username, 40);
    if (username && thread.contact.telegram !== username) [thread] = await cdeps.store.table('threads').update({ id: thread.id }, { contact: { ...thread.contact, telegram: username } });
    const replies = await agentTurn({ ctx: system(workspace, thread.language, 'admissions-turn'), deps: cdeps, workspace, config: row, thread, text: content, channel: 'telegram', now: now() });
    for (const reply of replies) await sendText(cdeps, token, chatId, reply.text, keyboard(reply));
  }

  // --- Widgets ---------------------------------------------------------------------------------
  async function widget(req: Request, op: string, url: URL): Promise<Response> {
    const origin = req.headers.get('origin');
    const cdeps = await deps.stores.get(centreStore).deps();
    const found = await centreByKey(cdeps, url.searchParams.get('key'));
    const allowed = !!found && !!origin && found.settings.embed_domains.includes(origin.toLowerCase());
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin', ...(allowed ? { 'Access-Control-Allow-Origin': origin!, 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '600' } : {}) };
    const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers });
    if (!found) return json(404, { code: 'not_found', error: 'Unknown widget key.' });
    if (!allowed) return json(403, { code: 'origin_denied', error: 'This website is not allowed to show the centre’s widget.' });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const { settings, workspace } = found;
    const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const day = tashkentDay(now());
    if (!await cdeps.store.takePublic(workspace.id, `ip:${(await sha256Hex(`${ip}|${day}`)).slice(0, 24)}`, day, 400)) return json(429, { code: 'capped', error: 'Too many requests today.' });
    const body = req.method === 'POST' ? await readJson(req) : {};
    const locale = LANG(body.lang ?? url.searchParams.get('lang'));
    const ctx = system(workspace, locale, `embed-${op}`);
    const [c14, c8, c5] = await Promise.all([ctx.access('C14'), ctx.access('C8'), ctx.access('C5')]);
    if (!c14.allowed) return json(402, { code: 'plan_required', error: 'This centre’s plan does not include website widgets.' });
    const view = embedView(settings, cdeps.config.appUrl), admissions = await cdeps.store.table('admissions').get({ workspace_id: workspace.id });
    const chatOn = view.widgets.admissions_chat && c8.allowed && admissions?.enabled === true;
    const placementOn = view.widgets.placement && c5.allowed && !!view.widgets.placement_page_id;

    if (op === 'config') {
      const branding = brandingView(workspace.branding);
      let placement = null;
      if (placementOn) {
        try { const { test } = await loadTest(deps.repository, workspace.id, view.widgets.placement_page_id!, { approvedOnly: true }); placement = { title: test.title, minutes: test.minutes ?? null, questions: test.sections.reduce((n, sec) => n + (sec.items?.length ?? 0), 0) }; } catch { placement = null; }
      }
      return json(200, {
        centre: workspace.name, assistant_name: branding.assistant_name ?? workspace.name, logo_url: branding.logo_url, avatar_url: view.white_label.avatar_url,
        primary_color: branding.primary_color, accent_color: branding.accent_color, position: view.widgets.position,
        greeting: (view.widgets.greeting as Record<string, string>)[locale] ?? say(T.greeting, locale, { centre: workspace.name }),
        launcher_label: (view.white_label.launcher_label as Record<string, string>)[locale] ?? null,
        widgets: { admissions_chat: chatOn, placement: !!placement }, placement,
      });
    }
    const session = typeof body.session === 'string' && SESSION.test(body.session) ? body.session : null;
    if (!session) return json(400, { code: 'invalid_request', error: 'session is required.' });
    const external = (await sha256Hex(`widget:${session}`)).slice(0, 40);

    if (op === 'chat' || op === 'poll') {
      if (!chatOn) return json(409, { code: 'widget_off', error: 'The chat is not switched on.' });
      if (op === 'poll') {
        const thread = await cdeps.store.table('threads').get({ workspace_id: workspace.id, channel: 'widget', external_id: external });
        if (!thread) return json(200, { messages: [], status: 'new' });
        const after = Number(body.after ?? 0);
        const rows = await cdeps.store.table('admissions_messages').list({ thread_id: thread.id }, { order: 'id', gte: { id: Number.isFinite(after) ? after + 1 : 0 }, limit: 50 });
        return json(200, { status: thread.status, messages: rows.filter((entry) => entry.role === 'agent' || entry.role === 'staff').map((entry) => ({ id: entry.id, role: entry.role, text: entry.content })) });
      }
      const message = clean(body.message, 2000);
      if (!message) return json(400, { code: 'invalid_request', error: 'message is required.' });
      const thread = await openThread(cdeps, workspace.id, 'widget', external, locale, now());
      if (!thread) return json(200, { messages: [{ role: 'agent', text: say(T.limit, locale, { centre: workspace.name }) }], status: 'open' });
      const replies = await agentTurn({ ctx: system(workspace, thread.language, 'admissions-turn'), deps: cdeps, workspace, config: admissions!, thread, text: message, channel: 'widget', now: now() });
      const last = (await cdeps.store.table('admissions_messages').list({ thread_id: thread.id }, { order: 'id', desc: true, limit: 1 }))[0];
      const fresh = await cdeps.store.table('threads').get({ id: thread.id });
      return json(200, { messages: replies.map((reply) => ({ role: 'agent', text: reply.text, buttons: reply.buttons ?? [] })), status: fresh?.status ?? thread.status, last_id: last?.id ?? 0 });
    }

    // Placement widget: start, answer, submit.
    if (!placementOn) return json(409, { code: 'widget_off', error: 'The placement test is not switched on.' });
    const { page, test } = await loadTest(deps.repository, workspace.id, view.widgets.placement_page_id!, { approvedOnly: true });
    const step = typeof body.step === 'string' ? body.step : '';
    if (step === 'start') {
      if (!await cdeps.store.takePublic(workspace.id, 'placement_starts', day, LIMITS.newThreadsPerDay)) return json(429, { code: 'capped', error: 'Too many tests today.' });
      const name = clean(body.name, 120), phone = clean(body.phone, 30);
      const attempt = await cdeps.store.table('attempts').insert({ workspace_id: workspace.id, test_page_id: page.id, test_revision: page.revision, channel: 'widget', prospect: { name, phone: phone && /^\+?[0-9][0-9 ()-]{6,18}$/.test(phone) ? phone : null, session: external } });
      return json(200, { attempt_id: attempt.id, test: publicTest(test) });
    }
    const attempt = typeof body.attempt_id === 'string' ? await cdeps.store.table('attempts').get({ id: body.attempt_id, workspace_id: workspace.id }) : null;
    if (!attempt || attempt.prospect.session !== external) return json(404, { code: 'not_found', error: 'Attempt not found.' });
    if (step === 'answer') {
      if (attempt.status !== 'in_progress') return json(409, { code: 'attempt_closed', error: 'Already handed in.' });
      const answers = cleanAnswers(test, { ...attempt.answers, ...asRecord(body.answers) });
      await cdeps.store.table('attempts').update({ id: attempt.id, status: 'in_progress' }, { answers });
      return json(200, { saved: Object.keys(answers).length });
    }
    if (step === 'submit') {
      const submitted = attempt.status === 'in_progress' ? await submitAttempt(cdeps.store, attempt, test, now()) : attempt;
      let marked = false;
      if (test.sections.some((sec) => sec.kind !== 'objective' && typeof submitted.answers[sec.id] === 'string') && !submitted.ai_marks && await cdeps.store.takePublic(workspace.id, 'placement_marks', day, 100)) {
        try { await aiMark(ctx, cdeps.store, submitted, test); marked = true; } catch (cause) { if (!(cause instanceof SchoodAIError)) throw cause; }
      }
      const objective = asRecord(submitted.objective);
      return json(200, { level: submitted.level, percent: objective.percent ?? null, correct: objective.correct ?? null, total: objective.total ?? null, marked, note: say({ en: 'A teacher confirms your level.', uz: 'Darajangizni o‘qituvchi tasdiqlaydi.', ru: 'Уровень подтвердит преподаватель.' }, locale) });
    }
    return json(400, { code: 'invalid_request', error: 'step must be start, answer or submit.' });
  }

  // --- Scheduler -----------------------------------------------------------------------------------
  async function cron(req: Request): Promise<Response> {
    const presented = req.headers.get('x-schood-service-secret');
    if (!secret || !presented || !timingSafeEqual(presented, secret) || req.headers.get('origin')) return new Response(JSON.stringify({ code: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    const cdeps = await deps.stores.get(centreStore).deps();
    const at = now(), day = tashkentDay(at), month = monthOf(at), week = tashkentWeek(at);
    const previous = monthOf(new Date(Date.parse(`${month}-01T00:00:00+05:00`) - 86_400_000));
    const summary = { centres: 0, briefs: 0, delivered: 0, retention: 0, ledgers: 0, insights: 0, failed: 0 };
    for (const settings of await cdeps.store.table('settings').list({}, { limit: 5000 })) {
      const workspace = await deps.repository.workspace(settings.workspace_id);
      if (!workspace || workspace.kind !== 'centre' || workspace.status !== 'active') continue;
      summary.centres++;
      try {
        const ctx = system(workspace, workspace.houseStyle.instruction_language === 'ru' ? 'ru' : workspace.houseStyle.instruction_language === 'en' ? 'en' : 'uz', 'cron');
        const centre = await requireCentre(ctx);
        const existing = await cdeps.store.table('briefs').get({ workspace_id: workspace.id, week });
        const due = briefDue(centre, at, existing);
        if (due && (await ctx.access('C10')).allowed) {
          const brief = due === 'build' ? await buildBrief(ctx, centre, 'scheduled') : existing!;
          if (due === 'build') summary.briefs++;
          const sent = await deliverBrief(ctx, centre, brief);
          summary.delivered += (sent.deliveries as { status: string }[]).filter((entry) => entry.status === 'sent').length;
        }
        if (await cdeps.store.takePublic(workspace.id, 'cron_daily', day, 1)) {
          const removed = await runRetention(ctx, centre);
          summary.retention += removed.chats + removed.conversations;
          if (await computeWholesale(cdeps.store, workspace.id, month)) summary.ledgers++;
          await computeByokFees(cdeps.store, workspace.id, month);
          if ((await ctx.access('C6')).allowed) { await computeInsights(ctx, centre, month); summary.insights++; }
        }
        if (await cdeps.store.takePublic(workspace.id, `cron_month_${previous}`, day, 1)) {
          await computeWholesale(cdeps.store, workspace.id, previous);
          await computeByokFees(cdeps.store, workspace.id, previous);
          if ((await ctx.access('C6')).allowed) await computeInsights(ctx, centre, previous);
        }
      } catch (cause) {
        summary.failed++;
        console.error(JSON.stringify({ event: 'schood_ai_centre_cron_failed', workspace_id: workspace.id, error: String(cause).slice(0, 300) }));
      }
    }
    return new Response(JSON.stringify({ ok: true, ...summary }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url), match = PATH.exec(url.pathname);
    if (!match) return new Response(JSON.stringify({ code: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    try {
      if (match[2]) return req.method === 'POST' ? await telegram(req, match[2]) : new Response('method not allowed', { status: 405 });
      if (match[3]) return ['GET', 'POST', 'OPTIONS'].includes(req.method) ? await widget(req, match[3], url) : new Response('method not allowed', { status: 405 });
      return req.method === 'POST' ? await cron(req) : new Response('method not allowed', { status: 405 });
    } catch (cause) {
      if (cause instanceof SchoodAIError) return new Response(JSON.stringify({ code: cause.code, error: cause.message }), { status: cause.status, headers: { 'Content-Type': 'application/json' } });
      console.error(JSON.stringify({ event: 'schood_ai_centre_public_error', path: url.pathname.split('/').slice(-2).join('/'), error: String(cause).slice(0, 300) }));
      return new Response(JSON.stringify({ code: 'internal_error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  };
}

/** True for paths this handler serves, so index.ts can route them here. */
export const isCentrePublicPath = (pathname: string) => /\/schood-ai\/public\/centre\//.test(pathname);
