// V2 routes against real PostgREST: scopes, privacy, reports, company operations
// and concurrent invoice commands. No external messages or production data.
import type { V2Harness } from './company-postgrest-v2-harness.ts';

const shift = (days: number) => new Date(Date.now() + days * 86_400_000 + 5 * 3_600_000).toISOString().slice(0, 10);
const instant = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

export async function insightsOpsV2(h: V2Harness) {
  const { call, area, eq, ok, need, db, sql, state: S, users: U } = h;
  const o = `orgs/${S.org}`;
  const hr = { as: U.admin }, staff = { as: U.staff }, manager = { as: U.manager }, employee = { as: U.employee };

  await area('v2 insights: requirements, skills, risk and reporting scope', async () => {
    const priorDepartment = (await db.from('company_members').select('department_id').eq('id', S.emp2Member).single()).data.department_id;
    await db.from('company_members').update({ department_id: S.deptSales }).eq('id', S.emp2Member);
    const created = await call('POST', `${o}/insights/requirements`, { ...hr, body: { department_id: S.deptFront, job_role: 'procurement', level: 'b2', skills: { speaking: 'b2' }, due_date: shift(30) } });
    const id = need(created.body.requirement?.id, 'requirement id');
    await call('GET', `${o}/insights/requirements`, manager);
    await call('PATCH', `${o}/insights/requirements/${id}`, { ...hr, body: { note: 'Customer-facing role', level: 'b1' } });
    await call('PATCH', `orgs/${S.otherOrg}/insights/requirements/${id}`, { as: U.otherOwner, body: { level: 'c1' }, expect: 404 });
    await call('POST', `${o}/insights/requirements/apply-suggestions`, { ...hr, body: {} });
    await call('POST', `${o}/insights/requirements/sync-targets`, { ...hr, body: {} });
    for (const path of ['insights/skills-gap', 'insights/skills-gap/people', 'insights/at-risk', 'insights/cohorts', 'insights/team']) {
      await call('GET', `${o}/${path}`, hr);
      await call('GET', `${o}/${path}`, { ...employee, expect: 403 });
    }
    await call('GET', `${o}/insights/at-risk?format=csv`, manager);
    await call('GET', `${o}/insights/cohorts?format=csv`, manager);
    const priorConsent = (await db.from('company_members').select('consent_at').eq('id', S.emp2Member).single()).data.consent_at;
    await db.from('company_members').update({ consent_at: null }).eq('id', S.emp2Member);
    const privateProfile = await call('GET', `${o}/members/${S.emp2Member}/profile`, hr);
    eq('profile conceals unshared learning', privateProfile.body.learning, null);
    await call('GET', `${o}/members/${S.emp2Member}/profile`, { ...manager, expect: 404 });
    await db.from('company_members').update({ consent_at: priorConsent }).eq('id', S.emp2Member);
    await call('POST', `${o}/insights/at-risk/${S.emp1Member}/action`, { ...manager, body: { kind: 'nudge', reason: 'no_placement' } });
    await call('POST', `${o}/insights/at-risk/${S.emp1Member}/action`, { ...manager, body: { kind: 'snooze', days: 7 } });
    await call('DELETE', `${o}/insights/at-risk/${S.emp1Member}/snooze`, manager);
    await call('POST', `${o}/insights/at-risk/${S.emp2Member}/action`, { ...manager, body: { kind: 'snooze', days: 7 }, expect: 404 });
    await call('POST', `${o}/insights/at-risk/${S.emp1Member}/assign`, { ...hr, body: { track_code: 'procurement', due_date: shift(30) } });
    await call('DELETE', `${o}/insights/requirements/${id}`, hr);
    await db.from('company_members').update({ department_id: priorDepartment }).eq('id', S.emp2Member);
  });

  await area('v2 insights: spend, executive snapshots and saved report views', async () => {
    const spend = await call('POST', `${o}/insights/spend`, { ...hr, body: { amount: 120000, currency: 'UZS', category: 'other', spent_on: shift(-1), description: 'Recorded company training expense' } });
    const entry = need(spend.body.entry?.id, 'spend entry');
    await call('GET', `${o}/insights/spend`, hr);
    await call('GET', `${o}/insights/spend?format=csv`, hr);
    await call('GET', `${o}/insights/spend`, { ...manager, expect: 403 });
    await call('PATCH', `${o}/insights/spend/${entry}`, { ...hr, body: { amount: 100000 } });
    await call('PATCH', `orgs/${S.otherOrg}/insights/spend/${entry}`, { as: U.otherOwner, body: { amount: 1 }, expect: 404 });
    await call('GET', `${o}/insights/executive`, hr);
    const snap = await call('POST', `${o}/insights/snapshots`, { ...hr, body: {} });
    await call('GET', `${o}/insights/executive?snapshot=${need(snap.body.snapshot?.id, 'snapshot')}`, hr);
    await call('POST', `${o}/insights/executive/narrative`, { ...hr, body: { locale: 'ru' } });
    const config = { rows: 'person', columns: ['people', 'tested', 'minutes', 'avg_score'], filters: {}, period: { preset: 'last_30' } };
    await call('POST', `${o}/insights/builder/run`, { ...manager, body: config });
    await call('POST', `${o}/insights/builder/export`, { ...hr, body: { config } });
    const made = await call('POST', `${o}/insights/views`, { ...manager, body: { name: 'Front desk report', config } });
    const view = need(made.body.view?.id, 'saved view');
    await call('GET', `${o}/insights/views`, manager);
    await call('PATCH', `${o}/insights/views/${view}`, { ...manager, body: { name: 'Front desk last month' } });
    await call('DELETE', `${o}/insights/views/${view}`, hr);
    await call('DELETE', `${o}/insights/spend/${entry}`, hr);
  });

  await area('v2 insights: challenge completion and recurring sessions', async () => {
    const challenge = await call('POST', `${o}/challenges`, { ...hr, body: { title: 'V2 department cup', starts_on: shift(-1), ends_on: shift(3), metric: 'active_days', mode: 'teams', template: 'department_cup', teams: [{ name: 'Front', department_ids: [S.deptFront] }, { name: 'Sales', department_ids: [S.deptSales] }] } });
    await call('POST', `${o}/challenges/${challenge.body.challenge.id}/end`, hr);
    await call('GET', `${o}/challenges/winners`, employee);
    const series = await call('POST', `${o}/sessions/series`, { ...hr, body: { title: 'V2 recurring class', starts_at: instant(1), duration_minutes: 30, repeat: 'weekly', count: 3, department_ids: [S.deptFront] } });
    const session = need(series.body.session?.id, 'series session');
    eq('series creates three classes', series.body.created, 3);
    await call('PATCH', `${o}/sessions/${session}`, { ...hr, body: { trainer_notes: 'Discuss the homework', trainer: 'Company trainer', apply_to_series: true } });
    const learnerSessions = await call('GET', `${o}/sessions`, employee);
    ok('learner session list never includes trainer notes', !JSON.stringify(learnerSessions.body).includes('Discuss the homework'));
    await call('GET', `${o}/sessions/attendance-rates`, manager);
    await call('POST', `${o}/sessions/${session}/cancel-series`, hr);
  });

  await area('v2 people: profile, requests, filters, departments and onboarding', async () => {
    await call('GET', `${o}/profile`, employee);
    await call('PATCH', `${o}/profile`, { ...employee, body: { locale: 'uz' } });
    const data = await call('GET', `${o}/profile/export`, employee);
    eq('personal export belongs to caller', data.body.person.id, S.emp1Member);
    ok('personal export has no invitation hashes', !JSON.stringify(data.body).includes('token_hash'));
    const role = await db.from('company_members').select('job_role').eq('id', S.emp1Member).single();
    const target = role.data.job_role === 'procurement' ? 'sales' : 'procurement';
    const requested = await call('POST', `${o}/profile/requests`, { ...employee, body: { kind: 'job_role', job_role: target } });
    await call('DELETE', `${o}/profile/requests/${requested.body.request.id}`, employee);
    const second = await call('POST', `${o}/profile/requests`, { ...employee, body: { kind: 'job_role', job_role: target } });
    await call('GET', `${o}/people/requests`, hr);
    await call('POST', `${o}/people/requests/${second.body.request.id}`, { ...hr, body: { decision: 'decline' } });
    await call('POST', `${o}/people/bulk`, { ...hr, body: { action: 'target', ids: [S.emp1Member], target_level: 'b2', target_date: shift(60) } });
    const filter = await call('POST', `${o}/people/filters`, { ...manager, body: { name: 'Front desk', filters: { department: S.deptFront } } });
    await call('GET', `${o}/people/filters`, manager);
    await call('DELETE', `${o}/people/filters/${filter.body.filter.id}`, { ...hr, expect: 404 });
    await call('DELETE', `${o}/people/filters/${filter.body.filter.id}`, manager);
    await call('GET', `${o}/people/${S.managerMember}/departments`, hr);
    await call('PUT', `${o}/people/${S.managerMember}/departments`, { ...hr, body: { department_ids: [S.deptSales] } });
    await call('GET', `${o}/search?q=sales`, manager);
    await call('PUT', `${o}/people/${S.managerMember}/departments`, { ...hr, body: { department_ids: [] } });
    await call('GET', `${o}/people/seats/idle`, hr);
    await call('POST', `${o}/people/me/seen`, hr);
    await call('GET', `${o}/onboarding`, hr);
    await call('POST', `${o}/onboarding/dismiss`, { ...hr, body: { dismissed: true } });
    await call('POST', `${o}/onboarding/dismiss`, { ...hr, body: { dismissed: false } });
  });

  await area('v2 operations: billing, concurrent payments and activation', async () => {
    const original = (await db.from('company_orgs').select('seats_limit,tests_limit,contract_ends_at').eq('id', S.org).single()).data;
    await call('GET', 'staff/billing-settings', staff);
    await call('PUT', 'staff/billing-settings', { ...staff, body: { legal_name: 'Fixture Seller LLC', tax_id: '123456789', bank_name: 'Fixture Bank', mfo: '00014', account: '20208000100000000001' } });
    await call('PUT', `staff/orgs/${S.org}/billing`, { ...staff, body: { legal_name: 'Fixture Buyer LLC', tax_id: '305123456', mfo: '00014', account: '20208000100000000002' } });
    await call('GET', `staff/orgs/${S.org}/billing`, staff);
    const made = await call('POST', `staff/orgs/${S.org}/contracts`, { ...staff, body: { title: 'V2 recorded agreement', seats: 5, tests: 20, price_per_seat: 100000, tests_fee: 10000, term_months: 12 } });
    const contract = need(made.body.contract?.id, 'contract');
    await call('PATCH', `staff/contracts/${contract}`, { ...staff, body: { status: 'signed' } });
    await call('GET', `staff/contracts/${contract}`, staff);
    await call('POST', `staff/contracts/${contract}/renew`, staff);
    const invoice = await call('POST', `staff/orgs/${S.org}/invoices`, { ...staff, body: { contract_id: contract, lines: [{ description: 'Recorded seats', quantity: 1, unit_price: 100000 }], vat_percent: 12, due_date: shift(15) } });
    const id = need(invoice.body.invoice?.id, 'invoice');
    eq('invoice VAT arithmetic', invoice.body.invoice.total, 112000);
    await call('GET', `staff/invoices/${id}`, staff);
    await call('PATCH', `staff/invoices/${id}`, { ...staff, body: { notes: 'Verified document' } });
    await call('POST', `staff/invoices/${id}/act`, { ...staff, body: { act_date: shift(0) } });
    const race = await Promise.all(['first', 'second'].map((key) => call('POST', `staff/invoices/${id}/payments`, { ...staff, body: { amount: 80000, key: `v2-payment-${key}` }, expect: [200, 409] })));
    eq('competing payments cannot overpay', race.map((row) => row.status).sort(), [200, 409]);
    eq('payment total remains exact', Number((await db.from('company_invoices').select('paid_amount').eq('id', id).single()).data.paid_amount), 80000);
    await call('POST', `staff/invoices/${id}/payments`, { ...staff, body: { amount: 32000, key: 'v2-payment-remainder' } });
    const override = { seats_limit: original.seats_limit, tests_limit: original.tests_limit, contract_ends_at: original.contract_ends_at?.slice(0, 10) ?? null };
    const activated = await call('POST', `staff/invoices/${id}/activate`, { ...staff, body: override });
    eq('activation performs the staff click once', activated.body.duplicate, false);
    eq('activation retry is idempotent', (await call('POST', `staff/invoices/${id}/activate`, { ...staff, body: override })).body.duplicate, true);
    await call('GET', `${o}/plan`, hr);
    await call('PUT', `${o}/plan/billing`, { ...hr, body: { legal_name: 'Fixture Buyer Updated LLC' } });
    await call('GET', `${o}/plan/invoices/${id}`, hr);
    await call('GET', `orgs/${S.otherOrg}/plan/invoices/${id}`, { as: U.otherOwner, expect: 404 });
    const rows = await db.from('company_invoice_payments').select('id').eq('invoice_id', id);
    for (const payment of rows.data) await call('DELETE', `staff/invoices/${id}/payments/${payment.id}`, staff);
    await call('POST', `staff/invoices/${id}/void`, staff);
    // Preserve the exact pre-scenario timestamp after testing date-based overrides.
    await sql(`update public.company_orgs set contract_ends_at = ${original.contract_ends_at ? `'${original.contract_ends_at}'::timestamptz` : 'null'} where id = '${S.org}';`);
  });

  await area('v2 operations: founder reports, pipeline and audited workspace view', async () => {
    for (const path of ['staff/today', 'staff/revenue', 'staff/health', 'staff/leads/today', 'staff/leads/report', `staff/orgs/${S.org}/usage`, `staff/orgs/${S.org}/view`]) {
      await call('GET', path, staff);
      await call('GET', path, { ...hr, expect: 403 });
    }
    const lead = await call('POST', 'staff/leads', { ...staff, body: { name: 'Fixture Contact', company: 'V2 Fixture Co', email: 'v2-ops-fixture@example.uz', source: 'referral', industry: 'hospitality', size_band: '51-200', follow_up_at: shift(1) } });
    await call('POST', `staff/leads/${need(lead.body.lead?.id, 'lead')}/convert`, { ...staff, body: {} });
    const audit = await db.from('company_audit').select('id').eq('org_id', S.org).eq('action', 'staff.view_as');
    ok('read-only staff view was audited', audit.data.length > 0);
  });
}
