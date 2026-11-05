import { LEVEL_LABEL, publicTest, scoreObjective, type PlacementTest } from '../../../../packages/ai-core/src/centre/placement.ts';
import { s, tashkentDay } from '../../../../packages/ai-core/src/mod.ts';
import { bool, integer, oneOf, optionalText, record, stringList, text, uuid } from '../input.ts';
import { wrapUserMessage } from '../prompt.ts';
import { SchoodAIError, type Locale, type RequestContext, type Workspace } from '../types.ts';
import type { CentreDeps } from './binding.ts';
import { alertStaff, BOT_LABEL, botToken, sendText, webhookSecretHash } from './bot.ts';
import { humanCode, randomToken, secretContext, sha256Hex } from './crypto.ts';
import { unknownNumbers } from './draft.ts';
import { trialProposal } from './messages.ts';
import { loadTest } from './placement.ts';
import { proposeAsCentre } from './runner.ts';
import { asRecord, centrePrompt, clean, formatWhen, pick, requireCentre } from './shared.ts';
import type { AdmissionsRow, ThreadRow } from './store.ts';

// C8 AI Admissions Agent: answers prospective students 24/7 in the centre's own
// Telegram bot and in the website widget, only from the centre's FAQ and price
// list; runs the centre's placement test in chat; books trial lessons within the
// owner's rules (confirmed at once in `auto` mode, or after a person approves) and
// puts them into Academy leads and trials through Approve & run; hands over to a
// person on request. Every AI turn is charged to the centre's pooled credits.

const LANGS = ['uz', 'ru', 'en'] as const;
export const LIMITS = { turnsPerThreadDay: 40, newThreadsPerDay: 300, turnsPerCentreDay: 2000 };
// Word starts (JavaScript's \b does not see Cyrillic letters), so endings like "менеджером" match too.
const HANDOVER = /(?<![\p{L}\p{N}])(operator|admin|manager|menejer|odam bilan|inson bilan|xodim|человек|оператор|менеджер|администратор|live person|real person|human)/iu;

export const T = {
  greeting: { en: 'Hello! I am the assistant of {centre}. Ask me about courses, prices and schedules, take a short placement test, or book a trial lesson.', uz: 'Assalomu alaykum! Men {centre} yordamchisiman. Kurslar, narxlar va jadval haqida so‘rang, qisqa daraja testini topshiring yoki sinov darsiga yoziling.', ru: 'Здравствуйте! Я помощник {centre}. Спросите о курсах, ценах и расписании, пройдите короткий тест уровня или запишитесь на пробный урок.' },
  menuPrices: { en: 'Prices', uz: 'Narxlar', ru: 'Цены' },
  menuTest: { en: 'Placement test', uz: 'Daraja testi', ru: 'Тест уровня' },
  menuBook: { en: 'Book a trial lesson', uz: 'Sinov darsiga yozilish', ru: 'Записаться на пробный урок' },
  menuHuman: { en: 'Talk to a person', uz: 'Xodim bilan gaplashish', ru: 'Связаться с сотрудником' },
  noPrices: { en: 'Our team will tell you the current prices. A person will reply soon.', uz: 'Joriy narxlarni xodimlarimiz aytib beradi. Tez orada javob berishadi.', ru: 'Актуальные цены подскажет наш сотрудник. Скоро вам ответят.' },
  handover: { en: 'Thank you. A person from {centre} will reply to you here soon.', uz: 'Rahmat. {centre} xodimi tez orada shu yerda javob beradi.', ru: 'Спасибо. Сотрудник {centre} скоро ответит вам здесь.' },
  fallback: { en: 'Thank you for your message. A person from {centre} will reply soon.', uz: 'Xabaringiz uchun rahmat. {centre} xodimi tez orada javob beradi.', ru: 'Спасибо за сообщение. Сотрудник {centre} скоро ответит.' },
  limit: { en: 'We have received a lot of messages today. A person from {centre} will reply soon.', uz: 'Bugun xabarlar ko‘p. {centre} xodimi tez orada javob beradi.', ru: 'Сегодня много сообщений. Сотрудник {centre} скоро ответит.' },
  noTest: { en: 'The placement test is not available right now. A teacher can check your level at a trial lesson.', uz: 'Daraja testi hozircha mavjud emas. O‘qituvchi darajangizni sinov darsida aniqlaydi.', ru: 'Тест уровня сейчас недоступен. Преподаватель определит уровень на пробном уроке.' },
  testStart: { en: 'Placement test: {count} questions. Answer each one; you can type /stop to finish early.', uz: 'Daraja testi: {count} ta savol. Har biriga javob bering; erta tugatish uchun /stop yozing.', ru: 'Тест уровня: {count} вопросов. Ответьте на каждый; чтобы закончить раньше, напишите /stop.' },
  testResult: { en: 'Done! Your estimated level is {level} ({correct} of {total} correct). A teacher confirms the level at your trial lesson. Would you like to book one?', uz: 'Tayyor! Taxminiy darajangiz: {level} ({total} tadan {correct} tasi to‘g‘ri). Daraja sinov darsida o‘qituvchi tomonidan tasdiqlanadi. Sinov darsiga yozilasizmi?', ru: 'Готово! Ваш примерный уровень: {level} (верно {correct} из {total}). Преподаватель подтвердит уровень на пробном уроке. Записать вас?' },
  booked: { en: 'Your trial lesson is booked for {time}. We look forward to seeing you!', uz: 'Sinov darsingiz {time} ga belgilandi. Sizni kutamiz!', ru: 'Пробный урок назначен на {time}. Ждём вас!' },
  requested: { en: 'Thank you! We have your request for {time}. A person will confirm it soon.', uz: 'Rahmat! {time} uchun so‘rovingiz qabul qilindi. Xodim tez orada tasdiqlaydi.', ru: 'Спасибо! Заявка на {time} принята. Сотрудник скоро подтвердит.' },
  staffLinked: { en: 'This chat now gets {centre} alerts and the Monday brief.', uz: 'Bu chat endi {centre} ogohlantirishlari va dushanba hisobotini oladi.', ru: 'Этот чат теперь получает уведомления {centre} и понедельничный отчёт.' },
  staffFailed: { en: 'This code is not valid or has expired.', uz: 'Bu kod noto‘g‘ri yoki muddati o‘tgan.', ru: 'Код недействителен или устарел.' },
  alertHandover: { en: '{centre}: a prospect asks for a person ({channel}). Open Schood AI → Admissions to reply.', uz: '{centre}: mijoz xodim bilan gaplashmoqchi ({channel}). Javob berish uchun Schood AI → Qabul bo‘limini oching.', ru: '{centre}: клиент просит сотрудника ({channel}). Откройте Schood AI → Приём, чтобы ответить.' },
  alertBooking: { en: '{centre}: new trial lesson {state} for {name}, {time}. Approve it in Schood AI to add it to Academy.', uz: '{centre}: {name} uchun yangi sinov darsi {state}, {time}. Academyga qo‘shish uchun Schood AI’da tasdiqlang.', ru: '{centre}: новый пробный урок {state} для {name}, {time}. Подтвердите в Schood AI, чтобы добавить в Academy.' },
};
export const say = (text: Record<Locale, string>, locale: Locale, params: Record<string, string | number> = {}) =>
  pick(locale, text).replace(/\{(\w+)\}/g, (_m, key: string) => String(params[key] ?? ''));

