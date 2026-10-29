import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import type { CoachPack } from '../../../../packages/coach-packs/src/mod.ts';
import type { CoachConfig, CoachRuntime } from './runtime.ts';
import { safeEnv } from './runtime.ts';
import { createPostgresCoachStore, type CoachDatabase } from './store-postgres.ts';

// The deployed coach runtime: the coach tables through the service role, and Mini
// App sign-in through the Supabase admin API (a magic-link token generated and
// verified on the server, never sent anywhere), for people already linked to
// Telegram. Loaded only in the deployed function.

export function productionRuntime(packs: ReadonlyMap<string, CoachPack>, config: CoachConfig): CoachRuntime {
  const url = safeEnv('SUPABASE_URL')!, serviceKey = safeEnv('SUPABASE_SERVICE_ROLE_KEY')!, anon = safeEnv('SUPABASE_ANON_KEY') ?? '';
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    store: createPostgresCoachStore(service as unknown as CoachDatabase),
    packs,
    config,
    async mintSession(userId) {
      const { data: found, error: lookup } = await service.auth.admin.getUserById(userId);
      const email = found?.user?.email;
      if (lookup || !email) return null;
      const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: 'magiclink', email });
      const hash = link?.properties?.hashed_token;
      if (linkError || !hash) return null;
      const { data, error } = await auth.auth.verifyOtp({ type: 'magiclink', token_hash: hash });
      if (error || !data.session || data.session.user.id !== userId) return null;
      return { access_token: data.session.access_token, refresh_token: data.session.refresh_token, expires_at: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600 };
    },
  };
}
