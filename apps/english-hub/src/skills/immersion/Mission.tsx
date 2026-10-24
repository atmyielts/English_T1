import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { TapScope, TapText, TapWords } from '../../components/WordLookup';
import { useT } from '../../i18n';
import { canRecognize, canSpeak, listen, speak, stopSpeaking, type Listener } from '../../lib/speech';
import { useElapsedSeconds, useResource } from '../../lib/useResource';
import { Panel, Tag, useErrorMessage } from '../../ui/kit';
import { ActivityFrame, ResultPanel } from '../ActivityKit';
import type { TapSource } from '../../lib/wordLookup';
import {
  getMission,
  submitMission,
  type MissionQuestion,
  type MissionStep,
  type MissionSubmitResponse,
  type StepKind,
  type StepResult,
} from './api';

type Draft = { answers: Record<string, number>; text: string; mode: 'voice' | 'typed' };
const emptyDraft: Draft = { answers: {}, text: '', mode: 'typed' };

/** Where words saved from this mission come from (My words shows the mission title). */
const MissionSource = createContext<TapSource>({ type: 'english-immersion' });

/** Mission English that the learner can tap for word meanings. */
const MissionText = ({ text, className, style }: { text: string; className: string; style?: CSSProperties }) => (
  <TapText as="p" className={className} style={style} text={text} source={useContext(MissionSource)} />
);

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

const isDone = (step: MissionStep, draft: Draft | undefined): boolean => {
  if (!draft) return false;
  if (step.kind === 'read' || step.kind === 'listen') return step.questions.every((question) => draft.answers[question.id] !== undefined);
  return draft.text.trim().length > 0;
};

