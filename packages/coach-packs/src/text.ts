import { LOCALES, type LevelScale, type Locale, type Localized } from './types.ts';

// Text helpers shared by the validator, the scoring pipeline and the renderers.

/** The text in this language, else English, else any language present. */
export function pick(text: Localized | string | undefined, locale: Locale): string {
  if (text === undefined) return '';
  if (typeof text === 'string') return text;
  return text[locale] ?? text.en ?? LOCALES.map((code) => text[code]).find(Boolean) ?? '';
}

/** Fills `{name}` placeholders; unknown placeholders stay visible so a missing value is noticed in review. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([a-z_]+)\}/g, (whole, key: string) => (Object.hasOwn(values, key) ? String(values[key]) : whole));
}

/** For comparing a quote with the learner's text: case, quotes, dashes and spacing do not matter. */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/[“”«»„]/g, '"')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strips punctuation at the ends of a quote: models often add or drop a final full stop. */
const trimQuote = (text: string) => text.replace(/^[\s"'.,;:!?()[\]-]+|[\s"'.,;:!?()[\]-]+$/g, '');

/** True when `quote` appears word for word in `source` (after normalising both). */
export function quoteFound(quote: string, source: string): boolean {
  const needle = trimQuote(normalizeForMatch(quote));
  if (needle.length < 2) return false;
  return normalizeForMatch(source).includes(needle);
}

/** Words for counting and analysis: letters, digits, apostrophes and inner hyphens. */
export function wordsOf(text: string): string[] {
  return normalizeForMatch(text).replace(/[^\p{L}\p{N}'\s-]+/gu, ' ').split(/\s+/).map((word) => word.replace(/^['-]+|['-]+$/g, '')).filter(Boolean);
}
export const countWords = (text: string): number => wordsOf(text).length;

/** Sentences, roughly: split after . ! ? followed by a space or the end. */
export function sentencesOf(text: string): string[] {
  return text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
}

/** For Telegram HTML messages. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Accepted short answers: case, spacing, articles at the start and final punctuation are forgiven. */
export function answerMatches(given: string, accepted: readonly string[]): boolean {
  const clean = (value: string) => normalizeForMatch(value).replace(/[.,;:!?]+$/g, '').replace(/^(the|a|an) /, '').replace(/\s+/g, ' ').trim();
  const value = clean(given);
  return value.length > 0 && accepted.some((answer) => clean(answer) === value);
}

// --- Level scales --------------------------------------------------------------------------------

export const onScale = (scale: LevelScale, value: number): boolean =>
  Number.isFinite(value) && value >= scale.min - 1e-9 && value <= scale.max + 1e-9 && Math.abs(Math.round((value - scale.min) / scale.step) * scale.step - (value - scale.min)) < 1e-6;

/** The nearest value on the scale (clamped). */
export function snap(scale: LevelScale, value: number, mode: 'step' | 'half_up' | 'down' = 'step'): number {
  const clamped = Math.min(scale.max, Math.max(scale.min, value));
  const steps = (clamped - scale.min) / scale.step;
  // half_up: IELTS-style, .25 goes up to .5 and .75 up to the next whole band.
  const counted = mode === 'down' ? Math.floor(steps + 1e-9) : mode === 'half_up' ? Math.floor(steps + 0.5 + 1e-9) : Math.round(steps);
  return Number((scale.min + counted * scale.step).toFixed(6));
}

/**
 * "6.5", "B1+", "72%": a scale value as people read it. On a named scale (CEFR) a value
 * between two points (an average) reads as the nearest named point.
 */
export function levelLabel(scale: LevelScale, value: number): string {
  const named = (target: number) => scale.labels?.find((entry) => Math.abs(entry.value - target) < 1e-6)?.label;
  const label = named(value) ?? (scale.labels?.length ? named(snap(scale, value)) : undefined);
  if (label) return label;
  const text = value.toFixed(scale.decimals ?? (scale.step < 1 ? 1 : 0));
  return scale.id === 'percent' ? `${text}%` : text;
}
