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
export function ImageInteractionFields(
  { draft, setDraft, tenant, actor }: {
    draft: ItemDraft;
    setDraft: (draft: ItemDraft) => void;
    tenant: string;
    actor: string;
  },
) {
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
      aria-label="Image response design"
    >
      <h3>Image response design</h3>
      <p>
        Attach a scanned image, then choose it here. Positions are percentages
        from the image’s left and top edges and scale with the image.
      </p>
      <label>
        Interaction image<select
          required
          value={draft.imageArtifact}
          onChange={(event) =>
            setDraft({ ...draft, imageArtifact: event.target.value })}
        >
          <option value="">Choose an attached image</option>
          {images.map((media, i) => (
            <option key={media.artifact_id} value={media.artifact_id}>
              Image {i + 1}: {media.alt}
            </option>
          ))}
        </select>
      </label>
      {draft.type === "diagram_labeling"
        ? (
          <fieldset>
            <legend>Public diagram marker positions</legend>
            <p className="hint">
              Markers use the response labels above. Keep labels neutral so they
              do not reveal accepted answers. The candidate can focus each
              marker and type into its labelled field.
            </p>
            {draft.slots.map((slot, index) => (
              <div className="author-fields" key={index}>
                <label>
                  Marker {index + 1} horizontal (%)<input
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
                  Marker {index + 1} vertical (%)<input
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
            <legend>Private hotspot scoring regions</legend>
            <p>
              One selected point inside any accepted target receives full
              credit; boundaries count as inside. Regions and this overlay are
              visible only to authorized authors/reviewers, never to candidates.
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
              Add accepted target
            </button>
            {asset && (
              <>
                <h4>Private target preview</h4>
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
