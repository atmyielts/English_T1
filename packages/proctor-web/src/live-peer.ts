import type {
  LiveConnection,
  LiveDescription,
  LiveRole,
  LiveSource,
} from "../../assessment-core/src/live-proctor.ts";
import {
  type LiveIceBundle,
  liveIceServers,
} from "../../assessment-core/src/live-proctor.ts";
export interface LivePeerReply {
  sessionDescription?: LiveDescription;
  tracks?: { mid: string }[];
  [key: string]: unknown;
}
export interface LivePeerPorts {
  open(id: string, role: LiveRole, source: LiveSource): Promise<LiveConnection>;
  invoke(
    id: string,
    action: string,
    data: Record<string, unknown>,
    key: string,
  ): Promise<LivePeerReply>;
  peer(configuration?: RTCConfiguration): RTCPeerConnection;
  ice?(id: string, key: string): Promise<LiveIceBundle>;
}
export interface LivePeerView {
  state: "idle" | "connecting" | "live" | "stalled" | "closed" | "failed";
  source: LiveSource;
  role: LiveRole;
  problem: string | null;
  stream: MediaStream | null;
  bytes: number;
}
/** Native transport only: no camera permission, identity, provider secrets or
 * academic side effects. Publishers borrow supplied tracks without owning
 * devices. Closing a PeerConnection must never stop exam recording. */
