// Revenue console, invoices, workspace health, lead automation, view as a workspace.
import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';
import { routes as core } from './core.ts';
import { routes as people } from './people.ts';
import { routes as staff } from './staff.ts';
import { healthScore, countsForCompany } from './people/health.ts';
import { contractMonthly, contractTotal, inForce, nextNumber, revenueSummary } from './people/billing.ts';
import { scoreLead } from './people/leads.ts';
import { FakeDb, testHandler } from './testing.ts';
import { stubInvoiceCommands } from './testing-billing.ts';

const STAFF = 'aa000000-0000-4000-8000-000000000001';
const OWNER = 'a1000000-0000-4000-8000-000000000002';
const OTHER = 'a1000000-0000-4000-8000-000000000003';
const ORG = '7a0f5c1e-0000-4000-8000-00000000c0de';
const ORG2 = '7a0f5c1e-0000-4000-8000-00000000c0df';
const NOW = new Date('2026-11-06T07:00:00Z');
const SELLER = { legal_name: 'Staff Typed LLC', tax_id: '123456789', bank_name: 'Staff Typed Bank', mfo: '00014', account: '20208000100000000001' };

function setup() {
  const db = new FakeDb({
    users: [{ id: STAFF, role: 'admin' }, { id: OWNER, role: 'user' }, { id: OTHER, role: 'user' }],
    company_orgs: [
      { id: ORG, name: 'Silk Road Hotels', industry: 'hospitality', size_band: '51-200', status: 'pilot', seats_limit: 0, tests_limit: 10, tests_used: 3, settings: { locale: 'ru' }, contract_ends_at: null, tax_id: '305123456', billing_email: 'hr@example.com', created_at: '2026-01-01T00:00:00Z' },
      { id: ORG2, name: 'Navoi Logistics', industry: 'logistics', size_band: '51-200', status: 'active', seats_limit: 5, tests_limit: null, tests_used: 0, settings: {}, contract_ends_at: null, created_at: '2026-01-01T00:00:00Z' },
    ],
    company_members: [
      { id: 'b0000000-0000-4000-8000-000000000001', org_id: ORG, user_id: OWNER, email: 'o@example.com', full_name: 'Dilnoza', role: 'owner', status: 'active', seat: false, job_role: 'general', consent_at: null, joined_at: '2026-01-01T00:00:00Z' },
      { id: 'b0000000-0000-4000-8000-000000000002', org_id: ORG2, user_id: OTHER, email: 'n@example.com', full_name: 'Sherzod', role: 'owner', status: 'active', seat: false, job_role: 'general', consent_at: null, joined_at: '2026-01-01T00:00:00Z' },
    ],
  });
  const orgSyncs: string[] = [];
  db.rpcs.company_sync_org_access = ({ p_org }) => { orgSyncs.push(String(p_org)); return 1; };
  db.rpcs.company_sync_english_access = () => 'granted';
  stubInvoiceCommands(db);
  return { db, orgSyncs, call: testHandler(db, [...core, ...people, ...staff], { now: () => NOW }) };
}

const contractBody = { title: 'First year', seats: 20, tests: 100, price_per_seat: 600000, tests_fee: 1000000, term_months: 12 };

async function signed(call: ReturnType<typeof setup>['call'], org = ORG) {
  const made = await call('POST', `staff/orgs/${org}/contracts`, { user: STAFF, body: contractBody });
  assertEquals(made.status, 200);
  const signedOne = await call('PATCH', `staff/contracts/${made.body.contract.id}`, { user: STAFF, body: { status: 'signed' } });
  assertEquals(signedOne.status, 200);
  return signedOne.body.contract;
}

async function invoiceFor(call: ReturnType<typeof setup>['call'], contractId?: string, org = ORG) {
  await call('PUT', 'staff/billing-settings', { user: STAFF, body: SELLER });
  const made = await call('POST', `staff/orgs/${org}/invoices`, { user: STAFF, body: { contract_id: contractId, lines: [{ description: 'Seats', quantity: 20, unit_price: 600000 }], vat_percent: 12, due_date: '2026-11-20' } });
  assertEquals(made.status, 200);
  return made.body.invoice;
}

Deno.test('every new staff route is for staff only', async () => {
  const { call } = setup();
  for (const path of ['staff/revenue', 'staff/health', 'staff/billing-settings', `staff/orgs/${ORG}/billing`, `staff/orgs/${ORG}/usage`, `staff/orgs/${ORG}/view`, 'staff/leads/today', 'staff/leads/report']) {
    assertEquals((await call('GET', path, { user: OWNER })).status, 403, path);
    assertEquals((await call('GET', path)).status, 401, path);
  }
});

Deno.test('a contract computes its value and monthly revenue from what staff entered', () => {
  assertEquals(contractTotal({ seats: 20, price_per_seat: 600000, tests_fee: 1000000 }), 13_000_000);
  assertEquals(contractMonthly({ seats: 20, price_per_seat: 600000, term_months: 12 }), 1_000_000);
  assert(inForce({ status: 'signed', start_date: '2026-01-01', end_date: '2026-12-31' }, '2026-11-06'));
  assertFalse(inForce({ status: 'signed', start_date: '2026-01-01', end_date: '2026-11-05' }, '2026-11-06'));
  assertFalse(inForce({ status: 'signed', start_date: '2026-12-01', end_date: null }, '2026-11-06'));
  assertFalse(inForce({ status: 'quote', start_date: null, end_date: null }, '2026-11-06'));
});

