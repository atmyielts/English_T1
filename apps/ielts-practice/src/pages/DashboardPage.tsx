import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import {
  practiceDashboardGet,
  practiceGeneratePlan,
  practiceNotebookPatch,
  practicePlanItemStart,
  srsAddToQueue,
  srsListReviews,
  type PracticeGoal,
  type PracticeNotebookItem,
  type PracticePlanItem,
  type PracticeRoadmapItem,
  type SrsReviewItem,
} from '../lib/api';
import { IELTS_PRACTICE_PRODUCT_ID, IELTS_SIMULATOR_PRODUCT_ID, IELTS_SIMULATOR_PRODUCT_SLUG } from '../lib/constants';
import { buildPlatformUrl } from '../lib/platformUrls';
import { usePracticeContext } from '../lib/practiceContext';
import { PracticeShell } from '../components/PracticeShell';
import { EmptyCatalogueCard, PracticeContextBanner } from '../components/PracticeContextBanner';
import { sectionLabel, statusLabel, useAppT, useErrorText, useFormat, type AppKey } from '../i18n';
import { experienceCopy } from '../lib/practiceExperience';
import {
  EXPERIENCE_KINDS,
  formatPracticeLabel,
  getPlanExperienceSteps,
  getPlanItemDescription,
  getPlanItemTitle,
  getPlanPersonalizationChips,
  getPlanSourceCopy,
  getPlanWhyCopy,
} from '../lib/practiceExperience';
import { useAccess } from '../lib/useAccess';
import {
  ActivityHeatmapCard,
  BandTrajectoryCard,
  ExamReadinessCard,
  MasteryOverviewCard,
  PlanNarrativeBanner,
} from '../components/PracticeInsights';
import { AskCoachPanel, NotebookRetestButton, PlanStaleBanner } from '../components/PracticeAdaptiveExtras';
import { PracticeAICoachCard } from '../components/PracticeAICoachCard';
import { PracticeOnboarding } from '../components/PracticeOnboarding';
import {
  DashboardSectionTitle,
  MockTestEntryCard,
  PreTestModeBanner,
  ScoreImpactCallout,
  VocabFromMistakesCard,
} from '../components/PracticeFocusExtras';
import { UniversalStreakBadge } from '../components/UniversalStreakBadge';
import { TeachSkillButton } from '../components/TeachSkillButton';
import { MistakeCausesCard } from '../components/MistakeCauseInsights';

type SectionType = 'reading' | 'listening' | 'writing';

type SectionDiagnostic = {
  section_type: SectionType;
  samples: number;
  accuracy_ratio: number | null;
  average_band: number | null;
  target_band: number | null;
  band_gap: number | null;
  confidence?: number | null;
  mastery_level?: number | null;
};

type QuestionTypeDiagnostic = {
  section_type: SectionType;
  question_type: string;
  samples: number;
  accuracy_ratio: number | null;
  weakness_score: number;
  confidence?: number | null;
  mastery_level?: number | null;
  mastery_status?: string | null;
};

