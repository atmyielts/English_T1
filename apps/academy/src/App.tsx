import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  BookOpenCheck,
  Building2,
  CreditCard,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Store,
  UsersRound,
} from 'lucide-react';
import {
  getMe,
  teacherStudioAcademies,
  teacherStudioAlerts,
  teacherStudioAnnouncements,
  teacherStudioClassroomMemberships,
  teacherStudioClassrooms,
  teacherStudioClassroomChat,
  teacherStudioConversationMessages,
  teacherStudioConversations,
  teacherStudioCreateAlert,
  teacherStudioCreateAcademy,
  teacherStudioCreateClassroom,
  teacherStudioDeleteClassroomResource,
  teacherStudioContacts,
  teacherStudioCreateOffer,
  teacherStudioCreateClickTuitionPayment,
  teacherStudioEntitlements,
  teacherStudioEducationOS,
  teacherStudioMarkPaymentPaid,
  teacherStudioOfferGrants,
  teacherStudioOffers,
  teacherStudioPayments,
  teacherStudioResolveAlert,
  teacherStudioResolveActionItem,
  teacherStudioSummary,
  teacherStudioStudentDashboard,
  teacherStudioSendAnnouncement,
  teacherStudioSendClassroomChatMessage,
  teacherStudioSendMessage,
  teacherStudioSetClassroomResourceProgress,
  teacherStudioUpsertClassroomResource,
  teacherStudioRemoveClassroomMembership,
  teacherStudioUpdateAcademyLanding,
  teacherStudioUpdateClassroomLanding,
  teacherStudioUpsertClassroomMembership,
  teacherStudioUpsertContact,
  teacherStudioUpsertOfferGrant,
  type TeacherStudioAcademy,
  type TeacherStudioAccessProfile,
  type TeacherStudioActionItem,
  type TeacherStudioAlert,
  type TeacherStudioAnnouncement,
  type TeacherStudioClassroom,
  type TeacherStudioClassroomResource,
  type TeacherStudioClassroomRoom,
  type TeacherStudioClassroomMembership,
  type TeacherStudioConversation,
  type TeacherStudioEducationOS,
  type MeResponse,
  type TeacherStudioContact,
  type TeacherStudioEntitlement,
  type TeacherStudioMessage,
  type TeacherStudioOffer,
  type TeacherStudioOfferGrant,
  type TeacherStudioPayment,
  type TeacherStudioSummary,
  type TeacherStudioStudentDashboard,
} from './lib/client';
import { platformUrl, supabase } from './lib/supabase';
import { AlertsView } from './components/office/AlertsView';
import { AcademyView } from './components/office/AcademyView';
import { AnnouncementsView } from './components/office/AnnouncementsView';
import { ClassroomDetailView } from './components/office/ClassroomDetailView';
import { ClassroomsView } from './components/office/ClassroomsView';
import { ContactsView } from './components/office/ContactsView';
import { EducationOSView } from './components/office/EducationOSView';
import { EntitlementsView } from './components/office/EntitlementsView';
import { InboxView } from './components/office/InboxView';
import { OffersView } from './components/office/OffersView';
import { PaymentsView } from './components/office/PaymentsView';
import { StudentClassroomView } from './components/students/StudentClassroomView';
import { UpdatesButton } from './components/UpdatesButton';
import {
  hasAccessPermission,
  hasRoutePermission,
  isAcademyAdminAccess,
  isAcademyOperationsAccess,
  isCenterAccess,
  isTeacherWorkspaceAccess,
  type AccessPermissionKey,
  type OfficeRouteIntent,
} from './lib/academyAccess';
import type {
  AlertFormState,
  AnnouncementFormState,
  ClassroomFormState,
  ClassroomMembershipFormState,
  ContactFormState,
  GrantFormState,
  OfferFormState,
  PaymentFormState,
} from './components/office/types';

type LoadState = 'loading' | 'ready' | 'unauthenticated' | 'error';
type WorkspaceMode = 'teacher' | 'student';
type OfficeView = 'academy' | 'os' | 'contacts' | 'inbox' | 'announcements' | 'alerts' | 'classrooms' | 'offers' | 'payments' | 'entitlements';
type StudentPortalView = 'academy' | 'classrooms' | 'messages' | 'alerts' | 'access';
type AcademyLandingFormState = {
  name: string;
  headline: string;
  subheadline: string;
  primary_cta_label: string;
  secondary_cta_label: string;
};
type ClassroomLandingFormState = {
  description: string;
  headline: string;
  subheadline: string;
  teacher_cta_label: string;
  student_cta_label: string;
  card_summary: string;
};
type ClassroomResourceFormState = {
  title: string;
  type: TeacherStudioClassroomResource['kind'];
  url: string;
  description: string;
  week: string;
  module: string;
  lesson: string;
  sort_order: string;
  is_published: boolean;
};
type AcademyLandingSettings = Omit<AcademyLandingFormState, 'name'>;
type ClassroomLandingSettings = Omit<ClassroomLandingFormState, 'description'>;

const OFFICE_VIEWS: OfficeView[] = ['academy', 'classrooms', 'contacts', 'inbox', 'announcements', 'alerts', 'offers', 'payments', 'entitlements', 'os'];
const ACADEMY_STAFF_ROLES = new Set(['owner', 'admin', 'center_admin', 'manager', 'counselor', 'teacher', 'assistant']);
const STUDENT_PORTAL_VIEWS: StudentPortalView[] = ['academy', 'classrooms', 'messages', 'alerts', 'access'];
const CLASSROOM_AUTO_REFRESH_MS = 12000;
const CLASSROOM_BOTTOM_THRESHOLD_PX = 56;
const CLASSROOM_RESOURCE_KIND_LABELS: Record<TeacherStudioClassroomResource['kind'], string> = {
  asset: 'Class asset',
  assignment: 'Assignment',
  book: 'Book / reading',
  link: 'Reference link',
  mock: 'Mock test',
  playbook: 'Playbook',
  practice: 'Practice set',
  video: 'Video lesson',
};
const CLASSROOM_RESOURCE_FILTERS: Array<{ kind: 'all' | TeacherStudioClassroomResource['kind']; label: string }> = [
  { kind: 'all', label: 'All' },
  { kind: 'video', label: 'Videos' },
  { kind: 'assignment', label: 'Assignments' },
  { kind: 'mock', label: 'Mocks' },
  { kind: 'practice', label: 'Practice' },
  { kind: 'playbook', label: 'Playbooks' },
  { kind: 'book', label: 'Books' },
  { kind: 'asset', label: 'Files' },
  { kind: 'link', label: 'Links' },
];

const OFFICE_LABELS: Record<OfficeView, string> = {
  academy: 'Academy',
  os: 'Command Center',
  contacts: 'Contacts',
  inbox: 'Inbox',
  announcements: 'Announcements',
  alerts: 'Alerts',
  classrooms: 'Classrooms',
  offers: 'Offers',
  payments: 'Payments',
  entitlements: 'Entitlements',
};

const OFFICE_VIEW_PERMISSIONS: Record<OfficeView, AccessPermissionKey> = {
  academy: 'viewAcademy',
  os: 'viewEducationOS',
  contacts: 'viewContacts',
  inbox: 'manageMessages',
  announcements: 'manageAnnouncements',
  alerts: 'manageAlerts',
  classrooms: 'viewClassrooms',
  offers: 'manageOffers',
  payments: 'manageFinance',
  entitlements: 'manageOffers',
};

const officeBasePath = (intent: OfficeRouteIntent = 'office'): string => {
  if (intent === 'admin') return '/academy/admin';
  if (intent === 'teacher') return '/academy/teacher';
  if (intent === 'center') return '/academy/center';
  return '/academy/office';
};

const academyOfficePath = (view: OfficeView = 'academy', itemId?: string, intent: OfficeRouteIntent = 'office'): string => {
  const basePath = officeBasePath(intent);
  const base = view === 'academy' ? basePath : `${basePath}/${view}`;
  return itemId ? `${base}/${itemId}` : base;
};

const buildFallbackAccess = (roleRaw: string, source: TeacherStudioAccessProfile['source'] = 'tenant'): TeacherStudioAccessProfile => {
  const role = String(roleRaw || 'member').toLowerCase();
  const admin = role === 'owner' || role === 'admin' || role === 'center_admin';
  const manager = role === 'manager' || role === 'counselor';
  const teaching = admin || manager || role === 'teacher' || role === 'assistant';
  return {
    role,
    source,
    scope: admin || manager ? 'academy' : 'assigned_classrooms',
    classroom_ids: [],
    center_tenant_id: null,
    permissions: {
      viewAcademy: admin || manager,
      manageAcademy: admin,
      manageStaff: admin,
      manageFinance: admin,
      manageOffers: admin,
      manageBranding: admin,
      manageAutomation: admin,
      viewContacts: teaching,
      manageContacts: admin || manager,
      viewClassrooms: teaching,
      manageClassrooms: admin || manager,
      manageRoster: admin || manager,
      manageMessages: teaching,
      manageAnnouncements: teaching,
      sendGlobalAnnouncements: admin || manager,
      manageAlerts: teaching,
      resolveAlerts: teaching,
      viewEducationOS: teaching,
      resolveActionItems: teaching,
      manageAssignments: teaching,
      gradeSubmissions: teaching,
      markAttendance: teaching,
      manageSchedule: teaching,
      manageResources: teaching,
      viewReports: admin || manager,
      issueCertificates: admin || manager,
      dispatchNotifications: admin || manager,
      viewNotifications: admin || manager,
      viewReferrals: admin || manager,
    },
  };
};

const canEnterAcademyOffice = (access: TeacherStudioAccessProfile | null | undefined): boolean =>
  OFFICE_VIEWS.some((view) => hasAccessPermission(access, OFFICE_VIEW_PERMISSIONS[view]));

const academyOfficeAccess = (academy: TeacherStudioAcademy): TeacherStudioAccessProfile =>
  academy.access ?? buildFallbackAccess(academy.role);

const academyCanEnterOffice = (academy: TeacherStudioAcademy): boolean =>
  canEnterAcademyOffice(academyOfficeAccess(academy));

const accessRoleLabel = (access: TeacherStudioAccessProfile | null | undefined): string => {
  const role = String(access?.role ?? 'member').replace(/_/g, ' ');
  return role.charAt(0).toUpperCase() + role.slice(1);
};

const officeShellLabel = (
  access: TeacherStudioAccessProfile | null | undefined,
  intent: OfficeRouteIntent = 'office',
): { title: string; subtitle: string } => {
  if (intent === 'center') {
    return { title: 'Education Center Control', subtitle: 'Delegated academy operations' };
  }
  if (intent === 'admin') {
    return { title: 'Academy Administration', subtitle: 'Control, finance, and access' };
  }
  if (intent === 'teacher') {
    return { title: 'Teacher Workspace', subtitle: 'Classrooms, LMS, and student actions' };
  }
  if (hasAccessPermission(access, 'manageFinance')) {
    return { title: 'Academy Control', subtitle: 'Owner administration' };
  }
  if (hasAccessPermission(access, 'manageClassrooms')) {
    return { title: 'Academy LMS', subtitle: 'Operations control' };
  }
  return { title: 'Teacher Workspace', subtitle: 'Assigned classrooms' };
};

const officeIntentForAccess = (access: TeacherStudioAccessProfile | null | undefined): OfficeRouteIntent => {
  if (isCenterAccess(access)) return 'center';
  if (isAcademyAdminAccess(access) && hasAccessPermission(access, 'manageAcademy')) return 'admin';
  if (isAcademyOperationsAccess(access)) return 'office';
  if (isTeacherWorkspaceAccess(access) && (hasAccessPermission(access, 'viewClassrooms') || hasAccessPermission(access, 'viewEducationOS'))) return 'teacher';
  return 'office';
};

const OFFICE_ROUTE_VIEW_CAPS: Record<OfficeRouteIntent, OfficeView[]> = {
  office: OFFICE_VIEWS,
  admin: ['academy', 'os', 'contacts', 'classrooms', 'offers', 'payments', 'entitlements', 'announcements', 'alerts', 'inbox'],
  teacher: ['classrooms', 'os', 'contacts', 'inbox', 'announcements', 'alerts'],
  center: ['os', 'academy', 'classrooms', 'contacts', 'inbox', 'alerts', 'offers', 'payments', 'entitlements', 'announcements'],
};

const hasOfficeRoutePermission = (
  access: TeacherStudioAccessProfile | null | undefined,
  intent: OfficeRouteIntent,
  permission: AccessPermissionKey,
): boolean => hasRoutePermission(access, intent, permission);

const officeIntentCanEnter = (
  access: TeacherStudioAccessProfile | null | undefined,
  intent: OfficeRouteIntent,
): boolean => {
  if (!access) return false;
  if (intent === 'office') return isAcademyOperationsAccess(access) && canEnterAcademyOffice(access);
  if (intent === 'teacher') {
    return (
      isTeacherWorkspaceAccess(access) &&
      (hasOfficeRoutePermission(access, intent, 'viewClassrooms') || hasOfficeRoutePermission(access, intent, 'viewEducationOS'))
    );
  }
  if (intent === 'admin') {
    return (
      isAcademyAdminAccess(access) &&
      (hasOfficeRoutePermission(access, intent, 'manageAcademy') ||
        hasOfficeRoutePermission(access, intent, 'manageStaff') ||
        hasOfficeRoutePermission(access, intent, 'manageFinance') ||
        hasOfficeRoutePermission(access, intent, 'manageOffers'))
    );
  }
  return isCenterAccess(access) && canEnterAcademyOffice(access);
};

const officeViewsForIntent = (
  access: TeacherStudioAccessProfile | null | undefined,
  intent: OfficeRouteIntent,
): OfficeView[] => {
  if (!officeIntentCanEnter(access, intent)) return [];
  const caps = OFFICE_ROUTE_VIEW_CAPS[intent] ?? OFFICE_VIEWS;
  return caps.filter((view) => hasOfficeRoutePermission(access, intent, OFFICE_VIEW_PERMISSIONS[view]));
};

const defaultOfficeViewForIntent = (
  views: OfficeView[],
  intent: OfficeRouteIntent,
): OfficeView => {
  if (intent === 'teacher') {
    if (views.includes('classrooms')) return 'classrooms';
    if (views.includes('os')) return 'os';
    if (views.includes('inbox')) return 'inbox';
  }
  if (intent === 'center') {
    if (views.includes('os')) return 'os';
    if (views.includes('academy')) return 'academy';
  }
  if (intent === 'admin') {
    if (views.includes('academy')) return 'academy';
    if (views.includes('payments')) return 'payments';
    if (views.includes('offers')) return 'offers';
  }
  if (views.includes('academy')) return 'academy';
  if (views.includes('classrooms')) return 'classrooms';
  return views[0] ?? 'classrooms';
};

const officeLaneViewLabel = (
  view: OfficeView,
  intent: OfficeRouteIntent,
  academyLabel: string,
  osLabel: string,
): string => {
  if (view === 'academy') return academyLabel;
  if (view === 'os') return osLabel;
  if (intent === 'teacher') {
    if (view === 'classrooms') return 'My LMS classes';
    if (view === 'contacts') return 'My students';
    if (view === 'inbox') return 'Student inbox';
    if (view === 'announcements') return 'Class updates';
    if (view === 'alerts') return 'Student alerts';
  }
  if (intent === 'center') {
    if (view === 'classrooms') return 'Center LMS';
    if (view === 'contacts') return 'Academy contacts';
    if (view === 'inbox') return 'Center inbox';
    if (view === 'announcements') return 'Center announcements';
    if (view === 'alerts') return 'Center alerts';
  }
  return OFFICE_LABELS[view];
};

const actionAllowedForOfficeRoute = (
  item: TeacherStudioActionItem,
  access: TeacherStudioAccessProfile | null | undefined,
  intent: OfficeRouteIntent,
): boolean => {
  const sourceType = item.source_type;
  if (['grading_backlog', 'missing_assignment'].includes(sourceType)) {
    return hasOfficeRoutePermission(access, intent, 'gradeSubmissions') || hasOfficeRoutePermission(access, intent, 'manageAssignments');
  }
  if (sourceType === 'attendance_roll_call') return hasOfficeRoutePermission(access, intent, 'markAttendance');
  if (sourceType === 'schedule_gap') return hasOfficeRoutePermission(access, intent, 'manageSchedule');
  if (['placement_needed', 'trial_follow_up'].includes(sourceType)) return hasOfficeRoutePermission(access, intent, 'viewContacts');
  if (['renewal', 'payment', 'payment_due'].includes(sourceType)) return hasOfficeRoutePermission(access, intent, 'manageFinance');
  if (sourceType === 'certificate_ready') return hasOfficeRoutePermission(access, intent, 'issueCertificates');
  if (sourceType === 'parent_follow_up') return hasOfficeRoutePermission(access, intent, 'viewReports');
  if (sourceType === 'alert') {
    return (
      hasOfficeRoutePermission(access, intent, 'manageAlerts') ||
      hasOfficeRoutePermission(access, intent, 'resolveAlerts') ||
      hasOfficeRoutePermission(access, intent, 'viewEducationOS')
    );
  }
  return hasOfficeRoutePermission(access, intent, 'viewEducationOS');
};

const filterEducationOSForOfficeRoute = (
  os: TeacherStudioEducationOS | null,
  access: TeacherStudioAccessProfile | null | undefined,
  intent: OfficeRouteIntent,
): TeacherStudioEducationOS | null => {
  if (!os) return null;
  if (intent === 'admin') return os;

  const canSeeFinance = hasOfficeRoutePermission(access, intent, 'manageFinance');
  const canIssueCertificates = hasOfficeRoutePermission(access, intent, 'issueCertificates');
  const action_queue = os.action_queue.filter((item) => actionAllowedForOfficeRoute(item, access, intent));
  const pipeline = os.pipeline.map((row) => {
    const hasRenewalSignal =
      row.stage === 'renewal' ||
      row.derived_stage === 'renewal' ||
      row.pending_amount > 0 ||
      Boolean(row.entitlement_expires_at);
    const hasCertificateSignal =
      row.stage === 'completion' ||
      row.derived_stage === 'completion' ||
      row.certificate_ready === true;
    const hideRenewalSignal = !canSeeFinance && hasRenewalSignal;
    const hideCertificateSignal = !canIssueCertificates && hasCertificateSignal;
    if (!hideRenewalSignal && !hideCertificateSignal) return row;
    const visibleStage = hideRenewalSignal || (hideCertificateSignal && row.stage === 'completion') ? 'learning' : row.stage;
    const visibleDerivedStage =
      (hideRenewalSignal && row.derived_stage === 'renewal') || (hideCertificateSignal && row.derived_stage === 'completion')
        ? visibleStage
        : row.derived_stage;
    return {
      ...row,
      stage: visibleStage,
      derived_stage: visibleDerivedStage,
      next_action: hideRenewalSignal
        ? 'Monitor attendance, grade submissions, and keep learning momentum.'
        : 'Review progress, feedback, and the next learning milestone.',
      pending_amount: hideRenewalSignal ? 0 : row.pending_amount,
      entitlement_expires_at: hideRenewalSignal ? null : row.entitlement_expires_at,
      certificate_ready: false,
    };
  });
  const pipeline_counts = pipeline.reduce<Record<string, number>>((acc, row) => {
    const stage = row.stage || 'enrolled';
    acc[stage] = (acc[stage] ?? 0) + 1;
    return acc;
  }, { lead: 0, placement: 0, enrolled: 0, learning: 0, attention: 0, renewal: 0, completion: 0 });
  const calendar_events = os.calendar_events.filter((event) => {
    if (event.type === 'assignment_due') {
      return hasOfficeRoutePermission(access, intent, 'manageAssignments') || hasOfficeRoutePermission(access, intent, 'gradeSubmissions');
    }
    if (event.type === 'notification') {
      return hasOfficeRoutePermission(access, intent, 'viewNotifications') || hasOfficeRoutePermission(access, intent, 'dispatchNotifications');
    }
    if (['payment', 'renewal'].includes(event.type)) return canSeeFinance;
    if (event.type === 'action') {
      const metadata = event.metadata && !Array.isArray(event.metadata) ? event.metadata as Record<string, unknown> : {};
      return actionAllowedForOfficeRoute({ source_type: String(metadata.source_type ?? '') } as TeacherStudioActionItem, access, intent);
    }
    return hasOfficeRoutePermission(access, intent, 'viewEducationOS');
  });
  const intelligence = os.intelligence.filter((insight) => {
    if (insight.type === 'learning') {
      return hasOfficeRoutePermission(access, intent, 'manageAssignments') || hasOfficeRoutePermission(access, intent, 'gradeSubmissions');
    }
    if (insight.type === 'attendance') {
      return hasOfficeRoutePermission(access, intent, 'markAttendance') || hasOfficeRoutePermission(access, intent, 'manageSchedule');
    }
    if (insight.type === 'growth') {
      return hasOfficeRoutePermission(access, intent, 'viewReports') || hasOfficeRoutePermission(access, intent, 'manageContacts');
    }
    if (insight.type === 'completion') return canIssueCertificates;
    if (['revenue', 'renewal', 'payment'].includes(insight.type)) return canSeeFinance;
    return hasOfficeRoutePermission(access, intent, 'viewEducationOS');
  });

  return {
    ...os,
    action_queue,
    pipeline,
    pipeline_counts,
    calendar_events,
    intelligence,
    stats: {
      open_actions: action_queue.length,
      urgent_actions: action_queue.filter((item) => ['critical', 'high'].includes(item.priority)).length,
      grading_backlog: action_queue.filter((item) => item.source_type === 'grading_backlog').length,
      certificate_ready: canIssueCertificates ? pipeline.filter((row) => row.certificate_ready).length : 0,
      placement_gap: pipeline_counts.placement ?? 0,
    },
  };
};

