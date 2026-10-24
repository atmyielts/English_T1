# 42 — How to build Homework OS and Schood Courses

Updated 2026-10-24. Status: **building**. The first release (`release/manifest.json`, id `academy-homework-os-courses`) is in code; see §11 for what it contains and what is left.

[40_HOMEWORK_OS](40_HOMEWORK_OS.md) and [41_SCHOOD_COURSES](41_SCHOOD_COURSES.md) say what to build and why. This doc says how, starting from the code that exists today. It covers what we already have, the decisions to make first, the data model, each subsystem and the phased order of work.

Code references were checked on 2026-10-22. Check the code again before building, because Academy changes often.

## 1. What already exists on `main`

The first version of this section was written against an older Academy branch. `main` already has much more:

| Area | On `main` (before this release) | Gap this release fills |
|---|---|---|
| Assignments and submissions | `academy_assignments` (with `course_id`, `module_id`, `lesson_id`, `rubric_id`, `attempts_allowed`, `allow_late_submission`), `academy_submissions` with `attempt_number`. Writes go through `academy_assignment_written_command` and `academy_grading_command` (receipts, `academy_grading_events`, rubric checks) | No funnel, no AI draft, no review queue, no mistake bank |
| Courses | `academy_courses`, `academy_course_modules` (with `unlock_rule`), `academy_lessons`, `academy_quizzes`, `academy_quiz_attempts`, `academy_lesson_progress`, `academy_classroom_courses` (the course run), `academy_lesson_sessions`, `academy_teacher_lesson_runs`, the staff `CurriculumView` and learner `StudentCurriculumView` | `unlock_rule` was stored but never enforced; no paid gate for publishing |
| Parents | `academy_guardians`, `academy_student_guardian_relationships` (per-domain visibility and consent), the guardian outbox with consent claims, delivered by @schoodacademybot | No weekly homework summary |
| Telegram | @schoodstudentbot (`workers/schood-bot`) linked to students through `users.telegram_chat_id`; text commands only | No media hand-in, no centre switching |
| Billing | Centre tiers (`partner_center_profiles.package_tier`); tenant entitlements from Click plan purchases | No plan for independent teachers; Academy features were never gated |
| AI | Free OpenRouter model for tutors; no server speech-to-text; no homework marking | AI pre-marking |

## 2. Decisions (owner answers, 2026-10-22)

| # | Decision | Answer | Notes |
|---|---|---|---|
| D1 | Where homework lives | **Academy** (`academy_classrooms`, `academy_assignments`, `academy_submissions`). `[DECIDED]` | Center-owned academies are billed through their parent center's tier. Folding `partner_center_review_items` into the one queue is later work |
| D2 | Extend Academy tables or a separate `homework_*` set | **Add new tables next to Academy's.** `[DECIDED]` | Existing tables are untouched apart from triggers; `academy_submissions` stays the current-state row |
| D3 | Which bot | **One Schood bot: @schoodstudentbot** (`workers/schood-bot`), the bot already linked to Academy students. `[DECIDED]` | Learners who attend several centers switch with `/center` or a "Switch centre" button; the choice is remembered per learner (`telegram_student_preferences`). With no choice made, every centre's open work is offered, labelled by centre |
| D4 | Homework mistakes may feed the learner's own Schood Daily plan | **Yes, with consent.** `[DECIDED]` | Built (§12, release `academy-homework-mistake-feed`): off by default, per centre. A learner who confirms they are 18 or older turns it on in "My mistakes" or the Mini App; for under-18s a guardian with homework access turns it on from the parent page. Either can turn it off, which deletes the copies |
| D5 | Course content delivery | **Least expensive first.** `[DECIDED]` | Telegram hosts files for free; S3 egress is the paid path. AI uses free OpenRouter models only (paid models are refused unless `HOMEWORK_AI_ALLOW_PAID=true`); voice notes are left to the teacher because there is no free speech-to-text path |
| D6 | Pricing | **Fit onto the existing center tiers.** `[DECIDED]` | Growth = homework and courses; Premium and Exclusive add AI pre-marking. Independent teachers (no parent center) buy the new **Schood Teaching** product: "Teacher" 149 000 UZS/month or 1 490 000/year (homework and courses) and "Teacher Pro" 249 000/month or 2 490 000/year (adds AI). Priced 2026-10-24 by delegation from the owner, anchored on learner plans (39-119k) and Growth (490k); only academy owners or admins can buy |
| D7 | Who may sell courses | **Education centers and independent teachers, as long as they pay Schood.** `[DECIDED]` 2026-10-22 | Publishing a course is gated on the Schood Teaching plan or a center tier once billing is enforced; drafts are always free |