Deno.test('signing fills start, end and a renewal reminder, without touching the plan', async () => {
  const { db, call, orgSyncs } = setup();
  const contract = await signed(call);
  assertEquals([contract.start_date, contract.end_date, contract.renewal_date], ['2026-11-06', '2027-11-05', '2027-10-06']);
  assertEquals([contract.total, contract.monthly], [13_000_000, 1_000_000]);
  const org = db.rows('company_orgs')[0];
  assertEquals([org.status, org.seats_limit], ['pilot', 0]);
  assertEquals(orgSyncs, []);
  assertEquals(db.rows('company_audit').filter((row) => row.action === 'contract.updated').length, 1);
});

Deno.test('contracts validate their fields and only exist in UZS', async () => {
  const { call } = setup();
  const url = `staff/orgs/${ORG}/contracts`;
  assertEquals((await call('POST', url, { user: STAFF, body: { title: 'x' } })).status, 400);
  assertEquals((await call('POST', url, { user: STAFF, body: { title: 'Good', seats: -1 } })).status, 400);
  assertEquals((await call('POST', url, { user: STAFF, body: { title: 'Good', status: 'won' } })).status, 400);
  assertEquals((await call('POST', url, { user: STAFF, body: { title: 'Good', term_months: 0 } })).status, 400);
  assertEquals((await call('POST', url, { user: STAFF, body: { title: 'Good', start_date: '2030-02-31' } })).status, 400);
  assertEquals((await call('POST', url, { user: STAFF, body: { title: 'Bad\u0000' } })).status, 400);
  const back = await call('POST', url, { user: STAFF, body: { title: 'Good', start_date: '2027-02-01', end_date: '2027-01-01' } });
  assertEquals([back.status, back.body.code], [400, 'dates_order']);
  assertEquals((await call('POST', url, { user: STAFF, body: { title: 'Good', currency: 'USD' } })).body.contract.currency, 'UZS');
  assertEquals((await call('POST', `staff/orgs/${crypto.randomUUID()}/contracts`, { user: STAFF, body: { title: 'Good' } })).status, 404);
});

Deno.test('the revenue console adds up pipeline, monthly revenue, expiring, renewals and overdue', async () => {
  const { db, call } = setup();
  const live = await signed(call);
  await call('POST', `staff/orgs/${ORG2}/contracts`, { user: STAFF, body: { ...contractBody, title: 'Quote', status: 'sent' } });
  await call('POST', `staff/orgs/${ORG2}/contracts`, { user: STAFF, body: { ...contractBody, title: 'Lost', status: 'lost' } });
  await call('PATCH', `staff/contracts/${live.id}`, { user: STAFF, body: { end_date: '2026-12-01', renewal_date: '2026-11-10' } });
  db.rows('company_orgs')[1].contract_ends_at = '2026-12-20T18:59:59Z';
  await invoiceFor(call, live.id);
  db.rows('company_invoices')[0].due_date = '2026-11-01';
  const view = await call('GET', 'staff/revenue', { user: STAFF });
  assertEquals(view.status, 200);
  const { summary } = view.body;
  assertEquals(summary.pipeline_value, 13_000_000);
  assertEquals(summary.pipeline_count, 1);
  assertEquals(summary.mrr, 1_000_000);
  assertEquals(summary.overdue_count, 1);
  assertEquals(summary.overdue_total, 13_440_000);
  assertEquals(view.body.overdue[0].days_overdue, 5);
  assertEquals(view.body.renewals.map((row: { contract_id: string }) => row.contract_id), [live.id]);
  // The signed contract and the plan end of a workspace with no signed contract.
  assertEquals(view.body.expiring.map((row: { org_id: string; ends_on: string }) => [row.org_id, row.ends_on]), [[ORG, '2026-12-01'], [ORG2, '2026-12-20']]);
});

Deno.test('a renewal opens one quote from the day after the contract ends', async () => {
  const { db, call } = setup();
  const live = await signed(call);
  const first = await call('POST', `staff/contracts/${live.id}/renew`, { user: STAFF });
  assertEquals([first.body.contract.status, first.body.contract.start_date, first.body.contract.end_date], ['quote', '2027-11-06', '2028-11-05']);
  const second = await call('POST', `staff/contracts/${live.id}/renew`, { user: STAFF });
  assertEquals(second.body.duplicate, true);
  assertEquals(db.rows('company_contracts').length, 2);
  // Once renewed, it leaves the reminder list.
  await call('PATCH', `staff/contracts/${live.id}`, { user: STAFF, body: { renewal_date: '2026-11-07' } });
  assertEquals((await call('GET', 'staff/revenue', { user: STAFF })).body.renewals.length, 0);
});

