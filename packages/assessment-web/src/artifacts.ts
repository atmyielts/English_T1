import { request, supabase, ServiceRequestError } from "./client";
import { ResponseJournal } from "./journal";
import {
  ArtifactUploads,
  type UploadIntent,
  type UploadReceipt,
} from "./artifact-upload";
import { artifactUpload } from "../../assessment-core/src/artifacts.ts";
import { uuid } from "../../assessment-core/src/mod.ts";
import {LocalizedError,english} from './i18n/translate.ts';
export interface ArtifactRow {
  id: string;
  filename: string;
  mime: string;
  kind: "image" | "audio" | "video" | "file";
  byte_length: number;
  state: "uploading" | "quarantined" | "ready" | "rejected" | "cancelled";
  created_by: string;
}
export interface ArtifactPage {
  items: ArtifactRow[];
  next_cursor: string | null;
}
export const mediaConfigured = Boolean(
  import.meta.env.VITE_ASSESSMENT_MEDIA_URL,
);
function mediaBase() {
  if (!mediaConfigured)
    throw new LocalizedError("artifact.protectedMediaServiceBeen");
  const base = new URL(import.meta.env.VITE_ASSESSMENT_MEDIA_URL);
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/" ||
    (base.protocol !== "https:" &&
      !(
        base.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(base.hostname)
      ))
  )
    throw new LocalizedError("artifact.protectedMediaEndpointInvalid");
  return base;
}
export function artifactUrl(id: string, tenant: string, attempt?: string, task?: string) {
  if (attempt && task) throw new LocalizedError("artifact.chooseCandidateMarkingContext");
  const url = new URL(`/v1/artifacts/${uuid(id)}`, mediaBase());
  url.searchParams.set("tenant_id", uuid(tenant));
  if (attempt) url.searchParams.set("attempt_id", uuid(attempt));
  if (task) url.searchParams.set("task_id", uuid(task));
  return url.href;
}
export const artifactPage = (tenant: string, actor: string, after?: string) =>
  request<ArtifactPage>(
    `artifacts/library?limit=100${after ? `&after=${encodeURIComponent(uuid(after))}` : ""}`,
    tenant,
    undefined,
    undefined,
    undefined,
    actor,
  );
export async function artifactTransport<T>(
  tenant: string,
  actor: string,
  id: string,
  suffix: string,
  method: string,
  bytes?: ArrayBuffer,
  active: () => void = () => {},
): Promise<T> {
  const url = new URL(`/v1/artifacts/${uuid(id)}${suffix}`, mediaBase());
  url.searchParams.set("tenant_id", uuid(tenant));
  if (!supabase) throw new LocalizedError("common.serviceUnconfigured");
  const { data } = await supabase.auth.getSession();
  active();
  if (!data.session || data.session.user.id !== actor)
    throw new LocalizedError("common.accountChanged");
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${data.session.access_token}`,
        ...(bytes ? { "content-type": "application/octet-stream" } : {}),
      },
      signal: controller.signal,
      ...(bytes ? { body: bytes } : {}),
    });
    const payload = await response.json();
    if (!response.ok)
      throw new ServiceRequestError(
        response.status,
        payload.code ?? "media_request_failed",
        payload.error ?? english("artifact.requestFailed"),
      );
    return payload.data as T;
  } finally {
    clearTimeout(timer);
  }
}
export async function openArtifactUploads(tenant: string, actor: string) {
  mediaBase();
  uuid(tenant);
  uuid(actor);
  if (!navigator.locks)
    throw new LocalizedError("artifact.locks");
  const scope = `artifact-upload:${tenant}:${actor}`,
    journal = await ResponseJournal.create(scope);
  let closed = false;
  const active = () => {
    if (closed)
      throw new LocalizedError("artifact.mediaWorkspaceClosedReopen");
  };
  const store = {
    async pending(): Promise<UploadIntent | null> {
      const rows = await journal.pending(),
        begin = rows.find((row) => row.sequence === 1);
      if (!begin) return null;
      return {
        key: begin.command_key,
        manifest: artifactUpload(begin.response),
        cancelling: rows.some((row) => row.sequence === 2),
      };
    },
    async save(manifest: Parameters<typeof artifactUpload>[0]) {
      const entry = await journal.append(
        1,
        "artifact-upload",
        artifactUpload(manifest),
      );
      return {
        key: entry.command_key,
        manifest: artifactUpload(entry.response),
        cancelling: false,
      };
    },
    async cancel() {
      await journal.append(2, "artifact-cancel", { cancelling: true });
    },
    async acknowledge() {
      // Delete the begin last: an interrupted cleanup retains its stable identity.
      await journal.acknowledge(2);
      await journal.acknowledge(1);
    },
  };
  const uploads = new ArtifactUploads(
    store,
    {
      begin: (intent) => {
        active();
        return request<UploadReceipt>(
          "artifacts/commands",
          tenant,
          { action: "upload.begin", data: intent.manifest },
          undefined,
          intent.key,
          actor,
        );
      },
      part: (id, index, bytes) =>
        artifactTransport(tenant, actor, id, `/parts/${index}`, "PUT", bytes, active),
      complete: (id) =>
        artifactTransport<UploadReceipt>(
          tenant,
          actor,
          id,
          "/complete",
          "POST",
          undefined,
          active,
        ),
      cancel: (id, key) => {
        active();
        return request<UploadReceipt>(
          "artifacts/commands",
          tenant,
          { action: "upload.cancel", data: { artifact_id: id } },
          undefined,
          key,
          actor,
        );
      },
    },
    async <T>(work: () => Promise<T>): Promise<T> =>
      await navigator.locks.request(`schood-artifact-upload:${scope}`, work),
  );
  return {
    uploads,
    close: () => {
      closed = true;
      journal.close();
    },
  };
}
