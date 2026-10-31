import ielts from '../ielts/index.ts';
import maths from '../maths/index.ts';
import speaking from '../speaking/index.ts';
import { localizeSource } from './localize.ts';
import type { CoachPack, Locale, PackSource } from './types.ts';
import { buildPack, indexPack } from './validate.ts';

// Every coach pack the engine serves. Adding a coach is one folder under
// packages/coach-packs/<id>/ and one line here, plus its bot token (README.md).
export const PACK_SOURCES: readonly PackSource[] = [ielts, speaking, maths];

let loaded: ReadonlyMap<string, CoachPack> | null = null;
/** Validated packs by id. Throws PackError on the first invalid pack, so a bad pack never serves. */
export function loadPacks(): ReadonlyMap<string, CoachPack> {
  if (loaded) return loaded;
  const packs = new Map<string, CoachPack>();
  const features = new Set<string>();
  for (const source of PACK_SOURCES) {
    const pack = buildPack(source);
    if (packs.has(pack.manifest.id)) throw new Error(`Two coach packs use the id ${pack.manifest.id}`);
    if (features.has(pack.manifest.feature)) throw new Error(`Two coach packs sell feature ${pack.manifest.feature}`);
    packs.set(pack.manifest.id, pack);
    features.add(pack.manifest.feature);
  }
  loaded = packs;
  return packs;
}

let indexed: ReadonlyMap<string, CoachPack> | null = null;
/**
 * The same packs indexed without validation, for the Telegram worker (a free-plan
 * Worker has about 10 ms of CPU per request; validating both packs takes longer).
 * CI validates every pack (packages/coach-packs/test), and the function serving
 * the engine uses loadPacks(), so an invalid pack still never serves.
 */
export function ciValidatedPacks(): ReadonlyMap<string, CoachPack> {
  if (indexed) return indexed;
  indexed = new Map(PACK_SOURCES.map((source) => [source.manifest.id, indexPack(source)]));
  return indexed;
}

const localized = new WeakMap<CoachPack, Map<Locale, CoachPack>>();
/**
 * A loaded pack with its practice text in one language (mixed packs: B3–B6). The
 * language is the learner's interface language, or the pack's first one when it does
 * not offer theirs. Other packs come back unchanged. Built once per pack and language;
 * every language's version was validated with the pack.
 */
export function packFor(pack: CoachPack, locale: Locale): CoachPack {
  if (pack.manifest.practiceLanguage !== 'mixed') return pack;
  const languages = pack.manifest.uiLanguages;
  const chosen = languages.includes(locale) ? locale : languages[0];
  if (chosen === (pack.manifest.contentLanguage ?? 'en')) return pack;
  let byLocale = localized.get(pack);
  if (!byLocale) { byLocale = new Map(); localized.set(pack, byLocale); }
  let out = byLocale.get(chosen);
  if (!out) { out = indexPack(localizeSource(pack, chosen)); byLocale.set(chosen, out); }
  return out;
}
