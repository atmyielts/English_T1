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
import { FeedbackList, LevelBadge, Stat, Tag } from '../ui/kit';
import { LevelPicker, SHARED_COPY, ToolError, useLearnerLevel, useToolRequest, wordCount } from './aiToolShared';

const COPY = {
  essay: {
    intro: 'Paste your writing and get feedback for your level.',
    taskLabel: 'The task (optional)',
    taskPlaceholder: 'For example: Write about your favourite place in your city.',
    textLabel: 'Your writing',
    textPlaceholder: 'Write or paste your text here (at least 40 characters).',
    levelLabel: 'Your target level',
    submit: 'Get feedback',
    busy: 'Reading your text…',
    tooShort: 'Please write a little more first (at least 40 characters).',
    words: (n: number) => (n === 1 ? '1 word' : `${n} words`),
    overall: 'Your level for this text',
    criteria: {
      task: 'Answering the task',
      coherence: 'Organisation',
      range: 'Range of words and grammar',
      accuracy: 'Accuracy',
    },
    strengths: 'What went well',
    improvements: 'What to work on',
    nextStep: 'Your next step',
    rewrite: 'A better version',
    fallbackNote: "Full feedback isn't available right now. Here are quick checks on your text.",
    statWords: 'Words',
    statSentences: 'Sentences',
    statParagraphs: 'Paragraphs',
    statAverage: 'Words per sentence',
    checksTitle: 'Quick checks',
    noChecks: 'The quick checks found nothing to fix. Well done!',
  },
  translate: {
    intro: 'Write a sentence in your language. See three natural ways to say it in English.',
    label: 'Your sentence',
    placeholder: 'For example: Bugun havo juda issiq.',
    submit: 'Show English versions',
    busy: 'Translating…',
    tooShort: 'Please write a sentence first.',
    nuance: 'Good to know',
  },
  idioms: {
    intro: 'Paste an English text. Find useful phrases and word partners in it.',
    label: 'English text',
    placeholder: 'Paste a paragraph from an article, a story or a dialogue…',
    levelLabel: 'Your level',
    submit: 'Find phrases',
    busy: 'Looking…',
    tooShort: 'Please paste a longer text (at least 30 characters).',
    idiomsHeading: 'Idioms (fixed phrases)',
    collocationsHeading: 'Word partners',
    notesHeading: 'Good to know',
    example: 'Example:',
    none: "We didn't find special phrases in this text. Try a longer text.",
  },
  registers: {
    formal: 'Formal',
    neutral: 'Neutral',
    informal: 'Informal',
    literary: 'Literary',
    academic: 'Academic',
    conversational: 'Everyday',
    spoken: 'Spoken',
  } as Record<string, string>,
  collocationTypes: {
    verb_noun: 'verb + noun',
    adj_noun: 'adjective + noun',
    adv_adj: 'adverb + adjective',
    verb_adv: 'verb + adverb',
    noun_noun: 'noun + noun',
  } as Record<string, string>,
};

const registerLabel = (value: string) => COPY.registers[value.toLowerCase()] ?? '';

// === Writing feedback ===

