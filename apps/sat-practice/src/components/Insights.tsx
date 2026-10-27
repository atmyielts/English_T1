import { TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DomainStat, OfficialMastery, ScoreImpact } from '../lib/api';
import { useAppT } from '../i18n';
import { domainLabel, percent, sectionLabel, skillLabel } from '../lib/labels';

export function ScoreImpactCallout(props: { impact: ScoreImpact }) {
  const t = useAppT();
  const impact = props.impact;
  return <section className="score-impact" aria-labelledby="score-impact-title">
    <TrendingUp size={22} aria-hidden="true" />
    <div>
      <p className="eyebrow">{t('impact.eyebrow')}</p>
      {impact.status !== 'ok' || impact.conservative == null || impact.optimistic == null
        ? <><h2 id="score-impact-title">{t('impact.noData.title')}</h2><span>{t('impact.noData.body', { min: impact.min_answers ?? 8, answered: impact.answered_total ?? 0 })}</span></>
        : impact.optimistic === 0
          ? <><h2 id="score-impact-title">{t('impact.none')}</h2><span>{t('impact.note')}</span></>
          : <>
            <h2 id="score-impact-title">{t('impact.title', { low: impact.conservative, high: impact.optimistic })}</h2>
            <ul className="impact-lines">{(impact.domains ?? []).map(d => <li key={d.official_domain}>{t('impact.line', { domain: domainLabel(t, d.official_domain), accuracy: percent(d.accuracy), answered: d.answered, low: d.points_low, high: d.points_high })}</li>)}</ul>
            <span>{t('impact.note')}</span>
          </>}
    </div>
  </section>;
}

export function MasteryMap(props: { mastery: OfficialMastery[] }) {
  const t = useAppT();
  return <section className="panel">
    <div className="section-head"><div><p className="eyebrow">{t('mastery.eyebrow')}</p><h2>{t('mastery.title')}</h2></div></div>
    <div className="mastery-bars">
      {props.mastery.map(row => {
        const pct = row.mastery_level == null ? 0 : Math.round(row.mastery_level * 100);
        return <div className="mastery-row" key={row.official_domain}>
          <div><span>{domainLabel(t, row.official_domain)}</span><strong>{row.mastery_level == null ? t('mastery.none') : `${pct}%`}</strong></div>
          <div className="progress-track" role="progressbar" aria-label={domainLabel(t, row.official_domain)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          {row.attempts ? <small>{t('mastery.attempts', { count: row.attempts })}</small> : null}
        </div>;
      })}
    </div>
  </section>;
}

export function DomainInsights(props: { domains: DomainStat[] }) {
  const t = useAppT();
  const answered = props.domains.reduce((s, d) => s + d.answered, 0);
  return <section className="panel insights-panel">
    <div className="section-head"><div><p className="eyebrow">{t('insights.eyebrow')}</p><h2>{t('insights.title')}</h2></div></div>
    {answered === 0 ? <div className="empty-state">{t('insights.empty')}</div> : null}
    <div className="insight-grid">
      {(['reading_writing', 'math'] as const).map(section => <div key={section} className="insight-section">
        <h3>{sectionLabel(t, section)}</h3>
        {props.domains.filter(d => d.section_type === section).map(d => <details key={d.official_domain} className="insight-domain">
          <summary>
            <span className="insight-name">{domainLabel(t, d.official_domain)}</span>
            <strong>{d.answered ? percent(d.accuracy) : '—'}</strong>
            <small>{d.answered ? t('insights.answered', { correct: d.correct, answered: d.answered }) : t('insights.notPractised')} · {t('insights.bank', { count: d.bank })}</small>
          </summary>
          <ul className="skill-list" aria-label={t('insights.skills')}>
            {d.skills.filter(s => s.bank > 0).map(s => <li key={s.skill}>
              <span>{skillLabel(t, s.skill)}</span>
              <span>{s.answered ? `${percent(s.accuracy)} · ${s.correct}/${s.answered}` : t('insights.notPractised')}</span>
              <Link className="btn ghost compact" to={`/bank?official_domain=${d.official_domain}&skill=${s.skill}`}>{t('insights.practise')}</Link>
            </li>)}
          </ul>
        </details>)}
      </div>)}
    </div>
  </section>;
}
