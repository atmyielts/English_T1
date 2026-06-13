import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { signStorageRef } from "../_shared/media-storage.ts";

type Json = Record<string, unknown>;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const getBearerToken = (req: Request): string | null => {
  const header = req.headers.get("Authorization") ?? "";
  if (!header) return null;
  return header.startsWith("Bearer ") ? header.slice(7) : header;
};

const isObject = (value: unknown): value is Json => Boolean(value && typeof value === "object" && !Array.isArray(value));

const normalizeCode = (raw: unknown): string =>
  String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

const normalizeSlug = (raw: unknown): string =>
  String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const isUuid = (value: unknown): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value ?? "").trim());

const publicEventsEnabled = (center: any): boolean =>
  ["growth", "premium", "exclusive"].includes(String(center?.package_tier ?? "starter").trim().toLowerCase());

const publicCenterView = async (sb: any, center: any, tenant?: any) => ({
  tenant_id: center?.tenant_id ?? tenant?.id ?? null,
  name: center?.display_name ?? tenant?.name ?? "Education center",
  display_name: center?.display_name ?? tenant?.name ?? "Education center",
  slug: center?.slug ?? tenant?.slug ?? null,
  logo_url: isObject(center?.branding?.logo_storage)
    ? await signStorageRef(sb, center.branding.logo_storage, 60 * 60 * 6, { route: "voucher-redeem:center" })
    : center?.logo_url ?? null,
  status: center?.status ?? null,
  package_tier: center?.package_tier ?? null,
  public_instructions: center?.public_instructions ?? null,
  powered_by_schood: center?.powered_by_schood ?? true,
  branding: center?.branding ?? {},
});

const productView = (product: any) => ({
  id: product?.id ?? null,
  name: product?.name ?? null,
  slug: product?.metadata?.slug ?? null,
  app_url: product?.metadata?.app_url ?? null,
});

const classroomView = (voucher: any) => {
  const rawClassroom = Array.isArray(voucher?.academy_classrooms)
    ? voucher.academy_classrooms[0]
    : voucher?.academy_classrooms;
  const id = rawClassroom?.id ?? voucher?.classroom_id ?? null;
  if (!id) return null;
  return {
    id,
    name: rawClassroom?.name ?? null,
    academy_id: rawClassroom?.academy_id ?? null,
  };
};

const voucherPreview = (voucher: any, center: any) => {
  const expiresAt = voucher?.expires_at ? Date.parse(voucher.expires_at) : null;
  const computedStatus = expiresAt && Date.now() > expiresAt && voucher.status === "unused" ? "expired" : voucher.status;
  return {
    id: voucher.id,
    code: voucher.code,
    access_kind: voucher.access_kind,
    status: computedStatus,
    expires_at: voucher.expires_at,
    assigned_name: voucher.assigned_name ?? null,
    assigned_email: voucher.assigned_email ?? null,
    center,
    product: productView(voucher.products),
    experience: voucher.experiences ? { id: voucher.experience_id, name: voucher.experiences.name } : null,
    plan: voucher.plans ? { id: voucher.plan_id, name: voucher.plans.name, duration_days: voucher.plans.duration_days } : null,
    classroom: classroomView(voucher),
  };
};

const extractIncludedProductIds = (meta: unknown): string[] => {
  if (!isObject(meta)) return [];
  const raw = (meta as any).included_product_ids;
  if (!Array.isArray(raw)) return [];
  return raw.map((value) => String(value ?? "")).filter((value) => /^[0-9a-f-]{36}$/i.test(value));
};

const extractPlanLimits = (meta: unknown): Record<string, number> => {
  if (!isObject(meta) || !isObject((meta as any).limits)) return {};
  const out: Record<string, number> = {};
  Object.entries((meta as any).limits).forEach(([key, value]) => {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) out[key] = Math.floor(n);
  });
  return out;
};

const findPersonalTenant = async (sb: any, userId: string): Promise<string | null> => {
  const { data, error } = await sb
    .from("tenant_memberships")
    .select("tenant_id, tenants ( type )")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  const personal = rows.find((row: any) => String(row?.tenants?.type ?? "") === "personal");
  return personal?.tenant_id ?? rows[0]?.tenant_id ?? null;
};

