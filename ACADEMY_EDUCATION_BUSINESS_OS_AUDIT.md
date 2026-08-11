# SCHood Education Business OS — Codebase Audit and Implementation Map

Audit date: 2026-08-10
Audited snapshot: `codex/academy-lms-competence` release candidate, including the Academy LMS competency work in this worktree.
Scope: Academy application, Academy Edge Function, Supabase Academy and shared-platform migrations, tenancy/RBAC/RLS, payments/entitlements, classrooms/contacts, notifications/Telegram, audit, domain events, and scheduled/background processing.

> Historical baseline: this document records the pre-expansion audit used to plan the implementation. Do not read its baseline statuses as current. The current 62-requirement traceability verdict is in `ACADEMY_BUSINESS_OS_REQUIREMENT_MATRIX.md`, and the service/journey view is in `ACADEMY_SERVICE_MAP_AND_33_STEP_PROOF.md`; the backend production phase is deployed while the frontend release remains gated.

## Executive verdict

SCHood has a real, working education-delivery core. It is not a dummy LMS: Academy already has tenant-aware workspaces, contacts, classrooms, roster/enrollment states, schedules, attendance, curriculum, lessons, quizzes, assignments, gradebook/rubrics, payments, entitlements, communications, notifications, audit, action items, and role-aware server endpoints.

It is not yet a full Education Business Operating System. The acquisition, commercial ledger, branch operations, staff economics, guardian, retention-case-management, and business-intelligence domains requested in the expansion specification are mostly missing or represented only by metadata-derived views. The existing Education OS screen is useful operational aggregation, but it cannot substitute for the missing source-of-truth domains.

The correct path is an incremental modular-monolith expansion around the current Academy, not a rewrite and not a second disconnected system.

## A. Existing capability map

Status meanings:

- **COMPLETE** — implemented as a durable domain with working server behavior and appropriate UI/tests for the current requirement.
- **PARTIAL** — useful implementation exists but material required behavior is absent.
- **SKELETON** — a placeholder, derived view, or narrow primitive exists but not a competent domain.
- **MISSING** — no meaningful implementation found.
- **CONFLICTING** — current behavior/model would undermine the requested result unless migrated.

### Existing foundation detail

| Capability | Status | Repository evidence and limitation |
|---|---|---|
| Shared authentication and Academy tenancy | COMPLETE | Supabase Auth plus tenant memberships, center links, staff/grant access, server membership resolution. |
| Owner/admin/center/teacher/student workspaces | COMPLETE | Role-aware Academy routes and server permissions exist. Parent workspace does not. |
| Permission matrix | PARTIAL | Strong education/finance/roster/reporting permission booleans exist; admissions, cashier, payroll, guardian, intervention, reconciliation, and branch-scoped permissions do not. |
| RLS | PARTIAL | Academy tables enable RLS, but many policies only distinguish generic member/admin. They do not enforce classroom-, student-, branch-, or finance-specific scope. The service-role Edge layer supplies stronger checks, so direct-table policy parity remains incomplete. |
| Tenant-safe relational integrity | PARTIAL | New curriculum tables use academy-aware validation, but older Academy tables generally use single-column foreign keys beside a separate `academy_id`, allowing inconsistent cross-tenant references if privileged code is wrong. |
| Audit trail | PARTIAL | `academy_audit_events` and access audit logs exist; coverage is action-by-action and records can still be deleted with their academy. Financial immutable history is absent. |
| Contacts/classrooms/rosters/enrollment | COMPLETE | First-class contacts, classrooms, classroom memberships, validated enrollment lifecycle, schedules, resources, and communications exist. |
| Curriculum and student learning | COMPLETE | The current worktree adds courses/modules/lessons, prerequisites, availability, progress, native quizzes, assignment linkage, categories, rubrics, and student curriculum routes. |
| Native assessment and gradebook | COMPLETE | Objective/manual grading, attempt/time rules, server validation, weighted gradebook, rubrics, feedback, and audit are present in the current worktree. |
| Payments and entitlements | PARTIAL | Click checkout, provider IDs/status, idempotent entitlement application, classroom grants, and manual non-Click settlement exist. No subscription/charge/allocation/balance/debt ledger exists. |
| Reporting/action queues | PARTIAL | Grade, attendance, parent report tokens, at-risk heuristics, owner dashboard, action items, and derived insights exist. Business metrics and case-management history do not. |
| Infrastructure | COMPLETE | Supabase, Edge Functions, storage, Click, SMTP, OpenRouter integration points, and Cloudflare Pages are established. |

