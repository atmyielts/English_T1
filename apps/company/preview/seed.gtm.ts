// Preview data for the gtm pages: open invitations, team links, demo requests in
// every pipeline state, a second (pilot) workspace and some audit history.
// Known links to try (only their sha256 is stored, like production):
//   /join/preview-team-front-office-2026    team link, Front office (try ?as=newcomer)
//   /join/preview-personal-invited-person   personal invitation for "Invited Person"
//   /join/preview-expired-team-link-0001    expired team link
//   /join/preview-owner-navoi-logistics     owner invitation for the second workspace
import type { FakeDb } from '../../../supabase/functions/company/testing.ts';
import type { World } from './boot.ts';

const DAY = 86_400_000;
const HASH = {
  team: 'ad2fc459914bbd5f24b5fe72acceae21217c868ff918e61e6f09b8654b235aad',
  personal: 'd1b811776a79bd833080ee25d97f7efbb866c1f0ffc6347ce8309a9fe1501204',
  expired: 'cf9f343329d776ec54d4bb48f0c6dcb2af4eb3d9bf07e310e8508174edb12aec',
  owner: 'c29586525c30de2bb96652718a32f36af34cc27bf40ffaf8c8bbae33f073e6f3',
};
const NAVOI = '7a0f5c1e-0000-4000-8000-0000000c0de2';

