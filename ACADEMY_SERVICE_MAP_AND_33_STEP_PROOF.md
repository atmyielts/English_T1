# Academy Service Map and 33-Step Journey Proof

Date: 2026-08-10
Branch: `codex/academy-lms-competence`
Evidence scope: release candidate and local runtime proof. Production evidence is tracked separately during cutover.

## Readiness verdict

This is not a dummy LMS demo. The branch contains a relational, tenant-scoped learning system plus the operating services an academy needs to acquire, teach, bill, support, retain, and renew learners. A fresh local database and an executable 33-step journey prove the records work together.

It is not yet proven ready for unrestricted live use. SCHood has production only; the backend schema and Edge Function phase is deployed and authenticated owner/student smoke is green, while this frontend slice still requires PR review, deployment, and final live acceptance.

The traceability verdict for every numbered expansion requirement is in `ACADEMY_BUSINESS_OS_REQUIREMENT_MATRIX.md`.

## Service map

| Domain | Functional services | Main roles | Product surfaces |
|---|---|---|---|
| Identity and tenancy | Authentication, academies, branches, staff assignments, specialist roles, branch/classroom scope, audit | Owner, center admin, branch manager | Academy settings, access management |
| Admissions and CRM | Lead capture, normalized Uzbek phones, source/campaign attribution, pipeline, salesperson assignment, activities, follow-ups, trials, feedback, transactional conversion | Admissions, salesperson, branch manager, teacher | Business Foundation |
| Student records | One contact record, enrollment lifecycle, classroom membership, entitlement, lifecycle timeline, global search | Admin, teacher, counselor | Contacts, Classrooms, Business Platform |
| Curriculum and LMS | Courses, modules, lessons, prerequisites, resources, progress, assignments, quizzes, attempts, rubrics, gradebook, feedback | Academic admin, teacher, student | Curriculum, Classroom LMS, Student Workplace |
| Teaching operations | Calendars, rooms, schedules, actual sessions, conflict prevention, attendance, exceptions, make-ups, substitutions, quality and capacity | Branch manager, academic operator, teacher | Academic Operations |
| Commercial core | Pricing plans, subscriptions, charges, discounts, receipts, allocations, immutable ledger, balances, debt, refunds, reconciliation | Owner, cashier, accountant | Commercial Core, Payments |
| Guardians | Guardian relationships, consent, one-time secure linking, section-level visibility, preferences, messages, delivery evidence | Parent liaison, teacher, guardian | Guardian Relationships, Parent Portal |
| Workforce and costs | Cash shifts, expenses, budgets, lesson-delivery evidence, compensation rules, payroll calculation/approval/payout, unit economics | Cashier, accountant, payroll officer, owner | Operations Finance, Business Platform |
| Retention and renewal | Explainable risk, signals, interventions, contact/outcome history, renewal opportunities, offers, outcomes, unified SLA actions | Counselor, parent liaison, manager | Intelligence Operations |
| Intelligence | Governed KPIs, owner dashboard, branch comparison, attribution, teacher/staff performance, unified student intelligence | Owner and permissioned managers | Business Platform, Intelligence Operations |
| Automation | Versioned typed rules, condition evaluation, immutable lifecycle outbox, authenticated scheduled worker, idempotent executions/effects, allowlisted actions, outbound queue, human-review safeguards | Owner, center admin, branch manager viewer | Business Platform |
| AI assistance | Server-authorized evidence snapshots, proposal-only outputs, deterministic fallback, immutable human approval/rejection | Permissioned owner/manager | Business Platform |
| Localization and migration | Uzbek/Russian/English settings and overrides; real CSV/XLSX parsing, automatic/correctable column mapping, source preview, dry run, duplicate policy, row evidence, safe commit and rollback | Owner, manager | Business Platform, Intelligence Operations |

## Exact 33-step acceptance journey

The executable proof is `scripts/verify-academy-33-step-lifecycle.sql`. It runs in a transaction against fresh local Supabase, asserts the evidence below, prints `ACADEMY_33_STEP_LIFECYCLE_OK`, and rolls back all fixtures.