Deno.test('Schood’s details are never invented: no invoice until staff enter them', async () => {
  const { db, call } = setup();
  const lines = [{ description: 'Seats', quantity: 1, unit_price: 100 }];
  const refused = await call('POST', `staff/orgs/${ORG}/invoices`, { user: STAFF, body: { lines } });
  assertEquals([refused.status, refused.body.code], [409, 'seller_details_missing']);
  assertEquals(db.rows('company_invoices').length, 0);
  assertEquals((await call('GET', 'staff/billing-settings', { user: STAFF })).body.settings, null);
  const bad = await call('PUT', 'staff/billing-settings', { user: STAFF, body: { ...SELLER, mfo: '12' } });
  assertEquals([bad.status, bad.body.field], [400, 'mfo']);
  assertEquals((await call('PUT', 'staff/billing-settings', { user: STAFF, body: { ...SELLER, account: '123' } })).body.field, 'account');
  assertEquals((await call('PUT', 'staff/billing-settings', { user: STAFF, body: { ...SELLER, tax_id: 'abc' } })).body.field, 'tax_id');
  assertEquals((await call('PUT', 'staff/billing-settings', { user: STAFF, body: SELLER })).status, 200);
  assertEquals((await call('GET', `staff/orgs/${ORG}/billing`, { user: STAFF })).body.seller_ready, true);
  assertEquals((await call('POST', `staff/orgs/${ORG}/invoices`, { user: STAFF, body: { lines } })).status, 200);
});

Deno.test('invoices take numbers in sequence, copy the details and compute VAT', async () => {
  const { db, call } = setup();
  await call('PUT', `staff/orgs/${ORG}/billing`, { user: STAFF, body: { legal_name: 'Silk Road Hotels LLC', bank_name: 'Buyer Bank', mfo: '00123', account: '20208000200000000002', tax_id: '305123456' } });
  const first = await invoiceFor(call);
  assertEquals(first.number, 'S-2026-00001');
  assertEquals([first.subtotal, first.vat_amount, first.total, first.status], [12_000_000, 1_440_000, 13_440_000, 'issued']);
  assertEquals(first.seller.legal_name, 'Staff Typed LLC');
  assertEquals([first.buyer.legal_name, first.buyer.mfo, first.buyer.tax_id], ['Silk Road Hotels LLC', '00123', '305123456']);
  assertEquals((await invoiceFor(call)).number, 'S-2026-00002');
  // A later change never rewrites an issued document, unless staff refresh it before any payment.
  await call('PUT', 'staff/billing-settings', { user: STAFF, body: { ...SELLER, legal_name: 'Renamed LLC' } });
  assertEquals(db.rows('company_invoices')[0].seller, first.seller);
  const refreshed = await call('PATCH', `staff/invoices/${first.id}`, { user: STAFF, body: { refresh_details: true } });
  assertEquals(refreshed.body.invoice.seller.legal_name, 'Renamed LLC');
  // Validation.
  const url = `staff/orgs/${ORG}/invoices`;
  assertEquals((await call('POST', url, { user: STAFF, body: { lines: [] } })).status, 400);
  assertEquals((await call('POST', url, { user: STAFF, body: { lines: [{ description: 'x', quantity: 0, unit_price: 5 }] } })).status, 400);
  assertEquals((await call('POST', url, { user: STAFF, body: { lines: [{ description: 'x', quantity: 1, unit_price: 0 }] } })).body.code, 'invoice_empty');
  assertEquals((await call('POST', url, { user: STAFF, body: { lines: [{ description: 'x', quantity: 1, unit_price: 5 }], vat_percent: 101 } })).status, 400);
  assertEquals((await call('POST', url, { user: STAFF, body: { lines: [{ description: 'x', quantity: 1, unit_price: 5 }], issue_date: '2026-11-06', due_date: '2026-11-01' } })).body.code, 'dates_order');
});

Deno.test('the number sequence survives another tab taking the next one first', async () => {
  const db = new FakeDb();
  assertEquals(await nextNumber(db, 'invoice', 2026), 'S-2026-00001');
  assertEquals(await nextNumber(db, 'act', 2026), 'A-2026-00001');
  assertEquals(await nextNumber(db, 'invoice', 2027), 'S-2027-00001');
  const numbers = await Promise.all([nextNumber(db, 'invoice', 2026), nextNumber(db, 'invoice', 2026), nextNumber(db, 'invoice', 2026)]);
  assertEquals(new Set(numbers).size, 3);
});

Deno.test('a contract from another workspace cannot go on an invoice', async () => {
  const { call } = setup();
  const live = await signed(call, ORG2);
  await call('PUT', 'staff/billing-settings', { user: STAFF, body: SELLER });
  const refused = await call('POST', `staff/orgs/${ORG}/invoices`, { user: STAFF, body: { contract_id: live.id, lines: [{ description: 'x', quantity: 1, unit_price: 5 }] } });
  assertEquals([refused.status, refused.body.code], [404, 'contract_not_found']);
});

