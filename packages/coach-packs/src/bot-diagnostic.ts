import { plain, say } from './copy.ts';
import { decodeAnswers, encodeAnswers, scoreDiagnostic, type DiagnosticResult } from './diagnostic.ts';
import { escapeHtml, levelLabel, pick } from './text.ts';
import type { CoachPack, Locale } from './types.ts';
import type { OutButton, OutMessage } from './wire.ts';

// The placement test in Telegram, rendered the same way by the worker (for people
// who have not linked yet: no storage, the answers ride in the button data) and by
// the function. Button data: `dg:<l>:<index>:<choice>:<answers so far>` where l is
// u, r or e; at most 64 bytes for 30 items.

const L: Record<Locale, string> = { uz: 'u', ru: 'r', en: 'e' };
const FROM_L: Record<string, Locale> = { u: 'uz', r: 'ru', e: 'en' };

export interface DiagnosticTap { locale: Locale; index: number; choice: number; answers: number[] }

export function parseDiagnosticTap(data: string): DiagnosticTap | null {
  const match = /^dg:([ure]):(\d{1,2}):([0-3]):([0-9a-z]{1,13})$/.exec(data);
  if (!match) return null;
  const answers = decodeAnswers(match[4]);
  if (!answers || answers.length !== Number(match[2])) return null;
  return { locale: FROM_L[match[1]], index: Number(match[2]), choice: Number(match[3]), answers };
}

/** `dgs:<l>:<answers>`: "save my result" after linking. */
export function parseDiagnosticSave(data: string): { locale: Locale; answers: number[] } | null {
  const match = /^dgs:([ure]):([0-9a-z]{1,13})$/.exec(data);
  const answers = match ? decodeAnswers(match[2]) : null;
  return match && answers ? { locale: FROM_L[match[1]], answers } : null;
}

/** The question at `answers.length`, or null when the test is complete. */
export function diagnosticQuestion(pack: CoachPack, locale: Locale, answers: number[]): OutMessage | null {
  const items = pack.diagnostic.items, index = answers.length, item = items[index];
  if (!item) return null;
  const state = encodeAnswers(answers);
  const tap = (choice: number) => `dg:${L[locale]}:${index}:${choice}:${state}`;
  const header = `<b>${say(locale, 'diag.question', { n: index + 1, total: items.length })}</b>`;
  if (item.kind === 'can_do') {
    return {
      kind: 'text',
      html: `${header}\n${say(locale, 'diag.can_do')}\n\n<i>${escapeHtml(pick(item.prompt as Record<string, string>, locale))}</i>`,
      buttons: [[{ text: plain(locale, 'btn.yes'), data: tap(0) }, { text: plain(locale, 'btn.partly'), data: tap(1) }, { text: plain(locale, 'btn.not_yet'), data: tap(2) }]],
    };
  }
  const passage = item.passage && (index === 0 || items[index - 1].passage !== item.passage) ? `<blockquote>${escapeHtml(item.passage)}</blockquote>\n` : '';
  const options = item.options ?? [];
  const long = options.some((option) => option.length > 28);
  const letters = ['A', 'B', 'C', 'D'];
  const body = long ? `\n${options.map((option, i) => `<b>${letters[i]}</b>. ${escapeHtml(option)}`).join('\n')}` : '';
  const buttons: OutButton[][] = long
    ? [options.map((_, i) => ({ text: letters[i], data: tap(i) }))]
    : options.map((option, i) => [{ text: option, data: tap(i) }]);
  return { kind: 'text', html: `${header}\n${passage}${escapeHtml(String(item.prompt))}${body}`, buttons };
}

/** The next answer added; null when the tap is stale or out of range. */
export function applyDiagnosticTap(pack: CoachPack, tap: DiagnosticTap): number[] | null {
  const item = pack.diagnostic.items[tap.index];
  if (!item || tap.answers.length !== tap.index) return null;
  const max = item.kind === 'can_do' ? 2 : (item.options?.length ?? 0) - 1;
  if (tap.choice > max) return null;
  return [...tap.answers, tap.choice];
}

export function diagnosticResultText(pack: CoachPack, locale: Locale, result: DiagnosticResult): string {
  const scale = pack.manifest.scale;
  const skills = result.skills.filter((skill) => skill.level !== null).map((skill) => say(locale, 'diag.skill_line', {
    skill: pick(pack.skillById.get(skill.skill)?.name, locale) || skill.skill,
    level: levelLabel(scale, skill.level!),
    detail: skill.selfRated ? plain(locale, 'diag.self') : plain(locale, 'diag.correct', { correct: skill.correct, total: skill.total }),
  })).join('\n');
  return say(locale, 'diag.result', { level: levelLabel(scale, result.overall) }, { skills });
}

/** The result for someone who has not linked yet: link to save it, or see an example report. */
export function diagnosticUnlinked(pack: CoachPack, locale: Locale, answers: number[], linkUrl: string): OutMessage[] {
  const result = scoreDiagnostic(pack, answers);
  return [{
    kind: 'text',
    html: `${diagnosticResultText(pack, locale, result)}

${say(locale, 'diag.link')}`,
    buttons: [
      [{ text: plain(locale, 'link.button'), url: linkUrl }],
      [{ text: plain(locale, 'link.save_result'), data: `dgs:${L[locale]}:${encodeAnswers(answers)}` }],
      [{ text: plain(locale, 'paywall.samples'), app: `/coach/${pack.manifest.id}/samples` }],
    ],
  }];
}

export const localeCode = (locale: Locale) => L[locale];
export const localeOfCode = (code: string): Locale => FROM_L[code] ?? 'en';
