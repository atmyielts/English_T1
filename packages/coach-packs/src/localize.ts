import { LOCALES, type Activity, type DiagnosticItem, type Locale, type PackSource, type Sample } from './types.ts';

// Practice text in several languages, for `mixed` packs (B3 in Uzbek and Russian;
// B4, B5 and B6 in Uzbek, Russian and English). A pack file writes each practice string
// once with `T({ uz, ru, en })`; `definePack` splits it into the plain string in the
// pack's content language plus an `i18n` overlay per other language on the activity,
// placement item or sample. The engine reads a pack through `localizeSource` (via
// `packFor` in registry.ts) for the learner's language, so every flow keeps reading
// plain strings, and the validator checks every language's version like the base.

const TAG = '$practice';
type Tagged = { [TAG]: Partial<Record<Locale, string>> };

/**
 * One practice string in several languages. Only for pack files of mixed packs, and
 * only inside data passed to `definePack`, which turns it into a plain string.
 */
export const T = (texts: Partial<Record<Locale, string>>): string => ({ [TAG]: texts }) as unknown as string;

const isTagged = (value: unknown): value is Tagged => !!value && typeof value === 'object' && !Array.isArray(value) && TAG in (value as object);

function setPath(root: Record<string, unknown>, path: (string | number)[], value: string) {
  let at: Record<string | number, unknown> = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    at[key] ??= typeof path[i + 1] === 'number' ? [] : {};
    at = at[key] as Record<string | number, unknown>;
  }
  at[path.at(-1)!] = value;
}

/** Splits tagged practice text in one item: the base-language strings, and the other languages as `i18n`. */
export function splitPractice<T extends object>(value: T, base: Locale, field: 'i18n' = 'i18n'): T {
  const overlays: Record<string, Record<string, unknown>> = {};
  const walk = (node: unknown, path: (string | number)[]): unknown => {
    if (isTagged(node)) {
      for (const [locale, text] of Object.entries(node[TAG])) {
        if (locale === base || typeof text !== 'string') continue;
        overlays[locale] ??= {};
        setPath(overlays[locale], path, text);
      }
      // A missing base text becomes '' so the validator reports it.
      return node[TAG][base] ?? '';
    }
    if (Array.isArray(node)) return node.map((child, index) => walk(child, [...path, index]));
    if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, walk(child, [...path, key])]));
    return node;
  };
  const out = walk(value, []) as T & { i18n?: Record<string, unknown> };
  if (!Object.keys(overlays).length) return out;
  return { ...out, [field]: { ...(out.i18n ?? {}), ...overlays } };
}

/** Splits every tagged string of a mixed pack (activities, placement items, samples). Other packs pass through. */
export function splitPack(source: PackSource): PackSource {
  if (source.manifest?.practiceLanguage !== 'mixed') return source;
  const base = source.manifest.contentLanguage ?? 'en';
  return {
    ...source,
    activities: source.activities.map((activity) => splitPractice(activity, base)),
    diagnostic: { ...source.diagnostic, items: source.diagnostic.items.map((item) => splitPractice(item, base)) },
    samples: source.samples.map((sample) => splitPractice(sample, base)),
  };
}

/**
 * An overlay on a base value: strings replace strings at the same path; objects merge
 * by key and arrays by index; anything else (numbers, answers, ids) never changes, so
 * every language keeps the same answers and option order.
 */
export function overlay<T>(base: T, layer: unknown): T {
  if (layer === undefined || layer === null) return base;
  if (typeof base === 'string') return (typeof layer === 'string' ? layer : base) as T;
  if (Array.isArray(base)) return (Array.isArray(layer) ? base.map((item, index) => overlay(item, layer[index])) : base) as T;
  if (base && typeof base === 'object' && typeof layer === 'object' && !Array.isArray(layer)) {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(layer as Record<string, unknown>)) if (key in out) out[key] = overlay(out[key], value);
    return out as T;
  }
  return base;
}

/** An activity in one language, without its overlays. */
export function localizeActivity<A extends Activity>(activity: A, locale: Locale): A {
  if (!activity.i18n) return activity;
  const { i18n, ...rest } = activity;
  return overlay(rest as A, i18n[locale]);
}
export function localizeItem(item: DiagnosticItem, locale: Locale): DiagnosticItem {
  if (!item.i18n) return item;
  const { i18n, ...rest } = item;
  return overlay(rest as DiagnosticItem, i18n[locale]);
}
export function localizeSample(sample: Sample, locale: Locale): Sample {
  if (!sample.i18n) return sample;
  const { i18n, ...rest } = sample;
  return { ...rest, body: overlay(rest.body, (i18n[locale] as { body?: unknown } | undefined)?.body) } as Sample;
}

