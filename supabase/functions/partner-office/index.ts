import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { getS3Config, signStoredPath, uploadFileToS3 } from "../_shared/media-storage.ts";

type Json = Record<string, unknown>;
type MembershipRow = { id?: string; tenant_id: string; user_id?: string; role: string; status: string };
const CENTER_TIER_PRODUCT_ID = "00000000-0000-4000-8000-000000000701";
const TSPAY_MIN_AMOUNT_UZS = 1000;
const TSPAY_MAX_AMOUNT_UZS = 200000000;

type CenterCapabilities = {
  tier: "starter" | "growth" | "premium" | "exclusive";
  tier_label: string;
  staff_limit: number;
  max_voucher_batch_quantity: number;
  max_active_groups: number;
  max_upcoming_events: number;
  groups_enabled: boolean;
  student_invites_enabled: boolean;
  mock_events_enabled: boolean;
  review_queue_enabled: boolean;
  analytics_enabled: boolean;
  pdf_reports_enabled: boolean;
  statements_enabled: boolean;
  advanced_branding_enabled: boolean;
  public_events_enabled: boolean;
  payouts_enabled: boolean;
  white_label_enabled: boolean;
  included_features: string[];
};

const CENTER_TIER_CAPABILITIES: Record<string, CenterCapabilities> = {
  starter: {
    tier: "starter",
    tier_label: "Starter",
    staff_limit: 3,
    max_voucher_batch_quantity: 50,
    max_active_groups: 0,
    max_upcoming_events: 0,
    groups_enabled: false,
    student_invites_enabled: true,
    mock_events_enabled: false,
    review_queue_enabled: false,
    analytics_enabled: false,
    pdf_reports_enabled: false,
    statements_enabled: false,
    advanced_branding_enabled: false,
    public_events_enabled: false,
    payouts_enabled: false,
    white_label_enabled: false,
    included_features: ["Voucher generation", "Student registry", "CSV reports", "Logo and public page"],
  },
  growth: {
    tier: "growth",
    tier_label: "Growth",
    staff_limit: 10,
    max_voucher_batch_quantity: 300,
    max_active_groups: 20,
    max_upcoming_events: 20,
    groups_enabled: true,
    student_invites_enabled: true,
    mock_events_enabled: true,
    review_queue_enabled: true,
    analytics_enabled: true,
    pdf_reports_enabled: false,
    statements_enabled: true,
    advanced_branding_enabled: false,
    public_events_enabled: true,
    payouts_enabled: false,
    white_label_enabled: false,
    included_features: ["Groups/classes", "Mock events", "Teacher review queue", "Analytics", "Monthly statements"],
  },
  premium: {
    tier: "premium",
    tier_label: "Premium",
    staff_limit: 30,
    max_voucher_batch_quantity: 500,
    max_active_groups: 100,
    max_upcoming_events: 80,
    groups_enabled: true,
    student_invites_enabled: true,
    mock_events_enabled: true,
    review_queue_enabled: true,
    analytics_enabled: true,
    pdf_reports_enabled: true,
    statements_enabled: true,
    advanced_branding_enabled: true,
    public_events_enabled: true,
    payouts_enabled: true,
    white_label_enabled: false,
    included_features: ["PDF reports", "Advanced branding", "Revenue share payouts", "Higher staff and batch limits"],
  },
  exclusive: {
    tier: "exclusive",
    tier_label: "Exclusive",
    staff_limit: 100,
    max_voucher_batch_quantity: 1000,
    max_active_groups: 500,
    max_upcoming_events: 300,
    groups_enabled: true,
    student_invites_enabled: true,
    mock_events_enabled: true,
    review_queue_enabled: true,
    analytics_enabled: true,
    pdf_reports_enabled: true,
    statements_enabled: true,
    advanced_branding_enabled: true,
    public_events_enabled: true,
    payouts_enabled: true,
    white_label_enabled: true,
    included_features: ["Light white-label", "Custom operating limits", "Priority center operations", "Full reporting suite"],
  },
};

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

const normalizeCenterRole = (raw: unknown): "owner" | "admin" | "teacher" | "counselor" => {
  const role = String(raw ?? "").trim().toLowerCase();
  if (role === "owner") return "owner";
  if (role === "admin") return "admin";
  if (role === "counselor") return "counselor";
  return "teacher";
};

const normalizeCenterTier = (raw: unknown): CenterCapabilities["tier"] => {
  const tier = String(raw ?? "").trim().toLowerCase();
  if (tier === "growth" || tier === "premium" || tier === "exclusive") return tier;
  return "starter";
};

const CENTER_TIER_RANK: Record<CenterCapabilities["tier"], number> = {
  starter: 0,
  growth: 1,
  premium: 2,
  exclusive: 3,
};

const normalizeBillingPeriod = (raw: unknown): "monthly" | "annual" => {
  const period = String(raw ?? "").trim().toLowerCase();
  return period === "annual" ? "annual" : "monthly";
};

const getCenterCapabilities = (profile?: any | null): CenterCapabilities => {
  const base = CENTER_TIER_CAPABILITIES[normalizeCenterTier(profile?.package_tier)] ?? CENTER_TIER_CAPABILITIES.starter;
  const overrides = isObject(profile?.wallet_settings) && isObject((profile.wallet_settings as Json).capability_overrides)
    ? ((profile.wallet_settings as Json).capability_overrides as Json)
    : {};
  return {
    ...base,
    staff_limit: Number(overrides.staff_limit ?? base.staff_limit),
    max_voucher_batch_quantity: Number(overrides.max_voucher_batch_quantity ?? base.max_voucher_batch_quantity),
    max_active_groups: Number(overrides.max_active_groups ?? base.max_active_groups),
    max_upcoming_events: Number(overrides.max_upcoming_events ?? base.max_upcoming_events),
  };
};

const withCenterCapabilities = (profile?: any | null): any | null =>
  profile?.tenant_id ? { ...profile, capabilities: getCenterCapabilities(profile) } : profile ?? null;

const requireTierCapability = (profile: any, capability: keyof CenterCapabilities, label: string): Response | null => {
  const capabilities = getCenterCapabilities(profile);
  if (Boolean((capabilities as any)[capability])) return null;
  return json(403, {
    error: `${label} is not available on the ${capabilities.tier_label} center tier.`,
    error_code: "center_tier_capability_required",
    required_capability: capability,
    tier: capabilities.tier,
  });
};

const canManageCenter = (memberships: MembershipRow[], tenantId: string): boolean =>
  memberships.some((m) => m.tenant_id === tenantId && m.status === "active" && ["owner", "admin"].includes(normalizeCenterRole(m.role)));

const canOperateCenter = (memberships: MembershipRow[], tenantId: string): boolean =>
  memberships.some((m) => m.tenant_id === tenantId && m.status === "active" && ["owner", "admin", "teacher", "counselor"].includes(normalizeCenterRole(m.role)));

const canInviteCenterStudents = (memberships: MembershipRow[], tenantId: string): boolean =>
  memberships.some((m) => m.tenant_id === tenantId && m.status === "active" && ["owner", "admin", "counselor"].includes(normalizeCenterRole(m.role)));

const normalizeMoney = (raw: unknown): number => {
  const num = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.floor(num);
};

