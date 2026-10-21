import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isFullAcademyRouteCommand } from './academy-route-command.mjs';
import { academyDispatchedReadActions,academyDispatchedWriteActions } from './lib/academy-read-action-contract.mjs';

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), 'utf8');

const requiredFiles = [
  'ACADEMY_PRODUCT_READINESS.md',
  'ACADEMY_OPERATIONS_RUNBOOK.md',
  'ACADEMY_PRODUCTION_CUTOVER.md',
  'ACADEMY_SERVICE_MAP_AND_33_STEP_PROOF.md',
  'ACADEMY_BUSINESS_OS_REQUIREMENT_MATRIX.md',
  'ACADEMY_START.md',
  'ACADEMY_EDUCATION_BUSINESS_OS_AUDIT.md',
  'ACADEMY_TEACHER_LESSON_FLOW.md',
  'scripts/smoke-academy-product.mjs',
  'scripts/verify-academy-33-step-lifecycle.sql',
  'scripts/verify-academy-business-os-invariants.sql',
  'scripts/verify-academy-automation-worker.ts',
  'scripts/verify-academy-automation-worker.ps1',
  'scripts/verify-academy-automation-worker-fixture.sql',
  'scripts/check-academy-github-readiness.mjs',
  'apps/academy/src/App.tsx',
  'apps/academy/eslint.config.js',
  'apps/academy/playwright.config.ts',
  'apps/academy/tests/academy-routes.spec.ts',
  'apps/academy/src/lib/client.ts',
  'apps/academy/src/components/office/EducationOSView.tsx',
  'apps/academy/src/components/teachers/TeacherDayView.tsx',
  'apps/academy/src/components/office/CurriculumView.tsx',
  'apps/academy/src/components/office/BusinessFoundationView.tsx',
  'apps/academy/src/components/office/CommercialCoreView.tsx',
  'apps/academy/src/components/office/OperationsFinanceView.tsx',
  'apps/academy/src/components/office/AcademicOperationsView.tsx',
  'apps/academy/src/components/office/GuardianRelationshipsView.tsx',
  'apps/academy/src/components/guardians/GuardianPortalView.tsx',
  'apps/academy/src/components/office/IntelligenceOperationsView.tsx',
  'apps/academy/src/components/office/BusinessPlatformView.tsx',
  'apps/academy/src/components/office/PaymentsView.tsx',
  'apps/academy/src/components/students/StudentClassroomView.tsx',
  'apps/academy/src/components/students/StudentCurriculumView.tsx',
  'supabase/functions/academy/index.ts',
  'supabase/functions/academy/access.ts',
  'supabase/functions/academy/academy-contract.test.ts',
  'supabase/functions/academy/teacher-lesson-flow-schema-contract.test.ts',
  'supabase/functions/academy/curriculum-schema-contract.test.ts',
  'supabase/functions/academy/business-os-phase-a-schema-contract.test.ts',
  'supabase/functions/academy/business-os-phase-b-schema-contract.test.ts',
  'supabase/functions/academy/business-os-phase-c-schema-contract.test.ts',
  'supabase/functions/academy/business-os-phase-d-schema-contract.test.ts',
  'supabase/functions/academy/business-os-phase-e-schema-contract.test.ts',
  'supabase/functions/academy/business-os-phase-f-schema-contract.test.ts',
  'supabase/functions/academy/business-os-phase-g-schema-contract.test.ts',
  'supabase/functions/academy/business-os-phase-h-schema-contract.test.ts',
  'supabase/functions/academy/business-os-phase-i-schema-contract.test.ts',
  'supabase/functions/academy/business-os-phase-j-schema-contract.test.ts',
  'supabase/functions/academy/business-os-phase-k-schema-contract.test.ts',
  'supabase/functions/telegram-app/guardian-contract.test.ts',
  'supabase/functions/_shared/academy-curriculum.ts',
  'supabase/functions/_shared/academy-teacher-flow.ts',
  'supabase/functions/_shared/academy-curriculum.test.ts',
  'supabase/migrations/20260810120000_academy_curriculum_assessments.sql',
  'supabase/migrations/20260810130000_academy_business_os_phase_a.sql',
  'supabase/migrations/20260810140000_academy_business_os_phase_b.sql',
  'supabase/migrations/20260810150000_academy_business_os_phase_c.sql',
  'supabase/migrations/20260810160000_academy_business_os_phase_d.sql',
  'supabase/migrations/20260810170000_academy_business_os_phase_e.sql',
  'supabase/migrations/20260810180000_academy_business_os_phase_f.sql',
  'supabase/migrations/20260810190000_academy_business_os_phase_g.sql',
  'supabase/migrations/20260810200000_academy_business_os_phase_h.sql',
  'supabase/migrations/20260810210000_academy_business_os_phase_i.sql',
  'supabase/migrations/20260810220000_academy_tenant_integrity_completion.sql',
  'supabase/migrations/20260810230000_academy_lifecycle_automation_worker.sql',
  'supabase/migrations/20260810240000_academy_direct_rls_scope_boundary.sql',
  'supabase/migrations/20260901120000_academy_teacher_lesson_flow.sql',
  'supabase/functions/click/index.ts',
  '.github/workflows/deploy-pages.yml',
  '.github/workflows/academy-live-smoke.yml',
];

const errors = [];
const checks = [];

const addCheck = (label, pass, detail) => {
  checks.push({ label, pass, detail });
  if (!pass) errors.push(`${label}${detail ? `: ${detail}` : ''}`);
};
const includesAll = (content, tokens) => tokens.every((token) => content.includes(token));

for (const file of requiredFiles) {
  addCheck(`Required file exists: ${file}`, existsSync(join(root, file)));
}

