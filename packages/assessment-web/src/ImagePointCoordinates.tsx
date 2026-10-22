import React, { useEffect, useState } from "react";
import {
  type ImagePoint,
  normalizedPoint,
} from "../../assessment-core/src/image-response";
import { useWebT } from "./i18n/useWebT.ts";
const percent = (n: number) => String(Math.round(n * 1e6) / 10000);
export function ImagePointCoordinates(
  { point, onChange }: {
    point: ImagePoint | null;
    onChange: (value: ImagePoint | null) => void;
  },
) {
  const t = useWebT();
  const [coordinates, setCoordinates] = useState({ x: "", y: "" }),
    [error, setError] = useState("");
  const x = point?.x, y = point?.y;
  useEffect(() => {
    setCoordinates({
      x: x === undefined ? "" : percent(x),
      y: y === undefined ? "" : percent(y),
    });
  }, [x, y]);
  const choose = (next: ImagePoint | null) => {
    setError("");
    onChange(next);
  };
  return (
    <fieldset>
      <legend>{t("image.coordinates")}</legend>
      <div className="image-coordinate-fields">
        <label>
          {t("image.horizontal")}<input
            type="number"
            min="0"
            max="100"
            step="0.0001"
            value={coordinates.x}
            onChange={(event) =>
              setCoordinates((current) => ({
                ...current,
                x: event.target.value,
              }))}
          />
        </label>
        <label>
          {t("image.vertical")}<input
            type="number"
            min="0"
            max="100"
            step="0.0001"
            value={coordinates.y}
            onChange={(event) =>
              setCoordinates((current) => ({
                ...current,
                y: event.target.value,
              }))}
          />
        </label>
      </div>
      <p className="hint">{t("image.coordinatesHint")}</p>
      <div className="image-response-actions">
        <button
          type="button"
          className="quiet"
          onClick={() => {
            const px = Number(coordinates.x),
              py = Number(coordinates.y);
            if (
              !coordinates.x.trim() || !coordinates.y.trim() ||
              !Number.isFinite(px) || !Number.isFinite(py) || px < 0 ||
              px > 100 || py < 0 || py > 100
            ) {
              setError(t("image.coordinatesInvalid"));
              return;
            }
            choose(normalizedPoint(px / 100, py / 100));
          }}
        >
          {t("image.apply")}
        </button>
        <button
          type="button"
          className="quiet"
          onClick={() => choose(null)}
        >
          {t("image.clearPoint")}
        </button>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
    </fieldset>
  );
}