const loadMemberships = async (sb: any, userId: string): Promise<MembershipRow[]> => {
  const { data, error } = await sb
    .from("tenant_memberships")
    .select("id, tenant_id, user_id, role, status")
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
  canManageCenter(memberships, tenantId);

const requireCenterOperator = (memberships: MembershipRow[], tenantId: string): boolean =>
  canOperateCenter(memberships, tenantId);

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

const getAcademyAppUrl = async (sb: any): Promise<string> => {
  const { data } = await sb
    .from("products")
    .select("metadata")
    .eq("status", "active")
    .eq("metadata->>slug", "academy")
    .maybeSingle();
  const metadata = isObject(data?.metadata) ? data.metadata as Json : {};
  return String(metadata.app_url ?? Deno.env.get("ACADEMY_APP_URL") ?? "https://academy.schood.online").replace(/\/+$/, "");
};

const academyLinks = (appUrl: string, academyId: string) => ({
  academy_url: `${appUrl}/academy?academy_id=${encodeURIComponent(academyId)}`,
  teacher_office_url: `${appUrl}/academy/teacher?academy_id=${encodeURIComponent(academyId)}`,
  student_workspace_url: `${appUrl}/academy/student?academy_id=${encodeURIComponent(academyId)}`,
  classroom_directory_url: `${appUrl}/academy/classrooms?academy_id=${encodeURIComponent(academyId)}`,
});

const loadCenterAcademies = async (sb: any, centerTenantId: string): Promise<any[]> => {
  const appUrl = await getAcademyAppUrl(sb);
  const { data, error } = await sb
    .from("tenants")
    .select("id, name, slug, type, metadata, created_at")
    .eq("type", "team")
    .contains("metadata", { parent_center_id: centerTenantId, service_family: "academy" })
    .order("created_at", { ascending: true });
  if (error) throw error;

  const academies = data ?? [];
  const academyIds = academies.map((row: any) => String(row.id ?? "")).filter(Boolean);
  if (academyIds.length === 0) return [];

  const [membersRes, contactsRes, classroomsRes, offersRes] = await Promise.all([
    sb
      .from("tenant_memberships")
      .select("tenant_id, role, status")
      .in("tenant_id", academyIds)
      .eq("status", "active"),
    sb
      .from("academy_contacts")
      .select("academy_id, status")
      .in("academy_id", academyIds)
      .limit(5000),
    sb
      .from("academy_classrooms")
      .select("academy_id, is_active")
      .in("academy_id", academyIds)
      .limit(5000),
    sb
      .from("academy_offers")
      .select("academy_id, is_active")
      .in("academy_id", academyIds)
      .limit(5000),
  ]);
  if (membersRes.error) throw membersRes.error;
  if (contactsRes.error) throw contactsRes.error;
  if (classroomsRes.error) throw classroomsRes.error;
  if (offersRes.error) throw offersRes.error;

  const countByAcademy = (rows: any[] | null | undefined, key: string, predicate: (row: any) => boolean = () => true) => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) {
      if (!predicate(row)) continue;
      const academyId = String(row[key] ?? "");
      if (!academyId) continue;
      map.set(academyId, (map.get(academyId) ?? 0) + 1);
    }
    return map;
  };

  const activeStaff = countByAcademy(membersRes.data, "tenant_id");
  const admins = countByAcademy(membersRes.data, "tenant_id", (row) => ["owner", "admin"].includes(String(row.role ?? "")));
  const contacts = countByAcademy(contactsRes.data, "academy_id");
  const activeContacts = countByAcademy(contactsRes.data, "academy_id", (row) => String(row.status ?? "") === "active");
  const classrooms = countByAcademy(classroomsRes.data, "academy_id");
  const activeClassrooms = countByAcademy(classroomsRes.data, "academy_id", (row) => Boolean(row.is_active));
  const offers = countByAcademy(offersRes.data, "academy_id");
  const activeOffers = countByAcademy(offersRes.data, "academy_id", (row) => Boolean(row.is_active));

  return academies.map((row: any) => {
    const academyId = String(row.id ?? "");
    return {
      id: academyId,
      name: String(row.name ?? ""),
      slug: String(row.slug ?? ""),
      type: String(row.type ?? "team"),
      metadata: isObject(row.metadata) ? row.metadata : {},
      created_at: String(row.created_at ?? ""),
      counts: {
        staff: activeStaff.get(academyId) ?? 0,
        admins: admins.get(academyId) ?? 0,
        contacts: contacts.get(academyId) ?? 0,
        active_contacts: activeContacts.get(academyId) ?? 0,
        classrooms: classrooms.get(academyId) ?? 0,
        active_classrooms: activeClassrooms.get(academyId) ?? 0,
        offers: offers.get(academyId) ?? 0,
        active_offers: activeOffers.get(academyId) ?? 0,
      },
      ...academyLinks(appUrl, academyId),
    };
  });
};

const createCenterAcademy = async (sb: any, centerTenantId: string, body: Json, userId: string): Promise<any> => {
  const center = await getCenterProfile(sb, centerTenantId);
  if (!center?.tenant_id) throw new Error("Education center profile is required");

  const academyName = String(body.name ?? body.academy_name ?? "").trim().slice(0, 160);
  if (!academyName) throw new Error("Academy name is required");

  const baseSlug = normalizeSlug(
    body.slug ?? `${center.slug ?? "center"}-${academyName}`,
    `academy-${randomCodePart(4).toLowerCase()}`,
  );
  const slug = await ensureUniqueTenantSlug(sb, baseSlug, baseSlug);
  const metadata = {
    service_family: "academy",
    academy_service: true,
    center_owned: true,
    parent_center_id: centerTenantId,
    parent_center_slug: center.slug ?? null,
    parent_center_name: center.display_name ?? null,
    created_from: "center_office",
    created_by_center_office_user: userId,
    landing: {
      headline: academyName,
      subheadline: `${center.display_name ?? "Education center"} academy`,
      teacher_cta_label: "Open Teacher Office",
      student_cta_label: "Open Student Workplace",
    },
  };

  const { data: academy, error: academyError } = await sb
    .from("tenants")
    .insert({
      name: academyName,
      slug,
      type: "team",
      created_by: userId,
      metadata,
    })
    .select("id, name, slug, type, metadata, created_at")
    .maybeSingle();
  if (academyError || !academy?.id) throw academyError ?? new Error("Failed to create academy");

  const { data: centerAdmins, error: staffError } = await sb
    .from("tenant_memberships")
    .select("user_id, role")
    .eq("tenant_id", centerTenantId)
    .eq("status", "active")
    .in("role", ["owner", "admin"]);
  if (staffError) throw staffError;

  const membershipRows = (centerAdmins ?? [])
    .filter((row: any) => row.user_id)
    .map((row: any) => ({
      tenant_id: academy.id,
      user_id: row.user_id,
      role: String(row.role ?? "") === "owner" ? "owner" : "admin",
      status: "active",
    }));

  if (!membershipRows.some((row: any) => row.user_id === userId)) {
    membershipRows.push({ tenant_id: academy.id, user_id: userId, role: "owner", status: "active" });
  }

  const { error: membershipError } = await sb
    .from("tenant_memberships")
    .upsert(membershipRows, { onConflict: "tenant_id,user_id" });
  if (membershipError) throw membershipError;

  const appUrl = await getAcademyAppUrl(sb);
  const academyId = String(academy.id);
  return {
    academy: {
      id: academyId,
      name: String(academy.name ?? academyName),
      slug: String(academy.slug ?? slug),
      type: String(academy.type ?? "team"),
      metadata: isObject(academy.metadata) ? academy.metadata : metadata,
      created_at: String(academy.created_at ?? ""),
      counts: {
        staff: membershipRows.length,
        admins: membershipRows.length,
        contacts: 0,
        active_contacts: 0,
        classrooms: 0,
        active_classrooms: 0,
        offers: 0,
        active_offers: 0,
      },
      ...academyLinks(appUrl, academyId),
    },
  };
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
  return {
    members: (membersRes.data ?? []).map((row: any) => ({ ...row, role: normalizeCenterRole(row.role) })),
    invites: (invitesRes.data ?? []).map((row: any) => ({ ...row, role: normalizeCenterRole(row.role) })),
  };
};

