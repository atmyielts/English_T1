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
  Route,
  Sparkles,
  Target,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { playbookCatalogGet, playbookUpdatesGet, type PlaybookCatalog } from '../lib/api';
import { PRACTICE_APP_URL, SIMULATOR_APP_URL } from '../lib/constants';
import { SiteChrome } from '../components/content/SiteChrome';
import { useT } from '../i18n';

const moduleIcons: LucideIcon[] = [BookOpenCheck, Compass, Headphones, PenLine, ClipboardCheck, FileText];

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
  const skills = [t('skill.listening'), t('skill.reading'), t('skill.writing'), t('skill.speaking')];

  return (
    <SiteChrome>
      <section className="playbook-hero">
        <div className="hero-copy">
          <p className="eyebrow">{t('landing.eyebrow')}</p>
          <h1>IELTS Playbook</h1>
          <p className="hero-summary">{t('landing.lead')}</p>
          <div className="hero-actions">
            <Link to="/onboarding" className="button button-primary">
              <Sparkles size={17} />
              {t('landing.start')}
            </Link>
            <a href={`${SIMULATOR_APP_URL}?source=playbook`} className="button button-secondary">
              <Gauge size={17} />
              {t('landing.openSimulator')}
            </a>
          </div>
        </div>

        <div className="hero-board" aria-label={t('landing.boardLabel')}>
          <article className="board-panel board-primary">
            <div className="board-topline">
              <span>{t('landing.board.today')}</span>
              <span>{t('landing.board.live')}</span>
            </div>
            <h2>{t('landing.board.title')}</h2>
            <p>{t('landing.board.lead')}</p>
            {/* Illustration only: no scores are shown until the learner has real evidence. */}
            <ul className="skill-chip-list" aria-label={t('landing.board.skills')}>
              {skills.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </article>

          <Link to="/diagnostic" className="board-panel board-action">
            <Target size={22} />
            <span>{t('landing.board.next')}</span>
            <strong>{t('landing.board.priorityMap')}</strong>
            <ArrowRight size={18} className="panel-arrow" />
          </Link>

          <Link to="/test-types-booking" className="board-panel board-route">
            <Route size={22} />
            <span>{t('landing.board.beforeBooking')}</span>
            <strong>{t('landing.board.paths')}</strong>
          </Link>

          <article className="board-panel board-tags">
            {['Band 7+', 'Task 2', 'TFNG', 'Part 3', 'Retake', 'Deadline'].map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </article>
        </div>
      </section>

      <section className="section-band" id="modules">
        <div className="section-heading">
          <p className="eyebrow">{t('landing.library.eyebrow')}</p>
          <h2>{t('landing.library.title')}</h2>
          <p>{t('landing.library.lead')}</p>
        </div>
        {error ? <p className="notice-banner" role="status">{t('landing.catalogError')}</p> : null}
        <div className="module-showcase">
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
    </SiteChrome>
  );
};
