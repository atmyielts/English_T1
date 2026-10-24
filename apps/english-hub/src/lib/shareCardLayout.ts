// Share-card content and text layout (pure, so it is testable without a DOM).
// Drawing lives in ./shareCard.ts.

export type ShareCardKind = 'level_up' | 'certificate' | 'streak' | 'league' | 'exam' | 'duel';
export type ShareCardFormat = 'story' | 'square';

export type ShareCardData = {
  kind: ShareCardKind;
  /** Small caps label, top right ("LEVEL UP"). */
  label: string;
  /** The big number or level ("B2", "30", "8/10"). */
  big: string;
  headline: string;
  detail?: string;
};

export const CARD_SIZES: Record<ShareCardFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

export const SITE = 'english.schood.online';

/** Where a shared card points: the English app with a ref for the kind of card. */
export const shareLink = (kind: ShareCardKind): string => `https://${SITE}/?ref=share_${kind}`;

/** Splits text into lines that fit `maxWidth`, at most `maxLines` (the last one ends with …). */
export const wrapLines = (measure: (text: string) => number, text: string, maxWidth: number, maxLines: number): string[] => {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next) <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1]!;
  while (last && measure(`${last}…`) > maxWidth) last = last.slice(0, -1).trimEnd();
  kept[maxLines - 1] = `${last}…`;
  return kept;
};

