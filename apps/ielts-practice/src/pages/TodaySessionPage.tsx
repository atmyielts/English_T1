import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen, CheckCircle2, ChevronRight, Clock, ListChecks, PlayCircle, RotateCcw, Sparkles, Target } from 'lucide-react';
import { PracticeShell } from '../components/PracticeShell';
import {
  practiceDashboardGet,
  practiceGeneratePlan,
  practicePlanItemStart,
  srsListReviews,
  srsSubmitReview,
  type PracticePlanItem,
  type SrsReviewItem,
} from '../lib/api';
import { IELTS_PRACTICE_PRODUCT_ID } from '../lib/constants';
import {
  formatPracticeLabel,
  getPlanExperienceSteps,
  getPlanItemDescription,
  getPlanItemTitle,
  getPlanPersonalizationChips,
  getPlanQuestionTypes,
  getPlanSourceCopy,
  getPlanWhyCopy,
} from '../lib/practiceExperience';
import { useAccess } from '../lib/useAccess';

type SectionType = 'reading' | 'listening' | 'writing';
type Phase = 'srs' | 'lab' | 'mastery' | 'done';

type Weakness = {
  question_type: string;
  section_type: SectionType;
  weakness?: number;
};

const SRS_PHASE_LIMIT = 5;

const PHASES: Array<{ id: Exclude<Phase, 'done'>; kicker: string; title: string; mins: string }> = [
  { id: 'srs', kicker: 'Phase 1', title: 'Warm-up recall', mins: '~8 min' },
  { id: 'lab', kicker: 'Phase 2', title: 'Focused lab', mins: '~18 min' },
  { id: 'mastery', kicker: 'Phase 3', title: 'Mastery check', mins: '~5 min' },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toText = (value: unknown): string => String(value ?? '').trim();

const hasLabPayload = (item: { delivery_build?: { metadata?: unknown } | null }): boolean => {
  const metadata = isRecord(item.delivery_build?.metadata) ? item.delivery_build?.metadata : {};
  const labPayload = isRecord(metadata.lab_payload) ? metadata.lab_payload : {};
  return labPayload.version === 'ielts.practice.lab.v1';
};

const pickWeakestType = (diagnostics: unknown): Weakness | null => {
  if (!isRecord(diagnostics)) return null;
  const rows = Array.isArray(diagnostics.question_types) ? diagnostics.question_types : [];
  let best: Weakness | null = null;

  for (const raw of rows) {
    if (!isRecord(raw)) continue;
    const questionType = toText(raw.question_type);
    const section = toText(raw.section_type).toLowerCase();
    if (!questionType || (section !== 'reading' && section !== 'listening' && section !== 'writing')) continue;

    const weakness = Number(raw.weakness_score ?? raw.weakness ?? 0);
    if (best == null || (Number.isFinite(weakness) && weakness > (best.weakness ?? 0))) {
      best = {
        question_type: questionType,
        section_type: section,
        weakness: Number.isFinite(weakness) ? weakness : undefined,
      };
    }
  }

  return best;
};

const reviewPrompt = (item: SrsReviewItem): string => {
  const label = formatPracticeLabel(item.question_type);
  if (item.section_type === 'writing') {
    return `Write a 3-bullet plan or one upgraded sentence for ${label}. If you can do it without checking notes, mark it as recalled.`;
  }
  if (item.section_type === 'listening') {
    return `Say what you must predict, which signpost to listen for, and the distractor risk for ${label}. Then mark the recall honestly.`;
  }
  return `State the evidence rule for ${label}, name the likely trap, and explain how you would prove the answer from the passage.`;
};

const matchesQuestionType = (item: PracticePlanItem, review: Pick<SrsReviewItem, 'question_type' | 'section_type'>): boolean => {
  if (item.section_type !== review.section_type) return false;
  const questionTypes = getPlanQuestionTypes(item);
  return questionTypes.includes(review.question_type);
};

export const TodaySessionPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { accessToken, status } = useAccess();
  const returnedFromLab = searchParams.get('returned') === 'lab';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [srsItems, setSrsItems] = useState<SrsReviewItem[]>([]);
  const [srsCompletedIds, setSrsCompletedIds] = useState<Set<string>>(new Set());
  const [planItems, setPlanItems] = useState<PracticePlanItem[]>([]);
  const [diagnostics, setDiagnostics] = useState<unknown>(null);
  const [targetBand, setTargetBand] = useState<number | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<Phase | null>(null);
  const [skippedPhases, setSkippedPhases] = useState<Set<Phase>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [startingLabId, setStartingLabId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = async (): Promise<void> => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [dashboard, srs] = await Promise.all([
        practiceDashboardGet(accessToken),
        srsListReviews(accessToken, { mode: 'daily', limit: SRS_PHASE_LIMIT * 2 }),
      ]);

      setSrsItems((srs.items ?? []).slice(0, SRS_PHASE_LIMIT));
      setPlanItems(dashboard.items ?? []);
      setDiagnostics(dashboard.diagnostics_snapshot?.diagnostics ?? null);
      setTargetBand(typeof dashboard.goals?.target_overall_band === 'number' ? dashboard.goals.target_overall_band : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load today session');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, returnedFromLab]);

  const srsRemaining = useMemo(
    () => srsItems.filter((item) => !srsCompletedIds.has(item.id)),
    [srsItems, srsCompletedIds],
  );

  const actionablePlanItems = useMemo(
    () => planItems
      .filter((item) => item.status !== 'completed' && (item.blueprint_id || item.delivery_build_id))
      .sort((a, b) => a.priority - b.priority),
    [planItems],
  );

  const focusedPlanItem = actionablePlanItems[0] ?? null;
  const weakest = useMemo(() => pickWeakestType(diagnostics), [diagnostics]);
  const masteryPlanItem = useMemo(() => {
    const pool = actionablePlanItems.filter((item) => item.id !== focusedPlanItem?.id);
    if (weakest) {
      const matching = pool.find(
        (item) => item.section_type === weakest.section_type && getPlanQuestionTypes(item).includes(weakest.question_type),
      );
      if (matching) return matching;
    }
    return pool[0] ?? null;
  }, [actionablePlanItems, focusedPlanItem?.id, weakest]);

  const recommendedPhase: Phase = useMemo(() => {
    if (srsRemaining.length > 0 && srsItems.length > 0 && !skippedPhases.has('srs')) return 'srs';
    if (focusedPlanItem && !skippedPhases.has('lab')) return 'lab';
    if ((masteryPlanItem || weakest) && !skippedPhases.has('mastery')) return 'mastery';
    return 'done';
  }, [focusedPlanItem, masteryPlanItem, skippedPhases, srsItems.length, srsRemaining.length, weakest]);

  const phase = selectedPhase ?? recommendedPhase;

  const markSkipped = (current: Phase, next: Phase): void => {
    setSkippedPhases((prev) => {
      const copy = new Set(prev);
      copy.add(current);
      return copy;
    });
    setSelectedPhase(next);
  };

  const regeneratePlan = async (): Promise<void> => {
    if (!accessToken) return;
    setGenerating(true);
    setError(null);
    try {
      const response = await practiceGeneratePlan(accessToken, { refresh_diagnostics: true, daily_minutes: 50 });
      setPlanItems(response.items ?? []);
      setSelectedPhase('lab');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate today labs');
    } finally {
      setGenerating(false);
    }
  };

  const submitSrs = async (item: SrsReviewItem, kind: 'got_it' | 'need_more'): Promise<void> => {
    if (!accessToken) return;
    setBusyId(item.id);
    setError(null);
    try {
      await srsSubmitReview(accessToken, {
        question_type: item.question_type,
        section_type: item.section_type,
        accuracy_ratio: kind === 'got_it' ? 1 : 0,
        product_id: IELTS_PRACTICE_PRODUCT_ID,
      });
      setSrsCompletedIds((prev) => {
        const copy = new Set(prev);
        copy.add(item.id);
        return copy;
      });
      if (srsRemaining.length <= 1) setSelectedPhase('lab');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save review');
    } finally {
      setBusyId(null);
    }
  };

  const startLab = async (item: PracticePlanItem): Promise<void> => {
    if (!accessToken) return;
    const existingPracticeSessionId = toText(item.practice_session_id || item.practice_session?.id);
    const backPath = '/today?returned=lab';
    setStartingLabId(item.id);
    setError(null);

    try {
      if (existingPracticeSessionId && hasLabPayload(item)) {
        const query = new URLSearchParams({ back: backPath }).toString();
        navigate(`/lab/${encodeURIComponent(existingPracticeSessionId)}?${query}`);
        return;
      }

      const started = await practicePlanItemStart(accessToken, item.id);
      const sessionId = started.session?.id ?? started.practice_session?.session_id ?? null;
      const practiceSessionId = started.practice_session?.id ?? null;
      const firstSectionId = started.first_section_id ?? started.sections?.[0]?.id ?? null;

      if (practiceSessionId && hasLabPayload(started)) {
        const query = new URLSearchParams({ back: backPath }).toString();
        navigate(`/lab/${encodeURIComponent(practiceSessionId)}?${query}`);
        return;
      }

      if (!sessionId || !firstSectionId) throw new Error('Practice session started without a section id');
      const runtimeQuery = new URLSearchParams({
        results_back: backPath,
        review_back: backPath,
        review_product_id: IELTS_PRACTICE_PRODUCT_ID,
        playbook_source: 'practice',
      }).toString();
      navigate(`/session/${encodeURIComponent(sessionId)}/${encodeURIComponent(firstSectionId)}?${runtimeQuery}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start lab';
      if (message.toLowerCase().includes('plan item not found')) {
        await regeneratePlan();
        setError('That lab was stale, so I refreshed today labs.');
      } else {
        setError(message);
      }
    } finally {
      setStartingLabId(null);
    }
  };

  const renderPlanCard = (item: PracticePlanItem, actionLabel: string) => {
    const chips = getPlanPersonalizationChips(item);
    const steps = getPlanExperienceSteps(item);
    const questionTypes = getPlanQuestionTypes(item);
    const isBusy = startingLabId === item.id;

    return (
      <article className="glass practice-card session-lab-card">
        <div>
          <span className={`chip ${item.section_type}`}>{item.section_type}</span>
          <h3>{getPlanItemTitle(item)}</h3>
          <p className="muted">{getPlanItemDescription(item)}</p>
          <p className="task-why">{getPlanWhyCopy(item)}</p>
        </div>
        {questionTypes.length > 0 ? (
          <div className="task-meta-row">
            {questionTypes.slice(0, 4).map((questionType) => (
              <span key={questionType}>{formatPracticeLabel(questionType)}</span>
            ))}
          </div>
        ) : null}
        <div className="task-feature-row">
          {steps.map((step) => <span className="feature-pill" key={step}>{step}</span>)}
        </div>
        {chips.length > 0 ? (
          <div className="task-meta-row">
            {chips.map((chip) => <span key={chip}>{chip}</span>)}
          </div>
        ) : null}
        <p className="source-note">{getPlanSourceCopy(item)}</p>
        <div className="srs-review-row-actions">
          <button
            type="button"
            className="btn solid compact"
            disabled={isBusy}
            onClick={() => void startLab(item)}
          >
            {isBusy ? 'Starting...' : actionLabel}
          </button>
          <Link to="/plan" className="btn ghost compact">Edit plan</Link>
        </div>
      </article>
    );
  };

  if (status === 'loading' || loading) {
    return (
      <PracticeShell>
        <article className="glass practice-card">Loading today session...</article>
      </PracticeShell>
    );
  }

  return (
    <PracticeShell reviewsDueCount={srsRemaining.length}>
      <header className="practice-page-head">
        <div>
          <span className="eyebrow">Daily Session</span>
          <h1>Today&apos;s focused IELTS path</h1>
          <p className="muted">
            Warm-up is quick recall, not the whole practice. Use Phase 2 for the real lab and Phase 3 for a short no-hints check.
            {targetBand != null ? ` Target band ${targetBand.toFixed(1)}.` : ''}
          </p>
        </div>
        <div className="kpi-row">
          {focusedPlanItem ? (
            <button className="btn solid compact" type="button" onClick={() => void startLab(focusedPlanItem)} disabled={startingLabId === focusedPlanItem.id}>
              {startingLabId === focusedPlanItem.id ? 'Starting...' : 'Start focused lab'}
            </button>
          ) : (
            <button className="btn solid compact" type="button" onClick={() => void regeneratePlan()} disabled={generating}>
              {generating ? 'Generating...' : 'Generate labs'}
            </button>
          )}
          <Link to="/dashboard" className="btn ghost compact">Overview</Link>
        </div>
      </header>

      <nav className="session-phase-row" aria-label="Session phases">
        {PHASES.map((item) => {
          const isActive = phase === item.id;
          const isComplete =
            (item.id === 'srs' && (srsRemaining.length === 0 || skippedPhases.has('srs'))) ||
            (item.id === 'lab' && (!focusedPlanItem || skippedPhases.has('lab'))) ||
            (item.id === 'mastery' && (!masteryPlanItem && !weakest || skippedPhases.has('mastery')));
          return (
            <button
              key={item.id}
              type="button"
              className={`session-phase-button ${isActive ? 'active' : ''} ${isComplete ? 'complete' : ''}`}
              onClick={() => setSelectedPhase(item.id)}
            >
              <span>{item.kicker}</span>
              <strong>{item.title}</strong>
              <small>{item.mins}</small>
            </button>
          );
        })}
      </nav>

      {error ? <div className="glass dashboard-alert error">{error}</div> : null}

      {phase === 'srs' ? (
        <section className="srs-review-list">
          <article className="glass practice-card">
            <header className="srs-review-row-head">
              <Sparkles size={17} />
              <h3>Warm-up - recall up to {SRS_PHASE_LIMIT} weak types</h3>
              <span className="muted" style={{ marginLeft: 'auto' }}>
                {srsRemaining.length} of {srsItems.length} remaining
              </span>
            </header>
            <p className="muted">
              These cards decide what stays in your review queue. Do the tiny recall task first, then mark whether the skill is ready.
            </p>
            <div className="srs-review-row-actions">
              {focusedPlanItem ? (
                <button type="button" className="btn solid compact" onClick={() => setSelectedPhase('lab')}>
                  Go to focused lab <ChevronRight size={14} />
                </button>
              ) : null}
              <button type="button" className="btn ghost compact" onClick={() => markSkipped('srs', 'lab')}>
                Skip warm-up
              </button>
            </div>
          </article>

          {srsRemaining.length === 0 ? (
            <article className="glass practice-card">
              <h3>Warm-up is clear.</h3>
              <p className="muted">Move into the focused lab while the weak types are fresh.</p>
              <button type="button" className="btn solid compact" onClick={() => setSelectedPhase('lab')}>
                Continue to Phase 2 <ChevronRight size={14} />
              </button>
            </article>
          ) : null}

          {srsRemaining.map((item) => {
            const isBusy = busyId === item.id;
            const matchingLab = actionablePlanItems.find((planItem) => matchesQuestionType(planItem, item)) ?? focusedPlanItem;
            return (
              <article key={item.id} className="glass practice-card srs-review-row">
                <div className="srs-review-row-head">
                  <span className={`chip ${item.section_type}`}>{item.section_type}</span>
                  <h3>{formatPracticeLabel(item.question_type)}</h3>
                  <span className="muted" style={{ marginLeft: 'auto' }}>Box {item.leitner_box} / 5</span>
                </div>
                <p className="muted">{reviewPrompt(item)}</p>
                <div className="srs-review-row-meta">
                  <span>Last: {item.last_accuracy_ratio != null ? `${Math.round(item.last_accuracy_ratio * 100)}%` : '-'}</span>
                  <span>Rolling: {item.rolling_accuracy_ratio != null ? `${Math.round(item.rolling_accuracy_ratio * 100)}%` : '-'}</span>
                  <span>Reviews: {item.review_count}</span>
                </div>
                <div className="srs-review-row-actions">
                  <button
                    type="button"
                    className="btn solid compact"
                    disabled={isBusy}
                    onClick={() => void submitSrs(item, 'got_it')}
                  >
                    {isBusy ? 'Saving...' : 'I can do this'}
                  </button>
                  <button
                    type="button"
                    className="btn ghost compact"
                    disabled={isBusy}
                    onClick={() => void submitSrs(item, 'need_more')}
                  >
                    Still needs practice
                  </button>
                  {matchingLab ? (
                    <button
                      type="button"
                      className="btn ghost compact"
                      disabled={startingLabId === matchingLab.id}
                      onClick={() => void startLab(matchingLab)}
                    >
                      Start related lab
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      {phase === 'lab' ? (
        <section className="srs-review-list">
          <article className="glass practice-card">
            <header className="srs-review-row-head">
              <PlayCircle size={17} />
              <h3>Focused lab</h3>
              <span className="muted" style={{ marginLeft: 'auto' }}><Clock size={12} /> ~18 min</span>
            </header>
            <p className="muted">
              This is the main work block. It opens an actual transformed IELTS lab, not a reminder card.
            </p>
          </article>

          {focusedPlanItem ? renderPlanCard(focusedPlanItem, 'Start focused lab') : (
            <article className="glass practice-card">
              <h3>No focused lab is queued yet.</h3>
              <p className="muted">Generate today labs from your latest diagnostics, or tune the plan first.</p>
              <div className="srs-review-row-actions">
                <button type="button" className="btn solid compact" onClick={() => void regeneratePlan()} disabled={generating}>
                  {generating ? 'Generating...' : 'Generate labs'}
                </button>
                <Link to="/plan" className="btn ghost compact">Open plan</Link>
              </div>
            </article>
          )}

          <article className="glass practice-card session-continue-card">
            <button type="button" className="btn ghost compact" onClick={() => markSkipped('lab', 'mastery')}>
              Continue to mastery check <ChevronRight size={14} />
            </button>
          </article>
        </section>
      ) : null}

      {phase === 'mastery' ? (
        <section className="srs-review-list">
          <article className="glass practice-card">
            <header className="srs-review-row-head">
              <Target size={17} />
              <h3>Mastery check</h3>
              <span className="muted" style={{ marginLeft: 'auto' }}><Clock size={12} /> ~5 min</span>
            </header>
            <p className="muted">
              A short no-hints check. If there is no second lab queued, use the weakness target to generate or select the next drill.
            </p>
          </article>

          {masteryPlanItem ? renderPlanCard(masteryPlanItem, 'Start mastery check') : (
            <article className="glass practice-card">
              <div className="srs-review-row-head">
                <BookOpen size={17} />
                <h3>{weakest ? `${formatPracticeLabel(weakest.question_type)} check` : 'No mastery target yet'}</h3>
              </div>
              <p className="muted">
                {weakest
                  ? `Your latest diagnostic points to ${formatPracticeLabel(weakest.question_type)} in ${weakest.section_type}. Generate a fresh lab or open the library to queue that skill.`
                  : 'Complete a focused lab first so the mastery check has a real target.'}
              </p>
              <div className="srs-review-row-actions">
                <button type="button" className="btn solid compact" onClick={() => void regeneratePlan()} disabled={generating}>
                  {generating ? 'Generating...' : 'Generate mastery lab'}
                </button>
                <Link to="/practice/stats/by-type" className="btn ghost compact">
                  <ListChecks size={14} /> Question Types
                </Link>
                <button type="button" className="btn ghost compact" onClick={() => markSkipped('mastery', 'done')}>
                  Finish session
                </button>
              </div>
            </article>
          )}
        </section>
      ) : null}

      {phase === 'done' ? (
        <section className="srs-review-list">
          <article className="glass practice-card">
            <header className="srs-review-row-head">
              <CheckCircle2 size={18} />
              <h3>Session complete</h3>
            </header>
            <p className="muted">
              You cleared {srsCompletedIds.size} warm-up item{srsCompletedIds.size === 1 ? '' : 's'} and reviewed today work path.
            </p>
            <div className="srs-review-row-actions">
              <Link to="/dashboard" className="btn solid compact">Back to overview</Link>
              <button type="button" className="btn ghost compact" onClick={() => {
                setSkippedPhases(new Set());
                setSelectedPhase('srs');
              }}>
                <RotateCcw size={14} /> Restart phases
              </button>
            </div>
          </article>
        </section>
      ) : null}
    </PracticeShell>
  );
};