const STUDENT_PORTAL_LABELS: Record<StudentPortalView, string> = {
  academy: 'Academy',
  classrooms: 'Classrooms',
  messages: 'Messages',
  alerts: 'Alerts',
  access: 'Access',
};

const toAuthUrl = (): string => {
  const returnTo = typeof window !== 'undefined' ? window.location.href : '/';
  const base = `${platformUrl.replace(/\/$/, '')}/auth`;
  const productSlug = String(import.meta.env.VITE_PLATFORM_PRODUCT_SLUG ?? 'academy').trim() || 'academy';
  const qs = new URLSearchParams({ returnTo, product: productSlug });
  return `${base}?${qs.toString()}`;
};

const normalizePath = (pathname: string): string => pathname.replace(/\/+$/, '') || '/';

const officeRouteIntentFromPath = (pathname: string): OfficeRouteIntent | null => {
  const normalized = normalizePath(pathname);
  if (normalized === '/academy/admin' || normalized.startsWith('/academy/admin/')) return 'admin';
  if (normalized === '/academy/teacher' || normalized.startsWith('/academy/teacher/')) return 'teacher';
  if (normalized === '/academy/center' || normalized.startsWith('/academy/center/')) return 'center';
  if (normalized === '/academy/office' || normalized.startsWith('/academy/office/') || normalized === '/office' || normalized.startsWith('/office/')) return 'office';
  return null;
};

const isOfficeRouteRoot = (pathname: string): boolean =>
  ['/academy/office', '/office', '/academy/admin', '/academy/teacher', '/academy/center'].includes(normalizePath(pathname));

const officeViewFromPath = (pathname: string): OfficeView | null => {
  const normalized = normalizePath(pathname);
  const candidates = [
    normalized === '/academy/office' ? 'academy' : null,
    normalized === '/academy/teacher' ? 'academy' : null,
    normalized === '/academy/admin' ? 'academy' : null,
    normalized === '/academy/center' ? 'academy' : null,
    normalized === '/office' ? 'academy' : null,
    normalized.startsWith('/academy/office/') ? normalized.slice('/academy/office/'.length) : null,
    normalized.startsWith('/academy/teacher/') ? normalized.slice('/academy/teacher/'.length) : null,
    normalized.startsWith('/academy/admin/') ? normalized.slice('/academy/admin/'.length) : null,
    normalized.startsWith('/academy/center/') ? normalized.slice('/academy/center/'.length) : null,
    normalized.startsWith('/office/') ? normalized.slice('/office/'.length) : null,
  ].filter((value): value is string => !!value);

  for (const candidateRaw of candidates) {
    const candidate = candidateRaw.split('/')[0] as OfficeView;
    if (candidateRaw === candidate && OFFICE_VIEWS.includes(candidate)) return candidate;
  }

  return null;
};

const studentPortalViewFromPath = (pathname: string): StudentPortalView | null => {
  const normalized = normalizePath(pathname);
  const candidates = [
    normalized === '/academy/student' ? 'academy' : null,
    normalized === '/student' ? 'academy' : null,
    normalized.startsWith('/academy/student/') ? normalized.slice('/academy/student/'.length) : null,
    normalized.startsWith('/student/') ? normalized.slice('/student/'.length) : null,
  ].filter((value): value is string => !!value);

  for (const candidateRaw of candidates) {
    const candidate = candidateRaw.split('/')[0] as StudentPortalView;
    if (candidateRaw === candidate && STUDENT_PORTAL_VIEWS.includes(candidate)) return candidate;
  }

  return null;
};

const officeClassroomIdFromPath = (pathname: string): string | null => {
  const normalized = normalizePath(pathname);
  const prefix = normalized.startsWith('/academy/office/classrooms/')
    ? '/academy/office/classrooms/'
    : normalized.startsWith('/academy/teacher/classrooms/')
      ? '/academy/teacher/classrooms/'
      : normalized.startsWith('/academy/admin/classrooms/')
        ? '/academy/admin/classrooms/'
        : normalized.startsWith('/academy/center/classrooms/')
          ? '/academy/center/classrooms/'
          : normalized.startsWith('/office/classrooms/')
            ? '/office/classrooms/'
            : null;
  if (!prefix) return null;
  const candidate = normalized.slice(prefix.length).trim();
  return candidate.length > 0 ? candidate : null;
};

const studentClassroomIdFromPath = (pathname: string): string | null => {
  const normalized = normalizePath(pathname);
  const prefix = normalized.startsWith('/academy/student/classrooms/')
    ? '/academy/student/classrooms/'
    : normalized.startsWith('/student/classrooms/')
      ? '/student/classrooms/'
      : null;
  if (!prefix) return null;
  const candidate = normalized.slice(prefix.length).trim();
  return candidate.length > 0 ? candidate : null;
};

const academyClassroomIdFromPath = (pathname: string): string | null => {
  const normalized = normalizePath(pathname);
  if (!normalized.startsWith('/academy/classrooms/')) return null;
  const candidate = normalized.slice('/academy/classrooms/'.length).trim();
  if (!candidate || candidate.includes('/')) return null;
  return candidate;
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const toText = (value: unknown): string => (typeof value === 'string' ? value : '');

const readAcademyLandingSettings = (metadata: unknown): AcademyLandingSettings => {
  const landing = toRecord(toRecord(metadata).landing);
  return {
    headline: toText(landing.headline),
    subheadline: toText(landing.subheadline),
    primary_cta_label: toText(landing.primary_cta_label),
    secondary_cta_label: toText(landing.secondary_cta_label),
  };
};

const readClassroomLandingSettings = (metadata: unknown): ClassroomLandingSettings => {
  const landing = toRecord(toRecord(metadata).landing);
  return {
    headline: toText(landing.headline),
    subheadline: toText(landing.subheadline),
    teacher_cta_label: toText(landing.teacher_cta_label),
    student_cta_label: toText(landing.student_cta_label),
    card_summary: toText(landing.card_summary),
  };
};

const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return '-';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '-';
  return new Date(parsed).toLocaleString();
};

const formatRelativeTime = (iso: string | null | undefined): string => {
  if (!iso) return 'just now';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return 'just now';

  const diffMs = Date.now() - parsed;
  if (diffMs < 45_000) return 'just now';
  if (diffMs < 60 * 60 * 1000) return `${Math.max(1, Math.round(diffMs / 60_000))}m ago`;
  if (diffMs < 24 * 60 * 60 * 1000) return `${Math.max(1, Math.round(diffMs / (60 * 60 * 1000)))}h ago`;
  return `${Math.max(1, Math.round(diffMs / (24 * 60 * 60 * 1000)))}d ago`;
};

const normalizeError = (err: unknown): string => {
  const raw = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  if (raw.includes('401') || raw.includes('Unauthorized')) return 'Your session expired. Please sign in again.';
  if (raw.includes('403') || raw.includes('Forbidden')) return 'You do not have access to this academy.';
  if (raw.includes('No active academy membership')) return 'No active academy membership found for this account.';
  if (raw.includes('Failed to fetch')) return 'Network error. Check your internet connection and retry.';
  return raw;
};

const statusClass = (status: string): string => {
  const normalized = status.toLowerCase();
  if (normalized === 'paid' || normalized === 'active') return 'status status--ok';
  if (normalized === 'pending') return 'status status--pending';
  if (normalized === 'failed' || normalized === 'expired' || normalized === 'revoked' || normalized === 'canceled') {
    return 'status status--bad';
  }
  return 'status';
};

const weekSortNumber = (label: string): number | null => {
  const match = String(label ?? '').match(/(\d+)/);
  if (!match) return null;
  const numeric = Number(match[1]);
  return Number.isFinite(numeric) ? numeric : null;
};

const isAcademyStaffMembership = (membership: MeResponse['memberships'][number]): boolean => {
  const normalizedRole = String(membership.role ?? '').toLowerCase();
  if (!ACADEMY_STAFF_ROLES.has(normalizedRole)) return false;
  const tenant = Array.isArray((membership as any).tenants) ? (membership as any).tenants[0] : membership.tenants;
  const tenantType = String(tenant?.type ?? '').toLowerCase();
  const metadata: Record<string, unknown> = tenant?.metadata && typeof tenant.metadata === 'object' && !Array.isArray(tenant.metadata)
    ? tenant.metadata
    : {};
  return (
    tenantType === 'team' ||
    String(metadata.service_family ?? '').toLowerCase() === 'academy' ||
    metadata.academy_service === true ||
    metadata.center_owned === true
  );
};

