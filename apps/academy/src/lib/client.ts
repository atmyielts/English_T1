import {parentRequest} from './parentRequest';
import { supabase } from './supabase';
import {staffRequest} from './staffRequest';
import type {RoomBranch,RoomTimetable} from './roomTimetable';

export type Json = Record<string, unknown> | unknown[];

export type MeResponse = {
  user: { id: string; email: string | null; role?: string | null };
  current_tenant: { id: string; name: string; slug: string; type: string } | null;
  memberships: {
    tenant_id: string;
    role: string;
    status: string;
    tenants?: { id?: string; type?: string; metadata?: Record<string, unknown> | null } | null;
  }[];
};

export type TeacherStudioAccessProfile = {
  role: string;
  source: 'tenant' | 'staff' | 'center' | string;
  scope: 'academy' | 'assigned_branches' | 'assigned_classrooms' | string;
  classroom_ids: string[];
  branch_ids: string[];
  center_tenant_id?: string | null;
  permissions: {
    viewAcademy?: boolean;
    manageAcademy?: boolean;
    manageStaff?: boolean;
    manageFinance?: boolean;
    viewFinance?: boolean;
    collectFinance?: boolean;
    adjustFinance?: boolean;
    refundFinance?: boolean;
    discountFinance?: boolean;
    reconcileFinance?: boolean;
    manageCashier?: boolean;
    viewEconomics?: boolean;
    viewPayroll?: boolean;
    calculatePayroll?: boolean;
    approvePayroll?: boolean;
    payPayroll?: boolean;
    manageOffers?: boolean;
    manageBranding?: boolean;
    manageAutomation?: boolean;
    viewAutomation?: boolean;
    viewBranches?: boolean;
    manageBranches?: boolean;
    viewAdmissions?: boolean;
    manageAdmissions?: boolean;
    assignAdmissions?: boolean;
    exportAdmissions?: boolean;
    manageTrialFeedback?: boolean;
    viewContacts?: boolean;
    manageContacts?: boolean;
    viewClassrooms?: boolean;
    manageClassrooms?: boolean;
    manageRoster?: boolean;
    manageMessages?: boolean;
    manageAnnouncements?: boolean;
    sendGlobalAnnouncements?: boolean;
    manageAlerts?: boolean;
    resolveAlerts?: boolean;
    viewEducationOS?: boolean;
    resolveActionItems?: boolean;
    manageAssignments?: boolean;
    gradeSubmissions?: boolean;
    markAttendance?: boolean;
    manageSchedule?: boolean;
    manageAcademicOperations?: boolean;
    viewRoomTimetable?: boolean;
    manageGuardians?: boolean;
    communicateGuardians?: boolean;
    manageRetention?: boolean;
    viewBusinessIntelligence?: boolean;
    viewAcademicReports?: boolean;
    viewOperationalReports?: boolean;
    viewFinancialReports?: boolean;
    viewStaffPerformance?: boolean;
    viewRisk?: boolean;
    manageImports?: boolean;
    importStudents?: boolean;
    manageLocalization?: boolean;
    useAcademyAI?: boolean;
    manageResources?: boolean;
    viewReports?: boolean;
    issueCertificates?: boolean;
    dispatchNotifications?: boolean;
    viewNotifications?: boolean;
    viewReferrals?: boolean;
    viewAudit?: boolean;
  };
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
  access?: TeacherStudioAccessProfile;
};

export type TeacherStudioSummary = {
  academy_id: string;
  access?: TeacherStudioAccessProfile;
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
  last_activity_at?: string | null;
  placement_level?: string | null;
  placement_score?: number | null;
  lifecycle_stage?: string | null;
  notify_enabled?: boolean;
  metadata: Json;
  created_at: string;
  updated_at: string;
  legacy_video_read_only?: boolean;
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
  member_count: number | null;
  roster_visible?: boolean;
};

