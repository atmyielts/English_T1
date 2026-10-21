import {format,type Params} from '../../../service-i18n/src/format.ts';
import {en} from './en.ts';
import type {WebKey} from './catalog.ts';
/** A translator for shared keys. App translators (app keys plus shared keys) are assignable. */
export type Translate = (key: WebKey, params?: Params) => string;
const englishOnly = {en, uz: en, ru: en};
/** English rendering for pure modules, tests and callers that do not pass `t`. */
export const english: Translate = (key, params) => format(englishOnly, 'en', key, params);
export const isWebKey = (key: string): key is WebKey => Object.hasOwn(en, key);
/** Thrown by shared modules: `message` stays the exact English text (tests and
 * journeys rely on it) while the UI can render `key` in the reader's language. */
export class LocalizedError extends Error {
  /** `terms` are parameters that are themselves shared keys (e.g. a request kind). */
  constructor(public readonly key: WebKey, public readonly params: Params = {}, public readonly terms: Partial<Record<string, WebKey>> = {}) {
    super(english(key, withTerms(params, terms, english)));
  }
  render(t: Translate): string {
    return t(this.key, withTerms(this.params, this.terms, t));
  }
}
function withTerms(params: Params, terms: Partial<Record<string, WebKey>>, t: Translate): Params {
  const out: Params = {...params};
  for (const [name, key] of Object.entries(terms)) if (key) out[name] = t(key);
  return out;
}
let reverse: Map<string, WebKey> | null = null;
/** Text that already left its error object (status fields, saved problems) is
 * translated when it is exactly a parameter-free shared English message. */
export function localizeText(text: string, t: Translate): string {
  reverse ??= new Map(Object.entries(en).filter(([, value]) => !value.includes('{')).map(([key, value]) => [value, key as WebKey]));
  const key = reverse.get(text);
  return key ? t(key) : text;
}
/** A caught cause as reader-language text, keeping unknown server explanations. */
export function messageText(cause: unknown, t: Translate, fallback: WebKey): string {
  if (cause instanceof LocalizedError) return cause.render(t);
  if (cause instanceof Error && cause.message) return localizeText(cause.message, t);
  return t(fallback);
}
