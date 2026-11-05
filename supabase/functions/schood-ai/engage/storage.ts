import type { StorageRef } from './types.ts';

// Where then-vs-now voice samples and certificate recordings live. Production uses
// the repo's media pattern (supabase/functions/_shared/media-storage.ts: S3 upload
// and short-lived presigned reads); tests and the dev stack keep bytes in memory and
// hand back data: URLs. A sample row stores only the reference, never the bytes, and
// a link is signed for one person at a time for a few minutes.

export interface SampleStorage {
  put(path: string, bytes: Uint8Array, mime: string): Promise<StorageRef>;
  /** A short-lived URL for one playback, or null when the object is gone. */
  url(ref: StorageRef, ttlSeconds: number): Promise<string | null>;
  /** Deletes the object (engage.media_sweep); one already gone counts as deleted. Throws to be tried again. */
  remove(ref: StorageRef): Promise<void>;
}

export function memoryStorage(): SampleStorage & { objects: Map<string, { bytes: Uint8Array; mime: string }> } {
  const objects = new Map<string, { bytes: Uint8Array; mime: string }>();
  return {
    objects,
    put(path, bytes, mime) {
      objects.set(path, { bytes: bytes.slice(), mime });
      return Promise.resolve({ provider: 'memory', bucket: 'memory', path });
    },
    url(ref) {
      const object = objects.get(ref.path);
      return Promise.resolve(object ? `data:${object.mime};base64,${toBase64(object.bytes)}` : null);
    },
    remove(ref) {
      objects.delete(ref.path);
      return Promise.resolve();
    },
  };
}

/** S3 through the shared media helper, loaded only in production so tests never need AWS. */
export function s3Storage(client: unknown): SampleStorage {
  const media = import('../../_shared/media-storage.ts');
  return {
    async put(path, bytes, mime) {
      const { uploadFileToS3 } = await media;
      const stored = await uploadFileToS3(path, new File([new Uint8Array(bytes)], path.split('/').pop() ?? 'sample', { type: mime }), mime, { route: 'schood-ai/engage' });
      return { provider: 's3', bucket: stored.bucket, path: stored.path };
    },
    async url(ref, ttlSeconds) {
      const { signStorageRef } = await media;
      return await signStorageRef(client, { provider: ref.provider, bucket: ref.bucket, path: ref.path }, ttlSeconds, { route: 'schood-ai/engage' });
    },
    async remove(ref) {
      // Only engage's own objects; a sample may reference audio another area stored.
      if (!ref.path.startsWith('schood-ai/engage/')) return;
      const { deleteStorageRef } = await media;
      await deleteStorageRef(client, { provider: ref.provider, bucket: ref.bucket, path: ref.path }, { route: 'schood-ai/engage' });
    },
  };
}

/** Audio the browser records: webm/ogg/mp4/wav/mpeg, checked by magic bytes (as academy/assignment-audio.ts does). */
export function audioMime(bytes: Uint8Array, declared: string): string | null {
  const head = (n: number) => [...bytes.slice(0, n)];
  const startsWith = (sig: number[], offset = 0) => sig.every((byte, index) => bytes[offset + index] === byte);
  const mime = declared.split(';')[0].trim().toLowerCase();
  if (bytes.length < 12) return null;
  if (startsWith([0x1a, 0x45, 0xdf, 0xa3])) return 'audio/webm';
  if (startsWith([0x4f, 0x67, 0x67, 0x53])) return 'audio/ogg';
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x41, 0x56, 0x45], 8)) return 'audio/wav';
  if (startsWith([0x66, 0x74, 0x79, 0x70], 4)) return 'audio/mp4';
  if (startsWith([0x49, 0x44, 0x33]) || (head(2)[0] === 0xff && (head(2)[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  void mime;
  return null;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
export function fromBase64(text: string): Uint8Array | null {
  try {
    const binary = atob(text);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
