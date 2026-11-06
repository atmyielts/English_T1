// /guide and /guide/:role: which CEFR level a job needs. Marked as Schood guidance throughout: it is our advice, not a standard.
import React from 'react';
import { useAppT, type AppKey } from '../../../i18n/index.ts';
import { Link } from '../../../router.tsx';
import { GUIDE_ROLES, roleFromSlug, roleSlug } from '../catalog.ts';
import { GUIDE, useContent } from '../content.ts';
import { LeadSection } from '../DemoForm.tsx';
import { breadcrumbLd, faqLd } from '../seo.ts';
import { Crumbs, SiteFrame } from '../SiteChrome.tsx';
import { PageLoading, PageMissing } from './common.tsx';

export function GuidePage() {
  const t = useAppT();
  const text = useContent(GUIDE);
  if (!text) return <PageLoading path="/guide"/>;
  return <SiteFrame seo={{ title: text.metaTitle, description: text.metaDescription, path: '/guide', jsonLd: [faqLd(text.faq)] }}>
    <section className="site-page-hero">
      <p className="site-eyebrow">{text.eyebrow}</p>
      <h1>{text.title}</h1>
      <p className="site-lead">{text.lead}</p>
      <p className="site-note">{text.guidanceNote}</p>
      <div className="site-ctas"><Link className="button-link site-cta" to="/check">{t('site.nav.check')}</Link></div>
    </section>
    <section className="site-section-tight">
      <h2 className="site-h2">{text.cefrTitle}</h2>
      <p className="site-section-lead">{text.cefrLead}</p>
      <div className="company-table-wrap">
        <table className="company-table site-guide-table">
          <caption className="visually-hidden">{text.cefrTitle}</caption>
          <thead><tr><th scope="col">{text.levelCol}</th><th scope="col">{text.canDoCol}</th><th scope="col">{text.atWorkCol}</th></tr></thead>
          <tbody>{text.levels.map((row) => <tr key={row.level}><th scope="row"><span className="company-badge">{row.level}</span></th><td>{row.canDo}</td><td>{row.atWork}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
    <section className="site-section-tight">
      <h2 className="site-h2">{text.howTitle}</h2>
      <ol className="site-steps site-steps-4">
        {text.how.map((step, index) => <li key={step.title}>
          <span className="site-step-number" aria-hidden="true">{index + 1}</span>
          <h3>{step.title}</h3>
          <p>{step.body}</p>
        </li>)}
      </ol>
    </section>
    <section className="site-section-tight">
      <h2 className="site-h2">{text.rolesTitle}</h2>
      <p className="site-section-lead">{text.rolesLead}</p>
      <div className="company-table-wrap">
        <table className="company-table site-guide-table">
          <caption className="visually-hidden">{text.rolesTitle}</caption>
          <thead><tr><th scope="col">{text.roleCol}</th><th scope="col">{text.exampleCol}</th><th scope="col">{text.levelCol}</th></tr></thead>
          <tbody>{GUIDE_ROLES.flatMap((role) => text.roles[role].positions.slice(0, 2).map((position, index) => <tr key={`${role}-${position.name}`}>
            <th scope="row">{index === 0 ? <Link to={`/guide/${roleSlug(role)}`}>{t(`job.${role}` as AppKey)}</Link> : <span className="visually-hidden">{t(`job.${role}` as AppKey)}</span>}</th>
            <td>{position.name}</td>
            <td><span className="company-badge">{position.level}</span></td>
          </tr>))}</tbody>
        </table>
      </div>
    </section>
    <section className="site-section-tight">
      <h2 className="site-h2">{text.faqTitle}</h2>
      <div className="site-faq">
        {text.faq.map((item) => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </div>
    </section>
    <LeadSection source="guide"/>
  </SiteFrame>;
}

export function GuideRolePage({ slug }: { slug: string }) {
  const t = useAppT();
  const text = useContent(GUIDE);
  const path = `/guide/${slug}`;
  const role = roleFromSlug(slug);
  if (!role) return <PageMissing path={path}/>;
  if (!text) return <PageLoading path={path}/>;
  const item = text.roles[role], name = t(`job.${role}` as AppKey);
  return <SiteFrame seo={{
    title: item.metaTitle, description: item.metaDescription, path,
    jsonLd: [breadcrumbLd([{ name: text.eyebrow, path: '/guide' }, { name, path }])],
  }}>
    <Crumbs items={[{ to: '/guide', label: text.eyebrow }, { label: name }]}/>
    <section className="site-page-hero">
      <p className="site-eyebrow">{name}</p>
      <h1>{item.title}</h1>
      <p className="site-lead">{item.lead}</p>
      <p className="site-note">{text.guidanceNote}</p>
    </section>
    <section className="site-section-tight">
      <h2 className="site-h2">{text.role.positionsTitle}</h2>
      <div className="company-table-wrap">
        <table className="company-table site-guide-table">
          <caption className="visually-hidden">{text.role.positionsTitle}</caption>
          <thead><tr><th scope="col">{text.exampleCol}</th><th scope="col">{text.levelCol}</th><th scope="col">{text.role.whyCol}</th></tr></thead>
          <tbody>{item.positions.map((position) => <tr key={position.name}><th scope="row">{position.name}</th><td><span className="company-badge">{position.level}</span></td><td>{position.why}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
    <section className="site-section-tight site-guide-two">
      <div>
        <h2 className="site-h2">{text.role.tasksTitle}</h2>
        <ul className="site-ticks">{item.tasks.map((task) => <li key={task}>{task}</li>)}</ul>
      </div>
      <div>
        <h2 className="site-h2">{text.role.testTitle}</h2>
        <p>{item.test}</p>
        <p><Link className="button-link quiet" to="/solutions/hiring">{t('site.solution.hiring')}</Link></p>
      </div>
    </section>
    <section className="site-section-tight">
      <h2 className="site-h2">{text.role.otherTitle}</h2>
      <ul className="site-link-chips">
        {GUIDE_ROLES.filter((other) => other !== role).map((other) => <li key={other}><Link to={`/guide/${roleSlug(other)}`}>{t(`job.${other}` as AppKey)}</Link></li>)}
      </ul>
    </section>
    <LeadSection source={`guide:${slug}`} title={text.role.ctaTitle} lead={text.role.ctaLead}/>
  </SiteFrame>;
}
