// /w/:org/skills-gap — department by skill and job role by level, against the
// competency framework. Each cell opens the people behind it; everything here comes
// from company tests, and a manager sees only their department.
import React, { useState } from 'react';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { useApi } from './api.ts';
import { SKILL_CODES, type GapPerson, type HeatCell, type SkillCode, type SkillsGap as Gap } from './api2.ts';
import { Columns, DataTable, Kpi, LEVEL_CODES, LEVEL_SHORT, LevelBadge, Loading, Panel, Problem, useFormat } from './ui.tsx';

interface Drill { department?: string; job_role?: string; skill?: SkillCode | 'overall'; level?: string; status: 'all' | 'gap' | 'meets' | 'untested' | 'overdue'; title: string }

/** 0 (nobody reaches the bar) to 4 (everyone does); none when no one answers to a bar. */
const shade = (cell: HeatCell): string => {
  if (!cell.with_requirement) return 'none';
  const share = cell.met / cell.with_requirement;
  return share >= 0.9 ? '4' : share >= 0.7 ? '3' : share >= 0.5 ? '2' : share >= 0.25 ? '1' : '0';
};

export function SkillsGap() {
  const t = useAppT(), f = useFormat();
  const { org, hr } = useWorkspace();
  const { data, error, loading, reload } = useApi<Gap>(`orgs/${org.id}/insights/skills-gap`);
  const [drill, setDrill] = useState<Drill | null>(null);
  if (error && !data) return <Problem message={error} retry={() => void reload()}/>;
  if (loading && !data) return <Loading/>;
  if (!data) return null;
  const { compliance } = data;
  const open = (next: Drill) => {
    setDrill(next);
    requestAnimationFrame(() => document.getElementById('gap-people')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const departmentKey = (id: string | null) => id ?? 'none';

  return <div className="insights insights-more">
    <header className="insights-head">
      <div>
        <h1>{t('insights.gap.title')}</h1>
        <p className="insights-lead">{data.scope.department ? t('insights.scope.department', { name: data.scope.department.name }) : t('insights.gap.lead')}</p>
      </div>
      <div className="company-actions"><Link className="button-link quiet" to={`/w/${org.id}/framework`}>{hr ? t('insights.gap.setRequirements') : t('insights.gap.seeRequirements')}</Link></div>
    </header>
    {data.scope.unassigned && <p className="notice" role="status">{t('insights.scope.unassigned')}</p>}
    {!data.has_requirements && <section className="insights-panel">
      <p className="insights-empty">{hr ? t('insights.gap.noRequirementsHr') : t('insights.gap.noRequirements')}</p>
      {hr && <p><Link to={`/w/${org.id}/framework`}>{t('insights.gap.setRequirements')}</Link></p>}
    </section>}

    <div className="company-stats insights-kpis">
      <Kpi label={t('insights.gap.kpi.compliance')} value={compliance.percent === null ? '—' : `${compliance.percent}%`} tone={compliance.percent !== null && compliance.percent >= 80 ? 'good' : undefined} note={t('common.of', { done: f.num(compliance.meets), total: f.num(compliance.with_requirement) })}/>
      <Kpi label={t('insights.gap.kpi.overdue')} value={f.num(compliance.overdue)} tone={compliance.overdue ? 'warn' : undefined} note={t('insights.gap.kpi.overdueNote')}/>
      <Kpi label={t('insights.gap.kpi.dueSoon')} value={f.num(compliance.due_soon)} note={t('insights.gap.kpi.dueSoonNote')}/>
      <Kpi label={t('insights.gap.kpi.untested')} value={f.num(compliance.untested)} note={t('insights.gap.kpi.untestedNote')}/>
    </div>

    <Panel id="gap-trend" title={t('insights.gap.trend')}>
      <Columns label={t('insights.gap.trend')} valueLabel={t('insights.gap.kpi.compliance')} format={(value) => `${Math.round(value)}%`}
        points={data.trend.map((row) => ({ key: row.month, label: f.month(`${row.month}-01`), title: f.monthLong(`${row.month}-01`), value: row.percent ?? 0 }))}/>
      <p className="hint">{t('insights.gap.trendNote')}</p>
    </Panel>

    <Panel id="gap-heat" title={t('insights.gap.heat')}>
      {data.heat.length === 0 ? <p className="insights-empty">{t('insights.gap.noDepartments')}</p> : <>
        <div className="company-table-wrap">
          <table className="company-table insights-heat">
            <caption className="visually-hidden">{t('insights.gap.heat')}</caption>
            <thead><tr>
              <th scope="col">{t('insights.col.department')}</th>
              <th scope="col">{t('insights.gap.overall')}</th>
              {SKILL_CODES.map((skill) => <th key={skill} scope="col">{t(`skill.${skill}` as AppKey)}</th>)}
            </tr></thead>
            <tbody>{data.heat.map((row) => {
              const name = row.name ?? t('insights.noDepartment');
              return <tr key={departmentKey(row.id)}>
                <th scope="row">{name}<small className="insights-cell-note">{t('insights.gap.peopleCount', { count: row.people })}</small></th>
                <HeatTd cell={row.overall} label={`${name}, ${t('insights.gap.overall')}`} onOpen={() => open({ department: departmentKey(row.id), status: 'gap', skill: 'overall', title: `${name} · ${t('insights.gap.overall')}` })}/>
                {SKILL_CODES.map((skill) => <HeatTd key={skill} cell={row.skills[skill]} label={`${name}, ${t(`skill.${skill}` as AppKey)}`} onOpen={() => open({ department: departmentKey(row.id), skill, status: 'gap', title: `${name} · ${t(`skill.${skill}` as AppKey)}` })}/>)}
              </tr>;
            })}</tbody>
          </table>
        </div>
        <ul className="insights-legend" aria-label={t('insights.chart.legend')}>
          {['0', '1', '2', '3', '4'].map((value) => <li key={value}><span className={`insights-swatch insights-heat-${value}`} aria-hidden="true"/>{t(`insights.gap.shade.${value}` as AppKey)}</li>)}
          <li><span className="insights-swatch insights-heat-none" aria-hidden="true"/>{t('insights.gap.shade.none')}</li>
        </ul>
        <p className="hint">{t('insights.gap.heatNote')}</p>
      </>}
    </Panel>

    <Panel id="gap-roles" title={t('insights.gap.roles')}>
      {data.roles.length === 0 ? <p className="insights-empty">{t('insights.gap.noPeople')}</p> : <div className="company-table-wrap">
        <table className="company-table insights-levels">
          <caption className="visually-hidden">{t('insights.gap.roles')}</caption>
          <thead><tr>
            <th scope="col">{t('insights.gap.jobRole')}</th>
            {[...LEVEL_CODES, 'none' as const].map((level) => <th key={level} scope="col">{level === 'none' ? t('level.none') : LEVEL_SHORT[level]}</th>)}
            <th scope="col">{t('insights.gap.required')}</th><th scope="col">{t('insights.gap.meetsCol')}</th>
          </tr></thead>
          <tbody>{data.roles.map((row) => <tr key={row.job_role}>
            <th scope="row">{t(`job.${row.job_role}` as AppKey)}</th>
            {[...LEVEL_CODES, 'none' as const].map((level) => {
              const count = row.counts[level];
              const label = level === 'none' ? t('level.none') : LEVEL_SHORT[level];
              const isBar = row.requirement?.level === level;
              return <td key={level} className={isBar ? 'insights-level-bar' : undefined}>
                {count > 0 ? <button type="button" className="insights-link-button" aria-label={`${t(`job.${row.job_role}` as AppKey)}, ${label}: ${count}`} onClick={() => open({ job_role: row.job_role, level, status: 'all', title: `${t(`job.${row.job_role}` as AppKey)} · ${label}` })}>{count}</button> : <span aria-hidden="true">·</span>}
              </td>;
            })}
            <td>{row.requirement ? <LevelBadge level={row.requirement.level}/> : '—'}</td>
            <td>{row.percent === null ? '—' : `${row.percent}%`}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      <p className="hint">{t('insights.gap.rolesNote')}</p>
    </Panel>

    {drill && <People key={JSON.stringify(drill)} drill={drill} onStatus={(status) => setDrill({ ...drill, status })} onClose={() => setDrill(null)}/>}
    <p className="hint">{t('insights.gap.source')} {t('insights.estimateNote')}</p>
  </div>;
}

function HeatTd({ cell, label, onOpen }: { cell: HeatCell; label: string; onOpen: () => void }) {
  const t = useAppT(), f = useFormat();
  const summary = cell.with_requirement ? t('insights.gap.cellMet', { met: cell.met, total: cell.with_requirement }) : t('insights.gap.cellNoBar');
  return <td className={`insights-heat-cell insights-heat-${shade(cell)}`}>
    <button type="button" aria-label={`${label}: ${cell.avg === null ? t('insights.gap.notTested') : f.num(cell.avg)}. ${summary}`} onClick={onOpen}>
      <strong>{cell.level ? LEVEL_SHORT[cell.level] : '—'}</strong>
      <small>{cell.with_requirement ? `${cell.met}/${cell.with_requirement}` : cell.tested ? t('insights.gap.testedShort', { count: cell.tested }) : ''}</small>
    </button>
  </td>;
}

function People({ drill, onStatus, onClose }: { drill: Drill; onStatus: (status: Drill['status']) => void; onClose: () => void }) {
  const t = useAppT(), f = useFormat();
  const { org } = useWorkspace();
  const params = new URLSearchParams({ status: drill.status });
  if (drill.department) params.set('department', drill.department);
  if (drill.job_role) params.set('job_role', drill.job_role);
  if (drill.skill) params.set('skill', drill.skill);
  if (drill.level) params.set('level', drill.level);
  const { data, error, loading, reload } = useApi<{ total: number; people: GapPerson[] }>(`orgs/${org.id}/insights/skills-gap/people?${params}`);
  return <Panel id="gap-people" title={drill.title} actions={<button className="quiet" onClick={onClose}>{t('common.close')}</button>}>
    <div id="gap-people" className="insights-range no-print">
      <label>{t('insights.gap.show')}
        <select value={drill.status} onChange={(event) => onStatus(event.target.value as Drill['status'])}>
          {(['all', 'gap', 'meets', 'untested', 'overdue'] as const).map((status) => <option key={status} value={status}>{t(`insights.gap.status.${status}` as AppKey)}</option>)}
        </select>
      </label>
    </div>
    {error && <Problem message={error} retry={() => void reload()}/>}
    {loading && !data && <Loading/>}
    {data && (data.people.length === 0 ? <p className="insights-empty">{t('insights.gap.nobody')}</p> : <div className="company-table-wrap">
      <table className="company-table">
        <thead><tr>
          <th scope="col">{t('insights.col.person')}</th><th scope="col">{t('insights.col.level')}</th><th scope="col">{t('insights.gap.required')}</th>
          <th scope="col">{t('insights.gap.gapCol')}</th><th scope="col">{t('insights.framework.dueDate')}</th>
        </tr></thead>
        <tbody>{data.people.map((person) => <tr key={person.member_id}>
          <th scope="row"><Link to={`/w/${org.id}/people/${person.member_id}`}>{person.name}</Link><small className="insights-cell-note">{[person.department, t(`job.${person.job_role}` as AppKey)].filter(Boolean).join(' · ')}</small></th>
          <td><LevelBadge level={person.level} score={person.level_score}/></td>
          <td>{person.requirement ? <LevelBadge level={person.requirement.level}/> : '—'}</td>
          <td>{person.meets === null ? t('insights.gap.noBar') : person.meets ? <span className="company-badge good">{t('insights.gap.meets')}</span>
            : person.gaps.map((gap) => `${gap.skill === 'overall' ? t('insights.gap.overall') : t(`skill.${gap.skill}` as AppKey)}: ${gap.have ? LEVEL_SHORT[gap.have] : '—'} → ${LEVEL_SHORT[gap.want]}`).join('; ')}</td>
          <td>{person.requirement?.due_date ? <>{f.date(person.requirement.due_date)}{person.overdue && <> <span className="company-badge bad">{t('insights.gap.overdue')}</span></>}</> : '—'}</td>
        </tr>)}</tbody>
      </table>
    </div>)}
    {data && data.total > data.people.length && <p className="hint">{t('insights.gap.more', { count: data.people.length, total: data.total })}</p>}
    <DataTable caption={t('insights.gap.skillsTable')} head={[t('insights.col.person'), ...SKILL_CODES.map((skill) => t(`skill.${skill}` as AppKey))]}
      rows={(data?.people ?? []).map((person) => [person.name, ...SKILL_CODES.map((skill) => person.skills[skill] ? `${LEVEL_SHORT[person.skills[skill]!.level]}${person.skills[skill]!.score !== null ? ` · ${person.skills[skill]!.score}` : ''}` : '—')])}/>
  </Panel>;
}
