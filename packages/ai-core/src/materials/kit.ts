import { SchemaError, type JsonSchema, type Schema } from '../schema.ts';

// Schema helpers the materials model needs on top of `../schema.ts`: a tagged
// union, lenient text that accepts numbers, and lists that accept a single value.
// Model output drifts (numbers as strings, a lone string where a list belongs),
// so the lenient forms are used only when reading model drafts; the canonical
// material schema is strict.

const fail = (path: string, problem: string): never => { throw new SchemaError(path, problem); };

/** A union picked by a string tag (`type`); unknown tags fail with the allowed list. */
export function tagged<T>(tag: string, variants: Record<string, Schema<T>>): Schema<T> {
  const names = Object.keys(variants);
  return {
    parse(value, path = '') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(path, 'expected an object');
      const kind = (value as Record<string, unknown>)[tag];
      if (typeof kind !== 'string' || !Object.hasOwn(variants, kind)) return fail(path ? `${path}.${tag}` : tag, `expected one of ${names.join(', ')}`);
      return variants[kind].parse(value, path);
    },
    json: { anyOf: names.map((name) => variants[name].json) },
  };
}

/** A fixed string value, for union tags. */
export function literal<const T extends string>(value: T): Schema<T> {
  return {
    parse(input, path = '') {
      if (input !== value) return fail(path, `expected ${value}`);
      return value;
    },
    json: { type: 'string', enum: [value] },
  };
}

/** Text, accepting numbers and booleans as their string form (model drafts). */
export function looseText(options: { min?: number; max?: number } = {}): Schema<string> {
  const { min = 0, max = 10_000 } = options;
  return {
    parse(value, path = '') {
      const raw = typeof value === 'number' || typeof value === 'boolean' ? String(value) : value;
      if (typeof raw !== 'string') return fail(path, 'expected text');
      const text = raw.trim();
      if (text.length < min) return fail(path, `at least ${min} characters`);
      if (text.length > max) return fail(path, `at most ${max} characters`);
      return text;
    },
    json: { type: 'string', ...(min ? { minLength: min } : {}), maxLength: max },
  };
}

/** A list that also accepts one bare value (a model writing `"B"` for `["B"]`). */
export function listOf<T>(item: Schema<T>, options: { min?: number; max?: number } = {}): Schema<T[]> {
  const { min = 0, max = 200 } = options;
  return {
    parse(value, path = '') {
      const list = value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
      if (list.length < min) return fail(path, `at least ${min} items`);
      if (list.length > max) return fail(path, `at most ${max} items`);
      return list.map((entry, index) => item.parse(entry, `${path}[${index}]`));
    },
    json: { type: 'array', items: item.json, ...(min ? { minItems: min } : {}), maxItems: max },
  };
}

/** Wraps a schema so a value that fails becomes `fallback` instead (optional extras in drafts). */
export function orElse<T>(inner: Schema<T>, fallback: T): Schema<T> {
  return {
    parse(value, path) {
      try { return inner.parse(value, path); } catch { return fallback; }
    },
    json: inner.json,
    optional: true,
  };
}

/** A schema with a custom JSON description, for the strict-output providers. */
export function described<T>(inner: Schema<T>, json: JsonSchema): Schema<T> {
  return { ...inner, json: { ...inner.json, ...json } };
}
