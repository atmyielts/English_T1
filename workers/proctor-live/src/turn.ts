import {
  type LiveIceBundle,
  type LiveIceServer,
  liveIceServers,
} from "../../../packages/assessment-core/src/live-proctor.ts";
import { boundedJson } from "../../../packages/assessment-worker/src/http.ts";
import { ServiceError } from "../../../packages/assessment-worker/src/error.ts";
import type { LiveStore } from "./engine.ts";
export interface TurnProvider {
  readonly keyId: string;
  issue(ttl: number): Promise<LiveIceServer[]>;
  revoke(username: string): Promise<void>;
}
export class CloudflareTURN implements TurnProvider {
  constructor(
    readonly keyId: string,
    private secret: string,
    private fetcher: typeof fetch = fetch,
  ) {
    if (!/^[-a-zA-Z0-9_]{1,200}$/.test(keyId) || secret.length < 32) {
      throw new ServiceError(
        503,
        "live_turn_unconfigured",
        "Live relay service is not configured.",
      );
    }
  }
  async issue(ttl: number) {
    const response = await boundedJson<{ iceServers: unknown }>(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${
        encodeURIComponent(this.keyId)
      }/credentials/generate-ice-servers`,
      {
        method: "POST",
        redirect: "manual",
        headers: {
          authorization: "Bearer " + this.secret,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ttl }),
      },
      this.fetcher,
      8000,
      20000,
    );
    if (!response.ok) {
      throw new ServiceError(
        503,
        "live_turn_unavailable",
        "Relay credentials could not be confirmed.",
      );
    }
    return liveIceServers(response.payload.iceServers);
  }
  async revoke(username: string) {
    const fetcher = this.fetcher,
      controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetcher(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${
          encodeURIComponent(this.keyId)
        }/credentials/${encodeURIComponent(username)}/revoke`,
        {
          method: "POST",
          redirect: "manual",
          headers: { authorization: "Bearer " + this.secret },
          signal: controller.signal,
        },
      );
      await response.body?.cancel();
      if (response.status !== 204) {
        throw new ServiceError(
          503,
          "live_turn_reconciliation_pending",
          "Relay credential revocation must be retried.",
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
interface RelayState {
  keyId: string;
  pendingAt: number | null;
  records: {
    issuedAt: number;
    expiresAt: number;
    iceServers: LiveIceServer[];
    revoked: boolean;
  }[];
}
export class RelayCustody {
  constructor(
    private store: LiveStore,
    private provider: TurnProvider | undefined,
    private now: () => number,
  ) {}
  async issue(): Promise<LiveIceBundle> {
    if (!this.provider) {
      throw new ServiceError(
        503,
        "live_turn_unconfigured",
        "Live relay service is not configured.",
      );
    }
    let state = await this.store.get<RelayState>("relay");
    if (state && state.keyId !== this.provider.keyId) {
      throw new ServiceError(
        503,
        "live_turn_key_changed",
        "Restore the original relay key before recovering this connection.",
      );
    }
    if (state?.pendingAt !== null && state?.pendingAt !== undefined) {
      throw new ServiceError(
        409,
        "live_turn_outcome_unknown",
        "The previous relay issuance outcome is unknown. Explicitly reconnect.",
      );
    }
    const last = state?.records.at(-1);
    if (last && !last.revoked && last.expiresAt > this.now() + 120000) {
      return {
        iceServers: last.iceServers,
        expires_at: new Date(last.expiresAt).toISOString(),
        server_time: new Date(this.now()).toISOString(),
      };
    }
    if ((state?.records.length ?? 0) >= 64) {
      throw new ServiceError(
        409,
        "live_turn_refresh_limit",
        "Explicitly reconnect to renew live relay access.",
      );
    }
    const started = this.now();
    state = {
      keyId: this.provider.keyId,
      pendingAt: started,
      records: state?.records ?? [],
    };
    await this.store.put("relay", state);
    const iceServers = await this.provider.issue(600);
    state = {
      ...state,
      pendingAt: null,
      records: [...state.records, {
        issuedAt: started,
        expiresAt: started + 600000,
        iceServers,
        revoked: false,
      }],
    };
    await this.store.put("relay", state);
    return {
      iceServers,
      expires_at: new Date(started + 600000).toISOString(),
      server_time: new Date(this.now()).toISOString(),
    };
  }
  async cleanup() {
    const state = await this.store.get<RelayState>("relay");
    if (!state) return;
    const pending = state.records.filter((record) => !record.revoked);
    if (!pending.length) return;
    if (!this.provider || state.keyId !== this.provider.keyId) {
      throw new ServiceError(
        503,
        "live_turn_key_changed",
        "Cleanup requires the original relay key.",
      );
    }
    let failed = false;
    const queue = [...pending];
    await Promise.all(
      Array.from({ length: Math.min(4, queue.length) }, async () => {
        for (;;) {
          const record = queue.shift();
          if (!record) return;
          try {
            for (
              const username of new Set(
                record.iceServers.map((server) => server.username).filter((
                  value,
                ): value is string => Boolean(value)),
              )
            ) await this.provider!.revoke(username);
            record.revoked = true;
            record.iceServers = [];
            await this.store.put("relay", state);
          } catch {
            failed = true;
          }
        }
      }),
    );
    if (failed) {
      throw new ServiceError(
        503,
        "live_turn_reconciliation_pending",
        "Relay credential revocation must be retried.",
      );
    }
    // Unknown issuance was never returned to a browser and cannot have allocated
    // a browser relay. Retain its pending receipt; never blindly issue it again.
  }
}
