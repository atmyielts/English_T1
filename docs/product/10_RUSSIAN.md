# V-RU — Russian

| Field | Value |
|---|---|
| ID | V-RU |
| Status | idea |
| Priority | P1, first new vertical |
| Depends on | PE-01 language packs, PE-04 entitlements per vertical |
| Channels | B2C learners, B2B centers |

## Thesis

Russian is the cheapest proof that Schood is multi-language. The English skill apps already implement reading, writing, listening, speaking, grammar and vocabulary on a language-scoped learner profile (`languages`, `learner_language_*`). Russian should be a content and AI-prompt pack on those same apps, not new apps.

## Who and why

| Persona | Job to be done | Trigger |
|---|---|---|
| Uzbek-medium student, 16–24 | Pass a Russian certificate or exam for university or work | Admission, a job requirement, migration plans |
| Working adult | Speak and write confident work Russian | Promotion, a job in Russia or Kazakhstan, customer-facing role |
| Center student | Structured practice between classes | Their center adopts Schood |

Demand rationale: Russian remains widely required for work, higher education and labour migration. `[ASSUMPTION]`: quantify with search and Telegram data before launch.

## Target exams and levels

- **CEFR levels A1–C1** as the universal scale. `[DECIDED]`
- **Exam formats to support (each `[VERIFY]` current spec):**
  - The national certificate exam in Russian, if one exists for the level and purpose the learner needs.
  - ТРКИ (TORFL), the Russian-as-a-foreign-language test, levels ТЭУ–ТРКИ-3.
- **Start:** general CEFR Russian (Place → Daily → mock) first, then add exam formats as PE-02 registry entries.

## Learner journey (the loop)

1. **Place:** a 15-minute adaptive placement across grammar, vocabulary, reading and listening, plus an optional speaking sample. Result: CEFR estimate per skill.
2. **Aim:** choose "General Russian to B1/B2", "ТРКИ level X by date", or "Work Russian".
3. **Daily:** a 20-minute mix from the six skill apps, weighted by the weakest skill.
4. **Gap:** per-skill CEFR bars, an error log (case endings, aspect and verb-of-motion errors are typical clusters), and spaced-review vocabulary.
5. **Outcome:** a full timed mock in the chosen format, predicted level, and a shareable progress certificate (a Schood certificate, not an official one).

## Features

| ID | Feature | MVP? |
|---|---|---|
| V-RU-F1 | Russian language pack: content, prompts, level descriptors | MVP |
| V-RU-F2 | Placement test (Assessment Cloud bank, CEFR-tagged) | MVP |
| V-RU-F3 | AI writing feedback for Russian (essay, letter), rubric per CEFR level | MVP |
| V-RU-F4 | AI speaking partner and pronunciation feedback for Russian | MVP-lite (text plus audio feedback) |
| V-RU-F5 | Grammar drills for Russian-specific systems: cases, aspect, verbs of motion | MVP |
| V-RU-F6 | Cyrillic keyboard and handwriting support on mobile | MVP |
| V-RU-F7 | ТРКИ format simulator (via PE-02) | Later |
| V-RU-F8 | Work-Russian track: emails, calls, interviews | Later |
| V-RU-F9 | Center bundle: Russian placement test and term tests in Assessment Cloud | MVP for B2B |

## Reuse map

- **Skill app shells:** today's English skill surfaces (`apps/english-hub`, `apps/english-shared`), once made language-agnostic by PE-01.
- **Learner profile:** `languages`, `learner_language_profiles`, `learner_language_goals`, `learner_language_mastery`, `learner_language_daily_plans`, `learner_language_errors`, `learner_language_recommendations`.
- **Shared logic:** `supabase/functions/_shared/english-learning.ts`, `english-ai.ts` and `english-insights.ts`, generalized to a `language-*` module by PE-01.
- **Grading:** the OpenRouter grading path (`grade-writing-v2`, `speaking-coach`, `writing-tutor`), with Russian rubrics added as data.
- **Delivery:** Assessment Cloud banks for placement and mocks; Academy for center classes.

## Build list (new work)

1. A `ru` row in `languages` and Russian products in `products` (PE-04).
2. The Russian content pack: CEFR-tagged items for every skill, with grammar topic taxonomy for Russian.
3. Russian rubrics and AI prompts. Evaluate them against a human-marked sample of at least 50 essays and 50 speaking turns before launch.
4. A Russian text-to-speech and speech-to-text provider check (quality for Uzbek-accented Russian). `[VERIFY]`
5. A landing page plus Telegram campaign for validation.

## Content plan

- **Size for launch:** about 600 graded items for placement and daily practice across A1–B2, 40 writing prompts, 40 speaking prompts, 1 full mock. `[ASSUMPTION]`
- **Sources:** original items written by Russian teachers. AI-drafted items are allowed only after human review.
- **Review:** two-step review in Assessment Cloud: author, then an independent reviewer.

## Monetization (hypotheses)

- **B2C:** a monthly Russian subscription; a bundle discount with English. `[ASSUMPTION]`
- **B2B:** included in the center seat price when the center teaches Russian. `[ASSUMPTION]`

## Done when (launch criteria)

- Place → Aim → Daily → Gap → Outcome works end to end in Russian, on a 360px phone, in the uz, ru and en interfaces.
- AI writing and speaking feedback agrees with human markers on the evaluation set to an agreed tolerance (record the number).
- Validation gate passed (see 01_PORTFOLIO).
- A parent report works for under-18 learners.

## Risks

- **AI quality for Russian speaking feedback with Uzbek-accented speech.** Mitigation: measure on real samples before launch.
- **Cannibalising English** instead of adding learners. Watch cross-sell vs switching.
- **Exam formats change.** Keep formats in the PE-02 registry so updates are data changes.

## Out of scope (for now)

Russian literature courses, children under 10, live tutoring.
