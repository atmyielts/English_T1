import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type EntitlementRow = {
  resource_type: string;
  resource_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

type SponsoredRow = {
  grant_type: string;
  resource_type: string | null;
  resource_id: string | null;
  starts_at: string;
  expires_at: string | null;
  status: string;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-jwt",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const getBearerToken = (req: Request): string | null => {
  const auth = req.headers.get("Authorization") ?? "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  if (auth.trim()) return auth.trim();
  const xUserJwt = req.headers.get("x-user-jwt") ?? "";
  if (xUserJwt.trim()) return xUserJwt.trim();
  return null;
};

const isWithinWindow = (startsAt: string | null, endsAt: string | null): boolean => {
  const now = Date.now();
  const s = startsAt ? Date.parse(startsAt) : NaN;
  const e = endsAt ? Date.parse(endsAt) : NaN;
  if (Number.isFinite(s) && now < s) return false;
  if (Number.isFinite(e) && now > e) return false;
  return true;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");
    const serviceRole = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Unauthorized" });

    // Validate JWT with anon key client (same path as frontend auth).
    const authClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
    // Use service-role client only for privileged reads.
    const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData?.user) return json(401, { error: "Unauthorized" });

    const user = authData.user;

    const { data: memberships, error: mErr } = await sb
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1);

    if (mErr) return json(500, { error: "Failed to load memberships", detail: mErr.message });
    const tenantId = memberships?.[0]?.tenant_id ?? null;

    let personalRows: EntitlementRow[] = [];
    if (tenantId) {
      const { data, error } = await sb
        .from("entitlements")
        .select("resource_type, resource_id, starts_at, ends_at")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .eq("resource_type", "product");
      if (error) return json(500, { error: "Failed to load personal entitlements", detail: error.message });
      personalRows = (data ?? []) as EntitlementRow[];
    }

    const { data: sponsoredData, error: sErr } = await sb
      .from("academy_entitlements")
      .select("grant_type, resource_type, resource_id, starts_at, expires_at, status")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (sErr) return json(500, { error: "Failed to load sponsored entitlements", detail: sErr.message });

    const sponsoredRows = (sponsoredData ?? []) as SponsoredRow[];

    const personalProductIds = Array.from(
      new Set(
        personalRows
          .filter((r) => r.resource_type === "product" && r.resource_id && isWithinWindow(r.starts_at, r.ends_at))
          .map((r) => String(r.resource_id)),
      ),
    );

    const sponsoredProductIds = Array.from(
      new Set(
        sponsoredRows
          .filter((r) => r.grant_type === "product_access" && String(r.resource_type ?? "") === "product" && r.resource_id)
          .filter((r) => isWithinWindow(r.starts_at, r.expires_at))
          .map((r) => String(r.resource_id)),
      ),
    );

    const effective = Array.from(new Set([...personalProductIds, ...sponsoredProductIds]));

    const productId = new URL(req.url).searchParams.get("product_id");
    const hasAccess = productId ? effective.includes(productId) : null;

    return json(200, {
      user: { id: user.id, email: user.email ?? null },
      tenant_id: tenantId,
      personal_product_ids: personalProductIds,
      sponsored_product_ids: sponsoredProductIds,
      effective_product_ids: effective,
      has_access: hasAccess,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(500, { error: message });
  }
});
