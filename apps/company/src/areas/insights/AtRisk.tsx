// /w/:org/at-risk — people who may need help, each with the reason in plain words, a
// suggested action, a nudge to copy and one-click assignment for HR. Nothing is sent
// from here. Learning signals appear only for people who share progress and have a seat.
import React, { useState } from 'react';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { useWorkspace } from '../../session.tsx';
import { useApi } from './api.ts';
import type { RiskList, RiskReasonCode } from './api2.ts';
import { Loading, Panel, Problem, useFormat } from './ui.tsx';
import { CsvButton, LocalePicker, RiskCard, useNudgeLocale } from './parts.tsx';

const CODES: RiskReasonCode[] = ['no_placement', 'inactive', 'behind_assignment', 'falling_score', 'behind_requirement'];

export function AtRisk() {
  const t = useAppT(), f = useFormat();
  const { org } = useWorkspace();
  const [days, setDays] = useState(14), [department, setDepartment] = useState(''), [snoozed, setSnoozed] = useState(false), [only, setOnly] = useState<RiskReasonCode | null>(null);
  const [nudgeLocale, setNudgeLocale] = useNudgeLocale();
  const params = new URLSearchParams({ inactive_days: String(days) });
  if (department) params.set('department', department);
  if (snoozed) params.set('snoozed', '1');
  const { data, error, loading, reload } = useApi<RiskList>(`orgs/${org.id}/insights/at-risk?${params}`);
  const shown = (data?.people ?? []).filter((person) => !only || person.reasons.some((reason) => reason.code === only));

  return <div className="insights insights-more">
    <header className="insights-head">
      <div>
        <h1>{t('insights.risk.title')}</h1>
        <p className="insights-lead">{data?.scope.department ? t('insights.scope.department', { name: data.scope.department.name }) : t('insights.risk.lead')}</p>
      </div>
    </header>
    {data?.scope.unassigned && <p className="notice" role="status">{t('insights.scope.unassigned')}</p>}

    <form className="insights-range no-print" onSubmit={(event) => event.preventDefault()}>
      <label>{t('insights.risk.quietFor')}
        <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
          {[7, 14, 30, 60].map((value) => <option key={value} value={value}>{t('insights.risk.daysOption', { count: value })}</option>)}
        </select>
      </label>
      {data && data.departments.length > 1 && <label>{t('insights.col.department')}
        <select value={department} onChange={(event) => setDepartment(event.target.value)}>
          <option value="">{t('insights.everyone')}</option>
          {data.departments.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </label>}
      <LocalePicker value={nudgeLocale} onChange={setNudgeLocale} label={t('insights.risk.nudgeLanguage')}/>
      <label className="check"><input type="checkbox" checked={snoozed} onChange={(event) => setSnoozed(event.target.checked)}/>{t('insights.risk.showSnoozed')}</label>
    </form>

    {error && !data && <Problem message={error} retry={() => void reload()}/>}
    {loading && !data && <Loading/>}
    {data && <>
      <div className="insights-chips" role="group" aria-label={t('insights.risk.filter')}>
        <button type="button" className={only === null ? '' : 'quiet'} aria-pressed={only === null} onClick={() => setOnly(null)}>{t('common.all')} · {f.num(data.people.length)}</button>
        {CODES.filter((code) => data.counts[code] > 0).map((code) => <button key={code} type="button" className={only === code ? '' : 'quiet'} aria-pressed={only === code} onClick={() => setOnly(only === code ? null : code)}>
          {t(`insights.risk.code.${code}` as AppKey)} · {f.num(data.counts[code])}
        </button>)}
      </div>
      {data.people.length > 0 && <div className="company-actions no-print"><CsvButton path={`orgs/${org.id}/insights/at-risk?${params}&format=csv`} label={t('common.download')}/></div>}
      {!data.learning_signals && <p className="notice" role="status">{t('insights.risk.pilotNote')}</p>}
      {data.learning_signals && data.untracked > 0 && <p className="hint">{t('insights.risk.untracked', { count: data.untracked, total: data.learners })}</p>}
      {shown.length === 0 ? <Panel title={t('insights.risk.allClear')}><p className="insights-empty">{t('insights.risk.allClearText')}</p></Panel>
        : <div className="insights-risk-list">{shown.map((person) => <RiskCard key={person.member_id} person={person} canAssign={data.can_assign} nudgeLocale={nudgeLocale} onChanged={() => void reload()}/>)}</div>}
      <p className="hint">{t('insights.risk.rules', { days })}</p>
    </>}
  </div>;
}
