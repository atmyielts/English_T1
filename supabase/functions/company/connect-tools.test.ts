// HRIS import, white label and the privacy tools.
import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1';
import { brandOf, routes as connect, publicBrand } from './connect.ts';
import { routes as core } from './core.ts';
import { contrastWithWhite, readableColor } from './connect/brand.ts';
import { suggestMapping } from './connect/import.ts';
import { cleanJpeg, cleanLogo, cleanPng } from './connect/logo.ts';
import { FakeDb, testHandler } from './testing.ts';
import { CompanyError, type Route } from './types.ts';

const routes: Route[] = [...core, ...connect];
const ORG = '10000000-0000-4000-8000-000000000001', OTHER = '10000000-0000-4000-8000-000000000002';
const OWNER = '20000000-0000-4000-8000-000000000001', EMP = '20000000-0000-4000-8000-000000000003', MGR = '20000000-0000-4000-8000-000000000005';
const M_OWNER = '30000000-0000-4000-8000-000000000001', M_EMP = '30000000-0000-4000-8000-000000000003', M_MGR = '30000000-0000-4000-8000-000000000005', M_THEIRS = '30000000-0000-4000-8000-000000000009';
const DEPT = '40000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-11-06T07:00:00Z');
const DAY = 86_400_000;
const iso = (offset: number) => new Date(NOW.getTime() + offset).toISOString();

function world() {
  const member = (id: string, user: string | null, role: string, extra: Record<string, unknown> = {}) => ({
    id, org_id: ORG, user_id: user, email: `${role}@x.test`, full_name: role, role, department_id: null, job_role: 'general', status: 'active', seat: false, level: null, level_score: null, level_source: null, level_at: null,
    target_level: null, target_date: null, consent_at: null, joined_at: iso(-20 * DAY), ...extra,
  });
  const db = new FakeDb({
    users: [{ id: OWNER, role: 'user' }, { id: EMP, role: 'user' }, { id: MGR, role: 'user' }],
    company_orgs: [
      { id: ORG, name: 'Acme', industry: 'it', size_band: '1-50', status: 'active', seats_limit: 5, tests_limit: 10, tests_used: 0, contract_ends_at: null, settings: {}, created_at: iso(-30 * DAY) },
      { id: OTHER, name: 'Other', industry: 'it', size_band: '1-50', status: 'active', seats_limit: 5, tests_limit: 10, tests_used: 0, contract_ends_at: null, settings: {}, created_at: iso(-30 * DAY) },
    ],
    company_departments: [{ id: DEPT, org_id: ORG, name: 'Sales' }],
    company_members: [
      member(M_OWNER, OWNER, 'owner'), member(M_EMP, EMP, 'employee', { email: 'emp@x.test', full_name: 'Emp Loyee', department_id: DEPT }), member(M_MGR, MGR, 'manager'),
      { ...member(M_THEIRS, null, 'employee'), org_id: OTHER, email: 'theirs@x.test' },
    ],
    company_invites: [], company_audit: [], company_connect_settings: [], company_brand: [],
    company_attempts: [], company_lesson_progress: [], company_activity: [], company_assignments: [], company_session_attendance: [], company_roleplay_sessions: [], company_writing_checks: [],
  });
  db.rpcs.company_connect_hit = () => true;
  return db;
}

const CSV = 'Employee Name,Work Email,Department,Job Title,Note\nNew Person,new@x.test,Marketing,Sales,hi\nEmp Renamed,emp@x.test,Sales,,x\nBad Mail,bad-mail,Sales,,x\nNew Person Two,new@x.test,Sales,,dup\nmanager,manager@x.test,,Quantum Wizard,x\n';

Deno.test('mapping is guessed from the column names HR systems use', () => {
  assertEquals(suggestMapping(['Employee Name', 'Work Email', 'Department', 'Job Title']), { name: 'Employee Name', email: 'Work Email', department: 'Department', job_role: 'Job Title' });
  assertEquals(suggestMapping(['Фамилия', 'Имя', 'Почта', 'Отдел', 'Должность']), { first_name: 'Имя', last_name: 'Фамилия', email: 'Почта', department: 'Отдел', job_role: 'Должность' });
  assertEquals(suggestMapping(['ism', 'familiya', 'pochta', 'bo\'lim', 'lavozim']), { first_name: 'ism', last_name: 'familiya', email: 'pochta', department: 'bo\'lim', job_role: 'lavozim' });
});