export const EssayGraderCard = ({ accessToken }: { accessToken?: string | null }) => {
  const learnerLevel = useLearnerLevel();
  const [text, setText] = useState('');
  const [task, setTask] = useState('');
  const [targetLevel, setTargetLevel] = useState<CefrLevel>(learnerLevel);
  const { data, busy, error, run, setError } = useToolRequest<EssayGradeResponse>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim().length < 40) {
      setError(COPY.essay.tooShort);
      return;
    }
    void run(() => gradeEssay({ text: text.trim(), target_level: targetLevel, prompt: task.trim() || undefined }));
  };

  if (!accessToken) return null;

  const criteriaKeys = ['task', 'coherence', 'range', 'accuracy'] as const;

  return (
    <div className="en-stack">
      <p className="hint">{COPY.essay.intro}</p>
      <form onSubmit={submit}>
        <LevelPicker label={COPY.essay.levelLabel} value={targetLevel} onChange={setTargetLevel} />
        <label className="en-stack" htmlFor="essay-task" style={{ gap: '0.35rem' }}>
          {COPY.essay.taskLabel}
          <input id="essay-task" type="text" value={task} maxLength={600} onChange={(e) => setTask(e.target.value)} placeholder={COPY.essay.taskPlaceholder} />
        </label>
        <label className="en-stack" htmlFor="essay-text" style={{ gap: '0.35rem' }}>
          {COPY.essay.textLabel}
          <textarea
            id="essay-text"
            className="en-writing"
            value={text}
            maxLength={5000}
            onChange={(e) => setText(e.target.value)}
            placeholder={COPY.essay.textPlaceholder}
            rows={8}
          />
        </label>
        <div className="en-actions">
          <button type="submit" disabled={busy}>{busy ? COPY.essay.busy : COPY.essay.submit}</button>
          <span className="hint">{COPY.essay.words(wordCount(text))}</span>
        </div>
      </form>

      <div className="en-stack" aria-live="polite">
        <ToolError message={error} />
        {data ? (
          <div className="en-stats">
            <Stat label={COPY.essay.statWords} value={data.stats.words} />
            <Stat label={COPY.essay.statSentences} value={data.stats.sentences} />
            <Stat label={COPY.essay.statParagraphs} value={data.stats.paragraphs} />
            <Stat label={COPY.essay.statAverage} value={data.stats.avg_sentence_words} />
          </div>
        ) : null}

        {data && !data.fallback ? (
          <>
            {data.overall_level ? (
              <div className="en-row">
                <span>{COPY.essay.overall}</span>
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
                      <strong>{COPY.essay.criteria[key]}</strong>
                      <LevelBadge level={item.level} muted />
                    </span>
                    {item.comment}
                  </li>
                );
              })}
            </ul>
            <FeedbackList title={COPY.essay.strengths} items={data.strengths} tone="good" />
            <FeedbackList title={COPY.essay.improvements} items={data.improvements} tone="fix" />
            {data.actionable_next_step ? (
              <div className="en-explain">
                <strong>{COPY.essay.nextStep}</strong>
                <br />
                {data.actionable_next_step}
              </div>
            ) : null}
            {data.rewrite_sample ? (
              <div className="en-explain">
                <strong>{COPY.essay.rewrite}</strong>
                <br />
                <em>{data.rewrite_sample}</em>
              </div>
            ) : null}
          </>
        ) : null}

        {data?.fallback ? (
          <>
            <p className="en-explain">{COPY.essay.fallbackNote}</p>
            <FeedbackList title={COPY.essay.strengths} items={data.strengths} tone="good" />
            {data.checks.length ? (
              <FeedbackList title={COPY.essay.checksTitle} items={data.checks} tone="fix" />
            ) : (
              <p className="en-notice">{COPY.essay.noChecks}</p>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};

// === Say it in English (translation comparison) ===

export const TranslationCompareCard = ({ accessToken }: { accessToken?: string | null }) => {
  const [sourceText, setSourceText] = useState('');
  const { data, busy, error, run, setError } = useToolRequest<TranslationCompareResponse>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (sourceText.trim().length < 3) {
      setError(COPY.translate.tooShort);
      return;
    }
    void run(() => compareTranslations({ source_text: sourceText.trim() }));
  };

  if (!accessToken) return null;

  const unavailable = data && (data.ai_status !== 'ok' || data.translations.length === 0);

  return (
    <div className="en-stack">
      <p className="hint">{COPY.translate.intro}</p>
      <form onSubmit={submit}>
        <label className="en-stack" htmlFor="translate-source" style={{ gap: '0.35rem' }}>
          {COPY.translate.label}
          <textarea
            id="translate-source"
            value={sourceText}
            maxLength={800}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder={COPY.translate.placeholder}
            rows={3}
          />
        </label>
        <div className="en-actions">
          <button type="submit" disabled={busy}>{busy ? COPY.translate.busy : COPY.translate.submit}</button>
        </div>
      </form>

      <div className="en-stack" aria-live="polite">
        <ToolError message={error} />
        {unavailable ? <p className="en-explain">{SHARED_COPY.unavailable}</p> : null}
        {data && !unavailable ? (
          <>
            <ul className="en-list">
              {data.translations.map((t, index) => (
                <li key={index} className="en-explain">
                  {registerLabel(t.register) ? <Tag>{registerLabel(t.register)}</Tag> : null}
                  <p className="en-question-prompt">“{t.text}”</p>
                  {t.style_note}
                </li>
              ))}
            </ul>
            {data.nuance_summary ? (
              <div className="en-feedback is-good">
                <h3>{COPY.translate.nuance}</h3>
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
  const learnerLevel = useLearnerLevel();
  const [sourceText, setSourceText] = useState('');
  const [level, setLevel] = useState<CefrLevel>(learnerLevel);
  const { data, busy, error, run, setError } = useToolRequest<IdiomExtractResponse>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (sourceText.trim().length < 30) {
      setError(COPY.idioms.tooShort);
      return;
    }
    void run(() => extractIdioms({ source_text: sourceText.trim(), target_level: level }));
  };

  if (!accessToken) return null;

  const nothingFound = data && data.ai_status === 'ok' && !data.idioms.length && !data.collocations.length && !data.cultural_notes.length;

  return (
    <div className="en-stack">
      <p className="hint">{COPY.idioms.intro}</p>
      <form onSubmit={submit}>
        <LevelPicker label={COPY.idioms.levelLabel} value={level} onChange={setLevel} />
        <label className="en-stack" htmlFor="idiom-source" style={{ gap: '0.35rem' }}>
          {COPY.idioms.label}
          <textarea
            id="idiom-source"
            value={sourceText}
            maxLength={4000}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder={COPY.idioms.placeholder}
            rows={6}
          />
        </label>
        <div className="en-actions">
          <button type="submit" disabled={busy}>{busy ? COPY.idioms.busy : COPY.idioms.submit}</button>
        </div>
      </form>

      <div className="en-stack" aria-live="polite">
        <ToolError message={error} />
        {data && data.ai_status !== 'ok' ? <p className="en-explain">{SHARED_COPY.unavailable}</p> : null}
        {nothingFound ? <p className="hint">{COPY.idioms.none}</p> : null}
        {data && data.ai_status === 'ok' ? (
          <>
            {data.idioms.length ? (
              <>
                <h3>{COPY.idioms.idiomsHeading}</h3>
                <ul className="en-list">
                  {data.idioms.map((item, index) => (
                    <li key={index} className="en-explain">
                      <span className="en-row">
                        <strong>{item.phrase}</strong>
                        {registerLabel(item.register) ? <Tag>{registerLabel(item.register)}</Tag> : null}
                      </span>
                      {item.meaning}
                      {item.example ? <><br /><em>{COPY.idioms.example} {item.example}</em></> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {data.collocations.length ? (
              <>
                <h3>{COPY.idioms.collocationsHeading}</h3>
                <ul className="en-list">
                  {data.collocations.map((item, index) => (
                    <li key={index} className="en-explain">
                      <span className="en-row">
                        <strong>{item.phrase}</strong>
                        {COPY.collocationTypes[item.type] ? <Tag>{COPY.collocationTypes[item.type]}</Tag> : null}
                      </span>
                      {item.meaning}
                      {item.example ? <><br /><em>{COPY.idioms.example} {item.example}</em></> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <FeedbackList title={COPY.idioms.notesHeading} items={data.cultural_notes} tone="good" />
          </>
        ) : null}
      </div>
    </div>
  );
};
