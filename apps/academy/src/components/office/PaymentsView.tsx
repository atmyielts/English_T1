import { getLocaleTag, translate } from '../../i18n';
import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import type { TeacherStudioContact, TeacherStudioOffer, TeacherStudioPayment } from '../../lib/client';
import type { PaymentFormState } from './types';

type PaymentFilter =
  | 'all'
  | 'paid'
  | 'pending'
  | 'failed'
  | 'canceled'
  | 'awaiting_provider'
  | 'manual'
  | 'duplicate'
  | 'grant_mismatch'
  | 'needs_attention';
type ReconciliationKey =
  | 'applied'
  | 'awaiting_provider'
  | 'manual'
  | 'failed'
  | 'canceled'
  | 'duplicate'
  | 'grant_mismatch'
  | 'needs_attention';

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

const metadataObject = (value: TeacherStudioPayment['metadata']): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const metadataText = (value: TeacherStudioPayment['metadata'], key: string): string => {
  const raw = metadataObject(value)[key];
  return typeof raw === 'string' ? raw.trim() : '';
};

const metadataHasValue = (value: TeacherStudioPayment['metadata'], key: string): boolean => {
  const raw = metadataObject(value)[key];
  if (typeof raw === 'string') return raw.trim().length > 0;
  return raw !== null && typeof raw !== 'undefined';
};

