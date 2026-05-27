import { useEffect, useState } from 'react';
import { ArrowRight, Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { satPlaybookCatalogGet, satPlaybookDashboardGet, type SatPlaybookCatalog } from '../lib/api';
import { PlaybookTopNav } from '../components/PlaybookTopNav';
import { useAccess } from '../lib/useAccess';

type Json = Record<string, unknown>;

export const DashboardPage = () => {
  const { accessToken } = useAccess({ includeEffective: true });
  const [dashboard, setDashboard] = useState<Json | null>(null);
  const [catalog, setCatalog] = useState<SatPlaybookCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    Promise.allSettled([satPlaybookDashboardGet(accessToken), satPlaybookCatalogGet()]).then(([dash, cat]) => {
      if (!active) return;
      if (dash.status === 'fulfilled') setDashboard(dash.value);
      else setError(dash.reason instanceof Error ? dash.reason.message : 'Dashboard failed');
      if (cat.status === 'fulfilled') setCatalog(cat.value);
    });
    return () => {
      active = false;
    };
  }, [accessToken]);

  const profile = (dashboard?.profile ?? {}) as Json;
  const recommendation = (dashboard?.recommendation ?? null) as Json | null;
  const plans = Array.isArray(dashboard?.plans) ? (dashboard?.plans as Json[]) : [];
  const target = profile.target_total_score ? Number(profile.target_total_score) : null;
  const current = profile.current_score_or_estimate ? Number(profile.current_score_or_estimate) : null;

  return (
    <div className="app-shell">
      <PlaybookTopNav />
      <main className="workspace">
        <section className="page-header">
          <div>
            <p className="eyebrow">Schood SAT Playbook</p>
            <h1>Your SAT operating plan</h1>
            <p>Diagnostics, strategy modules, and a study plan tuned to your score goal and test date.</p>
          </div>
          <div className="hero-actions">
            <Link to="/diagnostic" className="btn solid">
              <Compass size={16} /> Run diagnostic
            </Link>
            <Link to="/onboarding" className="btn ghost">Edit goals</Link>
          </div>
        </section>

        {error ? <p className="alert error">{error}</p> : null}

        <section className="kpi-grid">
          <article className="kpi-card">
            <p className="eyebrow">Target</p>
            <h2>{target ?? '—'}</h2>
            <p>Goal total score (400–1600)</p>
          </article>
          <article className="kpi-card">
            <p className="eyebrow">Current estimate</p>
            <h2>{current ?? '—'}</h2>
            <p>{current && target ? `${Math.max(0, target - current)} points to go` : 'Set in onboarding'}</p>
          </article>
          <article className="kpi-card">
            <p className="eyebrow">Weakest section</p>
            <h2 style={{ textTransform: 'capitalize', fontSize: 22 }}>
              {String(profile.weakest_section ?? '—').replace('_', ' & ')}
            </h2>
            <p>Prioritised in your module order</p>
          </article>
        </section>

        {recommendation ? (
          <section className="panel" style={{ marginTop: 16 }}>
            <p className="eyebrow">Latest recommendation</p>
            <h2 style={{ textTransform: 'capitalize' }}>
              {String(((recommendation.recommendation_json as Json | undefined)?.decision as Json | undefined)?.selected_track ?? 'balanced')} track
            </h2>
            <Link to="/diagnostic" className="nav-link" style={{ marginTop: 8 }}>
              See full diagnostic <ArrowRight size={15} />
            </Link>
          </section>
        ) : null}

        {plans.length > 0 ? (
          <section className="panel" style={{ marginTop: 16 }}>
            <p className="eyebrow">Study plans</p>
            <div className="plan-list">
              {plans.map((plan) => (
                <Link key={String(plan.id)} to={`/plans/${String(plan.slug)}`} className="feature-card">
                  <h2>{String(plan.title)}</h2>
                  <p>{String(plan.summary)}</p>
                  <span className="chip">{String(plan.duration_days)} days · {String(plan.intensity)}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {catalog && catalog.modules.length > 0 ? (
          <section className="panel" style={{ marginTop: 16 }}>
            <p className="eyebrow">Strategy modules</p>
            <div className="feature-grid">
              {catalog.modules.map((mod) => (
                <Link key={mod.id} to={`/${mod.slug}`} className="feature-card">
                  <h2>{mod.title}</h2>
                  <p>{mod.summary}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
};
