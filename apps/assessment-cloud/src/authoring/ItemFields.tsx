import { useId } from "react";
import {
  ITEM_TYPES,
  isSubjective,
  type ItemType,
} from "../../../../packages/assessment-core/src/mod.ts";
import {
  blankItemDraft,
  moveOrder,
  needsOptions,
  needsSlots,
  removeOption,
  type ItemDraft,
} from "../../../../packages/assessment-core/src/authoring.ts";
import type { Row } from "../../../../packages/assessment-web/src/client";
import { MediaAnswerFields } from "./MediaAnswerFields";
import {QuestionClassification} from "./QuestionClassification";
import { useAppT, useItemLabel } from "../i18n/index.ts";
export const mediaToolTypes = new Set<ItemType>([
  "audio_response",
  "video_response",
  "file_response",
]);
export function ItemFields({
  draft,
  setDraft,
  rubrics,
}: {
  draft: ItemDraft;
  setDraft: (value: ItemDraft) => void;
  rubrics: Row[];
}) {
  const t = useAppT(), itemLabel = useItemLabel();
  const tagsHint=useId();
  const update = (value: Partial<ItemDraft>) =>
    setDraft({ ...draft, ...value });
  function changeType(type: ItemType) {
    const fresh = blankItemDraft(type);
    setDraft({
      ...fresh,
      locale: draft.locale,
      prompt: draft.prompt,
      maxScore: draft.maxScore,
      tags: draft.tags,
      topics:draft.topics,estimatedDifficulty:draft.estimatedDifficulty,
      rubricId: draft.rubricId,
      media: draft.media,
    });
  }
  return (
    <>
      <div className="author-fields">
        <label>
          {t("fields.type")}
          <select
            value={draft.type}
            onChange={(event) => changeType(event.target.value as ItemType)}
          >
            {ITEM_TYPES.map((type) => (
              <option key={type} value={type}>
                {itemLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("fields.language")}
          <select
            value={draft.locale}
            onChange={(event) =>
              update({ locale: event.target.value as ItemDraft["locale"] })
            }
          >
            <option value="en">{t("fields.langEn")}</option>
            <option value="uz">{t("fields.langUz")}</option>
            <option value="ru">{t("fields.langRu")}</option>
          </select>
        </label>
        <label>
          {t("fields.maxPoints")}
          <input
            type="number"
            required
            min="0.01"
            max="1000"
            step="0.000001"
            value={draft.maxScore}
            onChange={(event) => update({ maxScore: event.target.value })}
          />
        </label>
      </div>
      <label>
        {t("fields.prompt")}
        <textarea
          required
          maxLength={50000}
          rows={5}
          value={draft.prompt}
          onChange={(event) => update({ prompt: event.target.value })}
        />
      </label>
      <label>
        {t("fields.tags")}
        <input
          aria-describedby={tagsHint}
          maxLength={10000}
          value={draft.tags}
          onChange={(event) => update({ tags: event.target.value })}
        />
      </label>
      <p id={tagsHint} className="hint">
        {t("fields.tagsHint")}
      </p>
      {mediaToolTypes.has(draft.type) && (
        <p role="alert" className="author-warning">
          {t("fields.mediaWarning")}
        </p>
      )}
      <MediaAnswerFields draft={draft} setDraft={setDraft}/>
      <QuestionClassification draft={draft} change={update}/>
      {needsOptions(draft.type) && (
        <fieldset>
          <legend>{t("fields.options")}</legend>
          {draft.options.map((row, index) => (
            <div className="author-row" key={row.id}>
              <label>
                {t("fields.option", { number: index + 1 })}
                <textarea
                  required
                  maxLength={5000}
                  rows={2}
                  value={row.text}
                  onChange={(event) =>
                    update({
                      options: draft.options.map((option) =>
                        option.id === row.id
                          ? { ...option, text: event.target.value }
                          : option,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="quiet"
                disabled={draft.options.length <= 2}
                aria-label={t("fields.removeOption", { number: index + 1 })}
                onClick={() => setDraft(removeOption(draft, row.id))}
              >
                {t("fields.remove")}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="quiet"
            disabled={
              draft.options.length >= 100 || draft.type === "true_false"
            }
            onClick={() => {
              const id = crypto.randomUUID();
              update({
                options: [...draft.options, { id, text: "" }],
                order: [...draft.order, id],
              });
            }}
          >
            {t("fields.addOption")}
          </button>
        </fieldset>
      )}
      {needsSlots(draft.type) && (
        <fieldset>
          <legend>{t("fields.slots")}</legend>
          <p className="hint">
            {t("fields.slotsHint")}
          </p>
          {draft.slots.map((row, index) => (
            <div className="author-row" key={index}>
              <label>
                {t("fields.slot", { number: index + 1 })}
                <input
                  required
                  maxLength={200}
                  value={row.id}
                  onChange={(event) =>
                    update({
                      slots: draft.slots.map((slot, i) =>
                        i === index
                          ? { ...slot, id: event.target.value }
                          : slot,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="quiet"
                disabled={draft.slots.length <= 1}
                aria-label={t("fields.removeSlot", { number: index + 1 })}
                onClick={() =>
                  update({ slots: draft.slots.filter((_, i) => i !== index) })
                }
              >
                {t("fields.remove")}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="quiet"
            disabled={draft.slots.length >= 100}
            onClick={() =>
              update({
                slots: [
                  ...draft.slots,
                  { id: `response_${draft.slots.length + 1}`, accepted: "",x:'50',y:'50' },
                ],
              })
            }
          >
            {t("fields.addSlot")}
          </button>
        </fieldset>
      )}
      {isSubjective(draft.type) ? (
        <div>
          <label>
            {t("fields.rubric")}
            <select
              required
              value={draft.rubricId}
              onChange={(event) => update({ rubricId: event.target.value })}
            >
              <option value="">{t("fields.chooseRubric")}</option>
              {rubrics.map((row) => (
                <option key={row.id} value={row.id}>
                  {String(row.title)}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">
            {t("fields.rubricHint")}
          </p>
        </div>
      ) : draft.type==='hotspot'?null:(
        <fieldset className="private-key">
          <legend>{t("fields.privateKey")}</legend>
          <p className="hint">
            {t("fields.privateKeyHint")}
          </p>
          {["single_choice", "true_false"].includes(draft.type) &&
            draft.options.map((row, index) => (
              <label className="check" key={row.id}>
                <input
                  type="radio"
                  name="private-correct"
                  required
                  checked={draft.correctOption === row.id}
                  onChange={() => update({ correctOption: row.id })}
                />
                {t("fields.correctOption", { number: index + 1, text: row.text || t("fields.enterOptionText") })}
              </label>
            ))}
          {draft.type === "multi_choice" &&
            draft.options.map((row, index) => (
              <label className="check" key={row.id}>
                <input
                  type="checkbox"
                  checked={draft.correctOptions.includes(row.id)}
                  onChange={(event) =>
                    update({
                      correctOptions: event.target.checked
                        ? [...draft.correctOptions, row.id]
                        : draft.correctOptions.filter((id) => id !== row.id),
                    })
                  }
                />
                {t("fields.correctOption", { number: index + 1, text: row.text || t("fields.enterOptionText") })}
              </label>
            ))}
          {draft.type === "ordering" && (
            <ol>
              {draft.order.map((id, index) => (
                <li key={id}>
                  <span>
                    {draft.options.find((row) => row.id === id)?.text ||
                      t("fields.option", { number: index + 1 })}
                  </span>
                  <div className="author-actions">
                    <button
                      type="button"
                      className="quiet"
                      disabled={index === 0}
                      aria-label={t("fields.moveUpLabel", { number: index + 1 })}
                      onClick={() =>
                        update({ order: moveOrder(draft.order, index, -1) })
                      }
                    >
                      {t("fields.moveUp")}
                    </button>
                    <button
                      type="button"
                      className="quiet"
                      disabled={index === draft.order.length - 1}
                      aria-label={t("fields.moveDownLabel", { number: index + 1 })}
                      onClick={() =>
                        update({ order: moveOrder(draft.order, index, 1) })
                      }
                    >
                      {t("fields.moveDown")}
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {needsSlots(draft.type) &&
            draft.slots.map((row, index) => (
              <label key={index}>
                {t("fields.acceptedFor", { field: row.id || t("fields.fieldNumber", { number: index + 1 }) })}
                {draft.type === "matching" ? (
                  <select
                    required
                    value={row.accepted}
                    onChange={(event) =>
                      update({
                        slots: draft.slots.map((slot, i) =>
                          i === index
                            ? { ...slot, accepted: event.target.value }
                            : slot,
                        ),
                      })
                    }
                  >
                    <option value="">{t("fields.chooseMatch")}</option>
                    {draft.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.text || t("fields.enterOptionText")}
                      </option>
                    ))}
                  </select>
                ) : (
                  <textarea
                    required
                    rows={3}
                    maxLength={50000}
                    value={row.accepted}
                    onChange={(event) =>
                      update({
                        slots: draft.slots.map((slot, i) =>
                          i === index
                            ? { ...slot, accepted: event.target.value }
                            : slot,
                        ),
                      })
                    }
                  />
                )}
              </label>
            ))}
          {draft.type === "numeric" && (
            <div className="author-fields">
              <label>
                {t("fields.numericAnswer")}
                <input
                  type="number"
                  required
                  min={-1e12}
                  max={1e12}
                  step="any"
                  value={draft.numericValue}
                  onChange={(event) =>
                    update({ numericValue: event.target.value })
                  }
                />
              </label>
              <label>
                {t("fields.tolerance")}
                <input
                  type="number"
                  required
                  min={0}
                  max={1e9}
                  step="any"
                  value={draft.tolerance}
                  onChange={(event) =>
                    update({ tolerance: event.target.value })
                  }
                />
              </label>
            </div>
          )}
          {draft.type==='short_answer' && (
            <div>
              <label>
                {t("fields.accepted")}
                <textarea
                  required
                  rows={4}
                  maxLength={50000}
                  value={draft.accepted}
                  onChange={(event) => update({ accepted: event.target.value })}
                />
              </label>
              <p className="hint">
                {t("fields.acceptedHint")}
              </p>
            </div>
          )}
          {[
            "short_answer",
            "gap_fill",
            "table_completion",
            "diagram_labeling",
          ].includes(draft.type) && (
            <label className="check">
              <input
                type="checkbox"
                checked={draft.caseSensitive}
                onChange={(event) =>
                  update({ caseSensitive: event.target.checked })
                }
              />
              {t("fields.caseSensitive")}
            </label>
          )}
          {[
            "multi_choice",
            "matching",
            "gap_fill",
            "table_completion",
            "diagram_labeling",
          ].includes(draft.type) && (
            <label className="check">
              <input
                type="checkbox"
                checked={draft.partialCredit}
                onChange={(event) =>
                  update({ partialCredit: event.target.checked })
                }
              />
              {t("fields.partialCredit")}
            </label>
          )}
        </fieldset>
      )}
    </>
  );
}