const paymentReconciliation = (payment: TeacherStudioPayment): {
  key: ReconciliationKey;
  label: string;
  detail: string;
  className: string;
} => {
  const status = payment.status.toLowerCase();
  const provider = payment.provider.toLowerCase();
  const platformPaymentId = metadataText(payment.metadata, 'platform_payment_id');
  const providerStage = metadataText(payment.metadata, 'provider_stage');
  const grantError = metadataText(payment.metadata, 'platform_grant_error');

  if (status === 'paid') {
    if (grantError) {
      return {
        key: 'grant_mismatch',
        label: 'Grant mismatch',
        detail: 'Provider marked this paid, but the entitlement grant needs operator review.',
        className: 'status status--bad',
      };
    }

    return {
      key: 'applied',
      label: 'Access applied',
      detail: 'Payment is settled and the entitlement engine has run.',
      className: 'status status--ok',
    };
  }

  if (['canceled', 'cancelled', 'expired'].includes(status)) {
    return {
      key: 'canceled',
      label: 'Canceled checkout',
      detail: 'Provider canceled or expired the checkout. Create a new Click link if the student still wants access.',
      className: 'status status--bad',
    };
  }

  if (['failed', 'failure', 'rejected'].includes(status)) {
    return {
      key: 'failed',
      label: 'Payment failed',
      detail: 'Student needs a new checkout or provider follow-up.',
      className: 'status status--bad',
    };
  }

  if (provider === 'click') {
    if (providerStage === 'complete_duplicate' || metadataHasValue(payment.metadata, 'duplicate_of_payment_id')) {
      return {
        key: 'duplicate',
        label: 'Duplicate callback',
        detail: 'Click sent a duplicate completion signal. Keep the original payment as the source of truth.',
        className: 'status status--pending',
      };
    }

    if (!payment.provider_transaction_id || !platformPaymentId) {
      return {
        key: 'needs_attention',
        label: 'Provider mismatch',
        detail: 'Click checkout is missing a transaction link. Investigate before granting access.',
        className: 'status status--bad',
      };
    }

    return {
      key: 'awaiting_provider',
      label: 'Awaiting Click',
      detail: 'Checkout exists. Access applies automatically after provider confirmation.',
      className: 'status status--pending',
    };
  }

  if (status === 'pending') {
    return {
      key: 'manual',
      label: 'Manual settlement',
      detail: 'Legacy or offline payment can be applied by finance staff.',
      className: 'status status--pending',
    };
  }

  return {
    key: 'needs_attention',
    label: 'Needs review',
    detail: 'Status does not match a known settlement path.',
    className: 'status status--bad',
  };
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
  const [statusFilter, setStatusFilter] = useState<PaymentFilter>('all');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = parseInputDate(fromDate);
    const toTs = parseInputDate(toDate);

    return payments.filter((p) => {
      if (statusFilter !== 'all') {
        const reconciliation = paymentReconciliation(p);
        if (statusFilter === 'failed') {
          if (reconciliation.key !== 'failed') return false;
        } else if (statusFilter === 'canceled') {
          if (reconciliation.key !== 'canceled') return false;
        } else if (statusFilter === 'awaiting_provider') {
          if (reconciliation.key !== 'awaiting_provider') return false;
        } else if (statusFilter === 'manual') {
          if (reconciliation.key !== 'manual') return false;
        } else if (statusFilter === 'duplicate') {
          if (reconciliation.key !== 'duplicate') return false;
        } else if (statusFilter === 'grant_mismatch') {
          if (reconciliation.key !== 'grant_mismatch') return false;
        } else if (statusFilter === 'needs_attention') {
          if (reconciliation.key !== 'needs_attention') return false;
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
    const reconciliations = filteredPayments.map(paymentReconciliation);
    return {
      total: filteredPayments.length,
      paid: paid.length,
      pending: pending.length,
      failed: reconciliations.filter((item) => item.key === 'failed').length,
      canceled: reconciliations.filter((item) => item.key === 'canceled').length,
      awaitingProvider: reconciliations.filter((item) => item.key === 'awaiting_provider').length,
      manual: reconciliations.filter((item) => item.key === 'manual').length,
      duplicate: reconciliations.filter((item) => item.key === 'duplicate').length,
      grantMismatch: reconciliations.filter((item) => item.key === 'grant_mismatch').length,
      needsAttention: reconciliations.filter((item) => item.key === 'needs_attention').length,
      paidAmount: paid.reduce((sum, p) => sum + p.amount, 0),
      pendingAmount: pending.reduce((sum, p) => sum + p.amount, 0),
    };
  }, [filteredPayments]);

  return (
    <>
      <section className="grid two">
        <form className="panel workspace-form" onSubmit={onCreatePayment}>
          <h3>{translate("Create Click checkout")}</h3>
          <p className="small muted">{translate("Choose a contact and an offer. Access is applied only after Click confirms the payment.")}</p>
          <label>{translate("Contact")}{' '}<select disabled={busy} className="input" value={paymentForm.contact_id} onChange={(e) => setPaymentForm((p) => ({ ...p, contact_id: e.target.value }))} required>
              <option value="">{translate("Select contact")}</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{`${c.first_name} ${c.last_name}`.trim()} ({c.email ?? 'no email'})</option>
              ))}
            </select>
          </label>
          <label>{translate("Offer")}{' '}<select disabled={busy} className="input" value={paymentForm.offer_id} onChange={(e) => setPaymentForm((p) => ({ ...p, offer_id: e.target.value }))} required>
              <option value="">{translate("Select offer")}</option>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>{`${o.name} - ${o.price_amount} ${o.currency}`}</option>
              ))}
            </select>
          </label>
          <div className="form-actions"><button className="primary-btn" type="submit" disabled={busy}>
              {translate("Create Click checkout")}{' '}</button></div>
        </form>

        <div className="panel">
          <h3>{translate("Filtered summary")}</h3>
          <div className="metric-list">
            <div className="metric-row"><span>{translate("Total")}</span><strong>{summary.total}</strong></div>
            <div className="metric-row"><span>{translate("Paid")}</span><strong>{summary.paid}</strong></div>
            <div className="metric-row"><span>{translate("Pending")}</span><strong>{summary.pending}</strong></div>
            <div className="metric-row"><span>{translate("Failed")}</span><strong>{summary.failed}</strong></div>
            <div className="metric-row"><span>{translate("Canceled")}</span><strong>{summary.canceled}</strong></div>
            <div className="metric-row"><span>{translate("Awaiting Click")}</span><strong>{summary.awaitingProvider}</strong></div>
            <div className="metric-row"><span>{translate("Manual settlement")}</span><strong>{summary.manual}</strong></div>
            <div className="metric-row"><span>{translate("Duplicate callback")}</span><strong>{summary.duplicate}</strong></div>
            <div className="metric-row"><span>{translate("Grant mismatch")}</span><strong>{summary.grantMismatch}</strong></div>
            <div className="metric-row"><span>{translate("Needs attention")}</span><strong>{summary.needsAttention}</strong></div>
            <div className="metric-row"><span>{translate("Paid amount")}</span><strong>{summary.paidAmount.toLocaleString(getLocaleTag())} {translate("UZS")}</strong></div>
            <div className="metric-row"><span>{translate("Pending amount")}</span><strong>{summary.pendingAmount.toLocaleString(getLocaleTag())} {translate("UZS")}</strong></div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="filters-grid" aria-label={translate("Payment filters")}>
          <label><span className="sr-only">{translate("Search payments")}</span><input className="input" placeholder={translate("Search by contact, offer, or ID")} value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          <label><span className="sr-only">{translate("Filter payments by status")}</span><select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as PaymentFilter)}>
            <option value="all">{translate("All statuses")}</option>
            <option value="paid">{translate("Paid")}</option>
            <option value="pending">{translate("Pending")}</option>
            <option value="failed">{translate("Failed")}</option>
            <option value="canceled">{translate("Canceled")}</option>
            <option value="awaiting_provider">{translate("Awaiting Click")}</option>
            <option value="manual">{translate("Manual settlement")}</option>
            <option value="duplicate">{translate("Duplicate callback")}</option>
            <option value="grant_mismatch">{translate("Grant mismatch")}</option>
            <option value="needs_attention">{translate("Needs attention")}</option>
          </select></label>
          <label><span className="sr-only">{translate("Payments from date")}</span><input className="input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></label>
          <label><span className="sr-only">{translate("Payments to date")}</span><input className="input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></label>
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th>{translate("Created")}</th><th>{translate("Status")}</th><th>{translate("Reconciliation")}</th><th>{translate("Provider")}</th><th>{translate("Amount")}</th><th>{translate("Offer")}</th><th>{translate("Contact")}</th><th>{translate("Action")}</th></tr></thead>
            <tbody>
              {filteredPayments.map((p) => {
                const reconciliation = paymentReconciliation(p);
                const platformPaymentId = metadataText(p.metadata, 'platform_payment_id');
                return (
                  <tr key={p.id}>
                    <td>{formatDate(p.created_at)}</td>
                    <td><span className={statusClass(p.status)}>{p.status}</span></td>
                    <td>
                      <span className={reconciliation.className}>{reconciliation.label}</span>
                      <div className="small muted">{reconciliation.detail}</div>
                      {platformPaymentId ? <div className="small muted">{translate("Platform payment:")}{' '}{platformPaymentId}</div> : null}
                    </td>
                    <td>
                      <div>{p.provider || 'legacy'}</div>
                      <div className="small muted">{p.provider_transaction_id || '-'}</div>
                    </td>
                    <td>{p.amount} {p.currency}</td>
                    <td>{offers.find((o) => o.id === p.offer_id)?.name ?? p.offer_id}</td>
                    <td>{contacts.find((c) => c.id === p.contact_id)?.email ?? p.contact_id}</td>
                    <td>
                      {reconciliation.key === 'manual' ? (
                        <button className="small-btn" disabled={busy} onClick={() => onMarkPaid(p.id)}>{translate("Apply settlement")}</button>
                      ) : reconciliation.key === 'needs_attention' ? (
                        <span className="status status--bad">{translate("investigate")}</span>
                      ) : reconciliation.key === 'awaiting_provider' ? (
                        <span className="status status--pending">{translate("provider callback")}</span>
                      ) : reconciliation.key === 'duplicate' ? (
                        <span className="status status--pending">{translate("duplicate")}</span>
                      ) : reconciliation.key === 'grant_mismatch' ? (
                        <span className="status status--bad">{translate("grant review")}</span>
                      ) : reconciliation.key === 'failed' ? (
                        <span className="status status--bad">{translate("retry checkout")}</span>
                      ) : reconciliation.key === 'canceled' ? (
                        <span className="status status--bad">{translate("new checkout")}</span>
                      ) : (
                        <span className="status status--ok">{translate("applied")}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredPayments.length === 0 ? <tr><td colSpan={8}><div className="table-empty-state"><strong>{translate("No payments match these filters")}</strong><span>{translate("Clear a filter or create a checkout for a contact.")}</span></div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};
