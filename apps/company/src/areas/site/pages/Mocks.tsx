// The "real screens" on the solution pages, drawn in HTML and CSS from invented data and
// labelled as examples. They follow the layouts of the actual pages, without their logic.
import React from 'react';
import { useAppT, type AppKey } from '../../../i18n/index.ts';
import type { pagesEn } from '../../../i18n/site.pages.en.ts';
import { MockWindow } from './common.tsx';

type Mock = typeof pagesEn.mock;
const SKILLS = ['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'] as const;
const BANDS = ['a1', 'a2', 'b1', 'b2', 'c1'] as const;

export function HiringMock({ mock }: { mock: Mock }) {
  const t = useAppT();
  const m = mock.hiring;
  const rows = [
    { name: 'A', levels: ['B2', 'B1', 'B2', 'B1', 'B1', 'B2'], overall: 'B1', flags: m.none, decision: m.shortlist, tone: 'good' },
    { name: 'B', levels: ['B1', 'B1', 'B1', 'A2', 'B1', 'B1'], overall: 'B1', flags: m.flagCount, decision: m.hold, tone: 'warn' },
    { name: 'C', levels: ['A2', 'A2', 'B1', 'A2', 'A2', 'A2'], overall: 'A2', flags: m.none, decision: m.reject, tone: 'quiet' },
    { name: 'D', levels: ['B1', 'B2', 'B1', 'B1', '—', '—'], overall: '—', flags: m.none, decision: m.waiting, tone: '' },
  ];
  return <MockWindow label={mock.window} title={m.crumb}>
    <div className="site-mock-row">
      <code className="site-mock-link">{m.link}</code>
      <span className="company-badge">{m.minimum}</span>
    </div>
    <div className="company-table-wrap">
      <table className="company-table site-mock-table">
        <caption className="visually-hidden">{m.crumb}</caption>
        <thead><tr><th scope="col">{m.candidate}</th>{SKILLS.map((skill) => <th key={skill} scope="col">{t(`site.report.short.${skill}` as AppKey)}</th>)}<th scope="col">{m.overall}</th><th scope="col">{m.flags}</th><th scope="col">{m.decision}</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.name}>
          <th scope="row">{t('site.report.candidate', { letter: row.name })}</th>
          {row.levels.map((level, index) => <td key={SKILLS[index]}>{level}</td>)}
          <td><strong>{row.overall}</strong></td>
          <td>{row.flags}</td>
          <td><span className={`company-badge ${row.tone}`}>{row.decision}</span></td>
        </tr>)}</tbody>
      </table>
    </div>
  </MockWindow>;
}

