// Logos come in as data URLs and are rebuilt from the parts an image needs: anything else
// in the file (metadata, comments, whatever follows the end of the image) is dropped, and
// only PNG and JPEG get through. SVG is refused outright because it can carry scripts.
import { CompanyError } from '../types.ts';

export const MAX_LOGO_BYTES = 100 * 1024;
const MAX_SIDE = 4000;

const bad = (reason: string) => new CompanyError('logo_invalid', 'Upload a small PNG or JPEG image.', 400, { field: 'logo', reason });

function decode(base64: string): Uint8Array {
  try {
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
    return bytes;
  } catch {
    throw bad('encoding');
  }
}

function encode(bytes: Uint8Array): string {
  let raw = '';
  for (let from = 0; from < bytes.length; from += 0x8000) raw += String.fromCharCode(...bytes.subarray(from, from + 0x8000));
  return btoa(raw);
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** What is needed to draw the image. Colour-space chunks are kept so it looks the same. */
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'sRGB', 'cHRM', 'pHYs']);

export function cleanPng(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 45 || SIGNATURE.some((value, index) => bytes[index] !== value)) throw bad('not_png');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let at = 8, sawHeader = false, sawData = false, sawEnd = false;
  while (at + 12 <= bytes.length) {
    const length = view.getUint32(at);
    const end = at + 12 + length;
    if (end > bytes.length) throw bad('truncated');
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (!sawHeader) {
      if (type !== 'IHDR' || length !== 13) throw bad('no_header');
      const width = view.getUint32(at + 8), height = view.getUint32(at + 12);
      if (!width || !height || width > MAX_SIDE || height > MAX_SIDE) throw bad('size');
      sawHeader = true;
    }
    if (type === 'IDAT') sawData = true;
    if (PNG_KEEP.has(type)) parts.push(bytes.subarray(at, end));
    at = end;
    if (type === 'IEND') { sawEnd = true; break; }
  }
  if (!sawHeader || !sawData || !sawEnd) throw bad('truncated');
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

/** Markers with no length after them. */
const standalone = (marker: number) => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9);
/** APP0 (JFIF) and APP14 (Adobe colour transform) change how a JPEG looks; the other APPs and comments do not. */
const dropJpeg = (marker: number) => marker === 0xfe || (marker >= 0xe1 && marker <= 0xed) || marker === 0xef;

export function cleanJpeg(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw bad('not_jpeg');
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let at = 2, sawFrame = false, sawScan = false;
  while (at < bytes.length) {
    if (bytes[at] !== 0xff) throw bad('malformed');
    let next = at + 1;
    while (next < bytes.length && bytes[next] === 0xff) next++; // fill bytes
    const marker = bytes[next];
    if (marker === undefined) throw bad('truncated');
    if (marker === 0xd9) { parts.push(new Uint8Array([0xff, 0xd9])); return join(parts, sawFrame, sawScan); }
    if (standalone(marker)) { at = next + 1; continue; }
    if (next + 2 >= bytes.length) throw bad('truncated');
    const length = (bytes[next + 1] << 8) | bytes[next + 2];
    if (length < 2) throw bad('malformed');
    const end = next + 1 + length;
    if (end > bytes.length) throw bad('truncated');
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (length < 8) throw bad('malformed');
      const height = (bytes[next + 4] << 8) | bytes[next + 5], width = (bytes[next + 6] << 8) | bytes[next + 7];
      if (!width || !height || width > MAX_SIDE || height > MAX_SIDE) throw bad('size');
      sawFrame = true;
    }
    if (!dropJpeg(marker)) parts.push(bytes.subarray(next - 1, end));
    at = end;
    if (marker === 0xda) {
      sawScan = true;
      // Entropy-coded data runs to the next marker; FF00 and restart markers are part of it.
      let scan = at;
      while (scan + 1 < bytes.length) {
        if (bytes[scan] === 0xff && bytes[scan + 1] !== 0x00 && !(bytes[scan + 1] >= 0xd0 && bytes[scan + 1] <= 0xd7) && bytes[scan + 1] !== 0xff) break;
        scan++;
      }
      if (scan + 1 >= bytes.length) throw bad('truncated');
      parts.push(bytes.subarray(at, scan));
      at = scan;
    }
  }
  throw bad('truncated');
}

function join(parts: Uint8Array[], sawFrame: boolean, sawScan: boolean): Uint8Array {
  if (!sawFrame || !sawScan) throw bad('truncated');
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

/** Checks and cleans an uploaded logo; returns the data URL to store. */
export function cleanLogo(value: unknown): string {
  if (typeof value !== 'string') throw bad('type');
  const match = value.match(/^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw bad('type');
  // Base64 length tells the size before anything is decoded.
  if (match[2].length * 0.75 > MAX_LOGO_BYTES + 3) throw new CompanyError('logo_too_large', 'The logo is too large. Use an image under 100 KB.', 413, { field: 'logo', max_kb: 100 });
  const bytes = decode(match[2]);
  const clean = match[1] === 'png' ? cleanPng(bytes) : cleanJpeg(bytes);
  return `data:image/${match[1] === 'png' ? 'png' : 'jpeg'};base64,${encode(clean)}`;
}