// --- Config ------------------------------------------------------------------------------------

const faqSchema = (value: unknown) => {
  if (!Array.isArray(value) || value.length > 60) throw new SchoodAIError('invalid_request', 'faq must be a list of at most 60 questions.', 400, { field: 'faq' });
  return value.map((entry, index) => { const row = record(entry, `faq[${index}]`); return { q: text(row.q, `faq[${index}].q`, { max: 200 }), a: text(row.a, `faq[${index}].a`, { max: 1500 }) }; });
};
const priceSchema = (value: unknown) => {
  if (!Array.isArray(value) || value.length > 40) throw new SchoodAIError('invalid_request', 'prices must be a list of at most 40 entries.', 400, { field: 'prices' });
  return value.map((entry, index) => {
    const row = record(entry, `prices[${index}]`);
    return {
      course: text(row.course, `prices[${index}].course`, { max: 120 }), price: integer(row.price, `prices[${index}].price`, 0, 1_000_000_000),
      currency: oneOf(row.currency ?? 'UZS', `prices[${index}].currency`, ['UZS', 'USD'] as const), period: oneOf(row.period ?? 'month', `prices[${index}].period`, ['month', 'course', 'lesson', 'other'] as const),
      note: optionalText(row.note, `prices[${index}].note`, { max: 200 }),
    };
  });
};
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
function bookingSchema(value: unknown) {
  const row = record(value, 'booking');
  const slots = Array.isArray(row.slots) ? row.slots : [];
  if (slots.length > 40) throw new SchoodAIError('invalid_request', 'At most 40 weekly slots.', 400, { field: 'booking.slots' });
  return {
    mode: oneOf(row.mode ?? 'approve', 'booking.mode', ['approve', 'auto'] as const),
    duration_minutes: row.duration_minutes === undefined ? 60 : integer(row.duration_minutes, 'booking.duration_minutes', 20, 240),
    min_notice_hours: row.min_notice_hours === undefined ? 12 : integer(row.min_notice_hours, 'booking.min_notice_hours', 0, 168),
    max_days_ahead: row.max_days_ahead === undefined ? 14 : integer(row.max_days_ahead, 'booking.max_days_ahead', 1, 60),
    require_phone: row.require_phone === undefined ? true : bool(row.require_phone, 'booking.require_phone'),
    slots: slots.map((entry, index) => {
      const slot = record(entry, `booking.slots[${index}]`);
      const start = text(slot.start, `booking.slots[${index}].start`, { max: 5 });
      if (!TIME.test(start)) throw new SchoodAIError('invalid_request', 'Slot times are HH:MM.', 400, { field: `booking.slots[${index}].start` });
      return { weekday: integer(slot.weekday, `booking.slots[${index}].weekday`, 1, 7), start, capacity: slot.capacity === undefined ? 3 : integer(slot.capacity, `booking.slots[${index}].capacity`, 1, 50) };
    }),
  };
}
const localeTexts = (value: unknown, field: string, max: number) => {
  const row = record(value, field);
  return Object.fromEntries(LANGS.filter((lang) => row[lang] !== undefined && row[lang] !== null && row[lang] !== '').map((lang) => [lang, text(row[lang], `${field}.${lang}`, { max })]));
};

