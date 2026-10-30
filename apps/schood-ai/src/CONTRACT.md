# Schood AI app: the contract for feature areas

This is the brief for every agent adding screens to `apps/schood-ai` (ai.schood.online). The function side is in `supabase/functions/schood-ai/CONTRACT.md`. The design source is `docs/product/44_SCHOOD_AI.md`.

## Shape

- **Stack:** Vite, React 19, Tailwind 3 in the main platform's look, lucide icons, uz/ru/en.
- `main.tsx` imports `packages/edge-region` first, then providers: i18n → session → workspace → `App.tsx`.
- `src/core` belongs to the core agent:
  - auth, API client, router, layout, workspace and audience;
  - primitives, states, chat, cards, pages and i18n.
- Areas:
  - `src/learner` (learners and parents);
  - `src/teacher`;
  - `src/centre`;
  - `src/coach` (the `/coach/<pack>` screens, which are also the Telegram Mini App);
  - `src/engage`.
- Import from core only through `src/core/index.ts`.

## Add a page, a nav item, a home card

Each area's `routes.tsx` exports three registries, and `App.tsx` merges them:

```tsx
// src/learner/routes.tsx
import { lazy } from 'react';
import { PenLine } from 'lucide-react';
import type { AreaNavItem, AreaRoute, HomeCard } from '../core/index.ts';

const WritingCoach = lazy(() => import('./WritingCoach.tsx'));   // keep pages lazy: learners are on weak phones

export const routes: AreaRoute[] = [
  { path: '/write', component: WritingCoach, title: 'learner.write.title', audiences: ['learner'], feature: 'L3' },
];
export const nav: AreaNavItem[] = [
  { id: 'write', path: '/write', label: 'learner.nav.write', icon: PenLine, audiences: ['learner'], feature: 'L3' },
];
export const homeCards: HomeCard[] = [
  { id: 'write', audiences: ['learner'], feature: 'L3', render: (me) => <WritingCard me={me}/> },
];
```

- **Routes:**
  - Area routes match before core routes, so `/tutor`, `/explain`, `/write` and `/speak` are yours to take over. Until then they open the general assistant.
  - Params use `:name`, for example `/coach/:pack`.
  - `feature` wraps the page in `PlanGate`, so a locked feature shows the paywall rather than disappearing.
  - `audiences` hides the page from other audiences (they see not found).
  - `focus: true` gives the dark-navy focus mode (the Studio editor, Live Quiz).
  - `public: true` makes a page open without signing in. Use it sparingly.
- **Nav items** show in the sidebar group named by `group`, or by the audience by default. Locked items still show; their page shows the paywall.
- **Home cards** appear under "Your tools" on that audience's home.
- **Keep your area out of the first download.** Every area's `routes.tsx` is imported up front, so anything it imports directly ships to every learner. Two ways to stay lazy:
  - **Icons by name:** give a nav item `icon: 'PenLine'` (a string) and export `icons`, a loader for a module of the icons you name. Core shows a blank of the same size until it loads, then the icon.
  - **Lazy home cards:** give a card `component: () => import('./WritingCard.tsx')` (default export `({ me }) => …`) instead of `render`. Core shows a placeholder while it loads, and nothing if the chunk fails.

  ```tsx
  // src/learner/routes.tsx: no lucide or card imports here
  export const icons = () => import('./icons.ts');        // export { PenLine, Mic } from 'lucide-react';
  export const nav: AreaNavItem[] = [
    { id: 'write', path: '/write', label: 'learner.nav.write', icon: 'PenLine', audiences: ['learner'], feature: 'L3' },
  ];
  export const homeCards: HomeCard[] = [
    { id: 'write', audiences: ['learner'], feature: 'L3', component: () => import('./WritingCard.tsx') },
  ];
  ```

  `render` and icon components still work, but their code is in the main chunk. With every area on names and lazy cards, the main chunk stays about 113 KB gzip.
