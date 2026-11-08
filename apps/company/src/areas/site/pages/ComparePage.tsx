// /compare: ways of working, not named competitors, including where the others are better.
import React from 'react';
import { PAGES, useContent } from '../content.ts';
import { LeadSection } from '../DemoForm.tsx';
import { SiteFrame } from '../SiteChrome.tsx';
import { PageLoading } from './common.tsx';

const COLUMNS = ['schood', 'school', 'app', 'exam', 'nothing'] as const;
const TONE = { yes: 'good', partly: 'warn', no: 'quiet' } as const;

export function ComparePage() {
  const text = useContent(PAGES);
  if (!text) return <PageLoading path="/compare"/>;
  const c = text.compare;
  return <SiteFrame seo={{ title: c.metaTitle, description: c.metaDescription, path: '/compare' }}>
    <section className="site-page-hero">
      <p className="site-eyebrow">{c.eyebrow}</p>
      <h1>{c.title}</h1>
      <p className="site-lead">{c.lead}</p>
    </section>
    <section className="site-section-tight">
      <div className="company-table-wrap site-compare-wrap" tabIndex={0} role="region" aria-label={c.tableCaption}>
        <table className="company-table site-compare">
          <caption className="visually-hidden">{c.tableCaption}</caption>
          <thead><tr><th scope="col">{c.criterion}</th>{COLUMNS.map((column) => <th key={column} scope="col" className={column === 'schood' ? 'site-compare-us' : ''}>{c.columns[column]}</th>)}</tr></thead>
          <tbody>{c.rows.map((row) => <tr key={row.label}>
            <th scope="row">{row.label}</th>
            {COLUMNS.map((column) => {
              const [mark, note] = row[column] as string[];
              return <td key={column} className={column === 'schood' ? 'site-compare-us' : ''}>
                <span className={`company-badge ${TONE[mark as keyof typeof TONE]}`}>{c.marks[mark as keyof typeof c.marks]}</span>
                <span className="site-compare-note">{note}</span>
              </td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
    </section>
    <section className="site-section-tight">
      <h2 className="site-h2">{c.whenTitle}</h2>
      <div className="site-cards site-cards-3">
        {c.when.map((item) => <article key={item.title} className="site-card"><h3>{item.title}</h3><p>{item.body}</p></article>)}
      </div>
    </section>
    <section className="site-section-tight">
      <h2 className="site-h2">{c.limitsTitle}</h2>
      <ul className="site-plain-list">{c.limits.map((item) => <li key={item}>{item}</li>)}</ul>
    </section>
    <LeadSection source="compare" title={c.ctaTitle} lead={c.ctaLead}/>
  </SiteFrame>;
}