## 3. Data model (as built)

Migration `20261024100000_academy_homework_os.sql`. Every new table has RLS enabled and no browser grants: reads and writes go through the `academy-learning` edge function with the service role, after the caller's scope is checked against `academy_current_authorities` (the same source `academy_grading_command` trusts).

| Table or function | Purpose |
|---|---|
| `academy_homework_events` | The funnel: first occurrence of `opened`, `submitted`, `premarked`, `reviewed`, `returned`, `corrected`, `mastered` per (assignment, learner). `submitted` and `reviewed` come from a trigger on `academy_submissions`, so web, Mini App and Telegram hand-ins all count |
| `academy_homework_ai_marks` | AI drafts per submission attempt. Never writes a released score; records the teacher's decision and score for agreement metrics |
| `academy_homework_mistakes` | Mistake bank (tag, excerpt, correction, explanation, status `open` → `corrected` → `mastered`) |
| `academy_homework_corrections` | Corrections a learner sends after work is returned |
| `academy_homework_integrity_signals` | `duplicate_media` (same file hash or Telegram file id as another learner), `similar_text`, `untimed_source`. Signals only, never penalties |
| `telegram_student_preferences`, `academy_telegram_handin_drafts` | Current centre and focused task per learner; hand-ins waiting for a tap, albums collected into one draft |
| `academy_homework_settings`, `academy_learning_config` | Per-academy choices; global switches (all start off) |
| `academy_learning_plan()`, `academy_learning_allows()` | One capability answer from the centre tier or the Schood Teaching entitlement |
| `academy_homework_staff_scope()` | Classrooms and learners an actor may see for a capability |
| `academy_homework_funnel()` | Funnel by group plus reviewer medians |
| `academy_module_unlocked()` and two triggers | Unlock-by-check enforcement on lesson progress and quiz attempts |
| `academy_courses_publish_gate` trigger | Publishing needs a plan once billing is enforced |
| `academy_homework_queue_guardian_digest()` | Weekly parent summary into the existing guardian outbox (consent, visibility and quiet hours are re-checked at delivery) |
| `academy_homework_feed_consents`, `academy_homework_feed_consent_events` | D4 consent per centre and learner (migration `20261025210000_academy_homework_mistake_feed.sql`): who granted it (learner 18+ or guardian), when, and when and by whom it was revoked, plus the full history |
| `academy_homework_mistake_feed` | Which `learner_language_errors` and `learner_review_items` rows each consented mistake created, so revoking or fixing removes exactly those |

Course versions pinned by a run are built (§12). Not built yet (still proposals): three-phase lesson blocks, the Assessment Cloud bridge (§6).

## 4. Homework OS, subsystem by subsystem

### 4.1 Telegram hand-in (V-HW-F2)

Keep the worker thin. Put the logic in Supabase.

