import { ArrowRight, BookOpenCheck, CalendarRange, Compass, Crown, Lock, Target } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shell } from '../components/TopNav';
import { PremiumFeatures, SkeletonGrid } from '../components/ui';
import { useDynamicT, useT } from '../i18n';
import type { Catalog, CatalogEntry } from '../lib/api';
import { usePlaybook } from '../lib/context';
import { pricingUrl } from '../lib/platformUrls';

export const useCatalog = () => {
  const { api } = usePlaybook();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    setFailed(false);
    api.catalog(controller.signal)
      .then((data) => active && setCatalog({ ...data, modules: data.modules ?? [], premium_guides: data.premium_guides ?? [], plan_templates: data.plan_templates ?? [] }))
      .catch(() => active && setFailed(true))
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [api, attempt]);
  return { catalog, failed, retry: () => setAttempt((n) => n + 1) };
};

export const ModuleCard = ({ entry, premium, parentTitle }: { entry: CatalogEntry; premium?: boolean; parentTitle?: string | null }) => {
  const t = useT();
  return (
    <Link to={`/${encodeURIComponent(entry.slug)}`} className="feature-card link-card">
      {premium ? <span className="chip premium"><Crown size={12} aria-hidden="true" /> {t('premium.badge')}</span> : <span className="chip">{t('modules.free')}</span>}
      <h3>{entry.title}</h3>
      {parentTitle ? <p className="card-parent">{t('content.partOf')} {parentTitle}</p> : null}
      {entry.summary ? <p>{entry.summary}</p> : null}
      {Number(entry.metadata?.reading_minutes ?? 0) > 0 ? <span className="card-meta">{t('content.minutes', { count: Number(entry.metadata.reading_minutes) })}</span> : null}
      <span className="card-cta">{t('modules.read')} <ArrowRight size={14} aria-hidden="true" /></span>
    </Link>
  );
};

