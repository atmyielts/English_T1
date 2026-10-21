import { canonicalJson, uuid } from "../../assessment-core/src/mod.ts";
import {
  ARTIFACT_CHUNK_BYTES,
  ARTIFACT_MAX_BYTES,
  artifactInteger,
  type ArtifactMime,
  artifactMime,
  type ArtifactUpload,
  artifactUpload,
} from "../../assessment-core/src/artifacts.ts";
import {
  mediaAnswer,
  type MediaAnswerPolicy,
} from "../../assessment-core/src/media-answer.ts";
import type { LocalAnswerFile } from "./answer-types.ts";
import {LocalizedError} from './i18n/translate.ts';
export type { LocalAnswerFile } from "./answer-types.ts";
type Envelope = {
  id: string;
  scope: string;
  file: string;
  iv: Uint8Array;
  encrypted: ArrayBuffer;
};
const request = <T>(req: IDBRequest) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
const complete = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(
        tx.error ?? new LocalizedError("answerStore.localAnswerStorageTransaction"),
      );
  });
const digest = async (bytes: Uint8Array<ArrayBuffer>) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
async function openAnswerDatabase() {
  const opening = indexedDB.open("schood-academic-answer-files", 1);
  opening.onupgradeneeded = () => {
    opening.result.createObjectStore("keys");
    const states = opening.result.createObjectStore("states", {
      keyPath: "id",
    });
    states.createIndex("scope", "scope");
    const chunks = opening.result.createObjectStore("chunks", {
      keyPath: "id",
    });
    chunks.createIndex("file", ["scope", "file"]);
  };
  return await request<IDBDatabase>(opening);
}
/** Academic bytes only. No device credentials, Proctor IDs or plaintext file
 * content/filenames in IDB. A committed tail is encrypted even before sealing. */