const inviteCenterStaff = async (sb: any, tenantId: string, emailRaw: unknown, roleRaw: unknown, invitedBy: string): Promise<any> => {
  const email = normalizeEmail(emailRaw);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Valid staff email is required");
  const role = normalizeCenterRole(roleRaw);
  if (role === "owner") throw new Error("Owner role cannot be invited from staff settings");
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

const expirePendingStaffInvites = async (sb: any, tenantId: string): Promise<void> => {
  await sb
    .from("partner_center_staff_invites")
    .update({ status: "expired" })
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());
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

const upsertCenterStudent = async (
  sb: any,
  input: {
    tenantId: string;
    userId?: string | null;
    fullName?: string | null;
    email?: string | null;
    phone?: string | null;
    voucherId?: string | null;
    inviteId?: string | null;
    createdBy?: string | null;
    metadata?: Json;
  },
): Promise<any | null> => {
  const email = normalizeEmail(input.email);
  const payload = {
    tenant_id: input.tenantId,
    user_id: input.userId ?? null,
    full_name: String(input.fullName ?? "").trim() || null,
    email: email || null,
    phone: String(input.phone ?? "").trim() || null,
    status: input.userId ? "active" : "invited",
    source_voucher_id: input.voucherId ?? null,
    source_invite_id: input.inviteId ?? null,
    last_activity_at: new Date().toISOString(),
    created_by: input.createdBy ?? null,
    metadata: input.metadata ?? {},
  };
  let existing: any | null = null;
  if (input.userId) {
    const { data } = await sb
      .from("partner_center_students")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("user_id", input.userId)
      .maybeSingle();
    existing = data ?? null;
  } else if (email) {
    const { data } = await sb
      .from("partner_center_students")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .ilike("email", email)
      .maybeSingle();
    existing = data ?? null;
  }
  const { data, error } = existing?.id
    ? await sb.from("partner_center_students").update(payload).eq("id", existing.id).select("*").maybeSingle()
    : await sb.from("partner_center_students").insert(payload).select("*").maybeSingle();
  if (error) throw error;
  return data;
};

const loadCenterStudents = async (sb: any, tenantId: string): Promise<any[]> => {
  const { data, error } = await sb
    .from("partner_center_students")
    .select("*, partner_center_group_members ( group_id, status, partner_center_groups ( id, name ) )")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (!error) {
    return (data ?? []).map((row: any) => ({
      id: row.id,
      student_id: row.id,
      voucher_code: row.metadata?.voucher_code ?? null,
      name: row.full_name,
      email: row.email,
      phone: row.phone,
      access_kind: row.metadata?.access_kind ?? "student",
      product_name: row.metadata?.product_name ?? null,
      status: row.status,
      redeemed_by: row.user_id,
      redeemed_at: row.last_activity_at,
      expires_at: row.metadata?.expires_at ?? null,
      groups: (row.partner_center_group_members ?? [])
        .filter((m: any) => m.status === "active")
        .map((m: any) => m.partner_center_groups)
        .filter(Boolean),
      last_activity_at: row.last_activity_at,
      metadata: row.metadata ?? {},
    }));
  }

  const fallback = await sb
    .from("partner_vouchers")
    .select("id, code, access_kind, status, assigned_name, assigned_email, assigned_phone, redeemed_by, redeemed_at, expires_at, products ( name ), experiences ( name ), plans ( name )")
    .eq("tenant_id", tenantId)
    .or("assigned_email.not.is.null,redeemed_by.not.is.null")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []).map((row: any) => ({
    id: row.id,
    student_id: null,
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
    groups: [],
  }));
};

const loadCenterGroups = async (sb: any, tenantId: string): Promise<any[]> => {
  const { data, error } = await sb
    .from("partner_center_groups")
    .select("*, assigned_teacher:tenant_memberships!partner_center_groups_assigned_teacher_membership_id_fkey ( id, role, users ( email, full_name ) ), partner_center_group_members ( id, status, student_id )")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row,
    student_count: (row.partner_center_group_members ?? []).filter((member: any) => member.status === "active").length,
  }));
};

const loadMockEvents = async (sb: any, tenantId: string): Promise<any[]> => {
  const { data, error } = await sb
    .from("partner_center_mock_events")
    .select("*, experiences ( name ), products ( name ), partner_center_groups ( name ), partner_voucher_batches ( batch_code ), partner_center_event_registrations ( id, attendance_status, registration_status )")
    .eq("tenant_id", tenantId)
    .order("starts_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row,
    registered_count: (row.partner_center_event_registrations ?? []).length,
    present_count: (row.partner_center_event_registrations ?? []).filter((r: any) => r.attendance_status === "present").length,
  }));
};

const loadReviewQueue = async (sb: any, tenantId: string): Promise<any[]> => {
  const { data, error } = await sb
    .from("partner_center_review_items")
    .select("*, partner_center_students ( full_name, email, phone ), partner_center_groups ( name ), partner_center_mock_events ( title ), assigned_staff:tenant_memberships!partner_center_review_items_assigned_staff_membership_id_fkey ( id, role, users ( email, full_name ) )")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return data ?? [];
};

const buildPaymentCapabilities = () => ({
  providers: [
    {
      provider: "tspay",
      label: "TSPay",
      currency: "UZS",
      min_amount: TSPAY_MIN_AMOUNT_UZS,
      max_amount: TSPAY_MAX_AMOUNT_UZS,
      enabled: Boolean(Deno.env.get("TSPAY_USERNAME") && Deno.env.get("TSPAY_PASSWORD")),
      temporary: false,
    },
  ],
  default_provider: "tspay",
});

const planCenterTier = (plan: any): CenterCapabilities["tier"] | null => {
  const tier = normalizeCenterTier(plan?.metadata?.center_tier);
  return tier === "starter" ? null : tier;
};

const planBillingPeriod = (plan: any): "monthly" | "annual" | null => {
  const period = String(plan?.metadata?.billing_period ?? "").trim().toLowerCase();
  return period === "monthly" || period === "annual" ? period : null;
};

const buildTierCatalog = async (sb: any, profile: any) => {
  const { data: plans, error } = await sb
    .from("plans")
    .select("id, product_id, name, amount, currency, duration_days, is_active, metadata")
    .eq("product_id", CENTER_TIER_PRODUCT_ID)
    .eq("is_active", true)
    .order("amount", { ascending: true });
  if (error) throw error;

  const currentTier = normalizeCenterTier(profile?.package_tier);
  const tiers = ["growth", "premium", "exclusive"].map((tier) => {
    const capabilities = CENTER_TIER_CAPABILITIES[tier];
    const tierPlans = (plans ?? [])
      .filter((plan: any) => planCenterTier(plan) === tier)
      .map((plan: any) => ({
        id: plan.id,
        name: plan.name,
        tier,
        billing_period: planBillingPeriod(plan) ?? "monthly",
        amount: Number(plan.amount ?? 0),
        currency: String(plan.currency ?? "UZS"),
        duration_days: plan.duration_days ?? null,
        metadata: plan.metadata ?? {},
      }))
      .sort((a: any, b: any) => (a.billing_period === b.billing_period ? a.amount - b.amount : a.billing_period.localeCompare(b.billing_period)));
    return {
      tier,
      tier_label: capabilities.tier_label,
      capabilities,
      plans: tierPlans,
      current: currentTier === tier,
      upgrade_available: CENTER_TIER_RANK[tier as CenterCapabilities["tier"]] >= CENTER_TIER_RANK[currentTier],
    };
  });

  const [subscriptionRes, requestsRes] = await Promise.all([
    sb.from("partner_center_tier_subscriptions").select("*").eq("tenant_id", profile.tenant_id).maybeSingle(),
    sb
      .from("partner_center_tier_change_requests")
      .select("*, payments ( id, provider, provider_transaction_id, tspay_order_id, tspay_cheque_id, tspay_transaction_id, status, amount, currency, created_at )")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (subscriptionRes.error && subscriptionRes.error.code !== "PGRST116") throw subscriptionRes.error;
  if (requestsRes.error) throw requestsRes.error;

  return {
    product_id: CENTER_TIER_PRODUCT_ID,
    current_tier: currentTier,
    current_capabilities: getCenterCapabilities(profile),
    tiers,
    subscription: subscriptionRes.data ?? null,
    requests: requestsRes.data ?? [],
  };
};

const createSimplePdf = async (title: string, lines: string[]): Promise<string> => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText(title, { x: 48, y: 790, size: 18, font: bold, color: rgb(0.06, 0.09, 0.16) });
  let y = 755;
  for (const line of lines.slice(0, 42)) {
    page.drawText(String(line).slice(0, 110), { x: 48, y, size: 10, font, color: rgb(0.17, 0.2, 0.25) });
    y -= 17;
  }
  page.drawText("Powered by Schood", { x: 48, y: 40, size: 9, font, color: rgb(0.45, 0.48, 0.55) });
  const bytes = await pdf.save();
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary);
};

