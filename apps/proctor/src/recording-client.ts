import {
  proctorRequest,
  supabase,
} from "../../../packages/assessment-web/src/client";
import { captureDigest } from "../../../packages/proctor-web/src/capture-upload";
import type {
  RecordingPage,
  RecordingRow,
  RecordingSegment,
} from "../../../packages/proctor-web/src/recording-types";
import { LocalizedError } from "../../../packages/assessment-web/src/i18n/translate.ts";
import { AppError } from "./i18n/index.ts";
export type { RecordingPage, RecordingRow, RecordingSegment };
export async function recordingPage(
  id: string,
  after: number,
  tenant: string,
  actor: string,
) {
  try {
    return await proctorRequest<RecordingPage>(
      `recordings/${id}?after=${after}&limit=100`,
      tenant,
      undefined,
      undefined,
      actor,
    );
  } catch {
    throw new AppError("client.recordingAuthorization");
  }
}
export async function recordingBytes(
  id: string,
  segment: RecordingSegment,
  tenant: string,
  actor: string,
  signal: AbortSignal,
) {
  const raw = import.meta.env.VITE_PROCTOR_EVIDENCE_URL as string | undefined;
  if (!raw) {
    throw new AppError("client.playbackUnconfigured");
  }
  const base = new URL(raw),
    loopback = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (
    (base.protocol !== "https:" && !(base.protocol === "http:" && loopback)) ||
    base.username || base.password || base.search || base.hash ||
    base.pathname !== "/"
  ) throw new LocalizedError("capture.privateEvidenceEndpointSecure");
  if (!supabase) throw new LocalizedError("common.signIn");
  const { data } = await supabase.auth.getSession();
  if (!data.session || data.session.user.id !== actor) {
    throw new LocalizedError("error.account_changed");
  }
  const url = new URL(
    `/v1/recordings/${id}/segments/${segment.sequence}`,
    base,
  );
  url.searchParams.set("tenant_id", tenant);
  const controller = new AbortController(), abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(abort, 20000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${data.session.access_token}` },
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new AppError("client.recordingDenied");
    }
    reader = response.body?.getReader();
    if (!reader || !segment.byte_length || segment.byte_length > 8388608) {
      throw new AppError("client.segmentInvalid");
    }
    const bytes = new Uint8Array(segment.byte_length);
    let offset = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > bytes.length) {
        throw new AppError("client.bytesExceed");
      }
      bytes.set(value, offset);
      offset += value.length;
    }
    if (
      offset !== bytes.length || await captureDigest(bytes) !== segment.sha256
    ) throw new AppError("client.integrity");
    return bytes;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    void reader?.cancel().catch(() => {});
  }
}
