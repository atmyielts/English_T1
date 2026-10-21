import React from "react";
import {
  blankRegionDraft,
  buildRegionDraft,
  type ItemDraft,
} from "../../../../packages/assessment-core/src/authoring";
import {
  type ImageRegion,
  imageRegion,
} from "../../../../packages/assessment-core/src/image-response";
import { QuestionMedia } from "../../../../packages/assessment-web/src/QuestionMedia";
import "../../../../packages/assessment-web/src/image-response.css";
import { PrivateTargetOverlay, RegionEditor } from "./ImageRegionEditor";
export { PrivateTargetOverlay } from "./ImageRegionEditor";
import { useAppT } from "../i18n/index.ts";
export function ImageInteractionFields(
  { draft, setDraft, tenant, actor }: {
    draft: ItemDraft;
    setDraft: (draft: ItemDraft) => void;
    tenant: string;
    actor: string;
  },
) {
  const t = useAppT();
  if (!["diagram_labeling", "hotspot"].includes(draft.type)) return null;
  const images = draft.media.filter((media) => media.kind === "image"),
    asset = images.find((media) => media.artifact_id === draft.imageArtifact);
  let regions: ImageRegion[] = [];
  try {
    regions = draft.regions.map((region) =>
      imageRegion(buildRegionDraft(region))
    );
  } catch { /* Incomplete target coordinates remain editable. */ }
  return (
    <section
      className="image-interaction-editor"
      aria-label={t("image.design")}
    >
      <h3>{t("image.design")}</h3>
      <p>
        {t("image.lead")}
      </p>
      <label>
        {t("image.select")}<select
          required
          value={draft.imageArtifact}
          onChange={(event) =>
            setDraft({ ...draft, imageArtifact: event.target.value })}
        >
          <option value="">{t("image.choose")}</option>
          {images.map((media, i) => (
            <option key={media.artifact_id} value={media.artifact_id}>
              {t("image.option", { number: i + 1, alt: media.alt })}
            </option>
          ))}
        </select>
      </label>
      {draft.type === "diagram_labeling"
        ? (
          <fieldset>
            <legend>{t("image.markers")}</legend>
            <p className="hint">
              {t("image.markersHint")}
            </p>
            {draft.slots.map((slot, index) => (
              <div className="author-fields" key={index}>
                <label>
                  {t("image.markerX", { number: index + 1 })}<input
                    required
                    type="number"
                    min="0"
                    max="100"
                    step="0.0001"
                    value={slot.x ?? ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        slots: draft.slots.map((row, i) =>
                          i === index ? { ...row, x: event.target.value } : row
                        ),
                      })}
                  />
                </label>
                <label>
                  {t("image.markerY", { number: index + 1 })}<input
                    required
                    type="number"
                    min="0"
                    max="100"
                    step="0.0001"
                    value={slot.y ?? ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        slots: draft.slots.map((row, i) =>
                          i === index ? { ...row, y: event.target.value } : row
                        ),
                      })}
                  />
                </label>
              </div>
            ))}
          </fieldset>
        )
        : (
          <fieldset className="private-key">
            <legend>{t("image.regions")}</legend>
            <p>
              {t("image.regionsLead")}
            </p>
            {draft.regions.map((region, index) => (
              <RegionEditor
                key={region.id}
                region={region}
                index={index}
                change={(next) =>
                  setDraft({
                    ...draft,
                    regions: draft.regions.map((row, i) =>
                      i === index ? next : row
                    ),
                  })}
                canRemove={draft.regions.length > 1}
                remove={() =>
                  setDraft({
                    ...draft,
                    regions: draft.regions.filter((_, i) => index !== i),
                  })}
              />
            ))}
            <button
              type="button"
              className="quiet"
              disabled={draft.regions.length >= 20}
              onClick={() =>
                setDraft({
                  ...draft,
                  regions: [
                    ...draft.regions,
                    blankRegionDraft(crypto.randomUUID()),
                  ],
                })}
            >
              {t("image.addTarget")}
            </button>
            {asset && (
              <>
                <h4>{t("image.preview")}</h4>
                <QuestionMedia
                  item={{ media: [asset] }}
                  tenant={tenant}
                  actor={actor}
                  imageOverlay={() =>
                    regions.length
                      ? <PrivateTargetOverlay regions={regions} />
                      : null}
                />
              </>
            )}
          </fieldset>
        )}
    </section>
  );
}
