import React from "react";
import type { RegionDraft } from "../../../../packages/assessment-core/src/authoring";
import type { ImageRegion } from "../../../../packages/assessment-core/src/image-response";
import { useAppT, type AppKey } from "../i18n/index.ts";
export function PrivateTargetOverlay({ regions }: { regions: ImageRegion[] }) {
  return (
    <svg
      className="image-private-targets"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {regions.map((region, index) =>
        region.shape === "rectangle"
          ? (
            <rect
              key={index}
              x={region.x1}
              y={region.y1}
              width={region.x2 - region.x1}
              height={region.y2 - region.y1}
            />
          )
          : region.shape === "ellipse"
          ? (
            <ellipse
              key={index}
              cx={region.x}
              cy={region.y}
              rx={region.radius_x}
              ry={region.radius_y}
            />
          )
          : (
            <polygon
              key={index}
              points={region.points.map((p) => `${p.x},${p.y}`).join(" ")}
            />
          )
      )}
    </svg>
  );
}
const regionLabels = {
  x1: "region.x1",
  y1: "region.y1",
  x2: "region.x2",
  y2: "region.y2",
  x: "region.x",
  y: "region.y",
  radius_x: "region.radius_x",
  radius_y: "region.radius_y",
} satisfies Record<string, AppKey>;
export function RegionEditor(
  { region, index, change, remove, canRemove }: {
    region: RegionDraft;
    index: number;
    change: (region: RegionDraft) => void;
    remove: () => void;
    canRemove: boolean;
  },
) {
  const t = useAppT();
  const coordinate = (key: keyof typeof regionLabels) => (
    <label key={key}>
      {t(regionLabels[key], { number: index + 1 })}
      <input
        required
        type="number"
        min="0"
        max="100"
        step="0.0001"
        value={region[key]}
        onChange={(event) => change({ ...region, [key]: event.target.value })}
      />
    </label>
  );
  return (
    <fieldset>
      <legend>{t("region.legend", { number: index + 1 })}</legend>
      <label>
        {t("region.shape", { number: index + 1 })}<select
          value={region.shape}
          onChange={(event) =>
            change({
              ...region,
              shape: event.target.value as RegionDraft["shape"],
            })}
        >
          <option value="rectangle">{t("region.rectangle")}</option>
          <option value="ellipse">{t("region.ellipse")}</option>
          <option value="polygon">{t("region.polygon")}</option>
        </select>
      </label>
      {region.shape === "polygon"
        ? (
          <>
            <p className="hint">
              {t("region.polygonHint")}
            </p>
            {region.points.map((p, i) => (
              <div className="author-fields" key={i}>
                <label>
                  {t("region.vertexX", { number: index + 1, vertex: i + 1 })}<input
                    type="number"
                    required
                    min="0"
                    max="100"
                    step="0.0001"
                    value={p.x}
                    onChange={(event) =>
                      change({
                        ...region,
                        points: region.points.map((row, j) =>
                          i === j ? { ...row, x: event.target.value } : row
                        ),
                      })}
                  />
                </label>
                <label>
                  {t("region.vertexY", { number: index + 1, vertex: i + 1 })}<input
                    type="number"
                    required
                    min="0"
                    max="100"
                    step="0.0001"
                    value={p.y}
                    onChange={(event) =>
                      change({
                        ...region,
                        points: region.points.map((row, j) =>
                          i === j ? { ...row, y: event.target.value } : row
                        ),
                      })}
                  />
                </label>
                <button
                  type="button"
                  className="quiet"
                  disabled={region.points.length <= 3}
                  onClick={() =>
                    change({
                      ...region,
                      points: region.points.filter((_, j) => i !== j),
                    })}
                >
                  {t("region.removeVertex", { number: index + 1, vertex: i + 1 })}
                </button>
              </div>
            ))}
            <button
              type="button"
              className="quiet"
              disabled={region.points.length >= 32}
              onClick={() =>
                change({
                  ...region,
                  points: [...region.points, { x: "", y: "" }],
                })}
            >
              {t("region.addVertex", { number: index + 1 })}
            </button>
          </>
        )
        : (
          <div className="author-fields">
            {(region.shape === "rectangle"
              ? ["x1", "y1", "x2", "y2"] as const
              : ["x", "y", "radius_x", "radius_y"] as const).map(coordinate)}
          </div>
        )}
      <button
        type="button"
        className="quiet"
        disabled={!canRemove}
        onClick={remove}
      >
        {t("region.remove", { number: index + 1 })}
      </button>
    </fieldset>
  );
}
