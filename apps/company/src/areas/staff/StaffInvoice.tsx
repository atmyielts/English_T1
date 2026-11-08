// /staff/invoices/:invoice — the printable document, payments, the act, and the separate
// staff click that turns a paid invoice into seats.
import React, { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link, useLocation } from '../../router.tsx';
import { InvoiceDocument } from '../people/InvoiceDocument.tsx';
import type { ContractView, InvoiceDetail } from '../people/types.ts';
import { AccessSyncIssue, CopyButton, useDates, useMoney, useProblem } from '../people/ui.tsx';
import { StaffFrame } from './common.tsx';

interface Data {
  invoice: InvoiceDetail;
  payments: { id: string; amount: number; paid_on: string; reference: string | null }[];
  contract: ContractView | null;
  /** Another invoice on the same contract was already activated, so its tests are not added again. */
  contract_tests_granted?: boolean;
  org: { id: string; name: string; status: string; seats_limit: number; tests_limit: number | null; tests_used: number; contract_ends_at: string | null };
  seats_used: number;
}
const tashkentDay = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
const tashkentDate = (iso: string | null | undefined) => iso ? new Date(new Date(iso).getTime() + 5 * 3_600_000).toISOString().slice(0, 10) : '';
const newKey = () => crypto.randomUUID();

