import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalRequest } from "../_shared/internal-auth.ts";
import { validateTelegramInitData } from "../_shared/telegram-init-data.ts";
import { configureAcademyTelegramProvider } from "./provider-config.ts";
import {
  academyAccessHas,
  academyAccessProfile,
  academyAccessScope,
  academyRoleGrantToMembership,
  academyRoleRank,
  buildAcademyPermissions,
  isAcademyAdminRole,
  normalizeAcademyRole,
  type MembershipRow,
} from "../academy/access.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});
const clean = (value: unknown, max = 300): string => String(value ?? "").trim().slice(0, max);
const lower = (value: unknown, max = 80): string => clean(value, max).toLowerCase();
const unique = (values: unknown): string[] => Array.isArray(values)
  ? Array.from(new Set(values.map((value) => clean(value, 64)).filter(Boolean)))
  : [];
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};
const env = (key: string): string => {
  const value = Deno.env.get(key)?.trim();
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};
const academyBotName = (): string => (Deno.env.get("ACADEMY_TELEGRAM_BOT_NAME")?.trim() || "schoodacademybot").replace(/^@/, "");
const academySiteUrl = (): string => (Deno.env.get("ACADEMY_SITE_URL")?.trim() || "https://academy.schood.online").replace(/\/$/, "");
const academyWorkerUrl = (): string => (Deno.env.get("ACADEMY_TELEGRAM_WORKER_URL")?.trim() || "https://academy-bot.schood.online").replace(/\/$/, "");
const sha256 = async (value: string): Promise<string> => Array.from(
  new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
).map((byte) => byte.toString(16).padStart(2, "0")).join("");
const base64Url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes))
  .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const randomToken = (): string => base64Url(crypto.getRandomValues(new Uint8Array(32)));

type Db = ReturnType<typeof createClient<any>>;
type UserRow = { id: string; email: string | null; full_name: string | null; telegram_chat_id: string | null };
type Access = MembershipRow & { academy_name: string; permissions: ReturnType<typeof buildAcademyPermissions> };
type BotUpdate = {
  update_id?: number;
  message?: Record<string, any>;
  callback_query?: Record<string, any>;
  my_chat_member?: Record<string, any>;
};

const telegramApi = async (method: string, body: Record<string, unknown>): Promise<Record<string, any>> => {
  const response = await fetch(`https://api.telegram.org/bot${env("ACADEMY_TELEGRAM_BOT_TOKEN")}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok || payload.ok === false) throw new Error(`Telegram ${method} failed (${response.status})`);
  return payload;
};

let providerConfiguration: Promise<void> | null = null;
let providerConfiguredAt = 0;
const ensureTelegramProviderConfiguration = async (): Promise<void> => {
  if (Date.now() - providerConfiguredAt < 5 * 60_000) return;
  if (providerConfiguration) return await providerConfiguration;
  providerConfiguration = (async () => {
    await configureAcademyTelegramProvider({
      call: telegramApi,
      botName: academyBotName(),
      siteUrl: academySiteUrl(),
      workerUrl: academyWorkerUrl(),
      webhookSecret: env("ACADEMY_TELEGRAM_WEBHOOK_SECRET"),
    });
    providerConfiguredAt = Date.now();
  })().finally(() => { providerConfiguration = null; });
  return await providerConfiguration;
};

const audit = async (
  sb: Db,
  access: Pick<MembershipRow, "role">,
  academyId: string,
  actorUserId: string | null,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
  classroomId: string | null = null,
) => {
  const { error } = await sb.from("academy_audit_events").insert({
    academy_id: academyId,
    actor_user_id: actorUserId,
    actor_role: normalizeAcademyRole(access.role),
    action,
    target_type: targetType,
    target_id: targetId,
    classroom_id: classroomId,
    metadata,
  });
  if (error) throw new Error(`Failed to record Academy audit: ${error.message}`);
};

const academyTenant = (tenant: Record<string, unknown> | null): boolean => {
  const metadata = asRecord(tenant?.metadata);
  return lower(tenant?.type, 40) === "team" || lower(metadata.service_family, 40) === "academy"
    || metadata.academy_service === true || metadata.center_owned === true;
};

const loadUserByTelegram = async (sb: Db, telegramUserId: string): Promise<UserRow | null> => {
  const { data, error } = await sb.from("users")
    .select("id,email,full_name,telegram_chat_id")
    .eq("telegram_chat_id", telegramUserId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load linked Telegram user: ${error.message}`);
  return data?.id ? data as UserRow : null;
};