### Numbered requirement classification

| # | Requirement | Status | Finding |
|---:|---|---|---|
| 1 | Preserve existing SCHood foundation | COMPLETE | The expansion can build on the existing tenant/LMS/payments platform; the current LMS work must remain intact. |
| 2 | Make the full business lifecycle central | MISSING | Lifecycle is not represented end-to-end by source-of-truth records. |
| 3 | Acquisition/admissions CRM | MISSING | Contacts and referrals exist, but no lead aggregate, ownership, attribution, tags, probability, or loss/conversion record. |
| 4 | Configurable sales pipeline and history | SKELETON | Contact `metadata.lifecycle_stage` and a derived pipeline screen exist; there are no pipeline/stage/history tables or validated stage graph. |
| 5 | Follow-up management | SKELETON | Some generated action items resemble follow-ups; no first-class activity/follow-up domain, method, outcome, assignee, or stale-lead queries. |
| 6 | Trial lessons | MISSING | Contact `status='trial'` and a fixed automation label are not trial bookings, capacity, attendance, teacher feedback, or conversion. |
| 7 | Lead conversion and attribution | MISSING | No atomic conversion service links lead, contact, guardian, enrollment, source, salesperson, and commercial value. |
| 8 | Branches | MISSING | `center_tenant_id` links ownership but is not an academy branch hierarchy. |
| 9 | Rooms and capacity | MISSING | Classrooms are learning groups, not physical rooms. No room capacity or collision constraints exist. |
| 10 | Classroom economics | MISSING | No group revenue/cost/margin model. |
| 11 | Billing engine separation | CONFLICTING | Current `academy_offers` plus `academy_payments` directly create entitlements. A compatibility layer must separate pricing plan, subscription, charge, receipt, allocation, balance, and entitlement without breaking Click. |
| 12 | Student subscriptions | MISSING | Offer duration and entitlements are not subscription contracts with lifecycle/history. |
| 13 | Discounts | MISSING | Global product coupons exist elsewhere, but Academy tuition discounts with approvals/reasons/scope/history do not. |
| 14 | Charges/invoices/balances and immutable ledgers | MISSING | No Academy receivable or allocation ledger exists. Existing payments are mutable status rows. |
| 15 | Debt management | MISSING | Pending payments are not authoritative debt, aging, promises, or collection history. |
| 16 | Cashier operations | MISSING | No cashboxes, shifts, receipt sequence, opening/closing, discrepancy, or cashier journal. |
| 17 | Provider reconciliation abstraction | PARTIAL | Click reconciliation and idempotent callbacks exist, but no provider-neutral receipt/reconciliation contract or exception queue. |
| 18 | Freezes, pauses, makeup and compensation | MISSING | Enrollment pause exists; subscription freeze and financial/schedule consequences do not. |
| 19 | Compensation models | MISSING | Staff records contain roles only. |
| 20 | Payroll | MISSING | No periods, calculation snapshots, approval, adjustments, or payout records. |
| 21 | Teacher economics/performance | SKELETON | Academic outcomes can be derived, but cost, utilization, retention, and compensation cannot. |
| 22 | Staff performance | MISSING | No sales activity/conversion/collection/task-performance attribution. |
| 23 | Guardian domain | MISSING | Parent report tokens exist, but guardians, relationships, custody/communication rules, and guardian accounts do not. |
| 24 | Telegram-first parent experience | PARTIAL | Secure one-time user linking and Telegram sending exist for users/students. There is no guardian link, child scoping, parent commands, or Academy consent history. |
| 25 | Notification preferences | PARTIAL | User-level Telegram preferences exist, but no Academy/contact/guardian channel consent, locale, topic, or per-child preferences. |
| 26 | Explainable retention risks | SKELETON | Attendance/missing-work heuristics create alerts/actions. No persisted multi-signal evaluation, factor evidence, score version, payment/engagement/churn dimensions, or history. |
| 27 | Interventions | MISSING | Alerts/action resolution is not an intervention case with owner, plan, contacts, outcomes, and follow-up history. |
| 28 | Renewal workflow | SKELETON | Expiring entitlements generate derived actions; no renewal opportunity/state/history/outcome. |
| 29 | Business dashboard | PARTIAL | Owner dashboard has Academy counts and current payment metrics, not funnel, receivables, collections, payroll, margin, retention, or forecast. |
| 30 | Branch comparison | MISSING | Branches do not exist. |
| 31 | Unit economics | MISSING | No cost or allocation model. |
| 32 | Attribution analytics | MISSING | Referral leaderboard is narrower than source/campaign revenue attribution. |
| 33 | Operations inbox | PARTIAL | `academy_action_items` provides a unified queue and dedupe key, but lacks assignment/team/branch/SLA/activity links and much of the required source data. |
| 34 | Bounded automation | PARTIAL | Fixed rule keys, channel, and one threshold exist. There is no typed trigger-condition-action definition, versioning, execution ledger, dry run, or broad event input. |
| 35 | AI assistance with human review | SKELETON | OpenRouter-assisted lesson planning exists. No governed business-assistance workflow, evidence packet, approval, or non-autonomous guardrails for this scope. |
| 36 | Global search | MISSING | No Academy-wide, permission-filtered search across leads/students/guardians/groups/finance. |
| 37 | Imports | PARTIAL | Bulk email invites exist; no preview/dry-run/mapping/error-file imports for leads, students, balances, attendance, or payments. |
| 38 | Expanded audit | PARTIAL | Audit primitives exist, but complete business/finance coverage, before/after context, request/idempotency correlation, exports, and retention controls are absent. |
| 39 | Expanded RBAC | PARTIAL | Roles and education permissions exist. Required admissions, branch, cashier, debt, payroll, guardian, analytics, reconciliation, and intervention permissions are absent. |
| 40 | Tenant safety | PARTIAL | Request-level Academy scoping is strong. Older relational FKs and generic RLS do not fully encode tenant and role scope at the database boundary. |
| 41 | Strong relational modeling | PARTIAL | Education schema is relational; current lifecycle-stage metadata and finance shortcuts conflict with this requirement. |
| 42 | State machines | PARTIAL | Enrollment transitions are validated; payment status handling exists. Lead/trial/subscription/charge/payroll/intervention/renewal state machines do not. |
| 43 | Event architecture | PARTIAL | A reliable idempotent domain outbox/worker exists for assessment/language events. Academy business commands do not yet emit normalized business events. |
| 44 | Product information architecture | PARTIAL | Current ten-view navigation is coherent for LMS operations but cannot expose the requested domains without regrouping. |
| 45 | Role-specific experiences | PARTIAL | Owner/admin/center/teacher/student experiences exist; branch manager, salesperson, cashier, accountant, HR/payroll, and parent experiences are incomplete or absent. |
| 46 | Mobile-first operations | PARTIAL | Current app is responsive, but new high-frequency lead, trial, payment, debt, parent, and task flows do not exist to validate. |
| 47 | Uzbekistan localization | PARTIAL | UZS and Asia/Tashkent are defaults, preferred locale exists globally, but Academy UI strings and business reference values are mostly English and phone normalization is not centralized. |
| 48 | Competitor parity | MISSING | Strong LMS differentiator exists, but expected CRM, billing/debt, branch, payroll, and parent features are not at parity. |
| 49 | SCHood differentiation | SKELETON | Education, engagement, and payment facts coexist, enabling future unified intelligence, but the business sources and metric layer are missing. |
| 50 | Avoid feature chaos/duplicates | PARTIAL | Existing concepts have now been mapped; future implementation must extend contacts, classrooms, payments, entitlements, action items, notifications, audit, and outbox rather than duplicate them. |
| 51 | Phased implementation | MISSING | This document establishes the required dependency-aware phases; implementation follows it. |
| 52 | P0/P1/P2 priority order | MISSING | Must be enforced by implementation order; P0 foundation/commercial work precedes advanced AI. |
| 53 | Safe database migrations | PARTIAL | Repository convention is additive timestamped SQL, but the new domains/backfills/constraints do not exist yet. |
| 54 | Server-side business logic | PARTIAL | Current Academy mutations are server-side; requested domain services and finance calculations are absent. |
| 55 | Idempotency | PARTIAL | Click/application and action dedupe exist; charges, renewal, automation executions, payroll, imports, and external reconciliation need idempotency. |
| 56 | Critical test coverage | PARTIAL | Strong Academy/LMS readiness, Edge, RLS, schema, smoke, and browser suites exist; requested CRM/ledger/payroll/guardian/retention lifecycle tests do not. |
| 57 | 33-step acceptance journey | MISSING | Steps 13 and 16–22 are substantially supported; acquisition, commercial contract, guardian, payroll, intervention, and renewal make the full journey impossible today. |
| 58 | Six-engine product model | PARTIAL | Education is strong; Operations and Relationships are partial; Growth, Revenue, and Intelligence are below the requested level. |
| 59 | Audit before coding | COMPLETE | This document supplies A–G before new expansion schema or code is added. |
| 60 | End-to-end vertical slices | MISSING | Required implementation method begins after this audit. |
| 61 | Operational quality bar | PARTIAL | Teachers/students can answer many education questions; owners/operators/parents cannot answer most commercial and retention questions. |
| 62 | Product principle | MISSING | The product does not yet run the whole business from prospect to renewal. |

