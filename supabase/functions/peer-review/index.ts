import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createPeerReviewHandler } from "./handler.ts";

const getEnv = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};
const boundedFetch: typeof fetch = (input, init) => fetch(input, {
  ...init, signal: AbortSignal.any([AbortSignal.timeout(8_000), ...(init?.signal ? [init.signal] : [])]),
});
const options = { auth: { persistSession: false }, global: { fetch: boundedFetch } };
const client = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), options);
const auth = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_ANON_KEY"), options);
serve(createPeerReviewHandler({
  client,
  authenticate: async (token) => {
    const { data, error } = await auth.auth.getUser(token);
    if (error) {
      if (![400, 401, 403].includes(error.status ?? 0)) throw error;
      return null;
    }
    return data.user?.id ?? null;
  },
}));