const loadAccess = async (sb: Db, user: UserRow): Promise<Access[]> => {
  const candidates: MembershipRow[] = [];
  const names = new Map<string, string>();
  const { data: memberships, error: membershipError } = await sb.from("tenant_memberships")
    .select("tenant_id,role,status,tenants(id,name,type,metadata)")
    .eq("user_id", user.id).eq("status", "active").limit(500);
  if (membershipError) throw new Error(`Failed to load Academy memberships: ${membershipError.message}`);

  const centerCandidates: string[] = [];
  for (const row of memberships ?? []) {
    const tenantRaw = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
    const tenant = tenantRaw as Record<string, unknown> | null;
    if (tenant?.id) names.set(String(tenant.id), clean(tenant.name, 160) || "Academy");
    if (["owner", "admin"].includes(normalizeAcademyRole(row.role))) centerCandidates.push(String(row.tenant_id));
    if (!academyTenant(tenant)) continue;
    candidates.push({
      tenant_id: String(row.tenant_id), role: normalizeAcademyRole(row.role), status: "active",
      source: "tenant", classroom_ids: [], branch_ids: [],
    });
  }

  if (centerCandidates.length) {
    const { data: centers } = await sb.from("partner_center_profiles").select("tenant_id").in("tenant_id", centerCandidates);
    for (const center of centers ?? []) {
      const centerId = String(center.tenant_id ?? "");
      if (!centerId) continue;
      const { data: children, error } = await sb.from("tenants").select("id,name")
        .contains("metadata", { parent_center_id: centerId, service_family: "academy" }).limit(500);
      if (error) throw new Error(`Failed to load center academies: ${error.message}`);
      for (const child of children ?? []) {
        names.set(String(child.id), clean(child.name, 160) || "Academy");
        candidates.push({ tenant_id: String(child.id), role: "center_admin", status: "active", source: "center", center_tenant_id: centerId, classroom_ids: [], branch_ids: [] });
      }
    }
  }

  const grants = new Map<string, Record<string, unknown>>();
  const grantSelect = "id,academy_id,role,status,scope_type,scope_ids,starts_at,expires_at";
  const grantQueries = [
    sb.from("academy_role_grants").select(grantSelect).eq("user_id", user.id).in("status", ["active", "invited"]).limit(500),
    user.email ? sb.from("academy_role_grants").select(grantSelect).eq("email", user.email.toLowerCase()).in("status", ["active", "invited"]).limit(500) : Promise.resolve({ data: [], error: null }),
  ];
  for (const result of await Promise.all(grantQueries)) {
    if (result.error) throw new Error(`Failed to load Academy grants: ${result.error.message}`);
    for (const grant of result.data ?? []) grants.set(String(grant.id), grant as Record<string, unknown>);
  }
  for (const grant of grants.values()) {
    const access = academyRoleGrantToMembership(grant);
    if (access) candidates.push(access);
  }

  const staff = new Map<string, Record<string, unknown>>();
  const staffSelect = "id,academy_id,role,classroom_ids";
  const staffQueries = [
    sb.from("academy_staff").select(staffSelect).eq("user_id", user.id).eq("is_active", true).limit(500),
    user.email ? sb.from("academy_staff").select(staffSelect).eq("email", user.email.toLowerCase()).eq("is_active", true).limit(500) : Promise.resolve({ data: [], error: null }),
  ];
  for (const result of await Promise.all(staffQueries)) {
    if (result.error) throw new Error(`Failed to load Academy staff: ${result.error.message}`);
    for (const row of result.data ?? []) staff.set(String(row.id), row as Record<string, unknown>);
  }
  const staffIds = Array.from(staff.keys());
  const branchMap = new Map<string, string[]>();
  if (staffIds.length) {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await sb.from("academy_staff_branch_assignments").select("staff_id,branch_id")
      .in("staff_id", staffIds).eq("status", "active").lte("starts_on", today)
      .or(`ends_on.is.null,ends_on.gte.${today}`).limit(2000);
    if (error) throw new Error(`Failed to load staff branches: ${error.message}`);
    for (const row of data ?? []) {
      const id = String(row.staff_id); const values = branchMap.get(id) ?? [];
      values.push(String(row.branch_id)); branchMap.set(id, values);
    }
  }
  for (const [staffId, row] of staff) {
    const role = normalizeAcademyRole(row.role);
    candidates.push({
      tenant_id: String(row.academy_id), role, status: "active", source: "staff", staff_id: staffId,
      classroom_ids: unique(row.classroom_ids), branch_ids: Array.from(new Set(branchMap.get(staffId) ?? [])),
    });
  }

  const ids = Array.from(new Set(candidates.map((row) => row.tenant_id).filter(Boolean)));
  if (ids.length) {
    const { data } = await sb.from("tenants").select("id,name").in("id", ids);
    for (const tenant of data ?? []) names.set(String(tenant.id), clean(tenant.name, 160) || "Academy");
  }

  const best = new Map<string, MembershipRow>();
  for (const access of candidates) {
    const current = best.get(access.tenant_id);
    if (!current || academyRoleRank(access.role) > academyRoleRank(current.role)) best.set(access.tenant_id, access);
  }
  return Array.from(best.values()).map((access) => ({
    ...access,
    academy_name: names.get(access.tenant_id) ?? "Academy",
    permissions: buildAcademyPermissions(access),
  })).sort((left, right) => left.academy_name.localeCompare(right.academy_name));
};

const accessFor = (access: Access[], academyId: string): Access => {
  const selected = access.find((row) => row.tenant_id === academyId);
  if (!selected) throw new Error("Forbidden");
  return selected;
};
const canUseBranch = (access: Access, branchId: string | null | undefined): boolean => {
  if (!branchId || academyAccessScope(access) === "academy") return true;
  return unique(access.branch_ids).includes(branchId);
};
const canUseClassroom = async (sb: Db, access: Access, academyId: string, classroomId: string): Promise<boolean> => {
  if (academyAccessScope(access) === "academy") return true;
  if (unique(access.classroom_ids).includes(classroomId)) return true;
  const { data } = await sb.from("academy_classrooms").select("id,branch_id").eq("academy_id", academyId).eq("id", classroomId).maybeSingle();
  return Boolean(data?.id && canUseBranch(access, data.branch_id ? String(data.branch_id) : null));
};
const requirePermission = (access: Access, permission: keyof Access["permissions"]) => {
  if (!academyAccessHas(access, permission)) throw new Error("Forbidden");
};
const seniorPublisher = (access: Access): boolean => isAcademyAdminRole(access.role);

