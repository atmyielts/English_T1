import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  practiceLabGet,
  practiceLabSave,
  practiceLabSubmit,
  type PracticeLabPayload,
  type PracticeLabStep,
  type PracticeNotebookItem,
  type PracticeRoadmapItem,
} from '../lib/api';
import { useAccess } from '../lib/useAccess';

type AnswerMap = Record<string, Record<string, unknown>>;

const LAB_SCHEMA_VERSION = 'ielts.practice.lab.v1';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

const toText = (value: unknown): string => String(value ?? '').trim();

const titleCase = (value: unknown): string =>
  String(value ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim() || 'Practice Lab';

const percent = (value: unknown): string => {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return '-';
  return `${Math.round(number * 100)}%`;
};

const sectionChipClass = (section: unknown): string => {
  const value = String(section ?? '').toLowerCase();
  if (value === 'reading') return 'chip reading';
  if (value === 'listening') return 'chip listening';
  if (value === 'writing') return 'chip writing';
  return 'chip';
};

const stepResponse = (answers: AnswerMap, stepId: string): Record<string, unknown> =>
  asRecord(answers[stepId]);

const stepShape = (step: PracticeLabStep): Record<string, unknown> => asRecord(step.response_shape);

const stepOptions = (step: PracticeLabStep): Array<{ id: string; label: string }> =>
  Array.isArray(step.options)
    ? step.options
      .map((entry, index) => {
        const row = asRecord(entry);
        return {
          id: toText(row.id ?? row.value ?? row.key ?? String(index + 1)),
          label: toText(row.label ?? row.text ?? row.value ?? row.id ?? entry),
        };
      })
      .filter((entry) => entry.id || entry.label)
    : [];

const mapKeysForStep = (step: PracticeLabStep): string[] => {
  const shape = stepShape(step);
  if (Array.isArray(shape.keys)) return shape.keys.map((entry) => toText(entry)).filter(Boolean);
  const answerKey = asRecord(step.answer_key);
  for (const key of ['blanks', 'matches', 'cells', 'labels', 'targets']) {
    const map = asRecord(answerKey[key]);
    const keys = Object.keys(map);
    if (keys.length > 0) return keys;
  }
  return ['answer'];
};

const coachList = (coach: Record<string, unknown>, key: string): string[] =>
  Array.isArray(coach[key]) ? coach[key].map((entry) => toText(entry)).filter(Boolean) : [];

const contextText = (context: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = toText(context[key]);
    if (value) return value;
  }
  return '';
};

const updateNestedMapAnswer = (
  current: Record<string, unknown>,
  mapKey: string,
  key: string,
  value: string,
): Record<string, unknown> => ({
  ...current,
  [mapKey]: {
    ...asRecord(current[mapKey]),
    [key]: value,
  },
});

type LabResult = Awaited<ReturnType<typeof practiceLabSubmit>>;

