import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import type { MintedSession } from './runtime.ts';

// Telegram Mini App sign-in in the deployed function: the Supabase admin API
// generates a magic-link token for a person already linked to Telegram, and the
// token is verified here at once, so it never travels anywhere. Its own clients
// (never core's shared service client, whose session must stay the service role).
// Loaded only when a Mini App signs in.

const read = (name: string) => { const value = Deno.env.get(name); if (!value) throw new Error(`Missing ${name}`); return value; };
let admin: ReturnType<typeof createClient> | null = null;
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export async function mintSession(userId: string): Promise<MintedSession | null> {
  admin ??= createClient(read('SUPABASE_URL'), read('SUPABASE_SERVICE_ROLE_KEY'), options);
  const { data: found, error: lookup } = await admin.auth.admin.getUserById(userId);
  const email = found?.user?.email;
  if (lookup || !email) return null;
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const hash = link?.properties?.hashed_token;
  if (linkError || !hash) return null;
  // A throwaway client per sign-in: verifying stores the person's session on it.
  const verify = createClient(read('SUPABASE_URL'), read('SUPABASE_ANON_KEY'), options);
  const { data, error } = await verify.auth.verifyOtp({ type: 'magiclink', token_hash: hash });
  if (error || !data.session || data.session.user.id !== userId) return null;
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token, expires_at: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600 };
}
