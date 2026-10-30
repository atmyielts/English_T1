import { integer, oneOf, record } from '../input.ts';
import { SchoodAIError, type Locale, type RequestContext } from '../types.ts';
import { requireLearner, store } from './common.ts';
import { APP_URL } from './store.ts';
import { answerBrief, briefMessages, dailyBrief, escapeHtml, saveScheduleFrom, telegramHtml, type TelegramMessage } from './brief.ts';
import { makeDuel } from './duel.ts';
import { askAboutChild, parentBriefMessage, parentBriefs, requireParent } from './family.ts';
import { telegramTutor } from './tutor.ts';

// Schood AI inside the student bot (workers/schood-bot). The Worker relays a few
// updates here with the service secret and the Telegram-linked user, and sends
// back what this returns; everything else in the bot (homework hand-in included)
// is untouched. Commands:
//   /ai [question]   the L1 tutor (a reply to a Schood AI message continues it; /ai new starts over)
//   /brief [on HH:MM | off | now]   the L14 daily brief
//   /child [n] [question | brief]   P1 and P2 for Plus Family parents
//   /aiduel <topic>  an L17 duel by link
//   aib:<id>:<q>:<choice> buttons   answers to the daily brief
// Scheduled briefs are not sent from here: learner/jobs.ts sends them with ctx.notify.send.

/** Every Schood AI message starts with this, so replies to it come back here. */
export const MARK = 'Schood AI';

const COPY: Record<Locale, Record<string, string>> = {
  en: {
    ask: 'Ask your question — reply to this message. Each answer costs 1 credit.', fresh: 'New conversation. Ask your question by replying to this message.', reply_hint: 'Reply to this message to continue.',
    plan: 'This needs a Schood AI plan.', consent: 'Open Schood AI on the web once to confirm your age, then come back.', credits: 'Not enough Schood AI credits for this.', capped: 'Schood AI has reached today\'s limit. Try again after midnight (Tashkent).',
    off: 'Schood AI is not available right now. Please try again later.', web: 'Open Schood AI', failed: 'Schood AI could not answer just now. Your credits were returned.',
    brief_on: 'Daily brief is on at {time}.', brief_off: 'Daily brief is off. Turn it on with /brief on 08:30.', brief_status: 'Daily brief: {state}. Use /brief on 08:30, /brief off or /brief now.',
    no_children: 'No linked children yet. Invite your child at ai.schood.online/family.', children: 'Your children:\n{list}\n\nAsk: /child 1 How is she doing in English?\nWeekly brief now: /child brief', pick: 'Which child? Write /child <number> <question>.',
    duel_usage: 'Write a topic, for example: /aiduel travel phrasal verbs', duel_ready: 'Your duel on "{topic}" ({level}) is ready. Send this link to a friend:', duel_play: 'Play in Telegram', duel_share: 'Share', quiet: 'Pick a time between 08:00 and 21:59.',
  },
  uz: {
    ask: 'Savolingizni yozing — shu xabarga javob qiling. Har bir javob 1 kredit.', fresh: 'Yangi suhbat. Savolingizni shu xabarga javob qilib yozing.', reply_hint: 'Davom etish uchun shu xabarga javob qiling.',
    plan: 'Buning uchun Schood AI tarifi kerak.', consent: 'Yoshingizni tasdiqlash uchun Schood AI ni bir marta vebda oching, keyin qayting.', credits: 'Schood AI kreditlari yetarli emas.', capped: 'Schood AI bugungi limitga yetdi. Yarim tundan keyin (Toshkent) urinib koʻring.',
    off: 'Schood AI hozir ishlamayapti. Keyinroq urinib koʻring.', web: 'Schood AI ni ochish', failed: 'Schood AI hozir javob bera olmadi. Kreditlaringiz qaytarildi.',
    brief_on: 'Kunlik mashq {time} da yoqilgan.', brief_off: 'Kunlik mashq oʻchirilgan. Yoqish: /brief on 08:30.', brief_status: 'Kunlik mashq: {state}. /brief on 08:30, /brief off yoki /brief now.',
    no_children: 'Hali bogʻlangan farzand yoʻq. Farzandingizni ai.schood.online/family da taklif qiling.', children: 'Farzandlaringiz:\n{list}\n\nSavol: /child 1 Ingliz tilida ishlari qanday?\nHaftalik hisobot: /child brief', pick: 'Qaysi farzand? /child <raqam> <savol> deb yozing.',
    duel_usage: 'Mavzu yozing, masalan: /aiduel sayohat iboralari', duel_ready: '"{topic}" ({level}) duelingiz tayyor. Bu havolani doʻstingizga yuboring:', duel_play: 'Telegramda oʻynash', duel_share: 'Ulashish', quiet: '08:00 dan 21:59 gacha vaqt tanlang.',
  },
  ru: {
    ask: 'Задайте вопрос — ответьте на это сообщение. Каждый ответ стоит 1 кредит.', fresh: 'Новый разговор. Задайте вопрос ответом на это сообщение.', reply_hint: 'Ответьте на это сообщение, чтобы продолжить.',
    plan: 'Для этого нужен тариф Schood AI.', consent: 'Откройте Schood AI на сайте один раз, чтобы подтвердить возраст, и возвращайтесь.', credits: 'Недостаточно кредитов Schood AI.', capped: 'Schood AI исчерпал дневной лимит. Попробуйте после полуночи (Ташкент).',
    off: 'Schood AI сейчас недоступен. Попробуйте позже.', web: 'Открыть Schood AI', failed: 'Schood AI не смог ответить. Кредиты возвращены.',
    brief_on: 'Ежедневная разминка включена на {time}.', brief_off: 'Ежедневная разминка выключена. Включить: /brief on 08:30.', brief_status: 'Ежедневная разминка: {state}. /brief on 08:30, /brief off или /brief now.',
    no_children: 'Пока нет привязанных детей. Пригласите ребёнка на ai.schood.online/family.', children: 'Ваши дети:\n{list}\n\nВопрос: /child 1 Как у неё дела с английским?\nНедельный отчёт: /child brief', pick: 'Какой ребёнок? Напишите /child <номер> <вопрос>.',
    duel_usage: 'Напишите тему, например: /aiduel фразовые глаголы для путешествий', duel_ready: 'Дуэль на тему «{topic}» ({level}) готова. Отправьте ссылку другу:', duel_play: 'Играть в Telegram', duel_share: 'Поделиться', quiet: 'Выберите время с 08:00 до 21:59.',
  },
};
const say = (ctx: RequestContext, key: string, params: Record<string, string> = {}) => Object.entries(params).reduce((out, [name, value]) => out.replaceAll(`{${name}}`, value), COPY[ctx.locale][key] ?? COPY.en[key]);
const marked = (body: string): string => `<b>${MARK}</b>\n${body}`;
const webButton = (ctx: RequestContext, path = '') => [[{ text: say(ctx, 'web'), url: `${APP_URL.replace(/\/$/, '')}${path}` }]];

