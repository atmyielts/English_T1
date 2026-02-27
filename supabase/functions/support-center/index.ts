import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAdminRequest } from "../_shared/admin-access.ts";

type Json = Record<string, unknown>;

type SupportLinkInput = {
  id?: string;
  label?: string;
  type?: string;
  value?: string;
  is_active?: boolean;
  display_order?: number;
  metadata?: Json;
};

type SupportMessageInput = {
  name?: string;
  email?: string;
  telegram?: string;
  subject?: string;
  message?: string;
  source?: string;
  service_slug?: string;
  metadata?: Json;
};

type PlatformAnnouncementInput = {
  id?: string;
  title?: string;
  body?: string;
  cta_label?: string | null;
  cta_href?: string | null;
  audience?: string;
  is_active?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  priority?: number;
  metadata?: Json;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-jwt",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const normalizeText = (value: unknown, maxLen = 500): string => String(value ?? "").trim().slice(0, maxLen);

const normalizeEmail = (value: unknown): string => normalizeText(value, 320).toLowerCase();

const emailLooksValid = (email: string): boolean => /.+@.+\..+/.test(email);

const toNumberOrDefault = (value: unknown, fallback: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
};

const clampNumber = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const normalizeIsoOrNull = (value: unknown): string | null => {
  const raw = normalizeText(value, 80);
  if (!raw) return null;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) throw new Error("Invalid datetime format");
  return dt.toISOString();
};

const getBearerToken = (req: Request): string | null => {
  const auth = req.headers.get("Authorization") ?? "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  if (auth.trim()) return auth.trim();
  const fromUserJwt = req.headers.get("x-user-jwt") ?? "";
  return fromUserJwt.trim() || null;
};

