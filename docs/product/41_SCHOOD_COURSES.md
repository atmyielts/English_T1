# V-CRS — Schood Courses (a Coursera for centers, blended and results-verified)

| Field | Value |
|---|---|
| ID | V-CRS |
| Status | building: unlock-by-check and the paid publishing gate are in release `academy-homework-os-courses` (42 §11) |
| Priority | P1/P2 for B2B; after V-HW proves Homework OS with pilot centers |
| Depends on | V-HW Homework OS, Academy groups and timetable, Assessment Cloud (checks, review, certificates, analytics), PE-04, PE-05, PE-06 |
| Channels | B2B centers (Course Studio), star teachers (creators), B2C learners (marketplace, later) |

## Thesis

Self-paced video courses have tiny completion rates, and they compete with centers. Schood Courses flips both:
1. **Course Studio** turns a center's existing offline curriculum into a structured online course quickly.
2. **Courses run as blended cohorts** with real dates, a real teacher and a real group. Progress is earned by passing checks, not by watching videos.
3. **The marketplace ranks courses by results Schood has verified.** It lets large centers and star teachers reach regions where they have no branch.

No other platform in the market can rank courses by verified outcomes, because the outcomes come from Schood's own exams and mocks. `[ASSUMPTION]`: the competitive claim needs a market scan before external use.

## Who and why

| Persona | Job to be done |
|---|---|
| Large center | Sell its program beyond its branches; standardize quality across branches and new teachers |
| Star teacher (Telegram or Instagram audience) | Turn their audience into structured, paid cohorts without building tech |
| Regional student | Learn from the best Tashkent center or teacher without moving |
| Center's own students | One place for before-class, in-class and after-class work |

## Course architecture

```
Course (built by a center or teacher, optionally using Schood library blocks)
 └─ Modules
     └─ Lessons
         ├─ Before class: read, watch or listen (audio-first, compressed video, offline download)
         ├─ In class: teacher plan, slides, live-session link or classroom
         └─ After class: Homework OS tasks (V-HW)
     └─ Module check: an Assessment Cloud form; passing unlocks the next module
 └─ Final assessment: an Assessment Cloud sitting (+ Proctor record-and-review, later)
 └─ Schood-verified certificate under the center's brand (QR-verified)

Course run = Course + Academy group + teacher + schedule
```

## Features

| ID | Feature | Stage |
|---|---|---|
| V-CRS-F1 | Course Studio: upload PDFs, slides and recordings; AI drafts modules, lessons and quizzes; the center's teachers review everything before publishing (Assessment Cloud review flow) | Launch |
| V-CRS-F2 | Schood library blocks: ready lessons and tests (IELTS, SAT, English skills; Russian and Math as those verticals land) usable inside any course | Launch |
| V-CRS-F3 | Course runs tied to Academy groups: dates, teacher, timetable, attendance | Launch |
| V-CRS-F4 | Lesson structure: before class, in class, after class (Homework OS) | Launch |
| V-CRS-F5 | Unlock by passing checks, not by watching | Launch |
| V-CRS-F6 | Low-bandwidth delivery: audio-first, compressed video, offline downloads, Telegram reminders | Launch |
| V-CRS-F7 | Verified-results card per course: score gains and completion from Schood mocks and verified real results, with minimum sample sizes | Launch for own-center courses; required before a course is listed publicly |
| V-CRS-F8 | Schood-verified certificate with center branding and a QR code (Assessment Cloud certificates) | Launch |
| V-CRS-F9 | Star-teacher publishing: under a center's brand (center owns the course) or independently on a paid Schood Teaching plan `[DECIDED]` 2026-10-22 | Launch for both; revenue share from course sales stays Launch+1 (needs F13) |
| V-CRS-F10 | Marketplace: browse, compare by verified results, enrol into a remote cohort; the center's teachers review homework remotely | Launch+1 |
| V-CRS-F11 | Proctored final exam for certificates (Proctor record-and-review) | Later; Proctor resumed 2026-10-22 as Proctor Lite (record-and-review, human review), so plan F11 on it |
| V-CRS-F12 | Instalment payments for marketplace courses | Later stage |
| V-CRS-F13 | Schood as payment agent: collect for centers, split payouts, issue fiscal receipts per sale | Later stage |

## Launch payment model (keeps launch free of agent and tax work)

