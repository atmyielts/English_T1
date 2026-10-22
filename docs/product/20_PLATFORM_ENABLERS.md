# 20 — Platform enablers (build once, every vertical reuses)

Verticals are cheap only if these exist. Build an enabler when the first vertical that needs it starts, and design it for all the verticals listed against it.

| ID | Enabler | Needed by | Status |
|---|---|---|---|
| PE-01 | Language-agnostic skill apps and language packs | V-RU, V-KO, V-LANG, V-TCH | idea |
| PE-02 | Exam-format registry | All exam verticals | idea |
| PE-03 | Subject engine (non-language mastery and planning) | V-ADM, V-SEL | idea |
| PE-04 | Per-vertical products, bundles and entitlements | All | partial: `products`, `entitlements`, `usage_counters` exist |
| PE-05 | Content operations on Assessment Cloud | All | partial: banks, review, analytics exist |
| PE-06 | Localization of all interfaces (uz, ru, en) | All | partial: Platform has `apps/platform/src/i18n`; assessment apps hardcode English |

## PE-01 — Language-agnostic skill apps and language packs

**Today:** the English skills run on a language-scoped data model (`languages`, `learner_language_profiles`, `learner_language_goals`, `learner_language_mastery`, `learner_language_daily_plans`, `learner_language_errors`, `learner_language_recommendations`; migration `20260310100000_language_scoped_profiles.sql`). The shared logic and UI are still English-specific: `supabase/functions/_shared/english-learning.ts`, `english-ai.ts`, `english-insights.ts`, and `apps/english-hub`, `apps/english-shared`.

**Target:**
- **Language pack:** a versioned data bundle per language code. It holds level descriptors, the skill list, grammar taxonomy, rubrics, AI prompt templates, TTS and STT voice config, script and input settings (Latin, Cyrillic, Hangul), and the content-bank references.
- **Shared logic:** `_shared/english-*.ts` becomes `_shared/language-*.ts`, parameterized by language code. English stays the default pack, with no behaviour change.
- **Skill apps:** read the active language from the learner's Goal and load the pack. No hardcoded "English" strings in logic. UI strings go through PE-06.

**Done when:** adding a language needs no change to skill-app code (proved by V-RU), and English regression tests pass unchanged.

## PE-02 — Exam-format registry

**Purpose:** every exam (IELTS, SAT, TOEFL, iTEP, ТРКИ, TOPIK, EPS-TOPIK, Goethe, the national admission test, teacher certificates) is a data record, not code.

**Record fields:** `exam_code`, `version`, `effective_from`, `source_url`, `checked_at`, `checked_by`, the sections (name, timing, item types, item counts), the scoring rules (raw-to-scaled tables, penalties, band rounding), the level mapping, and the delivery rules (section order, breaks, navigation).

**Rules:**
- Every record cites its official source and check date. A record without them cannot be published.
- Formats are versioned. Mocks pin the version they were built for. A format change creates a new version and never silently changes old results.
- Delivery uses Assessment Cloud blueprints and forms. The registry supplies the structure and scoring.

**Done when:** a new exam format can be added and simulated by entering data and content only.

## PE-03 — Subject engine (non-language)

**Purpose:** Place, Daily and Gap for subjects like Math, where the skill axis is a topic graph, not CEFR skills.

**Model:**
- **Topic graph:** topics, prerequisites and official-program codes per subject and exam.
- **Mastery per learner per topic:** start with a Bayesian or Elo-style estimate; move to IRT once Assessment Cloud analytics provide calibrated item parameters.
- **Planner:** next-best practice by `exam weight × (1 − mastery) × urgency`, with spaced review.
- **Item types:** numeric, multiple choice, multi-select, short answer, and later worked-solution upload (Assessment Cloud already supports image and file answers).

**Reuse:** the `learner_language_*` patterns (daily plans, mastery, errors) as the template; a parallel `learner_subject_*` set or a generalized table. Decide this when V-ADM starts.

**Done when:** V-ADM Math runs the full loop and the planner demonstrably prioritizes high-weight weak topics.

## PE-04 — Products, bundles and entitlements per vertical

**Today:** `products` (types exam, practice, tool, course), `entitlements` granted by `supabase/functions/click` after payment, `access-effective` (merges direct and Academy-sponsored access), and `usage_counters` with `consume_usage_counter`.

**Needed:**
- A `vertical` attribute on products.
- Bundles: one purchase grants several products (V-ABR, and English plus Russian).
- Season passes with fixed end dates (V-ADM).
- Center seat licences that grant learners access through Academy (the existing sponsored-entitlement path).
- Assessment Cloud and Proctor as separate tenant products (see 30).

**Done when:** every vertical's access is enforced server-side through entitlements, and bundles and season passes work through Click.

## PE-05 — Content operations on Assessment Cloud

- Use Assessment Cloud banks, independent review and item analytics for all new content: authoring, review, versioning, licence and source fields, and retiring bad items using item statistics.
- **Needed:** a content-team role set, bulk import (exists: CSV and JSON, QTI), translation pairs (uz and ru versions linked), and an editorial dashboard (coverage per topic or level and review backlog).

## PE-06 — Localization (uz, ru, en)

- Extract every UI string into catalogs. Reuse the Platform i18n shape (`I18nProvider`, `useI18n`, `SUPPORTED_LOCALES`) as a shared package without Platform's auth coupling.
- Learner-facing explanations exist in uz and ru for each language and subject, and native speakers review the copy.
- CI fails on missing catalog keys.
