import { uuid } from "../../../packages/assessment-core/src/mod.ts";
import {
  ARTIFACT_CHUNK_BYTES,
  artifactInteger,
} from "../../../packages/assessment-core/src/artifacts.ts";
import { boundedJson } from "../../../packages/assessment-worker/src/http.ts";
import { ServiceError } from "../../../packages/assessment-worker/src/error.ts";
import { mediaAuthorization } from "./session-cookie.ts";
import {
  type ArtifactAuthority,
  artifactDisposition,
  type ArtifactStorage,
  byteRange,
  type MediaKeys,
  type Receipt,
  uploadPart,
  verifiedArtifactStream as artifactStream,
} from "./media.ts";
interface Env {
  ARTIFACTS: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ASSESSMENT_MEDIA_SECRET: string;
  ASSESSMENT_SCANNER_SECRET: string;
  ARTIFACT_ACTIVE_KEY_ID: string;
  ARTIFACT_KEYRING: string;
  ALLOWED_ORIGINS: string;
}
function keys(env: Env): MediaKeys {
  try {
    const roots = JSON.parse(env.ARTIFACT_KEYRING);
    if (
      !roots ||
      typeof roots !== "object" ||
      Array.isArray(roots) ||
      !Object.hasOwn(roots, env.ARTIFACT_ACTIVE_KEY_ID) ||
      Object.entries(roots).some(
        ([id, key]) =>
          !/^[-a-zA-Z0-9_]{1,80}$/.test(id) ||
          typeof key !== "string" ||
          !/^[a-f0-9]{64}$/.test(key),
      )
    ) {
      throw new Error();
    }
    return { active: env.ARTIFACT_ACTIVE_KEY_ID, roots };
  } catch {
    throw new ServiceError(
      503,
      "invalid_encryption_config",
      "Artifact encryption is not configured correctly",
    );
  }
}
function authority(
  env: Env,
  tenant: string,
  authorization: string,
): ArtifactAuthority {
  return {
    async call<T>(action: string, data: Record<string, unknown>) {
      if (
        !env.ASSESSMENT_MEDIA_SECRET ||
        env.ASSESSMENT_MEDIA_SECRET.length < 32
      ) {
        throw new ServiceError(
          503,
          "media_not_configured",
          "The media authority is not configured",
        );
      }
      const base = new URL(env.SUPABASE_URL);
      if (base.protocol !== "https:") {
        throw new ServiceError(
          503,
          "media_not_configured",
          "The canonical media endpoint must use HTTPS",
        );
      }
      const url = new URL(
        "/functions/v1/assessment-cloud/artifacts/transport",
        base,
      );
      url.searchParams.set("tenant_id", tenant);
      const response = await boundedJson<{
        data: T;
        code?: string;
        error?: string;
      }>(url.href, {
        method: "POST",
        headers: {
          authorization,
          apikey: env.SUPABASE_ANON_KEY,
          "content-type": "application/json",
          "x-assessment-media-key": env.ASSESSMENT_MEDIA_SECRET,
        },
        body: JSON.stringify({ action, data }),
      });
      if (!response.ok) {
        throw new ServiceError(
          response.status,
          response.payload.code ?? "canonical_media_failed",
          response.payload.error ??
            "The canonical media authority rejected this operation",
        );
      }
      return response.payload.data;
    },
  };
}
function storage(bucket: R2Bucket): ArtifactStorage {
  return {
    async get(key) {
      const value = await bucket.get(key);
      return value
        ? {
          size: value.size,
          etag: value.etag,
          metadata: value.customMetadata ?? {},
          bytes: async () => new Uint8Array(await value.arrayBuffer()),
        }
        : null;
    },
    async put(key, cipher, metadata) {
      return !!(await bucket.put(key, cipher, {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: {
          contentType: "application/octet-stream",
          cacheControl: "no-store",
        },
        customMetadata: metadata,
      }));
    },
  };
}
async function readBody(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) {
    throw new ServiceError(422, "part_required", "Provide artifact part bytes");
  }
  const chunks: Uint8Array[] = [];
  let length = 0,
    rejectTimeout!: (reason: unknown) => void;
  const timeout = new Promise<never>((_, reject) => {
      rejectTimeout = reject;
    }),
    timer = setTimeout(
      () =>
        rejectTimeout(
          new ServiceError(408, "part_timeout", "The upload part timed out"),
        ),
      20000,
    );
  try {
    for (;;) {
      const result = await Promise.race([reader.read(), timeout]);
      if (result.done) break;
      length += result.value.length;
      if (length > ARTIFACT_CHUNK_BYTES) {
        throw new ServiceError(
          413,
          "part_too_large",
          "Artifact parts cannot exceed one MiB",
        );
      }
      chunks.push(result.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
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
      allowed = (env.ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
      headers: Record<string, string> = {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "cross-origin-resource-policy": "same-site",
        vary: "Origin",
      };
    if (origin && allowed.includes(origin)) {
      headers["access-control-allow-origin"] = origin;
      headers["access-control-allow-credentials"] = "true";
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
            "access-control-allow-headers": "authorization,content-type,range",
            "access-control-expose-headers":
              "content-range,content-length,accept-ranges",
          },
        });
      }
      const scan = /^\/internal\/scan\/([^/]+)$/.exec(
        new URL(req.url).pathname,
      );
      if (scan) {
        // No browser-origin plaintext scanner endpoint, and no user-token fallback.
        if (
          origin ||
          req.method !== "GET" ||
          !env.ASSESSMENT_SCANNER_SECRET ||
          env.ASSESSMENT_SCANNER_SECRET.length < 32 ||
          env.ASSESSMENT_SCANNER_SECRET === env.ASSESSMENT_MEDIA_SECRET ||
          req.headers.get("x-assessment-scanner-key") !==
            env.ASSESSMENT_SCANNER_SECRET
        ) {
          throw new ServiceError(
            403,
            "scanner_required",
            "A trusted scanner must send this request",
          );
        }
        const url = new URL(
          "/functions/v1/assessment-cloud/artifacts/scan/bundle",
          env.SUPABASE_URL,
        );
        if (url.protocol !== "https:") {
          throw new ServiceError(
            503,
            "media_not_configured",
            "The canonical media endpoint must use HTTPS",
          );
        }
        const result = await boundedJson<{
          data: {
            artifact_id: string;
            tenant_id: string;
            byte_length: number;
            parts: Receipt[];
          };
          code?: string;
          error?: string;
        }>(url.href, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-assessment-scanner-key": env.ASSESSMENT_SCANNER_SECRET,
          },
          body: JSON.stringify({
            job_id: uuid(scan[1]),
            lease_token: uuid(new URL(req.url).searchParams.get("lease_token")),
          }),
        });
        if (!result.ok) {
          throw new ServiceError(
            result.status,
            result.payload.code ?? "scan_denied",
            result.payload.error ?? "Scanner access denied",
          );
        }
        const grant = result.payload.data,
          parts = grant.parts.map((part) => ({
            ...part,
            tenant_id: grant.tenant_id,
            artifact_id: grant.artifact_id,
          }));
        return new Response(
          await artifactStream(
            parts,
            { start: 0, end: grant.byte_length - 1 },
            storage(env.ARTIFACTS),
            keys(env),
          ),
          {
            headers: {
              ...headers,
              "content-type": "application/octet-stream",
              "content-length": String(grant.byte_length),
              "content-disposition": "attachment",
            },
          },
        );
      }
      const url = new URL(req.url),
        match = /^\/v1\/artifacts\/([^/]+)(?:\/(parts\/\d+|complete))?$/.exec(
          url.pathname,
        );
      if (!match) {
        throw new ServiceError(404, "not_found", "Artifact route not found");
      }
      const artifact = uuid(match[1]),
        tenant = uuid(url.searchParams.get("tenant_id")),
        authorization = mediaAuthorization(req);
      if (!/^Bearer \S+$/.test(authorization)) {
        throw new ServiceError(401, "unauthorized", "Sign in to continue");
      }
      const api = authority(env, tenant, authorization),
        store = storage(env.ARTIFACTS),
        keyring = keys(env),
        json = (data: unknown) => Response.json({ data }, { headers });
      if (req.method === "PUT" && match[2]?.startsWith("parts/")) {
        const index = artifactInteger(
          Number(match[2].slice(6)),
          "Part index",
          0,
          2047,
        );
        await api.call("chunk.authorize", { artifact_id: artifact, index });
        return json(
          await uploadPart(
            await readBody(req),
            artifact,
            index,
            api,
            store,
            keyring,
          ),
        );
      }
      if (req.method === "POST" && match[2] === "complete") {
        return json(
          await api.call("upload.complete", { artifact_id: artifact }),
        );
      }
      if (req.method === "GET" && !match[2]) {
        const attempt = url.searchParams.get("attempt_id"),
          task = url.searchParams.get("task_id"),
          grant = await api.call<{
            artifact_id: string;
            tenant_id: string;
            mime: string;
            kind: string;
            byte_length: number;
            parts: Receipt[];
          }>("read.authorize", {
            artifact_id: artifact,
            ...(attempt ? { attempt_id: uuid(attempt) } : {}),
            ...(task ? { task_id: uuid(task) } : {}),
          });
        if (grant.artifact_id !== artifact || grant.tenant_id !== tenant) {
          throw new ServiceError(
            502,
            "artifact_manifest_invalid",
            "The canonical artifact scope is invalid",
          );
        }
        const range = byteRange(req.headers.get("range"), grant.byte_length),
          parts = grant.parts.map((part) => ({
            ...part,
            tenant_id: tenant,
            artifact_id: artifact,
          }));
        return new Response(
          await artifactStream(parts, range, store, keyring),
          {
            status: range.partial ? 206 : 200,
            headers: {
              ...headers,
              "content-type": grant.mime,
              "content-disposition": artifactDisposition(
                grant.kind,
                Boolean(task),
              ),
              "content-length": String(range.end - range.start + 1),
              "accept-ranges": "bytes",
              "access-control-expose-headers":
                "content-range,content-length,accept-ranges",
              ...(range.partial
                ? {
                  "content-range":
                    `bytes ${range.start}-${range.end}/${grant.byte_length}`,
                }
                : {}),
            },
          },
        );
      }
      throw new ServiceError(405, "method_not_allowed", "Method not allowed");
    } catch (cause) {
      const status = cause instanceof ServiceError
          ? cause.status
          : ((cause as { status?: number }).status ?? 500),
        code = cause instanceof ServiceError
          ? cause.code
          : status === 422
          ? "invalid_contract"
          : "media_error";
      return Response.json(
        {
          code,
          error: status === 500
            ? "The media service could not complete this request"
            : cause instanceof Error
            ? cause.message
            : "The media request failed",
        },
        { status, headers },
      );
    }
  },
};