1. `workers/schood-bot` stops dropping non-text updates. For `photo`, `voice`, `audio`, `video`, `video_note` and `document`, it forwards `{chat_id, file_id(s), media_group_id, caption}` to a new `academy` action `telegram_hand_in`, authenticated with the existing worker secret. Keep the existing `claim_update` / `complete_update` dedupe.
2. `telegram_hand_in` resolves `chat_id → users.telegram_chat_id → academy_contacts` (one learner can be in several academies) and lists the open assignments: active, released, not yet reviewed, ordered by due date.
3. Routing:
   - One open assignment: file it.
   - Several: reply with an inline keyboard of up to 5, ordered by due date. Store the pending media under a short-lived key until the student taps.
   - None: reply "No open homework", plus `/assignments`.
4. Media: `getFile` → download → upload to S3 through `_shared/media-storage.ts` at the existing `academy/{id}/classrooms/{cid}/submission/…` path → hash it → create the attempt.
   - **Albums** (several photos of handwritten pages share a `media_group_id`): buffer for a few seconds, then make **one** attempt with several pages.
   - `[VERIFY]` the Bot API download limit (believed to be 20 MB). Above it, reply with the Mini App link.
5. Receipt in the chat: "✅ Received for 'Unit 5 essay' at 21:04 · due tomorrow 18:00 · [Change]". The `Change` button re-files the work if it went to the wrong assignment. This is how we reach the 95% correct-filing target in 40.
6. Events: `submitted` with `source = telegram_bot`. `/assignments` and the Mini App list emit `opened`.
7. The Mini App (`telegram-app` `submit_assignment`) gets file upload too, for longer work (V-HW-F3).

### 4.2 AI pre-marking (V-HW-F4)

- **Trigger:** the submit route inserts an `academy_ai_marks` row (`queued`) and starts the job with `EdgeRuntime.waitUntil`. A cron sweep every few minutes retries stuck or failed jobs. That gives fast results without a new queue service.
- **Extract the shared graders first:** move the grading core of `writing-tutor` and `speaking-coach` into `_shared/` modules, so homework, B2C and later language packs (PE-01) share one prompt and one parser. `feedback-engine` is a stub; do not build on it.
- **By assignment type:**
  - **Writing:** the shared writing grader with the center's rubric. It returns band, criteria, comments and a mistakes[] list with taxonomy tags.
  - **Speaking:** voice note → speech-to-text → the shared speaking grader. `[VERIFY]` which STT path `speaking-studio` uses today, and its cost per minute in uz, ru and en.
  - **Quiz:** auto-mark. If the quiz is an Assessment Cloud form, results come through the bridge (§6).
  - **Handwritten math** (Launch+1): a vision model through OpenRouter, then a step check. `[VERIFY]` quality on real center samples before promising anything (40, build list item 6).
- **Guardrails:**
  - An AI credit budget per academy through `usage_counters` and `consume_usage_counter`, sized per tier.
  - Low-confidence marks are flagged for the teacher, not hidden.
  - Every mark stores the model and prompt version, so agreement rates can be tracked (a supporting metric in 40).

### 4.3 Teacher review queue (V-HW-F5)

- A new Academy view (it can reuse the interaction pattern of the partner-office `review_queue`). Sorting: overdue first, then due date, then low AI confidence. Filters: group, assignment, flags.
- One card per attempt: the work (images zoomable, audio playable), the AI draft beside it, and any integrity flags.
- Actions:
  - `A` approves the AI draft.
  - `E` edits the score or comments.
  - `R` returns the work for correction.
  - `V` records a voice comment.
  - `J` / `K` move to the next or previous card.
  - Mobile gets swipe and large buttons.
- **Approve** writes `academy_submissions.score`, `graded_by` and `notes` (through the existing `grade_submission` logic, so the audit trail stays). It emits `reviewed`, turns the AI mistakes into `academy_mistakes` rows, and sends the feedback to the student in Telegram.
- **Measure from day one:** time from opening a card to the decision. This is the "median teacher review time" in V-HW's done-when.

### 4.4 Mistake bank and corrections (V-HW-F6)

