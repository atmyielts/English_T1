import { signTelegramInitDataForTest } from '../../_shared/telegram-init-data.ts';
import { loadPacks } from '../../../../packages/coach-packs/src/registry.ts';
import type { Registry } from '../../../../packages/ai-core/src/mod.ts';
import { createWorker } from '../../../../workers/schood-coach-bots/src/worker.ts';
import { createGateHandler } from '../../schood-coach-gate/handler.ts';
import { completion, fixture, ID, SECRET, START, USERS } from '../fixture.test.ts';
import { MODULES } from '../handler.ts';
import { SEED_REGISTRY } from '../memory-repository.ts';
import { createCoachModule } from './mod.ts';
import type { CoachRuntime } from './runtime.ts';
import { createMemoryCoachStore } from './store-memory.ts';
import { dataCheckString } from './telegram-auth.ts';

// The whole coach stack for tests: Telegram (fake) → the real worker → the real
// schood-ai handler with the coach module over the memory stores, the real gate,
// and a fake model that answers each coach task in its own shape. Speech to text
// reads the "audio" as the words it stands for, so a test controls what was said.

export const SUPABASE = 'https://coach-test.supabase.co';
export const APP = 'https://ai.schood.online';
export const BOT = { ielts: { id: '7000000001', token: '7000000001:IELTS-TEST-TOKEN-0123456789abcdef', secret: 'hook-secret-ielts-0123' }, speaking: { id: '7000000002', token: '7000000002:SPEAK-TEST-TOKEN-0123456789abcdef', secret: 'hook-secret-speaking-01' } };
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