async function config(deps: CentreDeps, workspaceId: string): Promise<AdmissionsRow> {
  return await deps.store.table('admissions').get({ workspace_id: workspaceId }) ?? await deps.store.table('admissions').insert({ workspace_id: workspaceId });
}
const configJson = async (deps: CentreDeps, row: AdmissionsRow) => {
  const secret = await deps.store.table('secrets').get({ workspace_id: row.workspace_id, purpose: 'telegram_bot', label: BOT_LABEL, revoked_at: null });
  const members = new Map((await deps.store.members(row.workspace_id)).map((m) => [m.userId, m.name]));
  const staff = await deps.store.table('staff_chats').list({ workspace_id: row.workspace_id });
  return {
    enabled: row.enabled, bot: { connected: !!secret && !!row.bot_ref, username: row.bot_username, hint: secret?.hint ?? null },
    faq: row.faq, prices: row.prices, booking: row.booking, handover: row.handover, greeting: row.greeting, placement_page_id: row.placement_page_id,
    ready: { secrets: !!deps.secrets, webhook_url: !!deps.config.publicUrl },
    staff_chats: staff.map((chat) => ({ user_id: chat.user_id, name: members.get(chat.user_id) ?? null, linked_at: chat.linked_at })),
  };
};

export const admissions = {
  async GET(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    return { admissions: await configJson(centre.deps, await config(centre.deps, centre.access.workspace.id)) };
  },
  /** { enabled?, faq?, prices?, booking?, handover?, greeting?, placement_page_id? } */
  async PATCH(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const body = record(await ctx.body());
    const ws = centre.access.workspace;
    const patch: Partial<AdmissionsRow> = { updated_by: ctx.user.id };
    if (body.enabled !== undefined) { patch.enabled = bool(body.enabled, 'enabled'); if (patch.enabled) await ctx.requireFeature('C8'); }
    if (body.faq !== undefined) patch.faq = faqSchema(body.faq);
    if (body.prices !== undefined) patch.prices = priceSchema(body.prices);
    if (body.booking !== undefined) patch.booking = bookingSchema(body.booking);
    if (body.greeting !== undefined) patch.greeting = localeTexts(body.greeting, 'greeting', 600);
    if (body.handover !== undefined) {
      const row = record(body.handover, 'handover');
      patch.handover = { message: row.message === undefined ? {} : localeTexts(row.message, 'handover.message', 400), notify_user_ids: row.notify_user_ids === undefined ? [] : stringList(row.notify_user_ids, 'handover.notify_user_ids', { max: 20, pattern: /^[0-9a-f-]{36}$/ }) };
    }
    if (body.placement_page_id !== undefined) {
      patch.placement_page_id = body.placement_page_id === null ? null : (await loadTest(ctx.repo, ws.id, uuid(body.placement_page_id, 'placement_page_id'), { approvedOnly: true })).page.id;
    }
    await config(centre.deps, ws.id);
    const [row] = await centre.deps.store.table('admissions').update({ workspace_id: ws.id }, patch);
    await ctx.audit('centre.admissions_updated', { fields: Object.keys(patch).filter((key) => key !== 'updated_by'), ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}) }, { type: 'workspace', id: ws.id });
    return { admissions: await configJson(centre.deps, row) };
  },
};

/**
 * POST centre/admissions-bot { token }: connects the centre's own Telegram bot. The
 * token is checked with getMe, the webhook is set with a fresh secret token, and
 * the token is stored sealed. DELETE disconnects it and revokes the stored token.
 */
