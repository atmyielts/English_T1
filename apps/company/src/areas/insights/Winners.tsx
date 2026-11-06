// /w/:org/challenges/winners — every finished challenge with its winners. Results
// are frozen when a challenge ends; colleagues see short names, as in standings.
import React from 'react';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { useApi } from './api.ts';
import type { Winners as WinnersData } from './api2.ts';
import { Loading, Problem, useFormat } from './ui.tsx';

const MEDAL = ['1', '2', '3'];

export function Winners() {
  const t = useAppT(), f = useFormat();
  const { org } = useWorkspace();
  const { data, error, loading, reload } = useApi<WinnersData>(`orgs/${org.id}/challenges/winners`);
  if (error && !data) return <Problem message={error} retry={() => void reload()}/>;
  if (loading && !data) return <Loading/>;
  if (!data) return null;
  const unit = (metric: WinnersData['winners'][number]['metric'], value: number) => metric === 'minutes' ? f.minutes(value) : t(`insights.metricValue.${metric}` as AppKey, { count: value });

  return <div className="insights insights-more">
    <header className="insights-head">
      <div>
        <h1>{t('insights.winners.title')}</h1>
        <p className="insights-lead">{t('insights.winners.lead')}</p>
      </div>
      <div className="company-actions"><Link className="button-link quiet" to={`/w/${org.id}/challenges`}>{t('insights.winners.back')}</Link></div>
    </header>
    {data.winners.length === 0 ? <section className="insights-panel"><p className="insights-empty">{t('insights.winners.empty')}</p></section>
      : <div className="insights-winners">{data.winners.map((row) => <article key={row.id} className="insights-winner" aria-labelledby={`w-${row.id}`}>
        <h2 id={`w-${row.id}`}><Link to={`/w/${org.id}/challenges?c=${row.id}`}>{row.title}</Link></h2>
        <p className="insights-meta">
          <span>{f.date(row.starts_on)} – {f.date(row.ends_on)}</span>
          <span>{t('insights.challenges.metricIs', { metric: t(`insights.metric.${row.metric}` as AppKey) })}</span>
        </p>
        {row.prize && <p className="insights-winner-prize">{t('insights.winners.prize', { prize: row.prize })}</p>}
        {row.team && <p className="insights-winner-team"><strong>{t('insights.winners.team', { name: row.team.name })}</strong> <small>{t('insights.winners.perPerson', { value: unit(row.metric, row.team.average) })}</small></p>}
        {!row.team && row.department && <p className="insights-winner-team"><strong>{t('insights.winners.department', { name: row.department.name })}</strong> <small>{t('insights.winners.perPerson', { value: unit(row.metric, row.department.average) })}</small></p>}
        {row.top.length === 0 ? <p className="insights-empty">{t('insights.winners.noOne')}</p> : <ol className="insights-board">
          {row.top.map((person, index) => <li key={index} className={person.me ? 'insights-bars-me' : undefined}>
            <span className="insights-board-rank">{MEDAL[person.rank - 1] ?? person.rank}</span>
            <span className="insights-board-name">{person.name ?? t('insights.challenges.colleague')}{person.me ? ` (${t('insights.challenges.you')})` : ''}{person.department ? <small>{person.department}</small> : null}</span>
            <span className="insights-board-value">{unit(row.metric, person.value)}</span>
          </li>)}
        </ol>}
        <p className="hint">{t('insights.winners.summary', { active: row.active, participants: row.participants })}</p>
      </article>)}</div>}
    <p className="hint">{t('insights.challenges.consentNote')}</p>
  </div>;
}