## B. Reusable architecture

The following systems should be extended, not replaced:

| Existing system | Keep | Extend with |
|---|---|---|
| `tenants`, memberships, center-owned Academy links | Academy identity and ownership | Academy branches beneath an Academy, branch assignment and scope; do not model each branch as a new tenant. |
| `academy_contacts` | Canonical person/student contact | Conversion references, guardian links, normalized contact methods; do not create a second learner entity. |
| `academy_classrooms` and memberships | Canonical teaching group and roster | Branch/room/course placement, capacity, commercial subscription link, economics; do not use classroom as a physical room. |
| enrollment membership lifecycle | Student-to-group lifecycle | Link converted lead/enrollment/subscription and preserve state history. |
| Academy courses/lessons/quizzes/assignments/gradebook | Education engine | Consume enrollment/entitlement/risk/guardian events; no rewrite. |
| `academy_offers` and offer grants | Sellable Academy catalog and entitlement recipe | Treat as legacy pricing-plan/catalog compatibility while introducing versioned pricing plans and subscriptions. |
| `academy_payments` and Click flow | Provider attempt/receipt compatibility and checkout | Introduce provider-neutral receipts, immutable allocations, reconciliation, and a controlled bridge so confirmed Click payment creates one receipt before entitlement. |
| `academy_entitlements` | Access grants | Make subscription/settled allocation the source; retain idempotent grant key and membership sync. |
| `academy_action_items` | Unified operational queue | Add branch, assignee/team, related entity, SLA, outcome/activity trail, and event-driven generation. |
| `academy_automation_rules` | Automation configuration root | Add typed/versioned trigger-condition-action definitions and immutable execution log. |
| `academy_notifications`, Telegram sender/linking | Delivery queue and transport | Add recipients, guardian/contact preferences, templates/locales, consent, idempotency, and parent-scoped payloads. |
| `academy_audit_events` and access logs | Academy audit stream | Add command/request/idempotency correlation, before/after summaries, finance protections, and coverage. |
| `domain_event_outbox` and worker | Transactional event delivery primitive | Add Academy/tenant fields or tenant-scoped payload contract, business event allowlist, handlers, retry/DLQ observability. |
| Academy Edge Function | Authenticated modular-monolith API boundary | Split internal domain modules as size grows while preserving one deployed function initially. |
| Academy React application | Shared design system, routing, responsive shell | Regroup navigation by domain and add mobile card/action patterns. |

