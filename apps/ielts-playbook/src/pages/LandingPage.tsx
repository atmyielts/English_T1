import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpenCheck,
  ClipboardCheck,
  Compass,
  FileText,
  Gauge,
  Headphones,
  PenLine,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { playbookCatalogGet, playbookUpdatesGet, type PlaybookCatalog } from '../lib/api';
import { PRACTICE_APP_URL, SIMULATOR_APP_URL } from '../lib/constants';
import { LandingChrome } from '../components/content/SiteChrome';
import { useT } from '../i18n';

const moduleIcons: LucideIcon[] = [BookOpenCheck, Compass, Headphones, PenLine, ClipboardCheck, FileText];
const skillGuides = ['listening', 'reading', 'writing', 'speaking'] as const;

export const LandingPage: React.FC = () => {
  const t = useT();
  const [catalog, setCatalog] = useState<PlaybookCatalog | null>(null);
  const [updates, setUpdates] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    playbookCatalogGet()
      .then((data) => {
        if (active) setCatalog(data);
      })
      .catch(() => {
        if (active) setError(true);
      });
    playbookUpdatesGet()
      .then((data) => {
        if (active) setUpdates(data);
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, []);

  const modules = catalog?.modules ?? [];
  const recentSources = Array.isArray(updates?.recent_sources) ? (updates!.recent_sources as Array<Record<string, unknown>>).slice(0, 3) : [];

  return (
    <LandingChrome>
      <section className="playbook-hero ielts-handbook-hero">
        <div className="ielts-handbook-frame">
          <div className="hero-copy">
            <p className="eyebrow">{t('landing.eyebrow')}</p>
            <h1>IELTS <span>Playbook</span></h1>
            <p className="hero-summary">{t('landing.lead')}</p>
            <div className="hero-actions">
              <Link to="/onboarding" className="button button-primary">
                <Sparkles size={17} />
                {t('landing.start')}
              </Link>
              <Link to="/essentials" className="button button-secondary">
                <BookOpenCheck size={17} aria-hidden="true" />
                {t('nav.essentials')}
              </Link>
            </div>
          </div>

          <aside className="ielts-route-board" aria-labelledby="ielts-route-title">
            <h2 id="ielts-route-title">{t('landing.board.skills')}</h2>
            <ol className="ielts-handbook-contents">
              {skillGuides.map(skill => <li key={skill}>
                <Link to={`/${skill}-master-guide`}><strong>{t(`skill.${skill}`)}</strong><ArrowRight size={17} aria-hidden="true" /></Link>
              </li>)}
            </ol>
            <a href="#modules" className="ielts-handbook-all">{t('landing.library.eyebrow')} <ArrowRight size={15} aria-hidden="true" /></a>
          </aside>
        </div>
      </section>

      <section className="section-band" id="modules">
        <div className="section-heading">
          <p className="eyebrow">{t('landing.library.eyebrow')}</p>
          <h2>{t('landing.library.title')}</h2>
          <p>{t('landing.library.lead')}</p>
        </div>
        {error ? <p className="notice-banner" role="status">{t('landing.catalogError')}</p> : null}
        <div className="module-showcase landing-module-index">
          {!catalog && !error
            ? [0, 1, 2, 3].map((i) => <span key={i} className="module-card p2-skeleton" style={{ minHeight: 180 }} aria-hidden="true" />)
            : modules.map((module, index) => {
                const Icon = moduleIcons[index % moduleIcons.length] ?? BookOpenCheck;
                return (
                  <Link key={module.id} to={`/${module.slug}`} className={`module-card${index === 0 ? ' module-card-featured' : ''}`}>
                    <span className="card-icon"><Icon size={18} /></span>
                    <span className="card-kicker">{module.metadata?.hero_kicker ? String(module.metadata.hero_kicker) : t('landing.module')}</span>
                    <h3>{module.title}</h3>
                    <p>{module.summary}</p>
                    <span className="card-link">
                      {t('landing.openModule')}
                      <ArrowRight size={15} />
                    </span>
                  </Link>
                );
              })}
        </div>
      </section>

      <section className="workflow-band">
        <article className="workflow-copy">
          <p className="eyebrow">{t('landing.workflow.eyebrow')}</p>
          <h2>{t('landing.workflow.title')}</h2>
          <p>{t('landing.workflow.lead')}</p>
          {catalog ? (
            <div className="stat-strip">
              <article>
                <strong>{catalog.modules.length}</strong>
                <span>{t('landing.stat.modules')}</span>
              </article>
              <article>
                <strong>{catalog.premium_guides.length}</strong>
                <span>{t('landing.stat.guides')}</span>
              </article>
              <article>
                <strong>4</strong>
                <span>{t('landing.stat.skills')}</span>
              </article>
            </div>
          ) : null}
          <div className="inline-actions">
            <a href={`${SIMULATOR_APP_URL}?source=playbook`} className="button button-secondary">
              <Gauge size={17} />
              {t('service.simulator')}
            </a>
            <a href={`${PRACTICE_APP_URL}/dashboard?source=playbook`} className="button button-primary">
              <TrendingUp size={17} />
              {t('service.practice')}
            </a>
          </div>
        </article>

        <article className="source-panel">
          <p className="eyebrow">{t('landing.sources.eyebrow')}</p>
          <h2>{t('landing.sources.title')}</h2>
          <div className="mini-feed">
            {recentSources.length === 0 ? (
              <Link to="/updates-policy" className="feed-item">
                <strong>{t('landing.sources.fallbackTitle')}</strong>
                <span>{t('landing.sources.fallbackBody')}</span>
              </Link>
            ) : (
              recentSources.map((source, index) => (
                <a key={index} href={String(source.url ?? '#')} className="feed-item" target="_blank" rel="noreferrer noopener">
                  <strong>{String(source.title ?? '')}</strong>
                  <span>{String(source.summary ?? '')}</span>
                </a>
              ))
            )}
          </div>
        </article>
      </section>
    </LandingChrome>
  );
};
