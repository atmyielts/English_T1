import React, { type KeyboardEvent, useId } from "react";
import { ImagePointCoordinates } from "./ImagePointCoordinates";
import type { Item } from "../../assessment-core/src/mod";
import {
  type ImagePoint,
  imagePoint,
  normalizedPoint,
} from "../../assessment-core/src/image-response";
import { QuestionMedia } from "./QuestionMedia";
import "./image-response.css";
export interface QuestionMediaContext {
  tenant: string;
  actor: string;
  attempt?: string;
  enabled?: boolean;
}
const percent = (n: number) => String(Math.round(n * 1e6) / 10000);
export function ImageQuestionResponse(
  { item, value, onChange, context }: {
    item: Item;
    value: unknown;
    onChange: (value: unknown) => void;
    context?: QuestionMediaContext;
  },
) {
  const id = useId();
  let point: ImagePoint | null = null;
  try {
    point = imagePoint(value);
  } catch {
    /* Unanswered/malformed saved values never create an implicit point. */
  }
  const interaction = item.image_response,
    asset = item.media?.find((media) =>
      media.artifact_id === interaction?.artifact_id && media.kind === "image"
    );
  if (!context || !interaction || !asset) {
    return (
      <p role="alert">
        The image response context is unavailable. Reconnect before answering.
      </p>
    );
  }
  const ids = item.response_ids ?? [],
    answers = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  const choose = (next: ImagePoint | null) => {
    onChange(next);
  };
  function keyPoint(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.currentTarget.matches(":disabled")) return;
    const move: { [key: string]: [number, number] } = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (move[event.key]) {
      event.preventDefault();
      const [dx, dy] = move[event.key], step = event.shiftKey ? .01 : .001;
      choose(
        normalizedPoint(
          (point?.x ?? .5) + dx * step,
          (point?.y ?? .5) + dy * step,
        ),
      );
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      choose(null);
    }
  }
  return (
    <div className="image-question-response">
      <p id={id + "-instructions"}>
        {item.type === "hotspot"
          ? "Select one point on the image. You can use a pointer, focus the image and press arrow keys, or enter exact percentages below. Arrow keys move 0.1%; Shift moves 1%. Delete clears the point."
          : "The numbered markers identify response fields, not accepted answers. Select a marker to focus its labelled answer field below."}
      </p>
      <QuestionMedia
        item={{ media: [asset] }}
        {...context}
        imageOverlay={() =>
          item.type === "hotspot"
            ? (
              <>
                <button
                  type="button"
                  className="image-point-surface"
                  aria-label="Select a point on the question image"
                  aria-describedby={id + "-instructions"}
                  onPointerUp={(event) => {
                    if (
                      event.button !== 0 ||
                      event.currentTarget.matches(":disabled")
                    ) return;
                    const box = event.currentTarget.getBoundingClientRect();
                    if (box.width && box.height) {
                      choose(
                        normalizedPoint(
                          (event.clientX - box.left) / box.width,
                          (event.clientY - box.top) / box.height,
                        ),
                      );
                    }
                  }}
                  onClick={(event) => {
                    if (event.detail === 0 && !point) {
                      choose(
                        normalizedPoint(.5, .5),
                      );
                    }
                  }}
                  onKeyDown={keyPoint}
                >
                  {point && (
                    <span
                      className="image-selected-point"
                      aria-hidden="true"
                      style={{
                        left: percent(point.x) + "%",
                        top: percent(point.y) + "%",
                      }}
                    >
                      +
                    </span>
                  )}
                </button>
              </>
            )
            : interaction.anchors?.map((anchor) => {
              const index = ids.indexOf(anchor.response_id);
              return (
                <button
                  type="button"
                  key={anchor.response_id}
                  className="diagram-anchor"
                  style={{
                    left: percent(anchor.x) + "%",
                    top: percent(anchor.y) + "%",
                  }}
                  aria-label={`Focus answer ${anchor.response_id}`}
                  onClick={() =>
                    document.getElementById(id + "-answer-" + index)?.focus()}
                >
                  {index + 1}
                </button>
              );
            })}
      />
      {item.type === "diagram_labeling"
        ? (
          <fieldset>
            <legend>Label the diagram</legend>
            {ids.map((label, index) => (
              <label key={label} htmlFor={id + "-answer-" + index}>
                {index + 1}. {label}
                <input
                  id={id + "-answer-" + index}
                  maxLength={1000}
                  value={typeof answers[label] === "string"
                    ? answers[label]
                    : ""}
                  onChange={(event) =>
                    onChange({ ...answers, [label]: event.target.value })}
                />
              </label>
            ))}
          </fieldset>
        )
        : (
          <>
            <p role="status">
              {point
                ? `Selected point: ${percent(point.x)}% from the left, ${
                  percent(point.y)
                }% from the top.`
                : "No point selected."}
            </p>
            <ImagePointCoordinates point={point} onChange={onChange} />
          </>
        )}
    </div>
  );
}
