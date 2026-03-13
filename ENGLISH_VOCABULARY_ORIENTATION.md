# Schood English Vocabulary Orientation

Last updated: 2026-03-13
Owner area: English services (reading, listening, writing, speaking, grammar, vocabulary, immersion)

## 1) Why this document exists

This is the memory anchor for the vocabulary direction so we can pause and resume without losing architecture decisions.

Primary objective:
- Build `english-vocabulary` as a real product feature (Personal Vocabulary Notebook + daily spaced repetition).
- Let other English services contribute words into the same English notebook.
- Keep language data isolated (English data must not mix with future languages).

## 2) Core product decision

Use a hybrid storage model:
- Supabase Postgres is the source of truth for vocabulary entities, learner state, and permissions.
- AWS S3 is used only for heavy blobs and archives (audio files, exports, raw event archives), not core notebook state.

Reason:
- Notebook and review data must be queryable with joins, RLS, entitlements, and language mapping.
- S3 is not suitable as the primary store for user review state and cross-service relational queries.

## 3) Current implementation status

Already present in repo:
- Language/product mapping seed:
  - `supabase/migrations/20260313120000_seed_remaining_english_products.sql`
- Vocabulary notebook schema + Leitner helper:
  - `supabase/migrations/20260313123000_vocabulary_notebook_and_leitner.sql`
- Notebook edge function:
  - `supabase/functions/vocabulary-notebook/index.ts`

Meaning:
- English services have seeded product IDs and `product_languages` mapping.
- Vocabulary tables and RLS exist.
- `vocabulary-notebook` supports capture, review, archive, and daily/recent reads.

## 4) Data model (English-first, multi-language ready)

Canonical vocabulary layer (shared per language):
- `public.language_lexicon_entries`
  - unique key: `(language_id, normalized_word)`
  - stores canonical word metadata (display, lemma, pos, definition, example)

User notebook layer (per user, per language):
- `public.user_vocabulary_notebook_entries`
  - unique key: `(user_id, language_id, normalized_word)`
  - stores learner review state (`leitner_box`, `next_review_at`, counters)
  - keeps source attribution (`source_type`, `source_product_id`, `source_ref`)

Language isolation:
- `public.languages`
- `public.product_languages`
  - every source product must map to the requested `language_id`

## 5) Leitner behavior (MVP)

Current intervals:
- Box 1 -> 1 day
- Box 2 -> 2 days
- Box 3 -> 4 days
- Box 4 -> 8 days
- Box 5 -> 16 days

Daily experience target:
- Default review pull: 10 due cards/day (`mode=daily`)
- Optional recent view for notebook browsing (`mode=recent`)

## 6) Cross-service contribution pipeline (target shape)

Each English service should contribute vocabulary candidates, not full dictionary objects.

Candidate payload baseline:
- `word`
- `context_text`
- `source_type` (for example: `english-reading.extract`)
- `source_product_id`
- `source_ref` (session/question/content reference)
- `confidence`
- `idempotency_key`
- optional: `lemma`, `pos`, preliminary definition/example

Pipeline steps:
1. Service emits candidate event or calls ingestion endpoint.
2. Ingestion validates product-language mapping (`product_languages`).
3. Normalize and dedupe by `(language_id, normalized_word)`.
4. Upsert lexicon row if missing.
5. Upsert learner notebook row for `(user_id, language_id, normalized_word)`.
6. Queue enrichment only when definition/example are missing.

## 7) Handling large word volume (scalability plan)

Do not duplicate dictionary content per user.

Rules:
- Store each word once per language in `language_lexicon_entries`.
- Store user ownership/review state as lightweight links in notebook table.
- Use lazy enrichment (on first add or first review), not eager enrichment for every candidate.
- Keep raw capture payloads short.
- Apply retention window for raw ingestion artifacts (for example 30 days), then archive to S3 if needed.

Cost control guardrails:
- Stopword filter.
- Minimum confidence threshold for auto-capture.
- Daily capture cap per user.
- Per-source rate limits.
- Idempotency keys to prevent duplicate inserts.

## 8) SEO/product impact tie-in

Vocabulary should improve connected experience across English services:
- Reading/listening feed notebook candidates.
- Writing/speaking/grammar consume notebook words as practice hints or remediation focus.
- English hub can show shared vocabulary growth and due count as a cross-service metric.

## 9) Security and isolation requirements

Must keep:
- RLS on notebook rows: user can only access own entries.
- Admin read behavior must follow existing policy pattern.
- Language scope checks for source products before accepting capture from services.
- No cross-language joins in learner-facing API responses.

## 10) Rollout plan

Phase 1 (done or nearly done):
- Seed English products and `product_languages`.
- Create notebook schema and function.
- Wire manual capture + daily review in `english-vocabulary`.

Phase 2:
- Add shared `word-candidate` ingestion contract for reading/listening first.
- Add idempotency table or idempotent key handling at ingestion boundary.
- Add confidence filter and stopword gate.

Phase 3:
- Add async enrichment worker (definitions/examples/pronunciation metadata).
- Add archive job of old raw capture events to AWS S3 (Parquet/JSONL).
- Add hub-level vocabulary summary card (due today, mastered, weekly growth).

## 11) Operational checklist

When resuming work:
1. Confirm migrations applied remotely:
   - `20260313120000_seed_remaining_english_products`
   - `20260313123000_vocabulary_notebook_and_leitner`
2. Confirm function deployed:
   - `vocabulary-notebook`
3. Validate data constraints:
   - source product language must match requested language
   - duplicate capture does not multiply notebook rows
4. Validate UX:
   - daily list returns up to 10 due cards
   - review outcome updates Leitner box and next review date

## 12) Non-goals for now

- Full multilingual launch.
- Building a complete standalone dictionary product.
- Storing huge raw corpora directly in Postgres.
- Automatic capture from all modules at once.

## 13) Next concrete build items

- Implement `word-candidate` endpoint for cross-service ingestion with idempotency.
- Wire `english-reading` and `english-listening` to send candidates.
- Add small moderation layer for noisy auto-captured words.
- Add vocabulary summary widget to `english.schood.online`.

