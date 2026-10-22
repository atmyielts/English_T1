import React from "react";
import type { Preflight } from "../../../packages/proctor-web/src/types";
import { useAppT } from "./i18n/index.ts";
/** Known monitoring modes are translated; others keep their readable code. */
function modeText(mode: string, t: ReturnType<typeof useAppT>) {
  const key = `exam.preflight.mode.${mode}`,
    text = t(key as Parameters<typeof t>[0]);
  return text === key ? mode.replaceAll("_", " ") : text;
}
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
  const t = useAppT();
  const rules = policy.policy,
    capture = [
      rules.camera && t("exam.preflight.source.camera"),
      rules.microphone && t("exam.preflight.source.microphone"),
      rules.screen && t("exam.preflight.source.screen"),
      rules.second_camera && t("exam.preflight.source.secondCamera"),
    ].filter(Boolean);
  const needsCapture = policy.capture_required === true;
  const action = t(
    needsCapture && policy.identity_verified
      ? (capturePrepared
        ? (captureReady
          ? "exam.preflight.action.startRecording"
          : "exam.preflight.action.completeCapture")
        : (policy.consented
          ? "exam.preflight.action.prepareCapture"
          : "exam.preflight.action.acceptPrepare"))
      : policy.identity_verified
      ? (policy.consented
        ? "exam.preflight.action.start"
        : "exam.preflight.action.acceptStart")
      : (policy.consented
        ? "exam.preflight.action.refresh"
        : "exam.preflight.action.acceptRefresh"),
  );
  return (
    <div className="preflight">
      <p className="eyebrow">{t("exam.preflight.eyebrow")}</p>
      <h1>{t("exam.preflight.title")}</h1>
      <section>
        <h2>{policy.title}</h2>
        <dl className="policy-summary">
          <div>
            <dt>{t("exam.preflight.monitoring")}</dt>
            <dd>{modeText(rules.mode, t)}</dd>
          </div>
          <div>
            <dt>{t("exam.preflight.identity")}</dt>
            <dd>
              {t(
                rules.identity_level === 0
                  ? "exam.preflight.identity.account"
                  : rules.identity_level === 2
                  ? "exam.preflight.identity.document"
                  : "exam.preflight.identity.attended",
              )}
            </dd>
          </div>
          <div>
            <dt>{t("exam.preflight.capture")}</dt>
            <dd>
              {capture.length
                ? capture.join(", ")
                : t("exam.preflight.capture.none")}
            </dd>
          </div>
          <div>
            <dt>{t("exam.preflight.identityRetention")}</dt>
            <dd>
              {t("exam.preflight.days", { count: rules.identity_retention_days })}
            </dd>
          </div>
          <div>
            <dt>{t("exam.preflight.recordingRetention")}</dt>
            <dd>
              {t("exam.preflight.days", { count: rules.recording_retention_days })}
            </dd>
          </div>
        </dl>
        <p>{t("exam.preflight.events")}</p>
        <p>{t("exam.preflight.separate")}</p>
        {!policy.runtime_ready && (
          <p role="alert" className="error">{t("exam.preflight.notReady")}</p>
        )}
        {!policy.identity_verified && rules.identity_level !== 0 && (
          <p role="status" className="monitoring-notice">
            {t("exam.preflight.identityPending")}
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
                />{t("exam.preflight.accept")}
              </label>
            )
            : (
              <p role="status">{t("exam.preflight.accepted")}</p>
            )}
          <div className="exam-actions">
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={cancel}
            >
              {t("exam.preflight.back")}
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
