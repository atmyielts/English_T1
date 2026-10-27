import { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import {
  ApiError,
  practiceReviewItemAnswer,
  practiceReviewItemGet,
  type ReviewItem,
  type ReviewItemDetail,
} from '../lib/api';
import { formatPracticeLabel } from '../lib/practiceExperience';
import { sectionLabel, useAppT, useErrorText, useFormat } from '../i18n';

type Json = Record<string, unknown>;

const asRecord = (value: unknown): Json => (value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {});
const toText = (value: unknown): string => String(value ?? '').trim();

const stepOptions = (step: Json): Array<{ id: string; label: string }> =>
  (Array.isArray(step.options) ? step.options : [])
    .map((entry, index) => {
      const row = asRecord(entry);
      return {
        id: toText(row.id ?? row.value ?? row.key ?? String(index + 1)),
        label: toText(row.label ?? row.text ?? row.value ?? row.id ?? entry),
      };
    })
    .filter((entry) => entry.id || entry.label);

const mapKeysFor = (step: Json): string[] => {
  const shape = asRecord(step.response_shape);
  if (Array.isArray(shape.keys) && shape.keys.length > 0) return shape.keys.map((entry) => toText(entry)).filter(Boolean);
  return ['1'];
};

interface Props {
  accessToken: string | null;
  item: ReviewItem;
  /** Called after an answer is saved (so lists can refresh their counts). */
  onAnswered?: (correct: boolean) => void;
}

/**
 * One missed question, brought back for review. Loads the real question on
 * demand, grades the answer on the server and shows the reschedule.
 */
export const ReviewItemCard = ({ accessToken, item, onAnswered }: Props) => {
  const t = useAppT();
  const fmt = useFormat();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ReviewItemDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [response, setResponse] = useState<Json>({});
  const [mockAnswer, setMockAnswer] = useState<number | string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [checking, setChecking] = useState(false);
  const [outcome, setOutcome] = useState<{ correct: boolean; correct_answer: string; explanation: string; item: ReviewItem } | null>(null);

  const load = async () => {
    if (!accessToken) return;
    setOpen(true);
    if (detail) return;
    setLoading(true);
    setError(null);
    try {
      setDetail(await practiceReviewItemGet(accessToken, item.id));
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 410) setGone(true);
      else setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  };

  const check = async () => {
    if (!accessToken || !detail) return;
    setChecking(true);
    setError(null);
    try {
      const body = detail.source_kind === 'generated_mock' ? { answer: mockAnswer } : response;
      const result = await practiceReviewItemAnswer(accessToken, item.id, body);
      setOutcome(result);
      onAnswered?.(result.correct);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setChecking(false);
    }
  };

  const step = asRecord(detail?.step);
  const shape = asRecord(step.response_shape);
  const kind = toText(shape.kind) || 'free_text';
  const mapKey = toText(shape.map_key) || 'answers';
  const context = asRecord(step.context);
  const passageText = toText(context.passage_text);
  const transcript = toText(context.transcript);
  const audioUrl = toText(context.audio_url);
  const answered = outcome != null;

  const renderLabAnswer = () => {
    const options = stepOptions(step);
    if (kind === 'single_choice' && options.length > 0) {
      return (
        <fieldset className="review-options">
          <legend className="field-label">{t('reviews.items.chooseOne')}</legend>
          {options.map((option) => (
            <label className="option-row" key={option.id}>
              <input
                type="radio"
                name={`review-${item.id}`}
                checked={toText(response.selected_option) === option.id}
                onChange={() => setResponse({ selected_option: option.id })}
                disabled={answered}
              />
              <span>{option.id && option.label !== option.id ? `${option.id}. ${option.label}` : option.label}</span>
            </label>
          ))}
        </fieldset>
      );
    }
    if (kind === 'multi_choice' && options.length > 0) {
      const selected = Array.isArray(response.selected_options) ? response.selected_options.map(String) : [];
      return (
        <div>
          {options.map((option) => (
            <label className="option-row" key={option.id}>
              <input
                type="checkbox"
                checked={selected.includes(option.id)}
                onChange={(event) => setResponse({
                  selected_options: event.target.checked ? [...new Set([...selected, option.id])] : selected.filter((id) => id !== option.id),
                })}
                disabled={answered}
              />
              <span>{option.id && option.label !== option.id ? `${option.id}. ${option.label}` : option.label}</span>
            </label>
          ))}
        </div>
      );
    }
    if (kind === 'map' || kind === 'gap_fill') {
      const values = asRecord(response[mapKey]);
      const template = toText(shape.template);
      return (
        <div className="lab-map-inputs">
          {template ? <p className="content-text">{template}</p> : null}
          {options.length > 0 ? (
            <ul className="review-option-legend">
              {options.map((option) => <li key={option.id}>{option.id}. {option.label}</li>)}
            </ul>
          ) : null}
          {mapKeysFor(step).map((key) => (
            <label key={key}>
              {key}
              <input
                className="practice-input"
                value={toText(values[key])}
                onChange={(event) => setResponse({ ...response, [mapKey]: { ...values, [key]: event.target.value } })}
                disabled={answered}
              />
            </label>
          ))}
        </div>
      );
    }
    return (
      <label>
        {t('reviews.items.yourAnswer')}
        <input className="practice-input" value={toText(response.answer)} onChange={(event) => setResponse({ answer: event.target.value })} disabled={answered} />
      </label>
    );
  };

  const renderMockAnswer = () => {
    const question = detail?.question;
    if (!question) return null;
    if (question.options.length === 0) {
      return (
        <label>
          {t('reviews.items.yourAnswer')}
          <input className="practice-input" value={String(mockAnswer ?? '')} onChange={(event) => setMockAnswer(event.target.value)} disabled={answered} />
        </label>
      );
    }
    return (
      <fieldset className="review-options">
        <legend className="field-label">{t('reviews.items.chooseOne')}</legend>
        {question.options.map((option, index) => (
          <label className="option-row" key={`${index}-${option}`}>
            <input type="radio" name={`review-${item.id}`} checked={mockAnswer === index} onChange={() => setMockAnswer(index)} disabled={answered} />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
    );
  };

  const nextBox = outcome?.item.leitner_box ?? item.leitner_box;

  return (
    <li className={`glass practice-card srs-review-row${outcome ? (outcome.correct ? ' review-correct' : ' review-wrong') : ''}`}>
      <div className="srs-review-row-head">
        <span className={`chip ${item.section_type}`}>{sectionLabel(t, item.section_type)}</span>
        <h3>{formatPracticeLabel(item.question_type)}</h3>
        <span className="muted srs-review-row-box">{t('common.box', { box: item.leitner_box })}</span>
      </div>
      <p className="muted review-item-source">
        {item.source_kind === 'generated_mock' ? t('reviews.items.fromMock') : t('reviews.items.fromLab')}
        {item.title ? ` · ${item.title}` : ''}
      </p>
      {item.prompt_excerpt && !open ? <p className="review-item-excerpt">{item.prompt_excerpt}</p> : null}

      {gone ? <p className="muted">{t('reviews.items.gone')}</p> : null}
      {error ? <p className="error-text" role="alert">{error}</p> : null}

      {!open && !gone ? (
        <div className="srs-review-row-actions">
          <button type="button" className="btn solid compact" onClick={() => void load()} disabled={!accessToken}>
            {t('reviews.items.answer')}
          </button>
        </div>
      ) : null}

      {open && loading ? <p className="muted">{t('reviews.items.loadingQuestion')}</p> : null}

      {open && detail && !gone ? (
        <div className="review-item-body">
          {detail.source_kind === 'generated_mock' && detail.passage ? (
            detail.section_type === 'listening' ? (
              <details>
                <summary>{t('reviews.items.showTranscript')}</summary>
                <div className="content-text">{detail.passage.body}</div>
              </details>
            ) : (
              <details open>
                <summary>{detail.passage.title || t('reviews.items.passage')}</summary>
                <div className="content-text lab-scroll-text">{detail.passage.body}</div>
              </details>
            )
          ) : null}
          {detail.source_kind === 'lab' && passageText ? (
            <details open>
              <summary>{toText(context.passage_title) || t('reviews.items.passage')}</summary>
              <div className="content-text lab-scroll-text">{passageText}</div>
            </details>
          ) : null}
          {detail.source_kind === 'lab' && (audioUrl || transcript) ? (
            <div className="review-item-audio">
              <p className="field-label">{t('reviews.items.listen')}</p>
              {audioUrl ? <audio controls src={audioUrl} className="practice-audio" /> : <p className="muted">{t('reviews.items.noAudio')}</p>}
              {transcript ? (
                <button type="button" className="btn ghost compact" onClick={() => setShowTranscript((value) => !value)}>
                  {t('reviews.items.showTranscript')}
                </button>
              ) : null}
              {showTranscript ? <div className="content-text">{transcript}</div> : null}
            </div>
          ) : null}

          <p className="review-item-prompt">
            {detail.source_kind === 'generated_mock' ? detail.question?.prompt : toText(step.prompt)}
          </p>
          {detail.source_kind === 'generated_mock' ? renderMockAnswer() : renderLabAnswer()}

          {outcome ? (
            <div className="review-item-outcome" role="status">
              <p>
                {outcome.correct ? <CheckCircle2 size={15} aria-hidden="true" /> : <XCircle size={15} aria-hidden="true" />}{' '}
                {outcome.correct
                  ? outcome.item.is_archived
                    ? t('reviews.items.mastered')
                    : t('reviews.items.correct', { box: nextBox, when: fmt.date(outcome.item.next_review_at) })
                  : t('reviews.items.wrong')}
              </p>
              {outcome.correct_answer ? <p>{t('reviews.items.correctAnswer', { answer: outcome.correct_answer })}</p> : null}
              {outcome.explanation ? <p className="muted">{t('reviews.items.why', { text: outcome.explanation })}</p> : null}
            </div>
          ) : (
            <div className="srs-review-row-actions">
              <button type="button" className="btn solid compact" onClick={() => void check()} disabled={checking}>
                {checking ? t('reviews.items.checking') : t('reviews.items.check')}
              </button>
              <button type="button" className="btn ghost compact" onClick={() => setOpen(false)}>{t('reviews.items.hide')}</button>
            </div>
          )}
        </div>
      ) : null}
    </li>
  );
};
