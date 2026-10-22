# Schood product strategy pack

Updated 2026-10-22. This pack is the product source of truth for what Schood adds beyond English and how each addition should behave. Engineering detail lives in [AGENTS.md](../../AGENTS.md), [docs/codebase-map](../codebase-map/MASTER_INDEX.md) and [docs/assessment-cloud](../assessment-cloud/README.md).

## Read this first (agents)

1. [00_PRINCIPLES.md](00_PRINCIPLES.md): rules every vertical must follow. Read it before any vertical doc.
2. [01_PORTFOLIO.md](01_PORTFOLIO.md): what we build, in what order, and what we deliberately skip.
3. [20_PLATFORM_ENABLERS.md](20_PLATFORM_ENABLERS.md): the shared engineering that makes every vertical cheap. Most verticals are blocked on `PE-01` or `PE-02`.
4. The one vertical doc you are working on.
5. [90_VERIFY_AND_OPEN_QUESTIONS.md](90_VERIFY_AND_OPEN_QUESTIONS.md): facts that must be confirmed before building content or setting prices.

## Index

| ID | Doc | One line | Priority |
|---|---|---|---|
| — | [00_PRINCIPLES](00_PRINCIPLES.md) | Shared product rules, loop, channels, reuse rules | Required reading |
| — | [01_PORTFOLIO](01_PORTFOLIO.md) | Scoring, sequence, skip list | Required reading |
| V-RU | [10_RUSSIAN](10_RUSSIAN.md) | Russian as the second language pack | P1 (first) |
| V-ADM | [11_NATIONAL_ADMISSION](11_NATIONAL_ADMISSION.md) | Math, then other subjects, for the national admission test and certificates | P1 (largest market) |
| V-KO | [12_KOREAN_TOPIK](12_KOREAN_TOPIK.md) | TOPIK and EPS-TOPIK for study and work in Korea | P2 |
| V-LANG | [13_MORE_LANGUAGES](13_MORE_LANGUAGES.md) | German and Turkish next, others later | P3 |
| V-TCH | [14_TEACHER_CERTIFICATION](14_TEACHER_CERTIFICATION.md) | Certificate prep for teachers | P2 |
| V-SEL | [15_SELECTIVE_SCHOOLS](15_SELECTIVE_SCHOOLS.md) | Entrance prep for selective schools, ages 10–15 | P3 |
| V-ABR | [16_STUDY_ABROAD](16_STUDY_ABROAD.md) | Premium bundle of existing exams plus admissions | P2 |
| PE | [20_PLATFORM_ENABLERS](20_PLATFORM_ENABLERS.md) | Language packs, exam-format registry, subject engine, entitlements | Blocks verticals |
| B2B | [30_ASSESSMENT_CLOUD_COMMERCIAL](30_ASSESSMENT_CLOUD_COMMERCIAL.md) | Will Assessment Cloud and Proctor make money, and how to sell them | Business |
| V-HW | [40_HOMEWORK_OS](40_HOMEWORK_OS.md) | Telegram-first hand-in funnel, AI pre-marking, trusted homework, owner dashboard | P1 B2B flagship |
| V-CRS | [41_SCHOOD_COURSES](41_SCHOOD_COURSES.md) | Course Studio, blended cohorts, results-verified marketplace, star teachers | P1/P2 B2B, after V-HW |
| V-HW + V-CRS | [42_HOMEWORK_AND_COURSES_BUILD_PLAN](42_HOMEWORK_AND_COURSES_BUILD_PLAN.md) | How to build both on today's Academy, Telegram, AI grading and Assessment Cloud code: decisions, data model, phases, pilot | Build plan |
| — | [90_VERIFY_AND_OPEN_QUESTIONS](90_VERIFY_AND_OPEN_QUESTIONS.md) | Must-verify facts and owner decisions | Gate |

## Conventions used in every doc

- **Tags:** `[DECIDED]` is an owner decision. `[ASSUMPTION]` is our hypothesis, to be validated with data. `[VERIFY]` is an external fact (exam format, law, price) to confirm from an official source before it reaches content, pricing or marketing. Never present an `[ASSUMPTION]` or `[VERIFY]` item to users as fact.
- **IDs:** verticals are `V-xx`, features within a vertical are `V-xx-Fn`, enablers are `PE-nn`. Reference IDs in PRs, commits and backlog items.
- **Status values:** `idea` → `validated` (demand evidence recorded) → `scoped` → `building` → `live`. Every vertical is `idea` today unless its doc says otherwise.
- **Template:** each vertical doc has the same sections in the same order. An agent can jump straight to "Reuse map", "Build list" or "Done when".

## Rules for agents changing these docs

- Keep the template and section order. Add new facts under the right tag, and move a `[VERIFY]` item to verified only with a source link and date.
- Do not change prices, priorities or `[DECIDED]` items without the owner (Jafary).
- When a vertical starts building, add its backlog IDs and code paths to its "Reuse map" and "Build list", and set its status.
- These docs describe intent, not shipped behaviour. Check the code and [docs/codebase-map/09_FEATURE_REALITY_MATRIX.md](../codebase-map/09_FEATURE_REALITY_MATRIX.md) for what exists.
