import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { playbookRecommendationGenerate } from '../lib/api';
import { SiteChrome } from '../components/content/SiteChrome';
import { useAccess } from '../lib/useAccess';

export const DiagnosticPage: React.FC = () => {
  const { accessToken } = useAccess({ includeEffective: true });
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    setLoading(true);
    playbookRecommendationGenerate(accessToken, {})
      .then((data) => {
        if (!active) return;
        setPayload(data.recommendation ?? null);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  const planning = ((payload?.planning ?? null) as Record<string, unknown> | null) ?? null;
  const decision = ((payload?.decision ?? null) as Record<string, unknown> | null) ?? null;
  const planTemplate = ((payload?.plan_template ?? null) as Record<string, unknown> | null) ?? null;
  const moduleOrder = Array.isArray(payload?.recommended_module_order) ? (payload?.recommended_module_order as Array<Record<string, unknown>>) : [];
  const bottlenecks = Array.isArray(planning?.likely_bottlenecks) ? (planning?.likely_bottlenecks as Array<unknown>) : [];

  return (
    <SiteChrome compact>
      <section className="page-hero">
        <p className="eyebrow">Diagnostic output</p>
        <h1>Your current IELTS operating strategy.</h1>
        <p className="hero-summary">This recommendation blends your onboarding profile, latest simulator evidence, market constraints, and planning rules.</p>
      </section>

      {loading ? <div className="route-loading">Generating recommendation…</div> : null}
      {error ? <p className="error-banner">{error}</p> : null}

      {payload ? (
        <>
          <section className="dashboard-grid">
            <article className="content-card">
              <p className="eyebrow">Decision</p>
              <h2>{String(decision?.selected_track ?? 'general').toUpperCase()}</h2>
              <p>Delivery: {String(decision?.recommended_delivery_mode ?? 'computer')}</p>
              <p>OSR eligible: {String(decision?.one_skill_retake_eligible ?? false)}</p>
            </article>
            <article className="content-card">
              <p className="eyebrow">Planning</p>
              <h2>{String(planning?.deadline_bucket ?? 'improvement')}</h2>
              <p>Weakest skill: {String(planning?.weakest_skill ?? '-')}</p>
              <p>{String(planning?.realistic_timeline ?? '')}</p>
            </article>
            <article className="content-card">
              <p className="eyebrow">Template</p>
              <h2>{String(planTemplate?.title ?? 'No plan template selected')}</h2>
              <p>{String(planTemplate?.summary ?? '')}</p>
              {planTemplate?.slug ? (
                <Link to={`/plans/${String(planTemplate.slug)}`} className="button button-dark">
                  Open plan
                </Link>
              ) : null}
            </article>
          </section>

          <section className="split-band">
            <article className="content-card">
              <p className="eyebrow">Priority order</p>
              <h2>Modules to study next</h2>
              <div className="mini-feed">
                {moduleOrder.map((item) => (
                  <Link key={String(item.slug)} to={`/${String(item.slug)}`} className="feed-item">
                    <strong>{String(item.slug).replaceAll('-', ' ')}</strong>
                    <span>{String(item.reason ?? '')}</span>
                  </Link>
                ))}
              </div>
            </article>
            <article className="content-card">
              <p className="eyebrow">Likely bottlenecks</p>
              <h2>What may still block progress</h2>
              <ul className="plain-list">
                {bottlenecks.map((item, index) => (
                  <li key={index}>{String(item)}</li>
                ))}
              </ul>
            </article>
          </section>
        </>
      ) : null}
    </SiteChrome>
  );
};
