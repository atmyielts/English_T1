import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { CoachingAllowance } from "./coaching-handler.ts";
import { boundedJson } from "./ai-response.ts";
export async function resolveAiAllowance(
  config: {
    client: SupabaseClient;
    base: string;
    anon: string;
    addonId: string;
    serviceLimit: number;
    providerConfigured: boolean;
  },
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<CoachingAllowance> {
  let paid = false, addonAvailable = false;
  if (config.addonId) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        config.addonId,
      )
    ) throw new Error("Invalid AI add-on configuration");
    const { data, error } = await config.client.from("products").select(
      "id,status",
    ).eq("id", config.addonId).maybeSingle();
    if (error) throw error;
    addonAvailable = data?.status === "active";
    if (addonAvailable) {
      const response = await fetcher(
        config.base + "/functions/v1/access-effective",
        {
          headers: { apikey: config.anon, Authorization: "Bearer " + token },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("AI access verification unavailable");
      }
      const access = await boundedJson(response, 65536) as {
        effective_product_ids?: unknown;
      };
      if (
        !Array.isArray(access?.effective_product_ids) ||
        access.effective_product_ids.some((value) => typeof value !== "string")
      ) {
        throw new Error("Invalid AI access response");
      }
      // Explicit add-on identity only. Unrelated product purchases never count.
      paid = access.effective_product_ids.includes(config.addonId);
    }
  }
  return {
    limit: paid ? 20 : 2,
    paid,
    addonAvailable,
    serviceLimit: config.serviceLimit,
    enabled: config.providerConfigured && config.serviceLimit > 0,
  };
}
