// Portions adapted from CopilotKit/OpenDots (MIT License, Copyright (c) Atai Barkai)
import type { Extensions } from '@tiptap/core';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { isSafeLink } from './source.ts';

// The document a page body is edited as: Markdown in and out (GitHub-flavoured, so
// tables and checklists survive), headings 1-3, lists, quotes, code, links and
// dividers. Anything the editor cannot write back as the same Markdown (maths,
// images, raw HTML, footnotes) opens in Markdown source instead, so a save never
// drops what an area or the AI put in the page.

export function documentExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      underline: false,
      link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'], isAllowedUri: (url) => isSafeLink(url) },
    }),
    TableKit.configure({ table: { resizable: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Markdown.configure({ markedOptions: { gfm: true } }),
  ];
}
