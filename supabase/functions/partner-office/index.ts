import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getS3Config, signStoredPath, uploadFileToS3 } from "../_shared/media-storage.ts";

type Json = Record<string, unknown>;
type MembershipRow = { tenant_id: string; role: string; status: string };
const TEMP_ONLINE_PAYMENT_MAX_AMOUNT_UZS = 100000;

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

const normalizeQuantity = (raw: unknown, max = 500): number | null => {
  const num = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(num)) return null;
  const qty = Math.floor(num);
  if (qty < 1 || qty > max) return null;
  return qty;
};

const normalizeDays = (raw: unknown, max = 365): number | null => {
  const num = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(num)) return null;
  const days = Math.floor(num);
  if (days < 1 || days > max) return null;
  return days;
};

const normalizeCode = (raw: unknown): string =>
  String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);

const normalizeSlug = (raw: unknown, fallback: string): string => {
  const base = String(raw ?? fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  return base || fallback;
};

const randomCodePart = (len = 6): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
};

const sanitizeFilename = (name: string): string =>
  name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "logo";

const normalizeEmail = (raw: unknown): string =>
  String(raw ?? "").trim().toLowerCase();

const normalizeMoney = (raw: unknown): number => {
  const num = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.floor(num);
};

const loadMemberships = async (sb: any, userId: string): Promise<MembershipRow[]> => {
  const { data, error } = await sb
    .from("tenant_memberships")
    .select("tenant_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MembershipRow[];
};

const requireTenant = (memberships: MembershipRow[], requested?: string | null): string | null => {
  if (requested) return memberships.some((m) => m.tenant_id === requested) ? requested : null;
  return memberships[0]?.tenant_id ?? null;
};

const requireTenantAdmin = (memberships: MembershipRow[], tenantId: string): boolean =>
  memberships.some((m) => m.tenant_id === tenantId && m.status === "active" && ["owner", "admin"].includes(m.role));

const authUserEmail = (user: any): string =>
  String(user?.email ?? user?.user_metadata?.email ?? `${user?.id ?? crypto.randomUUID()}@schood.local`).trim().toLowerCase();

const authUserName = (user: any): string | null => {
  const meta = isObject(user?.user_metadata) ? user.user_metadata as Json : {};
  const name = String(meta.full_name ?? meta.name ?? "").trim();
  return name || null;
};

const ensureUniqueTenantSlug = async (sb: any, raw: unknown, fallback: string): Promise<string> => {
  const base = normalizeSlug(raw, fallback).slice(0, 54);
  let slug = base;
  for (let i = 0; i < 20; i += 1) {
    const { data } = await sb.from("tenants").select("id").eq("slug", slug).maybeSingle();
    if (!data?.id) return slug;
    slug = `${base}-${randomCodePart(4).toLowerCase()}`;
  }
  throw new Error("Failed to create a unique tenant slug");
};

const ensurePlatformUser = async (sb: any, user: any): Promise<void> => {
  const email = authUserEmail(user);
  const { error } = await sb
    .from("users")
    .upsert(
      {
        id: user.id,
        email,
        full_name: authUserName(user),
        avatar_url: isObject(user?.user_metadata) ? String((user.user_metadata as Json).avatar_url ?? "") || null : null,
        is_active: true,
      },
      { onConflict: "id" },
    );
  if (error) throw error;
};

const ensurePersonalMembership = async (sb: any, user: any): Promise<MembershipRow[]> => {
  await ensurePlatformUser(sb, user);
  let memberships = await loadMemberships(sb, user.id);
  if (memberships.length > 0) return memberships;

  const email = authUserEmail(user);
  const slug = await ensureUniqueTenantSlug(sb, email, `user-${String(user.id).slice(0, 8)}`);
  const { data: tenant, error: tenantError } = await sb
    .from("tenants")
    .insert({ name: email, slug, type: "personal", created_by: user.id })
    .select("id")
    .maybeSingle();
  if (tenantError || !tenant?.id) throw tenantError ?? new Error("Failed to create personal tenant");

  const { error: memberError } = await sb
    .from("tenant_memberships")
    .insert({ tenant_id: tenant.id, user_id: user.id, role: "owner", status: "active" });
  if (memberError) throw memberError;
  memberships = await loadMemberships(sb, user.id);
  return memberships;
};

const forwardEdge = async (
  supabaseUrl: string,
  anonKey: string,
  token: string,
  functionName: string,
  init: RequestInit,
): Promise<Response> => {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("apikey", anonKey);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${supabaseUrl}/functions/v1/${functionName}`, { ...init, headers });
};

const isTicketEligible = (metadata: unknown): boolean => {
  const ticketing = isObject(metadata) ? (metadata as any).ticketing : null;
  return Boolean(ticketing?.eligible === true && String(ticketing?.mode ?? "") === "single_sitting");
};

const getFirstTenant = async (sb: any, tenantId: string): Promise<{ id: string; name: string; slug: string } | null> => {
  const { data } = await sb.from("tenants").select("id, name, slug").eq("id", tenantId).maybeSingle();
  return data?.id ? { id: String(data.id), name: String(data.name ?? "Education center"), slug: String(data.slug ?? "center") } : null;
};

const getCenterProfile = async (sb: any, tenantId: string): Promise<any | null> => {
  const { data, error } = await sb
    .from("partner_center_profiles")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  return data?.tenant_id ? data : null;
};

const ensureUniqueCenterSlug = async (sb: any, raw: unknown, fallback: string): Promise<string> => {
  const base = normalizeSlug(raw, fallback).slice(0, 54);
  let slug = base;
  for (let i = 0; i < 20; i += 1) {
    const { data } = await sb.from("partner_center_profiles").select("tenant_id").eq("slug", slug).maybeSingle();
    if (!data?.tenant_id) return slug;
    slug = `${base}-${randomCodePart(4).toLowerCase()}`;
  }
  throw new Error("Failed to create a unique center slug");
};

const findCenterProfileForMemberships = async (sb: any, memberships: MembershipRow[]): Promise<any | null> => {
  const tenantIds = memberships.map((m) => m.tenant_id).filter(Boolean);
  if (tenantIds.length === 0) return null;
  const { data, error } = await sb
    .from("partner_center_profiles")
    .select("*")
    .in("tenant_id", tenantIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  return rows.find((row: any) => row.status === "active") ?? rows.find((row: any) => row.status === "pending") ?? rows[0] ?? null;
};

const ensureCenterProfile = async (sb: any, tenantId: string, userId: string): Promise<any> => {
  const existing = await getCenterProfile(sb, tenantId);
  if (existing?.tenant_id) return existing;

  const tenant = await getFirstTenant(sb, tenantId);
  const baseSlug = normalizeSlug(tenant?.slug ?? tenant?.name, `center-${randomCodePart(4).toLowerCase()}`);
  let slug = baseSlug;
  for (let i = 0; i < 10; i += 1) {
    const { data } = await sb.from("partner_center_profiles").select("tenant_id").eq("slug", slug).maybeSingle();
    if (!data?.tenant_id) break;
    slug = `${baseSlug}-${randomCodePart(3).toLowerCase()}`;
  }

  const { data: inserted, error: insertError } = await sb
    .from("partner_center_profiles")
    .insert({
      tenant_id: tenantId,
      display_name: tenant?.name ?? "Education center",
      slug,
      status: "pending",
      package_tier: "starter",
      commercial_model: "hybrid",
      public_instructions: "Enter your Schood voucher code to start your exam or activate your learning access.",
      created_by: userId,
      branding: {},
      commission_rules: {},
      wholesale_pricing: {},
      wallet_settings: { currency: "UZS" },
    })
    .select("*")
    .maybeSingle();
  if (insertError) throw insertError;
  return inserted;
};

const createCenterApplication = async (sb: any, body: Json, user: any): Promise<{ center: any; tenant: any }> => {
  await ensurePlatformUser(sb, user);
  const displayName = String(body.display_name ?? body.center_name ?? "").trim().slice(0, 120);
  if (!displayName) throw new Error("Center name is required");
  const slug = await ensureUniqueTenantSlug(sb, body.slug ?? displayName, `center-${randomCodePart(4).toLowerCase()}`);
  const { data: tenant, error: tenantError } = await sb
    .from("tenants")
    .insert({ name: displayName, slug, type: "org", created_by: user.id })
    .select("id, name, slug, type")
    .maybeSingle();
  if (tenantError || !tenant?.id) throw tenantError ?? new Error("Failed to create center tenant");

  const { error: memberError } = await sb
    .from("tenant_memberships")
    .insert({ tenant_id: tenant.id, user_id: user.id, role: "owner", status: "active" });
  if (memberError) throw memberError;

  const profileSlug = await ensureUniqueCenterSlug(sb, body.slug ?? slug, slug);
  const { data: center, error: centerError } = await sb
    .from("partner_center_profiles")
    .insert({
      tenant_id: tenant.id,
      display_name: displayName,
      slug: profileSlug,
      logo_url: String(body.logo_url ?? "").trim().slice(0, 1000) || null,
      status: "pending",
      package_tier: "starter",
      commercial_model: "prepaid_wallet",
      public_instructions: String(body.public_instructions ?? "Enter your Schood voucher code to start your exam or activate your learning access.").trim().slice(0, 3000),
      powered_by_schood: true,
      created_by: user.id,
      branding: {
        contact_name: String(body.contact_name ?? "").trim() || null,
        contact_email: String(body.contact_email ?? authUserEmail(user)).trim().toLowerCase() || null,
        contact_phone: String(body.contact_phone ?? "").trim() || null,
      },
      commission_rules: {},
      wholesale_pricing: {},
      wallet_settings: { currency: "UZS" },
    })
    .select("*")
    .maybeSingle();
  if (centerError || !center?.tenant_id) throw centerError ?? new Error("Failed to create center profile");
  return { center, tenant };
};

const requireActiveCenterOffice = async (sb: any, tenantId: string, body?: Json): Promise<Response | null> => {
  if (!Boolean(body?.center_office)) return null;
  const profile = await getCenterProfile(sb, tenantId);
  if (!profile?.tenant_id) return json(403, { error: "Education center profile is required" });
  if (profile.status !== "active") {
    return json(403, { error: "Education center must be approved by Schood before this action is available", center_status: profile.status });
  }
  return null;
};

const loadCenterStaff = async (sb: any, tenantId: string): Promise<{ members: any[]; invites: any[] }> => {
  const [membersRes, invitesRes] = await Promise.all([
    sb
      .from("tenant_memberships")
      .select("id, tenant_id, user_id, role, status, created_at, users ( email, full_name )")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true }),
    sb
      .from("partner_center_staff_invites")
      .select("id, tenant_id, email, role, status, expires_at, accepted_by, accepted_at, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (membersRes.error) throw membersRes.error;
  if (invitesRes.error) throw invitesRes.error;
  return { members: membersRes.data ?? [], invites: invitesRes.data ?? [] };
};

const inviteCenterStaff = async (sb: any, tenantId: string, emailRaw: unknown, roleRaw: unknown, invitedBy: string): Promise<any> => {
  const email = normalizeEmail(emailRaw);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Valid staff email is required");
  const role = ["admin", "member"].includes(String(roleRaw)) ? String(roleRaw) : "member";
  const { data: userRow } = await sb.from("users").select("id").ilike("email", email).maybeSingle();
  if (userRow?.id) {
    const { data, error } = await sb
      .from("tenant_memberships")
      .upsert({ tenant_id: tenantId, user_id: userRow.id, role, status: "active" }, { onConflict: "tenant_id,user_id" })
      .select("id, tenant_id, user_id, role, status, created_at")
      .maybeSingle();
    if (error) throw error;
    return { mode: "membership", member: data };
  }

  const { data, error } = await sb
    .from("partner_center_staff_invites")
    .upsert(
      {
        tenant_id: tenantId,
        email,
        role,
        status: "pending",
        invited_by: invitedBy,
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
      { onConflict: "tenant_id,email,status" },
    )
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return { mode: "invite", invite: data };
};

const acceptPendingStaffInvites = async (sb: any, user: any): Promise<any[]> => {
  await ensurePlatformUser(sb, user);
  const email = authUserEmail(user);
  const { data: invites, error } = await sb
    .from("partner_center_staff_invites")
    .select("id, tenant_id, role, status, expires_at")
    .ilike("email", email)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString());
  if (error) throw error;
  const accepted: any[] = [];
  for (const invite of invites ?? []) {
    const { data: member, error: memberError } = await sb
      .from("tenant_memberships")
      .upsert({ tenant_id: invite.tenant_id, user_id: user.id, role: invite.role, status: "active" }, { onConflict: "tenant_id,user_id" })
      .select("id, tenant_id, user_id, role, status, created_at")
      .maybeSingle();
    if (memberError) throw memberError;
    await sb
      .from("partner_center_staff_invites")
      .update({ status: "accepted", accepted_by: user.id, accepted_at: new Date().toISOString() })
      .eq("id", invite.id);
    accepted.push(member);
  }
  return accepted;
};

const ensureUniqueVoucherCode = async (sb: any, prefix: string): Promise<string> => {
  const safePrefix = normalizeCode(prefix || "SCH").slice(0, 24) || "SCH";
  for (let i = 0; i < 20; i += 1) {
    const code = `${safePrefix}-${randomCodePart(6)}`;
    const [{ data: voucher }, { data: token }] = await Promise.all([
      sb.from("partner_vouchers").select("id").eq("code", code).maybeSingle(),
      sb.from("exam_tokens").select("id").eq("token_code", code).maybeSingle(),
    ]);
    if (!voucher?.id && !token?.id) return code;
  }
  throw new Error("Failed to generate unique voucher code");
};

const buildBatchCode = async (sb: any, tenantId: string, prefix: string): Promise<string> => {
  const base = normalizeCode(prefix || "BATCH").slice(0, 24) || "BATCH";
  for (let i = 0; i < 20; i += 1) {
    const code = `${base}-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${randomCodePart(4)}`;
    const { data } = await sb
      .from("partner_voucher_batches")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("batch_code", code)
      .maybeSingle();
    if (!data?.id) return code;
  }
  throw new Error("Failed to generate batch code");
};

const pricingKeyCandidates = (kind: string, resourceId: string | null, productId: string | null): string[] => [
  `${kind}:${resourceId ?? ""}`,
  `${kind}:${productId ?? ""}`,
  resourceId ?? "",
  productId ?? "",
  kind,
];

const lookupWholesalePrice = (profile: any, kind: string, resourceId: string | null, productId: string | null, fallback: number): number => {
  const pricing = isObject(profile?.wholesale_pricing) ? profile.wholesale_pricing as Json : {};
  for (const key of pricingKeyCandidates(kind, resourceId, productId)) {
    const value = Number((pricing as any)[key]);
    if (Number.isFinite(value) && value >= 0) return Math.floor(value);
  }
  return Math.max(0, Math.floor(fallback));
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

const computeReports = (results: any[], vouchers: any[], seats: any[]) => {
  const completed = results.filter((row) => String(row.registration_status ?? row.session_status ?? "") === "completed").length;
  const scores = results
    .map((row) => Number(row.overall_band ?? row.overall_score ?? NaN))
    .filter((value) => Number.isFinite(value));
  const averageScore = scores.length ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10) / 10 : null;
  const now = Date.now();
  const expiring = vouchers.filter((row) => row.status === "unused" && row.expires_at && Date.parse(row.expires_at) - now < 7 * 86400000).length;
  return {
    completed_exams: completed,
    average_score: averageScore,
    active_students: new Set(vouchers.map((row) => row.redeemed_by).filter(Boolean)).size,
    inactive_vouchers: vouchers.filter((row) => row.status === "unused").length,
    expiring_vouchers: expiring,
    unassigned_seats: seats.filter((row) => row.status === "unassigned").length,
  };
};

const loadResults = async (sb: any, tenantId: string, tokenId?: string | null) => {
  let query = sb
    .from("exam_registrations")
    .select(
      "id, token_id, status, created_at, first_name, last_name, legal_name, email, phone, session_id, experiences ( name ), exam_tokens ( token_code ), sessions!exam_registrations_session_id_fkey ( status )",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (tokenId) query = query.eq("token_id", tokenId);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const sessionIds = rows.map((row) => row.session_id).filter(Boolean);
  const evalMap = new Map<string, any>();
  if (sessionIds.length > 0) {
    const { data: evalRows } = await sb.from("evaluations").select("session_id, method, status, result").in("session_id", sessionIds);
    for (const row of evalRows ?? []) {
      const sid = String((row as any).session_id ?? "");
      if (!sid) continue;
      const existing = evalMap.get(sid);
      if (!existing || (row as any).method === "auto") evalMap.set(sid, row);
    }
  }

  return rows.map((row) => {
    const evaluation = evalMap.get(String(row.session_id ?? "")) ?? null;
    const result = isObject(evaluation?.result) ? evaluation.result : {};
    const overallScore = (result as any)?.overall_score ?? null;
    return {
      id: row.id,
      token_id: row.token_id,
      token_code: row.exam_tokens?.token_code ?? null,
      experience_name: row.experiences?.name ?? null,
      candidate_name: row.legal_name || `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
      email: row.email,
      phone: row.phone,
      session_id: row.session_id,
      session_status: row.sessions?.status ?? null,
      registration_status: row.status,
      overall_score: overallScore,
      overall_band: (result as any)?.overall_band ?? overallScore,
      listening_score: (result as any)?.listening_score ?? (result as any)?.listening_band ?? null,
      reading_score: (result as any)?.reading_score ?? (result as any)?.reading_band ?? null,
      writing_status: (result as any)?.writing_status ?? evaluation?.status ?? null,
      speaking_status: (result as any)?.speaking_status ?? null,
      weak_areas: (result as any)?.weak_areas ?? [],
      created_at: row.created_at,
    };
  });
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Unauthorized" });
    const { data: authData, error: authError } = await sb.auth.getUser(token);
    if (authError || !authData?.user) return json(401, { error: "Unauthorized" });

    const userId = authData.user.id;
    const memberships = await ensurePersonalMembership(sb, authData.user);
    if (memberships.length === 0) return json(403, { error: "No active tenant" });

    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "";
    const tenantId = requireTenant(memberships, url.searchParams.get("tenant_id"));
    if (!tenantId) return json(403, { error: "Forbidden" });

    if (req.method === "GET" && (action === "center" || action === "branding")) {
      const requestedTenantId = url.searchParams.get("tenant_id");
      const center = requestedTenantId ? await getCenterProfile(sb, tenantId) : await findCenterProfileForMemberships(sb, memberships);
      const resolvedTenantId = center?.tenant_id ?? tenantId;
      const tenant = await getFirstTenant(sb, resolvedTenantId);
      return json(200, { center, tenant, needs_application: !center?.tenant_id });
    }

    if (req.method === "GET" && (action === "catalog" || action === "experiences")) {
      const [experiencesRes, plansRes, productsRes] = await Promise.all([
        sb
          .from("experiences")
          .select("id, name, is_active, product_id, price_amount, price_currency, metadata, products ( name, type, status, metadata )")
          .eq("is_active", true)
          .order("created_at", { ascending: false }),
        sb
          .from("plans")
          .select("id, product_id, name, amount, currency, duration_days, metadata, is_active, products ( name, metadata )")
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
        sb
          .from("products")
          .select("id, name, type, status, metadata")
          .eq("status", "active")
          .order("created_at", { ascending: true }),
      ]);
      if (experiencesRes.error) return json(500, { error: "Failed to load catalog", detail: experiencesRes.error.message });
      if (plansRes.error) return json(500, { error: "Failed to load plans", detail: plansRes.error.message });
      if (productsRes.error) return json(500, { error: "Failed to load products", detail: productsRes.error.message });

      const experiences = (experiencesRes.data ?? [])
        .filter((row: any) => isTicketEligible(row.metadata))
        .map((row: any) => ({
          id: row.id,
          name: row.name,
          product_id: row.product_id,
          product_name: row.products?.name ?? null,
          app_url: row.products?.metadata?.app_url ?? null,
          price_amount: row.price_amount ?? null,
          price_currency: row.price_currency ?? "UZS",
          ticketing: row.metadata?.ticketing ?? null,
          is_ticket_ready: Number(row.price_amount ?? 0) > 0,
        }));

      return json(200, { experiences, plans: plansRes.data ?? [], products: productsRes.data ?? [] });
    }

    if (req.method === "GET" && action === "tickets") {
      const { data, error } = await sb
        .from("exam_tokens")
        .select("id, token_code, status, expires_at, created_at, experience_id, uses_count, max_uses, claimed_by, experiences ( name, product_id )")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) return json(500, { error: "Failed to load tickets", detail: error.message });
      return json(200, { tickets: data ?? [] });
    }

    if (req.method === "GET" && action === "voucher_batches") {
      const { data, error } = await sb
        .from("partner_voucher_batches")
        .select("*, products ( name, metadata ), experiences ( name ), plans ( name, duration_days )")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) return json(500, { error: "Failed to load voucher batches", detail: error.message });
      return json(200, { batches: data ?? [] });
    }

    if (req.method === "GET" && action === "vouchers") {
      const status = String(url.searchParams.get("status") ?? "").trim();
      let query = sb
        .from("partner_vouchers")
        .select("*, products ( name, metadata ), experiences ( name ), plans ( name, duration_days )")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(300);
      if (status) query = query.eq("status", status);
      const { data, error } = await query;
      if (error) return json(500, { error: "Failed to load vouchers", detail: error.message });
      return json(200, { vouchers: data ?? [] });
    }

    if (req.method === "GET" && action === "results") {
      const results = await loadResults(sb, tenantId, url.searchParams.get("token_id"));
      return json(200, { results });
    }

    if (req.method === "GET" && action === "students") {
      const { data, error } = await sb
        .from("partner_vouchers")
        .select("id, code, access_kind, status, assigned_name, assigned_email, assigned_phone, redeemed_by, redeemed_at, expires_at, products ( name ), experiences ( name ), plans ( name )")
        .eq("tenant_id", tenantId)
        .or("assigned_email.not.is.null,redeemed_by.not.is.null")
        .order("updated_at", { ascending: false })
        .limit(300);
      if (error) return json(500, { error: "Failed to load students", detail: error.message });
      const students = (data ?? []).map((row: any) => ({
        id: row.id,
        voucher_code: row.code,
        name: row.assigned_name ?? null,
        email: row.assigned_email ?? null,
        phone: row.assigned_phone ?? null,
        access_kind: row.access_kind,
        product_name: row.products?.name ?? row.experiences?.name ?? row.plans?.name ?? null,
        status: row.status,
        redeemed_by: row.redeemed_by,
        redeemed_at: row.redeemed_at,
        expires_at: row.expires_at,
      }));
      return json(200, { students });
    }

    if (req.method === "GET" && action === "staff") {
      if (!requireTenantAdmin(memberships, tenantId)) return json(403, { error: "Tenant admin access is required" });
      const staff = await loadCenterStaff(sb, tenantId);
      return json(200, staff);
    }

    if (req.method === "GET" && action === "seats") {
      const { data, error } = await sb
        .from("seat_licenses")
        .select("id, status, expires_at, assigned_at, starts_at, ends_at, plan_id, product_id, assigned_user_id, plans ( name, duration_days ), assigned_user:users!seat_licenses_assigned_user_id_fkey ( email )")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) return json(500, { error: "Failed to load seats", detail: error.message });
      return json(200, { seats: data ?? [] });
    }

    if (req.method === "GET" && action === "payments") {
      const { data, error } = await sb
        .from("payments")
        .select("id, provider, provider_transaction_id, status, amount, original_amount, discount_amount, credit_amount, referral_discount_amount, currency, purchase_type, product_id, plan_id, created_at, granted_at, metadata")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) return json(500, { error: "Failed to load payments", detail: error.message });
      return json(200, { payments: data ?? [] });
    }

    if (req.method === "GET" && (action === "wallet" || action === "credits")) {
      const currency = String(url.searchParams.get("currency") ?? "UZS").toUpperCase();
      const [{ data: walletBalance }, walletRows, { data: platformCredit }] = await Promise.all([
        sb.rpc("partner_wallet_available", { p_tenant_id: tenantId, p_currency: currency }),
        sb
          .from("partner_wallet_ledger")
          .select("id, amount, currency, entry_kind, status, payment_id, voucher_batch_id, metadata, created_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(100),
        sb.rpc("platform_credit_available", { p_user_id: userId, p_currency: currency }),
      ]);
      if (walletRows.error) return json(500, { error: "Failed to load wallet", detail: walletRows.error.message });
      return json(200, {
        wallet: { currency, available_amount: Number(walletBalance ?? 0) },
        credit: { currency, available_amount: Number(platformCredit ?? 0) },
        ledger: walletRows.data ?? [],
      });
    }

    if (req.method === "GET" && action === "referrals") {
      const forwarded = await forwardEdge(supabaseUrl, anonKey, token, "referrals/me", { method: "GET" });
      const body = await forwarded.text();
      return new Response(body, { status: forwarded.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (req.method === "GET" && action === "commissions") {
      const forwarded = await forwardEdge(supabaseUrl, anonKey, token, "referrals/me", { method: "GET" });
      const body = await forwarded.json().catch(() => ({}));
      return json(forwarded.status, {
        account: body.account ?? null,
        cash: body.cash ?? null,
        rewards: body.rewards ?? [],
        cash_payout_requests: body.cash_payout_requests ?? [],
      });
    }

    if (req.method === "GET" && action === "reports") {
      const [results, vouchersRes, seatsRes] = await Promise.all([
        loadResults(sb, tenantId),
        sb.from("partner_vouchers").select("id, status, redeemed_by, expires_at").eq("tenant_id", tenantId).limit(1000),
        sb.from("seat_licenses").select("id, status").eq("tenant_id", tenantId).limit(1000),
      ]);
      if (vouchersRes.error) return json(500, { error: "Failed to load report vouchers", detail: vouchersRes.error.message });
      if (seatsRes.error) return json(500, { error: "Failed to load report seats", detail: seatsRes.error.message });
      return json(200, { reports: computeReports(results, vouchersRes.data ?? [], seatsRes.data ?? []), results });
    }

    if (req.method === "GET" && action === "dashboard") {
      const [center, tickets, seats, payments, results, vouchers, batches, wallet] = await Promise.all([
        getCenterProfile(sb, tenantId),
        sb.from("exam_tokens").select("id, status", { count: "exact", head: true }).eq("tenant_id", tenantId),
        sb.from("seat_licenses").select("id, status", { count: "exact", head: true }).eq("tenant_id", tenantId),
        sb.from("payments").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        sb.from("exam_registrations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        sb.from("partner_vouchers").select("id, status", { count: "exact" }).eq("tenant_id", tenantId).limit(1000),
        sb.from("partner_voucher_batches").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        sb.rpc("partner_wallet_available", { p_tenant_id: tenantId, p_currency: "UZS" }),
      ]);
      const voucherRows = vouchers.data ?? [];
      return json(200, {
        tenant_id: tenantId,
        center,
        counts: {
          tickets: tickets.count ?? 0,
          seats: seats.count ?? 0,
          payments: payments.count ?? 0,
          results: results.count ?? 0,
          voucher_batches: batches.count ?? 0,
          vouchers: vouchers.count ?? voucherRows.length,
          vouchers_unused: voucherRows.filter((row: any) => row.status === "unused").length,
          vouchers_redeemed: voucherRows.filter((row: any) => row.status === "redeemed").length,
        },
        wallet: { currency: "UZS", available_amount: Number(wallet.data ?? 0) },
        credit: { currency: "UZS", available_amount: Number(wallet.data ?? 0) },
      });
    }

    if (req.method === "GET" && action === "plans") {
      const { data, error } = await sb
        .from("plans")
        .select("id, product_id, name, amount, currency, duration_days, metadata, is_active, products ( name, metadata )")
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) return json(500, { error: "Failed to load plans", detail: error.message });
      return json(200, { plans: data ?? [] });
    }

    if (req.method === "POST") {
      if (action === "upload_center_logo") {
        if (!requireTenantAdmin(memberships, tenantId)) return json(403, { error: "Tenant admin access is required" });
        const profile = await getCenterProfile(sb, tenantId);
        if (!profile?.tenant_id) return json(403, { error: "Education center profile is required" });
        const form = await req.formData();
        const file = form.get("file");
        if (!(file instanceof File)) return json(400, { error: "file is required" });
        if (!String(file.type ?? "").startsWith("image/")) return json(400, { error: "Logo must be an image file" });
        if ((file as any).size && Number((file as any).size) > 3 * 1024 * 1024) return json(400, { error: "Logo must be smaller than 3MB" });

        const cfg = getS3Config({ required: true })!;
        const safeName = sanitizeFilename(file.name || "logo");
        const ext = safeName.includes(".") ? safeName.split(".").pop() : "";
        const path = `partner-centers/${tenantId}/logos/${crypto.randomUUID()}${ext ? `.${ext}` : ""}-${safeName}`;
        await uploadFileToS3(path, file, file.type || "image/png", { route: url.pathname, userId });
        const signedUrl = await signStoredPath(sb, cfg.bucket, path, 60 * 60 * 24 * 7, { route: url.pathname, userId });
        const branding = isObject(profile.branding) ? { ...profile.branding } : {};
        branding.logo_storage = { provider: "s3", bucket: cfg.bucket, path };
        const { data, error } = await sb
          .from("partner_center_profiles")
          .update({ logo_url: signedUrl, branding })
          .eq("tenant_id", tenantId)
          .select("*")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to save logo", detail: error.message });
        return json(200, { center: data, logo_url: signedUrl, storage: branding.logo_storage });
      }

      const body = (await req.json().catch(() => ({}))) as Json;
      const actionBody = String(body.action ?? "");

      if (actionBody === "accept_staff_invites") {
        const accepted = await acceptPendingStaffInvites(sb, authData.user);
        return json(200, { accepted });
      }

      if (actionBody === "apply_center") {
        const result = await createCenterApplication(sb, body, authData.user);
        return json(200, {
          ...result,
          status: "pending",
          note: "Center application created. Schood admin approval is required before dashboard tools unlock.",
        });
      }

      if (["update_center_profile", "create_wallet_topup", "create_voucher_batch", "void_voucher", "export_report", "resend_student_invite", "invite_staff", "update_staff"].includes(actionBody)) {
        if (!requireTenantAdmin(memberships, tenantId)) return json(403, { error: "Tenant admin access is required" });
      }

      if (actionBody === "invite_staff") {
        const result = await inviteCenterStaff(sb, tenantId, body.email, body.role, userId);
        const staff = await loadCenterStaff(sb, tenantId);
        return json(200, { ...result, ...staff });
      }

      if (actionBody === "update_staff") {
        const membershipId = String(body.membership_id ?? "").trim();
        const nextStatus = String(body.status ?? "").trim();
        const nextRole = String(body.role ?? "").trim();
        if (!membershipId) return json(400, { error: "membership_id is required" });
        const patch: Json = {};
        if (["active", "disabled"].includes(nextStatus)) patch.status = nextStatus;
        if (["admin", "member"].includes(nextRole)) patch.role = nextRole;
        if (Object.keys(patch).length === 0) return json(400, { error: "No staff change supplied" });
        const { data, error } = await sb
          .from("tenant_memberships")
          .update(patch)
          .eq("id", membershipId)
          .eq("tenant_id", tenantId)
          .neq("user_id", userId)
          .select("id")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to update staff", detail: error.message });
        if (!data?.id) return json(400, { error: "Staff member not found or cannot modify your own owner access" });
        const staff = await loadCenterStaff(sb, tenantId);
        return json(200, staff);
      }

      if (actionBody === "update_center_profile") {
        const current = await ensureCenterProfile(sb, tenantId, userId);
        const patch: Json = {};
        if ("display_name" in body) patch.display_name = String(body.display_name ?? current.display_name).trim().slice(0, 120) || current.display_name;
        if ("slug" in body) patch.slug = normalizeSlug(body.slug, current.slug);
        if ("logo_url" in body) patch.logo_url = String(body.logo_url ?? "").trim().slice(0, 1000) || null;
        if ("public_instructions" in body) patch.public_instructions = String(body.public_instructions ?? "").trim().slice(0, 3000) || null;
        if ("powered_by_schood" in body) patch.powered_by_schood = Boolean(body.powered_by_schood);
        if ("branding" in body) patch.branding = isObject(body.branding) ? body.branding : {};
        if ("commercial_model" in body && ["prepaid_wallet", "wholesale", "revenue_share", "hybrid"].includes(String(body.commercial_model))) {
          patch.commercial_model = String(body.commercial_model);
        }

        const { data, error } = await sb
          .from("partner_center_profiles")
          .update(patch)
          .eq("tenant_id", tenantId)
          .select("*")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to update center profile", detail: error.message });
        return json(200, { center: data });
      }

      if (actionBody === "create_wallet_topup") {
        const gate = await requireActiveCenterOffice(sb, tenantId, body);
        if (gate) return gate;
        const amount = normalizeQuantity(body.amount, 1000000000);
        const currency = String(body.currency ?? "UZS").toUpperCase();
        if (!amount) return json(400, { error: "amount must be positive" });
        const { data, error } = await sb
          .from("partner_wallet_ledger")
          .insert({
            tenant_id: tenantId,
            user_id: userId,
            entry_kind: "topup",
            status: "reserved",
            amount,
            currency,
            created_by: userId,
            metadata: { source: "partner_office", note: body.note ?? null, requires_admin_settlement: true },
          })
          .select("*")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to request wallet top-up", detail: error.message });
        return json(200, { ledger_entry: data, status: "reserved", note: "Top-up request recorded. Admin settlement is required before funds become available." });
      }

      if (actionBody === "create_voucher_batch") {
        const gate = await requireActiveCenterOffice(sb, tenantId, body);
        if (gate) return gate;
        const profile = await ensureCenterProfile(sb, tenantId, userId);
        const accessKind = String(body.access_kind ?? "").trim();
        if (!["mock_exam", "subscription", "seat"].includes(accessKind)) return json(400, { error: "Unsupported access_kind" });
        const quantity = normalizeQuantity(body.quantity, 500);
        if (!quantity) return json(400, { error: "quantity must be between 1 and 500" });
        const prefix = normalizeCode(body.prefix ?? `SCH-${String(profile.slug ?? "CENTER").toUpperCase()}`);
        const expiresAt = body.expires_at
          ? new Date(String(body.expires_at)).toISOString()
          : new Date(Date.now() + (normalizeDays(body.expires_in_days, 365) ?? 30) * 86400000).toISOString();
        if (Date.parse(expiresAt) <= Date.now()) return json(400, { error: "expires_at must be in the future" });

        let productId = String(body.product_id ?? "").trim() || null;
        let experienceId = String(body.experience_id ?? "").trim() || null;
        let planId = String(body.plan_id ?? "").trim() || null;
        let unitPrice = 0;
        let currency = "UZS";

        if (accessKind === "mock_exam") {
          if (!experienceId) return json(400, { error: "experience_id is required for mock vouchers" });
          const { data: exp, error } = await sb
            .from("experiences")
            .select("id, product_id, is_active, price_amount, price_currency, metadata")
            .eq("id", experienceId)
            .maybeSingle();
          if (error || !exp?.id || !exp.is_active) return json(400, { error: "Invalid experience_id" });
          if (!isTicketEligible(exp.metadata)) return json(400, { error: "Experience is not ticket eligible" });
          productId = exp.product_id;
          currency = String(exp.price_currency ?? "UZS");
          unitPrice = lookupWholesalePrice(profile, accessKind, experienceId, productId, Number(exp.price_amount ?? 0));
        } else if (accessKind === "subscription") {
          if (!planId) return json(400, { error: "plan_id is required for subscription vouchers" });
          const { data: plan, error } = await sb
            .from("plans")
            .select("id, product_id, amount, currency, is_active")
            .eq("id", planId)
            .maybeSingle();
          if (error || !plan?.id || !plan.is_active) return json(400, { error: "Invalid plan_id" });
          productId = plan.product_id;
          currency = String(plan.currency ?? "UZS");
          unitPrice = lookupWholesalePrice(profile, accessKind, planId, productId, Number(plan.amount ?? 0));
        } else {
          if (!planId) return json(400, { error: "plan_id is required for seat vouchers" });
          const { data: seatRows, error } = await sb
            .from("seat_licenses")
            .select("id, plan_id, product_id")
            .eq("tenant_id", tenantId)
            .eq("plan_id", planId)
            .eq("status", "unassigned")
            .order("created_at", { ascending: true })
            .limit(quantity);
          if (error) return json(500, { error: "Failed to load seats", detail: error.message });
          if ((seatRows ?? []).length < quantity) return json(400, { error: "Not enough unassigned seats for this plan" });
          productId = String((seatRows ?? [])[0]?.product_id ?? productId ?? "");
          unitPrice = 0;
        }

        const sourceModel = String(body.source_model ?? profile.commercial_model ?? "prepaid_wallet");
        const totalAmount = unitPrice * quantity;
        if (sourceModel === "prepaid_wallet" && totalAmount > 0) {
          const { data: available } = await sb.rpc("partner_wallet_available", { p_tenant_id: tenantId, p_currency: currency });
          if (Number(available ?? 0) < totalAmount) return json(400, { error: "Insufficient partner wallet balance" });
        }

        const batchCode = await buildBatchCode(sb, tenantId, prefix);
        const { data: batch, error: batchError } = await sb
          .from("partner_voucher_batches")
          .insert({
            tenant_id: tenantId,
            batch_code: batchCode,
            access_kind: accessKind,
            product_id: productId,
            experience_id: experienceId,
            plan_id: planId,
            quantity,
            expires_at: expiresAt,
            prefix,
            source_model: sourceModel === "prepaid_wallet" || sourceModel === "wholesale" || sourceModel === "revenue_share" ? sourceModel : "manual",
            created_by: userId,
            metadata: {
              unit_price: unitPrice,
              total_amount: totalAmount,
              currency,
              assigned_students: Array.isArray(body.assigned_students) ? body.assigned_students.length : 0,
            },
          })
          .select("*")
          .maybeSingle();
        if (batchError || !batch?.id) return json(500, { error: "Failed to create voucher batch", detail: batchError?.message });

        const assignedStudents = Array.isArray(body.assigned_students) ? body.assigned_students : [];
        const vouchers = [];
        if (accessKind === "mock_exam") {
          for (let i = 0; i < quantity; i += 1) {
            const code = await ensureUniqueVoucherCode(sb, prefix);
            const { data: tokenRow, error: tokenError } = await sb
              .from("exam_tokens")
              .insert({
                tenant_id: tenantId,
                experience_id: experienceId,
                token_code: code,
                status: "active",
                expires_at: expiresAt,
                max_uses: 1,
                uses_count: 0,
                created_by: userId,
                metadata: { source: "partner_voucher", batch_id: batch.id },
              })
              .select("id")
              .maybeSingle();
            if (tokenError || !tokenRow?.id) return json(500, { error: "Failed to create exam token", detail: tokenError?.message });
            const assigned = isObject(assignedStudents[i]) ? assignedStudents[i] as Json : {};
            vouchers.push({
              tenant_id: tenantId,
              batch_id: batch.id,
              code,
              access_kind: accessKind,
              product_id: productId,
              experience_id: experienceId,
              plan_id: null,
              exam_token_id: tokenRow.id,
              status: "unused",
              expires_at: expiresAt,
              assigned_name: String(assigned.name ?? "").trim() || null,
              assigned_email: String(assigned.email ?? "").trim().toLowerCase() || null,
              assigned_phone: String(assigned.phone ?? "").trim() || null,
              source_payment_id: null,
              metadata: { batch_code: batchCode },
            });
          }
        } else {
          let seatRows: any[] = [];
          if (accessKind === "seat") {
            const { data } = await sb
              .from("seat_licenses")
              .select("id")
              .eq("tenant_id", tenantId)
              .eq("plan_id", planId)
              .eq("status", "unassigned")
              .order("created_at", { ascending: true })
              .limit(quantity);
            seatRows = data ?? [];
          }
          for (let i = 0; i < quantity; i += 1) {
            const code = await ensureUniqueVoucherCode(sb, prefix);
            const assigned = isObject(assignedStudents[i]) ? assignedStudents[i] as Json : {};
            vouchers.push({
              tenant_id: tenantId,
              batch_id: batch.id,
              code,
              access_kind: accessKind,
              product_id: productId,
              experience_id: null,
              plan_id: planId,
              seat_license_id: accessKind === "seat" ? seatRows[i]?.id ?? null : null,
              status: "unused",
              expires_at: expiresAt,
              assigned_name: String(assigned.name ?? "").trim() || null,
              assigned_email: String(assigned.email ?? "").trim().toLowerCase() || null,
              assigned_phone: String(assigned.phone ?? "").trim() || null,
              source_payment_id: null,
              metadata: { batch_code: batchCode },
            });
          }
        }

        const { data: insertedVouchers, error: voucherError } = await sb.from("partner_vouchers").insert(vouchers).select("*");
        if (voucherError) return json(500, { error: "Failed to create vouchers", detail: voucherError.message });

        if (sourceModel === "prepaid_wallet" && totalAmount > 0) {
          await sb.from("partner_wallet_ledger").insert({
            tenant_id: tenantId,
            user_id: userId,
            entry_kind: "debit",
            status: "posted",
            amount: totalAmount,
            currency,
            voucher_batch_id: batch.id,
            created_by: userId,
            metadata: { access_kind: accessKind, quantity, unit_price: unitPrice },
          });
        }

        return json(200, { batch, vouchers: insertedVouchers ?? [] });
      }

      if (actionBody === "void_voucher") {
        const gate = await requireActiveCenterOffice(sb, tenantId, body);
        if (gate) return gate;
        const voucherId = String(body.voucher_id ?? "").trim();
        if (!voucherId) return json(400, { error: "voucher_id is required" });
        const { data, error } = await sb
          .from("partner_vouchers")
          .update({ status: "void", metadata: { reason: body.reason ?? "voided_by_center", voided_by: userId } })
          .eq("id", voucherId)
          .eq("tenant_id", tenantId)
          .eq("status", "unused")
          .select("*")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to void voucher", detail: error.message });
        if (!data?.id) return json(400, { error: "Only unused vouchers can be voided" });
        if (data.exam_token_id) {
          await sb.from("exam_tokens").update({ status: "disabled" }).eq("id", data.exam_token_id).eq("status", "active");
        }
        return json(200, { voucher: data });
      }

      if (actionBody === "export_report") {
        const gate = await requireActiveCenterOffice(sb, tenantId, body);
        if (gate) return gate;
        const results = await loadResults(sb, tenantId);
        const csv = [
          ["Candidate", "Email", "Voucher", "Exam", "Status", "Score", "Date"],
          ...results.map((row) => [
            row.candidate_name ?? "",
            row.email ?? "",
            row.token_code ?? "",
            row.experience_name ?? "",
            row.session_status ?? row.registration_status ?? "",
            row.overall_band ?? row.overall_score ?? "",
            row.created_at ?? "",
          ]),
        ]
          .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
          .join("\n");
        return json(200, { filename: `schood-partner-report-${new Date().toISOString().slice(0, 10)}.csv`, csv });
      }

      if (actionBody === "resend_student_invite") {
        const gate = await requireActiveCenterOffice(sb, tenantId, body);
        if (gate) return gate;
        return json(200, { ok: true, status: "queued", note: "Invite delivery provider is not configured; voucher link can be copied from the dashboard." });
      }

      if (actionBody === "assign_seat") {
        const gate = await requireActiveCenterOffice(sb, tenantId, body);
        if (gate) return gate;
        const payload = { ...body };
        delete (payload as any).center_office;
        const forwarded = await forwardEdge(supabaseUrl, anonKey, token, "teacher-office", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const text = await forwarded.text();
        return new Response(text, { status: forwarded.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }

      if (actionBody === "request_cash_payout") {
        const gate = await requireActiveCenterOffice(sb, tenantId, body);
        if (gate) return gate;
        const payload = { ...body };
        delete (payload as any).action;
        delete (payload as any).center_office;
        const forwarded = await forwardEdge(supabaseUrl, anonKey, token, "referrals/cash-payouts/request", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const text = await forwarded.text();
        return new Response(text, { status: forwarded.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }

      if (actionBody === "quote_purchase") {
        const gate = await requireActiveCenterOffice(sb, tenantId, body);
        if (gate) return gate;
        const purchaseType = String(body.purchase_type ?? "").trim();
        const quantity = normalizeQuantity(body.quantity ?? body.seat_count, 500) ?? 1;
        let originalAmount = 0;
        let currency = "UZS";

        if (purchaseType === "token_pack") {
          const experienceId = String(body.experience_id ?? "");
          const { data: exp } = await sb.from("experiences").select("id, price_amount, price_currency").eq("id", experienceId).eq("is_active", true).maybeSingle();
          originalAmount = Number((exp as any)?.price_amount ?? 0) * quantity;
          currency = String((exp as any)?.price_currency ?? "UZS");
        } else {
          const planId = String(body.plan_id ?? "");
          const { data: plan } = await sb.from("plans").select("id, amount, currency").eq("id", planId).eq("is_active", true).maybeSingle();
          originalAmount = Number((plan as any)?.amount ?? 0) * quantity;
          currency = String((plan as any)?.currency ?? "UZS");
        }

        if (!Number.isFinite(originalAmount) || originalAmount <= 0) return json(400, { error: "Purchase is not priced" });
        const { data: creditAvailable } = await sb.rpc("platform_credit_available", { p_user_id: userId, p_currency: currency });
        const requestedCredit = body.apply_credit ? originalAmount : Math.max(0, Number(body.credit_amount ?? 0));
        const creditAmount = Math.min(originalAmount, Number(creditAvailable ?? 0), requestedCredit);
        return json(200, {
          quote: {
            purchase_type: purchaseType || "plan",
            quantity,
            currency,
            original_amount: originalAmount,
            credit_available: Number(creditAvailable ?? 0),
            credit_amount: creditAmount,
            final_amount: Math.max(0, originalAmount - creditAmount),
          },
        });
      }

      if (actionBody === "create_ticket_purchase" || actionBody === "create_seat_purchase") {
        const gate = await requireActiveCenterOffice(sb, tenantId, body);
        if (gate) return gate;
        const purchaseType = actionBody === "create_ticket_purchase" ? "token_pack" : "seat_pack";
        const quantity = normalizeQuantity(purchaseType === "token_pack" ? body.quantity : body.seat_count ?? body.quantity, 200) ?? 1;
        let originalAmount = 0;
        let currency = "UZS";

        if (purchaseType === "token_pack") {
          const experienceId = String(body.experience_id ?? "");
          const { data: exp } = await sb
            .from("experiences")
            .select("id, price_amount, price_currency")
            .eq("id", experienceId)
            .eq("is_active", true)
            .maybeSingle();
          originalAmount = Number((exp as any)?.price_amount ?? 0) * quantity;
          currency = String((exp as any)?.price_currency ?? "UZS");
        } else {
          const planId = String(body.plan_id ?? "");
          const { data: plan } = await sb
            .from("plans")
            .select("id, amount, currency")
            .eq("id", planId)
            .eq("is_active", true)
            .maybeSingle();
          originalAmount = Number((plan as any)?.amount ?? 0) * quantity;
          currency = String((plan as any)?.currency ?? "UZS");
        }

        if (Number.isFinite(originalAmount) && originalAmount > 0 && currency === "UZS") {
          const { data: creditAvailable } = await sb.rpc("platform_credit_available", { p_user_id: userId, p_currency: currency });
          const requestedCredit = body.apply_credit || typeof body.credit_amount !== "undefined"
            ? (typeof body.credit_amount === "undefined" || body.credit_amount === null ? originalAmount : normalizeMoney(body.credit_amount))
            : 0;
          const creditAmount = Math.min(originalAmount, Number(creditAvailable ?? 0), requestedCredit);
          const finalAmount = Math.max(0, originalAmount - creditAmount);
          if (finalAmount > TEMP_ONLINE_PAYMENT_MAX_AMOUNT_UZS) {
            return json(400, {
              error: "Online checkout is temporarily limited to 100,000 UZS per transaction while only one payment provider is enabled. For larger education center packs, use wallet top-up/admin settlement or split the purchase.",
              error_code: "online_payment_amount_limit",
              temporary: true,
              max_amount: TEMP_ONLINE_PAYMENT_MAX_AMOUNT_UZS,
              original_amount: originalAmount,
              credit_amount: creditAmount,
              final_amount: finalAmount,
              currency,
            });
          }
        }

        const payload = {
          ...body,
          purchase_type: purchaseType,
          tenant_id: String(body.tenant_id ?? tenantId),
          description: String(body.description ?? (purchaseType === "token_pack" ? "Partner mock ticket pack" : "Partner seat pack")),
        };
        delete (payload as any).action;
        delete (payload as any).center_office;

        if (purchaseType === "token_pack" && !normalizeDays((payload as any).expires_in_days)) {
          (payload as any).expires_in_days = 30;
        }

        const forwarded = await forwardEdge(supabaseUrl, anonKey, token, "tspay/create-transaction", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const text = await forwarded.text();
        return new Response(text, { status: forwarded.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }

      return json(400, { error: "Unknown action" });
    }

    return json(404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(500, { error: message });
  }
});
