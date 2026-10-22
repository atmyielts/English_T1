import { ContractError, object, uuid } from "./mod.ts";
import {
  ARTIFACT_MAX_BYTES,
  ARTIFACT_MIMES,
  artifactHex,
  artifactInteger,
  type ArtifactMime,
  artifactMime,
  artifactUpload,
} from "./artifacts.ts";

export const MEDIA_ANSWER_PROTOCOL = "assessment.media-answer.v1";
// Delivery capability evolves independently of immutable answer references.
// Earlier clients used the answer binding version but lacked native audio.
export const MEDIA_ANSWER_DELIVERY_PROTOCOL = "assessment.media-delivery.v2";
export const MEDIA_POLICY_PROTOCOL = "assessment.media-policy.v1";
export const MEDIA_RESPONSE_TYPES = [
  "audio_response",
  "video_response",
  "file_response",
] as const;
export type MediaResponseType = typeof MEDIA_RESPONSE_TYPES[number];
export interface MediaAnswerPolicy {
  schema_version: typeof MEDIA_POLICY_PROTOCOL;
  mimes: ArtifactMime[];
  max_bytes: number;
  sources: ("upload" | "capture")[];
}
const invalid = (message: string): never => {
  throw new ContractError("invalid_media_answer", message);
};
export function mediaAnswerPolicy(
  value: unknown,
  type: MediaResponseType,
): MediaAnswerPolicy {
  const raw = object(value);
  if (
    raw.schema_version !== MEDIA_POLICY_PROTOCOL ||
    Object.keys(raw).some((key) =>
      !["schema_version", "mimes", "max_bytes", "sources"].includes(key)
    )
  ) invalid("Use a supported media answer policy.");
  if (!Array.isArray(raw.mimes) || !raw.mimes.length || raw.mimes.length > 10) {
    invalid("Choose the permitted answer formats.");
  }
  const mimes = (raw.mimes as unknown[]).map(artifactMime);
  if (
    new Set(mimes).size !== mimes.length ||
    mimes.some((mime) =>
      type === "audio_response"
        ? ARTIFACT_MIMES[mime] !== "audio"
        : type === "video_response"
        ? ARTIFACT_MIMES[mime] !== "video"
        : !["file", "image"].includes(ARTIFACT_MIMES[mime])
    )
  ) invalid("Answer formats must match the question type.");
  if (
    !Array.isArray(raw.sources) || !raw.sources.length ||
    raw.sources.length > 2 ||
    new Set(raw.sources).size !== raw.sources.length ||
    raw.sources.some((source) =>
      !["upload", "capture"].includes(String(source)) ||
      (type === "file_response" && source !== "upload")
    )
  ) invalid("Choose permitted upload or recording sources.");
  return {
    schema_version: MEDIA_POLICY_PROTOCOL,
    mimes,
    max_bytes: artifactInteger(
      raw.max_bytes,
      "Maximum answer bytes",
      1,
      ARTIFACT_MAX_BYTES,
    ),
    sources: raw.sources as MediaAnswerPolicy["sources"],
  };
}
/** Only an opaque, immutable binding belongs in an academic response journal. */
export function mediaAnswer(value: unknown) {
  const raw = object(value);
  if (
    raw.schema_version !== MEDIA_ANSWER_PROTOCOL ||
    Object.keys(raw).some((key) =>
      !["schema_version", "artifact_id", "content_hash"].includes(key)
    )
  ) invalid("Use a bound academic answer, not a URL or recording identifier.");
  return {
    schema_version: MEDIA_ANSWER_PROTOCOL,
    artifact_id: uuid(raw.artifact_id),
    content_hash: artifactHex(raw.content_hash),
  };
}
export function mediaAnswerAdmission(value: unknown) {
  const raw = object(value);
  if (!["upload", "capture"].includes(String(raw.source))) {
    invalid("Choose how the academic answer was produced.");
  }
  return {
    attempt_id: uuid(raw.attempt_id),
    item_version_id: uuid(raw.item_version_id),
    source: raw.source as "upload" | "capture",
    upload: artifactUpload(raw.upload),
  };
}
