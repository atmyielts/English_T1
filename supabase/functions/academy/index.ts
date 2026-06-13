import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { placementBand } from "../_shared/academy-scoring.ts";

type Json = Record<string, unknown>;
type SupabaseClientLike = ReturnType<typeof createClient<any>>;

type AcademyAccessSource = "tenant" | "staff" | "center";
type AcademyScope = "academy" | "assigned_classrooms";

type AcademyAccessPermissions = {
  viewAcademy: boolean;
  manageAcademy: boolean;
  manageStaff: boolean;
  manageFinance: boolean;
  manageOffers: boolean;
  manageBranding: boolean;
  manageAutomation: boolean;
  viewContacts: boolean;
  manageContacts: boolean;
  viewClassrooms: boolean;
  manageClassrooms: boolean;
  manageRoster: boolean;
  manageMessages: boolean;
  manageAnnouncements: boolean;
  sendGlobalAnnouncements: boolean;
  manageAlerts: boolean;
  resolveAlerts: boolean;
  viewEducationOS: boolean;
  resolveActionItems: boolean;
  manageAssignments: boolean;
  gradeSubmissions: boolean;
  markAttendance: boolean;
  manageSchedule: boolean;
  manageResources: boolean;
  viewReports: boolean;
  issueCertificates: boolean;
  dispatchNotifications: boolean;
  viewNotifications: boolean;
  viewReferrals: boolean;
};

type MembershipRow = {
  tenant_id: string;
  role: string;
  status: string;
  source?: AcademyAccessSource;
  staff_id?: string | null;
  classroom_ids?: string[];
  center_tenant_id?: string | null;
};

type StudioBody = {
  action?: string;
  academy_id?: string;
  id?: string;
  slug?: string;
  url?: string;
  classroom_id?: string;
  resource_id?: string | null;
  conversation_id?: string;
  role?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  telegram_id?: string;
  status?: string;
  metadata?: Json;
  user_id?: string;
  name?: string;
  title?: string;
  description?: string;
  content?: string;
  type?: string;
  sort_order?: number | string;
  is_published?: boolean;
  completed?: boolean;
  is_active?: boolean;
  price_amount?: number;
  currency?: string;
  duration_days?: number | null;
  contact_id?: string;
  grant_type?: string;
  resource_type?: string;
  capability_key?: string | null;
  quantity?: number | null;
  offer_id?: string;
  provider?: string;
  provider_transaction_id?: string;
  severity?: string;
  landing?: Json;
  // LMS + loops fields
  assignment_id?: string;
  assignment_type?: string;
  submission_id?: string;
  session_id?: string;
  score?: number;
  max_score?: number;
  score_weight?: number;
  notes?: string;
  due_at?: string | null;
  experience_url?: string | null;
  submission_content?: string | null;
  submission_url?: string | null;
  records?: Array<Record<string, unknown>>;
  contacts?: Array<Record<string, unknown>>;
  session_date?: string;
  score_weights?: Json;
  // schedule
  day_of_week?: number | string;
  start_time?: string;
  end_time?: string | null;
  timezone?: string;
  label?: string | null;
  // certificate / parent report
  exam_type?: string;
  overall_score?: number;
  overall_band?: number;
  candidate_name?: string;
  center_name?: string;
  expires_in_days?: number;
  // engagement / operations / acquisition
  payment_id?: string;
  channel?: string;
  message?: string;
  staff_user_id?: string;
  staff_email?: string;
  staff_role?: string;
  classroom_ids?: string[];
  level?: string;
  referral_code?: string;
  diagnostic_score?: number;
  dedupe_key?: string;
  resolution_note?: string;
  lifecycle_stage?: string;
  rule_key?: string;
  threshold?: number;
  [key: string]: unknown;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-jwt",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const getBearerToken = (req: Request): string | null => {
  const auth = req.headers.get("Authorization") ?? "";
  const authToken = auth.startsWith("Bearer ") ? auth.slice(7).trim() : auth.trim();
  const xUserJwt = req.headers.get("x-user-jwt") ?? "";
  if (authToken && !authToken.startsWith("sb_")) return authToken;
  if (xUserJwt.trim()) return xUserJwt.trim();
  if (authToken) return authToken;
  return null;
};

const normalizeText = (value: unknown, maxLen = 300): string => String(value ?? "").trim().slice(0, maxLen);

const normalizeEmail = (value: unknown): string => normalizeText(value, 320).toLowerCase();

const slugify = (value: unknown, fallback = "academy"): string => {
  const raw = String(value ?? "").toLowerCase();
  const slug = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  if (slug) return slug;
  return fallback;
};

const toIntOrNull = (value: unknown): number | null => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.floor(num);
};

const positiveIntOrNull = (value: unknown): number | null => {
  const num = toIntOrNull(value);
  if (num === null || num <= 0) return null;
  return num;
};

const isJsonObject = (value: unknown): value is Json =>
  !!value && typeof value === "object" && !Array.isArray(value);

const toJsonObject = (value: unknown): Json => (isJsonObject(value) ? value : {});

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => normalizeText(item, 64)).filter((item) => item.length > 0)));
};

const weakAreaLabel = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (isJsonObject(value)) {
    return normalizeText(
      value.label ?? value.name ?? value.skill ?? value.area,
      180,
    );
  }
  return "";
};

const relatedClassroom = (row: Record<string, unknown>): Record<string, unknown> | null => {
  const raw = row.academy_classrooms;
  if (Array.isArray(raw)) return (raw[0] ?? null) as Record<string, unknown> | null;
  return isJsonObject(raw) ? raw : null;
};

const normalizeAcademyRole = (roleRaw: unknown): string => {
  const role = normalizeText(roleRaw, 40).toLowerCase();
  if (role === "center-admin" || role === "center admin") return "center_admin";
  if (role === "administrator") return "admin";
  return role || "member";
};

const academyRoleRank = (roleRaw: unknown): number => {
  const role = normalizeAcademyRole(roleRaw);
  if (role === "owner") return 100;
  if (role === "admin") return 90;
  if (role === "center_admin") return 85;
  if (role === "manager") return 70;
  if (role === "counselor") return 60;
  if (role === "teacher") return 50;
  if (role === "assistant") return 40;
  return 20;
};

const isAcademyAdminRole = (roleRaw: unknown): boolean =>
  ["owner", "admin", "center_admin"].includes(normalizeAcademyRole(roleRaw));

const isAcademyManagerRole = (roleRaw: unknown): boolean =>
  ["manager", "counselor"].includes(normalizeAcademyRole(roleRaw));

const isAcademyTeachingRole = (roleRaw: unknown): boolean =>
  ["teacher", "assistant", "member"].includes(normalizeAcademyRole(roleRaw));

const academyAccessScope = (access: MembershipRow): AcademyScope => {
  const role = normalizeAcademyRole(access.role);
  if (isAcademyAdminRole(role) || isAcademyManagerRole(role)) return "academy";
  return "assigned_classrooms";
};

const academyAccessClassroomIds = (access: MembershipRow): string[] | null => {
  if (academyAccessScope(access) === "academy") return null;
  return toStringArray(access.classroom_ids);
};

const buildAcademyPermissions = (access: MembershipRow): AcademyAccessPermissions => {
  const role = normalizeAcademyRole(access.role);
  const admin = isAcademyAdminRole(role);
  const manager = isAcademyManagerRole(role);
  const teacher = isAcademyTeachingRole(role);
  const ops = admin || manager;
  const teaching = ops || teacher;

  return {
    viewAcademy: ops,
    manageAcademy: admin,
    manageStaff: admin,
    manageFinance: admin,
    manageOffers: admin,
    manageBranding: admin,
    manageAutomation: admin,
    viewContacts: ops || teaching,
    manageContacts: ops,
    viewClassrooms: teaching,
    manageClassrooms: ops,
    manageRoster: ops,
    manageMessages: teaching,
    manageAnnouncements: teaching,
    sendGlobalAnnouncements: ops,
    manageAlerts: teaching,
    resolveAlerts: teaching,
    viewEducationOS: teaching,
    resolveActionItems: teaching,
    manageAssignments: teaching,
    gradeSubmissions: teaching,
    markAttendance: teaching,
    manageSchedule: teaching,
    manageResources: teaching,
    viewReports: ops,
    issueCertificates: ops,
    dispatchNotifications: ops,
    viewNotifications: ops,
    viewReferrals: ops,
  };
};

const academyAccessProfile = (access: MembershipRow): Record<string, unknown> => {
  const scope = academyAccessScope(access);
  return {
    role: normalizeAcademyRole(access.role),
    source: access.source ?? "tenant",
    scope,
    classroom_ids: scope === "academy" ? [] : toStringArray(access.classroom_ids),
    center_tenant_id: access.center_tenant_id ?? null,
    permissions: buildAcademyPermissions(access),
  };
};

const academyAccessHas = (access: MembershipRow, permission: keyof AcademyAccessPermissions): boolean =>
  buildAcademyPermissions(access)[permission] === true;

const requireAcademyPermission = (access: MembershipRow, permission: keyof AcademyAccessPermissions): void => {
  if (!academyAccessHas(access, permission)) throw new Error("Forbidden");
};

const resolveAcademyAccess = (memberships: MembershipRow[], academyId: string): MembershipRow | null =>
  memberships.find((m) => m.tenant_id === academyId && String(m.status ?? "active") === "active") ?? null;

const requireAcademyAccess = (memberships: MembershipRow[], academyId: string): MembershipRow => {
  const found = resolveAcademyAccess(memberships, academyId);
  if (!found) throw new Error("Forbidden");
  return found;
};

const accessCanUseClassroom = (access: MembershipRow, classroomIdRaw: unknown): boolean => {
  const classroomId = normalizeText(classroomIdRaw, 64);
  if (!classroomId) return false;
  const scopedIds = academyAccessClassroomIds(access);
  return scopedIds === null || scopedIds.includes(classroomId);
};

const mergeAccessRows = (rows: MembershipRow[]): MembershipRow[] => {
  const byAcademy = new Map<string, MembershipRow>();
  for (const row of rows) {
    const tenantId = normalizeText(row.tenant_id, 64);
    if (!tenantId) continue;
    const normalizedRow: MembershipRow = {
      ...row,
      tenant_id: tenantId,
      role: normalizeAcademyRole(row.role),
      status: String(row.status ?? "active"),
      classroom_ids: toStringArray(row.classroom_ids),
    };
    const existing = byAcademy.get(tenantId);
    if (!existing) {
      byAcademy.set(tenantId, normalizedRow);
      continue;
    }

    const classroomIds = Array.from(new Set([...(existing.classroom_ids ?? []), ...(normalizedRow.classroom_ids ?? [])]));
    const keepNew = academyRoleRank(normalizedRow.role) > academyRoleRank(existing.role);
    byAcademy.set(tenantId, {
      ...(keepNew ? normalizedRow : existing),
      classroom_ids: classroomIds,
      center_tenant_id: normalizedRow.center_tenant_id ?? existing.center_tenant_id ?? null,
    });
  }
  return Array.from(byAcademy.values()).sort((a, b) => academyRoleRank(b.role) - academyRoleRank(a.role));
};

const loadScopedContactIds = async (
  sb: SupabaseClientLike,
  academyId: string,
  classroomIds: string[] | null,
): Promise<Set<string> | null> => {
  if (classroomIds === null) return null;
  if (classroomIds.length === 0) return new Set();
  const { data, error } = await sb
    .from("academy_classroom_memberships")
    .select("contact_id")
    .eq("academy_id", academyId)
    .in("classroom_id", classroomIds)
    .limit(10000);
  if (error) throw new Error(`Failed to load classroom contact scope: ${error.message}`);
  return new Set(
    ((data ?? []) as Array<{ contact_id: string | null }>)
      .map((row) => (row.contact_id ? String(row.contact_id) : ""))
      .filter((id) => id.length > 0),
  );
};

const ensureContactInAccessScope = async (
  sb: SupabaseClientLike,
  academyId: string,
  access: MembershipRow,
  contactIdRaw: unknown,
): Promise<string> => {
  const contactId = normalizeText(contactIdRaw, 64);
  if (!contactId) throw new Error("contact_id is required");
  const scopedIds = academyAccessClassroomIds(access);
  if (scopedIds === null) return contactId;
  const contactIds = await loadScopedContactIds(sb, academyId, scopedIds);
  if (!contactIds?.has(contactId)) throw new Error("Forbidden");
  return contactId;
};

type ClassroomChatViewer = {
  type: "teacher" | "student";
  role: string;
  contact_id: string | null;
  display_name: string;
};

type ClassroomChatContext = {
  academy_id: string;
  classroom_id: string;
  classroom: Record<string, unknown>;
  classroom_memberships: Array<Record<string, unknown>>;
  contacts_by_id: Map<string, Record<string, unknown>>;
  viewer: ClassroomChatViewer;
};

type ClassroomResourceKind = "video" | "book" | "asset" | "link" | "assignment" | "mock" | "practice" | "playbook";

const CLASSROOM_RESOURCE_KINDS: ClassroomResourceKind[] = [
  "video",
  "book",
  "asset",
  "link",
  "assignment",
  "mock",
  "practice",
  "playbook",
];

const contactDisplayName = (contact: Record<string, unknown> | null | undefined): string => {
  if (!contact) return "";
  const firstName = normalizeText(contact.first_name, 120);
  const lastName = normalizeText(contact.last_name, 120);
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName) return fullName;
  const email = normalizeEmail(contact.email);
  if (email) return email;
  return "";
};

const fallbackDisplayName = (email: string | null, fallback: string): string => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return fallback;
  const localPart = normalizedEmail.split("@")[0]?.trim();
  return localPart || fallback;
};

const STUDENT_CONTACT_STATUSES = ["active", "trial", "paused"];
const STUDENT_CONTACT_SELECT =
  "id, academy_id, user_id, first_name, last_name, email, phone, telegram_id, status, metadata, created_at, updated_at";

const loadStudentContacts = async (
  sb: SupabaseClientLike,
  userId: string,
  userEmail: string | null,
): Promise<Array<Record<string, unknown>>> => {
  const { data: directRows, error: directError } = await sb
    .from("academy_contacts")
    .select(STUDENT_CONTACT_SELECT)
    .eq("user_id", userId)
    .in("status", STUDENT_CONTACT_STATUSES);

  if (directError) throw new Error(`Failed to load student contacts: ${directError.message}`);

  const directContacts = (directRows ?? []) as Array<Record<string, unknown>>;
  if (directContacts.length > 0) return directContacts;

  const normalizedEmail = normalizeEmail(userEmail);
  if (!normalizedEmail) return [];

  // Auto-link existing contacts created before the student account existed.
  const { data: emailRows, error: emailError } = await sb
    .from("academy_contacts")
    .select(STUDENT_CONTACT_SELECT)
    .is("user_id", null)
    .ilike("email", normalizedEmail)
    .in("status", STUDENT_CONTACT_STATUSES);
  if (emailError) throw new Error(`Failed to load student contacts by email: ${emailError.message}`);

  const emailContacts = (emailRows ?? []) as Array<Record<string, unknown>>;
  if (emailContacts.length === 0) return [];

  const contactIds = Array.from(new Set(emailContacts.map((row) => String(row.id ?? "")).filter((id) => id.length > 0)));
  if (contactIds.length > 0) {
    const { error: linkError } = await sb
      .from("academy_contacts")
      .update({ user_id: userId })
      .in("id", contactIds);
    if (linkError) throw new Error(`Failed to link student contacts: ${linkError.message}`);
  }

  const { data: linkedRows, error: linkedError } = await sb
    .from("academy_contacts")
    .select(STUDENT_CONTACT_SELECT)
    .eq("user_id", userId)
    .in("status", STUDENT_CONTACT_STATUSES);
  if (linkedError) throw new Error(`Failed to load linked student contacts: ${linkedError.message}`);
  return (linkedRows ?? []) as Array<Record<string, unknown>>;
};

const isAcademyTenantRow = (tenant: Record<string, unknown> | null | undefined): boolean => {
  const tenantType = String(tenant?.type ?? "").toLowerCase();
  const metadata = toJsonObject(tenant?.metadata);
  return (
    tenantType === "team" ||
    String(metadata.service_family ?? "").toLowerCase() === "academy" ||
    metadata.academy_service === true ||
    metadata.center_owned === true
  );
};

const loadMemberships = async (
  sb: SupabaseClientLike,
  userId: string,
  userEmail: string | null = null,
): Promise<MembershipRow[]> => {
  const { data, error } = await sb
    .from("tenant_memberships")
    .select("tenant_id, role, status, tenants ( id, type, metadata )")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw new Error("Failed to load academy memberships");

  const membershipRows = (data ?? []) as unknown as Array<
    MembershipRow & { tenants?: Record<string, unknown> | Record<string, unknown>[] | null }
  >;

  const accessRows: MembershipRow[] = [];

  for (const row of membershipRows) {
    const tenant = Array.isArray((row as any).tenants) ? (row as any).tenants[0] : (row as any).tenants;
    if (!isAcademyTenantRow(tenant)) continue;
    accessRows.push({
      tenant_id: String(row.tenant_id ?? ""),
      role: normalizeAcademyRole(row.role),
      status: String(row.status ?? "active"),
      source: "tenant",
      classroom_ids: [],
    });
  }

  const centerCandidateIds = Array.from(
    new Set(
      membershipRows
        .filter((row) => ["owner", "admin"].includes(normalizeAcademyRole(row.role)))
        .map((row) => String(row.tenant_id ?? ""))
        .filter((id) => id.length > 0),
    ),
  );

  if (centerCandidateIds.length > 0) {
    const { data: centerProfiles, error: centerError } = await sb
      .from("partner_center_profiles")
      .select("tenant_id")
      .in("tenant_id", centerCandidateIds);
    if (centerError) throw new Error(`Failed to load education center profiles: ${centerError.message}`);

    for (const center of (centerProfiles ?? []) as Array<{ tenant_id: string | null }>) {
      const centerTenantId = center.tenant_id ? String(center.tenant_id) : "";
      if (!centerTenantId) continue;
      const { data: childAcademies, error: childError } = await sb
        .from("tenants")
        .select("id")
        .contains("metadata", { parent_center_id: centerTenantId, service_family: "academy" })
        .limit(500);
      if (childError) throw new Error(`Failed to load center academies: ${childError.message}`);
      for (const academy of (childAcademies ?? []) as Array<{ id: string | null }>) {
        const academyId = academy.id ? String(academy.id) : "";
        if (!academyId) continue;
        accessRows.push({
          tenant_id: academyId,
          role: "center_admin",
          status: "active",
          source: "center",
          center_tenant_id: centerTenantId,
          classroom_ids: [],
        });
      }
    }
  }

  const staffRowsById = new Map<string, Record<string, unknown>>();
  const { data: staffByUser, error: staffUserError } = await sb
    .from("academy_staff")
    .select("id, academy_id, user_id, email, role, classroom_ids, is_active")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1000);
  if (staffUserError) throw new Error(`Failed to load academy staff access: ${staffUserError.message}`);
  for (const row of (staffByUser ?? []) as Array<Record<string, unknown>>) {
    staffRowsById.set(String(row.id ?? crypto.randomUUID()), row);
  }

  const normalizedEmail = normalizeEmail(userEmail);
  if (normalizedEmail) {
    const { data: staffByEmail, error: staffEmailError } = await sb
      .from("academy_staff")
      .select("id, academy_id, user_id, email, role, classroom_ids, is_active")
      .eq("email", normalizedEmail)
      .eq("is_active", true)
      .limit(1000);
    if (staffEmailError) throw new Error(`Failed to load academy staff email access: ${staffEmailError.message}`);
    for (const row of (staffByEmail ?? []) as Array<Record<string, unknown>>) {
      staffRowsById.set(String(row.id ?? crypto.randomUUID()), row);
    }
  }

  for (const staff of staffRowsById.values()) {
    const academyId = String(staff.academy_id ?? "");
    if (!academyId) continue;
    accessRows.push({
      tenant_id: academyId,
      role: normalizeAcademyRole(staff.role),
      status: "active",
      source: "staff",
      staff_id: staff.id ? String(staff.id) : null,
      classroom_ids: toStringArray(staff.classroom_ids),
    });
  }

  return mergeAccessRows(accessRows);
};

const resolveAcademyId = (memberships: MembershipRow[], requested: string | null): string => {
  if (!requested) return memberships[0]?.tenant_id ?? "";
  const found = memberships.find((m) => m.tenant_id === requested);
  if (!found) throw new Error("Forbidden");
  return requested;
};

const ensureConversationId = async (
  sb: SupabaseClientLike,
  academyId: string,
  contactId: string,
): Promise<string> => {
  const { data: existing, error: loadError } = await sb
    .from("academy_conversations")
    .select("id")
    .eq("academy_id", academyId)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (loadError) throw new Error("Failed to load conversation");
  if (existing?.id) return String(existing.id);

  const { data: created, error: createError } = await sb
    .from("academy_conversations")
    .insert({
      academy_id: academyId,
      contact_id: contactId,
    })
    .select("id")
    .maybeSingle();
  if (createError || !created?.id) throw new Error("Failed to create conversation");
  return String(created.id);
};

const loadStudentFeed = async (
  sb: SupabaseClientLike,
  userId: string,
  userEmail: string | null,
): Promise<Response> => {
  let contacts: Array<Record<string, unknown>> = [];
  try {
    contacts = await loadStudentContacts(sb, userId, userEmail);
  } catch (err) {
    return json(500, { error: "Failed to load student contacts", detail: err instanceof Error ? err.message : String(err) });
  }

  const feedContacts = contacts.map((row) => ({
    id: String(row.id ?? ""),
    academy_id: String(row.academy_id ?? ""),
    first_name: String(row.first_name ?? ""),
    last_name: String(row.last_name ?? ""),
    email: row.email ? String(row.email) : null,
    status: String(row.status ?? "active"),
  }));

  if (contacts.length === 0) {
    return json(200, { academies: [], contacts: [], messages: [], alerts: [] });
  }

  const contactIds = Array.from(new Set(contacts.map((row) => String(row.id ?? "")).filter((id) => id.length > 0)));
  const academyIds = Array.from(
    new Set(contacts.map((row) => String(row.academy_id ?? "")).filter((id) => id.length > 0)),
  );

  const [academiesRes, messagesRes, alertsScopedRes, alertsGlobalRes] = await Promise.all([
    sb
      .from("tenants")
      .select("id, name, slug, type, metadata")
      .in("id", academyIds),
    sb
      .from("academy_messages")
      .select("id, academy_id, conversation_id, contact_id, sender_type, message_type, content, metadata, created_at")
      .in("contact_id", contactIds)
      .order("created_at", { ascending: false })
      .limit(400),
    sb
      .from("academy_alerts")
      .select("id, academy_id, contact_id, type, severity, message, resolved, resolved_at, metadata, created_at")
      .in("academy_id", academyIds)
      .in("contact_id", contactIds)
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(120),
    sb
      .from("academy_alerts")
      .select("id, academy_id, contact_id, type, severity, message, resolved, resolved_at, metadata, created_at")
      .in("academy_id", academyIds)
      .is("contact_id", null)
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(120),
  ]);

  if (academiesRes.error) {
    return json(500, { error: "Failed to load academies", detail: academiesRes.error.message });
  }
  if (messagesRes.error) {
    return json(500, { error: "Failed to load student messages", detail: messagesRes.error.message });
  }
  if (alertsScopedRes.error) {
    return json(500, { error: "Failed to load scoped alerts", detail: alertsScopedRes.error.message });
  }
  if (alertsGlobalRes.error) {
    return json(500, { error: "Failed to load global alerts", detail: alertsGlobalRes.error.message });
  }

  const alertsMap = new Map<string, Record<string, unknown>>();
  for (const row of [...(alertsScopedRes.data ?? []), ...(alertsGlobalRes.data ?? [])] as Array<Record<string, unknown>>) {
    const id = String(row.id ?? "");
    if (!id || alertsMap.has(id)) continue;
    alertsMap.set(id, row);
  }

  return json(200, {
    academies: academiesRes.data ?? [],
    contacts: feedContacts,
    messages: messagesRes.data ?? [],
    alerts: Array.from(alertsMap.values()),
  });
};

