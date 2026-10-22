# V-TCH — Teacher certification prep

| Field | Value |
|---|---|
| ID | V-TCH |
| Status | idea |
| Priority | P2, mostly packaging |
| Depends on | Existing English content; V-RU for Russian teachers; PE-04 |
| Channels | B2C (teachers pay themselves), B2B (schools, centers, education departments) |

## Thesis

Teachers have a concrete incentive (pay grade, job requirements) to hold language-level certificates and pass qualification assessments. `[VERIFY]` the current requirements. They already work inside the centers that use Academy. Schood can sell them a focused C1-level track built from content we already have.

## Who and why

| Persona | Job to be done | Trigger |
|---|---|---|
| School English or Russian teacher | Reach and prove B2/C1 for the certificate their role requires | Attestation cycle, salary rules |
| Center teacher | Credential for marketing and pay | Center requirement |
| School or center manager | Get the whole staff certified | Inspection, accreditation |

## Target exams (`[VERIFY]` all)

- The national CEFR-based language certificate used for teachers (English first, then Russian).
- International options teachers use: IELTS, CEFR-aligned tests, and methodology certificates (TKT-style). Methodology is a later add-on.
- Any teacher qualification or attestation test with a language component.

## Learner journey (the loop)

1. **Place:** a C1-focused diagnostic. Teachers are often strong in reading and grammar but weaker in speaking and writing at C1. `[ASSUMPTION]`
2. **Aim:** certificate level and date.
3. **Daily:** short, schedule-friendly sessions (15 minutes), heavier on productive skills.
4. **Gap:** C1 descriptor checklist per skill.
5. **Outcome:** a format-true mock and a readiness verdict.

## Features

| ID | Feature | MVP? |
|---|---|---|
| V-TCH-F1 | Teacher track on existing English content, filtered to B2–C1 | MVP |
| V-TCH-F2 | C1 speaking and writing feedback with stricter rubrics | MVP |
| V-TCH-F3 | Format simulator for the national teacher certificate (PE-02) | MVP once format verified |
| V-TCH-F4 | Staff dashboard for a school or center: who is ready, who needs support | MVP for B2B |
| V-TCH-F5 | Russian teacher track (needs V-RU) | Later |
| V-TCH-F6 | Methodology module (lesson planning, classroom language) | Later |

## Reuse map

The English skill apps and Hub, AI grading (`grade-writing-v2`, `speaking-coach`), Assessment Cloud for mocks and staff dashboards, and Academy for staff in centers.

## Build list (new work)

1. A teacher persona flag on the Goal record, and content filters by level.
2. C1 rubric calibration on at least 50 human-marked C1 samples per productive skill.
3. PE-02 registry entry for the teacher certificate format.
4. A staff-level dashboard view (Academy or Assessment Cloud analytics).

## Monetization (hypotheses)

- **B2C:** a fixed-length program (for example 3 months) priced below one prep course. `[ASSUMPTION]`
- **B2B:** per-teacher licences sold to schools, centers or departments. `[ASSUMPTION]`

## Done when

A teacher can go from diagnostic to a format-true mock with C1-calibrated feedback, and a manager can see their staff's readiness.

## Risks

- **Requirements change** with policy. Mitigation: re-verify yearly; keep format in the registry.
- **Low teacher incomes.** Mitigation: B2B licences paid by employers.
