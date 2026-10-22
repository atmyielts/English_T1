import React from "react";
import type { Definition } from "../../../../packages/assessment-core/src/mod.ts";
import { useAppT, useCodeText } from "../i18n/index.ts";
export function DefinitionSummary({ definition }: { definition: Definition }) {
  const t = useAppT(), codeText = useCodeText();
  return (
    <div className="definition-summary">
      <p>
        {t("summary.overview", { locale: definition.locale.toUpperCase(), seconds: String(definition.duration_seconds), questionOrder: definition.shuffle_items ? t("summary.randomized") : t("summary.authorOrder"), optionOrder: definition.shuffle_options
          ? t("summary.randomized")
          : t("summary.authorOrderOptions") })}
      </p>
      <ol>
        {definition.sections.map((s) => (
          <li key={s.id}>
            <strong>{s.title}</strong>
            <p>
              {t("summary.section", { draw: String(s.draw_count ?? s.item_version_ids.length), count: String(s.item_version_ids.length), timing: s.duration_seconds === undefined
                ? t("summary.overallOnly")
                : t("summary.sectionSeconds", { seconds: String(s.duration_seconds) }) })}
            </p>
            {s.blueprint && (
              <>
                <p>
                  {t("summary.range", { minimum: String(s.blueprint.minimum_points ?? 0), maximum: s.blueprint.maximum_points == null ? t("summary.noUpper") : String(s.blueprint.maximum_points) })}
                </p>
                <ul>
                  {s.blueprint.rules.map((rule) => (
                    <li key={rule.id}>
                      {t("summary.rule", { label: rule.label, minimum: String(rule.minimum), maximum: String(rule.maximum), topics: rule.topics.join(" · ") || t("summary.any"), match: rule.all_topics ? t("summary.all") : t("summary.any"), difficulties: rule.difficulties.map((value) => codeText("difficulty", value)).join(", ") || t("summary.any"), types: rule.types.join(", ") || t("summary.any") })}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
