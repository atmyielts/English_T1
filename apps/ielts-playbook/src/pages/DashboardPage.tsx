import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Gauge,
  NotebookTabs,
  Radar,
  Repeat2,
  Target,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { playbookDashboardGet } from '../lib/api';
import {
  PlaybookActivityCard,
  PlaybookMasteryCard,
  PlaybookModuleProgress,
  PlaybookSectionTitle,
  PlaybookStalePlanBanner,
  PlaybookTrajectoryCard,
} from '../components/PlaybookEnrichments';
import { SiteChrome } from '../components/content/SiteChrome';
import { useAccess } from '../lib/useAccess';

type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const toRecord = (value: unknown): Row => (isRow(value) ? value : {});
const toRecordOrNull = (value: unknown): Row | null => (isRow(value) ? value : null);
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

export const DashboardPage: React.FC = () => {
  const { accessToken } = useAccess({ includeEffective: true });
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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
  }, [accessToken, reloadKey]);

  const profile = toRecord(payload?.profile);
  const recommendation = toRecordOrNull(payload?.latest_recommendation);
  const planning = toRecord(recommendation?.planning);
  const planTemplate = toRecord(recommendation?.plan_template);
  const simulatorOutcome = toRecordOrNull(payload?.latest_simulator_outcome ?? payload?.latest_outcome);
  const practiceOutcome = toRecordOrNull(payload?.latest_practice_outcome);
  const practiceEvidence = toRecord(payload?.practice_evidence);
  const connectedServices = toRecord(payload?.connected_services);
  const simulatorService = toRecord(connectedServices.simulator);
  const practiceService = toRecord(connectedServices.practice);
  const freshness = toRecord(practiceEvidence.freshness);
  const masterySummary = toRecord(practiceEvidence.mastery_summary);
  const weakQuestionTypes = toRows(masterySummary.weakest_question_types);
  const roadmapItems = toRows(practiceEvidence.roadmap_items);
  const mistakes = toRows(practiceEvidence.mistake_notebook);
  const recentLabs = toRows(practiceEvidence.recent_lab_attempts);
  const guides = toRows(payload?.premium_guides);
  const moduleOrder = toRows(recommendation?.recommended_module_order);
  const targetBand = scoreLabel(profile.target_overall_band ?? '6.5');
  const currentBand = scoreLabel(
    simulatorOutcome?.overall_band ?? practiceOutcome?.overall_band ?? profile.current_band_or_estimate,
  );
  const weakSkillRaw = String(planning.weakest_skill ?? profile.weakest_skill ?? '').trim().toLowerCase();
  const weakSkill = titleLabel(weakSkillRaw, 'Not set');
  const simulatorConnected = Boolean(simulatorService.connected ?? simulatorOutcome);
  const practiceConnected = Boolean(practiceService.connected ?? practiceEvidence.connected ?? practiceOutcome);
  const evidenceSources = [
    simulatorConnected ? 'Simulator' : null,
    practiceConnected ? 'Practice' : null,
  ].filter(Boolean).join(' + ');
  const weakCount = toNumber(masterySummary.weak_question_types) ?? weakQuestionTypes.length;
  const trackedCount = toNumber(masterySummary.tracked_question_types) ?? 0;
  const latestPracticeAt = freshness.latest_practice_at ?? practiceOutcome?.computed_at;
  const latestEvidenceAt = simulatorOutcome?.computed_at ?? practiceOutcome?.computed_at ?? latestPracticeAt;
  const latestLab = recentLabs[0] ?? null;
  const practiceLink = `${PRACTICE_URL}/dashboard?source=playbook${weakSkillRaw ? `&weak_skill=${encodeURIComponent(weakSkillRaw)}` : ''}`;

  return (
    <SiteChrome compact>
      <section className="workspace-hero">
        <div>
          <p className="eyebrow">Premium dashboard</p>
          <h1>Your IELTS command center.</h1>
          <p className="hero-summary">
            Target band, simulator scores, practice mastery, market logic, and next modules now live in one decision
            layer.
          </p>
          <div className="hero-actions">
            <Link to="/diagnostic" className="button button-primary">
              <Radar size={17} />
              Generate Strategy
            </Link>
            <a href={practiceLink} className="button button-secondary">
              <Repeat2 size={17} />
              Open Practice
            </a>
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
            Weak skill: {weakSkill}
            <br />
            Evidence: {evidenceSources || 'Profile only'}
          </div>
        </aside>
      </section>

      {error ? <p className="notice-banner notice-danger">{error}</p> : null}

      <PlaybookStalePlanBanner
        accessToken={accessToken}
        evidenceUpdatedAt={typeof profile.evidence_updated_at === 'string' ? profile.evidence_updated_at : null}
        recommendationCreatedAt={typeof recommendation?.created_at === 'string' ? recommendation.created_at : null}
        onRegenerated={() => setReloadKey((k) => k + 1)}
      />

      <PlaybookSectionTitle
        eyebrow="Progress"
        title="Where you stand right now"
        hint="Pulled live from your practice and simulator activity."
      />

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 16, marginBottom: 8 }}>
        <PlaybookTrajectoryCard accessToken={accessToken} />
        <PlaybookActivityCard accessToken={accessToken} />
      </section>

      <PlaybookSectionTitle
        eyebrow="Mastery"
        title="What you’ve repaired vs what’s still weak"
        hint="From your practice attempts, classified into Repair / Building / Stable / Graduated."
      />

      <PlaybookMasteryCard accessToken={accessToken} />

      <PlaybookSectionTitle
        eyebrow="Curriculum"
        title="Your playbook path"
        hint="Modules you’ve opened from your strategy plan."
      />

      <PlaybookModuleProgress
        visitedSlugs={(() => {
          const meta = profile.metadata && typeof profile.metadata === 'object' && !Array.isArray(profile.metadata)
            ? profile.metadata as Record<string, unknown>
            : {};
          const visited = meta.visited_modules && typeof meta.visited_modules === 'object' && !Array.isArray(meta.visited_modules)
            ? meta.visited_modules as Record<string, unknown>
            : {};
          return Object.keys(visited);
        })()}
      />

      <PlaybookSectionTitle
        eyebrow="Plan"
        title="Strategy recommendation"
        hint="Generated from your latest mock + practice signals."
      />

      <section className="dashboard-grid">
        <article className="metric-card">
          <span className="card-icon">
            <Target size={18} />
          </span>
          <p className="eyebrow">Profile</p>
          <h2>Band {targetBand}</h2>
          <p>Purpose: {titleLabel(profile.purpose ?? 'study')}</p>
          <Link to="/onboarding" className="text-link">
            Adjust profile
            <ArrowRight size={15} />
          </Link>
        </article>

        <article className="metric-card metric-card-accent">
          <span className="card-icon">
            <Gauge size={18} />
          </span>
          <p className="eyebrow">Simulator</p>
          <h2>{simulatorOutcome ? `Overall ${scoreLabel(simulatorOutcome.overall_band)}` : 'No mock yet'}</h2>
          <p>
            {simulatorOutcome
              ? `Latest scored mock: ${formatDate(simulatorOutcome.computed_at)}`
              : 'Run a full mock so the Playbook can anchor strategy to section bands.'}
          </p>
          <a href={`${SIMULATOR_URL}/dashboard?source=playbook`} className="text-link">
            Open simulator
            <ArrowRight size={15} />
          </a>
        </article>

        <article className="metric-card">
          <span className="card-icon">
            <Activity size={18} />
          </span>
          <p className="eyebrow">Practice loop</p>
          <h2>{practiceConnected ? `${weakCount} weak focus${weakCount === 1 ? '' : 'es'}` : 'Not connected'}</h2>
          <p>
            {practiceConnected
              ? `${trackedCount} question types tracked. Last practice: ${formatDate(latestPracticeAt)}.`
              : 'Open Practice to generate mastery, mistakes, and roadmap signals.'}
          </p>
          <div className="pill-row">
            <span className="pill">Latest lab: {latestLab ? titleLabel(latestLab.section_type) : '-'}</span>
            <span className="pill">Accuracy: {latestLab ? ratioLabel(latestLab.accuracy_ratio) : '-'}</span>
          </div>
        </article>

        <article className="metric-card">
          <span className="card-icon">
            <CalendarClock size={18} />
          </span>
          <p className="eyebrow">Current plan</p>
          <h2>{String(planTemplate.title ?? 'No saved plan')}</h2>
          <p>{String(planning.realistic_timeline ?? 'Generate a recommendation to get a timeline and module order.')}</p>
          <div className="pill-row">
            <span className="pill">Bucket: {titleLabel(planning.deadline_bucket)}</span>
            <span className="pill">Weak: {weakSkill}</span>
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
                <Link
                  key={`${String(item.slug)}-${index}`}
                  to={String(item.slug) === 'diagnostic' ? '/diagnostic' : `/${String(item.slug)}`}
                  className="timeline-item"
                >
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
            <p className="eyebrow">Practice evidence</p>
            <h2>What the lab is flagging</h2>
          </div>
          <div className="evidence-list">
            {(weakQuestionTypes.length ? weakQuestionTypes.slice(0, 4) : [{ section_type: 'practice', question_type: 'No weak question types yet', mastery_status: practiceConnected ? 'steady' : 'waiting' }]).map(
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
          <div className="evidence-columns">
            <div>
              <h3>Roadmap</h3>
              <div className="mini-feed">
                {(roadmapItems.length ? roadmapItems.slice(0, 3) : [{ title: 'Practice roadmap will appear after targeted sessions.', section_type: weakSkillRaw || 'practice' }]).map(
                  (item, index) => (
                    <div key={`${String(item.title)}-${index}`} className="feed-item">
                      <strong>{String(item.title ?? 'Practice roadmap')}</strong>
                      <span>{titleLabel(item.section_type)} · Priority {String(item.priority ?? '-')}</span>
                    </div>
                  ),
                )}
              </div>
            </div>
            <div>
              <h3>Mistakes</h3>
              <div className="mini-feed">
                {(mistakes.length ? mistakes.slice(0, 3) : [{ mistake_pattern: 'No active mistake patterns yet.', trap_type: 'clean' }]).map(
                  (item, index) => (
                    <div key={`${String(item.mistake_pattern)}-${index}`} className="feed-item">
                      <strong>{String(item.mistake_pattern ?? item.trap_type ?? 'Mistake pattern')}</strong>
                      <span>{titleLabel(item.section_type)} · {titleLabel(item.status, 'Tracked')}</span>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="workspace-grid supporting-grid">
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

        <article className="content-card">
          <div className="section-heading compact-heading">
            <p className="eyebrow">Connected IELTS family</p>
            <h2>Evidence sources</h2>
          </div>
          <div className="service-grid">
            <a href={`${SIMULATOR_URL}/dashboard?source=playbook`} className="service-card">
              <CheckCircle2 size={18} />
              <div>
                <strong>IELTS Simulator</strong>
                <span>{simulatorConnected ? `Latest mock ${formatDate(simulatorOutcome?.computed_at)}` : 'Waiting for a scored mock'}</span>
              </div>
            </a>
            <a href={practiceLink} className="service-card">
              <CheckCircle2 size={18} />
              <div>
                <strong>IELTS Practice</strong>
                <span>{practiceConnected ? `Latest practice ${formatDate(latestPracticeAt)}` : 'Waiting for practice activity'}</span>
              </div>
            </a>
          </div>
          <p className="card-footnote">Last evidence refresh: {formatDate(latestEvidenceAt)}</p>
        </article>
      </section>

      <section className="cta-strip">
        <div>
          <p className="eyebrow">Keep the loop moving</p>
          <h2>Refresh the strategy after each mock or practice cycle.</h2>
          <p>IELTS planning gets sharper when both evidence streams are recent.</p>
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
