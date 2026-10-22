import type { CaptureSegment, CaptureSink } from "./capture.ts";
import type { CaptureMeta, CaptureUploadState } from "./recording-types.ts";
import { canonicalJson } from "../../assessment-core/src/mod.ts";
import {
  RECORDING_SEGMENT_BYTES,
  RECORDING_ZERO_HASH,
  recordingCommand,
  recordingHash,
  recordingInteger,
} from "../../assessment-core/src/recordings.ts";
type StateEnvelope = {
  id: string;
  scope: string;
  iv: Uint8Array;
  encrypted: ArrayBuffer;
};
type Envelope = {
  id: string;
  scope: string;
  recording: string;
  sequence: number;
  byte_length: number;
  iv: Uint8Array;
  encrypted: ArrayBuffer;
};
const MAX_PENDING = 64 * 1024 * 1024;
function complete(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function request<T>(req: IDBRequest) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function open() {
  const req = indexedDB.open("schood-proctor-capture", 2);
  req.onupgradeneeded = (event) => {
    if (event.oldVersion < 1) {
      req.result.createObjectStore("keys");
      const segments = req.result.createObjectStore("segments", {
        keyPath: "id",
      });
      segments.createIndex("scope", "scope");
    }
    if (event.oldVersion < 2) {
      const states = req.result.createObjectStore("states", { keyPath: "id" });
      states.createIndex("scope", "scope");
    }
  };
  return request<IDBDatabase>(req);
}
/** Actor + tenant + session scope, nonextractable keys, binary AEAD; no token or plaintext footage in IDB.
 * Web Locks serialize capacity checks and duplicate writes across documents. */
export class CaptureJournal implements CaptureSink {
  private constructor(
    private db: IDBDatabase,
    private scope: string,
    private key: CryptoKey,
  ) {}
  static async create(scope: string) {
    if (!navigator.locks) {
      throw new Error(
        "Secure recording recovery requires browser locking support.",
      );
    }
    const db = await open();
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
      return new CaptureJournal(db, scope, key);
    } catch (cause) {
      db.close();
      throw cause;
    }
  }
  private lock<T>(work: () => Promise<T>) {
    return navigator.locks.request(`proctor-capture:${this.scope}`, work);
  }
  async run<T>(recording: string, work: () => Promise<T>): Promise<T> {
    return await navigator.locks.request(
      `proctor-recording-drain:${this.scope}:${recording}`,
      work,
    );
  }
  private async envelope(state: CaptureUploadState): Promise<StateEnvelope> {
    const id = `${this.scope}:state:${state.meta.recording_id}`,
      iv = crypto.getRandomValues(new Uint8Array(12)),
      encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(id) },
        this.key,
        new TextEncoder().encode(JSON.stringify(state)),
      );
    return { id, scope: this.scope, iv, encrypted };
  }
  private async saveState(state: CaptureUploadState) {
    const envelope = await this.envelope(state),
      tx = this.db.transaction("states", "readwrite"),
      done = complete(tx);
    tx.objectStore("states").put(envelope);
    await done;
  }
  async initialize(meta: CaptureMeta) {
    const normalized = recordingCommand(
      "recording.begin",
      meta,
    ) as unknown as CaptureMeta;
    return this.lock(async () => {
      const row = await request<StateEnvelope | undefined>(
        this.db.transaction("states").objectStore("states").get(
          `${this.scope}:state:${meta.recording_id}`,
        ),
      );
      if (row) {
        const state = await this.readState(meta.recording_id);
        if (canonicalJson(state.meta) !== canonicalJson(normalized)) {
          throw new Error(
            "A different recording start is already saved on this device.",
          );
        }
        return state;
      }
      const state: CaptureUploadState = {
        meta: normalized,
        phase: "prepared",
        ack_sequence: 0,
        head_hash: RECORDING_ZERO_HASH,
        last_end_ms: 0,
        close_reason: null,
      };
      await this.saveState(state);
      return state;
    });
  }
  async readState(recording: string): Promise<CaptureUploadState> {
    const id = `${this.scope}:state:${recording}`,
      row = await request<StateEnvelope | undefined>(
        this.db.transaction("states").objectStore("states").get(id),
      );
    if (!row) {
      throw new Error("The recording start/head is not saved on this device.");
    }
    const plain = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: row.iv as Uint8Array<ArrayBuffer>,
          additionalData: new TextEncoder().encode(id),
        },
        this.key,
        row.encrypted,
      ),
      state = JSON.parse(new TextDecoder().decode(plain)) as CaptureUploadState;
    if (
      state.meta.recording_id !== recording ||
      !["prepared", "open", "sealed"].includes(state.phase) ||
      !Number.isSafeInteger(state.ack_sequence) || state.ack_sequence < 0 ||
      !Number.isSafeInteger(state.last_end_ms) || state.last_end_ms < 0
    ) throw new Error("The saved recording checkpoint is invalid.");
    recordingHash(state.head_hash);
    recordingCommand("recording.begin", state.meta);
    return state;
  }
  async states(): Promise<CaptureUploadState[]> {
    const rows = await request<StateEnvelope[]>(
      this.db.transaction("states").objectStore("states").index("scope").getAll(
        this.scope,
      ),
    );
    return Promise.all(
      rows.map((row) =>
        this.readState(row.id.slice(`${this.scope}:state:`.length))
      ),
    );
  }
  async opened(recording: string) {
    return this.lock(async () => {
      const state = await this.readState(recording);
      if (state.phase === "prepared") {
        state.phase = "open";
        await this.saveState(state);
      }
    });
  }
  async closing(recording: string, reason: string) {
    return this.lock(async () => {
      const state = await this.readState(recording);
      recordingCommand("recording.close", {
        recording_id: recording,
        expected_sequence: state.ack_sequence,
        expected_hash: state.head_hash,
        reason,
      });
      if (state.close_reason && state.close_reason !== reason) {
        throw new Error(
          "A different recording closure is already saved. Retry that closure.",
        );
      }
      state.close_reason = reason;
      await this.saveState(state);
    });
  }
  async sealed(recording: string) {
    return this.lock(async () => {
      const state = await this.readState(recording);
      if (!state.close_reason) {
        throw new Error("Recording closure has not been requested.");
      }
      state.phase = "sealed";
      await this.saveState(state);
    });
  }
  async commit(
    recording: string,
    sequence: number,
    previous: string,
    head: string,
    end: number,
  ) {
    return this.lock(async () => {
      recordingHash(head);
      const state = await this.readState(recording);
      if (state.ack_sequence === sequence && state.head_hash === head) return;
      if (
        state.phase !== "open" || state.ack_sequence + 1 !== sequence ||
        state.head_hash !== previous || !Number.isSafeInteger(end) ||
        end <= state.last_end_ms
      ) {
        throw new Error(
          "The saved recording head changed before acknowledgement.",
        );
      }
      const id = `${this.scope}:${recording}:${sequence}`,
        pending = await request<Envelope | undefined>(
          this.db.transaction("segments").objectStore("segments").get(id),
        );
      if (!pending) {
        throw new Error(
          "Saved footage is missing; do not advance its checkpoint.",
        );
      }
      state.ack_sequence = sequence;
      state.head_hash = head;
      state.last_end_ms = end;
      const envelope = await this.envelope(state),
        tx = this.db.transaction(["states", "segments"], "readwrite"),
        done = complete(tx);
      tx.objectStore("states").put(envelope);
      tx.objectStore("segments").delete(id);
      await done;
    });
  }
  private all() {
    return request<Envelope[]>(
      this.db.transaction("segments").objectStore("segments").index("scope")
        .getAll(this.scope),
    );
  }
  async append(segment: CaptureSegment) {
    return this.lock(async () => {
      const state = await this.readState(segment.recording_id);
      if (state.phase === "sealed" || state.close_reason) {
        throw new Error(
          "This recording is closing. Start a new recording after recovery.",
        );
      }
      const entries = await this.all(),
        id = `${this.scope}:${segment.recording_id}:${segment.sequence}`;
      recordingInteger(segment.sequence, "Capture sequence", 1, 100000);
      recordingInteger(segment.start_ms, "Capture start", 0, 86400000);
      recordingInteger(
        segment.end_ms,
        "Capture end",
        segment.start_ms + 1,
        Math.min(86400000, segment.start_ms + 60000),
      );
      recordingInteger(
        segment.bytes.length,
        "Capture bytes",
        1,
        RECORDING_SEGMENT_BYTES,
      );
      const last = entries.filter((entry) =>
        entry.recording === segment.recording_id
      ).reduce(
        (maximum, entry) => Math.max(maximum, entry.sequence),
        state.ack_sequence,
      );
      if (segment.sequence !== last + 1) {
        throw new Error(
          "Capture sequence changed. Recover the saved recorder instead of restarting its container.",
        );
      }
      if (entries.some((e) => e.id === id)) {
        throw new Error(
          "Recording segment already exists; recover the saved stream before restarting.",
        );
      }
      if (
        entries.reduce((sum, e) => sum + e.byte_length, 0) +
            segment.bytes.length > MAX_PENDING
      ) {
        throw new Error(
          "Pending recording storage reached 64 MiB. Restore your connection before continuing.",
        );
      }
      const header = new TextEncoder().encode(
          JSON.stringify({
            recording_id: segment.recording_id,
            sequence: segment.sequence,
            start_ms: segment.start_ms,
            end_ms: segment.end_ms,
          }),
        ),
        plain = new Uint8Array(4 + header.length + segment.bytes.length);
      new DataView(plain.buffer).setUint32(0, header.length);
      plain.set(header, 4);
      plain.set(segment.bytes, 4 + header.length);
      const iv = crypto.getRandomValues(new Uint8Array(12)),
        encrypted = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(id) },
          this.key,
          plain,
        ),
        tx = this.db.transaction("segments", "readwrite"),
        done = complete(tx);
      tx.objectStore("segments").add(
        {
          id,
          scope: this.scope,
          recording: segment.recording_id,
          sequence: segment.sequence,
          byte_length: segment.bytes.length,
          iv,
          encrypted,
        } satisfies Envelope,
      );
      await done;
    });
  }
  async pending(recording: string): Promise<CaptureSegment[]> {
    const entries = (await this.all()).filter((e) => e.recording === recording)
        .sort((a, b) => a.sequence - b.sequence),
      result: CaptureSegment[] = [];
    for (const e of entries) {
      const plain = new Uint8Array(
          await crypto.subtle.decrypt(
            {
              name: "AES-GCM",
              iv: e.iv as Uint8Array<ArrayBuffer>,
              additionalData: new TextEncoder().encode(e.id),
            },
            this.key,
            e.encrypted,
          ),
        ),
        length = new DataView(plain.buffer).getUint32(0);
      if (length > 2048 || 4 + length > plain.length) {
        throw new Error("Saved capture envelope is invalid.");
      }
      const header = JSON.parse(
        new TextDecoder().decode(plain.slice(4, 4 + length)),
      );
      if (
        header.recording_id !== e.recording || header.sequence !== e.sequence ||
        plain.length - 4 - length !== e.byte_length
      ) throw new Error("Saved capture scope is invalid.");
      result.push({ ...header, bytes: plain.slice(4 + length) });
    }
    return result;
  }
  async acknowledge(recording: string, sequence: number) {
    throw new Error(
      `Use a confirmed atomic head acknowledgement for ${recording}, segment ${sequence}.`,
    );
  }
  close() {
    this.db.close();
  }
}
