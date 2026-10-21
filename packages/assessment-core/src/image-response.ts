/** Provider/DOM-free image interaction contract. Private target regions must
 * never be attached to the public interaction or candidate form. */
export const IMAGE_RESPONSE_PROTOCOL = "assessment.image-response.v1";
export interface Point {
  x: number;
  y: number;
}
export interface ImagePoint extends Point {
  schema_version: "assessment.image-point.v1";
}
export interface ImageInteraction {
  schema_version: typeof IMAGE_RESPONSE_PROTOCOL;
  artifact_id: string;
  anchors?: ({ response_id: string } & Point)[];
}
export type ImageRegion = {
  shape: "rectangle";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} | {
  shape: "ellipse";
  x: number;
  y: number;
  radius_x: number;
  radius_y: number;
} | { shape: "polygon"; points: Point[] };
const invalid = (message: string): never => {
  throw new Error(message);
};
const row = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : invalid("Expected image response object");
export function coordinate(value: unknown, label = "Coordinate"): number {
  if (
    typeof value !== "number" || !Number.isFinite(value) || value < 0 ||
    value > 1 || Math.round(value * 1e6) / 1e6 !== value
  ) invalid(`${label} must be between 0 and 1 with at most six decimal places`);
  return value as number;
}
export const normalizedPoint = (x: number, y: number): ImagePoint => ({
  schema_version: "assessment.image-point.v1",
  x: Math.round(Math.max(0, Math.min(1, x)) * 1e6) / 1e6,
  y: Math.round(Math.max(0, Math.min(1, y)) * 1e6) / 1e6,
});
export function imagePoint(value: unknown): ImagePoint {
  const input = row(value);
  if (
    ['schema_version','x','y'].some(key=>!Object.hasOwn(input,key))||
    input.schema_version !== "assessment.image-point.v1" ||
    Object.keys(input).some((key) =>
      !["schema_version", "x", "y"].includes(key)
    )
  ) invalid("Invalid image point response");
  return {
    schema_version: "assessment.image-point.v1",
    x: coordinate(input.x),
    y: coordinate(input.y),
  };
}
export function imageInteraction(
  value: unknown,
  type: "diagram_labeling" | "hotspot",
  media: { artifact_id: string; kind: string }[],
  ids: string[] = [],
): ImageInteraction {
  const input = row(value);
  if (
    input.schema_version !== IMAGE_RESPONSE_PROTOCOL ||
    typeof input.artifact_id !== "string" ||
    !media.some((asset) =>
      asset.artifact_id === input.artifact_id && asset.kind === "image"
    )
  ) invalid("Choose an attached scanned image for this interaction");
  const result: ImageInteraction = {
    schema_version: IMAGE_RESPONSE_PROTOCOL,
    artifact_id: input.artifact_id as string,
  };
  if (type === "diagram_labeling") {
    if (
      !Array.isArray(input.anchors) || input.anchors.length !== ids.length ||
      !ids.length
    ) invalid("Place one diagram anchor for every response label");
    const anchors = (input.anchors as unknown[]).map((value) => {
      const anchor = row(value);
      if (
        typeof anchor.response_id !== "string" ||
        !ids.includes(anchor.response_id)
      ) invalid("Diagram anchor references an unknown response label");
      return {
        response_id: anchor.response_id as string,
        x: coordinate(anchor.x),
        y: coordinate(anchor.y),
      };
    });
    if (
      new Set(anchors.map((anchor) => anchor.response_id)).size !== ids.length
    ) invalid("Diagram anchors must reference every response label once");
    result.anchors = anchors;
  } else if (input.anchors !== undefined) {
    invalid(
      "Hotspot targets belong in the private scoring key, not the public interaction",
    );
  }
  return result;
}
const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const onSegment = (a: Point, b: Point, p: Point) =>
  Math.abs(cross(a, b, p)) <= 1e-12 && p.x >= Math.min(a.x, b.x) - 1e-12 &&
  p.x <= Math.max(a.x, b.x) + 1e-12 && p.y >= Math.min(a.y, b.y) - 1e-12 &&
  p.y <= Math.max(a.y, b.y) + 1e-12;
