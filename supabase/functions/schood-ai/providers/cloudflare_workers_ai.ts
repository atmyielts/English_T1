import { joinUrl, readJson, send, seconds, toBase64 } from './http.ts';
import { completeAt, streamAt, transcriptFrom } from './openai_compatible.ts';
import { ProviderError, type Adapter, type ProviderTarget, type Transcript } from './types.ts';

// Cloudflare Workers AI on the existing Cloudflare account. Configured with the
// provider's `config.account_id` and the env name of a Workers AI API token
// (CLOUDFLARE_AI_API_TOKEN, never the Pages deploy token). Chat uses its
// OpenAI-compatible endpoint; speech to text uses the REST `ai/run` endpoint for
// @cf/openai/whisper* models. [VERIFY] free daily allowance and Uzbek accuracy.

const account = (target: ProviderTarget) => {
  const id = target.provider.config.account_id ?? '';
  if (!/^[0-9a-f]{32}$/.test(id)) throw new ProviderError('bad_request');
  return id;
};
const chatUrl = (target: ProviderTarget) => joinUrl(target.provider.baseUrl, `accounts/${account(target)}/ai/v1/chat/completions`);
const runUrl = (target: ProviderTarget) => joinUrl(target.provider.baseUrl, `accounts/${account(target)}/ai/run/${target.model.modelId.replace(/^\/+/, '')}`);

/** Whisper large-v3-turbo takes base64 JSON and returns segments; the original Whisper takes raw bytes and returns words. */
export function whisperRequest(modelId: string, audio: Uint8Array, mime: string, language: string | null): { body: BodyInit; contentType: string } {
  if (/whisper-large-v3/.test(modelId)) return { body: JSON.stringify({ audio: toBase64(audio), task: 'transcribe', ...(language ? { language } : {}) }), contentType: 'application/json' };
  return { body: audio as BodyInit, contentType: mime || 'application/octet-stream' };
}

export function whisperTranscript(payload: Record<string, unknown>): Transcript {
  if (payload.success === false) throw new ProviderError('server_error');
  const result = (payload.result ?? {}) as Record<string, unknown>;
  const info = (result.transcription_info ?? {}) as Record<string, unknown>;
  const transcript = transcriptFrom({ ...result, language: info.language ?? result.language, duration: info.duration ?? result.duration });
  if (transcript.durationSec === null && transcript.words.length) transcript.durationSec = seconds(transcript.words.at(-1)!.end);
  if (!transcript.text) throw new ProviderError('invalid_response');
  return transcript;
}

export const cloudflareWorkersAi: Adapter = {
  chat: (target, input, signal) => completeAt(target, chatUrl(target), input, signal),
  stream: (target, input, signal, onDelta) => streamAt(target, chatUrl(target), input, signal, onDelta),
  async transcribe(target, input, signal) {
    if (!/^@cf\/openai\/whisper/.test(target.model.modelId)) throw new ProviderError('unsupported');
    const request = whisperRequest(target.model.modelId, input.audio, input.mime, input.language ?? null);
    const response = await send(target, runUrl(target), { method: 'POST', headers: { Authorization: `Bearer ${target.apiKey}`, 'Content-Type': request.contentType }, body: request.body }, signal);
    return whisperTranscript(await readJson(response));
  },
};