- **Audiences** are `learner`, `parent`, `teacher` and `centre`. In a centre workspace they follow the role: student → learner, parent → parent, teacher → teacher, owner/admin → centre (and teacher). In the personal workspace they follow the plans, and the person can switch.
- **Navigation:** use `Link` and `navigate()` from core. Never put message text, answers or other student data in a URL; ids only.

## i18n

- Every visible string is a key in `src/<area>/i18n/en.ts`, `uz.ts` and `ru.ts`. All three have the same keys, typed from `en.ts`.
- Prefix keys with your area, for example `learner.write.title`. Core merges the catalogs; a missing translation falls back to English.
- Use `useT()` from core: `t('learner.write.cost', { count })`. Plurals are `{count|one:# credit|other:# credits}`; Russian also has `few` and `many`.
- Uzbek uses Latin script with `‘` for o‘ and g‘ and `’` for the tutuq belgisi.
- Core keys you can reuse include `state.*`, `chat.*`, `review.*` and `approvals.*`, plus `plans.<plan>.name`, `role.<role>` and `audience.<audience>`.
- No catalog ships in the first download, core's English included. Your `en.ts`, `uz.ts` and `ru.ts` load on demand: core's `i18n/index.ts` imports the person's language from core and every area in parallel, and the first paint waits for it. For Uzbek and Russian, English follows as the fallback. So however many areas merge, the main chunk stays about 103 KB gzip for core alone.
  - Keep the named exports `en`, `uz` and `ru`.
  - Never import your catalog files from code; that pulls them into the first download.
- **Dates:** use `useI18n().date(value, options)` from core (`src/core/index.ts`), or `formatDate(locale, value, options)` from `src/core/dates.ts`. Never call `Intl.DateTimeFormat` or `toLocaleDateString` yourself. Many browsers have no Uzbek date data and print "2026 M10 30", so core writes Uzbek dates out with Latin names, for example "30-oktabr, 2026" and "juma, 30-oktabr, 2026, 14:05".
- **Strings only some screens need** can load with those screens: `const ready = useCatalog('learner.essay', { en: () => import('./i18n/essay.en.ts').then((m) => m.en), uz: …, ru: … })`, and render `LoadingState` until `ready`. Use your area prefix for these keys too.
- **Context sources** under answers are named by the provider's `label` (function `CONTRACT.md`); use `contextLabel(me, t, kind)`. Core keeps `context.<kind>` keys only for its own kinds.

## Building blocks from core

