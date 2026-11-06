// /w/:org/plan — for HR: seats, tests, the contract, asking for more seats, invoices and
// the company's bank details. /w/:org/plan/invoices/:invoice prints an invoice or an act.
import React, { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link, useLocation } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { InvoiceDocument } from './InvoiceDocument.tsx';
import type { IdleSeats, InvoiceDetail, PartyDetails, PlanData } from './types.ts';
import { Meter, useDates, useMoney, useProblem } from './ui.tsx';

export const invoiceBadge = (status: string, overdue: boolean) => overdue ? 'bad' : status === 'paid' ? 'good' : status === 'partial' ? 'warn' : '';

/** The company's details on documents. Saved by HR on the plan page and by staff on the workspace page. */
export function BuyerForm({ buyer, disabled, onSave }: { buyer: PartyDetails; disabled?: boolean; onSave: (body: Record<string, string | null>) => Promise<void> }) {
  const t = useAppT(), problem = useProblem();
  const blank = () => ({ legal_name: buyer.legal_name ?? '', tax_id: buyer.tax_id ?? '', vat_code: buyer.vat_code ?? '', bank_name: buyer.bank_name ?? '', mfo: buyer.mfo ?? '', account: buyer.account ?? '', address: buyer.address ?? '', director: buyer.director ?? '' });
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  useEffect(() => setForm(blank()), [buyer]);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => { setForm({ ...form, [key]: event.target.value }); setSaved(false); };
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setSaved(false);
    try {
      await onSave(Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim() || null])));
      setSaved(true);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <form className="people-form-grid" onSubmit={submit}>
    <label className="people-span">{t('people.doc.legalName')}<input maxLength={200} value={form.legal_name} onChange={set('legal_name')} disabled={disabled}/></label>
    <label>{t('people.doc.stir')}<input inputMode="numeric" maxLength={20} value={form.tax_id} onChange={set('tax_id')} disabled={disabled}/></label>
    <label>{t('people.doc.vatCode')}<input maxLength={40} value={form.vat_code} onChange={set('vat_code')} disabled={disabled}/></label>
    <label className="people-span">{t('people.doc.bank')}<input maxLength={200} value={form.bank_name} onChange={set('bank_name')} disabled={disabled}/></label>
    <label>{t('people.doc.mfo')}<input inputMode="numeric" maxLength={10} value={form.mfo} onChange={set('mfo')} disabled={disabled}/></label>
    <label>{t('people.doc.account')}<input inputMode="numeric" maxLength={30} value={form.account} onChange={set('account')} disabled={disabled}/></label>
    <label className="people-span">{t('people.doc.address')}<input maxLength={300} value={form.address} onChange={set('address')} disabled={disabled}/></label>
    <label className="people-span">{t('people.doc.director')}<input maxLength={160} value={form.director} onChange={set('director')} disabled={disabled}/></label>
    {!disabled && <div className="people-form-actions">
      <button disabled={busy}>{busy ? t('app.loading') : t('common.save')}</button>
      {saved && <span role="status" className="hint">{t('common.saved')}</span>}
    </div>}
    {error && <p className="error people-span" role="alert">{error}</p>}
  </form>;
}

