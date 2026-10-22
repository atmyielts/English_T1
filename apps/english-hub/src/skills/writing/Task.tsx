import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useT } from '../../i18n';
import { useElapsedSeconds, useResource } from '../../lib/useResource';
import { Panel, ProgressBar, useErrorMessage } from '../../ui/kit';
import { ActivityFrame, ResultPanel } from '../ActivityKit';
import {
  countWords,
  getWritingTask,
  submitWriting,
  usedWords,
  type WritingCorrection,
  type WritingFeedback,
  type WritingPrompt,
  type WritingSubmitResponse,
} from './api';

const storageKey = (slug: string) => `schood.english.writing.draft.${slug}`;

const readDraft = (slug: string): string => {
  try {
    return window.localStorage.getItem(storageKey(slug)) ?? '';
  } catch {
    return '';
  }
};

const writeDraft = (slug: string, text: string): boolean => {
  try {
    if (text.trim()) window.localStorage.setItem(storageKey(slug), text);
    else window.localStorage.removeItem(storageKey(slug));
    return true;
  } catch {
    return false;
  }
};

/** The learner's text with the corrected parts highlighted. */
const highlight = (text: string, corrections: WritingCorrection[]): ReactNode[] => {
  const spans: Array<{ start: number; end: number }> = [];
  for (const correction of corrections) {
    const start = text.indexOf(correction.original);
    if (start < 0) continue;
    const end = start + correction.original.length;
    if (spans.some((span) => start < span.end && span.start < end)) continue;
    spans.push({ start, end });
  }
  spans.sort((a, b) => a.start - b.start);
  const out: ReactNode[] = [];
  let cursor = 0;
  spans.forEach((span, index) => {
    if (span.start > cursor) out.push(text.slice(cursor, span.start));
    out.push(<mark key={index}>{text.slice(span.start, span.end)}</mark>);
    cursor = span.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
};

const Brief = ({ prompt, text }: { prompt: WritingPrompt; text: string }) => {
  const t = useT();
  const used = new Set(usedWords(text, prompt.target_vocabulary));
  return (
    <Panel title={t('writing.brief.title')}>
      <div className="wr-brief">
        <p className="en-passage" lang="en" style={{ margin: 0 }}>{prompt.prompt_text}</p>
        <dl>
          {prompt.audience ? <><dt>{t('writing.brief.audience')}</dt><dd lang="en">{prompt.audience}</dd></> : null}
          {prompt.genre ? <><dt>{t('writing.brief.type')}</dt><dd lang="en">{prompt.genre}</dd></> : null}
          <dt>{t('writing.brief.length')}</dt>
          <dd>{t('writing.brief.lengthValue', { min: prompt.expected_length_min, max: prompt.expected_length_max })}</dd>
          {prompt.target_structure ? <><dt>{t('writing.brief.structure')}</dt><dd lang="en">{prompt.target_structure}</dd></> : null}
          {prompt.target_grammar ? <><dt>{t('writing.brief.grammar')}</dt><dd lang="en">{prompt.target_grammar}</dd></> : null}
        </dl>
        {prompt.checklist.length ? (
          <div>
            <h3>{t('writing.brief.include')}</h3>
            <ul className="wr-checklist" lang="en">
              {prompt.checklist.map((point) => (
                <li key={point}><span className="wr-mark" aria-hidden="true">•</span><span>{point}</span></li>
              ))}
            </ul>
          </div>
        ) : null}
        {prompt.target_vocabulary.length ? (
          <div>
            <h3>{t('writing.brief.words')}</h3>
            <div className="wr-words" lang="en">
              {prompt.target_vocabulary.map((word) => (
                <span key={word} className={`en-tag ${used.has(word) ? 'is-used' : ''}`.trim()}>{used.has(word) ? `✓ ${word}` : word}</span>
              ))}
            </div>
            <p className="hint" style={{ margin: '.4rem 0 0' }}>
              {t('writing.editor.usedWords', { done: used.size, total: prompt.target_vocabulary.length })}
            </p>
          </div>
        ) : null}
      </div>
    </Panel>
  );
};

const CorrectionList = ({ corrections }: { corrections: WritingCorrection[] }) => {
  const t = useT();
  return (
    <ul className="wr-corrections">
      {corrections.map((correction, index) => (
        <li key={`${correction.original}-${index}`}>
          <span className="en-diff" lang="en">
            <del>{correction.original}</del>
            <span className="wr-arrow" aria-hidden="true">→</span>
            <ins>{correction.corrected}</ins>
          </span>
          <small><strong>{t(`writing.category.${correction.category}`)}:</strong> {correction.explanation}</small>
        </li>
      ))}
    </ul>
  );
};

const FeedbackDetail = ({ feedback, text }: { feedback: WritingFeedback; text: string }) => {
  const t = useT();
  return (
    <>
      {feedback.source === 'basic' ? <p className="en-explain">{t('writing.result.basic')}</p> : null}

      <div className="wr-section">
        <h3>{t('writing.criteria.title')}</h3>
        <div className="wr-criteria">
          {feedback.criteria.map((criterion) => (
            <div key={criterion.key} className="wr-criterion">
              <div className="wr-criterion-head">
                <strong>{t(`writing.criteria.${criterion.key}`)}</strong>
                <span>{t('writing.criteria.score', { score: criterion.score })}</span>
              </div>
              <ProgressBar value={criterion.score} label={t(`writing.criteria.${criterion.key}`)} skill="writing" />
              {criterion.comment ? <p>{criterion.comment}</p> : null}
            </div>
          ))}
        </div>
      </div>

      {feedback.checklist.length ? (
        <div className="wr-section">
          <h3>{t('writing.checklist.title')}</h3>
          <ul className="wr-checklist">
            {feedback.checklist.map((item) => {
              const state = item.covered === true ? 'yes' : item.covered === false ? 'no' : 'unknown';
              const label = state === 'yes' ? t('writing.checklist.done') : state === 'no' ? t('writing.checklist.missing') : t('writing.checklist.unknown');
              return (
                <li key={item.point}>
                  <span className={`wr-mark is-${state}`} aria-hidden="true">{state === 'yes' ? '✓' : state === 'no' ? '!' : '?'}</span>
                  <span><span lang="en">{item.point}</span><small>{label}</small></span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {feedback.next_step ? (
        <div className="wr-section">
          <h3>{t('writing.next.title')}</h3>
          <p className="en-notice" style={{ margin: 0 }}>{feedback.next_step}</p>
        </div>
      ) : null}

      <div className="wr-section">
        <h3>{t('writing.corrections.title')}</h3>
        {feedback.corrections.length ? (
          <>
            <p className="hint" style={{ margin: 0 }}>{t('writing.corrections.lead')}</p>
            <CorrectionList corrections={feedback.corrections} />
          </>
        ) : <p style={{ margin: 0 }}>{t('writing.corrections.none')}</p>}
      </div>

      {feedback.model_sentences.length ? (
        <div className="wr-section">
          <h3>{t('writing.model.title')}</h3>
          <ul className="en-list">
            {feedback.model_sentences.map((model, index) => (
              <li key={index} className="en-explain" lang="en">
                <span className="hint">{t('writing.model.yours')}</span> {model.original}
                <br />
                <span className="hint">{t('writing.model.better')}</span> <strong>{model.improved}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="wr-section">
        <h3>{t('writing.text.title')}</h3>
        {feedback.corrections.length ? <p className="hint" style={{ margin: 0 }}>{t('writing.text.lead')}</p> : null}
        <p className="en-passage wr-text" lang="en" style={{ margin: 0 }}>{highlight(text, feedback.corrections)}</p>
      </div>
    </>
  );
};

export const WritingTask = () => {
  const t = useT();
  const errorText = useErrorMessage();
  const { slug = '' } = useParams();
  const task = useResource((signal) => getWritingTask(slug, signal), [slug]);
  const elapsed = useElapsedSeconds();
  const lastSubmitAt = useRef(0);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const loadedFor = useRef<string | null>(null);

  const [text, setText] = useState('');
  const [restored, setRestored] = useState(false);
  const [saved, setSaved] = useState(false);
  const [result, setResult] = useState<WritingSubmitResponse | null>(null);
  const [submittedText, setSubmittedText] = useState('');
  const [previous, setPrevious] = useState<{ score: number; feedback: WritingFeedback } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const prompt = task.data?.prompt;

  // Start from the draft saved on this device, else the last text sent to the server.
  useEffect(() => {
    if (!task.data || loadedFor.current === slug) return;
    loadedFor.current = slug;
    const local = readDraft(slug);
    const initial = local || task.data.draft?.text || '';
    setText(initial);
    setRestored(Boolean(initial.trim()));
  }, [task.data, slug]);

  // Autosave while typing.
  useEffect(() => {
    if (loadedFor.current !== slug) return;
    const timer = window.setTimeout(() => setSaved(writeDraft(slug, text) && Boolean(text.trim())), 600);
    return () => window.clearTimeout(timer);
  }, [text, slug]);

  const words = useMemo(() => countWords(text), [text]);
  const min = prompt?.expected_length_min ?? 0;
  const max = prompt?.expected_length_max ?? 0;
  const minToSubmit = prompt?.min_words_to_submit ?? 5;
  const lengthState = words < min ? 'short' : words > max ? 'long' : 'ok';

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      const now = elapsed();
      const response = await submitWriting(slug, text, Math.max(1, now - lastSubmitAt.current));
      lastSubmitAt.current = now;
      setSubmittedText(text);
      setResult(response);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const revise = () => {
    if (result) setPrevious({ score: result.score, feedback: result.feedback });
    setResult(null);
    window.setTimeout(() => {
      editorRef.current?.focus();
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const comparison = (() => {
    if (!result) return null;
    if (previous) {
      const diff = result.score - previous.score;
      return (
        <>
          <p style={{ margin: 0 }}>{t('writing.result.compare', { before: previous.score, now: result.score })}</p>
          <p className={diff > 0 ? 'en-notice' : 'hint'} style={{ margin: 0 }}>
            {diff > 0 ? t('writing.result.better', { count: diff }) : diff === 0 ? t('writing.result.same') : t('writing.result.lower')}
          </p>
        </>
      );
    }
    if (result.previous_best !== null) return <p className="hint" style={{ margin: 0 }}>{t('writing.result.best', { score: result.previous_best })}</p>;
    return null;
  })();

  return (
    <ActivityFrame
      skill="writing"
      title={prompt?.title}
      level={prompt?.level}
      minutes={prompt?.minutes ?? null}
      loading={task.loading && !task.data}
      error={task.error}
      onRetry={task.reload}
    >
      {result ? (
        <ResultPanel
          skill="writing"
          slug={slug}
          score={result.score}
          summary={result.feedback.source === 'ai'
            ? t('writing.result.summaryAi', { count: result.feedback.word_count })
            : t('writing.result.summaryBasic', { count: result.feedback.word_count })}
          good={result.feedback.strengths}
          fix={result.feedback.improvements}
        >
          {comparison ? <div className="en-stack" style={{ gap: '.4rem' }}>{comparison}</div> : null}
          <FeedbackDetail feedback={result.feedback} text={submittedText} />
          <div className="en-actions">
            <button type="button" className="is-large" onClick={revise}>{t('writing.revise')}</button>
            <span className="hint">{t('writing.revise.hint')}</span>
          </div>
        </ResultPanel>
      ) : null}

      {prompt && !result ? <Brief prompt={prompt} text={text} /> : null}

      {prompt && !result ? (
        <Panel title={t('writing.editor.title')}>
          {previous ? (
            <div className="en-stack" style={{ gap: '.5rem' }}>
              <p className="en-notice" style={{ margin: 0 }}>{t('writing.editor.revising', { score: previous.score })}</p>
              {previous.feedback.corrections.length ? (
                <details>
                  <summary>{t('writing.editor.lastFeedback')}</summary>
                  <CorrectionList corrections={previous.feedback.corrections} />
                </details>
              ) : null}
            </div>
          ) : restored ? <p className="hint" style={{ margin: 0 }}>{t('writing.editor.restored')}</p> : null}
          <label htmlFor="writing-editor" className="visually-hidden">{t('writing.editor.label')}</label>
          <textarea
            id="writing-editor"
            ref={editorRef}
            className="en-writing"
            lang="en"
            spellCheck={false}
            autoCapitalize="sentences"
            placeholder={t('writing.editor.placeholder')}
            value={text}
            disabled={busy}
            onChange={(event) => {
              setText(event.target.value);
              setSaved(false);
            }}
            aria-describedby="writing-meter"
          />
          <div className="en-meter" id="writing-meter" aria-live="polite">
            <span><strong>{t('writing.editor.count', { count: words })}</strong></span>
            <span>{t('writing.editor.target', { min, max })}</span>
            <span className={`wr-meter-state is-${lengthState}`}>
              {lengthState === 'short' ? t('writing.editor.short') : lengthState === 'long' ? t('writing.editor.long') : t('writing.editor.inRange')}
            </span>
            {saved ? <span>{t('writing.editor.saved')}</span> : null}
          </div>
          {error ? <div className="error" role="alert">{errorText(error)}</div> : null}
          <div className="en-actions">
            <button type="button" className="is-large" disabled={busy || words < minToSubmit} onClick={() => void check()}>
              {busy ? t('writing.editor.checking') : t('writing.editor.check')}
            </button>
            {busy ? <span className="hint">{t('writing.editor.checkingHint')}</span> : null}
            {!busy && words < minToSubmit ? <span className="hint">{t('writing.editor.minimum', { count: minToSubmit })}</span> : null}
          </div>
        </Panel>
      ) : null}
    </ActivityFrame>
  );
};
