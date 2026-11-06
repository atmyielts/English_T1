# 46 — Company English v2: the plan for 6 November 2026

**Owner's request:** make Company English the best in the market. Add as much useful depth as possible, with free rein, until 22:00 Tashkent time.

**Starting point:** the service went live today at https://company.schood.online (PR #327).

**Who we measure against:** Speexx, goFLUENT, EF Corporate, Busuu for Business, Preply Business, TestGorilla and Pearson Versant. Our advantage is local: Russian and Uzbek first, Uzbek workplaces, and one place to hire, test, train and report.

## Status

**Continuation on 7 November 2026:** the Wave 1 implementation is integrated in the existing `English_T1-company` checkout, on `codex/company-v2-continuation`. Production is still the v1 baseline from PR #327. Local verification is distinct from a production release.

The eight areas now include hiring/ATS, company courses and learning paths, daily coaching, reporting, integrations/privacy tools, the multilingual public site, staff operations, and expanded original content. The source-of-truth release inventory is `release/manifest.json`: one frontend (`company`), nine additive migrations and the `company` Edge Function. No workflow files or npm dependencies were added.

Content is complete to the Wave 1 depth target: 25 tracks, 288 lessons, 102 role-plays and 102 writing tasks. The original eleven tracks have sixteen lessons each; the fourteen new tracks have eight each. Existing lesson codes and ordering are preserved. The hiring bank has 214 grammar items, 202 vocabulary items, 30 reading passages and 30 listening passages, plus 50 writing and 75 speaking tasks. These are authored training/test fixtures and content, not claims of external certification or human linguistic acceptance.

Locally verified during continuation:

- 453 focused tests pass, including content, tenant/role/consent boundaries, default-off delivery, privacy erasure, paginated personal exports, lesson version conflicts, exact VAT arithmetic and public-site artifacts. `npm run test:shared` now also runs the Company English typecheck and tests in existing CI.
- All 338 routes reach a successful response through the real handler, supabase-js, PostgREST and throwaway Postgres: 2,222 requests and 455 assertions, with no unexpected statuses, logged errors or swallowed database errors. Outbound adapters and AI responses are synthetic in this harness.
- Thirteen Company English migrations (four baseline plus nine v2) pass thirteen SQL integration suites and reapply safely. No production schema was changed.
- An independent real-Postgres billing race suite checks competing and repeated payments, payment-versus-void, concurrent activation, removal-versus-activation and service-only RPC grants. Reminder limits also have an eight-way real-PostgREST race check.
- The frontend builds, the production entry point typechecks, `verify:prod` and release-manifest checks pass.
- A local browser sweep passes 108 views across EN/RU/UZ at 390px and 1280px. The Russian header, phone layout, role guides and main workspace screens have no page errors or horizontal overflow. This uses synthetic preview accounts, not hosted identity/provider acceptance.

Confirmed review findings were fixed and covered by regressions: closed-workspace candidate resume; consent in staff learning aggregates; unsafe invoice totals and concurrent payment/activation/act transitions; rate-limit fail-open behavior; webhook DNS rebinding; Tashkent-day email caps and concurrent Telegram caps; erased social badges reappearing; and a published lesson changing answer keys while a learner has the previous version open.

Run the complete local gate with `npm run verify:company`. For the browser sweep, start `npm --workspace apps/company run preview:local -- --host 127.0.0.1`, then run `scripts/company-browser-smoke.js` through the Playwright CLI. Preview data, AI and delivery results are fixtures.

**Release remains gated:** protected PR/CI and merge, production migration dry run excluding the nine #220 payment migrations, deployment of the merged `company` function, and signed-in hosted acceptance. Keep Telegram/email/webhook switches off. Privacy/terms need legal review, and invoice identity/bank fields must be entered by staff. No prices or company registration details have been invented.

Accepted local limits: Insights uses a manager's primary department; extra department assignments currently extend People/search only. The production build warns about a JavaScript chunk over 500 kB. Browser speech quality/device behavior, real external adapters and human translation review have not been certified by the local tests. Wave 2 remains a candidate backlog until Wave 1 is accepted.

## Original 6 November timeline (Tashkent time)

| Time | Step |
|---|---|
| 14:10–16:40 | **Wave 1 build:** eight builders, each on separate files |
| 16:40–17:30 | **Merge and run:** commit, run all tests, extend the real-database test to every new route |
| 17:30–18:30 | **Attack:** independent reviewers and skeptics look for security, privacy and logic faults |
| 18:30–19:15 | **Fix and ship:** fix what they confirm, get CI green, release wave 1 |
| 19:15–21:15 | **Wave 2 build:** whatever wave 1 left unfinished, plus the highest-value items below |
| 21:15–22:00 | **Check and ship:** test, attack and release wave 2 if it passes. Anything that doesn't pass stays out |

