import { ArrowRight, Compass, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shell } from '../components/TopNav';
import { EmptyState, ErrorPanel, PracticeAccess, Skeleton, formatDate, useErrorText } from '../components/ui';
import { humanize, useDynamicT, useT } from '../i18n';
import { useI18n } from '../../../service-i18n/src/i18n.tsx';
import type { Json } from '../lib/api';
import { usePlaybook } from '../lib/context';
import { useCatalog } from './LandingPage';

const rec = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const rows = (v: unknown): Json[] => (Array.isArray(v) ? v.filter((x): x is Json => !!x && typeof x === 'object' && !Array.isArray(x)) : []);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const DiagnosticPage = () => {
  const t = useT();
  const dt = useDynamicT();
  const { locale } = useI18n();
  const errorText = useErrorText();
  const { config, api, access } = usePlaybook();
  const token = access.token!;
  const { catalog } = useCatalog();
  const [snapshot, setSnapshot] = useState<Json | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [narrative, setNarrative] = useState<Json | null>(null);
  const [narrating, setNarrating] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadError(null);
    // Reading the diagnostic never generates one; only "Run diagnostic" does.
    api.diagnostic(token)
      .then((res) => {
        if (!active) return;
        setSnapshot(res.snapshot ?? null);
        const cached = rec(rec(res.snapshot?.metadata).ai_narrative);
        setNarrative(cached.text ? cached : null);
      })
      .catch((error) => active && setLoadError(errorText(error)));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, token, attempt]);

  const run = async () => {
    setRunning(true);
    setNotice(null);
    try {
      const res = await api.runDiagnostic(token);
      setSnapshot(res.snapshot);
      setNarrative(null);
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setRunning(false);
    }
  };

  const writeNarrative = async () => {
    setNarrating(true);
    setNotice(null);
    try {
      const res = await api.narrative(token);
      if (res.ok && res.narrative) setNarrative(res.narrative);
      else setNotice(t('diag.aiUnavailable'));
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setNarrating(false);
    }
  };

  const titleOf = (slug: string) =>
    [...(catalog?.modules ?? []), ...(catalog?.premium_guides ?? [])].find((p) => p.slug === slug)?.title ?? humanize(slug);
  const published = (slug: string) => !catalog || [...catalog.modules, ...catalog.premium_guides].some((p) => p.slug === slug);
  const sectionName = (s: unknown) => dt(`section.${String(s)}`, humanize(s));
  const domainName = (d: unknown) => dt(`domain.${String(d)}`, humanize(d));

  if (loadError) return <Shell><ErrorPanel message={loadError} onRetry={() => setAttempt((n) => n + 1)} /></Shell>;

  const result = rec(snapshot?.recommendation_json);
  const isCurrentEngine = typeof result.version === 'string' && result.version.includes('diagnostic-v2');
  const current = rec(result.current);
  const target = rec(result.target);
  const gap = rec(result.gap);
  const quality = rec(result.data_quality);
  const bottlenecks = rows(result.bottlenecks);
  const untested = rows(result.untested);
  const priorities = rows(result.module_priorities);
  const plan = rec(result.plan_suggestion);
  const weeks = rows(plan.weeks);
  const sections = rows(current.sections);

  return (
    <Shell>
      <section className="page-header">
        <div>
          <p className="eyebrow">{t('diag.eyebrow')}</p>
          <h1>{t('diag.title', { exam: config.examName })}</h1>
          <p>{t('diag.lead')}</p>
        </div>
        <div className="hero-actions">
          <button type="button" className="btn solid" onClick={() => void run()} disabled={running}>
            <RefreshCw size={16} aria-hidden="true" className={running ? 'spin' : undefined} /> {running ? t('diag.running') : t('diag.run')}
          </button>
          <Link to="/onboarding" className="btn ghost">{t('diag.editGoals')}</Link>
        </div>
      </section>
      {notice ? <p className="alert" role="status">{notice}</p> : null}

      {snapshot === undefined ? <><Skeleton lines={3} /><Skeleton lines={6} /></> : !snapshot || !isCurrentEngine ? (
        <EmptyState title={t('diag.emptyTitle')} body={t('diag.emptyBody', { exam: config.examName })}>
          <button type="button" className="btn solid" onClick={() => void run()} disabled={running}><Compass size={16} aria-hidden="true" /> {t('diag.run')}</button>
          <Link to="/onboarding" className="btn ghost">{t('diag.setGoals')}</Link>
          <a href={config.simulator.url} className="btn ghost">{t('landing.takeMock')}</a>
        </EmptyState>
      ) : (
        <>
          <p className="muted-note">
            {t('diag.generated', { date: formatDate(result.generated_at, locale) })} · {t(`diag.confidence.${String(quality.confidence ?? 'low')}` as 'diag.confidence.low')} ·{' '}
            {t('diag.evidence', { sessions: num(quality.simulator_sessions) ?? 0, attempts: num(quality.practice_attempts) ?? 0 })}
          </p>

          <section className="kpi-grid">
            <article className="kpi-card">
              <span>{t('diag.current')}</span>
              <strong>{num(current.total) ?? '—'}</strong>
              <p>{current.total == null ? t('diag.noScore') : dt(`source.${String(current.total_source)}`, String(current.total_source ?? ''))}</p>
            </article>
            <article className="kpi-card">
              <span>{t('diag.target')}</span>
              <strong>{num(target.total) ?? '—'}</strong>
              <p>{target.split === 'even_split' ? t('diag.evenSplit') : target.split === 'explicit' ? t('diag.explicitSplit') : t('diag.noTarget')}</p>
            </article>
            <article className="kpi-card">
              <span>{t('diag.gap')}</span>
              <strong>{num(gap.total) != null ? (Number(gap.total) > 0 ? `+${gap.total}` : String(gap.total)) : '—'}</strong>
              <p>{num(gap.total) == null ? t('diag.gapUnknown') : Number(gap.total) <= 0 ? t('diag.atTarget') : t('diag.pointsToGo')}</p>
            </article>
          </section>

          {sections.length ? (
            <section className="panel">
              <h2>{t('diag.sections')}</h2>
              <div className="table-scroll" role="region" aria-label={t('diag.sections')} tabIndex={0}>
                <table className="data-table">
                  <thead><tr><th scope="col">{t('diag.section')}</th><th scope="col">{t('diag.current')}</th><th scope="col">{t('diag.target')}</th><th scope="col">{t('diag.gap')}</th><th scope="col">{t('diag.sourceCol')}</th></tr></thead>
                  <tbody>
                    {sections.map((s) => (
                      <tr key={String(s.section)}>
                        <th scope="row">{sectionName(s.section)}</th>
                        <td>{num(s.current) ?? '—'}</td>
                        <td>{num(s.target) ?? '—'}</td>
                        <td>{num(s.gap) ?? '—'}</td>
                        <td>{s.current_source ? dt(`source.${String(s.current_source)}`, String(s.current_source)) : t('diag.noData')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="panel">
            <h2>{t('diag.bottlenecks')}</h2>
            {bottlenecks.length === 0 ? <p>{t('diag.noBottlenecks')}</p> : (
              <ol className="bottleneck-list">
                {bottlenecks.map((b, i) => {
                  const points = num(b.estimated_impact);
                  const evidence = rows(b.evidence);
                  return (
                    <li key={String(b.key)} className={`bottleneck severity-${String(b.severity)}`}>
                      <div className="bottleneck-head">
                        <span className="rank">{i + 1}</span>
                        <div>
                          <h3>{b.kind === 'domain' ? domainName(b.domain) : sectionName(b.section)}</h3>
                          <p className="muted-note">{b.kind === 'domain' ? sectionName(b.section) : t('diag.wholeSection')}</p>
                        </div>
                        {points != null ? <span className="impact">{t('diag.points', { points })}</span> : null}
                      </div>
                      <p>
                        {b.kind === 'domain'
                          ? t('diag.domainLine', { current: num(b.current) ?? 0, target: num(b.target) ?? 0 })
                          : t('diag.sectionLine', { current: num(b.current) ?? 0, target: num(b.target) ?? 0 })}
                      </p>
                      <p className="muted-note">{t(b.impact_basis === 'domain_accuracy_gap' ? 'diag.basis.domain' : 'diag.basis.section')}</p>
                      {evidence.length ? (
                        <ul className="evidence">
                          {evidence.map((e, j) => (
                            <li key={j}>{dt(`evidence.${String(e.metric)}`, humanize(e.metric), { value: String(e.value ?? '—'), attempts: Number(rec(e.detail).attempts ?? 0) })} <span className="chip neutral">{dt(`source.${String(e.source)}`, String(e.source))}</span></li>
                          ))}
                        </ul>
                      ) : null}
                      <div className="hero-actions">
                        {(Array.isArray(b.module_slugs) ? b.module_slugs : []).map((slug) => (
                          published(String(slug))
                            ? <Link key={String(slug)} to={`/${String(slug)}`} className="btn ghost compact">{titleOf(String(slug))} <ArrowRight size={14} aria-hidden="true" /></Link>
                            : <span key={String(slug)} className="chip neutral">{titleOf(String(slug))} · {t('diag.comingSoon')}</span>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {bottlenecks.length ? <PracticeAccess source="diagnostic" /> : null}
          </section>

          {untested.length ? (
            <section className="panel">
              <h2>{t('diag.untested')}</h2>
              <ul className="plain-list">
                {untested.map((u, i) => (
                  <li key={i}>
                    <strong>{u.domain ? domainName(u.domain) : sectionName(u.section)}</strong>
                    {' — '}{dt(`diag.untested.${String(u.reason)}`, '', { exam: config.examName })}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="panel">
            <h2>{t('diag.priorities')}</h2>
            <ol className="priority-list">
              {priorities.map((p) => {
                const slug = String(p.slug);
                const params = rec(p.params);
                const label = dt(`reason.${String(p.reason)}`, '', {
                  section: sectionName(params.section),
                  domain: params.domain ? domainName(params.domain) : '',
                  points: Number(params.points ?? 0),
                  days: Number(params.days ?? 0),
                  current: Number(params.current ?? 0),
                  target: Number(params.target ?? 0),
                  score: Number(params.score ?? 0),
                });
                return (
                  <li key={slug}>
                    {published(slug) ? <Link to={`/${slug}`}>{titleOf(slug)}</Link> : <span>{titleOf(slug)} <span className="chip neutral">{t('diag.comingSoon')}</span></span>}
                    {p.kind === 'guide' ? <span className="chip premium">{t('premium.badge')}</span> : null}
                    {label ? <small>{label}</small> : null}
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="panel">
            <h2>{t('diag.plan')}</h2>
            <p>
              <strong>{String(plan.template_title ?? humanize(plan.template_slug))}</strong>{' — '}
              {dt(`planReason.${String(plan.reason)}`, '', { weeks: num(plan.weeks_until_test) ?? 0 })}
            </p>
            {num(plan.days_until_test) != null ? <p className="muted-note">{t('diag.daysLeft', { days: Number(plan.days_until_test) })}</p> : <p className="muted-note">{t('diag.noDate')}</p>}
            {weeks.length ? (
              <div className="table-scroll" role="region" aria-label={t('diag.plan')} tabIndex={0}>
                <table className="data-table">
                  <thead><tr><th scope="col">{t('plans.week')}</th><th scope="col">{t('plans.dates')}</th><th scope="col">{t('diag.focusModules')}</th></tr></thead>
                  <tbody>
                    {weeks.map((w) => (
                      <tr key={String(w.week)}>
                        <th scope="row">{String(w.week)}</th>
                        <td>{formatDate(w.starts_on, locale)} – {formatDate(w.ends_on, locale)}</td>
                        <td>
                          {(Array.isArray(w.modules) ? w.modules : []).map((slug) => titleOf(String(slug))).join(', ') || t('diag.reviewWeek')}
                          {w.template_week_label ? <small className="block-note">{String(w.template_week_label)}</small> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="hero-actions">
              {plan.template_published ? (
                <Link to={`/plans/${String(plan.template_slug)}`} className="btn solid">{t('diag.openPlan')} <ArrowRight size={15} aria-hidden="true" /></Link>
              ) : <span className="muted-note">{t('diag.planNotPublished')}</span>}
              <Link to="/plans" className="btn ghost">{t('diag.allPlans')}</Link>
            </div>
          </section>

          <section className="panel ai-panel">
            <h2><Sparkles size={18} aria-hidden="true" /> {t('diag.aiTitle')}</h2>
            <p className="ai-label">{t('diag.aiLabel')}</p>
            {narrative ? (
              <>
                <p>{String(narrative.text)}</p>
                {Array.isArray(narrative.this_week) && narrative.this_week.length ? (
                  <ul>{(narrative.this_week as unknown[]).map((a, i) => <li key={i}>{String(a)}</li>)}</ul>
                ) : null}
              </>
            ) : (
              <button type="button" className="btn ghost" onClick={() => void writeNarrative()} disabled={narrating}>
                <Sparkles size={15} aria-hidden="true" /> {narrating ? t('diag.aiWriting') : t('diag.aiWrite')}
              </button>
            )}
          </section>
        </>
      )}
    </Shell>
  );
};
