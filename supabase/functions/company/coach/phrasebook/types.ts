// Shapes of the situation phrasebook. An entry is a tuple so the content stays readable.
export type PhraseLevel = 'a2' | 'b1' | 'b2';
export type PhraseTone = 'formal' | 'neutral' | 'friendly';
export type Entry = [en: string, ru: string, uz: string, level: PhraseLevel, tone?: PhraseTone];
export interface Localized { en: string; ru: string; uz: string }
export interface SituationData { code: string; title: Localized; lead: Localized; entries: Entry[] }
