import React, { useEffect, useRef, useState, type FormEvent } from "react";
import {
  blankSection,
  buildAssessment,
  moveDesignEntry,
  restoreAssessment,
  type AssessmentDraft,
} from "../../../../packages/assessment-core/src/design.ts";
import { useEncryptedDraft } from "../../../../packages/assessment-web/src/useEncryptedDraft";
import { DraftStatus } from "../../../../packages/assessment-web/src/DraftStatus";
import type { Row } from "../../../../packages/assessment-web/src/client";
import { SectionEditor } from "./SectionEditor";
import { DefinitionSummary } from "./DefinitionSummary";
import {BlueprintPreview} from "./BlueprintPreview";
export function AssessmentEditor({
  initial,
  tenant,
  actor,
  source,
  revision,
  questions,
  busy,
  save,
  cancel,
}: {
  initial: AssessmentDraft;
  tenant: string;
  actor: string;
  source: string;
  revision?: { id: string; revision: number };
  questions: Row[];
  busy: boolean;
  save: (action: string, data: Record<string, unknown>) => Promise<boolean>;
  cancel: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const draft = useEncryptedDraft(
    `authoring:${tenant}:${actor}:assessment:${revision?.id ?? "new"}`,
    source,
    initial,
    restoreAssessment,
  );
  const [error, setError] = useState(""),
    [preview, setPreview] = useState(false),
    [submitting, setSubmitting] = useState(false);
  const disabled = busy || submitting,
    change = (value: AssessmentDraft) => {
      draft.update(value);
      setPreview(false);
      setError("");
    };
  let definition;
  try {
    definition = buildAssessment(draft.value);
  } catch {
    /* Incomplete device drafts remain editable. */
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (disabled || draft.blocked) return;
    setSubmitting(true);
    setError("");
    try {
      const ready = await draft.prepare(),
        definition = buildAssessment(ready.value);
      if (
        definition.sections
          .flatMap((s) => s.item_version_ids)
          .some((id) => !questions.some((q) => q.id === id))
      )
        throw new Error(
          "A selected question is no longer available as an approved institution version.",
        );
      if (revision && !ready.value.reason.trim())
        throw new Error("Explain why the working definition is changing.");
      if (
        await save(revision ? "assessment.revise" : "assessment.create", {
          definition,
          ...(revision
            ? { ...revision, reason: ready.value.reason.trim() }
            : {}),
          _draft: ready.token,
        })
      )
        cancel();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The assessment could not be saved.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <section className="editor assessment-editor">
      <h2 tabIndex={-1} ref={heading}>
        {revision
          ? `Edit working revision ${revision.revision}`
          : "Build an assessment"}
      </h2>
      <p>
        Published versions, registered sittings and candidate forms remain
        unchanged. Saving updates only the working definition; publishing is a
        separate permission-controlled action.
      </p>
      <DraftStatus
        {...draft}
        loadSaved={draft.loadSaved}
        discard={draft.discard}
        retry={draft.retry}
        disabled={disabled}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <form onSubmit={submit}>
        <fieldset disabled={disabled || draft.blocked}>
          <legend>Assessment settings</legend>
          <div className="design-fields">
            <label>
              Assessment title
              <input
                required
                maxLength={200}
                value={draft.value.title}
                onChange={(e) =>
                  change({ ...draft.value, title: e.target.value })
                }
              />
            </label>
            <label>
              Assessment language
              <select
                value={draft.value.locale}
                onChange={(e) =>
                  change({
                    ...draft.value,
                    locale: e.target.value as AssessmentDraft["locale"],
                  })
                }
              >
                <option value="en">English</option>
                <option value="uz">Uzbek</option>
                <option value="ru">Russian</option>
              </select>
            </label>
            <label>
              Overall time in seconds
              <input
                required
                type="number"
                min={60}
                max={86400}
                value={draft.value.seconds}
                onChange={(e) =>
                  change({ ...draft.value, seconds: e.target.value })
                }
              />
            </label>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.value.shuffleItems}
              onChange={(e) =>
                change({ ...draft.value, shuffleItems: e.target.checked })
              }
            />
            Randomize question order within each section
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.value.shuffleOptions}
              onChange={(e) =>
                change({ ...draft.value, shuffleOptions: e.target.checked })
              }
            />
            Randomize answer options (not ordering tasks)
          </label>
        </fieldset>
        {draft.value.sections.map((s, i) => (
          <SectionEditor
            key={s.id}
            section={s}
            index={i}
            total={draft.value.sections.length}
            questions={questions}
            used={
              new Set(
                draft.value.sections
                  .filter((v) => v.id !== s.id)
                  .flatMap((v) => v.items),
              )
            }
            disabled={disabled || draft.blocked}
            change={(next) =>
              change({
                ...draft.value,
                sections: draft.value.sections.map((v) =>
                  v.id === s.id ? next : v,
                ),
              })
            }
            move={(offset) =>
              change({
                ...draft.value,
                sections: moveDesignEntry(draft.value.sections, i, i + offset),
              })
            }
            remove={() =>
              change({
                ...draft.value,
                sections: draft.value.sections.filter((v) => v.id !== s.id),
              })
            }
          />
        ))}
        <button
          type="button"
          className="quiet"
          disabled={
            disabled || draft.blocked || draft.value.sections.length >= 50
          }
          onClick={() =>
            change({
              ...draft.value,
              sections: [...draft.value.sections, blankSection()],
            })
          }
        >
          Add section
        </button>
        {revision && (
          <label>
            Revision reason
            <textarea
              required
              maxLength={2000}
              disabled={disabled}
              value={draft.value.reason}
              onChange={(e) =>
                change({ ...draft.value, reason: e.target.value })
              }
            />
          </label>
        )}
        <BlueprintPreview definition={definition} tenant={tenant} actor={actor} disabled={disabled||draft.blocked}/>
        <div className="design-actions">
          <button disabled={disabled || draft.blocked}>
            {revision ? "Save working revision" : "Save assessment draft"}
          </button>
          <button
            type="button"
            className="quiet"
            disabled={disabled || draft.blocked}
            onClick={() => {
              try {
                buildAssessment(draft.value);
                setPreview(true);
                setError("");
              } catch (cause) {
                setError(
                  String(cause instanceof Error ? cause.message : cause),
                );
              }
            }}
          >
            Review structure
          </button>
          <button
            type="button"
            className="quiet"
            disabled={disabled}
            onClick={cancel}
          >
            Close assessment editor
          </button>
        </div>
      </form>
      {preview && definition && (
        <>
          <h3>Structure preview</h3>
          <DefinitionSummary definition={definition} />
          <p>
            Random pools are sampled once when a candidate starts. The saved
            form fixes that selection for the entire attempt. This is not an
            adaptive or difficulty-balanced blueprint.
          </p>
        </>
      )}
    </section>
  );
}
