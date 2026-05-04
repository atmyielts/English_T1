import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const shouldIncludeAdminPayload = (url: URL): boolean => {
  const raw = url.searchParams.get("admin") ?? url.searchParams.get("include_admin");
  if (raw == null) return true;
  const normalized = raw.trim().toLowerCase();
  return !(normalized === "0" || normalized === "false" || normalized === "no");
};

serve(async (req) => {
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
    const url = new URL(req.url);
    const includeAdminPayload = shouldIncludeAdminPayload(url);
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
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

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const [profileRes, membershipsRes] = await Promise.all([
      serviceClient.from("users").select("role").eq("id", user.id).maybeSingle(),
      serviceClient
        .from("tenant_memberships")
        .select("tenant_id, role, status")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: true }),
    ]);

    const profileRow = profileRes.data;
    const role = profileRow?.role ?? null;
    const normalizedRole = String(role ?? "").trim().toLowerCase();

    if (membershipsRes.error) {
      return new Response(JSON.stringify({ error: "Failed to load memberships", details: membershipsRes.error }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const membershipRows = (membershipsRes.data ?? []) as MembershipRow[];
    const currentTenantId = membershipRows[0]?.tenant_id ?? null;

    let tenant = null;
    let entitlements: EntitlementRow[] = [];
    if (currentTenantId) {
      const [tenantRes, entitlementsRes] = await Promise.all([
        serviceClient
          .from("tenants")
          .select("id, name, slug, type")
          .eq("id", currentTenantId)
          .maybeSingle(),
        serviceClient
          .from("entitlements")
          .select("id, resource_type, resource_id, starts_at, ends_at, value")
          .eq("tenant_id", currentTenantId)
          .eq("is_active", true),
      ]);

      if (tenantRes.error) {
        return new Response(JSON.stringify({ error: "Failed to load tenant", details: tenantRes.error }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (entitlementsRes.error) {
        return new Response(JSON.stringify({ error: "Failed to load entitlements", details: entitlementsRes.error }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      tenant = tenantRes.data ?? null;
      entitlements = (entitlementsRes.data ?? []).filter(isActiveEntitlement) as EntitlementRow[];
    }

    let adminPayload: {
      is_admin: boolean;
      permissions: string[];
      session_aal: string | null;
      security_policy: AdminSecurityPolicyRow | null;
    } | null = null;

    if (includeAdminPayload && normalizedRole.startsWith("admin")) {
      let permissions: string[] = normalizedRole === "admin" ? ["admin.*"] : [];
      let policyData: Record<string, unknown> | null = null;
      try {
        const [permsRes, policyRes] = await Promise.all([
          serviceClient.rpc("admin_effective_permissions", {
            p_user_id: user.id,
            p_role: normalizedRole,
          }),
          serviceClient
            .from("admin_security_policies")
            .select("require_mfa, session_timeout_minutes, rate_limit_per_minute, ip_allowlist")
            .eq("id", 1)
            .maybeSingle(),
        ]);
        const permsData = permsRes.data;
        if (Array.isArray(permsData)) {
          permissions = permsData
            .map((row: unknown) => {
              if (typeof row === "string") return row;
              if (row && typeof row === "object" && "permission_key" in row) {
                return String((row as Record<string, unknown>).permission_key ?? "");
              }
              return "";
            })
            .map((value) => value.trim())
            .filter(Boolean);
        }
        policyData = (policyRes.data as Record<string, unknown> | null) ?? null;
      } catch {
        // Keep role-derived fallback permissions.
      }

      let securityPolicy: AdminSecurityPolicyRow | null = null;
      if (policyData) {
        securityPolicy = {
          require_mfa: false,
          session_timeout_minutes: Number(policyData.session_timeout_minutes ?? 30),
          rate_limit_per_minute: Number(policyData.rate_limit_per_minute ?? 120),
          ip_allowlist: Array.isArray(policyData.ip_allowlist)
            ? (policyData.ip_allowlist as unknown[]).map((item) => String(item ?? "")).filter(Boolean)
            : [],
        };
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
});
