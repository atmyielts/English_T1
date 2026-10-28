import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Pause, Play, RefreshCw, Sparkles, Square, XCircle } from 'lucide-react';
import {
  practiceMockGenerate,
  practiceMockGet,
  practiceMockList,
  practiceMockSubmit,
  type MockDetailResponse,
  type MockGeneratorQuestion,
  type MockHistoryItem,
} from '../lib/api';
import { useAccess } from '../lib/useAccess';
import { PracticeShell } from '../components/PracticeShell';
import { sectionLabel, useAppT, useErrorText, useFormat, type AppKey } from '../i18n';

type Section = 'reading' | 'listening';
type Answer = number | string | null;
type ActiveMock = {
  id: string;
  section: Section;
  targetBand: number | null;
  passage: { title: string; body: string };
  questions: MockGeneratorQuestion[];
  result: MockDetailResponse | null;
};

const STYLES = ['multiple_choice', 'true_false_not_given', 'matching_headings', 'gap_fill'] as const;
const styleKey = (style: string): AppKey =>
  (STYLES as readonly string[]).includes(style) ? `gen.style.${style}` as AppKey : 'gen.style.multiple_choice';

const speechAvailable = (): boolean =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

/** Reads a listening script aloud with the browser's own English voice. */
const ListeningPlayer = ({ text }: { text: string }) => {
  const t = useAppT();
  const [state, setState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [showScript, setShowScript] = useState(false);
  const supported = speechAvailable();

  useEffect(() => () => { if (speechAvailable()) window.speechSynthesis.cancel(); }, []);

  const play = () => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    if (state === 'paused') {
      synth.resume();
      setState('playing');
      return;
    }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/^Speaker [A-Z]:\s*/gm, ''));
    utterance.lang = 'en-GB';
    utterance.rate = 0.95;
    const voice = synth.getVoices().find((entry) => entry.lang.startsWith('en-GB')) ?? synth.getVoices().find((entry) => entry.lang.startsWith('en'));
    if (voice) utterance.voice = voice;
    utterance.onend = () => setState('idle');
    utterance.onerror = () => setState('idle');
    synth.speak(utterance);
    setState('playing');
  };

  return (
    <div className="listening-player">
      <p className="muted">{supported ? t('gen.listening.lead') : t('gen.listening.noVoice')}</p>
      {supported ? (
        <div className="recorder-row">
          {state === 'playing' ? (
            <button type="button" className="btn solid compact" onClick={() => { window.speechSynthesis.pause(); setState('paused'); }}>
              <Pause size={14} aria-hidden="true" /> {t('gen.listening.pause')}
            </button>
          ) : (
            <button type="button" className="btn solid compact" onClick={play}>
              <Play size={14} aria-hidden="true" /> {state === 'paused' ? t('gen.listening.resume') : t('gen.listening.play')}
            </button>
          )}
          <button type="button" className="btn ghost compact" onClick={() => { window.speechSynthesis.cancel(); setState('idle'); }} disabled={state === 'idle'}>
            <Square size={12} aria-hidden="true" /> {t('gen.listening.stop')}
          </button>
          <button type="button" className="btn ghost compact" onClick={() => setShowScript((value) => !value)} aria-expanded={showScript}>
            {showScript ? t('gen.listening.hideScript') : t('gen.listening.showScript')}
          </button>
        </div>
      ) : null}
      {!supported || showScript ? <article className="content-text">{text}</article> : null}
    </div>
  );
};

