import { formatLocaleDateTime, translate } from './i18n';
import { FormEvent, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  Banknote,
  BarChart3,
  BookOpenCheck,
  Building2,
  CalendarDays,
  ChevronDown,
  CreditCard,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageSquare,
  RefreshCw,
  ReceiptText,
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
  teacherStudioSetEnrollmentStatus,
  teacherStudioUpsertClassroomResource,
  teacherStudioUploadClassroomResource,
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
import { UpdatesButton } from './components/UpdatesButton';
import { WorkspaceHomeView } from './components/workspace/WorkspaceHomeView';
import { StudentHomeView } from './components/workspace/StudentHomeView';
import { LazyRouteBoundary } from './components/workspace/LazyRouteBoundary';
import {
  WorkspaceNavigation,
  type WorkspaceNavigationGroup,
  type WorkspaceNavigationItem,
} from './components/workspace/WorkspaceNavigation';
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
  ContactEnrichmentKey,
  ContactEnrichmentState,
  ContactFormState,
  GrantFormState,
  OfferFormState,
  PaymentFormState,
} from './components/office/types';
import { useI18n } from './i18n';

const loadBusinessFoundationView = () => import('./components/office/BusinessFoundationView')
  .then((module) => ({ default: module.BusinessFoundationView }));
const loadCommercialCoreView = () => import('./components/office/CommercialCoreView')
  .then((module) => ({ default: module.CommercialCoreView }));
const loadOperationsFinanceView = () => import('./components/office/OperationsFinanceView')
  .then((module) => ({ default: module.OperationsFinanceView }));
const loadAcademicOperationsView = () => import('./components/office/AcademicOperationsView')
  .then((module) => ({ default: module.AcademicOperationsView }));
const loadGuardianRelationshipsView = () => import('./components/office/GuardianRelationshipsView')
  .then((module) => ({ default: module.GuardianRelationshipsView }));
const loadIntelligenceOperationsView = () => import('./components/office/IntelligenceOperationsView')
  .then((module) => ({ default: module.IntelligenceOperationsView }));
const loadBusinessPlatformView = () => import('./components/office/BusinessPlatformView')
  .then((module) => ({ default: module.BusinessPlatformView }));
const loadGuardianPortalView = () => import('./components/guardians/GuardianPortalView')
  .then((module) => ({ default: module.GuardianPortalView }));
const loadEducationOSView = () => import('./components/office/EducationOSView')
  .then((module) => ({ default: module.EducationOSView }));
const loadClassroomDetailView = () => import('./components/office/ClassroomDetailView')
  .then((module) => ({ default: module.ClassroomDetailView }));
const loadStudentClassroomView = () => import('./components/students/StudentClassroomView')
  .then((module) => ({ default: module.StudentClassroomView }));
const loadAcademyView = () => import('./components/office/AcademyView')
  .then((module) => ({ default: module.AcademyView }));
const loadContactsView = () => import('./components/office/ContactsView')
  .then((module) => ({ default: module.ContactsView }));
const loadInboxView = () => import('./components/office/InboxView')
  .then((module) => ({ default: module.InboxView }));
const loadAnnouncementsView = () => import('./components/office/AnnouncementsView')
  .then((module) => ({ default: module.AnnouncementsView }));
const loadAlertsView = () => import('./components/office/AlertsView')
  .then((module) => ({ default: module.AlertsView }));
const loadOffersView = () => import('./components/office/OffersView')
  .then((module) => ({ default: module.OffersView }));
const loadClassroomsView = () => import('./components/office/ClassroomsView')
  .then((module) => ({ default: module.ClassroomsView }));
const loadPaymentsView = () => import('./components/office/PaymentsView')
  .then((module) => ({ default: module.PaymentsView }));
const loadEntitlementsView = () => import('./components/office/EntitlementsView')
  .then((module) => ({ default: module.EntitlementsView }));

const BusinessFoundationView = lazy(loadBusinessFoundationView);
const CommercialCoreView = lazy(loadCommercialCoreView);
const OperationsFinanceView = lazy(loadOperationsFinanceView);
const AcademicOperationsView = lazy(loadAcademicOperationsView);
const GuardianRelationshipsView = lazy(loadGuardianRelationshipsView);
const IntelligenceOperationsView = lazy(loadIntelligenceOperationsView);
const BusinessPlatformView = lazy(loadBusinessPlatformView);
const GuardianPortalView = lazy(loadGuardianPortalView);
const EducationOSView = lazy(loadEducationOSView);
const ClassroomDetailView = lazy(loadClassroomDetailView);
const StudentClassroomView = lazy(loadStudentClassroomView);
const AcademyView = lazy(loadAcademyView);
const ContactsView = lazy(loadContactsView);
const InboxView = lazy(loadInboxView);
const AnnouncementsView = lazy(loadAnnouncementsView);
const AlertsView = lazy(loadAlertsView);
const OffersView = lazy(loadOffersView);
const ClassroomsView = lazy(loadClassroomsView);
const PaymentsView = lazy(loadPaymentsView);
const EntitlementsView = lazy(loadEntitlementsView);

const WorkspaceSectionSkeleton = () => (
  <section className="workspace-section-skeleton" aria-label={translate("Loading workspace")} aria-busy="true">
    <span />
    <span />
    <span />
  </section>
);

const emptyContactEnrichmentState = (): ContactEnrichmentState => ({
  classrooms: 'idle',
  memberships: 'idle',
  alerts: 'idle',
  payments: 'idle',
  educationOS: 'idle',
});

type LoadState = 'loading' | 'ready' | 'unauthenticated' | 'error';
type WorkspacePreference = { kind: 'staff' | 'student'; academyId: string };
type DirectoryWorkspaceAcademy = {
  id: string;
  name: string;
  slug: string;
  staff: TeacherStudioAcademy | null;
  student: TeacherStudioStudentDashboard['academies'][number] | null;
};
type WorkspaceMode = 'teacher' | 'student';
type OfficeView = 'today' | 'academy' | 'platform' | 'business' | 'commercial' | 'academic' | 'relationships' | 'intelligence' | 'operations' | 'os' | 'contacts' | 'inbox' | 'announcements' | 'alerts' | 'classrooms' | 'offers' | 'payments' | 'entitlements';
type StudentPortalView = 'academy' | 'classrooms' | 'messages' | 'alerts' | 'access';

const OFFICE_VIEW_PRELOADERS: Partial<Record<OfficeView, () => Promise<unknown>>> = {
  academy: loadAcademyView,
  platform: loadBusinessPlatformView,
  business: loadBusinessFoundationView,
  commercial: loadCommercialCoreView,
  academic: loadAcademicOperationsView,
  relationships: loadGuardianRelationshipsView,
  intelligence: loadIntelligenceOperationsView,
  operations: loadOperationsFinanceView,
  os: loadEducationOSView,
  contacts: loadContactsView,
  inbox: loadInboxView,
  announcements: loadAnnouncementsView,
  alerts: loadAlertsView,
  classrooms: loadClassroomsView,
  offers: loadOffersView,
  payments: loadPaymentsView,
  entitlements: loadEntitlementsView,
};

const preloadOfficeView = (view: OfficeView): void => {
  void OFFICE_VIEW_PRELOADERS[view]?.().catch(() => undefined);
};
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
  file: File | null;
  description: string;
  week: string;
  module: string;
  lesson: string;
  sort_order: string;
  is_published: boolean;
};
type AcademyLandingSettings = Omit<AcademyLandingFormState, 'name'>;
type ClassroomLandingSettings = Omit<ClassroomLandingFormState, 'description'>;

const OFFICE_VIEWS: OfficeView[] = ['today', 'academy', 'platform', 'business', 'commercial', 'academic', 'relationships', 'intelligence', 'operations', 'classrooms', 'contacts', 'inbox', 'announcements', 'alerts', 'offers', 'payments', 'entitlements', 'os'];
const ACADEMY_STAFF_ROLES = new Set(['owner', 'admin', 'center_admin', 'branch_manager', 'manager', 'counselor', 'salesperson', 'cashier', 'accountant', 'payroll_officer', 'parent_liaison', 'teacher', 'assistant']);
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
  today: 'Today',
  academy: 'Academy',
  platform: 'Business Platform',
  business: 'Admissions',
  commercial: 'Commercial Core',
  academic: 'Academic Operations',
  relationships: 'Guardians & Parents',
  intelligence: 'Intelligence',
  operations: 'Operations Finance',
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
  today: 'viewEducationOS',
  academy: 'viewAcademy',
  platform: 'viewBusinessIntelligence',
  business: 'viewAdmissions',
  commercial: 'viewFinance',
  academic: 'manageAcademicOperations',
  relationships: 'manageGuardians',
  intelligence: 'viewBusinessIntelligence',
  operations: 'viewEconomics',
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

const academyOfficePath = (view: OfficeView = 'today', itemId?: string, intent: OfficeRouteIntent = 'office'): string => {
  const basePath = officeBasePath(intent);
  const base = view === 'today' ? basePath : `${basePath}/${view}`;
  return itemId ? `${base}/${itemId}` : base;
};