- **Returning work** creates a `correction` task: "Fix these 3", with each mistake's excerpt. The student replies in Telegram, and that becomes a new attempt of kind `correction`.
- **Mastered** means a later check on the same tag passes (40). Revision tasks pick **pre-reviewed library items by tag** first. AI-generated revision items need one tap of teacher approval before they are sent (principle 5).
- **Taxonomy:** reuse the grammar and skill tags behind `learner_language_errors` for languages, and PE-03 topic codes for math. One taxonomy is what makes the cross-center data moat in 40 work.

### 4.5 Trusted homework (V-HW-F7)

Use cheap signals that are hard to fake, and never accuse automatically.

| Signal | How | Cost |
|---|---|---|
| Process metrics | The in-app editor sends aggregates on submit: active minutes, characters typed vs pasted, the largest paste, focus losses | Low |
| Duplicate media | Perceptual hash of each photo, compared within the academy (two students handing in the same photo) | Low |
| Similar text | Similarity between submissions to the same assignment | Low |
| Untimed source | Text typed into Telegram cannot be process-checked, so it is labelled "untimed", not flagged | None |
| Explain-it | The teacher taps "Ask to explain", the bot asks for a 30-second voice note, and it becomes an `explain_it` attempt | Low |

Do not use "AI-written text" detectors as a flag. They are unreliable, and a false accusation costs a center a family. `[DECIDED]` in 40 already: humans decide.

### 4.6 Owner dashboard (V-HW-F8) and churn warning (V-HW-F10)

- **Funnel view:** `assigned → opened → submitted → reviewed → corrected → mastered`, broken down by branch (academy tenants under one `parent_center_id`), group and teacher, with week-over-week change. It reads the daily rollup.
- **Homework-to-retention:** join group completion rates with the next month's retention (`academy_contacts.lifecycle_stage` and `academy_payments`). This is the chart that sells the product. Show it only once there are enough months of data.
- **Churn warning:** extend `computeAtRiskForAcademy` with homework funnel signals (3 skipped assignments in a row, falling completion) and payment signals, and send the nudge to the **guardian**, not only the student.

### 4.7 Parents (V-HW-F9)

- `academy_guardians`, plus a guardian Telegram link: reuse `telegram_link_tokens` with a purpose field. The center sends a parent their invite link from the student's card.
- **Weekly summary:** Sunday evening cron → `send-telegram` with category `academic_required`. It covers done, missed, the score trend, one specific "improving at" line, and a link to the existing `parent-report` page.
- Guardian consent is stored before any message is sent to a parent of an under-18 learner (00, LG items in 90).

### 4.8 Gating and billing

- Add a capability check to the `academy` function: academy → `parent_center_id` → `partner_center_tier_subscriptions` → a capability map, the same pattern as `requireTierCapability` in partner-office. Share the map in `_shared/`, not copied.
- **Metering:** an "active student" is a contact with at least one `assigned` event in the month. Compute it monthly from the event log. This is the billing unit in 40.

## 5. Schood Courses, subsystem by subsystem

### 5.1 Course Studio (V-CRS-F1)

- **Manual first:** an outline editor (module → lesson → before / in / after blocks) inside `apps/academy`. Centers can build a course without AI from day one.
- **AI structuring second:**
  - Upload PDF or slides → extract the text → OpenRouter proposes modules, lessons, objectives and draft quiz items.
  - Everything lands as `draft`.
  - Quiz items are written into an **Assessment Cloud item bank as draft items**, so they go through its independent review flow (principles 2 and 5).
- **Publish** writes an `academy_course_versions` snapshot. Edits after that create the next version.

### 5.2 Course runs and the lesson calendar (V-CRS-F3, F4)

- Starting a run means choosing the course, version, group, teacher and start date. The system generates `academy_lesson_sessions` from the group's weekly slots, one lesson per session, and lets the teacher move or skip sessions. Holidays shift what comes after.
- **Each session drives:**
  - The before-class blocks, released N hours before the session and pushed to Telegram.
  - The teacher's in-class plan (`generate_classroom_lesson_plan` already exists and can draft it).
  - The after-class `homework_template` blocks, which become real `academy_assignments` due before the next session. This is the Homework OS hand-off.
