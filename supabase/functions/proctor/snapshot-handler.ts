import { ContractError, uuid } from "../../../packages/assessment-core/src/mod.ts";

/** Proctor Lite webcam stills: an identity photo and periodic pictures. */
export interface SnapshotRepository {
  user(token: string): Promise<string | null>;
  reserve(actor: string, tenant: string, session: string, sequence: number, kind: "identity" | "periodic", sha256: string, bytes: number, capturedAt: string): Promise<{ id: string; object_path: string; stored: boolean }>;
  stored(tenant: string, id: string): Promise<void>;
  list(actor: string, tenant: string, session: string): Promise<{ id: string; object_path: string; [key: string]: unknown }[]>;
  expired(limit: number): Promise<{ id: string; object_path: string }[]>;
  forget(ids: string[]): Promise<number>;
}
/** Private object storage for the pictures; the browser only ever gets short-lived signed links. */
export interface SnapshotStore {
  put(path: string, bytes: Uint8Array): Promise<void>;
  sign(paths: string[], seconds: number): Promise<Record<string, string>>;
  remove(paths: string[]): Promise<void>;
}
const MAX_BYTES = 300 * 1024;
const SIGNED_SECONDS = 120;
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
function equalSecret(left: string, right: string) {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}
async function picture(req: Request): Promise<Uint8Array<ArrayBuffer>> {
  if ((req.headers.get("content-type") ?? "").split(";")[0].trim() !== "image/jpeg") throw new ContractError("invalid_snapshot", "Snapshots must be JPEG images.", 415);
  const reader = req.body?.getReader();
  if (!reader) throw new ContractError("invalid_snapshot", "The snapshot is empty.", 422);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new ContractError("payload_too_large", "Snapshots must not exceed 300 KB.", 413);
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  // JPEG start-of-image marker; anything else is refused before storage.
  if (bytes.length < 100 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new ContractError("invalid_snapshot", "Snapshots must be JPEG images.", 422);
  return bytes;
}
export function createSnapshotHandler(repository: SnapshotRepository, store: SnapshotStore, allowedOrigins: string[], options: { sweepSecret: string }) {
  return async (req: Request): Promise<Response> => {
    const requestId = crypto.randomUUID(), origin = req.headers.get("origin");
    const headers: Record<string, string> = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Request-ID": requestId, Vary: "Origin" };
    if (origin && allowedOrigins.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
    const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers });
    if (origin && !allowedOrigins.includes(origin)) return json(403, { code: "origin_denied", error: "Origin is not allowed", request_id: requestId });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info" } });
    try {
      const url = new URL(req.url);
      const path = url.pathname.slice(url.pathname.indexOf("/proctor/snapshots/") + "/proctor/snapshots/".length);
      if (req.method === "POST" && path === "internal/sweep") {
        // Retention runs from a scheduler holding a dedicated secret, never from a browser.
        if (!options.sweepSecret || options.sweepSecret.length < 32 || !equalSecret(req.headers.get("x-proctor-sweep-secret") ?? "", options.sweepSecret)) throw new ContractError("forbidden", "Not allowed.", 403);
        const due = await repository.expired(200);
        if (due.length) {
          await store.remove(due.map((row) => row.object_path));
          await repository.forget(due.map((row) => row.id));
        }
        return json(200, { data: { deleted: due.length } });
      }
      const match = /^Bearer (\S+)$/.exec(req.headers.get("authorization") ?? "");
      const actor = match ? await repository.user(match[1]) : null;
      if (!actor) throw new ContractError("unauthorized", "Sign in to continue", 401);
      const tenant = uuid(url.searchParams.get("tenant_id"), "Tenant ID");
      if (req.method === "POST" && path === "candidate") {
        const session = uuid(url.searchParams.get("session_id"), "Session ID");
        const sequence = Number(url.searchParams.get("sequence"));
        if (!Number.isInteger(sequence) || sequence < 0 || sequence > 100000) throw new ContractError("invalid_snapshot", "Invalid snapshot number.", 422);
        const kind = url.searchParams.get("kind");
        if (kind !== "identity" && kind !== "periodic") throw new ContractError("invalid_snapshot", "Invalid snapshot kind.", 422);
        const captured = url.searchParams.get("captured_at") ?? "";
        if (!Number.isFinite(Date.parse(captured)) || !/(Z|[+-]\d{2}:\d{2})$/.test(captured)) throw new ContractError("invalid_snapshot", "Invalid capture time.", 422);
        const bytes = await picture(req);
        const sha256 = hex(await crypto.subtle.digest("SHA-256", bytes));
        // Authorize and pin the slot before anything is written.
        const slot = await repository.reserve(actor, tenant, session, sequence, kind, sha256, bytes.length, new Date(captured).toISOString());
        if (!slot.stored) {
          await store.put(slot.object_path, bytes);
          await repository.stored(tenant, slot.id);
        }
        return json(200, { data: { id: slot.id, sequence, stored: true } });
      }
      const listing = /^sessions\/([^/]+)$/.exec(path);
      if (req.method === "GET" && listing) {
        const rows = await repository.list(actor, tenant, uuid(listing[1], "Session ID"));
        const links = rows.length ? await store.sign(rows.map((row) => row.object_path), SIGNED_SECONDS) : {};
        return json(200, { data: rows.map(({ object_path, ...row }) => ({ ...row, url: links[object_path] ?? null })) });
      }
      throw new ContractError("not_found", "Resource not found", 404);
    } catch (cause) {
      if (cause instanceof ContractError) return json(cause.status, { code: cause.code, error: cause.message, request_id: requestId });
      console.error("proctor snapshot request failed", { request_id: requestId, error: cause instanceof Error ? cause.message : "Unknown failure" });
      return json(500, { code: "internal_error", error: "The snapshot service could not complete this request", request_id: requestId });
    }
  };
}