const safeRead = (file) => (existsSync(join(root, file)) ? read(file) : '');
const academyEdge = safeRead('supabase/functions/academy/index.ts');
const academyAccess = safeRead('supabase/functions/academy/access.ts');
const clickFunction = safeRead('supabase/functions/click/handler.ts');
const academyClient = safeRead('apps/academy/src/lib/client.ts');
const academyApp = safeRead('apps/academy/src/App.tsx');
const educationOsView = safeRead('apps/academy/src/components/office/EducationOSView.tsx');
const curriculumView = safeRead('apps/academy/src/components/office/CurriculumView.tsx');
const businessFoundationView = safeRead('apps/academy/src/components/office/BusinessFoundationView.tsx');
const commercialCoreView = safeRead('apps/academy/src/components/office/CommercialCoreView.tsx');
const operationsFinanceView = safeRead('apps/academy/src/components/office/OperationsFinanceView.tsx');
const academicOperationsView = safeRead('apps/academy/src/components/office/AcademicOperationsView.tsx');
const guardianRelationshipsView = safeRead('apps/academy/src/components/office/GuardianRelationshipsView.tsx');
const guardianPortalView = safeRead('apps/academy/src/components/guardians/GuardianPortalView.tsx');
const intelligenceOperationsView = safeRead('apps/academy/src/components/office/IntelligenceOperationsView.tsx');
const businessPlatformView = safeRead('apps/academy/src/components/office/BusinessPlatformView.tsx');
const paymentsView = safeRead('apps/academy/src/components/office/PaymentsView.tsx');
const studentClassroomView = safeRead('apps/academy/src/components/students/StudentClassroomView.tsx');
const studentCurriculumView = safeRead('apps/academy/src/components/students/StudentCurriculumView.tsx');
const deployWorkflow = safeRead('.github/workflows/deploy-pages.yml');
const ciWorkflow = safeRead('.github/workflows/ci.yml');
const academyLiveSmokeWorkflow = safeRead('.github/workflows/academy-live-smoke.yml');
const operationsRunbook = safeRead('ACADEMY_OPERATIONS_RUNBOOK.md');
const productionCutover = safeRead('ACADEMY_PRODUCTION_CUTOVER.md');
const serviceMapProof = safeRead('ACADEMY_SERVICE_MAP_AND_33_STEP_PROOF.md');
const businessOsRequirementMatrix = safeRead('ACADEMY_BUSINESS_OS_REQUIREMENT_MATRIX.md');
const packageJson = JSON.parse(safeRead('package.json') || '{}');
const academyContractTest = safeRead('supabase/functions/academy/academy-contract.test.ts');
const curriculumSchemaContractTest = safeRead('supabase/functions/academy/curriculum-schema-contract.test.ts');
const businessOsSchemaContractTest = safeRead('supabase/functions/academy/business-os-phase-a-schema-contract.test.ts');
const commercialSchemaContractTest = safeRead('supabase/functions/academy/business-os-phase-b-schema-contract.test.ts');
const operationsSchemaContractTest = safeRead('supabase/functions/academy/business-os-phase-c-schema-contract.test.ts');
const academicOperationsSchemaContractTest = safeRead('supabase/functions/academy/business-os-phase-d-schema-contract.test.ts');
const guardianSchemaContractTest = safeRead('supabase/functions/academy/business-os-phase-e-schema-contract.test.ts');
const intelligenceSchemaContractTest = safeRead('supabase/functions/academy/business-os-phase-f-schema-contract.test.ts');
const lifecycleSchemaContractTest = safeRead('supabase/functions/academy/business-os-phase-g-schema-contract.test.ts');
const automationSchemaContractTest = safeRead('supabase/functions/academy/business-os-phase-h-schema-contract.test.ts');
const metricsSchemaContractTest = safeRead('supabase/functions/academy/business-os-phase-i-schema-contract.test.ts');
const automationWorkerSchemaContractTest = safeRead('supabase/functions/academy/business-os-phase-j-schema-contract.test.ts');
const directRlsScopeContractTest = safeRead('supabase/functions/academy/business-os-phase-k-schema-contract.test.ts');
const guardianTelegramContractTest = safeRead('supabase/functions/telegram-app/guardian-contract.test.ts');
const lifecycleRuntimeProof = safeRead('scripts/verify-academy-33-step-lifecycle.sql');
const businessInvariantProof = safeRead('scripts/verify-academy-business-os-invariants.sql');
const automationWorkerRuntimeProof = safeRead('scripts/verify-academy-automation-worker.ts');
const academySmoke = safeRead('scripts/smoke-academy-product.mjs');
const academyGithubReadiness = safeRead('scripts/check-academy-github-readiness.mjs');
const envExample = safeRead('.env.example');

addCheck(
  'Academy proof matrix covers exactly 33 numbered acceptance journeys',
  (serviceMapProof.match(/^\|\s*\d+\s*\|/gm) ?? []).length === 33 &&
    serviceMapProof.includes('production backend phase is deployed') &&
    serviceMapProof.includes('Production pending'),
);
addCheck(
  'Business OS matrix traces exactly 62 requirements and preserves the production boundary',
  (businessOsRequirementMatrix.match(/^\|\s*\d+\s*\|/gm) ?? []).length === 62 &&
    businessOsRequirementMatrix.includes('Production is unchanged') &&
    businessOsRequirementMatrix.includes('not a production-complete claim') &&
    businessOsRequirementMatrix.includes('EXTERNAL GATE'),
);

