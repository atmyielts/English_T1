// Small helpers every area uses: input reading, tokens, hashing, Tashkent dates.
import { CompanyError, UUID } from './types.ts';

export function obj(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CompanyError('invalid_body', 'Send a JSON object.', 400);
  return body as Record<string, unknown>;
}

export function text(value: unknown, field: string, { min = 0, max = 200, optional = false } = {}): string | null {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '' && optional)) {
    if (optional) return null;
    throw new CompanyError('invalid_field', `${field} is required.`, 400, { field });
  }
  if (typeof value !== 'string') throw new CompanyError('invalid_field', `${field} must be text.`, 400, { field });
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) throw new CompanyError('invalid_field', `${field} must be ${min}–${max} characters.`, 400, { field, min, max });
  return trimmed;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string, fallback?: T): T {
  if ((value === undefined || value === null) && fallback !== undefined) return fallback;
  if (!(allowed as readonly string[]).includes(String(value))) throw new CompanyError('invalid_field', `${field} is not one of the allowed values.`, 400, { field, allowed });
  return value as T;
}

export function int(value: unknown, field: string, { min = 0, max = 1_000_000, optional = false } = {}): number | null {
  if ((value === undefined || value === null) && optional) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new CompanyError('invalid_field', `${field} must be a whole number from ${min} to ${max}.`, 400, { field, min, max });
  return number;
}

export function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new CompanyError('invalid_field', `${field} must be an id.`, 400, { field });
  return value;
}

export const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export function email(value: unknown, field = 'email', optional = false): string | null {
  const raw = text(value, field, { max: 200, optional });
  if (raw === null) return null;
  const lower = raw.toLowerCase();
  if (!EMAIL.test(lower)) throw new CompanyError('invalid_field', `${field} is not an email address.`, 400, { field });
  return lower;
}

/** A random URL-safe token (default 24 bytes → 32 characters). */
export function token(bytes = 24): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/** A short code people can read out (certificates): 10 characters, no look-alikes. */
export function readableCode(length = 10): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const data = crypto.getRandomValues(new Uint8Array(length));
  return [...data].map((byte) => alphabet[byte % alphabet.length]).join('');
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Calendar day in Tashkent (UTC+5, no daylight saving). */
export function tashkentDay(date: Date): string {
  return new Date(date.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
}