export const LabPage = () => {
  const { practiceSessionId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const { accessToken } = useAccess();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lab, setLab] = useState<PracticeLabPayload | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [notebook, setNotebook] = useState<PracticeNotebookItem[]>([]);
  const [roadmap, setRoadmap] = useState<PracticeRoadmapItem[]>([]);
  const [result, setResult] = useState<LabResult | null>(null);
  const [dirty, setDirty] = useState(false);

  const backPath = searchParams.get('back') || '/dashboard';
  const steps = useMemo(
    () => (Array.isArray(lab?.steps) ? lab.steps : []).filter((step): step is PracticeLabStep => isRecord(step) && toText(step.id).length > 0),
    [lab],
  );
  const activeStep = steps[Math.min(activeStepIndex, Math.max(steps.length - 1, 0))] ?? null;
  const coach = asRecord(lab?.coach_template);
  const labKind = titleCase(lab?.lab_kind);
  const isScored = result != null;

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      if (!accessToken || !practiceSessionId) return;
      setLoading(true);
      setError(null);
      try {
        const response = await practiceLabGet(accessToken, practiceSessionId);
        if (cancelled) return;
        setLab(response.lab);
        setNotebook(response.notebook ?? []);
        setRoadmap(response.roadmap ?? []);
        const savedAnswers = asRecord(response.attempt?.answers_json);
        const initialAnswers = Object.fromEntries(
          Object.entries(savedAnswers).filter(([, value]) => isRecord(value)),
        ) as AnswerMap;
        setAnswers(initialAnswers);
        setActiveStepIndex(Math.max(0, Number(response.attempt?.current_step_index ?? 0) || 0));
        if (response.attempt?.status === 'scored') {
          setResult({
            ok: true,
            lab_attempt: response.attempt,
            score: {
              raw_score: Number(response.attempt.raw_score ?? 0),
              max_score: Number(response.attempt.max_score ?? 1),
              accuracy_ratio: Number(response.attempt.accuracy_ratio ?? 0),
              estimated_band: Number(response.attempt.estimated_band ?? 0),
            },
            scored_steps: Array.isArray(asRecord(response.attempt.score_artifacts).scored_steps)
              ? asRecord(response.attempt.score_artifacts).scored_steps as Record<string, unknown>[]
              : [],
            mastery_updates: [],
            notebook_items: response.notebook ?? [],
            roadmap_items: response.roadmap ?? [],
            diagnostics_snapshot_id: null,
          });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load practice lab');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, practiceSessionId]);

  useEffect(() => {
    if (!accessToken || !practiceSessionId || !dirty || isScored) return;
    const timer = window.setTimeout(() => {
      setSaving(true);
      practiceLabSave(accessToken, practiceSessionId, { answers, current_step_index: activeStepIndex })
        .then(() => setDirty(false))
        .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Autosave failed'))
        .finally(() => setSaving(false));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [accessToken, activeStepIndex, answers, dirty, isScored, practiceSessionId]);

  const updateStepAnswer = (stepId: string, patch: Record<string, unknown>): void => {
    setAnswers((prev) => ({
      ...prev,
      [stepId]: {
        ...asRecord(prev[stepId]),
        ...patch,
      },
    }));
    setDirty(true);
  };

  const saveNow = async (): Promise<void> => {
    if (!accessToken || !practiceSessionId || isScored) return;
    setSaving(true);
    setError(null);
    try {
      await practiceLabSave(accessToken, practiceSessionId, { answers, current_step_index: activeStepIndex });
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const submit = async (): Promise<void> => {
    if (!accessToken || !practiceSessionId) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await practiceLabSubmit(accessToken, practiceSessionId, {
        answers,
        current_step_index: activeStepIndex,
        metadata: { submitted_from: 'practice_lab_ui' },
      });
      setResult(response);
      setNotebook(response.notebook_items ?? []);
      setRoadmap(response.roadmap_items ?? []);
      setDirty(false);
      setActiveStepIndex(Math.min(activeStepIndex, Math.max(steps.length - 1, 0)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const goToStep = (index: number): void => {
    setActiveStepIndex(Math.max(0, Math.min(index, Math.max(steps.length - 1, 0))));
    setDirty(true);
  };

  const renderAnswerSurface = (step: PracticeLabStep) => {
    const stepId = toText(step.id);
    const response = stepResponse(answers, stepId);
    const shape = stepShape(step);
    const kind = toText(shape.kind || 'free_text');
    const options = stepOptions(step);
    const mapKey = toText(shape.map_key || 'answers') || 'answers';

    if (step.kind === 'writing_rewrite' || lab?.section_type === 'writing') {
      return (
        <div className="lab-answer-stack">
          <label>
            Task analysis
            <textarea
              rows={3}
              value={toText(response.task_analysis)}
              onChange={(event) => updateStepAnswer(stepId, { task_analysis: event.target.value })}
              placeholder="Identify the task, audience, position, and limits."
              disabled={isScored}
            />
          </label>
          <label>
            Plan builder
            <textarea
              rows={4}
              value={toText(response.plan)}
              onChange={(event) => updateStepAnswer(stepId, { plan: event.target.value })}
              placeholder="Outline introduction, body points, examples, and conclusion."
              disabled={isScored}
            />
          </label>
          <label>
            Full rewrite
            <textarea
              rows={10}
              value={toText(response.full_rewrite)}
              onChange={(event) => updateStepAnswer(stepId, { full_rewrite: event.target.value })}
              placeholder="Write the improved answer here."
              disabled={isScored}
            />
          </label>
        </div>
      );
    }

    if (kind === 'single_choice' && options.length > 0) {
      return (
        <div className="lab-options">
          {options.map((option) => (
            <label className="lab-option" key={option.id}>
              <input
                type="radio"
                name={`${stepId}-choice`}
                checked={toText(response.selected_option) === option.id}
                onChange={() => updateStepAnswer(stepId, { selected_option: option.id })}
                disabled={isScored}
              />
              <span>{option.label || option.id}</span>
            </label>
          ))}
        </div>
      );
    }

    if (kind === 'multi_choice' && options.length > 0) {
      const selected = Array.isArray(response.selected_options) ? response.selected_options.map(String) : [];
      return (
        <div className="lab-options">
          {options.map((option) => (
            <label className="lab-option" key={option.id}>
              <input
                type="checkbox"
                checked={selected.includes(option.id)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? Array.from(new Set([...selected, option.id]))
                    : selected.filter((entry) => entry !== option.id);
                  updateStepAnswer(stepId, { selected_options: next });
                }}
                disabled={isScored}
              />
              <span>{option.label || option.id}</span>
            </label>
          ))}
        </div>
      );
    }

    if (kind === 'map') {
      const mapValues = asRecord(response[mapKey]);
      return (
        <div className="lab-map-inputs">
          {mapKeysForStep(step).map((key) => (
            <label key={key}>
              {titleCase(key)}
              <input
                value={toText(mapValues[key])}
                onChange={(event) => updateStepAnswer(stepId, updateNestedMapAnswer(response, mapKey, key, event.target.value))}
                disabled={isScored}
              />
            </label>
          ))}
        </div>
      );
    }

    return (
      <label>
        Answer
        <textarea
          rows={4}
          value={toText(response.answer)}
          onChange={(event) => updateStepAnswer(stepId, { answer: event.target.value })}
          disabled={isScored}
        />
      </label>
    );
  };

  const renderProcessFields = (step: PracticeLabStep) => {
    const stepId = toText(step.id);
    const response = stepResponse(answers, stepId);

    if (step.kind === 'evidence_locator') {
      return (
        <label>
          Evidence sentence or paragraph
          <textarea
            rows={4}
            value={toText(response.evidence)}
            onChange={(event) => updateStepAnswer(stepId, { evidence: event.target.value })}
            placeholder="Paste or summarize the exact sentence that proves the answer."
            disabled={isScored}
          />
        </label>
      );
    }

    if (step.kind === 'distractor_elimination') {
      const trapTypes = Array.isArray(asRecord(step.distractors).trap_types)
        ? asRecord(step.distractors).trap_types as string[]
        : ['word_match', 'opposite_meaning', 'too_broad', 'nearby_but_wrong', 'wrong_number', 'wrong_speaker', 'not_given'];
      return (
        <div className="lab-answer-stack">
          <label>
            Distractor trap
            <select
              value={toText(response.trap_type)}
              onChange={(event) => updateStepAnswer(stepId, { trap_type: event.target.value })}
              disabled={isScored}
            >
              <option value="">Choose trap type</option>
              {trapTypes.map((trap) => <option value={trap} key={trap}>{titleCase(trap)}</option>)}
            </select>
          </label>
          <label>
            Why the distractor is wrong
            <textarea
              rows={4}
              value={toText(response.reason)}
              onChange={(event) => updateStepAnswer(stepId, { reason: event.target.value })}
              placeholder="Explain what makes the tempting answer incorrect."
              disabled={isScored}
            />
          </label>
        </div>
      );
    }

    if (step.kind === 'listening_replay') {
      return (
        <div className="lab-answer-stack">
          <label>
            Prediction
            <input
              value={toText(response.prediction)}
              onChange={(event) => updateStepAnswer(stepId, { prediction: event.target.value })}
              placeholder="Predict grammar, number, name, or meaning before answering."
              disabled={isScored}
            />
          </label>
          <label>
            Paraphrase or signpost
            <textarea
              rows={3}
              value={toText(response.paraphrase)}
              onChange={(event) => updateStepAnswer(stepId, { paraphrase: event.target.value })}
              placeholder="Note the signpost, correction, or paraphrase that leads to the answer."
              disabled={isScored}
            />
          </label>
        </div>
      );
    }

    return null;
  };

  if (loading) {
    return (
      <div className="practice-root">
        <div className="glass dashboard-alert">Loading Practice Lab...</div>
      </div>
    );
  }

  if (error && !lab) {
    return (
      <div className="practice-root">
        <div className="glass dashboard-alert error">{error}</div>
        <Link className="btn ghost" to={backPath}>Back</Link>
      </div>
    );
  }

  if (!lab || lab.version !== LAB_SCHEMA_VERSION || steps.length === 0) {
    return (
      <div className="practice-root">
        <div className="glass dashboard-alert error">This practice session is not lab-ready yet. Rebuild it in Content Factory.</div>
        <Link className="btn ghost" to={backPath}>Back</Link>
      </div>
    );
  }

  const activeContext = asRecord(activeStep?.context);
  const passageText = contextText(activeContext, ['passage_text', 'passage']);
  const transcript = contextText(activeContext, ['transcript']);
  const audioUrl = contextText(activeContext, ['audio_url']);
  const scoredSteps = Array.isArray(result?.scored_steps) ? result.scored_steps.map(asRecord) : [];

  return (
    <div className="practice-root lab-root">
      <header className="lab-topbar">
        <Link className="brand" to={backPath}>
          <img src="/schood-logo.png" alt="Schood" />
          <div>
            <strong>Practice Labs</strong>
            <span>{labKind}</span>
          </div>
        </Link>
        <div className="top-nav-actions">
          <span className={sectionChipClass(lab.section_type)}>{lab.section_type}</span>
          <span className="status-pill">{saving ? 'Saving...' : dirty ? 'Unsaved' : 'Saved'}</span>
          <button className="btn ghost" type="button" onClick={() => void saveNow()} disabled={saving || isScored}>Save</button>
          <button className="btn solid" type="button" onClick={() => void submit()} disabled={submitting || isScored}>
            {submitting ? 'Scoring...' : isScored ? 'Scored' : 'Submit'}
          </button>
        </div>
      </header>

      {error ? <div className="dashboard-alert error">{error}</div> : null}

      <main className="lab-layout">
        <aside className="lab-sidebar">
          <section className="lab-panel coach-panel">
            <p className="eyebrow">Mistake Coach</p>
            <h2>{toText(coach.headline) || labKind}</h2>
            <p>{toText(coach.body) || 'This lab is selected from your diagnostics, mastery gaps, and target band.'}</p>
            <div className="lab-watch-list">
              {coachList(coach, 'watch_for').slice(0, 4).map((item) => <span key={item}>{item}</span>)}
            </div>
          </section>

          <section className="lab-panel">
            <h3>Steps</h3>
            <div className="lab-stepper">
              {steps.map((step, index) => (
                <button
                  key={toText(step.id)}
                  className={`lab-step-button${index === activeStepIndex ? ' active' : ''}`}
                  type="button"
                  onClick={() => goToStep(index)}
                >
                  <span>{index + 1}</span>
                  <strong>{titleCase(step.kind || step.question_type)}</strong>
                </button>
              ))}
            </div>
          </section>

          <section className="lab-panel">
            <h3>Mistake Notebook</h3>
            {notebook.length === 0 ? <p className="muted">Mistakes will appear here after scoring.</p> : (
              <ul className="lab-mini-list">
                {notebook.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <strong>{item.mistake_pattern}</strong>
                    <span>{titleCase(item.status)} | next {item.next_review_at ? new Date(item.next_review_at).toLocaleDateString() : '-'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="lab-panel">
            <h3>Band Roadmap</h3>
            {roadmap.length === 0 ? <p className="muted">Roadmap updates after diagnostics refresh.</p> : (
              <ul className="lab-mini-list">
                {roadmap.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    <span>{titleCase(item.linked_lab_kind)} | priority {Math.round(Number(item.priority ?? 0))}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <section className="lab-main">
          {isScored && result ? (
            <section className="lab-result-panel">
              <div>
                <p className="eyebrow">Lab Result</p>
                <h1>{result.score.estimated_band.toFixed(1)} estimated band</h1>
                <p className="muted">{percent(result.score.accuracy_ratio)} accuracy across answer and process checks.</p>
              </div>
              <div className="lab-result-actions">
                <Link className="btn solid" to="/dashboard">Dashboard</Link>
                <Link className="btn ghost" to="/plan">Next Plan</Link>
              </div>
              <div className="lab-feedback-list">
                {scoredSteps.map((step) => (
                  <article key={toText(step.step_id)} className="lab-feedback-item">
                    <strong>{titleCase(step.question_type)}</strong>
                    <span>{percent(step.accuracy_ratio)} | {toText(step.feedback)}</span>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {activeStep ? (
            <article className="lab-task-panel">
              <div className="lab-task-head">
                <div>
                  <p className="eyebrow">Step {activeStepIndex + 1} of {steps.length}</p>
                  <h1>{toText(activeStep.title) || titleCase(activeStep.kind)}</h1>
                  <p>{toText(activeStep.instructions)}</p>
                </div>
                {(lab.experience_kind === 'timed_mini' || lab.lab_kind === 'timed_mini' || lab.lab_kind === 'mastery_check') ? (
                  <span className="status-pill">No hints mode</span>
                ) : null}
              </div>

              {(passageText || transcript || audioUrl) ? (
                <section className="lab-context-grid">
                  {passageText ? (
                    <article className="lab-context-panel">
                      <h3>{toText(activeContext.passage_title) || 'Passage'}</h3>
                      <div className="lab-scroll-text">{passageText}</div>
                    </article>
                  ) : null}
                  {audioUrl || transcript ? (
                    <article className="lab-context-panel">
                      <h3>Replay Trainer</h3>
                      {audioUrl ? <audio controls src={audioUrl} className="lab-audio" /> : <p className="muted">Audio is not attached to this source.</p>}
                      {transcript ? <div className="lab-scroll-text transcript">{transcript}</div> : <p className="muted">Transcript fallback: use prediction and answer reasoning.</p>}
                    </article>
                  ) : null}
                </section>
              ) : null}

              <section className="lab-question-panel">
                <h3>Task</h3>
                <p>{toText(activeStep.prompt)}</p>
                <div className="lab-answer-stack">
                  {renderAnswerSurface(activeStep)}
                  {renderProcessFields(activeStep)}
                </div>
              </section>

              <footer className="lab-footer-actions">
                <button className="btn ghost" type="button" onClick={() => goToStep(activeStepIndex - 1)} disabled={activeStepIndex === 0}>Previous</button>
                {activeStepIndex < steps.length - 1 ? (
                  <button className="btn solid" type="button" onClick={() => goToStep(activeStepIndex + 1)}>Next</button>
                ) : (
                  <button className="btn solid" type="button" onClick={() => void submit()} disabled={submitting || isScored}>
                    {submitting ? 'Scoring...' : 'Submit Lab'}
                  </button>
                )}
              </footer>
            </article>
          ) : null}
        </section>
      </main>
    </div>
  );
};
