import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAdminRequest } from "../_shared/admin-access.ts";

type Json = Record<string, unknown>;

type ProductRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  description: string | null;
  metadata: Json | null;
  created_at: string;
};

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

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const normalizeText = (value: unknown, maxLen = 400): string => String(value ?? "").trim().slice(0, maxLen);

const normalizeMetadata = (value: unknown): Json => (isObject(value) ? (value as Json) : {});

const allowedTypes = new Set(["exam", "practice", "tool", "course"]);
const allowedStatuses = new Set(["draft", "active", "disabled", "archived"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
    const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
      requiredPermission: "admin.products.manage",
      action: "admin.products",
    });
    if (!authz.ok) return authz.response;

    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname.endsWith("/list")) {
      const query = normalizeText(url.searchParams.get("query"), 160).toLowerCase();
      const status = normalizeText(url.searchParams.get("status"), 32).toLowerCase();
      const limitRaw = Number(url.searchParams.get("limit") ?? 200);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 200;

      let q = sb
        .from("products")
        .select("id,name,type,status,description,metadata,created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (query) q = q.or(`name.ilike.%${query}%,type.ilike.%${query}%,status.ilike.%${query}%`);
      if (status) q = q.eq("status", status);

      const { data, error } = await q;
      if (error) throw error;

      return new Response(JSON.stringify({ products: (data ?? []) as ProductRow[] }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (req.method === "POST" && url.pathname.endsWith("/create")) {
      const body = (await req.json()) as Record<string, unknown>;
      const name = normalizeText(body?.name, 180);
      const type = normalizeText(body?.type, 32).toLowerCase() || "exam";
      const status = normalizeText(body?.status, 32).toLowerCase() || "draft";
      const description = normalizeText(body?.description, 2000) || null;
      const metadata = normalizeMetadata(body?.metadata);

      if (!name) {
        return new Response(JSON.stringify({ error: "name is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      if (!allowedTypes.has(type)) {
        return new Response(JSON.stringify({ error: "Invalid type" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      if (!allowedStatuses.has(status)) {
        return new Response(JSON.stringify({ error: "Invalid status" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { data, error } = await sb
        .from("products")
        .insert({
          name,
          type,
          status,
          description,
          metadata,
        })
        .select("id,name,type,status,description,metadata,created_at")
        .maybeSingle();
      if (error) throw error;

      return new Response(JSON.stringify({ product: data ?? null }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (req.method === "PATCH" && url.pathname.endsWith("/update")) {
      const body = (await req.json()) as Record<string, unknown>;
      const productId = normalizeText(body?.product_id, 64);
      const patch = isObject(body?.patch) ? body.patch : {};

      if (!productId) {
        return new Response(JSON.stringify({ error: "product_id is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const update: Record<string, unknown> = {};
      if (typeof patch.name === "string") {
        const name = normalizeText(patch.name, 180);
        if (!name) {
          return new Response(JSON.stringify({ error: "name cannot be empty" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        update.name = name;
      }
      if (typeof patch.type === "string") {
        const type = normalizeText(patch.type, 32).toLowerCase();
        if (!allowedTypes.has(type)) {
          return new Response(JSON.stringify({ error: "Invalid type" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        update.type = type;
      }
      if (typeof patch.status === "string") {
        const status = normalizeText(patch.status, 32).toLowerCase();
        if (!allowedStatuses.has(status)) {
          return new Response(JSON.stringify({ error: "Invalid status" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        update.status = status;
      }
      if (typeof patch.description === "string" || patch.description === null) {
        update.description = patch.description ? normalizeText(patch.description, 2000) : null;
      }
      if ("metadata" in patch) {
        update.metadata = normalizeMetadata(patch.metadata);
      }

      if (Object.keys(update).length === 0) {
        return new Response(JSON.stringify({ error: "No patch fields provided" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { data, error } = await sb
        .from("products")
        .update(update)
        .eq("id", productId)
        .select("id,name,type,status,description,metadata,created_at")
        .maybeSingle();
      if (error) throw error;

      return new Response(JSON.stringify({ product: data ?? null }), {
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
