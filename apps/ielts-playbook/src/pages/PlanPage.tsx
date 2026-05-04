import React, { useEffect, useState } from 'react';
import { CalendarDays, Flame, Gauge, Layers3 } from 'lucide-react';
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
      <section className="workspace-hero">
        <div>
          <p className="eyebrow">Plan template</p>
          <h1>{String(plan?.title ?? 'Loading plan...')}</h1>
          <p className="hero-summary">{String(plan?.summary ?? 'Structured daily and weekly guidance lives here.')}</p>
        </div>
        <aside className="plan-badge">
          <CalendarDays size={22} />
          <strong>{String(plan?.duration_days ?? '-')} days</strong>
          <span>{String(plan?.intensity ?? 'moderate')} intensity</span>
        </aside>
      </section>

      {error ? <p className="notice-banner notice-danger">{error}</p> : null}

      {plan ? (
        <>
          <section className="dashboard-grid">
            <article className="metric-card">
              <span className="card-icon">
                <CalendarDays size={18} />
              </span>
              <p className="eyebrow">Duration</p>
              <h2>{String(plan.duration_days ?? '-')} days</h2>
              <p>Intensity: {String(plan.intensity ?? 'moderate')}</p>
            </article>
            <article className="metric-card metric-card-accent">
              <span className="card-icon">
                <Gauge size={18} />
              </span>
              <p className="eyebrow">Band window</p>
              <h2>
                {String(plan.band_min ?? '-')}-{String(plan.band_max ?? '-')}
              </h2>
              <p>Focus skill: {String(plan.focus_skill ?? 'general')}</p>
            </article>
            <article className="metric-card">
              <span className="card-icon">
                <Flame size={18} />
              </span>
              <p className="eyebrow">Routine</p>
              <h2>{String(plan.plan_type ?? 'balanced')}</h2>
              <p>Use this plan as a rhythm, then refresh the diagnostic after new evidence.</p>
            </article>
          </section>

          <section className="section-band">
            <div className="section-heading">
              <p className="eyebrow">Schedule</p>
              <h2>How this plan unfolds.</h2>
              <p>Phases define the purpose of the work. Weeks translate that purpose into a focus sequence.</p>
            </div>
            <div className="plan-timeline">
              {phases.map((phase, index) => (
                <article key={`phase-${index}`} className="plan-step">
                  <span>
                    <Layers3 size={17} />
                    Phase {index + 1}
                  </span>
                  <strong>{String(phase.label ?? `Phase ${index + 1}`)}</strong>
                  <p>{String(phase.goal ?? '')}</p>
                </article>
              ))}
              {weeks.map((week, index) => (
                <article key={`week-${index}`} className="plan-step">
                  <span>
                    <CalendarDays size={17} />
                    Week {index + 1}
                  </span>
                  <strong>{String(week.label ?? `Week ${index + 1}`)}</strong>
                  <p>{Array.isArray(week.focus) ? week.focus.map((item) => String(item)).join(', ') : String(week.focus ?? '')}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="route-loading">Loading plan...</div>
      )}
    </SiteChrome>
  );
};
