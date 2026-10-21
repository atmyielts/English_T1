import React from "react";
import type { Definition } from "../../../../packages/assessment-core/src/mod.ts";
export function DefinitionSummary({ definition }: { definition: Definition }) {
  return (
    <div className="definition-summary">
      <p>
        {definition.locale.toUpperCase()} · Overall{" "}
        {definition.duration_seconds} seconds · Question order:{" "}
        {definition.shuffle_items ? "randomized" : "author order"}{" "}
        · Option order: {definition.shuffle_options
          ? "randomized"
          : "author order (ordering tasks excluded)"}
      </p>
      <ol>
        {definition.sections.map((s) => (
          <li key={s.id}>
            <strong>{s.title}</strong>
            <p>
              {s.draw_count ?? s.item_version_ids.length} questions from{" "}
              {s.item_version_ids.length} pinned approved versions ·{" "}
              {s.duration_seconds === undefined
                ? "Overall deadline only"
                : `${s.duration_seconds} seconds for this section`}
            </p>
            {s.blueprint && (
              <>
                <p>
                  Blueprint point range: {s.blueprint.minimum_points ?? 0} to
                  {" "}
                  {s.blueprint.maximum_points ?? "no additional upper bound"}.
                  All quotas apply together; estimated difficulty is not
                  calibration.
                </p>
                <ul>
                  {s.blueprint.rules.map((rule) => (
                    <li key={rule.id}>
                      {rule.label}: {rule.minimum}–{rule.maximum}{" "}
                      questions · Topics: {rule.topics.join(" · ") || "any"}
                      {" "}
                      ({rule.all_topics ? "all" : "any"}) · Estimated
                      difficulty: {rule.difficulties.join(", ") || "any"}{" "}
                      · Types: {rule.types.join(", ") || "any"}
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
