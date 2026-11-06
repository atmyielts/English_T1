// Route-test stand-in for the transactional SQL command. The actual locking and
// rollback contract is exercised against PostgreSQL, not simulated here.
import type { FakeDb } from './testing.ts';

export function stubInvoiceCommands(db: FakeDb): void {
  db.rpcs.company_invoice_command = ({ p_invoice, p_actor, p_action, p_input, p_now }) => {
    const inv = db.rows('company_invoices').find((row) => row.id === p_invoice)!;
    const input = p_input as Record<string, unknown>;
    const fail = (code: string, status = 409, fields = {}) => ({ code, status, message: code, ...fields });
    const result = (fields = {}) => ({ invoice: { ...inv }, ...fields });
    const payments = () => db.rows('company_invoice_payments').filter((row) => row.invoice_id === inv.id);
    const settle = () => {
      const rows = payments();
      const paid = rows.reduce((sum, row) => sum + Number(row.amount), 0);
      const full = paid >= Number(inv.total) && Number(inv.total) > 0;
      Object.assign(inv, { paid_amount: paid, status: inv.status === 'void' ? 'void' : full ? 'paid' : paid > 0 ? 'partial' : 'issued', paid_on: full ? rows.map((row) => String(row.paid_on)).sort().at(-1) : null });
    };
    if (p_action === 'payment') {
      if (inv.status === 'void') return fail('invoice_void');
      if (input.key && payments().some((row) => row.client_key === input.key)) { settle(); return result({ duplicate: true }); }
      const balance = Number(inv.total) - payments().reduce((sum, row) => sum + Number(row.amount), 0);
      if (Number(input.amount) > balance) return fail('payment_too_large', 409, { balance, field: 'amount' });
      const id = crypto.randomUUID();
      db.rows('company_invoice_payments').push({ id, invoice_id: inv.id, org_id: inv.org_id, amount: input.amount, paid_on: input.paid_on, reference: input.reference, client_key: input.key, created_by: p_actor });
      settle(); return result({ payment: id, duplicate: false });
    }
    if (p_action === 'remove_payment') {
      const rows = db.rows('company_invoice_payments');
      const index = rows.findIndex((row) => row.id === input.payment && row.invoice_id === inv.id);
      if (index < 0) return fail('payment_not_found', 404);
      const [removed] = rows.splice(index, 1);
      settle(); return result({ payment: removed.id, amount: removed.amount });
    }
    if (p_action === 'void') {
      if (inv.status === 'void') return result({ duplicate: true });
      if (payments().length) return fail('invoice_has_payments');
      inv.status = 'void'; return result({ duplicate: false });
    }
    if (p_action === 'act') {
      if (inv.status === 'void') return fail('invoice_void');
      const date = String(input.act_date);
      const year = Number(date.slice(0, 4));
      if (!inv.act_number) {
        let counter = db.rows('company_doc_counters').find((row) => row.kind === 'act' && row.year === year);
        if (!counter) { counter = { kind: 'act', year, last: 0 }; db.rows('company_doc_counters').push(counter); }
        counter.last = Number(counter.last) + 1;
        inv.act_number = `A-${year}-${String(counter.last).padStart(5, '0')}`;
      }
      inv.act_date = date;
      return result();
    }
    if (p_action === 'activate') {
      if (inv.status !== 'paid') return fail('invoice_unpaid');
      if (inv.activated_at) return result({ duplicate: true });
      const org = db.rows('company_orgs').find((row) => row.id === inv.org_id)!;
      const contract = db.rows('company_contracts').find((row) => row.id === inv.contract_id);
      if (org.status === 'closed') return fail('org_closed');
      const seats = input.seats_limit ?? contract?.seats ?? org.seats_limit;
      const used = db.rows('company_members').filter((row) => row.org_id === org.id && row.seat && row.status !== 'removed').length;
      if (Number(seats) < used) return fail('seats_below_used', 409, { used, field: 'seats_limit' });
      const tests = 'tests_limit' in input ? input.tests_limit : contract ? contract.tests === null ? null : Number(org.tests_used) + Number(contract.tests) : org.tests_limit;
      const ends = 'contract_ends_at' in input ? input.contract_ends_at : contract?.end_date ? new Date(`${contract.end_date}T23:59:59+05:00`).toISOString() : org.contract_ends_at;
      Object.assign(org, { status: 'active', seats_limit: seats, tests_limit: tests, contract_ends_at: ends });
      Object.assign(inv, { activated_at: p_now, activated_by: p_actor });
      return result({ duplicate: false });
    }
    return fail('invalid_field', 400);
  };
}
