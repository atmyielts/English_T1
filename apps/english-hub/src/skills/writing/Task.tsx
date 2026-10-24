import { useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useT } from '../../i18n';
import { useElapsedSeconds, useResource } from '../../lib/useResource';
import { Panel, useErrorMessage } from '../../ui/kit';
import { YourWordsHint, YourWordsResult } from '../YourWords';
import { ActivityFrame, ResultPanel } from '../ActivityKit';
import {
  countWords,
  getWritingTask,
  submitWriting,
  usedWords,
  type PreviousRevision,
  type WritingFeedback,
  type WritingPrompt,
  type WritingSubmitResponse,
} from './api';
import { CorrectionList, FeedbackDetail } from './Feedback';
import { ModelAnswer, RevisionCompare, RevisionStrip, RubricHistory } from './Depth';
import { useDraftSync, type DraftSaveState } from './useDraftSync';

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

const SaveState = ({ state }: { state: DraftSaveState }) => {
  const t = useT();
  if (state === 'idle') return null;
  const label = state === 'account' ? t('depth.draft.account')
    : state === 'device' ? t('depth.draft.device')
      : state === 'saving' ? t('depth.draft.saving')
        : state === 'error' ? t('depth.draft.device')
          : t('depth.draft.pending');
  return <span className={`dp-save-state is-${state}`}>{label}</span>;
};

export const WritingTask = () => {
  const t = useT();
  const errorText = useErrorMessage();
  const { slug = '' } = useParams();
  const task = useResource((signal) => getWritingTask(slug, signal), [slug]);
  const elapsed = useElapsedSeconds();
  const lastSubmitAt = useRef(0);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  const draft = useDraftSync(slug, task.data?.draft ?? null, Boolean(task.data));
  const { text, setText } = draft;
  const [result, setResult] = useState<WritingSubmitResponse | null>(null);
  const [submittedText, setSubmittedText] = useState('');
  // Kept in the page too, for the editor note while revising (the server comparison is in the result).
  const [previous, setPrevious] = useState<{ score: number; feedback: WritingFeedback } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const prompt = task.data?.prompt;
  const yourWords = task.data?.your_words ?? [];
  const revisions = task.data?.revisions ?? [];

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
      const response = await submitWriting(slug, text, Math.max(1, now - lastSubmitAt.current), yourWords.map((entry) => entry.id));
      lastSubmitAt.current = now;
      draft.markSubmitted(text);
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
    // Refresh the list of drafts and their scores.
    task.reload();
    window.setTimeout(() => {
      editorRef.current?.focus();
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  // The server's previous revision (works across devices and reloads); a page-only score as a fallback.
  const serverPrevious: PreviousRevision | null = result?.previous_revision ?? null;
  const comparison = (() => {
    if (!result || serverPrevious) return null;
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
          {serverPrevious ? <RevisionCompare previous={serverPrevious} text={submittedText} feedback={result.feedback} revision={result.revision} /> : null}
          <YourWordsResult suggested={yourWords} used={result.your_words_used ?? []} />
          <FeedbackDetail feedback={result.feedback} text={submittedText} saveLabel={prompt?.title ?? null} />
          <ModelAnswer slug={slug} />
          <RubricHistory compact />
          <div className="en-actions">
            <button type="button" className="is-large" onClick={revise}>{t('writing.revise')}</button>
            <span className="hint">{t('writing.revise.hint')}</span>
          </div>
        </ResultPanel>
      ) : null}

      {prompt && !result ? <Brief prompt={prompt} text={text} /> : null}

      {prompt && !result ? (
        <Panel title={t('writing.editor.title')}>
          <YourWordsHint words={yourWords} />
          <RevisionStrip revisions={revisions} />
          {previous ? (
            <div className="en-stack" style={{ gap: '.5rem' }}>
              <p className="en-notice" style={{ margin: 0 }}>{t('writing.editor.revising', { score: previous.score })}</p>
              {previous.feedback.corrections.length ? (
                <details>
                  <summary>{t('writing.editor.lastFeedback')}</summary>
                  <CorrectionList corrections={previous.feedback.corrections} saveLabel={prompt.title} />
                </details>
              ) : null}
            </div>
          ) : draft.restored ? (
            <p className="hint" style={{ margin: 0 }}>{draft.restored === 'server' ? t('depth.draft.restoredAccount') : t('writing.editor.restored')}</p>
          ) : null}
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
            onChange={(event) => setText(event.target.value)}
            aria-describedby="writing-meter"
          />
          <div className="en-meter" id="writing-meter" aria-live="polite">
            <span><strong>{t('writing.editor.count', { count: words })}</strong></span>
            <span>{t('writing.editor.target', { min, max })}</span>
            <span className={`wr-meter-state is-${lengthState}`}>
              {lengthState === 'short' ? t('writing.editor.short') : lengthState === 'long' ? t('writing.editor.long') : t('writing.editor.inRange')}
            </span>
            <SaveState state={draft.state} />
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
