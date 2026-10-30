// The placement test's types and its Markdown (print, export, the library page),
// without the schema, so the app can register the material kind in its first
// download while the builder and marking load with their screens.

export const CEFR_LEVELS = ['pre_a1', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];
export const PLACEMENT_KIND = 'centre.placement_test';

export interface PlacementItem { id: string; type: 'mcq' | 'gap'; level: CefrLevel; prompt: string; options?: string[]; answer?: number; accept?: string[] }
export interface PlacementSection { id: string; title: string; kind: 'objective' | 'writing' | 'speaking'; instructions?: string; items?: PlacementItem[]; prompt?: string; min_words?: number; criteria?: string[] }
export interface PlacementTest { title: string; from_level: CefrLevel; to_level: CefrLevel; minutes?: number; instructions?: string; sections: PlacementSection[]; bands: { level: CefrLevel; min_percent: number }[] }

export const LEVEL_LABEL: Record<CefrLevel, string> = { pre_a1: 'Pre-A1', a1: 'A1', a2: 'A2', b1: 'B1', b2: 'B2', c1: 'C1', c2: 'C2' };

/** The test as Markdown with the answer key and the cut scores at the end (staff copies only). */
export function placementMarkdown(test: PlacementTest): string {
  const lines = [`# ${test.title}`, '', `Levels ${LEVEL_LABEL[test.from_level]}–${LEVEL_LABEL[test.to_level]}${test.minutes ? ` · ${test.minutes} minutes` : ''}`, ''];
  if (test.instructions) lines.push(test.instructions, '');
  const key: string[] = [];
  for (const sec of test.sections) {
    lines.push(`## ${sec.title}`, '');
    if (sec.instructions) lines.push(sec.instructions, '');
    if (sec.prompt) lines.push(sec.prompt, ...(sec.min_words ? ['', `At least ${sec.min_words} words.`] : []), '');
    (sec.items ?? []).forEach((entry, index) => {
      lines.push(`${index + 1}. ${entry.prompt}`);
      if (entry.type === 'mcq') (entry.options ?? []).forEach((option, at) => lines.push(`   ${String.fromCharCode(65 + at)}. ${option}`));
      key.push(`${sec.title} ${index + 1}: ${entry.type === 'mcq' ? String.fromCharCode(65 + (entry.answer ?? 0)) : (entry.accept ?? []).join(' / ')} (${LEVEL_LABEL[entry.level]})`);
    });
    lines.push('');
  }
  lines.push('## Answer key (staff only)', '', ...key.map((entry) => `- ${entry}`), '', '## Levels', '', ...test.bands.map((band) => `- ${LEVEL_LABEL[band.level]}: ${band.min_percent}% or more`));
  return lines.join('\n');
}