for (const signal of ['Education business platform','Student journey','Economics','People','Automations','AI assistant','Localization','Immutable lifecycle trail','Human review queue']) {
  addCheck(`Business Platform UI signal: ${signal}`, businessPlatformView.includes(signal));
}
addCheck('Phase G lifecycle contract covers conversion, localization, branch roles, and immutable evidence', lifecycleSchemaContractTest.includes('full learner operating journey') && lifecycleSchemaContractTest.includes('transactional and service-only'));
addCheck('Phase H automation/AI/import contract covers versioning, evidence, human review, and rollback', automationSchemaContractTest.includes('automation executions') && automationSchemaContractTest.includes('proposal-only') && automationSchemaContractTest.includes('rollback state'));
addCheck('Phase I metrics contract covers branch-aware search and governed business intelligence', metricsSchemaContractTest.includes('branch-aware') && metricsSchemaContractTest.includes('governed business metrics'));
addCheck('Phase J contract closes the lifecycle-to-worker automation loop', automationWorkerSchemaContractTest.includes('durable, idempotent Academy outbox event') && automationWorkerSchemaContractTest.includes('processes event rules'));
addCheck('Phase K contract denies academy-wide direct reads to scoped grants', directRlsScopeContractTest.includes('scoped grants') && directRlsScopeContractTest.includes("migration.match(/g\\.scope_type='academy'/g)"));
addCheck('Telegram Mini App contract includes verified guardian identity and per-domain privacy', guardianTelegramContractTest.includes('guardian-scoped academy sections') && guardianTelegramContractTest.includes('visibility flags'));
addCheck('Exact 33-step runtime proof asserts lifecycle, attribution, payroll, owner metrics, interventions, and renewal outcomes', includesAll(lifecycleRuntimeProof,['ACADEMY_33_STEP_LIFECYCLE_OK','v_required','academy_business_dashboard_v2','academy_lesson_deliveries','academy_intervention_activities','academy_renewal_activities','has_renewed','has_left']));
addCheck('Negative invariant proof covers cross-tenant FKs, RLS, state machines, money, payroll, guardian links, and scoped direct access', includesAll(businessInvariantProof,['ACADEMY_BUSINESS_OS_INVARIANTS_OK','cross-tenant classroom','Lead transition idempotency failed','Overpayment credit was not preserved','Payroll duplicate rows','reused guardian token','Academy tables without RLS','Scoped role received academy-wide direct table access']));
addCheck('Automation runtime proof asserts delivered event, execution, effect, and created task', includesAll(automationWorkerRuntimeProof,['ACADEMY_AUTOMATION_WORKER_OK','Lifecycle outbox event was not delivered','Automation execution did not succeed','Automation effect did not succeed','Automation action was not created']));

const migrationsDir = join(root, 'supabase/migrations');
const migrationSql = existsSync(migrationsDir)
  ? readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => readFileSync(join(migrationsDir, file), 'utf8'))
      .join('\n')
  : '';

const dispatchedReads = academyDispatchedReadActions(academyEdge);
const hasReadAction = (action) => dispatchedReads.has(action);

const hasStudentAction = (action) =>
  new RegExp(`requestedAction\\s*===\\s*"${action}"`).test(academyEdge);

const dispatchedWrites=academyDispatchedWriteActions(academyEdge,{'./staff-guardian-command.ts':read('supabase/functions/academy/staff-guardian-command.ts'),'./operational-command.ts':read('supabase/functions/academy/operational-command.ts'),'./grading-command.ts':read('supabase/functions/academy/grading-command.ts')});
const hasWriteAction = action=>dispatchedWrites.has(action);

const hasClientAction = (action) =>
  academyClient.includes(`action: '${action}'`) || academyClient.includes(`action: "${action}"`) ||
  academyClient.includes(`academyId,'${action}'`) || academyClient.includes(`academyId, "${action}"`) ||
  (['guardian_dashboard','guardian_claim_link','guardian_service_requests','guardian_history','guardian_send_message','guardian_update_preferences','guardian_service_request_create'].includes(action) &&
    academyClient.includes(`>('','${action}',`) &&
    safeRead('apps/academy/src/lib/parentRequest.ts').includes(action==='guardian_claim_link'?"'guardian_link_command'":['guardian_send_message','guardian_update_preferences','guardian_service_request_create'].includes(action)?"'guardian_portal_write_command'":"'guardian_portal_read_command'"));

const hasClientWritePath = (action) => {
  if (action === 'create_payment') {
    return hasClientAction(action) || academyClient.includes("'click/create-transaction'") || academyClient.includes('"click/create-transaction"');
  }
  return hasClientAction(action);
};

const requiredReadActions = [
  'academies',
  'summary',
  'contacts',
  'classrooms',
  'classroom-memberships',
  'announcements',
  'alerts',
  'offers',
  'payments',
  'assignments',
  'gradebook',
  'attendance',
  'staff',
  'owner_dashboard',
  'education_os',
  'business_foundation',
  'commercial_core',
  'operations_finance',
  'academic_operations',
  'guardian_relationships',
  'business_intelligence',
  'global_search',
  'schedule',
  'notifications',
  'audit_events',
  'branding',
  'curriculum',
  'quizzes',
  'grade_categories',
  'rubrics',
  'quiz_attempts',
  'teacher_day',
];

for (const action of requiredReadActions) {
  addCheck(`Academy Edge read action: ${action}`, hasReadAction(action));
  addCheck(`Academy client calls read action: ${action}`, hasClientAction(action));
}

const requiredStudentActions = [
  'student-dashboard',
  'classroom-chat',
  'classroom-chat-send',
  'classroom-resource-progress-set',
  'student_assignments',
  'student_attendance',
  'submit_assignment',
  'student_billing',
  'student_curriculum',
  'set_lesson_progress',
  'start_quiz',
  'submit_quiz',
  'guardian_dashboard',
  'guardian_claim_link',
  'guardian_update_preferences',
  'guardian_send_message',
];

for (const action of requiredStudentActions) {
  addCheck(`Academy Edge student action: ${action}`, hasStudentAction(action));
  addCheck(`Academy client calls student action: ${action}`, hasClientAction(action));
}

const requiredWriteActions = [
  'teacher_lesson_start',
  'teacher_lesson_attendance',
  'teacher_lesson_finish',
  'create_academy',
  'update_academy_landing',
  'upsert_contact',
  'create_classroom',
  'upsert_classroom_membership',
  'send_announcement',
  'create_alert',
  'resolve_alert',
  'create_offer',
  'upsert_offer_grant',
  'create_payment',
  'mark_payment_paid',
  'create_assignment',
  'update_assignment',
  'grade_submission',
  'mark_attendance',
  'bulk_invite',
  'upsert_schedule',
  'delete_schedule',
  'upsert_staff',
  'remove_staff',
  'issue_academy_certificate',
  'compute_at_risk',
  'dispatch_notifications',
  'generate_parent_report',
  'upsert_branding',
  'upsert_course',
  'publish_course',
  'assign_course',
  'upsert_module',
  'upsert_lesson',
  'upsert_quiz',
  'upsert_quiz_question',
  'upsert_grade_category',
  'upsert_rubric',
  'grade_quiz_attempt',
  'set_enrollment_status',
  'upsert_branch',
  'upsert_room',
  'create_lead',
  'transition_lead',
  'record_lead_activity',
  'schedule_trial',
  'set_trial_status',
  'convert_lead',
  'create_pricing_plan',
  'create_subscription',
  'manage_subscription',
  'create_charge',
  'allocate_payment',
  'post_account_adjustment',
  'record_payment_reconciliation',
  'record_payment_promise',
  'create_cashbox','open_cashier_shift','record_cash_movement','close_cashier_shift',
  'upsert_expense_category','record_expense','upsert_budget','upsert_compensation_rule',
  'record_lesson_delivery','create_payroll_period','calculate_payroll','post_payroll_adjustment','transition_payroll',
  'upsert_academic_calendar','upsert_calendar_event','upsert_staff_availability','upsert_room_availability',
  'create_lesson_session','transition_lesson_session','assign_session_substitute','record_session_attendance',
  'record_attendance_exception','upsert_make_up_lesson','record_session_quality_review',
  'create_guardian_relationship','issue_guardian_link','revoke_guardian_relationship','upsert_guardian_preferences',
  'send_guardian_message','queue_guardian_notification',
  'upsert_risk_definition','evaluate_retention_risk','create_intervention','update_intervention','record_intervention_activity',
  'upsert_renewal_opportunity','record_renewal_activity','update_operational_action',
  'create_import_job','add_import_row','commit_import_job',
];