const upsertCenterStudentForVoucher = async (sb: any, voucher: any, user: any): Promise<void> => {
  const email = String(user.email ?? voucher.assigned_email ?? "").trim().toLowerCase();
  const meta = isObject(user.user_metadata) ? user.user_metadata as Json : {};
  const fullName = String(meta.full_name ?? meta.name ?? voucher.assigned_name ?? "").trim() || null;
  const phone = String((meta as any).phone ?? voucher.assigned_phone ?? "").trim() || null;
  const payload = {
    tenant_id: voucher.tenant_id,
    user_id: user.id,
    full_name: fullName,
    email: email || null,
    phone,
    status: "active",
    source_voucher_id: voucher.id,
    last_activity_at: new Date().toISOString(),
    metadata: {
      voucher_code: voucher.code,
      access_kind: voucher.access_kind,
      product_id: voucher.product_id ?? null,
      plan_id: voucher.plan_id ?? null,
      expires_at: voucher.expires_at ?? null,
      redeemed_via: "voucher-redeem",
    },
  };
  const { data: existing } = await sb
    .from("partner_center_students")
    .select("id")
    .eq("tenant_id", voucher.tenant_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing?.id) {
    await sb.from("partner_center_students").update(payload).eq("id", existing.id);
    return;
  }
  await sb.from("partner_center_students").insert(payload);
};

const splitFullName = (value: unknown): { first_name: string; last_name: string } => {
  const parts = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: "", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return { first_name: parts.slice(0, -1).join(" "), last_name: parts[parts.length - 1] };
};

const enrollVoucherUserInClassroom = async (sb: any, voucher: any, user: any): Promise<void> => {
  const classroomId = String(voucher?.classroom_id ?? "").trim();
  if (!isUuid(classroomId)) return;

  const { data: classroom } = await sb
    .from("academy_classrooms")
    .select("id, academy_id, name, is_active")
    .eq("id", classroomId)
    .eq("is_active", true)
    .maybeSingle();
  if (!classroom?.id) return;

  const { data: academy } = await sb
    .from("tenants")
    .select("id")
    .eq("id", classroom.academy_id)
    .contains("metadata", { parent_center_id: voucher.tenant_id, service_family: "academy" })
    .maybeSingle();
  if (!academy?.id) return;

  const meta = isObject(user.user_metadata) ? user.user_metadata as Json : {};
  const email = String(user.email ?? voucher.assigned_email ?? "").trim().toLowerCase();
  const phone = String((meta as any).phone ?? voucher.assigned_phone ?? "").trim();
  const names = splitFullName(meta.full_name ?? meta.name ?? voucher.assigned_name ?? user.email ?? "");

  let existing: any | null = null;
  const { data: byUser } = await sb
    .from("academy_contacts")
    .select("id, metadata")
    .eq("academy_id", classroom.academy_id)
    .eq("user_id", user.id)
    .maybeSingle();
  existing = byUser ?? null;

  if (!existing && email) {
    const { data } = await sb
      .from("academy_contacts")
      .select("id, metadata")
      .eq("academy_id", classroom.academy_id)
      .ilike("email", email)
      .maybeSingle();
    existing = data ?? null;
  }

  if (!existing && phone) {
    const { data } = await sb
      .from("academy_contacts")
      .select("id, metadata")
      .eq("academy_id", classroom.academy_id)
      .eq("phone", phone)
      .maybeSingle();
    existing = data ?? null;
  }

  const existingMeta = isObject(existing?.metadata) ? existing.metadata as Json : {};
  const nowIso = new Date().toISOString();
  const contactPayload = {
    academy_id: classroom.academy_id,
    user_id: user.id,
    first_name: names.first_name,
    last_name: names.last_name,
    email: email || null,
    phone: phone || null,
    status: "active",
    last_activity_at: nowIso,
    metadata: {
      ...existingMeta,
      source: "partner_voucher_redeem",
      center_tenant_id: voucher.tenant_id,
      voucher_id: voucher.id,
      voucher_code: voucher.code,
      classroom_id: classroom.id,
      enrolled_at: nowIso,
    },
  };

  const { data: contact, error: contactError } = existing?.id
    ? await sb.from("academy_contacts").update(contactPayload).eq("id", existing.id).select("id").maybeSingle()
    : await sb.from("academy_contacts").insert(contactPayload).select("id").maybeSingle();
  if (contactError || !contact?.id) return;

  await sb
    .from("academy_classroom_memberships")
    .upsert(
      {
        academy_id: classroom.academy_id,
        classroom_id: classroom.id,
        contact_id: contact.id,
        role: "student",
        metadata: {
          source: "partner_voucher_redeem",
          center_tenant_id: voucher.tenant_id,
          voucher_id: voucher.id,
          voucher_code: voucher.code,
        },
      },
      { onConflict: "classroom_id,contact_id" },
    );
};

