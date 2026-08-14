import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAdminRequest } from "../_shared/admin-access.ts";
import {
  academyAccessClassroomIds,
  academyRoleGrantToMembership,
  academyRoleRank,
  buildAcademyPermissions,
  type MembershipRow,
} from "../academy/access.ts";

type Row = Record<string, unknown>;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", ...corsHeaders },
});

const env = (key: string): string => String(Deno.env.get(key) ?? "").trim();
const text = (value: unknown, max = 2_000): string => String(value ?? "").trim().slice(0, max);
const asRow = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const asRows = (value: unknown): Row[] => Array.isArray(value) ? value.filter((row): row is Row => !!row && typeof row === "object" && !Array.isArray(row)) : [];
const positiveInt = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
};

const providerConfig = () => ({
  accountId: env("CLOUDFLARE_STREAM_ACCOUNT_ID"),
  apiToken: env("CLOUDFLARE_STREAM_API_TOKEN"),
  customerCode: env("CLOUDFLARE_STREAM_CUSTOMER_CODE"),
  signingKeyId: env("CLOUDFLARE_STREAM_SIGNING_KEY_ID"),
  signingPrivateJwk: env("CLOUDFLARE_STREAM_SIGNING_PRIVATE_JWK"),
});

const providerHealth = () => {
  const config = providerConfig();
  const fields = {
    account_id: Boolean(config.accountId),
    api_token: Boolean(config.apiToken),
    customer_code: Boolean(config.customerCode),
    signing_key_id: Boolean(config.signingKeyId),
    signing_private_jwk: Boolean(config.signingPrivateJwk),
  };
  return { provider: "cloudflare_stream", configured: Object.values(fields).every(Boolean), fields };
};

const bearer = (req: Request): string | null => {
  const value = req.headers.get("authorization") ?? req.headers.get("x-user-jwt") ?? "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() || null : value.trim() || null;
};

