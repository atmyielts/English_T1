import type { RegistryModel, RegistryProvider } from '../../../packages/ai-core/src/mod.ts';
import { equal, ok } from './fixture.test.ts';
import { anthropic } from './providers/anthropic.ts';
import { cloudflareWorkersAi, whisperRequest, whisperTranscript } from './providers/cloudflare_workers_ai.ts';
import { googleGemini } from './providers/google_gemini.ts';
import { openaiCompatible } from './providers/openai_compatible.ts';
import { ProviderError, type ChatInput, type ProviderTarget } from './providers/types.ts';

const model = (modelId: string, extra: Partial<RegistryModel> = {}): RegistryModel => ({ key: modelId, providerKey: 'p', modelId, displayName: modelId, capabilities: ['chat', 'stream', 'json'], contextWindow: null, maxOutput: 1024, inputUsdPerMTok: 0, outputUsdPerMTok: 0, noTraining: false, enabled: true, ...extra });
function target(adapter: RegistryProvider['adapter'], baseUrl: string, respond: (request: Request) => Response, extra: Partial<RegistryModel> = {}, config: Record<string, string> = {}) {
  const seen: Request[] = [];
  const t: ProviderTarget = {
    provider: { key: 'p', adapter, displayName: 'P', baseUrl, apiKeyEnv: 'X', headers: { 'X-Title': 'Schood AI' }, config, enabled: true },
    model: model(extra.modelId ?? 'm-1', extra), apiKey: 'secret-key',
    fetch: (input, init) => { const request = new Request(input, init); seen.push(request.clone()); return Promise.resolve(respond(request)); },
  };
  return { t, seen };
}
const input = (extra: Partial<ChatInput> = {}): ChatInput => ({ system: 'Rules.', messages: [{ role: 'user', content: 'Hi' }], json: null, maxTokens: 300, temperature: 0.2, ...extra });
const sse = (lines: string[]) => new Response(lines.map((line) => `${line}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const never = new AbortController().signal;
async function code(run: () => Promise<unknown>) {
  try { await run(); return 'resolved'; } catch (cause) { return cause instanceof ProviderError ? cause.code : `other:${cause}`; }
}

Deno.test('openai-compatible: wire shape, strict schema, images, usage, stream and error codes', async () => {
  const { t, seen } = target('openai_compatible', 'https://openrouter.ai/api/v1/', () => json({ choices: [{ message: { content: [{ type: 'text', text: 'Hello' }] } }], usage: { prompt_tokens: 7, completion_tokens: 2 } }), { capabilities: ['chat', 'json_schema'] });
  const out = await openaiCompatible.chat(t, input({ json: { schema: { type: 'object' }, strict: true }, messages: [{ role: 'user', content: [{ type: 'text', text: 'Read this' }, { type: 'image', url: 'https://x.example/a.png' }] }] }), never);
  equal(out, { text: 'Hello', inputTokens: 7, outputTokens: 2 });
  const body = await seen[0].json();
  equal([seen[0].url, seen[0].headers.get('authorization'), seen[0].headers.get('x-title')], ['https://openrouter.ai/api/v1/chat/completions', 'Bearer secret-key', 'Schood AI']);
  equal(body.messages, [{ role: 'system', content: 'Rules.' }, { role: 'user', content: [{ type: 'text', text: 'Read this' }, { type: 'image_url', image_url: { url: 'https://x.example/a.png' } }] }]);
  equal(body.response_format, { type: 'json_schema', json_schema: { name: 'result', schema: { type: 'object' }, strict: true } });
  const streamed = target('openai_compatible', 'https://api.groq.com/openai/v1', () => sse([': OPENROUTER PROCESSING', 'data: {"choices":[{"delta":{"content":"A"}}]}', 'data: {"choices":[{"delta":{"content":"B"}}]}', 'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}', 'data: [DONE]']));
  const parts: string[] = [];
  equal(await openaiCompatible.stream(streamed.t, input(), never, (piece) => parts.push(piece)), { text: 'AB', inputTokens: 5, outputTokens: 2 });
  equal(parts, ['A', 'B']);
  for (const [status, expected] of [[401, 'auth'], [403, 'auth'], [404, 'not_found'], [400, 'bad_request'], [429, 'rate_limited'], [502, 'server_error']] as const) {
    equal(await code(() => openaiCompatible.chat(target('openai_compatible', 'https://a.example', () => json({ error: 'learner text here' }, status)).t, input(), never)), expected, `HTTP ${status}`);
  }
  equal(await code(() => openaiCompatible.chat(target('openai_compatible', 'https://a.example', () => json({ choices: [{ message: { content: '  ' } }] })).t, input(), never)), 'invalid_response', 'empty answers fail');
  equal(await code(() => openaiCompatible.stream(target('openai_compatible', 'https://a.example', () => sse(['data: {"error":{"message":"x"}}'])).t, input(), never, () => {})), 'server_error', 'in-stream errors');
  equal(await code(() => openaiCompatible.chat({ ...t, fetch: () => Promise.reject(new TypeError('connection reset')) }, input(), never)), 'network');
});

Deno.test('anthropic: headers, system, merged turns, image sources, stream usage', async () => {
  const { t, seen } = target('anthropic', 'https://api.anthropic.com/v1', () => json({ content: [{ type: 'text', text: 'Hi' }], usage: { input_tokens: 9, output_tokens: 1 } }));
  await anthropic.chat(t, input({ temperature: 1.5, messages: [{ role: 'user', content: 'one' }, { role: 'user', content: [{ type: 'image', url: 'data:image/png;base64,AAAA' }, { type: 'image', url: 'https://x.example/b.jpg' }] }, { role: 'assistant', content: 'two' }] }), never);
  const body = await seen[0].json();
  equal([seen[0].headers.get('x-api-key'), seen[0].headers.get('anthropic-version'), seen[0].headers.get('authorization')], ['secret-key', '2023-06-01', null]);
  equal([body.system, body.max_tokens, body.temperature, body.messages.length, body.messages[0].content.length], ['Rules.', 300, 1, 2, 3], 'consecutive user turns merge; temperature within range');
  equal(body.messages[0].content.slice(1), [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }, { type: 'image', source: { type: 'url', url: 'https://x.example/b.jpg' } }]);
  const assistantFirst = target('anthropic', 'https://api.anthropic.com/v1', () => json({ content: [{ type: 'text', text: 'ok' }] }));
  await anthropic.chat(assistantFirst.t, input({ messages: [{ role: 'assistant', content: 'earlier' }, { role: 'user', content: 'now' }] }), never);
  equal((await assistantFirst.seen[0].json()).messages[0].role, 'user', 'the first turn is always the person');
  const streamed = target('anthropic', 'https://api.anthropic.com/v1', () => sse([
    'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":11}}}', 'event: ping\ndata: {"type":"ping"}',
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Sa"}}', 'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lom"}}',
    'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":4}}', 'event: message_stop\ndata: {"type":"message_stop"}',
  ]));
  equal(await anthropic.stream(streamed.t, input(), never, () => {}), { text: 'Salom', inputTokens: 11, outputTokens: 4 });
  equal(await code(() => anthropic.stream(target('anthropic', 'https://api.anthropic.com/v1', () => sse(['event: error\ndata: {"type":"error","error":{"type":"overloaded_error"}}'])).t, input(), never, () => {})), 'rate_limited');
});

Deno.test('gemini: key in a header never the URL, roles, inline images only, JSON mime, stream', async () => {
  const { t, seen } = target('google_gemini', 'https://generativelanguage.googleapis.com/v1beta', () => json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 3 } }), { modelId: 'gemini-2.5-flash' });
  equal(await googleGemini.chat(t, input({ json: { schema: null, strict: false }, messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: [{ type: 'image', url: 'data:image/jpeg;base64,BBBB' }] }] }), never), { text: '{"ok":true}', inputTokens: 4, outputTokens: 3 });
  const body = await seen[0].json();
  equal([seen[0].url, seen[0].headers.get('x-goog-api-key')], ['https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', 'secret-key']);
  ok(!seen[0].url.includes('secret-key'), 'no key in the URL');
  equal([body.contents.map((c: { role: string }) => c.role), body.contents[2].parts[0], body.generationConfig.responseMimeType, body.systemInstruction.parts[0].text], [['user', 'model', 'user'], { inlineData: { mimeType: 'image/jpeg', data: 'BBBB' } }, 'application/json', 'Rules.']);
  equal(await code(() => googleGemini.chat(t, input({ messages: [{ role: 'user', content: [{ type: 'image', url: 'https://x.example/c.png' }] }] }), never)), 'unsupported', 'remote images fall back to another model');
  equal(await code(() => googleGemini.chat(target('google_gemini', 'https://g.example', () => json({ candidates: [{ finishReason: 'SAFETY' }] })).t, input(), never)), 'invalid_response', 'a safety block is a failed answer');
  const streamed = target('google_gemini', 'https://g.example/v1beta', () => sse(['data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}', 'data: {"candidates":[{"content":{"parts":[{"text":"lo"}]}}],"usageMetadata":{"promptTokenCount":3,"candidatesTokenCount":2}}']));
  equal(await googleGemini.stream(streamed.t, input(), never, () => {}), { text: 'Hello', inputTokens: 3, outputTokens: 2 });
  ok(streamed.seen[0].url.endsWith(':streamGenerateContent?alt=sse'), 'SSE stream endpoint');
});

Deno.test('Cloudflare Workers AI: OpenAI-compatible chat under the account, Whisper both shapes', async () => {
  const account = '0123456789abcdef0123456789abcdef';
  const { t, seen } = target('cloudflare_workers_ai', 'https://api.cloudflare.com/client/v4', () => json({ choices: [{ message: { content: 'Salom' } }], usage: { prompt_tokens: 3, completion_tokens: 1 } }), { modelId: '@cf/meta/llama-3.1-8b-instruct' }, { account_id: account });
  equal((await cloudflareWorkersAi.chat(t, input(), never)).text, 'Salom');
  equal([seen[0].url, (await seen[0].json()).model], [`https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1/chat/completions`, '@cf/meta/llama-3.1-8b-instruct']);
  equal(await code(() => cloudflareWorkersAi.chat(target('cloudflare_workers_ai', 'https://api.cloudflare.com/client/v4', () => json({})).t, input(), never)), 'bad_request', 'no account id, no call');
  const audio = new Uint8Array([1, 2, 3, 4]);
  const turbo = whisperRequest('@cf/openai/whisper-large-v3-turbo', audio, 'audio/ogg', 'uz');
  equal([turbo.contentType, JSON.parse(turbo.body as string)], ['application/json', { audio: 'AQIDBA==', task: 'transcribe', language: 'uz' }]);
  const raw = whisperRequest('@cf/openai/whisper', audio, 'audio/ogg', null);
  equal([raw.contentType, raw.body === audio], ['audio/ogg', true], 'the original Whisper takes raw bytes');
  equal(whisperTranscript({ success: true, result: { text: 'Bir ikki', word_count: 2, words: [{ word: 'Bir', start: 0, end: 0.4 }, { word: 'ikki', start: 0.5, end: 0.9 }] } }), { text: 'Bir ikki', language: null, durationSec: 0.9, segments: [], words: [{ word: 'Bir', start: 0, end: 0.4 }, { word: 'ikki', start: 0.5, end: 0.9 }] });
  equal(await code(async () => whisperTranscript({ success: false, errors: [{ message: 'quota' }] })), 'server_error');
  const chatModel = target('cloudflare_workers_ai', 'https://api.cloudflare.com/client/v4', () => json({}), { modelId: '@cf/meta/llama-3.1-8b-instruct' }, { account_id: account });
  equal(await code(() => cloudflareWorkersAi.transcribe!(chatModel.t, { audio, mime: 'audio/ogg' }, never)), 'unsupported', 'only Whisper models transcribe');
});