## C. Missing domains and required surfaces

| Domain module | Core tables | Server/API operations | Primary UI |
|---|---|---|---|
| Organization | branches, rooms, room closures/capacity | create/update branch/room, validate schedule collision | Branches, rooms, capacity |
| Admissions | lead sources/campaigns, pipelines/stages, leads, stage history, activities/follow-ups, trials | create/assign/transition lead, record activity, schedule/complete trial, convert lead atomically | Leads, Kanban pipeline, follow-ups, trials |
| Commercial | pricing plans/versions, subscriptions, freezes, charges, discounts | create subscription, generate charge, freeze/resume/renew | Plans, subscriptions, charges |
| Receivables | payment receipts, allocations, credits/adjustments/refunds/write-offs, balance view/snapshot | record/reconcile/allocate/refund/adjust with idempotency | Payments, balances, debtors, reconciliation |
| Cashier | cashboxes, shifts, cash movements, receipt sequence | open/close shift, collect, deposit, reconcile discrepancy | Cash desk, shift close |
| Workforce | compensation rules, payroll periods/runs/lines/adjustments/payouts | calculate, recalculate draft, approve immutable snapshot, pay | Compensation, payroll, staff performance |
| Guardians | guardians, student relationships, guardian accounts/links, consents/preferences | connect guardian, invite/link securely, authorize child scope | Parents, child status, communication settings |
| Retention | risk definitions/evaluations/signals, intervention cases/activities, renewal opportunities/history | evaluate risk, create/assign/resolve intervention, start/close renewal | Risks, interventions, renewal queue |
| Intelligence | metric facts/snapshots or stable reporting views | funnel/attribution/economics/retention/branch queries | Owner dashboard, comparisons, drilldowns |
| Platform support | automation definitions/executions, event subscriptions, import jobs/rows, search documents | dry-run/execute automation, import preview/commit, scoped search | Automation builder, imports, global search |

