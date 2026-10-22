import { createSnapshotHandler, type SnapshotRepository, type SnapshotStore } from "./snapshot-handler.ts";
import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
const actor = "00000000-0000-4000-8000-000000000001", tenant = "10000000-0000-4000-8000-000000000001", session = "20000000-0000-4000-8000-000000000001";
const secret = "s".repeat(40);
function equal(actual: unknown, expected: unknown) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`); }
const jpeg = (size = 2000, fill = 1) => { const bytes = new Uint8Array(size).fill(fill); bytes.set([0xff, 0xd8, 0xff, 0xe0]); return bytes; };
function fixture(options: { refuse?: boolean; stored?: boolean } = {}) {
  const calls: unknown[][] = [], objects = new Map<string, Uint8Array>();
  const repository: SnapshotRepository = {
    user: (token) => Promise.resolve(token === "valid" ? actor : null),
    reserve: (...args) => { calls.push(["reserve", ...args]); if (options.refuse) return Promise.reject(new ContractError("not_found", "not_found", 404)); return Promise.resolve({ id: "snap-1", object_path: `${tenant}/${session}/000001.jpg`, stored: options.stored ?? false }); },
    stored: (...args) => { calls.push(["stored", ...args]); return Promise.resolve(); },
    list: (...args) => { calls.push(["list", ...args]); return Promise.resolve([{ id: "snap-1", sequence: 0, kind: "identity", object_path: `${tenant}/${session}/000000.jpg` }]); },
    expired: (limit) => { calls.push(["expired", limit]); return Promise.resolve([{ id: "old-1", object_path: "a/b/old.jpg" }]); },
    forget: (ids) => { calls.push(["forget", ids]); return Promise.resolve(ids.length); },
  };
  const store: SnapshotStore = {
    put: (path, bytes) => { objects.set(path, bytes); return Promise.resolve(); },
    sign: (paths, seconds) => Promise.resolve(Object.fromEntries(paths.map((path) => [path, `https://signed.invalid/${path}?s=${seconds}`]))),
    remove: (paths) => { for (const path of paths) objects.delete(path); calls.push(["remove", paths]); return Promise.resolve(); },
  };
  return { calls, objects, handle: createSnapshotHandler(repository, store, ["https://exam.schood.online"], { sweepSecret: secret }) };
}
const upload = (body: BodyInit, query = `tenant_id=${tenant}&session_id=${session}&sequence=1&kind=periodic&captured_at=2026-10-22T10:00:00.000Z`, headers: Record<string, string> = {}) =>
  new Request(`https://x.invalid/functions/v1/proctor/snapshots/candidate?${query}`, { method: "POST", headers: { authorization: "Bearer valid", "content-type": "image/jpeg", origin: "https://exam.schood.online", ...headers }, body });

Deno.test("a candidate's JPEG is authorized before it is stored, then confirmed", async () => {
  const { calls, objects, handle } = fixture();
  const response = await handle(upload(jpeg()));
  equal(response.status, 200);
  equal(calls[0].slice(0, 6), ["reserve", actor, tenant, session, 1, "periodic"]);
  equal((calls[0][6] as string).length, 64);
  equal(calls[1], ["stored", tenant, "snap-1"]);
  equal(objects.size, 1);
});
Deno.test("refused, malformed or oversized pictures are never written", async () => {
  for (const [request, status] of [
    [upload(jpeg(), undefined, { authorization: "Bearer nope" }), 401],
    [upload(new Uint8Array(2000).fill(7)), 422],
    [upload(jpeg(400 * 1024)), 413],
    [upload(jpeg(), undefined, { "content-type": "image/png" }), 415],
    [upload(jpeg(), `tenant_id=${tenant}&session_id=${session}&sequence=-1&kind=periodic&captured_at=2026-10-22T10:00:00Z`), 422],
    [upload(jpeg(), `tenant_id=${tenant}&session_id=${session}&sequence=1&kind=video&captured_at=2026-10-22T10:00:00Z`), 422],
    [upload(jpeg(), `tenant_id=${tenant}&session_id=${session}&sequence=1&kind=periodic&captured_at=yesterday`), 422],
    [upload(jpeg(), undefined, { origin: "https://evil.example" }), 403],
  ] as const) {
    const { objects, handle } = fixture();
    equal((await handle(request)).status, status);
    equal(objects.size, 0);
  }
  const refused = fixture({ refuse: true });
  equal((await refused.handle(upload(jpeg()))).status, 404);
  equal(refused.objects.size, 0);
});
Deno.test("a retry of an already stored picture does not write again", async () => {
  const { calls, objects, handle } = fixture({ stored: true });
  equal((await handle(upload(jpeg()))).status, 200);
  equal(objects.size, 0);
  equal(calls.length, 1);
});
Deno.test("reviewers get short-lived signed links, never storage paths", async () => {
  const { handle } = fixture();
  const response = await handle(new Request(`https://x.invalid/functions/v1/proctor/snapshots/sessions/${session}?tenant_id=${tenant}`, { headers: { authorization: "Bearer valid" } }));
  const body = await response.json();
  equal(response.status, 200);
  equal(Object.keys(body.data[0]).sort(), ["id", "kind", "sequence", "url"]);
  equal(body.data[0].url.endsWith("?s=120"), true);
});
Deno.test("retention sweep needs its dedicated secret and deletes storage before forgetting rows", async () => {
  const { calls, handle } = fixture();
  const sweep = (value?: string) => new Request("https://x.invalid/functions/v1/proctor/snapshots/internal/sweep", { method: "POST", headers: value ? { "x-proctor-sweep-secret": value } : {} });
  equal((await handle(sweep())).status, 403);
  equal((await handle(sweep("s".repeat(39)))).status, 403);
  equal(calls.length, 0);
  const response = await handle(sweep(secret));
  equal(response.status, 200);
  equal((await response.json()).data, { deleted: 1 });
  equal(calls.map((call) => call[0]), ["expired", "remove", "forget"]);
  const disabled = createSnapshotHandler({} as SnapshotRepository, {} as SnapshotStore, [], { sweepSecret: "" });
  equal((await disabled(sweep(""))).status, 403);
});
