/** Field-level comparison of two question versions' review material (question,
 * scoring key and rubric), grouped into the areas a reviewer checks. */
export const REVIEW_AREAS = [
  "prompt",
  "options",
  "key",
  "rubric",
  "media",
  "scoring",
  "metadata",
] as const;
export type ReviewArea = (typeof REVIEW_AREAS)[number];
export interface ReviewMaterial {
  item: unknown;
  key: unknown;
  rubric?: unknown;
}
export interface ReviewChange {
  area: ReviewArea;
  /** Dotted path inside the material, for example `item.options.1.text`. */
  path: string;
  kind: "added" | "removed" | "changed";
  before?: unknown;
  after?: unknown;
}
const MEDIA_FIELDS = new Set(["media", "image_response", "media_response"]);
const SCORING_FIELDS = new Set(["max_score", "partial_credit", "rubric_id"]);
function areaOf(path: string[]): ReviewArea {
  const [root, field] = path;
  if (root === "key") return "key";
  if (root === "rubric") return "rubric";
  if (field === "prompt" || field === "stimulus" || field === "instructions") return "prompt";
  if (field === "options" || field === "blanks" || field === "pairs" || field === "categories") return "options";
  if (field && MEDIA_FIELDS.has(field)) return "media";
  if (field && SCORING_FIELDS.has(field)) return "scoring";
  return "metadata";
}
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
function walk(
  before: unknown,
  after: unknown,
  path: string[],
  out: ReviewChange[],
  limit: number,
) {
  if (out.length >= limit) return;
  if (isObject(before) && isObject(after)) {
    for (const name of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
      walk(before[name], after[name], [...path, name], out, limit);
    }
    return;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    for (let index = 0; index < Math.max(before.length, after.length); index++) {
      walk(before[index], after[index], [...path, String(index)], out, limit);
    }
    return;
  }
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const kind = before === undefined ? "added" : after === undefined ? "removed" : "changed";
  out.push({
    area: areaOf(path),
    path: path.join("."),
    kind,
    ...(before === undefined ? {} : { before }),
    ...(after === undefined ? {} : { after }),
  });
}
/** Every changed leaf, grouped by review area, up to `limit` entries. `truncated`
 * says when more changes exist than were listed. */
export function compareReviewMaterial(
  before: ReviewMaterial,
  after: ReviewMaterial,
  limit = 500,
): { changes: ReviewChange[]; areas: ReviewArea[]; truncated: boolean } {
  const changes: ReviewChange[] = [];
  walk(before, after, [], changes, limit + 1);
  // Grouped in the order a reviewer checks; path order within an area.
  changes.sort((x, y) => REVIEW_AREAS.indexOf(x.area) - REVIEW_AREAS.indexOf(y.area));
  const truncated = changes.length > limit;
  if (truncated) changes.length = limit;
  return {
    changes,
    areas: REVIEW_AREAS.filter((area) => changes.some((row) => row.area === area)),
    truncated,
  };
}
