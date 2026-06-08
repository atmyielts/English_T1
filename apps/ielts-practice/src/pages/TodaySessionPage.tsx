import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Clock, PlayCircle, Sparkles, Target } from 'lucide-react';
import {
  practiceDashboardGet,
  practicePlanItemStart,
  srsListReviews,
  srsSubmitReview,
  type PracticePlanItem,
  type SrsReviewItem,
} from '../lib/api';
import { formatPracticeLabel } from '../lib/practiceExperience';
import { useAccess } from '../lib/useAccess';
import { IELTS_PRACTICE_PRODUCT_ID } from '../lib/constants';
import { PracticeShell } from '../components/PracticeShell';

type Phase = 'srs' | 'labs' | 'mastery' | 'done';
type PhaseLabel = { id: Phase; label: string; mins: string };

const PHASES: PhaseLabel[] = [
  { id: 'srs', label: 'Warm up: spaced review', mins: '~8 min' },
  { id: 'labs', label: 'Focused lab', mins: '~18 min' },
  { id: 'mastery', label: 'Mastery check', mins: '~5 min' },
];

const SRS_PHASE_LIMIT = 5;

const isJsonRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const pickWeakestType = (
  diagnostics: unknown,
): { question_type: string; section_type: string; weakness?: number } | null => {
  if (!isJsonRecord(diagnostics)) return null;
  const rows = Array.isArray((diagnostics as { question_types?: unknown }).question_types)
    ? ((diagnostics as { question_types: unknown[] }).question_types)
    : [];
  let best: { question_type: string; section_type: string; weakness?: number } | null = null;
  for (const raw of rows) {
    if (!isJsonRecord(raw)) continue;
    const qt = String(raw.question_type ?? '').trim();
    const sec = String(raw.section_type ?? '').trim().toLowerCase();
    if (!qt || !sec) continue;
    const weakness = Number(raw.weakness_score ?? raw.weakness ?? 0);
    if (best == null || (Number.isFinite(weakness) && weakness > (best.weakness ?? 0))) {
      best = { question_type: qt, section_type: sec, weakness: Number.isFinite(weakness) ? weakness : undefined };
    }
  }
  return best;
};

