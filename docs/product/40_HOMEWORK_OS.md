# V-HW — Homework OS (the hand-in funnel for Academy)

| Field | Value |
|---|---|
| ID | V-HW |
| Status | building (release `academy-homework-os-courses`, see 42 §11) |
| Priority | P1 for B2B; the first flagship center product |
| Depends on | Academy (groups, assignments, submissions), Telegram bots, AI grading, PE-04 entitlements |
| Unlocks | V-CRS Schood Courses (its after-class layer is Homework OS) |
| Channels | B2B centers (main), large multi-branch centers (Network tier) |

## Thesis

Large centers handle thousands of homework submissions a week across paper, Telegram chats and teachers' phones. Nobody can see it, and it's where students quietly fall behind and then leave. Homework OS turns homework into a measured funnel. Submission is frictionless through Telegram, AI pre-marks the work, teachers review a queue in minutes, every mistake feeds the next task, and owners see how homework predicts retention. `[ASSUMPTION]`: the pain and its scale are founder judgment, to be validated in pilot interviews.

## Who and why

| Persona | Job to be done | Pain today |
|---|---|---|
| Teacher | Check homework fast and fairly; know who is behind before class | Hours of marking on a phone; lost photos in chats |
| Student | Hand in easily, get feedback quickly, know what to fix | Has to install apps and log in; feedback arrives late or never |
| Center owner or branch manager | See which groups and teachers keep students working, and catch churn early | No data; finds out a student left when they stop paying |
| Parent | Know whether homework is done and improving | Hears nothing until results day |

## The funnel (core concept)

`Assigned → Opened → Started → Submitted → Pre-marked → Teacher reviewed → Student corrected → Mastered`

- Every step is an event with a timestamp, tied to the student, group, teacher, branch and assignment.
- Drop-off at each step is visible per group, teacher and branch. This is the owner's main view.
- **"Mastered"** means the follow-up check on the same skill or topic was passed, not just that the work was handed in.

## Features

| ID | Feature | Stage |
|---|---|---|
| V-HW-F1 | Assignment builder: from Schood library blocks, from Assessment Cloud quizzes, or free-form (text, file, photo, audio, video), with due dates tied to the Academy timetable | Launch |
| V-HW-F2 | Telegram-native hand-in: the student sends a photo, voice note, video or text to the center's bot, and it's filed to the right assignment automatically (one open task, or a one-tap choice when several are open) | Launch |
| V-HW-F3 | In-app hand-in on web and mobile web for longer work | Launch |
| V-HW-F4 | AI pre-marking: writing (rubric band and comments), speaking (band and comments), handwritten math (OCR, then step check), auto-marked quizzes | Launch (writing, speaking, quizzes); math OCR at Launch+1 |
| V-HW-F5 | Teacher review queue: sorted by due date and urgency, one-click approve or edit of the AI draft, voice-comment reply, keyboard-first, mobile-friendly | Launch |
| V-HW-F6 | Mistake bank and corrections loop: every corrected mistake is stored per student and skill or topic, and auto-generates the next revision task | Launch |
| V-HW-F7 | Trusted homework (anti-AI-cheating): see the section below | Launch (core set) |
| V-HW-F8 | Owner and manager funnel dashboard: completion by group, teacher and branch, and the homework-to-retention link | Launch |
| V-HW-F9 | Parent weekly Telegram summary: done, missed, improving | Launch |
| V-HW-F10 | Churn early warning: missed homework, attendance and payment signals produce an at-risk list and an automatic parent nudge | Launch+1 |
| V-HW-F11 | Center-calibrated AI marking: a senior teacher marks about 30 samples, the AI aligns to the center's standard, and a consistency report per teacher shows who marks too high or too low | Launch+1 |
| V-HW-F12 | Done-for-you onboarding service (see section below) | Launch (as a paid service) |

## Trusted homework (anti-AI-cheating) — required at launch

Grade how the work was produced, not only the result.
- **Timed in-app writing:** the editor records the writing process (time spent, typing pace, pastes) and flags large pasted blocks. Store process metrics only, never keystroke content beyond the final text. `[DECIDED]` privacy rule.
- **Prefer spoken answers** where the skill allows: voice is far harder to outsource.
- **Handwritten work** is submitted as photos for math and early-level writing.
- **Explain-it check:** when a submission looks suspicious, the student records a 30-second explanation of the answer. The teacher sees the flag and the clip.
- **Never accuse automatically.** Flags are signals for the teacher; humans decide. `[DECIDED]`
- **Sell it as a feature:** "homework you can trust."

