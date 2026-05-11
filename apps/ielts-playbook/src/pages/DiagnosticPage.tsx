import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  Brain,
  CheckCircle2,
  ClipboardList,
  Compass,
  LoaderCircle,
  Repeat2,
  Route,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  playbookDiagnosticSynthesize,
  playbookRecommendationGenerate,
  type DiagnosticSynthesisResponse,
} from '../lib/api';
import { SiteChrome } from '../components/content/SiteChrome';
import { useAccess } from '../lib/useAccess';

type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const toRecord = (value: unknown): Row => (isRow(value) ? value : {});
const toRows = (value: unknown): Row[] => (Array.isArray(value) ? value.filter(isRow) : []);

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const scoreLabel = (value: unknown) => {
  const number = toNumber(value);
  if (number != null) return number % 1 === 0 ? String(number) : number.toFixed(1);
  const text = typeof value === 'string' ? value.trim() : '';
  return text || '-';
};

const titleLabel = (value: unknown, fallback = '-') => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return fallback;
  return text
    .replaceAll('-', ' ')
    .replaceAll('_', ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(' ');
};

const formatDate = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '-';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};

const ratioLabel = (value: unknown) => {
  const number = toNumber(value);
  return number == null ? '-' : `${Math.round(number * 100)}%`;
};

const externalBase = (value: unknown, fallback: string) => {
  const raw = String(value ?? fallback).trim();
  return (raw || fallback).replace(/\/$/, '');
};

const SIMULATOR_URL = externalBase(import.meta.env.VITE_IELTS_SIMULATOR_URL, 'https://ielts.schood.online');
const PRACTICE_URL = externalBase(import.meta.env.VITE_IELTS_PRACTICE_URL, 'https://practice.ielts.schood.online');

