import type { Schema } from './schema.ts';

// Library pages and material kinds, shared by the app and the function.
// A page is a Markdown document (`body`) with an optional structured `material`
// (a worksheet, a reading set…) of a registered kind. The kind says how its
// material becomes an editable document and Telegram-ready text; areas define
// kinds and register them on both sides (see the CONTRACT.md files).

export const PAGE_LIMITS = { title: 200, folder: 200, folderDepth: 5, body: 200_000, material: 400_000 } as const;
export const MATERIAL_KIND_PATTERN = /^[a-z][a-z0-9_.-]{1,60}$/;
/** Built-in kinds: a free document, and an answer saved from a chat. */
export const CORE_PAGE_KINDS = ['note', 'chat_answer'] as const;

export interface MaterialKindDefinition<T = unknown> {
  /** `note`, `worksheet`, `reading_set`, `ielts.reading`… */
  kind: string;
  /** Validates a material before it is stored. Without one, only pages with no material are allowed. */
  schema?: Schema<T>;
  /** The editable Markdown document made from the material (also what search reads). */
  toMarkdown(material: T): string;
  /** Telegram-ready text, when plain conversion of the Markdown is not good enough. */
  toTelegram?(material: T): string;
}

/** A folder path: segments trimmed, empty ones dropped, at most five deep, `/` between. */
export function cleanFolder(path: string): string {
  const segments = path.split('/').map((segment) => segment.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (segments.length > PAGE_LIMITS.folderDepth) throw new Error('folder_too_deep');
  const out = segments.join('/');
  if (out.length > PAGE_LIMITS.folder) throw new Error('folder_too_long');
  return out;
}

/**
 * Markdown as text people can paste into Telegram, in messages of at most `limit`
 * characters, split between paragraphs where possible. Headings become bold-looking
 * lines, list markers become bullets, tables become "a · b · c" rows, links show
 * their address, and maths keeps its \( \) source.
 */
export function toTelegramText(markdown: string, limit = 4000): string[] {
  const lines: string[] = [];
  let fence = false;
  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*```/.test(raw)) { fence = !fence; continue; }
    if (fence) { lines.push(raw); continue; }
    let line = raw;
    if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)) continue;
    if (/^\s*\|.*\|\s*$/.test(line)) line = line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()).join(' · ');
    line = line
      .replace(/^\s{0,3}#{1,6}\s+(.*)$/, (_m, text: string) => `\n${text.toUpperCase()}`)
      .replace(/^(\s*)[-*+]\s+\[( |x|X)\]\s+/, (_m, indent: string, done: string) => `${indent}${done.trim() ? '☑' : '☐'} `)
      .replace(/^(\s*)[-*+]\s+/, '$1• ')
      .replace(/^\s*>\s?/, '│ ')
      .replace(/^\s*([-*_])\1{2,}\s*$/, '———')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1 ($2)')
      .replace(/(\*\*|__)(.+?)\1/g, '$2')
      .replace(/(?<![\\\w])([*_])(?!\s)(.+?)(?<!\s)\1(?!\w)/g, '$2')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/`([^`]+)`/g, '$1');
    lines.push(line);
  }
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) return [];
  const parts: string[] = [];
  let current = '';
  const push = () => { if (current) parts.push(current); current = ''; };
  for (const block of text.split(/\n\n/)) {
    let rest = block;
    while (rest) {
      const room = current ? limit - current.length - 2 : limit;
      if (rest.length <= room) { current = current ? `${current}\n\n${rest}` : rest; break; }
      // A paragraph that fits a message of its own starts one; a longer one fills this one first.
      if (rest.length <= limit || room < limit / 4) { push(); continue; }
      const window = rest.slice(0, room);
      let cut = Math.max(window.lastIndexOf('\n'), window.lastIndexOf(' '));
      if (cut < room / 2) cut = room;
      const piece = window.slice(0, cut).trimEnd();
      current = current ? `${current}\n\n${piece}` : piece;
      rest = rest.slice(cut).trimStart();
      push();
    }
  }
  push();
  return parts;
}
