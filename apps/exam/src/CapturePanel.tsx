import type {
  CandidateCaptureView,
  CaptureSource,
} from "../../../packages/proctor-web/src/candidate-capture";
import { useAppT } from "./i18n/index.ts";
import { errorText } from "../../../packages/assessment-web/src/i18n/errors.ts";
export function CapturePanel({
  view,
  busy,
  error,
  start,
  recover,
  sync,
  reopen,
  stop,
  reconnectLive,
  active = false,
}: {
  view: CandidateCaptureView | null;
  busy: boolean;
  error: string;
  start: (source: CaptureSource) => void;
  recover: () => void;
  sync: () => void;
  reopen?: () => void;
  stop?: () => void;
  reconnectLive?: (source: CaptureSource) => void;
  active?: boolean;
}) {
  const t = useAppT();
  const names = {
    camera: t("exam.capture.source.camera"),
    microphone: t("exam.capture.source.microphone"),
    screen: t("exam.capture.source.screen"),
  };
  const lower = {
    camera: t("exam.capture.sourceLower.camera"),
    microphone: t("exam.capture.sourceLower.microphone"),
    screen: t("exam.capture.sourceLower.screen"),
  };
  return (
    <section className="capture-panel" aria-label={t("exam.capture.label")}>
      <h2>{t("exam.capture.title")}</h2>
      <p>{t("exam.capture.intro")}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {view?.problem && (
        <p className="error" role="alert">
          {t("exam.capture.problem", {
            problem: errorText(new Error(view.problem), t),
          })}
        </p>
      )}
      {!view
        ? (
          <>
            <p role="status">{t("exam.capture.notPrepared")}</p>
            {reopen && (
              <button type="button" disabled={busy} onClick={reopen}>
                {t("exam.capture.prepare")}
              </button>
            )}
          </>
        )
        : (
          <>
            <p role="status">
              {t(
                view.closed
                  ? "exam.capture.state.stopped"
                  : view.ready
                  ? (view.live
                    ? (view.launch.state === "paused"
                      ? "exam.capture.state.liveReadyPaused"
                      : "exam.capture.state.liveReady")
                    : view.launch.state === "paused"
                    ? "exam.capture.state.readyPaused"
                    : "exam.capture.state.ready")
                  : view.launch.state === "paused"
                  ? (view.live
                    ? "exam.capture.state.pausedLive"
                    : "exam.capture.state.paused")
                  : active
                  ? (view.launch.auto_pause === false
                    ? "exam.capture.state.attentionWarn"
                    : "exam.capture.state.attentionBlocked")
                  : (view.live
                    ? "exam.capture.state.notReadyLive"
                    : "exam.capture.state.notReady"),
              )}
            </p>
            <ul className="records">
              {view.sources.map((row) => (
                <li key={row.source}>
                  <strong>{names[row.source]}</strong>
                  <span>
                    {t(
                      row.state === "permission"
                        ? "exam.capture.source.permission"
                        : row.state === "recording"
                        ? (row.saved
                          ? "exam.capture.source.saved"
                          : "exam.capture.source.recording")
                        : row.state === "off"
                        ? "exam.capture.source.off"
                        : row.state === "failed"
                        ? "exam.capture.source.failed"
                        : row.state === "stopping"
                        ? "exam.capture.source.stopping"
                        : "exam.capture.source.stopped",
                    )}
                  </span>
                  <button
                    type="button"
                    className="quiet"
                    disabled={busy || view.closed || row.state !== "off"}
                    onClick={() => start(row.source)}
                  >
                    {t("exam.capture.allow", { source: lower[row.source] })}
                  </button>
                </li>
              ))}
            </ul>
            {view.live && (
              <div
                className="capture-live"
                aria-label={t("exam.capture.live.label")}
              >
                <h3>{t("exam.capture.live.title")}</h3>
                <p className="hint">{t("exam.capture.live.intro")}</p>
                <ul className="records">
                  {view.live.map((row) => (
                    <li key={row.source}>
                      <strong>
                        {t("exam.capture.live.feed", { source: names[row.source] })}
                      </strong>
                      <span role="status">
                        {t(
                          row.state === "live"
                            ? "exam.capture.live.sending"
                            : row.state === "connecting"
                            ? "exam.capture.live.connecting"
                            : row.state === "stalled"
                            ? "exam.capture.live.stalled"
                            : row.state === "failed"
                            ? "exam.capture.live.failed"
                            : row.state === "closed"
                            ? "exam.capture.live.closed"
                            : "exam.capture.live.disconnected",
                        )}
                      </span>
                      {row.problem && (
                        <p className="hint">
                          {errorText(new Error(row.problem), t)}
                        </p>
                      )}
                      {row.state !== "live" && row.state !== "connecting" &&
                        reconnectLive && (
                        <button
                          type="button"
                          className="quiet"
                          disabled={busy || view.closed ||
                            view.sources.find((source) =>
                                source.source === row.source
                              )?.state !== "recording"}
                          onClick={() => reconnectLive(row.source)}
                        >
                          {t("exam.capture.live.reconnect", {
                            source: lower[row.source],
                          })}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="exam-actions">
              <button
                type="button"
                className="quiet"
                disabled={busy || view.closed}
                onClick={sync}
              >
                {t("exam.capture.check")}
              </button>
              <button
                type="button"
                className="quiet"
                disabled={busy || view.closed}
                onClick={recover}
              >
                {t("exam.capture.recover")}
              </button>
              {view.closed && reopen && (
                <button type="button" disabled={busy} onClick={reopen}>
                  {t("exam.capture.reopen")}
                </button>
              )}
              {stop && (
                <button
                  type="button"
                  className="quiet"
                  disabled={busy || view.closed}
                  onClick={stop}
                >
                  {t("exam.capture.stop")}
                </button>
              )}
            </div>
          </>
        )}
      <p className="hint">{t("exam.capture.disclaimer")}</p>
    </section>
  );
}
