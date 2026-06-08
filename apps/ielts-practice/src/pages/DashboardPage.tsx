import { useEffect, useId, useMemo, useState } from 'react';
import { Menu, Sparkles, X } from 'lucide-react';
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
import { IELTS_PRACTICE_PRODUCT_ID } from '../lib/constants';
import {
  EXPERIENCE_COPY,
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
  MasteryOverviewCard,
  PlanNarrativeBanner,
} from '../components/PracticeInsights';
import { NotebookRetestButton, PlanStaleBanner } from '../components/PracticeAdaptiveExtras';
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

const IELTS_SIMULATOR_DASHBOARD_URL = 'https://ielts.schood.online/dashboard';
const PLAYBOOK_URL = 'https://playbook.ielts.schood.online';

const LAB_FEATURES = [
  { title: 'Mistake Coach', copy: 'Explains why today\'s lab was selected and what trap to watch.' },
  { title: 'Evidence Locator', copy: 'Prove Reading answers with the exact sentence or paragraph.' },
  { title: 'Distractor Drill', copy: 'Classify wrong answers by trap type before moving on.' },
  { title: 'Listening Replay', copy: 'Predict, replay, catch signposts, then answer.' },
  { title: 'Writing Rewrite', copy: 'Analyse, plan, rewrite, and receive criterion feedback.' },
  { title: 'Mistake Notebook', copy: 'Keeps recurring patterns and due reviews visible.' },
  { title: 'Band Roadmap', copy: 'Connects every gap to the lab that repairs it.' },
];

const SECTION_ORDER: SectionType[] = ['reading', 'listening', 'writing'];

const SECTION_FALLBACK_COPY: Record<SectionType, string> = {
  reading: 'Evidence, distractor, timed, and mastery labs',
  listening: 'Replay, prediction, distractor, timed, and mastery labs',
  writing: 'Rewrite, planning, sentence upgrade, and feedback labs',
};

const humanizeError = (message: string): string => {
  const text = message.toLowerCase();
  if (
    text.includes('no published exercises')
    || text.includes('no published blueprints')
    || text.includes('no published practice blueprints or exercises')
    || text.includes('no published transformed ielts practice experiences')
    || text.includes('none could be selected and no fallback exercises are available')
  ) {
    return 'Practice content is being prepared. Ask an admin to run Content Factory for transformed sessions.';
  }
  if (text.includes('network') || text.includes('failed to fetch')) {
    return 'Connection issue. Please refresh and try again.';
  }
  return message;
};