export const admissionsBot = {
  async POST(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    await ctx.requireFeature('C8');
    const { deps } = centre, ws = centre.access.workspace;
    if (!deps.secrets) throw new SchoodAIError('secrets_unconfigured', 'Storing bot tokens is not set up yet. Ask Schood support.', 503);
    if (!deps.config.publicUrl) throw new SchoodAIError('webhook_unconfigured', 'The bot webhook address is not set up yet. Ask Schood support.', 503);
    const token = text(record(await ctx.body()).token, 'token', { max: 120 });
    if (!/^\d{5,16}:[A-Za-z0-9_-]{30,80}$/.test(token)) throw new SchoodAIError('invalid_request', 'This does not look like a bot token from BotFather.', 400, { field: 'token' });
    const me = await deps.telegram.call(token, 'getMe', {});
    if (!me.ok || me.result?.is_bot !== true) throw new SchoodAIError('bot_token_invalid', 'Telegram did not accept this token.', 400);
    const current = await config(deps, ws.id);
    const ref = current.bot_ref ?? randomToken(18), secret = randomToken(32);
    const hook = await deps.telegram.call(token, 'setWebhook', { url: `${deps.config.publicUrl}/centre/bot-webhook?bot=${ref}`, secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
    if (!hook.ok) throw new SchoodAIError('bot_webhook_failed', 'Telegram did not accept the webhook.', 502);
    await deps.telegram.call(token, 'setMyCommands', { commands: [{ command: 'start', description: 'Start' }, { command: 'test', description: 'Placement test' }, { command: 'human', description: 'Talk to a person' }] });
    await deps.store.table('secrets').update({ workspace_id: ws.id, purpose: 'telegram_bot', label: BOT_LABEL, revoked_at: null }, { revoked_at: ctx.now().toISOString() });
    await deps.store.table('secrets').insert({
      workspace_id: ws.id, purpose: 'telegram_bot', label: BOT_LABEL, sealed: await deps.secrets.seal(token, secretContext(ws.id, 'telegram_bot', BOT_LABEL)),
      hint: token.slice(-4), fingerprint: await sha256Hex(token), created_by: ctx.user.id, config: { bot_id: Number(me.result.id) || null },
    });
    const [row] = await deps.store.table('admissions').update({ workspace_id: ws.id }, {
      bot_ref: ref, bot_username: typeof me.result.username === 'string' ? me.result.username : null, bot_id: Number(me.result.id) || null, webhook_secret_hash: await webhookSecretHash(secret), updated_by: ctx.user.id,
    });
    await ctx.audit('centre.bot_connected', { username: row.bot_username }, { type: 'workspace', id: ws.id });
    return { admissions: await configJson(deps, row) };
  },
  async DELETE(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const { deps } = centre, ws = centre.access.workspace;
    const token = await botToken(deps, ws.id);
    if (token) await deps.telegram.call(token, 'deleteWebhook', { drop_pending_updates: true });
    await deps.store.table('secrets').update({ workspace_id: ws.id, purpose: 'telegram_bot', label: BOT_LABEL, revoked_at: null }, { revoked_at: ctx.now().toISOString() });
    const [row] = await deps.store.table('admissions').update({ workspace_id: ws.id }, { bot_ref: null, bot_username: null, bot_id: null, webhook_secret_hash: null, updated_by: ctx.user.id });
    await deps.store.table('staff_chats').remove({ workspace_id: ws.id });
    await ctx.audit('centre.bot_disconnected', {}, { type: 'workspace', id: ws.id });
    return { admissions: await configJson(deps, row ?? await config(deps, ws.id)) };
  },
};

/** POST centre/admissions-staff-code: a one-time code that links the caller's Telegram to the centre's bot (staff only). */
export async function staffCode(ctx: RequestContext) {
  const centre = await requireCentre(ctx, ['owner', 'admin', 'teacher']);
  const row = await config(centre.deps, centre.access.workspace.id);
  if (!row.bot_username) throw new SchoodAIError('bot_not_connected', 'Connect the centre’s Telegram bot first.', 409);
  const code = humanCode(8);
  await centre.deps.store.table('staff_codes').insert({ code_hash: await sha256Hex(`staff:${code}`), workspace_id: centre.access.workspace.id, user_id: ctx.user.id, expires_at: new Date(ctx.now().getTime() + 30 * 60_000).toISOString() });
  return { code, link: `https://t.me/${row.bot_username}?start=staff_${code}`, expires_in_minutes: 30 };
}

// --- Conversations ---------------------------------------------------------------------------------

const threadJson = (row: ThreadRow) => ({ id: row.id, channel: row.channel, contact: row.contact, language: row.language, status: row.status, academy_lead_id: row.academy_lead_id, last_message_at: row.last_message_at, created_at: row.created_at });

export const threads = {
  async GET(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const id = ctx.query.get('id');
    if (id) {
      const thread = await centre.deps.store.table('threads').get({ id: uuid(id, 'id'), workspace_id: centre.access.workspace.id });
      if (!thread) throw new SchoodAIError('not_found', 'Conversation not found.', 404);
      const messages = await centre.deps.store.table('admissions_messages').list({ thread_id: thread.id }, { order: 'id', limit: 500 });
      const bookings = await centre.deps.store.table('bookings').list({ thread_id: thread.id });
      return { thread: threadJson(thread), messages: messages.map((row) => ({ id: row.id, role: row.role, content: row.content, flags: row.flags, created_at: row.created_at })), bookings };
    }
    const status = ctx.query.get('status');
    const rows = await centre.deps.store.table('threads').list({ workspace_id: centre.access.workspace.id, ...(status && ['open', 'handed_over', 'booked', 'closed'].includes(status) ? { status: status as ThreadRow['status'] } : {}) }, { order: 'last_message_at', desc: true, limit: 200 });
    return { threads: rows.map(threadJson) };
  },
  /** { id, status: open | closed }: hand back to the agent, or close. */
  async PATCH(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const body = record(await ctx.body());
    const [row] = await centre.deps.store.table('threads').update({ id: uuid(body.id, 'id'), workspace_id: centre.access.workspace.id }, { status: oneOf(body.status, 'status', ['open', 'closed'] as const) });
    if (!row) throw new SchoodAIError('not_found', 'Conversation not found.', 404);
    return { thread: threadJson(row) };
  },
};

/** POST centre/admissions-reply { thread_id, text }: a person replies in the conversation (their own words, sent as they wrote them). */
export async function staffReply(ctx: RequestContext) {
  const centre = await requireCentre(ctx, ['owner', 'admin']);
  const body = record(await ctx.body());
  const thread = await centre.deps.store.table('threads').get({ id: uuid(body.thread_id, 'thread_id'), workspace_id: centre.access.workspace.id });
  if (!thread) throw new SchoodAIError('not_found', 'Conversation not found.', 404);
  const message = text(body.text, 'text', { max: 4000 });
  if (thread.channel === 'telegram') {
    const token = await botToken(centre.deps, thread.workspace_id);
    if (!token || await sendText(centre.deps, token, thread.external_id, message) === null) throw new SchoodAIError('telegram_failed', 'Telegram did not accept the message.', 502);
  }
  await centre.deps.store.table('admissions_messages').insert({ thread_id: thread.id, workspace_id: thread.workspace_id, role: 'staff', content: message, author_id: ctx.user.id });
  await centre.deps.store.table('threads').update({ id: thread.id }, { last_message_at: ctx.now().toISOString(), status: thread.status === 'open' ? 'handed_over' : thread.status });
  await ctx.audit('centre.admissions_staff_reply', { channel: thread.channel }, { type: 'admissions_thread', id: thread.id });
  return { ok: true };
}

export const bookings = {
  async GET(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const rows = await centre.deps.store.table('bookings').list({ workspace_id: centre.access.workspace.id }, { order: 'starts_at', desc: true, limit: 300 });
    return { bookings: rows };
  },
  /** { id }: cancels a booking that is not in Academy yet. */
  async DELETE(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const [row] = await centre.deps.store.table('bookings').update({ id: uuid(record(await ctx.body()).id, 'id'), workspace_id: centre.access.workspace.id }, { status: 'cancelled' }, { in: { status: ['requested', 'confirmed'] } });
    if (!row) throw new SchoodAIError('not_found', 'Booking not found, or it is already in Academy.', 404);
    await ctx.audit('centre.booking_cancelled', {}, { type: 'booking', id: row.id });
    return { booking: row };
  },
};

// --- The agent ---------------------------------------------------------------------------------------

export interface AgentMessage { text: string; buttons?: { label: string; data: string }[] }
export interface Slot { index: number; starts_at: string; ends_at: string; label: string }
const fmt = formatWhen;

/** Open trial slots from the owner's weekly rules, minus bookings already taken. */
export async function openSlots(deps: CentreDeps, row: AdmissionsRow, now: Date, locale: Locale, max = 8): Promise<Slot[]> {
  const rules = asRecord(row.booking);
  const slots = Array.isArray(rules.slots) ? rules.slots as { weekday: number; start: string; capacity: number }[] : [];
  if (!slots.length) return [];
  const duration = Number(rules.duration_minutes ?? 60) * 60_000, notice = Number(rules.min_notice_hours ?? 12) * 3_600_000, ahead = Number(rules.max_days_ahead ?? 14);
  const taken = await deps.store.table('bookings').list({ workspace_id: row.workspace_id }, { in: { status: ['requested', 'confirmed', 'synced'] }, gte: { starts_at: now.toISOString() } });
  const out: Slot[] = [];
  for (let day = 0; day <= ahead && out.length < max; day++) {
    const date = tashkentDay(new Date(now.getTime() + day * 86_400_000));
    const weekday = ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    for (const slot of slots.filter((entry) => entry.weekday === weekday).sort((a, b) => a.start.localeCompare(b.start))) {
      const starts = new Date(`${date}T${slot.start}:00+05:00`);
      if (starts.getTime() - now.getTime() < notice) continue;
      const used = taken.filter((booking) => Date.parse(booking.starts_at) === starts.getTime()).length;
      if (used >= slot.capacity) continue;
      out.push({ index: out.length + 1, starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + duration).toISOString(), label: fmt(starts.toISOString(), locale) });
      if (out.length >= max) break;
    }
  }
  return out;
}

const replySchema = s.object({
  reply: s.string({ min: 1, max: 1500 }),
  intent: s.enumOf(['question', 'book_trial', 'placement', 'handover', 'other'] as const),
  language: s.enumOf(LANGS),
  contact: s.optional(s.object({ name: s.optional(s.string({ max: 120 })), phone: s.optional(s.string({ max: 30 })), age: s.optional(s.number({ min: 3, max: 99, integer: true })), interest: s.optional(s.string({ max: 120 })) })),
  slot: s.optional(s.nullable(s.number({ min: 1, max: 20, integer: true }))),
});

function cleanContact(current: Record<string, unknown>, update: Record<string, unknown> | undefined) {
  const next = { ...current };
  const name = clean(update?.name, 120), phone = clean(update?.phone, 30), interest = clean(update?.interest, 120);
  if (name && name.length >= 2) next.name = name;
  if (phone && /^\+?[0-9][0-9 ()-]{6,18}$/.test(phone)) next.phone = phone.replace(/[^\d+]/g, '');
  if (typeof update?.age === 'number') next.age = update.age;
  if (interest) next.interest = interest;
  return next;
}

/** The objective items of the centre's chat placement test, at most 30. */
function chatItems(test: PlacementTest) {
  return test.sections.filter((sec) => sec.kind === 'objective').flatMap((sec) => sec.items ?? []).slice(0, 30);
}

interface AgentInput { ctx: RequestContext; deps: CentreDeps; workspace: Workspace; config: AdmissionsRow; thread: ThreadRow; text: string; channel: 'telegram' | 'widget'; now: Date }

async function handover(input: AgentInput, locale: Locale): Promise<AgentMessage[]> {
  const { deps, workspace, thread, config: row } = input;
  await deps.store.table('threads').update({ id: thread.id }, { status: 'handed_over' });
  const notify = (asRecord(row.handover).notify_user_ids as string[] | undefined) ?? [];
  await alertStaff(deps, workspace.id, say(T.alertHandover, 'en', { centre: workspace.name, channel: thread.channel }) + `\n${say(T.alertHandover, 'uz', { centre: workspace.name, channel: thread.channel })}`, notify.length ? notify : undefined);
  const custom = asRecord(asRecord(row.handover).message);
  return [{ text: typeof custom[locale] === 'string' ? String(custom[locale]) : say(T.handover, locale, { centre: workspace.name }) }];
}

function placementQuestion(test: PlacementTest, index: number): AgentMessage {
  const items = chatItems(test), entry = items[index];
  const view = publicTest(test).sections.flatMap((sec) => sec.items).find((item) => item.id === entry.id)!;
  if (entry.type === 'mcq') return { text: `${index + 1}/${items.length}. ${view.prompt}\n${(view.options ?? []).map((option, at) => `${String.fromCharCode(65 + at)}) ${option}`).join('\n')}`, buttons: (view.options ?? []).map((_, at) => ({ label: String.fromCharCode(65 + at), data: `pt:${index}:${at}` })) };
  return { text: `${index + 1}/${items.length}. ${view.prompt}` };
}

