import { signTelegramInitDataForTest } from '../../_shared/telegram-init-data.ts';
import { loadPacks } from '../../../../packages/coach-packs/src/registry.ts';
import type { Registry } from '../../../../packages/ai-core/src/mod.ts';
import { createWorker } from '../../../../workers/schood-coach-bots/src/worker.ts';
import { completion, fixture, ID, SECRET, START, USERS } from '../fixture.test.ts';
import { SEED_REGISTRY } from '../memory-repository.ts';
import { coachServices, coachStore } from './mod.ts';
import type { CoachRuntime } from './runtime.ts';
import { createMemoryCoachStore } from './store-memory.ts';
import { dataCheckString } from './telegram-auth.ts';

// The whole coach stack for tests: Telegram (fake) → the real worker → the real
// schood-ai handler with the coach module over the memory stores (cron and certificate
// checks included),
// and a fake model that answers each coach task in its own shape. Speech to text
// reads the "audio" as the words it stands for, so a test controls what was said.

export const SUPABASE = 'https://coach-test.supabase.co';
export const APP = 'https://ai.schood.online';
export const BOT = {
  ielts: { id: '7000000001', token: '7000000001:IELTS-TEST-TOKEN-0123456789abcdef', secret: 'hook-secret-ielts-0123', username: 'SchoodIeltsCoachBot' },
  speaking: { id: '7000000002', token: '7000000002:SPEAK-TEST-TOKEN-0123456789abcdef', secret: 'hook-secret-speaking-01', username: 'SchoodSpeakingBot' },
  maths: { id: '7000000003', token: '7000000003:MATHS-TEST-TOKEN-0123456789abcdef', secret: 'hook-secret-maths-0123', username: 'SchoodMathsCoachBot' },
  sales: { id: '7000000004', token: '7000000004:SALES-TEST-TOKEN-0123456789abcdef', secret: 'hook-secret-sales-0123', username: 'SchoodSalesCoachBot' },
  career: { id: '7000000005', token: '7000000005:CAREER-TEST-TOKEN-0123456789abcde', secret: 'hook-secret-career-012', username: 'SchoodCareerCoachBot' },
  speech: { id: '7000000006', token: '7000000006:SPEECH-TEST-TOKEN-0123456789abcde', secret: 'hook-secret-speech-012', username: 'SchoodSpeechCoachBot' },
};
export type PackId = keyof typeof BOT;
export const PASS_PRODUCT = '10000000-0000-4000-8000-0000000000b2';

export const SPEECH_REGISTRY: Registry = {
  providers: SEED_REGISTRY.providers,
  models: [
    ...SEED_REGISTRY.models,
    { key: 'openrouter/stt-test', providerKey: 'openrouter', modelId: 'stt-test', displayName: 'STT', capabilities: ['stt'], contextWindow: null, maxOutput: null, inputUsdPerMTok: 0, outputUsdPerMTok: 0, noTraining: true, enabled: true },
    { key: 'openrouter/tts-test', providerKey: 'openrouter', modelId: 'tts-test', displayName: 'TTS', capabilities: ['tts'], contextWindow: null, maxOutput: null, inputUsdPerMTok: 0, outputUsdPerMTok: 0, noTraining: true, enabled: true },
  ],
  routes: [
    ...SEED_REGISTRY.routes,
    { key: 'stt', modelKeys: ['openrouter/stt-test'], requiredCapabilities: [], requireNoTraining: false, maxOutputTokens: null, temperature: null, enabled: true },
    { key: 'tts', modelKeys: ['openrouter/tts-test'], requiredCapabilities: [], requireNoTraining: false, maxOutputTokens: null, temperature: null, enabled: true },
  ],
};

const firstWords = (text: string, count = 5) => (/^\s*(\S+(?:\s+\S+){0,})/.exec(text)?.[1] ?? text).split(/\s+/).slice(0, count).join(' ').replace(/[.,!?;:]+$/, '');
const between = (text: string, open: string, close: string) => { const at = text.lastIndexOf(open); if (at < 0) return ''; const end = text.indexOf(close, at); return text.slice(at + open.length, end < 0 ? undefined : end).trim(); };

