import React from "react";
import type { Preflight } from "../../../packages/proctor-web/src/types";
export function PreflightScreen({
  policy,
  acknowledged,
  setAcknowledged,
  busy,
  proceed,
  cancel,
  captureReady = false,
  capturePrepared = false,
  children,
}: {
  policy: Extract<Preflight, { required: true }>;
  acknowledged: boolean;
  setAcknowledged: (value: boolean) => void;
  busy: boolean;
  proceed: () => void;
  cancel: () => void;
  captureReady?: boolean;
  capturePrepared?: boolean;
  children?: React.ReactNode;
}) {
  const rules = policy.policy,
    capture = [
      rules.camera && "Camera",
      rules.microphone && "Microphone",
      rules.screen && "Screen",
      rules.second_camera && "Second camera",
    ].filter(Boolean);
  const needsCapture = policy.capture_required === true;
  const action = needsCapture && policy.identity_verified
    ? (capturePrepared
      ? (captureReady
        ? "Start assessment with recording"
        : "Complete required capture")
      : (policy.consented
        ? "Prepare required capture"
        : "Accept policy & prepare capture"))
    : policy.identity_verified
    ? (policy.consented
      ? "Start or resume assessment"
      : "Accept policy & start or resume")
    : (policy.consented
      ? "Refresh preparation"
      : "Accept policy & refresh preparation");
  return (
    <div className="preflight">
      <p className="eyebrow">Before your assessment</p>
      <h1>Exam monitoring policy</h1>
      <section>
        <h2>{policy.title}</h2>
        <dl className="policy-summary">
          <div>
            <dt>Monitoring</dt>
            <dd>{rules.mode.replaceAll("_", " ")}</dd>
          </div>
          <div>
            <dt>Identity check</dt>
            <dd>
              {rules.identity_level === 0
                ? "Schood account"
                : rules.identity_level === 2
                ? "Document and liveness verification"
                : "Attended institution check"}
            </dd>
          </div>
          <div>
            <dt>Required capture</dt>
            <dd>
              {capture.length
                ? capture.join(", ")
                : "No camera, microphone or screen capture"}
            </dd>
          </div>
          <div>
            <dt>Configured identity retention</dt>
            <dd>{rules.identity_retention_days} days</dd>
          </div>
          <div>
            <dt>Configured recording retention</dt>
            <dd>{rules.recording_retention_days} days</dd>
          </div>
        </dl>
        <p>
          Browser monitoring reports events such as leaving the exam tab,
          changing fullscreen, copying or pasting. Browser events alone do not
          establish misconduct. Your institution performs human review.
        </p>
        <p>
          Your exam responses are saved separately from monitoring events.
          Monitoring events are encrypted on this device while waiting to sync.
        </p>
        {!policy.runtime_ready && (
          <p role="alert" className="error">
            The required recording, secure-client or document-verification
            service is not connected. This exam cannot start with weaker
            monitoring. Contact your institution.
          </p>
        )}
        {!policy.identity_verified && rules.identity_level !== 0 && (
          <p role="status" className="monitoring-notice">
            Your institution must complete the assigned identity check before
            you can start. Refresh preparation after the attended check.
          </p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            proceed();
          }}
        >
          {!policy.consented
            ? (
              <label className="check">
                <input
                  type="checkbox"
                  required
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />I have read and accept this institution’s exam monitoring
                policy.
              </label>
            )
            : (
              <p role="status">
                Your acceptance of this policy has already been recorded.
              </p>
            )}
          <div className="exam-actions">
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={cancel}
            >
              Back to exam sittings
            </button>
            <button
              disabled={busy || (!policy.consented && !acknowledged) ||
                !policy.runtime_ready ||
                (needsCapture && capturePrepared && !captureReady)}
            >
              {action}
            </button>
          </div>
        </form>
      </section>
      {children}
    </div>
  );
}
