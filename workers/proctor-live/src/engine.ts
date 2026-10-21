import { hash, type Json } from "../../../packages/assessment-core/src/mod.ts";
import {
  type LiveDescription,
  liveDescription,
  liveOperation,
} from "../../../packages/assessment-core/src/live-proctor.ts";
import { ServiceError } from "../../../packages/assessment-worker/src/error.ts";
import type { LiveProvider, ProviderReply } from "./provider.ts";
import { RelayCustody, type TurnProvider } from "./turn.ts";
export interface LiveContext {
  id: string;
  tenant_id: string;
  actor_id: string;
  role: "publisher" | "viewer";
  source: string;
  state: string;
  allowed: boolean;
  expires_at: string;
  server_time: string;
  revision: number;
  provider_session_id: string | null;
  provider_app_id?: string | null;
  mid: string | null;
  track_name: string;
  publisher_provider_session_id: string | null;
  publisher_provider_app_id?: string | null;
  publisher_track_name: string | null;
}
export interface LiveBridge {
  context(
    tenant: string,
    id: string,
    bearer?: string,
    touch?: boolean,
  ): Promise<LiveContext>;
  report(
    tenant: string,
    id: string,
    action: string,
    data: Record<string, unknown>,
  ): Promise<unknown>;
}
export interface LiveStore {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  setAlarm(time: number): Promise<void>;
  deleteAlarm(): Promise<void>;
  deleteReceipts(): Promise<void>;
}
interface Binding {
  tenant: string;
  id: string;
  actor: string;
  appId?: string;
  provider?: string;
  allocating?: boolean;
  uncertain?: boolean;
  closed?: boolean;
  mid?: string;
  cleanupStarted?: number;
}
interface Receipt {
  hash: string;
  phase: "intent" | "effect" | "done";
  response?: ProviderReply;
  result?: unknown;
}
export interface LiveInvocation {
  tenant: string;
  id: string;
  bearer: string;
  key: string;
  action: string;
  data: Record<string, unknown>;
}
const project = (value: LiveContext) => ({
  id: value.id,
  tenant_id: value.tenant_id,
  role: value.role,
  source: value.source,
  state: value.state,
  expires_at: value.expires_at,
  server_time: value.server_time,
  revision: value.revision,
});
/** One executor owns the complete offer/answer exchange on each connection.
 * Provider effects and canonical receipts are separate durable stages. */
