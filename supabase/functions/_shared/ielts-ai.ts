// Shared OpenRouter JSON helper for IELTS AI features. Used by all the
// AI-powered endpoints across practice and playbook so the prompt/model
// plumbing lives in one place. Reads OPENROUTER_API_KEY / _MODEL / _BASE_URL
// from Supabase secrets. Returns parsed JSON or throws on failure.

export interface OpenRouterCallOptions {
  /** Will be rendered as the JSON `response_format: { type: "json_object" }` */
  systemPrompt: string;
  /** Single user message — typically JSON.stringify of an input payload */
  userPayload: string;
  /** Temperature — defaults to 0.3 for deterministic structured output */
  temperature?: number;
  /** Override the default model from env */
  modelOverride?: string | null;
}

export const isOpenRouterConfigured = (): boolean =>
  Boolean(Deno.env.get("OPENROUTER_API_KEY") ?? Deno.env.get("OPENAI_API_KEY"));

const AUTO_FALLBACK_MODEL = "openrouter/auto";

const requestOpenRouter = async (
  model: string,
  apiKey: string,
  baseUrl: string,
  referer: string,
  appName: string,
  options: OpenRouterCallOptions,
): Promise<Response> => {
  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referer,
      "X-Title": appName,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: options.systemPrompt },
        { role: "user", content: options.userPayload },
      ],
      temperature: options.temperature ?? 0.3,
    }),
  });
};

const isModelUnavailable = (status: number, body: string): boolean => {
  if (status === 404) return true;
  if (status === 400 && /no endpoints|model not found|unsupported model/i.test(body)) return true;
  return false;
};

export const callOpenRouterJson = async (
  options: OpenRouterCallOptions,
): Promise<unknown> => {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY") ?? Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("openrouter_unconfigured");

  const baseUrl = (Deno.env.get("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const primaryModel = options.modelOverride ?? Deno.env.get("OPENROUTER_MODEL") ?? AUTO_FALLBACK_MODEL;
  const referer = Deno.env.get("OPENROUTER_REFERER") ?? "https://schood.online";
  const appName = Deno.env.get("OPENROUTER_APP_NAME") ?? "Schood IELTS";

  // First attempt: the configured (or default) model.
  let res = await requestOpenRouter(primaryModel, apiKey, baseUrl, referer, appName, options);

  // Auto-retry once with openrouter/auto when the configured model has been
  // deprecated or removed (404 / 400 No endpoints). This makes the system
  // resilient to a stale OPENROUTER_MODEL secret pointing at a model that
  // OpenRouter no longer serves.
  if (!res.ok && primaryModel !== AUTO_FALLBACK_MODEL) {
    const probeText = await res.text().catch(() => "");
    if (isModelUnavailable(res.status, probeText)) {
      res = await requestOpenRouter(AUTO_FALLBACK_MODEL, apiKey, baseUrl, referer, appName, options);
    } else {
      throw new Error(`openrouter_http_${res.status}: ${probeText.slice(0, 200)}`);
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`openrouter_http_${res.status}: ${text.slice(0, 200)}`);
  }

  const payload = await res.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("openrouter_missing_content");

  try {
    return JSON.parse(content);
  } catch {
    throw new Error("openrouter_non_json");
  }
};

// Helper to fall back gracefully when the AI call fails. Returns the parsed
// JSON on success, or a typed fallback value otherwise.
export const callOpenRouterJsonOrFallback = async <T>(
  options: OpenRouterCallOptions,
  fallback: T,
): Promise<T> => {
  try {
    const result = await callOpenRouterJson(options);
    return result as T;
  } catch {
    return fallback;
  }
};

// Same as callOpenRouterJsonOrFallback but also reports HOW the result was
// produced, so the caller can surface a real error message instead of silently
// substituting placeholder content. The frontend uses ai_status to distinguish
// "AI is off" (key missing) vs "AI errored" (call failed) vs "AI worked".
export type AIStatus = "ok" | "unconfigured" | "failed";

export const callOpenRouterJsonWithStatus = async <T>(
  options: OpenRouterCallOptions,
  fallback: T,
): Promise<{ data: T; status: AIStatus; error?: string }> => {
  if (!isOpenRouterConfigured()) {
    return { data: fallback, status: "unconfigured" };
  }
  try {
    const result = await callOpenRouterJson(options);
    return { data: result as T, status: "ok" };
  } catch (err) {
    return {
      data: fallback,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
};