/** Multiple-choice questions. After checking, shows the right answer and why. */
const Questions = ({
  scope,
  questions,
  chosen,
  onChoose,
  results,
}: {
  scope: string;
  questions: MissionQuestion[];
  chosen: Record<string, number>;
  onChoose?: (questionId: string, option: number) => void;
  results?: StepResult['questions'];
}) => {
  const t = useT();
  return (
    <div>
      {questions.map((question, index) => {
        const result = results?.find((entry) => entry.id === question.id);
        const picked = result ? result.chosen : chosen[question.id];
        return (
          <div key={question.id} className="en-question" role="group" aria-labelledby={`q-${scope}-${question.id}`}>
            <p className="en-question-prompt" id={`q-${scope}-${question.id}`}>
              <span className="visually-hidden">{t('immersion.step.question', { number: index + 1 })}: </span>
              {question.prompt}
            </p>
            <div className="en-options">
              {question.options.map((option, optionIndex) => {
                const status = result
                  ? optionIndex === result.answer ? 'is-correct' : optionIndex === picked ? 'is-wrong' : ''
                  : '';
                return (
                  <button
                    key={optionIndex}
                    type="button"
                    className={`en-option ${status}`.trim()}
                    aria-pressed={picked === optionIndex}
                    disabled={!onChoose}
                    onClick={() => onChoose?.(question.id, optionIndex)}
                  >
                    <span className="en-option-key">{String.fromCharCode(65 + optionIndex)}</span>
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>
            {result ? (
              <p className="en-explain">
                <strong>{result.correct ? t('immersion.result.correct') : t('immersion.result.wrong', { answer: result.options[result.answer] ?? '' })}</strong>{' '}
                {result.explanation}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

/** Plays a short message with the browser's voice. Falls back to text when it can't. */
const ListenPlayer = ({ text, accent }: { text: string; accent: 'gb' | 'us' | null }) => {
  const t = useT();
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(false);
  useEffect(() => () => stopSpeaking(), []);

  if (!canSpeak()) {
    return (
      <div className="en-stack" style={{ gap: '.5rem' }}>
        <p className="hint">{t('immersion.listen.noAudio')}</p>
        <MissionText className="en-passage im-text" text={text} />
      </div>
    );
  }

  const play = async (rate: number) => {
    setPlaying(true);
    await speak(text, { rate, accent: accent ?? 'any' });
    setPlaying(false);
    setPlayed(true);
  };

  return (
    <div className="en-stack" style={{ gap: '.5rem' }}>
      <div className="en-actions">
        {playing ? (
          <>
            <span className="hint" role="status">{t('immersion.listen.playing')}</span>
            <button type="button" className="quiet" onClick={() => { stopSpeaking(); setPlaying(false); }}>{t('immersion.listen.stop')}</button>
          </>
        ) : (
          <>
            <button type="button" className="is-large" onClick={() => void play(1)}>{played ? t('immersion.listen.again') : t('immersion.listen.play')}</button>
            <button type="button" className="quiet" onClick={() => void play(0.8)}>{t('immersion.listen.slow')}</button>
          </>
        )}
      </div>
      <p className="hint">{t('immersion.listen.hint')}</p>
    </div>
  );
};

/** A spoken answer via speech recognition, with a clearly labelled typed fallback. */
const SpeakInput = ({
  stepId,
  draft,
  onChange,
  disabled,
}: {
  stepId: string;
  draft: Draft;
  onChange: (text: string, mode: 'voice' | 'typed') => void;
  disabled: boolean;
}) => {
  const t = useT();
  const supported = canRecognize();
  const [typing, setTyping] = useState(!supported || (draft.mode === 'typed' && draft.text.length > 0));
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState<'blocked' | 'nothing' | null>(null);
  const listener = useRef<Listener | null>(null);
  const latest = useRef(draft.text);

  useEffect(() => () => listener.current?.stop(), []);

  const start = () => {
    setProblem(null);
    latest.current = '';
    onChange('', 'voice');
    const next = listen({
      onText: (text) => {
        latest.current = text;
        onChange(text, 'voice');
      },
      onEnd: (error) => {
        listener.current = null;
        setRecording(false);
        if (error === 'not-allowed' || error === 'service-not-allowed' || error === 'audio-capture') {
          setProblem('blocked');
          setTyping(true);
        } else if (!latest.current.trim()) {
          setProblem('nothing');
        }
      },
    });
    if (!next) {
      setTyping(true);
      return;
    }
    listener.current = next;
    setRecording(true);
  };

  const stop = () => listener.current?.stop();

  if (typing) {
    return (
      <div className="en-stack" style={{ gap: '.5rem' }}>
        {!supported ? <p className="hint">{t('immersion.speak.unsupported')}</p> : null}
        {problem === 'blocked' ? <p className="error" role="alert">{t('immersion.speak.blocked')}</p> : null}
        <label htmlFor={`typed-${stepId}`} style={{ fontWeight: 600 }}>{t('immersion.speak.typedLabel')}</label>
        <textarea
          id={`typed-${stepId}`}
          lang="en"
          rows={4}
          value={draft.mode === 'typed' ? draft.text : ''}
          disabled={disabled}
          placeholder={t('immersion.speak.typedPlaceholder')}
          onChange={(event) => onChange(event.target.value, 'typed')}
        />
        <div className="en-row">
          <span className="hint">{t('immersion.speak.typedNote')}</span>
          {supported && !disabled ? (
            <button type="button" className="quiet" onClick={() => { setTyping(false); setProblem(null); onChange('', 'voice'); }}>{t('immersion.speak.useMic')}</button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="en-stack" style={{ gap: '.5rem' }}>
      <div className="en-actions">
        {recording ? (
          <>
            <span className="im-recording" role="status">{t('immersion.speak.listening')}</span>
            <button type="button" onClick={stop}>{t('immersion.speak.stop')}</button>
          </>
        ) : (
          <button type="button" className="is-large" disabled={disabled} onClick={start}>
            {draft.mode === 'voice' && draft.text ? t('immersion.speak.again') : t('immersion.speak.start')}
          </button>
        )}
        {!recording && !disabled ? (
          <button type="button" className="quiet" onClick={() => { setTyping(true); onChange('', 'typed'); }}>{t('immersion.speak.typeInstead')}</button>
        ) : null}
      </div>
      {problem === 'nothing' ? <p className="hint" role="status">{t('immersion.speak.nothing')}</p> : null}
      {draft.mode === 'voice' && draft.text ? (
        <div className="en-stack" style={{ gap: '.25rem' }} aria-live="polite">
          <span className="hint">{t('immersion.speak.heard')}</span>
          <p className="en-passage" lang="en" aria-label={t('immersion.speak.label')} style={{ fontSize: '1rem', margin: 0 }}>{draft.text}</p>
        </div>
      ) : null}
    </div>
  );
};

/** One step while doing the task. */
const StepBody = ({
  step,
  draft,
  update,
  busy,
}: {
  step: MissionStep;
  draft: Draft;
  update: (stepId: string, patch: Partial<Draft> | ((draft: Draft) => Partial<Draft>)) => void;
  busy: boolean;
}) => {
  const t = useT();
  const choose = (questionId: string, option: number) =>
    update(step.id, (current) => ({ answers: { ...current.answers, [questionId]: option } }));

  if (step.kind === 'read') {
    return (
      <>
        <MissionText className="en-passage im-text" text={step.text} />
        <Questions scope={step.id} questions={step.questions} chosen={draft.answers} onChoose={busy ? undefined : choose} />
      </>
    );
  }
  if (step.kind === 'listen') {
    return (
      <>
        <ListenPlayer key={step.id} text={step.text} accent={step.accent} />
        <Questions scope={step.id} questions={step.questions} chosen={draft.answers} onChoose={busy ? undefined : choose} />
      </>
    );
  }
  if (step.kind === 'reply') {
    const words = wordCount(draft.text);
    return (
      <>
        <MissionText className="im-cue" text={step.text} />
        <label htmlFor={`reply-${step.id}`} style={{ fontWeight: 600 }}>{t('immersion.reply.label')}</label>
        <textarea
          id={`reply-${step.id}`}
          className="en-writing"
          lang="en"
          value={draft.text}
          disabled={busy}
          placeholder={t('immersion.reply.placeholder')}
          onChange={(event) => update(step.id, { text: event.target.value, mode: 'typed' })}
          style={{ minHeight: '9rem' }}
        />
        <p className="en-meter" aria-live="polite">
          <span><strong>{t('immersion.reply.words', { count: words })}</strong></span>
          {step.min_words ? <span>{t('immersion.reply.aim', { count: step.min_words })}</span> : null}
        </p>
      </>
    );
  }
  return (
    <>
      <MissionText className="im-cue" text={step.text} />
      <SpeakInput
        key={step.id}
        stepId={step.id}
        draft={draft}
        disabled={busy}
        onChange={(text, mode) => update(step.id, { text, mode })}
      />
      {step.min_words ? <p className="hint">{t('immersion.reply.aim', { count: step.min_words })}</p> : null}
    </>
  );
};

/** One step's outcome after checking. */
const StepOutcome = ({ step, result }: { step: MissionStep; result: StepResult }) => {
  const t = useT();
  const feedback = result.feedback;
  return (
    <article className="im-step-result">
      <div className="en-row" style={{ justifyContent: 'space-between' }}>
        <h3>{t(`immersion.step.kind.${result.kind}`)} · {result.title}</h3>
        <Tag>{t('immersion.result.score', { score: result.score })}</Tag>
      </div>

      {result.kind === 'read' || result.kind === 'listen' ? (
        <>
          {result.kind === 'listen' && result.transcript ? (
            <details>
              <summary>{t('immersion.listen.heard')}</summary>
              <MissionText className="en-passage im-text" style={{ fontSize: '.95rem' }} text={result.transcript} />
            </details>
          ) : null}
          <Questions scope={`r-${step.id}`} questions={step.questions} chosen={{}} results={result.questions} />
        </>
      ) : (
        <>
          <div className="en-stack" style={{ gap: '.25rem' }}>
            <span className="hint">
              {t('immersion.result.yourAnswer')}
              {result.kind === 'speak' && result.mode ? ` (${t(result.mode === 'voice' ? 'immersion.result.spoken' : 'immersion.result.typed')})` : ''}
            </span>
            <p className="im-cue" lang="en">{result.response?.trim() ? result.response : t('immersion.result.noAnswer')}</p>
          </div>
          {feedback?.summary ? <p style={{ margin: 0 }}>{feedback.summary}</p> : null}
          {feedback?.points.length ? (
            <div className="en-stack" style={{ gap: '.35rem' }}>
              <strong style={{ fontSize: '.9rem' }}>{t('immersion.result.checklist')}</strong>
              <ul className="im-checklist">
                {feedback.points.map((point) => (
                  <li key={point.label} className={point.met ? 'is-met' : 'is-missed'}>
                    <span className="im-mark" aria-hidden="true">{point.met ? '✓' : '✗'}</span>
                    <span>
                      <span className="visually-hidden">{point.met ? t('immersion.result.met') : t('immersion.result.missed')}: </span>
                      {point.label.charAt(0).toUpperCase() + point.label.slice(1)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {feedback?.tone_note ? <p className="en-explain"><strong>{t('immersion.result.tone')}:</strong> {feedback.tone_note}</p> : null}
          {feedback?.corrections.length ? (
            <div className="en-stack" style={{ gap: '.35rem' }}>
              <strong style={{ fontSize: '.9rem' }}>{t('immersion.result.corrections')}</strong>
              <ul className="en-list">
                {feedback.corrections.map((correction, index) => (
                  <li key={index} className="en-diff" style={{ fontSize: '.95rem' }}>
                    <del>{correction.original}</del> → <ins>{correction.better}</ins>
                    {correction.explanation ? <><br /><span className="hint">{correction.explanation}</span></> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.model_answer ? (
            <details>
              <summary>{t('immersion.result.example')}</summary>
              <MissionText className="en-passage im-text" style={{ fontSize: '.95rem' }} text={result.model_answer} />
            </details>
          ) : null}
        </>
      )}
    </article>
  );
};

export const MissionPlayer = () => {
  const t = useT();
  const errorText = useErrorMessage();
  const { slug = '' } = useParams();
  const resource = useResource((signal) => getMission(slug, signal), [slug]);
  const elapsed = useElapsedSeconds();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [current, setCurrent] = useState(0);
  const [result, setResult] = useState<MissionSubmitResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const mission = resource.data?.mission;
  const steps = (resource.data?.steps ?? []).filter((step): step is MissionStep & { kind: StepKind } => step.kind !== null);
  const step = steps[Math.min(current, Math.max(0, steps.length - 1))];
  const doneCount = steps.filter((entry) => isDone(entry, drafts[entry.id])).length;
  const tapSource = useMemo<TapSource>(() => ({ type: 'english-immersion', label: mission?.title ?? null, ref: slug }), [mission?.title, slug]);

  const update = useCallback((stepId: string, patch: Partial<Draft> | ((draft: Draft) => Partial<Draft>)) => {
    setDrafts((all) => {
      const before = all[stepId] ?? emptyDraft;
      const change = typeof patch === 'function' ? patch(before) : patch;
      return { ...all, [stepId]: { ...before, ...change } };
    });
  }, []);

  const goTo = (index: number) => {
    stopSpeaking();
    setCurrent(index);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const check = async () => {
    stopSpeaking();
    setBusy(true);
    setError(null);
    try {
      const payload = steps.map((entry) => {
        const draft = drafts[entry.id] ?? emptyDraft;
        return entry.kind === 'read' || entry.kind === 'listen'
          ? { step_id: entry.id, answers: draft.answers }
          : { step_id: entry.id, text: draft.text, mode: entry.kind === 'speak' ? draft.mode : 'typed' as const };
      });
      setResult(await submitMission(slug, payload, elapsed()));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    setDrafts({});
    setResult(null);
    setCurrent(0);
  };

  // Learner-facing summary built only from what the server checked.
  const good: string[] = [];
  const fix: string[] = [];
  if (result) {
    const questions = result.steps.flatMap((entry) => entry.questions);
    const right = questions.filter((question) => question.correct).length;
    if (questions.length && right > 0) good.push(t('immersion.result.questionsRight', { correct: right, total: questions.length }));
    for (const entry of result.steps) {
      const points = entry.feedback?.points ?? [];
      if (points.length && points.every((point) => point.met)) good.push(t('immersion.result.stepDone', { title: entry.title }));
    }
    if (right < questions.length) fix.push(t('immersion.result.wrongQuestions'));
    for (const entry of result.steps) {
      if (entry.feedback?.too_short && entry.response?.trim()) fix.push(t('immersion.result.tooShort', { title: entry.title, count: entry.feedback.min_words }));
    }
    const missed = result.steps.flatMap((entry) => (entry.feedback?.points ?? []).filter((point) => !point.met).map((point) => point.label));
    for (const label of [...new Set(missed)].slice(0, 3)) fix.push(t('immersion.result.pointMissed', { label }));
  }
  const finished = result ? result.steps.filter((entry) => (entry.questions.some((question) => question.chosen !== null)) || entry.response?.trim()).length : 0;

  const frame = (
    <ActivityFrame
      skill="immersion"
      title={mission?.title}
      level={mission?.level}
      minutes={mission?.estimated_minutes}
      lead={mission?.context_text}
      loading={resource.loading && !resource.data}
      error={resource.error}
      onRetry={resource.reload}
    >
      {result ? (
        <>
          <ResultPanel
            skill="immersion"
            slug={slug}
            score={result.score}
            summary={t('immersion.result.summary', { done: finished, total: result.steps.length })}
            good={good}
            fix={fix.slice(0, 5)}
            onRetry={retry}
          >
            {result.feedback_mode === 'basic' ? <p className="en-explain">{t('immersion.result.basic')}</p> : null}
          </ResultPanel>

          {result.cultural_note ? (
            <Panel title={t('immersion.result.goodToKnow')} tone="teal">
              <p style={{ margin: 0 }}>{result.cultural_note}</p>
            </Panel>
          ) : null}

          <Panel title={t('immersion.result.steps')}>
            {result.steps.map((entry) => {
              const original = steps.find((candidate) => candidate.id === entry.step_id);
              return original ? <StepOutcome key={entry.step_id} step={original} result={entry} /> : null;
            })}
          </Panel>
        </>
      ) : (
        <>
          <Panel title={t('immersion.situation.title')}>
            {mission?.objective_text ? (
              <TapScope as="p" style={{ margin: 0 }} lang={null} source={tapSource}>
                <strong>{t('immersion.situation.goal')}:</strong> <span lang="en"><TapWords text={mission.objective_text} /></span>
              </TapScope>
            ) : null}
            {mission?.success_conditions.length ? (
              <div className="en-stack" style={{ gap: '.35rem' }}>
                <strong style={{ fontSize: '.9rem' }}>{t('immersion.situation.success')}</strong>
                <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '.25rem', fontSize: '.9rem' }}>
                  {mission.success_conditions.map((condition) => <li key={condition}>{condition}</li>)}
                </ul>
              </div>
            ) : null}
          </Panel>

          {step ? (
            <section className="en-panel">
              <ol className="en-steps" aria-label={t('immersion.steps.label')}>
                {steps.map((entry, index) => {
                  const done = isDone(entry, drafts[entry.id]);
                  const state = index === current ? 'is-current' : done ? 'is-done' : '';
                  return (
                    <li key={entry.id} className={state} aria-current={index === current ? 'step' : undefined}>
                      <span>{done && index !== current ? '✓' : index + 1}</span>
                      {t(`immersion.step.kind.${entry.kind}`)}
                    </li>
                  );
                })}
              </ol>
              <div className="en-panel-head">
                <div>
                  <p className="eyebrow">{t('immersion.step.count', { number: current + 1, total: steps.length })} · {t(`immersion.step.kind.${step.kind}`)}</p>
                  <h2>{step.title}</h2>
                </div>
                <Tag>{t('common.minutesShort', { count: step.estimated_minutes })}</Tag>
              </div>
              <p style={{ margin: 0 }}>{step.instructions}</p>
              <StepBody step={step} draft={drafts[step.id] ?? emptyDraft} update={update} busy={busy} />

              {error ? <div className="error" role="alert">{errorText(error)}</div> : null}
              <div className="en-actions">
                {current > 0 ? <button type="button" className="quiet" disabled={busy} onClick={() => goTo(current - 1)}>{t('immersion.step.back')}</button> : null}
                {current < steps.length - 1 ? (
                  <button type="button" className="is-large" onClick={() => goTo(current + 1)}>{t('immersion.step.next')}</button>
                ) : (
                  <button type="button" className="is-large" disabled={busy || doneCount === 0} onClick={() => void check()}>
                    {busy ? t('immersion.submit.checking') : t('immersion.submit.check')}
                  </button>
                )}
                <span className="hint">{t('immersion.submit.progress', { done: doneCount, total: steps.length })}</span>
              </div>
              {current === steps.length - 1 && doneCount > 0 && doneCount < steps.length ? (
                <p className="hint">{t('immersion.submit.unanswered', { count: steps.length - doneCount })}</p>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </ActivityFrame>
  );
  return <MissionSource.Provider value={tapSource}>{frame}</MissionSource.Provider>;
};
