# SCHood Education Business OS Requirement Matrix

Current candidate: `codex/academy-lms-competence` local worktree, 2026-08-10. Production is unchanged.

## Status vocabulary

- **LOCAL VERIFIED** — implemented and covered by current-code runtime, contract, browser, or build evidence.
- **IMPLEMENTED** — source-of-truth implementation exists with automated contract/readiness coverage; production behavior is not claimed.
- **PARTIAL** — useful implementation exists, but the full requested breadth or real-world proof is incomplete.
- **EXTERNAL GATE** — cannot be honestly completed by source code alone; it needs production deployment, credentials, users, providers, or measured operations.

## Evidence keys

| Key | Evidence |
|---|---|
| DB-A..K | Additive migrations `20260810120000` through `20260810240000`, including tenant-aware composite relationships, state machines, immutable finance/payroll history, lifecycle outbox automation, and scoped direct-RLS boundaries |
| API | `supabase/functions/academy/index.ts`, its access matrix, Telegram guardian endpoint, and Deno contract suites |
| UI | Academy owner, teacher, student, guardian, admissions, commercial, academic, finance, intelligence, and platform surfaces plus Playwright route journeys |
| LIFE | `scripts/verify-academy-33-step-lifecycle.sql` — transactional end-to-end lifecycle proof |
| INV | `scripts/verify-academy-business-os-invariants.sql` — cross-tenant, RLS, state, money, payroll, guardian, idempotency, and scoped-role negative proof |
| AUTO | `scripts/verify-academy-automation-worker.ts` plus Phase J contract — authenticated scheduled worker, durable event delivery, idempotent execution/effect, and human-review safeguards |
| READY | `npm run verify:academy` — repository traceability/readiness checks |

## Requirements 1–62

