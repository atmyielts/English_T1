import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, ClipboardList, Compass, LoaderCircle, Route, TriangleAlert } from 'lucide-react';
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
      <section className="workspace-hero">
        <div>
          <p className="eyebrow">Diagnostic output</p>
          <h1>Your current IELTS operating strategy.</h1>
          <p className="hero-summary">
            This recommendation blends onboarding profile, latest simulator evidence, market constraints, and planning
            rules into one action order.
          </p>
        </div>
        <aside className="diagnostic-status">
          {loading ? <LoaderCircle size={22} className="spin" /> : <CheckCircle2 size={22} />}
          <span>{loading ? 'Generating recommendation' : 'Recommendation ready'}</span>
        </aside>
      </section>

      {loading ? <div className="route-loading">Generating recommendation...</div> : null}
      {error ? <p className="notice-banner notice-danger">{error}</p> : null}

      {payload ? (
        <>
          <section className="dashboard-grid">
            <article className="metric-card">
              <span className="card-icon">
                <Compass size={18} />
              </span>
              <p className="eyebrow">Decision</p>
              <h2>{String(decision?.selected_track ?? 'general').toUpperCase()}</h2>
              <p>Delivery: {String(decision?.recommended_delivery_mode ?? 'computer')}</p>
              <div className="pill-row">
                <span className="pill">OSR: {String(decision?.one_skill_retake_eligible ?? false)}</span>
              </div>
            </article>
            <article className="metric-card metric-card-accent">
              <span className="card-icon">
                <Route size={18} />
              </span>
              <p className="eyebrow">Planning</p>
              <h2>{String(planning?.deadline_bucket ?? 'improvement')}</h2>
              <p>Weakest skill: {String(planning?.weakest_skill ?? '-')}</p>
              <p>{String(planning?.realistic_timeline ?? '')}</p>
            </article>
            <article className="metric-card">
              <span className="card-icon">
                <ClipboardList size={18} />
              </span>
              <p className="eyebrow">Template</p>
              <h2>{String(planTemplate?.title ?? 'No plan template selected')}</h2>
              <p>{String(planTemplate?.summary ?? '')}</p>
              {planTemplate?.slug ? (
                <Link to={`/plans/${String(planTemplate.slug)}`} className="text-link">
                  Open plan
                  <ArrowRight size={15} />
                </Link>
              ) : null}
            </article>
          </section>

          <section className="workspace-grid">
            <article className="content-card priority-panel">
              <div className="section-heading compact-heading">
                <p className="eyebrow">Priority order</p>
                <h2>Modules to study next</h2>
              </div>
              <div className="timeline-list">
                {moduleOrder.map((item, index) => (
                  <Link key={String(item.slug)} to={`/${String(item.slug)}`} className="timeline-item">
                    <span>{index + 1}</span>
                    <div>
                      <strong>{String(item.slug).replaceAll('-', ' ')}</strong>
                      <p>{String(item.reason ?? '')}</p>
                    </div>
                    <ArrowRight size={16} />
                  </Link>
                ))}
              </div>
            </article>
            <article className="content-card risk-panel">
              <div className="section-heading compact-heading">
                <p className="eyebrow">Likely bottlenecks</p>
                <h2>What may still block progress</h2>
              </div>
              <ul className="plain-list">
                {bottlenecks.map((item, index) => (
                  <li key={index}>
                    <TriangleAlert size={17} />
                    <span>{String(item)}</span>
                  </li>
                ))}
              </ul>
            </article>
          </section>
        </>
      ) : null}
    </SiteChrome>
  );
};
