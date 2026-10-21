# Institution-controlled result feedback

Centers can propose and independently approve a sitting's candidate-feedback policy, review it at grade release, and withhold or restore additional details for an individual release. Exam honors the snapshot pinned to the latest eligible release. This lives in the separate Assessment/Exam services, not Academy or the mother platform.

## Disclosure levels and timing

| Level | Candidate detail projection |
| --- | --- |
| Overall total only | No section or question points; the existing overall result remains available |
| Overall and section totals | Section title, ordinal and awarded/maximum points; no question list |
| Section totals and question points | Section totals plus question ordinals and awarded/maximum points |

No level includes prompts, question-version IDs, keys, submitted responses, marker identities or grading inputs. Rich answer/response disclosure is not implemented here and requires separate content-protection work.

All historical releases default to totals only. Approving a policy cannot broaden old releases. Additional feedback becomes available at the later of the result release time and the policy's optional detail date; a blank date means at result release. UI dates are explicitly local time and sent with a timezone. Canonical database time and latest-eligible-release selection enforce the embargo.

## Authority and immutable history

Current `results.release` authority is required for every institution read, command and receipt replay. Policy authors cannot approve their own version. Independent approval requires the exact immutable version hash and current head revision. Only the latest proposed version is approvable; proposing does not activate it. Suspending the active policy returns future releases to totals only without rewriting old snapshots.

The grade release form retrieves a current approved-policy preview and requires explicit acknowledgment of grade, detail level and timing. A concurrent policy change rejects the reviewed hash; staff must refresh and review again. A database insert trigger derives the snapshot from canonical policy, ignoring supplied snapshots. Granular releases cannot use the legacy hash-free command path. The private pre-feedback grading function is not executable by service/browser roles.

Actor/tenant-scoped idempotency keys and encrypted device journals preserve uncertain commands across reload. Receipt replay returns the original release even after policy changes; it cannot attach new disclosure to old results. A receipted command is distinguished from a later failed refresh. No optimistic consequential approval/release is shown.

## Withholding and restoration

Staff can withhold additional details on a particular release with a reason and current hold revision. Restoration is another audited, revision-fenced decision and uses the original policy/date, not the latest institution setting. Both append immutable events without changing scores, overall result access, release embargo or certificates. Holding a newer eligible release never falls back to older details.

A hold blocks future detail reads. It cannot erase information already viewed, photographed or downloaded, nor promise continuous revocation of already-rendered data. Candidate responses are `no-store`; overall-result and credential revocation remain separate workflows.

## HTTP contracts

Routes beneath `/assessment-cloud/feedback` require bearer identity, `tenant_id` and an allowed origin. Responses are `{data: ...}`, `no-store`, with canonical database authority:

- `GET sittings`: sitting choices.
- `GET policy/<window-id>`: current policy, head revision and immutable version page, including independent-approval eligibility and review hashes.
- `GET releases/<window-id>`: released-generation IDs, pinned policies and hold revisions, without candidate-directory identity fields.
- `GET preview/<approved-run-id>`: canonical policy and release-review hash; self-release by the candidate is excluded.
- `POST commands`: `policy.propose`, `policy.approve`, `policy.suspend`, `release.hold`, `release.resume`; requires `Idempotency-Key`.

List pages accept `limit=1..100` and UUID `after` cursors, ordered by UUID rather than chronology. The UI offers subsequent pages and a first-page refresh. Payloads are limited to 16 KB. Reasons are required for proposals/suspension/holds; malformed revisions, levels, review hashes and timezone-free timestamps are rejected. Caller-supplied actors, approvers, scores and snapshots are stripped.

The existing `analytics/candidate/result?attempt_id=...` adds `detail_level`, `feedback_status` (`totals_only`, `pending`, `withheld`, `available`) and `available_at`. Restricted states return `sections: []`; section-only policies return empty question arrays. Exam explains each state and offers refresh rather than treating policy withholding as a technical failure.

## Verification and operations

Current local acceptance passes: 217 pure/API tests, all eighteen migrations with an actual upgrade over existing immutable releases, SQL authority/concurrency checks, three Edge entrypoint checks, three app builds and 270-file service boundaries. Connected feedback proof records two versions, two independent approvals, two hold/restore events, six audits and unchanged scores; historical generations 1–2 remain totals-only, generation 3 retains its future detail date and generation 4 has immediate points. The connected analytics regression also passes. Five-width layouts and keyboard acknowledgment pass; desktop and 320px screenshots were visually inspected. Hosted exact-release CI has not been run and nothing was deployed.

```powershell
deno test --no-lock supabase/functions/assessment-cloud/feedback-handler.test.ts supabase/functions/assessment-cloud/grading-handler.test.ts
node scripts/test-assessment-db.mjs
node scripts/test-assessment-appeals-browser.mjs --feedback
node scripts/test-assessment-appeals-browser.mjs --analytics
```

SQL checks cover conservative history, self-approval denial, stale versions/hashes, release-preview binding, embargo, immutable snapshots, replay after suspension, sections-only disclosure, withholding/restoration, score preservation, foreign ownership/tenants, revoked replay and private predecessor permissions. Four-process proposal, approval and hold retries produce one version, one approval, one hold and three audits.

The connected browser uses actual Assessment/Exam builds, production handlers/repositories and isolated PostgreSQL. It loses a committed proposal reply, reloads the encrypted journal, retries the same key, independently approves policies, releases actual approved generations, checks all five candidate states, private response bodies and revoked-workspace teardown. Institution/candidate layouts are checked at 1440/1024/768/390/320 with keyboard acknowledgment. Synthetic approved-score seeds, identity and PostgREST transport are explicit local adapters, not hosted provider acceptance or a substitute for full grading acceptance.

Apply the additive eighteenth migration and matching Edge/client versions only through the approved release process, after exact-SHA hosted CI and isolated staging checks. Tests never invoke the linked production database. Conservative defaults and server-side hash checks protect old-client compatibility. To restrict future disclosure, suspend policies and review individual holds; do not rewrite/delete immutable release or score history.

This closes the local points-level disclosure-policy gap, not the full results product. Rich feedback, complete historical-schema compatibility, localization/manual screen-reader QA, retention/deletion/legal holds, notifications, hosted security/provider/restore rehearsals and capacity certification remain required. See [RELEASE_GATES.md](RELEASE_GATES.md) and [the full ledger](IMPLEMENTATION.md).
