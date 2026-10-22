import {
  LivePeer,
  type LivePeerPorts,
  type LivePeerView,
} from "./live-peer.ts";
import type { LiveSource } from "../../assessment-core/src/live-proctor.ts";
/** Publishing owns PeerConnections only. Recording owns the consented devices
 * and bytes; publisher failure/stop must not stop their tracks or saved media. */
export class CandidateLive {
  private peers = new Map<LiveSource, LivePeer>();
  private streams = new Map<LiveSource, MediaStream>();
  private problems = new Map<LiveSource, string>();
  private starting = new Set<LiveSource>();
  private closed = false;
  constructor(
    private ports: () => LivePeerPorts,
    private changed: () => void,
  ) {}
  view(source: LiveSource): LivePeerView {
    return this.problems.has(source)
      ? {
        role: "publisher",
        source,
        state: "failed",
        problem: this.problems.get(source)!,
        stream: null,
        bytes: 0,
      }
      : this.peers.get(source)?.view() ??
        {
          role: "publisher",
          source,
          state: "idle",
          problem: null,
          stream: null,
          bytes: 0,
        };
  }
  async start(source: LiveSource, raw: unknown) {
    if (this.closed) throw new Error("This live publishing session is closed.");
    if (!(raw instanceof MediaStream)) {
      throw new Error(
        "Live publishing requires the current consented browser capture stream.",
      );
    }
    if (this.starting.has(source)) {
      throw new Error("This live source is already connecting.");
    }
    this.starting.add(source);
    this.streams.set(source, raw);
    this.problems.delete(source);
    try {
      const previous = this.peers.get(source);
      await previous?.close();
      if (this.closed) return;
      const peer = new LivePeer(
        "publisher",
        source,
        this.ports(),
        () => this.changed(),
      );
      this.peers.set(source, peer);
      await peer.start(raw);
    } catch (cause) {
      this.problems.set(
        source,
        cause instanceof Error
          ? cause.message
          : "Live media could not connect.",
      );
      this.changed();
      throw cause;
    } finally {
      this.starting.delete(source);
    }
  }
  async reconnect(source: LiveSource) {
    const stream = this.streams.get(source);
    if (
      !stream || stream.getTracks().some((track) => track.readyState !== "live")
    ) {
      throw new Error(
        "Restore required recording before reconnecting live media.",
      );
    }
    await this.start(source, stream);
  }
  close() {
    this.closed = true;
    const work = Promise.allSettled(
      [...this.peers.values()].map((peer) => peer.close()),
    );
    this.streams.clear();
    return work.then(() => {});
  }
}
