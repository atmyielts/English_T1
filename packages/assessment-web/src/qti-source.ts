import {
  QTI_SOURCE_MAX_BYTES,
  type QtiSourceUpload,
  qtiSourceUpload,
} from "../../assessment-core/src/qti.ts";
import { ARTIFACT_CHUNK_BYTES } from "../../assessment-core/src/artifacts.ts";
import {LocalizedError} from './i18n/translate.ts';
export interface PreparedQtiSource {
  manifest: QtiSourceUpload;
  bytes: Uint8Array<ArrayBuffer>;
}
const digest = async (bytes: Uint8Array<ArrayBuffer>) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
/** Package bytes stay in memory only. Recovery requires selecting the identical file. */
export async function prepareQtiSource(
  file: File,
  bank: string,
  active: () => void = () => {},
): Promise<PreparedQtiSource> {
  if (
    !file.name.toLowerCase().endsWith(".zip") || file.size < 22 ||
    file.size > QTI_SOURCE_MAX_BYTES
  ) {
    throw new LocalizedError("qti.chooseQtiZipPackage");
  }
  active();
  const bytes = new Uint8Array(await file.arrayBuffer());
  active();
  const parts = [];
  for (
    let offset = 0;
    offset < bytes.byteLength;
    offset += ARTIFACT_CHUNK_BYTES
  ) {
    const part = bytes.slice(offset, offset + ARTIFACT_CHUNK_BYTES);
    parts.push({ sha256: await digest(part), byte_length: part.byteLength });
    active();
  }
  const source_hash = await digest(bytes);
  active();
  return {
    bytes,
    manifest: qtiSourceUpload({
      bank_id: bank,
      filename: file.name,
      source_hash,
      byte_length: bytes.byteLength,
      parts,
    }),
  };
}
export async function transferQtiSource(
  source: PreparedQtiSource,
  job: { bank_id: string; source_hash: string; byte_length: number },
  ports: {
    active(): void;
    part(index: number, bytes: ArrayBuffer): Promise<unknown>;
    complete(): Promise<unknown>;
    progress(received: number, total: number): void;
  },
) {
  const { manifest, bytes } = source;
  if (
    manifest.bank_id !== job.bank_id ||
    manifest.source_hash !== job.source_hash ||
    manifest.byte_length !== job.byte_length
  ) {
    throw new LocalizedError("qti.selectIdenticalPackageDestination");
  }
  // Recheck memory before transport; a changed local buffer must not be sent under its old identity.
  if (await digest(bytes) !== manifest.source_hash) {
    throw new LocalizedError("qti.selectedPackageChangedSelect");
  }
  for (let index = 0; index < manifest.parts.length; index++) {
    ports.active();
    const part = bytes.slice(
      index * ARTIFACT_CHUNK_BYTES,
      (index + 1) * ARTIFACT_CHUNK_BYTES,
    );
    await ports.part(index, part.buffer);
    ports.active();
    ports.progress(index + 1, manifest.parts.length);
  }
  ports.active();
  await ports.complete();
  ports.active();
}