const analyticsFrom = (students: any[], groups: any[], events: any[], reviews: any[], results: any[], vouchers: any[]) => {
  const redeemed = vouchers.filter((row) => row.status === "redeemed").length;
  const total = vouchers.length;
  const scores = results.map((row) => Number(row.overall_band ?? row.overall_score ?? NaN)).filter((n) => Number.isFinite(n));
  return {
    redemption_rate: total > 0 ? redeemed / total : 0,
    active_students: students.filter((row) => row.status === "active").length,
    inactive_students: students.filter((row) => row.status === "inactive" || row.status === "invited").length,
    groups: groups.length,
    upcoming_events: events.filter((row) => ["draft", "scheduled"].includes(row.status) && Date.parse(row.starts_at) >= Date.now()).length,
    pending_reviews: reviews.filter((row) => ["pending", "in_review"].includes(row.status)).length,
    average_score: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
    teacher_workload: reviews.reduce((acc: Record<string, number>, row: any) => {
      const key = row.assigned_staff?.users?.email ?? "unassigned";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  };
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

    if (req.method === "GET" && action === "payment_capabilities") {
      return json(200, buildPaymentCapabilities());
    }

    if (req.method === "GET" && action === "tier_catalog") {
      const center = await getCenterProfile(sb, tenantId);
      if (!center?.tenant_id) return json(404, { error: "Education center profile is required" });
      if (!requireTenantAdmin(memberships, center.tenant_id)) return json(403, { error: "Only center owners/admins can manage tier billing" });
      return json(200, await buildTierCatalog(sb, center));
    }

    if (req.method === "GET" && (action === "center" || action === "branding")) {
      const requestedTenantId = url.searchParams.get("tenant_id");
      const center = requestedTenantId ? await getCenterProfile(sb, tenantId) : await findCenterProfileForMemberships(sb, memberships);
      const resolvedTenantId = center?.tenant_id ?? tenantId;
      const tenant = await getFirstTenant(sb, resolvedTenantId);
      return json(200, { center: withCenterCapabilities(center), tenant, needs_application: !center?.tenant_id });
    }

    if (req.method === "GET" && action === "academies") {
      if (!requireCenterOperator(memberships, tenantId)) return json(403, { error: "Center staff access is required" });
      const gate = await requireActiveCenterOffice(sb, tenantId, { center_office: true });
      if (gate) return gate;
      return json(200, { academies: await loadCenterAcademies(sb, tenantId) });
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
      if (!requireCenterOperator(memberships, tenantId)) return json(403, { error: "Center staff access is required" });
      const students = await loadCenterStudents(sb, tenantId);
      return json(200, { students });
    }

    if (req.method === "GET" && action === "student_detail") {
      if (!requireCenterOperator(memberships, tenantId)) return json(403, { error: "Center staff access is required" });
      const studentId = String(url.searchParams.get("student_id") ?? "").trim();
      if (!studentId) return json(400, { error: "student_id is required" });
      const [studentRes, membershipsRes, reviewsRes] = await Promise.all([
        sb.from("partner_center_students").select("*").eq("tenant_id", tenantId).eq("id", studentId).maybeSingle(),
        sb.from("partner_center_group_members").select("*, partner_center_groups ( id, name )").eq("tenant_id", tenantId).eq("student_id", studentId),
        sb.from("partner_center_review_items").select("*").eq("tenant_id", tenantId).eq("student_id", studentId).limit(100),
      ]);
      if (studentRes.error) return json(500, { error: "Failed to load student", detail: studentRes.error.message });
      const student = studentRes.data;
      let voucherQuery = sb.from("partner_vouchers").select("*, products ( name ), experiences ( name ), plans ( name )").eq("tenant_id", tenantId).limit(50);
      if (student?.source_voucher_id) {
        voucherQuery = voucherQuery.eq("id", student.source_voucher_id);
      } else if (student?.user_id) {
        voucherQuery = voucherQuery.eq("redeemed_by", student.user_id);
      } else if (student?.email) {
        voucherQuery = voucherQuery.eq("assigned_email", student.email);
      } else {
        voucherQuery = voucherQuery.eq("id", "00000000-0000-0000-0000-000000000000");
      }
      const vouchersRes = await voucherQuery;
      return json(200, {
        student,
        groups: membershipsRes.data ?? [],
        vouchers: vouchersRes.data ?? [],
        reviews: reviewsRes.data ?? [],
      });
    }

    if (req.method === "GET" && action === "staff") {
      if (!requireTenantAdmin(memberships, tenantId)) return json(403, { error: "Tenant admin access is required" });
      await expirePendingStaffInvites(sb, tenantId);
      const staff = await loadCenterStaff(sb, tenantId);
      return json(200, staff);
    }

    if (req.method === "GET" && action === "groups") {
      if (!requireCenterOperator(memberships, tenantId)) return json(403, { error: "Center staff access is required" });
      const profile = await getCenterProfile(sb, tenantId);
      const gate = requireTierCapability(profile, "groups_enabled", "Groups and classes");
      if (gate) return gate;
      return json(200, { groups: await loadCenterGroups(sb, tenantId) });
    }

    if (req.method === "GET" && action === "mock_events") {
      if (!requireCenterOperator(memberships, tenantId)) return json(403, { error: "Center staff access is required" });
      const profile = await getCenterProfile(sb, tenantId);
      const gate = requireTierCapability(profile, "mock_events_enabled", "Mock events");
      if (gate) return gate;
      return json(200, { events: await loadMockEvents(sb, tenantId) });
    }

    if (req.method === "GET" && action === "review_queue") {
      if (!requireCenterOperator(memberships, tenantId)) return json(403, { error: "Center staff access is required" });
      const profile = await getCenterProfile(sb, tenantId);
      const gate = requireTierCapability(profile, "review_queue_enabled", "Teacher review queue");
      if (gate) return gate;
      return json(200, { review_items: await loadReviewQueue(sb, tenantId) });
    }

    if (req.method === "GET" && action === "statements") {
      if (!requireTenantAdmin(memberships, tenantId)) return json(403, { error: "Tenant admin access is required" });
      const profile = await getCenterProfile(sb, tenantId);
      const gate = requireTierCapability(profile, "statements_enabled", "Monthly statements");
      if (gate) return gate;
      const { data, error } = await sb
        .from("partner_center_statements")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("period_start", { ascending: false })
        .limit(36);
      if (error) return json(500, { error: "Failed to load statements", detail: error.message });
      return json(200, { statements: data ?? [] });
    }

    if (req.method === "GET" && action === "report_templates") {
      return json(200, {
        templates: [
          { id: "student_pdf", label: "Student PDF report" },
          { id: "group_pdf", label: "Group PDF report" },
          { id: "event_pdf", label: "Mock event PDF report" },
          { id: "statement_pdf", label: "Monthly statement PDF" },
        ],
      });
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
      const [results, vouchersRes, seatsRes, students, groups, events, reviews] = await Promise.all([
        loadResults(sb, tenantId),
        sb.from("partner_vouchers").select("id, status, redeemed_by, expires_at").eq("tenant_id", tenantId).limit(1000),
        sb.from("seat_licenses").select("id, status").eq("tenant_id", tenantId).limit(1000),
        loadCenterStudents(sb, tenantId).catch(() => []),
        loadCenterGroups(sb, tenantId).catch(() => []),
        loadMockEvents(sb, tenantId).catch(() => []),
        loadReviewQueue(sb, tenantId).catch(() => []),
      ]);
      if (vouchersRes.error) return json(500, { error: "Failed to load report vouchers", detail: vouchersRes.error.message });
      if (seatsRes.error) return json(500, { error: "Failed to load report seats", detail: seatsRes.error.message });
      return json(200, {
        reports: {
          ...computeReports(results, vouchersRes.data ?? [], seatsRes.data ?? []),
          active_groups: groups.filter((row: any) => row.status === "active").length,
          upcoming_events: events.filter((row: any) => ["draft", "scheduled"].includes(row.status) && Date.parse(row.starts_at) >= Date.now()).length,
          pending_reviews: reviews.filter((row: any) => ["pending", "in_review"].includes(row.status)).length,
          registered_students: students.length,
        },
        results,
      });
    }

    if (req.method === "GET" && action === "analytics") {
      if (!requireCenterOperator(memberships, tenantId)) return json(403, { error: "Center staff access is required" });
      const profile = await getCenterProfile(sb, tenantId);
      const gate = requireTierCapability(profile, "analytics_enabled", "Analytics");
      if (gate) return gate;
      const [students, groups, events, reviews, results, vouchersRes] = await Promise.all([
        loadCenterStudents(sb, tenantId),
        loadCenterGroups(sb, tenantId),
        loadMockEvents(sb, tenantId),
        loadReviewQueue(sb, tenantId),
        loadResults(sb, tenantId),
        sb.from("partner_vouchers").select("id, status, access_kind, expires_at, created_at").eq("tenant_id", tenantId).limit(5000),
      ]);
      if (vouchersRes.error) return json(500, { error: "Failed to load voucher analytics", detail: vouchersRes.error.message });
      return json(200, { analytics: analyticsFrom(students, groups, events, reviews, results, vouchersRes.data ?? []) });
    }

    if (req.method === "GET" && action === "dashboard") {
      const [center, tickets, seats, payments, results, vouchers, batches, wallet, students, groups, events, reviews, academies] = await Promise.all([
        getCenterProfile(sb, tenantId),
        sb.from("exam_tokens").select("id, status", { count: "exact", head: true }).eq("tenant_id", tenantId),
        sb.from("seat_licenses").select("id, status", { count: "exact", head: true }).eq("tenant_id", tenantId),
        sb.from("payments").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        sb.from("exam_registrations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        sb.from("partner_vouchers").select("id, status", { count: "exact" }).eq("tenant_id", tenantId).limit(1000),
        sb.from("partner_voucher_batches").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        sb.rpc("partner_wallet_available", { p_tenant_id: tenantId, p_currency: "UZS" }),
        sb.from("partner_center_students").select("id, status", { count: "exact" }).eq("tenant_id", tenantId).limit(1000),
        sb.from("partner_center_groups").select("id, status", { count: "exact" }).eq("tenant_id", tenantId).limit(1000),
        sb.from("partner_center_mock_events").select("id, status, starts_at", { count: "exact" }).eq("tenant_id", tenantId).limit(1000),
        sb.from("partner_center_review_items").select("id, status", { count: "exact" }).eq("tenant_id", tenantId).limit(1000),
        sb.from("tenants").select("id", { count: "exact", head: true }).eq("type", "team").contains("metadata", { parent_center_id: tenantId, service_family: "academy" }),
      ]);
      const voucherRows = vouchers.data ?? [];
      const eventRows = events.data ?? [];
      const reviewRows = reviews.data ?? [];
      return json(200, {
        tenant_id: tenantId,
        center: withCenterCapabilities(center),
        capabilities: getCenterCapabilities(center),
        counts: {
          tickets: tickets.count ?? 0,
          seats: seats.count ?? 0,
          payments: payments.count ?? 0,
          results: results.count ?? 0,
          voucher_batches: batches.count ?? 0,
          vouchers: vouchers.count ?? voucherRows.length,
          vouchers_unused: voucherRows.filter((row: any) => row.status === "unused").length,
          vouchers_redeemed: voucherRows.filter((row: any) => row.status === "redeemed").length,
          students: students.count ?? students.data?.length ?? 0,
          active_students: (students.data ?? []).filter((row: any) => row.status === "active").length,
          groups: groups.count ?? groups.data?.length ?? 0,
          active_groups: (groups.data ?? []).filter((row: any) => row.status === "active").length,
          upcoming_events: eventRows.filter((row: any) => ["draft", "scheduled"].includes(row.status) && Date.parse(row.starts_at) >= Date.now()).length,
          pending_reviews: reviewRows.filter((row: any) => ["pending", "in_review"].includes(row.status)).length,
          academies: academies.count ?? 0,
        },
        wallet: { currency: "UZS", available_amount: Number(wallet.data ?? 0) },
        credit: { currency: "UZS", available_amount: 0 },
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
        return json(200, { center: withCenterCapabilities(data), logo_url: signedUrl, storage: branding.logo_storage });
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
          center: withCenterCapabilities(result.center),
          status: "pending",
          note: "Center application created. Schood admin approval is required before dashboard tools unlock.",
        });
      }

      const adminOnlyActions = [
        "update_center_profile",
        "create_academy",
        "create_wallet_topup",
        "create_voucher_batch",
        "void_voucher",
        "export_report",
        "resend_student_invite",
        "invite_staff",
        "update_staff",
        "create_group",
        "update_group",
        "assign_student_group",
        "create_mock_event",
        "update_mock_event",
        "assign_review_item",
        "export_student_report_pdf",
        "export_group_report_pdf",
        "export_event_report_pdf",
        "generate_statement",
        "request_cash_payout",
      ];
      if (adminOnlyActions.includes(actionBody)) {
        if (!requireTenantAdmin(memberships, tenantId)) return json(403, { error: "Tenant admin access is required" });
      }
      if (actionBody === "create_student_invites" && !canInviteCenterStudents(memberships, tenantId)) {
        return json(403, { error: "Center counselor/admin access is required" });
      }
      if (["mark_event_attendance", "update_review_item"].includes(actionBody) && !requireCenterOperator(memberships, tenantId)) {
        return json(403, { error: "Center staff access is required" });
      }
      if ([
        "invite_staff",
        "update_staff",
        "create_academy",
        "create_group",
        "update_group",
        "assign_student_group",
        "create_student_invites",
        "create_mock_event",
        "update_mock_event",
        "mark_event_attendance",
        "assign_review_item",
        "update_review_item",
        "export_student_report_pdf",
        "export_group_report_pdf",
        "export_event_report_pdf",
        "generate_statement",
      ].includes(actionBody)) {
        const gate = await requireActiveCenterOffice(sb, tenantId, { ...(isObject(body) ? body : {}), center_office: true });
        if (gate) return gate;
      }

      if (actionBody === "invite_staff") {
        const profile = await getCenterProfile(sb, tenantId);
        const capabilities = getCenterCapabilities(profile);
        const currentStaff = await loadCenterStaff(sb, tenantId);
        const occupiedStaffSlots = currentStaff.members.filter((row: any) => row.status === "active").length +
          currentStaff.invites.filter((row: any) => row.status === "pending").length;
        if (occupiedStaffSlots >= capabilities.staff_limit) {
          return json(403, {
            error: `${capabilities.tier_label} centers can have up to ${capabilities.staff_limit} active or pending staff accounts.`,
            error_code: "center_tier_limit_reached",
            limit: capabilities.staff_limit,
            tier: capabilities.tier,
          });
        }
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
        if (nextRole) patch.role = normalizeCenterRole(nextRole);
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

      if (actionBody === "create_academy") {
        const gate = await requireActiveCenterOffice(sb, tenantId, { ...(isObject(body) ? body : {}), center_office: true });
        if (gate) return gate;
        const result = await createCenterAcademy(sb, tenantId, body, userId);
        return json(200, { ...result, academies: await loadCenterAcademies(sb, tenantId) });
      }

      if (actionBody === "create_group" || actionBody === "update_group") {
        const profile = await getCenterProfile(sb, tenantId);
        const gate = requireTierCapability(profile, "groups_enabled", "Groups and classes");
        if (gate) return gate;
        if (actionBody === "create_group") {
          const capabilities = getCenterCapabilities(profile);
          const { count, error: countError } = await sb
            .from("partner_center_groups")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("status", "active");
          if (countError) return json(500, { error: "Failed to check group limits", detail: countError.message });
          if (Number(count ?? 0) >= capabilities.max_active_groups) {
            return json(403, {
              error: `${capabilities.tier_label} centers can have up to ${capabilities.max_active_groups} active groups.`,
              error_code: "center_tier_limit_reached",
              limit: capabilities.max_active_groups,
              tier: capabilities.tier,
            });
          }
        }
        const groupId = String(body.group_id ?? "").trim();
        const name = String(body.name ?? "").trim().slice(0, 160);
        if (actionBody === "create_group" && !name) return json(400, { error: "Group name is required" });
        const payload: Json = {};
        if (name) payload.name = name;
        if ("description" in body) payload.description = String(body.description ?? "").trim().slice(0, 2000) || null;
        if ("product_id" in body) payload.product_id = String(body.product_id ?? "").trim() || null;
        if ("assigned_teacher_membership_id" in body) payload.assigned_teacher_membership_id = String(body.assigned_teacher_membership_id ?? "").trim() || null;
        if ("status" in body && ["active", "archived"].includes(String(body.status))) payload.status = String(body.status);
        if ("metadata" in body) payload.metadata = isObject(body.metadata) ? body.metadata : {};

        const query = sb.from("partner_center_groups");
        const { data, error } = actionBody === "create_group"
          ? await query.insert({ tenant_id: tenantId, name, description: payload.description ?? null, product_id: payload.product_id ?? null, assigned_teacher_membership_id: payload.assigned_teacher_membership_id ?? null, metadata: payload.metadata ?? {}, created_by: userId }).select("*").maybeSingle()
          : await query.update(payload).eq("tenant_id", tenantId).eq("id", groupId).select("*").maybeSingle();
        if (error) return json(500, { error: "Failed to save group", detail: error.message });
        return json(200, { group: data, groups: await loadCenterGroups(sb, tenantId) });
      }

      if (actionBody === "assign_student_group") {
        const profile = await getCenterProfile(sb, tenantId);
        const gate = requireTierCapability(profile, "groups_enabled", "Groups and classes");
        if (gate) return gate;
        const studentId = String(body.student_id ?? "").trim();
        const groupId = String(body.group_id ?? "").trim();
        const status = String(body.status ?? "active");
        if (!studentId || !groupId) return json(400, { error: "student_id and group_id are required" });
        const { data, error } = await sb
          .from("partner_center_group_members")
          .upsert({
            tenant_id: tenantId,
            group_id: groupId,
            student_id: studentId,
            status: status === "removed" ? "removed" : "active",
            created_by: userId,
          }, { onConflict: "group_id,student_id" })
          .select("*")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to assign student group", detail: error.message });
        return json(200, { membership: data, groups: await loadCenterGroups(sb, tenantId), students: await loadCenterStudents(sb, tenantId) });
      }

      if (actionBody === "create_student_invites") {
        const profile = await getCenterProfile(sb, tenantId);
        const inviteGate = requireTierCapability(profile, "student_invites_enabled", "Student invitations");
        if (inviteGate) return inviteGate;
        if (String(body.group_id ?? "").trim()) {
          const groupGate = requireTierCapability(profile, "groups_enabled", "Group assignment");
          if (groupGate) return groupGate;
        }
        const rawStudents = Array.isArray(body.students) ? body.students : [];
        const groupId = String(body.group_id ?? "").trim() || null;
        const voucherBatchId = String(body.voucher_batch_id ?? "").trim() || null;
        const origin = String(body.origin ?? "https://schood.online").replace(/\/$/, "");
        if (rawStudents.length === 0) return json(400, { error: "students array is required" });
        const created: any[] = [];
        for (const raw of rawStudents.slice(0, 200)) {
          const item = isObject(raw) ? raw as Json : {};
          const student = await upsertCenterStudent(sb, {
            tenantId,
            fullName: String(item.name ?? item.full_name ?? "").trim() || null,
            email: normalizeEmail(item.email),
            phone: String(item.phone ?? "").trim() || null,
            createdBy: userId,
            metadata: { invite_source: "center_office" },
          });
          if (groupId && student?.id) {
            await sb.from("partner_center_group_members").upsert({ tenant_id: tenantId, group_id: groupId, student_id: student.id, status: "active", created_by: userId }, { onConflict: "group_id,student_id" });
          }
          let voucherId: string | null = null;
          let inviteUrl = origin + "/redeem";
          if (voucherBatchId) {
            const { data: voucher } = await sb
              .from("partner_vouchers")
              .select("id, code")
              .eq("tenant_id", tenantId)
              .eq("batch_id", voucherBatchId)
              .eq("status", "unused")
              .is("assigned_email", null)
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle();
            if (voucher?.id) {
              voucherId = voucher.id;
              inviteUrl = `${origin}/redeem/${encodeURIComponent(voucher.code)}`;
              await sb.from("partner_vouchers").update({
                assigned_name: student?.full_name ?? null,
                assigned_email: student?.email ?? null,
                assigned_phone: student?.phone ?? null,
              }).eq("id", voucher.id);
            }
          }
          const message = `${student?.full_name ? `${student.full_name}, ` : ""}please open ${inviteUrl} to start your Schood access with ${String(body.center_name ?? "your education center")}.`;
          const { data: invite, error } = await sb
            .from("partner_center_student_invites")
            .insert({
              tenant_id: tenantId,
              student_id: student?.id ?? null,
              group_id: groupId,
              voucher_batch_id: voucherBatchId,
              voucher_id: voucherId,
              full_name: student?.full_name ?? null,
              email: student?.email ?? null,
              phone: student?.phone ?? null,
              invite_url: inviteUrl,
              message,
              created_by: userId,
            })
            .select("*")
            .maybeSingle();
          if (error) return json(500, { error: "Failed to create student invite", detail: error.message });
          created.push(invite);
        }
        return json(200, { invites: created, students: await loadCenterStudents(sb, tenantId) });
      }

      if (actionBody === "create_mock_event" || actionBody === "update_mock_event") {
        const profile = await getCenterProfile(sb, tenantId);
        const gate = requireTierCapability(profile, "mock_events_enabled", "Mock events");
        if (gate) return gate;
        if (actionBody === "create_mock_event") {
          const capabilities = getCenterCapabilities(profile);
          const { count, error: countError } = await sb
            .from("partner_center_mock_events")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .in("status", ["draft", "scheduled"])
            .gte("starts_at", new Date().toISOString());
          if (countError) return json(500, { error: "Failed to check event limits", detail: countError.message });
          if (Number(count ?? 0) >= capabilities.max_upcoming_events) {
            return json(403, {
              error: `${capabilities.tier_label} centers can have up to ${capabilities.max_upcoming_events} upcoming mock events.`,
              error_code: "center_tier_limit_reached",
              limit: capabilities.max_upcoming_events,
              tier: capabilities.tier,
            });
          }
        }
        const eventId = String(body.event_id ?? "").trim();
        const title = String(body.title ?? "").trim().slice(0, 180);
        if (actionBody === "create_mock_event" && !title) return json(400, { error: "Event title is required" });
        const startsAt = body.starts_at ? new Date(String(body.starts_at)).toISOString() : null;
        const payload: Json = {};
        if (title) payload.title = title;
        if ("experience_id" in body) payload.experience_id = String(body.experience_id ?? "").trim() || null;
        if ("product_id" in body) payload.product_id = String(body.product_id ?? "").trim() || null;
        if ("group_id" in body) payload.group_id = String(body.group_id ?? "").trim() || null;
        if ("voucher_batch_id" in body) payload.voucher_batch_id = String(body.voucher_batch_id ?? "").trim() || null;
        if (startsAt) payload.starts_at = startsAt;
        if ("ends_at" in body) payload.ends_at = body.ends_at ? new Date(String(body.ends_at)).toISOString() : null;
        if ("mode" in body && ["online", "offline", "hybrid"].includes(String(body.mode))) payload.mode = String(body.mode);
        if ("location" in body) payload.location = String(body.location ?? "").trim().slice(0, 500) || null;
        if ("meeting_url" in body) payload.meeting_url = String(body.meeting_url ?? "").trim().slice(0, 1000) || null;
        if ("capacity" in body) payload.capacity = normalizeQuantity(body.capacity, 10000);
        if ("status" in body && ["draft", "scheduled", "completed", "cancelled"].includes(String(body.status))) payload.status = String(body.status);
        if ("instructions" in body) payload.instructions = String(body.instructions ?? "").trim().slice(0, 3000) || null;
        if ("metadata" in body) payload.metadata = isObject(body.metadata) ? body.metadata : {};
        const query = sb.from("partner_center_mock_events");
        const { data, error } = actionBody === "create_mock_event"
          ? await query.insert({ tenant_id: tenantId, title, starts_at: startsAt ?? new Date(Date.now() + 86400000).toISOString(), mode: payload.mode ?? "online", status: payload.status ?? "scheduled", ...payload, created_by: userId }).select("*").maybeSingle()
          : await query.update(payload).eq("tenant_id", tenantId).eq("id", eventId).select("*").maybeSingle();
        if (error) return json(500, { error: "Failed to save mock event", detail: error.message });
        return json(200, { event: data, events: await loadMockEvents(sb, tenantId) });
      }

      if (actionBody === "mark_event_attendance") {
        const profile = await getCenterProfile(sb, tenantId);
        const gate = requireTierCapability(profile, "mock_events_enabled", "Mock event attendance");
        if (gate) return gate;
        const eventId = String(body.event_id ?? "").trim();
        const studentId = String(body.student_id ?? "").trim();
        const voucherId = String(body.voucher_id ?? "").trim() || null;
        const attendanceStatus = String(body.attendance_status ?? "present");
        if (!eventId || !studentId) return json(400, { error: "event_id and student_id are required" });
        const { data, error } = await sb
          .from("partner_center_event_registrations")
          .upsert({
            tenant_id: tenantId,
            event_id: eventId,
            student_id: studentId,
            voucher_id: voucherId,
            attendance_status: ["present", "absent", "late", "pending"].includes(attendanceStatus) ? attendanceStatus : "present",
            checked_in_by: userId,
            checked_in_at: new Date().toISOString(),
          }, { onConflict: "event_id,student_id" })
          .select("*")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to mark attendance", detail: error.message });
        return json(200, { registration: data, events: await loadMockEvents(sb, tenantId) });
      }

      if (actionBody === "assign_review_item" || actionBody === "update_review_item") {
        const profile = await getCenterProfile(sb, tenantId);
        const gate = requireTierCapability(profile, "review_queue_enabled", "Teacher review queue");
        if (gate) return gate;
        const reviewId = String(body.review_item_id ?? body.id ?? "").trim();
        const payload: Json = {};
        if ("student_id" in body) payload.student_id = String(body.student_id ?? "").trim() || null;
        if ("group_id" in body) payload.group_id = String(body.group_id ?? "").trim() || null;
        if ("event_id" in body) payload.event_id = String(body.event_id ?? "").trim() || null;
        if ("session_id" in body) payload.session_id = String(body.session_id ?? "").trim() || null;
        if ("exam_registration_id" in body) payload.exam_registration_id = String(body.exam_registration_id ?? "").trim() || null;
        if ("skill" in body && ["writing", "speaking", "manual"].includes(String(body.skill))) payload.skill = String(body.skill);
        if ("assigned_staff_membership_id" in body) payload.assigned_staff_membership_id = String(body.assigned_staff_membership_id ?? "").trim() || null;
        if ("status" in body && ["pending", "in_review", "completed", "released", "cancelled"].includes(String(body.status))) payload.status = String(body.status);
        if ("due_at" in body) payload.due_at = body.due_at ? new Date(String(body.due_at)).toISOString() : null;
        if ("score" in body) payload.score = Number(body.score);
        if ("max_score" in body) payload.max_score = Number(body.max_score);
        if ("notes" in body) payload.notes = String(body.notes ?? "").trim().slice(0, 5000) || null;
        if (payload.status === "released") payload.released_at = new Date().toISOString();
        const query = sb.from("partner_center_review_items");
        const { data, error } = actionBody === "assign_review_item" && !reviewId
          ? await query.insert({ tenant_id: tenantId, skill: payload.skill ?? "manual", status: payload.status ?? "pending", ...payload, created_by: userId }).select("*").maybeSingle()
          : await query.update(payload).eq("tenant_id", tenantId).eq("id", reviewId).select("*").maybeSingle();
        if (error) return json(500, { error: "Failed to save review item", detail: error.message });
        return json(200, { review_item: data, review_items: await loadReviewQueue(sb, tenantId) });
      }

      if (["export_student_report_pdf", "export_group_report_pdf", "export_event_report_pdf"].includes(actionBody)) {
        const profile = await getCenterProfile(sb, tenantId);
        const gate = requireTierCapability(profile, "pdf_reports_enabled", "PDF report exports");
        if (gate) return gate;
        const reportType = actionBody === "export_student_report_pdf" ? "student_pdf" : actionBody === "export_group_report_pdf" ? "group_pdf" : "event_pdf";
        const [students, groups, events, reviews, results] = await Promise.all([
          loadCenterStudents(sb, tenantId).catch(() => []),
          loadCenterGroups(sb, tenantId).catch(() => []),
          loadMockEvents(sb, tenantId).catch(() => []),
          loadReviewQueue(sb, tenantId).catch(() => []),
          loadResults(sb, tenantId).catch(() => []),
        ]);
        const title = `${profile?.display_name ?? "Education center"} ${reportType.replace("_", " ")}`;
        const lines = [
          `Generated: ${new Date().toLocaleString("en-US", { timeZone: "Asia/Tashkent" })}`,
          `Students: ${students.length}`,
          `Groups: ${groups.length}`,
          `Mock events: ${events.length}`,
          `Results: ${results.length}`,
          `Pending reviews: ${reviews.filter((row: any) => ["pending", "in_review"].includes(row.status)).length}`,
          "",
          ...results.slice(0, 25).map((row: any) => `${row.candidate_name || row.email || "Candidate"} - ${row.experience_name || "Exam"} - ${row.overall_band ?? row.overall_score ?? "pending"}`),
        ];
        const pdf_base64 = await createSimplePdf(title, lines);
        const { data: audit } = await sb
          .from("partner_center_report_exports")
          .insert({
            tenant_id: tenantId,
            report_type: reportType,
            filters: isObject(body.filters) ? body.filters : {},
            filename: `schood-${reportType}-${new Date().toISOString().slice(0, 10)}.pdf`,
            generated_by: userId,
          })
          .select("*")
          .maybeSingle();
        return json(200, {
          filename: `schood-${reportType}-${new Date().toISOString().slice(0, 10)}.pdf`,
          content_type: "application/pdf",
          pdf_base64,
          report_export: audit ?? null,
        });
      }

      if (actionBody === "generate_statement") {
        const profile = await getCenterProfile(sb, tenantId);
        const gate = requireTierCapability(profile, "statements_enabled", "Monthly statements");
        if (gate) return gate;
        const currency = String(body.currency ?? "UZS").toUpperCase();
        const periodStart = String(body.period_start ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
        const periodEnd = String(body.period_end ?? new Date().toISOString().slice(0, 10));
        const { data: ledgerRows, error: ledgerError } = await sb
          .from("partner_wallet_ledger")
          .select("entry_kind, status, amount, currency, created_at")
          .eq("tenant_id", tenantId)
          .eq("currency", currency)
          .gte("created_at", `${periodStart}T00:00:00.000Z`)
          .lte("created_at", `${periodEnd}T23:59:59.999Z`);
        if (ledgerError) return json(500, { error: "Failed to load statement ledger", detail: ledgerError.message });
        let creditsTotal = 0;
        let debitsTotal = 0;
        for (const row of ledgerRows ?? []) {
          if (["topup", "credit", "commission", "refund", "adjustment"].includes(String((row as any).entry_kind)) && (row as any).status === "posted") {
            creditsTotal += Number((row as any).amount ?? 0);
          } else if ((row as any).entry_kind === "debit" && ["posted", "reserved"].includes(String((row as any).status))) {
            debitsTotal += Number((row as any).amount ?? 0);
          }
        }
        const { data: currentBalance } = await sb.rpc("partner_wallet_available", { p_tenant_id: tenantId, p_currency: currency });
        const closingBalance = Number(currentBalance ?? 0);
        const openingBalance = Math.max(0, closingBalance - creditsTotal + debitsTotal);
        const { data, error } = await sb
          .from("partner_center_statements")
          .upsert({
            tenant_id: tenantId,
            period_start: periodStart,
            period_end: periodEnd,
            currency,
            opening_balance: openingBalance,
            credits_total: creditsTotal,
            debits_total: debitsTotal,
            closing_balance: closingBalance,
            generated_by: userId,
            metadata: { ledger_entries: (ledgerRows ?? []).length },
          }, { onConflict: "tenant_id,period_start,period_end,currency" })
          .select("*")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to generate statement", detail: error.message });
        const pdf_base64 = await createSimplePdf("Schood center statement", [
          `Center tenant: ${tenantId}`,
          `Period: ${periodStart} to ${periodEnd}`,
          `Currency: ${currency}`,
          `Opening balance: ${openingBalance}`,
          `Credits: ${creditsTotal}`,
          `Debits: ${debitsTotal}`,
          `Closing balance: ${closingBalance}`,
        ]);
        return json(200, { statement: data, filename: `schood-center-statement-${periodStart}-${periodEnd}.pdf`, content_type: "application/pdf", pdf_base64 });
      }

      if (actionBody === "update_center_profile") {
        const current = await ensureCenterProfile(sb, tenantId, userId);
        const patch: Json = {};
        if ("display_name" in body) patch.display_name = String(body.display_name ?? current.display_name).trim().slice(0, 120) || current.display_name;
        if ("slug" in body) patch.slug = normalizeSlug(body.slug, current.slug);
        if ("logo_url" in body) patch.logo_url = String(body.logo_url ?? "").trim().slice(0, 1000) || null;
        if ("public_instructions" in body) patch.public_instructions = String(body.public_instructions ?? "").trim().slice(0, 3000) || null;
        if ("powered_by_schood" in body) {
          const capabilities = getCenterCapabilities(current);
          if (Boolean(body.powered_by_schood) === false && !capabilities.advanced_branding_enabled) {
            return json(403, {
              error: "Removing the Powered by Schood footer is available on Premium and Exclusive center tiers.",
              error_code: "center_tier_capability_required",
              required_capability: "advanced_branding_enabled",
              tier: capabilities.tier,
            });
          }
          patch.powered_by_schood = Boolean(body.powered_by_schood);
        }
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
        return json(200, { center: withCenterCapabilities(data) });
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
        const capabilities = getCenterCapabilities(profile);
        const accessKind = String(body.access_kind ?? "").trim();
        if (!["mock_exam", "subscription", "seat"].includes(accessKind)) return json(400, { error: "Unsupported access_kind" });
        const quantity = normalizeQuantity(body.quantity, 1000);
        if (!quantity) return json(400, { error: "quantity must be between 1 and 1000" });
        if (quantity > capabilities.max_voucher_batch_quantity) {
          return json(403, {
            error: `${capabilities.tier_label} centers can generate up to ${capabilities.max_voucher_batch_quantity} vouchers per batch.`,
            error_code: "center_tier_limit_reached",
            limit: capabilities.max_voucher_batch_quantity,
            tier: capabilities.tier,
          });
        }
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
        const profile = await getCenterProfile(sb, tenantId);
        const capabilityGate = requireTierCapability(profile, "payouts_enabled", "Cash payouts");
        if (capabilityGate) return capabilityGate;
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

      if (actionBody === "create_tier_upgrade_payment") {
        const gate = await requireActiveCenterOffice(sb, tenantId, body);
        if (gate) return gate;
        if (!requireTenantAdmin(memberships, tenantId)) return json(403, { error: "Only center owners/admins can manage tier billing" });

        const profile = await getCenterProfile(sb, tenantId);
        if (!profile?.tenant_id) return json(404, { error: "Education center profile is required" });

        const currentTier = normalizeCenterTier(profile.package_tier);
        const requestedTier = normalizeCenterTier(body.requested_tier ?? body.tier);
        if (requestedTier === "starter") return json(400, { error: "Starter is the free base tier and cannot be purchased" });
        if (CENTER_TIER_RANK[requestedTier] < CENTER_TIER_RANK[currentTier]) {
          return json(400, { error: "Tier downgrades are handled by Schood admin support" });
        }

        const billingPeriod = normalizeBillingPeriod(body.billing_period);
        const { data: plan, error: planError } = await sb
          .from("plans")
          .select("id, product_id, name, amount, currency, duration_days, metadata, is_active")
          .eq("product_id", CENTER_TIER_PRODUCT_ID)
          .eq("is_active", true)
          .eq("metadata->>center_tier", requestedTier)
          .eq("metadata->>billing_period", billingPeriod)
          .maybeSingle();
        if (planError) return json(500, { error: "Failed to load tier pricing", detail: planError.message });
        if (!plan?.id) return json(400, { error: "Tier pricing is not configured for this period" });

        const amount = normalizeMoney((plan as any).amount);
        const currency = String((plan as any).currency ?? "UZS").toUpperCase();
        if (!amount) return json(400, { error: "Tier plan amount is not configured" });
        if (currency === "UZS" && amount > TSPAY_MAX_AMOUNT_UZS) {
          return json(400, {
            error: "Current online payment limit is 200,000,000 UZS per transaction. Ask Schood admin to invoice this tier manually.",
            error_code: "online_payment_amount_limit",
            max_amount: TSPAY_MAX_AMOUNT_UZS,
            amount,
            currency,
          });
        }

        const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
        const { data: tierRequest, error: requestError } = await sb
          .from("partner_center_tier_change_requests")
          .insert({
            tenant_id: tenantId,
            previous_tier: currentTier,
            requested_tier: requestedTier,
            billing_period: billingPeriod,
            amount,
            currency,
            status: "pending_payment",
            requested_by: userId,
            expires_at: expiresAt,
            metadata: {
              source: "center_office",
              plan_id: plan.id,
              plan_name: plan.name,
              duration_days: plan.duration_days ?? null,
            },
          })
          .select("*")
          .maybeSingle();
        if (requestError || !tierRequest?.id) return json(500, { error: "Failed to create tier request", detail: requestError?.message });

        const payload = {
          plan_id: plan.id,
          purchase_type: "center_tier_upgrade",
          tenant_id: tenantId,
          description: `${profile.display_name ?? "Education center"} ${CENTER_TIER_CAPABILITIES[requestedTier].tier_label} ${billingPeriod} tier`,
          apply_credit: false,
          credit_amount: 0,
          metadata: {
            center_office: true,
            center_tenant_id: tenantId,
            purchase_type: "center_tier_upgrade",
            tier_change_request_id: tierRequest.id,
            requested_tier: requestedTier,
            previous_tier: currentTier,
            billing_period: billingPeriod,
          },
        };

        const forwarded = await forwardEdge(supabaseUrl, anonKey, token, "tspay/create-transaction", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const text = await forwarded.text();
        let parsed: any = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = null;
        }

        if (!forwarded.ok) {
          await sb
            .from("partner_center_tier_change_requests")
            .update({ status: "failed", metadata: { ...(tierRequest.metadata ?? {}), tspay_error: parsed ?? text } })
            .eq("id", tierRequest.id);
          return new Response(text, { status: forwarded.status, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        const orderId = String(parsed?.order_id ?? "").trim();
        const transactionId = String(parsed?.transaction_id ?? "").trim();
        let paymentId: string | null = null;
        if (orderId || transactionId) {
          const { data: paymentRow } = await sb
            .from("payments")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("purchase_type", "center_tier_upgrade")
            .or(`tspay_order_id.eq.${orderId || "__none__"},provider_transaction_id.eq.${orderId || "__none__"},tspay_cheque_id.eq.${transactionId || "__none__"}`)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          paymentId = paymentRow?.id ?? null;
        }

        const { data: updatedRequest } = await sb
          .from("partner_center_tier_change_requests")
          .update({
            payment_id: paymentId,
            metadata: {
              ...(tierRequest.metadata ?? {}),
              tspay_order_id: parsed?.order_id ?? null,
              tspay_transaction_id: parsed?.transaction_id ?? null,
              payment_url: parsed?.payment_url ?? null,
            },
          })
          .eq("id", tierRequest.id)
          .select("*")
          .maybeSingle();

        return json(200, { ...(parsed ?? {}), tier_request: updatedRequest ?? tierRequest });
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
        const { data: creditAvailable } = Boolean(body.center_office)
          ? { data: 0 }
          : await sb.rpc("platform_credit_available", { p_user_id: userId, p_currency: currency });
        const requestedCredit = Boolean(body.center_office) ? 0 : body.apply_credit ? originalAmount : Math.max(0, Number(body.credit_amount ?? 0));
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
          const requestedCredit = Boolean(body.center_office) ? 0 : body.apply_credit || typeof body.credit_amount !== "undefined"
            ? (typeof body.credit_amount === "undefined" || body.credit_amount === null ? originalAmount : normalizeMoney(body.credit_amount))
            : 0;
          const creditAmount = Math.min(originalAmount, Number(creditAvailable ?? 0), requestedCredit);
          const finalAmount = Math.max(0, originalAmount - creditAmount);
          if (finalAmount > TSPAY_MAX_AMOUNT_UZS) {
            return json(400, {
              error: "Current online checkout limit is 200,000,000 UZS per transaction. For larger education center purchases, use wallet top-up/admin settlement or split the purchase.",
              error_code: "online_payment_amount_limit",
              temporary: false,
              max_amount: TSPAY_MAX_AMOUNT_UZS,
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
          apply_credit: Boolean(body.center_office) ? false : body.apply_credit,
          credit_amount: Boolean(body.center_office) ? 0 : body.credit_amount,
          metadata: {
            ...(isObject(body.metadata) ? body.metadata : {}),
            center_office: Boolean(body.center_office),
            center_tenant_id: tenantId,
            purchaser_user_id: userId,
          },
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
