import { useEffect, useRef, useState } from "react";
import {
  canonicalJson,
  type Definition,
} from "../../../../packages/assessment-core/src/mod.ts";
import { request } from "../../../../packages/assessment-web/src/client";
type Example = {
  feasible: boolean;
  notice: string;
  sections: {
    id: string;
    title: string;
    questions: number;
    points: number;
    rules: {
      id: string;
      label: string;
      matched: number;
      minimum: number;
      maximum: number;
    }[];
  }[];
};
export function BlueprintPreview(
  { definition, tenant, actor, disabled }: {
    definition: Definition | undefined;
    tenant: string;
    actor: string;
    disabled: boolean;
  },
) {
  const [busy, setBusy] = useState(false),
    [example, setExample] = useState<Example | null>(null),
    [error, setError] = useState(""),
    generation = useRef(0),
    fingerprint = definition ? canonicalJson(definition) : "";
  useEffect(() => {
    generation.current++;
    setBusy(false);
    setExample(null);
    setError("");
    return () => {
      generation.current++;
    };
  }, [fingerprint, tenant, actor]);
  async function check() {
    if (!definition || busy || disabled) return;
    const epoch = ++generation.current;
    setBusy(true);
    setError("");
    setExample(null);
    try {
      const result = await request<Example>(
        "blueprints/preview",
        tenant,
        { action: "blueprint.preview", data: { definition } },
        undefined,
        undefined,
        actor,
      );
      if (epoch === generation.current) setExample(result);
    } catch (cause) {
      if (epoch === generation.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Blueprint feasibility could not be confirmed.",
        );
      }
    } finally {
      if (epoch === generation.current) setBusy(false);
    }
  }
  if (!definition?.sections.some((section) => section.blueprint)) return null;
  return (
    <div className="blueprint-preview">
      <h3>Check blueprint feasibility</h3>
      <p>
        Check all pinned approved versions together before saving. This produces
        a satisfying example, not a candidate’s future form. Saving and
        publishing repeat the check on the server.
      </p>
      <button
        type="button"
        className="quiet"
        disabled={disabled || busy}
        onClick={() => void check()}
      >
        Check constrained form
      </button>
      {busy && <p role="status">Checking overlapping requirements…</p>}
      {error && (
        <p className="error" role="alert">
          {error} No feasible form has been confirmed.
        </p>
      )}
      {example && (
        <div role="status">
          <h4>Blueprint requirements can be satisfied</h4>
          <p>{example.notice}</p>
          {example.sections.map((section) => (
            <div key={section.id}>
              <h4>{section.title}</h4>
              <p>
                {section.questions} selected questions · {section.points} points
              </p>
              <ul>
                {section.rules.map((rule) => (
                  <li key={rule.id}>
                    {rule.label}: {rule.matched} matched (required{" "}
                    {rule.minimum}–{rule.maximum})
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