The times are estimates. If a wave runs late, quality checks stay and the wave's scope shrinks.

## Wave 1: what each builder adds

### 1. Hiring: a full applicant tracking layer
Goal: a company needs no separate tool to hire for English.
- 25+ ready vacancy templates, with skills, per-skill minimums and time limits; one click creates a test
- Per-skill minimums, a candidate-versus-role comparison, and a ranked shortlist
- Bulk candidates by paste or CSV, with personal links and tracking: invited, opened, started, finished
- Ready-to-send invitation text in English, Russian and Uzbek, with copy and Telegram share. We don't send it ourselves
- Pipeline stages (new, reviewing, interview, offer, hired, rejected), a board and a list, notes with author, bulk actions, and a hiring funnel
- Expiring, revocable read-only report link for hiring managers
- Interview kit focused on the candidate's weak skills: AI, with a built-in question bank as fallback
- Offer and rejection templates, and a feedback report HR can choose to share
- Automatic deletion of candidate personal data after a chosen number of months (off by default), plus delete-now
- HR test preview that uses no quota and stores nothing

### 2. Training: company-specific learning
Goal: the thing competitors charge the most for.
- Course builder: HR creates its own lessons and courses, with drafts, publishing, and versions that keep learners' progress
- AI lesson drafting from a pasted policy, script, menu or product sheet; never published without HR approval
- Custom role-play scenarios with HR's own success criteria, which the AI feedback checks
- Learning paths from level, target and job role, with estimated time; HR can edit them or assign them to a department
- Completion certificates with a public check code
- Overdue highlighting and bulk re-assignment
- Writing checker: choice of tone, rewrite for a customer, shorten, reply-to-this-email, saved templates
- Role-play: difficulty levels, hints, replay with a better answer, score history

### 3. Coach: the daily habit
For employees with a learning seat.
- Today: a 5–10 minute daily plan, weighted to job role and weak skills
- Personal phrase deck with spaced review
- "How do I say this at work?": type in Russian, Uzbek or English, pick situation and tone, get natural options
- Searchable phrasebook of 300+ original phrases by situation, with audio
- Pronunciation and shadowing with speech recognition, labelled honestly as based on a transcript
- Streaks with freeze days, weekly goals, fair badges, then-versus-now view. No dark patterns or fake urgency
- Optional team kudos, which HR can switch off; shows no learning detail without consent

### 4. Insights: what HR shows the CEO
- Required level per job role and department, with dates. Suggested defaults are marked as Schood's
- Skills-gap matrix with compliance percentage and trend, respecting consent and manager scope
- At-risk learners with a suggested action, one-click assign, and a nudge message to copy
- Before-and-after results between two dates, and a promotion-ready list
- Spend entered by HR gives cost per active learner, per level gained and per hour. Plain arithmetic, no invented benchmarks
- Printable one-page executive summary, optional AI narrative from numbers only, saved monthly snapshots
- Custom report builder with saved views and CSV export
- Manager home for their own department
- Deeper challenges (templates, team versus team, auto-finish) and sessions (recurring series, trainer notes, attendance rates)

### 5. Connect: what makes a company depend on this
- In-app notifications with a bell, generated from real events
- Telegram reminders and HR weekly digest: per-person opt-in, quiet hours, daily cap. **Off by default**
- Email invitations. **Off by default**
- Public API: hashed, scoped, revocable keys with rate limits; people, invitations, tests, results, levels; docs page with examples
- Signed webhooks with retries, delivery log and protection against internal addresses. **Off by default**
- HR system import: map any CSV, remembered per workspace, with a preview before applying
- Company branding on candidate pages and certificates: name, colour with a contrast check, small logo
- Privacy tools: export one person's data, delete a person's learning data, data-processing summary, audit log view

### 6. Marketing: the sales engine
- Fix the cramped Russian header at laptop widths
- Pages per industry: hotels, banks, IT, call centres, retail, logistics, manufacturing, healthcare, education, government
- Solution pages: hiring, placement, training, reporting
- Free team-level check at `/check` with an estimate and a lead form
- "What level does this job need?" guide, with a page per job role
- Value calculator using only the visitor's own inputs
- Full sample report, labelled as sample data
- Help centre for HR, managers and employees, in three languages
- Honest comparison against the alternatives: language school, generic app, international exam, doing nothing
- Privacy, terms and security pages describing what the service really does. **These need your legal review**
- Search setup: titles, descriptions, sitemap, structured data. Lead source tracking, and an installable app manifest

