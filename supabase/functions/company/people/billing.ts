// Staff revenue console: quotes and contracts per workspace, invoices, acts and payments.
// Every amount is what staff entered; nothing here knows a price. Marking an invoice paid
// never changes a plan: activating its seats is a separate staff click.
import { HR_ROLES } from '../../../../packages/company-core/src/mod.ts';
import { contractEnded, ORG_COLUMNS } from '../handler.ts';
import { check, checkUnique, CompanyError, UUID, type Ctx, type Db, type OrgRow, type Route } from '../types.ts';
import { inChunks, int, obj, oneOf, tashkentDay, text } from '../util.ts';
import { dateOrNull, DAY, fetchAll, seatCount } from './shared.ts';
import { contractEnd, loadOrg, syncOrg } from './staffshared.ts';

export const CONTRACT_STATUSES = ['quote', 'sent', 'negotiating', 'signed', 'lost', 'ended'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
/** Statuses that count towards pipeline value. */
export const OPEN_CONTRACT = ['quote', 'sent', 'negotiating'] as const;

const CONTRACT_COLUMNS = 'id,org_id,title,status,seats,tests,price_per_seat,tests_fee,term_months,currency,start_date,end_date,renewal_date,signed_at,notes,renewed_from,created_at,updated_at';
const INVOICE_COLUMNS = 'id,org_id,contract_id,number,act_number,act_date,issue_date,due_date,status,currency,lines,subtotal,vat_percent,vat_amount,total,paid_amount,paid_on,seller,buyer,notes,activated_at,created_at,updated_at';
const SELLER_COLUMNS = 'legal_name,tax_id,vat_code,bank_name,mfo,account,address,phone,email,director,updated_at';
const BUYER_COLUMNS = 'org_id,legal_name,vat_code,bank_name,mfo,account,address,director,updated_at';

export interface ContractRow {
  id: string; org_id: string; title: string; status: ContractStatus; seats: number; tests: number | null; price_per_seat: number; tests_fee: number;
  term_months: number; currency: string; start_date: string | null; end_date: string | null; renewal_date: string | null; signed_at: string | null;
  notes: string | null; renewed_from: string | null; created_at: string; updated_at: string;
}
export interface InvoiceLine { description: string; quantity: number; unit_price: number }
export interface InvoiceRow {
  id: string; org_id: string; contract_id: string | null; number: string; act_number: string | null; act_date: string | null; issue_date: string; due_date: string | null;
  status: 'issued' | 'partial' | 'paid' | 'void'; currency: string; lines: InvoiceLine[]; subtotal: number; vat_percent: number; vat_amount: number; total: number;
  paid_amount: number; paid_on: string | null; seller: Record<string, unknown>; buyer: Record<string, unknown>; notes: string | null; activated_at: string | null;
  created_at: string; updated_at: string;
}

const today = (ctx: Ctx) => tashkentDay(ctx.now());
const money = (value: unknown, field: string, max = 10_000_000_000_000) => int(value, field, { min: 0, max })!;

function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** Seats times price for the term, plus any tests fee. */
export const contractTotal = (row: Pick<ContractRow, 'seats' | 'price_per_seat' | 'tests_fee'>): number => row.seats * row.price_per_seat + row.tests_fee;
/** The recurring part per month: seats and price over the term. A tests fee is not recurring. */
export const contractMonthly = (row: Pick<ContractRow, 'seats' | 'price_per_seat' | 'term_months'>): number => Math.round(row.seats * row.price_per_seat / Math.max(1, row.term_months));
/** Signed, started and not yet over, on a Tashkent day. */
export const inForce = (row: Pick<ContractRow, 'status' | 'start_date' | 'end_date'>, day: string): boolean =>
  row.status === 'signed' && (!row.start_date || row.start_date <= day) && (!row.end_date || row.end_date >= day);
export const contractView = (row: ContractRow) => ({ ...row, total: contractTotal(row), monthly: contractMonthly(row) });

/** An invoice's balance and whether it is late, on a Tashkent day. */
export function invoiceView(row: InvoiceRow, day: string) {
  const balance = Math.max(0, row.total - row.paid_amount);
  const overdue = (row.status === 'issued' || row.status === 'partial') && Boolean(row.due_date) && row.due_date! < day;
  return { ...row, balance, overdue, days_overdue: overdue ? Math.round((Date.parse(day) - Date.parse(row.due_date!)) / DAY) : 0 };
}

/** Fills in what signing implies: a start, an end from the term and a renewal reminder a month before it. */
function signingDates(row: { start_date: string | null; end_date: string | null; renewal_date: string | null; term_months: number }, day: string) {
  const start_date = row.start_date ?? day;
  const end_date = row.end_date ?? addDays(addMonths(start_date, row.term_months), -1);
  return { start_date, end_date, renewal_date: row.renewal_date ?? addDays(end_date, -30) };
}

function readContract(input: Record<string, unknown>, current?: ContractRow): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if ('title' in input || !current) patch.title = text(input.title, 'title', { min: 2, max: 160 });
  if ('status' in input) patch.status = oneOf<ContractStatus>(input.status, CONTRACT_STATUSES, 'status');
  if ('seats' in input) patch.seats = int(input.seats, 'seats', { min: 0, max: 100_000 });
  if ('tests' in input) patch.tests = input.tests === null || input.tests === '' ? null : int(input.tests, 'tests', { min: 0, max: 1_000_000 });
  if ('price_per_seat' in input) patch.price_per_seat = money(input.price_per_seat, 'price_per_seat', 10_000_000_000);
  if ('tests_fee' in input) patch.tests_fee = money(input.tests_fee, 'tests_fee');
  if ('term_months' in input) patch.term_months = int(input.term_months, 'term_months', { min: 1, max: 120 });
  if ('start_date' in input) patch.start_date = dateOrNull(input.start_date, 'start_date');
  if ('end_date' in input) patch.end_date = dateOrNull(input.end_date, 'end_date');
  if ('renewal_date' in input) patch.renewal_date = dateOrNull(input.renewal_date, 'renewal_date');
  if ('notes' in input) patch.notes = text(input.notes, 'notes', { max: 4000, optional: true });
  const start = (patch.start_date ?? current?.start_date ?? null) as string | null, end = (patch.end_date ?? current?.end_date ?? null) as string | null;
  if (start && end && end < start) throw new CompanyError('dates_order', 'The end date must not be before the start date.', 400, { field: 'end_date' });
  return patch;
}

