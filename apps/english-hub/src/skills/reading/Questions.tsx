import { Fragment } from 'react';
import { useT } from '../../i18n';
import type { ReadingAnswer, ReadingAnswerResult, ReadingQuestion } from './api';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
const letter = (index: number) => LETTERS[index] ?? String(index + 1);
const TFNG: Array<NonNullable<ReadingAnswer['value']>> = ['true', 'false', 'not_given'];

/** Whether the learner has answered anything in this question. */
export const isAnswered = (question: ReadingQuestion, answer: ReadingAnswer | undefined): boolean => {
  if (!answer) return false;
  if (question.type === 'mcq') return answer.option_index !== undefined;
  if (question.type === 'tfng') return Boolean(answer.value);
  if (question.type === 'headings') return (answer.values ?? []).some((value) => value !== null && value !== undefined);
  return (answer.texts ?? []).some((text) => text.trim());
};

type Props = {
  question: ReadingQuestion;
  index: number;
  answer: ReadingAnswer | undefined;
  result: ReadingAnswerResult | null;
  disabled: boolean;
  onAnswer: (answer: ReadingAnswer) => void;
};

const Feedback = ({ result, expected }: { result: ReadingAnswerResult; expected: string }) => {
  const t = useT();
  const parts = result.parts ?? [];
  const skipped = parts.length ? parts.every((part) => !part.given) : result.chosen_index === null;
  return (
    <>
      <p className={result.correct ? 'en-notice' : 'error'} style={{ margin: 0 }}>
        {result.correct
          ? t('reading.questions.correct')
          : parts.length
            ? t('depth.reading.partsRight', { right: parts.filter((part) => part.correct).length, total: parts.length })
            : skipped
              ? t('depth.reading.skippedAnswer', { answer: expected })
              : t('depth.reading.wrongAnswer', { answer: expected })}
      </p>
      {result.explanation ? <p className="en-explain" lang="en">{result.explanation}</p> : null}
    </>
  );
};

const Mcq = ({ question, answer, result, disabled, onAnswer }: Props & { question: Extract<ReadingQuestion, { type: 'mcq' }> }) => (
  <div className="en-options">
    {question.options.map((option, optionIndex) => {
      const chosen = answer?.option_index === optionIndex;
      const state = result ? (optionIndex === result.answer_index ? 'is-correct' : chosen ? 'is-wrong' : '') : '';
      return (
        <button
          key={optionIndex}
          type="button"
          className={`en-option ${state}`.trim()}
          aria-pressed={chosen}
          disabled={disabled}
          onClick={() => onAnswer({ option_index: optionIndex })}
        >
          <span className="en-option-key" aria-hidden="true">{letter(optionIndex)}</span>
          <span lang="en">{option}</span>
        </button>
      );
    })}
  </div>
);

const Tfng = ({ question, answer, result, disabled, onAnswer }: Props & { question: Extract<ReadingQuestion, { type: 'tfng' }> }) => {
  const t = useT();
  const label = (value: (typeof TFNG)[number]) =>
    value === 'not_given' ? t('depth.reading.notGiven') : question.variant === 'yes_no' ? t(`depth.reading.${value === 'true' ? 'yes' : 'no'}`) : t(`depth.reading.${value}`);
  return (
    <div className="en-options rd-tfng" role="radiogroup" aria-label={t('depth.reading.tfngLabel')}>
      {TFNG.map((value, optionIndex) => {
        const chosen = answer?.value === value;
        const state = result ? (optionIndex === result.answer_index ? 'is-correct' : chosen ? 'is-wrong' : '') : '';
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={chosen}
            className={`en-option ${state}`.trim()}
            disabled={disabled}
            onClick={() => onAnswer({ value })}
          >
            {label(value)}
          </button>
        );
      })}
    </div>
  );
};

const Headings = ({ question, answer, result, disabled, onAnswer }: Props & { question: Extract<ReadingQuestion, { type: 'headings' }> }) => {
  const t = useT();
  const values = answer?.values ?? question.items.map(() => null);
  return (
    <div className="en-stack" style={{ gap: '.6rem' }}>
      <ol className="rd-headings-list" lang="en">
        {question.options.map((option, optionIndex) => (
          <li key={optionIndex}><span className="en-option-key" aria-hidden="true">{letter(optionIndex)}</span> {option}</li>
        ))}
      </ol>
      {question.items.map((item, itemIndex) => {
        const part = result?.parts?.[itemIndex];
        const id = `rd-h-${question.id}-${item.id}`;
        return (
          <div key={item.id} className={`rd-heading-row ${part ? (part.correct ? 'is-correct' : 'is-wrong') : ''}`.trim()}>
            <label htmlFor={id}>{t('depth.reading.paragraph', { number: item.paragraph })}</label>
            <select
              id={id}
              value={values[itemIndex] ?? ''}
              disabled={disabled}
              onChange={(event) => {
                const next = [...values];
                while (next.length < question.items.length) next.push(null);
                next[itemIndex] = event.target.value === '' ? null : Number(event.target.value);
                onAnswer({ values: next });
              }}
            >
              <option value="">{t('depth.reading.chooseHeading')}</option>
              {question.options.map((option, optionIndex) => (
                <option key={optionIndex} value={optionIndex}>{letter(optionIndex)}. {option}</option>
              ))}
            </select>
            {part && !part.correct ? <small className="hint" lang="en">{t('depth.reading.rightHeading', { heading: part.expected })}</small> : null}
          </div>
        );
      })}
    </div>
  );
};

