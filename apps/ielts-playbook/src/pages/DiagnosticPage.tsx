import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Compass,
  LoaderCircle,
  Repeat2,
  Route,
  TriangleAlert,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { playbookRecommendationGenerate } from '../lib/api';
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
