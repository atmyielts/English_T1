// /solutions and /solutions/:solution: hiring, placement, training, reporting, each with a drawn example screen.
import React from 'react';
import { useAppT, type AppKey } from '../../../i18n/index.ts';
import { Link } from '../../../router.tsx';
import { SOLUTION_SLUGS, type SolutionSlug } from '../catalog.ts';
import { PAGES, useContent } from '../content.ts';
import { LeadSection } from '../DemoForm.tsx';
import { breadcrumbLd } from '../seo.ts';
import { Crumbs, SiteFrame } from '../SiteChrome.tsx';
import { PageLoading, PageMissing } from './common.tsx';
import { HiringMock, PlacementMock, ReportingMock, TrainingMock } from './Mocks.tsx';

const MOCKS = { hiring: HiringMock, placement: PlacementMock, training: TrainingMock, reporting: ReportingMock };

export function SolutionsIndex() {
  const t = useAppT();
  const text = useContent(PAGES);
  if (!text) return <PageLoading path="/solutions"/>;
  return <SiteFrame seo={{ title: `${text.common.solutionsTitle} | ${t('app.title')}`, description: text.common.solutionsLead, path: '/solutions' }}>
    <section className="site-page-hero">
      <h1>{text.common.solutionsTitle}</h1>
      <p className="site-lead">{text.common.solutionsLead}</p>
    </section>
    <section className="site-cards site-cards-2 site-section-tight">
      {SOLUTION_SLUGS.map((slug) => <article key={slug} className="site-card">
        <h2 className="site-card-title"><Link to={`/solutions/${slug}`}>{text.solutions[slug].title}</Link></h2>
        <p>{text.solutions[slug].lead}</p>
      </article>)}
    </section>
    <LeadSection source="solutions"/>
  </SiteFrame>;
}

export function SolutionPage({ slug }: { slug: string }) {
  const t = useAppT();
  const text = useContent(PAGES);
  const path = `/solutions/${slug}`;
  if (!(SOLUTION_SLUGS as readonly string[]).includes(slug)) return <PageMissing path={path}/>;
  if (!text) return <PageLoading path={path}/>;
  const key = slug as SolutionSlug;
  const item = text.solutions[key];
  const Mock = MOCKS[key];
  const name = t(`site.solution.${key}` as AppKey);
  return <SiteFrame seo={{
    title: item.metaTitle, description: item.metaDescription, path,
    jsonLd: [breadcrumbLd([{ name: text.common.solutionsTitle, path: '/solutions' }, { name, path }])],
  }}>
    <Crumbs items={[{ to: '/solutions', label: text.common.solutionsTitle }, { label: name }]}/>
    <section className="site-page-hero">
      <p className="site-eyebrow">{item.eyebrow}</p>
      <h1>{item.title}</h1>
      <p className="site-lead">{item.lead}</p>
      <div className="site-ctas">
        <a className="button-link site-cta" href="#demo">{t('site.cta.demo')}</a>
        <Link className="button-link quiet site-cta" to={key === 'reporting' ? '/sample-report' : '/check'}>{key === 'reporting' ? text.common.seeSample : text.common.tryCheck}</Link>
      </div>
    </section>
    <section className="site-section-tight" aria-label={text.mock.window}><Mock mock={text.mock}/></section>
    <section className="site-section-tight" aria-labelledby="site-problems">
      <h2 id="site-problems" className="site-h2">{item.problemsTitle}</h2>
      <ul className="site-plain-list">{item.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
    </section>
    <section className="site-section-tight" aria-labelledby="site-how">
      <h2 id="site-how" className="site-h2">{item.stepsTitle}</h2>
      <ol className="site-steps">
        {item.steps.map((step, index) => <li key={step.title}>
          <span className="site-step-number" aria-hidden="true">{index + 1}</span>
          <h3>{step.title}</h3>
          <p>{step.body}</p>
        </li>)}
      </ol>
    </section>
    <section className="site-section-tight" aria-labelledby="site-features">
      <h2 id="site-features" className="site-h2">{item.featuresTitle}</h2>
      <ul className="site-ticks site-ticks-2">{item.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
    </section>
    <LeadSection source={`solution:${key}`} title={item.ctaTitle} lead={item.ctaLead}/>
  </SiteFrame>;
}