const loadStudentDashboard = async (
  sb: SupabaseClientLike,
  userId: string,
  userEmail: string | null,
): Promise<Response> => {
  let contacts: Array<Record<string, unknown>> = [];
  try {
    contacts = await loadStudentContacts(sb, userId, userEmail);
  } catch (err) {
    return json(500, { error: "Failed to load student contacts", detail: err instanceof Error ? err.message : String(err) });
  }

  if (contacts.length === 0) {
    return json(200, {
      academies: [],
      contacts: [],
      classrooms: [],
      classroom_memberships: [],
      announcements: [],
      messages: [],
      alerts: [],
      entitlements: [],
      payments: [],
      offers: [],
    });
  }

  const contactIds = Array.from(new Set(contacts.map((row) => String(row.id ?? "")).filter((id) => id.length > 0)));
  const academyIds = Array.from(
    new Set(contacts.map((row) => String(row.academy_id ?? "")).filter((id) => id.length > 0)),
  );

  const [
    academiesRes,
    membershipsRes,
    classroomsRes,
    announcementsGlobalRes,
    messagesRes,
    alertsScopedRes,
    alertsGlobalRes,
    entitlementsRes,
    paymentsRes,
    offersRes,
  ] = await Promise.all([
    sb
      .from("tenants")
      .select("id, name, slug, type, metadata")
      .in("id", academyIds),
    sb
      .from("academy_classroom_memberships")
      .select("id, academy_id, classroom_id, contact_id, role, joined_at, metadata")
      .in("academy_id", academyIds)
      .in("contact_id", contactIds)
      .order("joined_at", { ascending: false })
      .limit(2000),
    sb
      .from("academy_classrooms")
      .select("id, academy_id, name, description, is_active, metadata, created_at, updated_at")
      .in("academy_id", academyIds)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1000),
    sb
      .from("academy_announcements")
      .select("id, academy_id, classroom_id, title, body, metadata, created_by, created_at")
      .in("academy_id", academyIds)
      .is("classroom_id", null)
      .order("created_at", { ascending: false })
      .limit(160),
    sb
      .from("academy_messages")
      .select("id, academy_id, conversation_id, contact_id, sender_type, message_type, content, metadata, created_at")
      .in("contact_id", contactIds)
      .order("created_at", { ascending: false })
      .limit(500),
    sb
      .from("academy_alerts")
      .select("id, academy_id, contact_id, type, severity, message, resolved, resolved_at, metadata, created_at")
      .in("academy_id", academyIds)
      .in("contact_id", contactIds)
      .order("created_at", { ascending: false })
      .limit(240),
    sb
      .from("academy_alerts")
      .select("id, academy_id, contact_id, type, severity, message, resolved, resolved_at, metadata, created_at")
      .in("academy_id", academyIds)
      .is("contact_id", null)
      .order("created_at", { ascending: false })
      .limit(240),
    sb
      .from("academy_entitlements")
      .select("id, academy_id, contact_id, user_id, offer_id, payment_id, grant_type, resource_type, resource_id, capability_key, quantity, remaining, starts_at, expires_at, status, source, metadata, created_at, updated_at")
      .in("academy_id", academyIds)
      .in("contact_id", contactIds)
      .order("created_at", { ascending: false })
      .limit(500),
    sb
      .from("academy_payments")
      .select("id, academy_id, contact_id, offer_id, provider, provider_transaction_id, amount, currency, status, metadata, created_by, created_at, updated_at")
      .in("academy_id", academyIds)
      .in("contact_id", contactIds)
      .order("created_at", { ascending: false })
      .limit(500),
    sb
      .from("academy_offers")
      .select("id, academy_id, name, type, price_amount, currency, duration_days, description, is_active, metadata, created_at, updated_at")
      .in("academy_id", academyIds)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (academiesRes.error) return json(500, { error: "Failed to load academies", detail: academiesRes.error.message });
  if (membershipsRes.error) {
    return json(500, { error: "Failed to load classroom memberships", detail: membershipsRes.error.message });
  }
  if (classroomsRes.error) return json(500, { error: "Failed to load classrooms", detail: classroomsRes.error.message });
  if (announcementsGlobalRes.error) {
    return json(500, { error: "Failed to load academy announcements", detail: announcementsGlobalRes.error.message });
  }
  if (messagesRes.error) return json(500, { error: "Failed to load student messages", detail: messagesRes.error.message });
  if (alertsScopedRes.error) {
    return json(500, { error: "Failed to load scoped alerts", detail: alertsScopedRes.error.message });
  }
  if (alertsGlobalRes.error) {
    return json(500, { error: "Failed to load global alerts", detail: alertsGlobalRes.error.message });
  }
  if (entitlementsRes.error) {
    return json(500, { error: "Failed to load student entitlements", detail: entitlementsRes.error.message });
  }
  if (paymentsRes.error) {
    return json(500, { error: "Failed to load student payments", detail: paymentsRes.error.message });
  }
  if (offersRes.error) return json(500, { error: "Failed to load offers", detail: offersRes.error.message });

  const classroomMemberships = (membershipsRes.data ?? []) as Array<Record<string, unknown>>;
  const classroomIds = Array.from(
    new Set(classroomMemberships.map((row) => String(row.classroom_id ?? "")).filter((id) => id.length > 0)),
  );

  const announcementsClassroomRes = classroomIds.length > 0
    ? await sb
      .from("academy_announcements")
      .select("id, academy_id, classroom_id, title, body, metadata, created_by, created_at")
      .in("academy_id", academyIds)
      .in("classroom_id", classroomIds)
      .order("created_at", { ascending: false })
      .limit(240)
    : { data: [], error: null };

  if (announcementsClassroomRes.error) {
    return json(500, {
      error: "Failed to load classroom announcements",
      detail: announcementsClassroomRes.error.message,
    });
  }

  const memberCountByClassroom = new Map<string, number>();
  for (const row of classroomMemberships) {
    const classroomId = String(row.classroom_id ?? "");
    if (!classroomId) continue;
    memberCountByClassroom.set(classroomId, (memberCountByClassroom.get(classroomId) ?? 0) + 1);
  }

  const classroomIdSet = new Set(classroomIds);
  const classrooms = ((classroomsRes.data ?? []) as Array<Record<string, unknown>>)
    .filter((row) => classroomIdSet.has(String(row.id ?? "")))
    .map((row) => {
      const classroomId = String(row.id ?? "");
      return {
        ...row,
        member_count: memberCountByClassroom.get(classroomId) ?? 0,
      };
    });

  const alertsMap = new Map<string, Record<string, unknown>>();
  for (const row of [...(alertsScopedRes.data ?? []), ...(alertsGlobalRes.data ?? [])] as Array<Record<string, unknown>>) {
    const id = String(row.id ?? "");
    if (!id || alertsMap.has(id)) continue;
    alertsMap.set(id, row);
  }

  const announcementMap = new Map<string, Record<string, unknown>>();
  for (const row of [...(announcementsGlobalRes.data ?? []), ...(announcementsClassroomRes.data ?? [])] as Array<Record<string, unknown>>) {
    const id = String(row.id ?? "");
    if (!id || announcementMap.has(id)) continue;
    announcementMap.set(id, row);
  }

  return json(200, {
    academies: academiesRes.data ?? [],
    contacts,
    classrooms,
    classroom_memberships: classroomMemberships,
    announcements: Array.from(announcementMap.values()),
    messages: messagesRes.data ?? [],
    alerts: Array.from(alertsMap.values()),
    entitlements: entitlementsRes.data ?? [],
    payments: paymentsRes.data ?? [],
    offers: offersRes.data ?? [],
  });
};

const resolveClassroomChatContext = async (
  sb: SupabaseClientLike,
  memberships: MembershipRow[],
  userId: string,
  userEmail: string | null,
  academyIdRaw: string | null,
  classroomIdRaw: string | null,
): Promise<ClassroomChatContext | Response> => {
  const academyId = normalizeText(academyIdRaw, 64);
  const classroomId = normalizeText(classroomIdRaw, 64);
  if (!academyId) return json(400, { error: "academy_id is required" });
  if (!classroomId) return json(400, { error: "classroom_id is required" });

  const { data: classroomRow, error: classroomError } = await sb
    .from("academy_classrooms")
    .select("id, academy_id, name, description, is_active, metadata, created_at, updated_at")
    .eq("academy_id", academyId)
    .eq("id", classroomId)
    .maybeSingle();
  if (classroomError) return json(500, { error: "Failed to load classroom", detail: classroomError.message });
  if (!classroomRow?.id) return json(404, { error: "Classroom not found" });

  const academyAccess = resolveAcademyAccess(memberships, academyId);
  const teacherMembership =
    academyAccess && academyAccessHas(academyAccess, "viewClassrooms") && accessCanUseClassroom(academyAccess, classroomId)
      ? academyAccess
      : null;
  let viewerType: ClassroomChatViewer["type"] = "teacher";
  let viewerRole = String(teacherMembership?.role ?? "member");
  let viewerContactId: string | null = null;
  let viewerDisplayName = "";

  if (!teacherMembership) {
    let contacts: Array<Record<string, unknown>> = [];
    try {
      contacts = await loadStudentContacts(sb, userId, userEmail);
    } catch (err) {
      return json(500, { error: "Failed to load student contacts", detail: err instanceof Error ? err.message : String(err) });
    }

    const matchedContact = contacts.find((row) => String(row.academy_id ?? "") === academyId) ?? null;
    if (!matchedContact) return json(403, { error: "Forbidden" });

    const contactId = String(matchedContact.id ?? "");
    if (!contactId) return json(403, { error: "Forbidden" });

    const { data: classroomMembershipRow, error: classroomMembershipError } = await sb
      .from("academy_classroom_memberships")
      .select("id, role")
      .eq("academy_id", academyId)
      .eq("classroom_id", classroomId)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (classroomMembershipError) {
      return json(500, { error: "Failed to verify classroom membership", detail: classroomMembershipError.message });
    }
    if (!classroomMembershipRow?.id) return json(403, { error: "Forbidden" });

    viewerType = "student";
    viewerRole = String(classroomMembershipRow.role ?? "student");
    viewerContactId = contactId;
    viewerDisplayName = contactDisplayName(matchedContact) || fallbackDisplayName(userEmail, "Student");
  } else {
    const { data: selfContactRow } = await sb
      .from("academy_contacts")
      .select("id, first_name, last_name, email")
      .eq("academy_id", academyId)
      .eq("user_id", userId)
      .maybeSingle();
    if (selfContactRow?.id) {
      viewerContactId = String(selfContactRow.id);
      viewerDisplayName = contactDisplayName(selfContactRow as Record<string, unknown>);
    }
    if (!viewerDisplayName) {
      const fallbackRole = ["owner", "admin"].includes(viewerRole) ? "Instructor" : "Teacher";
      viewerDisplayName = fallbackDisplayName(userEmail, fallbackRole);
    }
  }

  const { data: classroomMembershipRows, error: classroomMembersError } = await sb
    .from("academy_classroom_memberships")
    .select("id, academy_id, classroom_id, contact_id, role, joined_at, metadata")
    .eq("academy_id", academyId)
    .eq("classroom_id", classroomId)
    .order("joined_at", { ascending: true })
    .limit(5000);
  if (classroomMembersError) {
    return json(500, { error: "Failed to load classroom memberships", detail: classroomMembersError.message });
  }

  const classroomMemberships = (classroomMembershipRows ?? []) as Array<Record<string, unknown>>;
  const contactIds = Array.from(
    new Set(classroomMemberships.map((row) => String(row.contact_id ?? "")).filter((id) => id.length > 0)),
  );

  const contactsById = new Map<string, Record<string, unknown>>();
  if (contactIds.length > 0) {
    const { data: classroomContacts, error: classroomContactsError } = await sb
      .from("academy_contacts")
      .select("id, user_id, first_name, last_name, email, status")
      .eq("academy_id", academyId)
      .in("id", contactIds);
    if (classroomContactsError) {
      return json(500, { error: "Failed to load classroom contacts", detail: classroomContactsError.message });
    }

    for (const row of (classroomContacts ?? []) as Array<Record<string, unknown>>) {
      contactsById.set(String(row.id ?? ""), row);
    }
  }

  return {
    academy_id: academyId,
    classroom_id: classroomId,
    classroom: classroomRow as Record<string, unknown>,
    classroom_memberships: classroomMemberships,
    contacts_by_id: contactsById,
    viewer: {
      type: viewerType,
      role: viewerRole,
      contact_id: viewerContactId,
      display_name: viewerDisplayName,
    },
  };
};

const loadClassroomChat = async (
  sb: SupabaseClientLike,
  memberships: MembershipRow[],
  userId: string,
  userEmail: string | null,
  academyIdRaw: string | null,
  classroomIdRaw: string | null,
): Promise<Response> => {
  const contextResult = await resolveClassroomChatContext(sb, memberships, userId, userEmail, academyIdRaw, classroomIdRaw);
  if (contextResult instanceof Response) return contextResult;
  const context = contextResult;

  let resourcesQuery = sb
    .from("academy_classroom_resources")
    .select(
      "id, academy_id, classroom_id, title, kind, url, description, metadata, sort_order, is_published, created_by, created_at, updated_at",
    )
    .eq("academy_id", context.academy_id)
    .eq("classroom_id", context.classroom_id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(800);
  if (context.viewer.type === "student") {
    resourcesQuery = resourcesQuery.eq("is_published", true);
  }

  const [{ data: resourceRows, error: resourceError }, { data: messageRows, error: messageError }, {
    data: scopedAnnouncements,
    error: scopedAnnouncementError,
  }, {
    data: globalAnnouncements,
    error: globalAnnouncementError,
  }] = await Promise.all([
    resourcesQuery,
    sb
      .from("academy_messages")
      .select("id, academy_id, conversation_id, contact_id, sender_type, message_type, content, metadata, created_at")
      .eq("academy_id", context.academy_id)
      .eq("metadata->>classroom_id", context.classroom_id)
      .order("created_at", { ascending: true })
      .limit(800),
    sb
      .from("academy_announcements")
      .select("id, academy_id, classroom_id, title, body, metadata, created_by, created_at")
      .eq("academy_id", context.academy_id)
      .eq("classroom_id", context.classroom_id)
      .order("created_at", { ascending: false })
      .limit(80),
    sb
      .from("academy_announcements")
      .select("id, academy_id, classroom_id, title, body, metadata, created_by, created_at")
      .eq("academy_id", context.academy_id)
      .is("classroom_id", null)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (resourceError) return json(500, { error: "Failed to load classroom resources", detail: resourceError.message });
  if (messageError) return json(500, { error: "Failed to load classroom messages", detail: messageError.message });
  if (scopedAnnouncementError) {
    return json(500, { error: "Failed to load classroom announcements", detail: scopedAnnouncementError.message });
  }
  if (globalAnnouncementError) {
    return json(500, { error: "Failed to load academy announcements", detail: globalAnnouncementError.message });
  }

  const members = context.classroom_memberships.map((row) => {
    const contactId = String(row.contact_id ?? "");
    const contact = context.contacts_by_id.get(contactId) ?? null;
    return {
      id: String(row.id ?? ""),
      academy_id: String(row.academy_id ?? context.academy_id),
      classroom_id: String(row.classroom_id ?? context.classroom_id),
      contact_id: contactId,
      role: String(row.role ?? "student"),
      joined_at: String(row.joined_at ?? ""),
      metadata: toJsonObject(row.metadata),
      contact: contact
        ? {
            id: String(contact.id ?? ""),
            first_name: String(contact.first_name ?? ""),
            last_name: String(contact.last_name ?? ""),
            email: contact.email ? String(contact.email) : null,
            status: String(contact.status ?? "active"),
            display_name: contactDisplayName(contact),
          }
        : null,
    };
  });

  const messages = ((messageRows ?? []) as Array<Record<string, unknown>>).map((row) => {
    const metadata = toJsonObject(row.metadata);
    const senderContactId = normalizeText(metadata.sender_contact_id, 64);
    const senderContact = senderContactId ? context.contacts_by_id.get(senderContactId) ?? null : null;
    const senderLabel = normalizeText(metadata.sender_label, 160) ||
      contactDisplayName(senderContact) ||
      (String(row.sender_type ?? "system") === "teacher"
        ? "Teacher"
        : String(row.sender_type ?? "system") === "student"
          ? "Student"
          : "System");
    const senderRole = normalizeText(metadata.sender_role, 60) || String(row.sender_type ?? "system");

    return {
      id: String(row.id ?? ""),
      academy_id: String(row.academy_id ?? context.academy_id),
      conversation_id: String(row.conversation_id ?? ""),
      contact_id: row.contact_id ? String(row.contact_id) : null,
      sender_type: String(row.sender_type ?? "system"),
      message_type: String(row.message_type ?? "message"),
      content: String(row.content ?? ""),
      metadata,
      created_at: String(row.created_at ?? ""),
      sender_label: senderLabel,
      sender_role: senderRole,
      sender_contact_id: senderContactId || null,
    };
  });

  const announcementMap = new Map<string, Record<string, unknown>>();
  for (const row of [...(scopedAnnouncements ?? []), ...(globalAnnouncements ?? [])] as Array<Record<string, unknown>>) {
    const id = String(row.id ?? "");
    if (!id || announcementMap.has(id)) continue;
    announcementMap.set(id, row);
  }

  const announcements = Array.from(announcementMap.values())
    .sort((a, b) => Date.parse(String(b.created_at ?? "")) - Date.parse(String(a.created_at ?? "")))
    .map((row) => ({
      id: String(row.id ?? ""),
      academy_id: String(row.academy_id ?? context.academy_id),
      classroom_id: row.classroom_id ? String(row.classroom_id) : null,
      title: String(row.title ?? ""),
      body: String(row.body ?? ""),
      metadata: toJsonObject(row.metadata),
      created_by: row.created_by ? String(row.created_by) : null,
      created_at: String(row.created_at ?? ""),
    }));

  const resources = ((resourceRows ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id ?? ""),
    academy_id: String(row.academy_id ?? context.academy_id),
    classroom_id: String(row.classroom_id ?? context.classroom_id),
    title: String(row.title ?? ""),
    kind: String(row.kind ?? "asset"),
    url: String(row.url ?? ""),
    description: row.description ? String(row.description) : null,
    metadata: toJsonObject(row.metadata),
    sort_order: Number(row.sort_order ?? 0),
    is_published: Boolean(row.is_published ?? true),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  }));

  const resourceIds = resources.map((row) => String(row.id)).filter((id) => id.length > 0);
  const memberContactIds = new Set(
    context.classroom_memberships.map((row) => String(row.contact_id ?? "")).filter((id) => id.length > 0),
  );
  let progressRows: Array<Record<string, unknown>> = [];
  if (resourceIds.length > 0) {
    const { data: loadedProgressRows, error: progressError } = await sb
      .from("academy_classroom_resource_progress")
      .select("id, academy_id, classroom_id, resource_id, contact_id, user_id, completed, completed_at, updated_at")
      .eq("academy_id", context.academy_id)
      .eq("classroom_id", context.classroom_id)
      .in("resource_id", resourceIds)
      .limit(10000);
    if (progressError) {
      return json(500, { error: "Failed to load classroom progress", detail: progressError.message });
    }
    progressRows = (loadedProgressRows ?? []) as Array<Record<string, unknown>>;
  }

  const viewerCompleted = new Set<string>();
  const resourceCompletedCounts: Record<string, number> = {};
  for (const row of progressRows) {
    const resourceId = String(row.resource_id ?? "");
    if (!resourceId) continue;
    const completed = Boolean(row.completed ?? false);
    if (!completed) continue;
    const contactId = String(row.contact_id ?? "");
    if (!contactId || !memberContactIds.has(contactId)) continue;

    resourceCompletedCounts[resourceId] = Number(resourceCompletedCounts[resourceId] ?? 0) + 1;

    const viewerMatchesContact = context.viewer.contact_id && contactId === context.viewer.contact_id;
    const viewerMatchesUser = !context.viewer.contact_id && String(row.user_id ?? "") === userId;
    if (viewerMatchesContact || viewerMatchesUser) viewerCompleted.add(resourceId);
  }

  return json(200, {
    academy_id: context.academy_id,
    classroom: context.classroom,
    viewer: context.viewer,
    members,
    resources,
    progress: {
      viewer_completed_resource_ids: Array.from(viewerCompleted.values()),
      resource_completed_counts: resourceCompletedCounts,
      total_members: memberContactIds.size,
    },
    messages,
    announcements,
  });
};

const sendClassroomChatMessage = async (
  sb: SupabaseClientLike,
  memberships: MembershipRow[],
  userId: string,
  userEmail: string | null,
  academyIdRaw: string | null,
  classroomIdRaw: string | null,
  contentRaw: string | null,
): Promise<Response> => {
  const contextResult = await resolveClassroomChatContext(sb, memberships, userId, userEmail, academyIdRaw, classroomIdRaw);
  if (contextResult instanceof Response) return contextResult;
  const context = contextResult;

  const content = normalizeText(contentRaw, 6000);
  if (!content) return json(400, { error: "content is required" });

  const recipientContactIds = Array.from(
    new Set(
      context.classroom_memberships
        .map((row) => String(row.contact_id ?? ""))
        .filter((contactId) => {
          if (!contactId) return false;
          const contact = context.contacts_by_id.get(contactId);
          return String(contact?.status ?? "active").toLowerCase() !== "inactive";
        }),
    ),
  );

  if (recipientContactIds.length === 0) {
    return json(400, { error: "Classroom has no active recipients" });
  }

  const upsertRows = recipientContactIds.map((contactId) => ({
    academy_id: context.academy_id,
    contact_id: contactId,
  }));

  const { error: conversationUpsertError } = await sb
    .from("academy_conversations")
    .upsert(upsertRows, { onConflict: "academy_id,contact_id" });
  if (conversationUpsertError) {
    return json(500, { error: "Failed to prepare classroom conversations", detail: conversationUpsertError.message });
  }

  const { data: conversationRows, error: conversationLoadError } = await sb
    .from("academy_conversations")
    .select("id, contact_id")
    .eq("academy_id", context.academy_id)
    .in("contact_id", recipientContactIds);
  if (conversationLoadError) {
    return json(500, { error: "Failed to load classroom conversations", detail: conversationLoadError.message });
  }

  const conversationByContact = new Map<string, string>();
  for (const row of (conversationRows ?? []) as Array<Record<string, unknown>>) {
    conversationByContact.set(String(row.contact_id ?? ""), String(row.id ?? ""));
  }

  const senderType = context.viewer.type === "student" ? "student" : "teacher";
  const messageMetadata = {
    classroom_id: context.classroom_id,
    classroom_chat: true,
    sender_user_id: userId,
    sender_contact_id: context.viewer.contact_id,
    sender_role: context.viewer.role,
    sender_label: context.viewer.display_name,
  };

  const messageRows = recipientContactIds
    .map((contactId) => {
      const conversationId = conversationByContact.get(contactId);
      if (!conversationId) return null;
      return {
        academy_id: context.academy_id,
        conversation_id: conversationId,
        contact_id: contactId,
        sender_type: senderType,
        message_type: "message",
        content,
        metadata: messageMetadata,
      };
    })
    .filter((row): row is NonNullable<typeof row> => !!row);

  if (messageRows.length === 0) {
    return json(500, { error: "No classroom conversation available for delivery" });
  }

  const { error: insertError } = await sb.from("academy_messages").insert(messageRows);
  if (insertError) return json(500, { error: "Failed to send classroom message", detail: insertError.message });

  await sb
    .from("academy_conversations")
    .update({ updated_at: new Date().toISOString() })
    .in("id", messageRows.map((row) => String(row.conversation_id)));

  return json(200, {
    academy_id: context.academy_id,
    classroom_id: context.classroom_id,
    sender: context.viewer,
    delivered: messageRows.length,
  });
};

const upsertClassroomResource = async (
  sb: SupabaseClientLike,
  memberships: MembershipRow[],
  userId: string,
  userEmail: string | null,
  academyIdRaw: string | null,
  classroomIdRaw: string | null,
  resourceIdRaw: string | null,
  titleRaw: string | null,
  kindRaw: string | null,
  urlRaw: string | null,
  descriptionRaw: string | null,
  sortOrderRaw: unknown,
  isPublishedRaw: unknown,
  metadataRaw: unknown,
): Promise<Response> => {
  const contextResult = await resolveClassroomChatContext(sb, memberships, userId, userEmail, academyIdRaw, classroomIdRaw);
  if (contextResult instanceof Response) return contextResult;
  const context = contextResult;
  if (context.viewer.type === "student") return json(403, { error: "Forbidden" });

  const resourceId = normalizeText(resourceIdRaw, 64);
  const title = normalizeText(titleRaw, 220);
  const kind = normalizeText(kindRaw, 20).toLowerCase() as ClassroomResourceKind;
  const resourceUrl = normalizeText(urlRaw, 2000);
  const description = normalizeText(descriptionRaw, 4000) || null;
  const sortOrder = toIntOrNull(sortOrderRaw) ?? 0;
  const isPublished = typeof isPublishedRaw === "boolean" ? isPublishedRaw : true;
  const metadata = toJsonObject(metadataRaw);

  if (!title) return json(400, { error: "title is required" });
  if (!resourceUrl) return json(400, { error: "url is required" });
  if (!CLASSROOM_RESOURCE_KINDS.includes(kind)) {
    return json(400, { error: `kind must be one of ${CLASSROOM_RESOURCE_KINDS.join(", ")}` });
  }

  const payload = {
    academy_id: context.academy_id,
    classroom_id: context.classroom_id,
    title,
    kind,
    url: resourceUrl,
    description,
    sort_order: sortOrder,
    is_published: isPublished,
    metadata,
    created_by: userId,
  };

  if (resourceId) {
    const { data, error } = await sb
      .from("academy_classroom_resources")
      .update(payload)
      .eq("academy_id", context.academy_id)
      .eq("classroom_id", context.classroom_id)
      .eq("id", resourceId)
      .select(
        "id, academy_id, classroom_id, title, kind, url, description, metadata, sort_order, is_published, created_by, created_at, updated_at",
      )
      .maybeSingle();
    if (error) return json(500, { error: "Failed to update classroom resource", detail: error.message });
    if (!data?.id) return json(404, { error: "Resource not found" });
    return json(200, { resource: data });
  }

  const { data, error } = await sb
    .from("academy_classroom_resources")
    .insert(payload)
    .select(
      "id, academy_id, classroom_id, title, kind, url, description, metadata, sort_order, is_published, created_by, created_at, updated_at",
    )
    .maybeSingle();
  if (error) return json(500, { error: "Failed to create classroom resource", detail: error.message });
  return json(200, { resource: data });
};

const deleteClassroomResource = async (
  sb: SupabaseClientLike,
  memberships: MembershipRow[],
  userId: string,
  userEmail: string | null,
  academyIdRaw: string | null,
  classroomIdRaw: string | null,
  resourceIdRaw: string | null,
): Promise<Response> => {
  const contextResult = await resolveClassroomChatContext(sb, memberships, userId, userEmail, academyIdRaw, classroomIdRaw);
  if (contextResult instanceof Response) return contextResult;
  const context = contextResult;
  if (context.viewer.type === "student") return json(403, { error: "Forbidden" });

  const resourceId = normalizeText(resourceIdRaw, 64);
  if (!resourceId) return json(400, { error: "id is required" });

  const { data, error } = await sb
    .from("academy_classroom_resources")
    .delete()
    .eq("academy_id", context.academy_id)
    .eq("classroom_id", context.classroom_id)
    .eq("id", resourceId)
    .select("id")
    .maybeSingle();
  if (error) return json(500, { error: "Failed to delete classroom resource", detail: error.message });
  if (!data?.id) return json(404, { error: "Resource not found" });
  return json(200, { removed: true, id: String(data.id) });
};

const setClassroomResourceProgress = async (
  sb: SupabaseClientLike,
  memberships: MembershipRow[],
  userId: string,
  userEmail: string | null,
  academyIdRaw: string | null,
  classroomIdRaw: string | null,
  resourceIdRaw: string | null,
  completedRaw: unknown,
  contactIdRaw: string | null,
): Promise<Response> => {
  const contextResult = await resolveClassroomChatContext(sb, memberships, userId, userEmail, academyIdRaw, classroomIdRaw);
  if (contextResult instanceof Response) return contextResult;
  const context = contextResult;

  const resourceId = normalizeText(resourceIdRaw, 64);
  if (!resourceId) return json(400, { error: "resource_id is required" });

  const { data: resourceRow, error: resourceError } = await sb
    .from("academy_classroom_resources")
    .select("id, is_published")
    .eq("academy_id", context.academy_id)
    .eq("classroom_id", context.classroom_id)
    .eq("id", resourceId)
    .maybeSingle();
  if (resourceError) return json(500, { error: "Failed to load classroom resource", detail: resourceError.message });
  if (!resourceRow?.id) return json(404, { error: "Resource not found" });
  if (context.viewer.type === "student" && resourceRow.is_published === false) {
    return json(403, { error: "Forbidden" });
  }

  let targetContactId = context.viewer.contact_id;
  if (context.viewer.type === "teacher") {
    const requestedContactId = normalizeText(contactIdRaw, 64);
    if (requestedContactId) targetContactId = requestedContactId;
  }
  if (!targetContactId) {
    return json(400, { error: "No classroom contact linked to this account" });
  }

  const contactIsInClassroom = context.classroom_memberships.some(
    (row) => String(row.contact_id ?? "") === targetContactId,
  );
  if (!contactIsInClassroom) return json(403, { error: "Forbidden" });

  const targetContact = context.contacts_by_id.get(targetContactId) ?? null;
  const completed = typeof completedRaw === "boolean" ? completedRaw : true;
  const nowIso = new Date().toISOString();

  const payload = {
    academy_id: context.academy_id,
    classroom_id: context.classroom_id,
    resource_id: resourceId,
    contact_id: targetContactId,
    user_id: targetContact?.user_id ? String(targetContact.user_id) : null,
    completed,
    completed_at: completed ? nowIso : null,
    metadata: {},
  };

  const { data, error } = await sb
    .from("academy_classroom_resource_progress")
    .upsert(payload, { onConflict: "classroom_id,resource_id,contact_id" })
    .select("id, academy_id, classroom_id, resource_id, contact_id, user_id, completed, completed_at, updated_at")
    .maybeSingle();
  if (error) return json(500, { error: "Failed to save classroom progress", detail: error.message });
  if (!data?.id) return json(500, { error: "Failed to save classroom progress" });
  return json(200, { progress: data });
};

const handleReadAction = async (
  sb: SupabaseClientLike,
  memberships: MembershipRow[],
  action: string,
  academyIdRaw: string | null,
  offerIdRaw: string | null,
  classroomIdRaw: string | null,
  contactIdRaw: string | null,
  conversationIdRaw: string | null,
  assignmentIdRaw: string | null = null,
): Promise<Response | null> => {
  if (
    ![
      "academies",
      "summary",
      "contacts",
      "classrooms",
      "classroom-memberships",
      "conversations",
      "conversation-messages",
      "announcements",
      "alerts",
      "offers",
      "offer-grants",
      "payments",
      "entitlements",
      "assignments",
      "submissions",
      "gradebook",
      "student_progress",
      "attendance",
      "bulk_invites",
      "schedule",
      "classroom_billing",
      "branding",
      "notifications",
      "owner_dashboard",
      "education_os",
      "automation_rules",
      "staff",
      "referral_leaderboard",
    ].includes(action)
  ) {
    return null;
  }

  if (action === "academies") {
    const academyIds = Array.from(new Set(memberships.map((item) => String(item.tenant_id || "")).filter((id) => id.length > 0)));
    if (academyIds.length === 0) return json(200, { academies: [] });

    const { data: academyRows, error: academyError } = await sb
      .from("tenants")
      .select("id, name, slug, type, metadata, created_at")
      .in("id", academyIds)
      .order("created_at", { ascending: true });
    if (academyError) return json(500, { error: "Failed to load academies", detail: academyError.message });

    const academyById = new Map<string, Record<string, unknown>>();
    for (const row of (academyRows ?? []) as Array<Record<string, unknown>>) {
      academyById.set(String(row.id ?? ""), row);
    }

    return json(200, {
      academies: memberships
        .map((membership) => {
          const academy = academyById.get(String(membership.tenant_id ?? ""));
          if (!academy) return null;
          return {
            id: String(academy.id ?? ""),
            name: String(academy.name ?? ""),
            slug: String(academy.slug ?? ""),
            type: String(academy.type ?? "team"),
            metadata: toJsonObject(academy.metadata),
            created_at: String(academy.created_at ?? ""),
            role: String(membership.role ?? "member"),
            status: String(membership.status ?? "active"),
            access: academyAccessProfile(membership),
          };
        })
        .filter((item): item is NonNullable<typeof item> => !!item),
    });
  }

  const academyId = resolveAcademyId(memberships, academyIdRaw);
  const access = requireAcademyAccess(memberships, academyId);
  const scopedClassroomIds = academyAccessClassroomIds(access);

  if (action === "summary") {
    if (scopedClassroomIds !== null) {
      const scopedContactIds = await loadScopedContactIds(sb, academyId, scopedClassroomIds);
      const contactIds = Array.from(scopedContactIds ?? []);
      const alertsQuery = sb
        .from("academy_alerts")
        .select("id", { count: "exact", head: true })
        .eq("academy_id", academyId)
        .eq("resolved", false);
      const alertsResult = contactIds.length > 0 ? await alertsQuery.in("contact_id", contactIds) : { count: 0 };
      return json(200, {
        academy_id: academyId,
        access: academyAccessProfile(access),
        counts: {
          contacts: contactIds.length,
          classrooms: scopedClassroomIds.length,
          offers: 0,
          active_entitlements: 0,
          open_alerts: alertsResult.count ?? 0,
        },
      });
    }

    const [{ count: contacts }, { count: classrooms }, { count: offers }, { count: entitlements }, { count: alertsOpen }] =
      await Promise.all([
        sb.from("academy_contacts").select("id", { count: "exact", head: true }).eq("academy_id", academyId),
        sb.from("academy_classrooms").select("id", { count: "exact", head: true }).eq("academy_id", academyId),
        sb.from("academy_offers").select("id", { count: "exact", head: true }).eq("academy_id", academyId),
        sb.from("academy_entitlements").select("id", { count: "exact", head: true }).eq("academy_id", academyId).eq("status", "active"),
        sb.from("academy_alerts").select("id", { count: "exact", head: true }).eq("academy_id", academyId).eq("resolved", false),
      ]);

    return json(200, {
      academy_id: academyId,
      access: academyAccessProfile(access),
      counts: {
        contacts: contacts ?? 0,
        classrooms: classrooms ?? 0,
        offers: academyAccessHas(access, "manageOffers") ? offers ?? 0 : 0,
        active_entitlements: academyAccessHas(access, "manageFinance") ? entitlements ?? 0 : 0,
        open_alerts: alertsOpen ?? 0,
      },
    });
  }

  if (action === "contacts") {
    requireAcademyPermission(access, "viewContacts");
    const scopedContactIds = await loadScopedContactIds(sb, academyId, scopedClassroomIds);
    if (scopedContactIds !== null && scopedContactIds.size === 0) return json(200, { contacts: [] });

    let query = sb
      .from("academy_contacts")
      .select("id, academy_id, user_id, first_name, last_name, email, phone, telegram_id, status, last_activity_at, placement_level, placement_score, lifecycle_stage, notify_enabled, metadata, created_at, updated_at")
      .eq("academy_id", academyId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (scopedContactIds !== null) query = query.in("id", Array.from(scopedContactIds));
    const { data, error } = await query;
    if (error) return json(500, { error: "Failed to load contacts", detail: error.message });
    return json(200, { contacts: data ?? [] });
  }

  if (action === "classrooms") {
    requireAcademyPermission(access, "viewClassrooms");
    if (scopedClassroomIds !== null && scopedClassroomIds.length === 0) return json(200, { classrooms: [] });

    let classroomQuery = sb
      .from("academy_classrooms")
      .select("id, academy_id, name, description, is_active, metadata, created_at, updated_at")
      .eq("academy_id", academyId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (scopedClassroomIds !== null) classroomQuery = classroomQuery.in("id", scopedClassroomIds);
    const { data, error } = await classroomQuery;
    if (error) return json(500, { error: "Failed to load classrooms", detail: error.message });

    let membershipQuery = sb
      .from("academy_classroom_memberships")
      .select("classroom_id")
      .eq("academy_id", academyId)
      .limit(5000);
    if (scopedClassroomIds !== null) membershipQuery = membershipQuery.in("classroom_id", scopedClassroomIds);
    const { data: membershipRows, error: membershipError } = await membershipQuery;
    if (membershipError) {
      return json(500, { error: "Failed to load classroom memberships", detail: membershipError.message });
    }

    const memberCountByClassroom = new Map<string, number>();
    for (const row of (membershipRows ?? []) as Array<{ classroom_id: string | null }>) {
      const classroomId = row.classroom_id ? String(row.classroom_id) : "";
      if (!classroomId) continue;
      memberCountByClassroom.set(classroomId, (memberCountByClassroom.get(classroomId) ?? 0) + 1);
    }

    const classrooms = ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const classroomId = String(row.id ?? "");
      return {
        ...row,
        member_count: memberCountByClassroom.get(classroomId) ?? 0,
      };
    });

    return json(200, { classrooms });
  }

  if (action === "classroom-memberships") {
    requireAcademyPermission(access, "viewClassrooms");
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    if (classroomId && !accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
    if (!classroomId && scopedClassroomIds !== null && scopedClassroomIds.length === 0) {
      return json(200, { classroom_memberships: [] });
    }

    let query = sb
      .from("academy_classroom_memberships")
      .select("id, academy_id, classroom_id, contact_id, role, joined_at, metadata")
      .eq("academy_id", academyId)
      .order("joined_at", { ascending: false })
      .limit(1000);

    if (classroomId) query = query.eq("classroom_id", classroomId);
    else if (scopedClassroomIds !== null) query = query.in("classroom_id", scopedClassroomIds);
    const { data, error } = await query;
    if (error) return json(500, { error: "Failed to load classroom memberships", detail: error.message });
    return json(200, { classroom_memberships: data ?? [] });
  }

  if (action === "conversations") {
    requireAcademyPermission(access, "manageMessages");
    const scopedContactIds = await loadScopedContactIds(sb, academyId, scopedClassroomIds);
    if (scopedContactIds !== null && scopedContactIds.size === 0) return json(200, { conversations: [] });

    let conversationQuery = sb
      .from("academy_conversations")
      .select("id, academy_id, contact_id, created_at, updated_at")
      .eq("academy_id", academyId)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (scopedContactIds !== null) conversationQuery = conversationQuery.in("contact_id", Array.from(scopedContactIds));
    const { data: conversations, error: conversationError } = await conversationQuery;
    if (conversationError) return json(500, { error: "Failed to load conversations", detail: conversationError.message });

    const rows = (conversations ?? []) as Array<{ id: string; contact_id: string; created_at: string; updated_at: string }>;
    if (rows.length === 0) return json(200, { conversations: [] });

    const contactIds = Array.from(new Set(rows.map((row) => String(row.contact_id))));
    const conversationIds = Array.from(new Set(rows.map((row) => String(row.id))));

    const { data: contactsData, error: contactError } = await sb
      .from("academy_contacts")
      .select("id, first_name, last_name, email, status")
      .eq("academy_id", academyId)
      .in("id", contactIds);
    if (contactError) return json(500, { error: "Failed to load conversation contacts", detail: contactError.message });

    const { data: messagesData, error: messageError } = await sb
      .from("academy_messages")
      .select("id, conversation_id, sender_type, message_type, content, created_at")
      .eq("academy_id", academyId)
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (messageError) return json(500, { error: "Failed to load conversation messages", detail: messageError.message });

    const contactById = new Map(
      ((contactsData ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id ?? ""), row]),
    );
    const lastMessageByConversation = new Map<string, Record<string, unknown>>();
    for (const row of (messagesData ?? []) as Array<Record<string, unknown>>) {
      const conversationId = String(row.conversation_id ?? "");
      if (!conversationId || lastMessageByConversation.has(conversationId)) continue;
      lastMessageByConversation.set(conversationId, row);
    }

    const result = rows.map((row) => ({
      ...row,
      contact: contactById.get(String(row.contact_id)) ?? null,
      last_message: lastMessageByConversation.get(String(row.id)) ?? null,
    }));

    return json(200, { conversations: result });
  }

  if (action === "conversation-messages") {
    requireAcademyPermission(access, "manageMessages");
    const conversationIdParam = normalizeText(conversationIdRaw, 64) || null;
    const contactIdParam = normalizeText(contactIdRaw, 64) || null;

    let conversationId = conversationIdParam;
    if (!conversationId && contactIdParam) {
      const { data: conversationRow, error: conversationError } = await sb
        .from("academy_conversations")
        .select("id")
        .eq("academy_id", academyId)
        .eq("contact_id", contactIdParam)
        .maybeSingle();
      if (conversationError) {
        return json(500, { error: "Failed to resolve conversation", detail: conversationError.message });
      }
      conversationId = conversationRow?.id ? String(conversationRow.id) : null;
    }

    if (!conversationId) return json(200, { conversation_id: null, messages: [] });

    const { data: conversationRow, error: validateError } = await sb
      .from("academy_conversations")
      .select("id, contact_id")
      .eq("academy_id", academyId)
      .eq("id", conversationId)
      .maybeSingle();
    if (validateError) return json(500, { error: "Failed to load conversation", detail: validateError.message });
    if (!conversationRow?.id) return json(404, { error: "Conversation not found" });
    await ensureContactInAccessScope(sb, academyId, access, conversationRow.contact_id);

    const { data, error } = await sb
      .from("academy_messages")
      .select("id, academy_id, conversation_id, contact_id, sender_type, message_type, content, metadata, created_at")
      .eq("academy_id", academyId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) return json(500, { error: "Failed to load messages", detail: error.message });
    return json(200, { conversation_id: conversationId, messages: data ?? [] });
  }

  if (action === "announcements") {
    requireAcademyPermission(access, "manageAnnouncements");
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    if (classroomId && !accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
    if (!classroomId && scopedClassroomIds !== null) {
      const [globalRes, classroomRes] = await Promise.all([
        sb
          .from("academy_announcements")
          .select("id, academy_id, classroom_id, title, body, metadata, created_by, created_at")
          .eq("academy_id", academyId)
          .is("classroom_id", null)
          .order("created_at", { ascending: false })
          .limit(100),
        scopedClassroomIds.length > 0
          ? sb
            .from("academy_announcements")
            .select("id, academy_id, classroom_id, title, body, metadata, created_by, created_at")
            .eq("academy_id", academyId)
            .in("classroom_id", scopedClassroomIds)
            .order("created_at", { ascending: false })
            .limit(300)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (globalRes.error) return json(500, { error: "Failed to load announcements", detail: globalRes.error.message });
      if (classroomRes.error) return json(500, { error: "Failed to load announcements", detail: classroomRes.error.message });
      const announcementById = new Map<string, Record<string, unknown>>();
      for (const row of [...(globalRes.data ?? []), ...(classroomRes.data ?? [])] as Array<Record<string, unknown>>) {
        const id = String(row.id ?? "");
        if (!id || announcementById.has(id)) continue;
        announcementById.set(id, row);
      }
      return json(200, {
        announcements: Array.from(announcementById.values()).sort((a, b) =>
          Date.parse(String(b.created_at ?? "")) - Date.parse(String(a.created_at ?? "")),
        ),
      });
    }

    let query = sb
      .from("academy_announcements")
      .select("id, academy_id, classroom_id, title, body, metadata, created_by, created_at")
      .eq("academy_id", academyId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (classroomId) query = query.eq("classroom_id", classroomId);
    const { data, error } = await query;
    if (error) return json(500, { error: "Failed to load announcements", detail: error.message });
    return json(200, { announcements: data ?? [] });
  }

  if (action === "alerts") {
    requireAcademyPermission(access, "manageAlerts");
    const contactId = normalizeText(contactIdRaw, 64) || null;
    const scopedContactIds = await loadScopedContactIds(sb, academyId, scopedClassroomIds);
    if (contactId) await ensureContactInAccessScope(sb, academyId, access, contactId);
    if (!contactId && scopedContactIds !== null && scopedContactIds.size === 0) return json(200, { alerts: [] });

    let query = sb
      .from("academy_alerts")
      .select("id, academy_id, contact_id, type, severity, message, resolved, resolved_at, metadata, created_at")
      .eq("academy_id", academyId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (contactId) query = query.eq("contact_id", contactId);
    else if (scopedContactIds !== null) query = query.in("contact_id", Array.from(scopedContactIds));
    const { data, error } = await query;
    if (error) return json(500, { error: "Failed to load alerts", detail: error.message });
    return json(200, { alerts: data ?? [] });
  }

  if (action === "offers") {
    if (!academyAccessHas(access, "manageOffers")) return json(200, { offers: [] });
    const { data, error } = await sb
      .from("academy_offers")
      .select("id, academy_id, name, type, price_amount, currency, duration_days, description, is_active, metadata, created_at, updated_at")
      .eq("academy_id", academyId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) return json(500, { error: "Failed to load offers", detail: error.message });
    return json(200, { offers: data ?? [] });
  }

  if (action === "offer-grants") {
    if (!academyAccessHas(access, "manageOffers")) return json(200, { offer_grants: [] });
    const offerId = normalizeText(offerIdRaw, 64) || null;

    let query = sb
      .from("academy_offer_grants")
      .select("id, academy_id, offer_id, grant_type, resource_type, resource_id, capability_key, quantity, duration_days, metadata, created_at")
      .eq("academy_id", academyId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (offerId) query = query.eq("offer_id", offerId);
    const { data, error } = await query;
    if (error) return json(500, { error: "Failed to load offer grants", detail: error.message });
    return json(200, { offer_grants: data ?? [] });
  }

  if (action === "payments") {
    if (!academyAccessHas(access, "manageFinance")) return json(200, { payments: [] });
    const { data, error } = await sb
      .from("academy_payments")
      .select("id, academy_id, contact_id, offer_id, provider, provider_transaction_id, amount, currency, status, metadata, created_by, created_at, updated_at")
      .eq("academy_id", academyId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return json(500, { error: "Failed to load payments", detail: error.message });
    return json(200, { payments: data ?? [] });
  }

  // ── LMS: Assignments ────────────────────────────────────────────────────

  if (action === "assignments") {
    requireAcademyPermission(access, "manageAssignments");
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    if (classroomId && !accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
    if (!classroomId && scopedClassroomIds !== null && scopedClassroomIds.length === 0) return json(200, { assignments: [] });
    let query = sb
      .from("academy_assignments")
      .select("id, academy_id, classroom_id, title, description, assignment_type, experience_id, due_at, released_at, prerequisite_id, position, max_score, score_weight, status, metadata, created_by, created_at, updated_at")
      .eq("academy_id", academyId)
      .neq("status", "archived")
      .order("position", { ascending: true });
    if (classroomId) query = query.eq("classroom_id", classroomId);
    else if (scopedClassroomIds !== null) query = query.in("classroom_id", scopedClassroomIds);
    const { data, error } = await query.limit(500);
    if (error) return json(500, { error: "Failed to load assignments", detail: error.message });
    return json(200, { assignments: data ?? [] });
  }

  // ── LMS: Submissions / Gradebook ────────────────────────────────────────

  if (action === "submissions") {
    requireAcademyPermission(access, "gradeSubmissions");
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    const assignmentId = normalizeText(assignmentIdRaw || contactIdRaw, 64) || null;
    if (classroomId && !accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
    if (!classroomId && scopedClassroomIds !== null && scopedClassroomIds.length === 0) return json(200, { submissions: [] });
    let query = sb
      .from("academy_submissions")
      .select("id, academy_id, assignment_id, classroom_id, contact_id, user_id, session_id, score, max_score, status, submitted_at, graded_at, graded_by, notes, metadata, created_at, updated_at")
      .eq("academy_id", academyId)
      .order("submitted_at", { ascending: false });
    if (classroomId) query = query.eq("classroom_id", classroomId);
    else if (scopedClassroomIds !== null) query = query.in("classroom_id", scopedClassroomIds);
    if (assignmentId) query = query.eq("assignment_id", assignmentId);
    const { data, error } = await query.limit(2000);
    if (error) return json(500, { error: "Failed to load submissions", detail: error.message });
    return json(200, { submissions: data ?? [] });
  }

  if (action === "gradebook") {
    requireAcademyPermission(access, "gradeSubmissions");
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    if (!classroomId) return json(400, { error: "classroom_id is required for gradebook" });
    if (!accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });

    const [assignmentsResult, submissionsResult, membersResult] = await Promise.all([
      sb.from("academy_assignments")
        .select("id, title, assignment_type, due_at, max_score, score_weight, position, status")
        .eq("academy_id", academyId).eq("classroom_id", classroomId).neq("status", "archived")
        .order("position", { ascending: true }).limit(200),
      sb.from("academy_submissions")
        .select("id, assignment_id, contact_id, score, max_score, status, submitted_at, graded_at, notes")
        .eq("academy_id", academyId).eq("classroom_id", classroomId).limit(5000),
      sb.from("academy_classroom_memberships")
        .select("contact_id, role, academy_contacts(id, first_name, last_name, email, status)")
        .eq("academy_id", academyId).eq("classroom_id", classroomId).in("role", ["student", "observer"]).limit(500),
    ]);

    if (assignmentsResult.error) return json(500, { error: "Failed to load assignments", detail: assignmentsResult.error.message });
    if (submissionsResult.error) return json(500, { error: "Failed to load submissions", detail: submissionsResult.error.message });
    if (membersResult.error) return json(500, { error: "Failed to load members", detail: membersResult.error.message });

    const submissionMap = new Map<string, Record<string, unknown>>();
    for (const s of (submissionsResult.data ?? []) as Array<Record<string, unknown>>) {
      submissionMap.set(`${String(s.assignment_id)}__${String(s.contact_id)}`, s);
    }

    const students = ((membersResult.data ?? []) as Array<Record<string, unknown>>).map((m) => {
      const contact = (m.academy_contacts as Record<string, unknown>) ?? {};
      return {
        contact_id: String(contact.id ?? m.contact_id ?? ""),
        first_name: String(contact.first_name ?? ""),
        last_name: String(contact.last_name ?? ""),
        email: contact.email ?? null,
        status: String(contact.status ?? "active"),
        role: String(m.role ?? "student"),
      };
    });

    const assignments = assignmentsResult.data ?? [];

    const rows = students.map((student) => {
      const submissions: Record<string, unknown> = {};
      let totalScore = 0;
      let totalWeight = 0;
      let submittedCount = 0;

      for (const asgn of assignments as Array<Record<string, unknown>>) {
        const key = `${String(asgn.id)}__${student.contact_id}`;
        const sub = submissionMap.get(key) ?? null;
        submissions[String(asgn.id)] = sub ? {
          score: sub.score ?? null,
          max_score: sub.max_score ?? asgn.max_score ?? null,
          status: sub.status,
          submitted_at: sub.submitted_at ?? null,
          graded_at: sub.graded_at ?? null,
          notes: sub.notes ?? null,
        } : { status: "missing", score: null };

        if (sub && typeof sub.score === "number" && typeof (sub.max_score ?? asgn.max_score) === "number") {
          const maxS = Number(sub.max_score ?? asgn.max_score);
          if (maxS > 0) {
            const w = Number((asgn.score_weight as number) ?? 1);
            totalScore += (Number(sub.score) / maxS) * 100 * w;
            totalWeight += w;
            submittedCount++;
          }
        }
      }

      return {
        ...student,
        submissions,
        composite_score: totalWeight > 0 ? Math.round((totalScore / totalWeight) * 10) / 10 : null,
        submitted_count: submittedCount,
        total_assignments: assignments.length,
      };
    });

    return json(200, { classroom_id: classroomId, assignments, rows });
  }

  // ── LMS: Student Progress ────────────────────────────────────────────────

  if (action === "student_progress") {
    requireAcademyPermission(access, "viewContacts");
    const contactId = normalizeText(contactIdRaw, 64) || null;
    if (!contactId) return json(400, { error: "contact_id is required for student_progress" });
    await ensureContactInAccessScope(sb, academyId, access, contactId);

    let membershipsQuery = sb.from("academy_classroom_memberships")
      .select("classroom_id, role, joined_at, academy_classrooms(id, name, is_active)")
      .eq("academy_id", academyId).eq("contact_id", contactId).limit(50);
    let submissionsQuery = sb.from("academy_submissions")
      .select("id, assignment_id, classroom_id, score, max_score, status, submitted_at, graded_at, notes, academy_assignments(title, assignment_type, due_at, max_score)")
      .eq("academy_id", academyId).eq("contact_id", contactId)
      .order("submitted_at", { ascending: false }).limit(200);
    let attendanceQuery = sb.from("academy_attendance")
      .select("classroom_id, session_date, status, notes, marked_at")
      .eq("academy_id", academyId).eq("contact_id", contactId)
      .order("session_date", { ascending: false }).limit(90);
    if (scopedClassroomIds !== null) {
      membershipsQuery = scopedClassroomIds.length > 0 ? membershipsQuery.in("classroom_id", scopedClassroomIds) : membershipsQuery.eq("classroom_id", "__none__");
      submissionsQuery = scopedClassroomIds.length > 0 ? submissionsQuery.in("classroom_id", scopedClassroomIds) : submissionsQuery.eq("classroom_id", "__none__");
      attendanceQuery = scopedClassroomIds.length > 0 ? attendanceQuery.in("classroom_id", scopedClassroomIds) : attendanceQuery.eq("classroom_id", "__none__");
    }

    const [contactResult, membershipsResult, submissionsResult, attendanceResult] = await Promise.all([
      sb.from("academy_contacts")
        .select("id, first_name, last_name, email, phone, status, last_activity_at, metadata, created_at")
        .eq("academy_id", academyId).eq("id", contactId).maybeSingle(),
      membershipsQuery,
      submissionsQuery,
      attendanceQuery,
    ]);

    if (!contactResult.data) return json(404, { error: "Contact not found" });

    const submissions = (submissionsResult.data ?? []) as Array<Record<string, unknown>>;
    const graded = submissions.filter((s) => typeof s.score === "number");
    const avgScore = graded.length > 0
      ? Math.round(graded.reduce((acc, s) => {
          const ms = Number((s.academy_assignments as Record<string, unknown>)?.max_score ?? s.max_score ?? 100);
          return acc + (ms > 0 ? (Number(s.score) / ms) * 100 : 0);
        }, 0) / graded.length * 10) / 10
      : null;

    const attendance = (attendanceResult.data ?? []) as Array<Record<string, unknown>>;
    const presentDays = attendance.filter((a) => a.status === "present" || a.status === "late").length;
    const attendanceRate = attendance.length > 0 ? Math.round((presentDays / attendance.length) * 100) : null;

    return json(200, {
      contact: contactResult.data,
      classrooms: (membershipsResult.data ?? []),
      submissions,
      attendance: attendance.slice(0, 30),
      stats: {
        total_submissions: submissions.length,
        graded_submissions: graded.length,
        avg_score: avgScore,
        attendance_rate: attendanceRate,
        total_attendance_days: attendance.length,
        present_days: presentDays,
      },
    });
  }

  // ── LMS: Attendance ──────────────────────────────────────────────────────

  if (action === "attendance") {
    requireAcademyPermission(access, "markAttendance");
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    if (!classroomId) return json(400, { error: "classroom_id is required" });
    if (!accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });

    const { data, error } = await sb
      .from("academy_attendance")
      .select("id, classroom_id, contact_id, session_date, status, notes, marked_by, marked_at")
      .eq("academy_id", academyId).eq("classroom_id", classroomId)
      .order("session_date", { ascending: false }).limit(2000);
    if (error) return json(500, { error: "Failed to load attendance", detail: error.message });
    return json(200, { attendance: data ?? [] });
  }

  // ── LMS: Bulk Invites ────────────────────────────────────────────────────

  if (action === "bulk_invites") {
    requireAcademyPermission(access, "manageRoster");
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    if (classroomId && !accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
    if (!classroomId && scopedClassroomIds !== null && scopedClassroomIds.length === 0) return json(200, { bulk_invites: [] });
    let query = sb
      .from("academy_bulk_invites")
      .select("id, classroom_id, email, first_name, last_name, status, invited_at, joined_at, error")
      .eq("academy_id", academyId)
      .order("invited_at", { ascending: false });
    if (classroomId) query = query.eq("classroom_id", classroomId);
    else if (scopedClassroomIds !== null) query = query.in("classroom_id", scopedClassroomIds);
    const { data, error } = await query.limit(500);
    if (error) return json(500, { error: "Failed to load bulk invites", detail: error.message });
    return json(200, { bulk_invites: data ?? [] });
  }

  if (action === "referral_leaderboard") {
    if (!academyAccessHas(access, "viewReferrals")) return json(200, { leaderboard: [] });
    const { data: refs, error } = await sb.from("academy_referrals")
      .select("referrer_contact_id, status").eq("academy_id", academyId).not("referred_contact_id", "is", null).limit(20000);
    if (error) return json(500, { error: "Failed to load referrals", detail: error.message });

    const byReferrer = new Map<string, { joined: number; enrolled: number }>();
    for (const r of (refs ?? []) as Array<Record<string, unknown>>) {
      const id = String(r.referrer_contact_id);
      const entry = byReferrer.get(id) ?? { joined: 0, enrolled: 0 };
      entry.joined += 1;
      if (String(r.status) === "enrolled") entry.enrolled += 1;
      byReferrer.set(id, entry);
    }
    const referrerIds = Array.from(byReferrer.keys());
    if (referrerIds.length === 0) return json(200, { leaderboard: [] });

    const { data: contactRows } = await sb.from("academy_contacts")
      .select("id, first_name, last_name, email").eq("academy_id", academyId).in("id", referrerIds);
    const contactById = new Map(((contactRows ?? []) as Array<Record<string, unknown>>).map((c) => [String(c.id), c]));

    const leaderboard = referrerIds.map((id) => {
      const c = contactById.get(id) ?? {};
      const stats = byReferrer.get(id)!;
      return {
        contact_id: id,
        name: `${String((c as any).first_name ?? "")} ${String((c as any).last_name ?? "")}`.trim() || String((c as any).email ?? "Student"),
        referrals: stats.joined,
        enrolled: stats.enrolled,
      };
    }).sort((a, b) => b.referrals - a.referrals).slice(0, 50);

    return json(200, { leaderboard });
  }

  if (action === "staff") {
    if (!academyAccessHas(access, "manageStaff")) return json(200, { staff: [] });
    const { data, error } = await sb.from("academy_staff")
      .select("id, academy_id, user_id, email, display_name, role, classroom_ids, is_active, created_at")
      .eq("academy_id", academyId).order("created_at", { ascending: false }).limit(500);
    if (error) return json(500, { error: "Failed to load staff", detail: error.message });
    return json(200, { staff: data ?? [] });
  }

  if (action === "owner_dashboard") {
    if (!academyAccessHas(access, "manageFinance")) {
      return json(200, {
        revenue: { currency: "UZS", collected_total: 0, collected_this_month: 0, outstanding: 0, paid_count: 0 },
        funnel: {},
        total_students: 0,
        total_classrooms: 0,
        classroom_stats: [],
        attendance_trend: [],
        center_voucher_source: { center_tenant_id: null },
        center_voucher_heatmaps: [],
      });
    }
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
    const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const [contactsRes, classroomsRes, paymentsRes, membersRes, subsRes, attRes, asgnRes] = await Promise.all([
      sb.from("academy_contacts").select("id, status").eq("academy_id", academyId).limit(10000),
      sb.from("academy_classrooms").select("id, name, is_active").eq("academy_id", academyId).limit(1000),
      sb.from("academy_payments").select("amount, currency, status, created_at").eq("academy_id", academyId).limit(20000),
      sb.from("academy_classroom_memberships").select("classroom_id, contact_id, role").eq("academy_id", academyId).in("role", ["student", "observer"]).limit(20000),
      sb.from("academy_submissions").select("classroom_id, contact_id, score, max_score, status").eq("academy_id", academyId).limit(50000),
      sb.from("academy_attendance").select("classroom_id, status, session_date").eq("academy_id", academyId).gte("session_date", since30).limit(50000),
      sb.from("academy_assignments").select("id, classroom_id, status").eq("academy_id", academyId).neq("status", "archived").limit(5000),
    ]);

    const contacts = (contactsRes.data ?? []) as Array<Record<string, unknown>>;
    const classrooms = (classroomsRes.data ?? []) as Array<Record<string, unknown>>;
    const payments = (paymentsRes.data ?? []) as Array<Record<string, unknown>>;
    const members = (membersRes.data ?? []) as Array<Record<string, unknown>>;
    const subs = (subsRes.data ?? []) as Array<Record<string, unknown>>;
    const attendance = (attRes.data ?? []) as Array<Record<string, unknown>>;
    const assignments = (asgnRes.data ?? []) as Array<Record<string, unknown>>;

    // Revenue
    const paid = payments.filter((p) => String(p.status) === "paid");
    const collectedTotal = paid.reduce((acc, p) => acc + Number(p.amount ?? 0), 0);
    const collectedThisMonth = paid.filter((p) => String(p.created_at ?? "") >= monthStart).reduce((acc, p) => acc + Number(p.amount ?? 0), 0);
    const outstanding = payments.filter((p) => String(p.status) === "pending").reduce((acc, p) => acc + Number(p.amount ?? 0), 0);
    const currency = String(paid[0]?.currency ?? payments[0]?.currency ?? "UZS");

    // Enrollment funnel
    const funnel = { trial: 0, active: 0, paused: 0, inactive: 0 } as Record<string, number>;
    for (const c of contacts) {
      const s = String(c.status ?? "active");
      funnel[s] = (funnel[s] ?? 0) + 1;
    }

    // Per-classroom performance
    const membersByClassroom = new Map<string, number>();
    for (const m of members) membersByClassroom.set(String(m.classroom_id), (membersByClassroom.get(String(m.classroom_id)) ?? 0) + 1);
    const classroomStats = classrooms.map((cl) => {
      const cid = String(cl.id);
      const clSubs = subs.filter((s) => String(s.classroom_id) === cid && typeof s.score === "number" && Number(s.max_score ?? 0) > 0);
      const avgScore = clSubs.length > 0
        ? Math.round(clSubs.reduce((acc, s) => acc + (Number(s.score) / Number(s.max_score)) * 100, 0) / clSubs.length * 10) / 10
        : null;
      const clAtt = attendance.filter((a) => String(a.classroom_id) === cid);
      const present = clAtt.filter((a) => a.status === "present" || a.status === "late").length;
      const attendanceRate = clAtt.length > 0 ? Math.round((present / clAtt.length) * 100) : null;
      const clAsgn = assignments.filter((a) => String(a.classroom_id) === cid).length;
      return {
        classroom_id: cid, name: String(cl.name ?? ""), is_active: Boolean(cl.is_active),
        students: membersByClassroom.get(cid) ?? 0, assignments: clAsgn,
        avg_score: avgScore, attendance_rate: attendanceRate,
      };
    });

    // Attendance trend: last 8 distinct session dates academy-wide
    const dates = Array.from(new Set(attendance.map((a) => String(a.session_date)))).sort().reverse().slice(0, 8).reverse();
    const trend = dates.map((d) => {
      const recs = attendance.filter((a) => String(a.session_date) === d);
      const present = recs.filter((a) => a.status === "present" || a.status === "late").length;
      return { date: d, rate: recs.length > 0 ? Math.round((present / recs.length) * 100) : null };
    });

    const centerTenantId = await loadAcademyParentCenterId(sb, academyId, access);
    const classroomIds = classrooms.map((classroom) => normalizeText(classroom.id, 64)).filter(Boolean);
    const centerVoucherHeatmaps = await loadAcademyCenterVoucherHeatmaps(sb, academyId, centerTenantId, classroomIds);

    return json(200, {
      revenue: { currency, collected_total: collectedTotal, collected_this_month: collectedThisMonth, outstanding, paid_count: paid.length },
      funnel,
      total_students: contacts.length,
      total_classrooms: classrooms.length,
      classroom_stats: classroomStats,
      attendance_trend: trend,
      center_voucher_source: { center_tenant_id: centerTenantId },
      center_voucher_heatmaps: centerVoucherHeatmaps,
    });
  }

  if (action === "education_os") {
    requireAcademyPermission(access, "viewEducationOS");
    const os = await buildEducationOS(sb, academyId, null);
    return json(200, await filterEducationOSForAccess(sb, academyId, access, os));
  }

  if (action === "automation_rules") {
    if (!academyAccessHas(access, "manageAutomation")) return json(200, { automation_rules: [] });
    const automationRules = await loadEducationAutomationRules(sb, academyId, null);
    return json(200, { automation_rules: automationRules });
  }

  if (action === "branding") {
    if (!academyAccessHas(access, "manageBranding")) return json(200, { branding: null });
    const { data, error } = await sb.from("academy_branding")
      .select("id, academy_id, display_name, tagline, logo_url, favicon_url, primary_color, accent_color, hide_schood_logo, custom_domain, custom_domain_verified, footer_text, metadata, updated_at")
      .eq("academy_id", academyId).maybeSingle();
    if (error) return json(500, { error: "Failed to load branding", detail: error.message });
    return json(200, { branding: data ?? null });
  }

  if (action === "notifications") {
    if (!academyAccessHas(access, "viewNotifications")) return json(200, { notifications: [] });
    const { data, error } = await sb.from("academy_notifications")
      .select("id, contact_id, channel, type, title, body, status, error, sent_at, scheduled_at, created_at")
      .eq("academy_id", academyId).order("created_at", { ascending: false }).limit(200);
    if (error) return json(500, { error: "Failed to load notifications", detail: error.message });
    return json(200, { notifications: data ?? [] });
  }

  if (action === "classroom_billing") {
    if (!academyAccessHas(access, "manageFinance")) {
      return json(200, { classroom_id: normalizeText(classroomIdRaw, 64) || null, has_tuition: false, offers: [], students: [], paid_count: 0, unpaid_count: 0 });
    }
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    if (!classroomId) return json(400, { error: "classroom_id is required" });
    if (!accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });

    const [offersRes, membersRes, entRes, paymentsRes] = await Promise.all([
      sb.from("academy_offers")
        .select("id, name, price_amount, currency, duration_days, is_active")
        .eq("academy_id", academyId).eq("classroom_id", classroomId).eq("is_active", true),
      sb.from("academy_classroom_memberships")
        .select("contact_id, academy_contacts(id, first_name, last_name, email, status)")
        .eq("academy_id", academyId).eq("classroom_id", classroomId).in("role", ["student", "observer"]).limit(500),
      sb.from("academy_entitlements")
        .select("contact_id, resource_id, status, expires_at")
        .eq("academy_id", academyId).eq("resource_type", "classroom").eq("resource_id", classroomId).limit(2000),
      sb.from("academy_payments")
        .select("contact_id, amount, currency, status, created_at")
        .eq("academy_id", academyId).order("created_at", { ascending: false }).limit(2000),
    ]);
    if (offersRes.error) return json(500, { error: "Failed to load offers", detail: offersRes.error.message });
    if (membersRes.error) return json(500, { error: "Failed to load members", detail: membersRes.error.message });

    const offers = offersRes.data ?? [];
    const hasTuition = offers.length > 0;
    const paidContacts = new Set(
      ((entRes.data ?? []) as Array<Record<string, unknown>>)
        .filter((e) => String(e.status) === "active" && (!e.expires_at || new Date(String(e.expires_at)) > new Date()))
        .map((e) => String(e.contact_id)),
    );
    const lastPaymentByContact = new Map<string, Record<string, unknown>>();
    for (const p of (paymentsRes.data ?? []) as Array<Record<string, unknown>>) {
      const cid = String(p.contact_id ?? "");
      if (cid && !lastPaymentByContact.has(cid)) lastPaymentByContact.set(cid, p);
    }

    const students = ((membersRes.data ?? []) as Array<Record<string, unknown>>).map((m) => {
      const c = (m.academy_contacts as Record<string, unknown>) ?? {};
      const contactId = String(c.id ?? m.contact_id ?? "");
      return {
        contact_id: contactId,
        first_name: String(c.first_name ?? ""),
        last_name: String(c.last_name ?? ""),
        email: c.email ?? null,
        // No tuition offer => classroom is free => everyone has access.
        paid: hasTuition ? paidContacts.has(contactId) : true,
        last_payment: lastPaymentByContact.get(contactId) ?? null,
      };
    });

    return json(200, {
      classroom_id: classroomId,
      has_tuition: hasTuition,
      offers,
      students,
      paid_count: students.filter((s) => s.paid).length,
      unpaid_count: students.filter((s) => !s.paid).length,
    });
  }

  if (action === "schedule") {
    requireAcademyPermission(access, "manageSchedule");
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    if (classroomId && !accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
    if (!classroomId && scopedClassroomIds !== null && scopedClassroomIds.length === 0) return json(200, { schedule: [] });
    let query = sb.from("academy_classroom_schedules")
      .select("id, academy_id, classroom_id, day_of_week, start_time, end_time, timezone, label, is_active, created_at")
      .eq("academy_id", academyId).eq("is_active", true).order("day_of_week").order("start_time");
    if (classroomId) query = query.eq("classroom_id", classroomId);
    else if (scopedClassroomIds !== null) query = query.in("classroom_id", scopedClassroomIds);
    const { data, error } = await query.limit(200);
    if (error) return json(500, { error: "Failed to load schedule", detail: error.message });
    return json(200, { schedule: data ?? [] });
  }

  if (!academyAccessHas(access, "manageFinance")) return json(200, { entitlements: [] });

  const { data, error } = await sb
    .from("academy_entitlements")
    .select("id, academy_id, contact_id, user_id, offer_id, payment_id, grant_type, resource_type, resource_id, capability_key, quantity, remaining, starts_at, expires_at, status, source, metadata, created_at, updated_at")
    .eq("academy_id", academyId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return json(500, { error: "Failed to load entitlements", detail: error.message });
  return json(200, { entitlements: data ?? [] });
};

// Education OS engine: generated actions, lifecycle pipeline, automations, calendar, and intelligence.
type EducationActionCandidate = {
  dedupe_key: string;
  source_type: string;
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  recommended_action: string;
  contact_id?: string | null;
  classroom_id?: string | null;
  due_at?: string | null;
  metadata?: Json;
};

type EducationPipelineRow = {
  contact_id: string;
  name: string;
  email: string | null;
  status: string;
  stage: string;
  derived_stage: string;
  next_action: string;
  placement_level: string | null;
  placement_score: number | null;
  classroom_ids: string[];
  classroom_names: string[];
  attendance_rate: number | null;
  recent_absences: number;
  missing_assignments: number;
  composite_score: number | null;
  certificate_ready: boolean;
  pending_amount: number;
  entitlement_expires_at: string | null;
  last_activity_at: string | null;
};

type EducationCalendarEvent = {
  id: string;
  type: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  classroom_id: string | null;
  contact_id: string | null;
  priority: string;
  metadata: Json;
};

type EducationInsight = {
  id: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low" | "positive";
  title: string;
  detail: string;
  recommended_action: string;
  metric: number | null;
  classroom_id?: string | null;
  contact_id?: string | null;
};

const generatedEducationActionSources = [
  "alert",
  "grading_backlog",
  "missing_assignment",
  "attendance_roll_call",
  "placement_needed",
  "schedule_gap",
  "trial_follow_up",
  "renewal",
  "certificate_ready",
  "parent_follow_up",
];

const defaultAutomationRules = [
  {
    rule_key: "assignment_due_reminder",
    name: "Assignment due reminder",
    description: "Queue a student reminder when active work is due in the next 24 hours.",
    channel: "telegram",
    threshold: 24,
  },
  {
    rule_key: "class_reminder",
    name: "Class reminder",
    description: "Queue a same-day class reminder for students in scheduled classrooms.",
    channel: "telegram",
    threshold: 0,
  },
  {
    rule_key: "attendance_follow_up",
    name: "Attendance follow-up",
    description: "Queue a follow-up when a student has repeated absences in the last 14 days.",
    channel: "telegram",
    threshold: 2,
  },
  {
    rule_key: "at_risk_scan",
    name: "At-risk scan",
    description: "Create alerts when attendance or missing work indicates a student needs intervention.",
    channel: "inapp",
    threshold: 70,
  },
  {
    rule_key: "trial_conversion_follow_up",
    name: "Trial conversion follow-up",
    description: "Create an action item for trial students who have not converted yet.",
    channel: "inapp",
    threshold: 7,
  },
  {
    rule_key: "course_completion_certificate",
    name: "Certificate readiness",
    description: "Create an action item when a student is ready for a certificate or next course.",
    channel: "inapp",
    threshold: 80,
  },
];

const priorityWeight = (priority: string): number => {
  if (priority === "critical") return 0;
  if (priority === "high") return 1;
  if (priority === "medium") return 2;
  return 3;
};

const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);
const addDays = (value: Date, days: number): Date => new Date(value.getTime() + days * 86400000);

const safeNumber = (value: unknown): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const ensureDefaultAutomationRules = async (
  sb: SupabaseClientLike,
  academyId: string,
  userId: string | null = null,
): Promise<void> => {
  const rows = defaultAutomationRules.map((rule) => ({
    academy_id: academyId,
    rule_key: rule.rule_key,
    name: rule.name,
    description: rule.description,
    channel: rule.channel,
    threshold: rule.threshold,
    is_active: true,
    metadata: { system_default: true },
    created_by: userId,
  }));
  await sb.from("academy_automation_rules").upsert(rows, {
    onConflict: "academy_id,rule_key",
    ignoreDuplicates: true,
  });
};

const loadEducationAutomationRules = async (
  sb: SupabaseClientLike,
  academyId: string,
  userId: string | null = null,
): Promise<Array<Record<string, unknown>>> => {
  await ensureDefaultAutomationRules(sb, academyId, userId);
  const { data, error } = await sb.from("academy_automation_rules")
    .select("id, academy_id, rule_key, name, description, channel, threshold, is_active, metadata, last_run_at, last_run_summary, created_at, updated_at")
    .eq("academy_id", academyId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load automation rules: ${error.message}`);
  return (data ?? []) as Array<Record<string, unknown>>;
};

const ruleIsActive = (rules: Array<Record<string, unknown>>, key: string): boolean => {
  const rule = rules.find((item) => String(item.rule_key) === key);
  return !rule || rule.is_active !== false;
};

const ruleChannel = (rules: Array<Record<string, unknown>>, key: string, fallback = "telegram"): string => {
  const rule = rules.find((item) => String(item.rule_key) === key);
  return normalizeText(rule?.channel, 20) || fallback;
};

const ruleThreshold = (rules: Array<Record<string, unknown>>, key: string, fallback: number): number => {
  const rule = rules.find((item) => String(item.rule_key) === key);
  const value = safeNumber(rule?.threshold);
  return value === null ? fallback : value;
};

const syncEducationActionItems = async (
  sb: SupabaseClientLike,
  academyId: string,
  candidates: EducationActionCandidate[],
): Promise<Array<Record<string, unknown>>> => {
  const activeKeys = new Set(candidates.map((item) => item.dedupe_key));
  const existingByKey = new Map<string, Record<string, unknown>>();

  if (activeKeys.size > 0) {
    const { data: existing } = await sb.from("academy_action_items")
      .select("id, dedupe_key, status")
      .eq("academy_id", academyId)
      .in("dedupe_key", Array.from(activeKeys))
      .limit(1000);
    for (const item of (existing ?? []) as Array<Record<string, unknown>>) {
      existingByKey.set(String(item.dedupe_key), item);
    }
  }

  for (const candidate of candidates.slice(0, 200)) {
    const existing = existingByKey.get(candidate.dedupe_key);
    if (existing && ["resolved", "dismissed"].includes(String(existing.status))) continue;
    const payload = {
      academy_id: academyId,
      dedupe_key: candidate.dedupe_key,
      source_type: candidate.source_type,
      priority: candidate.priority,
      title: candidate.title,
      description: candidate.description,
      recommended_action: candidate.recommended_action,
      contact_id: candidate.contact_id ?? null,
      classroom_id: candidate.classroom_id ?? null,
      due_at: candidate.due_at ?? null,
      status: "open",
      metadata: candidate.metadata ?? {},
    };
    if (existing?.id) {
      await sb.from("academy_action_items").update(payload).eq("academy_id", academyId).eq("id", String(existing.id));
    } else {
      await sb.from("academy_action_items").insert(payload);
    }
  }

  const { data: stale } = await sb.from("academy_action_items")
    .select("id, dedupe_key")
    .eq("academy_id", academyId)
    .eq("status", "open")
    .in("source_type", generatedEducationActionSources)
    .limit(1000);
  const staleIds = ((stale ?? []) as Array<Record<string, unknown>>)
    .filter((item) => !activeKeys.has(String(item.dedupe_key)))
    .map((item) => String(item.id));
  if (staleIds.length > 0) {
    await sb.from("academy_action_items")
      .update({ status: "resolved", resolved_at: new Date().toISOString(), resolution_note: "Auto-resolved because the underlying condition cleared." })
      .eq("academy_id", academyId)
      .in("id", staleIds);
  }

  const { data, error } = await sb.from("academy_action_items")
    .select("id, academy_id, dedupe_key, source_type, priority, title, description, recommended_action, contact_id, classroom_id, due_at, status, metadata, created_at, updated_at")
    .eq("academy_id", academyId)
    .in("status", ["open", "snoozed"])
    .limit(300);
  if (error) throw new Error(`Failed to load action queue: ${error.message}`);

  return ((data ?? []) as Array<Record<string, unknown>>).sort((a, b) => {
    const byPriority = priorityWeight(String(a.priority)) - priorityWeight(String(b.priority));
    if (byPriority !== 0) return byPriority;
    return String(a.due_at ?? a.created_at ?? "").localeCompare(String(b.due_at ?? b.created_at ?? ""));
  });
};

const loadAcademyParentCenterId = async (
  sb: SupabaseClientLike,
  academyId: string,
  access: MembershipRow,
): Promise<string | null> => {
  const delegatedCenterId = normalizeText(access.center_tenant_id, 64);
  if (delegatedCenterId) return delegatedCenterId;
  const { data, error } = await sb
    .from("tenants")
    .select("metadata")
    .eq("id", academyId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load academy center link: ${error.message}`);
  const metadata = toJsonObject((data as Record<string, unknown> | null)?.metadata);
  return normalizeText(metadata.parent_center_id, 64) || null;
};

const loadCenterVoucherExamResults = async (
  sb: SupabaseClientLike,
  centerTenantId: string,
): Promise<Array<Record<string, unknown>>> => {
  const { data, error } = await sb
    .from("exam_registrations")
    .select(
      "id, token_id, status, created_at, first_name, last_name, legal_name, email, phone, session_id, experiences ( name ), exam_tokens ( token_code ), sessions!exam_registrations_session_id_fkey ( status )",
    )
    .eq("tenant_id", centerTenantId)
    .order("created_at", { ascending: false })
    .limit(20000);
  if (error) throw new Error(`Failed to load center voucher exam results: ${error.message}`);

  const rows = (data ?? []) as Array<Record<string, any>>;
  const sessionIds = Array.from(new Set(rows.map((row) => normalizeText(row.session_id, 64)).filter(Boolean)));
  const evalMap = new Map<string, Record<string, unknown>>();
  if (sessionIds.length > 0) {
    const { data: evalRows, error: evalError } = await sb
      .from("evaluations")
      .select("session_id, method, status, result")
      .in("session_id", sessionIds);
    if (evalError) throw new Error(`Failed to load center voucher evaluations: ${evalError.message}`);
    for (const row of (evalRows ?? []) as Array<Record<string, unknown>>) {
      const sessionId = normalizeText(row.session_id, 64);
      if (!sessionId) continue;
      const existing = evalMap.get(sessionId);
      if (!existing || row.method === "auto") evalMap.set(sessionId, row);
    }
  }

  return rows.map((row) => {
    const evaluation = evalMap.get(normalizeText(row.session_id, 64)) ?? null;
    const result = toJsonObject(evaluation?.result);
    const overallScore = result.overall_score ?? null;
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
      overall_band: result.overall_band ?? overallScore,
      listening_score: result.listening_score ?? result.listening_band ?? null,
      reading_score: result.reading_score ?? result.reading_band ?? null,
      writing_score: result.writing_score ?? result.writing_band ?? null,
      speaking_score: result.speaking_score ?? result.speaking_band ?? null,
      weak_areas: Array.isArray(result.weak_areas) ? result.weak_areas : [],
      created_at: row.created_at,
    };
  });
};

const buildCenterVoucherHeatmaps = (
  results: Array<Record<string, unknown>>,
  vouchers: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> => {
  const voucherByCode = new Map<string, Record<string, unknown>>();
  for (const voucher of vouchers) {
    const code = normalizeText(voucher.code, 120).toUpperCase();
    if (code) voucherByCode.set(code, voucher);
  }

  const metrics = [
    ["listening", "Listening", "listening_score"],
    ["reading", "Reading", "reading_score"],
    ["writing", "Writing", "writing_score"],
    ["speaking", "Speaking", "speaking_score"],
  ] as const;
  const groups = new Map<string, Record<string, any>>();

  for (const result of results) {
    const code = normalizeText(result.token_code, 120).toUpperCase();
    const voucher = voucherByCode.get(code);
    if (!voucher) continue;
    const classroomId = normalizeText(voucher.classroom_id, 64);
    if (!classroomId) continue;
    const classroom = relatedClassroom(voucher);
    const classroomName = normalizeText(classroom?.name, 180) || "Assigned classroom";
    const heatmap = groups.get(classroomId) ?? {
      classroom_id: classroomId,
      classroom_name: classroomName,
      attempts: 0,
      completed_attempts: 0,
      average_score: null,
      skills: metrics.map(([id, label]) => ({ id, label, average_score: null, attempts: 0 })),
      weakest_subskill: null,
      systemic_gaps: [],
      focus_areas: [],
      __scores: [],
      __weak: {},
    };

    heatmap.attempts += 1;
    if (normalizeText(result.registration_status ?? result.session_status, 40).toLowerCase() === "completed") heatmap.completed_attempts += 1;
    const overall = Number(result.overall_band ?? result.overall_score ?? NaN);
    if (Number.isFinite(overall)) heatmap.__scores.push(overall);

    heatmap.skills = heatmap.skills.map((skill: Record<string, any>) => {
      const metric = metrics.find(([id]) => id === skill.id);
      const value = metric ? Number(result[metric[2]] ?? NaN) : NaN;
      const scores = Array.isArray(skill.__scores) ? skill.__scores : [];
      if (Number.isFinite(value)) scores.push(value);
      return { ...skill, __scores: scores };
    });

    const weakAreas = Array.isArray(result.weak_areas) ? result.weak_areas : [];
    for (const area of weakAreas) {
      const label = weakAreaLabel(area);
      if (!label) continue;
      heatmap.__weak[label] = Number(heatmap.__weak[label] ?? 0) + 1;
    }
    groups.set(classroomId, heatmap);
  }

  return Array.from(groups.values()).map((heatmap) => {
    const scores = Array.isArray(heatmap.__scores) ? heatmap.__scores : [];
    const weakEntries = Object.entries(heatmap.__weak ?? {})
      .map(([label, count]) => ({ label, count: Number(count), share: heatmap.attempts ? Number(count) / heatmap.attempts : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    return {
      classroom_id: heatmap.classroom_id,
      classroom_name: heatmap.classroom_name,
      attempts: heatmap.attempts,
      completed_attempts: heatmap.completed_attempts,
      average_score: scores.length ? Math.round((scores.reduce((sum: number, value: number) => sum + value, 0) / scores.length) * 10) / 10 : null,
      skills: heatmap.skills.map((skill: Record<string, any>) => {
        const skillScores = Array.isArray(skill.__scores) ? skill.__scores : [];
        return {
          id: skill.id,
          label: skill.label,
          average_score: skillScores.length ? Math.round((skillScores.reduce((sum: number, value: number) => sum + value, 0) / skillScores.length) * 10) / 10 : null,
          attempts: skillScores.length,
        };
      }),
      weakest_subskill: weakEntries[0]?.label ?? null,
      systemic_gaps: weakEntries.filter((entry) => entry.share >= 0.35 || entry.count >= 3),
      focus_areas: weakEntries.slice(0, 3).map((entry) => entry.label),
    };
  }).sort((a, b) => Number(b.attempts) - Number(a.attempts));
};

const loadAcademyCenterVoucherHeatmaps = async (
  sb: SupabaseClientLike,
  academyId: string,
  centerTenantId: string | null,
  classroomIds: string[],
): Promise<Array<Record<string, unknown>>> => {
  if (!centerTenantId || classroomIds.length === 0) return [];
  const { data: vouchers, error: voucherError } = await sb
    .from("partner_vouchers")
    .select("id, code, status, classroom_id, academy_classrooms ( id, name, academy_id )")
    .eq("tenant_id", centerTenantId)
    .in("classroom_id", classroomIds)
    .limit(10000);
  if (voucherError) throw new Error(`Failed to load center vouchers for academy heatmap: ${voucherError.message}`);
  const voucherRows = ((vouchers ?? []) as Array<Record<string, unknown>>)
    .filter((voucher) => normalizeText(relatedClassroom(voucher)?.academy_id, 64) === academyId);
  if (voucherRows.length === 0) return [];
  const results = await loadCenterVoucherExamResults(sb, centerTenantId);
  return buildCenterVoucherHeatmaps(results, voucherRows);
};

const buildEducationOS = async (
  sb: SupabaseClientLike,
  academyId: string,
  userId: string | null = null,
): Promise<Record<string, unknown>> => {
  const now = new Date();
  const today = dateOnly(now);
  const since30 = dateOnly(addDays(now, -30));
  const since14 = dateOnly(addDays(now, -14));
  const in14 = addDays(now, 14).toISOString();
  const in30 = addDays(now, 30).toISOString();
  const rules = await loadEducationAutomationRules(sb, academyId, userId);

  const [
    contactsRes,
    classroomsRes,
    membersRes,
    assignmentsRes,
    submissionsRes,
    attendanceRes,
    schedulesRes,
    paymentsRes,
    entitlementsRes,
    alertsRes,
    notificationsRes,
  ] = await Promise.all([
    sb.from("academy_contacts").select("id, first_name, last_name, email, phone, telegram_id, status, last_activity_at, placement_level, placement_score, lifecycle_stage, notify_enabled, metadata, created_at").eq("academy_id", academyId).limit(10000),
    sb.from("academy_classrooms").select("id, name, is_active, metadata").eq("academy_id", academyId).limit(1000),
    sb.from("academy_classroom_memberships").select("classroom_id, contact_id, role, joined_at").eq("academy_id", academyId).in("role", ["student", "observer"]).limit(20000),
    sb.from("academy_assignments").select("id, classroom_id, title, assignment_type, due_at, max_score, score_weight, status").eq("academy_id", academyId).neq("status", "archived").limit(5000),
    sb.from("academy_submissions").select("id, assignment_id, classroom_id, contact_id, score, max_score, status, submitted_at, graded_at").eq("academy_id", academyId).limit(50000),
    sb.from("academy_attendance").select("id, classroom_id, contact_id, session_date, status").eq("academy_id", academyId).gte("session_date", since30).limit(50000),
    sb.from("academy_classroom_schedules").select("id, classroom_id, day_of_week, start_time, end_time, timezone, label, is_active").eq("academy_id", academyId).eq("is_active", true).limit(1000),
    sb.from("academy_payments").select("id, contact_id, amount, currency, status, created_at").eq("academy_id", academyId).limit(20000),
    sb.from("academy_entitlements").select("id, contact_id, resource_type, resource_id, status, expires_at").eq("academy_id", academyId).eq("status", "active").limit(20000),
    sb.from("academy_alerts").select("id, contact_id, type, severity, message, resolved, metadata, created_at").eq("academy_id", academyId).eq("resolved", false).limit(1000),
    sb.from("academy_notifications").select("id, contact_id, channel, type, title, body, status, scheduled_at, metadata").eq("academy_id", academyId).order("scheduled_at", { ascending: true }).limit(500),
  ]);

  for (const result of [contactsRes, classroomsRes, membersRes, assignmentsRes, submissionsRes, attendanceRes, schedulesRes, paymentsRes, entitlementsRes, alertsRes, notificationsRes]) {
    if (result.error) throw new Error(`Failed to build Education OS: ${result.error.message}`);
  }

  const contacts = (contactsRes.data ?? []) as Array<Record<string, unknown>>;
  const classrooms = (classroomsRes.data ?? []) as Array<Record<string, unknown>>;
  const members = (membersRes.data ?? []) as Array<Record<string, unknown>>;
  const assignments = (assignmentsRes.data ?? []) as Array<Record<string, unknown>>;
  const submissions = (submissionsRes.data ?? []) as Array<Record<string, unknown>>;
  const attendance = (attendanceRes.data ?? []) as Array<Record<string, unknown>>;
  const schedules = (schedulesRes.data ?? []) as Array<Record<string, unknown>>;
  const payments = (paymentsRes.data ?? []) as Array<Record<string, unknown>>;
  const entitlements = (entitlementsRes.data ?? []) as Array<Record<string, unknown>>;
  const alerts = (alertsRes.data ?? []) as Array<Record<string, unknown>>;
  const notifications = (notificationsRes.data ?? []) as Array<Record<string, unknown>>;

  const contactById = new Map(contacts.map((contact) => [String(contact.id), contact]));
  const classroomById = new Map(classrooms.map((classroom) => [String(classroom.id), classroom]));
  const membersByContact = new Map<string, Array<Record<string, unknown>>>();
  const membersByClassroom = new Map<string, Array<Record<string, unknown>>>();
  for (const member of members) {
    const contactId = String(member.contact_id ?? "");
    const classroomId = String(member.classroom_id ?? "");
    if (!contactId || !classroomId) continue;
    if (!membersByContact.has(contactId)) membersByContact.set(contactId, []);
    if (!membersByClassroom.has(classroomId)) membersByClassroom.set(classroomId, []);
    membersByContact.get(contactId)!.push(member);
    membersByClassroom.get(classroomId)!.push(member);
  }

  const assignmentsByClassroom = new Map<string, Array<Record<string, unknown>>>();
  for (const assignment of assignments) {
    const classroomId = String(assignment.classroom_id ?? "");
    if (!classroomId) continue;
    if (!assignmentsByClassroom.has(classroomId)) assignmentsByClassroom.set(classroomId, []);
    assignmentsByClassroom.get(classroomId)!.push(assignment);
  }

  const submissionByKey = new Map<string, Record<string, unknown>>();
  for (const submission of submissions) {
    submissionByKey.set(`${String(submission.assignment_id)}__${String(submission.contact_id)}`, submission);
  }

  const attendanceByContact = new Map<string, Array<Record<string, unknown>>>();
  const attendanceByClassDate = new Map<string, Array<Record<string, unknown>>>();
  for (const record of attendance) {
    const contactId = String(record.contact_id ?? "");
    const classDate = `${String(record.classroom_id)}__${String(record.session_date)}`;
    if (!attendanceByContact.has(contactId)) attendanceByContact.set(contactId, []);
    attendanceByContact.get(contactId)!.push(record);
    if (!attendanceByClassDate.has(classDate)) attendanceByClassDate.set(classDate, []);
    attendanceByClassDate.get(classDate)!.push(record);
  }

  const openAlertsByContact = new Map<string, Array<Record<string, unknown>>>();
  for (const alert of alerts) {
    const contactId = String(alert.contact_id ?? "");
    if (!contactId) continue;
    if (!openAlertsByContact.has(contactId)) openAlertsByContact.set(contactId, []);
    openAlertsByContact.get(contactId)!.push(alert);
  }

  const pendingPaymentsByContact = new Map<string, Array<Record<string, unknown>>>();
  for (const payment of payments.filter((payment) => String(payment.status) === "pending")) {
    const contactId = String(payment.contact_id ?? "");
    if (!pendingPaymentsByContact.has(contactId)) pendingPaymentsByContact.set(contactId, []);
    pendingPaymentsByContact.get(contactId)!.push(payment);
  }

  const expiringEntitlementsByContact = new Map<string, Array<Record<string, unknown>>>();
  for (const entitlement of entitlements) {
    const expiresAt = String(entitlement.expires_at ?? "");
    if (!expiresAt || expiresAt > in14) continue;
    const contactId = String(entitlement.contact_id ?? "");
    if (!expiringEntitlementsByContact.has(contactId)) expiringEntitlementsByContact.set(contactId, []);
    expiringEntitlementsByContact.get(contactId)!.push(entitlement);
  }

  const pipeline: EducationPipelineRow[] = [];
  const certificateCandidates: EducationPipelineRow[] = [];
  const missingAssignmentCandidates: EducationActionCandidate[] = [];
  const gradingCandidates: EducationActionCandidate[] = [];
  const pipelineCounts: Record<string, number> = { lead: 0, placement: 0, enrolled: 0, learning: 0, attention: 0, renewal: 0, completion: 0 };

  for (const contact of contacts) {
    const contactId = String(contact.id ?? "");
    const contactMemberships = membersByContact.get(contactId) ?? [];
    const classroomIds = contactMemberships.map((member) => String(member.classroom_id));
    const classroomNames = classroomIds.map((id) => String(classroomById.get(id)?.name ?? "Classroom")).filter(Boolean);
    const contactAttendance = attendanceByContact.get(contactId) ?? [];
    const present = contactAttendance.filter((item) => ["present", "late"].includes(String(item.status))).length;
    const recentAbsences = contactAttendance.filter((item) => String(item.session_date ?? "") >= since14 && String(item.status) === "absent").length;
    const attendanceRate = contactAttendance.length > 0 ? Math.round((present / contactAttendance.length) * 100) : null;

    let missingAssignments = 0;
    let weightedScore = 0;
    let totalWeight = 0;
    let submittedAssignments = 0;
    let totalAssignments = 0;

    for (const classroomId of classroomIds) {
      for (const assignment of assignmentsByClassroom.get(classroomId) ?? []) {
        totalAssignments++;
        const assignmentId = String(assignment.id ?? "");
        const dueAt = String(assignment.due_at ?? "");
        const submission = submissionByKey.get(`${assignmentId}__${contactId}`);
        const isSubmitted = submission && String(submission.status) !== "missing";
        if (isSubmitted) submittedAssignments++;
        if (dueAt && dueAt < now.toISOString() && !isSubmitted) {
          missingAssignments++;
          missingAssignmentCandidates.push({
            dedupe_key: `missing_assignment:${assignmentId}:${contactId}`,
            source_type: "missing_assignment",
            priority: dueAt < addDays(now, -7).toISOString() ? "high" : "medium",
            title: `${contactDisplayName(contact) || "Student"} is missing ${String(assignment.title ?? "an assignment")}`,
            description: `Due ${dueAt.slice(0, 10)} in ${String(classroomById.get(classroomId)?.name ?? "classroom")}.`,
            recommended_action: "Send a reminder or mark the assignment after reviewing the student's work.",
            contact_id: contactId,
            classroom_id: classroomId,
            due_at: dueAt,
            metadata: { assignment_id: assignmentId },
          });
        }
        if (submission && typeof submission.score === "number") {
          const maxScore = Number(submission.max_score ?? assignment.max_score ?? 100);
          if (maxScore > 0) {
            const weight = Number(assignment.score_weight ?? 1);
            weightedScore += (Number(submission.score) / maxScore) * 100 * weight;
            totalWeight += weight;
          }
        }
      }
    }

    const compositeScore = totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 10) / 10 : null;
    const hasMembership = classroomIds.length > 0;
    const placementLevel = normalizeText(contact.placement_level, 20) || null;
    const explicitStage = normalizeText(contact.lifecycle_stage, 30).toLowerCase();
    const pendingAmount = (pendingPaymentsByContact.get(contactId) ?? []).reduce((acc, item) => acc + Number(item.amount ?? 0), 0);
    const expiring = (expiringEntitlementsByContact.get(contactId) ?? []).sort((a, b) => String(a.expires_at).localeCompare(String(b.expires_at)))[0] ?? null;
    const hasAttention = (openAlertsByContact.get(contactId) ?? []).length > 0 || missingAssignments >= 3 || recentAbsences >= 2 || (attendanceRate !== null && attendanceRate < 70);
    const certificateReady = hasMembership && totalAssignments > 0 && submittedAssignments >= totalAssignments && compositeScore !== null && compositeScore >= ruleThreshold(rules, "course_completion_certificate", 80);

    let derivedStage = "enrolled";
    if (!hasMembership || String(contact.status) === "trial") derivedStage = "lead";
    if (hasMembership && !placementLevel) derivedStage = "placement";
    if (hasMembership && (submittedAssignments > 0 || contactAttendance.length > 0)) derivedStage = "learning";
    if (pendingAmount > 0 || expiring) derivedStage = "renewal";
    if (certificateReady) derivedStage = "completion";
    if (hasAttention) derivedStage = "attention";

    const validStage = ["lead", "placement", "enrolled", "learning", "attention", "renewal", "completion"].includes(explicitStage);
    const stage = validStage ? explicitStage : derivedStage;
    pipelineCounts[stage] = (pipelineCounts[stage] ?? 0) + 1;

    const nextActionByStage: Record<string, string> = {
      lead: "Convert the lead: invite them to placement or enroll them in a class.",
      placement: "Record diagnostic score and place the student into the right level.",
      enrolled: "Confirm timetable, teacher, and first assignment.",
      learning: "Monitor attendance, grade submissions, and keep momentum.",
      attention: "Follow up with the student or parent today.",
      renewal: "Collect payment, renew entitlement, or assign the next offer.",
      completion: "Issue a certificate and recommend the next course.",
    };

    const row: EducationPipelineRow = {
      contact_id: contactId,
      name: contactDisplayName(contact) || "Student",
      email: contact.email ? String(contact.email) : null,
      status: String(contact.status ?? "active"),
      stage,
      derived_stage: derivedStage,
      next_action: nextActionByStage[stage] ?? nextActionByStage.enrolled,
      placement_level: placementLevel,
      placement_score: safeNumber(contact.placement_score),
      classroom_ids: classroomIds,
      classroom_names: classroomNames,
      attendance_rate: attendanceRate,
      recent_absences: recentAbsences,
      missing_assignments: missingAssignments,
      composite_score: compositeScore,
      certificate_ready: certificateReady,
      pending_amount: pendingAmount,
      entitlement_expires_at: expiring?.expires_at ? String(expiring.expires_at) : null,
      last_activity_at: contact.last_activity_at ? String(contact.last_activity_at) : null,
    };
    pipeline.push(row);
    if (certificateReady) certificateCandidates.push(row);
  }

  for (const submission of submissions) {
    if (!["submitted", "late"].includes(String(submission.status)) || typeof submission.score === "number") continue;
    const contact = contactById.get(String(submission.contact_id));
    const assignment = assignments.find((item) => String(item.id) === String(submission.assignment_id));
    gradingCandidates.push({
      dedupe_key: `grading_backlog:${String(submission.id)}`,
      source_type: "grading_backlog",
      priority: String(submission.submitted_at ?? "") < addDays(now, -3).toISOString() ? "high" : "medium",
      title: `Grade ${contactDisplayName(contact) || "student"}'s submission`,
      description: `${String(assignment?.title ?? "Assignment")} is waiting for a score.`,
      recommended_action: "Open the gradebook and record a score with feedback.",
      contact_id: String(submission.contact_id ?? ""),
      classroom_id: String(submission.classroom_id ?? ""),
      due_at: submission.submitted_at ? String(submission.submitted_at) : null,
      metadata: { submission_id: String(submission.id), assignment_id: String(submission.assignment_id) },
    });
  }

  const actionCandidates: EducationActionCandidate[] = [
    ...alerts.map((alert) => {
      const contactId = alert.contact_id ? String(alert.contact_id) : null;
      const contact = contactId ? contactById.get(contactId) : null;
      const severity = String(alert.severity ?? "medium");
      return {
        dedupe_key: `alert:${String(alert.id)}`,
        source_type: "alert",
        priority: severity === "critical" ? "critical" : severity === "high" ? "high" : "medium",
        title: contact ? `Resolve alert for ${contactDisplayName(contact) || "student"}` : "Resolve academy alert",
        description: String(alert.message ?? "Open alert"),
        recommended_action: "Review the alert, contact the student or parent, then resolve it.",
        contact_id: contactId,
        classroom_id: String((toJsonObject(alert.metadata).classroom_id as string) ?? "") || null,
        due_at: String(alert.created_at ?? ""),
        metadata: { alert_id: String(alert.id), alert_type: String(alert.type ?? "") },
      } satisfies EducationActionCandidate;
    }),
    ...gradingCandidates.slice(0, 80),
    ...missingAssignmentCandidates.slice(0, 120),
  ];

  for (const classroom of classrooms.filter((item) => item.is_active !== false)) {
    const classroomId = String(classroom.id);
    if ((schedules.filter((slot) => String(slot.classroom_id) === classroomId)).length === 0) {
      actionCandidates.push({
        dedupe_key: `schedule_gap:${classroomId}`,
        source_type: "schedule_gap",
        priority: "medium",
        title: `${String(classroom.name ?? "Classroom")} has no timetable`,
        description: "Students cannot receive class reminders until a weekly slot exists.",
        recommended_action: "Add at least one weekly schedule slot.",
        classroom_id: classroomId,
        metadata: {},
      });
    }
  }

  const todayDow = now.getUTCDay();
  for (const slot of schedules.filter((item) => Number(item.day_of_week) === todayDow)) {
    const classroomId = String(slot.classroom_id ?? "");
    const expected = (membersByClassroom.get(classroomId) ?? []).length;
    const marked = (attendanceByClassDate.get(`${classroomId}__${today}`) ?? []).length;
    if (expected > 0 && marked < expected) {
      actionCandidates.push({
        dedupe_key: `attendance_roll_call:${String(slot.id)}:${today}`,
        source_type: "attendance_roll_call",
        priority: "high",
        title: `Take attendance for ${String(classroomById.get(classroomId)?.name ?? "today's class")}`,
        description: `${marked}/${expected} students have attendance marked for today.`,
        recommended_action: "Open Attendance and save the roll call.",
        classroom_id: classroomId,
        due_at: `${today}T${String(slot.start_time ?? "00:00")}:00Z`,
        metadata: { schedule_id: String(slot.id), date: today },
      });
    }
  }

  for (const row of pipeline) {
    if (row.stage === "placement") {
      actionCandidates.push({
        dedupe_key: `placement_needed:${row.contact_id}`,
        source_type: "placement_needed",
        priority: "medium",
        title: `Place ${row.name}`,
        description: "No placement level is recorded yet.",
        recommended_action: "Record a diagnostic score or manual CEFR level.",
        contact_id: row.contact_id,
        metadata: {},
      });
    }
    if (row.status === "trial" && ruleIsActive(rules, "trial_conversion_follow_up")) {
      actionCandidates.push({
        dedupe_key: `trial_follow_up:${row.contact_id}`,
        source_type: "trial_follow_up",
        priority: "medium",
        title: `Convert trial student ${row.name}`,
        description: "Trial students should have a clear enrollment or follow-up next step.",
        recommended_action: "Send a follow-up, create payment, or enroll into the right classroom.",
        contact_id: row.contact_id,
        metadata: {},
      });
    }
    if (row.pending_amount > 0 || row.entitlement_expires_at) {
      actionCandidates.push({
        dedupe_key: `renewal:${row.contact_id}`,
        source_type: "renewal",
        priority: row.pending_amount > 0 ? "high" : "medium",
        title: `Renew or collect payment for ${row.name}`,
        description: row.pending_amount > 0 ? `Pending balance: ${row.pending_amount.toLocaleString()}.` : `Entitlement expires ${row.entitlement_expires_at?.slice(0, 10)}.`,
        recommended_action: "Open payments, collect tuition, or grant the next offer.",
        contact_id: row.contact_id,
        due_at: row.entitlement_expires_at,
        metadata: { pending_amount: row.pending_amount },
      });
    }
    if (row.certificate_ready && ruleIsActive(rules, "course_completion_certificate")) {
      actionCandidates.push({
        dedupe_key: `certificate_ready:${row.contact_id}:${row.classroom_ids[0] ?? "academy"}`,
        source_type: "certificate_ready",
        priority: "low",
        title: `${row.name} is ready for completion`,
        description: `Composite score ${row.composite_score ?? "-"}% with required work submitted.`,
        recommended_action: "Issue a certificate and recommend the next class.",
        contact_id: row.contact_id,
        classroom_id: row.classroom_ids[0] ?? null,
        metadata: { composite_score: row.composite_score },
      });
    }
  }

  const actionQueue = await syncEducationActionItems(sb, academyId, actionCandidates);

  const calendarEvents: EducationCalendarEvent[] = [];
  for (let offset = 0; offset <= 13; offset++) {
    const day = addDays(now, offset);
    const dayDate = dateOnly(day);
    const dow = day.getUTCDay();
    for (const slot of schedules.filter((item) => Number(item.day_of_week) === dow)) {
      const classroomId = String(slot.classroom_id ?? "");
      calendarEvents.push({
        id: `class:${String(slot.id)}:${dayDate}`,
        type: "class",
        title: `${String(classroomById.get(classroomId)?.name ?? "Class")} ${slot.label ? `- ${String(slot.label)}` : ""}`.trim(),
        starts_at: `${dayDate}T${String(slot.start_time ?? "00:00")}:00`,
        ends_at: slot.end_time ? `${dayDate}T${String(slot.end_time)}:00` : null,
        classroom_id: classroomId,
        contact_id: null,
        priority: "medium",
        metadata: { timezone: String(slot.timezone ?? "UTC"), schedule_id: String(slot.id) },
      });
    }
  }

  for (const assignment of assignments) {
    const dueAt = String(assignment.due_at ?? "");
    if (!dueAt || dueAt > in30 || dueAt < addDays(now, -7).toISOString()) continue;
    const classroomId = String(assignment.classroom_id ?? "");
    calendarEvents.push({
      id: `assignment:${String(assignment.id)}`,
      type: "assignment_due",
      title: `Due: ${String(assignment.title ?? "Assignment")}`,
      starts_at: dueAt,
      ends_at: null,
      classroom_id: classroomId,
      contact_id: null,
      priority: dueAt < now.toISOString() ? "high" : "medium",
      metadata: { assignment_id: String(assignment.id), classroom_name: String(classroomById.get(classroomId)?.name ?? "") },
    });
  }

  for (const notification of notifications) {
    const scheduledAt = String(notification.scheduled_at ?? "");
    if (!scheduledAt || scheduledAt > in14) continue;
    calendarEvents.push({
      id: `notification:${String(notification.id)}`,
      type: "notification",
      title: String(notification.title ?? notification.type ?? "Notification"),
      starts_at: scheduledAt,
      ends_at: null,
      classroom_id: null,
      contact_id: notification.contact_id ? String(notification.contact_id) : null,
      priority: String(notification.status) === "failed" ? "high" : "low",
      metadata: { channel: String(notification.channel ?? ""), status: String(notification.status ?? "") },
    });
  }

  for (const item of actionQueue.slice(0, 80)) {
    const dueAt = String(item.due_at ?? "");
    if (!dueAt) continue;
    calendarEvents.push({
      id: `action:${String(item.id)}`,
      type: "action",
      title: String(item.title ?? "Action item"),
      starts_at: dueAt,
      ends_at: null,
      classroom_id: item.classroom_id ? String(item.classroom_id) : null,
      contact_id: item.contact_id ? String(item.contact_id) : null,
      priority: String(item.priority ?? "medium"),
      metadata: { action_item_id: String(item.id), source_type: String(item.source_type ?? "") },
    });
  }

  calendarEvents.sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const insights: EducationInsight[] = [];
  const highPriorityActions = actionQueue.filter((item) => ["critical", "high"].includes(String(item.priority))).length;
  if (highPriorityActions > 0) {
    insights.push({
      id: "high-priority-actions",
      type: "queue",
      severity: highPriorityActions >= 10 ? "critical" : "high",
      title: "High-priority queue needs attention",
      detail: `${highPriorityActions} urgent item(s) are open across the academy.`,
      recommended_action: "Start with the Today queue and resolve attendance, risk, and payment items first.",
      metric: highPriorityActions,
    });
  }

  const gradeBacklog = gradingCandidates.length;
  if (gradeBacklog > 0) {
    insights.push({
      id: "grading-backlog",
      type: "learning",
      severity: gradeBacklog >= 20 ? "high" : "medium",
      title: "Grading backlog is building",
      detail: `${gradeBacklog} submission(s) are waiting for grades.`,
      recommended_action: "Batch-grade the oldest submissions and send feedback.",
      metric: gradeBacklog,
    });
  }

  for (const classroom of classrooms) {
    const classroomId = String(classroom.id);
    const classAttendance = attendance.filter((item) => String(item.classroom_id) === classroomId);
    if (classAttendance.length < 4) continue;
    const presentCount = classAttendance.filter((item) => ["present", "late"].includes(String(item.status))).length;
    const rate = Math.round((presentCount / classAttendance.length) * 100);
    if (rate < 75) {
      insights.push({
        id: `attendance-${classroomId}`,
        type: "attendance",
        severity: rate < 60 ? "high" : "medium",
        title: `${String(classroom.name ?? "Classroom")} attendance is weak`,
        detail: `Recent attendance is ${rate}%.`,
        recommended_action: "Run attendance follow-up and contact absent students.",
        metric: rate,
        classroom_id: classroomId,
      });
    }
  }

  const placementGap = pipeline.filter((row) => row.stage === "placement").length;
  if (placementGap > 0) {
    insights.push({
      id: "placement-gap",
      type: "growth",
      severity: placementGap >= 10 ? "high" : "medium",
      title: "Students are waiting for placement",
      detail: `${placementGap} student(s) need level placement before the next class decision.`,
      recommended_action: "Record diagnostic scores and move them into matching classrooms.",
      metric: placementGap,
    });
  }

  const disabledRules = rules.filter((rule) => rule.is_active === false).length;
  if (disabledRules > 0) {
    insights.push({
      id: "disabled-automation",
      type: "automation",
      severity: "low",
      title: "Some automations are disabled",
      detail: `${disabledRules} automation rule(s) are off.`,
      recommended_action: "Review the automation panel and turn on the rules that match academy policy.",
      metric: disabledRules,
    });
  }

  if (certificateCandidates.length > 0) {
    insights.push({
      id: "completion-ready",
      type: "completion",
      severity: "positive",
      title: "Students are ready to complete",
      detail: `${certificateCandidates.length} student(s) appear ready for a certificate or next course.`,
      recommended_action: "Issue certificates and offer the next level.",
      metric: certificateCandidates.length,
    });
  }

  return {
    generated_at: now.toISOString(),
    action_queue: actionQueue,
    pipeline,
    pipeline_counts: pipelineCounts,
    automation_rules: rules,
    calendar_events: calendarEvents.slice(0, 300),
    intelligence: insights.slice(0, 30),
    stats: {
      open_actions: actionQueue.length,
      urgent_actions: highPriorityActions,
      grading_backlog: gradeBacklog,
      certificate_ready: certificateCandidates.length,
      placement_gap: placementGap,
    },
  };
};

// ── Engagement maintenance (shared by manual actions + cron worker) ───────────

const filterEducationOSForAccess = async (
  sb: SupabaseClientLike,
  academyId: string,
  access: MembershipRow,
  os: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const scopedClassroomIds = academyAccessClassroomIds(access);
  const scopedContactIds = await loadScopedContactIds(sb, academyId, scopedClassroomIds);
  const canSeeFinance = academyAccessHas(access, "manageFinance");
  const canManageAutomation = academyAccessHas(access, "manageAutomation");
  const canIssueCertificates = academyAccessHas(access, "issueCertificates");
  const canUseGrowthOps = academyAccessHas(access, "viewReports");
  const allowedTeacherActionSources = new Set([
    "alert",
    "grading_backlog",
    "missing_assignment",
    "schedule_gap",
    "attendance_roll_call",
  ]);

  const classroomAllowed = (value: unknown): boolean => {
    const classroomId = normalizeText(value, 64);
    if (!classroomId) return scopedClassroomIds === null;
    return scopedClassroomIds === null || scopedClassroomIds.includes(classroomId);
  };

  const contactAllowed = (value: unknown): boolean => {
    const contactId = normalizeText(value, 64);
    if (!contactId) return scopedContactIds === null;
    return scopedContactIds === null || scopedContactIds.has(contactId);
  };

  const rowAllowed = (row: Record<string, unknown>): boolean => {
    const classroomId = normalizeText(row.classroom_id, 64);
    const contactId = normalizeText(row.contact_id, 64);
    if (classroomId && !classroomAllowed(classroomId)) return false;
    if (contactId && !contactAllowed(contactId)) return false;
    if (!classroomId && !contactId && scopedClassroomIds !== null) return false;
    return true;
  };

  const actionQueue = ((os.action_queue ?? []) as Array<Record<string, unknown>>)
    .filter(rowAllowed)
    .filter((item) => {
      const sourceType = normalizeText(item.source_type, 80);
      if (!canSeeFinance && ["renewal", "payment", "payment_due"].includes(sourceType)) return false;
      if (!canIssueCertificates && sourceType === "certificate_ready") return false;
      if (scopedClassroomIds !== null && !allowedTeacherActionSources.has(sourceType)) return false;
      return true;
    });

  const pipeline = ((os.pipeline ?? []) as Array<Record<string, unknown>>)
    .filter((row) => {
      const contactId = normalizeText(row.contact_id, 64);
      if (contactId && !contactAllowed(contactId)) return false;
      if (scopedClassroomIds === null) return true;
      const classroomIds = toStringArray(row.classroom_ids);
      return classroomIds.some((classroomId) => scopedClassroomIds.includes(classroomId));
    })
    .map((row) => {
      if (canSeeFinance) return row;
      return {
        ...row,
        pending_amount: 0,
        entitlement_expires_at: null,
      };
    });

  const pipelineCounts = pipeline.reduce<Record<string, number>>((acc, row) => {
    const stage = normalizeText(row.stage, 40) || "enrolled";
    acc[stage] = (acc[stage] ?? 0) + 1;
    return acc;
  }, { lead: 0, placement: 0, enrolled: 0, learning: 0, attention: 0, renewal: 0, completion: 0 } as Record<string, number>);

  const calendarEvents = ((os.calendar_events ?? []) as Array<Record<string, unknown>>)
    .filter(rowAllowed)
    .filter((event) => {
      const eventType = normalizeText(event.type, 80);
      if (!canSeeFinance && ["payment", "renewal", "notification"].includes(eventType)) return false;
      return true;
    });

  const intelligence = ((os.intelligence ?? []) as Array<Record<string, unknown>>)
    .filter((insight) => {
      if (!rowAllowed(insight)) return false;
      const type = normalizeText(insight.type, 80);
      if (!canSeeFinance && ["revenue", "renewal", "payment"].includes(type)) return false;
      if (!canManageAutomation && type === "automation") return false;
      if (!canUseGrowthOps && ["growth", "queue"].includes(type) && scopedClassroomIds !== null) return false;
      return scopedClassroomIds === null || Boolean(insight.classroom_id || insight.contact_id) || ["learning", "attendance"].includes(type);
    });

  const gradingBacklog = actionQueue.filter((item) => normalizeText(item.source_type, 80) === "grading_backlog").length;
  const certificateReady = pipeline.filter((row) => row.certificate_ready === true).length;
  const placementGap = pipeline.filter((row) => normalizeText(row.stage, 40) === "placement").length;
  const highPriorityActions = actionQueue.filter((item) => ["critical", "high"].includes(String(item.priority))).length;

  return {
    ...os,
    access: academyAccessProfile(access),
    action_queue: actionQueue,
    pipeline,
    pipeline_counts: pipelineCounts,
    automation_rules: canManageAutomation ? os.automation_rules ?? [] : [],
    calendar_events: calendarEvents,
    intelligence,
    stats: {
      open_actions: actionQueue.filter((item) => String(item.status ?? "open") === "open").length,
      urgent_actions: highPriorityActions,
      grading_backlog: gradingBacklog,
      certificate_ready: canIssueCertificates ? certificateReady : 0,
      placement_gap: placementGap,
    },
  };
};

type AtRiskEntry = {
  contact_id: string;
  name: string;
  attendance_rate: number | null;
  missing: number;
  severity: string;
  reasons: string[];
};

const computeAtRiskForAcademy = async (
  sb: SupabaseClientLike,
  academyId: string,
  classroomId: string | null = null,
): Promise<{ atRisk: AtRiskEntry[]; scanned: number }> => {
  const sinceIso = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  let memQuery = sb.from("academy_classroom_memberships")
    .select("contact_id, classroom_id, academy_contacts(id, first_name, last_name, email, telegram_id, status, notify_enabled)")
    .eq("academy_id", academyId).in("role", ["student", "observer"]).limit(5000);
  if (classroomId) memQuery = memQuery.eq("classroom_id", classroomId);
  const { data: memberRows } = await memQuery;

  const members = (memberRows ?? []) as Array<Record<string, unknown>>;
  const contactIds = Array.from(new Set(members.map((m) => String((m.academy_contacts as any)?.id ?? m.contact_id ?? "")).filter(Boolean)));
  const classroomIds = Array.from(new Set(members.map((m) => String(m.classroom_id)).filter(Boolean)));
  if (contactIds.length === 0) return { atRisk: [], scanned: 0 };

  const [attRes, subRes, asgnRes] = await Promise.all([
    sb.from("academy_attendance").select("contact_id, status, session_date").eq("academy_id", academyId).in("contact_id", contactIds).gte("session_date", sinceIso).limit(20000),
    sb.from("academy_submissions").select("contact_id, assignment_id, status").eq("academy_id", academyId).in("contact_id", contactIds).limit(20000),
    sb.from("academy_assignments").select("id, classroom_id, due_at, status").eq("academy_id", academyId).in("classroom_id", classroomIds.length > 0 ? classroomIds : ["none"]).eq("status", "active").limit(2000),
  ]);

  const attendance = (attRes.data ?? []) as Array<Record<string, unknown>>;
  const submissions = (subRes.data ?? []) as Array<Record<string, unknown>>;
  const assignments = (asgnRes.data ?? []) as Array<Record<string, unknown>>;

  const dueAssignmentsByClassroom = new Map<string, string[]>();
  for (const a of assignments) {
    if (!a.due_at || new Date(String(a.due_at)) >= new Date()) continue;
    const cid = String(a.classroom_id);
    if (!dueAssignmentsByClassroom.has(cid)) dueAssignmentsByClassroom.set(cid, []);
    dueAssignmentsByClassroom.get(cid)!.push(String(a.id));
  }
  const submittedKey = new Set(submissions.filter((s) => s.status !== "missing").map((s) => `${s.contact_id}__${s.assignment_id}`));

  const atRisk: AtRiskEntry[] = [];
  const memberByContact = new Map<string, Record<string, unknown>>();
  for (const m of members) {
    const c = (m.academy_contacts as Record<string, unknown>) ?? {};
    const cid = String(c.id ?? m.contact_id ?? "");
    if (cid && !memberByContact.has(cid)) memberByContact.set(cid, { contact: c, classroom_id: String(m.classroom_id) });
  }

  for (const [contactId, info] of memberByContact) {
    const c = (info as any).contact as Record<string, unknown>;
    const classroom = String((info as any).classroom_id);
    const att = attendance.filter((a) => String(a.contact_id) === contactId);
    const present = att.filter((a) => a.status === "present" || a.status === "late").length;
    const attendanceRate = att.length >= 4 ? Math.round((present / att.length) * 100) : null;

    const dueIds = dueAssignmentsByClassroom.get(classroom) ?? [];
    const missing = dueIds.filter((aid) => !submittedKey.has(`${contactId}__${aid}`)).length;

    const reasons: string[] = [];
    if (attendanceRate !== null && attendanceRate < 70) reasons.push(`Attendance ${attendanceRate}%`);
    if (missing >= 3) reasons.push(`${missing} missing assignments`);
    if (reasons.length === 0) continue;

    const severity = (attendanceRate !== null && attendanceRate < 50) || missing >= 5 ? "high" : "medium";
    atRisk.push({ contact_id: contactId, name: `${String(c.first_name ?? "")} ${String(c.last_name ?? "")}`.trim(), attendance_rate: attendanceRate, missing, severity, reasons });

    const { data: existingAlert } = await sb.from("academy_alerts")
      .select("id").eq("academy_id", academyId).eq("contact_id", contactId).eq("type", "at_risk").eq("resolved", false).maybeSingle();
    if (!existingAlert?.id) {
      await sb.from("academy_alerts").insert({
        academy_id: academyId, contact_id: contactId, type: "at_risk", severity,
        message: `At risk: ${reasons.join("; ")}`, metadata: { attendance_rate: attendanceRate, missing, classroom_id: classroom },
      });
      const telegram = normalizeText(c.telegram_id, 120);
      if (telegram && c.notify_enabled !== false) {
        await sb.from("academy_notifications").insert({
          academy_id: academyId, contact_id: contactId, channel: "telegram", type: "at_risk",
          title: "Let's get back on track", body: `Hi ${String(c.first_name ?? "")}, your teacher noticed: ${reasons.join("; ")}. Check your assignments in the Schood app.`,
          target: telegram, status: "queued", scheduled_at: nowIso,
        });
      }
    }
  }

  return { atRisk, scanned: memberByContact.size };
};

const dispatchQueuedNotifications = async (
  sb: SupabaseClientLike,
  academyId: string | null = null,
): Promise<{ sent: number; failed: number; skipped: number; processed: number }> => {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  let q = sb.from("academy_notifications")
    .select("id, channel, type, title, body, target, attempts")
    .eq("status", "queued").lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true }).limit(200);
  if (academyId) q = q.eq("academy_id", academyId);
  const { data: queued } = await q;

  let sent = 0, failed = 0, skipped = 0;
  for (const n of (queued ?? []) as Array<Record<string, unknown>>) {
    const id = String(n.id);
    const target = normalizeText(n.target, 120);
    if (n.channel === "telegram") {
      if (!botToken) { await sb.from("academy_notifications").update({ status: "skipped", error: "TELEGRAM_BOT_TOKEN not set" }).eq("id", id); skipped++; continue; }
      if (!target) { await sb.from("academy_notifications").update({ status: "skipped", error: "No telegram target" }).eq("id", id); skipped++; continue; }
      try {
        const text = `${n.title ? `*${String(n.title)}*\n` : ""}${String(n.body ?? "")}`;
        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: target, text, parse_mode: "Markdown" }),
        });
        if (res.ok) {
          await sb.from("academy_notifications").update({ status: "sent", sent_at: new Date().toISOString(), attempts: Number(n.attempts ?? 0) + 1 }).eq("id", id);
          sent++;
        } else {
          const detail = await res.text();
          await sb.from("academy_notifications").update({ status: Number(n.attempts ?? 0) >= 2 ? "failed" : "queued", error: detail.slice(0, 400), attempts: Number(n.attempts ?? 0) + 1 }).eq("id", id);
          failed++;
        }
      } catch (e) {
        await sb.from("academy_notifications").update({ status: "queued", error: String(e instanceof Error ? e.message : e).slice(0, 400), attempts: Number(n.attempts ?? 0) + 1 }).eq("id", id);
        failed++;
      }
    } else {
      await sb.from("academy_notifications").update({ status: "skipped", error: `Channel ${String(n.channel)} not enabled` }).eq("id", id);
      skipped++;
    }
  }
  return { sent, failed, skipped, processed: (queued ?? []).length };
};

// Queue reminders for assignments due in the next 24h (one per student, deduped).
const queueDueReminders = async (sb: SupabaseClientLike, academyIdFilter: string | null = null): Promise<number> => {
  const nowIso = new Date().toISOString();
  const in24hIso = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  let assignmentQuery = sb.from("academy_assignments")
    .select("id, academy_id, classroom_id, title, due_at")
    .eq("status", "active").gte("due_at", nowIso).lte("due_at", in24hIso).limit(2000);
  if (academyIdFilter) assignmentQuery = assignmentQuery.eq("academy_id", academyIdFilter);
  const { data: asgnRows } = await assignmentQuery;
  const assignments = (asgnRows ?? []) as Array<Record<string, unknown>>;
  if (assignments.length === 0) return 0;

  let queued = 0;
  for (const a of assignments) {
    const academyId = String(a.academy_id);
    const rules = await loadEducationAutomationRules(sb, academyId, null);
    if (!ruleIsActive(rules, "assignment_due_reminder")) continue;
    const channel = ruleChannel(rules, "assignment_due_reminder", "telegram");
    const classroomId = String(a.classroom_id);
    const assignmentId = String(a.id);

    const [{ data: members }, { data: subs }, { data: existing }] = await Promise.all([
      sb.from("academy_classroom_memberships").select("contact_id, academy_contacts(id, first_name, email, telegram_id, notify_enabled)").eq("academy_id", academyId).eq("classroom_id", classroomId).in("role", ["student", "observer"]).limit(1000),
      sb.from("academy_submissions").select("contact_id, status").eq("assignment_id", assignmentId).limit(2000),
      sb.from("academy_notifications").select("contact_id").eq("academy_id", academyId).eq("type", "assignment_due").eq("metadata->>assignment_id", assignmentId).limit(5000),
    ]);
    const submitted = new Set(((subs ?? []) as Array<Record<string, unknown>>).filter((s) => s.status !== "missing").map((s) => String(s.contact_id)));
    const reminded = new Set(((existing ?? []) as Array<Record<string, unknown>>).map((e) => String(e.contact_id)));

    for (const m of (members ?? []) as Array<Record<string, unknown>>) {
      const c = (m.academy_contacts as any) ?? {};
      const contactId = String(c.id ?? m.contact_id ?? "");
      if (!contactId || submitted.has(contactId) || reminded.has(contactId)) continue;
      const target = channel === "email" ? normalizeEmail(c.email) : normalizeText(c.telegram_id, 120);
      if ((!target && channel !== "inapp") || c.notify_enabled === false) continue;
      await sb.from("academy_notifications").insert({
        academy_id: academyId, contact_id: contactId, channel, type: "assignment_due",
        title: "Assignment due soon", body: `Reminder: "${String(a.title)}" is due ${new Date(String(a.due_at)).toLocaleString()}.`,
        target: target || null, status: "queued", scheduled_at: nowIso, metadata: { assignment_id: assignmentId, automation_rule: "assignment_due_reminder" },
      });
      queued++;
    }
  }
  return queued;
};

// Queue reminders for class sessions scheduled today (one per student per slot, deduped).
const queueClassReminders = async (sb: SupabaseClientLike, academyIdFilter: string | null = null): Promise<number> => {
  const now = new Date();
  const dow = now.getUTCDay();
  const today = now.toISOString().slice(0, 10);
  const nowIso = now.toISOString();

  let slotQuery = sb.from("academy_classroom_schedules")
    .select("id, academy_id, classroom_id, start_time, label").eq("is_active", true).eq("day_of_week", dow).limit(1000);
  if (academyIdFilter) slotQuery = slotQuery.eq("academy_id", academyIdFilter);
  const { data: slotRows } = await slotQuery;
  const slots = (slotRows ?? []) as Array<Record<string, unknown>>;
  if (slots.length === 0) return 0;

  let queued = 0;
  for (const slot of slots) {
    const academyId = String(slot.academy_id);
    const rules = await loadEducationAutomationRules(sb, academyId, null);
    if (!ruleIsActive(rules, "class_reminder")) continue;
    const channel = ruleChannel(rules, "class_reminder", "telegram");
    const classroomId = String(slot.classroom_id);
    const slotId = String(slot.id);

    const [{ data: members }, { data: existing }, { data: cl }] = await Promise.all([
      sb.from("academy_classroom_memberships").select("contact_id, academy_contacts(id, email, telegram_id, notify_enabled)").eq("academy_id", academyId).eq("classroom_id", classroomId).in("role", ["student", "observer"]).limit(1000),
      sb.from("academy_notifications").select("contact_id").eq("academy_id", academyId).eq("type", "class_reminder").eq("metadata->>slot_id", slotId).eq("metadata->>date", today).limit(5000),
      sb.from("academy_classrooms").select("name").eq("id", classroomId).maybeSingle(),
    ]);
    const reminded = new Set(((existing ?? []) as Array<Record<string, unknown>>).map((e) => String(e.contact_id)));
    const className = cl?.name ? `"${String(cl.name)}"` : "class";

    for (const m of (members ?? []) as Array<Record<string, unknown>>) {
      const c = (m.academy_contacts as any) ?? {};
      const contactId = String(c.id ?? m.contact_id ?? "");
      if (!contactId || reminded.has(contactId)) continue;
      const target = channel === "email" ? normalizeEmail(c.email) : normalizeText(c.telegram_id, 120);
      if ((!target && channel !== "inapp") || c.notify_enabled === false) continue;
      await sb.from("academy_notifications").insert({
        academy_id: academyId, contact_id: contactId, channel, type: "class_reminder",
        title: "Class today", body: `You have ${className} today at ${String(slot.start_time)}${slot.label ? ` (${String(slot.label)})` : ""}.`,
        target: target || null, status: "queued", scheduled_at: nowIso, metadata: { slot_id: slotId, date: today, automation_rule: "class_reminder" },
      });
      queued++;
    }
  }
  return queued;
};

const queueAttendanceFollowupsForAcademy = async (
  sb: SupabaseClientLike,
  academyId: string,
  rules: Array<Record<string, unknown>>,
): Promise<number> => {
  if (!ruleIsActive(rules, "attendance_follow_up")) return 0;
  const threshold = Math.max(1, ruleThreshold(rules, "attendance_follow_up", 2));
  const channel = ruleChannel(rules, "attendance_follow_up", "telegram");
  const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const period = `${since}:${new Date().toISOString().slice(0, 10)}`;
  const nowIso = new Date().toISOString();
  const [{ data: attendanceRows }, { data: existing }] = await Promise.all([
    sb.from("academy_attendance").select("contact_id, status").eq("academy_id", academyId).gte("session_date", since).limit(20000),
    sb.from("academy_notifications").select("contact_id").eq("academy_id", academyId).eq("type", "attendance_follow_up").eq("metadata->>period", period).limit(10000),
  ]);
  const existingContacts = new Set(((existing ?? []) as Array<Record<string, unknown>>).map((item) => String(item.contact_id)));
  const absences = new Map<string, number>();
  for (const record of (attendanceRows ?? []) as Array<Record<string, unknown>>) {
    if (String(record.status) !== "absent") continue;
    const contactId = String(record.contact_id ?? "");
    if (contactId) absences.set(contactId, (absences.get(contactId) ?? 0) + 1);
  }
  const contactIds = Array.from(absences.entries()).filter(([, count]) => count >= threshold).map(([contactId]) => contactId);
  if (contactIds.length === 0) return 0;

  const { data: contacts } = await sb.from("academy_contacts")
    .select("id, first_name, email, telegram_id, notify_enabled")
    .eq("academy_id", academyId)
    .in("id", contactIds)
    .limit(1000);

  let queued = 0;
  for (const contact of (contacts ?? []) as Array<Record<string, unknown>>) {
    const contactId = String(contact.id);
    if (existingContacts.has(contactId) || contact.notify_enabled === false) continue;
    const target = channel === "email" ? normalizeEmail(contact.email) : normalizeText(contact.telegram_id, 120);
    if (!target && channel !== "inapp") continue;
    const count = absences.get(contactId) ?? threshold;
    await sb.from("academy_notifications").insert({
      academy_id: academyId,
      contact_id: contactId,
      channel,
      type: "attendance_follow_up",
      title: "Attendance follow-up",
      body: `Hi ${String(contact.first_name ?? "") || "there"}, we noticed ${count} missed class sessions recently. Please contact your teacher so we can help you catch up.`,
      target: target || null,
      status: "queued",
      scheduled_at: nowIso,
      metadata: { period, absence_count: count, automation_rule: "attendance_follow_up" },
    });
    queued++;
  }
  return queued;
};

const runEducationAutomationRules = async (
  sb: SupabaseClientLike,
  academyId: string,
  userId: string | null = null,
): Promise<Record<string, unknown>> => {
  const rules = await loadEducationAutomationRules(sb, academyId, userId);
  const dueQueued = await queueDueReminders(sb, academyId);
  const classQueued = await queueClassReminders(sb, academyId);
  const attendanceQueued = await queueAttendanceFollowupsForAcademy(sb, academyId, rules);
  const riskResult = ruleIsActive(rules, "at_risk_scan")
    ? await computeAtRiskForAcademy(sb, academyId)
    : { atRisk: [], scanned: 0 };
  await buildEducationOS(sb, academyId, userId);

  const summary = {
    due_queued: dueQueued,
    class_queued: classQueued,
    attendance_queued: attendanceQueued,
    at_risk_flagged: riskResult.atRisk.length,
    at_risk_scanned: riskResult.scanned,
  };
  await sb.from("academy_automation_rules")
    .update({ last_run_at: new Date().toISOString(), last_run_summary: summary })
    .eq("academy_id", academyId);
  return summary;
};

const isAcademyTenant = (tenant: Record<string, unknown>): boolean => {
  const meta = toJsonObject(tenant.metadata);
  return String(tenant.type ?? "").toLowerCase() === "team" ||
    String(meta.service_family ?? "").toLowerCase() === "academy" ||
    meta.academy_service === true || meta.center_owned === true;
};

const runAcademyMaintenance = async (
  sb: SupabaseClientLike,
  cycle: string,
): Promise<Record<string, unknown>> => {
  if (cycle === "at_risk") {
    const { data: tenants } = await sb.from("tenants").select("id, type, metadata").limit(10000);
    let scanned = 0, flagged = 0, academies = 0;
    for (const t of (tenants ?? []) as Array<Record<string, unknown>>) {
      if (!isAcademyTenant(t)) continue;
      academies++;
      const r = await computeAtRiskForAcademy(sb, String(t.id));
      scanned += r.scanned;
      flagged += r.atRisk.length;
    }
    return { cycle: "at_risk", academies, scanned, flagged };
  }

  // Default "dispatch" cycle: queue reminders, then send everything pending.
  const dueQueued = await queueDueReminders(sb);
  const classQueued = await queueClassReminders(sb);
  const dispatch = await dispatchQueuedNotifications(sb, null);
  return { cycle: "dispatch", due_queued: dueQueued, class_queued: classQueued, ...dispatch };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const anonKey = getEnv("SUPABASE_ANON_KEY");
    const serviceRole = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

    // ── Cron worker path: authenticated via DB-managed x-worker-secret ────────
    const workerSecret = req.headers.get("x-worker-secret");
    if (workerSecret) {
      const { data: secretRow } = await sb
        .from("internal_runtime_secrets")
        .select("secret")
        .eq("key", "academy_worker_secret")
        .maybeSingle();
      if (!secretRow?.secret || String(secretRow.secret) !== workerSecret) {
        return json(401, { error: "Unauthorized" });
      }
      const cronBody = req.method === "POST" ? await req.json().catch(() => ({})) : {};
      const cycle = normalizeText((cronBody as Record<string, unknown>)?.worker_cycle, 30).toLowerCase() || "dispatch";
      const result = await runAcademyMaintenance(sb, cycle);
      return json(200, { ok: true, ...result });
    }

    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Unauthorized" });

    const authSb = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });

    const { data: authData, error: authError } = await authSb.auth.getUser(token);
    if (authError || !authData?.user) return json(401, { error: "Unauthorized" });

    const userId = authData.user.id;
    const userEmail = authData.user.email ?? null;
    const url = new URL(req.url);
    const actionQuery = normalizeText(url.searchParams.get("action"), 64).toLowerCase();
    const body = req.method === "POST" ? (await req.json()) as StudioBody : null;
    const actionBody = normalizeText(body?.action, 64).toLowerCase();
    const requestedAction = actionBody || actionQuery;

    if (requestedAction === "student-feed") {
      return await loadStudentFeed(sb, userId, userEmail);
    }
    if (requestedAction === "student-dashboard") {
      return await loadStudentDashboard(sb, userId, userEmail);
    }

    const memberships = await loadMemberships(sb, userId, userEmail);

    if (requestedAction === "classroom-chat") {
      const academyId =
        req.method === "POST"
          ? normalizeText(body?.academy_id, 64) || null
          : normalizeText(url.searchParams.get("academy_id"), 64) || null;
      const classroomId =
        req.method === "POST"
          ? normalizeText(body?.classroom_id, 64) || null
          : normalizeText(url.searchParams.get("classroom_id"), 64) || null;
      return await loadClassroomChat(sb, memberships, userId, userEmail, academyId, classroomId);
    }

    if (requestedAction === "classroom-chat-send") {
      if (req.method !== "POST") return json(405, { error: "Method not allowed" });
      return await sendClassroomChatMessage(
        sb,
        memberships,
        userId,
        userEmail,
        normalizeText(body?.academy_id, 64) || null,
        normalizeText(body?.classroom_id, 64) || null,
        normalizeText(body?.content ?? body?.description, 6000) || null,
      );
    }

    if (requestedAction === "classroom-resource-upsert") {
      if (req.method !== "POST") return json(405, { error: "Method not allowed" });
      return await upsertClassroomResource(
        sb,
        memberships,
        userId,
        userEmail,
        normalizeText(body?.academy_id, 64) || null,
        normalizeText(body?.classroom_id, 64) || null,
        normalizeText(body?.id, 64) || null,
        normalizeText(body?.title ?? body?.name, 220) || null,
        normalizeText(body?.type, 20) || null,
        normalizeText(body?.url, 2000) || null,
        normalizeText(body?.description ?? body?.content, 4000) || null,
        body?.sort_order,
        body?.is_published,
        body?.metadata,
      );
    }

    if (requestedAction === "classroom-resource-delete") {
      if (req.method !== "POST") return json(405, { error: "Method not allowed" });
      return await deleteClassroomResource(
        sb,
        memberships,
        userId,
        userEmail,
        normalizeText(body?.academy_id, 64) || null,
        normalizeText(body?.classroom_id, 64) || null,
        normalizeText(body?.id, 64) || null,
      );
    }

    if (requestedAction === "classroom-resource-progress-set") {
      if (req.method !== "POST") return json(405, { error: "Method not allowed" });
      return await setClassroomResourceProgress(
        sb,
        memberships,
        userId,
        userEmail,
        normalizeText(body?.academy_id, 64) || null,
        normalizeText(body?.classroom_id, 64) || null,
        normalizeText(body?.resource_id, 64) || null,
        body?.completed,
        normalizeText(body?.contact_id, 64) || null,
      );
    }

    // ── Student: list assignments + submission status ────────────────────────
    if (requestedAction === "student_assignments") {
      let contacts: Array<Record<string, unknown>> = [];
      try { contacts = await loadStudentContacts(sb, userId, userEmail); } catch { return json(500, { error: "Failed to load contacts" }); }
      if (contacts.length === 0) return json(200, { assignments: [] });

      const academyIdParam = normalizeText(req.method === "POST" ? body?.academy_id : url.searchParams.get("academy_id"), 64);
      const classroomIdParam = normalizeText(req.method === "POST" ? body?.classroom_id : url.searchParams.get("classroom_id"), 64);
      const contact = contacts.find((c) => !academyIdParam || String(c.academy_id) === academyIdParam) ?? contacts[0];
      const contactAcademyId = String(contact.academy_id);
      const contactId = String(contact.id);

      let assignmentsQuery = sb.from("academy_assignments")
        .select("id, academy_id, classroom_id, title, description, assignment_type, experience_url, due_at, released_at, max_score, score_weight, status, metadata, created_at")
        .eq("academy_id", contactAcademyId).eq("status", "active").order("position", { ascending: true }).limit(500);
      if (classroomIdParam) assignmentsQuery = assignmentsQuery.eq("classroom_id", classroomIdParam);

      const [assignmentsRes, submissionsRes, membershipsRes] = await Promise.all([
        assignmentsQuery,
        sb.from("academy_submissions")
          .select("id, assignment_id, score, max_score, status, submitted_at, graded_at, notes, submission_content, submission_url")
          .eq("academy_id", contactAcademyId).eq("contact_id", contactId).limit(1000),
        sb.from("academy_classroom_memberships").select("classroom_id").eq("academy_id", contactAcademyId).eq("contact_id", contactId).limit(100),
      ]);

      if (assignmentsRes.error) return json(500, { error: "Failed to load assignments" });
      const enrolledClassrooms = new Set((membershipsRes.data ?? []).map((m: any) => String(m.classroom_id)));
      const subMap = new Map<string, Record<string, unknown>>();
      for (const s of (submissionsRes.data ?? []) as Array<Record<string, unknown>>) {
        subMap.set(String(s.assignment_id), s);
      }

      const assignments = ((assignmentsRes.data ?? []) as Array<Record<string, unknown>>)
        .filter((a) => enrolledClassrooms.has(String(a.classroom_id)))
        .map((a) => ({ ...a, submission: subMap.get(String(a.id)) ?? null }));

      return json(200, { assignments, contact_id: contactId, academy_id: contactAcademyId });
    }

    // ── Student: submit an assignment ────────────────────────────────────────
    if (requestedAction === "submit_assignment" && req.method === "POST" && !normalizeText(body?.contact_id, 64)) {
      let contacts: Array<Record<string, unknown>> = [];
      try { contacts = await loadStudentContacts(sb, userId, userEmail); } catch { return json(500, { error: "Failed to load contacts" }); }
      if (contacts.length === 0) return json(403, { error: "No academy enrollment found" });

      const assignmentId = normalizeText(body?.assignment_id, 64);
      if (!assignmentId) return json(400, { error: "assignment_id is required" });

      const { data: asgn } = await sb.from("academy_assignments")
        .select("id, academy_id, classroom_id, max_score, status")
        .eq("id", assignmentId).maybeSingle();
      if (!asgn?.id) return json(404, { error: "Assignment not found" });
      if (asgn.status !== "active") return json(400, { error: "Assignment is not open for submission" });

      const contact = contacts.find((c) => String(c.academy_id) === String(asgn.academy_id));
      if (!contact) return json(403, { error: "Not enrolled in this academy" });
      const contactId = String(contact.id);

      // Verify classroom membership
      const { data: membership } = await sb.from("academy_classroom_memberships")
        .select("id").eq("classroom_id", asgn.classroom_id).eq("contact_id", contactId).maybeSingle();
      if (!membership?.id) return json(403, { error: "Not enrolled in this classroom" });

      const submissionContent = normalizeText(body?.content ?? body?.submission_content, 10000) || null;
      const submissionUrl = normalizeText(body?.url ?? body?.submission_url, 2000) || null;

      const payload = {
        academy_id: String(asgn.academy_id),
        assignment_id: assignmentId,
        classroom_id: String(asgn.classroom_id),
        contact_id: contactId,
        user_id: userId,
        submission_content: submissionContent,
        submission_url: submissionUrl,
        status: "submitted",
        submitted_at: new Date().toISOString(),
        notes: normalizeText(body?.notes, 500) || null,
        metadata: {},
      };

      const { data, error } = await sb.from("academy_submissions")
        .upsert(payload, { onConflict: "assignment_id,contact_id" })
        .select("id, assignment_id, contact_id, score, max_score, status, submitted_at, notes, submission_content, submission_url, updated_at")
        .maybeSingle();
      if (error) return json(500, { error: "Failed to submit assignment", detail: error.message });
      return json(200, { submission: data });
    }

    // ── Student: tuition / billing status ────────────────────────────────────
    if (requestedAction === "student_billing") {
      let contacts: Array<Record<string, unknown>> = [];
      try { contacts = await loadStudentContacts(sb, userId, userEmail); } catch { return json(500, { error: "Failed to load contacts" }); }
      if (contacts.length === 0) return json(200, { items: [] });

      const academyIds = Array.from(new Set(contacts.map((c) => String(c.academy_id)).filter(Boolean)));
      const contactIds = contacts.map((c) => String(c.id));

      const [membershipsRes, offersRes, entRes, paymentsRes] = await Promise.all([
        sb.from("academy_classroom_memberships").select("classroom_id, contact_id, academy_id").in("contact_id", contactIds).limit(2000),
        sb.from("academy_offers").select("id, academy_id, classroom_id, name, price_amount, currency, duration_days, description, is_active").in("academy_id", academyIds).eq("is_active", true).not("classroom_id", "is", null).limit(1000),
        sb.from("academy_entitlements").select("contact_id, resource_id, status, expires_at, resource_type").in("contact_id", contactIds).eq("resource_type", "classroom").limit(2000),
        sb.from("academy_payments").select("id, contact_id, offer_id, amount, currency, status, created_at").in("contact_id", contactIds).order("created_at", { ascending: false }).limit(2000),
      ]);

      const memberships = (membershipsRes.data ?? []) as Array<Record<string, unknown>>;
      const offers = (offersRes.data ?? []) as Array<Record<string, unknown>>;
      const activeClassroomEnt = new Set(
        ((entRes.data ?? []) as Array<Record<string, unknown>>)
          .filter((e) => String(e.status) === "active" && (!e.expires_at || new Date(String(e.expires_at)) > new Date()))
          .map((e) => `${e.contact_id}__${e.resource_id}`),
      );
      const lastPaymentByOffer = new Map<string, Record<string, unknown>>();
      for (const p of (paymentsRes.data ?? []) as Array<Record<string, unknown>>) {
        const key = `${p.contact_id}__${p.offer_id}`;
        if (!lastPaymentByOffer.has(key)) lastPaymentByOffer.set(key, p);
      }

      // For each (contact, classroom) the student is enrolled in that has a tuition offer.
      const items: Array<Record<string, unknown>> = [];
      for (const m of memberships) {
        const classroomId = String(m.classroom_id);
        const contactId = String(m.contact_id);
        const academyId = String(m.academy_id);
        const offer = offers.find((o) => String(o.classroom_id) === classroomId && String(o.academy_id) === academyId);
        if (!offer) continue; // free classroom, no billing
        const paid = activeClassroomEnt.has(`${contactId}__${classroomId}`);
        items.push({
          academy_id: academyId,
          classroom_id: classroomId,
          contact_id: contactId,
          offer,
          paid,
          last_payment: lastPaymentByOffer.get(`${contactId}__${offer.id}`) ?? null,
        });
      }

      return json(200, { items });
    }

    // ── Student: referral code + referrals ───────────────────────────────────
    if (requestedAction === "student_referral") {
      let contacts: Array<Record<string, unknown>> = [];
      try { contacts = await loadStudentContacts(sb, userId, userEmail); } catch { return json(500, { error: "Failed to load contacts" }); }
      if (contacts.length === 0) return json(200, { code: null, referrals: [] });

      const academyIdParam = normalizeText(req.method === "POST" ? body?.academy_id : url.searchParams.get("academy_id"), 64);
      const contact = contacts.find((c) => !academyIdParam || String(c.academy_id) === academyIdParam) ?? contacts[0];
      const contactAcademyId = String(contact.academy_id);
      const contactId = String(contact.id);

      // Find an existing self-code (referred_contact_id null), else create one.
      const { data: existing } = await sb.from("academy_referrals")
        .select("code").eq("academy_id", contactAcademyId).eq("referrer_contact_id", contactId).is("referred_contact_id", null).maybeSingle();

      let code = existing?.code ? String(existing.code) : "";
      if (!code) {
        const base = (String(contact.first_name ?? "").slice(0, 4) || "REF").toUpperCase().replace(/[^A-Z0-9]/g, "");
        for (let attempt = 0; attempt < 8 && !code; attempt++) {
          const candidate = `${base}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          const { error: insErr } = await sb.from("academy_referrals").insert({
            academy_id: contactAcademyId, referrer_contact_id: contactId, code: candidate, status: "pending",
          });
          if (!insErr) code = candidate;
        }
        if (!code) return json(500, { error: "Could not generate referral code" });
      }

      const { data: referrals } = await sb.from("academy_referrals")
        .select("id, referred_email, status, created_at, joined_at, referred_contact_id")
        .eq("academy_id", contactAcademyId).eq("referrer_contact_id", contactId).not("referred_contact_id", "is", null)
        .order("created_at", { ascending: false }).limit(100);

      return json(200, { code, academy_id: contactAcademyId, referrals: referrals ?? [] });
    }

    // ── Student: claim a referral code they were invited with ────────────────
    if (requestedAction === "claim_referral" && req.method === "POST") {
      let contacts: Array<Record<string, unknown>> = [];
      try { contacts = await loadStudentContacts(sb, userId, userEmail); } catch { return json(500, { error: "Failed to load contacts" }); }
      if (contacts.length === 0) return json(403, { error: "No academy enrollment found" });

      const code = normalizeText(body?.referral_code, 40).toUpperCase();
      if (!code) return json(400, { error: "referral_code is required" });

      // Find the referrer's self-code in any of the student's academies.
      for (const contact of contacts) {
        const contactAcademyId = String(contact.academy_id);
        const contactId = String(contact.id);
        const { data: referrer } = await sb.from("academy_referrals")
          .select("referrer_contact_id").eq("academy_id", contactAcademyId).eq("code", code).is("referred_contact_id", null).maybeSingle();
        if (!referrer?.referrer_contact_id) continue;
        if (String(referrer.referrer_contact_id) === contactId) return json(400, { error: "You cannot refer yourself" });

        const { error: insErr } = await sb.from("academy_referrals").insert({
          academy_id: contactAcademyId,
          referrer_contact_id: referrer.referrer_contact_id,
          code,
          referred_contact_id: contactId,
          referred_email: contact.email ?? null,
          status: "joined",
          joined_at: new Date().toISOString(),
        });
        if (insErr) return json(500, { error: "Failed to record referral", detail: insErr.message });
        return json(200, { ok: true, academy_id: contactAcademyId });
      }
      return json(404, { error: "Referral code not found in your academy" });
    }

    if (memberships.length === 0) return json(403, { error: "No active academy membership" });

    if (req.method === "GET") {
      const readResponse = await handleReadAction(
        sb,
        memberships,
        actionQuery,
        normalizeText(url.searchParams.get("academy_id"), 64) || null,
        normalizeText(url.searchParams.get("offer_id"), 64) || null,
        normalizeText(url.searchParams.get("classroom_id"), 64) || null,
        normalizeText(url.searchParams.get("contact_id"), 64) || null,
        normalizeText(url.searchParams.get("conversation_id"), 64) || null,
        normalizeText(url.searchParams.get("assignment_id"), 64) || null,
      );
      if (readResponse) return readResponse;
    }

    if (req.method === "POST") {
      const readResponse = await handleReadAction(
        sb,
        memberships,
        actionBody,
        normalizeText(body?.academy_id, 64) || null,
        normalizeText(body?.offer_id, 64) || null,
        normalizeText(body?.classroom_id, 64) || null,
        normalizeText(body?.contact_id, 64) || null,
        normalizeText(body?.conversation_id, 64) || null,
        normalizeText(body?.assignment_id, 64) || null,
      );
      if (readResponse) return readResponse;

      if (actionBody === "create_academy") {
        const academyName = normalizeText(body?.name, 160);
        const explicitSlug = normalizeText(body?.slug, 120);
        if (!academyName) return json(400, { error: "name is required" });

        const baseSlug = slugify(explicitSlug || academyName, `academy-${String(userId).slice(0, 8)}`);
        let slugCandidate = baseSlug;
        let suffix = 0;
        let existingSlug = true;

        while (existingSlug && suffix < 100) {
          const { data: slugRow, error: slugError } = await sb
            .from("tenants")
            .select("id")
            .eq("slug", slugCandidate)
            .maybeSingle();
          if (slugError) return json(500, { error: "Failed to check academy slug", detail: slugError.message });
          existingSlug = !!slugRow?.id;
          if (!existingSlug) break;
          suffix += 1;
          slugCandidate = `${baseSlug}-${suffix}`;
        }

        if (existingSlug) return json(500, { error: "Could not reserve a unique academy slug" });

        const { data: academyRow, error: academyError } = await sb
          .from("tenants")
          .insert({
            name: academyName,
            slug: slugCandidate,
            type: "team",
            created_by: userId,
            metadata: {
              service_family: "academy",
              academy_service: true,
              created_from: "academy_app",
            },
          })
          .select("id, name, slug, type, metadata, created_at")
          .maybeSingle();
        if (academyError || !academyRow?.id) {
          return json(500, { error: "Failed to create academy", detail: academyError?.message ?? "Unknown error" });
        }

        const { error: membershipError } = await sb
          .from("tenant_memberships")
          .insert({
            tenant_id: academyRow.id,
            user_id: userId,
            role: "owner",
            status: "active",
          });
        if (membershipError) {
          return json(500, { error: "Academy created, but membership failed", detail: membershipError.message });
        }

        return json(200, {
          academy: {
            id: String(academyRow.id),
            name: String(academyRow.name ?? academyName),
            slug: String(academyRow.slug ?? slugCandidate),
            type: String(academyRow.type ?? "team"),
            metadata: toJsonObject(academyRow.metadata),
            created_at: String(academyRow.created_at ?? ""),
            role: "owner",
            status: "active",
            access: academyAccessProfile({
              tenant_id: String(academyRow.id),
              role: "owner",
              status: "active",
              source: "tenant",
              classroom_ids: [],
            }),
          },
        });
      }

      const academyId = resolveAcademyId(memberships, normalizeText(body?.academy_id, 64) || null);
      const access = requireAcademyAccess(memberships, academyId);
      const actionPermissions: Record<string, keyof AcademyAccessPermissions> = {
        resolve_action_item: "resolveActionItems",
        set_lifecycle_stage: "manageContacts",
        upsert_automation_rule: "manageAutomation",
        run_automation_rules: "manageAutomation",
        update_academy_landing: "manageAcademy",
        update_classroom_landing: "manageClassrooms",
        upsert_contact: "manageContacts",
        create_classroom: "manageClassrooms",
        upsert_classroom_membership: "manageRoster",
        remove_classroom_membership: "manageRoster",
        send_message: "manageMessages",
        send_announcement: "manageAnnouncements",
        create_alert: "manageAlerts",
        resolve_alert: "resolveAlerts",
        create_offer: "manageOffers",
        upsert_offer_grant: "manageOffers",
        create_payment: "manageFinance",
        mark_payment_paid: "manageFinance",
        grant_contact: "manageFinance",
        create_assignment: "manageAssignments",
        update_assignment: "manageAssignments",
        submit_assignment: "manageAssignments",
        grade_submission: "gradeSubmissions",
        mark_attendance: "markAttendance",
        bulk_invite: "manageRoster",
        update_classroom_settings: "manageClassrooms",
        export_gradebook: "gradeSubmissions",
        upsert_schedule: "manageSchedule",
        delete_schedule: "manageSchedule",
        record_placement: "manageContacts",
        upsert_staff: "manageStaff",
        remove_staff: "manageStaff",
        issue_academy_certificate: "issueCertificates",
        compute_at_risk: "viewEducationOS",
        dispatch_notifications: "dispatchNotifications",
        generate_parent_report: "viewReports",
        upsert_branding: "manageBranding",
      };
      const requiredPermission = actionPermissions[actionBody];
      if (requiredPermission) requireAcademyPermission(access, requiredPermission);

      if (actionBody === "resolve_action_item") {
        const actionItemId = normalizeText(body?.id, 64);
        const nextStatus = normalizeText(body?.status, 20).toLowerCase() || "resolved";
        if (!actionItemId) return json(400, { error: "id is required" });
        if (!["resolved", "dismissed", "snoozed", "open"].includes(nextStatus)) return json(400, { error: "Invalid action item status" });

        const { data: existingAction, error: existingActionError } = await sb.from("academy_action_items")
          .select("id, source_type, contact_id, classroom_id")
          .eq("academy_id", academyId)
          .eq("id", actionItemId)
          .maybeSingle();
        if (existingActionError) return json(500, { error: "Failed to load action item", detail: existingActionError.message });
        if (!existingAction?.id) return json(404, { error: "Action item not found" });
        const sourceType = normalizeText(existingAction.source_type, 80);
        if (!academyAccessHas(access, "manageFinance") && ["renewal", "payment", "payment_due"].includes(sourceType)) {
          return json(403, { error: "Forbidden" });
        }
        if (!academyAccessHas(access, "issueCertificates") && sourceType === "certificate_ready") {
          return json(403, { error: "Forbidden" });
        }
        if (existingAction.classroom_id && !accessCanUseClassroom(access, existingAction.classroom_id)) {
          return json(403, { error: "Forbidden" });
        }
        if (existingAction.contact_id) {
          await ensureContactInAccessScope(sb, academyId, access, existingAction.contact_id);
        }
        if (!existingAction.classroom_id && !existingAction.contact_id && academyAccessClassroomIds(access) !== null) {
          return json(403, { error: "Forbidden" });
        }

        const patch: Record<string, unknown> = {
          status: nextStatus,
          resolution_note: normalizeText(body?.resolution_note, 500) || null,
        };
        if (["resolved", "dismissed"].includes(nextStatus)) {
          patch.resolved_at = new Date().toISOString();
          patch.resolved_by = userId;
        } else {
          patch.resolved_at = null;
          patch.resolved_by = null;
        }

        const { data, error } = await sb.from("academy_action_items")
          .update(patch)
          .eq("academy_id", academyId)
          .eq("id", actionItemId)
          .select("id, academy_id, dedupe_key, source_type, priority, title, description, recommended_action, contact_id, classroom_id, due_at, status, metadata, created_at, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to update action item", detail: error.message });
        if (!data?.id) return json(404, { error: "Action item not found" });
        return json(200, { action_item: data });
      }

      if (actionBody === "set_lifecycle_stage") {
        const contactId = normalizeText(body?.contact_id, 64);
        const lifecycleStage = normalizeText(body?.lifecycle_stage, 30).toLowerCase();
        if (!contactId) return json(400, { error: "contact_id is required" });
        if (!["lead", "placement", "enrolled", "learning", "attention", "renewal", "completion"].includes(lifecycleStage)) {
          return json(400, { error: "Invalid lifecycle_stage" });
        }

        const { data, error } = await sb.from("academy_contacts")
          .update({ lifecycle_stage: lifecycleStage })
          .eq("academy_id", academyId)
          .eq("id", contactId)
          .select("id, academy_id, user_id, first_name, last_name, email, phone, telegram_id, status, last_activity_at, placement_level, placement_score, lifecycle_stage, notify_enabled, metadata, created_at, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to update lifecycle stage", detail: error.message });
        if (!data?.id) return json(404, { error: "Contact not found" });
        return json(200, { contact: data });
      }

      if (actionBody === "upsert_automation_rule") {
        const ruleKey = normalizeText(body?.rule_key, 80);
        if (!ruleKey) return json(400, { error: "rule_key is required" });
        await ensureDefaultAutomationRules(sb, academyId, userId);

        const patch: Record<string, unknown> = {};
        if (typeof body?.name === "string") patch.name = normalizeText(body.name, 160);
        if (typeof body?.description === "string") patch.description = normalizeText(body.description, 1000);
        if (typeof body?.channel === "string") {
          const channel = normalizeText(body.channel, 20).toLowerCase();
          if (!["telegram", "email", "inapp"].includes(channel)) return json(400, { error: "Invalid channel" });
          patch.channel = channel;
        }
        if (typeof body?.threshold !== "undefined") patch.threshold = toIntOrNull(body.threshold);
        if (typeof body?.is_active === "boolean") patch.is_active = body.is_active;
        if (typeof body?.metadata === "object" && body.metadata !== null && !Array.isArray(body.metadata)) patch.metadata = body.metadata;

        if (Object.keys(patch).length === 0) return json(400, { error: "No rule fields to update" });

        const { data, error } = await sb.from("academy_automation_rules")
          .update(patch)
          .eq("academy_id", academyId)
          .eq("rule_key", ruleKey)
          .select("id, academy_id, rule_key, name, description, channel, threshold, is_active, metadata, last_run_at, last_run_summary, created_at, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to update automation rule", detail: error.message });
        if (!data?.id) return json(404, { error: "Automation rule not found" });
        return json(200, { automation_rule: data });
      }

      if (actionBody === "run_automation_rules") {
        const result = await runEducationAutomationRules(sb, academyId, userId);
        return json(200, result);
      }

      if (actionBody === "update_academy_landing") {
        const requestedName = normalizeText(body?.name, 160);
        const landingPatch = toJsonObject(body?.landing);
        const hasLandingPatch = isJsonObject(body?.landing);

        if (!requestedName && !hasLandingPatch) {
          return json(400, { error: "name or landing is required" });
        }

        const { data: academyRow, error: academyError } = await sb
          .from("tenants")
          .select("id, name, slug, type, metadata, created_at")
          .eq("id", academyId)
          .maybeSingle();
        if (academyError) return json(500, { error: "Failed to load academy", detail: academyError.message });
        if (!academyRow?.id) return json(404, { error: "Academy not found" });

        const currentMetadata = toJsonObject(academyRow.metadata);
        const currentLanding = toJsonObject(currentMetadata.landing);
        const nextLanding: Json = { ...currentLanding };
        let landingTouched = false;

        if (hasLandingPatch) {
          if (Object.prototype.hasOwnProperty.call(landingPatch, "headline")) {
            nextLanding.headline = normalizeText(landingPatch.headline, 200);
            landingTouched = true;
          }
          if (Object.prototype.hasOwnProperty.call(landingPatch, "subheadline")) {
            nextLanding.subheadline = normalizeText(landingPatch.subheadline, 1200);
            landingTouched = true;
          }
          if (Object.prototype.hasOwnProperty.call(landingPatch, "primary_cta_label")) {
            nextLanding.primary_cta_label = normalizeText(landingPatch.primary_cta_label, 80);
            landingTouched = true;
          }
          if (Object.prototype.hasOwnProperty.call(landingPatch, "secondary_cta_label")) {
            nextLanding.secondary_cta_label = normalizeText(landingPatch.secondary_cta_label, 80);
            landingTouched = true;
          }
        }

        const payload: Record<string, unknown> = {};
        if (requestedName) payload.name = requestedName;
        if (landingTouched) payload.metadata = { ...currentMetadata, landing: nextLanding };

        if (Object.keys(payload).length === 0) {
          return json(400, { error: "No academy landing fields to update" });
        }

        const { data: updatedAcademy, error: updateError } = await sb
          .from("tenants")
          .update(payload)
          .eq("id", academyId)
          .select("id, name, slug, type, metadata, created_at")
          .maybeSingle();
        if (updateError) {
          return json(500, { error: "Failed to update academy landing", detail: updateError.message });
        }
        if (!updatedAcademy?.id) return json(404, { error: "Academy not found" });

        const membership = memberships.find((item) => item.tenant_id === academyId);

        return json(200, {
          academy: {
            id: String(updatedAcademy.id),
            name: String(updatedAcademy.name ?? academyRow.name ?? ""),
            slug: String(updatedAcademy.slug ?? academyRow.slug ?? ""),
            type: String(updatedAcademy.type ?? academyRow.type ?? "team"),
            metadata: toJsonObject(updatedAcademy.metadata),
            created_at: String(updatedAcademy.created_at ?? academyRow.created_at ?? ""),
            role: String(membership?.role ?? "member"),
            status: String(membership?.status ?? "active"),
            access: academyAccessProfile(access),
          },
        });
      }

      if (actionBody === "update_classroom_landing") {
        const classroomId = normalizeText(body?.classroom_id, 64);
        if (!classroomId) return json(400, { error: "classroom_id is required" });

        const landingPatch = toJsonObject(body?.landing);
        const hasLandingPatch = isJsonObject(body?.landing);
        const hasDescriptionPatch = typeof body?.description !== "undefined";

        if (!hasLandingPatch && !hasDescriptionPatch) {
          return json(400, { error: "landing or description is required" });
        }

        const { data: classroomRow, error: classroomLoadError } = await sb
          .from("academy_classrooms")
          .select("id, academy_id, name, description, is_active, metadata, created_at, updated_at")
          .eq("academy_id", academyId)
          .eq("id", classroomId)
          .maybeSingle();
        if (classroomLoadError) return json(500, { error: "Failed to load classroom", detail: classroomLoadError.message });
        if (!classroomRow?.id) return json(404, { error: "Classroom not found" });

        const currentMetadata = toJsonObject(classroomRow.metadata);
        const currentLanding = toJsonObject(currentMetadata.landing);
        const nextLanding: Json = { ...currentLanding };
        let landingTouched = false;

        if (hasLandingPatch) {
          if (Object.prototype.hasOwnProperty.call(landingPatch, "headline")) {
            nextLanding.headline = normalizeText(landingPatch.headline, 200);
            landingTouched = true;
          }
          if (Object.prototype.hasOwnProperty.call(landingPatch, "subheadline")) {
            nextLanding.subheadline = normalizeText(landingPatch.subheadline, 1200);
            landingTouched = true;
          }
          if (Object.prototype.hasOwnProperty.call(landingPatch, "teacher_cta_label")) {
            nextLanding.teacher_cta_label = normalizeText(landingPatch.teacher_cta_label, 80);
            landingTouched = true;
          }
          if (Object.prototype.hasOwnProperty.call(landingPatch, "student_cta_label")) {
            nextLanding.student_cta_label = normalizeText(landingPatch.student_cta_label, 80);
            landingTouched = true;
          }
          if (Object.prototype.hasOwnProperty.call(landingPatch, "card_summary")) {
            nextLanding.card_summary = normalizeText(landingPatch.card_summary, 600);
            landingTouched = true;
          }
        }

        const payload: Record<string, unknown> = {};
        if (landingTouched) payload.metadata = { ...currentMetadata, landing: nextLanding };
        if (hasDescriptionPatch) payload.description = normalizeText(body?.description, 2000) || null;

        if (Object.keys(payload).length === 0) {
          return json(400, { error: "No classroom landing fields to update" });
        }

        const { data: classroom, error: classroomUpdateError } = await sb
          .from("academy_classrooms")
          .update(payload)
          .eq("academy_id", academyId)
          .eq("id", classroomId)
          .select("id, academy_id, name, description, is_active, metadata, created_at, updated_at")
          .maybeSingle();
        if (classroomUpdateError) {
          return json(500, { error: "Failed to update classroom landing", detail: classroomUpdateError.message });
        }
        if (!classroom?.id) return json(404, { error: "Classroom not found" });
        return json(200, { classroom });
      }

      if (actionBody === "upsert_contact") {
        const id = normalizeText(body?.id, 64);
        const firstName = normalizeText(body?.first_name, 120);
        const lastName = normalizeText(body?.last_name, 120);
        const email = normalizeEmail(body?.email) || null;
        const phone = normalizeText(body?.phone, 40) || null;
        const telegramId = normalizeText(body?.telegram_id, 120) || null;
        const status = normalizeText(body?.status, 20).toLowerCase() || "active";
        const metadata = body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? body.metadata
          : {};

        if (!email && !phone) return json(400, { error: "email or phone is required" });
        if (!["active", "inactive", "trial", "paused"].includes(status)) return json(400, { error: "Invalid status" });

        let linkedUserId: string | null = null;
        if (email) {
          const { data: userRow } = await sb.from("users").select("id").eq("email", email).maybeSingle();
          linkedUserId = userRow?.id ? String(userRow.id) : null;
        }

        const payload = {
          academy_id: academyId,
          user_id: linkedUserId,
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          telegram_id: telegramId,
          status,
          metadata,
          created_by: userId,
        };

        if (id) {
          const { data, error } = await sb
            .from("academy_contacts")
            .update(payload)
            .eq("id", id)
            .eq("academy_id", academyId)
            .select("id, academy_id, user_id, first_name, last_name, email, phone, telegram_id, status, metadata, created_at, updated_at")
            .maybeSingle();
          if (error) return json(500, { error: "Failed to update contact", detail: error.message });
          return json(200, { contact: data });
        }

        let existing: { id: string } | null = null;
        if (email) {
          const { data } = await sb
            .from("academy_contacts")
            .select("id")
            .eq("academy_id", academyId)
            .eq("email", email)
            .maybeSingle();
          existing = (data as { id: string } | null) ?? null;
        }
        if (!existing && phone) {
          const { data } = await sb
            .from("academy_contacts")
            .select("id")
            .eq("academy_id", academyId)
            .eq("phone", phone)
            .maybeSingle();
          existing = (data as { id: string } | null) ?? null;
        }

        if (existing?.id) {
          const { data, error } = await sb
            .from("academy_contacts")
            .update(payload)
            .eq("id", existing.id)
            .select("id, academy_id, user_id, first_name, last_name, email, phone, telegram_id, status, metadata, created_at, updated_at")
            .maybeSingle();
          if (error) return json(500, { error: "Failed to update contact", detail: error.message });
          return json(200, { contact: data, upserted: true });
        }

        const { data, error } = await sb
          .from("academy_contacts")
          .insert(payload)
          .select("id, academy_id, user_id, first_name, last_name, email, phone, telegram_id, status, metadata, created_at, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to create contact", detail: error.message });
        return json(200, { contact: data, created: true });
      }

      if (actionBody === "create_classroom") {
        const name = normalizeText(body?.name, 180);
        if (!name) return json(400, { error: "name is required" });

        const payload = {
          academy_id: academyId,
          name,
          description: normalizeText(body?.description, 2000) || null,
          is_active: body?.is_active !== false,
          metadata: body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? body.metadata
            : {},
          created_by: userId,
        };

        const { data, error } = await sb
          .from("academy_classrooms")
          .insert(payload)
          .select("id, academy_id, name, description, is_active, metadata, created_at, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to create classroom", detail: error.message });
        return json(200, { classroom: data });
      }

      if (actionBody === "upsert_classroom_membership") {
        const classroomId = normalizeText(body?.classroom_id, 64);
        const contactId = normalizeText(body?.contact_id, 64);
        const role = normalizeText(body?.role, 20).toLowerCase() || "student";
        if (!classroomId) return json(400, { error: "classroom_id is required" });
        if (!contactId) return json(400, { error: "contact_id is required" });
        if (!["student", "assistant"].includes(role)) return json(400, { error: "role must be student or assistant" });

        const { data: classroomRow } = await sb
          .from("academy_classrooms")
          .select("id")
          .eq("academy_id", academyId)
          .eq("id", classroomId)
          .maybeSingle();
        if (!classroomRow?.id) return json(404, { error: "Classroom not found" });

        const { data: contactRow } = await sb
          .from("academy_contacts")
          .select("id")
          .eq("academy_id", academyId)
          .eq("id", contactId)
          .maybeSingle();
        if (!contactRow?.id) return json(404, { error: "Contact not found" });

        const metadata = body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? { ...body.metadata, source: "manual" }
          : { source: "manual" };

        const payload = {
          academy_id: academyId,
          classroom_id: classroomId,
          contact_id: contactId,
          role,
          metadata,
        };

        const { data, error } = await sb
          .from("academy_classroom_memberships")
          .upsert(payload, { onConflict: "classroom_id,contact_id" })
          .select("id, academy_id, classroom_id, contact_id, role, joined_at, metadata")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to save classroom membership", detail: error.message });
        return json(200, { classroom_membership: data });
      }

      if (actionBody === "remove_classroom_membership") {
        const membershipId = normalizeText(body?.id, 64);
        const classroomId = normalizeText(body?.classroom_id, 64);
        const contactId = normalizeText(body?.contact_id, 64);

        let query = sb
          .from("academy_classroom_memberships")
          .delete()
          .eq("academy_id", academyId);

        if (membershipId) {
          query = query.eq("id", membershipId);
        } else {
          if (!classroomId || !contactId) return json(400, { error: "id or both classroom_id and contact_id are required" });
          query = query.eq("classroom_id", classroomId).eq("contact_id", contactId);
        }

        const { data, error } = await query.select("id, classroom_id, contact_id");
        if (error) return json(500, { error: "Failed to remove classroom membership", detail: error.message });
        return json(200, { removed: data ?? [] });
      }

      if (actionBody === "send_message") {
        const conversationIdRaw = normalizeText(body?.conversation_id, 64) || null;
        const contactIdRaw = normalizeText(body?.contact_id, 64) || null;
        const content = normalizeText(body?.content ?? body?.description, 6000);
        if (!content) return json(400, { error: "content is required" });

        let conversationId = conversationIdRaw;
        let contactId = contactIdRaw;

        if (conversationId) {
          const { data: conversationRow, error: conversationError } = await sb
            .from("academy_conversations")
            .select("id, contact_id")
            .eq("academy_id", academyId)
            .eq("id", conversationId)
            .maybeSingle();
          if (conversationError) return json(500, { error: "Failed to load conversation", detail: conversationError.message });
          if (!conversationRow?.id) return json(404, { error: "Conversation not found" });
          conversationId = String(conversationRow.id);
          contactId = String(conversationRow.contact_id);
        }

        if (!conversationId) {
          if (!contactId) return json(400, { error: "conversation_id or contact_id is required" });
          const { data: contactRow, error: contactError } = await sb
            .from("academy_contacts")
            .select("id")
            .eq("academy_id", academyId)
            .eq("id", contactId)
            .maybeSingle();
          if (contactError) return json(500, { error: "Failed to load contact", detail: contactError.message });
          if (!contactRow?.id) return json(404, { error: "Contact not found" });
          conversationId = await ensureConversationId(sb, academyId, contactId);
        }
        if (contactId) await ensureContactInAccessScope(sb, academyId, access, contactId);

        const metadata = body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? body.metadata
          : {};

        const { data, error } = await sb
          .from("academy_messages")
          .insert({
            academy_id: academyId,
            conversation_id: conversationId,
            contact_id: contactId ?? null,
            sender_type: "teacher",
            message_type: "message",
            content,
            metadata,
          })
          .select("id, academy_id, conversation_id, contact_id, sender_type, message_type, content, metadata, created_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to send message", detail: error.message });

        await sb.from("academy_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

        return json(200, { message: data, conversation_id: conversationId });
      }

      if (actionBody === "send_announcement") {
        const title = normalizeText(body?.title ?? body?.name, 180);
        const announcementBody = normalizeText(body?.content ?? body?.description, 6000);
        const classroomId = normalizeText(body?.classroom_id, 64) || null;
        if (!title) return json(400, { error: "title is required" });
        if (!announcementBody) return json(400, { error: "content is required" });
        if (!classroomId && !academyAccessHas(access, "sendGlobalAnnouncements")) {
          return json(403, { error: "Forbidden" });
        }
        if (classroomId && !accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });

        if (classroomId) {
          const { data: classroomRow, error: classroomError } = await sb
            .from("academy_classrooms")
            .select("id")
            .eq("academy_id", academyId)
            .eq("id", classroomId)
            .maybeSingle();
          if (classroomError) return json(500, { error: "Failed to load classroom", detail: classroomError.message });
          if (!classroomRow?.id) return json(404, { error: "Classroom not found" });
        }

        const announcementMetadata = body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? body.metadata
          : {};

        const { data: announcementRow, error: announcementError } = await sb
          .from("academy_announcements")
          .insert({
            academy_id: academyId,
            classroom_id: classroomId,
            title,
            body: announcementBody,
            metadata: announcementMetadata,
            created_by: userId,
          })
          .select("id, academy_id, classroom_id, title, body, metadata, created_by, created_at")
          .maybeSingle();
        if (announcementError) {
          return json(500, { error: "Failed to create announcement", detail: announcementError.message });
        }

        let targetContactIds: string[] = [];
        if (classroomId) {
          const { data: memberRows, error: memberError } = await sb
            .from("academy_classroom_memberships")
            .select("contact_id")
            .eq("academy_id", academyId)
            .eq("classroom_id", classroomId)
            .limit(5000);
          if (memberError) return json(500, { error: "Failed to load classroom members", detail: memberError.message });
          targetContactIds = Array.from(
            new Set(
              ((memberRows ?? []) as Array<{ contact_id: string | null }>)
                .map((row) => (row.contact_id ? String(row.contact_id) : ""))
                .filter((id) => id.length > 0),
            ),
          );
        } else {
          const { data: contactRows, error: contactError } = await sb
            .from("academy_contacts")
            .select("id")
            .eq("academy_id", academyId)
            .neq("status", "inactive")
            .limit(5000);
          if (contactError) return json(500, { error: "Failed to load contacts", detail: contactError.message });
          targetContactIds = Array.from(
            new Set(
              ((contactRows ?? []) as Array<{ id: string | null }>)
                .map((row) => (row.id ? String(row.id) : ""))
                .filter((id) => id.length > 0),
            ),
          );
        }

        if (targetContactIds.length === 0) {
          return json(200, { announcement: announcementRow, recipient_count: 0, messages_created: 0 });
        }

        const upsertConversations = targetContactIds.map((contactId) => ({
          academy_id: academyId,
          contact_id: contactId,
        }));
        const { error: conversationUpsertError } = await sb
          .from("academy_conversations")
          .upsert(upsertConversations, { onConflict: "academy_id,contact_id" });
        if (conversationUpsertError) {
          return json(500, { error: "Failed to prepare announcement conversations", detail: conversationUpsertError.message });
        }

        const { data: conversationRows, error: conversationLoadError } = await sb
          .from("academy_conversations")
          .select("id, contact_id")
          .eq("academy_id", academyId)
          .in("contact_id", targetContactIds);
        if (conversationLoadError) {
          return json(500, { error: "Failed to load announcement conversations", detail: conversationLoadError.message });
        }

        const conversationByContact = new Map<string, string>();
        for (const row of (conversationRows ?? []) as Array<{ id: string; contact_id: string }>) {
          conversationByContact.set(String(row.contact_id), String(row.id));
        }

        const messageMetadata = {
          ...announcementMetadata,
          announcement_id: announcementRow?.id ?? null,
          title,
          classroom_id: classroomId,
        };

        const messageRows = targetContactIds
          .map((contactId) => {
            const conversationId = conversationByContact.get(contactId);
            if (!conversationId) return null;
            return {
              academy_id: academyId,
              conversation_id: conversationId,
              contact_id: contactId,
              sender_type: "teacher",
              message_type: "announcement",
              content: announcementBody,
              metadata: messageMetadata,
            };
          })
          .filter((row): row is NonNullable<typeof row> => !!row);

        if (messageRows.length > 0) {
          const { error: messageInsertError } = await sb.from("academy_messages").insert(messageRows);
          if (messageInsertError) {
            return json(500, { error: "Failed to deliver announcement", detail: messageInsertError.message });
          }

          await sb
            .from("academy_conversations")
            .update({ updated_at: new Date().toISOString() })
            .in("id", messageRows.map((row) => String(row.conversation_id)));
        }

        return json(200, {
          announcement: announcementRow,
          recipient_count: targetContactIds.length,
          messages_created: messageRows.length,
        });
      }

      if (actionBody === "create_alert") {
        const contactId = normalizeText(body?.contact_id, 64) || null;
        const alertType = normalizeText(body?.type, 120);
        const severity = normalizeText(body?.severity, 20).toLowerCase() || "medium";
        const alertMessage = normalizeText(body?.content ?? body?.description, 2000);

        if (!alertType) return json(400, { error: "type is required" });
        if (!alertMessage) return json(400, { error: "content is required" });
        if (!["low", "medium", "high", "critical"].includes(severity)) {
          return json(400, { error: "severity must be low, medium, high, or critical" });
        }
        if (!contactId && !academyAccessHas(access, "sendGlobalAnnouncements")) {
          return json(403, { error: "Forbidden" });
        }
        if (contactId) await ensureContactInAccessScope(sb, academyId, access, contactId);

        if (contactId) {
          const { data: contactRow, error: contactError } = await sb
            .from("academy_contacts")
            .select("id")
            .eq("academy_id", academyId)
            .eq("id", contactId)
            .maybeSingle();
          if (contactError) return json(500, { error: "Failed to load contact", detail: contactError.message });
          if (!contactRow?.id) return json(404, { error: "Contact not found" });
        }

        const alertMetadata = body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? body.metadata
          : {};
        const alertClassroomId = normalizeText((alertMetadata as Record<string, unknown>).classroom_id, 64);
        if (alertClassroomId && !accessCanUseClassroom(access, alertClassroomId)) return json(403, { error: "Forbidden" });

        const { data: alertRow, error: alertError } = await sb
          .from("academy_alerts")
          .insert({
            academy_id: academyId,
            contact_id: contactId,
            type: alertType,
            severity,
            message: alertMessage,
            metadata: alertMetadata,
          })
          .select("id, academy_id, contact_id, type, severity, message, resolved, resolved_at, metadata, created_at")
          .maybeSingle();
        if (alertError) return json(500, { error: "Failed to create alert", detail: alertError.message });

        if (alertRow?.id) {
          if (contactId) {
            const conversationId = await ensureConversationId(sb, academyId, contactId);
            await sb.from("academy_messages").insert({
              academy_id: academyId,
              conversation_id: conversationId,
              contact_id: contactId,
              sender_type: "system",
              message_type: "alert",
              content: alertMessage,
              metadata: {
                alert_id: alertRow.id,
                type: alertType,
                severity,
              },
            });
            await sb.from("academy_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
          } else {
            const { data: contactRows, error: contactRowsError } = await sb
              .from("academy_contacts")
              .select("id")
              .eq("academy_id", academyId)
              .neq("status", "inactive")
              .limit(5000);
            if (contactRowsError) {
              return json(500, { error: "Failed to load alert contacts", detail: contactRowsError.message });
            }

            const contactIds = Array.from(
              new Set(
                ((contactRows ?? []) as Array<{ id: string | null }>)
                  .map((row) => (row.id ? String(row.id) : ""))
                  .filter((id) => id.length > 0),
              ),
            );

            if (contactIds.length > 0) {
              const upsertConversations = contactIds.map((targetContactId) => ({
                academy_id: academyId,
                contact_id: targetContactId,
              }));
              const { error: conversationUpsertError } = await sb
                .from("academy_conversations")
                .upsert(upsertConversations, { onConflict: "academy_id,contact_id" });
              if (conversationUpsertError) {
                return json(500, { error: "Failed to prepare alert conversations", detail: conversationUpsertError.message });
              }

              const { data: conversationRows, error: conversationLoadError } = await sb
                .from("academy_conversations")
                .select("id, contact_id")
                .eq("academy_id", academyId)
                .in("contact_id", contactIds);
              if (conversationLoadError) {
                return json(500, { error: "Failed to load alert conversations", detail: conversationLoadError.message });
              }

              const conversationByContact = new Map<string, string>();
              for (const row of (conversationRows ?? []) as Array<{ id: string; contact_id: string }>) {
                conversationByContact.set(String(row.contact_id), String(row.id));
              }

              const messageRows = contactIds
                .map((targetContactId) => {
                  const conversationId = conversationByContact.get(targetContactId);
                  if (!conversationId) return null;
                  return {
                    academy_id: academyId,
                    conversation_id: conversationId,
                    contact_id: targetContactId,
                    sender_type: "system",
                    message_type: "alert",
                    content: alertMessage,
                    metadata: {
                      alert_id: alertRow.id,
                      type: alertType,
                      severity,
                      scope: "academy",
                    },
                  };
                })
                .filter((row): row is NonNullable<typeof row> => !!row);

              if (messageRows.length > 0) {
                const { error: messageInsertError } = await sb.from("academy_messages").insert(messageRows);
                if (messageInsertError) {
                  return json(500, { error: "Failed to fan out alert message", detail: messageInsertError.message });
                }
                await sb
                  .from("academy_conversations")
                  .update({ updated_at: new Date().toISOString() })
                  .in("id", messageRows.map((row) => String(row.conversation_id)));
              }
            }
          }
        }

        return json(200, { alert: alertRow });
      }

      if (actionBody === "resolve_alert") {
        const alertId = normalizeText(body?.id, 64);
        if (!alertId) return json(400, { error: "id is required" });

        const { data: existingAlert, error: loadAlertError } = await sb
          .from("academy_alerts")
          .select("id, contact_id, metadata")
          .eq("academy_id", academyId)
          .eq("id", alertId)
          .maybeSingle();
        if (loadAlertError) return json(500, { error: "Failed to load alert", detail: loadAlertError.message });
        if (!existingAlert?.id) return json(404, { error: "Alert not found" });
        if (existingAlert.contact_id) await ensureContactInAccessScope(sb, academyId, access, existingAlert.contact_id);
        const existingAlertClassroomId = normalizeText(toJsonObject(existingAlert.metadata).classroom_id, 64);
        if (existingAlertClassroomId && !accessCanUseClassroom(access, existingAlertClassroomId)) {
          return json(403, { error: "Forbidden" });
        }
        if (!existingAlert.contact_id && !existingAlertClassroomId && academyAccessClassroomIds(access) !== null) {
          return json(403, { error: "Forbidden" });
        }

        const { data: alertRow, error: alertError } = await sb
          .from("academy_alerts")
          .update({
            resolved: true,
            resolved_at: new Date().toISOString(),
          })
          .eq("academy_id", academyId)
          .eq("id", alertId)
          .select("id, academy_id, contact_id, type, severity, message, resolved, resolved_at, metadata, created_at")
          .maybeSingle();
        if (alertError) return json(500, { error: "Failed to resolve alert", detail: alertError.message });
        if (!alertRow?.id) return json(404, { error: "Alert not found" });

        const contactId = alertRow.contact_id ? String(alertRow.contact_id) : null;
        if (contactId) {
          const conversationId = await ensureConversationId(sb, academyId, contactId);
          await sb.from("academy_messages").insert({
            academy_id: academyId,
            conversation_id: conversationId,
            contact_id: contactId,
            sender_type: "system",
            message_type: "event",
            content: `Alert resolved: ${String(alertRow.message ?? "")}`,
            metadata: { alert_id: alertRow.id, resolved: true },
          });
          await sb.from("academy_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
        }

        return json(200, { alert: alertRow });
      }

      if (actionBody === "create_offer") {
        const name = normalizeText(body?.name, 180);
        const type = normalizeText(body?.type, 30).toLowerCase();
        const priceAmount = toIntOrNull(body?.price_amount);
        const currency = normalizeText(body?.currency, 10).toUpperCase() || "UZS";
        const durationDays = positiveIntOrNull(body?.duration_days);

        if (!name) return json(400, { error: "name is required" });
        if (!["subscription", "cohort", "product", "credits"].includes(type)) {
          return json(400, { error: "type must be one of subscription, cohort, product, credits" });
        }
        if (priceAmount === null || priceAmount < 0) return json(400, { error: "price_amount is required" });

        const offerClassroomId = normalizeText(body?.classroom_id, 64) || null;
        if (offerClassroomId) {
          const { data: classroomRow } = await sb
            .from("academy_classrooms").select("id").eq("academy_id", academyId).eq("id", offerClassroomId).maybeSingle();
          if (!classroomRow?.id) return json(404, { error: "Classroom not found" });
        }

        const payload = {
          academy_id: academyId,
          name,
          type,
          price_amount: priceAmount,
          currency,
          duration_days: durationDays,
          classroom_id: offerClassroomId,
          description: normalizeText(body?.description, 2000) || null,
          is_active: body?.is_active !== false,
          metadata: body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? body.metadata
            : {},
          created_by: userId,
        };

        const { data, error } = await sb
          .from("academy_offers")
          .insert(payload)
          .select("id, academy_id, name, type, price_amount, currency, duration_days, classroom_id, description, is_active, metadata, created_at, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to create offer", detail: error.message });

        // For a classroom-linked tuition offer, auto-create the access grant so a
        // completed payment unlocks the classroom via apply_academy_payment.
        if (data?.id && offerClassroomId) {
          await sb.from("academy_offer_grants").insert({
            academy_id: academyId,
            offer_id: data.id,
            grant_type: "classroom_access",
            resource_type: "classroom",
            resource_id: offerClassroomId,
            quantity: 1,
            duration_days: durationDays,
            metadata: { auto_created: true },
          });
        }
        return json(200, { offer: data });
      }

      if (actionBody === "upsert_offer_grant") {
        const id = normalizeText(body?.id, 64);
        const offerId = normalizeText(body?.offer_id, 64);
        const grantType = normalizeText(body?.grant_type, 60);
        if (!offerId) return json(400, { error: "offer_id is required" });
        if (!grantType) return json(400, { error: "grant_type is required" });

        const { data: offerRow } = await sb
          .from("academy_offers")
          .select("id")
          .eq("academy_id", academyId)
          .eq("id", offerId)
          .maybeSingle();
        if (!offerRow?.id) return json(404, { error: "Offer not found" });

        const payload = {
          academy_id: academyId,
          offer_id: offerId,
          grant_type: grantType,
          resource_type: normalizeText(body?.resource_type, 60) || null,
          resource_id: normalizeText(body?.resource_id, 64) || null,
          capability_key: normalizeText(body?.capability_key, 100) || null,
          quantity: positiveIntOrNull(body?.quantity),
          duration_days: positiveIntOrNull(body?.duration_days),
          metadata: body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? body.metadata
            : {},
        };

        if (id) {
          const { data, error } = await sb
            .from("academy_offer_grants")
            .update(payload)
            .eq("academy_id", academyId)
            .eq("id", id)
            .select("id, academy_id, offer_id, grant_type, resource_type, resource_id, capability_key, quantity, duration_days, metadata, created_at")
            .maybeSingle();
          if (error) return json(500, { error: "Failed to update offer grant", detail: error.message });
          return json(200, { offer_grant: data });
        }

        const { data, error } = await sb
          .from("academy_offer_grants")
          .insert(payload)
          .select("id, academy_id, offer_id, grant_type, resource_type, resource_id, capability_key, quantity, duration_days, metadata, created_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to create offer grant", detail: error.message });
        return json(200, { offer_grant: data });
      }

      if (actionBody === "create_payment") {
        const offerId = normalizeText(body?.offer_id, 64);
        const contactId = normalizeText(body?.contact_id, 64);
        if (!offerId) return json(400, { error: "offer_id is required" });
        if (!contactId) return json(400, { error: "contact_id is required" });

        const { data: offerRow, error: offerErr } = await sb
          .from("academy_offers")
          .select("id, academy_id, price_amount, currency, is_active")
          .eq("academy_id", academyId)
          .eq("id", offerId)
          .maybeSingle();
        if (offerErr) return json(500, { error: "Failed to load offer", detail: offerErr.message });
        if (!offerRow?.id) return json(404, { error: "Offer not found" });
        if (!offerRow.is_active) return json(400, { error: "Offer is inactive" });

        const { data: contactRow, error: contactErr } = await sb
          .from("academy_contacts")
          .select("id, academy_id")
          .eq("academy_id", academyId)
          .eq("id", contactId)
          .maybeSingle();
        if (contactErr) return json(500, { error: "Failed to load contact", detail: contactErr.message });
        if (!contactRow?.id) return json(404, { error: "Contact not found" });

        const provider = normalizeText(body?.provider, 60).toLowerCase() || "manual";
        const providerTxn = normalizeText(body?.provider_transaction_id, 120) || `${provider}-${crypto.randomUUID()}`;

        const payload = {
          academy_id: academyId,
          offer_id: offerId,
          contact_id: contactId,
          provider,
          provider_transaction_id: providerTxn,
          amount: Number(offerRow.price_amount),
          currency: String(offerRow.currency ?? "UZS").toUpperCase(),
          status: "pending",
          metadata: body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? body.metadata
            : {},
          created_by: userId,
        };

        const { data, error } = await sb
          .from("academy_payments")
          .insert(payload)
          .select("id, academy_id, contact_id, offer_id, provider, provider_transaction_id, amount, currency, status, metadata, created_by, created_at, updated_at")
          .maybeSingle();
        if (error) {
          if (String(error.message).toLowerCase().includes("duplicate")) {
            const { data: existing } = await sb
              .from("academy_payments")
              .select("id, academy_id, contact_id, offer_id, provider, provider_transaction_id, amount, currency, status, metadata, created_by, created_at, updated_at")
              .eq("provider", provider)
              .eq("provider_transaction_id", providerTxn)
              .maybeSingle();
            return json(200, { payment: existing ?? null, deduped: true });
          }
          return json(500, { error: "Failed to create payment", detail: error.message });
        }

        return json(200, { payment: data });
      }

      if (actionBody === "mark_payment_paid") {
        const paymentId = normalizeText(body?.id, 64);
        if (!paymentId) return json(400, { error: "payment id is required" });

        const { data: paymentRow, error: paymentLoadErr } = await sb
          .from("academy_payments")
          .select("id, academy_id, status")
          .eq("id", paymentId)
          .eq("academy_id", academyId)
          .maybeSingle();
        if (paymentLoadErr) return json(500, { error: "Failed to load payment", detail: paymentLoadErr.message });
        if (!paymentRow?.id) return json(404, { error: "Payment not found" });

        const { data: applyResult, error: applyErr } = await sb.rpc("apply_academy_payment", {
          p_payment_id: paymentId,
          p_actor_id: userId,
        });

        if (applyErr) return json(500, { error: "Failed to apply payment", detail: applyErr.message });

        const { data: updatedPayment } = await sb
          .from("academy_payments")
          .select("id, academy_id, contact_id, offer_id, provider, provider_transaction_id, amount, currency, status, metadata, created_by, created_at, updated_at")
          .eq("id", paymentId)
          .maybeSingle();

        return json(200, { payment: updatedPayment ?? null, result: applyResult ?? null });
      }

      if (actionBody === "grant_contact") {
        const contactId = normalizeText(body?.contact_id, 64);
        const grantType = normalizeText(body?.grant_type, 80);
        const resourceType = normalizeText(body?.resource_type, 80) || null;
        const resourceId = normalizeText(body?.resource_id, 64) || null;
        const capabilityKey = normalizeText(body?.capability_key, 100) || null;
        const quantity = toIntOrNull(body?.quantity);

        if (!contactId) return json(400, { error: "contact_id is required" });
        if (!grantType) return json(400, { error: "grant_type is required" });

        const { data: contactRow } = await sb
          .from("academy_contacts")
          .select("id, user_id")
          .eq("academy_id", academyId)
          .eq("id", contactId)
          .maybeSingle();

        if (!contactRow?.id) return json(404, { error: "Contact not found" });

        const durationDays = positiveIntOrNull(body?.duration_days);
        const startsAt = new Date();
        const expiresAt = durationDays ? new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString() : null;

        const payload = {
          academy_id: academyId,
          contact_id: contactId,
          user_id: contactRow.user_id ?? null,
          grant_type: grantType,
          resource_type: resourceType,
          resource_id: resourceId,
          capability_key: capabilityKey,
          quantity,
          remaining: quantity,
          starts_at: startsAt.toISOString(),
          expires_at: expiresAt,
          status: "active",
          source: "manual",
          metadata: body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? body.metadata
            : {},
        };

        const { data, error } = await sb
          .from("academy_entitlements")
          .insert(payload)
          .select("id, academy_id, contact_id, user_id, grant_type, resource_type, resource_id, capability_key, quantity, remaining, starts_at, expires_at, status, source, metadata, created_at, updated_at")
          .maybeSingle();

        if (error) return json(500, { error: "Failed to create entitlement", detail: error.message });
        return json(200, { entitlement: data });
      }

      // ── LMS Write Actions ─────────────────────────────────────────────────

      if (actionBody === "create_assignment") {
        const classroomId = normalizeText(body?.classroom_id, 64);
        const title = normalizeText(body?.title, 220);
        if (!classroomId) return json(400, { error: "classroom_id is required" });
        if (!title) return json(400, { error: "title is required" });
        if (!accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });

        const { data: classroomRow } = await sb.from("academy_classrooms").select("id").eq("id", classroomId).eq("academy_id", academyId).maybeSingle();
        if (!classroomRow?.id) return json(404, { error: "Classroom not found" });

        const { count: pos } = await sb.from("academy_assignments").select("id", { count: "exact", head: true }).eq("classroom_id", classroomId).neq("status", "archived");

        const payload = {
          academy_id: academyId,
          classroom_id: classroomId,
          title,
          description: normalizeText(body?.description, 4000) || null,
          assignment_type: normalizeText(body?.assignment_type, 40) || "task",
          experience_id: normalizeText(body?.experience_id, 64) || null,
          due_at: body?.due_at ? String(body.due_at) : null,
          released_at: body?.released_at ? String(body.released_at) : new Date().toISOString(),
          prerequisite_id: normalizeText(body?.prerequisite_id, 64) || null,
          position: typeof body?.position === "number" ? Math.floor(body.position) : (pos ?? 0),
          max_score: typeof body?.max_score === "number" ? body.max_score : null,
          score_weight: typeof body?.score_weight === "number" ? body.score_weight : 1.0,
          status: normalizeText(body?.status, 20) || "active",
          metadata: typeof body?.metadata === "object" && body.metadata !== null && !Array.isArray(body.metadata) ? body.metadata : {},
          created_by: userId,
        };

        const { data, error } = await sb.from("academy_assignments").insert(payload)
          .select("id, academy_id, classroom_id, title, description, assignment_type, experience_id, due_at, released_at, prerequisite_id, position, max_score, score_weight, status, metadata, created_by, created_at, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to create assignment", detail: error.message });
        return json(200, { assignment: data });
      }

      if (actionBody === "update_assignment") {
        const assignmentId = normalizeText(body?.assignment_id ?? body?.id, 64);
        if (!assignmentId) return json(400, { error: "assignment_id is required" });

        const { data: existing } = await sb.from("academy_assignments").select("id, classroom_id").eq("id", assignmentId).eq("academy_id", academyId).maybeSingle();
        if (!existing?.id) return json(404, { error: "Assignment not found" });
        if (!accessCanUseClassroom(access, existing.classroom_id)) return json(403, { error: "Forbidden" });

        const patch: Record<string, unknown> = {};
        if (typeof body?.title === "string") patch.title = normalizeText(body.title, 220);
        if (typeof body?.description !== "undefined") patch.description = normalizeText(body.description, 4000) || null;
        if (typeof body?.assignment_type === "string") patch.assignment_type = normalizeText(body.assignment_type, 40);
        if (typeof body?.experience_id !== "undefined") patch.experience_id = normalizeText(body.experience_id, 64) || null;
        if (typeof body?.due_at !== "undefined") patch.due_at = body.due_at ? String(body.due_at) : null;
        if (typeof body?.released_at !== "undefined") patch.released_at = body.released_at ? String(body.released_at) : null;
        if (typeof body?.prerequisite_id !== "undefined") patch.prerequisite_id = normalizeText(body.prerequisite_id, 64) || null;
        if (typeof body?.position === "number") patch.position = Math.floor(body.position);
        if (typeof body?.max_score !== "undefined") patch.max_score = typeof body.max_score === "number" ? body.max_score : null;
        if (typeof body?.score_weight === "number") patch.score_weight = body.score_weight;
        if (typeof body?.status === "string") patch.status = normalizeText(body.status, 20);

        if (Object.keys(patch).length === 0) return json(400, { error: "No fields to update" });

        const { data, error } = await sb.from("academy_assignments").update(patch).eq("id", assignmentId).eq("academy_id", academyId)
          .select("id, academy_id, classroom_id, title, description, assignment_type, experience_id, due_at, released_at, prerequisite_id, position, max_score, score_weight, status, metadata, created_by, created_at, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to update assignment", detail: error.message });
        return json(200, { assignment: data });
      }

      if (actionBody === "submit_assignment") {
        const assignmentId = normalizeText(body?.assignment_id, 64);
        const contactId = normalizeText(body?.contact_id, 64);
        if (!assignmentId) return json(400, { error: "assignment_id is required" });
        if (!contactId) return json(400, { error: "contact_id is required" });

        const { data: asgn } = await sb.from("academy_assignments").select("id, classroom_id, max_score").eq("id", assignmentId).eq("academy_id", academyId).maybeSingle();
        if (!asgn?.id) return json(404, { error: "Assignment not found" });
        if (!accessCanUseClassroom(access, asgn.classroom_id)) return json(403, { error: "Forbidden" });
        await ensureContactInAccessScope(sb, academyId, access, contactId);

        const { data: contact } = await sb.from("academy_contacts").select("id, user_id").eq("id", contactId).eq("academy_id", academyId).maybeSingle();
        if (!contact?.id) return json(404, { error: "Contact not found" });

        const score = typeof body?.score === "number" ? body.score : null;
        const maxScore = typeof body?.max_score === "number" ? body.max_score : (asgn.max_score ?? null);
        const submissionStatus = score !== null ? "graded" : "submitted";

        const payload = {
          academy_id: academyId,
          assignment_id: assignmentId,
          classroom_id: asgn.classroom_id,
          contact_id: contactId,
          user_id: (contact.user_id as string | null) ?? null,
          session_id: normalizeText(body?.session_id, 64) || null,
          score,
          max_score: maxScore,
          status: submissionStatus,
          submitted_at: new Date().toISOString(),
          notes: normalizeText(body?.notes, 2000) || null,
          metadata: typeof body?.metadata === "object" && body.metadata !== null && !Array.isArray(body.metadata) ? body.metadata : {},
        };

        const { data, error } = await sb.from("academy_submissions").upsert(payload, { onConflict: "assignment_id,contact_id" })
          .select("id, assignment_id, contact_id, score, max_score, status, submitted_at, graded_at, notes, created_at, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to submit assignment", detail: error.message });
        return json(200, { submission: data });
      }

      if (actionBody === "grade_submission") {
        const submissionId = normalizeText(body?.submission_id ?? body?.id, 64);
        const assignmentId = normalizeText(body?.assignment_id, 64);
        const contactId = normalizeText(body?.contact_id, 64);
        const score = typeof body?.score === "number" ? body.score : null;

        if (score === null) return json(400, { error: "score is required" });

        let targetId: string | null = submissionId;
        if (!targetId && assignmentId && contactId) {
          const { data: sub } = await sb.from("academy_submissions").select("id").eq("assignment_id", assignmentId).eq("contact_id", contactId).eq("academy_id", academyId).maybeSingle();
          targetId = sub?.id ? String(sub.id) : null;
        }
        if (!targetId) return json(404, { error: "Submission not found" });

        const { data: existingSubmission, error: existingSubmissionError } = await sb.from("academy_submissions")
          .select("id, classroom_id, contact_id")
          .eq("id", targetId)
          .eq("academy_id", academyId)
          .maybeSingle();
        if (existingSubmissionError) return json(500, { error: "Failed to load submission", detail: existingSubmissionError.message });
        if (!existingSubmission?.id) return json(404, { error: "Submission not found" });
        if (!accessCanUseClassroom(access, existingSubmission.classroom_id)) return json(403, { error: "Forbidden" });
        await ensureContactInAccessScope(sb, academyId, access, existingSubmission.contact_id);

        const patch: Record<string, unknown> = {
          score,
          status: "graded",
          graded_at: new Date().toISOString(),
          graded_by: userId,
        };
        if (typeof body?.max_score === "number") patch.max_score = body.max_score;
        if (typeof body?.notes === "string") patch.notes = normalizeText(body.notes, 2000) || null;

        const { data, error } = await sb.from("academy_submissions").update(patch).eq("id", targetId).eq("academy_id", academyId)
          .select("id, assignment_id, contact_id, score, max_score, status, submitted_at, graded_at, graded_by, notes, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to grade submission", detail: error.message });
        return json(200, { submission: data });
      }

      if (actionBody === "mark_attendance") {
        const classroomId = normalizeText(body?.classroom_id, 64);
        if (!classroomId) return json(400, { error: "classroom_id is required" });
        if (!accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });

        const records = Array.isArray(body?.records) ? body.records as Array<Record<string, unknown>> : [];
        if (records.length === 0) return json(400, { error: "records array is required" });
        if (records.length > 200) return json(400, { error: "Maximum 200 attendance records per call" });

        const sessionDate = normalizeText(body?.session_date, 20) || new Date().toISOString().slice(0, 10);

        const rows = records.map((r) => ({
          academy_id: academyId,
          classroom_id: classroomId,
          contact_id: normalizeText(r.contact_id, 64),
          user_id: normalizeText(r.user_id, 64) || null,
          session_date: sessionDate,
          status: (["present", "absent", "late", "excused"].includes(String(r.status ?? "")) ? String(r.status) : "present"),
          notes: normalizeText(r.notes, 500) || null,
          marked_by: userId,
          marked_at: new Date().toISOString(),
        })).filter((r) => r.contact_id);
        const { data: memberRows, error: memberRowsError } = await sb.from("academy_classroom_memberships")
          .select("contact_id")
          .eq("academy_id", academyId)
          .eq("classroom_id", classroomId)
          .in("role", ["student", "observer"])
          .limit(1000);
        if (memberRowsError) return json(500, { error: "Failed to verify classroom members", detail: memberRowsError.message });
        const memberContactIds = new Set(((memberRows ?? []) as Array<{ contact_id: string | null }>).map((row) => String(row.contact_id ?? "")));
        if (rows.some((row) => !memberContactIds.has(row.contact_id))) return json(403, { error: "Forbidden" });

        const { data, error } = await sb.from("academy_attendance")
          .upsert(rows, { onConflict: "classroom_id,contact_id,session_date" })
          .select("id, classroom_id, contact_id, session_date, status, notes");
        if (error) return json(500, { error: "Failed to mark attendance", detail: error.message });
        return json(200, { attendance: data ?? [], count: (data ?? []).length });
      }

      if (actionBody === "bulk_invite") {
        const classroomId = normalizeText(body?.classroom_id, 64) || null;
        if (classroomId && !accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
        const entries = Array.isArray(body?.contacts) ? body.contacts as Array<Record<string, unknown>> : [];
        if (entries.length === 0) return json(400, { error: "contacts array is required" });
        if (entries.length > 200) return json(400, { error: "Maximum 200 contacts per bulk invite" });

        const results: Array<Record<string, unknown>> = [];

        for (const entry of entries) {
          const email = normalizeEmail(entry.email) || null;
          const firstName = normalizeText(entry.first_name, 120) || "";
          const lastName = normalizeText(entry.last_name, 120) || "";

          if (!email) {
            results.push({ email: entry.email, status: "failed", error: "Invalid email" });
            continue;
          }

          try {
            // Upsert the contact
            let contactId: string | null = null;
            const { data: existingContact } = await sb.from("academy_contacts").select("id").eq("academy_id", academyId).eq("email", email).maybeSingle();
            if (existingContact?.id) {
              contactId = String(existingContact.id);
            } else {
              const { data: userRow } = await sb.from("users").select("id").eq("email", email).maybeSingle();
              const { data: newContact, error: contactErr } = await sb.from("academy_contacts").insert({
                academy_id: academyId,
                first_name: firstName,
                last_name: lastName,
                email,
                user_id: userRow?.id ? String(userRow.id) : null,
                status: "active",
                created_by: userId,
              }).select("id").maybeSingle();
              if (contactErr) { results.push({ email, status: "failed", error: contactErr.message }); continue; }
              contactId = newContact?.id ? String(newContact.id) : null;
            }

            if (classroomId && contactId) {
              await sb.from("academy_classroom_memberships").upsert({
                academy_id: academyId,
                classroom_id: classroomId,
                contact_id: contactId,
                role: "student",
              }, { onConflict: "classroom_id,contact_id", ignoreDuplicates: true });
            }

            await sb.from("academy_bulk_invites").upsert({
              academy_id: academyId,
              classroom_id: classroomId,
              invited_by: userId,
              email,
              first_name: firstName,
              last_name: lastName,
              status: "sent",
              invited_at: new Date().toISOString(),
            }, { onConflict: "academy_id,email" }).select();

            results.push({ email, contact_id: contactId, status: "ok" });
          } catch (e) {
            results.push({ email, status: "failed", error: e instanceof Error ? e.message : String(e) });
          }
        }

        const ok = results.filter((r) => r.status === "ok").length;
        const failed = results.filter((r) => r.status === "failed").length;
        return json(200, { results, summary: { ok, failed, total: results.length } });
      }

      if (actionBody === "update_classroom_settings") {
        const classroomId = normalizeText(body?.classroom_id, 64);
        if (!classroomId) return json(400, { error: "classroom_id is required" });
        if (!accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });

        const { data: existing } = await sb.from("academy_classrooms").select("id, metadata, score_weights").eq("id", classroomId).eq("academy_id", academyId).maybeSingle();
        if (!existing?.id) return json(404, { error: "Classroom not found" });

        const patch: Record<string, unknown> = {};
        if (typeof body?.name === "string") patch.name = normalizeText(body.name, 160);
        if (typeof body?.description !== "undefined") patch.description = normalizeText(body.description, 2000) || null;
        if (typeof body?.is_active === "boolean") patch.is_active = body.is_active;
        if (typeof body?.score_weights === "object" && body.score_weights !== null && !Array.isArray(body.score_weights)) {
          patch.score_weights = body.score_weights;
        }

        if (Object.keys(patch).length === 0) return json(400, { error: "No settings to update" });

        const { data, error } = await sb.from("academy_classrooms").update(patch).eq("id", classroomId).eq("academy_id", academyId)
          .select("id, academy_id, name, description, is_active, score_weights, metadata, created_at, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to update classroom settings", detail: error.message });
        return json(200, { classroom: data });
      }

      if (actionBody === "export_gradebook") {
        const classroomId = normalizeText(body?.classroom_id, 64);
        if (!classroomId) return json(400, { error: "classroom_id is required" });
        if (!accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });

        const [assignmentsResult, submissionsResult, membersResult] = await Promise.all([
          sb.from("academy_assignments").select("id, title, assignment_type, due_at, max_score, position").eq("academy_id", academyId).eq("classroom_id", classroomId).neq("status", "archived").order("position").limit(200),
          sb.from("academy_submissions").select("assignment_id, contact_id, score, max_score, status, submitted_at").eq("academy_id", academyId).eq("classroom_id", classroomId).limit(5000),
          sb.from("academy_classroom_memberships").select("contact_id, academy_contacts(id, first_name, last_name, email)").eq("academy_id", academyId).eq("classroom_id", classroomId).in("role", ["student"]).limit(500),
        ]);

        const assignments = (assignmentsResult.data ?? []) as Array<Record<string, unknown>>;
        const subMap = new Map<string, Record<string, unknown>>();
        for (const s of (submissionsResult.data ?? []) as Array<Record<string, unknown>>) {
          subMap.set(`${s.assignment_id}__${s.contact_id}`, s);
        }

        const headers = ["First Name", "Last Name", "Email", ...assignments.map((a) => String(a.title ?? ""))];
        const csvRows = [headers.join(",")];

        for (const m of (membersResult.data ?? []) as Array<Record<string, unknown>>) {
          const c = (m.academy_contacts as Record<string, unknown>) ?? {};
          const contactId = String(c.id ?? "");
          const row = [
            `"${String(c.first_name ?? "")}"`,
            `"${String(c.last_name ?? "")}"`,
            `"${String(c.email ?? "")}"`,
            ...assignments.map((a) => {
              const sub = subMap.get(`${a.id}__${contactId}`);
              return sub?.score !== null && sub?.score !== undefined ? String(sub.score) : "";
            }),
          ];
          csvRows.push(row.join(","));
        }

        return new Response(csvRows.join("\n"), {
          status: 200,
          headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="gradebook.csv"`, ...corsHeaders },
        });
      }

      if (actionBody === "upsert_schedule") {
        const classroomId = normalizeText(body?.classroom_id, 64);
        if (!classroomId) return json(400, { error: "classroom_id is required" });
        if (!accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
        const dayOfWeek = toIntOrNull(body?.day_of_week);
        if (dayOfWeek === null || dayOfWeek < 0 || dayOfWeek > 6) return json(400, { error: "day_of_week 0–6 is required" });
        const startTime = normalizeText(body?.start_time, 10);
        if (!startTime) return json(400, { error: "start_time is required (HH:MM)" });
        const scheduleId = normalizeText(body?.id, 64);
        const payload = {
          academy_id: academyId,
          classroom_id: classroomId,
          day_of_week: dayOfWeek,
          start_time: startTime,
          end_time: normalizeText(body?.end_time, 10) || null,
          timezone: normalizeText(body?.timezone, 60) || "Asia/Tashkent",
          label: normalizeText(body?.label, 120) || null,
          is_active: body?.is_active !== false,
          created_by: userId,
        };
        if (scheduleId) {
          const { data, error } = await sb.from("academy_classroom_schedules").update(payload).eq("id", scheduleId).eq("academy_id", academyId)
            .select("id, classroom_id, day_of_week, start_time, end_time, timezone, label, is_active").maybeSingle();
          if (error) return json(500, { error: "Failed to update schedule", detail: error.message });
          return json(200, { schedule: data });
        }
        const { data, error } = await sb.from("academy_classroom_schedules").insert(payload)
          .select("id, classroom_id, day_of_week, start_time, end_time, timezone, label, is_active").maybeSingle();
        if (error) return json(500, { error: "Failed to create schedule slot", detail: error.message });
        return json(200, { schedule: data });
      }

      if (actionBody === "delete_schedule") {
        const scheduleId = normalizeText(body?.id, 64);
        if (!scheduleId) return json(400, { error: "id is required" });
        const { data: scheduleRow, error: scheduleLoadError } = await sb.from("academy_classroom_schedules")
          .select("id, classroom_id")
          .eq("id", scheduleId)
          .eq("academy_id", academyId)
          .maybeSingle();
        if (scheduleLoadError) return json(500, { error: "Failed to load schedule slot", detail: scheduleLoadError.message });
        if (!scheduleRow?.id) return json(404, { error: "Schedule slot not found" });
        if (!accessCanUseClassroom(access, scheduleRow.classroom_id)) return json(403, { error: "Forbidden" });
        const { error } = await sb.from("academy_classroom_schedules").delete().eq("id", scheduleId).eq("academy_id", academyId);
        if (error) return json(500, { error: "Failed to delete schedule slot", detail: error.message });
        return json(200, { ok: true });
      }

      if (actionBody === "record_placement") {
        const contactId = normalizeText(body?.contact_id, 64);
        if (!contactId) return json(400, { error: "contact_id is required" });
        const score = typeof body?.diagnostic_score === "number" ? body.diagnostic_score
          : typeof body?.score === "number" ? body.score : null;
        const manualLevel = normalizeText(body?.level, 20).toUpperCase() || null;

        const { data: contactRow } = await sb.from("academy_contacts").select("id").eq("academy_id", academyId).eq("id", contactId).maybeSingle();
        if (!contactRow?.id) return json(404, { error: "Contact not found" });

        // CEFR placement bands (0–100). Manual level overrides.
        const level = manualLevel ?? (score !== null ? placementBand(score) : null);
        if (!level) return json(400, { error: "score or level is required" });

        const { error: updErr } = await sb.from("academy_contacts")
          .update({ placement_level: level, placement_score: score })
          .eq("academy_id", academyId).eq("id", contactId);
        if (updErr) return json(500, { error: "Failed to record placement", detail: updErr.message });

        // Suggest classrooms tagged with this level in metadata.level
        const { data: classroomRows } = await sb.from("academy_classrooms")
          .select("id, name, metadata, is_active").eq("academy_id", academyId).eq("is_active", true).limit(500);
        const suggested = ((classroomRows ?? []) as Array<Record<string, unknown>>)
          .filter((c) => String((toJsonObject(c.metadata).level) ?? "").toUpperCase() === level)
          .map((c) => ({ id: String(c.id), name: String(c.name ?? "") }));

        return json(200, { contact_id: contactId, level, score, suggested_classrooms: suggested });
      }

      if (actionBody === "upsert_staff") {
        const staffEmail = normalizeEmail(body?.staff_email ?? body?.email);
        if (!staffEmail) return json(400, { error: "staff_email is required" });
        const role = normalizeText(body?.staff_role ?? body?.role, 20).toLowerCase() || "teacher";
        if (!["teacher", "manager", "assistant"].includes(role)) return json(400, { error: "Invalid role" });
        const classroomIds = Array.isArray(body?.classroom_ids)
          ? (body.classroom_ids as unknown[]).map((c) => normalizeText(c, 64)).filter(Boolean)
          : [];

        const { data: userRow } = await sb.from("users").select("id").eq("email", staffEmail).maybeSingle();

        const payload = {
          academy_id: academyId,
          user_id: userRow?.id ? String(userRow.id) : null,
          email: staffEmail,
          display_name: normalizeText(body?.name ?? body?.title, 160) || null,
          role,
          classroom_ids: classroomIds,
          is_active: body?.is_active !== false,
          created_by: userId,
        };

        const { data, error } = await sb.from("academy_staff")
          .upsert(payload, { onConflict: "academy_id,email" })
          .select("id, academy_id, user_id, email, display_name, role, classroom_ids, is_active, created_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to save staff", detail: error.message });
        return json(200, { staff: data });
      }

      if (actionBody === "remove_staff") {
        const staffId = normalizeText(body?.id, 64);
        if (!staffId) return json(400, { error: "id is required" });
        const { error } = await sb.from("academy_staff").delete().eq("id", staffId).eq("academy_id", academyId);
        if (error) return json(500, { error: "Failed to remove staff", detail: error.message });
        return json(200, { ok: true });
      }

      if (actionBody === "issue_academy_certificate") {
        const contactId = normalizeText(body?.contact_id, 64);
        const classroomId = normalizeText(body?.classroom_id, 64);
        const examType = normalizeText(body?.exam_type, 40).toLowerCase() || "academy";

        if (!contactId) return json(400, { error: "contact_id is required" });
        await ensureContactInAccessScope(sb, academyId, access, contactId);
        if (classroomId && !accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });

        const { data: contact } = await sb.from("academy_contacts")
          .select("id, user_id, first_name, last_name, email").eq("id", contactId).eq("academy_id", academyId).maybeSingle();
        if (!contact?.id) return json(404, { error: "Contact not found" });

        const targetUserId = contact.user_id ? String(contact.user_id) : null;
        if (!targetUserId) return json(400, { error: "Student has no linked user account yet" });

        const { data: academyRow } = await sb.from("tenants").select("name, metadata").eq("id", academyId).maybeSingle();
        const centerName = normalizeText(body?.center_name, 120) || String(academyRow?.name ?? "");
        const centerLogoUrl = (academyRow?.metadata as any)?.logo_url ?? null;
        const candidateName = normalizeText(body?.candidate_name, 120) ||
          `${String(contact.first_name ?? "")} ${String(contact.last_name ?? "")}`.trim() ||
          String(contact.email ?? "Student");

        let compositeScore: number | null = typeof body?.overall_score === "number" ? body.overall_score : null;
        if (!compositeScore && classroomId) {
          const [asgnRes, subRes] = await Promise.all([
            sb.from("academy_assignments").select("id, max_score, score_weight").eq("academy_id", academyId).eq("classroom_id", classroomId).neq("status", "archived").limit(200),
            sb.from("academy_submissions").select("assignment_id, score, max_score").eq("academy_id", academyId).eq("contact_id", contactId).eq("classroom_id", classroomId).limit(500),
          ]);
          const subMap = new Map((asgnRes.data ?? []).map((a: any) => [a.id, a]));
          let totalScore = 0, totalWeight = 0;
          for (const s of (subRes.data ?? []) as Array<any>) {
            if (typeof s.score !== "number") continue;
            const asgn = subMap.get(s.assignment_id) as any;
            if (!asgn) continue;
            const maxS = Number(s.max_score ?? asgn.max_score ?? 100);
            if (maxS <= 0) continue;
            const w = Number(asgn.score_weight ?? 1);
            totalScore += (s.score / maxS) * 100 * w;
            totalWeight += w;
          }
          if (totalWeight > 0) compositeScore = Math.round((totalScore / totalWeight) * 10) / 10;
        }

        const { data: cert, error: certErr } = await sb.from("issued_certificates").insert({
          user_id: targetUserId,
          tenant_id: academyId,
          exam_type: examType,
          overall_score: compositeScore,
          candidate_name: candidateName,
          exam_date: new Date().toISOString().slice(0, 10),
          center_name: centerName,
          center_logo_url: centerLogoUrl,
          is_public: true,
          metadata: { academy_id: academyId, contact_id: contactId, classroom_id: classroomId || null, issued_by: userId },
        }).select("id, public_token, candidate_name, overall_score, issued_at").maybeSingle();
        if (certErr) return json(500, { error: "Failed to issue certificate", detail: certErr.message });

        const siteUrl = Deno.env.get("SITE_URL") ?? "https://schood.online";
        return json(200, { certificate: cert, share_url: `${siteUrl}/certificate?token=${cert?.public_token}` });
      }

      if (actionBody === "compute_at_risk") {
        let classroomId = normalizeText(body?.classroom_id, 64) || null;
        const scopedClassroomIds = academyAccessClassroomIds(access);
        if (classroomId && !accessCanUseClassroom(access, classroomId)) return json(403, { error: "Forbidden" });
        if (!classroomId && scopedClassroomIds !== null) {
          if (scopedClassroomIds.length !== 1) return json(400, { error: "classroom_id is required" });
          classroomId = scopedClassroomIds[0];
        }
        const { atRisk, scanned } = await computeAtRiskForAcademy(sb, academyId, classroomId);
        return json(200, { at_risk: atRisk, scanned });
      }

      if (actionBody === "dispatch_notifications") {
        const result = await dispatchQueuedNotifications(sb, academyId);
        return json(200, result);
      }

      if (actionBody === "generate_parent_report") {
        const contactId = normalizeText(body?.contact_id, 64);
        const label = normalizeText(body?.label, 120) || null;
        const expiresInDays = typeof body?.expires_in_days === "number" ? Math.min(Math.max(1, body.expires_in_days), 365) : 180;

        if (!contactId) return json(400, { error: "contact_id is required" });
        await ensureContactInAccessScope(sb, academyId, access, contactId);

        const { data: contact } = await sb.from("academy_contacts").select("id, first_name, last_name").eq("id", contactId).eq("academy_id", academyId).maybeSingle();
        if (!contact?.id) return json(404, { error: "Contact not found" });

        const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();
        const { data: tokenRow, error: tokenErr } = await sb.from("parent_report_tokens")
          .insert({ academy_id: academyId, contact_id: contactId, created_by: userId, label, expires_at: expiresAt })
          .select("id, token, label, expires_at").maybeSingle();
        if (tokenErr) return json(500, { error: "Failed to generate report link", detail: tokenErr.message });

        const siteUrl = Deno.env.get("SITE_URL") ?? "https://schood.online";
        return json(200, {
          token: tokenRow,
          share_url: `${siteUrl}/parent-report?token=${tokenRow?.token}`,
          contact: { id: contact.id, name: `${contact.first_name} ${contact.last_name}`.trim() },
        });
      }

      if (actionBody === "upsert_branding") {
        const payload: Record<string, unknown> = { academy_id: academyId, updated_at: new Date().toISOString() };
        const fields = ["display_name", "tagline", "logo_url", "favicon_url", "primary_color", "accent_color", "hide_schood_logo", "custom_domain", "footer_text"];
        for (const field of fields) {
          if (body && Object.prototype.hasOwnProperty.call(body, field)) {
            payload[field] = field === "hide_schood_logo" ? Boolean(body[field]) : normalizeText(body[field], field.includes("url") ? 500 : 300) || null;
          }
        }
        const { data, error } = await sb.from("academy_branding")
          .upsert(payload, { onConflict: "academy_id" })
          .select("id, academy_id, display_name, tagline, logo_url, primary_color, accent_color, hide_schood_logo, custom_domain, footer_text, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to save branding", detail: error.message });
        return json(200, { branding: data });
      }

      return json(400, { error: "Unknown action" });
    }

    return json(404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return json(status, { error: message });
  }
});
