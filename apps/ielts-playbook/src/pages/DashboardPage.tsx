import React, { useEffect, useState } from 'react';
import { ArrowRight, CalendarClock, Gauge, NotebookTabs, Radar, Target, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { playbookDashboardGet } from '../lib/api';
import { SiteChrome } from '../components/content/SiteChrome';
import { useAccess } from '../lib/useAccess';

const scoreLabel = (value: unknown) => (value == null || value === '' ? '-' : String(value));

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
  const moduleOrder = Array.isArray(recommendation?.recommended_module_order)
    ? (recommendation?.recommended_module_order as Array<Record<string, unknown>>)
    : [];
  const targetBand = scoreLabel(profile.target_overall_band ?? '6.5');
  const currentBand = outcome ? scoreLabel(outcome.overall_band ?? outcome.current_overall_band) : scoreLabel(profile.current_band_or_estimate);

  return (
    <SiteChrome compact>
      <section className="workspace-hero">
        <div>
          <p className="eyebrow">Premium dashboard</p>
          <h1>Your IELTS decision layer.</h1>
          <p className="hero-summary">
            Keep target band, scored evidence, market logic, and next modules in one place so every study session starts
            with a clear reason.
          </p>
          <div className="hero-actions">
            <Link to="/diagnostic" className="button button-primary">
              <Radar size={17} />
              Generate Strategy
            </Link>
            <Link to="/onboarding" className="button button-secondary">
              <Target size={17} />
              Update Profile
            </Link>
          </div>
        </div>
        <aside className="score-panel" aria-label="Current IELTS target">
          <div>
            <span>Target</span>
            <strong>{targetBand}</strong>
          </div>
          <div>
            <span>Current</span>
            <strong>{currentBand}</strong>
          </div>
          <div className="score-panel-note">
            Weak skill: {String(planning?.weakest_skill ?? profile.weakest_skill ?? 'Not set')}
          </div>
        </aside>
      </section>

      {error ? <p className="notice-banner notice-danger">{error}</p> : null}

      <section className="dashboard-grid">
        <article className="metric-card">
          <span className="card-icon">
            <Target size={18} />
          </span>
          <p className="eyebrow">Profile</p>
          <h2>Band {targetBand}</h2>
          <p>Purpose: {String(profile.purpose ?? 'study')}</p>
          <Link to="/onboarding" className="text-link">
            Adjust profile
            <ArrowRight size={15} />
          </Link>
        </article>

        <article className="metric-card metric-card-accent">
          <span className="card-icon">
            <Gauge size={18} />
          </span>
          <p className="eyebrow">Latest evidence</p>
          <h2>{outcome ? `Overall ${currentBand}` : 'No mock yet'}</h2>
          <p>
            {outcome
              ? `Last scored outcome: ${String(outcome.computed_at ?? '')}`
              : 'Run a simulator attempt so the playbook can prioritize from real section scores.'}
          </p>
          <Link to="/diagnostic" className="text-link">
            Build from evidence
            <ArrowRight size={15} />
          </Link>
        </article>

        <article className="metric-card">
          <span className="card-icon">
            <CalendarClock size={18} />
          </span>
          <p className="eyebrow">Current plan</p>
          <h2>{String((recommendation?.plan_template as Record<string, unknown> | undefined)?.title ?? 'No saved plan')}</h2>
          <p>{String(planning?.realistic_timeline ?? 'Generate a recommendation to get a timeline and module order.')}</p>
          <div className="pill-row">
            <span className="pill">Bucket: {String(planning?.deadline_bucket ?? '-')}</span>
            <span className="pill">Weak: {String(planning?.weakest_skill ?? '-')}</span>
          </div>
        </article>
      </section>

      <section className="workspace-grid">
        <article className="content-card priority-panel">
          <div className="section-heading compact-heading">
            <p className="eyebrow">Next modules</p>
            <h2>Recommended order</h2>
          </div>
          <div className="timeline-list">
            {(moduleOrder.length ? moduleOrder : [{ slug: 'diagnostic', reason: 'Generate a strategy to unlock module priority.' }]).map(
              (item, index) => (
                <Link key={`${String(item.slug)}-${index}`} to={String(item.slug) === 'diagnostic' ? '/diagnostic' : `/${String(item.slug)}`} className="timeline-item">
                  <span>{index + 1}</span>
                  <div>
                    <strong>{String(item.slug).replaceAll('-', ' ')}</strong>
                    <p>{String(item.reason ?? '')}</p>
                  </div>
                  <ArrowRight size={16} />
                </Link>
              ),
            )}
          </div>
        </article>

        <article className="content-card">
          <div className="section-heading compact-heading">
            <p className="eyebrow">Premium guides</p>
            <h2>Deep dives tied to band movement</h2>
          </div>
          <div className="mini-feed">
            {guides.slice(0, 6).map((guide) => (
              <Link key={String(guide.id)} to={`/${String(guide.slug)}`} className="feed-item">
                <strong>{String(guide.title ?? '')}</strong>
                <span>{String(guide.summary ?? '')}</span>
              </Link>
            ))}
            {guides.length === 0 ? (
              <Link to="/essentials" className="feed-item">
                <strong>Start with IELTS Essentials</strong>
                <span>Load the public module structure while premium guides are being prepared.</span>
              </Link>
            ) : null}
          </div>
        </article>
      </section>

      <section className="cta-strip">
        <div>
          <p className="eyebrow">Keep the loop moving</p>
          <h2>Update the diagnostic after each scored attempt.</h2>
          <p>IELTS planning gets sharper when the evidence is recent.</p>
        </div>
        <div className="cta-actions">
          <Link to="/diagnostic" className="button button-primary">
            <TrendingUp size={17} />
            Refresh Strategy
          </Link>
          <Link to="/study-plans" className="button button-secondary">
            <NotebookTabs size={17} />
            View Plans
          </Link>
        </div>
      </section>
    </SiteChrome>
  );
};