Deno.test('import preview: adds, changes, errors and missing people, without writing anything', async () => {
  const db = world();
  const call = testHandler(db, routes, { now: () => NOW });
  assertEquals((await call('POST', `orgs/${ORG}/connect/import/preview`, { user: EMP, body: { text: CSV } })).status, 403);
  assertEquals((await call('POST', `orgs/${ORG}/connect/import/preview`, { user: MGR, body: { text: CSV } })).status, 403);
  const before = db.rows('company_members').length;
  const { body } = await call('POST', `orgs/${ORG}/connect/import/preview`, { user: OWNER, body: { text: CSV } });
  const plan = body.plan;
  assertEquals(plan.add.map((row: { email: string }) => row.email), ['new@x.test']);
  assertEquals(plan.add[0].job_role, 'sales');
  assertEquals(plan.update.map((row: { email: string }) => row.email), ['emp@x.test']);
  assertEquals(plan.update[0].changes.name, { from: 'Emp Loyee', to: 'Emp Renamed' });
  assertEquals(plan.errors.map((row: { code: string }) => row.code).sort(), ['duplicate', 'email']);
  assertEquals(plan.new_departments, ['Marketing']);
  assertEquals(plan.unknown_titles, ['Quantum Wizard']);
  assertEquals(plan.unchanged, 1);
  // The owner is never listed as missing; the other workspace's person never shows.
  assertEquals(plan.missing.map((row: { email: string }) => row.email), []);
  assert(!JSON.stringify(plan).includes('theirs@x.test'));
  assertEquals(db.rows('company_members').length, before);
  assertEquals(db.rows('company_departments').length, 1);
  assert(typeof body.fingerprint === 'string');
});

Deno.test('import: a spreadsheet paste with tabs, a custom mapping and no header', async () => {
  const db = world();
  const call = testHandler(db, routes, { now: () => NOW });
  const paste = 'Olga\tPetrova\tolga@x.test\nJasur\tNazarov\tjasur@x.test\n';
  const { body } = await call('POST', `orgs/${ORG}/connect/import/preview`, { user: OWNER, body: { text: paste, has_header: false, mapping: { first_name: 'Column 1', last_name: 'Column 2', email: 'Column 3' } } });
  assertEquals(body.plan.add.map((row: { name: string }) => row.name), ['Olga Petrova', 'Jasur Nazarov']);
  assertEquals(body.plan.headers, ['Column 1', 'Column 2', 'Column 3']);
});

Deno.test('import apply: does what the preview said, remembers the mapping, returns links once', async () => {
  const db = world();
  const call = testHandler(db, routes, { now: () => NOW });
  const input = { text: CSV, job_role_map: { 'Quantum Wizard': 'engineering' } };
  const preview = await call('POST', `orgs/${ORG}/connect/import/preview`, { user: OWNER, body: input });
  // The title now has a job role, so the existing manager would change.
  assertEquals(preview.body.plan.unknown_titles, []);
  assertEquals(preview.body.plan.update.map((row: { email: string }) => row.email).sort(), ['emp@x.test', 'manager@x.test']);
  const applied = await call('POST', `orgs/${ORG}/connect/import/apply`, { user: OWNER, body: { ...input, fingerprint: preview.body.fingerprint } });
  assertEquals(applied.status, 200);
  assertEquals(applied.body.added, 1);
  assertEquals(applied.body.updated, 2);
  assertEquals(applied.body.departments_created, 1);
  assertEquals(applied.body.links.length, 1);
  assert(applied.body.links_csv.includes('/join/'));
  const person = db.rows('company_members').find((row) => row.email === 'new@x.test')!;
  assertEquals(person.status, 'invited');
  assertEquals(person.department_id, db.rows('company_departments').find((row) => row.name === 'Marketing')!.id);
  const renamed = db.rows('company_members').find((row) => row.id === M_EMP)!;
  assertEquals(renamed.full_name, 'Emp Renamed');
  assertEquals(renamed.role, 'employee');
  assertEquals(db.rows('company_members').find((row) => row.id === M_MGR)!.job_role, 'engineering');
  const raw = applied.body.links[0].link.split('/join/')[1];
  assert(!JSON.stringify(db.rows('company_invites')).includes(raw));
  assertEquals((db.rows('company_connect_settings')[0].import_mapping as { mapping: { email: string } }).mapping.email, 'Work Email');
  assert(db.rows('company_audit').some((row) => row.action === 'import.applied'));
  // It is remembered for the next file, and repeating it changes nothing.
  const remembered = await call('GET', `orgs/${ORG}/connect/import`, { user: OWNER });
  assertEquals(remembered.body.remembered.job_role_map['quantum wizard'], 'engineering');
  const again = await call('POST', `orgs/${ORG}/connect/import/preview`, { user: OWNER, body: { text: CSV } });
  assertEquals(again.body.plan.add.length, 0);
  assertEquals(again.body.plan.update.length, 0);
});

