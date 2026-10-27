import { useId } from 'react';
import type { SatQuestion } from '../lib/api';
import { answerFormatOf, parseSprNumber, sprEntryProblem, SPR_MAX_NEGATIVE, SPR_MAX_POSITIVE } from '../lib/content';
import { useAppT } from '../i18n';
import { DataTable, Figure, RichText } from './RichText';

const optionsFrom = (question: SatQuestion): Array<{ id: string; label: string }> => {
  const raw = question.data.options;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const source = item as Record<string, unknown>;
      const id = String(source.id ?? '').trim();
      const label = String(source.label ?? '').trim();
      return id && label ? { id, label } : null;
    })
    .filter((item): item is { id: string; label: string } => item != null);
};

export const answerText = (value: unknown): string => {
  const answer = value && typeof value === 'object' ? (value as Record<string, unknown>).text ?? (value as Record<string, unknown>).value : value;
  return typeof answer === 'string' || typeof answer === 'number' ? String(answer) : '';
};
export const selectedOption = (value: unknown): string => typeof value === 'string'
  ? value
  : value && typeof value === 'object'
    ? String((value as Record<string, unknown>).selected_option ?? (value as Record<string, unknown>).option_id ?? '')
    : '';
export const isAnswered = (value: unknown): boolean => {
  if (value == null) return false;
  const raw = typeof value === 'object'
    ? (value as Record<string, unknown>).selected_option ?? (value as Record<string, unknown>).option_id ?? (value as Record<string, unknown>).text ?? (value as Record<string, unknown>).value
    : value;
  return (typeof raw === 'string' && raw.trim() !== '') || (typeof raw === 'number' && Number.isFinite(raw));
};

/** Grid-in entry with the Digital SAT rules: digits, one "." or "/", optional leading minus. */
export function SprInput(props: { value: string; onChange: (value: string) => void; readOnly?: boolean; describedBy?: string }) {
  const t = useAppT();
  const id = useId();
  const problem = props.value ? sprEntryProblem(props.value) : null;
  const parsed = props.value && !problem ? parseSprNumber(props.value) : null;
  const preview = parsed ? (/\//.test(props.value) ? `$${props.value.startsWith('-') ? '-' : ''}\\dfrac{${props.value.replace('-', '').split('/')[0]}}{${props.value.split('/')[1]}}$` : `$${props.value}$`) : '';
  const max = props.value.startsWith('-') ? SPR_MAX_NEGATIVE : SPR_MAX_POSITIVE;
  return <div className="spr-entry">
    <label htmlFor={id}>{t('spr.label')}</label>
    <input id={id} className="spr-input" inputMode="decimal" autoComplete="off" spellCheck={false} value={props.value} readOnly={props.readOnly}
      maxLength={max} aria-describedby={[props.describedBy, id + '-hint', problem ? id + '-issue' : ''].filter(Boolean).join(' ')}
      aria-invalid={problem ? true : undefined}
      onChange={event => {
        const next = event.target.value.replace(/−/g, '-').replace(/[^0-9./-]/g, '');
        props.onChange(next.slice(0, next.startsWith('-') ? SPR_MAX_NEGATIVE : SPR_MAX_POSITIVE));
      }} />
    <p id={id + '-hint'} className="spr-hint">{t('spr.hint')}</p>
    {problem && problem !== 'empty' ? <p id={id + '-issue'} className="spr-issue" role="status">{t(`spr.issue.${problem}`)}</p> : null}
    {preview ? <p className="spr-preview"><span>{t('spr.preview')}</span> <RichText text={preview} /></p> : null}
  </div>;
}

export const QuestionCard = (props: {
  question: SatQuestion;
  value?: unknown;
  readOnly?: boolean;
  answerCorrect?: boolean | null;
  onChange?: (value: unknown) => void;
  showPassage?: boolean;
}) => {
  const t = useAppT();
  const promptId = `question-prompt-${props.question.id}`;
  const data = props.question.data;
  const prompt = data.prompt ?? data.text ?? '';
  const options = optionsFrom(props.question);
  const format = answerFormatOf(props.question.type, props.question.metadata);
  const selected = selectedOption(props.value);
  const text = answerText(props.value);
  const status = (correct: boolean | null | undefined) => correct === null ? t('question.outcomeUnavailable') : correct ? t('question.yourAnswerCorrect') : t('question.yourAnswerIncorrect');
  const stimulus = <>
    {props.showPassage !== false && typeof data.passage === 'string' && data.passage.trim() ? <RichText as="div" className="question-passage" text={data.passage} mathErrorLabel={t('question.mathError')} /> : null}
    {data.table ? <DataTable table={data.table} label={t('question.table')} /> : null}
    {data.figure_svg ? <Figure svg={data.figure_svg} label={t('question.figure')} /> : null}
  </>;

  if (options.length > 0 && format === 'mcq') {
    return (
      <article className="question-card" aria-labelledby={promptId}>
        {stimulus}
        <div id={promptId} className="question-prompt"><RichText text={prompt} mathErrorLabel={t('question.mathError')} /></div>
        <div className="option-list" role="radiogroup" aria-labelledby={promptId}>
          {options.map((option) => (
            <label key={option.id} className={`option-row${selected === option.id ? ' selected' : ''}${props.readOnly && selected === option.id && props.answerCorrect === false ? ' answer-incorrect' : ''}${props.readOnly && selected === option.id && props.answerCorrect === null ? ' answer-unconfirmed' : ''}`}>
              <input
                type="radio"
                name={props.question.id}
                checked={selected === option.id}
                disabled={props.readOnly}
                onChange={() => props.onChange?.({ selected_option: option.id })}
              />
              <span aria-hidden="true">{option.id}</span>
              <strong><span className="visually-hidden">{option.id}. </span><RichText text={option.label} mathErrorLabel={t('question.mathError')} /></strong>
              {props.readOnly && selected === option.id && props.answerCorrect !== undefined ? <small className="option-answer-status">{status(props.answerCorrect)}</small> : null}
            </label>
          ))}
        </div>
      </article>
    );
  }

  return (
    <article className="question-card" aria-labelledby={promptId}>
      {stimulus}
      <div id={promptId} className="question-prompt"><RichText text={prompt} mathErrorLabel={t('question.mathError')} /></div>
      {props.readOnly
        ? <p className={`spr-answer${props.answerCorrect === false ? ' answer-incorrect' : ''}`}><strong>{t('question.yourAnswer')}:</strong> {text ? <RichText text={`$${text}$`} /> : t('question.noAnswer')}
          {props.answerCorrect !== undefined && text ? <small className="option-answer-status"> · {status(props.answerCorrect)}</small> : null}</p>
        : format === 'spr'
          ? <SprInput value={text} describedBy={promptId} onChange={value => props.onChange?.({ text: value })} />
          : <textarea rows={4} aria-label={t('question.yourAnswer')} aria-describedby={promptId} value={text} onChange={(event) => props.onChange?.({ text: event.target.value })} />}
    </article>
  );
};
