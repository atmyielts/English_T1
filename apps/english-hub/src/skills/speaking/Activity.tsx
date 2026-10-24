import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useT } from '../../i18n';
import { canSpeak, speak, stopSpeaking } from '../../lib/speech';
import { L1Why } from '../../components/L1Why';
import { useElapsedSeconds, useResource } from '../../lib/useResource';
import { Panel, Tag, useErrorMessage } from '../../ui/kit';
import { YourWordsHint, YourWordsResult } from '../YourWords';
import { ActivityFrame, ResultPanel } from '../ActivityKit';
import { getPrompt, submitAnswer, type SpeakingMode, type SpeakingPrompt, type SpeakingSubmitResponse } from './api';
import { useSpeakingCapture, type CaptureProblem } from './capture';

const MIN_WORDS = 5;

const clock = (total: number): string => {
  const safe = Math.max(0, Math.round(total));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
};

const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

type Stage = 'brief' | 'prep' | 'speak' | 'type';

/** "Listen" button for a model text, with stop. Hidden when the browser cannot speak. */
const ListenButton = ({ text, label }: { text: string; label: string }) => {
  const t = useT();
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => stopSpeaking(), []);
  if (!canSpeak() || !text.trim()) return null;
  const toggle = () => {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    void speak(text, { rate: 0.95 }).finally(() => setPlaying(false));
  };
  return (
    <button type="button" className="quiet" aria-pressed={playing} onClick={toggle}>
      {playing ? t('speaking.listen.stop') : label}
    </button>
  );
};

const ProblemNotice = ({ problem }: { problem: CaptureProblem }) => {
  const t = useT();
  return <p className="error" role="alert" style={{ margin: 0 }}>{t(`speaking.problem.${problem}`)}</p>;
};

/** Situation, cue points as a checklist, useful words and the time to aim for. */
const TaskCard = ({ prompt }: { prompt: SpeakingPrompt }) => {
  const t = useT();
  const [ticked, setTicked] = useState<Record<number, boolean>>({});
  const opening = prompt.metadata?.model_opening ?? '';
  const words = prompt.target_vocabulary ?? [];
  return (
    <Panel title={t('speaking.task.title')} aside={<span>{t('speaking.task.target', { time: clock(prompt.target_duration_seconds) })}</span>}>
      <p className="en-passage" lang="en" style={{ fontSize: '1rem' }}>{prompt.prompt_text}</p>
      {prompt.cue_points.length ? (
        <fieldset className="sp-cues">
          <legend>{t('speaking.task.cues')}</legend>
          {prompt.cue_points.map((cue, index) => (
            <label key={index} className="sp-cue">
              <input
                type="checkbox"
                checked={Boolean(ticked[index])}
                onChange={(event) => setTicked((current) => ({ ...current, [index]: event.target.checked }))}
              />
              <span lang="en">{cue}</span>
            </label>
          ))}
          <p className="hint" style={{ margin: 0 }}>{t('speaking.task.cuesHint')}</p>
        </fieldset>
      ) : null}
      {words.length ? (
        <div className="en-stack" style={{ gap: '.4rem' }}>
          <h3 style={{ margin: 0, fontSize: '.95rem' }}>{t('speaking.task.words')}</h3>
          <div className="en-row" style={{ flexWrap: 'wrap', gap: '.4rem' }} lang="en">
            {words.map((word) => <Tag key={word}>{word}</Tag>)}
          </div>
        </div>
      ) : null}
      {prompt.target_grammar ? <p className="hint" style={{ margin: 0 }}><strong>{t('speaking.task.grammar')}</strong> {prompt.target_grammar}</p> : null}
      {prompt.fluency_objective ? <p className="hint" style={{ margin: 0 }}><strong>{t('speaking.task.tip')}</strong> {prompt.fluency_objective}</p> : null}
      {opening ? (
        <div className="en-row" style={{ flexWrap: 'wrap' }}>
          <ListenButton text={opening} label={t('speaking.task.hearOpening')} />
          {!canSpeak() ? <p className="hint" style={{ margin: 0 }}><strong>{t('speaking.task.openingLabel')}</strong> <span lang="en">{opening}</span></p> : null}
        </div>
      ) : null}
    </Panel>
  );
};

