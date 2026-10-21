export const PROMPT_MEDIA_PROTOCOL = "assessment.prompt-media.v1";
import {IMAGE_RESPONSE_PROTOCOL} from '../../assessment-core/src/image-response.ts';
import {MEDIA_ANSWER_DELIVERY_PROTOCOL,MEDIA_RESPONSE_TYPES} from '../../assessment-core/src/media-answer.ts';
import {ARTIFACT_MIMES} from '../../assessment-core/src/artifacts.ts';
export interface DeliveryRequirements {
  schema_version: "assessment.delivery-requirements.v1";
  prompt_media: ("image" | "audio" | "video")[];
  response_tools: string[];
  prompt_media_enabled: boolean;
  image_response_tools?:string[];
  image_responses_enabled?:boolean;
  image_response_protocol?:string;
  media_response_tools?:string[];
  media_responses_enabled?:boolean;
  media_response_protocol?:string;
  media_capture_groups?:{type:string;mimes:string[]}[];
}
export function assertDeliveryReady(
  value: unknown,
  configuration: {
    mediaUrl?: string;
    pageUrl: string;
    sharedCookie: boolean;
    cookieDomain?: string;
    recordingSupported?:(mime:string)=>boolean;
  },
) {
  const requirement = value as DeliveryRequirements;
  if (
    !requirement ||
    requirement.schema_version !== "assessment.delivery-requirements.v1" ||
    !Array.isArray(requirement.prompt_media) ||
    requirement.prompt_media.some(
      (kind) => !["image", "audio", "video"].includes(kind),
    ) ||
    !Array.isArray(requirement.response_tools) ||
    typeof requirement.prompt_media_enabled !== "boolean"
  )
    throw new Error(
      "The examination service did not return valid delivery requirements. Refresh before starting.",
    );
  if (requirement.response_tools.length)
    throw new Error(
      "This assessment requires response tools that are not connected yet. Contact your institution before starting.",
    );
  if(requirement.image_response_tools!==undefined){
    if(!Array.isArray(requirement.image_response_tools)||requirement.image_response_tools.some(tool=>!['hotspot','diagram_labeling'].includes(tool)))throw new Error('The examination returned invalid image response requirements.');
    if(requirement.image_response_tools.length&&(!requirement.image_responses_enabled||requirement.image_response_protocol!==IMAGE_RESPONSE_PROTOCOL))throw new Error('Image responses are not enabled for this Exam client. Contact your institution before starting.');
  }
  if(requirement.media_response_tools!==undefined){
    if(!Array.isArray(requirement.media_response_tools)||requirement.media_response_tools.some(tool=>!(MEDIA_RESPONSE_TYPES as readonly string[]).includes(tool)))throw new Error('The examination returned invalid academic media requirements.');
    if(requirement.media_response_tools.length&&(!requirement.media_responses_enabled||requirement.media_response_protocol!==MEDIA_ANSWER_DELIVERY_PROTOCOL))throw new Error('Academic media answers are not enabled for this Exam client.');
    if(!Array.isArray(requirement.media_capture_groups)||requirement.media_capture_groups.some(group=>!group||!['audio_response','video_response'].includes(group.type)||!Array.isArray(group.mimes)||!group.mimes.length||group.mimes.some(mime=>!Object.hasOwn(ARTIFACT_MIMES,mime)||!mime.startsWith(group.type==='audio_response'?'audio/':'video/'))))throw new Error('The examination returned invalid capture format requirements.');
    if(requirement.media_capture_groups.some(group=>!group.mimes.some(mime=>configuration.recordingSupported?.(mime))))throw new Error('This browser cannot record an allowed format for a capture-only question. Use a supported browser before starting.');
  }
  if (!requirement.prompt_media.length&&!requirement.media_response_tools?.length) return;
  if (requirement.prompt_media.length&&!requirement.prompt_media_enabled)
    throw new Error(
      "Protected media delivery is not enabled for this assessment service. Contact your institution before starting.",
    );
  if (!configuration.mediaUrl)
    throw new Error(
      "The protected media service has not been configured. Contact your institution before starting.",
    );
  let media: URL, page: URL;
  try {
    media = new URL(configuration.mediaUrl);
    page = new URL(configuration.pageUrl);
  } catch {
    throw new Error("The protected media address is invalid.");
  }
  if (
    media.username ||
    media.password ||
    media.search ||
    media.hash ||
    media.pathname !== "/" ||
    !(
      media.protocol === "https:" ||
      (media.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(media.hostname))
    )
  )
    throw new Error("The protected media address is invalid.");
  if (media.hostname === page.hostname && media.protocol === page.protocol)
    return;
  const domain = (configuration.cookieDomain ?? "")
    .replace(/^\./, "")
    .toLowerCase();
  const belongs = (host: string) =>
    host === domain || host.endsWith(`.${domain}`);
  if (
    !configuration.sharedCookie ||
    !domain ||
    !domain.includes(".") ||
    media.protocol !== "https:" ||
    page.protocol !== "https:" ||
    !belongs(media.hostname) ||
    !belongs(page.hostname)
  )
    throw new Error(
      "Protected playback requires a shared Schood sign-in domain. Contact your institution before starting.",
    );
}
