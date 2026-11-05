import { s, type Registry, type RegistryModel, type RegistryRoute } from '../../../packages/ai-core/src/mod.ts';
import { completion, equal, ok, streamOf } from './fixture.test.ts';
import { CircuitBreaker, createGateway, type GatewayDeps, type GatewayRequest } from './gateway.ts';
import { ProviderError } from './providers/types.ts';
import type { CallRecord, ServiceSettings } from './types.ts';

const SETTINGS: ServiceSettings = { aiEnabled: true, features: {}, globalDailyCalls: 1000, userDailyCalls: 100, workspaceDailyCalls: 1000, globalDailyUsd: null };
const model = (key: string, extra: Partial<RegistryModel> = {}): RegistryModel => ({ key, providerKey: 'openrouter', modelId: key, displayName: key, capabilities: ['chat', 'stream', 'json'], contextWindow: null, maxOutput: 2048, inputUsdPerMTok: 1, outputUsdPerMTok: 2, noTraining: false, enabled: true, ...extra });
const route = (key: string, modelKeys: string[], extra: Partial<RegistryRoute> = {}): RegistryRoute => ({ key, modelKeys, requiredCapabilities: [], requireNoTraining: false, maxOutputTokens: null, temperature: null, enabled: true, ...extra });
const REGISTRY: Registry = {
  providers: [
    { key: 'openrouter', adapter: 'openai_compatible', displayName: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', apiKeyEnv: 'OPENROUTER_API_KEY', headers: { 'X-Title': 'Schood AI' }, config: {}, enabled: true },
    { key: 'groq', adapter: 'openai_compatible', displayName: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', apiKeyEnv: 'GROQ_API_KEY', headers: {}, config: {}, enabled: true },
    { key: 'workers-ai', adapter: 'cloudflare_workers_ai', displayName: 'Workers AI', baseUrl: 'https://api.cloudflare.com/client/v4', apiKeyEnv: 'CLOUDFLARE_AI_API_TOKEN', headers: {}, config: { account_id: '0123456789abcdef0123456789abcdef' }, enabled: true },
  ],
  models: [
    model('primary'), model('backup'), model('vision', { capabilities: ['chat', 'vision', 'json'] }), model('safe', { noTraining: true }),
    model('groq/whisper', { providerKey: 'groq', modelId: 'whisper-large-v3', capabilities: ['stt'] }),
    model('groq/tts', { providerKey: 'groq', modelId: 'playai-tts', capabilities: ['tts'] }),
    model('cf/whisper', { providerKey: 'workers-ai', modelId: '@cf/openai/whisper-large-v3-turbo', capabilities: ['stt'] }),
  ],
  routes: [route('default', ['primary', 'backup']), route('tutor', ['safe', 'primary'], { requireNoTraining: true }), route('tier.vision', ['primary', 'vision']), route('stt', ['groq/whisper', 'cf/whisper']), route('tts', ['groq/tts'])],
};

function setup(options: { settings?: Partial<ServiceSettings>; env?: Record<string, string>; fetch?: (request: Request) => Promise<Response> | Response; caps?: 'global' | null; timeouts?: GatewayDeps['timeouts']; ceiling?: number } = {}) {
  let clock = new Date('2026-11-02T06:00:00Z');
  const rows: CallRecord[] = [], requests: Request[] = [], takes: unknown[] = [];
  const breaker = new CircuitBreaker(3, 60_000);
  const gateway = createGateway({
    registry: () => Promise.resolve(structuredClone(REGISTRY)),
    settings: () => Promise.resolve({ ...SETTINGS, ...options.settings }),
    takeCall: (input) => { takes.push(input); return Promise.resolve(options.caps ? { ok: false, scope: options.caps } : { ok: true }); },
    record: (batch) => rows.push(...batch),
    env: (name) => ({ OPENROUTER_API_KEY: 'sk-or', GROQ_API_KEY: 'gsk', CLOUDFLARE_AI_API_TOKEN: 'cf-token', ...options.env })[name],
    fetch: (input, init) => { const request = new Request(input, init); requests.push(request.clone()); return Promise.resolve(options.fetch ? options.fetch(request) : completion('ok')); },
    now: () => clock,
    breaker,
    timeouts: options.timeouts,
    globalCeiling: options.ceiling ?? null,
  });
  return { gateway, rows, requests, takes, breaker, advance: (ms: number) => { clock = new Date(clock.getTime() + ms); } };
}
const ask = (extra: Partial<GatewayRequest> = {}): GatewayRequest => ({ feature: 'lesson.plan', messages: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Plan a lesson.' }], userId: 'u1', workspaceId: 'w1', credits: 5, chargeId: 'c1', ...extra });
const modelOf = async (request: Request) => (await request.clone().json()).model;

Deno.test('falls back on 429 and 5xx, records every attempt, reports credits once and costs tokens', async () => {
  const t = setup({ fetch: async (request) => (await modelOf(request)) === 'primary' ? new Response('busy', { status: 429 }) : completion('A plan', { prompt_tokens: 2000, completion_tokens: 1000 }) });
  const result = await t.gateway.text(ask());
  equal([result.status, result.status === 'ok' && result.data, result.status === 'ok' && result.modelKey], ['ok', 'A plan', 'backup']);
  equal(t.rows.map((row) => [row.modelKey, row.status, row.errorCode, row.costUsd, row.credits]), [['primary', 'rate_limited', 'rate_limited', 0, 0], ['backup', 'ok', null, 0.004, 5]]);
  ok(t.rows.every((row) => row.callId === t.rows[0].callId && row.routeKey === 'default'), 'one call id and route for all attempts');
  equal(t.takes.length, 1, 'one cap slot per call, not per attempt');
  const sent = await t.requests[1].json();
  equal([sent.messages[0].role, sent.messages[0].content, sent.max_tokens, t.requests[1].headers.get('authorization'), t.requests[1].headers.get('x-title')], ['system', 'Be brief.', 1500, 'Bearer sk-or', 'Schood AI']);
  const down = setup({ fetch: () => new Response('down', { status: 500 }) });
  const failed = await down.gateway.text(ask());
  equal([failed.status, failed.status === 'failed' && failed.code, down.rows.length], ['failed', 'server_error', 2]);
});

Deno.test('the circuit breaker skips a failing model, then lets one trial through', async () => {
  const t = setup({ fetch: async (request) => (await modelOf(request)) === 'primary' ? new Response('', { status: 503 }) : completion('ok') });
  for (let i = 0; i < 3; i++) await t.gateway.text(ask());
  const before = t.requests.length;
  await t.gateway.text(ask());
  equal(t.requests.slice(before).length, 1, 'the open breaker skips primary');
  equal(await modelOf(t.requests.at(-1)!), 'backup');
  t.advance(61_000);
  await t.gateway.text(ask());
  equal(await modelOf(t.requests.at(-2)!), 'primary', 'after the pause one trial reaches primary');
  t.breaker.success('primary');
  ok(t.breaker.healthy('primary', Date.now()), 'success closes it');
});

Deno.test('caps, switches, policy, capabilities and keys refuse before any provider call', async () => {
  const capped = setup({ caps: 'global' });
  equal(await capped.gateway.text(ask()), { status: 'capped', scope: 'global', callId: capped.rows[0].callId });
  equal([capped.requests.length, capped.rows[0].status, capped.rows[0].errorCode], [0, 'capped', 'cap_global']);
  const ceiling = setup({ ceiling: 10 });
  await ceiling.gateway.text(ask());
  equal((ceiling.takes[0] as { globalCap: number }).globalCap, 10, 'SCHOOD_AI_GLOBAL_DAILY_CALLS caps the settings row');
  equal((await setup({ settings: { aiEnabled: false } }).gateway.text(ask())).status, 'disabled');
  const switched = setup({ settings: { features: { lesson: false } } });
  const off = await switched.gateway.text(ask());
  equal([off.status, off.status === 'disabled' && off.scope], ['disabled', 'feature']);
  equal((await setup().gateway.text(ask({ workspaceSwitches: { lesson: false } }))).status, 'disabled', 'workspace switch');
  // A children-safe route keeps only no-training models.
  const tutor = setup();
  await tutor.gateway.text(ask({ feature: 'tutor.reply' }));
  equal(await modelOf(tutor.requests[0]), 'safe');
  const strict = setup({ fetch: () => new Response('', { status: 500 }) });
  await strict.gateway.text(ask({ feature: 'tutor.reply' }));
  equal(strict.requests.length, 1, 'a failing safe model never falls back to a training model');
  // Images need a vision model; a code requirement narrows further.
  const vision = setup();
  await vision.gateway.text(ask({ feature: 'photo.explain', tier: 'vision', messages: [{ role: 'user', content: [{ type: 'text', text: 'What is this?' }, { type: 'image', url: 'data:image/png;base64,iVBORw0KGgo=' }] }] }));
  equal(await modelOf(vision.requests[0]), 'vision');
  const narrow = await setup().gateway.text(ask({ requires: { capabilities: ['tts'] } }));
  equal([narrow.status, narrow.status === 'unavailable' && narrow.reason], ['unavailable', 'no_model'], 'a code requirement no model meets');
  const keyless = await setup({ env: { OPENROUTER_API_KEY: '' } }).gateway.text(ask());
  equal([keyless.status, keyless.status === 'unavailable' && keyless.reason], ['unavailable', 'no_key']);
  const huge = await setup().gateway.text(ask({ messages: [{ role: 'user', content: 'x'.repeat(200_001) }] }));
  equal([huge.status, huge.status === 'failed' && huge.code], ['failed', 'input_too_large']);
});

Deno.test('JSON: prose-wrapped answers parse, a wrong shape gets one repair turn, then fails', async () => {
  const schema = s.object({ title: s.string({ max: 40 }), minutes: s.number({ min: 1, max: 120, integer: true }) });
  const wrapped = setup({ fetch: () => completion('Sure! Here is the plan:\n```json\n{"title":"Travel","minutes":"45"}\n```') });
  const parsed = await wrapped.gateway.json(ask(), schema);
  equal(parsed.status === 'ok' && parsed.data, { title: 'Travel', minutes: 45 });
  const body = await wrapped.requests[0].json();
  equal(body.response_format, { type: 'json_object' }, 'json_object without strict schema support');
  ok(body.messages[0].content.includes('JSON Schema'), 'the shape is in the system prompt');
  let turn = 0;
  const repaired = setup({ fetch: () => completion(turn++ === 0 ? '{"title":"Travel"}' : '{"title":"Travel","minutes":30}') });
  const fixed = await repaired.gateway.json(ask(), schema);
  equal([fixed.status, repaired.rows.map((row) => row.status)], ['ok', ['invalid_output', 'ok']]);
  const repairTurn = (await repaired.requests[1].json()).messages;
  ok(repairTurn.at(-1).content.includes('minutes') && repairTurn.at(-2).role === 'assistant', 'the repair turn names the problem');
  const hopeless = setup({ fetch: () => completion('I cannot do JSON.') });
  const failed = await hopeless.gateway.json(ask(), schema);
  equal([failed.status, failed.status === 'failed' && failed.code, hopeless.requests.length], ['failed', 'invalid_output', 2]);
});

Deno.test('timeouts: a hanging provider times out and the next model answers', async () => {
  const hang = (request: Request) => new Promise<Response>((_, reject) => request.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  const t = setup({ timeouts: { attemptMs: 30, totalMs: 10_000 }, fetch: async (request) => (await modelOf(request)) === 'primary' ? hang(request) : completion('late but fine') });
  const result = await t.gateway.text(ask());
  equal([result.status, t.rows.map((row) => row.status)], ['ok', ['timeout', 'ok']]);
  const stalled = setup({ timeouts: { firstByteMs: 30, streamTotalMs: 10_000 }, fetch: (request) => new Response(new ReadableStream({ start(controller) { request.signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError'))); } }), { headers: { 'Content-Type': 'text/event-stream' } }) });
  const silent = await stalled.gateway.stream(ask(), () => {});
  equal([silent.status, stalled.rows.map((row) => row.status)], ['failed', ['timeout', 'timeout']], 'a stream that never starts times out on each model');
});

Deno.test('streaming: deltas in order, usage from the last chunk, no fallback once words were sent, stop is stopped', async () => {
  const t = setup({ fetch: () => streamOf(['Hel', 'lo'], { prompt_tokens: 1000, completion_tokens: 500 }) });
  const pieces: string[] = [];
  const result = await t.gateway.stream(ask(), (text) => pieces.push(text));
  equal([result.status, pieces, t.rows[0].costUsd, t.rows[0].streamed, t.rows[0].usageEstimated], ['ok', ['Hel', 'lo'], 0.002, true, false]);
  equal((await t.requests[0].json()).stream_options, { include_usage: true });
  const broken = setup({ fetch: () => new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Half' } }] })}\n\ndata: {"error":{"message":"provider died"}}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }) });
  const half = await broken.gateway.stream(ask(), () => {});
  equal([half.status, half.status === 'failed' && half.partial, broken.requests.length], ['failed', 'Half', 1], 'words already shown: no second model');
  ok(broken.rows[0].costUsd > 0, 'a broken-off stream is billed for what it sent');
  const stop = new AbortController();
  const stopping = setup({ fetch: (request) => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Wait' } }] })}\n\n`)); request.signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError'))); } }), { headers: { 'Content-Type': 'text/event-stream' } }) });
  const stopped = await stopping.gateway.stream(ask({ signal: stop.signal }), () => stop.abort());
  equal([stopped.status, stopped.status === 'stopped' && stopped.partial, stopping.rows[0].status], ['stopped', 'Wait', 'stopped']);
});

Deno.test('speech: stt with word timestamps, fallback to Workers AI, tts audio, never on chat routes', async () => {
  const audio = new Uint8Array(4000).fill(7);
  const t = setup({
    fetch: (request) => {
      if (request.url.includes('api.groq.com')) return new Response('', { status: 503 });
      return new Response(JSON.stringify({ success: true, result: { text: ' Hello world', transcription_info: { language: 'en', duration: 1.4 }, segments: [{ start: 0, end: 1.4, text: 'Hello world', words: [{ word: 'Hello', start: 0, end: 0.5 }, { word: 'world', start: 0.6, end: 1.4 }] }] } }), { headers: { 'Content-Type': 'application/json' } });
    },
  });
  const heard = await t.gateway.transcribe({ feature: 'speaking.turn', audio, mime: 'audio/ogg', language: 'en' });
  equal(heard.status === 'ok' && heard.data, { text: 'Hello world', language: 'en', durationSec: 1.4, segments: [{ start: 0, end: 1.4, text: 'Hello world' }], words: [{ word: 'Hello', start: 0, end: 0.5 }, { word: 'world', start: 0.6, end: 1.4 }] });
  equal(t.rows.map((row) => [row.modelKey, row.status, row.routeKey]), [['groq/whisper', 'failed', 'stt'], ['cf/whisper', 'ok', 'stt']]);
  ok(t.requests[1].url === 'https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/run/@cf/openai/whisper-large-v3-turbo', 'Workers AI run endpoint with the account id');
  equal([t.requests[1].headers.get('authorization'), typeof (await t.requests[1].json()).audio], ['Bearer cf-token', 'string']);
  const groq = setup({ fetch: (request) => request.url.endsWith('/audio/speech') ? new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/mpeg' } }) : new Response(JSON.stringify({ text: 'Salom', language: 'uz', duration: 0.8, words: [{ word: 'Salom', start: 0.1, end: 0.7 }] }), { headers: { 'Content-Type': 'application/json' } }) });
  const said = await groq.gateway.speak({ feature: 'speaking.turn', text: 'Hello', format: 'mp3' });
  equal(said.status === 'ok' && [...said.data.audio], [1, 2, 3]);
  equal(said.status === 'ok' && said.data.mime, 'audio/mpeg');
  const form = await (await groq.gateway.transcribe({ feature: 'speaking.turn', audio, mime: 'audio/ogg' }), groq.requests.at(-1)!.formData());
  equal([form.get('model'), form.get('response_format'), form.getAll('timestamp_granularities[]')], ['whisper-large-v3', 'verbose_json', ['word', 'segment']]);
  // Speech routes are separate: no stt route means unavailable, never a chat model.
  const bare = createGateway({
    registry: () => Promise.resolve({ ...REGISTRY, routes: [route('default', ['primary'])] }), settings: () => Promise.resolve(SETTINGS),
    takeCall: () => Promise.resolve({ ok: true }), record: () => {}, env: () => 'k', fetch: () => Promise.reject(new Error('no call')), now: () => new Date(),
  });
  const none = await bare.transcribe({ feature: 'speaking.turn', audio, mime: 'audio/ogg' });
  equal([none.status, none.status === 'unavailable' && none.reason], ['unavailable', 'no_route']);
});

Deno.test('the admin test console calls one chosen model outside routes and caps', async () => {
  const t = setup({ caps: 'global', fetch: () => completion('pong', { prompt_tokens: 10, completion_tokens: 2 }) });
  const result = await t.gateway.testModel('backup', 'ping');
  equal([result.status, result.status === 'ok' && result.modelKey, t.takes.length, t.rows[0].feature], ['ok', 'backup', 0, 'admin.test']);
  equal((await t.gateway.testModel('nope', 'ping')).status, 'unavailable');
  ok(new ProviderError('timeout').message === 'timeout', 'provider errors carry no provider text');
});
