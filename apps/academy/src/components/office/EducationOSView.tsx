import { getLocaleTag, translate } from '../../i18n';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {AssignmentAudioPanel} from '../audio/AssignmentAudioPanel';
import {
  teacherStudioAssignments,
  teacherStudioAttendance,
  teacherStudioAuditEvents,
  teacherStudioBranding,
  teacherStudioBulkInvite,
  teacherStudioBulkInvites,
  teacherStudioComputeAtRisk,
  teacherStudioCreateAssignment,
  teacherStudioCurriculum,
  teacherStudioDeleteSchedule,
  teacherStudioDispatchNotifications,
  teacherStudioEducationOS,
  teacherStudioGenerateParentReport,
  teacherStudioGradebook,
  teacherStudioGradeCategories,
  teacherStudioIssueAcademyCertificate,
  teacherStudioMarkAttendance,
  teacherStudioNotifications,
  teacherStudioOwnerDashboard,
  teacherStudioRecordPlacement,
  teacherStudioReferralLeaderboard,
  teacherStudioRubrics,
  teacherStudioRemoveStaff,
  teacherStudioResolveActionItem,
  teacherStudioRunAutomationRules,
  teacherStudioSchedule,
  teacherStudioSetLifecycleStage,
  teacherStudioStaff,
  teacherStudioRoomBranches,
  teacherStudioSubmitAssignmentForContact,
  teacherStudioUpsertAutomationRule,
  teacherStudioUpsertBranding,
  teacherStudioUpdateAssignment,
  teacherStudioUpsertSchedule,
  teacherStudioUpsertStaff,
  type TeacherStudioActionItem,
  type TeacherStudioAccessProfile,
  type TeacherStudioAssignment,
  type TeacherStudioAtRiskStudent,
  type TeacherStudioAuditEvent,
  type TeacherStudioAutomationRule,
  type TeacherStudioAttendance,
  type TeacherStudioBranding,
  type TeacherStudioClassroom,
  type TeacherStudioClassroomMembership,
  type TeacherStudioContact,
  type TeacherStudioCurriculum,
  type TeacherStudioEducationOS,
  type TeacherStudioGradebook,
  type TeacherStudioGradeCategory,
  type TeacherStudioLifecycleRow,
  type TeacherStudioNotification,
  type TeacherStudioOwnerDashboard,
  type TeacherStudioReferralLeader,
  type TeacherStudioRubric,
  type TeacherStudioScheduleSlot,
  type TeacherStudioStaff,
} from '../../lib/client';
import {
  routeIntentAllowsPermission,
  type AccessPermissionKey,
  type OfficeRouteIntent,
} from '../../lib/academyAccess';
import { CurriculumView } from './CurriculumView';
import type {RoomBranch} from '../../lib/roomTimetable';
import {supabase} from '../../lib/supabase';

type EducationOSTab =
  | 'today'
  | 'pipeline'
  | 'automation'
  | 'calendar'
  | 'intelligence'
  | 'command'
  | 'learning'
  | 'attendance'
  | 'growth'
  | 'engagement'
  | 'audit'
  | 'brand';

type EducationOSMode = OfficeRouteIntent;
type EducationOSPermission = AccessPermissionKey;

type EducationOSViewProps = {
  academyId: string;
  actorId:string;
  classrooms: TeacherStudioClassroom[];
  contacts: TeacherStudioContact[];
  classroomMemberships: TeacherStudioClassroomMembership[];
  access: TeacherStudioAccessProfile | null;
  mode?: EducationOSMode;
  formatDate: (iso: string | null | undefined) => string;
  statusClass: (status: string) => string;
};

type BulkInviteRow = Awaited<ReturnType<typeof teacherStudioBulkInvites>>[number];

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SCOPED_STAFF_ROLES = new Set(['teacher', 'assistant']);
const STAFF_GRANT_ROLES = ['admin', 'center_admin', 'manager', 'counselor', 'teacher', 'assistant'];
const STAFF_GRANT_STATUSES = ['invited', 'active', 'suspended'];
const STAFF_ACCESS_LANES: Record<string, string[]> = {
  admin: ['Academy settings', 'staff grants', 'finance/offers/payments', 'schedule', 'global messages'],
  center_admin: ['Center academies', 'staff grants', 'finance/offers/payments', 'schedule', 'global messages'],
  manager: ['Contacts', 'classrooms', 'roster', 'schedule', 'messages', 'Education OS actions'],
  counselor: ['Contacts', 'classrooms', 'roster', 'schedule', 'messages', 'Education OS actions'],
  teacher: ['Assigned classrooms', 'assignments', 'gradebook', 'attendance', 'schedule', 'messages'],
  assistant: ['Assigned classrooms', 'assignments', 'gradebook', 'attendance', 'schedule', 'messages'],
};

const OS_MODE_TAB_CAPS: Record<EducationOSMode, EducationOSTab[]> = {
  office: ['today', 'pipeline', 'automation', 'calendar', 'intelligence', 'command', 'learning', 'attendance', 'growth', 'engagement', 'audit', 'brand'],
  admin: ['today', 'pipeline', 'automation', 'calendar', 'intelligence', 'command', 'learning', 'attendance', 'growth', 'engagement', 'audit', 'brand'],
  teacher: ['today', 'pipeline', 'calendar', 'intelligence', 'learning', 'attendance', 'engagement'],
  center: ['today', 'pipeline', 'automation', 'calendar', 'intelligence', 'command', 'attendance', 'growth', 'engagement', 'audit', 'brand'],
};

const EMPTY_PERMISSIONS: TeacherStudioAccessProfile['permissions'] = {};

const lifecycleStages = [
  { id: 'lead', label: 'Lead' },
  { id: 'placement', label: 'Placement' },
  { id: 'enrolled', label: 'Enrolled' },
  { id: 'learning', label: 'Learning' },
  { id: 'attention', label: 'Attention' },
  { id: 'renewal', label: 'Renewal' },
  { id: 'completion', label: 'Completion' },
];

const priorityClass = (priority: string): string => {
  if (priority === 'critical' || priority === 'high') return 'status status--bad';
  if (priority === 'medium') return 'status status--pending';
  return 'status status--ok';
};

const severityClass = (severity: string): string => {
  if (severity === 'critical' || severity === 'high') return 'status status--bad';
  if (severity === 'positive') return 'status status--ok';
  return 'status status--pending';
};

const eventTypeLabel = (type: string): string => translate(type.replace(/_/g, ' '));

const permissionAllowedByMode = (mode: EducationOSMode, permission: EducationOSPermission): boolean => {
  return routeIntentAllowsPermission(mode, permission);
};

const actionTargetTab = (sourceType: string): EducationOSTab => {
  if (['grading_backlog', 'missing_assignment'].includes(sourceType)) return 'learning';
  if (['attendance_roll_call', 'schedule_gap'].includes(sourceType)) return 'attendance';
  if (['placement_needed', 'trial_follow_up', 'renewal', 'payment', 'payment_due'].includes(sourceType)) return 'growth';
  if (['certificate_ready', 'alert', 'parent_follow_up'].includes(sourceType)) return 'engagement';
  return 'today';
};

const todayDate = (): string => new Date().toISOString().slice(0, 10);

const emptyAssignmentForm = {
  title: '',
  assignment_type: 'task',
  course_id: '',
  module_id: '',
  lesson_id: '',
  grade_category_id: '',
  rubric_id: '',
  due_at: '',
  max_score: '100',
  score_weight: '1',
  attempts_allowed: '1',
  allow_late_submission: true,
  status: 'active',
  description: '',
};

const toDatetimeLocalValue = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const contactName = (contact: Pick<TeacherStudioContact, 'first_name' | 'last_name' | 'email'> | null | undefined): string => {
  if (!contact) return 'Unknown student';
  const fullName = `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim();
  return fullName || contact.email || 'Unknown student';
};

const staffClassroomIds = (staff: TeacherStudioStaff): string[] => {
  if (Array.isArray(staff.classroom_ids)) return staff.classroom_ids.map(String);
  return [];
};

const staffRoleUsesClassroomScope = (role: string): boolean => SCOPED_STAFF_ROLES.has(role);

const auditTargetLabel = (event: TeacherStudioAuditEvent): string => {
  const parts = [event.target_type, event.target_id].filter(Boolean);
  if (event.contact_id) parts.push(`student ${event.contact_id}`);
  if (event.classroom_id) parts.push(`classroom ${event.classroom_id}`);
  return parts.join(' | ') || 'academy';
};

const auditMetadataSummary = (metadata: TeacherStudioAuditEvent['metadata']): string => {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') return '';
  const entries = Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined && typeof value !== 'object')
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`);
  return entries.join(' | ');
};

const staffStatus = (staff: TeacherStudioStaff): string => staff.status || (staff.is_active === false ? 'suspended' : 'active');

const grantExpiryValue = (value: string | null | undefined): string => {
  if (!value) return '';
  return value.slice(0, 10);
};

const parseInviteLines = (raw: string): Array<{ first_name?: string; last_name?: string; email: string }> =>
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(',').map((part) => part.trim()).filter(Boolean);
      if (parts.length >= 3) return { first_name: parts[0], last_name: parts[1], email: parts[2] };
      if (parts.length === 2) {
        const nameParts = parts[0].split(/\s+/).filter(Boolean);
        return { first_name: nameParts[0] ?? '', last_name: nameParts.slice(1).join(' '), email: parts[1] };
      }
      return { email: parts[0] ?? line };
    })
    .filter((entry) => entry.email.includes('@'));

const defaultBrandingForm = () => ({
  display_name: '',
  tagline: '',
  logo_url: '',
  favicon_url: '',
  primary_color: '#2457ff',
  accent_color: '#13b8a6',
  custom_domain: '',
  footer_text: '',
  hide_schood_logo: false,
});

