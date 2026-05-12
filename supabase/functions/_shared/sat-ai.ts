export interface OpenRouterCallOptions {
  systemPrompt: string;
  userPayload: string;
  temperature?: number;
  modelOverride?: string | null;
}

export type AIStatus = "ok" | "unconfigured" | "failed";

const AUTO_FALLBACK_MODEL = "openrouter/auto";

export const isOpenRouterConfigured = (): boolean =>
  Boolean(Deno.env.get("OPENROUTER_API_KEY") ?? Deno.env.get("OPENAI_API_KEY"));

const requestOpenRouter = async (
  model: string,
  apiKey: string,
  baseUrl: string,
  referer: string,
  appName: string,
  options: OpenRouterCallOptions,
): Promise<Response> =>
  fetch(`${baseUrl}/chat/completions`, {
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
      temperature: options.temperature ?? 0.25,
    }),
  });

const isModelUnavailable = (status: number, body: string): boolean => {
  if (status === 404) return true;
  if (status === 400 && /no endpoints|model not found|unsupported model/i.test(body)) return true;
  return false;
};

export const callOpenRouterJson = async (options: OpenRouterCallOptions): Promise<unknown> => {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY") ?? Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("openrouter_unconfigured");

  const baseUrl = (Deno.env.get("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const primaryModel = options.modelOverride ?? Deno.env.get("OPENROUTER_MODEL") ?? AUTO_FALLBACK_MODEL;
  const referer = Deno.env.get("OPENROUTER_REFERER") ?? "https://schood.online";
  const appName = Deno.env.get("OPENROUTER_APP_NAME") ?? "Schood SAT";

  let res = await requestOpenRouter(primaryModel, apiKey, baseUrl, referer, appName, options);
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
  return JSON.parse(content);
};

export const callOpenRouterJsonWithStatus = async <T>(
  options: OpenRouterCallOptions,
  fallback: T,
): Promise<{ data: T; status: AIStatus; error?: string }> => {
  if (!isOpenRouterConfigured()) return { data: fallback, status: "unconfigured" };
  try {
    return { data: await callOpenRouterJson(options) as T, status: "ok" };
  } catch (err) {
    return { data: fallback, status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
};