const Gap = ({ question, answer, result, disabled, onAnswer }: Props & { question: Extract<ReadingQuestion, { type: 'gap' }> }) => {
  const t = useT();
  const texts = answer?.texts ?? Array.from({ length: question.gaps }, () => '');
  const pieces = question.text.split(/_{3,}/);
  const set = (gapIndex: number, value: string) => {
    const next = [...texts];
    while (next.length < question.gaps) next.push('');
    next[gapIndex] = value;
    onAnswer({ texts: next });
  };
  return (
    <div className="en-stack" style={{ gap: '.6rem' }}>
      {question.word_bank.length ? (
        <p className="hint" style={{ margin: 0 }}>
          {t('depth.reading.wordBank')}: <span lang="en">{question.word_bank.join(' · ')}</span>
        </p>
      ) : null}
      <p className="rd-gap-text" lang="en">
        {pieces.map((piece, pieceIndex) => {
          const gapIndex = pieceIndex;
          const part = result?.parts?.[gapIndex];
          const label = t('depth.reading.gapLabel', { number: gapIndex + 1 });
          return (
            <Fragment key={pieceIndex}>
              {piece}
              {pieceIndex < pieces.length - 1 ? (
                <span className={`rd-gap ${part ? (part.correct ? 'is-correct' : 'is-wrong') : ''}`.trim()}>
                  {question.word_bank.length ? (
                    <select aria-label={label} value={texts[gapIndex] ?? ''} disabled={disabled} onChange={(event) => set(gapIndex, event.target.value)}>
                      <option value="">…</option>
                      {question.word_bank.map((word) => <option key={word} value={word}>{word}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      aria-label={label}
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      value={texts[gapIndex] ?? ''}
                      disabled={disabled}
                      onChange={(event) => set(gapIndex, event.target.value)}
                    />
                  )}
                  {part && !part.correct ? <ins className="rd-gap-answer">{part.expected}</ins> : null}
                </span>
              ) : null}
            </Fragment>
          );
        })}
      </p>
    </div>
  );
};

const TYPE_KEYS: Record<ReadingQuestion['type'], string> = {
  mcq: 'depth.reading.type.mcq',
  tfng: 'depth.reading.type.tfng',
  headings: 'depth.reading.type.headings',
  gap: 'depth.reading.type.gap',
};

/** One comprehension question of any type, with its feedback once checked. */
export const ReadingQuestionBlock = (props: Props) => {
  const t = useT();
  const { question, index, result } = props;
  const expected = (() => {
    if (!result) return '';
    if (question.type === 'mcq') return letter(result.answer_index);
    if (question.type === 'tfng') {
      const value = TFNG[result.answer_index] ?? 'not_given';
      return value === 'not_given' ? t('depth.reading.notGiven') : question.variant === 'yes_no' ? t(`depth.reading.${value === 'true' ? 'yes' : 'no'}`) : t(`depth.reading.${value}`);
    }
    return '';
  })();
  return (
    <div className="en-question" role="group" aria-labelledby={`rd-q-${question.id}`}>
      <p className="eyebrow" style={{ margin: 0 }}>
        {t('reading.questions.item', { number: index + 1 })}
        {question.type !== 'mcq' ? <> · {t(TYPE_KEYS[question.type])}</> : null}
      </p>
      <p className="en-question-prompt" id={`rd-q-${question.id}`} lang="en">{question.prompt}</p>
      {question.type === 'mcq' ? <Mcq {...props} question={question} /> : null}
      {question.type === 'tfng' ? <Tfng {...props} question={question} /> : null}
      {question.type === 'headings' ? <Headings {...props} question={question} /> : null}
      {question.type === 'gap' ? <Gap {...props} question={question} /> : null}
      {result ? <Feedback result={result} expected={expected} /> : null}
    </div>
  );
};
