import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { answerReviewItem, type ReviewAnswer, type ReviewItem } from '../lib/review';
import { ApiError } from '../lib/api';
import { ProgressBar, useErrorMessage } from '../ui/kit';

/** One missed question at a time: answer, see if it's right, move on. */
export const ReviewQuestions = ({ items, onFinished }: { items: ReviewItem[]; onFinished: (right: number, attempted: number) => void }) => {
  const t = useT();
  const errorText = useErrorMessage();
  const [index, setIndex] = useState(0);
  const [text, setText] = useState('');
  const [choice, setChoice] = useState<number | null>(null);
  const [result, setResult] = useState<ReviewAnswer | null>(null);
  const [right, setRight] = useState(0);
  const [attempted, setAttempted] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const [audioReady, setAudioReady] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [heard, setHeard] = useState(false);
  const item = items[index];
  useEffect(() => {
    const player = audio.current;
    return () => player?.pause();
  }, [item?.id]);
  if (!item) return null;

  const recording = item.type === 'dictation' ? item.recording : undefined;
  const blockedAudio = item.type === 'dictation' && (!recording || audioFailed);
  const canCheck = item.type === 'choice' ? choice !== null : text.trim().length > 0;
  const canSubmit = canCheck && !blockedAudio && (item.type !== 'dictation' || heard);

  const play = async (rate: number) => {
    const player = audio.current;
    if (!player || !recording || !audioReady) return;
    player.pause();
    player.currentTime = recording.starts_at_seconds;
    player.playbackRate = rate;
    try {
      await player.play();
    } catch (cause) {
      if (!(cause instanceof DOMException) || cause.name !== 'AbortError') setAudioFailed(true);
    }
  };

  const check = async () => {
    setBusy(true);
    setError(null);
    audio.current?.pause();
    try {
      const answer = await answerReviewItem(item.id, item.type === 'choice' ? choice ?? -1 : text, recording);
      setResult(answer);
      setAttempted((value) => value + 1);
      if (answer.correct) setRight((value) => value + 1);
    } catch (cause) {
      if (cause instanceof ApiError && ['listening_audio_soon', 'listening_recording_changed'].includes(cause.code ?? '')) setAudioFailed(true);
      else setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    audio.current?.pause();
    if (index + 1 >= items.length) {
      onFinished(right, attempted);
      return;
    }
    setIndex(index + 1);
    setText('');
    setChoice(null);
    setResult(null);
    setError(null);
    setAudioReady(false);
    setAudioFailed(false);
    setHeard(false);
  };

  return (
    <div className="en-stack">
      <div className="en-row">
        <span className="hint">{t('review.questions.of', { current: index + 1, total: items.length })}</span>
        <span className="en-spacer" />
        <div style={{ flex: '0 1 14rem' }}><ProgressBar value={(index / items.length) * 100} label={t('review.progress')} /></div>
      </div>
      <div className="en-question">
        <p className="eyebrow">{t(`skill.${item.kind}`)} · {item.source_title}</p>

        {item.type === 'grammar' ? (
          <>
            {item.instructions ? <p className="hint">{item.instructions}</p> : null}
            <p className="en-question-prompt" lang="en">{item.prompt}</p>
            <input
              type="text"
              lang="en"
              autoComplete="off"
              spellCheck={false}
              aria-label={t('review.questions.answerLabel')}
              value={text}
              disabled={Boolean(result) || busy}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && canCheck && !result) void check(); }}
            />
          </>
        ) : null}

        {item.type === 'choice' ? (
          <>
            <p className="en-question-prompt" lang="en">{item.prompt}</p>
            <div className="en-options">
              {item.options.map((option, optionIndex) => {
                const state = result
                  ? option === result.expected ? 'is-correct' : optionIndex === choice ? 'is-wrong' : ''
                  : '';
                return (
                  <button
                    key={option}
                    type="button"
                    className={`en-option ${state}`.trim()}
                    aria-pressed={choice === optionIndex}
                    disabled={Boolean(result) || busy}
                    onClick={() => setChoice(optionIndex)}
                  >
                    <span className="en-option-key">{String.fromCharCode(65 + optionIndex)}</span>
                    <span lang="en">{option}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        {recording && !audioFailed ? (
          <>
            <p className="en-question-prompt">{t('review.questions.dictation')}</p>
            <audio key={item.id} ref={audio} src={recording.audio_url} preload="metadata" hidden
              onLoadedMetadata={(event) => {
                if (event.currentTarget.duration < recording.ends_at_seconds) setAudioFailed(true);
                else setAudioReady(true);
              }}
              onPlaying={() => setHeard(true)}
              onTimeUpdate={(event) => {
                if (event.currentTarget.currentTime >= recording.ends_at_seconds) event.currentTarget.pause();
              }}
              onError={() => setAudioFailed(true)} />
            <div className="en-actions">
              <button type="button" className="quiet" disabled={!audioReady} onClick={() => void play(1)}>▶ {t('review.questions.play')}</button>
              <button type="button" className="quiet" disabled={!audioReady} onClick={() => void play(0.75)}>{t('review.questions.playSlow')}</button>
            </div>
            <input
              type="text"
              lang="en"
              autoComplete="off"
              aria-label={t('review.questions.dictationLabel')}
              value={text}
              disabled={Boolean(result) || busy}
              onChange={(event) => setText(event.target.value)}
            />
          </>
        ) : null}
        {blockedAudio ? <p role="status">{t(recording ? 'listening.listen.noAudioElement' : 'intensive.audioSoon')}</p> : null}

        {result ? (
          <div className={result.correct ? 'en-notice' : 'error'} role="status">
            {result.correct
              ? result.retired ? t('review.questions.mastered') : t('review.questions.right')
              : t('review.questions.wrong', { answer: result.expected })}
            {result.explanation ? <p style={{ margin: '.4rem 0 0' }}>{result.explanation}</p> : null}
          </div>
        ) : null}
        {error ? <div className="error" role="alert">{errorText(error)}</div> : null}

        <div className="en-actions">
          {result || blockedAudio
            ? <button type="button" className="is-large" onClick={next}>{index + 1 >= items.length ? t('review.questions.finish') : t('review.questions.next')}</button>
            : <button type="button" className="is-large" disabled={!canSubmit || busy} onClick={() => void check()}>{busy ? t('common.loading') : t('review.questions.check')}</button>}
        </div>
      </div>
    </div>
  );
};