export interface ModelKnobs { score: number | null; cefr: number; corrections: boolean; failNext: boolean; prompts: string[]; ocr?: string }

/** Answers each coach task with valid output built from the learner's own words. */
export function fakeModel(knobs: ModelKnobs) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/audio/transcriptions')) {
      const form = await request.formData();
      const said = await (form.get('file') as Blob).text();
      const words = said.split(/\s+/).filter(Boolean);
      let t = 0.3;
      const timed = words.map((word, index) => { const start = t; t += 0.42; if (index % 12 === 11) t += 2.6; return { word, start: Math.round(start * 100) / 100, end: Math.round((start + 0.36) * 100) / 100 }; });
      return new Response(JSON.stringify({ text: said, language: 'en', duration: Math.round(t * 10) / 10, words: timed, segments: [{ start: 0, end: t, text: said }] }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.pathname.endsWith('/audio/speech')) return new Response(new Uint8Array([79, 103, 103, 83, 0, 2, 0, 0, 0, 0]), { headers: { 'Content-Type': 'audio/ogg' } });
    const body = await request.json();
    const system = String(body.messages?.[0]?.content ?? '');
    knobs.prompts.push(system);
    if (knobs.failNext) { knobs.failNext = false; return new Response('{"error":"boom"}', { status: 500 }); }
    const last = body.messages?.at(-1)?.content;
    const user = typeof last === 'string' ? last : '';
    const said = between(user, '<user_message>', '</user_message>');
    if (system.includes('You play ')) {
      const state = JSON.parse(/Hidden state now: (\{.*\})/.exec(system)?.[1] ?? '{}');
      // Numbers move up one within the bounds the schema gives (budgets in UZS stay put).
      for (const key of Object.keys(state)) {
        if (typeof state[key] !== 'number') continue;
        const max = Number(new RegExp(`"${key}":\\{"type":"(?:number|integer)","minimum":-?[\\d.]+,"maximum":(-?[\\d.]+)`).exec(system)?.[1] ?? 10);
        if (state[key] + 1 <= max && max <= 100) state[key] += 1;
      }
      const goal = /working on \(mark the ids already achieved in what they said so far\): ([a-z_]+) —/.exec(system)?.[1];
      const strict = system.includes('strict mode');
      return completion(JSON.stringify({
        reply: 'Of course. Could you tell me a little more about that?', state, goals_met: goal ? [goal] : [], end: false,
        corrections: strict || knobs.corrections ? [{ quote: firstWords(said, 3), better: 'A more natural way to say it', explanation: 'Shorter and more natural.', tag: 'verb_tense' }] : [],
      }));
    }
    if (system.includes('Transcribe the handwritten')) return completion(JSON.stringify({ text: knobs.ocr ?? ESSAY, legible: true }));
    if (system.includes('Transcribe the problem in the photo exactly (problem)')) {
      const levels = Number(/Write (\d) hints/.exec(system)?.[1] ?? 3);
      return completion(JSON.stringify({ problem: '2x + 3 = 11', legible: true, hints: Array.from({ length: levels }, (_, i) => `Hint ${i + 1}: move the numbers to one side.`), solution: '2x = 8, so x = 4. Check: 2·4 + 3 = 11.', answer: 'x = 4' }));
    }
    if (system.includes('Your task: build a sales call script')) {
      const types = [...(/Objection types for the map: ([^.]*)\./.exec(system)?.[1] ?? 'price (Price)').matchAll(/([a-z_]+) \(/g)].map((match) => match[1]);
      return completion(JSON.stringify({
        title: 'Solar kits for greenhouse farms', product: 'Solar power kits that cut the diesel cost of greenhouse heating pumps.', offer: 'Installation in two days and [your price] per kit.',
        buyer: { who: 'Greenhouse owners near Tashkent with 1–3 hectares', pains: ['Diesel costs every month', 'Power cuts in winter'], decision: 'The owner decides, often with a son who runs the farm', budget: '[budget range]' },
        buyer_opening: 'Allo, eshitaman. Kim bu?', opening: 'Good afternoon, this is Aziz from a solar installer. I work with greenhouse farms near you; may I take two minutes to ask how you heat in winter?',
        discovery: ['How do you heat the greenhouses now?', 'What do you spend on diesel in a winter month?', 'What happens when the power goes off?', 'Who else decides on equipment like this?', 'When would you want a change in place?'],
        pitch: 'Farms like yours run their pumps on diesel; a kit sized to your pumps replaces most of that cost and keeps working in power cuts, installed in two days.',
        objections: types.slice(0, 5).map((type, index) => ({ type, objection: `Objection ${index + 1} about ${type}`, response: 'I understand. May I ask what you compare it with, so I can show the real numbers for your farm?', question: 'What would make this worth it for you?' })),
        closes: ['Shall we book the site visit for Thursday or Saturday?', 'If the numbers work for your farm, are you ready to start before winter?'],
        next_steps: ['A free site visit to measure the pumps', 'A written offer with [your price] within a day'],
        dm: 'Assalomu alaykum! You asked about solar for greenhouses: kits sized to your pumps, installed in two days. May I call you for five minutes today?',
        follow_up: 'Thank you for your time today. As agreed, here is the plan for the site visit on Thursday at 10:00. I will bring the measurements sheet.',
        watch_outs: ['Fill in [your price] and [budget range] before using the script'],
      }));
    }
    if (system.includes('Rewrite the learner\'s own essay')) {
      const levels = (/scale: ([\d., ]+)\./.exec(system)?.[1] ?? '6, 7, 8').split(',').map((value) => Number(value.trim()));
      return completion(JSON.stringify({ levels: levels.map((level) => ({ level, text: `A version of the essay written at level ${level}. It keeps the same position and ideas, with clearer paragraphs and more precise vocabulary.`, changes: ['Clearer position in the introduction', 'More precise topic words'] })) }));
    }
    if (system.includes('Write 5 new multiple-choice')) {
      return completion(JSON.stringify({ items: Array.from({ length: 5 }, (_, i) => ({ prompt: `She bought ___ umbrella yesterday (${i + 1}).`, options: ['a', 'an', 'the'], answer: 1, explanation: 'Umbrella starts with a vowel sound.' })) }));
    }
    if (system.includes('Your task: assess')) {
      const scale = /each criterion (\d+(?:\.\d+)?)–(\d+(?:\.\d+)?) in steps of/.exec(system);
      const max = scale ? Number(scale[2]) : 9;
      const score = knobs.score ?? (max === 9 ? 6 : knobs.cefr);
      // The criterion ids the schema allows (the gateway appends the schema to the prompt).
      const ids = JSON.parse(/"id":\{"type":"string","enum":(\[[^\]]*\])/.exec(system)?.[1] ?? '[]') as string[];
      const quote = firstWords(said.replace(/^\[[^\]]*\]\s*/, ''), 5);
      const goalIds = JSON.parse(/"goals":\{"type":"array","items":\{"type":"object","properties":\{"id":\{"type":"string","enum":(\[[^\]]*\])/.exec(system)?.[1] ?? '[]') as string[];
      const goals = goalIds.map((id) => ({ id, met: true, quote: firstWords(said, 4) }));
      return completion(JSON.stringify({
        criteria: ids.map((id) => ({ id, score, evidence: [{ quote, comment: 'Clear and relevant.' }], next_step: 'Add one example.' })),
        errors: [{ quote: firstWords(said.replace(/^\[[^\]]*\]\s*/, ''), 3), correction: 'a corrected phrase', tag: 'articles', explanation: 'Use an article before a singular noun.' }],
        upgrades: [{ said: firstWords(said.replace(/^\[[^\]]*\]\s*/, ''), 6), better: 'A more precise and natural version of that sentence.', why: 'More natural.' }],
        summary: 'A solid answer with room to develop ideas further.',
        ...(goals.length ? { goals } : {}),
      }));
    }
    return completion(JSON.stringify({ ok: true }));
  };
}