for (const action of requiredWriteActions) {
  addCheck(`Academy Edge write action: ${action}`, hasWriteAction(action));
  addCheck(`Academy client calls write path: ${action}`, hasClientWritePath(action));
}

const requiredTables = [
  'academy_contacts',
  'academy_classrooms',
  'academy_classroom_memberships',
  'academy_offers',
  'academy_offer_grants',
  'academy_payments',
  'academy_entitlements',
  'academy_assignments',
  'academy_submissions',
  'academy_attendance',
  'academy_teacher_lesson_runs',
  'academy_bulk_invites',
  'academy_classroom_schedules',
  'academy_notifications',
  'academy_staff',
  'academy_referrals',
  'academy_action_items',
  'academy_automation_rules',
  'academy_branding',
  'academy_audit_events',
  'academy_courses',
  'academy_course_modules',
  'academy_lessons',
  'academy_classroom_courses',
  'academy_lesson_progress',
  'academy_quizzes',
  'academy_quiz_questions',
  'academy_quiz_attempts',
  'academy_grade_categories',
  'academy_rubrics',
  'academy_branches',
  'academy_rooms',
  'academy_lead_sources',
  'academy_sales_pipelines',
  'academy_pipeline_stages',
  'academy_pipeline_transitions',
  'academy_leads',
  'academy_lead_stage_history',
  'academy_lead_activities',
  'academy_trial_lessons',
  'academy_lead_conversions',
  'academy_pricing_plans',
  'academy_subscriptions',
  'academy_subscription_freezes',
  'academy_pricing_adjustments',
  'academy_charges',
  'academy_payment_allocations',
  'academy_account_ledger_entries',
  'academy_debt_cases',
  'academy_payment_promises',
  'academy_collection_events',
  'academy_payment_reconciliations',
  'academy_cashboxes','academy_cashier_shifts','academy_cash_movements','academy_cash_reconciliations',
  'academy_expense_categories','academy_expenses','academy_budgets','academy_lesson_deliveries',
  'academy_compensation_rules','academy_payroll_periods','academy_payroll_rows','academy_payroll_row_components',
  'academy_payroll_adjustments','academy_payroll_payouts',
  'academy_academic_calendars','academy_calendar_events','academy_staff_availability','academy_room_availability',
  'academy_lesson_sessions','academy_session_staff_assignments','academy_attendance_exceptions','academy_make_up_lessons','academy_session_quality_reviews',
  'academy_guardians','academy_student_guardian_relationships','academy_guardian_consents','academy_guardian_link_tokens',
  'academy_guardian_notification_preferences','academy_guardian_messages','academy_notification_delivery_attempts',
  'academy_risk_definitions','academy_risk_evaluations','academy_risk_signals','academy_intervention_cases','academy_intervention_activities',
  'academy_renewal_opportunities','academy_renewal_activities','academy_import_jobs','academy_import_rows',
];

for (const table of requiredTables) {
  addCheck(`Academy table exists in migrations: ${table}`, migrationSql.includes(`public.${table}`));
  addCheck(
    `Academy table has RLS enabled: ${table}`,
    new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(migrationSql),
  );
}

addCheck(
  'Academy payment engine is idempotent',
  migrationSql.includes('public.apply_academy_payment') &&
    migrationSql.includes('academy_entitlements_payment_grant_unique') &&
    migrationSql.includes('payment_grant_key'),
);

addCheck(
  'Teacher lesson flow is replay-safe and closes attendance, curriculum, homework, and Telegram loops',
  includesAll(migrationSql, [
    'public.academy_start_teacher_lesson',
    'public.academy_record_teacher_attendance_batch',
    'public.academy_finish_teacher_lesson',
    'academy_assignments_teacher_lesson_run_uidx',
    "s.event_type = 'homework_published'",
  ]),
);

addCheck(
  'Academy scheduler has dispatch and at-risk cycles',
  migrationSql.includes('academy-dispatch-v1') &&
    migrationSql.includes("invoke_academy_worker('dispatch')") &&
    migrationSql.includes('academy-at-risk-v1') &&
    migrationSql.includes("invoke_academy_worker('at_risk')"),
);

const permissionMapRequired = [
  'manageFinance',
  'manageAssignments',
  'gradeSubmissions',
  'markAttendance',
  'manageSchedule',
  'manageAcademicOperations',
  'manageStaff',
  'issueCertificates',
  'dispatchNotifications',
  'viewReports',
  'viewAudit',
  'manageBranding',
  'viewBranches',
  'manageBranches',
  'viewAdmissions',
  'manageAdmissions',
  'manageTrialFeedback',
  'manageGuardians',
  'communicateGuardians',
  'manageRetention',
  'viewBusinessIntelligence',
  'manageImports',
];

for (const permission of permissionMapRequired) {
  addCheck(
    `Academy Edge permission referenced: ${permission}`,
    academyEdge.includes(`"${permission}"`) || academyAccess.includes(`${permission}:`),
  );
  addCheck(`Academy client access permission typed: ${permission}`, academyClient.includes(`${permission}?: boolean`));
}