const loadVoucher = async (sb: any, code: string) => {
  const { data, error } = await sb
    .from("partner_vouchers")
    .select(
      "*, products ( id, name, metadata ), experiences ( id, name ), plans ( id, name, duration_days, metadata, product_id ), academy_classrooms ( id, name, academy_id )",
    )
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const loadCenter = async (sb: any, tenantId: string) => {
  const { data, error } = await sb
    .from("partner_center_profiles")
    .select("tenant_id, display_name, slug, logo_url, status, package_tier, public_instructions, powered_by_schood, branding")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const markVoucherRedeemed = async (sb: any, voucherId: string, userId: string, metadata: Json) => {
  const { data, error } = await sb
    .from("partner_vouchers")
    .update({
      status: "redeemed",
      redeemed_by: userId,
      redeemed_at: new Date().toISOString(),
      uses_count: 1,
      metadata,
    })
    .eq("id", voucherId)
    .in("status", ["unused", "redeemed"])
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
};

const grantPlanEntitlement = async (sb: any, voucher: any, userId: string, targetTenantId: string) => {
  const planId = String(voucher.plan_id ?? "");
  if (!planId) throw new Error("Voucher is missing a plan");
  const { data: plan, error } = await sb
    .from("plans")
    .select("id, product_id, duration_days, metadata")
    .eq("id", planId)
    .maybeSingle();
  if (error || !plan?.id) throw new Error("Plan not found");

  const nowIso = new Date().toISOString();
  const durationDays = Number(plan.duration_days ?? 0);
  const productIds = Array.from(new Set([String(plan.product_id), ...extractIncludedProductIds(plan.metadata)]));
  const limits = extractPlanLimits(plan.metadata);
  const { data: existingRows } = await sb
    .from("entitlements")
    .select("resource_id, ends_at")
    .eq("tenant_id", targetTenantId)
    .eq("resource_type", "product")
    .in("resource_id", productIds);

  const existingMap = new Map<string, string | null>();
  (existingRows ?? []).forEach((row: any) => {
    if (row?.resource_id) existingMap.set(String(row.resource_id), row.ends_at ?? null);
  });

  const payload = productIds.map((productId) => {
    let endsAt: string | null = null;
    if (Number.isFinite(durationDays) && durationDays > 0) {
      const baseMs = Math.max(Date.now(), Date.parse(existingMap.get(productId) ?? "") || 0);
      endsAt = new Date(baseMs + durationDays * 86400000).toISOString();
    }
    return {
      user_id: userId,
      tenant_id: targetTenantId,
      resource_type: "product",
      resource_id: productId,
      is_active: true,
      starts_at: nowIso,
      ends_at: endsAt,
      source: "partner_voucher",
      value: { plan_id: plan.id, voucher_id: voucher.id, limits },
    };
  });

  const { error: grantError } = await sb.from("entitlements").upsert(payload, {
    onConflict: "tenant_id,resource_type,resource_id",
  });
  if (grantError) throw grantError;
  return { product_ids: productIds, starts_at: nowIso, ends_at: payload[0]?.ends_at ?? null };
};

const redeemSeat = async (sb: any, voucher: any, userId: string, targetTenantId: string) => {
  const seatId = String(voucher.seat_license_id ?? "");
  if (!seatId) throw new Error("Voucher is missing a seat");
  const { data: seat, error: seatError } = await sb
    .from("seat_licenses")
    .select("id, tenant_id, plan_id, product_id, status, expires_at")
    .eq("id", seatId)
    .maybeSingle();
  if (seatError || !seat?.id) throw new Error("Seat not found");
  if (seat.status !== "unassigned" && seat.assigned_user_id !== userId) throw new Error("Seat is no longer available");
  if (seat.expires_at && Date.parse(seat.expires_at) < Date.now()) throw new Error("Seat has expired");

  const grant = await grantPlanEntitlement(sb, { ...voucher, plan_id: seat.plan_id }, userId, targetTenantId);
  const nowIso = new Date().toISOString();
  const { error: updateError } = await sb
    .from("seat_licenses")
    .update({
      assigned_user_id: userId,
      assigned_tenant_id: targetTenantId,
      status: "active",
      assigned_at: nowIso,
      starts_at: nowIso,
      ends_at: grant.ends_at,
    })
    .eq("id", seatId)
    .in("status", ["unassigned", "active"]);
  if (updateError) throw updateError;
  return grant;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const url = new URL(req.url);
    const methodAction = req.method === "GET" ? url.searchParams.get("action") : null;

    if (req.method === "GET" && methodAction === "center") {
      const slug = normalizeSlug(url.searchParams.get("slug"));
      if (!slug) return json(400, { error: "slug is required" });
      const { data: center, error } = await sb
        .from("partner_center_profiles")
        .select("*, tenants ( id, name, slug )")
        .eq("slug", slug)
        .eq("status", "active")
        .maybeSingle();
      if (error) return json(500, { error: "Failed to load center", detail: error.message });
      if (!center?.tenant_id) return json(404, { error: "Center not found" });

      const events = await sb
        .from("partner_center_mock_events")
        .select("id, title, starts_at, mode, location, capacity, status, experience_id, metadata, experiences ( name )")
        .eq("tenant_id", center.tenant_id)
        .eq("status", "scheduled")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(12);
      const publicEvents = publicEventsEnabled(center)
        ? (events.data ?? []).filter((event: any) => {
          const metadata = isObject(event?.metadata) ? event.metadata as Json : {};
          return metadata.visibility === "public" || metadata.public_event === true;
        }).slice(0, 6)
        : [];
      return json(200, {
        center: await publicCenterView(sb, center, center.tenants),
        services: { mock_exams: [], subscriptions: [] },
        events: publicEvents,
      });
    }

    const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as Json) : {};
    const action = req.method === "GET" ? methodAction : String(body.action ?? "preview");
    const code = normalizeCode(req.method === "GET" ? url.searchParams.get("code") : body.code);

    if (!code) return json(400, { error: "code is required" });
    const voucher = await loadVoucher(sb, code);
    if (!voucher?.id) {
      const { data: token } = await sb
        .from("exam_tokens")
        .select("id, token_code, status, expires_at, experiences ( id, name, products ( id, name, metadata ) )")
        .eq("token_code", code)
        .maybeSingle();
      if (!token?.id) return json(404, { error: "Voucher not found" });
      const status = token.expires_at && Date.parse(token.expires_at) < Date.now() ? "expired" : token.status;
      return json(200, {
        voucher: {
          id: token.id,
          code: token.token_code,
          access_kind: "mock_exam",
          status,
          expires_at: token.expires_at,
          center: null,
          product: productView((token as any).experiences?.products),
          experience: { id: (token as any).experiences?.id, name: (token as any).experiences?.name },
          plan: null,
        },
        redeem_action: "candidate_entry",
      });
    }

    const center = await publicCenterView(sb, await loadCenter(sb, voucher.tenant_id));
    const preview = voucherPreview(voucher, center);
    if (action === "preview" || req.method === "GET") {
      return json(200, {
        voucher: preview,
        redeem_action: voucher.access_kind === "mock_exam" ? "candidate_entry" : "authenticated_redeem",
      });
    }

    if (action !== "redeem") return json(400, { error: "Unsupported action" });

    const expiresAt = voucher.expires_at ? Date.parse(voucher.expires_at) : null;
    if (expiresAt && Date.now() > expiresAt) return json(400, { error: "Voucher has expired", voucher: { ...preview, status: "expired" } });
    if (voucher.status === "void") return json(400, { error: "Voucher is void", voucher: preview });
    if (voucher.status === "redeemed") return json(400, { error: "Voucher has already been redeemed", voucher: preview });
    if (voucher.status !== "unused") return json(400, { error: "Voucher is not available", voucher: preview });

    if (voucher.access_kind === "mock_exam") {
      return json(200, {
        voucher: preview,
        redeem_action: "candidate_entry",
        token_code: code,
      });
    }

    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Login is required to redeem this voucher", voucher: preview });
    const { data: authData, error: authError } = await sb.auth.getUser(token);
    if (authError || !authData?.user) return json(401, { error: "Login is required to redeem this voucher", voucher: preview });
    const userId = authData.user.id;
    const userEmail = String(authData.user.email ?? "").trim().toLowerCase();
    const assignedEmail = String(voucher.assigned_email ?? "").trim().toLowerCase();
    if (assignedEmail && userEmail && assignedEmail !== userEmail) {
      return json(403, { error: "This voucher is assigned to another student", voucher: preview });
    }

    const targetTenantId = await findPersonalTenant(sb, userId);
    if (!targetTenantId) return json(400, { error: "Student account has no active tenant" });

    const grant = voucher.access_kind === "seat"
      ? await redeemSeat(sb, voucher, userId, targetTenantId)
      : await grantPlanEntitlement(sb, voucher, userId, targetTenantId);

    const updated = await markVoucherRedeemed(sb, voucher.id, userId, {
      ...(isObject(voucher.metadata) ? voucher.metadata : {}),
      redeemed_via: "voucher-redeem",
      grant,
    });
    await upsertCenterStudentForVoucher(sb, voucher, authData.user).catch((err) => {
      console.warn("voucher-redeem: failed to upsert center student", err instanceof Error ? err.message : err);
    });
    await enrollVoucherUserInClassroom(sb, voucher, authData.user).catch((err) => {
      console.warn("voucher-redeem: failed to enroll academy classroom", err instanceof Error ? err.message : err);
    });

    return json(200, {
      voucher: { ...preview, status: "redeemed", redeemed_at: updated?.redeemed_at ?? new Date().toISOString() },
      redeem_action: "open_product",
      grant,
      next_url: preview.product?.app_url ?? "/account",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(500, { error: message });
  }
});
