import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createSpeakingCoachHandler } from "./handler.ts";
const getEnv = (key: string) => Deno.env.get(key);
import { createSpeakingGrader } from "./grading.ts";
import { resolveAiAllowance } from "../_shared/ai-addon.ts";
import { createCoachingCapacityReader } from "../_shared/coaching-capacity.ts";
const required = (key: string) => {
  const value = getEnv(key);
  if (!value) throw new Error("Missing " + key);
  return value;
};
const base = required("SUPABASE_URL"), anon = required("SUPABASE_ANON_KEY");
const boundedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(10000) });
const client = createClient(base, required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
  global: { fetch: boundedFetch },
});
const auth = createClient(base, anon, {
  auth: { persistSession: false },
  global: { fetch: boundedFetch },
});
const key = getEnv("OPENROUTER_API_KEY") ?? "";
const model = getEnv("OPENROUTER_MODEL") ?? "google/gemma-4-31b-it:free";
const providerBase = getEnv("OPENROUTER_BASE_URL") ??
  "https://openrouter.ai/api/v1";
const capacity = createCoachingCapacityReader(
  { key, model, baseUrl: providerBase },
  fetch,
  (status) =>
    console.warn(
      JSON.stringify({
        event: "coaching_provider_capacity",
        service: "speaking-coach",
        ...status,
      }),
    ),
);
const configuredLimit = Number(
  getEnv("SPEAKING_COACH_SERVICE_DAILY_LIMIT"),
);
const serviceLimit = Number.isInteger(configuredLimit) && configuredLimit > 0 &&
    configuredLimit <= 1000000
  ? configuredLimit
  : 0;
const addonId = getEnv("AI_ADDON_PRODUCT_ID") ?? "";
serve(createSpeakingCoachHandler({
  client,
  reportProviderFailure: (event) =>
    console.warn(
      JSON.stringify({ event: "coaching_provider_failure", ...event }),
    ),
  authenticate: async (token) => {
    const { data, error } = await auth.auth.getUser(token);
    if (error) {
      if (![400, 401, 403].includes(error.status ?? 0)) throw error;
      return null;
    }
    return data.user?.id ?? null;
  },
  allowance: async (token) =>
    resolveAiAllowance({
      client,
      base,
      anon,
      addonId,
      serviceLimit,
      providerConfigured: (await capacity()).available,
    }, token),
  generate: createSpeakingGrader({
    key,
    model,
    baseUrl: providerBase,
    referer: getEnv("OPENROUTER_REFERER") ?? "https://schood.online",
  }),
}));
