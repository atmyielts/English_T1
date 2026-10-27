import { useEffect, useRef, useState } from 'react';
import { Mic, RefreshCw, Square } from 'lucide-react';
import {
  getCoachLang,
  practiceSpeakingAttempts,
  practiceSpeakingPrompts,
  practiceSpeakingSubmit,
  type SpeakingAttempt,
  type SpeakingFeedback,
  type SpeakingPart,
  type SpeakingPrompt,
} from '../lib/api';
import { useAccess } from '../lib/useAccess';
import { PracticeShell } from '../components/PracticeShell';
import { useAppT, useErrorText, useFormat, type AppKey } from '../i18n';

const PARTS: SpeakingPart[] = ['part1', 'part2', 'part3'];
const MIN_WORDS = 12;
const MAX_RECORDING_SECONDS: Record<SpeakingPart, number> = { part1: 300, part2: 120, part3: 300 };

const countWords = (text: string): number => (text.trim().match(/[A-Za-zÀ-ɏ0-9']+/g) ?? []).length;

// Minimal typing for the (still prefixed in Chromium) Web Speech recognition API.
type RecognitionResultList = ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: RecognitionResultList }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const recognitionConstructor = (): (new () => Recognition) | null => {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
};

const recordingSupported = (): boolean =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

const FeedbackView = ({ attempt }: { attempt: SpeakingAttempt }) => {
  const t = useAppT();
  const feedback: SpeakingFeedback | null = attempt.feedback;
  if (!feedback) return null;
  return (
    <div className="speaking-feedback" data-testid="speaking-feedback">
      <p className="muted">
        {t('speak.fb.stats', { words: attempt.word_count, seconds: attempt.duration_seconds ?? 0 })}
        {attempt.words_per_minute != null ? ` · ${t('speak.fb.wpm', { wpm: attempt.words_per_minute })}` : ''}
      </p>
      <div className="feedback-grid">
        <article><h4>{t('speak.fb.fc')}</h4><p>{feedback.fluency_and_coherence}</p></article>
        <article><h4>{t('speak.fb.lr')}</h4><p>{feedback.lexical_resource}</p></article>
        <article><h4>{t('speak.fb.gr')}</h4><p>{feedback.grammatical_range}</p></article>
      </div>
      <div className="feedback-grid">
        {feedback.strengths.length > 0 ? (
          <article><h4>{t('speak.fb.strengths')}</h4><ul>{feedback.strengths.map((entry) => <li key={entry}>{entry}</li>)}</ul></article>
        ) : null}
        {feedback.improvements.length > 0 ? (
          <article><h4>{t('speak.fb.improvements')}</h4><ul>{feedback.improvements.map((entry) => <li key={entry}>{entry}</li>)}</ul></article>
        ) : null}
        {feedback.upgrades.length > 0 ? (
          <article>
            <h4>{t('speak.fb.upgrades')}</h4>
            <ul>
              {feedback.upgrades.map((entry) => (
                <li key={entry.original}>
                  <s>{entry.original}</s> → <strong>{entry.better}</strong>{entry.why ? <span className="muted"> · {entry.why}</span> : null}
                </li>
              ))}
            </ul>
          </article>
        ) : null}
        {feedback.part2_coverage.length > 0 ? (
          <article><h4>{t('speak.fb.coverage')}</h4><ul>{feedback.part2_coverage.map((entry) => <li key={entry}>{entry}</li>)}</ul></article>
        ) : null}
      </div>
    </div>
  );
};

export const SpeakingPage = () => {
  const t = useAppT();
  const fmt = useFormat();
  const errorText = useErrorText();
  const { accessToken } = useAccess();
  const [part, setPart] = useState<SpeakingPart>('part1');
  const [prompts, setPrompts] = useState<SpeakingPrompt[] | null>(null);
  const [promptIndex, setPromptIndex] = useState(0);
  const [prepLeft, setPrepLeft] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [source, setSource] = useState<SpeakingAttempt['transcript_source']>('typed');
  const [micError, setMicError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [latest, setLatest] = useState<SpeakingAttempt | null>(null);
  const [history, setHistory] = useState<SpeakingAttempt[] | null>(null);
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const timerRef = useRef<number | null>(null);
  const finalTextRef = useRef('');
  const canRecognise = recognitionConstructor() != null;

  const prompt = prompts?.[promptIndex % Math.max(prompts.length, 1)] ?? null;
  const maxSeconds = MAX_RECORDING_SECONDS[part];
  const words = countWords(transcript);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    setPrompts(null);
    setPromptIndex(0);
    practiceSpeakingPrompts(accessToken, part)
      .then((res) => { if (active) setPrompts(res.prompts); })
      .catch((cause) => { if (active) { setPrompts([]); setError(errorText(cause)); } });
    return () => { active = false; };
  }, [accessToken, part, errorText]);

  const loadHistory = async () => {
    if (!accessToken) return;
    const res = await practiceSpeakingAttempts(accessToken).catch(() => null);
    setHistory(res?.items ?? []);
  };

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const stopTimers = () => {
    if (timerRef.current != null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stopRecording = () => {
    stopTimers();
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecording(false);
  };

  useEffect(() => () => {
    stopRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (recording && elapsed >= maxSeconds) stopRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, recording, maxSeconds]);

  useEffect(() => {
    if (prepLeft == null || prepLeft <= 0) return;
    const id = window.setTimeout(() => setPrepLeft((value) => (value == null ? null : value - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [prepLeft]);

  const resetAnswer = () => {
    stopRecording();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setTranscript('');
    setSource('typed');
    setElapsed(0);
    setLatest(null);
    setNotice(null);
    setPrepLeft(null);
    finalTextRef.current = '';
  };

  const startRecording = async () => {
    setMicError(null);
    setError(null);
    if (!recordingSupported()) {
      setMicError(t('speak.record.unsupported'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        setAudioUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return URL.createObjectURL(blob);
        });
      };
      recorderRef.current = recorder;
      recorder.start();
      setPrepLeft(null);
      setElapsed(0);
      setRecording(true);
      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250);

      const Ctor = recognitionConstructor();
      if (Ctor) {
        finalTextRef.current = transcript ? `${transcript.trim()} ` : '';
        const recognition = new Ctor();
        recognition.lang = 'en-GB';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const result = event.results[i];
            if (!result) continue;
            const text = result[0]?.transcript ?? '';
            if (result.isFinal) finalTextRef.current += `${text.trim()} `;
            else interim += text;
          }
          setTranscript(`${finalTextRef.current}${interim}`.trimStart());
          setSource('speech_recognition');
        };
        recognition.onerror = () => undefined;
        recognition.onend = () => { recognitionRef.current = null; };
        recognitionRef.current = recognition;
        try { recognition.start(); } catch { recognitionRef.current = null; }
      }
    } catch {
      setMicError(t('speak.record.micDenied'));
      stopRecording();
    }
  };

  const submit = async () => {
    if (!accessToken || !prompt) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await practiceSpeakingSubmit(accessToken, {
        prompt_id: prompt.id,
        transcript,
        transcript_source: source,
        duration_seconds: elapsed > 0 ? elapsed : null,
        lang: getCoachLang(),
      });
      setLatest(res.attempt);
      if (res.message_code) setNotice(t(`speak.msg.${res.message_code}` as AppKey));
      void loadHistory();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSubmitting(false);
    }
  };

  const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <PracticeShell>
      <header className="practice-page-head">
        <div>
          <span className="eyebrow">{t('speak.eyebrow')}</span>
          <h1>{t('speak.title')}</h1>
          <p>{t('speak.lead')}</p>
          <p className="muted">{t('speak.honest')}</p>
        </div>
      </header>

      <nav className="segmented" aria-label={t('speak.eyebrow')} style={{ marginBottom: 14 }}>
        {PARTS.map((value) => (
          <button
            key={value}
            type="button"
            className={`btn compact ${part === value ? 'solid' : 'ghost'}`}
            aria-pressed={part === value}
            onClick={() => { resetAnswer(); setPart(value); }}
          >
            {t(`speak.${value}` as AppKey)}
          </button>
        ))}
      </nav>

      {error ? <div className="glass dashboard-alert error" role="alert">{error}</div> : null}

      <section className="glass dash-card" aria-live="polite">
        <p className="muted">{t(`speak.${part}.lead` as AppKey)}</p>
        {prompts == null ? <p className="muted">{t('speak.loadingPrompts')}</p> : prompt ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <h2 style={{ margin: 0, overflowWrap: 'anywhere' }} data-testid="speaking-topic">{prompt.topic}</h2>
              <button type="button" className="btn ghost compact" onClick={() => { resetAnswer(); setPromptIndex((value) => value + 1); }}>
                <RefreshCw size={12} aria-hidden="true" /> {t('speak.another')}
              </button>
            </div>
            {prompt.part === 'part2' ? (
              <div className="content-text">
                <p style={{ margin: 0 }}><strong>{prompt.questions[0]}</strong></p>
                <p style={{ margin: '6px 0 0' }}>{t('speak.cueCard')}</p>
                <ul style={{ margin: '4px 0 0' }}>{prompt.cue_points.map((point) => <li key={point}>{point}</li>)}</ul>
              </div>
            ) : (
              <ol className="content-text" style={{ margin: 0 }}>
                {prompt.questions.map((question) => <li key={question}>{question}</li>)}
              </ol>
            )}

            {prompt.part === 'part2' && !recording && !audioUrl ? (
              prepLeft == null ? (
                <button type="button" className="btn ghost compact" onClick={() => setPrepLeft(prompt.prep_seconds)}>{t('speak.prep.start')}</button>
              ) : (
                <div>
                  <p className="recorder-timer" role="timer">{t('speak.prep.left', { seconds: Math.max(0, prepLeft) })}</p>
                  <label className="field-label" htmlFor="prep-notes">{t('speak.prep.notes')}</label>
                  <textarea id="prep-notes" className="practice-textarea" style={{ minHeight: 80 }} />
                </div>
              )
            ) : null}

            <div className="recorder-row">
              {recording ? (
                <button type="button" className="btn solid" onClick={stopRecording}>
                  <Square size={14} aria-hidden="true" /> {t('speak.record.stop')}
                </button>
              ) : (
                <button type="button" className="btn solid" onClick={() => void startRecording()}>
                  <Mic size={14} aria-hidden="true" /> {audioUrl ? t('speak.record.again') : t('speak.record.start')}
                </button>
              )}
              <span className="recorder-timer" aria-label={t('speak.record.timer')}>{formatClock(elapsed)}</span>
              <span className="muted">{t('speak.record.limit', { seconds: maxSeconds })}</span>
            </div>
            {micError ? <p className="error-text" role="alert">{micError}</p> : null}
            {audioUrl && !recording ? (
              <div>
                <p className="field-label">{t('speak.record.playback')}</p>
                <audio controls src={audioUrl} className="practice-audio" />
              </div>
            ) : null}

            <div>
              <label className="field-label" htmlFor="speaking-transcript">{t('speak.transcript.label')}</label>
              <textarea
                id="speaking-transcript"
                className="practice-textarea"
                value={transcript}
                onChange={(event) => {
                  setTranscript(event.target.value);
                  setSource((current) => (current === 'speech_recognition' ? 'mixed' : current === 'mixed' ? 'mixed' : 'typed'));
                }}
              />
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                {canRecognise ? t('speak.transcript.liveHint') : t('speak.transcript.typeHint')} · {t('speak.transcript.words', { count: words })}
              </p>
              {words > 0 && words < MIN_WORDS ? <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t('speak.transcript.tooShort')}</p> : null}
            </div>
            <button type="button" className="btn solid" onClick={() => void submit()} disabled={submitting || recording || words < MIN_WORDS}>
              {submitting ? t('speak.submitting') : t('speak.submit')}
            </button>
            {notice ? <p className="muted" role="status">{notice}</p> : null}
          </>
        ) : null}
      </section>

      {latest?.feedback ? (
        <section className="glass dash-card" style={{ marginTop: 18 }}>
          <h2 style={{ margin: 0 }}>{t('speak.fb.title')}</h2>
          <FeedbackView attempt={latest} />
        </section>
      ) : null}

      <section className="glass dash-card" style={{ marginTop: 18 }}>
        <h2 style={{ margin: 0 }}>{t('speak.history.title')}</h2>
        {history == null ? <p className="muted">{t('common.loading')}</p> : history.length === 0 ? (
          <p className="muted">{t('speak.history.empty')}</p>
        ) : (
          <ul className="history-list">
            {history.map((row) => (
              <li key={row.id} className="history-row" style={{ display: 'grid' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span><strong>{row.topic}</strong> <span className="muted">· {t(`speak.${row.part}` as AppKey)}{row.created_at ? ` · ${fmt.date(row.created_at)}` : ''}</span></span>
                  {row.feedback ? (
                    <button type="button" className="btn ghost compact" onClick={() => setOpenHistoryId((id) => (id === row.id ? null : row.id))} aria-expanded={openHistoryId === row.id}>
                      {openHistoryId === row.id ? t('speak.history.hide') : t('speak.history.show')}
                    </button>
                  ) : <span className="muted">{t('speak.history.noFeedback')}</span>}
                </div>
                {openHistoryId === row.id ? <FeedbackView attempt={row} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PracticeShell>
  );
};