export const LandingPage = () => {
  const t = useT();
  const dt = useDynamicT();
  const { config, access, api } = usePlaybook();
  const { catalog, failed, retry } = useCatalog();

  useEffect(() => {
    void api.track({ event_name: 'page_view', page_type: 'landing', metadata: { path: '/' } }, access.token);
    // Only once per visit to the landing page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bySlug = new Map((catalog?.modules ?? []).map((m) => [m.slug, m]));
  const firstModule = (slugs: string[]) => slugs.map((s) => bySlug.get(s)).find(Boolean) ?? null;
  const sectionCards = config.sections.map((section) => ({ section, entry: firstModule(config.sectionModules[section] ?? []) }));
  const essentials = bySlug.get(config.modules[0] ?? '');

  return (
    <Shell>
      <section className="landing-hero">
        <div>
          <p className="eyebrow">{t('landing.eyebrow', { exam: config.examName })}</p>
          <h1>{config.serviceName}</h1>
          <p>{t(`landing.lead.${config.exam}` as 'landing.lead.sat')}</p>
          <div className="hero-actions">
            {essentials ? (
              <Link to={`/${essentials.slug}`} className="btn solid">{t('landing.startFree')} <ArrowRight size={17} aria-hidden="true" /></Link>
            ) : (
              <Link to="/modules" className="btn solid">{t('landing.browse')} <ArrowRight size={17} aria-hidden="true" /></Link>
            )}
            <Link to={access.premium ? '/dashboard' : '/diagnostic'} className="btn ghost on-dark">{access.premium ? t('landing.openPlan') : t('landing.getDiagnostic')}</Link>
          </div>
        </div>
      </section>

      <section className="panel" aria-labelledby="by-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">{t('landing.bySection')}</p>
            <h2 id="by-section">{t('landing.bySectionTitle', { exam: config.examName })}</h2>
          </div>
        </div>
        <div className="feature-grid">
          {sectionCards.map(({ section, entry }) =>
            entry ? (
              <Link key={section} to={`/${entry.slug}`} className="feature-card link-card">
                <Target size={22} aria-hidden="true" />
                <h3>{dt(`section.${section}`, section)}</h3>
                <p>{entry.title}</p>
                <span className="card-cta">{t('modules.read')} <ArrowRight size={14} aria-hidden="true" /></span>
              </Link>
            ) : (
              <article key={section} className="feature-card muted">
                <Target size={22} aria-hidden="true" />
                <h3>{dt(`section.${section}`, section)}</h3>
                <p>{catalog ? t('landing.sectionSoon') : t('common.loading')}</p>
              </article>
            ),
          )}
        </div>
      </section>

      <section className="panel" aria-labelledby="how">
        <p className="eyebrow">{t('landing.howEyebrow')}</p>
        <h2 id="how">{t('landing.howTitle')}</h2>
        <ol className="steps-grid">
          <li><BookOpenCheck size={22} aria-hidden="true" /><h3>{t('landing.step1.title')}</h3><p>{t('landing.step1.body', { exam: config.examName })}</p></li>
          <li><Compass size={22} aria-hidden="true" /><h3>{t('landing.step2.title')}</h3><p>{t(`landing.step2.body.${config.exam}` as 'landing.step2.body.sat')}</p></li>
          <li><CalendarRange size={22} aria-hidden="true" /><h3>{t('landing.step3.title')}</h3><p>{t('landing.step3.body')}</p></li>
        </ol>
      </section>

      <section className="panel" aria-labelledby="free-modules">
        <div className="section-head">
          <div>
            <p className="eyebrow">{t('landing.freeEyebrow')}</p>
            <h2 id="free-modules">{t('landing.freeTitle')}</h2>
          </div>
          <Link to="/modules" className="btn ghost compact">{t('landing.allModules')}</Link>
        </div>
        {failed ? (
          <p className="alert error" role="alert">{t('modules.loadFailed')} <button type="button" className="link-button" onClick={retry}>{t('common.retry')}</button></p>
        ) : !catalog ? <SkeletonGrid cards={4} /> : catalog.modules.length ? (
          <div className="feature-grid catalog-grid">{catalog.modules.map((m) => <ModuleCard key={m.id} entry={m} />)}</div>
        ) : <p>{t('modules.noneYet')}</p>}
      </section>

      <section className="panel premium-panel" aria-labelledby="premium">
        <div className="two-col">
          <div>
            <span className="chip premium"><Crown size={12} aria-hidden="true" /> {t('premium.badge')}</span>
            <h2 id="premium">{t('landing.premiumTitle', { service: config.serviceName })}</h2>
            <p>{t('landing.premiumBody', { bundle: config.completeBundleName })}</p>
            <PremiumFeatures />
            <div className="hero-actions">
              {access.premium ? (
                <Link to="/dashboard" className="btn solid">{t('landing.openPlan')}</Link>
              ) : (
                <a className="btn solid" href={pricingUrl(config.productSlug)} onClick={() => void api.track({ event_name: 'upgrade_click', metadata: { source: 'landing' } }, access.token)}>
                  {t('gate.seePricing')} <ArrowRight size={16} aria-hidden="true" />
                </a>
              )}
              <a className="btn ghost" href={config.simulator.url}>{t('landing.takeMock')}</a>
            </div>
          </div>
          <div>
            <h3>{t('landing.guidesTitle')}</h3>
            {catalog?.premium_guides.length ? (
              <ul className="plain-list">
                {catalog.premium_guides.map((g) => <li key={g.id}><Link to={`/${g.slug}`}><Lock size={13} aria-hidden="true" /> {g.title}</Link></li>)}
              </ul>
            ) : <p className="muted-note">{catalog ? t('modules.noGuides') : t('common.loading')}</p>}
            <h3>{t('landing.plansTitle')}</h3>
            {catalog?.plan_templates.length ? (
              <ul className="plain-list">
                {catalog.plan_templates.map((p) => <li key={p.id}><Link to={`/plans/${p.slug}`}>{p.title}</Link> <span className="muted-note">· {t('plans.weeks', { count: Math.max(1, Math.ceil(p.duration_days / 7)) })}</span></li>)}
              </ul>
            ) : <p className="muted-note">{catalog ? t('plans.noneYet') : t('common.loading')}</p>}
          </div>
        </div>
      </section>
    </Shell>
  );
};