const cloudflare = async (path: string, init?: RequestInit): Promise<Row> => {
  const config = providerConfig();
  if (!config.accountId || !config.apiToken) throw new Error("VIDEO_HOSTING_NOT_CONFIGURED");
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/stream${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = asRow(await response.json().catch(() => ({})));
  if (!response.ok || payload.success === false) {
    const errors = asRows(payload.errors).map((row) => text(row.message, 500)).filter(Boolean).join("; ");
    throw new Error(errors || `Cloudflare Stream returned ${response.status}`);
  }
  return asRow(payload.result);
};

const loadAcademyAccess = async (sb: any, userId: string, academyId: string): Promise<MembershipRow | null> => {
  const [tenantResult, staffResult, grantsResult] = await Promise.all([
    sb.from("tenant_memberships").select("tenant_id,role,status").eq("tenant_id", academyId).eq("user_id", userId).eq("status", "active").limit(5),
    sb.from("academy_staff").select("academy_id,role,is_active,id").eq("academy_id", academyId).eq("user_id", userId).eq("is_active", true).limit(5),
    sb.from("academy_role_grants").select("id,academy_id,role,status,scope_type,scope_ids,starts_at,expires_at").eq("academy_id", academyId).eq("user_id", userId).limit(20),
  ]);
  const candidates: MembershipRow[] = [];
  for (const row of asRows(tenantResult.data)) {
    candidates.push({ tenant_id: academyId, role: text(row.role, 40), status: "active", source: "tenant", classroom_ids: [] });
  }
  for (const row of asRows(staffResult.data)) {
    candidates.push({ tenant_id: academyId, role: text(row.role, 40), status: "active", source: "staff", staff_id: text(row.id, 64), classroom_ids: [] });
  }
  for (const grant of asRows(grantsResult.data)) {
    const candidate = academyRoleGrantToMembership(grant);
    if (candidate) candidates.push(candidate);
  }
  return candidates.sort((left, right) => {
    const rank = academyRoleRank(right.role) - academyRoleRank(left.role);
    if (rank !== 0) return rank;
    const scope = (right.classroom_ids?.length ?? 0) - (left.classroom_ids?.length ?? 0);
    if (scope !== 0) return scope;
    return right.source === "tenant" ? 1 : left.source === "tenant" ? -1 : 0;
  })[0] ?? null;
};

const calculateUsage = (assets: Row[]) => {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  let storedSeconds = 0;
  let monthlyUploadSeconds = 0;
  for (const asset of assets) {
    const metadata = asRow(asset.metadata);
    const reserved = positiveInt(metadata.max_duration_seconds) ?? 0;
    const duration = positiveInt(asset.duration_seconds) ?? reserved;
    storedSeconds += duration;
    if (Date.parse(text(asset.created_at)) >= monthStart.getTime()) monthlyUploadSeconds += duration;
  }
  return {
    stored_minutes: Math.ceil(storedSeconds / 60),
    monthly_upload_minutes: Math.ceil(monthlyUploadSeconds / 60),
  };
};

const loadUsage = async (sb: any, academyId: string) => {
  const { data, error } = await sb.from("academy_video_assets")
    .select("duration_seconds,status,created_at,metadata")
    .eq("academy_id", academyId)
    .not("status", "in", '("deleted","blocked","failed")')
    .limit(10_000);
  if (error) throw new Error(error.message);
  return calculateUsage(asRows(data));
};

const loadCapability = async (sb: any, academyId: string) => {
  const [{ data: settings, error: settingsError }, { data: policy, error: policyError }, usage] = await Promise.all([
    sb.from("platform_settings").select("academy_video_provider,academy_video_uploads_enabled").eq("id", 1).maybeSingle(),
    sb.from("academy_video_policies").select("*").eq("academy_id", academyId).maybeSingle(),
    loadUsage(sb, academyId),
  ]);
  if (settingsError) throw new Error(settingsError.message);
  if (policyError) throw new Error(policyError.message);
  const health = providerHealth();
  const limits = policy ?? {
    academy_id: academyId,
    upload_enabled: false,
    max_asset_duration_seconds: 0,
    max_total_stored_minutes: 0,
    max_monthly_upload_minutes: 0,
  };
  let reason: string | null = null;
  if (!settings?.academy_video_uploads_enabled) reason = "GLOBAL_DISABLED";
  else if (!health.configured) reason = "VIDEO_HOSTING_NOT_CONFIGURED";
  else if (!limits.upload_enabled) reason = "ACADEMY_NOT_APPROVED";
  else if (!positiveInt(limits.max_asset_duration_seconds) || !positiveInt(limits.max_total_stored_minutes) || !positiveInt(limits.max_monthly_upload_minutes)) reason = "QUOTA_NOT_CONFIGURED";
  else if (usage.stored_minutes >= Number(limits.max_total_stored_minutes)) reason = "STORAGE_QUOTA_REACHED";
  else if (usage.monthly_upload_minutes >= Number(limits.max_monthly_upload_minutes)) reason = "MONTHLY_UPLOAD_QUOTA_REACHED";
  return {
    provider: text(settings?.academy_video_provider) || "cloudflare_stream",
    provider_configured: health.configured,
    global_enabled: settings?.academy_video_uploads_enabled === true,
    academy_enabled: limits.upload_enabled === true,
    quota: {
      max_asset_duration_seconds: Number(limits.max_asset_duration_seconds ?? 0),
      max_total_stored_minutes: Number(limits.max_total_stored_minutes ?? 0),
      max_monthly_upload_minutes: Number(limits.max_monthly_upload_minutes ?? 0),
    },
    usage,
    can_upload: reason === null,
    reason,
  };
};

const audit = async (sb: any, input: { academyId: string; userId: string; role?: string | null; action: string; assetId?: string | null; lessonId?: string | null; metadata?: Row }) => {
  const { error } = await sb.from("academy_audit_events").insert({
    academy_id: input.academyId,
    actor_user_id: input.userId,
    actor_role: input.role ?? null,
    action: input.action,
    target_type: "academy_video_asset",
    target_id: input.assetId ?? null,
    metadata: { lesson_id: input.lessonId ?? null, ...(input.metadata ?? {}) },
  });
  if (error) console.error("academy video audit failed", error.message);
};

const requireManageResources = async (sb: any, userId: string, academyId: string, lessonId?: string) => {
  const access = await loadAcademyAccess(sb, userId, academyId);
  if (!access || !buildAcademyPermissions(access).manageResources) throw new Error("FORBIDDEN");
  const classroomScope = academyAccessClassroomIds(access);
  if (lessonId && classroomScope !== null) {
    if (classroomScope.length === 0) throw new Error("FORBIDDEN");
    const { data: lesson, error: lessonError } = await sb.from("academy_lessons")
      .select("course_id").eq("academy_id", academyId).eq("id", lessonId).maybeSingle();
    if (lessonError || !lesson?.course_id) throw new Error("LESSON_NOT_FOUND");
    const { data: assignment, error: assignmentError } = await sb.from("academy_classroom_courses")
      .select("classroom_id").eq("academy_id", academyId).eq("course_id", lesson.course_id)
      .in("classroom_id", classroomScope).in("status", ["scheduled", "active", "completed"]).limit(1).maybeSingle();
    if (assignmentError || !assignment?.classroom_id) throw new Error("FORBIDDEN");
  }
  return access;
};

const base64Url = (value: Uint8Array | string): string => {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const signPlaybackToken = async (assetId: string): Promise<string> => {
  const config = providerConfig();
  if (!config.signingKeyId || !config.signingPrivateJwk) throw new Error("VIDEO_HOSTING_NOT_CONFIGURED");
  let jwk: JsonWebKey;
  try {
    try {
      jwk = JSON.parse(config.signingPrivateJwk) as JsonWebKey;
    } catch {
      jwk = JSON.parse(atob(config.signingPrivateJwk)) as JsonWebKey;
    }
  } catch {
    throw new Error("VIDEO_SIGNING_KEY_INVALID");
  }
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", kid: config.signingKeyId, typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ sub: assetId, kid: config.signingKeyId, nbf: now - 30, exp: now + 15 * 60 }));
  const unsigned = `${header}.${payload}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
};

const canViewAsset = async (sb: any, userId: string, userEmail: string | null, asset: Row): Promise<boolean> => {
  const academyId = text(asset.academy_id, 64);
  const staff = await loadAcademyAccess(sb, userId, academyId);
  if (staff && buildAcademyPermissions(staff).viewClassrooms) return true;
  const { data: media } = await sb.from("academy_lesson_media").select("lesson_id").eq("academy_id", academyId).eq("video_asset_id", asset.id).limit(1).maybeSingle();
  if (!media?.lesson_id) return false;
  const { data: lesson } = await sb.from("academy_lessons").select("course_id,status,available_from").eq("academy_id", academyId).eq("id", media.lesson_id).maybeSingle();
  if (!lesson?.course_id || lesson.status !== "published") return false;
  if (lesson.available_from && Date.parse(String(lesson.available_from)) > Date.now()) return false;
  let contactsQuery = sb.from("academy_contacts").select("id").eq("academy_id", academyId).eq("user_id", userId);
  const { data: directContacts } = await contactsQuery.limit(20);
  let contacts = asRows(directContacts);
  if (contacts.length === 0 && userEmail) {
    const { data: emailContacts } = await sb.from("academy_contacts").select("id").eq("academy_id", academyId).ilike("email", userEmail).limit(20);
    contacts = asRows(emailContacts);
  }
  const contactIds = contacts.map((row) => text(row.id, 64)).filter(Boolean);
  if (contactIds.length === 0) return false;
  const { data: courseClassrooms } = await sb.from("academy_classroom_courses").select("classroom_id")
    .eq("academy_id", academyId).eq("course_id", lesson.course_id).in("status", ["scheduled", "active", "completed"]).limit(200);
  const classroomIds = asRows(courseClassrooms).map((row) => text(row.classroom_id, 64)).filter(Boolean);
  if (classroomIds.length === 0) return false;
  const { data: membership } = await sb.from("academy_classroom_memberships").select("id")
    .eq("academy_id", academyId).in("classroom_id", classroomIds).in("contact_id", contactIds)
    .eq("role", "student").in("status", ["active", "completed"]).limit(1).maybeSingle();
  return Boolean(membership?.id);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = env("SUPABASE_URL");
    const anonKey = env("SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Supabase runtime is not configured");
    const token = bearer(req);
    if (!token) return json(401, { error: "Unauthorized" });
    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return json(401, { error: "Unauthorized" });
    const userId = authData.user.id;
    const userEmail = authData.user.email ?? null;
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const url = new URL(req.url);
    const body = req.method === "GET" ? {} : asRow(await req.json().catch(() => ({})));
    const action = text(url.searchParams.get("action") || body.action, 80).toLowerCase();
    const academyId = text(url.searchParams.get("academy_id") || body.academy_id, 64);

    if (["provider-health", "policy-list", "policy-update"].includes(action)) {
      const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
        requiredPermission: "admin.settings.manage",
        action: `academy.video.${action}`,
      });
      if (!authz.ok) return authz.response;

      if (action === "provider-health") {
        const health = providerHealth();
        if (url.searchParams.get("test") !== "true" || !health.configured) return json(200, health);
        const started = Date.now();
        await cloudflare("?per_page=1");
        return json(200, { ...health, reachable: true, latency_ms: Date.now() - started });
      }

      if (action === "policy-list") {
        const [academiesResult, policiesResult, assetsResult] = await Promise.all([
          sb.from("tenants").select("id,name,slug,type").in("type", ["academy", "team"]).order("name").limit(1000),
          sb.from("academy_video_policies").select("*").order("updated_at", { ascending: false }).limit(1000),
          sb.from("academy_video_assets").select("academy_id,duration_seconds,status,created_at,metadata").not("status", "in", '("deleted","blocked","failed")').limit(10_000),
        ]);
        if (academiesResult.error || policiesResult.error || assetsResult.error) return json(500, { error: "Failed to load video policies" });
        const policies = new Map(asRows(policiesResult.data).map((row) => [text(row.academy_id, 64), row]));
        const assetsByAcademy = new Map<string, Row[]>();
        for (const asset of asRows(assetsResult.data)) {
          const key = text(asset.academy_id, 64);
          assetsByAcademy.set(key, [...(assetsByAcademy.get(key) ?? []), asset]);
        }
        const rows = asRows(academiesResult.data).map((academy) => ({
          academy,
          policy: policies.get(text(academy.id, 64)) ?? null,
          usage: calculateUsage(assetsByAcademy.get(text(academy.id, 64)) ?? []),
        }));
        return json(200, { health: providerHealth(), academies: rows });
      }

      if (!academyId) return json(400, { error: "academy_id is required" });
      const uploadEnabled = body.upload_enabled === true;
      const maxAsset = positiveInt(body.max_asset_duration_seconds) ?? 0;
      const maxStored = positiveInt(body.max_total_stored_minutes) ?? 0;
      const maxMonthly = positiveInt(body.max_monthly_upload_minutes) ?? 0;
      if (uploadEnabled && (!maxAsset || !maxStored || !maxMonthly)) {
        return json(400, { error: "Explicit positive duration, storage, and monthly upload quotas are required" });
      }
      const { data, error } = await sb.from("academy_video_policies").upsert({
        academy_id: academyId,
        upload_enabled: uploadEnabled,
        max_asset_duration_seconds: maxAsset,
        max_total_stored_minutes: maxStored,
        max_monthly_upload_minutes: maxMonthly,
        approved_by: uploadEnabled ? authz.context.userId : null,
        approved_at: uploadEnabled ? new Date().toISOString() : null,
        updated_by: authz.context.userId,
      }, { onConflict: "academy_id" }).select("*").single();
      if (error) return json(400, { error: "Failed to update video policy", detail: error.message });
      await audit(sb, { academyId, userId: authz.context.userId, role: "admin", action: "academy.video.policy_updated", metadata: { upload_enabled: uploadEnabled, max_asset_duration_seconds: maxAsset, max_total_stored_minutes: maxStored, max_monthly_upload_minutes: maxMonthly } });
      return json(200, { policy: data, capability: await loadCapability(sb, academyId) });
    }

    if (!academyId) return json(400, { error: "academy_id is required" });

    if (action === "capability") {
      const access = await loadAcademyAccess(sb, userId, academyId);
      if (!access || !buildAcademyPermissions(access).viewClassrooms) return json(403, { error: "Forbidden" });
      return json(200, await loadCapability(sb, academyId));
    }

    if (action === "create-upload" && req.method === "POST") {
      const lessonId = text(body.lesson_id, 64);
      const title = text(body.title, 240);
      const maxDurationSeconds = positiveInt(body.max_duration_seconds);
      if (!lessonId || !title || !maxDurationSeconds) return json(400, { error: "lesson_id, title, and max_duration_seconds are required" });
      await requireManageResources(sb, userId, academyId, lessonId);
      const capability = await loadCapability(sb, academyId);
      if (!capability.can_upload) return json(403, { error: "Video upload is unavailable", code: capability.reason, capability });
      if (maxDurationSeconds > capability.quota.max_asset_duration_seconds) return json(409, { error: "Video duration exceeds academy policy", code: "ASSET_DURATION_QUOTA" });
      const reservedMinutes = Math.ceil(maxDurationSeconds / 60);
      if (capability.usage.stored_minutes + reservedMinutes > capability.quota.max_total_stored_minutes) return json(409, { error: "Storage quota would be exceeded", code: "STORAGE_QUOTA_REACHED" });
      if (capability.usage.monthly_upload_minutes + reservedMinutes > capability.quota.max_monthly_upload_minutes) return json(409, { error: "Monthly upload quota would be exceeded", code: "MONTHLY_UPLOAD_QUOTA_REACHED" });
      const { data: lesson, error: lessonError } = await sb.from("academy_lessons").select("id,course_id,status").eq("academy_id", academyId).eq("id", lessonId).eq("status", "published").maybeSingle();
      if (lessonError || !lesson?.id) return json(404, { error: "Published lesson not found" });
      const directUpload = await cloudflare("/direct_upload", {
        method: "POST",
        body: JSON.stringify({
          maxDurationSeconds,
          requireSignedURLs: true,
          allowedOrigins: ["academy.schood.online"],
          meta: { academy_id: academyId, lesson_id: lessonId, created_by: userId, title },
        }),
      });
      const providerAssetId = text(directUpload.uid, 200);
      const uploadUrl = text(directUpload.uploadURL, 4_000);
      if (!providerAssetId || !uploadUrl) return json(502, { error: "Cloudflare did not return a direct upload reservation" });
      const { data: asset, error: assetError } = await sb.rpc("academy_reserve_video_asset", {
        p_academy_id: academyId,
        p_lesson_id: lessonId,
        p_provider_asset_id: providerAssetId,
        p_title: title,
        p_max_duration_seconds: maxDurationSeconds,
        p_created_by: userId,
      });
      if (assetError || !asset?.id) {
        await cloudflare(`/${encodeURIComponent(providerAssetId)}`, { method: "DELETE" }).catch(() => null);
        return json(500, { error: "Failed to reserve the video record", detail: assetError?.message });
      }
      await audit(sb, { academyId, userId, role: (await loadAcademyAccess(sb, userId, academyId))?.role, action: "academy.video.upload_reserved", assetId: String(asset.id), lessonId, metadata: { max_duration_seconds: maxDurationSeconds } });
      return json(201, { asset, upload_url: uploadUrl, upload_protocol: "basic" });
    }

    if (action === "sync-status" && req.method === "POST") {
      const assetId = text(body.asset_id, 64);
      const { data: asset, error } = await sb.from("academy_video_assets").select("*").eq("academy_id", academyId).eq("id", assetId).maybeSingle();
      if (error || !asset?.id) return json(404, { error: "Video asset not found" });
      const lessonId = text(asRow(asset.metadata).lesson_id, 64);
      await requireManageResources(sb, userId, academyId, lessonId || undefined);
      const provider = await cloudflare(`/${encodeURIComponent(String(asset.provider_asset_id))}`);
      const providerStatus = asRow(provider.status);
      const durationSeconds = Math.max(0, Math.ceil(Number(provider.duration ?? 0)));
      const ready = provider.readyToStream === true && providerStatus.state === "ready";
      const failed = providerStatus.state === "error";
      const nextStatus = failed ? "failed" : ready ? "ready" : providerStatus.state === "inprogress" ? "processing" : "uploading";
      const maxDuration = positiveInt(asRow(asset.metadata).max_duration_seconds) ?? 0;
      if (durationSeconds && maxDuration && durationSeconds > maxDuration) {
        await cloudflare(`/${encodeURIComponent(String(asset.provider_asset_id))}`, { method: "DELETE" }).catch(() => null);
        const { data: blocked } = await sb.from("academy_video_assets").update({ status: "blocked", duration_seconds: durationSeconds, failure_code: "ASSET_DURATION_QUOTA", failure_message: "Uploaded video exceeded its approved duration" }).eq("id", assetId).select("*").single();
        return json(409, { error: "Uploaded video exceeded its approved duration", code: "ASSET_DURATION_QUOTA", asset: blocked });
      }
      const { data: updated, error: updateError } = await sb.from("academy_video_assets").update({
        status: nextStatus,
        duration_seconds: durationSeconds || null,
        failure_code: failed ? text(providerStatus.errorReasonCode, 160) || "PROVIDER_PROCESSING_FAILED" : null,
        failure_message: failed ? text(providerStatus.errorReasonText, 1000) || "Cloudflare could not process this video" : null,
      }).eq("id", assetId).select("*").single();
      if (updateError) return json(500, { error: "Failed to update video status", detail: updateError.message });
      if (nextStatus === "ready" || nextStatus === "failed") await audit(sb, { academyId, userId, action: `academy.video.${nextStatus}`, assetId, lessonId, metadata: { duration_seconds: durationSeconds } });
      return json(200, { asset: updated });
    }

    if (action === "playback-token" && req.method === "POST") {
      const assetId = text(body.asset_id, 64);
      const { data: asset, error } = await sb.from("academy_video_assets").select("*").eq("academy_id", academyId).eq("id", assetId).eq("status", "ready").maybeSingle();
      if (error || !asset?.id) return json(404, { error: "Playable video not found" });
      if (!(await canViewAsset(sb, userId, userEmail, asset))) return json(403, { error: "Forbidden" });
      const tokenValue = await signPlaybackToken(String(asset.provider_asset_id));
      const config = providerConfig();
      return json(200, {
        asset_id: asset.id,
        expires_in_seconds: 900,
        iframe_url: `https://customer-${config.customerCode}.cloudflarestream.com/${tokenValue}/iframe`,
      });
    }

    if (action === "delete" && req.method === "DELETE") {
      const assetId = text(body.asset_id || url.searchParams.get("asset_id"), 64);
      const { data: asset, error } = await sb.from("academy_video_assets").select("*").eq("academy_id", academyId).eq("id", assetId).maybeSingle();
      if (error || !asset?.id) return json(404, { error: "Video asset not found" });
      const lessonId = text(asRow(asset.metadata).lesson_id, 64);
      await requireManageResources(sb, userId, academyId, lessonId || undefined);
      await cloudflare(`/${encodeURIComponent(String(asset.provider_asset_id))}`, { method: "DELETE" });
      const { data: deleted, error: deleteError } = await sb.from("academy_video_assets").update({ status: "deleted", deleted_by: userId, deleted_at: new Date().toISOString() }).eq("id", assetId).select("*").single();
      if (deleteError) return json(500, { error: "Provider deleted the video but local cleanup failed", detail: deleteError.message });
      await audit(sb, { academyId, userId, action: "academy.video.deleted", assetId, lessonId });
      return json(200, { asset: deleted });
    }

    return json(404, { error: "Unknown Academy video action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "FORBIDDEN") return json(403, { error: "Forbidden" });
    if (message === "LESSON_NOT_FOUND") return json(404, { error: "Lesson not found" });
    if (message === "VIDEO_HOSTING_NOT_CONFIGURED" || message === "VIDEO_SIGNING_KEY_INVALID") {
      return json(503, { error: "Video hosting is not configured", code: message });
    }
    return json(500, { error: "Academy video request failed", detail: message });
  }
});