const buildFallbackAccess = (roleRaw: string, source: TeacherStudioAccessProfile['source'] = 'tenant'): TeacherStudioAccessProfile => {
  const role = String(roleRaw || 'member').toLowerCase();
  const ownerAdmin = role === 'owner' || role === 'admin';
  const centerAdmin = role === 'center_admin';
  const branchManager = role === 'branch_manager';
  const manager = role === 'manager' || role === 'counselor';
  const salesperson = role === 'salesperson';
  const cashier = role === 'cashier';
  const accountant = role === 'accountant';
  const payrollOfficer = role === 'payroll_officer';
  const parentLiaison = role === 'parent_liaison';
  const teaching = role === 'teacher' || role === 'assistant';
  const ops = ownerAdmin || centerAdmin || manager || branchManager;
  const staff = ops || teaching || salesperson || cashier || accountant || payrollOfficer || parentLiaison;
  const classroomLms = ownerAdmin || teaching;
  const financeViewer = ownerAdmin || centerAdmin || branchManager || cashier || accountant;
  const reportingViewer = ownerAdmin || centerAdmin || manager || branchManager || accountant;
  return {
    role,
    source,
    scope: branchManager || salesperson || cashier || parentLiaison ? 'assigned_branches' : (ops || accountant || payrollOfficer ? 'academy' : 'assigned_classrooms'),
    classroom_ids: [],
    branch_ids: [],
    center_tenant_id: null,
    permissions: {
      viewAcademy: ops,
      manageAcademy: ownerAdmin || centerAdmin,
      manageStaff: ownerAdmin || centerAdmin,
      manageFinance: ownerAdmin || centerAdmin,
      viewFinance: financeViewer,
      collectFinance: ownerAdmin || centerAdmin || branchManager || cashier || accountant,
      adjustFinance: ownerAdmin || centerAdmin || accountant,
      refundFinance: ownerAdmin || accountant,
      discountFinance: ownerAdmin || centerAdmin,
      reconcileFinance: ownerAdmin || centerAdmin || accountant,
      manageCashier: ownerAdmin || centerAdmin || branchManager || cashier,
      viewEconomics: ownerAdmin || centerAdmin || accountant,
      viewPayroll: ownerAdmin || centerAdmin || payrollOfficer,
      calculatePayroll: ownerAdmin || centerAdmin || payrollOfficer,
      approvePayroll: ownerAdmin,
      payPayroll: ownerAdmin,
      manageOffers: ownerAdmin || centerAdmin,
      manageBranding: ownerAdmin || centerAdmin,
      manageAutomation: ownerAdmin || centerAdmin,
      viewAutomation: ownerAdmin || centerAdmin || manager || branchManager,
      viewBranches: staff,
      manageBranches: ownerAdmin || centerAdmin,
      viewAdmissions: ops || salesperson,
      manageAdmissions: ops || salesperson,
      assignAdmissions: ownerAdmin || centerAdmin || manager || branchManager,
      exportAdmissions: ownerAdmin || centerAdmin || manager,
      manageTrialFeedback: staff,
      viewContacts: staff,
      manageContacts: ops || salesperson || parentLiaison,
      viewClassrooms: staff,
      manageClassrooms: ops,
      manageRoster: ops,
      manageMessages: staff,
      manageAnnouncements: ops || teaching || parentLiaison,
      sendGlobalAnnouncements: ops,
      manageAlerts: staff,
      resolveAlerts: staff,
      viewEducationOS: staff,
      resolveActionItems: staff,
      manageAssignments: classroomLms,
      gradeSubmissions: classroomLms,
      markAttendance: classroomLms,
      manageSchedule: ownerAdmin || centerAdmin || manager || teaching,
      manageAcademicOperations: ops,
      manageGuardians: ops || parentLiaison,
      communicateGuardians: ops || teaching || parentLiaison,
      manageRetention: ops,
      viewBusinessIntelligence: reportingViewer,
      viewAcademicReports: reportingViewer || teaching,
      viewOperationalReports: reportingViewer,
      viewFinancialReports: ownerAdmin || centerAdmin || accountant,
      viewStaffPerformance: ownerAdmin || centerAdmin || manager || branchManager,
      viewRisk: ops || parentLiaison,
      manageImports: ownerAdmin || centerAdmin || manager,
      manageLocalization: ownerAdmin || centerAdmin,
      useAcademyAI: ownerAdmin || centerAdmin || manager || branchManager,
      manageResources: classroomLms,
      viewReports: reportingViewer,
      issueCertificates: ownerAdmin,
      dispatchNotifications: ops || parentLiaison,
      viewNotifications: ops || parentLiaison,
      viewReferrals: ops || salesperson,
      viewAudit: ownerAdmin || centerAdmin || manager || accountant,
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
    return { title: 'Center Admin Workspace', subtitle: 'Academy management and delivery' };
  }
  if (intent === 'admin') {
    return { title: 'Academy Admin', subtitle: 'Settings, finance, and access' };
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
  return { title: 'Academy Operations', subtitle: 'Role-scoped daily operations' };
};

const officeIntentForAccess = (access: TeacherStudioAccessProfile | null | undefined): OfficeRouteIntent => {
  if (isCenterAccess(access)) return 'center';
  if (isAcademyAdminAccess(access) && hasAccessPermission(access, 'manageAcademy')) return 'admin';
  if (isAcademyOperationsAccess(access)) return 'office';
  if (isTeacherWorkspaceAccess(access) && (hasAccessPermission(access, 'viewClassrooms') || hasAccessPermission(access, 'viewEducationOS'))) return 'teacher';
  return 'office';
};

const OFFICE_ROUTE_VIEW_CAPS: Record<OfficeRouteIntent, OfficeView[]> = {
  office: ['today', 'contacts', 'classrooms', 'inbox', 'alerts', 'business', 'academic', 'relationships', 'intelligence', 'os', 'payments', 'announcements', 'platform', 'commercial', 'operations', 'academy'],
  admin: ['today', 'contacts', 'classrooms', 'payments', 'os', 'academy', 'business', 'commercial', 'operations', 'offers', 'entitlements', 'relationships', 'intelligence', 'platform', 'academic', 'announcements', 'alerts', 'inbox'],
  teacher: ['today', 'classrooms', 'os', 'contacts', 'inbox', 'announcements', 'alerts'],
  center: ['today', 'academy', 'contacts', 'classrooms', 'payments', 'os', 'business', 'commercial', 'operations', 'offers', 'entitlements', 'relationships', 'intelligence', 'platform', 'academic', 'inbox', 'alerts', 'announcements'],
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
      !isCenterAccess(access) &&
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
  return caps.filter((view) => view === 'operations'
    ? ['viewEconomics', 'manageCashier', 'viewPayroll'].some((permission) => hasOfficeRoutePermission(access, intent, permission as AccessPermissionKey))
    : hasOfficeRoutePermission(access, intent, OFFICE_VIEW_PERMISSIONS[view]));
};

const defaultOfficeViewForIntent = (
  views: OfficeView[],
  intent: OfficeRouteIntent,
): OfficeView => {
  if (views.includes('today')) return 'today';
  if (intent === 'teacher') {
    if (views.includes('classrooms')) return 'classrooms';
    if (views.includes('os')) return 'os';
    if (views.includes('inbox')) return 'inbox';
  }
  if (intent === 'center') {
    if (views.includes('academy')) return 'academy';
    if (views.includes('classrooms')) return 'classrooms';
    if (views.includes('os')) return 'os';
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
  if (view === 'today') return intent === 'teacher' ? 'Teaching today' : 'Today';
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
  academy: 'Today',
  classrooms: 'My classrooms',
  messages: 'Messages',
  alerts: 'Alerts',
  access: 'Tuition & access',
};

const toAuthUrl = (): string => {
  const returnTo = typeof window !== 'undefined' ? window.location.href : '/';
  const base = `${platformUrl.replace(/\/$/, '')}/auth`;
  const productSlug = String(import.meta.env.VITE_PLATFORM_PRODUCT_SLUG ?? 'academy').trim() || 'academy';
  const qs = new URLSearchParams({ returnTo, product: productSlug });
  return `${base}?${qs.toString()}`;
};

const normalizePath = (pathname: string): string => pathname.replace(/\/+$/, '') || '/';

const workspacePreferenceKey = 'schood.academy.workspace.v1';

const readWorkspacePreference = (): WorkspacePreference | null => {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(workspacePreferenceKey) ?? 'null') as Partial<WorkspacePreference> | null;
    if (!value || (value.kind !== 'staff' && value.kind !== 'student') || typeof value.academyId !== 'string') return null;
    const academyId = value.academyId.trim();
    return academyId ? { kind: value.kind, academyId } : null;
  } catch {
    return null;
  }
};

const writeWorkspacePreference = (preference: WorkspacePreference): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(workspacePreferenceKey, JSON.stringify(preference));
  } catch {
    // Preference persistence must never block workspace navigation.
  }
};

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
    normalized === '/academy/office' ? 'today' : null,
    normalized === '/academy/teacher' ? 'today' : null,
    normalized === '/academy/admin' ? 'today' : null,
    normalized === '/academy/center' ? 'today' : null,
    normalized === '/office' ? 'today' : null,
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
  return formatLocaleDateTime(parsed);
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
  file: null,
  description: '',
  week: '',
  module: '',
  lesson: '',
  sort_order: '0',
  is_published: true,
});

const MarketUtilityNavigation = ({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  return (
    <nav
      className={`market-nav market-nav--collapsible${open ? ' is-open' : ''}`}
      aria-label={translate('Menu')}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        setOpen(false);
        toggleRef.current?.focus();
      }}
    >
      <button
        ref={toggleRef}
        className="market-nav__toggle"
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{translate('Menu')}</span>
        <ChevronDown size={20} aria-hidden="true" />
      </button>
      <div className="market-nav__items" id={id}>
        {children}
      </div>
    </nav>
  );
};

