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

type SupportReplyInput = {
  message_id?: string;
  body?: string;
  channel?: string;
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

type PlatformAnnouncementReadInput = {
  announcement_ids?: unknown[];
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

const placeholderEmails = new Set(["telegram-lead@schood.online", "telegram@schood.online"]);

const usableReplyEmail = (email: string): string | null => {
  const normalized = normalizeEmail(email);
  if (!emailLooksValid(normalized)) return null;
  if (placeholderEmails.has(normalized)) return null;
  return normalized;
};

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

const isObject = (value: unknown): value is Json => Boolean(value && typeof value === "object" && !Array.isArray(value));

const supportMessageSelect =
  "id,user_id,name,email,telegram,subject,message,source,service_slug,status,admin_note,metadata,handled_by,handled_at,created_at,updated_at";

const supportReplySelect =
  "id,support_message_id,author_user_id,author_type,body,delivery_channel,delivery_status,delivery_target,delivery_error,provider_message_id,metadata,created_at";

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

const extractTelegramTarget = (message: Record<string, unknown>): string | null => {
  const metadata = isObject(message.metadata) ? message.metadata : {};
  const candidates = [
    metadata.telegram_chat_id,
    metadata.telegram_user_id,
    isObject(metadata.telegram_context) ? metadata.telegram_context.telegram_user_id : null,
    isObject(metadata.telegram_context) ? metadata.telegram_context.id : null,
    message.telegram,
  ];

  for (const candidate of candidates) {
    const value = normalizeText(candidate, 120);
    if (/^-?\d{5,}$/.test(value)) return value;
  }
  return null;
};

const chooseTelegramBotToken = (message: Record<string, unknown>): string => {
  const source = normalizeText(message.source, 80);
  const serviceSlug = normalizeText(message.service_slug, 80);
  if (source === "telegram_public_bot" || serviceSlug === "telegram-public") {
    return Deno.env.get("TELEGRAM_PUBLIC_BOT_TOKEN") || "";
  }
  return Deno.env.get("TELEGRAM_STUDENT_BOT_TOKEN") || "";
};

const sendTelegramReply = async (
  message: Record<string, unknown>,
  replyBody: string,
): Promise<{ ok: boolean; target: string | null; providerMessageId: string | null; error: string | null }> => {
  const target = extractTelegramTarget(message);
  if (!target) return { ok: false, target: null, providerMessageId: null, error: "No numeric Telegram chat id captured for this message" };

  const botToken = chooseTelegramBotToken(message);
  if (!botToken) return { ok: false, target, providerMessageId: null, error: "Telegram bot token is not configured" };

  const subject = normalizeText(message.subject, 120);
  const text = `Schood support replied${subject ? ` about "${subject}"` : ""}:\n\n${replyBody}`;
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: target, text }),
  });
  const payload = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok || payload.ok === false) {
    const description = normalizeText(payload.description, 500) || `Telegram send failed (${res.status})`;
    return { ok: false, target, providerMessageId: null, error: description };
  }
  const result = isObject(payload.result) ? payload.result : {};
  return {
    ok: true,
    target,
    providerMessageId: result.message_id ? String(result.message_id) : null,
    error: null,
  };
};