/** The next number in a yearly sequence. A compare and swap, so two tabs never get the same one. */
export async function nextNumber(db: Db, kind: 'invoice' | 'act', year: number): Promise<string> {
  const prefix = kind === 'invoice' ? 'S' : 'A';
  check(await db.from('company_doc_counters').upsert({ kind, year, last: 0 }, { onConflict: 'kind,year', ignoreDuplicates: true }));
  for (let tries = 0; tries < 8; tries++) {
    const row = check<{ last: number }>(await db.from('company_doc_counters').select('last').eq('kind', kind).eq('year', year).single());
    const won = check<{ last: number }[]>(await db.from('company_doc_counters').update({ last: row.last + 1 }).eq('kind', kind).eq('year', year).eq('last', row.last).select('last'));
    if (won.length) return `${prefix}-${year}-${String(row.last + 1).padStart(5, '0')}`;
  }
  throw new CompanyError('number_busy', 'Several documents are being issued at once. Try again.', 409);
}

async function loadContract(ctx: Ctx, id: unknown): Promise<ContractRow> {
  if (typeof id !== 'string' || !UUID.test(id)) throw new CompanyError('contract_not_found', 'Contract not found.', 404);
  const row = check<ContractRow | null>(await ctx.db.from('company_contracts').select(CONTRACT_COLUMNS).eq('id', id).maybeSingle());
  if (!row) throw new CompanyError('contract_not_found', 'Contract not found.', 404);
  return row;
}

async function loadInvoice(ctx: Ctx, id: string): Promise<InvoiceRow> {
  if (!UUID.test(id)) throw new CompanyError('invoice_not_found', 'Invoice not found.', 404);
  const row = check<InvoiceRow | null>(await ctx.db.from('company_invoices').select(INVOICE_COLUMNS).eq('id', id).maybeSingle());
  if (!row) throw new CompanyError('invoice_not_found', 'Invoice not found.', 404);
  return row;
}

/** The details on Schood's side of a document, or an error naming what staff still have to fill in. */
async function sellerDetails(ctx: Ctx): Promise<Record<string, unknown>> {
  const row = check<Record<string, unknown> | null>(await ctx.db.from('company_billing_settings').select(SELLER_COLUMNS).eq('id', true).maybeSingle());
  const missing = ['legal_name', 'tax_id', 'bank_name', 'mfo', 'account'].filter((field) => !row?.[field]);
  if (missing.length) throw new CompanyError('seller_details_missing', 'Fill in Schood’s company details before issuing a document.', 409, { missing: missing.join(',') });
  const { updated_at: _updated, ...details } = row!;
  return details;
}

async function buyerDetails(ctx: Ctx, org: OrgRow): Promise<Record<string, unknown>> {
  const row = check<Record<string, unknown> | null>(await ctx.db.from('company_org_billing').select(BUYER_COLUMNS).eq('org_id', org.id).maybeSingle());
  return {
    legal_name: row?.legal_name || org.name, tax_id: org.tax_id ?? null, vat_code: row?.vat_code ?? null, bank_name: row?.bank_name ?? null, mfo: row?.mfo ?? null,
    account: row?.account ?? null, address: row?.address ?? null, director: row?.director ?? null, email: org.billing_email ?? null, phone: org.contact_phone ?? null,
  };
}

function readLines(value: unknown): InvoiceLine[] {
  if (!Array.isArray(value) || !value.length || value.length > 30) throw new CompanyError('invalid_field', 'An invoice needs 1 to 30 lines.', 400, { field: 'lines' });
  return value.map((raw, index) => {
    const line = obj(raw);
    return {
      description: text(line.description, `lines[${index}].description`, { min: 1, max: 300 })!,
      quantity: int(line.quantity, `lines[${index}].quantity`, { min: 1, max: 1_000_000 })!,
      unit_price: money(line.unit_price, `lines[${index}].unit_price`, 10_000_000_000),
    };
  });
}

