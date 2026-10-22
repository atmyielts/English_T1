import { useState, type FormEvent } from 'react';
import {
  compareTranslations,
  extractIdioms,
  gradeEssay,
  type CefrLevel,
  type EssayGradeResponse,
  type IdiomExtractResponse,
  type TranslationCompareResponse,
} from '../lib/ecosystemInsightsClient';
import { useT } from '../i18n';
import { FeedbackList, LevelBadge, Stat, Tag } from '../ui/kit';
import { LevelPicker, ToolError, optionalLabel, useLearnerLevel, useToolRequest, wordCount, type Translate } from './aiToolShared';

const registerLabel = (t: Translate, value: string) => optionalLabel(t, `ai.register.${value.toLowerCase()}`);

// === Writing feedback ===

export const EssayGraderCard = ({ accessToken }: { accessToken?: string | null }) => {
  const t = useT();
  const learnerLevel = useLearnerLevel();
  const [text, setText] = useState('');
  const [task, setTask] = useState('');
  const [targetLevel, setTargetLevel] = useState<CefrLevel>(learnerLevel);
  const { data, busy, error, run, setError } = useToolRequest<EssayGradeResponse>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim().length < 40) {
      setError(t('ai.essay.tooShort'));
      return;
    }
    void run(() => gradeEssay({ text: text.trim(), target_level: targetLevel, prompt: task.trim() || undefined }));
  };

  if (!accessToken) return null;

  const criteriaKeys = ['task', 'coherence', 'range', 'accuracy'] as const;

  return (
    <div className="en-stack">
      <p className="hint">{t('ai.essay.intro')}</p>
      <form onSubmit={submit}>
        <LevelPicker label={t('ai.essay.levelLabel')} value={targetLevel} onChange={setTargetLevel} />
        <label className="en-stack" htmlFor="essay-task" style={{ gap: '0.35rem' }}>
          {t('ai.essay.taskLabel')}
          <input id="essay-task" type="text" value={task} maxLength={600} onChange={(e) => setTask(e.target.value)} placeholder={t('ai.essay.taskPlaceholder')} />
        </label>
        <label className="en-stack" htmlFor="essay-text" style={{ gap: '0.35rem' }}>
          {t('ai.essay.textLabel')}
          <textarea
            id="essay-text"
            className="en-writing"
            value={text}
            maxLength={5000}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('ai.essay.textPlaceholder')}
            rows={8}
          />
        </label>
        <div className="en-actions">
          <button type="submit" disabled={busy}>{busy ? t('ai.essay.busy') : t('ai.essay.submit')}</button>
          <span className="hint">{t('ai.essay.words', { count: wordCount(text) })}</span>
        </div>
      </form>

      <div className="en-stack" aria-live="polite">
        <ToolError message={error} />
        {data ? (
          <div className="en-stats">
            <Stat label={t('ai.essay.statWords')} value={data.stats.words} />
            <Stat label={t('ai.essay.statSentences')} value={data.stats.sentences} />
            <Stat label={t('ai.essay.statParagraphs')} value={data.stats.paragraphs} />
            <Stat label={t('ai.essay.statAverage')} value={data.stats.avg_sentence_words} />
          </div>
        ) : null}

        {data && !data.fallback ? (
          <>
            {data.overall_level ? (
              <div className="en-row">
                <span>{t('ai.essay.overall')}</span>
                <LevelBadge level={data.overall_level} />
              </div>
            ) : null}
            <ul className="en-list">
              {criteriaKeys.map((key) => {
                const item = data.criteria[key];
                if (!item) return null;
                return (
                  <li key={key} className="en-explain">
                    <span className="en-row">
                      <strong>{t(`ai.essay.criteria.${key}`)}</strong>
                      <LevelBadge level={item.level} muted />
                    </span>
                    {item.comment}
                  </li>
                );
              })}
            </ul>
            <FeedbackList title={t('ai.essay.strengths')} items={data.strengths} tone="good" />
            <FeedbackList title={t('ai.essay.improvements')} items={data.improvements} tone="fix" />
            {data.actionable_next_step ? (
              <div className="en-explain">
                <strong>{t('ai.essay.nextStep')}</strong>
                <br />
                {data.actionable_next_step}
              </div>
            ) : null}
            {data.rewrite_sample ? (
              <div className="en-explain">
                <strong>{t('ai.essay.rewrite')}</strong>
                <br />
                <em>{data.rewrite_sample}</em>
              </div>
            ) : null}
          </>
        ) : null}

        {data?.fallback ? (
          <>
            <p className="en-explain">{t('ai.essay.fallbackNote')}</p>
            <FeedbackList title={t('ai.essay.strengths')} items={data.strengths} tone="good" />
            {data.checks.length ? (
              <FeedbackList title={t('ai.essay.checksTitle')} items={data.checks} tone="fix" />
            ) : (
              <p className="en-notice">{t('ai.essay.noChecks')}</p>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};

// === Say it in English (translation comparison) ===

export const TranslationCompareCard = ({ accessToken }: { accessToken?: string | null }) => {
  const t = useT();
  const [sourceText, setSourceText] = useState('');
  const { data, busy, error, run, setError } = useToolRequest<TranslationCompareResponse>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (sourceText.trim().length < 3) {
      setError(t('ai.translate.tooShort'));
      return;
    }
    void run(() => compareTranslations({ source_text: sourceText.trim() }));
  };

  if (!accessToken) return null;

  const unavailable = data && (data.ai_status !== 'ok' || data.translations.length === 0);

  return (
    <div className="en-stack">
      <p className="hint">{t('ai.translate.intro')}</p>
      <form onSubmit={submit}>
        <label className="en-stack" htmlFor="translate-source" style={{ gap: '0.35rem' }}>
          {t('ai.translate.label')}
          <textarea
            id="translate-source"
            value={sourceText}
            maxLength={800}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder={t('ai.translate.placeholder')}
            rows={3}
          />
        </label>
        <div className="en-actions">
          <button type="submit" disabled={busy}>{busy ? t('ai.translate.busy') : t('ai.translate.submit')}</button>
        </div>
      </form>

      <div className="en-stack" aria-live="polite">
        <ToolError message={error} />
        {unavailable ? <p className="en-explain">{t('ai.shared.unavailable')}</p> : null}
        {data && !unavailable ? (
          <>
            <ul className="en-list">
              {data.translations.map((item, index) => (
                <li key={index} className="en-explain">
                  {registerLabel(t, item.register) ? <Tag>{registerLabel(t, item.register)}</Tag> : null}
                  <p className="en-question-prompt">“{item.text}”</p>
                  {item.style_note}
                </li>
              ))}
            </ul>
            {data.nuance_summary ? (
              <div className="en-feedback is-good">
                <h3>{t('ai.translate.nuance')}</h3>
                <p>{data.nuance_summary}</p>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
};

// === Phrases in a text (idioms and collocations) ===

export const IdiomExplorerCard = ({ accessToken }: { accessToken?: string | null }) => {
  const t = useT();
  const learnerLevel = useLearnerLevel();
  const [sourceText, setSourceText] = useState('');
  const [level, setLevel] = useState<CefrLevel>(learnerLevel);
  const { data, busy, error, run, setError } = useToolRequest<IdiomExtractResponse>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (sourceText.trim().length < 30) {
      setError(t('ai.idioms.tooShort'));
      return;
    }
    void run(() => extractIdioms({ source_text: sourceText.trim(), target_level: level }));
  };

  if (!accessToken) return null;

  const nothingFound = data && data.ai_status === 'ok' && !data.idioms.length && !data.collocations.length && !data.cultural_notes.length;

  return (
    <div className="en-stack">
      <p className="hint">{t('ai.idioms.intro')}</p>
      <form onSubmit={submit}>
        <LevelPicker label={t('ai.idioms.levelLabel')} value={level} onChange={setLevel} />
        <label className="en-stack" htmlFor="idiom-source" style={{ gap: '0.35rem' }}>
          {t('ai.idioms.label')}
          <textarea
            id="idiom-source"
            value={sourceText}
            maxLength={4000}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder={t('ai.idioms.placeholder')}
            rows={6}
          />
        </label>
        <div className="en-actions">
          <button type="submit" disabled={busy}>{busy ? t('ai.idioms.busy') : t('ai.idioms.submit')}</button>
        </div>
      </form>

      <div className="en-stack" aria-live="polite">
        <ToolError message={error} />
        {data && data.ai_status !== 'ok' ? <p className="en-explain">{t('ai.shared.unavailable')}</p> : null}
        {nothingFound ? <p className="hint">{t('ai.idioms.none')}</p> : null}
        {data && data.ai_status === 'ok' ? (
          <>
            {data.idioms.length ? (
              <>
                <h3>{t('ai.idioms.idiomsHeading')}</h3>
                <ul className="en-list">
                  {data.idioms.map((item, index) => (
                    <li key={index} className="en-explain">
                      <span className="en-row">
                        <strong>{item.phrase}</strong>
                        {registerLabel(t, item.register) ? <Tag>{registerLabel(t, item.register)}</Tag> : null}
                      </span>
                      {item.meaning}
                      {item.example ? <><br /><em>{t('ai.idioms.example')} {item.example}</em></> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {data.collocations.length ? (
              <>
                <h3>{t('ai.idioms.collocationsHeading')}</h3>
                <ul className="en-list">
                  {data.collocations.map((item, index) => (
                    <li key={index} className="en-explain">
                      <span className="en-row">
                        <strong>{item.phrase}</strong>
                        {optionalLabel(t, `ai.collocation.${item.type}`) ? <Tag>{optionalLabel(t, `ai.collocation.${item.type}`)}</Tag> : null}
                      </span>
                      {item.meaning}
                      {item.example ? <><br /><em>{t('ai.idioms.example')} {item.example}</em></> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <FeedbackList title={t('ai.idioms.notesHeading')} items={data.cultural_notes} tone="good" />
          </>
        ) : null}
      </div>
    </div>
  );
};