const App = () => {
  useI18n();
  const location = useLocation();
  const navigate = useNavigate();

  const [state, setState] = useState<LoadState>('loading');
  const [busy, setBusy] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [me, setMe] = useState<MeResponse | null>(null);
  const [academyId, setAcademyId] = useState('');
  const [academies, setAcademies] = useState<TeacherStudioAcademy[]>([]);
  const [studentDashboard, setStudentDashboard] = useState<TeacherStudioStudentDashboard | null>(null);
  const [workspacePreference, setWorkspacePreference] = useState<WorkspacePreference | null>(readWorkspacePreference);

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
  const [contactEnrichmentState, setContactEnrichmentState] = useState<ContactEnrichmentState>(emptyContactEnrichmentState);
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
  const academyDataLoadKeyRef = useRef('');
  const summaryCacheRef = useRef(new Map<string, TeacherStudioSummary>());
  const contactsCacheRef = useRef(new Map<string, TeacherStudioContact[]>());
  const bootstrapScopeRef = useRef('');
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
    if (summary?.access) return summary.access;
    return null;
  }, [activeMembership, selectedOfficeAcademy, summary]);
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
  const canIssueCertificates = canUseOfficePermission('issueCertificates');
  const canViewReports = canUseOfficePermission('viewReports');
  const academyHomeLabel = canManageAcademy
    ? (officeRouteIntent === 'center' ? 'Academy management' : 'Academy settings')
    : canManageClassrooms || canManageContacts
      ? 'Academy operations'
      : 'Workspace home';
  const osCenterLabel = canManageFinance
    ? (officeRouteIntent === 'center' ? 'Operations Center' : 'Command Center')
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
      academy: { title: 'Academy settings', caption: 'Identity, branding, and public landing content' },
      classrooms: { title: 'Classroom LMS', caption: 'Gradebook, attendance, student actions, schedule' },
      contacts: { title: 'Contacts', caption: canManageContacts ? 'Manage students and assistants' : 'Student records and lifecycle context' },
      inbox: { title: 'Inbox', caption: 'Message students and families inside the academy scope' },
      announcements: { title: 'Announcements', caption: canSendGlobalAnnouncements ? 'Send academy-wide and classroom updates' : 'Send classroom updates' },
      alerts: { title: 'Alerts', caption: 'Create and resolve student attention signals' },
      offers: { title: 'Offers', caption: 'Define paid plans and packages' },
      entitlements: { title: 'Access grants', caption: 'Review active LMS and classroom access' },
      payments: { title: 'Payments', caption: 'Track Click payments and settlement' },
      commercial: { title: 'Commercial Core', caption: 'Plans, agreements, invoices, allocations, balances, and debt' },
      academic: { title: 'Academic Operations', caption: 'Actual sessions, conflicts, attendance exceptions, capacity, and quality' },
      relationships: { title: 'Guardians & Parents', caption: 'Consent, secure Telegram linking, visibility, messages, and notification delivery' },
      intelligence: { title: 'Retention & Intelligence', caption: 'Risk, interventions, renewals, owner KPIs, unified actions, search, and governed imports' },
      platform: { title: 'Education Business Platform', caption: 'Student lifecycle, branch performance, unit economics, governed automation, and reviewable AI assistance' },
      operations: { title: 'Operations Finance', caption: 'Cashier, expenses, contribution economics, compensation, and payroll' },
      os: { title: osCenterLabel, caption: 'Automations, actions, reports, and learning signals' },
    };
    return allowedOfficeViews
      .filter((view) => view !== 'today')
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
        name: academy.name || academy.id,
        role: accessRoleLabel(academy.access ?? buildFallbackAccess(academy.role)),
      })),
    [officeRouteAcademies, teacherDirectoryAcademies],
  );

  const requestedAcademyId = useMemo(
    () => (new URLSearchParams(location.search).get('academy_id') ?? '').trim(),
    [location.search],
  );
  const isServiceLanding = normalizedPath === '/';
  const isAcademyDirectory = normalizedPath === '/academies';
  const isAcademySetup = normalizedPath === '/academy/setup';
  const isWorkspaceEntry = normalizedPath === '/academy/workspace';
  const isAcademyLanding = normalizedPath === '/academy';
  const isAcademyClassroomsLanding = normalizedPath === '/academy/classrooms';
  const academyClassroomLandingId = useMemo(() => academyClassroomIdFromPath(location.pathname), [location.pathname]);
  const officeView = useMemo(() => officeViewFromPath(location.pathname), [location.pathname]);
  const studentPortalView = useMemo(() => studentPortalViewFromPath(location.pathname), [location.pathname]);
  const officeClassroomId = useMemo(() => officeClassroomIdFromPath(location.pathname), [location.pathname]);
  const studentClassroomId = useMemo(() => studentClassroomIdFromPath(location.pathname), [location.pathname]);
  const isTeacherWorkspaceRoute = !!officeView || !!officeClassroomId;
  const isStudentWorkspaceRoute = !!studentPortalView || !!studentClassroomId;
  const isGuardianWorkspaceRoute = normalizedPath === '/academy/parent' || normalizedPath.startsWith('/academy/parent/');
  const bootstrapScope = isServiceLanding
    ? 'service'
    : isAcademySetup
      ? 'setup'
    : isGuardianWorkspaceRoute
      ? 'guardian'
      : isStudentWorkspaceRoute
        ? 'student'
        : 'academy';
  const hasTeacherAccess = teacherDirectoryAcademies.length > 0;
  const hasOfficeWorkspaceAccess = hasTeacherAccess || Boolean(selectedAcademyAccess);
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
  const directoryWorkspaceAcademies = useMemo<DirectoryWorkspaceAcademy[]>(() => {
    const byAcademy = new Map<string, DirectoryWorkspaceAcademy>();
    for (const academy of teacherDirectoryAcademies) {
      byAcademy.set(academy.id, {
        id: academy.id,
        name: academy.name || academy.id,
        slug: academy.slug || academy.id,
        staff: academy,
        student: null,
      });
    }
    for (const academy of studentDirectoryAcademies) {
      const existing = byAcademy.get(academy.id);
      if (existing) {
        existing.student = academy;
        if (!existing.name) existing.name = academy.name || academy.id;
        if (!existing.slug) existing.slug = academy.slug || academy.id;
      } else {
        byAcademy.set(academy.id, {
          id: academy.id,
          name: academy.name || academy.id,
          slug: academy.slug || academy.id,
          staff: null,
          student: academy,
        });
      }
    }
    return Array.from(byAcademy.values());
  }, [studentDirectoryAcademies, teacherDirectoryAcademies]);

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

  const academyDataLoadKey = useCallback((academy: string): string => (
    [
      academy,
      officeRouteIntent,
      officeClassroomId ? 'classroom-detail' : officeView ?? 'workspace-root',
      officeClassroomId ?? '',
    ].join(':')
  ), [officeClassroomId, officeRouteIntent, officeView]);

  const loadContactEnrichment = useCallback(async (
    academy: string,
    access: TeacherStudioAccessProfile | null,
    loadKey: string,
    key: ContactEnrichmentKey,
  ) => {
    const requiredPermission: Record<ContactEnrichmentKey, AccessPermissionKey> = {
      classrooms: 'viewClassrooms',
      memberships: 'viewClassrooms',
      alerts: 'manageAlerts',
      payments: 'manageFinance',
      educationOS: 'viewEducationOS',
    };
    if (!hasOfficeRoutePermission(access, officeRouteIntent, requiredPermission[key])) {
      setContactEnrichmentState((previous) => ({ ...previous, [key]: 'idle' }));
      return;
    }

    setContactEnrichmentState((previous) => ({ ...previous, [key]: 'loading' }));
    try {
      if (key === 'classrooms') {
        const value = await teacherStudioClassrooms(academy);
        if (academyDataLoadKeyRef.current === loadKey) setClassrooms(value);
      } else if (key === 'memberships') {
        const value = await teacherStudioClassroomMemberships(academy);
        if (academyDataLoadKeyRef.current === loadKey) setClassroomMemberships(value);
      } else if (key === 'alerts') {
        const value = await teacherStudioAlerts(academy);
        if (academyDataLoadKeyRef.current === loadKey) setAlerts(value);
      } else if (key === 'payments') {
        const value = await teacherStudioPayments(academy);
        if (academyDataLoadKeyRef.current === loadKey) setPayments(value);
      } else {
        const value = await teacherStudioEducationOS(academy);
        if (academyDataLoadKeyRef.current === loadKey) {
          setEducationOS(filterEducationOSForOfficeRoute(value, access, officeRouteIntent));
        }
      }
      if (academyDataLoadKeyRef.current === loadKey) {
        setContactEnrichmentState((previous) => ({ ...previous, [key]: 'success' }));
      }
    } catch (err) {
      if (academyDataLoadKeyRef.current === loadKey) {
        console.warn(`Failed to load Contacts ${key} context`, err);
        setContactEnrichmentState((previous) => ({ ...previous, [key]: 'error' }));
      }
    }
  }, [officeRouteIntent]);

  const loadAcademyData = useCallback(async (academy: string, preferredConversationId?: string, reuseSummary = false) => {
    const cachedSummary = reuseSummary ? summaryCacheRef.current.get(academy) : undefined;
    let summaryData = cachedSummary ?? await teacherStudioSummary(academy);
    summaryCacheRef.current.set(academy, summaryData);
    const summaryRefresh = cachedSummary
      ? teacherStudioSummary(academy).catch((err) => {
          console.warn('Failed to refresh Academy access summary', err);
          return cachedSummary;
        })
      : Promise.resolve(summaryData);
    let access = summaryData.access ?? null;
    const allowedViews = officeViewsForIntent(access, officeRouteIntent);
    const loadView = officeClassroomId
      ? 'classrooms'
      : officeView ?? defaultOfficeViewForIntent(allowedViews, officeRouteIntent);
    const needsContacts = ['contacts', 'classrooms', 'alerts', 'payments', 'entitlements', 'os'].includes(loadView);
    const needsClassrooms = ['contacts', 'classrooms', 'announcements', 'os'].includes(loadView);
    const needsMemberships = ['contacts', 'classrooms', 'os'].includes(loadView);
    const needsMessages = loadView === 'inbox';
    const needsAnnouncements = loadView === 'announcements' || Boolean(officeClassroomId);
    const needsAlerts = ['contacts', 'alerts'].includes(loadView) || Boolean(officeClassroomId);
    const needsOffers = loadView === 'offers' || loadView === 'payments';
    const needsFinance = ['contacts', 'payments'].includes(loadView);
    const needsEntitlements = loadView === 'entitlements';
    const needsEducationOS = ['today', 'contacts', 'os'].includes(loadView);
    const canLoadContacts = needsContacts && hasOfficeRoutePermission(access, officeRouteIntent, 'viewContacts');
    const canLoadClassrooms = needsClassrooms && hasOfficeRoutePermission(access, officeRouteIntent, 'viewClassrooms');
    const canLoadMemberships = needsMemberships && hasOfficeRoutePermission(access, officeRouteIntent, 'viewClassrooms');
    const canLoadMessages = needsMessages && hasOfficeRoutePermission(access, officeRouteIntent, 'manageMessages');
    const canLoadAnnouncements = needsAnnouncements && hasOfficeRoutePermission(access, officeRouteIntent, 'manageAnnouncements');
    const canLoadAlerts = needsAlerts && hasOfficeRoutePermission(access, officeRouteIntent, 'manageAlerts');
    const canLoadOffers = needsOffers && hasOfficeRoutePermission(access, officeRouteIntent, 'manageOffers');
    const canLoadFinance = needsFinance && hasOfficeRoutePermission(access, officeRouteIntent, 'manageFinance');
    const canLoadEntitlements = needsEntitlements && (canLoadFinance || hasOfficeRoutePermission(access, officeRouteIntent, 'manageOffers'));
    const canLoadEducationOS = needsEducationOS && hasOfficeRoutePermission(access, officeRouteIntent, 'viewEducationOS');

    if (loadView === 'contacts') {
      const contactsData = canLoadContacts ? await teacherStudioContacts(academy) : [];
      const loadKey = academyDataLoadKey(academy);
      contactsCacheRef.current.set(academy, contactsData);

      setContacts(contactsData);
      setClassrooms([]);
      setClassroomMemberships([]);
      setConversations([]);
      setMessages([]);
      setAnnouncements([]);
      setAlerts([]);
      setOffers([]);
      setOfferGrants([]);
      setPayments([]);
      setEntitlements([]);
      setEducationOS(null);
      setSelectedConversationId('');
      setContactEnrichmentState(emptyContactEnrichmentState());

      setPaymentForm((previous) => ({ ...previous, contact_id: previous.contact_id || contactsData[0]?.id || '' }));
      setClassroomMembershipForm((previous) => ({ ...previous, contact_id: previous.contact_id || contactsData[0]?.id || '' }));
      setAlertForm((previous) => ({ ...previous, contact_id: previous.contact_id || contactsData[0]?.id || '' }));

      summaryData = await summaryRefresh;
      access = summaryData.access ?? null;
      summaryCacheRef.current.set(academy, summaryData);
      setSummary(summaryData);
      if (summaryData.access) {
        setAcademies((previous) =>
          previous.map((item) =>
            item.id === academy ? { ...item, role: summaryData.access?.role ?? item.role, access: summaryData.access } : item,
          ),
        );
      }

      academyDataLoadKeyRef.current = loadKey;
      for (const key of ['classrooms', 'memberships', 'alerts', 'payments', 'educationOS'] as ContactEnrichmentKey[]) {
        void loadContactEnrichment(academy, access, loadKey, key);
      }
      return;
    }

    setContactEnrichmentState(emptyContactEnrichmentState());

    const [
      refreshedSummary,
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
      summaryRefresh,
      canLoadContacts ? teacherStudioContacts(academy) : Promise.resolve([]),
      canLoadClassrooms ? teacherStudioClassrooms(academy) : Promise.resolve([]),
      canLoadMemberships ? teacherStudioClassroomMemberships(academy) : Promise.resolve([]),
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
    summaryData = refreshedSummary;
    access = summaryData.access ?? null;
    summaryCacheRef.current.set(academy, summaryData);

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

    const nextConversationId = canLoadMessages
      ? preferredConversationId && conversationsData.some((item) => item.id === preferredConversationId)
        ? preferredConversationId
        : conversationsData[0]?.id || ''
      : '';

    setSelectedConversationId(nextConversationId);

    if (!nextConversationId) {
      setMessages([]);
      academyDataLoadKeyRef.current = academyDataLoadKey(academy);
      return;
    }

    const messagesData = await teacherStudioConversationMessages(academy, { conversation_id: nextConversationId });
    setMessages(messagesData.messages ?? []);
    academyDataLoadKeyRef.current = academyDataLoadKey(academy);
  }, [academyDataLoadKey, loadContactEnrichment, officeClassroomId, officeRouteIntent, officeView]);

  const retryContactEnrichment = useCallback((key: ContactEnrichmentKey) => {
    if (!academyId || !selectedAcademyAccess || officeView !== 'contacts') return;
    const loadKey = academyDataLoadKey(academyId);
    void loadContactEnrichment(academyId, selectedAcademyAccess, loadKey, key);
  }, [academyDataLoadKey, academyId, loadContactEnrichment, officeView, selectedAcademyAccess]);

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
        summaryCacheRef.current.clear();
        contactsCacheRef.current.clear();
        academyDataLoadKeyRef.current = '';
        setMe(null);
        setState('unauthenticated');
        return;
      }

      const meResponse = await getMe();
      const memberships = (meResponse.memberships ?? []).filter((membership) => membership.status === 'active');
      const teacherMembershipRows = memberships.filter(isAcademyStaffMembership);
      if (isGuardianWorkspaceRoute) {
        setMe(meResponse);
        setAcademies([]);
        setStudentDashboard(emptyStudentDashboard());
        setAcademyId('');
        setState('ready');
        return;
      }
      if (isAcademySetup) {
        setMe(meResponse);
        setAcademies([]);
        setStudentDashboard(emptyStudentDashboard());
        setAcademyId('');
        setState('ready');
        return;
      }
      if (isServiceLanding) {
        setMe(meResponse);
        setAcademies([]);
        setStudentDashboard(null);
        setAcademyId('');
        setState('ready');
        return;
      }
      let cachedStudentData: TeacherStudioStudentDashboard | null = null;
      const loadStudentDataOnce = async (): Promise<TeacherStudioStudentDashboard> => {
        if (cachedStudentData) return cachedStudentData;
        cachedStudentData = await loadStudentData();
        return cachedStudentData;
      };
      const shouldPreloadStudentData =
        isWorkspaceEntry ||
        isAcademyDirectory ||
        isStudentWorkspaceRoute ||
        !!academyClassroomLandingId;
      const studentDataPromise = shouldPreloadStudentData ? loadStudentDataOnce() : null;
      let academyList: TeacherStudioAcademy[] = [];
      const shouldAttemptTeacherData = !isStudentWorkspaceRoute && !isGuardianWorkspaceRoute && !isServiceLanding;
      if (shouldAttemptTeacherData) {
        try {
          academyList = await teacherStudioAcademies();
          academyList = academyList.filter(academyCanEnterOffice);
        } catch (teacherErr) {
          if (teacherMembershipRows.length > 0 || isTeacherWorkspaceRoute || isAcademyDirectory || isWorkspaceEntry) {
            throw teacherErr;
          }
        }
      }
      const hasTeacherRouteAccess = academyList.length > 0 || teacherMembershipRows.length > 0;
      const shouldLoadStudentData =
        shouldPreloadStudentData ||
        isStudentWorkspaceRoute ||
        !!academyClassroomLandingId ||
        !hasTeacherRouteAccess;
      const studentData = shouldLoadStudentData
        ? await (studentDataPromise ?? loadStudentDataOnce())
        : null;
      const hasStudentRouteAccess = hasStudentWorkspaceAccess(studentData);

      if (!hasTeacherRouteAccess && !hasStudentRouteAccess) {
        setMe(meResponse);
        setAcademies([]);
        setStudentDashboard(studentData ?? emptyStudentDashboard());
        setAcademyId('');
        setError('');
        setState('ready');
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
        if (selectedAcademy && !isWorkspaceEntry && !isAcademyDirectory) await loadAcademyData(selectedAcademy);
      } else {
        setAcademies([]);
        setAcademyId(requestedAcademyId || studentData?.academies[0]?.id || '');
      }

      setState('ready');
    } catch (err) {
      const message = normalizeError(err);
      if (message === 'Your session expired. Please sign in again.') {
        summaryCacheRef.current.clear();
        contactsCacheRef.current.clear();
        academyDataLoadKeyRef.current = '';
        setMe(null);
        setState('unauthenticated');
        setError('');
        return;
      }
      setState('error');
      setError(message);
    }
  }, [
    academyClassroomLandingId,
    academyId,
    isAcademyDirectory,
    isAcademySetup,
    isServiceLanding,
    isStudentWorkspaceRoute,
    isGuardianWorkspaceRoute,
    isTeacherWorkspaceRoute,
    isWorkspaceEntry,
    loadAcademyData,
    loadStudentData,
    requestedAcademyId,
  ]);

  useEffect(() => {
    if (bootstrapScopeRef.current === bootstrapScope) return;
    bootstrapScopeRef.current = bootstrapScope;
    void bootstrap();
  }, [bootstrap, bootstrapScope]);

  useEffect(() => {
    if (state !== 'ready' || !isServiceLanding || !me) return;
    navigate(location.search ? `/academy/workspace${location.search}` : '/academy/workspace', { replace: true });
  }, [isServiceLanding, location.search, me, navigate, state]);

  useEffect(() => {
    if (state !== 'ready' || !isAcademyDirectory || !hasTeacherAccess || studentDashboard) return;
    void loadStudentData().catch((err) => {
      console.warn('Failed to hydrate student access in Academy directory', err);
    });
  }, [hasTeacherAccess, isAcademyDirectory, loadStudentData, state, studentDashboard]);

  useEffect(() => {
    const subscription = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        summaryCacheRef.current.clear();
        contactsCacheRef.current.clear();
        academyDataLoadKeyRef.current = '';
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
      normalized === '/academy/setup' ||
      normalized === '/academy/workspace' ||
      normalized === '/academy' ||
      normalized === '/academy/classrooms' ||
      !!academyClassroomLandingId
    ) {
      return;
    }
    if (isTeacherWorkspaceRoute || isStudentWorkspaceRoute || isGuardianWorkspaceRoute) return;
    const nextPath = '/academies';
    navigate(location.search ? `${nextPath}${location.search}` : nextPath, { replace: true });
  }, [academyClassroomLandingId, isGuardianWorkspaceRoute, isStudentWorkspaceRoute, isTeacherWorkspaceRoute, location.pathname, location.search, navigate, state]);

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
    (view: OfficeView = 'today', itemId?: string): string => academyOfficePath(view, itemId, officeRouteIntent),
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

  const rememberWorkspace = useCallback((preference: WorkspacePreference) => {
    setWorkspacePreference((current) => (
      current?.kind === preference.kind && current.academyId === preference.academyId
        ? current
        : preference
    ));
    writeWorkspacePreference(preference);
  }, []);

  const openStaffWorkspace = useCallback((targetAcademyId: string, replace = false) => {
    if (!targetAcademyId) return;
    rememberWorkspace({ kind: 'staff', academyId: targetAcademyId });
    navigate(academyScopedPath(defaultOfficePathForAcademy(targetAcademyId), targetAcademyId), { replace });
  }, [academyScopedPath, defaultOfficePathForAcademy, navigate, rememberWorkspace]);

  const openStudentWorkspace = useCallback((targetAcademyId: string, replace = false) => {
    if (!targetAcademyId) return;
    rememberWorkspace({ kind: 'student', academyId: targetAcademyId });
    navigate(academyScopedPath('/academy/student', targetAcademyId), { replace });
  }, [academyScopedPath, navigate, rememberWorkspace]);

  useEffect(() => {
    if (state !== 'ready' || !isWorkspaceEntry) return;
    const requestedStaffAcademy = requestedAcademyId
      ? teacherDirectoryAcademies.find((academy) => academy.id === requestedAcademyId)
      : null;
    const requestedStudentAcademy = requestedAcademyId
      ? studentDirectoryAcademies.find((academy) => academy.id === requestedAcademyId)
      : null;
    const preferredStaffAcademy = workspacePreference?.kind === 'staff'
      ? teacherDirectoryAcademies.find((academy) => academy.id === workspacePreference.academyId) ?? null
      : null;
    const preferredStudentAcademy = workspacePreference?.kind === 'student'
      ? studentDirectoryAcademies.find((academy) => academy.id === workspacePreference.academyId) ?? null
      : null;

    if (requestedStaffAcademy && !requestedStudentAcademy) {
      openStaffWorkspace(requestedStaffAcademy.id, true);
      return;
    }
    if (requestedStudentAcademy && !requestedStaffAcademy) {
      openStudentWorkspace(requestedStudentAcademy.id, true);
      return;
    }
    if (requestedStaffAcademy && requestedStudentAcademy) {
      if (workspacePreference?.kind === 'staff') {
        openStaffWorkspace(requestedStaffAcademy.id, true);
        return;
      }
      if (workspacePreference?.kind === 'student') {
        openStudentWorkspace(requestedStudentAcademy.id, true);
        return;
      }
    }
    if (preferredStaffAcademy) {
      openStaffWorkspace(preferredStaffAcademy.id, true);
      return;
    }
    if (preferredStudentAcademy) {
      openStudentWorkspace(preferredStudentAcademy.id, true);
      return;
    }

    const workspaceCount = teacherDirectoryAcademies.length + studentDirectoryAcademies.length;
    if (workspaceCount === 1 && teacherDirectoryAcademies[0]) {
      openStaffWorkspace(teacherDirectoryAcademies[0].id, true);
      return;
    }
    if (workspaceCount === 1 && studentDirectoryAcademies[0]) {
      openStudentWorkspace(studentDirectoryAcademies[0].id, true);
      return;
    }

    navigate(location.search ? `/academies${location.search}` : '/academies', { replace: true });
  }, [
    isWorkspaceEntry,
    location.search,
    navigate,
    openStaffWorkspace,
    openStudentWorkspace,
    requestedAcademyId,
    state,
    studentDirectoryAcademies,
    teacherDirectoryAcademies,
    workspacePreference,
  ]);

  useEffect(() => {
    if (state !== 'ready') return;
    const activeAcademyId = requestedAcademyId || academyId;
    if (isTeacherWorkspaceRoute && activeAcademyId && teacherAcademyIds.has(activeAcademyId)) {
      const preference = { kind: 'staff', academyId: activeAcademyId } satisfies WorkspacePreference;
      if (workspacePreference?.kind !== preference.kind || workspacePreference.academyId !== preference.academyId) {
        rememberWorkspace(preference);
      }
      return;
    }
    if (isStudentWorkspaceRoute && activeAcademyId && studentAcademyIds.has(activeAcademyId)) {
      const preference = { kind: 'student', academyId: activeAcademyId } satisfies WorkspacePreference;
      if (workspacePreference?.kind !== preference.kind || workspacePreference.academyId !== preference.academyId) {
        rememberWorkspace(preference);
      }
    }
  }, [
    academyId,
    isStudentWorkspaceRoute,
    isTeacherWorkspaceRoute,
    rememberWorkspace,
    requestedAcademyId,
    state,
    studentAcademyIds,
    teacherAcademyIds,
    workspacePreference,
  ]);

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

  useLayoutEffect(() => {
    if (state !== 'ready' || !isTeacherWorkspaceRoute || !academyId || allowedOfficeViews.length === 0) return;
    const key = academyDataLoadKey(academyId);
    if (academyDataLoadKeyRef.current !== key) setRouteLoading(true);
  }, [academyDataLoadKey, academyId, allowedOfficeViews.length, isTeacherWorkspaceRoute, state]);

  useEffect(() => {
    if (state !== 'ready' || !isTeacherWorkspaceRoute || !academyId || allowedOfficeViews.length === 0) return;
    const key = academyDataLoadKey(academyId);
    if (academyDataLoadKeyRef.current === key) return;
    academyDataLoadKeyRef.current = key;
    void loadAcademyData(academyId, selectedConversationId, true)
      .catch((err) => {
        academyDataLoadKeyRef.current = '';
        setError(normalizeError(err));
      })
      .finally(() => {
        if (academyDataLoadKeyRef.current === key || academyDataLoadKeyRef.current === '') setRouteLoading(false);
      });
  }, [
    academyDataLoadKey,
    academyId,
    allowedOfficeViews.length,
    isTeacherWorkspaceRoute,
    loadAcademyData,
    selectedConversationId,
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
    const file = classroomResourceForm.file;
    const week = classroomResourceForm.week.trim();
    const moduleLabel = classroomResourceForm.module.trim();
    const lesson = classroomResourceForm.lesson.trim();
    if (!title || (!url && !file)) return;

    const metadata: Record<string, string> = {};
    if (week) metadata.week = week;
    if (moduleLabel) metadata.module = moduleLabel;
    if (lesson) metadata.lesson = lesson;

    setClassroomRoomBusy(true);
    setError('');
    setNotice('');
    try {
      const resourcePayload = {
        classroom_id: academyClassroomLandingId,
        title,
        type: classroomResourceForm.type,
        url,
        description: classroomResourceForm.description.trim() || undefined,
        sort_order: Number(classroomResourceForm.sort_order || '0'),
        is_published: classroomResourceForm.is_published,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      };
      if (file) {
        await teacherStudioUploadClassroomResource(sharedClassroomAcademyId, {
          ...resourcePayload,
          file,
        });
      } else {
        await teacherStudioUpsertClassroomResource(sharedClassroomAcademyId, resourcePayload);
      }
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

  const setClassroomEnrollmentStatus = async (
    membershipId: string,
    membershipStatus: TeacherStudioClassroomMembership['status'],
  ) => {
    if (!academyId || !requireOfficePermission('manageRoster', 'Roster management')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await teacherStudioSetEnrollmentStatus(academyId, { id: membershipId, membership_status: membershipStatus });
      await loadAcademyData(academyId, selectedConversationId);
      setNotice(`Enrollment moved to ${membershipStatus}.`);
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
    bootstrapScopeRef.current = '';
    summaryCacheRef.current.clear();
    contactsCacheRef.current.clear();
    academyDataLoadKeyRef.current = '';
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
    isTeacherWorkspaceRoute && requestedAcademyId && !teacherAcademyIds.has(requestedAcademyId),
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
    if (state === 'ready') {
      return (
        <>
          <div className="ts-loading">
            <div className="auth-card">
              <h2>{translate("Academy")}</h2>
              <p>{translate("Opening your workspace...")}</p>
            </div>
          </div>
          <UpdatesButton />
        </>
      );
    }
    return (
      <>
        <div className="market-page">
          <div className="market-wrap">
            <div className="market-nav">
              <a className="ghost-btn" href={`${platformUrl.replace(/\/$/, '')}/`}>
                {translate("Back to platform")}{' '}</a>
            </div>

            <section className="market-hero">
              <div className="market-copy">
                <div className="market-eyebrow"><Sparkles size={14} /> {translate("Schood service")}</div>
                <h1>{translate("Academy")}</h1>
                <p>
                  {translate("A living operating layer for education businesses: public academy pages, classroom hubs, teacher operations, student access, payments, alerts, and messaging in one connected flow.")}{' '}</p>
                <div className="market-actions">
                  {state === 'unauthenticated' ? (
                    <a className="primary-btn" href={toAuthUrl()}>
                      {translate("Sign in")}{' '}</a>
                  ) : null}
                  {state === 'loading' ? <span className="market-note">{translate("Checking your session...")}</span> : null}
                  {state === 'error' ? (
                    <button className="ghost-btn" type="button" onClick={() => void bootstrap()}>
                      {translate("Retry")}{' '}</button>
                  ) : null}
                </div>
                <div className="market-proof-strip" aria-label={translate("Academy service highlights")}>
                  <span>{translate("Public pages")}</span>
                  <span>{translate("Teacher office")}</span>
                  <span>{translate("Student workplace")}</span>
                </div>
              </div>

              <div className="academy-command-card">
                <div className="academy-command-head">
                  <div>
                    <span className="market-badge">{translate("Live command center")}</span>
                    <h2>{translate("Run the academy week from one surface")}</h2>
                  </div>
                  <span className="pulse-dot" aria-hidden="true" />
                </div>

                <div className="academy-mini-chart" aria-label={translate("Weekly academy activity chart")}>
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
                    <strong>{translate("Contacts")}</strong>
                    <span>{translate("Student records, family contacts, and academy roles.")}</span>
                  </article>
                  <article>
                    <CreditCard size={18} />
                    <strong>{translate("Revenue")}</strong>
                    <span>{translate("Click checkout, offers, grants, and access windows.")}</span>
                  </article>
                  <article>
                    <MessageSquare size={18} />
                    <strong>{translate("Comms")}</strong>
                    <span>{translate("Inbox, announcements, classroom discussion, and alerts.")}</span>
                  </article>
                  <article>
                    <BookOpenCheck size={18} />
                    <strong>{translate("Learning")}</strong>
                    <span>{translate("Classroom landings, resources, progress, and mock links.")}</span>
                  </article>
                </div>
              </div>
            </section>

            {state === 'error' && error ? <div className="error-banner">{translate(error)}</div> : null}

            <section className="market-section-head">
              <span className="market-badge">{translate("Structure")}</span>
              <h2>{translate("Four surfaces, one academy identity")}</h2>
              <p>
                {translate("The service is not just a dashboard. It gives every academy a public face, a staff workspace, a classroom layer, and a student portal that all understand the same access model.")}{' '}</p>
            </section>

            <section className="market-grid academy-surface-grid">
              <article className="market-card surface-card surface-card--lime">
                <div className="surface-icon"><Building2 size={22} /></div>
                <h3>{translate("Academy landing")}</h3>
                <p>{translate("Tell the academy story, show the offer, and send families to the right classroom or office entry.")}</p>
                <div className="surface-meta">{translate("Brand narrative · CTAs · directory cards")}</div>
              </article>
              <article className="market-card surface-card surface-card--sky">
                <div className="surface-icon"><Store size={22} /></div>
                <h3>{translate("Staff workspaces")}</h3>
                <p>{translate("Route administrators, center operators, managers, counselors, teachers, and assistants to the tools for their role.")}</p>
                <div className="surface-meta">{translate("Operations · billing · access control")}</div>
              </article>
              <article className="market-card surface-card surface-card--violet">
                <div className="surface-icon"><BookOpenCheck size={22} /></div>
                <h3>{translate("Classroom landing")}</h3>
                <p>{translate("Give each classroom a living home with resources, modules, lessons, progress, and discussion.")}</p>
                <div className="surface-meta">{translate("Syllabus · resources · classroom chat")}</div>
              </article>
              <article className="market-card surface-card surface-card--coral">
                <div className="surface-icon"><GraduationCap size={22} /></div>
                <h3>{translate("Student Workplace")}</h3>
                <p>{translate("Students see their classrooms, announcements, messages, alerts, access grants, and payments in one focused space.")}</p>
                <div className="surface-meta">{translate("Learning view · alerts · access history")}</div>
              </article>
            </section>

            <section className="academy-rhythm">
              <div className="market-section-head">
                <span className="market-badge">{translate("Daily rhythm")}</span>
                <h2>{translate("Built around the real week of an academy")}</h2>
                <p>
                  {translate("The flow follows how teams actually work: attract a student, enroll them, place them in a cohort, keep the family informed, collect payment, and keep access clean.")}{' '}</p>
              </div>
              <div className="rhythm-track">
                <article className="market-step">
                <div className="market-step-index">01</div>
                  <h3>{translate("Publish the offer")}</h3>
                  <p>{translate("Create a clear academy page and classroom pages that families can understand before they sign in.")}</p>
                </article>
                <article className="market-step">
                <div className="market-step-index">02</div>
                  <h3>{translate("Enroll and place")}</h3>
                  <p>{translate("Add contacts, create cohorts, assign students, and give each learner the right workspace.")}</p>
                </article>
                <article className="market-step">
                <div className="market-step-index">03</div>
                  <h3>{translate("Teach and track")}</h3>
                  <p>{translate("Attach resources, publish assignments, send announcements, and keep classroom discussion visible.")}</p>
                </article>
                <article className="market-step">
                  <div className="market-step-index">04</div>
                  <h3>{translate("Collect and retain")}</h3>
                  <p>{translate("Connect offers to access grants, track payments, resolve alerts, and keep students active.")}</p>
                </article>
              </div>
            </section>

            <section className="academy-capability-panel">
              <div>
                <span className="market-badge">{translate("Substance")}</span>
                <h2>{translate("What the service controls")}</h2>
                <p>
                  {translate("Academy is designed as the operational service behind Schood learning products, not a loose admin page.")}{' '}</p>
              </div>
              <div className="capability-list">
                <div><span>01</span> {translate("Academy and classroom public presentation")}</div>
                <div><span>02</span> {translate("Contacts, membership roles, cohorts, and classroom access")}</div>
                <div><span>03</span> {translate("Offers, Click payment tracking, grants, and entitlements")}</div>
                <div><span>04</span> {translate("Announcements, direct inbox, alerts, and student feed")}</div>
                <div><span>05</span> {translate("Classroom resources, progress, live refresh, and discussion")}</div>
              </div>
            </section>

            <section className="academy-final-cta">
              <div>
                <span className="market-badge">{translate("Next step")}</span>
                <h2>{translate("Open the role workspace when you need control. Open the classroom when you need focus.")}</h2>
              </div>
              <a className="primary-btn" href={toAuthUrl()}>
                {translate("Sign in to Academy")}{' '}</a>
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
            <h2>{translate("Academy")}</h2>
            <p>{isWorkspaceEntry ? 'Finding your role and opening the right workspace...' : 'Preparing Academy...'}</p>
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
            <h2>{translate("Academy")}</h2>
            <p>{translate("Sign in with your platform account to continue.")}</p>
            <a className="primary-btn" href={toAuthUrl()}>
              {translate("Sign in")}{' '}</a>
            <a className="ghost-btn" href={`${platformUrl.replace(/\/$/, '')}/`}>
              {translate("Back to platform")}{' '}</a>
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
            <h2>{translate("Academy")}</h2>
            <p>{error || 'Could not load Academy.'}</p>
            <button className="primary-btn" onClick={() => void bootstrap()} type="button">
              {translate("Retry")}{' '}</button>
            <a className="ghost-btn" href={toAuthUrl()}>
              {translate("Sign in again")}{' '}</a>
          </div>
        </div>
        <UpdatesButton />
      </>
    );
  }

  if (state === 'ready' && isGuardianWorkspaceRoute) {
    return <><LazyRouteBoundary fallback={<WorkspaceSectionSkeleton />}><GuardianPortalView onSignOut={signOut} /></LazyRouteBoundary><UpdatesButton /></>;
  }

  if (state === 'ready' && isTeacherWorkspaceRoute && (requestedOfficeAcademyDenied || !hasOfficeWorkspaceAccess || allowedOfficeViews.length === 0)) {
    const fallbackOfficeAcademyId = officeRouteAcademies[0]?.id ?? '';
    return (
      <>
        <div className="ts-loading">
          <div className="auth-card">
            <h2>{translate("Role workspace access required")}</h2>
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
                {translate("Open my role workspace")}{' '}</button>
            ) : null}
            {hasStudentAccess ? (
              <button className={fallbackOfficeAcademyId ? 'ghost-btn' : 'primary-btn'} type="button" onClick={() => navigate(academyScopedPath('/academy/student'))}>
                {translate("Open Student Workplace")}{' '}</button>
            ) : null}
            <button className="ghost-btn" type="button" onClick={() => navigate('/academies')}>
              {translate("Switch workspace")}{' '}</button>
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
            <h2>{translate("Student Workplace access required")}</h2>
            <p>{translate("This route is only for linked student contacts. Your account does not have a student profile here.")}</p>
            {hasTeacherAccess ? (
              <button
                className="primary-btn"
                type="button"
                onClick={() => {
                  const targetAcademyId = selectedOfficeAcademy?.id ?? teacherDirectoryAcademies[0]?.id;
                  navigate(academyScopedPath(defaultOfficePathForAcademy(targetAcademyId), targetAcademyId));
                }}
              >
                {translate("Open staff workspace")}{' '}</button>
            ) : null}
            <button className="ghost-btn" type="button" onClick={() => navigate('/academies')}>
              {translate("Switch workspace")}{' '}</button>
          </div>
        </div>
        <UpdatesButton />
      </>
    );
  }

  if (state === 'ready' && isAcademySetup) {
    return (
      <>
        <div className="market-page">
          <div className="market-wrap">
            <MarketUtilityNavigation id="academy-setup-menu">
              <button className="ghost-btn" type="button" onClick={() => navigate('/academies')}>
                {translate("Back to workspaces")}{' '}</button>
              <button className="ghost-btn" type="button" onClick={() => void signOut()}>
                {translate("Sign out")}{' '}</button>
              <a className="ghost-btn" href={`${platformUrl.replace(/\/$/, '')}/`}>
                {translate("Back to platform")}{' '}</a>
            </MarketUtilityNavigation>

            <section className="market-section-head">
              <span className="market-badge">{translate("Academy setup")}</span>
              <h1>{translate("Set up a new academy")}</h1>
              <p>{translate("Create a separate academy without changing your access to existing workspaces.")}</p>
            </section>

            {error ? <div className="error-banner">{translate(error)}</div> : null}
            {notice ? <div className="info-banner">{translate(notice)}</div> : null}

            <section className="market-card market-card--accent">
              <form className="grid" onSubmit={submitAcademy}>
                <label className="grid">
                  <span className="small muted">{translate("Academy name")}</span>
                  <input
                    className="input"
                    value={academyNameDraft}
                    onChange={(event) => setAcademyNameDraft(event.target.value)}
                    required
                  />
                </label>
                <label className="grid">
                  <span className="small muted">{translate("Slug (optional)")}</span>
                  <input
                    className="input"
                    value={academySlugDraft}
                    onChange={(event) => setAcademySlugDraft(event.target.value)}
                  />
                </label>
                <button className="primary-btn" type="submit" disabled={busy}>
                  {translate("Create academy")}{' '}</button>
              </form>
            </section>
          </div>
        </div>
        <UpdatesButton />
      </>
    );
  }

  if (state === 'ready' && isAcademyDirectory) {
    const staffActionLabel = (academy: TeacherStudioAcademy): string => {
      const access = academy.access ?? buildFallbackAccess(academy.role);
      const intent = officeIntentForAccess(access);
      if (intent === 'admin') return translate('Manage {academy}', { academy: academy.name || academy.id });
      if (intent === 'center') return translate('Open {academy} center', { academy: academy.name || academy.id });
      if (intent === 'teacher') return translate('Teach in {academy}', { academy: academy.name || academy.id });
      return translate('Open {academy} operations', { academy: academy.name || academy.id });
    };

    return (
      <>
        <div className="market-page">
          <div className="market-wrap">
            <MarketUtilityNavigation id="academy-workspace-menu">
              <button className="ghost-btn" type="button" onClick={() => void refresh()} disabled={busy}>
                {translate("Refresh")}{' '}</button>
              <button className="ghost-btn" type="button" onClick={() => void signOut()}>
                {translate("Sign out")}{' '}</button>
              <a className="ghost-btn" href={`${platformUrl.replace(/\/$/, '')}/`}>
                {translate("Back to platform")}{' '}</a>
            </MarketUtilityNavigation>

            {directoryWorkspaceAcademies.length > 0 ? (
              <>
                <section className="market-section-head">
                  <span className="market-badge">{translate("Workspace access")}</span>
                  <h1>{translate("Choose a workspace")}</h1>
                  <p>{translate("Only academies and roles linked to your account are shown.")}</p>
                </section>

                {error ? <div className="error-banner">{translate(error)}</div> : null}
                {notice ? <div className="info-banner">{translate(notice)}</div> : null}

                <section className="market-grid market-grid--wide">
                  {directoryWorkspaceAcademies.map((entry) => {
                    const staffAccess = entry.staff?.access ?? (entry.staff ? buildFallbackAccess(entry.staff.role) : null);
                    const staffShell = entry.staff ? officeShellLabel(staffAccess, officeIntentForAccess(staffAccess)) : null;
                    const hasBothRoles = Boolean(entry.staff && entry.student);
                    return (
                      <article className="market-card workspace-card" key={entry.id}>
                        <div className="row between">
                          <div className="workspace-card__identity">
                            <h2 className="workspace-card__title">{entry.name}</h2>
                            <p className="small muted workspace-card__slug">{entry.slug}</p>
                          </div>
                          <div className="row">
                            {entry.staff ? <span className="status status--ok">{translate(accessRoleLabel(staffAccess))}</span> : null}
                            {entry.student ? <span className="status status--ok">{translate("Student")}</span> : null}
                          </div>
                        </div>
                        <p>
                          {hasBothRoles
                            ? translate("Choose whether you want to manage this academy or continue learning.")
                            : entry.staff
                              ? translate(staffShell?.subtitle ?? 'Role-scoped Academy operations.')
                              : translate("Classrooms, messages, tuition, and learning progress.")}
                        </p>
                        <div className="market-actions">
                          {entry.staff ? (
                            <button className="primary-btn workspace-card__action" type="button" onClick={() => openStaffWorkspace(entry.id)}>
                              {staffActionLabel(entry.staff)}
                            </button>
                          ) : null}
                          {entry.student ? (
                            <button className={`${entry.staff ? 'ghost-btn' : 'primary-btn'} workspace-card__action`} type="button" onClick={() => openStudentWorkspace(entry.id)}>
                              {translate('Learn in {academy}', { academy: entry.name })}
                            </button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </section>

                <section className="academy-final-cta">
                  <div>
                    <span className="market-badge">{translate("Academy setup")}</span>
                    <h2>{translate("Need to open a separate academy?")}</h2>
                  </div>
                  <button className="ghost-btn" type="button" onClick={() => navigate('/academy/setup')}>
                    {translate("Set up an academy")}{' '}</button>
                </section>
              </>
            ) : (
              <section className="market-hero">
                <div className="market-copy">
                  <div className="market-eyebrow">{translate("Workspace access")}</div>
                  <h1>{translate("No Academy access yet")}</h1>
                  <p>{translate("This account is not linked to an academy workspace. You can set up a new academy or return to Schood.")}</p>
                  <div className="market-actions">
                    <button className="primary-btn" type="button" onClick={() => navigate('/academy/setup')}>
                      {translate("Set up an academy")}{' '}</button>
                    <a className="ghost-btn" href={`${platformUrl.replace(/\/$/, '')}/`}>
                      {translate("Back to platform")}{' '}</a>
                  </div>
                </div>
              </section>
            )}
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
                {translate("Switch workspace")}{' '}</button>
              <button
                className="ghost-btn"
                type="button"
                onClick={() => navigate(academyScopedPath('/academy/classrooms', currentAcademyId))}
              >
                {translate("Classroom landings")}{' '}</button>
              <button className="ghost-btn" type="button" onClick={() => void refresh()} disabled={busy}>
                {translate("Refresh")}{' '}</button>
              <button className="ghost-btn" type="button" onClick={() => void signOut()}>
                {translate("Sign out")}{' '}</button>
            </div>

            <section className="market-hero">
              <div className="market-copy">
                <div className="market-eyebrow">{translate("Academy landing")}</div>
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
                <div className="market-badge">{translate("Current academy")}</div>
                <div className="market-kpis">
                  <article className="market-kpi">
                    <span>{translate("Academy ID")}</span>
                    <strong>{currentAcademyId || '-'}</strong>
                  </article>
                  <article className="market-kpi">
                    <span>{translate("Classrooms")}</span>
                    <strong>{currentAcademyClassrooms.length}</strong>
                  </article>
                  <article className="market-kpi">
                    <span>{translate("Staff workspace")}</span>
                    <strong>{canEnterTeacher ? 'yes' : 'no'}</strong>
                  </article>
                  <article className="market-kpi">
                    <span>{translate("Student Workplace")}</span>
                    <strong>{canEnterStudent ? 'yes' : 'no'}</strong>
                  </article>
                </div>
              </div>
            </section>

            {error ? <div className="error-banner">{translate(error)}</div> : null}
            {notice ? <div className="info-banner">{translate(notice)}</div> : null}

            <section className="market-grid">
              {currentAcademyClassrooms.slice(0, 6).map((classroom) => {
                const landing = readClassroomLandingSettings(classroom.metadata);
                const cardSummary = landing.card_summary || classroom.description || 'Classroom landing page ready for teacher and student entry.';
                return (
                  <article className="market-card" key={classroom.id}>
                    <h3>{classroom.name}</h3>
                    <p>{cardSummary}</p>
                    <div className="row between">
                      <span className="small muted">{translate('Members: {count}', { count: classroom.member_count })}</span>
                      <button
                        className="small-btn"
                        type="button"
                        onClick={() => navigate(academyScopedPath(`/academy/classrooms/${classroom.id}`, classroom.academy_id))}
                      >
                        {translate("Open landing")}{' '}</button>
                    </div>
                  </article>
                );
              })}
              {currentAcademyClassrooms.length === 0 ? (
                <article className="market-card">
                  <h3>{translate("No classrooms yet")}</h3>
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
                      {translate("Open classroom workspace")}{' '}</button>
                  ) : null}
                </article>
              ) : null}
            </section>

            <section className="market-grid market-grid--wide">
              <article className="market-card market-card--accent">
                <h3>{translate("Staff workspace flow")}</h3>
                <p>{translate("Open the route family that matches your staff role: administrator control, center control, operations, or teacher LMS.")}</p>
                {canEnterTeacher ? (
                  <button
                    className="small-btn"
                    type="button"
                    onClick={() => navigate(academyScopedPath(defaultOfficePathForAcademy(currentAcademyId), currentAcademyId))}
                  >
                    {translate("Open staff workspace")}{' '}</button>
                ) : (
                  <div className="small muted">{translate("An academy staff role is required for this academy.")}</div>
                )}
              </article>
              <article className="market-card">
                <h3>{translate("Student Workplace flow")}</h3>
                <p>{translate("Students see their classrooms, messages, alerts, and access status without teacher-only controls.")}</p>
                {canEnterStudent ? (
                  <button
                    className="small-btn"
                    type="button"
                    onClick={() => navigate(academyScopedPath('/academy/student', currentAcademyId))}
                  >
                    {translate("Open Student Workplace")}{' '}</button>
                ) : (
                  <div className="small muted">{translate("A linked student contact is required for this academy.")}</div>
                )}
              </article>
              <article className="market-card">
                <h3>{translate("Visible activity")}</h3>
                <p>{translate('Contacts: {contacts}. Announcements: {announcements}.', {
                  contacts: currentAcademyContacts.length,
                  announcements: currentAcademyAnnouncements.length,
                })}</p>
                <button
                  className="small-btn"
                  type="button"
                  onClick={() => navigate(academyScopedPath('/academy/classrooms', currentAcademyId))}
                >
                  {translate("Review classroom landings")}{' '}</button>
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
                {translate("Classroom directory")}{' '}</button>
              <button className="ghost-btn" type="button" onClick={() => navigate(academyScopedPath('/academy', roomAcademyId))}>
                {translate("Academy landing")}{' '}</button>
              <button className="ghost-btn" type="button" onClick={() => void refreshClassroomRoom()} disabled={classroomRoomBusy}>
                {translate("Refresh classroom")}{' '}</button>
              <button
                className="ghost-btn"
                type="button"
                onClick={() => setClassroomAutoRefreshEnabled((enabled) => !enabled)}
              >
                {translate('Auto refresh: {status}', {
                  status: translate(classroomAutoRefreshEnabled ? 'On' : 'Off'),
                })}
              </button>
            </div>

            <section className="market-hero">
              <div className="market-copy">
                <div className="market-eyebrow">{translate("Classroom workspace")}</div>
                <h1>{activeClassroom?.name ?? 'Classroom'}</h1>
                <p>
                  {translate("Classroom hub with role-aware controls. Teachers can manage resources, while students get learning, discussion, and progress actions only.")}{' '}</p>
                <div className="market-actions">
                  {canOpenTeacherRoom ? (
                    <button
                      className="primary-btn"
                      type="button"
                      onClick={() => navigate(academyScopedPath(academyOfficePathForAcademy('classrooms', undefined, roomAcademyId), roomAcademyId))}
                    >
                      {translate("Staff workspace")}{' '}</button>
                  ) : null}
                  {canOpenStudentRoom ? (
                    <button
                      className="ghost-btn"
                      type="button"
                      onClick={() => navigate(academyScopedPath('/academy/student/classrooms', roomAcademyId))}
                    >
                      {translate("Student Workplace")}{' '}</button>
                  ) : null}
                </div>
              </div>

              <div className="market-highlight">
                <div className="market-badge">{translate("Room status")}</div>
                <div className="market-kpis">
                  <article className="market-kpi">
                    <span>{translate("Academy")}</span>
                    <strong>{roomAcademyName}</strong>
                  </article>
                  <article className="market-kpi">
                    <span>{translate("Viewer")}</span>
                    <strong>{roomViewer.display_name}</strong>
                  </article>
                  <article className="market-kpi">
                    <span>{translate("Role")}</span>
                    <strong>{roomViewer.role}</strong>
                  </article>
                  <article className="market-kpi">
                    <span>{translate("Participants")}</span>
                    <strong>{roomMembers.length}</strong>
                  </article>
                  <article className="market-kpi">
                    <span>{translate("Resources")}</span>
                    <strong>{roomResources.length}</strong>
                  </article>
                  <article className="market-kpi">
                    <span>{translate("Your progress")}</span>
                    <strong>{completedLessonsCount}/{totalLessonsCount} ({progressPercent}%)</strong>
                  </article>
                </div>
              </div>
            </section>

            <section className="classroom-studio">
              <aside className="classroom-studio-syllabus panel">
                <div className="classroom-studio-hello">{translate('Hello, {name}', { name: roomViewer.display_name })}</div>
                <h3>{translate("Your custom classroom path")}</h3>
                <p className="muted">
                  {translate("Explore resources, follow announcements, and keep discussion in one shared place.")}{' '}</p>

                <div className="classroom-chip-row">
                  {CLASSROOM_RESOURCE_FILTERS.map((item) => (
                    <button
                      key={item.kind}
                      className={`classroom-chip ${classroomResourceFilter === item.kind ? 'is-active' : ''}`}
                      type="button"
                      onClick={() => setClassroomResourceFilter(item.kind)}
                    >
                      {item.kind === 'all' ? `${translate(item.label)} (${roomResources.length})` : translate(item.label)}
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
                          <span className="small muted">{translate('Completed: {completed}/{total}', {
                            completed: completedCount,
                            total: roomProgress.total_members || roomMembers.length,
                          })}</span>
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
                    <div className="small muted">{translate("No resources match this filter.")}</div>
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
                          {translate("Open source")}{' '}</a>
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
                  <div className="small muted">{translate('Lesson progress: {completed}/{total}', {
                    completed: completedLessonsCount,
                    total: totalLessonsCount,
                  })}</div>

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
                    <h3>{translate("Course discussion")}</h3>
                    <span className="small muted">{translate('Members: {members}. Active now: {active}.', {
                      members: roomMembers.length,
                      active: activeNowCount,
                    })}</span>
                  </div>

                  <div className="classroom-discussion-meta">
                    <span className={`classroom-sync-indicator ${classroomAutoRefreshEnabled ? 'is-live' : 'is-off'}`}>
                      {classroomAutoRefreshEnabled ? `Auto-sync on (every ${Math.round(CLASSROOM_AUTO_REFRESH_MS / 1000)}s)` : 'Auto-sync off'}
                    </span>
                    <span className="small muted">
                      {translate('Last sync: {time}', {
                        time: classroomLastSyncAt ? formatRelativeTime(classroomLastSyncAt) : translate('Pending'),
                      })}
                    </span>
                    {latestRoomMessageAt ? (
                      <span className="small muted" title={formatDate(latestRoomMessageAt)}>
                        {translate('Latest message: {time}', { time: formatRelativeTime(latestRoomMessageAt) })}
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
                    {roomMessages.length === 0 ? <div className="small muted">{translate("No discussion yet. Start the first message.")}</div> : null}
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
                      {translate('Jump to latest · New: {count}', { count: classroomNewMessages })}
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
                      placeholder={translate("Write your question, insight, or answer...")}
                      disabled={classroomRoomBusy}
                    />
                    <div className="small muted classroom-compose-hint">{translate("Press Ctrl+Enter to send")}</div>
                    <button
                      className="primary-btn"
                      type="submit"
                      disabled={classroomRoomBusy || !classroomDiscussionDraft.trim()}
                    >
                      {translate("Send")}{' '}</button>
                  </form>
                </article>
              </div>

              <aside className="classroom-studio-side">
                <article className="panel">
                  <h3>{translate("Resource rack")}</h3>
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
                            {translate("Open")}{' '}</a>
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
                            {translate("Remove")}{' '}</button>
                        ) : null}
                      </li>
                    )})}
                    {filteredRoomResources.length === 0 ? <li>{translate("No resources yet.")}</li> : null}
                  </ul>
                </article>

                <article className="panel">
                  <h3>{translate("Announcements")}</h3>
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
                    {roomAnnouncements.length === 0 ? <li>{translate("No announcements.")}</li> : null}
                  </ul>
                </article>

                <article className="panel">
                  <h3>{translate("Participants")}</h3>
                  <ul className="list">
                    {roomMembers.map((member) => (
                      <li key={member.id}>
                        <div className="row between">
                          <strong>{member.contact?.display_name || member.contact?.email || member.contact_id}</strong>
                          <span className="status">{member.role}</span>
                        </div>
                      </li>
                    ))}
                    {roomMembers.length === 0 ? <li>{translate("No participants yet.")}</li> : null}
                  </ul>
                </article>

                {canManageResources ? (
                  <article className="panel">
                    <h3>{translate("Teacher tools: add resource")}</h3>
                    <form className="chat-compose" onSubmit={submitClassroomResource}>
                      <input
                        className="input"
                        value={classroomResourceForm.title}
                        onChange={(event) => setClassroomResourceForm((prev) => ({ ...prev, title: event.target.value }))}
                        placeholder={translate("Resource title")}
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
                        {CLASSROOM_RESOURCE_FILTERS.filter((item) => item.kind !== 'all' && item.kind !== 'video').map((item) => (
                          <option key={item.kind} value={item.kind}>
                            {translate(item.label)}
                          </option>
                        ))}
                      </select>
                      <p className="small muted">{translate("Video is added to a published lesson only when managed hosting is enabled for this academy.")}</p>
                      <div className="grid three">
                        <input
                          className="input"
                          value={classroomResourceForm.week}
                          onChange={(event) => setClassroomResourceForm((prev) => ({ ...prev, week: event.target.value }))}
                          placeholder={translate("Week (e.g. Week 1)")}
                          disabled={classroomRoomBusy}
                        />
                        <input
                          className="input"
                          value={classroomResourceForm.module}
                          onChange={(event) => setClassroomResourceForm((prev) => ({ ...prev, module: event.target.value }))}
                          placeholder={translate("Module (e.g. Geometry)")}
                          disabled={classroomRoomBusy}
                        />
                        <input
                          className="input"
                          value={classroomResourceForm.lesson}
                          onChange={(event) => setClassroomResourceForm((prev) => ({ ...prev, lesson: event.target.value }))}
                          placeholder={translate("Lesson (e.g. Vanishing Points)")}
                          disabled={classroomRoomBusy}
                        />
                      </div>
                      <input
                        className="input"
                        value={classroomResourceForm.url}
                        onChange={(event) => setClassroomResourceForm((prev) => ({ ...prev, url: event.target.value }))}
                        placeholder={translate("https://... or upload a file below")}
                        disabled={classroomRoomBusy}
                      />
                      <input
                        className="input"
                        type="file"
                        onChange={(event) =>
                          setClassroomResourceForm((prev) => ({ ...prev, file: event.target.files?.[0] ?? null }))
                        }
                        disabled={classroomRoomBusy}
                      />
                      {classroomResourceForm.file ? (
                        <div className="small muted">
                          {translate('File ready: {name} ({size} KB)', {
                            name: classroomResourceForm.file.name,
                            size: Math.round(classroomResourceForm.file.size / 1024),
                          })}
                        </div>
                      ) : null}
                      <textarea
                        className="input"
                        value={classroomResourceForm.description}
                        onChange={(event) => setClassroomResourceForm((prev) => ({ ...prev, description: event.target.value }))}
                        placeholder={translate("Description (optional)")}
                        disabled={classroomRoomBusy}
                      />
                      <div className="grid two">
                        <input
                          className="input"
                          value={classroomResourceForm.sort_order}
                          onChange={(event) => setClassroomResourceForm((prev) => ({ ...prev, sort_order: event.target.value }))}
                          placeholder={translate("Sort order")}
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
                          {translate("Published for students")}{' '}</label>
                      </div>
                      <button
                        className="primary-btn"
                        type="submit"
                        disabled={classroomRoomBusy || !classroomResourceForm.title.trim() || (!classroomResourceForm.url.trim() && !classroomResourceForm.file)}
                      >
                        {translate("Add resource")}{' '}</button>
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
                {translate("Academy landing")}{' '}</button>
              <button className="ghost-btn" type="button" onClick={() => navigate('/academies')}>
                {translate("Switch workspace")}{' '}</button>
              <button className="ghost-btn" type="button" onClick={() => void refresh()} disabled={busy}>
                {translate("Refresh")}{' '}</button>
            </div>

            <section className="market-hero">
              <div className="market-copy">
                <div className="market-eyebrow">{translate("Classroom landing")}</div>
                <h1>{translate("Classroom landing pages")}</h1>
                <p>
                  {translate('{academy}: choose a classroom, then enter the teacher management view or the student learning view through separate routes.', {
                    academy: classroomDirectoryAcademyName,
                  })}
                </p>
              </div>

              <div className="market-highlight">
                <div className="market-badge">{translate("Classroom overview")}</div>
                <div className="market-kpis">
                  <article className="market-kpi">
                    <span>{translate("Available classrooms")}</span>
                    <strong>{classroomScope.length}</strong>
                  </article>
                  <article className="market-kpi">
                    <span>{translate("Staff workspace")}</span>
                    <strong>{canManageClassroomDirectory ? 'yes' : 'no'}</strong>
                  </article>
                  <article className="market-kpi">
                    <span>{translate("Student Workplace")}</span>
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
                      <span className="small muted">{translate('Members: {count}', { count: classroom.member_count })}</span>
                      <button
                        className="small-btn"
                        type="button"
                        onClick={() => navigate(academyScopedPath(`/academy/classrooms/${classroom.id}`, classroom.academy_id))}
                      >
                        {translate("Open landing")}{' '}</button>
                    </div>
                    <div className="market-actions">
                      {teacherCanOpen ? (
                        <button
                          className="small-btn"
                          type="button"
                          onClick={() => navigate(academyScopedPath(academyOfficePathForAcademy('classrooms', classroom.id, classroom.academy_id), classroom.academy_id))}
                        >
                          {translate("Staff view")}{' '}</button>
                      ) : null}
                      {studentCanOpen ? (
                        <button
                          className="small-btn"
                          type="button"
                          onClick={() => navigate(academyScopedPath(`/academy/student/classrooms/${classroom.id}`, classroom.academy_id))}
                        >
                          {translate("Student view")}{' '}</button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              {classroomScope.length === 0 ? (
                <article className="market-card">
                  <h3>{translate("No classrooms available")}</h3>
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
                      {translate("Create classroom")}{' '}</button>
                  ) : null}
                </article>
              ) : null}
            </section>

            <section className="market-steps">
              <article className="market-step">
                <div className="market-step-index">{translate("A")}</div>
                <h3>{translate("Discover")}</h3>
                <p>{translate("Learners arrive on this classroom landing page and understand format, goals, and expectations.")}</p>
              </article>
              <article className="market-step">
                <div className="market-step-index">{translate("B")}</div>
                <h3>{translate("Choose role")}</h3>
                <p>{translate("Teachers enter operational controls, while students enter the focused study workspace.")}</p>
              </article>
              <article className="market-step">
                <div className="market-step-index">{translate("C")}</div>
                <h3>{translate("Stay aligned")}</h3>
                <p>{translate("Announcements, inbox messages, and alerts keep everyone synchronized across class cycles.")}</p>
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
    const studentAcademyName = studentAcademyId
      ? (studentAcademyById.get(studentAcademyId)?.name ?? studentAcademyId)
      : 'Academy';
    const studentNavigationGroups: WorkspaceNavigationGroup[] = [
      {
        label: 'Learning',
        items: [
          {
            id: 'academies', label: 'Switch workspace', icon: <Building2 size={17} />, active: isAcademyDirectory,
            onSelect: () => navigate('/academies'),
          },
          {
            id: 'student-today', label: 'Today', icon: <LayoutDashboard size={17} />, active: studentPortalView === 'academy',
            onSelect: () => navigate(academyScopedPath('/academy/student', studentAcademyId)),
          },
          {
            id: 'student-classrooms', label: 'My classrooms', icon: <BookOpenCheck size={17} />,
            active: studentPortalView === 'classrooms' || Boolean(studentClassroomId),
            onSelect: () => navigate(academyScopedPath('/academy/student/classrooms', studentAcademyId)),
            onPrepare: () => { void loadStudentClassroomView().catch(() => undefined); },
          },
        ],
      },
      {
        label: 'Connect',
        items: [
          {
            id: 'student-messages', label: 'Messages', icon: <MessageSquare size={17} />, active: studentPortalView === 'messages',
            onSelect: () => navigate(academyScopedPath('/academy/student/messages', studentAcademyId)),
            badge: studentMessagesFiltered.length,
          },
          {
            id: 'student-alerts', label: 'Alerts', icon: <Bell size={17} />, active: studentPortalView === 'alerts',
            onSelect: () => navigate(academyScopedPath('/academy/student/alerts', studentAcademyId)),
            badge: openAlertsCount,
          },
        ],
      },
      {
        label: 'Account',
        items: [{
          id: 'student-access', label: 'Tuition & access', icon: <KeyRound size={17} />, active: studentPortalView === 'access',
          onSelect: () => navigate(academyScopedPath('/academy/student/access', studentAcademyId)),
        }],
      },
    ];

    return (
      <>
        <div className="ts-shell">
          <WorkspaceNavigation
            title={translate("Student Workspace")}
            subtitle={studentAcademyName}
            roleLabel={translate("Student")}
            contextLabel={translate("Learning, messages, and account")}
            mark={<GraduationCap size={22} />}
            groups={studentNavigationGroups}
            platformUrl={platformUrl}
          />
          <main className="ts-main">
            <header className="ts-topbar">
              <div>
                <h1>{translate(selectedViewLabel)}</h1>
                <p className="muted">
                  {studentAcademyId
                    ? (studentAcademyById.get(studentAcademyId)?.name ?? studentAcademyId)
                    : 'No linked academy'}
                </p>
              </div>
              <div className="topbar-actions">
                <UpdatesButton variant="inline" />
                <button className="ghost-btn" type="button" onClick={() => void refresh()} disabled={busy}>
                  <RefreshCw size={16} />
                  {translate("Refresh")}{' '}</button>
                <button className="ghost-btn" type="button" onClick={() => void signOut()}>
                  <LogOut size={16} />
                  {translate("Sign out")}{' '}</button>
              </div>
            </header>

            {error ? <div className="error-banner">{translate(error)}</div> : null}
            {notice ? <div className="info-banner">{translate(notice)}</div> : null}

            {studentPortalView === 'academy' ? (
              <StudentHomeView
                academyName={studentAcademyName}
                classrooms={studentClassrooms}
                announcements={studentAnnouncementsFiltered}
                messages={studentMessagesFiltered}
                alerts={studentAlertsFiltered}
                payments={studentPaymentsFiltered}
                onOpenClassroom={(classroom) => navigate(academyScopedPath(`/academy/student/classrooms/${classroom.id}`, classroom.academy_id))}
                onNavigate={(view) => navigate(academyScopedPath(`/academy/student/${view}`, studentAcademyId))}
                formatDate={formatDate}
              />
            ) : null}

            {studentClassroomId ? (
              <LazyRouteBoundary fallback={<WorkspaceSectionSkeleton />}>
                <StudentClassroomView
                  classroom={selectedStudentClassroom}
                  academyName={selectedStudentAcademyName}
                  memberships={selectedStudentMemberships}
                  announcements={selectedStudentAnnouncements}
                  messages={selectedStudentMessages}
                  sessions={(studentDashboard.sessions ?? []).filter((session) => session.classroom_id === studentClassroomId)}
                  formatDate={formatDate}
                  onBack={() => navigate(academyScopedPath('/academy/student/classrooms', studentAcademyId))}
                />
              </LazyRouteBoundary>
            ) : null}

            {studentPortalView === 'classrooms' ? (
              <section className="panel">
                <h3>{translate("Your classrooms")}</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{translate("Name")}</th>
                        <th>{translate("Academy")}</th>
                        <th>{translate("Role")}</th>
                        <th>{translate("Members")}</th>
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
                                {translate("Open student view")}{' '}</button>
                            </td>
                          </tr>
                        );
                      })}
                      {studentClassrooms.length === 0 ? (
                        <tr>
                          <td colSpan={5}>{translate("No classroom access yet.")}</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {studentPortalView === 'messages' ? (
              <section className="panel">
                <h3>{translate("Message timeline")}</h3>
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
                  {studentMessagesFiltered.length === 0 ? <li>{translate("No messages yet.")}</li> : null}
                </ul>
              </section>
            ) : null}

            {studentPortalView === 'alerts' ? (
              <section className="panel">
                <h3>{translate("Alerts")}</h3>
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
                  {studentAlertsFiltered.length === 0 ? <li>{translate("No alerts.")}</li> : null}
                </ul>
              </section>
            ) : null}

            {studentPortalView === 'access' ? (
              <section className="grid two">
                <div className="panel">
                  <h3>{translate("Your entitlements")}</h3>
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
                          <div className="small muted">{translate('Access active until: {date}', {
                            date: formatDate(entitlement.expires_at),
                          })}</div>
                        </li>
                      );
                    })}
                    {studentDashboard.entitlements.length === 0 ? <li>{translate("No access grants yet.")}</li> : null}
                  </ul>
                </div>

                <div className="panel">
                  <h3>{translate("Payments")}</h3>
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
                    {studentPaymentsFiltered.length === 0 ? <li>{translate("No payments found.")}</li> : null}
                  </ul>
                </div>
              </section>
            ) : null}
          </main>
        </div>
      </>
    );
  }

  if (!isTeacherWorkspaceRoute) {
    const entryStaffAcademy = teacherDirectoryAcademies.find((academy) => academy.id === requestedAcademyId)
      ?? teacherDirectoryAcademies[0]
      ?? null;
    const entryAccess = entryStaffAcademy?.access ?? (entryStaffAcademy ? buildFallbackAccess(entryStaffAcademy.role) : null);
    const entryRole = entryStaffAcademy ? accessRoleLabel(entryAccess) : hasStudentAccess ? 'Student' : 'Academy member';
    const entryShell = entryStaffAcademy
      ? officeShellLabel(entryAccess, officeIntentForAccess(entryAccess)).title
      : hasStudentAccess ? 'Student Workspace' : 'Switch workspace';
    return (
      <>
        <div className="ts-loading">
          <div className="auth-card">
            <div className="market-eyebrow">{translate('Signed in as {role}', { role: translate(entryRole) })}</div>
            <h2>{translate('Opening {workspace}', { workspace: translate(entryShell) })}</h2>
            <p>{translate("We found your Academy access and are taking you to the workspace for your role.")}</p>
          </div>
        </div>
        <UpdatesButton />
      </>
    );
  }

  const officeNavItem = (
    view: OfficeView,
    label: string,
    icon: ReactNode,
    badge?: number,
  ): WorkspaceNavigationItem | null => officeCanOpen(view) ? {
    id: view,
    label,
    icon,
    active: officeView === view || (view === 'classrooms' && Boolean(officeClassroomId)),
    onSelect: () => navigate(academyScopedPath(currentOfficePath(view))),
    onPrepare: () => preloadOfficeView(view),
    badge,
  } : null;
  const visibleNavItems = (items: Array<WorkspaceNavigationItem | null>): WorkspaceNavigationItem[] =>
    items.filter((item): item is WorkspaceNavigationItem => Boolean(item));
  const todayNav = officeNavItem('today', officeRouteIntent === 'teacher' ? 'Teaching today' : 'Today', <LayoutDashboard size={17} />);
  const classroomNav = officeNavItem(
    'classrooms',
    officeLaneViewLabel('classrooms', officeRouteIntent, academyHomeLabel, osCenterLabel),
    <BookOpenCheck size={17} />,
  );
  const contactsNav = officeNavItem(
    'contacts',
    officeLaneViewLabel('contacts', officeRouteIntent, academyHomeLabel, osCenterLabel),
    <UsersRound size={17} />,
  );
  const inboxNav = officeNavItem(
    'inbox',
    officeRouteIntent === 'teacher' ? 'Student inbox' : 'Messages',
    <MessageSquare size={17} />,
  );
  const osNav = officeNavItem(
    'os',
    officeRouteIntent === 'teacher' ? 'Teaching queue' : 'Education OS',
    <Sparkles size={17} />,
  );
  const financeView: OfficeView = canManageFinance ? 'payments' : 'commercial';
  const financeNav = officeNavItem(financeView, 'Finance', <CreditCard size={17} />);
  const staffNavigationGroups: WorkspaceNavigationGroup[] = [
    {
      label: 'Workspace',
      items: visibleNavItems([
        {
          id: 'academies',
          label: 'Switch workspace',
          icon: <Building2 size={17} />,
          active: isAcademyDirectory,
          onSelect: () => navigate('/academies'),
        },
        todayNav,
        classroomNav,
        contactsNav,
        officeRouteIntent === 'admin' || officeRouteIntent === 'center' ? financeNav : null,
        officeRouteIntent === 'teacher' ? osNav : inboxNav,
      ]),
    },
    {
      label: officeRouteIntent === 'teacher' ? 'Class communication' : 'Daily operations',
      items: visibleNavItems([
        officeRouteIntent === 'teacher' ? inboxNav : osNav,
        officeNavItem('alerts', 'Alerts', <ShieldAlert size={17} />, alerts.filter((alert) => !alert.resolved).length),
        officeNavItem('announcements', 'Announcements', <Megaphone size={17} />),
        officeRouteIntent === 'office' ? financeNav : null,
      ]),
    },
    {
      label: officeRouteIntent === 'teacher' ? 'More' : 'Manage',
      items: visibleNavItems([
        officeNavItem('academy', academyHomeLabel, <Store size={17} />),
        officeNavItem('business', 'Admissions', <UsersRound size={17} />),
        financeView === 'commercial' ? null : officeNavItem('commercial', 'Plans & billing', <ReceiptText size={17} />),
        officeNavItem('offers', 'Offers', <Store size={17} />),
        officeNavItem('entitlements', 'Access grants', <KeyRound size={17} />),
        officeNavItem('operations', 'Cash & payroll', <Banknote size={17} />),
        officeNavItem('academic', 'Academic operations', <CalendarDays size={17} />),
        officeNavItem('relationships', 'Guardians', <UsersRound size={17} />),
        officeNavItem('intelligence', 'Retention & insights', <BarChart3 size={17} />),
        officeNavItem('platform', 'Business platform', <Sparkles size={17} />),
      ]),
    },
  ];

  return (
    <>
      <div className="ts-shell">
        <WorkspaceNavigation
          title={translate(teacherShell.title)}
          subtitle={selectedOfficeAcademy?.name || academyId || 'Academy'}
          roleLabel={translate(accessRoleLabel(selectedAcademyAccess))}
          contextLabel={translate(teacherShell.subtitle)}
          mark={<Store size={22} />}
          groups={staffNavigationGroups}
          platformUrl={platformUrl}
        />
        <main className="ts-main">
        <header className="ts-topbar">
          <div>
            <h1>{translate(selectedViewLabel)}</h1>
            <p className="muted">
              {selectedOfficeAcademy?.name || academyId || '-'} | {translate(accessRoleLabel(selectedAcademyAccess))}
              {selectedAcademyAccess?.scope === 'assigned_classrooms'
                ? ` | ${translate(selectedAcademyAccess.classroom_ids.length === 1 ? '{count} assigned classroom' : '{count} assigned classrooms', { count: selectedAcademyAccess.classroom_ids.length })}`
                : ` | ${translate('Academy-wide')}`}
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
                  {translate('{academy} ({role})', { academy: academy.name, role: translate(academy.role) })}
                </option>
              ))}
            </select>
            <UpdatesButton variant="inline" />
            <button className="ghost-btn" type="button" onClick={() => void refresh()} disabled={busy}>
              <RefreshCw size={16} />
              {translate("Refresh")}{' '}</button>
            <button className="ghost-btn" type="button" onClick={() => void signOut()}>
              <LogOut size={16} />
              {translate("Sign out")}{' '}</button>
          </div>
        </header>

        {error ? <div className="error-banner">{translate(error)}</div> : null}
        {notice ? <div className="info-banner">{translate(notice)}</div> : null}

        <div className="workspace-route-stage" aria-busy={routeLoading}>
        {routeLoading ? (
          <div className="workspace-route-progress" role="status" aria-live="polite">
            <span className="sr-only">{translate('Updating {section}', { section: translate(selectedViewLabel) })}</span>
          </div>
        ) : null}
        {officeView === 'today' && officeCanOpen('today') ? (
          <WorkspaceHomeView
            intent={officeRouteIntent}
            academyName={selectedOfficeAcademy?.name || academyId}
            role={translate(accessRoleLabel(selectedAcademyAccess))}
            scopeLabel={selectedAcademyAccess?.scope === 'assigned_classrooms'
              ? translate(selectedAcademyAccess.classroom_ids.length === 1 ? '{count} assigned classroom' : '{count} assigned classrooms', { count: selectedAcademyAccess.classroom_ids.length })
              : translate('Academy-wide')}
            summary={summary}
            educationOS={educationOS}
            quickTargets={academyQuickTargets}
            contactsCount={contacts.length}
            classroomsCount={classrooms.length}
            openAlertsCount={alerts.filter((alert) => !alert.resolved).length}
            onOpenAction={openLmsActionItem}
            onNavigate={(path) => navigate(academyScopedPath(path))}
            formatDate={formatDate}
          />
        ) : null}

        <LazyRouteBoundary fallback={<WorkspaceSectionSkeleton />}>
        {officeView === 'academy' && officeCanOpen('academy') ? (
          <AcademyView
            academyId={academyId}
            role={translate(accessRoleLabel(selectedAcademyAccess))}
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
          <LazyRouteBoundary fallback={<WorkspaceSectionSkeleton />}>
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
          </LazyRouteBoundary>
        ) : null}
        <LazyRouteBoundary fallback={<WorkspaceSectionSkeleton />}>
          {officeView === 'business' && officeCanOpen('business') ? (
            <BusinessFoundationView academyId={academyId} formatDate={formatDate} />
          ) : null}

          {officeView === 'commercial' && officeCanOpen('commercial') ? (
            <CommercialCoreView academyId={academyId} formatDate={formatDate} />
          ) : null}

          {officeView === 'academic' && officeCanOpen('academic') ? (
            <AcademicOperationsView academyId={academyId} formatDate={formatDate} />
          ) : null}

          {officeView === 'relationships' && officeCanOpen('relationships') ? (
            <GuardianRelationshipsView academyId={academyId} formatDate={formatDate} />
          ) : null}

          {officeView === 'intelligence' && officeCanOpen('intelligence') ? (
            <IntelligenceOperationsView academyId={academyId} formatDate={formatDate} />
          ) : null}

          {officeView === 'platform' && officeCanOpen('platform') ? (
            <BusinessPlatformView academyId={academyId} formatDate={formatDate} />
          ) : null}

          {officeView === 'operations' && officeCanOpen('operations') ? (
            <OperationsFinanceView academyId={academyId} formatDate={formatDate} />
          ) : null}
        </LazyRouteBoundary>

        {officeView === 'contacts' && officeCanOpen('contacts') ? (
          <ContactsView
            busy={busy}
            form={contactForm}
            setForm={setContactForm}
            contacts={contactsCacheRef.current.get(academyId) ?? contacts}
            loading={routeLoading && !contactsCacheRef.current.has(academyId)}
            classrooms={classrooms}
            classroomMemberships={classroomMemberships}
            alerts={alerts}
            payments={payments}
            educationOS={educationOS}
            enrichmentState={contactEnrichmentState}
            onRetryEnrichment={retryContactEnrichment}
            onSubmit={submitContact}
            onOpenClassroom={(classroomId) => navigate(academyScopedPath(currentOfficePath('classrooms', classroomId)))}
            onNavigate={(destination) => navigate(academyScopedPath(currentOfficePath(destination)))}
            formatDate={formatDate}
            statusClass={statusClass}
            canManageContacts={canManageContacts}
            canViewAlerts={officeCanOpen('alerts')}
            canViewMessages={officeCanOpen('inbox')}
            canViewPayments={officeCanOpen('payments')}
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
          <LazyRouteBoundary fallback={<WorkspaceSectionSkeleton />}>
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
              canManageRoster={canManageRoster}
              educationOS={educationOS}
              onResolveActionItem={resolveLmsActionItem}
              onOpenActionItem={openLmsActionItem}
              canResolveActionItems={canResolveActionItems}
              canIssueCertificates={canIssueCertificates}
              formatDate={formatDate}
              statusClass={statusClass}
              onSetEnrollmentStatus={setClassroomEnrollmentStatus}
              onBack={() => navigate(academyScopedPath(currentOfficePath('classrooms')))}
            />
          </LazyRouteBoundary>
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
        </LazyRouteBoundary>
        </div>

        </main>
      </div>
    </>
  );
};

export default App;
