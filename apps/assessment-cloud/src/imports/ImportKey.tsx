import type { AnswerKey } from "../../../../packages/assessment-core/src/mod.ts";
import { useAppT } from "../i18n/index.ts";
export function ImportKey({ answer }: { answer: AnswerKey }) {
  const t = useAppT();
  const correct = answer.correct;
  return (
    <>
      <p>
        {answer.numeric
          ? t("key.numeric", { value: String(answer.numeric.value), tolerance: String(answer.numeric.tolerance) })
          : typeof correct === "string"
          ? t("key.correct", { answer: correct })
          : Array.isArray(correct)
          ? t("key.accepted", { answers: correct.join(" · ") })
          : correct
          ? t("key.byField")
          : t("key.human")}
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
            ? t("key.caseSensitive")
            : t("key.caseInsensitive")} {answer.partial_credit
            ? t("key.partial")
            : t("key.allOrNothing")}
        </p>
      )}
    </>
  );
}
