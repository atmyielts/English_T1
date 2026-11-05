import type { Locale } from '../../types.ts';

// Authored text in the three languages, and the tiny template filler the server
// uses for messages ("{streak}-day streak"). The app has its own catalogs; this is
// only for content the function sends (journeys, messages, certificates).

export type L = Record<Locale, string>;
export const pick = (text: L, locale: Locale) => text[locale] || text.en;
export function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{([a-z_]+)\}/g, (match, name: string) => (Object.hasOwn(params, name) ? String(params[name]) : match));
}
