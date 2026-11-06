// The situation phrasebook: lookups, search and the shape the app receives.
import { isLevel, levelIndex } from '../../../../../packages/company-core/src/mod.ts';
import { complaint, apology, delay } from './trouble.ts';
import { handover, invoice, negotiation } from './business.ts';
import { meeting, phone, smallTalk } from './calls.ts';
import { email, presentation } from './written.ts';
import { DIALOGUES, type Dialogue } from './dialogues.ts';
import type { Localized, PhraseLevel, PhraseTone, SituationData } from './types.ts';

export interface Phrase { id: string; situation: string; en: string; ru: string; uz: string; level: PhraseLevel; tone: PhraseTone }
export interface Situation { code: string; title: Localized; lead: Localized; phrases: Phrase[]; dialogue: Dialogue | null }

const DATA: SituationData[] = [phone, meeting, complaint, invoice, smallTalk, delay, apology, negotiation, handover, email, presentation];

export const SITUATIONS: Situation[] = DATA.map((situation) => ({
  code: situation.code, title: situation.title, lead: situation.lead, dialogue: DIALOGUES.find((entry) => entry.situation === situation.code) ?? null,
  phrases: situation.entries.map(([en, ru, uz, level, tone], index) => ({
    id: `${situation.code}-${String(index + 1).padStart(2, '0')}`, situation: situation.code, en, ru, uz, level, tone: tone ?? 'neutral',
  })),
}));
export const SITUATION_CODES = SITUATIONS.map((situation) => situation.code);
export const ALL_PHRASES: Phrase[] = SITUATIONS.flatMap((situation) => situation.phrases);
const byId = new Map(ALL_PHRASES.map((phrase) => [phrase.id, phrase]));
export const findPhrase = (id: string): Phrase | undefined => byId.get(id);
export const findSituation = (code: string): Situation | undefined => SITUATIONS.find((situation) => situation.code === code);

/** Bumped when the content changes, so the app can replace its offline copy. */
export const PHRASEBOOK_VERSION = `${ALL_PHRASES.length}-1`;

/** A situation's phrases that suit a level: up to one step above it, easiest first. Someone with no level yet starts at A2. */
export function phrasesFor(situation: string, level: string | null): Phrase[] {
  const found = findSituation(situation);
  if (!found) return [];
  const ceiling = isLevel(level) ? Math.max(levelIndex('a2'), levelIndex(level) + 1) : levelIndex('a2');
  const rank = (phrase: Phrase) => levelIndex(phrase.level);
  return found.phrases.filter((phrase) => rank(phrase) <= ceiling).sort((a, b) => rank(a) - rank(b));
}

const tokens = (value: string) => value.toLowerCase().replaceAll('ё', 'е').replace(/[‘’ʼ'`]/g, '').split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 3);
/** Loose enough for Russian and Uzbek word endings: compares the start of each word. */
const stem = (word: string) => word.length > 6 ? word.slice(0, word.length - 3) : word.length > 4 ? word.slice(0, word.length - 1) : word;
/** Words that say nothing about the situation, in the three languages. */
const COMMON = new Set([
  'the', 'and', 'you', 'can', 'could', 'would', 'please', 'how', 'what', 'when', 'this', 'that', 'with', 'for', 'our', 'your', 'have', 'will', 'need', 'want', 'say', 'tell',
  'когда', 'что', 'как', 'это', 'для', 'или', 'если', 'пожалуйста', 'подскажите', 'скажите', 'сможете', 'можете', 'могу', 'нужно', 'хочу', 'надо', 'наш', 'ваш', 'вам', 'вас', 'нам', 'нас', 'так', 'чтобы',
  'uchun', 'qachon', 'qanday', 'iltimos', 'kerak', 'mumkin', 'men', 'siz', 'biz', 'bilan', 'nima', 'ayting', 'aytib',
]);

/** Phrases that share words with what was typed, in any of the three languages, best first. */
export function searchPhrases(query: string, situation: string | null, limit = 3): Phrase[] {
  const wanted = [...new Set(tokens(query).filter((word) => !COMMON.has(word)).map(stem))];
  if (!wanted.length) return [];
  const scored: { phrase: Phrase; score: number }[] = [];
  for (const phrase of ALL_PHRASES) {
    if (situation && phrase.situation !== situation) continue;
    const have = tokens(`${phrase.en} ${phrase.ru} ${phrase.uz}`);
    const score = wanted.filter((word) => have.some((candidate) => candidate.startsWith(word))).length;
    if (score) scored.push({ phrase, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.phrase.id.localeCompare(b.phrase.id)).slice(0, limit).map((entry) => entry.phrase);
}
