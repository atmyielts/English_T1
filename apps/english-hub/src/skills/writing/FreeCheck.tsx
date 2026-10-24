import { useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
import type { CefrLevel } from '../../lib/skills';
import { FeedbackList } from '../../ui/kit';
import { LevelPicker, ToolError, useLearnerLevel, useToolRequest } from '../../components/aiToolShared';
import { checkFreeText, countWords, type FreeCheckResponse } from './api';
import { FeedbackDetail } from './Feedback';

const MIN_WORDS = 15;

/**
 * "Check any text": the learner's own writing, checked by the same engine as
 * the writing tasks (quoted corrections, grammar rules, first-language notes).
 * Replaces the older hub /ai/essay-grade card in the Writing tools.
 */
export const FreeCheckCard = () => {
  const t = useT();
  const learnerLevel = useLearnerLevel();
  const [text, setText] = useState('');
  const [task, setTask] = useState('');
  const [level, setLevel] = useState<CefrLevel>(learnerLevel);
  const [checked, setChecked] = useState('');
  const { data, busy, error, run, setError } = useToolRequest<FreeCheckResponse>();
  const words = countWords(text);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (words < MIN_WORDS) {
      setError(t('depth.free.tooShort', { count: MIN_WORDS }));
      return;
    }
    const value = text.trim();
    void run(async () => {
      const response = await checkFreeText({ text: value, task: task.trim() || undefined, target_level: level });
      setChecked(value);
      return response;
    });
  };

  return (
    <div className="en-stack">
      <p className="hint">{t('depth.free.intro')}</p>
      <form onSubmit={submit} className="en-stack">
        <LevelPicker label={t('ai.essay.levelLabel')} value={level} onChange={setLevel} />
        <label className="en-stack" htmlFor="free-task" style={{ gap: '0.35rem' }}>
          {t('ai.essay.taskLabel')}
          <input id="free-task" type="text" value={task} maxLength={600} onChange={(event) => setTask(event.target.value)} placeholder={t('ai.essay.taskPlaceholder')} />
        </label>
        <label className="en-stack" htmlFor="free-text" style={{ gap: '0.35rem' }}>
          {t('ai.essay.textLabel')}
          <textarea
            id="free-text"
            className="en-writing"
            lang="en"
            value={text}
            maxLength={5000}
            onChange={(event) => setText(event.target.value)}
            placeholder={t('depth.free.placeholder')}
            rows={8}
          />
        </label>
        <div className="en-actions">
          <button type="submit" disabled={busy}>{busy ? t('ai.essay.busy') : t('ai.essay.submit')}</button>
          <span className="hint">{t('ai.essay.words', { count: words })}</span>
        </div>
      </form>
      <div className="en-stack" aria-live="polite">
        <ToolError message={error} />
        {data ? (
          <>
            {data.over_limit ? <p className="en-explain">{t('depth.free.overLimit')}</p> : null}
            <FeedbackList title={t('ai.essay.strengths')} items={data.feedback.strengths} tone="good" />
            <FeedbackList title={t('ai.essay.improvements')} items={data.feedback.improvements} tone="fix" />
            <FeedbackDetail feedback={data.feedback} text={checked} saveLabel={t('depth.free.source')} />
            <p className="hint" style={{ margin: 0 }}>{t('depth.free.notRecorded')}</p>
          </>
        ) : null}
      </div>
    </div>
  );
};
