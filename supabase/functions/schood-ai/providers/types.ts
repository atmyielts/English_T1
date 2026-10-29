import type { JsonSchema, RegistryModel, RegistryProvider } from '../../../../packages/ai-core/src/mod.ts';

// One common request shape for every provider protocol. An adapter maps it to its
// provider's wire format and maps usage and errors back. Adapters never decide which
// model runs: the gateway picks the model from the registry and hands it over.

export type ContentPart = { type: 'text'; text: string } | { type: 'image'; url: string };
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string | ContentPart[] }

export interface ProviderTarget {
  provider: RegistryProvider;
  model: RegistryModel;
  apiKey: string;
  fetch: typeof fetch;
}

export interface ChatInput {
  system: string;
  /** User and assistant turns only, oldest first. */
  messages: ChatMessage[];
  /** JSON output: strict schema output when the model supports it, otherwise a JSON object. */
  json: null | { schema: JsonSchema | null; strict: boolean };
  maxTokens: number;
  temperature: number;
}
export interface ChatOutput { text: string; inputTokens: number | null; outputTokens: number | null }

export interface Transcript {
  text: string;
  language: string | null;
  durationSec: number | null;
  /** Present when the provider returns them; times in seconds. */
  segments: { start: number; end: number; text: string }[];
  words: { word: string; start: number; end: number }[];
}
export interface TranscribeInput { audio: Uint8Array; mime: string; language?: string | null; prompt?: string | null }
export interface SpeakInput { text: string; voice?: string | null; format: 'mp3' | 'opus' | 'wav' }
export interface SpeechAudio { audio: Uint8Array; mime: string }

export interface Adapter {
  chat(target: ProviderTarget, input: ChatInput, signal: AbortSignal): Promise<ChatOutput>;
  stream(target: ProviderTarget, input: ChatInput, signal: AbortSignal, onDelta: (text: string) => void): Promise<ChatOutput>;
  /** Speech to text; absent when the protocol has none. */
  transcribe?(target: ProviderTarget, input: TranscribeInput, signal: AbortSignal): Promise<Transcript>;
  /** Text to speech; absent when the protocol has none. */
  speak?(target: ProviderTarget, input: SpeakInput, signal: AbortSignal): Promise<SpeechAudio>;
}

export type ProviderErrorCode =
  | 'rate_limited' | 'server_error' | 'auth' | 'bad_request' | 'not_found'
  | 'timeout' | 'network' | 'invalid_response' | 'unsupported' | 'aborted';

/** Never carries provider bodies: they can echo learner text or keys. */
export class ProviderError extends Error {
  constructor(public code: ProviderErrorCode, public status: number | null = null) {
    super(status ? `${code} (${status})` : code);
  }
}