/** A pack's source with its practice text in one language. Packs that are not mixed come back unchanged. */
export function localizeSource(source: PackSource, locale: Locale): PackSource {
  if (source.manifest.practiceLanguage !== 'mixed') return source;
  return {
    ...source,
    activities: source.activities.map((activity) => localizeActivity(activity, locale)),
    diagnostic: { ...source.diagnostic, items: source.diagnostic.items.map((item) => localizeItem(item, locale)) },
    samples: source.samples.map((sample) => localizeSample(sample, locale)),
  };
}

/** Problems in a mixed pack's overlays: languages, paths that do not exist, text left unsplit. */
export function overlayProblems(source: PackSource): string[] {
  const problems: string[] = [];
  const m = source.manifest;
  const languages = m.uiLanguages ?? [];
  const base = m.contentLanguage ?? 'en';
  const mixed = m.practiceLanguage === 'mixed';
  if (m.contentLanguage !== undefined && !(LOCALES as readonly string[]).includes(m.contentLanguage)) problems.push('manifest.contentLanguage: must be en, uz or ru');
  if (mixed && !languages.includes(base)) problems.push(`manifest.contentLanguage: ${base} is not one of the interface languages`);
  const others = languages.filter((locale) => locale !== base);
  // Leaf paths of an overlay; each must land on a string in the base.
  const leaves = (layer: unknown, at: unknown, path: string, out: string[]) => {
    if (typeof layer === 'string') { if (typeof at !== 'string') problems.push(`${path}: no text here in the base`); else out.push(path); return; }
    if (Array.isArray(layer)) {
      if (!Array.isArray(at) || layer.length > at.length) { problems.push(`${path}: does not match the base`); return; }
      layer.forEach((child, index) => { if (child !== undefined && child !== null) leaves(child, at[index], `${path}[${index}]`, out); });
      return;
    }
    if (layer && typeof layer === 'object') {
      if (!at || typeof at !== 'object') { problems.push(`${path}: does not match the base`); return; }
      for (const [key, child] of Object.entries(layer)) leaves(child, (at as Record<string, unknown>)[key], `${path}.${key}`, out);
    }
  };
  const check = (path: string, value: { i18n?: Partial<Record<Locale, unknown>> }, baseValue: unknown) => {
    const i18n = value.i18n;
    if (!i18n) return;
    if (!mixed) { problems.push(`${path}.i18n: only mixed packs have overlays`); return; }
    const found = Object.keys(i18n);
    for (const locale of found) if (!others.includes(locale as Locale)) problems.push(`${path}.i18n: ${locale} is not another interface language`);
    const shapes = new Map<string, string>();
    for (const locale of others) {
      if (!i18n[locale]) { problems.push(`${path}.i18n: missing ${locale}`); continue; }
      const out: string[] = [];
      leaves(i18n[locale], baseValue, `${path}.i18n.${locale}`, out);
      shapes.set(locale, out.map((leaf) => leaf.slice(`${path}.i18n.${locale}`.length)).sort().join('|'));
    }
    if (new Set(shapes.values()).size > 1) problems.push(`${path}.i18n: the languages translate different strings (${[...shapes.keys()].join(', ')})`);
  };
  for (const activity of source.activities ?? []) check(`activities.${activity.id}`, activity, activity);
  for (const item of source.diagnostic?.items ?? []) check(`diagnostic.${item.id}`, item, item);
  for (const sample of source.samples ?? []) check(`samples.${sample.id}`, sample, sample);
  // Tagged text that never went through definePack would reach a learner as an object.
  const unsplit = (node: unknown, path: string): void => {
    if (isTagged(node)) { problems.push(`${path}: practice text was not split (pass the pack through definePack)`); return; }
    if (Array.isArray(node)) node.forEach((child, index) => unsplit(child, `${path}[${index}]`));
    else if (node && typeof node === 'object') for (const [key, child] of Object.entries(node)) unsplit(child, `${path}.${key}`);
  };
  unsplit(source.activities, 'activities');
  unsplit(source.diagnostic, 'diagnostic');
  unsplit(source.samples, 'samples');
  return problems;
}
