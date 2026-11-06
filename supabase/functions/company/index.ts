import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { callEnglishAIWithStatus } from '../_shared/english-ai.ts';
import { createCompanyHandler } from './handler.ts';
import { allRoutes } from './routes.ts';
import type { AiCall } from './types.ts';

const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
const whole = (name: string, fallback: number) => {
  const value = Number(Deno.env.get(name) ?? fallback);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
};
const auth = createClient(required('SUPABASE_URL'), required('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
const db = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

Deno.serve(createCompanyHandler({
  db,
  async userFromToken(token) {
    const { data, error } = await auth.auth.getUser(token);
    return error || !data.user ? null : { id: data.user.id, email: data.user.email ?? null };
  },
  origins: (Deno.env.get('COMPANY_ALLOWED_ORIGINS') ?? '').split(',').map((origin) => origin.trim()).filter(Boolean),
  env: {
    pilotTests: whole('COMPANY_PILOT_TESTS', 10),
    selfServe: (Deno.env.get('COMPANY_SELF_SERVE') ?? 'true') !== 'false',
    aiDailyLimit: whole('COMPANY_AI_DAILY_LIMIT', 300),
    appUrl: (Deno.env.get('COMPANY_APP_URL') ?? 'https://company.schood.online').replace(/\/+$/, ''),
  },
  // Every AI call goes through the English gateway, so it is logged in english_ai_calls
  // and can be switched off per feature from the English control centre.
  ai: callEnglishAIWithStatus as unknown as AiCall,
  routes: allRoutes,
}));
