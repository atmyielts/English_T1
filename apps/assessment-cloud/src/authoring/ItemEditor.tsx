import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  buildItemDraft,
  restoreItemDraft,
  type ItemDraft,
} from "../../../../packages/assessment-core/src/authoring.ts";
import { QuestionResponse } from "../../../../packages/assessment-web/src/QuestionResponse";
import { QuestionMedia } from "../../../../packages/assessment-web/src/QuestionMedia";
import { MediaPicker } from "../media/MediaPicker";
import type { Row } from "../../../../packages/assessment-web/src/client";
import { ItemFields } from "./ItemFields";
import {useEncryptedDraft} from '../../../../packages/assessment-web/src/useEncryptedDraft';
import {DraftStatus} from '../../../../packages/assessment-web/src/DraftStatus';
import {ImageInteractionFields} from './ImageInteractionFields';
export function ItemEditor({
  initial,
  tenant,
  actor,
  banks,
  rubrics,
  revision,
  busy,
  save,
  cancel,
}: {
  initial: ItemDraft;
  tenant:string;
  actor:string;
  banks: Row[];
  rubrics: Row[];
  revision?: { itemId: string; bankId: string; version: number; versionId:string; reviewHash:string };
  busy: boolean;
  save: (data: Record<string, unknown>, revision: boolean) => Promise<boolean>;
  cancel: () => void;
}) {
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{if(revision)heading.current?.focus();},[]);
  const encrypted=useEncryptedDraft(`authoring:${tenant}:${actor}:item:${revision?.versionId??'new'}`,revision?.reviewHash??'question-editor.v1',{draft:initial,bank:revision?.bankId??''},value=>{const row=value as {draft:unknown;bank:unknown};if(!row||typeof row.bank!=='string')throw new Error('The saved question bank is invalid.');return {draft:restoreItemDraft(row.draft),bank:row.bank};});
  const {draft,bank}=encrypted.value;
  const [error, setError] = useState(""),
    [submitting,setSubmitting]=useState(false),
    [preview, setPreview] = useState(false),
    [response, setResponse] = useState<unknown>(null);
  const change = (next: ItemDraft) => {
    encrypted.update(current=>({...current,draft:next}));
    setPreview(false);
    setResponse(null);
    setError("");
  };
  let built: ReturnType<typeof buildItemDraft> | null = null;
  try {
    built = buildItemDraft(draft);
  } catch {
    /* Incomplete fields remain editable; validation is presented when saving or previewing. */
  }
  async function showPreview() {
    try {
      if(encrypted.blocked)throw new Error('Resolve encrypted draft recovery before submitting.');
      await encrypted.flush();
      buildItemDraft(draft);
      setError("");
      setPreview(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Complete the question first.",
      );
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if(busy||submitting||encrypted.blocked)return;
    setSubmitting(true);
    setError("");
    try {
      if(encrypted.blocked)throw new Error('Resolve encrypted draft recovery before submitting.');
      const ready=await encrypted.prepare(),value = buildItemDraft(ready.value.draft);
      if (
        await save(
          {
            ...value,
            ...(revision ? { item_id: revision.itemId } : { bank_id: ready.value.bank }),
            _draft:ready.token,
          },
          !!revision,
        )
      )cancel();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The question could not be saved.",
      );
    }finally{setSubmitting(false);}
  }
  return (
    <section className="editor question-editor">
      <h2 id="question-editor-heading" tabIndex={-1} ref={heading}>
        {revision
          ? `Revise question version ${revision.version}`
          : "Author a question"}
      </h2>
      {revision && (
        <p>
          The old version and every published test using it remain unchanged.
          This creates a new draft requiring review.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <DraftStatus {...encrypted} disabled={busy||submitting}/>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy||submitting||encrypted.blocked}>
          <legend>Question details</legend>
          <label>
            Question bank
            <select
              required
              disabled={!!revision}
              value={bank}
              onChange={(event) => encrypted.update(current=>({...current,bank:event.target.value}))}
            >
              <option value="">Choose a bank</option>
              {banks.map((row) => (
                <option key={row.id} value={row.id}>
                  {String(row.title)}
                </option>
              ))}
            </select>
          </label>
          <ItemFields draft={draft} setDraft={change} rubrics={rubrics} />
          <MediaPicker tenant={tenant} actor={actor} value={draft.media} onChange={media=>change({...draft,media})}/>
          <ImageInteractionFields draft={draft} setDraft={change} tenant={tenant} actor={actor}/>
        </fieldset>
        <div className="author-actions">
          <button disabled={busy || submitting || encrypted.blocked}>
            {revision ? "Save revised draft" : "Save draft"}
          </button>
          <button
            type="button"
            className="quiet"
            disabled={busy || submitting || encrypted.blocked}
            onClick={showPreview}
          >
            Preview candidate question
          </button>
          {revision && (
            <button
              type="button"
              className="quiet"
              disabled={busy||submitting}
              onClick={cancel}
            >
              Cancel revision
            </button>
          )}
        </div>
        <p className="hint">
          Edits are recovered only on this device and account. Saving creates
          an institution draft, not an approved question.
        </p>
      </form>
      {preview && built && (
        <section
          className="candidate-preview"
          aria-labelledby="question-preview-heading"
        >
          <h3 id="question-preview-heading">Candidate preview</h3>
          <p>{built.item.prompt}</p>
          <QuestionMedia item={built.item} tenant={tenant} actor={actor}/>
          <QuestionResponse
            entry={{
              item_version_id: "author-preview",
              section_id: "preview",
              item: built.item,
            }}
            value={response}
            onChange={setResponse}
            mediaContext={{tenant,actor}}
          />
          <p className="hint">
            Preview responses are not stored as exam answers. No private key is
            supplied to the response renderer.
          </p>
        </section>
      )}
    </section>
  );
}
