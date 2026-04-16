import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { playbookCatalogGet, playbookUpdatesGet, type PlaybookCatalog } from '../lib/api';
import { PRACTICE_APP_URL, SIMULATOR_APP_URL } from '../lib/constants';
import { SiteChrome } from '../components/content/SiteChrome';

export const LandingPage: React.FC = () => {
  const [catalog, setCatalog] = useState<PlaybookCatalog | null>(null);
  const [updates, setUpdates] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([playbookCatalogGet(), playbookUpdatesGet()])
      .then(([catalogPayload, updatesPayload]) => {
        if (!active) return;
        setCatalog(catalogPayload);
        setUpdates(updatesPayload);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);

  const recentSources = Array.isArray(updates?.recent_sources) ? updates.recent_sources.slice(0, 3) : [];

  return (
    <SiteChrome>
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Authoritative IELTS system</p>
          <h1>Master IELTS with a playbook that actually connects strategy to scored performance.</h1>
          <p className="hero-summary">
            Public editorial guidance builds clarity. Premium diagnostics turn your simulator outcomes into a study order,
            realistic timeline, and next-step routine.
          </p>
          <div className="hero-actions">
            <Link to="/onboarding" className="button button-dark">
              Start My Diagnostic
            </Link>
            <a href={`${SIMULATOR_APP_URL}?source=playbook`} className="button button-light">
              Open Simulator
            </a>
          </div>
          <div className="hero-stats">
            <article>
              <strong>12</strong>
              <span>core modules</span>
            </article>
            <article>
              <strong>4</strong>
              <span>skills mapped to band movement</span>
            </article>
            <article>
              <strong>1</strong>
              <span>shared strategy layer with simulator and practice</span>
            </article>
          </div>
        </div>
        <div className="hero-card-stack">
          <article className="floating-card warm">
            <p>Choose the right test</p>
            <strong>Academic, General, UKVI, OSR</strong>
          </article>
          <article className="floating-card dark">
            <p>Use scored evidence</p>
            <strong>Simulator outcomes feed the diagnostic</strong>
          </article>
          <article className="floating-card light">
            <p>Study with intent</p>
            <strong>Crash, balanced, and recovery plans</strong>
          </article>
        </div>
      </section>

      <section className="section-shell">
        <div className="section-heading">
          <p className="eyebrow">Modules</p>
          <h2>The full playbook structure</h2>
        </div>
        {error ? <p className="error-banner">{error}</p> : null}
        <div className="module-grid">
          {catalog?.modules.map((module) => (
            <Link key={module.id} to={`/${module.slug}`} className="module-card">
              <span>{module.metadata?.hero_kicker ? String(module.metadata.hero_kicker) : 'Module'}</span>
              <h3>{module.title}</h3>
              <p>{module.summary}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="split-band">
        <article className="content-card feature-panel">
          <p className="eyebrow">Integrated workflow</p>
          <h2>Playbook, simulator, and practice work as one loop.</h2>
          <p>
            Use the simulator for scored outcomes, the playbook for interpretation and planning, and the practice service for
            targeted repetition. The handoff keeps context like weak skill, overall band, and question-type pressure.
          </p>
          <div className="inline-actions">
            <a href={`${SIMULATOR_APP_URL}?source=playbook`} className="button button-light">
              Simulator
            </a>
            <a href={`${PRACTICE_APP_URL}/dashboard?source=playbook`} className="button button-dark">
              Practice
            </a>
          </div>
        </article>
        <article className="content-card">
          <p className="eyebrow">Verified updates</p>
          <h2>Official changes stay source-linked.</h2>
          <div className="mini-feed">
            {recentSources.map((source, index) => (
              <a key={index} href={String((source as Record<string, unknown>).url ?? '#')} className="feed-item">
                <strong>{String((source as Record<string, unknown>).title ?? 'Source')}</strong>
                <span>{String((source as Record<string, unknown>).summary ?? '')}</span>
              </a>
            ))}
          </div>
        </article>
      </section>
    </SiteChrome>
  );
};
