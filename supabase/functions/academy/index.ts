import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    .select("tenant_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw new Error("Failed to load academy memberships");
  return (data ?? []) as MembershipRow[];
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
      .select("id, academy_id, user_id, first_name, last_name, email, phone, telegram_id, status, last_activity_at, metadata, created_at, updated_at")
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

  const { data, error } = await sb
    .from("academy_entitlements")
    .select("id, academy_id, contact_id, user_id, offer_id, payment_id, grant_type, resource_type, resource_id, capability_key, quantity, remaining, starts_at, expires_at, status, source, metadata, created_at, updated_at")
    .eq("academy_id", academyId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return json(500, { error: "Failed to load entitlements", detail: error.message });
  return json(200, { entitlements: data ?? [] });
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const anonKey = getEnv("SUPABASE_ANON_KEY");
    const serviceRole = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Unauthorized" });

    const authSb = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

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

        const payload = {
          academy_id: academyId,
          name,
          type,
          price_amount: priceAmount,
          currency,
          duration_days: durationDays,
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
          .select("id, academy_id, name, type, price_amount, currency, duration_days, description, is_active, metadata, created_at, updated_at")
          .maybeSingle();
        if (error) return json(500, { error: "Failed to create offer", detail: error.message });
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

      return json(400, { error: "Unknown action" });
    }

    return json(404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return json(status, { error: message });
  }
});
