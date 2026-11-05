import { escapeHtml, levelLabel, overallScale, pick, type Assessment, type FluencyMetrics, type Rubric } from '../../../../../packages/coach-packs/src/mod.ts';
import type { InEvent } from '../../../../../packages/coach-packs/src/wire.ts';
import type { Bot } from '../bot.ts';

// Shared rendering of scored results, and helpers for incoming voice and photos.

export const MAX_VOICE_SECONDS = 300;
export const MAX_TEXT = 6000;

export function bytesOf(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
export type VoiceEvent = Extract<InEvent, { type: 'voice' }>;
export const clipOf = (bot: Bot, event: VoiceEvent) => ({ file_id: event.fileId, file_unique_id: event.fileUniqueId, duration: event.duration, pack: bot.pack.manifest.id });

/** The score lines of an assessment: each criterion with its first quote, the unscored audio criterion explained. */
export function criterionLines(bot: Bot, rubric: Rubric, assessment: Assessment): string[] {
  return rubric.criteria.map((criterion) => {
    const result = assessment.criteria.find((entry) => entry.id === criterion.id);
    const name = pick(criterion.name, bot.locale);
    if (criterion.source === 'audio') return bot.t('speak.audio_not_scored', { name });
    if (!result || result.score === null) return bot.t('speak.criterion_none', { name });
    return bot.t('speak.criterion', { name, score: levelLabel(rubric.scale, result.score), quote: result.evidence[0]?.quote ?? '' });
  });
}

export function fluencyLine(bot: Bot, fluency: FluencyMetrics | null): string | null {
  if (!fluency) return null;
  if (!fluency.timed && fluency.wpm === null) return bot.t('speak.fluency_typed', { words: fluency.words });
  const pace = fluency.pace ?? { min: 0, max: 0 };
  const words = fluency.fillerWords.length ? ` (${fluency.fillerWords.slice(0, 4).join(', ')})` : '';
  return bot.t('speak.fluency', { wpm: fluency.wpm ?? '—', min: pace.min, max: pace.max, pauses: fluency.longPauses, fillers: fluency.fillers, filler_words: words });
}

export function errorsBlock(bot: Bot, assessment: Assessment, max = 3): string | null {
  if (!assessment.errors.length) return null;
  const lines = assessment.errors.slice(0, max).map((error) => bot.t('speak.error', { quote: error.quote, correction: error.correction, tag: pick(bot.pack.errorById.get(error.tag)?.name, bot.locale) || error.tag }));
  return `${bot.t('speak.errors_title')}\n${lines.join('\n')}`;
}

export function upgradesBlock(bot: Bot, assessment: Assessment, max = 2): string | null {
  if (!assessment.upgrades.length) return null;
  return `${bot.t('speak.better_title')}\n${assessment.upgrades.slice(0, max).map((upgrade) => bot.t('speak.better', { said: upgrade.said, better: upgrade.better, why: upgrade.why })).join('\n\n')}`;
}

export const overallLabel = (rubric: Rubric, value: number | null) => (value === null ? '—' : levelLabel(overallScale(rubric), value));

/** The most frequent error tag of an assessment that has an authored drill. */
export function topDrillTag(bot: Bot, assessment: Assessment): string | null {
  const counts = new Map<string, number>();
  for (const error of assessment.errors) if (bot.pack.errorById.get(error.tag)?.drill) counts.set(error.tag, (counts.get(error.tag) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export const quoteHtml = (text: string, max = 3500) => escapeHtml(text.length > max ? `${text.slice(0, max)}…` : text);

/** Before → after rows for a re-recorded answer. */
export function compareRows(bot: Bot, rubric: Rubric, before: { overall: number | null; criteria: Record<string, number | null>; wpm: number | null; fillers: number | null }, after: typeof before): string {
  const rows: string[] = [];
  const arrow = (a: number | null, b: number | null, lower = false) => (a === null || b === null ? '' : b === a ? '➖' : (lower ? b < a : b > a) ? '✅' : '🔻');
  rows.push(bot.t('speak.compare_row', { label: pick(rubric.name, bot.locale), before: overallLabel(rubric, before.overall), after: overallLabel(rubric, after.overall), arrow: arrow(before.overall, after.overall) }));
  for (const criterion of rubric.criteria.filter((entry) => entry.source === 'model')) {
    const a = before.criteria[criterion.id] ?? null, b = after.criteria[criterion.id] ?? null;
    if (a === null && b === null) continue;
    rows.push(bot.t('speak.compare_row', { label: pick(criterion.name, bot.locale), before: a ?? '—', after: b ?? '—', arrow: arrow(a, b) }));
  }
  if (before.wpm !== null || after.wpm !== null) rows.push(bot.t('speak.compare_row', { label: bot.p('report.row.wpm'), before: before.wpm ?? '—', after: after.wpm ?? '—', arrow: '' }));
  if (before.fillers !== null || after.fillers !== null) rows.push(bot.t('speak.compare_row', { label: bot.p('report.row.fillers_per_100'), before: before.fillers ?? '—', after: after.fillers ?? '—', arrow: arrow(before.fillers, after.fillers, true) }));
  return bot.t('speak.compare', {}, { rows: rows.join('\n') });
}
