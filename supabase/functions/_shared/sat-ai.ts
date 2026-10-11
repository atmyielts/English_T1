import { boundedJson } from "./ai-response.ts";

export interface OpenRouterCallOptions {
  systemPrompt: string;
  userPayload: string;
  temperature?: number;
  modelOverride?: string | null;
}

export type AIStatus = "ok" | "unconfigured" | "failed";

export const isOpenRouterConfigured = (): boolean =>
  Boolean(Deno.env.get("OPENROUTER_API_KEY") ?? Deno.env.get("OPENAI_API_KEY"));

const requestOpenRouter = async (
  model: string,
  apiKey: string,
  baseUrl: string,
  referer: string,
  appName: string,
  options: OpenRouterCallOptions,
  fetcher: typeof fetch,
): Promise<Response> =>
  fetcher(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(25000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referer,
      "X-Title": appName,
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: options.systemPrompt },
        { role: "user", content: options.userPayload },
      ],
      temperature: options.temperature ?? 0.25,
    }),
  });

export const callOpenRouterJson = async (
  options: OpenRouterCallOptions,
  fetcher: typeof fetch = fetch,
): Promise<unknown> => {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY") ?? Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("openrouter_unconfigured");

  const baseUrl = (Deno.env.get("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const primaryModel = options.modelOverride ?? Deno.env.get("OPENROUTER_MODEL") ?? "google/gemma-4-31b-it:free";
  // A failed free model must never silently dispatch to a paid router.
  if (!primaryModel.trim() || primaryModel === "openrouter/auto") {
    throw new Error("openrouter_model_unconfigured");
  }
  if (options.userPayload.length > 50000 || options.systemPrompt.length > 10000) {
    throw new Error("openrouter_input_too_large");
  }
  const referer = Deno.env.get("OPENROUTER_REFERER") ?? "https://schood.online";
  const appName = Deno.env.get("OPENROUTER_APP_NAME") ?? "Schood SAT";

  const res = await requestOpenRouter(primaryModel, apiKey, baseUrl, referer, appName, options, fetcher);
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`provider_http_${res.status}`);
  }

  const payload = await boundedJson(res, 65536) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length > 60000) throw new Error("invalid_provider_result");
  const result = JSON.parse(content);
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("invalid_provider_result");
  }
  return result;
};

export const callOpenRouterJsonWithStatus = async <T>(
  options: OpenRouterCallOptions,
  fallback: T,
  fetcher: typeof fetch = fetch,
): Promise<{ data: T; status: AIStatus; error?: string }> => {
  if (!isOpenRouterConfigured()) return { data: fallback, status: "unconfigured" };
  try {
    return { data: await callOpenRouterJson(options, fetcher) as T, status: "ok" };
  } catch {
    // Provider transport bodies may contain private learner text or credentials.
    return { data: fallback, status: "failed", error: "AI feedback is temporarily unavailable. Your saved result is unchanged." };
  }
};
