// The single gateway for every English AI call. Multi-provider: OpenAI direct
// by default, Anthropic or Google AI Studio by env, with an OpenRouter fallback.
//
// Env (all optional except the chosen provider's API key):
//   ENGLISH_AI_PROVIDER   = openai | anthropic | google      (default openai)
//   ENGLISH_AI_MODEL      = provider-specific model id
//   ENGLISH_AI_FALLBACK   = openrouter | none                (default openrouter)
//   OPENAI_API_KEY        = sk-...
//   ANTHROPIC_API_KEY     = sk-ant-...
//   GOOGLE_AI_API_KEY     = AIza...
//   OPENROUTER_API_KEY    = sk-or-v1-... (used as fallback if ENGLISH_AI_FALLBACK=openrouter)
//
// On top of the provider call the gateway:
//   * honours the operator switches in english_service_settings (global AI
//     on/off and per-feature on/off). A switched-off call returns status
//     "unconfigured" with the caller's fallback, so frontends degrade the same
//     way as when no key is set; the ledger records it as "disabled".
//   * records every call in english_ai_calls (feature, learner, provider,
//     model, status, latency, sizes, provider token usage) in the background.
//
// Callers should set `feature` (kebab-case) and `userId` on every request.
// Learner daily credits are handled in ./english-ai-quota.ts.

import { type EnglishAICallRecord, recordEnglishAICall } from "./english-ai-ledger.ts";
import { type EnglishSettings, isAIFeatureEnabled, loadEnglishSettings } from "./english-settings.ts";

export type EnglishAIProvider = "openai" | "anthropic" | "google" | "openrouter";
type EnglishAIPrimaryProvider = Exclude<EnglishAIProvider, "openrouter">;

export type EnglishAIStatus = "ok" | "unconfigured" | "failed";

export interface EnglishAIRequest {
  systemPrompt: string;
  /** A single user message — typically a JSON.stringify of an input payload. */
  userPayload: string;
  temperature?: number;
  /** Optional override for the model id. */
  modelOverride?: string | null;
  /** Which feature is calling (e.g. "tutor-chat", "word-lookup"); used for usage logging and per-feature switches. */
  feature?: string;
  /** The learner the call is made for, when there is one; used for usage logging. */
  userId?: string | null;
}

export type EnglishAIResult<T> = {
  data: T;
  status: EnglishAIStatus;
  error?: string;
  provider: EnglishAIProvider;
};

/** What a provider call returns besides the parsed JSON. */
export type ProviderResult = {
  data: unknown;
  provider: EnglishAIProvider;
  model: string | null;
  outputChars: number;
  promptTokens: number | null;
  completionTokens: number | null;
};

const PROVIDER_DEFAULTS: Record<EnglishAIPrimaryProvider, { model: string; endpoint: string }> = {
  openai: {
    model: "gpt-4o-mini",
    endpoint: "https://api.openai.com/v1/chat/completions",
  },
  anthropic: {
    model: "claude-3-5-haiku-20241022",
    endpoint: "https://api.anthropic.com/v1/messages",
  },
  google: {
    model: "gemini-2.0-flash-exp",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
  },
};

const PROVIDER_KEY_ENV: Record<EnglishAIPrimaryProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_AI_API_KEY",
};

const OPENROUTER_FALLBACK_MODEL = "openrouter/auto";

const resolveProvider = (): EnglishAIPrimaryProvider => {
  const raw = (Deno.env.get("ENGLISH_AI_PROVIDER") ?? "openai").toLowerCase();
  if (raw === "anthropic" || raw === "google" || raw === "openai") return raw;
  return "openai";
};

const resolveProviderKey = (provider: EnglishAIPrimaryProvider): string | null => {
  return Deno.env.get(PROVIDER_KEY_ENV[provider]) ?? null;
};

const resolveModel = (req: EnglishAIRequest, provider: EnglishAIPrimaryProvider): string =>
  req.modelOverride ?? Deno.env.get("ENGLISH_AI_MODEL") ?? PROVIDER_DEFAULTS[provider].model;

const fallbackPolicy = (): string => (Deno.env.get("ENGLISH_AI_FALLBACK") ?? "openrouter").toLowerCase();

export const isEnglishAIConfigured = (): boolean => {
  const provider = resolveProvider();
  if (resolveProviderKey(provider)) return true;
  return fallbackPolicy() === "openrouter"
    && Boolean(Deno.env.get("OPENROUTER_API_KEY") ?? Deno.env.get("OPENAI_API_KEY"));
};

