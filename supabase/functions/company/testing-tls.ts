// Test-only: a throwaway self-signed certificate made with WebCrypto, so the webhook
// sender can be tried against a real local TLS server with no key file in the repo
// and no npm package. ECDSA P-256 with SHA-256; one DNS name in subjectAltName.

const bytes = (...parts: (Uint8Array | number[])[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
};
const length = (n: number) => n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 255];
const der = (tag: number, ...content: (Uint8Array | number[])[]) => { const body = bytes(...content); return bytes([tag], length(body.length), body); };
const seq = (...content: Uint8Array[]) => der(0x30, ...content);
const oid = (dotted: string) => {
  const [a, b, ...rest] = dotted.split('.').map(Number);
  const out = [a * 40 + b];
  for (const value of rest) {
    const chunk = [value & 127];
    for (let v = value >> 7; v > 0; v >>= 7) chunk.unshift((v & 127) | 128);
    out.push(...chunk);
  }
  return der(0x06, out);
};
const integer = (raw: Uint8Array) => {
  let start = 0;
  while (start < raw.length - 1 && raw[start] === 0) start++;
  const trimmed = raw.subarray(start);
  return der(0x02, trimmed[0] & 128 ? [0] : [], trimmed);
};
const utf8 = (value: string) => der(0x0c, new TextEncoder().encode(value));
const time = (at: Date) => der(0x17, new TextEncoder().encode(at.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z'));
const pem = (label: string, data: Uint8Array) => `-----BEGIN ${label}-----\n${btoa(String.fromCharCode(...data)).match(/.{1,64}/g)!.join('\n')}\n-----END ${label}-----\n`;

/** A certificate for `name`, valid for a day either side of now, and its PKCS#8 key. */
export async function selfSignedCert(name: string): Promise<{ cert: string; key: string }> {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey));
  const algorithm = seq(oid('1.2.840.10045.4.3.2'));
  const subject = seq(der(0x31, seq(oid('2.5.4.3'), utf8(name))));
  const altNames = seq(oid('2.5.29.17'), der(0x04, seq(der(0x82, new TextEncoder().encode(name)))));
  const serial = crypto.getRandomValues(new Uint8Array(12));
  serial[0] &= 0x7f;
  const tbs = seq(
    der(0xa0, der(0x02, [2])), integer(serial), algorithm, subject,
    seq(time(new Date(Date.now() - 86_400_000)), time(new Date(Date.now() + 86_400_000))), subject, spki,
    der(0xa3, seq(altNames)),
  );
  const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, tbs));
  const signature = seq(integer(raw.subarray(0, 32)), integer(raw.subarray(32)));
  const cert = seq(tbs, algorithm, der(0x03, [0], signature));
  return { cert: pem('CERTIFICATE', cert), key: pem('PRIVATE KEY', new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey))) };
}
