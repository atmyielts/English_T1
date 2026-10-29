// The public sales page at company.schood.online: what the service does for HR,
// how it works, job-role tracks, a mock report, the free pilot, pricing by
// agreement, FAQ and the demo request form. No prices, statistics, client logos
// or testimonials: only what the product does.
import React, { useEffect, useState } from 'react';
import { INDUSTRIES, JOB_ROLES } from '../../../../../packages/company-core/src/mod.ts';
import { LocaleSwitcher } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useSession } from '../../session.tsx';
import { homeOf } from '../core/pages.tsx';
import type { LeadForm } from '../people/types.ts';
import { DemoForm } from './DemoForm.tsx';
import { HeroCard, SampleReport } from './SampleReport.tsx';

const PILLARS = ['hiring', 'placement', 'training', 'insights'] as const;
const FAQ = ['privacy', 'languages', 'ai', 'certificate', 'payment', 'data', 'candidates', 'pilot'] as const;

function Icon({ name }: { name: (typeof PILLARS)[number] }) {
  const paths: Record<typeof name, React.ReactNode> = {
    hiring: <><circle cx="11" cy="8" r="4"/><path d="M3 21c0-4 3.6-7 8-7s8 3 8 7"/><path d="m16 11 2 2 4-4"/></>,
    placement: <><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/></>,
    training: <><path d="M3 6.5 12 3l9 3.5-9 3.5z"/><path d="M7 8.5V14c0 1.7 2.2 3 5 3s5-1.3 5-3V8.5"/><path d="M21 7v6"/></>,
    insights: <><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/></>,
  };
  return <svg className="site-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function Landing() {
  const t = useAppT();
  const { user, me } = useSession();
  const [pilot, setPilot] = useState<LeadForm | null>(null);
  useEffect(() => { api<LeadForm>('public/leads/form', { auth: false }).then(setPilot).catch(() => setPilot(null)); }, []);
  useEffect(() => {
    document.title = t('site.meta.title');
    const id = location.hash.slice(1);
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    return () => { document.title = t('app.title'); };
  }, [t]);
  const first = me?.workspaces[0];
  const tests = pilot?.pilot_tests ?? null;
  const selfServe = pilot?.self_serve !== false;
  const primary = first
    ? <Link className="button-link site-cta" to={homeOf(first.org.id, first.member.role)}>{t('site.cta.open')}</Link>
    : selfServe ? <Link className="button-link site-cta" to="/start">{t('site.cta.pilot')}</Link>
      : <a className="button-link site-cta" href="#demo">{t('site.cta.demo')}</a>;

  return <div className="site">
    <a className="skip-link" href="#workspace-main">{t('header.skip')}</a>
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/" className="site-brand" aria-label={t('site.brandAria')}><span className="service-brand-dot" aria-hidden="true"/>Schood<span>{t('app.name')}</span></Link>
        <nav className="site-nav" aria-label={t('site.nav.label')}>
          <a href="#how">{t('site.nav.how')}</a>
          <a href="#tracks">{t('site.nav.tracks')}</a>
          <a href="#report">{t('site.nav.report')}</a>
          <a href="#pricing">{t('site.nav.pricing')}</a>
          <a href="#faq">{t('site.nav.faq')}</a>
        </nav>
        <div className="site-header-actions">
          <LocaleSwitcher label={t('locale.label')}/>
          {me?.staff && <Link className="button-link quiet site-hide-sm" to="/staff">{t('site.cta.staff')}</Link>}
          {user ? (first ? <Link className="button-link" to={homeOf(first.org.id, first.member.role)}>{t('site.cta.open')}</Link> : <Link className="button-link quiet" to="/w">{t('picker.title')}</Link>)
            : <Link className="button-link quiet" to="/w">{t('site.cta.signIn')}</Link>}
        </div>
      </div>
    </header>

    <main id="workspace-main" tabIndex={-1}>
      <section className="site-hero" aria-labelledby="site-hero-title">
        <div className="site-hero-text">
          <p className="site-eyebrow">{t('site.hero.eyebrow')}</p>
          <h1 id="site-hero-title">{t('site.hero.title')}</h1>
          <p className="site-lead">{t('site.hero.lead')}</p>
          <div className="site-ctas">
            {primary}
            <a className="button-link quiet site-cta" href="#demo">{t('site.cta.demo')}</a>
          </div>
          <ul className="site-points">
            <li>{t('site.hero.point1')}</li>
            <li>{t('site.hero.point2', { count: JOB_ROLES.length })}</li>
            <li>{t('site.hero.point3')}</li>
          </ul>
        </div>
        <div className="site-hero-visual"><HeroCard/></div>
      </section>

      <section className="site-section" aria-labelledby="site-problem-title">
        <h2 id="site-problem-title" className="site-h2">{t('site.problem.title')}</h2>
        <div className="site-cards site-cards-3">
          {([1, 2, 3] as const).map((n) => <article key={n} className="site-card site-card-plain">
            <h3>{t(`site.problem.${n}.title`)}</h3>
            <p>{t(`site.problem.${n}.body`)}</p>
          </article>)}
        </div>
      </section>

      <section className="site-section" aria-labelledby="site-pillars-title">
        <p className="site-eyebrow">{t('site.pillars.eyebrow')}</p>
        <h2 id="site-pillars-title" className="site-h2">{t('site.pillars.title')}</h2>
        <div className="site-cards site-cards-4">
          {PILLARS.map((pillar) => <article key={pillar} className="site-card">
            <Icon name={pillar}/>
            <h3>{t(`site.pillar.${pillar}.title`)}</h3>
            <p>{t(`site.pillar.${pillar}.body`)}</p>
          </article>)}
        </div>
      </section>

      <section className="site-section" id="how" aria-labelledby="site-how-title">
        <h2 id="site-how-title" className="site-h2">{t('site.steps.title')}</h2>
        <ol className="site-steps">
          {([1, 2, 3] as const).map((n) => <li key={n}>
            <span className="site-step-number" aria-hidden="true">{n}</span>
            <h3>{t(`site.step.${n}.title`)}</h3>
            <p>{t(`site.step.${n}.body`)}</p>
          </li>)}
        </ol>
      </section>

      <section className="site-section" id="tracks" aria-labelledby="site-tracks-title">
        <h2 id="site-tracks-title" className="site-h2">{t('site.tracks.title')}</h2>
        <p className="site-section-lead">{t('site.tracks.lead')}</p>
        <div className="site-two">
          <div>
            <h3 className="site-h3">{t('site.tracks.roles')}</h3>
            <ul className="site-chips">{JOB_ROLES.map((code) => <li key={code}>{t(`job.${code}` as AppKey)}</li>)}</ul>
          </div>
          <div>
            <h3 className="site-h3">{t('site.tracks.industries')}</h3>
            <ul className="site-chips site-chips-quiet">{INDUSTRIES.filter((code) => code !== 'other').map((code) => <li key={code}>{t(`industry.${code}` as AppKey)}</li>)}</ul>
            <p className="hint">{t('site.tracks.inside')}</p>
          </div>
        </div>
      </section>

      <section className="site-section site-report-section" id="report" aria-labelledby="site-report-title">
        <div className="site-report-intro">
          <h2 id="site-report-title" className="site-h2">{t('site.report.title')}</h2>
          <p className="site-section-lead">{t('site.report.lead')}</p>
          <ul className="site-ticks">
            <li>{t('site.report.point1')}</li>
            <li>{t('site.report.point2')}</li>
            <li>{t('site.report.point3')}</li>
          </ul>
        </div>
        <SampleReport/>
      </section>

      <section className="site-section site-pilot" aria-labelledby="site-pilot-title">
        <div>
          <h2 id="site-pilot-title" className="site-h2">{t('site.pilot.title')}</h2>
          <p className="site-section-lead">{tests === null ? t('site.pilot.bodyPlain') : t('site.pilot.body', { tests })}</p>
        </div>
        <div className="site-ctas">
          {selfServe ? <Link className="button-link site-cta" to="/start">{t('site.cta.pilot')}</Link> : null}
          <a className="button-link quiet site-cta" href="#demo">{t('site.pilot.withUs')}</a>
        </div>
      </section>

      <section className="site-section" id="pricing" aria-labelledby="site-pricing-title">
        <h2 id="site-pricing-title" className="site-h2">{t('site.pricing.title')}</h2>
        <p className="site-section-lead">{t('site.pricing.lead')}</p>
        <div className="site-cards site-cards-2">
          <article className="site-card site-price">
            <p className="site-price-label">{t('site.pricing.per')}</p>
            <h3>{t('site.pricing.seat.title')}</h3>
            <p>{t('site.pricing.seat.body')}</p>
          </article>
          <article className="site-card site-price">
            <p className="site-price-label">{t('site.pricing.per')}</p>
            <h3>{t('site.pricing.test.title')}</h3>
            <p>{t('site.pricing.test.body')}</p>
          </article>
        </div>
        <p className="site-included">{t('site.pricing.included')}</p>
        <p><a className="button-link" href="#demo">{t('site.pricing.cta')}</a></p>
      </section>

      <section className="site-section" id="faq" aria-labelledby="site-faq-title">
        <h2 id="site-faq-title" className="site-h2">{t('site.faq.title')}</h2>
        <div className="site-faq">
          {FAQ.map((item) => <details key={item}>
            <summary>{t(`site.faq.${item}.q`)}</summary>
            <p>{item === 'pilot' && tests !== null ? t('site.faq.pilot.aCount', { tests }) : t(`site.faq.${item}.a`)}</p>
          </details>)}
        </div>
      </section>

      <section className="site-section site-demo" id="demo" aria-labelledby="site-demo-title">
        <div className="site-demo-intro">
          <h2 id="site-demo-title" className="site-h2">{t('site.demo.title')}</h2>
          <p className="site-section-lead">{t('site.demo.lead')}</p>
          <ul className="site-ticks">
            <li>{t('site.demo.point1')}</li>
            <li>{t('site.demo.point2')}</li>
            <li>{t('site.demo.point3')}</li>
          </ul>
        </div>
        <DemoForm/>
      </section>
    </main>

    <footer className="site-footer">
      <div>
        <strong>Schood · {t('app.name')}</strong>
        <p>{t('app.footer')}</p>
      </div>
      <nav aria-label={t('site.footer.label')}>
        <a href="https://schood.online">schood.online</a>
        <Link to="/w">{t('site.cta.signIn')}</Link>
        {selfServe && <Link to="/start">{t('site.cta.pilot')}</Link>}
        <a href="#demo">{t('site.cta.demo')}</a>
      </nav>
    </footer>
  </div>;
}
