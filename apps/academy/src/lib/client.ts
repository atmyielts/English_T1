import { supabase } from './supabase';

export type Json = Record<string, unknown> | unknown[];

export type MeResponse = {
  user: { id: string; email: string | null; role?: string | null };
  current_tenant: { id: string; name: string; slug: string; type: string } | null;
  memberships: { tenant_id: string; role: string; status: string }[];
};

export type TeacherStudioAcademy = {
  id: string;
  name: string;
  slug: string;
  type: string;
  metadata: Json;
  role: string;
  status: string;
  created_at: string;
};

export type TeacherStudioSummary = {
  academy_id: string;
  counts: {
    contacts: number;
    classrooms: number;
    offers: number;
    active_entitlements: number;
    open_alerts: number;
  };
};

export type TeacherStudioContact = {
  id: string;
  academy_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  telegram_id: string | null;
  status: string;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type TeacherStudioClassroom = {
  id: string;
  academy_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  metadata: Json;
  created_at: string;
  updated_at: string;
  member_count: number;
};

export type TeacherStudioClassroomMembership = {
  id: string;
  academy_id: string;
  classroom_id: string;
  contact_id: string;
  role: string;
  joined_at: string;
  metadata: Json;
};

export type TeacherStudioMessage = {
  id: string;
  academy_id: string;
  conversation_id: string;
  contact_id: string | null;
  sender_type: string;
  message_type: string;
  content: string;
  metadata: Json;
  created_at: string;
};

export type TeacherStudioConversation = {
  id: string;
  academy_id: string;
  contact_id: string;
  created_at: string;
  updated_at: string;
  contact: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    status: string;
  } | null;
  last_message: {
    id: string;
    sender_type: string;
    message_type: string;
    content: string;
    created_at: string;
  } | null;
};

export type TeacherStudioAnnouncement = {
  id: string;
  academy_id: string;
  classroom_id: string | null;
  title: string;
  body: string;
  metadata: Json;
  created_by: string | null;
  created_at: string;
};

export type TeacherStudioAlert = {
  id: string;
  academy_id: string;
  contact_id: string | null;
  type: string;
  severity: string;
  message: string;
  resolved: boolean;
  resolved_at: string | null;
  metadata: Json;
  created_at: string;
};

