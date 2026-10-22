import { ContractError, object, uuid } from "./mod.ts";
export const CAPTURE_PROTOCOL = "proctor.capture.v1";
export function captureBinding(value: unknown) {
  const data = object(value);
  if (
    typeof data.token_hash !== "string" ||
    !/^[a-f0-9]{64}$/.test(data.token_hash)
  ) {
    throw new ContractError(
      "invalid_capture_binding",
      "The capture device binding is invalid.",
    );
  }
  return { device_id: uuid(data.device_id), token_hash: data.token_hash };
}
export function captureCommand(
  action: string,
  value: unknown,
): Record<string, unknown> {
  if (
    !["capture.open", "capture.heartbeat", "capture.cancel"].includes(action)
  ) {
    throw new ContractError(
      "unknown_capture_action",
      "Unknown capture preparation action.",
    );
  }
  const data = object(value), binding = captureBinding(data);
  return action === "capture.open"
    ? { registration_id: uuid(data.registration_id), ...binding }
    : { session_id: uuid(data.session_id), ...binding };
}
export interface CaptureLaunch {
  auto_pause?: boolean;
  monitoring_mode?: "browser" | "record_review" | "live";
  recording_ready?: boolean;
  live_ready?: boolean;
  schema_version: typeof CAPTURE_PROTOCOL;
  session_id: string;
  registration_id: string;
  attempt_id: string | null;
  state: "preparing" | "active" | "paused" | "completed";
  policy_id: string;
  expires_at: string;
  activated_at: string | null;
  ready: boolean;
  sources: { source: "camera" | "microphone" | "screen"; ready: boolean }[];
  server_time: string;
}
/** Browser interaction policy only. The canonical runtime still owns leases,
 * clocks and pause/warning enforcement; this never authorizes a server write. */
export function captureInteractionReady(
  required: boolean,
  localReady: boolean,
  state: string | undefined,
  autoPause: boolean | undefined,
) {
  return !required || localReady || state === "active" && autoPause === false;
}