export const DiagnosticPage: React.FC = () => {
  const { accessToken } = useAccess({ includeEffective: true });
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [synthesis, setSynthesis] = useState<DiagnosticSynthesisResponse | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthError, setSynthError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    setLoading(true);
    setSynthesizing(true);
    // Fire the rule-based recommendation and the AI synthesis in parallel —
    // each takes ~1-2s on its own; serialising them made the page feel slow.
    // Auto-running synthesis also removes a click and lets the user see real
    // analysis straight away instead of an empty "Generate" panel.
    Promise.allSettled([
      playbookRecommendationGenerate(accessToken, {}),
      playbookDiagnosticSynthesize(accessToken),
    ]).then(([recRes, synthRes]) => {
      if (!active) return;
      if (recRes.status === 'fulfilled') {
        setPayload(recRes.value.recommendation ?? null);
      } else {
        setError(recRes.reason instanceof Error ? recRes.reason.message : 'Could not load recommendation');
      }
      if (synthRes.status === 'fulfilled') {
        setSynthesis(synthRes.value);
      } else {
        setSynthError(synthRes.reason instanceof Error ? synthRes.reason.message : 'Could not generate synthesis');
      }
      setLoading(false);
      setSynthesizing(false);
    });
    return () => {
      active = false;
    };
  }, [accessToken]);

  const runSynthesis = async () => {
    if (!accessToken) return;
    setSynthesizing(true);
    setSynthError(null);
    try {
      const res = await playbookDiagnosticSynthesize(accessToken);
      setSynthesis(res);
    } catch (err) {
      setSynthError(err instanceof Error ? err.message : 'Could not generate synthesis');
    } finally {
      setSynthesizing(false);
    }
  };

  const planning = toRecord(payload?.planning);
  const decision = toRecord(payload?.decision);
  const planTemplate = toRecord(payload?.plan_template);
  const outcomeSummary = toRecord(payload?.outcome_summary);
  const evidenceSummary = toRecord(payload?.evidence_summary);
  const simulatorEvidence = toRecord(evidenceSummary.simulator);
  const practiceEvidenceSummary = toRecord(evidenceSummary.practice);
  const practiceEvidence = toRecord(payload?.practice_evidence);
  const freshness = toRecord(practiceEvidence.freshness);
  const masterySummary = toRecord(practiceEvidence.mastery_summary ?? practiceEvidenceSummary.mastery);
  const weakQuestionTypes = toRows(masterySummary.weakest_question_types);
  const roadmapItems = toRows(practiceEvidence.roadmap_items);
  const planItems = toRows(practiceEvidence.plan_items);
  const mistakes = toRows(practiceEvidence.mistake_notebook);
  const moduleOrder = toRows(payload?.recommended_module_order);
  const bottlenecks = Array.isArray(planning.likely_bottlenecks) ? (planning.likely_bottlenecks as Array<unknown>) : [];
  const simulatorConnected = Boolean(simulatorEvidence.connected);
  const practiceConnected = Boolean(practiceEvidence.connected ?? practiceEvidenceSummary.connected);
  const evidenceSources = [
    simulatorConnected ? 'Simulator' : null,
    practiceConnected ? 'Practice' : null,
  ].filter(Boolean).join(' + ');
  const weakSkillRaw = String(planning.weakest_skill ?? '').trim().toLowerCase();
  const currentBand = scoreLabel(
    outcomeSummary.current_overall_band ?? simulatorEvidence.overall_band ?? practiceEvidenceSummary.overall_band,
  );
  const practiceLink = `${PRACTICE_URL}/dashboard?source=playbook${weakSkillRaw ? `&weak_skill=${encodeURIComponent(weakSkillRaw)}` : ''}`;

  return (
    <SiteChrome compact>
      <section className="workspace-hero">
        <div>
          <p className="eyebrow">Diagnostic output</p>
          <h1>Your current IELTS operating strategy.</h1>
          <p className="hero-summary">
            This recommendation blends onboarding profile, simulator outcomes, practice mastery, market constraints,
            and planning rules into one action order.
          </p>
          <div className="hero-actions">
            <a href={`${SIMULATOR_URL}/dashboard?source=playbook`} className="button button-secondary">
              <Activity size={17} />
              Simulator
            </a>
            <a href={practiceLink} className="button button-secondary">
              <Repeat2 size={17} />
              Practice
            </a>
          </div>
        </div>
        <aside className="diagnostic-status">
          {loading ? <LoaderCircle size={22} className="spin" /> : <CheckCircle2 size={22} />}
          <span>{loading ? 'Generating recommendation' : `Evidence: ${evidenceSources || 'Profile only'}`}</span>
        </aside>
      </section>

      {loading ? <div className="route-loading">Generating recommendation...</div> : null}
      {error ? <p className="notice-banner notice-danger">{error}</p> : null}

      <section
        style={{
          margin: '20px 0',
          padding: 22,
          borderRadius: 14,
          border: '1px solid color-mix(in srgb, #6c4ab8 22%, transparent)',
          background: 'color-mix(in srgb, #6c4ab8 4%, white)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Brain size={22} style={{ color: '#6c4ab8', flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong style={{ display: 'block', fontFamily: 'Fraunces, serif', fontSize: 19, fontWeight: 600, marginBottom: 4 }}>
                AI strategist synthesis
              </strong>
              <p style={{ margin: 0, fontSize: 14, color: '#3b352a', maxWidth: 560 }}>
                AI reads your profile, latest skills probe, and practice mastery, then produces a personalised
                narrative, risk callouts, and a weekly-hours feasibility check.
              </p>
            </div>
          </div>
          <button type="button" className="button button-primary" onClick={() => void runSynthesis()} disabled={synthesizing}>
            {synthesizing ? 'Synthesising…' : synthesis ? 'Re-run' : 'Generate'} <Sparkles size={14} style={{ marginLeft: 4 }} />
          </button>
        </div>

        {synthError ? <p style={{ color: '#9b2c2c', margin: '10px 0 0', fontSize: 13.5 }}>{synthError}</p> : null}

        {synthesizing && !synthesis ? (
          <div style={{ marginTop: 16, padding: 14, background: '#fff', border: '1px solid #e8e2d0', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10, color: '#6c4ab8' }}>
            <LoaderCircle size={18} className="spin" />
            <span style={{ fontSize: 14 }}>Reading your profile, probe, and practice signals…</span>
          </div>
        ) : null}

        {synthesis ? (
          <div style={{ marginTop: 16, display: 'grid', gap: 14 }}>
            <div style={{ padding: 14, background: '#fff', border: '1px solid #e8e2d0', borderRadius: 10 }}>
              {synthesis.narrative.split(/\n\n+/).map((para: string, i: number) => (
                <p key={i} style={{ margin: i === 0 ? '0 0 10px' : '10px 0', fontSize: 14.5, lineHeight: 1.65, color: '#1a1814' }}>
                  {para}
                </p>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <article style={{ padding: 14, background: '#fff', border: '1px solid #e8e2d0', borderRadius: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#6c4ab8', margin: '0 0 6px' }}>
                  Section priority
                </p>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
                  {synthesis.section_priority.map((s: string, i: number) => (
                    <li key={i} style={{ textTransform: 'capitalize', fontWeight: i === 0 ? 700 : 400 }}>
                      {s}
                    </li>
                  ))}
                </ol>
              </article>

              <article style={{ padding: 14, background: '#fff', border: '1px solid #e8e2d0', borderRadius: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#6c4ab8', margin: '0 0 6px' }}>
                  Weekly hours needed
                </p>
                <h3 style={{ margin: 0, fontFamily: 'Fraunces, serif', fontSize: 30 }}>
                  {synthesis.weekly_hours_needed ?? '-'}
                  <span style={{ fontSize: 14, color: '#7a7263', marginLeft: 6 }}>h/wk</span>
                </h3>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#3b352a' }}>
                  Feasibility: <strong style={{ textTransform: 'capitalize' }}>{synthesis.feasibility}</strong>
                </p>
              </article>
            </div>

            {synthesis.risks.length > 0 ? (
              <article style={{ padding: 14, background: '#fff', border: '1px solid #e8e2d0', borderRadius: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#6c4ab8', margin: '0 0 10px' }}>
                  Risk callouts
                </p>
                <div style={{ display: 'grid', gap: 8 }}>
                  {synthesis.risks.map((r: DiagnosticSynthesisResponse['risks'][number], i: number) => {
                    const color = r.severity === 'high' ? '#b6512c' : r.severity === 'medium' ? '#7b6a3d' : '#1f8a55';
                    return (
                      <div
                        key={i}
                        style={{
                          padding: 10,
                          borderLeft: `3px solid ${color}`,
                          background: `color-mix(in srgb, ${color} 6%, white)`,
                          borderRadius: 6,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <AlertTriangle size={15} color={color} style={{ flexShrink: 0, marginTop: 2 }} />
                          <div style={{ flex: 1 }}>
                            <strong style={{ fontSize: 13.5, color: '#1a1814' }}>{r.risk}</strong>
                            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#3b352a', lineHeight: 1.5 }}>
                              <em style={{ color, fontWeight: 600, fontStyle: 'normal' }}>Mitigation:</em> {r.mitigation}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            ) : null}

            <p style={{ margin: 0, fontSize: 11, color: '#7a7263' }}>
              Generated {new Date(synthesis.generated_at).toLocaleString()}
            </p>
          </div>
        ) : null}
      </section>

      {payload ? (
        <>
          <section className="dashboard-grid">
            <article className="metric-card">
              <span className="card-icon">
                <Compass size={18} />
              </span>
              <p className="eyebrow">Decision</p>
              <h2>{titleLabel(decision.selected_track, 'General')}</h2>
              <p>Delivery: {titleLabel(decision.recommended_delivery_mode, 'Computer')}</p>
              <div className="pill-row">
                <span className="pill">OSR: {String(decision.one_skill_retake_eligible ?? false)}</span>
              </div>
            </article>

            <article className="metric-card metric-card-accent">
              <span className="card-icon">
                <Route size={18} />
              </span>
              <p className="eyebrow">Planning</p>
              <h2>{titleLabel(planning.deadline_bucket, 'Improvement')}</h2>
              <p>Weakest skill: {titleLabel(planning.weakest_skill)}</p>
              <p>{String(planning.realistic_timeline ?? '')}</p>
            </article>

            <article className="metric-card">
              <span className="card-icon">
                <BookOpenCheck size={18} />
              </span>
              <p className="eyebrow">Evidence blend</p>
              <h2>Band {currentBand}</h2>
              <p>{evidenceSources || 'Waiting for simulator or practice evidence'}.</p>
              <div className="pill-row">
                <span className="pill">Mock: {formatDate(simulatorEvidence.latest_computed_at)}</span>
                <span className="pill">Practice: {formatDate(practiceEvidenceSummary.latest_practice_at ?? freshness.latest_practice_at)}</span>
              </div>
            </article>

            <article className="metric-card">
              <span className="card-icon">
                <ClipboardList size={18} />
              </span>
              <p className="eyebrow">Template</p>
              <h2>{String(planTemplate.title ?? 'No plan template selected')}</h2>
              <p>{String(planTemplate.summary ?? '')}</p>
              {planTemplate.slug ? (
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
                {(moduleOrder.length ? moduleOrder : [{ slug: 'study-plans', reason: 'Generate more evidence to sharpen module order.' }]).map(
                  (item, index) => (
                    <Link key={`${String(item.slug)}-${index}`} to={`/${String(item.slug)}`} className="timeline-item">
                      <span>{index + 1}</span>
                      <div>
                        <strong>{titleLabel(item.slug)}</strong>
                        <p>{String(item.reason ?? '')}</p>
                      </div>
                      <ArrowRight size={16} />
                    </Link>
                  ),
                )}
              </div>
            </article>

            <article className="content-card evidence-panel">
              <div className="section-heading compact-heading">
                <p className="eyebrow">Practice focus</p>
                <h2>Signals from IELTS Practice</h2>
              </div>
              <div className="evidence-list">
                {(weakQuestionTypes.length ? weakQuestionTypes.slice(0, 5) : [{ section_type: 'practice', question_type: 'No weak question types yet', mastery_status: practiceConnected ? 'steady' : 'waiting' }]).map(
                  (item, index) => (
                    <div key={`${String(item.question_type)}-${index}`} className="evidence-item">
                      <div>
                        <strong>{titleLabel(item.question_type, 'Practice signal')}</strong>
                        <span>{titleLabel(item.section_type)} · {titleLabel(item.mastery_status, 'Unscored')}</span>
                      </div>
                      <em>{item.mastery_level != null ? ratioLabel(item.mastery_level) : '-'}</em>
                    </div>
                  ),
                )}
              </div>
              <div className="inline-actions">
                <a href={practiceLink} className="button button-primary">
                  <Repeat2 size={17} />
                  Open targeted practice
                </a>
              </div>
            </article>
          </section>

          <section className="workspace-grid supporting-grid">
            <article className="content-card">
              <div className="section-heading compact-heading">
                <p className="eyebrow">Roadmap</p>
                <h2>Practice work queued next</h2>
              </div>
              <div className="mini-feed">
                {(roadmapItems.length ? roadmapItems.slice(0, 4) : planItems.slice(0, 4)).map((item, index) => (
                  <div key={`${String(item.id ?? item.title)}-${index}`} className="feed-item">
                    <strong>{String(item.title ?? item.rationale ?? 'Practice task')}</strong>
                    <span>{titleLabel(item.section_type)} · {titleLabel(item.status, 'Queued')}</span>
                  </div>
                ))}
                {roadmapItems.length === 0 && planItems.length === 0 ? (
                  <div className="feed-item">
                    <strong>Practice roadmap pending</strong>
                    <span>Complete a practice lab to create targeted tasks.</span>
                  </div>
                ) : null}
              </div>
            </article>

            <article className="content-card">
              <div className="section-heading compact-heading">
                <p className="eyebrow">Mistake notebook</p>
                <h2>Patterns to review</h2>
              </div>
              <div className="mini-feed">
                {(mistakes.length ? mistakes.slice(0, 4) : [{ mistake_pattern: 'No active mistake patterns yet.', status: 'clean' }]).map(
                  (item, index) => (
                    <div key={`${String(item.mistake_pattern)}-${index}`} className="feed-item">
                      <strong>{String(item.mistake_pattern ?? item.trap_type ?? 'Mistake pattern')}</strong>
                      <span>{titleLabel(item.section_type)} · {titleLabel(item.status, 'Tracked')}</span>
                    </div>
                  ),
                )}
              </div>
            </article>
          </section>

          <section className="workspace-grid">
            <article className="content-card risk-panel wide-card">
              <div className="section-heading compact-heading">
                <p className="eyebrow">Likely bottlenecks</p>
                <h2>What may still block progress</h2>
              </div>
              <ul className="plain-list">
                {(bottlenecks.length ? bottlenecks : ['Generate more scored evidence to reveal blockers.']).map((item, index) => (
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