Deno.test('payments add up from the rows; a double click and an overpayment do nothing', async () => {
  const { db, call } = setup();
  const invoice = await invoiceFor(call);
  const url = `staff/invoices/${invoice.id}/payments`;
  const part = await call('POST', url, { user: STAFF, body: { amount: 3_000_000, paid_on: '2026-11-05', reference: 'PP-14', key: 'form-key-0001' } });
  assertEquals([part.body.invoice.status, part.body.invoice.paid_amount, part.body.invoice.balance], ['partial', 3_000_000, 10_440_000]);
  const again = await call('POST', url, { user: STAFF, body: { amount: 3_000_000, paid_on: '2026-11-05', key: 'form-key-0001' } });
  assertEquals([again.body.duplicate, again.body.invoice.paid_amount], [true, 3_000_000]);
  assertEquals(db.rows('company_invoice_payments').length, 1);
  const tooMuch = await call('POST', url, { user: STAFF, body: { amount: 99_000_000 } });
  assertEquals([tooMuch.status, tooMuch.body.code, tooMuch.body.balance], [409, 'payment_too_large', 10_440_000]);
  assertEquals((await call('POST', url, { user: STAFF, body: { amount: 5, paid_on: '2026-11-07' } })).body.code, 'payment_in_future');
  assertEquals((await call('POST', url, { user: STAFF, body: { amount: 0 } })).status, 400);
  const rest = await call('POST', url, { user: STAFF, body: { amount: 10_440_000, paid_on: '2026-11-06', key: 'form-key-0002' } });
  assertEquals([rest.body.invoice.status, rest.body.invoice.paid_on, rest.body.invoice.balance], ['paid', '2026-11-06', 0]);
  // Taking one back reopens the invoice.
  const payment = db.rows('company_invoice_payments')[1].id as string;
  const removed = await call('DELETE', `${url}/${payment}`, { user: STAFF });
  assertEquals([removed.body.invoice.status, removed.body.invoice.paid_amount], ['partial', 3_000_000]);
  assertEquals((await call('DELETE', `${url}/${crypto.randomUUID()}`, { user: STAFF })).status, 404);
  // An invoice with payments cannot be cancelled.
  assertEquals((await call('POST', `staff/invoices/${invoice.id}/void`, { user: STAFF })).body.code, 'invoice_has_payments');
});

Deno.test('a racing second tab on the same form key gets a friendly answer, not a 500', async () => {
  const { db, call } = setup();
  const invoice = await invoiceFor(call);
  db.uniques.company_invoice_payments = [{ columns: ['invoice_id', 'client_key'] }];
  await db.from('company_invoice_payments').insert({ invoice_id: invoice.id, org_id: ORG, amount: 5, paid_on: '2026-11-06', client_key: 'race-key-0001' });
  // The pre-check misses it when the first tab lands in between: simulated with a different read order.
  const seen = await call('POST', `staff/invoices/${invoice.id}/payments`, { user: STAFF, body: { amount: 5, key: 'race-key-0001' } });
  assertEquals([seen.status, seen.body.duplicate], [200, true]);
});

Deno.test('marking paid changes nothing on the plan; activating is one staff click', async () => {
  const { db, call, orgSyncs } = setup();
  const live = await signed(call);
  const invoice = await invoiceFor(call, live.id);
  const org = db.rows('company_orgs')[0];
  const url = `staff/invoices/${invoice.id}/activate`;
  const early = await call('POST', url, { user: STAFF });
  assertEquals([early.status, early.body.code], [409, 'invoice_unpaid']);
  await call('POST', `staff/invoices/${invoice.id}/payments`, { user: STAFF, body: { amount: invoice.total, key: 'form-key-0003' } });
  assertEquals([org.status, org.seats_limit], ['pilot', 0]);
  assertEquals(orgSyncs, []);
  const done = await call('POST', url, { user: STAFF });
  assertEquals([done.status, done.body.duplicate, done.body.synced], [200, false, 1]);
  assertEquals([org.status, org.seats_limit, org.tests_limit], ['active', 20, 103]);
  assertEquals(org.contract_ends_at, '2027-11-05T18:59:59.000Z');
  assertEquals(orgSyncs, [ORG]);
  // Again: nothing more happens.
  const twice = await call('POST', url, { user: STAFF });
  assertEquals(twice.body.duplicate, true);
  assertEquals(orgSyncs, [ORG]);
  assertEquals(db.rows('company_audit').filter((row) => row.action === 'invoice.activated').length, 1);
});

Deno.test('activating refuses to drop below seats in use, and a closed workspace', async () => {
  const { db, call } = setup();
  const invoice = await invoiceFor(call);
  await call('POST', `staff/invoices/${invoice.id}/payments`, { user: STAFF, body: { amount: invoice.total } });
  db.rows('company_members')[0].seat = true;
  const low = await call('POST', `staff/invoices/${invoice.id}/activate`, { user: STAFF, body: { seats_limit: 0 } });
  assertEquals([low.status, low.body.code, low.body.used], [409, 'seats_below_used', 1]);
  assertEquals(db.rows('company_invoices')[0].activated_at, null);
  assertEquals((await call('POST', `staff/invoices/${invoice.id}/activate`, { user: STAFF, body: { contract_ends_at: '2020-01-01', seats_limit: 5 } })).body.code, 'contract_end_past');
  db.rows('company_orgs')[0].status = 'closed';
  assertEquals((await call('POST', `staff/invoices/${invoice.id}/activate`, { user: STAFF, body: { seats_limit: 5 } })).body.code, 'org_closed');
});