export function PlanPage() {
  const t = useAppT(), problem = useProblem(), { day } = useDates(), money = useMoney();
  const { org: { id: orgId } } = useWorkspace();
  const [data, setData] = useState<PlanData | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setData(await api<PlanData>(`orgs/${orgId}/plan`));
      setError('');
    } catch (cause) {
      setError(problem(cause));
    }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);
  if (!data) return error ? <p className="error" role="alert">{error}</p> : <p role="status">{t('app.loading')}</p>;
  const { org, contract, invoices } = data;
  const unlimited = t('people.usage.unlimited');
  const overdue = invoices.filter((row) => row.overdue);
  // Early enough to renew without anyone losing a seat.
  const left = org.contract_ends_at ? Date.parse(org.contract_ends_at) - Date.now() : null;
  const endsSoon = left !== null && left > 0 && left <= 45 * 86_400_000;
  return <div className="people">
    <header className="page-heading">
      <div>
        <p className="eyebrow">{t('nav.section.people')}</p>
        <h1>{t('people.plan.title')}</h1>
        <p className="people-sub">{t('people.plan.lead')}</p>
      </div>
    </header>
    {error && <p className="error" role="alert">{error}</p>}
    {overdue.length > 0 && <p className="error" role="status">{t('people.plan.overdueNote', { count: overdue.length })}</p>}
    {endsSoon && <p className="notice" role="status">{t('people.plan.endsSoon', { date: day(org.contract_ends_at) })}</p>}
    <div className="people-settings">
      <section aria-labelledby="plan-now">
        <h2 id="plan-now">{t('people.plan.now')}</h2>
        <dl className="people-facts">
          <div><dt>{t('people.field.status')}</dt><dd><span className={`company-badge ${org.status === 'active' ? 'good' : org.status === 'pilot' ? '' : 'bad'}`}>{t(`status.${org.status}` as AppKey)}</span></dd></div>
          <div><dt>{t('people.settings.contract')}</dt><dd>{org.contract_ends_at ? day(org.contract_ends_at) : org.status === 'active' ? t('people.settings.noEnd') : '—'}</dd></div>
        </dl>
        <Meter label={t('people.usage.seats')} used={data.seats_used} limit={org.seats_limit} unlimited={unlimited}/>
        <Meter label={t('people.usage.tests')} used={org.tests_used} limit={org.tests_limit} unlimited={unlimited}/>
        {org.status === 'pilot' && <p className="hint">{t('people.usage.pilotSeats')}</p>}
        {contract ? <>
          <h3 className="people-subhead">{t('people.plan.contract')}</h3>
          <dl className="people-facts">
            <div><dt>{t('people.plan.contractName')}</dt><dd>{contract.title}</dd></div>
            <div><dt>{t('people.usage.seats')}</dt><dd>{contract.seats}</dd></div>
            <div><dt>{t('people.usage.tests')}</dt><dd>{contract.tests ?? unlimited}</dd></div>
            <div><dt>{t('people.plan.period')}</dt><dd>{day(contract.start_date)} – {day(contract.end_date)}</dd></div>
            <div><dt>{t('people.plan.value')}</dt><dd>{money(contract.total)}</dd></div>
          </dl>
        </> : <p className="hint">{t('people.plan.noContract')}</p>}
      </section>
      <SeatsRequest data={data} onSent={load}/>
      {org.seats_limit > 0 && <IdleSeatsPanel orgId={orgId} onChanged={load}/>}
      <section aria-labelledby="plan-invoices" className="people-span-section">
        <h2 id="plan-invoices">{t('people.plan.invoices')}</h2>
        {invoices.length === 0 ? <p className="people-empty">{t('people.plan.noInvoices')}</p> : <div className="company-table-wrap">
          <table className="company-table">
            <thead><tr>
              <th scope="col">{t('people.plan.invoice')}</th><th scope="col">{t('people.plan.issued')}</th><th scope="col">{t('people.plan.dueOn')}</th>
              <th scope="col" className="people-num">{t('people.doc.total')}</th><th scope="col" className="people-num">{t('people.plan.balance')}</th><th scope="col">{t('people.field.status')}</th>
            </tr></thead>
            <tbody>{invoices.map((row) => <tr key={row.id}>
              <td><Link to={`/w/${orgId}/plan/invoices/${row.id}`}>{row.number}</Link></td>
              <td>{day(row.issue_date)}</td><td>{day(row.due_date)}</td>
              <td className="people-num">{money(row.total)}</td><td className="people-num">{money(row.balance)}</td>
              <td><span className={`company-badge ${invoiceBadge(row.status, row.overdue)}`}>{row.overdue ? t('people.invoice.overdue') : t(`people.invoice.${row.status}` as AppKey)}</span></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
      <section aria-labelledby="plan-billing" className="people-span-section">
        <h2 id="plan-billing">{t('people.plan.billing')}</h2>
        <p className="hint">{t('people.plan.billingLead')}</p>
        <BuyerForm buyer={data.buyer} onSave={async (body) => { await api(`orgs/${orgId}/plan/billing`, { method: 'PUT', body }); await load(); }}/>
      </section>
    </div>
  </div>;
}

/** Seats nobody is using, before anyone buys more. Empty and quiet when there are none. */
function IdleSeatsPanel({ orgId, onChanged }: { orgId: string; onChanged: () => Promise<void> }) {
  const t = useAppT(), problem = useProblem();
  const [data, setData] = useState<IdleSeats | null>(null);
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setData(await api<IdleSeats>(`orgs/${orgId}/people/seats/idle`));
    } catch { /* A helper panel: the plan page stands without it. */ }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);
  if (!data || (!data.idle.length && !data.not_joined.length)) return null;
  async function free(id: string) {
    setBusy(id); setError('');
    try {
      await api(`orgs/${orgId}/people/${id}/seat`, { method: 'POST', body: { seat: false } });
      await Promise.all([load(), onChanged()]);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy('');
    }
  }
  const row = (person: { id: string; name: string | null }, note: string) => <li key={person.id}>
    <div><strong>{person.name ?? t('people.unnamed')}</strong><span>{note}</span></div>
    <button type="button" className="quiet" disabled={busy === person.id} onClick={() => void free(person.id)}>{t('people.plan.freeSeat')}</button>
  </li>;
  return <section aria-labelledby="plan-idle" className="people-span-section">
    <h2 id="plan-idle">{t('people.plan.idle')}</h2>
    <p className="hint">{t('people.plan.idleLead')}</p>
    <ul className="people-admins">
      {data.idle.map((person) => row(person, t('people.plan.idleNote')))}
      {data.not_joined.map((person) => row(person, t('people.plan.notJoinedNote')))}
    </ul>
    {data.not_sharing > 0 && <p className="hint">{t('people.plan.notSharing', { count: data.not_sharing })}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}

function SeatsRequest({ data, onSent }: { data: PlanData; onSent: () => Promise<void> }) {
  const t = useAppT(), problem = useProblem(), { when } = useDates();
  const { org: { id: orgId } } = useWorkspace();
  const [form, setForm] = useState({ seats: '', message: '', phone: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const contactEmail = typeof data.contact.email === 'string' ? data.contact.email : '', contactPhone = typeof data.contact.phone === 'string' ? data.contact.phone : '';
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await api(`orgs/${orgId}/insights/seats-request`, { method: 'POST', body: { seats: form.seats ? Number(form.seats) : null, message: form.message || null, phone: form.phone || null } });
      await onSent();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <section aria-labelledby="plan-more">
    <h2 id="plan-more">{t('people.plan.more')}</h2>
    <p className="hint">{t('people.plan.moreLead')}</p>
    {data.seats_requested_at ? <p className="notice" role="status">{t('people.plan.requested', { date: when(data.seats_requested_at) })}</p> : <form className="people-form-grid" onSubmit={submit}>
      <label>{t('people.plan.seatsWanted')}<input type="number" min={1} max={100000} value={form.seats} onChange={(event) => setForm({ ...form, seats: event.target.value })}/></label>
      <label>{t('people.field.contact_phone')}<input type="tel" maxLength={40} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })}/></label>
      <label className="people-span">{t('people.plan.message')}<textarea rows={3} maxLength={1000} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })}/></label>
      <div className="people-form-actions"><button disabled={busy}>{busy ? t('app.loading') : t('people.plan.send')}</button></div>
    </form>}
    {error && <p className="error" role="alert">{error}</p>}
    {(contactEmail || contactPhone) && <div className="company-actions">
      {contactEmail && <a className="button-link quiet" href={`mailto:${contactEmail}`}>{t('people.settings.writeSchood')}</a>}
      {contactPhone && <a className="button-link quiet" href={`tel:${contactPhone.replace(/[^\d+]/g, '')}`}>{t('people.settings.callSchood', { phone: contactPhone })}</a>}
    </div>}
  </section>;
}

