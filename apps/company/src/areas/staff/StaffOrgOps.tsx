// On a workspace's staff page: its health and usage over time, quotes and contracts,
// invoices, and the company details that go on documents.
import React, { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link, navigate } from '../../router.tsx';
import { BuyerForm, invoiceBadge } from '../people/PlanPage.tsx';
import type { ContractView, InvoiceDetail, PartyDetails } from '../people/types.ts';
import { useDates, useMoney, useProblem } from '../people/ui.tsx';
import { BAND_CLASS, Reasons, UsageChart, type Band, type Signals, type Week } from './StaffHealth.tsx';

const STATUSES = ['quote', 'sent', 'negotiating', 'signed', 'lost', 'ended'] as const;
interface Billing { contracts: ContractView[]; invoices: InvoiceDetail[]; buyer: PartyDetails; seller_ready: boolean }
interface Usage { signals: Signals; score: number; band: Band; reasons: string[]; weeks: Week[] }

const blankContract = { title: '', status: 'quote', seats: '', tests: '', price_per_seat: '', tests_fee: '', term_months: '12', start_date: '', end_date: '', renewal_date: '', notes: '' };

function ContractForm({ initial, busy, onSave, onCancel }: { initial: typeof blankContract; busy: boolean; onSave: (body: Record<string, unknown>) => void; onCancel: () => void }) {
  const t = useAppT(), money = useMoney();
  const [form, setForm] = useState(initial);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  const seats = Number(form.seats || 0), price = Number(form.price_per_seat || 0), fee = Number(form.tests_fee || 0), term = Math.max(1, Number(form.term_months || 1));
  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({
      title: form.title, status: form.status, seats, tests: form.tests === '' ? null : Number(form.tests), price_per_seat: price, tests_fee: fee, term_months: term,
      start_date: form.start_date || null, end_date: form.end_date || null, renewal_date: form.renewal_date || null, notes: form.notes || null,
    });
  }
  return <form className="people-form-grid" onSubmit={submit}>
    <label className="people-span">{t('staff.contract.title')}<input required minLength={2} maxLength={160} value={form.title} onChange={set('title')}/></label>
    <label>{t('people.field.status')}<select value={form.status} onChange={set('status')}>{STATUSES.map((status) => <option key={status} value={status}>{t(`staff.contract.status.${status}`)}</option>)}</select></label>
    <label>{t('people.usage.seats')}<input type="number" required min={0} max={100000} value={form.seats} onChange={set('seats')}/></label>
    <label>{t('people.usage.tests')}<input type="number" min={0} max={1000000} value={form.tests} onChange={set('tests')} placeholder={t('people.usage.unlimited')}/></label>
    <label>{t('staff.contract.price')}<input type="number" required min={0} max={10000000000} value={form.price_per_seat} onChange={set('price_per_seat')}/></label>
    <label>{t('staff.contract.testsFee')}<input type="number" min={0} value={form.tests_fee} onChange={set('tests_fee')}/></label>
    <label>{t('staff.contract.term')}<input type="number" required min={1} max={120} value={form.term_months} onChange={set('term_months')}/></label>
    <label>{t('staff.contract.start')}<input type="date" value={form.start_date} onChange={set('start_date')}/></label>
    <label>{t('staff.contract.end')}<input type="date" value={form.end_date} onChange={set('end_date')}/></label>
    <label>{t('staff.contract.renewal')}<input type="date" value={form.renewal_date} onChange={set('renewal_date')}/></label>
    <label className="people-span">{t('staff.contract.notes')}<textarea rows={2} maxLength={4000} value={form.notes} onChange={set('notes')}/></label>
    <p className="hint people-span" role="status">{t('staff.contract.computed', { total: money(seats * price + fee), monthly: money(Math.round(seats * price / term)) })}</p>
    <p className="hint people-span">{t('staff.contract.signNote')}</p>
    <div className="people-form-actions">
      <button disabled={busy}>{t('common.save')}</button>
      <button type="button" className="quiet" onClick={onCancel}>{t('common.cancel')}</button>
    </div>
  </form>;
}

