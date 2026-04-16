import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { playbookPlanGet } from '../lib/api';
import { SiteChrome } from '../components/content/SiteChrome';
import { useAccess } from '../lib/useAccess';

export const PlanPage: React.FC = () => {
  const { slug } = useParams();
  const { accessToken } = useAccess({ includeEffective: true });
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !slug) return;
    let active = true;
    playbookPlanGet(accessToken, slug)
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
  }, [accessToken, slug]);

  const plan = (payload?.plan ?? null) as Record<string, unknown> | null;
  const schedule = ((plan?.schedule_json ?? null) as Record<string, unknown> | null) ?? null;
  const phases = Array.isArray(schedule?.phases) ? (schedule?.phases as Array<Record<string, unknown>>) : [];
  const weeks = Array.isArray(schedule?.weeks) ? (schedule?.weeks as Array<Record<string, unknown>>) : [];

  return (
    <SiteChrome compact>
      <section className="page-hero">
        <p className="eyebrow">Plan template</p>
        <h1>{String(plan?.title ?? 'Loading plan…')}</h1>
        <p className="hero-summary">{String(plan?.summary ?? 'Structured daily and weekly guidance lives here.')}</p>
      </section>

      {error ? <p className="error-banner">{error}</p> : null}

      {plan ? (
        <>
          <section className="dashboard-grid">
            <article className="content-card">
              <p className="eyebrow">Duration</p>
              <h2>{String(plan.duration_days ?? '-')} days</h2>
              <p>Intensity: {String(plan.intensity ?? 'moderate')}</p>
            </article>
            <article className="content-card">
              <p className="eyebrow">Band window</p>
              <h2>
                {String(plan.band_min ?? '-')}-{String(plan.band_max ?? '-')}
              </h2>
              <p>Focus skill: {String(plan.focus_skill ?? 'general')}</p>
            </article>
          </section>

          <section className="section-shell">
            <div className="section-heading">
              <p className="eyebrow">Schedule</p>
              <h2>How this plan unfolds</h2>
            </div>
            <div className="data-grid">
              {phases.map((phase, index) => (
                <article key={`phase-${index}`} className="content-card">
                  <strong>{String(phase.label ?? `Phase ${index + 1}`)}</strong>
                  <p>{String(phase.goal ?? '')}</p>
                </article>
              ))}
              {weeks.map((week, index) => (
                <article key={`week-${index}`} className="content-card">
                  <strong>{String(week.label ?? `Week ${index + 1}`)}</strong>
                  <p>{Array.isArray(week.focus) ? week.focus.map((item) => String(item)).join(', ') : String(week.focus ?? '')}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="route-loading">Loading plan…</div>
      )}
    </SiteChrome>
  );
};
