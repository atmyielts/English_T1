// /sample-report: a full printable example of the report, from invented data, marked as a sample on screen and on paper.
import React from 'react';
import { useAppT } from '../../../i18n/index.ts';
import { Link } from '../../../router.tsx';
import { PAGES, useContent } from '../content.ts';
import { SampleReport } from '../SampleReport.tsx';
import { SiteFrame } from '../SiteChrome.tsx';
import { PageLoading } from './common.tsx';

export function SampleReportPage() {
  const t = useAppT();
  const text = useContent(PAGES);
  if (!text) return <PageLoading path="/sample-report"/>;
  const r = text.sampleReport;
  const top = Math.max(...r.funnel.map((row) => row.value));
  const moved = r.movement.reduce((sum, row) => sum + row.value, 0);
  return <SiteFrame seo={{ title: r.metaTitle, description: r.metaDescription, path: '/sample-report' }}>
    <section className="site-page-hero site-no-print">
      <p className="site-eyebrow">{r.eyebrow}</p>
      <h1>{r.title}</h1>
      <p className="site-lead">{r.lead}</p>
      <p><button type="button" onClick={() => print()}>{r.print}</button></p>
    </section>
    <article className="site-paper">
      <p className="site-paper-banner" role="note">{r.banner}</p>
      <header className="site-paper-head">
        <div><h2>{r.docTitle}</h2><p>{r.company} · {r.period}</p></div>
        <span className="site-sample-badge">{t('site.report.badge')}</span>
      </header>
      <section>
        <h3>{r.summaryTitle}</h3>
        <div className="site-paper-kpis">{r.kpis.map((kpi) => <div key={kpi.label}><strong>{kpi.value}</strong><span>{kpi.label}</span></div>)}</div>
      </section>
      <section>
        <h3>{r.levelMapTitle}</h3>
        <div className="company-table-wrap">
          <table className="company-table">
            <thead><tr><th scope="col">{r.departmentCol}</th><th scope="col">{r.peopleCol}</th><th scope="col">{r.targetCol}</th><th scope="col">{r.atTargetCol}</th><th scope="col">{r.minutesCol}</th></tr></thead>
            <tbody>{r.departments.map((row) => <tr key={row.name}><th scope="row">{row.name}</th><td>{row.people}</td><td>{row.target}</td><td>{row.atTarget}</td><td>{row.minutes}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <div className="site-paper-two">
        <section>
          <h3>{r.movementTitle}</h3>
          <p className="hint">{r.movementLead}</p>
          <ul className="site-paper-bars">{r.movement.map((row) => <li key={row.label}><span>{row.label}</span><span className="site-hero-track"><span style={{ width: `${row.value / moved * 100}%` }}/></span><b>{row.value}</b></li>)}</ul>
        </section>
        <section>
          <h3>{r.hiringTitle}</h3>
          <ul className="site-paper-bars">{r.funnel.map((row) => <li key={row.label}><span>{row.label}</span><span className="site-hero-track"><span style={{ width: `${row.value / top * 100}%` }}/></span><b>{row.value}</b></li>)}</ul>
        </section>
      </div>
      <section>
        <h3>{r.improversTitle}</h3>
        <div className="company-table-wrap">
          <table className="company-table">
            <thead><tr><th scope="col">{r.personCol}</th><th scope="col">{r.departmentCol}</th><th scope="col">{r.fromCol}</th><th scope="col">{r.toCol}</th><th scope="col">{r.minutesCol}</th></tr></thead>
            <tbody>{r.improvers.map((row) => <tr key={row.name}><th scope="row">{row.name}</th><td>{row.department}</td><td>{row.from}</td><td>{row.to}</td><td>{row.minutes}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <section>
        <h3>{r.trainingTitle}</h3>
        <div className="company-table-wrap">
          <table className="company-table">
            <thead><tr><th scope="col">{r.assignmentCol}</th><th scope="col">{r.dueCol}</th><th scope="col">{r.completionCol}</th></tr></thead>
            <tbody>{r.assignments.map((row) => <tr key={row.name}><th scope="row">{row.name}</th><td>{row.due}</td><td>{row.completion}%</td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <section>
        <h3>{r.narrativeTitle}</h3>
        <p className="hint">{r.narrativeLabel}</p>
        <blockquote className="site-paper-quote">{r.narrative}</blockquote>
      </section>
      <section>
        <h3>{r.noteTitle}</h3>
        <p>{r.note}</p>
      </section>
    </article>
    <section className="site-section-tight site-no-print">
      <h2 className="site-h2">{t('site.report.title')}</h2>
      <SampleReport/>
    </section>
    <section className="site-pilot site-section-tight site-no-print">
      <div>
        <h2 className="site-h2">{r.ctaTitle}</h2>
        <p className="site-section-lead">{r.ctaLead}</p>
      </div>
      <div className="site-ctas">
        <Link className="button-link site-cta" to="/start">{t('site.cta.pilot')}</Link>
        <Link className="button-link quiet site-cta" to="/#demo">{t('site.cta.demo')}</Link>
      </div>
    </section>
  </SiteFrame>;
}