| Export | Use |
|---|---|
| `api(path, { method, body, query, workspaceId, idempotencyKey, anonymous })` | JSON calls to `/schood-ai/<area>/<action>`. Pass `useWorkspace().workspaceId` (null means personal). Errors are `ApiError` with `code` and `details`. `anonymous: true` calls a route marked `anonymous` with no token, for pages that work signed out (Live Quiz players, shared Passport links). Over the route's limit the error is `rate_limited` with `details.retry_after`: wait until then (a polling player slows down) instead of retrying at once. |
| `stream(path, { body, onEvent, signal, workspaceId })` | SSE calls. |
| `Chat` | A streaming chat with any specialist: `<Chat specialist="tutor" threadId={id} onThread={…} initialMessage={…}/>`. Includes stop, retry, report, cost before sending and the paywall. |
| `Answer` | AI text as Markdown with KaTeX (`\( \)`, `\[ \]`). Raw HTML is dropped and remote images are not loaded. |
| `ReviewCard`, `GenerationReviewCard`, `useGeneration` | Approve & save / Decline for drafts, polling a generation job. |
| `ApproveRunCard` | Approve & run for a queued action, showing the server's exact payload. |
| `CreditCost`, `CreditBalance`, `PlanGate`, `Paywall` | Cost before every action (from the ai-core price table) and plan gates. |
| `ApiErrorState`, `CappedState`, `ErrorState`, `EmptyState`, `LoadingState` | Every AI screen shows refusals with `ApiErrorState`, never a broken screen. `consent_required` (the learner area's one-time step) shows a translated note that links to `/consent?next=<this page>`. A centre whose plan no longer includes its own model keys gets `plan_required` with `feature: 'C15'` and `plans: ['enterprise']`; the centre's key settings screen should say so and offer to remove the keys. |
| `Button` (`primary`, `secondary`, `ghost`, `spark`, `danger`, `onDark`) and the other primitives | `Card`, `PageHeader`, `Eyebrow`, `Badge`, `SparkMark`, `Thinking`, `Field`, `TextInput`, `TextArea`, `Dialog`, `FocusSurface`, `BrandMark` |
| `useWorkspace()` | `me`, `workspaceId`, `audience`, `access(featureId)`, `refresh()`. |
| `askAssistant(prompt)` | Opens the assistant with a prefilled prompt, without putting it in the URL. |

## Core screens you can link to

- `/settings/assistants`: owners and admins tailor the assistants of the workspace (your specialists appear there automatically).
- `/admin`: the Schood AI console, shown in the sidebar only to Schood admins.
- `/settings` → Notifications: the person's time zone, quiet hours, messages a day, best hour, delivery (Telegram, in-app inbox) and the kinds they get. Register your kinds on the function side (`registerNotifyKind`).
- `/settings` → Your branding (personal workspaces): a teacher's own logo and name, printed on `/library/:id/print`.
- `/settings` → Your data: "Delete my conversation history" (every workspace). Conversations are kept for 180 days. Closing the Schood account erases the personal workspace and the person's Schood AI data. Centre pages stay. A centre owner must hand the centre over first. Tables your area adds register for erasure as the function `CONTRACT.md` describes.
- `/library`, `/library/:id`, `/library/:id/print`: below.

## The library (pages, editor, print)

The library belongs to core. Teacher and centre save materials into it and link to it; they do not build their own.

- **Routes:** `/library` (folders, search, list), `/library/:id` (the editor), `/library/:id/print` (print and PDF with the workspace's logo). They are in the sidebar for the teacher and centre audiences.
- **Components:**
  - `<LibraryView kind? folder? onOpen? readOnly?/>`: a list for your own screens, for example only `kind="worksheet"`;
  - `<PageEditor pageId onSaved? onDeleted?/>`: TipTap with slash commands, revision-checked autosave, version history, sharing and export;
  - `<PrintView pageId/>`.
  - All three load on demand, so importing them adds almost nothing to your area's code; the document editor (TipTap) loads only when a page is edited.
  - A body with maths, images, raw HTML or footnotes opens in Markdown source mode (the document editor would drop them); people can switch modes.
- **Calls:** `createPage({ kind, title, material, folder, source_generation_id })`, `getPage`, `listPages`, `savePage(id, { expected_revision, … })`, `exportPage(id, 'telegram')`, `listFolders`, `pageRevisions`, `restorePage`, `duplicatePage`, `deletePage`. When a save hits a newer revision, `conflictPage(error)` returns the current page.
- **Material kinds:** call `registerMaterialKind({ kind, label, icon?, toMarkdown, render?, fromMarkdown?, editing?, editorPath? })` in your `routes.tsx` at module load.
  - `toMarkdown` is the same function the server uses; define it once in `packages/ai-core`.
  - `render` draws the material read-only and for print: for people who may read but not edit, for `editing: 'readonly'` kinds, and on `/library/:id/print`. People who may edit a `document` kind see the document editor.
  - `fromMarkdown` rebuilds the material after the document is edited. If it is absent, the document becomes the source and the material is kept as it was.
  - `editing: 'readonly'` keeps a material out of the generic editor; give an `editorPath` to your own screen.
- **Telegram:** export text comes from `toTelegramText()` in ai-core, or from your kind's `toTelegram`.
- **Chat answers:** staff whose plan includes the library see "Save to library" under each assistant answer; it creates a `chat_answer` page.

## Look and feel (main platform)

- **Colours:**
  - navy `#0f172a` (`bg-navy`, border `border-navy-line`);
  - cream `bg-cream`, `bg-cream-soft`, `bg-cream-deep`;
  - lime `bg-lime`, `bg-lime-soft`;
  - sky `bg-sky-ai`.
- **Type:** Manrope for text, Sora for headings (`font-display`).
- **Shapes:** pill buttons; `rounded-3xl` cards with a hairline navy border.
- **The AI touch:**
  - the `spark` button and `SparkMark` go on AI actions only;
  - `Thinking` is the waiting state;
  - the lime-to-sky gradient stays an accent, never a background for text-heavy screens.
- **Centre branding:** use `me.workspace.branding` (`logo_url`, `primary_color`, `accent_color`, `assistant_name`) through `BrandMark` and the workspace card. Never build URLs or styles from unchecked values; the function cleans them.
- **Quality bar:**
  - works on a 375px phone with no horizontal scroll;
  - labels on every control;
  - visible focus, keyboard use;
  - loading, empty, error and capped states;
  - every string in uz, ru and en.

## Sign-in and the Telegram Mini App hook

- **Session client:** `src/core/session.ts` exports `auth`, an `AuthClient` from `@supabase/auth-js` with the shared cookie storage. Use it (for example `auth.setSession(...)` in a Mini App source); do not import `@supabase/supabase-js` or `packages/assessment-web/src/client.ts`, which add about 35 KB gzip of realtime, storage and REST code to the first download.
- **Default:** the shared `.schood.online` session cookie, the same as the platform and every Schood app. "Sign in" goes to `schood.online/auth?returnTo=…`, so `ai.schood.online` must be in `VITE_ALLOWED_RETURN_HOSTS` (it is).
- **Telegram Mini App:** the coach agent calls `registerSessionSource(source, priority)` before render. Its `detect()` is true inside Telegram (`window.Telegram.WebApp.initData`). It exchanges the init data for a Schood session through a function route, then provides `token()`, `observe()`, `signIn()` and `signOut()`. The API client uses whichever source is active. That route checks Telegram's signatures and then calls `ctx.auth.sessionFor(userId, { reason: 'coach.mini_app' })` (function `CONTRACT.md`); no area keeps its own auth admin client.
- **Embedding:** `public/_headers` currently forbids framing (`X-Frame-Options: DENY`, `frame-ancestors 'none'`). Telegram's web client shows Mini Apps in an iframe, so the coach agent must add a `/coach/*` rule that removes `X-Frame-Options` and allows `frame-ancestors https://web.telegram.org`. Keep the universal `/*` rule unchanged; `test:pages:security` checks it.

## Shared files you may touch (additive edits only)

| File | What you may change |
|---|---|
| `src/<your area>/**` | Your own code |
| `public/_headers` | Path rules your screens need (see above) |
| `apps/schood-ai/package.json` | Dependencies your area truly needs. The lockfile is updated with `npm install`; tell the core agent. |

Everything in `src/core`, `App.tsx`, `main.tsx` and `index.css` belongs to the core agent. Ask for a new core building block rather than copying one.

## Build and check

`npm --workspace apps/schood-ai run build`, which runs `tsc --noEmit` and then `vite build`.

Keep the first download small: the main chunk is about 113 KB gzip. Load heavy screens and libraries on demand (`lazy(() => import(...))` in your `routes.tsx`), as core does for the library editor and the admin console. Name your nav icons and make your home cards lazy (see Add a page, a nav item, a home card).

For a local run with no backend, start the real handler over the memory repository with a fake streaming model:

```
deno run --no-lock --allow-net --allow-read --allow-env scripts/schood-ai-dev-stack.ts
VITE_SUPABASE_URL=http://localhost:54329 VITE_SUPABASE_ANON_KEY=dev npm --workspace apps/schood-ai run dev
```

To sign in, set the cookie from `http://localhost:54329/dev/cookie?token=dev-plus` on `http://localhost:5190`. The other tokens are `dev-teacher`, `dev-owner` and `dev-free`.
