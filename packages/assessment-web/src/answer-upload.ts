import { request } from "./client";
import { artifactTransport } from "./artifacts";
import type { AttemptRuntime } from "./runtime";
import { AnswerFileStore } from "./answer-file-store";
import { AnswerTransfers } from "./answer-transfers";
export interface CandidateAnswerAsset {
  id: string;
  content_hash: string;
  admission_key: string | null;
  filename: string;
  mime: string;
  byte_length: number;
  state: string;
  source: string;
  upload_expires_at: string;
}
export const candidateAnswerAssets = (
  tenant: string,
  actor: string,
  attempt: string,
  item: string,
) =>
  request<CandidateAnswerAsset[]>(
    `answers/uploads?attempt_id=${
      encodeURIComponent(attempt)
    }&item_version_id=${encodeURIComponent(item)}`,
    tenant,
    undefined,
    undefined,
    undefined,
    actor,
  );
export async function openAnswerFiles(
  tenant: string,
  actor: string,
  attempt: string,
  runtime: () => AttemptRuntime | null,
) {
  const store = await AnswerFileStore.create(tenant, actor, attempt);
  let closed = false;
  const active = () => {
    if (closed) {
      throw new Error(
        "The academic answer workspace closed. Reopen this candidate and attempt to recover its saved bytes.",
      );
    }
  };
  const transfers = new AnswerTransfers(
    store,
    {
      recover: async (file) => {
        active();
        const rows = await candidateAnswerAssets(
          tenant,
          actor,
          attempt,
          file.item_version_id,
        );
        active();
        return rows.find((row) => row.admission_key === file.key) ?? null;
      },
      admit: (file) => {
        active();
        const coordinator = runtime();
        if (!coordinator) {
          throw new Error(
            "Reconnect the active exam device before admitting a new answer.",
          );
        }
        return coordinator.withAnswerLease(async (lease) => {
          active();
          return await request<{ id: string; content_hash: string }>(
            "answers/commands",
            tenant,
            {
              action: "upload.begin",
              data: {
                attempt_id: attempt,
                item_version_id: file.item_version_id,
                source: file.source,
                upload: file.manifest,
                lease,
              },
            },
            undefined,
            file.key,
            actor,
          );
        });
      },
      part: (id, index, bytes) =>
        artifactTransport(
          tenant,
          actor,
          id,
          `/parts/${index}`,
          "PUT",
          bytes.buffer,
          active,
        ),
      complete: (id) =>
        artifactTransport(
          tenant,
          actor,
          id,
          "/complete",
          "POST",
          undefined,
          active,
        ),
    },
    async <T>(file: string, work: () => Promise<T>): Promise<T> =>
      await navigator.locks.request(
        `academic-answer-transfer:${tenant}:${actor}:${attempt}:${file}`,
        work,
      ),
    active,
  );
  return {
    store,
    transfers,
    close() {
      closed = true;
      store.close();
    },
  };
}