const emptyStudentDashboard = (): TeacherStudioStudentDashboard => ({
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

const hasStudentWorkspaceAccess = (dashboard: TeacherStudioStudentDashboard | null): boolean =>
  (dashboard?.contacts ?? []).length > 0;

const teacherAcademyFromMembership = (membership: MeResponse['memberships'][number]): TeacherStudioAcademy => ({
  id: membership.tenant_id,
  name: membership.tenant_id,
  slug: membership.tenant_id,
  type: 'team',
  metadata: {},
  role: membership.role,
  status: membership.status,
  created_at: '',
  access: buildFallbackAccess(membership.role),
});

const toEmbeddableVideoUrl = (rawUrl: string): string | null => {
  const value = String(rawUrl ?? '').trim();
  if (!value) return null;

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      const id = parsed.pathname.replace(/^\/+/, '').trim();
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname === '/watch') {
        const id = parsed.searchParams.get('v')?.trim() ?? '';
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      if (parsed.pathname.startsWith('/embed/')) return parsed.toString();
    }
    if (host === 'player.vimeo.com' && parsed.pathname.startsWith('/video/')) return parsed.toString();
    if (host === 'vimeo.com') {
      const id = parsed.pathname.replace(/^\/+/, '').trim();
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }

  return null;
};

const defaultContactForm = (): ContactFormState => ({
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
});

const defaultClassroomForm = (): ClassroomFormState => ({
  name: '',
  description: '',
});

const defaultAcademyLandingForm = (): AcademyLandingFormState => ({
  name: '',
  headline: '',
  subheadline: '',
  primary_cta_label: '',
  secondary_cta_label: '',
});

const defaultClassroomLandingForm = (): ClassroomLandingFormState => ({
  description: '',
  headline: '',
  subheadline: '',
  teacher_cta_label: '',
  student_cta_label: '',
  card_summary: '',
});

const defaultClassroomMembershipForm = (): ClassroomMembershipFormState => ({
  classroom_id: '',
  contact_id: '',
  role: 'student',
});

const defaultAnnouncementForm = (): AnnouncementFormState => ({
  classroom_id: '',
  title: '',
  content: '',
});

const defaultAlertForm = (): AlertFormState => ({
  contact_id: '',
  type: 'attendance',
  severity: 'medium',
  content: '',
});

const defaultOfferForm = (): OfferFormState => ({
  name: '',
  type: 'subscription',
  price_amount: '0',
  currency: 'UZS',
  duration_days: '30',
  description: '',
});

const defaultGrantForm = (): GrantFormState => ({
  offer_id: '',
  grant_type: 'product_access',
  resource_type: 'product',
  resource_id: '',
  capability_key: '',
  quantity: '1',
  duration_days: '30',
});

const defaultPaymentForm = (): PaymentFormState => ({
  contact_id: '',
  offer_id: '',
});

const defaultClassroomResourceForm = (): ClassroomResourceFormState => ({
  title: '',
  type: 'asset',
  url: '',
  description: '',
  week: '',
  module: '',
  lesson: '',
  sort_order: '0',
  is_published: true,
});

const App = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [state, setState] = useState<LoadState>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [me, setMe] = useState<MeResponse | null>(null);
  const [academyId, setAcademyId] = useState('');
  const [academies, setAcademies] = useState<TeacherStudioAcademy[]>([]);
  const [studentDashboard, setStudentDashboard] = useState<TeacherStudioStudentDashboard | null>(null);

  const [summary, setSummary] = useState<TeacherStudioSummary | null>(null);
  const [contacts, setContacts] = useState<TeacherStudioContact[]>([]);
  const [classrooms, setClassrooms] = useState<TeacherStudioClassroom[]>([]);
  const [classroomMemberships, setClassroomMemberships] = useState<TeacherStudioClassroomMembership[]>([]);
  const [conversations, setConversations] = useState<TeacherStudioConversation[]>([]);
  const [messages, setMessages] = useState<TeacherStudioMessage[]>([]);
  const [announcements, setAnnouncements] = useState<TeacherStudioAnnouncement[]>([]);
  const [alerts, setAlerts] = useState<TeacherStudioAlert[]>([]);
  const [offers, setOffers] = useState<TeacherStudioOffer[]>([]);
  const [offerGrants, setOfferGrants] = useState<TeacherStudioOfferGrant[]>([]);
  const [payments, setPayments] = useState<TeacherStudioPayment[]>([]);
  const [entitlements, setEntitlements] = useState<TeacherStudioEntitlement[]>([]);
  const [educationOS, setEducationOS] = useState<TeacherStudioEducationOS | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState('');

  const [contactForm, setContactForm] = useState<ContactFormState>(defaultContactForm);
  const [classroomForm, setClassroomForm] = useState<ClassroomFormState>(defaultClassroomForm);
  const [classroomMembershipForm, setClassroomMembershipForm] = useState<ClassroomMembershipFormState>(defaultClassroomMembershipForm);
  const [announcementForm, setAnnouncementForm] = useState<AnnouncementFormState>(defaultAnnouncementForm);
  const [alertForm, setAlertForm] = useState<AlertFormState>(defaultAlertForm);
  const [messageDraft, setMessageDraft] = useState('');
  const [offerForm, setOfferForm] = useState<OfferFormState>(defaultOfferForm);
  const [grantForm, setGrantForm] = useState<GrantFormState>(defaultGrantForm);
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>(defaultPaymentForm);
  const [academyNameDraft, setAcademyNameDraft] = useState('');
  const [academySlugDraft, setAcademySlugDraft] = useState('');
  const [academyLandingForm, setAcademyLandingForm] = useState<AcademyLandingFormState>(defaultAcademyLandingForm);
  const [classroomLandingForm, setClassroomLandingForm] = useState<ClassroomLandingFormState>(defaultClassroomLandingForm);
  const [classroomRoom, setClassroomRoom] = useState<TeacherStudioClassroomRoom | null>(null);
  const [classroomRoomBusy, setClassroomRoomBusy] = useState(false);
  const [classroomDiscussionDraft, setClassroomDiscussionDraft] = useState('');
  const [classroomResourceFilter, setClassroomResourceFilter] = useState<'all' | TeacherStudioClassroomResource['kind']>('all');
  const [classroomActiveResourceId, setClassroomActiveResourceId] = useState('');
  const [classroomCollapsedModules, setClassroomCollapsedModules] = useState<Set<string>>(new Set());
  const [classroomResourceForm, setClassroomResourceForm] = useState<ClassroomResourceFormState>(defaultClassroomResourceForm);
  const [classroomAutoRefreshEnabled, setClassroomAutoRefreshEnabled] = useState(true);
  const [classroomLastSyncAt, setClassroomLastSyncAt] = useState<string | null>(null);
  const [classroomSyncError, setClassroomSyncError] = useState('');
  const [classroomNewMessages, setClassroomNewMessages] = useState(0);
  const [classroomThreadPinned, setClassroomThreadPinned] = useState(true);
  const classroomThreadRef = useRef<HTMLDivElement | null>(null);
  const classroomRefreshInFlightRef = useRef(false);
  const classroomMessageSnapshotRef = useRef<{ classroomId: string; latestMessageId: string; count: number }>({
    classroomId: '',
    latestMessageId: '',
    count: 0,
  });

  const activeMemberships = useMemo(
    () => (me?.memberships ?? []).filter((membership) => membership.status === 'active'),
    [me],
  );
  const teacherMemberships = useMemo(
    () => activeMemberships.filter(isAcademyStaffMembership),
    [activeMemberships],
  );
  const teacherDirectoryAcademies = useMemo(
    () => (academies.length > 0 ? academies : teacherMemberships.map(teacherAcademyFromMembership)).filter(academyCanEnterOffice),
    [academies, teacherMemberships],
  );
  const activeMembership = useMemo(
    () => {
      const pool = teacherMemberships;
      return pool.find((membership) => membership.tenant_id === academyId) ?? pool[0] ?? null;
    },
    [academyId, teacherMemberships],
  );
  const selectedOfficeAcademy = useMemo(
    () => teacherDirectoryAcademies.find((academy) => academy.id === academyId) ?? null,
    [teacherDirectoryAcademies, academyId],
  );
  const selectedAcademyAccess = useMemo<TeacherStudioAccessProfile | null>(() => {
    if (selectedOfficeAcademy?.access) return selectedOfficeAcademy.access;
    if (activeMembership) return buildFallbackAccess(activeMembership.role);
    return null;
  }, [activeMembership, selectedOfficeAcademy]);
  const normalizedPath = useMemo(() => normalizePath(location.pathname), [location.pathname]);
  const officeRouteIntent = useMemo(() => officeRouteIntentFromPath(location.pathname) ?? 'office', [location.pathname]);
  const officeRouteRoot = useMemo(() => isOfficeRouteRoot(location.pathname), [location.pathname]);
  const canUseOfficePermission = useCallback(
    (permission: AccessPermissionKey): boolean => hasOfficeRoutePermission(selectedAcademyAccess, officeRouteIntent, permission),
    [officeRouteIntent, selectedAcademyAccess],
  );
  const requireOfficePermission = (permission: AccessPermissionKey, label: string): boolean => {
    if (canUseOfficePermission(permission)) return true;
    setError(`${label} is not available in this Academy route.`);
    return false;
  };
  const canManageLanding = canUseOfficePermission('manageAcademy');
  const canManageAcademy = canUseOfficePermission('manageAcademy');
  const canManageContacts = canUseOfficePermission('manageContacts');
  const canManageClassrooms = canUseOfficePermission('manageClassrooms');
  const canManageRoster = canUseOfficePermission('manageRoster');
  const canManageAnnouncements = canUseOfficePermission('manageAnnouncements');
  const canSendGlobalAnnouncements = canUseOfficePermission('sendGlobalAnnouncements');
  const canManageAlerts = canUseOfficePermission('manageAlerts');
  const canResolveAlerts = canUseOfficePermission('resolveAlerts');
  const canResolveActionItems = canUseOfficePermission('resolveActionItems');
  const canManageFinance = canUseOfficePermission('manageFinance');
  const canManageOffers = canUseOfficePermission('manageOffers');
  const canIssueCertificates = canUseOfficePermission('issueCertificates');
  const canViewReports = canUseOfficePermission('viewReports');
  const academyHomeLabel = canManageAcademy
    ? 'Academy control'
    : canManageClassrooms || canManageContacts
      ? 'Academy operations'
      : 'Workspace home';
  const osCenterLabel = canManageFinance
    ? 'Command Center'
    : canViewReports || canManageClassrooms || canManageContacts
      ? 'Operations Center'
      : 'LMS Center';
  const officeRouteAcademies = useMemo(
    () =>
      teacherDirectoryAcademies.filter((academy) =>
        officeIntentCanEnter(academy.access ?? buildFallbackAccess(academy.role), officeRouteIntent),
      ),
    [officeRouteIntent, teacherDirectoryAcademies],
  );
  const officeRouteAcademyIds = useMemo(
    () => new Set(officeRouteAcademies.map((academy) => academy.id)),
    [officeRouteAcademies],
  );
  const allowedOfficeViews = useMemo(
    () => officeViewsForIntent(selectedAcademyAccess, officeRouteIntent),
    [officeRouteIntent, selectedAcademyAccess],
  );
  const academyQuickTargets = useMemo(() => {
    const targetCopy: Partial<Record<OfficeView, { title: string; caption: string }>> = {
      classrooms: { title: 'Classroom LMS', caption: 'Gradebook, attendance, student actions, schedule' },
      contacts: { title: 'Contacts', caption: canManageContacts ? 'Manage students and assistants' : 'Student records and lifecycle context' },
      inbox: { title: 'Inbox', caption: 'Message students and families inside the academy scope' },
      announcements: { title: 'Announcements', caption: canSendGlobalAnnouncements ? 'Send academy-wide and classroom updates' : 'Send classroom updates' },
      alerts: { title: 'Alerts', caption: 'Create and resolve student attention signals' },
      offers: { title: 'Offers', caption: 'Define paid plans and packages' },
      entitlements: { title: 'Access grants', caption: 'Review active LMS and classroom access' },
      payments: { title: 'Payments', caption: 'Track Click payments and settlement' },
      os: { title: osCenterLabel, caption: 'Automations, actions, reports, and learning signals' },
    };
    return allowedOfficeViews
      .filter((view) => view !== 'academy')
      .map((view) => targetCopy[view] ? { ...targetCopy[view], path: academyOfficePath(view, undefined, officeRouteIntent) } : null)
      .filter((target): target is { title: string; caption: string; path: string } => Boolean(target));
  }, [allowedOfficeViews, canManageContacts, canSendGlobalAnnouncements, officeRouteIntent, osCenterLabel]);
  const defaultOfficeView = defaultOfficeViewForIntent(allowedOfficeViews, officeRouteIntent);
  const routeDefaultOfficeView = useMemo<OfficeView>(
    () => defaultOfficeViewForIntent(allowedOfficeViews, officeRouteIntent),
    [allowedOfficeViews, officeRouteIntent],
  );
  const academyOptions = useMemo(
    () =>
      (officeRouteAcademies.length > 0 ? officeRouteAcademies : teacherDirectoryAcademies).map((academy) => ({
        id: academy.id,
        label: `${academy.name || academy.id} (${accessRoleLabel(academy.access ?? buildFallbackAccess(academy.role))})`,
      })),
    [officeRouteAcademies, teacherDirectoryAcademies],
  );

  const requestedAcademyId = useMemo(
    () => (new URLSearchParams(location.search).get('academy_id') ?? '').trim(),
    [location.search],
  );
  const isServiceLanding = normalizedPath === '/';
  const isAcademyDirectory = normalizedPath === '/academies';
  const isAcademyLanding = normalizedPath === '/academy';
  const isAcademyClassroomsLanding = normalizedPath === '/academy/classrooms';
  const academyClassroomLandingId = useMemo(() => academyClassroomIdFromPath(location.pathname), [location.pathname]);
  const officeView = useMemo(() => officeViewFromPath(location.pathname), [location.pathname]);
  const studentPortalView = useMemo(() => studentPortalViewFromPath(location.pathname), [location.pathname]);
  const officeClassroomId = useMemo(() => officeClassroomIdFromPath(location.pathname), [location.pathname]);
  const studentClassroomId = useMemo(() => studentClassroomIdFromPath(location.pathname), [location.pathname]);
  const isTeacherWorkspaceRoute = !!officeView || !!officeClassroomId;
  const isStudentWorkspaceRoute = !!studentPortalView || !!studentClassroomId;
  const isSharedAcademyRoute =
    isServiceLanding ||
    isAcademyDirectory ||
    isAcademyLanding ||
    isAcademyClassroomsLanding ||
    !!academyClassroomLandingId;
  const hasTeacherAccess = teacherDirectoryAcademies.length > 0;
  const hasStudentAccess = hasStudentWorkspaceAccess(studentDashboard);
  const teacherAcademyIds = useMemo(
    () => new Set(teacherDirectoryAcademies.map((academy) => academy.id)),
    [teacherDirectoryAcademies],
  );
  const studentAcademyIds = useMemo(
    () => new Set((studentDashboard?.academies ?? []).map((academy) => academy.id)),
    [studentDashboard],
  );
  const studentDirectoryAcademies = useMemo(
    () => studentDashboard?.academies ?? [],
    [studentDashboard],
  );

  const selectedOfficeClassroom = useMemo(
    () => (officeClassroomId ? classrooms.find((classroom) => classroom.id === officeClassroomId) ?? null : null),
    [classrooms, officeClassroomId],
  );
  const selectedOfficeClassroomMemberships = useMemo(
    () =>
      officeClassroomId
        ? classroomMemberships.filter((membership) => membership.classroom_id === officeClassroomId)
        : [],
    [classroomMemberships, officeClassroomId],
  );

  const sharedClassroomScopeClassroom = useMemo(() => {
    if (!academyClassroomLandingId) return null;
    const teacherClassroom = classrooms.find((classroom) => classroom.id === academyClassroomLandingId) ?? null;
    if (teacherClassroom) return teacherClassroom;
    return (studentDashboard?.classrooms ?? []).find((classroom) => classroom.id === academyClassroomLandingId) ?? null;
  }, [academyClassroomLandingId, classrooms, studentDashboard]);

  const sharedClassroomAcademyId = useMemo(() => {
    if (!academyClassroomLandingId) return '';
    if (requestedAcademyId) return requestedAcademyId;
    if (sharedClassroomScopeClassroom?.academy_id) return sharedClassroomScopeClassroom.academy_id;
    return academyId;
  }, [academyClassroomLandingId, requestedAcademyId, sharedClassroomScopeClassroom, academyId]);

  useEffect(() => {
    if (!selectedOfficeAcademy) {
      setAcademyLandingForm(defaultAcademyLandingForm());
      return;
    }
    const landing = readAcademyLandingSettings(selectedOfficeAcademy.metadata);
    setAcademyLandingForm({
      name: selectedOfficeAcademy.name ?? '',
      ...landing,
    });
  }, [selectedOfficeAcademy]);

  useEffect(() => {
    if (!selectedOfficeClassroom) {
      setClassroomLandingForm(defaultClassroomLandingForm());
      return;
    }
    const landing = readClassroomLandingSettings(selectedOfficeClassroom.metadata);
    setClassroomLandingForm({
      description: selectedOfficeClassroom.description ?? '',
      ...landing,
    });
  }, [selectedOfficeClassroom]);

  const studentAcademyById = useMemo(() => {
    const map = new Map<string, TeacherStudioStudentDashboard['academies'][number]>();
    for (const academy of studentDashboard?.academies ?? []) map.set(academy.id, academy);
    return map;
  }, [studentDashboard]);

  const studentMembershipByClassroomId = useMemo(() => {
    const map = new Map<string, TeacherStudioClassroomMembership[]>();
    for (const membership of studentDashboard?.classroom_memberships ?? []) {
      const classroomId = membership.classroom_id;
      const existing = map.get(classroomId) ?? [];
      existing.push(membership);
      map.set(classroomId, existing);
    }
    return map;
  }, [studentDashboard]);

  const studentActiveEntitlements = useMemo(() => {
    const now = Date.now();
    return (studentDashboard?.entitlements ?? []).filter((entitlement) => {
      const status = String(entitlement.status ?? '').toLowerCase();
      if (status !== 'active') return false;
      if (!entitlement.expires_at) return true;
      const expiresAt = Date.parse(entitlement.expires_at);
      return !Number.isFinite(expiresAt) || expiresAt > now;
    });
  }, [studentDashboard]);

  const loadAcademyData = useCallback(async (academy: string, preferredConversationId?: string) => {
    const summaryData = await teacherStudioSummary(academy);
    const access = summaryData.access ?? null;
    const canLoadContacts = hasOfficeRoutePermission(access, officeRouteIntent, 'viewContacts');
    const canLoadClassrooms = hasOfficeRoutePermission(access, officeRouteIntent, 'viewClassrooms');
    const canLoadMessages = hasOfficeRoutePermission(access, officeRouteIntent, 'manageMessages');
    const canLoadAnnouncements = hasOfficeRoutePermission(access, officeRouteIntent, 'manageAnnouncements');
    const canLoadAlerts = hasOfficeRoutePermission(access, officeRouteIntent, 'manageAlerts');
    const canLoadOffers = hasOfficeRoutePermission(access, officeRouteIntent, 'manageOffers');
    const canLoadFinance = hasOfficeRoutePermission(access, officeRouteIntent, 'manageFinance');
    const canLoadEntitlements = canLoadFinance || canLoadOffers;
    const canLoadEducationOS = hasOfficeRoutePermission(access, officeRouteIntent, 'viewEducationOS');

    const [
      contactsData,
      classroomsData,
      classroomMembershipsData,
      conversationsData,
      announcementsData,
      alertsData,
      offersData,
      grantsData,
      paymentsData,
      entitlementsData,
      educationOSData,
    ] = await Promise.all([
      canLoadContacts ? teacherStudioContacts(academy) : Promise.resolve([]),
      canLoadClassrooms ? teacherStudioClassrooms(academy) : Promise.resolve([]),
      canLoadClassrooms ? teacherStudioClassroomMemberships(academy) : Promise.resolve([]),
      canLoadMessages ? teacherStudioConversations(academy) : Promise.resolve([]),
      canLoadAnnouncements ? teacherStudioAnnouncements(academy) : Promise.resolve([]),
      canLoadAlerts ? teacherStudioAlerts(academy) : Promise.resolve([]),
      canLoadOffers ? teacherStudioOffers(academy) : Promise.resolve([]),
      canLoadOffers ? teacherStudioOfferGrants(academy) : Promise.resolve([]),
      canLoadFinance ? teacherStudioPayments(academy) : Promise.resolve([]),
      canLoadEntitlements ? teacherStudioEntitlements(academy) : Promise.resolve([]),
      canLoadEducationOS ? teacherStudioEducationOS(academy).catch((err) => {
        console.warn('Failed to load Academy LMS operations engine', err);
        return null;
      }) : Promise.resolve(null),
    ]);

    setSummary(summaryData);
    if (summaryData.access) {
      setAcademies((previous) =>
        previous.map((item) =>
          item.id === academy ? { ...item, role: summaryData.access?.role ?? item.role, access: summaryData.access } : item,
        ),
      );
    }
    setContacts(contactsData);
    setClassrooms(classroomsData);
    setClassroomMemberships(classroomMembershipsData);
    setConversations(conversationsData);
    setAnnouncements(announcementsData);
    setAlerts(alertsData);
    setOffers(offersData);
    setOfferGrants(grantsData);
    setPayments(paymentsData);
    setEntitlements(entitlementsData);
    setEducationOS(filterEducationOSForOfficeRoute(educationOSData, access, officeRouteIntent));

    setPaymentForm((previous) => ({
      ...previous,
      contact_id: previous.contact_id || contactsData[0]?.id || '',
      offer_id: previous.offer_id || offersData[0]?.id || '',
    }));

    setGrantForm((previous) => ({
      ...previous,
      offer_id: previous.offer_id || offersData[0]?.id || '',
    }));

    setClassroomMembershipForm((previous) => ({
      ...previous,
      classroom_id: previous.classroom_id || classroomsData[0]?.id || '',
      contact_id: previous.contact_id || contactsData[0]?.id || '',
    }));

    setAlertForm((previous) => ({
      ...previous,
      contact_id: previous.contact_id || contactsData[0]?.id || '',
    }));

    setAnnouncementForm((previous) => ({
      ...previous,
      classroom_id: previous.classroom_id || '',
    }));

    const nextConversationId =
      preferredConversationId && conversationsData.some((item) => item.id === preferredConversationId)
        ? preferredConversationId
        : conversationsData[0]?.id || '';

    setSelectedConversationId(nextConversationId);

    if (!nextConversationId) {
      setMessages([]);
      return;
    }

    const messagesData = await teacherStudioConversationMessages(academy, { conversation_id: nextConversationId });
    setMessages(messagesData.messages ?? []);
  }, [officeRouteIntent]);

  const loadStudentData = useCallback(async (): Promise<TeacherStudioStudentDashboard> => {
    const data = await teacherStudioStudentDashboard();
    setStudentDashboard(data);
    return data;
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      setError('');
      setNotice('');
      setState('loading');

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setMe(null);
        setState('unauthenticated');
        return;
      }

      const meResponse = await getMe();
      const memberships = (meResponse.memberships ?? []).filter((membership) => membership.status === 'active');
      const teacherMembershipRows = memberships.filter(isAcademyStaffMembership);
      let academyList: TeacherStudioAcademy[] = [];
      const shouldAttemptTeacherData = !isStudentWorkspaceRoute && !isServiceLanding;
      if (shouldAttemptTeacherData) {
        try {
          academyList = await teacherStudioAcademies();
          academyList = academyList.filter(academyCanEnterOffice);
        } catch (teacherErr) {
          if (teacherMembershipRows.length > 0 || isTeacherWorkspaceRoute || isAcademyDirectory) {
            throw teacherErr;
          }
        }
      }
      const hasTeacherRouteAccess = academyList.length > 0 || teacherMembershipRows.length > 0;
      let cachedStudentData: TeacherStudioStudentDashboard | null = null;
      const loadStudentDataOnce = async (): Promise<TeacherStudioStudentDashboard> => {
        if (cachedStudentData) return cachedStudentData;
        cachedStudentData = await loadStudentData();
        return cachedStudentData;
      };

      const shouldLoadStudentData =
        isStudentWorkspaceRoute ||
        (isSharedAcademyRoute && !isServiceLanding) ||
        !hasTeacherRouteAccess;
      const studentData = shouldLoadStudentData ? await loadStudentDataOnce() : null;
      const hasStudentRouteAccess = hasStudentWorkspaceAccess(studentData);

      if (!hasTeacherRouteAccess && !hasStudentRouteAccess) {
        setMe(meResponse);
        setAcademies([]);
        setStudentDashboard(studentData ?? emptyStudentDashboard());
        setState('error');
        setError('No active academy membership or student contact found for this account.');
        return;
      }

      setMe(meResponse);
      setStudentDashboard(studentData);

      const shouldLoadTeacherData = hasTeacherRouteAccess && !isStudentWorkspaceRoute && !isServiceLanding;
      if (shouldLoadTeacherData) {
        if (academyList.length === 0) academyList = teacherMembershipRows.map(teacherAcademyFromMembership).filter(academyCanEnterOffice);
        const academyIds = new Set(academyList.map((academy) => academy.id));
        const fallbackAcademyId =
          academyList.find((academy) => academy.id === academyId)?.id ??
          academyList[0]?.id ??
          teacherMembershipRows[0]?.tenant_id ??
          '';
        const selectedAcademy =
          (requestedAcademyId && academyIds.has(requestedAcademyId) ? requestedAcademyId : '') || fallbackAcademyId;
        setAcademies(academyList);
        setAcademyId(selectedAcademy);
        if (selectedAcademy) await loadAcademyData(selectedAcademy);
      } else {
        setAcademies([]);
        setAcademyId(requestedAcademyId || studentData?.academies[0]?.id || '');
      }

      setState('ready');
    } catch (err) {
      const message = normalizeError(err);
      if (message === 'Your session expired. Please sign in again.') {
        setMe(null);
        setState('unauthenticated');
        setError('');
        return;
      }
      setState('error');
      setError(message);
    }
  }, [
    academyId,
    isAcademyDirectory,
    isServiceLanding,
    isSharedAcademyRoute,
    isStudentWorkspaceRoute,
    isTeacherWorkspaceRoute,
    loadAcademyData,
    loadStudentData,
    requestedAcademyId,
  ]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const subscription = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setMe(null);
        setState('unauthenticated');
      }
    });
    return () => subscription.data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const normalized = normalizePath(location.pathname);
    if (normalized.startsWith('/office/')) {
      const nextPath = normalized.replace('/office/', '/academy/office/');
      navigate(location.search ? `${nextPath}${location.search}` : nextPath, { replace: true });
      return;
    }
    if (normalized.startsWith('/student/')) {
      const nextPath = normalized.replace('/student/', '/academy/student/');
      navigate(location.search ? `${nextPath}${location.search}` : nextPath, { replace: true });
      return;
    }
    if (normalized === '/office') {
      const nextPath = '/academy/office';
      navigate(location.search ? `${nextPath}${location.search}` : nextPath, { replace: true });
      return;
    }
    if (normalized === '/student' || normalized === '/students') {
      const nextPath = '/academy/student';
      navigate(location.search ? `${nextPath}${location.search}` : nextPath, { replace: true });
      return;
    }
    const teacherLegacyMatch = normalized.match(/^\/academy\/(os|contacts|inbox|announcements|alerts|offers|payments|entitlements)$/);
    if (teacherLegacyMatch) {
      const nextPath = `/academy/office/${teacherLegacyMatch[1]}`;
      navigate(location.search ? `${nextPath}${location.search}` : nextPath, { replace: true });
      return;
    }
    const studentLegacyMatch = normalized.match(/^\/academy\/(messages|access)$/);
    if (studentLegacyMatch) {
      const nextPath = `/academy/student/${studentLegacyMatch[1]}`;
      navigate(location.search ? `${nextPath}${location.search}` : nextPath, { replace: true });
      return;
    }
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    if (state !== 'ready') return;
    const normalized = normalizePath(location.pathname);
    if (
      normalized === '/' ||
      normalized === '/academies' ||
      normalized === '/academy' ||
      normalized === '/academy/classrooms' ||
      !!academyClassroomLandingId
    ) {
      return;
    }
    if (isTeacherWorkspaceRoute || isStudentWorkspaceRoute) return;
    const nextPath = '/academies';
    navigate(location.search ? `${nextPath}${location.search}` : nextPath, { replace: true });
  }, [academyClassroomLandingId, isStudentWorkspaceRoute, isTeacherWorkspaceRoute, location.pathname, location.search, navigate, state]);

  const refresh = useCallback(async () => {
    if (isStudentWorkspaceRoute) {
      setBusy(true);
      setError('');
      try {
        await loadStudentData();
      } catch (err) {
        setError(normalizeError(err));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!isTeacherWorkspaceRoute) {
      setBusy(true);
      try {
        await bootstrap();
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!academyId) {
      await bootstrap();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const academyList = await teacherStudioAcademies();
      setAcademies(academyList);
      await loadAcademyData(academyId, selectedConversationId);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  }, [academyId, bootstrap, isStudentWorkspaceRoute, isTeacherWorkspaceRoute, loadAcademyData, loadStudentData, selectedConversationId]);

  const onSelectAcademy = useCallback(async (nextAcademyId: string) => {
    if (!nextAcademyId || nextAcademyId === academyId) return;
    setBusy(true);
    setError('');
    setNotice('');
    setAcademyId(nextAcademyId);
    try {
      await loadAcademyData(nextAcademyId, selectedConversationId);
      const params = new URLSearchParams(location.search);
      params.set('academy_id', nextAcademyId);
      const query = params.toString();
      navigate(query ? `${location.pathname}?${query}` : location.pathname, { replace: true });
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  }, [academyId, loadAcademyData, location.pathname, location.search, navigate, selectedConversationId]);

  const academyScopedPath = useCallback((path: string, explicitAcademyId?: string): string => {
    const fallbackStudentAcademy = studentDashboard?.academies[0]?.id ?? '';
    const scopedAcademyId = (explicitAcademyId ?? requestedAcademyId ?? academyId ?? fallbackStudentAcademy).trim();
    if (!scopedAcademyId) return path;
    const params = new URLSearchParams();
    params.set('academy_id', scopedAcademyId);
    return `${path}?${params.toString()}`;
  }, [academyId, requestedAcademyId, studentDashboard]);

  const currentOfficePath = useCallback(
    (view: OfficeView = 'academy', itemId?: string): string => academyOfficePath(view, itemId, officeRouteIntent),
    [officeRouteIntent],
  );

  const officeIntentForAcademyId = useCallback((targetAcademyId?: string | null): OfficeRouteIntent => {
    const matchedAcademy = targetAcademyId
      ? teacherDirectoryAcademies.find((academy) => academy.id === targetAcademyId)
      : selectedOfficeAcademy;
    const access = matchedAcademy?.access ?? (matchedAcademy ? buildFallbackAccess(matchedAcademy.role) : selectedAcademyAccess);
    return officeIntentForAccess(access);
  }, [selectedAcademyAccess, selectedOfficeAcademy, teacherDirectoryAcademies]);

  const academyOfficePathForAcademy = useCallback(
    (view: OfficeView = 'academy', itemId?: string, targetAcademyId?: string | null): string =>
      academyOfficePath(view, itemId, officeIntentForAcademyId(targetAcademyId)),
    [officeIntentForAcademyId],
  );

  const defaultOfficePathForAcademy = useCallback((targetAcademyId?: string | null): string => {
    const matchedAcademy = targetAcademyId
      ? teacherDirectoryAcademies.find((academy) => academy.id === targetAcademyId)
      : selectedOfficeAcademy;
    const access = matchedAcademy?.access ?? (matchedAcademy ? buildFallbackAccess(matchedAcademy.role) : selectedAcademyAccess);
    const intent = officeIntentForAccess(access);
    const views = officeViewsForIntent(access, intent);
    return academyOfficePath(defaultOfficeViewForIntent(views, intent), undefined, intent);
  }, [selectedAcademyAccess, selectedOfficeAcademy, teacherDirectoryAcademies]);

  useEffect(() => {
    if (state !== 'ready' || !isTeacherWorkspaceRoute || officeRouteIntent !== 'office' || !selectedAcademyAccess) return;
    const canonicalIntent = officeIntentForAccess(selectedAcademyAccess);
    if (canonicalIntent === 'office') return;
    const canonicalViews = officeViewsForIntent(selectedAcademyAccess, canonicalIntent);
    if (canonicalViews.length === 0) return;

    const requestedView = officeClassroomId ? 'classrooms' : officeView ?? 'academy';
    const targetView = canonicalViews.includes(requestedView)
      ? requestedView
      : defaultOfficeViewForIntent(canonicalViews, canonicalIntent);
    const targetItemId = targetView === 'classrooms' && requestedView === 'classrooms'
      ? officeClassroomId ?? undefined
      : undefined;

    navigate(
      academyScopedPath(academyOfficePath(targetView, targetItemId, canonicalIntent), academyId || undefined),
      { replace: true },
    );
  }, [
    academyId,
    academyScopedPath,
    isTeacherWorkspaceRoute,
    navigate,
    officeClassroomId,
    officeRouteIntent,
    officeView,
    selectedAcademyAccess,
    state,
  ]);

  useEffect(() => {
    if (state !== 'ready' || !isTeacherWorkspaceRoute || allowedOfficeViews.length === 0) return;
    const targetView = officeClassroomId ? 'classrooms' : officeView;
    if (officeRouteRoot && routeDefaultOfficeView !== officeView && allowedOfficeViews.includes(routeDefaultOfficeView)) {
      navigate(academyScopedPath(currentOfficePath(routeDefaultOfficeView)), { replace: true });
      return;
    }
    if (!targetView || allowedOfficeViews.includes(targetView)) return;
    const nextPath = currentOfficePath(defaultOfficeView);
    navigate(academyScopedPath(nextPath), { replace: true });
  }, [
    academyScopedPath,
    allowedOfficeViews,
    currentOfficePath,
    defaultOfficeView,
    isTeacherWorkspaceRoute,
    navigate,
    officeClassroomId,
    officeRouteRoot,
    officeView,
    routeDefaultOfficeView,
    state,
  ]);

  const scrollClassroomThreadToBottom = useCallback(() => {
    const node = classroomThreadRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, []);

  const isClassroomThreadNearBottom = useCallback((): boolean => {
    const node = classroomThreadRef.current;
    if (!node) return true;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    return distanceFromBottom <= CLASSROOM_BOTTOM_THRESHOLD_PX;
  }, []);

  const loadClassroomRoom = useCallback(async (academyForRoom: string, classroomForRoom: string) => {
    if (!academyForRoom || !classroomForRoom) {
      setClassroomRoom(null);
      return;
    }
    const room = await teacherStudioClassroomChat(academyForRoom, classroomForRoom);
    setClassroomRoom(room);
    setClassroomLastSyncAt(new Date().toISOString());
    setClassroomSyncError('');
  }, []);

  useEffect(() => {
    if (state !== 'ready' || !academyClassroomLandingId) {
      setClassroomRoom(null);
      setClassroomDiscussionDraft('');
      setClassroomResourceFilter('all');
      setClassroomActiveResourceId('');
      setClassroomCollapsedModules(new Set());
      setClassroomResourceForm(defaultClassroomResourceForm());
      setClassroomRoomBusy(false);
      setClassroomAutoRefreshEnabled(true);
      setClassroomLastSyncAt(null);
      setClassroomSyncError('');
      setClassroomNewMessages(0);
      setClassroomThreadPinned(true);
      classroomMessageSnapshotRef.current = { classroomId: '', latestMessageId: '', count: 0 };
      return;
    }

    const academyForRoom = sharedClassroomAcademyId.trim();
    if (!academyForRoom) {
      setClassroomRoom(null);
      return;
    }

    let cancelled = false;
    setClassroomRoomBusy(true);

    (async () => {
      try {
        const room = await teacherStudioClassroomChat(academyForRoom, academyClassroomLandingId);
        if (cancelled) return;
        setClassroomRoom(room);
        setClassroomLastSyncAt(new Date().toISOString());
        setClassroomSyncError('');
      } catch (err) {
        if (cancelled) return;
        setClassroomRoom(null);
        setError(normalizeError(err));
      } finally {
        if (!cancelled) setClassroomRoomBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [academyClassroomLandingId, sharedClassroomAcademyId, state]);

  useEffect(() => {
    if (!academyClassroomLandingId) return;
    const resources = classroomRoom?.resources ?? [];
    if (resources.length === 0) {
      if (classroomActiveResourceId) setClassroomActiveResourceId('');
      return;
    }
    if (resources.some((resource) => resource.id === classroomActiveResourceId)) return;
    const preferred = resources.find((resource) => resource.kind === 'video') ?? resources[0];
    setClassroomActiveResourceId(preferred.id);
  }, [academyClassroomLandingId, classroomActiveResourceId, classroomRoom?.resources]);

  useEffect(() => {
    const node = classroomThreadRef.current;
    if (!node) return;

    const handleScroll = () => {
      const pinned = isClassroomThreadNearBottom();
      setClassroomThreadPinned(pinned);
      if (pinned) setClassroomNewMessages(0);
    };

    handleScroll();
    node.addEventListener('scroll', handleScroll, { passive: true });
    return () => node.removeEventListener('scroll', handleScroll);
  }, [academyClassroomLandingId, isClassroomThreadNearBottom]);

  useEffect(() => {
    if (!academyClassroomLandingId) return;
    const roomMessages = classroomRoom?.messages ?? [];
    const latestMessageId = roomMessages[roomMessages.length - 1]?.id ?? '';
    const snapshot = classroomMessageSnapshotRef.current;
    const isNewClassroom = snapshot.classroomId !== academyClassroomLandingId;

    if (isNewClassroom) {
      classroomMessageSnapshotRef.current = {
        classroomId: academyClassroomLandingId,
        latestMessageId,
        count: roomMessages.length,
      };
      setClassroomNewMessages(0);
      setClassroomThreadPinned(true);
      requestAnimationFrame(() => scrollClassroomThreadToBottom());
      return;
    }

    if (!snapshot.latestMessageId || !latestMessageId || snapshot.latestMessageId === latestMessageId) {
      classroomMessageSnapshotRef.current = {
        classroomId: academyClassroomLandingId,
        latestMessageId,
        count: roomMessages.length,
      };
      return;
    }

    const delta = Math.max(1, roomMessages.length - snapshot.count);
    if (classroomThreadPinned || isClassroomThreadNearBottom()) {
      setClassroomNewMessages(0);
      requestAnimationFrame(() => scrollClassroomThreadToBottom());
    } else {
      setClassroomNewMessages((previous) => previous + delta);
    }

    classroomMessageSnapshotRef.current = {
      classroomId: academyClassroomLandingId,
      latestMessageId,
      count: roomMessages.length,
    };
  }, [
    academyClassroomLandingId,
    classroomRoom?.messages,
    classroomThreadPinned,
    isClassroomThreadNearBottom,
    scrollClassroomThreadToBottom,
  ]);

  useEffect(() => {
    if (state !== 'ready' || !academyClassroomLandingId || !sharedClassroomAcademyId || !classroomAutoRefreshEnabled) return;
    let cancelled = false;

    const refreshSilently = async () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      if (classroomRoomBusy) return;
      if (classroomRefreshInFlightRef.current) return;
      classroomRefreshInFlightRef.current = true;
      try {
        await loadClassroomRoom(sharedClassroomAcademyId, academyClassroomLandingId);
      } catch (err) {
        if (!cancelled) setClassroomSyncError(normalizeError(err));
      } finally {
        classroomRefreshInFlightRef.current = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void refreshSilently();
    }, CLASSROOM_AUTO_REFRESH_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshSilently();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [
    academyClassroomLandingId,
    classroomAutoRefreshEnabled,
    classroomRoomBusy,
    loadClassroomRoom,
    sharedClassroomAcademyId,
    state,
  ]);

  const refreshClassroomRoom = useCallback(async () => {
    if (!academyClassroomLandingId || !sharedClassroomAcademyId) return;
    setClassroomRoomBusy(true);
    setError('');
    setClassroomSyncError('');
    try {
      await loadClassroomRoom(sharedClassroomAcademyId, academyClassroomLandingId);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setClassroomRoomBusy(false);
    }
  }, [academyClassroomLandingId, loadClassroomRoom, sharedClassroomAcademyId]);

  const sendClassroomDiscussion = useCallback(async () => {
    if (!academyClassroomLandingId || !sharedClassroomAcademyId) return;
    const content = classroomDiscussionDraft.trim();
    if (!content) return;

    setClassroomRoomBusy(true);
    setError('');
    setNotice('');
    setClassroomSyncError('');
    try {
      await teacherStudioSendClassroomChatMessage(sharedClassroomAcademyId, {
        classroom_id: academyClassroomLandingId,
        content,
      });
      setClassroomDiscussionDraft('');
      await loadClassroomRoom(sharedClassroomAcademyId, academyClassroomLandingId);
      setClassroomNewMessages(0);
      setClassroomThreadPinned(true);
      requestAnimationFrame(() => scrollClassroomThreadToBottom());
      setNotice('Message sent to classroom discussion.');
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setClassroomRoomBusy(false);
    }
  }, [
    academyClassroomLandingId,
    classroomDiscussionDraft,
    loadClassroomRoom,
    scrollClassroomThreadToBottom,
    sharedClassroomAcademyId,
  ]);

  const submitClassroomDiscussion = async (event: FormEvent) => {
    event.preventDefault();
    await sendClassroomDiscussion();
  };

  const setClassroomResourceCompletion = async (resourceId: string, completed: boolean) => {
    if (!academyClassroomLandingId || !sharedClassroomAcademyId || !resourceId) return;
    setClassroomRoomBusy(true);
    setError('');
    setNotice('');
    try {
      await teacherStudioSetClassroomResourceProgress(sharedClassroomAcademyId, {
        classroom_id: academyClassroomLandingId,
        resource_id: resourceId,
        completed,
      });
      await loadClassroomRoom(sharedClassroomAcademyId, academyClassroomLandingId);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setClassroomRoomBusy(false);
    }
  };

  const submitClassroomResource = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyClassroomLandingId || !sharedClassroomAcademyId) return;
    const title = classroomResourceForm.title.trim();
    const url = classroomResourceForm.url.trim();
    const week = classroomResourceForm.week.trim();
    const moduleLabel = classroomResourceForm.module.trim();
    const lesson = classroomResourceForm.lesson.trim();
    if (!title || !url) return;

    const metadata: Record<string, string> = {};
    if (week) metadata.week = week;
    if (moduleLabel) metadata.module = moduleLabel;
    if (lesson) metadata.lesson = lesson;

    setClassroomRoomBusy(true);
    setError('');
    setNotice('');
    try {
      await teacherStudioUpsertClassroomResource(sharedClassroomAcademyId, {
        classroom_id: academyClassroomLandingId,
        title,
        type: classroomResourceForm.type,
        url,
        description: classroomResourceForm.description.trim() || undefined,
        sort_order: Number(classroomResourceForm.sort_order || '0'),
        is_published: classroomResourceForm.is_published,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });
      setClassroomResourceForm(defaultClassroomResourceForm());
      await loadClassroomRoom(sharedClassroomAcademyId, academyClassroomLandingId);
      setNotice('Classroom resource saved.');
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setClassroomRoomBusy(false);
    }
  };

  const removeClassroomResource = async (resourceId: string) => {
    if (!academyClassroomLandingId || !sharedClassroomAcademyId || !resourceId) return;
    setClassroomRoomBusy(true);
    setError('');
    setNotice('');
    try {
      await teacherStudioDeleteClassroomResource(sharedClassroomAcademyId, {
        id: resourceId,
        classroom_id: academyClassroomLandingId,
      });
      await loadClassroomRoom(sharedClassroomAcademyId, academyClassroomLandingId);
      setNotice('Classroom resource removed.');
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setClassroomRoomBusy(false);
    }
  };

  useEffect(() => {
    if (state !== 'ready' || isStudentWorkspaceRoute || !hasTeacherAccess) return;
    if (!requestedAcademyId || requestedAcademyId === academyId) return;
    if (!teacherAcademyIds.has(requestedAcademyId)) return;
    if (isTeacherWorkspaceRoute && !officeRouteAcademyIds.has(requestedAcademyId)) return;
    void onSelectAcademy(requestedAcademyId);
  }, [
    academyId,
    hasTeacherAccess,
    isStudentWorkspaceRoute,
    isTeacherWorkspaceRoute,
    officeRouteAcademyIds,
    onSelectAcademy,
    requestedAcademyId,
    state,
    teacherAcademyIds,
  ]);

  useEffect(() => {
    if (state !== 'ready' || !isTeacherWorkspaceRoute || requestedAcademyId) return;
    if (officeRouteAcademies.length === 0 || !academyId || officeRouteAcademyIds.has(academyId)) return;
    void onSelectAcademy(officeRouteAcademies[0].id);
  }, [
    academyId,
    isTeacherWorkspaceRoute,
    officeRouteAcademies,
    officeRouteAcademyIds,
    onSelectAcademy,
    requestedAcademyId,
    state,
  ]);

  const submitAcademy = async (event: FormEvent) => {
    event.preventDefault();
    const name = academyNameDraft.trim();
    if (!name) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const academy = await teacherStudioCreateAcademy({
        name,
        slug: academySlugDraft.trim() || undefined,
      });
      const academyList = await teacherStudioAcademies();
      setAcademies(academyList);
      setAcademyNameDraft('');
      setAcademySlugDraft('');
      setAcademyId(academy.id);
      await loadAcademyData(academy.id);
      navigate(`/academy?academy_id=${encodeURIComponent(academy.id)}`);
      setNotice('Academy created.');
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const submitAcademyLanding = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !requireOfficePermission('manageAcademy', 'Academy landing')) return;

    const fallbackName = selectedOfficeAcademy?.name ?? '';
    const nextName = academyLandingForm.name.trim() || fallbackName;
    if (!nextName) {
      setError('Academy name is required.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const academy = await teacherStudioUpdateAcademyLanding(academyId, {
        name: nextName,
        landing: {
          headline: academyLandingForm.headline.trim(),
          subheadline: academyLandingForm.subheadline.trim(),
          primary_cta_label: academyLandingForm.primary_cta_label.trim(),
          secondary_cta_label: academyLandingForm.secondary_cta_label.trim(),
        },
      });

      setAcademies((previous) => {
        if (previous.some((item) => item.id === academy.id)) {
          return previous.map((item) => (item.id === academy.id ? { ...item, ...academy } : item));
        }
        return [...previous, academy];
      });
      setAcademyLandingForm({
        name: academy.name ?? nextName,
        ...readAcademyLandingSettings(academy.metadata),
      });
      setNotice('Academy landing updated.');
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const submitContact = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !requireOfficePermission('manageContacts', 'Contact management')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await teacherStudioUpsertContact(academyId, {
        first_name: contactForm.first_name.trim(),
        last_name: contactForm.last_name.trim(),
        email: contactForm.email.trim(),
        phone: contactForm.phone.trim() || undefined,
      });
      setContactForm(defaultContactForm());
      await loadAcademyData(academyId, selectedConversationId);
      setNotice('Contact saved.');
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const submitOffer = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !requireOfficePermission('manageOffers', 'Offer management')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await teacherStudioCreateOffer(academyId, {
        name: offerForm.name.trim(),
        type: offerForm.type.trim(),
        price_amount: Number(offerForm.price_amount) || 0,
        currency: offerForm.currency.trim().toUpperCase() || 'UZS',
        duration_days: Number(offerForm.duration_days) > 0 ? Number(offerForm.duration_days) : null,
        description: offerForm.description.trim(),
      });
      setOfferForm(defaultOfferForm());
      await loadAcademyData(academyId, selectedConversationId);
      setNotice('Offer created.');
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const submitClassroom = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !requireOfficePermission('manageClassrooms', 'Classroom management')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await teacherStudioCreateClassroom(academyId, {
        name: classroomForm.name.trim(),
        description: classroomForm.description.trim(),
      });
      setClassroomForm(defaultClassroomForm());
      await loadAcademyData(academyId, selectedConversationId);
      setNotice('Classroom created.');
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const submitClassroomLanding = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !selectedOfficeClassroom || !requireOfficePermission('manageClassrooms', 'Classroom landing')) return;

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const classroom = await teacherStudioUpdateClassroomLanding(academyId, {
        classroom_id: selectedOfficeClassroom.id,
        description: classroomLandingForm.description.trim(),
        landing: {
          headline: classroomLandingForm.headline.trim(),
          subheadline: classroomLandingForm.subheadline.trim(),
          teacher_cta_label: classroomLandingForm.teacher_cta_label.trim(),
          student_cta_label: classroomLandingForm.student_cta_label.trim(),
          card_summary: classroomLandingForm.card_summary.trim(),
        },
      });

      setClassrooms((previous) =>
        previous.map((item) => (item.id === classroom.id ? { ...item, ...classroom } : item)),
      );
      setClassroomLandingForm({
        description: classroom.description ?? '',
        ...readClassroomLandingSettings(classroom.metadata),
      });
      setNotice('Classroom landing updated.');
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const submitClassroomMembership = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !requireOfficePermission('manageRoster', 'Roster management')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await teacherStudioUpsertClassroomMembership(academyId, {
        classroom_id: classroomMembershipForm.classroom_id,
        contact_id: classroomMembershipForm.contact_id,
        role: classroomMembershipForm.role,
      });
      await loadAcademyData(academyId, selectedConversationId);
      setNotice('Classroom membership saved.');
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const removeClassroomMembership = async (membershipId: string) => {
    if (!academyId || !requireOfficePermission('manageRoster', 'Roster management')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await teacherStudioRemoveClassroomMembership(academyId, { id: membershipId });
      await loadAcademyData(academyId, selectedConversationId);
      setNotice('Classroom membership removed.');
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const selectConversation = async (conversationId: string) => {
    setSelectedConversationId(conversationId);
    if (!academyId || !conversationId) {
      setMessages([]);
      return;
    }
    if (!requireOfficePermission('manageMessages', 'Inbox')) return;

    setBusy(true);
    setError('');
    try {
      const data = await teacherStudioConversationMessages(academyId, { conversation_id: conversationId });
      setMessages(data.messages ?? []);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const submitMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !selectedConversationId || !requireOfficePermission('manageMessages', 'Inbox')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await teacherStudioSendMessage(academyId, {
        conversation_id: selectedConversationId,
        content: messageDraft.trim(),
      });
      setMessageDraft('');
      await loadAcademyData(academyId, selectedConversationId);
      setNotice('Message sent.');
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const submitAnnouncement = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !requireOfficePermission('manageAnnouncements', 'Announcements')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await teacherStudioSendAnnouncement(academyId, {
        title: announcementForm.title.trim(),
        content: announcementForm.content.trim(),
        classroom_id: announcementForm.classroom_id.trim() || null,
      });
      setAnnouncementForm((previous) => ({
        ...defaultAnnouncementForm(),
        classroom_id: previous.classroom_id,
      }));
      await loadAcademyData(academyId, selectedConversationId);
      setNotice(`Announcement sent to ${response.recipient_count} contact(s).`);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const submitAlert = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !requireOfficePermission('manageAlerts', 'Alerts')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await teacherStudioCreateAlert(academyId, {
        contact_id: alertForm.contact_id.trim() || null,
        type: alertForm.type.trim(),
        severity: alertForm.severity.trim().toLowerCase(),
        content: alertForm.content.trim(),
      });
      setAlertForm((previous) => ({
        ...previous,
        content: '',
      }));
      await loadAcademyData(academyId, selectedConversationId);
      setNotice('Alert created.');
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const resolveAlert = async (alertId: string) => {
    if (!academyId || !requireOfficePermission('resolveAlerts', 'Alert resolution')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await teacherStudioResolveAlert(academyId, alertId);
      await loadAcademyData(academyId, selectedConversationId);
      setNotice('Alert resolved.');
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const resolveLmsActionItem = async (
    item: TeacherStudioActionItem,
    status: 'resolved' | 'dismissed' | 'snoozed' | 'open' = 'resolved',
  ) => {
    if (!academyId || !requireOfficePermission('resolveActionItems', 'LMS action resolution')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await teacherStudioResolveActionItem(academyId, {
        id: item.id,
        status,
        resolution_note: status === 'resolved' ? 'Resolved from Academy LMS.' : 'Updated from Academy LMS.',
      });
      await loadAcademyData(academyId, selectedConversationId);
      setNotice(status === 'resolved' ? 'LMS action resolved.' : 'LMS action updated.');
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const openLmsActionItem = useCallback((item: TeacherStudioActionItem) => {
    if (item.classroom_id) {
      navigate(academyScopedPath(currentOfficePath('classrooms', item.classroom_id)));
      return;
    }

    if (item.source_type === 'alert') {
      navigate(academyScopedPath(currentOfficePath('alerts')));
      return;
    }

    if (['placement_needed', 'trial_follow_up', 'renewal', 'parent_follow_up'].includes(item.source_type)) {
      navigate(academyScopedPath(currentOfficePath('contacts')));
      return;
    }

    navigate(academyScopedPath(currentOfficePath('os')));
  }, [academyScopedPath, currentOfficePath, navigate]);

  const submitOfferGrant = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !requireOfficePermission('manageOffers', 'Offer grants')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await teacherStudioUpsertOfferGrant(academyId, {
        offer_id: grantForm.offer_id,
        grant_type: grantForm.grant_type.trim(),
        resource_type: grantForm.resource_type.trim() || null,
        resource_id: grantForm.resource_id.trim() || null,
        capability_key: grantForm.capability_key.trim() || null,
        quantity: Number(grantForm.quantity) > 0 ? Number(grantForm.quantity) : null,
        duration_days: Number(grantForm.duration_days) > 0 ? Number(grantForm.duration_days) : null,
      });
      setGrantForm((previous) => ({
        ...defaultGrantForm(),
        offer_id: previous.offer_id,
      }));
      await loadAcademyData(academyId, selectedConversationId);
      setNotice('Offer grant saved.');
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const submitPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !requireOfficePermission('manageFinance', 'Payments')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await teacherStudioCreateClickTuitionPayment(academyId, {
        contact_id: paymentForm.contact_id,
        offer_id: paymentForm.offer_id,
        redirect_url: typeof window !== 'undefined' ? window.location.href : null,
      });
      if (result.payment_url) {
        const popup = window.open(result.payment_url, '_blank', 'noopener,noreferrer');
        if (!popup) window.location.assign(result.payment_url);
      }
      setNotice('Click checkout created.');
      await loadAcademyData(academyId, selectedConversationId);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const markPaid = async (paymentId: string) => {
    if (!academyId || !requireOfficePermission('manageFinance', 'Payments')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await teacherStudioMarkPaymentPaid(academyId, paymentId);
      await loadAcademyData(academyId, selectedConversationId);
      setNotice('Settlement applied and entitlements updated.');
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setState('unauthenticated');
    setMe(null);
    setAcademies([]);
    setStudentDashboard(null);
    setEducationOS(null);
  };

  const selectedViewLabel = isStudentWorkspaceRoute
    ? (studentClassroomId ? 'Classroom' : studentPortalView ? STUDENT_PORTAL_LABELS[studentPortalView] : 'Academy')
    : (officeClassroomId
      ? 'Classroom'
      : officeView
        ? officeLaneViewLabel(officeView, officeRouteIntent, academyHomeLabel, osCenterLabel)
        : 'Academy');
  const teacherShell = officeShellLabel(selectedAcademyAccess, officeRouteIntent);
  const officeCanOpen = (view: OfficeView): boolean => allowedOfficeViews.includes(view);
  const requestedOfficeAcademyDenied = Boolean(
    isTeacherWorkspaceRoute && requestedAcademyId && !officeRouteAcademyIds.has(requestedAcademyId),
  );

  const studentAnnouncements = useMemo(
    () => [...(studentDashboard?.announcements ?? [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [studentDashboard],
  );
  const studentMessages = useMemo(
    () => [...(studentDashboard?.messages ?? [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [studentDashboard],
  );
  const studentAlerts = useMemo(
    () => [...(studentDashboard?.alerts ?? [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [studentDashboard],
  );
  const studentPayments = useMemo(
    () => [...(studentDashboard?.payments ?? [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [studentDashboard],
  );

  if (isServiceLanding) {
    return (
      <>
        <div className="market-page">
          <div className="market-wrap">
            <div className="market-nav">
              <a className="ghost-btn" href={`${platformUrl.replace(/\/$/, '')}/`}>
                Back to platform
              </a>
              {state === 'ready' ? (
                <button className="ghost-btn" type="button" onClick={() => void signOut()}>
                  Sign out
                </button>
              ) : null}
            </div>

            <section className="market-hero">
              <div className="market-copy">
                <div className="market-eyebrow"><Sparkles size={14} /> Schood service</div>
                <h1>Academy</h1>
                <p>
                  A living operating layer for education businesses: public academy pages, classroom hubs,
                  teacher operations, student access, payments, alerts, and messaging in one connected flow.
                </p>
                <div className="market-actions">
                  {state === 'ready' ? (
                    <button className="primary-btn" type="button" onClick={() => navigate('/academies')}>
                      Open academy service
                    </button>
                  ) : null}
                  {state === 'unauthenticated' ? (
                    <a className="primary-btn" href={toAuthUrl()}>
                      Sign in
                    </a>
                  ) : null}
                  {state === 'loading' ? <span className="market-note">Checking your session...</span> : null}
                  {state === 'error' ? (
                    <button className="ghost-btn" type="button" onClick={() => void bootstrap()}>
                      Retry
                    </button>
                  ) : null}
                </div>
                <div className="market-proof-strip" aria-label="Academy service highlights">
                  <span>Public pages</span>
                  <span>Teacher office</span>
                  <span>Student workplace</span>
                </div>
              </div>

              <div className="academy-command-card">
                <div className="academy-command-head">
                  <div>
                    <span className="market-badge">Live command center</span>
                    <h2>Run the academy week from one surface</h2>
                  </div>
                  <span className="pulse-dot" aria-hidden="true" />
                </div>

                <div className="academy-mini-chart" aria-label="Weekly academy activity chart">
                  <span style={{ height: '42%' }} />
                  <span style={{ height: '58%' }} />
                  <span style={{ height: '49%' }} />
                  <span style={{ height: '76%' }} />
                  <span style={{ height: '63%' }} />
                  <span style={{ height: '88%' }} />
                  <span style={{ height: '70%' }} />
                </div>

                <div className="academy-command-grid">
                  <article>
                    <UsersRound size={18} />
                    <strong>Contacts</strong>
                    <span>Student records, family contacts, and academy roles.</span>
                  </article>
                  <article>
                    <CreditCard size={18} />
                    <strong>Revenue</strong>
                    <span>Click checkout, offers, grants, and access windows.</span>
                  </article>
                  <article>
                    <MessageSquare size={18} />
                    <strong>Comms</strong>
                    <span>Inbox, announcements, classroom discussion, and alerts.</span>
                  </article>
                  <article>
                    <BookOpenCheck size={18} />
                    <strong>Learning</strong>
                    <span>Classroom landings, resources, progress, and mock links.</span>
                  </article>
                </div>
              </div>
            </section>

            {state === 'error' && error ? <div className="error-banner">{error}</div> : null}

            <section className="market-section-head">
              <span className="market-badge">Structure</span>
              <h2>Four surfaces, one academy identity</h2>
              <p>
                The service is not just a dashboard. It gives every academy a public face, a staff workspace,
                a classroom layer, and a student portal that all understand the same access model.
              </p>
            </section>

            <section className="market-grid academy-surface-grid">
              <article className="market-card surface-card surface-card--lime">
                <div className="surface-icon"><Building2 size={22} /></div>
                <h3>Academy landing</h3>
                <p>Tell the academy story, show the offer, and send families to the right classroom or office entry.</p>
                <div className="surface-meta">Brand narrative · CTAs · directory cards</div>
              </article>
              <article className="market-card surface-card surface-card--sky">
                <div className="surface-icon"><Store size={22} /></div>
                <h3>Staff workspaces</h3>
                <p>Route administrators, center operators, managers, counselors, teachers, and assistants to the tools for their role.</p>
                <div className="surface-meta">Operations · billing · access control</div>
              </article>
              <article className="market-card surface-card surface-card--violet">
                <div className="surface-icon"><BookOpenCheck size={22} /></div>
                <h3>Classroom landing</h3>
                <p>Give each classroom a living home with resources, modules, lessons, progress, and discussion.</p>
                <div className="surface-meta">Syllabus · resources · classroom chat</div>
              </article>
              <article className="market-card surface-card surface-card--coral">
                <div className="surface-icon"><GraduationCap size={22} /></div>
                <h3>Student Workplace</h3>
                <p>Students see their classrooms, announcements, messages, alerts, access grants, and payments in one focused space.</p>
                <div className="surface-meta">Learning view · alerts · access history</div>
              </article>
            </section>

            <section className="academy-rhythm">
              <div className="market-section-head">
                <span className="market-badge">Daily rhythm</span>
                <h2>Built around the real week of an academy</h2>
                <p>
                  The flow follows how teams actually work: attract a student, enroll them, place them in a cohort,
                  keep the family informed, collect payment, and keep access clean.
                </p>
              </div>
              <div className="rhythm-track">
                <article className="market-step">
                <div className="market-step-index">01</div>
                  <h3>Publish the offer</h3>
                  <p>Create a clear academy page and classroom pages that families can understand before they sign in.</p>
                </article>
                <article className="market-step">
                <div className="market-step-index">02</div>
                  <h3>Enroll and place</h3>
                  <p>Add contacts, create cohorts, assign students, and give each learner the right workspace.</p>
                </article>
                <article className="market-step">
                <div className="market-step-index">03</div>
                  <h3>Teach and track</h3>
                  <p>Attach resources, publish assignments, send announcements, and keep classroom discussion visible.</p>
                </article>
                <article className="market-step">
                  <div className="market-step-index">04</div>
                  <h3>Collect and retain</h3>
                  <p>Connect offers to access grants, track payments, resolve alerts, and keep students active.</p>
                </article>
              </div>
            </section>

            <section className="academy-capability-panel">
              <div>
                <span className="market-badge">Substance</span>
                <h2>What the service controls</h2>
                <p>
                  Academy is designed as the operational service behind Schood learning products, not a loose admin page.
                </p>
              </div>
              <div className="capability-list">
                <div><span>01</span> Academy and classroom public presentation</div>
                <div><span>02</span> Contacts, membership roles, cohorts, and classroom access</div>
                <div><span>03</span> Offers, Click payment tracking, grants, and entitlements</div>
                <div><span>04</span> Announcements, direct inbox, alerts, and student feed</div>
                <div><span>05</span> Classroom resources, progress, live refresh, and discussion</div>
              </div>
            </section>

            <section className="academy-final-cta">
              <div>
                <span className="market-badge">Next step</span>
                <h2>Open the role workspace when you need control. Open the classroom when you need focus.</h2>
              </div>
              {state === 'ready' ? (
                <button className="primary-btn" type="button" onClick={() => navigate('/academies')}>
                  Open Academy
                </button>
              ) : (
                <a className="primary-btn" href={toAuthUrl()}>
                  Sign in to Academy
                </a>
              )}
            </section>
          </div>
        </div>
        <UpdatesButton />
      </>
    );
  }

  if (state === 'loading') {
    return (
      <>
        <div className="ts-loading">
          <div className="auth-card">
            <h2>Academy</h2>
            <p>Loading workspace...</p>
          </div>
        </div>
        <UpdatesButton />
      </>
    );
  }

  if (state === 'unauthenticated') {
    return (
      <>
        <div className="ts-loading">
          <div className="auth-card">
            <h2>Academy</h2>
            <p>Sign in with your platform account to continue.</p>
            <a className="primary-btn" href={toAuthUrl()}>
              Sign in
            </a>
            <a className="ghost-btn" href={`${platformUrl.replace(/\/$/, '')}/`}>
              Back to platform
            </a>
          </div>
        </div>
        <UpdatesButton />
      </>
    );
  }

  if (state === 'error') {
    return (
      <>
        <div className="ts-loading">
          <div className="auth-card">
            <h2>Academy</h2>
            <p>{error || 'Could not load Academy.'}</p>
            <button className="primary-btn" onClick={() => void bootstrap()} type="button">
              Retry
            </button>
            <a className="ghost-btn" href={toAuthUrl()}>
              Sign in again
            </a>
          </div>
        </div>
        <UpdatesButton />
      </>
    );
  }

  if (state === 'ready' && isTeacherWorkspaceRoute && (requestedOfficeAcademyDenied || !hasTeacherAccess || allowedOfficeViews.length === 0)) {
    const fallbackOfficeAcademyId = officeRouteAcademies[0]?.id ?? '';
    return (
      <>
        <div className="ts-loading">
          <div className="auth-card">
            <h2>Role workspace access required</h2>
            <p>
              {requestedOfficeAcademyDenied
                ? 'Your account does not have staff workspace permissions for the requested academy.'
                : officeRouteIntent === 'center'
                ? 'This route is for education-center delegated control. Your account does not have center control for this academy.'
                : officeRouteIntent === 'admin'
                ? 'This route is for academy administrators. Your account does not have administrator controls for this academy.'
                : hasTeacherAccess
                ? 'Your account does not have this role workspace for the selected academy.'
                : 'This route is for academy staff. Your account is linked as a student.'}
            </p>
            {fallbackOfficeAcademyId ? (
              <button
                className="primary-btn"
                type="button"
                onClick={() => navigate(academyScopedPath(currentOfficePath(), fallbackOfficeAcademyId))}
              >
                Open my role workspace
              </button>
            ) : null}
            {hasStudentAccess ? (
              <button className={fallbackOfficeAcademyId ? 'ghost-btn' : 'primary-btn'} type="button" onClick={() => navigate(academyScopedPath('/academy/student'))}>
                Open Student Workplace
              </button>
            ) : null}
            <button className="ghost-btn" type="button" onClick={() => navigate('/academies')}>
              Academy directory
            </button>
          </div>
        </div>
        <UpdatesButton />
      </>
    );
  }

  if (state === 'ready' && isStudentWorkspaceRoute && !hasStudentAccess) {
    return (
      <>
        <div className="ts-loading">
          <div className="auth-card">
            <h2>Student Workplace access required</h2>
            <p>This route is only for linked student contacts. Your account does not have a student profile here.</p>
            {hasTeacherAccess ? (
              <button
                className="primary-btn"
                type="button"
                onClick={() => {
                  const targetAcademyId = selectedOfficeAcademy?.id ?? teacherDirectoryAcademies[0]?.id;
                  navigate(academyScopedPath(defaultOfficePathForAcademy(targetAcademyId), targetAcademyId));
                }}
              >
                Open staff workspace
              </button>
            ) : null}
            <button className="ghost-btn" type="button" onClick={() => navigate('/academies')}>
              Academy directory
            </button>
          </div>
        </div>
        <UpdatesButton />
      </>
    );
  }

  if (state === 'ready' && isAcademyDirectory) {
    const directoryDefaultAcademyId =
      requestedAcademyId || officeRouteAcademies[0]?.id || teacherDirectoryAcademies[0]?.id || studentDirectoryAcademies[0]?.id || '';
    const defaultStaffAcademyId = teacherDirectoryAcademies[0]?.id ?? '';
    const staffWorkspaceLaneDefinitions: Array<{
      intent: OfficeRouteIntent;
      badge: string;
      title: string;
      description: string;
      empty: string;
    }> = [
      {
        intent: 'admin',
        badge: 'Administrator control',
        title: 'Academy Administration',
        description: 'Owner and administrator controls for academy setup, access, finance, offers, and governance.',
        empty: 'No academy administrator role is linked to this account.',
      },
      {
        intent: 'center',
        badge: 'Education center control',
        title: 'Education Center Control',
        description: 'Delegated center operations for academies connected to an education-center tenant.',
        empty: 'No education-center delegated control is linked to this account.',
      },
      {
        intent: 'office',
        badge: 'Operations control',
        title: 'Academy LMS Operations',
        description: 'Manager and counselor controls for classrooms, contacts, announcements, alerts, and reports.',
        empty: 'No academy operations role is linked to this account.',
      },
      {
        intent: 'teacher',
        badge: 'Teacher control',
        title: 'Teacher Workspace',
        description: 'Assigned classroom LMS, student communication, attendance, grading, and learning actions.',
        empty: 'No teacher or assistant workspace is linked to this account.',
      },
    ];
    const staffWorkspaceLanes: Array<(typeof staffWorkspaceLaneDefinitions)[number] & { academies: TeacherStudioAcademy[] }> =
      staffWorkspaceLaneDefinitions.map((lane) => ({
        ...lane,
        academies: teacherDirectoryAcademies.filter((academy) => {
          const access = academy.access ?? buildFallbackAccess(academy.role);
          return officeIntentForAccess(access) === lane.intent && officeIntentCanEnter(access, lane.intent);
        }),
      }));

    return (
      <>
        <div className="market-page">
          <div className="market-wrap">
            <div className="market-nav">
              <button
                className="ghost-btn"
                type="button"
                onClick={() => navigate(academyScopedPath('/academy', directoryDefaultAcademyId))}
              >
                Academy landing
              </button>
              <button className="ghost-btn" type="button" onClick={() => void refresh()} disabled={busy}>
                Refresh
              </button>
              <button className="ghost-btn" type="button" onClick={() => void signOut()}>
                Sign out
              </button>
              <a className="ghost-btn" href={`${platformUrl.replace(/\/$/, '')}/`}>
                Back to platform
              </a>
            </div>

            <section className="market-hero">
              <div className="market-copy">
                <div className="market-eyebrow">Academy directory</div>
                <h1>Choose the right workspace</h1>
                <p>
                  Staff workspaces and Student Workplace are separate entry points. Shared academy pages stay public-facing,
                  while role-specific routes only show the tools that belong to that role.
                </p>
              </div>
              <div className="market-highlight">
                <div className="market-badge">Access summary</div>
                <div className="market-kpis">
                  <article className="market-kpi">
                    <span>Staff workspaces</span>
                    <strong>{teacherDirectoryAcademies.length}</strong>
                  </article>
                  <article className="market-kpi">
                    <span>Student academies</span>
                    <strong>{studentDirectoryAcademies.length}</strong>
                  </article>
                  <article className="market-kpi">
                    <span>Student classrooms</span>
                    <strong>{studentDashboard?.classrooms.length ?? 0}</strong>
                  </article>
                </div>
              </div>
            </section>

            {error ? <div className="error-banner">{error}</div> : null}
            {notice ? <div className="info-banner">{notice}</div> : null}

            <section className="market-grid market-grid--wide">
              <article className="market-card market-card--accent">
                <div className="row between">
                  <h3>Staff workspaces</h3>
                  <span className={hasTeacherAccess ? 'status status--ok' : 'status'}>{hasTeacherAccess ? 'available' : 'locked'}</span>
                </div>
                <p>Role-based staff operations: academy control, LMS, contacts, announcements, alerts, offers, payments, and entitlements.</p>
                {hasTeacherAccess ? (
                  <button
                    className="small-btn"
                    type="button"
                    onClick={() => {
                      navigate(academyScopedPath(defaultOfficePathForAcademy(defaultStaffAcademyId), defaultStaffAcademyId));
                    }}
                  >
                    Open my role workspace
                  </button>
                ) : (
                  <div className="small muted">No active academy staff role was found for this account.</div>
                )}
              </article>

              <article className="market-card">
                <div className="row between">
                  <h3>Student Workplace</h3>
                  <span className={hasStudentAccess ? 'status status--ok' : 'status'}>{hasStudentAccess ? 'available' : 'locked'}</span>
                </div>
                <p>Student-only learning: classrooms, announcements, direct messages, alerts, access grants, and payments.</p>
                {hasStudentAccess ? (
                  <button
                    className="small-btn"
                    type="button"
                    onClick={() => navigate(academyScopedPath('/academy/student', studentDirectoryAcademies[0]?.id))}
                  >
                    Open Student Workplace
                  </button>
                ) : (
                  <div className="small muted">No linked student contact was found for this account.</div>
                )}
              </article>
            </section>

            <section className="market-section-head">
              <span className="market-badge">Staff flow</span>
              <h2>Role-based staff workspaces</h2>
              <p>Each entry opens one role family. Administration, center control, operations, and teacher LMS stay separated.</p>
            </section>

            {staffWorkspaceLanes.map((lane) => (
              <section className="market-grid" key={lane.intent}>
                <article className="market-card market-card--accent">
                  <div className="market-badge">{lane.badge}</div>
                  <h3>{lane.title}</h3>
                  <p>{lane.description}</p>
                  <div className="small muted">{lane.academies.length} linked workspace{lane.academies.length === 1 ? '' : 's'}</div>
                </article>
                {lane.academies.map((academy) => (
                  <article className="market-card" key={`${lane.intent}-${academy.id}`}>
                    <div className="row between">
                      <h3>{academy.name || academy.id}</h3>
                      <span className={statusClass(academy.status)}>{academy.role}</span>
                    </div>
                    <p className="small muted">{academy.slug || academy.id}</p>
                    <div className="market-actions">
                      <button
                        className="small-btn"
                        type="button"
                        onClick={() => navigate(academyScopedPath(defaultOfficePathForAcademy(academy.id), academy.id))}
                      >
                        Open workspace
                      </button>
                      <button
                        className="small-btn"
                        type="button"
                        onClick={() => navigate(`/academy/classrooms?academy_id=${encodeURIComponent(academy.id)}`)}
                      >
                        Classroom landings
                      </button>
                      <button
                        className="small-btn"
                        type="button"
                        onClick={() => navigate(`/academy?academy_id=${encodeURIComponent(academy.id)}`)}
                      >
                        Public landing
                      </button>
                    </div>
                  </article>
                ))}
                {lane.academies.length === 0 ? (
                  <article className="market-card">
                    <h3>No access</h3>
                    <p>{lane.empty}</p>
                  </article>
                ) : null}
              </section>
            ))}

            <section className="market-section-head">
              <span className="market-badge">Platform action</span>
              <h2>Start a separate academy</h2>
              <p>This creates a new academy where your account becomes owner. It does not change your role inside existing academies.</p>
            </section>

            <section className="market-card">
              <h3>Create academy</h3>
              <form className="grid" onSubmit={submitAcademy}>
                <input
                  className="input"
                  placeholder="Academy name"
                  value={academyNameDraft}
                  onChange={(event) => setAcademyNameDraft(event.target.value)}
                  required
                />
                <input
                  className="input"
                  placeholder="Slug (optional)"
                  value={academySlugDraft}
                  onChange={(event) => setAcademySlugDraft(event.target.value)}
                />
                <button className="primary-btn" type="submit" disabled={busy}>
                  Create academy
                </button>
              </form>
            </section>

            <section className="market-section-head">
              <span className="market-badge">Student flow</span>
              <h2>Linked student academies</h2>
              <p>These entries open student learning spaces. Teacher operations never appear inside this route family.</p>
            </section>

            <section className="market-grid">
              {studentDirectoryAcademies.map((academy) => (
                <article className="market-card" key={academy.id}>
                  <div className="row between">
                    <h3>{academy.name}</h3>
                    <span className="status status--ok">student</span>
                  </div>
                  <p className="small muted">{academy.slug || academy.id}</p>
                  <div className="market-actions">
                    <button
                      className="small-btn"
                      type="button"
                      onClick={() => navigate(`/academy/student?academy_id=${encodeURIComponent(academy.id)}`)}
                    >
                      Student Workplace
                    </button>
                    <button
                      className="small-btn"
                      type="button"
                      onClick={() => navigate(`/academy/student/classrooms?academy_id=${encodeURIComponent(academy.id)}`)}
                    >
                      My classrooms
                    </button>
                    <button
                      className="small-btn"
                      type="button"
                      onClick={() => navigate(`/academy?academy_id=${encodeURIComponent(academy.id)}`)}
                    >
                      Public landing
                    </button>
                  </div>
                </article>
              ))}
              {studentDirectoryAcademies.length === 0 ? (
                <article className="market-card">
                  <h3>No Student Workplace access</h3>
                  <p>This account can use staff workspaces only unless it is linked to a student contact.</p>
                </article>
              ) : null}
            </section>
          </div>
        </div>
        <UpdatesButton />
      </>
    );
  }

  if (state === 'ready' && isAcademyLanding) {
    const requestedTeacherAcademy = requestedAcademyId
      ? teacherDirectoryAcademies.find((academy) => academy.id === requestedAcademyId) ?? null
      : null;
    const requestedStudentAcademy = requestedAcademyId
      ? studentDirectoryAcademies.find((academy) => academy.id === requestedAcademyId) ?? null
      : null;
    const fallbackTeacherAcademy =
      teacherDirectoryAcademies.find((academy) => academy.id === academyId) ?? teacherDirectoryAcademies[0] ?? null;
    const fallbackStudentAcademy = studentDirectoryAcademies[0] ?? null;
    const currentAcademy =
      requestedTeacherAcademy ?? requestedStudentAcademy ?? fallbackTeacherAcademy ?? fallbackStudentAcademy ?? null;
    const currentAcademyId = currentAcademy?.id ?? requestedAcademyId ?? academyId ?? '';
    const currentAcademyName = currentAcademy?.name ?? currentAcademyId ?? 'Academy';
    const currentAcademyMetadata = currentAcademy?.metadata;
    const canEnterTeacher = currentAcademyId ? teacherAcademyIds.has(currentAcademyId) : hasTeacherAccess;
    const canEnterStudent = currentAcademyId ? studentAcademyIds.has(currentAcademyId) : hasStudentAccess;
    const academyLandingSettings = readAcademyLandingSettings(currentAcademyMetadata);
    const academyHeroTitle = academyLandingSettings.headline || currentAcademyName || 'Academy';
    const academyHeroSubtitle = academyLandingSettings.subheadline ||
      'Public academy front door with separate entry points for staff workspaces and Student Workplace.';
    const academyPrimaryCtaLabel = academyLandingSettings.primary_cta_label || 'Open classroom landing pages';
    const academySecondaryCtaLabel = academyLandingSettings.secondary_cta_label || 'Enter workspace';
    const currentAcademyClassrooms = Array.from(
      [
        ...classrooms.filter((classroom) => !currentAcademyId || classroom.academy_id === currentAcademyId),
        ...(studentDashboard?.classrooms ?? []).filter((classroom) => !currentAcademyId || classroom.academy_id === currentAcademyId),
      ].reduce((map, classroom) => {
        if (!map.has(classroom.id)) map.set(classroom.id, classroom);
        return map;
      }, new Map<string, TeacherStudioClassroom>()).values(),
    );
    const currentAcademyContacts = Array.from(
      [
        ...contacts.filter((contact) => !currentAcademyId || contact.academy_id === currentAcademyId),
        ...(studentDashboard?.contacts ?? []).filter((contact) => !currentAcademyId || contact.academy_id === currentAcademyId),
      ].reduce((map, contact) => {
        if (!map.has(contact.id)) map.set(contact.id, contact);
        return map;
      }, new Map<string, TeacherStudioContact>()).values(),
    );
    const currentAcademyAnnouncements = Array.from(
      [
        ...announcements.filter((announcement) => !currentAcademyId || announcement.academy_id === currentAcademyId),
        ...(studentDashboard?.announcements ?? []).filter((announcement) => !currentAcademyId || announcement.academy_id === currentAcademyId),
      ].reduce((map, announcement) => {
        if (!map.has(announcement.id)) map.set(announcement.id, announcement);
        return map;
      }, new Map<string, TeacherStudioAnnouncement>()).values(),
    );

    return (
      <>
        <div className="market-page">
          <div className="market-wrap">
            <div className="market-nav">
              <button className="ghost-btn" type="button" onClick={() => navigate('/academies')}>
                Academy directory
              </button>
              <button
                className="ghost-btn"
                type="button"
                onClick={() => navigate(academyScopedPath('/academy/classrooms', currentAcademyId))}
              >
                Classroom landings
              </button>
              <button className="ghost-btn" type="button" onClick={() => void refresh()} disabled={busy}>
                Refresh
              </button>
              <button className="ghost-btn" type="button" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>

            <section className="market-hero">
              <div className="market-copy">
                <div className="market-eyebrow">Academy landing</div>
                <h1>{academyHeroTitle}</h1>
                <p>{academyHeroSubtitle}</p>
                <div className="market-actions">
                  <button
                    className="primary-btn"
                    type="button"
                    onClick={() => navigate(academyScopedPath('/academy/classrooms', currentAcademyId))}
                  >
                    {academyPrimaryCtaLabel}
                  </button>
                  {canEnterTeacher ? (
                    <button
                      className="ghost-btn"
                      type="button"
                      onClick={() => navigate(academyScopedPath(defaultOfficePathForAcademy(currentAcademyId), currentAcademyId))}
                    >
                      {academySecondaryCtaLabel === 'Enter workspace' ? 'Enter staff workspace' : academySecondaryCtaLabel}
                    </button>
                  ) : null}
                  {canEnterStudent ? (
                    <button
                      className="ghost-btn"
                      type="button"
                      onClick={() => navigate(academyScopedPath('/academy/student', currentAcademyId))}
                    >
                      {academySecondaryCtaLabel === 'Enter workspace' ? 'Enter Student Workplace' : academySecondaryCtaLabel}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="market-highlight">
                <div className="market-badge">Current academy</div>
                <div className="market-kpis">
                  <article className="market-kpi">
                    <span>Academy ID</span>
                    <strong>{currentAcademyId || '-'}</strong>
                  </article>
                  <article className="market-kpi">
                    <span>Classrooms</span>
                    <strong>{currentAcademyClassrooms.length}</strong>
                  </article>
                  <article className="market-kpi">
                    <span>Staff workspace</span>
                    <strong>{canEnterTeacher ? 'yes' : 'no'}</strong>
                  </article>
                  <article className="market-kpi">
                    <span>Student Workplace</span>
                    <strong>{canEnterStudent ? 'yes' : 'no'}</strong>
                  </article>
                </div>
              </div>
            </section>

            {error ? <div className="error-banner">{error}</div> : null}
            {notice ? <div className="info-banner">{notice}</div> : null}

            <section className="market-grid">
              {currentAcademyClassrooms.slice(0, 6).map((classroom) => {
                const landing = readClassroomLandingSettings(classroom.metadata);
                const cardSummary = landing.card_summary || classroom.description || 'Classroom landing page ready for teacher and student entry.';
                return (
                  <article className="market-card" key={classroom.id}>
                    <h3>{classroom.name}</h3>
                    <p>{cardSummary}</p>
                    <div className="row between">
                      <span className="small muted">{classroom.member_count} members</span>
                      <button
                        className="small-btn"
                        type="button"
                        onClick={() => navigate(academyScopedPath(`/academy/classrooms/${classroom.id}`, classroom.academy_id))}
                      >
                        Open landing
                      </button>
                    </div>
                  </article>
                );
              })}
              {currentAcademyClassrooms.length === 0 ? (
                <article className="market-card">
                  <h3>No classrooms yet</h3>
                  <p>
                    {canEnterTeacher
                      ? 'Create your first classroom in your staff workspace to publish a classroom landing page.'
                      : 'No student classrooms are linked to this account for this academy yet.'}
                  </p>
                  {canEnterTeacher ? (
                    <button
                      className="small-btn"
                      type="button"
                      onClick={() => navigate(academyScopedPath(academyOfficePathForAcademy('classrooms', undefined, currentAcademyId), currentAcademyId))}
                    >
                      Open classroom workspace
                    </button>
                  ) : null}
                </article>
              ) : null}
            </section>

            <section className="market-grid market-grid--wide">
              <article className="market-card market-card--accent">
                <h3>Staff workspace flow</h3>
                <p>Open the route family that matches your staff role: administrator control, center control, operations, or teacher LMS.</p>
                {canEnterTeacher ? (
                  <button
                    className="small-btn"
                    type="button"
                    onClick={() => navigate(academyScopedPath(defaultOfficePathForAcademy(currentAcademyId), currentAcademyId))}
                  >
                    Open staff workspace
                  </button>
                ) : (
                  <div className="small muted">An academy staff role is required for this academy.</div>
                )}
              </article>
              <article className="market-card">
                <h3>Student Workplace flow</h3>
                <p>Students see their classrooms, messages, alerts, and access status without teacher-only controls.</p>
                {canEnterStudent ? (
                  <button
                    className="small-btn"
                    type="button"
                    onClick={() => navigate(academyScopedPath('/academy/student', currentAcademyId))}
                  >
                    Open Student Workplace
                  </button>
                ) : (
                  <div className="small muted">A linked student contact is required for this academy.</div>
                )}
              </article>
              <article className="market-card">
                <h3>Visible activity</h3>
                <p>{currentAcademyContacts.length} contacts and {currentAcademyAnnouncements.length} announcements are linked to this academy across accessible roles.</p>
                <button
                  className="small-btn"
                  type="button"
                  onClick={() => navigate(academyScopedPath('/academy/classrooms', currentAcademyId))}
                >
                  Review classroom landings
                </button>
              </article>
            </section>
          </div>
        </div>
        <UpdatesButton />
      </>
    );
  }

  if (state === 'ready' && !!academyClassroomLandingId) {
    const activeClassroom = classroomRoom?.classroom ?? sharedClassroomScopeClassroom;
    const roomAcademyId = sharedClassroomAcademyId || activeClassroom?.academy_id || '';
    const canOpenTeacherRoom = roomAcademyId ? teacherAcademyIds.has(roomAcademyId) : hasTeacherAccess;
    const canOpenStudentRoom = roomAcademyId ? studentAcademyIds.has(roomAcademyId) : hasStudentAccess;
    const roomAcademyName =
      (roomAcademyId
        ? (teacherDirectoryAcademies.find((academy) => academy.id === roomAcademyId)?.name ??
            studentDirectoryAcademies.find((academy) => academy.id === roomAcademyId)?.name)
        : null) ?? (roomAcademyId || 'Academy');
    const fallbackRoomMode: WorkspaceMode = canOpenTeacherRoom ? 'teacher' : 'student';
    const roomViewer = classroomRoom?.viewer ?? {
      type: fallbackRoomMode,
      role: fallbackRoomMode === 'teacher' ? 'member' : 'student',
      contact_id: null,
      display_name: fallbackRoomMode === 'teacher' ? 'Teacher' : 'Student',
      can_manage_resources: false,
    };
    const canManageResources = roomViewer.type === 'teacher' && roomViewer.can_manage_resources === true;
    const roomResources = classroomRoom?.resources ?? [];
    const roomMessages = classroomRoom?.messages ?? [];
    const visibleRoomMessages = roomMessages.slice(-120);
    const roomMembers = classroomRoom?.members ?? [];
    const roomAnnouncements = classroomRoom?.announcements ?? [];
    const latestRoomMessageAt = roomMessages.length > 0 ? roomMessages[roomMessages.length - 1].created_at : null;
    const filteredRoomResources = roomResources.filter((resource) =>
      classroomResourceFilter === 'all' ? true : resource.kind === classroomResourceFilter,
    );
    const curriculumLabels = (resource: TeacherStudioClassroomResource): { week: string; module: string; lesson: string } => {
      const metadata = toRecord(resource.metadata);
      const week = toText(metadata.week).trim() || 'General';
      const module = toText(metadata.module).trim() || 'Core';
      const lesson = toText(metadata.lesson).trim() || resource.title;
      return { week, module, lesson };
    };
    const syllabusGroups = (() => {
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      const weekMap = new Map<
        string,
        {
          week: string;
          week_sort: number | null;
          modules: Map<
            string,
            { key: string; module: string; items: Array<{ resource: TeacherStudioClassroomResource; lesson: string }> }
          >;
        }
      >();

      for (const resource of filteredRoomResources) {
        const labels = curriculumLabels(resource);
        const weekKey = labels.week.toLowerCase();
        const moduleKey = labels.module.toLowerCase();
        let weekEntry = weekMap.get(weekKey);
        if (!weekEntry) {
          weekEntry = {
            week: labels.week,
            week_sort: weekSortNumber(labels.week),
            modules: new Map(),
          };
          weekMap.set(weekKey, weekEntry);
        }
        let moduleEntry = weekEntry.modules.get(moduleKey);
        if (!moduleEntry) {
          moduleEntry = { key: `${labels.week}::${labels.module}`, module: labels.module, items: [] };
          weekEntry.modules.set(moduleKey, moduleEntry);
        }
        moduleEntry.items.push({ resource, lesson: labels.lesson });
      }

      return Array.from(weekMap.values())
        .sort((a, b) => {
          const aNum = a.week_sort;
          const bNum = b.week_sort;
          if (aNum !== null && bNum !== null && aNum !== bNum) return aNum - bNum;
          if (aNum !== null && bNum === null) return -1;
          if (aNum === null && bNum !== null) return 1;
          return collator.compare(a.week, b.week);
        })
        .map((weekEntry) => ({
          week: weekEntry.week,
          modules: Array.from(weekEntry.modules.values())
            .sort((a, b) => collator.compare(a.module, b.module))
            .map((moduleEntry) => ({
              key: moduleEntry.key,
              module: moduleEntry.module,
              items: moduleEntry.items,
            })),
        }));
    })();
    const spotlightResource =
      roomResources.find((resource) => resource.id === classroomActiveResourceId) ??
      roomResources.find((resource) => resource.kind === 'video') ??
      roomResources[0] ??
      null;
    const spotlightLabels = spotlightResource ? curriculumLabels(spotlightResource) : null;
    const spotlightEmbedUrl = spotlightResource?.kind === 'video' ? toEmbeddableVideoUrl(spotlightResource.url) : null;
    const recentSpeakerIds = new Set(
      roomMessages
        .filter((message) => {
          const ts = Date.parse(message.created_at);
          if (!Number.isFinite(ts)) return false;
          return Date.now() - ts <= 20 * 60 * 1000;
        })
        .map((message) => message.sender_contact_id)
        .filter((value): value is string => !!value),
    );
    const activeNowCount = recentSpeakerIds.size;
    const roomProgress = classroomRoom?.progress ?? {
      viewer_completed_resource_ids: [],
      resource_completed_counts: {} as Record<string, number>,
      total_members: roomMembers.length,
    };
    const completedByViewer = new Set((roomProgress.viewer_completed_resource_ids ?? []).map((id) => String(id)));
    const resourceCompletedCounts = roomProgress.resource_completed_counts ?? {};
    const completedLessonsCount = roomResources.filter((resource) => completedByViewer.has(resource.id)).length;
    const totalLessonsCount = roomResources.length;
    const progressPercent = totalLessonsCount > 0 ? Math.round((completedLessonsCount / totalLessonsCount) * 100) : 0;
    const toggleModuleCollapsed = (moduleKey: string) => {
      setClassroomCollapsedModules((previous) => {
        const next = new Set(previous);
        if (next.has(moduleKey)) next.delete(moduleKey);
        else next.add(moduleKey);
        return next;
      });
    };
    const kindLabel = (kind: TeacherStudioClassroomResource['kind']): string => {
      return CLASSROOM_RESOURCE_KIND_LABELS[kind] ?? 'Resource';
    };

    return (
      <>
        <div className="market-page">
          <div className="market-wrap">
            <div className="market-nav">
              <button className="ghost-btn" type="button" onClick={() => navigate(academyScopedPath('/academy/classrooms', roomAcademyId))}>
                Classroom directory
              </button>
              <button className="ghost-btn" type="button" onClick={() => navigate(academyScopedPath('/academy', roomAcademyId))}>
                Academy landing
              </button>
              <button className="ghost-btn" type="button" onClick={() => void refreshClassroomRoom()} disabled={classroomRoomBusy}>
                Refresh classroom
              </button>
              <button
                className="ghost-btn"
                type="button"
                onClick={() => setClassroomAutoRefreshEnabled((enabled) => !enabled)}
              >
                Auto refresh: {classroomAutoRefreshEnabled ? 'On' : 'Off'}
              </button>
            </div>

            <section className="market-hero">
              <div className="market-copy">
                <div className="market-eyebrow">Classroom workspace</div>
                <h1>{activeClassroom?.name ?? 'Classroom'}</h1>
                <p>
                  Classroom hub with role-aware controls. Teachers can manage resources, while students get learning,
                  discussion, and progress actions only.
                </p>
                <div className="market-actions">
                  {canOpenTeacherRoom ? (
                    <button
                      className="primary-btn"
                      type="button"
                      onClick={() => navigate(academyScopedPath(academyOfficePathForAcademy('classrooms', undefined, roomAcademyId), roomAcademyId))}
                    >
                      Staff workspace
                    </button>
                  ) : null}
                  {canOpenStudentRoom ? (
                    <button
                      className="ghost-btn"
                      type="button"
                      onClick={() => navigate(academyScopedPath('/academy/student/classrooms', roomAcademyId))}
                    >
                      Student Workplace
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="market-highlight">
                <div className="market-badge">Room status</div>
                <div className="market-kpis">
                  <article className="market-kpi">
                    <span>Academy</span>
                    <strong>{roomAcademyName}</strong>
                  </article>
                  <article className="market-kpi">
                    <span>Viewer</span>
                    <strong>{roomViewer.display_name}</strong>
                  </article>
                  <article className="market-kpi">
                    <span>Role</span>
                    <strong>{roomViewer.role}</strong>
                  </article>
                  <article className="market-kpi">
                    <span>Participants</span>
                    <strong>{roomMembers.length}</strong>
                  </article>
                  <article className="market-kpi">
                    <span>Resources</span>
                    <strong>{roomResources.length}</strong>
                  </article>
                  <article className="market-kpi">
                    <span>Your progress</span>
                    <strong>{completedLessonsCount}/{totalLessonsCount} ({progressPercent}%)</strong>
                  </article>
                </div>
              </div>
            </section>

            <section className="classroom-studio">
              <aside className="classroom-studio-syllabus panel">
                <div className="classroom-studio-hello">Hello, {roomViewer.display_name}</div>
                <h3>Your custom classroom path</h3>
                <p className="muted">
                  Explore resources, follow announcements, and keep discussion in one shared place.
                </p>

                <div className="classroom-chip-row">
                  {CLASSROOM_RESOURCE_FILTERS.map((item) => (
                    <button
                      key={item.kind}
                      className={`classroom-chip ${classroomResourceFilter === item.kind ? 'is-active' : ''}`}
                      type="button"
                      onClick={() => setClassroomResourceFilter(item.kind)}
                    >
                      {item.kind === 'all' ? `${item.label} (${roomResources.length})` : item.label}
                    </button>
                  ))}
                </div>

                <div className="classroom-syllabus-groups">
                  {syllabusGroups.map((weekGroup) => (
                    <section className="classroom-syllabus-group" key={weekGroup.week}>
                      <h4 className="classroom-group-title">{weekGroup.week}</h4>
                      {weekGroup.modules.map((moduleGroup) => (
                        <div className="classroom-syllabus-module" key={moduleGroup.key}>
                          <button
                            className={`classroom-module-toggle ${classroomCollapsedModules.has(moduleGroup.key) ? 'is-collapsed' : ''}`}
                            type="button"
                            onClick={() => toggleModuleCollapsed(moduleGroup.key)}
                          >
                            <span>{moduleGroup.module}</span>
                            <span>{classroomCollapsedModules.has(moduleGroup.key) ? '+' : '-'}</span>
                          </button>
                          {!classroomCollapsedModules.has(moduleGroup.key) ? (
                            <ul className="classroom-syllabus-list">
                              {moduleGroup.items.map(({ resource, lesson }) => {
                                const done = completedByViewer.has(resource.id);
                                const completedCount = Number(resourceCompletedCounts[resource.id] ?? 0);
                                return (
                                  <li key={resource.id}>
                                    <button
                                      className={`classroom-syllabus-item ${spotlightResource?.id === resource.id ? 'is-active' : ''}`}
                                      type="button"
                                      onClick={() => setClassroomActiveResourceId(resource.id)}
                                    >
                                      <div className="row between">
                                        <strong>{lesson}</strong>
                                        <span className="small muted">{kindLabel(resource.kind)}</span>
                                      </div>
                                      <div className="small muted">{resource.title}</div>
                                      <div className="row between">
                                        <span className={`classroom-progress-chip ${done ? 'is-done' : ''}`}>
                                          {done ? 'Done' : 'To do'}
                                        </span>
                                        <span className="small muted">{completedCount}/{roomProgress.total_members || roomMembers.length} complete</span>
                                      </div>
                                      {resource.description ? <div className="small muted">{resource.description}</div> : null}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : null}
                        </div>
                      ))}
                    </section>
                  ))}
                  {filteredRoomResources.length === 0 ? (
                    <div className="small muted">No resources match this filter.</div>
                  ) : null}
                </div>
              </aside>

              <div className="classroom-studio-center">
                <article className="classroom-stage panel">
                  <div className="row between">
                    <div>
                      <h3>{spotlightResource?.title ?? 'Classroom spotlight'}</h3>
                      <div className="small muted">
                        {spotlightLabels
                          ? `${spotlightLabels.week} | ${spotlightLabels.module} | ${spotlightLabels.lesson}`
                          : 'Select a resource'}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      {spotlightResource ? (
                        <a className="small-btn" href={spotlightResource.url} target="_blank" rel="noreferrer">
                          Open source
                        </a>
                      ) : null}
                      {spotlightResource && roomViewer.type === 'student' ? (
                        <button
                          className="small-btn"
                          type="button"
                          onClick={() => void setClassroomResourceCompletion(spotlightResource.id, !completedByViewer.has(spotlightResource.id))}
                          disabled={classroomRoomBusy}
                        >
                          {completedByViewer.has(spotlightResource.id) ? 'Mark not done' : 'Mark done'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="classroom-progress-bar">
                    <div className="classroom-progress-fill" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <div className="small muted">Progress: {completedLessonsCount}/{totalLessonsCount} lessons completed</div>

                  <div className="classroom-stage-media">
                    {spotlightEmbedUrl ? (
                      <iframe
                        className="classroom-stage-embed"
                        src={spotlightEmbedUrl}
                        title={spotlightResource?.title ?? 'Classroom video'}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <div className="classroom-stage-placeholder">
                        <div className="classroom-stage-placeholder-title">
                          {spotlightResource?.title ?? 'Choose a lesson from the left syllabus'}
                        </div>
                        <div className="small muted">
                          {spotlightResource?.description ?? 'Video links auto-embed when possible. Other resources open in a new tab.'}
                        </div>
                      </div>
                    )}
                  </div>
                </article>

                <article className="classroom-discussion panel">
                  <div className="row between">
                    <h3>Course discussion</h3>
                    <span className="small muted">{roomMembers.length} members, {activeNowCount} active now</span>
                  </div>

                  <div className="classroom-discussion-meta">
                    <span className={`classroom-sync-indicator ${classroomAutoRefreshEnabled ? 'is-live' : 'is-off'}`}>
                      {classroomAutoRefreshEnabled ? `Auto-sync on (every ${Math.round(CLASSROOM_AUTO_REFRESH_MS / 1000)}s)` : 'Auto-sync off'}
                    </span>
                    <span className="small muted">
                      Last sync: {classroomLastSyncAt ? formatRelativeTime(classroomLastSyncAt) : 'pending'}
                    </span>
                    {latestRoomMessageAt ? (
                      <span className="small muted" title={formatDate(latestRoomMessageAt)}>
                        Latest message: {formatRelativeTime(latestRoomMessageAt)}
                      </span>
                    ) : null}
                    {classroomSyncError ? <span className="classroom-sync-error">{classroomSyncError}</span> : null}
                  </div>

                  <div className="classroom-discussion-thread" ref={classroomThreadRef}>
                    {visibleRoomMessages.map((message) => {
                      const mine =
                        roomViewer.contact_id &&
                        message.sender_contact_id &&
                        roomViewer.contact_id === message.sender_contact_id;
                      return (
                        <article key={message.id} className={`classroom-discussion-item ${mine ? 'is-mine' : ''}`}>
                          <div className="row between">
                            <strong>{message.sender_label}</strong>
                            <span className="small muted" title={formatDate(message.created_at)}>
                              {formatRelativeTime(message.created_at)}
                            </span>
                          </div>
                          <div className="small muted">{message.sender_role}</div>
                          <div>{message.content}</div>
                        </article>
                      );
                    })}
                    {roomMessages.length === 0 ? <div className="small muted">No discussion yet. Start the first message.</div> : null}
                  </div>

                  {classroomNewMessages > 0 && !classroomThreadPinned ? (
                    <button
                      className="small-btn classroom-jump-btn"
                      type="button"
                      onClick={() => {
                        setClassroomNewMessages(0);
                        setClassroomThreadPinned(true);
                        scrollClassroomThreadToBottom();
                      }}
                    >
                      Jump to latest ({classroomNewMessages} new)
                    </button>
                  ) : null}

                  <form className="classroom-discussion-compose" onSubmit={submitClassroomDiscussion}>
                    <textarea
                      className="input"
                      rows={3}
                      value={classroomDiscussionDraft}
                      onChange={(event) => setClassroomDiscussionDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') return;
                        event.preventDefault();
                        if (classroomRoomBusy || !classroomDiscussionDraft.trim()) return;
                        void sendClassroomDiscussion();
                      }}
                      placeholder="Write your question, insight, or answer..."
                      disabled={classroomRoomBusy}
                    />
                    <div className="small muted classroom-compose-hint">Press Ctrl+Enter to send</div>
                    <button
                      className="primary-btn"
                      type="submit"
                      disabled={classroomRoomBusy || !classroomDiscussionDraft.trim()}
                    >
                      Send
                    </button>
                  </form>
                </article>
              </div>

              <aside className="classroom-studio-side">
                <article className="panel">
                  <h3>Resource rack</h3>
                  <ul className="list">
                    {filteredRoomResources.map((resource) => {
                      const labels = curriculumLabels(resource);
                      const done = completedByViewer.has(resource.id);
                      const completedCount = Number(resourceCompletedCounts[resource.id] ?? 0);
                      return (
                      <li key={resource.id}>
                        <div className="row between">
                          <strong>{resource.title}</strong>
                          <span className="small muted">{kindLabel(resource.kind)}</span>
                        </div>
                        <div className="small muted">{labels.week} | {labels.module} | {labels.lesson}</div>
                        <div className="row between">
                          <span className={`classroom-progress-chip ${done ? 'is-done' : ''}`}>{done ? 'Done' : 'To do'}</span>
                          <span className="small muted">{completedCount}/{roomProgress.total_members || roomMembers.length}</span>
                        </div>
                        <div className="row between">
                          <button
                            className="small-btn"
                            type="button"
                            onClick={() => setClassroomActiveResourceId(resource.id)}
                          >
                            {spotlightResource?.id === resource.id ? 'Watching' : 'View'}
                          </button>
                          <a className="small-btn" href={resource.url} target="_blank" rel="noreferrer">
                            Open
                          </a>
                        </div>
                        {roomViewer.type === 'student' ? (
                          <button
                            className="small-btn"
                            type="button"
                            onClick={() => void setClassroomResourceCompletion(resource.id, !done)}
                            disabled={classroomRoomBusy}
                          >
                            {done ? 'Mark not done' : 'Mark done'}
                          </button>
                        ) : null}
                        {canManageResources ? (
                          <button
                            className="small-btn danger-btn"
                            type="button"
                            onClick={() => void removeClassroomResource(resource.id)}
                            disabled={classroomRoomBusy}
                          >
                            Remove
                          </button>
                        ) : null}
                      </li>
                    )})}
                    {filteredRoomResources.length === 0 ? <li>No resources yet.</li> : null}
                  </ul>
                </article>

                <article className="panel">
                  <h3>Announcements</h3>
                  <ul className="list">
                    {roomAnnouncements.map((announcement) => (
                      <li key={announcement.id}>
                        <div className="row between">
                          <strong>{announcement.title}</strong>
                          <span className="small muted">{formatDate(announcement.created_at)}</span>
                        </div>
                        <div>{announcement.body}</div>
                      </li>
                    ))}
                    {roomAnnouncements.length === 0 ? <li>No announcements.</li> : null}
                  </ul>
                </article>

                <article className="panel">
                  <h3>Participants</h3>
                  <ul className="list">
                    {roomMembers.map((member) => (
                      <li key={member.id}>
                        <div className="row between">
                          <strong>{member.contact?.display_name || member.contact?.email || member.contact_id}</strong>
                          <span className="status">{member.role}</span>
                        </div>
                      </li>
                    ))}
                    {roomMembers.length === 0 ? <li>No participants yet.</li> : null}
                  </ul>
                </article>

                {canManageResources ? (
                  <article className="panel">
                    <h3>Teacher tools: add resource</h3>
                    <form className="chat-compose" onSubmit={submitClassroomResource}>
                      <input
                        className="input"
                        value={classroomResourceForm.title}
                        onChange={(event) => setClassroomResourceForm((prev) => ({ ...prev, title: event.target.value }))}
                        placeholder="Resource title"
                        required
                        disabled={classroomRoomBusy}
                      />
                      <select
                        className="input"
                        value={classroomResourceForm.type}
                        onChange={(event) =>
                          setClassroomResourceForm((prev) => ({
                            ...prev,
                            type: event.target.value as TeacherStudioClassroomResource['kind'],
                          }))
                        }
                        disabled={classroomRoomBusy}
                      >
                        {CLASSROOM_RESOURCE_FILTERS.filter((item) => item.kind !== 'all').map((item) => (
                          <option key={item.kind} value={item.kind}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                      <div className="grid three">
                        <input
                          className="input"
                          value={classroomResourceForm.week}
                          onChange={(event) => setClassroomResourceForm((prev) => ({ ...prev, week: event.target.value }))}
                          placeholder="Week (e.g. Week 1)"
                          disabled={classroomRoomBusy}
                        />
                        <input
                          className="input"
                          value={classroomResourceForm.module}
                          onChange={(event) => setClassroomResourceForm((prev) => ({ ...prev, module: event.target.value }))}
                          placeholder="Module (e.g. Geometry)"
                          disabled={classroomRoomBusy}
                        />
                        <input
                          className="input"
                          value={classroomResourceForm.lesson}
                          onChange={(event) => setClassroomResourceForm((prev) => ({ ...prev, lesson: event.target.value }))}
                          placeholder="Lesson (e.g. Vanishing Points)"
                          disabled={classroomRoomBusy}
                        />
                      </div>
                      <input
                        className="input"
                        value={classroomResourceForm.url}
                        onChange={(event) => setClassroomResourceForm((prev) => ({ ...prev, url: event.target.value }))}
                        placeholder="https://..."
                        required
                        disabled={classroomRoomBusy}
                      />
                      <textarea
                        className="input"
                        value={classroomResourceForm.description}
                        onChange={(event) => setClassroomResourceForm((prev) => ({ ...prev, description: event.target.value }))}
                        placeholder="Description (optional)"
                        disabled={classroomRoomBusy}
                      />
                      <div className="grid two">
                        <input
                          className="input"
                          value={classroomResourceForm.sort_order}
                          onChange={(event) => setClassroomResourceForm((prev) => ({ ...prev, sort_order: event.target.value }))}
                          placeholder="Sort order"
                          type="number"
                          disabled={classroomRoomBusy}
                        />
                        <label className="classroom-publish-toggle">
                          <input
                            type="checkbox"
                            checked={classroomResourceForm.is_published}
                            onChange={(event) =>
                              setClassroomResourceForm((prev) => ({ ...prev, is_published: event.target.checked }))
                            }
                            disabled={classroomRoomBusy}
                          />
                          Published for students
                        </label>
                      </div>
                      <button
                        className="primary-btn"
                        type="submit"
                        disabled={classroomRoomBusy || !classroomResourceForm.title.trim() || !classroomResourceForm.url.trim()}
                      >
                        Add resource
                      </button>
                    </form>
                  </article>
                ) : null}
              </aside>
            </section>
          </div>
        </div>
        <UpdatesButton />
      </>
    );
  }

  if (state === 'ready' && isAcademyClassroomsLanding) {
    const classroomDirectoryAcademyId = requestedAcademyId || academyId || studentDirectoryAcademies[0]?.id || '';
    const teacherClassroomScope = classrooms.filter((classroom) =>
      !classroomDirectoryAcademyId || classroom.academy_id === classroomDirectoryAcademyId
    );
    const studentClassroomScope = (studentDashboard?.classrooms ?? []).filter((classroom) =>
      !classroomDirectoryAcademyId || classroom.academy_id === classroomDirectoryAcademyId
    );
    const classroomScope = Array.from(
      [...teacherClassroomScope, ...studentClassroomScope].reduce((map, classroom) => {
        if (!map.has(classroom.id)) map.set(classroom.id, classroom);
        return map;
      }, new Map<string, TeacherStudioClassroom>()).values(),
    );
    const classroomDirectoryAcademyName =
      (
        teacherDirectoryAcademies.find((academy) => academy.id === classroomDirectoryAcademyId)?.name ??
        studentDirectoryAcademies.find((academy) => academy.id === classroomDirectoryAcademyId)?.name ??
        classroomDirectoryAcademyId
      ) || 'Academy';
    const canManageClassroomDirectory = classroomDirectoryAcademyId
      ? teacherAcademyIds.has(classroomDirectoryAcademyId)
      : hasTeacherAccess;
    const canStudyClassroomDirectory = classroomDirectoryAcademyId
      ? studentAcademyIds.has(classroomDirectoryAcademyId)
      : hasStudentAccess;

    return (
      <>
        <div className="market-page">
          <div className="market-wrap">
            <div className="market-nav">
              <button className="ghost-btn" type="button" onClick={() => navigate(academyScopedPath('/academy'))}>
                Academy landing
              </button>
              <button className="ghost-btn" type="button" onClick={() => navigate('/academies')}>
                Academy directory
              </button>
              <button className="ghost-btn" type="button" onClick={() => void refresh()} disabled={busy}>
                Refresh
              </button>
            </div>

            <section className="market-hero">
              <div className="market-copy">
                <div className="market-eyebrow">Classroom landing</div>
                <h1>Classroom landing pages</h1>
                <p>
                  {classroomDirectoryAcademyName}: choose a classroom, then enter the teacher management view or
                  the student learning view through separate routes.
                </p>
              </div>

              <div className="market-highlight">
                <div className="market-badge">Classroom overview</div>
                <div className="market-kpis">
                  <article className="market-kpi">
                    <span>Available classrooms</span>
                    <strong>{classroomScope.length}</strong>
                  </article>
                  <article className="market-kpi">
                    <span>Staff workspace</span>
                    <strong>{canManageClassroomDirectory ? 'yes' : 'no'}</strong>
                  </article>
                  <article className="market-kpi">
                    <span>Student Workplace</span>
                    <strong>{canStudyClassroomDirectory ? 'yes' : 'no'}</strong>
                  </article>
                </div>
              </div>
            </section>

            <section className="market-grid">
              {classroomScope.map((classroom) => {
                const landing = readClassroomLandingSettings(classroom.metadata);
                const cardSummary = landing.card_summary || classroom.description || 'Classroom landing page with workspace routing for teachers and students.';
                const teacherCanOpen = teacherAcademyIds.has(classroom.academy_id);
                const studentCanOpen = (studentMembershipByClassroomId.get(classroom.id) ?? []).length > 0;
                return (
                  <article className="market-card" key={classroom.id}>
                    <h3>{classroom.name}</h3>
                    <p>{cardSummary}</p>
                    <div className="row between">
                      <span className="small muted">{classroom.member_count} members</span>
                      <button
                        className="small-btn"
                        type="button"
                        onClick={() => navigate(academyScopedPath(`/academy/classrooms/${classroom.id}`, classroom.academy_id))}
                      >
                        Open landing
                      </button>
                    </div>
                    <div className="market-actions">
                      {teacherCanOpen ? (
                        <button
                          className="small-btn"
                          type="button"
                          onClick={() => navigate(academyScopedPath(academyOfficePathForAcademy('classrooms', classroom.id, classroom.academy_id), classroom.academy_id))}
                        >
                          Staff view
                        </button>
                      ) : null}
                      {studentCanOpen ? (
                        <button
                          className="small-btn"
                          type="button"
                          onClick={() => navigate(academyScopedPath(`/academy/student/classrooms/${classroom.id}`, classroom.academy_id))}
                        >
                          Student view
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              {classroomScope.length === 0 ? (
                <article className="market-card">
                  <h3>No classrooms available</h3>
                  <p>
                    {canManageClassroomDirectory
                      ? 'Create a classroom first in your staff workspace, then publish its landing page.'
                      : 'No student classrooms are linked to this account for the selected academy.'}
                  </p>
                  {canManageClassroomDirectory ? (
                    <button
                      className="small-btn"
                      type="button"
                      onClick={() => navigate(academyScopedPath(academyOfficePathForAcademy('classrooms', undefined, classroomDirectoryAcademyId), classroomDirectoryAcademyId))}
                    >
                      Create classroom
                    </button>
                  ) : null}
                </article>
              ) : null}
            </section>

            <section className="market-steps">
              <article className="market-step">
                <div className="market-step-index">A</div>
                <h3>Discover</h3>
                <p>Learners arrive on this classroom landing page and understand format, goals, and expectations.</p>
              </article>
              <article className="market-step">
                <div className="market-step-index">B</div>
                <h3>Choose role</h3>
                <p>Teachers enter operational controls, while students enter the focused study workspace.</p>
              </article>
              <article className="market-step">
                <div className="market-step-index">C</div>
                <h3>Stay aligned</h3>
                <p>Announcements, inbox messages, and alerts keep everyone synchronized across class cycles.</p>
              </article>
            </section>
          </div>
        </div>
        <UpdatesButton />
      </>
    );
  }

  if (studentDashboard && hasStudentAccess && isStudentWorkspaceRoute) {
    const studentAcademyId =
      studentDashboard.academies.some((academy) => academy.id === requestedAcademyId)
        ? requestedAcademyId
        : (studentDashboard.academies[0]?.id ?? '');
    const studentContacts = (studentDashboard.contacts ?? []).filter(
      (contact) => !studentAcademyId || contact.academy_id === studentAcademyId,
    );
    const studentClassrooms = (studentDashboard.classrooms ?? []).filter(
      (classroom) => !studentAcademyId || classroom.academy_id === studentAcademyId,
    );
    const studentOffers = (studentDashboard.offers ?? []).filter(
      (offer) => !studentAcademyId || offer.academy_id === studentAcademyId,
    );
    const studentMessagesFiltered = studentMessages.filter(
      (message) => !studentAcademyId || message.academy_id === studentAcademyId,
    );
    const studentAlertsFiltered = studentAlerts.filter(
      (alert) => !studentAcademyId || alert.academy_id === studentAcademyId,
    );
    const studentAnnouncementsFiltered = studentAnnouncements.filter(
      (announcement) => !studentAcademyId || announcement.academy_id === studentAcademyId,
    );
    const studentPaymentsFiltered = studentPayments.filter(
      (payment) => !studentAcademyId || payment.academy_id === studentAcademyId,
    );
    const offerById = new Map(studentOffers.map((offer) => [offer.id, offer]));
    const openAlertsCount = studentAlertsFiltered.filter((alert) => !alert.resolved).length;
    const selectedStudentClassroom = studentClassroomId
      ? studentClassrooms.find((classroom) => classroom.id === studentClassroomId) ?? null
      : null;
    const selectedStudentMemberships = studentClassroomId
      ? (studentMembershipByClassroomId.get(studentClassroomId) ?? [])
      : [];
    const selectedStudentAcademyName = selectedStudentClassroom
      ? (studentAcademyById.get(selectedStudentClassroom.academy_id)?.name ?? selectedStudentClassroom.academy_id)
      : 'Academy';
    const selectedStudentAnnouncements = selectedStudentClassroom
      ? studentAnnouncementsFiltered.filter((announcement) =>
          announcement.academy_id === selectedStudentClassroom.academy_id &&
          (announcement.classroom_id === selectedStudentClassroom.id || announcement.classroom_id === null)
        )
      : [];
    const selectedStudentMessages = selectedStudentClassroom
      ? studentMessagesFiltered.filter((message) => message.academy_id === selectedStudentClassroom.academy_id)
      : [];

    return (
      <>
        <div className="ts-shell">
          <aside className="ts-sidebar">
            <div className="brand">
              <span className="brand-mark" aria-hidden="true"><GraduationCap size={22} /></span>
              <div>
                <strong>Student Workplace</strong>
                <p>Academy access</p>
              </div>
            </div>

            <button
              className={`nav-btn ${isAcademyDirectory ? 'is-active' : ''}`}
              type="button"
              onClick={() => navigate('/academies')}
            >
              <span className="nav-icon" aria-hidden="true"><Building2 size={17} /></span>
              Academies
            </button>
            <button
              className={`nav-btn ${studentPortalView === 'academy' ? 'is-active' : ''}`}
              type="button"
              onClick={() => navigate(academyScopedPath('/academy/student', studentAcademyId))}
            >
              <span className="nav-icon" aria-hidden="true"><LayoutDashboard size={17} /></span>
              Academy
            </button>
            <button
              className={`nav-btn ${studentPortalView === 'classrooms' || !!studentClassroomId ? 'is-active' : ''}`}
              type="button"
              onClick={() => navigate(academyScopedPath('/academy/student/classrooms', studentAcademyId))}
            >
              <span className="nav-icon" aria-hidden="true"><BookOpenCheck size={17} /></span>
              Classrooms
            </button>
            <button
              className={`nav-btn ${studentPortalView === 'messages' ? 'is-active' : ''}`}
              type="button"
              onClick={() => navigate(academyScopedPath('/academy/student/messages', studentAcademyId))}
            >
              <span className="nav-icon" aria-hidden="true"><MessageSquare size={17} /></span>
              Messages
            </button>
            <button
              className={`nav-btn ${studentPortalView === 'alerts' ? 'is-active' : ''}`}
              type="button"
              onClick={() => navigate(academyScopedPath('/academy/student/alerts', studentAcademyId))}
            >
              <span className="nav-icon" aria-hidden="true"><Bell size={17} /></span>
              Alerts
            </button>
            <button
              className={`nav-btn ${studentPortalView === 'access' ? 'is-active' : ''}`}
              type="button"
              onClick={() => navigate(academyScopedPath('/academy/student/access', studentAcademyId))}
            >
              <span className="nav-icon" aria-hidden="true"><KeyRound size={17} /></span>
              Access
            </button>

            <div className="sidebar-footer">
              <a className="ghost-btn" href={`${platformUrl.replace(/\/$/, '')}/`}>
                Back to platform
              </a>
            </div>
          </aside>

          <main className="ts-main">
            <header className="ts-topbar">
              <div>
                <h1>{selectedViewLabel}</h1>
                <p className="muted">
                  {studentAcademyId
                    ? (studentAcademyById.get(studentAcademyId)?.name ?? studentAcademyId)
                    : 'No linked academy'}
                </p>
              </div>
              <div className="topbar-actions">
                <button className="ghost-btn" type="button" onClick={() => void refresh()} disabled={busy}>
                  <RefreshCw size={16} />
                  Refresh
                </button>
                <button className="ghost-btn" type="button" onClick={() => void signOut()}>
                  <LogOut size={16} />
                  Sign out
                </button>
              </div>
            </header>

            <section className="stats-grid">
              <article className="stat-card">
                <span className="stat-icon" aria-hidden="true"><UsersRound size={18} /></span>
                <span>Linked contacts</span>
                <strong>{studentContacts.length}</strong>
              </article>
              <article className="stat-card">
                <span className="stat-icon" aria-hidden="true"><BookOpenCheck size={18} /></span>
                <span>Classrooms</span>
                <strong>{studentClassrooms.length}</strong>
              </article>
              <article className="stat-card">
                <span className="stat-icon" aria-hidden="true"><KeyRound size={18} /></span>
                <span>Active access</span>
                <strong>{studentActiveEntitlements.length}</strong>
              </article>
              <article className="stat-card">
                <span className="stat-icon" aria-hidden="true"><ShieldAlert size={18} /></span>
                <span>Open alerts</span>
                <strong>{openAlertsCount}</strong>
              </article>
              <article className="stat-card">
                <span className="stat-icon" aria-hidden="true"><MessageSquare size={18} /></span>
                <span>Messages</span>
                <strong>{studentMessagesFiltered.length}</strong>
              </article>
            </section>

            {error ? <div className="error-banner">{error}</div> : null}
            {notice ? <div className="info-banner">{notice}</div> : null}

            {studentPortalView === 'academy' ? (
              <section className="grid two">
                <div className="panel">
                  <h3>Latest announcements</h3>
                  <ul className="list">
                    {studentAnnouncementsFiltered.slice(0, 10).map((announcement) => {
                      const academyName = studentAcademyById.get(announcement.academy_id)?.name ?? announcement.academy_id;
                      return (
                        <li key={announcement.id}>
                          <div className="row between">
                            <strong>{announcement.title}</strong>
                            <span className="small muted">{formatDate(announcement.created_at)}</span>
                          </div>
                          <div className="small muted">{academyName}</div>
                          <div>{announcement.body}</div>
                        </li>
                      );
                    })}
                    {studentAnnouncementsFiltered.length === 0 ? <li>No announcements yet.</li> : null}
                  </ul>
                </div>

                <div className="panel">
                  <h3>Recent messages</h3>
                  <ul className="list">
                    {studentMessagesFiltered.slice(0, 10).map((message) => {
                      const academyName = studentAcademyById.get(message.academy_id)?.name ?? message.academy_id;
                      return (
                        <li key={message.id}>
                          <div className="row between">
                            <strong>{message.message_type}</strong>
                            <span className="small muted">{formatDate(message.created_at)}</span>
                          </div>
                          <div className="small muted">{academyName}</div>
                          <div>{message.content}</div>
                        </li>
                      );
                    })}
                    {studentMessagesFiltered.length === 0 ? <li>No messages yet.</li> : null}
                  </ul>
                </div>
              </section>
            ) : null}

            {studentClassroomId ? (
              <StudentClassroomView
                classroom={selectedStudentClassroom}
                academyName={selectedStudentAcademyName}
                memberships={selectedStudentMemberships}
                announcements={selectedStudentAnnouncements}
                messages={selectedStudentMessages}
                formatDate={formatDate}
                onBack={() => navigate(academyScopedPath('/academy/student/classrooms', studentAcademyId))}
              />
            ) : null}

            {studentPortalView === 'classrooms' ? (
              <section className="panel">
                <h3>Your classrooms</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Academy</th>
                        <th>Role</th>
                        <th>Members</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {studentClassrooms.map((classroom) => {
                        const academyName = studentAcademyById.get(classroom.academy_id)?.name ?? classroom.academy_id;
                        const memberships = studentMembershipByClassroomId.get(classroom.id) ?? [];
                        return (
                          <tr key={classroom.id}>
                            <td>
                              <strong>{classroom.name}</strong>
                              <div className="small muted">{classroom.description || '-'}</div>
                            </td>
                            <td>{academyName}</td>
                            <td>{memberships[0]?.role ?? 'student'}</td>
                            <td>{classroom.member_count ?? memberships.length}</td>
                            <td>
                              <button
                                className="small-btn"
                                type="button"
                                onClick={() => navigate(academyScopedPath(`/academy/student/classrooms/${classroom.id}`, classroom.academy_id))}
                              >
                                Open student view
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {studentClassrooms.length === 0 ? (
                        <tr>
                          <td colSpan={5}>No classroom access yet.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {studentPortalView === 'messages' ? (
              <section className="panel">
                <h3>Message timeline</h3>
                <ul className="list">
                  {studentMessagesFiltered.map((message) => {
                    const academyName = studentAcademyById.get(message.academy_id)?.name ?? message.academy_id;
                    return (
                      <li key={message.id}>
                        <div className="row between">
                          <strong>{message.sender_type} | {message.message_type}</strong>
                          <span className="small muted">{formatDate(message.created_at)}</span>
                        </div>
                        <div className="small muted">{academyName}</div>
                        <div>{message.content}</div>
                      </li>
                    );
                  })}
                  {studentMessagesFiltered.length === 0 ? <li>No messages yet.</li> : null}
                </ul>
              </section>
            ) : null}

            {studentPortalView === 'alerts' ? (
              <section className="panel">
                <h3>Alerts</h3>
                <ul className="list">
                  {studentAlertsFiltered.map((alert) => {
                    const academyName = studentAcademyById.get(alert.academy_id)?.name ?? alert.academy_id;
                    return (
                      <li key={alert.id}>
                        <div className="row between">
                          <strong>{alert.type}</strong>
                          <span className={statusClass(alert.resolved ? 'resolved' : alert.severity)}>
                            {alert.resolved ? 'resolved' : alert.severity}
                          </span>
                        </div>
                        <div className="small muted">{academyName} | {formatDate(alert.created_at)}</div>
                        <div>{alert.message}</div>
                      </li>
                    );
                  })}
                  {studentAlertsFiltered.length === 0 ? <li>No alerts.</li> : null}
                </ul>
              </section>
            ) : null}

            {studentPortalView === 'access' ? (
              <section className="grid two">
                <div className="panel">
                  <h3>Your entitlements</h3>
                  <ul className="list">
                    {studentDashboard.entitlements.map((entitlement) => {
                      const offer = entitlement.offer_id ? offerById.get(entitlement.offer_id) : null;
                      return (
                        <li key={entitlement.id}>
                          <div className="row between">
                            <strong>{offer?.name ?? entitlement.grant_type}</strong>
                            <span className={statusClass(entitlement.status)}>{entitlement.status}</span>
                          </div>
                          <div className="small muted">
                            {entitlement.resource_type ?? 'resource'} | {entitlement.resource_id ?? '-'}
                          </div>
                          <div className="small muted">Active until: {formatDate(entitlement.expires_at)}</div>
                        </li>
                      );
                    })}
                    {studentDashboard.entitlements.length === 0 ? <li>No access grants yet.</li> : null}
                  </ul>
                </div>

                <div className="panel">
                  <h3>Payments</h3>
                  <ul className="list">
                    {studentPaymentsFiltered.map((payment) => {
                      const offer = payment.offer_id ? offerById.get(payment.offer_id) : null;
                      return (
                        <li key={payment.id}>
                          <div className="row between">
                            <strong>{offer?.name ?? 'Offer'}</strong>
                            <span className={statusClass(payment.status)}>{payment.status}</span>
                          </div>
                          <div className="small muted">
                            {payment.amount} {payment.currency} | {formatDate(payment.created_at)}
                          </div>
                        </li>
                      );
                    })}
                    {studentPaymentsFiltered.length === 0 ? <li>No payments found.</li> : null}
                  </ul>
                </div>
              </section>
            ) : null}
          </main>
        </div>
        <UpdatesButton />
      </>
    );
  }

  if (!isTeacherWorkspaceRoute) {
    return (
      <>
        <div className="ts-loading">
          <div className="auth-card">
            <h2>Academy workspace</h2>
            <p>Redirecting to the right role workspace...</p>
          </div>
        </div>
        <UpdatesButton />
      </>
    );
  }

  return (
    <>
      <div className="ts-shell">
        <aside className="ts-sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><Store size={22} /></span>
          <div>
            <strong>{teacherShell.title}</strong>
            <p>{teacherShell.subtitle}</p>
          </div>
        </div>

        <button
          className={`nav-btn ${isAcademyDirectory ? 'is-active' : ''}`}
          type="button"
          onClick={() => navigate('/academies')}
        >
          <span className="nav-icon" aria-hidden="true"><Building2 size={17} /></span>
          Academies
        </button>

        {officeCanOpen('academy') ? (
          <button
            className={`nav-btn ${officeView === 'academy' ? 'is-active' : ''}`}
            type="button"
            onClick={() => navigate(academyScopedPath(currentOfficePath()))}
          >
            <span className="nav-icon" aria-hidden="true"><LayoutDashboard size={17} /></span>
            {academyHomeLabel}
          </button>
        ) : null}
        {officeCanOpen('classrooms') ? (
          <button
            className={`nav-btn ${officeView === 'classrooms' || !!officeClassroomId ? 'is-active' : ''}`}
            type="button"
            onClick={() => navigate(academyScopedPath(currentOfficePath('classrooms')))}
          >
            <span className="nav-icon" aria-hidden="true"><BookOpenCheck size={17} /></span>
            {officeLaneViewLabel('classrooms', officeRouteIntent, academyHomeLabel, osCenterLabel)}
          </button>
        ) : null}
        {officeCanOpen('contacts') ? (
          <button
            className={`nav-btn ${officeView === 'contacts' ? 'is-active' : ''}`}
            type="button"
            onClick={() => navigate(academyScopedPath(currentOfficePath('contacts')))}
          >
            <span className="nav-icon" aria-hidden="true"><UsersRound size={17} /></span>
            {officeLaneViewLabel('contacts', officeRouteIntent, academyHomeLabel, osCenterLabel)}
          </button>
        ) : null}
        {officeCanOpen('inbox') ? (
          <button
            className={`nav-btn ${officeView === 'inbox' ? 'is-active' : ''}`}
            type="button"
            onClick={() => navigate(academyScopedPath(currentOfficePath('inbox')))}
          >
            <span className="nav-icon" aria-hidden="true"><MessageSquare size={17} /></span>
            {officeLaneViewLabel('inbox', officeRouteIntent, academyHomeLabel, osCenterLabel)}
          </button>
        ) : null}
        {officeCanOpen('announcements') ? (
          <button
            className={`nav-btn ${officeView === 'announcements' ? 'is-active' : ''}`}
            type="button"
            onClick={() => navigate(academyScopedPath(currentOfficePath('announcements')))}
          >
            <span className="nav-icon" aria-hidden="true"><Megaphone size={17} /></span>
            {officeLaneViewLabel('announcements', officeRouteIntent, academyHomeLabel, osCenterLabel)}
          </button>
        ) : null}
        {officeCanOpen('alerts') ? (
          <button
            className={`nav-btn ${officeView === 'alerts' ? 'is-active' : ''}`}
            type="button"
            onClick={() => navigate(academyScopedPath(currentOfficePath('alerts')))}
          >
            <span className="nav-icon" aria-hidden="true"><ShieldAlert size={17} /></span>
            {officeLaneViewLabel('alerts', officeRouteIntent, academyHomeLabel, osCenterLabel)}
          </button>
        ) : null}
        {officeCanOpen('offers') ? (
          <button
            className={`nav-btn ${officeView === 'offers' ? 'is-active' : ''}`}
            type="button"
            onClick={() => navigate(academyScopedPath(currentOfficePath('offers')))}
          >
            <span className="nav-icon" aria-hidden="true"><Store size={17} /></span>
            Offers
          </button>
        ) : null}
        {officeCanOpen('payments') ? (
          <button
            className={`nav-btn ${officeView === 'payments' ? 'is-active' : ''}`}
            type="button"
            onClick={() => navigate(academyScopedPath(currentOfficePath('payments')))}
          >
            <span className="nav-icon" aria-hidden="true"><CreditCard size={17} /></span>
            Payments
          </button>
        ) : null}
        {officeCanOpen('entitlements') ? (
          <button
            className={`nav-btn ${officeView === 'entitlements' ? 'is-active' : ''}`}
            type="button"
            onClick={() => navigate(academyScopedPath(currentOfficePath('entitlements')))}
          >
            <span className="nav-icon" aria-hidden="true"><KeyRound size={17} /></span>
            Entitlements
          </button>
        ) : null}
        {officeCanOpen('os') ? (
          <button
            className={`nav-btn ${officeView === 'os' ? 'is-active' : ''}`}
            type="button"
            onClick={() => navigate(academyScopedPath(currentOfficePath('os')))}
          >
            <span className="nav-icon" aria-hidden="true"><Sparkles size={17} /></span>
            {osCenterLabel}
          </button>
        ) : null}

        <div className="sidebar-footer">
          <a className="ghost-btn" href={`${platformUrl.replace(/\/$/, '')}/`}>
            Back to platform
          </a>
        </div>
        </aside>

        <main className="ts-main">
        <header className="ts-topbar">
          <div>
            <h1>{selectedViewLabel}</h1>
            <p className="muted">
              {selectedOfficeAcademy?.name || academyId || '-'} | {accessRoleLabel(selectedAcademyAccess)}
              {selectedAcademyAccess?.scope === 'assigned_classrooms'
                ? ` | ${selectedAcademyAccess.classroom_ids.length} assigned classroom${selectedAcademyAccess.classroom_ids.length === 1 ? '' : 's'}`
                : ' | academy scope'}
            </p>
          </div>
          <div className="topbar-actions">
            <select
              className="input academy-select"
              value={academyId}
              onChange={(event) => {
                void onSelectAcademy(event.target.value);
              }}
              disabled={busy}
            >
              {academyOptions.map((academy) => (
                <option key={academy.id} value={academy.id}>
                  {academy.label}
                </option>
              ))}
            </select>
            <button className="ghost-btn" type="button" onClick={() => void refresh()} disabled={busy}>
              <RefreshCw size={16} />
              Refresh
            </button>
            <button className="ghost-btn" type="button" onClick={() => void signOut()}>
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </header>

        <section className="stats-grid">
          <article className="stat-card">
            <span className="stat-icon" aria-hidden="true"><UsersRound size={18} /></span>
            <span>Contacts</span>
            <strong>{summary?.counts.contacts ?? contacts.length}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-icon" aria-hidden="true"><BookOpenCheck size={18} /></span>
            <span>Classrooms</span>
            <strong>{summary?.counts.classrooms ?? classrooms.length}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-icon" aria-hidden="true"><Sparkles size={18} /></span>
            <span>LMS actions</span>
            <strong>{educationOS?.stats.open_actions ?? educationOS?.action_queue.filter((item) => item.status === 'open').length ?? 0}</strong>
          </article>
          {canManageOffers ? (
            <article className="stat-card">
              <span className="stat-icon" aria-hidden="true"><Store size={18} /></span>
              <span>Offers</span>
              <strong>{summary?.counts.offers ?? offers.length}</strong>
            </article>
          ) : null}
          {canManageFinance || canManageOffers ? (
            <article className="stat-card">
              <span className="stat-icon" aria-hidden="true"><KeyRound size={18} /></span>
              <span>Active entitlements</span>
              <strong>{summary?.counts.active_entitlements ?? entitlements.filter((item) => item.status === 'active').length}</strong>
            </article>
          ) : null}
          <article className="stat-card">
            <span className="stat-icon" aria-hidden="true"><ShieldAlert size={18} /></span>
            <span>Open alerts</span>
            <strong>{summary?.counts.open_alerts ?? 0}</strong>
          </article>
        </section>

        {error ? <div className="error-banner">{error}</div> : null}
        {notice ? <div className="info-banner">{notice}</div> : null}

        {officeView === 'academy' && officeCanOpen('academy') ? (
          <AcademyView
            academyId={academyId}
            role={accessRoleLabel(selectedAcademyAccess)}
            scope={selectedAcademyAccess?.scope ?? 'academy'}
            assignedClassroomsCount={selectedAcademyAccess?.classroom_ids.length ?? 0}
            summary={summary}
            contactsCount={contacts.length}
            classroomsCount={classrooms.length}
            offersCount={offers.length}
            paymentsCount={payments.length}
            openAlertsCount={alerts.filter((alert) => !alert.resolved).length}
            quickTargets={academyQuickTargets}
            landingForm={academyLandingForm}
            onLandingFieldChange={(field, value) =>
              setAcademyLandingForm((previous) => ({
                ...previous,
                [field]: value,
              }))
            }
            onSaveLanding={submitAcademyLanding}
            busy={busy}
            canManageLanding={canManageLanding}
            canViewOffers={officeCanOpen('offers')}
            canViewFinance={officeCanOpen('payments')}
            canViewAlerts={officeCanOpen('alerts')}
            onNavigate={(path) => navigate(academyScopedPath(path))}
          />
        ) : null}

        {officeView === 'os' && officeCanOpen('os') ? (
          <EducationOSView
            academyId={academyId}
            classrooms={classrooms}
            contacts={contacts}
            classroomMemberships={classroomMemberships}
            access={selectedAcademyAccess}
            mode={officeRouteIntent}
            formatDate={formatDate}
            statusClass={statusClass}
          />
        ) : null}

        {officeView === 'contacts' && officeCanOpen('contacts') ? (
          <ContactsView
            busy={busy}
            form={contactForm}
            setForm={setContactForm}
            contacts={contacts}
            onSubmit={submitContact}
            formatDate={formatDate}
            statusClass={statusClass}
            canManageContacts={canManageContacts}
          />
        ) : null}

        {officeView === 'inbox' && officeCanOpen('inbox') ? (
          <InboxView
            busy={busy}
            conversations={conversations}
            selectedConversationId={selectedConversationId}
            messages={messages}
            messageDraft={messageDraft}
            setMessageDraft={setMessageDraft}
            onSelectConversation={selectConversation}
            onSendMessage={submitMessage}
            formatDate={formatDate}
          />
        ) : null}

        {officeView === 'announcements' && officeCanOpen('announcements') ? (
          <AnnouncementsView
            busy={busy}
            classrooms={classrooms}
            form={announcementForm}
            setForm={setAnnouncementForm}
            announcements={announcements}
            onSubmit={submitAnnouncement}
            formatDate={formatDate}
            canSendAnnouncements={canManageAnnouncements}
            canSendGlobalAnnouncements={canSendGlobalAnnouncements}
          />
        ) : null}

        {officeView === 'alerts' && officeCanOpen('alerts') ? (
          <AlertsView
            busy={busy}
            contacts={contacts}
            alerts={alerts}
            form={alertForm}
            setForm={setAlertForm}
            onCreate={submitAlert}
            onResolve={resolveAlert}
            formatDate={formatDate}
            canCreateAlerts={canManageAlerts}
            canCreateGlobalAlerts={canSendGlobalAnnouncements}
            canResolveAlerts={canResolveAlerts}
          />
        ) : null}

        {officeView === 'offers' && officeCanOpen('offers') ? (
          <OffersView
            busy={busy}
            offerForm={offerForm}
            setOfferForm={setOfferForm}
            grantForm={grantForm}
            setGrantForm={setGrantForm}
            offers={offers}
            offerGrants={offerGrants}
            onCreateOffer={submitOffer}
            onAttachGrant={submitOfferGrant}
          />
        ) : null}

        {officeView === 'classrooms' && officeCanOpen('classrooms') ? (
          <ClassroomsView
            busy={busy}
            classroomForm={classroomForm}
            setClassroomForm={setClassroomForm}
            membershipForm={classroomMembershipForm}
            setMembershipForm={setClassroomMembershipForm}
            classrooms={classrooms}
            classroomMemberships={classroomMemberships}
            contacts={contacts}
            onCreateClassroom={submitClassroom}
            onSaveMembership={submitClassroomMembership}
            onRemoveMembership={removeClassroomMembership}
            onOpenClassroom={(classroomId) => navigate(academyScopedPath(currentOfficePath('classrooms', classroomId)))}
            educationOS={educationOS}
            onResolveActionItem={resolveLmsActionItem}
            onOpenActionItem={openLmsActionItem}
            formatDate={formatDate}
            canManageClassrooms={canManageClassrooms}
            canManageRoster={canManageRoster}
            canResolveActionItems={canResolveActionItems}
            canIssueCertificates={canIssueCertificates}
          />
        ) : null}

        {officeClassroomId && officeCanOpen('classrooms') ? (
          <ClassroomDetailView
            classroom={selectedOfficeClassroom}
            memberships={selectedOfficeClassroomMemberships}
            contacts={contacts}
            announcements={announcements}
            alerts={alerts}
            landingForm={classroomLandingForm}
            onLandingFieldChange={(field, value) =>
              setClassroomLandingForm((previous) => ({
                ...previous,
                [field]: value,
              }))
            }
            onSaveLanding={submitClassroomLanding}
            busy={busy}
            canManageLanding={canManageClassrooms}
            educationOS={educationOS}
            onResolveActionItem={resolveLmsActionItem}
            onOpenActionItem={openLmsActionItem}
            canResolveActionItems={canResolveActionItems}
            canIssueCertificates={canIssueCertificates}
            formatDate={formatDate}
            statusClass={statusClass}
            onBack={() => navigate(academyScopedPath(currentOfficePath('classrooms')))}
          />
        ) : null}

        {officeView === 'payments' && officeCanOpen('payments') ? (
          <PaymentsView
            busy={busy}
            paymentForm={paymentForm}
            setPaymentForm={setPaymentForm}
            contacts={contacts}
            offers={offers}
            payments={payments}
            onCreatePayment={submitPayment}
            onMarkPaid={markPaid}
            formatDate={formatDate}
            statusClass={statusClass}
          />
        ) : null}

        {officeView === 'entitlements' && officeCanOpen('entitlements') ? (
          <EntitlementsView
            entitlements={entitlements}
            contacts={contacts}
            statusClass={statusClass}
            formatDate={formatDate}
          />
        ) : null}

        </main>
      </div>
      <UpdatesButton />
    </>
  );
};

export default App;