- Attendance can attach to a session. The current per-day `academy_attendance` stays valid.

### 5.3 Unlock by check (V-CRS-F5)

- A module check is an assignment of type `test` linked to the module. **Unlock** means `academy_course_progress.state = passed` with `best_percent >= pass_percent`.
- **Enforce it on the server** in `student_assignments` and in the player, and enforce the dormant `prerequisite_id` at the same time.
- A teacher override exists for absences or illness, and it is audited.

### 5.4 Learner player (V-CRS-F6)

- **Two surfaces, one API:**
  - the Telegram Mini App (`TelegramAppPage`), which is the main one in Uzbekistan;
  - the Academy student view.
- **Audio-first:** before-class audio and PDFs can also be sent as Telegram files (D5), which gives offline use without building a PWA cache.
- **Video:** compressed renditions, a per-course storage limit through entitlements, and no autoplay.

### 5.5 Certificates (V-CRS-F8)

Use the **Assessment Cloud signed certificates** (QR-verified, two-person approval). Do not grow `issue_academy_certificate`. This needs the bridge (§6). Center branding comes from `academy_branding`.

### 5.6 Verified-results card (V-CRS-F7) and marketplace (V-CRS-F10)

- **Card:**
  - Use learners in a run who took a Schood mock (IELTS or SAT simulators, a future Math mock) within N days before the start and again after the end.
  - Show the median gain, the spread and n.
  - Hide the card below a minimum sample `[ASSUMPTION]`: start with n ≥ 15 completers with both mocks.
  - Completion rate is shown alongside.
  - Requires `academy_contacts.user_id` to be linked.
- **Marketplace (Launch+1, lead-based):**
  - Listing pages on schood.online.
  - "Enrol" creates a `sales_leads` row for the center and runs the existing `schood-online-bot` `/academy` funnel.
  - Schood touches no tuition money (the `[DECIDED]` launch payment model in 41).

## 6. The Academy ↔ Assessment Cloud bridge (shared, highest risk)

Both products need it: quizzes in Homework OS, module checks, finals and certificates in Courses. Build it once, and keep it narrow.

- **Direction:** Academy asks, Assessment Cloud delivers, results flow back. Do not merge classrooms and cohorts. Cohorts were kept apart on purpose (`CohortsWorkspace.tsx`).
- **Request:**
  - A new security-definer RPC (or an `assessment-cloud` route) callable only with the `academy` function's service role.
  - It takes `grant_academy_attempt(tenant_id, form_id, user_id, window, ref)` and returns a launch URL. It does not grant any Assessment Cloud staff rights (respecting `invitation-mail-template.ts`).
- **Result:** when a release is published, Assessment Cloud emits a domain event (the `domain_event_outbox` pattern). An Academy consumer writes the submission score and updates `academy_course_progress`, and emits `submitted` and `reviewed` events.
- **Certificates:** on run completion, Academy requests issuance under an `assessment_certificate_programs` row configured for that course.
- **Tests:** the bridge gets the same fixture coverage as the other Assessment services (`scripts/assessment-*-fixture.mjs`).

## 7. Order of work

Each phase ships on its own, behind a per-academy flag, and leaves production working. The sizes are rough `[ASSUMPTION]`s for one engineer with agents.

