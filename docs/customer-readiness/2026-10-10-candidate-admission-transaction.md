# Atomic candidate admission — 10 October 2026

Draft PR [215](https://github.com/atmyielts/English_T1/pull/215) now includes
atomic exam admission. This extension is locally validated and unpublished.
The verified-account security fix from PR 216 is separately live: main
`c97c09ee363ee8497ba542f1042ce9a20f021772`, candidate-entry version 45,
CI 37975252863 and all configured Pages shards in 37976683909 succeeded.
Its published-source checks and 15 owned production admission checks passed;
temporary QA records were removed and verified absent. This does not qualify
the new transaction or the combined payment release for production.

## Resulting behavior

The current production handler performs admission through multiple writes. A
late enrollment error or concurrent retry can leave a partially consumed code.
The candidate replaces those writes with one private service-only database
command. Session, registration, profile, student record, optional classroom
enrollment, code/voucher claim and immutable admission receipt commit together.
Concurrent retries return the same owned attempt; a failed write rolls back
every effect. Completed attempts can be recovered without creating another exam.

Admission requires the caller's confirmed Auth email, current personal-account
authority, valid purchased inventory and an active exam at an approved origin.
Assigned vouchers stay bound to their verified beneficiary. Contact matching
uses account identity or exact verified email and rejects foreign or ambiguous
links; a submitted phone never takes over a contact. Receipt-linked ownership
cannot be reassigned, deleted or reopened through ordinary table writes.

The HTTP adapter makes exactly one RPC and projects a bounded response without
Auth credentials or private SQL errors. Provider throttling/outages remain
retryable. English, Russian and Uzbek guidance retains the original code for
retry or center review and never presents an uncertain admission as success.

## Executed validation

- 35 native PostgreSQL 17.5 candidate cases passed with canonical profile DDL:
  16 concurrent voucher retries, 16 concurrent paid-token retries, competing
  beneficiaries, all nine write-boundary rollbacks, existing-profile/consent
  restoration, current account scope, inventory validation and immutable links.
  Exclusively owned network-isolated containers were removed.
- The complete 162-case native payment suite passed before enriching the profile
  fixture and adding its consent-restoration case. The final targeted 35-case
  run passed afterward. A full 163-case local run is not claimed.
- 33 candidate Deno tests passed, including 7 atomic HTTP contract cases; the
  actual Edge entry point typechecked. The existing 57 payment Deno cases and
  other five candidate payment Edge entry points passed their checks.
- 22 existing Platform payment browser cases passed. Another 12 Playwright CLI
  checks exercised the actual candidate page with synthetic APIs: all three
  recovery states in three languages, original-code/account preservation,
  absence of false success and mobile overflow. These are browser proofs,
  not hosted persistence or provider proofs.
- Platform built with public production configuration held in memory.
  Production secret scan, release-scope validation and diff checks passed.

Machine-readable native evidence is in
`2026-10-10-candidate-admission-local.json`. Exact final-head CI is still required.

## Before production rollout

The combined draft must not merge. Its eight additive migrations and six manual
Edge deployments require a reviewed backend-first release that retains existing
frontend source in the first tracked Pages run. Qualify older clients before
shipping the separate recovery frontend. Keep the payment worker disabled.

Legacy tokens, vouchers and previously created sessions lack the new immutable
receipts. The command deliberately rejects uncertain evidence; deploying it
without reconciliation could block valid existing customers. Classify all legacy
paid inventory, claims, purchases and enrollment links, provide reviewed adoption
or recovery paths, and prove existing customers retain access before switching
the live consumer. Account deletion/retention, refunds, voids, other ledger writers,
installed SQL ownership/source and signed Click/runtime recovery remain gates.

Freshly capture all published dependencies and gateway flags, including the
installed candidate-entry version 45. Publish only reviewed source-preserving
bundles after tracked release checks; qualify owned hosted transactions and
cleanup. Do not infer production readiness from these local fixtures.
