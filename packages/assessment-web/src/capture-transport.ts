import { proctorRequest, ServiceRequestError, supabase } from "./client";
import type { CaptureBackend } from "../../proctor-web/src/capture-runtime";
import type { RecordingCheckpoint } from "../../proctor-web/src/recording-types";
import {LocalizedError,english} from './i18n/translate.ts';
export function evidenceEndpoint() {
  const raw = import.meta.env.VITE_PROCTOR_EVIDENCE_URL as string | undefined;
  if (!raw) {
    throw new LocalizedError("capture.privateExamRecordingConfigured");
  }
  const base = new URL(raw),
    loopback = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (
    (base.protocol !== "https:" && !(base.protocol === "http:" && loopback)) ||
    base.username || base.password || base.search || base.hash ||
    base.pathname !== "/"
  ) throw new LocalizedError("capture.privateEvidenceEndpointSecure");
  return base;
}
export function captureTransport(
  tenant: string,
  actor: string,
  denied: () => void,
): CaptureBackend {
  const base = evidenceEndpoint();
  async function checkFailure(cause: unknown): Promise<never> {
    if (
      [401, 403].includes((cause as { status?: number })?.status ?? 0) ||
      /signed-in account changed|sign in to continue/i.test(
        (cause as Error)?.message ?? "",
      )
    ) denied();
    throw cause;
  }
  async function bytes<T>(
    recording: string,
    sequence: number,
    suffix: string,
    method: string,
    data?: Uint8Array,
  ): Promise<T> {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 15000);
    try {
      if (!supabase) throw new LocalizedError("common.signIn");
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session || auth.session.user.id !== actor) {
        throw new LocalizedError("common.accountChanged");
      }
      const url = new URL(
        `/v1/recordings/${recording}/segments/${sequence}/${suffix}`,
        base,
      );
      url.searchParams.set("tenant_id", tenant);
      const response = await fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${auth.session.access_token}`,
          ...(data ? { "Content-Type": "application/octet-stream" } : {}),
        },
        ...(data ? { body: new Uint8Array(data).buffer } : {}),
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new ServiceRequestError(
          response.status,
          payload.code ?? "capture_transport_failed",
          payload.error ?? english("capture.syncFailed"),
        );
      }
      return payload.data as T;
    } catch (cause) {
      return checkFailure(cause);
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    command: (action, data, key) =>
      proctorRequest<{ sequence: number; head_hash: string; state: string }>(
        "recordings/commands",
        tenant,
        { action, data },
        key,
        actor,
      ).catch(checkFailure),
    checkpoint: (id, sequence) =>
      proctorRequest<RecordingCheckpoint>(
        `recordings/candidate/${id}?sequence=${sequence}`,
        tenant,
        undefined,
        undefined,
        actor,
      ).catch(checkFailure),
    part: (id, sequence, index, data) =>
      bytes(id, sequence, "parts/" + index, "PUT", data),
    complete: (id, sequence) => bytes(id, sequence, "complete", "POST"),
  };
}