## D. Architectural conflicts and decisions

1. **Contact metadata is being used as a pipeline.** `metadata.lifecycle_stage` is mutable and has no history. It must become a compatibility projection of the lead/enrollment/renewal domains, not their source of truth.
2. **An offer/payment/entitlement shortcut is being used as billing.** It cannot represent recurring obligations, partial allocation, credit, debt, freeze, discount, refund, or transfer. Existing Click payments must bridge into a new immutable receipt/allocation model before entitlement, without launching a second unrelated checkout.
3. **Classroom is overloaded in product language.** It is a teaching group. Physical branches and rooms must be separate entities linked to groups/schedule sessions.
4. **Staff classroom scope is stored as JSON.** This works for the current role layer but is insufficient for branch-scoped finance/cashier/payroll. New scope assignments should be relational while existing grants remain compatible.
5. **Generic RLS and service-role APIs diverge.** The Edge Function validates finer permissions while table RLS often allows any Academy member to read. Sensitive new tables need permission-aware RLS helpers and all client access should remain through the server API.
6. **The Academy Edge Function is already very large.** New domain logic should be placed in shared Academy domain modules and invoked by the router; keep the deployable modular monolith rather than splitting premature microservices.
7. **Current automation is configuration without execution history.** A generic rule JSON blob alone would become unsafe. Use typed allowed triggers/conditions/actions, version records, dry-run evaluation, idempotent execution keys, and audit.
8. **Current action items lack case history.** Reuse them as tasks, but interventions and renewal opportunities remain first-class cases that can generate tasks.
9. **Current Telegram linking is user-centric.** Guardian linking requires one-time tokens tied to a guardian relationship and child scope. Chat ID or username alone must never establish guardian access.
10. **English strings are embedded in UI and some business values.** Stable machine keys should remain in the database, with localized display labels in the app/template layer.

## E. Security review

### P0 findings