const issueLink = async (sb: Db, user: UserRow, access: Access, body: Record<string, unknown>, intent: "staff_link" | "group_link") => {
  if (intent === "group_link") requirePermission(access, "manageAutomation");
  const purpose = intent === "group_link" ? lower(body.purpose, 40) : null;
  const allowed = new Set(["academy_staff", "branch_staff", "classroom_community", "classroom_guardians"]);
  if (purpose && !allowed.has(purpose)) throw new Error("A valid group purpose is required");
  const branchId = clean(body.branch_id, 64) || null;
  const classroomId = clean(body.classroom_id, 64) || null;
  if (purpose === "branch_staff" && (!branchId || !canUseBranch(access, branchId))) throw new Error("Forbidden");
  if ((purpose === "classroom_community" || purpose === "classroom_guardians") && (!classroomId || !(await canUseClassroom(sb, access, access.tenant_id, classroomId)))) throw new Error("Forbidden");
  if (purpose === "academy_staff" && !seniorPublisher(access)) throw new Error("Forbidden");
  const token = randomToken();
  const { error } = await sb.from("academy_telegram_link_tokens").insert({
    token_hash: await sha256(token), intent, academy_id: access.tenant_id, user_id: user.id,
    branch_id: branchId, classroom_id: classroomId, purpose,
    locale: ["en", "uz", "ru"].includes(lower(body.locale, 2)) ? lower(body.locale, 2) : "uz",
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) throw new Error(`Failed to create Telegram link: ${error.message}`);
  const bot = academyBotName();
  const parameter = `${intent === "group_link" ? "group" : "staff"}_${token}`;
  return { expires_in_seconds: 600, url: intent === "group_link" ? `https://t.me/${bot}?startgroup=${parameter}` : `https://t.me/${bot}?start=${parameter}` };
};

const redactChat = (row: Record<string, any>) => ({
  id: row.id, academy_id: row.academy_id, branch_id: row.branch_id, classroom_id: row.classroom_id,
  purpose: row.purpose, title: row.title, locale: row.locale, status: row.status,
  message_thread_id: row.message_thread_id, capabilities: row.capabilities ?? {},
  linked_at: row.linked_at, last_verified_at: row.last_verified_at, last_error: row.last_error,
});

const scopedRows = (access: Access, rows: Array<Record<string, any>>): Array<Record<string, any>> => rows.filter((row) => {
  if (academyAccessScope(access) === "academy") return true;
  if (row.classroom_id && unique(access.classroom_ids).includes(String(row.classroom_id))) return true;
  return row.branch_id ? canUseBranch(access, String(row.branch_id)) : false;
});

const loadScopedContacts = async (sb: Db, access: Access): Promise<Array<Record<string, any>>> => {
  if (!academyAccessHas(access, "manageMessages")) return [];
  const { data, error } = await sb.from("academy_contacts")
    .select("id,user_id,first_name,last_name,status,primary_branch_id,notify_enabled")
    .eq("academy_id", access.tenant_id).in("status", ["active", "trial", "paused"])
    .order("first_name").order("last_name").limit(500);
  if (error) throw new Error(`Failed to load scoped learners: ${error.message}`);
  let rows = data ?? [];
  const scope = academyAccessScope(access);
  if (scope === "assigned_branches") {
    const branchIds = new Set(unique(access.branch_ids));
    rows = rows.filter((row: any) => branchIds.has(String(row.primary_branch_id ?? "")));
  } else if (scope === "assigned_classrooms") {
    const classroomIds = unique(access.classroom_ids);
    if (!classroomIds.length) rows = [];
    else {
      const { data: memberships, error: membershipError } = await sb.from("academy_classroom_memberships")
        .select("contact_id").eq("academy_id", access.tenant_id).in("classroom_id", classroomIds)
        .eq("role", "student").eq("status", "active").limit(2000);
      if (membershipError) throw new Error(`Failed to scope learners: ${membershipError.message}`);
      const contactIds = new Set((memberships ?? []).map((row: any) => String(row.contact_id)));
      rows = rows.filter((row: any) => contactIds.has(String(row.id)));
    }
  }
  const userIds = rows.map((row: any) => clean(row.user_id, 64)).filter(Boolean);
  const linkedUsers = new Set<string>();
  if (userIds.length) {
    const { data: users, error: userError } = await sb.from("users").select("id")
      .in("id", userIds).not("telegram_chat_id", "is", null).limit(500);
    if (userError) throw new Error(`Failed to load learner Telegram links: ${userError.message}`);
    for (const user of users ?? []) linkedUsers.add(String(user.id));
  }
  return rows.map((row: any) => ({
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    status: row.status,
    primary_branch_id: row.primary_branch_id,
    telegram_linked: Boolean(row.user_id && linkedUsers.has(String(row.user_id))),
  }));
};

const dashboard = async (sb: Db, access: Access) => {
  const academyId = access.tenant_id;
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
  const weekEnd = new Date(dayStart); weekEnd.setDate(weekEnd.getDate() + 8);
  const [settings, branches, classrooms, chats, subscriptions, sessions, requests, assignments, deliveries, contacts] = await Promise.all([
    sb.from("academy_telegram_settings").select("enabled,default_locale,timezone,digest_time,emergency_override_enabled").eq("academy_id", academyId).maybeSingle(),
    sb.from("academy_branches").select("id,name,status").eq("academy_id", academyId).order("name").limit(200),
    sb.from("academy_classrooms").select("id,name,branch_id,is_active").eq("academy_id", academyId).eq("is_active", true).order("name").limit(500),
    sb.from("academy_telegram_chats").select("*").eq("academy_id", academyId).order("created_at", { ascending: false }).limit(200),
    sb.from("academy_telegram_chat_subscriptions").select("chat_binding_id,event_type,delivery_mode,enabled,quiet_hours_start,quiet_hours_end").eq("academy_id", academyId).limit(2000),
    sb.from("academy_lesson_sessions").select("id,branch_id,classroom_id,title,starts_at,ends_at,status,delivery_mode").eq("academy_id", academyId).gte("starts_at", dayStart.toISOString()).lt("starts_at", dayEnd.toISOString()).order("starts_at").limit(300),
    sb.from("academy_service_requests").select("id,branch_id,classroom_id,requester_kind,request_type,subject,priority,status,assigned_to,created_at,sla_due_at").eq("academy_id", academyId).not("status", "in", "(completed,cancelled,rejected)").order("created_at", { ascending: false }).limit(100),
    sb.from("academy_assignments").select("id,classroom_id,title,due_at,status").eq("academy_id", academyId).eq("status", "active").gte("due_at", dayStart.toISOString()).lt("due_at", weekEnd.toISOString()).order("due_at").limit(100),
    sb.from("academy_notifications").select("id,type,title,status,error,scheduled_at,sent_at,chat_binding_id,contact_id,audience_kind,bot_kind,created_at").eq("academy_id", academyId).in("bot_kind", ["academy_staff", "student"]).order("created_at", { ascending: false }).limit(80),
    loadScopedContacts(sb, access),
  ]);
  for (const result of [settings, branches, classrooms, chats, subscriptions, sessions, requests, assignments, deliveries]) {
    if (result.error) throw new Error(`Failed to load Telegram operations: ${result.error.message}`);
  }
  const scopedBranches = academyAccessScope(access) === "academy" ? branches.data ?? [] : (branches.data ?? []).filter((row: any) => canUseBranch(access, String(row.id)));
  const scopedClassrooms = scopedRows(access, classrooms.data ?? []);
  const scopedChats = scopedRows(access, chats.data ?? []).map(redactChat);
  const chatIds = new Set(scopedChats.map((row) => row.id));
  const scopedSubscriptions = (subscriptions.data ?? []).filter((row: any) => chatIds.has(row.chat_binding_id));
  const scopedSessions = scopedRows(access, sessions.data ?? []);
  const scopedRequests = scopedRows(access, requests.data ?? []);
  const classroomIds = new Set(scopedClassrooms.map((row: any) => String(row.id)));
  const scopedAssignments = (assignments.data ?? []).filter((row: any) => classroomIds.has(String(row.classroom_id)));
  const contactIds = new Set(contacts.map((row: any) => String(row.id)));
  const scopedDeliveries = (deliveries.data ?? []).filter((row: any) => row.audience_kind === "group"
    ? chatIds.has(row.chat_binding_id)
    : Boolean(row.contact_id && contactIds.has(String(row.contact_id))));
  return {
    settings: settings.data ?? { enabled: false, default_locale: "uz", timezone: "Asia/Tashkent", digest_time: "08:00", emergency_override_enabled: true },
    branches: scopedBranches,
    classrooms: scopedClassrooms,
    groups: scopedChats,
    subscriptions: scopedSubscriptions,
    sessions: scopedSessions,
    requests: scopedRequests,
    assignments: scopedAssignments,
    contacts,
    deliveries: scopedDeliveries,
    metrics: {
      sessions_today: scopedSessions.length,
      open_requests: scopedRequests.length,
      urgent_requests: scopedRequests.filter((row: any) => ["high", "urgent"].includes(String(row.priority))).length,
      due_homework: scopedAssignments.length,
      connected_groups: scopedChats.filter((row) => row.status === "active").length,
      failed_deliveries: scopedDeliveries.filter((row: any) => row.status === "failed").length,
    },
  };
};

const callDelivery = async () => {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  await fetch(`${url}/functions/v1/send-academy-telegram`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "process_queue", limit: 50 }),
  }).catch(() => undefined);
};

