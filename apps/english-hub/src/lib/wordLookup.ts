import { edge } from './api';
import { saveWords } from './notebook';

export type WordGloss = {
  /** The word as looked up (lower case). */
  word: string;
  /** The dictionary form the meaning describes ("run" for "ran"). */
  headword: string;
  part_of_speech: string | null;
  definition: string;
  example: string | null;
  ru: string | null;
  uz: string | null;
  source: 'cache' | 'deck' | 'lexicon' | 'ai';
  /** True when a translation is missing (the meaning came from our own content only). */
  partial: boolean;
  notice: 'limit' | 'unavailable' | null;
  saved: boolean;
};

export type TapSource = { type: string; label?: string | null; ref?: string | null };

// One request per word per page load; failed lookups are forgotten so they can be retried.
const lookups = new Map<string, Promise<WordGloss>>();
const savedHere = new Set<string>();

const withSaved = (gloss: WordGloss): WordGloss =>
  gloss.saved || (!savedHere.has(gloss.headword) && !savedHere.has(gloss.word)) ? gloss : { ...gloss, saved: true };

export const lookupWord = (word: string, context: string): Promise<WordGloss> => {
  let request = lookups.get(word);
  if (!request) {
    request = edge<{ ok: boolean; gloss: WordGloss }>('hub', '/word', {
      query: { language_code: 'en', w: word, context: context || null },
    }).then((response) => response.gloss);
    lookups.set(word, request);
    request.catch(() => lookups.delete(word));
  }
  return request.then(withSaved);
};

/** Adds the word to My words, then remembers it as saved for this page load. */
export const saveGloss = async (gloss: WordGloss, context: string, source: TapSource): Promise<WordGloss> => {
  await saveWords([{
    word: gloss.headword,
    part_of_speech: gloss.part_of_speech,
    definition: gloss.definition,
    example: gloss.example,
    context_text: context || null,
    source_type: source.type,
    source_label: source.label ?? null,
    source_ref: source.ref ?? null,
    metadata: { translation_ru: gloss.ru, translation_uz: gloss.uz, saved_from: 'tap-to-translate' },
  }]);
  savedHere.add(gloss.headword);
  savedHere.add(gloss.word);
  return { ...gloss, saved: true };
};
