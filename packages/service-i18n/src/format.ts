/** Uzbek, Russian and English for the separate Schood services. Same codes and
 * storage key as the mother platform; no account, API or routing coupling. */
export const SUPPORTED_LOCALES = ['en', 'uz', 'ru'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const LOCALE_NAMES: Record<Locale, string> = {en: 'English', uz: 'O‘zbekcha', ru: 'Русский'};
export const STORAGE_KEY = 'schood.locale';
export const INTL: Record<Locale, string> = {en: 'en-GB', uz: 'uz-Latn-UZ', ru: 'ru-RU'};

/** A catalog maps message keys to text. `{name}` placeholders are filled from
 * params; `{count|one|other}` style plural forms use Intl.PluralRules keys. */
export type Catalog = Record<string, string>;
export type Catalogs<K extends string> = {en: Record<K, string>; uz: Record<K, string>; ru: Record<K, string>};
export type Params = Record<string, string | number>;

export function normalizeLocale(value: string | null | undefined): Locale | null {
  const code = value?.trim().toLowerCase().split(/[-_]/)[0];
  return code && (SUPPORTED_LOCALES as readonly string[]).includes(code) ? (code as Locale) : null;
}
/** Pure formatter used by the hook and by tests. Missing keys fall back to
 * English and then to the key itself, never to an empty string. */
export function format(catalogs: Catalogs<string>, locale: Locale, key: string, params: Params = {}): string {
  const template = catalogs[locale][key] || catalogs.en[key] || key;
  const plural = new Intl.PluralRules(INTL[locale]);
  return template.replace(/\{(\w+)(?:\|([^{}]*))?\}/g, (_match, name: string, forms?: string) => {
    const value = params[name];
    if (forms === undefined) return value === undefined ? `{${name}}` : typeof value === 'number' ? new Intl.NumberFormat(INTL[locale]).format(value) : String(value);
    const choices = Object.fromEntries(forms.split('|').map(part => { const at = part.indexOf(':'); return [part.slice(0, at), part.slice(at + 1)]; }));
    const count = Number(value ?? 0), chosen = choices[plural.select(count)] ?? choices.other ?? '';
    return chosen.replace('#', new Intl.NumberFormat(INTL[locale]).format(count));
  });
}
