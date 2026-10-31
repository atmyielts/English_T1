// L18 gift codes. A code is derived from the function's system secret and the gift id
// (HMAC-SHA256), so it is never stored: the table keeps only SHA-256 of the code, set
// once. The buyer can see their code again; anyone with the code can redeem it once.
// 16 characters from a 32-letter alphabet without look-alikes (0/O, 1/I) is 80 bits,
// shown as XXXX-XXXX-XXXX-XXXX. If the system secret were ever rotated, the derived code
// would no longer match the stored hash; the buyer then sees "ask support" (codeFor
// returns null) instead of a code that would not work.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/** XXXX-XXXX-XXXX-XXXX from any spacing or case; null when it cannot be a gift code. */
export function normaliseCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const plain = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (plain.length !== 16 || [...plain].some((char) => !ALPHABET.includes(char))) return null;
  return plain.match(/.{4}/g)!.join('-');
}

export async function deriveCode(secret: string, giftId: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`schood-ai-gift:v1:${giftId}`)));
  const chars = [...bytes.slice(0, 16)].map((byte) => ALPHABET[byte & 31]).join('');
  return chars.match(/.{4}/g)!.join('-');
}

/** SHA-256 of the normalised code, as the table stores it. */
export async function codeHash(code: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(`schood-ai-gift:${code}`)));
}