Deno.test('import apply: a stale preview is refused; never removes anyone; a race is skipped, not an error', async () => {
  const db = world();
  const call = testHandler(db, routes, { now: () => NOW });
  const preview = await call('POST', `orgs/${ORG}/connect/import/preview`, { user: OWNER, body: { text: CSV } });
  db.rows('company_members').find((row) => row.id === M_EMP)!.full_name = 'Emp Renamed';
  const stale = await call('POST', `orgs/${ORG}/connect/import/apply`, { user: OWNER, body: { text: CSV, fingerprint: preview.body.fingerprint } });
  assertEquals(stale.status, 409);
  assertEquals(stale.body.code, 'import_stale');
  assertEquals(db.rows('company_members').some((row) => row.email === 'new@x.test'), false);

  const raced = world();
  const raceCall = testHandler(raced, routes, { now: () => NOW });
  const small = 'name,email\nAnn One,ann@x.test\n';
  const plan = await raceCall('POST', `orgs/${ORG}/connect/import/preview`, { user: OWNER, body: { text: small } });
  // The row appears after the plan; the unique index answers 23505.
  raced.uniques.company_members = [{ columns: ['org_id', 'email'], where: (row) => row.status !== 'removed' }];
  const realFrom = raced.from.bind(raced);
  (raced as unknown as { from: unknown }).from = (table: string) => {
    const query = realFrom(table);
    if (table === 'company_members') {
      const insert = query.insert.bind(query);
      (query as unknown as { insert: unknown }).insert = (rows: Record<string, unknown>) => {
        raced.rows('company_members').push({ id: crypto.randomUUID(), org_id: ORG, email: 'ann@x.test', status: 'invited' });
        return insert(rows);
      };
    }
    return query;
  };
  const applied = await raceCall('POST', `orgs/${ORG}/connect/import/apply`, { user: OWNER, body: { text: small, fingerprint: plan.body.fingerprint } });
  assertEquals(applied.status, 200);
  assertEquals(applied.body.added, 0);
  assertEquals(applied.body.skipped, 1);
  assertEquals((await raceCall('POST', `orgs/${ORG}/connect/import/preview`, { user: OWNER, body: { text: 'bad\u0000' } })).status, 400);
});

// --- Logos ---------------------------------------------------------------

function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}
function chunk(type: string, data: number[]): number[] {
  const body = new Uint8Array([...type].map((char) => char.charCodeAt(0)).concat(data));
  const crc = crc32(body);
  const be = (value: number) => [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
  return [...be(data.length), ...body, ...be(crc)];
}
const png = (extra: number[][] = [], width = 1, height = 1) => new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ...chunk('IHDR', [0, 0, 0, width, 0, 0, 0, height, 8, 0, 0, 0, 0]),
  ...extra.flat(),
  ...chunk('IDAT', [0x78, 0x9c, 0x63, 0x60, 0, 0, 0, 2, 0, 1]),
  ...chunk('IEND', []),
]);
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const dataPng = (bytes: Uint8Array) => `data:image/png;base64,${b64(bytes)}`;
const jpeg = (extra: number[] = []) => new Uint8Array([
  0xff, 0xd8,
  0xff, 0xe0, 0, 4, 0x4a, 0x46, // APP0
  ...extra,
  0xff, 0xdb, 0, 3, 1, // DQT
  0xff, 0xc0, 0, 8, 8, 0, 1, 0, 1, 1, // SOF0, 1 by 1
  0xff, 0xda, 0, 3, 1, // SOS
  0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, // scan data with a stuffed byte and a restart
  0xff, 0xd9,
]);

