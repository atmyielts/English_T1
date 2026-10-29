import { useT } from '../i18n/index.ts';
import { EmptyState } from '../states.tsx';
import type { PageSummary, PageView } from './api.ts';

// Contract placeholders: the full library, editor and print view replace these
// with the same props in the next commit.

export interface LibraryViewProps {
  /** Only this kind (for example an area's own list of worksheets). */
  kind?: string;
  /** Start in this folder. */
  folder?: string;
  /** Called instead of opening /library/:id when given. */
  onOpen?(page: PageSummary): void;
  /** Hides the "New page" button (lists of generated materials). */
  readOnly?: boolean;
}
export function LibraryView(_props: LibraryViewProps) {
  const t = useT();
  return <EmptyState title={t('library.soon')}/>;
}

export interface PageEditorProps {
  pageId: string;
  onSaved?(page: PageView): void;
  onDeleted?(): void;
}
export function PageEditor(_props: PageEditorProps) {
  const t = useT();
  return <EmptyState title={t('library.soon')}/>;
}

export function PrintView(_props: { pageId: string }) {
  const t = useT();
  return <EmptyState title={t('library.soon')}/>;
}
