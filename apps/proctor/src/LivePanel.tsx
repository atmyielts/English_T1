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
import { useAppT } from "./i18n/index.ts";

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
// Per-source catalog keys: source names inflect differently in each language.
const names = { camera: "live.source.camera", screen: "live.source.screen", microphone: "live.source.microphone" } as const;
const openKeys = { camera: "live.open.camera", screen: "live.open.screen", microphone: "live.open.microphone" } as const;
const feedKeys = { camera: "live.feed.camera", screen: "live.feed.screen", microphone: "live.feed.microphone" } as const;
const streamKeys = { camera: "live.stream.camera", screen: "live.stream.screen", microphone: "live.stream.microphone" } as const;
const reconnectKeys = { camera: "live.reconnect.camera", screen: "live.reconnect.screen", microphone: "live.reconnect.microphone" } as const;
const stopKeys = { camera: "live.stop.camera", screen: "live.stop.screen", microphone: "live.stop.microphone" } as const;

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
  const t = useAppT();
  const [catalog, setCatalog] = useState<LiveConnection[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [problem, setProblem] = useState(false),
    [checking, setChecking] = useState(true),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true, flight = false;
    setCatalog([]);
    setSelected([]);
    setProblem(false);
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
        setProblem(false);
      } catch {
        if (active) {
          setCatalog([]);
          setSelected([]);
          setProblem(true);
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
    <section className="live-monitoring" aria-label={t("live.label")}>
      <div className="record-heading">
        <h3>{t("live.label")}</h3>
        <span className="state-badge">{t("live.badge")}</span>
      </div>
      <p className="hint">{t("live.hint")}</p>
      {!service.configured
        ? (
          <p role="status">{t("live.unconfigured")}</p>
        )
        : (
          <>
            {problem && <p role="alert" className="error">{t("live.accessProblem")}</p>}
            {checking
              ? <p role="status">{t("live.checking")}</p>
              : !catalog.length && !problem
              ? <p role="status">{t("live.none")}</p>
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
                  {t(openKeys[row.source])}
                </button>
              ))}
              <button
                type="button"
                className="quiet"
                onClick={() => setRefresh((value) => value + 1)}
              >
                {t("live.refresh")}
              </button>
              {!!selected.length && (
                <button
                  type="button"
                  className="quiet"
                  onClick={() => setSelected([])}
                >
                  {t("live.stopAll")}
                </button>
              )}
            </div>
            {maxFeeds<3&&<p className="hint">{t("live.oneFeed")}</p>}
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
  const t = useAppT();
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
        problem: t("live.misconfigured"),
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
    <article className="live-feed" aria-label={t(feedKeys[source])}>
      <div className="record-heading">
        <h4>{t(names[source])}</h4>
        <span className="state-badge" role="status">
          {live
            ? t("live.state.live")
            : view?.state === "stalled"
            ? t("live.state.stalled")
            : view?.state === "failed"
            ? t("live.state.failed")
            : view?.state === "closed"
            ? t("live.state.closed")
            : t("live.state.connecting")}
        </span>
      </div>
      <video
        ref={media}
        autoPlay
        playsInline
        muted={!audible || !live}
        hidden={!live || source === "microphone"}
        aria-label={t(streamKeys[source])}
      />
      {source === "microphone" && live && (
        <p>{t("live.micArriving")}</p>
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
          {t("live.play")}
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
            {audible ? t("live.mute") : t("live.listen")}
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
            {t(reconnectKeys[source])}
          </button>
        )}
        <button type="button" className="quiet" onClick={stop}>
          {t(stopKeys[source])}
        </button>
      </div>
    </article>
  );
}
