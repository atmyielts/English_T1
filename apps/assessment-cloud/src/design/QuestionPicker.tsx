import React, { useRef, useState } from "react";
import {
  moveDesignEntry,
  type SectionDraft,
} from "../../../../packages/assessment-core/src/design.ts";
import type { Row } from "../../../../packages/assessment-web/src/client";
export function QuestionPicker({
  section,
  index,
  questions,
  used,
  change,
}: {
  section: SectionDraft;
  index: number;
  questions: Row[];
  used: Set<string>;
  change: (s: SectionDraft) => void;
}) {
  const [filter, setFilter] = useState(""),
    heading = useRef<HTMLHeadingElement>(null);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const prompt = (id: string) =>
    String(
      (byId.get(id)?.payload as { prompt?: string })?.prompt ??
        `Unavailable question version ${id}`,
    );
  return (
    <>
      <h3 tabIndex={-1} ref={heading}>
        Selected question versions ({section.items.length})
      </h3>
      <p role="status">
        {section.items.length} question versions selected for section{" "}
        {index + 1}.
      </p>
      {!section.items.length && (
        <p>No questions selected. Choose approved versions below.</p>
      )}
      <ol className="design-selected">
        {section.items.map((id, n) => (
          <li key={id}>
            <p>
              {prompt(id)}{" "}
              <small>Version {String(byId.get(id)?.version ?? "?")}</small>
            </p>
            <div className="design-actions">
              <button
                type="button"
                className="quiet"
                disabled={n === 0}
                aria-label={`Move question ${n + 1} earlier in section ${index + 1}`}
                onClick={() =>
                  change({
                    ...section,
                    items: moveDesignEntry(section.items, n, n - 1),
                  })
                }
              >
                Earlier
              </button>
              <button
                type="button"
                className="quiet"
                disabled={n === section.items.length - 1}
                aria-label={`Move question ${n + 1} later in section ${index + 1}`}
                onClick={() =>
                  change({
                    ...section,
                    items: moveDesignEntry(section.items, n, n + 1),
                  })
                }
              >
                Later
              </button>
              <button
                type="button"
                className="quiet"
                aria-label={`Remove question ${n + 1} from section ${index + 1}`}
                onClick={() => {
                  change({
                    ...section,
                    items: section.items.filter((v) => v !== id),
                  });
                  heading.current?.focus();
                }}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ol>
      <label>
        Find approved questions for section {index + 1}
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </label>
      <div className="design-pool">
        {questions
          .filter(
            (q) =>
              !section.items.includes(q.id!) &&
              prompt(q.id!)
                .toLocaleLowerCase()
                .includes(filter.toLocaleLowerCase()),
          )
          .map((q) => (
            <div className="design-question-choice" key={q.id}>
              <span>
                {prompt(q.id!)}{" "}
                <small>
                  Version {String(q.version)}
                  {used.has(q.id!) ? " · Already in another section" : ""}
                </small>
              </span>
              <button
                type="button"
                className="quiet"
                aria-label={`Add ${prompt(q.id!)} (version ${q.version}) to section ${index + 1}`}
                disabled={used.has(q.id!) || section.items.length >= 500}
                onClick={() => {
                  change({ ...section, items: [...section.items, q.id!] });
                  heading.current?.focus();
                }}
              >
                Add question
              </button>
            </div>
          ))}
      </div>
      {!questions.length && (
        <p>Approve institution questions before creating an assessment.</p>
      )}
    </>
  );
}