function readPercent(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) throw new CompanyError('invalid_field', 'vat_percent must be from 0 to 100.', 400, { field: 'vat_percent' });
  return Math.round(number * 100) / 100;
}

/** Digits only, of one of the lengths Uzbek bank details come in; empty clears the field. */
function digits(value: unknown, field: string, lengths: number[]): string | null {
  const raw = text(value, field, { max: 40, optional: true });
  if (raw === null) return null;
  const clean = raw.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(clean) || !lengths.includes(clean.length)) throw new CompanyError('invalid_field', `${field} must have ${lengths.join(' or ')} digits.`, 400, { field });
  return clean;
}

/** The buyer's details as HR or staff typed them. */
export function readBuyer(input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if ('legal_name' in input) out.legal_name = text(input.legal_name, 'legal_name', { max: 200, optional: true });
  if ('vat_code' in input) out.vat_code = text(input.vat_code, 'vat_code', { max: 40, optional: true });
  if ('bank_name' in input) out.bank_name = text(input.bank_name, 'bank_name', { max: 200, optional: true });
  if ('mfo' in input) out.mfo = digits(input.mfo, 'mfo', [5]);
  if ('account' in input) out.account = digits(input.account, 'account', [20]);
  if ('address' in input) out.address = text(input.address, 'address', { max: 300, optional: true });
  if ('director' in input) out.director = text(input.director, 'director', { max: 160, optional: true });
  return out;
}

/** Saves the buyer's details, and the STIR on the workspace (9 digits, 14 for a sole proprietor's PINFL). */
export async function saveBuyer(ctx: Ctx, org: OrgRow, input: Record<string, unknown>) {
  const row = readBuyer(input);
  if ('tax_id' in input) {
    const tax_id = digits(input.tax_id, 'tax_id', [9, 14]);
    check(await ctx.db.from('company_orgs').update({ tax_id }).eq('id', org.id));
    org.tax_id = tax_id;
  }
  check(await ctx.db.from('company_org_billing').upsert({ org_id: org.id, ...row, updated_by: ctx.user }, { onConflict: 'org_id' }));
  await ctx.audit('billing.details_updated', org.id, { fields: Object.keys(row) });
  return await buyerDetails(ctx, org);
}

interface InvoiceCommand { invoice: InvoiceRow; duplicate?: boolean; payment?: string; amount?: number }

/** Balance checks, payment rows, settlement and activation must share a database transaction. */
async function invoiceCommand(ctx: Ctx, invoice: InvoiceRow, action: string, input: Record<string, unknown>): Promise<InvoiceCommand> {
  const result = check<InvoiceCommand & { code?: string; message?: string; status?: number; field?: string; balance?: number; used?: number }>(await ctx.db.rpc('company_invoice_command', {
    p_invoice: invoice.id, p_actor: ctx.user, p_action: action, p_input: input, p_now: ctx.now().toISOString(),
  }));
  if (result.code) {
    const { code, message, status, ...details } = result;
    throw new CompanyError(code, message ?? 'The invoice could not be changed.', status ?? 409, details);
  }
  return result;
}

const orgNames = async (ctx: Ctx, ids: string[]) => new Map((await inChunks([...new Set(ids)], async (chunk) => check<{ id: string; name: string }[]>(await ctx.db.from('company_orgs').select('id,name').in('id', chunk)))).map((row) => [row.id, row.name]));

/** Revenue totals: only arithmetic over what staff entered. */
export function revenueSummary(contracts: ContractRow[], invoices: InvoiceRow[], day: string) {
  const open = contracts.filter((row) => (OPEN_CONTRACT as readonly string[]).includes(row.status));
  const live = contracts.filter((row) => inForce(row, day));
  const views = invoices.map((row) => invoiceView(row, day));
  return {
    pipeline_value: open.reduce((sum, row) => sum + contractTotal(row), 0),
    pipeline_count: open.length,
    by_status: Object.fromEntries(CONTRACT_STATUSES.map((status) => {
      const rows = contracts.filter((row) => row.status === status);
      return [status, { count: rows.length, value: rows.reduce((sum, row) => sum + contractTotal(row), 0) }];
    })),
    mrr: live.reduce((sum, row) => sum + contractMonthly(row), 0),
    live_contracts: live.length,
    outstanding: views.filter((row) => row.status === 'issued' || row.status === 'partial').reduce((sum, row) => sum + row.balance, 0),
    overdue_total: views.filter((row) => row.overdue).reduce((sum, row) => sum + row.balance, 0),
    overdue_count: views.filter((row) => row.overdue).length,
  };
}