const sendStudentNotification = async (payload: Record<string, unknown>): Promise<Record<string, any>> => {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${url}/functions/v1/send-telegram`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok) throw new Error("Student Telegram delivery gateway is unavailable");
  return result;
};

const sendPrivateWarning = async (sb: Db, access: Access, user: UserRow, body: Record<string, unknown>) => {
  requirePermission(access, "manageMessages");
  const contactId = clean(body.contact_id, 64);
  const title = clean(body.title, 160);
  const message = clean(body.body, 3500);
  const idempotency = clean(body.idempotency_key, 160);
  if (!contactId || !title || !message || !idempotency) throw new Error("Learner, title, message, and idempotency_key are required");
  const contacts = await loadScopedContacts(sb, access);
  const scoped = contacts.find((row: any) => String(row.id) === contactId);
  if (!scoped) throw new Error("Learner not found in your assigned scope");
  const { data: contact, error: contactError } = await sb.from("academy_contacts")
    .select("id,user_id,notify_enabled,status").eq("academy_id", access.tenant_id).eq("id", contactId).maybeSingle();
  if (contactError || !contact?.id) throw new Error("Learner not found in your assigned scope");
  if (contact.notify_enabled === false) throw new Error("This learner has disabled Academy notifications");
  if (!contact.user_id || scoped.telegram_linked !== true) throw new Error("Learner must link Telegram before receiving a private warning");

  const dedupe = `academy-private-warning:${access.tenant_id}:${idempotency}`;
  const platformDedupe = `${dedupe}:${contact.user_id}`;
  const { data: notification, error: insertError } = await sb.from("academy_notifications").insert({
    academy_id: access.tenant_id,
    contact_id: contactId,
    user_id: contact.user_id,
    channel: "telegram",
    type: "personal_warning",
    title: "Private learner warning",
    body: "Private content is stored only in the learner notification channel.",
    status: "processing",
    bot_kind: "student",
    audience_kind: "student_private",
    actor_user_id: user.id,
    category: "academic_required",
    dedupe_key: dedupe,
    metadata: { source: "academy_telegram", platform_dedupe_key: platformDedupe, private_content_redacted: true },
  }).select("id,status").maybeSingle();
  if (insertError?.code === "23505") {
    const { data: existing } = await sb.from("academy_notifications").select("id,status")
      .eq("academy_id", access.tenant_id).eq("dedupe_key", dedupe).maybeSingle();
    return { notification: existing, duplicate: true };
  }
  if (insertError || !notification?.id) throw new Error(`Failed to reserve private warning: ${insertError?.message ?? "unknown"}`);

  try {
    const delivery = await sendStudentNotification({
      user_id: contact.user_id,
      text: `${title}\n\n${message}`,
      notification_type: "academy_personal_warning",
      category: "academic_required",
      dedupe_key: dedupe,
      parse_mode: null,
      metadata: { source: "academy_telegram", academy_id: access.tenant_id, contact_id: contactId },
    });
    const outcome = clean(delivery.outcome, 30);
    const status = outcome === "sent" ? "sent" : outcome === "failed" ? "failed" : outcome === "suppressed" ? "suppressed" : "queued";
    const error = status === "failed" || status === "suppressed" ? clean(delivery.reason, 500) || "Student notification was not delivered" : null;
    await sb.from("academy_notifications").update({
      status,
      error,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      suppression_reason: status === "suppressed" ? error : null,
      policy_decision: delivery,
    }).eq("id", notification.id).eq("academy_id", access.tenant_id);
    await audit(sb, access, access.tenant_id, user.id, "telegram.private_warning_sent", "academy_contact", contactId, {
      notification_id: notification.id,
      outcome: status,
      content_redacted: true,
    });
    return { notification: { ...notification, status }, delivery: { outcome: status }, duplicate: false };
  } catch (error) {
    await sb.from("academy_notifications").update({ status: "failed", error: "Student notification gateway unavailable" })
      .eq("id", notification.id).eq("academy_id", access.tenant_id);
    throw error;
  }
};

const queueGroupMessage = async (sb: Db, access: Access, user: UserRow, body: Record<string, unknown>) => {
  const bindingId = clean(body.chat_binding_id, 64);
  const eventType = lower(body.message_type ?? body.event_type, 50);
  const allowed = new Set(["announcement", "homework_published", "homework_due", "class_reminder", "schedule_change", "class_cancelled", "emergency_closure", "request_update"]);
  if (!bindingId || !allowed.has(eventType)) throw new Error("A valid group and message type are required");
  requirePermission(access, eventType.startsWith("homework") ? "manageAssignments" : "manageAnnouncements");
  if (eventType === "emergency_closure" && !seniorPublisher(access)) throw new Error("Forbidden");
  const { data: binding, error } = await sb.from("academy_telegram_chats").select("*")
    .eq("academy_id", access.tenant_id).eq("id", bindingId).eq("status", "active").maybeSingle();
  if (error || !binding?.id) throw new Error("Connected group not found");
  if (binding.branch_id && !canUseBranch(access, String(binding.branch_id))) throw new Error("Forbidden");
  if (binding.classroom_id && !(await canUseClassroom(sb, access, access.tenant_id, String(binding.classroom_id)))) throw new Error("Forbidden");
  if (binding.purpose === "academy_staff" && !seniorPublisher(access)) throw new Error("Forbidden");
  const title = clean(body.title, 160);
  const message = clean(body.body, 3500);
  if (!title || !message) throw new Error("Title and message are required");
  const scheduledAt = clean(body.scheduled_at, 40) || new Date().toISOString();
  if (Number.isNaN(new Date(scheduledAt).getTime())) throw new Error("Invalid schedule time");
  const idempotency = clean(body.idempotency_key, 160);
  if (!idempotency) throw new Error("idempotency_key is required");
  const dedupe = `academy-telegram:${access.tenant_id}:${idempotency}`;
  const { data: notification, error: insertError } = await sb.from("academy_notifications").insert({
    academy_id: access.tenant_id, channel: "telegram", type: eventType, title, body: message,
    status: "queued", scheduled_at: scheduledAt, bot_kind: "academy_staff", audience_kind: "group",
    chat_binding_id: bindingId, actor_user_id: user.id, dedupe_key: dedupe,
    category: eventType === "emergency_closure" ? "system" : "academic_required",
    critical_override: eventType === "emergency_closure", metadata: { source: "academy_telegram", binding_purpose: binding.purpose },
  }).select("id,status,scheduled_at").maybeSingle();
  if (insertError?.code === "23505") {
    const { data: existing } = await sb.from("academy_notifications").select("id,status,scheduled_at").eq("academy_id", access.tenant_id).eq("dedupe_key", dedupe).maybeSingle();
    return { notification: existing, duplicate: true };
  }
  if (insertError || !notification?.id) throw new Error(`Failed to queue Telegram message: ${insertError?.message ?? "unknown"}`);
  await audit(sb, access, access.tenant_id, user.id, "telegram.message_queued", "academy_notification", String(notification.id), { event_type: eventType, chat_binding_id: bindingId });
  await callDelivery();
  return { notification, duplicate: false };
};

const consumeStaffLink = async (sb: Db, token: string, telegramUserId: string, username: string | null) => {
  const hash = await sha256(token);
  const { data: link, error } = await sb.from("academy_telegram_link_tokens").select("*")
    .eq("token_hash", hash).eq("intent", "staff_link").eq("status", "pending").gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error || !link?.id) throw new Error("This staff link is invalid or expired");
  const { data: collision } = await sb.from("users").select("id").eq("telegram_chat_id", telegramUserId).neq("id", link.user_id).maybeSingle();
  if (collision?.id) throw new Error("This Telegram account is already linked to another Schood account");
  const { data: current, error: userError } = await sb.from("users").select("id,telegram_chat_id").eq("id", link.user_id).maybeSingle();
  if (userError || !current?.id) throw new Error("Schood account not found");
  if (current.telegram_chat_id && String(current.telegram_chat_id) !== telegramUserId) throw new Error("This Schood account is linked to another Telegram account");
  const { error: updateError } = await sb.from("users").update({ telegram_chat_id: telegramUserId }).eq("id", link.user_id);
  if (updateError) throw new Error(`Failed to link staff Telegram: ${updateError.message}`);
  await sb.from("academy_telegram_link_tokens").update({ status: "consumed", consumed_at: new Date().toISOString(), consumed_by_telegram_user_id: telegramUserId }).eq("id", link.id).eq("status", "pending");
  await audit(sb, { role: "staff" }, String(link.academy_id), String(link.user_id), "telegram.staff_linked", "user", String(link.user_id), { telegram_username: username });
  return link;
};

const consumeGroupLink = async (sb: Db, token: string, update: Record<string, any>) => {
  const hash = await sha256(token);
  const { data: link, error } = await sb.from("academy_telegram_link_tokens").select("*")
    .eq("token_hash", hash).eq("intent", "group_link").eq("status", "pending").gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error || !link?.id) throw new Error("This group link is invalid or expired");
  const fromId = clean(update.from?.id, 30);
  const chatId = clean(update.chat?.id, 30);
  const chatType = lower(update.chat?.type, 30);
  if (!fromId || !chatId || !["group", "supergroup"].includes(chatType)) throw new Error("Open this link while adding the bot to a Telegram group");
  const { data: linker } = await sb.from("users").select("id,email,full_name,telegram_chat_id").eq("id", link.user_id).maybeSingle();
  if (!linker?.id || String(linker.telegram_chat_id ?? "") !== fromId) throw new Error("Only the staff member who created this link can connect the group");
  const access = accessFor(await loadAccess(sb, linker as UserRow), String(link.academy_id));
  requirePermission(access, "manageAutomation");
  const existing = await sb.from("academy_telegram_chats").select("id").eq("bot_kind", "academy_staff").eq("chat_id", chatId).is("message_thread_id", null).maybeSingle();
  const payload = {
    academy_id: link.academy_id, branch_id: link.branch_id, classroom_id: link.classroom_id,
    chat_id: chatId, chat_type: chatType, purpose: link.purpose,
    title: clean(update.chat?.title, 160) || "Academy group", locale: link.locale,
    status: "active", linked_by: link.user_id, linked_at: new Date().toISOString(), last_verified_at: new Date().toISOString(),
    capabilities: { send_messages: true, privacy_mode: true }, disconnected_at: null, last_error: null,
  };
  let binding: Record<string, any> | null = null;
  if (existing.data?.id) {
    const result = await sb.from("academy_telegram_chats").update(payload).eq("id", existing.data.id).select("*").single();
    if (result.error) throw new Error(`Failed to reconnect group: ${result.error.message}`);
    binding = result.data;
  } else {
    const result = await sb.from("academy_telegram_chats").insert(payload).select("*").single();
    if (result.error) throw new Error(`Failed to connect group: ${result.error.message}`);
    binding = result.data;
  }
  const events = link.purpose === "classroom_community"
    ? ["announcement", "homework_published", "homework_due", "class_reminder", "schedule_change", "class_cancelled", "emergency_closure"]
    : link.purpose === "classroom_guardians"
      ? ["announcement", "homework_due", "class_reminder", "schedule_change", "class_cancelled", "emergency_closure"]
      : ["announcement", "schedule_change", "class_cancelled", "emergency_closure", "staff_daily_brief", "request_update"];
  await sb.from("academy_telegram_chat_subscriptions").upsert(events.map((eventType) => ({ academy_id: link.academy_id, chat_binding_id: binding!.id, event_type: eventType, delivery_mode: eventType === "staff_daily_brief" ? "daily_digest" : "immediate", updated_by: link.user_id })), { onConflict: "academy_id,chat_binding_id,event_type" });
  await sb.from("academy_telegram_link_tokens").update({ status: "consumed", consumed_at: new Date().toISOString(), consumed_by_telegram_user_id: fromId }).eq("id", link.id).eq("status", "pending");
  await audit(sb, access, String(link.academy_id), String(link.user_id), "telegram.group_connected", "academy_telegram_chat", String(binding!.id), { purpose: link.purpose, chat_type: chatType }, link.classroom_id ? String(link.classroom_id) : null);
  return binding!;
};

const privateMarkup = (label: string) => ({ inline_keyboard: [[{ text: label, web_app: { url: `${academySiteUrl()}/telegram` } }]] });

const handleWebhook = async (sb: Db, update: BotUpdate) => {
  const updateId = Number(update.update_id);
  if (!Number.isFinite(updateId)) return;
  const kind = update.message ? "message" : update.callback_query ? "callback_query" : update.my_chat_member ? "my_chat_member" : "other";
  const telegramUserId = clean(update.message?.from?.id ?? update.callback_query?.from?.id ?? update.my_chat_member?.from?.id, 30) || null;
  const { error: reserveError } = await sb.from("telegram_update_receipts").insert({ bot_name: academyBotName(), telegram_update_id: updateId, telegram_user_id: telegramUserId, update_kind: kind, status: "processing", attempts: 1, claim_token: crypto.randomUUID(), claimed_at: new Date().toISOString() });
  if (reserveError?.code === "23505") return;
  if (reserveError) throw new Error(`Failed to reserve Telegram update: ${reserveError.message}`);
  try {
    if (update.my_chat_member) {
      const chatId = clean(update.my_chat_member.chat?.id, 30);
      const status = lower(update.my_chat_member.new_chat_member?.status, 30);
      if (chatId) {
        const active = ["member", "administrator"].includes(status);
        await sb.from("academy_telegram_chats").update({ status: active ? "active" : "disconnected", disconnected_at: active ? null : new Date().toISOString(), last_verified_at: new Date().toISOString(), last_error: active ? null : `Bot status: ${status}` }).eq("chat_id", chatId);
      }
    }
    if (update.message?.text) {
      const message = update.message;
      const chatId = clean(message.chat?.id, 30);
      const text = clean(message.text, 4000);
      const command = lower(text.split(/\s+/)[0]?.split("@")[0], 80);
      const parameter = clean(text.split(/\s+/).slice(1).join(" "), 300);
      const privateChat = message.chat?.type === "private";
      try {
        if (command === "/start" && parameter.startsWith("staff_")) {
          await consumeStaffLink(sb, parameter.slice(6), clean(message.from?.id, 30), clean(message.from?.username, 120) || null);
          await telegramApi("sendMessage", { chat_id: chatId, text: "Your Schood staff account is linked. Open Academy operations below.", reply_markup: privateMarkup("Open Academy operations") });
        } else if (command === "/start" && parameter.startsWith("group_")) {
          const binding = await consumeGroupLink(sb, parameter.slice(6), message);
          await telegramApi("sendMessage", { chat_id: chatId, text: `${clean(binding.title, 160)} is connected to Schood Academy. Only approved, scope-safe updates will be posted here.` });
        } else if (["/start", "/today", "/announce", "/homework", "/attendance", "/requests", "/groups", "/settings", "/help"].includes(command)) {
          const linked = message.from?.id ? await loadUserByTelegram(sb, clean(message.from.id, 30)) : null;
          if (!linked) {
            await telegramApi("sendMessage", { chat_id: chatId, text: "This Telegram account is not linked to Schood staff access. Open Academy on the web and choose Telegram assistant." });
          } else if (privateChat) {
            const profiles = await loadAccess(sb, linked);
            const openLabel = command === "/homework" ? "Create homework" : command === "/attendance" ? "Take attendance" : command === "/announce" ? "Write an announcement" : "Open Academy operations";
            await telegramApi("sendMessage", { chat_id: chatId, text: profiles.length ? `You have ${profiles.length} Academy workspace${profiles.length === 1 ? "" : "s"}. Open the staff app for today’s scoped work.` : "No active Academy staff workspace is linked to this account.", reply_markup: profiles.length ? privateMarkup(openLabel) : undefined });
          } else {
            const { data: binding } = await sb.from("academy_telegram_chats").select("academy_id,branch_id,classroom_id,status").eq("chat_id", chatId).eq("status", "active").maybeSingle();
            const profile = binding ? (await loadAccess(sb, linked)).find((row) => row.tenant_id === binding.academy_id) : null;
            if (profile && (!binding?.branch_id || canUseBranch(profile, String(binding.branch_id))) && (!binding?.classroom_id || await canUseClassroom(sb, profile, profile.tenant_id, String(binding.classroom_id)))) {
              await telegramApi("sendMessage", { chat_id: chatId, text: "Open the Academy staff app to complete this action. Personal records are kept out of group chat.", reply_markup: { inline_keyboard: [[{ text: "Open Academy", url: `${academySiteUrl()}/telegram` }]] } });
            }
          }
        }
      } catch (error) {
        await telegramApi("sendMessage", { chat_id: chatId, text: error instanceof Error ? error.message : "This Academy action could not be completed." }).catch(() => undefined);
      }
    }
    await sb.from("telegram_update_receipts").update({ status: "completed", completed_at: new Date().toISOString(), error: null }).eq("bot_name", academyBotName()).eq("telegram_update_id", updateId);
  } catch (error) {
    await sb.from("telegram_update_receipts").update({ status: "failed", error: clean(error instanceof Error ? error.message : error, 800) }).eq("bot_name", academyBotName()).eq("telegram_update_id", updateId);
    throw error;
  }
};

const authenticateWebUser = async (sb: Db, req: Request): Promise<UserRow> => {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) throw new Error("Unauthorized");
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user?.id) throw new Error("Unauthorized");
  const { data: row, error: rowError } = await sb.from("users").select("id,email,full_name,telegram_chat_id").eq("id", data.user.id).maybeSingle();
  if (rowError || !row?.id) throw new Error("Unauthorized");
  return row as UserRow;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const supabaseUrl = env("SUPABASE_URL");
    const serviceRole = env("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = lower(body.action, 80);

    if (action === "process_webhook_update") {
      if (!(await isInternalRequest(req, serviceRole, Deno.env.get("ACADEMY_TELEGRAM_INTERNAL_SECRET")))) return json(401, { error: "Unauthorized" });
      await handleWebhook(sb, asRecord(body.update) as BotUpdate);
      return json(200, { ok: true });
    }

    let user: UserRow;
    if (action === "create_staff_link") {
      user = await authenticateWebUser(sb, req);
    } else {
      const identity = await validateTelegramInitData(clean(body.initData ?? body.init_data, 10000), env("ACADEMY_TELEGRAM_BOT_TOKEN"), { maxAgeSeconds: 900 });
      const linked = await loadUserByTelegram(sb, identity.telegram_user_id);
      if (!linked) return json(403, { linked: false, error: "Link this Telegram account from your Academy workspace first." });
      user = linked;
    }
    const access = await loadAccess(sb, user);
    if (!access.length) return json(403, { linked: true, error: "No active Academy staff workspace is assigned to this account." });

    if (action === "bootstrap") {
      const academyId = clean(body.academy_id, 64) || access[0].tenant_id;
      const selected = accessFor(access, academyId);
      return json(200, {
        linked: true,
        user: { id: user.id, full_name: user.full_name, email: user.email },
        academies: access.map((row) => ({ id: row.tenant_id, name: row.academy_name, access: academyAccessProfile(row) })),
        selected_academy_id: academyId,
        dashboard: await dashboard(sb, selected),
      });
    }

    const academyId = clean(body.academy_id, 64);
    if (!academyId) return json(400, { error: "academy_id is required" });
    const selected = accessFor(access, academyId);

    if (action === "create_staff_link") {
      await ensureTelegramProviderConfiguration();
      return json(200, { link: await issueLink(sb, user, selected, body, "staff_link") });
    }
    if (action === "issue_group_link") return json(200, { link: await issueLink(sb, user, selected, body, "group_link") });

    if (action === "update_settings") {
      requirePermission(selected, "manageAutomation");
      const patch = {
        academy_id: academyId,
        enabled: body.enabled === true,
        default_locale: ["en", "uz", "ru"].includes(lower(body.default_locale, 2)) ? lower(body.default_locale, 2) : "uz",
        timezone: clean(body.timezone, 80) || "Asia/Tashkent",
        digest_time: /^([01]\d|2[0-3]):[0-5]\d$/.test(clean(body.digest_time, 5)) ? clean(body.digest_time, 5) : "08:00",
        emergency_override_enabled: body.emergency_override_enabled !== false,
        configured_by: user.id,
      };
      const { data, error } = await sb.from("academy_telegram_settings").upsert(patch, { onConflict: "academy_id" }).select("enabled,default_locale,timezone,digest_time,emergency_override_enabled").single();
      if (error) throw new Error(`Failed to save Telegram settings: ${error.message}`);
      await audit(sb, selected, academyId, user.id, "telegram.settings_updated", "academy_telegram_settings", academyId, { enabled: patch.enabled });
      return json(200, { settings: data });
    }

    const { data: feature } = await sb.from("academy_telegram_settings").select("enabled").eq("academy_id", academyId).maybeSingle();
    if (feature?.enabled !== true) return json(409, { error: "Telegram operations are not enabled for this Academy yet." });

    if (action === "preview_message") {
      const bindingId = clean(body.chat_binding_id, 64);
      const { data: binding } = await sb.from("academy_telegram_chats").select("id,title,purpose,branch_id,classroom_id,status").eq("academy_id", academyId).eq("id", bindingId).maybeSingle();
      if (!binding?.id || binding.status !== "active") return json(404, { error: "Connected group not found" });
      const type = lower(body.message_type, 50);
      requirePermission(selected, type.startsWith("homework") ? "manageAssignments" : "manageAnnouncements");
      if (binding.branch_id && !canUseBranch(selected, String(binding.branch_id))) return json(403, { error: "Forbidden" });
      if (binding.classroom_id && !(await canUseClassroom(sb, selected, academyId, String(binding.classroom_id)))) return json(403, { error: "Forbidden" });
      return json(200, { preview: { group: binding.title, purpose: binding.purpose, title: clean(body.title, 160), body: clean(body.body, 3500), scheduled_at: clean(body.scheduled_at, 40) || null } });
    }
    if (action === "publish_message") return json(200, await queueGroupMessage(sb, selected, user, body));
    if (action === "send_private_warning") return json(200, await sendPrivateWarning(sb, selected, user, body));

    if (action === "create_homework") {
      requirePermission(selected, "manageAssignments");
      const classroomId = clean(body.classroom_id, 64);
      if (!classroomId || !(await canUseClassroom(sb, selected, academyId, classroomId))) return json(403, { error: "Forbidden" });
      const title = clean(body.title, 180); const description = clean(body.description, 3000);
      const dueAt = clean(body.due_at, 40);
      if (!title || !dueAt || Number.isNaN(new Date(dueAt).getTime())) return json(400, { error: "Title and a valid due date are required" });
      const idempotency = clean(body.idempotency_key, 160);
      if (!idempotency) return json(400, { error: "idempotency_key is required" });
      const { data: existing } = await sb.from("academy_assignments").select("id,title,due_at").eq("academy_id", academyId).contains("metadata", { telegram_idempotency_key: idempotency }).maybeSingle();
      let assignment = existing;
      if (!assignment?.id) {
        const result = await sb.from("academy_assignments").insert({ academy_id: academyId, classroom_id: classroomId, title, description: description || null, assignment_type: "task", due_at: dueAt, status: "active", created_by: user.id, metadata: { source: "academy_telegram", telegram_idempotency_key: idempotency } }).select("id,title,due_at").single();
        if (result.error) throw new Error(`Failed to create homework: ${result.error.message}`);
        assignment = result.data;
        await audit(sb, selected, academyId, user.id, "assignment.created_from_telegram", "academy_assignment", String(assignment.id), { due_at: dueAt }, classroomId);
      }
      let notification = null;
      if (body.chat_binding_id) {
        const queued = await queueGroupMessage(sb, selected, user, { ...body, message_type: "homework_published", title, body: description ? `${description}\n\nDue: ${new Date(dueAt).toLocaleString("en-GB")}` : `Due: ${new Date(dueAt).toLocaleString("en-GB")}`, idempotency_key: `${idempotency}:notification` });
        notification = queued.notification;
      }
      return json(200, { assignment, notification, duplicate: Boolean(existing?.id) });
    }

    if (action === "attendance_roster") {
      requirePermission(selected, "markAttendance");
      const classroomId = clean(body.classroom_id, 64);
      if (!classroomId || !(await canUseClassroom(sb, selected, academyId, classroomId))) return json(403, { error: "Forbidden" });
      const { data, error } = await sb.from("academy_classroom_memberships").select("contact_id,academy_contacts!academy_memberships_contact_tenant_fk(id,first_name,last_name,status)")
        .eq("academy_id", academyId).eq("classroom_id", classroomId).eq("role", "student").eq("status", "active").limit(500);
      if (error) throw new Error(`Failed to load attendance roster: ${error.message}`);
      return json(200, { roster: (data ?? []).map((row: any) => row.academy_contacts).filter(Boolean) });
    }

    if (action === "record_attendance") {
      requirePermission(selected, "markAttendance");
      const sessionId = clean(body.session_id, 64); const classroomId = clean(body.classroom_id, 64);
      if (!sessionId || !classroomId || !(await canUseClassroom(sb, selected, academyId, classroomId))) return json(403, { error: "Forbidden" });
      const { data: session } = await sb.from("academy_lesson_sessions").select("id,classroom_id").eq("academy_id", academyId).eq("id", sessionId).maybeSingle();
      if (!session?.id || String(session.classroom_id) !== classroomId) return json(404, { error: "Lesson session not found" });
      const records = Array.isArray(body.records) ? body.records.slice(0, 500) : [];
      if (!records.length) return json(400, { error: "Attendance records are required" });
      const idempotency = clean(body.idempotency_key, 160);
      if (!idempotency) return json(400, { error: "idempotency_key is required" });
      const { data, error } = await sb.rpc("academy_record_telegram_attendance_batch", {
        p_academy_id: academyId, p_session_id: sessionId, p_classroom_id: classroomId,
        p_actor_id: user.id, p_records: records, p_idempotency_key: idempotency,
      });
      if (error) throw new Error(`Failed to record attendance: ${error.message}`);
      return json(200, data);
    }

    if (action === "update_request") {
      requirePermission(selected, "resolveActionItems");
      const requestId = clean(body.request_id, 64); const nextStatus = lower(body.status, 40);
      const allowedStatuses = new Set(["triaged", "in_review", "waiting_for_requester", "approved", "rejected", "completed"]);
      if (!requestId || !allowedStatuses.has(nextStatus)) return json(400, { error: "Request and valid status are required" });
      const { data: request, error } = await sb.from("academy_service_requests").select("*").eq("academy_id", academyId).eq("id", requestId).maybeSingle();
      if (error || !request?.id) return json(404, { error: "Request not found" });
      if (request.branch_id && !canUseBranch(selected, String(request.branch_id))) return json(403, { error: "Forbidden" });
      if (request.classroom_id && !(await canUseClassroom(sb, selected, academyId, String(request.classroom_id)))) return json(403, { error: "Forbidden" });
      const note = clean(body.note, 1500);
      const idempotency = clean(body.idempotency_key, 160);
      if (!idempotency) return json(400, { error: "idempotency_key is required" });
      const result = await sb.rpc("academy_update_telegram_service_request", {
        p_academy_id: academyId, p_request_id: requestId, p_actor_id: user.id,
        p_next_status: nextStatus, p_assign_to_me: body.assign_to_me === true,
        p_note: note || null, p_idempotency_key: idempotency,
      });
      if (result.error) throw new Error(`Failed to update request: ${result.error.message}`);
      return json(200, result.data);
    }

    if (action === "retry_delivery") {
      requirePermission(selected, "dispatchNotifications");
      const notificationId = clean(body.notification_id, 64);
      const { data, error } = await sb.from("academy_notifications").update({ status: "queued", scheduled_at: new Date().toISOString(), error: null, claimed_at: null, claim_token: null }).eq("academy_id", academyId).eq("id", notificationId).eq("bot_kind", "academy_staff").in("status", ["failed", "skipped"]).select("id,status").maybeSingle();
      if (error || !data?.id) return json(404, { error: "Retryable delivery not found" });
      await audit(sb, selected, academyId, user.id, "telegram.delivery_retried", "academy_notification", notificationId);
      await callDelivery();
      return json(200, { notification: data });
    }

    if (action === "update_group") {
      requirePermission(selected, "manageAutomation");
      const bindingId = clean(body.chat_binding_id, 64);
      const status = lower(body.status, 30); const locale = lower(body.locale, 2);
      if (!["active", "paused"].includes(status) || !["en", "uz", "ru"].includes(locale)) return json(400, { error: "Valid group status and language are required" });
      const { data, error } = await sb.from("academy_telegram_chats").update({ status, locale }).eq("academy_id", academyId).eq("id", bindingId).select("*").maybeSingle();
      if (error || !data?.id) return json(404, { error: "Connected group not found" });
      if (Array.isArray(body.subscriptions)) {
        for (const raw of body.subscriptions.slice(0, 30)) {
          const item = asRecord(raw); const eventType = lower(item.event_type, 60); const mode = lower(item.delivery_mode, 30);
          if (!eventType || !["immediate", "daily_digest", "off"].includes(mode)) continue;
          await sb.from("academy_telegram_chat_subscriptions").update({ delivery_mode: mode, enabled: mode !== "off", updated_by: user.id }).eq("academy_id", academyId).eq("chat_binding_id", bindingId).eq("event_type", eventType);
        }
      }
      await audit(sb, selected, academyId, user.id, "telegram.group_updated", "academy_telegram_chat", bindingId, { status, locale });
      return json(200, { group: redactChat(data) });
    }

    if (action === "disconnect_group") {
      requirePermission(selected, "manageAutomation");
      const bindingId = clean(body.chat_binding_id, 64);
      const { data, error } = await sb.from("academy_telegram_chats").update({ status: "disconnected", disconnected_at: new Date().toISOString(), last_error: "Disconnected by Academy administrator" }).eq("academy_id", academyId).eq("id", bindingId).select("id").maybeSingle();
      if (error || !data?.id) return json(404, { error: "Connected group not found" });
      await audit(sb, selected, academyId, user.id, "telegram.group_disconnected", "academy_telegram_chat", bindingId);
      return json(200, { disconnected: true });
    }

    if (action === "test_group") {
      requirePermission(selected, "manageAutomation");
      return json(200, await queueGroupMessage(sb, selected, user, { ...body, message_type: "announcement", title: "Schood connection check", body: "This group is connected to Schood Academy. No student information is included in connection checks.", idempotency_key: `test:${clean(body.chat_binding_id, 64)}:${Date.now()}` }));
    }

    return json(400, { error: "Unsupported Academy Telegram action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Academy Telegram request failed";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return json(status, { error: message });
  }
});
