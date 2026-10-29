import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { loadPacks } from '../../../packages/coach-packs/src/registry.ts';
import { configFromEnv } from '../schood-ai/coach/runtime.ts';
import { createPostgresCoachStore, type CoachDatabase } from '../schood-ai/coach/store-postgres.ts';
import type { NotifyDecision } from '../schood-ai/types.ts';
import { createGateHandler } from './handler.ts';

// schood-coach-gate Edge Function: env wiring only (handler.ts).

const required = (name: string) => { const value = Deno.env.get(name); if (!value) throw new Error(`Missing ${name}`); return value; };
const service = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const store = createPostgresCoachStore(service as unknown as CoachDatabase);
const packs = loadPacks();

Deno.serve(createGateHandler({
  secret: Deno.env.get('SCHOOD_AI_SERVICE_SECRET') ?? null,
  deps: {
    store, packs, config: configFromEnv((name) => Deno.env.get(name)),
    now: () => new Date(),
    async notify(userId, channel, take): Promise<NotifyDecision> {
      const { data, error } = await service.rpc('ai_notify', { p_user: userId, p_channel: channel, p_take: take });
      if (error) throw new Error(error.message);
      const row = data as { allowed: boolean; remaining?: number; reason?: 'quiet_hours' | 'daily_limit'; retry_at?: string };
      return row.allowed ? { allowed: true, remaining: Number(row.remaining ?? 0) } : { allowed: false, reason: row.reason ?? 'daily_limit', retryAt: String(row.retry_at) };
    },
    async nameOf(userId) {
      const { data } = await service.from('users').select('full_name').eq('id', userId).maybeSingle();
      const name = typeof data?.full_name === 'string' ? data.full_name.trim().split(/\s+/)[0] : '';
      return name ? name.slice(0, 40) : null;
    },
  },
}));