Deno.test('logo: PNG metadata and anything after the end are dropped', () => {
  const text = chunk('tEXt', [...new TextEncoder().encode('<script>alert(1)</script>')]);
  const clean = cleanPng(new Uint8Array([...png([text]), ...new TextEncoder().encode('<html>polyglot</html>')]));
  const decoded = new TextDecoder().decode(clean);
  assert(!decoded.includes('script'));
  assert(!decoded.includes('polyglot'));
  assert(decoded.includes('IHDR') && decoded.includes('IDAT') && decoded.includes('IEND'));
  assertEquals(cleanPng(png()).length, png().length);
});

Deno.test('logo: JPEG comments and EXIF are dropped, the image stays', () => {
  const comment = [0xff, 0xfe, 0, 8, ...new TextEncoder().encode('secret')];
  const exif = [0xff, 0xe1, 0, 8, ...new TextEncoder().encode('Exif\0\0')];
  const clean = cleanJpeg(new Uint8Array([...jpeg([...comment, ...exif]), ...new TextEncoder().encode('trailing')]));
  const decoded = new TextDecoder('latin1').decode(clean);
  assert(!decoded.includes('secret') && !decoded.includes('Exif') && !decoded.includes('trailing'));
  assertEquals(clean[0], 0xff);
  assertEquals(clean[clean.length - 1], 0xd9);
  assertEquals(clean.length, jpeg().length);
});

Deno.test('logo: only real PNG and JPEG data of a small size gets through', () => {
  const reason = (value: unknown) => {
    try {
      cleanLogo(value);
      return 'accepted';
    } catch (cause) {
      return (cause as CompanyError).code;
    }
  };
  assertEquals(reason('data:image/svg+xml;base64,PHN2Zz4='), 'logo_invalid');
  assertEquals(reason(`data:image/svg+xml,<svg onload="alert(1)"/>`), 'logo_invalid');
  assertEquals(reason('https://example.com/logo.png'), 'logo_invalid');
  assertEquals(reason(42), 'logo_invalid');
  // SVG or HTML wearing a PNG label.
  assertEquals(reason(`data:image/png;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg"></svg>'.padEnd(60))}`), 'logo_invalid');
  assertEquals(reason(`data:image/jpeg;base64,${btoa('<html></html>')}`), 'logo_invalid');
  assertEquals(reason(`data:image/png;base64,${'A'.repeat(200_000)}`), 'logo_too_large');
  assertEquals(reason(dataPng(png([], 255, 255))), 'accepted');
  // Truncated and absurd sizes.
  assertEquals(reason(dataPng(png().subarray(0, 40))), 'logo_invalid');
  const huge = png();
  huge[16] = 0x7f;
  assertThrows(() => cleanPng(huge));
  assert(cleanLogo(`data:image/jpg;base64,${b64(jpeg())}`).startsWith('data:image/jpeg;base64,'));
});

Deno.test('colour: must read on white, with a suggestion when it does not', () => {
  assert(contrastWithWhite('#1e3a8a') >= 4.5);
  assert(contrastWithWhite('#ffee00') < 2);
  assertEquals(contrastWithWhite('#000000'), 21);
  const better = readableColor('#ffee00');
  assert(contrastWithWhite(better) >= 4.5);
  assertEquals(readableColor('#1e3a8a'), '#1e3a8a');
});