/** A refusal as a chat message instead of an error. */
function refusal(ctx: RequestContext, error: unknown): TelegramMessage {
  const code = error instanceof SchoodAIError ? error.code : 'ai_failed';
  const key = code === 'plan_required' || code === 'role_required' ? 'plan' : code === 'consent_required' ? 'consent'
    : code === 'insufficient_credits' || code === 'budget_exhausted' ? 'credits' : code === 'capped' ? 'capped'
    : code === 'ai_disabled' || code === 'ai_unavailable' ? 'off' : code === 'quiet_hours' ? 'quiet' : 'failed';
  if (!(error instanceof SchoodAIError)) console.error(JSON.stringify({ event: 'schood_ai_telegram_failed', error: String(error).slice(0, 200) }));
  return { text: marked(escapeHtml(say(ctx, key))), buttons: webButton(ctx, key === 'plan' ? '/plans' : key === 'consent' ? '/consent?next=/tutor' : '') };
}

async function tutor(ctx: RequestContext, question: string, updateId: number): Promise<TelegramMessage[]> {
  const out = await telegramTutor(ctx, question, { reference: `telegram-tutor:${ctx.user.id}:${updateId}` });
  return [{ text: marked(`${telegramHtml(out.reply)}\n\n<i>${escapeHtml(say(ctx, 'reply_hint'))}</i>`) }];
}

async function brief(ctx: RequestContext, args: string): Promise<TelegramMessage[]> {
  const [action, time] = args.trim().split(/\s+/);
  if (action === 'on' || action === 'off') {
    if (action === 'on') await requireLearner(ctx, 'L14');
    const view = await saveScheduleFrom(ctx, 'daily', { enabled: action === 'on', time: time ?? (await store(ctx).schedule(ctx.user.id, 'daily'))?.sendTime ?? '08:30' });
    return [{ text: marked(escapeHtml(action === 'on' ? say(ctx, 'brief_on', { time: view.schedule?.time ?? '08:30' }) : say(ctx, 'brief_off'))) }];
  }
  if (action === 'now') {
    const access = await requireLearner(ctx, 'daily.brief');
    const { record: row } = await dailyBrief(ctx, access);
    // They have today's brief in Telegram now, so the scheduled one is not pushed again.
    if (!row.state.sent_at) await store(ctx).updateRecord(row.id, row.version, { state: { ...row.state, sent_at: ctx.now().toISOString() } });
    return briefMessages(row, ctx.locale, APP_URL).map((message, index) => (index === 0 ? { ...message, text: marked(message.text) } : message));
  }
  const schedule = await store(ctx).schedule(ctx.user.id, 'daily');
  return [{ text: marked(escapeHtml(say(ctx, 'brief_status', { state: schedule?.enabled ? schedule.sendTime : 'off' }))) }];
}

