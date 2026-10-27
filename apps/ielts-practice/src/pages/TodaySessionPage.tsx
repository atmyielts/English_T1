import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Clock, Mic, PlayCircle, Sparkles, Target } from 'lucide-react';
import {
  practiceDashboardGet,
  practiceGeneratePlan,
  practicePlanItemStart,
  practiceReviewItemsList,
  srsListReviews,
  srsSubmitReview,
  type PracticeGoal,
  type PracticePlanItem,
  type ReviewItem,
  type SrsReviewItem,
} from '../lib/api';
import { formatPracticeLabel, getPlanQuestionTypes } from '../lib/practiceExperience';
import { useAccess } from '../lib/useAccess';
import { usePracticeContext } from '../lib/practiceContext';
import { IELTS_PRACTICE_PRODUCT_ID } from '../lib/constants';
import { PracticeShell } from '../components/PracticeShell';
import { ReviewItemCard } from '../components/ReviewItemCard';
import { EmptyCatalogueCard, PracticeContextBanner } from '../components/PracticeContextBanner';
import { sectionLabel, useAppT, useErrorText, useFormat, type AppKey } from '../i18n';

type Phase = 'srs' | 'labs' | 'mastery' | 'done';

const PHASES: Array<{ id: Phase; label: AppKey }> = [
  { id: 'srs', label: 'today.phase.srs' },
  { id: 'labs', label: 'today.phase.labs' },
  { id: 'mastery', label: 'today.phase.mastery' },
];

const SRS_PHASE_LIMIT = 5;

const isJsonRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isLabItem = (item: PracticePlanItem) => Boolean(item.blueprint_id || item.delivery_build_id);

/** Minutes estimated by the content build itself; null when the build has no estimate. */
export const planItemMinutes = (item: PracticePlanItem): number | null => {
  const raw = Number(item.metadata?.estimated_minutes ?? item.blueprint?.estimated_minutes);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
};

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

const matchesType = (item: PracticePlanItem, questionType: string | null): boolean =>
  !questionType || getPlanQuestionTypes(item).some((type) => {
    const clean = type.toLowerCase().replace(/^question_/, '');
    return clean.includes(questionType) || questionType.includes(clean);
  });

