import {academyDispatchedWriteActions} from './lib/academy-read-action-contract.mjs';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const distDir = join(root, 'apps/academy/dist');
const assetDir = join(distDir, 'assets');
const maxChunkBytes = 500 * 1024;
const checks = [];
const errors = [];

const read = (file) => readFileSync(join(root, file), 'utf8');
const safeRead = (file) => (existsSync(join(root, file)) ? read(file) : '');

const addCheck = (label, pass, detail = '') => {
  checks.push({ label, pass, detail });
  if (!pass) errors.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const includesAll = (content, tokens) => tokens.every((token) => content.includes(token));
const liveRequired = process.argv.includes('--live') || process.env.ACADEMY_SMOKE_REQUIRE_LIVE === '1';
const requireStudentEnrollment = liveRequired || process.env.ACADEMY_SMOKE_REQUIRE_STUDENT === '1';

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

const livePost = async (edgeUrl, token, payload) => {
  const response = await fetch(edgeUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  return { response, body, raw };
};

const authBaseUrlFromEdgeUrl = (edgeUrl) => {
  const configured = process.env.ACADEMY_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  try {
    const parsed = new URL(edgeUrl);
    const match = parsed.hostname.match(/^([^.]+)\.supabase\.co$/);
    if (match) return `https://${match[1]}.supabase.co`;
  } catch {
    return '';
  }
  return '';
};

const signInSmokeUser = async (edgeUrl, email, password, label) => {
  const authBaseUrl = authBaseUrlFromEdgeUrl(edgeUrl);
  const anonKey = process.env.ACADEMY_SUPABASE_ANON_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();
  if (!authBaseUrl || !anonKey || !email || !password) return '';

  const response = await fetch(`${authBaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok || !isRecord(body) || typeof body.access_token !== 'string') {
    addCheck(`Live Academy Edge smoke: ${label} credential sign-in`, false, `status ${response.status}${raw ? ` body ${raw.slice(0, 300)}` : ''}`);
    return '';
  }
  addCheck(`Live Academy Edge smoke: ${label} credential sign-in`, true);
  return body.access_token;
};

const liveGetText = async (url) => {
  const response = await fetch(url, { method: 'GET' });
  const raw = await response.text();
  return { response, raw };
};

const addLiveResponseCheck = (label, result, validate) => {
  const okStatus = result.response.status >= 200 && result.response.status < 300;
  const validBody = okStatus && isRecord(result.body) && validate(result.body);
  addCheck(label, okStatus && validBody, `status ${result.response.status}${result.raw ? ` body ${result.raw.slice(0, 300)}` : ''}`);
  return okStatus && validBody;
};

const addLiveTextCheck = (label, result, validate) => {
  const okStatus = result.response.status >= 200 && result.response.status < 300;
  const validBody = okStatus && validate(result.raw);
  addCheck(label, okStatus && validBody, `status ${result.response.status}${result.raw ? ` body ${result.raw.slice(0, 300)}` : ''}`);
  return okStatus && validBody;
};

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
const studentClassroomView = safeRead('apps/academy/src/components/students/StudentClassroomView.tsx');
const studentCurriculumView = safeRead('apps/academy/src/components/students/StudentCurriculumView.tsx');
const paymentsView = safeRead('apps/academy/src/components/office/PaymentsView.tsx');
const academyEdge = safeRead('supabase/functions/academy/index.ts');
const runbook = safeRead('ACADEMY_OPERATIONS_RUNBOOK.md');
const routeSpec = safeRead('apps/academy/tests/academy-routes.spec.ts');
const academyContractTest = safeRead('supabase/functions/academy/academy-contract.test.ts');

addCheck('Academy dist exists', existsSync(distDir));
addCheck('Academy dist index exists', existsSync(join(distDir, 'index.html')));
addCheck('Academy dist assets exist', existsSync(assetDir));

if (existsSync(assetDir)) {
  const assets = readdirSync(assetDir);
  const jsAssets = assets.filter((file) => file.endsWith('.js'));
  const cssAssets = assets.filter((file) => file.endsWith('.css'));
  addCheck('Academy build has JS assets', jsAssets.length > 0);
  addCheck('Academy build has CSS assets', cssAssets.length > 0);
  addCheck('Academy build splits React vendor chunk', jsAssets.some((file) => file.includes('react-vendor')));
  addCheck('Academy build splits Supabase vendor chunk', jsAssets.some((file) => file.includes('supabase-vendor')));

  for (const asset of jsAssets) {
    const size = statSync(join(assetDir, asset)).size;
    addCheck(`Academy JS chunk under 500 KiB: ${asset}`, size <= maxChunkBytes, `${size} bytes`);
  }
}

const workflowContracts = [
  {
    label: 'Owner finance reconciliation workflow',
    content: paymentsView,
    tokens: ['Awaiting Click', 'Cash or bank payment', 'Needs attention', 'Payment is recorded as paid. Check learning access separately.', 'Canceled checkout', 'Repeated payment confirmation', 'Payment received, access needs review', 'Provider'],
  },
  {
    label: 'Teacher LMS assignment drilldown workflow',
    content: educationOsView,
    tokens: ['Assignment detail', 'Open linked task', 'Missing', 'Submitted', 'Late', 'Graded', 'Open file'],
  },
  {
    label: 'Teacher curriculum and native assessment workflow',
    content: `${curriculumView}\n${academyClient}\n${academyEdge}`,
    tokens: ['Curriculum and assessments', 'Create course', 'Add module', 'Add lesson', 'Native quizzes', 'Grade categories', 'Rubrics', 'upsert_course', 'upsert_quiz_question'],
  },
  {
    label: 'Student structured course and quiz workflow',
    content: `${studentCurriculumView}\n${studentClassroomView}\n${academyClient}\n${academyEdge}`,
    tokens: ['course-progress', 'Mark complete', 'Start quiz', 'Submit quiz', 'student_curriculum', 'set_lesson_progress', 'submit_quiz'],
  },
  {
    label: 'Admissions, trial, conversion, branch, and room workflow',
    content: `${businessFoundationView}\n${academyClient}\n${academyEdge}`,
    tokens: ['Capture lead', 'Record follow-up', 'Schedule trial', 'Complete trial', 'Convert to student', 'Add branch', 'Add physical room', 'business_foundation', 'convert_lead'],
  },
  {
    label: 'Commercial agreements, ledger, allocation, debt, and reconciliation workflow',
    content: `${commercialCoreView}\n${academyClient}\n${academyEdge}`,
    tokens: ['Commercial core', 'Create pricing plan', 'Create subscription', 'Manage agreement', 'Issue charge', 'Apply payment to charge', 'Record payment promise', 'Account ledger', 'Record reconciliation', 'commercial_core', 'allocate_payment', 'manage_subscription'],
  },
  {
    label: 'Cashier, expense, contribution, compensation, and payroll workflow',
    content: `${operationsFinanceView}\n${academyClient}\n${academyEdge}`,
    tokens: ['Open cashier shift','Record cash movement','Close and reconcile','Record expense','Create operating budget','Branch contribution — not profit','Compensation rule','Record delivered lesson','Calculate','Approve','Mark paid','operations_finance','calculate_payroll'],
  },
  {
    label: 'Actual session, conflict, attendance exception, capacity, and quality workflow',
    content: `${academicOperationsView}\n${academyClient}\n${academyEdge}`,
    tokens: ['Schedule a lesson','Update a lesson','Assign substitute','Academic calendar','Teacher or room availability','Record session attendance','Approve attendance exception','Make-up, transfer, extension, or credit','Quality observation','Available, occupied, unused, and peak periods','academic_operations','create_lesson_session'],
  },
  {
    label: 'Guardian consent, secure linking, parent privacy, and notification evidence workflow',
    content: `${guardianRelationshipsView}\n${guardianPortalView}\n${academyClient}\n${academyEdge}`,
    tokens: ['Guardians, consent, and parent communication','Issue secure link','Connect with your child’s academy','Your academy controls which information is shared with you.','Retry-safe notification outbox','Immutable delivery attempts','guardian_relationships','guardian_dashboard','guardian_claim_link','queue_guardian_notification'],
  },
  {
    label: 'Explainable retention, renewal, owner KPI, unified action, search, and import workflow',
    content: `${intelligenceOperationsView}\n${academyClient}\n${academyEdge}`,
    tokens: ['When to flag a student','Evaluate and explain','Add follow-up','Follow-up results','Create renewal opportunity','Tasks and deadlines','Permission-filtered global search','Import from Excel or CSV','Match columns','Source preview','business_intelligence','evaluate_retention_risk','commit_import_job'],
  },
  {
    label: 'Student daily classroom workflow',
    content: studentClassroomView,
    tokens: ['Next best actions', 'Resources', 'Assignments', 'Grades', 'Attendance', 'Billing', 'Billing statement', 'Outstanding balance', 'Payments and credits', 'Chat'],
  },
  {
    label: 'Storage-backed resource and submission workflow',
    content: `${academyClient}\n${academyApp}\n${studentClassroomView}\n${academyEdge}`,
    tokens: ['invokeEdgeForm', 'teacherStudioUploadClassroomResource', 'teacherStudioSubmitStudentAssignmentFile', 'uploadAcademyFile', 'metadata.storage', 'signStorageRef'],
  },
  {
    label: 'Audit trail workflow',
    content: `${academyEdge}\n${educationOsView}`,
    tokens: ['academy_audit_events', 'audit_events', 'viewAudit', 'Audit trail'],
  },
  {
    label: 'Runbook covers production operations',
    content: runbook,
    tokens: ['Payment Reconciliation', 'Notification Dispatch', 'At-Risk Scan', 'Storage Uploads', 'Post-Deploy Smoke', 'Rollback'],
  },
  {
    label: 'Mocked browser route workflow',
    content: routeSpec,
    tokens: [
      'owner can open the administrator route',
      'teacher route opens an action-first teaching day',
      'student route opens a focused learning day',
      'teacher is blocked from administrator-only route',
      'owner can manage explicit guardian consent',
      'guardian sees only consented child information',
      'owner can turn explainable risk into intervention',
    ],
  },
  {
    label: 'Edge action permission contract workflow',
    content: academyContractTest,
    tokens: [
      'create_payment',
      'mark_payment_paid',
      'create_assignment',
      'grade_submission',
      'mark_attendance',
      'upsert_staff',
      'dispatch_notifications',
      'generate_parent_report',
      'create_guardian_relationship',
      'queue_guardian_notification',
      'evaluate_retention_risk',
      'commit_import_job',
    ],
  },
  {
    label: 'Strict live production smoke workflow',
    content: safeRead('package.json') + '\n' + safeRead('scripts/smoke-academy-product.mjs') + '\n' + runbook,
    tokens: [
      'smoke:academy:live',
      'ACADEMY_EDGE_URL',
      'ACADEMY_SMOKE_EMAIL',
      'ACADEMY_SMOKE_PASSWORD',
      'ACADEMY_SMOKE_TOKEN',
      'ACADEMY_STUDENT_SMOKE_EMAIL',
      'ACADEMY_STUDENT_SMOKE_PASSWORD',
      'ACADEMY_STUDENT_SMOKE_TOKEN',
      'ACADEMY_APP_URL',
      'student token has an academy enrollment',
    ],
  },
];

for (const contract of workflowContracts) {
  addCheck(contract.label, includesAll(contract.content, contract.tokens), `missing one of: ${contract.tokens.join(', ')}`);
}

const requiredEdgeActions = [
  'academies',
  'summary',
  'education_os',
  'owner_dashboard',
  'payments',
  'assignments',
  'gradebook',
  'attendance',
  'audit_events',
  'business_foundation',
  'commercial_core',
  'operations_finance',
  'academic_operations',
  'guardian_relationships',
  'guardian_dashboard',
  'guardian_claim_link',
  'guardian_update_preferences',
  'guardian_send_message',
  'business_intelligence',
  'global_search',
  'curriculum',
  'quizzes',
  'grade_categories',
  'rubrics',
  'quiz_attempts',
  'student-dashboard',
  'student_curriculum',
  'set_lesson_progress',
  'start_quiz',
  'submit_quiz',
  'student_assignments',
  'student_attendance',
  'student_billing',
  'submit_assignment',
  'classroom-chat',
  'classroom-resource-upsert',
  'classroom-resource-progress-set',
  'mark_payment_paid',
  'dispatch_notifications',
  'generate_parent_report',
  'upsert_course',
  'publish_course',
  'assign_course',
  'move_course_version',
  'upsert_module',
  'upsert_lesson',
  'upsert_quiz',
  'upsert_quiz_question',
  'upsert_grade_category',
  'upsert_rubric',
  'grade_quiz_attempt',
  'set_enrollment_status',
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
  'upsert_renewal_opportunity','record_renewal_activity','update_operational_action','create_import_job','add_import_row','commit_import_job','rollback_import_job',
  'convert_lead_full','upsert_campaign','upsert_localization','upsert_staff_branch_assignment',
  'create_automation_version','execute_automation_event','review_automation_execution','request_ai_assistance','review_ai_assistance',
];

const dispatchedWrites=academyDispatchedWriteActions(academyEdge,{'./staff-guardian-command.ts':read('supabase/functions/academy/staff-guardian-command.ts'),'./operational-command.ts':read('supabase/functions/academy/operational-command.ts'),'./grading-command.ts':read('supabase/functions/academy/grading-command.ts')});
for (const action of requiredEdgeActions) {
  addCheck(`Academy Edge action contract includes ${action}`, dispatchedWrites.has(action)||academyEdge.includes(`"${action}"`)||academyEdge.includes(`'${action}'`));
}

const liveEdgeUrl = process.env.ACADEMY_EDGE_URL?.trim();
let smokeToken = process.env.ACADEMY_SMOKE_TOKEN?.trim() || '';
let studentSmokeToken = process.env.ACADEMY_STUDENT_SMOKE_TOKEN?.trim() || '';
const liveAppUrl = process.env.ACADEMY_APP_URL?.trim() || 'https://academy.schood.online';
if (liveRequired) {
  try {
    const appShell = await liveGetText(liveAppUrl);
    addLiveTextCheck(
      'Live Academy app smoke: production app shell',
      appShell,
      (html) => html.includes('<title>Academy | Schood</title>') && html.includes('id="root"'),
    );
  } catch (error) {
    addCheck('Live Academy app smoke: production app shell', false, error instanceof Error ? error.message : String(error));
  }
}
if (liveEdgeUrl && !smokeToken) {
  smokeToken = await signInSmokeUser(
    liveEdgeUrl,
    process.env.ACADEMY_SMOKE_EMAIL?.trim(),
    process.env.ACADEMY_SMOKE_PASSWORD?.trim(),
    'owner',
  );
}
if (liveEdgeUrl && !studentSmokeToken) {
  studentSmokeToken = await signInSmokeUser(
    liveEdgeUrl,
    process.env.ACADEMY_STUDENT_SMOKE_EMAIL?.trim() || process.env.ACADEMY_SMOKE_EMAIL?.trim(),
    process.env.ACADEMY_STUDENT_SMOKE_PASSWORD?.trim() || process.env.ACADEMY_SMOKE_PASSWORD?.trim(),
    'student',
  );
}
if (!studentSmokeToken) studentSmokeToken = smokeToken;
if (liveEdgeUrl && smokeToken) {
  try {
    const academiesResult = await livePost(liveEdgeUrl, smokeToken, { action: 'academies' });
    const academiesOk = addLiveResponseCheck(
      'Live Academy Edge smoke: academies',
      academiesResult,
      (body) => Array.isArray(body.academies) && body.academies.length > 0,
    );

    const academyId =
      process.env.ACADEMY_SMOKE_ACADEMY_ID?.trim() ||
      (academiesOk ? String(academiesResult.body.academies[0]?.id ?? '') : '');
    addCheck('Live Academy Edge smoke: academy id discovered', academyId.length > 0);

    if (academyId) {
      const classroomsResult = await livePost(liveEdgeUrl, smokeToken, {
        action: 'classrooms',
        academy_id: academyId,
      });
      const classroomsOk = addLiveResponseCheck(
        'Live Academy Edge smoke: classrooms',
        classroomsResult,
        (body) => Array.isArray(body.classrooms),
      );
      const ownerClassroomId = classroomsOk
        ? String(classroomsResult.body.classrooms[0]?.id ?? '')
        : '';
      addCheck('Live Academy Edge smoke: classroom id discovered', ownerClassroomId.length > 0);

      const ownerChecks = [
        {
          action: 'summary',
          payload: { action: 'summary', academy_id: academyId },
          validate: (body) => isRecord(body.counts),
        },
        {
          action: 'payments',
          payload: { action: 'payments', academy_id: academyId },
          validate: (body) => Array.isArray(body.payments),
        },
        {
          action: 'education_os',
          payload: { action: 'education_os', academy_id: academyId },
          validate: (body) =>
            isRecord(body.today) ||
            Array.isArray(body.action_items) ||
            Array.isArray(body.action_queue) ||
            Array.isArray(body.classrooms) ||
            Array.isArray(body.assignments) ||
            Array.isArray(body.audit_events),
        },
        {
          action: 'notifications',
          payload: { action: 'notifications', academy_id: academyId },
          validate: (body) => Array.isArray(body.notifications),
        },
        {
          action: 'audit_events',
          payload: { action: 'audit_events', academy_id: academyId },
          validate: (body) => Array.isArray(body.audit_events),
        },
        {
          action: 'curriculum',
          payload: { action: 'curriculum', academy_id: academyId },
          validate: (body) =>
            Array.isArray(body.courses) &&
            Array.isArray(body.modules) &&
            Array.isArray(body.lessons) &&
            Array.isArray(body.classroom_courses),
        },
        {
          action: 'business_foundation',
          payload: { action: 'business_foundation', academy_id: academyId },
          validate: (body) =>
            Array.isArray(body.branches) &&
            Array.isArray(body.sources) &&
            Array.isArray(body.stages) &&
            Array.isArray(body.leads) &&
            Array.isArray(body.activities) &&
            Array.isArray(body.trials) &&
            Array.isArray(body.conversions),
        },
        {
          action: 'commercial_core',
          payload: { action: 'commercial_core', academy_id: academyId },
          validate: (body) =>
            Array.isArray(body.pricing_plans) &&
            Array.isArray(body.subscriptions) &&
            Array.isArray(body.charges) &&
            Array.isArray(body.payments) &&
            Array.isArray(body.allocations) &&
            Array.isArray(body.ledger_entries) &&
            Array.isArray(body.account_balances) &&
            Array.isArray(body.debt_cases) &&
            Array.isArray(body.reconciliations),
        },
      ];

      for (const check of ownerChecks) {
        const result = await livePost(liveEdgeUrl, smokeToken, check.payload);
        addLiveResponseCheck(`Live Academy Edge smoke: ${check.action}`, result, check.validate);
      }

      if (ownerClassroomId) {
        const gradeCategoriesResult = await livePost(liveEdgeUrl, smokeToken, {
          action: 'grade_categories',
          academy_id: academyId,
          classroom_id: ownerClassroomId,
        });
        addLiveResponseCheck(
          'Live Academy Edge smoke: grade_categories',
          gradeCategoriesResult,
          (body) => Array.isArray(body.grade_categories),
        );
      }
    }

    if (studentSmokeToken) {
      const studentResult = await livePost(liveEdgeUrl, studentSmokeToken, { action: 'student-dashboard' });
      const studentDashboardOk = addLiveResponseCheck(
        'Live Academy Edge smoke: student-dashboard',
        studentResult,
        (body) =>
          Array.isArray(body.academies) &&
          Array.isArray(body.contacts) &&
          Array.isArray(body.classrooms) &&
          Array.isArray(body.classroom_memberships),
      );
      const enrolledContacts = studentDashboardOk ? studentResult.body.contacts.length : 0;
      addCheck(
        'Live Academy Edge smoke: student token has an academy enrollment',
        !requireStudentEnrollment || enrolledContacts > 0,
        `contacts ${enrolledContacts}`,
      );
      const studentMembership = studentDashboardOk
        ? studentResult.body.classroom_memberships[0]
        : undefined;
      const studentAcademyId = String(studentMembership?.academy_id ?? '');
      const studentClassroomId = String(studentMembership?.classroom_id ?? '');
      if (studentAcademyId && studentClassroomId) {
        const curriculumResult = await livePost(liveEdgeUrl, studentSmokeToken, {
          action: 'student_curriculum',
          academy_id: studentAcademyId,
          classroom_id: studentClassroomId,
        });
        addLiveResponseCheck(
          'Live Academy Edge smoke: student_curriculum',
          curriculumResult,
          (body) =>
            Array.isArray(body.courses) &&
            Array.isArray(body.modules) &&
            Array.isArray(body.lessons) &&
            Array.isArray(body.progress) &&
            Array.isArray(body.quizzes),
        );
      } else {
        addCheck('Live Academy Edge smoke: student curriculum scope discovered', !requireStudentEnrollment);
      }
    } else {
      addCheck('Live Academy Edge smoke: student token configured', !requireStudentEnrollment);
    }
  } catch (error) {
    addCheck('Live Academy Edge smoke failed before completing requests', false, error instanceof Error ? error.message : String(error));
  }
} else if (liveRequired) {
  addCheck(
    'Live Academy Edge smoke env configured',
    false,
    'ACADEMY_EDGE_URL plus ACADEMY_SMOKE_TOKEN or ACADEMY_SMOKE_EMAIL/ACADEMY_SMOKE_PASSWORD are required',
  );
} else {
  addCheck('Live Academy Edge smoke skipped without ACADEMY_EDGE_URL and owner token or credentials', true);
}

for (const check of checks) {
  console.log(`${check.pass ? 'ok' : 'fail'} - ${check.label}${check.detail && !check.pass ? ` (${check.detail})` : ''}`);
}

if (errors.length > 0) {
  console.error('\nAcademy smoke checks failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`\nAcademy smoke checks passed (${checks.length} checks).`);
}
