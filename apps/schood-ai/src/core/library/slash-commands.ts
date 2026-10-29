// Portions adapted from CopilotKit/OpenDots (MIT License, Copyright (c) Atai Barkai)
import { Extension, type Editor, type Range } from '@tiptap/core';
import Suggestion, { exitSuggestion, type SuggestionProps } from '@tiptap/suggestion';

// Type "/" at the start of a line for a menu of blocks. The menu is plain DOM in
// the platform look (see .slash-menu in index.css), keyboard driven, and labelled
// in the page's language through the `label` option.

export type BlockId = 'text' | 'h1' | 'h2' | 'h3' | 'bullet' | 'numbered' | 'checklist' | 'quote' | 'code' | 'divider' | 'table';
interface Block { id: BlockId; run(editor: Editor, range: Range): void }
export interface SlashOptions { label(key: string): string }

const command = (action: (editor: Editor) => void) => (editor: Editor, range: Range) => {
  editor.chain().focus().deleteRange(range).run();
  action(editor);
};
export const BLOCKS: Block[] = [
  { id: 'text', run: command((e) => e.chain().setParagraph().run()) },
  ...([1, 2, 3] as const).map((level): Block => ({ id: `h${level}`, run: command((e) => e.chain().setHeading({ level }).run()) })),
  { id: 'bullet', run: command((e) => e.chain().toggleBulletList().run()) },
  { id: 'numbered', run: command((e) => e.chain().toggleOrderedList().run()) },
  { id: 'checklist', run: command((e) => e.chain().toggleTaskList().run()) },
  { id: 'quote', run: command((e) => e.chain().toggleBlockquote().run()) },
  { id: 'code', run: command((e) => e.chain().toggleCodeBlock().run()) },
  { id: 'divider', run: command((e) => e.chain().setHorizontalRule().run()) },
  { id: 'table', run: command((e) => e.chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()) },
];

export const SlashCommands = Extension.create<SlashOptions>({
  name: 'slashCommands',
  addOptions() { return { label: (key: string) => key }; },
  addProseMirrorPlugins() {
    const label = this.options.label;
    const title = (block: Block) => label(`library.block.${block.id}`), hint = (block: Block) => label(`library.block.${block.id}Hint`);
    return [
      Suggestion<Block>({
        editor: this.editor,
        char: '/',
        startOfLine: true,
        allowedPrefixes: null,
        items: ({ query }) => BLOCKS.filter((block) => `${title(block)} ${hint(block)} ${block.id}`.toLowerCase().includes(query.toLowerCase())),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          let menu: HTMLDivElement | undefined;
          let current: SuggestionProps<Block> | undefined;
          let index = 0;
          const close = () => {
            menu?.remove();
            menu = undefined;
            const dom = current?.editor.view.dom;
            dom?.removeAttribute('aria-controls');
            dom?.removeAttribute('aria-activedescendant');
            dom?.removeAttribute('aria-autocomplete');
            document.removeEventListener('pointerdown', outside);
          };
          const outside = (event: PointerEvent) => {
            if (menu && !menu.contains(event.target as Node)) {
              if (current) exitSuggestion(current.editor.view);
              close();
            }
          };
          const paint = () => {
            if (!menu || !current) return;
            const props = current;
            menu.replaceChildren();
            const heading = document.createElement('div');
            heading.className = 'slash-menu-label';
            heading.textContent = label('library.block.menu');
            menu.append(heading);
            if (!props.items.length) {
              const empty = document.createElement('p');
              empty.textContent = label('library.block.none');
              menu.append(empty);
            }
            props.items.forEach((item, i) => {
              const button = document.createElement('button');
              button.type = 'button';
              button.id = `slash-block-${i}`;
              button.setAttribute('role', 'option');
              button.setAttribute('aria-selected', String(i === index));
              button.className = i === index ? 'selected' : '';
              const name = document.createElement('strong');
              name.textContent = title(item);
              const description = document.createElement('span');
              description.textContent = hint(item);
              button.append(name, description);
              button.addEventListener('mousedown', (event) => event.preventDefault());
              button.addEventListener('click', () => props.command(item));
              menu!.append(button);
            });
            const rect = props.clientRect?.();
            if (rect) {
              // Below the caret, or above it when the screen has no room below.
              const height = menu.offsetHeight;
              menu.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 12))}px`;
              menu.style.top = `${rect.bottom + 8 + height <= window.innerHeight - 12 ? rect.bottom + 8 : Math.max(12, rect.top - height - 8)}px`;
            }
            props.editor.view.dom.setAttribute('aria-activedescendant', `slash-block-${index}`);
            menu.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
          };
          return {
            onStart: (props) => {
              current = props;
              index = 0;
              menu = document.createElement('div');
              menu.id = 'document-block-menu';
              menu.className = 'slash-menu';
              menu.setAttribute('role', 'listbox');
              menu.setAttribute('aria-label', label('library.block.menu'));
              document.body.append(menu);
              props.editor.view.dom.setAttribute('aria-controls', menu.id);
              props.editor.view.dom.setAttribute('aria-autocomplete', 'list');
              document.addEventListener('pointerdown', outside);
              paint();
            },
            onUpdate: (props) => { current = props; index = 0; paint(); },
            onExit: close,
            onKeyDown: ({ event, view }) => {
              if (event.isComposing || view.composing || event.keyCode === 229) return false;
              if (event.key === 'Escape') { exitSuggestion(view); close(); return true; }
              if (!current?.items.length) return false;
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                index = (index + (event.key === 'ArrowDown' ? 1 : -1) + current.items.length) % current.items.length;
                paint();
                return true;
              }
              if (event.key === 'Enter') { current.command(current.items[index]); return true; }
              return false;
            },
          };
        },
      }),
    ];
  },
});
