# Academy Contacts cold-start repair

## Finding PERF-001 — serial cold-start data reads

Priority: high usability/performance impact; not a demonstrated authorization vulnerability. Technical-debt score: impact4, risk2, effort1, priority30.

On the published Academy, one owned 200-contact/classroom fixture reached the first contact in 14,276ms at1440px and12,374ms at390px. The request waterfall shows summary ending at9,922/8,594ms and Contacts only starting at9,926/8,596ms. Summary itself took3,660/3,331ms. These are individual observations, not an SLA, a load test or a general performance distribution. The detailed before proof is `2026-10-23-contacts-before.json`.

The cold bootstrap in `apps/academy/src/App.tsx` waited for summary before requesting Contacts even though it already held a fresh authenticated workspace-directory access profile. Warm navigation already overlapped those reads. Unrelated enrichments were already deferred and are retained.

## Repair and authority boundary

Start Contacts alongside summary only for an explicit cold Contacts route with a fresh directory profile permitting that route. The Contacts endpoint continues to authenticate and scope the read independently. Do not publish the preloaded result, populate its cache or finish bootstrap until the current summary succeeds and still permits Contacts. Preserve the existing actor/academy/request epochs and branch capture. Handle the speculative promise rejection immediately so a failed summary cannot leave an unhandled rejection. Do not change server authority, tokens, caches, financial behavior or API contracts.

Regression cases hold summary unresolved and prove Contacts starts, its records remain hidden, a successful summary permits exactly one read, a current summary403 exposes no records, and an early Contacts403 is neither published nor retried. The two concurrency cases failed before the repair and passed afterwards. Existing core/enrichment recovery and warm-navigation tests also pass: five focused browser cases total. Academy build, lint,3,095 Uzbek/Russian phrase checks and production/release checks passed locally.

This is a frontend-only candidate. Exact-head CI, tracked Academy Pages publication, actual live smoke and a second owned published measurement are required before claiming this repair deployed or improved production timing. Revert only this optimization if cold Contacts, account/academy switching, current refusals or established recovery regress; do not roll back the other agents' features or backend state.

## Scope and open acceptance

The resumed goal remains the original all-service security, correctness, workflow, design and performance objective. This repair does not close that objective. The existing twelve-feature acceptance ledger remains `finish-checklist.md`; its dated provider, funded Click, Telegram/bot, private-file, paid learner/AI and wider performance gates are not closed by this test. Earlier completed branch/financial/room/retention acceptance retains its own evidence and has not been requalified by this narrow run. Other-agent English/Homework/Assessment/Proctor work and their checkouts are excluded from this change.

Both measurement accounts/institutions were owned QA fixtures; the initial harness attempt used an over-specific accessible-name selector and is retained as failed evidence, not a passing measurement. Its cleanup passed. The corrected measurement's account is closed, active personal access removed, institution archived and21 cleanup checks passed. Immutable institutional QA history remains, with no customer records, real funds or external provider delivery changed.