export type TeacherStudioOffer = {
  id: string;
  academy_id: string;
  name: string;
  type: string;
  price_amount: number;
  currency: string;
  duration_days: number | null;
  description: string | null;
  is_active: boolean;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type TeacherStudioOfferGrant = {
  id: string;
  academy_id: string;
  offer_id: string;
  grant_type: string;
  resource_type: string | null;
  resource_id: string | null;
  capability_key: string | null;
  quantity: number | null;
  duration_days: number | null;
  metadata: Json;
  created_at: string;
};

export type TeacherStudioPayment = {
  id: string;
  academy_id: string;
  contact_id: string;
  offer_id: string;
  provider: string;
  provider_transaction_id: string;
  amount: number;
  currency: string;
  status: string;
  metadata: Json;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TeacherStudioEntitlement = {
  id: string;
  academy_id: string;
  contact_id: string;
  user_id: string | null;
  offer_id: string | null;
  payment_id: string | null;
  grant_type: string;
  resource_type: string | null;
  resource_id: string | null;
  capability_key: string | null;
  quantity: number | null;
  remaining: number | null;
  starts_at: string;
  expires_at: string | null;
  status: string;
  source: string;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type TeacherStudioClassroomChatMessage = {
  id: string;
  academy_id: string;
  conversation_id: string;
  contact_id: string | null;
  sender_type: string;
  message_type: string;
  content: string;
  metadata: Json;
  created_at: string;
  sender_label: string;
  sender_role: string;
  sender_contact_id: string | null;
};

export type TeacherStudioClassroomChatMember = {
  id: string;
  academy_id: string;
  classroom_id: string;
  contact_id: string;
  role: string;
  joined_at: string;
  metadata: Json;
  contact: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    status: string;
    display_name: string;
  } | null;
};

export type TeacherStudioClassroomResource = {
  id: string;
  academy_id: string;
  classroom_id: string;
  title: string;
  kind: 'video' | 'book' | 'asset' | 'link' | 'assignment' | 'mock' | 'practice' | 'playbook';
  url: string;
  description: string | null;
  metadata: Json;
  sort_order: number;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TeacherStudioClassroomRoom = {
  academy_id: string;
  classroom: TeacherStudioClassroom;
  viewer: {
    type: 'teacher' | 'student';
    role: string;
    contact_id: string | null;
    display_name: string;
  };
  members: TeacherStudioClassroomChatMember[];
  resources: TeacherStudioClassroomResource[];
  progress: {
    viewer_completed_resource_ids: string[];
    resource_completed_counts: Record<string, number>;
    total_members: number;
  };
  messages: TeacherStudioClassroomChatMessage[];
  announcements: TeacherStudioAnnouncement[];
};

export type TeacherStudioStudentFeed = {
  academies: { id: string; name: string; slug: string; type: string; metadata?: Json | null }[];
  contacts: { id: string; academy_id: string; first_name: string; last_name: string; email: string | null; status: string }[];
  messages: {
    id: string;
    academy_id: string;
    conversation_id: string;
    contact_id: string | null;
    sender_type: string;
    message_type: string;
    content: string;
    metadata: Json | null;
    created_at: string;
  }[];
  alerts: {
    id: string;
    academy_id: string;
    contact_id: string | null;
    type: string;
    severity: string;
    message: string;
    resolved: boolean;
    resolved_at: string | null;
    metadata: Json | null;
    created_at: string;
  }[];
};

export type TeacherStudioStudentDashboard = {
  academies: { id: string; name: string; slug: string; type: string; metadata?: Json | null }[];
  contacts: TeacherStudioContact[];
  classrooms: TeacherStudioClassroom[];
  classroom_memberships: TeacherStudioClassroomMembership[];
  announcements: TeacherStudioAnnouncement[];
  messages: TeacherStudioMessage[];
  alerts: TeacherStudioAlert[];
  entitlements: TeacherStudioEntitlement[];
  payments: TeacherStudioPayment[];
  offers: TeacherStudioOffer[];
};

type InvokeErrorLike = {
  message?: string;
  context?: {
    status?: number;
    response?: string;
  };
};

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '');
const edgeBase = `${supabaseUrl}/functions/v1`;

let refreshPromise: Promise<boolean> | null = null;

const refreshOnce = async (): Promise<boolean> => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const { data, error } = await supabase.auth.refreshSession();
      return !error && !!data.session;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
};

const getAccessToken = async (): Promise<string> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const direct = sessionData.session?.access_token;
  if (direct) return direct;

  const refreshed = await refreshOnce();
  if (!refreshed) throw new Error('Unauthorized');
  const { data: refreshedData } = await supabase.auth.getSession();
  const token = refreshedData.session?.access_token;
  if (!token) throw new Error('Unauthorized');
  return token;
};

const readBody = async (res: Response): Promise<unknown> => {
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  try {
    return await res.text();
  } catch {
    return null;
  }
};