| # | Requirement | Candidate status | Current evidence and boundary |
|---:|---|---|---|
| 1 | Preserve existing SCHood foundation | LOCAL VERIFIED | Existing LMS, assessments, gradebook, storage, payments, entitlement, workspaces, and role paths remain; curriculum and route suites cover unchanged learning paths. |
| 2 | Make the whole business lifecycle central | LOCAL VERIFIED | DB-A..J, API, UI, and LIFE represent and exercise lead through renewal/exit with immutable lifecycle events. |
| 3 | Acquisition and admissions CRM | LOCAL VERIFIED | First-class sources, campaigns, leads, tags/notes/ownership/attribution, API commands, and Admissions UI. |
| 4 | Sales pipeline | LOCAL VERIFIED | Academy pipelines/stages/history, validated transitions, Kanban, safe drag/drop, search and branch/source/course/employee/date/staleness filters. |
| 5 | Follow-up engine | LOCAL VERIFIED | Dated activities, outcomes, assignees and next actions; today/overdue/untouched/stale/no-action/recent/workload views. |
| 6 | Trial lessons | LOCAL VERIFIED | Trial entity with scheduled/confirmed/attended/missed/cancelled/rescheduled/converted states, attendance, feedback, placement, offer and conversion link. |
| 7 | Lead conversion and attribution | LOCAL VERIFIED | Transactional conversion reuses/connects identities and retains source, campaign, salesperson, trial, timestamp, value, enrollment and commercial links; LIFE proves it. |
| 8 | Branch management | LOCAL VERIFIED | Tenant-safe branches, hours/contact/manager/status, rooms, scoped roles, staff assignment and branch-aware operational/economic views. |
| 9 | Room and capacity management | LOCAL VERIFIED | Physical rooms, availability and teacher/room/group collision prevention; capacity/utilization views. |
| 10 | Classroom economics | LOCAL VERIFIED | Capacity/fill, expected and recurring revenue, costs, debt, attendance, retention and contribution semantics; contribution is explicitly not statutory profit. |
| 11 | Billing engine | LOCAL VERIFIED | Pricing plan, agreement/subscription, charge, receipt/payment, allocation, balance and entitlement are separate relational domains. |
| 12 | Student subscriptions | LOCAL VERIFIED | Versioned commercial agreements with classroom/course/plan, lifecycle, freezes, cancellation, renewal, override and entitlement relationship. |
| 13 | Discounts and adjustments | LOCAL VERIFIED | Percentage/fixed/sibling/scholarship/campaign/custom/temporary/promo/override model; sensitive permission checks and mandatory actor/reason/original/final evidence. |
| 14 | Charges, invoices and balances | LOCAL VERIFIED | Partial payment, overpayment/credit, refund, adjustment, write-off/transfer paths and immutable account ledger; INV proves money invariants. |
| 15 | Debt management | LOCAL VERIFIED | Aging buckets, promises, reminder/activity history, responsibility, restriction state, expected/collected metrics and operational actions. |
| 16 | Cashier operations | LOCAL VERIFIED | Provider-neutral methods, branch cashboxes, shifts, opening/movements/closing/reconciliation/discrepancy and audited journals. No statutory accounting claim. |
| 17 | Payment reconciliation | LOCAL VERIFIED | Existing Click preserved; provider references/status, callback idempotency, mismatch/retry/manual review/settlement evidence, ledger-first allocation and server-side entitlement application. |
| 18 | Freezes, pauses and make-ups | LOCAL VERIFIED | Freeze/pause/extension/make-up/transfer/credit commands with actor, reason, timestamp, effect and audit evidence. |
| 19 | Staff compensation | LOCAL VERIFIED | Structured fixed/per-lesson/per-hour/per-student/revenue-share/fixed-plus/tiered/manual rule types; no arbitrary executable formula strings. |
| 20 | Teacher payroll | LOCAL VERIFIED | Periods, verified delivery inputs, snapshots, adjustments, approval/payout states and immutable historical calculation; INV proves replay safety. |
| 21 | Teacher economics and performance | IMPLEMENTED | Raw revenue/cost/contribution/attendance/retention/academic/homework metrics are separated from derived indicators; meaningful real-world comparisons need populated operational data. |
| 22 | Staff performance | IMPLEMENTED | Admissions workload/conversion/follow-up and administrator action metrics are branch/permission aware; useful trends need live history. |
| 23 | Parent and guardian domain | LOCAL VERIFIED | Relationship types, adult-safe optional use, consent, financial responsibility, primary contact, visibility and notification preferences. |
| 24 | Telegram-first parent experience | LOCAL VERIFIED | Verified Telegram identity plus one-time, expiring, non-reusable secure guardian link; consent and per-child/domain visibility before attendance/grades/homework/schedule/payments/messages/resources. |
| 25 | Notification preferences | LOCAL VERIFIED | In-app/Telegram/email/SMS-ready preferences, event topics, quiet hours, policy/critical handling, retry-safe outbox and immutable delivery attempts. |
| 26 | Retention engine | LOCAL VERIFIED | Versioned explainable academic/attendance/engagement/payment/churn rules, factor evidence and history; no unsupported predictive-AI claim. |
| 27 | Intervention workflows | LOCAL VERIFIED | Signal → evaluation → assigned action/case → contacts/follow-up → outcome → re-evaluation source model and UI. |
| 28 | Renewal management | LOCAL VERIFIED | Expiry-driven opportunities, owner/offer/activity/next action, renewed/declined/left outcomes and retry-safe renewal; LIFE exercises both outcomes. |
| 29 | Business dashboard | LOCAL VERIFIED | Governed students/admissions/revenue/operations/people/risk KPIs with definitions, as-of time and branch filters. |
| 30 | Branch comparison | IMPLEMENTED | Permission-filtered enrollment, conversion, revenue, collections, debt, attendance, utilization and contribution comparison; production benchmarking needs real branch data. |
| 31 | Unit economics | IMPLEMENTED | Student/classroom/course/teacher/branch revenue and attributable-cost views with metric definitions; statutory profit, tax and full accounting remain out of scope. |
| 32 | Marketing and attribution analytics | LOCAL VERIFIED | Source/campaign funnel, student count, conversion value and collected-revenue attribution preserved from lead through commercial records. |
| 33 | Operational action queue | LOCAL VERIFIED | Unified permission-filtered task/inbox with source entity, priority, owner, branch, due/SLA, status and idempotent dedupe. |
| 34 | Automation engine | LOCAL VERIFIED | Typed, versioned triggers/conditions/allowlisted effects, dry-run/test controls, durable lifecycle outbox, scheduled worker, idempotent execution/effects, audit and human-review staging. |
| 35 | AI/Academy intelligence | IMPLEMENTED | Server-authorized evidence packets, proposal-only outputs, deterministic fallback, confidence/assumptions and immutable approve/reject workflow. It cannot autonomously change money, grades, access or sensitive status. Provider quality needs credentialed proof. |
| 36 | Search and command experience | LOCAL VERIFIED | Server-side, tenant- and permission-filtered global search across operational, learning, guardian and finance entities with command-focused navigation. |
| 37 | Imports and migration | LOCAL VERIFIED | Real CSV/XLSX parsing, header auto-mapping with operator correction, preview, batching, duplicate policy, server row validation, dry run, commit/rollback and audit. Browser proof covers CSV mapping/preview; XLSX parsing is build/contract covered. |
| 38 | Audit system | LOCAL VERIFIED | Actor/time/request/idempotency/action/entity/context evidence across sensitive commands; immutable lifecycle, finance, delivery and payroll histories plus visible audit surfaces. |
| 39 | Permission matrix expansion | LOCAL VERIFIED | Owner/admin/branch manager/sales/cashier/accountant/teacher/academic/parent-oriented capabilities with academy/branch/classroom scope; API enforcement and scoped direct-RLS negative proof. |
| 40 | Tenant safety | LOCAL VERIFIED | Composite tenant relationships, request-bound academy resolution, API scope filters, RLS on all Academy tables, cross-tenant negative tests and scoped-manager direct-read denial. |
| 41 | Domain model quality | LOCAL VERIFIED | Relational source-of-truth domains, explicit foreign keys and histories; JSON is limited to settings/evidence/flexible metadata rather than hiding core lifecycle state. |
| 42 | State machines | LOCAL VERIFIED | Validated lead, trial, subscription, enrollment, receipt/charge, payroll, intervention and renewal transitions; invalid transitions are negative-tested. |
| 43 | Event architecture | LOCAL VERIFIED | Immutable Academy lifecycle events feed a durable idempotent outbox; scheduled worker claims/retries/delivers and records automation effects. |
| 44 | Product information architecture | LOCAL VERIFIED | Role-aware navigation groups Today/admissions/students/learning/academic ops/finance/people/engagement/intelligence/automation/settings/audit without removing existing LMS routes. |
| 45 | Role-specific experiences | LOCAL VERIFIED | Owner/admin/teacher/branch-operator/student/guardian journeys exist; finer roles are exposed through the permission matrix and server filtering rather than separate insecure frontends. |
| 46 | Mobile-first operational design | PARTIAL | Admissions critical paths and responsive layouts are browser-tested; all newly added dense finance/payroll/analytics tables have responsive containers, but a complete device matrix and field usability study remain before launch. |
| 47 | Uzbekistan localization | PARTIAL | UZS, Asia/Tashkent, +998, date/time formats, Uzbek/Russian/English locale settings and translation overrides are implemented. The architecture supports all three; most current interface copy is still English and needs professional translation review. |
| 48 | Competitor parity vs differentiation | EXTERNAL GATE | The requested CRM/billing/debt/branch/payroll/guardian/LMS breadth now exists as a local candidate; parity/usability superiority requires current competitor research and customer trials, not a code assertion. |
| 49 | SCHood differentiation | IMPLEMENTED | Unified learner plus commercial/attendance/guardian/risk/renewal intelligence and action-oriented recommendations share one tenant-safe model. Outcome advantage needs production evidence. |
| 50 | Avoid feature chaos | LOCAL VERIFIED | Existing contacts, classrooms, payments, entitlements, notifications, audit and outbox are extended or bridged; new concepts are bounded relational modules in the modular monolith. |
| 51 | Phased implementation | LOCAL VERIFIED | Additive phases A–K follow foundation → commercial → operations → relationships → retention → intelligence → integrity/automation/scope hardening. |
| 52 | Priority order | LOCAL VERIFIED | P0 tenancy/CRM/branches/commercial/ledger/debt first, P1 operations/guardians/retention next, P2 automation/AI/intelligence/imports last. |
| 53 | Database migrations | LOCAL VERIFIED | Timestamped additive migrations reset cleanly from zero; composite tenant constraints and backward-compatible bridges preserve existing paths. Production migration is an external release step. |
| 54 | API/service layer | LOCAL VERIFIED | Central authenticated Academy Edge service validates payloads, membership/capabilities/scope/state/idempotency and audits commands; UI does not own sensitive rules. |
| 55 | Idempotency | LOCAL VERIFIED | Conversion, receipt/allocation, renewals, payroll, notification, outbox and automation effect paths use stable keys/records; INV and AUTO exercise replays. |
| 56 | Testing | LOCAL VERIFIED | Static schema contracts, Deno service contracts, clean DB reset, positive LIFE journey, negative INV suite, automation worker proof, browser role journeys, build/lint/readiness/smoke gates. Credentialed production tests remain external. |
| 57 | Acceptance standard | PARTIAL | Local candidate meets the specified domain and test standard. It is not accepted for unrestricted production until PR/CI, production migration/function deploy, live provider/role smoke, observability/recovery and an operator pilot pass. |
| 58 | Final product model | IMPLEMENTED | The candidate is a unified Education Business OS modular monolith spanning acquisition through renewal while preserving LMS depth. Production status is deliberately separate. |
| 59 | Audit before coding | LOCAL VERIFIED | `ACADEMY_EDUCATION_BUSINESS_OS_AUDIT.md` records baseline/reuse/conflicts/security/migration roadmap before the expansion migrations. |
| 60 | Then implement | LOCAL VERIFIED | Phases A–K, API actions, role experiences, runtime proofs and operational docs implement the audited roadmap in this isolated worktree. |
| 61 | Quality bar | PARTIAL | Local automated quality/security gates are strong and current. Production performance, accessibility review, localization review, provider behavior, backup/restore and sustained operational reliability are not yet proven. |
| 62 | Product principle | IMPLEMENTED | The resulting candidate joins business operations and education delivery rather than replacing the competent LMS or creating a disconnected CRM/accounting app. |

## Honest release verdict

- This is **not a dummy demo**: it has durable relational domains, authenticated server commands, permission and tenant boundaries, state transitions, immutable evidence, and executable positive/negative lifecycle tests.
- It is a **full local release candidate**, not a production-complete claim.
- Before live use: merge through reviewed CI, deploy migrations and Edge Functions manually in the documented order, run credentialed cross-role/cross-tenant/provider/storage/Telegram smoke tests, validate backup and rollback, complete translation/accessibility review, and operate a controlled pilot.
