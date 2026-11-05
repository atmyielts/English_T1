import { SchoodAIError } from './types.ts';

// Request validation. Every value from a browser or the worker passes through one of
// these before it reaches the repository or a prompt; failures are 400 with the field.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bad = (field: string, problem: string): never => { throw new SchoodAIError('invalid_request', `${field} ${problem}.`, 400, { field }); };

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

export function record(value: unknown, field = 'body'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return bad(field, 'must be a JSON object');
  return value as Record<string, unknown>;
}
export function uuid(value: unknown, field: string): string {
  if (!isUuid(value)) return bad(field, 'must be an id');
  return value.toLowerCase();
}
export const optionalUuid = (value: unknown, field: string): string | null => (value === undefined || value === null || value === '' ? null : uuid(value, field));

export function text(value: unknown, field: string, options: { min?: number; max: number; trim?: boolean }): string {
  if (typeof value !== 'string') return bad(field, 'must be text');
  const out = options.trim === false ? value : value.trim();
  if (out.length < (options.min ?? 1)) return bad(field, `must have at least ${options.min ?? 1} characters`);
  if (out.length > options.max) return bad(field, `must have at most ${options.max} characters`);
  return out;
}
export const optionalText = (value: unknown, field: string, options: { max: number }): string | null =>
  value === undefined || value === null || value === '' ? null : text(value, field, { ...options, min: 1 });

export function integer(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) return bad(field, `must be a whole number from ${min} to ${max}`);
  return value;
}
export function oneOf<const T extends readonly string[]>(value: unknown, field: string, values: T): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) return bad(field, `must be one of ${values.join(', ')}`);
  return value as T[number];
}
export function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') return bad(field, 'must be true or false');
  return value;
}
/** A JSON object no larger than `maxBytes` once serialised. */
export function jsonObject(value: unknown, field: string, maxBytes: number): Record<string, unknown> {
  const object = record(value, field);
  if (JSON.stringify(object).length > maxBytes) return bad(field, `must be smaller than ${maxBytes} bytes`);
  return object;
}
export function stringList(value: unknown, field: string, options: { max: number; pattern: RegExp }): string[] {
  if (!Array.isArray(value) || value.length > options.max) return bad(field, `must be a list of at most ${options.max}`);
  return [...new Set(value.map((entry) => {
    if (typeof entry !== 'string' || !options.pattern.test(entry)) return bad(field, 'has an invalid entry');
    return entry;
  }))];
}