export async function revenueData(ctx: Ctx) {
  const day = today(ctx), soon = addDays(day, 60), remindBy = addDays(day, 14);
  const contracts = await fetchAll<ContractRow>(() => ctx.db.from('company_contracts').select(CONTRACT_COLUMNS).order('created_at', { ascending: false }).order('id'));
  const invoices = await fetchAll<InvoiceRow>(() => ctx.db.from('company_invoices').select(INVOICE_COLUMNS).neq('status', 'void').order('issue_date', { ascending: false }).order('id'));
  const orgs = await fetchAll<OrgRow>(() => ctx.db.from('company_orgs').select(ORG_COLUMNS).neq('status', 'closed').order('id'));
  const names = new Map(orgs.map((org) => [org.id, org.name]));
  const missing = await orgNames(ctx, [...contracts.map((row) => row.org_id), ...invoices.map((row) => row.org_id)].filter((id) => !names.has(id)));
  const name = (id: string) => names.get(id) ?? missing.get(id) ?? null;
  const covered = new Set(contracts.filter((row) => row.status === 'signed').map((row) => row.org_id));
  const expiring = [
    ...contracts.filter((row) => row.status === 'signed' && row.end_date && row.end_date >= day && row.end_date <= soon).map((row) => ({ org_id: row.org_id, org_name: name(row.org_id), contract_id: row.id, title: row.title, ends_on: row.end_date!, value: contractTotal(row) })),
    // A workspace whose plan has an end date but no contract entered here yet.
    ...orgs.filter((org) => !covered.has(org.id) && org.contract_ends_at && tashkentDay(new Date(org.contract_ends_at)) >= day && tashkentDay(new Date(org.contract_ends_at)) <= soon)
      .map((org) => ({ org_id: org.id, org_name: org.name, contract_id: null, title: null, ends_on: tashkentDay(new Date(org.contract_ends_at!)), value: null })),
  ].sort((a, b) => a.ends_on.localeCompare(b.ends_on));
  const renewals = contracts.filter((row) => row.status === 'signed' && row.renewal_date && row.renewal_date <= remindBy && (!row.end_date || row.end_date >= addDays(day, -30)))
    .map((row) => ({ org_id: row.org_id, org_name: name(row.org_id), contract_id: row.id, title: row.title, renewal_date: row.renewal_date!, ends_on: row.end_date, late: row.renewal_date! < day, value: contractTotal(row), renewed: contracts.some((other) => other.renewed_from === row.id) }))
    .filter((row) => !row.renewed).sort((a, b) => a.renewal_date.localeCompare(b.renewal_date));
  const overdue = invoices.map((row) => invoiceView(row, day)).filter((row) => row.overdue).sort((a, b) => a.due_date!.localeCompare(b.due_date!)).map((row) => ({ id: row.id, number: row.number, org_id: row.org_id, org_name: name(row.org_id), due_date: row.due_date, balance: row.balance, days_overdue: row.days_overdue }));
  return {
    summary: revenueSummary(contracts, invoices, day),
    contracts: contracts.map((row) => ({ ...contractView(row), org_name: name(row.org_id) })),
    invoices: invoices.map((row) => {
      const { lines: _lines, seller: _seller, buyer: _buyer, ...rest } = invoiceView(row, day);
      return { ...rest, org_name: name(row.org_id) };
    }),
    expiring, renewals, overdue, today: day,
  };
}

