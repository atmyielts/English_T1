import { useEffect, useRef, useState } from "react";
import {
  canonicalJson,
  type Definition,
} from "../../../../packages/assessment-core/src/mod.ts";
import { request } from "../../../../packages/assessment-web/src/client";
import { useAppT, useErrorText } from "../i18n/index.ts";
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
  const t = useAppT(), problem = useErrorText();
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
        setError(problem(cause, "feasibility.failed"));
      }
    } finally {
      if (epoch === generation.current) setBusy(false);
    }
  }
  if (!definition?.sections.some((section) => section.blueprint)) return null;
  return (
    <div className="blueprint-preview">
      <h3>{t("feasibility.title")}</h3>
      <p>
        {t("feasibility.lead")}
      </p>
      <button
        type="button"
        className="quiet"
        disabled={disabled || busy}
        onClick={() => void check()}
      >
        {t("feasibility.check")}
      </button>
      {busy && <p role="status">{t("feasibility.checking")}</p>}
      {error && (
        <p className="error" role="alert">
          {t("feasibility.error", { error })}
        </p>
      )}
      {example && (
        <div role="status">
          <h4>{t("feasibility.ok")}</h4>
          <p>{example.notice}</p>
          {example.sections.map((section) => (
            <div key={section.id}>
              <h4>{section.title}</h4>
              <p>
                {t("feasibility.section", { questions: String(section.questions), points: String(section.points) })}
              </p>
              <ul>
                {section.rules.map((rule) => (
                  <li key={rule.id}>
                    {t("feasibility.rule", { label: rule.label, matched: String(rule.matched), minimum: String(rule.minimum), maximum: String(rule.maximum) })}
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