/** Optional planning countdown before recording. */
const PrepTimer = ({ seconds, onDone }: { seconds: number; onDone: () => void }) => {
  const t = useT();
  const [left, setLeft] = useState(seconds);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => {
      const remaining = seconds - Math.floor((Date.now() - started) / 1000);
      setLeft(Math.max(0, remaining));
      if (remaining <= 0) {
        window.clearInterval(id);
        done.current();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [seconds]);
  return (
    <div className="sp-timer" role="timer" aria-live="off">
      <p className="eyebrow" style={{ margin: 0 }}>{t('speaking.prep.title')}</p>
      <strong>{clock(left)}</strong>
      <p className="hint" style={{ margin: 0 }}>{t('speaking.prep.hint')}</p>
      <div className="en-actions">
        <button type="button" onClick={onDone}>{t('speaking.prep.skip')}</button>
      </div>
    </div>
  );
};

export const SpeakingActivity = () => {
  const t = useT();
  const errorText = useErrorMessage();
  const { slug = '' } = useParams();
  const resource = useResource((signal) => getPrompt(slug, signal), [slug]);
  const elapsed = useElapsedSeconds();
  const prompt = resource.data?.prompt ?? null;
  const yourWords = resource.data?.your_words ?? [];
  const target = prompt?.target_duration_seconds ?? 60;
  const capture = useSpeakingCapture(Math.min(600, target * 2 + 60));
  const [stage, setStage] = useState<Stage>('brief');
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<SpeakingSubmitResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const prepSeconds = prompt?.level === 'A1' || prompt?.level === 'A2' ? 15 : 30;
  const speechAvailable = capture.supported && capture.problem !== 'unsupported';

  const startRecording = () => {
    setStage('speak');
    void capture.start();
  };

  const send = async (mode: SpeakingMode) => {
    const transcript = mode === 'speech' ? capture.transcript : typed;
    setBusy(true);
    setError(null);
    try {
      const response = await submitAnswer(slug, {
        transcript,
        mode,
        speakingSeconds: mode === 'speech' ? capture.speakingSeconds() : null,
        timeSpentSeconds: elapsed(),
        yourWordIds: yourWords.map((entry) => entry.id),
      });
      setResult(response);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    stopSpeaking();
    capture.reset();
    setTyped('');
    setResult(null);
    setError(null);
    setStage('brief');
  };

  const switchToTyping = () => {
    if (capture.phase === 'recording' || capture.phase === 'finishing') capture.stop();
    if (!typed && capture.transcript) setTyped(capture.transcript);
    setStage('type');
  };

  const level = prompt?.level ?? null;
  const minutes = prompt ? Math.ceil(prompt.target_duration_seconds / 60) + 4 : null;
  const taskType = prompt?.metadata?.task_type;

  return (
    <ActivityFrame
      skill="speaking"
      title={prompt?.title}
      level={level}
      minutes={minutes}
      lead={taskType ? t(`speaking.type.${taskType}`) : undefined}
      loading={resource.loading && !resource.data}
      error={resource.error}
      onRetry={resource.reload}
    >
      {result && prompt ? (
        <>
          <YourWordsResult suggested={yourWords} used={result.your_words_used ?? []} />
          <SpeakingResult prompt={prompt} result={result} audioUrl={result.mode === 'speech' ? capture.audioUrl : null} onRetry={retry} />
        </>
      ) : prompt ? (
        <>
          <TaskCard prompt={prompt} />

          <Panel title={t('speaking.answer.title')}>
            <YourWordsHint words={yourWords} />
            {stage === 'brief' ? (
              <div className="en-stack">
                {speechAvailable ? (
                  <>
                    <p style={{ margin: 0 }}>{t('speaking.answer.intro', { time: clock(target) })}</p>
                    <p className="hint" style={{ margin: 0 }}>{t('speaking.answer.privacy')}</p>
                    <div className="en-actions">
                      <button type="button" className="is-large" onClick={() => setStage('prep')}>{t('speaking.answer.prepare', { count: prepSeconds })}</button>
                      <button type="button" className="quiet" onClick={startRecording}>{t('speaking.answer.startNow')}</button>
                    </div>
                  </>
                ) : (
                  <ProblemNotice problem="unsupported" />
                )}
                <button type="button" className="is-link sp-link" onClick={switchToTyping}>{t('speaking.answer.typeInstead')}</button>
              </div>
            ) : null}

            {stage === 'prep' ? <PrepTimer seconds={prepSeconds} onDone={startRecording} /> : null}

            {stage === 'speak' ? (
              <div className="en-stack">
                {capture.problem ? <ProblemNotice problem={capture.problem} /> : null}
                {capture.phase === 'recording' || capture.phase === 'finishing' ? (
                  <div className="sp-timer is-live" role="timer" aria-live="off">
                    <p className="eyebrow" style={{ margin: 0 }}>
                      <span className="sp-dot" aria-hidden="true" />
                      {capture.phase === 'recording' ? t('speaking.record.live') : t('speaking.record.finishing')}
                    </p>
                    <strong>{clock(capture.seconds)}</strong>
                    <p className="hint" style={{ margin: 0 }}>
                      {capture.seconds >= target ? t('speaking.record.targetReached') : t('speaking.record.target', { time: clock(target) })}
                    </p>
                    <div className="sp-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (capture.seconds / target) * 100)}%` }} /></div>
                  </div>
                ) : null}

                {capture.transcript ? (
                  <div className="en-stack" style={{ gap: '.35rem' }}>
                    <h3 style={{ margin: 0, fontSize: '.95rem' }}>{capture.phase === 'done' ? t('speaking.record.heard') : t('speaking.record.hearing')}</h3>
                    <p className="en-passage sp-transcript" lang="en" aria-live="polite">{capture.transcript}</p>
                  </div>
                ) : capture.phase === 'recording' ? (
                  <p className="hint" style={{ margin: 0 }}>{t('speaking.record.waiting')}</p>
                ) : null}

                {capture.phase === 'recording' ? (
                  <div className="en-actions">
                    <button type="button" className="is-large" onClick={capture.stop}>{t('speaking.record.stop')}</button>
                  </div>
                ) : null}

                {capture.phase === 'done' ? (
                  <>
                    <p className="en-meter" style={{ margin: 0 }}>
                      <span>{t('speaking.record.time')} <strong>{clock(capture.speakingSeconds() ?? capture.seconds)}</strong></span>
                      <span>{t('speaking.record.words')} <strong>{wordCount(capture.transcript)}</strong></span>
                    </p>
                    {capture.audioUrl ? (
                      <div className="en-stack" style={{ gap: '.35rem' }}>
                        <h3 style={{ margin: 0, fontSize: '.95rem' }}>{t('speaking.record.replay')}</h3>
                        <audio controls src={capture.audioUrl} className="sp-audio" aria-label={t('speaking.record.replay')} />
                      </div>
                    ) : null}
                    <p className="hint" style={{ margin: 0 }}>{t('speaking.record.mishear')}</p>
                    {wordCount(capture.transcript) < MIN_WORDS ? <p className="error" style={{ margin: 0 }}>{t('speaking.answer.tooShort')}</p> : null}
                    {error ? <div className="error" role="alert">{errorText(error)}</div> : null}
                    <div className="en-actions">
                      <button type="button" className="is-large" disabled={busy || wordCount(capture.transcript) < MIN_WORDS} onClick={() => void send('speech')}>
                        {busy ? t('speaking.answer.checking') : t('speaking.answer.check')}
                      </button>
                      <button type="button" className="quiet" disabled={busy} onClick={startRecording}>{t('speaking.record.again')}</button>
                    </div>
                  </>
                ) : null}

                {capture.phase === 'idle' && !capture.problem ? (
                  <p className="hint" style={{ margin: 0 }}>{t('speaking.record.starting')}</p>
                ) : null}

                {capture.phase === 'idle' && capture.problem && capture.problem !== 'unsupported' ? (
                  <div className="en-actions">
                    <button type="button" onClick={startRecording}>{t('speaking.record.tryAgain')}</button>
                  </div>
                ) : null}

                {capture.phase !== 'finishing' ? (
                  <button type="button" className="is-link sp-link" disabled={busy} onClick={switchToTyping}>{t('speaking.answer.typeInstead')}</button>
                ) : null}
              </div>
            ) : null}

            {stage === 'type' ? (
              <div className="en-stack">
                <p className="en-notice" style={{ margin: 0 }}>
                  <strong>{t('speaking.typed.label')}</strong> {t('speaking.typed.note')}
                </p>
                <label className="en-stack" style={{ gap: '.35rem' }}>
                  <span className="eyebrow">{t('speaking.typed.field')}</span>
                  <textarea
                    className="en-writing"
                    lang="en"
                    value={typed}
                    disabled={busy}
                    onChange={(event) => setTyped(event.target.value)}
                    placeholder={t('speaking.typed.placeholder')}
                    style={{ minHeight: '10rem' }}
                  />
                </label>
                <p className="en-meter" style={{ margin: 0 }}>
                  <span>{t('speaking.record.words')} <strong>{wordCount(typed)}</strong></span>
                </p>
                {wordCount(typed) > 0 && wordCount(typed) < MIN_WORDS ? <p className="hint" style={{ margin: 0 }}>{t('speaking.answer.tooShort')}</p> : null}
                {error ? <div className="error" role="alert">{errorText(error)}</div> : null}
                <div className="en-actions">
                  <button type="button" className="is-large" disabled={busy || wordCount(typed) < MIN_WORDS} onClick={() => void send('typed')}>
                    {busy ? t('speaking.answer.checking') : t('speaking.answer.check')}
                  </button>
                  {speechAvailable ? (
                    <button type="button" className="quiet" disabled={busy} onClick={() => { capture.reset(); setStage('brief'); }}>{t('speaking.typed.backToSpeaking')}</button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </Panel>
        </>
      ) : null}
    </ActivityFrame>
  );
};

const SpeakingResult = ({
  prompt,
  result,
  audioUrl,
  onRetry,
}: {
  prompt: SpeakingPrompt;
  result: SpeakingSubmitResponse;
  audioUrl: string | null;
  onRetry: () => void;
}) => {
  const t = useT();
  const { feedback } = result;
  const missed = feedback.cue_points.filter((cue) => !cue.covered).map((cue) => cue.text);
  const fix = [feedback.tip, ...(missed.length ? [t('speaking.result.missed', { points: missed.join('; ') })] : [])]
    .filter((item, index, all) => item && all.indexOf(item) === index);
  const [low, high] = feedback.stats.pace_band;

  return (
    <ResultPanel
      skill="speaking"
      slug={prompt.slug}
      score={feedback.overall}
      summary={(
        <>
          {feedback.source === 'ai' ? t('speaking.result.summaryAi') : t('speaking.result.summaryBasic')}
          {result.previous_score !== null ? <> {t('speaking.result.previous', { score: result.previous_score })}</> : null}
        </>
      )}
      good={feedback.strengths}
      fix={fix}
      onRetry={onRetry}
      savedMistakes={feedback.corrections.length}
      mainMistake={feedback.corrections[0] ? { original: feedback.corrections[0].said, corrected: feedback.corrections[0].better, explanation: feedback.corrections[0].explanation } : null}
      title={prompt.title}
    >
      {result.mode === 'typed' ? (
        <p className="en-notice" style={{ margin: 0 }}><strong>{t('speaking.typed.label')}</strong> {t('speaking.typed.note')}</p>
      ) : null}

      <div className="sp-scores">
        <div className="en-stat"><small>{t('speaking.result.task')}</small><strong>{feedback.scores.task}</strong></div>
        <div className="en-stat"><small>{t('speaking.result.vocabulary')}</small><strong>{feedback.scores.vocabulary}</strong></div>
        {feedback.scores.grammar !== null ? (
          <div className="en-stat"><small>{t('speaking.result.grammar')}</small><strong>{feedback.scores.grammar}</strong></div>
        ) : null}
        {feedback.scores.fluency !== null && feedback.stats.wpm !== null ? (
          <div className="en-stat">
            <small>{t('speaking.result.pace')}</small>
            <strong>{feedback.scores.fluency}</strong>
            <span>{t('speaking.result.wpm', { wpm: feedback.stats.wpm, low, high, level: prompt.level ?? '' })}</span>
          </div>
        ) : null}
      </div>
      <p className="hint" style={{ margin: 0 }}>
        {feedback.source === 'basic' ? t('speaking.result.basicNote') : null} {t('speaking.result.soundNote')}
      </p>

      {audioUrl ? (
        <div className="en-stack" style={{ gap: '.35rem' }}>
          <h3 style={{ margin: 0, fontSize: '.95rem' }}>{t('speaking.record.replay')}</h3>
          <audio controls src={audioUrl} className="sp-audio" aria-label={t('speaking.record.replay')} />
        </div>
      ) : null}

      <div className="en-stack" style={{ gap: '.35rem' }}>
        <h3 style={{ margin: 0, fontSize: '.95rem' }}>{result.mode === 'speech' ? t('speaking.result.transcriptSpeech') : t('speaking.result.transcriptTyped')}</h3>
        <p className="en-passage sp-transcript" lang="en">{result.transcript}</p>
        <p className="en-meter" style={{ margin: 0 }}>
          <span>{t('speaking.record.words')} <strong>{feedback.stats.words}</strong></span>
          {feedback.stats.speaking_seconds !== null ? <span>{t('speaking.record.time')} <strong>{clock(feedback.stats.speaking_seconds)}</strong></span> : null}
          {feedback.stats.filler_count > 0 ? <span>{t('speaking.result.fillers')} <strong>{feedback.stats.filler_count}</strong></span> : null}
        </p>
      </div>

      {feedback.cue_points.length ? (
        <div className="en-stack" style={{ gap: '.35rem' }}>
          <h3 style={{ margin: 0, fontSize: '.95rem' }}>{t('speaking.result.points')}</h3>
          <ul className="en-list">
            {feedback.cue_points.map((cue) => (
              <li key={cue.text} className="en-row" style={{ gap: '.6rem' }}>
                <span className={`en-check ${cue.covered ? 'is-done' : ''}`.trim()} aria-hidden="true">{cue.covered ? '✓' : ''}</span>
                <span lang="en">{cue.text}</span>
                <span className="visually-hidden">{cue.covered ? t('speaking.result.covered') : t('speaking.result.notCovered')}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {feedback.corrections.length ? (
        <div className="en-stack" style={{ gap: '.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '.95rem' }}>{t('speaking.result.corrections')}</h3>
          {result.mode === 'speech' ? <p className="hint" style={{ margin: 0 }}>{t('speaking.record.mishear')}</p> : null}
          <ul className="en-list">
            {feedback.corrections.map((correction, index) => (
              <li key={index} className="en-stack" style={{ gap: '.25rem' }}>
                <span className="en-diff" lang="en"><del>{correction.said}</del> <ins>{correction.better}</ins></span>
                {correction.explanation ? <span className="hint">{correction.explanation}</span> : null}
                <L1Why original={correction.said} corrected={correction.better} explanation={correction.explanation} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {feedback.model_answer ? (
        <div className="en-stack" style={{ gap: '.5rem' }}>
          <div className="en-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: '.95rem' }}>
              {feedback.model_answer_kind === 'improved' ? t('speaking.result.modelImproved') : t('speaking.result.modelExample')}
            </h3>
            <ListenButton text={feedback.model_answer} label={t('speaking.listen.play')} />
          </div>
          <p className="en-passage" lang="en" style={{ fontSize: '1rem' }}>{feedback.model_answer}</p>
        </div>
      ) : null}
    </ResultPanel>
  );
};