const educationTabs = [
  'today',
  'pipeline',
  'automation',
  'calendar',
  'intelligence',
  'learning',
  'attendance',
  'growth',
  'engagement',
  'audit',
  'brand',
];

for (const tab of educationTabs) {
  addCheck(`Education OS tab exists: ${tab}`, educationOsView.includes(`'${tab}'`));
}

const studentTabs = ['overview', 'curriculum', 'resources', 'assignments', 'grades', 'attendance', 'billing', 'chat'];
for (const tab of studentTabs) {
  addCheck(`Student classroom tab exists: ${tab}`, studentClassroomView.includes(`'${tab}'`));
}

const studentFocusSignals = ['Next best actions', 'Overdue assignment', 'Tuition action', 'Continue learning', 'Teacher feedback'];
for (const signal of studentFocusSignals) {
  addCheck(`Student classroom exposes focus signal: ${signal}`, studentClassroomView.includes(signal));
}

const curriculumSignals = [
  'Curriculum and assessments',
  'Create course',
  'Add module',
  'Add lesson',
  'Native quizzes',
  'Grade categories',
  'Rubrics',
  'Quiz grading queue',
];
for (const signal of curriculumSignals) {
  addCheck(`Teacher curriculum UI signal: ${signal}`, curriculumView.includes(signal));
}

const businessFoundationSignals = [
  'Admissions and branches',
  'Capture lead',
  'Convert to student',
  'Record follow-up',
  'Schedule trial',
  'Complete trial',
  'Add branch',
  'Add physical room',
];
for (const signal of businessFoundationSignals) {
  addCheck(`Business OS Phase A UI signal: ${signal}`, businessFoundationView.includes(signal));
}

addCheck(
  'Business OS Phase A schema contract covers RLS, tenant FKs, state machines, idempotency, and localization',
  businessOsSchemaContractTest.includes('enables RLS on every tenant table') &&
    businessOsSchemaContractTest.includes('bind academy identity') &&
    businessOsSchemaContractTest.includes('require idempotency') &&
    businessOsSchemaContractTest.includes('reject arbitrary mutation') &&
    businessOsSchemaContractTest.includes('localization-ready'),
);

const commercialSignals = [
  'Commercial core', 'Create pricing plan', 'Create subscription', 'Issue charge',
  'Apply payment to charge', 'Record payment promise', 'Post adjustment',
  'Record reconciliation', 'Account ledger', 'Balances and aging', 'Manage agreement',
];
for (const signal of commercialSignals) {
  addCheck(`Business OS Phase B UI signal: ${signal}`, commercialCoreView.includes(signal));
}
addCheck(
  'Business OS Phase B schema contract covers RLS, tenant FKs, immutable history, payment bridging, commands, and balances',
  commercialSchemaContractTest.includes('enables RLS on every tenant financial table') &&
    commercialSchemaContractTest.includes('carry academy identity') &&
    commercialSchemaContractTest.includes('append-only') &&
    commercialSchemaContractTest.includes('one coherent commercial ledger') &&
    commercialSchemaContractTest.includes('service-only') &&
    commercialSchemaContractTest.includes('Subscription lifecycle') &&
    commercialSchemaContractTest.includes('charge aging'),
);

for (const signal of ['Cashier, economics, and payroll','Open cashier shift','Record cash movement','Close and reconcile shift','Record expense','Create operating budget','Branch contribution — not profit','Compensation rule','Record delivered lesson','Payroll periods and immutable snapshots']) {
  addCheck(`Business OS Phase C UI signal: ${signal}`, operationsFinanceView.includes(signal));
}
addCheck(
  'Business OS Phase C schema contract covers operational cash, structured compensation, immutable payroll, and contribution semantics',
  operationsSchemaContractTest.includes('operational finance and payroll tables') &&
    operationsSchemaContractTest.includes('structured formulas') &&
    operationsSchemaContractTest.includes('versioned calculation snapshots') &&
    operationsSchemaContractTest.includes('without claiming profit'),
);

for (const signal of ['Sessions, attendance, capacity, and quality','Schedule a lesson','Update a lesson','Assign substitute','Academic calendar','Teacher or room availability','Record session attendance','Approve attendance exception','Make-up, transfer, extension, or credit','Quality observation','Available, occupied, unused, and peak periods']) {
  addCheck(`Business OS Phase D UI signal: ${signal}`, academicOperationsView.includes(signal));
}
addCheck(
  'Business OS Phase D schema contract covers actual sessions, conflicts, attendance evidence, exceptions, quality, and capacity',
  academicOperationsSchemaContractTest.includes('teacher, room, and classroom conflicts') &&
    academicOperationsSchemaContractTest.includes('actual session and active enrollee') &&
    academicOperationsSchemaContractTest.includes('substitution, and quality evidence') &&
    academicOperationsSchemaContractTest.includes('room utilization and classroom fill'),
);

for (const signal of ['Guardians, consent, and parent communication','Create pending relationship','Issue secure link','Revoke','Messages & preferences','Retry-safe notification outbox','Immutable delivery attempts']) {
  addCheck(`Business OS Phase E relationship UI signal: ${signal}`, guardianRelationshipsView.includes(signal));
}
for (const signal of ['Parent Portal','An invitation is needed','Connect with your child’s academy','Grades & homework','Payments and debt','Your academy controls which information is shared with you.','Notification preferences']) {
  addCheck(`Business OS Phase E parent portal signal: ${signal}`, guardianPortalView.includes(signal));
}
addCheck(
  'Business OS Phase E schema contract covers consent, secure linking, visibility, preferences, immutable delivery, and guardian RLS',
  guardianSchemaContractTest.includes('stores only a hash') &&
    guardianSchemaContractTest.includes('per-domain visibility') &&
    guardianSchemaContractTest.includes('service-only commands') &&
    guardianSchemaContractTest.includes('retry-safe') &&
    guardianSchemaContractTest.includes('quiet hours') &&
    guardianSchemaContractTest.includes('active consented relationships'),
);

