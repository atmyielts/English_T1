import React from "react";
import { type SectionDraft } from "../../../../packages/assessment-core/src/design.ts";
import { QuestionPicker } from "./QuestionPicker";
import {BlueprintEditor} from "./BlueprintEditor";
import type { Row } from "../../../../packages/assessment-web/src/client";
import { useAppT } from "../i18n/index.ts";
export function SectionEditor({
  section,
  index,
  total,
  questions,
  used,
  disabled,
  change,
  move,
  remove,
}: {
  section: SectionDraft;
  index: number;
  total: number;
  questions: Row[];
  used: Set<string>;
  disabled: boolean;
  change: (s: SectionDraft) => void;
  move: (offset: number) => void;
  remove: () => void;
}) {
  const t = useAppT();
  return (
    <fieldset className="design-section" disabled={disabled}>
      <legend>{t("section.legend", { section: index + 1 })}</legend>
      <div className="design-fields">
        <label>
          {t("section.title", { section: index + 1 })}
          <input
            maxLength={200}
            required
            value={section.title}
            onChange={(e) => change({ ...section, title: e.target.value })}
          />
        </label>
        <label>
          {t("section.seconds", { section: index + 1 })}
          <input
            type="number"
            min={1}
            max={86400}
            placeholder={t("section.overall")}
            value={section.seconds}
            onChange={(e) => change({ ...section, seconds: e.target.value })}
          />
        </label>
        <label>
          {t("section.selection", { section: index + 1 })}
          <select
            value={section.selection}
            onChange={(e) =>
              change({
                ...section,
                selection: e.target.value as SectionDraft["selection"],
              })
            }
          >
            <option value="fixed">{t("section.fixed")}</option>
            <option value="pool">{t("section.pool")}</option>
          </select>
        </label>
        {section.selection === "pool" && (
          <label>
            {t("section.drawn", { section: index + 1 })}
            <input
              type="number"
              min={1}
              max={section.items.length || 1}
              required
              value={section.draw}
              onChange={(e) => change({ ...section, draw: e.target.value })}
            />
          </label>
        )}
      </div>
      <p>
        {t("section.hint")}
      </p>
      <div className="design-actions">
        <button
          type="button"
          className="quiet"
          disabled={index === 0}
          onClick={() => move(-1)}
        >
          {t("section.earlier", { section: index + 1 })}
        </button>
        <button
          type="button"
          className="quiet"
          disabled={index === total - 1}
          onClick={() => move(1)}
        >
          {t("section.later", { section: index + 1 })}
        </button>
        <button
          type="button"
          className="quiet"
          disabled={total === 1}
          onClick={remove}
        >
          {t("section.remove", { section: index + 1 })}
        </button>
      </div>
      <QuestionPicker
        section={section}
        index={index}
        questions={questions}
        used={used}
        change={change}
      />
      <BlueprintEditor section={section} index={index} questions={questions} change={change}/>
    </fieldset>
  );
}