export class LivePeer {
  readonly id = crypto.randomUUID();
  private pc: RTCPeerConnection | null = null;
  private incoming: MediaStream | null = null;
  private outgoing: MediaStreamTrack | null = null;
  private detachSource: (() => void) | null = null;
  private decodedFrames = 0;
  private expectedMid: string | null = null;
  private stopped = false;
  private closing: Promise<void> | null = null;
  private phase: LivePeerView["state"] = "idle";
  private problem: string | null = null;
  private validUntil = 0;
  private iceExpiresAt = Infinity;
  private iceRenewAt = Infinity;
  private bytes = 0;
  private lastProgress = 0;
  private lastHeartbeat = -Infinity;
  private heartbeat: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private timerFlight = false;
  constructor(
    readonly role: LiveRole,
    readonly source: LiveSource,
    private ports: LivePeerPorts,
    private changed: (view: LivePeerView) => void,
    private clock = () => performance.now(),
  ) {}
  view(): LivePeerView {
    return {
      state: this.phase,
      role: this.role,
      source: this.source,
      problem: this.problem,
      bytes: this.bytes,
      stream: ["connecting", "live"].includes(this.phase)
        ? this.incoming
        : null,
    };
  }
  private emit() {
    this.changed(this.view());
  }
  private check() {
    if (this.stopped) throw new Error("This live connection is closed.");
  }
  private lease(value: LiveConnection, start: number) {
    if (
      value.id !== this.id || value.role !== this.role ||
      value.source !== this.source ||
      !["opening", "allocated", "negotiating", "active"].includes(value.state)
    ) throw new Error("The current live connection is unavailable.");
    const duration = Date.parse(value.expires_at) -
      Date.parse(value.server_time);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 60000) {
      throw new Error("The live authority lease is invalid.");
    }
    this.validUntil = start + duration;
  }
  private async gather() {
    const pc = this.pc!;
    if (pc.iceGatheringState === "complete") return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
          cleanup();
          reject(new Error("Live connection candidate gathering timed out."));
        }, 5000),
        done = () => {
          if (pc.iceGatheringState === "complete") {
            cleanup();
            resolve();
          }
        },
        closed = () => {
          if (pc.connectionState === "closed") {
            cleanup();
            reject(new Error("The live connection closed during preparation."));
          }
        },
        cleanup = () => {
          clearTimeout(timer);
          pc.removeEventListener("icegatheringstatechange", done);
          pc.removeEventListener("connectionstatechange", closed);
        };
      pc.addEventListener("icegatheringstatechange", done);
      pc.addEventListener("connectionstatechange", closed);
      done();
    });
  }
  private async renewIce() {
    if (!this.ports.ice) return undefined;
    const started = this.clock(),
      bundle = await this.ports.ice(this.id, "live-ice:" + crypto.randomUUID());
    this.check();
    const remaining = Date.parse(bundle.expires_at) -
      Date.parse(bundle.server_time);
    if (
      !Number.isFinite(remaining) || remaining <= 120000 || remaining > 600000
    ) throw new Error("Live relay credentials have an invalid lifetime.");
    const iceServers = liveIceServers(bundle.iceServers);
    this.iceExpiresAt = started + remaining;
    this.iceRenewAt = this.iceExpiresAt - 120000;
    return { iceServers };
  }
  private description(type: "offer" | "answer"): LiveDescription {
    const value = this.pc?.localDescription;
    if (!value || value.type !== type) {
      throw new Error(
        "The browser did not prepare the expected connection description.",
      );
    }
    return { type, sdp: value.sdp };
  }
  async start(stream?: MediaStream) {
    if (this.phase !== "idle") {
      throw new Error("Create a new live connection when reconnecting.");
    }
    this.phase = "connecting";
    this.emit();
    try {
      const began = this.clock(),
        opened = await this.ports.open(this.id, this.role, this.source);
      if (this.stopped) {
        await this.ports.invoke(this.id, "close", {}, "live-close:" + this.id)
          .catch(() => {});
        return;
      }
      this.lease(opened, began);
      this.lastHeartbeat = this.clock();
      this.timer = setInterval(() => {
        if (this.stopped) return;
        if (this.clock() >= Math.min(this.validUntil, this.iceExpiresAt)) {
          void this.fail(
            "Live authorization or relay credentials expired. Reconnect to resume.",
          );
          return;
        }
        if (this.timerFlight) return;
        this.timerFlight = true;
        void this.maintain().catch(() => {}).finally(() => {
          this.timerFlight = false;
        });
      }, 1000);
      const configuration = await this.renewIce();
      this.check();
      this.pc = this.ports.peer(configuration);
      const pc = this.pc;
      pc.ontrack = (event) => {
        if (
          this.stopped || this.role !== "viewer" ||
          event.transceiver.mid !== this.expectedMid
        ) {
          event.track.stop();
          return;
        }
        this.incoming = new MediaStream([event.track]);
        this.emit();
        event.track.onended = () => {
          if (!this.stopped) {
            this.phase = "stalled";
            this.problem =
              "The live feed ended. Reconnect or contact the candidate.";
            this.emit();
          }
        };
      };
      pc.onconnectionstatechange = () => {
        if (
          !this.stopped &&
          ["failed", "disconnected"].includes(pc.connectionState)
        ) {
          this.phase = "stalled";
          this.problem =
            "The live connection was interrupted. This is not evidence of misconduct.";
          this.emit();
        }
      };
      let mid = "";
      if (this.role === "publisher") {
        const kind = this.source === "microphone" ? "audio" : "video",
          tracks = stream?.getTracks().filter((track) =>
            track.kind === kind && track.readyState === "live"
          ) ?? [];
        if (tracks.length !== 1) {
          throw new Error(
            "Supply exactly one live track for this consented source.",
          );
        }
        this.outgoing = tracks[0];
        const ended = () => {
          if (!this.stopped) {
            void this.fail(
              "The consented capture source stopped. Reconnect only after capture is restored.",
            );
          }
        };
        this.outgoing.addEventListener("ended", ended);
        this.detachSource = () =>
          this.outgoing?.removeEventListener("ended", ended);
        const transceiver = pc.addTransceiver(this.outgoing, {
          direction: "sendonly",
          streams: [new MediaStream([this.outgoing])],
        });
        await pc.setLocalDescription(await pc.createOffer());
        await this.gather();
        this.check();
        if (!transceiver.mid) {
          throw new Error("The browser did not assign a media section.");
        }
        mid = transceiver.mid;
      }
      const reply = await this.ports.invoke(
        this.id,
        this.role === "publisher" ? "publish" : "subscribe",
        this.role === "publisher"
          ? { mid, sessionDescription: this.description("offer") }
          : {},
        "live-negotiate:" + this.id,
      );
      this.check();
      if (
        !reply.sessionDescription ||
        reply.sessionDescription.type !==
          (this.role === "publisher" ? "answer" : "offer")
      ) {
        throw new Error(
          "The live broker returned an unexpected connection description.",
        );
      }
      if (this.role === "viewer") {
        if (reply.tracks?.length !== 1 || !reply.tracks[0].mid) {
          throw new Error("The receiver media section was not confirmed.");
        }
        this.expectedMid = reply.tracks[0].mid;
      }
      await pc.setRemoteDescription(reply.sessionDescription);
      this.check();
      if (this.role === "viewer") {
        await pc.setLocalDescription(await pc.createAnswer());
        await this.gather();
        this.check();
        await this.ports.invoke(this.id, "answer", {
          sessionDescription: this.description("answer"),
        }, "live-answer:" + this.id);
        this.check();
      }
      const deadline = this.clock() + 10000;
      while (!this.stopped && this.clock() < deadline) {
        await this.statistics();
        if (
          pc.connectionState === "connected" && this.bytes > 0 &&
          (this.role === "publisher" || this.incoming) &&
          (this.role === "publisher" || this.source === "microphone" ||
            this.decodedFrames > 0)
        ) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      this.check();
      if (
        pc.connectionState !== "connected" || !this.bytes ||
        this.role === "viewer" &&
          (!this.incoming ||
            this.source !== "microphone" && !this.decodedFrames)
      ) {
        throw new Error(
          "No live media was received. Reconnect; a connected transport alone does not prove playback.",
        );
      }
      await this.ports.invoke(
        this.id,
        "connected",
        {},
        "live-connected:" + this.id,
      );
      this.check();
      this.phase = "live";
      this.problem = null;
      this.lastProgress = this.clock();
      this.emit();
    } catch {
      if (!this.stopped) {
        await this.fail(
          "Live media could not be connected. Reconnect explicitly; saved exam recording is independent.",
        );
      }
    }
  }
  private async statistics() {
    const pc = this.pc;
    if (!pc) return;
    const reports = await pc.getStats();
    let bytes = 0, frames = 0;
    for (const report of reports.values()) {
      if (
        report.type ===
          (this.role === "publisher" ? "outbound-rtp" : "inbound-rtp") &&
        !report.isRemote
      ) {
        bytes += Number(
          this.role === "publisher" ? report.bytesSent : report.bytesReceived,
        ) || 0;
        frames += Number(report.framesDecoded) || 0;
      }
    }
    if (
      (this.role === "publisher" || this.source === "microphone") &&
        bytes > this.bytes ||
      this.role === "viewer" && this.source !== "microphone" &&
        frames > this.decodedFrames
    ) this.lastProgress = this.clock();
    this.bytes = Math.max(this.bytes, bytes);
    this.decodedFrames = Math.max(this.decodedFrames, frames);
    return bytes;
  }
  private async maintain() {
    if (this.stopped) return;
    try {
      if (this.outgoing?.readyState === "ended") {
        await this.fail("The consented capture source stopped.");
        return;
      }
      await this.statistics();
      this.check();
      if (
        this.role === "publisher" && ["live", "stalled"].includes(this.phase) &&
        this.clock() - this.lastProgress >= 5000
      ) {
        await this.fail(
          "Live media stopped reaching the relay. Saved recording continues; reconnect explicitly.",
        );
        return;
      }
      if (this.clock() - this.lastHeartbeat >= 4000 && !this.heartbeat) {
        const started = this.clock();
        this.heartbeat = (async () => {
          const reply = await this.ports.invoke(
            this.id,
            "heartbeat",
            {},
            "live-heartbeat:" + crypto.randomUUID(),
          );
          if (!this.stopped) {
            this.lease(reply as unknown as LiveConnection, started);
            this.lastHeartbeat = this.clock();
          }
        })();
        try {
          await this.heartbeat;
        } finally {
          this.heartbeat = null;
        }
      }
      if (this.pc && this.clock() >= this.iceRenewAt) {
        const configuration = await this.renewIce();
        this.check();
        if (configuration) this.pc?.setConfiguration(configuration);
      }
      this.check();
      await this.statistics();
      if (this.stopped) return;
      if (["live", "stalled"].includes(this.phase)) {
        const fresh = this.clock() - this.lastProgress < 5000 &&
          this.pc?.connectionState === "connected";
        this.phase = fresh ? "live" : "stalled";
        this.problem = fresh
          ? null
          : "No recent live media. The last frame is hidden; reconnect or inspect connectivity.";
        this.emit();
      }
    } catch (cause) {
      if (!this.stopped) {
        if (
          [401, 403, 404].includes((cause as { status?: number })?.status ?? 0)
        ) {
          await this.fail("Live access was withdrawn. The feed is closed.");
          return;
        }
        this.phase = "stalled";
        this.problem =
          "Live authorization or connectivity could not be confirmed. The feed is hidden.";
        this.emit();
      }
    }
  }
  private async fail(message: string) {
    await this.close();
    this.phase = "failed";
    this.problem = message;
    this.emit();
  }
  close(): Promise<void> {
    if (this.stopped) return this.closing ?? Promise.resolve();
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }
    this.detachSource?.();
    this.detachSource = null;
    this.outgoing = null;
    this.incoming?.getTracks().forEach((track) => track.stop());
    this.incoming = null;
    this.phase = "closed";
    this.emit();
    this.closing = this.ports.invoke(
      this.id,
      "close",
      {},
      "live-close:" + this.id,
    ).then(() => {}, () => {});
    return this.closing;
  }
}
