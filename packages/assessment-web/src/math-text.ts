// Splits question text into plain text and formulas. Formulas use the LaTeX
// delimiters \( … \) for inline and \[ … \] for display, so a "$" in ordinary
// text (prices, for example) is never mistaken for maths.

export type MathSegment = { kind: 'text' | 'inline' | 'display'; value: string };

export const MAX_FORMULA_LENGTH = 2000;

export function hasMath(text: string): boolean {
  return text.includes('\\(') || text.includes('\\[');
}

export function splitMath(text: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let index = 0, plain = '';
  while (index < text.length) {
    const open = text.startsWith('\\(', index) ? '\\(' : text.startsWith('\\[', index) ? '\\[' : null;
    if (open) {
      const close = open === '\\(' ? '\\)' : '\\]';
      const end = text.indexOf(close, index + 2);
      const formula = end < 0 ? '' : text.slice(index + 2, end);
      if (end >= 0 && formula.trim() && formula.length <= MAX_FORMULA_LENGTH) {
        if (plain) segments.push({ kind: 'text', value: plain });
        plain = '';
        segments.push({ kind: open === '\\(' ? 'inline' : 'display', value: formula });
        index = end + 2;
        continue;
      }
    }
    plain += text[index];
    index += 1;
  }
  if (plain) segments.push({ kind: 'text', value: plain });
  return segments;
}
