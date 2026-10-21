import type {
  ArtifactMime,
  ArtifactUpload,
} from "../../assessment-core/src/artifacts.ts";
import type { mediaAnswer } from "../../assessment-core/src/media-answer.ts";
export interface LocalAnswerFile {
  id: string;
  key: string;
  item_version_id: string;
  filename: string;
  mime: ArtifactMime;
  source: "upload" | "capture";
  max_bytes: number;
  byte_length: number;
  phase: "open" | "sealed";
  manifest?: ArtifactUpload;
  binding?: ReturnType<typeof mediaAnswer>;
  upload?: {
    next_part: number;
    completed?: {
      state: "quarantined" | "ready" | "rejected";
      manifest_hash: string;
    };
  };
}