| # | Required journey step | Evidence asserted locally |
|---:|---|---|
| 1 | Instagram message arrives | Active Instagram campaign and source are created. |
| 2 | Lead is created/received | `academy_leads` and immutable `lead.created` event. |
| 3 | Source is attributed | Lead and conversion retain source and campaign IDs. |
| 4 | Salesperson is assigned | Lead and conversion retain `assigned_user_id` / `salesperson_user_id`. |
| 5 | Lead is contacted | Completed Telegram activity and `lead.contacted`. |
| 6 | Follow-up is scheduled | Due activity and `lead.follow_up_scheduled`. |
| 7 | Trial is booked | Branch/classroom/teacher trial and `trial.booked`. |
| 8 | Lead attends trial | Attendance transition and `trial.attended`. |
| 9 | Teacher records feedback | Feedback, level, next step, and `trial.feedback_recorded`. |
| 10 | Lead is converted | Transactional conversion and `lead.converted` / `trial.converted`. |
| 11 | Contact is created/connected | Conversion yields one academy contact linked to the lead. |
| 12 | Guardian is connected | Guardian relationship and `guardian.connected`. |
| 13 | Student joins a group | Active classroom membership and `student.group_joined`. |
| 14 | Plan/subscription is created | Versioned plan, agreement, charge, and `subscription.created`. |
| 15 | Payment is collected | Paid receipt, exact charge allocation, and `payment.collected`. |
| 16 | Entitlement becomes active | Classroom grant and `entitlement.activated`. |
| 17 | Student attends classes | Present attendance record. |
| 18 | Attendance is tracked | Immutable dated attendance evidence and `attendance.recorded`. |
| 19 | Curriculum is accessed | Published course/module/lesson progress and `learning.curriculum_accessed`. |
| 20 | Homework and assessment are completed | Assignment submission plus quiz attempt and completion events. |
| 21 | Grade is recorded | Score, JSON feedback, grader, and `learning.grade_recorded`. |
| 22 | Parent receives an update | Guardian-addressed notification and `guardian.update_queued`. |
| 23 | Salary accrues | Verified 90-minute delivered-lesson payroll input for the teacher. |
| 24 | Owner sees revenue and cost | Dashboard asserts collected revenue and available payroll/cost metric. |
| 25 | Student starts missing class | Dated absence and `attendance.absence_recorded`. |
| 26 | Risk is detected | Versioned evaluation and `retention.risk_detected`. |
| 27 | Intervention action is created | Assigned critical case and `retention.intervention_created`. |
| 28 | Admin contacts student/parent | Guardian-contact activity with next follow-up. |
| 29 | Outcome is recorded | Resolved intervention with outcome/reason and lifecycle event. |
| 30 | Subscription approaches expiration | Renewal opportunity tied to the expiring subscription. |
| 31 | Renewal workflow runs | Assigned renewal, offer activity, next action, and lifecycle event. |
| 32 | Student renews or leaves | Both renewed and declined outcome paths are exercised. |
| 33 | Retention outcome is recorded | Lifecycle summary asserts `has_renewed` and `has_left`. |

## Evidence layers

- Local runtime: fresh `supabase db reset`, transactional 33-step SQL proof, negative business invariant suite, and authenticated lifecycle-automation worker replay proof.
- Contract: schema, Edge action, role matrix, route, curriculum, readiness, and smoke suites.
- Build: Academy TypeScript and Vite production build.
- Production pending: frontend PR/CI and deployment, final credentialed UI/API acceptance, Click, Telegram, storage, scheduled jobs, observability, and backup/rollback acceptance.

## Release classification

- Dummy demo: **No**.
- Competent LMS in the branch: **Yes**.
- Full education-business operating system candidate: **Yes**.
- Ready for a controlled internal pilot: **After the documented production gates pass**.
- Proven ready for unrestricted live use today: **No; the production backend phase is deployed, but the new frontend and full operational acceptance remain pending**.
