import { canonicalJson } from "../../assessment-core/src/mod.ts";
import {
  ARTIFACT_CHUNK_BYTES,
  ARTIFACT_MAX_BYTES,
  artifactUpload,
  type ArtifactUpload,
  type ArtifactMime,
} from "../../assessment-core/src/artifacts.ts";
import {LocalizedError} from './i18n/translate.ts';
export interface UploadFile extends Blob {
  readonly name: string;
}
export interface UploadIntent {
  key: string;
  manifest: ArtifactUpload;
  cancelling: boolean;
}
export interface UploadStore {
  pending(): Promise<UploadIntent | null>;
  save(manifest: ArtifactUpload): Promise<UploadIntent>;
  cancel(): Promise<void>;
  acknowledge(): Promise<void>;
}
export interface UploadReceipt {
  id: string;
  state: string;
}
export interface UploadBackend {
  begin(intent: UploadIntent): Promise<UploadReceipt>;
  part(id: string, index: number, bytes: ArrayBuffer): Promise<unknown>;
  complete(id: string): Promise<UploadReceipt>;
  cancel(id: string, key: string): Promise<UploadReceipt>;
}
export interface UploadProgress {
  stage: "checking" | "uploading" | "scanning";
  done: number;
  total: number;
}
export async function fileManifest(
  file: UploadFile,
  mime: ArtifactMime,
  progress: (p: UploadProgress) => void = () => {},
) {
  if (!file.size || file.size > ARTIFACT_MAX_BYTES)
    throw new LocalizedError("upload.chooseNonemptyFileUp");
  const parts = [];
  progress({ stage: "checking", done: 0, total: file.size });
  for (let offset = 0; offset < file.size; offset += ARTIFACT_CHUNK_BYTES) {
    const bytes = await file
      .slice(offset, offset + ARTIFACT_CHUNK_BYTES)
      .arrayBuffer();
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    parts.push({
      sha256: Array.from(digest, (v) => v.toString(16).padStart(2, "0")).join(
        "",
      ),
      byte_length: bytes.byteLength,
    });
    progress({
      stage: "checking",
      done: offset + bytes.byteLength,
      total: file.size,
    });
  }
  return artifactUpload({
    filename: file.name,
    mime,
    byte_length: file.size,
    parts,
  });
}
/** Only encrypted metadata persists. A reload requires selecting the same file;
 * its complete pinned manifest is checked before any part is sent. */
export class ArtifactUploads {
  private flight: Promise<UploadReceipt> | null = null;
  constructor(
    private store: UploadStore,
    private backend: UploadBackend,
    private lock: <T>(work: () => Promise<T>) => Promise<T>,
  ) {}
  pending() {
    return this.store.pending();
  }
  upload(
    file: UploadFile,
    mime: ArtifactMime,
    progress: (p: UploadProgress) => void = () => {},
  ) {
    return this.run(async () => {
      const manifest = await fileManifest(file, mime, progress);
      let intent = await this.store.pending();
      if (intent?.cancelling)
        throw new LocalizedError("upload.retrySavedUploadCancellation");
      if (intent && canonicalJson(intent.manifest) !== canonicalJson(manifest))
        throw new LocalizedError("upload.reselectOriginalFileFormat");
      intent ??= await this.store.save(manifest);
      const begun = await this.backend.begin(intent);
      let done = 0;
      for (let index = 0; index < manifest.parts.length; index++) {
        const bytes = await file
          .slice(
            index * ARTIFACT_CHUNK_BYTES,
            (index + 1) * ARTIFACT_CHUNK_BYTES,
          )
          .arrayBuffer();
        await this.backend.part(begun.id, index, bytes);
        done += bytes.byteLength;
        progress({ stage: "uploading", done, total: file.size });
      }
      const receipt = await this.backend.complete(begun.id);
      if (!["quarantined", "ready", "rejected"].includes(receipt.state))
        throw new LocalizedError("upload.serviceConfirmUploadCompletion");
      await this.store.acknowledge();
      progress({ stage: "scanning", done: file.size, total: file.size });
      return receipt;
    });
  }
  cancel() {
    return this.run(async () => {
      const intent = await this.store.pending();
      if (!intent) throw new LocalizedError("upload.nothingToCancel");
      if (!intent.cancelling) await this.store.cancel();
      const begun = await this.backend.begin(intent);
      let receipt: UploadReceipt;
      try {
        receipt = await this.backend.cancel(begun.id, `${intent.key}:cancel`);
      } catch (cause) {
        if ((cause as { code?: string }).code !== "artifact_already_completed")
          throw cause;
        receipt = await this.backend.complete(begun.id);
      }
      if (
        !["cancelled", "quarantined", "ready", "rejected"].includes(
          receipt.state,
        )
      )
        throw new LocalizedError("upload.serviceConfirmCancellation");
      await this.store.acknowledge();
      return receipt;
    });
  }
  private run(work: () => Promise<UploadReceipt>) {
    if (this.flight)
      return Promise.reject(
        new LocalizedError("upload.waitCurrentUploadOperation"),
      );
    const result = this.lock(work);
    this.flight = result;
    void result
      .finally(() => {
        if (this.flight === result) this.flight = null;
      })
      .catch(() => {});
    return result;
  }
}
