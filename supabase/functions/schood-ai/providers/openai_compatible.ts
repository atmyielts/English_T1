import { AUDIO_MIME, joinUrl, parseEventJson, readBytes, readJson, seconds, send, sseEvents, tokens } from './http.ts';
import { ProviderError, type Adapter, type ChatInput, type ChatMessage, type ChatOutput, type ProviderTarget, type Transcript } from './types.ts';

// OpenAI's Chat Completions and audio protocol, which OpenAI, OpenRouter, Groq,
// DeepSeek, Mistral, Together, Fireworks, xAI, Azure OpenAI (by base URL) and
// self-hosted vLLM, Ollama or LM Studio servers all speak.

const auth = (target: ProviderTarget) => ({ Authorization: `Bearer ${target.apiKey}` });

function message(entry: ChatMessage): Record<string, unknown> {
  if (typeof entry.content === 'string') return { role: entry.role, content: entry.content };
  return {
    role: entry.role,
    content: entry.content.map((part) => (part.type === 'text' ? { type: 'text', text: part.text } : { type: 'image_url', image_url: { url: part.url } })),
  };
}

export function chatBody(target: ProviderTarget, input: ChatInput, stream: boolean): Record<string, unknown> {
  const format = !input.json ? undefined
    : input.json.strict && input.json.schema ? { type: 'json_schema', json_schema: { name: 'result', schema: input.json.schema, strict: true } }
    : { type: 'json_object' };
  return {
    model: target.model.modelId,
    messages: [{ role: 'system', content: input.system }, ...input.messages.map(message)],
    max_tokens: input.maxTokens,
    temperature: input.temperature,
    ...(format ? { response_format: format } : {}),
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
  };
}

const text = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : '')).join('');
  return '';
};

/** One completion at `url` (a provider's …/chat/completions). Shared with Workers AI. */
export async function completeAt(target: ProviderTarget, url: string, input: ChatInput, signal: AbortSignal): Promise<ChatOutput> {
  const response = await send(target, url, { method: 'POST', headers: { ...auth(target), 'Content-Type': 'application/json' }, body: JSON.stringify(chatBody(target, input, false)) }, signal);
  const payload = await readJson(response);
  const choice = (payload.choices as { message?: { content?: unknown } }[] | undefined)?.[0];
  const output = text(choice?.message?.content);
  if (!output.trim()) throw new ProviderError('invalid_response');
  const usage = payload.usage as Record<string, unknown> | undefined;
  return { text: output, inputTokens: tokens(usage?.prompt_tokens), outputTokens: tokens(usage?.completion_tokens) };
}

export async function streamAt(target: ProviderTarget, url: string, input: ChatInput, signal: AbortSignal, onDelta: (text: string) => void): Promise<ChatOutput> {
  const response = await send(target, url, { method: 'POST', headers: { ...auth(target), 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(chatBody(target, input, true)) }, signal);
  let output = '', inputTokens: number | null = null, outputTokens: number | null = null;
  for await (const event of sseEvents(response, signal)) {
    if (event.data === '[DONE]') break;
    const payload = parseEventJson(event.data);
    // OpenRouter reports a provider failure inside the stream.
    if (payload.error) throw new ProviderError('server_error');
    const delta = text((payload.choices as { delta?: { content?: unknown } }[] | undefined)?.[0]?.delta?.content);
    if (delta) { output += delta; onDelta(delta); }
    const usage = payload.usage as Record<string, unknown> | undefined;
    if (usage) { inputTokens = tokens(usage.prompt_tokens) ?? inputTokens; outputTokens = tokens(usage.completion_tokens) ?? outputTokens; }
  }
  if (!output.trim()) throw new ProviderError('invalid_response');
  return { text: output, inputTokens, outputTokens };
}

export function transcriptFrom(payload: Record<string, unknown>): Transcript {
  const textValue = typeof payload.text === 'string' ? payload.text.trim() : '';
  const segments = Array.isArray(payload.segments) ? payload.segments : [];
  const wordsList = Array.isArray(payload.words) ? payload.words
    : segments.flatMap((segment) => Array.isArray((segment as { words?: unknown[] }).words) ? (segment as { words: unknown[] }).words : []);
  return {
    text: textValue,
    language: typeof payload.language === 'string' ? payload.language : null,
    durationSec: typeof payload.duration === 'number' ? seconds(payload.duration) : null,
    segments: segments.map((segment) => segment as Record<string, unknown>).map((segment) => ({ start: seconds(segment.start), end: seconds(segment.end), text: String(segment.text ?? '').trim() })).filter((segment) => segment.text),
    words: wordsList.map((word) => word as Record<string, unknown>).map((word) => ({ word: String(word.word ?? '').trim(), start: seconds(word.start), end: seconds(word.end) })).filter((word) => word.word),
  };
}

export const openaiCompatible: Adapter = {
  chat: (target, input, signal) => completeAt(target, joinUrl(target.provider.baseUrl, 'chat/completions'), input, signal),
  stream: (target, input, signal, onDelta) => streamAt(target, joinUrl(target.provider.baseUrl, 'chat/completions'), input, signal, onDelta),
  async transcribe(target, input, signal) {
    const form = new FormData();
    const extension = input.mime.includes('ogg') ? 'ogg' : input.mime.includes('webm') ? 'webm' : input.mime.includes('wav') ? 'wav' : input.mime.includes('mp4') || input.mime.includes('m4a') ? 'm4a' : 'mp3';
    form.append('file', new Blob([input.audio as BlobPart], { type: input.mime }), `audio.${extension}`);
    form.append('model', target.model.modelId);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    form.append('timestamp_granularities[]', 'segment');
    if (input.language) form.append('language', input.language);
    if (input.prompt) form.append('prompt', input.prompt);
    const response = await send(target, joinUrl(target.provider.baseUrl, 'audio/transcriptions'), { method: 'POST', headers: auth(target), body: form }, signal);
    const transcript = transcriptFrom(await readJson(response));
    if (!transcript.text) throw new ProviderError('invalid_response');
    return transcript;
  },
  async speak(target, input, signal) {
    const response = await send(target, joinUrl(target.provider.baseUrl, 'audio/speech'), {
      method: 'POST',
      headers: { ...auth(target), 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: target.model.modelId, input: input.text, voice: input.voice || 'alloy', response_format: input.format }),
    }, signal);
    return { audio: await readBytes(response, 15_000_000), mime: AUDIO_MIME[input.format] };
  },
};