async function startPlacement(input: AgentInput, locale: Locale): Promise<AgentMessage[]> {
  const { ctx, deps, workspace, thread, config: row } = input;
  if (!row.placement_page_id) return [{ text: say(T.noTest, locale) }];
  try {
    const { page, test } = await loadTest(ctx.repo, workspace.id, row.placement_page_id, { approvedOnly: true });
    const items = chatItems(test);
    if (!items.length) return [{ text: say(T.noTest, locale) }];
    await deps.store.table('threads').update({ id: thread.id }, { placement: { page_id: page.id, revision: page.revision, index: 0, answers: {} } });
    return [{ text: say(T.testStart, locale, { count: items.length }) }, placementQuestion(test, 0)];
  } catch {
    return [{ text: say(T.noTest, locale) }];
  }
}

async function continuePlacement(input: AgentInput, locale: Locale, reply: string): Promise<AgentMessage[]> {
  const { ctx, deps, workspace, thread } = input;
  const state = asRecord(thread.placement);
  const { page, test } = await loadTest(ctx.repo, workspace.id, String(state.page_id), { approvedOnly: false });
  const items = chatItems(test);
  let index = Number(state.index ?? 0);
  const answers = { ...asRecord(state.answers) };
  const stop = /^\/?(stop|stopp|стоп|tugat)/i.test(reply.trim());
  if (!stop && items[index]) {
    const entry = items[index];
    const pressed = /^pt:(\d+):(\d+)$/.exec(reply);
    if (entry.type === 'mcq') {
      const letter = /^\s*([A-Fa-f])\s*[).]?\s*$/.exec(reply);
      const choice = pressed && Number(pressed[1]) === index ? Number(pressed[2]) : letter ? letter[1].toUpperCase().charCodeAt(0) - 65 : NaN;
      if (!Number.isInteger(choice) || choice < 0 || choice >= (entry.options?.length ?? 0)) return [placementQuestion(test, index)];
      answers[entry.id] = choice;
    } else {
      answers[entry.id] = reply.slice(0, 120);
    }
    index++;
  }
  if (!stop && index < items.length) {
    await deps.store.table('threads').update({ id: thread.id }, { placement: { ...state, index, answers } });
    return [placementQuestion(test, index)];
  }
  const score = scoreObjective(test, answers);
  await deps.store.table('threads').update({ id: thread.id }, { placement: null });
  await deps.store.table('attempts').insert({
    workspace_id: workspace.id, test_page_id: page.id, test_revision: Number(state.revision ?? page.revision), channel: input.channel, thread_id: thread.id,
    prospect: { ...thread.contact }, answers, objective: score as unknown as Record<string, unknown>, level: score.level, status: 'submitted', submitted_at: input.now.toISOString(),
  });
  const level = score.level ? LEVEL_LABEL[score.level] : '—';
  return [{ text: say(T.testResult, locale, { level, correct: score.correct, total: score.total }), buttons: [{ label: say(T.menuBook, locale), data: 'menu:book' }] }];
}

