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
const studentClassroomView = safeRead('apps/academy/src/components/students/StudentClassroomView.tsx');
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
    tokens: ['Awaiting Click', 'Manual settlement', 'Needs attention', 'Access applied', 'Canceled checkout', 'Duplicate callback', 'Grant mismatch', 'Provider'],
  },
  {
    label: 'Teacher LMS assignment drilldown workflow',
    content: educationOsView,
    tokens: ['Assignment detail', 'Open linked task', 'Missing', 'Submitted', 'Late', 'Graded', 'Open file'],
  },
  {
    label: 'Student daily classroom workflow',
    content: studentClassroomView,
    tokens: ['Next best actions', 'Resources', 'Assignments', 'Grades', 'Attendance', 'Billing', 'Chat'],
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
      'teacher route opens LMS surfaces',
      'student route opens linked classroom workspace',
      'teacher is blocked from administrator-only route',
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
  'student-dashboard',
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
];

for (const action of requiredEdgeActions) {
  addCheck(`Academy Edge action contract includes ${action}`, academyEdge.includes(`"${action}"`) || academyEdge.includes(`'${action}'`));
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
      const ownerChecks = [
        {
          action: 'summary',
          payload: { action: 'summary', academy_id: academyId },
          validate: (body) => isRecord(body.counts),
        },
        {
          action: 'classrooms',
          payload: { action: 'classrooms', academy_id: academyId },
          validate: (body) => Array.isArray(body.classrooms),
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
      ];

      for (const check of ownerChecks) {
        const result = await livePost(liveEdgeUrl, smokeToken, check.payload);
        addLiveResponseCheck(`Live Academy Edge smoke: ${check.action}`, result, check.validate);
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
