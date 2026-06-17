// Admin-only edge function that lists recent rows from
// public.app_function_error_log. Use this from an admin page when you need to
// see what an edge function actually threw — Supabase's built-in logs are
// gated behind a personal access token we don't ship with deploy creds.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAdminRequest } from "../_shared/admin-access.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-jwt",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
      requiredPermission: "admin.analytics.view",
      action: "admin.function_errors",
    });
    if (!authz.ok) return authz.response;

    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") ?? 50)));
    const fn = url.searchParams.get("function_name");
    const since = url.searchParams.get("since"); // ISO

    let query = sb
      .from("app_function_error_log")
      .select("id, function_name, route, http_status, user_id, error_message, error_stack, request_summary, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (fn) query = query.eq("function_name", fn);
    if (since) query = query.gte("occurred_at", since);

    const { data, error } = await query;
    if (error) return json(500, { error: error.message });

    return json(200, { ok: true, rows: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(500, { error: message });
  }
});
