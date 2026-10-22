import {
  type AnswerKey,
  isSubjective,
  type Item,
  ITEM_TYPES,
  type ItemType,
  type Locale,
  object,
  type Option,
  validateItem,
  validateKey,
} from "./mod.ts";
import { IMAGE_RESPONSE_PROTOCOL, type ImageRegion } from "./image-response.ts";
import { MEDIA_POLICY_PROTOCOL, MEDIA_RESPONSE_TYPES } from "./media-answer.ts";
import { ARTIFACT_MIMES, type ArtifactMime } from "./artifacts.ts";
export interface RegionDraft {
  id: string;
  shape: "rectangle" | "ellipse" | "polygon";
  x1: string;
  y1: string;
  x2: string;
  y2: string;
  x: string;
  y: string;
  radius_x: string;
  radius_y: string;
  points: { x: string; y: string }[];
}
export const blankRegionDraft = (id = "region_1"): RegionDraft => ({
  id,
  shape: "rectangle",
  x1: "10",
  y1: "10",
  x2: "30",
  y2: "30",
  x: "50",
  y: "50",
  radius_x: "10",
  radius_y: "10",
  points: [{ x: "20", y: "20" }, { x: "80", y: "20" }, { x: "50", y: "80" }],
});
const percent = (value: number) => String(Math.round(value * 1e6) / 10000);
export function draftCoordinate(value: string): number {
  if (!value.trim()) throw new Error("Image position is required.");
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error("Image positions must be between 0 and 100 percent.");
  }
  return Math.round(n * 10000) / 1e6;
}
export function buildRegionDraft(draft: RegionDraft): ImageRegion {
  if (draft.shape === "rectangle") {
    return {
      shape: draft.shape,
      x1: draftCoordinate(draft.x1),
      y1: draftCoordinate(draft.y1),
      x2: draftCoordinate(draft.x2),
      y2: draftCoordinate(draft.y2),
    };
  }
  if (draft.shape === "ellipse") {
    return {
      shape: draft.shape,
      x: draftCoordinate(draft.x),
      y: draftCoordinate(draft.y),
      radius_x: draftCoordinate(draft.radius_x),
      radius_y: draftCoordinate(draft.radius_y),
    };
  }
  return {
    shape: "polygon",
    points: draft.points.map((p) => ({
      x: draftCoordinate(p.x),
      y: draftCoordinate(p.y),
    })),
  };
}

export const itemLabels: Record<ItemType, string> = {
  single_choice: "Single choice",
  multi_choice: "Multiple choice",
  true_false: "True or false",
  matching: "Matching",
  ordering: "Ordering",
  gap_fill: "Gap fill",
  short_answer: "Short answer",
  numeric: "Numeric answer",
  table_completion: "Table completion",
  diagram_labeling: "Diagram labeling",
  hotspot: "Image hotspot",
  essay: "Essay",
  audio_response: "Audio response",
  video_response: "Video response",
  file_response: "File response",
};
export const needsOptions = (type: ItemType) =>
  ["single_choice", "multi_choice", "true_false", "matching", "ordering"]
    .includes(type);
export const needsSlots = (type: ItemType) =>
  ["matching", "gap_fill", "table_completion", "diagram_labeling"].includes(
    type,
  );
