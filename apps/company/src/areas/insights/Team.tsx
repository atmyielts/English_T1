// /w/:org/team — a manager's home: how their department stands, who needs a nudge,
// what is coming up and what is overdue. HR can open it for any department.
import React from 'react';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link, navigate, useLocation } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { useApi } from './api.ts';
import type { TeamHome } from './api2.ts';
import { Kpi, LEVEL_SHORT, LevelLegend, LevelStrip, Loading, Panel, Problem, useFormat, useMaybeT } from './ui.tsx';
import { LocalePicker, RiskCard, useNudgeLocale } from './parts.tsx';

const NUDGES_SHOWN = 10;

export function Team() {
  const t = useAppT(), f = useFormat(), maybe = useMaybeT();
  const { org, hr } = useWorkspace();
  const { query } = useLocation();
  const asked = query.get('department');
  const { data, error, loading, reload } = useApi<TeamHome>(`orgs/${org.id}/insights/team${asked ? `?department=${asked}` : ''}`);
  const [nudgeLocale, setNudgeLocale] = useNudgeLocale();
  if (error && !data) return <Problem message={error} retry={() => void reload()}/>;
  if (loading && !data) return <Loading/>;
  if (!data) return null;
  if (!data.department) return <div className="insights insights-more">
    <header className="insights-head"><div><h1>{t('insights.team.title')}</h1></div></header>
    <section className="insights-panel"><p className="insights-empty">{data.unassigned ? t('insights.scope.unassigned') : t('insights.team.noDepartments')}</p></section>
  </div>;
  const kpis = data.kpis!, nudge = data.nudge ?? [];

  return <div className="insights insights-more">
    <header className="insights-head">
      <div>
        <h1>{t('insights.team.title')}</h1>
        <p className="insights-lead">{t('insights.team.lead', { name: data.department.name })}</p>
      </div>
      {hr && data.departments.length > 1 && <label className="insights-inline no-print">{t('insights.col.department')}
        <select value={data.department.id} onChange={(event) => navigate(`/w/${org.id}/team?department=${event.target.value}`, { replace: true })}>
          {data.departments.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </label>}
    </header>

    <div className="company-stats insights-kpis">
      <Kpi label={t('insights.col.people')} value={f.num(kpis.people)} note={t('insights.team.tested', { count: kpis.tested })}/>
      <Kpi label={t('insights.gap.kpi.compliance')} value={kpis.percent === null ? '—' : `${kpis.percent}%`} tone={kpis.percent !== null && kpis.percent >= 80 ? 'good' : undefined} note={kpis.with_requirement ? t('common.of', { done: f.num(kpis.meets), total: f.num(kpis.with_requirement) }) : t('insights.team.noFramework')}/>
      <Kpi label={t('insights.team.active7')} value={f.num(kpis.active7)} note={t('insights.team.ofSharing', { count: kpis.sharing })}/>
      <Kpi label={t('insights.team.minutes7')} value={f.minutes(kpis.minutes7)}/>
    </div>
    {data.levels && <Panel id="team-levels" title={t('insights.overview.levels')}>
      <LevelStrip counts={data.levels} label={t('insights.overview.levels')}/>
      <LevelLegend/>
    </Panel>}

    <Panel id="team-nudge" title={t('insights.team.needsNudge', { count: nudge.length })} actions={<LocalePicker value={nudgeLocale} onChange={setNudgeLocale} label={t('insights.risk.nudgeLanguage')}/>}>
      {nudge.length === 0 ? <p className="insights-empty">{t('insights.risk.allClearText')}</p>
        : <div className="insights-risk-list">{nudge.slice(0, NUDGES_SHOWN).map((person) => <RiskCard key={person.member_id} compact person={person} canAssign={data.can_assign} nudgeLocale={nudgeLocale} onChanged={() => void reload()}/>)}</div>}
      {nudge.length > NUDGES_SHOWN && <p><Link to={`/w/${org.id}/at-risk${asked ? `?department=${asked}` : ''}`}>{t('insights.team.seeAll', { count: nudge.length })}</Link></p>}
      {(data.untracked ?? 0) > 0 && <p className="hint">{t('insights.team.untracked', { count: data.untracked ?? 0 })}</p>}
    </Panel>

    <div className="insights-two">
      <Panel id="team-upcoming" title={t('insights.team.upcoming')}>
        {(data.upcoming ?? []).length === 0 ? <p className="insights-empty">{t('insights.overview.noSession')}</p> : <ul className="insights-plain-list">
          {data.upcoming!.map((session) => <li key={session.id}>
            <strong>{session.title}</strong>
            <span>{f.weekday(session.starts_at)}, {f.time(session.starts_at)} · {f.minutes(session.duration_minutes)}{session.trainer ? ` · ${session.trainer}` : ''}</span>
            <small>{t('insights.team.invited', { count: session.invited })}</small>
          </li>)}
        </ul>}
        <p><Link to={`/w/${org.id}/sessions`}>{t('insights.overview.seeSessions')}</Link></p>
      </Panel>
      <Panel id="team-overdue" title={t('insights.team.overdue', { count: (data.overdue ?? []).length })}>
        {(data.overdue ?? []).length === 0 ? <p className="insights-empty">{t('insights.team.noOverdue')}</p> : <ul className="insights-plain-list">
          {data.overdue!.map((row) => <li key={row.id}>
            <strong>{row.track_code ? maybe(`job.${row.track_code}`, row.track_code) : t('insights.team.levelTarget', { level: row.target_level ? LEVEL_SHORT[row.target_level] : '—' })}</strong>
            <span>{t('insights.team.dueWas', { date: f.date(row.due_date) })}</span>
            <small>{row.person ?? t(`insights.team.scope.${row.scope}` as AppKey, { count: row.people })}</small>
          </li>)}
        </ul>}
        <p><Link to={`/w/${org.id}/skills-gap`}>{t('insights.team.seeGap')}</Link></p>
      </Panel>
    </div>
    <p className="hint">{t('insights.estimateNote')}</p>
  </div>;
}
