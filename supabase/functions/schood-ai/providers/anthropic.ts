import { dataUrl, joinUrl, parseEventJson, readJson, send, sseEvents, tokens } from './http.ts';
import { ProviderError, type Adapter, type ChatInput, type ChatMessage, type ProviderTarget } from './types.ts';

// Anthropic's Messages API. There is no JSON mode: the gateway puts the required
// shape in the system prompt and validates the answer. Turns must alternate, so
// consecutive turns of one role are merged.

const headers = (target: ProviderTarget, stream: boolean) => ({
  'x-api-key': target.apiKey,
  'anthropic-version': '2023-06-01',
  'Content-Type': 'application/json',
  ...(stream ? { Accept: 'text/event-stream' } : {}),
});

function parts(entry: ChatMessage): Record<string, unknown>[] {
  if (typeof entry.content === 'string') return [{ type: 'text', text: entry.content }];
  return entry.content.map((part) => {
    if (part.type === 'text') return { type: 'text', text: part.text };
    const inline = dataUrl(part.url);
    return { type: 'image', source: inline ? { type: 'base64', media_type: inline.mime, data: inline.data } : { type: 'url', url: part.url } };
  });
}

export function anthropicBody(target: ProviderTarget, input: ChatInput, stream: boolean): Record<string, unknown> {
  const messages: { role: 'user' | 'assistant'; content: Record<string, unknown>[] }[] = [];
  for (const entry of input.messages) {
    if (entry.role === 'system') continue;
    const last = messages.at(-1);
    if (last && last.role === entry.role) last.content.push(...parts(entry));
    else messages.push({ role: entry.role, content: parts(entry) });
  }
  if (messages[0]?.role !== 'user') messages.unshift({ role: 'user', content: [{ type: 'text', text: '(conversation continues)' }] });
  return { model: target.model.modelId, system: input.system, messages, max_tokens: input.maxTokens, temperature: Math.min(1, input.temperature), ...(stream ? { stream: true } : {}) };
}

export const anthropic: Adapter = {
  async chat(target, input, signal) {
    const response = await send(target, joinUrl(target.provider.baseUrl, 'messages'), { method: 'POST', headers: headers(target, false), body: JSON.stringify(anthropicBody(target, input, false)) }, signal);
    const payload = await readJson(response);
    const output = (Array.isArray(payload.content) ? payload.content : []).map((block) => (block as { type?: string; text?: string }).type === 'text' ? String((block as { text?: string }).text ?? '') : '').join('');
    if (!output.trim()) throw new ProviderError('invalid_response');
    const usage = payload.usage as Record<string, unknown> | undefined;
    return { text: output, inputTokens: tokens(usage?.input_tokens), outputTokens: tokens(usage?.output_tokens) };
  },
  async stream(target, input, signal, onDelta) {
    const response = await send(target, joinUrl(target.provider.baseUrl, 'messages'), { method: 'POST', headers: headers(target, true), body: JSON.stringify(anthropicBody(target, input, true)) }, signal);
    let output = '', inputTokens: number | null = null, outputTokens: number | null = null;
    for await (const event of sseEvents(response, signal)) {
      if (event.event === 'ping') continue;
      const payload = parseEventJson(event.data);
      if (payload.type === 'error' || event.event === 'error') throw new ProviderError((payload.error as { type?: string } | undefined)?.type === 'overloaded_error' ? 'rate_limited' : 'server_error');
      if (payload.type === 'message_start') inputTokens = tokens((payload.message as { usage?: { input_tokens?: unknown } } | undefined)?.usage?.input_tokens);
      if (payload.type === 'content_block_delta') {
        const delta = payload.delta as { type?: string; text?: string } | undefined;
        if (delta?.type === 'text_delta' && delta.text) { output += delta.text; onDelta(delta.text); }
      }
      if (payload.type === 'message_delta') outputTokens = tokens((payload.usage as { output_tokens?: unknown } | undefined)?.output_tokens) ?? outputTokens;
      if (payload.type === 'message_stop') break;
    }
    if (!output.trim()) throw new ProviderError('invalid_response');
    return { text: output, inputTokens, outputTokens };
  },
};
