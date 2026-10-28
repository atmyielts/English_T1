import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../../i18n';
import { handbookTopicHref } from '../../lib/handbookSearch';
import { L1Why } from '../../components/L1Why';
import { SavePhrase } from '../../components/SavePhrase';
import { ProgressBar } from '../../ui/kit';
import { changedPhrase } from '../../../../../supabase/functions/_shared/english-text-diff.ts';
import type { WritingCorrection, WritingFeedback } from './api';

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

/** Each correction with why, its handbook rule and first-language note when one matches, and a way to keep the better phrase. */
export const CorrectionList = ({ corrections, saveLabel }: { corrections: WritingCorrection[]; saveLabel?: string | null }) => {
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
          <small>
            <strong>{t(`writing.category.${correction.category}`)}:</strong> {correction.explanation}
            {correction.category === 'grammar' && correction.topic ? (
              <> <Link to={handbookTopicHref(correction.topic)}>{t('handbook.readRule')}</Link></>
            ) : null}
            {' '}
            {correction.category === 'vocabulary' || correction.category === 'style' || correction.category === 'grammar' ? (
              <SavePhrase
                phrase={changedPhrase(correction.original, correction.corrected)}
                context={correction.corrected}
                source="writing-feedback"
                label={saveLabel ?? null}
              />
            ) : null}
          </small>
          <L1Why original={correction.original} corrected={correction.corrected} explanation={correction.explanation} topic={correction.topic ?? null} />
        </li>
      ))}
    </ul>
  );
};

/** Criteria, checklist, next step, corrections, model sentences and the highlighted text. */
export const FeedbackDetail = ({ feedback, text, saveLabel }: { feedback: WritingFeedback; text: string; saveLabel?: string | null }) => {
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
            <CorrectionList corrections={feedback.corrections} saveLabel={saveLabel} />
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
