import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { satPlaybookPlanGet } from '../lib/api';
import { PlaybookTopNav } from '../components/PlaybookTopNav';
import { useAccess } from '../lib/useAccess';

type Json = Record<string, unknown>;

export const PlanPage = () => {
  const { slug } = useParams();
  const { accessToken } = useAccess({ includeEffective: true });
  const [payload, setPayload] = useState<Json | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !slug) return;
    let active = true;
    satPlaybookPlanGet(accessToken, slug)
      .then((data) => active && setPayload(data as unknown as Json))
      .catch((err: Error) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, [accessToken, slug]);

  const plan = (payload?.plan ?? null) as Json | null;
  const schedule = ((plan?.schedule_json ?? null) as Json | null) ?? null;
  const phases = Array.isArray(schedule?.phases) ? (schedule?.phases as Json[]) : [];
  const weeks = Array.isArray(schedule?.weeks) ? (schedule?.weeks as Json[]) : [];

  return (
    <div className="app-shell">
      <PlaybookTopNav />
      <main className="workspace">
        <section className="page-header">
          <div>
            <p className="eyebrow">Plan template</p>
            <h1>{String(plan?.title ?? 'Loading plan…')}</h1>
            <p>{String(plan?.summary ?? 'Structured weekly guidance.')}</p>
          </div>
          <div className="hero-actions">
            <span className="chip"><CalendarDays size={14} /> {String(plan?.duration_days ?? '—')} days</span>
          </div>
        </section>

        {error ? <p className="alert error">{error}</p> : null}

        {plan ? (
          <>
            <section className="kpi-grid">
              <article className="kpi-card">
                <p className="eyebrow">Duration</p>
                <h2>{String(plan.duration_days ?? '—')} days</h2>
                <p>Intensity: {String(plan.intensity ?? 'moderate')}</p>
              </article>
              <article className="kpi-card">
                <p className="eyebrow">Score window</p>
                <h2>{String(plan.score_min ?? '—')}–{String(plan.score_max ?? '—')}</h2>
                <p>Focus: {String(plan.focus_section ?? 'both').replace('_', ' & ')}</p>
              </article>
              <article className="kpi-card">
                <p className="eyebrow">Type</p>
                <h2 style={{ textTransform: 'capitalize' }}>{String(plan.plan_type ?? 'balanced')}</h2>
                <p>Refresh after new simulator evidence.</p>
              </article>
            </section>

            <section className="panel" style={{ marginTop: 16 }}>
              <p className="eyebrow">Schedule</p>
              <div style={{ display: 'grid', gap: 10 }}>
                {phases.map((phase, i) => (
                  <article key={`phase-${i}`} className="feature-card">
                    <span className="chip">Phase {i + 1}</span>
                    <h2>{String(phase.label ?? `Phase ${i + 1}`)}</h2>
                    <p>{String(phase.goal ?? '')}</p>
                  </article>
                ))}
                {weeks.map((week, i) => (
                  <article key={`week-${i}`} className="feature-card">
                    <span className="chip">Week {i + 1}</span>
                    <h2>{String(week.label ?? `Week ${i + 1}`)}</h2>
                    <p>{Array.isArray(week.focus) ? week.focus.map((x) => String(x)).join(', ') : String(week.focus ?? '')}</p>
                  </article>
                ))}
                {phases.length === 0 && weeks.length === 0 ? (
                  <p>This plan's schedule is being authored. Check back soon.</p>
                ) : null}
              </div>
            </section>
          </>
        ) : (
          <div className="route-loading">Loading plan…</div>
        )}
      </main>
    </div>
  );
};
