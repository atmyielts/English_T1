import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import type { TeacherStudioContact, TeacherStudioOffer, TeacherStudioPayment } from '../../lib/client';
import type { PaymentFormState } from './types';

type PaymentsViewProps = {
  busy: boolean;
  paymentForm: PaymentFormState;
  setPaymentForm: Dispatch<SetStateAction<PaymentFormState>>;
  contacts: TeacherStudioContact[];
  offers: TeacherStudioOffer[];
  payments: TeacherStudioPayment[];
  onCreatePayment: (e: FormEvent) => Promise<void>;
  onMarkPaid: (paymentId: string) => Promise<void>;
  statusClass: (status: string) => string;
  formatDate: (iso: string | null | undefined) => string;
};

const parseInputDate = (value: string): number | null => {
  if (!value) return null;
  const ts = Date.parse(`${value}T00:00:00`);
  return Number.isFinite(ts) ? ts : null;
};

export const PaymentsView = ({
  busy,
  paymentForm,
  setPaymentForm,
  contacts,
  offers,
  payments,
  onCreatePayment,
  onMarkPaid,
  statusClass,
  formatDate,
}: PaymentsViewProps) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'failed'>('all');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = parseInputDate(fromDate);
    const toTs = parseInputDate(toDate);

    return payments.filter((p) => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'failed') {
          if (!['failed', 'canceled'].includes(p.status.toLowerCase())) return false;
        } else if (p.status.toLowerCase() !== statusFilter) {
          return false;
        }
      }

      const createdAt = Date.parse(p.created_at);
      if (fromTs !== null && Number.isFinite(createdAt) && createdAt < fromTs) return false;
      if (toTs !== null && Number.isFinite(createdAt) && createdAt >= toTs + 24 * 60 * 60 * 1000) return false;

      if (!q) return true;
      const offer = offers.find((o) => o.id === p.offer_id)?.name ?? '';
      const contact = contacts.find((c) => c.id === p.contact_id);
      const contactText = `${contact?.first_name ?? ''} ${contact?.last_name ?? ''} ${contact?.email ?? ''}`.toLowerCase();
      return (
        p.id.toLowerCase().includes(q) ||
        p.provider_transaction_id.toLowerCase().includes(q) ||
        offer.toLowerCase().includes(q) ||
        contactText.includes(q)
      );
    });
  }, [contacts, fromDate, offers, payments, search, statusFilter, toDate]);

  const summary = useMemo(() => {
    const paid = filteredPayments.filter((p) => p.status.toLowerCase() === 'paid');
    const pending = filteredPayments.filter((p) => p.status.toLowerCase() === 'pending');
    const failed = filteredPayments.filter((p) => ['failed', 'canceled'].includes(p.status.toLowerCase()));
    return {
      total: filteredPayments.length,
      paid: paid.length,
      pending: pending.length,
      failed: failed.length,
      paidAmount: paid.reduce((sum, p) => sum + p.amount, 0),
      pendingAmount: pending.reduce((sum, p) => sum + p.amount, 0),
    };
  }, [filteredPayments]);

  return (
    <>
      <section className="grid two">
        <form className="panel" onSubmit={onCreatePayment}>
          <h3>Create payment</h3>
          <select className="input" value={paymentForm.contact_id} onChange={(e) => setPaymentForm((p) => ({ ...p, contact_id: e.target.value }))} required>
            <option value="">Select contact</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{`${c.first_name} ${c.last_name}`.trim()} ({c.email ?? 'no email'})</option>
            ))}
          </select>
          <select className="input" value={paymentForm.offer_id} onChange={(e) => setPaymentForm((p) => ({ ...p, offer_id: e.target.value }))} required>
            <option value="">Select offer</option>
            {offers.map((o) => (
              <option key={o.id} value={o.id}>{`${o.name} - ${o.price_amount} ${o.currency}`}</option>
            ))}
          </select>
          <button className="primary-btn" type="submit" disabled={busy}>Create payment</button>
        </form>

        <div className="panel">
          <h3>Filtered summary</h3>
          <div className="metric-list">
            <div className="metric-row"><span>Total</span><strong>{summary.total}</strong></div>
            <div className="metric-row"><span>Paid</span><strong>{summary.paid}</strong></div>
            <div className="metric-row"><span>Pending</span><strong>{summary.pending}</strong></div>
            <div className="metric-row"><span>Failed</span><strong>{summary.failed}</strong></div>
            <div className="metric-row"><span>Paid amount</span><strong>{summary.paidAmount.toLocaleString()} UZS</strong></div>
            <div className="metric-row"><span>Pending amount</span><strong>{summary.pendingAmount.toLocaleString()} UZS</strong></div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="filters-grid">
          <input className="input" placeholder="Search by contact, offer, id..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | 'paid' | 'pending' | 'failed')}>
            <option value="all">All statuses</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed/Canceled</option>
          </select>
          <input className="input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <input className="input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Created</th><th>Status</th><th>Amount</th><th>Offer</th><th>Contact</th><th>Action</th></tr></thead>
            <tbody>
              {filteredPayments.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.created_at)}</td>
                  <td><span className={statusClass(p.status)}>{p.status}</span></td>
                  <td>{p.amount} {p.currency}</td>
                  <td>{offers.find((o) => o.id === p.offer_id)?.name ?? p.offer_id}</td>
                  <td>{contacts.find((c) => c.id === p.contact_id)?.email ?? p.contact_id}</td>
                  <td>
                    {p.status.toLowerCase() !== 'paid' ? (
                      <button className="small-btn" disabled={busy} onClick={() => onMarkPaid(p.id)}>Mark paid</button>
                    ) : (
                      <span className="status status--ok">applied</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredPayments.length === 0 ? <tr><td colSpan={6}>No payments match these filters.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};