## Data network effect (the moat) — design from day one

- **Shared item identity:** library tasks and quiz items keep stable IDs across centers, so difficulty, discrimination and typical mistakes are learned from all centers together.
- **Consent and aggregation:** centers agree that anonymized aggregate data improves the shared models. Raw student data never leaves the center's tenant, and benchmarks show only aggregates with minimum group sizes. `[VERIFY]` with legal (see 90, LG-01 and LG-02).
- **What gets better with scale:** AI pre-mark accuracy, item difficulty estimates, "typical mistake" explanations, score prediction and cross-center benchmarks. This is why a single-center competitor can't catch up.

## Done-for-you onboarding (service-led launch)

- **Paid setup package** for large centers: we import groups, students and teachers, digitize their homework sets into the library, connect their Telegram bot, train teachers in one session, and run the first two weeks with them.
- **Internal tooling** makes this fast for the Schood team (bulk import, templates). Make it self-serve later.
- **Track setup hours per center.** The goal is to cut them each quarter.

## North-star metric

**Verified learning minutes per student per week:** time spent on homework that passed the trust checks and reached "Teacher reviewed" or "Auto-marked". It drives completion, retention and results. Use it to sell to centers and to steer the product.

Supporting metrics:
- funnel conversion at each step;
- median teacher review time per submission;
- AI-mark agreement with teachers;
- corrections completed;
- at-risk students saved;
- retention of groups with high vs low completion.

## Reuse map

The implementation plan, with verified code paths and gaps, is in [42_HOMEWORK_AND_COURSES_BUILD_PLAN](42_HOMEWORK_AND_COURSES_BUILD_PLAN.md).

- **Academy:** groups, timetable, staff roles, existing `assignment` / `submission` model, `academy_classroom_resources`, `academy_engagement`, the `academy_scheduler` cron (at-risk). There is no parent entity yet, only `parent_report_tokens` (see 42 §4.7).
- **Telegram:** `workers/schood-bot`, `workers/schood-online-bot`, `supabase/functions/telegram-app`, `telegram-link`, `send-telegram`.
- **AI grading:** `writing-tutor` and `speaking-coach` (extract their grading cores into `_shared/`), `grade-writing-v2` (exam sessions only). `feedback-engine` is a template stub with no AI.
- **Files:** Academy submissions already upload to S3 through `_shared/media-storage.ts`. The Assessment Cloud R2 path (with scanning) applies to quizzes delivered through the bridge (42 §6).
- **Quizzes, review and analytics:** Assessment Cloud forms, item statistics.
- **Reports:** `parent-report`.

## Build list (new work)

1. The funnel event model and owner dashboard. Decide whether it extends Academy tables or is a new `homework_*` set; record the decision here. Recommendation in 42 §2 (D2): extend Academy tables.
2. Telegram hand-in routing: bot to assignment matching, media to the scanning path, receipts back to the student.
3. Teacher review queue UI built for speed.
4. Mistake bank and the auto-generated revision tasks.
5. Trusted-homework capture (writing-process metrics, explain-it clips) and flags.
6. Handwriting OCR and math step checking (Launch+1). `[VERIFY]` OCR quality for Uzbek, Russian and math notation.
7. Shared item IDs and aggregation pipeline with consent flags.

## Monetization (hypotheses)

- **Per active student per month,** in tiers: Core (hand-in, review queue, parents), Results (plus AI pre-marking, mistake bank, dashboards), Network (plus multi-branch, calibration, churn warning). `[ASSUMPTION]`
- **One-off setup fee** for done-for-you onboarding. `[ASSUMPTION]`

## Done when (launch)

- A pilot center runs one full term with Homework OS for at least 3 groups.
- Telegram hand-in files at least 95% of submissions to the right assignment without manual fixing.
- Median teacher review time per submission is measurably lower than the center's baseline (record both).
- The owner dashboard shows the funnel by group and teacher, and parents receive weekly summaries.
- Trusted-homework flags are live, and no automatic penalties exist.

## Later stages (not required for launch)

- AI-marking calibration to the center's own standard (F11) and churn early warning (F10), if they don't make Launch.
- Self-serve onboarding replacing the done-for-you service.

## Risks

- **Teachers resist new tools.** Mitigation: Telegram-first, review faster than their current method, done-for-you setup.
- **AI pre-mark errors damage trust.** Mitigation: the teacher always approves; publish agreement rates per center.
- **Privacy of process data and minors.** Mitigation: minimal process metrics, guardian consent, legal review (90).

## Out of scope

Full gradebook replacement for state schools, plagiarism detection against the web, live video classes.