export const EducationOSView = ({
  academyId,
  actorId,
  classrooms,
  contacts,
  classroomMemberships,
  access,
  mode = 'office',
  formatDate,
  statusClass,
}: EducationOSViewProps) => {
  const [activeTab, setActiveTab] = useState<EducationOSTab>('today');
  const [audioTarget,setAudioTarget]=useState<{assignment:string;submission:string;attempt:number;name:string}|null>(null);
  const [showAllSections, setShowAllSections] = useState(false);
  const [selectedClassroomId, setSelectedClassroomId] = useState(() => classrooms[0]?.id ?? '');
  const [actionBusy, setLocalBusy] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [classroomLoading, setClassroomLoading] = useState(false);
  const [rubricLoading, setRubricLoading] = useState(false);
  const [rubricsReady, setRubricsReady] = useState(false);
  const globalRequest = useRef(0);
  const classroomRequest = useRef(0);
  const [localError, setLocalError] = useState('');
  const [localNotice, setLocalNotice] = useState('');

  const [osEngine, setOsEngine] = useState<TeacherStudioEducationOS | null>(null);
  const [dashboard, setDashboard] = useState<TeacherStudioOwnerDashboard | null>(null);
  const [rubrics, setRubrics] = useState<TeacherStudioRubric[]>([]);
  const classroomScope = `${academyId}:${selectedClassroomId}`;
  const [classroomData, setClassroomData] = useState<{
    scope: string;
    assignments: TeacherStudioAssignment[];
    curriculum: TeacherStudioCurriculum;
    categories: TeacherStudioGradeCategory[];
    gradebook: TeacherStudioGradebook | null;
    attendance: TeacherStudioAttendance[];
    schedule: TeacherStudioScheduleSlot[];
    invites: BulkInviteRow[];
  } | null>(null);
  const currentClassroomData = classroomData?.scope === classroomScope ? classroomData : null;
  const assignments = useMemo(() => currentClassroomData?.assignments ?? [], [currentClassroomData]);
  const assignmentCurriculum = useMemo(() => currentClassroomData?.curriculum ?? { courses: [], modules: [], lessons: [], classroom_courses: [] }, [currentClassroomData]);
  const gradeCategories = useMemo(() => currentClassroomData?.categories ?? [], [currentClassroomData]);
  const gradebook = currentClassroomData?.gradebook ?? null;
  const attendance = useMemo(() => currentClassroomData?.attendance ?? [], [currentClassroomData]);
  const schedule = useMemo(() => currentClassroomData?.schedule ?? [], [currentClassroomData]);
  const bulkInvites = useMemo(() => currentClassroomData?.invites ?? [], [currentClassroomData]);
  const classroomReady = Boolean(currentClassroomData);
  const localBusy = actionBusy || classroomLoading || !classroomReady;
  const gradingBusy = localBusy || rubricLoading || !rubricsReady;
  const [staff, setStaff] = useState<TeacherStudioStaff[]>([]);
  const [notifications, setNotifications] = useState<TeacherStudioNotification[]>([]);
  const [auditEvents, setAuditEvents] = useState<TeacherStudioAuditEvent[]>([]);
  const [branding, setBranding] = useState<TeacherStudioBranding | null>(null);
  const [referralLeaderboard, setReferralLeaderboard] = useState<TeacherStudioReferralLeader[]>([]);
  const [atRisk, setAtRisk] = useState<TeacherStudioAtRiskStudent[]>([]);
  const [atRiskScanned, setAtRiskScanned] = useState(0);
  const [lastShareUrl, setLastShareUrl] = useState('');

  const [assignmentForm, setAssignmentForm] = useState({ ...emptyAssignmentForm });
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [editingAssignmentId, setEditingAssignmentId] = useState('');
  const [gradeForm, setGradeForm] = useState({
    assignment_id: '',
    contact_id: '',
    score: '',
    max_score: '100',
    notes: '',
    rubric_scores: {} as Record<string, string>,
  });
  const [attendanceDate, setAttendanceDate] = useState(todayDate);
  const [attendanceDraft, setAttendanceDraft] = useState<Record<string, { status: string; notes: string }>>({});
  const attendanceDraftScope = useRef('');
  const [scheduleForm, setScheduleForm] = useState({
    day_of_week: '1',
    start_time: '',
    end_time: '',
    timezone: 'Asia/Tashkent',
    label: '',
  });
  const [inviteText, setInviteText] = useState('First, Last, student@example.com');
  const [placementForm, setPlacementForm] = useState({ contact_id: '', score: '', level: '' });
  const [staffForm, setStaffForm] = useState({
    staff_email: '',
    name: '',
    staff_role: 'teacher',
    status: 'invited',
    expires_at: '',
    scope_type:'classrooms',
    classroom_ids: [] as string[],
  });
  const [editingStaffId, setEditingStaffId] = useState('');
  const editingStaffScope = useRef<{type:string;ids:string[];expires:string|null;expiryDate:string}|null>(null);
  const [staffBranches,setStaffBranches]=useState<RoomBranch[]>([]);
  const staffActor=useRef<string|null>(null);
  useEffect(()=>{
    let current=true;
    const accept=(id:string|null)=>{
      if(!current)return;
      if(staffActor.current!==null&&staffActor.current!==id){
        setStaffForm({staff_email:'',name:'',staff_role:'teacher',status:'invited',expires_at:'',scope_type:'classrooms',classroom_ids:[]});
        setEditingStaffId('');editingStaffScope.current=null;setStaff([]);
      }
      staffActor.current=id;
    };
    void supabase.auth.getSession().then(result=>accept(result.data.session?.user.id??null));
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>accept(session?.user.id??null));
    return()=>{current=false;staffActor.current=null;data.subscription.unsubscribe();};
  },[academyId]);
  const [reportForm, setReportForm] = useState({ contact_id: '', label: 'Monthly progress report', expires_in_days: '180' });
  const [certificateForm, setCertificateForm] = useState({
    contact_id: '',
    classroom_id: '',
    exam_type: 'academy',
    overall_score: '',
    candidate_name: '',
    center_name: '',
  });
  const [brandingForm, setBrandingForm] = useState(defaultBrandingForm);

  const contactById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const classroomById = useMemo(() => new Map(classrooms.map((classroom) => [classroom.id, classroom])), [classrooms]);
  const permissions = access?.permissions ?? EMPTY_PERMISSIONS;
  const staffFormUsesResourceScope = staffForm.scope_type!=='academy';
  const staffResources = staffForm.scope_type==='branches'?staffBranches.map(row=>({id:row.id,label:row.name})):
    staffForm.scope_type==='students'?contacts.map(row=>({id:row.id,label:contactName(row)})):
    classrooms.map(row=>({id:row.id,label:row.name}));
  useEffect(()=>{
    if(!academyId||!permissions.manageStaff||staffForm.scope_type!=='branches')return;
    let current=true;
    void teacherStudioRoomBranches(academyId).then(result=>{if(current)setStaffBranches(result.branches);})
      .catch(error=>{if(current)setLocalError(error instanceof Error?error.message:String(error));});
    return ()=>{current=false;};
  },[academyId,permissions.manageStaff,staffForm.scope_type]);
  const canUse = useCallback((permission: EducationOSPermission): boolean => permissions[permission] === true, [permissions]);
  const modeCanUse = useCallback(
    (permission: EducationOSPermission): boolean => permissionAllowedByMode(mode, permission) && canUse(permission),
    [canUse, mode],
  );
  const requireRoutePermission = (permission: EducationOSPermission, label: string): boolean => {
    if (modeCanUse(permission)) return true;
    setLocalError(`${label} is not available in this Academy route.`);
    return false;
  };

  const tabCaps = OS_MODE_TAB_CAPS[mode] ?? OS_MODE_TAB_CAPS.office;
  const tabAllowedByMode = useCallback((tab: EducationOSTab): boolean => tabCaps.includes(tab), [tabCaps]);
  const tabAvailable = useCallback((tab: EducationOSTab): boolean => {
    if (!tabAllowedByMode(tab)) return false;
    if (tab === 'today' || tab === 'calendar' || tab === 'intelligence') return modeCanUse('viewEducationOS');
    if (tab === 'pipeline') return modeCanUse('viewContacts');
    if (tab === 'automation') return modeCanUse('manageAutomation');
    if (tab === 'command') return modeCanUse('manageFinance') || modeCanUse('viewReports') || modeCanUse('dispatchNotifications');
    if (tab === 'learning') return modeCanUse('manageAssignments') || modeCanUse('gradeSubmissions');
    if (tab === 'attendance') return modeCanUse('markAttendance') || modeCanUse('manageSchedule');
    if (tab === 'growth') return modeCanUse('viewReports') || modeCanUse('manageStaff') || modeCanUse('manageContacts') || modeCanUse('manageRoster');
    if (tab === 'engagement') return modeCanUse('viewEducationOS') || modeCanUse('issueCertificates') || modeCanUse('viewNotifications') || modeCanUse('viewReferrals');
    if (tab === 'audit') return modeCanUse('viewAudit');
    if (tab === 'brand') return modeCanUse('manageBranding');
    return false;
  }, [modeCanUse, tabAllowedByMode]);

  const selectedClassroom = selectedClassroomId ? classroomById.get(selectedClassroomId) ?? null : null;
  const assignmentModules = useMemo(
    () => assignmentCurriculum.modules.filter((module) => module.course_id === assignmentForm.course_id),
    [assignmentCurriculum.modules, assignmentForm.course_id],
  );
  const assignmentLessons = useMemo(
    () => assignmentCurriculum.lessons.filter((lesson) => lesson.module_id === assignmentForm.module_id),
    [assignmentCurriculum.lessons, assignmentForm.module_id],
  );

  const selectedMembers = useMemo(() => {
    if (!selectedClassroomId) return [];
    return classroomMemberships
      .filter((membership) => membership.classroom_id === selectedClassroomId && ['student', 'observer'].includes(membership.role))
      .map((membership) => ({
        membership,
        contact: contactById.get(membership.contact_id) ?? null,
      }))
      .filter((item) => item.contact);
  }, [classroomMemberships, contactById, selectedClassroomId]);

  const attendanceForDate = useMemo(() => {
    const map = new Map<string, TeacherStudioAttendance>();
    for (const record of attendance) {
      if (record.session_date === attendanceDate) map.set(record.contact_id, record);
    }
    return map;
  }, [attendance, attendanceDate]);

  const actionAllowedByRoute = useCallback((item: TeacherStudioActionItem): boolean => {
    const sourceType = item.source_type;
    const targetTab = actionTargetTab(sourceType);
    if (!tabAvailable(targetTab)) return false;
    if (['grading_backlog', 'missing_assignment'].includes(sourceType)) return modeCanUse('gradeSubmissions') || modeCanUse('manageAssignments');
    if (sourceType === 'attendance_roll_call') return modeCanUse('markAttendance');
    if (sourceType === 'schedule_gap') return modeCanUse('manageSchedule');
    if (['placement_needed', 'trial_follow_up'].includes(sourceType)) return modeCanUse('manageContacts') || modeCanUse('viewContacts');
    if (['renewal', 'payment', 'payment_due'].includes(sourceType)) return modeCanUse('manageFinance');
    if (sourceType === 'certificate_ready') return modeCanUse('issueCertificates');
    if (sourceType === 'alert') return modeCanUse('manageAlerts') || modeCanUse('resolveAlerts') || modeCanUse('viewEducationOS');
    if (sourceType === 'parent_follow_up') return modeCanUse('viewReports');
    return modeCanUse('viewEducationOS');
  }, [modeCanUse, tabAvailable]);

  const actionQueue = useMemo(
    () => (osEngine?.action_queue ?? []).filter(actionAllowedByRoute),
    [actionAllowedByRoute, osEngine?.action_queue],
  );

  const lifecycleRows = useMemo(() => {
    const canSeeFinance = modeCanUse('manageFinance');
    const canIssueCertificates = modeCanUse('issueCertificates');
    return (osEngine?.pipeline ?? []).map((row) => {
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
  }, [modeCanUse, osEngine?.pipeline]);

  const visibleLifecycleStages = useMemo(
    () =>
      lifecycleStages.filter((stage) => {
        if (stage.id === 'renewal') return modeCanUse('manageFinance') || modeCanUse('manageContacts');
        if (stage.id === 'completion') return modeCanUse('issueCertificates');
        return true;
      }),
    [modeCanUse],
  );

  const pipelineCounts = useMemo(() => {
    const counts = visibleLifecycleStages.reduce<Record<string, number>>((acc, stage) => {
      acc[stage.id] = 0;
      return acc;
    }, {});
    for (const row of lifecycleRows) {
      if (counts[row.stage] === undefined) continue;
      counts[row.stage] += 1;
    }
    return counts;
  }, [lifecycleRows, visibleLifecycleStages]);

  const automationRules = useMemo(
    () => (modeCanUse('manageAutomation') ? osEngine?.automation_rules ?? [] : []),
    [modeCanUse, osEngine?.automation_rules],
  );

  const calendarEvents = useMemo(() => (osEngine?.calendar_events ?? []).filter((event) => {
    if (!tabAvailable('calendar')) return false;
    if (event.type === 'assignment_due') return modeCanUse('manageAssignments') || modeCanUse('gradeSubmissions');
    if (event.type === 'notification') return modeCanUse('viewNotifications') || modeCanUse('dispatchNotifications');
    if (event.type === 'action') {
      const metadata = event.metadata && !Array.isArray(event.metadata) ? event.metadata as Record<string, unknown> : {};
      const sourceType = String(metadata.source_type ?? '');
      return actionAllowedByRoute({ source_type: sourceType } as TeacherStudioActionItem);
    }
    if (['payment', 'renewal'].includes(event.type)) return modeCanUse('manageFinance');
    return modeCanUse('viewEducationOS');
  }), [actionAllowedByRoute, modeCanUse, osEngine?.calendar_events, tabAvailable]);

  const highPriorityQueue = useMemo(
    () => actionQueue.filter((item) => ['critical', 'high'].includes(item.priority)),
    [actionQueue],
  );

  const intelligence = useMemo(() => (osEngine?.intelligence ?? []).filter((insight) => {
    if (!tabAvailable('intelligence')) return false;
    if (insight.id === 'high-priority-actions') return highPriorityQueue.length > 0;
    if (insight.type === 'learning') return modeCanUse('manageAssignments') || modeCanUse('gradeSubmissions');
    if (insight.type === 'attendance') return modeCanUse('markAttendance') || modeCanUse('manageSchedule');
    if (insight.type === 'growth') return modeCanUse('viewReports') || modeCanUse('manageContacts') || modeCanUse('manageRoster');
    if (insight.type === 'automation') return modeCanUse('manageAutomation');
    if (insight.type === 'completion') return modeCanUse('issueCertificates');
    if (['revenue', 'renewal', 'payment'].includes(insight.type)) return modeCanUse('manageFinance');
    return modeCanUse('viewEducationOS');
  }), [highPriorityQueue.length, modeCanUse, osEngine?.intelligence, tabAvailable]);

  const rowsByStage = useMemo(() => {
    const map = new Map<string, TeacherStudioLifecycleRow[]>();
    for (const stage of visibleLifecycleStages) map.set(stage.id, []);
    for (const row of lifecycleRows) {
      const bucket = map.get(row.stage) ?? [];
      bucket.push(row);
      map.set(row.stage, bucket);
    }
    return map;
  }, [lifecycleRows, visibleLifecycleStages]);

  const nextEvents = useMemo(
    () => calendarEvents.slice(0, 20),
    [calendarEvents],
  );

  const topInsights = useMemo(
    () => intelligence.slice(0, 6),
    [intelligence],
  );

  const selectedAssignment = useMemo(() => {
    if (assignments.length === 0) return null;
    return assignments.find((assignment) => assignment.id === selectedAssignmentId) ?? assignments[0] ?? null;
  }, [assignments, selectedAssignmentId]);

  const selectedGradeAssignment = useMemo(
    () => assignments.find((assignment) => assignment.id === gradeForm.assignment_id) ?? null,
    [assignments, gradeForm.assignment_id],
  );
  const selectedGradeRubric = useMemo(
    () => rubrics.find((rubric) => rubric.id === selectedGradeAssignment?.rubric_id) ?? null,
    [rubrics, selectedGradeAssignment?.rubric_id],
  );
  const selectedGradeRubricCriteria = useMemo(() => {
    if (!selectedGradeRubric || !Array.isArray(selectedGradeRubric.criteria)) return [];
    return selectedGradeRubric.criteria.flatMap((criterion, index) => {
      if (!criterion || typeof criterion !== 'object' || Array.isArray(criterion)) return [];
      const row = criterion as Record<string, unknown>;
      const name = String(row.name ?? row.title ?? '').trim();
      const maxPoints = Number(row.max_points ?? row.max_score ?? 0);
      if (!name || !Number.isFinite(maxPoints) || maxPoints <= 0) return [];
      return [{ id: String(row.id ?? `criterion-${index + 1}`), name, maxPoints }];
    });
  }, [selectedGradeRubric]);
  const gradeableContacts = useMemo(
    () => selectedMembers.flatMap((item) => item.contact ? [item.contact] : []),
    [selectedMembers],
  );
  const selectedGradeStudentIndex = gradeableContacts.findIndex((contact) => contact.id === gradeForm.contact_id);
  const selectAdjacentGradeStudent = (direction: -1 | 1) => {
    if (gradeableContacts.length === 0) return;
    const currentIndex = selectedGradeStudentIndex >= 0 ? selectedGradeStudentIndex : 0;
    const nextIndex = Math.min(gradeableContacts.length - 1, Math.max(0, currentIndex + direction));
    const nextContact = gradeableContacts[nextIndex];
    if (!nextContact) return;
    setGradeForm((previous) => ({ ...previous, contact_id: nextContact.id, score: '', notes: '', rubric_scores: {} }));
  };
  const markAllAttendance = (status: string) => {
    const nextDraft: Record<string, { status: string; notes: string }> = {};
    selectedMembers.forEach((item) => {
      if (!item.contact) return;
      nextDraft[item.contact.id] = {
        status,
        notes: attendanceDraft[item.contact.id]?.notes ?? '',
      };
    });
    setAttendanceDraft(nextDraft);
  };

  const assignmentDetailRows = useMemo(() => {
    if (!selectedAssignment || !gradebook) return [];
    return gradebook.rows.map((row) => ({
      row,
      submission: row.submissions[selectedAssignment.id] ?? null,
    }));
  }, [gradebook, selectedAssignment]);

  const assignmentStatusCounts = useMemo(() => {
    return assignmentDetailRows.reduce(
      (acc, item) => {
        const status = item.submission?.status ?? 'missing';
        if (status === 'graded') acc.graded += 1;
        else if (status === 'submitted') acc.submitted += 1;
        else if (status === 'late') acc.late += 1;
        else acc.missing += 1;
        return acc;
      },
      { graded: 0, submitted: 0, late: 0, missing: 0 },
    );
  }, [assignmentDetailRows]);

  const loadGlobalData = useCallback(async () => {
    if (!academyId) return;
    const request = ++globalRequest.current;
    setGlobalLoading(true);
    setRubricLoading(true);
    setLocalError('');
    try {
      const [
        osData,
        dashboardData,
        staffData,
        notificationsData,
        auditData,
        brandingData,
        referralData,
      ] = await Promise.all([
        teacherStudioEducationOS(academyId),
        modeCanUse('manageFinance') || modeCanUse('viewReports') ? teacherStudioOwnerDashboard(academyId) : Promise.resolve(null),
        modeCanUse('manageStaff') ? teacherStudioStaff(academyId) : Promise.resolve([]),
        modeCanUse('viewNotifications') ? teacherStudioNotifications(academyId) : Promise.resolve([]),
        modeCanUse('viewAudit') ? teacherStudioAuditEvents(academyId) : Promise.resolve([]),
        modeCanUse('manageBranding') ? teacherStudioBranding(academyId) : Promise.resolve(null),
        modeCanUse('viewReferrals') ? teacherStudioReferralLeaderboard(academyId) : Promise.resolve([]),
        (modeCanUse('gradeSubmissions') ? teacherStudioRubrics(academyId) : Promise.resolve([]))
          .then((data) => {
            if (request === globalRequest.current) {
              setRubrics(data);
              setRubricsReady(true);
            }
          }).finally(() => {
            if (request === globalRequest.current) setRubricLoading(false);
          }),
      ]);
      if (request !== globalRequest.current) return;
      setOsEngine(osData);
      setDashboard(dashboardData);
      setStaff(staffData);
      setNotifications(notificationsData);
      setAuditEvents(auditData);
      setBranding(brandingData);
      setReferralLeaderboard(referralData);
    } catch (err) {
      if (request === globalRequest.current) setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      if (request === globalRequest.current) setGlobalLoading(false);
    }
  }, [academyId, modeCanUse]);

  const loadClassroomData = useCallback(async () => {
    if (!academyId) return;
    const request = ++classroomRequest.current;
    setClassroomLoading(true);
    setLocalError('');
    try {
      if (selectedClassroomId) {
        const [
          assignmentData,
          gradebookData,
          attendanceData,
          scheduleData,
          inviteData,
          curriculumData,
          gradeCategoryData,
        ] = await Promise.all([
          modeCanUse('manageAssignments') ? teacherStudioAssignments(academyId, selectedClassroomId) : Promise.resolve([]),
          modeCanUse('gradeSubmissions') ? teacherStudioGradebook(academyId, selectedClassroomId) : Promise.resolve(null),
          modeCanUse('markAttendance') ? teacherStudioAttendance(academyId, selectedClassroomId) : Promise.resolve([]),
          modeCanUse('manageSchedule') ? teacherStudioSchedule(academyId, selectedClassroomId) : Promise.resolve([]),
          modeCanUse('manageRoster') ? teacherStudioBulkInvites(academyId, selectedClassroomId) : Promise.resolve([]),
          modeCanUse('manageAssignments') ? teacherStudioCurriculum(academyId, selectedClassroomId) : Promise.resolve({ courses: [], modules: [], lessons: [], classroom_courses: [] }),
          modeCanUse('gradeSubmissions') ? teacherStudioGradeCategories(academyId, selectedClassroomId) : Promise.resolve([]),
        ]);
        if (request !== classroomRequest.current) return;
        setClassroomData({ scope: classroomScope, assignments: assignmentData, gradebook: gradebookData, attendance: attendanceData, schedule: scheduleData, invites: inviteData, curriculum: curriculumData, categories: gradeCategoryData });
      } else {
        setClassroomData({ scope: classroomScope, assignments: [], gradebook: null, attendance: [], schedule: [], invites: [], curriculum: { courses: [], modules: [], lessons: [], classroom_courses: [] }, categories: [] });
      }
    } catch (err) {
      if (request === classroomRequest.current) setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      if (request === classroomRequest.current) setClassroomLoading(false);
    }
  }, [academyId, selectedClassroomId, classroomScope, modeCanUse]);

  const loadOsData = useCallback(async () => {
    await Promise.all([loadGlobalData(), loadClassroomData()]);
  }, [loadGlobalData, loadClassroomData]);

  useEffect(() => {
    if (selectedClassroomId && classrooms.some((classroom) => classroom.id === selectedClassroomId)) return;
    setSelectedClassroomId(classrooms[0]?.id ?? '');
  }, [classrooms, selectedClassroomId]);

  useEffect(() => {
    void loadGlobalData();
    return () => { globalRequest.current += 1; };
  }, [loadGlobalData]);

  useEffect(() => {
    setSelectedAssignmentId('');
    setEditingAssignmentId('');
    setAssignmentForm({ ...emptyAssignmentForm });
    setGradeForm({ assignment_id: '', contact_id: '', score: '', max_score: '100', notes: '', rubric_scores: {} });
    setAttendanceDraft({});
    setScheduleForm({ day_of_week: '1', start_time: '', end_time: '', timezone: 'Asia/Tashkent', label: '' });
  }, [classroomScope]);

  useEffect(() => {
    void loadClassroomData();
    return () => { classroomRequest.current += 1; };
  }, [loadClassroomData]);

  useEffect(() => {
    setGradeForm((previous) => ({
      ...previous,
      assignment_id: assignments.some((assignment) => assignment.id === previous.assignment_id) ? previous.assignment_id : assignments[0]?.id || '',
      contact_id: selectedMembers.some((member) => member.contact?.id === previous.contact_id) ? previous.contact_id : selectedMembers[0]?.contact?.id || '',
      max_score: previous.max_score || String(assignments[0]?.max_score ?? 100),
    }));
  }, [assignments, selectedMembers]);

  useEffect(() => {
    setPlacementForm((previous) => ({
      ...previous,
      contact_id: previous.contact_id || contacts[0]?.id || '',
    }));
    setReportForm((previous) => ({
      ...previous,
      contact_id: previous.contact_id || contacts[0]?.id || '',
    }));
    setCertificateForm((previous) => ({
      ...previous,
      contact_id: previous.contact_id || contacts[0]?.id || '',
      classroom_id: previous.classroom_id || selectedClassroomId,
    }));
  }, [contacts, selectedClassroomId]);

  useEffect(() => {
    const nextDraft: Record<string, { status: string; notes: string }> = {};
    const draftScope = `${classroomScope}:${attendanceDate}`;
    const preserveDraft = attendanceDraftScope.current === draftScope;
    attendanceDraftScope.current = draftScope;
    for (const member of selectedMembers) {
      const contactId = member.contact?.id ?? '';
      if (!contactId) continue;
      const existing = attendanceForDate.get(contactId);
      nextDraft[contactId] = {
        status: existing?.status ?? (preserveDraft ? attendanceDraft[contactId]?.status : undefined) ?? 'present',
        notes: existing?.notes ?? (preserveDraft ? attendanceDraft[contactId]?.notes : undefined) ?? '',
      };
    }
    setAttendanceDraft(nextDraft);
    // Deliberately exclude attendanceDraft to avoid erasing active edits on each select change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceForDate, selectedMembers, classroomScope, attendanceDate]);

  useEffect(() => {
    if (!branding) {
      setBrandingForm(defaultBrandingForm());
      return;
    }
    setBrandingForm({
      display_name: branding.display_name ?? '',
      tagline: branding.tagline ?? '',
      logo_url: branding.logo_url ?? '',
      favicon_url: branding.favicon_url ?? '',
      primary_color: branding.primary_color ?? '#2457ff',
      accent_color: branding.accent_color ?? '#13b8a6',
      custom_domain: branding.custom_domain ?? '',
      footer_text: branding.footer_text ?? '',
      hide_schood_logo: Boolean(branding.hide_schood_logo),
    });
  }, [branding]);

  const runAction = async (success: string, action: () => Promise<void>) => {
    setLocalBusy(true);
    setLocalError('');
    setLocalNotice('');
    try {
      await action();
      await loadOsData();
      setLocalNotice((current) => current || success);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setLocalBusy(false);
    }
  };

  const openActionTarget = (item: TeacherStudioActionItem) => {
    if (item.classroom_id) setSelectedClassroomId(item.classroom_id);
    const targetTab = actionTargetTab(item.source_type);
    setActiveTab(tabAvailable(targetTab) ? targetTab : 'today');
  };

  const resolveActionItem = async (item: TeacherStudioActionItem, status: 'resolved' | 'dismissed' | 'snoozed' | 'open') => {
    if (!academyId || !requireRoutePermission('resolveActionItems', 'Action resolution')) return;
    await runAction(status === 'open' ? 'Action item reopened.' : `Action item ${status}.`, async () => {
      await teacherStudioResolveActionItem(academyId, {
        id: item.id,
        status,
        resolution_note: status === 'resolved' ? 'Resolved from Education OS.' : null,
      });
    });
  };

  const updateLifecycleStage = async (row: TeacherStudioLifecycleRow, stage: string) => {
    if (!academyId || !stage || row.stage === stage || !requireRoutePermission('manageContacts', 'Lifecycle management')) return;
    await runAction('Lifecycle stage updated.', async () => {
      await teacherStudioSetLifecycleStage(academyId, {
        contact_id: row.contact_id,
        lifecycle_stage: stage,
      });
    });
  };

  const updateAutomationRule = async (
    rule: TeacherStudioAutomationRule,
    patch: { is_active?: boolean; channel?: 'telegram' | 'email' | 'inapp'; threshold?: number | null },
  ) => {
    if (!academyId || !requireRoutePermission('manageAutomation', 'Automation controls')) return;
    await runAction('Automation rule updated.', async () => {
      await teacherStudioUpsertAutomationRule(academyId, {
        rule_key: rule.rule_key,
        ...patch,
      });
    });
  };

  const runAutomations = async () => {
    if (!academyId || !requireRoutePermission('manageAutomation', 'Automation controls')) return;
    await runAction('Automation rules ran.', async () => {
      const result = await teacherStudioRunAutomationRules(academyId);
      setLocalNotice(
        `Automation run: ${String(result.due_queued ?? 0)} assignment, ${String(result.class_queued ?? 0)} class, ${String(result.attendance_queued ?? 0)} attendance follow-up queued.`,
      );
    });
  };

  const submitAssignment = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || localBusy || !selectedClassroomId || !requireRoutePermission('manageAssignments', 'Assignment controls')) return;
    const assignmentPayload = {
      title: assignmentForm.title.trim(),
      assignment_type: assignmentForm.assignment_type,
      course_id: assignmentForm.course_id || null,
      module_id: assignmentForm.module_id || null,
      lesson_id: assignmentForm.lesson_id || null,
      grade_category_id: assignmentForm.grade_category_id || null,
      rubric_id: assignmentForm.rubric_id || null,
      description: assignmentForm.description.trim() || null,
      due_at: assignmentForm.due_at ? new Date(assignmentForm.due_at).toISOString() : null,
      max_score: Number(assignmentForm.max_score) > 0 ? Number(assignmentForm.max_score) : null,
      score_weight: Number(assignmentForm.score_weight) > 0 ? Number(assignmentForm.score_weight) : 1,
      attempts_allowed: Math.max(1, Number(assignmentForm.attempts_allowed) || 1),
      allow_late_submission: assignmentForm.allow_late_submission,
      status: assignmentForm.status,
    };
    await runAction(editingAssignmentId ? 'Assignment updated.' : 'Assignment created.', async () => {
      if (editingAssignmentId) {
        await teacherStudioUpdateAssignment(academyId, {
          id: editingAssignmentId,
          ...assignmentPayload,
        });
      } else {
        await teacherStudioCreateAssignment(academyId, {
          classroom_id: selectedClassroomId,
          ...assignmentPayload,
        });
      }
      setEditingAssignmentId('');
      setAssignmentForm({ ...emptyAssignmentForm });
    });
  };

  const editAssignment = (assignment: TeacherStudioAssignment) => {
    setEditingAssignmentId(assignment.id);
    setAssignmentForm({
      title: assignment.title,
      assignment_type: assignment.assignment_type || 'task',
      course_id: assignment.course_id ?? '',
      module_id: assignment.module_id ?? '',
      lesson_id: assignment.lesson_id ?? '',
      grade_category_id: assignment.grade_category_id ?? '',
      rubric_id: assignment.rubric_id ?? '',
      due_at: toDatetimeLocalValue(assignment.due_at),
      max_score: assignment.max_score !== null && assignment.max_score !== undefined ? String(assignment.max_score) : '',
      score_weight: assignment.score_weight !== null && assignment.score_weight !== undefined ? String(assignment.score_weight) : '1',
      attempts_allowed: String(assignment.attempts_allowed ?? 1),
      allow_late_submission: assignment.allow_late_submission ?? true,
      status: assignment.status || 'active',
      description: assignment.description ?? '',
    });
  };

  const updateAssignmentStatus = async (assignment: TeacherStudioAssignment, status: string) => {
    if (!academyId || !requireRoutePermission('manageAssignments', 'Assignment controls')) return;
    await runAction(status === 'archived' ? 'Assignment archived.' : 'Assignment updated.', async () => {
      await teacherStudioUpdateAssignment(academyId, {
        id: assignment.id,
        status,
      });
      if (editingAssignmentId === assignment.id) setEditingAssignmentId('');
    });
  };

  const submitGrade = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || gradingBusy || !assignments.some((assignment) => assignment.id === gradeForm.assignment_id)
      || !selectedMembers.some((member) => member.contact?.id === gradeForm.contact_id)
      || !requireRoutePermission('gradeSubmissions', 'Gradebook controls')) return;
    await runAction('Grade recorded.', async () => {
      await teacherStudioSubmitAssignmentForContact(academyId, {
        assignment_id: gradeForm.assignment_id,
        contact_id: gradeForm.contact_id,
        score: Number(gradeForm.score),
        max_score: Number(gradeForm.max_score) > 0 ? Number(gradeForm.max_score) : null,
        notes: gradeForm.notes.trim() || null,
        feedback: selectedGradeRubric
          ? {
              rubric_id: selectedGradeRubric.id,
              rubric_scores: Object.fromEntries(
                selectedGradeRubricCriteria.map((criterion) => [criterion.id, Number(gradeForm.rubric_scores[criterion.id] ?? 0)]),
              ),
            }
          : undefined,
      });
      setGradeForm((previous) => ({ ...previous, score: '', notes: '', rubric_scores: {} }));
    });
  };

  const submitAttendance = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || localBusy || !selectedClassroomId || !requireRoutePermission('markAttendance', 'Attendance controls')) return;
    await runAction('Attendance saved.', async () => {
      await teacherStudioMarkAttendance(academyId, {
        classroom_id: selectedClassroomId,
        session_date: attendanceDate,
        records: Object.entries(attendanceDraft).map(([contact_id, record]) => ({
          contact_id,
          status: record.status,
          notes: record.notes.trim() || null,
        })),
      });
    });
  };

  const submitSchedule = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !selectedClassroomId || !requireRoutePermission('manageSchedule', 'Schedule controls')) return;
    await runAction('Schedule slot saved.', async () => {
      await teacherStudioUpsertSchedule(academyId, {
        classroom_id: selectedClassroomId,
        day_of_week: Number(scheduleForm.day_of_week),
        start_time: scheduleForm.start_time,
        end_time: scheduleForm.end_time.trim() || null,
        timezone: scheduleForm.timezone.trim() || 'Asia/Tashkent',
        label: scheduleForm.label.trim() || null,
      });
      setScheduleForm((previous) => ({ ...previous, start_time: '', end_time: '', label: '' }));
    });
  };

  const removeSchedule = async (id: string) => {
    if (!academyId || !requireRoutePermission('manageSchedule', 'Schedule controls')) return;
    await runAction('Schedule slot removed.', async () => {
      await teacherStudioDeleteSchedule(academyId, id);
    });
  };

  const submitInvites = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !requireRoutePermission('manageRoster', 'Roster controls')) return;
    const entries = parseInviteLines(inviteText);
    if (entries.length === 0) {
      setLocalError('Add at least one invite line with an email address.');
      return;
    }
    await runAction('Bulk invite processed.', async () => {
      const result = await teacherStudioBulkInvite(academyId, {
        classroom_id: selectedClassroomId || null,
        contacts: entries,
      });
      setLocalNotice(`Bulk invite processed: ${result.summary.ok} ok, ${result.summary.failed} failed.`);
    });
  };

  const submitPlacement = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !placementForm.contact_id || !requireRoutePermission('manageContacts', 'Placement controls')) return;
    await runAction('Placement recorded.', async () => {
      const result = await teacherStudioRecordPlacement(academyId, {
        contact_id: placementForm.contact_id,
        diagnostic_score: placementForm.score ? Number(placementForm.score) : null,
        level: placementForm.level.trim() || null,
      });
      setLocalNotice(`Placement recorded: ${result.level}. ${result.suggested_classrooms.length} classroom suggestion(s).`);
    });
  };

  const submitStaff = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !staffForm.staff_email.trim() || !requireRoutePermission('manageStaff', 'Staff controls')) return;
    const actor=staffActor.current;
    if(!actor){setLocalError('Sign in again to manage staff.');return;}
    if (staffFormUsesResourceScope && staffForm.classroom_ids.length === 0) {
      setLocalError('Choose at least one access resource.');
      return;
    }
    await runAction('Staff member saved.', async () => {
      const original=editingStaffScope.current;
      const scopeType=staffForm.scope_type;
      await teacherStudioUpsertStaff(academyId, {
        ...(editingStaffId?{id:editingStaffId}:{}),
        staff_email: staffForm.staff_email.trim(),
        name: staffForm.name.trim() || undefined,
        staff_role: staffForm.staff_role,
        status: staffForm.status,
        expires_at: original&&staffForm.expires_at===original.expiryDate?original.expires:
          staffForm.expires_at ? new Date(`${staffForm.expires_at}T23:59:59`).toISOString() : null,
        scope_type:scopeType,
        scope_ids:scopeType==='academy'?[]:staffForm.classroom_ids,
      },actor);
      setStaffForm({ staff_email: '', name: '', staff_role: 'teacher', status: 'invited', expires_at: '', scope_type:'classrooms', classroom_ids: [] });
      setEditingStaffId('');
      editingStaffScope.current=null;
    });
  };

  const editStaff = (person: TeacherStudioStaff) => {
    const role = person.role || 'teacher';
    const type=person.scope_type??(staffRoleUsesClassroomScope(role)?'classrooms':'academy');
    editingStaffScope.current={type,ids:Array.isArray(person.scope_ids)?person.scope_ids.map(String):staffClassroomIds(person),
      expires:person.expires_at??null,expiryDate:grantExpiryValue(person.expires_at)};
    setStaffForm({
      staff_email: person.email,
      name: person.display_name ?? '',
      staff_role: role,
      status: staffStatus(person) === 'revoked' ? 'invited' : staffStatus(person),
      expires_at: grantExpiryValue(person.expires_at),
      scope_type:type,
      classroom_ids:editingStaffScope.current.ids,
    });
    setEditingStaffId(person.id);
  };

  const updateStaffStatus = async (person: TeacherStudioStaff, nextStatus: string) => {
    if (!academyId || !requireRoutePermission('manageStaff', 'Staff controls')) return;
    const role = person.role || 'teacher';
    const actor=staffActor.current;
    if(!actor){setLocalError('Sign in again to manage staff.');return;}
    await runAction(nextStatus === 'active' ? 'Staff access reactivated.' : 'Staff access suspended.', async () => {
      await teacherStudioUpsertStaff(academyId, {
        id:person.id,
        staff_email: person.email,
        name: person.display_name ?? undefined,
        staff_role: role,
        status: nextStatus,
        expires_at: person.expires_at ?? null,
        ...(person.scope_type?{scope_type:person.scope_type,scope_ids:Array.isArray(person.scope_ids)?person.scope_ids.map(String):[]}:
          {classroom_ids:staffClassroomIds(person)}),
      },actor);
    });
  };

  const removeStaff = async (id: string) => {
    const actor=staffActor.current;
    if(!actor){setLocalError('Sign in again to manage staff.');return;}
    if (!academyId || !requireRoutePermission('manageStaff', 'Staff controls')) return;
    await runAction('Staff access revoked.', async () => {
      await teacherStudioRemoveStaff(academyId, id,actor);
    });
  };

  const computeAtRisk = async () => {
    if (!academyId || !requireRoutePermission('viewEducationOS', 'Risk scanning')) return;
    setLocalBusy(true);
    setLocalError('');
    setLocalNotice('');
    try {
      const result = await teacherStudioComputeAtRisk(academyId, selectedClassroomId || null);
      setAtRisk(result.at_risk ?? []);
      setAtRiskScanned(result.scanned ?? 0);
      setLocalNotice(`At-risk scan complete: ${result.at_risk.length} flagged from ${result.scanned} scanned.`);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setLocalBusy(false);
    }
  };

  const dispatchNotifications = async () => {
    if (!academyId || !requireRoutePermission('dispatchNotifications', 'Notification dispatch')) return;
    await runAction('Notification dispatch attempted.', async () => {
      await teacherStudioDispatchNotifications(academyId);
    });
  };

  const submitParentReport = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !reportForm.contact_id || !requireRoutePermission('viewReports', 'Parent reports')) return;
    await runAction('Parent report generated.', async () => {
      const result = await teacherStudioGenerateParentReport(academyId, {
        contact_id: reportForm.contact_id,
        label: reportForm.label.trim() || null,
        expires_in_days: Number(reportForm.expires_in_days) > 0 ? Number(reportForm.expires_in_days) : 180,
      });
      setLastShareUrl(result.share_url);
    });
  };

  const submitCertificate = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !certificateForm.contact_id || !requireRoutePermission('issueCertificates', 'Certificate issuing')) return;
    await runAction('Certificate issued.', async () => {
      const result = await teacherStudioIssueAcademyCertificate(academyId, {
        contact_id: certificateForm.contact_id,
        classroom_id: certificateForm.classroom_id || selectedClassroomId || null,
        exam_type: certificateForm.exam_type.trim() || 'academy',
        overall_score: certificateForm.overall_score ? Number(certificateForm.overall_score) : null,
        candidate_name: certificateForm.candidate_name.trim() || undefined,
        center_name: certificateForm.center_name.trim() || undefined,
      });
      setLastShareUrl(result.share_url);
    });
  };

  const submitBranding = async (event: FormEvent) => {
    event.preventDefault();
    if (!academyId || !requireRoutePermission('manageBranding', 'Brand controls')) return;
    await runAction('Branding saved.', async () => {
      await teacherStudioUpsertBranding(academyId, {
        display_name: brandingForm.display_name.trim() || null,
        tagline: brandingForm.tagline.trim() || null,
        logo_url: brandingForm.logo_url.trim() || null,
        favicon_url: brandingForm.favicon_url.trim() || null,
        primary_color: brandingForm.primary_color.trim() || null,
        accent_color: brandingForm.accent_color.trim() || null,
        custom_domain: brandingForm.custom_domain.trim() || null,
        footer_text: brandingForm.footer_text.trim() || null,
        hide_schood_logo: brandingForm.hide_schood_logo,
      });
    });
  };

  const canManageFinance = modeCanUse('manageFinance');
  const canViewReports = modeCanUse('viewReports');
  const canDispatchNotifications = modeCanUse('dispatchNotifications');
  const canResolveActionItems = modeCanUse('resolveActionItems');
  const financeDashboard = canManageFinance ? dashboard?.revenue ?? null : null;

  const allTabs: Array<{ id: EducationOSTab; label: string; visible: boolean }> = [
    { id: 'today', label: 'Today', visible: tabAvailable('today') },
    { id: 'pipeline', label: 'Pipeline', visible: tabAvailable('pipeline') },
    { id: 'automation', label: 'Automations', visible: tabAvailable('automation') },
    { id: 'calendar', label: 'Calendar', visible: tabAvailable('calendar') },
    { id: 'intelligence', label: 'Insights', visible: tabAvailable('intelligence') },
    { id: 'command', label: 'Command', visible: tabAvailable('command') },
    { id: 'learning', label: 'Learning', visible: tabAvailable('learning') },
    { id: 'attendance', label: 'Attendance', visible: tabAvailable('attendance') },
    { id: 'growth', label: 'Growth', visible: tabAvailable('growth') },
    { id: 'engagement', label: 'Engagement', visible: tabAvailable('engagement') },
    { id: 'audit', label: 'Audit', visible: tabAvailable('audit') },
    { id: 'brand', label: 'Brand', visible: tabAvailable('brand') },
  ];
  const coreTabIds: EducationOSTab[] = mode === 'teacher'
    ? ['today', 'calendar', 'learning', 'attendance']
    : ['today', 'calendar', 'learning', 'attendance', 'intelligence'];
  const availableTabs = allTabs.filter((tab) => tab.visible);
  const tabs = availableTabs.filter((tab) => showAllSections || coreTabIds.includes(tab.id) || tab.id === activeTab);
  const hiddenTabsCount = availableTabs.length - tabs.length;
  const visibleActiveTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : tabs[0]?.id ?? 'today';

  useEffect(() => {
    if (tabs.some((tab) => tab.id === activeTab)) return;
    setActiveTab(tabs[0]?.id ?? 'today');
  }, [activeTab, tabs]);

  return (
    <section className="grid education-os">
      <div className="panel">
        <div className="row between wrap">
          <div>
            <h3>{translate(mode === 'teacher' ? "Curriculum & grading" : "Daily operations")}</h3>
            <p className="muted">{translate(mode === 'teacher' ? "Review curriculum progress, grade student work, and complete teaching follow-ups." : "Review today's work, schedules, follow-ups, and center performance.")}</p>
          </div>
          <div className="topbar-actions">
            <select aria-label={translate("Classroom")} className="input academy-select" value={selectedClassroomId} disabled={actionBusy} onChange={(event) => setSelectedClassroomId(event.target.value)}>
              {classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name}
                </option>
              ))}
              {classrooms.length === 0 ? <option value="">{translate("No classrooms")}</option> : null}
            </select>
            <button className="ghost-btn" type="button" onClick={() => void loadOsData()} disabled={actionBusy || classroomLoading || globalLoading}>
              {translate("Refresh")}{' '}</button>
          </div>
        </div>
        <div className="segmented-row" role="tablist" aria-label={translate("Daily operations sections")}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`small-btn ${visibleActiveTab === tab.id ? 'is-active' : ''}`}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              {translate(tab.label)}
            </button>
          ))}
          {availableTabs.length > coreTabIds.length ? <button className="small-btn education-os__more-sections" type="button" aria-expanded={showAllSections} onClick={() => setShowAllSections((current) => !current)}>{translate(showAllSections ? 'Show fewer' : 'More tools')}{!showAllSections && hiddenTabsCount > 0 ? ` (${hiddenTabsCount})` : ''}</button> : null}
        </div>
      </div>

      {localError ? <div className="error-banner">{translate(localError)}</div> : null}
      {localNotice ? <div className="info-banner">{translate(localNotice)}</div> : null}
      {lastShareUrl ? (
        <div className="info-banner">
          {translate("Share link:")}{' '}<a href={lastShareUrl} target="_blank" rel="noreferrer">{lastShareUrl}</a>
        </div>
      ) : null}

      {visibleActiveTab === 'today' ? (
        <section className="grid">
          <section className="stats-grid">
            <article className="stat-card">
              <span>{translate("Open actions")}</span>
              <strong>{actionQueue.length}</strong>
            </article>
            <article className="stat-card">
              <span>{translate("Urgent")}</span>
              <strong>{highPriorityQueue.length}</strong>
            </article>
            <article className="stat-card">
              <span>{translate("Grade backlog")}</span>
              <strong>{modeCanUse('gradeSubmissions') ? actionQueue.filter((item) => item.source_type === 'grading_backlog').length : 0}</strong>
            </article>
            <article className="stat-card">
              <span>{translate("Placement gap")}</span>
              <strong>{modeCanUse('manageContacts') ? pipelineCounts.placement ?? 0 : 0}</strong>
            </article>
            {modeCanUse('issueCertificates') ? (
              <article className="stat-card">
                <span>{translate("Certificate ready")}</span>
                <strong>{lifecycleRows.filter((row) => row.certificate_ready).length}</strong>
              </article>
            ) : null}
          </section>

          <section className="grid two">
            <div className="panel">
              <div className="row between wrap">
                <div>
                  <h3>{translate("Daily action queue")}</h3>
                  <p className="small muted">{translate("Generated from the attendance, learning, lifecycle, and engagement signals available in this route.")}</p>
                </div>
                {modeCanUse('manageAutomation') ? (
                  <button className="ghost-btn" type="button" onClick={() => void runAutomations()} disabled={localBusy}>{translate("Run automations")}</button>
                ) : null}
              </div>
              <div className="os-action-list">
                {actionQueue.slice(0, 14).map((item) => (
                  <article className="os-action-card" key={item.id}>
                    <div className="row between wrap">
                      <div>
                        <span className={priorityClass(item.priority)}>{item.priority}</span>
                        <strong>{item.title}</strong>
                      </div>
                      <div className="row wrap">
                        <button className="small-btn" type="button" onClick={() => openActionTarget(item)}>{translate("Open")}</button>
                        {canResolveActionItems ? (
                          <>
                            <button className="small-btn" type="button" onClick={() => void resolveActionItem(item, 'resolved')} disabled={localBusy}>{translate("Done")}</button>
                            <button className="small-btn" type="button" onClick={() => void resolveActionItem(item, 'dismissed')} disabled={localBusy}>{translate("Dismiss")}</button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <p>{item.description}</p>
                    <div className="small muted">
                      {eventTypeLabel(item.source_type)}
                      {item.due_at ? ` | due ${formatDate(item.due_at)}` : ''}
                    </div>
                    {item.recommended_action ? <div className="small">{item.recommended_action}</div> : null}
                  </article>
                ))}
                {actionQueue.length === 0 ? <div className="empty-state">{translate("No action items right now. The OS will populate this as students, classes, assignments, and alerts move.")}</div> : null}
              </div>
            </div>

            <div className="panel">
              <h3>{translate("Operating focus")}</h3>
              <ul className="list">
                {topInsights.map((insight) => (
                  <li key={insight.id}>
                    <div className="row between">
                      <strong>{insight.title}</strong>
                      <span className={severityClass(insight.severity)}>{insight.severity}</span>
                    </div>
                    <div>{insight.detail}</div>
                    <div className="small muted">{insight.recommended_action}</div>
                  </li>
                ))}
                {topInsights.length === 0 ? <li>{translate("No intelligence signals yet.")}</li> : null}
              </ul>
              <h3>{translate("Next calendar items")}</h3>
              <ul className="list">
                {nextEvents.slice(0, 8).map((event) => (
                  <li key={event.id}>
                    <div className="row between">
                      <strong>{event.title}</strong>
                      <span className={priorityClass(event.priority)}>{eventTypeLabel(event.type)}</span>
                    </div>
                    <div className="small muted">{formatDate(event.starts_at)}</div>
                  </li>
                ))}
                {nextEvents.length === 0 ? <li>{translate("No upcoming operating events.")}</li> : null}
              </ul>
            </div>
          </section>
        </section>
      ) : null}

      {visibleActiveTab === 'pipeline' ? (
        <section className="grid education-os__pipeline">
          <section className="stats-grid education-os__pipeline-stats" aria-label={translate("Student lifecycle totals")}>
            {visibleLifecycleStages.map((stage) => (
              <article className="stat-card education-os__stage-total" key={stage.id}>
                <span>{translate(stage.label)}</span>
                <strong>{pipelineCounts[stage.id] ?? rowsByStage.get(stage.id)?.length ?? 0}</strong>
              </article>
            ))}
          </section>
          <div className="os-pipeline-board" aria-label={translate("Student lifecycle pipeline")}>
            {visibleLifecycleStages.map((stage) => (
              <section className="panel os-pipeline-column" key={stage.id}>
                <div className="row between">
                  <h3>{translate(stage.label)}</h3>
                  <span className="status">{rowsByStage.get(stage.id)?.length ?? 0}</span>
                </div>
                <div className="os-pipeline-list">
                  {(rowsByStage.get(stage.id) ?? []).slice(0, 12).map((row) => (
                    <article className="os-pipeline-card" key={row.contact_id}>
                      <div className="row between wrap">
                        <strong>{row.name}</strong>
                        <select className="input compact-input" value={row.stage} onChange={(event) => void updateLifecycleStage(row, event.target.value)} disabled={localBusy || !modeCanUse('manageContacts')}>
                          {visibleLifecycleStages.map((item) => <option key={item.id} value={item.id}>{translate(item.label)}</option>)}
                        </select>
                      </div>
                      <div className="small muted">{row.classroom_names.join(', ') || row.email || 'No classroom yet'}</div>
                      <div className="os-metric-strip">
                        <span>{translate("Score")}{' '}{row.composite_score !== null ? `${row.composite_score}%` : '-'}</span>
                        <span>{translate("Attendance")}{' '}{row.attendance_rate !== null ? `${row.attendance_rate}%` : '-'}</span>
                        <span>{translate("Missing")}{' '}{row.missing_assignments}</span>
                      </div>
                      <p className="small">{row.next_action}</p>
                    </article>
                  ))}
                  {(rowsByStage.get(stage.id) ?? []).length === 0 ? <div className="small muted">{translate("No students in this stage.")}</div> : null}
                </div>
              </section>
            ))}
          </div>
        </section>
      ) : null}

      {visibleActiveTab === 'automation' ? (
        <section className="grid">
          <div className="panel">
            <div className="row between wrap">
              <div>
                <h3>{translate("Automation rules")}</h3>
                <p className="small muted">{translate("Rules queue reminders, follow-ups, alerts, and completion actions. Dispatch still happens through the notification outbox.")}</p>
              </div>
              <button className="primary-btn" type="button" onClick={() => void runAutomations()} disabled={localBusy}>{translate("Run now")}</button>
            </div>
          </div>
          <section className="grid two">
            {automationRules.map((rule) => (
              <article className="panel os-rule-card" key={rule.id}>
                <div className="row between wrap">
                  <div>
                    <h3>{rule.name}</h3>
                    <p className="small muted">{rule.description}</p>
                  </div>
                  <label className="classroom-publish-toggle">
                    <input type="checkbox" checked={rule.is_active} onChange={(event) => void updateAutomationRule(rule, { is_active: event.target.checked })} disabled={localBusy} />
                    {rule.is_active ? 'On' : 'Off'}
                  </label>
                </div>
                <div className="grid two">
                  <label className="grid">
                    <span className="small muted">{translate("Channel")}</span>
                    <select className="input" value={rule.channel} onChange={(event) => void updateAutomationRule(rule, { channel: event.target.value as TeacherStudioAutomationRule['channel'] })} disabled={localBusy}>
                      <option value="telegram">{translate("Telegram")}</option>
                      <option value="email">{translate("Email")}</option>
                      <option value="inapp">{translate("In-app")}</option>
                    </select>
                  </label>
                  <label className="grid">
                    <span className="small muted">{translate("Threshold")}</span>
                    <input className="input" type="number" value={rule.threshold ?? ''} onChange={(event) => void updateAutomationRule(rule, { threshold: event.target.value ? Number(event.target.value) : null })} disabled={localBusy} />
                  </label>
                </div>
                <div className="small muted">
                  {translate("Last run:")}{' '}{rule.last_run_at ? formatDate(rule.last_run_at) : 'not run yet'}
                </div>
              </article>
            ))}
            {automationRules.length === 0 ? <div className="panel">{translate("No automation rules loaded yet.")}</div> : null}
          </section>
        </section>
      ) : null}

      {visibleActiveTab === 'calendar' ? (
        <section className="panel">
          <h3>{translate("Operating calendar")}</h3>
          <div className="os-agenda">
            {calendarEvents.map((event) => (
              <article className="os-agenda-item" key={event.id}>
                <div>
                  <strong>{formatDate(event.starts_at)}</strong>
                  {event.ends_at ? <div className="small muted">{translate("Ends")}{' '}{formatDate(event.ends_at)}</div> : null}
                </div>
                <div>
                  <div className="row wrap">
                    <span className={priorityClass(event.priority)}>{eventTypeLabel(event.type)}</span>
                    <strong>{event.title}</strong>
                  </div>
                  <div className="small muted">
                    {event.classroom_id ? classroomById.get(event.classroom_id)?.name ?? 'Classroom' : 'Academy-wide'}
                  </div>
                </div>
              </article>
            ))}
            {calendarEvents.length === 0 ? <div className="empty-state">{translate("No schedule slots, due dates, notifications, or action deadlines are in the OS calendar yet.")}</div> : null}
          </div>
        </section>
      ) : null}

      {visibleActiveTab === 'intelligence' ? (
        <section className="grid two">
          {intelligence.map((insight) => (
            <article className="panel os-insight-card" key={insight.id}>
              <div className="row between wrap">
                <h3>{insight.title}</h3>
                <span className={severityClass(insight.severity)}>{insight.severity}</span>
              </div>
              <p>{insight.detail}</p>
              <div className="small muted">{insight.recommended_action}</div>
              {typeof insight.metric === 'number' ? <strong className="os-insight-metric">{insight.metric}</strong> : null}
            </article>
          ))}
          {intelligence.length === 0 ? <div className="panel">{translate("No decision intelligence yet. As attendance, assignments, lifecycle, and alerts accumulate, this panel will start recommending action.")}</div> : null}
        </section>
      ) : null}

      {visibleActiveTab === 'command' ? (
        canManageFinance ? (
          <>
            <section className="stats-grid">
              <article className="stat-card">
                <span>{translate("Collected total")}</span>
                <strong>{financeDashboard ? `${financeDashboard.collected_total.toLocaleString(getLocaleTag())} ${financeDashboard.currency}` : '-'}</strong>
              </article>
              <article className="stat-card">
                <span>{translate("This month")}</span>
                <strong>{financeDashboard ? `${financeDashboard.collected_this_month.toLocaleString(getLocaleTag())} ${financeDashboard.currency}` : '-'}</strong>
              </article>
              <article className="stat-card">
                <span>{translate("Outstanding")}</span>
                <strong>{financeDashboard ? `${financeDashboard.outstanding.toLocaleString(getLocaleTag())} ${financeDashboard.currency}` : '-'}</strong>
              </article>
              <article className="stat-card">
                <span>{translate("Students")}</span>
                <strong>{dashboard?.total_students ?? contacts.length}</strong>
              </article>
              <article className="stat-card">
                <span>{translate("Classrooms")}</span>
                <strong>{dashboard?.total_classrooms ?? classrooms.length}</strong>
              </article>
            </section>

            <section className="grid two">
              <div className="panel">
                <h3>{translate("Classroom performance")}</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{translate("Classroom")}</th>
                        <th>{translate("Students")}</th>
                        <th>{translate("Assignments")}</th>
                        <th>{translate("Avg score")}</th>
                        <th>{translate("Attendance")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(dashboard?.classroom_stats ?? []).map((item) => (
                        <tr key={item.classroom_id}>
                          <td>{item.name}</td>
                          <td>{item.students}</td>
                          <td>{item.assignments}</td>
                          <td>{item.avg_score ?? '-'}</td>
                          <td>{item.attendance_rate !== null ? `${item.attendance_rate}%` : '-'}</td>
                        </tr>
                      ))}
                      {(dashboard?.classroom_stats ?? []).length === 0 ? (
                        <tr><td colSpan={5}>{translate("No classroom metrics yet.")}</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel">
                <h3>{translate("Enrollment funnel")}</h3>
                <div className="metric-list">
                  {Object.entries(dashboard?.funnel ?? {}).map(([status, count]) => (
                    <div className="metric-row" key={status}>
                      <span>{status}</span>
                      <strong>{count}</strong>
                    </div>
                  ))}
                  {!dashboard ? <div className="small muted">{translate("Loading OS dashboard...")}</div> : null}
                </div>
                <h3>{translate("Referral leaders")}</h3>
                <ul className="list">
                  {referralLeaderboard.map((leader) => (
                    <li key={leader.contact_id}>
                      <div className="row between">
                        <strong>{leader.name}</strong>
                        <span className="small muted">{leader.referrals} {translate("joined /")}{' '}{leader.enrolled} {translate("enrolled")}</span>
                      </div>
                    </li>
                  ))}
                  {referralLeaderboard.length === 0 ? <li>{translate("No referral activity yet.")}</li> : null}
                </ul>
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="stats-grid">
              <article className="stat-card">
                <span>{translate("Students")}</span>
                <strong>{dashboard?.total_students ?? contacts.length}</strong>
              </article>
              <article className="stat-card">
                <span>{translate("Classrooms")}</span>
                <strong>{dashboard?.total_classrooms ?? classrooms.length}</strong>
              </article>
              <article className="stat-card">
                <span>{translate("Open actions")}</span>
                <strong>{actionQueue.length}</strong>
              </article>
              <article className="stat-card">
                <span>{translate("Urgent")}</span>
                <strong>{highPriorityQueue.length}</strong>
              </article>
              <article className="stat-card">
                <span>{translate("Attention")}</span>
                <strong>{pipelineCounts.attention ?? lifecycleRows.filter((row) => row.stage === 'attention').length}</strong>
              </article>
            </section>

            <section className="grid two">
              <div className="panel">
                <div className="row between wrap">
                  <h3>{translate("Role action queue")}</h3>
                  {canDispatchNotifications ? (
                    <button className="ghost-btn" type="button" onClick={() => void dispatchNotifications()} disabled={localBusy}>
                      {translate("Dispatch queued")}{' '}</button>
                  ) : null}
                </div>
                <ul className="list">
                  {(highPriorityQueue.length > 0 ? highPriorityQueue : actionQueue).slice(0, 10).map((item) => (
                    <li key={item.id}>
                      <div className="row between wrap">
                        <strong>{item.title}</strong>
                        <span className={priorityClass(item.priority)}>{item.priority}</span>
                      </div>
                      <div className="small muted">{eventTypeLabel(item.source_type)}{item.due_at ? ` | due ${formatDate(item.due_at)}` : ''}</div>
                    </li>
                  ))}
                  {actionQueue.length === 0 ? <li>{translate("No tasks need your attention right now.")}</li> : null}
                </ul>
              </div>

              <div className="panel">
                <h3>{translate("Operations snapshot")}</h3>
                <div className="metric-list">
                  {visibleLifecycleStages.map((stage) => (
                    <div className="metric-row" key={stage.id}>
                      <span>{translate(stage.label)}</span>
                      <strong>{pipelineCounts[stage.id] ?? 0}</strong>
                    </div>
                  ))}
                </div>
                {canViewReports && dashboard ? (
                  <>
                    <h3>{translate("Classroom reporting")}</h3>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>{translate("Classroom")}</th>
                            <th>{translate("Students")}</th>
                            <th>{translate("Avg score")}</th>
                            <th>{translate("Attendance")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashboard.classroom_stats.slice(0, 6).map((item) => (
                            <tr key={item.classroom_id}>
                              <td>{item.name}</td>
                              <td>{item.students}</td>
                              <td>{item.avg_score ?? '-'}</td>
                              <td>{item.attendance_rate !== null ? `${item.attendance_rate}%` : '-'}</td>
                            </tr>
                          ))}
                          {dashboard.classroom_stats.length === 0 ? (
                            <tr><td colSpan={4}>{translate("No classroom metrics yet.")}</td></tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}
                {modeCanUse('viewReferrals') ? (
                  <>
                    <h3>{translate("Referral leaders")}</h3>
                    <ul className="list">
                      {referralLeaderboard.slice(0, 5).map((leader) => (
                        <li key={leader.contact_id}>
                          <div className="row between">
                            <strong>{leader.name}</strong>
                            <span className="small muted">{leader.referrals} {translate("joined /")}{' '}{leader.enrolled} {translate("enrolled")}</span>
                          </div>
                        </li>
                      ))}
                      {referralLeaderboard.length === 0 ? <li>{translate("No referral activity yet.")}</li> : null}
                    </ul>
                  </>
                ) : null}
              </div>
            </section>
          </>
        )
      ) : null}

      {visibleActiveTab === 'learning' ? (
        <section className="grid">
          <CurriculumView
            key={classroomScope}
            academyId={academyId}
            classroomId={selectedClassroomId}
            canManage={modeCanUse('manageAssignments')}
            canGrade={modeCanUse('gradeSubmissions')}
          />
          <div className="grid two">
            {modeCanUse('manageAssignments') ? (
              <div className="panel">
                <h3>{editingAssignmentId ? 'Edit assignment' : 'Create assignment'}</h3>
                <form className="grid" onSubmit={submitAssignment}>
                  <input className="input" placeholder={translate("Assignment title")} value={assignmentForm.title} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, title: event.target.value }))} required />
                  <textarea className="input" placeholder={translate("Instructions")} value={assignmentForm.description} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, description: event.target.value }))} />
                  <div className="grid three">
                    <select className="input" aria-label={translate("Assignment course")} value={assignmentForm.course_id} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, course_id: event.target.value, module_id: '', lesson_id: '' }))}>
                      <option value="">{translate("No course link")}</option>
                      {assignmentCurriculum.courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
                    </select>
                    <select className="input" aria-label={translate("Assignment module")} value={assignmentForm.module_id} disabled={!assignmentForm.course_id} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, module_id: event.target.value, lesson_id: '' }))}>
                      <option value="">{translate("No module link")}</option>
                      {assignmentModules.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}
                    </select>
                    <select className="input" aria-label={translate("Assignment lesson")} value={assignmentForm.lesson_id} disabled={!assignmentForm.module_id} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, lesson_id: event.target.value }))}>
                      <option value="">{translate("No lesson link")}</option>
                      {assignmentLessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
                    </select>
                  </div>
                  <div className="grid three">
                    <select className="input" value={assignmentForm.assignment_type} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, assignment_type: event.target.value }))}>
                      {['task', 'test', 'lab', 'reading', 'writing', 'listening', 'speaking', 'custom'].map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                    </select>
                    <input className="input" type="number" min="0" placeholder={translate("Max score")} value={assignmentForm.max_score} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, max_score: event.target.value }))} />
                    <input className="input" type="number" min="0" step="0.1" placeholder={translate("Weight")} value={assignmentForm.score_weight} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, score_weight: event.target.value }))} />
                  </div>
                  <div className="grid two">
                    <input className="input" type="datetime-local" value={assignmentForm.due_at} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, due_at: event.target.value }))} />
                    <select className="input" value={assignmentForm.status} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, status: event.target.value }))}>
                      {['draft', 'active', 'archived'].map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </div>
                  <div className="grid three">
                    <select className="input" aria-label={translate("Grade category")} value={assignmentForm.grade_category_id} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, grade_category_id: event.target.value }))}>
                      <option value="">{translate("Uncategorized grade")}</option>
                      {gradeCategories.map((category) => <option key={category.id} value={category.id}>{category.name} {translate("· weight")}{' '}{category.weight}</option>)}
                    </select>
                    <select className="input" aria-label={translate("Assignment rubric")} value={assignmentForm.rubric_id} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, rubric_id: event.target.value }))}>
                      <option value="">{translate("No rubric")}</option>
                      {rubrics.filter((rubric) => rubric.status !== 'archived').map((rubric) => <option key={rubric.id} value={rubric.id}>{rubric.title}</option>)}
                    </select>
                    <input className="input" type="number" min="1" max="100" aria-label={translate("Assignment attempts")} placeholder={translate("Attempts")} value={assignmentForm.attempts_allowed} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, attempts_allowed: event.target.value }))} />
                  </div>
                  <label className="row wrap small">
                    <input type="checkbox" checked={assignmentForm.allow_late_submission} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, allow_late_submission: event.target.checked }))} />
                    {translate("Allow late submissions after the due date")}{' '}</label>
                  <div className="row wrap">
                    <button className="primary-btn" type="submit" disabled={localBusy || !selectedClassroomId}>
                      {editingAssignmentId ? 'Update assignment' : 'Create assignment'}
                    </button>
                    {editingAssignmentId ? (
                      <button
                        className="ghost-btn"
                        type="button"
                        onClick={() => {
                          setEditingAssignmentId('');
                          setAssignmentForm({ ...emptyAssignmentForm });
                        }}
                        disabled={localBusy}
                      >
                        {translate("Cancel edit")}{' '}</button>
                    ) : null}
                  </div>
                </form>
                <ul className="list">
                  {assignments.map((assignment) => (
                    <li key={assignment.id}>
                      <div className="row between">
                        <strong>{assignment.title}</strong>
                        <span className={statusClass(assignment.status)}>{assignment.status}</span>
                      </div>
                      <div className="small muted">
                        {assignment.assignment_type}
                        {assignment.due_at ? ` | due ${formatDate(assignment.due_at)}` : ''}
                        {assignment.max_score ? ` | ${assignment.max_score} pts` : ''}
                      </div>
                      <div className="row wrap">
                        <button className="small-btn" type="button" onClick={() => editAssignment(assignment)} disabled={localBusy}>{translate("Edit")}</button>
                        <button
                          className="small-btn"
                          type="button"
                          onClick={() => void updateAssignmentStatus(assignment, assignment.status === 'archived' ? 'active' : 'archived')}
                          disabled={localBusy}
                        >
                          {assignment.status === 'archived' ? 'Reactivate' : 'Archive'}
                        </button>
                      </div>
                    </li>
                  ))}
                  {assignments.length === 0 ? <li>{translate("No assignments in this classroom yet.")}</li> : null}
                </ul>
              </div>
            ) : null}

            {modeCanUse('gradeSubmissions') ? (
              <div className="panel grading-workbench">
                <div className="section-heading">
                  <div><span className="eyebrow">{translate("Consecutive work")}</span><h3>{translate("Record grade")}</h3></div>
                  <span className="ledger-count">{selectedGradeStudentIndex >= 0 ? selectedGradeStudentIndex + 1 : 0} {translate("of")}{' '}{gradeableContacts.length}</span>
                </div>
                <form className="workspace-form grading-form" onSubmit={submitGrade}>
                  <label>{translate("Assignment")}<select className="input" value={gradeForm.assignment_id} onChange={(event) => {
                    const assignmentId = event.target.value;
                    const assignment = assignments.find((item) => item.id === assignmentId);
                    setGradeForm((prev) => ({ ...prev, assignment_id: assignmentId, score: '', max_score: String(assignment?.max_score ?? 100), rubric_scores: {} }));
                  }} required>
                    <option value="">{translate("Select assignment")}</option>
                    {assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title}</option>)}
                  </select></label>
                  <label>{translate("Student")}<select className="input" value={gradeForm.contact_id} onChange={(event) => setGradeForm((prev) => ({ ...prev, contact_id: event.target.value, score: '', notes: '', rubric_scores: {} }))} required>
                    <option value="">{translate("Select student")}</option>
                    {selectedMembers.map((item) => item.contact ? <option key={item.contact.id} value={item.contact.id}>{contactName(item.contact)}</option> : null)}
                  </select></label>
                  <div className="form-grid two-col">
                    <label>{translate("Score")}<input className="input" type="number" min="0" step="0.1" value={gradeForm.score} onChange={(event) => setGradeForm((prev) => ({ ...prev, score: event.target.value }))} required /></label>
                    <label>{translate("Maximum score")}<input className="input" type="number" min="0" step="0.1" value={gradeForm.max_score} onChange={(event) => setGradeForm((prev) => ({ ...prev, max_score: event.target.value }))} /></label>
                  </div>
                  {selectedGradeRubricCriteria.length > 0 ? (
                    <fieldset className="grid rubric-score-grid">
                      <legend>{selectedGradeRubric?.title} {translate("rubric")}</legend>
                      {selectedGradeRubricCriteria.map((criterion) => (
                        <label className="grid" key={criterion.id}>
                          <span className="small">{criterion.name} {translate("· max")}{' '}{criterion.maxPoints}</span>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            max={criterion.maxPoints}
                            step="0.1"
                            value={gradeForm.rubric_scores[criterion.id] ?? ''}
                            onChange={(event) => {
                              const rubricScores = { ...gradeForm.rubric_scores, [criterion.id]: event.target.value };
                              const total = selectedGradeRubricCriteria.reduce((sum, row) => sum + (Number(rubricScores[row.id]) || 0), 0);
                              const rubricMax = selectedGradeRubricCriteria.reduce((sum, row) => sum + row.maxPoints, 0);
                              setGradeForm((previous) => ({ ...previous, rubric_scores: rubricScores, score: String(total), max_score: String(rubricMax) }));
                            }}
                          />
                        </label>
                      ))}
                    </fieldset>
                  ) : null}
                  <label>{translate("Feedback")}{' '}<span className="optional-label">{translate("Optional")}</span><textarea className="input" placeholder={translate("Feedback the student can act on")} value={gradeForm.notes} onChange={(event) => setGradeForm((prev) => ({ ...prev, notes: event.target.value }))} /></label>
                  <div className="grading-actions">
                    <button className="ghost-btn" type="button" onClick={() => selectAdjacentGradeStudent(-1)} disabled={localBusy || selectedGradeStudentIndex <= 0}>{translate("Previous")}</button>
                    <button className="primary-btn" type="submit" disabled={gradingBusy || !gradeForm.assignment_id || !gradeForm.contact_id}>{translate("Save grade")}</button>
                    <button className="ghost-btn" type="button" onClick={() => selectAdjacentGradeStudent(1)} disabled={localBusy || selectedGradeStudentIndex < 0 || selectedGradeStudentIndex >= gradeableContacts.length - 1}>{translate("Next student")}</button>
                  </div>
                </form>
              </div>
            ) : null}
          </div>

          <div className="panel">
            <div className="row between wrap">
              <div>
                <h3>{translate("Assignment detail")}</h3>
                <p className="small muted">{translate("Inspect instructions, due date, linked task, submissions, grades, and missing students for the selected assignment.")}</p>
              </div>
              <select className="input academy-select" value={selectedAssignment?.id ?? ''} onChange={(event) => setSelectedAssignmentId(event.target.value)}>
                {assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title}</option>)}
                {assignments.length === 0 ? <option value="">{translate("No assignments")}</option> : null}
              </select>
            </div>

            {selectedAssignment ? (
              <div className="grid">
                <div className="assignment-detail-strip">
                  <article>
                    <span>{translate("Due")}</span>
                    <strong>{selectedAssignment.due_at ? formatDate(selectedAssignment.due_at) : 'No due date'}</strong>
                  </article>
                  <article>
                    <span>{translate("Type")}</span>
                    <strong>{selectedAssignment.assignment_type}</strong>
                  </article>
                  <article>
                    <span>{translate("Max score")}</span>
                    <strong>{selectedAssignment.max_score ?? '-'}</strong>
                  </article>
                  <article>
                    <span>{translate("Weight")}</span>
                    <strong>{selectedAssignment.score_weight ?? 1}</strong>
                  </article>
                  <article>
                    <span>{translate("Grade category")}</span>
                    <strong>{gradeCategories.find((category) => category.id === selectedAssignment.grade_category_id)?.name ?? 'Uncategorized'}</strong>
                  </article>
                  <article>
                    <span>{translate("Attempts")}</span>
                    <strong>{selectedAssignment.attempts_allowed ?? 1}{selectedAssignment.allow_late_submission ? ' · late allowed' : ''}</strong>
                  </article>
                </div>
                {selectedAssignment.description ? <p>{selectedAssignment.description}</p> : <p className="muted">{translate("No instructions added yet.")}</p>}
                {selectedAssignment.experience_url ? (
                  <a className="small-btn" href={selectedAssignment.experience_url} target="_blank" rel="noreferrer">{translate("Open linked task")}</a>
                ) : null}
                <div className="assignment-status-grid">
                  <article><span>{translate("Missing")}</span><strong>{assignmentStatusCounts.missing}</strong></article>
                  <article><span>{translate("Submitted")}</span><strong>{assignmentStatusCounts.submitted}</strong></article>
                  <article><span>{translate("Late")}</span><strong>{assignmentStatusCounts.late}</strong></article>
                  <article><span>{translate("Graded")}</span><strong>{assignmentStatusCounts.graded}</strong></article>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{translate("Student")}</th>
                        <th>{translate("Status")}</th>
                        <th>{translate("Score")}</th>
                        <th>{translate("Submitted")}</th>
                        <th>{translate("File")}</th>
                        <th>{translate("Feedback")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignmentDetailRows.map(({ row, submission }) => (
                        <tr key={`${selectedAssignment.id}-${row.contact_id}`}>
                          <td>
                            <strong>{`${row.first_name} ${row.last_name}`.trim() || row.email || row.contact_id}</strong>
                            <div className="small muted">{row.email || row.role}</div>
                          </td>
                          <td><span className={statusClass(submission?.status ?? 'missing')}>{submission?.status ?? 'missing'}</span></td>
                          <td>{typeof submission?.score === 'number' ? `${submission.score}/${submission.max_score ?? selectedAssignment.max_score ?? '-'}` : '-'}</td>
                          <td>{submission?.submitted_at ? formatDate(submission.submitted_at) : '-'}</td>
                          <td>{submission?.metadata&&!Array.isArray(submission.metadata)&&submission.metadata.response_kind==='audio'?<p>{translate('Latest response is a recording. Attached files are from an earlier attempt.')}</p>:null}{submission?.signed_url ? <a href={submission.signed_url} target="_blank" rel="noreferrer">{translate("Open file")}</a> : '-'}</td>
                          <td>{submission?.notes || '-'}{submission?.id?<button type="button" className="small-btn" onClick={()=>setAudioTarget({assignment:selectedAssignment.id,submission:submission.id!,attempt:submission.attempt_number??1,name:`${row.first_name} ${row.last_name}`.trim()})}>{translate('Audio feedback')}</button>:null}</td>
                        </tr>
                      ))}
                      {assignmentDetailRows.length === 0 ? <tr><td colSpan={6}>{translate("No student rows for this assignment yet.")}</td></tr> : null}
                    </tbody>
                  </table>
                </div>
                {audioTarget?.assignment===selectedAssignment.id&&assignmentDetailRows.some(item=>item.submission?.id===audioTarget.submission)?<div>
                  <button type="button" className="ghost-btn" onClick={()=>setAudioTarget(null)}>{translate('Close recordings')}</button>
                  <AssignmentAudioPanel actorId={actorId} academyId={academyId} assignmentId={audioTarget.assignment} submissionId={audioTarget.submission} expectedAttempt={audioTarget.attempt} canRecord={assignmentDetailRows.some(item=>item.submission?.id===audioTarget.submission&&(item.submission.attempt_number??1)===audioTarget.attempt)} kind="feedback" title={`${translate('Audio feedback')} · ${audioTarget.name} · ${translate('Attempt')} ${audioTarget.attempt}`}/>
                </div>:null}
              </div>
            ) : (
              <div className="empty-state">{translate("Create an assignment to see student-level submission detail.")}</div>
            )}
          </div>

          <div className="panel">
            <h3>{translate("Gradebook:")}{' '}{selectedClassroom?.name ?? 'No classroom selected'}</h3>
            <div className="table-wrap os-wide-table">
              <table>
                <thead>
                  <tr>
                    <th>{translate("Student")}</th>
                    <th>{translate("Composite")}</th>
                    {gradebook?.assignments.map((assignment) => <th key={assignment.id}>{assignment.title}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {gradebook?.rows.map((row) => (
                    <tr key={row.contact_id}>
                      <td>
                        <strong>{`${row.first_name} ${row.last_name}`.trim() || row.email || row.contact_id}</strong>
                        <div className="small muted">{row.submitted_count}/{row.total_assignments} {translate("submitted")}</div>
                      </td>
                      <td>{row.composite_score !== null ? `${row.composite_score}%` : '-'}</td>
                      {gradebook.assignments.map((assignment) => {
                        const submission = row.submissions[assignment.id];
                        return (
                          <td key={assignment.id}>
                            <span className={statusClass(submission?.status ?? 'missing')}>{submission?.status ?? 'missing'}</span>
                            <div className="small muted">
                              {typeof submission?.score === 'number' ? `${submission.score}/${submission.max_score ?? assignment.max_score ?? '-'}` : '-'}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {(!gradebook || gradebook.rows.length === 0) ? <tr><td colSpan={(gradebook?.assignments.length ?? 0) + 2}>{translate("No gradebook rows yet.")}</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {visibleActiveTab === 'attendance' ? (
        <section className="grid">
          <div className="grid two">
            {modeCanUse('markAttendance') ? (
              <div className="panel attendance-workbench">
                <div><h3>{translate("Take attendance")}</h3><p className="small muted">{translate("The current classroom roster is ready below. Mark the common state once, then change exceptions.")}</p></div>
                <form className="workspace-form attendance-form" onSubmit={submitAttendance}>
                  <div className="attendance-toolbar">
                    <label>{translate("Session date")}<input className="input" type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} /></label>
                    <div className="attendance-bulk-actions" aria-label={translate("Mark every student")}>
                      <span>{translate("Mark all")}</span>
                      {['present', 'late', 'absent', 'excused'].map((status) => (
                        <button className="small-btn" type="button" key={status} onClick={() => markAllAttendance(status)}>{status}</button>
                      ))}
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{translate("Student")}</th>
                          <th>{translate("Status")}</th>
                          <th>{translate("Notes")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedMembers.map((item) => {
                          const contact = item.contact;
                          if (!contact) return null;
                          const draft = attendanceDraft[contact.id] ?? { status: 'present', notes: '' };
                          return (
                            <tr key={contact.id}>
                              <td>{contactName(contact)}</td>
                              <td>
                                <select className="input compact-input" aria-label={`Attendance status for ${contactName(contact)}`} value={draft.status} onChange={(event) => setAttendanceDraft((prev) => ({ ...prev, [contact.id]: { ...draft, status: event.target.value } }))}>
                                  {['present', 'absent', 'late', 'excused'].map((status) => <option key={status} value={status}>{status}</option>)}
                                </select>
                              </td>
                              <td>
                                <input className="input compact-input" aria-label={`Attendance note for ${contactName(contact)}`} placeholder={translate("Add exception note")} value={draft.notes} onChange={(event) => setAttendanceDraft((prev) => ({ ...prev, [contact.id]: { ...draft, notes: event.target.value } }))} />
                              </td>
                            </tr>
                          );
                        })}
                        {selectedMembers.length === 0 ? <tr><td colSpan={3}><div className="table-empty-state"><strong>{translate("No students in this classroom")}</strong><span>{translate("Add students to the roster before taking attendance.")}</span></div></td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                  <div className="form-actions"><button className="primary-btn" type="submit" disabled={localBusy || selectedMembers.length === 0}>{translate("Save attendance")}</button></div>
                </form>
              </div>
            ) : null}

            {modeCanUse('manageSchedule') ? (
              <div className="panel">
                <h3>{translate("Weekly timetable")}</h3>
                <form className="grid labeled-form" onSubmit={submitSchedule}>
                  <div className="grid two">
                    <label>{translate("Day")}<select className="input" value={scheduleForm.day_of_week} onChange={(event) => setScheduleForm((prev) => ({ ...prev, day_of_week: event.target.value }))}>
                      {dayLabels.map((label, index) => <option key={label} value={index}>{label}</option>)}
                    </select></label>
                    <label>{translate("Time zone")}<input className="input" value={scheduleForm.timezone} onChange={(event) => setScheduleForm((prev) => ({ ...prev, timezone: event.target.value }))} /></label>
                  </div>
                  <div className="grid two">
                    <label>{translate("Starts")}<input className="input" type="time" value={scheduleForm.start_time} onChange={(event) => setScheduleForm((prev) => ({ ...prev, start_time: event.target.value }))} required /></label>
                    <label>{translate("Ends")}{' '}<span className="optional-label">{translate("Optional")}</span><input className="input" type="time" value={scheduleForm.end_time} onChange={(event) => setScheduleForm((prev) => ({ ...prev, end_time: event.target.value }))} /></label>
                  </div>
                  <label>{translate("Class label")}{' '}<span className="optional-label">{translate("Optional")}</span><input className="input" placeholder={translate("For example, IELTS B2")} value={scheduleForm.label} onChange={(event) => setScheduleForm((prev) => ({ ...prev, label: event.target.value }))} /></label>
                  <div className="form-actions"><button className="primary-btn" type="submit" disabled={localBusy || !selectedClassroomId || !scheduleForm.start_time}>{translate("Add schedule slot")}</button></div>
                </form>
                <ul className="list">
                  {schedule.map((slot) => (
                    <li key={slot.id}>
                      <div className="row between">
                        <strong>{dayLabels[slot.day_of_week] ?? slot.day_of_week} {slot.start_time}{slot.end_time ? `-${slot.end_time}` : ''}</strong>
                        <button className="small-btn" type="button" onClick={() => void removeSchedule(slot.id)} disabled={localBusy}>{translate("Remove")}</button>
                      </div>
                      <div className="small muted">{slot.label || 'Class'} | {slot.timezone}</div>
                    </li>
                  ))}
                  {schedule.length === 0 ? <li><div className="table-empty-state"><strong>{translate("No timetable slots yet")}</strong><span>{translate("Add the regular classroom time above.")}</span></div></li> : null}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {visibleActiveTab === 'growth' ? (
        <section className="grid two">
          {modeCanUse('manageRoster') ? (
            <div className="panel">
              <h3>{translate("Bulk enroll")}</h3>
              <form className="grid" onSubmit={submitInvites}>
                <textarea className="input monospaced-area" value={inviteText} onChange={(event) => setInviteText(event.target.value)} />
                <button className="primary-btn" type="submit" disabled={localBusy}>{translate("Invite and enroll")}</button>
              </form>
              <ul className="list">
                {bulkInvites.slice(0, 8).map((invite) => (
                  <li key={invite.id}>
                    <div className="row between">
                      <strong>{invite.email}</strong>
                      <span className={statusClass(invite.status)}>{invite.status}</span>
                    </div>
                    <div className="small muted">{formatDate(invite.invited_at)} {invite.error ? `| ${invite.error}` : ''}</div>
                  </li>
                ))}
                {bulkInvites.length === 0 ? <li>{translate("No bulk invite history for this classroom.")}</li> : null}
              </ul>
            </div>
          ) : null}

          {modeCanUse('manageContacts') ? (
            <div className="panel">
              <h3>{translate("Placement")}</h3>
              <form className="grid" onSubmit={submitPlacement}>
                <select className="input" value={placementForm.contact_id} onChange={(event) => setPlacementForm((prev) => ({ ...prev, contact_id: event.target.value }))}>
                  {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contactName(contact)}</option>)}
                </select>
                <div className="grid two">
                  <input className="input" type="number" min="0" max="100" placeholder={translate("Diagnostic score")} value={placementForm.score} onChange={(event) => setPlacementForm((prev) => ({ ...prev, score: event.target.value }))} />
                  <input className="input" placeholder={translate("Manual CEFR level")} value={placementForm.level} onChange={(event) => setPlacementForm((prev) => ({ ...prev, level: event.target.value.toUpperCase() }))} />
                </div>
                <button className="primary-btn" type="submit" disabled={localBusy || !placementForm.contact_id}>{translate("Record placement")}</button>
              </form>
            </div>
          ) : null}

          {modeCanUse('manageStaff') ? (
            <div className="panel">
              <h3>{translate("Staff access")}</h3>
                <p className="small muted">{translate("Choose this person’s role and the groups they can work with.")}</p>
                <form className="grid staff-form labeled-form" onSubmit={submitStaff}>
                  <label>{translate("Email")}<input className="input" type="email" autoComplete="email" value={staffForm.staff_email} onChange={(event) => setStaffForm((prev) => ({ ...prev, staff_email: event.target.value }))} required /></label>
                  <label>{translate("Display name")}{' '}<span className="optional-label">{translate("Optional")}</span><input className="input" autoComplete="name" value={staffForm.name} onChange={(event) => setStaffForm((prev) => ({ ...prev, name: event.target.value }))} /></label>
                  <label>{translate("Role")}<select className="input" value={staffForm.staff_role} onChange={(event) => setStaffForm((prev) => ({
                    ...prev,
                    staff_role: event.target.value,
                  }))}>
                    {STAFF_GRANT_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select></label>
                  <label>{translate("Where they can work")}<select className="input" value={staffForm.scope_type} onChange={event=>setStaffForm(previous=>({...previous,scope_type:event.target.value,classroom_ids:[]}))}>
                    <option value="classrooms">{translate("Classrooms")}</option><option value="branches">{translate("Branches")}</option>
                    <option value="students">{translate("Students")}</option><option value="academy">{translate("Whole Academy")}</option>
                  </select></label>
                  <label>{translate("Status")}<select className="input" value={staffForm.status} onChange={(event) => setStaffForm((prev) => ({ ...prev, status: event.target.value }))}>
                    {STAFF_GRANT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select></label>
                  <label>{translate("Expires")}{' '}<span className="optional-label">{translate("Optional")}</span><input className="input" type="date" value={staffForm.expires_at} onChange={(event) => setStaffForm((prev) => ({ ...prev, expires_at: event.target.value }))} /></label>
                  {staffFormUsesResourceScope ? (
                    <fieldset className="workspace-fieldset"><legend>{translate("Access resources")}</legend><div className="chip-grid">
                      {staffResources.map((classroom) => {
                        const checked = staffForm.classroom_ids.includes(classroom.id);
                        return (
                          <label key={classroom.id} className="classroom-publish-toggle">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => setStaffForm((prev) => ({
                                ...prev,
                                classroom_ids: event.target.checked
                                  ? [...prev.classroom_ids, classroom.id]
                                  : prev.classroom_ids.filter((id) => id !== classroom.id),
                              }))}
                            />
                            {classroom.label}
                          </label>
                        );
                      })}
                    </div></fieldset>
                  ) : null}
                  <div className="access-preview" aria-label={translate("Workspace access preview")}>
                    {(STAFF_ACCESS_LANES[staffForm.staff_role] ?? []).map((lane) => <span key={lane}>{lane}</span>)}
                  </div>
                  <div className="row gap">
                    <button className="primary-btn" type="submit" disabled={localBusy || (staffFormUsesResourceScope && staffForm.classroom_ids.length === 0)}>
                      {translate(editingStaffId ? 'Save staff access' : 'Add staff access')}
                    </button>
                    {editingStaffId ? (
                      <button className="small-btn" type="button" onClick={() => {
                        setStaffForm({ staff_email: '', name: '', staff_role: 'teacher', status: 'invited', expires_at: '', scope_type:'classrooms', classroom_ids: [] });
                        setEditingStaffId('');
                        editingStaffScope.current=null;
                      }}>
                        {translate("Clear")}{' '}</button>
                    ) : null}
                  </div>
                </form>

                <ul className="list">
                  {staff.map((person) => {
                    const status = staffStatus(person);
                    const scopeType=person.scope_type??(staffRoleUsesClassroomScope(person.role)?'classrooms':'academy');
                    const scopeIds=Array.isArray(person.scope_ids)?person.scope_ids:staffClassroomIds(person);
                    const lanes = STAFF_ACCESS_LANES[person.role] ?? [];
                    return (
                    <li key={person.id} className={status === 'revoked' ? 'muted' : ''}>
                      <div className="row between">
                        <div>
                          <strong>{person.display_name || person.email}</strong>
                          <div className="small muted">{person.email}</div>
                        </div>
                        <span className={statusClass(status)}>{status}</span>
                      </div>
                      <div className="small muted">
                        {person.role} | {scopeType==='academy'?translate('Whole Academy'):`${scopeIds.length} ${scopeType==='branches'?translate('Branches'):scopeType==='students'?translate('Students'):translate('Classrooms')}`}
                        {person.expires_at ? ` | expires ${formatDate(person.expires_at)}` : ''}
                        {person.last_used_at ? ` | last used ${formatDate(person.last_used_at)}` : ''}
                      </div>
                      <div className="access-preview compact">
                        {lanes.map((lane) => <span key={lane}>{lane}</span>)}
                      </div>
                      <div className="row gap">
                        <button className="small-btn" type="button" onClick={() => editStaff(person)} disabled={localBusy}>{translate("Edit")}</button>
                        {status === 'suspended' ? (
                          <button className="small-btn" type="button" onClick={() => void updateStaffStatus(person, 'active')} disabled={localBusy}>{translate("Reactivate")}</button>
                        ) : status !== 'revoked' ? (
                          <button className="small-btn" type="button" onClick={() => void updateStaffStatus(person, 'suspended')} disabled={localBusy}>{translate("Suspend")}</button>
                        ) : null}
                        {status !== 'revoked' ? (
                          <button className="small-btn danger-btn" type="button" onClick={() => void removeStaff(person.id)} disabled={localBusy}>{translate("Revoke")}</button>
                        ) : null}
                      </div>
                    </li>
                  );
                  })}
                  {staff.length === 0 ? <li>{translate("No staff records yet.")}</li> : null}
                </ul>
            </div>
          ) : null}

          {!modeCanUse('manageRoster') && !modeCanUse('manageContacts') && !modeCanUse('manageStaff') ? (
            <div className="panel">
              <h3>{translate("Growth reporting")}</h3>
              <div className="metric-list">
                {visibleLifecycleStages.map((stage) => (
                  <div className="metric-row" key={stage.id}>
                    <span>{translate(stage.label)}</span>
                    <strong>{pipelineCounts[stage.id] ?? 0}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {visibleActiveTab === 'engagement' ? (
        <section className="grid two">
          <div className="panel">
            <h3>{translate("Risk and notifications")}</h3>
            <div className="row wrap">
              {modeCanUse('viewEducationOS') ? (
                <button className="primary-btn" type="button" onClick={() => void computeAtRisk()} disabled={localBusy}>{translate("Compute at risk")}</button>
              ) : null}
              {modeCanUse('dispatchNotifications') ? (
                <button className="ghost-btn" type="button" onClick={() => void dispatchNotifications()} disabled={localBusy}>{translate("Dispatch queued")}</button>
              ) : null}
            </div>
            <p className="small muted">{translate("Last scan:")}{' '}{atRisk.length} {translate("flagged from")}{' '}{atRiskScanned} {translate("scanned.")}</p>
            <ul className="list">
              {atRisk.map((student) => (
                <li key={`${student.contact_id}-${student.classroom_id ?? 'academy'}`}>
                  <div className="row between">
                    <strong>{student.name}</strong>
                    <span className="status status--bad">{student.reasons.length} {translate("signal(s)")}</span>
                  </div>
                  <div className="small muted">{student.classroom_name || 'Academy'} | {student.reasons.join(', ')}</div>
                </li>
              ))}
              {atRisk.length === 0 ? <li>{translate("No at-risk results loaded.")}</li> : null}
            </ul>
            {modeCanUse('viewNotifications') ? (
              <>
                <h3>{translate("Notification outbox")}</h3>
                <ul className="list">
                  {notifications.slice(0, 10).map((notification) => (
                    <li key={notification.id}>
                      <div className="row between">
                        <strong>{notification.title || notification.type}</strong>
                        <span className={statusClass(notification.status)}>{notification.status}</span>
                      </div>
                      <div className="small muted">{notification.channel} | {formatDate(notification.scheduled_at)}</div>
                      <div>{notification.body}</div>
                    </li>
                  ))}
                  {notifications.length === 0 ? <li>{translate("No notifications queued.")}</li> : null}
                </ul>
              </>
            ) : null}
          </div>

          {modeCanUse('viewReports') || modeCanUse('issueCertificates') ? (
            <div className="panel">
            <h3>{translate("Reports and certificates")}</h3>
              {modeCanUse('viewReports') ? (
                <form className="grid" onSubmit={submitParentReport}>
                  <select className="input" value={reportForm.contact_id} onChange={(event) => setReportForm((prev) => ({ ...prev, contact_id: event.target.value }))}>
                    {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contactName(contact)}</option>)}
                  </select>
                  <div className="grid two">
                    <input className="input" value={reportForm.label} onChange={(event) => setReportForm((prev) => ({ ...prev, label: event.target.value }))} />
                    <input className="input" type="number" min="1" max="365" value={reportForm.expires_in_days} onChange={(event) => setReportForm((prev) => ({ ...prev, expires_in_days: event.target.value }))} />
                  </div>
                  <button className="primary-btn" type="submit" disabled={localBusy || !reportForm.contact_id}>{translate("Generate parent report")}</button>
                </form>
              ) : null}

              {modeCanUse('issueCertificates') ? (
                <form className="grid" onSubmit={submitCertificate}>
                  <select className="input" value={certificateForm.contact_id} onChange={(event) => setCertificateForm((prev) => ({ ...prev, contact_id: event.target.value }))}>
                    {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contactName(contact)}</option>)}
                  </select>
                  <select className="input" value={certificateForm.classroom_id} onChange={(event) => setCertificateForm((prev) => ({ ...prev, classroom_id: event.target.value }))}>
                    <option value="">{translate("Use selected classroom")}</option>
                    {classrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
                  </select>
                  <div className="grid two">
                    <input className="input" placeholder={translate("Exam type")} value={certificateForm.exam_type} onChange={(event) => setCertificateForm((prev) => ({ ...prev, exam_type: event.target.value }))} />
                    <input className="input" type="number" step="0.1" placeholder={translate("Overall score")} value={certificateForm.overall_score} onChange={(event) => setCertificateForm((prev) => ({ ...prev, overall_score: event.target.value }))} />
                  </div>
                  <input className="input" placeholder={translate("Candidate name override")} value={certificateForm.candidate_name} onChange={(event) => setCertificateForm((prev) => ({ ...prev, candidate_name: event.target.value }))} />
                  <input className="input" placeholder={translate("Center name override")} value={certificateForm.center_name} onChange={(event) => setCertificateForm((prev) => ({ ...prev, center_name: event.target.value }))} />
                  <button className="primary-btn" type="submit" disabled={localBusy || !certificateForm.contact_id}>{translate("Issue certificate")}</button>
                </form>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {visibleActiveTab === 'audit' ? (
        <section className="grid">
          <div className="panel">
            <div className="row between wrap">
              <div>
                <h3>{translate("Audit trail")}</h3>
                <p className="small muted">{translate("See who changed student records, payments and academy settings.")}</p>
              </div>
              <button className="ghost-btn" type="button" onClick={() => void loadOsData()} disabled={localBusy}>{translate("Refresh history")}</button>
            </div>
            <ul className="list audit-event-list">
              {auditEvents.map((event) => (
                <li key={event.id}>
                  <div className="row between wrap">
                    <div>
                      <strong>{event.action.replace(/\./g, ' ')}</strong>
                      <div className="small muted">{auditTargetLabel(event)}</div>
                    </div>
                    <span className={statusClass(event.status)}>{event.status}</span>
                  </div>
                  <div className="small muted">
                    {event.actor_role || 'operator'}{event.actor_user_id ? ` | ${event.actor_user_id}` : ''} | {formatDate(event.created_at)}
                  </div>
                  {auditMetadataSummary(event.metadata) ? <div className="small">{auditMetadataSummary(event.metadata)}</div> : null}
                </li>
              ))}
              {auditEvents.length === 0 ? <li>{translate("No activity recorded yet.")}</li> : null}
            </ul>
          </div>
        </section>
      ) : null}

      {visibleActiveTab === 'brand' ? (
        <section className="panel">
          <h3>{translate("White-label brand controls")}</h3>
          <form className="grid" onSubmit={submitBranding}>
            <div className="grid two">
              <input className="input" placeholder={translate("Display name")} value={brandingForm.display_name} onChange={(event) => setBrandingForm((prev) => ({ ...prev, display_name: event.target.value }))} />
              <input className="input" placeholder={translate("Tagline")} value={brandingForm.tagline} onChange={(event) => setBrandingForm((prev) => ({ ...prev, tagline: event.target.value }))} />
            </div>
            <div className="grid two">
              <input className="input" placeholder={translate("Logo URL")} value={brandingForm.logo_url} onChange={(event) => setBrandingForm((prev) => ({ ...prev, logo_url: event.target.value }))} />
              <input className="input" placeholder={translate("Favicon URL")} value={brandingForm.favicon_url} onChange={(event) => setBrandingForm((prev) => ({ ...prev, favicon_url: event.target.value }))} />
            </div>
            <div className="grid two">
              <label className="grid">
                <span className="small muted">{translate("Primary color")}</span>
                <input className="input" type="color" value={brandingForm.primary_color} onChange={(event) => setBrandingForm((prev) => ({ ...prev, primary_color: event.target.value }))} />
              </label>
              <label className="grid">
                <span className="small muted">{translate("Accent color")}</span>
                <input className="input" type="color" value={brandingForm.accent_color} onChange={(event) => setBrandingForm((prev) => ({ ...prev, accent_color: event.target.value }))} />
              </label>
            </div>
            <input className="input" placeholder={translate("Custom domain")} value={brandingForm.custom_domain} onChange={(event) => setBrandingForm((prev) => ({ ...prev, custom_domain: event.target.value }))} />
            <textarea className="input" placeholder={translate("Footer text")} value={brandingForm.footer_text} onChange={(event) => setBrandingForm((prev) => ({ ...prev, footer_text: event.target.value }))} />
            <label className="classroom-publish-toggle">
              <input type="checkbox" checked={brandingForm.hide_schood_logo} onChange={(event) => setBrandingForm((prev) => ({ ...prev, hide_schood_logo: event.target.checked }))} />
              {translate("Hide Schood logo on academy-facing pages")}{' '}</label>
            <button className="primary-btn" type="submit" disabled={localBusy}>{translate("Save branding")}</button>
          </form>
          <div className="small muted">
            {translate("Current brand record:")}{' '}{branding ? `updated ${formatDate(branding.updated_at)}` : 'not configured yet'}
          </div>
        </section>
      ) : null}
    </section>
  );
};
