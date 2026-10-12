import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

type StaffPersona = "owner" | "admin" | "center_admin" | "branch_manager" | "manager" | "counselor" | "receptionist" | "salesperson" | "cashier" | "accountant" | "payroll_officer" | "parent_liaison" | "teacher" | "assistant";
type Persona = StaffPersona | "student" | "guardian";

const academyId = "academy-route-smoke";
const classroomId = "classroom-route-smoke";
const studentContactId = "contact-route-smoke";

const ownerAccess = {
  role: "owner",
  source: "tenant",
  scope: "academy",
  classroom_ids: [],
  permissions: {
    viewAcademy: true,
    manageAcademy: true,
    manageStaff: true,
    manageFinance: true,
    viewFinance: true,
    collectFinance: true,
    adjustFinance: true,
    refundFinance: true,
    discountFinance: true,
    reconcileFinance: true,
    manageCashier: true,
    viewEconomics: true,
    viewPayroll: true,
    calculatePayroll: true,
    approvePayroll: true,
    payPayroll: true,
    manageOffers: true,
    manageBranding: true,
    manageAutomation: true,
    viewAutomation: true,
    viewContacts: true,
    manageContacts: true,
    viewClassrooms: true,
    manageClassrooms: true,
    manageRoster: true,
    manageMessages: true,
    manageAnnouncements: true,
    sendGlobalAnnouncements: true,
    manageAlerts: true,
    resolveAlerts: true,
    viewEducationOS: true,
    resolveActionItems: true,
    manageAssignments: true,
    gradeSubmissions: true,
    markAttendance: true,
    manageSchedule: true,
    manageAcademicOperations: true,
    manageResources: true,
    viewReports: true,
    issueCertificates: true,
    dispatchNotifications: true,
    viewNotifications: true,
    viewReferrals: true,
    viewAudit: true,
    viewBranches: true,
    manageBranches: true,
    viewAdmissions: true,
    manageAdmissions: true,
    assignAdmissions: true,
    exportAdmissions: true,
    manageTrialFeedback: true,
    manageGuardians: true,
    communicateGuardians: true,
    manageRetention: true,
    viewBusinessIntelligence: true,
    viewAcademicReports: true,
    viewOperationalReports: true,
    viewFinancialReports: true,
    viewStaffPerformance: true,
    viewRisk: true,
    manageLocalization: true,
    useAcademyAI: true,
    manageImports: true,
  },
};

type Permission = keyof typeof ownerAccess.permissions;

const productionAccess = (role: StaffPersona) => {
  const ownerAdmin = role === "owner" || role === "admin";
  const centerAdmin = role === "center_admin";
  const branchManager = role === "branch_manager";
  const manager = role === "manager" || role === "counselor";
  const salesperson = role === "salesperson";
  const cashier = role === "cashier";
  const accountant = role === "accountant";
  const payrollOfficer = role === "payroll_officer";
  const parentLiaison = role === "parent_liaison";
  const receptionist = role === "receptionist";
  const teacher = role === "teacher" || role === "assistant";
  const ops = ownerAdmin || centerAdmin || manager || branchManager;
  const staff = ops || teacher || receptionist || salesperson || cashier || accountant || payrollOfficer || parentLiaison;
  const classroomLms = ownerAdmin || teacher;
  const financeViewer = ownerAdmin || centerAdmin || branchManager || cashier || accountant;
  const reportingViewer = ownerAdmin || centerAdmin || manager || branchManager || accountant;
  const permissions: Record<Permission, boolean> = {
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
    viewAdmissions: ops || receptionist || salesperson,
    manageAdmissions: ops || receptionist || salesperson,
    assignAdmissions: ownerAdmin || centerAdmin || manager || branchManager,
    exportAdmissions: ownerAdmin || centerAdmin || manager,
    manageTrialFeedback: staff,
    viewContacts: staff,
    manageContacts: ops || receptionist || salesperson || parentLiaison,
    viewClassrooms: staff,
    manageClassrooms: ops,
    manageRoster: ops,
    manageMessages: staff,
    manageAnnouncements: ops || receptionist || teacher || parentLiaison,
    sendGlobalAnnouncements: ops,
    manageAlerts: staff,
    resolveAlerts: staff,
    viewEducationOS: staff,
    resolveActionItems: staff,
    manageAssignments: classroomLms,
    gradeSubmissions: classroomLms,
    markAttendance: classroomLms || receptionist,
    manageSchedule: ownerAdmin || centerAdmin || manager || teacher,
    manageAcademicOperations: ops,
    manageGuardians: ops || parentLiaison,
    communicateGuardians: ops || receptionist || teacher || parentLiaison,
    manageRetention: ops,
    viewBusinessIntelligence: reportingViewer,
    viewAcademicReports: reportingViewer || teacher,
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
    dispatchNotifications: ops || receptionist || parentLiaison,
    viewNotifications: ops || receptionist || parentLiaison,
    viewReferrals: ops || salesperson,
    viewAudit: ownerAdmin || centerAdmin || manager || accountant,
  };
  const assignedBranches = ["branch_manager", "receptionist", "salesperson", "cashier", "parent_liaison"].includes(role);
  const assignedClassrooms = role === "teacher" || role === "assistant";
  return {
    role,
    source: centerAdmin ? "center" : ownerAdmin ? "tenant" : "staff",
    scope: assignedBranches ? "assigned_branches" : assignedClassrooms ? "assigned_classrooms" : "academy",
    classroom_ids: assignedClassrooms ? [classroomId] : [],
    branch_ids: assignedBranches ? ["branch-main"] : [],
    permissions,
  };
};

const accessForPersona = (persona: Persona) => {
  if (persona !== "student" && persona !== "guardian") return productionAccess(persona);
  return {
    role: persona,
    source: "grant",
    scope: "assigned_classrooms",
    classroom_ids: [classroomId],
    branch_ids: [],
    permissions: Object.fromEntries(Object.keys(ownerAccess.permissions).map((permission) => [permission, false])) as Record<Permission, boolean>,
  };
};

const academy = (persona: Persona) => ({
  id: academyId,
  name: "Route Smoke Academy",
  slug: "route-smoke",
  type: "team",
  metadata: { service_family: "academy" },
  role: persona === "student" ? "student" : persona === "guardian" ? "guardian" : accessForPersona(persona).role,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  access: accessForPersona(persona),
});

const guardianProfile = {
  id: "guardian-route-smoke",
  academy_id: academyId,
  user_id: "guardian-user",
  full_name: "Malika Karimova",
  phone: "+998901111111",
  email: "malika@example.test",
  telegram_user_id: "100200300",
  telegram_username: "malika_parent",
  telegram_verified_at: "2026-07-10T09:00:00.000Z",
  status: "verified",
  locale: "uz",
  notes: null,
  created_at: "2026-07-01T09:00:00.000Z",
  updated_at: "2026-07-10T09:00:00.000Z",
};
const guardianRelationship = {
  id: "guardian-relationship-route-smoke",
  academy_id: academyId,
  contact_id: studentContactId,
  guardian_id: guardianProfile.id,
  relationship_type: "mother",
  status: "active",
  is_primary_contact: true,
  is_financially_responsible: true,
  is_emergency_contact: false,
  can_view_status: true,
  can_view_attendance: true,
  can_view_grades: true,
  can_view_homework: true,
  can_view_schedule: true,
  can_view_payments: true,
  can_view_debt: true,
  can_view_messages: true,
  can_view_progress_reports: true,
  can_view_resources: true,
  can_view_announcements: true,
  can_message_academy: true,
  consent_status: "granted",
  consented_at: "2026-07-10T09:00:00.000Z",
  revoked_at: null,
  revocation_reason: null,
  created_at: "2026-07-01T09:00:00.000Z",
  updated_at: "2026-07-10T09:00:00.000Z",
};

const classroom = {
  id: classroomId,
  academy_id: academyId,
  name: "IELTS Evening A",
  description: "Route-smoked classroom",
  is_active: true,
  metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  member_count: 1,
};

