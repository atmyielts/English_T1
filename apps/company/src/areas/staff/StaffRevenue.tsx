// /staff/revenue — one founder's view of every contract: monthly revenue and pipeline from
// what staff entered, renewals to raise, contracts ending soon, overdue invoices.
import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { invoiceBadge } from '../people/PlanPage.tsx';
import type { ContractView, InvoiceSummary } from '../people/types.ts';
import { csvCell, download, useDates, useMoney, useProblem } from '../people/ui.tsx';
import { StaffFrame } from './common.tsx';

interface Revenue {
  summary: {
    pipeline_value: number; pipeline_count: number; by_status: Record<string, { count: number; value: number }>; mrr: number; live_contracts: number;
    outstanding: number; overdue_total: number; overdue_count: number;
  };
  contracts: (ContractView & { org_name: string | null })[];
  invoices: (InvoiceSummary & { org_name: string | null })[];
  expiring: { org_id: string; org_name: string | null; contract_id: string | null; title: string | null; ends_on: string; value: number | null }[];
  renewals: { org_id: string; org_name: string | null; contract_id: string; title: string; renewal_date: string; ends_on: string | null; late: boolean; value: number }[];
  overdue: { id: string; number: string; org_id: string; org_name: string | null; due_date: string; balance: number; days_overdue: number }[];
  today: string;
}

