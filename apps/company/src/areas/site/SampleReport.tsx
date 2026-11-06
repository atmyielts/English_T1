// Mock report and candidate card, drawn in HTML/CSS from invented data. Both are
// labelled as examples: no real company, people or outcomes.
import React from 'react';
import { useAppT, type AppKey } from '../../i18n/index.ts';

const BANDS = ['a1', 'a2', 'b1', 'b2', 'c1'] as const;
type Band = (typeof BANDS)[number];
const DEPARTMENTS: { key: AppKey; shares: Record<Band, number> }[] = [
  { key: 'site.report.dept.front', shares: { a1: 5, a2: 20, b1: 45, b2: 25, c1: 5 } },
  { key: 'site.report.dept.sales', shares: { a1: 0, a2: 15, b1: 40, b2: 35, c1: 10 } },
  { key: 'site.report.dept.finance', shares: { a1: 10, a2: 35, b1: 35, b2: 20, c1: 0 } },
  { key: 'site.report.dept.call', shares: { a1: 0, a2: 10, b1: 35, b2: 45, c1: 10 } },
];
const SKILLS = ['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'] as const;
const CANDIDATES: { letter: string; levels: string[]; overall: string; decision: 'shortlist' | 'hold' | 'reject' }[] = [
  { letter: 'A', levels: ['B2', 'B1', 'B2', 'B1', 'B1', 'B2'], overall: 'B1+', decision: 'shortlist' },
  { letter: 'B', levels: ['B1', 'B1', 'B1', 'A2', 'B1', 'B1'], overall: 'B1', decision: 'hold' },
  { letter: 'C', levels: ['A2', 'A2', 'B1', 'A2', 'A2', 'A2'], overall: 'A2', decision: 'reject' },
];
const levelLabel = (band: Band) => band.toUpperCase();

export function SampleReport() {
  const t = useAppT();
  return <figure className="site-report" aria-labelledby="site-report-caption">
    <div className="site-report-paper">
      <header className="site-report-head">
        <div>
          <span className="site-report-logo" aria-hidden="true"/>
          <strong>{t('site.report.company')}</strong>
          <span>{t('site.report.period')}</span>
        </div>
        <span className="site-sample-badge">{t('site.report.badge')}</span>
      </header>
      <div className="site-report-kpis">
        <div><strong>128</strong><span>{t('site.report.kpi.tested')}</span></div>
        <div><strong>B1</strong><span>{t('site.report.kpi.average')}</span></div>
        <div><strong>46%</strong><span>{t('site.report.kpi.target')}</span></div>
        <div><strong>512</strong><span>{t('site.report.kpi.lessons')}</span></div>
      </div>
      <div className="site-report-block">
        <h4>{t('site.report.levelMap')} <span>{t('site.report.target')}</span></h4>
        <ul className="site-levelmap">
          {DEPARTMENTS.map((department) => <li key={department.key}>
            <span className="site-levelmap-name">{t(department.key)}</span>
            <span className="site-levelmap-bar" role="img" aria-label={`${t(department.key)}: ${BANDS.filter((band) => department.shares[band]).map((band) => `${levelLabel(band)} ${department.shares[band]}%`).join(', ')}`}>
              {BANDS.map((band) => department.shares[band] ? <span key={band} className={`site-band site-band-${band}`} style={{ width: `${department.shares[band]}%` }}>{department.shares[band] >= 15 ? levelLabel(band) : ''}</span> : null)}
              <span className="site-levelmap-target" style={{ left: `${department.shares.a1 + department.shares.a2}%` }} aria-hidden="true"/>
            </span>
          </li>)}
        </ul>
        <p className="site-legend" aria-hidden="true">{BANDS.map((band) => <span key={band}><i className={`site-band-${band}`}/>{levelLabel(band)}</span>)}</p>
      </div>
      <div className="site-report-block">
        <h4>{t('site.report.candidates')}</h4>
        <div className="site-report-table-wrap">
          <table className="site-report-table">
            <thead><tr><th scope="col"><span className="visually-hidden">{t('site.report.candidateCol')}</span></th>{SKILLS.map((skill) => <th key={skill} scope="col" title={t(`skill.${skill}`)}><abbr title={t(`skill.${skill}`)}>{t(`site.report.short.${skill}`)}</abbr></th>)}<th scope="col">{t('site.report.overall')}</th><th scope="col"><span className="visually-hidden">{t('site.report.decision')}</span></th></tr></thead>
            <tbody>{CANDIDATES.map((candidate) => <tr key={candidate.letter}>
              <th scope="row">{t('site.report.candidate', { letter: candidate.letter })}</th>
              {candidate.levels.map((level, index) => <td key={SKILLS[index]}>{level}</td>)}
              <td><strong>{candidate.overall}</strong></td>
              <td><span className={`site-decision site-decision-${candidate.decision}`}>{t(`site.report.decision.${candidate.decision}` as AppKey)}</span></td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
    <figcaption id="site-report-caption">{t('site.report.caption')}</figcaption>
  </figure>;
}

/** The small card in the hero: one candidate's result against a minimum level. */
export function HeroCard() {
  const t = useAppT();
  const bars: [typeof SKILLS[number], number, string][] = [['grammar', 66, 'B2'], ['vocabulary', 58, 'B1'], ['listening', 54, 'B1'], ['speaking', 61, 'B1']];
  return <div className="site-hero-card" role="img" aria-label={t('site.hero.cardAria')}>
    <div className="site-hero-card-head">
      <div>
        <span className="site-sample-badge">{t('site.example')}</span>
        <strong>{t('site.report.candidate', { letter: 'A' })}</strong>
        <span>{t('site.hero.cardRole')}</span>
      </div>
      <span className="site-hero-level">B1</span>
    </div>
    <ul className="site-hero-skills">
      {bars.map(([skill, score, level]) => <li key={skill}>
        <span>{t(`skill.${skill}`)}</span>
        <span className="site-hero-track"><span style={{ width: `${score}%` }}/></span>
        <b>{level}</b>
      </li>)}
    </ul>
    <p className="site-hero-meets"><span aria-hidden="true">✓</span>{t('site.hero.cardMeets')}</p>
  </div>;
}
