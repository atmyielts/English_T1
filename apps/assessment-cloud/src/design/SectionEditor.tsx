import React from "react";
import { type SectionDraft } from "../../../../packages/assessment-core/src/design.ts";
import { QuestionPicker } from "./QuestionPicker";
import {BlueprintEditor} from "./BlueprintEditor";
import type { Row } from "../../../../packages/assessment-web/src/client";
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
  return (
    <fieldset className="design-section" disabled={disabled}>
      <legend>Section {index + 1}</legend>
      <div className="design-fields">
        <label>
          Section title {index + 1}
          <input
            maxLength={200}
            required
            value={section.title}
            onChange={(e) => change({ ...section, title: e.target.value })}
          />
        </label>
        <label>
          Section time in seconds {index + 1}
          <input
            type="number"
            min={1}
            max={86400}
            placeholder="Use overall deadline"
            value={section.seconds}
            onChange={(e) => change({ ...section, seconds: e.target.value })}
          />
        </label>
        <label>
          Question selection {index + 1}
          <select
            value={section.selection}
            onChange={(e) =>
              change({
                ...section,
                selection: e.target.value as SectionDraft["selection"],
              })
            }
          >
            <option value="fixed">Include every selected question</option>
            <option value="pool">Randomly draw from this pool</option>
          </select>
        </label>
        {section.selection === "pool" && (
          <label>
            Questions drawn {index + 1}
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
        Optional section time starts when the section opens and is capped by the
        overall exam deadline. Sections advance in this order; candidates cannot
        return to an earlier section.
      </p>
      <div className="design-actions">
        <button
          type="button"
          className="quiet"
          disabled={index === 0}
          onClick={() => move(-1)}
        >
          Move section {index + 1} earlier
        </button>
        <button
          type="button"
          className="quiet"
          disabled={index === total - 1}
          onClick={() => move(1)}
        >
          Move section {index + 1} later
        </button>
        <button
          type="button"
          className="quiet"
          disabled={total === 1}
          onClick={remove}
        >
          Remove section {index + 1}
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