Deno.test('an act gets one number and keeps it; a cancelled invoice gets none', async () => {
  const { call } = setup();
  const invoice = await invoiceFor(call);
  const act = await call('POST', `staff/invoices/${invoice.id}/act`, { user: STAFF, body: { act_date: '2026-12-01' } });
  assertEquals([act.body.invoice.act_number, act.body.invoice.act_date], ['A-2026-00001', '2026-12-01']);
  const again = await call('POST', `staff/invoices/${invoice.id}/act`, { user: STAFF, body: { act_date: '2026-12-02' } });
  assertEquals([again.body.invoice.act_number, again.body.invoice.act_date], ['A-2026-00001', '2026-12-02']);
  const other = await invoiceFor(call);
  assertEquals((await call('POST', `staff/invoices/${other.id}/void`, { user: STAFF })).body.invoice.status, 'void');
  assertEquals((await call('POST', `staff/invoices/${other.id}/act`, { user: STAFF, body: {} })).body.code, 'invoice_void');
});

Deno.test('revenue summary counts overdue only for what is still owed', () => {
  const base = { org_id: ORG, contract_id: null, act_number: null, act_date: null, issue_date: '2026-10-01', currency: 'UZS', lines: [], subtotal: 0, vat_percent: 0, vat_amount: 0, paid_on: null, seller: {}, buyer: {}, notes: null, activated_at: null, created_at: '', updated_at: '', id: '', number: '' };
  const summary = revenueSummary([], [
    { ...base, status: 'partial', due_date: '2026-11-01', total: 100, paid_amount: 40 },
    { ...base, status: 'issued', due_date: '2026-12-01', total: 50, paid_amount: 0 },
    { ...base, status: 'paid', due_date: '2026-10-01', total: 70, paid_amount: 70 },
  ], '2026-11-06');
  assertEquals([summary.outstanding, summary.overdue_total, summary.overdue_count], [110, 60, 1]);
});

Deno.test('health: scores from real signals, and a pilot is not marked down for seats it cannot have', () => {
  const base = { people: 10, active_learners: 6, seats_used: 7, seats_limit: 10, tests_used: 5, tests_limit: 100, tests_recent: 2, last_hr_at: '2026-11-05T00:00:00Z' };
  const org = { status: 'active' as const, contract_ends_at: null };
  const strong = healthScore(base, org, NOW);
  assertEquals([strong.score, strong.band, strong.reasons], [100, 'healthy', []]);
  const quiet = healthScore({ ...base, active_learners: 0, seats_used: 1, tests_recent: 0, last_hr_at: '2026-08-01T00:00:00Z' }, org, NOW);
  assertEquals(quiet.band, 'at_risk');
  assertEquals(quiet.reasons, ['no_learners', 'tests_idle', 'seats_idle', 'hr_silent']);
  const pilot = healthScore({ ...base, seats_limit: 0, seats_used: 0 }, { status: 'pilot', contract_ends_at: null }, NOW);
  assertEquals(pilot.score, 100);
  const ending = healthScore(base, { status: 'active', contract_ends_at: '2026-11-20T00:00:00Z' }, NOW);
  assertEquals(ending.reasons, ['contract_ending']);
  assertEquals(healthScore(base, { status: 'active', contract_ends_at: '2026-10-20T00:00:00Z' }, NOW).reasons, ['contract_ended']);
});

Deno.test('Schood English minutes count only from the later of joining and agreeing', () => {
  const member = { joined_at: '2026-10-01T00:00:00Z', consent_at: '2026-10-10T00:00:00Z' };
  assert(countsForCompany({ kind: 'english', created_at: '2026-10-11T00:00:00Z' }, member));
  assertFalse(countsForCompany({ kind: 'english', created_at: '2026-10-05T00:00:00Z' }, member));
  assertFalse(countsForCompany({ kind: 'english', created_at: '2026-10-11T00:00:00Z' }, { joined_at: member.joined_at, consent_at: null }));
  assert(countsForCompany({ kind: 'lesson', created_at: '2026-10-05T00:00:00Z' }, { joined_at: member.joined_at, consent_at: null }));
});

Deno.test('the health list ranks worst first, flags churn risk and pages past 1,000 rows', async () => {
  const { db, call } = setup();
  db.maxRows = 1000;
  const members = db.rows('company_members');
  for (let index = 0; index < 1100; index++) members.push({ id: crypto.randomUUID(), org_id: ORG2, user_id: null, role: 'employee', status: 'active', seat: false, consent_at: '2026-01-01T00:00:00Z', joined_at: '2026-01-01T00:00:00Z' });
  for (let index = 0; index < 1100; index++) db.rows('company_activity').push({ id: index + 1, org_id: ORG2, member_id: members[2 + index].id, kind: 'lesson', minutes: 5, created_at: '2026-11-01T00:00:00Z' });
  db.rows('company_members')[0].last_seen_at = '2026-11-05T00:00:00Z';
  const view = await call('GET', 'staff/health', { user: STAFF });
  assertEquals(view.status, 200);
  const navoi = view.body.workspaces.find((row: { id: string }) => row.id === ORG2);
  assertEquals(navoi.signals.people, 1100);
  assertEquals(navoi.signals.active_learners, 1100);
  const silk = view.body.workspaces.find((row: { id: string }) => row.id === ORG);
  assertEquals(silk.signals.last_hr_at, '2026-11-05T00:00:00Z');
  assert(view.body.workspaces[0].score <= view.body.workspaces[1].score);
});

