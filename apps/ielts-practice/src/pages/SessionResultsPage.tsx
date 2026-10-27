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
  experienceCopy,
  formatPracticeLabel,
  getBuildExperienceKind,
  getBuildExperienceLabel,
  getExperienceSteps,
} from '../lib/practiceExperience';
import { formatBand } from '@schood/ielts-core';
import { AnnotatedWritingRetro } from '../components/AnnotatedWritingRetro';
import { ConversationalCoach, ModelAnswerComparator } from '../components/PracticeAdaptiveExtras';
import { MistakeCauseTagger } from '../components/MistakeCauseInsights';
import { LocaleSwitcher } from '../../../../packages/service-i18n/src/i18n.tsx';
import { sectionLabel, useAppT, useErrorText, useFormat, type AppKey } from '../i18n';

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

const percentWidth = (value: number | null): string =>
  value == null ? '0%' : `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;

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
  const t = useAppT();
  const fmt = useFormat();
  const errorText = useErrorText();
  const pct = (value: number | null): string => (value == null ? '–' : fmt.percent(Math.max(0, Math.min(1, value))));
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
          setError(errorText(scoreErr));
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const experienceInfo = experienceCopy(experienceKind, t);
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
      setCoachError(errorText(err));
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
      setError(errorText(err));
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="practice-root">
      <PracticeTopNav
        compact
        title={t('res.title')}
        subtitle={t('res.subtitle', { kind: getBuildExperienceLabel(build, t) })}
        leadingNode={<LocaleSwitcher label={t('shell.language')} />}
        actions={[
          { id: 'back', label: t('res.back'), onClick: () => navigate(backPath) },
          { id: 'review', label: t('res.reviewAnswers'), to: `/session/${encodeURIComponent(runtimeSessionId)}/review?${reviewQuery}` },
          { id: 'next-plan', label: regenerating ? t('res.updating') : t('res.nextPlan'), onClick: () => void regenerateNext(), variant: 'solid', disabled: regenerating },
        ]}
      />

      <main className="dashboard-grid results-layout">
        <section className="glass stat-card">
          <h3>{t('res.score')}</h3>
          <div className="band-row">
            <strong>{summaryBand != null ? fmt.band(summaryBand) : '–'}</strong>
          </div>
          <p className="muted">
            {outcome && outcome.computed_at ? t('res.computed', { date: fmt.dateTime(String(outcome.computed_at)) }) : t('res.preparing')}
          </p>
        </section>

        <section className="glass stat-card">
          <h3>{t('res.focus')}</h3>
          <p>{targetTypes.length > 0 ? targetTypes.slice(0, 3).map(formatPracticeLabel).join(', ') : sectionLabel(t, data?.blueprint?.section_type ?? 'IELTS')}</p>
          <p className="muted">{experienceInfo.description}</p>
          <div className="task-feature-row compact">
            {getExperienceSteps(experienceKind, resultSection, t).map((step) => (
              <span className="feature-pill" key={step}>{step}</span>
            ))}
          </div>
        </section>

        <section className="glass stat-card">
          <h3>{t('res.mastery')}</h3>
          <div className="band-row secondary">
            <strong>{masteryUpdates.length}</strong>
          </div>
          <p className="muted">{t('res.masteryLead')}</p>
        </section>

        <section className="glass stat-card wide">
          <div className="task-card-head">
            <div>
              <h3>{t('res.pattern')}</h3>
              <p className="muted">{t('res.patternLead')}</p>
            </div>
          </div>

          {loading ? <p>{t('res.scoring')}</p> : null}
          {error ? <p className="error-text" role="alert">{error}</p> : null}
          {!loading && !error ? (
            <div className="result-insight">
              <h4>
                {firstWritingImprovement
                  ? t('res.writingTarget')
                  : weakestSection
                    ? t('res.sectionNeeds', { section: sectionLabel(t, weakestSection.type) })
                    : t('res.noPattern')}
              </h4>
              <p>
                {firstWritingImprovement
                  ? firstWritingImprovement
                  : weakestSection
                    ? weakestSection.band != null
                      ? t('res.sectionDetailBand', { accuracy: pct(weakestSection.accuracy), band: fmt.band(weakestSection.band) })
                      : t('res.sectionDetail', { accuracy: pct(weakestSection.accuracy) })
                    : t('res.noPatternLead')}
              </p>
            </div>
          ) : null}
        </section>

        <section className="glass stat-card wide">
          <h3>{t('res.breakdown')}</h3>
          <div className="section-result-list">
            {sectionRows.map((row) => (
              <div className="section-progress-row" key={row.id}>
                <div className="section-progress-head">
                  <span className={`chip ${row.type}`}>{sectionLabel(t, row.type)}</span>
                  <span className="muted">{row.raw ?? '–'} / {row.max ?? '–'}</span>
                </div>
                <div className="progress-track">
                  <div className={`progress-fill ${row.type}`} style={{ width: percentWidth(row.accuracy) }} />
                </div>
                <div className="section-progress-meta">
                  <span>{t('res.accuracy', { value: pct(row.accuracy) })}</span>
                  <span>{t('res.band', { value: row.band != null ? fmt.band(row.band) : '–' })}</span>
                </div>
              </div>
            ))}
            {sectionRows.length === 0 && !loading ? <p className="muted">{t('res.noScores')}</p> : null}
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
            <h3>{t('res.writing')}</h3>
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
                      <h4>{task.task_type ? titleCase(task.task_type) : t('res.task', { n: index + 1 })}</h4>
                      <strong>{t('res.band', { value: formatBand(asNumber(task.band)) })}</strong>
                    </div>
                    {criterionRows.length > 0 ? (
                      <div className="writing-criteria-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))', gap: 12, margin: '12px 0' }}>
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
                            <h5>{t((key === 'strengths' ? 'res.strengths' : key === 'improvements' ? 'res.improvements' : 'res.actionable') as AppKey)}</h5>
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
              <h3>{t('res.coach.title')}</h3>
              <p className="muted">{t('res.coach.lead')}</p>
            </div>
            {coachSteps == null ? (
              <button
                type="button"
                className="btn solid compact"
                onClick={() => void requestCoaching()}
                disabled={coachLoading}
              >
                {coachLoading ? t('res.coach.loading') : t('res.coach.get')}
              </button>
            ) : null}
          </div>
          {coachError ? <p className="error-text" role="alert">{coachError}</p> : null}
          {coachSteps != null && coachSteps.length === 0 ? (
            <p className="muted">{t('res.coach.none')}</p>
          ) : null}
          {coachSteps != null && coachSteps.length > 0 ? (
            <ul className="srs-review-list">
              {coachSteps.map((step) => (
                <li key={step.step_id} className="feedback-panel">
                  <div className="task-card-head">
                    <div>
                      <h4>{formatPracticeLabel(step.question_type)}</h4>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {t('res.coach.meta', { value: pct(step.accuracy_ratio), trap: step.trap_pattern })}
                      </span>
                    </div>
                  </div>
                  <p><strong>{t('res.coach.wrong')}</strong> {step.what_went_wrong}</p>
                  <p><strong>{t('res.coach.approach')}</strong> {step.correct_approach}</p>
                  <div className="inline-actions" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <a className="btn ghost compact" href={step.strategy_url} target="_blank" rel="noreferrer">
                      {t('res.coach.playbook')}
                    </a>
                    <MistakeCauseTagger
                      accessToken={accessToken}
                      sessionId={sessionId}
                      sectionType={resultSection}
                      questionType={step.question_type}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="glass stat-card wide next-action-card">
          <div>
            <h3>{t('res.next.title')}</h3>
            <p className="muted">{t('res.next.lead')}</p>
          </div>
          <div className="inline-actions">
            <button className="btn solid" type="button" onClick={() => void regenerateNext()} disabled={regenerating}>
              {regenerating ? t('res.updating') : t('res.next.build')}
            </button>
            <a
              className="btn ghost"
              href={`${PLAYBOOK_URL}/diagnostic?source=practice&session_id=${encodeURIComponent(runtimeSessionId)}&weak_skill=${encodeURIComponent(String(weakestSection?.type ?? data?.blueprint?.section_type ?? 'writing'))}`}
            >
              {t('res.next.playbook')}
            </a>
          </div>
        </section>
      </main>
    </div>
  );
};