export const billingRoutes: Route[] = [
  {
    // Everything the revenue console opens with.
    method: 'GET', path: 'staff/revenue', access: 'staff',
    handle: (ctx) => revenueData(ctx),
  },
  {
    // Schood's own details on documents: empty until staff enter them.
    method: 'GET', path: 'staff/billing-settings', access: 'staff',
    async handle(ctx) {
      return { settings: check<Record<string, unknown> | null>(await ctx.db.from('company_billing_settings').select(SELLER_COLUMNS).eq('id', true).maybeSingle()) };
    },
  },
  {
    method: 'PUT', path: 'staff/billing-settings', access: 'staff',
    async handle(ctx, _params, body) {
      const input = obj(body);
      const row = {
        id: true, updated_by: ctx.user, legal_name: text(input.legal_name, 'legal_name', { max: 200, optional: true }), tax_id: digits(input.tax_id, 'tax_id', [9, 14]),
        vat_code: text(input.vat_code, 'vat_code', { max: 40, optional: true }), bank_name: text(input.bank_name, 'bank_name', { max: 200, optional: true }),
        mfo: digits(input.mfo, 'mfo', [5]), account: digits(input.account, 'account', [20]), address: text(input.address, 'address', { max: 300, optional: true }),
        phone: text(input.phone, 'phone', { max: 40, optional: true }), email: text(input.email, 'email', { max: 200, optional: true }), director: text(input.director, 'director', { max: 160, optional: true }),
      };
      const settings = check<Record<string, unknown>>(await ctx.db.from('company_billing_settings').upsert(row, { onConflict: 'id' }).select(SELLER_COLUMNS).single());
      await ctx.audit('billing.settings_updated', null, {});
      return { settings };
    },
  },
  {
    // A workspace's contracts, invoices and buyer details for the staff page.
    method: 'GET', path: 'staff/orgs/:org/billing', access: 'staff',
    async handle(ctx, params) {
      const org = await loadOrg(ctx, params.org), day = today(ctx);
      const contracts = await fetchAll<ContractRow>(() => ctx.db.from('company_contracts').select(CONTRACT_COLUMNS).eq('org_id', org.id).order('created_at', { ascending: false }).order('id'));
      const invoices = await fetchAll<InvoiceRow>(() => ctx.db.from('company_invoices').select(INVOICE_COLUMNS).eq('org_id', org.id).order('issue_date', { ascending: false }).order('id'));
      const seller = check<Record<string, unknown> | null>(await ctx.db.from('company_billing_settings').select('legal_name,tax_id,bank_name,mfo,account').eq('id', true).maybeSingle());
      return {
        contracts: contracts.map(contractView), invoices: invoices.map((row) => invoiceView(row, day)), buyer: await buyerDetails(ctx, org),
        seller_ready: ['legal_name', 'tax_id', 'bank_name', 'mfo', 'account'].every((field) => Boolean(seller?.[field])),
      };
    },
  },
  {
    method: 'PUT', path: 'staff/orgs/:org/billing', access: 'staff',
    async handle(ctx, params, body) {
      const org = await loadOrg(ctx, params.org);
      return { buyer: await saveBuyer(ctx, org, obj(body)) };
    },
  },
  {
    method: 'POST', path: 'staff/orgs/:org/contracts', access: 'staff',
    async handle(ctx, params, body) {
      const org = await loadOrg(ctx, params.org), input = obj(body);
      const patch = readContract(input);
      const row: Record<string, unknown> = {
        org_id: org.id, status: 'quote', seats: 0, tests: null, price_per_seat: 0, tests_fee: 0, term_months: 12, currency: 'UZS',
        start_date: null, end_date: null, renewal_date: null, signed_at: null, notes: null, renewed_from: null, created_by: ctx.user, ...patch,
      };
      if (row.status === 'signed') Object.assign(row, { signed_at: ctx.now().toISOString() }, signingDates(row as never, today(ctx)));
      const created = check<ContractRow>(await ctx.db.from('company_contracts').insert(row).select(CONTRACT_COLUMNS).single());
      await ctx.audit('contract.created', created.id, { title: created.title, status: created.status, seats: created.seats, total: contractTotal(created) });
      return { contract: contractView(created) };
    },
  },
  {
    method: 'PATCH', path: 'staff/contracts/:contract', access: 'staff',
    async handle(ctx, params, body) {
      const current = await loadContract(ctx, params.contract);
      await loadOrg(ctx, current.org_id);
      const patch = readContract(obj(body), current);
      if (!Object.keys(patch).length) return { contract: contractView(current) };
      const next = { ...current, ...patch } as ContractRow;
      if (next.status === 'signed' && current.status !== 'signed') {
        patch.signed_at = current.signed_at ?? ctx.now().toISOString();
        Object.assign(patch, signingDates(next, today(ctx)));
      }
      const updated = check<ContractRow>(await ctx.db.from('company_contracts').update(patch).eq('id', current.id).select(CONTRACT_COLUMNS).single());
      const changes = Object.fromEntries(Object.keys(patch).filter((key) => key !== 'notes').map((key) => [key, { from: (current as unknown as Record<string, unknown>)[key] ?? null, to: patch[key] }]));
      await ctx.audit('contract.updated', current.id, changes);
      return { contract: contractView(updated) };
    },
  },
  {
    // One contract with the two parties' details, for the printable offer. Seller is null until staff enter it.
    method: 'GET', path: 'staff/contracts/:contract', access: 'staff',
    async handle(ctx, params) {
      const contract = await loadContract(ctx, params.contract);
      const org = await loadOrg(ctx, contract.org_id);
      const seller = check<Record<string, unknown> | null>(await ctx.db.from('company_billing_settings').select(SELLER_COLUMNS).eq('id', true).maybeSingle());
      return { contract: contractView(contract), org: { id: org.id, name: org.name }, buyer: await buyerDetails(ctx, org), seller: seller?.legal_name ? seller : null, today: today(ctx) };
    },
  },
  {
    // A new quote carrying the contract's terms, starting the day after it ends.
    method: 'POST', path: 'staff/contracts/:contract/renew', access: 'staff',
    async handle(ctx, params) {
      const current = await loadContract(ctx, params.contract);
      await loadOrg(ctx, current.org_id);
      const existing = check<ContractRow[]>(await ctx.db.from('company_contracts').select(CONTRACT_COLUMNS).eq('renewed_from', current.id).neq('status', 'lost'));
      if (existing.length) return { contract: contractView(existing[0]), duplicate: true };
      const start_date = addDays(current.end_date ?? today(ctx), 1);
      const created = check<ContractRow>(await ctx.db.from('company_contracts').insert({
        org_id: current.org_id, title: current.title, status: 'quote', seats: current.seats, tests: current.tests, price_per_seat: current.price_per_seat, tests_fee: current.tests_fee,
        term_months: current.term_months, currency: 'UZS', start_date, end_date: addDays(addMonths(start_date, current.term_months), -1), renewal_date: null, signed_at: null, notes: null,
        renewed_from: current.id, created_by: ctx.user,
      }).select(CONTRACT_COLUMNS).single());
      await ctx.audit('contract.renewal_opened', created.id, { from: current.id });
      return { contract: contractView(created), duplicate: false };
    },
  },
  {
    // Issues an invoice: lines and VAT as staff typed them, seller and buyer copied in, the next number.
    method: 'POST', path: 'staff/orgs/:org/invoices', access: 'staff',
    async handle(ctx, params, body) {
      const org = await loadOrg(ctx, params.org), input = obj(body), day = today(ctx);
      let contract_id: string | null = null;
      if (input.contract_id) {
        const contract = await loadContract(ctx, input.contract_id);
        if (contract.org_id !== org.id) throw new CompanyError('contract_not_found', 'Contract not found.', 404);
        contract_id = contract.id;
      }
      const lines = readLines(input.lines);
      const issue_date = dateOrNull(input.issue_date, 'issue_date') ?? day;
      const due_date = dateOrNull(input.due_date, 'due_date');
      if (due_date && due_date < issue_date) throw new CompanyError('dates_order', 'The due date must not be before the issue date.', 400, { field: 'due_date' });
      const vat_percent = readPercent(input.vat_percent);
      const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
      if (subtotal <= 0) throw new CompanyError('invoice_empty', 'An invoice needs an amount.', 400, { field: 'lines' });
      if (!Number.isSafeInteger(subtotal)) throw new CompanyError('invalid_field', 'The invoice amount is too large.', 400, { field: 'lines' });
      // Percent has two decimal places. Integer arithmetic preserves the final
      // UZS rounding even when multiplication would exceed Number's exact range.
      const vat_amount = Number((BigInt(subtotal) * BigInt(Math.round(vat_percent * 100)) + 5000n) / 10000n);
      if (![subtotal, vat_amount, subtotal + vat_amount].every(Number.isSafeInteger)) {
        throw new CompanyError('invalid_field', 'The invoice amount is too large.', 400, { field: 'lines' });
      }
      const seller = await sellerDetails(ctx), buyer = await buyerDetails(ctx, org);
      const number = await nextNumber(ctx.db, 'invoice', Number(issue_date.slice(0, 4)));
      const created = checkUnique<InvoiceRow>(await ctx.db.from('company_invoices').insert({
        org_id: org.id, contract_id, number, act_number: null, act_date: null, issue_date, due_date, status: 'issued', currency: 'UZS', lines, subtotal, vat_percent, vat_amount,
        total: subtotal + vat_amount, paid_amount: 0, paid_on: null, seller, buyer, notes: text(input.notes, 'notes', { max: 2000, optional: true }), activated_at: null, created_by: ctx.user,
      }).select(INVOICE_COLUMNS).single(), () => new CompanyError('number_busy', 'Several documents are being issued at once. Try again.', 409));
      await ctx.audit('invoice.issued', created.id, { number, total: created.total, contract_id });
      return { invoice: invoiceView(created, day) };
    },
  },
  {
    method: 'GET', path: 'staff/invoices/:invoice', access: 'staff',
    async handle(ctx, params) {
      const invoice = await loadInvoice(ctx, params.invoice);
      const org = await loadOrg(ctx, invoice.org_id);
      const payments = await fetchAll<Record<string, unknown>>(() => ctx.db.from('company_invoice_payments').select('id,amount,paid_on,reference,created_at').eq('invoice_id', invoice.id).order('paid_on').order('id'));
      const contract = invoice.contract_id ? check<ContractRow | null>(await ctx.db.from('company_contracts').select(CONTRACT_COLUMNS).eq('id', invoice.contract_id).maybeSingle()) : null;
      return { invoice: invoiceView(invoice, today(ctx)), payments, contract: contract ? contractView(contract) : null, org: { id: org.id, name: org.name, status: org.status, seats_limit: org.seats_limit, tests_limit: org.tests_limit, tests_used: org.tests_used, contract_ends_at: org.contract_ends_at }, seats_used: await seatCount(ctx.db, org.id) };
    },
  },
  {
    // { due_date?, notes?, refresh_details? }: copies the current details in again while nothing has been paid.
    method: 'PATCH', path: 'staff/invoices/:invoice', access: 'staff',
    async handle(ctx, params, body) {
      const invoice = await loadInvoice(ctx, params.invoice), input = obj(body);
      const org = await loadOrg(ctx, invoice.org_id);
      if (invoice.status === 'void') throw new CompanyError('invoice_void', 'This invoice was cancelled.', 409);
      const patch: Record<string, unknown> = {};
      if ('due_date' in input) {
        patch.due_date = dateOrNull(input.due_date, 'due_date');
        if (patch.due_date && (patch.due_date as string) < invoice.issue_date) throw new CompanyError('dates_order', 'The due date must not be before the issue date.', 400, { field: 'due_date' });
      }
      if ('notes' in input) patch.notes = text(input.notes, 'notes', { max: 2000, optional: true });
      if (input.refresh_details === true) {
        if (invoice.paid_amount > 0) throw new CompanyError('invoice_has_payments', 'An invoice with payments keeps the details it was issued with.', 409);
        patch.seller = await sellerDetails(ctx);
        patch.buyer = await buyerDetails(ctx, org);
      }
      if (!Object.keys(patch).length) return { invoice: invoiceView(invoice, today(ctx)) };
      const updated = check<InvoiceRow>(await ctx.db.from('company_invoices').update(patch).eq('id', invoice.id).select(INVOICE_COLUMNS).single());
      await ctx.audit('invoice.updated', invoice.id, { fields: Object.keys(patch) });
      return { invoice: invoiceView(updated, today(ctx)) };
    },
  },
  {
    // { amount, paid_on, reference?, key }: `key` is new per opened form, so a double click records one payment.
    method: 'POST', path: 'staff/invoices/:invoice/payments', access: 'staff',
    async handle(ctx, params, body) {
      const invoice = await loadInvoice(ctx, params.invoice), input = obj(body);
      await loadOrg(ctx, invoice.org_id);
      if (invoice.status === 'void') throw new CompanyError('invoice_void', 'This invoice was cancelled.', 409);
      const client_key = text(input.key, 'key', { min: 8, max: 80, optional: true });
      const amount = int(input.amount, 'amount', { min: 1, max: 10_000_000_000_000 })!;
      const paid_on = dateOrNull(input.paid_on, 'paid_on') ?? today(ctx);
      if (paid_on > today(ctx)) throw new CompanyError('payment_in_future', 'A payment cannot be dated in the future.', 400, { field: 'paid_on' });
      const result = await invoiceCommand(ctx, invoice, 'payment', { amount, paid_on, key: client_key, reference: text(input.reference, 'reference', { max: 200, optional: true }) });
      if (!result.duplicate) await ctx.audit('invoice.payment', invoice.id, { payment: result.payment, amount, paid_on, status: result.invoice.status });
      return { invoice: invoiceView(result.invoice, today(ctx)), duplicate: result.duplicate };
    },
  },
  {
    // Takes back a payment typed by mistake; the seats stay as they are until staff change them.
    method: 'DELETE', path: 'staff/invoices/:invoice/payments/:payment', access: 'staff',
    async handle(ctx, params) {
      const invoice = await loadInvoice(ctx, params.invoice);
      await loadOrg(ctx, invoice.org_id);
      if (!UUID.test(params.payment)) throw new CompanyError('payment_not_found', 'Payment not found.', 404);
      const result = await invoiceCommand(ctx, invoice, 'remove_payment', { payment: params.payment });
      await ctx.audit('invoice.payment_removed', invoice.id, { payment: params.payment, amount: result.amount, status: result.invoice.status });
      return { invoice: invoiceView(result.invoice, today(ctx)) };
    },
  },
  {
    method: 'POST', path: 'staff/invoices/:invoice/void', access: 'staff',
    async handle(ctx, params) {
      const invoice = await loadInvoice(ctx, params.invoice);
      await loadOrg(ctx, invoice.org_id);
      const result = await invoiceCommand(ctx, invoice, 'void', {});
      if (!result.duplicate) await ctx.audit('invoice.voided', invoice.id, { number: invoice.number });
      return { invoice: invoiceView(result.invoice, today(ctx)) };
    },
  },
  {
    // Gives the invoice its act of completed work: a number once, and the date staff say.
    method: 'POST', path: 'staff/invoices/:invoice/act', access: 'staff',
    async handle(ctx, params, body) {
      const invoice = await loadInvoice(ctx, params.invoice), input = obj(body ?? {});
      await loadOrg(ctx, invoice.org_id);
      if (invoice.status === 'void') throw new CompanyError('invoice_void', 'This invoice was cancelled.', 409);
      const act_date = dateOrNull(input.act_date, 'act_date') ?? invoice.act_date ?? today(ctx);
      const result = await invoiceCommand(ctx, invoice, 'act', { act_date });
      await ctx.audit('invoice.act', invoice.id, { act_number: result.invoice.act_number, act_date });
      return { invoice: invoiceView(result.invoice, today(ctx)) };
    },
  },
  {
    // The staff click that turns a paid invoice into seats, tests and a contract end. Never automatic, and only once.
    method: 'POST', path: 'staff/invoices/:invoice/activate', access: 'staff',
    async handle(ctx, params, body) {
      const invoice = await loadInvoice(ctx, params.invoice), input = obj(body ?? {});
      const org = await loadOrg(ctx, invoice.org_id);
      if (invoice.status !== 'paid') throw new CompanyError('invoice_unpaid', 'Record the full payment before activating seats.', 409);
      if (invoice.activated_at) return { invoice: invoiceView(invoice, today(ctx)), duplicate: true };
      if (org.status === 'closed') throw new CompanyError('org_closed', 'This workspace is closed.', 409);
      const contract = invoice.contract_id ? check<ContractRow | null>(await ctx.db.from('company_contracts').select(CONTRACT_COLUMNS).eq('id', invoice.contract_id).maybeSingle()) : null;
      const seats = 'seats_limit' in input ? int(input.seats_limit, 'seats_limit', { min: 0, max: 100_000 })! : contract?.seats ?? org.seats_limit;
      const used = await seatCount(ctx.db, org.id);
      if (seats < used) throw new CompanyError('seats_below_used', `${used} seats are in use. Turn some off first.`, 409, { field: 'seats_limit', used });
      // The workspace's counter runs for its whole life, so a contract's tests come on top of those already used.
      const tests = 'tests_limit' in input
        ? (input.tests_limit === null ? null : int(input.tests_limit, 'tests_limit', { min: 0, max: 1_000_000 }))
        : contract ? (contract.tests === null ? null : org.tests_used + contract.tests) : org.tests_limit;
      const ends = 'contract_ends_at' in input ? contractEnd(input.contract_ends_at) : contract?.end_date ? contractEnd(contract.end_date) : org.contract_ends_at;
      if (ends && contractEnded({ contract_ends_at: ends }, ctx.now())) throw new CompanyError('contract_end_past', 'Choose a contract end in the future.', 400, { field: 'contract_ends_at' });
      // Only explicit overrides cross the boundary; defaults are derived again under the database lock.
      const overrides: Record<string, unknown> = {};
      if ('seats_limit' in input) overrides.seats_limit = seats;
      if ('tests_limit' in input) overrides.tests_limit = tests;
      if ('contract_ends_at' in input) overrides.contract_ends_at = ends;
      const claimed = await invoiceCommand(ctx, invoice, 'activate', overrides);
      if (claimed.duplicate) return { invoice: invoiceView(claimed.invoice, today(ctx)), duplicate: true };
      const synced = await syncOrg(ctx, org.id);
      await ctx.audit('invoice.activated', invoice.id, { number: invoice.number, status: { from: org.status, to: 'active' }, seats_limit: { from: org.seats_limit, to: seats }, tests_limit: { from: org.tests_limit, to: tests }, contract_ends_at: { from: org.contract_ends_at, to: ends }, synced });
      return { invoice: invoiceView(claimed.invoice, today(ctx)), duplicate: false, synced, ...(synced === null ? { access_sync_failed: true } : {}) };
    },
  },
];

