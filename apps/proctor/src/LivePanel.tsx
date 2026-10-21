import { useEffect, useRef, useState } from "react";
import type {
  LiveConnection,
  LiveSource,
} from "../../../packages/assessment-core/src/live-proctor";
import {
  liveConfigured,
  livePorts,
  liveSources,
} from "../../../packages/assessment-web/src/live-proctor";
import {
  LivePeer,
  type LivePeerPorts,
  type LivePeerView,
} from "../../../packages/proctor-web/src/live-peer";

export interface LiveServices {
  configured: boolean;
  sources(
    tenant: string,
    actor: string,
    session: string,
  ): Promise<LiveConnection[]>;
  ports(tenant: string, actor: string, session: string, publisher: LiveConnection): LivePeerPorts;
}
const services: LiveServices = {
  configured: liveConfigured,
  sources: liveSources,
  ports: (tenant, actor, session, publisher) => livePorts(tenant, actor, session, undefined, publisher.id),
};
const names: Record<LiveSource, string> = {
  camera: "Camera",
  screen: "Screen",
  microphone: "Microphone",
};

/** Explicit subscriptions only. Account/session keys and the current authorized
 * catalog bound the receiver lifetime. No automatic candidate surveillance. */
export function LivePanel(
  { tenant, actor, session, service = services, maxFeeds=3, allowedSources }: {
    tenant: string;
    actor: string;
    session: string;
    service?: LiveServices;
    maxFeeds?:number;
    allowedSources?:readonly LiveSource[];
  },
) {
  const [catalog, setCatalog] = useState<LiveConnection[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [problem, setProblem] = useState(""),
    [checking, setChecking] = useState(true),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true, flight = false;
    setCatalog([]);
    setSelected([]);
    setProblem("");
    setChecking(true);
    if (!service.configured) {
      setChecking(false);
      return;
    }
    const check = async () => {
      if (flight) return;
      flight = true;
      try {
        const rows = await service.sources(tenant, actor, session);
        if (!active) return;
        const valid = rows.filter((row) =>
          row.tenant_id === tenant && row.session_id === session &&
          row.role === "publisher" && row.state === "active" &&
          ["camera", "screen", "microphone"].includes(row.source)
        );
        setCatalog(valid);
        setSelected((current) =>
          current.filter((id) => valid.some((row) => row.id === id))
        );
        setProblem("");
      } catch {
        if (active) {
          setCatalog([]);
          setSelected([]);
          setProblem(
            "Live source access could not be confirmed. Feeds are closed. Refresh to check your assignment and reconnect.",
          );
        }
      } finally {
        flight = false;
        if (active) setChecking(false);
      }
    };
    void check();
    const timer = setInterval(() => void check(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [tenant, actor, session, service, refresh]);
  return (
    <section className="live-monitoring" aria-label="Live monitoring">
      <div className="record-heading">
        <h3>Live monitoring</h3>
        <span className="state-badge">Assigned observers only</span>
      </div>
      <p className="hint">
        Open only the feeds you need. A missing feed or interrupted connection
        is not evidence of misconduct. Saved recording is independent.
      </p>
      {!service.configured
        ? (
          <p role="status">
            Live monitoring is not configured in this environment. Recording and
            browser evidence remain separate.
          </p>
        )
        : (
          <>
            {problem && <p role="alert" className="error">{problem}</p>}
            {checking
              ? <p role="status">Checking available live sources…</p>
              : !catalog.length && !problem
              ? (
                <p role="status">
                  No current live sources. The candidate must consent and
                  connect the sources required by the live policy.
                </p>
              )
              : null}
            <div className="action-row">
              {catalog.filter(row=>!allowedSources||allowedSources.includes(row.source)).map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="quiet"
                  disabled={selected.includes(row.id)||selected.length>=maxFeeds}
                  onClick={() =>
                    setSelected((current) => current.length>=maxFeeds?current:[...new Set([...current, row.id])])}
                >
                  Open {names[row.source].toLowerCase()}
                </button>
              ))}
              <button
                type="button"
                className="quiet"
                onClick={() => setRefresh((value) => value + 1)}
              >
                Refresh live sources
              </button>
              {!!selected.length && (
                <button
                  type="button"
                  className="quiet"
                  onClick={() => setSelected([])}
                >
                  Stop all live feeds
                </button>
              )}
            </div>
            {maxFeeds<3&&<p className="hint">One feed per candidate on this board. Stop the current feed before choosing another source.</p>}
            <div className="live-feed-grid">
              {selected.map((id) => {
                const row = catalog.find((value) => value.id === id);
                return row
                  ? (
                    <LiveFeed
                      key={`${tenant}:${actor}:${session}:${row.id}`}
                      source={row.source}
                      ports={() => service.ports(tenant, actor, session, row)}
                      stop={() =>
                        setSelected((current) =>
                          current.filter((value) => value !== id)
                        )}
                    />
                  )
                  : null;
              })}
            </div>
          </>
        )}
    </section>
  );
}

