# Pre-clock capture launch

Status: Exam's explicit source permissions, encrypted native upload, pre-clock readiness and recording recovery are wired to the production handlers. The twentieth migration adds canonical continuous-loss enforcement and scheduled recovery. Local SQL/authority/concurrency, 241 pure/API tests and the connected native Exam journey pass. Both launch flags and recording ingest still default off. This is not a production release or a claim that monitored exams are ready.

## Why a preparation state is required

Previously, `proctor_sessions.attempt_id` was mandatory and recordings could begin only after the academic attempt was active. That made permission prompts and recording verification consume examination time. The nineteenth migration adds a registration-bound monitoring session in `preparing` state without creating an academic attempt or legacy academic `sessions` row.

The candidate first accepts the exact institution policy and completes any required attended identity check. `capture.open` then creates an expiring device-bound preparation. No server command acquires physical devices. Exam requests each required source separately through an explicit user gesture and native browser permission prompt, checks entire-screen selection, and begins native recording only after its canonical stream metadata is confirmed. Constructor/recovery/heartbeat calls never request devices. Permission/browser/platform acceptance remains a release gate.

| Canonical situation | Academic clock |
| --- | --- |
| No consent, missing identity, unsupported client/provider policy | Cannot prepare or start |
| Preparation opened; missing or partial source uploads | Not created |
| All required sources have recent committed media and the launch lease is valid | Still not created; ready for explicit start |
| Bound `attempt.start` succeeds | Exactly one academic attempt/session is created and the prepared monitoring session is bound atomically |
| Preparation cancelled | No academic attempt; immutable terminal monitoring history remains |

The registration/candidate/policy/session binding is immutable except for one validated preparing-to-active academic-attempt attachment. Existing active monitoring sessions are backfilled with their canonical registration. Legacy insert callers still derive that registration from the actual attempt; a caller cannot supply a foreign binding.

## Readiness and device binding

Required sources are derived from the immutable policy snapshot, never a client `ready` flag or source list. Camera, microphone and screen are checked independently. Each required source needs an open, unexpired recording and a media segment committed within the last 20 seconds. Reserved/missing parts, explicit gaps, a different source and sealed recordings do not satisfy it. Canonical receipt replays cannot refresh an old segment's committed timestamp. The launch lease lasts 60 seconds and only a new canonical heartbeat renews it.

This is browser-reported recording transport readiness, not proof of a real camera scene, whole-device integrity, liveness or trusted-client attestation. Worker receipts bind saved encrypted bytes to canonical metadata; decoder/scene validation and device/security acceptance remain separate gates.

Each preparation pins a device UUID and 64-character proof hash. The server does not disclose that proof in reads/audits. Another device cannot acquire the same active preparation. Starts must present the exact session/device/proof and current readiness; the old private Assessment/recording functions are not executable as bypasses. If the first successful start reply is lost, its original command key recovers the original attempt even after readiness expires, instead of creating another clock. New start commands still require current readiness. Cross-device takeover/recovery and trusted-device attestation are not implemented by this binding.

Only browser and record-and-review policies with actual capture sources are supported by these backend commands. Live SFU, secure desktop, Center Node, second camera and document/liveness verification are not downgraded. Attended identity authority is checked currently, including before activation.

## Recording continuity and access cutoff

Prepared recordings retain the same immutable recording/session identity through activation. Existing encrypted chunk/head/retry/reviewer transport is reused. Candidates may cancel only before an academic attempt exists; cancellation is replayable and cannot reactivate a completed preparation. Saved footage is not deleted by cancellation. Existing bounded post-completion recovery remains applicable.

New recordings derive their access cutoff from the pinned policy's `recording_retention_days`, not a caller-selected timestamp or unconditional 90-day default. Historical recordings retain their original cutoff. This is an access cutoff, not implemented physical deletion. Legal holds, deletion/orphan cleanup and KMS custody remain required.

Exam now has per-source permission/status controls, captured-actor byte transport, encrypted local spooling, same-container receipt recovery, explicit new-container restart, visible stop/help and terminal/lease/account/unmount teardown. A stopped physical source disables local answer controls immediately. A confirmed server pause still requires institution action; local recording recovery does not resume the academic clock. Completed-footage recovery does not open devices or another academic attempt. Hook callbacks are actor/version fenced, including delayed cancellation and teardown.

## Continuous server enforcement

The twentieth migration creates a private watchdog for every activated capture launch, including existing bound sessions. PostgreSQL persists a five-second check schedule in the activation transaction. The canonical runtime snapshot exposes the earlier capture check as `next_deadline_at`, so the existing DO alarm executes it. The existing cron/Queue recovery dispatcher provides a browser-independent fallback, including attempts without a live coordinator. Five seconds is the desired check cadence, not a hosted latency/SLO guarantee; fallback cron, queue backlog and provider failures can delay execution.

Each required source remains fresh for 20 seconds after its latest committed media. The minimum source cutoff and the 60-second device-lease expiry determine loss. The pinned `recovery_seconds` grace starts at that cutoff, not when a late worker observes it. Gaps, pending chunks, a heartbeat alone, another source and replayed old receipts cannot renew media freshness. A new heartbeat or evidence receipt checks the existing cutoff before updating it, so a late upload cannot erase an already crossed grace period.

