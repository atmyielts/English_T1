import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { playbookDashboardGet } from '../lib/api';
import { SiteChrome } from '../components/content/SiteChrome';
import { useAccess } from '../lib/useAccess';

export const DashboardPage: React.FC = () => {
  const { accessToken } = useAccess({ includeEffective: true });
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    playbookDashboardGet(accessToken)
      .then((data) => {
        if (!active) return;
        setPayload(data);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  const profile = (payload?.profile ?? {}) as Record<string, unknown>;
  const recommendation = (payload?.latest_recommendation ?? null) as Record<string, unknown> | null;
  const outcome = (payload?.latest_outcome ?? null) as Record<string, unknown> | null;
  const guides = Array.isArray(payload?.premium_guides) ? (payload?.premium_guides as Array<Record<string, unknown>>) : [];
  const planning = ((recommendation?.planning ?? null) as Record<string, unknown> | null) ?? null;

  return (
    <SiteChrome compact>
      <section className="page-hero">
        <p className="eyebrow">Premium Dashboard</p>
        <h1>Your IELTS decision layer.</h1>
        <p className="hero-summary">
          Keep one place for your target band, latest scored evidence, market logic, and the modules that deserve your next hour.
        </p>
      </section>

      {error ? <p className="error-banner">{error}</p> : null}

      <section className="dashboard-grid">
        <article className="content-card">
          <p className="eyebrow">Profile</p>
          <h2>Target {String(profile.target_overall_band ?? '6.5')}</h2>
          <p>Purpose: {String(profile.purpose ?? 'study')}</p>
          <p>Weakest skill: {String(profile.weakest_skill ?? 'Not set')}</p>
          <Link to="/onboarding" className="button button-light">
            Update onboarding
          </Link>
        </article>

        <article className="content-card">
          <p className="eyebrow">Latest evidence</p>
          <h2>{outcome ? `Overall band ${String(outcome.overall_band ?? outcome.current_overall_band ?? '-')}` : 'No simulator outcome yet'}</h2>
          <p>
            {outcome
              ? `Last scored outcome: ${String(outcome.computed_at ?? '')}`
              : 'Run the simulator so the playbook can prioritize from actual section scores instead of self-report only.'}
          </p>
          <Link to="/diagnostic" className="button button-dark">
            Generate strategy
          </Link>
        </article>

        <article className="content-card">
          <p className="eyebrow">Current plan</p>
          <h2>{String((recommendation?.plan_template as Record<string, unknown> | undefined)?.title ?? 'No saved plan')}</h2>
          <p>{String(planning?.realistic_timeline ?? 'Build a fresh recommendation to get a realistic timeline and module order.')}</p>
          <div className="pill-row">
            <span className="pill">Bucket: {String(planning?.deadline_bucket ?? '-')}</span>
            <span className="pill">Weak skill: {String(planning?.weakest_skill ?? '-')}</span>
          </div>
        </article>
      </section>

      {Array.isArray(recommendation?.recommended_module_order) ? (
        <section className="section-shell">
          <div className="section-heading">
            <p className="eyebrow">Next modules</p>
            <h2>Recommended order</h2>
          </div>
          <div className="module-grid">
            {(recommendation.recommended_module_order as Array<Record<string, unknown>>).map((item) => (
              <Link key={String(item.slug)} to={`/${String(item.slug)}`} className="module-card">
                <span>Priority module</span>
                <h3>{String(item.slug).replaceAll('-', ' ')}</h3>
                <p>{String(item.reason ?? '')}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="section-shell">
        <div className="section-heading">
          <p className="eyebrow">Premium guides</p>
          <h2>Deep dives tied to band movement</h2>
        </div>
        <div className="module-grid">
          {guides.map((guide) => (
            <Link key={String(guide.id)} to={`/${String(guide.slug)}`} className="module-card">
              <span>{String(guide.page_type ?? 'guide')}</span>
              <h3>{String(guide.title ?? '')}</h3>
              <p>{String(guide.summary ?? '')}</p>
            </Link>
          ))}
        </div>
      </section>
    </SiteChrome>
  );
};