/** Provider and model as configured by env, for the admin control center (read-only; no secrets). */
export const englishAIRuntimeInfo = () => {
  const provider = resolveProvider();
  return {
    provider,
    model: Deno.env.get("ENGLISH_AI_MODEL") ?? PROVIDER_DEFAULTS[provider].model,
    fallback: fallbackPolicy() === "openrouter" ? "openrouter" : "none",
    configured: isEnglishAIConfigured(),
    primary_key_set: Boolean(resolveProviderKey(provider)),
  };
};

const tokenCount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;

const parseJsonText = (text: string): unknown => JSON.parse(text.trim().replace(/^```json\s*|\s*```$/g, ""));

const callOpenAI = async (req: EnglishAIRequest, apiKey: string): Promise<ProviderResult> => {
  const model = resolveModel(req, "openai");
  const res = await fetch(PROVIDER_DEFAULTS.openai.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: req.userPayload },
      ],
      temperature: req.temperature ?? 0.3,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`openai_http_${res.status}: ${body.slice(0, 200)}`);
  }
  const payload = await res.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("openai_missing_content");
  return {
    data: JSON.parse(content),
    provider: "openai",
    model: typeof payload?.model === "string" ? payload.model : model,
    outputChars: content.length,
    promptTokens: tokenCount(payload?.usage?.prompt_tokens),
    completionTokens: tokenCount(payload?.usage?.completion_tokens),
  };
};

const callAnthropic = async (req: EnglishAIRequest, apiKey: string): Promise<ProviderResult> => {
  const model = resolveModel(req, "anthropic");
  const res = await fetch(PROVIDER_DEFAULTS.anthropic.endpoint, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: `${req.systemPrompt}\n\nReply with strict JSON only.`,
      messages: [{ role: "user", content: req.userPayload }],
      temperature: req.temperature ?? 0.3,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`anthropic_http_${res.status}: ${body.slice(0, 200)}`);
  }
  const payload = await res.json();
  const content = payload?.content?.[0]?.text;
  if (typeof content !== "string") throw new Error("anthropic_missing_content");
  // Anthropic doesn't enforce JSON mode — sniff & parse defensively.
  return {
    data: parseJsonText(content),
    provider: "anthropic",
    model: typeof payload?.model === "string" ? payload.model : model,
    outputChars: content.length,
    promptTokens: tokenCount(payload?.usage?.input_tokens),
    completionTokens: tokenCount(payload?.usage?.output_tokens),
  };
};