### 7. Operations: one founder running many contracts
- Quotes and contracts with prices staff enter, a pipeline, monthly recurring revenue from those entries, a renewal list
- Printable invoices and acts with Uzbek company fields. Schood's own details come from settings staff enter, never invented
- Payment recording and an overdue list. Turning seats on stays a staff click, not automatic
- Workspace health score and churn-risk list from real signals
- Lead scoring, follow-up dates, a "today's calls" list, source reporting
- Live onboarding checklist for HR
- Bulk actions on people, saved filters, seat requests from employees
- Ctrl+K search across the workspace, respecting roles, consent and manager scope
- Plan and usage page with a request-more-seats form
- Employee's own profile: leave the workspace, download my data
- Read-only "view this workspace" for staff, clearly labelled and audited. No impersonation

### 8. Content: far more local depth
- 14 new job roles: call centre, retail, tourism, aviation, legal, marketing, HR, construction, pharma, education, government, restaurant, procurement, accounting
- Each new role gets 8 lessons, 4 role-plays and 4 writing tasks, set in realistic Uzbek contexts
- Existing tracks grow from 8 to 16 lessons, with an advanced stage where sensible
- Hiring question bank grows to 200 grammar, 200 vocabulary, 30 reading and 30 listening items
- Order of priority: new roles, then the question bank, then existing tracks. Each role is finished before the next starts

## Wave 2: candidates

Chosen at 19:15, based on what wave 1 delivers. In rough priority order:

1. Anything wave 1 left unfinished
2. Telegram Mini App for employees: Today, reviews and tests inside Telegram
3. Offline-friendly phone experience for shop-floor and hotel staff
4. Company-wide placement campaign tools: reminders by department, deadlines, completion tracking
5. Trainer workspace: an outside or in-house trainer manages cohorts and homework
6. Interview-readiness and meeting-readiness packs for employees
7. More industry packs and glossary starter sets per industry
8. Deeper real-API and browser tests across every role

## Not doing today, and why

| Item | Why |
|---|---|
| Self-serve card or Click payments | Involves live money, and Click needs the static IP that isn't set up. Yours to decide |
| Published prices | You haven't set them |
| Paid AI speech or neural voices | You declined paid extras, so we stay on free browser speech |
| Webcam proctoring | Needs paid infrastructure and raises privacy questions |
| SSO | Needs a real corporate customer to test against |
| Turning on Telegram, email or webhooks | They would contact real people. Built, but your switch |

## Rules every builder follows

- **Live service:** nothing may break existing data or clients. The migrations already applied are not edited. New migrations only add, and can be applied twice safely.
- **Isolation:** every id is checked against the company making the request. Every route declares its roles.
- **Privacy:** without an employee's consent, HR sees membership and company test results only. Managers see only their department. AI-tutor chats are never read. Schood English activity counts only from the day the person joined and agreed.
- **Seats:** learning features need a seat. A pilot includes tests only.
- **Honesty:** no invented prices, statistics, clients, testimonials, guarantees, contact details or legal claims. Levels are "Schood estimate". All content is original.
- **Messaging:** nothing goes to a real person unless a named switch is on, and it defaults to off.
- **Quality:** every visible string in English, Russian and Uzbek. Works at phone width. Tests for every feature. No new npm packages.

## How a wave gets released

1. All unit tests, database tests and builds pass
2. The real-database test covers every new route, against real PostgREST and Postgres in throwaway containers
3. Independent reviewers try to break it, and skeptics confirm each finding by running it
4. Confirmed critical, high and medium findings are fixed; each low one is fixed or recorded as an accepted limit
5. CI is green on a PR, then squash-merge, which deploys the websites
6. Database dry run shows only the expected migrations, with the 9 #220 payment migrations excluded, then push
7. Functions are deployed from main, checking production stays healthy after each
8. Live checks in a browser

**Stop rule:** if production looks unhealthy at any point, the release stops. Rollback is Cloudflare Pages rollback plus redeploying the previous functions; suspending workspaces switches off seats without touching purchases.

## What needs you

These won't block the work today, but they need your decision or action:

- **Signed-in test:** the 10-minute check on production from this morning. I don't sign in on production
- **Legal review** of the privacy and terms pages
- **Schood's company details** for invoices (legal name, STIR, bank, MFO, account), entered in the staff console
- **Prices** for seats and tests, if you ever want them published
- **Switches:** when to turn on Telegram, email and webhooks
- **Self-serve pilots:** they're open now. To restrict them, set `COMPANY_SELF_SERVE=false`
