import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { placementBand } from "../_shared/academy-scoring.ts";

type Json = Record<string, unknown>;
type SupabaseClientLike = ReturnType<typeof createClient<any>>;

type MembershipRow = { tenant_id: string; role: string; status: string };

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

const loadMemberships = async (sb: SupabaseClientLike, userId: string): Promise<MembershipRow[]> => {
  const { data, error } = await sb
    .from("tenant_memberships")
    .select("tenant_id, role, status, tenants ( id, type, metadata )")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw new Error("Failed to load academy memberships");
  return ((data ?? []) as unknown as Array<MembershipRow & { tenants?: Record<string, unknown> | Record<string, unknown>[] | null }>).filter((row) => {
    const tenant = Array.isArray((row as any).tenants) ? (row as any).tenants[0] : (row as any).tenants;
    const tenantType = String(tenant?.type ?? "").toLowerCase();
    const metadata = toJsonObject(tenant?.metadata);
    return (
      tenantType === "team" ||
      String(metadata.service_family ?? "").toLowerCase() === "academy" ||
      metadata.academy_service === true ||
      metadata.center_owned === true
    );
  });
};

const resolveAcademyId = (memberships: MembershipRow[], requested: string | null): string => {
  if (!requested) return memberships[0]?.tenant_id ?? "";
  const found = memberships.find((m) => m.tenant_id === requested);
  if (!found) throw new Error("Forbidden");
  return requested;
};