Deno.test('usage over time buckets by Tashkent week, with no names in it', async () => {
  const { db, call } = setup();
  const member = 'b0000000-0000-4000-8000-000000000001';
  db.rows('company_members')[0].consent_at = '2026-01-01T00:00:00Z';
  db.rows('company_activity').push(
    { id: 1, org_id: ORG, member_id: member, kind: 'lesson', minutes: 10, created_at: '2026-11-02T00:00:00Z' },
    // Sunday 20:00 UTC is already Monday in Tashkent.
    { id: 2, org_id: ORG, member_id: member, kind: 'lesson', minutes: 5, created_at: '2026-11-01T20:00:00Z' },
    // A missing member cannot contribute private activity.
    { id: 3, org_id: ORG, member_id: crypto.randomUUID(), kind: 'english', minutes: 99, created_at: '2026-11-02T00:00:00Z' },
    { id: 4, org_id: ORG2, member_id: 'b0000000-0000-4000-8000-000000000002', kind: 'lesson', minutes: 50, created_at: '2026-11-02T00:00:00Z' },
  );
  db.rows('company_attempts').push({ id: crypto.randomUUID(), org_id: ORG, started_at: '2026-11-03T00:00:00Z' });
  const view = await call('GET', `staff/orgs/${ORG}/usage`, { user: STAFF });
  assertEquals(view.body.weeks.length, 12);
  assertEquals(view.body.weeks.at(-1), { week: '2026-11-02', learners: 1, minutes: 15, tests: 1 });
  assert(!JSON.stringify(view.body).includes('Dilnoza'));
});

Deno.test('staff usage, health and read-only view exclude learning when consent is absent or withdrawn', async () => {
  const { db, call } = setup();
  const member = db.rows('company_members')[0];
  member.role = 'employee';
  db.rows('company_activity').push({ id: 1, org_id: ORG, member_id: member.id, kind: 'lesson', minutes: 77, created_at: '2026-11-03T00:00:00Z' });
  db.rows('company_attempts').push({ id: crypto.randomUUID(), org_id: ORG, started_at: '2026-11-03T00:00:00Z' });
  for (const consent of [null, '2026-01-01T00:00:00Z', null]) {
    member.consent_at = consent;
    const usage = await call('GET', `staff/orgs/${ORG}/usage`, { user: STAFF });
    assertEquals(usage.body.signals.active_learners, consent ? 1 : 0);
    assertEquals(usage.body.weeks.at(-1), { week: '2026-11-02', learners: consent ? 1 : 0, minutes: consent ? 77 : 0, tests: 1 });
    const health = await call('GET', 'staff/health', { user: STAFF });
    assertEquals(health.body.workspaces.find((row: { id: string }) => row.id === ORG).signals.active_learners, consent ? 1 : 0);
    const view = await call('GET', `staff/orgs/${ORG}/view`, { user: STAFF });
    assertEquals(view.body.weeks.at(-1).minutes, consent ? 77 : 0);
  }
});

Deno.test('invoice creation rejects totals beyond exact integer arithmetic before issuing a number', async () => {
  const { db, call } = setup();
  await call('PUT', 'staff/billing-settings', { user: STAFF, body: SELLER });
  const made = await call('POST', `staff/orgs/${ORG}/invoices`, { user: STAFF, body: {
    lines: [{ description: 'Large order', quantity: 1_000_000, unit_price: 10_000_000_000 }], vat_percent: 12,
  } });
  assertEquals([made.status, made.body.code, made.body.field], [400, 'invalid_field', 'lines']);
  assertEquals(db.rows('company_invoices').length, 0);
  assertEquals(db.rows('company_doc_counters').length, 0);
});

Deno.test('VAT rounding stays exact for a large supported invoice and a fractional percentage', async () => {
  const { call } = setup();
  await call('PUT', 'staff/billing-settings', { user: STAFF, body: SELLER });
  const made = await call('POST', `staff/orgs/${ORG}/invoices`, { user: STAFF, body: {
    lines: [{ description: 'Large recorded line', quantity: 404602, unit_price: 10_000_000_000 }, { description: 'Adjustment', quantity: 1, unit_price: 6_843_169_285 }], vat_percent: 0.07,
  } });
  assertEquals(made.status, 200);
  assertEquals(made.body.invoice.subtotal, 4_046_026_843_169_285);
  assertEquals(made.body.invoice.vat_amount, 2_832_218_790_218);
  assertEquals(made.body.invoice.total, 4_048_859_061_959_503);
});

Deno.test('lead score reads only stored fields and explains itself', () => {
  const lead = { size_band: '1000+', interests: ['hiring', 'training'], phone: '+998', email: 'a@b.c', job_title: 'HR', need: 'We need to test thirty reception staff.', source: 'landing', created_at: '2026-11-05T00:00:00Z', industry: 'banking' };
  const strong = scoreLead(lead, NOW);
  assertEquals(strong.score, 30 + 10 + 10 + 5 + 5 + 10 + 5 + 5);
  assert(strong.reasons.includes('size_1000'));
  const weak = scoreLead({ size_band: null, interests: null, phone: null, email: 'a@b.c', job_title: null, need: null, source: 'landing', created_at: '2026-01-01T00:00:00Z', industry: null }, NOW);
  assertEquals(weak.score, 5);
  assertEquals(scoreLead({ ...lead, source: 'company_seats' }, NOW).reasons.includes('customer'), true);
});

