import { proctorRequest, ServiceRequestError, supabase } from "./client";
import type {
  LiveConnection,
  LiveRole,
  LiveSource,
} from "../../assessment-core/src/live-proctor";
import type {
  LivePeerPorts,
  LivePeerReply,
} from "../../proctor-web/src/live-peer";
import {LocalizedError,english} from './i18n/translate.ts';

export function liveEndpoint() {
  const raw = import.meta.env.VITE_PROCTOR_LIVE_URL as string | undefined;
  if (!raw) {
    throw new LocalizedError("live.liveMonitoringConfiguredEnvironment");
  }
  const base = new URL(raw),
    loopback = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (
    (base.protocol !== "https:" && !(base.protocol === "http:" && loopback)) ||
    base.username || base.password || base.search || base.hash ||
    base.pathname !== "/"
  ) throw new LocalizedError("live.liveMonitoringEndpointSecure");
  return base;
}
export const liveConfigured = Boolean(import.meta.env.VITE_PROCTOR_LIVE_URL);

export function liveSources(tenant: string, actor: string, session: string) {
  return proctorRequest<LiveConnection[]>(
    `live/sources?session_id=${encodeURIComponent(session)}`,
    tenant,
    undefined,
    undefined,
    actor,
  );
}

/** The browser knows only our broker and short-lived user credentials. Provider
 * application keys and publisher locators never enter the frontend. */
export function livePorts(
  tenant: string,
  actor: string,
  session: string,
  binding?: { device_id: string; token_hash: string },
  publisherId?: string,
): LivePeerPorts {
  const base = liveEndpoint();
  async function invoke(
    id: string,
    action: string,
    data: Record<string, unknown>,
    key: string,
  ): Promise<LivePeerReply> {
    if (!supabase) {
      throw new ServiceRequestError(
        401,
        "unauthorized",
        english("common.signIn"),
      );
    }
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session || auth.session.user.id !== actor) {
      throw new ServiceRequestError(
        401,
        "account_changed",
        english("live.accountChanged"),
      );
    }
    const endpoint = new URL(`/v1/connections/${encodeURIComponent(id)}`, base);
    endpoint.searchParams.set("tenant_id", tenant);
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${auth.session.access_token}`,
          "content-type": "application/json",
          "idempotency-key": key,
        },
        body: JSON.stringify({ action, data }),
      });
      const reader = response.body?.getReader();
      if (!reader) {
        throw new LocalizedError("live.liveBrokerReturnedEmpty");
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 150000) {
            await reader.cancel();
            throw new LocalizedError("live.liveBrokerResponseExceeded");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const payload = JSON.parse(new TextDecoder().decode(bytes));
      if (!response.ok) {
        throw new ServiceRequestError(
          response.status,
          payload.code ?? "live_unavailable",
          payload.error ?? english("live.unavailable"),
        );
      }
      const { data: current } = await supabase.auth.getSession();
      if (!current.session || current.session.user.id !== actor) throw new ServiceRequestError(401, 'account_changed', english('live.accountChanged'));
      return payload.data;
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    peer: configuration => new RTCPeerConnection(configuration),
    ice: async(id,key)=>await invoke(id,'ice',{},key) as unknown as import('../../assessment-core/src/live-proctor').LiveIceBundle,
    open: (id: string, role: LiveRole, source: LiveSource) =>
      proctorRequest<LiveConnection>(
        "live/commands",
        tenant,
        {
          action: "connection.open",
          data: {
            id,
            session_id: session,
            role,
            source,
            ...(role === "publisher" ? binding : { publisher_id: publisherId }),
          },
        },
        "live-open:" + id,
        actor,
      ),
    async invoke(id, action, data, key) {
      if (action !== "close") return invoke(id, action, data, key);
      // Retain canonical cleanup custody even when SDP never reached a broker.
      // Both calls are stable-key operations; neither claims provider closure
      // from the browser merely closing its local PeerConnection.
      const canonical = proctorRequest(
        "live/commands",
        tenant,
        { action: "connection.close", data: { id } },
        key,
        actor,
      );
      const results = await Promise.allSettled([
        canonical,
        invoke(id, action, data, key),
      ]);
      if (results.every((result) => result.status === "rejected")) {
        throw (results[0] as PromiseRejectedResult).reason;
      }
      return { id, state: "closing" };
    },
  };
}