export function seed(db: FakeDb, world: World) {
  const { orgId, now, departments, personas } = world;
  const at = (days: number) => new Date(now.getTime() + days * DAY).toISOString();
  const day = (days: number) => at(days).slice(0, 10);
  const owner = personas.owner.id, hr = personas.hr.id;

  // A fourth department with nobody in it yet.
  db.rows('company_departments').push({ id: crypto.randomUUID(), org_id: orgId, name: 'Housekeeping' });

  // Invited people: the core seed's "Invited Person" gets a personal link; two more are waiting.
  const invited = db.rows('company_members').find((row) => row.org_id === orgId && row.status === 'invited');
  const extra = [
    { name: 'Shahzoda Rasulova', email: 'shahzoda@silkroad.example', department: departments.front, job: 'hospitality', days: -2 },
    { name: 'Javlon Yuldashev', email: null, department: departments.sales, job: 'sales', days: -16 },
  ].map((person) => {
    const row = {
      id: crypto.randomUUID(), org_id: orgId, user_id: null, email: person.email, full_name: person.name, role: 'employee', department_id: person.department,
      job_role: person.job, status: 'invited', seat: false, level: null, level_score: null, level_source: null, level_at: null, target_level: 'b1',
      target_date: day(120), consent_at: null, invited_at: at(person.days), joined_at: null, invited_by: hr,
    };
    db.rows('company_members').push(row);
    return { row, days: person.days };
  });
  const invite = (row: Record<string, unknown>) => db.rows('company_invites').push({
    id: crypto.randomUUID(), org_id: orgId, member_id: null, kind: 'personal', role: 'employee', department_id: null, job_role: 'general',
    max_uses: 1, uses: 0, revoked_at: null, created_by: hr, created_at: at(-3), ...row,
  });
  if (invited) invite({ member_id: invited.id, token_hash: HASH.personal, department_id: invited.department_id, expires_at: at(11) });
  for (const { row, days } of extra) invite({ member_id: row.id, token_hash: `preview-${row.id}`, department_id: row.department_id, job_role: row.job_role, created_at: at(days), expires_at: at(days + 14) });

  // Team links: one open for Front office, one expired for Sales.
  invite({ kind: 'link', member_id: null, token_hash: HASH.team, department_id: departments.front, job_role: 'hospitality', max_uses: 25, uses: 6, expires_at: at(20), created_at: at(-10) });
  invite({ kind: 'link', member_id: null, token_hash: HASH.expired, department_id: departments.sales, job_role: 'sales', max_uses: null, uses: 3, expires_at: at(-1), created_at: at(-31) });

  // A second workspace: a logistics pilot whose owner has not joined yet.
  db.rows('company_orgs').push({
    id: NAVOI, name: 'Navoi Logistics', industry: 'logistics', size_band: '51-200', city: 'Navoi', contact_phone: '+998 79 000 00 00',
    billing_email: 'office@navoi-logistics.example', tax_id: null, status: 'pilot', seats_limit: 0, tests_limit: 10, tests_used: 2,
    contract_ends_at: null, settings: { locale: 'uz' }, created_by: personas.staff.id, created_at: at(-6),
  });
  const navoiOwner = crypto.randomUUID();
  db.rows('company_members').push({
    id: navoiOwner, org_id: NAVOI, user_id: null, email: 'director@navoi-logistics.example', full_name: 'Sherzod Nematov', role: 'owner', department_id: null,
    job_role: 'management', status: 'invited', seat: false, level: null, level_score: null, level_source: null, level_at: null, target_level: null, target_date: null,
    consent_at: null, invited_at: at(-6), joined_at: null, invited_by: personas.staff.id,
  });
  db.rows('company_invites').push({
    id: crypto.randomUUID(), org_id: NAVOI, member_id: navoiOwner, kind: 'personal', role: 'admin', department_id: null, job_role: 'management',
    max_uses: 1, uses: 0, token_hash: HASH.owner, expires_at: at(24), revoked_at: null, created_by: personas.staff.id, created_at: at(-6),
  });

  // Demo requests in every state of the pipeline.
  const lead = (row: Record<string, unknown>) => {
    const id = crypto.randomUUID();
    db.rows('company_leads').push({
      id, job_title: null, phone: null, email: null, size_band: null, industry: null, interests: [], need: null, locale: 'ru', status: 'new', notes: null,
      follow_up_at: null, org_id: null, source: 'landing', ip_hash: 'preview', updated_at: row.created_at, ...row,
    });
    return id;
  };
  const audit = (row: Record<string, unknown>) => db.rows('company_audit').push({ id: db.rows('company_audit').length + 1, org_id: null, actor: null, details: {}, ...row });
  const fresh = lead({ name: 'Madina Abdullayeva', company: 'Samarkand Grand Hotel', job_title: 'HR manager', phone: '+998 90 111 22 33', industry: 'hospitality', size_band: '201-1000', interests: ['hiring', 'training'], need: 'Нужно проверить английский у 30 сотрудников ресепшн и ресторана перед туристическим сезоном.', created_at: at(-0.2) });
  audit({ action: 'lead.created', target: fresh, details: { company: 'Samarkand Grand Hotel', source: 'landing' }, created_at: at(-0.2) });
  const contacted = lead({ name: 'Bobur Hasanov', company: 'Ipak Yo‘li Bank', job_title: 'L&D lead', phone: '+998 71 200 00 00', email: 'b.hasanov@bank.example', industry: 'banking', size_band: '1000+', interests: ['placement', 'reports'], locale: 'uz', status: 'contacted', notes: 'Wants placement for the call centre first, then branches.', follow_up_at: day(-1), created_at: at(-5) });
  audit({ action: 'lead.created', target: contacted, details: { company: 'Ipak Yo‘li Bank' }, created_at: at(-5) });
  audit({ action: 'lead.updated', target: contacted, actor: personas.staff.id, details: { status: { from: 'new', to: 'contacted' } }, created_at: at(-4) });
  audit({ action: 'lead.note', target: contacted, actor: personas.staff.id, details: { body: 'Called. Demo on Thursday with HR and the call-centre head.' }, created_at: at(-4) });
  const pilot = lead({ name: 'Sherzod Nematov', company: 'Navoi Logistics', job_title: 'Director', email: 'director@navoi-logistics.example', industry: 'logistics', size_band: '51-200', interests: ['hiring'], locale: 'uz', status: 'pilot', org_id: NAVOI, follow_up_at: day(7), created_at: at(-9) });
  audit({ action: 'lead.created', target: pilot, details: { company: 'Navoi Logistics' }, created_at: at(-9) });
  audit({ action: 'lead.workspace', target: pilot, org_id: NAVOI, actor: personas.staff.id, details: { org_id: NAVOI, name: 'Navoi Logistics' }, created_at: at(-6) });
  const won = lead({ name: 'Dilnoza Karimova', company: 'Silk Road Hotels', job_title: 'HR director', phone: '+998 71 000 00 00', email: 'hr@silkroad.example', industry: 'hospitality', size_band: '201-1000', interests: ['hiring', 'placement', 'training', 'reports'], status: 'won', org_id: orgId, created_at: at(-70) });
  audit({ action: 'lead.created', target: won, details: { company: 'Silk Road Hotels' }, created_at: at(-70) });
  audit({ action: 'lead.updated', target: won, actor: personas.staff.id, details: { status: { from: 'pilot', to: 'won' } }, created_at: at(-60) });
  lead({ name: 'Alexey Pak', company: 'TechSoft Tashkent', email: 'alexey@techsoft.example', industry: 'it', size_band: '1-50', interests: ['training'], status: 'lost', notes: 'Chose to wait until next budget year.', created_at: at(-40) });

  // Some workspace history for the audit log.
  const history: [string, string | null, Record<string, unknown>, number, string][] = [
    ['staff.org_updated', orgId, { status: { from: 'pilot', to: 'active' }, seats_limit: { from: 0, to: 25 } }, -60, personas.staff.id],
    ['department.created', departments.front, { name: 'Front office' }, -58, owner],
    ['member.imported', null, { count: 12, departments_created: 0 }, -50, hr],
    ['invite.link_created', null, { role: 'employee', job_role: 'hospitality', max_uses: 25, days: 30 }, -10, hr],
    ['member.seat_on', null, { access: 'granted' }, -9, hr],
  ];
  for (const [action, target, details, days, actor] of history) audit({ action, target, details, org_id: orgId, actor, created_at: at(days) });
}