const invokeEdge = async <T>(
  fnName: string,
  opts?: { method?: 'GET' | 'POST'; body?: Record<string, unknown> },
): Promise<T> => {
  const method = opts?.method ?? 'POST';

  const run = async (token: string): Promise<Response> => {
    return fetch(`${edgeBase}/${fnName}`, {
      method,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        ...(opts?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
    });
  };

  let token = await getAccessToken();
  let response = await run(token);

  if (response.status === 401) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      token = await getAccessToken();
      response = await run(token);
    }
  }

  if (!response.ok) {
    const detail = await readBody(response);
    throw new Error(`${method} /${fnName} failed (${response.status}): ${JSON.stringify(detail)}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null as T;
  return (await response.json()) as T;
};

const academyEdgeFunctions = ['academy', 'teacher-studio'] as const;

const extractStatusFromError = (error: unknown): number | null => {
  if (!(error instanceof Error)) return null;
  const match = error.message.match(/\((\d{3})\)/);
  if (!match) return null;
  const status = Number(match[1]);
  return Number.isFinite(status) ? status : null;
};

const callTeacherStudio = async <T>(opts: {
  method?: 'GET' | 'POST';
  action: string;
  academyId?: string | null;
  body?: Record<string, unknown>;
  params?: Record<string, string | undefined | null>;
}): Promise<T> => {
  const payload: Record<string, unknown> = {
    action: opts.action,
    academy_id: opts.academyId ?? undefined,
    ...(opts.body ?? {}),
  };

  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      if (v !== undefined && v !== null && `${v}`.trim().length > 0) payload[k] = `${v}`;
    }
  }

  let lastError: unknown = null;
  for (const fnName of academyEdgeFunctions) {
    try {
      return await invokeEdge<T>(fnName, {
        method: 'POST',
        body: payload,
      });
    } catch (error) {
      lastError = error;
      const status = extractStatusFromError(error);
      if (status !== 404 && status !== 405) throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Academy service call failed');
};

export const getMe = async (): Promise<MeResponse> => {
  return invokeEdge<MeResponse>('me', { method: 'GET' });
};

export const teacherStudioSummary = async (academyId?: string | null): Promise<TeacherStudioSummary> => {
  return callTeacherStudio<TeacherStudioSummary>({ action: 'summary', academyId });
};

export const teacherStudioAcademies = async (): Promise<TeacherStudioAcademy[]> => {
  const data = await callTeacherStudio<{ academies: TeacherStudioAcademy[] }>({ action: 'academies' });
  return data.academies ?? [];
};

export const teacherStudioContacts = async (academyId?: string | null): Promise<TeacherStudioContact[]> => {
  const data = await callTeacherStudio<{ contacts: TeacherStudioContact[] }>({ action: 'contacts', academyId });
  return data.contacts ?? [];
};

export const teacherStudioClassrooms = async (academyId?: string | null): Promise<TeacherStudioClassroom[]> => {
  const data = await callTeacherStudio<{ classrooms: TeacherStudioClassroom[] }>({ action: 'classrooms', academyId });
  return data.classrooms ?? [];
};

export const teacherStudioClassroomMemberships = async (
  academyId?: string | null,
  classroomId?: string | null,
): Promise<TeacherStudioClassroomMembership[]> => {
  const data = await callTeacherStudio<{ classroom_memberships: TeacherStudioClassroomMembership[] }>({
    action: 'classroom-memberships',
    academyId,
    params: { classroom_id: classroomId ?? undefined },
  });
  return data.classroom_memberships ?? [];
};

export const teacherStudioConversations = async (academyId?: string | null): Promise<TeacherStudioConversation[]> => {
  const data = await callTeacherStudio<{ conversations: TeacherStudioConversation[] }>({
    action: 'conversations',
    academyId,
  });
  return data.conversations ?? [];
};

export const teacherStudioConversationMessages = async (
  academyId?: string | null,
  params?: { conversation_id?: string | null; contact_id?: string | null },
): Promise<{ conversation_id: string | null; messages: TeacherStudioMessage[] }> => {
  return callTeacherStudio<{ conversation_id: string | null; messages: TeacherStudioMessage[] }>({
    action: 'conversation-messages',
    academyId,
    params: {
      conversation_id: params?.conversation_id ?? undefined,
      contact_id: params?.contact_id ?? undefined,
    },
  });
};

export const teacherStudioAnnouncements = async (
  academyId?: string | null,
  classroomId?: string | null,
): Promise<TeacherStudioAnnouncement[]> => {
  const data = await callTeacherStudio<{ announcements: TeacherStudioAnnouncement[] }>({
    action: 'announcements',
    academyId,
    params: { classroom_id: classroomId ?? undefined },
  });
  return data.announcements ?? [];
};

export const teacherStudioAlerts = async (
  academyId?: string | null,
  contactId?: string | null,
): Promise<TeacherStudioAlert[]> => {
  const data = await callTeacherStudio<{ alerts: TeacherStudioAlert[] }>({
    action: 'alerts',
    academyId,
    params: { contact_id: contactId ?? undefined },
  });
  return data.alerts ?? [];
};

export const teacherStudioOffers = async (academyId?: string | null): Promise<TeacherStudioOffer[]> => {
  const data = await callTeacherStudio<{ offers: TeacherStudioOffer[] }>({ action: 'offers', academyId });
  return data.offers ?? [];
};

export const teacherStudioOfferGrants = async (academyId: string, offerId?: string | null): Promise<TeacherStudioOfferGrant[]> => {
  const data = await callTeacherStudio<{ offer_grants: TeacherStudioOfferGrant[] }>({
    action: 'offer-grants',
    academyId,
    params: { offer_id: offerId ?? undefined },
  });
  return data.offer_grants ?? [];
};

export const teacherStudioPayments = async (academyId?: string | null): Promise<TeacherStudioPayment[]> => {
  const data = await callTeacherStudio<{ payments: TeacherStudioPayment[] }>({ action: 'payments', academyId });
  return data.payments ?? [];
};

export const teacherStudioEntitlements = async (academyId?: string | null): Promise<TeacherStudioEntitlement[]> => {
  const data = await callTeacherStudio<{ entitlements: TeacherStudioEntitlement[] }>({ action: 'entitlements', academyId });
  return data.entitlements ?? [];
};

export const teacherStudioStudentFeed = async (): Promise<TeacherStudioStudentFeed> => {
  return callTeacherStudio<TeacherStudioStudentFeed>({ action: 'student-feed' });
};

export const teacherStudioStudentDashboard = async (): Promise<TeacherStudioStudentDashboard> => {
  return callTeacherStudio<TeacherStudioStudentDashboard>({ action: 'student-dashboard' });
};

export const teacherStudioClassroomChat = async (
  academyId: string,
  classroomId: string,
): Promise<TeacherStudioClassroomRoom> => {
  return callTeacherStudio<TeacherStudioClassroomRoom>({
    action: 'classroom-chat',
    academyId,
    params: { classroom_id: classroomId },
  });
};

export const teacherStudioSendClassroomChatMessage = async (
  academyId: string,
  body: { classroom_id: string; content: string },
): Promise<{ academy_id: string; classroom_id: string; sender: TeacherStudioClassroomRoom['viewer']; delivered: number }> => {
  return callTeacherStudio<{
    academy_id: string;
    classroom_id: string;
    sender: TeacherStudioClassroomRoom['viewer'];
    delivered: number;
  }>({
    method: 'POST',
    action: 'classroom-chat-send',
    academyId,
    body,
  });
};

export const teacherStudioUpsertClassroomResource = async (
  academyId: string,
  body: {
    id?: string;
    classroom_id: string;
    title: string;
    type: TeacherStudioClassroomResource['kind'];
    url: string;
    description?: string;
    sort_order?: number;
    is_published?: boolean;
    metadata?: Json;
  },
): Promise<TeacherStudioClassroomResource> => {
  const data = await callTeacherStudio<{ resource: TeacherStudioClassroomResource }>({
    method: 'POST',
    action: 'classroom-resource-upsert',
    academyId,
    body,
  });
  return data.resource;
};

export const teacherStudioDeleteClassroomResource = async (
  academyId: string,
  body: {
    id: string;
    classroom_id: string;
  },
): Promise<{ removed: boolean; id: string }> => {
  return callTeacherStudio<{ removed: boolean; id: string }>({
    method: 'POST',
    action: 'classroom-resource-delete',
    academyId,
    body,
  });
};

export const teacherStudioSetClassroomResourceProgress = async (
  academyId: string,
  body: {
    classroom_id: string;
    resource_id: string;
    completed: boolean;
  },
): Promise<{
  progress: {
    id: string;
    academy_id: string;
    classroom_id: string;
    resource_id: string;
    contact_id: string;
    user_id: string | null;
    completed: boolean;
    completed_at: string | null;
    updated_at: string;
  };
}> => {
  return callTeacherStudio<{
    progress: {
      id: string;
      academy_id: string;
      classroom_id: string;
      resource_id: string;
      contact_id: string;
      user_id: string | null;
      completed: boolean;
      completed_at: string | null;
      updated_at: string;
    };
  }>({
    method: 'POST',
    action: 'classroom-resource-progress-set',
    academyId,
    body,
  });
};

export const teacherStudioCreateAcademy = async (
  body: { name: string; slug?: string },
): Promise<TeacherStudioAcademy> => {
  const data = await callTeacherStudio<{ academy: TeacherStudioAcademy }>({
    method: 'POST',
    action: 'create_academy',
    body,
  });
  return data.academy;
};

export const teacherStudioUpdateAcademyLanding = async (
  academyId: string,
  body: {
    name?: string;
    landing: {
      headline?: string;
      subheadline?: string;
      primary_cta_label?: string;
      secondary_cta_label?: string;
    };
  },
): Promise<TeacherStudioAcademy> => {
  const data = await callTeacherStudio<{ academy: TeacherStudioAcademy }>({
    method: 'POST',
    action: 'update_academy_landing',
    academyId,
    body,
  });
  return data.academy;
};

export const teacherStudioUpsertContact = async (
  academyId: string,
  body: { first_name: string; last_name: string; email: string; phone?: string; telegram_id?: string; status?: string },
): Promise<TeacherStudioContact> => {
  const data = await callTeacherStudio<{ contact: TeacherStudioContact }>({
    method: 'POST',
    action: 'upsert_contact',
    academyId,
    body,
  });
  return data.contact;
};

export const teacherStudioCreateOffer = async (
  academyId: string,
  body: {
    name: string;
    type: string;
    price_amount: number;
    currency: string;
    duration_days?: number | null;
    description?: string;
  },
): Promise<TeacherStudioOffer> => {
  const data = await callTeacherStudio<{ offer: TeacherStudioOffer }>({
    method: 'POST',
    action: 'create_offer',
    academyId,
    body,
  });
  return data.offer;
};

export const teacherStudioCreateClassroom = async (
  academyId: string,
  body: {
    name: string;
    description?: string;
    is_active?: boolean;
  },
): Promise<TeacherStudioClassroom> => {
  const data = await callTeacherStudio<{ classroom: TeacherStudioClassroom }>({
    method: 'POST',
    action: 'create_classroom',
    academyId,
    body,
  });
  return data.classroom;
};

export const teacherStudioUpdateClassroomLanding = async (
  academyId: string,
  body: {
    classroom_id: string;
    description?: string;
    landing: {
      headline?: string;
      subheadline?: string;
      teacher_cta_label?: string;
      student_cta_label?: string;
      card_summary?: string;
    };
  },
): Promise<TeacherStudioClassroom> => {
  const data = await callTeacherStudio<{ classroom: TeacherStudioClassroom }>({
    method: 'POST',
    action: 'update_classroom_landing',
    academyId,
    body,
  });
  return data.classroom;
};

export const teacherStudioUpsertClassroomMembership = async (
  academyId: string,
  body: {
    classroom_id: string;
    contact_id: string;
    role?: string;
  },
): Promise<TeacherStudioClassroomMembership> => {
  const data = await callTeacherStudio<{ classroom_membership: TeacherStudioClassroomMembership }>({
    method: 'POST',
    action: 'upsert_classroom_membership',
    academyId,
    body,
  });
  return data.classroom_membership;
};

export const teacherStudioRemoveClassroomMembership = async (
  academyId: string,
  body: {
    id?: string;
    classroom_id?: string;
    contact_id?: string;
  },
): Promise<{ removed: Array<{ id: string; classroom_id: string; contact_id: string }> }> => {
  return callTeacherStudio<{ removed: Array<{ id: string; classroom_id: string; contact_id: string }> }>({
    method: 'POST',
    action: 'remove_classroom_membership',
    academyId,
    body,
  });
};

export const teacherStudioSendMessage = async (
  academyId: string,
  body: {
    conversation_id?: string;
    contact_id?: string;
    content: string;
  },
): Promise<{ message: TeacherStudioMessage | null; conversation_id: string | null }> => {
  return callTeacherStudio<{ message: TeacherStudioMessage | null; conversation_id: string | null }>({
    method: 'POST',
    action: 'send_message',
    academyId,
    body,
  });
};

export const teacherStudioSendAnnouncement = async (
  academyId: string,
  body: {
    title: string;
    content: string;
    classroom_id?: string | null;
  },
): Promise<{ announcement: TeacherStudioAnnouncement | null; recipient_count: number; messages_created: number }> => {
  return callTeacherStudio<{ announcement: TeacherStudioAnnouncement | null; recipient_count: number; messages_created: number }>({
    method: 'POST',
    action: 'send_announcement',
    academyId,
    body,
  });
};

export const teacherStudioCreateAlert = async (
  academyId: string,
  body: {
    contact_id?: string | null;
    type: string;
    severity: string;
    content: string;
  },
): Promise<TeacherStudioAlert> => {
  const data = await callTeacherStudio<{ alert: TeacherStudioAlert }>({
    method: 'POST',
    action: 'create_alert',
    academyId,
    body,
  });
  return data.alert;
};

export const teacherStudioResolveAlert = async (
  academyId: string,
  alertId: string,
): Promise<TeacherStudioAlert> => {
  const data = await callTeacherStudio<{ alert: TeacherStudioAlert }>({
    method: 'POST',
    action: 'resolve_alert',
    academyId,
    body: { id: alertId },
  });
  return data.alert;
};

export const teacherStudioUpsertOfferGrant = async (
  academyId: string,
  body: {
    offer_id: string;
    grant_type: string;
    resource_type?: string | null;
    resource_id?: string | null;
    capability_key?: string | null;
    quantity?: number | null;
    duration_days?: number | null;
  },
): Promise<TeacherStudioOfferGrant> => {
  const data = await callTeacherStudio<{ offer_grant: TeacherStudioOfferGrant }>({
    method: 'POST',
    action: 'upsert_offer_grant',
    academyId,
    body,
  });
  return data.offer_grant;
};

export const teacherStudioCreatePayment = async (
  academyId: string,
  body: { contact_id: string; offer_id: string; provider?: string; provider_transaction_id?: string },
): Promise<TeacherStudioPayment> => {
  const data = await callTeacherStudio<{ payment: TeacherStudioPayment }>({
    method: 'POST',
    action: 'create_payment',
    academyId,
    body,
  });
  return data.payment;
};

export const teacherStudioMarkPaymentPaid = async (
  academyId: string,
  paymentId: string,
): Promise<{ payment: TeacherStudioPayment | null; result: Json | null }> => {
  return callTeacherStudio<{ payment: TeacherStudioPayment | null; result: Json | null }>({
    method: 'POST',
    action: 'mark_payment_paid',
    academyId,
    body: { id: paymentId },
  });
};
