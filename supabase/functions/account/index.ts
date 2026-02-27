import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-jwt",
  "Access-Control-Allow-Methods": "DELETE, OPTIONS",
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const getBearerToken = (req: Request): string | null => {
  const xUser = req.headers.get("x-user-jwt");
  if (xUser && xUser.trim()) return xUser.trim();
  const header = req.headers.get("Authorization") ?? "";
  if (!header) return null;
  const value = header.startsWith("Bearer ") ? header.slice(7) : header;
  if (value.startsWith("sb_")) return null;
  return value;
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "DELETE") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Unauthorized" });

    const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const { data: authData, error: authError } = await sb.auth.getUser(token);
    if (authError || !authData?.user) return json(401, { error: "Unauthorized" });

    const userId = authData.user.id;

    const { error: deleteError } = await sb.auth.admin.deleteUser(userId);
    if (deleteError) return json(500, { error: "Failed to delete account", details: deleteError });

    return json(200, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(500, { error: message });
  }
});