function menu(locale: Locale): AgentMessage['buttons'] {
  return [{ label: say(T.menuPrices, locale), data: 'menu:prices' }, { label: say(T.menuTest, locale), data: 'menu:test' }, { label: say(T.menuBook, locale), data: 'menu:book' }, { label: say(T.menuHuman, locale), data: 'menu:human' }];
}
function priceList(row: AdmissionsRow, locale: Locale): string {
  const prices = Array.isArray(row.prices) ? row.prices as { course: string; price: number; currency: string; period: string; note?: string | null }[] : [];
  if (!prices.length) return say(T.noPrices, locale);
  const per: Record<string, Record<Locale, string>> = { month: { en: 'per month', uz: 'oyiga', ru: 'в месяц' }, course: { en: 'per course', uz: 'kurs uchun', ru: 'за курс' }, lesson: { en: 'per lesson', uz: 'dars uchun', ru: 'за урок' }, other: { en: '', uz: '', ru: '' } };
  return prices.map((entry) => `• ${entry.course}: ${new Intl.NumberFormat('ru-RU').format(entry.price)} ${entry.currency === 'UZS' ? (locale === 'en' ? 'UZS' : locale === 'ru' ? 'сум' : 'so‘m') : 'USD'} ${pick(locale, per[entry.period] ?? per.other)}${entry.note ? ` (${entry.note})` : ''}`.trim()).join('\n');
}

