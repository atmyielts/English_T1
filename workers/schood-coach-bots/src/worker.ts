import { validateTelegramInitData } from '../../../supabase/functions/_shared/telegram-init-data.ts';
import {
  applyDiagnosticTap, diagnosticQuestion, diagnosticUnlinked, encodeAnswers, localeFrom, parseDiagnosticSave, parseDiagnosticTap, pick, plain, say,
  type CoachPack, type Delivery, type InEvent, type Locale, type OutMessage, type UpdateRequest, type UpdateResponse,
} from '../../../packages/coach-packs/src/mod.ts';
import { keyboard, sendAll, telegram, type Fetch, type Telegram } from './telegram.ts';

// The coach bots' Worker (Cloudflare, free plan). It is transport only:
//   POST /tg/<pack>         a Telegram webhook, checked with that bot's secret-token header;
//   POST /miniapp/session   a Mini App's initData, checked with that bot's token, exchanged
//                           for a Schood session through the function;
//   cron                    due reminders and weekly reports, sent within the shared budget.
// Linked people's updates are relayed to schood-ai/coach/update with the service secret;
// everyone else can take the placement test (answers ride in the button data), see
// examples and link their account. Bot tokens never leave this Worker.

export interface Env {
  APP_URL: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY?: string;
  SCHOOD_AI_SERVICE_SECRET: string;
  TELEGRAM_INTERNAL_SECRET: string;
  /** Per coach: COACH_BOT_TOKEN_<PACK>, COACH_WEBHOOK_SECRET_<PACK> (and _PREVIOUS while rotating). */
  [key: string]: string | undefined;
}
export interface WorkerDeps { env: Env; packs: ReadonlyMap<string, CoachPack>; fetch: Fetch; now?: () => Date }
interface Waiter { waitUntil(promise: Promise<unknown>): void }

const MAX_VOICE_BYTES = 8 * 1024 * 1024, MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const envKey = (pack: string) => pack.toUpperCase().replace(/-/g, '_');

function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a), right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}
const toBase64 = (bytes: Uint8Array) => { let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary); };

// deno-lint-ignore no-explicit-any
type Update = Record<string, any>;