function intersect(a: Point, b: Point, c: Point, d: Point) {
  const abC = cross(a, b, c),
    abD = cross(a, b, d),
    cdA = cross(c, d, a),
    cdB = cross(c, d, b);
  return (abC * abD < 0 && cdA * cdB < 0) || onSegment(a, b, c) ||
    onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}
export function imageRegion(value: unknown): ImageRegion {
  const input = row(value);
  if (input.shape === "rectangle") {
    const result = {
      shape: "rectangle" as const,
      x1: coordinate(input.x1),
      y1: coordinate(input.y1),
      x2: coordinate(input.x2),
      y2: coordinate(input.y2),
    };
    if (result.x1 >= result.x2 || result.y1 >= result.y2) {
      invalid("Rectangle right/bottom must follow left/top");
    }
    return result;
  }
  if (input.shape === "ellipse") {
    const result = {
      shape: "ellipse" as const,
      x: coordinate(input.x),
      y: coordinate(input.y),
      radius_x: coordinate(input.radius_x),
      radius_y: coordinate(input.radius_y),
    };
    if (
      !result.radius_x || !result.radius_y || result.x - result.radius_x < 0 ||
      result.x + result.radius_x > 1 || result.y - result.radius_y < 0 ||
      result.y + result.radius_y > 1
    ) invalid("The complete ellipse must fit inside the image");
    return result;
  }
  if (input.shape === "polygon") {
    if (
      !Array.isArray(input.points) || input.points.length < 3 ||
      input.points.length > 32
    ) invalid("A polygon needs 3–32 vertices");
    const points = (input.points as unknown[]).map((value) => {
      const p = row(value);
      return { x: coordinate(p.x), y: coordinate(p.y) };
    });
    if (new Set(points.map((p) => `${p.x}:${p.y}`)).size !== points.length) {
      invalid(
        "Polygon vertices must be distinct; do not repeat the first vertex",
      );
    }
    const n = points.length;
    let area = 0;
    for (let i = 0; i < n; i++) {
      area += points[i].x * points[(i + 1) % n].y -
        points[(i + 1) % n].x * points[i].y;
      for (let j = i + 1; j < n; j++) {
        if (
          j !== i + 1 && !(i === 0 && j === n - 1) &&
          intersect(
            points[i],
            points[(i + 1) % n],
            points[j],
            points[(j + 1) % n],
          )
        ) invalid("Polygon edges must not intersect or touch");
      }
      if (onSegment(points[(i + n - 1) % n], points[(i + 1) % n], points[i])) {
        invalid("Remove redundant collinear polygon vertices");
      }
    }
    if (Math.abs(area) <= 1e-12) invalid("Polygon must enclose a nonzero area");
    return { shape: "polygon", points };
  }
  return invalid("Choose rectangle, ellipse or polygon target");
}
export function hotspotKey(value: unknown): { regions: ImageRegion[] } {
  const input = row(value);
  if (
    !Array.isArray(input.regions) || !input.regions.length ||
    input.regions.length > 20
  ) invalid("Define 1–20 private accepted target regions");
  return { regions: (input.regions as unknown[]).map(imageRegion) };
}
/** Boundary points count as inside; malformed responses receive no credit. */
export function regionContains(region: ImageRegion, point: Point): boolean {
  if (region.shape === "rectangle") {
    return point.x >= region.x1 && point.x <= region.x2 &&
      point.y >= region.y1 && point.y <= region.y2;
  }
  if (region.shape === "ellipse") {
    return ((point.x - region.x) / region.radius_x) ** 2 +
        ((point.y - region.y) / region.radius_y) ** 2 <= 1 + 1e-12;
  }
  let inside = false;
  const points = region.points;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j], b = points[i];
    if (onSegment(a, b, point)) return true;
    if (
      (a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x
    ) inside = !inside;
  }
  return inside;
}