function leadRow(row: Record<string, unknown>) {
  return { id: crypto.randomUUID(), name: 'A Person', company: 'Co Ltd', job_title: null, phone: null, email: null, size_band: null, industry: null, interests: [], need: null, locale: 'ru', status: 'new', notes: null, follow_up_at: null, org_id: null, source: 'landing', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', ...row };
}

Deno.test('today’s calls: late first, then strongest, and nothing already closed', async () => {
  const { db, call } = setup();
  db.rows('company_leads').push(
    leadRow({ company: 'Late', status: 'contacted', follow_up_at: '2026-11-01' }),
    leadRow({ company: 'Today big', status: 'contacted', follow_up_at: '2026-11-06', size_band: '1000+' }),
    leadRow({ company: 'New small', status: 'new' }),
    leadRow({ company: 'Tomorrow', status: 'contacted', follow_up_at: '2026-11-07' }),
    leadRow({ company: 'Won', status: 'won', follow_up_at: '2026-11-01' }),
    leadRow({ company: 'Lost', status: 'lost' }),
  );
  const view = await call('GET', 'staff/leads/today', { user: STAFF });
  assertEquals(view.body.calls.map((row: { company: string }) => row.company), ['Late', 'Today big', 'New small']);
  assertEquals(view.body.calls[0].days_late, 5);
  assertEquals(view.body.upcoming, 1);
  // The list of all requests carries the score as well.
  const all = await call('GET', 'staff/leads', { user: STAFF });
  assert(all.body.leads.every((row: { score: number; reasons: string[] }) => typeof row.score === 'number' && Array.isArray(row.reasons)));
  // And the single lead path still works beside the fixed ones.
  assertEquals((await call('GET', `staff/leads/${db.rows('company_leads')[0].id}`, { user: STAFF })).status, 200);
});

Deno.test('source report groups by the stored source and counts a workspace’s value once', async () => {
  const { db, call } = setup();
  const live = await signed(call);
  db.rows('company_leads').push(
    leadRow({ source: 'landing', status: 'won', org_id: ORG }),
    leadRow({ source: 'company_seats', status: 'new', org_id: ORG }),
    leadRow({ source: 'landing', status: 'lost' }),
    leadRow({ source: null, status: 'new' }),
  );
  const view = await call('GET', 'staff/leads/report', { user: STAFF });
  assertEquals(view.status, 200);
  const landing = view.body.sources.find((row: { source: string }) => row.source === 'landing');
  assertEquals([landing.total, landing.won, landing.lost, landing.won_share], [2, 1, 1, 50]);
  assertEquals(view.body.sources.reduce((sum: number, row: { signed_value: number }) => sum + row.signed_value, 0), live.total);
  assertEquals(view.body.sources.find((row: { source: string }) => row.source === 'unknown').total, 1);
  assertEquals(view.body.total, 4);
});

Deno.test('a request becomes a pilot in one click, and only once', async () => {
  const { db, call } = setup();
  const lead = leadRow({ company: 'Samarkand Grand', name: 'Madina', email: 'madina@example.com', phone: '+998901112233', industry: 'hospitality', size_band: '201-1000', locale: 'uz' });
  db.rows('company_leads').push(lead);
  const converted = await call('POST', `staff/leads/${lead.id}/convert`, { user: STAFF });
  assertEquals(converted.status, 200);
  assertEquals([converted.body.org.name, converted.body.org.status, converted.body.org.tests_limit], ['Samarkand Grand', 'pilot', 10]);
  assertEquals(converted.body.org.settings.locale, 'uz');
  assert(converted.body.link.startsWith('https://company.schood.online/join/'));
  const stored = db.rows('company_leads')[0];
  assertEquals([stored.status, stored.org_id, stored.follow_up_at], ['pilot', converted.body.org.id, '2026-11-13']);
  assertEquals(converted.body.owner.role, 'owner');
  const orgsBefore = db.rows('company_orgs').length;
  const again = await call('POST', `staff/leads/${lead.id}/convert`, { user: STAFF });
  assertEquals([again.status, again.body.code], [409, 'lead_has_workspace']);
  assertEquals(db.rows('company_orgs').length, orgsBefore);
  assertEquals((await call('POST', `staff/leads/${crypto.randomUUID()}/convert`, { user: STAFF })).status, 404);
  assertEquals((await call('POST', `staff/leads/${lead.id}/convert`, { user: OWNER })).status, 403);
});

Deno.test('view as a workspace is read-only, audited and respects consent', async () => {
  const { db, call } = setup();
  const consenting = crypto.randomUUID(), holding = crypto.randomUUID();
  db.rows('company_members').push(
    { id: consenting, org_id: ORG, user_id: OWNER + 'x', email: 'a@example.com', full_name: 'Shares', role: 'employee', status: 'active', seat: true, job_role: 'general', level: 'b1', consent_at: '2026-01-02T00:00:00Z', joined_at: '2026-01-02T00:00:00Z' },
    { id: holding, org_id: ORG, user_id: OWNER + 'y', email: 'b@example.com', full_name: 'Private', role: 'employee', status: 'active', seat: false, job_role: 'general', level: 'a2', consent_at: null, joined_at: '2026-01-02T00:00:00Z' },
  );
  db.rows('company_activity').push(
    { id: 1, org_id: ORG, member_id: consenting, kind: 'lesson', minutes: 20, created_at: '2026-11-01T00:00:00Z' },
    { id: 2, org_id: ORG, member_id: holding, kind: 'lesson', minutes: 30, created_at: '2026-11-01T00:00:00Z' },
  );
  const before = JSON.stringify(db.tables.company_members);
  const view = await call('GET', `staff/orgs/${ORG}/view`, { user: STAFF });
  assertEquals(view.status, 200);
  assertEquals(view.body.read_only, true);
  const person = (name: string) => view.body.people.find((row: { name: string }) => row.name === name);
  assertEquals(person('Shares').minutes_30d, 20);
  assertEquals(person('Private').minutes_30d, null);
  assertEquals(JSON.stringify(db.tables.company_members), before);
  const audit = db.rows('company_audit').filter((row) => row.action === 'staff.view_as');
  assertEquals([audit.length, audit[0].org_id, audit[0].actor], [1, ORG, STAFF]);
  assertEquals((await call('GET', `staff/orgs/${crypto.randomUUID()}/view`, { user: STAFF })).status, 404);
});

Deno.test('staff add a request by hand, warned once about a likely duplicate', async () => {
  const { db, call } = setup();
  const body = { company: 'Referral Co', name: 'Aziza', phone: '+998 90 111 22 33', source: 'referral', follow_up_at: '2026-11-07' };
  assertEquals((await call('POST', 'staff/leads', { user: OWNER, body })).status, 403);
  const made = await call('POST', 'staff/leads', { user: STAFF, body });
  assertEquals(made.status, 200);
  assertEquals([made.body.lead.source, made.body.lead.status, made.body.lead.follow_up_at], ['referral', 'new', '2026-11-07']);
  const dup = await call('POST', 'staff/leads', { user: STAFF, body: { ...body, company: 'Other Co', phone: '998901112233' } });
  assertEquals([dup.status, dup.body.code, dup.body.company], [409, 'lead_duplicate', 'Referral Co']);
  assertEquals((await call('POST', 'staff/leads', { user: STAFF, body: { ...body, company: 'Other Co', force: true } })).status, 200);
  assertEquals(db.rows('company_leads').length, 2);
  assertEquals((await call('POST', 'staff/leads', { user: STAFF, body: { company: 'X Co', name: 'No contact' } })).body.code, 'contact_required');
  assertEquals((await call('POST', 'staff/leads', { user: STAFF, body: { ...body, source: 'magic' } })).status, 400);
  assertEquals((await call('POST', 'staff/leads', { user: STAFF, body: { ...body, phone: 'abc' } })).body.field, 'phone');
  assertEquals((await call('POST', 'staff/leads', { user: STAFF, body: { ...body, follow_up_at: '2026-02-31', force: true } })).status, 400);
});

Deno.test('the staff morning view adds up calls, renewals, overdue invoices and churn risk', async () => {
  const { db, call } = setup();
  assertEquals((await call('GET', 'staff/today', { user: OWNER })).status, 403);
  const empty = await call('GET', 'staff/today', { user: STAFF });
  assertEquals([empty.body.calls_count, empty.body.renewals_count, empty.body.overdue_count, empty.body.mrr], [0, 0, 0, 0]);
  const live = await signed(call);
  await call('PATCH', `staff/contracts/${live.id}`, { user: STAFF, body: { renewal_date: '2026-11-08' } });
  await invoiceFor(call, live.id);
  db.rows('company_invoices')[0].due_date = '2026-11-01';
  db.rows('company_leads').push(leadRow({ company: 'Call me', status: 'new' }));
  const today = await call('GET', 'staff/today', { user: STAFF });
  assertEquals(today.status, 200);
  assertEquals([today.body.calls_count, today.body.renewals_count, today.body.overdue_count, today.body.mrr], [1, 1, 1, 1_000_000]);
  assertEquals(today.body.calls[0].company, 'Call me');
  assertEquals(today.body.overdue[0].days_overdue, 5);
  // Pilots older than two weeks that are at risk appear as churn risk.
  assert(today.body.churn_count >= 1);
});

Deno.test('the printable offer shows only what staff entered', async () => {
  const { call } = setup();
  const live = await signed(call);
  assertEquals((await call('GET', `staff/contracts/${live.id}`, { user: OWNER })).status, 403);
  const before = await call('GET', `staff/contracts/${live.id}`, { user: STAFF });
  assertEquals([before.status, before.body.seller, before.body.contract.total, before.body.org.id], [200, null, 13_000_000, ORG]);
  await call('PUT', 'staff/billing-settings', { user: STAFF, body: SELLER });
  assertEquals((await call('GET', `staff/contracts/${live.id}`, { user: STAFF })).body.seller.legal_name, 'Staff Typed LLC');
  assertEquals((await call('GET', `staff/contracts/${crypto.randomUUID()}`, { user: STAFF })).status, 404);
});
