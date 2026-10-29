import { lazy, Suspense } from 'react';
import { LoadingState } from '../states.tsx';
import type { PageSummary, PageView } from './api.ts';

// The library components areas import from core. Each loads its screen on
// demand, so importing them costs the main bundle almost nothing; the document
// editor (TipTap) loads only when a page is edited.

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
export interface PageEditorProps {
  pageId: string;
  onSaved?(page: PageView): void;
  onDeleted?(): void;
}

const List = lazy(async () => ({ default: (await import('./LibraryList.tsx')).LibraryList }));
const Editor = lazy(async () => ({ default: (await import('./PageEditorView.tsx')).PageEditorView }));
const Print = lazy(async () => ({ default: (await import('./PrintPage.tsx')).PrintPage }));

/** Pages with folders, search, filters and paging. */
export function LibraryView(props: LibraryViewProps) {
  return <Suspense fallback={<LoadingState/>}><List {...props}/></Suspense>;
}
/** One page: document editing with autosave and conflicts, history, export, print. */
export function PageEditor(props: PageEditorProps) {
  return <Suspense fallback={<LoadingState/>}><Editor {...props}/></Suspense>;
}
/** A page laid out for printing or saving as PDF, with the workspace's branding. */
export function PrintView({ pageId }: { pageId: string }) {
  return <Suspense fallback={<LoadingState/>}><Print pageId={pageId}/></Suspense>;
}
