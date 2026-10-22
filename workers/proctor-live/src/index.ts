import { DurableObject } from "cloudflare:workers";
import {
  ContractError,
  object,
  text,
  uuid,
} from "../../../packages/assessment-core/src/mod.ts";
import { ServiceError } from "../../../packages/assessment-worker/src/error.ts";
import { boundedJson } from "../../../packages/assessment-worker/src/http.ts";
import {
  type LiveBridge,
  type LiveContext,
  LiveEngine,
  type LiveInvocation,
} from "./engine.ts";
import { CloudflareSFU } from "./provider.ts";
import {CloudflareTURN} from './turn.ts';
interface Env {
  CONNECTIONS: DurableObjectNamespace<LiveConnectionBroker>;
  PROCTOR_LIVE_ENABLED: string;
  PROCTOR_LIVE_BROKER_SECRET: string;
  PROCTOR_SFU_APP_ID: string;
  PROCTOR_SFU_APP_SECRET: string;
  PROCTOR_TURN_KEY_ID:string;
  PROCTOR_TURN_KEY_SECRET:string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ALLOWED_ORIGINS: string;
}
function configured(env: Env) {
  let url: URL;
  try {
    url = new URL(env.SUPABASE_URL);
  } catch {
    throw new ServiceError(
      503,
      "live_unconfigured",
      "Live monitoring is not configured.",
    );
  }
  if (
    env.PROCTOR_LIVE_ENABLED !== "true" || url.protocol !== "https:" ||
    url.username || url.password || url.search || url.hash ||
    url.pathname !== "/" || !env.SUPABASE_ANON_KEY ||
    env.PROCTOR_LIVE_BROKER_SECRET?.length < 32 ||
    !env.PROCTOR_LIVE_BROKER_SECRET ||
    !/^[-a-zA-Z0-9_]{1,200}$/.test(env.PROCTOR_SFU_APP_ID ?? "") ||
    !env.PROCTOR_SFU_APP_SECRET || env.PROCTOR_SFU_APP_SECRET.length < 32 ||
    !/^[-a-zA-Z0-9_]{1,200}$/.test(env.PROCTOR_TURN_KEY_ID??'')||!env.PROCTOR_TURN_KEY_SECRET||env.PROCTOR_TURN_KEY_SECRET.length<32
  ) {
    throw new ServiceError(
      503,
      "live_unconfigured",
      "Live monitoring is not configured.",
    );
  }
}
class Bridge implements LiveBridge {
  constructor(private env: Env) {}
  private async call<T>(
    tenant: string,
    id: string,
    action: string,
    data: Record<string, unknown>,
    bearer = "",
  ): Promise<T> {
    const { ok, status, payload } = await boundedJson<
      { data: T; code?: string }
    >(
      `${
        this.env.SUPABASE_URL.replace(/\/$/, "")
      }/functions/v1/proctor/live/internal`,
      {
        method: "POST",
        redirect: "manual",
        headers: {
          "content-type": "application/json",
          apikey: this.env.SUPABASE_ANON_KEY,
          "x-proctor-live-key": this.env.PROCTOR_LIVE_BROKER_SECRET,
          ...(bearer ? { authorization: bearer } : {}),
        },
        body: JSON.stringify({ tenant_id: tenant, id, action, data }),
      },
    );
    if (!ok) {
      throw new ServiceError(
        status,
        payload.code ?? "live_authority_unavailable",
        "Live authority could not confirm this request.",
      );
    }
    return payload.data;
  }
  context(tenant: string, id: string, bearer = "", touch = false) {
    return this.call<LiveContext>(
      tenant,
      id,
      bearer ? "context" : "system.context",
      { touch },
      bearer,
    );
  }
  report(
    tenant: string,
    id: string,
    action: string,
    data: Record<string, unknown>,
  ) {
    return this.call(tenant, id, "report", { action, data });
  }
}
export class LiveConnectionBroker extends DurableObject<Env> {
  private engine: LiveEngine;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.engine = new LiveEngine(
      {
        get: (key) => ctx.storage.get(key),
        put: (key, value) => ctx.storage.put(key, value),
        setAlarm: (time) => ctx.storage.setAlarm(time),
        deleteAlarm: () => ctx.storage.deleteAlarm(),
        async deleteReceipts() {
          const entries = await ctx.storage.list({ prefix: "receipt:" });
          if (entries.size) await ctx.storage.delete([...entries.keys()]);
        },
      },
      new Bridge(env),
      new CloudflareSFU(env.PROCTOR_SFU_APP_ID, env.PROCTOR_SFU_APP_SECRET),
      ()=>Date.now(),new CloudflareTURN(env.PROCTOR_TURN_KEY_ID,env.PROCTOR_TURN_KEY_SECRET),
    );
  }
  async fetch(req: Request) {
    try {
      return Response.json({
        data: await this.engine.invoke(await req.json() as LiveInvocation),
      }, { headers: { "cache-control": "no-store" } });
    } catch (cause) {
      return failure(cause);
    }
  }
  async alarm() {
    await this.engine.alarm();
  }
}
function failure(cause: unknown) {
  const known = cause instanceof ContractError || cause instanceof ServiceError;
  return Response.json({
    code: known ? cause.code : "live_unavailable",
    error: known
      ? cause.message
      : "The live connection could not be confirmed.",
  }, {
    status: known ? cause.status : 503,
    headers: { "cache-control": "no-store" },
  });
}
async function body(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) {
    throw new ContractError(
      "invalid_live_request",
      "Expected a live operation.",
    );
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 70000) {
        await reader.cancel();
        throw new ServiceError(
          413,
          "payload_too_large",
          "Live request exceeds 70 KB.",
        );
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
  try {
    return object(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new ContractError("invalid_live_json", "Expected a JSON object.");
  }
}
export default {
  async fetch(req: Request, env: Env) {
    const origin = req.headers.get("origin"),
      origins = (env.ALLOWED_ORIGINS ?? "").split(",").map((v) => v.trim()),
      headers: Record<string, string> = {
        "cache-control": "no-store",
        "vary": "Origin",
        "access-control-allow-methods": "POST,OPTIONS",
        "access-control-allow-headers":
          "authorization,apikey,content-type,idempotency-key",
      };
    if (origin && origins.includes(origin)) {
      headers["access-control-allow-origin"] = origin;
    }
    try {
      if (origin && !origins.includes(origin)) {
        throw new ServiceError(403, "origin_denied", "Origin denied.");
      }
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers });
      }
      configured(env);
      if (req.method !== "POST") {
        throw new ServiceError(
          405,
          "method_not_allowed",
          "Method not allowed.",
        );
      }
      const url = new URL(req.url),
        match = /^\/v1\/connections\/([^/]+)$/.exec(url.pathname);
      if (!match) {
        throw new ServiceError(404, "not_found", "Live connection not found.");
      }
      const bearer = req.headers.get("authorization") ?? "";
      if (!/^Bearer \S+$/.test(bearer)) {
        throw new ServiceError(401, "unauthorized", "Sign in to continue.");
      }
      const input = await body(req),
        invocation: LiveInvocation = {
          tenant: uuid(url.searchParams.get("tenant_id")),
          id: uuid(match[1]),
          bearer,
          key: text(req.headers.get("idempotency-key"), "Request key", 200),
          action: text(input.action, "Action", 40),
          data: object(input.data),
        };
      const stub = env.CONNECTIONS.get(
          env.CONNECTIONS.idFromName(invocation.tenant + ":" + invocation.id),
        ),
        response = await stub.fetch(
          new Request("https://live-broker.internal", {
            method: "POST",
            body: JSON.stringify(invocation),
          }),
        );
      return new Response(response.body, {
        status: response.status,
        headers: { ...Object.fromEntries(response.headers), ...headers },
      });
    } catch (cause) {
      const response = failure(cause);
      return new Response(response.body, {
        status: response.status,
        headers: { ...Object.fromEntries(response.headers), ...headers },
      });
    }
  },
};