1. Older Academy relationships do not consistently enforce `(academy_id, referenced_id)` together. New migrations must add composite uniqueness and tenant-aware foreign keys after orphan/mismatch preflight checks and safe backfills.
2. `is_academy_member`/`is_academy_admin` RLS helpers only inspect tenant membership. Role grants, center ownership, classroom/student scopes, branch scopes, and individual permissions are enforced mostly in the service layer. Sensitive new domains need explicit RLS helpers and negative tests.
3. Academy financial rows cascade with academy deletion and payments are mutable. New ledger/audit records need restrictive deletion semantics, reversals instead of edits, and immutable triggers after posting.
4. Current direct `mark_payment_paid` is permitted for non-Click providers and immediately grants access. In the new model it must post a receipt, allocate it, and only then drive entitlement. Manual settlement needs cashier/accounting authority, evidence, idempotency, and audit.
5. Domain outbox events are global and not Academy-scoped. Business events must carry tenant identity and consumers must reject cross-tenant aggregate mismatches.
6. Guardian/parent data is absent. When added, student relationship authorization, minimized payloads, consent, secure one-time linking, revocation, and no username-only trust are mandatory.

### Required negative tests

- Cross-academy create/read/update/delete for every new table and every referenced foreign key.
- Teacher, salesperson, cashier, accountant, branch manager, and guardian attempts outside permission/scope.
- Cross-branch finance/payroll access where restricted.
- Arbitrary lifecycle status mutation and invalid state transitions.
- Duplicate command/idempotency keys for conversion, charge generation, receipt posting, allocation, renewal, payroll, automation, and imports.
- Ledger update/delete after posting and attempts to create unbalanced/over-allocated entries.
- Guardian linking to an unrelated child, reused/expired token, revoked relationship, and leaked financial/academic fields.

## F. Migration plan

All migrations are additive and backward-compatible for one frontend deploy. No existing Academy table or route is dropped during the expansion.

1. **Foundation integrity:** add tenant-safe composite keys/constraints where safe; introduce branch/room, reference data, pipeline, lead, history, activity, trial, and conversion records. Backfill a default main branch for each Academy where needed.
2. **Commercial ledger:** introduce pricing-plan versions, subscriptions, charges, discounts, receipts, allocations, adjustments, and balance/debt views. Backfill legacy offers/payments as compatibility references without fabricating historical obligations.
3. **Click bridge:** on confirmed legacy Academy payment, idempotently post one provider receipt and allocation, then apply entitlement. Keep existing callback contract until consumers migrate.
4. **Operations/economics:** add cashier, schedule sessions/room binding, compensation, payroll, and immutable approval snapshots.
5. **Relationships:** add guardians, relationships, secure link tokens, consent and preferences; connect parent reports and notifications.
6. **Retention:** persist risk definitions/evaluations/signals, intervention cases/activities, renewal opportunities/history, and task links.
7. **Events/automation/intelligence:** extend outbox event contract, automation executions, imports/search, metric views/snapshots, and analytics APIs.
8. For every phase: enable RLS, add indexes, define deletion behavior, backfill, add constraint validation, verify cross-tenant rejection, and update the schema/readiness contract.

## G. Dependency-aware implementation roadmap

### Phase A — P0 foundation and Growth engine

- Branch and room hierarchy with a default branch and capacity rules.
- Extensible lead sources and Academy-specific pipeline/stages.
- Lead aggregate, ownership, tags, attribution, and validated pipeline history.
- Follow-up/activity and trial scheduling/feedback/state transitions.
- Atomic, idempotent lead conversion into existing contact/enrollment records.
- Server permissions, audit, domain events, action-item generation, mobile UI, and tenancy/state tests.

### Phase B — P0 Revenue engine

- Versioned pricing plans and subscriptions linked to contacts/enrollments.
- Immutable charges, receipts, allocations, adjustments, discounts, balances, and aging.
- Partial/overpayment/credit/refund/write-off/transfer and freeze/renewal rules.
- Provider-neutral reconciliation plus Click compatibility bridge.
- Finance permissions/RLS, audit, idempotency, entitlement sequencing, and ledger tests.

### Phase C — P1 Operations and staff economics

