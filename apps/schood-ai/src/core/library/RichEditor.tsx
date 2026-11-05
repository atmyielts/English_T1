// Portions adapted from CopilotKit/OpenDots (MIT License, Copyright (c) Atai Barkai)
import { useEffect, useRef, type ReactNode } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Heading2, Italic, Link2, List, ListChecks, ListOrdered, Quote, Redo2, Table2, Undo2 } from 'lucide-react';
import { useT } from '../i18n/index.ts';
import { documentExtensions } from './document.ts';
import { isSafeLink, tidyMarkdown } from './source.ts';
import { SlashCommands } from './slash-commands.ts';

// The page body as a document: TipTap with Markdown in and out, a small toolbar
// and "/" blocks. It reports Markdown on every edit; the autosave decides when to
// send it. Loaded on demand (TipTap is the heaviest part of the app).

function ToolButton({ label, pressed, disabled, onClick, children }: { label: string; pressed?: boolean; disabled?: boolean; onClick(): void; children: ReactNode }) {
  return <button type="button" title={label} aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}
    className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-800 transition hover:bg-cream disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy ${pressed ? 'bg-lime-soft' : ''}`}>
    {children}
  </button>;
}

export default function RichEditor({ value, onChange, onNotice }: { value: string; onChange(markdown: string): void; onNotice(message: string): void }) {
  const t = useT();
  const change = useRef(onChange);
  change.current = onChange;
  const notice = useRef(onNotice);
  notice.current = onNotice;
  const label = useRef(t);
  label.current = t;
  const emitted = useRef(value);
  const editor = useEditor({
    extensions: [
      ...documentExtensions(),
      Placeholder.configure({ placeholder: () => label.current('library.editor.placeholder') }),
      SlashCommands.configure({ label: (key: string) => label.current(key) }),
    ],
    content: value,
    contentType: 'markdown',
    editorProps: {
      attributes: { class: 'doc-prose', 'aria-label': t('library.editor.label'), role: 'textbox', 'aria-multiline': 'true' },
      handlePaste: (_view, event) => {
        const html = event.clipboardData?.getData('text/html') ?? '';
        if (/<(img|iframe|script|video|audio|object|embed)\b/i.test(html)) {
          event.preventDefault();
          notice.current(label.current('library.editor.noEmbeds'));
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = tidyMarkdown(current.getMarkdown());
      emitted.current = markdown;
      change.current(markdown);
    },
  });
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => current ? {
      bold: current.isActive('bold'), italic: current.isActive('italic'), heading: current.isActive('heading', { level: 2 }),
      bullet: current.isActive('bulletList'), ordered: current.isActive('orderedList'), task: current.isActive('taskList'),
      quote: current.isActive('blockquote'), link: current.isActive('link'), undo: current.can().undo(), redo: current.can().redo(),
    } : null,
  });
  // A new value from outside (a restore, "load the latest") replaces the document.
  useEffect(() => {
    if (editor && value !== emitted.current) {
      emitted.current = value;
      editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
    }
  }, [editor, value]);
  if (!editor) return <p className="text-sm text-gray-600">{t('library.editor.loading')}</p>;
  const link = () => {
    const url = window.prompt(t('library.editor.linkPrompt'), editor.getAttributes('link').href ?? '');
    if (url === null) return;
    if (!url.trim()) { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
    if (!isSafeLink(url)) { onNotice(t('library.editor.badLink')); return; }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };
  return <div className="rounded-3xl border border-navy-line bg-white">
    <div role="toolbar" aria-label={t('library.tool.label')} className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-3xl border-b border-navy-line/20 bg-white/95 px-2 py-1.5">
      <ToolButton label={t('library.tool.bold')} pressed={state?.bold} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={16} aria-hidden="true"/></ToolButton>
      <ToolButton label={t('library.tool.italic')} pressed={state?.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={16} aria-hidden="true"/></ToolButton>
      <ToolButton label={t('library.tool.heading')} pressed={state?.heading} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={17} aria-hidden="true"/></ToolButton>
      <span className="mx-1 h-5 w-px bg-navy-line/20" aria-hidden="true"/>
      <ToolButton label={t('library.tool.bullet')} pressed={state?.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={17} aria-hidden="true"/></ToolButton>
      <ToolButton label={t('library.tool.numbered')} pressed={state?.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={17} aria-hidden="true"/></ToolButton>
      <ToolButton label={t('library.tool.checklist')} pressed={state?.task} onClick={() => editor.chain().focus().toggleTaskList().run()}><ListChecks size={17} aria-hidden="true"/></ToolButton>
      <ToolButton label={t('library.tool.quote')} pressed={state?.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={15} aria-hidden="true"/></ToolButton>
      <ToolButton label={t('library.tool.link')} pressed={state?.link} onClick={link}><Link2 size={16} aria-hidden="true"/></ToolButton>
      <ToolButton label={t('library.tool.table')} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={16} aria-hidden="true"/></ToolButton>
      <span className="mx-1 h-5 w-px bg-navy-line/20" aria-hidden="true"/>
      <ToolButton label={t('library.tool.undo')} disabled={!state?.undo} onClick={() => editor.chain().focus().undo().run()}><Undo2 size={16} aria-hidden="true"/></ToolButton>
      <ToolButton label={t('library.tool.redo')} disabled={!state?.redo} onClick={() => editor.chain().focus().redo().run()}><Redo2 size={16} aria-hidden="true"/></ToolButton>
    </div>
    <EditorContent editor={editor} className="px-4 py-4 md:px-6"/>
    <p className="m-0 border-t border-navy-line/10 px-4 py-2 text-xs text-gray-600 md:px-6">{t('library.editor.hint')}</p>
  </div>;
}
