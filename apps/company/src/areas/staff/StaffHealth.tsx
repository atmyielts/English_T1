// /staff/health — which workspaces are thriving and which need a call, with the reasons.
// Exports the usage chart that the workspace page shows as well.
import React, { useEffect, useState } from 'react';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useDates, useProblem } from '../people/ui.tsx';
import { StaffFrame } from './common.tsx';

export type Band = 'healthy' | 'watch' | 'at_risk';
export interface Signals { people: number; active_learners: number; seats_used: number; seats_limit: number; tests_used: number; tests_limit: number | null; tests_recent: number; last_hr_at: string | null }
interface Row { id: string; name: string; status: string; contract_ends_at: string | null; signals: Signals; score: number; band: Band; reasons: string[] }
export interface Week { week: string; learners: number; minutes: number; tests: number }

export const BAND_CLASS: Record<Band, string> = { healthy: 'good', watch: 'warn', at_risk: 'bad' };

export function Reasons({ reasons }: { reasons: string[] }) {
  const t = useAppT();
  if (!reasons.length) return null;
  return <ul className="staff-reasons">{reasons.map((reason) => <li key={reason}>{t(`staff.health.reason.${reason}` as AppKey)}</li>)}</ul>;
}

/** Weekly columns, drawn with CSS; the numbers also go to screen readers as a table. */
export function UsageChart({ weeks, metric, label }: { weeks: Week[]; metric: 'learners' | 'minutes' | 'tests'; label: string }) {
  const { day } = useDates();
  const top = Math.max(1, ...weeks.map((row) => row[metric]));
  return <figure className="staff-chart">
    <figcaption>{label}</figcaption>
    <div className="staff-chart-bars" aria-hidden="true">
      {weeks.map((row) => <span key={row.week} title={`${day(row.week)}: ${row[metric]}`}><i style={{ height: `${Math.round(row[metric] / top * 100)}%` }}/></span>)}
    </div>
    <table className="visually-hidden"><caption>{label}</caption><tbody>{weeks.map((row) => <tr key={row.week}><th scope="row">{day(row.week)}</th><td>{row[metric]}</td></tr>)}</tbody></table>
    <p className="staff-chart-range" aria-hidden="true"><span>{weeks[0] ? day(weeks[0].week) : ''}</span><strong>{weeks.at(-1)?.[metric] ?? 0}</strong></p>
  </figure>;
}

export function StaffHealth() {
  const t = useAppT(), problem = useProblem(), { day } = useDates();
  const [data, setData] = useState<{ workspaces: Row[]; counts: Record<Band, number>; churn_risk: string[] } | null>(null);
  const [filter, setFilter] = useState<Band | 'churn' | ''>('');
  const [error, setError] = useState('');
  useEffect(() => { api<NonNullable<typeof data>>('staff/health', { timeoutMs: 60000 }).then(setData).catch((cause) => setError(problem(cause))); }, []);
  if (!data) return <StaffFrame title={t('staff.health.title')}>{error ? <p className="error" role="alert">{error}</p> : <p role="status">{t('app.loading')}</p>}</StaffFrame>;
  const churn = new Set(data.churn_risk);
  const shown = data.workspaces.filter((row) => !filter || (filter === 'churn' ? churn.has(row.id) : row.band === filter));
  return <StaffFrame title={t('staff.health.title')} lead={t('staff.health.lead')}>
    <div className="staff-chips" role="group" aria-label={t('staff.health.filter')}>
      <button type="button" className={filter ? 'quiet' : ''} aria-pressed={!filter} onClick={() => setFilter('')}>{t('common.all')} <span className="staff-count">{data.workspaces.length}</span></button>
      <button type="button" className={filter === 'churn' ? '' : 'quiet'} aria-pressed={filter === 'churn'} onClick={() => setFilter('churn')}>{t('staff.health.churn')} <span className="staff-count">{data.churn_risk.length}</span></button>
      {(['at_risk', 'watch', 'healthy'] as const).map((band) => <button key={band} type="button" className={filter === band ? '' : 'quiet'} aria-pressed={filter === band} onClick={() => setFilter(band)}>{t(`staff.health.band.${band}`)} <span className="staff-count">{data.counts[band]}</span></button>)}
    </div>
    <p className="hint">{t('staff.health.basis')}</p>
    {shown.length === 0 ? <p className="people-empty">{t('staff.health.empty')}</p> : <div className="company-table-wrap">
      <table className="company-table staff-health">
        <thead><tr>
          <th scope="col">{t('staff.orgs.col.name')}</th><th scope="col">{t('staff.health.score')}</th><th scope="col">{t('staff.health.learners')}</th><th scope="col">{t('people.usage.seats')}</th>
          <th scope="col">{t('people.usage.tests')}</th><th scope="col">{t('staff.health.lastHr')}</th><th scope="col">{t('staff.health.why')}</th>
        </tr></thead>
        <tbody>{shown.map((row) => <tr key={row.id}>
          <td><Link to={`/staff/orgs/${row.id}`}><strong>{row.name}</strong></Link><span className="people-email">{t(`status.${row.status}` as AppKey)}</span></td>
          <td><span className={`company-badge ${BAND_CLASS[row.band]}`}>{row.score}</span> <span className="people-muted">{t(`staff.health.band.${row.band}`)}</span>{churn.has(row.id) && <span className="people-email">{t('staff.health.churn')}</span>}</td>
          <td>{row.signals.active_learners} / {row.signals.people}</td>
          <td>{row.signals.seats_used} / {row.signals.seats_limit}</td>
          <td>{row.signals.tests_used} / {row.signals.tests_limit ?? '∞'}<span className="people-email">{t('staff.health.testsRecent', { count: row.signals.tests_recent })}</span></td>
          <td>{day(row.signals.last_hr_at)}</td>
          <td><Reasons reasons={row.reasons}/></td>
        </tr>)}</tbody>
      </table>
    </div>}
  </StaffFrame>;
}
