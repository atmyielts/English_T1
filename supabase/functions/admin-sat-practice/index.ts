import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAdminRequest } from "../_shared/admin-access.ts";
import { createAdminHandler } from "./handler.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-jwt",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    return new Response(JSON.stringify({ error: "Not configured" }), { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  return createAdminHandler({
    cors: corsHeaders,
    authorize: async (request) => {
      const result = await authorizeAdminRequest(sb, request, corsHeaders, { requiredPermission: "admin.products.manage", action: "admin.sat_practice" });
      return result.ok ? { ok: true, userId: result.context.userId } : { ok: false, response: result.response };
    },
    rpc: async (name, args) => await sb.rpc(name, args),
  })(req);
});
