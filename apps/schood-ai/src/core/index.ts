// What feature areas import from core. See ../CONTRACT.md.
export { api, ApiError, apiConfigured, stream, type ApiOptions, type StreamEvent } from './api.ts';
export type { AreaNavItem, AreaRegistry, AreaRoute, Audience, HomeCard } from './areas.ts';
export { registerSessionSource, signInUrl, useSession, type SessionSource } from './auth.tsx';
export { ApproveRunCard, GenerationReviewCard, ReviewCard, useGeneration, type ReviewIssue, type ReviewStatus } from './cards.tsx';
export { Chat, ReportDialog, type ChatProps } from './Chat.tsx';
export { useI18n, useT, type Translate } from './i18n/index.ts';
export { AudienceSwitcher, LanguageSwitcher } from './layout.tsx';
export { Answer, protectMath } from './markdown.tsx';
export { askAssistant } from './pages/Home.tsx';
export { Link, matchPath, navigate, useLocation } from './router.tsx';
// The library (T6): pages, the material-kind registry, the editor and print view.
export {
  conflictPage, createPage, deletePage, duplicatePage, exportPage, getPage, listFolders, listPages, moveFolder, pageRevision, pageRevisions,
  registerMaterialKind, restorePage, savePage, uiMaterialKind,
  type FolderView, type PageCreateInput, type PageExport, type PageListFilter, type PageRevisionSnapshot, type PageRevisionView,
  type PageSaveInput, type PageStatus, type PageSummary, type PageView, type PageVisibility, type UiMaterialKind,
} from './library/api.ts';
export { LibraryView, PageEditor, PrintView, type LibraryViewProps, type PageEditorProps } from './library/Library.tsx';
export { ApiErrorState, CappedState, CreditBalance, CreditCost, EmptyState, ErrorState, LoadingState, Paywall, PlanGate } from './states.tsx';
export type * from './types.ts';
export { Badge, BrandMark, Button, ButtonLink, Card, Dialog, Eyebrow, Field, FocusSurface, PageHeader, SparkMark, TextArea, TextInput, Thinking, VisuallyHidden } from './ui.tsx';
export { audiencesFor, contextLabel, useWorkspace } from './workspace.tsx';