`[DECIDED]` F12 and F13 are not required to launch.
- **Course Studio, own-center runs:** the center pays Schood a SaaS fee and charges its students as it does today. Schood doesn't touch tuition money.
- **Marketplace at Launch+1, before F13:** a listing is a lead to the center. Enrolment and payment go through the center's own payment method, and Schood bills the center a listing or lead fee or subscription. Schood never holds center revenue until F13's legal, contract and fiscal work is done (see 90).

## Star teachers (supply side)

- **Under a center:** the course belongs to the center, and the teacher is credited. This protects centers that fear losing star teachers. Make the ownership explicit in the listing contract.
- **Independent (Launch+1):** the teacher owns the course and Schood takes a revenue share. This needs F13, or the teacher's own payment method, for collection.
- **Quality bar:** independent teachers' courses need a verified-results card before they get marketplace ranking.

## Data network effect (the moat)

- Courses built from Schood library blocks share item IDs, so results are comparable across centers and teachers. That powers the verified-results ranking and better predictions (same principle as V-HW).
- **Ranking uses only verified results,** with minimum cohort sizes and confidence shown. Never use star ratings alone.

## Done-for-you course digitization (service-led launch)

- **Paid service:** the Schood team builds the center's first course from its materials with Course Studio and runs the first cohort alongside the center.
- Internal tooling and templates cut setup hours each quarter; the goal is self-serve Course Studio.

## North-star metric

The same as V-HW: **verified learning minutes per student per week,** measured across course runs. Course-specific supporting metrics:
- module-check pass rate;
- run completion rate (target well above typical self-paced MOOC completion);
- verified score gain per course;
- remote-cohort revenue per center (from Launch+1).

## Reuse map

The implementation plan, with verified code paths and gaps, is in [42_HOMEWORK_AND_COURSES_BUILD_PLAN](42_HOMEWORK_AND_COURSES_BUILD_PLAN.md). Note that Academy and Assessment Cloud have no integration today; the bridge is 42 §6.

- **Academy:** groups, timetable, staff, `academy_classroom_resources` and progress, assignments, parents.
- **Homework OS (V-HW):** all after-class work.
- **Assessment Cloud:** quizzes and module checks, independent review, final sittings, certificates (signed, QR-verified), item analytics.
- **Media:** private R2 plus the scanning path for uploaded course materials.
- **Library content:** the English skill apps and IELTS, SAT and TOEFL content as blocks.
- **AI:** OpenRouter path for structuring uploaded material into lessons and drafting quizzes, always human-reviewed.
- **Payments:** Click and `entitlements` for SaaS billing at launch.

## Build list (new work)

1. The Course, Module, Lesson and Course-run data model, linked to Academy groups (record the extend-or-new-tables decision here).
2. Course Studio authoring UI and the AI structuring pipeline, with mandatory review.
3. The learner course player (mobile-first, offline, audio-first).
4. Unlock-by-check logic using Assessment Cloud results.
5. Verified-results card computation (minimum sample sizes, confidence).
6. Marketplace listing, search and remote-cohort enrolment (Launch+1, lead-based payment).
7. Star-teacher accounts and ownership model.

## Monetization (hypotheses)

- **Course Studio SaaS:** per active learner per month, or included in the center's Homework OS tier. `[ASSUMPTION]`
- **Library block licensing:** an add-on per center. `[ASSUMPTION]`
- **Marketplace:** a listing, lead or subscription fee at Launch+1; commission once F13 exists. `[ASSUMPTION]`
- **Done-for-you digitization:** a one-off fee. `[ASSUMPTION]`

## Done when (launch)

- A pilot center runs at least one blended course with Course Studio for a full term: three-part lessons, unlock-by-check, Homework OS after class, a final assessment and a branded certificate.
- Completion and module pass rates are recorded against the center's offline baseline.
- The verified-results card computes correctly with the minimum sample rule.

## Later stages (not required for launch)

- F12 instalments.
- F13 Schood as payment agent (contracts, fiscal receipts, payouts).
- F11 proctored finals on Proctor Lite.
- Independent star-teacher monetization through Schood collection.

## Risks

- **Content quality varies across centers.** Mitigation: mandatory review, plus the results-based ranking.
- **Centers fear Schood will steal their students.** Mitigation: center branding, center-owned courses and data, and Schood never markets directly to a center's students.
- **Video bandwidth and cost.** Mitigation: audio-first and compressed video, per-course storage limits through entitlements.
- **Results claims.** Mitigation: verified data only, sample sizes shown, no guarantees (00_PRINCIPLES).

## Out of scope

Open self-paced MOOCs without a teacher or cohort, live video infrastructure of our own (link to existing tools at launch), university-accredited degrees.
