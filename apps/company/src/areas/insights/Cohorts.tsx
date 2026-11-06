// /w/:org/cohorts — level movement between two dates, per department and in total,
// and the people who moved up. Company test results, so it holds without consent.
import React from 'react';
import { useAppT } from '../../i18n/index.ts';
import { Link, navigate, useLocation } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { useApi, type LevelCode } from './api.ts';
import type { Cohorts as CohortData } from './api2.ts';
import { addDays, Kpi, LEVEL_CODES, LEVEL_SHORT, LevelBadge, Loading, Panel, Problem, tashkentToday, useFormat } from './ui.tsx';
import { CsvButton, PeriodForm } from './parts.tsx';

export function Cohorts() {
  const t = useAppT(), f = useFormat();
  const { org } = useWorkspace();
  const { query } = useLocation();
  const today = tashkentToday();
  const from = query.get('from') || addDays(today, -179), to = query.get('to') || today;
  const department = query.get('department') || '';
  const params = new URLSearchParams({ from, to });
  if (department) params.set('department', department);
  const { data, error, loading, reload } = useApi<CohortData>(`orgs/${org.id}/insights/cohorts?${params}`);
  const go = (next: { from?: string; to?: string; department?: string }) => {
    const out = new URLSearchParams({ from: next.from ?? from, to: next.to ?? to });
    const value = next.department ?? department;
    if (value) out.set('department', value);
    navigate(`/w/${org.id}/cohorts?${out}`, { replace: true });
  };
  const seen = data ? [...new Set(data.matrix.flatMap((row) => [row.from, row.to]))] : [];
  const levels = LEVEL_CODES.filter((level) => seen.includes(level));
  const cell = (from: LevelCode, to: LevelCode) => data?.matrix.find((row) => row.from === from && row.to === to)?.count ?? 0;

  return <div className="insights insights-more">
    <header className="insights-head">
      <div>
        <h1>{t('insights.cohorts.title')}</h1>
        <p className="insights-lead">{data?.scope.department ? t('insights.scope.department', { name: data.scope.department.name }) : t('insights.cohorts.lead')}</p>
      </div>
    </header>
    {data?.scope.unassigned && <p className="notice" role="status">{t('insights.scope.unassigned')}</p>}
    <PeriodForm key={`${from}|${to}`} from={from} to={to} onApply={(range) => go(range)}>
      {data && data.departments_list.length > 1 && <label>{t('insights.col.department')}
        <select value={department} onChange={(event) => go({ department: event.target.value })}>
          <option value="">{t('insights.everyone')}</option>
          {data.departments_list.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </label>}
    </PeriodForm>
    {error && <Problem message={error} retry={() => void reload()}/>}
    {loading && !data && <Loading/>}
    {data && <>
      <div className="company-stats insights-kpis">
        <Kpi label={t('insights.cohorts.up')} value={f.num(data.total.up)} tone={data.total.up ? 'good' : undefined} note={t('insights.cohorts.ofCompared', { count: data.total.compared })}/>
        <Kpi label={t('insights.cohorts.levelsGained')} value={f.num(data.total.levels_gained)}/>
        <Kpi label={t('insights.cohorts.same')} value={f.num(data.total.same)}/>
        <Kpi label={t('insights.cohorts.down')} value={f.num(data.total.down)} tone={data.total.down ? 'warn' : undefined}/>
        <Kpi label={t('insights.cohorts.first')} value={f.num(data.total.first)} note={t('insights.cohorts.firstNote')}/>
        <Kpi label={t('insights.cohorts.notTested')} value={f.num(data.total.not_tested)}/>
      </div>
      <p className="hint">{t('insights.cohorts.avg', { start: f.num(data.total.avg_start.score), end: f.num(data.total.avg_end.score) })}</p>

      <Panel id="co-depts" title={t('insights.cohorts.byDepartment')}>
        {data.departments.length === 0 ? <p className="insights-empty">{t('insights.cohorts.noOne')}</p> : <div className="company-table-wrap">
          <table className="company-table">
            <thead><tr>
              <th scope="col">{t('insights.col.department')}</th><th scope="col">{t('insights.col.people')}</th><th scope="col">{t('insights.cohorts.up')}</th>
              <th scope="col">{t('insights.cohorts.same')}</th><th scope="col">{t('insights.cohorts.down')}</th><th scope="col">{t('insights.cohorts.first')}</th>
              <th scope="col">{t('insights.cohorts.levelsGained')}</th><th scope="col">{t('insights.cohorts.avgCol')}</th>
            </tr></thead>
            <tbody>{data.departments.map((row) => <tr key={row.id ?? 'none'}>
              <th scope="row">{row.name ?? t('insights.noDepartment')}</th><td>{f.num(row.people)}</td><td>{f.num(row.up)}</td><td>{f.num(row.same)}</td><td>{f.num(row.down)}</td><td>{f.num(row.first)}</td><td>{f.num(row.levels_gained)}</td>
              <td>{f.num(row.avg_start.score)} → {f.num(row.avg_end.score)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </Panel>

      {levels.length > 0 && <Panel id="co-matrix" title={t('insights.cohorts.matrix')}>
        <div className="company-table-wrap">
          <table className="company-table insights-matrix">
            <caption className="visually-hidden">{t('insights.cohorts.matrix')}</caption>
            <thead><tr><th scope="col">{t('insights.cohorts.fromTo')}</th>{levels.map((level) => <th key={level} scope="col">{LEVEL_SHORT[level]}</th>)}</tr></thead>
            <tbody>{levels.map((start) => <tr key={start}>
              <th scope="row">{LEVEL_SHORT[start]}</th>
              {levels.map((end) => {
                const count = cell(start, end);
                const direction = LEVEL_CODES.indexOf(end) - LEVEL_CODES.indexOf(start);
                return <td key={end} className={count ? (direction > 0 ? 'insights-move-up' : direction < 0 ? 'insights-move-down' : 'insights-move-same') : undefined}>{count || <span aria-hidden="true">·</span>}</td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>
        <p className="hint">{t('insights.cohorts.matrixNote')}</p>
      </Panel>}

      <Panel id="co-promo" title={t('insights.cohorts.promotion')} actions={data.promotion.length > 0 && <CsvButton path={`orgs/${org.id}/insights/cohorts?${params}&format=csv`} label={t('insights.cohorts.export')}/>}>
        {data.promotion.length === 0 ? <p className="insights-empty">{t('insights.cohorts.noPromotion')}</p> : <div className="company-table-wrap">
          <table className="company-table">
            <thead><tr>
              <th scope="col">{t('insights.col.person')}</th><th scope="col">{t('insights.cohorts.movement')}</th><th scope="col">{t('insights.cohorts.score')}</th>
              <th scope="col">{t('insights.cohorts.tested')}</th><th scope="col">{t('insights.cohorts.requirement')}</th>
            </tr></thead>
            <tbody>{data.promotion.map((row) => <tr key={row.member_id}>
              <th scope="row"><Link to={`/w/${org.id}/people/${row.member_id}`}>{row.name}</Link>{row.department && <small className="insights-cell-note">{row.department}</small>}</th>
              <td><LevelBadge level={row.from_level}/> → <LevelBadge level={row.to_level}/></td>
              <td>{f.num(row.from_score)} → {f.num(row.to_score)}</td>
              <td>{f.date(row.tested_at)}</td>
              <td>{row.meets_requirement === null ? '—' : row.meets_requirement ? <span className="company-badge good">{t('insights.gap.meets')}</span> : <span className="company-badge">{t('insights.cohorts.notYet')}</span>}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        <p className="hint">{t('insights.cohorts.promotionNote')}</p>
      </Panel>
      <p className="hint">{t('insights.cohorts.source')} {t('insights.estimateNote')}</p>
    </>}
  </div>;
}