export type TeacherStudioClassroomMembership = {
  id: string;
  academy_id: string;
  classroom_id: string;
  contact_id: string;
  role: string;
  status: 'invited' | 'active' | 'paused' | 'completed' | 'withdrawn' | 'expired' | 'transferred' | string;
  joined_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  paused_at?: string | null;
  withdrawn_at?: string | null;
  expires_at?: string | null;
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
  unallocated_amount?:number|string;
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

export type TeacherStudioAuditEvent = {
  id: string;
  academy_id: string;
  actor_user_id: string | null;
  actor_role: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  contact_id: string | null;
  classroom_id: string | null;
  status: string;
  metadata: Json;
  created_at: string;
};

export type TeacherStudioClickTuitionTransaction = {
  payment_url: string;
  transaction_id: string;
  academy_payment_id: string;
  amount: number;
  currency: string;
  final_amount: number;
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
  signed_url?: string | null;
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
    can_manage_resources: boolean;
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
  assignments?: TeacherStudioAssignment[];
  submissions?: TeacherStudioSubmission[];
  sessions?: TeacherStudioStudentSession[];
  lesson_progress?: Array<{
    id: string;
    academy_id: string;
    classroom_id: string;
    course_id: string;
    lesson_id: string;
    contact_id: string;
    status: string;
    started_at: string | null;
    completed_at: string | null;
    time_spent_seconds: number;
    updated_at: string;
  }>;
  partial_errors?: Array<{ source: string; message: string; retryable: boolean }>;
};

export type TeacherStudioStudentSession = {
  id: string;
  academy_id: string;
  classroom_id: string;
  title: string;
  session_type: string;
  delivery_mode: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: string;
  meeting_provider: string | null;
  join_available: boolean;
};

export type TeacherStudioStudentAssignment = TeacherStudioAssignment & {
  submission: TeacherStudioSubmission | null;
};

export type TeacherStudioStudentBillingItem = {
  academy_id: string;
  classroom_id: string;
  contact_id: string;
  paid: boolean;
  offer: {
    id: string;
    academy_id?: string;
    classroom_id?: string | null;
    name: string;
    price_amount: number;
    currency: string;
    duration_days?: number | null;
    description: string | null;
    is_active?: boolean;
  };
  last_payment: {
    id?: string;
    contact_id?: string;
    offer_id?: string;
    amount?: number;
    currency?: string;
    status: string;
    created_at: string;
  } | null;
};

export type TeacherStudioAssignment = {
  id: string;
  academy_id: string;
  classroom_id: string;
  course_id?: string | null;
  module_id?: string | null;
  lesson_id?: string | null;
  grade_category_id?: string | null;
  rubric_id?: string | null;
  title: string;
  description: string | null;
  assignment_type: string;
  experience_id?: string | null;
  experience_url?: string | null;
  due_at: string | null;
  released_at: string | null;
  prerequisite_id: string | null;
  position: number;
  max_score: number | null;
  score_weight: number;
  attempts_allowed?: number;
  allow_late_submission?: boolean;
  status: string;
  metadata: Json;
  created_by: string | null;
  created_at: string;
  updated_at?: string;
};

export type AcademyWalletPolicy={id:string;academy_id:string;contact_id:string;classroom_id:string;currency:string;mode:'off'|'alert'|'freeze';warning_credit:string|number;balance:string;available_credit:string;low_credit:boolean;learning_paused:boolean;reason?:string;updated_at:string};
export type TeacherStudioStudentCommercialAccount = {
  wallet_policies?:AcademyWalletPolicy[];
  academy_id: string;
  contact_id: string;
  subscriptions: AcademySubscription[];
  charges: AcademyCharge[];
  ledger_entries: AcademyLedgerEntry[];
  balances: AcademyAccountBalance[];
};

export type TeacherStudioStudentBilling = {
  items: TeacherStudioStudentBillingItem[];
  accounts: TeacherStudioStudentCommercialAccount[];
};

export type TeacherStudioCourse = {
  id: string;
  academy_id: string;
  code: string | null;
  title: string;
  description: string | null;
  level: string | null;
  estimated_minutes: number;
  status: 'draft' | 'published' | 'archived' | string;
  published_at: string | null;
  metadata: Json;
  created_at?: string;
  updated_at?: string;
};

export type TeacherStudioCourseModule = {
  id: string;
  academy_id: string;
  course_id: string;
  title: string;
  description: string | null;
  position: number;
  status: string;
  unlock_rule: Json;
  metadata: Json;
};

export type TeacherStudioLesson = {
  id: string;
  academy_id: string;
  course_id: string;
  module_id: string;
  prerequisite_lesson_id: string | null;
  title: string;
  summary: string | null;
  content: Json;
  position: number;
  estimated_minutes: number;
  status: string;
  available_from: string | null;
  completion_rule: Json;
  metadata: Json;
  locked?: boolean;
};

export type TeacherStudioClassroomCourse = {
  id: string;
  academy_id: string;
  classroom_id: string;
  course_id: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  assigned_at: string;
  metadata?: Json;
};

export type TeacherStudioCurriculum = {
  courses: TeacherStudioCourse[];
  modules: TeacherStudioCourseModule[];
  lessons: TeacherStudioLesson[];
  classroom_courses: TeacherStudioClassroomCourse[];
};

export type TeacherStudioQuiz = {
  id: string;
  academy_id: string;
  course_id: string;
  lesson_id: string | null;
  title: string;
  instructions: string | null;
  status: string;
  passing_score: number;
  attempts_allowed: number;
  time_limit_seconds: number | null;
  shuffle_questions: boolean;
  show_answers_after: boolean;
  locked?: boolean;
  metadata: Json;
};

export type TeacherStudioQuizQuestion = {
  id: string;
  academy_id?: string;
  quiz_id: string;
  question_type: 'single_choice' | 'multiple_choice' | 'true_false' | 'short_text' | 'essay' | string;
  prompt: string;
  options: unknown[];
  correct_answer?: unknown;
  points: number;
  position: number;
  explanation?: string | null;
  metadata: Json;
};

export type TeacherStudioQuizAttempt = {
  id: string;
  classroom_id: string;
  course_id: string;
  quiz_id: string;
  contact_id: string;
  attempt_number: number;
  status: string;
  result?: Json;
  score: number | null;
  max_score: number | null;
  percentage: number | null;
  passed: boolean | null;
  feedback: string | null;
  started_at: string;
  submitted_at: string | null;
  graded_at: string | null;
};

export type TeacherStudioGradeCategory = {
  id: string;
  academy_id: string;
  classroom_id: string;
  name: string;
  weight: number;
  position: number;
  drop_lowest: number;
  metadata: Json;
};

export type TeacherStudioRubric = {
  id: string;
  academy_id: string;
  title: string;
  description: string | null;
  criteria: unknown[];
  status: string;
  metadata: Json;
};

export type TeacherStudioStudentCurriculum = TeacherStudioCurriculum & {
  academy_id: string;
  classroom_id: string;
  contact_id: string;
  progress: Array<{
    id: string;
    lesson_id: string;
    status: string;
    started_at: string | null;
    completed_at: string | null;
    time_spent_seconds: number;
  }>;
  quizzes: TeacherStudioQuiz[];
  questions: TeacherStudioQuizQuestion[];
  attempts: TeacherStudioQuizAttempt[];
  media: AcademyLessonMedia[];
};

export type AcademyVideoCapability = {
  provider: string;
  provider_configured: boolean;
  global_enabled: boolean;
  academy_enabled: boolean;
  can_upload: boolean;
  reason: string | null;
  quota: {
    max_asset_duration_seconds: number;
    max_total_stored_minutes: number;
    max_monthly_upload_minutes: number;
  };
  usage: { stored_minutes: number; monthly_upload_minutes: number };
};

export type AcademyVideoAsset = {
  id: string;
  academy_id: string;
  title: string;
  status: 'reserved' | 'uploading' | 'processing' | 'ready' | 'failed' | 'blocked' | 'deleted' | string;
  duration_seconds: number | null;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
};

export type AcademyLessonMedia = {
  id: string;
  lesson_id: string;
  title: string;
  duration_seconds: number | null;
  video_asset_id: string;
  status: string;
};

export type TeacherStudioSubmission = {
  metadata?: Json;
  id: string;
  academy_id?: string;
  assignment_id: string;
  classroom_id?: string;
  contact_id: string;
  user_id?: string | null;
  session_id?: string | null;
  score: number | null;
  max_score: number | null;
  status: string;
  attempt_number?: number;
  submitted_at: string | null;
  graded_at: string | null;
  graded_by?: string | null;
  notes: string | null;
  feedback?: Json;
  submission_content?: string | null;
  submission_url?: string | null;
  signed_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type TeacherStudioGradebook = {
  classroom_id: string;
  assignments: TeacherStudioAssignment[];
  grade_categories?: TeacherStudioGradeCategory[];
  rows: Array<{
    contact_id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    status: string;
    role: string;
    submissions: Record<string, { id?:string; attempt_number?:number; score: number | null; max_score?: number | null; status: string; submitted_at?: string | null; graded_at?: string | null; notes?: string | null; feedback?: Json; submission_content?: string | null; submission_url?: string | null; signed_url?: string | null; metadata?: Json }>;
    composite_score: number | null;
    category_scores?: Record<string, number>;
    submitted_count: number;
    total_assignments: number;
  }>;
};

export type TeacherStudioAttendance = {
  id: string;
  classroom_id: string;
  contact_id: string;
  session_date: string;
  status: string;
  notes: string | null;
  marked_by?: string | null;
  marked_at?: string | null;
};

export type TeacherStudioScheduleSlot = {
  id: string;
  academy_id?: string;
  classroom_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string | null;
  timezone: string;
  label: string | null;
  is_active: boolean;
  created_at?: string;
};

export type TeacherLessonCoverage = {
  id: string;
  label: string;
  covered: boolean;
};

export type TeacherDaySession = {
  id: string;
  academy_id: string;
  classroom_id: string;
  classroom_name: string;
  room_name: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: string;
  delivery_mode: string;
  roster: Array<{ contact_id: string; name: string; status: string | null; notes: string | null }>;
  attendance_saved: boolean;
  curriculum: {
    course_id: string | null;
    course_title: string | null;
    module_id: string | null;
    module_title: string | null;
    lesson_id: string | null;
    lesson_title: string;
    lesson_summary: string | null;
    estimated_minutes: number;
    objectives: TeacherLessonCoverage[];
  };
  resources: Array<{ id: string; title: string; kind: string; url: string | null; description: string | null }>;
  homework: { title: string; description: string; due_at: string };
  run: ({ id: string; status: string; coverage?: TeacherLessonCoverage[]; teacher_notes?: string | null; homework_draft?: Json; homework_assignment_id?: string | null; started_at?: string | null; finished_at?: string | null } & Json) | null;
  connected_group_count: number;
};

export type TeacherDay = {
  date: string;
  generated_at: string;
  sessions: TeacherDaySession[];
  counts: { sessions: number; students: number; attendance_pending: number; homework_pending: number };
};

export type TeacherStudioStaff = {
  id: string;
  staff_id?: string | null;
  grant_id?: string | null;
  academy_id: string;
  user_id: string | null;
  email: string;
  display_name: string | null;
  role: string;
  classroom_ids: string[] | Json;
  scope_type?: string | null;
  scope_ids?: string[] | Json;
  status?: string | null;
  source?: string | null;
  is_active: boolean;
  starts_at?: string | null;
  expires_at?: string | null;
  accepted_at?: string | null;
  revoked_at?: string | null;
  last_used_at?: string | null;
  updated_at?: string | null;
  created_at: string;
};

export type TeacherStudioNotification = {
  id: string;
  contact_id: string | null;
  channel: string;
  type: string;
  title: string | null;
  body: string;
  status: string;
  error: string | null;
  sent_at: string | null;
  scheduled_at: string;
  created_at: string;
};

export type TeacherStudioOwnerDashboard = {
  revenue: {
    currency: string;
    collected_total: number;
    collected_this_month: number;
    outstanding: number;
    paid_count: number;
  } | null;
  funnel: Record<string, number>;
  total_students: number;
  total_classrooms: number;
  classroom_stats: Array<{
    classroom_id: string;
    name: string;
    is_active: boolean;
    students: number;
    assignments: number;
    avg_score: number | null;
    attendance_rate: number | null;
  }>;
  attendance_trend: Array<{ date: string; rate: number | null }>;
};

export type TeacherStudioBranding = {
  id: string;
  academy_id: string;
  display_name: string | null;
  tagline: string | null;
  logo_url: string | null;
  favicon_url?: string | null;
  primary_color: string | null;
  accent_color: string | null;
  hide_schood_logo: boolean;
  custom_domain: string | null;
  custom_domain_verified?: boolean;
  footer_text: string | null;
  metadata?: Json;
  updated_at: string;
};

export type TeacherStudioReferralLeader = {
  contact_id: string;
  name: string;
  referrals: number;
  enrolled: number;
};

export type TeacherStudioAtRiskStudent = {
  contact_id: string;
  name: string;
  email: string | null;
  classroom_id: string | null;
  classroom_name: string | null;
  reasons: string[];
  missing_assignments: number;
  recent_absences: number;
};

export type TeacherStudioActionItem = {
  id: string;
  academy_id: string;
  dedupe_key: string;
  source_type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  recommended_action: string | null;
  contact_id: string | null;
  classroom_id: string | null;
  due_at: string | null;
  status: 'open' | 'snoozed' | 'resolved' | 'dismissed';
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type TeacherStudioLifecycleRow = {
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

export type TeacherStudioAutomationRule = {
  id: string;
  academy_id: string;
  rule_key: string;
  name: string;
  description: string;
  channel: 'telegram' | 'email' | 'inapp';
  threshold: number | null;
  is_active: boolean;
  metadata: Json;
  last_run_at: string | null;
  last_run_summary: Json;
  created_at: string;
  updated_at: string;
};

export type TeacherStudioCalendarEvent = {
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

export type TeacherStudioInsight = {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'positive';
  title: string;
  detail: string;
  recommended_action: string;
  metric: number | null;
  classroom_id?: string | null;
  contact_id?: string | null;
};

export type TeacherStudioEducationOS = {
  generated_at: string;
  access?: TeacherStudioAccessProfile;
  action_queue: TeacherStudioActionItem[];
  pipeline: TeacherStudioLifecycleRow[];
  pipeline_counts: Record<string, number>;
  automation_rules: TeacherStudioAutomationRule[];
  calendar_events: TeacherStudioCalendarEvent[];
  intelligence: TeacherStudioInsight[];
  stats: {
    open_actions: number;
    urgent_actions: number;
    grading_backlog: number;
    certificate_ready: number;
    placement_gap: number;
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
  opts?: { method?: 'GET' | 'POST' | 'DELETE'; body?: Record<string, unknown> },
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

const invokeEdgeForm = async <T>(fnName: string, form: FormData): Promise<T> => {
  const run = async (token: string): Promise<Response> => {
    return fetch(`${edgeBase}/${fnName}`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
      body: form,
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
    throw new Error(`POST /${fnName} failed (${response.status}): ${JSON.stringify(detail)}`);
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

// Keep profile reads within a single entry/navigation burst together. The token
// keys the cache, so switching accounts or refreshing credentials cannot reuse
// another session's profile. Server endpoints still enforce current permissions.
let profileRead: { token: string; expiresAt: number; promise: Promise<MeResponse> } | null = null;
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') profileRead = null;
});

export const getMe = async (options?: { force?: boolean }): Promise<MeResponse> => {
  const token = await getAccessToken();
  if (!options?.force && profileRead?.token === token && profileRead.expiresAt > Date.now()) return profileRead.promise;
  const entry = {
    token,
    expiresAt: Date.now() + 15_000,
    promise: invokeEdge<MeResponse>('me', { method: 'GET' }),
  };
  profileRead = entry;
  try {
    return await entry.promise;
  } catch (error) {
    if (profileRead === entry) profileRead = null;
    throw error;
  }
};

export const academyAssessmentRequest = <T>(academyId: string, action: string, body: Record<string, unknown> = {}): Promise<T> =>
  callTeacherStudio<T>({ academyId, action, body });

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

export type AcademyBranch = {
  id: string;
  academy_id: string;
  branch_key: string;
  name: string;
  address: string | null;
  phone: string | null;
  timezone: string;
  currency: string;
  capacity: number | null;
  is_default: boolean;
  is_active: boolean;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type AcademyRoom = {
  id: string;
  academy_id: string;
  branch_id: string;
  room_key: string;
  name: string;
  capacity: number;
  room_type: 'classroom' | 'lab' | 'meeting' | 'office' | 'online' | 'other';
  is_active: boolean;
  features: Json;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type AcademyLeadSource = {
  id: string;
  academy_id: string;
  source_key: string;
  label_i18n: Record<string, string>;
  category: string;
  is_system: boolean;
  is_active: boolean;
  position: number;
};

export type AcademyPipelineStage = {
  id: string;
  academy_id: string;
  pipeline_id: string;
  stage_key: string;
  label_i18n: Record<string, string>;
  position: number;
  probability_percent: number;
  terminal_kind: 'won' | 'lost' | null;
  is_active: boolean;
};

export type AcademyPipelineTransition = {
  id: string;
  academy_id: string;
  pipeline_id: string;
  from_stage_id: string;
  to_stage_id: string;
  is_active: boolean;
  requires_reason: boolean;
};

export type AcademyLead = {
  id: string;
  academy_id: string;
  branch_id: string | null;
  preferred_branch_id: string | null;
  pipeline_id: string;
  current_stage_id: string;
  source_id: string | null;
  assigned_user_id: string | null;
  responsible_user_id: string | null;
  full_name: string;
  phone: string | null;
  telegram: string | null;
  email: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  age: number | null;
  interested_course: string | null;
  preferred_schedule: string | null;
  expected_price: number | null;
  currency: string;
  campaign: string | null;
  referral_source: string | null;
  notes: string | null;
  tags: Json;
  estimated_probability: number | null;
  status: 'open' | 'lost' | 'converted';
  lost_reason: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  converted_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type AcademyLeadActivity = {
  id: string;
  academy_id: string;
  lead_id: string;
  activity_type: string;
  method: string | null;
  status: 'planned' | 'completed' | 'cancelled' | 'missed';
  assigned_user_id: string | null;
  due_at: string | null;
  completed_at: string | null;
  outcome: string | null;
  notes: string | null;
  next_follow_up_at: string | null;
  created_at: string;
};

export type AcademyTrialLesson = {
  id: string;
  academy_id: string;
  lead_id: string;
  branch_id: string;
  room_id: string | null;
  classroom_id: string | null;
  teacher_user_id: string | null;
  starts_at: string;
  ends_at: string;
  status: 'scheduled' | 'confirmed' | 'attended' | 'missed' | 'cancelled' | 'rescheduled' | 'converted';
  feedback: string | null;
  recommended_course: string | null;
  recommended_level: string | null;
  next_step: string | null;
  created_at: string;
  updated_at: string;
};

export type AcademyLeadConversion = {
  id: string;
  academy_id: string;
  lead_id: string;
  contact_id: string;
  classroom_id: string | null;
  trial_id: string | null;
  source_id: string | null;
  salesperson_user_id: string | null;
  expected_value: number | null;
  currency: string;
  converted_at: string;
};

export type AcademyBusinessFoundation = {
  generated_at: string;
  access?: TeacherStudioAccessProfile;
  branches: AcademyBranch[];
  rooms: AcademyRoom[];
  sources: AcademyLeadSource[];
  stages: AcademyPipelineStage[];
  transitions: AcademyPipelineTransition[];
  leads: AcademyLead[];
  activities: AcademyLeadActivity[];
  trials: AcademyTrialLesson[];
  conversions: AcademyLeadConversion[];
  classrooms: Array<Pick<TeacherStudioClassroom, 'id' | 'name' | 'is_active'>>;
  staff: Array<Pick<TeacherStudioStaff, 'id' | 'user_id' | 'display_name' | 'role' | 'is_active'>>;
};

export type AcademyPricingPlan = {
  id: string; academy_id: string; branch_id: string | null; classroom_id: string | null;
  legacy_offer_id: string | null; plan_key: string; name: string; pricing_model: string;
  billing_cycle: string; base_amount: number; currency: string; lessons_included: number | null;
  teaching_hours_included: number | null; duration_days: number | null; installment_count: number | null;
  is_active: boolean; metadata: Json; created_at: string; updated_at: string;
};

export type AcademySubscription = {
  id: string; academy_id: string; contact_id: string; branch_id: string | null; classroom_id: string | null;
  pricing_plan_id: string; entitlement_id: string | null; status: 'draft' | 'active' | 'paused' | 'overdue' | 'cancelled' | 'expired' | 'completed';
  starts_on: string; ends_on: string | null; billing_cycle: string; billing_anchor_day: number | null;
  list_amount: number; discount_amount: number; agreed_amount: number; currency: string; auto_renew: boolean;
  renewal_notice_days: number; cancelled_at: string | null; cancellation_reason: string | null;
  completed_at: string | null; metadata: Json; created_at: string; updated_at: string;
};

export type AcademySubscriptionFreeze = {
  id: string; academy_id: string; subscription_id: string; starts_on: string; ends_on: string;
  reason: string; status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  created_by: string | null; created_at: string;
};

export type AcademyPricingAdjustment = {
  id: string; academy_id: string; subscription_id: string; adjustment_type: string;
  percentage_basis_points: number | null; amount: number; original_amount: number; final_amount: number;
  reason: string; promo_code: string | null; starts_on: string | null; ends_on: string | null;
  applied_by: string; approved_by: string | null; metadata: Json; created_at: string;
};

export type AcademyCharge = {
  id: string; academy_id: string; contact_id: string; subscription_id: string | null; branch_id: string | null;
  classroom_id: string | null; charge_number: string; cycle_key: string | null; charge_type: string;
  service_period_start: string | null; service_period_end: string | null; issued_on: string; due_on: string;
  original_amount: number; discount_amount: number; net_amount: number; currency: string; status: string;
  description: string | null; metadata: Json; created_at: string; updated_at: string;
  allocated_amount: number; adjustment_amount: number; effective_amount: number; outstanding_amount: number; calculated_status: string; days_overdue: number; aging_bucket: string;
};

export type AcademyPaymentAllocation = {
  id: string; academy_id: string; payment_id: string; charge_id: string; amount: number; currency: string;
  allocation_kind: 'application' | 'reversal'; reverses_allocation_id: string | null;
  allocated_by: string; allocated_at: string; metadata: Json;
};

export type AcademyLedgerEntry = {
  id: string; academy_id: string; contact_id: string; subscription_id: string | null; charge_id: string | null;
  payment_id: string | null; entry_type: string; amount: number; currency: string; effective_at: string;
  reason: string | null; created_by: string | null; metadata: Json; created_at: string;
};

export type AcademyAccountBalance = {
  academy_id: string; contact_id: string; currency: string; balance: number; debits: number; credits: number; last_entry_at: string;
};

export type AcademyDebtCase = {
  id: string; academy_id: string; contact_id: string; subscription_id: string | null; branch_id: string | null;
  status: string; responsible_user_id: string | null; restriction_state: string; collection_notes: string | null;
  opened_at: string; resolved_at: string | null; metadata: Json; created_at: string; updated_at: string;
};

export type AcademyPaymentPromise = {
  id: string; academy_id: string; debt_case_id: string; amount: number; currency: string; promised_for: string;
  status: string; notes: string | null; created_by: string | null; created_at: string;
};

export type AcademyPaymentReconciliation = {
  id: string; academy_id: string; academy_payment_id: string | null; provider: string; provider_transaction_id: string;
  provider_event_id: string; event_type: string; amount: number | null; currency: string | null; status: string;
  payload_hash: string; received_at: string; metadata: Json;
};

export type AcademyFinancialTotals=Record<string,Array<{currency:string;[key:string]:string}>> & {open_shifts?:number};
export type AcademyCommercialCore = {
  wallet_policies?:AcademyWalletPolicy[];
  totals?:AcademyFinancialTotals;has_more?:Record<string,boolean>;selected_branch_id?:string|null;
  generated_at: string; access?: TeacherStudioAccessProfile; pricing_plans: AcademyPricingPlan[];
  subscriptions: AcademySubscription[]; subscription_freezes: AcademySubscriptionFreeze[]; pricing_adjustments: AcademyPricingAdjustment[]; charges: AcademyCharge[];
  payments: TeacherStudioPayment[]; allocations: AcademyPaymentAllocation[]; ledger_entries: AcademyLedgerEntry[];
  account_balances: AcademyAccountBalance[]; debt_cases: AcademyDebtCase[]; payment_promises: AcademyPaymentPromise[];
  collection_events: Array<Record<string, unknown>>; reconciliations: AcademyPaymentReconciliation[];
  contacts: Array<Pick<TeacherStudioContact, 'id' | 'first_name' | 'last_name' | 'email' | 'phone' | 'status' | 'lifecycle_stage'>>;
  branches: Array<Pick<AcademyBranch, 'id' | 'name' | 'is_active' | 'currency'>>;
  classrooms: Array<Pick<TeacherStudioClassroom, 'id' | 'name' | 'is_active'>>;
};

export type AcademyCashbox = { handover?:AcademyCashierShift|null; id:string; academy_id:string; branch_id:string; name:string; currency:string; is_active:boolean };
export type AcademyCashierShift = { previous_shift_id?:string|null; shift_sequence?:number|null; handover_previous_count?:string|number|null; handover_difference?:string|number|null; handover_reason?:string|null; handover_accepted_by?:string|null; handover_accepted_at?:string|null; id:string; academy_id:string; cashbox_id:string; cashier_user_id:string; opened_at:string; closed_at:string|null; opening_balance:number; expected_closing_balance:number|null; counted_closing_balance:number|null; discrepancy:number|null; status:string };
export type AcademyCashMovement = { id:string; academy_id:string; shift_id:string; direction:string; movement_type:string; payment_method:string; amount:number; currency:string; occurred_at:string; counterparty:string|null; reason:string };
export type AcademyExpenseCategory = { id:string; academy_id:string; category_key:string; name:string; kind:string; is_active:boolean };
export type AcademyExpense = { id:string; academy_id:string; branch_id:string|null; classroom_id:string|null; category_id:string; expense_date:string; amount:number; currency:string; vendor:string|null; description:string; payment_method:string; status:string; receipt_ref:string|null };
export type AcademyCompensationRule = { id:string; academy_id:string; staff_id:string; branch_id:string|null; rule_type:string; name:string; currency:string; fixed_amount:number; unit_rate:number; percentage_basis_points:number; performance_bonus:number; effective_from:string; effective_to:string|null; is_active:boolean; version:number };
export type AcademyPayrollPeriod = { id:string; academy_id:string; branch_id:string|null; period_start:string; period_end:string; currency:string; status:string; calculated_at:string|null; reviewed_at:string|null; approved_at:string|null; paid_at:string|null; cancellation_reason:string|null };
export type AcademyPayrollRow = { id:string; academy_id:string; payroll_period_id:string; staff_id:string; branch_id:string|null; compensation_rule_id:string; lessons_delivered:number; minutes_delivered:number; relevant_students:number; generated_revenue:number; generated_amount:number; adjustment_amount:number; final_payable_amount:number; currency:string; rule_snapshot:Json; inputs_snapshot:Json };
export type AcademyContribution = { academy_id:string; currency:string; generated_revenue:number; operating_expenses:number; contribution:number; branch_id?:string; branch_name?:string; classroom_id?:string; classroom_name?:string; teacher_cost?:number; attributed_teacher_cost?:number };
export type AcademyOperationsFinance = {
  totals?:AcademyFinancialTotals;has_more?:Record<string,boolean>;selected_branch_id?:string|null;
  generated_at:string; access:TeacherStudioAccessProfile; cashboxes:AcademyCashbox[]; cashier_shifts:AcademyCashierShift[];
  cash_movements:AcademyCashMovement[]; cash_reconciliations:Array<Record<string,unknown>>; expense_categories:AcademyExpenseCategory[];
  expenses:AcademyExpense[]; budgets:Array<Record<string,unknown>>; lesson_deliveries:Array<Record<string,unknown>>;
  compensation_rules:AcademyCompensationRule[]; payroll_periods:AcademyPayrollPeriod[]; payroll_rows:AcademyPayrollRow[];
  payroll_adjustments:Array<Record<string,unknown>>; payroll_payouts:Array<Record<string,unknown>>;
  branch_economics:AcademyContribution[]; classroom_economics:AcademyContribution[];
  staff:Array<{id:string;email:string;display_name:string|null;role:string;classroom_ids:Json;is_active:boolean}>;
  branches:Array<{id:string;name:string;currency:string;is_active:boolean}>; classrooms:Array<{id:string;name:string;is_active:boolean}>;
};

export type AcademyLessonSession = { id:string; academy_id:string; branch_id:string; classroom_id:string; room_id:string|null; primary_staff_id:string; calendar_id:string|null; title:string; session_type:string; delivery_mode:string; starts_at:string; ends_at:string; timezone:string; status:string; cancellation_reason:string|null; rescheduled_to_session_id:string|null; metadata:Json; created_at:string; updated_at:string };
export type AcademyAttendanceRecord = { id:string; academy_id:string; classroom_id:string; contact_id:string; session_id:string|null; session_date:string; status:'present'|'absent'|'late'|'excused'; notes:string|null; marked_at:string };
export type AcademyAcademicOperations = {
  generated_at:string; access:TeacherStudioAccessProfile;
  calendars:Array<Record<string,unknown>>; calendar_events:Array<Record<string,unknown>>; staff_availability:Array<Record<string,unknown>>; room_availability:Array<Record<string,unknown>>;
  sessions:AcademyLessonSession[]; session_delivery?:Array<{id:string;session_id:string;provider:string;attendee_url:string;join_opens_at:string;join_closes_at:string;status:string;updated_at:string}>; session_staff_assignments:Array<Record<string,unknown>>; attendance:AcademyAttendanceRecord[]; attendance_exceptions:Array<Record<string,unknown>>;
  make_up_lessons:Array<Record<string,unknown>>; quality_reviews:Array<Record<string,unknown>>; room_capacity:Array<Record<string,unknown>>; room_peak_periods:Array<Record<string,unknown>>; classroom_capacity:Array<Record<string,unknown>>;
  branches:Array<{id:string;name:string;is_active:boolean;currency:string;timezone?:string}>; rooms:Array<{id:string;branch_id:string;name:string;capacity:number;is_active:boolean}>; classrooms:Array<{id:string;name:string;is_active:boolean;student_capacity:number|null}>;
  staff:Array<{id:string;email:string;display_name:string|null;role:string;classroom_ids:Json;is_active:boolean}>; classroom_memberships:Array<{classroom_id:string;contact_id:string;role:string;status:string}>; contacts:Array<{id:string;first_name:string;last_name:string;email:string|null;status:string}>;
};
export type AcademyGuardian = {id:string;academy_id:string;user_id:string|null;full_name:string;phone:string|null;email:string|null;telegram_user_id:string|null;telegram_username:string|null;telegram_verified_at:string|null;status:string;locale:string;notes:string|null;created_at:string;updated_at:string};
export type AcademyGuardianRelationship = {id:string;academy_id:string;contact_id:string;guardian_id:string;relationship_type:string;status:string;is_primary_contact:boolean;is_financially_responsible:boolean;is_emergency_contact:boolean;can_view_status:boolean;can_view_attendance:boolean;can_view_grades:boolean;can_view_homework:boolean;can_view_schedule:boolean;can_view_payments:boolean;can_view_debt:boolean;can_view_messages:boolean;can_view_progress_reports:boolean;can_view_resources:boolean;can_view_announcements:boolean;can_message_academy:boolean;consent_status:string;consented_at:string|null;revoked_at:string|null;revocation_reason:string|null;created_at:string;updated_at:string};
export type AcademyGuardianRelationships = {generated_at:string;access:TeacherStudioAccessProfile;guardians:AcademyGuardian[];relationships:AcademyGuardianRelationship[];consents:Array<Record<string,unknown>>;link_tokens:Array<Record<string,unknown>>;preferences:Array<Record<string,unknown>>;messages:Array<Record<string,unknown>>;delivery_attempts:Array<Record<string,unknown>>;notifications:Array<Record<string,unknown>>;contacts:Array<{id:string;first_name:string;last_name:string;email:string|null;phone:string|null;status:string}>};
export type AcademyGuardianDashboard = {guardians:Array<Record<string,unknown>>;children:Array<{academy_id:string;relationship_id:string;guardian_id?:string;details_loaded?:boolean;history_has_more?:Record<string,boolean>;relationship_type:string;is_primary_contact:boolean;is_financially_responsible:boolean;permissions:Record<string,boolean>;student:{id:string;name:string;status?:string;placement_level?:string|null;placement_score?:number|null};classrooms:Array<Record<string,unknown>>;attendance:Array<Record<string,unknown>>;grades:Array<Record<string,unknown>>;homework:Array<Record<string,unknown>>;schedule:Array<Record<string,unknown>>;charges:Array<Record<string,unknown>>;balances:Array<Record<string,unknown>>;messages:Array<Record<string,unknown>>;announcements:Array<Record<string,unknown>>;resources:Array<Record<string,unknown>>;progress_reports:Array<Record<string,unknown>>}>;preferences:Array<Record<string,unknown>>;notifications:Array<Record<string,unknown>>};
export type AcademyBusinessIntelligence = {
  generated_at:string;access:TeacherStudioAccessProfile;allowed_import_types?:string[];owner:Record<string,unknown>;dashboard:Record<string,unknown>;
  branches:Array<Record<string,unknown>>;metric_definitions:Array<Record<string,unknown>>;marketing_attribution:Array<Record<string,unknown>>;
  unit_economics:Array<Record<string,unknown>>;teacher_performance:Array<Record<string,unknown>>;staff_performance:Array<Record<string,unknown>>;
  student_intelligence:Array<Record<string,unknown>>;lifecycle_events:Array<Record<string,unknown>>;
  risk_definitions:Array<Record<string,unknown>>;risk_evaluations:Array<Record<string,unknown>>;risk_signals:Array<Record<string,unknown>>;
  interventions:Array<Record<string,unknown>>;intervention_activities:Array<Record<string,unknown>>;renewals:Array<Record<string,unknown>>;
  renewal_activities:Array<Record<string,unknown>>;actions:Array<Record<string,unknown>>;import_jobs:Array<Record<string,unknown>>;
  import_rows:Array<Record<string,unknown>>;import_effects:Array<Record<string,unknown>>;contacts:Array<Record<string,unknown>>;
  staff:Array<Record<string,unknown>>;subscriptions:Array<Record<string,unknown>>;campaigns:Array<Record<string,unknown>>;
  localization:Record<string,unknown>;translations:Array<Record<string,unknown>>;automation_versions:Array<Record<string,unknown>>;
  automation_executions:Array<Record<string,unknown>>;automation_effects:Array<Record<string,unknown>>;ai_requests:Array<Record<string,unknown>>;
  ai_reviews:Array<Record<string,unknown>>;
};

export const teacherStudioStudentCurriculum = async (
  academyId: string,
  classroomId: string,
): Promise<TeacherStudioStudentCurriculum> => {
  return callTeacherStudio<TeacherStudioStudentCurriculum>({
    action: 'student_curriculum',
    academyId,
    params: { classroom_id: classroomId },
  });
};

export const academyVideoCapability = (academyId: string): Promise<AcademyVideoCapability> =>
  invokeEdge<AcademyVideoCapability>('academy-video', {
    body: { action: 'capability', academy_id: academyId },
  });

export const academyVideoCreateUpload = (
  academyId: string,
  body: { lesson_id: string; title: string; max_duration_seconds: number },
): Promise<{ asset: AcademyVideoAsset; upload_url: string; upload_protocol: 'basic' }> =>
  invokeEdge('academy-video', {
    body: { action: 'create-upload', academy_id: academyId, ...body },
  });

export const academyVideoUploadFile = async (
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> => {
  if (file.size > 200 * 1024 * 1024) throw new Error('This upload path supports files up to 200 MB.');
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', uploadUrl);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress?.(Math.round(event.loaded / event.total * 100));
    });
    request.addEventListener('load', () => request.status >= 200 && request.status < 300
      ? resolve()
      : reject(new Error(`Video upload failed (${request.status}).`)));
    request.addEventListener('error', () => reject(new Error('Video upload was interrupted.')));
    request.addEventListener('abort', () => reject(new Error('Video upload was cancelled.')));
    const form = new FormData();
    form.append('file', file, file.name);
    request.send(form);
  });
};

export const academyVideoSyncStatus = (academyId: string, assetId: string): Promise<AcademyVideoAsset> =>
  invokeEdge<{ asset: AcademyVideoAsset }>('academy-video', {
    body: { action: 'sync-status', academy_id: academyId, asset_id: assetId },
  }).then((result) => result.asset);

export const academyVideoPlayback = (academyId: string, assetId: string): Promise<{ iframe_url: string; expires_in_seconds: number }> =>
  invokeEdge('academy-video', {
    body: { action: 'playback-token', academy_id: academyId, asset_id: assetId },
  });

export const academyVideoDelete = (academyId: string, assetId: string): Promise<AcademyVideoAsset> =>
  invokeEdge<{ asset: AcademyVideoAsset }>('academy-video', {
    method: 'DELETE',
    body: { action: 'delete', academy_id: academyId, asset_id: assetId },
  }).then((result) => result.asset);

export const teacherStudioStudentSessionJoin = async (
  academyId: string,
  classroomId: string,
  sessionId: string,
): Promise<{ join_url: string; meeting_provider: string; join_opens_at: string; join_closes_at: string }> => {
  const data = await callTeacherStudio<{ session: { join_url: string; meeting_provider: string; join_opens_at: string; join_closes_at: string } }>({
    method: 'POST',
    action: 'student_session_join',
    academyId,
    body: { classroom_id: classroomId, session_id: sessionId },
  });
  return data.session;
};

export const teacherStudioSetLessonProgress = async (
  academyId: string,
  body: { classroom_id: string; lesson_id: string; status: 'in_progress' | 'completed'; time_spent_seconds?: number },
): Promise<TeacherStudioStudentCurriculum['progress'][number]> => {
  const data = await callTeacherStudio<{ progress: TeacherStudioStudentCurriculum['progress'][number] }>({
    method: 'POST',
    action: 'set_lesson_progress',
    academyId,
    body,
  });
  return data.progress;
};

export const teacherStudioStartQuiz = async (
  academyId: string,
  body: { classroom_id: string; quiz_id: string },
): Promise<{ quiz: TeacherStudioQuiz; attempt: TeacherStudioQuizAttempt; resumed: boolean }> => {
  return callTeacherStudio<{ quiz: TeacherStudioQuiz; attempt: TeacherStudioQuizAttempt; resumed: boolean }>({
    method: 'POST',
    action: 'start_quiz',
    academyId,
    body,
  });
};

export const teacherStudioSubmitQuiz = async (
  academyId: string,
  body: { classroom_id: string; attempt_id: string; answers: Record<string, unknown> },
): Promise<TeacherStudioQuizAttempt> => {
  const data = await callTeacherStudio<{ attempt: TeacherStudioQuizAttempt }>({
    method: 'POST',
    action: 'submit_quiz',
    academyId,
    body,
  });
  return data.attempt;
};

export const teacherStudioStudentAssignments = async (
  academyId?: string | null,
  classroomId?: string | null,
): Promise<{ assignments: TeacherStudioStudentAssignment[]; contact_id?: string; academy_id?: string }> => {
  const data = await callTeacherStudio<{ assignments: TeacherStudioStudentAssignment[]; contact_id?: string; academy_id?: string }>({
    action: 'student_assignments',
    academyId,
    params: { classroom_id: classroomId ?? undefined },
  });
  return {
    assignments: data.assignments ?? [],
    contact_id: data.contact_id,
    academy_id: data.academy_id,
  };
};

export const teacherStudioStudentAttendance = async (
  academyId?: string | null,
  classroomId?: string | null,
): Promise<{ attendance: TeacherStudioAttendance[]; contact_id?: string; academy_id?: string }> => {
  const data = await callTeacherStudio<{ attendance: TeacherStudioAttendance[]; contact_id?: string; academy_id?: string }>({
    action: 'student_attendance',
    academyId,
    params: { classroom_id: classroomId ?? undefined },
  });
  return {
    attendance: data.attendance ?? [],
    contact_id: data.contact_id,
    academy_id: data.academy_id,
  };
};

export const teacherStudioStudentBilling = async (
  academyId?: string | null,
): Promise<TeacherStudioStudentBilling> => {
  const data = await callTeacherStudio<TeacherStudioStudentBilling>({
    action: 'student_billing',
    academyId,
  });
  return { items: data.items ?? [], accounts: data.accounts ?? [] };
};

export const teacherStudioSubmitStudentAssignment = async (
  academyId: string,
  body: {
    assignment_id: string;
    submission_content?: string | null;
    submission_url?: string | null;
    notes?: string | null;
  },
): Promise<TeacherStudioSubmission> => {
  const data = await callTeacherStudio<{ submission: TeacherStudioSubmission }>({
    method: 'POST',
    action: 'submit_assignment',
    academyId,
    body,
  });
  return data.submission;
};

export const teacherStudioSubmitStudentAssignmentFile = async (
  academyId: string,
  body: {
    assignment_id: string;
    file: File;
    submission_content?: string | null;
    submission_url?: string | null;
    notes?: string | null;
  },
): Promise<TeacherStudioSubmission> => {
  const form = new FormData();
  form.append('action', 'submit_assignment');
  form.append('academy_id', academyId);
  form.append('assignment_id', body.assignment_id);
  if (body.submission_content) form.append('submission_content', body.submission_content);
  if (body.submission_url) form.append('submission_url', body.submission_url);
  if (body.notes) form.append('notes', body.notes);
  form.append('file', body.file);

  const data = await invokeEdgeForm<{ submission: TeacherStudioSubmission }>('academy', form);
  return data.submission;
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

export const teacherStudioUploadClassroomResource = async (
  academyId: string,
  body: {
    classroom_id: string;
    title: string;
    type: TeacherStudioClassroomResource['kind'];
    file: File;
    url?: string;
    description?: string;
    sort_order?: number;
    is_published?: boolean;
    metadata?: Json;
  },
): Promise<TeacherStudioClassroomResource> => {
  const form = new FormData();
  form.append('action', 'classroom-resource-upsert');
  form.append('academy_id', academyId);
  form.append('classroom_id', body.classroom_id);
  form.append('title', body.title);
  form.append('type', body.type);
  if (body.url) form.append('url', body.url);
  if (body.description) form.append('description', body.description);
  if (typeof body.sort_order === 'number') form.append('sort_order', String(body.sort_order));
  if (typeof body.is_published === 'boolean') form.append('is_published', String(body.is_published));
  if (body.metadata) form.append('metadata', JSON.stringify(body.metadata));
  form.append('file', body.file);

  const data = await invokeEdgeForm<{ resource: TeacherStudioClassroomResource }>('academy', form);
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
    membership_status?: TeacherStudioClassroomMembership['status'];
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

export const teacherStudioCreateClickTuitionPayment = async (
  academyId: string,
  body: { contact_id: string; offer_id: string; redirect_url?: string | null },
): Promise<TeacherStudioClickTuitionTransaction> => {
  const result = await invokeEdge<TeacherStudioClickTuitionTransaction>('click/create-transaction', {
    method: 'POST',
    body: {
      description: 'Academy tuition',
      purchase_type: 'academy_tuition',
      redirect_url: body.redirect_url ?? null,
      metadata: {
        source: 'academy_office',
        academy_id: academyId,
        offer_id: body.offer_id,
        contact_id: body.contact_id,
      },
    },
  });
  const paymentUrl = new URL(result.payment_url);
  if (
    paymentUrl.protocol !== 'https:' || paymentUrl.hostname !== 'my.click.uz' ||
    paymentUrl.pathname !== '/services/pay'
  ) throw new Error('CLICK returned an untrusted payment URL');
  return result;
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

export const teacherStudioOwnerDashboard = async (academyId: string): Promise<TeacherStudioOwnerDashboard> => {
  return callTeacherStudio<TeacherStudioOwnerDashboard>({ action: 'owner_dashboard', academyId });
};

export const teacherStudioEducationOS = async (academyId: string): Promise<TeacherStudioEducationOS> => {
  return callTeacherStudio<TeacherStudioEducationOS>({ action: 'education_os', academyId });
};

export const teacherStudioBusinessFoundation = async (academyId: string): Promise<AcademyBusinessFoundation> =>
  callTeacherStudio<AcademyBusinessFoundation>({ action: 'business_foundation', academyId });

export const teacherStudioUpsertBranch = async (
  academyId: string,
  body: { id?: string; branch_key: string; name: string; address?: string; phone?: string; timezone?: string; currency?: string; capacity?: number | null; is_active?: boolean },
): Promise<AcademyBranch> => {
  const data = await callTeacherStudio<{ branch: AcademyBranch }>({ action: 'upsert_branch', academyId, body });
  return data.branch;
};

export const teacherStudioUpsertRoom = async (
  academyId: string,
  body: { id?: string; branch_id: string; room_key: string; name: string; capacity: number; room_type?: AcademyRoom['room_type']; is_active?: boolean },
): Promise<AcademyRoom> => {
  const data = await callTeacherStudio<{ room: AcademyRoom }>({ action: 'upsert_room', academyId, body });
  return data.room;
};

export const teacherStudioCreateLead = async (
  academyId: string,
  body: Record<string, unknown> & { full_name: string; idempotency_key: string },
): Promise<AcademyLead> => {
  const data = await callTeacherStudio<{ lead: AcademyLead }>({ action: 'create_lead', academyId, body });
  return data.lead;
};

export const teacherStudioTransitionLead = async (
  academyId: string,
  body: { lead_id: string; to_stage_id: string; reason?: string; notes?: string; idempotency_key: string },
): Promise<AcademyLead> => {
  const data = await callTeacherStudio<{ lead: AcademyLead }>({ action: 'transition_lead', academyId, body });
  return data.lead;
};

export const teacherStudioRecordLeadActivity = async (
  academyId: string,
  body: Record<string, unknown> & { lead_id: string; idempotency_key: string },
): Promise<AcademyLeadActivity> => {
  const data = await callTeacherStudio<{ activity: AcademyLeadActivity }>({ action: 'record_lead_activity', academyId, body });
  return data.activity;
};

export const teacherStudioScheduleTrial = async (
  academyId: string,
  body: Record<string, unknown> & { lead_id: string; starts_at: string; ends_at: string; idempotency_key: string },
): Promise<AcademyTrialLesson> => {
  const data = await callTeacherStudio<{ trial: AcademyTrialLesson }>({ action: 'schedule_trial', academyId, body });
  return data.trial;
};

export const teacherStudioSetTrialStatus = async (
  academyId: string,
  body: { trial_id: string; status: AcademyTrialLesson['status']; feedback?: string; recommended_course?: string; recommended_level?: string; next_step?: string; idempotency_key: string },
): Promise<AcademyTrialLesson> => {
  const data = await callTeacherStudio<{ trial: AcademyTrialLesson }>({ action: 'set_trial_status', academyId, body });
  return data.trial;
};

export const teacherStudioConvertLead = async (
  academyId: string,
  body: { lead_id: string; classroom_id?: string | null; existing_contact_id?: string | null; trial_id?: string | null; idempotency_key: string },
): Promise<{ conversion: AcademyLeadConversion; contact?: TeacherStudioContact }> =>
  callTeacherStudio<{ conversion: AcademyLeadConversion; contact?: TeacherStudioContact }>({ action: 'convert_lead', academyId, body });

export const teacherStudioCommercialCore = async (academyId:string,actorId?:string,branchId?:string):Promise<AcademyCommercialCore> => staffRequest<AcademyCommercialCore>(academyId,'commercial_core',branchId?{branch_id:branchId}:{},actorId);

export const teacherStudioOperationsFinance = async (academyId:string,actorId?:string,branchId?:string):Promise<AcademyOperationsFinance> => staffRequest<AcademyOperationsFinance>(academyId,'operations_finance',branchId?{branch_id:branchId}:{},actorId);

export const teacherStudioAcademicOperations = async (academyId:string):Promise<AcademyAcademicOperations> => callTeacherStudio<AcademyAcademicOperations>({ action: 'academic_operations', academyId });
export const teacherStudioRoomBranches=(academyId:string)=>callTeacherStudio<{branches:RoomBranch[];truncated:boolean}>({action:'room_timetable_branches',academyId});
export const teacherStudioRoomTimetable=(academyId:string,branchId:string,from:string,days:number)=>callTeacherStudio<RoomTimetable>({action:'room_timetable',academyId,params:{branch_id:branchId,from,days:String(days)}});
export const teacherStudioGuardianRelationships = async (academyId:string):Promise<AcademyGuardianRelationships> => callTeacherStudio<AcademyGuardianRelationships>({ action: 'guardian_relationships', academyId });
type GuardianPortalPage=AcademyGuardianDashboard&{selected_child:AcademyGuardianDashboard['children'][number]|null;has_more:boolean;cursor:{after_id:string}|null};
export const teacherStudioGuardianDashboard = async (relationshipId?:string,actorId?:string):Promise<AcademyGuardianDashboard> => {
 const first=await parentRequest<GuardianPortalPage>('','guardian_dashboard',relationshipId?{relationship_id:relationshipId}:{},actorId);
 const children=new Map(first.children.map(row=>[row.relationship_id,row]));
 if(first.selected_child)children.set(first.selected_child.relationship_id,first.selected_child);
 const guardians=new Map(first.guardians.map(row=>[String(row.id),row])),preferences=new Map(first.preferences.map(row=>[String(row.id),row]));
 let page=first;const cursors=new Set<string>();
 while(page.has_more){
  const cursor=page.cursor?.after_id;if(!cursor||cursors.has(cursor))throw new Error('We could not load your parent portal. Try again.');cursors.add(cursor);
  page=await parentRequest<GuardianPortalPage>('','guardian_dashboard',{after_id:cursor,list_only:true},actorId);
  for(const row of page.children)if(!children.has(row.relationship_id))children.set(row.relationship_id,row);
  for(const row of page.guardians)guardians.set(String(row.id),row);
  for(const row of page.preferences)preferences.set(String(row.id),row);
 }
 return {...first,children:[...children.values()],guardians:[...guardians.values()],preferences:[...preferences.values()]};
};
export const teacherStudioGuardianHistory = (relationshipId:string,section:string,after:Record<string,unknown>|null,actorId:string) => parentRequest<{relationship_id:string;section:string;records:Record<string,unknown>[];has_more:boolean;cursor:Record<string,unknown>|null}>('','guardian_history',{relationship_id:relationshipId,section,after},actorId);
export const teacherStudioClaimGuardianLink = (body:Record<string,unknown>,actorId?:string) => parentRequest<Record<string,unknown>>('','guardian_claim_link',body,actorId);
export const teacherStudioGuardianUpdatePreferences = (body:Record<string,unknown>,actorId?:string) => parentRequest<{preference:Record<string,unknown>}>('','guardian_update_preferences',body,actorId);
export const teacherStudioGuardianSendMessage = (body:Record<string,unknown>,actorId?:string) => parentRequest<{message:Record<string,unknown>}>('','guardian_send_message',body,actorId);
export const teacherStudioBusinessIntelligence = async (academyId:string):Promise<AcademyBusinessIntelligence> => callTeacherStudio<AcademyBusinessIntelligence>({ action: 'business_intelligence', academyId });
export const teacherStudioGlobalSearch = async (academyId:string,query:string):Promise<{results:Array<Record<string,unknown>>}> => callTeacherStudio<{results:Array<Record<string,unknown>>}>({ action: 'global_search', academyId, body:{query,limit:50} });

const academyOperationsCommand = <T>(academyId: string, action: string, body: Record<string, unknown>): Promise<T> =>
  callTeacherStudio<T>({ method: 'POST', action, academyId, body });

export const teacherStudioCreateCashbox = (academyId:string,body:Record<string,unknown>,actorId?:string) => staffRequest<{cashbox:AcademyCashbox}>(academyId,'create_cashbox',body,actorId);
export const teacherStudioAcceptCashierHandover = (academyId:string,body:Record<string,unknown>,actorId?:string) => staffRequest<{cashier_shift:AcademyCashierShift}>(academyId,'accept_cashier_handover',body,actorId);
export const teacherStudioOpenCashierShift = (academyId:string,body:Record<string,unknown>,actorId?:string) => staffRequest<{cashier_shift:AcademyCashierShift}>(academyId,'open_cashier_shift',body,actorId);
export const teacherStudioRecordCashMovement = (academyId:string,body:Record<string,unknown>,actorId?:string) => staffRequest<{cash_movement:AcademyCashMovement}>(academyId,'record_cash_movement',body,actorId);
export const teacherStudioCloseCashierShift = (academyId:string,body:Record<string,unknown>,actorId?:string) => staffRequest<{cashier_shift:AcademyCashierShift}>(academyId,'close_cashier_shift',body,actorId);
export const teacherStudioUpsertExpenseCategory = (academyId:string,body:Record<string,unknown>,actorId?:string) => staffRequest<{expense_category:AcademyExpenseCategory}>(academyId,'upsert_expense_category',body,actorId);
export const teacherStudioRecordExpense = (academyId:string,body:Record<string,unknown>,actorId?:string) => staffRequest<{expense:AcademyExpense}>(academyId,'record_expense',body,actorId);
export const teacherStudioUpsertBudget = (academyId:string,body:Record<string,unknown>,actorId?:string) => staffRequest<{budget:Record<string,unknown>}>(academyId,'upsert_budget',body,actorId);
export const teacherStudioUpsertCompensationRule = (academyId:string,body:Record<string,unknown>,actorId?:string) => staffRequest<{compensation_rule:AcademyCompensationRule}>(academyId,'upsert_compensation_rule',body,actorId);
export const teacherStudioRecordLessonDelivery = (academyId:string,body:Record<string,unknown>,actorId?:string) => staffRequest<{lesson_delivery:Record<string,unknown>}>(academyId,'record_lesson_delivery',body,actorId);
export const teacherStudioCreatePayrollPeriod = (academyId:string,body:Record<string,unknown>,actorId?:string) => staffRequest<{payroll_period:AcademyPayrollPeriod}>(academyId,'create_payroll_period',body,actorId);
export const teacherStudioCalculatePayroll = (academyId:string,body:Record<string,unknown>,actorId?:string) => staffRequest<{period:AcademyPayrollPeriod;row_count:number}>(academyId,'calculate_payroll',body,actorId);
export const teacherStudioPostPayrollAdjustment = (academyId:string,body:Record<string,unknown>,actorId?:string) => staffRequest<{payroll_adjustment:Record<string,unknown>}>(academyId,'post_payroll_adjustment',body,actorId);
export const teacherStudioTransitionPayroll = (academyId:string,body:Record<string,unknown>,actorId?:string) => staffRequest<{payroll_period:AcademyPayrollPeriod}>(academyId,'transition_payroll',body,actorId);
export const teacherStudioUpsertAcademicCalendar = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{calendar:Record<string,unknown>}>(academyId,'upsert_academic_calendar',body);
export const teacherStudioUpsertCalendarEvent = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{calendar_event:Record<string,unknown>}>(academyId,'upsert_calendar_event',body);
export const teacherStudioUpsertStaffAvailability = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{availability:Record<string,unknown>}>(academyId,'upsert_staff_availability',body);
export const teacherStudioUpsertRoomAvailability = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{availability:Record<string,unknown>}>(academyId,'upsert_room_availability',body);
export const teacherStudioCreateLessonSession = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{session:AcademyLessonSession}>(academyId,'create_lesson_session',body);
export const teacherStudioUpsertSessionDelivery = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{delivery:Record<string,unknown>}>(academyId,'upsert_session_delivery',body);
export const teacherStudioTransitionLessonSession = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{session:AcademyLessonSession;replacement?:AcademyLessonSession}>(academyId,'transition_lesson_session',body);
export const teacherStudioAssignSessionSubstitute = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<Record<string,unknown>>(academyId,'assign_session_substitute',body);
export const teacherStudioRecordSessionAttendance = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{attendance:AcademyAttendanceRecord}>(academyId,'record_session_attendance',body);
export const teacherStudioRecordAttendanceException = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{attendance_exception:Record<string,unknown>}>(academyId,'record_attendance_exception',body);
export const teacherStudioUpsertMakeUpLesson = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{make_up_lesson:Record<string,unknown>}>(academyId,'upsert_make_up_lesson',body);
export const teacherStudioRecordSessionQualityReview = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{quality_review:Record<string,unknown>}>(academyId,'record_session_quality_review',body);
export const teacherStudioUpsertRiskDefinition = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{risk_definition:Record<string,unknown>}>(academyId,'upsert_risk_definition',body);
export const teacherStudioEvaluateRetentionRisk = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{risk_evaluation:Record<string,unknown>}>(academyId,'evaluate_retention_risk',body);
export const teacherStudioCreateIntervention = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{intervention:Record<string,unknown>}>(academyId,'create_intervention',body);
export const teacherStudioUpdateIntervention = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{intervention:Record<string,unknown>}>(academyId,'update_intervention',body);
export const teacherStudioRecordInterventionActivity = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{activity:Record<string,unknown>}>(academyId,'record_intervention_activity',body);
export const teacherStudioUpsertRenewalOpportunity = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{renewal:Record<string,unknown>}>(academyId,'upsert_renewal_opportunity',body);
export const teacherStudioRecordRenewalActivity = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{activity:Record<string,unknown>}>(academyId,'record_renewal_activity',body);
export const teacherStudioUpdateOperationalAction = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{action_item:Record<string,unknown>}>(academyId,'update_operational_action',body);
export const teacherStudioCreateImportJob = (academyId:string,body:Record<string,unknown>) => staffRequest<{import_job:Record<string,unknown>}>(academyId,'create_import_job',body);
export const teacherStudioAddImportRow = (academyId:string,body:Record<string,unknown>) => staffRequest<{import_row:Record<string,unknown>}>(academyId,'add_import_row',body);
export const teacherStudioCommitImportJob = (academyId:string,body:Record<string,unknown>,staffActor?:string) => staffRequest<Record<string,unknown>>(academyId,'commit_import_job',body,staffActor);
export const teacherStudioRollbackImportJob = (academyId:string,body:Record<string,unknown>,staffActor?:string) => staffRequest<Record<string,unknown>>(academyId,'rollback_import_job',body,staffActor);
export const teacherStudioConvertLeadFull = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{result:Record<string,unknown>}>(academyId,'convert_lead_full',body);
export const teacherStudioUpsertCampaign = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{campaign:Record<string,unknown>}>(academyId,'upsert_campaign',body);
export const teacherStudioUpsertLocalization = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{localization:Record<string,unknown>;translations:Array<Record<string,unknown>>}>(academyId,'upsert_localization',body);
export const teacherStudioUpsertStaffBranchAssignment = (academyId:string,body:Record<string,unknown>) => staffRequest<{assignment:Record<string,unknown>}>(academyId,'upsert_staff_branch_assignment',body);
export const teacherStudioCreateAutomationVersion = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{automation_version:Record<string,unknown>}>(academyId,'create_automation_version',body);
export const teacherStudioExecuteAutomationEvent = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<Record<string,unknown>>(academyId,'execute_automation_event',body);
export const teacherStudioReviewAutomationExecution = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<Record<string,unknown>>(academyId,'review_automation_execution',body);
export const teacherStudioRequestAiAssistance = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{ai_request:Record<string,unknown>}>(academyId,'request_ai_assistance',body);
export const teacherStudioReviewAiAssistance = (academyId:string,body:Record<string,unknown>) => academyOperationsCommand<{ai_request:Record<string,unknown>;review:Record<string,unknown>}>(academyId,'review_ai_assistance',body);
export const teacherStudioCreateGuardianRelationship = (academyId:string,body:Record<string,unknown>) => staffRequest<{guardian:AcademyGuardian;relationship:AcademyGuardianRelationship}>(academyId,'create_guardian_relationship',body);
export const teacherStudioIssueGuardianLink = (academyId:string,body:Record<string,unknown>) => staffRequest<{link:Record<string,unknown>;telegram_link:string|null}>(academyId,'issue_guardian_link',body);
export const teacherStudioRevokeGuardianRelationship = (academyId:string,body:Record<string,unknown>) => staffRequest<{relationship:AcademyGuardianRelationship}>(academyId,'revoke_guardian_relationship',body);
export const teacherStudioUpsertGuardianPreferences = (academyId:string,body:Record<string,unknown>) => staffRequest<{preference:Record<string,unknown>}>(academyId,'upsert_guardian_preferences',body);
export const teacherStudioQueueGuardianNotification = (academyId:string,body:Record<string,unknown>) => staffRequest<{notification:Record<string,unknown>;deduplicated:boolean}>(academyId,'queue_guardian_notification',body);
export const teacherStudioSendGuardianMessage = (academyId:string,body:Record<string,unknown>) => staffRequest<{message:Record<string,unknown>}>(academyId,'send_guardian_message',body);

export const teacherStudioCreatePricingPlan = async (
  academyId: string,
  body: Record<string, unknown> & { plan_key: string; name: string; pricing_model: string; base_amount: number|string; idempotency_key: string },
  actorId?:string,
): Promise<AcademyPricingPlan> => {
  const data = await staffRequest<{ pricing_plan: AcademyPricingPlan }>(academyId,'create_pricing_plan',body,actorId);
  return data.pricing_plan;
};

export const teacherStudioCreateSubscription = async (
  academyId: string,
  body: Record<string, unknown> & { contact_id: string; pricing_plan_id: string; idempotency_key: string },
  actorId?:string,
): Promise<AcademySubscription> => {
  const data = await staffRequest<{ subscription: AcademySubscription }>(academyId,'create_subscription',body,actorId);
  return data.subscription;
};

export const teacherStudioManageSubscription = async (
  academyId: string,
  body: {
    subscription_id: string;
    operation: 'freeze' | 'resume' | 'cancel' | 'complete' | 'renew';
    reason?: string | null;
    starts_on?: string | null;
    ends_on?: string | null;
    idempotency_key: string;
  },
  actorId?:string,
): Promise<{ subscription: AcademySubscription; freeze: AcademySubscriptionFreeze | null; renewal?: AcademySubscription | null }> => staffRequest<{ subscription: AcademySubscription; freeze: AcademySubscriptionFreeze | null; renewal?: AcademySubscription | null }>(academyId,'manage_subscription',body,actorId);

export const teacherStudioCreateCharge = async (
  academyId: string,
  body: Record<string, unknown> & { subscription_id: string; idempotency_key: string },
  actorId?:string,
): Promise<AcademyCharge> => {
  const data = await staffRequest<{ charge: AcademyCharge }>(academyId,'create_charge',body,actorId);
  return data.charge;
};

export const teacherStudioAllocatePayment = async (
  academyId: string,
  body: { payment_id: string; charge_id: string; amount: number|string; idempotency_key: string },
  actorId?:string,
): Promise<AcademyPaymentAllocation> => {
  const data = await staffRequest<{ allocation: AcademyPaymentAllocation }>(academyId,'allocate_payment',body,actorId);
  return data.allocation;
};

export const teacherStudioPostAccountAdjustment = async (
  academyId: string,
  body: Record<string, unknown> & { contact_id: string; entry_type: string; amount: number|string; reason: string; idempotency_key: string },
  actorId?:string,
): Promise<AcademyLedgerEntry> => {
  const data = await staffRequest<{ ledger_entry: AcademyLedgerEntry }>(academyId,'post_account_adjustment',body,actorId);
  return data.ledger_entry;
};

export const teacherStudioRecordPaymentPromise = async (
  academyId: string,
  body: Record<string, unknown> & { contact_id: string; amount: number|string; promised_for: string; idempotency_key: string },
  actorId?:string,
): Promise<{ debt_case: AcademyDebtCase; promise: AcademyPaymentPromise }> => staffRequest<{ debt_case: AcademyDebtCase; promise: AcademyPaymentPromise }>(academyId,'record_payment_promise',body,actorId);

export const teacherStudioRecordPaymentReconciliation = async (
  academyId: string,
  body: Record<string, unknown> & { provider: string; provider_transaction_id: string; provider_event_id: string; status: string; payload_hash: string; idempotency_key: string },
  actorId?:string,
): Promise<AcademyPaymentReconciliation> => {
  const data = await staffRequest<{ reconciliation: AcademyPaymentReconciliation }>(academyId,'record_payment_reconciliation',body,actorId);
  return data.reconciliation;
};

export const teacherStudioResolveActionItem = async (
  academyId: string,
  body: { id: string; status?: 'resolved' | 'dismissed' | 'snoozed' | 'open'; resolution_note?: string | null },
): Promise<TeacherStudioActionItem> => {
  const data = await callTeacherStudio<{ action_item: TeacherStudioActionItem }>({
    method: 'POST',
    action: 'resolve_action_item',
    academyId,
    body,
  });
  return data.action_item;
};

export const teacherStudioSetLifecycleStage = async (
  academyId: string,
  body: { contact_id: string; lifecycle_stage: string },
): Promise<TeacherStudioContact> => {
  const data = await callTeacherStudio<{ contact: TeacherStudioContact }>({
    method: 'POST',
    action: 'set_lifecycle_stage',
    academyId,
    body,
  });
  return data.contact;
};

export const teacherStudioUpsertAutomationRule = async (
  academyId: string,
  body: {
    rule_key: string;
    name?: string;
    description?: string;
    channel?: 'telegram' | 'email' | 'inapp';
    threshold?: number | null;
    is_active?: boolean;
    metadata?: Record<string, unknown>;
  },
): Promise<TeacherStudioAutomationRule> => {
  const data = await callTeacherStudio<{ automation_rule: TeacherStudioAutomationRule }>({
    method: 'POST',
    action: 'upsert_automation_rule',
    academyId,
    body,
  });
  return data.automation_rule;
};

export const teacherStudioRunAutomationRules = async (
  academyId: string,
): Promise<Record<string, unknown>> => {
  return callTeacherStudio<Record<string, unknown>>({
    method: 'POST',
    action: 'run_automation_rules',
    academyId,
  });
};

export const teacherStudioCurriculum = async (
  academyId: string,
  classroomId?: string | null,
): Promise<TeacherStudioCurriculum> => {
  return callTeacherStudio<TeacherStudioCurriculum>({
    action: 'curriculum',
    academyId,
    params: { classroom_id: classroomId ?? undefined },
  });
};

export const teacherStudioTeacherDay = async (academyId: string, date?: string): Promise<TeacherDay> =>
  callTeacherStudio<TeacherDay>({ action: 'teacher_day', academyId, params: { date } });

export const teacherStudioStartTeacherLesson = async (
  academyId: string,
  body: { session_id: string; idempotency_key: string },
): Promise<{ run: Json }> => callTeacherStudio<{ run: Json }>({
  method: 'POST', action: 'teacher_lesson_start', academyId, body,
});

export const teacherStudioSaveTeacherAttendance = async (
  academyId: string,
  body: { session_id: string; records: Array<{ contact_id: string; status: string; notes?: string | null }>; idempotency_key: string },
): Promise<{ saved: number; duplicate?: boolean }> => callTeacherStudio<{ saved: number; duplicate?: boolean }>({
  method: 'POST', action: 'teacher_lesson_attendance', academyId, body,
});

export const teacherStudioFinishTeacherLesson = async (
  academyId: string,
  body: {
    session_id: string;
    coverage: TeacherLessonCoverage[];
    teacher_notes?: string | null;
    homework: { title: string; description: string; due_at: string };
    assign_homework: boolean;
    idempotency_key: string;
  },
): Promise<{ run: Json; assignment: Json | null; duplicate?: boolean }> =>
  callTeacherStudio<{ run: Json; assignment: Json | null; duplicate?: boolean }>({
    method: 'POST', action: 'teacher_lesson_finish', academyId, body,
  });

export const teacherStudioQuizzes = async (
  academyId: string,
  params?: { classroom_id?: string | null; course_id?: string | null },
): Promise<{ quizzes: TeacherStudioQuiz[]; questions: TeacherStudioQuizQuestion[] }> => {
  return callTeacherStudio<{ quizzes: TeacherStudioQuiz[]; questions: TeacherStudioQuizQuestion[] }>({
    action: 'quizzes',
    academyId,
    params: {
      classroom_id: params?.classroom_id ?? undefined,
      course_id: params?.course_id ?? undefined,
    },
  });
};

export const teacherStudioGradeCategories = async (
  academyId: string,
  classroomId: string,
): Promise<TeacherStudioGradeCategory[]> => {
  const data = await callTeacherStudio<{ grade_categories: TeacherStudioGradeCategory[] }>({
    action: 'grade_categories',
    academyId,
    params: { classroom_id: classroomId },
  });
  return data.grade_categories ?? [];
};

export const teacherStudioRubrics = async (academyId: string): Promise<TeacherStudioRubric[]> => {
  const data = await callTeacherStudio<{ rubrics: TeacherStudioRubric[] }>({ action: 'rubrics', academyId });
  return data.rubrics ?? [];
};

export const teacherStudioQuizAttempts = async (
  academyId: string,
  params?: { classroom_id?: string | null; quiz_id?: string | null },
): Promise<TeacherStudioQuizAttempt[]> => {
  const data = await callTeacherStudio<{ quiz_attempts: TeacherStudioQuizAttempt[] }>({
    action: 'quiz_attempts',
    academyId,
    params: { classroom_id: params?.classroom_id ?? undefined, quiz_id: params?.quiz_id ?? undefined },
  });
  return data.quiz_attempts ?? [];
};

export const teacherStudioAssignments = async (
  academyId: string,
  classroomId?: string | null,
): Promise<TeacherStudioAssignment[]> => {
  const data = await callTeacherStudio<{ assignments: TeacherStudioAssignment[] }>({
    action: 'assignments',
    academyId,
    params: { classroom_id: classroomId ?? undefined },
  });
  return data.assignments ?? [];
};

export const teacherStudioSubmissions = async (
  academyId: string,
  params?: { classroom_id?: string | null; assignment_id?: string | null },
): Promise<TeacherStudioSubmission[]> => {
  const data = await callTeacherStudio<{ submissions: TeacherStudioSubmission[] }>({
    action: 'submissions',
    academyId,
    params: {
      classroom_id: params?.classroom_id ?? undefined,
      assignment_id: params?.assignment_id ?? undefined,
    },
  });
  return data.submissions ?? [];
};

export const teacherStudioGradebook = async (
  academyId: string,
  classroomId: string,
): Promise<TeacherStudioGradebook> => {
  return callTeacherStudio<TeacherStudioGradebook>({
    action: 'gradebook',
    academyId,
    params: { classroom_id: classroomId },
  });
};

export const teacherStudioAttendance = async (
  academyId: string,
  classroomId: string,
): Promise<TeacherStudioAttendance[]> => {
  const data = await callTeacherStudio<{ attendance: TeacherStudioAttendance[] }>({
    action: 'attendance',
    academyId,
    params: { classroom_id: classroomId },
  });
  return data.attendance ?? [];
};

export const teacherStudioSchedule = async (
  academyId: string,
  classroomId?: string | null,
): Promise<TeacherStudioScheduleSlot[]> => {
  const data = await callTeacherStudio<{ schedule: TeacherStudioScheduleSlot[] }>({
    action: 'schedule',
    academyId,
    params: { classroom_id: classroomId ?? undefined },
  });
  return data.schedule ?? [];
};

export const teacherStudioBulkInvites = async (
  academyId: string,
  classroomId?: string | null,
): Promise<Array<{ id: string; classroom_id: string | null; email: string; first_name: string | null; last_name: string | null; status: string; invited_at: string; joined_at: string | null; error: string | null }>> => {
  const data = await callTeacherStudio<{ bulk_invites: Array<{ id: string; classroom_id: string | null; email: string; first_name: string | null; last_name: string | null; status: string; invited_at: string; joined_at: string | null; error: string | null }> }>({
    action: 'bulk_invites',
    academyId,
    params: { classroom_id: classroomId ?? undefined },
  });
  return data.bulk_invites ?? [];
};

export const teacherStudioStaff = async (academyId: string): Promise<TeacherStudioStaff[]> => {
  const rows:TeacherStudioStaff[]=[],seen=new Set<string>();
  let cursor:{after_source:string;after_id:string}|null=null;
  do {
    const data: {staff:TeacherStudioStaff[];has_more?:boolean;cursor?:{after_source:string;after_id:string}|null} = await callTeacherStudio({action: 'staff',academyId,body:cursor??{}});
    if(!Array.isArray(data.staff))throw new Error('The staff directory returned an incomplete response.');
    rows.push(...data.staff);
    if(!data.has_more)return rows; // Compatible with the installed pre-pagination API.
    const next=data.cursor,last=data.staff.at(-1),identity=JSON.stringify(next);
    if(!next||!last||next.after_id!==last.id||next.after_source!==last.source||seen.has(identity))throw new Error('The staff directory could not continue. Refresh and try again.');
    seen.add(identity);cursor=next;
  }while(cursor);
  return rows;
};

export const teacherStudioNotifications = async (academyId: string): Promise<TeacherStudioNotification[]> => {
  const data = await callTeacherStudio<{ notifications: TeacherStudioNotification[] }>({ action: 'notifications', academyId });
  return data.notifications ?? [];
};

export const teacherStudioAuditEvents = async (academyId: string): Promise<TeacherStudioAuditEvent[]> => {
  const data = await callTeacherStudio<{ audit_events: TeacherStudioAuditEvent[] }>({ action: 'audit_events', academyId });
  return data.audit_events ?? [];
};

export const teacherStudioBranding = async (academyId: string): Promise<TeacherStudioBranding | null> => {
  const data = await callTeacherStudio<{ branding: TeacherStudioBranding | null }>({ action: 'branding', academyId });
  return data.branding ?? null;
};

export const teacherStudioReferralLeaderboard = async (academyId: string): Promise<TeacherStudioReferralLeader[]> => {
  const data = await callTeacherStudio<{ leaderboard: TeacherStudioReferralLeader[] }>({ action: 'referral_leaderboard', academyId });
  return data.leaderboard ?? [];
};

export const teacherStudioUpsertCourse = async (
  academyId: string,
  body: {
    id?: string;
    classroom_id?: string;
    code?: string | null;
    title?: string;
    description?: string | null;
    level?: string | null;
    estimated_minutes?: number;
    status?: string;
  },
): Promise<TeacherStudioCourse> => {
  const data = await callTeacherStudio<{ course: TeacherStudioCourse }>({ method: 'POST', action: 'upsert_course', academyId, body });
  return data.course;
};

export const teacherStudioPublishCourse = async (
  academyId: string,
  body: { course_id: string; classroom_id?: string },
): Promise<TeacherStudioCourse> => {
  const data = await callTeacherStudio<{ course: TeacherStudioCourse }>({ method: 'POST', action: 'publish_course', academyId, body });
  return data.course;
};

export const teacherStudioAssignCourse = async (
  academyId: string,
  body: { course_id: string; classroom_id: string; status?: string; starts_at?: string | null; ends_at?: string | null },
): Promise<TeacherStudioClassroomCourse> => {
  const data = await callTeacherStudio<{ classroom_course: TeacherStudioClassroomCourse }>({ method: 'POST', action: 'assign_course', academyId, body });
  return data.classroom_course;
};

export const teacherStudioUpsertModule = async (
  academyId: string,
  body: { id?: string; classroom_id?: string; course_id: string; title?: string; description?: string | null; status?: string; position?: number },
): Promise<TeacherStudioCourseModule> => {
  const data = await callTeacherStudio<{ module: TeacherStudioCourseModule }>({ method: 'POST', action: 'upsert_module', academyId, body });
  return data.module;
};

export const teacherStudioUpsertLesson = async (
  academyId: string,
  body: {
    id?: string;
    classroom_id?: string;
    course_id: string;
    module_id: string;
    title?: string;
    summary?: string | null;
    lesson_content?: Json;
    estimated_minutes?: number;
    prerequisite_lesson_id?: string | null;
    available_from?: string | null;
    status?: string;
  },
): Promise<TeacherStudioLesson> => {
  const data = await callTeacherStudio<{ lesson: TeacherStudioLesson }>({ method: 'POST', action: 'upsert_lesson', academyId, body });
  return data.lesson;
};

export const teacherStudioUpsertQuiz = async (
  academyId: string,
  body: {
    id?: string;
    classroom_id?: string;
    course_id: string;
    lesson_id?: string | null;
    title?: string;
    description?: string | null;
    status?: string;
    passing_score?: number;
    attempts_allowed?: number;
    time_limit_seconds?: number | null;
    shuffle_questions?: boolean;
    show_answers_after?: boolean;
  },
): Promise<TeacherStudioQuiz> => {
  const data = await callTeacherStudio<{ quiz: TeacherStudioQuiz }>({ method: 'POST', action: 'upsert_quiz', academyId, body });
  return data.quiz;
};

export const teacherStudioUpsertQuizQuestion = async (
  academyId: string,
  body: {
    id?: string;
    classroom_id?: string;
    quiz_id: string;
    question_type: TeacherStudioQuizQuestion['question_type'];
    prompt: string;
    options?: unknown[];
    correct_answer?: unknown;
    points?: number;
    explanation?: string | null;
    position?: number;
  },
): Promise<TeacherStudioQuizQuestion> => {
  const data = await callTeacherStudio<{ question: TeacherStudioQuizQuestion }>({ method: 'POST', action: 'upsert_quiz_question', academyId, body });
  return data.question;
};

export const teacherStudioUpsertGradeCategory = async (
  academyId: string,
  body: { id?: string; classroom_id: string; name: string; weight: number; position?: number; drop_lowest?: number },
): Promise<TeacherStudioGradeCategory> => {
  const data = await callTeacherStudio<{ grade_category: TeacherStudioGradeCategory }>({ method: 'POST', action: 'upsert_grade_category', academyId, body });
  return data.grade_category;
};

export const teacherStudioUpsertRubric = async (
  academyId: string,
  body: { id?: string; title: string; description?: string | null; criteria: unknown[]; status?: string },
): Promise<TeacherStudioRubric> => {
  const data = await callTeacherStudio<{ rubric: TeacherStudioRubric }>({ method: 'POST', action: 'upsert_rubric', academyId, body });
  return data.rubric;
};

export const teacherStudioGradeQuizAttempt = async (
  academyId: string,
  body: { attempt_id: string; score: number; max_score?: number; feedback?: string | null },
): Promise<TeacherStudioQuizAttempt> => {
  const data = await callTeacherStudio<{ attempt: TeacherStudioQuizAttempt }>({ method: 'POST', action: 'grade_quiz_attempt', academyId, body });
  return data.attempt;
};

export const teacherStudioSetEnrollmentStatus = async (
  academyId: string,
  body: { id?: string; classroom_id?: string; contact_id?: string; membership_status: TeacherStudioClassroomMembership['status'] },
): Promise<TeacherStudioClassroomMembership> => {
  const data = await callTeacherStudio<{ classroom_membership: TeacherStudioClassroomMembership }>({ method: 'POST', action: 'set_enrollment_status', academyId, body });
  return data.classroom_membership;
};

export const teacherStudioCreateAssignment = async (
  academyId: string,
  body: {
    classroom_id: string;
    course_id?: string | null;
    module_id?: string | null;
    lesson_id?: string | null;
    grade_category_id?: string | null;
    rubric_id?: string | null;
    title: string;
    description?: string | null;
    assignment_type?: string;
    due_at?: string | null;
    max_score?: number | null;
    score_weight?: number;
    attempts_allowed?: number;
    allow_late_submission?: boolean;
    status?: string;
  },
): Promise<TeacherStudioAssignment> => {
  const data = await callTeacherStudio<{ assignment: TeacherStudioAssignment }>({
    method: 'POST',
    action: 'create_assignment',
    academyId,
    body,
  });
  return data.assignment;
};

export const teacherStudioUpdateAssignment = async (
  academyId: string,
  body: {
    id: string;
    title?: string;
    description?: string | null;
    assignment_type?: string;
    course_id?: string | null;
    module_id?: string | null;
    lesson_id?: string | null;
    grade_category_id?: string | null;
    rubric_id?: string | null;
    due_at?: string | null;
    max_score?: number | null;
    score_weight?: number;
    attempts_allowed?: number;
    allow_late_submission?: boolean;
    status?: string;
  },
): Promise<TeacherStudioAssignment> => {
  const data = await callTeacherStudio<{ assignment: TeacherStudioAssignment }>({
    method: 'POST',
    action: 'update_assignment',
    academyId,
    body,
  });
  return data.assignment;
};

export const teacherStudioSubmitAssignmentForContact = async (
  academyId: string,
  body: {
    assignment_id: string;
    contact_id: string;
    score?: number | null;
    max_score?: number | null;
    notes?: string | null;
    feedback?: Json;
    session_id?: string | null;
  },
): Promise<TeacherStudioSubmission> => {
  const data = await callTeacherStudio<{ submission: TeacherStudioSubmission }>({
    method: 'POST',
    action: 'submit_assignment',
    academyId,
    body,
  });
  return data.submission;
};

export const teacherStudioGradeSubmission = async (
  academyId: string,
  body: {
    submission_id?: string;
    assignment_id?: string;
    contact_id?: string;
    score: number;
    max_score?: number | null;
    notes?: string | null;
  },
): Promise<TeacherStudioSubmission> => {
  const data = await callTeacherStudio<{ submission: TeacherStudioSubmission }>({
    method: 'POST',
    action: 'grade_submission',
    academyId,
    body,
  });
  return data.submission;
};

export const teacherStudioMarkAttendance = async (
  academyId: string,
  body: {
    classroom_id: string;
    session_date: string;
    records: Array<{ contact_id: string; status: string; notes?: string | null }>;
  },
): Promise<{ attendance: TeacherStudioAttendance[]; count: number }> => {
  return callTeacherStudio<{ attendance: TeacherStudioAttendance[]; count: number }>({
    method: 'POST',
    action: 'mark_attendance',
    academyId,
    body,
  });
};

export const teacherStudioBulkInvite = async (
  academyId: string,
  body: {
    classroom_id?: string | null;
    contacts: Array<{ first_name?: string; last_name?: string; email: string }>;
  },
): Promise<{ results: Array<Record<string, unknown>>; summary: { ok: number; failed: number; total: number } }> => {
  return callTeacherStudio<{ results: Array<Record<string, unknown>>; summary: { ok: number; failed: number; total: number } }>({
    method: 'POST',
    action: 'bulk_invite',
    academyId,
    body,
  });
};

export const teacherStudioUpsertSchedule = async (
  academyId: string,
  body: {
    id?: string;
    classroom_id: string;
    day_of_week: number;
    start_time: string;
    end_time?: string | null;
    timezone?: string;
    label?: string | null;
    is_active?: boolean;
  },
): Promise<TeacherStudioScheduleSlot> => {
  const data = await callTeacherStudio<{ schedule: TeacherStudioScheduleSlot }>({
    method: 'POST',
    action: 'upsert_schedule',
    academyId,
    body,
  });
  return data.schedule;
};

export const teacherStudioDeleteSchedule = async (
  academyId: string,
  id: string,
): Promise<{ ok: boolean }> => {
  return callTeacherStudio<{ ok: boolean }>({
    method: 'POST',
    action: 'delete_schedule',
    academyId,
    body: { id },
  });
};

export const teacherStudioRecordPlacement = async (
  academyId: string,
  body: { contact_id: string; diagnostic_score?: number | null; level?: string | null },
): Promise<{ contact_id: string; level: string; score: number | null; suggested_classrooms: Array<{ id: string; name: string }> }> => {
  return callTeacherStudio<{ contact_id: string; level: string; score: number | null; suggested_classrooms: Array<{ id: string; name: string }> }>({
    method: 'POST',
    action: 'record_placement',
    academyId,
    body,
  });
};

export const teacherStudioUpsertStaff = async (
  academyId: string,
  body: {
    id?: string;
    staff_email: string;
    name?: string;
    staff_role?: string;
    classroom_ids?: string[];
    scope_type?: string;
    scope_ids?: string[];
    branch_ids?: string[];
    idempotency_key?: string;
    is_active?: boolean;
    status?: string;
    starts_at?: string | null;
    expires_at?: string | null;
  },
  expectedActor?: string,
): Promise<TeacherStudioStaff> => {
  const data = await staffRequest<{ staff: TeacherStudioStaff }>(academyId,'upsert_staff',body,expectedActor);
  return data.staff;
};

export const teacherStudioRemoveStaff = async (
  academyId: string,
  id: string,
  expectedActor?: string,
): Promise<{ ok: boolean }> => {
  return staffRequest<{ok:boolean}>(academyId,'remove_staff',{id},expectedActor);
};

export const teacherStudioIssueAcademyCertificate = async (
  academyId: string,
  body: {
    contact_id: string;
    classroom_id?: string | null;
    exam_type?: string;
    overall_score?: number | null;
    candidate_name?: string;
    center_name?: string;
  },
): Promise<{ certificate: Record<string, unknown> | null; share_url: string }> => {
  return callTeacherStudio<{ certificate: Record<string, unknown> | null; share_url: string }>({
    method: 'POST',
    action: 'issue_academy_certificate',
    academyId,
    body,
  });
};

export const teacherStudioComputeAtRisk = async (
  academyId: string,
  classroomId?: string | null,
): Promise<{ at_risk: TeacherStudioAtRiskStudent[]; scanned: number }> => {
  return callTeacherStudio<{ at_risk: TeacherStudioAtRiskStudent[]; scanned: number }>({
    method: 'POST',
    action: 'compute_at_risk',
    academyId,
    body: { classroom_id: classroomId ?? undefined },
  });
};

export const teacherStudioDispatchNotifications = async (
  academyId: string,
): Promise<Record<string, unknown>> => {
  return callTeacherStudio<Record<string, unknown>>({
    method: 'POST',
    action: 'dispatch_notifications',
    academyId,
  });
};

export const teacherStudioGenerateParentReport = async (
  academyId: string,
  body: { contact_id: string; label?: string | null; expires_in_days?: number },
): Promise<{ token: Record<string, unknown> | null; share_url: string; contact: { id: string; name: string } }> => {
  return callTeacherStudio<{ token: Record<string, unknown> | null; share_url: string; contact: { id: string; name: string } }>({
    method: 'POST',
    action: 'generate_parent_report',
    academyId,
    body,
  });
};

export const teacherStudioUpsertBranding = async (
  academyId: string,
  body: {
    display_name?: string | null;
    tagline?: string | null;
    logo_url?: string | null;
    favicon_url?: string | null;
    primary_color?: string | null;
    accent_color?: string | null;
    hide_schood_logo?: boolean;
    custom_domain?: string | null;
    footer_text?: string | null;
  },
): Promise<TeacherStudioBranding> => {
  const data = await callTeacherStudio<{ branding: TeacherStudioBranding }>({
    method: 'POST',
    action: 'upsert_branding',
    academyId,
    body,
  });
  return data.branding;
};

export type AcademyOperationalRecord = Record<string, unknown> & { id: string };
export type AcademyAccessInvitation = AcademyOperationalRecord & {
  invite_kind: 'student' | 'staff' | 'guardian';
  email: string;
  role: string | null;
  contact_id: string | null;
  classroom_id: string | null;
  guardian_relationship_id: string | null;
  status: string;
  delivery_status: string;
  delivery_error: string | null;
  token_expires_at: string;
  resend_count: number;
  academy?: { id: string; name: string; slug: string } | null;
  review_hash?: string;
  student_name?: string;
  classroom_name?: string;
  shared_sections?: string[];
  access_status?: string;
};
export type AcademyServiceRequest = AcademyOperationalRecord & {
  contact_id: string | null;
  guardian_id: string | null;
  request_type: string;
  subject: string;
  details: string;
  priority: string;
  status: string;
  created_at: string;
  due_at: string | null;
};
export type AcademyOperationalData = {
  accessInvitations?: {
    invitations: AcademyAccessInvitation[];
    access: TeacherStudioAccessProfile;
    contacts: AcademyOperationalRecord[];
    classrooms: AcademyOperationalRecord[];
    guardian_relationships: AcademyOperationalRecord[];
    guardians: AcademyOperationalRecord[];
    reference_cursors?: Record<string,{after_id:string}|null>;
    staff_cursor?: {before_time:string;before_id:string}|null;
  };
  timetable?: {
    terms: AcademyOperationalRecord[];
    series: AcademyOperationalRecord[];
    runs: AcademyOperationalRecord[];
    schedules: AcademyOperationalRecord[];
    rooms: AcademyOperationalRecord[];
    staff: AcademyOperationalRecord[];
    branches: AcademyOperationalRecord[];
    classrooms: AcademyOperationalRecord[];
  };
  serviceRequests?: { requests: AcademyServiceRequest[]; events: AcademyOperationalRecord[] };
  journeys?: {
    journeys: AcademyOperationalRecord[];
    steps: AcademyOperationalRecord[];
    enrollments: AcademyOperationalRecord[];
  };
  collections?: { cases: AcademyOperationalRecord[]; attempts: AcademyOperationalRecord[] };
  workforce?: { requests: AcademyOperationalRecord[]; branches: AcademyOperationalRecord[] };
  sensitiveCases?: { cases: AcademyOperationalRecord[]; events: AcademyOperationalRecord[] };
  competencyPlans?: {
    frameworks: AcademyOperationalRecord[];
    competencies: AcademyOperationalRecord[];
    plans: AcademyOperationalRecord[];
    items: AcademyOperationalRecord[];
    evidence: AcademyOperationalRecord[];
  };
  integrations?: {
    endpoints: AcademyOperationalRecord[];
    deliveries: AcademyOperationalRecord[];
    exports: AcademyOperationalRecord[];
  };
};

const academyOperationalRead = <T>(academyId: string, action: string): Promise<T> => callTeacherStudio<T>({ action, academyId });

export const teacherStudioAccessInvitations = async (academyId: string) => {
  const data=await academyOperationalRead<NonNullable<AcademyOperationalData['accessInvitations']>>(academyId,'access_invitations');
  const fields={invitations:'invitations',contacts:'contacts',classrooms:'classrooms',relationships:'guardian_relationships',guardians:'guardians'} as const;
  await Promise.all(Object.entries(fields).map(async([mode,field])=>{
    let cursor=data.reference_cursors?.[mode]??null;const seen=new Set<string>();
    while(cursor){
      const fingerprint=JSON.stringify(cursor);if(seen.has(fingerprint))throw new Error('The invitation list did not finish loading. Refresh it.');seen.add(fingerprint);
      const page=await callTeacherStudio<Record<string,unknown>>({action:'access_invitations',academyId,body:{reference_mode:mode,...cursor}});
      if(!Array.isArray(page[mode])||typeof page.has_more!=='boolean')throw new Error('The invitation list did not finish loading. Refresh it.');
      (data[field] as AcademyOperationalRecord[]).push(...page[mode] as AcademyOperationalRecord[]);
      cursor=page.has_more?page.cursor as {after_id:string}:null;
      if(page.has_more&&!cursor?.after_id)throw new Error('The invitation list did not finish loading. Refresh it.');
    }
  }));
  let cursor=data.staff_cursor??null;const seen=new Set<string>();
  while(cursor){
    const fingerprint=JSON.stringify(cursor);if(seen.has(fingerprint))throw new Error('The invitation list did not finish loading. Refresh it.');seen.add(fingerprint);
    const page=await callTeacherStudio<{invitations:AcademyAccessInvitation[];has_more:boolean;cursor:typeof cursor}>({action:'access_invitations',academyId,body:{reference_mode:'staff',...cursor}});
    if(!Array.isArray(page.invitations)||typeof page.has_more!=='boolean')throw new Error('The invitation list did not finish loading. Refresh it.');
    data.invitations.push(...page.invitations);cursor=page.has_more?page.cursor:null;
    if(page.has_more&&!cursor?.before_id)throw new Error('The invitation list did not finish loading. Refresh it.');
  }
  data.invitations.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  return data;
};
export const teacherStudioTimetablePlanning = (academyId: string) => academyOperationalRead<NonNullable<AcademyOperationalData['timetable']>>(academyId, 'timetable_planning');
export const teacherStudioServiceRequests = (academyId: string) => academyOperationalRead<NonNullable<AcademyOperationalData['serviceRequests']>>(academyId, 'service_requests');
export const teacherStudioCommunicationJourneys = (academyId: string) => academyOperationalRead<NonNullable<AcademyOperationalData['journeys']>>(academyId, 'communication_journeys');
export const teacherStudioCollectionCases = (academyId: string) => academyOperationalRead<NonNullable<AcademyOperationalData['collections']>>(academyId, 'collection_cases');
export const teacherStudioWorkforceRequests = (academyId: string) => academyOperationalRead<NonNullable<AcademyOperationalData['workforce']>>(academyId, 'workforce_requests');
export const teacherStudioSensitiveCases = (academyId: string) => academyOperationalRead<NonNullable<AcademyOperationalData['sensitiveCases']>>(academyId, 'sensitive_cases');
export const teacherStudioCompetencyPlans = (academyId: string) => academyOperationalRead<NonNullable<AcademyOperationalData['competencyPlans']>>(academyId, 'competency_plans');
export const teacherStudioIntegrationEndpoints = (academyId: string) => academyOperationalRead<NonNullable<AcademyOperationalData['integrations']>>(academyId, 'integration_endpoints');

export const teacherStudioOperationalCommand = <T = Record<string, unknown>>(academyId: string, action: string, body: Record<string, unknown> = {},expectedActor?:string): Promise<T> =>
  ['create_access_invitation','resend_access_invitation','revoke_access_invitation'].includes(action)?staffRequest<T>(academyId,action,body,expectedActor):callTeacherStudio<T>({ method: 'POST', action, academyId, body });

export const teacherStudioInvitationStatus = (token: string,actorId:string) => staffRequest<{invitation:AcademyAccessInvitation}>('','invitation_status',{token},actorId);
export const teacherStudioAcceptAccessInvitation = (token: string,reviewHash:string|undefined,actorId:string) => staffRequest<{invitation:AcademyAccessInvitation}>('','accept_access_invitation',{token,review_hash:reviewHash},actorId);
export const teacherStudioStudentServiceRequests = (academyId?: string | null) => callTeacherStudio<{ requests: AcademyServiceRequest[]; events: AcademyOperationalRecord[]; contact: AcademyOperationalRecord }>({ action: 'student_service_requests', academyId });
export const teacherStudioCreateStudentServiceRequest = (academyId: string, body: Record<string, unknown>) => callTeacherStudio<{ request: AcademyServiceRequest }>({ method: 'POST', action: 'student_service_request_create', academyId, body });
export const teacherStudioStudentLearningPlans = (academyId?: string | null) => callTeacherStudio<{ plans: AcademyOperationalRecord[]; items: AcademyOperationalRecord[]; evidence: AcademyOperationalRecord[]; contact: AcademyOperationalRecord }>({ action: 'student_learning_plans', academyId });
export const teacherStudioGuardianServiceRequests = (relationshipId:string,actorId?:string) => parentRequest<{relationship_id:string;requests:AcademyServiceRequest[];events:AcademyOperationalRecord[];guardians:AcademyOperationalRecord[];history_has_more?:boolean}>('','guardian_service_requests',{relationship_id:relationshipId},actorId);
export const teacherStudioCreateGuardianServiceRequest = (body:Record<string,unknown>,actorId?:string) => parentRequest<{request:AcademyServiceRequest}>('','guardian_service_request_create',body,actorId);
export const teacherStudioSubmitSensitiveReport = (body: Record<string, unknown>) => callTeacherStudio<{ case: { id: string; case_number: number; status: string } }>({ method: 'POST', action: 'submit_sensitive_report', body });

export const academyTelegramCreateStaffLink = async (academyId: string): Promise<{ url: string; expires_in_seconds: number }> => {
  const { data, error } = await supabase.functions.invoke('academy-telegram', {
    body: { action: 'create_staff_link', academy_id: academyId },
  });
  const link = data?.link;
  if (error || !link?.url) throw new Error(error?.message || 'Telegram link could not be created');
  return link as { url: string; expires_in_seconds: number };
};