Deno.test('brand: HR saves it, a public read shows only that, closed shows nothing', async () => {
  const db = world();
  db.rows('company_brand');
  const call = testHandler(db, routes, { now: () => NOW });
  const path = `orgs/${ORG}/connect/brand`;
  assertEquals((await call('GET', `public/brand/${ORG}`)).body.brand, null);
  assertEquals((await call('PUT', path, { user: EMP, body: { display_name: 'x' } })).status, 403);
  const low = await call('PUT', path, { user: OWNER, body: { brand_color: '#ffee00' } });
  assertEquals(low.body.code, 'brand_low_contrast');
  assert(contrastWithWhite(low.body.suggestion) >= 4.5);
  assertEquals((await call('PUT', path, { user: OWNER, body: { brand_color: 'red' } })).status, 400);
  assertEquals((await call('PUT', path, { user: OWNER, body: { logo: 'data:image/svg+xml;base64,PHN2Zz4=' } })).body.code, 'logo_invalid');
  assertEquals((await call('PUT', path, { user: OWNER, body: { display_name: 'x\u0000' } })).status, 400);
  const saved = await call('PUT', path, { user: OWNER, body: { display_name: 'Acme Hotels', brand_color: '#1E3A8A', logo: dataPng(png()) } });
  assertEquals(saved.body.brand.brand_color, '#1e3a8a');
  const open = await call('GET', `public/brand/${ORG}`);
  assertEquals(open.body.brand.name, 'Acme Hotels');
  assertEquals(open.body.brand.color, '#1e3a8a');
  assert(open.body.brand.logo.startsWith('data:image/png;base64,'));
  assertEquals(Object.keys(open.body.brand).sort(), ['color', 'logo', 'name']);
  assertEquals((await publicBrand(db, ORG))?.name, 'Acme Hotels');
  assertEquals(await publicBrand(db, 'nonsense'), null);
  assertEquals((await call('GET', 'public/brand/nonsense')).body.brand, null);
  // Removing the logo keeps the rest; a name-less brand falls back to the company.
  await call('PUT', path, { user: OWNER, body: { logo: null, display_name: null } });
  assertEquals((await brandOf(db, ORG))?.logo, null);
  assertEquals((await brandOf(db, ORG))?.name, 'Acme');
  db.rows('company_orgs')[0].status = 'closed';
  assertEquals((await call('GET', `public/brand/${ORG}`)).body.brand, null);
});

Deno.test('brand: the public route has a rate limit', async () => {
  const db = world();
  let hits = 0;
  db.rpcs.company_connect_hit = () => ++hits <= 2;
  const call = testHandler(db, routes, { now: () => NOW });
  assertEquals((await call('GET', `public/brand/${ORG}`)).status, 200);
  assertEquals((await call('GET', `public/brand/${ORG}`)).status, 200);
  assertEquals((await call('GET', `public/brand/${ORG}`)).status, 429);
});

// --- Privacy --------------------------------------------------------------

function learningData(db: FakeDb) {
  db.rows('company_attempts').push({ id: 'at1', org_id: ORG, assessment_id: 't', member_id: M_EMP, status: 'graded', overall_level: 'b1', overall_score: 50, skill_results: {}, answers: { q: 'SECRET_ANSWER' } });
  db.rows('company_lesson_progress').push({ id: 'l1', org_id: ORG, member_id: M_EMP, track_code: 'general', lesson_code: 'g1', status: 'completed', score: 90, minutes: 10, attempts: 1 });
  db.rows('company_activity').push(
    { id: 1, org_id: ORG, member_id: M_EMP, kind: 'lesson', minutes: 10, points: 5, ref: null, created_at: iso(-DAY) },
    { id: 2, org_id: ORG, member_id: M_EMP, kind: 'test', minutes: 40, points: 5, ref: null, created_at: iso(-DAY) },
    { id: 3, org_id: ORG, member_id: M_EMP, kind: 'english', minutes: 99, points: 0, ref: null, created_at: iso(-15 * DAY) },
  );
  db.rows('company_roleplay_sessions').push({ id: 'r1', org_id: ORG, member_id: M_EMP, scenario_code: 's', track_code: 'general', status: 'ended', score: 70, minutes: 5, turns: [{ text: 'SECRET_TURN' }], feedback: { summary: 'SECRET_FEEDBACK' }, created_at: iso(-DAY) });
  db.rows('company_writing_checks').push({ id: 'w1', org_id: ORG, member_id: M_EMP, template_code: 't', draft: 'SECRET_DRAFT', result: { corrected: 'SECRET_RESULT' }, score: 80, locale: 'ru', created_at: iso(-DAY) });
  db.rows('company_session_attendance').push({ session_id: 'se1', org_id: ORG, member_id: M_EMP, marked_at: iso(-DAY) });
}

