import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleAccountDeletion } from './handler.ts';

serve(async req => {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return new Response(JSON.stringify({ code: 'account_delete_unavailable', error: 'Account deletion is temporarily unavailable.' }), {
    status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
  });
  return await handleAccountDeletion(req, createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
});
