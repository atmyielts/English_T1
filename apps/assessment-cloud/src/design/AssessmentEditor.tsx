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
import { useAppT } from "../i18n/index.ts";
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
  const t = useAppT();
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
          t("design.unavailableQuestion"),
        );
      if (revision && !ready.value.reason.trim())
        throw new Error(t("design.explainChange"));
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
          : t("design.saveFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <section className="editor assessment-editor">
      <h2 tabIndex={-1} ref={heading}>
        {revision
          ? t("design.editTitle", { revision: String(revision.revision) })
          : t("design.buildTitle")}
      </h2>
      <p>
        {t("design.lead")}
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
          <legend>{t("design.settings")}</legend>
          <div className="design-fields">
            <label>
              {t("design.title")}
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
              {t("design.language")}
              <select
                value={draft.value.locale}
                onChange={(e) =>
                  change({
                    ...draft.value,
                    locale: e.target.value as AssessmentDraft["locale"],
                  })
                }
              >
                <option value="en">{t("fields.langEn")}</option>
                <option value="uz">{t("fields.langUz")}</option>
                <option value="ru">{t("fields.langRu")}</option>
              </select>
            </label>
            <label>
              {t("design.seconds")}
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
            {t("design.shuffleItems")}
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.value.shuffleOptions}
              onChange={(e) =>
                change({ ...draft.value, shuffleOptions: e.target.checked })
              }
            />
            {t("design.shuffleOptions")}
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
          {t("design.addSection")}
        </button>
        {revision && (
          <label>
            {t("design.reason")}
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
            {revision ? t("design.saveRevision") : t("design.saveDraft")}
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
            {t("design.review")}
          </button>
          <button
            type="button"
            className="quiet"
            disabled={disabled}
            onClick={cancel}
          >
            {t("design.close")}
          </button>
        </div>
      </form>
      {preview && definition && (
        <>
          <h3>{t("design.previewTitle")}</h3>
          <DefinitionSummary definition={definition} />
          <p>
            {t("design.previewNote")}
          </p>
        </>
      )}
    </section>
  );
}
