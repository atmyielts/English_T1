import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PracticeTopNav } from '../components/PracticeTopNav';
import {
  getCoachLang,
  practiceGeneratePlan,
  practiceLabCoach,
  practiceSessionResultsGet,
  practiceSessionResultsScore,
  type PracticeCoachStep,
} from '../lib/api';
import {
  EXPERIENCE_COPY,
  formatPracticeLabel,
  getBuildExperienceKind,
  getBuildExperienceLabel,
  getExperienceSteps,
} from '../lib/practiceExperience';
import { formatBand } from '@schood/ielts-core';
import { AnnotatedWritingRetro } from '../components/AnnotatedWritingRetro';
import { ConversationalCoach, ModelAnswerComparator } from '../components/PracticeAdaptiveExtras';

// IELTS writing criteria. grade-writing returns the score under any of
// these aliases depending on the model — accept all, render none if missing.
const WRITING_CRITERIA: Array<{ short: string; aliases: string[]; label: string }> = [
  {
    short: 'TR',
    label: 'Task Response',
    aliases: ['TR', 'task_response', 'task_achievement', 'TA'],
  },
  { short: 'CC', label: 'Coherence & Cohesion', aliases: ['CC', 'coherence_cohesion'] },
  { short: 'LR', label: 'Lexical Resource', aliases: ['LR', 'lexical_resource'] },
  {
    short: 'GRA',
    label: 'Grammatical Range & Accuracy',
    aliases: ['GRA', 'grammatical_range_accuracy', 'grammar_range_accuracy'],
  },
];

const readCriterionScore = (criteria: unknown, aliases: string[]): number | null => {
  if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) return null;
  const record = criteria as Record<string, unknown>;
  for (const alias of aliases) {
    const raw = record[alias];
    const num = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(num)) return Math.max(0, Math.min(9, num));
  }
  return null;
};
import { useAccess } from '../lib/useAccess';
import { IELTS_PRACTICE_PRODUCT_ID } from '../lib/constants';

type Json = Record<string, unknown>;

const PLAYBOOK_URL = 'https://playbook.ielts.schood.online';

const isRecord = (value: unknown): value is Json =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const asNumber = (value: unknown): number | null => {
  const next = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(next) ? next : null;
};

const titleCase = (value: unknown): string =>
  String(value ?? '')
    .replace(/^question_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (token) => token.toUpperCase());

