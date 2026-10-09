import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createMarketplaceHandler } from "./handler.ts";

const getEnv = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};
const boundedFetch: typeof fetch = (input, init) => {
  const inherited = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const timeout = AbortSignal.timeout(8_000);
  return fetch(input, { ...init, signal: inherited ? AbortSignal.any([inherited, timeout]) : timeout });
};
const options = { auth: { persistSession: false }, global: { fetch: boundedFetch } };
const url = getEnv("SUPABASE_URL");
const client = createClient(url, getEnv("SUPABASE_SERVICE_ROLE_KEY"), options);
const auth = createClient(url, getEnv("SUPABASE_ANON_KEY"), options);
serve(createMarketplaceHandler({
  client,
  authenticate: async (token) => {
    const { data, error } = await auth.auth.getUser(token);
    if (error) {
      if ([400, 401, 403].includes(error.status ?? 0)) return null;
      throw new Error("Identity service unavailable");
    }
    return data.user?.id ?? null;
  },
}));