export function PlanInvoicePage({ invoiceId }: { invoiceId: string }) {
  const t = useAppT(), problem = useProblem();
  const { org: { id: orgId } } = useWorkspace();
  const { query } = useLocation();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ invoice: InvoiceDetail }>(`orgs/${orgId}/plan/invoices/${encodeURIComponent(invoiceId)}`).then((data) => setInvoice(data.invoice)).catch((cause) => setError(problem(cause)));
  }, [orgId, invoiceId]);
  if (!invoice) return error ? <p className="error" role="alert">{error}</p> : <p role="status">{t('app.loading')}</p>;
  const kind = query.get('doc') === 'act' && invoice.act_number ? 'act' : 'invoice';
  return <div className="people">
    <div className="company-actions no-print">
      <Link className="button-link quiet" to={`/w/${orgId}/plan`}>{t('people.plan.back')}</Link>
      <button type="button" onClick={() => print()}>{t('people.doc.print')}</button>
      {invoice.act_number && (kind === 'act'
        ? <Link className="button-link quiet" to={`/w/${orgId}/plan/invoices/${invoice.id}`}>{t('people.doc.showInvoice')}</Link>
        : <Link className="button-link quiet" to={`/w/${orgId}/plan/invoices/${invoice.id}?doc=act`}>{t('people.doc.showAct')}</Link>)}
    </div>
    <InvoiceDocument invoice={invoice} kind={kind}/>
  </div>;
}
