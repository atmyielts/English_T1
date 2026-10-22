# Schood Admission (national admission test prep, Maths first)

A separate Schood service, built like Assessment Cloud, Exam and Proctor: its own app, Pages project, subdomain and server function. It shares the Schood account, design (`packages/service-design`) and uz/ru/en localization (`packages/service-i18n`). It does not live inside Academy or the main platform.

Product thesis and feature list: `docs/product/11_NATIONAL_ADMISSION.md` (strategy pack, V-ADM).

## Architecture

| Part | Where | Status |
|---|---|---|
| Engine: exam formats, topic graph, mastery, daily plan, prediction | `packages/subject-core` | Phase 1, built |
| Formula rendering, `\( … \)` inline and `\[ … \]` display | `packages/assessment-web/src/MathText.tsx` (KaTeX 0.19.0, loaded only when a question has a formula) | Phase 1, built; used in Exam and Assessment Cloud previews |
| Question bank, review and item statistics | Assessment Cloud, in a Schood content workspace; each question's `classification` holds its topic codes and estimated difficulty, and the private key holds the worked solution | Phase 2 |
| Learner state (goal, mastery, answers, daily plans) | New `learner_subject_*` tables, separate from the English `learner_language_*` tables | Phase 2 |
| Server API | `supabase/functions/admission` | Phase 2 |
| Learner app and centre view | `apps/admission`, Pages project `schood-admission`, working domain `admission.schood.online` | Phase 2 |
| Full mocks for centre groups | Assessment Cloud sittings delivered in Exam | Phase 2 |
| Parent report | Telegram, through the existing bots | Phase 3 |
| Season pass and centre seats | `products` and `entitlements` through Click | Phase 3; blocked on the Click static IP and the pending payment release |

## The engine

- **Formats (PE-02)** are data records with their sources. `publishBlockers` refuses to publish a format without an official source URL, a checker, an effective date, duration, the wrong-answer rule and no open checks. Mocks pin the version they were built for.
- **Topics (PE-03)** form a prerequisite graph. Every topic says which blocks it appears in (compulsory, specialised) and its relative weight.
- **Mastery** is a Rasch-style ability per topic, updated with a Laplace step after each answer: big moves early, small moves once evidence builds up. Evidence fades with a 30-day half-life, so stale topics come back. Correct answers reached with hints count as partial. Five boxes schedule reviews at 1, 2, 4, 8, 16 and 32 days.
- **Daily plan**: priority = points at stake × (1 − mastery), halved while a prerequisite is weak, with weak prerequisites inheriting half the urgency of the topics they unlock. In the last 14 days, partly known topics are preferred over brand-new ones. Due reviews come back. The plan fits the learner's minutes (1.5 minutes a question in the compulsory block, 3 in specialised).
- **Prediction** gives expected points in the learner's maths section with an 80% range. Exam-day luck is independent per question; uncertainty in ability is treated as shared across topics, so the range stays wide until there is real evidence. It is not calibrated against real results yet, so it is always shown as an estimate.

## What we know about the format (checked 2026-10-22, from press and prep sites only)

- **Admission test 2026/2027:** 5 subjects, 90 questions, 189 points.
  - Compulsory block: native language, Mathematics and History of Uzbekistan, 10 questions each at 1.1 points (11 points per subject).
  - First specialised subject: 30 questions at 3.1 points (93).
  - Second specialised subject: 30 questions at 2.1 points (63).
  - Source: [Spot.uz, 17 March 2026](https://www.spot.uz/oz/2026/03/17/admission2026), reporting the ministry's press service.
- **Maths national certificate** (from prep sites):
  - Format: 45 tasks in 150 minutes, Rasch-scaled to 75 points, no calculator.
  - Grades: A+ 70, A 65, B+ 60, B 55, C+ 50, C 46.
  - Valid 3 years.
  - Converts to admission points: 11 in the compulsory block for any grade. For the first specialised subject, A or A+ gives 93 and C gives 65.8; for the second, A or A+ gives 63 and C gives 44.6.
  - Sources: [testmakon.uz](https://testmakon.uz/milliy-sertifikat/matematika/), [5ball.uz](https://5ball.uz/matematika-sertifikat/).
- **Still to verify on the agency's own site (uzbmb.uz):**
  - test duration, wrong-answer rule, question types, calculator rule and exam window;
  - the certificate task count and types;
  - the B+ conversion (85.8 or 85.9);
  - the official maths test programme, which the topic list must be checked against.

Both formats are `draft` until then. The topic list (`packages/subject-core/src/data/uz-math-topics.ts`, 33 topics) follows the school programme with equal weights and is marked `verified: false`.

## Phases

1. **Foundations (this release):** engine, formats, topics, formula rendering.
2. **MVP, Maths only, uz and ru:**
   - content workspace and worked solutions in the answer key;
   - `learner_subject_*` tables and the `admission` function;
   - the app with diagnostic, daily practice, heat-map, mocks and prediction;
   - a free beta with 1–2 centres.
3. **Paid season:** season pass and centre seats through Click, parent report, centre dashboard, the nationwide Sunday mock.

## Content rules

Original items only, each in Uzbek (Latin) and Russian with a worked solution, approved by someone other than the author (Assessment Cloud enforces this). AI may draft; a human approves before anything is published.
