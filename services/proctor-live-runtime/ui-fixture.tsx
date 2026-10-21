// Explicit synthetic ports for the actual Proctor LivePanel. This fixture does
// not represent hosted Auth/Postgres/SFU acceptance or enable exam launch.
import React, { useState } from "react";
import { CapturePanel } from "../../apps/exam/src/CapturePanel";
import {
  CandidateCapture,
  type CandidateCaptureView,
} from "../../packages/proctor-web/src/candidate-capture";
import { CandidateLive } from "../../packages/proctor-web/src/candidate-live";
import { CaptureRecorder } from "../../packages/proctor-web/src/capture";
import type { CaptureUploadState } from "../../packages/proctor-web/src/recording-types";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "../../packages/service-i18n/src/i18n.tsx";
import { catalogs as examCatalogs } from "../../apps/exam/src/i18n/index.ts";
import { LivePanel, type LiveServices } from "../../apps/proctor/src/LivePanel";
import { ServiceHeader } from "../../packages/service-design/src/ServiceHeader";
import {
  LivePeer,
  type LivePeerPorts,
} from "../../packages/proctor-web/src/live-peer";
import type {
  LiveConnection,
  LiveSource,
} from "../../packages/assessment-core/src/live-proctor";
import "../../packages/service-design/src/platform.css";
import "../../apps/proctor/src/style.css";

const tenant = "10000000-0000-4000-8000-000000000001",
  actor = "00000000-0000-4000-8000-000000000004",
  session = "20000000-0000-4000-8000-000000000001";
const contexts = new Map<string, LiveConnection>(),
  relays = new Map<string, RTCPeerConnection>(),
  publications = new Map<LiveSource, MediaStreamTrack>(),
  senders = new Map<string, RTCRtpSender>(),
  chunks: number[] = [];
let allowed = true,
  cameraPublisherDenied = false,
  running = true,
  cameraReplaced = false,
  capture: CandidateCapture,
  captureTimer: ReturnType<typeof setInterval>,
  changedCapture: (view: CandidateCaptureView) => void = () => {},
  originals: MediaStream,
  audio: AudioContext;
