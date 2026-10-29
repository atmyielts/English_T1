import { LibraryView, PageEditor, PrintView } from './Library.tsx';

// The library's own routes: /library, /library/:id and /library/:id/print.
export function LibraryPage() { return <LibraryView/>; }
export function LibraryPageEditor({ params }: { params: Record<string, string> }) { return <PageEditor pageId={params.id}/>; }
export function LibraryPrintPage({ params }: { params: Record<string, string> }) { return <PrintView pageId={params.id}/>; }
