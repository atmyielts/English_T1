import { expect, test, type Page, type Route } from '@playwright/test';

type Persona = 'owner' | 'teacher' | 'student' | 'guardian';

const academyId = 'academy-route-smoke';
const classroomId = 'classroom-route-smoke';
const studentContactId = 'contact-route-smoke';

const ownerAccess = {
  role: 'owner',
  source: 'tenant',
  scope: 'academy',
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

const teacherAccess = {
  role: 'teacher',
  source: 'staff',
  scope: 'assigned_classrooms',
  classroom_ids: [classroomId],
  permissions: {
    viewContacts: true,
    viewClassrooms: true,
    manageMessages: true,
    manageAnnouncements: true,
    manageAlerts: true,
    resolveAlerts: true,
    viewEducationOS: true,
    resolveActionItems: true,
    manageAssignments: true,
    gradeSubmissions: true,
    markAttendance: true,
    manageSchedule: true,
    manageResources: true,
    communicateGuardians: true,
  },
};

const academy = (persona: Persona) => ({
  id: academyId,
  name: 'Route Smoke Academy',
  slug: 'route-smoke',
  type: 'team',
  metadata: { service_family: 'academy' },
  role: persona === 'owner' ? 'owner' : persona === 'student' ? 'student' : persona === 'guardian' ? 'guardian' : 'teacher',
  status: 'active',
  created_at: '2026-01-01T00:00:00.000Z',
  access: persona === 'owner' ? ownerAccess : teacherAccess,
});

const guardianProfile = {
  id: 'guardian-route-smoke', academy_id: academyId, user_id: 'guardian-user', full_name: 'Malika Karimova',
  phone: '+998901111111', email: 'malika@example.test', telegram_user_id: '100200300', telegram_username: 'malika_parent',
  telegram_verified_at: '2026-07-10T09:00:00.000Z', status: 'verified', locale: 'uz', notes: null,
  created_at: '2026-07-01T09:00:00.000Z', updated_at: '2026-07-10T09:00:00.000Z',
};
const guardianRelationship = {
  id: 'guardian-relationship-route-smoke', academy_id: academyId, contact_id: studentContactId, guardian_id: guardianProfile.id,
  relationship_type: 'mother', status: 'active', is_primary_contact: true, is_financially_responsible: true, is_emergency_contact: false,
  can_view_status: true, can_view_attendance: true, can_view_grades: true, can_view_homework: true, can_view_schedule: true,
  can_view_payments: true, can_view_debt: true, can_view_messages: true, can_view_progress_reports: true, can_view_resources: true,
  can_view_announcements: true, can_message_academy: true, consent_status: 'granted', consented_at: '2026-07-10T09:00:00.000Z',
  revoked_at: null, revocation_reason: null, created_at: '2026-07-01T09:00:00.000Z', updated_at: '2026-07-10T09:00:00.000Z',
};

const classroom = {
  id: classroomId,
  academy_id: academyId,
  name: 'IELTS Evening A',
  description: 'Route-smoked classroom',
  is_active: true,
  metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  member_count: 1,
};

const contact = {
  id: studentContactId,
  academy_id: academyId,
  user_id: 'student-user',
  first_name: 'Ali',
  last_name: 'Karimov',
  email: 'ali@example.test',
  phone: '+998900000000',
  telegram_id: null,
  status: 'active',
  placement_level: 'B2',
  placement_score: 72,
  lifecycle_stage: 'learning',
  notify_enabled: true,
  metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const membership = {
  id: 'membership-route-smoke',
  academy_id: academyId,
  classroom_id: classroomId,
  contact_id: studentContactId,
  role: 'student',
  joined_at: '2026-01-01T00:00:00.000Z',
  metadata: {},
};

const assignment = {
  id: 'assignment-route-smoke',
  academy_id: academyId,
  classroom_id: classroomId,
  title: 'Writing Task 2',
  description: 'Submit the essay draft.',
  assignment_type: 'writing',
  experience_id: null,
  experience_url: null,
  due_at: '2026-07-20T09:00:00.000Z',
  released_at: '2026-07-01T09:00:00.000Z',
  prerequisite_id: null,
  position: 1,
  max_score: 100,
  score_weight: 1,
  course_id: 'course-route-smoke',
  module_id: 'module-route-smoke',
  lesson_id: 'lesson-route-smoke',
  grade_category_id: 'grade-category-route-smoke',
  rubric_id: 'rubric-route-smoke',
  attempts_allowed: 2,
  allow_late_submission: false,
  status: 'active',
  metadata: {},
  created_by: 'teacher-user',
  created_at: '2026-07-01T09:00:00.000Z',
  updated_at: '2026-07-01T09:00:00.000Z',
};

const course = {
  id: 'course-route-smoke', academy_id: academyId, code: 'IELTS-01', title: 'IELTS Foundation', description: 'Structured IELTS course',
  level: 'B1', estimated_minutes: 600, status: 'published', published_at: '2026-07-01T09:00:00.000Z', metadata: {},
};
const courseModule = {
  id: 'module-route-smoke', academy_id: academyId, course_id: course.id, title: 'Reading foundations', description: 'Core reading skills',
  position: 0, status: 'published', unlock_rule: {}, metadata: {},
};
const lesson = {
  id: 'lesson-route-smoke', academy_id: academyId, course_id: course.id, module_id: courseModule.id, prerequisite_lesson_id: null,
  title: 'Finding evidence', summary: 'Read for exact support.', content: [{ type: 'rich_text', text: 'Start with the question stem.' }],
  position: 0, estimated_minutes: 20, status: 'published', available_from: null, completion_rule: { type: 'manual' }, metadata: {}, locked: false,
};
const quiz = {
  id: 'quiz-route-smoke', academy_id: academyId, course_id: course.id, lesson_id: lesson.id, title: 'Evidence check', instructions: 'Choose the best answer.',
  status: 'published', passing_score: 60, attempts_allowed: 2, time_limit_seconds: 600, shuffle_questions: false, show_answers_after: true, metadata: {},
};
const quizQuestion = {
  id: 'question-route-smoke', quiz_id: quiz.id, question_type: 'single_choice', prompt: 'Which option is supported?', options: ['A', 'B'],
  points: 1, position: 0, metadata: {},
};
const gradeCategory = {
  id: 'grade-category-route-smoke', academy_id: academyId, classroom_id: classroomId, name: 'Coursework',
  weight: 40, drop_lowest_count: 1, position: 0, status: 'active', metadata: {},
};
const rubric = {
  id: 'rubric-route-smoke', academy_id: academyId, title: 'Writing quality', description: 'Analytic writing rubric',
  criteria: [
    { id: 'evidence', name: 'Evidence', max_points: 6 },
    { id: 'language', name: 'Language', max_points: 4 },
  ],
  status: 'active', metadata: {},
};

const studentDashboard = {
  academies: [{ id: academyId, name: 'Route Smoke Academy', slug: 'route-smoke', type: 'academy', metadata: {} }],
  contacts: [contact],
  classrooms: [classroom],
  classroom_memberships: [membership],
  entitlements: [{
    id: 'entitlement-route-smoke',
    academy_id: academyId,
    contact_id: studentContactId,
    user_id: 'student-user',
    offer_id: 'offer-route-smoke',
    payment_id: 'payment-route-smoke',
    grant_type: 'classroom_access',
    resource_type: 'classroom',
    resource_id: classroomId,
    capability_key: null,
    quantity: 1,
    remaining: 1,
    starts_at: '2026-01-01T00:00:00.000Z',
    expires_at: null,
    status: 'active',
    source: 'click',
    metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }],
  alerts: [],
  announcements: [],
  messages: [],
  payments: [],
};

const educationOS = {
  generated_at: '2026-07-12T00:00:00.000Z',
  access: ownerAccess,
  action_queue: [{
    id: 'action-grading',
    academy_id: academyId,
    dedupe_key: 'grading:route-smoke',
    source_type: 'grading_backlog',
    priority: 'high',
    title: 'Grade Writing Task 2',
    description: 'One student is waiting for feedback.',
    recommended_action: 'Open the gradebook.',
    contact_id: studentContactId,
    classroom_id: classroomId,
    due_at: '2026-07-13T09:00:00.000Z',
    status: 'open',
    metadata: {},
    created_at: '2026-07-12T00:00:00.000Z',
    updated_at: '2026-07-12T00:00:00.000Z',
  }],
  pipeline: [{
    contact_id: studentContactId,
    name: 'Ali Karimov',
    email: 'ali@example.test',
    status: 'active',
    stage: 'learning',
    derived_stage: 'learning',
    classroom_ids: [classroomId],
    next_action: 'Grade submitted essay.',
    attention: 'Needs feedback',
    pending_amount: 0,
    currency: 'UZS',
    entitlement_expires_at: null,
    attendance_rate: 0.9,
    missing_assignments: 0,
    composite_score: 86,
    certificate_ready: false,
    parent_follow_up: false,
  }],
  pipeline_counts: { lead: 0, placement: 0, enrolled: 0, learning: 1, attention: 0, renewal: 0, completion: 0 },
  automation_rules: [],
  calendar_events: [],
  intelligence: [],
  stats: { open_actions: 1, urgent_actions: 1, grading_backlog: 1, certificate_ready: 0, placement_gap: 0 },
};

const businessFoundation = {
  generated_at: '2026-07-12T00:00:00.000Z',
  access: ownerAccess,
  branches: [{ id: 'branch-main', academy_id: academyId, branch_key: 'main', name: 'Main branch', address: 'Tashkent', phone: '+998900001122', timezone: 'Asia/Tashkent', currency: 'UZS', capacity: 120, is_default: true, is_active: true, metadata: {}, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }],
  rooms: [{ id: 'room-101', academy_id: academyId, branch_id: 'branch-main', room_key: '101', name: 'Room 101', capacity: 14, room_type: 'classroom', is_active: true, features: [], metadata: {}, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }],
  sources: [{ id: 'source-instagram', academy_id: academyId, source_key: 'instagram', label_i18n: { en: 'Instagram', uz: 'Instagram', ru: 'Instagram' }, category: 'social', is_system: true, is_active: true, position: 10 }],
  stages: [
    { id: 'stage-new', academy_id: academyId, pipeline_id: 'pipeline-admissions', stage_key: 'new', label_i18n: { en: 'New' }, position: 10, probability_percent: 5, terminal_kind: null, is_active: true },
    { id: 'stage-contacted', academy_id: academyId, pipeline_id: 'pipeline-admissions', stage_key: 'contacted', label_i18n: { en: 'Contacted' }, position: 20, probability_percent: 15, terminal_kind: null, is_active: true },
    { id: 'stage-won', academy_id: academyId, pipeline_id: 'pipeline-admissions', stage_key: 'won', label_i18n: { en: 'Won' }, position: 70, probability_percent: 100, terminal_kind: 'won', is_active: true },
    { id: 'stage-lost', academy_id: academyId, pipeline_id: 'pipeline-admissions', stage_key: 'lost', label_i18n: { en: 'Lost' }, position: 80, probability_percent: 0, terminal_kind: 'lost', is_active: true },
  ],
  transitions: [{ id: 'transition-new-contacted', academy_id: academyId, pipeline_id: 'pipeline-admissions', from_stage_id: 'stage-new', to_stage_id: 'stage-contacted', is_active: true, requires_reason: false }],
  leads: [{ id: 'lead-route-smoke', academy_id: academyId, branch_id: 'branch-main', preferred_branch_id: 'branch-main', pipeline_id: 'pipeline-admissions', current_stage_id: 'stage-new', source_id: 'source-instagram', assigned_user_id: 'owner-user', responsible_user_id: 'owner-user', full_name: 'Madina Lead', phone: '+998901234567', telegram: null, email: null, parent_name: null, parent_phone: null, age: 17, interested_course: 'IELTS', preferred_schedule: 'Evenings', expected_price: 700000, currency: 'UZS', campaign: 'Summer intake', referral_source: null, notes: null, tags: [], estimated_probability: 5, status: 'open', lost_reason: null, last_contacted_at: null, next_follow_up_at: '2026-07-13T09:00:00.000Z', converted_at: null, metadata: {}, created_at: '2026-07-12T00:00:00.000Z', updated_at: '2026-07-12T00:00:00.000Z' }],
  activities: [], trials: [], conversions: [],
  classrooms: [{ id: classroomId, name: 'IELTS Evening A', is_active: true }],
  staff: [],
};

const commercialCore = {
  generated_at: '2026-07-12T00:00:00.000Z', access: ownerAccess,
  pricing_plans: [{ id: 'plan-monthly', academy_id: academyId, branch_id: 'branch-main', classroom_id: classroomId, legacy_offer_id: 'offer-route-smoke', plan_key: 'monthly-ielts', name: 'Monthly IELTS', pricing_model: 'monthly_fixed', billing_cycle: 'monthly', base_amount: 700000, currency: 'UZS', lessons_included: 12, teaching_hours_included: 18, duration_days: 30, installment_count: null, is_active: true, metadata: {}, created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z' }],
  subscriptions: [{ id: 'subscription-route', academy_id: academyId, contact_id: studentContactId, branch_id: 'branch-main', classroom_id: classroomId, pricing_plan_id: 'plan-monthly', entitlement_id: null, status: 'active', starts_on: '2026-07-01', ends_on: null, billing_cycle: 'monthly', billing_anchor_day: 1, list_amount: 700000, discount_amount: 50000, agreed_amount: 650000, currency: 'UZS', auto_renew: true, renewal_notice_days: 7, cancelled_at: null, cancellation_reason: null, completed_at: null, metadata: {}, created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z' }],
  subscription_freezes: [],
  pricing_adjustments: [{ id: 'discount-route', academy_id: academyId, subscription_id: 'subscription-route', adjustment_type: 'sibling', percentage_basis_points: null, amount: 50000, original_amount: 700000, final_amount: 650000, reason: 'Sibling discount', promo_code: null, starts_on: null, ends_on: null, applied_by: 'owner-user', approved_by: 'owner-user', metadata: {}, created_at: '2026-07-01T00:00:00.000Z' }],
  charges: [{ id: 'charge-route', academy_id: academyId, contact_id: studentContactId, subscription_id: 'subscription-route', branch_id: 'branch-main', classroom_id: classroomId, charge_number: 'INV-2026-07', cycle_key: '2026-07', charge_type: 'tuition', service_period_start: '2026-07-01', service_period_end: '2026-07-31', issued_on: '2026-07-01', due_on: '2026-07-05', original_amount: 700000, discount_amount: 50000, net_amount: 650000, currency: 'UZS', status: 'partially_paid', description: 'July tuition', metadata: {}, created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-12T00:00:00.000Z', allocated_amount: 500000, adjustment_amount: 0, effective_amount: 650000, outstanding_amount: 150000, calculated_status: 'partially_paid', days_overdue: 7, aging_bucket: '1-7' }],
  payments: [{ id: 'payment-route-smoke', academy_id: academyId, contact_id: studentContactId, offer_id: 'offer-route-smoke', provider: 'click', provider_transaction_id: 'click-route-smoke', amount: 500000, currency: 'UZS', status: 'paid', metadata: {}, created_at: '2026-07-02T00:00:00.000Z', updated_at: '2026-07-02T00:00:00.000Z' }],
  allocations: [{ id: 'allocation-route', academy_id: academyId, payment_id: 'payment-route-smoke', charge_id: 'charge-route', amount: 500000, currency: 'UZS', allocation_kind: 'application', reverses_allocation_id: null, allocated_by: 'owner-user', allocated_at: '2026-07-02T00:00:00.000Z', metadata: {} }],
  ledger_entries: [{ id: 'ledger-charge-route', academy_id: academyId, contact_id: studentContactId, subscription_id: 'subscription-route', charge_id: 'charge-route', payment_id: null, entry_type: 'charge', amount: 650000, currency: 'UZS', effective_at: '2026-07-01T00:00:00.000Z', reason: 'July tuition', created_by: 'owner-user', metadata: {}, created_at: '2026-07-01T00:00:00.000Z' }, { id: 'ledger-payment-route', academy_id: academyId, contact_id: studentContactId, subscription_id: null, charge_id: null, payment_id: 'payment-route-smoke', entry_type: 'payment_received', amount: -500000, currency: 'UZS', effective_at: '2026-07-02T00:00:00.000Z', reason: 'Payment received', created_by: 'owner-user', metadata: {}, created_at: '2026-07-02T00:00:00.000Z' }],
  account_balances: [{ academy_id: academyId, contact_id: studentContactId, currency: 'UZS', balance: 150000, debits: 650000, credits: 500000, last_entry_at: '2026-07-02T00:00:00.000Z' }],
  debt_cases: [], payment_promises: [], collection_events: [], reconciliations: [],
  contacts: [{ id: studentContactId, first_name: 'Ali', last_name: 'Karimov', email: 'ali@example.test', phone: '+998901234567', status: 'active', lifecycle_stage: 'learning' }],
  branches: [{ id: 'branch-main', name: 'Main branch', is_active: true, currency: 'UZS' }],
  classrooms: [{ id: classroomId, name: 'IELTS Evening A', is_active: true }],
};

const operationsFinance = {
  generated_at: '2026-07-12T00:00:00.000Z', access: ownerAccess,
  cashboxes: [{ id: 'cashbox-main', academy_id: academyId, branch_id: 'branch-main', name: 'Front desk', currency: 'UZS', is_active: true }],
  cashier_shifts: [{ id: 'shift-route', academy_id: academyId, cashbox_id: 'cashbox-main', cashier_user_id: 'owner-user', opened_at: '2026-07-12T08:00:00.000Z', closed_at: null, opening_balance: 100000, expected_closing_balance: null, counted_closing_balance: null, discrepancy: null, status: 'open' }],
  cash_movements: [], cash_reconciliations: [],
  expense_categories: [{ id: 'category-teaching', academy_id: academyId, category_key: 'teaching-materials', name: 'Teaching materials', kind: 'teaching', is_active: true }],
  expenses: [{ id: 'expense-route', academy_id: academyId, branch_id: 'branch-main', classroom_id: classroomId, category_id: 'category-teaching', expense_date: '2026-07-10', amount: 50000, currency: 'UZS', vendor: 'Book shop', description: 'Workbooks', payment_method: 'cash', status: 'approved', receipt_ref: 'REC-001' }],
  budgets: [], lesson_deliveries: [],
  compensation_rules: [{ id: 'rule-route', academy_id: academyId, staff_id: 'staff-route', branch_id: 'branch-main', rule_type: 'per_lesson', name: 'Per lesson', currency: 'UZS', fixed_amount: 0, unit_rate: 100000, percentage_basis_points: 0, performance_bonus: 0, effective_from: '2026-07-01', effective_to: null, is_active: true, version: 1 }],
  payroll_periods: [{ id: 'period-route', academy_id: academyId, branch_id: 'branch-main', period_start: '2026-07-01', period_end: '2026-07-31', currency: 'UZS', status: 'calculated', calculated_at: '2026-07-31T00:00:00.000Z', reviewed_at: null, approved_at: null, paid_at: null, cancellation_reason: null }],
  payroll_rows: [{ id: 'payroll-row-route', academy_id: academyId, payroll_period_id: 'period-route', staff_id: 'staff-route', branch_id: 'branch-main', compensation_rule_id: 'rule-route', lessons_delivered: 12, minutes_delivered: 1080, relevant_students: 10, generated_revenue: 6500000, generated_amount: 1200000, adjustment_amount: 50000, final_payable_amount: 1250000, currency: 'UZS', rule_snapshot: {}, inputs_snapshot: {} }],
  payroll_adjustments: [], payroll_payouts: [],
  branch_economics: [{ academy_id: academyId, branch_id: 'branch-main', branch_name: 'Main branch', currency: 'UZS', generated_revenue: 6500000, operating_expenses: 500000, teacher_cost: 1250000, contribution: 4750000 }],
  classroom_economics: [{ academy_id: academyId, classroom_id: classroomId, classroom_name: 'IELTS Evening A', currency: 'UZS', generated_revenue: 6500000, operating_expenses: 50000, attributed_teacher_cost: 1200000, contribution: 5250000 }],
  staff: [{ id: 'staff-route', email: 'teacher@example.test', display_name: 'Teacher One', role: 'teacher', classroom_ids: [classroomId], is_active: true }],
  branches: [{ id: 'branch-main', name: 'Main branch', currency: 'UZS', is_active: true }],
  classrooms: [{ id: classroomId, name: 'IELTS Evening A', is_active: true }],
};

const academicOperations = {
  generated_at: '2026-07-12T00:00:00.000Z', access: ownerAccess,
  calendars: [{ id: 'calendar-route', academy_id: academyId, name: 'Academic year', starts_on: '2026-01-01', ends_on: '2026-12-31', status: 'active' }],
  calendar_events: [{ id: 'calendar-event-route', academy_id: academyId, calendar_id: 'calendar-route', event_type: 'holiday', name: 'Public holiday', starts_at: '2026-08-31T19:00:00.000Z', ends_at: '2026-09-01T19:00:00.000Z', affects_schedule: true }],
  staff_availability: [], room_availability: [],
  sessions: [{ id: 'session-route', academy_id: academyId, branch_id: 'branch-main', classroom_id: classroomId, room_id: 'room-101', primary_staff_id: 'staff-route', calendar_id: 'calendar-route', title: 'IELTS lesson 12', session_type: 'regular', delivery_mode: 'physical', starts_at: '2026-07-14T12:00:00.000Z', ends_at: '2026-07-14T13:30:00.000Z', timezone: 'Asia/Tashkent', status: 'confirmed', cancellation_reason: null, rescheduled_to_session_id: null, metadata: {}, created_at: '2026-07-12T00:00:00.000Z', updated_at: '2026-07-12T00:00:00.000Z' }],
  session_staff_assignments: [],
  attendance: [{ id: 'attendance-route', academy_id: academyId, classroom_id: classroomId, contact_id: studentContactId, session_id: 'session-route', session_date: '2026-07-14', status: 'present', notes: null, marked_at: '2026-07-14T12:05:00.000Z' }],
  attendance_exceptions: [], make_up_lessons: [],
  quality_reviews: [{ id: 'quality-route', academy_id: academyId, session_id: 'session-route', review_type: 'observation', score: 88, improvements: 'Increase student talk time', action_required: true }],
  room_capacity: [{ academy_id: academyId, room_id: 'room-101', branch_id: 'branch-main', name: 'Room 101', capacity: 14, occupied_minutes: 90, available_minutes: 540, unused_minutes: 450, utilization_percent: 16.67 }],
  room_peak_periods: [{ academy_id: academyId, room_id: 'room-101', day_of_week: 2, hour_of_day: 12, session_count: 1, occupied_minutes: 90 }],
  classroom_capacity: [{ academy_id: academyId, classroom_id: classroomId, name: 'IELTS Evening A', student_capacity: 12, enrolled_students: 1, fill_percent: 8.33, attendance_rate: 100 }],
  branches: [{ id: 'branch-main', name: 'Main branch', currency: 'UZS', is_active: true }],
  rooms: [{ id: 'room-101', branch_id: 'branch-main', name: 'Room 101', capacity: 14, is_active: true }],
  classrooms: [{ id: classroomId, name: 'IELTS Evening A', is_active: true, student_capacity: 12 }],
  staff: [{ id: 'staff-route', email: 'teacher@example.test', display_name: 'Teacher One', role: 'teacher', classroom_ids: [classroomId], is_active: true }],
  classroom_memberships: [{ classroom_id: classroomId, contact_id: studentContactId, role: 'student', status: 'active' }],
  contacts: [{ id: studentContactId, first_name: 'Ali', last_name: 'Karimov', email: 'ali@example.test', status: 'active' }],
};

const guardianRelationships = {
  generated_at: '2026-07-12T00:00:00.000Z', access: ownerAccess, guardians: [guardianProfile],
  relationships: [guardianRelationship], consents: [{ id: 'guardian-consent-route-smoke', relationship_id: guardianRelationship.id, consent_type: 'telegram_link', decision: 'granted', created_at: '2026-07-10T09:00:00.000Z' }],
  link_tokens: [], preferences: [{ id: 'guardian-preference-route-smoke', guardian_id: guardianProfile.id, event_type: '*', telegram_enabled: true, inapp_enabled: true, quiet_hours_start: '22:00', quiet_hours_end: '07:00' }],
  messages: [{ id: 'guardian-message-route-smoke', relationship_id: guardianRelationship.id, direction: 'academy_to_guardian', channel: 'inapp', body: 'Ali is making good progress.', status: 'sent', created_at: '2026-07-11T09:00:00.000Z' }],
  delivery_attempts: [{ id: 'guardian-attempt-route-smoke', notification_id: 'guardian-notification-route-smoke', attempt_number: 1, status: 'sent', provider: 'telegram', channel: 'telegram', attempted_at: '2026-07-11T09:01:00.000Z' }],
  notifications: [{ id: 'guardian-notification-route-smoke', guardian_id: guardianProfile.id, relationship_id: guardianRelationship.id, event_key: 'student_absent', channel: 'telegram', scheduled_at: '2026-07-11T09:00:00.000Z', status: 'sent', attempts: 1, error: null }],
  contacts: [{ id: studentContactId, first_name: 'Ali', last_name: 'Karimov', email: 'ali@example.test', phone: '+998900000000', status: 'active' }],
};

const guardianDashboard = {
  guardians: [guardianProfile], preferences: guardianRelationships.preferences, notifications: guardianRelationships.notifications,
  children: [{
    academy_id: academyId, relationship_id: guardianRelationship.id, relationship_type: 'mother', is_primary_contact: true, is_financially_responsible: true,
    permissions: { status: true, attendance: true, grades: true, homework: true, schedule: true, payments: true, debt: true, messages: true, progress_reports: true, resources: true, announcements: true, message_academy: true },
    student: { id: studentContactId, name: 'Ali Karimov', status: 'active', placement_level: 'B2', placement_score: 72 },
    classrooms: [classroom], attendance: [{ id: 'guardian-attendance-route-smoke', session_date: '2026-07-11', status: 'present', notes: null }],
    grades: [{ id: 'guardian-grade-route-smoke', score: 84, feedback: 'Strong evidence use.', status: 'graded' }],
    homework: [{ id: assignment.id, title: assignment.title, due_at: assignment.due_at, status: assignment.status }],
    schedule: [{ id: 'guardian-session-route-smoke', title: 'IELTS lesson', starts_at: '2026-07-20T09:00:00.000Z', delivery_mode: 'in_person', status: 'scheduled' }],
    charges: [{ id: 'guardian-charge-route-smoke', charge_number: 'INV-2026-07', due_on: '2026-07-15', effective_amount: 500000, outstanding_amount: 150000, currency: 'UZS', calculated_status: 'partially_paid' }],
    balances: [{ currency: 'UZS', balance: 150000 }], messages: guardianRelationships.messages, announcements: [], resources: [], progress_reports: [],
  }],
};

const businessIntelligence = {
  generated_at: '2026-07-12T00:00:00.000Z', access: ownerAccess,
  owner: { active_students: 1, high_risk_evaluations: 1, open_interventions: 1, open_renewals: 1, collected_amount: 500000, outstanding_debt: 150000, open_leads: 1, conversions: 1, open_actions: 2, overdue_actions: 1 },
  dashboard: { active_students: 1, new_students: 1, active_leads: 1, conversions: 1, collected_revenue: 500000, outstanding_amount: 150000, pending_actions: 2, high_risk_students: 1 },
  branches: [{ branch_id: 'branch-route-smoke', name: 'Main Branch', active_students: 1, active_subscriptions: 1, collected_amount: 500000, collected_revenue: 500000, outstanding_amount: 150000, attendance_percent: 91, contribution: 300000, open_interventions: 1, open_actions: 2 }],
  metric_definitions: [{ metric_key: 'active_students', version: 1, name_i18n: { en: 'Active students' }, formula: 'Active memberships', unit: 'count' }],
  marketing_attribution: [{ source_id: 'source-instagram', campaign_id: 'campaign-august', leads: 5, trials: 3, students: 1, lead_to_student_percent: 20, attributed_revenue: 500000 }],
  unit_economics: [{ entity_id: classroomId, entity_name: 'IELTS Evening A', active_students: 1, fill_percent: 10, generated_revenue: 500000, teacher_cost: 200000, contribution: 300000, revenue_per_student: 500000 }],
  teacher_performance: [{ staff_id: 'teacher-staff', staff_name: 'Teacher User', completed_sessions: 4, delivered_minutes: 360, attendance_percent: 91, average_grade_percent: 82 }], staff_performance: [],
  student_intelligence: [{ contact_id: studentContactId, student_name: 'Ali Karimov', lifecycle_stage: 'learning', attendance_30d_percent: 91, academic_90d_percent: 82, outstanding_balance: 150000, latest_risk_level: 'high', open_actions: 1, open_interventions: 1 }],
  lifecycle_events: [{ id: 'lifecycle-event-1', event_key: 'learning.grade_recorded', contact_id: studentContactId, source_table: 'academy_submissions', source_id: 'submission-1', occurred_at: '2026-07-12T00:00:00.000Z' }],
  risk_definitions: [{ id: 'risk-definition-route-smoke', definition_key: 'standard_retention', name: 'Standard retention risk', version: 1, status: 'active' }],
  risk_evaluations: [{ id: 'risk-evaluation-route-smoke', contact_id: studentContactId, risk_level: 'high', score: 74, summary: 'Explainable attendance, homework, debt, and engagement factors.' }],
  risk_signals: [{ id: 'risk-signal-route-smoke', evaluation_id: 'risk-evaluation-route-smoke', signal_key: 'attendance', contribution: 20, explanation: 'Absence share' }],
  interventions: [{ id: 'intervention-route-smoke', contact_id: studentContactId, risk_evaluation_id: 'risk-evaluation-route-smoke', status: 'open', priority: 'high', next_follow_up_at: '2026-07-14T09:00:00.000Z', outcome: null }],
  intervention_activities: [], renewals: [{ id: 'renewal-route-smoke', contact_id: studentContactId, renewal_due_on: '2026-08-01', status: 'contacting', likelihood: 70, expected_amount: 500000, currency: 'UZS', next_action_at: '2026-07-15T09:00:00.000Z' }], renewal_activities: [],
  actions: [{ id: 'action-route-smoke', contact_id: studentContactId, priority: 'high', category: 'retention', title: 'Retention risk requires intervention', recommended_action: 'Contact learner and record outcome.', assigned_to: null, sla_due_at: '2026-07-14T09:00:00.000Z', status: 'open', outcome: null }],
  import_jobs: [{ id: 'import-route-smoke', import_type: 'contacts', source_filename: 'learners.csv', status: 'ready', total_rows: 1, valid_rows: 1, invalid_rows: 0, committed_rows: 0 }],
  import_rows: [{ id: 'import-row-route-smoke', import_job_id: 'import-route-smoke', row_number: 1, validation_status: 'valid', validation_errors: [], target_id: null }], import_effects: [],
  contacts: [{ id: studentContactId, first_name: 'Ali', last_name: 'Karimov', email: 'ali@example.test', phone: '+998900000000', status: 'active' }], staff: [], subscriptions: commercialCore.subscriptions,
  campaigns: [], localization: { default_locale: 'uz', supported_locales: ['uz','ru','en'], timezone: 'Asia/Tashkent', currency: 'UZS', phone_country_code: '+998', date_format: 'DD.MM.YYYY', time_format: '24h' }, translations: [],
  automation_versions: [], automation_executions: [], automation_effects: [], ai_requests: [], ai_reviews: [],
};

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

const seedSessionCookie = async (page: Page, userId: string) => {
  const session = {
    access_token: 'route-smoke-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'route-smoke-refresh-token',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: `${userId}@example.test`,
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00.000Z',
    },
  };
  await page.context().addCookies([{
    name: 'schood-auth',
    value: encodeURIComponent(JSON.stringify(session)),
    domain: '127.0.0.1',
    path: '/',
    httpOnly: false,
    sameSite: 'Lax',
  }]);
};

const mockAcademyEdge = async (page: Page, persona: Persona) => {
  await page.route('**/functions/v1/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const fn = url.pathname.split('/').pop();

    if (fn === 'me') {
      const role = persona === 'owner' ? 'owner' : persona === 'teacher' ? 'teacher' : persona === 'guardian' ? 'guardian' : 'student';
      return route.fulfill(json({
        user: { id: `${persona}-user`, email: `${persona}@example.test`, role },
        current_tenant: { id: academyId, name: 'Route Smoke Academy', slug: 'route-smoke', type: 'team', metadata: { service_family: 'academy' } },
        memberships: persona === 'student' || persona === 'guardian'
          ? []
          : [{ tenant_id: academyId, role, status: 'active', tenants: [{ id: academyId, type: 'team', metadata: { service_family: 'academy' } }] }],
      }));
    }

    const body = route.request().postDataJSON() as { action?: string; academy_id?: string } | null;
    const action = body?.action ?? '';

    const actionResponse: Record<string, unknown> = {
      academies: { academies: [academy(persona)] },
      summary: { academy_id: academyId, access: persona === 'owner' ? ownerAccess : teacherAccess, counts: { contacts: 1, classrooms: 1, offers: 1, active_entitlements: 1, open_alerts: 0 } },
      contacts: { contacts: [contact] },
      classrooms: { classrooms: [classroom] },
      'classroom-memberships': { classroom_memberships: [membership] },
      conversations: { conversations: [] },
      messages: { messages: [] },
      announcements: { announcements: [] },
      alerts: { alerts: [] },
      offers: { offers: [{ id: 'offer-route-smoke', academy_id: academyId, name: 'Monthly IELTS', type: 'cohort', price_amount: 500000, currency: 'UZS', duration_days: 30, description: 'Monthly access', is_active: true, metadata: {}, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }] },
      'offer-grants': { offer_grants: [] },
      payments: { payments: [{ id: 'payment-route-smoke', academy_id: academyId, contact_id: studentContactId, offer_id: 'offer-route-smoke', provider: 'click', provider_transaction_id: 'click-route-smoke', amount: 500000, currency: 'UZS', status: 'pending', metadata: { platform_payment_id: 'platform-route-smoke' }, created_by: 'owner-user', created_at: '2026-07-12T00:00:00.000Z', updated_at: '2026-07-12T00:00:00.000Z' }] },
      entitlements: { entitlements: studentDashboard.entitlements },
      education_os: { ...educationOS, access: persona === 'owner' ? ownerAccess : teacherAccess },
      business_foundation: businessFoundation,
      commercial_core: commercialCore,
      operations_finance: operationsFinance,
      academic_operations: academicOperations,
      guardian_relationships: guardianRelationships,
      guardian_dashboard: guardianDashboard,
      business_intelligence: businessIntelligence,
      global_search: { results: [{ result_type: 'contact', result_id: studentContactId, label: 'Ali Karimov', context: 'ali@example.test' }] },
      assignments: { assignments: [assignment] },
      gradebook: { classroom_id: classroomId, assignments: [assignment], grade_categories: [gradeCategory], rows: [] },
      attendance: { attendance: [] },
      schedule: { schedule: [] },
      bulk_invites: { bulk_invites: [] },
      curriculum: { courses: [course], modules: [courseModule], lessons: [lesson], classroom_courses: [{ id: 'classroom-course-route-smoke', academy_id: academyId, classroom_id: classroomId, course_id: course.id, status: 'active', starts_at: null, ends_at: null, assigned_at: '2026-07-01T09:00:00.000Z' }] },
      quizzes: { quizzes: [quiz], questions: [quizQuestion] },
      grade_categories: { grade_categories: [gradeCategory] },
      rubrics: { rubrics: [rubric] },
      quiz_attempts: { quiz_attempts: [] },
      'student-feed': { messages: [], alerts: [], announcements: [] },
      'student-dashboard': studentDashboard,
      'classroom-chat': { academy_id: academyId, classroom, viewer: { type: persona === 'student' ? 'student' : 'teacher', role: persona === 'student' ? 'student' : 'teacher', contact_id: persona === 'student' ? studentContactId : null, display_name: persona, can_manage_resources: persona !== 'student' }, members: [membership], resources: [{ id: 'resource-route-smoke', academy_id: academyId, classroom_id: classroomId, title: 'Essay checklist', kind: 'asset', url: 'https://example.test/checklist.pdf', description: 'Checklist', metadata: {}, sort_order: 1, is_published: true, created_by: 'teacher-user', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }], progress: { viewer_completed_resource_ids: [], resource_completed_counts: {}, total_members: 1 }, messages: [], announcements: [] },
      student_assignments: { academy_id: academyId, contact_id: studentContactId, assignments: [{ ...assignment, submission: null }] },
      student_attendance: { attendance: [] },
      student_billing: {
        items: [],
        accounts: [{
          academy_id: academyId,
          contact_id: studentContactId,
          subscriptions: commercialCore.subscriptions,
          charges: commercialCore.charges,
          ledger_entries: commercialCore.ledger_entries,
          balances: commercialCore.account_balances,
        }],
      },
      student_curriculum: { academy_id: academyId, classroom_id: classroomId, contact_id: studentContactId, courses: [course], modules: [courseModule], lessons: [lesson], progress: [], quizzes: [quiz], questions: [quizQuestion], attempts: [], classroom_courses: [{ id: 'classroom-course-route-smoke', academy_id: academyId, classroom_id: classroomId, course_id: course.id, status: 'active', starts_at: null, ends_at: null, assigned_at: '2026-07-01T09:00:00.000Z' }] },
    };

    if (action in actionResponse) return route.fulfill(json(actionResponse[action]));
    return route.fulfill(json({}));
  });
};

test.describe('Academy routed workspaces with mocked Edge responses', () => {
  test('owner can open the administrator route and see finance controls', async ({ page }) => {
    await seedSessionCookie(page, 'owner-user');
    await mockAcademyEdge(page, 'owner');

    await page.goto(`/academy/admin/payments?academy_id=${academyId}`);

    await expect(page.getByText('Academy Admin')).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Payments$/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Create Click checkout/i })).toBeVisible();
    await expect(page.getByRole('table').getByText('Awaiting Click')).toBeVisible();
  });

  test('teacher route opens LMS surfaces without finance controls', async ({ page }) => {
    await seedSessionCookie(page, 'teacher-user');
    await mockAcademyEdge(page, 'teacher');

    await page.goto(`/academy/teacher?academy_id=${academyId}`);

    await expect(page).toHaveURL(/\/academy\/teacher\/classrooms/);
    await expect(page.getByText('Teacher Workspace')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: /^My LMS classes$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'IELTS Evening A' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Payments$/i })).toHaveCount(0);
  });

  test('owner can run admissions pipeline and branch operations', async ({ page }) => {
    await seedSessionCookie(page, 'owner-user');
    await mockAcademyEdge(page, 'owner');

    await page.goto(`/academy/admin/business?academy_id=${academyId}`);

    await expect(page.getByRole('heading', { name: 'Admissions and branches' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Capture lead' })).toBeVisible();
    await expect(page.getByLabel('Admissions pipeline').getByText('Madina Lead')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Branches & rooms' })).toBeVisible();
    await page.getByRole('tab', { name: 'Branches & rooms' }).click();
    await expect(page.getByRole('heading', { name: 'Add branch' })).toBeVisible();
    await expect(page.getByText('Room 101 · 14')).toBeVisible();
  });

  test('admissions critical flows remain usable on a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSessionCookie(page, 'owner-user');
    await mockAcademyEdge(page, 'owner');

    await page.goto(`/academy/admin/business?academy_id=${academyId}`);
    await expect(page.getByRole('heading', { name: 'Capture lead' })).toBeVisible();
    await expect(page.getByLabel('Admissions pipeline')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.getByRole('tab', { name: 'Trials' }).click();
    await expect(page.getByRole('heading', { name: 'Schedule trial' })).toBeVisible();
  });

  test('owner can operate the commercial core without conflating payments and charges', async ({ page }) => {
    await seedSessionCookie(page, 'owner-user');
    await mockAcademyEdge(page, 'owner');

    await page.goto(`/academy/admin/commercial?academy_id=${academyId}`);
    await expect(page.getByRole('heading', { name: 'Commercial core' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Balances and aging' })).toBeVisible();
    await expect(page.getByText('150,000 UZS').first()).toBeVisible();
    await page.getByRole('button', { name: 'Plans & agreements' }).click();
    await expect(page.getByRole('heading', { name: 'Create pricing plan' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Create subscription' })).toBeVisible();
    await page.getByRole('button', { name: 'Charges & allocation' }).click();
    await expect(page.getByRole('heading', { name: 'Issue charge' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Apply payment to charge' })).toBeVisible();
  });

  test('owner can operate cashier, contribution economics, and payroll snapshots', async ({ page }) => {
    await seedSessionCookie(page, 'owner-user');
    await mockAcademyEdge(page, 'owner');

    await page.goto(`/academy/admin/operations?academy_id=${academyId}`);
    await expect(page.getByRole('heading', { name: 'Cashier, economics, and payroll' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Open cashier shift' })).toBeVisible();
    await page.getByRole('button', { name: 'Unit economics' }).click();
    await expect(page.getByRole('heading', { name: 'Branch contribution — not profit' })).toBeVisible();
    await page.getByRole('button', { name: 'Payroll', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Compensation rule' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Payroll periods and immutable snapshots' })).toBeVisible();
  });

  test('owner can operate actual sessions, attendance exceptions, and capacity', async ({ page }) => {
    await seedSessionCookie(page, 'owner-user');
    await mockAcademyEdge(page, 'owner');

    await page.goto(`/academy/admin/academic?academy_id=${academyId}`);
    await expect(page.getByRole('heading', { name: 'Sessions, attendance, capacity, and quality' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Create actual lesson session' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Session register' })).toBeVisible();
    await expect(page.getByRole('table').getByRole('cell', { name: 'Room 101' })).toBeVisible();
    await page.getByRole('button', { name: 'Attendance & exceptions' }).click();
    await expect(page.getByRole('heading', { name: 'Record session attendance' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Approve attendance exception' })).toBeVisible();
    await page.getByRole('button', { name: 'Capacity', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Available, occupied, unused, and peak periods' })).toBeVisible();
    await expect(page.getByText('16.67%')).toBeVisible();
  });

  test('teacher can author structured curriculum and native assessments', async ({ page }) => {
    await seedSessionCookie(page, 'teacher-user');
    await mockAcademyEdge(page, 'teacher');

    await page.goto(`/academy/teacher/os?academy_id=${academyId}`);
    await expect(page.getByRole('heading', { name: 'Education OS' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh OS' })).toBeEnabled();
    await page.getByRole('button', { name: 'Learning' }).click();

    await expect(page.getByRole('heading', { name: 'Curriculum and assessments' })).toBeVisible();
    await expect(page.getByLabel('Course workspace')).toHaveValue(course.id);
    await expect(page.getByText('Structured IELTS course')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Native quizzes' })).toBeVisible();
    await expect(page.getByLabel('Assignment course')).toBeVisible();
    await expect(page.getByLabel('Grade category').getByRole('option', { name: /Coursework/ })).toBeAttached();
    await expect(page.getByLabel('Assignment rubric').getByRole('option', { name: 'Writing quality' })).toBeAttached();
    await expect(page.getByText('Writing quality rubric')).toBeVisible();
    await expect(page.getByText('Evidence · max 6')).toBeVisible();
  });

  test('student route opens linked classroom workspace', async ({ page }) => {
    await seedSessionCookie(page, 'student-user');
    await mockAcademyEdge(page, 'student');

    await page.goto(`/academy/student/classrooms?academy_id=${academyId}`);

    await expect(page.getByText('Student Workplace')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: /^Classrooms$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open student view' })).toBeVisible();
  });

  test('student can open an assigned course and its assessment', async ({ page }) => {
    await seedSessionCookie(page, 'student-user');
    await mockAcademyEdge(page, 'student');

    await page.goto(`/academy/student/classrooms/${classroomId}?academy_id=${academyId}`);
    await expect(page.getByRole('heading', { name: 'IELTS Evening A' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    await page.getByRole('button', { name: 'Courses' }).click();

    await expect(page.getByRole('heading', { name: 'IELTS Foundation' })).toBeVisible();
    await expect(page.getByText('Finding evidence')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start quiz' })).toBeVisible();
  });

  test('student can inspect a real commercial account without reconciliation data', async ({ page }) => {
    await seedSessionCookie(page, 'student-user');
    await mockAcademyEdge(page, 'student');

    await page.goto(`/academy/student/classrooms/${classroomId}?academy_id=${academyId}`);
    await page.getByRole('button', { name: 'Billing', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Billing statement' })).toBeVisible();
    await expect(page.getByText('Outstanding balance', { exact: true })).toBeVisible();
    await expect(page.getByText('INV-2026-07')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Payments and credits' })).toBeVisible();
    await expect(page.getByText('provider matched')).toHaveCount(0);
  });

  test('owner can manage explicit guardian consent and delivery evidence', async ({ page }) => {
    await seedSessionCookie(page, 'owner-user');
    await mockAcademyEdge(page, 'owner');

    await page.goto(`/academy/admin/relationships?academy_id=${academyId}`);
    await expect(page.getByRole('heading', { name: 'Guardians, consent, and parent communication' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Add authorized contact' })).toBeVisible();
    await expect(page.getByText(/Malika Karimova.*mother of Ali Karimov/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Issue secure link/i })).toBeVisible();
    await page.getByRole('button', { name: 'Delivery evidence' }).click();
    await expect(page.getByRole('heading', { name: 'Retry-safe notification outbox' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Immutable delivery attempts' })).toBeVisible();
  });

  test('guardian sees only consented child information in the parent portal', async ({ page }) => {
    await seedSessionCookie(page, 'guardian-user');
    await mockAcademyEdge(page, 'guardian');

    await page.goto('/academy/parent');
    await expect(page.getByText('Parent Portal', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ali Karimov' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Grades & homework' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Payments' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Privacy boundary' })).toBeVisible();
    await expect(page.getByText(/Provider reconciliation, payroll, internal staff notes/i)).toBeVisible();
    await page.getByRole('button', { name: 'Attendance' }).click();
    await expect(page.getByRole('table').getByText('present')).toBeVisible();
  });

  test('owner can turn explainable risk into intervention, renewal, and SLA work', async ({ page }) => {
    await seedSessionCookie(page, 'owner-user');
    await mockAcademyEdge(page, 'owner');

    await page.goto(`/academy/admin/intelligence?academy_id=${academyId}`);
    await expect(page.getByRole('heading', { name: 'Retention, renewal, and owner intelligence' })).toBeVisible();
    await expect(page.getByText('500,000 UZS').first()).toBeVisible();
    await page.getByRole('button', { name: 'Retention', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Versioned risk definition' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Risk evidence' })).toBeVisible();
    await expect(page.getByText(/Ali Karimov.*high.*74\/100/i)).toBeVisible();
    await page.getByRole('button', { name: 'Action queue' }).click();
    await expect(page.getByRole('heading', { name: 'Unified SLA-aware action queue' })).toBeVisible();
    await expect(page.getByText('Retention risk requires intervention')).toBeVisible();
    await page.getByRole('button', { name: 'Imports' }).click();
    await expect(page.getByRole('heading', { name: 'Governed CSV/XLSX migration' })).toBeVisible();
    await page.getByText('Or paste CSV data').click();
    await page.getByRole('button', { name: 'Load pasted CSV' }).click();
    await expect(page.getByRole('heading', { name: 'Column mapping' })).toBeVisible();
    await expect(page.getByText('Source preview — first five rows')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Row validation evidence' })).toBeVisible();
  });

  test('owner can inspect the end-to-end business platform and governed controls', async ({ page }) => {
    await seedSessionCookie(page, 'owner-user');
    await mockAcademyEdge(page, 'owner');
    await page.goto(`/academy/admin/platform?academy_id=${academyId}`);
    await expect(page.getByRole('heading', { name: 'Education business platform' })).toBeVisible();
    await expect(page.getByText('Main Branch')).toBeVisible();
    await page.getByRole('button', { name: /Student journey/ }).click();
    await expect(page.getByRole('heading', { name: 'Immutable lifecycle trail' })).toBeVisible();
    await page.getByRole('button', { name: /Economics/ }).click();
    await expect(page.getByRole('heading', { name: 'Classroom unit economics' })).toBeVisible();
    await page.getByRole('button', { name: /AI assistant/ }).click();
    await expect(page.getByRole('heading', { name: 'Human review queue' })).toBeVisible();
  });

  test('teacher is blocked from administrator-only route', async ({ page }) => {
    await seedSessionCookie(page, 'teacher-user');
    await mockAcademyEdge(page, 'teacher');

    await page.goto(`/academy/admin/payments?academy_id=${academyId}`);

    await expect(page.getByRole('heading', { name: /Role workspace access required/i })).toBeVisible();
    await expect(page.getByText(/does not have administrator controls/i)).toBeVisible();
  });
});
