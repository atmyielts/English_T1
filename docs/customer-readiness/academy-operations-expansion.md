# Academy daily operations expansion

All twelve requested capabilities are included in the production-readiness
scope. Existing source foundations are starting points; source presence does
not establish an installed backend or a completed customer workflow.

The supplied dashboard image is the visual reference for refinement: light
surfaces, restrained borders, compact summary cards, quiet navigation, clear
actions and useful information density. Apply this consistently to desktop,
tablet and phone layouts using Schood's identity and actual Academy data.
Use short transitions and reduced-motion support, with visible keyboard focus,
legible states and loading/error recovery. Financial chart illustrations in
the reference are not product data or Academy requirements.

| Capability | Required customer outcome and release evidence |
| --- | --- |
| Room timetable | Branch-local room/time grid; dated and recurring lessons; server rejects concurrent room and teacher overlaps; cancellation/rescheduling releases capacity. |
| Excel/CSV migration | Map name, phone, parent phone, group, balance and join date; preview errors/duplicates; authorized transactional contact, guardian, membership and opening-balance creation; retry without duplicates; audit and recovery. |
| Student wallet | Clearly separate prepaid credit from debt; auditable per-currency ledger; configured monthly/per-lesson debits; threshold alerts/freezes; vacation pause preserves the agreed remaining value. |
| Quick lead | Accessible four-field capture for walk-ins and phone inquiries; correct branch and initial lead stage; immutable retry identity; duplicate-submit protection; receptionist permissions. |
| Parent alerts | Authorized attendance, score and tuition triggers; verified parent relationships and opted-in channel; durable retry/idempotency; SMS/Telegram provider proof using owned test recipients; no duplicate alerts. |
| Parent portal | Live authorized attendance, homework, notes and renewal checkout; secure link/account access and revocation; safe Click settlement and durable entitlement fulfillment. |
| Telegram attendance | Assigned teacher opens current class, marks absent students and submits one complete roster; server rejects foreign class/participants; same data visible on the web. |
| Voice feedback | Microphone permission, bounded recording, accessible playback and text alternative; private student/teacher media access; upload retry and deletion; browser and Telegram support. |
| Teacher payroll | Configurable per-lesson, revenue-share and base-plus-active-student rules; documented earned/collected basis and proration; versioned monthly snapshots; review/approval/payout audit and exports. |
| Cashier shift | User/branch/cashbox ownership; cash, Click and terminal reconciliation; counted cash and variance; auditable handover; no concurrent or repeated shift close. |
| Branch comparison | Permission-scoped branch selection; consistent revenue/headcount/teacher metric period and basis; timezone/currency separation; no cross-branch or cross-tenant record exposure. |
| Teacher retention | Defined entry cohorts and month boundaries; transfer/pause treatment; denominator/sample visibility; teacher/class attribution; interpretable churn without mixing collection or score metrics. |

The first delivery prioritizes reception workflows, beginning with Quick Lead
and the room calendar. Existing imports already accept CSV/XLSX and column
mapping, but combined student/guardian/group/balance migration requires separate
transactional qualification. Existing commercial balances use a receivable
basis: positive means money owed. A wallet display must explicitly derive
prepaid credit rather than reversing ledger accounting semantics.

Payroll, cashier, commercial subscriptions/freezes, guardian dashboards and
Telegram attendance exist in source. Their requested end-to-end outcomes,
permissions, installed migrations/runtime, concurrency and real owned-account
proof remain part of this work. Financial and messaging features stay within
their reviewed deployment and provider qualification boundaries.

Release through feature PRs and exact-head checks. Keep production migrations
additive and source-preserve installed Edge Functions. Qualify owned canaries
and rollback before declaring any of these capabilities ready for customers.

## Front-desk and visual refinement release

Quick Lead uses the existing permission-checked admissions command. It captures
name, phone, subject and preferred shift, with walk-in/phone source and branch
context. A pending capture keeps its payload and retry identity after an
uncertain response; explicit validation rejection permits correction. Closing
and reopening retains the entry. Duplicate submission is blocked immediately.

The shared workspace now uses light mint navigation, white panels, restrained
borders and Schood's warm dark summary. Status cards are separate and compact;
the work queue stays above them on phones. Full workspace titles wrap rather
than being clipped. Controls retain visible focus and 44px targets; short
colour transitions respect reduced motion. No chart library, new font request
or new home-page data request was introduced.

Validate the full Academy route suite, the responsive keyboard matrix across
13 roles at seven widths (320–1440px), four Quick Lead viewport cases, pending
retry and definitive rejection. Inspect desktop and phone captures. These use
synthetic API responses and do not prove a real production lead write.