const buildMailtoUrl = (message: Record<string, unknown>, replyBody: string): string | null => {
  const email = usableReplyEmail(String(message.email ?? ""));
  if (!email) return null;
  const subject = normalizeText(message.subject, 160);
  const mailSubject = subject ? `Re: ${subject}` : "Re: Schood support";
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(replyBody)}`;
};

const attachReplies = async (sb: any, messages: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> => {
  const ids = messages.map((message) => String(message.id ?? "")).filter(Boolean);
  if (ids.length === 0) return messages.map((message) => ({ ...message, replies: [] }));

  const { data, error } = await sb
    .from("support_message_replies")
    .select(supportReplySelect)
    .in("support_message_id", ids)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const byMessage = new Map<string, Array<Record<string, unknown>>>();
  for (const reply of (data ?? []) as Array<Record<string, unknown>>) {
    const key = String(reply.support_message_id ?? "");
    const list = byMessage.get(key) ?? [];
    list.push(reply);
    byMessage.set(key, list);
  }
  return messages.map((message) => ({ ...message, replies: byMessage.get(String(message.id)) ?? [] }));
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

      let readsByAnnouncement = new Map<string, { read_at: string; announcement_updated_at: string | null }>();
      if (authUser && visible.length > 0) {
        const ids = visible.map((item: any) => String(item.id)).filter(Boolean);
        try {
          const { data: readRows, error: readError } = await sb
            .from("platform_announcement_reads")
            .select("announcement_id,read_at,announcement_updated_at")
            .eq("user_id", authUser.id)
            .in("announcement_id", ids);
          if (readError) throw readError;
          readsByAnnouncement = new Map(
            (readRows ?? []).map((row: any) => [
              String(row.announcement_id),
              {
                read_at: String(row.read_at),
                announcement_updated_at: row.announcement_updated_at ? String(row.announcement_updated_at) : null,
              },
            ]),
          );
        } catch (_err) {
          readsByAnnouncement = new Map();
        }
      }

      const decorated = visible.map((item: any) => {
        const read = readsByAnnouncement.get(String(item.id));
        const updatedAt = Date.parse(String(item.updated_at ?? item.created_at ?? ""));
        const readVersionAt = Date.parse(String(read?.announcement_updated_at ?? read?.read_at ?? ""));
        const isRead = Boolean(read) && (!Number.isFinite(updatedAt) || (Number.isFinite(readVersionAt) && readVersionAt >= updatedAt));
        return {
          ...item,
          is_read: isRead,
          read_at: read?.read_at ?? null,
        };
      });

      return jsonResponse(200, { announcements: decorated });
    }

    if (req.method === "POST" && action === "announcements-read") {
      const authUser = await getAuthUser(sb, req);
      if (!authUser) return jsonResponse(401, { error: "Unauthorized" });

      const body = (await req.json().catch(() => ({}))) as PlatformAnnouncementReadInput;
      const ids = Array.from(
        new Set(
          (Array.isArray(body?.announcement_ids) ? body.announcement_ids : [])
            .map((id) => normalizeText(id, 64))
            .filter(Boolean),
        ),
      ).slice(0, 200);

      if (ids.length === 0) return jsonResponse(400, { error: "announcement_ids is required" });

      const { data: announcementRows, error: announcementsError } = await sb
        .from("platform_announcements")
        .select("id,updated_at")
        .in("id", ids);
      if (announcementsError) throw announcementsError;

      const nowIso = new Date().toISOString();
      const rows = (announcementRows ?? []).map((row: any) => ({
        announcement_id: row.id,
        user_id: authUser.id,
        read_at: nowIso,
        announcement_updated_at: row.updated_at ?? nowIso,
      }));

      if (rows.length > 0) {
        const { error: upsertError } = await sb
          .from("platform_announcement_reads")
          .upsert(rows, { onConflict: "announcement_id,user_id" });
        if (upsertError) throw upsertError;
      }

      return jsonResponse(200, { ok: true, read_count: rows.length });
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
      const metadata = {
        ...(isObject(body?.metadata) ? body.metadata : {}),
        contact_channel: telegram ? "telegram" : "email",
      };

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
        .select(supportMessageSelect)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (status && status !== "all") {
        q = q.eq("status", status);
      }
      if (query) {
        q = q.or(`name.ilike.%${query}%,email.ilike.%${query}%,telegram.ilike.%${query}%,subject.ilike.%${query}%,message.ilike.%${query}%,source.ilike.%${query}%,service_slug.ilike.%${query}%`);
      }

      const { data, error } = await q;
      if (error) throw error;

      const messages = await attachReplies(sb, (data ?? []) as Array<Record<string, unknown>>);
      return jsonResponse(200, { messages });
    }

    if (req.method === "POST" && action === "admin-message-reply") {
      const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
        requiredPermission: "admin.support.manage",
        action: "admin.support.messages.reply",
      });
      if (!authz.ok) return authz.response;
      const body = (await req.json()) as SupportReplyInput;

      const messageId = normalizeText(body?.message_id, 64);
      const replyBody = normalizeText(body?.body, 4000);
      const requestedChannel = normalizeText(body?.channel, 32).toLowerCase() || "auto";
      if (!messageId) return jsonResponse(400, { error: "message_id is required" });
      if (!replyBody) return jsonResponse(400, { error: "body is required" });
      if (!["auto", "telegram", "email", "internal"].includes(requestedChannel)) {
        return jsonResponse(400, { error: "channel must be one of: auto, telegram, email, internal" });
      }

      const { data: message, error: messageError } = await sb
        .from("support_messages")
        .select(supportMessageSelect)
        .eq("id", messageId)
        .maybeSingle();
      if (messageError) throw messageError;
      if (!message) return jsonResponse(404, { error: "Support message not found" });

      const telegramTarget = extractTelegramTarget(message as Record<string, unknown>);
      const mailtoUrl = buildMailtoUrl(message as Record<string, unknown>, replyBody);
      const channel = requestedChannel === "auto"
        ? telegramTarget
          ? "telegram"
          : mailtoUrl
          ? "email"
          : "internal"
        : requestedChannel;

      let deliveryTarget: string | null = null;
      let deliveryStatus: "sent" | "prepared" | "failed" | "skipped" = "sent";
      let deliveryError: string | null = null;
      let providerMessageId: string | null = null;
      let metadata: Json = {};

      if (channel === "telegram") {
        const result = await sendTelegramReply(message as Record<string, unknown>, replyBody);
        deliveryTarget = result.target;
        providerMessageId = result.providerMessageId;
        deliveryError = result.error;
        deliveryStatus = result.ok ? "sent" : "failed";
      } else if (channel === "email") {
        deliveryTarget = usableReplyEmail(String((message as Record<string, unknown>).email ?? ""));
        if (mailtoUrl && deliveryTarget) {
          deliveryStatus = "prepared";
          metadata = { mailto_url: mailtoUrl };
        } else {
          deliveryStatus = "failed";
          deliveryError = "No usable email address is available for this support message";
        }
      } else {
        deliveryStatus = "sent";
        deliveryTarget = null;
      }

      const { data: reply, error: replyError } = await sb
        .from("support_message_replies")
        .insert({
          support_message_id: messageId,
          author_user_id: authz.context.userId,
          author_type: "admin",
          body: replyBody,
          delivery_channel: channel,
          delivery_status: deliveryStatus,
          delivery_target: deliveryTarget,
          delivery_error: deliveryError,
          provider_message_id: providerMessageId,
          metadata,
        })
        .select(supportReplySelect)
        .maybeSingle();
      if (replyError) throw replyError;

      const currentStatus = normalizeText((message as Record<string, unknown>).status, 32) || "new";
      const nextStatus = currentStatus === "new" ? "in_progress" : currentStatus;
      const { data: updated, error: updateError } = await sb
        .from("support_messages")
        .update({
          status: nextStatus,
          handled_by: authz.context.userId,
          handled_at: new Date().toISOString(),
        })
        .eq("id", messageId)
        .select(supportMessageSelect)
        .maybeSingle();
      if (updateError) throw updateError;

      return jsonResponse(200, {
        ok: deliveryStatus === "sent" || deliveryStatus === "prepared",
        reply,
        message: updated ? { ...updated, replies: [reply] } : null,
        mailto_url: isObject(reply?.metadata) ? reply.metadata.mailto_url ?? null : null,
      });
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
        .select(supportMessageSelect)
        .maybeSingle();

      if (error) throw error;
      const messages = data ? await attachReplies(sb, [data as Record<string, unknown>]) : [];
      return jsonResponse(200, { message: messages[0] ?? null });
    }

    return jsonResponse(404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return jsonResponse(status, { error: message });
  }
});