export function StaffRevenue() {
  const t = useAppT(), problem = useProblem(), { day } = useDates(), money = useMoney();
  const [data, setData] = useState<Revenue | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      setData(await api<Revenue>('staff/revenue'));
      setError('');
    } catch (cause) {
      setError(problem(cause));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function renew(id: string) {
    setBusy(id); setError(''); setNotice('');
    try {
      await api(`staff/contracts/${id}/renew`, { method: 'POST' });
      setNotice(t('staff.revenue.renewalOpened'));
      await load();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy('');
    }
  }
  function exportInvoices() {
    if (!data) return;
    const head = ['number', 'workspace', 'issued', 'due', 'status', 'total', 'paid', 'balance', 'act'];
    const rows = data.invoices.map((row) => [row.number, row.org_name, row.issue_date, row.due_date, row.status, row.total, row.paid_amount, row.balance, row.act_number]);
    download(`schood-company-invoices-${data.today}.csv`, [head, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n'));
  }
  if (!data) return <StaffFrame title={t('staff.revenue.title')}>{error ? <p className="error" role="alert">{error}</p> : <p role="status">{t('app.loading')}</p>}</StaffFrame>;
  const { summary } = data;
  const open = ['quote', 'sent', 'negotiating', 'signed'] as const;
  const topValue = Math.max(1, ...open.map((status) => summary.by_status[status]?.value ?? 0));
  return <StaffFrame title={t('staff.revenue.title')} lead={t('staff.revenue.lead')}>
    {notice && <p className="notice" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="company-grid staff-stats">
      <div className="company-stat"><strong>{money(summary.mrr)}</strong><span>{t('staff.revenue.mrr', { count: summary.live_contracts })}</span></div>
      <div className="company-stat"><strong>{money(summary.pipeline_value)}</strong><span>{t('staff.revenue.pipeline', { count: summary.pipeline_count })}</span></div>
      <div className="company-stat"><strong>{money(summary.outstanding)}</strong><span>{t('staff.revenue.outstanding')}</span></div>
      <div className="company-stat"><strong>{money(summary.overdue_total)}</strong><span>{t('staff.revenue.overdue', { count: summary.overdue_count })}</span></div>
    </div>
    <p className="hint">{t('staff.revenue.basis')}</p>

    <section className="staff-section" aria-labelledby="renewals-title">
      <h2 id="renewals-title">{t('staff.revenue.renewals')}</h2>
      {data.renewals.length === 0 ? <p className="hint">{t('staff.revenue.noRenewals')}</p> : <ul className="people-admins">
        {data.renewals.map((row) => <li key={row.contract_id}>
          <div><strong><Link to={`/staff/orgs/${row.org_id}`}>{row.org_name ?? row.org_id.slice(0, 8)}</Link></strong><span>{row.title} · {t('staff.revenue.endsOn', { date: day(row.ends_on) })} · {money(row.value)}</span></div>
          <span className={`company-badge ${row.late ? 'bad' : 'warn'}`}>{t('staff.revenue.remind', { date: day(row.renewal_date) })}</span>
          <button type="button" className="quiet" disabled={busy === row.contract_id} onClick={() => void renew(row.contract_id)}>{t('staff.revenue.renew')}</button>
        </li>)}
      </ul>}
    </section>

    <section className="staff-section" aria-labelledby="expiring-title">
      <h2 id="expiring-title">{t('staff.revenue.expiring')}</h2>
      {data.expiring.length === 0 ? <p className="hint">{t('staff.revenue.noExpiring')}</p> : <ul className="people-admins">
        {data.expiring.map((row) => <li key={`${row.org_id}-${row.contract_id ?? 'plan'}`}>
          <div><strong><Link to={`/staff/orgs/${row.org_id}`}>{row.org_name ?? row.org_id.slice(0, 8)}</Link></strong><span>{row.title ?? t('staff.revenue.planEnd')}{row.value !== null ? ` · ${money(row.value)}` : ''}</span></div>
          <span className="company-badge warn">{day(row.ends_on)}</span>
        </li>)}
      </ul>}
    </section>

    <section className="staff-section" aria-labelledby="overdue-title">
      <h2 id="overdue-title">{t('staff.revenue.overdueList')}</h2>
      {data.overdue.length === 0 ? <p className="hint">{t('staff.revenue.noOverdue')}</p> : <ul className="people-admins">
        {data.overdue.map((row) => <li key={row.id}>
          <div><strong><Link to={`/staff/invoices/${row.id}`}>{row.number}</Link></strong><span>{row.org_name ?? ''} · {money(row.balance)}</span></div>
          <span className="company-badge bad">{t('staff.revenue.lateBy', { days: row.days_overdue })}</span>
        </li>)}
      </ul>}
    </section>

    <section className="staff-section" aria-labelledby="stages-title">
      <h2 id="stages-title">{t('staff.revenue.stages')}</h2>
      <ul className="staff-bars">
        {open.map((status) => {
          const row = summary.by_status[status] ?? { count: 0, value: 0 };
          return <li key={status}><span>{t(`staff.contract.status.${status}` as AppKey)} ({row.count})</span><span className="staff-bar"><span style={{ width: `${Math.round(row.value / topValue * 100)}%` }}/></span><strong>{money(row.value)}</strong></li>;
        })}
      </ul>
    </section>

    <section className="staff-section" aria-labelledby="contracts-title">
      <h2 id="contracts-title">{t('staff.revenue.contracts')}</h2>
      {data.contracts.length === 0 ? <p className="people-empty">{t('staff.revenue.noContracts')}</p> : <div className="company-table-wrap">
        <table className="company-table">
          <thead><tr>
            <th scope="col">{t('staff.orgs.col.name')}</th><th scope="col">{t('staff.contract.title')}</th><th scope="col">{t('people.field.status')}</th><th scope="col" className="people-num">{t('people.usage.seats')}</th>
            <th scope="col" className="people-num">{t('staff.contract.total')}</th><th scope="col" className="people-num">{t('staff.contract.monthly')}</th><th scope="col">{t('staff.orgs.col.contract')}</th>
          </tr></thead>
          <tbody>{data.contracts.map((row) => <tr key={row.id}>
            <td><Link to={`/staff/orgs/${row.org_id}`}>{row.org_name ?? row.org_id.slice(0, 8)}</Link></td><td>{row.title}</td>
            <td><span className={`company-badge ${row.status === 'signed' ? 'good' : row.status === 'lost' || row.status === 'ended' ? 'bad' : ''}`}>{t(`staff.contract.status.${row.status}` as AppKey)}</span></td>
            <td className="people-num">{row.seats}</td><td className="people-num">{money(row.total)}</td><td className="people-num">{money(row.monthly)}</td><td>{day(row.end_date)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>

    <section className="staff-section" aria-labelledby="invoices-title">
      <div className="people-panel-head">
        <h2 id="invoices-title">{t('staff.revenue.invoices')}</h2>
        {data.invoices.length > 0 && <button type="button" className="quiet" onClick={exportInvoices}>{t('staff.revenue.exportCsv')}</button>}
      </div>
      {data.invoices.length === 0 ? <p className="people-empty">{t('staff.revenue.noInvoices')}</p> : <div className="company-table-wrap">
        <table className="company-table">
          <thead><tr>
            <th scope="col">{t('people.plan.invoice')}</th><th scope="col">{t('staff.orgs.col.name')}</th><th scope="col">{t('people.plan.dueOn')}</th>
            <th scope="col" className="people-num">{t('people.doc.total')}</th><th scope="col" className="people-num">{t('people.plan.balance')}</th><th scope="col">{t('people.field.status')}</th>
          </tr></thead>
          <tbody>{data.invoices.map((row) => <tr key={row.id}>
            <td><Link to={`/staff/invoices/${row.id}`}>{row.number}</Link></td><td>{row.org_name ?? ''}</td><td>{day(row.due_date)}</td>
            <td className="people-num">{money(row.total)}</td><td className="people-num">{money(row.balance)}</td>
            <td><span className={`company-badge ${invoiceBadge(row.status, row.overdue)}`}>{row.overdue ? t('people.invoice.overdue') : t(`people.invoice.${row.status}` as AppKey)}</span></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </StaffFrame>;
}
