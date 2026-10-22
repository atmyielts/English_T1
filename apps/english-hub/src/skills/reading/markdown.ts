// A small, safe Markdown reader for reading passages. It only produces plain
// data (text runs with bold/italic flags); the UI renders them as React text,
// so nothing from the article is ever injected as HTML.

export type InlineRun = { text: string; strong?: boolean; em?: boolean };

export type PassageBlock =
  | { type: 'heading'; level: 2 | 3; runs: InlineRun[] }
  | { type: 'paragraph'; runs: InlineRun[] }
  | { type: 'quote'; runs: InlineRun[] }
  | { type: 'list'; ordered: boolean; items: InlineRun[][] };

/** Splits one line of text into runs, honouring **bold**, __bold__, *italic* and _italic_. Links keep their text. */
export const parseInline = (source: string): InlineRun[] => {
  const textOnly = source
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
  const runs: InlineRun[] = [];
  const push = (text: string, flags: Omit<InlineRun, 'text'>) => {
    if (!text) return;
    const last = runs[runs.length - 1];
    if (last && Boolean(last.strong) === Boolean(flags.strong) && Boolean(last.em) === Boolean(flags.em)) {
      last.text += text;
      return;
    }
    runs.push({ text, ...(flags.strong ? { strong: true } : {}), ...(flags.em ? { em: true } : {}) });
  };
  // No lookbehind: older Safari versions cannot parse it.
  const pattern = /(\*{3}|_{3})(\S(?:[\s\S]*?\S)?)\1|(\*\*|__)(\S(?:[\s\S]*?\S)?)\3|(\*|_)(\S(?:[\s\S]*?\S)?)\5/g;
  let cursor = 0;
  for (const match of textOnly.matchAll(pattern)) {
    const index = match.index ?? 0;
    // `_` inside a word (snake_case) is not emphasis.
    if ((match[1] ?? match[3] ?? match[5] ?? '').startsWith('_') && /\w/.test(textOnly[index - 1] ?? '')) continue;
    push(textOnly.slice(cursor, index), {});
    if (match[2] !== undefined) {
      push(match[2], { strong: true, em: true });
    } else if (match[4] !== undefined) {
      for (const inner of parseInline(match[4])) push(inner.text, { strong: true, em: inner.em });
    } else {
      for (const inner of parseInline(match[6] ?? '')) push(inner.text, { em: true, strong: inner.strong });
    }
    cursor = index + match[0].length;
  }
  push(textOnly.slice(cursor), {});
  return runs;
};

export const parsePassage = (source: string): PassageBlock[] => {
  const blocks: PassageBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', runs: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushList = () => {
    if (list?.items.length) blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map(parseInline) });
    list = null;
  };

  for (const rawLine of String(source ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', level: heading[1]!.length >= 3 ? 3 : 2, runs: parseInline(heading[2]!) });
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      flushList();
      const text = quote[1]!.trim();
      if (text) blocks.push({ type: 'quote', runs: parseInline(text) });
      continue;
    }
    const bullet = /^[-*+]\s+(.+)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.+)$/.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(item[1]!);
      continue;
    }
    if (/^([-*_])\1{2,}$/.test(line)) {
      flushParagraph();
      flushList();
      continue;
    }
    if (list) {
      // A wrapped list line continues the last item.
      const items = list.items;
      items[items.length - 1] = `${items[items.length - 1] ?? ''} ${line}`;
      continue;
    }
    paragraph.push(line.replace(/\\$/, '').trimEnd());
    // A Markdown hard line break (two trailing spaces or a backslash) starts a new line.
    if (/(?: {2,}|\\)$/.test(rawLine)) flushParagraph();
  }
  flushParagraph();
  flushList();
  return blocks;
};

export const runsText = (runs: InlineRun[]): string => runs.map((run) => run.text).join('');

/** Character ranges [start, end) of the sentences in a piece of text. */
export const sentenceRanges = (text: string): Array<[number, number]> => {
  const ranges: Array<[number, number]> = [];
  const pattern = /[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)/g;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    const start = (match.index ?? 0) + (raw.length - raw.trimStart().length);
    const end = (match.index ?? 0) + raw.trimEnd().length;
    if (end > start) ranges.push([start, end]);
  }
  return ranges;
};

export const sentenceAt = (text: string, offset: number): string => {
  const range = sentenceRanges(text).find(([start, end]) => offset >= start && offset < end);
  return range ? text.slice(range[0], range[1]) : text.trim();
};

/** Words: letters with inner apostrophes or hyphens ("don't", "well-known"). */
export const WORD_PATTERN = /[A-Za-zÀ-ÿ]+(?:['’-][A-Za-zÀ-ÿ]+)*/g;

/** The form to save: no possessive 's, lower case unless it looks like a name. */
export const savedForm = (word: string, sentence: string): string => {
  const clean = word.replace(/['’]s$/i, '');
  if (/^[A-Z]{2,}$/.test(clean)) return clean; // an abbreviation, e.g. "UN"
  if (!/^[A-Z]/.test(clean)) return clean.toLowerCase();
  // A capital letter mid-sentence usually means a name; at the start it does not.
  return sentence.trimStart().startsWith(word) ? clean.toLowerCase() : clean;
};

/** Finds the first sentence in the passage that contains the word (whole word, any case). */
export const findSentenceWithWord = (blocks: PassageBlock[], word: string): { word: string; sentence: string } | null => {
  const target = word.trim();
  if (!target || !/^[A-Za-zÀ-ÿ'’ -]+$/.test(target)) return null;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const pattern = new RegExp(`(^|[^A-Za-zÀ-ÿ'’])(${escaped})(?=$|[^A-Za-zÀ-ÿ'’])`, 'i');
  const texts = blocks.flatMap((block) => (block.type === 'list' ? block.items.map(runsText) : [runsText(block.runs)]));
  for (const text of texts) {
    const match = pattern.exec(text);
    if (match) {
      const offset = match.index + match[1]!.length;
      return { word: match[2]!, sentence: sentenceAt(text, offset) };
    }
  }
  return null;
};
