# Writing and Speaking AI transaction boundary

The published Writing Tutor counts editable history and grants premium allowance for any purchase. Speaking Coach has no request quota and estimates pronunciation from a transcript. Both can lose confirmation of saved feedback. This release introduces server-owned request reservations, atomic feedback receipts, bounded provider responses and dedicated AI add-on access.

Only the configured active `AI_ADDON_PRODUCT_ID`, confirmed through effective access, grants the existing Writing premium limit of 20 requests per UTC day. Other accounts receive two requests. Speaking uses the same limits, independently. Each service also requires an explicit positive global daily cap and a configured provider. Missing configuration disables new provider calls. These are request ceilings, not a currency-denominated provider cost ledger.

Request identity is bound to the normalized input. A retry can recover a saved receipt or retry its database completion; it cannot dispatch another provider call. Unknown provider outcomes remain charged. Expiry refunds only the requesting actor's unused reservations; other actors' reservations are not modified during that request. An abandoned reservation can conservatively occupy that day's service allowance. Midnight UTC creates a new daily allowance.

Account closure erases AI receipts, feedback and user counters. Generated user ownership on daily counters lets the existing erasure transaction identify private rows while retaining global rows. Actor locks precede AI budget/request locks in every command. Closed, deactivated and missing Auth principals cannot reserve, start or complete requests. Direct ledger/counter writes have closure guards, including deriving scope ownership before generated columns are populated. The installed erasure registry retains its previous entries, identity, owner and permissions.

Speaking feedback describes only coherence, vocabulary and grammar visible in text. It does not report a speaking band, pronunciation or oral fluency. Legacy rows remain stored but the new history API marks their assessment scope and suppresses unsupported audio scores.

## Qualification and publication boundary

Baseline main: `937e51d71494fb5007546d4fc00b5b4b7684ea97`. Fresh downloaded published sources and function identities are recorded in `release/ai-published-baseline.json`: Writing v14, Speaking v15, both with JWT verification enabled. Their runtime dependencies are the same existing standard-library and Supabase imports; new local modules are limited to these two services.

The local handler/provider/access suite passed 15 tests and both entrypoints passed typechecking. The native PostgreSQL suite passed 23 tests, including independent connection quota races, duplicate dispatch, atomic save failures, and both orderings of account closure. Complete schema qualification passed seven checks against the captured 406-table Auth/public/Storage schema, real role attributes, actual Auth mirror/erasure triggers and Supabase PostgreSQL 17.6. It confirmed personal erasure, retained payment bytes, retained global counters and rejection of late results. These checks use local synthetic records only.

Source review and CI do not activate the functions or SQL. Before activation:

1. Qualify the exact composed head in full CI. Preserve all existing suites and all 13 frontend builds.
2. Prepare an isolated SQL workdir containing the installed migration history plus only the three AI migrations. Exclude the nine pending financial migrations. Review `supabase db push --linked --dry-run`; do not run a root push that implicitly activates payments.
3. Install the additive AI foundation, preserving existing service-role legacy writers. Verify migration history and closure registry. No live provider call is made by a migration.
4. Ship and verify the version 2 Writing/Speaking screens, including draft preservation, stable request IDs, result recovery, explicit unavailable states and transcript-only presentation. The new handlers reject a missing request ID with a refresh message. Do not activate them before this client transition is qualified.
5. Configure the dedicated add-on only after its actual product identity is reviewed; an empty identity retains the free allowance. Configure positive global caps and verify existing provider settings through protected terminal input. Do not invent a paid SKU or price.
6. Prepare only the reviewed two function bundles, preserve JWT verification, typecheck them and compare fresh provider identities to the baseline. Deploy Writing and Speaking explicitly after their client gate. CI ships neither function.
7. Run owned authenticated provider/quality, retry, allowance and closure checks through the published functions. Keep all synthetic requests identifiable and erase their personal data afterward.

The seven complete-schema checks and local provider doubles do not establish live model quality or signed-in customer readiness. SAT Tutor is outside this activation; its deployed function is unchanged. Payment activation remains separately gated by the unavailable Click signing secret.

Rollback is a reviewed fix or disabling new AI dispatch through zero service caps followed by a function refresh. Never restore the old unlimited Speaking scorer or general-purchase premium rule. Keep the additive schema and erasure entries; do not drop private stores to work around a failed activation.
