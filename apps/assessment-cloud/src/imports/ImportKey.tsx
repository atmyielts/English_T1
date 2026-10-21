import type { AnswerKey } from "../../../../packages/assessment-core/src/mod.ts";
export function ImportKey({ answer }: { answer: AnswerKey }) {
  const correct = answer.correct;
  return (
    <>
      <p>
        {answer.numeric
          ? `Numeric answer: ${answer.numeric.value}; tolerance: ${answer.numeric.tolerance}`
          : typeof correct === "string"
          ? `Correct answer: ${correct}`
          : Array.isArray(correct)
          ? `Accepted answers / option order: ${correct.join(" · ")}`
          : correct
          ? "Answers by response field:"
          : "Human marking with the referenced rubric."}
      </p>
      {correct && typeof correct === "object" && !Array.isArray(correct) && (
        <dl>
          {Object.entries(correct).map(([id, value]) => (
            <div key={id}>
              <dt>{id}</dt>
              <dd>{Array.isArray(value) ? value.join(" · ") : value}</dd>
            </div>
          ))}
        </dl>
      )}
      {correct && (
        <p>
          {answer.case_sensitive
            ? "Case-sensitive answers."
            : "Case-insensitive answers."} {answer.partial_credit
            ? "Partial credit enabled."
            : "All-or-nothing scoring."}
        </p>
      )}
    </>
  );
}