/** Editor strings retain incomplete values without treating a blank numeric field as zero. */
export interface ItemDraft {
  type: ItemType;
  locale: Locale;
  prompt: string;
  maxScore: string;
  tags: string;
  topics?:string[];
  estimatedDifficulty?:string;
  options: Option[];
  slots: { id: string; accepted: string; x?: string; y?: string }[];
  correctOption: string;
  correctOptions: string[];
  order: string[];
  accepted: string;
  numericValue: string;
  tolerance: string;
  /** Worked solution kept with the private key. */
  solution?: string;
  caseSensitive: boolean;
  partialCredit: boolean;
  rubricId: string;
  media: NonNullable<Item["media"]>;
  imageArtifact: string;
  regions: RegionDraft[];
  responsePolicy: { maxBytes: string; mimes: ArtifactMime[]; sources: ("upload" | "capture")[] };
}
export function blankItemDraft(type: ItemType = "single_choice"): ItemDraft {
  const options = type === "true_false"
    ? [{ id: "true", text: "True" }, { id: "false", text: "False" }]
    : [{ id: "a", text: "" }, { id: "b", text: "" }];
  return {
    type,
    locale: "en",
    prompt: "",
    maxScore: "1",
    tags: "",
    topics:[],estimatedDifficulty:"",
    options,
    slots: [{ id: "response_1", accepted: "", x: "50", y: "50" }],
    correctOption: "",
    correctOptions: [],
    order: options.map((row) => row.id),
    accepted: "",
    numericValue: "",
    tolerance: "0",
    caseSensitive: false,
    partialCredit: false,
    rubricId: "",
    media: [],
    imageArtifact: "",
    regions: [blankRegionDraft()],
    responsePolicy: { maxBytes: "104857600", mimes: type === "audio_response" ? ["audio/mpeg", "audio/wav", "audio/ogg", "audio/webm", "audio/mp4"] : type === "video_response" ? ["video/mp4", "video/webm"] : ["application/pdf", "image/png", "image/jpeg", "image/webp"], sources: ["upload"] },
  };
}
const alternatives = (value: string) =>
  value.split("\n").map((row) => row.trim()).filter(Boolean);