| Phase | Ships | Contents | Size |
|---|---|---|---|
| **0. Foundations** | Nothing visible | D1–D6 decided. Attempts, events, guardians, lesson sessions and capability gating migrations. Event emission from existing routes. Tighten `academy_submissions` RLS to staff of the classroom | M |
| **1. HW Core (pilot-able)** | Telegram hand-in with receipts, Mini App upload, review queue (manual marking, no AI), funnel dashboard v1, guardian link plus weekly summary | §4.1, 4.3, 4.6 (funnel only), 4.7 | L |
| **2. HW Results** | AI pre-mark (writing, speaking, quiz), mistake bank and corrections, trust signals, AI credit metering | §4.2, 4.4, 4.5 | L |
| **3. Bridge** | Assessment Cloud quizzes inside homework | §6 | M |
| **4. Courses Launch** | Manual Course Studio, versions, runs and lesson calendar, three-phase lessons, unlock-by-check, player, signed certificates | §5.1 (manual), 5.2–5.5 | L |
| **5. Later** | AI course structuring, math OCR, center-calibrated marking (F11), churn warning to guardians (F10), verified-results card, marketplace leads, per-center bots | §5.1 (AI), 4.2 (math), 4.6, 5.6 | — |

**Why Phase 1 has no AI:** hand-in plus a fast queue plus parent summaries is enough to test the pain behind V-HW with a pilot center (the validation gate in 01). It is also the cheapest phase to throw away if the pilot says no. AI pre-marking is what turns a working product into the Results tier.

## 8. Pilot plan

1. **Pick the center:** 3 groups or more, ideally one writing-heavy (IELTS) and one with handwritten work.
2. **Week 0 baseline, before anything ships:** today's homework completion rate per group, the minutes teachers spend marking per submission (a stopwatch sample of 20), and how parents hear about homework now. Record it in 40. V-HW's done-when compares against this.
3. **Done-for-you setup** (V-HW-F12): import groups and students, issue Telegram invite links to students and parents in class, run one teacher session, and attend the first two weeks.
4. **Read the numbers weekly:** funnel conversion, correct-filing rate, review time, and parent summary open rate (`telegram_notification_effectiveness`).
5. **After one term:** go or no-go on Phase 2 pricing, and record setup hours per center.

## 9. Risks specific to the build

- **Wrong-assignment filing** erodes trust quickly. Mitigation: the `Change` button on every receipt, and tracking the re-file rate.
- **AI cost runs away** on voice and images. Mitigation: per-academy credits, downscaling images before vision calls, and a cap on voice minutes.
- **Minors' media** (photos and voices) in S3. Mitigation: private bucket, short signed URLs (6 hours today), RLS tightened in Phase 0, and a retention period per academy `[VERIFY]` with legal (90).
- **Bridge coupling** between two security models. Mitigation: one narrow RPC, service role only, no shared staff rights, fixture tests.
- **Course edits breaking live cohorts.** Mitigation: version pinning from the first migration.

## 10. Open questions to add to 90

- Bot API file limits and media-group behaviour on the current bot `[VERIFY]`.
- STT provider and cost for Uzbek and Russian voice homework `[VERIFY]`.
- Vision-model OCR quality on Uzbek, Russian and math handwriting `[VERIFY]`.
- Retention period and guardian consent for homework media of minors `[VERIFY]` (LG-01/02).
- Owner decisions D1–D6 (§2).

## 11. Release `academy-homework-os-courses` (code ready 2026-10-22)

**Built**
- `supabase/functions/academy-learning/`: staff review queue and decisions (approve or edit through `academy_grading_command`, return for correction), corrections, mistake bank, funnel, plan and settings, course unlock rules, Telegram hand-in, AI pre-mark sweep. Tests: `npm run test:academy-learning:edge`.
- `supabase/functions/_shared/homework-ai.ts`: the pre-mark prompt, parser and free-model guard.
- `supabase/functions/academy/`: learners see locked modules; `set_lesson_progress` and `start_quiz` refuse locked modules with 409.
- `workers/schood-bot`: forwards media, plain text, `/homework`, `/center` and `hw:`/`ctr:` buttons; falls back to the old replies when the function answers `handled:false`.
- `apps/academy`: the **Homework** screen (review queue, funnel, course checks, plan and settings) behind `VITE_ACADEMY_HOMEWORK_OS`; uz and ru translations; route test.
- `scripts/fixtures/academy-homework-os.sql`: database-level checks of every rule above against the real Academy commands.

