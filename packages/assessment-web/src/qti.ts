import { request, ServiceRequestError, supabase } from "./client";
import type { ImportRow } from "../../assessment-core/src/bank-import.ts";
import { uuid } from "../../assessment-core/src/mod.ts";
export interface QtiJob {
  id: string;
  bank_id: string;
  filename: string;
  source_hash: string;
  state: string;
  revision: number;
  created_by: string;
  byte_length: number;
  review_hash: string | null;
  received_parts: number[];
  total: number;
  rows: (ImportRow & { identifier: string; source_path: string })[];
  blocked: { path: string; code: string; message: string }[];
  adoption: { import_id: string } | null;
  scan?: QtiScan | null;
}
export interface QtiScan {
  verdict: "clean" | "rejected";
  byte_verified: boolean;
  reason:
    | "clean"
    | "malware_or_engine_limit"
    | "source_hash_mismatch"
    | "historical_metadata";
  engine_version: string;
  signature_version: string;
}
export const qtiConfigured = Boolean(import.meta.env.VITE_ASSESSMENT_QTI_URL);
export const readQti = <T>(path: string, tenant: string, actor: string) =>
  request<T>(`qti/${path}`, tenant, undefined, undefined, undefined, actor);
export async function qtiTransport(
  tenant: string,
  actor: string,
  job: string,
  suffix: string,
  bytes: ArrayBuffer | undefined,
  signal: AbortSignal,
) {
  const base = new URL(import.meta.env.VITE_ASSESSMENT_QTI_URL);
  if (
    base.username || base.password || base.search || base.hash ||
    base.pathname !== "/" ||
    (base.protocol !== "https:" &&
      !(base.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(base.hostname)))
  ) {
    throw new Error("The protected QTI endpoint is not configured correctly.");
  }
  const url = new URL(`/v1/qti/sources/${uuid(job)}/${suffix}`, base);
  url.searchParams.set("tenant_id", uuid(tenant));
  if (!supabase) throw new Error("The assessment service is not configured.");
  const { data } = await supabase.auth.getSession();
  signal.throwIfAborted();
  if (!data.session || data.session.user.id !== actor) {
    throw new Error("The signed-in account changed. Reopen this workspace.");
  }
  const response = await fetch(url, {
    method: bytes ? "PUT" : "POST",
    redirect: "error",
    headers: {
      authorization: `Bearer ${data.session.access_token}`,
      ...(bytes ? { "content-type": "application/octet-stream" } : {}),
    },
    body: bytes,
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
  });
  const payload = await response.json();
  signal.throwIfAborted();
  if (!response.ok) {
    throw new ServiceRequestError(
      response.status,
      payload.code ?? "qti_transport_failed",
      payload.error ??
        "The package transfer failed. Select the same file and resume.",
    );
  }
  return payload.data;
}