export class AnswerFileStore {
  private closed = false;
  private constructor(
    private db: IDBDatabase,
    private scope: string,
    private key: CryptoKey,
  ) {}
  static async create(tenant: string, actor: string, attempt: string) {
    if (!navigator.locks || !crypto.subtle) {
      throw new LocalizedError("answerStore.secureAnswerRecoveryRequires");
    }
    const scope = `${uuid(tenant)}:${uuid(actor)}:${uuid(attempt)}`,
      db = await openAnswerDatabase();
    try {
      let key = await request<CryptoKey | undefined>(
        db.transaction("keys").objectStore("keys").get(scope),
      );
      if (!key) {
        const generated = await crypto.subtle.generateKey(
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"],
          ),
          tx = db.transaction("keys", "readwrite"),
          done = complete(tx);
        key = await request<CryptoKey | undefined>(
          tx.objectStore("keys").get(scope),
        ) ?? generated;
        tx.objectStore("keys").put(key, scope);
        await done;
      }
      return new AnswerFileStore(db, scope, key);
    } catch (cause) {
      db.close();
      throw cause;
    }
  }
  /** Discover only this actor/institution's local attempt scopes. Discovery
   * never authorizes a server read, starts a clock or decrypts foreign files. */
  static async savedAttempts(tenant: string, actor: string) {
    const prefix = `${uuid(tenant)}:${uuid(actor)}:`,
      db = await openAnswerDatabase();
    try {
      return await new Promise<string[]>((resolve, reject) => {
        const found = new Set<string>(),
          tx = db.transaction("states"),
          cursor = tx.objectStore("states").index("scope").openKeyCursor(
            IDBKeyRange.bound(prefix, prefix + "\uffff"),
          );
        cursor.onerror = () => reject(cursor.error);
        tx.onabort = () => reject(tx.error);
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (!row) {
            resolve([...found]);
            return;
          }
          try {
            found.add(uuid(String(row.key).slice(prefix.length)));
          } catch (cause) {
            reject(cause);
            return;
          }
          row.continue();
        };
      });
    } finally {
      db.close();
    }
  }
  private active() {
    if (this.closed) {
      throw new LocalizedError("answerStore.answerRecoveryWorkspaceClosed");
    }
  }
  private lock<T>(file: string, work: () => Promise<T>) {
    return navigator.locks.request(
      `academic-answer-file:${this.scope}:${file}`,
      async () => {
        this.active();
        return await work();
      },
    );
  }
  private id(file: string, index?: number) {
    return `${this.scope}:${uuid(file)}:${
      index === undefined ? "state" : index
    }`;
  }
  private async encrypt(
    id: string,
    file: string,
    bytes: Uint8Array<ArrayBuffer>,
  ): Promise<Envelope> {
    const iv = crypto.getRandomValues(new Uint8Array(12)),
      encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(id) },
        this.key,
        bytes,
      );
    return { id, scope: this.scope, file, iv, encrypted };
  }
  private async decrypt(row: Envelope, id: string) {
    if (row.id !== id || row.scope !== this.scope) {
      throw new LocalizedError("answerStore.savedAnswerBelongsAnother");
    }
    return new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: row.iv as Uint8Array<ArrayBuffer>,
          additionalData: new TextEncoder().encode(id),
        },
        this.key,
        row.encrypted,
      ),
    );
  }
  private stateEnvelope(state: LocalAnswerFile) {
    return this.encrypt(
      this.id(state.id),
      state.id,
      new TextEncoder().encode(JSON.stringify(state)),
    );
  }
  async read(id: string): Promise<LocalAnswerFile> {
    this.active();
    const key = this.id(id),
      row = await request<Envelope | undefined>(
        this.db.transaction("states").objectStore("states").get(key),
      );
    if (!row) {
      throw new LocalizedError("answerStore.answerSavedCurrentCandidate");
    }
    const state = JSON.parse(
      new TextDecoder().decode(await this.decrypt(row, key)),
    ) as LocalAnswerFile;
    if (
      state.id !== id || !["open", "sealed"].includes(state.phase) ||
      !["upload", "capture"].includes(state.source) ||
      typeof state.filename !== "string" || !state.filename.trim() ||
      state.filename.length > 240
    ) throw new LocalizedError("answerStore.savedAnswerCheckpointInvalid");
    uuid(state.item_version_id);
    uuid(state.key);
    artifactMime(state.mime);
    artifactInteger(state.max_bytes, "Saved byte limit", 1, ARTIFACT_MAX_BYTES);
    artifactInteger(state.byte_length, "Saved byte count", 0, state.max_bytes);
    if (state.phase === "sealed") {
      const manifest = artifactUpload(state.manifest);
      if (
        manifest.byte_length !== state.byte_length ||
        manifest.mime !== state.mime || manifest.filename !== state.filename
      ) {
        throw new LocalizedError("answerStore.sealedAnswerManifestMatch");
      }
    }
    if (state.binding) mediaAnswer(state.binding);
    if (state.upload) {
      if (state.phase !== "sealed" || !state.binding) {
        throw new LocalizedError("answerStore.savedUploadSealedAcademic");
      }
      artifactInteger(
        state.upload.next_part,
        "Saved upload part",
        0,
        state.manifest!.parts.length,
      );
      if (
        state.upload.completed &&
        (state.upload.next_part !== state.manifest!.parts.length ||
          !["quarantined", "ready", "rejected"].includes(
            state.upload.completed.state,
          ) || !/^[a-f0-9]{64}$/.test(state.upload.completed.manifest_hash))
      ) throw new LocalizedError("answerStore.savedCompletionReceiptInvalid");
    }
    return state;
  }
  async files() {
    this.active();
    const rows = await request<Envelope[]>(
      this.db.transaction("states").objectStore("states").index("scope").getAll(
        this.scope,
      ),
    );
    return Promise.all(rows.map((row) => this.read(row.file)));
  }
  async begin(
    item: string,
    filename: string,
    mime: ArtifactMime,
    source: "upload" | "capture",
    policy: MediaAnswerPolicy,
  ) {
    return this.lock("catalogue", async () => {
      if (
        !filename.trim() || filename.length > 240 ||
        !policy.mimes.includes(artifactMime(mime)) ||
        !policy.sources.includes(source)
      ) {
        throw new LocalizedError("answerStore.formatAnswerSourceAllowed");
      }
      const files = await this.files();
      if (files.length >= 64) {
        throw new LocalizedError("answerStore.tooManyLocalSubmissions");
      }
      const state: LocalAnswerFile = {
        id: crypto.randomUUID(),
        key: crypto.randomUUID(),
        item_version_id: uuid(item),
        filename,
        mime,
        source,
        max_bytes: artifactInteger(
          policy.max_bytes,
          "Answer byte limit",
          1,
          ARTIFACT_MAX_BYTES,
        ),
        byte_length: 0,
        phase: "open",
      };
      const envelope = await this.stateEnvelope(state),
        tx = this.db.transaction("states", "readwrite"),
        done = complete(tx);
      tx.objectStore("states").add(envelope);
      await done;
      return state;
    });
  }
  private async chunk(file: string, index: number) {
    const id = this.id(file, index),
      row = await request<Envelope | undefined>(
        this.db.transaction("chunks").objectStore("chunks").get(id),
      );
    if (!row) {
      throw new LocalizedError("answerStore.savedAnswerBytesMissing");
    }
    return this.decrypt(row, id);
  }
  /** Fixed-size encrypted chunks plus an encrypted replaceable tail. A new IV
   * protects every tail update; bytes + checkpoint commit in one transaction.
   * Prefix-matching replay supports lost local receipts and file reselection. */
  async append(file: string, offset: number, value: Uint8Array<ArrayBuffer>) {
    const bytes = value.slice();
    artifactInteger(offset, "Local answer offset", 0, ARTIFACT_MAX_BYTES);
    artifactInteger(
      bytes.byteLength,
      "Local append size",
      1,
      ARTIFACT_CHUNK_BYTES,
    );
    return this.lock(file, async () => {
      const state = await this.read(file), end = offset + bytes.byteLength;
      if (state.phase !== "open") {
        throw new LocalizedError("answerStore.answerSealedRecordChoose");
      }
      if (offset > state.byte_length || end > state.max_bytes) {
        throw new LocalizedError("answerStore.answerOffsetFileSize");
      }
      const overlap = Math.max(0, Math.min(end, state.byte_length) - offset);
      for (let checked = 0; checked < overlap;) {
        const position = offset + checked,
          chunk = await this.chunk(
            file,
            Math.floor(position / ARTIFACT_CHUNK_BYTES),
          ),
          start = position % ARTIFACT_CHUNK_BYTES,
          count = Math.min(overlap - checked, chunk.length - start);
        if (
          count <= 0 ||
          bytes.subarray(checked, checked + count).some((b, i) =>
            b !== chunk[start + i]
          )
        ) {
          throw new LocalizedError("answerStore.reselectedFileDiffersSaved");
        }
        checked += count;
      }
      if (end <= state.byte_length) return state;
      const tailIndex = Math.floor(state.byte_length / ARTIFACT_CHUNK_BYTES),
        tailLength = state.byte_length % ARTIFACT_CHUNK_BYTES,
        tail = tailLength
          ? await this.chunk(file, tailIndex)
          : new Uint8Array(0);
      if (tail.length !== tailLength) {
        throw new LocalizedError("answerStore.savedAnswerTailInvalid");
      }
      const merged = new Uint8Array(tailLength + bytes.byteLength - overlap);
      merged.set(tail);
      merged.set(bytes.subarray(overlap), tailLength);
      const envelopes: Envelope[] = [];
      for (
        let position = 0, index = tailIndex;
        position < merged.length;
        position += ARTIFACT_CHUNK_BYTES, index++
      ) {
        envelopes.push(
          await this.encrypt(
            this.id(file, index),
            file,
            merged.slice(position, position + ARTIFACT_CHUNK_BYTES),
          ),
        );
      }
      state.byte_length = end;
      const metadata = await this.stateEnvelope(state),
        tx = this.db.transaction(["states", "chunks"], "readwrite"),
        done = complete(tx);
      for (const row of envelopes) tx.objectStore("chunks").put(row);
      tx.objectStore("states").put(metadata);
      await done;
      return state;
    });
  }
  async seal(file: string) {
    return this.lock(file, async () => {
      const state = await this.read(file);
      if (state.phase === "sealed") return state;
      if (!state.byte_length) throw new LocalizedError("answerStore.savedAnswerEmpty");
      const parts = [];
      for (
        let index = 0;
        index < Math.ceil(state.byte_length / ARTIFACT_CHUNK_BYTES);
        index++
      ) {
        const bytes = await this.chunk(file, index),
          expected = Math.min(
            ARTIFACT_CHUNK_BYTES,
            state.byte_length - index * ARTIFACT_CHUNK_BYTES,
          );
        if (bytes.length !== expected) {
          throw new LocalizedError("answerStore.answerContainsIncompleteSaved");
        }
        parts.push({ sha256: await digest(bytes), byte_length: bytes.length });
      }
      state.phase = "sealed";
      state.manifest = artifactUpload({
        filename: state.filename,
        mime: state.mime,
        byte_length: state.byte_length,
        parts,
      });
      const metadata = await this.stateEnvelope(state),
        tx = this.db.transaction("states", "readwrite"),
        done = complete(tx);
      tx.objectStore("states").put(metadata);
      await done;
      return state;
    });
  }
  async part(file: string, index: number) {
    const state = await this.read(file);
    if (state.phase !== "sealed") {
      throw new LocalizedError("answerStore.sealCompleteLocalAnswer");
    }
    artifactInteger(
      index,
      "Answer part index",
      0,
      state.manifest!.parts.length - 1,
    );
    const bytes = await this.chunk(file, index),
      expected = state.manifest!.parts[index];
    if (
      bytes.length !== expected.byte_length ||
      await digest(bytes) !== expected.sha256
    ) {
      throw new LocalizedError("answerStore.savedPartMatchSealed");
    }
    return bytes;
  }
  async bind(file: string, value: unknown) {
    const binding = mediaAnswer(value);
    return this.lock(file, async () => {
      const state = await this.read(file);
      if (state.phase !== "sealed") {
        throw new LocalizedError("answerStore.sealedAnswerAdmitted");
      }
      if (
        state.binding && canonicalJson(state.binding) !== canonicalJson(binding)
      ) {
        throw new LocalizedError("answerStore.serviceReturnedDifferentBinding");
      }
      state.binding = binding;
      const metadata = await this.stateEnvelope(state),
        tx = this.db.transaction("states", "readwrite"),
        done = complete(tx);
      tx.objectStore("states").put(metadata);
      await done;
      return state;
    });
  }
  /** Explicit device-copy discard only; never cancels or deletes server answers. */
  async checkpoint(
    file: string,
    nextPart: number,
    completed?: {
      state: "quarantined" | "ready" | "rejected";
      manifest_hash: string;
    },
  ) {
    return this.lock(file, async () => {
      const state = await this.read(file);
      if (state.phase !== "sealed" || !state.binding) {
        throw new LocalizedError("answerStore.admitSealedAnswerCheckpointing");
      }
      artifactInteger(
        nextPart,
        "Confirmed upload part",
        state.upload?.next_part ?? 0,
        state.manifest!.parts.length,
      );
      if (
        completed &&
        (nextPart !== state.manifest!.parts.length ||
          !["quarantined", "ready", "rejected"].includes(completed.state) ||
          !/^[a-f0-9]{64}$/.test(completed.manifest_hash))
      ) {
        throw new LocalizedError("answerStore.serviceReturnValidCompletion");
      }
      if (
        state.upload?.completed &&
        canonicalJson(state.upload.completed) !==
          canonicalJson(completed ?? state.upload.completed)
      ) throw new LocalizedError("answerStore.completedUploadReceiptChanged");
      state.upload = {
        next_part: nextPart,
        ...(completed
          ? { completed }
          : state.upload?.completed
          ? { completed: state.upload.completed }
          : {}),
      };
      const envelope = await this.stateEnvelope(state),
        tx = this.db.transaction("states", "readwrite"),
        done = complete(tx);
      tx.objectStore("states").put(envelope);
      await done;
      return state;
    });
  }
  async discard(file: string) {
    return this.lock(file, async () => {
      await this.read(file);
      const tx = this.db.transaction(["states", "chunks"], "readwrite"),
        done = complete(tx),
        cursor = tx.objectStore("chunks").index("file").openKeyCursor(
          IDBKeyRange.only([this.scope, file]),
        );
      cursor.onsuccess = () => {
        if (cursor.result) {
          tx.objectStore("chunks").delete(cursor.result.primaryKey);
          cursor.result.continue();
        }
      };
      tx.objectStore("states").delete(this.id(file));
      await done;
    });
  }
  close() {
    this.closed = true;
    this.db.close();
  }
}
