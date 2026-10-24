import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { canRecognize, canSpeak, speak, stopSpeaking } from '../../lib/speech';
import { spokenDiff } from '../../lib/spokenMatch';
import { logShadowTake, type ShadowSource } from '../../lib/shadow/api';
import {
  alignEnvelopes,
  estimateModelEnvelope,
  estimateSpeechMs,
  findPauses,
  rhythmHints,
  speechBounds,
  speechMs,
  splitForShadowing,
} from '../../lib/shadow/envelope';
import { canRecordVoice, defaultCaptureMode, isPhone, useShadowRecorder, type CaptureMode } from '../../lib/shadow/useShadowRecorder';
import { Segmented } from '../../ui/kit';
import './shadow.css';

type Rate = '0.75' | '0.9' | '1';
const BINS = 64;

/** The model (estimated) and the learner's loudness, aligned to the same start and end. */
const Envelopes = ({ model, learner, pauseBins }: { model: number[]; learner: number[]; pauseBins: Set<number> }) => {
  const t = useT();
  const width = BINS * 4;
  const bars = (values: number[], pauses?: Set<number>) => values.map((value, index) => {
    const height = Math.max(1.5, value * 40);
    return (
      <rect
        key={index}
        x={index * 4 + 0.5}
        y={(44 - height) / 2}
        width={3}
        height={height}
        rx={1}
        className={pauses?.has(index) ? 'is-pause' : undefined}
      />
    );
  });
  return (
    <figure className="sh-wave">
      <div className="sh-wave-row">
        <span>{t('shadow.wave.model')}</span>
        <svg className="is-model" viewBox={`0 0 ${width} 44`} preserveAspectRatio="none" role="img" aria-label={t('shadow.wave.label')}>{bars(model)}</svg>
      </div>
      <div className="sh-wave-row">
        <span>{t('shadow.wave.you')}</span>
        <svg className="is-you" viewBox={`0 0 ${width} 44`} preserveAspectRatio="none" aria-hidden="true">{bars(learner, pauseBins)}</svg>
      </div>
      <figcaption>{t('shadow.wave.caption')}</figcaption>
    </figure>
  );
};

const playUrl = (url: string, holder: { current: HTMLAudioElement | null }) => new Promise<void>((resolve) => {
  const audio = new Audio(url);
  holder.current = audio;
  const done = () => resolve();
  audio.onended = done;
  audio.onerror = done;
  audio.onpause = done;
  audio.play().catch(done);
});

/**
 * Shadowing practice for one text: hear the model (browser voice, adjustable
 * speed), record yourself, play both one after another, see which words came
 * through, the two rhythms side by side and pace / pause hints. Long texts are
 * practised one piece at a time; `readAloud` keeps a paragraph whole.
 */