type DiagnosticsPayload = {
  overall: {
    average_band: number | null;
    target_band: number | null;
    band_gap: number | null;
  };
  sections: Record<SectionType, SectionDiagnostic>;
  question_types: QuestionTypeDiagnostic[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toSectionType = (value: unknown): SectionType | null => {
  const text = String(value ?? '').toLowerCase().trim();
  if (text === 'reading' || text === 'listening' || text === 'writing') return text;
  return null;
};

const normalizeSection = (section: SectionType, raw: unknown): SectionDiagnostic => {
  const source = isRecord(raw) ? raw : {};
  return {
    section_type: section,
    samples: Math.max(0, Math.floor(toNumber(source.samples) ?? 0)),
    accuracy_ratio: toNumber(source.accuracy_ratio),
    average_band: toNumber(source.average_band),
    target_band: toNumber(source.target_band),
    band_gap: toNumber(source.band_gap),
  };
};

const normalizeDiagnostics = (raw: unknown): DiagnosticsPayload | null => {
  if (!isRecord(raw)) return null;

  const overallRaw = isRecord(raw.overall) ? raw.overall : {};
  const sectionsRaw = isRecord(raw.sections) ? raw.sections : {};
  const questionTypesRaw = Array.isArray(raw.question_types) ? raw.question_types : [];

  const sections: Record<SectionType, SectionDiagnostic> = {
    reading: normalizeSection('reading', sectionsRaw.reading),
    listening: normalizeSection('listening', sectionsRaw.listening),
    writing: normalizeSection('writing', sectionsRaw.writing),
  };

  const question_types: QuestionTypeDiagnostic[] = questionTypesRaw
    .map((entry): QuestionTypeDiagnostic | null => {
      if (!isRecord(entry)) return null;
      const section = toSectionType(entry.section_type);
      if (!section) return null;
      return {
        section_type: section,
        question_type: String(entry.question_type ?? 'question_unknown'),
        samples: Math.max(0, Math.floor(toNumber(entry.samples) ?? 0)),
        accuracy_ratio: toNumber(entry.accuracy_ratio),
        weakness_score: toNumber(entry.weakness_score) ?? 0,
        confidence: toNumber(entry.confidence),
        mastery_level: toNumber(entry.mastery_level),
        mastery_status: typeof entry.mastery_status === 'string' ? entry.mastery_status : null,
      };
    })
    .filter((entry): entry is QuestionTypeDiagnostic => entry != null)
    .sort((a, b) => b.weakness_score - a.weakness_score);

  return {
    overall: {
      average_band: toNumber(overallRaw.average_band),
      target_band: toNumber(overallRaw.target_band),
      band_gap: toNumber(overallRaw.band_gap),
    },
    sections,
    question_types,
  };
};

const sectionChipClass = (section: SectionType): string => {
  if (section === 'reading') return 'chip reading';
  if (section === 'listening') return 'chip listening';
  return 'chip writing';
};

const sectionBarClass = (section: SectionType): string => {
  if (section === 'reading') return 'progress-fill reading';
  if (section === 'listening') return 'progress-fill listening';
  return 'progress-fill writing';
};

const hasLabPayload = (item: { delivery_build?: { metadata?: unknown } | null }): boolean => {
  const metadata = isRecord(item.delivery_build?.metadata) ? item.delivery_build?.metadata as Record<string, unknown> : {};
  const labPayload = isRecord(metadata.lab_payload) ? metadata.lab_payload as Record<string, unknown> : {};
  return labPayload.version === 'ielts.practice.lab.v1';
};

const LAB_FEATURES: AppKey[] = [
  'dash.feature.coach',
  'dash.feature.evidence',
  'dash.feature.distractor',
  'dash.feature.replay',
  'dash.feature.rewrite',
  'dash.feature.notebook',
  'dash.feature.roadmap',
];

const SECTION_ORDER: SectionType[] = ['reading', 'listening', 'writing'];

const SECTION_FALLBACK_COPY: Record<SectionType, AppKey> = {
  reading: 'dash.fallback.reading',
  listening: 'dash.fallback.listening',
  writing: 'dash.fallback.writing',
};

const EMPTY_CATALOGUE = '__empty_catalogue__';

const humanizeError = (message: string): string => {
  const text = message.toLowerCase();
  if (
    text.includes('no published exercises')
    || text.includes('no published blueprints')
    || text.includes('no published practice blueprints or exercises')
    || text.includes('no published transformed ielts practice experiences')
    || text.includes('none could be selected and no fallback exercises are available')
  ) {
    return EMPTY_CATALOGUE;
  }
  return message;
};

export const DashboardPage = () => {
  const t = useAppT();
  const fmt = useFormat();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { accessToken, me, session, effective, status } = useAccess({ includeEffective: true });
  const { context, session: contextSession, dismiss: dismissContext } = usePracticeContext(accessToken);
  const [emptyCatalogue, setEmptyCatalogue] = useState(false);
  // access-effective already expands bundles (e.g. IELTS Complete) into product ids.
  const hasSimulatorAccess = status === 'loading'
    ? null
    : Boolean(
      me?.entitlements.some((entry) => entry.resource_type === 'product' && entry.resource_id === IELTS_SIMULATOR_PRODUCT_ID)
      || effective?.effective_product_ids?.includes(IELTS_SIMULATOR_PRODUCT_ID),
    );
  const simulatorPricingUrl = buildPlatformUrl('/pricing', undefined, { product: IELTS_SIMULATOR_PRODUCT_SLUG });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetBand, setTargetBand] = useState<number | null>(null);
  const [, setAverageBand] = useState<number | null>(null);
  const [goal, setGoal] = useState<PracticeGoal | null>(null);
  const [plan, setPlan] = useState<PracticePlanItem[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsPayload | null>(null);
  const [notebook, setNotebook] = useState<PracticeNotebookItem[]>([]);
  const [roadmap, setRoadmap] = useState<PracticeRoadmapItem[]>([]);
  const [planStale, setPlanStale] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [notebookBusyId, setNotebookBusyId] = useState<string | null>(null);
  const [srsItems, setSrsItems] = useState<SrsReviewItem[]>([]);
  const [srsSummary, setSrsSummary] = useState<{ due: number; mastered: number; total: number }>({ due: 0, mastered: 0, total: 0 });
  const [srsQueueKeys, setSrsQueueKeys] = useState<Set<string>>(new Set());
  const [queuingKey, setQueuingKey] = useState<string | null>(null);
  const displayName = useMemo(() => {
    const first = String(session?.user.user_metadata?.first_name ?? '').trim();
    const last = String(session?.user.user_metadata?.last_name ?? '').trim();
    const full = `${first} ${last}`.trim();
    if (full) return full;
    const fullName = String(session?.user.user_metadata?.full_name ?? '').trim();
    if (fullName) return fullName;
    const raw = String(me?.user.email ?? '').split('@')[0] ?? '';
    return raw.length > 0 ? raw : t('dash.learner');
  }, [me?.user.email, session?.user.user_metadata, t]);

  const generationBody = (refreshDiagnostics: boolean) => ({
    refresh_diagnostics: refreshDiagnostics,
    daily_minutes: goal?.daily_practice_minutes ?? 60,
    timezone: goal?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });

  const refreshSrs = async (): Promise<void> => {
    if (!accessToken) return;
    const [daily, full] = await Promise.all([
      srsListReviews(accessToken, { mode: 'daily', limit: 6 }).catch(() => null),
      srsListReviews(accessToken, { mode: 'all', limit: 200 }).catch(() => null),
    ]);
    if (daily) {
      setSrsItems(daily.items ?? []);
      setSrsSummary(daily.summary ?? { due: 0, mastered: 0, total: 0 });
    }
    if (full) {
      const keys = new Set<string>();
      for (const item of full.items ?? []) {
        keys.add(`${item.section_type}::${item.question_type}`);
      }
      setSrsQueueKeys(keys);
    }
  };

  const load = async (): Promise<void> => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [dashboardRes] = await Promise.all([practiceDashboardGet(accessToken), refreshSrs()]);

      setGoal(dashboardRes.goals);
      setTargetBand(toNumber(dashboardRes.goals.target_overall_band));

      const diagnosticPayload = normalizeDiagnostics(dashboardRes.diagnostics_snapshot?.diagnostics);
      setDiagnostics(diagnosticPayload);
      setAverageBand(diagnosticPayload?.overall.average_band ?? null);

      setPlan(dashboardRes.items ?? []);
      setNotebook(dashboardRes.notebook ?? []);
      setRoadmap(dashboardRes.roadmap ?? []);
      setPlanStale(Boolean(dashboardRes.plan_stale));
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (humanizeError(message) === EMPTY_CATALOGUE) setEmptyCatalogue(true);
      else setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  const addWeaknessToQueue = async (
    section: SectionType,
    questionType: string,
    accuracyRatio: number | null,
  ): Promise<void> => {
    if (!accessToken) return;
    const key = `${section}::${questionType}`;
    setQueuingKey(key);
    setError(null);
    // Optimistic: mark in queue immediately so the button flips before the
    // network round-trip. We still refresh after the call.
    setSrsQueueKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    try {
      await srsAddToQueue(accessToken, {
        question_type: questionType,
        section_type: section,
        accuracy_ratio: accuracyRatio ?? 0,
        product_id: IELTS_PRACTICE_PRODUCT_ID,
      });
      await refreshSrs();
    } catch (err) {
      // Roll back the optimistic update on failure so the button reappears.
      setSrsQueueKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setError(errorText(err));
    } finally {
      setQueuingKey(null);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const handleGenerate = async (): Promise<void> => {
    if (!accessToken) return;
    try {
      setGenerating(true);
      setError(null);
      const result = await practiceGeneratePlan(accessToken, generationBody(true));
      setEmptyCatalogue(Boolean(result.empty_reason) && result.items.length === 0);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (humanizeError(message) === EMPTY_CATALOGUE) setEmptyCatalogue(true);
      else setError(errorText(err));
    } finally {
      setGenerating(false);
    }
  };

  const sectionRows = useMemo(() => {
    const sections = diagnostics?.sections;
    return SECTION_ORDER.map((section) => {
      const row = sections?.[section];
      const accuracy = row?.accuracy_ratio != null && (row.samples ?? 0) > 0 ? Math.max(0, Math.min(1, row.accuracy_ratio)) : null;
      return {
        section,
        samples: row?.samples ?? 0,
        targetBand: row?.target_band ?? targetBand,
        averageBand: row?.average_band ?? null,
        bandGap: row?.band_gap ?? null,
        accuracy,
      };
    });
  }, [diagnostics, targetBand]);

  const dailyLabMix = useMemo(() => (
    SECTION_ORDER.map((section) => {
      const sectionItems = plan.filter((item) => item.section_type === section && (item.blueprint_id || item.delivery_build_id));
      const nextItem = sectionItems.find((item) => item.status !== 'completed') ?? sectionItems[0] ?? null;
      const completed = sectionItems.filter((item) => item.status === 'completed').length;
      return {
        section,
        item: nextItem,
        total: sectionItems.length,
        completed,
      };
    })
  ), [plan]);

  const topWeaknesses = useMemo(
    () => (diagnostics?.question_types ?? []).slice(0, 6),
    [diagnostics],
  );

  const launchPlanItem = async (item: PracticePlanItem): Promise<void> => {
    if (!accessToken) return;
    if (!item.blueprint_id && !item.delivery_build_id) return;

    setLaunchingId(item.id);
    setError(null);
    try {
      const started = await practicePlanItemStart(accessToken, item.id);
      const sessionId = started.session?.id ?? started.practice_session?.session_id ?? null;
      const practiceSessionId = started.practice_session?.id ?? null;
      const firstSectionId = started.first_section_id ?? started.sections?.[0]?.id ?? null;
      const labReady = hasLabPayload(started);
      if (!sessionId) throw new Error('Practice session started without a session id');

      if (labReady && practiceSessionId) {
        navigate(`/lab/${encodeURIComponent(practiceSessionId)}?back=/dashboard`);
        return;
      }

      const runtimeQuery = new URLSearchParams({
        results_back: '/dashboard',
        review_back: '/dashboard',
        review_product_id: IELTS_PRACTICE_PRODUCT_ID,
        playbook_source: 'practice',
      }).toString();

      if (started.practice_session?.status === 'completed' || started.session?.status === 'completed') {
        navigate(`/session/${encodeURIComponent(sessionId)}/results?${runtimeQuery}`);
        return;
      }

      if (!firstSectionId) throw new Error('Practice session started without a section id');
      navigate(`/session/${encodeURIComponent(sessionId)}/${encodeURIComponent(firstSectionId)}?${runtimeQuery}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to launch plan item';
      if (message.toLowerCase().includes('plan item not found')) {
        await practiceGeneratePlan(accessToken, generationBody(false)).catch(() => null);
        await load();
        setError(t('dash.stale'));
      } else if (humanizeError(message) === EMPTY_CATALOGUE) {
        setEmptyCatalogue(true);
      } else {
        setError(errorText(err));
      }
    } finally {
      setLaunchingId((current) => (current === item.id ? null : current));
    }
  };

  const updateNotebookStatus = async (
    item: PracticeNotebookItem,
    status: 'reviewed' | 'difficult' | 'mastered' | 'archived',
  ): Promise<void> => {
    if (!accessToken) return;
    setNotebookBusyId(item.id);
    setError(null);
    try {
      const response = await practiceNotebookPatch(accessToken, item.id, status);
      setNotebook((prev) => (
        status === 'archived'
          ? prev.filter((row) => row.id !== item.id)
          : prev.map((row) => (row.id === item.id ? response.item : row))
      ));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setNotebookBusyId((current) => (current === item.id ? null : current));
    }
  };

  const planSummary = useMemo(() => {
    const total = plan.length;
    const completed = plan.filter((item) => item.status === 'completed').length;
    const active = plan.filter((item) => item.status === 'in_progress').length;
    const pending = Math.max(0, total - completed - active);
    const completion = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, active, pending, completion };
  }, [plan]);

  const notebookPreview = useMemo(() => notebook.slice(0, 4), [notebook]);
  const roadmapPreview = useMemo(() => roadmap.slice(0, 5), [roadmap]);
  const nextLabItem = useMemo(
    () => plan.find((item) => item.status !== 'completed' && (item.blueprint_id || item.delivery_build_id)) ?? plan.find((item) => item.blueprint_id || item.delivery_build_id) ?? null,
    [plan],
  );

  return (
    <PracticeShell
      reviewsDueCount={srsSummary.due}
      extraLinks={[
        { label: t('dash.anchor.labs'), href: '#practice-labs' },
        { label: t('dash.anchor.notebook'), href: '#mistake-notebook' },
        { label: t('dash.anchor.roadmap'), href: '#band-roadmap' },
      ]}
      sidebarExtra={(
        <section className="sidebar-panel sidebar-actions-panel">
          <h4>{t('dash.quick.title')}</h4>
          <button className="btn solid full" type="button" onClick={() => void handleGenerate()} disabled={generating}>
            {generating ? t('dash.quick.generating') : t('dash.quick.regenerate')}
          </button>
          <Link to="/plan" className="btn ghost full">{t('dash.quick.planBuilder')}</Link>
        </section>
      )}
    >
          <header className="practice-header glass">
            <div>
              <p className="eyebrow">{t('dash.header.eyebrow')}</p>
              <h1 style={{ overflowWrap: 'anywhere' }}>{t('dash.header.welcome', { name: displayName })}</h1>
              <p className="muted">{t('dash.header.lead')}</p>
            </div>
            <div className="top-nav-actions">
              <UniversalStreakBadge accessToken={accessToken} />
              <Link to="/today" className="btn solid">▶ {t('dash.header.start')}</Link>
              <button className="btn ghost" type="button" onClick={() => void handleGenerate()} disabled={generating}>
                {generating ? t('dash.quick.generating') : t('dash.quick.regenerate')}
              </button>
            </div>
          </header>

          {loading ? <div className="glass dashboard-alert" aria-busy="true">{t('dash.loading')}</div> : null}
          {error ? <div className="glass dashboard-alert error" role="alert">{error}</div> : null}

          <PracticeContextBanner context={context} session={contextSession} onDismiss={dismissContext} showStart />

          {emptyCatalogue ? <EmptyCatalogueCard /> : null}

          <PracticeOnboarding goals={goal} onComplete={() => { void load(); }} />

          <PreTestModeBanner targetDate={goal?.target_date ?? null} />

          <PlanNarrativeBanner accessToken={accessToken} onChanged={() => { void load(); }} />

          <PlanStaleBanner
            accessToken={accessToken}
            visible={planStale}
            onRegenerated={() => { void load(); }}
          />

          <DashboardSectionTitle
            eyebrow={t('dash.sec.coach.eyebrow')}
            title={t('dash.sec.coach.title')}
            hint={t('dash.sec.coach.hint')}
            anchorId="dashboard-coach"
          />

          <PracticeAICoachCard accessToken={accessToken} />

          <AskCoachPanel accessToken={accessToken} />

          <DashboardSectionTitle
            eyebrow={t('dash.sec.today.eyebrow')}
            title={t('dash.sec.today.title')}
            hint={t('dash.sec.today.hint')}
            anchorId="dashboard-today"
          />

          <section className="dash-two-col">
            <MockTestEntryCard hasSimulatorAccess={hasSimulatorAccess} pricingUrl={simulatorPricingUrl} />
            <section className="glass dash-card">
              <p className="eyebrow"><Sparkles size={11} style={{ verticalAlign: -2, marginRight: 4 }} aria-hidden="true" /> {t('dash.guided.eyebrow')}</p>
              <div>
                <h3>{t('dash.guided.title')}</h3>
                <p className="muted" style={{ fontSize: 14 }}>{t('dash.guided.lead')}</p>
              </div>
              <Link to="/today" className="btn solid compact" style={{ justifySelf: 'start' }}>
                {t('dash.guided.open')}
              </Link>
            </section>
          </section>

          <DashboardSectionTitle
            eyebrow={t('dash.sec.progress.eyebrow')}
            title={t('dash.sec.progress.title')}
            hint={t('dash.sec.progress.hint')}
            anchorId="dashboard-progress"
          />

          <ExamReadinessCard accessToken={accessToken} />

          <MistakeCausesCard accessToken={accessToken} />

          <section className="dash-two-col wide-first">
            <BandTrajectoryCard accessToken={accessToken} />
            <ActivityHeatmapCard accessToken={accessToken} />
          </section>

          <DashboardSectionTitle
            eyebrow={t('dash.sec.mastery.eyebrow')}
            title={t('dash.sec.mastery.title')}
            hint={t('dash.sec.mastery.hint')}
            anchorId="dashboard-mastery"
          />

          <MasteryOverviewCard accessToken={accessToken} />

          <DashboardSectionTitle
            eyebrow={t('dash.sec.plan.eyebrow')}
            title={t('dash.sec.plan.title')}
            hint={t('dash.sec.plan.hint')}
            anchorId="dashboard-labs"
          />

          <section className="glass labs-hero-card" id="practice-labs">
            <div className="labs-hero-copy">
              <p className="eyebrow">{t('dash.labs.eyebrow')}</p>
              <h2>{t('dash.labs.title')}</h2>
              <p>{t('dash.labs.lead')}</p>
              <div className="task-feature-row">
                {LAB_FEATURES.map((feature) => (
                  <span className="feature-pill" key={feature}>{t(feature)}</span>
                ))}
              </div>
              <div className="lab-section-mix" aria-label={t('dash.labs.mixAria')}>
                {dailyLabMix.map((row) => (
                  <article className={`lab-section-tile ${row.section}`} key={row.section}>
                    <div className="lab-section-tile-head">
                      <span className={sectionChipClass(row.section)}>{sectionLabel(t, row.section)}</span>
                      <span>{row.total > 0 ? t('dash.labs.doneOf', { done: row.completed, total: row.total }) : t('dash.labs.noTask')}</span>
                    </div>
                    <strong>{row.item ? getPlanItemTitle(row.item, t) : t(SECTION_FALLBACK_COPY[row.section])}</strong>
                    <p>{row.item ? getPlanItemDescription(row.item, t) : t('dash.labs.addSection')}</p>
                  </article>
                ))}
              </div>
            </div>
            <div className="labs-next-panel">
              <span className="muted">{t('dash.labs.top')}</span>
              {nextLabItem ? (
                <>
                  <strong>{getPlanItemTitle(nextLabItem, t)}</strong>
                  <p>{getPlanWhyCopy(nextLabItem, t)}</p>
                  <button className="btn solid full" type="button" onClick={() => void launchPlanItem(nextLabItem)} disabled={launchingId === nextLabItem.id}>
                    {launchingId === nextLabItem.id ? t('common.opening') : t('dash.labs.start')}
                  </button>
                </>
              ) : (
                <>
                  <strong>{t('dash.labs.none')}</strong>
                  <p>{t('dash.labs.noneLead')}</p>
                  <button className="btn solid full" type="button" onClick={() => void handleGenerate()} disabled={generating}>
                    {generating ? t('dash.quick.generating') : t('dash.labs.generate')}
                  </button>
                </>
              )}
            </div>
          </section>

          <DashboardSectionTitle
            eyebrow={t('dash.sec.review.eyebrow')}
            title={t('dash.sec.review.title')}
            hint={t('dash.sec.review.hint')}
            anchorId="dashboard-review"
          />

          <ScoreImpactCallout accessToken={accessToken} />

          <VocabFromMistakesCard accessToken={accessToken} />

          <section className="practice-grid" style={{ marginTop: 16 }}>
            <article className="glass practice-card section-progress-card">
              <h3>{t('dash.acc.title')}</h3>
              <div className="section-progress-list">
                {sectionRows.map((row) => (
                  <div key={row.section} className="section-progress-row">
                    <div className="section-progress-head">
                      <span className={sectionChipClass(row.section)}>{sectionLabel(t, row.section)}</span>
                      <span className="muted">{row.accuracy != null ? t('dash.acc.value', { value: fmt.percent(row.accuracy) }) : t('dash.acc.noData')}</span>
                    </div>
                    <div className="progress-track">
                      <div className={sectionBarClass(row.section)} style={{ width: `${Math.round((row.accuracy ?? 0) * 100)}%` }} />
                    </div>
                    <div className="section-progress-meta">
                      <span>{t('dash.acc.samples', { count: row.samples })}</span>
                      <span>{t('dash.acc.band', { current: row.averageBand != null ? fmt.band(row.averageBand) : '–', target: row.targetBand != null ? fmt.band(row.targetBand) : '–' })}</span>
                      <span>{t('dash.acc.gap', { value: row.bandGap != null ? row.bandGap.toFixed(2) : '–' })}</span>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="glass practice-card srs-card" id="srs-reviews">
              <div className="task-card-head">
                <div className="srs-card-head-titles">
                  <span className="eyebrow">{t('dash.srs.eyebrow')}</span>
                  <h3>{t('dash.srs.title')}</h3>
                </div>
                <div className="srs-card-head-actions">
                  <span className="srs-summary-pill">
                    {t('dash.srs.due', { count: srsSummary.due })}
                  </span>
                  <span className="srs-summary-pill muted">
                    {t('dash.srs.tracked', { tracked: srsQueueKeys.size, mastered: srsSummary.mastered })}
                  </span>
                  <Link to="/practice/reviews" className="btn solid compact">
                    {t('dash.srs.open')}
                  </Link>
                </div>
              </div>
              {srsItems.length === 0 ? (
                <div className="srs-empty">
                  <p className="muted">
                    {srsSummary.total === 0
                      ? t('dash.srs.emptyNever')
                      : t('dash.srs.caughtUp')}
                  </p>
                </div>
              ) : (
                <ul className="weakness-list">
                  {srsItems.slice(0, 4).map((item) => (
                    <li key={item.id} className="weakness-item">
                      <div>
                        <span className={sectionChipClass(item.section_type)}>{sectionLabel(t, item.section_type)}</span>
                        <h4>{formatPracticeLabel(item.question_type)}</h4>
                      </div>
                      <div className="weakness-metrics">
                        <span>{t('common.box', { box: item.leitner_box })}</span>
                        <span>{t('dash.srs.last', { value: item.last_accuracy_ratio != null ? fmt.percent(item.last_accuracy_ratio) : '–' })}</span>
                        <span>{t('dash.srs.reviews', { count: item.review_count })}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="glass practice-card weakness-card">
              <div className="task-card-head">
                <h3>{t('dash.weak.title')}</h3>
                <Link to="/practice/stats/by-type" className="btn ghost compact">{t('dash.weak.all')}</Link>
              </div>
              {topWeaknesses.length === 0 ? (
                <p className="muted">{t('dash.weak.empty')}</p>
              ) : (
                <ul className="weakness-list">
                  {topWeaknesses.map((row) => {
                    const queueKey = `${row.section_type}::${row.question_type}`;
                    const inQueue = srsQueueKeys.has(queueKey);
                    const isQueuing = queuingKey === queueKey;
                    return (
                      <li key={`${row.section_type}-${row.question_type}`} className="weakness-item">
                        <div>
                          <span className={sectionChipClass(row.section_type)}>{sectionLabel(t, row.section_type)}</span>
                          <h4>{formatPracticeLabel(row.question_type)}</h4>
                        </div>
                        <div className="weakness-metrics">
                          <span>{t('dash.weak.weakness', { value: row.weakness_score.toFixed(2) })}</span>
                          <span>{t('dash.weak.accuracy', { value: row.accuracy_ratio != null ? fmt.percent(row.accuracy_ratio) : '–' })}</span>
                          <span>{t('dash.weak.mastery', { value: row.mastery_level != null ? fmt.percent(row.mastery_level) : row.mastery_status ?? '–' })}</span>
                        </div>
                        <div className="weakness-actions" style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          <TeachSkillButton accessToken={accessToken} sectionType={row.section_type} questionType={row.question_type} />
                          {inQueue ? (
                            <Link to="/practice/reviews" className="btn ghost compact">{t('dash.weak.inQueue')}</Link>
                          ) : (
                            <button
                              type="button"
                              className="btn solid compact"
                              disabled={isQueuing}
                              onClick={() => void addWeaknessToQueue(row.section_type, row.question_type, row.accuracy_ratio)}
                            >
                              {isQueuing ? t('dash.weak.adding') : t('dash.weak.add')}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>

            <article className="glass practice-card notebook-card" id="mistake-notebook">
              <div className="task-card-head">
                <h3>{t('dash.nb.title')}</h3>
                <span className="muted">{t('dash.nb.active', { count: notebook.length })}</span>
              </div>
              {notebookPreview.length === 0 ? (
                <p className="muted">{t('dash.nb.empty')}</p>
              ) : (
                <ul className="notebook-list">
                  {notebookPreview.map((item) => (
                    <li key={item.id} className="notebook-item">
                      <div>
                        <span className={sectionChipClass(item.section_type)}>{sectionLabel(t, item.section_type)}</span>
                        <h4 style={{ overflowWrap: 'anywhere' }}>{item.mistake_pattern}</h4>
                        <p>{item.coach_note ?? `${formatPracticeLabel(item.question_type)} | ${formatPracticeLabel(item.trap_type)}`}</p>
                      </div>
                      <div className="notebook-actions">
                        <NotebookRetestButton accessToken={accessToken} notebookId={item.id} />
                        <button className="btn ghost compact" type="button" disabled={notebookBusyId === item.id} onClick={() => void updateNotebookStatus(item, 'reviewed')}>{t('dash.nb.reviewed')}</button>
                        <button className="btn ghost compact" type="button" disabled={notebookBusyId === item.id} onClick={() => void updateNotebookStatus(item, 'difficult')}>{t('dash.nb.hard')}</button>
                        <button className="btn ghost compact" type="button" disabled={notebookBusyId === item.id} onClick={() => void updateNotebookStatus(item, 'archived')}>{t('dash.nb.archive')}</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="glass practice-card roadmap-card" id="band-roadmap">
              <div className="task-card-head">
                <h3>{t('dash.road.title')}</h3>
                <Link to="/plan" className="btn ghost compact">{t('dash.road.tune')}</Link>
              </div>
              {roadmapPreview.length === 0 ? (
                <p className="muted">{t('dash.road.empty')}</p>
              ) : (
                <ul className="roadmap-list">
                  {roadmapPreview.map((item) => (
                    <li key={item.id} className="roadmap-item">
                      <span className={sectionChipClass(item.section_type)}>{sectionLabel(t, item.section_type)}</span>
                      <div style={{ minWidth: 0 }}>
                        <h4 style={{ overflowWrap: 'anywhere' }}>{item.title}</h4>
                        <p>{item.current_state} {'->'} {item.target_state}</p>
                      </div>
                      <strong>{formatPracticeLabel(item.linked_lab_kind ?? 'lab')}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="glass practice-card task-card">
              <div className="task-card-head">
                <h3>{t('dash.sessions.title')}</h3>
                <div className="task-summary">
                  <span>{t('dash.sessions.total', { count: planSummary.total })}</span>
                  <span>{t('dash.sessions.done', { count: planSummary.completed })}</span>
                  <span>{t('dash.sessions.pending', { count: planSummary.pending })}</span>
                </div>
              </div>

              <div className="progress-track task-progress">
                <div className="progress-fill writing" style={{ width: `${planSummary.completion}%` }} />
              </div>

              <div className="experience-strip" aria-label={t('dash.sessions.modes')}>
                {EXPERIENCE_KINDS.map((kind) => (
                  <article className="experience-mode-card" key={kind}>
                    <strong>{experienceCopy(kind, t).label}</strong>
                    <span>{experienceCopy(kind, t).short}</span>
                  </article>
                ))}
              </div>

              {plan.length === 0 ? (
                <div className="empty-plan">
                  <p>{t('dash.sessions.empty')}</p>
                  <div className="inline-actions">
                    <button className="btn solid" type="button" onClick={() => void handleGenerate()} disabled={generating}>
                      {t('dash.sessions.generate')}
                    </button>
                    <Link to="/plan" className="btn ghost">{t('dash.sessions.configure')}</Link>
                  </div>
                </div>
              ) : (
                <ul className="task-list">
                  {plan.map((item) => (
                    <li key={item.id} className="task-item">
                      <div>
                        <span className={sectionChipClass(item.section_type)}>{sectionLabel(t, item.section_type)}</span>
                        <h4>{getPlanItemTitle(item, t)}</h4>
                        <p>{getPlanItemDescription(item, t)}</p>
                        <p className="task-why">{getPlanWhyCopy(item, t)}</p>
                        <div className="task-feature-row">
                          {getPlanExperienceSteps(item, t).map((step) => (
                            <span className="feature-pill" key={step}>{step}</span>
                          ))}
                        </div>
                        <div className="task-meta-row">
                          {getPlanPersonalizationChips(item, t).map((chip) => (
                            <span key={chip}>{chip}</span>
                          ))}
                        </div>
                        {item.blueprint_id || item.delivery_build_id ? <p className="source-note">{getPlanSourceCopy(item, t)}</p> : null}
                      </div>
                      <div className="inline-actions">
                        <span className={`status-pill ${item.status}`}>{statusLabel(t, item.status)}</span>
                        {item.blueprint_id || item.delivery_build_id ? (
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => void launchPlanItem(item)}
                            disabled={launchingId === item.id}
                          >
                            {launchingId === item.id ? t('common.opening') : item.status === 'completed' ? t('dash.sessions.review') : t('dash.sessions.start')}
                          </button>
                        ) : (
                          <button className="btn ghost" type="button" onClick={() => void handleGenerate()} disabled={generating}>
                            {t('dash.sessions.refresh')}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
    </PracticeShell>
  );
};