for (const signal of ['Students and follow-ups','When to flag a student','Evaluate and explain','Add follow-up','Follow-up results','Create renewal opportunity','Tasks and deadlines','Permission-filtered global search','Import from Excel or CSV','Match columns','Source preview','Rows to review']) {
  addCheck(`Business OS Phase F intelligence UI signal: ${signal}`, intelligenceOperationsView.includes(signal));
}
addCheck(
  'Business OS Phase F schema contract covers explainable risk, interventions, renewals, unified actions, owner KPIs, search, and imports',
  intelligenceSchemaContractTest.includes('versioned') && intelligenceSchemaContractTest.includes('attendance, homework, debt, and engagement') &&
    intelligenceSchemaContractTest.includes('Interventions and renewals') && intelligenceSchemaContractTest.includes('unified with branch, SLA') &&
    intelligenceSchemaContractTest.includes('Owner intelligence') && intelligenceSchemaContractTest.includes('Global search'),
);

const studentCurriculumSignals = ['course-progress', 'Mark complete', 'Start quiz', 'Submit quiz', 'lesson.locked'];
for (const signal of studentCurriculumSignals) {
  addCheck(`Student curriculum UI signal: ${signal}`, studentCurriculumView.includes(signal));
}

const storageSignals = [
  'teacherStudioUploadClassroomResource',
  'teacherStudioSubmitStudentAssignmentFile',
  'type="file"',
  'Open submitted file',
];
for (const signal of storageSignals) {
  addCheck(`Academy storage-backed UI signal: ${signal}`, academyClient.includes(signal) || academyApp.includes(signal) || studentClassroomView.includes(signal));
}

const financeSignals = [
  'Awaiting Click',
  'Cash or bank payment',
  'Needs attention',
  'Payment is recorded as paid. Check learning access separately.',
  'Canceled checkout',
  'Repeated payment confirmation',
  'Payment received, access needs review',
];
for (const signal of financeSignals) {
  addCheck(`Payments view exposes finance signal: ${signal}`, paymentsView.includes(signal));
}

addCheck(
  'Click webhook syncs provider status into Academy payments',
  clickFunction.includes('syncAcademyPaymentFromPlatformPayment') &&
    clickFunction.includes('provider_reconciled_at') &&
    clickFunction.includes('platform_grant_error') &&
    clickFunction.includes('click_payment_cancelled'),
);

const assignmentDetailSignals = ['Assignment detail', 'Open linked task', 'Missing', 'Submitted', 'Late', 'Graded'];
for (const signal of assignmentDetailSignals) {
  addCheck(`Education OS assignment detail signal: ${signal}`, educationOsView.includes(signal));
}

const competentAssignmentSignals = [
  'Assignment course',
  'Grade category',
  'Assignment rubric',
  'Assignment attempts',
  'allow_late_submission',
  'rubric_scores',
];
for (const signal of competentAssignmentSignals) {
  addCheck(`Education OS competent assignment signal: ${signal}`, educationOsView.includes(signal));
}

