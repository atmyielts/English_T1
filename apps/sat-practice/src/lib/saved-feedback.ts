type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue | null =>
  value != null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : null;
const text = (value: unknown): string | null => {
  if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) return null;
  const result = String(value).trim();
  return result && result.length <= 4096 ? result : null;
};

export type SavedFeedback = { correct: boolean; expected: string | null; explanation: string | null };

export function savedAnswerText(value: unknown): string {
  const answer = object(value);
  if (answer && !['selected_option', 'option_id', 'text', 'value'].some(key => Object.prototype.hasOwnProperty.call(answer, key))) {
    return 'The saved answer format is unavailable.';
  }
  const recorded = answer ? answer.selected_option ?? answer.option_id ?? answer.text ?? answer.value : value;
  if (recorded == null || recorded === '') return 'No answer entered.';
  return text(recorded) ?? 'The saved answer format is unavailable.';
}

// Display the original scorer's recorded outcome and expected answer. Never
// recalculate against a current question key or infer an original legacy prompt.
export function savedFeedback(
  attempt: { status: string; scored_items: unknown[] },
  question: { id: string; data: ObjectValue },
  immutableResultConfirmed: boolean,
): SavedFeedback | null {
  if (!immutableResultConfirmed || attempt.status !== 'scored' || !Array.isArray(attempt.scored_items)) return null;
  const matches = attempt.scored_items.map(object).filter(row => row?.question_id === question.id);
  if (matches.length !== 1 || typeof matches[0]?.correct !== 'boolean') return null;
  const row = matches[0]!;
  const key = object(row.expected);
  const value = key ? key.option_id ?? key.selected_option ?? key.correct ?? key.text ?? key.value : row.expected;
  const values = Array.isArray(value) ? value : [value];
  const tokens = values.map(text);
  const options = Array.isArray(question.data.options) ? question.data.options.map(object).filter(Boolean) : [];
  const expected = tokens.length > 0 && tokens.every(token => token != null)
    ? [...new Set(tokens)].map(token => {
      const option = options.find(option => text(option?.id) === token);
      const label = text(option?.label);
      return label ? token + ': ' + label : token;
    }).join(' or ') : null;
  return { correct: row.correct as boolean, expected, explanation: text(object(key?.feedback)?.explanation) };
}