export function PlacementMock({ mock }: { mock: Mock }) {
  const m = mock.placement, d = mock.departments;
  const rows: { name: string; shares: Record<(typeof BANDS)[number], number>; target: number }[] = [
    { name: d.front, shares: { a1: 5, a2: 20, b1: 45, b2: 25, c1: 5 }, target: 25 },
    { name: d.sales, shares: { a1: 0, a2: 15, b1: 40, b2: 35, c1: 10 }, target: 55 },
    { name: d.finance, shares: { a1: 10, a2: 35, b1: 35, b2: 20, c1: 0 }, target: 45 },
    { name: d.call, shares: { a1: 0, a2: 10, b1: 35, b2: 45, c1: 10 }, target: 45 },
  ];
  return <MockWindow label={mock.window} title={m.title}>
    <div className="site-mock-row"><strong>{m.done}</strong><span className="site-mock-progress" aria-hidden="true"><span style={{ width: '77%' }}/></span></div>
    <ul className="site-levelmap">
      {rows.map((row) => <li key={row.name}>
        <span className="site-levelmap-name">{row.name}</span>
        <span className="site-levelmap-bar" role="img" aria-label={`${row.name}: ${BANDS.filter((band) => row.shares[band]).map((band) => `${band.toUpperCase()} ${row.shares[band]}%`).join(', ')}`}>
          {BANDS.map((band) => row.shares[band] ? <span key={band} className={`site-band site-band-${band}`} style={{ width: `${row.shares[band]}%` }}>{row.shares[band] >= 15 ? band.toUpperCase() : ''}</span> : null)}
          <span className="site-levelmap-target" style={{ left: `${row.target}%` }} aria-hidden="true"/>
        </span>
      </li>)}
    </ul>
    <p className="site-legend" aria-hidden="true">{BANDS.map((band) => <span key={band}><i className={`site-band-${band}`}/>{band.toUpperCase()}</span>)}<span><i className="site-legend-target"/>{m.target}</span></p>
    <div className="company-table-wrap">
      <table className="company-table site-mock-table">
        <caption className="visually-hidden">{m.gap}</caption>
        <thead><tr><th scope="col">{m.people}</th><th scope="col">{m.level}</th><th scope="col">{m.target}</th><th scope="col">{m.gap}</th></tr></thead>
        <tbody>
          <tr><th scope="row">Employee A</th><td>A2</td><td>B1</td><td><span className="company-badge warn">{m.gapValue}</span></td></tr>
          <tr><th scope="row">Employee B</th><td>B2</td><td>B1</td><td><span className="company-badge good">{m.gapNone}</span></td></tr>
          <tr><th scope="row">Employee C</th><td>B1</td><td>—</td><td><span className="company-badge">{m.noConsent}</span></td></tr>
        </tbody>
      </table>
    </div>
    <p className="site-mock-note">{m.noPlacement}</p>
  </MockWindow>;
}

export function TrainingMock({ mock }: { mock: Mock }) {
  const m = mock.training;
  return <MockWindow label={mock.window} title={m.lesson}>
    <div className="site-mock-split">
      <div>
        <h3>{m.phrases}</h3>
        <ul className="site-mock-phrases">
          <li><span lang="en">{m.phrase1}</span><small>{m.phrase1t}</small></li>
          <li><span lang="en">{m.phrase2}</span><small>{m.phrase2t}</small></li>
        </ul>
        <h3>{m.plan}</h3>
        <p className="site-mock-note">{m.assignment}</p>
        <span className="site-mock-progress" aria-hidden="true"><span style={{ width: '61%' }}/></span>
        <p className="site-mock-note">{m.completion}</p>
      </div>
      <div>
        <h3>{m.roleplay}</h3>
        <div className="site-chat" lang="en">
          <div className="site-bubble"><p>{m.guest}</p></div>
          <div className="site-bubble site-bubble-you"><p>{m.you}</p></div>
        </div>
        <p className="site-mock-feedback">{m.feedback}</p>
      </div>
    </div>
  </MockWindow>;
}

export function ReportingMock({ mock }: { mock: Mock }) {
  const m = mock.reporting;
  const points = [32, 36, 41, 44, 50, 56];
  const line = points.map((value, index) => `${10 + index * 56},${90 - value}`).join(' ');
  return <MockWindow label={mock.window} title={m.title}>
    <div className="site-report-kpis">
      <div><strong>128</strong><span>{m.people}</span></div>
      <div><strong>94</strong><span>{m.active}</span></div>
      <div><strong>B1</strong><span>{m.average}</span></div>
      <div><strong>46%</strong><span>{m.atTarget}</span></div>
    </div>
    <div className="site-mock-split">
      <div>
        <h3>{m.trend}</h3>
        <svg viewBox="0 0 300 96" className="site-mock-chart" role="img" aria-label={m.trend}>
          <line x1="0" y1="90" x2="300" y2="90" stroke="#e5e7eb"/>
          <polyline points={line} fill="none" stroke="#4338ca" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          {points.map((value, index) => <circle key={index} cx={10 + index * 56} cy={90 - value} r="3.5" fill="#4338ca"/>)}
        </svg>
      </div>
      <div>
        <h3>{m.todo}</h3>
        <ul className="site-mock-todo"><li>{m.todo1}</li><li>{m.todo2}</li><li>{m.todo3}</li></ul>
      </div>
    </div>
  </MockWindow>;
}