function InvoiceForm({ contracts, busy, onCreate, onCancel }: { contracts: ContractView[]; busy: boolean; onCreate: (body: Record<string, unknown>) => void; onCancel: () => void }) {
  const t = useAppT();
  const today = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
  const [contractId, setContractId] = useState('');
  const [lines, setLines] = useState([{ description: '', quantity: '1', unit_price: '' }]);
  const [form, setForm] = useState({ issue_date: today, due_date: '', vat_percent: '', notes: '' });
  function chooseContract(id: string) {
    setContractId(id);
    const contract = contracts.find((row) => row.id === id);
    if (!contract) return;
    setLines([
      { description: t('staff.invoice.lineSeats', { title: contract.title, months: contract.term_months }), quantity: String(contract.seats), unit_price: String(contract.price_per_seat) },
      ...(contract.tests_fee > 0 ? [{ description: t('staff.invoice.lineTests', { title: contract.title }), quantity: '1', unit_price: String(contract.tests_fee) }] : []),
    ]);
  }
  const setLine = (index: number, key: 'description' | 'quantity' | 'unit_price', value: string) => setLines(lines.map((line, at) => at === index ? { ...line, [key]: value } : line));
  function submit(event: FormEvent) {
    event.preventDefault();
    onCreate({
      contract_id: contractId || null, issue_date: form.issue_date, due_date: form.due_date || null, vat_percent: form.vat_percent === '' ? 0 : Number(form.vat_percent), notes: form.notes || null,
      lines: lines.map((line) => ({ description: line.description, quantity: Number(line.quantity), unit_price: Number(line.unit_price) })),
    });
  }
  return <form className="people-form-grid" onSubmit={submit} aria-label={t('staff.invoice.new')}>
    {contracts.length > 0 && <label className="people-span">{t('staff.invoice.fromContract')}<select value={contractId} onChange={(event) => chooseContract(event.target.value)}>
      <option value="">—</option>
      {contracts.map((row) => <option key={row.id} value={row.id}>{row.title} · {t(`staff.contract.status.${row.status}`)}</option>)}
    </select></label>}
    {lines.map((line, index) => <fieldset key={index} className="people-span staff-invoice-line">
      <legend>{t('staff.invoice.lineN', { n: index + 1 })}</legend>
      <label>{t('people.doc.line')}<input required maxLength={300} value={line.description} onChange={(event) => setLine(index, 'description', event.target.value)}/></label>
      <label>{t('people.doc.quantity')}<input type="number" required min={1} value={line.quantity} onChange={(event) => setLine(index, 'quantity', event.target.value)}/></label>
      <label>{t('people.doc.unitPrice')}<input type="number" required min={0} value={line.unit_price} onChange={(event) => setLine(index, 'unit_price', event.target.value)}/></label>
      {lines.length > 1 && <button type="button" className="quiet" onClick={() => setLines(lines.filter((_, at) => at !== index))}>{t('common.remove')}</button>}
    </fieldset>)}
    <div className="people-span"><button type="button" className="quiet" disabled={lines.length >= 30} onClick={() => setLines([...lines, { description: '', quantity: '1', unit_price: '' }])}>{t('staff.invoice.addLine')}</button></div>
    <label>{t('people.plan.issued')}<input type="date" required value={form.issue_date} onChange={(event) => setForm({ ...form, issue_date: event.target.value })}/></label>
    <label>{t('people.plan.dueOn')}<input type="date" min={form.issue_date} value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })}/></label>
    <label>{t('staff.invoice.vatPercent')}<input type="number" min={0} max={100} step="0.01" value={form.vat_percent} onChange={(event) => setForm({ ...form, vat_percent: event.target.value })}/></label>
    <label className="people-span">{t('staff.invoice.notes')}<textarea rows={2} maxLength={2000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })}/></label>
    <div className="people-form-actions">
      <button disabled={busy}>{t('staff.invoice.issue')}</button>
      <button type="button" className="quiet" onClick={onCancel}>{t('common.cancel')}</button>
    </div>
  </form>;
}

