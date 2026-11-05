// Checks on a page body that need no editor code, so screens can decide how to
// open a page without loading TipTap.

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;
export const isSafeLink = (href: string) => SAFE_LINK.test(href.trim());

/** Why a body should be edited as Markdown source, or null when the document editor keeps it whole. */
export function sourceReason(markdown: string): 'math' | 'image' | 'html' | 'footnote' | null {
  const text = markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  if (/\\\(|\\\[|\$\$|(^|[^\\$\w])\$[^\s$][^$\n]*\$(?!\w)/.test(text)) return 'math';
  if (/!\[[^\]]*\]\(/.test(text)) return 'image';
  if (/<\/?[a-z][\w-]*(\s[^>]*)?>/i.test(text)) return 'html';
  if (/\[\^[^\]]+\]/.test(text)) return 'footnote';
  return null;
}

/** Markdown from the document editor without the extra blank lines it leaves between blocks (code blocks kept as they are). */
export const tidyMarkdown = (markdown: string) =>
  markdown.split(/(^```[\s\S]*?^```)/m).map((part, index) => (index % 2 ? part : part.replace(/\n{3,}/g, '\n\n'))).join('').trimEnd();
