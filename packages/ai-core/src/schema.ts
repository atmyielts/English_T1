// A small schema builder for model output and request bodies. Each schema parses
// unknown input into a typed value (throwing SchemaError with the path that failed)
// and describes itself as JSON Schema for providers that accept strict output.
// Free models wrap JSON in prose and drift from shapes, so every model answer
// that feeds the product goes through one of these.

export type JsonSchema = Record<string, unknown>;
export interface Schema<T> {
  parse(value: unknown, path?: string): T;
  json: JsonSchema;
  optional?: boolean;
}
export type Infer<S> = S extends Schema<infer T> ? T : never;

export class SchemaError extends Error {
  constructor(public path: string, public problem: string) {
    super(`${path || 'value'}: ${problem}`);
  }
}

const fail = (path: string, problem: string): never => { throw new SchemaError(path, problem); };

export function string(options: { min?: number; max?: number; pattern?: RegExp; trim?: boolean } = {}): Schema<string> {
  const { min = 0, max = 10_000, pattern, trim = true } = options;
  return {
    parse(value, path = '') {
      if (typeof value !== 'string') return fail(path, 'expected text');
      const text = trim ? value.trim() : value;
      if (text.length < min) return fail(path, `at least ${min} characters`);
      if (text.length > max) return fail(path, `at most ${max} characters`);
      if (pattern && !pattern.test(text)) return fail(path, 'wrong format');
      return text;
    },
    json: { type: 'string', ...(min ? { minLength: min } : {}), maxLength: max },
  };
}

export function number(options: { min?: number; max?: number; integer?: boolean } = {}): Schema<number> {
  const { min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, integer = false } = options;
  return {
    parse(value, path = '') {
      // Models often send numbers as strings ("7.5").
      const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
      if (typeof n !== 'number' || !Number.isFinite(n)) return fail(path, 'expected a number');
      if (integer && !Number.isInteger(n)) return fail(path, 'expected a whole number');
      if (n < min || n > max) return fail(path, `expected ${min} to ${max}`);
      return n;
    },
    json: { type: integer ? 'integer' : 'number', minimum: min, maximum: max },
  };
}

export function boolean(): Schema<boolean> {
  return {
    parse(value, path = '') {
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 'false') return value === 'true';
      return fail(path, 'expected true or false');
    },
    json: { type: 'boolean' },
  };
}

export function enumOf<const T extends readonly string[]>(values: T): Schema<T[number]> {
  return {
    parse(value, path = '') {
      if (typeof value !== 'string' || !values.includes(value)) return fail(path, `expected one of ${values.join(', ')}`);
      return value as T[number];
    },
    json: { type: 'string', enum: [...values] },
  };
}

export function array<T>(item: Schema<T>, options: { min?: number; max?: number } = {}): Schema<T[]> {
  const { min = 0, max = 200 } = options;
  return {
    parse(value, path = '') {
      if (!Array.isArray(value)) return fail(path, 'expected a list');
      if (value.length < min) return fail(path, `at least ${min} items`);
      if (value.length > max) return fail(path, `at most ${max} items`);
      return value.map((entry, index) => item.parse(entry, `${path}[${index}]`));
    },
    json: { type: 'array', items: item.json, ...(min ? { minItems: min } : {}), maxItems: max },
  };
}

export function optional<T>(inner: Schema<T>): Schema<T | undefined> {
  return { parse: (value, path) => (value === undefined || value === null ? undefined : inner.parse(value, path)), json: inner.json, optional: true };
}

export function nullable<T>(inner: Schema<T>): Schema<T | null> {
  return { parse: (value, path) => (value === null || value === undefined ? null : inner.parse(value, path)), json: { anyOf: [inner.json, { type: 'null' }] } };
}

type Shape = Record<string, Schema<unknown>>;
type ObjectOf<S extends Shape> = { [K in keyof S as S[K] extends { optional: true } ? never : K]: Infer<S[K]> } & { [K in keyof S as S[K] extends { optional: true } ? K : never]?: Infer<S[K]> };

/** Unknown keys are dropped, never passed through. */
export function object<S extends Shape>(shape: S): Schema<ObjectOf<S>> {
  return {
    parse(value, path = '') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(path, 'expected an object');
      const input = value as Record<string, unknown>, out: Record<string, unknown> = {};
      for (const [key, schema] of Object.entries(shape)) {
        const parsed = schema.parse(input[key], path ? `${path}.${key}` : key);
        if (parsed !== undefined) out[key] = parsed;
      }
      return out as ObjectOf<S>;
    },
    json: {
      type: 'object',
      properties: Object.fromEntries(Object.entries(shape).map(([key, schema]) => [key, schema.json])),
      required: Object.entries(shape).filter(([, schema]) => !schema.optional).map(([key]) => key),
      additionalProperties: false,
    },
  };
}
