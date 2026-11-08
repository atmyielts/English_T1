// /thanks: after a demo request. It carries no personal data, only which form was sent.
import React, { useEffect, useState } from 'react';
import { api } from '../../../api.ts';
import { useAppT } from '../../../i18n/index.ts';
import { Link, useLocation } from '../../../router.tsx';
import type { LeadForm } from '../../people/types.ts';
import { PAGES, useContent } from '../content.ts';
import { SiteFrame } from '../SiteChrome.tsx';
import { PageLoading } from './common.tsx';

export function ThanksPage() {
  const t = useAppT();
  const text = useContent(PAGES);
  const { query } = useLocation();
  const [form, setForm] = useState<LeadForm | null>(null);
  useEffect(() => { api<LeadForm>('public/leads/form', { auth: false }).then(setForm).catch(() => setForm(null)); }, []);
  if (!text) return <PageLoading path="/thanks"/>;
  const c = text.thanks;
  return <SiteFrame seo={{ title: c.metaTitle, description: c.metaDescription, path: '/thanks', noindex: true }}>
    <section className="site-page-hero">
      <h1>{c.title}</h1>
      <p className="site-lead" role="status">{c.lead}</p>
      {query.get('from') === 'check' && <p className="site-note">{c.checkNote}</p>}
    </section>
    <section className="site-section-tight">
      <h2 className="site-h2">{c.stepsTitle}</h2>
      <ol className="site-steps">
        {c.steps.map((step, index) => <li key={step.title}>
          <span className="site-step-number" aria-hidden="true">{index + 1}</span>
          <h3>{step.title}</h3>
          <p>{step.body}</p>
        </li>)}
      </ol>
    </section>
    <section className="site-section-tight">
      <h2 className="site-h2">{c.meanwhileTitle}</h2>
      <div className="site-cards site-cards-4">
        {c.meanwhile.map((item) => <article key={item.to} className="site-card">
          <h3><Link to={item.to}>{item.title}</Link></h3>
          <p>{item.body}</p>
        </article>)}
      </div>
    </section>
    {form?.self_serve !== false && <section className="site-pilot site-section-tight">
      <div>
        <h2 className="site-h2">{c.pilotTitle}</h2>
        <p className="site-section-lead">{c.pilotLead}</p>
      </div>
      <div className="site-ctas">
        <Link className="button-link site-cta" to="/start">{t('site.cta.pilot')}</Link>
        <Link className="button-link quiet site-cta" to="/">{c.home}</Link>
      </div>
    </section>}
  </SiteFrame>;
}