Deno.test('export: without consent only membership and tests; never answers, drafts or role-play text', async () => {
  const db = world();
  learningData(db);
  const call = testHandler(db, routes, { now: () => NOW });
  const path = `orgs/${ORG}/connect/privacy/people/${M_EMP}/export`;
  assertEquals((await call('GET', path, { user: MGR })).status, 403);
  assertEquals((await call('GET', `orgs/${ORG}/connect/privacy/people/${M_THEIRS}/export`, { user: OWNER })).status, 404);
  const closed = await call('GET', path, { user: OWNER });
  assertEquals(closed.body.learning, null);
  assertEquals(closed.body.company_tests.length, 1);
  assert(!JSON.stringify(closed.body).includes('SECRET_'));
  assert(!('user_id' in closed.body.profile));

  db.rows('company_members').find((row) => row.id === M_EMP)!.consent_at = iso(-5 * DAY);
  const open = await call('GET', path, { user: OWNER });
  assertEquals(open.body.learning.lessons.length, 1);
  assertEquals(open.body.learning.roleplays[0].score, 70);
  assert(!JSON.stringify(open.body).includes('SECRET_'));
  assertEquals(open.body.learning.coach_cards, undefined);
  // Schood English time from before agreeing stays out.
  assertEquals(open.body.learning.activity.map((row: { kind: string }) => row.kind).sort(), ['lesson', 'test']);
  assert(db.rows('company_audit').some((row) => row.action === 'privacy.exported' && row.target === M_EMP));
});

Deno.test('a person\'s own export includes their own text', async () => {
  const db = world();
  learningData(db);
  db.rows('company_coach_cards').push({ id: 'cc1', org_id: ORG, member_id: M_EMP, user_id: EMP, front: 'SECRET_DECK' });
  const call = testHandler(db, routes, { now: () => NOW });
  const own = await call('GET', `orgs/${ORG}/connect/privacy/me/export`, { user: EMP });
  assertEquals(own.status, 200);
  assert(JSON.stringify(own.body).includes('SECRET_DRAFT'));
  assert(JSON.stringify(own.body).includes('SECRET_TURN'));
  assert(JSON.stringify(own.body).includes('SECRET_DECK'));
  assertEquals(own.body.learning.activity.length, 3);
  assert(!JSON.stringify(own.body).includes('SECRET_ANSWER'));
});

Deno.test('erase learning: needs the word, keeps tests and membership, repeats harmlessly, works when paused', async () => {
  const db = world();
  learningData(db);
  db.rows('company_activity').push({ id: 9, org_id: ORG, member_id: M_MGR, kind: 'lesson', minutes: 1, points: 1, created_at: iso(-DAY) });
  const call = testHandler(db, routes, { now: () => NOW });
  const path = `orgs/${ORG}/connect/privacy/people/${M_EMP}/erase-learning`;
  assertEquals((await call('POST', path, { user: EMP, body: { confirm: 'ERASE' } })).status, 403);
  assertEquals((await call('POST', path, { user: OWNER, body: {} })).body.code, 'confirm_required');
  db.rows('company_orgs')[0].status = 'suspended';
  const done = await call('POST', path, { user: OWNER, body: { confirm: 'ERASE' } });
  assertEquals(done.status, 200);
  const { company_lesson_progress, company_roleplay_sessions, company_writing_checks, company_session_attendance, company_activity } = done.body.erased;
  assertEquals([company_lesson_progress, company_roleplay_sessions, company_writing_checks, company_session_attendance, company_activity], [1, 1, 1, 1, 2]);
  assertEquals(db.rows('company_activity').map((row) => row.kind).sort(), ['lesson', 'test']);
  assertEquals(db.rows('company_activity').find((row) => row.kind === 'lesson')!.member_id, M_MGR);
  assertEquals(db.rows('company_attempts').length, 1);
  assertEquals(db.rows('company_members').find((row) => row.id === M_EMP)!.status, 'active');
  const again = await call('POST', path, { user: OWNER, body: { confirm: 'ERASE' } });
  assertEquals(again.body.erased.company_activity, 0);
  assertEquals((await call('POST', `orgs/${ORG}/connect/privacy/people/${M_THEIRS}/erase-learning`, { user: OWNER, body: { confirm: 'ERASE' } })).status, 404);
  assert(db.rows('company_audit').some((row) => row.action === 'privacy.learning_erased'));
});