export function StaffInvoice({ invoiceId }: { invoiceId: string }) {
  const t = useAppT(), problem = useProblem(), { day } = useDates(), money = useMoney();
  const { query } = useLocation();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState({ amount: '', paid_on: tashkentDay(), reference: '' });
  const [activation, setActivation] = useState({ seats: '', tests: '', unlimited: false, ends: '', openEnded: false });
  const [syncFailed, setSyncFailed] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  // New for each payment form, so a double click or a retry records one payment.
  const key = useRef(newKey());
  const load = useCallback(async () => {
    try {
      const next = await api<Data>(`staff/invoices/${encodeURIComponent(invoiceId)}`);
      setData(next);
      setPayment((current) => ({ ...current, amount: next.invoice.balance > 0 ? String(next.invoice.balance) : '' }));
      const { org } = next;
      // A contract's tests are added once; a later invoice on it keeps the workspace's limit.
      const contract = next.contract_tests_granted ? null : next.contract;
      setActivation({
        seats: String(next.contract?.seats ?? org.seats_limit), unlimited: contract ? contract.tests === null : org.tests_limit === null,
        tests: contract ? (contract.tests === null ? '' : String(org.tests_used + contract.tests)) : org.tests_limit === null ? '' : String(org.tests_limit),
        // The current end stays unless staff change it; no end date is a box they tick on purpose.
        ends: next.contract?.end_date ?? tashkentDate(org.contract_ends_at), openEnded: false,
      });
      setError('');
    } catch (cause) {
      setError(problem(cause));
    }
  }, [invoiceId]);
  useEffect(() => { void load(); }, [load]);
  if (!data) return <StaffFrame title={t('staff.invoice.title')}>{error ? <p className="error" role="alert">{error}</p> : <p role="status">{t('app.loading')}</p>}</StaffFrame>;
  const { invoice, org, payments } = data;
  const kind = query.get('doc') === 'act' && invoice.act_number ? 'act' : 'invoice';
  const voided = invoice.status === 'void';

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await action();
      setNotice(message);
      await load();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  function pay(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api(`staff/invoices/${invoice.id}/payments`, { method: 'POST', body: { amount: Number(payment.amount), paid_on: payment.paid_on, reference: payment.reference || null, key: key.current } });
      key.current = newKey();
      setPayment((current) => ({ ...current, reference: '' }));
    }, t('staff.invoice.paymentSaved'));
  }
  function activate(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const response = await api<{ access_sync_failed?: boolean }>(`staff/invoices/${invoice.id}/activate`, { method: 'POST', body: {
        seats_limit: Number(activation.seats || 0), tests_limit: activation.unlimited ? null : Number(activation.tests || 0),
        // An empty date is left out, so the server keeps the end it has.
        ...(activation.openEnded ? { open_ended: true } : activation.ends ? { contract_ends_at: activation.ends } : {}),
      } });
      setSyncFailed(Boolean(response.access_sync_failed));
    }, t('staff.invoice.activated'));
  }
  return <StaffFrame title={t('staff.invoice.heading', { number: invoice.number })} lead={org.name}
    actions={<Link className="button-link quiet" to={`/staff/orgs/${org.id}`}>{t('staff.invoice.toWorkspace')}</Link>}>
    <div className="no-print staff-invoice-tools">
      {notice && <p className="notice" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {syncFailed && <AccessSyncIssue message={t('staff.plan.savedNoSync')} retry={() => api<{ access_sync_failed?: boolean }>(`staff/orgs/${org.id}`, { method: 'PATCH', body: {} })} onFixed={() => setSyncFailed(false)}/>}
      <div className="company-grid staff-stats">
        <div className="company-stat"><strong>{money(invoice.total)}</strong><span>{t('people.doc.total')}</span></div>
        <div className="company-stat"><strong>{money(invoice.balance)}</strong><span>{t('people.plan.balance')}</span></div>
        <div className="company-stat"><strong>{day(invoice.due_date)}</strong><span>{t('people.plan.dueOn')}</span></div>
        <div className="company-stat"><strong>{invoice.overdue ? t('people.invoice.overdue') : t(`people.invoice.${invoice.status}` as AppKey)}</strong><span>{t('people.field.status')}</span></div>
      </div>
      <div className="people-settings">
        {!voided && <section aria-labelledby="payments-title">
          <h2 id="payments-title">{t('staff.invoice.payments')}</h2>
          {payments.length > 0 && <ul className="people-admins">
            {payments.map((row) => <li key={row.id}>
              <div><strong>{money(row.amount)}</strong><span>{day(row.paid_on)}{row.reference ? ` · ${row.reference}` : ''}</span></div>
              <button type="button" className="quiet people-danger" disabled={busy} onClick={() => void run(() => api(`staff/invoices/${invoice.id}/payments/${row.id}`, { method: 'DELETE' }), t('staff.invoice.paymentRemoved'))}>{t('common.remove')}</button>
            </li>)}
          </ul>}
          {invoice.balance > 0 && <form className="people-form-grid" onSubmit={pay}>
            <label>{t('staff.invoice.amount')}<input type="number" required min={1} max={invoice.balance} value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })}/></label>
            <label>{t('staff.invoice.paidOn')}<input type="date" required max={tashkentDay()} value={payment.paid_on} onChange={(event) => setPayment({ ...payment, paid_on: event.target.value })}/></label>
            <label className="people-span">{t('staff.invoice.reference')}<input maxLength={200} value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })}/></label>
            <div className="people-form-actions"><button disabled={busy}>{t('staff.invoice.record')}</button></div>
          </form>}
        </section>}
        {!voided && <section aria-labelledby="activate-title">
          <h2 id="activate-title">{t('staff.invoice.activation')}</h2>
          {invoice.activated_at ? <p className="notice">{t('staff.invoice.activatedOn', { date: day(invoice.activated_at) })}</p> : invoice.status !== 'paid' ? <p className="hint">{t('staff.invoice.activateAfter')}</p> : <form className="people-form-grid" onSubmit={activate}>
            <p className="hint people-span">{t('staff.invoice.activateLead', { used: data.seats_used, status: t(`status.${org.status}` as AppKey) })}</p>
            <label>{t('staff.plan.seats')}<input type="number" required min={data.seats_used} max={100000} value={activation.seats} onChange={(event) => setActivation({ ...activation, seats: event.target.value })}/></label>
            <label>{t('staff.plan.tests')}<input type="number" min={0} max={1000000} disabled={activation.unlimited} required={!activation.unlimited} value={activation.tests} onChange={(event) => setActivation({ ...activation, tests: event.target.value })}/></label>
            <label className="check"><input type="checkbox" checked={activation.unlimited} onChange={(event) => setActivation({ ...activation, unlimited: event.target.checked })}/>{t('staff.plan.unlimited')}</label>
            <label>{t('staff.plan.contract')}<input type="date" disabled={activation.openEnded} value={activation.openEnded ? '' : activation.ends} onChange={(event) => setActivation({ ...activation, ends: event.target.value })}/></label>
            <label className="check"><input type="checkbox" checked={activation.openEnded} onChange={(event) => setActivation({ ...activation, openEnded: event.target.checked })}/>{t('staff.invoice.noEnd')}</label>
            <p className="hint people-span">{t('staff.invoice.testsNote', { used: org.tests_used })}</p>
            {data.contract_tests_granted && <p className="hint people-span">{t('staff.invoice.testsGranted')}</p>}
            <div className="people-form-actions"><button disabled={busy}>{t('staff.invoice.activate')}</button></div>
          </form>}
        </section>}
        <section aria-labelledby="docs-title">
          <h2 id="docs-title">{t('staff.invoice.documents')}</h2>
          <div className="company-actions">
            <button type="button" onClick={() => print()}>{t('people.doc.print')}</button>
            {invoice.act_number && (kind === 'act'
              ? <Link className="button-link quiet" to={`/staff/invoices/${invoice.id}`}>{t('people.doc.showInvoice')}</Link>
              : <Link className="button-link quiet" to={`/staff/invoices/${invoice.id}?doc=act`}>{t('people.doc.showAct')}</Link>)}
            {invoice.balance > 0 && !voided && <CopyButton label={t('staff.invoice.copyReminder')} value={t('staff.invoice.reminderText', { number: invoice.number, date: day(invoice.issue_date), total: money(invoice.total), balance: money(invoice.balance), due: day(invoice.due_date) })}/>}
            {!voided && !invoice.act_number && <button type="button" className="quiet" disabled={busy} onClick={() => void run(() => api(`staff/invoices/${invoice.id}/act`, { method: 'POST', body: {} }), t('staff.invoice.actMade'))}>{t('staff.invoice.makeAct')}</button>}
            {!voided && invoice.paid_amount === 0 && <button type="button" className="quiet" disabled={busy} onClick={() => void run(() => api(`staff/invoices/${invoice.id}`, { method: 'PATCH', body: { refresh_details: true } }), t('staff.invoice.refreshed'))}>{t('staff.invoice.refresh')}</button>}
            {!voided && invoice.paid_amount === 0 && (confirmVoid
              ? <><button type="button" className="people-danger-solid" disabled={busy} onClick={() => void run(() => api(`staff/invoices/${invoice.id}/void`, { method: 'POST' }), t('staff.invoice.voided'))}>{t('staff.invoice.voidConfirm')}</button><button type="button" className="quiet" onClick={() => setConfirmVoid(false)}>{t('common.cancel')}</button></>
              : <button type="button" className="quiet people-danger" onClick={() => setConfirmVoid(true)}>{t('staff.invoice.void')}</button>)}
          </div>
          {voided && <p className="error" role="status">{t('staff.invoice.isVoid')}</p>}
        </section>
      </div>
    </div>
    <InvoiceDocument invoice={invoice} kind={kind}/>
  </StaffFrame>;
}