const requireAcademyAdmin = (memberships: MembershipRow[], academyId: string): void => {
  const found = memberships.find((m) => m.tenant_id === academyId);
  if (!found) throw new Error("Forbidden");
  if (!["owner", "admin"].includes(String(found.role))) throw new Error("Forbidden");
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

  const teacherMembership =
    memberships.find((row) => {
      if (row.tenant_id !== academyId || row.status !== "active") return false;
      const role = String(row.role ?? "").toLowerCase();
      return role === "owner" || role === "admin";
    }) ?? null;
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
          };
        })
        .filter((item): item is NonNullable<typeof item> => !!item),
    });
  }

  const academyId = resolveAcademyId(memberships, academyIdRaw);

  if (action === "summary") {
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
      counts: {
        contacts: contacts ?? 0,
        classrooms: classrooms ?? 0,
        offers: offers ?? 0,
        active_entitlements: entitlements ?? 0,
        open_alerts: alertsOpen ?? 0,
      },
    });
  }

  if (action === "contacts") {
    const { data, error } = await sb
      .from("academy_contacts")
      .select("id, academy_id, user_id, first_name, last_name, email, phone, telegram_id, status, last_activity_at, placement_level, placement_score, notify_enabled, metadata, created_at, updated_at")
      .eq("academy_id", academyId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) return json(500, { error: "Failed to load contacts", detail: error.message });
    return json(200, { contacts: data ?? [] });
  }

  if (action === "classrooms") {
    const { data, error } = await sb
      .from("academy_classrooms")
      .select("id, academy_id, name, description, is_active, metadata, created_at, updated_at")
      .eq("academy_id", academyId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) return json(500, { error: "Failed to load classrooms", detail: error.message });

    const { data: membershipRows, error: membershipError } = await sb
      .from("academy_classroom_memberships")
      .select("classroom_id")
      .eq("academy_id", academyId)
      .limit(5000);
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
    const classroomId = normalizeText(classroomIdRaw, 64) || null;

    let query = sb
      .from("academy_classroom_memberships")
      .select("id, academy_id, classroom_id, contact_id, role, joined_at, metadata")
      .eq("academy_id", academyId)
      .order("joined_at", { ascending: false })
      .limit(1000);

    if (classroomId) query = query.eq("classroom_id", classroomId);
    const { data, error } = await query;
    if (error) return json(500, { error: "Failed to load classroom memberships", detail: error.message });
    return json(200, { classroom_memberships: data ?? [] });
  }

  if (action === "conversations") {
    const { data: conversations, error: conversationError } = await sb
      .from("academy_conversations")
      .select("id, academy_id, contact_id, created_at, updated_at")
      .eq("academy_id", academyId)
      .order("updated_at", { ascending: false })
      .limit(500);
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
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
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
    const contactId = normalizeText(contactIdRaw, 64) || null;
    let query = sb
      .from("academy_alerts")
      .select("id, academy_id, contact_id, type, severity, message, resolved, resolved_at, metadata, created_at")
      .eq("academy_id", academyId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (contactId) query = query.eq("contact_id", contactId);
    const { data, error } = await query;
    if (error) return json(500, { error: "Failed to load alerts", detail: error.message });
    return json(200, { alerts: data ?? [] });
  }

  if (action === "offers") {
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
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    let query = sb
      .from("academy_assignments")
      .select("id, academy_id, classroom_id, title, description, assignment_type, experience_id, due_at, released_at, prerequisite_id, position, max_score, score_weight, status, metadata, created_by, created_at, updated_at")
      .eq("academy_id", academyId)
      .neq("status", "archived")
      .order("position", { ascending: true });
    if (classroomId) query = query.eq("classroom_id", classroomId);
    const { data, error } = await query.limit(500);
    if (error) return json(500, { error: "Failed to load assignments", detail: error.message });
    return json(200, { assignments: data ?? [] });
  }

  // ── LMS: Submissions / Gradebook ────────────────────────────────────────

  if (action === "submissions") {
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    const assignmentId = normalizeText(contactIdRaw, 64) || null; // reuse contactId param slot
    let query = sb
      .from("academy_submissions")
      .select("id, academy_id, assignment_id, classroom_id, contact_id, user_id, session_id, score, max_score, status, submitted_at, graded_at, graded_by, notes, metadata, created_at, updated_at")
      .eq("academy_id", academyId)
      .order("submitted_at", { ascending: false });
    if (classroomId) query = query.eq("classroom_id", classroomId);
    if (assignmentId) query = query.eq("assignment_id", assignmentId);
    const { data, error } = await query.limit(2000);
    if (error) return json(500, { error: "Failed to load submissions", detail: error.message });
    return json(200, { submissions: data ?? [] });
  }

  if (action === "gradebook") {
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    if (!classroomId) return json(400, { error: "classroom_id is required for gradebook" });

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
    const contactId = normalizeText(contactIdRaw, 64) || null;
    if (!contactId) return json(400, { error: "contact_id is required for student_progress" });

    const [contactResult, membershipsResult, submissionsResult, attendanceResult] = await Promise.all([
      sb.from("academy_contacts")
        .select("id, first_name, last_name, email, phone, status, last_activity_at, metadata, created_at")
        .eq("academy_id", academyId).eq("id", contactId).maybeSingle(),
      sb.from("academy_classroom_memberships")
        .select("classroom_id, role, joined_at, academy_classrooms(id, name, is_active)")
        .eq("academy_id", academyId).eq("contact_id", contactId).limit(50),
      sb.from("academy_submissions")
        .select("id, assignment_id, score, max_score, status, submitted_at, graded_at, notes, academy_assignments(title, assignment_type, due_at, max_score)")
        .eq("academy_id", academyId).eq("contact_id", contactId)
        .order("submitted_at", { ascending: false }).limit(200),
      sb.from("academy_attendance")
        .select("session_date, status, notes, marked_at")
        .eq("academy_id", academyId).eq("contact_id", contactId)
        .order("session_date", { ascending: false }).limit(90),
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
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    if (!classroomId) return json(400, { error: "classroom_id is required" });

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
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    let query = sb
      .from("academy_bulk_invites")
      .select("id, classroom_id, email, first_name, last_name, status, invited_at, joined_at, error")
      .eq("academy_id", academyId)
      .order("invited_at", { ascending: false });
    if (classroomId) query = query.eq("classroom_id", classroomId);
    const { data, error } = await query.limit(500);
    if (error) return json(500, { error: "Failed to load bulk invites", detail: error.message });
    return json(200, { bulk_invites: data ?? [] });
  }

  if (action === "referral_leaderboard") {
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
    const { data, error } = await sb.from("academy_staff")
      .select("id, academy_id, user_id, email, display_name, role, classroom_ids, is_active, created_at")
      .eq("academy_id", academyId).order("created_at", { ascending: false }).limit(500);
    if (error) return json(500, { error: "Failed to load staff", detail: error.message });
    return json(200, { staff: data ?? [] });
  }

  if (action === "owner_dashboard") {
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

    return json(200, {
      revenue: { currency, collected_total: collectedTotal, collected_this_month: collectedThisMonth, outstanding, paid_count: paid.length },
      funnel,
      total_students: contacts.length,
      total_classrooms: classrooms.length,
      classroom_stats: classroomStats,
      attendance_trend: trend,
    });
  }

  if (action === "branding") {
    const { data, error } = await sb.from("academy_branding")
      .select("id, academy_id, display_name, tagline, logo_url, favicon_url, primary_color, accent_color, hide_schood_logo, custom_domain, custom_domain_verified, footer_text, metadata, updated_at")
      .eq("academy_id", academyId).maybeSingle();
    if (error) return json(500, { error: "Failed to load branding", detail: error.message });
    return json(200, { branding: data ?? null });
  }

  if (action === "notifications") {
    const { data, error } = await sb.from("academy_notifications")
      .select("id, contact_id, channel, type, title, body, status, error, sent_at, scheduled_at, created_at")
      .eq("academy_id", academyId).order("created_at", { ascending: false }).limit(200);
    if (error) return json(500, { error: "Failed to load notifications", detail: error.message });
    return json(200, { notifications: data ?? [] });
  }

  if (action === "classroom_billing") {
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    if (!classroomId) return json(400, { error: "classroom_id is required" });

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
    const classroomId = normalizeText(classroomIdRaw, 64) || null;
    let query = sb.from("academy_classroom_schedules")
      .select("id, academy_id, classroom_id, day_of_week, start_time, end_time, timezone, label, is_active, created_at")
      .eq("academy_id", academyId).eq("is_active", true).order("day_of_week").order("start_time");
    if (classroomId) query = query.eq("classroom_id", classroomId);
    const { data, error } = await query.limit(200);
    if (error) return json(500, { error: "Failed to load schedule", detail: error.message });
    return json(200, { schedule: data ?? [] });
  }

  const { data, error } = await sb
    .from("academy_entitlements")
    .select("id, academy_id, contact_id, user_id, offer_id, payment_id, grant_type, resource_type, resource_id, capability_key, quantity, remaining, starts_at, expires_at, status, source, metadata, created_at, updated_at")
    .eq("academy_id", academyId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return json(500, { error: "Failed to load entitlements", detail: error.message });
  return json(200, { entitlements: data ?? [] });
};

// ── Engagement maintenance (shared by manual actions + cron worker) ───────────

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
const queueDueReminders = async (sb: SupabaseClientLike): Promise<number> => {
  const nowIso = new Date().toISOString();
  const in24hIso = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const { data: asgnRows } = await sb.from("academy_assignments")
    .select("id, academy_id, classroom_id, title, due_at")
    .eq("status", "active").gte("due_at", nowIso).lte("due_at", in24hIso).limit(2000);
  const assignments = (asgnRows ?? []) as Array<Record<string, unknown>>;
  if (assignments.length === 0) return 0;

  let queued = 0;
  for (const a of assignments) {
    const academyId = String(a.academy_id);
    const classroomId = String(a.classroom_id);
    const assignmentId = String(a.id);

    const [{ data: members }, { data: subs }, { data: existing }] = await Promise.all([
      sb.from("academy_classroom_memberships").select("contact_id, academy_contacts(id, first_name, telegram_id, notify_enabled)").eq("academy_id", academyId).eq("classroom_id", classroomId).in("role", ["student", "observer"]).limit(1000),
      sb.from("academy_submissions").select("contact_id, status").eq("assignment_id", assignmentId).limit(2000),
      sb.from("academy_notifications").select("contact_id").eq("academy_id", academyId).eq("type", "assignment_due").eq("metadata->>assignment_id", assignmentId).limit(5000),
    ]);
    const submitted = new Set(((subs ?? []) as Array<Record<string, unknown>>).filter((s) => s.status !== "missing").map((s) => String(s.contact_id)));
    const reminded = new Set(((existing ?? []) as Array<Record<string, unknown>>).map((e) => String(e.contact_id)));

    for (const m of (members ?? []) as Array<Record<string, unknown>>) {
      const c = (m.academy_contacts as any) ?? {};
      const contactId = String(c.id ?? m.contact_id ?? "");
      if (!contactId || submitted.has(contactId) || reminded.has(contactId)) continue;
      const telegram = normalizeText(c.telegram_id, 120);
      if (!telegram || c.notify_enabled === false) continue;
      await sb.from("academy_notifications").insert({
        academy_id: academyId, contact_id: contactId, channel: "telegram", type: "assignment_due",
        title: "Assignment due soon", body: `Reminder: "${String(a.title)}" is due ${new Date(String(a.due_at)).toLocaleString()}.`,
        target: telegram, status: "queued", scheduled_at: nowIso, metadata: { assignment_id: assignmentId },
      });
      queued++;
    }
  }
  return queued;
};

// Queue reminders for class sessions scheduled today (one per student per slot, deduped).
const queueClassReminders = async (sb: SupabaseClientLike): Promise<number> => {
  const now = new Date();
  const dow = now.getUTCDay();
  const today = now.toISOString().slice(0, 10);
  const nowIso = now.toISOString();

  const { data: slotRows } = await sb.from("academy_classroom_schedules")
    .select("id, academy_id, classroom_id, start_time, label").eq("is_active", true).eq("day_of_week", dow).limit(1000);
  const slots = (slotRows ?? []) as Array<Record<string, unknown>>;
  if (slots.length === 0) return 0;

  let queued = 0;
  for (const slot of slots) {
    const academyId = String(slot.academy_id);
    const classroomId = String(slot.classroom_id);
    const slotId = String(slot.id);

    const [{ data: members }, { data: existing }, { data: cl }] = await Promise.all([
      sb.from("academy_classroom_memberships").select("contact_id, academy_contacts(id, telegram_id, notify_enabled)").eq("academy_id", academyId).eq("classroom_id", classroomId).in("role", ["student", "observer"]).limit(1000),
      sb.from("academy_notifications").select("contact_id").eq("academy_id", academyId).eq("type", "class_reminder").eq("metadata->>slot_id", slotId).eq("metadata->>date", today).limit(5000),
      sb.from("academy_classrooms").select("name").eq("id", classroomId).maybeSingle(),
    ]);
    const reminded = new Set(((existing ?? []) as Array<Record<string, unknown>>).map((e) => String(e.contact_id)));
    const className = cl?.name ? `"${String(cl.name)}"` : "class";

    for (const m of (members ?? []) as Array<Record<string, unknown>>) {
      const c = (m.academy_contacts as any) ?? {};
      const contactId = String(c.id ?? m.contact_id ?? "");
      if (!contactId || reminded.has(contactId)) continue;
      const telegram = normalizeText(c.telegram_id, 120);
      if (!telegram || c.notify_enabled === false) continue;
      await sb.from("academy_notifications").insert({
        academy_id: academyId, contact_id: contactId, channel: "telegram", type: "class_reminder",
        title: "Class today", body: `You have ${className} today at ${String(slot.start_time)}${slot.label ? ` (${String(slot.label)})` : ""}.`,
        target: telegram, status: "queued", scheduled_at: nowIso, metadata: { slot_id: slotId, date: today },
      });
      queued++;
    }
  }
  return queued;
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

    const memberships = await loadMemberships(sb, userId);

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
          },
        });
      }

      const academyId = resolveAcademyId(memberships, normalizeText(body?.academy_id, 64) || null);
      requireAcademyAdmin(memberships, academyId);

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

        const { data, error } = await sb.from("academy_attendance")
          .upsert(rows, { onConflict: "classroom_id,contact_id,session_date" })
          .select("id, classroom_id, contact_id, session_date, status, notes");
        if (error) return json(500, { error: "Failed to mark attendance", detail: error.message });
        return json(200, { attendance: data ?? [], count: (data ?? []).length });
      }

      if (actionBody === "bulk_invite") {
        const classroomId = normalizeText(body?.classroom_id, 64) || null;
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
        const classroomId = normalizeText(body?.classroom_id, 64) || null;
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
