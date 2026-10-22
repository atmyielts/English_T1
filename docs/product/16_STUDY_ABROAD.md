# V-ABR — Study-abroad pathway (premium bundle)

| Field | Value |
|---|---|
| ID | V-ABR |
| Status | idea |
| Priority | P2, mostly packaging of existing products |
| Depends on | Existing IELTS, SAT and TOEFL products; PE-04 bundles |
| Channels | B2C (families), partner agencies and centers |

## Thesis

Families aiming for study abroad already buy IELTS, TOEFL and SAT prep separately and pay agencies for applications. Schood can sell one premium track: test prep, a timeline and application milestones in one place, with progress parents can see. The exams already exist in Schood, so most of the work is the plan, the milestones and the counselling layer.

## Who and why

| Persona | Job to be done | Trigger |
|---|---|---|
| Grade 10–12 student | Get the scores and applications done in time | Application deadlines |
| Parent | See the plan, progress and cost | Big financial decision |
| Agency or center | Offer prep with tracked results | Their clients need scores |

## Learner journey (the loop)

1. **Place:** diagnostics on the relevant exams (IELTS or TOEFL, SAT).
2. **Aim:** target countries and universities, then the score targets and deadlines they imply.
3. **Daily:** a merged plan across exams, weighted by deadline.
4. **Gap:** score gap per exam, plus an application checklist (documents, essays, recommendations).
5. **Outcome:** scores achieved, applications submitted, offers recorded (self-reported).

## Features

| ID | Feature | MVP? |
|---|---|---|
| V-ABR-F1 | Bundle product: IELTS or TOEFL plus SAT at one price (PE-04 bundles) | MVP |
| V-ABR-F2 | Pathway planner: deadlines lead to a backwards exam and study timeline | MVP |
| V-ABR-F3 | Application checklist and milestone tracker | MVP |
| V-ABR-F4 | Essay feedback (personal statement), AI first pass plus optional human review | MVP-lite |
| V-ABR-F5 | Parent dashboard and Telegram milestones | MVP |
| V-ABR-F6 | Counsellor marketplace (reuse `teacher-marketplace`) | Later |
| V-ABR-F7 | University shortlist helper | Later; data-licence dependent |

## Reuse map

`apps/ielts-*`, `apps/sat-*`, `apps/toefl-*`, `score-prediction`, `recommendations`, `writing-tutor` (essays), `parent-report`, `teacher-marketplace`.

## Build list (new work)

1. Bundle support in `products` and `entitlements` (one purchase grants several products).
2. The pathway planner: a Goal with several exams and deadlines.
3. The checklist and milestone model.
4. A personal-statement rubric for the essay feedback.

## Monetization (hypotheses)

- **B2C:** a premium annual price above the sum of the single products, justified by planning and essay feedback. `[ASSUMPTION]`
- **Partners:** agencies resell it, with revenue share.

## Done when

A family can buy one bundle, see a dated plan across exams, track applications, and get essay feedback.

## Risks

- **Ethics:** never write essays for students. Feedback only, with an integrity notice.
- **Data quality** on universities and deadlines. Show official links, and never imply guarantees.
