export type ReadingContentBlock = {
  type: 'heading' | 'paragraph' | 'quote';
  text: string;
};

export const parseReadingMarkdown = (source: string): ReadingContentBlock[] => {
  const blocks: ReadingContentBlock[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    blocks.push({ type: 'paragraph', text: paragraphLines.join(' ') });
    paragraphLines = [];
  };

  for (const rawLine of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      continue;
    }

    const heading = line.match(/^#{2,3}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      blocks.push({ type: 'heading', text: heading[1]!.trim() });
      continue;
    }

    const quote = line.match(/^>\s+(.+)$/);
    if (quote) {
      flushParagraph();
      blocks.push({ type: 'quote', text: quote[1]!.trim() });
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  return blocks;
};
