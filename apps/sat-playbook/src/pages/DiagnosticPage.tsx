import { useEffect, useState } from 'react';
import { ArrowRight, Compass, Route } from 'lucide-react';
import { Link } from 'react-router-dom';
import { satPlaybookRecommendationGenerate } from '../lib/api';
import { PlaybookTopNav } from '../components/PlaybookTopNav';
import { useAccess } from '../lib/useAccess';

type Json = Record<string, unknown>;
const rec = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const rows = (v: unknown): Json[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Json[]) : []);
const title = (v: unknown, fallback = '—') => {
  const t = typeof v === 'string' ? v.trim() : '';
  if (!t) return fallback;
  return t.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

export const DiagnosticPage = () => {
  const { accessToken } = useAccess({ includeEffective: true });
  const [payload, setPayload] = useState<Json | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    setLoading(true);
    satPlaybookRecommendationGenerate(accessToken, {})
      .then((data) => active && setPayload((data.recommendation ?? null) as Json | null))
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [accessToken]);

  const decision = rec(payload?.decision);
  const planning = rec(payload?.planning);
  const planTemplate = rec(payload?.plan_template);
  const outcome = rec(payload?.outcome_summary);
  const moduleOrder = rows(payload?.recommended_module_order);

  return (
    <div className="app-shell">
      <PlaybookTopNav />
      <main className="workspace">
        <section className="page-header">
          <div>
            <p className="eyebrow">Diagnostic output</p>
            <h1>Your current SAT strategy</h1>
            <p>Blends your profile, simulator outcomes, and planning rules into one action order.</p>
          </div>
          <div className="hero-actions">
            <a href="https://sat.schood.online/dashboard?source=playbook" className="btn ghost">Simulator</a>
            <a href="https://practice.sat.schood.online/dashboard?source=playbook" className="btn ghost">Practice</a>
          </div>
        </section>

        {loading ? <div className="route-loading">Generating recommendation…</div> : null}
        {error ? <p className="alert error">{error}</p> : null}

        {payload ? (
          <>
            <section className="kpi-grid">
              <article className="kpi-card">
                <span className="chip"><Compass size={14} /> Decision</span>
                <h2 style={{ textTransform: 'capitalize' }}>{title(decision.selected_track, 'Balanced')}</h2>
                <p>Delivery: {title(decision.recommended_delivery_mode, 'Digital Bluebook')}</p>
              </article>
              <article className="kpi-card">
                <span className="chip"><Route size={14} /> Planning</span>
                <h2 style={{ textTransform: 'capitalize' }}>{title(planning.deadline_bucket, 'Improvement')}</h2>
                <p>Weakest: {title(planning.weakest_section)}</p>
                <p>{String(planning.realistic_timeline ?? '')}</p>
              </article>
              <article className="kpi-card">
                <p className="eyebrow">Score</p>
                <h2>{outcome.current_total_score != null ? String(outcome.current_total_score) : '—'} → {String(outcome.target_total_score ?? '—')}</h2>
                <p>{outcome.score_gap != null ? `${outcome.score_gap} points to target` : 'Set a current score'}</p>
              </article>
            </section>

            {planTemplate.slug ? (
              <section className="panel" style={{ marginTop: 16 }}>
                <p className="eyebrow">Recommended plan</p>
                <h2>{String(planTemplate.title ?? '')}</h2>
                <p>{String(planTemplate.summary ?? '')}</p>
                <Link to={`/plans/${String(planTemplate.slug)}`} className="nav-link" style={{ marginTop: 8 }}>
                  Open plan <ArrowRight size={15} />
                </Link>
              </section>
            ) : null}

            <section className="panel" style={{ marginTop: 16 }}>
              <p className="eyebrow">Module priority</p>
              <div style={{ display: 'grid', gap: 8 }}>
                {(moduleOrder.length ? moduleOrder : [{ slug: 'format-overview', reason: 'Start here.' }]).map((item, i) => (
                  <Link key={`${String(item.slug)}-${i}`} to={`/${String(item.slug)}`} className="nav-link">
                    <strong style={{ minWidth: 22 }}>{i + 1}</strong>
                    <span>{title(item.slug)} — {String(item.reason ?? '')}</span>
                    <ArrowRight size={15} />
                  </Link>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
};