const auditActions = [
  'payment.manual_settlement_applied',
  'entitlement.manual_grant_created',
  'assignment.created',
  'assignment.updated',
  'assignment.submitted',
  'submission.graded',
  'attendance.marked',
  'staff.upserted',
  'staff.removed',
  'certificate.issued',
  'parent_report.generated',
  'course.created',
  'course.updated',
  'course.assigned',
  'course.published',
  'course.module_created',
  'course.lesson_created',
  'lesson.progress_changed',
  'quiz.created',
  'quiz.question_created',
  'quiz.attempt_submitted',
  'quiz.attempt_started',
  'quiz.attempt_graded',
  'grade_category.created',
  'rubric.created',
  'enrollment.status_changed',
];
addCheck('Academy Edge has audit logging helper', academyEdge.includes('logAcademyAuditEvent'));
addCheck('Academy audit trail is visible in Education OS', educationOsView.includes('Audit trail') && educationOsView.includes('teacherStudioAuditEvents'));
addCheck('Academy Edge supports storage-backed uploads', academyEdge.includes('uploadAcademyFile') && academyEdge.includes('signStorageRef') && academyEdge.includes('storagePlaceholderUrl'));
addCheck('Academy Edge enforces upload limits', academyEdge.includes('ACADEMY_FILE_MAX_BYTES') && academyEdge.includes('File exceeds 50 MiB limit'));
for (const action of auditActions) {
  const staffCommands = read('supabase/migrations/20261014120000_academy_staff_access_commands.sql')
    .replace(/--[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'');
  const staffAuditCase = staffCommands.match(/audit_action\s*:=\s*case\s+p_action\b[^;]+;/)?.[0] ?? '';
  const atomicStaffAudit = ['staff.upserted','staff.removed'].includes(action)
    && academyEdge.includes('await runAcademyStaffCommand(sb,userId,academyId,actionBody,body')
    && staffAuditCase.includes(`'${action}'`)
    && /insert into public\.academy_audit_events\([^;]+values\(p_academy_id,p_actor_id,audit_action,/.test(staffCommands);
  const assignmentCommands = read('supabase/migrations/20261020210000_academy_private_assignment_audio.sql');
  const atomicAssignmentAudit = action === 'assignment.submitted'
    && (academyEdge.includes('sb.rpc("academy_assignment_written_command",')||(academyEdge.includes("sb.rpc(requestKey?'academy_written_submission_command':'academy_assignment_written_command'")&&read('supabase/migrations/20261021012000_academy_written_submission_receipts.sql').includes('result:=public.academy_assignment_written_command(p_academy,p_actor,p_assignment,p_payload);')))
    && /insert into public\.academy_audit_events[^;]+'assignment\.submitted'/.test(assignmentCommands);
  const gradingCommands=read('supabase/migrations/20261021003000_academy_current_attempt_grading.sql');
  const atomicGradingAudit=action==='submission.graded'&&academyEdge.includes('await runGradingCommand(sb,academyId,userId,actionBody,body')
    &&read('supabase/functions/academy/grading-command.ts').includes("db.rpc('academy_grading_command'")
    &&/insert into public\.academy_audit_events[^;]+'submission\.graded'/.test(gradingCommands);
  addCheck(`Academy Edge emits audit action: ${action}`, academyEdge.includes(action)||atomicStaffAudit||atomicAssignmentAudit||atomicGradingAudit);
}

const runbookSections = [
  'Payment Reconciliation',
  'Commercial Agreements And Charges',
  'Ledger, Allocation, And Adjustments',
  'Debt And Payment Promises',
  'Provider Reconciliation Evidence',
  'Cashier Shift And Cashbox',
  'Expenses, Budgets, And Contribution',
  'Compensation And Payroll',
  'Academic Calendar, Sessions, And Conflict Recovery',
  'Attendance Exceptions, Make-ups, And Quality',
  'Guardian Onboarding, Consent, And Revocation',
  'Parent Notifications And Delivery Recovery',
  'Retention Risk And Intervention Loop',
  'Renewal And Unified Action Queue',
  'Global Search And Governed Imports',
  'Notification Dispatch',
  'At-Risk Scan',
  'Classroom Daily Run',
  'Curriculum Publishing',
  'Assessment And Gradebook',
  'Enrollment Lifecycle',
  'Storage Uploads',
  'Edge Function Deploy',
  'Migration Deploy',
  'Rollback',
];
for (const section of runbookSections) {
  addCheck(`Academy runbook section exists: ${section}`, operationsRunbook.includes(`## ${section}`));
}

const cutoverSections = [
  'Current External Gates',
  'Pre-Merge Evidence',
  'GitHub Setup',
  'Manual Supabase Deploy',
  'Production Deploy',
  'Live Smoke',
  'Operational Acceptance',
];
for (const section of cutoverSections) {
  addCheck(`Academy cutover section exists: ${section}`, productionCutover.includes(`## ${section}`));
}

addCheck(
  'Academy cutover records current live release gates',
  productionCutover.includes('ACADEMY_SMOKE_EMAIL') &&
    productionCutover.includes('ACADEMY_SMOKE_PASSWORD') &&
    productionCutover.includes('ACADEMY_SMOKE_TOKEN') &&
    productionCutover.includes('ACADEMY_STUDENT_SMOKE_EMAIL') &&
    productionCutover.includes('ACADEMY_STUDENT_SMOKE_PASSWORD') &&
    productionCutover.includes('ACADEMY_STUDENT_SMOKE_TOKEN') &&
    productionCutover.includes('Academy Live Smoke') &&
    productionCutover.includes('backend production phase completed on 2026-08-11') &&
    productionCutover.includes('all 303 public tables and all 110 Academy tables') &&
    productionCutover.includes('Academy Live Smoke run `31471104282` passed'),
);

addCheck(
  'Academy cutover requires backend deploy and live acceptance evidence',
  productionCutover.includes('supabase db push --linked') &&
    productionCutover.includes('supabase functions deploy academy') &&
    productionCutover.includes('supabase functions deploy telegram-app') &&
    productionCutover.includes('20260810240000_academy_direct_rls_scope_boundary.sql') &&
    productionCutover.includes('npm run smoke:academy:live') &&
    productionCutover.includes('Do not mark the goal complete'),
);

addCheck(
  'Academy app exposes owner/admin/teacher/center/student route intents',
  ['academy/admin', 'academy/teacher', 'academy/center', 'academy/student'].every((route) => academyApp.includes(route)),
);

addCheck(
  'Academy is deployed by Cloudflare Pages workflow',
  deployWorkflow.includes('workspace: apps/academy') &&
    deployWorkflow.includes('project: schood-academy') &&
    deployWorkflow.includes('https://academy.schood.online'),
);

addCheck(
  'Academy mocked route smoke script is registered',
  isFullAcademyRouteCommand(packageJson.scripts?.['test:academy:routes']) &&
    safeRead('apps/academy/package.json').includes('"test:routes": "playwright test -c playwright.config.ts"'),
);

addCheck(
  'Academy Edge contract test script is registered',
  String(packageJson.scripts?.['test:academy:edge'] ?? '').includes('deno test') &&
    String(packageJson.scripts?.['test:academy:edge'] ?? '').includes('--allow-env') &&
    String(packageJson.scripts?.['test:academy:edge'] ?? '').includes('--allow-read') &&
    String(packageJson.scripts?.['test:academy:edge'] ?? '').includes('supabase/functions/academy/academy-contract.test.ts') &&
    String(packageJson.scripts?.['test:academy:edge'] ?? '').includes('supabase/functions/academy/curriculum-schema-contract.test.ts') &&
    String(packageJson.scripts?.['test:academy:edge'] ?? '').includes('supabase/functions/academy/access-matrix.test.ts') &&
    academyContractTest.includes('ACADEMY_ACTION_PERMISSIONS') &&
    academyContractTest.includes('buildAcademyPermissions') &&
    academyContractTest.includes('validateAcademyUploadFile'),
);

addCheck(
  'Academy curriculum schema contract tests cover tenant isolation and answer-key privacy',
  curriculumSchemaContractTest.includes('tenant-scoped foreign keys') &&
    curriculumSchemaContractTest.includes('Quiz answer keys are not exposed'),
);

addCheck(
  'CI runs Academy readiness, lint, route, Edge contract, and smoke gates',
  ciWorkflow.includes('npm run verify:academy') &&
    ciWorkflow.includes('npm --workspace apps/academy run lint') &&
    ciWorkflow.includes('npx playwright install --with-deps chromium') &&
    ciWorkflow.includes('npm run test:academy:routes') &&
    ciWorkflow.includes('npm run test:academy:edge') &&
    ciWorkflow.includes('npm run smoke:academy') &&
    ciWorkflow.includes('deno check supabase/functions/academy/index.ts'),
);

addCheck(
  'Deploy workflow gates Academy route and Edge contract smoke before Cloudflare deploy',
  deployWorkflow.includes("matrix.label == 'academy'") &&
    deployWorkflow.includes('npm run verify:academy') &&
    deployWorkflow.includes('npm --workspace apps/academy run lint') &&
    deployWorkflow.includes('npx playwright install --with-deps chromium') &&
    deployWorkflow.includes('npm run test:academy:routes') &&
    deployWorkflow.includes('npm run test:academy:edge') &&
    deployWorkflow.includes('npm run smoke:academy') &&
    deployWorkflow.includes('deno check supabase/functions/academy/index.ts'),
);

addCheck(
  'npm script verify:academy is registered',
  packageJson.scripts?.['verify:academy'] === 'node scripts/verify-academy-product-readiness.mjs',
);

addCheck(
  'npm script smoke:academy is registered',
  packageJson.scripts?.['smoke:academy'] === 'node scripts/smoke-academy-product.mjs',
);

addCheck(
  'npm script smoke:academy:live is registered',
  packageJson.scripts?.['smoke:academy:live'] === 'node scripts/smoke-academy-product.mjs --live',
);

addCheck(
  'npm script check:academy:github is registered',
  packageJson.scripts?.['check:academy:github'] === 'node scripts/check-academy-github-readiness.mjs',
);

addCheck(
  'Academy live smoke requires and validates production Edge flows',
  academySmoke.includes('liveRequired') &&
    academySmoke.includes('ACADEMY_APP_URL') &&
    academySmoke.includes('production app shell') &&
    academySmoke.includes('ACADEMY_EDGE_URL') &&
    academySmoke.includes('ACADEMY_SMOKE_EMAIL') &&
    academySmoke.includes('ACADEMY_SMOKE_PASSWORD') &&
    academySmoke.includes('ACADEMY_SMOKE_TOKEN') &&
    academySmoke.includes('ACADEMY_STUDENT_SMOKE_EMAIL') &&
    academySmoke.includes('ACADEMY_STUDENT_SMOKE_PASSWORD') &&
    academySmoke.includes('ACADEMY_STUDENT_SMOKE_TOKEN') &&
    academySmoke.includes('credential sign-in') &&
    academySmoke.includes('academy id discovered') &&
    academySmoke.includes("action: 'summary'") &&
    academySmoke.includes("action: 'classrooms'") &&
    academySmoke.includes("action: 'payments'") &&
    academySmoke.includes("action: 'education_os'") &&
    academySmoke.includes("action: 'student-dashboard'") &&
    academySmoke.includes('student token has an academy enrollment') &&
    /action: 'grade_categories',\s+academy_id: academyId,\s+classroom_id: ownerClassroomId,/m.test(academySmoke) &&
    /action: 'student_curriculum',\s+academy_id: studentAcademyId,\s+classroom_id: studentClassroomId,/m.test(academySmoke),
);

addCheck(
  'Academy live smoke workflow runs after production deploy',
  academyLiveSmokeWorkflow.includes('workflow_run') &&
    academyLiveSmokeWorkflow.includes('workflows: ["Deploy Pages"]') &&
    academyLiveSmokeWorkflow.includes('workflow_dispatch') &&
    academyLiveSmokeWorkflow.includes('github.event.workflow_run.head_sha || github.sha') &&
    academyLiveSmokeWorkflow.includes('Verify Academy deploy job succeeded') &&
    academyLiveSmokeWorkflow.includes('DEPLOY_RUN_ID') &&
    academyLiveSmokeWorkflow.includes('schood-academy') &&
    academyLiveSmokeWorkflow.includes('Academy deploy job succeeded') &&
    academyLiveSmokeWorkflow.includes('Validate live smoke secrets') &&
    academyLiveSmokeWorkflow.includes('Missing required Academy live smoke secret') &&
    academyLiveSmokeWorkflow.includes('Missing owner smoke auth') &&
    academyLiveSmokeWorkflow.includes('Missing student smoke auth') &&
    academyLiveSmokeWorkflow.includes('ACADEMY_EDGE_URL') &&
    academyLiveSmokeWorkflow.includes('ACADEMY_SMOKE_EMAIL') &&
    academyLiveSmokeWorkflow.includes('ACADEMY_SMOKE_PASSWORD') &&
    academyLiveSmokeWorkflow.includes('ACADEMY_SMOKE_TOKEN') &&
    academyLiveSmokeWorkflow.includes('ACADEMY_STUDENT_SMOKE_EMAIL') &&
    academyLiveSmokeWorkflow.includes('ACADEMY_STUDENT_SMOKE_PASSWORD') &&
    academyLiveSmokeWorkflow.includes('ACADEMY_STUDENT_SMOKE_TOKEN') &&
    academyLiveSmokeWorkflow.includes('npm run smoke:academy:live'),
);

addCheck(
  'Academy live smoke env keys are documented without values',
  envExample.includes('ACADEMY_EDGE_URL=') &&
    envExample.includes('ACADEMY_SMOKE_TOKEN=') &&
    envExample.includes('ACADEMY_STUDENT_SMOKE_TOKEN=') &&
    envExample.includes('ACADEMY_SMOKE_EMAIL=') &&
    envExample.includes('ACADEMY_SMOKE_PASSWORD=') &&
    envExample.includes('ACADEMY_STUDENT_SMOKE_EMAIL=') &&
    envExample.includes('ACADEMY_STUDENT_SMOKE_PASSWORD=') &&
    envExample.includes('ACADEMY_SMOKE_ACADEMY_ID='),
);

addCheck(
  'Academy GitHub readiness checker verifies smoke secrets and deploy status',
  academyGithubReadiness.includes('ACADEMY_EDGE_URL') &&
    academyGithubReadiness.includes('ACADEMY_SMOKE_TOKEN') &&
    academyGithubReadiness.includes('ACADEMY_SMOKE_EMAIL') &&
    academyGithubReadiness.includes('ACADEMY_SMOKE_PASSWORD') &&
    academyGithubReadiness.includes('ACADEMY_STUDENT_SMOKE_TOKEN') &&
    academyGithubReadiness.includes('ACADEMY_STUDENT_SMOKE_EMAIL') &&
    academyGithubReadiness.includes('ACADEMY_STUDENT_SMOKE_PASSWORD') &&
    academyGithubReadiness.includes('GitHub owner smoke auth configured') &&
    academyGithubReadiness.includes('GitHub student smoke auth configured') &&
    academyGithubReadiness.includes('Academy Live Smoke') &&
    academyGithubReadiness.includes('deploy-pages.yml') &&
    academyGithubReadiness.includes('Latest Deploy Pages run succeeded') &&
    academyGithubReadiness.includes('Latest published Academy job succeeded') &&
    academyGithubReadiness.includes('schood-academy'),
);

for (const check of checks) {
  const status = check.pass ? 'ok' : 'fail';
  console.log(`${status} - ${check.label}${check.detail ? ` (${check.detail})` : ''}`);
}

if (errors.length) {
  console.error('\nAcademy product readiness checks failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`\nAcademy product readiness checks passed (${checks.length} checks).`);
