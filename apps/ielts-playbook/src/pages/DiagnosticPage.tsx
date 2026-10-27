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
import { Link, useLocation } from 'react-router-dom';
import {
  playbookDiagnosticSynthesize,
  playbookRecommendationGenerate,
  type DiagnosticSynthesisResponse,
} from '../lib/api';
import { SiteChrome } from '../components/content/SiteChrome';
import { MarketGuidePanel } from '../components/MarketGuidePanel';
import { enumLabel, useLocale, useT } from '../i18n';
import { readSimulatorContext } from '../lib/simulatorContext';
import { useAccess } from '../lib/useAccess';
import { scoreLabel, slugTitle } from './DashboardPage';

type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const toRecord = (value: unknown): Row => (isRow(value) ? value : {});
const toRows = (value: unknown): Row[] => (Array.isArray(value) ? value.filter(isRow) : []);

const ratioLabel = (value: unknown) => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : '-';
};

const externalBase = (value: unknown, fallback: string) => {
  const raw = String(value ?? fallback).trim();
  return (raw || fallback).replace(/\/$/, '');
};

const SIMULATOR_URL = externalBase(import.meta.env.VITE_IELTS_SIMULATOR_URL, 'https://ielts.schood.online');
const PRACTICE_URL = externalBase(import.meta.env.VITE_IELTS_PRACTICE_URL, 'https://practice.ielts.schood.online');