const callGoogle = async (req: EnglishAIRequest, apiKey: string): Promise<ProviderResult> => {
  const model = resolveModel(req, "google");
  const url = `${PROVIDER_DEFAULTS.google.endpoint}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        { role: "user", parts: [{ text: `${req.systemPrompt}\n\n${req.userPayload}\n\nReply with strict JSON only.` }] },
      ],
      generationConfig: {
        temperature: req.temperature ?? 0.3,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`google_http_${res.status}: ${body.slice(0, 200)}`);
  }
  const payload = await res.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw new Error("google_missing_content");
  return {
    data: parseJsonText(text),
    provider: "google",
    model,
    outputChars: text.length,
    promptTokens: tokenCount(payload?.usageMetadata?.promptTokenCount),
    completionTokens: tokenCount(payload?.usageMetadata?.candidatesTokenCount),
  };
};

// OpenRouter fallback — kept available for graceful degradation when the
// primary provider isn't configured but OpenRouter is. Uses openrouter/auto
// so it doesn't depend on a specific model that might be deprecated.
const callOpenRouterFallback = async (req: EnglishAIRequest): Promise<ProviderResult> => {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY") ?? Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("openrouter_unconfigured");
  const baseUrl = (Deno.env.get("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://schood.online",
      "X-Title": "Schood English",
    },
    body: JSON.stringify({
      model: OPENROUTER_FALLBACK_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: req.userPayload },
      ],
      temperature: req.temperature ?? 0.3,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`openrouter_fallback_${res.status}: ${body.slice(0, 200)}`);
  }
  const payload = await res.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("openrouter_fallback_missing_content");
  return {
    data: JSON.parse(content),
    provider: "openrouter",
    model: typeof payload?.model === "string" ? payload.model : OPENROUTER_FALLBACK_MODEL,
    outputChars: content.length,
    promptTokens: tokenCount(payload?.usage?.prompt_tokens),
    completionTokens: tokenCount(payload?.usage?.completion_tokens),
  };
};

const callPrimaryProvider = (req: EnglishAIRequest, provider: EnglishAIPrimaryProvider, apiKey: string): Promise<ProviderResult> => {
  if (provider === "openai") return callOpenAI(req, apiKey);
  if (provider === "anthropic") return callAnthropic(req, apiKey);
  return callGoogle(req, apiKey);
};

/** Calls the configured provider (with the OpenRouter fallback). Throws on any failure. */
const callConfiguredProvider = async (req: EnglishAIRequest): Promise<ProviderResult> => {
  const provider = resolveProvider();
  const apiKey = resolveProviderKey(provider);

  if (apiKey) {
    try {
      return await callPrimaryProvider(req, provider, apiKey);
    } catch (err) {
      if (fallbackPolicy() === "openrouter") return await callOpenRouterFallback(req);
      throw err;
    }
  }

  if (fallbackPolicy() === "openrouter") return await callOpenRouterFallback(req);

  throw new Error(`english_ai_unconfigured: missing ${PROVIDER_KEY_ENV[provider]}`);
};

// --- Gateway -------------------------------------------------------------------

export type EnglishAIGatewayDeps = {
  isConfigured: () => boolean;
  loadSettings: () => Promise<EnglishSettings>;
  callProvider: (req: EnglishAIRequest) => Promise<ProviderResult>;
  record: (record: EnglishAICallRecord) => void;
  primaryProvider: () => EnglishAIProvider;
  primaryModel: (req: EnglishAIRequest) => string | null;
  now: () => number;
};

const defaultDeps: EnglishAIGatewayDeps = {
  isConfigured: isEnglishAIConfigured,
  loadSettings: () => loadEnglishSettings(),
  callProvider: callConfiguredProvider,
  record: (record) => recordEnglishAICall(record),
  primaryProvider: resolveProvider,
  primaryModel: (req) => resolveModel(req, resolveProvider()),
  now: () => Date.now(),
};

/** The gateway with injectable dependencies (tests use fakes; production uses the defaults). */
export const createEnglishAIGateway = (deps: EnglishAIGatewayDeps) =>
async <T>(req: EnglishAIRequest, fallback: T): Promise<EnglishAIResult<T>> => {
  const provider = deps.primaryProvider();
  const base = {
    feature: req.feature ?? "unknown",
    userId: req.userId ?? null,
    inputChars: (req.systemPrompt?.length ?? 0) + (req.userPayload?.length ?? 0),
  };
  const record = (entry: Omit<EnglishAICallRecord, "feature" | "userId" | "inputChars">) => {
    try {
      deps.record({ ...base, ...entry });
    } catch {
      // never let logging fail a call
    }
  };

  let settings: EnglishSettings | null = null;
  try {
    settings = await deps.loadSettings();
  } catch {
    settings = null; // unreadable settings never block AI
  }
  if (settings && !isAIFeatureEnabled(settings, base.feature)) {
    record({ status: "disabled", provider: null, model: null, error: settings.ai.enabled ? "feature_off" : "ai_off" });
    return { data: fallback, status: "unconfigured", provider, error: "english_ai_disabled_by_operator" };
  }

  if (!deps.isConfigured()) {
    record({ status: "unconfigured", provider, model: null });
    return { data: fallback, status: "unconfigured", provider };
  }

  const startedAt = deps.now();
  try {
    const result = await deps.callProvider(req);
    record({
      status: "ok",
      provider: result.provider,
      model: result.model,
      latencyMs: deps.now() - startedAt,
      outputChars: result.outputChars,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    });
    return { data: result.data as T, status: "ok", provider: result.provider };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    record({ status: "failed", provider, model: deps.primaryModel(req), latencyMs: deps.now() - startedAt, error: message });
    return { data: fallback, status: "failed", provider, error: message };
  }
};

/**
 * Call English AI with a status report. Never throws: on any problem it
 * returns the caller's fallback with status "unconfigured" (no key, or
 * switched off by the operator) or "failed" (provider error, bad JSON).
 */
export const callEnglishAIWithStatus: <T>(req: EnglishAIRequest, fallback: T) => Promise<EnglishAIResult<T>> =
  createEnglishAIGateway(defaultDeps);

/** Same as callEnglishAIWithStatus but returns the parsed JSON and throws when there is none. */
export const callEnglishAI = async (req: EnglishAIRequest): Promise<unknown> => {
  const result = await callEnglishAIWithStatus<unknown>(req, null);
  if (result.status !== "ok") throw new Error(result.error ?? `english_ai_${result.status}`);
  return result.data;
};

/** Whether a call for `feature` would reach a provider right now (configured and not switched off). */
export const englishAIAvailable = async (feature: string | null | undefined): Promise<boolean> => {
  if (!isEnglishAIConfigured()) return false;
  return isAIFeatureEnabled(await loadEnglishSettings(), String(feature ?? "unknown"));
};

/** The feature name for a hub AI route: /ai/dictation/generate -> dictation-generate. */
export const aiFeatureForRoute = (route: string): string => {
  if (route === "/insights/coach-summary") return "coach-summary";
  const tail = route.replace(/^\/ai\//, "").replace(/^\/+|\/+$/g, "");
  return tail.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "unknown";
};