export const ShadowPanel = ({
  text,
  source,
  readAloud = false,
  onScored,
}: {
  text: string;
  source: ShadowSource;
  readAloud?: boolean;
  onScored?: (score: number | null) => void;
}) => {
  const t = useT();
  const pieces = useMemo(
    () => (readAloud ? [text.replace(/\s+/g, ' ').trim()].filter(Boolean) : splitForShadowing(text)),
    [text, readAloud],
  );
  const [index, setIndex] = useState(0);
  const piece = pieces[Math.min(index, pieces.length - 1)] ?? '';
  const [rate, setRate] = useState<Rate>(readAloud ? '1' : '0.9');
  const [modelMs, setModelMs] = useState<number | null>(null);
  const [playing, setPlaying] = useState<'model' | 'both' | 'mine' | null>(null);
  const [mode, setMode] = useState<CaptureMode>(defaultCaptureMode);
  const [logged, setLogged] = useState(false);
  const recorder = useShadowRecorder();
  const { take, phase } = recorder;
  const playRun = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const loggedPieces = useRef(new Set<string>());
  const voiceOk = canSpeak();
  const bothPossible = canRecognize() && canRecordVoice();

  const stopPlayback = () => {
    playRun.current += 1;
    stopSpeaking();
    audio.current?.pause();
    audio.current = null;
    setPlaying(null);
  };

  useEffect(() => () => {
    playRun.current += 1;
    stopSpeaking();
    audio.current?.pause();
  }, []);

  // A new piece or speed: the old take and timing no longer apply.
  useEffect(() => {
    stopPlayback();
    recorder.reset();
    setModelMs(null);
    setLogged(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece]);
  useEffect(() => { setModelMs(null); }, [rate]);

  const hearModel = async (run: number) => {
    const started = performance.now();
    await speak(piece, { rate: Number(rate) });
    const elapsed = performance.now() - started;
    // A voice that ended instantly (none installed) tells us nothing about timing.
    if (run === playRun.current && elapsed > 400) setModelMs(Math.round(elapsed));
  };

  const playModel = async () => {
    if (playing) { stopPlayback(); return; }
    const run = ++playRun.current;
    setPlaying('model');
    await hearModel(run);
    if (run === playRun.current) setPlaying(null);
  };

  const playMine = async () => {
    if (!take?.audioUrl) return;
    if (playing) { stopPlayback(); return; }
    const run = ++playRun.current;
    setPlaying('mine');
    await playUrl(take.audioUrl, audio);
    if (run === playRun.current) setPlaying(null);
  };

  const playBoth = async () => {
    if (!take?.audioUrl) return;
    if (playing) { stopPlayback(); return; }
    const run = ++playRun.current;
    setPlaying('both');
    await hearModel(run);
    if (run !== playRun.current) return;
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    if (run !== playRun.current) return;
    await playUrl(take.audioUrl, audio);
    if (run === playRun.current) setPlaying(null);
  };

  const record = () => {
    stopPlayback();
    void recorder.start(mode);
  };

  // What the take shows.
  const diff = take?.wordsChecked ? spokenDiff(piece, take.transcript) : null;
  const silentVoice = take?.envelope ? speechBounds(take.envelope) === null : false;
  const learnerMs = take?.envelope && !silentVoice ? speechMs(take.envelope) : null;
  const effectiveModelMs = modelMs ?? estimateSpeechMs(piece, Number(rate));
  const modelEnvelope = useMemo(() => estimateModelEnvelope(piece, effectiveModelMs), [piece, effectiveModelMs]);
  const pauses = take?.envelope && !silentVoice ? findPauses(take.envelope) : [];
  const hints = take ? rhythmHints({ modelMs: effectiveModelMs, learnerMs, pauses, text: piece }) : null;
  const aligned = take?.envelope && !silentVoice ? alignEnvelopes(modelEnvelope, take.envelope, BINS) : null;
  const pauseBins = useMemo(() => {
    const out = new Set<number>();
    if (!learnerMs) return out;
    for (const pause of pauses) {
      const from = Math.floor((pause.atMs / learnerMs) * BINS);
      const to = Math.ceil(((pause.atMs + pause.ms) / learnerMs) * BINS);
      for (let bin = Math.max(0, from); bin < Math.min(BINS, to); bin += 1) out.add(bin);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [take, learnerMs]);
  // Nothing to show: no words recognised and no voice in the recording (an undecodable recording still replays).
  const voiceHeard = take ? (take.envelope ? !silentVoice : Boolean(take.audioUrl)) : false;
  const heardNothing = Boolean(take) && (diff?.score ?? null) === null && !voiceHeard;

  // Each new take: report the score; the first real take of a piece is logged as practice.
  useEffect(() => {
    if (!take || heardNothing) return;
    const score = diff?.score ?? null;
    onScored?.(score);
    if (loggedPieces.current.has(piece)) return;
    loggedPieces.current.add(piece);
    const words = piece.split(/\s+/).filter(Boolean).length;
    const seconds = Math.max(1, Math.round((learnerMs ?? take.durationMs) / 1000));
    void logShadowTake({ score, words, seconds, source }).then((result) => {
      if (result?.logged) setLogged(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [take]);

  const scoreNote = diff?.score === null || diff?.score === undefined
    ? null
    : diff.score >= 85 ? t('shadow.score.great') : diff.score >= 60 ? t('shadow.score.good') : t('shadow.score.low');

  const problemText = recorder.problem === 'denied'
    ? t('shadow.problem.denied')
    : recorder.problem === 'no-mic'
      ? t('shadow.problem.noMic')
      : recorder.problem === 'unsupported'
        ? t('shadow.problem.unsupported')
        : recorder.problem === 'failed' ? t('shadow.problem.failed') : null;

  const canCapture = mode.voice || mode.words;

  return (
    <div className="sh-panel">
      {pieces.length > 1 ? (
        <div className="sh-pager">
          <span>{t('shadow.part', { current: index + 1, total: pieces.length })}</span>
          <button type="button" className="is-link" disabled={index === 0 || phase !== 'idle'} onClick={() => setIndex(index - 1)}>{t('shadow.prev')}</button>
          <button type="button" className="is-link" disabled={index >= pieces.length - 1 || phase !== 'idle'} onClick={() => setIndex(index + 1)}>{t('shadow.next')}</button>
        </div>
      ) : null}

      <p className={`sh-text en-diff ${piece.split(' ').length > 30 ? 'is-long' : ''}`.trim()} lang="en" aria-live="polite">
        {diff && diff.score !== null
          ? diff.words.map((entry, position) => <span key={position}>{entry.heard ? <ins>{entry.word}</ins> : <del>{entry.word}</del>} </span>)
          : piece}
      </p>

      <div className="sh-controls">
        {voiceOk ? (
          <Segmented<Rate>
            label={t('shadow.speed')}
            value={rate}
            onChange={(value) => { stopPlayback(); setRate(value); }}
            options={[{ value: '0.75', label: '0.75×' }, { value: '0.9', label: '0.9×' }, { value: '1', label: '1×' }]}
          />
        ) : null}
      </div>

      {isPhone() && bothPossible ? (
        <div className="en-stack" style={{ gap: '.35rem' }}>
          <Segmented<'words' | 'voice'>
            label={t('shadow.capture')}
            value={mode.words ? 'words' : 'voice'}
            onChange={(value) => setMode(value === 'words' ? { voice: false, words: true } : { voice: true, words: false })}
            options={[{ value: 'words', label: t('shadow.capture.words') }, { value: 'voice', label: t('shadow.capture.voice') }]}
          />
          <p className="hint" style={{ margin: 0 }}>{t('shadow.captureHint')}</p>
        </div>
      ) : null}

      <div className="en-actions">
        {voiceOk ? (
          <button type="button" className="quiet" disabled={phase !== 'idle'} aria-pressed={playing === 'model'} onClick={() => void playModel()}>
            {playing === 'model' ? `■ ${t('shadow.stopHearing')}` : `▶ ${t('shadow.hear')}`}
          </button>
        ) : null}
        {phase === 'recording' ? (
          <button type="button" onClick={() => void recorder.stop()}>■ {t('shadow.stop')}</button>
        ) : (
          <button type="button" disabled={phase === 'finishing' || !canCapture} onClick={record}>
            ● {phase === 'finishing' ? t('shadow.finishing') : take ? t('shadow.again') : t('shadow.record')}
          </button>
        )}
        {take?.audioUrl && voiceOk ? (
          <button type="button" className="quiet" disabled={phase !== 'idle'} aria-pressed={playing === 'both'} onClick={() => void playBoth()}>
            {playing === 'both' ? `■ ${t('shadow.stopHearing')}` : `⇄ ${t('shadow.playBoth')}`}
          </button>
        ) : null}
        {take?.audioUrl ? (
          <button type="button" className="quiet" disabled={phase !== 'idle'} aria-pressed={playing === 'mine'} onClick={() => void playMine()}>
            {playing === 'mine' ? `■ ${t('shadow.stopHearing')}` : `▶ ${t('shadow.playYours')}`}
          </button>
        ) : null}
      </div>

      {phase === 'recording' ? (
        <p className="sh-live" aria-live="polite">{recorder.live || t('shadow.recording')}</p>
      ) : null}

      {problemText ? <p className="error" role="alert" style={{ margin: 0 }}>{problemText}</p> : null}
      {!voiceOk ? <p className="hint" style={{ margin: 0 }}>{t('shadow.noVoice')}</p> : null}

      {take && phase === 'idle' ? (
        heardNothing ? (
          <p className="hint" role="status" style={{ margin: 0 }}>{t('shadow.nothingHeard')}</p>
        ) : (
          <div className="en-stack" style={{ gap: '.6rem' }} role="status">
            {diff && diff.score !== null ? (
              <>
                <p className="sh-score"><strong>{diff.score}%</strong> <span>{t('shadow.score', { score: diff.score })}</span></p>
                {scoreNote ? <p className={diff.score >= 85 ? 'en-notice' : 'hint'} style={{ margin: 0 }}>{scoreNote}</p> : null}
                {diff.extra.length ? (
                  <p className="sh-extra" lang="en">{t('shadow.extra')} {diff.extra.map((word, position) => <span key={position}><del>{word}</del> </span>)}</p>
                ) : null}
              </>
            ) : !take.wordsChecked ? (
              <p className="hint" style={{ margin: 0 }}>{t('shadow.noWordCheck')}</p>
            ) : null}

            {aligned ? (
              <div className="en-stack" style={{ gap: '.35rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem' }}>{t('shadow.wave.title')}</h3>
                <Envelopes model={aligned.model} learner={aligned.learner} pauseBins={pauseBins} />
              </div>
            ) : null}

            {hints && (hints.pace || aligned) ? (
              <ul className="sh-hints">
                {hints.pace && hints.ratio !== null ? <li>{t(`shadow.pace.${hints.pace}`, { ratio: hints.ratio.toFixed(1) })}</li> : null}
                {aligned ? <li>{hints.extraPauses > 0 ? t('shadow.pauses', { count: hints.extraPauses }) : t('shadow.noPauses')}</li> : null}
              </ul>
            ) : null}
            {logged ? <p className="hint" style={{ margin: 0 }}>✓ {t('shadow.logged')}</p> : null}
          </div>
        )
      ) : null}

      <p className="hint" style={{ margin: 0 }}>{t('shadow.privacy')}</p>
    </div>
  );
};