export const DiagnosticPage: React.FC = () => {
  const t = useT();
  const { date } = useLocale();
  const location = useLocation();
  const { accessToken } = useAccess({ includeEffective: true });
  const [simulator] = useState(() => readSimulatorContext(location.search));
  const [payload, setPayload] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [synthesis, setSynthesis] = useState<DiagnosticSynthesisResponse | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthError, setSynthError] = useState<string | null>(null);

  const formatDate = (value: unknown) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return '-';
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? text : date(parsed, { dateStyle: 'medium' });
  };

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    setLoading(true);
    setSynthesizing(true);
    // Rule-based recommendation and AI synthesis run in parallel. A learner
    // coming from a finished simulator test gets the plan anchored to that result.
    Promise.allSettled([
      playbookRecommendationGenerate(accessToken, simulator.sessionId ? { session_id: simulator.sessionId } : {}),
      playbookDiagnosticSynthesize(accessToken),
    ]).then(([recRes, synthRes]) => {
      if (!active) return;
      if (recRes.status === 'fulfilled') setPayload(recRes.value.recommendation ?? null);
      else setError(t('diagnostic.loadError'));
      if (synthRes.status === 'fulfilled') setSynthesis(synthRes.value);
      else setSynthError(t('diagnostic.synthError'));
      setLoading(false);
      setSynthesizing(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, simulator.sessionId]);

  const runSynthesis = async () => {
    if (!accessToken) return;
    setSynthesizing(true);
    setSynthError(null);
    try {
      setSynthesis(await playbookDiagnosticSynthesize(accessToken));
    } catch {
      setSynthError(t('diagnostic.synthError'));
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
  const bottlenecks = Array.isArray(planning.likely_bottlenecks) ? (planning.likely_bottlenecks as unknown[]) : [];
  const anchor = toRecord(payload?.simulator_anchor);
  const profile = toRecord(payload?.profile);
  const simulatorConnected = Boolean(simulatorEvidence.connected);
  const practiceConnected = Boolean(practiceEvidence.connected ?? practiceEvidenceSummary.connected);
  const evidenceSources = [simulatorConnected ? t('service.simulator') : null, practiceConnected ? t('service.practice') : null]
    .filter(Boolean)
    .join(' + ');
  const weakSkillRaw = String(planning.weakest_skill ?? '').trim().toLowerCase();
  const currentBand = scoreLabel(
    outcomeSummary.current_overall_band ?? simulatorEvidence.overall_band ?? practiceEvidenceSummary.overall_band,
  );
  const practiceParams = new URLSearchParams({ source: 'playbook' });
  if (weakSkillRaw) practiceParams.set('weak_skill', weakSkillRaw);
  if (simulator.sessionId) practiceParams.set('session_id', simulator.sessionId);
  const practiceLink = `${PRACTICE_URL}/dashboard?${practiceParams.toString()}`;

  return (
    <SiteChrome compact>
      <section className="workspace-hero">
        <div>
          <p className="eyebrow">{t('diagnostic.eyebrow')}</p>
          <h1>{t('diagnostic.title')}</h1>
          <p className="hero-summary">{t('diagnostic.lead')}</p>
          <div className="hero-actions">
            <a href={`${SIMULATOR_URL}/dashboard?source=playbook`} className="button button-secondary">
              <Activity size={17} />
              {t('service.simulator')}
            </a>
            <a href={practiceLink} className="button button-secondary">
              <Repeat2 size={17} />
              {t('service.practice')}
            </a>
          </div>
        </div>
        <aside className="diagnostic-status">
          {loading ? <LoaderCircle size={22} className="spin" /> : <CheckCircle2 size={22} />}
          <span>{loading ? t('diagnostic.generating') : t('dashboard.evidence', { sources: evidenceSources || t('dashboard.profileOnly') })}</span>
        </aside>
      </section>

      {simulator.sessionId && payload ? (
        <p className="notice-banner anchor-banner" role="status" data-testid="simulator-anchor">
          {anchor.found
            ? t('anchor.found', { band: scoreLabel(anchor.overall_band), date: formatDate(anchor.computed_at) })
            : t('anchor.pending')}
        </p>
      ) : null}

      {error ? <p className="notice-banner notice-danger" role="alert">{error}</p> : null}

      <section className="ai-panel ai-panel-violet">
        <div className="ai-panel-head">
          <div className="ai-panel-title">
            <Brain size={22} />
            <div>
              <strong>{t('diagnostic.ai.title')}</strong>
              <p>{t('diagnostic.ai.lead')}</p>
            </div>
          </div>
          <button type="button" className="button button-primary" onClick={() => void runSynthesis()} disabled={synthesizing}>
            {synthesizing ? t('diagnostic.ai.running') : synthesis ? t('diagnostic.ai.rerun') : t('common.generate')} <Sparkles size={14} />
          </button>
        </div>

        {synthError ? <p className="inline-error" role="alert">{synthError}</p> : null}
        {synthesis?.ai_status === 'unconfigured' || synthesis?.ai_status === 'failed' ? (
          <p className="inline-error">{t('ai.fallbackNote')}</p>
        ) : null}

        {synthesizing && !synthesis ? (
          <div className="ai-panel-loading">
            <LoaderCircle size={18} className="spin" />
            <span>{t('diagnostic.ai.reading')}</span>
          </div>
        ) : null}

        {synthesis ? (
          <div className="ai-panel-body">
            <div className="ai-panel-card">
              {synthesis.narrative.split(/\n\n+/).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>

            <div className="ai-panel-grid">
              <article className="ai-panel-card">
                <p className="ai-panel-label">{t('diagnostic.ai.priority')}</p>
                <ol>
                  {synthesis.section_priority.map((s, i) => (
                    <li key={i} style={{ fontWeight: i === 0 ? 700 : 400 }}>{enumLabel(t, 'skill', s)}</li>
                  ))}
                </ol>
              </article>
              <article className="ai-panel-card">
                <p className="ai-panel-label">{t('diagnostic.ai.hours')}</p>
                <h3 className="ai-panel-number">
                  {synthesis.weekly_hours_needed ?? '-'}
                  <span>{t('diagnostic.ai.hoursUnit')}</span>
                </h3>
                <p>{t('diagnostic.ai.feasibility', { value: enumLabel(t, 'feasibility', synthesis.feasibility) })}</p>
              </article>
            </div>

            {synthesis.risks.length > 0 ? (
              <article className="ai-panel-card">
                <p className="ai-panel-label">{t('diagnostic.ai.risks')}</p>
                <div className="risk-list">
                  {synthesis.risks.map((r, i) => (
                    <div key={i} className={`risk-item risk-${r.severity}`}>
                      <AlertTriangle size={15} />
                      <div>
                        <strong>{r.risk}</strong>
                        <p><em>{t('diagnostic.ai.mitigation')}</em> {r.mitigation}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}

            <p className="muted small">{t('common.generatedAt', { time: date(synthesis.generated_at) })}</p>
          </div>
        ) : null}
      </section>

      {payload ? (
        <>
          <section className="dashboard-grid">
            <article className="metric-card">
              <span className="card-icon"><Compass size={18} /></span>
              <p className="eyebrow">{t('diagnostic.card.decision')}</p>
              <h2>{enumLabel(t, 'track', decision.selected_track, t('track.general'))}</h2>
              <p>{t('diagnostic.delivery', { mode: enumLabel(t, 'delivery', decision.recommended_delivery_mode, t('delivery.computer')) })}</p>
              <div className="pill-row">
                <span className="pill">
                  {decision.one_skill_retake_eligible ? t('diagnostic.osrYes') : t('diagnostic.osrNo')}
                </span>
              </div>
            </article>

            <article className="metric-card metric-card-accent">
              <span className="card-icon"><Route size={18} /></span>
              <p className="eyebrow">{t('diagnostic.card.planning')}</p>
              <h2>{enumLabel(t, 'bucket', planning.deadline_bucket, t('bucket.improvement'))}</h2>
              <p>{t('dashboard.weakSkill', { skill: enumLabel(t, 'skill', planning.weakest_skill) })}</p>
              <p>{String(planning.realistic_timeline ?? '')}</p>
            </article>

            <article className="metric-card">
              <span className="card-icon"><BookOpenCheck size={18} /></span>
              <p className="eyebrow">{t('diagnostic.card.evidence')}</p>
              <h2>{t('dashboard.band', { band: currentBand })}</h2>
              <p>{evidenceSources || t('diagnostic.evidence.waiting')}</p>
              <div className="pill-row">
                <span className="pill">{t('diagnostic.mockDate', { date: formatDate(simulatorEvidence.latest_computed_at) })}</span>
                <span className="pill">{t('diagnostic.practiceDate', { date: formatDate(practiceEvidenceSummary.latest_practice_at ?? freshness.latest_practice_at) })}</span>
              </div>
            </article>

            <article className="metric-card">
              <span className="card-icon"><ClipboardList size={18} /></span>
              <p className="eyebrow">{t('diagnostic.card.template')}</p>
              <h2>{String(planTemplate.title ?? t('diagnostic.noTemplate'))}</h2>
              <p>{String(planTemplate.summary ?? '')}</p>
              {planTemplate.slug ? (
                <Link to={`/plans/${String(planTemplate.slug)}`} className="text-link">
                  {t('dashboard.openPlan')}
                  <ArrowRight size={15} />
                </Link>
              ) : null}
            </article>
          </section>

          <MarketGuidePanel
            initialCountry={typeof profile.test_market_country_code === 'string' ? profile.test_market_country_code : null}
            initialProvider={typeof profile.provider_key === 'string' ? profile.provider_key : null}
          />

          <section className="workspace-grid">
            <article className="content-card priority-panel">
              <div className="section-heading compact-heading">
                <p className="eyebrow">{t('diagnostic.order.eyebrow')}</p>
                <h2>{t('diagnostic.order.title')}</h2>
              </div>
              <div className="timeline-list">
                {moduleOrder.length === 0 ? (
                  <p className="muted">{t('diagnostic.order.empty')}</p>
                ) : (
                  moduleOrder.map((item, index) => (
                    <Link key={`${String(item.slug)}-${index}`} to={`/${String(item.slug)}`} className="timeline-item">
                      <span>{index + 1}</span>
                      <div>
                        <strong>{slugTitle(item.slug)}</strong>
                        <p>{String(item.reason ?? '')}</p>
                      </div>
                      <ArrowRight size={16} />
                    </Link>
                  ))
                )}
              </div>
            </article>

            <article className="content-card evidence-panel">
              <div className="section-heading compact-heading">
                <p className="eyebrow">{t('diagnostic.practice.eyebrow')}</p>
                <h2>{t('diagnostic.practice.title')}</h2>
              </div>
              <div className="evidence-list">
                {weakQuestionTypes.length === 0 ? (
                  <p className="muted">{practiceConnected ? t('dashboard.evidence.noneWeak') : t('dashboard.evidence.waiting')}</p>
                ) : (
                  weakQuestionTypes.slice(0, 5).map((item, index) => (
                    <div key={`${String(item.question_type)}-${index}`} className="evidence-item">
                      <div>
                        <strong>{slugTitle(item.question_type, t('dashboard.signal'))}</strong>
                        <span>{enumLabel(t, 'skill', item.section_type)} · {enumLabel(t, 'mastery.status', item.mastery_status, t('dashboard.unscored'))}</span>
                      </div>
                      <em>{item.mastery_level != null ? ratioLabel(item.mastery_level) : '-'}</em>
                    </div>
                  ))
                )}
              </div>
              <div className="inline-actions">
                <a href={practiceLink} className="button button-primary">
                  <Repeat2 size={17} />
                  {t('diagnostic.openTargeted')}
                </a>
              </div>
            </article>
          </section>

          <section className="workspace-grid supporting-grid">
            <article className="content-card">
              <div className="section-heading compact-heading">
                <p className="eyebrow">{t('dashboard.roadmap')}</p>
                <h2>{t('diagnostic.roadmap.title')}</h2>
              </div>
              <div className="mini-feed">
                {(roadmapItems.length ? roadmapItems.slice(0, 4) : planItems.slice(0, 4)).map((item, index) => (
                  <div key={`${String(item.id ?? item.title)}-${index}`} className="feed-item">
                    <strong>{String(item.title ?? item.rationale ?? '')}</strong>
                    <span>{enumLabel(t, 'skill', item.section_type)}</span>
                  </div>
                ))}
                {roadmapItems.length === 0 && planItems.length === 0 ? <p className="muted">{t('dashboard.roadmap.empty')}</p> : null}
              </div>
            </article>

            <article className="content-card">
              <div className="section-heading compact-heading">
                <p className="eyebrow">{t('dashboard.mistakes')}</p>
                <h2>{t('diagnostic.mistakes.title')}</h2>
              </div>
              <div className="mini-feed">
                {mistakes.length === 0 ? (
                  <p className="muted">{t('dashboard.mistakes.empty')}</p>
                ) : (
                  mistakes.slice(0, 4).map((item, index) => (
                    <div key={`${String(item.mistake_pattern)}-${index}`} className="feed-item">
                      <strong>{String(item.mistake_pattern ?? item.trap_type ?? '')}</strong>
                      <span>{enumLabel(t, 'skill', item.section_type)}</span>
                    </div>
                  ))
                )}
              </div>
            </article>
          </section>

          <section className="workspace-grid">
            <article className="content-card risk-panel wide-card">
              <div className="section-heading compact-heading">
                <p className="eyebrow">{t('diagnostic.bottlenecks.eyebrow')}</p>
                <h2>{t('diagnostic.bottlenecks.title')}</h2>
              </div>
              {bottlenecks.length === 0 ? (
                <p className="muted">{t('diagnostic.bottlenecks.empty')}</p>
              ) : (
                <ul className="plain-list">
                  {bottlenecks.map((item, index) => (
                    <li key={index}>
                      <TriangleAlert size={17} />
                      <span>{String(item)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        </>
      ) : null}
    </SiteChrome>
  );
};