const finite = (value: string, label: string) => {
  if (!value.trim()) throw new Error(`${label} is required.`);
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} must be a number.`);
  return n;
};
export function buildItemDraft(
  draft: ItemDraft,
): { item: Item; key: AnswerKey } {
  const interactive = ["diagram_labeling", "hotspot"].includes(draft.type);
  const item = validateItem({
    schema_version: "assessment.item.v1",
    type: draft.type,
    locale: draft.locale,
    prompt: draft.prompt,
    max_score: finite(draft.maxScore, "Maximum points"),
    tags: draft.tags.split(",").map((row) => row.trim()).filter(Boolean),
    ...((draft.topics?.some(value=>value.trim())||draft.estimatedDifficulty)?{classification:{topics:(draft.topics??[]).map(value=>value.trim()).filter(Boolean),...(draft.estimatedDifficulty?{estimated_difficulty:draft.estimatedDifficulty}:{})}}:{}),
    ...(needsOptions(draft.type) ? { options: draft.options } : {}),
    ...(needsSlots(draft.type)
      ? { response_ids: draft.slots.map((row) => row.id) }
      : {}),
    ...(isSubjective(draft.type) ? { rubric_id: draft.rubricId } : {}),
    ...(draft.media.length ? { media: draft.media } : {}),
    ...((MEDIA_RESPONSE_TYPES as readonly string[]).includes(draft.type) ? { media_response: { schema_version: MEDIA_POLICY_PROTOCOL, max_bytes: finite(draft.responsePolicy.maxBytes, "Maximum submission bytes"), mimes: draft.responsePolicy.mimes, sources: draft.responsePolicy.sources } } : {}),
    ...(interactive
      ? {
        image_response: {
          schema_version: IMAGE_RESPONSE_PROTOCOL,
          artifact_id: draft.imageArtifact,
          ...(draft.type === "diagram_labeling"
            ? {
              anchors: draft.slots.map((slot) => ({
                response_id: slot.id,
                x: draftCoordinate(slot.x ?? ""),
                y: draftCoordinate(slot.y ?? ""),
              })),
            }
            : {}),
        },
      }
      : {}),
  });
  let key: AnswerKey = {
    case_sensitive: draft.caseSensitive,
    partial_credit: draft.partialCredit,
  };
  if (isSubjective(draft.type)) key = {};
  else if (draft.type === "hotspot") {
    key.hotspot = { regions: draft.regions.map(buildRegionDraft) };
  } else if (draft.type === "numeric") {
    key.numeric = {
      value: finite(draft.numericValue, "Numeric answer"),
      tolerance: finite(draft.tolerance, "Tolerance"),
    };
  } else if (needsSlots(draft.type)) {
    key.correct = Object.fromEntries(
      draft.slots.map(
        (row) => [
          row.id,
          draft.type === "matching" ? row.accepted : alternatives(row.accepted),
        ],
      ),
    );
  } else if (["single_choice", "true_false"].includes(draft.type)) {
    key.correct = draft.correctOption;
  } else if (draft.type === "multi_choice") key.correct = draft.correctOptions;
  else if (draft.type === "ordering") key.correct = draft.order;
  else {key.correct = draft.type === "short_answer"
      ? alternatives(draft.accepted)
      : draft.accepted.trim();}
  if (draft.solution?.trim()) key.solution = draft.solution.trim();
  return { item, key: validateKey(item, key) };
}
export function editItemDraft(item: Item, key: AnswerKey): ItemDraft {
  const base = blankItemDraft(item.type), correct = key.correct;
  return {
    ...base,
    locale: item.locale,
    prompt: item.prompt,
    maxScore: String(item.max_score),
    tags: item.tags.join(", "),
    solution: key.solution ?? "",
    topics:[...(item.classification?.topics??[])],estimatedDifficulty:item.classification?.estimated_difficulty??"",
    options: structuredClone(item.options ?? base.options),
    slots: (item.response_ids ?? base.slots.map((row) => row.id)).map((id) => {
      const accepted =
        correct && typeof correct === "object" && !Array.isArray(correct)
          ? correct[id]
          : "";
      const anchor = item.image_response?.anchors?.find((row) =>
        row.response_id === id
      );
      return {
        id,
        accepted: Array.isArray(accepted)
          ? accepted.join("\n")
          : String(accepted ?? ""),
        ...(anchor ? { x: percent(anchor.x), y: percent(anchor.y) } : {}),
      };
    }),
    correctOption: typeof correct === "string" ? correct : "",
    correctOptions: Array.isArray(correct) ? [...correct] : [],
    order: item.type === "ordering" && Array.isArray(correct)
      ? [...correct]
      : (item.options ?? base.options).map((row) => row.id),
    accepted: Array.isArray(correct)
      ? correct.join("\n")
      : typeof correct === "string"
      ? correct
      : "",
    numericValue: key.numeric ? String(key.numeric.value) : "",
    tolerance: String(key.numeric?.tolerance ?? 0),
    caseSensitive: key.case_sensitive === true,
    partialCredit: key.partial_credit === true,
    rubricId: item.rubric_id ?? "",
    media: structuredClone(item.media ?? []),
    imageArtifact: item.image_response?.artifact_id ?? "",
    responsePolicy: item.media_response ? { maxBytes: String(item.media_response.max_bytes), mimes: [...item.media_response.mimes], sources: [...item.media_response.sources] } : base.responsePolicy,
    regions: key.hotspot?.regions.map((region, i) => ({
      ...blankRegionDraft(`region_${i + 1}`),
      ...Object.fromEntries(
        Object.entries(region).filter(([key]) =>
          key !== "shape" && key !== "points"
        ).map(([key, value]) => [key, percent(value as number)]),
      ),
      shape: region.shape,
      ...(region.shape === "polygon"
        ? {
          points: region.points.map((p) => ({
            x: percent(p.x),
            y: percent(p.y),
          })),
        }
        : {}),
    })) ?? base.regions,
  };
}
export function removeOption(draft: ItemDraft, id: string): ItemDraft {
  return {
    ...draft,
    options: draft.options.filter((row) => row.id !== id),
    correctOption: draft.correctOption === id ? "" : draft.correctOption,
    correctOptions: draft.correctOptions.filter((value) => value !== id),
    order: draft.order.filter((value) => value !== id),
    slots: draft.type === "matching"
      ? draft.slots.map((row) =>
        row.accepted === id ? { ...row, accepted: "" } : row
      )
      : draft.slots,
  };
}
export function moveOrder(order: string[], index: number, delta: -1 | 1) {
  const result = [...order], target = index + delta;
  if (target < 0 || target >= result.length) return result;
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}
/** Recovery accepts incomplete fields but rejects malformed cached structures before rendering. */
export function restoreItemDraft(value: unknown): ItemDraft {
  const raw = object(value);
  const str = (v: unknown, max = 50000) =>
    typeof v === "string" && v.length <= max;
  if (
    !ITEM_TYPES.includes(raw.type as ItemType) ||
    !["uz", "ru", "en"].includes(String(raw.locale)) ||
    ![
      "prompt",
      "maxScore",
      "tags",
      "correctOption",
      "accepted",
      "numericValue",
      "tolerance",
      "rubricId",
    ].every((id) => str(raw[id])) ||
    !["caseSensitive", "partialCredit"].every((id) =>
      typeof raw[id] === "boolean"
    )
  ) throw new Error("The saved question draft has an invalid structure.");
  if (
    !Array.isArray(raw.options) || raw.options.length > 100 ||
    raw.options.some((row) =>
      !row || !str(row.id, 80) || !str(row.text, 5000)
    ) || !Array.isArray(raw.slots) || raw.slots.length > 100 ||
    raw.slots.some((row) =>
      !row || !str(row.id, 200) || !str(row.accepted, 50000) ||
      ["x", "y"].some((key) => row[key] !== undefined && !str(row[key], 40))
    ) ||
    !["correctOptions", "order"].every((id) =>
      Array.isArray(raw[id]) && (raw[id] as unknown[]).length <= 100 &&
      (raw[id] as unknown[]).every((v) => str(v, 80))
    ) || !Array.isArray(raw.media) || raw.media.length > 20 ||
    raw.media.some((row) =>
      !row || !str(row.artifact_id, 36) ||
      !["image", "audio", "video"].includes(row.kind) || !str(row.alt, 1000)
    )
  ) {
    throw new Error(
      "The saved question draft contains invalid response fields.",
    );
  }
  const result = { ...blankItemDraft(raw.type as ItemType), ...raw };
  if(!Array.isArray(result.topics)||result.topics.length>20||result.topics.some(value=>!str(value,80))||typeof result.estimatedDifficulty!=='string'||!['','easy','medium','hard'].includes(result.estimatedDifficulty))throw new Error("Saved question classification is invalid.");
  if (result.solution !== undefined && !str(result.solution, 20000)) throw new Error("The saved worked solution is invalid.");
  const responsePolicy = result.responsePolicy as ItemDraft["responsePolicy"];
  if (!responsePolicy || !str(responsePolicy.maxBytes, 40) || !Array.isArray(responsePolicy.mimes) || responsePolicy.mimes.length > 10 || responsePolicy.mimes.some(mime => !Object.hasOwn(ARTIFACT_MIMES, mime)) || !Array.isArray(responsePolicy.sources) || responsePolicy.sources.length > 2 || responsePolicy.sources.some(source => !["upload", "capture"].includes(source))) throw new Error("Saved submission rules are invalid.");
  if (
    !str(result.imageArtifact, 36) || !Array.isArray(result.regions) ||
    result.regions.length > 20 ||
    result.regions.some((r: RegionDraft) =>
      !r || !str(r.id, 80) ||
      !["rectangle", "ellipse", "polygon"].includes(r.shape) ||
      !["x1", "y1", "x2", "y2", "x", "y", "radius_x", "radius_y"].every((key) =>
        str(r[key as keyof RegionDraft], 40)
      ) || !Array.isArray(r.points) || r.points.length > 32 ||
      r.points.some((p) => !p || !str(p.x, 40) || !str(p.y, 40))
    )
  ) throw new Error("Saved image interaction fields are invalid.");
  return structuredClone(result) as unknown as ItemDraft;
}