After grace, `auto_pause=true` atomically pauses the academic attempt, legacy session and monitoring session. `paused_at` records the effective policy cutoff, preserving remaining time when an authorized human resumes, capped by sitting closure. Earlier academic/section deadlines win and the final sitting cutoff still expires a paused exam. `auto_pause=false` emits one warning per outage without pausing. Repeated/concurrent checks produce one system-attributed audit/notice per episode, not candidate/proctor impersonation. Restoration is audited and never auto-resumes. No enforcement command invalidates an attempt, creates a human finding or changes a score.

Fresh candidate mutations check capture before being accepted. If this check commits a pause, SQL returns `{rejected:"capture_continuity_required",snapshot:...}` without a command receipt; the production repository then emits HTTP 422. Raising inside the SQL transaction would undo the pause, so rejection is deliberately translated only after commit. The DO must not cache or acknowledge this unsaved command. Replays of previously committed commands retain their original receipt plus current state.

Missing sources can restart in new recording containers while paused under current consent/device lease. Human resume is denied until every required source is fresh. No caller-controlled readiness, time, source list, score or approval participates in enforcement. System audit/notice rows explicitly identify a system issuer, without attributing an action to an absent human.

Remaining: broader native failure/permission-denial coverage, trusted-device/cross-device takeover, explicit gap reconciliation and abandoned-device workflows, decoder/scene validation, held-data deletion/KMS, physical-device/browser matrix and provider/security/legal/restore/capacity certification. Keep the release flags false until the applicable gates are proved.

## API and flags

Proctor routes beneath `/proctor/capture` require current bearer identity, `tenant_id`, exact allowed origins and `no-store` responses:

- `GET sessions/<session-id>` returns owning-candidate preparation state, required-source readiness, expiry, activation and academic-attempt identity, without proof hashes or storage envelopes.
- `POST commands` accepts `capture.open` with registration/device/proof, or `capture.heartbeat` / `capture.cancel` with session/device/proof, plus a stable `Idempotency-Key`.

The protocol strips supplied timers, readiness, sources, identity approval and authority. Bodies are bounded to 8 KB. Opening is disabled unless both `PROCTOR_CAPTURE_LAUNCH=true` and existing `PROCTOR_RECORDING_INGEST=true` are configured on Proctor. Reads, heartbeat and pre-clock cancellation remain addressable for recovery when opening is disabled. Assessment separately requires `ASSESSMENT_CAPTURE_LAUNCH=true` before forwarding `capture_binding` on `attempt.start`. Both new flags default false and must remain false pending complete acceptance. No browser variable can enable them.

## Verification

```powershell
deno test --no-lock supabase/functions/proctor/capture-handler.test.ts supabase/functions/assessment-runtime/repository.test.ts packages/proctor-web/src/candidate-capture.test.ts workers/assessment-coordinator/src/engine.test.ts
deno check --no-lock supabase/functions/proctor/index.ts supabase/functions/assessment-cloud/index.ts
node scripts/test-assessment-db.mjs
node scripts/test-assessment-appeals-browser.mjs --capture
```

Pure/API checks cover caller-claim stripping, current identity/origin, bounded payloads, malformed proofs/actions, default-off opening, recovery routing, RPC authority/error mappings and Assessment's independent rollout gate. The SQL fixture exercises actual canonical preparation/recording/reserve/part receipt/complete/activation calls with explicit synthetic Worker receipts, not physical/native capture. It checks zero academic clocks during preparation, same-key open/cancel replay, different-device denial, missing-source and gap rejection, policy cutoff pinning, atomic attachment, expired-lease/new-start denial and lost-start recovery, source closure and private bypass permissions.

The full SQL runner applies these migrations over existing monitoring history. It keeps one psql transport for schema/integration files while `DISCARD ALL` resets role, settings, temporary adapters and prepared statements between each file, preserving isolation. Watchdog tests cover grace/warn-only policy, stale media/leases, late renewal and receipt replay, persisted pause without answer acknowledgement, original receipt recovery, paused source restart/human resume, earlier academic expiry and final closure. Four independent processes produce one system pause/notice, one loss generation and zero answer writes. The older recording/reviewer authority suite also runs again after migration twenty.

Connected native acceptance (2026-10-20) runs actual immutable Exam builds → production handlers/repositories → real PostgreSQL/evidence R2 Worker/SQLite DO coordinator. Synthetic canvas and oscillator streams replace hardware acquisition only. The actual controller/MediaRecorder/encrypted IDB journal/upload/manifest path is used. It verifies zero academic clocks or device requests before explicit preparation, a lost committed open reply with identical retry identity, partial-source start denial, all three source confirmations, one academic activation, real response save, generated camera loss, canonical automatic pause, a lost closure reply and saved-head recovery, a new camera container while paused, no automatic resume, authorized human resume, submission and synchronous physical-track shutdown. Final canonical proof: one preparation/activation/academic attempt, four sealed containers with seven-day policy cutoffs, 29 committed media segments/parts in this run, one response and unchanged scores. Segment counts vary with test timing. Five preparation widths (1440/1024/768/390/320) pass overflow checks and desktop/mobile/terminal screenshots are inspected. Manual assistive-technology and physical-device testing remain separate.

This fixture adapts identity and PostgREST transport; it does not prove hosted Auth, provider delivery/alarms/cron/queues, physical recording permissions, liveness or trusted-client enforcement. Exact-SHA hosted CI, full historical-schema compatibility and all remaining full-service gates are still required.