export class LiveEngine {
  private relay: RelayCustody;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    private store: LiveStore,
    private bridge: LiveBridge,
    private provider: LiveProvider,
    private now = () => Date.now(),
    turn?: TurnProvider,
  ) {
    this.relay = new RelayCustody(store, turn, now);
  }
  private serial<T>(work: () => Promise<T>) {
    const result = this.tail.then(work, work);
    this.tail = result.catch(() => {});
    return result;
  }
  invoke(input: LiveInvocation) {
    return this.serial(() => this.run(input));
  }
  private async context(input: LiveInvocation, touch = false) {
    const current = await this.bridge.context(
        input.tenant,
        input.id,
        input.bearer,
        touch,
      ),
      old = await this.store.get<Binding>("binding");
    if (
      current.id !== input.id || current.tenant_id !== input.tenant ||
      (old &&
        (old.id !== input.id || old.tenant !== input.tenant ||
          old.actor !== current.actor_id))
    ) {
      throw new ServiceError(
        403,
        "live_scope_conflict",
        "The live connection scope changed.",
      );
    }
    if (!old) {
      await this.store.put(
        "binding",
        {
          tenant: input.tenant,
          id: input.id,
          actor: current.actor_id,
          appId: this.provider.appId,
        } satisfies Binding,
      );
    }
    if (
      old?.appId && old.appId !== this.provider.appId ||
      current.provider_app_id &&
        current.provider_app_id !== this.provider.appId ||
      current.publisher_provider_app_id &&
        current.publisher_provider_app_id !== this.provider.appId
    ) {
      throw new ServiceError(
        503,
        "live_provider_app_changed",
        "Restore the original live provider application before recovering this connection.",
      );
    }
    await this.store.setAlarm(this.now() + 5000);
    if (!current.allowed) {
      await this.cleanup();
      throw new ServiceError(
        403,
        "live_access_denied",
        "Live monitoring access expired or was withdrawn.",
      );
    }
    return current;
  }
  private async allocate(context: LiveContext) {
    let binding = (await this.store.get<Binding>("binding"))!;
    if (binding.uncertain || binding.closed) {
      throw new ServiceError(
        409,
        "live_reconnect_required",
        "Close this connection and explicitly reconnect.",
      );
    }
    if (!binding.provider && context.provider_session_id) {
      binding = { ...binding, provider: context.provider_session_id };
      await this.store.put("binding", binding);
    }
    if (!binding.provider) {
      if (binding.allocating) {
        await this.fault("provider_outcome_unknown");
        throw new ServiceError(
          409,
          "live_reconnect_required",
          "The previous allocation outcome is unknown. Explicitly reconnect.",
        );
      }
      await this.store.put("binding", { ...binding, allocating: true });
      try {
        const provider = await this.provider.create();
        binding = { ...binding, provider, allocating: false };
        await this.store.put("binding", binding);
      } catch {
        await this.fault("provider_outcome_unknown");
        throw new ServiceError(
          503,
          "live_allocation_uncertain",
          "Live allocation could not be confirmed. Explicitly reconnect.",
        );
      }
    }
    await this.bridge.report(binding.tenant, binding.id, "allocated", {
      provider_session_id: binding.provider,
      provider_app_id: this.provider.appId,
    });
    return binding.provider!;
  }
  private async fault(code: string) {
    const binding = await this.store.get<Binding>("binding");
    if (!binding) return;
    await this.store.put("binding", {
      ...binding,
      uncertain: binding.uncertain ||
        ["provider_outcome_unknown", "connection_description_lost"].includes(
          code,
        ),
    });
    await this.store.deleteReceipts();
    await this.store.setAlarm(this.now() + 1000);
    await this.bridge.report(binding.tenant, binding.id, "faulted", { code });
  }
  private async run(input: LiveInvocation): Promise<unknown> {
    const data = liveOperation(input.action, input.data),
      context = await this.context(input, input.action === "heartbeat");
    if (input.action === "heartbeat") return project(context);
    if (input.action === "close") {
      await this.cleanup();
      return { id: input.id, state: "closed" };
    }
    if (input.key.length < 8 || input.key.length > 200) {
      throw new ServiceError(
        422,
        "invalid_live_key",
        "Use a stable live operation key.",
      );
    }
    if (input.action === "ice") {
      let result;
      try {
        result = await this.relay.issue();
      } catch (cause) {
        await this.fault("relay_outcome_unknown");
        throw cause;
      }
      try {
        await this.context(input);
      } catch (cause) {
        await this.cleanup().catch(() => {});
        throw cause;
      }
      return result;
    }
    if (
      input.action === "publish" && context.role !== "publisher" ||
      ["subscribe", "answer"].includes(input.action) &&
        context.role !== "viewer"
    ) {
      throw new ServiceError(
        403,
        "live_role_mismatch",
        "This operation is not permitted for this connection.",
      );
    }
    const digest = await hash(
        { action: input.action, data } as unknown as Json,
      ),
      receiptKey = "receipt:" + await hash(input.key),
      prior = await this.store.get<Receipt>(receiptKey);
    if (prior && prior.hash !== digest) {
      throw new ServiceError(
        409,
        "idempotency_conflict",
        "The connection request key already has different contents.",
      );
    }
    if (prior?.phase === "done") return prior.result;
    const binding = (await this.store.get<Binding>("binding"))!;
    if (binding.uncertain || binding.closed) {
      throw new ServiceError(
        409,
        "live_reconnect_required",
        "This connection needs explicit recovery.",
      );
    }
    if (input.action === "connected") {
      const phase = await this.store.get<string>("phase");
      if (!["published", "answered", "connected"].includes(phase ?? "")) {
        throw new ServiceError(
          409,
          "live_negotiation_incomplete",
          "Finish connection negotiation before confirming playback.",
        );
      }
      if (phase === "connected") return project(context);
      const result = await this.bridge.report(
        input.tenant,
        input.id,
        "connected",
        {},
      );
      await this.store.put("phase", "connected");
      await this.store.put(
        receiptKey,
        { hash: digest, phase: "done", result } satisfies Receipt,
      );
      return result;
    }
    const phase = await this.store.get<string>("phase");
    if (
      !prior && (input.action === "publish" || input.action === "subscribe") &&
      phase && phase !== "opening"
    ) {
      throw new ServiceError(
        409,
        "live_negotiation_pending",
        "This connection already has a publication or pending offer.",
      );
    }
    if (!prior && input.action === "answer" && phase !== "offered") {
      throw new ServiceError(
        409,
        "live_no_pending_offer",
        "No receiver offer is awaiting an answer.",
      );
    }
    if (input.action === "publish") {
      const sections = (data.sessionDescription as LiveDescription).sdp.split(
        /(?=^m=)/m,
      ).filter((section) => section.startsWith("m="));
      const media = sections.filter((section) =>
        section.split(/\r?\n/).includes("a=mid:" + data.mid)
      );
      if (
        sections.length !== 1 || media.length !== 1 ||
        !media[0].startsWith(
          context.source === "microphone" ? "m=audio " : "m=video ",
        )
      ) {
        throw new ServiceError(
          422,
          "live_source_kind_mismatch",
          "The media section does not match the consented source kind.",
        );
      }
    }
    const session = await this.allocate(context);
    if (prior?.phase === "intent") {
      await this.fault("provider_outcome_unknown");
      throw new ServiceError(
        409,
        "live_reconnect_required",
        "The provider outcome is unknown. Do not replay the mutation.",
      );
    }
    let response = prior?.response;
    if (!response) {
      await this.store.put(
        receiptKey,
        { hash: digest, phase: "intent" } satisfies Receipt,
      );
      try {
        response = input.action === "publish"
          ? await this.provider.publish(
            session,
            context.track_name,
            String(data.mid),
            data.sessionDescription as LiveDescription,
          )
          : input.action === "subscribe"
          ? await this.provider.subscribe(
            session,
            context.publisher_provider_session_id!,
            context.publisher_track_name!,
          )
          : await this.provider.answer(
            session,
            data.sessionDescription as LiveDescription,
          );
        await this.store.put(
          receiptKey,
          { hash: digest, phase: "effect", response } satisfies Receipt,
        );
      } catch {
        await this.fault("provider_outcome_unknown");
        throw new ServiceError(
          503,
          "live_provider_uncertain",
          "The provider did not confirm this operation. Reconnect explicitly.",
        );
      }
    }
    if (response.errorCode) {
      await this.fault("provider_rejected");
      throw new ServiceError(
        503,
        "live_provider_rejected",
        "The media provider rejected this operation.",
      );
    }
    if (input.action === "answer") {
      if (response.requiresImmediateRenegotiation) {
        await this.fault("provider_partial");
        throw new ServiceError(
          503,
          "live_provider_invalid_answer",
          "The provider did not accept the receiver answer.",
        );
      }
      await this.store.put("phase", "answered");
      response = { requiresImmediateRenegotiation: false };
    } else {
      const rows = response.tracks,
        track = rows?.find((row) =>
          row.trackName ===
            (input.action === "publish"
              ? context.track_name
              : context.publisher_track_name)
        );
      if (
        !Array.isArray(rows) || rows.length !== 1 || !track ||
        track.errorCode || !track.mid ||
        !/^[a-zA-Z0-9_-]{1,32}$/.test(track.mid) ||
        (input.action === "publish" && track.mid !== data.mid) ||
        (input.action === "subscribe" &&
          track.sessionId !== context.publisher_provider_session_id)
      ) {
        await this.fault("provider_partial");
        throw new ServiceError(
          503,
          "live_partial_allocation",
          "The provider did not confirm the requested track. Successful resources remain scheduled for cleanup.",
        );
      }
      let description: LiveDescription;
      try {
        description = liveDescription(
          response.sessionDescription,
          input.action === "publish" ? "answer" : "offer",
        );
      } catch {
        await this.fault("provider_partial");
        throw new ServiceError(
          503,
          "live_provider_description_invalid",
          "The provider did not return the required connection description.",
        );
      }
      if (
        input.action === "publish" &&
        response.requiresImmediateRenegotiation === true
      ) {
        await this.fault("provider_partial");
        throw new ServiceError(
          503,
          "live_unexpected_offer",
          "The provider returned an unexpected negotiation state.",
        );
      }
      const latest = (await this.store.get<Binding>("binding"))!;
      await this.store.put("binding", { ...latest, mid: track.mid });
      await this.bridge.report(input.tenant, input.id, "negotiated", {
        mid: track.mid,
        track_name: context.track_name,
      });
      await this.store.put(
        "phase",
        input.action === "publish" ? "published" : "offered",
      );
      response = {
        sessionDescription: description,
        requiresImmediateRenegotiation: input.action === "subscribe",
        tracks: [{ mid: track.mid }],
      };
    }
    // The SDP is private, short-lived negotiation state, never a public/audit log.
    // Authority can change while an external negotiation is in flight. Do not
    // return fresh SDP based only on the authorization at request entry.
    try {
      await this.context(input);
    } catch (cause) {
      await this.cleanup().catch(() => {});
      throw cause;
    }
    const result = { id: input.id, ...response };
    await this.store.put(
      receiptKey,
      { hash: digest, phase: "done", result } satisfies Receipt,
    );
    return result;
  }
  private async cleanup() {
    let binding = await this.store.get<Binding>("binding");
    if (!binding) return;
    binding = {
      ...binding,
      cleanupStarted: binding.cleanupStarted ?? this.now(),
    };
    await this.store.put("binding", binding);
    // Revoke relay credentials alongside SFU cleanup. A slow relay provider
    // must not postpone stopping known media forwarding.
    const relayWork = this.relay.cleanup().then(
      () => undefined,
      (cause: unknown) => cause,
    );
    if (binding.closed) {
      const relayFailure = await relayWork;
      if (relayFailure) throw relayFailure;
      await this.bridge.report(binding.tenant, binding.id, "closed", {});
      await this.store.deleteReceipts();
      await this.store.deleteAlarm();
      return;
    }
    try {
      if (binding.provider) {
        if (binding.appId && binding.appId !== this.provider.appId) {
          throw new ServiceError(
            503,
            "live_provider_app_changed",
            "Cleanup requires the original provider application.",
          );
        }
        const snapshot = await this.provider.inspect(binding.provider);
        if (snapshot.errorCode || !Array.isArray(snapshot.tracks)) {
          throw new ServiceError(
            503,
            "live_cleanup_unconfirmed",
            "Provider cleanup could not be confirmed.",
          );
        }
        const mids = [
          ...new Set([
            ...snapshot.tracks.filter((row) => row.status !== "inactive").map(
              (row) => row.mid,
            ),
            binding.mid,
          ].filter((value): value is string => typeof value === "string")),
        ];
        if (mids.length) {
          const result = await this.provider.close(binding.provider, mids);
          if (
            result.errorCode || !Array.isArray(result.tracks) ||
            mids.some((mid) =>
              !result.tracks!.some((row) =>
                row.mid === mid &&
                (!row.errorCode || row.errorCode === "close_track_error")
              )
            )
          ) {
            throw new ServiceError(
              503,
              "live_cleanup_unconfirmed",
              "Some provider tracks still need cleanup.",
            );
          }
        }
        if (binding.uncertain) {
          await this.store.setAlarm(
            this.now() +
              (this.now() - binding.cleanupStarted! < 120000 ? 5000 : 60000),
          );
          return;
        }
      }
    } finally {
      await relayWork;
    }
    // An unknown empty-session allocation cannot have published tracks: no
    // tracks/new call can be made without its returned session ID. Audit/ops
    // still retain the lost allocation outcome instead of claiming reclamation.
    const relayFailure = await relayWork;
    if (relayFailure) throw relayFailure;
    await this.store.put("binding", { ...binding, closed: true });
    await this.bridge.report(binding.tenant, binding.id, "closed", {});
    await this.store.deleteReceipts();
    await this.store.deleteAlarm();
  }
  alarm() {
    return this.serial(async () => {
      const binding = await this.store.get<Binding>("binding");
      if (!binding) return;
      try {
        const current = await this.bridge.context(binding.tenant, binding.id);
        if (
          current.allowed && !binding.uncertain && !binding.closed &&
          (!binding.appId || binding.appId === this.provider.appId) &&
          (!current.provider_app_id ||
            current.provider_app_id === this.provider.appId) &&
          (!current.publisher_provider_app_id ||
            current.publisher_provider_app_id === this.provider.appId)
        ) {
          await this.store.setAlarm(this.now() + 5000);
          return;
        }
      } catch {
        /* No current authority proof: stop known forwarding, not just the UI. */
      }
      try {
        await this.cleanup();
      } catch {
        await this.store.setAlarm(this.now() + 5000);
        throw new ServiceError(
          503,
          "live_reconciliation_pending",
          "Live connection cleanup must be retried.",
        );
      }
    });
  }
}