export function StaffOrgOps({ orgId, onPlanChanged }: { orgId: string; onPlanChanged: () => Promise<void> }) {
  const t = useAppT(), problem = useProblem(), { day } = useDates(), money = useMoney();
  const [billing, setBilling] = useState<Billing | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [panel, setPanel] = useState<'contract' | 'invoice' | string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      setBilling(await api<Billing>(`staff/orgs/${orgId}/billing`));
      setError('');
    } catch (cause) {
      setError(problem(cause));
    }
  }, [orgId]);
  useEffect(() => {
    void load();
    api<Usage>(`staff/orgs/${orgId}/usage`, { timeoutMs: 60000 }).then(setUsage).catch((cause) => setError(problem(cause)));
  }, [load, orgId]);
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await action();
      setNotice(message);
      setPanel(null);
      await Promise.all([load(), onPlanChanged()]);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const asForm = (row: ContractView): typeof blankContract => ({
    title: row.title, status: row.status, seats: String(row.seats), tests: row.tests === null ? '' : String(row.tests), price_per_seat: String(row.price_per_seat), tests_fee: String(row.tests_fee),
    term_months: String(row.term_months), start_date: row.start_date ?? '', end_date: row.end_date ?? '', renewal_date: row.renewal_date ?? '', notes: row.notes ?? '',
  });
  return <>
    {usage && <section className="staff-section" aria-labelledby="health-title">
      <h2 id="health-title">{t('staff.health.title')}</h2>
      <p><span className={`company-badge ${BAND_CLASS[usage.band]}`}>{usage.score} · {t(`staff.health.band.${usage.band}`)}</span> <span className="people-muted">{t('staff.health.lastHr')}: {day(usage.signals.last_hr_at)}</span></p>
      <Reasons reasons={usage.reasons}/>
      <div className="staff-charts">
        <UsageChart weeks={usage.weeks} metric="learners" label={t('staff.usage.learners')}/>
        <UsageChart weeks={usage.weeks} metric="minutes" label={t('staff.usage.minutes')}/>
        <UsageChart weeks={usage.weeks} metric="tests" label={t('staff.usage.tests')}/>
      </div>
    </section>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {billing && <>
      <section className="staff-section" aria-labelledby="contracts-title">
        <div className="people-panel-head">
          <h2 id="contracts-title">{t('staff.contract.heading')}</h2>
          <button type="button" className="quiet" aria-expanded={panel === 'contract'} onClick={() => setPanel(panel === 'contract' ? null : 'contract')}>{t('staff.contract.new')}</button>
        </div>
        {panel === 'contract' && <div className="people-panel"><ContractForm initial={blankContract} busy={busy} onCancel={() => setPanel(null)} onSave={(body) => void run(() => api(`staff/orgs/${orgId}/contracts`, { method: 'POST', body }), t('staff.contract.saved'))}/></div>}
        {billing.contracts.length === 0 ? <p className="hint">{t('staff.contract.none')}</p> : <ul className="staff-leads">
          {billing.contracts.map((row) => <li key={row.id}>
            <div className="staff-call">
              <div className="staff-lead-main">
                <strong>{row.title}</strong>
                <span>{t('staff.contract.summary', { seats: row.seats, tests: row.tests ?? '∞', months: row.term_months })} · {money(row.total)} · {t('staff.contract.perMonth', { amount: money(row.monthly) })}</span>
                <span>{day(row.start_date)} – {day(row.end_date)}{row.renewal_date ? ` · ${t('staff.revenue.remind', { date: day(row.renewal_date) })}` : ''}</span>
              </div>
              <div className="staff-lead-meta">
                <span className={`company-badge ${row.status === 'signed' ? 'good' : row.status === 'lost' || row.status === 'ended' ? 'bad' : ''}`}>{t(`staff.contract.status.${row.status}`)}</span>
                <Link className="button-link quiet" to={`/staff/contracts/${row.id}/quote`}>{t('staff.quote.print')}</Link>
                <button type="button" className="quiet" aria-expanded={panel === row.id} onClick={() => setPanel(panel === row.id ? null : row.id)}>{t('common.edit')}</button>
                {row.status === 'signed' && <button type="button" className="quiet" disabled={busy} onClick={() => void run(() => api(`staff/contracts/${row.id}/renew`, { method: 'POST' }), t('staff.revenue.renewalOpened'))}>{t('staff.revenue.renew')}</button>}
              </div>
            </div>
            {panel === row.id && <div className="staff-lead-detail"><ContractForm initial={asForm(row)} busy={busy} onCancel={() => setPanel(null)} onSave={(body) => void run(() => api(`staff/contracts/${row.id}`, { method: 'PATCH', body }), t('staff.contract.saved'))}/></div>}
          </li>)}
        </ul>}
      </section>
      <section className="staff-section" aria-labelledby="invoices-title">
        <div className="people-panel-head">
          <h2 id="invoices-title">{t('staff.revenue.invoices')}</h2>
          <button type="button" className="quiet" disabled={!billing.seller_ready} aria-expanded={panel === 'invoice'} onClick={() => setPanel(panel === 'invoice' ? null : 'invoice')}>{t('staff.invoice.new')}</button>
        </div>
        {!billing.seller_ready && <p className="notice" role="status">{t('staff.billing.missing')} <Link to="/staff/billing">{t('staff.nav.billing')}</Link></p>}
        {panel === 'invoice' && <div className="people-panel"><InvoiceForm contracts={billing.contracts.filter((row) => row.status !== 'lost')} busy={busy} onCancel={() => setPanel(null)} onCreate={(body) => void (async () => {
          setBusy(true); setError('');
          try {
            const made = await api<{ invoice: { id: string } }>(`staff/orgs/${orgId}/invoices`, { method: 'POST', body });
            navigate(`/staff/invoices/${made.invoice.id}`);
          } catch (cause) {
            setError(problem(cause));
          } finally {
            setBusy(false);
          }
        })()}/></div>}
        {billing.invoices.length === 0 ? <p className="hint">{t('staff.revenue.noInvoices')}</p> : <div className="company-table-wrap">
          <table className="company-table">
            <thead><tr>
              <th scope="col">{t('people.plan.invoice')}</th><th scope="col">{t('people.plan.issued')}</th><th scope="col">{t('people.plan.dueOn')}</th>
              <th scope="col" className="people-num">{t('people.doc.total')}</th><th scope="col" className="people-num">{t('people.plan.balance')}</th><th scope="col">{t('people.field.status')}</th>
            </tr></thead>
            <tbody>{billing.invoices.map((row) => <tr key={row.id}>
              <td><Link to={`/staff/invoices/${row.id}`}>{row.number}</Link></td><td>{day(row.issue_date)}</td><td>{day(row.due_date)}</td>
              <td className="people-num">{money(row.total)}</td><td className="people-num">{money(row.balance)}</td>
              <td><span className={`company-badge ${invoiceBadge(row.status, row.overdue)}`}>{row.overdue ? t('people.invoice.overdue') : t(`people.invoice.${row.status}` as AppKey)}</span></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
      <section className="staff-section" aria-labelledby="buyer-title">
        <h2 id="buyer-title">{t('staff.contract.buyer')}</h2>
        <BuyerForm buyer={billing.buyer} onSave={async (body) => { await api(`staff/orgs/${orgId}/billing`, { method: 'PUT', body }); await load(); }}/>
      </section>
    </>}
  </>;
}
