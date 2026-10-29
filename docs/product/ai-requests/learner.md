# Learner area: requests to core

Requests from the learner and parent area (`claude/ai-learner`) to the core agent. Each one lists the small workaround in the learner area that can be deleted once core provides the change.

## 1. A handle for an area's own tables

- **Need:** `RequestContext` has no access to an area's own tables, only to `ctx.repo` (core tables).
- **Workaround:** `learner/store.ts` binds a learner store to the core repository object (`bindLearnerStore`). Tests and dev stacks bind a memory store. The deployed function builds a Postgres store from `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on first use, in `learner/store-postgres.ts`, which is loaded lazily so tests never fetch the client.
- **Ask:** something like `ctx.db` (the service-role client) plus a test hook, or a per-area repository registry with memory twins.

## 2. A guard hook before `core/chat`

- **Need:** the under-18 consent step must hold before a minor chats. The learner routes enforce it on the server (`consent_required`). `core/chat` serves the `tutor` specialist and the general assistant, and it cannot ask the learner area first.
- **Workaround:** the `/tutor` page wraps the chat in `ConsentGate`, so the check is client-side for chats only.
- **Ask:** an optional `guard(ctx)` on `registerSpecialist`, or a global pre-chat hook areas can register, that may throw a `SchoodAIError`.

## 3. Plan sources that need another person's plans

- **Need:** Plus Family gives each linked child Plus while the parent holds Family. `PlanSourceInput` has no product-id config, so the source cannot tell which product is Family.
- **Workaround:** the learner store config reads `SCHOOD_AI_FAMILY_PRODUCT_ID` itself, and `repo.productsHeldBy(parentId)` checks it.
- **Ask:** pass the plan → product map (or a `plansOf(userId)` helper) to plan sources.

## 4. Core tests that pin area registrations

These core tests assumed no area registers specialists or context providers:
- `handler.test.ts` ("free users browse…") listed exactly `[['assistant', false]]`. I changed it, minimally, to "the assistant is first and none are usable".
- `specialists.test.ts` pins `custom_context_kinds` to `['learner_profile']`, and expects a centre student to see no specialist after narrowing. To keep it green without editing it:
  - the learner context providers are self-view only, not `allowCustom`;
  - the `tutor` specialist is limited to personal workspaces. In a centre, the branded Student Assistant (C2) is the tutor. `/tutor` picks `student_assistant` there once the centre area registers it.
- **Ask:** make these tests tolerant of area registrations, so learner providers can be readable by a workspace's custom assistants if wanted.

## 5. Context labels in the chat

- **Need:** `Chat` labels sources as `context.<kind>`, outside any area prefix.
- **Workaround:** the learner catalogs define `context.learner_prediction`, `context.learner_activity`, `context.learner_snapshot`, `context.centre_homework` and `context.centre_feedback`. The kinds are the learner area's own, so the keys cannot collide.
- **Ask:** let providers pass a translated title, or look up `<area>.context.<kind>`.

## 6. First-download size

- **Need:** the learner English catalog is about 8.8 KB gzip. Core loads every area's English catalog eagerly, so the main chunk went from about 112 KB to 122 KB gzip. All learner pages are lazy.
- **Ask:** load each area's English strings with its routes, or allow a per-route catalog chunk.

## 7. `centre_rules` (from the centre area)

- **Need:** the homework helper (L7) reads `ctx.context(['centre_rules'], { ref: assignment_id })`. It expects `{ homework: { default?: 'hints_only' | 'explain' | 'off', assignments?: { [id]: rule } }, focus_topics?: string[] }`.
- **Default:** without a provider, hints only.

## 8. Centre parent switch (for the centre area)

- **Need:** P1 and P2 in a centre need the centre to switch them on. The learner area reads `settings.features.parent === true` or `settings.features['parent.brief'] === true`. Switches default to on, but the doc says "when the centre enables it", so the learner area requires an explicit `true`.
- **Ask:** the centre admin should expose that switch.
