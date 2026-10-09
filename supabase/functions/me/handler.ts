import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadSecurityPolicy, resolvePermissions } from "../_shared/admin-access.ts";

type EntitlementRow = {
  id: string;
  resource_type: string;
  resource_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  value: Record<string, unknown> | null;
};

type MembershipRow = {
  tenant_id: string;
  role: string;
  status: string;
  tenants?: {
    id?: string;
    type?: string;
    metadata?: Record<string, unknown> | null;
  } | null;
};
type AdminSecurityPolicyRow = {
  require_mfa: boolean;
  session_timeout_minutes: number;
  rate_limit_per_minute: number;
  ip_allowlist: string[];
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const isActiveEntitlement = (row: EntitlementRow): boolean => {
  const now = Date.now();
  const startsAt = row.starts_at ? Date.parse(row.starts_at) : null;
  const endsAt = row.ends_at ? Date.parse(row.ends_at) : null;
  if (startsAt && now < startsAt) return false;
  if (endsAt && now > endsAt) return false;
  return true;
};

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const handleMe = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const user = userData.user;
    const tokenPayload = decodeJwtPayload(token) ?? {};

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const [{ data: profileRow, error: profileError }, { data: memberships, error: membershipError }] = await Promise.all([
      userClient.from("users").select("role,is_active").eq("id", user.id).maybeSingle(),
      userClient
        .from("tenant_memberships")
        .select("tenant_id, role, status, tenants ( id, type, metadata )")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: true }),
    ]);
    if (profileError) return new Response(JSON.stringify({ error: "Account checks temporarily unavailable" }), {
      status: 503, headers: { "Content-Type": "application/json", ...corsHeaders, "Cache-Control": "no-store" },
    });
    if (!profileRow || profileRow.is_active !== true) return new Response(JSON.stringify({ error: "Account is unavailable" }), {
      status: 403, headers: { "Content-Type": "application/json", ...corsHeaders, "Cache-Control": "no-store" },
    });
    const role = profileRow.role ?? null;
    const normalizedRole = String(role ?? "").trim().toLowerCase();

    if (membershipError) {
      return new Response(JSON.stringify({ error: "Failed to load memberships", details: membershipError }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const membershipRows = (memberships ?? []) as MembershipRow[];
    const currentTenantId = membershipRows[0]?.tenant_id ?? null;

    let tenant = null;
    let entitlements: EntitlementRow[] = [];
    if (currentTenantId) {
      const [{ data: tenantRow, error: tenantError }, { data: entitlementRows, error: entitlementError }] = await Promise.all([
        userClient.from("tenants").select("id, name, slug, type").eq("id", currentTenantId).maybeSingle(),
        userClient.from("entitlements")
          .select("id, resource_type, resource_id, starts_at, ends_at, value")
          .eq("tenant_id", currentTenantId).eq("is_active", true),
      ]);

      if (tenantError) {
        return new Response(JSON.stringify({ error: "Failed to load tenant", details: tenantError }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      tenant = tenantRow ?? null;

      if (entitlementError) {
        return new Response(JSON.stringify({ error: "Failed to load entitlements", details: entitlementError }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      entitlements = (entitlementRows ?? []).filter(isActiveEntitlement) as EntitlementRow[];
    }

    let adminPayload: {
      is_admin: boolean;
      permissions: string[];
      session_aal: string | null;
      security_policy: AdminSecurityPolicyRow | null;
    } | null = null;

    if (normalizedRole.startsWith("admin")) {
      let permissions: string[], securityPolicy: AdminSecurityPolicyRow;
      try {
        permissions = await resolvePermissions(serviceClient, user.id, normalizedRole);
        securityPolicy = await loadSecurityPolicy(serviceClient);
      } catch {
        return new Response(JSON.stringify({ error: "Admin security checks temporarily unavailable", code: "admin_security_unavailable" }), {
          status: 503, headers: { "Content-Type": "application/json", ...corsHeaders, "Cache-Control": "no-store" },
        });
      }

      adminPayload = {
        is_admin: true,
        permissions,
        session_aal: typeof tokenPayload.aal === "string" ? tokenPayload.aal : null,
        security_policy: securityPolicy,
      };
    }

    return new Response(
      JSON.stringify({
        user: { id: user.id, email: user.email, role },
        current_tenant: tenant,
        memberships: membershipRows,
        entitlements,
        admin: adminPayload,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};
