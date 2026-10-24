// Multi-provider AI helper for the English ecosystem. Designed as a clean
// alternative to the OpenRouter-only path used by IELTS. Defaults to OpenAI
// direct (most reliable, well-documented, structured-output support); also
// supports Anthropic and Google AI Studio so the platform isn't locked to
// one vendor. Provider chosen by ENGLISH_AI_PROVIDER env var.
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
// All callers receive parsed JSON and a status flag so frontends can show
// real diagnostics instead of silent fallback strings.

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
  /** Which feature is calling (e.g. "tutor", "word-lookup", "roleplay"); used for usage logging and per-feature switches. */
  feature?: string;
  /** The learner the call is made for, when there is one; used for usage logging. */
  userId?: string | null;
}

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

const resolveProvider = (): EnglishAIPrimaryProvider => {
  const raw = (Deno.env.get("ENGLISH_AI_PROVIDER") ?? "openai").toLowerCase();
  if (raw === "anthropic" || raw === "google" || raw === "openai") return raw;
  return "openai";
};

const resolveProviderKey = (provider: EnglishAIPrimaryProvider): string | null => {
  return Deno.env.get(PROVIDER_KEY_ENV[provider]) ?? null;
};

export const isEnglishAIConfigured = (): boolean => {
  const provider = resolveProvider();
  if (resolveProviderKey(provider)) return true;
  const fallbackPolicy = (Deno.env.get("ENGLISH_AI_FALLBACK") ?? "openrouter").toLowerCase();
  return fallbackPolicy === "openrouter"
    && Boolean(Deno.env.get("OPENROUTER_API_KEY") ?? Deno.env.get("OPENAI_API_KEY"));
};

const callOpenAI = async (req: EnglishAIRequest, apiKey: string): Promise<unknown> => {
  const model = req.modelOverride ?? Deno.env.get("ENGLISH_AI_MODEL") ?? PROVIDER_DEFAULTS.openai.model;
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
  return JSON.parse(content);
};

const callAnthropic = async (req: EnglishAIRequest, apiKey: string): Promise<unknown> => {
  const model = req.modelOverride ?? Deno.env.get("ENGLISH_AI_MODEL") ?? PROVIDER_DEFAULTS.anthropic.model;
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
  const trimmed = content.trim().replace(/^```json\s*|\s*```$/g, "");
  return JSON.parse(trimmed);
};

const callGoogle = async (req: EnglishAIRequest, apiKey: string): Promise<unknown> => {
  const model = req.modelOverride ?? Deno.env.get("ENGLISH_AI_MODEL") ?? PROVIDER_DEFAULTS.google.model;
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
  const trimmed = text.trim().replace(/^```json\s*|\s*```$/g, "");
  return JSON.parse(trimmed);
};

// OpenRouter fallback — kept available for graceful degradation when the
// primary provider isn't configured but OpenRouter is. Uses openrouter/auto
// so it doesn't depend on a specific model that might be deprecated.
const callOpenRouterFallback = async (req: EnglishAIRequest): Promise<unknown> => {
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
      model: "openrouter/auto",
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
  return JSON.parse(content);
};

const callPrimaryProvider = (req: EnglishAIRequest, provider: EnglishAIPrimaryProvider, apiKey: string): Promise<unknown> => {
  if (provider === "openai") return callOpenAI(req, apiKey);
  if (provider === "anthropic") return callAnthropic(req, apiKey);
  return callGoogle(req, apiKey);
};

/**
 * Call the configured AI provider with structured JSON output.
 * Returns parsed JSON on success, throws on any failure.
 */
const callEnglishAIResolved = async (
  req: EnglishAIRequest,
): Promise<{ data: unknown; provider: EnglishAIProvider }> => {
  const provider = resolveProvider();
  const apiKey = resolveProviderKey(provider);
  const fallbackPolicy = (Deno.env.get("ENGLISH_AI_FALLBACK") ?? "openrouter").toLowerCase();

  if (apiKey) {
    try {
      return { data: await callPrimaryProvider(req, provider, apiKey), provider };
    } catch (err) {
      if (fallbackPolicy === "openrouter") {
        return { data: await callOpenRouterFallback(req), provider: "openrouter" };
      }
      throw err;
    }
  }

  if (fallbackPolicy === "openrouter") {
    return { data: await callOpenRouterFallback(req), provider: "openrouter" };
  }

  throw new Error(`english_ai_unconfigured: missing ${PROVIDER_KEY_ENV[provider]}`);
};

export const callEnglishAI = async (req: EnglishAIRequest): Promise<unknown> => {
  return (await callEnglishAIResolved(req)).data;
};

/**
 * Wraps callEnglishAI with a status report, mirroring the IELTS helper API.
 * Frontends use status to distinguish "AI worked" from "AI failed silently".
 */
export const callEnglishAIWithStatus = async <T>(
  req: EnglishAIRequest,
  fallback: T,
): Promise<{ data: T; status: EnglishAIStatus; error?: string; provider: EnglishAIProvider }> => {
  const provider = resolveProvider();
  if (!isEnglishAIConfigured()) {
    return { data: fallback, status: "unconfigured", provider };
  }
  try {
    const result = await callEnglishAIResolved(req);
    return { data: result.data as T, status: "ok", provider: result.provider };
  } catch (err) {
    return {
      data: fallback,
      status: "failed",
      provider,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};