**Launch switches (owner decisions, in order):** `telegram_handin.enabled` → `VITE_ACADEMY_HOMEWORK_OS=true` → `premark.enabled` → `digest.enabled`. Set Schood Teaching prices and activate the plans before `billing.enforced`.

**Left for later releases:** see §12.

## 12. Release `academy-homework-launch` (code ready 2026-10-23)

Owner go-ahead on 2026-10-22: "do them all, make it perfectly ready for use".

**Built**
- **Launch:** migration `20261024110000_academy_homework_launch.sql` turns on Telegram hand-in, AI pre-marking and the weekly parent summary, and adds `/homework` and `/center` to the student bot's menu. `billing.enforced` stays off until real Schood Teaching prices exist. The Pages variable `VITE_ACADEMY_HOMEWORK_OS=true` shows the Homework screen.
- **Telegram Mini App:** a "Homework to hand in" card with photo, audio, video and PDF upload (up to 6 files, 20 MB each and 50 MB total), centre switching and "My mistakes". These are served by `academy-learning` actions `miniapp_homework`, `miniapp_submit`, `miniapp_center` and `miniapp_mistakes`, authenticated by Telegram's signed initData. The bot and the Mini App share one save path (`recordHandIn`).
- **Learners in Academy:** a **My mistakes** screen.
- **Catalogue (V-CRS-F10, lead-based):**
  - Migration `20261024105000_academy_course_listings.sql`.
  - Staff list a published course from Homework → Course checks → "Public listing".
  - Anyone can browse **schood.online/courses** in uz, ru and en.
  - "Request a place" creates a lead in that academy's Admissions pipeline (`academy_create_lead`), rate-limited per visitor.
  - Completion appears only once at least 15 learners have taken the course.
  - Listing needs a centre tier or a Schood Teaching plan once billing is enforced.

**Course versions pinned per run (release `academy-course-versions`, code ready 2026-10-24)**

Editing a course never changes a group that is already running it.
- **Migration** `20261024231500_academy_course_versions.sql`:
  - `academy_course_versions` holds one immutable snapshot per publish: course fields, published modules with their `unlock_rule`, published lessons, published quizzes and their questions (with answer keys, so the table is service-role only). A publish whose content matches the latest snapshot does not create a new version.
  - `academy_classroom_courses` gains `version_mode` (`live` or `pinned`), `course_version_id`, `version_pinned_at` and `version_pinned_by`.
  - Publishing snapshots the course: a trigger on `academy_courses` fires on every publish, whichever path published it, and `publish_course` records the publisher. `publish_course` now publishes modules and lessons before the course row, so the snapshot sees them.
  - A new run starts on the latest version. A run assigned while the course is still a draft starts on the first version when it is published. Re-assigning an existing run (the `assign_course` upsert) keeps its version.
  - `academy_module_unlocked` and the lesson-progress and quiz-attempt gates read the run's version, so a rule changed on the live course does not lock or unlock modules for a group on an older version.
  - `academy_public_course_catalog` shows the latest version: what a new group would get, not unpublished edits. `academy_course_completion` counts each group against the lessons of its own version.
- **Backward compatible:** every run that existed before the migration is `live` and reads the live rows exactly as before. Courses that were already published get version 1, but no existing run is pinned to it.
- **Learners** (`supabase/functions/academy/`): `student_curriculum` serves a pinned run from its snapshot, in the same row shape as live rows and without answer keys. `set_lesson_progress` and `start_quiz` check the lesson or quiz against the run's version. `submit_quiz` grades against the version the attempt started on, which is stored in the attempt's metadata.
- **Staff:** the curriculum screen shows which version a group runs and the latest one. Staff use **Move this group to version N** (`move_course_version` → `academy_classroom_course_move_version`) to move a group. The move needs `manageAssignments` on the group, and it is refused if a newer version was published since the screen loaded. Moving a `live` group pins it. Learner progress is keyed by lesson, so lessons that exist in both versions keep their progress. **Publish new version** is available on published courses.
- **Not versioned yet:** lesson video attachments (`academy_lesson_media`) and video playback (`academy-video`) still read live rows. So does the teacher lesson flow (`_shared/academy-teacher-flow.ts`). Hard-deleting a lesson still cascades through progress; there is no delete action in Academy today.
- **Tests:** `supabase/functions/academy/course-version.test.ts` covers the edge function side. `scripts/fixtures/academy-course-versions.sql` covers the rules at database level. `scripts/test-academy-course-versions.mjs` runs that fixture in an in-memory PostgreSQL (PGlite), using the real curriculum, unlock-gate and listing migrations. All of these run in `npm run test:academy:edge`. The fixture can also be run against a copy of the production schema inside a rolled-back transaction.