export const TodaySessionPage = () => {
  const t = useAppT();
  const fmt = useFormat();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { accessToken, status } = useAccess();
  const [searchParams] = useSearchParams();
  const returningFromLab = searchParams.get('returning') === 'lab';
  const { context, session: contextSession, dismiss: dismissContext } = usePracticeContext(accessToken);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [srsItems, setSrsItems] = useState<SrsReviewItem[]>([]);
  const [srsCompletedIds, setSrsCompletedIds] = useState<Set<string>>(new Set());
  const [questionItems, setQuestionItems] = useState<ReviewItem[]>([]);
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<Set<string>>(new Set());
  const [planItems, setPlanItems] = useState<PracticePlanItem[]>([]);
  const [diagnostics, setDiagnostics] = useState<unknown>(null);
  const [goals, setGoals] = useState<PracticeGoal | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [startingLabId, setStartingLabId] = useState<string | null>(null);
  const [manualAdvance, setManualAdvance] = useState<Set<Phase>>(new Set());
  const [building, setBuilding] = useState(false);
  const [emptyCatalogue, setEmptyCatalogue] = useState(false);
  const [focusNote, setFocusNote] = useState<string | null>(null);
  const focusRequestedFor = useRef<string | null>(null);

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [dash, srs, questions] = await Promise.all([
        practiceDashboardGet(accessToken),
        srsListReviews(accessToken, { mode: 'daily', limit: SRS_PHASE_LIMIT * 2 }),
        practiceReviewItemsList(accessToken, 'due', SRS_PHASE_LIMIT).catch(() => null),
      ]);
      setSrsItems(srs.items.slice(0, SRS_PHASE_LIMIT));
      setQuestionItems(questions?.items ?? []);
      setPlanItems(dash.items);
      setDiagnostics(dash.diagnostics_snapshot?.diagnostics ?? null);
      setGoals(dash.goals ?? null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, returningFromLab]);

  const buildPlan = async (focus?: { section: 'reading' | 'listening' | 'writing'; questionType: string | null }) => {
    if (!accessToken) return;
    setBuilding(true);
    setError(null);
    try {
      const result = await practiceGeneratePlan(accessToken, {
        refresh_diagnostics: false,
        timezone: goals?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        ...(focus ? { focus_section: focus.section, ...(focus.questionType ? { focus_question_type: focus.questionType } : {}) } : {}),
      });
      setEmptyCatalogue(Boolean(result.empty_reason) && result.items.length === 0);
      setPlanItems(result.items);
      if (focus && result.focus) {
        const skill = sectionLabel(t, focus.section);
        const type = focus.questionType ? formatPracticeLabel(`question_${focus.questionType}`) : '';
        setFocusNote(
          result.focus.matched === 'question_type'
            ? t('context.matchedType', { type })
            : result.focus.matched === 'section'
              ? (focus.questionType ? t('context.matchedSection', { type, skill }) : t('context.matchedSectionOnly', { skill }))
              : t('context.fallback', { skill }),
        );
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBuilding(false);
    }
  };

  // A focus from the simulator / Playbook / review queue: make sure today's
  // plan leads with a matching lab (the server falls back to other published
  // builds when none matches). Runs once per focus.
  useEffect(() => {
    if (loading || !accessToken || !context?.skill || context.skill === 'speaking') return;
    const section = context.skill;
    const key = `${section}:${context.questionType ?? ''}`;
    if (focusRequestedFor.current === key) return;
    const alreadyPlanned = planItems.some((item) =>
      isLabItem(item) && item.status !== 'completed' && item.section_type === section && matchesType(item, context.questionType));
    focusRequestedFor.current = key;
    if (alreadyPlanned) {
      setFocusNote(context.questionType
        ? t('context.matchedType', { type: formatPracticeLabel(`question_${context.questionType}`) })
        : t('context.matchedSectionOnly', { skill: sectionLabel(t, section) }));
      return;
    }
    void buildPlan({ section, questionType: context.questionType });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, accessToken, context?.skill, context?.questionType]);

  const srsRemaining = useMemo(() => srsItems.filter((item) => !srsCompletedIds.has(item.id)), [srsItems, srsCompletedIds]);
  const questionsRemaining = useMemo(
    () => questionItems.filter((item) => !answeredQuestionIds.has(item.id)),
    [questionItems, answeredQuestionIds],
  );
  const warmupTotal = questionItems.length > 0 ? questionItems.length : srsItems.length;
  const warmupLeft = questionItems.length > 0 ? questionsRemaining.length : srsRemaining.length;

  const pendingPlanItem = useMemo(() => {
    const pending = planItems.filter((item) => item.status !== 'completed' && isLabItem(item));
    const focusSection = context?.skill && context.skill !== 'speaking' ? context.skill : null;
    return pending.find((item) => item.metadata?.focus === true)
      ?? (focusSection ? pending.find((item) => item.section_type === focusSection && matchesType(item, context?.questionType ?? null)) : undefined)
      ?? (focusSection ? pending.find((item) => item.section_type === focusSection) : undefined)
      ?? pending[0];
  }, [planItems, context?.skill, context?.questionType]);

  const weakest = useMemo(() => pickWeakestType(diagnostics), [diagnostics]);
  const masteryPlanItem = useMemo(() => {
    if (!weakest) return null;
    return planItems.find(
      (item) => item.section_type === weakest.section_type && item.status !== 'completed' && item.id !== pendingPlanItem?.id && isLabItem(item),
    ) ?? null;
  }, [planItems, weakest, pendingPlanItem]);

  const phase: Phase = useMemo(() => {
    const srsDone = manualAdvance.has('srs') || warmupLeft === 0;
    if (!srsDone && warmupTotal > 0) return 'srs';
    // With no lab in today's plan at all, stay on this phase so the learner can build one.
    const labsDone = manualAdvance.has('labs') || (pendingPlanItem == null && planItems.some(isLabItem));
    if (!labsDone) return 'labs';
    const masteryDone = manualAdvance.has('mastery') || (masteryPlanItem == null && weakest == null);
    if (!masteryDone) return 'mastery';
    return 'done';
  }, [warmupLeft, warmupTotal, manualAdvance, pendingPlanItem, masteryPlanItem, weakest, planItems]);

  const labMinutes = useMemo(() => {
    const minutes = planItems.filter((item) => isLabItem(item) && item.status !== 'completed').map(planItemMinutes);
    return minutes.length > 0 && minutes.every((value) => value != null)
      ? minutes.reduce((sum: number, value) => sum + (value ?? 0), 0)
      : null;
  }, [planItems]);

  const speakingFocus = context?.skill === 'speaking'
    || (Array.isArray(goals?.focus_modes) && goals.focus_modes.includes('speaking'));

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
      setSrsCompletedIds((prev) => new Set(prev).add(item.id));
    } catch (err) {
      setError(errorText(err));
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
      setError(errorText(err));
    } finally {
      setStartingLabId(null);
    }
  };

  const advance = (current: Phase) => setManualAdvance((prev) => new Set(prev).add(current));

  if (status === 'loading' || loading) {
    return (
      <PracticeShell>
        <article className="glass practice-card" aria-busy="true">{t('today.loading')}</article>
      </PracticeShell>
    );
  }

  const speakingCard = speakingFocus ? (
    <article className="glass practice-card" data-testid="speaking-suggestion">
      <header className="srs-review-row-head">
        <Mic size={16} aria-hidden="true" />
        <h3>{t('today.speaking.title')}</h3>
      </header>
      <p className="muted">{t('today.speaking.lead')}</p>
      <Link to="/speaking" className="btn solid compact">{t('today.speaking.open')}</Link>
    </article>
  ) : null;

  return (
    <PracticeShell reviewsDueCount={srsRemaining.length + questionsRemaining.length}>
      <header className="practice-page-head">
        <div>
          <span className="eyebrow">{t('today.eyebrow')}</span>
          <h1>{t('today.title')}</h1>
          <p>
            {t('today.lead')}{' '}
            {typeof goals?.target_overall_band === 'number' ? t('today.target', { band: fmt.band(goals.target_overall_band) }) : ''}{' '}
            {labMinutes != null && labMinutes > 0 ? t('today.labMinutes', { minutes: labMinutes }) : ''}
          </p>
        </div>
      </header>

      <PracticeContextBanner context={context} session={contextSession} onDismiss={dismissContext} note={focusNote} />

      <nav className="p2-step-track" aria-label={t('today.track')}>
        {PHASES.map((p, idx) => {
          const isActive = p.id === phase;
          const isPast = phase === 'done'
            || (phase === 'mastery' && (p.id === 'srs' || p.id === 'labs'))
            || (phase === 'labs' && p.id === 'srs');
          return (
            <div key={p.id} className={`p2-step${isActive ? ' active' : ''}${isPast && !isActive ? ' past' : ''}`} aria-current={isActive ? 'step' : undefined}>
              <div className="p2-step-num">
                {isPast && !isActive ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle2 size={12} /> {t('today.phaseDone')}
                  </span>
                ) : t('today.phase', { n: idx + 1 })}
              </div>
              <div className="p2-step-label">{t(p.label)}</div>
              {p.id === 'labs' && pendingPlanItem && planItemMinutes(pendingPlanItem) != null ? (
                <div className="p2-step-time">{t('common.minutes', { count: planItemMinutes(pendingPlanItem) ?? 0 })}</div>
              ) : null}
            </div>
          );
        })}
      </nav>

      {error ? <div className="glass dashboard-alert error" role="alert">{error}</div> : null}

      {phase === 'srs' ? (
        <section className="srs-review-list">
          <article className="glass practice-card">
            <header className="srs-review-row-head">
              <Sparkles size={16} aria-hidden="true" />
              <h3>{t('today.srs.title')}</h3>
              <span className="muted srs-review-row-box">{t('today.srs.remaining', { left: warmupLeft, total: warmupTotal })}</span>
            </header>
            <p className="muted">{questionItems.length > 0 ? t('today.srs.itemsLead') : t('today.srs.typesLead')}</p>
          </article>

          {questionItems.length > 0 ? (
            <ul className="srs-review-list">
              {questionItems.map((item) => (
                <ReviewItemCard
                  key={item.id}
                  accessToken={accessToken}
                  item={item}
                  onAnswered={() => setAnsweredQuestionIds((prev) => new Set(prev).add(item.id))}
                />
              ))}
            </ul>
          ) : srsRemaining.map((item) => {
            const isBusy = busyId === item.id;
            return (
              <article key={item.id} className="glass practice-card srs-review-row">
                <div className="srs-review-row-head">
                  <span className={`chip ${item.section_type}`}>{sectionLabel(t, item.section_type)}</span>
                  <h3>{formatPracticeLabel(item.question_type)}</h3>
                  <span className="muted srs-review-row-box">{t('common.box', { box: item.leitner_box })}</span>
                </div>
                <div className="srs-review-row-actions">
                  <button type="button" className="btn solid compact" disabled={isBusy} onClick={() => void submitSrs(item, 'got_it')}>
                    {isBusy ? t('common.saving') : t('today.srs.gotIt')}
                  </button>
                  <button type="button" className="btn ghost compact" disabled={isBusy} onClick={() => void submitSrs(item, 'need_more')}>
                    {t('today.srs.needMore')}
                  </button>
                </div>
              </article>
            );
          })}

          <article className="glass practice-card">
            <button type="button" className="btn ghost compact" onClick={() => advance('srs')}>
              {t('today.srs.skip')} <ChevronRight size={14} aria-hidden="true" />
            </button>
          </article>
        </section>
      ) : null}

      {phase === 'labs' ? (
        <section className="srs-review-list">
          <article className="glass practice-card">
            <header className="srs-review-row-head">
              <PlayCircle size={16} aria-hidden="true" />
              <h3>{t('today.labs.title')}</h3>
              {pendingPlanItem && planItemMinutes(pendingPlanItem) != null ? (
                <span className="muted srs-review-row-box">
                  <Clock size={12} style={{ marginRight: 4 }} aria-hidden="true" />
                  {t('common.minutes', { count: planItemMinutes(pendingPlanItem) ?? 0 })}
                </span>
              ) : null}
            </header>
            {pendingPlanItem ? (
              <>
                <p className="muted">{pendingPlanItem.metadata?.focus === true || context?.skill === pendingPlanItem.section_type ? t('today.labs.focusLead') : t('today.labs.lead')}</p>
                <div className="srs-review-row-meta">
                  <span className={`chip ${pendingPlanItem.section_type}`}>{sectionLabel(t, pendingPlanItem.section_type)}</span>
                  <span>{getPlanQuestionTypes(pendingPlanItem).slice(0, 2).map(formatPracticeLabel).join(', ') || t('today.labs.labOf', { section: sectionLabel(t, pendingPlanItem.section_type) })}</span>
                </div>
                <div className="srs-review-row-actions">
                  <button type="button" className="btn solid compact" disabled={startingLabId === pendingPlanItem.id} onClick={() => void startLab(pendingPlanItem)}>
                    {startingLabId === pendingPlanItem.id ? t('common.starting') : t('today.labs.start')}
                  </button>
                  <button type="button" className="btn ghost compact" onClick={() => advance('labs')}>
                    {t('common.skip')} <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </>
            ) : emptyCatalogue ? null : (
              <>
                <p className="muted">{t('today.labs.none')}</p>
                <div className="srs-review-row-actions">
                  <button type="button" className="btn solid compact" onClick={() => void buildPlan()} disabled={building}>
                    {building ? t('today.labs.building') : t('today.labs.build')}
                  </button>
                  <button type="button" className="btn ghost compact" onClick={() => advance('labs')}>
                    {t('common.skip')} <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </>
            )}
          </article>
          {emptyCatalogue ? <EmptyCatalogueCard /> : null}
          {speakingCard}
        </section>
      ) : null}

      {phase === 'mastery' ? (
        <section className="srs-review-list">
          <article className="glass practice-card">
            <header className="srs-review-row-head">
              <Target size={16} aria-hidden="true" />
              <h3>{t('today.mastery.title')}</h3>
              {masteryPlanItem && planItemMinutes(masteryPlanItem) != null ? (
                <span className="muted srs-review-row-box">{t('common.minutes', { count: planItemMinutes(masteryPlanItem) ?? 0 })}</span>
              ) : null}
            </header>
            {masteryPlanItem ? (
              <>
                <p className="muted">{t('today.mastery.lead', { type: formatPracticeLabel(weakest?.question_type ?? masteryPlanItem.section_type) })}</p>
                <div className="srs-review-row-actions">
                  <button type="button" className="btn solid compact" disabled={startingLabId === masteryPlanItem.id} onClick={() => void startLab(masteryPlanItem)}>
                    {startingLabId === masteryPlanItem.id ? t('common.starting') : t('today.mastery.start')}
                  </button>
                  <button type="button" className="btn ghost compact" onClick={() => advance('mastery')}>
                    {t('common.skip')} <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="muted">{t('today.mastery.none')}</p>
                <div className="srs-review-row-actions">
                  <Link to="/practice/stats/by-type" className="btn solid compact">{t('today.mastery.openStats')}</Link>
                  <button type="button" className="btn ghost compact" onClick={() => advance('mastery')}>
                    {t('today.mastery.finish')} <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </>
            )}
          </article>
        </section>
      ) : null}

      {phase === 'done' ? (
        <section className="srs-review-list">
          {emptyCatalogue ? <EmptyCatalogueCard /> : (
            <article className="glass practice-card">
              <header className="srs-review-row-head">
                <CheckCircle2 size={18} aria-hidden="true" />
                <h3>{t('today.done.title')}</h3>
              </header>
              <p className="muted">{t('today.done.lead', { count: srsCompletedIds.size + answeredQuestionIds.size })}</p>
              <div className="srs-review-row-actions">
                <Link to="/dashboard" className="btn solid compact">{t('today.done.progress')}</Link>
                <Link to="/practice/reviews" className="btn ghost compact">{t('today.done.queue')}</Link>
              </div>
            </article>
          )}
          {speakingCard}
        </section>
      ) : null}
    </PracticeShell>
  );
};
