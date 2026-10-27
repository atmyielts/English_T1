import React, { useEffect, useRef, useState } from 'react';
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
  X,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { playbookDashboardGet, playbookRecommendationGenerate } from '../lib/api';
import {
  PlaybookActivityCard,
  PlaybookMasteryCard,
  PlaybookModuleProgress,
  PlaybookSectionTitle,
  PlaybookStalePlanBanner,
  PlaybookTrajectoryCard,
} from '../components/PlaybookEnrichments';
import { SiteChrome } from '../components/content/SiteChrome';
import { PageSkeleton } from '../components/PlaybookPremium';
import { enumLabel, useLocale, useT } from '../i18n';
import { readPlanModules, setPlanModule } from '../lib/planModules';
import { readSimulatorContext } from '../lib/simulatorContext';
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

export const scoreLabel = (value: unknown) => {
  const number = toNumber(value);
  if (number != null) return number % 1 === 0 ? String(number) : number.toFixed(1);
  const text = typeof value === 'string' ? value.trim() : '';
  return text || '-';
};

export const slugTitle = (value: unknown, fallback = '-') => {
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

const insight = (payload: Row | null, key: string): never | null => {
  const insights = payload?.insights;
  if (!isRow(insights)) return null;
  const value = insights[key];
  return isRow(value) ? ({ ok: true, ...value } as never) : null;
};

export const DashboardPage: React.FC = () => {
  const t = useT();
  const { date } = useLocale();
  const location = useLocation();
  const { accessToken } = useAccess({ includeEffective: true });
  const [simulator] = useState(() => readSimulatorContext(location.search));
  const [payload, setPayload] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [planModules, setPlanModules] = useState<string[]>([]);
  const [regenState, setRegenState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const autoRegenerated = useRef(false);

  const formatDate = (value: unknown) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return '-';
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? text : date(parsed, { dateStyle: 'medium' });
  };

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    setError(null);
    playbookDashboardGet(accessToken, { sessionId: simulator.sessionId })
      .then((data) => {
        if (!active) return;
        setPayload(data);
        setPlanModules(readPlanModules(toRecord(data.profile)));
      })
      .catch(() => {
        if (active) setError(t('dashboard.loadError'));
      });
    return () => {
      active = false;
    };
  }, [accessToken, reloadKey, simulator.sessionId, t]);

  const regenerate = async () => {
    if (!accessToken) return;
    setRegenState('running');
    try {
      await playbookRecommendationGenerate(accessToken, simulator.sessionId ? { session_id: simulator.sessionId } : {});
      setRegenState('done');
      setReloadKey((k) => k + 1);
    } catch {
      setRegenState('error');
    }
  };

  // The simulator's "Update my plan" link: /dashboard?source=simulator&intent=regenerate
  useEffect(() => {
    if (!accessToken || autoRegenerated.current) return;
    if (simulator.source === 'simulator' && simulator.intent === 'regenerate') {
      autoRegenerated.current = true;
      void regenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, simulator.source, simulator.intent]);

  const removeFromPlan = async (slug: string) => {
    if (!accessToken) return;
    try {
      setPlanModules(await setPlanModule(accessToken, slug, false));
    } catch {
      setError(t('content.useInPlan.error'));
    }
  };

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
  const anchor = toRecordOrNull(payload?.simulator_anchor);
  const targetBand = scoreLabel(profile.target_overall_band ?? '6.5');
  const currentBand = scoreLabel(
    simulatorOutcome?.overall_band ?? practiceOutcome?.overall_band ?? profile.current_band_or_estimate,
  );
  const weakSkillRaw = String(planning.weakest_skill ?? profile.weakest_skill ?? '').trim().toLowerCase();
  const weakSkill = enumLabel(t, 'skill', weakSkillRaw, t('common.notSet'));
  const simulatorConnected = Boolean(simulatorService.connected ?? simulatorOutcome);
  const practiceConnected = Boolean(practiceService.connected ?? practiceEvidence.connected ?? practiceOutcome);
  const evidenceSources = [simulatorConnected ? t('service.simulator') : null, practiceConnected ? t('service.practice') : null]
    .filter(Boolean)
    .join(' + ');
  const weakCount = toNumber(masterySummary.weak_question_types) ?? weakQuestionTypes.length;
  const trackedCount = toNumber(masterySummary.tracked_question_types) ?? 0;
  const latestPracticeAt = freshness.latest_practice_at ?? practiceOutcome?.computed_at;
  const latestEvidenceAt = simulatorOutcome?.computed_at ?? practiceOutcome?.computed_at ?? latestPracticeAt;
  const latestLab = recentLabs[0] ?? null;
  const practiceParams = new URLSearchParams({ source: 'playbook' });
  if (weakSkillRaw) practiceParams.set('weak_skill', weakSkillRaw);
  if (simulator.sessionId) practiceParams.set('session_id', simulator.sessionId);
  const practiceLink = `${PRACTICE_URL}/dashboard?${practiceParams.toString()}`;
  const diagnosticLink = simulator.sessionId
    ? `/diagnostic?source=simulator&session_id=${encodeURIComponent(simulator.sessionId)}`
    : '/diagnostic';
  const meta = toRecord(profile.metadata);
  const visited = Object.keys(toRecord(meta.visited_modules));

  return (
    <SiteChrome compact>
      <section className="workspace-hero">
        <div>
          <p className="eyebrow">{t('dashboard.eyebrow')}</p>
          <h1>{t('dashboard.title')}</h1>
          <p className="hero-summary">{t('dashboard.lead')}</p>
          <div className="hero-actions">
            <Link to={diagnosticLink} className="button button-primary">
              <Radar size={17} />
              {t('dashboard.generateStrategy')}
            </Link>
            <a href={practiceLink} className="button button-secondary">
              <Repeat2 size={17} />
              {t('dashboard.openPractice')}
            </a>
          </div>
        </div>
        <aside className="score-panel" aria-label={t('dashboard.target')}>
          <div>
            <span>{t('dashboard.target')}</span>
            <strong>{targetBand}</strong>
          </div>
          <div>
            <span>{t('dashboard.current')}</span>
            <strong>{currentBand}</strong>
          </div>
          <div className="score-panel-note">
            {t('dashboard.weakSkill', { skill: weakSkill })}
            <br />
            {t('dashboard.evidence', { sources: evidenceSources || t('dashboard.profileOnly') })}
          </div>
        </aside>
      </section>

      {simulator.source === 'simulator' && simulator.sessionId ? (
        <section className="notice-banner anchor-banner" data-testid="simulator-anchor" role="status">
          {anchor && anchor.found ? (
            <span>
              {t('anchor.found', {
                band: scoreLabel(anchor.overall_band),
                date: formatDate(anchor.computed_at),
              })}
            </span>
          ) : payload ? (
            <span>{t('anchor.pending')}</span>
          ) : (
            <span>{t('anchor.loading')}</span>
          )}
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void regenerate()}
            disabled={regenState === 'running'}
          >
            <TrendingUp size={16} />
            {regenState === 'running' ? t('stale.running') : t('anchor.rebuild')}
          </button>
          {regenState === 'done' ? <span className="ok-text">{t('anchor.rebuilt')}</span> : null}
          {regenState === 'error' ? <span className="inline-error">{t('stale.error')}</span> : null}
        </section>
      ) : null}

      {error ? <p className="notice-banner notice-danger" role="alert">{error}</p> : null}

      {!payload && !error ? <PageSkeleton /> : null}

      <PlaybookStalePlanBanner
        accessToken={accessToken}
        evidenceUpdatedAt={typeof profile.evidence_updated_at === 'string' ? profile.evidence_updated_at : null}
        recommendationCreatedAt={typeof recommendation?.created_at === 'string' ? recommendation.created_at : null}
        onRegenerated={() => setReloadKey((k) => k + 1)}
      />

      <PlaybookSectionTitle eyebrow={t('dashboard.progress.eyebrow')} title={t('dashboard.progress.title')} hint={t('dashboard.progress.hint')} />

      <section className="insights-grid">
        <PlaybookTrajectoryCard accessToken={accessToken} embedded={insight(payload, 'trajectory')} />
        <PlaybookActivityCard accessToken={accessToken} embedded={insight(payload, 'activity')} />
      </section>

      <PlaybookSectionTitle eyebrow={t('dashboard.mastery.eyebrow')} title={t('dashboard.mastery.title')} hint={t('dashboard.mastery.hint')} />
      <PlaybookMasteryCard accessToken={accessToken} embedded={insight(payload, 'mastery')} />

      <PlaybookSectionTitle eyebrow={t('dashboard.curriculum.eyebrow')} title={t('dashboard.curriculum.title')} hint={t('dashboard.curriculum.hint')} />

      <section className="content-card plan-modules" data-testid="plan-modules">
        <h2>{t('dashboard.planModules.title')}</h2>
        {planModules.length === 0 ? (
          <p className="muted">{t('dashboard.planModules.empty')}</p>
        ) : (
          <ul className="plan-module-list">
            {planModules.map((slug) => (
              <li key={slug}>
                <Link to={`/${slug}`}>{slugTitle(slug)}</Link>
                <button type="button" className="icon-button" onClick={() => void removeFromPlan(slug)} aria-label={t('dashboard.planModules.remove', { name: slugTitle(slug) })}>
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PlaybookModuleProgress visitedSlugs={visited} />

      <PlaybookSectionTitle eyebrow={t('dashboard.plan.eyebrow')} title={t('dashboard.plan.title')} hint={t('dashboard.plan.hint')} />

      <section className="dashboard-grid">
        <article className="metric-card">
          <span className="card-icon">
            <Target size={18} />
          </span>
          <p className="eyebrow">{t('dashboard.card.profile')}</p>
          <h2>{t('dashboard.band', { band: targetBand })}</h2>
          <p>{t('dashboard.purpose', { purpose: enumLabel(t, 'purpose', profile.purpose ?? 'study') })}</p>
          <Link to="/onboarding" className="text-link">
            {t('dashboard.adjustProfile')}
            <ArrowRight size={15} />
          </Link>
        </article>

        <article className="metric-card metric-card-accent">
          <span className="card-icon">
            <Gauge size={18} />
          </span>
          <p className="eyebrow">{t('service.simulator')}</p>
          <h2>{simulatorOutcome ? t('dashboard.overall', { band: scoreLabel(simulatorOutcome.overall_band) }) : t('dashboard.noMock')}</h2>
          <p>
            {simulatorOutcome
              ? t('dashboard.latestMock', { date: formatDate(simulatorOutcome.computed_at) })
              : t('dashboard.noMock.lead')}
          </p>
          <a href={`${SIMULATOR_URL}/dashboard?source=playbook`} className="text-link">
            {t('dashboard.openSimulator')}
            <ArrowRight size={15} />
          </a>
        </article>

        <article className="metric-card">
          <span className="card-icon">
            <Activity size={18} />
          </span>
          <p className="eyebrow">{t('dashboard.card.practice')}</p>
          <h2>{practiceConnected ? t('dashboard.weakFocuses', { count: weakCount }) : t('dashboard.notConnected')}</h2>
          <p>
            {practiceConnected
              ? t('dashboard.tracked', { count: trackedCount, date: formatDate(latestPracticeAt) })
              : t('dashboard.practice.lead')}
          </p>
          <div className="pill-row">
            <span className="pill">{t('dashboard.latestLab', { section: latestLab ? enumLabel(t, 'skill', latestLab.section_type) : '-' })}</span>
            <span className="pill">{t('dashboard.accuracy', { value: latestLab ? ratioLabel(latestLab.accuracy_ratio) : '-' })}</span>
          </div>
        </article>

        <article className="metric-card">
          <span className="card-icon">
            <CalendarClock size={18} />
          </span>
          <p className="eyebrow">{t('dashboard.card.plan')}</p>
          <h2>{String(planTemplate.title ?? t('dashboard.noPlan'))}</h2>
          <p>{String(planning.realistic_timeline ?? t('dashboard.noPlan.lead'))}</p>
          <div className="pill-row">
            <span className="pill">{t('dashboard.bucket', { bucket: enumLabel(t, 'bucket', planning.deadline_bucket) })}</span>
            {planTemplate.slug ? (
              <Link to={`/plans/${String(planTemplate.slug)}`} className="pill pill-link">{t('dashboard.openPlan')}</Link>
            ) : null}
          </div>
        </article>
      </section>

      <section className="workspace-grid">
        <article className="content-card priority-panel">
          <div className="section-heading compact-heading">
            <p className="eyebrow">{t('dashboard.next.eyebrow')}</p>
            <h2>{t('dashboard.next.title')}</h2>
          </div>
          <div className="timeline-list">
            {moduleOrder.length === 0 ? (
              <Link to={diagnosticLink} className="timeline-item">
                <span>1</span>
                <div>
                  <strong>{t('dashboard.next.emptyTitle')}</strong>
                  <p>{t('dashboard.next.empty')}</p>
                </div>
                <ArrowRight size={16} />
              </Link>
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
            <p className="eyebrow">{t('dashboard.evidence.eyebrow')}</p>
            <h2>{t('dashboard.evidence.title')}</h2>
          </div>
          <div className="evidence-list">
            {weakQuestionTypes.length === 0 ? (
              <p className="muted">{practiceConnected ? t('dashboard.evidence.noneWeak') : t('dashboard.evidence.waiting')}</p>
            ) : (
              weakQuestionTypes.slice(0, 4).map((item, index) => (
                <div key={`${String(item.question_type)}-${index}`} className="evidence-item">
                  <div>
                    <strong>{slugTitle(item.question_type, t('dashboard.signal'))}</strong>
                    <span>
                      {enumLabel(t, 'skill', item.section_type)} · {enumLabel(t, 'mastery.status', item.mastery_status, t('dashboard.unscored'))}
                    </span>
                  </div>
                  <em>{item.mastery_level != null ? ratioLabel(item.mastery_level) : '-'}</em>
                </div>
              ))
            )}
          </div>
          <div className="evidence-columns">
            <div>
              <h3>{t('dashboard.roadmap')}</h3>
              <div className="mini-feed">
                {roadmapItems.length === 0 ? (
                  <p className="muted">{t('dashboard.roadmap.empty')}</p>
                ) : (
                  roadmapItems.slice(0, 3).map((item, index) => (
                    <div key={`${String(item.title)}-${index}`} className="feed-item">
                      <strong>{String(item.title ?? '')}</strong>
                      <span>{enumLabel(t, 'skill', item.section_type)} · {t('dashboard.priority', { value: String(item.priority ?? '-') })}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <h3>{t('dashboard.mistakes')}</h3>
              <div className="mini-feed">
                {mistakes.length === 0 ? (
                  <p className="muted">{t('dashboard.mistakes.empty')}</p>
                ) : (
                  mistakes.slice(0, 3).map((item, index) => (
                    <div key={`${String(item.mistake_pattern)}-${index}`} className="feed-item">
                      <strong>{String(item.mistake_pattern ?? item.trap_type ?? '')}</strong>
                      <span>{enumLabel(t, 'skill', item.section_type)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="workspace-grid supporting-grid">
        <article className="content-card">
          <div className="section-heading compact-heading">
            <p className="eyebrow">{t('dashboard.guides.eyebrow')}</p>
            <h2>{t('dashboard.guides.title')}</h2>
          </div>
          <div className="mini-feed">
            {guides.slice(0, 6).map((guide) => (
              <Link key={String(guide.id)} to={`/${String(guide.slug)}`} className="feed-item">
                <strong>{String(guide.title ?? '')}</strong>
                <span>{String(guide.summary ?? '')}</span>
              </Link>
            ))}
            {guides.length === 0 && payload ? <p className="muted">{t('dashboard.guides.empty')}</p> : null}
          </div>
        </article>

        <article className="content-card">
          <div className="section-heading compact-heading">
            <p className="eyebrow">{t('dashboard.family.eyebrow')}</p>
            <h2>{t('dashboard.family.title')}</h2>
          </div>
          <div className="service-grid">
            <a href={`${SIMULATOR_URL}/dashboard?source=playbook`} className="service-card">
              <CheckCircle2 size={18} />
              <div>
                <strong>{t('service.simulatorFull')}</strong>
                <span>{simulatorConnected ? t('dashboard.latestMock', { date: formatDate(simulatorOutcome?.computed_at) }) : t('dashboard.family.waitingMock')}</span>
              </div>
            </a>
            <a href={practiceLink} className="service-card">
              <CheckCircle2 size={18} />
              <div>
                <strong>{t('service.practiceFull')}</strong>
                <span>{practiceConnected ? t('dashboard.family.latestPractice', { date: formatDate(latestPracticeAt) }) : t('dashboard.family.waitingPractice')}</span>
              </div>
            </a>
          </div>
          <p className="card-footnote">{t('dashboard.family.refresh', { date: formatDate(latestEvidenceAt) })}</p>
        </article>
      </section>

      <section className="cta-strip">
        <div>
          <p className="eyebrow">{t('dashboard.cta.eyebrow')}</p>
          <h2>{t('dashboard.cta.title')}</h2>
          <p>{t('dashboard.cta.lead')}</p>
        </div>
        <div className="cta-actions">
          <Link to={diagnosticLink} className="button button-primary">
            <TrendingUp size={17} />
            {t('dashboard.cta.refresh')}
          </Link>
          <Link to="/study-plans" className="button button-secondary">
            <NotebookTabs size={17} />
            {t('dashboard.cta.plans')}
          </Link>
        </div>
      </section>
    </SiteChrome>
  );
};
