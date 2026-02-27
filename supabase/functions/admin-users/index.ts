import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAdminRequest } from "../_shared/admin-access.ts";

type Json = Record<string, unknown>;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

const getEntitlementTargets = (productId: string): string[] => [productId];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
    const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
      requiredPermission: "admin.users.manage",
      action: "admin.users",
    });
    if (!authz.ok) return authz.response;

    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname.endsWith("/list")) {
      const limitRaw = Number(url.searchParams.get("limit") ?? 50);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 50;
      const query = String(url.searchParams.get("query") ?? "").trim().toLowerCase();

      let q = sb
        .from("users")
        .select("id, email, role, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (query) {
        q = q.or(`email.ilike.%${query}%,role.ilike.%${query}%`);
      }

      const { data: users, error: usersErr } = await q;
      if (usersErr) throw usersErr;

      return new Response(JSON.stringify({ users: users ?? [] }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (req.method === "GET" && url.pathname.endsWith("/search")) {
      const email = String(url.searchParams.get("email") ?? "").trim().toLowerCase();
      if (!email) {
        return new Response(JSON.stringify({ error: "email is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { data: userRow, error: userErr } = await sb
        .from("users")
        .select("id, email, role, created_at")
        .ilike("email", email)
        .maybeSingle();

      if (userErr) throw userErr;
      if (!userRow) {
        return new Response(JSON.stringify({ user: null, memberships: [], tenants: [], entitlements: [], products: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const userId = String((userRow as any).id);

      const { data: memberships, error: memErr } = await sb
        .from("tenant_memberships")
        .select("tenant_id, role, status, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      if (memErr) throw memErr;

      const tenantIds = (memberships ?? []).map((m: any) => m.tenant_id).filter(Boolean);
      if (tenantIds.length === 0) {
        return new Response(JSON.stringify({
          user: userRow,
          memberships: memberships ?? [],
          tenants: [],
          entitlements: [],
          products: [],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      const { data: tenants, error: tenantErr } = await sb
        .from("tenants")
        .select("id, name, slug, type, created_at")
        .in("id", tenantIds);
      if (tenantErr) throw tenantErr;

      const { data: entitlements, error: entErr } = await sb
        .from("entitlements")
        .select("id, tenant_id, resource_type, resource_id, is_active, starts_at, ends_at, source, created_at, value")
        .in("tenant_id", tenantIds)
        .order("created_at", { ascending: false });
      if (entErr) throw entErr;

      const productIds = Array.from(
        new Set(
          (entitlements ?? [])
            .filter((entry: any) => String(entry?.resource_type ?? "") === "product")
            .map((entry: any) => String(entry?.resource_id ?? "").trim())
            .filter(Boolean),
        ),
      );
      const { data: products, error: productsErr } = await sb
        .from("products")
        .select("id, name, type, status, metadata")
        .in("id", productIds.length > 0 ? productIds : ["00000000-0000-0000-0000-000000000000"]);
      if (productsErr) throw productsErr;

      return new Response(JSON.stringify({
        user: userRow,
        memberships: memberships ?? [],
        tenants: tenants ?? [],
        entitlements: entitlements ?? [],
        products: products ?? [],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (req.method === "PATCH" && url.pathname.endsWith("/role")) {
      const body = (await req.json()) as unknown;
      if (!isObject(body)) {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const userId = String((body as any).user_id ?? "");
      const role = String((body as any).role ?? "").trim();
      if (!userId || !role) {
        return new Response(JSON.stringify({ error: "user_id and role are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      const normalizedRole = role.toLowerCase();
      const allowedRoles = new Set(["user", "admin", "admin_readonly", "admin_ops", "admin_commerce", "admin_content"]);
      if (!allowedRoles.has(normalizedRole)) {
        return new Response(JSON.stringify({ error: "role is not allowed" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { data: updated, error: updateErr } = await sb
        .from("users")
        .update({ role: normalizedRole })
        .eq("id", userId)
        .select("id,email,role")
        .maybeSingle();
      if (updateErr) throw updateErr;

      if (normalizedRole === "admin" && updated?.email) {
        // Keep platform_admins in sync for bootstrap flows.
        const { error: insErr } = await sb.from("platform_admins").insert({ email: updated.email });
        if (insErr && String((insErr as any).code ?? "") !== "23505") throw insErr;
      }

      return new Response(JSON.stringify({ user: updated ?? null }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (req.method === "POST" && url.pathname.endsWith("/grant-product")) {
      const body = (await req.json()) as any;
      const productId = String(body?.product_id ?? "");
      const tenantIdRaw = body?.tenant_id ? String(body.tenant_id) : null;
      const userIdRaw = body?.user_id ? String(body.user_id) : null;

      if (!productId) {
        return new Response(JSON.stringify({ error: "product_id is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      let tenantId: string | null = tenantIdRaw;
      let userId: string | null = userIdRaw;

      if (!tenantId) {
        const email = body?.email ? String(body.email).trim().toLowerCase() : null;
        if (email && !userId) {
          const { data: userRow } = await sb.from("users").select("id").ilike("email", email).maybeSingle();
          userId = userRow?.id ?? null;
        }

        if (!userId) {
          return new Response(JSON.stringify({ error: "tenant_id or user_id/email is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const { data: membership } = await sb
          .from("tenant_memberships")
          .select("tenant_id")
          .eq("user_id", userId)
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        tenantId = membership?.tenant_id ?? null;
      }

      if (!tenantId) {
        return new Response(JSON.stringify({ error: "No tenant found for user" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const nowIso = new Date().toISOString();
      const days = typeof body?.days === "number" && Number.isFinite(body.days) ? Math.max(0, body.days) : null;
      const endsAtRaw = typeof body?.ends_at === "string" ? body.ends_at : null;
      const endsAt = endsAtRaw ? endsAtRaw : days && days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null;

      const targetProductIds = getEntitlementTargets(productId);
      const payload = targetProductIds.map((pid) => ({
        tenant_id: tenantId,
        user_id: userId,
        resource_type: "product",
        resource_id: pid,
        is_active: true,
        starts_at: nowIso,
        ends_at: endsAt,
        source: "admin",
      }));

      const { error: grantErr } = await sb
        .from("entitlements")
        .upsert(payload, { onConflict: "tenant_id,resource_type,resource_id" });

      if (grantErr) throw grantErr;

      const { data: entitlement } = await sb
        .from("entitlements")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("resource_type", "product")
        .eq("resource_id", productId)
        .maybeSingle();

      return new Response(JSON.stringify({ entitlement: entitlement ?? null }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (req.method === "POST" && url.pathname.endsWith("/revoke-product")) {
      const body = (await req.json()) as any;
      const tenantId = String(body?.tenant_id ?? "");
      const productId = String(body?.product_id ?? "");
      if (!tenantId || !productId) {
        return new Response(JSON.stringify({ error: "tenant_id and product_id are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const targetProductIds = getEntitlementTargets(productId);
      const { data: updated, error: revokeErr } = await sb
        .from("entitlements")
        .update({ is_active: false, ends_at: new Date().toISOString(), source: "admin_revoke" })
        .eq("tenant_id", tenantId)
        .eq("resource_type", "product")
        .in("resource_id", targetProductIds)
        .select("*");

      if (revokeErr) throw revokeErr;

      const primary = (updated ?? []).find((row: any) => String(row?.resource_id ?? "") === productId) ?? null;

      return new Response(JSON.stringify({ entitlement: primary }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
