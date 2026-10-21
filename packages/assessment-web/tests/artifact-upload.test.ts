import {
  ArtifactUploads,
  fileManifest,
  type UploadIntent,
  type UploadStore,
  type UploadBackend,
} from "../src/artifact-upload.ts";
import type { ArtifactUpload } from "../../assessment-core/src/artifacts.ts";
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
async function fails(work: () => Promise<unknown>) {
  let rejected = false;
  try {
    await work();
  } catch {
    rejected = true;
  }
  equal(rejected, true);
}
const lock = <T>(work: () => Promise<T>) => work();
class Store implements UploadStore {
  value: UploadIntent | null = null;
  count = 0;
  pending() {
    return Promise.resolve(this.value);
  }
  save(manifest: ArtifactUpload) {
    this.value = {
      key: `stable-upload-${++this.count}`,
      manifest: structuredClone(manifest),
      cancelling: false,
    };
    return Promise.resolve(this.value);
  }
  cancel() {
    this.value!.cancelling = true;
    return Promise.resolve();
  }
  acknowledge() {
    this.value = null;
    return Promise.resolve();
  }
}
function file(bytes = new Uint8Array([1, 2, 3]), name = "picture.png") {
  return new File([bytes], name, { type: "image/png" });
}
function backend(): UploadBackend {
  return {
    begin: () =>
      Promise.resolve({ id: "canonical-artifact", state: "uploading" }),
    part: () => Promise.resolve({}),
    complete: () =>
      Promise.resolve({ id: "canonical-artifact", state: "quarantined" }),
    cancel: () =>
      Promise.resolve({ id: "canonical-artifact", state: "cancelled" }),
  };
}
Deno.test(
  "file manifests hash complete one-MiB parts and report bounded progress",
  async () => {
    const bytes = new Uint8Array(1048579).fill(42),
      progress: number[] = [];
    const manifest = await fileManifest(file(bytes), "image/png", (p) =>
      progress.push(p.done),
    );
    equal(
      manifest.parts.map((p) => p.byte_length),
      [1048576, 3],
    );
    equal(manifest.byte_length, bytes.length);
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", bytes.slice(1048576)),
      ),
      (v) => v.toString(16).padStart(2, "0"),
    ).join("");
    equal(manifest.parts[1].sha256, hash);
    equal(progress, [0, 1048576, 1048579]);
    await fails(() => fileManifest(file(new Uint8Array()), "image/png"));
  },
);
Deno.test(
  "lost begin reply survives recreation and keeps the same upload identity",
  async () => {
    const store = new Store(),
      keys: string[] = [],
      api = backend();
    api.begin = (intent) => {
      keys.push(intent.key);
      return Promise.reject(new Error("reply lost"));
    };
    await fails(() =>
      new ArtifactUploads(store, api, lock).upload(file(), "image/png"),
    );
    equal(store.count, 1);
    api.begin = (intent) => {
      keys.push(intent.key);
      return Promise.resolve({ id: "canonical-artifact", state: "uploading" });
    };
    equal(
      (await new ArtifactUploads(store, api, lock).upload(file(), "image/png"))
        .state,
      "quarantined",
    );
    equal(keys, ["stable-upload-1", "stable-upload-1"]);
    equal(store.value, null);
  },
);
Deno.test(
  "different bytes or declared format cannot replace an unresolved upload",
  async () => {
    const store = new Store(),
      api = backend();
    let sends = 0;
    api.part = () => {
      sends++;
      return Promise.reject(new Error("offline"));
    };
    await fails(() =>
      new ArtifactUploads(store, api, lock).upload(file(), "image/png"),
    );
    await fails(() =>
      new ArtifactUploads(store, api, lock).upload(
        file(new Uint8Array([9, 2, 3])),
        "image/png",
      ),
    );
    await fails(() =>
      new ArtifactUploads(store, api, lock).upload(file(), "image/jpeg"),
    );
    equal(sends, 1);
    equal(store.count, 1);
  },
);
Deno.test(
  "uncertain completion replays pinned parts without declaring scanning success ready",
  async () => {
    const store = new Store(),
      api = backend();
    let parts = 0;
    api.part = () => {
      parts++;
      return Promise.resolve({});
    };
    api.complete = () => Promise.reject(new Error("lost completed reply"));
    await fails(() =>
      new ArtifactUploads(store, api, lock).upload(file(), "image/png"),
    );
    equal(store.value !== null, true);
    api.complete = () =>
      Promise.resolve({ id: "canonical-artifact", state: "quarantined" });
    equal(
      (await new ArtifactUploads(store, api, lock).upload(file(), "image/png"))
        .state,
      "quarantined",
    );
    equal(parts, 2);
    equal(store.count, 1);
  },
);
Deno.test(
  "cancel identity persists through lost replies and blocks replacement uploads",
  async () => {
    const store = new Store(),
      api = backend(),
      keys: string[] = [];
    api.begin = () => Promise.reject(new Error("offline"));
    await fails(() =>
      new ArtifactUploads(store, api, lock).upload(file(), "image/png"),
    );
    api.begin = () =>
      Promise.resolve({ id: "canonical-artifact", state: "uploading" });
    api.cancel = (_id, key) => {
      keys.push(key);
      return Promise.reject(new Error("lost cancellation"));
    };
    await fails(() => new ArtifactUploads(store, api, lock).cancel());
    equal(store.value?.cancelling, true);
    await fails(() =>
      new ArtifactUploads(store, api, lock).upload(file(), "image/png"),
    );
    api.cancel = (_id, key) => {
      keys.push(key);
      return Promise.resolve({ id: "canonical-artifact", state: "cancelled" });
    };
    equal(
      (await new ArtifactUploads(store, api, lock).cancel()).state,
      "cancelled",
    );
    equal(keys, ["stable-upload-1:cancel", "stable-upload-1:cancel"]);
    equal(store.value, null);
  },
);
Deno.test(
  "permission removal and malformed completion receipts retain recoverable metadata",
  async () => {
    for (const failure of [{ status: 403, code: "forbidden" }, null]) {
      const store = new Store(),
        api = backend();
      api.complete = () =>
        failure
          ? Promise.reject(failure)
          : Promise.resolve({ id: "canonical-artifact", state: "uploading" });
      await fails(() =>
        new ArtifactUploads(store, api, lock).upload(file(), "image/png"),
      );
      equal(store.value !== null, true);
    }
  },
);
