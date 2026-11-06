// /staff/orgs/:org/view — what this workspace's HR sees, read-only and clearly labelled.
// Not impersonation: nobody signs in as anyone, there is nothing to press, and every opening
// is written to the audit log. Someone who has not agreed to share shows membership only.
import React, { useEffect, useState } from 'react';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import type { ChecklistState } from '../people/types.ts';
import { Meter, useDates, useProblem } from '../people/ui.tsx';
import { StaffFrame } from './common.tsx';
import { UsageChart, type Week } from './StaffHealth.tsx';

interface ViewData {
  org: { id: string; name: string; status: string; industry: string; size_band: string; city: string | null; contract_ends_at: string | null };
  usage: { seats_used: number; seats_limit: number; tests_used: number; tests_limit: number | null };
  departments: { id: string; name: string; people: number }[];
  people: { id: string; name: string | null; role: string; status: string; seat: boolean; department: string | null; job_role: string; level: string | null; consent: boolean; minutes_30d: number | null }[];
  tests: { id: string; title: string; kind: string; status: string; started: number; graded: number }[];
  weeks: Week[];
  onboarding: ChecklistState;
}

export function StaffView({ orgId }: { orgId: string }) {
  const t = useAppT(), problem = useProblem(), { day } = useDates();
  const [data, setData] = useState<ViewData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<ViewData>(`staff/orgs/${encodeURIComponent(orgId)}/view`, { timeoutMs: 60000 }).then(setData).catch((cause) => setError(problem(cause))); }, [orgId]);
  if (!data) return <StaffFrame title={t('staff.view.title')}>{error ? <p className="error" role="alert">{error}</p> : <p role="status">{t('app.loading')}</p>}</StaffFrame>;
  const { org, usage } = data;
  return <StaffFrame title={org.name} lead={`${t(`industry.${org.industry}` as AppKey)} · ${t(`size.${org.size_band}` as AppKey)}${org.city ? ` · ${org.city}` : ''}`}
    actions={<Link className="button-link quiet" to={`/staff/orgs/${org.id}`}>{t('staff.view.back')}</Link>}>
    <p className="staff-view-banner" role="status"><strong>{t('staff.view.banner')}</strong> {t('staff.view.bannerNote')}</p>
    <div className="people-settings">
      <section aria-labelledby="view-plan">
        <h2 id="view-plan">{t('people.plan.now')}</h2>
        <dl className="people-facts">
          <div><dt>{t('people.field.status')}</dt><dd>{t(`status.${org.status}` as AppKey)}</dd></div>
          <div><dt>{t('people.settings.contract')}</dt><dd>{day(org.contract_ends_at)}</dd></div>
        </dl>
        <Meter label={t('people.usage.seats')} used={usage.seats_used} limit={usage.seats_limit} unlimited={t('people.usage.unlimited')}/>
        <Meter label={t('people.usage.tests')} used={usage.tests_used} limit={usage.tests_limit} unlimited={t('people.usage.unlimited')}/>
      </section>
      <section aria-labelledby="view-setup">
        <h2 id="view-setup">{t('people.checklist.title')}</h2>
        <p className="hint">{t('people.checklist.progress', { done: data.onboarding.done, total: data.onboarding.total })}</p>
        <ul className="staff-reasons">
          {data.onboarding.items.filter((item) => item.applies).map((item) => <li key={item.key}>{item.done ? '✓ ' : '○ '}{t(`people.checklist.${item.key}` as AppKey)}</li>)}
        </ul>
      </section>
    </div>
    <div className="staff-charts">
      <UsageChart weeks={data.weeks} metric="learners" label={t('staff.usage.learners')}/>
      <UsageChart weeks={data.weeks} metric="minutes" label={t('staff.usage.minutes')}/>
      <UsageChart weeks={data.weeks} metric="tests" label={t('staff.usage.tests')}/>
    </div>
    <section className="staff-section" aria-labelledby="view-people">
      <h2 id="view-people">{t('people.title')} ({data.people.length})</h2>
      <p className="hint">{t('staff.view.consent')}</p>
      {data.people.length === 0 ? <p className="people-empty">{t('people.empty.none')}</p> : <div className="company-table-wrap">
        <table className="company-table">
          <thead><tr>
            <th scope="col">{t('people.col.person')}</th><th scope="col">{t('people.field.department_id')}</th><th scope="col">{t('people.field.role')}</th><th scope="col">{t('people.field.level')}</th>
            <th scope="col">{t('people.field.seat')}</th><th scope="col">{t('people.field.status')}</th><th scope="col" className="people-num">{t('staff.view.minutes')}</th>
          </tr></thead>
          <tbody>{data.people.map((row) => <tr key={row.id}>
            <td>{row.name ?? '—'}<span className="people-job">{t(`job.${row.job_role}` as AppKey)}</span></td><td>{row.department ?? '—'}</td><td>{t(`role.${row.role}` as AppKey)}</td>
            <td>{row.level ? t(`level.${row.level}` as AppKey) : '—'}</td><td>{row.seat ? t('people.seat.on') : '—'}</td><td>{t(`people.status.${row.status}` as AppKey)}</td>
            <td className="people-num">{row.minutes_30d === null ? <span className="people-muted">{t('staff.view.private')}</span> : row.minutes_30d}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
    <section className="staff-section" aria-labelledby="view-tests">
      <h2 id="view-tests">{t('people.search.tests')} ({data.tests.length})</h2>
      {data.tests.length === 0 ? <p className="people-empty">{t('staff.view.noTests')}</p> : <div className="company-table-wrap">
        <table className="company-table">
          <thead><tr><th scope="col">{t('staff.contract.title')}</th><th scope="col">{t('staff.view.kind')}</th><th scope="col" className="people-num">{t('staff.view.started')}</th><th scope="col" className="people-num">{t('staff.view.graded')}</th></tr></thead>
          <tbody>{data.tests.map((row) => <tr key={row.id}><td>{row.title}</td><td>{t(`people.search.testKind.${row.kind}` as AppKey)}</td><td className="people-num">{row.started}</td><td className="people-num">{row.graded}</td></tr>)}</tbody>
        </table>
      </div>}
    </section>
    <section className="staff-section" aria-labelledby="view-departments">
      <h2 id="view-departments">{t('people.departments.title')} ({data.departments.length})</h2>
      {data.departments.length === 0 ? <p className="people-empty">{t('staff.view.noDepartments')}</p> : <ul className="staff-bars">
        {data.departments.map((row) => <li key={row.id}><span>{row.name}</span><span/><strong>{row.people}</strong></li>)}
      </ul>}
    </section>
  </StaffFrame>;
}