const counts = { publish: 0, subscribe: 0, answer: 0, viewerClosed: 0 };
function projection(id: string): LiveConnection {
  return {
    ...contexts.get(id)!,
    server_time: new Date().toISOString(),
    expires_at: new Date(Date.now() + 20000).toISOString(),
  };
}
async function gather(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", done);
      reject(Error("Synthetic ICE gathering timed out"));
    }, 5000);
    const done = () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timer);
        pc.removeEventListener("icegatheringstatechange", done);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", done);
    done();
  });
}
const ports: LivePeerPorts = {
  peer: () => new RTCPeerConnection({ iceServers: [] }),
  async open(id, role, source) {
    if (role === "viewer" && !allowed) {
      throw Object.assign(Error("Synthetic assignment withdrawn"), {
        status: 403,
      });
    }
    contexts.set(id, {
      id,
      tenant_id: tenant,
      session_id: session,
      role,
      source,
      state: "opening",
      revision: 1,
      server_time: "",
      expires_at: "",
    });
    return projection(id);
  },
  async invoke(id, action, data) {
    const row = contexts.get(id)!;
    if (action === "close") {
      if (row && row.state !== "closed" && row.role === "viewer") {
        counts.viewerClosed++;
      }
      if (row) row.state = "closed";
      relays.get(id)?.close();
      return { id, state: "closed" };
    }
    if (row.role === "viewer" && !allowed) {
      throw Object.assign(Error("Synthetic assignment withdrawn"), {
        status: 403,
      });
    }
    if (
      row.role === "publisher" && row.source === "camera" &&
      cameraPublisherDenied
    ) {
      throw Object.assign(Error("Synthetic publisher lease denied"), {
        status: 403,
      });
    }
    if (action === "heartbeat") return { ...projection(id) };
    if (action === "connected") {
      row.state = "active";
      return { ...projection(id) };
    }
    if (action === "publish") {
      counts.publish++;
      const pc = new RTCPeerConnection({ iceServers: [] });
      relays.set(id, pc);
      pc.ontrack = (event) => publications.set(row.source, event.track);
      await pc.setRemoteDescription(
        data.sessionDescription as RTCSessionDescriptionInit,
      );
      await pc.setLocalDescription(await pc.createAnswer());
      await gather(pc);
      return {
        id,
        sessionDescription: { type: "answer", sdp: pc.localDescription!.sdp },
        tracks: [{ mid: String(data.mid) }],
      };
    }
    if (action === "subscribe") {
      counts.subscribe++;
      const track = publications.get(row.source);
      if (!track) throw Error("Synthetic source missing");
      const pc = new RTCPeerConnection({ iceServers: [] });
      relays.set(id, pc);
      const transceiver = pc.addTransceiver(track, {
        direction: "sendonly",
        streams: [new MediaStream([track])],
      });
      senders.set(id, transceiver.sender);
      await pc.setLocalDescription(await pc.createOffer());
      await gather(pc);
      return {
        id,
        sessionDescription: { type: "offer", sdp: pc.localDescription!.sdp },
        tracks: [{ mid: transceiver.mid! }],
      };
    }
    if (action === "answer") {
      counts.answer++;
      await relays.get(id)!.setRemoteDescription(
        data.sessionDescription as RTCSessionDescriptionInit,
      );
      return { id };
    }
    throw Error("Unexpected synthetic live operation");
  },
};
const service: LiveServices = {
  configured: true,
  ports: () => ports,
  async sources() {
    if (!allowed) {
      throw Object.assign(Error("Synthetic assignment withdrawn"), {
        status: 403,
      });
    }
    return [...contexts.values()].filter((row) =>
      row.role === "publisher" && row.state === "active"
    ).map((row) => ({
      ...projection(row.id),
      ...(row.source === "camera" && cameraReplaced
        ? { id: "20000000-0000-4000-8000-000000000099" }
        : {}),
    }));
  },
};
async function start() {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  const context = canvas.getContext("2d")!;
  let frame = 0;
  const draw = () => {
    if (!running) return;
    context.fillStyle = frame % 2 ? "#184b94" : "#d25e32";
    context.fillRect(0, 0, 320, 180);
    context.fillStyle = "white";
    context.font = "24px sans-serif";
    context.fillText("Generated frame " + frame++, 12, 50);
    requestAnimationFrame(draw);
  };
  draw();
  audio = new AudioContext();
  await audio.resume();
  const oscillator = audio.createOscillator(),
    destination = audio.createMediaStreamDestination();
  oscillator.connect(destination);
  oscillator.start();
  originals = new MediaStream([
    ...canvas.captureStream(15).getVideoTracks(),
    ...destination.stream.getAudioTracks(),
  ]);
  const states = new Map<string, CaptureUploadState>(),
    launch = {
      schema_version: "proctor.capture.v1" as const,
      monitoring_mode: "live" as const,
      session_id: session,
      registration_id: session,
      attempt_id: null,
      policy_id: session,
      state: "preparing" as const,
      ready: false,
      sources: [{ source: "camera" as const, ready: false }, {
        source: "microphone" as const,
        ready: false,
      }],
      activated_at: null,
      server_time: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60000).toISOString(),
    };
  const live = new CandidateLive(() => ports, () => capture?.liveChanged());
  capture = new CandidateCapture(launch, {
    live,
    store: {
      async initialize(meta) {
        states.set(meta.recording_id, {
          meta,
          phase: "prepared",
          ack_sequence: 0,
          head_hash: "0".repeat(64),
          last_end_ms: 0,
          close_reason: null,
        });
      },
      async append(segment) {
        chunks.push(segment.bytes.byteLength);
      },
      async states() {
        return [...states.values()];
      },
    },
    uploads: {
      async flush() {},
      async close(id) {
        states.get(id)!.phase = "sealed";
      },
    },
    async acquire(source) {
      return new MediaStream(
        originals.getTracks().filter((track) =>
          track.kind === (source === "microphone" ? "audio" : "video")
        ),
      );
    },
    recorder: (id, stream, sink, status) =>
      new CaptureRecorder(id, stream as MediaStream, sink, status),
    async heartbeat() {
      return {
        ...launch,
        server_time: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60000).toISOString(),
        ready: true,
        sources: launch.sources.map((row) => ({ ...row, ready: true })),
      };
    },
  }, (value) => changedCapture(value));
  captureTimer = setInterval(() => void capture.tick().catch(() => {}), 2000);
}
(window as any).liveFixture = {
  counts,
  chunks,
  withdraw() {
    allowed = false;
  },
  failCameraPublisher() {
    cameraPublisherDenied = true;
  },
  restoreCameraPublisher() {
    cameraPublisherDenied = false;
  },
  captureReady() {
    return capture?.view().ready;
  },
  replaceCatalogCamera() {
    cameraReplaced = true;
  },
  async stall() {
    for (const [id, sender] of senders) {
      if (contexts.get(id)?.source === "camera") {
        await sender.replaceTrack(null);
      }
    }
  },
  async resume() {
    for (const [id, sender] of senders) {
      if (contexts.get(id)?.source === "camera") {
        await sender.replaceTrack(publications.get("camera")!);
      }
    }
  },
  recording() {
    return capture?.view().sources.every((row) => row.state === "recording") &&
      originals.getTracks().every((track) => track.readyState === "live");
  },
  async close() {
    clearInterval(captureTimer);
    await capture?.close();
    for (const pc of relays.values()) pc.close();
    originals?.getTracks().forEach((track) => track.stop());
    running = false;
    await audio?.close();
  },
};
function Fixture() {
  const [state, setState] = useState("idle");
  const [captureView, setCaptureView] = useState<CandidateCaptureView | null>(
      null,
    ),
    [captureBusy, setCaptureBusy] = useState(false),
    [captureError, setCaptureError] = useState("");
  changedCapture = setCaptureView;
  const run = async (work: () => Promise<unknown>) => {
    setCaptureBusy(true);
    setCaptureError("");
    try {
      await work();
    } catch (cause) {
      setCaptureError(String(cause));
    } finally {
      setCaptureBusy(false);
    }
  };
  return (
    <div className="workspace">
      <ServiceHeader service="Proctor" />
      <main id="workspace-main">
        <p className="eyebrow">
          Synthetic local acceptance · not a hosted exam
        </p>
        <h1>Candidate live sources</h1>
        <p>
          Actual Proctor controls with generated camera/audio and an explicit
          native signaling adapter. No personal device permission is requested.
        </p>
        <button
          disabled={state !== "idle"}
          onClick={() => {
            setState("starting");
            void start().then(
              () => setState("ready"),
              (cause) => setState(String(cause)),
            );
          }}
        >
          Start generated sources
        </button>
        <p role="status" data-fixture-state={state}>{state}</p>
        {state === "ready" && (
          <CapturePanel
            view={captureView}
            busy={captureBusy}
            error={captureError}
            start={(source) => void run(() => capture.start(source))}
            reconnectLive={(source) =>
              void run(() => capture.reconnectLive(source))}
            recover={() => void run(() => capture.recover())}
            sync={() => void run(() => capture.tick())}
          />
        )}
        {state === "ready" && (
          <LivePanel
            tenant={tenant}
            actor={actor}
            session={session}
            service={service}
          />
        )}
      </main>
    </div>
  );
}
// Exam components are localized; the fixture renders them in the same provider as the app.
createRoot(document.getElementById("root")!).render(<I18nProvider catalogs={examCatalogs}><Fixture /></I18nProvider>);
