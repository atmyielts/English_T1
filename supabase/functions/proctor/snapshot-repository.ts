import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
import type { RecordingDatabase } from "./recording-repository.ts";
import type { SnapshotRepository, SnapshotStore } from "./snapshot-handler.ts";

export function createSnapshotRepository(user: SnapshotRepository["user"], database: RecordingDatabase): SnapshotRepository {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await database.rpc(name, args);
    if (error) {
      const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code === "23505" ? 409 : ["22023", "23514", "23502", "22P02", "22007", "22008", "22003"].includes(error.code ?? "") ? 422 : 500;
      throw new ContractError(status === 500 ? "database_error" : error.message, status === 500 ? "The snapshot database request failed." : error.message, status);
    }
    return data;
  }
  return {
    user,
    reserve: async (actor, tenant, session, sequence, kind, sha256, bytes, capturedAt) =>
      await rpc("proctor_snapshot_reserve", { p_actor: actor, p_tenant: tenant, p_session: session, p_sequence: sequence, p_kind: kind, p_sha256: sha256, p_bytes: bytes, p_captured_at: capturedAt }) as Awaited<ReturnType<SnapshotRepository["reserve"]>>,
    stored: async (tenant, id) => { await rpc("proctor_snapshot_stored", { p_tenant: tenant, p_id: id }); },
    list: async (actor, tenant, session) => (await rpc("proctor_snapshot_list", { p_actor: actor, p_tenant: tenant, p_session: session }) ?? []) as Awaited<ReturnType<SnapshotRepository["list"]>>,
    expired: async (limit) => (await rpc("proctor_snapshot_expired", { p_limit: limit }) ?? []) as Awaited<ReturnType<SnapshotRepository["expired"]>>,
    forget: async (ids) => Number(await rpc("proctor_snapshot_forget", { p_ids: ids })),
  };
}

interface StorageBucket {
  upload(path: string, body: Uint8Array, options: { contentType: string; upsert: boolean; cacheControl: string }): PromiseLike<{ error: { message: string } | null }>;
  createSignedUrls(paths: string[], seconds: number): PromiseLike<{ data: { path: string | null; signedUrl: string }[] | null; error: { message: string } | null }>;
  remove(paths: string[]): PromiseLike<{ error: { message: string } | null }>;
}
/** Supabase Storage private bucket `proctor-snapshots`. Paths are content-addressed, so a retried upload rewrites identical bytes. */
export function createSnapshotStore(storage: { from(bucket: string): StorageBucket }): SnapshotStore {
  const bucket = () => storage.from("proctor-snapshots");
  const unavailable = (): never => { throw new ContractError("snapshot_storage_unavailable", "Snapshot storage is unavailable. Try again.", 503); };
  return {
    async put(path, bytes) {
      const { error } = await bucket().upload(path, bytes, { contentType: "image/jpeg", upsert: true, cacheControl: "0" });
      if (error) unavailable();
    },
    async sign(paths, seconds) {
      const { data, error } = await bucket().createSignedUrls(paths, seconds);
      if (error || !data) unavailable();
      return Object.fromEntries(data!.filter((row) => row.path).map((row) => [row.path!, row.signedUrl]));
    },
    async remove(paths) {
      const { error } = await bucket().remove(paths);
      if (error) unavailable();
    },
  };
}