export interface ModelKnobs { score: number | null; cefr: number; corrections: boolean; failNext: boolean; prompts: string[] }

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
      for (const key of Object.keys(state)) if (typeof state[key] === 'number') state[key] = Math.min(10, state[key] + 1);
      const goal = /working on \(mark the ids already achieved in what they said so far\): ([a-z_]+) —/.exec(system)?.[1];
      const strict = system.includes('strict mode');
      return completion(JSON.stringify({
        reply: 'Of course. Could you tell me a little more about that?', state, goals_met: goal ? [goal] : [], end: false,
        corrections: strict || knobs.corrections ? [{ quote: firstWords(said, 3), better: 'A more natural way to say it', explanation: 'Shorter and more natural.', tag: 'verb_tense' }] : [],
      }));
    }
    if (system.includes('Transcribe the handwritten')) return completion(JSON.stringify({ text: ESSAY, legible: true }));
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
      const goals = [...(/Goals: (.*)\.$/m.exec(system)?.[1] ?? '').matchAll(/([a-z_]+) —/g)].map((match) => ({ id: match[1], met: true, quote: firstWords(said, 4) }));
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
    config: { appUrl: APP, bots: { ielts: { id: BOT.ielts.id, username: 'SchoodIeltsCoachBot' }, speaking: { id: BOT.speaking.id, username: 'SchoodSpeakingBot' } }, passProducts: { B2: [PASS_PRODUCT] }, fairUseCredits: 1200, telegramPublicKey: publicHex },
    mintSession: (userId) => Promise.resolve({ access_token: `minted-${userId}`, refresh_token: 'refresh', expires_at: 2_000_000_000 }),
  };
  const f = fixture({ registry: options.speech === false ? SEED_REGISTRY : SPEECH_REGISTRY, modules: [...MODULES.filter((module) => module.area !== 'coach'), createCoachModule(runtime)] });
  const advance = (ms: number) => { f.advance(ms); current = new Date(current.getTime() + ms); };
  f.setProvider(fakeModel(knobs));
  const gate = createGateHandler({ secret: SECRET, deps: { store: coach.store, packs: runtime.packs, config: runtime.config, now, notify: (userId, channel, take) => f.memory.repository.notify(userId, channel, take), nameOf: () => Promise.resolve('Dilnoza') } });

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
      if (request.headers.get('x-worker-secret') !== 'internal-secret-0123456789') return Response.json({ error: 'Unauthorized' }, { status: 401 });
      if (body.action === 'status') { const id = chats.get(String(body.chat_id)); return Response.json({ linked: !!id, user: id ? { id, name: 'Learner' } : null }); }
      if (body.action === 'validate') {
        if (body.token === 'a'.repeat(64)) { chats.set(String(body.chat_id), ID.outsider); return Response.json({ ok: true, user_id: ID.outsider, name: 'Outsider', confirmation_required: false }); }
        return Response.json({ error: 'Invalid link token' }, { status: 404 });
      }
      return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
    if (url.pathname.startsWith('/functions/v1/schood-coach-gate/')) return gate(request);
    if (url.pathname.startsWith('/functions/v1/schood-ai/')) {
      const path = url.pathname.replace('/functions/v1/schood-ai/', '');
      const body = await request.json().catch(() => undefined);
      return f.worker(path, request.method, request.headers.get('x-schood-user-id') ?? '', request.headers.get('x-schood-telegram-chat-id') ?? '', body, request.headers.get('x-schood-service-secret') ?? '');
    }
    return new Response('not found', { status: 404 });
  }
  const env = {
    APP_URL: APP, SUPABASE_URL: SUPABASE, SUPABASE_ANON_KEY: 'anon-public-key', SCHOOD_AI_SERVICE_SECRET: SECRET, TELEGRAM_INTERNAL_SECRET: 'internal-secret-0123456789',
    COACH_BOT_TOKEN_IELTS: BOT.ielts.token, COACH_WEBHOOK_SECRET_IELTS: BOT.ielts.secret, COACH_BOT_TOKEN_SPEAKING: BOT.speaking.token, COACH_WEBHOOK_SECRET_SPEAKING: BOT.speaking.secret,
  };
  const worker = createWorker({ env, packs: runtime.packs, fetch: backend, now });

  const send = async (pack: 'ielts' | 'speaking', update: Record<string, unknown>, secret = BOT[pack].secret) => {
    const response = await worker.fetch(new Request(`https://coach-bots.schood.online/tg/${pack}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify({ update_id: updateId++, ...update }) }));
    await f.settle();
    return response;
  };
  const from = (chat: string, language = 'en') => ({ id: Number(chat), is_bot: false, first_name: 'Dilnoza', language_code: language });
  const date = () => Math.floor(now().getTime() / 1000);
  const user = {
    text: (pack: 'ielts' | 'speaking', chat: string, text: string, language = 'en') => send(pack, { message: { message_id: ++messageId, date: date(), chat: { id: Number(chat), type: 'private' }, from: from(chat, language), text } }),
    voice: (pack: 'ielts' | 'speaking', chat: string, said: string, duration = 40) => {
      const fileId = `file-${messageId + 1}`;
      files.set(fileId, said);
      return send(pack, { message: { message_id: ++messageId, date: date(), chat: { id: Number(chat), type: 'private' }, from: from(chat), voice: { file_id: fileId, file_unique_id: `u-${fileId}`, duration, mime_type: 'audio/ogg' } } });
    },
    photo: (pack: 'ielts' | 'speaking', chat: string) => { const fileId = `photo-${messageId + 1}`; files.set(fileId, 'jpeg-bytes'); return send(pack, { message: { message_id: ++messageId, date: date(), chat: { id: Number(chat), type: 'private' }, from: from(chat), photo: [{ file_id: fileId, file_unique_id: `u-${fileId}`, width: 800, height: 600, file_size: 2000 }] } }); },
    tap: (pack: 'ielts' | 'speaking', chat: string, data: string, message = 1) => send(pack, { callback_query: { id: `cb-${messageId}`, from: from(chat), data, message: { message_id: message, date: date(), chat: { id: Number(chat), type: 'private' } } } }),
    poll: (pack: 'ielts' | 'speaking', chat: string, id: string, option: number) => send(pack, { poll_answer: { poll_id: id, user: from(chat), option_ids: [option] } }),
  };
  /** Telegram calls since the last look. */
  let seen = 0;
  const fresh = () => { const out = calls.slice(seen); seen = calls.length; return out; };
  const texts = (list: TelegramCall[]) => list.filter((call) => call.method === 'sendMessage' || call.method === 'editMessageText').map((call) => String(call.body.text));
  const buttons = (list: TelegramCall[]) => list.flatMap((call) => ((call.body.reply_markup as { inline_keyboard?: { text: string; callback_data?: string; url?: string; web_app?: { url: string } }[][] } | undefined)?.inline_keyboard ?? []).flat());
  const data = (list: TelegramCall[], pattern: RegExp) => buttons(list).map((button) => button.callback_data ?? '').find((value) => pattern.test(value));

  /** Mini App data as Telegram signs it: Ed25519 for third parties, then the bot-token HMAC over every field. */
  async function initData(pack: 'ielts' | 'speaking', telegramUserId: string) {
    const values = { auth_date: String(date()), query_id: 'AAE-test', user: JSON.stringify({ id: Number(telegramUserId), first_name: 'Dilnoza' }) };
    const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', keyPair.privateKey, new TextEncoder().encode(dataCheckString(new URLSearchParams(values).toString(), BOT[pack].id))));
    const encoded = btoa(String.fromCharCode(...signature)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return signTelegramInitDataForTest({ ...values, signature: encoded }, BOT[pack].token);
  }
  return { f, now, advance, knobs, runtime, coach, worker, user, calls, fresh, texts, buttons, data, initData, gate, chats, send };
}

