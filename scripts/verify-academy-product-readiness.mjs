import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), 'utf8');

const requiredFiles = [
  'ACADEMY_PRODUCT_READINESS.md',
  'ACADEMY_OPERATIONS_RUNBOOK.md',
  'ACADEMY_PRODUCTION_CUTOVER.md',
  'ACADEMY_START.md',
  'scripts/smoke-academy-product.mjs',
  'scripts/check-academy-github-readiness.mjs',
  'apps/academy/src/App.tsx',
  'apps/academy/eslint.config.js',
  'apps/academy/playwright.config.ts',
  'apps/academy/tests/academy-routes.spec.ts',
  'apps/academy/src/lib/client.ts',
  'apps/academy/src/components/office/EducationOSView.tsx',
  'apps/academy/src/components/office/PaymentsView.tsx',
  'apps/academy/src/components/students/StudentClassroomView.tsx',
  'supabase/functions/academy/index.ts',
  'supabase/functions/academy/academy-contract.test.ts',
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

for (const file of requiredFiles) {
  addCheck(`Required file exists: ${file}`, existsSync(join(root, file)));
}

const safeRead = (file) => (existsSync(join(root, file)) ? read(file) : '');
const academyEdge = safeRead('supabase/functions/academy/index.ts');
const clickFunction = safeRead('supabase/functions/click/index.ts');
const academyClient = safeRead('apps/academy/src/lib/client.ts');
const academyApp = safeRead('apps/academy/src/App.tsx');
const educationOsView = safeRead('apps/academy/src/components/office/EducationOSView.tsx');
const paymentsView = safeRead('apps/academy/src/components/office/PaymentsView.tsx');
const studentClassroomView = safeRead('apps/academy/src/components/students/StudentClassroomView.tsx');
const deployWorkflow = safeRead('.github/workflows/deploy-pages.yml');
const ciWorkflow = safeRead('.github/workflows/ci.yml');
const academyLiveSmokeWorkflow = safeRead('.github/workflows/academy-live-smoke.yml');
const operationsRunbook = safeRead('ACADEMY_OPERATIONS_RUNBOOK.md');
const productionCutover = safeRead('ACADEMY_PRODUCTION_CUTOVER.md');
const packageJson = JSON.parse(safeRead('package.json') || '{}');
const academyContractTest = safeRead('supabase/functions/academy/academy-contract.test.ts');
const academySmoke = safeRead('scripts/smoke-academy-product.mjs');
const academyGithubReadiness = safeRead('scripts/check-academy-github-readiness.mjs');
const envExample = safeRead('.env.example');

const migrationsDir = join(root, 'supabase/migrations');
const migrationSql = existsSync(migrationsDir)
  ? readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => readFileSync(join(migrationsDir, file), 'utf8'))
      .join('\n')
  : '';

const hasReadAction = (action) =>
  new RegExp(`if\\s*\\(\\s*action\\s*===\\s*"${action}"\\s*\\)`).test(academyEdge);

const hasStudentAction = (action) =>
  new RegExp(`requestedAction\\s*===\\s*"${action}"`).test(academyEdge);

const hasWriteAction = (action) =>
  new RegExp(`actionBody\\s*===\\s*"${action}"`).test(academyEdge);

const hasClientAction = (action) =>
  academyClient.includes(`action: '${action}'`) || academyClient.includes(`action: "${action}"`);

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
  'schedule',
  'notifications',
  'audit_events',
  'branding',
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
];

for (const action of requiredStudentActions) {
  addCheck(`Academy Edge student action: ${action}`, hasStudentAction(action));
  addCheck(`Academy client calls student action: ${action}`, hasClientAction(action));
}

const requiredWriteActions = [
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
  'academy_bulk_invites',
  'academy_classroom_schedules',
  'academy_notifications',
  'academy_staff',
  'academy_referrals',
  'academy_action_items',
  'academy_automation_rules',
  'academy_branding',
  'academy_audit_events',
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
  'manageStaff',
  'issueCertificates',
  'dispatchNotifications',
  'viewReports',
  'viewAudit',
  'manageBranding',
];

