// Production wiring for the exam-playbook handler: Supabase service client,
// JWT validation, access-effective premium checks and the free-model AI helper.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callOpenRouterJsonWithStatus } from "./sat-ai.ts";
import {
  type ExamPlaybookConfig,
  type PlaybookDeps,
  accessEffectiveHasProduct,
  defaultLog,
} from "./exam-playbook.ts";

const env = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};

let cached: PlaybookDeps | null = null;

export const productionDeps = (cfg: ExamPlaybookConfig) => (): PlaybookDeps => {
  if (cached) return cached;
  const url = env("SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY");
  const db = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  cached = {
    db,
    getUser: async (token: string) => {
      const { data, error } = await db.auth.getUser(token);
      return error || !data?.user?.id ? null : { id: data.user.id };
    },
    hasProduct: accessEffectiveHasProduct(url, anon),
    // Free OpenRouter model by default (google/gemma-4-31b-it:free); never a paid router.
    ai: (options, fallback) => callOpenRouterJsonWithStatus(options, fallback),
    now: () => new Date(),
    log: defaultLog(cfg.functionName),
  };
  return cached;
};
