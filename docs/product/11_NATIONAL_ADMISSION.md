# V-ADM — National admission test and subject certificates (Math first)

| Field | Value |
|---|---|
| ID | V-ADM |
| Status | idea |
| Priority | P1, largest market |
| Depends on | PE-02 exam-format registry, PE-03 subject engine, PE-04 entitlements |
| Channels | B2C (students and parents), B2B centers (the main channel), schools |

## Thesis

Almost every school leaver prepares for the national university admission test, and many also pursue subject certificates that can affect admission. Centers already run large prep programs for this. Schood can own the practice, feedback and prediction layer: an adaptive daily plan, realistic mocks, a predicted score, and a center dashboard. Math comes first because it is required for many study programs and our SAT Math engine is a head start.

## Who and why

| Persona | Job to be done | Trigger |
|---|---|---|
| Grade 10–11 student and gap-year applicant | Reach the score their target program needs | Admission season |
| Parent | Know whether their child is on track and what to pay for | Report cards, mock results |
| Prep center | Run mocks, track every student, show parents progress | Retention and marketing |
| School teacher | Diagnose class weak topics | Exam readiness |

## Target exams (every format detail is `[VERIFY]`)

- **The national university admission test:** subject blocks, number of questions per block, timing, scoring weights and penalties. Confirm the current year's specification from the official assessment agency (see 90).
- **National subject certificates**, starting with Mathematics: levels, format, validity and how they convert to admission points.
- **Rule:** every format lives as a PE-02 registry entry with its source URL and checked date, so annual changes are data updates.

## Learner journey (the loop)

1. **Place:** a 30-minute diagnostic over the official topic list. Result: mastery per topic and a predicted score band.
2. **Aim:** target program or score plus exam date (pre-filled with the official exam window).
3. **Daily:** 20–40 minutes of topic practice ordered by score impact: weight × weakness × time left.
4. **Gap:** a topic heat-map, error patterns (calculation slips vs concept gaps), and "points recoverable" per topic.
5. **Outcome:** a full timed mock in the official format, predicted score with uncertainty, and a weekly parent report.

## Features

| ID | Feature | MVP? |
|---|---|---|
| V-ADM-F1 | Official topic taxonomy for Math (from the published program) | MVP |
| V-ADM-F2 | Math bank: about 1,500 reviewed items with full worked solutions, topic and difficulty tags | MVP |
| V-ADM-F3 | Diagnostic placement and topic mastery model (PE-03) | MVP |
| V-ADM-F4 | Format-true mock simulator with official timing and scoring (PE-02) | MVP |
| V-ADM-F5 | Score prediction with uncertainty, calibrated on mock-to-real outcomes | MVP-lite, improves with data |
| V-ADM-F6 | Step-by-step AI hints that never reveal the answer outright; worked solutions after the attempt | MVP |
| V-ADM-F7 | Parent report via Telegram (weekly) | MVP |
| V-ADM-F8 | Center dashboard: class heat-map, mock league table, at-risk students (Academy) | MVP for B2B |
| V-ADM-F9 | Mock-exam events: a nationwide Sunday mock with a ranking | Later; a growth loop |
| V-ADM-F10 | Further subjects: native language and literature, history, physics, chemistry, biology, English-for-admission | Later, one at a time |

## Reuse map

- **Exam engine and practice patterns:** `apps/sat-simulator`, `apps/sat-practice`, `packages/sat-core`. The SAT Math item types, timer, review and score report are the template.
- **Content authoring, review and center delivery:** Assessment Cloud (banks, blueprints for topic coverage, analytics with item statistics).
- **Center operations:** `apps/academy` (groups, attendance, parents).
- **Reports:** `parent-report`, `score-prediction`, `recommendations`.

## Build list (new work)

1. PE-03 subject engine: non-language mastery and planning (topic graph instead of CEFR skills).
2. PE-02 registry entry for the admission Math format.
3. Math content pack in Uzbek and Russian (both languages of instruction). `[DECIDED]`: content must exist in both.
4. Math rendering: formulas (KaTeX), diagrams and handwritten-work upload for open responses (later).
5. Prediction calibration: collect consented real results to calibrate predictions.

## Content plan

- **Volume for launch:** about 1,500 Math items covering 100% of official topics, 6 full mocks. `[ASSUMPTION]`
- **Quality bar:** every item has a worked solution and passed independent review. Item statistics from Assessment Cloud analytics retire bad items.
- **Language:** Uzbek (Latin script) and Russian versions of every item, reviewed separately.
- **Licensing:** original items only. Official published samples only where their licence allows.

## Monetization (hypotheses)

- **B2C:** a season pass from registration to exam day, plus mock packs. `[ASSUMPTION]`
- **B2B centers:** per student per month during the prep season. Centers resell or bundle it into tuition. `[ASSUMPTION]`
- **Growth:** free nationwide mocks with paid detailed analysis.

## Done when

- Math covers every official topic with reviewed items in uz and ru.
- The mock matches the verified official format, including scoring rules, with the source recorded.
- Predicted vs actual score is tracked for at least one season with consented data, and the published error band reflects it.
- A center can run a mock for a whole group and see the class heat-map.

## Risks

- **Format and policy change every year.** Mitigation: PE-02 registry, and a yearly format review before the season.
- **Heavy content cost.** Mitigation: start with Math only; use item statistics to focus writing.
- **Seasonality.** Revenue concentrates before the exam window, so pair with year-round school-level practice and certificates.
- **Trust.** Never promise admission; publish prediction accuracy honestly.

## Out of scope (for now)

Primary-school content, olympiad-level problems, live classes.