/** The HR side: their plan, their invoices, their own billing details. Staff notes stay out. */
export const planRoutes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/plan', access: 'org', roles: HR_ROLES, allowSuspended: true,
    async handle(ctx) {
      const org = ctx.org!, day = today(ctx);
      const contracts = check<ContractRow[]>(await ctx.db.from('company_contracts').select(CONTRACT_COLUMNS).eq('org_id', org.id).eq('status', 'signed').order('start_date', { ascending: false }).limit(20));
      const current = contracts.find((row) => inForce(row, day)) ?? contracts[0] ?? null;
      const invoices = await fetchAll<InvoiceRow>(() => ctx.db.from('company_invoices').select(INVOICE_COLUMNS).eq('org_id', org.id).neq('status', 'void').order('issue_date', { ascending: false }).order('id'));
      const since = new Date(ctx.now().getTime() - DAY).toISOString();
      const requested = check<{ created_at: string }[]>(await ctx.db.from('company_leads').select('created_at').eq('org_id', org.id).eq('source', 'company_seats').gte('created_at', since).limit(1));
      const settings = (org.settings ?? {}) as Record<string, unknown>;
      let contract = null;
      if (current) {
        const { notes: _notes, ...rest } = contractView(current);
        contract = rest;
      }
      return {
        org: { id: org.id, name: org.name, status: org.status, seats_limit: org.seats_limit, tests_limit: org.tests_limit, tests_used: org.tests_used, contract_ends_at: org.contract_ends_at },
        seats_used: await seatCount(ctx.db, org.id),
        contract,
        invoices: invoices.map((row) => {
          const { lines: _lines, seller: _seller, buyer: _buyer, notes: _notes, ...rest } = invoiceView(row, day);
          return rest;
        }),
        buyer: await buyerDetails(ctx, org),
        contact: { email: settings.schood_contact_email ?? null, phone: settings.schood_contact_phone ?? null },
        seats_requested_at: requested[0]?.created_at ?? null,
      };
    },
  },
  {
    // Bank details can still be corrected while a workspace is paused: paying is how it comes back.
    method: 'PUT', path: 'orgs/:org/plan/billing', access: 'org', roles: HR_ROLES, allowSuspended: true,
    async handle(ctx, _params, body) {
      return { buyer: await saveBuyer(ctx, ctx.org!, obj(body)) };
    },
  },
  {
    method: 'GET', path: 'orgs/:org/plan/invoices/:invoice', access: 'org', roles: HR_ROLES, allowSuspended: true,
    async handle(ctx, params) {
      if (!UUID.test(params.invoice)) throw new CompanyError('invoice_not_found', 'Invoice not found.', 404);
      const row = check<InvoiceRow | null>(await ctx.db.from('company_invoices').select(INVOICE_COLUMNS).eq('id', params.invoice).eq('org_id', ctx.org!.id).neq('status', 'void').maybeSingle());
      if (!row) throw new CompanyError('invoice_not_found', 'Invoice not found.', 404);
      return { invoice: invoiceView(row, today(ctx)) };
    },
  },
];
