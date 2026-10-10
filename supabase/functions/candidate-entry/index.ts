import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleAtomicCandidateEntry } from './atomic.ts';

serve((req) => {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return new Response(JSON.stringify({ error: 'Exam entry is temporarily unavailable.' }), {
    status: 503, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return handleAtomicCandidateEntry(req, { sbDb: client, sbAuth: client });
});
