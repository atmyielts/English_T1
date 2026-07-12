import { expect, test, type Page, type Route } from '@playwright/test';

type Persona = 'owner' | 'teacher' | 'student';

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
    manageOffers: true,
    manageBranding: true,
    manageAutomation: true,
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
    manageResources: true,
    viewReports: true,
    issueCertificates: true,
    dispatchNotifications: true,
    viewNotifications: true,
    viewReferrals: true,
    viewAudit: true,
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
  },
};

const academy = (persona: Persona) => ({
  id: academyId,
  name: 'Route Smoke Academy',
  slug: 'route-smoke',
  type: 'team',
  metadata: { service_family: 'academy' },
  role: persona === 'owner' ? 'owner' : 'teacher',
  status: 'active',
  created_at: '2026-01-01T00:00:00.000Z',
  access: persona === 'owner' ? ownerAccess : teacherAccess,
});

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
  status: 'active',
  metadata: {},
  created_by: 'teacher-user',
  created_at: '2026-07-01T09:00:00.000Z',
  updated_at: '2026-07-01T09:00:00.000Z',
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
      const role = persona === 'owner' ? 'owner' : persona === 'teacher' ? 'teacher' : 'student';
      return route.fulfill(json({
        user: { id: `${persona}-user`, email: `${persona}@example.test`, role },
        current_tenant: { id: academyId, name: 'Route Smoke Academy', slug: 'route-smoke', type: 'team', metadata: { service_family: 'academy' } },
        memberships: persona === 'student'
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
      'student-feed': { messages: [], alerts: [], announcements: [] },
      'student-dashboard': studentDashboard,
      'classroom-chat': { room: { classroom, members: [membership], resources: [{ id: 'resource-route-smoke', academy_id: academyId, classroom_id: classroomId, title: 'Essay checklist', kind: 'asset', url: 'https://example.test/checklist.pdf', description: 'Checklist', metadata: {}, sort_order: 1, is_published: true, created_by: 'teacher-user', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }], messages: [] } },
      student_assignments: { academy_id: academyId, contact_id: studentContactId, assignments: [{ ...assignment, submission: null }] },
      student_attendance: { attendance: [] },
      student_billing: { items: [] },
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

  test('student route opens linked classroom workspace', async ({ page }) => {
    await seedSessionCookie(page, 'student-user');
    await mockAcademyEdge(page, 'student');

    await page.goto(`/academy/student/classrooms?academy_id=${academyId}`);

    await expect(page.getByText('Student Workplace')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: /^Classrooms$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open student view' })).toBeVisible();
  });

  test('teacher is blocked from administrator-only route', async ({ page }) => {
    await seedSessionCookie(page, 'teacher-user');
    await mockAcademyEdge(page, 'teacher');

    await page.goto(`/academy/admin/payments?academy_id=${academyId}`);

    await expect(page.getByRole('heading', { name: /Role workspace access required/i })).toBeVisible();
    await expect(page.getByText(/does not have administrator controls/i)).toBeVisible();
  });
});
