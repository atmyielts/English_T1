import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  learningProfileV2,
  practiceDiagnosticsGet,
  practiceGeneratePlan,
  practiceGoalsGet,
  practiceNotebookList,
  practiceNotebookPatch,
  practicePlanItemStart,
  practiceRoadmapList,
  practiceTodayPlan,
  type PracticeNotebookItem,
  type PracticePlanItem,
  type PracticeRoadmapItem,
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
import { supabase } from '../lib/supabase';

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

const isCurrentTransformedItem = (item: PracticePlanItem): boolean => {
  if (!item.blueprint_id && !item.delivery_build_id) return false;
  const buildSummary = isRecord(item.delivery_build?.build_summary) ? item.delivery_build?.build_summary as Record<string, unknown> : {};
  const metadata = isRecord(item.delivery_build?.metadata) ? item.delivery_build?.metadata as Record<string, unknown> : {};
  const labPayload = isRecord(metadata.lab_payload) ? metadata.lab_payload as Record<string, unknown> : {};
  return (
    buildSummary.transformed === true
    && typeof buildSummary.source_section_id === 'string'
    && buildSummary.source_section_id.length > 0
    && labPayload.version === 'ielts.practice.lab.v1'
  );
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
  const { accessToken, me, session } = useAccess({ includeEffective: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetBand, setTargetBand] = useState<number | null>(null);
  const [averageBand, setAverageBand] = useState<number | null>(null);
  const [plan, setPlan] = useState<PracticePlanItem[]>([]);
  const [sharedSignals, setSharedSignals] = useState<number | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsPayload | null>(null);
  const [notebook, setNotebook] = useState<PracticeNotebookItem[]>([]);
  const [roadmap, setRoadmap] = useState<PracticeRoadmapItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [notebookBusyId, setNotebookBusyId] = useState<string | null>(null);
  const [profileNameFromDb, setProfileNameFromDb] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadProfileName = async (): Promise<void> => {
      const userId = session?.user.id;
      if (!userId) {
        setProfileNameFromDb(null);
        return;
      }

      try {
        const { data, error: profileError } = await supabase
          .from('user_profiles')
          .select('first_name,last_name')
          .eq('user_id', userId)
          .maybeSingle();

        if (cancelled) return;
        if (profileError || !data) {
          setProfileNameFromDb(null);
          return;
        }

        const first = typeof data.first_name === 'string' ? data.first_name.trim() : '';
        const last = typeof data.last_name === 'string' ? data.last_name.trim() : '';
        const full = `${first} ${last}`.trim();
        setProfileNameFromDb(full || null);
      } catch {
        if (!cancelled) setProfileNameFromDb(null);
      }
    };

    void loadProfileName();

    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  const displayName = useMemo(() => {
    if (profileNameFromDb) return profileNameFromDb;
    const first = String(session?.user.user_metadata?.first_name ?? '').trim();
    const last = String(session?.user.user_metadata?.last_name ?? '').trim();
    const full = `${first} ${last}`.trim();
    if (full) return full;
    const fullName = String(session?.user.user_metadata?.full_name ?? '').trim();
    if (fullName) return fullName;
    const raw = String(me?.user.email ?? '').split('@')[0] ?? 'Learner';
    return raw.length > 0 ? raw : 'Learner';
  }, [me?.user.email, profileNameFromDb, session?.user.user_metadata]);

  const load = async (forceDiagnostics = false, autoGenerate = false): Promise<void> => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [goalsRes, diagnosticsRes, planRes, profileRes, notebookRes, roadmapRes] = await Promise.all([
        practiceGoalsGet(accessToken),
        practiceDiagnosticsGet(accessToken, { refresh: forceDiagnostics }),
        practiceTodayPlan(accessToken),
        learningProfileV2(accessToken, { productId: IELTS_PRACTICE_PRODUCT_ID, languageCode: 'en' }).catch(() => null),
        practiceNotebookList(accessToken).catch(() => ({ items: [] as PracticeNotebookItem[] })),
        practiceRoadmapList(accessToken, { refresh: forceDiagnostics }).catch(() => ({ items: [] as PracticeRoadmapItem[] })),
      ]);

      setTargetBand(toNumber(goalsRes.goals.target_overall_band));

      const diagnosticPayload = normalizeDiagnostics(diagnosticsRes.diagnostics_snapshot?.diagnostics);
      setDiagnostics(diagnosticPayload);
      setAverageBand(diagnosticPayload?.overall.average_band ?? null);

      let todayPlan = planRes.items ?? [];
      const hasOutdatedPlanItems = todayPlan.some((item) => !isCurrentTransformedItem(item));
      if ((todayPlan.length === 0 || hasOutdatedPlanItems) && autoGenerate) {
        const generated = await practiceGeneratePlan(accessToken, { refresh_diagnostics: false });
        todayPlan = generated.items ?? [];
      }
      setPlan(todayPlan);
      setNotebook(notebookRes.items ?? []);
      setRoadmap(roadmapRes.items ?? []);

      const profileSignals = Number((profileRes as { language_projection?: { signals_count?: number } } | null)?.language_projection?.signals_count ?? NaN);
      setSharedSignals(Number.isFinite(profileSignals) ? profileSignals : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard';
      setError(humanizeError(message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(false, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const handleGenerate = async (): Promise<void> => {
    if (!accessToken) return;
    try {
      setGenerating(true);
      setError(null);
      await practiceGeneratePlan(accessToken, { refresh_diagnostics: true });
      await load(true, false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Plan generation failed';
      setError(humanizeError(message));
    } finally {
      setGenerating(false);
    }
  };

  const sectionRows = useMemo(() => {
    const sections = diagnostics?.sections;
    return (['reading', 'listening', 'writing'] as const).map((section) => {
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
      setError(humanizeError(err instanceof Error ? err.message : 'Failed to launch plan item'));
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

  return (
    <div className="practice-root">
      <div className="practice-workspace">
        <aside className="practice-sidebar glass">
          <div className="practice-sidebar-brand">
            <img src="/schood-logo.png" alt="Schood" />
            <div>
              <strong>IELTS Practice</strong>
              <span>Practice Labs workspace</span>
            </div>
          </div>

          <nav className="practice-sidebar-nav">
            <Link to="/dashboard" className="sidebar-link active">Dashboard</Link>
            <a href="#practice-labs" className="sidebar-link">Practice Labs</a>
            <Link to="/plan" className="sidebar-link">Plan Builder</Link>
            <a href="#mistake-notebook" className="sidebar-link">Notebook</a>
            <a href="#band-roadmap" className="sidebar-link">Roadmap</a>
            <a href={IELTS_SIMULATOR_DASHBOARD_URL} className="sidebar-link">IELTS Simulator</a>
            <a href={`${PLAYBOOK_URL}/dashboard?source=practice`} className="sidebar-link">IELTS Playbook</a>
          </nav>

          <section className="sidebar-panel">
            <h4>Band Target</h4>
            <div className="sidebar-target-row">
              <strong>{targetBand != null ? targetBand.toFixed(1) : '-'}</strong>
              <span>goal</span>
            </div>
            <div className="sidebar-target-row muted">
              <strong>{averageBand != null ? averageBand.toFixed(1) : '-'}</strong>
              <span>current</span>
            </div>
          </section>

          <section className="sidebar-panel">
            <h4>Quick Actions</h4>
            <button className="btn solid full" type="button" onClick={() => void handleGenerate()} disabled={generating}>
              {generating ? 'Generating...' : 'Regenerate Plan'}
            </button>
            <Link to="/plan" className="btn ghost full">Open Plan Builder</Link>
          </section>
        </aside>

        <main className="practice-main">
          <header className="practice-header glass">
            <div>
              <p className="eyebrow">Schood IELTS Practice</p>
              <h1>Welcome back, {displayName}</h1>
              <p className="muted">
                Train inside Practice Labs built from your IELTS Simulator results: coaching, repair, replay, rewriting, notebook, and roadmap.
              </p>
            </div>
            <div className="top-nav-actions">
              <Link to="/plan" className="btn ghost">Daily Plan</Link>
              {nextLabItem ? (
                <button className="btn solid" type="button" onClick={() => void launchPlanItem(nextLabItem)} disabled={launchingId === nextLabItem.id}>
                  {launchingId === nextLabItem.id ? 'Opening...' : 'Start next lab'}
                </button>
              ) : null}
              <button className="btn solid" type="button" onClick={() => void handleGenerate()} disabled={generating}>
                {generating ? 'Regenerating...' : 'Regenerate'}
              </button>
            </div>
          </header>

          {loading ? <div className="glass dashboard-alert">Loading IELTS practice workspace...</div> : null}
          {error ? <div className="glass dashboard-alert error">{error}</div> : null}

          <section className="glass labs-hero-card" id="practice-labs">
            <div className="labs-hero-copy">
              <p className="eyebrow">Practice Labs</p>
              <h2>The new IELTS Practice is not a retake player.</h2>
              <p>
                It turns simulator source material into seven lab workflows: coach, evidence, distractor, replay, rewrite, notebook, and roadmap.
              </p>
              <div className="task-feature-row">
                {LAB_FEATURES.map((feature) => (
                  <span className="feature-pill" key={feature.title}>{feature.title}</span>
                ))}
              </div>
            </div>
            <div className="labs-next-panel">
              <span className="muted">Next best lab</span>
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

          <section className="practice-kpi-grid">
            <article className="glass kpi-card">
              <h3>Target Band</h3>
              <div className="kpi-value">{targetBand != null ? targetBand.toFixed(1) : '-'}</div>
              <p className="muted">Configured objective for IELTS progression.</p>
            </article>
            <article className="glass kpi-card">
              <h3>Current Average</h3>
              <div className="kpi-value">{averageBand != null ? averageBand.toFixed(1) : '-'}</div>
              <p className="muted">Derived from recent simulator and practice outcomes.</p>
            </article>
            <article className="glass kpi-card">
              <h3>Shared Profile Signals</h3>
              <div className="kpi-value">{sharedSignals != null ? String(sharedSignals) : '-'}</div>
              <p className="muted">Language-scoped signals already merged in English profile.</p>
            </article>
          </section>

          <section className="practice-grid">
            <article className="glass practice-card section-progress-card">
              <h3>Section Progress</h3>
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

            <article className="glass practice-card weakness-card">
              <h3>Top Weaknesses By Question Type</h3>
              {topWeaknesses.length === 0 ? (
                <p className="muted">No diagnostic weaknesses yet. Complete simulator attempts or regenerate diagnostics.</p>
              ) : (
                <ul className="weakness-list">
                  {topWeaknesses.map((row) => (
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
                    </li>
                  ))}
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