/**
 * One turn of the admissions agent. Deterministic paths (menu, prices, placement
 * test, handover) cost nothing; a free-text question is one charged AI reply. When
 * the AI cannot answer (no credits, switched off, capped), the prospect is told a
 * person will reply and staff are alerted.
 */
export async function agentTurn(input: AgentInput): Promise<AgentMessage[]> {
  const { ctx, deps, workspace, config: row, now } = input;
  let thread = input.thread;
  const message = input.text.trim().slice(0, 2000);
  const locale: Locale = thread.language;
  const day = tashkentDay(now);
  if (thread.turns_day === day && thread.turns >= LIMITS.turnsPerThreadDay) return [{ text: say(T.limit, locale, { centre: workspace.name }) }];
  const turns = thread.turns_day === day ? thread.turns + 1 : 1;
  [thread] = await deps.store.table('threads').update({ id: thread.id }, { turns_day: day, turns, last_message_at: now.toISOString() });
  if (!message.startsWith('pt:') && !message.startsWith('menu:')) await deps.store.table('admissions_messages').insert({ thread_id: thread.id, workspace_id: workspace.id, role: 'prospect', content: message.slice(0, 4000) || '…' });
  const respond = async (messages: AgentMessage[], flags: Record<string, unknown> = {}) => {
    for (const out of messages) await deps.store.table('admissions_messages').insert({ thread_id: thread.id, workspace_id: workspace.id, role: 'agent', content: out.text.slice(0, 4000), flags });
    return messages;
  };
  if (thread.status === 'handed_over') return [];
  const greeting = asRecord(row.greeting);
  if (/^\/start\b/.test(message) || message === 'menu:start') return respond([{ text: typeof greeting[locale] === 'string' ? String(greeting[locale]) : say(T.greeting, locale, { centre: workspace.name }), buttons: menu(locale) }]);
  if (message === 'menu:prices' || /^\/prices?\b/.test(message)) return respond([{ text: priceList(row, locale), buttons: menu(locale) }]);
  if (message === 'menu:human' || /^\/human\b/.test(message) || HANDOVER.test(message)) return respond(await handover(input, locale), { handover: true });
  if (thread.placement) return respond(await continuePlacement({ ...input, thread }, locale, message), { placement: true });
  if (message === 'menu:test' || /^\/test\b/.test(message)) return respond(await startPlacement({ ...input, thread }, locale), { placement: true });
  if (!await deps.store.takePublic(workspace.id, 'agent_turns', day, LIMITS.turnsPerCentreDay)) return respond(await handover(input, locale), { limit: true });

  const slots = await openSlots(deps, row, now, locale);
  const history = (await deps.store.table('admissions_messages').list({ thread_id: thread.id }, { order: 'id', desc: true, limit: 12 })).reverse();
  const facts = {
    centre: workspace.name, faq: row.faq, prices: row.prices, open_trial_slots: slots.map((slot) => ({ slot: slot.index, time: slot.label })),
    booking: { requires_phone: asRecord(row.booking).require_phone !== false, mode: asRecord(row.booking).mode === 'auto' ? 'confirmed at once' : 'confirmed by a person' },
    placement_test: !!row.placement_page_id, contact_so_far: thread.contact,
  };
  const request = message === 'menu:book' ? 'I would like to book a trial lesson.' : message;
  let ai;
  try {
    ai = await ctx.ai.json({
      key: 'admissions.reply', schema: replySchema, maxTokens: 700, temperature: 0.3, reference: `admissions:${thread.id}:${turns}:${day}`,
      messages: [
        { role: 'system', content: centrePrompt({
          workspace, locale,
          task: [
            'You are the admissions assistant of this education centre, chatting with a prospective student or a parent. Be warm, brief (at most 90 words) and helpful.',
            'Answer only from the FAQ and the price list in the reference data. If they do not answer the question, say a person from the centre will confirm, and set intent to handover.',
            'To book a trial lesson you need the person’s name' + (facts.booking.requires_phone ? ' and phone number' : '') + ' and one of the open trial slots; offer only those slots (by their time) and put the chosen slot number in `slot`. Never invent times.',
            'If they want to know their level, offer the placement test (intent placement) when the data says one exists.',
            'Put any name, phone, age or course interest the person gave in `contact`. Set `language` to the language they write in (uz, ru or en) and reply in it.',
          ].join(' '),
          blocks: [{ kind: 'admissions', title: 'Centre facts', data: facts }],
        }) },
        ...history.filter((entry) => entry.role !== 'system').slice(0, -1).map((entry) => ({ role: entry.role === 'prospect' ? 'user' as const : 'assistant' as const, content: entry.role === 'prospect' ? wrapUserMessage(entry.content) : entry.content })),
        { role: 'user', content: wrapUserMessage(request) },
      ],
    });
  } catch (cause) {
    if (cause instanceof SchoodAIError) return respond(await handover(input, locale), { ai_unavailable: cause.code });
    throw cause;
  }
  const data = ai.data;
  const language: Locale = data.language;
  const contact = cleanContact(thread.contact, data.contact as Record<string, unknown> | undefined);
  await deps.store.table('threads').update({ id: thread.id }, { language, contact });
  thread = { ...thread, language, contact };
  // Prices and dates come only from the centre's data.
  if (unknownNumbers(data.reply, { facts, request, contact }, 12).length) return respond(await handover({ ...input, thread }, language), { unverified: true });
  if (data.intent === 'handover') return respond([{ text: data.reply }, ...await handover({ ...input, thread }, language)], { handover: true });
  if (data.intent === 'placement' && row.placement_page_id) return respond([{ text: data.reply }, ...await startPlacement({ ...input, thread }, language)], { placement: true });
  const slot = data.intent === 'book_trial' && data.slot ? slots.find((entry) => entry.index === data.slot) : undefined;
  const needsPhone = facts.booking.requires_phone && !contact.phone;
  if (slot && contact.name && !needsPhone) return respond(await book({ ...input, thread }, slot, language), { booking: true });
  return respond([{ text: data.reply }], { credits: ai.credits });
}

