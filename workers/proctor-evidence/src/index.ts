import { uuid } from "../../../packages/assessment-core/src/mod.ts";
import {
  RECORDING_PART_BYTES,
  recordingInteger,
} from "../../../packages/assessment-core/src/recordings.ts";
import { boundedJson } from "../../../packages/assessment-worker/src/http.ts";
import { ServiceError } from "../../../packages/assessment-worker/src/error.ts";
import {
  type Authority,
  complete,
  type Keys,
  read,
  type Storage,
  upload,
} from "./evidence.ts";
export interface Env {
  EVIDENCE: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  PROCTOR_EVIDENCE_SECRET: string;
  EVIDENCE_KEYRING: string;
  EVIDENCE_ACTIVE_KEY_ID: string;
  ALLOWED_ORIGINS: string;
}
function keys(env: Env): Keys {
  try {
    const roots = JSON.parse(env.EVIDENCE_KEYRING);
    if (
      !roots || typeof roots !== "object" || Array.isArray(roots) ||
      !Object.hasOwn(roots, env.EVIDENCE_ACTIVE_KEY_ID) ||
      Object.entries(roots).some(([id, key]) =>
        !/^[-a-zA-Z0-9_]{1,80}$/.test(id) || typeof key !== "string" ||
        !/^[a-f0-9]{64}$/.test(key)
      )
    ) throw new Error();
    return { active: env.EVIDENCE_ACTIVE_KEY_ID, roots };
  } catch {
    throw new ServiceError(
      503,
      "evidence_not_configured",
      "Evidence encryption is not configured",
    );
  }
}
function authority(env: Env, tenant: string, authorization: string): Authority {
  return {
    async call<T>(action: string, data: Record<string, unknown>) {
      const base = new URL(env.SUPABASE_URL);
      if (
        base.protocol !== "https:" ||
        typeof env.PROCTOR_EVIDENCE_SECRET !== "string" ||
        env.PROCTOR_EVIDENCE_SECRET.length < 32
      ) {
        throw new ServiceError(
          503,
          "evidence_not_configured",
          "Evidence authority is not configured",
        );
      }
      const url = new URL("/functions/v1/proctor/recordings/transport", base);
      url.searchParams.set("tenant_id", tenant);
      const result = await boundedJson<
        { data: T; code?: string; error?: string }
      >(url.href, {
        method: "POST",
        headers: {
          authorization,
          apikey: env.SUPABASE_ANON_KEY,
          "content-type": "application/json",
          "x-proctor-evidence-key": env.PROCTOR_EVIDENCE_SECRET,
        },
        body: JSON.stringify({ action, data }),
      });
      if (!result.ok) {
        throw new ServiceError(
          result.status,
          result.payload.code ?? "evidence_denied",
          result.payload.error ?? "Evidence authority denied this operation",
        );
      }
      const grant = result.payload.data as T & { tenant_id?: string };
      if (grant?.tenant_id !== undefined && grant.tenant_id !== tenant) {
        throw new ServiceError(
          502,
          "evidence_grant_invalid",
          "Canonical evidence tenant differs",
        );
      }
      return result.payload.data;
    },
  };
}
function storage(bucket: R2Bucket): Storage {
  return {
    async get(key) {
      const v = await bucket.get(key);
      return v
        ? {
          size: v.size,
          etag: v.etag,
          metadata: v.customMetadata ?? {},
          bytes: async () => new Uint8Array(await v.arrayBuffer()),
        }
        : null;
    },
    async put(key, bytes, metadata) {
      return !!await bucket.put(key, bytes, {
        onlyIf: { etagDoesNotMatch: "*" },
        customMetadata: metadata,
        httpMetadata: {
          contentType: "application/octet-stream",
          cacheControl: "no-store",
        },
      });
    },
  };
}
async function partBody(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) {
    throw new ServiceError(
      422,
      "part_required",
      "Provide recording part bytes",
    );
  }
  let length = 0;
  const chunks: Uint8Array[] = [];
  let reject!: (cause: unknown) => void;
  const timeout = new Promise<never>((_, fail) => reject = fail),
    timer = setTimeout(
      () =>
        reject(
          new ServiceError(408, "upload_timeout", "Evidence upload timed out"),
        ),
      20000,
    );
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      length += value.length;
      if (length > RECORDING_PART_BYTES) {
        throw new ServiceError(
          413,
          "part_too_large",
          "Evidence parts cannot exceed one MiB",
        );
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    return bytes;
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("origin"),
      allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((v) => v.trim())
        .filter(Boolean),
      headers: Record<string, string> = {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "cross-origin-resource-policy": "same-origin",
        vary: "Origin",
      };
    if (origin && allowed.includes(origin)) {
      headers[
        "access-control-allow-origin"
      ] = origin;
    }
    try {
      if (origin && !allowed.includes(origin)) {
        throw new ServiceError(
          403,
          "origin_denied",
          "This origin is not allowed",
        );
      }
      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            ...headers,
            "access-control-allow-methods": "GET,PUT,POST,OPTIONS",
            "access-control-allow-headers": "authorization,content-type",
          },
        });
      }
      const url = new URL(req.url),
        match =
          /^\/v1\/recordings\/([^/]+)\/segments\/(\d+)(?:\/(parts\/\d+|complete))?$/
            .exec(url.pathname);
      if (!match) {
        throw new ServiceError(
          404,
          "not_found",
          "Evidence route not found",
        );
      }
      const authorization = req.headers.get("authorization") ?? "";
      if (!/^Bearer \S+$/.test(authorization)) {
        throw new ServiceError(
          401,
          "unauthorized",
          "Sign in to continue",
        );
      }
      const recording = uuid(match[1]),
        sequence = recordingInteger(Number(match[2]), "Sequence", 1, 100000),
        tenant = uuid(url.searchParams.get("tenant_id")),
        api = authority(env, tenant, authorization),
        store = storage(env.EVIDENCE),
        ring = keys(env);
      if (req.method === "PUT" && match[3]?.startsWith("parts/")) {
        const index = recordingInteger(
          Number(match[3].slice(6)),
          "Part index",
          0,
          7,
        );
        await api.call("part.authorize", {
          recording_id: recording,
          sequence,
          index,
        });
        return Response.json({
          data: await upload(
            await partBody(req),
            recording,
            sequence,
            index,
            api,
            store,
            ring,
          ),
        }, { headers });
      }
      if (req.method === "POST" && match[3] === "complete") {
        return Response
          .json(
            { data: await complete(recording, sequence, api, store, ring) },
            { headers },
          );
      }
      if (req.method === "GET" && !match[3]) {
        const segment = await read(recording, sequence, api, store, ring);
        return new Response(segment.bytes, {
          headers: {
            ...headers,
            "content-type": "application/octet-stream",
            "content-length": String(segment.bytes.length),
            "content-disposition": "attachment",
          },
        });
      }
      throw new ServiceError(405, "method_not_allowed", "Method not allowed");
    } catch (cause) {
      const status = cause instanceof ServiceError
        ? cause.status
        : (cause as { status?: number }).status ?? 500;
      return Response.json({
        code: cause instanceof ServiceError ? cause.code : "evidence_error",
        error: status === 500
          ? "The evidence service could not complete this request"
          : cause instanceof Error
          ? cause.message
          : "Evidence request failed",
      }, { status, headers });
    }
  },
};
