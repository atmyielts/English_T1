// Preview data for the connect pages: notifications for every persona, an API key, a
// webhook with a delivery log, a brand, reminder choices and an audit trail. The
// switches stay off in preview, as they are by default, so nothing pretends to send.
import type { FakeDb } from '../../../supabase/functions/company/testing.ts';
import type { World } from './boot.ts';

const DAY = 86_400_000, HOUR = 3_600_000;
// A 1 by 1 navy pixel, so the brand page has a logo to show.
const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqPr/HwAEewJr3jtx5wAAAABJRU5ErkJggg==';

export function seed(db: FakeDb, world: World) {
  const { orgId, now } = world;
  const at = (offset: number) => new Date(now.getTime() + offset).toISOString();
  const day = (offset: number) => at(offset).slice(0, 10);
  const members = db.rows('company_members').filter((row) => row.org_id === orgId);
  const byUser = (id: string) => members.find((row) => row.user_id === id)!;
  const owner = byUser(world.personas.owner.id), hr = byUser(world.personas.hr.id), manager = byUser(world.personas.manager.id), employee = byUser(world.personas.employee.id);

  const notice = (member: Record<string, unknown>, kind: string, key: string, params: Record<string, unknown>, link: string | null, offset: number, read = false) =>
    db.rows('company_notices').push({ id: crypto.randomUUID(), org_id: orgId, member_id: member.id, kind, dedupe_key: key, params, link, read_at: read ? at(offset + HOUR) : null, push_state: null, created_at: at(offset) });
  for (const member of [owner, hr]) {
    notice(member, 'candidate_finished', 'seed-candidate-1', { title: 'Front desk receptionist' }, `/w/${orgId}/hiring`, -2 * HOUR);
    notice(member, 'candidate_finished', 'seed-candidate-2', { title: 'Sales manager' }, `/w/${orgId}/hiring`, -9 * HOUR);
    notice(member, 'weekly_digest', 'seed-digest', { people: 16, learners: 9, minutes: 412, tests: 3, candidates: 4 }, `/w/${orgId}`, -DAY, true);
  }
  notice(owner, 'contract_ending', 'seed-contract', { date: day(25 * DAY), days: 25 }, `/w/${orgId}/settings`, -3 * HOUR);
  for (const member of [employee, manager]) {
    notice(member, 'test_todo', 'seed-test', { title: 'October progress check' }, `/w/${orgId}/me`, -5 * HOUR);
    notice(member, 'session_soon', 'seed-session', { title: 'Speaking club: handling complaints', at: at(20 * HOUR) }, `/w/${orgId}/sessions`, -HOUR);
    notice(member, 'assignment_due', 'seed-assignment', { date: day(3 * DAY) }, `/w/${orgId}/learn`, -2 * DAY);
    notice(member, 'seat_on', 'seed-seat', {}, `/w/${orgId}/learn`, -30 * DAY, true);
  }

  const settingsAt = at(-10 * 60_000);
  db.rows('company_connect_settings').push({ org_id: orgId, telegram_enabled: false, email_enabled: false, quiet_start: 21, quiet_end: 9, daily_cap: 3, digest_enabled: true, digest_weekday: 1, last_digest_week: null, import_mapping: {}, notices_swept_at: settingsAt, events_swept_at: null });

  db.rows('company_api_keys').push(
    { id: crypto.randomUUID(), org_id: orgId, name: 'HR system', key_hash: 'preview-not-a-real-hash-1', key_prefix: 'scl_previewK', scope: 'read', expires_at: null, last_used_at: at(-4 * HOUR), revoked_at: null, created_by: world.personas.owner.id, created_at: at(-20 * DAY) },
    { id: crypto.randomUUID(), org_id: orgId, name: 'Old import script', key_hash: 'preview-not-a-real-hash-2', key_prefix: 'scl_oldScrip', scope: 'write', expires_at: null, last_used_at: at(-40 * DAY), revoked_at: at(-12 * DAY), created_by: world.personas.owner.id, created_at: at(-50 * DAY) },
  );

  const hook = crypto.randomUUID();
  db.rows('company_webhooks').push({ id: hook, org_id: orgId, url: 'https://ats.example.com/schood/events', secret: 'whsec_preview_only_not_a_real_secret', events: ['candidate.finished', 'test.graded', 'member.joined'], description: 'Hiring system', active: true, disabled_reason: null, failure_count: 0, last_success_at: at(-2 * HOUR), last_failure_at: at(-30 * HOUR), created_by: world.personas.owner.id, created_at: at(-15 * DAY), updated_at: at(-2 * HOUR) });
  const delivery = (event: string, status: string, attempts: number, offset: number, response: number | null, error: string | null) => db.rows('company_webhook_deliveries').push({
    id: crypto.randomUUID(), org_id: orgId, webhook_id: hook, event, event_id: `${event}:${crypto.randomUUID()}`, payload: {}, status, attempts, next_attempt_at: at(offset), response_status: response, error, is_test: false, delivered_at: status === 'sent' ? at(offset) : null, created_at: at(offset), updated_at: at(offset),
  });
  delivery('candidate.finished', 'sent', 1, -2 * HOUR, 200, null);
  delivery('test.graded', 'sent', 1, -5 * HOUR, 200, null);
  delivery('member.joined', 'sent', 2, -26 * HOUR, 204, null);
  delivery('candidate.finished', 'dead', 7, -30 * HOUR, 500, 'http_500');

  db.rows('company_brand').push({ org_id: orgId, display_name: 'Silk Road Hotels', brand_color: '#0f5132', logo_data_url: LOGO, updated_by: world.personas.owner.id, created_at: at(-10 * DAY), updated_at: at(-10 * DAY) });

  db.rows('company_connect_prefs').push({ member_id: employee.id, org_id: orgId, telegram_opt_in: false, muted_kinds: [], quiet_start: null, quiet_end: null, daily_cap: null, locale: null });

  const audit = (action: string, actor: string | null, target: string | null, details: Record<string, unknown>, offset: number) => db.rows('company_audit').push({ id: crypto.randomUUID(), org_id: orgId, actor, action, target, details, created_at: at(offset) });
  audit('member.seat_on', world.personas.hr.id, employee.id as string, {}, -30 * DAY);
  audit('api_key.created', world.personas.owner.id, null, { name: 'HR system', scope: 'read' }, -20 * DAY);
  audit('webhook.created', world.personas.owner.id, hook, { url: 'https://ats.example.com/schood/events' }, -15 * DAY);
  audit('brand.updated', world.personas.owner.id, orgId, { display_name: 'Silk Road Hotels', brand_color: '#0f5132', logo: true }, -10 * DAY);
  audit('import.applied', world.personas.hr.id, orgId, { added: 6, updated: 2, skipped: 0, errors: 1 }, -6 * DAY);
  audit('privacy.exported', world.personas.hr.id, manager.id as string, { consent: true }, -2 * DAY);
  audit('api.member_created', null, members[6]?.id as string ?? null, { name: 'New hire' }, -DAY);
}
