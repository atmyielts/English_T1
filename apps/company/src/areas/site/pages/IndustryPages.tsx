// /for and /for/:industry: use cases, job tracks, a sample of the test and of a role-play for one industry.
import React from 'react';
import { useAppT, type AppKey } from '../../../i18n/index.ts';
import { Link } from '../../../router.tsx';
import { INDUSTRY_SLUGS, type IndustrySlug } from '../catalog.ts';
import { INDUSTRIES_TEXT, useContent } from '../content.ts';
import { LeadSection } from '../DemoForm.tsx';
import { INDUSTRY_SAMPLES } from '../industryData.ts';
import { breadcrumbLd } from '../seo.ts';
import { Crumbs, SiteFrame } from '../SiteChrome.tsx';
import { PageLoading, PageMissing, SampleQuestions } from './common.tsx';

export function IndustriesIndex() {
  const t = useAppT();
  const text = useContent(INDUSTRIES_TEXT);
  if (!text) return <PageLoading path="/for"/>;
  return <SiteFrame seo={{ title: text.index.metaTitle, description: text.index.metaDescription, path: '/for' }}>
    <section className="site-page-hero">
      <p className="site-eyebrow">{text.index.eyebrow}</p>
      <h1>{text.index.title}</h1>
      <p className="site-lead">{text.index.lead}</p>
    </section>
    <section className="site-cards site-cards-3 site-section-tight">
      {INDUSTRY_SLUGS.map((slug) => <article key={slug} className="site-card">
        <h2 className="site-card-title"><Link to={`/for/${slug}`}>{t(`site.forIndustry.${slug}` as AppKey)}</Link></h2>
        <p>{text.items[slug].cardBody}</p>
      </article>)}
    </section>
    <LeadSection source="industries"/>
  </SiteFrame>;
}

export function IndustryPage({ slug }: { slug: string }) {
  const t = useAppT();
  const text = useContent(INDUSTRIES_TEXT);
  const path = `/for/${slug}`;
  if (!(INDUSTRY_SLUGS as readonly string[]).includes(slug)) return <PageMissing path={path}/>;
  if (!text) return <PageLoading path={path}/>;
  const key = slug as IndustrySlug;
  const item = text.items[key], sample = INDUSTRY_SAMPLES[key];
  const name = t(`site.forIndustry.${key}` as AppKey);
  return <SiteFrame seo={{
    title: item.metaTitle, description: item.metaDescription, path,
    jsonLd: [breadcrumbLd([{ name: text.index.crumb, path: '/for' }, { name, path }])],
  }}>
    <Crumbs items={[{ to: '/for', label: text.index.crumb }, { label: name }]}/>
    <section className="site-page-hero">
      <p className="site-eyebrow">{name}</p>
      <h1>{item.title}</h1>
      <p className="site-lead">{item.lead}</p>
      <div className="site-ctas">
        <a className="button-link site-cta" href="#demo">{t('site.cta.demo')}</a>
        <Link className="button-link quiet site-cta" to="/check">{t('site.nav.check')}</Link>
      </div>
    </section>

    <section className="site-section-tight" aria-labelledby="site-uses">
      <h2 id="site-uses" className="site-h2">{text.labels.useCases}</h2>
      <div className="site-cards site-cards-2">
        {item.useCases.map((use) => <article key={use.title} className="site-card"><h3>{use.title}</h3><p>{use.body}</p></article>)}
      </div>
    </section>

    <section className="site-section-tight" aria-labelledby="site-roles">
      <h2 id="site-roles" className="site-h2">{text.labels.tracks}</h2>
      <p className="site-section-lead">{item.tracksLead}</p>
      <ul className="site-link-chips">
        {sample.roles.map((role) => <li key={role}><Link to={`/guide/${role.replaceAll('_', '-')}`}>{t(`job.${role}` as AppKey)}</Link></li>)}
      </ul>
    </section>

    <section className="site-section-tight" aria-labelledby="site-sample">
      <h2 id="site-sample" className="site-h2">{text.labels.sampleTest}</h2>
      <p className="site-section-lead">{text.labels.sampleTestLead}</p>
      <SampleQuestions questions={sample.questions} labels={{ right: text.labels.right, wrong: text.labels.wrong }}/>
    </section>

    <section className="site-section-tight" aria-labelledby="site-roleplay">
      <h2 id="site-roleplay" className="site-h2">{text.labels.sampleRoleplay}</h2>
      <p className="site-section-lead">{item.roleplaySetting}</p>
      <div className="site-chat" lang="en">
        {sample.roleplay.map((line, index) => <div key={index} className={line.who === 'you' ? 'site-bubble site-bubble-you' : 'site-bubble'}>
          <span lang={undefined}>{line.who === 'you' ? text.labels.you : item.partner}</span>
          <p>{line.text}</p>
        </div>)}
      </div>
      <p className="hint site-chat-note">{text.labels.roleplayNote}</p>
    </section>

    <LeadSection source={`industry:${key}`} industry={sample.industry} title={item.ctaTitle} lead={text.labels.ctaLead}/>
  </SiteFrame>;
}
