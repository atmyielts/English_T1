import type { SatQuestion } from '../lib/api';

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

export const QuestionCard = (props: {
  question: SatQuestion;
  value?: unknown;
  readOnly?: boolean;
  onChange?: (value: unknown) => void;
}) => {
  const prompt = String(props.question.data.prompt ?? props.question.data.text ?? 'SAT question');
  const options = optionsFrom(props.question);
  const selected = typeof props.value === 'string'
    ? props.value
    : props.value && typeof props.value === 'object'
      ? String((props.value as Record<string, unknown>).selected_option ?? (props.value as Record<string, unknown>).option_id ?? '')
      : '';
  const answer = props.value && typeof props.value === 'object'
    ? (props.value as Record<string, unknown>).text ?? (props.value as Record<string, unknown>).value
    : props.value;
  const text = typeof answer === 'string' || typeof answer === 'number' ? String(answer) : '';
  const promptId = `question-prompt-${props.question.id}`;

  if (options.length > 0) {
    return (
      <article className="question-card">
        <p className="question-prompt">{prompt}</p>
        <div className="option-list">
          {options.map((option) => (
            <label key={option.id} className={`option-row${selected === option.id ? ' selected' : ''}`}>
              <input
                type="radio"
                name={props.question.id}
                checked={selected === option.id}
                disabled={props.readOnly}
                onChange={() => props.onChange?.({ selected_option: option.id })}
              />
              <span>{option.id}</span>
              <strong>{option.label}</strong>
            </label>
          ))}
        </div>
      </article>
    );
  }

  return (
    <article className="question-card">
      <p id={promptId} className="question-prompt">{prompt}</p>
      {props.readOnly ? (props.value != null ? <p><strong>Your answer:</strong> {text || 'No answer entered'}</p> : null) : <textarea
        rows={4}
        aria-label="Your answer"
        aria-describedby={promptId}
        value={text}
        onChange={(event) => props.onChange?.({ text: event.target.value })}
      />}
    </article>
  );
};