export const ESSAY = 'Some people believe that public transport should be free for everyone in big cities. In my opinion this idea has more advantages than disadvantages. Firstly, free buses would reduce the number of cars on roads and air would become cleaner. Secondly, poor families could travel to work and school without spending money. However, the government need to pay for it and taxes may increase. For example, in my city the metro is very cheap but it is always crowded. To conclude, I think free public transport is good idea if government plan it carefully and improve the service at the same time.';

export interface TelegramCall { method: string; body: Record<string, unknown> }

export async function coachStack(options: { speech?: boolean; users?: typeof USERS } = {}) {
  const knobs: ModelKnobs = { score: null, cefr: 3.5, corrections: false, failNext: false, prompts: [] };
  const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const publicHex = [...new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  // The fixture's clock, mirrored: advance() moves both.
  let current = START;
  const now = () => current;
  const chats = new Map<string, string>(Object.values(options.users ?? USERS).filter((user) => user.telegramChatId).map((user) => [user.telegramChatId!, user.id]));
  const coach = createMemoryCoachStore({ now, chatIdOf: (userId) => [...chats.entries()].find(([, id]) => id === userId)?.[0] ?? null });
  const runtime: CoachRuntime = {
    store: coach.store, packs: loadPacks(),
    config: { appUrl: APP, bots: Object.fromEntries(Object.entries(BOT).map(([pack, bot]) => [pack, { id: bot.id, username: bot.username }])), passProducts: { B2: [PASS_PRODUCT] }, fairUseCredits: 1200, telegramPublicKey: publicHex },
  };
  // ctx.auth.telegramLink as index.ts sends it: telegram-link with the service-role bearer.
  const f = fixture({
    registry: options.speech === false ? SEED_REGISTRY : SPEECH_REGISTRY,
    async telegramLink(input) {
      const response = await backend(`${SUPABASE}/functions/v1/telegram-link`, { method: 'POST', headers: { Authorization: 'Bearer service-role-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: input.action, chat_id: input.chatId, ...(input.token ? { token: input.token } : {}) }) });
      return { status: response.status, data: await response.json().catch(() => null) };
    },
  });
  // The coach area's stores: a memory twin that knows the linked chats, and test settings.
  f.stores.use(coachStore, coach.store);
  f.stores.use(coachServices, { config: runtime.config });
  const advance = (ms: number) => { f.advance(ms); current = new Date(current.getTime() + ms); };
  f.setProvider(fakeModel(knobs));

  const calls: TelegramCall[] = [];
  let messageId = 1000, pollId = 1, updateId = 1;
  const files = new Map<string, string>();
  async function backend(input: Request | string | URL, init?: RequestInit): Promise<Response> {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname === 'api.telegram.org') {
      if (url.pathname.startsWith('/file/')) return new Response(new TextEncoder().encode(files.get(url.pathname.split('/').pop()!) ?? ''));
      const method = url.pathname.split('/').pop()!;
      let body: Record<string, unknown>;
      if ((request.headers.get('content-type') ?? '').includes('multipart')) { const form = await request.formData(); body = Object.fromEntries([...form.entries()].map(([key, value]) => [key, typeof value === 'string' ? value : `<${(value as Blob).type}>`])); }
      else body = await request.json();
      calls.push({ method, body });
      if (method === 'getFile') return Response.json({ ok: true, result: { file_id: body.file_id, file_path: `${body.file_id}`, file_size: 1000 } });
      if (method === 'sendVoice') return Response.json({ ok: true, result: { message_id: ++messageId, voice: { file_id: `voice-file-${messageId}` } } });
      if (method === 'sendPoll') return Response.json({ ok: true, result: { message_id: ++messageId, poll: { id: `poll-${pollId++}` } } });
      return Response.json({ ok: true, result: { message_id: ++messageId } });
    }
    if (url.pathname.startsWith('/functions/v1/telegram-link')) {
      const body = await request.json().catch(() => ({}));
      if (request.headers.get('authorization') !== 'Bearer service-role-key') return Response.json({ error: 'Unauthorized' }, { status: 401 });
      if (body.action === 'status') { const id = chats.get(String(body.chat_id)); return Response.json({ linked: !!id, user: id ? { id, name: 'Learner' } : null }); }
      if (body.action === 'validate') {
        if (body.token === 'a'.repeat(64)) {
          // telegram-link sets users.telegram_chat_id; the memory repository reads the same user record.
          chats.set(String(body.chat_id), ID.outsider);
          USERS['tok-outsider'].telegramChatId = String(body.chat_id);
          return Response.json({ ok: true, user_id: ID.outsider, name: 'Outsider', confirmation_required: false });
        }
        return Response.json({ error: 'Invalid link token' }, { status: 404 });
      }
      return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
    if (url.pathname.startsWith('/functions/v1/schood-ai/')) {
      const path = url.pathname.replace('/functions/v1/schood-ai/', '');
      const body = await request.json().catch(() => undefined);
      // The cron calls system routes with the secret alone; everything else acts for a linked person.
      if (!request.headers.get('x-schood-user-id')) return f.call(request.method, path, { token: null, origin: null, headers: { 'x-schood-service-secret': request.headers.get('x-schood-service-secret') ?? '' }, ...(body === undefined ? {} : { body }) });
      return f.worker(path, request.method, request.headers.get('x-schood-user-id') ?? '', request.headers.get('x-schood-telegram-chat-id') ?? '', body, request.headers.get('x-schood-service-secret') ?? '');
    }
    return new Response('not found', { status: 404 });
  }
  const env = {
    APP_URL: APP, SUPABASE_URL: SUPABASE, SUPABASE_ANON_KEY: 'anon-public-key', SCHOOD_AI_SERVICE_SECRET: SECRET,
    ...Object.fromEntries(Object.entries(BOT).flatMap(([pack, bot]) => [[`COACH_BOT_TOKEN_${pack.toUpperCase()}`, bot.token], [`COACH_WEBHOOK_SECRET_${pack.toUpperCase()}`, bot.secret]])),
  };
  const worker = createWorker({ env, packs: runtime.packs, fetch: backend, now });

  const send = async (pack: PackId, update: Record<string, unknown>, secret = BOT[pack].secret) => {
    const response = await worker.fetch(new Request(`https://coach-bots.schood.online/tg/${pack}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify({ update_id: updateId++, ...update }) }));
    await f.settle();
    return response;
  };
  const from = (chat: string, language = 'en') => ({ id: Number(chat), is_bot: false, first_name: 'Dilnoza', language_code: language });
  const date = () => Math.floor(now().getTime() / 1000);
  const user = {
    text: (pack: PackId, chat: string, text: string, language = 'en') => send(pack, { message: { message_id: ++messageId, date: date(), chat: { id: Number(chat), type: 'private' }, from: from(chat, language), text } }),
    voice: (pack: PackId, chat: string, said: string, duration = 40) => {
      const fileId = `file-${messageId + 1}`;
      files.set(fileId, said);
      return send(pack, { message: { message_id: ++messageId, date: date(), chat: { id: Number(chat), type: 'private' }, from: from(chat), voice: { file_id: fileId, file_unique_id: `u-${fileId}`, duration, mime_type: 'audio/ogg' } } });
    },
    photo: (pack: PackId, chat: string) => { const fileId = `photo-${messageId + 1}`; files.set(fileId, 'jpeg-bytes'); return send(pack, { message: { message_id: ++messageId, date: date(), chat: { id: Number(chat), type: 'private' }, from: from(chat), photo: [{ file_id: fileId, file_unique_id: `u-${fileId}`, width: 800, height: 600, file_size: 2000 }] } }); },
    tap: (pack: PackId, chat: string, data: string, message = 1) => send(pack, { callback_query: { id: `cb-${messageId}`, from: from(chat), data, message: { message_id: message, date: date(), chat: { id: Number(chat), type: 'private' } } } }),
    poll: (pack: PackId, chat: string, id: string, option: number) => send(pack, { poll_answer: { poll_id: id, user: from(chat), option_ids: [option] } }),
  };
  /** Telegram calls since the last look. */
  let seen = 0;
  const fresh = () => { const out = calls.slice(seen); seen = calls.length; return out; };
  const texts = (list: TelegramCall[]) => list.filter((call) => call.method === 'sendMessage' || call.method === 'editMessageText').map((call) => String(call.body.text));
  const buttons = (list: TelegramCall[]) => list.flatMap((call) => ((call.body.reply_markup as { inline_keyboard?: { text: string; callback_data?: string; url?: string; web_app?: { url: string } }[][] } | undefined)?.inline_keyboard ?? []).flat());
  const data = (list: TelegramCall[], pattern: RegExp) => buttons(list).map((button) => button.callback_data ?? '').find((value) => pattern.test(value));

  /** Mini App data as Telegram signs it: Ed25519 for third parties, then the bot-token HMAC over every field. */
  async function initData(pack: PackId, telegramUserId: string) {
    const values = { auth_date: String(date()), query_id: 'AAE-test', user: JSON.stringify({ id: Number(telegramUserId), first_name: 'Dilnoza' }) };
    const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', keyPair.privateKey, new TextEncoder().encode(dataCheckString(new URLSearchParams(values).toString(), BOT[pack].id))));
    const encoded = btoa(String.fromCharCode(...signature)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return signTelegramInitDataForTest({ ...values, signature: encoded }, BOT[pack].token);
  }
  /** Undoes the link made by the fake telegram-link (USERS is shared by every test). */
  const restore = () => { USERS['tok-outsider'].telegramChatId = null; };
  /** The public certificate check, as a visitor with no session. */
  const verify = (code: string) => f.json('GET', 'coach/verify', { token: null, query: { code } });
  return { f, now, advance, restore, knobs, runtime, coach, worker, user, calls, fresh, texts, buttons, data, initData, verify, chats, send };
}


export type CoachStack = Awaited<ReturnType<typeof coachStack>>;

/**
 * Takes a pack's placement test in the bot: right answers and "Yes" (strong), or
 * wrong answers and "Not yet" (beginner). Returns the Telegram calls of the last step.
 */
export async function takePlacement(s: CoachStack, pack: PackId, chat: string, language: string, level: 'beginner' | 'strong'): Promise<TelegramCall[]> {
  await s.user.text(pack, chat, '/start', language);
  await s.user.tap(pack, chat, 'm:test');
  const items = s.runtime.packs.get(pack)!.diagnostic.items;
  let out = s.fresh(), tap = s.data(out, /^dg:/), guard = 0;
  while (tap && guard++ < 40) {
    const index = Number(tap.split(':')[2]), item = items[index];
    const choice = item.kind === 'can_do' ? (level === 'beginner' ? 2 : 0) : level === 'beginner' ? ((item.answer ?? 0) + 1) % (item.options?.length ?? 2) : item.answer ?? 0;
    await s.user.tap(pack, chat, tap.replace(/^(dg:[ure]:\d+:)\d/, `$1${choice}`));
    out = s.fresh();
    tap = s.data(out, /^dg:/);
  }
  return out;
}

/** The flow the person is in, as stored. */
export async function flowOf(s: CoachStack, userId: string, pack: PackId): Promise<Record<string, unknown> & { flow: string }> {
  return (await s.coach.store.enrollment(userId, pack))!.state.current as Record<string, unknown> & { flow: string };
}