export const DashboardPage = () => {
  const navigate = useNavigate();
  const sidebarMenuId = useId();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { accessToken, me, session } = useAccess({ includeEffective: true });
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
    const raw = String(me?.user.email ?? '').split('@')[0] ?? 'Learner';
    return raw.length > 0 ? raw : 'Learner';
  }, [me?.user.email, session?.user.user_metadata]);

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
      const message = err instanceof Error ? err.message : 'Failed to load dashboard';
      setError(humanizeError(message));
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
      setError(err instanceof Error ? err.message : 'Could not add to queue');
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
      await practiceGeneratePlan(accessToken, generationBody(true));
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Plan generation failed';
      setError(humanizeError(message));
    } finally {
      setGenerating(false);
    }
  };

  const sectionRows = useMemo(() => {
    const sections = diagnostics?.sections;
    return SECTION_ORDER.map((section) => {
      const row = sections?.[section];
      const accuracy = row?.accuracy_ratio != null ? Math.max(0, Math.min(1, row.accuracy_ratio)) : 0;
      return {
        section,
        samples: row?.samples ?? 0,
        targetBand: row?.target_band ?? targetBand,
        averageBand: row?.average_band ?? null,
        bandGap: row?.band_gap ?? null,
        accuracyPct: Math.round(accuracy * 100),
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
        setError('That lab was from an older generated plan, so I refreshed today\'s Practice Labs.');
      } else {
        setError(humanizeError(message));
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
      setError(err instanceof Error ? err.message : 'Failed to update notebook item');
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
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="practice-root">
      <div className="practice-workspace">
        <aside className={`practice-sidebar glass${sidebarOpen ? ' mobile-open' : ''}`}>
          <div className="practice-sidebar-head">
            <Link to="/dashboard" className="practice-sidebar-brand" onClick={closeSidebar}>
              <img src="/schood-logo.png" alt="Schood" />
              <div>
                <strong>IELTS Practice</strong>
                <span>Practice Labs workspace</span>
              </div>
            </Link>
            <button
              className="sidebar-menu-button"
              type="button"
              onClick={() => setSidebarOpen((open) => !open)}
              aria-expanded={sidebarOpen}
              aria-controls={sidebarMenuId}
            >
              {sidebarOpen ? <X size={17} strokeWidth={2.4} /> : <Menu size={17} strokeWidth={2.4} />}
              Menu
            </button>
          </div>

          <div id={sidebarMenuId} className="practice-sidebar-menu">
            <nav className="practice-sidebar-nav">
              <Link to="/today" className="sidebar-link" onClick={closeSidebar} title="Your guided daily session">Today</Link>
              <Link to="/dashboard" className="sidebar-link active" onClick={closeSidebar} title="Bands, mastery & mistakes">Progress</Link>
              <Link to="/plan" className="sidebar-link" onClick={closeSidebar} title="Goal & schedule">Plan</Link>

              <span className="sidebar-nav-label muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.6, padding: '8px 0 2px' }}>More</span>
              <Link to="/practice/reviews" className="sidebar-link" onClick={closeSidebar}>
                Reviews due{srsSummary.due > 0 ? ` (${srsSummary.due})` : ''}
              </Link>
              <Link to="/practice/stats/by-type" className="sidebar-link" onClick={closeSidebar}>Stats by type</Link>
              <a href="#practice-labs" className="sidebar-link" onClick={closeSidebar}>Practice Labs</a>
              <a href="#mistake-notebook" className="sidebar-link" onClick={closeSidebar}>Notebook</a>
              <a href="#band-roadmap" className="sidebar-link" onClick={closeSidebar}>Roadmap</a>
              <a href={IELTS_SIMULATOR_DASHBOARD_URL} className="sidebar-link" onClick={closeSidebar}>IELTS Simulator</a>
              <a href={`${PLAYBOOK_URL}/dashboard?source=practice`} className="sidebar-link" onClick={closeSidebar}>IELTS Playbook</a>
            </nav>

            <section className="sidebar-panel sidebar-actions-panel">
              <h4>Quick Actions</h4>
              <button
                className="btn solid full"
                type="button"
                onClick={() => {
                  closeSidebar();
                  void handleGenerate();
                }}
                disabled={generating}
              >
                {generating ? 'Generating...' : 'Regenerate Plan'}
              </button>
              <Link to="/plan" className="btn ghost full" onClick={closeSidebar}>Open Plan Builder</Link>
            </section>
          </div>
        </aside>

        <main className="practice-main">
          <header className="practice-header glass">
            <div>
              <p className="eyebrow">Progress &amp; insights</p>
              <h1>Welcome back, {displayName}</h1>
              <p className="muted">
                Your bands, mastery, mistakes, and roadmap. When you’re ready to train, head to today’s guided session.
              </p>
            </div>
            <div className="top-nav-actions">
              <UniversalStreakBadge accessToken={accessToken} />
              <Link to="/today" className="btn solid">▶ Start today’s session</Link>
              <button className="btn ghost" type="button" onClick={() => void handleGenerate()} disabled={generating}>
                {generating ? 'Regenerating…' : 'Regenerate plan'}
              </button>
            </div>
          </header>

          {loading ? <div className="glass dashboard-alert">Loading IELTS practice workspace...</div> : null}
          {error ? <div className="glass dashboard-alert error">{error}</div> : null}

          <PracticeOnboarding goals={goal} onComplete={() => { void load(); }} />

          <PreTestModeBanner targetDate={goal?.target_date ?? null} />

          <PlanNarrativeBanner accessToken={accessToken} />

          <PlanStaleBanner
            accessToken={accessToken}
            visible={planStale}
            onRegenerated={() => { void load(); }}
          />

          <DashboardSectionTitle
            eyebrow="Coach"
            title="What to focus on right now"
            hint="AI-generated insights from your trajectory, streak, and mastery. Refreshes every 8 hours."
            anchorId="dashboard-coach"
          />

          <PracticeAICoachCard accessToken={accessToken} />

          <DashboardSectionTitle
            eyebrow="Today"
            title="Your next move"
            hint="Pick the focused session or run a full mock under exam conditions."
            anchorId="dashboard-today"
          />

          <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
            <MockTestEntryCard />
            <section className="glass" style={{ padding: 22, display: 'grid', gap: 12 }}>
              <p className="eyebrow"><Sparkles size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Guided session</p>
              <div>
                <h3 style={{ margin: '0 0 4px' }}>30-minute focused session</h3>
                <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                  Spaced reviews → one focused lab → mastery check. Walks you through in order with skip buttons at every phase.
                </p>
              </div>
              <Link to="/today" className="btn solid compact" style={{ alignSelf: 'flex-start' }}>
                Open today’s session
              </Link>
            </section>
          </section>

          <DashboardSectionTitle
            eyebrow="Progress"
            title="Where you stand"
            hint="Real-time band trajectory and your study consistency over 90 days."
            anchorId="dashboard-progress"
          />

          <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 16 }}>
            <BandTrajectoryCard accessToken={accessToken} />
            <ActivityHeatmapCard accessToken={accessToken} />
          </section>

          <DashboardSectionTitle
            eyebrow="Mastery"
            title="What you’ve repaired"
            hint="Question types you've drilled and the trap patterns most often catching you."
            anchorId="dashboard-mastery"
          />

          <MasteryOverviewCard accessToken={accessToken} />

          <DashboardSectionTitle
            eyebrow="Plan"
            title="Today’s adaptive labs"
            hint="Transformed simulator material rebuilt for repair, not retake."
            anchorId="dashboard-labs"
          />

          <section className="glass labs-hero-card" id="practice-labs">
            <div className="labs-hero-copy">
              <p className="eyebrow">Practice Labs</p>
              <h2>Practice Labs train Reading, Listening, and Writing.</h2>
              <p>
                The top recommendation changes with your diagnostic; today&apos;s mix keeps all three IELTS sections visible.
              </p>
              <div className="task-feature-row">
                {LAB_FEATURES.map((feature) => (
                  <span className="feature-pill" key={feature.title}>{feature.title}</span>
                ))}
              </div>
              <div className="lab-section-mix" aria-label="Today's Reading, Listening, and Writing lab mix">
                {dailyLabMix.map((row) => (
                  <article className={`lab-section-tile ${row.section}`} key={row.section}>
                    <div className="lab-section-tile-head">
                      <span className={sectionChipClass(row.section)}>{row.section}</span>
                      <span>{row.total > 0 ? `${row.completed}/${row.total} done` : 'no task yet'}</span>
                    </div>
                    <strong>{row.item ? getPlanItemTitle(row.item) : SECTION_FALLBACK_COPY[row.section]}</strong>
                    <p>{row.item ? getPlanItemDescription(row.item) : 'Regenerate the plan to add this section to today.'}</p>
                  </article>
                ))}
              </div>
            </div>
            <div className="labs-next-panel">
              <span className="muted">Top priority lab</span>
              {nextLabItem ? (
                <>
                  <strong>{getPlanItemTitle(nextLabItem)}</strong>
                  <p>{getPlanWhyCopy(nextLabItem)}</p>
                  <button className="btn solid full" type="button" onClick={() => void launchPlanItem(nextLabItem)} disabled={launchingId === nextLabItem.id}>
                    {launchingId === nextLabItem.id ? 'Opening...' : 'Start lab'}
                  </button>
                </>
              ) : (
                <>
                  <strong>No lab in today&apos;s plan yet</strong>
                  <p>Generate a plan to create lab-ready tasks from your diagnostics.</p>
                  <button className="btn solid full" type="button" onClick={() => void handleGenerate()} disabled={generating}>
                    {generating ? 'Generating...' : 'Generate labs'}
                  </button>
                </>
              )}
            </div>
          </section>

          <DashboardSectionTitle
            eyebrow="Review"
            title="Practice queues + mistake notebook"
            hint="The drills that keep what you've learned from slipping away."
            anchorId="dashboard-review"
          />

          <ScoreImpactCallout accessToken={accessToken} />

          <VocabFromMistakesCard accessToken={accessToken} />

          <section className="practice-grid" style={{ marginTop: 16 }}>
            <article className="glass practice-card section-progress-card">
              <h3>Section accuracy</h3>
              <div className="section-progress-list">
                {sectionRows.map((row) => (
                  <div key={row.section} className="section-progress-row">
                    <div className="section-progress-head">
                      <span className={sectionChipClass(row.section)}>{row.section}</span>
                      <span className="muted">{row.accuracyPct}% accuracy</span>
                    </div>
                    <div className="progress-track">
                      <div className={sectionBarClass(row.section)} style={{ width: `${row.accuracyPct}%` }} />
                    </div>
                    <div className="section-progress-meta">
                      <span>Samples: {row.samples}</span>
                      <span>Band: {row.averageBand != null ? row.averageBand.toFixed(1) : '-'} / {row.targetBand != null ? row.targetBand.toFixed(1) : '-'}</span>
                      <span>Gap: {row.bandGap != null ? row.bandGap.toFixed(2) : '-'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="glass practice-card srs-card" id="srs-reviews">
              <div className="task-card-head">
                <div className="srs-card-head-titles">
                  <span className="eyebrow">Spaced repetition</span>
                  <h3>Reviews due today</h3>
                </div>
                <div className="srs-card-head-actions">
                  <span className="srs-summary-pill">
                    <strong>{srsSummary.due}</strong> due
                  </span>
                  <span className="srs-summary-pill muted">
                    {srsQueueKeys.size} tracked - {srsSummary.mastered} mastered
                  </span>
                  <Link to="/practice/reviews" className="btn solid compact">
                    Open queue
                  </Link>
                </div>
              </div>
              {srsItems.length === 0 ? (
                <div className="srs-empty">
                  <p className="muted">
                    {srsSummary.total === 0
                      ? "Nothing tracked yet. Use Add to queue on a weak type below, or submit a practice lab to start filling your queue automatically."
                      : "You're caught up. Items return to the queue on a Leitner schedule (1, 2, 4, 8, 16 days)."}
                  </p>
                </div>
              ) : (
                <ul className="weakness-list">
                  {srsItems.slice(0, 4).map((item) => (
                    <li key={item.id} className="weakness-item">
                      <div>
                        <span className={sectionChipClass(item.section_type)}>{item.section_type}</span>
                        <h4>{formatPracticeLabel(item.question_type)}</h4>
                      </div>
                      <div className="weakness-metrics">
                        <span>Box {item.leitner_box}/5</span>
                        <span>Last {item.last_accuracy_ratio != null ? `${Math.round(item.last_accuracy_ratio * 100)}%` : '-'}</span>
                        <span>Reviews {item.review_count}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="glass practice-card weakness-card">
              <div className="task-card-head">
                <h3>Top Weaknesses By Question Type</h3>
                <Link to="/practice/stats/by-type" className="btn ghost compact">See all</Link>
              </div>
              {topWeaknesses.length === 0 ? (
                <p className="muted">No diagnostic weaknesses yet. Complete simulator attempts or regenerate diagnostics.</p>
              ) : (
                <ul className="weakness-list">
                  {topWeaknesses.map((row) => {
                    const queueKey = `${row.section_type}::${row.question_type}`;
                    const inQueue = srsQueueKeys.has(queueKey);
                    const isQueuing = queuingKey === queueKey;
                    return (
                      <li key={`${row.section_type}-${row.question_type}`} className="weakness-item">
                        <div>
                          <span className={sectionChipClass(row.section_type)}>{row.section_type}</span>
                          <h4>{formatPracticeLabel(row.question_type)}</h4>
                        </div>
                        <div className="weakness-metrics">
                          <span>Weakness {row.weakness_score.toFixed(2)}</span>
                          <span>Accuracy {row.accuracy_ratio != null ? `${Math.round(row.accuracy_ratio * 100)}%` : '-'}</span>
                          <span>Mastery {row.mastery_level != null ? `${Math.round(row.mastery_level * 100)}%` : row.mastery_status ?? '-'}</span>
                        </div>
                        <div className="weakness-actions" style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          {inQueue ? (
                            <Link to="/practice/reviews" className="btn ghost compact">In queue</Link>
                          ) : (
                            <button
                              type="button"
                              className="btn solid compact"
                              disabled={isQueuing}
                              onClick={() => void addWeaknessToQueue(row.section_type, row.question_type, row.accuracy_ratio)}
                            >
                              {isQueuing ? 'Adding...' : 'Add to queue'}
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
                <h3>Mistake Notebook</h3>
                <span className="muted">{notebook.length} active</span>
              </div>
              {notebookPreview.length === 0 ? (
                <p className="muted">Mistake patterns will appear after lab submissions.</p>
              ) : (
                <ul className="notebook-list">
                  {notebookPreview.map((item) => (
                    <li key={item.id} className="notebook-item">
                      <div>
                        <span className={sectionChipClass(item.section_type)}>{item.section_type}</span>
                        <h4>{item.mistake_pattern}</h4>
                        <p>{item.coach_note ?? `${formatPracticeLabel(item.question_type)} | ${formatPracticeLabel(item.trap_type)}`}</p>
                      </div>
                      <div className="notebook-actions">
                        <NotebookRetestButton accessToken={accessToken} notebookId={item.id} />
                        <button className="btn ghost compact" type="button" disabled={notebookBusyId === item.id} onClick={() => void updateNotebookStatus(item, 'reviewed')}>Reviewed</button>
                        <button className="btn ghost compact" type="button" disabled={notebookBusyId === item.id} onClick={() => void updateNotebookStatus(item, 'difficult')}>Hard</button>
                        <button className="btn ghost compact" type="button" disabled={notebookBusyId === item.id} onClick={() => void updateNotebookStatus(item, 'archived')}>Archive</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="glass practice-card roadmap-card" id="band-roadmap">
              <div className="task-card-head">
                <h3>Band Roadmap</h3>
                <Link to="/plan" className="btn ghost compact">Tune goal</Link>
              </div>
              {roadmapPreview.length === 0 ? (
                <p className="muted">Roadmap items are created from your diagnostics and target band.</p>
              ) : (
                <ul className="roadmap-list">
                  {roadmapPreview.map((item) => (
                    <li key={item.id} className="roadmap-item">
                      <span className={sectionChipClass(item.section_type)}>{item.section_type}</span>
                      <div>
                        <h4>{item.title}</h4>
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
                <h3>Today's Adaptive Sessions</h3>
                <div className="task-summary">
                  <span>Total {planSummary.total}</span>
                  <span>Done {planSummary.completed}</span>
                  <span>Pending {planSummary.pending}</span>
                </div>
              </div>

              <div className="progress-track task-progress">
                <div className="progress-fill writing" style={{ width: `${planSummary.completion}%` }} />
              </div>

              <div className="experience-strip" aria-label="Available transformed practice modes">
                {EXPERIENCE_KINDS.map((kind) => (
                  <article className="experience-mode-card" key={kind}>
                    <strong>{EXPERIENCE_COPY[kind].label}</strong>
                    <span>{EXPERIENCE_COPY[kind].short}</span>
                  </article>
                ))}
              </div>

              {plan.length === 0 ? (
                <div className="empty-plan">
                  <p>No practice sessions are available in today's plan yet.</p>
                  <div className="inline-actions">
                    <button className="btn solid" type="button" onClick={() => void handleGenerate()} disabled={generating}>
                      Generate Now
                    </button>
                    <Link to="/plan" className="btn ghost">Configure Plan</Link>
                  </div>
                </div>
              ) : (
                <ul className="task-list">
                  {plan.map((item) => (
                    <li key={item.id} className="task-item">
                      <div>
                        <span className={sectionChipClass(item.section_type)}>{item.section_type}</span>
                        <h4>{getPlanItemTitle(item)}</h4>
                        <p>{getPlanItemDescription(item)}</p>
                        <p className="task-why">{getPlanWhyCopy(item)}</p>
                        <div className="task-feature-row">
                          {getPlanExperienceSteps(item).map((step) => (
                            <span className="feature-pill" key={step}>{step}</span>
                          ))}
                        </div>
                        <div className="task-meta-row">
                          {getPlanPersonalizationChips(item).map((chip) => (
                            <span key={chip}>{chip}</span>
                          ))}
                        </div>
                        {item.blueprint_id || item.delivery_build_id ? <p className="source-note">{getPlanSourceCopy(item)}</p> : null}
                      </div>
                      <div className="inline-actions">
                        <span className={`status-pill ${item.status}`}>{item.status.replace('_', ' ')}</span>
                        {item.blueprint_id || item.delivery_build_id ? (
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => void launchPlanItem(item)}
                            disabled={launchingId === item.id}
                          >
                            {launchingId === item.id ? 'Opening...' : item.status === 'completed' ? 'Review' : 'Start'}
                          </button>
                        ) : (
                          <button className="btn ghost" type="button" onClick={() => void handleGenerate()} disabled={generating}>
                            Refresh
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        </main>
      </div>
    </div>
  );
};