export const TodaySessionPage = () => {
  const navigate = useNavigate();
  const { accessToken, status } = useAccess();
  const [searchParams] = useSearchParams();
  const returningFromLab = searchParams.get('returning') === 'lab';
  const focusSection = searchParams.get('focus_section');
  const focusQuestionType = searchParams.get('focus_question_type');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [srsItems, setSrsItems] = useState<SrsReviewItem[]>([]);
  const [srsCompletedIds, setSrsCompletedIds] = useState<Set<string>>(new Set());
  const [planItems, setPlanItems] = useState<PracticePlanItem[]>([]);
  const [diagnostics, setDiagnostics] = useState<unknown>(null);
  const [targetBand, setTargetBand] = useState<number | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [startingLabId, setStartingLabId] = useState<string | null>(null);
  const [manualAdvance, setManualAdvance] = useState<Set<Phase>>(new Set());

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [dash, srs] = await Promise.all([
        practiceDashboardGet(accessToken),
        srsListReviews(accessToken, { mode: 'daily', limit: SRS_PHASE_LIMIT * 2 }),
      ]);
      setSrsItems(srs.items.slice(0, SRS_PHASE_LIMIT));
      setPlanItems(dash.items);
      setDiagnostics(dash.diagnostics_snapshot?.diagnostics ?? null);
      setTargetBand(typeof dash.goals?.target_overall_band === 'number' ? dash.goals.target_overall_band : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load today’s session');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, returningFromLab]);

  const srsRemaining = useMemo(
    () => srsItems.filter((item) => !srsCompletedIds.has(item.id)),
    [srsItems, srsCompletedIds],
  );

  const pendingPlanItem = useMemo(
    () => planItems.find((item) => item.status !== 'completed' && (item.blueprint_id || item.delivery_build_id)),
    [planItems],
  );

  const weakest = useMemo(() => pickWeakestType(diagnostics), [diagnostics]);
  const masteryPlanItem = useMemo(() => {
    if (!weakest) return null;
    return planItems.find(
      (item) =>
        item.section_type === weakest.section_type &&
        item.status !== 'completed' &&
        item.id !== pendingPlanItem?.id &&
        (item.blueprint_id || item.delivery_build_id),
    ) ?? null;
  }, [planItems, weakest, pendingPlanItem]);

  const phase: Phase = useMemo(() => {
    const srsDone = manualAdvance.has('srs') || srsRemaining.length === 0;
    if (!srsDone && srsItems.length > 0) return 'srs';
    const labsDone = manualAdvance.has('labs') || pendingPlanItem == null;
    if (!labsDone) return 'labs';
    const masteryDone = manualAdvance.has('mastery') || (masteryPlanItem == null && weakest == null);
    if (!masteryDone) return 'mastery';
    return 'done';
  }, [srsRemaining, srsItems, manualAdvance, pendingPlanItem, masteryPlanItem, weakest]);

  const submitSrs = async (item: SrsReviewItem, kind: 'got_it' | 'need_more') => {
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
        const next = new Set(prev);
        next.add(item.id);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save review');
    } finally {
      setBusyId(null);
    }
  };

  const startLab = async (item: PracticePlanItem) => {
    if (!accessToken) return;
    setStartingLabId(item.id);
    setError(null);
    try {
      const { practice_session } = await practicePlanItemStart(accessToken, item.id);
      const sessionId = practice_session?.id;
      if (!sessionId) throw new Error('No practice session returned');
      navigate(`/lab/${sessionId}?back=/today&returning=lab`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start lab');
    } finally {
      setStartingLabId(null);
    }
  };

  const advance = (current: Phase) => {
    setManualAdvance((prev) => {
      const next = new Set(prev);
      next.add(current);
      return next;
    });
  };

  if (status === 'loading' || loading) {
    return (
      <PracticeShell>
        <article className="glass practice-card">Loading today’s session…</article>
      </PracticeShell>
    );
  }

  return (
    <PracticeShell reviewsDueCount={srsRemaining.length}>
      <header className="practice-page-head">
        <div>
          <span className="eyebrow">Daily session</span>
          <h1>Today’s 30-minute plan</h1>
          <p>
            One guided path: a short warm-up of spaced reviews, a focused lab from your plan, and a closing
            mastery check. {targetBand != null ? `Target band ${targetBand.toFixed(1)}.` : ''}
          </p>
          {focusQuestionType ? (
            <div
              className="glass dashboard-alert"
              style={{ marginTop: 12, borderLeft: '3px solid #b6512c' }}
            >
              <strong>Drilling {focusQuestionType.replace(/_/g, ' ')}</strong>
              {focusSection ? <span> ({focusSection})</span> : null} — opened from your reviews queue.
              Pick the matching lab below if it’s in today’s plan, otherwise generate a fresh one.
            </div>
          ) : null}
        </div>
      </header>

      <nav className="p2-step-track" aria-label="Session progress">
        {PHASES.map((p, idx) => {
          const isActive = p.id === phase;
          const isPast =
            phase === 'done' ||
            (phase === 'mastery' && (p.id === 'srs' || p.id === 'labs')) ||
            (phase === 'labs' && p.id === 'srs');
          const className = `p2-step${isActive ? ' active' : ''}${isPast && !isActive ? ' past' : ''}`;
          return (
            <div key={p.id} className={className} aria-current={isActive ? 'step' : undefined}>
              <div className="p2-step-num">
                {isPast && !isActive ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle2 size={12} /> Done
                  </span>
                ) : (
                  `Phase ${idx + 1}`
                )}
              </div>
              <div className="p2-step-label">{p.label}</div>
              <div className="p2-step-time">{p.mins}</div>
            </div>
          );
        })}
      </nav>

      {error ? <div className="glass dashboard-alert error">{error}</div> : null}

      {phase === 'srs' ? (
        <section className="srs-review-list">
          <article className="glass practice-card">
            <header className="srs-review-row-head">
              <Sparkles size={16} />
              <h3>Warm up — clear up to {SRS_PHASE_LIMIT} spaced reviews</h3>
              <span className="muted" style={{ marginLeft: 'auto' }}>
                {srsRemaining.length} of {srsItems.length} remaining
              </span>
            </header>
            <p className="muted">
              Question types you missed before. Mark each one as &ldquo;Got it&rdquo; or &ldquo;Need more&rdquo;
              based on whether you could solve it without a hint.
            </p>
          </article>

          {srsRemaining.map((item) => {
            const isBusy = busyId === item.id;
            return (
              <article key={item.id} className="glass practice-card srs-review-row">
                <div className="srs-review-row-head">
                  <span className={`chip ${item.section_type}`}>{item.section_type}</span>
                  <h3>{formatPracticeLabel(item.question_type)}</h3>
                  <span className="muted" style={{ marginLeft: 'auto' }}>
                    Box {item.leitner_box} / 5
                  </span>
                </div>
                <div className="srs-review-row-actions">
                  <button
                    type="button"
                    className="btn solid compact"
                    disabled={isBusy}
                    onClick={() => void submitSrs(item, 'got_it')}
                  >
                    {isBusy ? 'Saving…' : 'Got it'}
                  </button>
                  <button
                    type="button"
                    className="btn ghost compact"
                    disabled={isBusy}
                    onClick={() => void submitSrs(item, 'need_more')}
                  >
                    Need more practice
                  </button>
                </div>
              </article>
            );
          })}

          {srsItems.length === 0 ? (
            <article className="glass practice-card">
              <h3>No reviews due right now.</h3>
              <p className="muted">Jump straight into today’s lab.</p>
            </article>
          ) : null}

          <article className="glass practice-card">
            <button
              type="button"
              className="btn ghost compact"
              onClick={() => advance('srs')}
            >
              Skip to today’s lab <ChevronRight size={14} />
            </button>
          </article>
        </section>
      ) : null}

      {phase === 'labs' ? (
        <section className="srs-review-list">
          <article className="glass practice-card">
            <header className="srs-review-row-head">
              <PlayCircle size={16} />
              <h3>Focused lab</h3>
              <span className="muted" style={{ marginLeft: 'auto' }}>
                <Clock size={12} style={{ marginRight: 4 }} />
                ~18 min
              </span>
            </header>
            {pendingPlanItem ? (
              <>
                <p className="muted">
                  Your highest-priority plan item for today. The lab is built from your recent simulator results.
                </p>
                <div className="srs-review-row-meta">
                  <span className={`chip ${pendingPlanItem.section_type}`}>{pendingPlanItem.section_type}</span>
                  <span>{formatPracticeLabel(pendingPlanItem.section_type)} lab</span>
                </div>
                <div className="srs-review-row-actions">
                  <button
                    type="button"
                    className="btn solid compact"
                    disabled={startingLabId === pendingPlanItem.id}
                    onClick={() => void startLab(pendingPlanItem)}
                  >
                    {startingLabId === pendingPlanItem.id ? 'Starting…' : 'Start lab'}
                  </button>
                  <button
                    type="button"
                    className="btn ghost compact"
                    onClick={() => advance('labs')}
                  >
                    Skip <ChevronRight size={14} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="muted">No labs queued for today.</p>
                <button
                  type="button"
                  className="btn ghost compact"
                  onClick={() => advance('labs')}
                >
                  Continue <ChevronRight size={14} />
                </button>
              </>
            )}
          </article>
        </section>
      ) : null}

      {phase === 'mastery' ? (
        <section className="srs-review-list">
          <article className="glass practice-card">
            <header className="srs-review-row-head">
              <Target size={16} />
              <h3>Mastery check</h3>
              <span className="muted" style={{ marginLeft: 'auto' }}>
                <Clock size={12} style={{ marginRight: 4 }} />
                ~5 min
              </span>
            </header>
            {masteryPlanItem ? (
              <>
                <p className="muted">
                  A short focused check on{' '}
                  <strong>{formatPracticeLabel(weakest?.question_type ?? masteryPlanItem.section_type)}</strong>,
                  your weakest signal in the latest diagnostic. Submit without hints.
                </p>
                <div className="srs-review-row-actions">
                  <button
                    type="button"
                    className="btn solid compact"
                    disabled={startingLabId === masteryPlanItem.id}
                    onClick={() => void startLab(masteryPlanItem)}
                  >
                    {startingLabId === masteryPlanItem.id ? 'Starting…' : 'Start mastery check'}
                  </button>
                  <button
                    type="button"
                    className="btn ghost compact"
                    onClick={() => advance('mastery')}
                  >
                    Skip <ChevronRight size={14} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="muted">
                  No second lab in your plan today. Open Stats by type to drill a specific weakness or come back
                  tomorrow.
                </p>
                <div className="srs-review-row-actions">
                  <Link to="/practice/stats/by-type" className="btn solid compact">
                    Open Stats by type
                  </Link>
                  <button
                    type="button"
                    className="btn ghost compact"
                    onClick={() => advance('mastery')}
                  >
                    I’m done <ChevronRight size={14} />
                  </button>
                </div>
              </>
            )}
          </article>
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
              Reviewed{' '}
              <strong>{srsCompletedIds.size}</strong>{' '}
              spaced item{srsCompletedIds.size === 1 ? '' : 's'} and finished today’s lab. Tomorrow’s plan will
              update overnight based on what you just did.
            </p>
            <div className="srs-review-row-actions">
              <Link to="/dashboard" className="btn solid compact">
                View progress
              </Link>
              <Link to="/practice/reviews" className="btn ghost compact">
                Open the full review queue
              </Link>
            </div>
          </article>
        </section>
      ) : null}
    </PracticeShell>
  );
};