async function child(ctx: RequestContext, args: string): Promise<TelegramMessage[]> {
  const access = await requireParent(ctx, 'P1');
  const links = (await store(ctx).familyLinks({ workspaceId: access.workspace.id, parentId: ctx.user.id, statuses: ['active'] })).filter((link) => link.childId);
  if (!links.length) return [{ text: marked(escapeHtml(say(ctx, 'no_children'))), buttons: webButton(ctx, '/family') }];
  const names = await Promise.all(links.map(async (link) => (await store(ctx).displayName(link.childId!).catch(() => null)) ?? link.childLabel));
  const trimmed = args.trim();
  if (!trimmed) return [{ text: marked(escapeHtml(say(ctx, 'children', { list: names.map((name, index) => `${index + 1}. ${name}`).join('\n') }))) }];
  if (/^brief$/i.test(trimmed)) {
    await requireParent(ctx, 'parent.brief');
    return (await parentBriefs(ctx, access)).map((entry, index) => { const message = parentBriefMessage(entry, ctx.locale); return index === 0 ? { ...message, text: marked(message.text) } : message; });
  }
  const match = /^(\d)\s+([\s\S]+)$/.exec(trimmed);
  const index = match ? Number(match[1]) - 1 : links.length === 1 ? 0 : -1;
  const question = match ? match[2] : trimmed;
  if (index < 0 || index >= links.length) return [{ text: marked(escapeHtml(say(ctx, 'pick'))) }];
  const out = await askAboutChild(ctx, links[index].childId!, question.slice(0, 1000));
  return [{ text: marked(`<b>${escapeHtml(out.child.name)}</b>\n${telegramHtml(out.answer)}`) }];
}

async function duel(ctx: RequestContext, topic: string): Promise<TelegramMessage[]> {
  if (!topic.trim()) return [{ text: marked(escapeHtml(say(ctx, 'duel_usage'))) }];
  const out = await makeDuel(ctx, { topic: topic.trim().slice(0, 80) });
  return [{
    text: marked(`${escapeHtml(say(ctx, 'duel_ready', { topic: out.duel.topic, level: out.duel.level }))}\n${escapeHtml(out.duel.links.landing)}`),
    buttons: [[{ text: say(ctx, 'duel_share'), url: out.duel.links.share }], [{ text: say(ctx, 'duel_play'), url: out.duel.links.bot }]],
  }];
}

// POST learner/telegram { kind: command|reply|callback, command?, args?, text?, data?, update_id }
export async function telegram(ctx: RequestContext) {
  if (ctx.user.via !== 'service') throw new SchoodAIError('service_only', 'Only the Schood bot calls this.', 403);
  const body = record(await ctx.body());
  const kind = oneOf(body.kind, 'kind', ['command', 'reply', 'callback'] as const);
  const updateId = integer(body.update_id, 'update_id', 0, Number.MAX_SAFE_INTEGER);
  const args = typeof body.args === 'string' ? body.args.slice(0, 2000) : '';
  try {
    if (kind === 'callback') {
      const match = /^aib:([0-9a-f-]{36}):([0-3]):([0-3])$/.exec(String(body.data ?? ''));
      if (!match) return { handled: false };
      const out = await answerBrief(ctx, { id: match[1], q: Number(match[2]), choice: Number(match[3]) });
      return { handled: true, toast: out.telegram.toast, edit: out.first ? out.telegram.edit : null, messages: out.first && out.telegram.next ? [out.telegram.next] : [] };
    }
    if (kind === 'reply') {
      const question = typeof body.text === 'string' ? body.text.trim().slice(0, 4000) : '';
      return { handled: true, messages: question ? await tutor(ctx, question, updateId) : [] };
    }
    const command = oneOf(body.command, 'command', ['/ai', '/brief', '/child', '/aiduel'] as const);
    if (command === '/ai') {
      if (!args.trim()) return { handled: true, messages: [{ text: marked(escapeHtml(say(ctx, 'ask'))), force_reply: true }] };
      if (/^(new|reset|yangi|новый)$/i.test(args.trim())) {
        await store(ctx).setTelegramThread(ctx.user.id, null, null);
        return { handled: true, messages: [{ text: marked(escapeHtml(say(ctx, 'fresh'))), force_reply: true }] };
      }
      return { handled: true, messages: await tutor(ctx, args, updateId) };
    }
    if (command === '/brief') return { handled: true, messages: await brief(ctx, args) };
    if (command === '/child') return { handled: true, messages: await child(ctx, args) };
    return { handled: true, messages: await duel(ctx, args) };
  } catch (error) {
    return { handled: true, messages: [refusal(ctx, error)] };
  }
}

export const telegramRoutes = {
  telegram: { POST: telegram, service: true },
};
