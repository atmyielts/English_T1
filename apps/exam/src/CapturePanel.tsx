import type {
  CandidateCaptureView,
  CaptureSource,
} from "../../../packages/proctor-web/src/candidate-capture";
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
  const names = {
    camera: "Camera",
    microphone: "Microphone",
    screen: "Entire screen",
  };
  return (
    <section className="capture-panel" aria-label="Required exam recording">
      <h2>Required recording</h2>
      <p>
        Allow each required source separately. Screen sharing must include the
        entire display. Recording starts only after your permission and is
        encrypted on this device while it waits to sync.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {view?.problem && (
        <p className="error" role="alert">
          {view.problem} Saved footage is retained for recovery.
        </p>
      )}
      {!view
        ? (
          <>
            <p role="status">
              Accept the policy and prepare capture before requesting device
              permissions.
            </p>
            {reopen && (
              <button type="button" disabled={busy} onClick={reopen}>
                Prepare required recording
              </button>
            )}
          </>
        )
        : (
          <>
            <p role="status">
              {view.closed
                ? "Recording has stopped."
                : view.ready
                ? (view.live?(view.launch.state==='paused'?'Required recording and live feeds are confirmed. The assessment remains paused until an institution proctor resumes it.':'Required recording and live feeds are confirmed.'):view.launch.state === "paused"
                  ? "All required sources are recording and recent saved media is confirmed. The assessment remains paused until an institution proctor resumes it."
                  : "All required sources are recording and recent saved media is confirmed.")
                : view.launch.state === "paused"
                ? (view.live?'The assessment is paused. Restore required recording and live feeds, then ask your institution’s proctor to resume.':"The assessment is paused. Restore required recording, then ask your institution’s proctor to resume.")
                : active
                ? (view.launch.auto_pause===false?'Required monitoring needs attention. Your institution’s policy permits continuing with a warning; the existing exam clock still applies. Restore monitoring or contact your institution.':"Required monitoring needs attention. Answer controls are disabled; the existing exam clock still applies. Contact your institution if monitoring cannot recover.")
                : (view.live?'The exam cannot start until recording and every required live source are confirmed.':"The exam cannot start until every required source is recording and saved media is confirmed.")}
            </p>
            <ul className="records">
              {view.sources.map((row) => (
                <li key={row.source}>
                  <strong>{names[row.source]}</strong>
                  <span>
                    {row.state === "permission"
                      ? "Waiting for your browser permission"
                      : row.state === "recording"
                      ? (row.saved
                        ? "Recording · recent saved media confirmed"
                        : "Recording locally · waiting for saved media")
                      : row.state === "off"
                      ? "Not started"
                      : row.state === "failed"
                      ? "Recording failed"
                      : row.state === "stopping"
                      ? "Stopping and preserving footage"
                      : "Stopped · recover before restarting"}
                  </span>
                  <button
                    type="button"
                    className="quiet"
                    disabled={busy || view.closed || row.state !== "off"}
                    onClick={() => start(row.source)}
                  >
                    Allow {names[row.source].toLowerCase()} & record
                  </button>
                </li>
              ))}
            </ul>
            {view.live && (
              <div
                className="capture-live"
                aria-label="Required live monitoring"
              >
                <h3>Live monitoring</h3>
                <p className="hint">
                  The sources you allowed for recording are also shared with
                  assigned institution proctors under this live policy. Live
                  connectivity and saved recording are separate.
                </p>
                <ul className="records">
                  {view.live.map((row) => (
                    <li key={row.source}>
                      <strong>{names[row.source]} live feed</strong>
                      <span role="status">
                        {row.state === "live"
                          ? "Live media is being sent"
                          : row.state === "connecting"
                          ? "Connecting live media…"
                          : row.state === "stalled"
                          ? "Live connection interrupted"
                          : row.state === "failed"
                          ? "Live connection failed"
                          : row.state === "closed"
                          ? "Live sharing stopped"
                          : "Live media is not connected"}
                      </span>
                      {row.problem && <p className="hint">{row.problem}</p>}
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
                          Reconnect {names[row.source].toLowerCase()} live feed
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
                Check saved recording
              </button>
              <button
                type="button"
                className="quiet"
                disabled={busy || view.closed}
                onClick={recover}
              >
                Recover stopped recording
              </button>
              {view.closed && reopen && (
                <button type="button" disabled={busy} onClick={reopen}>
                  Reopen capture preparation
                </button>
              )}
              {stop && (
                <button
                  type="button"
                  className="quiet"
                  disabled={busy || view.closed}
                  onClick={stop}
                >
                  Stop recording & request help
                </button>
              )}
            </div>
          </>
        )}
      <p className="hint">
        A saved recording is not proof of misconduct or identity. Your
        institution performs human review. For a resumed assessment, the
        existing exam clock still applies.
      </p>
    </section>
  );
}
