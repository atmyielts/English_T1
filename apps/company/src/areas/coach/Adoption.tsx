// Practice habit (/w/:org/coach/habit): for HR and managers, whether regular practice is
// taking hold. Totals only, from people who agreed to share, and no small groups.
import React from 'react';
import { useAppT } from '../../i18n/index.ts';
import { useDate, useLoad } from '../training/lib.tsx';
import { useWorkspace } from '../../session.tsx';
import { Gate } from './lib.tsx';

interface Numbers { people: number; active_week: number; regular_week: number; days_per_person: number }
interface Adoption {
  min_group: number; seated: number; sharing: number; not_sharing: number; enough: boolean; overall: Numbers | null;
  weeks: { monday: string; active: number; percent: number }[];
  departments: ({ id: string | null; name: string | null; hidden: true } | ({ id: string | null; name: string | null; hidden: false } & Numbers))[];
}

export function Adoption() {
  const t = useAppT(), when = useDate();
  const { org } = useWorkspace();
  const { data, error, cause } = useLoad<Adoption>(`orgs/${org.id}/coach/adoption`);
  if (!data) return <Gate error={error} cause={cause}/>;
  return <div className="coach-page">
    <header className="coach-head">
      <h1>{t('coach.adoption.title')}</h1>
      <p>{t('coach.adoption.lead')}</p>
    </header>
    <p className="coach-honest">{t('coach.adoption.privacy', { min: data.min_group, sharing: data.sharing, seated: data.seated })}</p>
    {!data.enough || !data.overall ? <section className="coach-card coach-empty">
      <h2>{t('coach.adoption.notEnough')}</h2>
      <p>{t('coach.adoption.notEnoughBody', { min: data.min_group })}</p>
    </section> : <>
      <div className="company-grid coach-tiles">
        <div className="company-stat"><strong>{data.overall.active_week} / {data.overall.people}</strong><span>{t('coach.adoption.active')}</span></div>
        <div className="company-stat"><strong>{data.overall.regular_week}</strong><span>{t('coach.adoption.regular')}</span></div>
        <div className="company-stat"><strong>{data.overall.days_per_person}</strong><span>{t('coach.adoption.days')}</span></div>
      </div>
      <section className="coach-card" aria-labelledby="coach-adoption-weeks">
        <h2 id="coach-adoption-weeks">{t('coach.adoption.weeks')}</h2>
        <ol className="coach-trend">
          {data.weeks.map((week) => <li key={week.monday}>
            <span className="coach-trend-value">{week.percent}%</span>
            <span className="coach-trend-bar"><span style={{ height: `${week.percent}%` }}/></span>
            <span className="coach-trend-label">{when(week.monday)}</span>
          </li>)}
        </ol>
      </section>
      <section className="coach-card" aria-labelledby="coach-adoption-dept">
        <h2 id="coach-adoption-dept">{t('coach.adoption.departments')}</h2>
        <div className="company-table-wrap"><table className="company-table">
          <thead><tr>
            <th scope="col">{t('coach.adoption.department')}</th><th scope="col">{t('coach.adoption.people')}</th>
            <th scope="col">{t('coach.adoption.active')}</th><th scope="col">{t('coach.adoption.regular')}</th><th scope="col">{t('coach.adoption.days')}</th>
          </tr></thead>
          <tbody>{data.departments.map((row) => <tr key={row.id ?? 'none'}>
            <th scope="row">{row.name ?? t('coach.adoption.noDepartment')}</th>
            {row.hidden ? <td colSpan={4}>{t('coach.adoption.tooSmall', { min: data.min_group })}</td> : <>
              <td>{row.people}</td><td>{row.active_week}</td><td>{row.regular_week}</td><td>{row.days_per_person}</td>
            </>}
          </tr>)}</tbody>
        </table></div>
      </section>
    </>}
  </div>;
}