function LiveFeed(
  { source, ports, stop }: {
    source: LiveSource;
    ports: () => LivePeerPorts;
    stop: () => void;
  },
) {
  const [view, setView] = useState<LivePeerView | null>(null),
    [audible, setAudible] = useState(false),
    [retry, setRetry] = useState(0),
    [reconnecting, setReconnecting] = useState(false),
    [playProblem, setPlayProblem] = useState(false);
  const peer = useRef<LivePeer | null>(null),
    media = useRef<HTMLVideoElement | null>(null),
    createPorts = useRef(ports);
  useEffect(() => {
    let active = true;
    setView(null);
    setAudible(false);
    setPlayProblem(false);
    let current: LivePeer;
    try {
      current = new LivePeer(
        "viewer",
        source,
        createPorts.current(),
        (next) => {
          if (active) setView(next);
        },
      );
    } catch {
      setView({
        state: "failed",
        source,
        role: "viewer",
        problem:
          "Live monitoring is not correctly configured. Contact your institution administrator.",
        stream: null,
        bytes: 0,
      });
      return;
    }
    peer.current = current;
    void current.start();
    return () => {
      active = false;
      if (peer.current === current) peer.current = null;
      if (media.current) {
        media.current.pause();
        media.current.srcObject = null;
      }
      void current.close();
    };
  }, [source, retry]);
  useEffect(() => {
    const element = media.current;
    if (!element) return;
    element.muted = !audible || view?.state !== "live";
    if (view?.stream && element.srcObject !== view.stream) {
      element.srcObject = view.stream;
      void element.play().then(
        () => setPlayProblem(false),
        () => setPlayProblem(true),
      );
    }
    if (!view?.stream) {
      element.pause();
      element.srcObject = null;
    }
  }, [view?.stream, view?.state, audible]);
  const live = view?.state === "live";
  return (
    <article className="live-feed" aria-label={`${names[source]} live feed`}>
      <div className="record-heading">
        <h4>{names[source]}</h4>
        <span className="state-badge" role="status">
          {live
            ? "Live media received"
            : view?.state === "stalled"
            ? "Interrupted · last frame hidden"
            : view?.state === "failed"
            ? "Connection failed"
            : view?.state === "closed"
            ? "Closed"
            : "Connecting…"}
        </span>
      </div>
      <video
        ref={media}
        autoPlay
        playsInline
        muted={!audible || !live}
        hidden={!live || source === "microphone"}
        aria-label={`${names[source]} stream`}
      />
      {source === "microphone" && live && (
        <p>
          Microphone media is arriving. Audio stays muted until you choose
          Listen.
        </p>
      )}
      {view?.problem && <p role="status" className="hint">{view.problem}</p>}
      {playProblem && (
        <button
          type="button"
          className="quiet"
          onClick={() =>
            void media.current?.play().then(
              () => setPlayProblem(false),
              () =>
                setPlayProblem(true),
            )}
        >
          Play live media
        </button>
      )}
      <div className="action-row">
        {source === "microphone" && (
          <button
            type="button"
            className="quiet"
            disabled={!live}
            aria-pressed={audible}
            onClick={() => {
              setAudible((value) => !value);
              if (!audible && media.current) {
                media.current.muted = false;
                void media.current.play().catch(() =>
                  setPlayProblem(true)
                );
              }
            }}
          >
            {audible ? "Mute" : "Listen"}
          </button>
        )}
        {["failed", "closed", "stalled"].includes(view?.state ?? "") && (
          <button
            type="button"
            disabled={reconnecting}
            onClick={() => {
              setReconnecting(true);
              void Promise.resolve(peer.current?.close()).finally(() => {
                setRetry((value) => value + 1);
                setReconnecting(false);
              });
            }}
          >
            Reconnect {names[source].toLowerCase()}
          </button>
        )}
        <button type="button" className="quiet" onClick={stop}>
          Stop {names[source].toLowerCase()} feed
        </button>
      </div>
    </article>
  );
}
