import { object, uuid } from "../../../packages/assessment-core/src/mod.ts";
import {
  ARTIFACT_CHUNK_BYTES,
  artifactHex,
  artifactInteger,
} from "../../../packages/assessment-core/src/artifacts.ts";
import { boundedJson } from "../../../packages/assessment-worker/src/http.ts";
import { ServiceError } from "../../../packages/assessment-worker/src/error.ts";
import {
  readSourcePart,
  type SourceBucket,
  type SourceKeys,
  sourcePart,
  type SourceReceipt,
  sourceReceipt,
  writeSourcePart,
} from "./storage.ts";
export interface Env {
  SOURCES: SourceBucket;
  QTI_ENABLED: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  QTI_TRANSPORT_SECRET: string;
  QTI_SCANNER_SECRET: string;
  QTI_PARSER_SECRET: string;
  QTI_ACTIVE_KEY_ID: string;
  QTI_KEYRING: string;
  ALLOWED_ORIGINS: string;
}
function configured(env: Env): SourceKeys {
  const secrets = [
    env.QTI_TRANSPORT_SECRET,
    env.QTI_SCANNER_SECRET,
    env.QTI_PARSER_SECRET,
  ];
  if (
    secrets.some((value) => typeof value !== "string" || value.length < 32) ||
    new Set(secrets).size !== 3
  ) {
    throw new ServiceError(
      503,
      "qti_unavailable",
      "Independent QTI transport and processing authority must be configured.",
    );
  }
  let roots: Record<string, string>;
  try {
    roots = JSON.parse(env.QTI_KEYRING);
    if (
      !roots || typeof roots !== "object" || Array.isArray(roots) ||
      !Object.hasOwn(roots, env.QTI_ACTIVE_KEY_ID) ||
      Object.entries(roots).some(([id, value]) =>
        !/^[-a-zA-Z0-9_]{1,80}$/.test(id) || typeof value !== "string" ||
        !/^[a-f0-9]{64}$/.test(value)
      )
    ) throw new Error();
  } catch {
    throw new ServiceError(
      503,
      "qti_key_unavailable",
      "QTI source encryption must be configured.",
    );
  }
  return { active: env.QTI_ACTIVE_KEY_ID, roots };
}
async function canonical(
  env: Env,
  path: string,
  body: unknown,
  headers: Record<string, string>,
  tenant?: string,
) {
  let base: URL;
  try {
    base = new URL(env.SUPABASE_URL);
    if (
      base.protocol !== "https:" || base.username || base.password ||
      base.search || base.hash
    ) throw new Error();
  } catch {
    throw new ServiceError(
      503,
      "qti_authority_unavailable",
      "Use a configured HTTPS QTI authority.",
    );
  }
  const url = new URL("/functions/v1/assessment-cloud/qti/" + path, base);
  if (tenant) url.searchParams.set("tenant_id", tenant);
  const result = await boundedJson<
    { data: unknown; code?: string; error?: string }
  >(url.href, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: env.SUPABASE_ANON_KEY,
      ...headers,
    },
    body: JSON.stringify(body),
    // Workers supports manual, not the browser/Node "error" redirect mode.
    // Never follow an authority redirect with credentials or processing keys.
    redirect: "manual",
  });
  if (!result.ok) {
    throw new ServiceError(
      result.status,
      result.payload.code ?? "qti_authority_denied",
      result.payload.error ?? "The QTI authority denied this operation.",
    );
  }
  return result.payload.data;
}
async function bytes(req: Request, expected: number) {
  if (
    req.headers.has("content-length") &&
    Number(req.headers.get("content-length")) !== expected
  ) {
    throw new ServiceError(
      409,
      "qti_part_size",
      "Source part size differs from its admitted manifest.",
    );
  }
  const reader = req.body?.getReader();
  if (!reader) {
    throw new ServiceError(
      422,
      "qti_part_required",
      "Provide the exact source part bytes.",
    );
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.length;
      if (total > expected || total > ARTIFACT_CHUNK_BYTES) {
        await reader.cancel();
        throw new ServiceError(
          413,
          "qti_part_size",
          "Source part exceeds its admitted size.",
        );
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total !== expected) {
    throw new ServiceError(409, "qti_part_size", "Source part is incomplete.");
  }
  const data = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return data;
}
interface Bundle {
  id: string;
  tenant_id: string;
  stage: string;
  source_hash: string;
  manifest_hash: string;
  processor_id: string;
  byte_length: number;
  parts: SourceReceipt[];
}
function bundle(value: unknown, job: string, stage: string): Bundle {
  const raw = object(value);
  if (raw.done === true) {
    throw new ServiceError(
      409,
      "qti_processing_complete",
      "This processing stage already has a committed report.",
    );
  }
  const tenant = uuid(raw.tenant_id),
    size = artifactInteger(raw.byte_length, "Source bytes", 22, 64 * 1048576);
  if (
    raw.id !== job || raw.stage !== stage || !Array.isArray(raw.parts) ||
    raw.parts.length !== Math.ceil(size / ARTIFACT_CHUNK_BYTES)
  ) {
    throw new ServiceError(
      502,
      "qti_source_manifest",
      "The QTI source bundle is incomplete or out of scope.",
    );
  }
  return {
    id: job,
    tenant_id: tenant,
    stage,
    source_hash: artifactHex(raw.source_hash),
    manifest_hash: artifactHex(raw.manifest_hash),
    processor_id: artifactHex(raw.processor_id),
    byte_length: size,
    parts: raw.parts.map((raw, index) => {
      const part = sourcePart(raw, tenant, job, index);
      if (
        part.byte_length !==
          Math.min(ARTIFACT_CHUNK_BYTES, size - index * ARTIFACT_CHUNK_BYTES)
      ) {
        throw new ServiceError(
          502,
          "qti_source_manifest",
          "The source part lengths are invalid.",
        );
      }
      return sourceReceipt(raw, part);
    }),
  };
}
export default {
  async fetch(req: Request, env: Env) {
    const origin = req.headers.get("origin"),
      allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((value) =>
        value.trim()
      ).filter(Boolean),
      headers: Record<string, string> = {
        "cache-control": "no-store",
        vary: "Origin",
        "x-content-type-options": "nosniff",
        "cross-origin-resource-policy": "same-site",
      };
    if (origin && allowed.includes(origin)) {
      headers[
        "access-control-allow-origin"
      ] = origin;
    }
    const reply = (status: number, data: unknown) =>
      Response.json(data, { status, headers });
    try {
      if (origin && !allowed.includes(origin)) {
        throw new ServiceError(
          403,
          "origin_denied",
          "Origin denied.",
        );
      }
      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            ...headers,
            "access-control-allow-methods": "PUT,POST,OPTIONS",
            "access-control-allow-headers": "authorization,content-type",
          },
        });
      }
      if (env.QTI_ENABLED !== "true") {
        throw new ServiceError(
          503,
          "qti_disabled",
          "QTI source transport is not enabled.",
        );
      }
      const keys = configured(env), url = new URL(req.url);
      const internal = /^\/internal\/qti\/(scan|parse)\/([^/]+)$/.exec(
        url.pathname,
      );
      if (internal) {
        if (origin) {
          throw new ServiceError(
            403,
            "qti_worker_origin",
            "Private source processing does not accept browser origins.",
          );
        }
        if (req.method !== "GET") {
          throw new ServiceError(
            405,
            "method_not_allowed",
            "Method not allowed.",
          );
        }
        const stage = internal[1],
          job = uuid(internal[2]),
          token = uuid(url.searchParams.get("lease_token")),
          secret = stage === "scan"
            ? env.QTI_SCANNER_SECRET
            : env.QTI_PARSER_SECRET;
        if (req.headers.get("x-assessment-qti-worker-key") !== secret) {
          throw new ServiceError(
            403,
            "qti_worker_required",
            "A distinct processing worker is required.",
          );
        }
        const current = async () =>
          bundle(
            await canonical(env, `internal/${stage}/bundle`, {
              job_id: job,
              lease_token: token,
            }, { "x-assessment-qti-worker-key": secret }),
            job,
            stage,
          );
        const grant = await current(),
          first = await readSourcePart(grant.parts[0], env.SOURCES, keys);
        let index = 0, cancelled = false;
        const stream = new ReadableStream<Uint8Array>({
          async pull(controller) {
            try {
              if (cancelled) return;
              const refreshed = await current();
              if (JSON.stringify(refreshed) !== JSON.stringify(grant)) {
                throw new ServiceError(
                  409,
                  "qti_source_changed",
                  "The canonical source bundle changed.",
                );
              }
              const data = index === 0
                ? first
                : await readSourcePart(grant.parts[index], env.SOURCES, keys);
              if (cancelled) return;
              controller.enqueue(data);
              if (++index === grant.parts.length) controller.close();
            } catch (cause) {
              cancelled = true;
              controller.error(cause);
            }
          },
          cancel() {
            cancelled = true;
          },
        }, { highWaterMark: 0 });
        return new Response(stream, {
          headers: {
            ...headers,
            "content-type": "application/zip",
            "content-length": String(grant.byte_length),
            "content-disposition":
              'attachment; filename="assessment-source.zip"',
            "x-qti-source-hash": grant.source_hash,
            "x-qti-manifest-hash": grant.manifest_hash,
          },
        });
      }
      const route = /^\/v1\/qti\/sources\/([^/]+)\/(parts\/(\d+)|complete)$/
        .exec(url.pathname);
      if (!route) {
        throw new ServiceError(
          404,
          "not_found",
          "QTI source route not found.",
        );
      }
      const authorization = req.headers.get("authorization") ?? "";
      if (!/^Bearer \S+$/.test(authorization)) {
        throw new ServiceError(
          401,
          "unauthorized",
          "Sign in to transfer QTI source bytes.",
        );
      }
      const tenant = uuid(url.searchParams.get("tenant_id")),
        job = uuid(route[1]);
      const transport = (action: string, data: unknown) =>
        canonical(env, "transport", { action, data }, {
          authorization,
          "x-assessment-qti-transport-key": env.QTI_TRANSPORT_SECRET,
        }, tenant);
      if (route[2] === "complete") {
        if (req.method !== "POST") {
          throw new ServiceError(
            405,
            "method_not_allowed",
            "Method not allowed.",
          );
        }
        return reply(200, {
          data: await transport("complete", { job_id: job }),
        });
      }
      if (req.method !== "PUT") {
        throw new ServiceError(
          405,
          "method_not_allowed",
          "Method not allowed.",
        );
      }
      const index = artifactInteger(
          Number(route[3]),
          "Source part index",
          0,
          63,
        ),
        raw = object(await transport("part.authorize", { job_id: job, index })),
        part = sourcePart(raw, tenant, job, index),
        receipt = raw.receipt === null
          ? null
          : sourceReceipt(raw.receipt, part);
      return reply(200, {
        data: await writeSourcePart(
          await bytes(req, part.byte_length),
          part,
          receipt,
          env.SOURCES,
          keys,
          (value) => transport("part.receipt", value),
        ),
      });
    } catch (cause) {
      if (cause instanceof ServiceError) {
        return reply(cause.status, {
          code: cause.code,
          error: cause.message,
        });
      }
      if (
        cause instanceof Error && "status" in cause && "code" in cause
      ) {
        return reply(Number(cause.status), {
          code: cause.code,
          error: cause.message,
        });
      }
      return reply(500, {
        code: "qti_transport_failed",
        error: "The private QTI source transfer could not be completed.",
      });
    }
  },
};