async function book(input: AgentInput, slot: Slot, locale: Locale): Promise<AgentMessage[]> {
  const { ctx, deps, workspace, thread, config: row } = input;
  const auto = asRecord(row.booking).mode === 'auto';
  const contact = thread.contact;
  const booking = await deps.store.table('bookings').insert({
    workspace_id: workspace.id, thread_id: thread.id, starts_at: slot.starts_at, ends_at: slot.ends_at, status: auto ? 'confirmed' : 'requested', mode: auto ? 'auto' : 'approve',
    contact: { name: contact.name ?? null, phone: contact.phone ?? null, age: contact.age ?? null, interest: contact.interest ?? null },
  });
  const confirm = say(auto ? T.booked : T.requested, locale, { time: fmt(slot.starts_at, locale) });
  const payload = {
    booking_id: booking.id, academy_id: workspace.academyTenantId, lead_id: thread.academy_lead_id, name: String(contact.name), phone: typeof contact.phone === 'string' ? contact.phone : null, telegram: null,
    age: typeof contact.age === 'number' ? contact.age : null, interest: typeof contact.interest === 'string' ? contact.interest : null, starts_at: slot.starts_at, ends_at: slot.ends_at,
    classroom_id: null, teacher_user_id: null, language: locale, confirm_message: auto ? null : say(T.booked, locale, { time: fmt(slot.starts_at, locale) }), source: input.channel === 'telegram' ? 'telegram' : 'website',
  };
  // The bot and the widget have nobody signed in: the centre proposes it, staff approve it.
  const action = ctx.caller === 'user' ? await ctx.actions.propose({ kind: 'centre_book_trial', payload }) : await proposeAsCentre(ctx, workspace.id, trialProposal(payload, ctx.locale));
  await deps.store.table('bookings').update({ id: booking.id }, { action_id: action.id, contact: { ...booking.contact, confirmation_sent: auto } });
  await deps.store.table('threads').update({ id: thread.id }, { status: 'booked' });
  await alertStaff(deps, workspace.id, say(T.alertBooking, 'en', { centre: workspace.name, state: auto ? 'confirmed' : 'requested', name: String(contact.name), time: fmt(slot.starts_at, 'en') }));
  return [{ text: confirm }];
}

/** Finds or opens the conversation of a Telegram chat or widget session, within the daily cap for new ones. */
export async function openThread(deps: CentreDeps, workspaceId: string, channel: 'telegram' | 'widget', externalId: string, language: Locale, now: Date): Promise<ThreadRow | null> {
  const found = await deps.store.table('threads').get({ workspace_id: workspaceId, channel, external_id: externalId });
  if (found) return found;
  if (!await deps.store.takePublic(workspaceId, 'new_threads', tashkentDay(now), LIMITS.newThreadsPerDay)) return null;
  try {
    return await deps.store.table('threads').insert({ workspace_id: workspaceId, channel, external_id: externalId, language });
  } catch {
    return await deps.store.table('threads').get({ workspace_id: workspaceId, channel, external_id: externalId });
  }
}