- Cashboxes and shifts, cash collection and discrepancy/reconciliation.
- Room/session capacity and branch/classroom utilization/economics.
- Versioned compensation rules and payroll draft/approval/payout snapshots.
- Payroll privacy, branch scope, audit, formula and historical-integrity tests.

### Phase D — P1 Academic operations and capacity

- Actual lesson sessions linked to branch, classroom, teacher, room/mode, and academic calendar.
- PostgreSQL-enforced teacher, room, and classroom conflict prevention.
- Teacher/room availability, holiday/closure enforcement, substitutions, rescheduling, and cancellation evidence.
- Session attendance, exceptions, make-ups/transfers/extensions/credits, and quality observations.
- Available, occupied, unused, utilization, peak-period, classroom-fill, and attendance capacity signals.

### Phase E — P1 Relationships

- Guardian and student-guardian relationships, consent and contact priority.
- Secure Telegram guardian linking and revocation.
- Parent-scoped status, attendance, grades, homework, schedule, balance, and messaging.
- Topic/channel/locale/quiet-hour preferences, templates, delivery idempotency, and privacy tests.

### Phase F — P1 retention, renewal, and intelligence

- Versioned explainable risk definitions and stored evaluations/factors.
- Intervention cases, activities, assignments, outcomes, and follow-ups.
- Subscription/course renewal opportunities and outcome history.
- Event-driven unified action queue with SLA/assignee/branch and dedupe.

- Owner dashboard, branch comparisons, funnel, attribution, revenue/collection/debt, unit economics, capacity, retention, and staff metrics.
- Observation → explanation → recommended action → assigned task → outcome loops.
- Permission-filtered global search and audited import pipelines.
- AI assistance only after governed data/actions exist; all consequential outputs require human review.

## High-level design

```text
Growth: Lead -> Trial -> Conversion
                    |
                    v
Operations: Contact -> Enrollment -> Group -> Session/Room -> Attendance
                    |
                    v
Revenue: Plan -> Subscription -> Charge <- Allocation <- Receipt/Provider
                                     |
                                     v
                                Entitlement
                    |
                    v
Education: Course -> Lesson -> Assignment/Quiz -> Grade/Progress
                    |
                    v
Relationships: Guardian -> Preferences -> Parent communication
                    |
                    v
Intelligence: Signals -> Risk -> Intervention -> Renewal -> Outcome

All commands -> permission/scope check -> transaction -> audit + outbox
Outbox -> notifications / automation / analytics / action queue
```

## Non-functional decisions and trade-offs

- **Modular monolith first:** best fit for a single operator and current Supabase deployment; revisit service extraction only when deploy coupling, workload isolation, or team ownership makes it necessary.
- **Postgres transactions for invariants:** conversion, posting, allocation, entitlement, payroll approval, and state transitions belong in transaction-safe SQL/service commands. This increases migration rigor but avoids client-trust and partial-write failures.
- **Immutable posted finance/payroll:** corrections are reversal/adjustment rows. Storage grows, but auditability and reconciliation are substantially safer.
- **Views first for analytics:** use indexed source tables and stable SQL views before introducing a separate warehouse. Revisit materialized aggregates when query volume/latency warrants it.
- **Typed automation over arbitrary scripting:** smaller feature surface, much lower risk. Add trigger/action types deliberately and version them.
- **Compatibility bridges:** retain current offer/payment/entitlement and route contracts while new source-of-truth modules roll out; remove compatibility paths only in a later, separately verified migration.

## Completion gates

The expansion is complete only when:

1. All 33 acceptance steps are demonstrated against real local database/service behavior.
2. Every new tenant table has positive and cross-tenant negative RLS tests.
3. All consequential transitions are server-validated and audited.
4. Finance/payroll commands are idempotent and posted history is immutable.
5. Role and scope tests cover owner, admin/operator, branch manager, salesperson, teacher, cashier/accountant, student, and guardian.
6. Desktop/tablet/mobile critical flows pass browser tests.
7. Existing Academy LMS and shared product regression suites remain green.
8. `npm run verify:prod` passes.
9. Production deployment, migrations, Edge deployment, secrets, and live provider verification remain separate manual release gates; none are implied by local success.
