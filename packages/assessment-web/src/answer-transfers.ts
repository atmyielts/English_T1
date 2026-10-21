import {
  MEDIA_ANSWER_PROTOCOL,
  mediaAnswer,
} from "../../assessment-core/src/media-answer.ts";
import { artifactHex } from "../../assessment-core/src/artifacts.ts";
import { uuid } from "../../assessment-core/src/mod.ts";
import type { LocalAnswerFile } from "./answer-types.ts";
export interface AnswerTransferStore {
  read(file: string): Promise<LocalAnswerFile>;
  bind(file: string, binding: unknown): Promise<LocalAnswerFile>;
  part(file: string, index: number): Promise<Uint8Array<ArrayBuffer>>;
  checkpoint(
    file: string,
    next: number,
    completed?: {
      state: "quarantined" | "ready" | "rejected";
      manifest_hash: string;
    },
  ): Promise<LocalAnswerFile>;
}
export interface AnswerTransferBackend {
  recover?(
    file: LocalAnswerFile,
  ): Promise<{ id: string; content_hash: string } | null>;
  admit(file: LocalAnswerFile): Promise<{ id: string; content_hash: string }>;
  part(
    id: string,
    index: number,
    bytes: Uint8Array<ArrayBuffer>,
  ): Promise<unknown>;
  complete(
    id: string,
  ): Promise<{ id: string; state: string; manifest_hash: string }>;
}
/** No response selection callback exists here. Upload/recovery cannot turn a
 * device copy or a historical academic receipt into the current answer. */
export class AnswerTransfers {
  constructor(
    private store: AnswerTransferStore,
    private backend: AnswerTransferBackend,
    private lock: <T>(file: string, work: () => Promise<T>) => Promise<T>,
    private active: () => void = () => {},
  ) {}
  private async bound(file: string, admitNew = true) {
    this.active();
    const state = await this.store.read(file);
    this.active();
    if (state.phase !== "sealed" || !state.manifest) {
      throw new Error(
        "Finish and seal the complete local answer before admission or upload.",
      );
    }
    if (state.binding) {
      mediaAnswer(state.binding);
      return state;
    }
    let receipt = await this.backend.recover?.(state);
    this.active();
    if (!receipt) {
      if (!admitNew) {
        throw new Error(
          "This device copy has no matching prior admission receipt. Recovery cannot admit or select a new answer after the clock closes.",
        );
      }
      receipt = await this.backend.admit(state);
    }
    this.active();
    const binding = mediaAnswer({
      schema_version: MEDIA_ANSWER_PROTOCOL,
      artifact_id: receipt.id,
      content_hash: receipt.content_hash,
    });
    const bound = await this.store.bind(file, binding);
    this.active();
    return bound;
  }
  admit(file: string) {
    return this.lock(file, () => this.bound(file));
  }
  upload(
    file: string,
    progress: (done: number, total: number) => void = () => {},
  ) {
    return this.transfer(file, progress, true);
  }
  recoverUpload(
    file: string,
    progress: (done: number, total: number) => void = () => {},
  ) {
    return this.transfer(file, progress, false);
  }
  private transfer(
    file: string,
    progress: (done: number, total: number) => void,
    admitNew: boolean,
  ) {
    return this.lock(file, async () => {
      let state = await this.bound(file, admitNew);
      this.active();
      if (state.upload?.completed) return state;
      const id = state.binding!.artifact_id, manifest = state.manifest!;
      let index = state.upload?.next_part ?? 0;
      progress(
        manifest.parts.slice(0, index).reduce(
          (sum, part) => sum + part.byte_length,
          0,
        ),
        manifest.byte_length,
      );
      for (; index < manifest.parts.length; index++) {
        this.active();
        const bytes = await this.store.part(file, index);
        this.active();
        await this.backend.part(id, index, bytes);
        this.active();
        state = await this.store.checkpoint(file, index + 1);
        this.active();
        progress(
          Math.min((index + 1) * 1048576, manifest.byte_length),
          manifest.byte_length,
        );
      }
      const receipt = await this.backend.complete(id);
      this.active();
      if (
        uuid(receipt.id) !== id ||
        !["quarantined", "ready", "rejected"].includes(receipt.state)
      ) {
        throw new Error(
          "The service did not confirm completion of this academic answer.",
        );
      }
      const completed = await this.store.checkpoint(
        file,
        manifest.parts.length,
        {
          state: receipt.state as "quarantined" | "ready" | "rejected",
          manifest_hash: artifactHex(receipt.manifest_hash),
        },
      );
      this.active();
      return completed;
    });
  }
}
