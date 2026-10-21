import React, { useRef, useState } from "react";
import {
  moveDesignEntry,
  type SectionDraft,
} from "../../../../packages/assessment-core/src/design.ts";
import type { Row } from "../../../../packages/assessment-web/src/client";
import { useAppT } from "../i18n/index.ts";
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
  const t = useAppT();
  const [filter, setFilter] = useState(""),
    heading = useRef<HTMLHeadingElement>(null);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const prompt = (id: string) =>
    String(
      (byId.get(id)?.payload as { prompt?: string })?.prompt ??
        t("picker.unavailable", { id }),
    );
  return (
    <>
      <h3 tabIndex={-1} ref={heading}>
        {t("picker.selected", { count: String(section.items.length) })}
      </h3>
      <p role="status">
        {t("picker.selectedStatus", { count: section.items.length, section: index + 1 })}
      </p>
      {!section.items.length && (
        <p>{t("picker.none")}</p>
      )}
      <ol className="design-selected">
        {section.items.map((id, n) => (
          <li key={id}>
            <p>
              {prompt(id)}{" "}
              <small>{t("picker.version", { version: String(byId.get(id)?.version ?? "?") })}</small>
            </p>
            <div className="design-actions">
              <button
                type="button"
                className="quiet"
                disabled={n === 0}
                aria-label={t("picker.earlierLabel", { number: n + 1, section: index + 1 })}
                onClick={() =>
                  change({
                    ...section,
                    items: moveDesignEntry(section.items, n, n - 1),
                  })
                }
              >
                {t("picker.earlier")}
              </button>
              <button
                type="button"
                className="quiet"
                disabled={n === section.items.length - 1}
                aria-label={t("picker.laterLabel", { number: n + 1, section: index + 1 })}
                onClick={() =>
                  change({
                    ...section,
                    items: moveDesignEntry(section.items, n, n + 1),
                  })
                }
              >
                {t("picker.later")}
              </button>
              <button
                type="button"
                className="quiet"
                aria-label={t("picker.removeLabel", { number: n + 1, section: index + 1 })}
                onClick={() => {
                  change({
                    ...section,
                    items: section.items.filter((v) => v !== id),
                  });
                  heading.current?.focus();
                }}
              >
                {t("picker.remove")}
              </button>
            </div>
          </li>
        ))}
      </ol>
      <label>
        {t("picker.find", { section: index + 1 })}
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
                  {t("picker.version", { version: String(q.version) })}
                  {used.has(q.id!) ? t("picker.elsewhere") : ""}
                </small>
              </span>
              <button
                type="button"
                className="quiet"
                aria-label={t("picker.addLabel", { prompt: prompt(q.id!), version: String(q.version), section: index + 1 })}
                disabled={used.has(q.id!) || section.items.length >= 500}
                onClick={() => {
                  change({ ...section, items: [...section.items, q.id!] });
                  heading.current?.focus();
                }}
              >
                {t("picker.add")}
              </button>
            </div>
          ))}
      </div>
      {!questions.length && (
        <p>{t("picker.approveFirst")}</p>
      )}
    </>
  );
}