export const MockGeneratorPage = () => {
  const t = useAppT();
  const fmt = useFormat();
  const errorText = useErrorText();
  const { accessToken } = useAccess();
  const [sectionType, setSectionType] = useState<Section>('reading');
  const [targetBand, setTargetBand] = useState(7);
  const [topicHint, setTopicHint] = useState('');
  const [questionType, setQuestionType] = useState<string>('multiple_choice');
  const [mock, setMock] = useState<ActiveMock | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<MockHistoryItem[] | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const loadHistory = async () => {
    if (!accessToken) return;
    const res = await practiceMockList(accessToken).catch(() => null);
    setHistory(res?.items ?? []);
  };

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const generate = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setMock(null);
    setAnswers([]);
    try {
      const res = await practiceMockGenerate(accessToken, {
        section_type: sectionType,
        target_band: targetBand,
        topic_hint: topicHint.trim() || undefined,
        question_type: questionType,
      });
      if (!res.mock_id || !res.passage) {
        setError(t(`gen.msg.${res.message_code ?? 'generation_failed'}` as AppKey));
        return;
      }
      setMock({ id: res.mock_id, section: res.section_type, targetBand: res.target_band, passage: res.passage, questions: res.questions, result: null });
      setAnswers(res.questions.map(() => null));
      void loadHistory();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const openFromHistory = async (id: string) => {
    if (!accessToken) return;
    setError(null);
    try {
      const detail = await practiceMockGet(accessToken, id);
      if (!detail.passage) return;
      setMock({
        id: detail.mock_id,
        section: detail.section_type,
        targetBand: detail.target_band,
        passage: detail.passage,
        questions: detail.questions,
        result: detail.status === 'submitted' ? detail : null,
      });
      setAnswers(detail.status === 'submitted' ? detail.answers : detail.questions.map(() => null));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(errorText(err));
    }
  };

  const submit = async () => {
    if (!accessToken || !mock) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await practiceMockSubmit(accessToken, mock.id, answers);
      setMock({ ...mock, result });
      void loadHistory();
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  };

  const setAnswer = (index: number, value: Answer) =>
    setAnswers((prev) => prev.map((entry, i) => (i === index ? value : entry)));

  const submitted = mock?.result != null;

  return (
    <PracticeShell>
      <header className="practice-page-head">
        <div>
          <span className="eyebrow">{t('gen.eyebrow')}</span>
          <h1>{t('gen.title')}</h1>
          <p>{t('gen.lead')}</p>
        </div>
      </header>

      <section className="glass dash-card" style={{ marginBottom: 18 }}>
        <div className="practice-form-grid">
          <div>
            <p className="field-label">{t('gen.section')}</p>
            <div className="segmented">
              {(['reading', 'listening'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`btn compact ${sectionType === s ? 'solid' : 'ghost'}`}
                  onClick={() => setSectionType(s)}
                  aria-pressed={sectionType === s}
                >
                  {sectionLabel(t, s)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="gen-band">{t('gen.targetBand')}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input id="gen-band" type="range" min={5} max={9} step={0.5} value={targetBand} onChange={(e) => setTargetBand(Number(e.target.value))} style={{ flex: 1, minWidth: 0 }} />
              <strong style={{ fontFamily: 'Fraunces, serif', fontSize: 22 }}>{fmt.band(targetBand)}</strong>
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="gen-style">{t('gen.style')}</label>
            <select id="gen-style" className="practice-select" value={questionType} onChange={(e) => setQuestionType(e.target.value)}>
              {STYLES.map((style) => <option key={style} value={style}>{t(styleKey(style))}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="gen-topic">{t('gen.topic')}</label>
          <input id="gen-topic" type="text" className="practice-input" value={topicHint} onChange={(e) => setTopicHint(e.target.value)} placeholder={t('gen.topicPlaceholder')} maxLength={200} />
        </div>
        <button type="button" className="btn solid" onClick={() => void generate()} disabled={busy || !accessToken}>
          {busy ? t('gen.generating') : t('gen.generate')} <Sparkles size={14} style={{ marginLeft: 6 }} aria-hidden="true" />
        </button>
        {error ? <p className="error-text" role="alert">{error}</p> : null}
      </section>

      {mock ? (
        <section className="glass dash-card" style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <p className="eyebrow">
                {sectionLabel(t, mock.section)}
                {mock.targetBand != null ? ` · ${t('gen.passageFor', { band: fmt.band(mock.targetBand) })}` : ''}
              </p>
              <h2 style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}>{mock.section === 'listening' ? t('gen.listening.title') : mock.passage.title}</h2>
            </div>
            <button type="button" className="btn ghost compact" onClick={() => void generate()} disabled={busy}>
              <RefreshCw size={12} style={{ marginRight: 4 }} aria-hidden="true" /> {t('gen.regenerate')}
            </button>
          </div>
          {mock.section === 'listening'
            ? <ListeningPlayer key={mock.id} text={mock.passage.body} />
            : <article className="content-text">{mock.passage.body}</article>}
        </section>
      ) : null}

      {mock && mock.questions.length > 0 ? (
        <section className="glass dash-card">
          <h2 style={{ margin: 0 }}>{t('gen.questions')}</h2>
          <ol className="question-list">
            {mock.questions.map((q, i) => {
              const row = mock.result?.results.find((entry) => entry.index === i) ?? null;
              return (
                <li key={i} className={`question-card${row ? (row.correct ? ' correct' : ' wrong') : ''}`}>
                  <p style={{ margin: '0 0 10px', fontWeight: 600 }}>
                    {i + 1}. {q.prompt}{' '}
                    {row ? (row.correct
                      ? <CheckCircle2 size={14} style={{ verticalAlign: -2, color: '#166534' }} aria-label={t('gen.correct')} />
                      : <XCircle size={14} style={{ verticalAlign: -2, color: '#9b2c2c' }} aria-label={t('gen.wrong')} />) : null}
                  </p>
                  {q.options.length > 0 ? (
                    <div role="radiogroup" aria-label={`${i + 1}`}>
                      {q.options.map((opt, j) => (
                        <label key={j} className="option-row">
                          <input
                            type="radio"
                            name={`q-${mock.id}-${i}`}
                            checked={answers[i] === j}
                            disabled={submitted}
                            onChange={() => setAnswer(i, j)}
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <input
                      type="text"
                      className="practice-input"
                      value={typeof answers[i] === 'string' ? String(answers[i]) : ''}
                      disabled={submitted}
                      onChange={(e) => setAnswer(i, e.target.value)}
                      placeholder={t('gen.answerPlaceholder')}
                      aria-label={`${i + 1}. ${t('gen.answerPlaceholder')}`}
                      style={{ maxWidth: 320 }}
                    />
                  )}
                  {row ? (
                    <div className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
                      {!row.correct ? <p style={{ margin: 0 }}>{t('gen.yourAnswer', { answer: row.given ?? t('gen.noAnswer') })}</p> : null}
                      <p style={{ margin: 0 }}><strong>{t('gen.correctAnswer', { answer: row.correct_answer })}</strong></p>
                      {row.explanation ? <p style={{ margin: '4px 0 0' }}>{row.explanation}</p> : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <div ref={resultRef} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            {!submitted ? (
              <button type="button" className="btn solid" onClick={() => void submit()} disabled={submitting}>
                {submitting ? t('gen.submitting') : t('gen.submit')}
              </button>
            ) : (
              <>
                <strong style={{ fontFamily: 'Fraunces, serif', fontSize: 20 }} data-testid="mock-score">
                  {t('gen.score', { raw: mock.result?.raw_score ?? 0, max: mock.result?.max_score ?? mock.questions.length })}
                </strong>
                {(mock.result?.review_items_queued ?? 0) > 0 ? (
                  <span className="muted">
                    {t('gen.savedMissed', { count: mock.result?.review_items_queued ?? 0 })}{' '}
                    <Link to="/practice/reviews">{t('gen.openReviews')}</Link>
                  </span>
                ) : null}
              </>
            )}
          </div>
        </section>
      ) : null}

      <section className="glass dash-card" style={{ marginTop: 18 }}>
        <h2 style={{ margin: 0 }}>{t('gen.history.title')}</h2>
        {history == null ? <p className="muted">{t('gen.history.loading')}</p> : history.length === 0 ? (
          <p className="muted">{t('gen.history.empty')}</p>
        ) : (
          <ul className="history-list">
            {history.map((row) => (
              <li key={row.id} className="history-row">
                <span style={{ minWidth: 0 }}>
                  <strong>{row.title || t(styleKey(row.question_style))}</strong>
                  <span className="muted"> · {sectionLabel(t, row.section_type)} · {t(styleKey(row.question_style))} · {fmt.date(row.created_at)}</span>
                </span>
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <span className="muted">
                    {row.status === 'submitted' && row.raw_score != null && row.max_score != null
                      ? t('gen.history.scored', { raw: row.raw_score, max: row.max_score })
                      : t('gen.history.notSubmitted')}
                  </span>
                  <button type="button" className="btn ghost compact" onClick={() => void openFromHistory(row.id)}>{t('gen.history.open')}</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PracticeShell>
  );
};