const percent = (value: number | null): string =>
  value == null ? '-' : `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;

const sectionRowsFromOutcome = (outcome: Json | null) => {
  const scores = isRecord(outcome?.section_scores) ? (outcome?.section_scores as Json) : {};
  return Object.entries(scores).map(([id, row]) => {
    const record = isRecord(row) ? row : {};
    const raw = asNumber(record.raw_score);
    const max = asNumber(record.max_score);
    return {
      id,
      type: String(record.type ?? 'section'),
      raw,
      max,
      accuracy: raw != null && max != null && max > 0 ? raw / max : null,
      band: asNumber(record.band),
    };
  });
};

const writingTasksFromEvaluation = (evaluation: Json | null): Json[] => {
  const result = isRecord(evaluation?.result) ? (evaluation?.result as Json) : {};
  return Array.isArray(result.tasks) ? result.tasks.filter(isRecord) : [];
};

export const SessionResultsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { accessToken } = useAccess();
  const [data, setData] = useState<Awaited<ReturnType<typeof practiceSessionResultsScore>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestedRef = useRef<string | null>(null);
  const [coachSteps, setCoachSteps] = useState<PracticeCoachStep[] | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);

  const search = new URLSearchParams(location.search);
  const backPath = search.get('results_back')?.trim() || search.get('back')?.trim() || '/dashboard';

  useEffect(() => {
    const load = async (): Promise<void> => {
      if (!accessToken || !sessionId) return;
      if (requestedRef.current === `${accessToken}:${sessionId}`) return;
      requestedRef.current = `${accessToken}:${sessionId}`;
      setLoading(true);
      setError(null);
      try {
        const scored = await practiceSessionResultsScore(accessToken, sessionId);
        setData(scored);
      } catch (scoreErr) {
        try {
          const existing = await practiceSessionResultsGet(accessToken, sessionId);
          setData({ ...existing, scoring_refresh: null });
        } catch {
          setError(scoreErr instanceof Error ? scoreErr.message : 'Unable to load practice results');
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [accessToken, sessionId]);

  const outcome = isRecord(data?.results?.outcome) ? (data?.results?.outcome as Json) : null;
  const aiEvaluation = isRecord(data?.results?.ai_evaluation) ? (data?.results?.ai_evaluation as Json) : null;
  const sectionRows = useMemo(() => sectionRowsFromOutcome(outcome), [outcome]);
  const writingTasks = useMemo(() => writingTasksFromEvaluation(aiEvaluation), [aiEvaluation]);
  const runtimeSessionId = String((data?.session as Json | null)?.id ?? (data?.practice_session as Json | null)?.session_id ?? sessionId ?? '');
  const reviewQuery = new URLSearchParams({
    product_id: IELTS_PRACTICE_PRODUCT_ID,
    back: backPath,
  }).toString();
  const build = data?.delivery_build ?? null;
  const buildSummary = isRecord(build?.build_summary) ? build?.build_summary as Json : {};
  const experienceKind = getBuildExperienceKind(build);
  const experienceInfo = EXPERIENCE_COPY[experienceKind];
  const resultSection = String(data?.blueprint?.section_type ?? buildSummary.section_type ?? 'reading');
  const targetTypes = Array.isArray(data?.blueprint?.target_question_types) ? data.blueprint.target_question_types : [];
  const masteryUpdates = Array.isArray(data?.scoring_refresh?.mastery_updates) ? data.scoring_refresh.mastery_updates : [];

  const summaryBand =
    asNumber(outcome?.overall_band) ??
    asNumber((isRecord(aiEvaluation?.result) ? (aiEvaluation?.result as Json) : {}).overall_band);
  const weakestSection = sectionRows
    .filter((row) => row.accuracy != null || row.band != null)
    .sort((a, b) => (a.band ?? a.accuracy ?? 99) - (b.band ?? b.accuracy ?? 99))[0];
  const firstWritingImprovement = writingTasks
    .flatMap((task) => {
      const improvements = Array.isArray(task.improvements) ? task.improvements : [];
      const actions = Array.isArray(task.actionable_feedback) ? task.actionable_feedback : [];
      return [...improvements, ...actions].map(String);
    })
    .find((item) => item.trim().length > 0);

  const requestCoaching = async (): Promise<void> => {
    if (!accessToken || !sessionId) return;
    setCoachLoading(true);
    setCoachError(null);
    try {
      const response = await practiceLabCoach(accessToken, sessionId, getCoachLang());
      setCoachSteps(response.steps);
    } catch (err) {
      setCoachError(err instanceof Error ? err.message : 'Coaching unavailable right now');
    } finally {
      setCoachLoading(false);
    }
  };

  const regenerateNext = async (): Promise<void> => {
    if (!accessToken) return;
    setRegenerating(true);
    try {
      await practiceGeneratePlan(accessToken, { refresh_diagnostics: true });
      navigate('/plan');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to regenerate plan');
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="practice-root">
      <PracticeTopNav
        compact
        title="Practice Results"
        subtitle={`${getBuildExperienceLabel(build)} feedback and next action`}
        actions={[
          { id: 'back', label: 'Back', onClick: () => navigate(backPath) },
          { id: 'review', label: 'Review Answers', to: `/session/${encodeURIComponent(runtimeSessionId)}/review?${reviewQuery}` },
          { id: 'next-plan', label: regenerating ? 'Updating...' : 'Next Plan', onClick: () => void regenerateNext(), variant: 'solid', disabled: regenerating },
        ]}
      />

      <main className="dashboard-grid results-layout">
        <section className="glass stat-card">
          <h3>Score</h3>
          <div className="band-row">
            <strong>{summaryBand != null ? summaryBand.toFixed(1) : '-'}</strong>
          </div>
          <p className="muted">
            {outcome ? `Computed ${String(outcome.computed_at ?? '').slice(0, 16).replace('T', ' ')}` : 'Scoring is being prepared.'}
          </p>
        </section>

        <section className="glass stat-card">
          <h3>Focus</h3>
          <p>{targetTypes.length > 0 ? targetTypes.slice(0, 3).map(formatPracticeLabel).join(', ') : titleCase(data?.blueprint?.section_type ?? 'IELTS')}</p>
          <p className="muted">{experienceInfo.description}</p>
          <div className="task-feature-row compact">
            {getExperienceSteps(experienceKind, resultSection).map((step) => (
              <span className="feature-pill" key={step}>{step}</span>
            ))}
          </div>
        </section>

        <section className="glass stat-card">
          <h3>Mastery Updated</h3>
          <div className="band-row secondary">
            <strong>{masteryUpdates.length}</strong>
          </div>
          <p className="muted">Question-type records refreshed from this session.</p>
        </section>

        <section className="glass stat-card wide">
          <div className="task-card-head">
            <div>
              <h3>Mistake Pattern</h3>
              <p className="muted">A concise read of what this attempt says about your next practice step.</p>
            </div>
          </div>

          {loading ? <p>Scoring practice session...</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
          {!loading && !error ? (
            <div className="result-insight">
              <h4>
                {firstWritingImprovement
                  ? 'Writing improvement target'
                  : weakestSection
                    ? `${titleCase(weakestSection.type)} needs the next repair pass`
                    : 'No major mistake pattern detected yet'}
              </h4>
              <p>
                {firstWritingImprovement
                  ? firstWritingImprovement
                  : weakestSection
                    ? `Accuracy is ${percent(weakestSection.accuracy)}${weakestSection.band != null ? ` with band ${weakestSection.band.toFixed(1)}` : ''}. Start with the next recommended transformed task instead of repeating this test.`
                    : 'Complete the review once, then regenerate the plan so the next task targets a fresh weakness.'}
              </p>
            </div>
          ) : null}
        </section>

        <section className="glass stat-card wide">
          <h3>Section Breakdown</h3>
          <div className="section-result-list">
            {sectionRows.map((row) => (
              <div className="section-progress-row" key={row.id}>
                <div className="section-progress-head">
                  <span className={`chip ${row.type}`}>{row.type}</span>
                  <span className="muted">{row.raw ?? '-'} / {row.max ?? '-'}</span>
                </div>
                <div className="progress-track">
                  <div className={`progress-fill ${row.type}`} style={{ width: row.accuracy == null ? '0%' : percent(row.accuracy) }} />
                </div>
                <div className="section-progress-meta">
                  <span>Accuracy {percent(row.accuracy)}</span>
                  <span>Band {row.band != null ? row.band.toFixed(1) : '-'}</span>
                </div>
              </div>
            ))}
            {sectionRows.length === 0 && !loading ? <p className="muted">No objective section scores yet.</p> : null}
          </div>
        </section>

        {writingTasks.length > 0 && sessionId ? (
          <AnnotatedWritingRetro accessToken={accessToken} practiceSessionId={sessionId} />
        ) : null}

        {writingTasks.length > 0 && sessionId ? (
          <ModelAnswerComparator accessToken={accessToken} practiceSessionId={sessionId} />
        ) : null}

        {sessionId ? (
          <ConversationalCoach accessToken={accessToken} practiceSessionId={sessionId} />
        ) : null}

        {writingTasks.length > 0 ? (
          <section className="glass stat-card wide">
            <h3>Writing Feedback</h3>
            <div className="writing-feedback-list">
              {writingTasks.map((task, index) => {
                const criteria = (task as Json).criteria;
                const criterionRows = WRITING_CRITERIA.map((c) => ({
                  ...c,
                  score: readCriterionScore(criteria, c.aliases),
                })).filter((row) => row.score != null);
                return (
                  <article className="feedback-panel" key={String(task.content_unit_id ?? index)}>
                    <div className="task-card-head">
                      <h4>{titleCase(task.task_type ?? `Task ${index + 1}`)}</h4>
                      <strong>Band {formatBand(asNumber(task.band))}</strong>
                    </div>
                    {criterionRows.length > 0 ? (
                      <div className="writing-criteria-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, margin: '12px 0' }}>
                        {criterionRows.map((row) => (
                          <div key={row.short}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                              <span className="muted" style={{ fontSize: 12, fontWeight: 600 }} title={row.label}>{row.short}</span>
                              <strong>{formatBand(row.score)}</strong>
                            </div>
                            <div className="progress-track" style={{ height: 6 }}>
                              <div
                                className="progress-fill writing"
                                style={{ width: `${((row.score ?? 0) / 9) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="feedback-grid">
                      {['strengths', 'improvements', 'actionable_feedback'].map((key) => {
                        const source = task[key];
                        const values = Array.isArray(source) ? source.slice(0, 4).map(String) : [];
                        if (values.length === 0) return null;
                        return (
                          <div key={key}>
                            <h5>{titleCase(key)}</h5>
                            <ul>
                              {values.map((value, itemIndex) => <li key={`${key}-${itemIndex}`}>{value}</li>)}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="glass stat-card wide">
          <div className="task-card-head">
            <div>
              <h3>Per-question coaching</h3>
              <p className="muted">
                AI-generated explanation for the items you missed: the trap pattern, the correct approach,
                and a direct link to the playbook strategy.
              </p>
            </div>
            {coachSteps == null ? (
              <button
                type="button"
                className="btn solid compact"
                onClick={() => void requestCoaching()}
                disabled={coachLoading}
              >
                {coachLoading ? 'Generating…' : 'Get coaching'}
              </button>
            ) : null}
          </div>
          {coachError ? <p className="error-text">{coachError}</p> : null}
          {coachSteps != null && coachSteps.length === 0 ? (
            <p className="muted">Nothing to coach — every step in this attempt was above the coaching threshold.</p>
          ) : null}
          {coachSteps != null && coachSteps.length > 0 ? (
            <ul className="srs-review-list">
              {coachSteps.map((step) => (
                <li key={step.step_id} className="feedback-panel">
                  <div className="task-card-head">
                    <div>
                      <h4>{formatPracticeLabel(step.question_type)}</h4>
                      <span className="muted" style={{ fontSize: 12 }}>
                        Accuracy {Math.round(step.accuracy_ratio * 100)}% · Trap: {step.trap_pattern}
                      </span>
                    </div>
                  </div>
                  <p><strong>Why it’s wrong:</strong> {step.what_went_wrong}</p>
                  <p><strong>Correct approach:</strong> {step.correct_approach}</p>
                  <div className="inline-actions">
                    <a className="btn ghost compact" href={step.strategy_url} target="_blank" rel="noreferrer">
                      Open playbook strategy
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="glass stat-card wide next-action-card">
          <div>
            <h3>Next Recommended Exercise</h3>
            <p className="muted">
              Regenerate the plan now to use the refreshed diagnostics and mastery records from this result.
            </p>
          </div>
          <div className="inline-actions">
            <button className="btn solid" type="button" onClick={() => void regenerateNext()} disabled={regenerating}>
              {regenerating ? 'Updating...' : 'Generate Next 3 Tasks'}
            </button>
            <a
              className="btn ghost"
              href={`${PLAYBOOK_URL}/diagnostic?source=practice&session_id=${encodeURIComponent(runtimeSessionId)}&weak_skill=${encodeURIComponent(String(weakestSection?.type ?? data?.blueprint?.section_type ?? 'writing'))}`}
            >
              Open Playbook
            </a>
          </div>
        </section>
      </main>
    </div>
  );
};
