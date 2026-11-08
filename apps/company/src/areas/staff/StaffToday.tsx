// The top of the staff console: what needs doing today across every workspace, each line
// linking to where it is done. Reads only what the revenue, health and leads pages read.
import React, { useEffect, useState, type ReactNode } from 'react';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useDates, useMoney } from '../people/ui.tsx';

interface Today {
  mrr: number; pipeline_value: number; overdue_total: number; expiring_count: number;
  calls: { id: string; company: string; name: string; phone: string | null; days_late: number; score: number }[]; calls_count: number;
  renewals: { contract_id: string; org_id: string; org_name: string | null; title: string; renewal_date: string; late: boolean }[]; renewals_count: number;
  overdue: { id: string; number: string; org_name: string | null; balance: number; days_overdue: number }[]; overdue_count: number;
  churn: { id: string; name: string; score: number; reasons: string[] }[]; churn_count: number;
}

function Card({ title, to, children }: { title: string; to: string; children: ReactNode }) {
  const t = useAppT();
  return <div className="staff-today-card">
    <div className="people-panel-head"><h3>{title}</h3><Link to={to}>{t('staff.today.seeAll')}</Link></div>
    <ul>{children}</ul>
  </div>;
}

export function StaffToday() {
  const t = useAppT(), { day } = useDates(), money = useMoney();
  const [data, setData] = useState<Today | null>(null);
  // A summary above the list: if it cannot load, the workspaces below still work.
  useEffect(() => { api<Today>('staff/today', { timeoutMs: 60000 }).then(setData).catch(() => setData(null)); }, []);
  if (!data) return null;
  const nothing = !data.calls_count && !data.renewals_count && !data.overdue_count && !data.churn_count;
  return <section className="staff-section staff-today" aria-labelledby="staff-today-title">
    <h2 id="staff-today-title">{t('staff.today.title')}</h2>
    <div className="company-grid staff-stats">
      <div className="company-stat"><strong>{money(data.mrr)}</strong><span>{t('staff.today.mrr')}</span></div>
      <div className="company-stat"><strong>{money(data.pipeline_value)}</strong><span>{t('staff.today.pipeline')}</span></div>
    </div>
    {nothing ? <p className="hint">{t('staff.today.clear')}</p> : <div className="staff-today-grid">
      {data.calls_count > 0 && <Card title={t('staff.today.calls', { count: data.calls_count })} to="/staff/leads?view=today">
        {data.calls.map((row) => <li key={row.id}>
          <Link to={`/staff/leads?lead=${row.id}`}>{row.company}</Link>
          <span>{row.name}{row.days_late > 0 ? ` · ${t('staff.calls.late', { days: row.days_late })}` : ''}</span>
        </li>)}
      </Card>}
      {data.renewals_count > 0 && <Card title={t('staff.today.renewals', { count: data.renewals_count })} to="/staff/revenue">
        {data.renewals.map((row) => <li key={row.contract_id}>
          <Link to={`/staff/orgs/${row.org_id}`}>{row.org_name ?? row.title}</Link>
          <span>{t('staff.revenue.remind', { date: day(row.renewal_date) })}</span>
        </li>)}
      </Card>}
      {data.overdue_count > 0 && <Card title={t('staff.today.overdue', { count: data.overdue_count })} to="/staff/revenue">
        {data.overdue.map((row) => <li key={row.id}>
          <Link to={`/staff/invoices/${row.id}`}>{row.number}</Link>
          <span>{row.org_name ?? ''} · {money(row.balance)} · {t('staff.revenue.lateBy', { days: row.days_overdue })}</span>
        </li>)}
      </Card>}
      {data.churn_count > 0 && <Card title={t('staff.today.churn', { count: data.churn_count })} to="/staff/health">
        {data.churn.map((row) => <li key={row.id}>
          <Link to={`/staff/orgs/${row.id}`}>{row.name}</Link>
          <span>{row.reasons.slice(0, 2).map((reason) => t(`staff.health.reason.${reason}` as AppKey)).join(', ')}</span>
        </li>)}
      </Card>}
    </div>}
    {data.expiring_count > 0 && <p className="hint">{t('staff.today.expiring', { count: data.expiring_count })} <Link to="/staff/revenue">{t('staff.today.seeAll')}</Link></p>}
  </section>;
}
