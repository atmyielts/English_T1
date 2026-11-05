import { dataUrl, joinUrl, parseEventJson, readJson, send, sseEvents, tokens } from './http.ts';
import { ProviderError, type Adapter, type ChatInput, type ChatMessage, type ProviderTarget } from './types.ts';

// Google's Gemini API (generateContent / streamGenerateContent). The key travels in
// the x-goog-api-key header, never in the URL. Images must be inline: a remote image
// URL is refused here so the gateway falls back to another model.

function parts(entry: ChatMessage): Record<string, unknown>[] {
  if (typeof entry.content === 'string') return [{ text: entry.content }];
  return entry.content.map((part) => {
    if (part.type === 'text') return { text: part.text };
    const inline = dataUrl(part.url);
    if (!inline) throw new ProviderError('unsupported');
    return { inlineData: { mimeType: inline.mime, data: inline.data } };
  });
}

export function geminiBody(input: ChatInput): Record<string, unknown> {
  return {
    systemInstruction: { parts: [{ text: input.system }] },
    contents: input.messages.filter((entry) => entry.role !== 'system').map((entry) => ({ role: entry.role === 'assistant' ? 'model' : 'user', parts: parts(entry) })),
    generationConfig: { temperature: input.temperature, maxOutputTokens: input.maxTokens, ...(input.json ? { responseMimeType: 'application/json' } : {}) },
  };
}

const textOf = (payload: Record<string, unknown>): string => {
  const candidate = (payload.candidates as { content?: { parts?: { text?: unknown }[] } }[] | undefined)?.[0];
  return (candidate?.content?.parts ?? []).map((part) => (typeof part.text === 'string' ? part.text : '')).join('');
};
const usageOf = (payload: Record<string, unknown>) => {
  const usage = payload.usageMetadata as Record<string, unknown> | undefined;
  return { inputTokens: tokens(usage?.promptTokenCount), outputTokens: tokens(usage?.candidatesTokenCount) };
};
const url = (target: ProviderTarget, method: string) => joinUrl(target.provider.baseUrl, `models/${encodeURIComponent(target.model.modelId)}:${method}`);
const headers = (target: ProviderTarget) => ({ 'x-goog-api-key': target.apiKey, 'Content-Type': 'application/json' });

export const googleGemini: Adapter = {
  async chat(target, input, signal) {
    const response = await send(target, url(target, 'generateContent'), { method: 'POST', headers: headers(target), body: JSON.stringify(geminiBody(input)) }, signal);
    const payload = await readJson(response);
    const output = textOf(payload);
    // A safety block returns no text: treated as a failed answer, not an empty one.
    if (!output.trim()) throw new ProviderError('invalid_response');
    return { text: output, ...usageOf(payload) };
  },
  async stream(target, input, signal, onDelta) {
    const response = await send(target, `${url(target, 'streamGenerateContent')}?alt=sse`, { method: 'POST', headers: { ...headers(target), Accept: 'text/event-stream' }, body: JSON.stringify(geminiBody(input)) }, signal);
    let output = '', usage = { inputTokens: null as number | null, outputTokens: null as number | null };
    for await (const event of sseEvents(response, signal)) {
      const payload = parseEventJson(event.data);
      if (payload.error) throw new ProviderError('server_error');
      const delta = textOf(payload);
      if (delta) { output += delta; onDelta(delta); }
      if (payload.usageMetadata) usage = usageOf(payload);
    }
    if (!output.trim()) throw new ProviderError('invalid_response');
    return { text: output, ...usage };
  },
};