const contact = {
  id: studentContactId,
  academy_id: academyId,
  user_id: "student-user",
  first_name: "Ali",
  last_name: "Karimov",
  email: "ali@example.test",
  phone: "+998900000000",
  telegram_id: null,
  status: "active",
  placement_level: "B2",
  placement_score: 72,
  lifecycle_stage: "learning",
  notify_enabled: true,
  metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const membership = {
  id: "membership-route-smoke",
  academy_id: academyId,
  classroom_id: classroomId,
  contact_id: studentContactId,
  role: "student",
  joined_at: "2026-01-01T00:00:00.000Z",
  metadata: {},
};

const assignment = {
  id: "assignment-route-smoke",
  academy_id: academyId,
  classroom_id: classroomId,
  title: "Writing Task 2",
  description: "Submit the essay draft.",
  assignment_type: "writing",
  experience_id: null,
  experience_url: null,
  due_at: "2026-07-20T09:00:00.000Z",
  released_at: "2026-07-01T09:00:00.000Z",
  prerequisite_id: null,
  position: 1,
  max_score: 100,
  score_weight: 1,
  course_id: "course-route-smoke",
  module_id: "module-route-smoke",
  lesson_id: "lesson-route-smoke",
  grade_category_id: "grade-category-route-smoke",
  rubric_id: "rubric-route-smoke",
  attempts_allowed: 2,
  allow_late_submission: false,
  status: "active",
  metadata: {},
  created_by: "teacher-user",
  created_at: "2026-07-01T09:00:00.000Z",
  updated_at: "2026-07-01T09:00:00.000Z",
};

const course = {
  id: "course-route-smoke",
  academy_id: academyId,
  code: "IELTS-01",
  title: "IELTS Foundation",
  description: "Structured IELTS course",
  level: "B1",
  estimated_minutes: 600,
  status: "published",
  published_at: "2026-07-01T09:00:00.000Z",
  metadata: {},
};
const courseModule = {
  id: "module-route-smoke",
  academy_id: academyId,
  course_id: course.id,
  title: "Reading foundations",
  description: "Core reading skills",
  position: 0,
  status: "published",
  unlock_rule: {},
  metadata: {},
};
const lesson = {
  id: "lesson-route-smoke",
  academy_id: academyId,
  course_id: course.id,
  module_id: courseModule.id,
  prerequisite_lesson_id: null,
  title: "Finding evidence",
  summary: "Read for exact support.",
  content: [{ type: "rich_text", text: "Start with the question stem." }],
  position: 0,
  estimated_minutes: 20,
  status: "published",
  available_from: null,
  completion_rule: { type: "manual" },
  metadata: {},
  locked: false,
};
const quiz = {
  id: "quiz-route-smoke",
  academy_id: academyId,
  course_id: course.id,
  lesson_id: lesson.id,
  title: "Evidence check",
  instructions: "Choose the best answer.",
  status: "published",
  passing_score: 60,
  attempts_allowed: 2,
  time_limit_seconds: 600,
  shuffle_questions: false,
  show_answers_after: true,
  metadata: {},
};
const quizQuestion = {
  id: "question-route-smoke",
  quiz_id: quiz.id,
  question_type: "single_choice",
  prompt: "Which option is supported?",
  options: ["A", "B"],
  points: 1,
  position: 0,
  metadata: {},
};
const gradeCategory = {
  id: "grade-category-route-smoke",
  academy_id: academyId,
  classroom_id: classroomId,
  name: "Coursework",
  weight: 40,
  drop_lowest_count: 1,
  position: 0,
  status: "active",
  metadata: {},
};
const rubric = {
  id: "rubric-route-smoke",
  academy_id: academyId,
  title: "Writing quality",
  description: "Analytic writing rubric",
  criteria: [
    { id: "evidence", name: "Evidence", max_points: 6 },
    { id: "language", name: "Language", max_points: 4 },
  ],
  status: "active",
  metadata: {},
};

const studentDashboard = {
  academies: [
    {
      id: academyId,
      name: "Route Smoke Academy",
      slug: "route-smoke",
      type: "academy",
      metadata: {},
    },
  ],
  contacts: [contact],
  classrooms: [classroom],
  classroom_memberships: [membership],
  entitlements: [
    {
      id: "entitlement-route-smoke",
      academy_id: academyId,
      contact_id: studentContactId,
      user_id: "student-user",
      offer_id: "offer-route-smoke",
      payment_id: "payment-route-smoke",
      grant_type: "classroom_access",
      resource_type: "classroom",
      resource_id: classroomId,
      capability_key: null,
      quantity: 1,
      remaining: 1,
      starts_at: "2026-01-01T00:00:00.000Z",
      expires_at: null,
      status: "active",
      source: "click",
      metadata: {},
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ],
  alerts: [],
  announcements: [],
  messages: [],
  payments: [],
  sessions: [
    {
      id: "student-session-route-smoke",
      academy_id: academyId,
      classroom_id: classroomId,
      title: "Live speaking clinic",
      session_type: "regular",
      delivery_mode: "online",
      starts_at: "2026-09-02T10:00:00.000Z",
      ends_at: "2026-09-02T11:00:00.000Z",
      timezone: "Asia/Tashkent",
      status: "confirmed",
      meeting_provider: "google_meet",
      join_available: false,
    },
  ],
};

const emptyStudentDashboardFixture = {
  ...studentDashboard,
  academies: [],
  contacts: [],
  classrooms: [],
  classroom_memberships: [],
  entitlements: [],
  sessions: [],
};

const educationOS = {
  generated_at: "2026-07-12T00:00:00.000Z",
  access: ownerAccess,
  action_queue: [
    {
      id: "action-grading",
      academy_id: academyId,
      dedupe_key: "grading:route-smoke",
      source_type: "grading_backlog",
      priority: "high",
      title: "Grade Writing Task 2",
      description: "One student is waiting for feedback.",
      recommended_action: "Open the gradebook.",
      contact_id: studentContactId,
      classroom_id: classroomId,
      due_at: "2026-07-13T09:00:00.000Z",
      status: "open",
      metadata: {},
      created_at: "2026-07-12T00:00:00.000Z",
      updated_at: "2026-07-12T00:00:00.000Z",
    },
  ],
  pipeline: [
    {
      contact_id: studentContactId,
      name: "Ali Karimov",
      email: "ali@example.test",
      status: "active",
      stage: "learning",
      derived_stage: "learning",
      classroom_ids: [classroomId],
      next_action: "Grade submitted essay.",
      attention: "Needs feedback",
      pending_amount: 0,
      currency: "UZS",
      entitlement_expires_at: null,
      attendance_rate: 0.9,
      missing_assignments: 0,
      composite_score: 86,
      certificate_ready: false,
      parent_follow_up: false,
    },
  ],
  pipeline_counts: {
    lead: 0,
    placement: 0,
    enrolled: 0,
    learning: 1,
    attention: 0,
    renewal: 0,
    completion: 0,
  },
  automation_rules: [],
  calendar_events: [],
  intelligence: [],
  stats: {
    open_actions: 1,
    urgent_actions: 1,
    grading_backlog: 1,
    certificate_ready: 0,
    placement_gap: 0,
  },
};

const businessFoundation = {
  generated_at: "2026-07-12T00:00:00.000Z",
  access: ownerAccess,
  branches: [
    {
      id: "branch-main",
      academy_id: academyId,
      branch_key: "main",
      name: "Main branch",
      address: "Tashkent",
      phone: "+998900001122",
      timezone: "Asia/Tashkent",
      currency: "UZS",
      capacity: 120,
      is_default: true,
      is_active: true,
      metadata: {},
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ],
  rooms: [
    {
      id: "room-101",
      academy_id: academyId,
      branch_id: "branch-main",
      room_key: "101",
      name: "Room 101",
      capacity: 14,
      room_type: "classroom",
      is_active: true,
      features: [],
      metadata: {},
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ],
  sources: [
    {
      id: "source-instagram",
      academy_id: academyId,
      source_key: "instagram",
      label_i18n: { en: "Instagram", uz: "Instagram", ru: "Instagram" },
      category: "social",
      is_system: true,
      is_active: true,
      position: 10,
    },
  ],
  stages: [
    {
      id: "stage-new",
      academy_id: academyId,
      pipeline_id: "pipeline-admissions",
      stage_key: "new",
      label_i18n: { en: "New" },
      position: 10,
      probability_percent: 5,
      terminal_kind: null,
      is_active: true,
    },
    {
      id: "stage-contacted",
      academy_id: academyId,
      pipeline_id: "pipeline-admissions",
      stage_key: "contacted",
      label_i18n: { en: "Contacted" },
      position: 20,
      probability_percent: 15,
      terminal_kind: null,
      is_active: true,
    },
    {
      id: "stage-won",
      academy_id: academyId,
      pipeline_id: "pipeline-admissions",
      stage_key: "won",
      label_i18n: { en: "Won" },
      position: 70,
      probability_percent: 100,
      terminal_kind: "won",
      is_active: true,
    },
    {
      id: "stage-lost",
      academy_id: academyId,
      pipeline_id: "pipeline-admissions",
      stage_key: "lost",
      label_i18n: { en: "Lost" },
      position: 80,
      probability_percent: 0,
      terminal_kind: "lost",
      is_active: true,
    },
  ],
  transitions: [
    {
      id: "transition-new-contacted",
      academy_id: academyId,
      pipeline_id: "pipeline-admissions",
      from_stage_id: "stage-new",
      to_stage_id: "stage-contacted",
      is_active: true,
      requires_reason: false,
    },
  ],
  leads: [
    {
      id: "lead-route-smoke",
      academy_id: academyId,
      branch_id: "branch-main",
      preferred_branch_id: "branch-main",
      pipeline_id: "pipeline-admissions",
      current_stage_id: "stage-new",
      source_id: "source-instagram",
      assigned_user_id: "owner-user",
      responsible_user_id: "owner-user",
      full_name: "Madina Lead",
      phone: "+998901234567",
      telegram: null,
      email: null,
      parent_name: null,
      parent_phone: null,
      age: 17,
      interested_course: "IELTS",
      preferred_schedule: "Evenings",
      expected_price: 700000,
      currency: "UZS",
      campaign: "Summer intake",
      referral_source: null,
      notes: null,
      tags: [],
      estimated_probability: 5,
      status: "open",
      lost_reason: null,
      last_contacted_at: null,
      next_follow_up_at: "2026-07-13T09:00:00.000Z",
      converted_at: null,
      metadata: {},
      created_at: "2026-07-12T00:00:00.000Z",
      updated_at: "2026-07-12T00:00:00.000Z",
    },
  ],
  activities: [],
  trials: [],
  conversions: [],
  classrooms: [{ id: classroomId, name: "IELTS Evening A", is_active: true }],
  staff: [],
};

const commercialCore = {
  generated_at: "2026-07-12T00:00:00.000Z",
  access: ownerAccess,
  pricing_plans: [
    {
      id: "plan-monthly",
      academy_id: academyId,
      branch_id: "branch-main",
      classroom_id: classroomId,
      legacy_offer_id: "offer-route-smoke",
      plan_key: "monthly-ielts",
      name: "Monthly IELTS",
      pricing_model: "monthly_fixed",
      billing_cycle: "monthly",
      base_amount: 700000,
      currency: "UZS",
      lessons_included: 12,
      teaching_hours_included: 18,
      duration_days: 30,
      installment_count: null,
      is_active: true,
      metadata: {},
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
    },
  ],
  subscriptions: [
    {
      id: "subscription-route",
      academy_id: academyId,
      contact_id: studentContactId,
      branch_id: "branch-main",
      classroom_id: classroomId,
      pricing_plan_id: "plan-monthly",
      entitlement_id: null,
      status: "active",
      starts_on: "2026-07-01",
      ends_on: null,
      billing_cycle: "monthly",
      billing_anchor_day: 1,
      list_amount: 700000,
      discount_amount: 50000,
      agreed_amount: 650000,
      currency: "UZS",
      auto_renew: true,
      renewal_notice_days: 7,
      cancelled_at: null,
      cancellation_reason: null,
      completed_at: null,
      metadata: {},
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
    },
  ],
  subscription_freezes: [],
  pricing_adjustments: [
    {
      id: "discount-route",
      academy_id: academyId,
      subscription_id: "subscription-route",
      adjustment_type: "sibling",
      percentage_basis_points: null,
      amount: 50000,
      original_amount: 700000,
      final_amount: 650000,
      reason: "Sibling discount",
      promo_code: null,
      starts_on: null,
      ends_on: null,
      applied_by: "owner-user",
      approved_by: "owner-user",
      metadata: {},
      created_at: "2026-07-01T00:00:00.000Z",
    },
  ],
  charges: [
    {
      id: "charge-route",
      academy_id: academyId,
      contact_id: studentContactId,
      subscription_id: "subscription-route",
      branch_id: "branch-main",
      classroom_id: classroomId,
      charge_number: "INV-2026-07",
      cycle_key: "2026-07",
      charge_type: "tuition",
      service_period_start: "2026-07-01",
      service_period_end: "2026-07-31",
      issued_on: "2026-07-01",
      due_on: "2026-07-05",
      original_amount: 700000,
      discount_amount: 50000,
      net_amount: 650000,
      currency: "UZS",
      status: "partially_paid",
      description: "July tuition",
      metadata: {},
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-12T00:00:00.000Z",
      allocated_amount: 500000,
      adjustment_amount: 0,
      effective_amount: 650000,
      outstanding_amount: 150000,
      calculated_status: "partially_paid",
      days_overdue: 7,
      aging_bucket: "1-7",
    },
  ],
  payments: [
    {
      id: "payment-route-smoke",
      academy_id: academyId,
      contact_id: studentContactId,
      offer_id: "offer-route-smoke",
      provider: "click",
      provider_transaction_id: "click-route-smoke",
      amount: 500000,
      currency: "UZS",
      status: "paid",
      metadata: {},
      created_at: "2026-07-02T00:00:00.000Z",
      updated_at: "2026-07-02T00:00:00.000Z",
    },
  ],
  allocations: [
    {
      id: "allocation-route",
      academy_id: academyId,
      payment_id: "payment-route-smoke",
      charge_id: "charge-route",
      amount: 500000,
      currency: "UZS",
      allocation_kind: "application",
      reverses_allocation_id: null,
      allocated_by: "owner-user",
      allocated_at: "2026-07-02T00:00:00.000Z",
      metadata: {},
    },
  ],
  ledger_entries: [
    {
      id: "ledger-charge-route",
      academy_id: academyId,
      contact_id: studentContactId,
      subscription_id: "subscription-route",
      charge_id: "charge-route",
      payment_id: null,
      entry_type: "charge",
      amount: 650000,
      currency: "UZS",
      effective_at: "2026-07-01T00:00:00.000Z",
      reason: "July tuition",
      created_by: "owner-user",
      metadata: {},
      created_at: "2026-07-01T00:00:00.000Z",
    },
    {
      id: "ledger-payment-route",
      academy_id: academyId,
      contact_id: studentContactId,
      subscription_id: null,
      charge_id: null,
      payment_id: "payment-route-smoke",
      entry_type: "payment_received",
      amount: -500000,
      currency: "UZS",
      effective_at: "2026-07-02T00:00:00.000Z",
      reason: "Payment received",
      created_by: "owner-user",
      metadata: {},
      created_at: "2026-07-02T00:00:00.000Z",
    },
  ],
  account_balances: [
    {
      academy_id: academyId,
      contact_id: studentContactId,
      currency: "UZS",
      balance: 150000,
      debits: 650000,
      credits: 500000,
      last_entry_at: "2026-07-02T00:00:00.000Z",
    },
  ],
  debt_cases: [],
  payment_promises: [],
  collection_events: [],
  reconciliations: [],
  contacts: [
    {
      id: studentContactId,
      first_name: "Ali",
      last_name: "Karimov",
      email: "ali@example.test",
      phone: "+998901234567",
      status: "active",
      lifecycle_stage: "learning",
    },
  ],
  branches: [
    {
      id: "branch-main",
      name: "Main branch",
      is_active: true,
      currency: "UZS",
    },
  ],
  classrooms: [{ id: classroomId, name: "IELTS Evening A", is_active: true }],
};

const operationsFinance = {
  generated_at: "2026-07-12T00:00:00.000Z",
  access: ownerAccess,
  cashboxes: [
    {
      id: "cashbox-main",
      academy_id: academyId,
      branch_id: "branch-main",
      name: "Front desk",
      currency: "UZS",
      is_active: true,
    },
  ],
  cashier_shifts: [
    {
      id: "shift-route",
      academy_id: academyId,
      cashbox_id: "cashbox-main",
      cashier_user_id: "owner-user",
      opened_at: "2026-07-12T08:00:00.000Z",
      closed_at: null,
      opening_balance: 100000,
      expected_closing_balance: null,
      counted_closing_balance: null,
      discrepancy: null,
      status: "open",
    },
  ],
  cash_movements: [],
  cash_reconciliations: [],
  expense_categories: [
    {
      id: "category-teaching",
      academy_id: academyId,
      category_key: "teaching-materials",
      name: "Teaching materials",
      kind: "teaching",
      is_active: true,
    },
  ],
  expenses: [
    {
      id: "expense-route",
      academy_id: academyId,
      branch_id: "branch-main",
      classroom_id: classroomId,
      category_id: "category-teaching",
      expense_date: "2026-07-10",
      amount: 50000,
      currency: "UZS",
      vendor: "Book shop",
      description: "Workbooks",
      payment_method: "cash",
      status: "approved",
      receipt_ref: "REC-001",
    },
  ],
  budgets: [],
  lesson_deliveries: [],
  compensation_rules: [
    {
      id: "rule-route",
      academy_id: academyId,
      staff_id: "staff-route",
      branch_id: "branch-main",
      rule_type: "per_lesson",
      name: "Per lesson",
      currency: "UZS",
      fixed_amount: 0,
      unit_rate: 100000,
      percentage_basis_points: 0,
      performance_bonus: 0,
      effective_from: "2026-07-01",
      effective_to: null,
      is_active: true,
      version: 1,
    },
  ],
  payroll_periods: [
    {
      id: "period-route",
      academy_id: academyId,
      branch_id: "branch-main",
      period_start: "2026-07-01",
      period_end: "2026-07-31",
      currency: "UZS",
      status: "calculated",
      calculated_at: "2026-07-31T00:00:00.000Z",
      reviewed_at: null,
      approved_at: null,
      paid_at: null,
      cancellation_reason: null,
    },
  ],
  payroll_rows: [
    {
      id: "payroll-row-route",
      academy_id: academyId,
      payroll_period_id: "period-route",
      staff_id: "staff-route",
      branch_id: "branch-main",
      compensation_rule_id: "rule-route",
      lessons_delivered: 12,
      minutes_delivered: 1080,
      relevant_students: 10,
      generated_revenue: 6500000,
      generated_amount: 1200000,
      adjustment_amount: 50000,
      final_payable_amount: 1250000,
      currency: "UZS",
      rule_snapshot: {},
      inputs_snapshot: {},
    },
  ],
  payroll_adjustments: [],
  payroll_payouts: [],
  branch_economics: [
    {
      academy_id: academyId,
      branch_id: "branch-main",
      branch_name: "Main branch",
      currency: "UZS",
      generated_revenue: 6500000,
      operating_expenses: 500000,
      teacher_cost: 1250000,
      contribution: 4750000,
    },
  ],
  classroom_economics: [
    {
      academy_id: academyId,
      classroom_id: classroomId,
      classroom_name: "IELTS Evening A",
      currency: "UZS",
      generated_revenue: 6500000,
      operating_expenses: 50000,
      attributed_teacher_cost: 1200000,
      contribution: 5250000,
    },
  ],
  staff: [
    {
      id: "staff-route",
      email: "teacher@example.test",
      display_name: "Teacher One",
      role: "teacher",
      classroom_ids: [classroomId],
      is_active: true,
    },
  ],
  branches: [
    {
      id: "branch-main",
      name: "Main branch",
      currency: "UZS",
      is_active: true,
    },
  ],
  classrooms: [{ id: classroomId, name: "IELTS Evening A", is_active: true }],
};

const academicOperations = {
  generated_at: "2026-07-12T00:00:00.000Z",
  access: ownerAccess,
  calendars: [
    {
      id: "calendar-route",
      academy_id: academyId,
      name: "Academic year",
      starts_on: "2026-01-01",
      ends_on: "2026-12-31",
      status: "active",
    },
  ],
  calendar_events: [
    {
      id: "calendar-event-route",
      academy_id: academyId,
      calendar_id: "calendar-route",
      event_type: "holiday",
      name: "Public holiday",
      starts_at: "2026-08-31T19:00:00.000Z",
      ends_at: "2026-09-01T19:00:00.000Z",
      affects_schedule: true,
    },
  ],
  staff_availability: [],
  room_availability: [],
  sessions: [
    {
      id: "session-route",
      academy_id: academyId,
      branch_id: "branch-main",
      classroom_id: classroomId,
      room_id: "room-101",
      primary_staff_id: "staff-route",
      calendar_id: "calendar-route",
      title: "IELTS lesson 12",
      session_type: "regular",
      delivery_mode: "physical",
      starts_at: "2026-07-14T12:00:00.000Z",
      ends_at: "2026-07-14T13:30:00.000Z",
      timezone: "Asia/Tashkent",
      status: "confirmed",
      cancellation_reason: null,
      rescheduled_to_session_id: null,
      metadata: {},
      created_at: "2026-07-12T00:00:00.000Z",
      updated_at: "2026-07-12T00:00:00.000Z",
    },
  ],
  session_staff_assignments: [],
  attendance: [
    {
      id: "attendance-route",
      academy_id: academyId,
      classroom_id: classroomId,
      contact_id: studentContactId,
      session_id: "session-route",
      session_date: "2026-07-14",
      status: "present",
      notes: null,
      marked_at: "2026-07-14T12:05:00.000Z",
    },
  ],
  attendance_exceptions: [],
  make_up_lessons: [],
  quality_reviews: [
    {
      id: "quality-route",
      academy_id: academyId,
      session_id: "session-route",
      review_type: "observation",
      score: 88,
      improvements: "Increase student talk time",
      action_required: true,
    },
  ],
  room_capacity: [
    {
      academy_id: academyId,
      room_id: "room-101",
      branch_id: "branch-main",
      name: "Room 101",
      capacity: 14,
      occupied_minutes: 90,
      available_minutes: 540,
      unused_minutes: 450,
      utilization_percent: 16.67,
    },
  ],
  room_peak_periods: [
    {
      academy_id: academyId,
      room_id: "room-101",
      day_of_week: 2,
      hour_of_day: 12,
      session_count: 1,
      occupied_minutes: 90,
    },
  ],
  classroom_capacity: [
    {
      academy_id: academyId,
      classroom_id: classroomId,
      name: "IELTS Evening A",
      student_capacity: 12,
      enrolled_students: 1,
      fill_percent: 8.33,
      attendance_rate: 100,
    },
  ],
  branches: [
    {
      id: "branch-main",
      name: "Main branch",
      currency: "UZS",
      is_active: true,
    },
  ],
  rooms: [
    {
      id: "room-101",
      branch_id: "branch-main",
      name: "Room 101",
      capacity: 14,
      is_active: true,
    },
  ],
  classrooms: [
    {
      id: classroomId,
      name: "IELTS Evening A",
      is_active: true,
      student_capacity: 12,
    },
  ],
  staff: [
    {
      id: "staff-route",
      email: "teacher@example.test",
      display_name: "Teacher One",
      role: "teacher",
      classroom_ids: [classroomId],
      is_active: true,
    },
  ],
  classroom_memberships: [
    {
      classroom_id: classroomId,
      contact_id: studentContactId,
      role: "student",
      status: "active",
    },
  ],
  contacts: [
    {
      id: studentContactId,
      first_name: "Ali",
      last_name: "Karimov",
      email: "ali@example.test",
      status: "active",
    },
  ],
};

const guardianRelationships = {
  generated_at: "2026-07-12T00:00:00.000Z",
  access: ownerAccess,
  guardians: [guardianProfile],
  relationships: [guardianRelationship],
  consents: [
    {
      id: "guardian-consent-route-smoke",
      relationship_id: guardianRelationship.id,
      consent_type: "telegram_link",
      decision: "granted",
      created_at: "2026-07-10T09:00:00.000Z",
    },
  ],
  link_tokens: [],
  preferences: [
    {
      id: "guardian-preference-route-smoke",
      guardian_id: guardianProfile.id,
      event_type: "*",
      telegram_enabled: true,
      inapp_enabled: true,
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:00",
    },
  ],
  messages: [
    {
      id: "guardian-message-route-smoke",
      relationship_id: guardianRelationship.id,
      direction: "academy_to_guardian",
      channel: "inapp",
      body: "Ali is making good progress.",
      status: "sent",
      created_at: "2026-07-11T09:00:00.000Z",
    },
  ],
  delivery_attempts: [
    {
      id: "guardian-attempt-route-smoke",
      notification_id: "guardian-notification-route-smoke",
      attempt_number: 1,
      status: "sent",
      provider: "telegram",
      channel: "telegram",
      attempted_at: "2026-07-11T09:01:00.000Z",
    },
  ],
  notifications: [
    {
      id: "guardian-notification-route-smoke",
      guardian_id: guardianProfile.id,
      relationship_id: guardianRelationship.id,
      event_key: "student_absent",
      channel: "telegram",
      scheduled_at: "2026-07-11T09:00:00.000Z",
      status: "sent",
      attempts: 1,
      error: null,
    },
  ],
  contacts: [
    {
      id: studentContactId,
      first_name: "Ali",
      last_name: "Karimov",
      email: "ali@example.test",
      phone: "+998900000000",
      status: "active",
    },
  ],
};

const guardianDashboard = {
  guardians: [guardianProfile],
  preferences: guardianRelationships.preferences,
  notifications: guardianRelationships.notifications,
  children: [
    {
      academy_id: academyId,
      relationship_id: guardianRelationship.id,
      relationship_type: "mother",
      is_primary_contact: true,
      is_financially_responsible: true,
      permissions: {
        status: true,
        attendance: true,
        grades: true,
        homework: true,
        schedule: true,
        payments: true,
        debt: true,
        messages: true,
        progress_reports: true,
        resources: true,
        announcements: true,
        message_academy: true,
      },
      student: {
        id: studentContactId,
        name: "Ali Karimov",
        status: "active",
        placement_level: "B2",
        placement_score: 72,
      },
      classrooms: [classroom],
      attendance: [
        {
          id: "guardian-attendance-route-smoke",
          session_date: "2026-07-11",
          status: "present",
          notes: null,
        },
      ],
      grades: [
        {
          id: "guardian-grade-route-smoke",
          score: 84,
          feedback: "Strong evidence use.",
          status: "graded",
        },
      ],
      homework: [
        {
          id: assignment.id,
          title: assignment.title,
          due_at: assignment.due_at,
          status: assignment.status,
        },
      ],
      schedule: [
        {
          id: "guardian-session-route-smoke",
          title: "IELTS lesson",
          starts_at: "2026-07-20T09:00:00.000Z",
          delivery_mode: "in_person",
          status: "scheduled",
        },
      ],
      charges: [
        {
          id: "guardian-charge-route-smoke",
          charge_number: "INV-2026-07",
          due_on: "2026-07-15",
          effective_amount: 500000,
          outstanding_amount: 150000,
          currency: "UZS",
          calculated_status: "partially_paid",
        },
      ],
      balances: [{ currency: "UZS", balance: 150000 }],
      messages: guardianRelationships.messages,
      announcements: [],
      resources: [],
      progress_reports: [],
    },
  ],
};

const businessIntelligence = {
  generated_at: "2026-07-12T00:00:00.000Z",
  access: ownerAccess,
  owner: {
    active_students: 1,
    high_risk_evaluations: 1,
    open_interventions: 1,
    open_renewals: 1,
    collected_amount: 500000,
    outstanding_debt: 150000,
    open_leads: 1,
    conversions: 1,
    open_actions: 2,
    overdue_actions: 1,
  },
  dashboard: {
    active_students: 1,
    new_students: 1,
    active_leads: 1,
    conversions: 1,
    collected_revenue: 500000,
    outstanding_amount: 150000,
    pending_actions: 2,
    high_risk_students: 1,
  },
  branches: [
    {
      branch_id: "branch-route-smoke",
      name: "Main Branch",
      active_students: 1,
      active_subscriptions: 1,
      collected_amount: 500000,
      collected_revenue: 500000,
      outstanding_amount: 150000,
      attendance_percent: 91,
      contribution: 300000,
      open_interventions: 1,
      open_actions: 2,
    },
  ],
  metric_definitions: [
    {
      metric_key: "active_students",
      version: 1,
      name_i18n: { en: "Active students" },
      formula: "Active memberships",
      unit: "count",
    },
  ],
  marketing_attribution: [
    {
      source_id: "source-instagram",
      campaign_id: "campaign-august",
      leads: 5,
      trials: 3,
      students: 1,
      lead_to_student_percent: 20,
      attributed_revenue: 500000,
    },
  ],
  unit_economics: [
    {
      entity_id: classroomId,
      entity_name: "IELTS Evening A",
      active_students: 1,
      fill_percent: 10,
      generated_revenue: 500000,
      teacher_cost: 200000,
      contribution: 300000,
      revenue_per_student: 500000,
    },
  ],
  teacher_performance: [
    {
      staff_id: "teacher-staff",
      staff_name: "Teacher User",
      completed_sessions: 4,
      delivered_minutes: 360,
      attendance_percent: 91,
      average_grade_percent: 82,
    },
  ],
  staff_performance: [],
  student_intelligence: [
    {
      contact_id: studentContactId,
      student_name: "Ali Karimov",
      lifecycle_stage: "learning",
      attendance_30d_percent: 91,
      academic_90d_percent: 82,
      outstanding_balance: 150000,
      latest_risk_level: "high",
      open_actions: 1,
      open_interventions: 1,
    },
  ],
  lifecycle_events: [
    {
      id: "lifecycle-event-1",
      event_key: "learning.grade_recorded",
      contact_id: studentContactId,
      source_table: "academy_submissions",
      source_id: "submission-1",
      occurred_at: "2026-07-12T00:00:00.000Z",
    },
  ],
  risk_definitions: [
    {
      id: "risk-definition-route-smoke",
      definition_key: "standard_retention",
      name: "Standard retention risk",
      version: 1,
      status: "active",
    },
  ],
  risk_evaluations: [
    {
      id: "risk-evaluation-route-smoke",
      contact_id: studentContactId,
      risk_level: "high",
      score: 74,
      summary: "Explainable attendance, homework, debt, and engagement factors.",
    },
  ],
  risk_signals: [
    {
      id: "risk-signal-route-smoke",
      evaluation_id: "risk-evaluation-route-smoke",
      signal_key: "attendance",
      contribution: 20,
      explanation: "Absence share",
    },
  ],
  interventions: [
    {
      id: "intervention-route-smoke",
      contact_id: studentContactId,
      risk_evaluation_id: "risk-evaluation-route-smoke",
      status: "open",
      priority: "high",
      next_follow_up_at: "2026-07-14T09:00:00.000Z",
      outcome: null,
    },
  ],
  intervention_activities: [],
  renewals: [
    {
      id: "renewal-route-smoke",
      contact_id: studentContactId,
      renewal_due_on: "2026-08-01",
      status: "contacting",
      likelihood: 70,
      expected_amount: 500000,
      currency: "UZS",
      next_action_at: "2026-07-15T09:00:00.000Z",
    },
  ],
  renewal_activities: [],
  actions: [
    {
      id: "action-route-smoke",
      contact_id: studentContactId,
      priority: "high",
      category: "retention",
      title: "Retention risk requires intervention",
      recommended_action: "Contact learner and record outcome.",
      assigned_to: null,
      sla_due_at: "2026-07-14T09:00:00.000Z",
      status: "open",
      outcome: null,
    },
  ],
  import_jobs: [
    {
      id: "import-route-smoke",
      import_type: "contacts",
      source_filename: "learners.csv",
      status: "ready",
      total_rows: 1,
      valid_rows: 1,
      invalid_rows: 0,
      committed_rows: 0,
    },
  ],
  import_rows: [
    {
      id: "import-row-route-smoke",
      import_job_id: "import-route-smoke",
      row_number: 1,
      validation_status: "valid",
      validation_errors: [],
      target_id: null,
    },
  ],
  import_effects: [],
  contacts: [
    {
      id: studentContactId,
      first_name: "Ali",
      last_name: "Karimov",
      email: "ali@example.test",
      phone: "+998900000000",
      status: "active",
    },
  ],
  staff: [],
  subscriptions: commercialCore.subscriptions,
  campaigns: [],
  localization: {
    default_locale: "uz",
    supported_locales: ["uz", "ru", "en"],
    timezone: "Asia/Tashkent",
    currency: "UZS",
    phone_country_code: "+998",
    date_format: "DD.MM.YYYY",
    time_format: "24h",
  },
  translations: [],
  automation_versions: [],
  automation_executions: [],
  automation_effects: [],
  ai_requests: [],
  ai_reviews: [],
};

const json = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

const seedSessionCookie = async (page: Page, userId: string) => {
  const session = {
    access_token: "route-smoke-access-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "route-smoke-refresh-token",
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email: `${userId}@example.test`,
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00.000Z",
    },
  };
  await page.context().addCookies([
    {
      name: "schood-auth",
      value: encodeURIComponent(JSON.stringify(session)),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: false,
      sameSite: "Lax",
    },
  ]);
};

type MockEdgeOptions = {
  respond?: (body: Record<string, unknown>) => Promise<unknown | undefined>;
  delayActions?: Partial<Record<string, number>>;
  failActions?: string[];
  failActionAttempts?: Partial<Record<string, number>>;
  actionOverrides?: Partial<Record<string, unknown>>;
  actionLog?: string[];
  meResponse?: unknown;
  classroomV2?: boolean;
};

const mockAcademyEdge = async (page: Page, persona: Persona, options: MockEdgeOptions = {}) => {
  const actionAttempts = new Map<string, number>();
  if (options.classroomV2 !== undefined) {
    await page.route("**/rest/v1/platform_settings*", (route) => route.fulfill(json({ student_center_enabled: false, classroom_v2_enabled: options.classroomV2 })));
  }
  await page.route("**/functions/v1/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const fn = url.pathname.split("/").pop();

    if (fn === "me") {
      if (options.meResponse) return route.fulfill(json(options.meResponse));
      const role = persona === "student" ? "student" : persona === "guardian" ? "guardian" : accessForPersona(persona).role;
      return route.fulfill(
        json({
          user: {
            id: `${persona}-user`,
            email: `${persona}@example.test`,
            role,
          },
          current_tenant: {
            id: academyId,
            name: "Route Smoke Academy",
            slug: "route-smoke",
            type: "team",
            metadata: { service_family: "academy" },
          },
          memberships:
            persona === "student" || persona === "guardian"
              ? []
              : [
                  {
                    tenant_id: academyId,
                    role,
                    status: "active",
                    tenants: [
                      {
                        id: academyId,
                        type: "team",
                        metadata: { service_family: "academy" },
                      },
                    ],
                  },
                ],
        }),
      );
    }

    const body = route.request().postDataJSON() as {
      action?: string;
      academy_id?: string;
    } | null;
    const action = body?.action ?? "";
    options.actionLog?.push(action);
    const customResponse = await options.respond?.(body ?? {});
    if (customResponse !== undefined) return route.fulfill(json(customResponse));
    const attempt = (actionAttempts.get(action) ?? 0) + 1;
    actionAttempts.set(action, attempt);

    const delay = options.delayActions?.[action] ?? 0;
    if (delay > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
    if (options.failActions?.includes(action) || attempt <= (options.failActionAttempts?.[action] ?? 0)) {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: `Mock ${action} failure` }),
      });
    }

    const actionResponse: Record<string, unknown> = {
      academies: { academies: [academy(persona)] },
      summary: {
        academy_id: academyId,
        access: accessForPersona(persona),
        counts: {
          contacts: 1,
          classrooms: 1,
          offers: 1,
          active_entitlements: 1,
          open_alerts: 0,
        },
      },
      contacts: { contacts: [contact] },
      classrooms: { classrooms: [classroom] },
      "classroom-memberships": { classroom_memberships: [membership] },
      conversations: { conversations: [] },
      messages: { messages: [] },
      announcements: { announcements: [] },
      alerts: { alerts: [] },
      offers: {
        offers: [
          {
            id: "offer-route-smoke",
            academy_id: academyId,
            name: "Monthly IELTS",
            type: "cohort",
            price_amount: 500000,
            currency: "UZS",
            duration_days: 30,
            description: "Monthly access",
            is_active: true,
            metadata: {},
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
      "offer-grants": { offer_grants: [] },
      payments: {
        payments: [
          {
            id: "payment-route-smoke",
            academy_id: academyId,
            contact_id: studentContactId,
            offer_id: "offer-route-smoke",
            provider: "click",
            provider_transaction_id: "click-route-smoke",
            amount: 500000,
            currency: "UZS",
            status: "pending",
            metadata: { platform_payment_id: "platform-route-smoke" },
            created_by: "owner-user",
            created_at: "2026-07-12T00:00:00.000Z",
            updated_at: "2026-07-12T00:00:00.000Z",
          },
        ],
      },
      entitlements: { entitlements: studentDashboard.entitlements },
      teacher_day: {
        date: "2026-09-01",
        generated_at: "2026-09-01T08:00:00.000Z",
        counts: { sessions: 1, students: 1, attendance_pending: 1, homework_pending: 1 },
        sessions: [
          {
            id: "teacher-session-route-smoke",
            academy_id: academyId,
            classroom_id: classroomId,
            classroom_name: "IELTS Evening A",
            room_name: "Room 12",
            title: "Writing workshop",
            starts_at: "2026-09-01T13:00:00.000Z",
            ends_at: "2026-09-01T14:30:00.000Z",
            timezone: "Asia/Tashkent",
            status: "scheduled",
            delivery_mode: "physical",
            roster: [{ contact_id: studentContactId, name: "Ali Karimov", status: null, notes: null }],
            attendance_saved: false,
            curriculum: {
              course_id: course.id,
              course_title: course.title,
              module_id: courseModule.id,
              module_title: courseModule.title,
              lesson_id: lesson.id,
              lesson_title: "Problem and solution essays",
              lesson_summary: "Build a clear IELTS Writing Task 2 response.",
              estimated_minutes: 90,
              objectives: [
                { id: "objective-1", label: "Write a precise thesis", covered: false },
                { id: "objective-2", label: "Structure the body paragraphs", covered: false },
              ],
            },
            resources: [{ id: "resource-route-smoke", title: "Essay checklist", kind: "asset", url: "https://example.test/checklist.pdf", description: "Checklist" }],
            homework: { title: "Write a problem and solution essay", description: "Complete one timed response.", due_at: "2026-09-03T15:00:00.000Z" },
            run: null,
            connected_group_count: 1,
          },
        ],
      },
      education_os: { ...educationOS, access: accessForPersona(persona) },
      business_foundation: {
        ...businessFoundation,
        access: accessForPersona(persona),
      },
      commercial_core: { ...commercialCore, access: accessForPersona(persona) },
      operations_finance: {
        ...operationsFinance,
        access: accessForPersona(persona),
      },
      academic_operations: {
        ...academicOperations,
        access: accessForPersona(persona),
      },
      guardian_relationships: {
        ...guardianRelationships,
        access: accessForPersona(persona),
      },
      guardian_dashboard: guardianDashboard,
      access_invitations: {
        access: accessForPersona(persona),
        invitations: [],
        contacts: [contact],
        classrooms: [classroom],
        guardian_relationships: [guardianRelationship],
        guardians: [guardianProfile],
      },
      timetable_planning: {
        terms: [],
        series: [],
        runs: [],
        schedules: [],
        rooms: [],
        staff: [],
        branches: [],
        classrooms: [classroom],
      },
      service_requests: { requests: [], events: [] },
      communication_journeys: { journeys: [], steps: [], enrollments: [] },
      collection_cases: { cases: [], attempts: [] },
      workforce_requests: { requests: [] },
      sensitive_cases: { cases: [], events: [] },
      competency_plans: { frameworks: [], competencies: [], plans: [], items: [], evidence: [] },
      integration_endpoints: { endpoints: [], deliveries: [], exports: [] },
      student_service_requests: {
        requests: [
          {
            id: "request-route-smoke",
            contact_id: studentContactId,
            guardian_id: null,
            request_type: "schedule",
            subject: "Move lesson time",
            description: "Request details",
            priority: "normal",
            status: "submitted",
            created_at: "2026-08-19T08:00:00.000Z",
            due_at: null,
          },
        ],
        events: [],
        contact,
      },
      student_learning_plans: {
        plans: [
          {
            id: "plan-route-smoke",
            title: "IELTS writing goal",
            goal: "Reach band 7",
            status: "active",
            published_at: "2026-08-19T08:00:00.000Z",
          },
        ],
        items: [],
        competencies: [],
        evidence: [],
        contact,
      },
      guardian_service_requests: {
        requests: [
          {
            id: "guardian-request-route-smoke",
            contact_id: studentContactId,
            guardian_id: guardianProfile.id,
            request_type: "billing",
            subject: "Payment receipt",
            description: "Please send a receipt",
            priority: "normal",
            status: "submitted",
            created_at: "2026-08-19T08:00:00.000Z",
            due_at: null,
          },
        ],
        events: [],
        guardians: [guardianProfile],
      },
      invitation_status: {
        invitation: {
          id: "invitation-route-smoke",
          academy_id: academyId,
          invite_kind: "student",
          email: "in***@example.test",
          role: null,
          contact_id: studentContactId,
          classroom_id: classroomId,
          guardian_relationship_id: null,
          status: "pending",
          delivery_status: "sent",
          delivery_error: null,
          token_expires_at: "2026-09-01T08:00:00.000Z",
          resend_count: 0,
          academy: { id: academyId, name: "Route Smoke Academy", slug: "route-smoke" },
        },
      },
      accept_access_invitation: {
        invitation: {
          id: "invitation-route-smoke",
          academy_id: academyId,
          invite_kind: "student",
          status: "accepted",
          accepted_at: "2026-08-19T08:00:00.000Z",
        },
      },
      business_intelligence: {
        ...businessIntelligence,
        access: accessForPersona(persona),
      },
      global_search: {
        results: [
          {
            result_type: "contact",
            result_id: studentContactId,
            label: "Ali Karimov",
            context: "ali@example.test",
          },
        ],
      },
      assignments: { assignments: [assignment] },
      gradebook: {
        classroom_id: classroomId,
        assignments: [assignment],
        grade_categories: [gradeCategory],
        rows: [],
      },
      attendance: { attendance: [] },
      schedule: { schedule: [] },
      bulk_invites: { bulk_invites: [] },
      curriculum: {
        courses: [course],
        modules: [courseModule],
        lessons: [lesson],
        classroom_courses: [
          {
            id: "classroom-course-route-smoke",
            academy_id: academyId,
            classroom_id: classroomId,
            course_id: course.id,
            status: "active",
            starts_at: null,
            ends_at: null,
            assigned_at: "2026-07-01T09:00:00.000Z",
          },
        ],
      },
      quizzes: { quizzes: [quiz], questions: [quizQuestion] },
      grade_categories: { grade_categories: [gradeCategory] },
      rubrics: { rubrics: [rubric] },
      quiz_attempts: { quiz_attempts: [] },
      "student-feed": { messages: [], alerts: [], announcements: [] },
      "student-dashboard": studentDashboard,
      "classroom-chat": {
        academy_id: academyId,
        classroom,
        viewer: {
          type: persona === "student" ? "student" : "teacher",
          role: persona === "student" ? "student" : "teacher",
          contact_id: persona === "student" ? studentContactId : null,
          display_name: persona,
          can_manage_resources: persona !== "student",
        },
        members: [membership],
        resources: [
          {
            id: "resource-route-smoke",
            academy_id: academyId,
            classroom_id: classroomId,
            title: "Essay checklist",
            kind: "asset",
            url: "https://example.test/checklist.pdf",
            description: "Checklist",
            metadata: {},
            sort_order: 1,
            is_published: true,
            created_by: "teacher-user",
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        ],
        progress: {
          viewer_completed_resource_ids: [],
          resource_completed_counts: {},
          total_members: 1,
        },
        messages: [],
        announcements: [],
      },
      student_assignments: {
        academy_id: academyId,
        contact_id: studentContactId,
        assignments: [{ ...assignment, submission: null }],
      },
      student_attendance: { attendance: [] },
      student_billing: {
        items: [],
        accounts: [
          {
            academy_id: academyId,
            contact_id: studentContactId,
            subscriptions: commercialCore.subscriptions,
            charges: commercialCore.charges,
            ledger_entries: commercialCore.ledger_entries,
            balances: commercialCore.account_balances,
          },
        ],
      },
      student_curriculum: {
        academy_id: academyId,
        classroom_id: classroomId,
        contact_id: studentContactId,
        courses: [course],
        modules: [courseModule],
        lessons: [lesson],
        progress: [],
        quizzes: [quiz],
        questions: [quizQuestion],
        attempts: [],
        media: [],
        classroom_courses: [
          {
            id: "classroom-course-route-smoke",
            academy_id: academyId,
            classroom_id: classroomId,
            course_id: course.id,
            status: "active",
            starts_at: null,
            ends_at: null,
            assigned_at: "2026-07-01T09:00:00.000Z",
          },
        ],
      },
      create_staff_link: {
        link: {
          url: `http://127.0.0.1:4177/academy/office?academy_id=${academyId}#telegram-linked`,
          expires_in_seconds: 600,
        },
      },
    };

    if (action in (options.actionOverrides ?? {})) return route.fulfill(json(options.actionOverrides?.[action]));
    if (action in actionResponse) return route.fulfill(json(actionResponse[action]));
    return route.fulfill(json({}));
  });
};

test('returning Academy entry loads access alongside the profile and reads the profile once', async ({ page }) => {
  await seedSessionCookie(page, 'owner-user');
  const actionLog: string[] = [];
  await mockAcademyEdge(page, 'owner', { actionLog });
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  let profileRequests = 0;
  await page.route('**/functions/v1/me', async (route) => {
    profileRequests += 1;
    await blocked;
    await route.fallback();
  });
  try {
    await page.goto('/');
    await expect(page).toHaveURL(/\/academy\/workspace/);
    await expect.poll(() => actionLog.includes('academies') && actionLog.includes('student-dashboard')).toBe(true);
  } finally {
    release();
  }
  await expect(page).toHaveURL(/\/academies$/);
  await expect(page.getByRole('heading', { name: 'Choose a workspace' })).toBeVisible();
  expect(profileRequests).toBe(1);
});

test('startup latency benchmark with fixed backend delays', async ({ page }) => {
  test.skip(process.env.STARTUP_BENCHMARK !== '1', 'Run explicitly for before/after measurements.');
  await seedSessionCookie(page, 'owner-user');
  await mockAcademyEdge(page, 'owner', {
    delayActions: { academies: 800, 'student-dashboard': 800 },
    actionOverrides: { 'student-dashboard': emptyStudentDashboardFixture },
  });
  let profileRequests = 0;
  await page.route('**/functions/v1/me', async (route) => {
    profileRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fallback();
  });
  for (let sample = 0; sample < 3; sample += 1) {
    profileRequests = 0;
    const start = Date.now();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Today at your academy' })).toBeVisible();
    console.log('STARTUP_METRIC', JSON.stringify({ app: 'academy', sample, workspaceMs: Date.now() - start, profileRequests }));
  }
});

test.describe("Academy routed workspaces with mocked Edge responses", () => {
  test('manual lessons use the branch clock even when the operator is in another timezone',async({page})=>{
    const commands:Record<string,unknown>[]=[];
    await seedSessionCookie(page,'owner-user');
    await mockAcademyEdge(page,'owner',{actionOverrides:{academic_operations:{...academicOperations,
      branches:[...academicOperations.branches.map(item=>({...item,timezone:'Asia/Kathmandu'})),{id:'other-clock-branch',name:'Other clock branch',is_active:true,currency:'UZS',timezone:'America/New_York'}],
      rooms:[...academicOperations.rooms,{id:'other-clock-room',branch_id:'other-clock-branch',name:'Other clock room',capacity:20,is_active:true}],
      calendars:academicOperations.calendars.map(item=>({...item,branch_id:'branch-main'})),
    }},respond:async body=>{
      if(body.action==='create_lesson_session'){commands.push(body);return {session:academicOperations.sessions[0]};}
      return undefined;
    }});
    await page.goto(`/academy/admin/academic?academy_id=${academyId}`);
    const form=page.locator('form').filter({has:page.getByRole('heading',{name:'Create actual lesson session',exact:true})});
    await expect(form.getByText('Timezone: Asia/Kathmandu',{exact:true})).toBeVisible();
    await form.getByLabel('Starts',{exact:true}).fill('2026-10-12T14:00');
    await form.getByLabel('Ends',{exact:true}).fill('2026-10-12T15:00');
    await form.getByRole('button',{name:'Create session',exact:true}).click();
    await expect.poll(()=>commands.length).toBe(1);
    expect(commands[0]).toMatchObject({starts_at:'2026-10-12T08:15:00.000Z',ends_at:'2026-10-12T09:15:00.000Z',timezone:'Asia/Kathmandu'});
    await expect(form.getByRole('button',{name:'Create session',exact:true})).toBeEnabled();
    await form.getByRole('combobox',{name:'Branch',exact:true}).selectOption('other-clock-branch');
    await expect(form.getByRole('combobox',{name:'Room',exact:true})).toHaveValue('');
    await expect(form.getByRole('combobox',{name:'Room',exact:true}).locator('option[value="room-101"]')).toHaveCount(0);
    await form.getByRole('combobox',{name:'Room',exact:true}).selectOption('other-clock-room');
    await form.getByRole('button',{name:'Create session',exact:true}).click();
    await expect.poll(()=>commands.length).toBe(2);
    expect(commands[1]).toMatchObject({branch_id:'other-clock-branch',room_id:'other-clock-room',calendar_id:null,starts_at:'2026-10-12T18:00:00.000Z',timezone:'America/New_York'});
    await expect(form.getByRole('button',{name:'Create session',exact:true})).toBeEnabled();
    await form.getByLabel('Starts',{exact:true}).fill('2026-10-12T16:00');
    await form.getByLabel('Ends',{exact:true}).fill('2026-10-12T17:00');
    await form.getByRole('button',{name:'Create session',exact:true}).click();
    await expect.poll(()=>commands.length).toBe(3);
    expect(commands[2]).toMatchObject({calendar_id:null,starts_at:'2026-10-12T20:00:00.000Z',timezone:'America/New_York'});
  });
  const roomBranch='00000000-0000-4000-8000-000000000003';
  const roomFixture=(body:Record<string,unknown>)=>{
    const from=String(body.from),days=Number(body.days);
    const base={classroom_id:'room-qa-class',room_id:'room-qa-1',primary_staff_id:'room-qa-teacher',teacher_name:'Owned QA teacher',title:'IELTS lesson',delivery_mode:'physical',starts_at:from+'T09:00:00Z',ends_at:from+'T10:30:00Z'};
    return {schema_version:1,generated_at:new Date().toISOString(),branch:{id:String(body.branch_id),name:'Owned QA branch',timezone:'Asia/Tashkent',is_active:true},from,days,starts_at:from+'T00:00:00+05:00',ends_at:from+'T23:59:59+05:00',
      rooms:[{id:'room-qa-1',name:'Room 1',capacity:20,is_active:true},{id:'room-qa-2',name:'Room 2',capacity:15,is_active:true}],
      sessions:[{...base,id:'room-qa-session',classroom_name:'IELTS A17',status:'scheduled'}],
      planned:[{...base,series_id:'room-qa-series',occurrence_date:from,classroom_name:'General English B12',primary_staff_id:'room-qa-other-teacher',starts_at:from+'T09:30:00Z',ends_at:from+'T10:30:00Z'}],closures:[],unassigned_schedules:[],
      warnings:{series_needing_setup:0,invalid_occurrences:0,room_branch_mismatches:0,rooms_truncated:false,sessions_truncated:false,series_truncated:false,plans_truncated:false,closures_truncated:false,unassigned_truncated:false}};
  };
  const mockRoomTimetable=async(page:Page,persona:StaffPersona='owner',extra:MockEdgeOptions={})=>{
    const current=productionAccess(persona),access={...current,permissions:{...current.permissions,viewRoomTimetable:persona!=='teacher'}};
    await mockAcademyEdge(page,persona,{...extra,respond:async body=>{
      const custom=await extra.respond?.(body);if(custom!==undefined)return custom;
      if(body.action==='academies')return {academies:[{...academy(persona),access}]};
      if(body.action==='summary')return {academy_id:academyId,access,counts:{contacts:1,classrooms:1,offers:0,active_entitlements:0,open_alerts:0}};
      if(body.action==='room_timetable_branches')return {branches:[{id:roomBranch,name:'Owned QA branch',timezone:'Asia/Tashkent',is_active:true},{id:'00000000-0000-4000-8000-000000000004',name:'Next QA branch',timezone:'UTC',is_active:true}],truncated:false};
      if(body.action==='room_timetable')return roomFixture(body);
      return undefined;
    }});
  };
  for(const width of [1440,390,320]){
    test(`room timetable shows booked lessons, unbooked plans and conflicts at ${width}px`,async({page},testInfo)=>{
      await page.setViewportSize({width,height:1000});await seedSessionCookie(page,'owner-user');await mockRoomTimetable(page);
      await page.goto(`/academy/admin/rooms?academy_id=${academyId}`);
      await expect(page.locator('.room-timetable__grid')).toBeVisible();
      await expect(page.locator('.room-timetable__lesson')).toHaveCount(2);
      await expect(page.locator('.room-timetable__lesson.is-conflict')).toHaveCount(2);
      await expect(page.getByRole('combobox',{name:'View',exact:true})).toHaveValue(width<640?'1':'7');
      await page.locator('.room-timetable__lesson.is-plan').click();
      await expect(page.getByText('This recurring lesson is a plan. It has not been booked yet.',{exact:true})).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      if(width<420)expect(await page.getByLabel('Start date',{exact:true}).evaluate(input=>input.getBoundingClientRect().width)).toBeGreaterThanOrEqual(190);
      await page.screenshot({path:testInfo.outputPath(`rooms-${width}.png`),fullPage:true});
    });
  }
  test('room refresh preserves the selected date and performs one bounded snapshot read',async({page})=>{
    const actions:string[]=[];await seedSessionCookie(page,'owner-user');await mockRoomTimetable(page,'owner',{actionLog:actions});
    await page.goto(`/academy/admin/rooms?academy_id=${academyId}`);await expect(page.locator('.room-timetable__grid')).toBeVisible();
    await page.getByLabel('Start date',{exact:true}).fill('2026-11-20');
    await expect(page.locator('.room-timetable__grid')).toBeVisible();
    const before=actions.filter(a=>a==='room_timetable').length;
    await page.getByRole('button',{name:'Refresh timetable',exact:true}).click();
    await expect(page.locator('.room-timetable__grid')).toBeVisible();
    await expect(page.getByLabel('Start date',{exact:true})).toHaveValue('2026-11-20');
    expect(actions.filter(a=>a==='room_timetable').length-before).toBe(1);
    expect(actions.filter(a=>a==='room_timetable_branches').length).toBe(1);
    expect(actions.includes('academic_operations')).toBe(false);
  });
  test('room calendar gives receptionist a view without lesson administration controls',async({page})=>{
    await seedSessionCookie(page,'receptionist-user');await mockRoomTimetable(page,'receptionist');
    await page.goto(`/academy/office/rooms?academy_id=${academyId}`);await expect(page.locator('.room-timetable__grid')).toBeVisible();
    await expect(page.getByRole('button',{name:'Manage lessons',exact:true})).toHaveCount(0);
  });
  test('an obsolete room response cannot replace the newly selected branch',async({page})=>{
    let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
    let heldRequest=false;
    await seedSessionCookie(page,'owner-user');await mockRoomTimetable(page,'owner',{respond:async body=>{
      if(body.action==='room_timetable'&&body.branch_id===roomBranch){heldRequest=true;await held;return {...roomFixture(body),rooms:[{id:'old-room',name:'Obsolete room',capacity:20,is_active:true}],sessions:[],planned:[]};}
      if(body.action==='room_timetable')return {...roomFixture(body),rooms:[{id:'new-room',name:'New branch room',capacity:15,is_active:true}],sessions:[],planned:[]};
      return undefined;
    }});
    await page.goto(`/academy/admin/rooms?academy_id=${academyId}`);
    try{
      await expect.poll(()=>heldRequest).toBe(true);
      await page.getByRole('combobox',{name:'Branch',exact:true}).selectOption('00000000-0000-4000-8000-000000000004');
      await expect(page.getByRole('rowheader',{name:/New branch room/})).toBeVisible();
      release();
      await expect(page.getByRole('rowheader',{name:/Obsolete room/})).toHaveCount(0);
      await expect(page.getByRole('rowheader',{name:/New branch room/})).toBeVisible();
    }finally{release();}
  });
  test('partial room results show an availability warning rather than a complete empty timetable',async({page})=>{
    await seedSessionCookie(page,'owner-user');await mockRoomTimetable(page,'owner',{respond:async body=>{
      if(body.action!=='room_timetable')return undefined;
      const data=roomFixture(body);return {...data,sessions:[],planned:[],warnings:{...data.warnings,sessions_truncated:true}};
    }});
    await page.goto(`/academy/admin/rooms?academy_id=${academyId}`);
    await expect(page.getByRole('alert')).toContainText('Some records are not loaded. This view cannot confirm availability.');
    await expect(page.locator('.room-timetable__lesson')).toHaveCount(0);
  });
  test('service desk term fields retain focus while typing',async({page})=>{
    await seedSessionCookie(page,'owner-user');await mockAcademyEdge(page,'owner',{actionOverrides:{timetable_planning:{terms:[],series:[],runs:[],schedules:[],rooms:[],staff:[],branches:[],classrooms:[]}}});
    await page.goto(`/academy/admin/services?academy_id=${academyId}`);
    await page.getByRole('button',{name:/Teaching plan/}).click();
    await page.getByRole('button',{name:'New term',exact:true}).click();
    const name=page.getByRole('textbox',{name:'Term name',exact:true});
    await name.fill('');await name.pressSequentially('Autumn term');
    await expect(name).toHaveValue('Autumn term');await expect(name).toBeFocused();
  });
  test('timetable commit keeps its retry key after an uncertain response and requires the selected term preview',async({page})=>{
    const first='00000000-0000-4000-8000-000000000091',second='00000000-0000-4000-8000-000000000092';
    const commits:Record<string,unknown>[]=[];let attempts=0;
    await seedSessionCookie(page,'owner-user');await mockAcademyEdge(page,'owner',{
      actionOverrides:{timetable_planning:{terms:[{id:first,name:'First term',status:'draft'},{id:second,name:'Second term',status:'draft'}],series:[],runs:[],schedules:[],rooms:[],staff:[],branches:[],classrooms:[]}},
      respond:async body=>body.action==='generate_timetable'?{run:{id:'owned-run',academy_id:academyId,term_id:body.term_id,dry_run:body.dry_run,status:body.dry_run?'preview_ready':'completed',candidate_count:1,conflict_count:0,skipped_count:0,generated_count:body.dry_run?0:1}}:undefined,
    });
    await page.route('**/functions/v1/academy',async route=>{
      const body=route.request().postDataJSON() as Record<string,unknown>;
      if(body.action==='generate_timetable'&&body.dry_run===false){
        commits.push(body);attempts++;
        if(attempts===1)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporary generation response failure'})});
      }
      return route.fallback();
    });
    await page.goto(`/academy/admin/services?academy_id=${academyId}`);
    await page.getByRole('button',{name:/Teaching plan/}).click();await page.getByRole('button',{name:'Build timetable',exact:true}).click();
    const term=page.getByRole('combobox',{name:'Term',exact:true});const commit=page.getByRole('button',{name:'Create dated lessons',exact:true});
    await term.selectOption(first);await page.getByRole('button',{name:'Preview conflicts',exact:true}).click();await expect(commit).toBeEnabled();
    await term.selectOption(second);await expect(commit).toBeDisabled();await term.selectOption(first);await expect(commit).toBeEnabled();
    await commit.click();await expect(page.getByRole('alert')).toContainText('Temporary generation response failure');await expect(commit).toBeEnabled();
    await commit.click();await expect(page.getByRole('status').filter({hasText:'Timetable committed.'})).toBeVisible();
    expect(commits).toHaveLength(2);expect(commits[0].idempotency_key).toBeTruthy();expect(commits[1]).toEqual(commits[0]);
    await expect(commit).toBeDisabled();
  });
  test("pending contact save freezes submitted fields and preserves a failed draft", async ({ page }) => {
    await seedSessionCookie(page, "owner-user");
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    let requested = false;
    await mockAcademyEdge(page, "owner", {
      failActions: ["upsert_contact"],
      respond: async (body) => {
        if (body.action === "upsert_contact") { requested = true; await blocked; }
        return undefined;
      },
    });
    await page.goto(`/academy/admin/contacts?academy_id=${academyId}`);
    await page.getByText("Add contact", { exact: true }).click();
    await page.getByRole("textbox", { name: "First name", exact: true }).fill("Saved draft");
    await page.getByRole("textbox", { name: "Last name", exact: true }).fill("QA");
    await page.getByRole("textbox", { name: "Email", exact: true }).fill("draft@example.test");
    await page.getByRole("button", { name: "Save contact", exact: true }).click();
    try {
      await expect.poll(() => requested).toBe(true);
      await expect(page.getByRole("textbox", { name: "First name", exact: true })).toBeDisabled();
      release();
      await expect(page.getByRole("button", { name: "Save contact", exact: true })).toBeEnabled();
      await expect(page.getByRole("textbox", { name: "First name", exact: true })).toHaveValue("Saved draft");
      await expect(page.locator('.error-banner')).toContainText("Mock upsert_contact failure");
    } finally { release(); }
  });

  for (const obsoleteFails of [false, true]) {
    test(`obsolete contact ${obsoleteFails ? "failure" : "success"} cannot change a new workspace save`, async ({ page }) => {
      await seedSessionCookie(page, "owner-user");
      const nextId = "academy-next-save";
      let releaseOld!: () => void;
      let releaseNew!: () => void;
      const oldBlocked = new Promise<void>((resolve) => { releaseOld = resolve; });
      const newBlocked = new Promise<void>((resolve) => { releaseNew = resolve; });
      const writes: Record<string, unknown>[] = [];
      await mockAcademyEdge(page, "owner", {
        actionOverrides: { academies: { academies: [academy("owner"), { ...academy("owner"), id: nextId, name: "Next Academy" }] } },
        respond: async (body) => {
          if (body.action === "summary") return { academy_id: body.academy_id, access: ownerAccess, counts: { contacts: 1, classrooms: 0, offers: 0, active_entitlements: 0, open_alerts: 0 } };
          if (body.action === "contacts") return { contacts: [{ ...contact, academy_id: body.academy_id }] };
          return undefined;
        },
      });
      await page.route("**/functions/v1/academy", async (route) => {
        const body = route.request().postDataJSON();
        if (body?.action !== "upsert_contact") return route.fallback();
        writes.push(body);
        await (body.academy_id === academyId ? oldBlocked : newBlocked);
        if (body.academy_id === academyId && obsoleteFails) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Obsolete contact failure" }) });
        return route.fulfill(json({ contact: { ...contact, academy_id: body.academy_id } }));
      });
      const fill = async (firstName: string) => {
        await page.getByText("Add contact", { exact: true }).click();
        await page.getByRole("textbox", { name: "First name", exact: true }).fill(firstName);
        await page.getByRole("textbox", { name: "Last name", exact: true }).fill("QA");
        await page.getByRole("textbox", { name: "Email", exact: true }).fill("save@example.test");
        await page.getByRole("button", { name: "Save contact", exact: true }).click();
      };
      try {
        await page.goto(`/academy/admin/contacts?academy_id=${academyId}`);
        await fill("Old workspace");
        await expect.poll(() => writes.length).toBe(1);
        await page.getByRole("button", { name: "Switch workspace", exact: true }).click();
        await page.getByRole("button", { name: "Manage Next Academy", exact: true }).click();
        const contactsNavigation = page.getByRole('navigation', { name: 'Academy Admin navigation' }).getByRole("button", { name: "Contacts", exact: true });
        if (!(await contactsNavigation.isVisible())) await page.getByRole("button", { name: "Daily operations", exact: true }).click();
        await contactsNavigation.click();
        await fill("New workspace");
        await expect.poll(() => writes.length).toBe(2);
        const oldResponse = page.waitForResponse((response) => response.request().postDataJSON()?.action === "upsert_contact" && response.request().postDataJSON()?.academy_id === academyId);
        releaseOld();
        await oldResponse;
        await expect(page.getByRole("textbox", { name: "First name", exact: true })).toHaveValue("New workspace");
        await expect(page.getByRole("button", { name: "Save contact", exact: true })).toBeDisabled();
        await expect(page.getByText("Contact saved.", { exact: true })).toHaveCount(0);
        await expect(page.locator('.error-banner')).toHaveCount(0);
        releaseNew();
        await expect(page.getByRole("button", { name: "Save contact", exact: true })).toBeEnabled();
        await expect(page.getByRole("textbox", { name: "First name", exact: true })).toHaveValue("");
        await expect(page.getByText("Contact saved.", { exact: true })).toBeVisible();
        expect(writes.map((body) => body.academy_id)).toEqual([academyId, nextId]);
      } finally { releaseOld(); releaseNew(); }
    });
  }

  test("obsolete checkout cannot open or redirect after leaving payments", async ({ page, context }) => {
    await seedSessionCookie(page, "owner-user");
    await mockAcademyEdge(page, "owner");
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    let requested = false;
    let providerNavigations = 0;
    await context.route('https://my.click.uz/**', async (route) => { providerNavigations += 1; await route.abort(); });
    await page.route('**/functions/v1/click/create-transaction', async (route) => {
      requested = true;
      await blocked;
      await route.fulfill(json({ payment_url: 'https://my.click.uz/services/pay?transaction_id=qa-fixture', transaction_id: 'qa-fixture', academy_payment_id: 'qa-payment', amount: 500000, currency: 'UZS', final_amount: 500000 }));
    });
    try {
      await page.goto(`/academy/admin/payments?academy_id=${academyId}`);
      await page.getByRole('combobox', { name: 'Contact', exact: true }).selectOption(studentContactId);
      await page.getByRole('combobox', { name: 'Offer', exact: true }).selectOption('offer-route-smoke');
      await page.getByRole('button', { name: 'Create Click checkout', exact: true }).click();
      await expect.poll(() => requested).toBe(true);
      await page.getByRole('button', { name: 'Switch workspace', exact: true }).click();
      await expect(page).toHaveURL(/\/academies/);
      const response = page.waitForResponse('**/functions/v1/click/create-transaction');
      release();
      await response;
      // A task queued after the response lets the submit continuation run.
      await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
      await expect(page).toHaveURL(/\/academies/);
      expect(context.pages()).toHaveLength(1);
      expect(providerNavigations).toBe(0);
      await expect(page.locator('.info-banner')).toHaveCount(0);
    } finally { release(); }
  });

  for (const leaveBeforeCompletion of [false, true]) {
    test(`academy creation ${leaveBeforeCompletion ? 'does not redirect an abandoned setup' : 'opens the new academy without duplicate office reads'}`, async ({ page }) => {
      await seedSessionCookie(page, 'owner-user');
      let release!: () => void;
      const blocked = new Promise<void>((resolve) => { release = resolve; });
      let requested = false;
      const actionLog: string[] = [];
      await mockAcademyEdge(page, 'owner', {
        actionLog,
        respond: async (body) => {
          if (body.action !== 'create_academy') return undefined;
          requested = true;
          await blocked;
          return { academy: academy('owner') };
        },
      });
      try {
        await page.goto('/academy/setup');
        await page.getByRole('textbox', { name: 'Academy name', exact: true }).fill('QA Academy');
        await page.getByRole('button', { name: 'Create academy', exact: true }).click();
        await expect.poll(() => requested).toBe(true);
        await expect(page.getByRole('textbox', { name: 'Academy name', exact: true })).toBeDisabled();
        if (leaveBeforeCompletion) await page.getByRole('button', { name: 'Back to workspaces', exact: true }).click();
        const response = page.waitForResponse((response) => response.request().postDataJSON()?.action === 'create_academy');
        release();
        await response;
        if (leaveBeforeCompletion) {
          await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
          await expect(page).toHaveURL(/\/academies/);
          await expect(page.locator('.info-banner')).toHaveCount(0);
        } else {
          await expect(page).toHaveURL(new RegExp(`/academy\\?academy_id=${academyId}`));
          await expect(page.getByRole('heading', { level: 1, name: 'Route Smoke Academy', exact: true })).toBeVisible();
          await expect.poll(() => actionLog.filter((action) => action === 'summary').length).toBe(1);
          await page.waitForLoadState('networkidle');
          expect(actionLog.filter((action) => action === 'summary')).toHaveLength(1);
          expect(actionLog).not.toContain('education_os');
        }
      } finally { release(); }
    });
  }

  test("inbox switches clear private drafts and discard obsolete thread responses", async ({ page }) => {
    await seedSessionCookie(page, "owner-user");
    const threadIds = ["thread-first", "thread-middle", "thread-final"];
    let releaseMiddle!: () => void;
    const blocked = new Promise<void>((resolve) => { releaseMiddle = resolve; });
    let middleRequested = false;
    await mockAcademyEdge(page, "owner", {
      actionOverrides: { conversations: { conversations: threadIds.map((id, index) => ({ id, academy_id: academyId, contact_id: `${id}-contact`, contact: { id: `${id}-contact`, first_name: ["First", "Middle", "Final"][index], last_name: "Contact", email: null, status: "active" }, last_message: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" })) } },
      respond: async (body) => {
        if (body.action !== "conversation-messages") return undefined;
        const thread = String(body.conversation_id);
        if (thread === threadIds[1]) { middleRequested = true; await blocked; }
        return { messages: [{ id: `${thread}-message`, academy_id: academyId, conversation_id: thread, contact_id: null, sender_type: "contact", message_type: "text", content: `${thread} private message`, metadata: {}, created_at: "2026-01-01T00:00:00Z" }] };
      },
    });
    await page.goto(`/academy/admin/inbox?academy_id=${academyId}`);
    await expect(page.getByText("thread-first private message", { exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("Private draft for the first contact");
    await page.getByRole("button", { name: /^Middle Contact/ }).click();
    await expect.poll(() => middleRequested).toBe(true);
    await expect(page.getByText("thread-first private message", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("");
    await page.getByRole("button", { name: /^Final Contact/ }).click();
    await expect(page.getByText("thread-final private message", { exact: true })).toBeVisible();
    const lateResponse = page.waitForResponse((response) => response.request().postDataJSON()?.action === "conversation-messages" && response.request().postDataJSON()?.conversation_id === threadIds[1]);
    releaseMiddle();
    await lateResponse;
    await expect(page.getByText("thread-final private message", { exact: true })).toBeVisible();
    await expect(page.getByText("thread-middle private message", { exact: true })).toHaveCount(0);
  });

  test("a late classroom refresh cannot replace the next classroom", async ({ page }) => {
    await seedSessionCookie(page, "owner-user");
    const nextClassroom = { ...classroom, id: "classroom-next", name: "Next Classroom" };
    let releaseRefresh!: () => void;
    const blocked = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    let firstReads = 0;
    let refreshRequested = false;
    await mockAcademyEdge(page, "owner", {
      actionOverrides: { classrooms: { classrooms: [classroom, nextClassroom] }, "student-dashboard": { ...studentDashboard, classrooms: [classroom, nextClassroom] } },
      respond: async (body) => {
        if (body.action !== "classroom-chat") return undefined;
        const selected = body.classroom_id === nextClassroom.id ? nextClassroom : classroom;
        if (selected.id === classroomId && ++firstReads > 1) { refreshRequested = true; await blocked; }
        return { academy_id: academyId, classroom: selected, viewer: { type: "teacher", role: "owner", can_manage_resources: true, contact_id: null, display_name: "Teacher" }, members: [], resources: [], messages: [{ id: `${selected.id}-message`, content: `${selected.name} private discussion`, sender_type: "teacher", created_at: "2026-01-01T00:00:00Z" }], announcements: [], progress: { viewer_completed_resource_ids: [], resource_completed_counts: {}, total_members: 0 } };
      },
    });
    await page.goto(`/academy/classrooms/${classroomId}?academy_id=${academyId}`);
    await expect(page.getByRole("heading", { level: 1, name: classroom.name, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Refresh classroom", exact: true }).click();
    await expect.poll(() => refreshRequested).toBe(true);
    await page.getByRole("button", { name: "Classroom directory", exact: true }).click();
    await page.locator("article").filter({ has: page.getByRole("heading", { name: nextClassroom.name, exact: true }) }).getByRole("button", { name: "Open landing", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: nextClassroom.name, exact: true })).toBeVisible();
    const lateResponse = page.waitForResponse((response) => response.request().postDataJSON()?.action === "classroom-chat" && response.request().postDataJSON()?.classroom_id === classroomId);
    releaseRefresh();
    await lateResponse;
    await expect(page.getByRole("heading", { level: 1, name: nextClassroom.name, exact: true })).toBeVisible();
    await expect(page.getByText(`${classroom.name} private discussion`, { exact: true })).toHaveCount(0);
  });

  test("a pending inbox send locks its recipient and preserves the draft on failure", async ({ page }) => {
    await seedSessionCookie(page, "owner-user");
    const threadIds = ["thread-first", "thread-next"];
    let releaseSend!: () => void;
    const blocked = new Promise<void>((resolve) => { releaseSend = resolve; });
    let sendRequested = false;
    await mockAcademyEdge(page, "owner", {
      failActions: ["send_message"],
      actionOverrides: { conversations: { conversations: threadIds.map((id, index) => ({ id, academy_id: academyId, contact_id: `${id}-contact`, contact: { id: `${id}-contact`, first_name: index === 0 ? "First" : "Next", last_name: "Contact", email: null, status: "active" }, last_message: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" })) } },
      respond: async (body) => {
        if (body.action === "conversation-messages") return { messages: [] };
        if (body.action === "send_message") { sendRequested = true; await blocked; }
        return undefined;
      },
    });
    await page.goto(`/academy/admin/inbox?academy_id=${academyId}`);
    const draft = page.getByRole("textbox", { name: "Message", exact: true });
    await expect(draft).toBeEnabled();
    await draft.fill("Keep this private draft after a failed send");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect.poll(() => sendRequested).toBe(true);
    await expect(page.getByRole("button", { name: /^Next Contact/ })).toBeDisabled();
    await expect(draft).toBeDisabled();
    releaseSend();
    await expect(page.locator('.error-banner')).toContainText("Mock send_message failure");
    await expect(draft).toHaveValue("Keep this private draft after a failed send");
    await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: /^Next Contact/ }).click();
    await expect(draft).toHaveValue("");
  });

  test("an old classroom send cannot erase a draft after leaving and returning", async ({ page }) => {
    await seedSessionCookie(page, "owner-user");
    let releaseSend!: () => void;
    const blocked = new Promise<void>((resolve) => { releaseSend = resolve; });
    const sent: Record<string, unknown>[] = [];
    await mockAcademyEdge(page, "owner", {
      respond: async (body) => {
        if (body.action !== "classroom-chat-send") return undefined;
        sent.push(body);
        await blocked;
        return { academy_id: academyId, classroom_id: classroomId, delivered: 1 };
      },
    });
    await page.goto(`/academy/classrooms/${classroomId}?academy_id=${academyId}`);
    const draft = page.getByPlaceholder("Write your question, insight, or answer...");
    await expect(draft).toBeEnabled();
    await draft.fill("Original discussion message");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => sent.length).toBe(1);
    await page.getByRole("button", { name: "Classroom directory", exact: true }).click();
    await page.locator("article").filter({ has: page.getByRole("heading", { name: classroom.name, exact: true }) }).getByRole("button", { name: "Open landing", exact: true }).click();
    await expect(draft).toBeEnabled();
    await draft.fill("New draft in the reopened classroom");
    const lateResponse = page.waitForResponse((response) => response.request().postDataJSON()?.action === "classroom-chat-send");
    releaseSend();
    await lateResponse;
    await expect(draft).toHaveValue("New draft in the reopened classroom");
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
    await expect(page.getByText("Message sent to classroom discussion.", { exact: true })).toHaveCount(0);
    expect(sent[0].classroom_id).toBe(classroomId);
    expect(sent[0].content).toBe("Original discussion message");
    expect(sent).toHaveLength(1);
  });

  test("a failed classroom opening shows the error and allows a safe refresh", async ({ page }) => {
    await seedSessionCookie(page, "owner-user");
    await mockAcademyEdge(page, "owner", { failActionAttempts: { "classroom-chat": 1 } });
    await page.goto(`/academy/classrooms/${classroomId}?academy_id=${academyId}`);
    await expect(page.getByRole("alert")).toContainText("Mock classroom-chat failure");
    const draft = page.getByPlaceholder("Write your question, insight, or answer...");
    await expect(draft).toBeDisabled();
    await page.getByRole("button", { name: "Refresh classroom", exact: true }).click();
    await expect(page.getByText("Essay checklist", { exact: true }).first()).toBeVisible();
    await expect(draft).toBeEnabled();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("owner can open the administrator route and see finance controls", async ({ page }) => {
    await seedSessionCookie(page, "owner-user");
    await mockAcademyEdge(page, "owner");

    await page.goto(`/academy/admin/payments?academy_id=${academyId}`);

    await expect(page.getByText("Academy Admin")).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Billing & payments$/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Create Click checkout/i })).toBeVisible();
    await expect(page.getByLabel("Contact")).toBeVisible();
    await expect(page.getByLabel("Offer")).toBeVisible();
    await expect(page.getByLabel("Search payments")).toBeVisible();
    await expect(page.getByRole("table").getByText("Awaiting Click")).toBeVisible();
  });

  test("teaching day opens without waiting for unrelated operations data", async ({ page }) => {
    await seedSessionCookie(page, "teacher-user");
    const actionLog: string[] = [];
    const delayActions = { education_os: 8_000, teacher_day: 200, summary: 200 };
    await mockAcademyEdge(page, "teacher", {
      actionLog,
      delayActions,
    });
    const started = Date.now();
    await page.goto(`/academy/teacher?academy_id=${academyId}`);
    await expect(page.getByRole("button", { name: /^Start lesson$/i })).toBeVisible({ timeout: 4_000 });
    console.log('ACADEMY_TEACHING_STARTUP', JSON.stringify({ usableMs: Date.now() - started, actionLog }));
    expect(actionLog.filter((action) => action === 'teacher_day')).toHaveLength(1);
    expect(actionLog).not.toContain('education_os');
    expect(actionLog.filter((action) => action === 'student-feed')).toHaveLength(1);
    delayActions.education_os = 0;
    await page.getByRole("button", { name: /^Teaching tools$/i }).click();
    await page.getByRole("button", { name: /^Curriculum & grading$/i }).click();
    await expect(page.getByRole("heading", { name: /^Curriculum & grading$/i }).first()).toBeVisible();
    await expect.poll(() => actionLog.includes('education_os')).toBe(true);
  });

  test("teaching dates hide obsolete lesson actions and ignore late day responses", async ({ page }) => {
    await seedSessionCookie(page, "teacher-user");
    let releaseMiddle!: () => void;
    const middleBlocked = new Promise<void>((resolve) => { releaseMiddle = resolve; });
    const dates: string[] = [];
    await mockAcademyEdge(page, "teacher", {
      respond: async (body) => {
        if (body.action !== "teacher_day") return undefined;
        const requestedDate = String(body.date);
        dates.push(requestedDate);
        if (dates.length === 2) await middleBlocked;
        return {
          date: requestedDate, counts: { sessions: 1, students: 1, attendance_pending: 1, homework_pending: 1 },
          sessions: [{
            id: `session-${requestedDate}`, academy_id: academyId, classroom_id: classroomId,
            classroom_name: `Class ${requestedDate}`, room_name: "Room 12", title: "Lesson", timezone: "Asia/Tashkent",
            starts_at: `${requestedDate}T13:00:00.000Z`, ends_at: `${requestedDate}T14:30:00.000Z`, status: "scheduled", delivery_mode: "physical",
            roster: [{ contact_id: studentContactId, name: "Ali Karimov", status: null, notes: null }], attendance_saved: false,
            curriculum: { lesson_title: `Plan ${requestedDate}`, objectives: [], estimated_minutes: 90 },
            resources: [], homework: { title: "Homework", description: "Task", due_at: "" }, run: null, connected_group_count: 0,
          }],
        };
      },
    });
    await page.goto(`/academy/teacher?academy_id=${academyId}`);
    await expect(page.getByRole("button", { name: "Start lesson", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Next day", exact: true }).click();
    await expect.poll(() => dates.length).toBe(2);
    await expect(page.getByRole("button", { name: "Start lesson", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Next day", exact: true }).click();
    await expect.poll(() => dates.length).toBe(3);
    await expect(page.getByRole("heading", { name: `Plan ${dates[2]}`, exact: true })).toBeVisible();
    const middleResponse = page.waitForResponse((response) => response.request().postDataJSON()?.action === "teacher_day" && response.request().postDataJSON()?.date === dates[1]);
    releaseMiddle();
    await middleResponse;
    await expect(page.getByRole("heading", { name: `Plan ${dates[2]}`, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: `Plan ${dates[1]}`, exact: true })).toHaveCount(0);
  });

  test("sign-out in another tab invalidates a pending private workspace startup", async ({ page, context }) => {
    await seedSessionCookie(page, "owner-user");
    let releaseContacts!: () => void;
    const contactsBlocked = new Promise<void>((resolve) => { releaseContacts = resolve; });
    let contactsRequested = false;
    await mockAcademyEdge(page, "owner", { respond: async (body) => {
      if (body.action !== "contacts") return undefined;
      contactsRequested = true;
      await contactsBlocked;
      return { contacts: [contact] };
    } });
    await page.goto(`/academy/admin/contacts?academy_id=${academyId}`);
    await expect.poll(() => contactsRequested).toBe(true);
    const otherTab = await context.newPage();
    await mockAcademyEdge(otherTab, "owner");
    await otherTab.route("**/auth/v1/logout**", (route) => route.fulfill({ status: 204, body: "" }));
    await otherTab.goto(`/academy/admin/classrooms?academy_id=${academyId}`);
    await otherTab.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    const contactsResponse = page.waitForResponse((response) => response.request().postDataJSON()?.action === "contacts");
    releaseContacts();
    await contactsResponse;
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByText("Ali Karimov", { exact: true })).toHaveCount(0);
  });

  test("academy switching preserves the latest URL, records, and fresh forms", async ({ page }) => {
    await seedSessionCookie(page, "owner-user");
    const middleId = "academy-middle";
    const finalId = "academy-final";
    let releaseMiddle!: () => void;
    const middleBlocked = new Promise<void>((resolve) => { releaseMiddle = resolve; });
    let middleRequested = false;
    const contactRequests: string[] = [];
    await mockAcademyEdge(page, "owner", {
      actionOverrides: { academies: { academies: [academy("owner"), { ...academy("owner"), id: middleId, name: "Middle Academy" }, { ...academy("owner"), id: finalId, name: "Final Academy" }] } },
      respond: async (body) => {
        if (body.action === "summary") return { academy_id: body.academy_id, access: ownerAccess, counts: { contacts: 1, classrooms: 0, offers: 0, active_entitlements: 0, open_alerts: 0 } };
        if (body.action !== "contacts") return undefined;
        const selected = String(body.academy_id);
        contactRequests.push(selected);
        if (selected === middleId) { middleRequested = true; await middleBlocked; }
        return { contacts: [{ ...contact, id: `${selected}-contact`, academy_id: selected, first_name: selected === academyId ? "Ali" : selected === finalId ? "Current" : "Obsolete", last_name: "Karimov" }] };
      },
    });
    await page.goto(`/academy/admin/contacts?academy_id=${academyId}`);
    await expect(page.getByText("Ali Karimov", { exact: true }).first()).toBeVisible();
    await page.getByText("Add contact", { exact: true }).click();
    await page.getByRole("textbox", { name: "First name", exact: true }).fill("Old draft");
    const academySelect = page.locator(".ts-topbar .academy-select");
    await academySelect.selectOption(middleId);
    await expect.poll(() => middleRequested).toBe(true);
    await expect(page).toHaveURL(new RegExp(`academy_id=${middleId}`), { timeout: 2_000 });
    await expect(page.getByText("Ali Karimov", { exact: true })).toHaveCount(0);
    await page.getByText("Add contact", { exact: true }).click();
    await expect(page.getByRole("textbox", { name: "First name", exact: true })).toHaveValue("");
    await academySelect.selectOption(finalId);
    await expect(page.getByText("Current Karimov", { exact: true }).first()).toBeVisible();
    const middleResponse = page.waitForResponse((response) => response.request().postDataJSON()?.action === "contacts" && response.request().postDataJSON()?.academy_id === middleId);
    releaseMiddle();
    await middleResponse;
    await expect(page).toHaveURL(new RegExp(`academy_id=${finalId}`));
    await expect(page.getByText("Current Karimov", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Obsolete Karimov", { exact: true })).toHaveCount(0);
    expect(contactRequests).toEqual([academyId, middleId, finalId]);
  });

  test("teacher route opens an action-first teaching day without finance controls", async ({ page }) => {
    await seedSessionCookie(page, "teacher-user");
    await mockAcademyEdge(page, "teacher");

    await page.goto(`/academy/teacher?academy_id=${academyId}`);

    await expect(page).toHaveURL(/\/academy\/teacher\?academy_id=/);
    await expect(page.getByText("Teacher Workspace")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /^Teaching today$/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Your teaching day$/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Problem and solution essays" })).toBeVisible();
    await expect(page.getByText("Essay checklist")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Start lesson$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Save attendance$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Finance$/i })).toHaveCount(0);
    await page.getByRole("button", { name: /^My classes$/i }).click();
    await expect(page).toHaveURL(/\/academy\/teacher\/classrooms/);
    await expect(page.getByRole("button", { name: "IELTS Evening A" })).toBeVisible();
  });

  for (const width of [1440, 1200, 768, 390, 320]) {
    test(`reference dashboard keeps useful panels and controls reachable at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({width, height: 900});
      await seedSessionCookie(page, `reference-dashboard-${width}`);
      const now = Date.now();
      const fixture = {
        ...educationOS,
        action_queue: ['Review speaking feedback', 'Confirm trial lesson', 'Follow up on attendance', 'Check renewal request'].map((title, index) => ({
          ...educationOS.action_queue[0], id: `reference-task-${index}`, title,
          description: ['Feedback is ready for review.', 'A learner is waiting for confirmation.', 'Contact the family about an absence.', 'Review the learner’s next course.'][index],
          priority: index < 2 ? 'high' : 'medium', due_at: new Date(now + (index + 1) * 3_600_000).toISOString(),
        })),
        calendar_events: ['IELTS Speaking · Room 2', 'General English · Room 1', 'Trial lesson · Room 3'].map((title, index) => ({
          id: `reference-event-${index}`, type: 'lesson', title, starts_at: new Date(now + (index + 2) * 3_600_000).toISOString(),
          ends_at: new Date(now + (index + 3) * 3_600_000).toISOString(), classroom_id: classroomId,
          contact_id: null, priority: 'low', metadata: {},
        })),
        stats: {...educationOS.stats, open_actions: 4, urgent_actions: 2},
      };
      const actionLog: string[] = [];
      await mockAcademyEdge(page, 'owner', {actionLog, actionOverrides: {education_os: fixture}});
      await page.goto(`/academy/admin?academy_id=${academyId}`);
      await expect(page.getByRole('heading', {name: 'Today at your academy'})).toBeVisible();
      await expect(page.getByRole('heading', {name: 'Workload', exact: true})).toBeVisible();
      await expect(page.getByText('IELTS Speaking · Room 2', {exact: true})).toBeVisible();
      await expect(page.locator('.workspace-route-stage')).toHaveAttribute('aria-busy', 'false');
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({path: testInfo.outputPath(`reference-dashboard-${width}.png`), fullPage: true});
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      const panels = await page.locator('.workspace-home').evaluate(element => {
        const rect = (selector: string) => {
          const box = element.querySelector(selector)!.getBoundingClientRect();
          return {x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width};
        };
        return {identity: rect('.workspace-home__hero'), metrics: rect('.workspace-pulse'), schedule: rect('.workspace-schedule'), queue: rect('.attention-ledger'), workload: rect('.workspace-workload')};
      });
      if (width >= 1200) {
        expect(panels.identity.right).toBeLessThan(panels.metrics.x);
        expect(panels.metrics.right).toBeLessThan(panels.workload.x);
        expect(panels.identity.width).toBeLessThan(300);
        expect(panels.queue.x).toBe(panels.metrics.x);
        expect(panels.queue.bottom).toBeLessThanOrEqual(900);
      }
      if (width <= 390) {
        expect(panels.identity.bottom).toBeLessThanOrEqual(panels.metrics.y);
        expect(panels.queue.bottom).toBeLessThanOrEqual(panels.schedule.y);
      }
      const refresh = page.locator('.topbar-actions').getByRole('button', {name: 'Refresh', exact: true});
      await refresh.focus(); await expect(refresh).toBeFocused();
      expect((await refresh.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      expect(actionLog.filter(action => action === 'education_os')).toHaveLength(1);
    });
  }

  test('reference dashboard does not show an all-clear workload when task data is unavailable', async ({page}) => {
    await seedSessionCookie(page, 'reference-pending');
    await mockAcademyEdge(page, 'owner', {failActions: ['education_os']});
    await page.goto(`/academy/admin?academy_id=${academyId}`);
    await expect(page.getByRole('heading', {name: 'Today at your academy'})).toBeVisible();
    await expect(page.locator('.workspace-workload__chart strong')).toHaveText('—');
    await expect(page.getByText('Schedule is unavailable. Refresh to try again.', {exact: true})).toBeVisible();
    await expect(page.getByText('No upcoming events', {exact: true})).toHaveCount(0);
  });

  test("center route keeps selected-academy context without teacher controls", async ({ page }) => {
    await seedSessionCookie(page, "center-user");
    await mockAcademyEdge(page, "center_admin");

    await page.goto(`/academy/center?academy_id=${academyId}`);
    await expect(page.getByText("Center Admin Workspace")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Today across this academy" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Teaching queue" })).toHaveCount(0);
  });

  test("office route prioritizes daily operations without finance administration", async ({ page }) => {
    await seedSessionCookie(page, "office-user");
    await mockAcademyEdge(page, "manager");

    await page.goto(`/academy/office?academy_id=${academyId}`);
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What needs handling today?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Finance" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cash & payroll" })).toHaveCount(0);
  });

  test("cashier reaches collection and cash tools without owner-only finance permissions", async ({ page }) => {
    await seedSessionCookie(page, "cashier-user");
    const actionLog: string[] = [];
    await mockAcademyEdge(page, "cashier", { actionLog });

    await page.goto(`/academy/office/payments?academy_id=${academyId}`);
    await expect(page.getByRole("heading", { name: "Create Click checkout" })).toHaveCount(0);
    await page.getByRole("button", { name: "Daily operations", exact: true }).click();
    await page.getByRole("button", { name: "Billing & finance" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Commercial core" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Balances and aging" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Plans & agreements" })).toHaveCount(0);
    await page.getByRole("button", { name: "Charges & allocation" }).click();
    await expect(page.getByRole("heading", { name: "Apply payment to charge" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Issue charge" })).toHaveCount(0);
    await page.getByRole("button", { name: "Debt", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Record payment promise" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ledger & reconciliation" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Post adjustment" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Offers" })).toHaveCount(0);
    await page.getByRole("button", { name: "Manage" }).click();
    await expect(page.getByRole("button", { name: "Cash & payroll" })).toBeVisible();
    await page.getByRole("button", { name: "Cash & payroll" }).click();
    await expect(page.getByRole("heading", { name: "Open cashier shift" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Payroll", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Bonus or deduction" })).toHaveCount(0);
    expect(actionLog).not.toContain("offers");
    expect(actionLog).not.toContain("payments");
    expect(accessForPersona("cashier").permissions.refundFinance).toBe(false);
    expect(accessForPersona("cashier").permissions.approvePayroll).toBe(false);
  });

  test("payroll officer reaches payroll without cashier, expense, or approval controls", async ({ page }) => {
    await seedSessionCookie(page, "payroll-user");
    await mockAcademyEdge(page, "payroll_officer");

    await page.goto(`/academy/office/operations?academy_id=${academyId}`);
    await expect(page.getByRole("heading", { name: "Cashier, economics, and payroll" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Payroll", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cashier", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Expenses & budgets" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Compensation rule" })).toBeVisible();
    expect(accessForPersona("payroll_officer").permissions.approvePayroll).toBe(false);
    expect(accessForPersona("payroll_officer").permissions.payPayroll).toBe(false);
  });

  test("parent liaison reaches guardian relationships without finance navigation", async ({ page }) => {
    await seedSessionCookie(page, "liaison-user");
    await mockAcademyEdge(page, "parent_liaison");

    await page.goto(`/academy/office/relationships?academy_id=${academyId}`);
    await expect(
      page.getByRole("heading", {
        name: "Guardians, consent, and parent communication",
      }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Finance" })).toHaveCount(0);
    expect(accessForPersona("parent_liaison").permissions.manageGuardians).toBe(true);
    expect(accessForPersona("parent_liaison").permissions.manageFinance).toBe(false);
  });

  test("service desk gives operational roles plain task lanes without exposing connection controls", async ({ page }) => {
    await seedSessionCookie(page, "liaison-service-user");
    await mockAcademyEdge(page, "parent_liaison");

    await page.goto(`/academy/office/services?academy_id=${academyId}`);

    await expect(page.getByRole("heading", { name: "Run the work that crosses teams" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Access.*Invitations/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Advanced connections" })).toHaveCount(0);
    await expect(page.getByText("Internal key", { exact: true })).toHaveCount(0);
  });

  test("student can reach requests and a published learning plan from the learning workspace", async ({ page }) => {
    await seedSessionCookie(page, "student-user");
    await mockAcademyEdge(page, "student");

    await page.goto(`/academy/student/requests?academy_id=${academyId}`);
    await expect(page.getByRole("heading", { name: "Ask the academy for help" })).toBeVisible();
    await expect(page.getByText("Move lesson time", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Learning plan" }).click();
    await expect(page.getByRole("heading", { name: "What I am working toward" })).toBeVisible();
    await expect(page.getByText("IELTS writing goal", { exact: true })).toBeVisible();
  });

  test("guardian can request help without entering staff operations", async ({ page }) => {
    await seedSessionCookie(page, "guardian-user");
    await mockAcademyEdge(page, "guardian");

    await page.goto(`/academy/parent?academy_id=${academyId}`);
    await page.getByRole("button", { name: "Ask for help" }).click();
    await expect(page.getByRole("heading", { name: "Requests for the academy" })).toBeVisible();
    await expect(page.getByText("Payment receipt", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Advanced connections" })).toHaveCount(0);
  });

  test("invitation link explains access before accepting and opens the correct workspace", async ({ page }) => {
    await seedSessionCookie(page, "invited-student");
    await mockAcademyEdge(page, "student");

    await page.goto("/invitations/accept?token=valid-route-token");
    await expect(page.getByRole("heading", { name: "Join your Academy workspace" })).toBeVisible();
    await expect(page.getByText("Route Smoke Academy", { exact: true })).toBeVisible();
    await expect(page.getByText("Student learning access", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Accept and open workspace" }).click();
    await expect(page.getByRole("heading", { name: "Your access is ready" })).toBeVisible();
    await page.getByRole("button", { name: "Open my workspace" }).click();
    await expect(page).toHaveURL(/\/academy\/student\?academy_id=/);
  });

  test("assistant receives the production teaching lane and no finance controls", async ({ page }) => {
    await seedSessionCookie(page, "assistant-user");
    await mockAcademyEdge(page, "assistant");

    await page.goto(`/academy/teacher?academy_id=${academyId}`);
    await expect(page.getByRole("heading", { level: 1, name: "Teaching today" })).toBeVisible();
    await expect(page.getByRole("button", { name: "My classes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Finance" })).toHaveCount(0);
    expect(accessForPersona("assistant").permissions.manageAssignments).toBe(true);
    expect(accessForPersona("assistant").permissions.manageFinance).toBe(false);
  });

  test("production role matrix preserves each landing, one permitted action, and one forbidden boundary", async ({ browser }) => {
    test.setTimeout(180_000);
    const roleCases: Array<{
      persona: Persona;
      landing: string;
      landingHeading: RegExp;
      allowedPath: string;
      allowedHeading?: string;
      allowedAction?: RegExp;
      allowedButton?: RegExp;
      setupAllowed?: (page: Page) => Promise<void>;
      forbiddenNav: string;
      forbiddenPath: string;
      forbiddenControl: string;
    }> = [
      {
        persona: "owner",
        landing: "/academy/admin",
        landingHeading: /^Today$/,
        allowedPath: "/academy/admin/business",
        allowedHeading: "Capture lead",
        allowedAction: /^Add lead$/,
        forbiddenNav: "My LMS classes",
        forbiddenPath: "/academy/teacher",
        forbiddenControl: "My LMS classes",
      },
      {
        persona: "admin",
        landing: "/academy/admin",
        landingHeading: /^Today$/,
        allowedPath: "/academy/admin/business",
        allowedHeading: "Capture lead",
        allowedAction: /^Add lead$/,
        forbiddenNav: "My LMS classes",
        forbiddenPath: "/academy/teacher",
        forbiddenControl: "My LMS classes",
      },
      {
        persona: "center_admin",
        landing: "/academy/center",
        landingHeading: /^Today$/,
        allowedPath: "/academy/center/business",
        allowedHeading: "Add branch",
        allowedAction: /^Add branch$/,
        setupAllowed: async (page) => page.getByRole("button", { name: "Branches & rooms" }).click(),
        forbiddenNav: "My LMS classes",
        forbiddenPath: "/academy/teacher",
        forbiddenControl: "My LMS classes",
      },
      {
        persona: "branch_manager",
        landing: "/academy/office",
        landingHeading: /^Today$/,
        allowedPath: "/academy/office/business",
        allowedHeading: "Capture lead",
        allowedAction: /^Add lead$/,
        forbiddenNav: "Offers",
        forbiddenPath: "/academy/admin/offers",
        forbiddenControl: "Create offer",
      },
      {
        persona: "manager",
        landing: "/academy/office",
        landingHeading: /^Today$/,
        allowedPath: "/academy/office/business",
        allowedHeading: "Capture lead",
        allowedAction: /^Add lead$/,
        forbiddenNav: "Offers",
        forbiddenPath: "/academy/admin/offers",
        forbiddenControl: "Create offer",
      },
      {
        persona: "counselor",
        landing: "/academy/office",
        landingHeading: /^Today$/,
        allowedPath: "/academy/office/business",
        allowedHeading: "Capture lead",
        allowedAction: /^Add lead$/,
        forbiddenNav: "Offers",
        forbiddenPath: "/academy/admin/offers",
        forbiddenControl: "Create offer",
      },
      {
        persona: "receptionist",
        landing: "/academy/office",
        landingHeading: /^Today$/,
        allowedPath: "/academy/office/business",
        allowedHeading: "Capture lead",
        allowedAction: /^Add lead$/,
        forbiddenNav: "Offers",
        forbiddenPath: "/academy/admin/offers",
        forbiddenControl: "Create offer",
      },
      {
        persona: "salesperson",
        landing: "/academy/office",
        landingHeading: /^Today$/,
        allowedPath: "/academy/office/business",
        allowedHeading: "Capture lead",
        allowedAction: /^Add lead$/,
        forbiddenNav: "Offers",
        forbiddenPath: "/academy/admin/offers",
        forbiddenControl: "Create offer",
      },
      {
        persona: "cashier",
        landing: "/academy/office",
        landingHeading: /^Today$/,
        allowedPath: "/academy/office/commercial",
        allowedHeading: "Apply payment to charge",
        allowedAction: /^Allocate payment$/,
        setupAllowed: async (page) => page.getByRole("button", { name: "Charges & allocation" }).click(),
        forbiddenNav: "Offers",
        forbiddenPath: "/academy/admin/offers",
        forbiddenControl: "Create offer",
      },
      {
        persona: "accountant",
        landing: "/academy/office",
        landingHeading: /^Today$/,
        allowedPath: "/academy/office/commercial",
        allowedHeading: "Post adjustment",
        allowedAction: /^Post adjustment$/,
        setupAllowed: async (page) => page.getByRole("button", { name: "Ledger & reconciliation" }).click(),
        forbiddenNav: "Offers",
        forbiddenPath: "/academy/admin/offers",
        forbiddenControl: "Create offer",
      },
      {
        persona: "payroll_officer",
        landing: "/academy/office",
        landingHeading: /^Today$/,
        allowedPath: "/academy/office/operations",
        allowedHeading: "Compensation rule",
        allowedAction: /^Save compensation rule$/,
        forbiddenNav: "Finance",
        forbiddenPath: "/academy/admin/offers",
        forbiddenControl: "Create offer",
      },
      {
        persona: "parent_liaison",
        landing: "/academy/office",
        landingHeading: /^Today$/,
        allowedPath: "/academy/office/relationships",
        allowedHeading: "Add authorized contact",
        allowedAction: /^Create pending relationship$/,
        forbiddenNav: "Finance",
        forbiddenPath: "/academy/admin/offers",
        forbiddenControl: "Create offer",
      },
      {
        persona: "teacher",
        landing: "/academy/teacher",
        landingHeading: /^Teaching today$/,
        allowedPath: "/academy/teacher",
        allowedButton: /^My classes$/,
        forbiddenNav: "Finance",
        forbiddenPath: "/academy/admin/offers",
        forbiddenControl: "Create offer",
      },
      {
        persona: "assistant",
        landing: "/academy/teacher",
        landingHeading: /^Teaching today$/,
        allowedPath: "/academy/teacher",
        allowedButton: /^My classes$/,
        forbiddenNav: "Finance",
        forbiddenPath: "/academy/admin/offers",
        forbiddenControl: "Create offer",
      },
      {
        persona: "student",
        landing: "/academy/student",
        landingHeading: /^Today$/,
        allowedPath: "/academy/student",
        allowedButton: /Continue learning.*IELTS Evening A/,
        forbiddenNav: "Finance",
        forbiddenPath: "/academy/admin/offers",
        forbiddenControl: "Create offer",
      },
      {
        persona: "guardian",
        landing: "/academy/parent",
        landingHeading: /^Ali Karimov$/,
        allowedPath: "/academy/parent",
        allowedButton: /^Grades & homework$/,
        forbiddenNav: "Finance",
        forbiddenPath: "/academy/admin/offers",
        forbiddenControl: "Create offer",
      },
    ];
    const expectedNavigation: Record<Persona, string> = {
      owner: "Admissions",
      admin: "Admissions",
      center_admin: "Admissions",
      branch_manager: "Admissions",
      manager: "Admissions",
      counselor: "Admissions",
      receptionist: "Admissions",
      salesperson: "Admissions",
      cashier: "Billing & finance",
      accountant: "Billing & finance",
      payroll_officer: "Cash & payroll",
      parent_liaison: "Guardians",
      teacher: "My classes",
      assistant: "My classes",
      student: "My classrooms",
      guardian: "Grades & homework",
    };

    for (const roleCase of roleCases) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
      });
      const page = await context.newPage();
      await seedSessionCookie(page, `${roleCase.persona}-matrix-user`);
      await mockAcademyEdge(page, roleCase.persona);
      await page.goto(`${roleCase.landing}?academy_id=${academyId}`);
      await expect(page.getByRole("heading", { level: 1, name: roleCase.landingHeading }), `${roleCase.persona} landing`).toBeVisible();
      const navigation = page.locator(roleCase.persona === "guardian" ? ".business-tabs" : ".workspace-nav");
      for (const toggle of await navigation.locator(".workspace-nav__group-toggle").all()) {
        if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
      }
      await expect(navigation.getByRole("button", { name: expectedNavigation[roleCase.persona], exact: true }), `${roleCase.persona} expected navigation`).toBeVisible();
      await expect(navigation.getByRole("button", { name: roleCase.forbiddenNav, exact: true }), `${roleCase.persona} forbidden navigation`).toHaveCount(0);
      await page.goto(`${roleCase.allowedPath}?academy_id=${academyId}`);
      await roleCase.setupAllowed?.(page);
      if (roleCase.allowedHeading) await expect(page.getByRole("heading", { name: roleCase.allowedHeading }), `${roleCase.persona} permitted action`).toBeVisible();
      if (roleCase.allowedAction) await expect(page.getByRole("button", { name: roleCase.allowedAction }), `${roleCase.persona} permitted capability control`).toBeVisible();
      if (roleCase.allowedButton) await expect(page.getByRole("button", { name: roleCase.allowedButton }), `${roleCase.persona} permitted action`).toBeVisible();
      await page.goto(`${roleCase.forbiddenPath}?academy_id=${academyId}`);
      await expect(page.getByRole("heading", { name: roleCase.forbiddenControl }), `${roleCase.persona} direct forbidden control`).toHaveCount(0);
      await expect(page.getByRole("button", { name: roleCase.forbiddenControl, exact: true }), `${roleCase.persona} direct forbidden action`).toHaveCount(0);
      await context.close();
    }
  });

  for (const { width, font } of [{ width: 320 }, { width: 768 }, { width: 1024 }, { width: 1440 }, { width: 320, font: 'Verdana' }]) {
    test(`receptionist Quick lead captures a phone inquiry at ${width}px${font ? ` with ${font}` : ''}`, async ({ page }, testInfo) => {
      await seedSessionCookie(page, 'receptionist-user');
      const captures: Record<string, unknown>[] = [];
      await mockAcademyEdge(page, 'receptionist', { respond: async body => {
        if (body.action !== 'create_lead') return undefined;
        captures.push(body);
        return { lead: { ...businessFoundation.leads[0], ...body, id: 'quick-lead-captured' } };
      } });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/academy/office/business?academy_id=${academyId}`);
      if (font) await page.addStyleTag({ content: `body { font-family: ${font}, sans-serif !important; }` });
      const opener = page.getByRole('button', { name: 'Quick lead', exact: true });
      await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Quick lead', exact: true });
      await expect(dialog.getByLabel('Full name', { exact: true })).toBeFocused();
      await dialog.getByRole('button', { name: 'Phone', exact: true }).click();
      await dialog.getByLabel('Full name', { exact: true }).fill('Front Desk Learner');
      await dialog.getByLabel('Phone', { exact: true }).fill('+998900000001');
      await dialog.getByLabel('Target subject').fill('IELTS');
      await dialog.getByLabel('Preferred shift').selectOption('morning');
      const bounds = (await dialog.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(8);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 8);
      const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth,
        elements: Array.from(document.querySelectorAll('body *')).map(element => ({ tag: element.tagName, className: element.className, right: element.getBoundingClientRect().right, text: element.textContent?.trim().slice(0, 80) })).filter(element => element.right > innerWidth + 1).slice(0, 12),
      }));
      expect(overflow.width, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport);
      await page.screenshot({ path: testInfo.outputPath(`quick-lead-${width}.png`) });
      await dialog.getByRole('button', { name: 'Save lead', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await expect(opener).toBeFocused();
      expect(captures).toHaveLength(1);
      expect(captures[0]).toMatchObject({ academy_id: academyId, full_name: 'Front Desk Learner', phone: '+998900000001', interested_course: 'IELTS', preferred_schedule: 'morning', source_key: 'phone' });
      expect(captures[0].idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
    });
  }

  for (const responseStatus of [400, 503]) {
  test(`Quick lead keeps one immutable pending capture after an uncertain ${responseStatus} response`, async ({ page }) => {
    await seedSessionCookie(page, 'receptionist-user');
    await mockAcademyEdge(page, 'receptionist');
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const captures: Record<string, unknown>[] = [];
    await page.route('**/functions/v1/academy', async route => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (body.action !== 'create_lead') return route.fallback();
      captures.push(body);
      if (captures.length === 1) { await blocked; return route.fulfill({ status: responseStatus, contentType: 'application/json', body: JSON.stringify({ error: 'Capture temporarily unavailable' }) }); }
      return route.fulfill(json({ lead: { ...businessFoundation.leads[0], ...body, id: 'quick-retry-captured' } }));
    });
    await page.goto(`/academy/office/business?academy_id=${academyId}`);
    await page.getByRole('button', { name: 'Quick lead', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Quick lead', exact: true });
    await dialog.getByLabel('Full name', { exact: true }).fill('Retained Front Desk Learner');
    await dialog.getByLabel('Phone', { exact: true }).fill('+998900000002');
    await dialog.getByLabel('Target subject').fill('General English');
    await dialog.getByRole('button', { name: 'Save lead', exact: true }).click();
    await expect.poll(() => captures.length).toBe(1);
    await dialog.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await expect(dialog.getByLabel('Full name', { exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    expect(captures).toHaveLength(1);
    release();
    await expect(dialog.getByRole('alert')).toContainText('The save could not be confirmed. Retry to check it safely.');
    await expect(dialog.getByLabel('Full name', { exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Quick lead', exact: true }).click();
    await expect(dialog.getByLabel('Full name', { exact: true })).toHaveValue('Retained Front Desk Learner');
    await dialog.getByRole('button', { name: 'Retry saving', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(captures).toHaveLength(2);
    expect(captures[1]).toEqual(captures[0]);
  });
  }

  test('Quick lead rejects whitespace-only required values without locking or sending the draft', async ({ page }) => {
    await seedSessionCookie(page, 'receptionist-user');
    const captures: Record<string, unknown>[] = [];
    await mockAcademyEdge(page, 'receptionist', { respond: async body => {
      if (body.action !== 'create_lead') return undefined;
      captures.push(body);
      return { lead: { ...businessFoundation.leads[0], ...body } };
    } });
    await page.goto(`/academy/office/business?academy_id=${academyId}`);
    await page.getByRole('button', { name: 'Quick lead', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Quick lead', exact: true });
    await dialog.getByLabel('Full name', { exact: true }).fill('   ');
    await dialog.getByLabel('Phone', { exact: true }).fill('+998900000004');
    await dialog.getByLabel('Target subject').fill('IELTS');
    await dialog.getByRole('button', { name: 'Save lead', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Enter a name, phone number and target subject.');
    await expect(dialog.getByLabel('Full name', { exact: true })).toBeFocused();
    await expect(dialog.getByLabel('Phone', { exact: true })).toBeEnabled();
    expect(captures).toHaveLength(0);
  });

  test('Quick lead allows a rejected entry to be corrected with a new capture identity', async ({ page }) => {
    await seedSessionCookie(page, 'receptionist-user');
    await mockAcademyEdge(page, 'receptionist');
    const captures: Record<string, unknown>[] = [];
    await page.route('**/functions/v1/academy', async route => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (body.action !== 'create_lead') return route.fallback();
      captures.push(body);
      if (captures.length === 1) return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'Phone needs correction' }) });
      return route.fulfill(json({ lead: { ...businessFoundation.leads[0], ...body, id: 'quick-corrected' } }));
    });
    await page.goto(`/academy/office/business?academy_id=${academyId}`);
    await page.getByRole('button', { name: 'Quick lead', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Quick lead', exact: true });
    await dialog.getByLabel('Full name', { exact: true }).fill('Corrected Learner');
    await dialog.getByLabel('Phone', { exact: true }).fill('invalid');
    await dialog.getByLabel('Target subject').fill('IELTS');
    await dialog.getByRole('button', { name: 'Save lead', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Unable to save the inquiry. Check the details or refresh the workspace, then try again.');
    await expect(dialog.getByLabel('Phone', { exact: true })).toBeEnabled();
    await dialog.getByLabel('Phone', { exact: true }).fill('+998900000003');
    await dialog.getByRole('button', { name: 'Save lead', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(captures).toHaveLength(2);
    expect(captures[1].phone).toBe('+998900000003');
    expect(captures[1].idempotency_key).not.toBe(captures[0].idempotency_key);
  });

  test("owner can run admissions pipeline and branch operations", async ({ page }) => {
    await seedSessionCookie(page, "owner-user");
    await mockAcademyEdge(page, "owner");

    await page.goto(`/academy/admin/business?academy_id=${academyId}`);

    await expect(page.getByRole("heading", { name: "Admissions and branches" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Capture lead" })).toBeVisible();
    await expect(page.getByLabel("Admissions pipeline").getByText("Madina Lead")).toBeVisible();
    await expect(page.getByRole("button", { name: "Branches & rooms" })).toBeVisible();
    await page.getByRole("button", { name: "Branches & rooms" }).click();
    await expect(page.getByRole("heading", { name: "Add branch" })).toBeVisible();
    await expect(page.getByText("Room 101 · 14")).toBeVisible();
  });

  for (const roleCase of [
    { persona: "owner" as const, lane: "admin", canReachBranches: true, canManage: true },
    { persona: "admin" as const, lane: "admin", canReachBranches: true, canManage: true },
    { persona: "center_admin" as const, lane: "center", canReachBranches: true, canManage: true },
    { persona: "branch_manager" as const, lane: "office", canReachBranches: true, canManage: false },
    { persona: "manager" as const, lane: "office", canReachBranches: true, canManage: false },
    { persona: "counselor" as const, lane: "office", canReachBranches: true, canManage: false },
    { persona: "receptionist" as const, lane: "office", canReachBranches: true, canManage: false },
    { persona: "salesperson" as const, lane: "office", canReachBranches: true, canManage: false },
    { persona: "cashier" as const, lane: "office", canReachBranches: false, canManage: false },
    { persona: "teacher" as const, lane: "teacher", canReachBranches: false, canManage: false },
    { persona: "assistant" as const, lane: "teacher", canReachBranches: false, canManage: false },
  ]) {
    test(`${roleCase.persona} branch controls match production manageBranches`, async ({ page }) => {
      await seedSessionCookie(page, `${roleCase.persona}-user`);
      await mockAcademyEdge(page, roleCase.persona);
      await page.goto(`/academy/${roleCase.lane}/business?academy_id=${academyId}`);
      const branchView = page.getByRole("button", { name: "Branches & rooms" });
      if (roleCase.canReachBranches) await branchView.click();
      else await expect(branchView).toHaveCount(0);
      if (roleCase.canManage) {
        await expect(page.getByRole("heading", { name: "Add branch" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Add physical room" })).toBeVisible();
      } else {
        await expect(page.getByRole("heading", { name: "Add branch" })).toHaveCount(0);
        await expect(page.getByRole("heading", { name: "Add physical room" })).toHaveCount(0);
      }
    });
  }

  test("admissions critical flows remain usable on a phone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSessionCookie(page, "owner-user");
    await mockAcademyEdge(page, "owner");

    await page.goto(`/academy/admin/business?academy_id=${academyId}`);
    await expect(page.getByRole("heading", { name: "Capture lead" })).toBeVisible();
    await expect(page.getByLabel("Admissions pipeline")).toBeVisible();
    await page.getByLabel("Full name").fill("Mobile Prospect");
    await page.getByLabel("Phone").fill("+998901234567");
    await page.getByLabel("Full name").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Phone")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Telegram")).toBeFocused();
    const admissionForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Capture lead" }) });
    const mobileFormGeometry = await admissionForm.evaluate((form) => {
      const viewportWidth = document.documentElement.clientWidth;
      const controls = Array.from(form.querySelectorAll<HTMLElement>("input, select, textarea, button")).filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      });
      const clipped = controls
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < -1 || rect.right > viewportWidth + 1;
        })
        .map((element) => element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName);
      const overlaps: string[] = [];
      for (let left = 0; left < controls.length; left += 1) {
        const first = controls[left].getBoundingClientRect();
        for (let right = left + 1; right < controls.length; right += 1) {
          const second = controls[right].getBoundingClientRect();
          const overlapWidth = Math.min(first.right, second.right) - Math.max(first.left, second.left);
          const overlapHeight = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
          if (overlapWidth > 1 && overlapHeight > 1) overlaps.push(`${controls[left].tagName}/${controls[right].tagName}`);
        }
      }
      return { clipped, overlaps };
    });
    expect(mobileFormGeometry.clipped, "mobile admissions controls are not clipped").toEqual([]);
    expect(mobileFormGeometry.overlaps, "mobile admissions controls do not overlap").toEqual([]);
    await page.setViewportSize({ width: 640, height: 900 });
    await expect(page.getByLabel("Full name")).toHaveValue("Mobile Prospect");
    await expect(page.getByLabel("Phone")).toHaveValue("+998901234567");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const trials = page.getByRole("button", { name: "Trials" });
    await page.getByRole("button", { name: "Add lead" }).click();
    await expect(page.getByText("Lead captured and added to the admissions pipeline.")).toBeVisible();
    await trials.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Schedule trial" })).toBeVisible();
  });

  for (const width of [1440, 817, 390, 320]) {
    test(`billing checkout keeps normal field and button sizes at ${width}px`, async ({page}, testInfo) => {
      await page.setViewportSize({width, height: 900});
      await seedSessionCookie(page, 'billing-layout-owner');
      await mockAcademyEdge(page, 'owner');
      await page.goto(`/academy/admin/payments?academy_id=${academyId}&lang=uz`);
      const checkout=page.locator('form.workspace-form');
      await expect(checkout.locator('select')).toHaveCount(2);
      await expect(page.getByRole('heading',{name:'Hisob-kitob va to‘lovlar',exact:true})).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({path:testInfo.outputPath(`billing-${width}.png`),fullPage:true});
      const geometry=await checkout.evaluate(form => ({
        height:form.getBoundingClientRect().height,
        fields:Array.from(form.querySelectorAll('select,button[type=submit]')).map(control=>control.getBoundingClientRect().height),
        gap:form.querySelector('label')!.getBoundingClientRect().top-form.querySelector('p')!.getBoundingClientRect().bottom,
      }));
      for(const height of geometry.fields){expect(height).toBeGreaterThanOrEqual(44);expect(height).toBeLessThanOrEqual(56);}
      expect(geometry.height).toBeLessThan(440);
      expect(geometry.gap).toBeLessThanOrEqual(20);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    });
  }

  test('billing summary separates currencies instead of adding dollars to sums', async ({page}) => {
    await seedSessionCookie(page,'billing-currencies-owner');
    const original=commercialCore.payments[0];
    await mockAcademyEdge(page,'owner',{actionOverrides:{payments:{payments:[
      {...original,id:'paid-uzs',amount:500000,currency:'UZS',status:'paid'},
      {...original,id:'paid-usd',amount:50,currency:'USD',status:'paid'},
    ]}}});
    await page.goto(`/academy/admin/payments?academy_id=${academyId}`);
    const amounts=page.locator('.payment-summary-amounts').first();
    await expect(amounts).toContainText('500,000 UZS');
    await expect(amounts).toContainText('50 USD');
    await expect(amounts).not.toContainText('500,050');
    await page.getByRole('textbox',{name:'Search payments'}).fill('paid-usd');
    await expect(amounts).not.toContainText('UZS');
    await expect(amounts).toContainText('50 USD');
  });

  for(const width of [1440,768,390,320]) {
    test(`Academy public landing keeps Schood sign-in and responsive navigation at ${width}px`,async({page},testInfo)=>{
      await page.setViewportSize({width,height:900});
      await page.goto('/');
      await expect(page.getByRole('heading',{name:'Run your learning center from one connected workspace'})).toBeVisible();
      const entry=page.getByRole('link',{name:'Open Academy',exact:true}).first();
      await expect(entry).toBeVisible();
      expect(new URL((await entry.getAttribute('href'))!,page.url()).pathname).toBe('/auth');
      await expect(page.locator('input[type=password]')).toHaveCount(0);
      const brand=page.getByRole('link',{name:'Schood Academy',exact:true});
      await expect(brand).toBeVisible();
      if(width<=620){
        const menu=page.getByRole('button',{name:'Menu',exact:true});
        await menu.click();
        await expect(page.getByRole('link',{name:'Workspaces',exact:true})).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(menu).toBeFocused();
      }
      await page.evaluate(()=>document.fonts.ready);
      await page.locator('.academy-public-brand img').evaluate((image:HTMLImageElement)=>image.decode());
      await page.screenshot({path:testInfo.outputPath(`academy-public-${width}.png`),fullPage:true});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    });
  }

  test("mobile Contacts and Payments keep wide tables and contextual lists reachable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSessionCookie(page, "owner-mobile-table-user");
    await mockAcademyEdge(page, "owner");

    const assertScrollableTable = async (label: string) => {
      const wrapper = page.locator(".table-wrap").first();
      await expect(wrapper, `${label} wrapper`).toBeVisible();
      const geometry = await wrapper.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const before = element.scrollLeft;
        element.scrollLeft = element.scrollWidth;
        return {
          left: rect.left,
          right: rect.right,
          viewport: document.documentElement.clientWidth,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          before,
          after: element.scrollLeft,
          overflowX: getComputedStyle(element).overflowX,
        };
      });
      expect(geometry.left, `${label} left edge`).toBeGreaterThanOrEqual(-1);
      expect(geometry.right, `${label} right edge`).toBeLessThanOrEqual(geometry.viewport + 1);
      expect(geometry.scrollWidth, `${label} preserves the full table`).toBeGreaterThan(geometry.clientWidth);
      expect(geometry.after, `${label} can reach trailing columns`).toBeGreaterThan(geometry.before);
      expect(["auto", "scroll"], `${label} owns horizontal overflow`).toContain(geometry.overflowX);
    };

    await page.goto(`/academy/admin/contacts?academy_id=${academyId}`);
    await expect(page.getByRole("table").getByText("Ali Karimov")).toBeVisible();
    await assertScrollableTable("Contacts");
    await page.getByRole("group", { name: "Contact details" }).getByRole("button", { name: "Classrooms", exact: true }).click();
    await expect(page.locator(".contact-record-list").getByRole("button", { name: /IELTS Evening A.*student/i })).toBeVisible();

    await page.goto(`/academy/admin/payments?academy_id=${academyId}`);
    await expect(page.getByRole("heading", { name: "Create Click checkout" })).toBeVisible();
    await assertScrollableTable("Payments");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "wide tables do not create page-level overflow").toBeLessThanOrEqual(1);
  });

  test("owner can operate the commercial core without conflating payments and charges", async ({ page }) => {
    await seedSessionCookie(page, "owner-user");
    await mockAcademyEdge(page, "owner");

    await page.goto(`/academy/admin/commercial?academy_id=${academyId}`);
    await expect(page.getByRole("heading", { name: "Commercial core", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Balances and aging" })).toBeVisible();
    await expect(page.getByText("150,000 UZS").first()).toBeVisible();
    await page.getByRole("button", { name: "Plans & agreements" }).click();
    await expect(page.getByRole("heading", { name: "Create pricing plan" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Create subscription" })).toBeVisible();
    await page.getByRole("button", { name: "Charges & allocation" }).click();
    await expect(page.getByRole("heading", { name: "Issue charge" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Apply payment to charge" })).toBeVisible();
  });

  test("owner can operate cashier, contribution economics, and payroll snapshots", async ({ page }) => {
    await seedSessionCookie(page, "owner-user");
    await mockAcademyEdge(page, "owner");

    await page.goto(`/academy/admin/operations?academy_id=${academyId}`);
    await expect(page.getByRole("heading", { name: "Cashier, economics, and payroll" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Open cashier shift" })).toBeVisible();
    await page.getByRole("button", { name: "Unit economics" }).click();
    await expect(page.getByRole("heading", { name: "Branch contribution — not profit" })).toBeVisible();
    await page.getByRole("button", { name: "Payroll", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Compensation rule" })).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Payroll periods and immutable snapshots",
      }),
    ).toBeVisible();
  });

  test("owner can operate actual sessions, attendance exceptions, and capacity", async ({ page }) => {
    await seedSessionCookie(page, "owner-user");
    await mockAcademyEdge(page, "owner");

    await page.goto(`/academy/admin/academic?academy_id=${academyId}`);
    await expect(
      page.getByRole("heading", {
        name: "Sessions, attendance, capacity, and quality",
      }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Create actual lesson session" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Session register" })).toBeVisible();
    await expect(page.getByRole("table").getByRole("cell", { name: "Room 101" })).toBeVisible();
    await page.getByRole("button", { name: "Attendance & exceptions" }).click();
    await expect(page.getByRole("heading", { name: "Record session attendance" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Approve attendance exception" })).toBeVisible();
    await page.getByRole("button", { name: "Capacity", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Available, occupied, unused, and peak periods",
      }),
    ).toBeVisible();
    await expect(page.getByText("16.67%")).toBeVisible();
  });

  test("classroom work loads without waiting for Academy reports", async ({ page }) => {
    await seedSessionCookie(page, "teacher-user");
    const actionLog: string[] = [];
    await mockAcademyEdge(page, "teacher", { actionLog, delayActions: { education_os: 8_000 } });
    await page.goto(`/academy/teacher/os?academy_id=${academyId}`);
    await page.getByRole("button", { name: "Learning", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Assignment", exact: true })).toHaveValue(assignment.id, { timeout: 4_000 });
    await expect(page.getByRole("button", { name: "Save grade", exact: true })).toBeEnabled({ timeout: 4_000 });
    expect(actionLog.filter((action) => action === "education_os")).toHaveLength(1);
    expect(actionLog.filter((action) => action === "assignments")).toHaveLength(1);
  });

  test("classroom switching keeps current work and resets grade drafts", async ({ page }) => {
    await seedSessionCookie(page, "teacher-user");
    const secondId = "classroom-second";
    const thirdId = "classroom-third";
    const actionLog: string[] = [];
    let releaseSecond!: () => void;
    const secondBlocked = new Promise<void>((resolve) => { releaseSecond = resolve; });
    let secondRequested = false;
    await mockAcademyEdge(page, "teacher", {
      actionLog,
      actionOverrides: {
        classrooms: { classrooms: [classroom, { ...classroom, id: secondId, name: "Second class" }, { ...classroom, id: thirdId, name: "Third class" }] },
        "classroom-memberships": { classroom_memberships: [membership, { ...membership, id: "second-member", classroom_id: secondId }, { ...membership, id: "third-member", classroom_id: thirdId }] },
      },
      respond: async (body) => {
        if (body.action !== "assignments") return undefined;
        const selected = String(body.classroom_id);
        if (selected === secondId) {
          secondRequested = true;
          await secondBlocked;
        }
        return { assignments: [{ ...assignment, id: selected === classroomId ? assignment.id : `assignment-${selected}`, classroom_id: selected, title: selected === classroomId ? assignment.title : selected }] };
      },
    });
    await page.goto(`/academy/teacher/os?academy_id=${academyId}`);
    await page.getByRole("button", { name: "Learning", exact: true }).click();
    const gradeForm = page;
    const classroomSelect = page.locator(".education-os .academy-select").first();
    await expect(gradeForm.getByRole("combobox", { name: "Assignment", exact: true })).toHaveValue(assignment.id);
    await gradeForm.getByRole("spinbutton", { name: "Score", exact: true }).fill("72");
    await classroomSelect.selectOption(secondId);
    await expect.poll(() => secondRequested).toBe(true);
    await expect(gradeForm.getByRole("button", { name: "Save grade" })).toBeDisabled();
    await classroomSelect.selectOption(thirdId);
    await expect(gradeForm.getByRole("combobox", { name: "Assignment", exact: true })).toHaveValue(`assignment-${thirdId}`);
    await expect(gradeForm.getByRole("spinbutton", { name: "Score", exact: true })).toHaveValue("");
    const secondResponse = page.waitForResponse((response) => response.request().postDataJSON()?.action === "assignments" && response.request().postDataJSON()?.classroom_id === secondId);
    releaseSecond();
    await secondResponse;
    await expect(gradeForm.getByRole("combobox", { name: "Assignment", exact: true })).toHaveValue(`assignment-${thirdId}`);
    await expect(gradeForm.getByRole("combobox", { name: "Assignment", exact: true }).getByRole("option", { name: secondId })).toHaveCount(0);
    expect(actionLog.filter((action) => action === "education_os")).toHaveLength(1);
  });

  test("classroom load failures remain retryable and attendance drafts stay scoped", async ({ page }) => {
    await seedSessionCookie(page, "teacher-user");
    const secondId = "classroom-second";
    const actionLog: string[] = [];
    const saved: Record<string, unknown>[] = [];
    const failures = ["assignments"];
    await mockAcademyEdge(page, "teacher", {
      actionLog,
      failActions: failures,
      actionOverrides: {
        classrooms: { classrooms: [classroom, { ...classroom, id: secondId, name: "Second class" }] },
        "classroom-memberships": { classroom_memberships: [membership, { ...membership, id: "second-member", classroom_id: secondId }] },
      },
      respond: async (body) => {
        if (body.action === "mark_attendance") {
          saved.push(body);
          return { attendance: [], count: 1 };
        }
        return undefined;
      },
    });
    await page.goto(`/academy/teacher/os?academy_id=${academyId}`);
    await expect(page.getByText(/POST \/academy failed \(503\).*Mock assignments failure/)).toBeVisible();
    failures.splice(0);
    await page.getByRole("button", { name: "Refresh", exact: true }).last().click();
    await page.getByRole("button", { name: "Attendance", exact: true }).click();
    const status = page.getByLabel("Attendance status for Ali Karimov");
    await expect(status).toHaveValue("present");
    await status.selectOption("late");
    await page.getByRole("combobox", { name: "Classroom", exact: true }).selectOption(secondId);
    await expect(status).toHaveValue("present");
    await expect(page.getByRole("button", { name: "Save attendance", exact: true })).toBeEnabled();
    const globalReadsBeforeSave = actionLog.filter((action) => action === "education_os").length;
    await page.getByRole("button", { name: "Save attendance", exact: true }).click();
    await expect.poll(() => saved.length).toBe(1);
    expect(saved[0].classroom_id).toBe(secondId);
    expect(saved[0].records).toEqual([{ contact_id: studentContactId, status: "present", notes: null }]);
    await expect.poll(() => actionLog.filter((action) => action === "education_os").length).toBe(globalReadsBeforeSave + 1);
  });

  test("rubric failures block grading while attendance remains usable", async ({ page }) => {
    await seedSessionCookie(page, "teacher-user");
    const failures = ["rubrics"];
    await mockAcademyEdge(page, "teacher", { failActions: failures });
    await page.goto(`/academy/teacher/os?academy_id=${academyId}`);
    await expect(page.getByText(/POST \/academy failed \(503\).*Mock rubrics failure/)).toBeVisible();
    await page.getByRole("button", { name: "Learning", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Assignment", exact: true })).toHaveValue(assignment.id);
    await expect(page.getByRole("button", { name: "Save grade", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Attendance", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save attendance", exact: true })).toBeEnabled();
    failures.splice(0);
    await page.getByRole("button", { name: "Refresh", exact: true }).last().click();
    await page.getByRole("button", { name: "Learning", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save grade", exact: true })).toBeEnabled();
  });

  test("teacher can author structured curriculum and native assessments", async ({ page }) => {
    await seedSessionCookie(page, "teacher-user");
    await mockAcademyEdge(page, "teacher");

    await page.goto(`/academy/teacher/os?academy_id=${academyId}`);
    await expect(page.getByRole("heading", { name: "Curriculum & grading" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh", exact: true }).last()).toBeEnabled();
    await page.getByRole("button", { name: "Learning" }).click();

    await expect(page.getByRole("heading", { name: "Curriculum and assessments" })).toBeVisible();
    await expect(page.getByLabel("Course workspace")).toHaveValue(course.id);
    await expect(page.getByText("Structured IELTS course")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Native quizzes" })).toBeVisible();
    await expect(page.getByLabel("Assignment course")).toBeVisible();
    await expect(page.getByLabel("Grade category").getByRole("option", { name: /Coursework/ })).toBeAttached();
    await expect(page.getByLabel("Assignment rubric").getByRole("option", { name: "Writing quality" })).toBeAttached();
    await expect(page.getByText("Writing quality rubric")).toBeVisible();
    await expect(page.getByText("Consecutive work")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next student" })).toBeDisabled();
    await expect(page.getByText("Evidence · max 6")).toBeVisible();
  });

  test("teacher can bulk-mark attendance and edit roster exceptions inline", async ({ page }) => {
    await seedSessionCookie(page, "teacher-user");
    await mockAcademyEdge(page, "teacher");

    await page.goto(`/academy/teacher/os?academy_id=${academyId}`);
    await page.getByRole("button", { name: "Attendance", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Take attendance" })).toBeVisible();
    await page.getByRole("button", { name: "late", exact: true }).click();
    await expect(page.getByLabel("Attendance status for Ali Karimov")).toHaveValue("late");
    await expect(page.getByRole("button", { name: "Save attendance" })).toBeEnabled();
  });

  test("owner can find contacts and review contextual student operations without route hopping", async ({ page }) => {
    await seedSessionCookie(page, "owner-user");
    await mockAcademyEdge(page, "owner");

    await page.goto(`/academy/admin/contacts?academy_id=${academyId}`);
    const search = page.getByPlaceholder("Search name, email, phone, or level");
    await expect(search).toBeVisible();
    await search.fill("Ali");
    await expect(page.getByRole("table").getByText("Ali Karimov")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ali Karimov" })).toBeVisible();
    await expect(page.getByText("86%")).toBeVisible();
    const contactDetails = page.getByRole("group", { name: "Contact details" });
    const overview = contactDetails.getByRole("button", {
      name: "Overview",
      exact: true,
    });
    const classroomContext = contactDetails.getByRole("button", {
      name: "Classrooms",
      exact: true,
    });
    await expect(overview).toHaveAttribute("aria-pressed", "true");
    await overview.focus();
    await page.keyboard.press("Tab");
    await expect(classroomContext).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(classroomContext).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: /IELTS Evening A.*student/i })).toBeVisible();
    await contactDetails.getByRole("button", { name: "Attention", exact: true }).click();
    await expect(page.getByText("Grade Writing Task 2")).toBeVisible();
    await contactDetails.getByRole("button", { name: "Payments", exact: true }).click();
    await expect(page.getByText("500,000 UZS")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(search).toHaveValue("Ali");
    await expect(contactDetails.getByRole("button", { name: "Payments", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { name: "Ali Karimov" })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await search.fill("No matching student");
    await expect(page.getByText("No contacts match these filters")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ali Karimov" })).toHaveCount(0);
    await expect(page.locator(".contact-context").getByText("Select a contact")).toBeVisible();
    await expect(page.locator(".contact-context").getByRole("button", { name: "Finance" })).toHaveCount(0);
  });

  test("contacts keep the core directory usable, distinguish enrichment errors, and recover each context", async ({ page }) => {
    await seedSessionCookie(page, "owner-user");
    await mockAcademyEdge(page, "owner", {
      delayActions: {
        classrooms: 2000,
        "classroom-memberships": 2000,
        alerts: 2000,
        payments: 2000,
        education_os: 2000,
      },
      failActionAttempts: {
        classrooms: 1,
        "classroom-memberships": 1,
        alerts: 1,
        payments: 1,
        education_os: 1,
      },
    });

    await page.goto(`/academy/admin/contacts?academy_id=${academyId}`);
    await expect(page.getByRole("table").getByText("Ali Karimov")).toBeVisible();
    await expect(page.locator(".contact-context")).toHaveAttribute("aria-busy", "true");
    await expect(page.getByRole("heading", { name: "Ali Karimov" })).toBeVisible();
    await expect(page.getByText("Learning and lifecycle context could not be loaded.")).toBeVisible();
    await expect(page.getByText("Classroom membership could not be loaded.")).toBeVisible();
    await expect(page.getByText("No classroom membership")).toHaveCount(0);

    const contactDetails = page.getByRole("group", { name: "Contact details" });
    await contactDetails.getByRole("button", { name: "Classrooms", exact: true }).click();
    await expect(page.getByText("Classroom details could not be loaded.")).toBeVisible();
    await page.getByRole("button", { name: "Retry classroom details" }).click();
    await page.getByRole("button", { name: "Retry classroom membership" }).click();
    await expect(page.getByRole("button", { name: /IELTS Evening A.*student/i })).toBeVisible();

    await contactDetails.getByRole("button", { name: "Attention", exact: true }).click();
    await expect(page.getByText("Action signals could not be loaded.")).toBeVisible();
    await expect(page.getByText("Alerts could not be loaded.")).toBeVisible();
    await expect(page.getByText("No open attention items")).toHaveCount(0);
    await page.getByRole("button", { name: "Retry action signals" }).click();
    await page.getByRole("button", { name: "Retry alerts" }).click();
    await expect(page.getByText("Grade Writing Task 2")).toBeVisible();

    await contactDetails.getByRole("button", { name: "Payments", exact: true }).click();
    await expect(page.getByText("Payment information could not be loaded.")).toBeVisible();
    await expect(page.getByText("No payments recorded")).toHaveCount(0);
    await page.getByRole("button", { name: "Retry payment information" }).click();
    await expect(page.getByText("500,000 UZS")).toBeVisible();
    await expect(page.locator(".contact-context")).toHaveAttribute("aria-busy", "false");
  });

  test("contacts show genuine empty states only after successful enrichment", async ({ page }) => {
    await seedSessionCookie(page, "owner-user");
    await mockAcademyEdge(page, "owner", {
      actionOverrides: {
        classrooms: { classrooms: [] },
        "classroom-memberships": { classroom_memberships: [] },
        alerts: { alerts: [] },
        payments: { payments: [] },
        education_os: {
          ...educationOS,
          access: accessForPersona("owner"),
          action_queue: [],
        },
      },
    });

    await page.goto(`/academy/admin/contacts?academy_id=${academyId}`);
    const contactDetails = page.getByRole("group", { name: "Contact details" });
    await contactDetails.getByRole("button", { name: "Classrooms", exact: true }).click();
    await expect(page.getByText("No classroom membership")).toBeVisible();
    await contactDetails.getByRole("button", { name: "Attention", exact: true }).click();
    await expect(page.getByText("No open attention items")).toBeVisible();
    await contactDetails.getByRole("button", { name: "Payments", exact: true }).click();
    await expect(page.getByText("No payments recorded")).toBeVisible();
  });

  test("lazy route failure offers a shared reload recovery path", async ({ page }) => {
    await seedSessionCookie(page, "owner-user");
    await mockAcademyEdge(page, "owner");
    let failFirstModuleRequest = true;
    await page.route("**/src/components/office/ContactsView.tsx*", async (route) => {
      if (failFirstModuleRequest) {
        failFirstModuleRequest = false;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.goto(`/academy/admin/contacts?academy_id=${academyId}`);
    await expect(
      page.getByRole("heading", {
        name: "This workspace section could not load",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Reload workspace" }).click();
    await expect(page.getByRole("heading", { name: "Students and contacts" })).toBeVisible();
  });

  test("mobile workspace keeps tasks visible and sections searchable with keyboard recovery", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSessionCookie(page, "office-user");
    await mockAcademyEdge(page, "manager", {actionOverrides: {education_os: {
      ...educationOS,
      action_queue: [{...educationOS.action_queue[0], source_type: 'trial_follow_up', title: 'Confirm trial lesson'}],
    }}});

    await page.goto(`/academy/office?academy_id=${academyId}`);
    await expect(page.locator(".ts-topbar").getByRole("button", { name: "Open updates center" })).toBeVisible();
    await expect(page.locator(".updates-fab")).toHaveCount(0);
    const nextSections = page.getByRole("button", { name: "Sections", exact: true });
    await expect(nextSections).toBeVisible();
    await expect(nextSections).toBeEnabled();
    const nextSectionsBox = await nextSections.boundingBox();
    expect(nextSectionsBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(nextSectionsBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    const navigation = page.getByRole("navigation", {
      name: "Academy LMS navigation",
    });
    await expect(navigation).toBeHidden();
    const openTask = page.locator('.attention-item button').first();
    await expect(openTask).toBeInViewport();
    await nextSections.click();
    await expect(navigation).toBeVisible();
    const search = page.getByRole('searchbox', { name: 'Find a section' });
    await search.fill('Contacts');
    await expect(navigation.getByRole('button', { name: 'Contacts', exact: true })).toBeVisible();
    await search.fill('this section does not exist');
    await expect(navigation.getByText('No matching sections. Try another name.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(nextSections).toBeFocused();
    await expect(navigation).toBeHidden();
    await nextSections.click();
    await expect(search).toHaveValue('');
    await search.fill('Contacts');
    await navigation.getByRole('button', { name: 'Contacts', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Students and contacts' })).toBeVisible();
    await expect(navigation).toBeHidden();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("student route opens a focused learning day and linked classrooms", async ({ page }) => {
    await seedSessionCookie(page, "student-user");
    await mockAcademyEdge(page, "student");

    await page.goto(`/academy/student?academy_id=${academyId}`);

    await expect(page.getByText("Student Workspace")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /^Today$/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /What will you continue today/i })).toBeVisible();
    await expect(page.getByLabel("Learning status").getByText("Academy updates", { exact: true })).toBeVisible();
    await expect(page.getByText("New updates", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Continue learning.*IELTS Evening A/i })).toBeVisible();
    await page.getByRole("button", { name: /^My classrooms$/i }).click();
    await expect(page).toHaveURL(/\/academy\/student\/classrooms/);
    await expect(page.getByRole("heading", { level: 1, name: /^My classrooms$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open student view" })).toBeVisible();
  });

  test("student can open an assigned course and its assessment", async ({ page }) => {
    await seedSessionCookie(page, "student-user");
    await mockAcademyEdge(page, "student");

    await page.goto(`/academy/student/classrooms/${classroomId}?academy_id=${academyId}`);
    await expect(page.getByRole("heading", { name: "IELTS Evening A" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh" })).toBeEnabled();
    await page.getByRole("button", { name: "Courses" }).click();

    await expect(page.getByRole("heading", { name: "IELTS Foundation" })).toBeVisible();
    await expect(page.getByText("Finding evidence")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start quiz" })).toBeVisible();
  });

  test("student can inspect a real commercial account without reconciliation data", async ({ page }) => {
    await seedSessionCookie(page, "student-user");
    await mockAcademyEdge(page, "student");

    await page.goto(`/academy/student/classrooms/${classroomId}?academy_id=${academyId}`);
    await page.getByRole("button", { name: "Billing", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Billing statement" })).toBeVisible();
    await expect(page.getByText("Outstanding balance", { exact: true })).toBeVisible();
    await expect(page.getByText("INV-2026-07")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Payments and credits" })).toBeVisible();
    await expect(page.getByText("provider matched")).toHaveCount(0);
  });

  test("Classroom 2.0 keeps every learner capability reachable and uses a compact mobile disclosure", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSessionCookie(page, "student-classroom-v2-user");
    await mockAcademyEdge(page, "student", { classroomV2: true });

    await page.goto(`/academy/student/classrooms/${classroomId}?academy_id=${academyId}`);
    const menu = page.locator(".classroom-section-menu");
    await expect(menu).toBeVisible();
    const summary = menu.locator("summary");
    await expect(summary).toHaveText(/Overview/);
    const summaryBox = await summary.boundingBox();
    expect(summaryBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await summary.click();
    for (const section of ["Overview", "Course", "Live", "Assignments", "Progress", "People & discussion", "Account"]) {
      await expect(menu.getByRole("button", { name: section, exact: true })).toBeVisible();
    }
    await menu.getByRole("button", { name: "Course", exact: true }).click();
    await expect(page.getByRole("heading", { name: "IELTS Foundation" })).toBeVisible();
    await page.locator(".classroom-section-menu summary").click();
    await menu.getByRole("button", { name: "Live", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Live speaking clinic" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Room opens 15 minutes before class" })).toBeDisabled();
    await expect(page.locator('a[href*="meet.google.com"]')).toHaveCount(0);
    await page.locator(".classroom-section-menu summary").click();
    await menu.getByRole("button", { name: "Account", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Billing statement" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("owner can manage explicit guardian consent and delivery evidence", async ({ page }) => {
    await seedSessionCookie(page, "owner-user");
    await mockAcademyEdge(page, "owner");

    await page.goto(`/academy/admin/relationships?academy_id=${academyId}`);
    await expect(
      page.getByRole("heading", {
        name: "Guardians, consent, and parent communication",
      }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Add authorized contact" })).toBeVisible();
    await expect(page.getByText(/Malika Karimova.*mother of Ali Karimov/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Issue secure link/i })).toBeVisible();
    await page.getByRole("button", { name: "Delivery evidence" }).click();
    await expect(page.getByRole("heading", { name: "Retry-safe notification outbox" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Immutable delivery attempts" })).toBeVisible();
  });

  test("parent switching scopes requests, drafts, and guardian preferences by stable child identity", async ({ page }) => {
    await seedSessionCookie(page, "guardian-user");
    const otherAcademy = "guardian-other-academy";
    const otherGuardian = "guardian-other";
    const otherChild = { ...guardianDashboard.children[0], academy_id: otherAcademy, relationship_id: "relationship-other", student: { ...guardianDashboard.children[0].student, id: "other-student", name: "Other Child" } };
    let dashboard = { ...guardianDashboard, guardians: [guardianProfile, { ...guardianProfile, id: otherGuardian, academy_id: otherAcademy }], children: [guardianDashboard.children[0], otherChild], preferences: [...guardianDashboard.preferences, { ...guardianDashboard.preferences[0], id: "preference-other", guardian_id: otherGuardian, quiet_hours_start: "19:00" }] };
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let firstRequested = false;
    const saved: Record<string, unknown>[] = [];
    await mockAcademyEdge(page, "guardian", {
      respond: async (body) => {
        if (body.action === "guardian_dashboard") return dashboard;
        if (body.action === "guardian_update_preferences") { saved.push(body); return {}; }
        if (body.action !== "guardian_service_requests") return undefined;
        const selected = String(body.academy_id);
        if (selected === academyId) { firstRequested = true; await firstBlocked; }
        return { requests: [{ id: `request-${selected}`, subject: selected === academyId ? "First academy request" : "Other academy request", status: "submitted", request_type: "support", created_at: "2026-01-01T00:00:00Z" }] };
      },
    });
    await page.goto("/academy/parent");
    await expect(page.getByRole("heading", { name: "Ali Karimov", exact: true })).toBeVisible();
    await expect.poll(() => firstRequested).toBe(true);
    await page.getByRole("button", { name: "Messages", exact: true }).click();
    await page.locator("form").filter({ has: page.getByRole("heading", { name: "Message academy", exact: true }) }).locator("textarea").fill("Private draft for first child");
    await page.getByRole("combobox", { name: "Choose your child", exact: true }).selectOption({ label: "Other Child" });
    await page.getByRole("button", { name: "Messages", exact: true }).click();
    await expect(page.locator("form").filter({ has: page.getByRole("heading", { name: "Message academy", exact: true }) }).locator("textarea")).toHaveValue("");
    await page.getByRole("button", { name: "Ask for help", exact: true }).click();
    await expect(page.getByText("Other academy request", { exact: true })).toBeVisible();
    const firstResponse = page.waitForResponse((response) => response.request().postDataJSON()?.action === "guardian_service_requests" && response.request().postDataJSON()?.academy_id === academyId);
    releaseFirst();
    await firstResponse;
    await expect(page.getByText("First academy request", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Other academy request", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Preferences", exact: true }).click();
    await expect(page.getByLabel("Quiet from", { exact: true })).toHaveValue("19:00");
    await page.getByRole("button", { name: "Save preferences", exact: true }).click();
    await expect.poll(() => saved.length).toBe(1);
    expect(saved[0].guardian_id).toBe(otherGuardian);
    dashboard = { ...dashboard, children: [otherChild, guardianDashboard.children[0]] };
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Other Child", exact: true })).toBeVisible();
  });

  test("parent message failures retain the draft for a successful retry", async ({ page }) => {
    await seedSessionCookie(page, "guardian-user");
    await mockAcademyEdge(page, "guardian", { failActionAttempts: { guardian_send_message: 1 } });
    await page.goto("/academy/parent");
    await page.getByRole("button", { name: "Messages", exact: true }).click();
    const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Message academy", exact: true }) });
    const draft = form.locator("textarea");
    await draft.fill("Please discuss this private concern with me.");
    await form.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByText(/Mock guardian_send_message failure/)).toBeVisible();
    await expect(draft).toHaveValue("Please discuss this private concern with me.");
    await form.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByText("Message sent to the academy.", { exact: true })).toBeVisible();
    await expect(draft).toHaveValue("");
  });

  test("guardian sees only consented child information in the parent portal", async ({ page }) => {
    await seedSessionCookie(page, "guardian-user");
    await mockAcademyEdge(page, "guardian");

    await page.goto("/academy/parent");
    await expect(page.getByText("Parent Portal", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ali Karimov" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Grades & homework" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Payments" })).toBeVisible();
    await expect(page.getByText('Your academy controls which information is shared with you.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cash & payroll' })).toHaveCount(0);
    await page.getByRole("button", { name: "Attendance" }).click();
    await expect(page.getByRole("table").getByText("present")).toBeVisible();
  });

  test("owner can turn explainable risk into intervention, renewal, and SLA work", async ({ page }) => {
    await seedSessionCookie(page, "owner-user");
    await mockAcademyEdge(page, "owner");

    await page.goto(`/academy/admin/intelligence?academy_id=${academyId}`);
    await expect(
      page.getByRole("heading", {
        name: "Retention, renewal, and owner intelligence",
      }),
    ).toBeVisible();
    await expect(page.getByText("500,000 UZS").first()).toBeVisible();
    await page.getByRole("button", { name: "Retention", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Versioned risk definition" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Risk evidence" })).toBeVisible();
    await expect(page.getByText(/Ali Karimov.*high.*74\/100/i)).toBeVisible();
    await page.getByRole("button", { name: "Action queue" }).click();
    await expect(page.getByRole("heading", { name: "Unified SLA-aware action queue" })).toBeVisible();
    await expect(page.getByText("Retention risk requires intervention")).toBeVisible();
    await page.getByRole("button", { name: "Imports" }).click();
    await expect(page.getByRole("heading", { name: "Governed CSV/XLSX migration" })).toBeVisible();
    await page.getByText("Or paste CSV data").click();
    await page.getByRole("button", { name: "Load pasted CSV" }).click();
    await expect(page.getByRole("heading", { name: "Column mapping" })).toBeVisible();
    await expect(page.getByText("Source preview — first five rows")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Row validation evidence" })).toBeVisible();
  });

  test("owner can inspect the end-to-end business platform and governed controls", async ({ page }) => {
    await seedSessionCookie(page, "owner-user");
    await mockAcademyEdge(page, "owner");
    await page.goto(`/academy/admin/platform?academy_id=${academyId}`);
    await expect(page.getByRole("heading", { name: "Education business platform" })).toBeVisible();
    await expect(page.getByText("Main Branch")).toBeVisible();
    await page.getByRole("button", { name: /Student journey/ }).click();
    await expect(page.getByRole("heading", { name: "Immutable lifecycle trail" })).toBeVisible();
    await page.getByRole("button", { name: /Economics/ }).click();
    await expect(page.getByRole("heading", { name: "Classroom unit economics" })).toBeVisible();
    await page.getByRole("button", { name: /AI assistant/ }).click();
    await expect(page.getByRole("heading", { name: "Human review queue" })).toBeVisible();
  });

  test("generic Academy entry resolves representative roles to their canonical workspace", async ({ browser }) => {
    const routes: Array<{ persona: StaffPersona; expectedPath: RegExp; roleLabel: string }> = [
      { persona: "owner", expectedPath: /\/academy\/admin(?:\?|$)/, roleLabel: "Owner" },
      { persona: "center_admin", expectedPath: /\/academy\/center(?:\?|$)/, roleLabel: "Center admin" },
      { persona: "cashier", expectedPath: /\/academy\/office(?:\?|$)/, roleLabel: "Cashier" },
      { persona: "receptionist", expectedPath: /\/academy\/office(?:\?|$)/, roleLabel: "Receptionist" },
      { persona: "teacher", expectedPath: /\/academy\/teacher(?:\?|$)/, roleLabel: "Teacher" },
    ];

    for (const route of routes) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await seedSessionCookie(page, `${route.persona}-resolver-user`);
      await mockAcademyEdge(page, route.persona, {
        actionOverrides: { "student-dashboard": emptyStudentDashboardFixture },
      });
      await page.goto(`/academy/workspace?academy_id=${academyId}`);
      await expect(page).toHaveURL(route.expectedPath);
      await expect(page.locator(".workspace-identity")).toContainText(route.roleLabel);
      await expect(page.locator(".workspace-nav")).toBeVisible();
      await context.close();
    }
  });

  test("signed-in service landing opens the only staff workspace without waiting for workspace data", async ({ page }) => {
    await seedSessionCookie(page, "owner-service-entry-user");
    await mockAcademyEdge(page, "owner", {
      delayActions: { summary: 8_000 },
      actionOverrides: { "student-dashboard": emptyStudentDashboardFixture },
    });

    await page.goto("/");
    await expect(page).toHaveURL(/\/academy\/admin(?:\?|$)/, { timeout: 3_000 });
    await expect(page.locator(".workspace-identity")).toContainText("Owner", { timeout: 3_000 });
    await expect(page.locator(".ts-loading")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open academy service" })).toHaveCount(0);
  });

  test("first-time cross-role entry shows one compact academy choice instead of role lanes", async ({ page }) => {
    await seedSessionCookie(page, "owner-student-choice-user");
    await mockAcademyEdge(page, "owner");

    await page.goto("/academy/workspace");
    await expect(page).toHaveURL(/\/academies(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Choose a workspace" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Route Smoke Academy" })).toHaveCount(1);
    await expect(page.getByText("Owner", { exact: true })).toBeVisible();
    await expect(page.getByText("Student", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage Route Smoke Academy" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Learn in Route Smoke Academy" })).toBeVisible();
    await expect(page.getByText("No access", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Role-based staff workspaces" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Classroom landings" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create academy" })).toHaveCount(0);
  });

  test("last valid workspace preference restores the student context", async ({ page }) => {
    await seedSessionCookie(page, "owner-student-preference-user");
    await mockAcademyEdge(page, "owner");

    await page.goto("/academies");
    await page.getByRole("button", { name: "Learn in Route Smoke Academy" }).click();
    await expect(page).toHaveURL(/\/academy\/student(?:\?|$)/);

    await page.goto("/academy/workspace");
    await expect(page).toHaveURL(/\/academy\/student(?:\?|$)/);
  });

  test("multiple staff academies use the compact switcher without unavailable role families", async ({ page }) => {
    const atlasAcademy = {
      ...academy("owner"),
      id: "academy-atlas",
      name: "Atlas Academy",
      slug: "atlas",
    };
    await seedSessionCookie(page, "multi-academy-owner-user");
    await mockAcademyEdge(page, "owner", {
      actionOverrides: {
        academies: { academies: [academy("owner"), atlasAcademy] },
        "student-dashboard": emptyStudentDashboardFixture,
      },
    });

    await page.goto("/academy/workspace");
    await expect(page).toHaveURL(/\/academies(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Route Smoke Academy" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Atlas Academy" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage Route Smoke Academy" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage Atlas Academy" })).toBeVisible();
    await expect(page.getByText("No access", { exact: true })).toHaveCount(0);
  });

  test("account without Academy access gets one setup path and no locked catalogue", async ({ page }) => {
    await seedSessionCookie(page, "academy-no-access-user");
    await mockAcademyEdge(page, "owner", {
      meResponse: {
        user: { id: "academy-no-access-user", email: "no-access@example.test", role: "user" },
        current_tenant: null,
        memberships: [],
      },
      actionOverrides: {
        academies: { academies: [] },
        "student-dashboard": emptyStudentDashboardFixture,
      },
    });

    await page.goto("/academy/workspace");
    await expect(page).toHaveURL(/\/academies(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "No Academy access yet" })).toBeVisible();
    await expect(page.getByText("No access", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Set up an academy" }).click();
    await expect(page).toHaveURL(/\/academy\/setup$/);
    await expect(page.getByRole("heading", { name: "Set up a new academy" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Academy name" })).toBeVisible();
  });

  const learnerNextClassroom = { ...classroom, id: 'learner-next-classroom', name: 'Next learner classroom' };
  const learnerQuiz = (id: string) => ({ ...quiz, id: `quiz-${id}`, title: `${id === classroomId ? 'Original' : 'Next'} learner quiz` });
  const learnerAttempt = (id: string) => ({ id: `attempt-${id}`, classroom_id: id, course_id: course.id, quiz_id: learnerQuiz(id).id, contact_id: studentContactId, attempt_number: 1, status: 'in_progress', score: null, max_score: null, percentage: null, passed: null, feedback: null, started_at: '2026-10-11T00:00:00Z', submitted_at: null, graded_at: null });
  const mockLearnerCourses = async (page: Page, respond?: MockEdgeOptions['respond']) => {
    await seedSessionCookie(page, 'student-user');
    await mockAcademyEdge(page, 'student', {
      classroomV2: true,
      actionOverrides: { 'student-dashboard': { ...studentDashboard, classrooms: [classroom, learnerNextClassroom], classroom_memberships: [membership, { ...membership, id: 'next-membership', classroom_id: learnerNextClassroom.id }] } },
      respond: async body => {
        const custom = await respond?.(body);
        if (custom !== undefined) return custom;
        const id = String(body.classroom_id ?? classroomId);
        const selected = id === classroomId ? classroom : learnerNextClassroom;
        if (body.action === 'classroom-chat') return { academy_id: academyId, classroom: selected, viewer: { type: 'student', role: 'student', contact_id: studentContactId, display_name: 'student', can_manage_resources: false }, members: [], messages: [], announcements: [], resources: [], progress: { viewer_completed_resource_ids: [], resource_completed_counts: {}, total_members: 0 } };
        if (body.action === 'student_curriculum') return { academy_id: academyId, classroom_id: id, contact_id: studentContactId, courses: [{ ...course, title: `${selected.name} course` }], modules: [courseModule], lessons: [lesson], progress: [], quizzes: [learnerQuiz(id)], questions: [{ ...quizQuestion, id: `question-${id}`, quiz_id: learnerQuiz(id).id, question_type: 'essay', options: null }], attempts: [], media: [], classroom_courses: [] };
        if (body.action === 'start_quiz') return { quiz: learnerQuiz(id), attempt: learnerAttempt(id), resumed: true };
        if (body.action === 'student_assignments') return { academy_id: academyId, contact_id: studentContactId, assignments: [] };
        return undefined;
      },
    });
  };
  const learnerClassroomPath = (id: string) => `/academy/student/classrooms/${id}?academy_id=${academyId}&section=course`;
  const moveLearnerHistory = async (page: Page, id: string) => {
    await page.evaluate(path => { history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); }, learnerClassroomPath(id));
  };

  test('learner course starts within the first phone viewport and avoids unrelated reads', async ({ page }) => {
    const actions: string[] = [];
    await mockLearnerCourses(page, async body => { actions.push(String(body.action)); return undefined; });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(learnerClassroomPath(classroomId));
    const heading = page.getByRole('heading', { name: `${classroom.name} course`, exact: true });
    await expect(heading).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect((await heading.boundingBox())!.y).toBeLessThan(500);
    expect(actions.filter(action => ['student_assignments', 'student_attendance', 'student_billing'].includes(action))).toEqual([]);
    expect(actions.filter(action => action === 'classroom-chat')).toHaveLength(1);
  });

  test('learner course remains healthy when the unused billing service is unavailable', async ({ page }) => {
    await mockLearnerCourses(page);
    await page.route('**/functions/v1/academy', route => route.request().postDataJSON()?.action === 'student_billing'
      ? route.fulfill({ status: 503, json: { error: 'Billing unavailable' } }) : route.fallback());
    await page.goto(learnerClassroomPath(classroomId));
    await expect(page.getByRole('heading', { name: `${classroom.name} course`, exact: true })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.error-banner')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Start quiz', exact: true })).toBeEnabled();
  });

  test('learner quiz opens a focused phone task and returns to the course with its draft', async ({ page }) => {
    await mockLearnerCourses(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(learnerClassroomPath(classroomId));
    await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
    const heading = page.locator('.quiz-attempt-panel').getByRole('heading', { name: 'Original learner quiz', exact: true });
    await expect(heading).toBeFocused();
    await expect.poll(async () => (await heading.boundingBox())?.y).toBeLessThan(180);
    await page.getByPlaceholder('Write your response', { exact: true }).fill('Retain while returning to course.');
    await page.getByRole('button', { name: 'Back to course', exact: true }).click();
    await expect(page.locator('.quiz-attempt-panel')).toHaveCount(0);
    await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
    await expect(page.getByPlaceholder('Write your response', { exact: true })).toHaveValue('Retain while returning to course.');
  });

  test('learner sections load required data once and reuse successful classroom reads', async ({ page }) => {
    const actions: string[] = [];
    await mockLearnerCourses(page, async body => { actions.push(String(body.action)); return undefined; });
    await page.goto(learnerClassroomPath(classroomId));
    await expect(page.getByRole('heading', { name: `${classroom.name} course`, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Account', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Billing statement', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Progress', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Attendance', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Course', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: `${classroom.name} course`, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Account', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Billing statement', exact: true })).toBeVisible();
    await page.waitForLoadState('networkidle');
    for (const action of ['classroom-chat', 'student_assignments', 'student_attendance', 'student_billing']) expect(actions.filter(value => value === action)).toHaveLength(1);
  });

  test('learner overview does not report caught up before classroom work has loaded', async ({ page }) => {
    let release!: () => void;
    let requested = false;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    await mockLearnerCourses(page, async body => {
      if (body.action !== 'student_assignments') return undefined;
      requested = true; await blocked;
      return { academy_id: academyId, contact_id: studentContactId, assignments: [{ ...assignment, submission: null }] };
    });
    try {
      await page.goto(learnerClassroomPath(classroomId).replace('section=course', 'section=overview'));
      await expect.poll(() => requested).toBe(true);
      await expect(page.getByText('You are caught up', { exact: true })).toHaveCount(0);
      release();
      await expect(page.getByRole('heading', { name: 'Next best actions', exact: true })).toBeVisible();
      await expect(page.locator('.student-focus-card').filter({ hasText: assignment.title })).toBeVisible();
    } finally { release(); }
  });

  test('learner late account failure stays out of Course and can be retried in Account', async ({ page }) => {
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    let failed = true;
    let requested = false;
    await mockLearnerCourses(page);
    await page.route('**/functions/v1/academy', async route => {
      if (route.request().postDataJSON()?.action !== 'student_billing' || !failed) return route.fallback();
      requested = true; await blocked;
      return route.fulfill({ status: 503, json: { error: 'Account temporarily unavailable' } });
    });
    try {
      await page.goto(learnerClassroomPath(classroomId));
      await expect(page.getByRole('heading', { name: `${classroom.name} course`, exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Account', exact: true }).last().click();
      await expect.poll(() => requested).toBe(true);
      await page.getByRole('button', { name: 'Course', exact: true }).last().click();
      const response = page.waitForResponse(response => response.request().postDataJSON()?.action === 'student_billing');
      release(); await response;
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.error-banner')).toHaveCount(0);
      await page.getByRole('button', { name: 'Account', exact: true }).last().click();
      await expect(page.getByRole('alert')).toContainText('Account temporarily unavailable');
      failed = false;
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Billing statement', exact: true })).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
    } finally { release(); }
  });

  test('learner parent Refresh invalidates successful account reads', async ({ page }) => {
    let reads = 0;
    await mockLearnerCourses(page, async body => {
      if (body.action !== 'student_billing') return undefined;
      reads += 1;
      return { items: [], accounts: [] };
    });
    await page.goto(learnerClassroomPath(classroomId).replace('section=course', 'section=account'));
    await expect(page.getByRole('heading', { name: 'Billing statement', exact: true })).toBeVisible();
    expect(reads).toBe(1);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect.poll(() => reads).toBe(2);
    await expect(page.getByRole('heading', { name: 'Billing statement', exact: true })).toBeVisible();
  });

  for (const width of [320, 768, 1024, 1440]) {
    test(`learner course and quiz remain visible and keyboard-operable at ${width}px`, async ({ page }, testInfo) => {
      await mockLearnerCourses(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(learnerClassroomPath(classroomId));
      await expect(page.getByRole('heading', { name: `${classroom.name} course`, exact: true })).toBeInViewport();
      await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Original learner quiz', exact: true });
      await expect(dialog.getByRole('heading', { name: 'Original learner quiz', exact: true })).toBeFocused();
      const bounds = (await dialog.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(8);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 8);
      expect(bounds.y).toBeGreaterThanOrEqual(8);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(892);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.keyboard.press('Tab');
      await expect(dialog.getByRole('button', { name: 'Back to course', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(dialog.getByRole('textbox')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(dialog.getByRole('button', { name: 'Submit quiz', exact: true })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(dialog.getByRole('textbox')).toBeFocused();
      await page.getByPlaceholder('Write your response', { exact: true }).fill('A visible, accessible quiz answer.');
      await page.screenshot({ path: testInfo.outputPath(`learner-experience-${width}-quiz.png`) });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Start quiz', exact: true })).toBeFocused();
    });
  }

  test('learner quiz escape restores keyboard access without losing its draft', async ({ page }) => {
    await mockLearnerCourses(page);
    await page.goto(learnerClassroomPath(classroomId));
    const start = page.getByRole('button', { name: 'Start quiz', exact: true });
    await start.click();
    await page.getByPlaceholder('Write your response', { exact: true }).fill('Recover after Escape.');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(start).toBeFocused();
    await start.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Original learner quiz', exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Write your response', { exact: true })).toHaveValue('Recover after Escape.');
  });

  test('learner quiz storage failure permits returning to Course and keeps the current answer in memory', async ({ page }) => {
    await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key.startsWith('schood.academy.quiz-draft.v1:')) throw new DOMException('Storage unavailable', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await mockLearnerCourses(page);
    await page.goto(learnerClassroomPath(classroomId));
    await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
    await page.getByPlaceholder('Write your response', { exact: true }).fill('Keep in memory while storage fails.');
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: 'Back to course', exact: true }).click();
    await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
    await expect(page.getByPlaceholder('Write your response', { exact: true })).toHaveValue('Keep in memory while storage fails.');
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  });

  test('learner classroom history discards a delayed previous curriculum read', async ({ page }) => {
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    let requested = false;
    await mockLearnerCourses(page, async body => {
      if (body.action !== 'student_curriculum' || body.classroom_id !== classroomId) return undefined;
      requested = true; await blocked;
      return { academy_id: academyId, classroom_id: classroomId, contact_id: studentContactId, courses: [{ ...course, title: 'Obsolete learner course' }], modules: [], lessons: [], progress: [], quizzes: [], questions: [], attempts: [], media: [], classroom_courses: [] };
    });
    try {
      await page.goto(learnerClassroomPath(classroomId));
      await expect.poll(() => requested).toBe(true);
      await moveLearnerHistory(page, learnerNextClassroom.id);
      await expect(page.getByRole('heading', { name: `${learnerNextClassroom.name} course`, exact: true })).toBeVisible();
      const late = page.waitForResponse(response => response.request().postDataJSON()?.action === 'student_curriculum' && response.request().postDataJSON()?.classroom_id === classroomId);
      release(); await late;
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: `${learnerNextClassroom.name} course`, exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Obsolete learner course', exact: true })).toHaveCount(0);
    } finally { release(); }
  });

  test('learner classroom history ignores an obsolete quiz start', async ({ page }) => {
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    let requested = false;
    await mockLearnerCourses(page, async body => {
      if (body.action !== 'start_quiz' || body.classroom_id !== classroomId) return undefined;
      requested = true; await blocked;
      return { quiz: learnerQuiz(classroomId), attempt: learnerAttempt(classroomId), resumed: true };
    });
    try {
      await page.goto(learnerClassroomPath(classroomId));
      await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
      await expect.poll(() => requested).toBe(true);
      await moveLearnerHistory(page, learnerNextClassroom.id);
      await expect(page.getByRole('heading', { name: `${learnerNextClassroom.name} course`, exact: true })).toBeVisible();
      const late = page.waitForResponse(response => response.request().postDataJSON()?.action === 'start_quiz');
      release(); await late; await page.waitForLoadState('networkidle');
      await expect(page.locator('.quiz-attempt-panel')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Start quiz', exact: true })).toBeEnabled();
    } finally { release(); }
  });

  test('learner quiz answers survive reload and explicit attempt resume', async ({ page }) => {
    await mockLearnerCourses(page);
    await page.goto(learnerClassroomPath(classroomId));
    await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
    await page.getByPlaceholder('Write your response', { exact: true }).fill('Keep this learner answer across reload.');
    await page.reload();
    await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
    await expect(page.getByPlaceholder('Write your response', { exact: true })).toHaveValue('Keep this learner answer across reload.');
  });

  test('learner quiz freezes one submission and removes only its confirmed draft', async ({ page }) => {
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const submissions: Record<string, unknown>[] = [];
    await mockLearnerCourses(page, async body => {
      if (body.action !== 'submit_quiz') return undefined;
      submissions.push(body); await blocked;
      return { attempt: { ...learnerAttempt(classroomId), status: 'submitted' } };
    });
    try {
      await page.goto(learnerClassroomPath(classroomId));
      await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
      const answer = page.getByPlaceholder('Write your response', { exact: true });
      await answer.fill('One submitted answer.');
      await page.getByRole('button', { name: 'Submit quiz', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
      await expect.poll(() => submissions.length).toBe(1);
      await expect(answer).toBeDisabled();
      expect(submissions[0].answers).toEqual({ [`question-${classroomId}`]: 'One submitted answer.' });
      expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('schood.academy.quiz-draft.v1:')).length)).toBe(1);
      release();
      await expect(page.locator('.quiz-attempt-panel')).toHaveCount(0);
      expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('schood.academy.quiz-draft.v1:')).length)).toBe(0);
    } finally { release(); }
  });

  test('learner quiz retains answers after a failed submission', async ({ page }) => {
    await mockLearnerCourses(page);
    await page.route('**/functions/v1/academy', route => route.request().postDataJSON()?.action === 'submit_quiz'
      ? route.fulfill({ status: 503, json: { error: 'Submission unavailable' } }) : route.fallback());
    await page.goto(learnerClassroomPath(classroomId));
    await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
    await page.getByPlaceholder('Write your response', { exact: true }).fill('Keep after failure.');
    await page.getByRole('button', { name: 'Submit quiz', exact: true }).click();
    await expect(page.locator('.student-curriculum .error-banner')).toContainText('Submission unavailable');
    await page.reload();
    await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
    await expect(page.getByPlaceholder('Write your response', { exact: true })).toHaveValue('Keep after failure.');
  });

  test('learner quiz does not recover another attempt or classroom draft', async ({ page }) => {
    let newAttempt = false;
    await mockLearnerCourses(page, async body => body.action === 'start_quiz' && newAttempt
      ? { quiz: learnerQuiz(String(body.classroom_id)), attempt: { ...learnerAttempt(String(body.classroom_id)), id: 'new-attempt' }, resumed: true } : undefined);
    await page.goto(learnerClassroomPath(classroomId));
    await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
    await page.getByPlaceholder('Write your response', { exact: true }).fill('Private first attempt.');
    await moveLearnerHistory(page, learnerNextClassroom.id);
    await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
    await expect(page.getByPlaceholder('Write your response', { exact: true })).toHaveValue('');
    newAttempt = true;
    await page.goto(learnerClassroomPath(classroomId));
    await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
    await expect(page.getByPlaceholder('Write your response', { exact: true })).toHaveValue('');
  });

  test('learner quiz rejects a resume response from another classroom', async ({ page }) => {
    await mockLearnerCourses(page, async body => body.action === 'start_quiz'
      ? { quiz: learnerQuiz(classroomId), attempt: learnerAttempt(learnerNextClassroom.id), resumed: true } : undefined);
    await page.goto(learnerClassroomPath(classroomId));
    await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
    await expect(page.locator('.student-curriculum .error-banner')).toContainText('The quiz attempt does not belong to this classroom.');
    await expect(page.locator('.quiz-attempt-panel')).toHaveCount(0);
  });

  test('learner quiz shows storage failure without losing the open answer', async ({ page }) => {
    await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key.startsWith('schood.academy.quiz-draft.v1:')) throw new DOMException('Storage unavailable', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await mockLearnerCourses(page);
    await page.goto(learnerClassroomPath(classroomId));
    await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
    await page.getByPlaceholder('Write your response', { exact: true }).fill('Still available to submit.');
    await expect(page.getByRole('alert')).toContainText('Your quiz answers cannot be saved in this browser tab.');
    await expect(page.getByPlaceholder('Write your response', { exact: true })).toHaveValue('Still available to submit.');
    await expect(page.getByRole('button', { name: 'Submit quiz', exact: true })).toBeEnabled();
  });

  test('learner sign-out erases tab quiz drafts', async ({ page }) => {
    await mockLearnerCourses(page);
    await page.route('**/auth/v1/logout**', route => route.fulfill({ status: 204, body: '' }));
    await page.goto(learnerClassroomPath(classroomId));
    await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
    await page.getByPlaceholder('Write your response', { exact: true }).fill('Erase on sign-out.');
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('schood.academy.quiz-draft.v1:')).length)).toBe(1);
    await page.getByRole('button', { name: 'Back to course', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('schood.academy.quiz-draft.v1:')).length)).toBe(0);
  });

  test('learner account startup removes foreign drafts and rejects a mismatched draft scope', async ({ page }) => {
    await mockLearnerCourses(page);
    await page.goto(learnerClassroomPath(classroomId));
    await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
    await page.getByPlaceholder('Write your response', { exact: true }).fill('Do not restore a foreign actor.');
    await page.evaluate(() => {
      const key = Object.keys(sessionStorage).find(key => key.startsWith('schood.academy.quiz-draft.v1:'))!;
      const text = JSON.parse(sessionStorage.getItem(key)!);
      text.scope.actorId = 'another-actor';
      sessionStorage.setItem(key, JSON.stringify(text));
      sessionStorage.setItem(key.replace(':student-user:', ':another-actor:'), JSON.stringify(text));
    });
    await page.reload();
    await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
    await expect(page.getByPlaceholder('Write your response', { exact: true })).toHaveValue('');
    expect(await page.evaluate(() => Object.keys(sessionStorage).some(key => key.startsWith('schood.academy.quiz-draft.v1:another-actor:')))).toBe(false);
  });

  test('learner quiz restores false and single or multiple choice answers as displayed', async ({ page }) => {
    await mockLearnerCourses(page, async body => body.action === 'student_curriculum' ? {
      academy_id: academyId, classroom_id: classroomId, contact_id: studentContactId,
      courses: [course], modules: [courseModule], lessons: [lesson], progress: [], quizzes: [learnerQuiz(classroomId)],
      questions: [
        { ...quizQuestion, id: 'single-numeric', quiz_id: learnerQuiz(classroomId).id, question_type: 'single_choice', options: [1, 2] },
        { ...quizQuestion, id: 'multiple-numeric', quiz_id: learnerQuiz(classroomId).id, question_type: 'multiple_choice', options: [1, 2] },
        { ...quizQuestion, id: 'false-question', quiz_id: learnerQuiz(classroomId).id, question_type: 'true_false', options: [] },
      ], attempts: [], media: [], classroom_courses: [],
    } : undefined);
    await page.goto(learnerClassroomPath(classroomId));
    await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
    const panel = page.locator('.quiz-attempt-panel');
    await panel.getByRole('radio', { name: '2', exact: true }).check();
    await panel.getByRole('checkbox', { name: '1', exact: true }).check();
    await panel.getByRole('checkbox', { name: '2', exact: true }).check();
    await panel.getByRole('combobox').selectOption('false');
    await page.reload();
    await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
    await expect(panel.getByRole('radio', { name: '2', exact: true })).toBeChecked();
    await expect(panel.getByRole('checkbox', { name: '1', exact: true })).toBeChecked();
    await expect(panel.getByRole('checkbox', { name: '2', exact: true })).toBeChecked();
    await expect(panel.getByRole('combobox')).toHaveValue('false');
  });

  for (const route of ['/', '/academy/workspace', '/academies']) {
    test(`legacy empty membership on ${route} opens the first-use setup path`, async ({ page }) => {
      const actionLog: string[] = [];
      await seedSessionCookie(page, 'first-use-membership-user');
      await mockAcademyEdge(page, 'owner', {
        actionLog,
        meResponse: { user: { id: 'first-use-membership-user', email: 'first-use@example.test', role: 'user' }, current_tenant: null, memberships: [] },
        actionOverrides: { 'student-dashboard': emptyStudentDashboardFixture },
      });
      await page.route('**/functions/v1/academy', route => {
        if (route.request().postDataJSON()?.action !== 'academies') return route.fallback();
        return route.fulfill({ status: 403, json: { error: 'No active academy membership' } });
      });
      await page.goto(route);
      await expect(page.getByRole('heading', { name: 'No Academy access yet', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Set up an academy', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Academy name', exact: true })).toBeVisible();
      expect(actionLog.filter(action => ['summary', 'contacts', 'classrooms', 'create_academy'].includes(action))).toEqual([]);
    });
  }

  test('legacy empty staff membership still opens an enrolled student workspace', async ({ page }) => {
    const actionLog: string[] = [];
    await seedSessionCookie(page, 'student-user');
    await mockAcademyEdge(page, 'student', { actionLog });
    await page.route('**/functions/v1/academy', route => {
      if (route.request().postDataJSON()?.action !== 'academies') return route.fallback();
      return route.fulfill({ status: 403, json: { error: 'No active academy membership' } });
    });
    await page.goto('/academy/workspace');
    await expect(page).toHaveURL(/\/academy\/student(?:\?|$)/);
    await expect(page.locator('.workspace-identity')).toContainText('Student');
    await expect(page.getByRole('heading', { name: 'No Academy access yet', exact: true })).toHaveCount(0);
    expect(actionLog.filter(action => ['summary', 'contacts'].includes(action))).toEqual([]);
  });

  for (const failure of [
    { label: 'another forbidden response', status: 403, error: 'Forbidden', staff: false },
    { label: 'unavailable membership service', status: 503, error: 'No active academy membership', staff: false },
    { label: 'denial contradicting an active staff membership', status: 403, error: 'No active academy membership', staff: true },
  ]) {
    test(`entry preserves retry for ${failure.label}`, async ({ page }) => {
      await seedSessionCookie(page, 'owner-user');
      await mockAcademyEdge(page, 'owner', {
        ...(!failure.staff ? { meResponse: { user: { id: 'owner-user', email: 'no-staff@example.test', role: 'user' }, current_tenant: null, memberships: [] } } : {}),
        actionOverrides: { 'student-dashboard': emptyStudentDashboardFixture },
      });
      await page.route('**/functions/v1/academy', route => {
        if (route.request().postDataJSON()?.action !== 'academies') return route.fallback();
        return route.fulfill({ status: failure.status, json: { error: failure.error } });
      });
      await page.goto('/academy/workspace');
      await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'No Academy access yet', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Set up an academy', exact: true })).toHaveCount(0);
      await expect(page.locator('.ts-sidebar')).toHaveCount(0);
    });
  }

  test("workspace navigation renders Contacts immediately while summary and core data refresh in parallel", async ({ page }) => {
    const actionLog: string[] = [];
    const delayActions = { summary: 900, contacts: 1_200 };
    await seedSessionCookie(page, "owner-navigation-user");
    await mockAcademyEdge(page, "owner", {
      actionLog,
      delayActions,
    });

    await page.goto(`/academy/admin?academy_id=${academyId}`);
    await expect(page.locator(".workspace-identity")).toContainText("Owner");
    expect(actionLog.filter((action) => action === "academies")).toHaveLength(1);
    actionLog.splice(0, actionLog.length);
    delayActions.summary = 5_000;

    await page.getByRole("button", { name: "Daily operations" }).click();
    await page.getByRole('navigation', { name: 'Academy Admin navigation' }).getByRole("button", { name: "Contacts", exact: true }).click();
    await expect(page.locator(".ts-sidebar")).toBeVisible();
    await expect(page.locator(".workspace-identity")).toContainText("Owner");
    await expect(page.locator(".ts-loading")).toHaveCount(0);
    await expect(page.getByText("Preparing Academy...")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Contacts", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Students and contacts" })).toBeVisible();
    await expect(page.locator(".table-loading-state").filter({ hasText: "Loading contacts" })).toBeVisible();
    await expect(page.locator(".workspace-route-loading")).toHaveCount(0);
    expect(actionLog.filter((action) => action === "summary")).toHaveLength(1);
    expect(actionLog.filter((action) => action === "contacts")).toHaveLength(1);
    await expect(page.getByRole("button", { name: /Ali Karimov/ })).toBeVisible();
    await expect(page.locator(".workspace-route-progress")).toBeVisible();
    await expect(page.locator(".workspace-route-progress")).toHaveCount(0, { timeout: 7_000 });
  });

  test("Academy directory shows only accessible workspaces and avoids loading workspace data", async ({ page }) => {
    const actionLog: string[] = [];
    await seedSessionCookie(page, "cashier-directory-user");
    await mockAcademyEdge(page, "cashier", {
      actionLog,
      actionOverrides: { "student-dashboard": emptyStudentDashboardFixture },
    });
    await page.goto(`/academies?academy_id=${academyId}`);

    await expect(page.getByRole("heading", { name: "Choose a workspace" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Route Smoke Academy" })).toBeVisible();
    await expect(page.getByText("Cashier", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Route Smoke Academy operations" })).toBeVisible();
    await expect(page.getByText("No access", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Role-based staff workspaces" })).toHaveCount(0);
    expect(actionLog).not.toContain("summary");
    expect(actionLog).not.toContain("contacts");
  });

  test("workspace cards contain long unbroken academy and learner labels", async ({ page }) => {
    const learnerLabel = "muhammadjafargofirov1@gmail.com";
    const atlasAcademy = {
      ...academy("owner"),
      id: "academy-atlas",
      name: "Atlas Academy",
      slug: "atlas",
    };
    const learnerDashboard = {
      ...studentDashboard,
      academies: [
        {
          ...studentDashboard.academies[0],
          id: "academy-learner-label",
          name: learnerLabel,
          slug: "muhammadjafargofirov1-gmail-com",
        },
      ],
    };
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedSessionCookie(page, "long-workspace-label-user");
    await mockAcademyEdge(page, "owner", {
      actionOverrides: {
        academies: { academies: [academy("owner"), atlasAcademy] },
        "student-dashboard": learnerDashboard,
      },
    });

    await page.goto("/academies");
    const title = page.getByRole("heading", { name: learnerLabel });
    const learnerAction = page.getByRole("button", { name: `Learn in ${learnerLabel}` });
    await expect(title).toBeVisible();
    await expect(learnerAction).toBeVisible();
    const titleGeometry = await title.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    const actionGeometry = await learnerAction.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(titleGeometry.scrollWidth, "long workspace title stays within its card").toBeLessThanOrEqual(titleGeometry.clientWidth);
    expect(actionGeometry.scrollWidth, "long workspace action stays within its card").toBeLessThanOrEqual(actionGeometry.clientWidth);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "long workspace labels do not create page overflow").toBeLessThanOrEqual(1);
    if (process.env.ACADEMY_VISUAL_QA === "1") {
      const outputDir = resolve(process.cwd(), "..", "..", "output", "playwright", "academy-card-title-wrap");
      await mkdir(outputDir, { recursive: true });
      await page.screenshot({ path: resolve(outputDir, "long-workspace-label-1280.png"), fullPage: true });
    }
  });

  test("workspace entry remains responsive and keyboard-operable across supported widths", async ({ browser }) => {
    const captureScreenshots = process.env.ACADEMY_VISUAL_QA === "1";
    const outputDir = resolve(process.cwd(), "..", "..", "output", "playwright", "academy-entry-streamline");
    if (captureScreenshots) await mkdir(outputDir, { recursive: true });

    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 1280, height: 900 },
      { width: 1024, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
      { width: 320, height: 900 },
    ]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await seedSessionCookie(page, `entry-responsive-${viewport.width}`);
      await mockAcademyEdge(page, "owner");
      await page.goto("/academies");

      const pageHeading = page.getByRole("heading", { name: "Choose a workspace" });
      await expect(pageHeading).toBeVisible();
      const utilityMenu = page.getByRole("button", { name: "Menu", exact: true });
      const refreshButton = page.getByRole("button", { name: "Refresh", exact: true });
      if (viewport.width <= 620) {
        await expect(utilityMenu).toBeVisible();
        await expect(utilityMenu).toHaveAttribute("aria-expanded", "false");
        await expect(refreshButton).toBeHidden();
        const headingBeforeMenu = await pageHeading.boundingBox();
        await utilityMenu.click();
        await expect(utilityMenu).toHaveAttribute("aria-expanded", "true");
        await expect(refreshButton).toBeVisible();
        const headingAfterMenu = await pageHeading.boundingBox();
        expect(headingAfterMenu?.y ?? 0, "expanded menu pushes page content down").toBeGreaterThan((headingBeforeMenu?.y ?? 0) + 44);
        if (captureScreenshots) {
          await page.screenshot({
            path: resolve(outputDir, `directory-menu-open-${viewport.width}.png`),
            fullPage: true,
          });
        }
        await page.keyboard.press("Escape");
        await expect(utilityMenu).toHaveAttribute("aria-expanded", "false");
        await expect(utilityMenu).toBeFocused();
        await expect(refreshButton).toBeHidden();
      } else {
        await expect(utilityMenu).toBeHidden();
        await expect(refreshButton).toBeVisible();
      }
      const manageButton = page.getByRole("button", { name: "Manage Route Smoke Academy" });
      const learnButton = page.getByRole("button", { name: "Learn in Route Smoke Academy" });
      for (const button of [manageButton, learnButton]) {
        const box = await button.boundingBox();
        expect(box?.height ?? 0, `entry action target at ${viewport.width}px`).toBeGreaterThanOrEqual(44);
        expect(box?.x ?? -1, `entry action left edge at ${viewport.width}px`).toBeGreaterThanOrEqual(0);
        expect((box?.x ?? 0) + (box?.width ?? 0), `entry action right edge at ${viewport.width}px`).toBeLessThanOrEqual(viewport.width + 1);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `entry page overflow at ${viewport.width}px`).toBeLessThanOrEqual(1);
      await manageButton.focus();
      await expect(manageButton).toBeFocused();
      if (captureScreenshots) {
        await page.screenshot({ path: resolve(outputDir, `directory-${viewport.width}.png`), fullPage: true });
      }
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/academy\/admin(?:\?|$)/);
      await context.close();
    }

    const setupContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const setupPage = await setupContext.newPage();
    await seedSessionCookie(setupPage, "entry-responsive-no-access");
    await mockAcademyEdge(setupPage, "owner", {
      meResponse: {
        user: { id: "entry-responsive-no-access", email: "no-access@example.test", role: "user" },
        current_tenant: null,
        memberships: [],
      },
      actionOverrides: {
        academies: { academies: [] },
        "student-dashboard": emptyStudentDashboardFixture,
      },
    });
    await setupPage.goto("/academies");
    const setupButton = setupPage.getByRole("button", { name: "Set up an academy" });
    await expect(setupButton).toBeVisible();
    expect((await setupButton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await setupButton.focus();
    await setupPage.keyboard.press("Enter");
    await expect(setupPage).toHaveURL(/\/academy\/setup$/);
    await expect(setupPage.getByRole("textbox", { name: "Academy name" })).toBeVisible();
    const setupOverflow = await setupPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(setupOverflow, "setup page overflow at 390px").toBeLessThanOrEqual(1);
    if (captureScreenshots) {
      await setupPage.screenshot({ path: resolve(outputDir, "setup-390.png"), fullPage: true });
    }
    await setupContext.close();
  });

  test("teacher is blocked from administrator-only route", async ({ page }) => {
    await seedSessionCookie(page, "teacher-user");
    await mockAcademyEdge(page, "teacher");

    await page.goto(`/academy/admin/payments?academy_id=${academyId}`);

    await expect(page.getByRole("heading", { name: /Role workspace access required/i })).toBeVisible();
    await expect(page.getByText(/does not have administrator controls/i)).toBeVisible();
  });

  test("focus indicator maintains non-text contrast on white, light, and accent surfaces", async ({ page }) => {
    await seedSessionCookie(page, "owner-focus-user");
    await mockAcademyEdge(page, "owner");
    await page.goto(`/academy/admin?academy_id=${academyId}`);
    const focusTarget = page.locator(".ts-topbar .ghost-btn").first();
    await focusTarget.focus();
    const evidence = await focusTarget.evaluate((element) => {
      const parseColor = (value: string): number[] => {
        const normalized = value.trim();
        if (normalized.startsWith("#")) {
          const hex = normalized.slice(1);
          const expanded =
            hex.length === 3
              ? hex
                  .split("")
                  .map((character) => character + character)
                  .join("")
              : hex;
          return [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16));
        }
        return (normalized.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      };
      const luminance = (rgb: number[]) =>
        rgb
          .map((value) => {
            const channel = value / 255;
            return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          })
          .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
      const contrast = (first: number[], second: number[]) => {
        const light = Math.max(luminance(first), luminance(second));
        const dark = Math.min(luminance(first), luminance(second));
        return (light + 0.05) / (dark + 0.05);
      };
      const style = getComputedStyle(element);
      const root = getComputedStyle(document.documentElement);
      const outline = parseColor(style.outlineColor);
      return {
        width: Number.parseFloat(style.outlineWidth),
        offset: Number.parseFloat(style.outlineOffset),
        contrasts: {
          white: contrast(outline, [255, 255, 255]),
          lightPanel: contrast(outline, parseColor(root.getPropertyValue("--panel-subtle"))),
          accentTint: contrast(outline, parseColor(root.getPropertyValue("--accent"))),
        },
      };
    });
    expect(evidence.width).toBeGreaterThanOrEqual(3);
    expect(evidence.offset).toBeGreaterThanOrEqual(2);
    expect(evidence.contrasts.white, "focus contrast on white").toBeGreaterThanOrEqual(3);
    expect(evidence.contrasts.lightPanel, "focus contrast on light panels").toBeGreaterThanOrEqual(3);
    expect(evidence.contrasts.accentTint, "focus contrast on accent surfaces").toBeGreaterThanOrEqual(3);
  });

  test("responsive and keyboard QA matrix covers every role lane and required viewport", async ({ browser }) => {
    test.setTimeout(180_000);
    const captureScreenshots = process.env.ACADEMY_VISUAL_QA === "1";
    const outputDir = resolve(process.cwd(), "..", "..", "output", "playwright", "academy-redesign");
    if (captureScreenshots) await mkdir(outputDir, { recursive: true });
    const lanes: Array<{
      persona: Persona;
      name: string;
      path: string;
      navigation: string;
    }> = [
      {
        persona: "owner",
        name: "admin",
        path: "/academy/admin",
        navigation: ".workspace-nav",
      },
      {
        persona: "center_admin",
        name: "center",
        path: "/academy/center",
        navigation: ".workspace-nav",
      },
      {
        persona: "manager",
        name: "manager",
        path: "/academy/office",
        navigation: ".workspace-nav",
      },
      {
        persona: "branch_manager",
        name: "branch-manager",
        path: "/academy/office",
        navigation: ".workspace-nav",
      },
      {
        persona: "receptionist",
        name: "receptionist",
        path: "/academy/office",
        navigation: ".workspace-nav",
      },
      {
        persona: "cashier",
        name: "cashier",
        path: "/academy/office",
        navigation: ".workspace-nav",
      },
      {
        persona: "accountant",
        name: "accountant",
        path: "/academy/office",
        navigation: ".workspace-nav",
      },
      {
        persona: "payroll_officer",
        name: "payroll",
        path: "/academy/office",
        navigation: ".workspace-nav",
      },
      {
        persona: "parent_liaison",
        name: "liaison",
        path: "/academy/office",
        navigation: ".workspace-nav",
      },
      {
        persona: "teacher",
        name: "teacher",
        path: "/academy/teacher",
        navigation: ".workspace-nav",
      },
      {
        persona: "assistant",
        name: "assistant",
        path: "/academy/teacher",
        navigation: ".workspace-nav",
      },
      {
        persona: "student",
        name: "student",
        path: "/academy/student",
        navigation: ".workspace-nav",
      },
      {
        persona: "guardian",
        name: "guardian",
        path: "/academy/parent",
        navigation: ".business-tabs",
      },
    ];
    const viewports = [
      { width: 1440, height: 1000 },
      { width: 1280, height: 900 },
      { width: 1024, height: 900 },
      { width: 768, height: 1024 },
      { width: 640, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 900 },
    ];

    for (const lane of lanes) {
      for (const viewport of viewports) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        await seedSessionCookie(page, `${lane.persona}-visual-user`);
        await mockAcademyEdge(page, lane.persona);
        await page.goto(`${lane.path}?academy_id=${academyId}`);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        const navigation = page.locator(lane.navigation);
        const sections = page.locator('.workspace-menu-toggle');
        if (lane.persona !== 'guardian' && viewport.width <= 980) {
          await expect(navigation).toBeHidden();
          await sections.click();
        }
        await expect(navigation).toBeVisible();
        const firstNavigationButton = navigation.getByRole("button").first();
        await firstNavigationButton.focus();
        const focusEvidence = await firstNavigationButton.evaluate((element) => {
          const luminance = (rgb: number[]) => {
            const channels = rgb.map((value) => {
              const normalized = value / 255;
              return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
          };
          const parse = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
          const style = getComputedStyle(element);
          const foreground = parse(style.outlineColor);
          let backgroundElement: Element | null = element;
          let background = [255, 255, 255];
          while (backgroundElement) {
            const candidate = parse(getComputedStyle(backgroundElement).backgroundColor);
            if (candidate.length === 3 && getComputedStyle(backgroundElement).backgroundColor !== "rgba(0, 0, 0, 0)") {
              background = candidate;
              break;
            }
            backgroundElement = backgroundElement.parentElement;
          }
          const light = Math.max(luminance(foreground), luminance(background));
          const dark = Math.min(luminance(foreground), luminance(background));
          return {
            width: Number.parseFloat(style.outlineWidth),
            contrast: (light + 0.05) / (dark + 0.05),
          };
        });
        expect(focusEvidence.width, `${lane.name} focus thickness at ${viewport.width}px`).toBeGreaterThanOrEqual(2);
        expect(focusEvidence.contrast, `${lane.name} focus contrast at ${viewport.width}px`).toBeGreaterThanOrEqual(3);
        await page.keyboard.press("Tab");
        await expect(page.locator(":focus")).not.toHaveCount(0);
        if (lane.persona !== 'guardian' && viewport.width <= 980) {
          await page.keyboard.press('Escape');
          await expect(navigation).toBeHidden();
          await expect(sections).toBeFocused();
        }
        const primaryAction = lane.persona === "student" ? page.locator(".student-continue") : lane.persona === "guardian" ? page.locator(".business-tabs button").first() : ["teacher", "assistant"].includes(lane.persona) ? page.locator(".teacher-session-card").first() : page.locator(".workspace-shortcuts__list button").first();
        await expect(primaryAction, `${lane.name} reachable action at ${viewport.width}px`).toBeVisible();
        const primaryBox = await primaryAction.boundingBox();
        expect(primaryBox?.x ?? -1, `${lane.name} action left edge at ${viewport.width}px`).toBeGreaterThanOrEqual(0);
        expect((primaryBox?.x ?? 0) + (primaryBox?.width ?? 0), `${lane.name} action right edge at ${viewport.width}px`).toBeLessThanOrEqual(viewport.width + 1);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${lane.name} overflow at ${viewport.width}px`).toBeLessThanOrEqual(1);
        if (captureScreenshots) {
          await page.screenshot({
            path: resolve(outputDir, `${lane.name}-${viewport.width}.png`),
            fullPage: true,
          });
        }
        await context.close();
      }
    }

    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await seedSessionCookie(page, `owner-contact-visual-${viewport.width}`);
      await mockAcademyEdge(page, "owner");
      await page.goto(`/academy/admin/contacts?academy_id=${academyId}`);
      await expect(page.getByRole("heading", { name: "Ali Karimov" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `contact workspace overflow at ${viewport.width}px`).toBeLessThanOrEqual(1);
      const contactToggle = page.getByRole("button", {
        name: "Overview",
        exact: true,
      });
      const toggleBox = await contactToggle.boundingBox();
      expect(toggleBox?.height ?? 0, `contact toggle target at ${viewport.width}px`).toBeGreaterThanOrEqual(44);
      if (captureScreenshots)
        await page.screenshot({
          path: resolve(outputDir, `contacts-${viewport.width}.png`),
          fullPage: true,
        });
      await context.close();
    }

    const businessContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const businessPage = await businessContext.newPage();
    await seedSessionCookie(businessPage, "owner-business-form-visual");
    await mockAcademyEdge(businessPage, "owner");
    await businessPage.goto(`/academy/admin/platform?academy_id=${academyId}`);
    await businessPage.getByRole("button", { name: /AI assistant/ }).click();
    await expect(businessPage.getByRole("heading", { name: "Ask with evidence" })).toBeVisible();
    const businessOverflow = await businessPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(businessOverflow, "Business OS form overflow at 1280px").toBeLessThanOrEqual(1);
    if (captureScreenshots)
      await businessPage.screenshot({
        path: resolve(outputDir, "business-forms-1280.png"),
        fullPage: true,
      });
    await businessContext.close();
  });

  test("Uzbek and Russian remain usable across representative role lanes and viewports", async ({ browser }) => {
    const localeCases = [
      {
        code: "uz",
        language: "Til",
        refresh: "Yangilash",
        ownerRole: "Egasi",
        ownerShortcut: "O‘quvchilar va yordamchilarni boshqarish",
        teacherScope: "1 biriktirilgan o‘quv guruhi",
        navigation: {
          owner: "Qabul",
          accountant: "To‘lov va moliya",
          teacher: "Mening guruhlarim",
          student: "Mening o‘quv guruhlarim",
          guardian: "Baholar va uy vazifalari",
        },
      },
      {
        code: "ru",
        language: "Язык",
        refresh: "Обновить",
        ownerRole: "Владелец",
        ownerShortcut: "Управление учащимися и ассистентами",
        teacherScope: "1 назначенная учебная группа",
        navigation: {
          owner: "Приём",
          accountant: "Оплата и финансы",
          teacher: "Мои группы",
          student: "Мои учебные группы",
          guardian: "Оценки и домашнее задание",
        },
      },
    ] as const;
    const roleCases = [
      { persona: "owner" as const, path: "/academy/admin", navigation: ".workspace-nav" },
      { persona: "accountant" as const, path: "/academy/office", navigation: ".workspace-nav" },
      { persona: "teacher" as const, path: "/academy/teacher", navigation: ".workspace-nav" },
      { persona: "student" as const, path: "/academy/student", navigation: ".workspace-nav" },
      { persona: "guardian" as const, path: "/academy/parent", navigation: ".business-tabs" },
    ];
    const viewports = [
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
    ];
    const captureScreenshots = process.env.ACADEMY_VISUAL_QA === "1";
    const outputDir = resolve(process.cwd(), "..", "..", "output", "playwright", "academy-localization");
    if (captureScreenshots) await mkdir(outputDir, { recursive: true });

    for (const localeCase of localeCases) {
      for (const roleCase of roleCases) {
        for (const viewport of viewports) {
          const context = await browser.newContext({ viewport });
          const page = await context.newPage();
          await seedSessionCookie(page, `${roleCase.persona}-${localeCase.code}-${viewport.width}`);
          await mockAcademyEdge(page, roleCase.persona);
          await page.goto(`${roleCase.path}?academy_id=${academyId}&lang=${localeCase.code}`);
          await expect(page.locator("html")).toHaveAttribute("lang", localeCase.code);
          await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
          await expect(page.getByRole("combobox", { name: localeCase.language })).toHaveValue(localeCase.code);
          await expect(page.getByRole("button", { name: localeCase.refresh, exact: true }).first()).toBeVisible();
          await expect(page.getByRole("button", { name: "Refresh", exact: true })).toHaveCount(0);
          const navigation = page.locator(roleCase.navigation);
          const sections = page.locator('.workspace-menu-toggle');
          if (roleCase.persona !== 'guardian' && viewport.width <= 980) await sections.click();
          for (const toggle of await navigation.locator(".workspace-nav__group-toggle").all()) {
            if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
          }
          await expect(navigation.getByRole("button", { name: localeCase.navigation[roleCase.persona], exact: true })).toBeVisible();
          if (roleCase.persona === "owner") {
            await expect(page.locator('.workspace-shortcuts__list button').first()).toHaveAttribute('title', localeCase.ownerShortcut);
            await expect(page.getByText("Manage students and assistants", { exact: true })).toHaveCount(0);
            await expect(page.locator(".workspace-context").getByText(localeCase.ownerRole, { exact: true })).toBeVisible();
          }
          if (roleCase.persona === "teacher") {
            await expect(page.getByText("IELTS Evening A", { exact: true }).first()).toBeVisible();
          }
          const switcher = page.locator(".academy-language-switcher:visible");
          await expect(switcher).toHaveCount(1);
          const switcherBox = await switcher.boundingBox();
          expect(switcherBox?.height ?? 0, `${roleCase.persona} ${localeCase.code} language target`).toBeGreaterThanOrEqual(44);
          expect(switcherBox?.x ?? -1).toBeGreaterThanOrEqual(0);
          expect((switcherBox?.x ?? 0) + (switcherBox?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(overflow, `${roleCase.persona} ${localeCase.code} overflow at ${viewport.width}px`).toBeLessThanOrEqual(1);
          if (captureScreenshots) {
            await page.screenshot({
              path: resolve(outputDir, `${roleCase.persona}-${localeCase.code}-${viewport.width}.png`),
              fullPage: true,
            });
          }
          await context.close();
        }
      }
    }
  });

  test("service landing and Academy directory localize without changing routes", async ({ browser }) => {
    const cases = [
      {
        code: "uz",
        language: "Til",
        serviceHeading: "O‘quv markazingizni bitta bog‘langan ish joyidan boshqaring",
        directoryHeading: "Ish maydonini tanlang",
      },
      {
        code: "ru",
        language: "Язык",
        serviceHeading: "Управляйте учебным центром из единого рабочего пространства",
        directoryHeading: "Выберите рабочее пространство",
      },
    ] as const;
    const captureScreenshots = process.env.ACADEMY_VISUAL_QA === "1";
    const outputDir = resolve(process.cwd(), "..", "..", "output", "playwright", "academy-localization");
    if (captureScreenshots) await mkdir(outputDir, { recursive: true });

    for (const localeCase of cases) {
      for (const viewport of [
        { width: 1280, height: 900 },
        { width: 390, height: 844 },
      ]) {
        const publicContext = await browser.newContext({ viewport });
        const publicPage = await publicContext.newPage();
        await publicPage.goto(`/?lang=${localeCase.code}`);
        await expect(publicPage.locator("html")).toHaveAttribute("lang", localeCase.code);
        await expect(publicPage.getByRole("heading", { name: localeCase.serviceHeading })).toBeVisible();
        await expect(publicPage.getByRole("combobox", { name: localeCase.language })).toHaveValue(localeCase.code);
        const overflow = await publicPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `service ${localeCase.code} overflow at ${viewport.width}px`).toBeLessThanOrEqual(1);
        if (captureScreenshots) {
          await publicPage.screenshot({
            path: resolve(outputDir, `service-${localeCase.code}-${viewport.width}.png`),
            fullPage: true,
          });
        }
        await publicContext.close();
      }

      const directoryContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const directoryPage = await directoryContext.newPage();
      await seedSessionCookie(directoryPage, `directory-${localeCase.code}-owner`);
      await mockAcademyEdge(directoryPage, "owner");
      await directoryPage.goto(`/academies?academy_id=${academyId}&lang=${localeCase.code}`);
      await expect(directoryPage.locator("html")).toHaveAttribute("lang", localeCase.code);
      await expect(directoryPage.getByRole("heading", { name: localeCase.directoryHeading }).first()).toBeVisible();
      await expect(directoryPage.getByText("No access", { exact: true })).toHaveCount(0);
      if (captureScreenshots) {
        await directoryPage.screenshot({
          path: resolve(outputDir, `directory-${localeCase.code}-1280.png`),
          fullPage: true,
        });
      }
      await directoryContext.close();
    }
  });

  test("receptionist can securely enter the Academy bot from the normal workspace", async ({ page }) => {
    const actions: string[] = [];
    await seedSessionCookie(page, "receptionist-user");
    await mockAcademyEdge(page, "receptionist", { actionLog: actions });
    await page.goto(`/academy/office?academy_id=${academyId}`);
    await page.getByRole("button", { name: "Manage", exact: true }).click();
    const assistant = page.getByRole("button", { name: "Telegram assistant" });
    await expect(assistant).toBeVisible();
    await assistant.click();
    await expect(page).toHaveURL(/#telegram-linked$/);
    expect(actions).toContain("create_staff_link");
  });

  test("Academy Telegram Mini App shows the Edge recovery message instead of an SDK error", async ({ page }) => {
    await page.addInitScript(() => {
      window.Telegram = {
        WebApp: {
          initData: "query_id=expired-smoke&user=%7B%22id%22%3A1001%7D&auth_date=1787155200&hash=expired-smoke",
          ready: () => undefined,
          expand: () => undefined,
          disableVerticalSwipes: () => undefined,
        },
      };
    });
    await page.route("**/functions/v1/academy-telegram", (route) => route.fulfill({
      ...json({ error: "Telegram session expired" }),
      status: 400,
    }));

    await page.goto("/telegram?lang=en");
    await expect(page.getByRole("heading", { name: "Academy operations could not open" })).toBeVisible();
    await expect(page.getByText("Telegram session expired", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Academy bot" })).toHaveAttribute("href", "https://t.me/schoodacademybot");
    await expect(page.getByText("Edge Function returned a non-2xx status code")).toHaveCount(0);
  });

  test("Academy Telegram gives an assigned teacher the complete lesson flow", async ({ page }) => {
    const telegramActions: string[] = [];
    await page.setViewportSize({ width: 390, height: 820 });
    await page.addInitScript(() => {
      window.Telegram = {
        WebApp: {
          initData: "query_id=teacher-flow&user=%7B%22id%22%3A2002%7D&auth_date=1787155200&hash=teacher-flow",
          ready: () => undefined,
          expand: () => undefined,
          disableVerticalSwipes: () => undefined,
        },
      };
    });
    await page.route("**/functions/v1/academy-telegram", async (route) => {
      const body = route.request().postDataJSON() as { action?: string };
      if (body.action) telegramActions.push(body.action);
      if (body.action !== "bootstrap") return route.fulfill(json({ ok: true }));
      return route.fulfill(json({
        linked: true,
        user: { id: "teacher-user", full_name: "Teacher Route", email: "teacher@example.test" },
        academies: [{
          id: academyId,
          name: "Route Smoke Academy",
          access: { role: "teacher", source: "staff", scope: "assigned_classrooms", branch_ids: [], classroom_ids: [classroomId], permissions: { viewEducationOS: true, manageAssignments: true, markAttendance: true } },
        }],
        selected_academy_id: academyId,
        dashboard: {
          settings: { enabled: true, default_locale: "en", timezone: "Asia/Tashkent", digest_time: "08:00", emergency_override_enabled: true },
          metrics: { sessions_today: 1, open_requests: 0, urgent_requests: 0, due_homework: 0, connected_groups: 1, failed_deliveries: 0 },
          branches: [], classrooms: [{ id: classroomId, name: "IELTS Evening A", branch_id: "branch-main", is_active: true }], groups: [], subscriptions: [], requests: [], assignments: [], contacts: [], deliveries: [],
          sessions: [{ id: "teacher-tg-session", branch_id: "branch-main", classroom_id: classroomId, title: "Writing workshop", starts_at: "2026-09-01T13:00:00.000Z", ends_at: "2026-09-01T14:30:00.000Z", status: "confirmed", delivery_mode: "physical" }],
          teacher_day: {
            date: "2026-09-01", counts: { sessions: 1, students: 1, attendance_pending: 1, homework_pending: 1 },
            sessions: [{
              id: "teacher-tg-session", classroom_id: classroomId, classroom_name: "IELTS Evening A", room_name: "Room 12", title: "Writing workshop", starts_at: "2026-09-01T13:00:00.000Z", ends_at: "2026-09-01T14:30:00.000Z", status: "confirmed", delivery_mode: "physical",
              roster: [{ contact_id: studentContactId, name: "Ali Karimov", status: null, notes: null }], attendance_saved: false,
              curriculum: { lesson_id: lesson.id, course_title: course.title, module_title: courseModule.title, lesson_title: "Problem and solution essays", objectives: [{ id: "objective-1", label: "Write a precise thesis", covered: false }] },
              homework: { title: "Write one timed essay", description: "Complete a full response.", due_at: "2026-09-03T15:00:00.000Z" }, run: null, connected_group_count: 1,
            }],
          },
        },
      }));
    });

    await page.goto("/telegram?lang=en");
    await page.getByRole("button", { name: /Start lesson/ }).click();
    await expect(page.getByRole("heading", { name: "Teach, record, finish" })).toBeVisible();
    await page.getByRole("button", { name: "Save attendance" }).click();
    await page.getByLabel("Write a precise thesis").check();
    await page.getByRole("button", { name: "Finish lesson and assign" }).click();
    await expect(page.getByText("Lesson finished and homework assigned")).toBeVisible();
    expect(telegramActions).toEqual(expect.arrayContaining(["teacher_lesson_start", "teacher_lesson_attendance", "teacher_lesson_finish"]));
  });

  test("Academy Telegram Mini App keeps daily staff work clear and usable at 320px", async ({ page }) => {
    const telegramActions: string[] = [];
    await page.setViewportSize({ width: 320, height: 700 });
    await page.addInitScript(() => {
      window.Telegram = {
        WebApp: {
          initData: "query_id=route-smoke&user=%7B%22id%22%3A1001%7D&auth_date=1787155200&hash=route-smoke",
          ready: () => undefined,
          expand: () => undefined,
          disableVerticalSwipes: () => undefined,
          openLink: () => undefined,
          openTelegramLink: () => undefined,
        },
      };
    });
    await page.route("**/functions/v1/academy-telegram", async (route) => {
      const body = route.request().postDataJSON() as { action?: string };
      if (body.action) telegramActions.push(body.action);
      if (body.action !== "bootstrap") return route.fulfill(json({ ok: true }));
      return route.fulfill(json({
        linked: true,
        user: { id: "receptionist-user", full_name: "Madina Reception", email: "madina@example.test" },
        academies: [{
          id: academyId,
          name: "Route Smoke Academy",
          access: {
            role: "receptionist",
            source: "staff",
            scope: "assigned_branches",
            branch_ids: ["branch-main"],
            classroom_ids: [],
            permissions: {
              manageAutomation: false,
              manageMessages: true,
              manageAnnouncements: true,
              manageAssignments: false,
              markAttendance: true,
              resolveActionItems: true,
            },
          },
        }],
        selected_academy_id: academyId,
        dashboard: {
          settings: { enabled: true, default_locale: "en", timezone: "Asia/Tashkent", digest_time: "08:00", emergency_override_enabled: true },
          metrics: { sessions_today: 1, open_requests: 1, urgent_requests: 1, due_homework: 0, connected_groups: 1, failed_deliveries: 0 },
          branches: [{ id: "branch-main", name: "Main branch", is_active: true }],
          classrooms: [{ id: classroomId, name: "IELTS Evening A", branch_id: "branch-main", is_active: true }],
          groups: [{ id: "telegram-group-route-smoke", branch_id: "branch-main", classroom_id: classroomId, purpose: "classroom_community", title: "IELTS Evening A", locale: "en", status: "active", last_verified_at: "2026-08-19T08:00:00.000Z", last_error: null }],
          subscriptions: [{ chat_binding_id: "telegram-group-route-smoke", event_type: "announcement", delivery_mode: "immediate", enabled: true }],
          sessions: [{ id: "session-route-smoke", branch_id: "branch-main", classroom_id: classroomId, title: "Speaking clinic", starts_at: "2026-08-19T10:00:00.000Z", ends_at: "2026-08-19T11:00:00.000Z", status: "confirmed", delivery_mode: "physical" }],
          requests: [{ id: "request-route-smoke", branch_id: "branch-main", classroom_id: classroomId, request_type: "schedule_change", subject: "Move Friday lesson", priority: "urgent", status: "submitted", assigned_to: null, created_at: "2026-08-19T07:00:00.000Z", sla_due_at: null }],
          assignments: [],
          contacts: [
            { id: "contact-linked", first_name: "Aziza", last_name: "Karimova", status: "active", primary_branch_id: "branch-main", telegram_linked: true },
            { id: "contact-unlinked", first_name: "Bek", last_name: "Aliyev", status: "active", primary_branch_id: "branch-main", telegram_linked: false },
          ],
          deliveries: [{ id: "delivery-route-smoke", type: "announcement", title: "Room update", status: "sent", error: null, scheduled_at: "2026-08-19T07:30:00.000Z", sent_at: "2026-08-19T07:31:00.000Z", chat_binding_id: "telegram-group-route-smoke", created_at: "2026-08-19T07:30:00.000Z" }],
        },
      }));
    });

    await page.goto("/telegram?lang=en");
    await expect(page.getByRole("heading", { name: "What needs attention now" })).toBeVisible();
    await expect(page.getByText("Speaking clinic")).toBeVisible();
    await expect(page.getByRole("button", { name: "Attendance" })).toBeVisible();
    const navigation = page.getByRole("navigation", { name: "Academy operations" });
    await expect(navigation).toBeVisible();
    await navigation.getByRole("button", { name: "Compose" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Write an update" })).toBeVisible();
    await expect(page.getByText("Connect a group before publishing")).toHaveCount(0);
    await page.getByLabel("Update type").selectOption("personal_warning");
    await expect(page.getByLabel("Learner")).toHaveValue("contact-linked");
    await page.getByLabel("Title").fill("Attendance follow-up");
    await page.getByLabel("Message").fill("Please contact the reception team today.");
    await page.getByRole("button", { name: "Review message" }).click();
    await expect(page.getByText("This message stays private and is delivered by the student bot.")).toBeVisible();
    await page.getByRole("button", { name: "Send privately" }).click();
    await expect.poll(() => telegramActions).toContain("send_private_warning");
    await navigation.getByRole("button", { name: "Inbox" }).click();
    await expect(page.getByRole("heading", { name: "Open requests" })).toBeVisible();
    await expect(page.getByText("Move Friday lesson")).toBeVisible();
    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      fixedNavBottom: Math.round(document.querySelector(".academy-tg-nav")?.getBoundingClientRect().bottom ?? 0),
      viewportBottom: window.innerHeight,
    }));
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.fixedNavBottom - geometry.viewportBottom)).toBeLessThanOrEqual(1);
  });
});