for (const permission of permissionMapRequired) {
  addCheck(`Academy Edge permission referenced: ${permission}`, academyEdge.includes(`"${permission}"`));
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

const studentTabs = ['overview', 'resources', 'assignments', 'grades', 'attendance', 'billing', 'chat'];
for (const tab of studentTabs) {
  addCheck(`Student classroom tab exists: ${tab}`, studentClassroomView.includes(`'${tab}'`));
}

const studentFocusSignals = ['Next best actions', 'Overdue assignment', 'Tuition action', 'Continue learning', 'Teacher feedback'];
for (const signal of studentFocusSignals) {
  addCheck(`Student classroom exposes focus signal: ${signal}`, studentClassroomView.includes(signal));
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
  'Manual settlement',
  'Needs attention',
  'Access applied',
  'Canceled checkout',
  'Duplicate callback',
  'Grant mismatch',
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

const auditActions = [
  'payment.manual_settlement_applied',
  'entitlement.manual_grant_created',
  'assignment.created',
  'submission.graded',
  'attendance.marked',
  'staff.upserted',
  'staff.removed',
  'certificate.issued',
  'parent_report.generated',
];
addCheck('Academy Edge has audit logging helper', academyEdge.includes('logAcademyAuditEvent'));
addCheck('Academy audit trail is visible in Education OS', educationOsView.includes('Audit trail') && educationOsView.includes('teacherStudioAuditEvents'));
addCheck('Academy Edge supports storage-backed uploads', academyEdge.includes('uploadAcademyFile') && academyEdge.includes('signStorageRef') && academyEdge.includes('storagePlaceholderUrl'));
addCheck('Academy Edge enforces upload limits', academyEdge.includes('ACADEMY_FILE_MAX_BYTES') && academyEdge.includes('File exceeds 50 MiB limit'));
for (const action of auditActions) {
  addCheck(`Academy Edge emits audit action: ${action}`, academyEdge.includes(action));
}

const runbookSections = [
  'Payment Reconciliation',
  'Notification Dispatch',
  'At-Risk Scan',
  'Classroom Daily Run',
  'Storage Uploads',
  'Edge Function Deploy',
  'Migration Deploy',
  'Rollback',
];
for (const section of runbookSections) {
  addCheck(`Academy runbook section exists: ${section}`, operationsRunbook.includes(`## ${section}`));
}

const cutoverSections = [
  'Current External Blockers',
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
  'Academy cutover lists live proof blockers',
  productionCutover.includes('ACADEMY_EDGE_URL') &&
    productionCutover.includes('ACADEMY_SMOKE_TOKEN') &&
    productionCutover.includes('ACADEMY_STUDENT_SMOKE_TOKEN') &&
    productionCutover.includes('Academy Live Smoke') &&
    productionCutover.includes('Latest `Deploy Pages` run on `main` failed') &&
    productionCutover.includes('Academy matrix job for `schood-academy` also failed'),
);

addCheck(
  'Academy cutover requires backend deploy and live acceptance evidence',
  productionCutover.includes('supabase db push --linked') &&
    productionCutover.includes('supabase functions deploy academy') &&
    productionCutover.includes('supabase functions deploy click') &&
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
  packageJson.scripts?.['test:academy:routes'] === 'npm --workspace apps/academy run test:routes' &&
    safeRead('apps/academy/package.json').includes('"test:routes": "playwright test -c playwright.config.ts"'),
);

addCheck(
  'Academy Edge contract test script is registered',
  String(packageJson.scripts?.['test:academy:edge'] ?? '').includes('deno test') &&
    String(packageJson.scripts?.['test:academy:edge'] ?? '').includes('--allow-env') &&
    String(packageJson.scripts?.['test:academy:edge'] ?? '').includes('--allow-read') &&
    String(packageJson.scripts?.['test:academy:edge'] ?? '').includes('supabase/functions/academy/academy-contract.test.ts') &&
    String(packageJson.scripts?.['test:academy:edge'] ?? '').includes('supabase/functions/academy/access-matrix.test.ts') &&
    academyContractTest.includes('ACADEMY_ACTION_PERMISSIONS') &&
    academyContractTest.includes('buildAcademyPermissions') &&
    academyContractTest.includes('validateAcademyUploadFile'),
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
    academySmoke.includes('ACADEMY_SMOKE_TOKEN') &&
    academySmoke.includes('ACADEMY_STUDENT_SMOKE_TOKEN') &&
    academySmoke.includes('academy id discovered') &&
    academySmoke.includes("action: 'summary'") &&
    academySmoke.includes("action: 'classrooms'") &&
    academySmoke.includes("action: 'payments'") &&
    academySmoke.includes("action: 'education_os'") &&
    academySmoke.includes("action: 'student-dashboard'") &&
    academySmoke.includes('student token has an academy enrollment'),
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
    academyLiveSmokeWorkflow.includes('ACADEMY_EDGE_URL') &&
    academyLiveSmokeWorkflow.includes('ACADEMY_SMOKE_TOKEN') &&
    academyLiveSmokeWorkflow.includes('ACADEMY_STUDENT_SMOKE_TOKEN') &&
    academyLiveSmokeWorkflow.includes('npm run smoke:academy:live'),
);

addCheck(
  'Academy live smoke env keys are documented without values',
  envExample.includes('ACADEMY_EDGE_URL=') &&
    envExample.includes('ACADEMY_SMOKE_TOKEN=') &&
    envExample.includes('ACADEMY_STUDENT_SMOKE_TOKEN=') &&
    envExample.includes('ACADEMY_SMOKE_ACADEMY_ID='),
);

addCheck(
  'Academy GitHub readiness checker verifies smoke secrets and deploy status',
  academyGithubReadiness.includes('ACADEMY_EDGE_URL') &&
    academyGithubReadiness.includes('ACADEMY_SMOKE_TOKEN') &&
    academyGithubReadiness.includes('ACADEMY_STUDENT_SMOKE_TOKEN') &&
  academyGithubReadiness.includes('Academy Live Smoke') &&
    academyGithubReadiness.includes('deploy-pages.yml') &&
    academyGithubReadiness.includes('Latest Deploy Pages run succeeded') &&
    academyGithubReadiness.includes('Latest Deploy Pages academy job succeeded') &&
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