Deno.test('privacy summary counts people and sharing', async () => {
  const db = world();
  db.rows('company_members').find((row) => row.id === M_EMP)!.consent_at = iso(-DAY);
  db.rows('company_attempts').push({ id: 'c1', org_id: ORG, member_id: null }, { id: 'c2', org_id: ORG, member_id: M_EMP }, { id: 'c3', org_id: OTHER, member_id: null });
  const call = testHandler(db, routes, { now: () => NOW });
  assertEquals((await call('GET', `orgs/${ORG}/connect/privacy/summary`, { user: MGR })).status, 403);
  const { body } = await call('GET', `orgs/${ORG}/connect/privacy/summary`, { user: OWNER });
  assertEquals(body.counts.people_active, 3);
  assertEquals(body.counts.sharing, 1);
  assertEquals(body.counts.not_sharing, 2);
  assertEquals(body.counts.candidate_attempts, 1);
  assertEquals(body.counts.staff_attempts, 1);
  const search = await call('GET', `orgs/${ORG}/connect/privacy/people?q=emp`, { user: OWNER });
  assertEquals(search.body.people.map((row: { id: string }) => row.id), [M_EMP]);
  assertEquals((await call('GET', `orgs/${ORG}/connect/privacy/people?q=%25`, { user: OWNER })).body.people.length, 0);
});

Deno.test('audit: filters, names, this workspace only, formula-safe CSV', async () => {
  const db = world();
  db.rows('company_audit').push(
    { id: 1, org_id: ORG, actor: OWNER, action: 'member.invited', target: M_EMP, details: { name: '=HYPERLINK("http://evil")' }, created_at: '2026-11-01T10:00:00Z' },
    { id: 2, org_id: ORG, actor: null, action: 'api.member_created', target: M_MGR, details: {}, created_at: '2026-11-03T10:00:00Z' },
    { id: 3, org_id: ORG, actor: EMP, action: '=evil()', target: null, details: {}, created_at: '2026-11-05T10:00:00Z' },
    { id: 4, org_id: OTHER, actor: null, action: 'member.invited', target: 'theirs', details: {}, created_at: '2026-11-05T10:00:00Z' },
  );
  const call = testHandler(db, routes, { now: () => NOW });
  const base = `orgs/${ORG}/connect/audit`;
  assertEquals((await call('GET', base, { user: EMP })).status, 403);
  const all = await call('GET', base, { user: OWNER });
  assertEquals(all.body.entries.length, 3);
  assertEquals(all.body.entries[2].actor_name, 'owner');
  assertEquals((await call('GET', `${base}?action=member.`, { user: OWNER })).body.entries.length, 1);
  assertEquals((await call('GET', `${base}?action=%25`, { user: OWNER })).body.entries.length, 0);
  assertEquals((await call('GET', `${base}?actor=${OWNER}`, { user: OWNER })).body.entries.length, 1);
  assertEquals((await call('GET', `${base}?target=${M_MGR}`, { user: OWNER })).body.entries.length, 1);
  assertEquals((await call('GET', `${base}?from=2026-11-02&to=2026-11-04`, { user: OWNER })).body.entries.length, 1);
  assertEquals((await call('GET', `${base}?from=2026-02-31`, { user: OWNER })).status, 400);
  assertEquals((await call('GET', `${base}?limit=1`, { user: OWNER })).body.next_offset, 1);
  const file = await call('GET', `${base}/export`, { user: OWNER });
  assertEquals(file.body.rows, 3);
  assert(file.body.csv.includes("'=evil()"));
  assert(!file.body.csv.includes('theirs'));
});