export function createWorker(deps: WorkerDeps) {
  const { env, packs } = deps;
  const appUrl = (env.APP_URL || 'https://ai.schood.online').replace(/\/+$/, '');
  const fn = (path: string) => `${env.SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/${path}`;
  // Only the gate checks a JWT at Supabase's edge (the public anon key is enough); telegram-link
  // and schood-ai take the worker secrets, and telegram-link would read a bearer as a service key.
  const anon: Record<string, string> = env.SUPABASE_ANON_KEY ? { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` } : {};
  const tokenOf = (pack: string) => env[`COACH_BOT_TOKEN_${envKey(pack)}`];
  const active = (pack: string) => packs.has(pack) && !!tokenOf(pack);

  // Linked accounts by Telegram user, briefly cached per isolate.
  const links = new Map<string, { at: number; userId: string | null; name: string | null }>();
  async function linkedUser(chatId: string): Promise<{ userId: string | null; name: string | null }> {
    const hit = links.get(chatId), now = Date.now();
    if (hit && now - hit.at < 60_000) return hit;
    const response = await deps.fetch(`${fn('telegram-link')}?action=status&chat_id=${chatId}`, { method: 'POST', headers: { 'x-worker-secret': env.TELEGRAM_INTERNAL_SECRET, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status', chat_id: chatId }) });
    const payload = await response.json().catch(() => ({})) as { linked?: boolean; user?: { id?: string; name?: string } };
    if (!response.ok) throw new Error(`telegram-link status ${response.status}`);
    const entry = { at: now, userId: payload.linked && typeof payload.user?.id === 'string' ? payload.user.id : null, name: payload.user?.name ?? null };
    links.set(chatId, entry);
    if (links.size > 5000) links.clear();
    return entry;
  }

  async function relay<T>(action: string, userId: string, chatId: string, body: unknown): Promise<{ status: number; data: T | null }> {
    const response = await deps.fetch(fn(`schood-ai/coach/${action}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-schood-service-secret': env.SCHOOD_AI_SERVICE_SECRET, 'x-schood-user-id': userId, 'x-schood-telegram-chat-id': chatId },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json().catch(() => null) as T | null };
  }

  // --- messages for people who have not linked yet -----------------------------------------------------
  const linkUrl = (pack: string) => `${appUrl}/coach/${pack}/link`;
  function unlinkedWelcome(pack: CoachPack, locale: Locale): OutMessage {
    return {
      kind: 'text',
      html: `${say(locale, 'unlinked.help', { coach: pick(pack.manifest.name, locale) })}\n\n${say(locale, 'link.needed')}`,
      buttons: [
        pack.manifest.uiLanguages.map((code) => ({ text: { uz: 'O‘zbek', ru: 'Русский', en: 'English' }[code], data: `ul:l:${code}` })),
        [{ text: plain(locale, 'paywall.test'), data: `ul:test:${locale}` }],
        [{ text: plain(locale, 'paywall.samples'), app: `/coach/${pack.manifest.id}/samples` }],
        [{ text: plain(locale, 'link.button'), url: linkUrl(pack.manifest.id) }],
      ],
    };
  }

  async function handleUpdate(pack: CoachPack, update: Update, api: Telegram): Promise<void> {
    const message = update.message, callback = update.callback_query, pollAnswer = update.poll_answer;
    const from = message?.from ?? callback?.from ?? pollAnswer?.user;
    if (!from || typeof from.id !== 'number' || from.is_bot) return;
    if (message && message.chat?.type !== 'private') return;
    if (callback && callback.message?.chat?.type && callback.message.chat.type !== 'private') return;
    const chatId = String(from.id), locale = localeFrom(from.language_code);
    const reply = (messages: OutMessage[]) => sendAll(api, chatId, messages, appUrl);
    const ack = (text?: string) => callback ? api.call('answerCallbackQuery', { callback_query_id: callback.id, ...(text ? { text: text.slice(0, 190) } : {}) }) : Promise.resolve(null);

    // Link tokens from the web (`/start <token>`) go to telegram-link, which links this Telegram account.
    const text: string = typeof message?.text === 'string' ? message.text : '';
    const command = /^\/([a-z_]{1,32})(?:@\w+)?(?:\s+(.+))?$/i.exec(text.trim());
    if (command && command[1].toLowerCase() === 'start' && command[2] && /^[A-Za-z0-9_-]{32,64}$/.test(command[2].trim())) {
      const response = await deps.fetch(fn('telegram-link'), { method: 'POST', headers: { 'x-worker-secret': env.TELEGRAM_INTERNAL_SECRET, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'validate', token: command[2].trim(), chat_id: chatId }) });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; name?: string; confirmation_required?: boolean; error?: string };
      links.delete(chatId);
      if (!result.ok) { await reply([{ kind: 'text', html: say(locale, 'link.failed', { reason: result.error ?? 'invalid' }) }]); return; }
      if (result.confirmation_required) { await reply([{ kind: 'text', html: say(locale, 'link.confirm') }]); return; }
      await reply([{ kind: 'text', html: say(locale, 'link.done', { name: result.name ?? '' }) }]);
      const linked = await linkedUser(chatId);
      if (linked.userId) await relayEvent(pack, update, linked.userId, chatId, locale, from.first_name, { type: 'command', command: 'start', args: '', messageId: Number(message.message_id), date: Number(message.date) }, api, null);
      return;
    }

    // The placement test runs here for everyone: the answers ride in the button data.
    const data: string = typeof callback?.data === 'string' ? callback.data : '';
    const tap = data.startsWith('dg:') ? parseDiagnosticTap(data) : null;
    if (tap) {
      await ack();
      const answers = applyDiagnosticTap(pack, tap);
      if (!answers) return;
      const next = diagnosticQuestion(pack, tap.locale, answers);
      if (next && next.kind === 'text') {
        await api.call('editMessageText', { chat_id: chatId, message_id: callback.message?.message_id, text: next.html, parse_mode: 'HTML', reply_markup: keyboard(next.buttons, appUrl) });
        return;
      }
      await api.call('editMessageReplyMarkup', { chat_id: chatId, message_id: callback.message?.message_id, reply_markup: { inline_keyboard: [] } });
      const linked = await linkedUser(chatId);
      if (linked.userId) await relayEvent(pack, update, linked.userId, chatId, tap.locale, from.first_name, { type: 'diagnostic', answers: encodeAnswers(answers), locale: tap.locale }, api, null);
      else await reply(diagnosticUnlinked(pack, tap.locale, answers, linkUrl(pack.manifest.id)));
      return;
    }

    const linked = await linkedUser(chatId);
    if (!linked.userId) {
      await ack();
      const save = data.startsWith('dgs:') ? parseDiagnosticSave(data) : null;
      if (data.startsWith('ul:l:')) { await reply([unlinkedWelcome(pack, (['uz', 'ru', 'en'].includes(data.slice(5)) ? data.slice(5) : locale) as Locale)]); return; }
      if (data.startsWith('ul:test')) {
        const chosen = (['uz', 'ru', 'en'].includes(data.slice(8)) ? data.slice(8) : locale) as Locale;
        const first = diagnosticQuestion(pack, chosen, []);
        await reply([{ kind: 'text', html: pick(pack.diagnostic.intro, chosen) }, ...(first ? [first] : [])]);
        return;
      }
      if (save) { await reply([{ kind: 'text', html: say(save.locale, 'diag.link'), buttons: [[{ text: plain(save.locale, 'link.button'), url: linkUrl(pack.manifest.id) }]] }]); return; }
      if (message || callback) await reply([unlinkedWelcome(pack, locale)]);
      return;
    }

    // A linked person: everything goes to the coach engine.
    let event: InEvent | null = null;
    if (callback) {
      const save = data.startsWith('dgs:') ? parseDiagnosticSave(data) : null;
      event = save ? { type: 'diagnostic', answers: encodeAnswers(save.answers), locale: save.locale } : { type: 'callback', data: data.slice(0, 64) || 'x', messageId: Number(callback.message?.message_id ?? 0), date: Number(callback.message?.date ?? 0) };
    } else if (pollAnswer) {
      event = { type: 'poll_answer', pollId: String(pollAnswer.poll_id), options: Array.isArray(pollAnswer.option_ids) ? pollAnswer.option_ids : [] };
    } else if (message?.voice || message?.audio || message?.video_note) {
      const media = message.voice ?? message.audio ?? message.video_note;
      await api.call('sendChatAction', { chat_id: chatId, action: 'typing' });
      const bytes = await api.file(String(media.file_id), MAX_VOICE_BYTES);
      if (!bytes) { await reply([{ kind: 'text', html: say(locale, 'error.voice_too_long', { max: 5 }) }]); return; }
      event = { type: 'voice', audio: toBase64(bytes), mime: String(media.mime_type || 'audio/ogg'), duration: Number(media.duration ?? 0), fileId: String(media.file_id), fileUniqueId: String(media.file_unique_id ?? media.file_id), messageId: Number(message.message_id), date: Number(message.date) };
    } else if (message?.photo || (message?.document && /^image\//.test(String(message.document.mime_type ?? '')))) {
      const sizes = Array.isArray(message.photo) ? [...message.photo].sort((a: Update, b: Update) => (b.file_size ?? 0) - (a.file_size ?? 0)) : [message.document];
      const chosen = sizes.find((size: Update) => (size.file_size ?? 0) <= MAX_PHOTO_BYTES) ?? sizes.at(-1);
      await api.call('sendChatAction', { chat_id: chatId, action: 'typing' });
      const bytes = chosen ? await api.file(String(chosen.file_id), MAX_PHOTO_BYTES) : null;
      if (!bytes) { await reply([{ kind: 'text', html: say(locale, 'error.photo_unreadable') }]); return; }
      const mime = message.document?.mime_type && /^image\/(jpeg|png|webp)$/.test(message.document.mime_type) ? message.document.mime_type : 'image/jpeg';
      event = { type: 'photo', image: toBase64(bytes), mime, caption: typeof message.caption === 'string' ? message.caption : '', messageId: Number(message.message_id), date: Number(message.date) };
    } else if (command) {
      event = { type: 'command', command: command[1].toLowerCase(), args: (command[2] ?? '').trim().slice(0, 64), messageId: Number(message.message_id), date: Number(message.date) };
    } else if (text.trim()) {
      await api.call('sendChatAction', { chat_id: chatId, action: 'typing' });
      event = { type: 'text', text: text.slice(0, 12000), messageId: Number(message.message_id), date: Number(message.date) };
    }
    if (!event) { await ack(); return; }
    await relayEvent(pack, update, linked.userId, chatId, locale, from.first_name, event, api, callback ?? null);
  }

  async function relayEvent(pack: CoachPack, update: Update, userId: string, chatId: string, locale: Locale, firstName: string | undefined, event: InEvent, api: Telegram, callback: Update | null) {
    const body: UpdateRequest & { first_name: string | null; update_id: number } = { pack: pack.manifest.id, updateId: Number(update.update_id), update_id: Number(update.update_id), locale, firstName: firstName ?? null, first_name: typeof firstName === 'string' ? firstName.slice(0, 64) : null, event };
    const result = await relay<UpdateResponse & { code?: string }>('update', userId, chatId, body);
    if (callback) await api.call('answerCallbackQuery', { callback_query_id: callback.id, ...(result.data?.toast ? { text: result.data.toast.slice(0, 190) } : {}) });
    if (result.status === 403 && result.data?.code === 'user_not_linked') { links.delete(chatId); await sendAll(api, chatId, [unlinkedWelcome(pack, locale)], appUrl); return; }
    if (result.status !== 200 || !result.data) { await sendAll(api, chatId, [{ kind: 'text', html: say(locale, 'error.generic') }], appUrl); return; }
    if (result.data.clearButtons && callback?.message?.message_id) await api.call('editMessageReplyMarkup', { chat_id: chatId, message_id: callback.message.message_id, reply_markup: { inline_keyboard: [] } });
    const report = await sendAll(api, chatId, result.data.messages ?? [], appUrl);
    for (const voice of report.voices) await relay('media-cached', userId, chatId, { pack: pack.manifest.id, cache_key: voice.cacheKey, file_id: voice.fileId });
    for (const poll of report.polls) await relay('poll-sent', userId, chatId, { pack: pack.manifest.id, ref: poll.ref, poll_id: poll.pollId });
  }

  // --- the Mini App sign-in ------------------------------------------------------------------------------------
  async function miniappSession(request: Request): Promise<Response> {
    const origin = request.headers.get('origin');
    const allowed = origin && (origin === appUrl || /^http:\/\/localhost:\d+$/.test(origin) && env.ALLOW_LOCAL_ORIGINS === '1') ? origin : null;
    const cors: Record<string, string> = allowed ? { 'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' } : { Vary: 'Origin' };
    const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });
    if (request.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: cors });
    if (!allowed) return reply(403, { code: 'origin_denied' });
    if (request.method !== 'POST') return reply(405, { code: 'method_not_allowed' });
    const body = await request.json().catch(() => ({})) as { pack?: string; init_data?: string };
    const pack = typeof body.pack === 'string' ? packs.get(body.pack) : undefined;
    const initData = typeof body.init_data === 'string' ? body.init_data.slice(0, 12000) : '';
    if (!pack || !active(pack.manifest.id) || !initData) return reply(400, { code: 'invalid_request' });
    let identity;
    try {
      // Checked with this coach bot's own token: data from another bot never passes.
      identity = await validateTelegramInitData(initData, tokenOf(pack.manifest.id)!, { maxAgeSeconds: 86_400, nowSeconds: Math.floor((deps.now?.() ?? new Date()).getTime() / 1000) });
    } catch {
      return reply(401, { code: 'telegram_invalid' });
    }
    const linked = await linkedUser(identity.telegram_user_id);
    if (!linked.userId) return reply(200, { linked: false, link_url: linkUrl(pack.manifest.id) });
    const result = await relay<{ session?: unknown; code?: string }>('miniapp-session', linked.userId, identity.telegram_user_id, { pack: pack.manifest.id, init_data: initData });
    if (result.status !== 200 || !result.data?.session) return reply(result.status === 200 ? 502 : result.status, { code: result.data?.code ?? 'session_unavailable' });
    return reply(200, { linked: true, session: result.data.session });
  }

  // --- the cron ------------------------------------------------------------------------------------------------
  async function cron(): Promise<{ sent: number; failed: number; blocked: number }> {
    const headers = { 'Content-Type': 'application/json', 'x-schood-service-secret': env.SCHOOD_AI_SERVICE_SECRET, ...anon };
    const due = await deps.fetch(fn('schood-coach-gate/due'), { method: 'POST', headers, body: JSON.stringify({ limit: 40 }) });
    const payload = await due.json().catch(() => ({})) as { deliveries?: Delivery[] };
    if (!due.ok || !Array.isArray(payload.deliveries)) { console.error(JSON.stringify({ event: 'coach_cron_due_failed', status: due.status })); return { sent: 0, failed: 0, blocked: 0 }; }
    const results: { id: string; status: 'sent' | 'failed' | 'blocked'; reason?: string }[] = [];
    for (const delivery of payload.deliveries) {
      const token = tokenOf(delivery.pack);
      if (!token || !/^\d{1,20}$/.test(delivery.chatId)) { results.push({ id: delivery.id, status: 'failed', reason: 'no_bot' }); continue; }
      const report = await sendAll(telegram(token, deps.fetch), delivery.chatId, delivery.messages, appUrl);
      results.push({ id: delivery.id, status: report.blocked ? 'blocked' : report.failed ? 'failed' : 'sent', ...(report.blocked ? { reason: 'bot_blocked' } : {}) });
    }
    if (results.length) await deps.fetch(fn('schood-coach-gate/delivered'), { method: 'POST', headers, body: JSON.stringify({ results }) });
    return { sent: results.filter((r) => r.status === 'sent').length, failed: results.filter((r) => r.status === 'failed').length, blocked: results.filter((r) => r.status === 'blocked').length };
  }

  return {
    cron,
    async fetch(request: Request, ctx?: Waiter): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === '/miniapp/session') return miniappSession(request);
      if (url.pathname === '/health') return new Response(JSON.stringify({ ok: true, coaches: [...packs.keys()].filter(active) }), { headers: { 'Content-Type': 'application/json' } });
      const match = /^\/tg\/([a-z][a-z0-9-]{1,15})\/?$/.exec(url.pathname);
      if (!match) return new Response('Not found', { status: 404 });
      const pack = packs.get(match[1]);
      if (!pack || !active(pack.manifest.id) || request.method !== 'POST') return new Response('Not found', { status: 404 });
      const key = envKey(pack.manifest.id);
      const supplied = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
      const secrets = [env[`COACH_WEBHOOK_SECRET_${key}`], env[`COACH_WEBHOOK_SECRET_${key}_PREVIOUS`]].filter((value): value is string => !!value && value.length >= 16);
      if (!secrets.some((secret) => safeEqual(supplied, secret))) return new Response('Unauthorized', { status: 401 });
      const update = await request.json().catch(() => null) as Update | null;
      if (!update || typeof update.update_id !== 'number') return new Response('ok');
      const work = handleUpdate(pack, update, telegram(tokenOf(pack.manifest.id)!, deps.fetch)).catch((cause) => console.error(JSON.stringify({ event: 'coach_update_failed', pack: pack.manifest.id, error: String(cause).slice(0, 300) })));
      // The engine answers within the request (Telegram waits); a slow model call keeps the webhook open, and a retry is dropped as a duplicate.
      if (ctx) { ctx.waitUntil(work); await Promise.race([work, new Promise((resolve) => setTimeout(resolve, 25_000))]); } else await work;
      return new Response('ok');
    },
  };
}