**Left for later releases**
- Three-phase lesson blocks, Telegram delivery of lesson audio and PDFs, Course Studio AI structuring. Versioning of lesson videos and the teacher lesson flow.
- The Assessment Cloud bridge (§6) for module checks and signed certificates.
- Collecting course fees through Schood (41 F12/F13: instalments, payouts, fiscal receipts).
- Math OCR quality checks, centre-calibrated marking (V-HW-F11), churn warnings to parents (V-HW-F10).
- Schood Teaching prices are set (D6). Turn on `billing.enforced` only after Click checkout is confirmed working for tenant plans; until then Schood support activates plans manually.

### D4: homework mistakes in the learner's Schood English (release `academy-homework-mistake-feed`, code ready 2026-10-24)

**Consent**
- Off by default, one setting per centre. Stored in `academy_homework_feed_consents` with `granted_at`, who granted it and the policy version; `academy_homework_feed_consent_events` keeps every grant and revoke, and the centre's audit log records them.
- **Learners** turn it on in Academy → My mistakes or in the Mini App's "My mistakes", and must tick "I am 18 or older". Schood holds no date of birth, so this is a self-declaration `[VERIFY]` with legal (LG-02).
- **Under-18s:** a guardian with current, consented parent access that includes homework turns it on from the parent page (Grades & homework). The child needs a Schood account linked to the centre.
- **Revoking** is always allowed, by the learner or the guardian. It deletes every copied row from that centre and stops new ones. If the centre re-links the learner record to a different Schood account, the consent ends on its own.

**What flows, and where**
- Only open mistakes tagged `grammar.*`, `vocabulary.*`, `spelling` or `punctuation`, written in Latin script. Maths, task and structure comments, and work in other scripts, stay in the centre.
- Copied fields: excerpt, correction, explanation, tag and the centre's name. Assignment titles, submissions, scores and teacher names never leave the centre, and nothing flows back from Schood English to the centre.
- `learner_language_errors` (service `academy_homework`): `grammar.<topic>` rows feed Today's "fix this" lessons, using the same topics as `_shared/english-mistakes.ts` (a test keeps the two lists equal). All rows appear under Review → Mistakes.
- `learner_review_items` (`homework:<mistake id>`, due at once): Review asks the learner to correct the excerpt, then shows the teacher's explanation.
- Copying runs in database triggers on `academy_homework_mistakes`, so the web, Mini App and Telegram paths behave the same. A mistake that is fixed, dismissed or deleted removes its copies. A copy practised in Schood English and then made again at the centre is reopened.

**Code:** `supabase/functions/academy-learning/consent.ts` (actions `student_mistake_feed[_set]`, `miniapp_mistake_feed[_set]`, `guardian_mistake_feed[_set]`), `StudentMistakesView.tsx`, `GuardianMistakeFeed.tsx`, `TelegramHomeworkPanel.tsx`, and in `hub` the skill shown for homework rows. Tests: `npm run test:academy-learning:edge`, `_shared/english-review.test.ts`, and `scripts/fixtures/academy-homework-mistake-feed.sql` (consent, copying, tenant boundary, revoke, guardian path and browser grants, checked against the production schema).