const getAuthUser = async (sb: any, req: Request): Promise<{ id: string; email: string | null } | null> => {
  const token = getBearerToken(req);
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const url = new URL(req.url);
    const action = normalizeText(url.searchParams.get("action"), 64).toLowerCase() || "links";

    if (req.method === "GET" && action === "links") {
      const { data, error } = await sb
        .from("support_links")
        .select("id,label,type,value,is_active,display_order,metadata")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return jsonResponse(200, { links: data ?? [] });
    }

    if (req.method === "GET" && action === "announcements") {
      const authUser = await getAuthUser(sb, req);
      const limit = clampNumber(toNumberOrDefault(url.searchParams.get("limit"), 40), 1, 200);
      const nowMs = Date.now();

      let query = sb
        .from("platform_announcements")
        .select("id,title,body,cta_label,cta_href,audience,is_active,starts_at,ends_at,priority,metadata,created_at,updated_at")
        .eq("is_active", true)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(500);

      if (authUser) {
        query = query.in("audience", ["all", "authenticated"]);
      } else {
        query = query.eq("audience", "all");
      }

      const { data, error } = await query;
      if (error) throw error;

      const visible = (data ?? []).filter((item) => {
        const startsAt = item.starts_at ? Date.parse(String(item.starts_at)) : Number.NaN;
        const endsAt = item.ends_at ? Date.parse(String(item.ends_at)) : Number.NaN;
        const startsOk = !Number.isFinite(startsAt) || startsAt <= nowMs;
        const endsOk = !Number.isFinite(endsAt) || endsAt >= nowMs;
        return startsOk && endsOk;
      }).slice(0, limit);

      return jsonResponse(200, { announcements: visible });
    }

    if (req.method === "POST" && action === "message") {
      const body = (await req.json()) as SupportMessageInput;
      const authUser = await getAuthUser(sb, req);

      const name = normalizeText(body?.name, 120);
      const email = normalizeEmail(body?.email);
      const telegram = normalizeText(body?.telegram, 120) || null;
      const subject = normalizeText(body?.subject, 180) || null;
      const message = normalizeText(body?.message, 4000);
      const source = normalizeText(body?.source || "platform", 64) || "platform";
      const serviceSlug = normalizeText(body?.service_slug, 120) || null;
      const metadata = body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? body.metadata
        : {};

      if (!name || !email || !message) {
        return jsonResponse(400, { error: "name, email, and message are required" });
      }
      if (!emailLooksValid(email)) {
        return jsonResponse(400, { error: "Invalid email" });
      }

      const { data, error } = await sb
        .from("support_messages")
        .insert({
          user_id: authUser?.id ?? null,
          name,
          email,
          telegram,
          subject,
          message,
          source,
          service_slug: serviceSlug,
          metadata,
          status: "new",
        })
        .select("id,created_at,status")
        .maybeSingle();

      if (error) throw error;

      return jsonResponse(200, { ok: true, message: data });
    }

    if (req.method === "GET" && action === "admin-announcements") {
      const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
        requiredPermission: "admin.announcements.manage",
        action: "admin.announcements.list",
      });
      if (!authz.ok) return authz.response;
      const limit = clampNumber(toNumberOrDefault(url.searchParams.get("limit"), 200), 1, 500);
      const { data, error } = await sb
        .from("platform_announcements")
        .select("id,title,body,cta_label,cta_href,audience,is_active,starts_at,ends_at,priority,metadata,created_by,updated_by,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return jsonResponse(200, { announcements: data ?? [] });
    }

    if (req.method === "POST" && action === "admin-announcement") {
      const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
        requiredPermission: "admin.announcements.manage",
        action: "admin.announcements.save",
      });
      if (!authz.ok) return authz.response;
      const body = (await req.json()) as PlatformAnnouncementInput;

      const title = normalizeText(body?.title, 200);
      const messageBody = normalizeText(body?.body, 5000);
      const ctaLabel = normalizeText(body?.cta_label, 80) || null;
      const ctaHref = normalizeText(body?.cta_href, 500) || null;
      const audience = normalizeText(body?.audience || "all", 32).toLowerCase() || "all";
      const isActive = body?.is_active ?? true;
      const priority = clampNumber(toNumberOrDefault(body?.priority, 100), 0, 10000);
      const metadata = body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? body.metadata
        : {};

      let startsAt: string | null;
      let endsAt: string | null;
      try {
        startsAt = normalizeIsoOrNull(body?.starts_at);
        endsAt = normalizeIsoOrNull(body?.ends_at);
      } catch (_err) {
        return jsonResponse(400, { error: "Invalid starts_at or ends_at datetime format" });
      }

      if (!title || !messageBody) {
        return jsonResponse(400, { error: "title and body are required" });
      }
      if (!["all", "authenticated"].includes(audience)) {
        return jsonResponse(400, { error: "audience must be one of: all, authenticated" });
      }
      if (startsAt && endsAt && startsAt > endsAt) {
        return jsonResponse(400, { error: "starts_at must be earlier than or equal to ends_at" });
      }

      if (body?.id) {
        const { data, error } = await sb
          .from("platform_announcements")
          .update({
            title,
            body: messageBody,
            cta_label: ctaLabel,
            cta_href: ctaHref,
            audience,
            is_active: Boolean(isActive),
            starts_at: startsAt,
            ends_at: endsAt,
            priority,
            metadata,
            updated_by: authz.context.userId,
          })
          .eq("id", body.id)
          .select("id,title,body,cta_label,cta_href,audience,is_active,starts_at,ends_at,priority,metadata,created_by,updated_by,created_at,updated_at")
          .maybeSingle();
        if (error) throw error;
        return jsonResponse(200, { announcement: data });
      }

      const { data, error } = await sb
        .from("platform_announcements")
        .insert({
          title,
          body: messageBody,
          cta_label: ctaLabel,
          cta_href: ctaHref,
          audience,
          is_active: Boolean(isActive),
          starts_at: startsAt,
          ends_at: endsAt,
          priority,
          metadata,
          created_by: authz.context.userId,
          updated_by: authz.context.userId,
        })
        .select("id,title,body,cta_label,cta_href,audience,is_active,starts_at,ends_at,priority,metadata,created_by,updated_by,created_at,updated_at")
        .maybeSingle();
      if (error) throw error;
      return jsonResponse(200, { announcement: data });
    }

    if (req.method === "GET" && action === "admin-links") {
      const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
        requiredPermission: "admin.support.manage",
        action: "admin.support.links.list",
      });
      if (!authz.ok) return authz.response;
      const { data, error } = await sb
        .from("support_links")
        .select("id,label,type,value,is_active,display_order,metadata,created_at,updated_at")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return jsonResponse(200, { links: data ?? [] });
    }

    if (req.method === "POST" && action === "admin-link") {
      const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
        requiredPermission: "admin.support.manage",
        action: "admin.support.links.save",
      });
      if (!authz.ok) return authz.response;
      const body = (await req.json()) as SupportLinkInput;

      const label = normalizeText(body?.label, 120);
      const type = normalizeText(body?.type, 32).toLowerCase();
      const value = normalizeText(body?.value, 500);
      const isActive = body?.is_active ?? true;
      const displayOrder = toNumberOrDefault(body?.display_order, 100);
      const metadata = body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? body.metadata
        : {};

      if (!label || !type || !value) {
        return jsonResponse(400, { error: "label, type, and value are required" });
      }
      if (!["email", "telegram", "url"].includes(type)) {
        return jsonResponse(400, { error: "type must be one of: email, telegram, url" });
      }

      if (body?.id) {
        const { data, error } = await sb
          .from("support_links")
          .update({
            label,
            type,
            value,
            is_active: Boolean(isActive),
            display_order: displayOrder,
            metadata,
          })
          .eq("id", body.id)
          .select("id,label,type,value,is_active,display_order,metadata,created_at,updated_at")
          .maybeSingle();

        if (error) throw error;
        return jsonResponse(200, { link: data });
      }

      const { data, error } = await sb
        .from("support_links")
        .insert({
          label,
          type,
          value,
          is_active: Boolean(isActive),
          display_order: displayOrder,
          metadata,
          created_by: authz.context.userId,
        })
        .select("id,label,type,value,is_active,display_order,metadata,created_at,updated_at")
        .maybeSingle();

      if (error) throw error;
      return jsonResponse(200, { link: data });
    }

    if (req.method === "DELETE" && action === "admin-link") {
      const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
        requiredPermission: "admin.support.manage",
        action: "admin.support.links.delete",
      });
      if (!authz.ok) return authz.response;
      const linkId = normalizeText(url.searchParams.get("id"), 64);
      if (!linkId) return jsonResponse(400, { error: "id is required" });

      const { error } = await sb.from("support_links").delete().eq("id", linkId);
      if (error) throw error;

      return jsonResponse(200, { ok: true });
    }

    if (req.method === "DELETE" && action === "admin-announcement") {
      const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
        requiredPermission: "admin.announcements.manage",
        action: "admin.announcements.delete",
      });
      if (!authz.ok) return authz.response;
      const announcementId = normalizeText(url.searchParams.get("id"), 64);
      if (!announcementId) return jsonResponse(400, { error: "id is required" });

      const { error } = await sb.from("platform_announcements").delete().eq("id", announcementId);
      if (error) throw error;

      return jsonResponse(200, { ok: true });
    }

    if (req.method === "GET" && action === "admin-messages") {
      const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
        requiredPermission: "admin.support.manage",
        action: "admin.support.messages.list",
      });
      if (!authz.ok) return authz.response;
      const status = normalizeText(url.searchParams.get("status"), 32).toLowerCase();
      const query = normalizeText(url.searchParams.get("query"), 160).toLowerCase();
      const limit = Math.max(1, Math.min(500, toNumberOrDefault(url.searchParams.get("limit"), 100)));

      let q = sb
        .from("support_messages")
        .select("id,user_id,name,email,telegram,subject,message,source,service_slug,status,admin_note,metadata,handled_by,handled_at,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (status && status !== "all") {
        q = q.eq("status", status);
      }
      if (query) {
        q = q.or(`name.ilike.%${query}%,email.ilike.%${query}%,subject.ilike.%${query}%,message.ilike.%${query}%`);
      }

      const { data, error } = await q;
      if (error) throw error;

      return jsonResponse(200, { messages: data ?? [] });
    }

    if (req.method === "PATCH" && action === "admin-message") {
      const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
        requiredPermission: "admin.support.manage",
        action: "admin.support.messages.update",
      });
      if (!authz.ok) return authz.response;
      const body = (await req.json()) as { id?: string; status?: string; admin_note?: string | null };

      const id = normalizeText(body?.id, 64);
      if (!id) return jsonResponse(400, { error: "id is required" });

      const patch: Record<string, unknown> = {};

      if (typeof body?.status === "string" && body.status.trim()) {
        const status = body.status.trim().toLowerCase();
        if (!["new", "in_progress", "resolved", "closed"].includes(status)) {
          return jsonResponse(400, { error: "Invalid status" });
        }
        patch.status = status;
      }

      if (body?.admin_note !== undefined) {
        patch.admin_note = body.admin_note ? normalizeText(body.admin_note, 4000) : null;
      }

      if (patch.status || patch.admin_note !== undefined) {
        patch.handled_by = authz.context.userId;
        patch.handled_at = new Date().toISOString();
      }

      if (Object.keys(patch).length === 0) {
        return jsonResponse(400, { error: "No changes provided" });
      }

      const { data, error } = await sb
        .from("support_messages")
        .update(patch)
        .eq("id", id)
        .select("id,user_id,name,email,telegram,subject,message,source,service_slug,status,admin_note,metadata,handled_by,handled_at,created_at,updated_at")
        .maybeSingle();

      if (error) throw error;
      return jsonResponse(200, { message: data });
    }

    return jsonResponse(404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return jsonResponse(status, { error: message });
  }
});
