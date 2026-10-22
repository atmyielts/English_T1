# Assessment coordinator: canonical commits and fenced devices

The coordinator is its own Worker, `workers/assessment-coordinator`, not a mother-platform feature. One SQLite-backed Durable Object is named by `tenant_id:attempt_id`. PostgreSQL remains canonical for responses, device epochs, deadlines and academic outcomes.

## Current authority path

`Exam client -> coordinator gateway -> per-attempt Durable Object -> private assessment-runtime Edge bridge -> PostgreSQL runtime RPC`

The browser client is now wired through `packages/assessment-web/src/coordinator.ts` and its portable runtime. Do not deploy the runtime migration independently of this compatible client: direct `response.append`, `section.advance` and `attempt.submit` calls to `assessment_command` are deliberately rejected after the runtime migration. Authoring, publication, registration and initial attempt creation retain the existing Assessment API. A connected Worker/handler/repository/PostgreSQL test now exists; real browser/Supabase transport, provider authentication and hosted acceptance are still missing.

The gateway verifies the Supabase user token, bounds request bodies, checks configured origins, derives actor identity and hashes a random 256-bit device lease token. The internal bridge additionally requires a coordinator-only secret and independently verifies the user token for candidate actions. No browser receives that secret or the Supabase service role key. Alarm reconciliation is a separately allowed internal action and does not impersonate a candidate login.

## Device and response invariants

- PostgreSQL locks the attempt and lease before accepting a mutation.
- One active device/token/epoch lease lasts 60 seconds; renewals are explicit. A competing device cannot acquire it while active.
- Release or expiration permits another acquisition; its increased epoch fences the old device. This is a browser-session lease, not secure-device attestation.
- Replays compare semantic command data without the lease credentials. A committed answer can recover its receipt after a legitimate lease rotation; a changed answer conflicts.
- The Durable Object persists only actor/attempt binding, command hashes, committed receipts and minimal clock snapshots. It never persists bearer tokens, raw device tokens or answers.
- An answer is acknowledged only after the canonical database transaction and local committed receipt are persisted. A crash between those steps causes a canonical idempotent retry, not a duplicate answer.
- Network-yielding operations and alarms share a bounded serial executor. PostgreSQL's lease/epoch checks remain the fence even across a coordinator restart.

The coordinator does not grade, invalidate for misconduct or expose scoring keys. Its canonical submission event is consumed by the separately required grading pipeline.

## Timing and recovery

The browser requires `VITE_ASSESSMENT_COORDINATOR_URL` and Web Locks before starting. A per-attempt lock rejects a second same-origin tab, including one with copied session storage. Session-scoped credentials contain a random device ID/token, lease epoch and pending acquire/renew operation keys; they contain no user bearer token or answers. Reload retains credentials. Closing releases only the local tab lock, not the canonical lease, so reload recovery is not forced to wait for lease expiry. The lease is not secure-client attestation, and cross-origin/other-device exclusion still depends on PostgreSQL.

The browser polls canonical state every five seconds and renews a 60-second lease when at most 30 seconds remain. Failed requests keep pending operation keys; a stale committed acquisition receipt triggers a fresh acquisition rather than replaying the same receipt forever. Ordered response commands retain the encrypted journal key across epoch rotation. Inputs stop at local lease expiry; committed receipts can still be recovered after finalization. Manual and server-driven section changes fetch only the current manifest. Uncommitted old-section responses are retained, not silently discarded or credited after a deadline; a complete institution-reviewed late-response recovery policy remains required.

Native Durable Object alarms reconcile the earliest canonical section/overall deadline. Late alarms advance the next section from the previous scheduled deadline, not the late invocation time. Paused attempts ignore pre-pause deadlines but cannot exceed their sitting close time. Finalization updates the canonical session and inserts one grading outbox event. Repeated alarms have no additional effect.

On an upstream failure, no success receipt is issued. Native alarms retry and an explicit 30-second reconciliation alarm is retained. Past deadlines are scheduled at least one second out to avoid a hot retry loop. Upstream timeouts cover headers and complete body consumption, with a one-MB response bound. Cross-service live notification, hibernating client subscriptions and hosted operational acceptance remain required.

The API use was checked against [Cloudflare Durable Object state](https://developers.cloudflare.com/durable-objects/api/state/), [alarms](https://developers.cloudflare.com/durable-objects/api/alarms/), and [SQLite storage guidance](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/). `test:local` uses real workerd/SQLite with synthetic upstream responses. `test:stack` connects real workerd/SQLite to the actual runtime handler/production repository mapping and actual PostgreSQL RPCs as the service role. It drops a reply after commit, restarts the object, replays exactly one answer and tests native alarms and the actual local queue. Identity tokens and the Supabase HTTP transport are synthetic adapters, not verified Supabase authentication. Neither test proves hosted provider behavior or the 20k target.

## Canonical recovery schedule

Every attempt transaction creates a private `assessment_runtime_schedule` row. Active rows track the earliest canonical section/overall/window deadline; paused rows track sitting closure; finalized rows retain a null deadline. State/deadline changes rotate the schedule revision and invalidate existing dispatch leases. This covers a browser crash before its first coordinator call and deadline changes while the object is inactive.

The separate Worker's minute cron claims overdue rows in batches of at most 100 using PostgreSQL row locks and `SKIP LOCKED`. Each claim has a fresh scoped three-minute lease. The dispatcher publishes JSON tickets to its environment-specific Cloudflare Queue, at most 200 batches or 50 seconds per invocation. This bounds dispatch work; it does not certify recovery latency or 20k throughput. Provider publication failure leaves the canonical rows recoverable after lease expiry rather than losing them.

Tickets contain only schema version, tenant/attempt IDs, revision and dispatch lease token—not candidate bearer tokens, answers, browser device tokens or caller-supplied actor identity. The consumer delegates to the named attempt object. The private bridge validates the ticket against canonical state, locks attempt before schedule, reconciles expiry and derives the candidate binding from PostgreSQL. Stale, expired, forged or replayed tickets have no state effect. After canonical recovery, the object persists binding/scheduling before acknowledging the queue message. If persistence fails after a canonical transition, the canonical schedule still allows recovery of future deadlines.

Consumption is bounded to eight concurrent jobs per batch. Failures retry individually with bounded backoff; malformed jobs are retried into the configured dead-letter policy, not silently discarded. One failed job cannot erase successful acknowledgements for another. The database remains the source of deduplication; no weak cache marks an uncommitted job complete. Gateway requests cannot invoke `schedule.claim` or `schedule.reconcile`; both private bridge actions require the coordinator secret and service-only RPC grants.

Configuration declares separate dev/staging/production queues, DLQs and cron triggers. Those provider resources have not been created. The policy follows [Cloudflare queue batching/retries](https://developers.cloudflare.com/queues/configuration/batching-retries/), [queue JavaScript APIs](https://developers.cloudflare.com/queues/configuration/javascript-apis/) and [scheduled handlers](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/).

## Recovery operations

Before using this runbook, verify the environment and exact released commit; see [RELEASE_GATES.md](RELEASE_GATES.md). Only an authorized operator may inspect private scheduler data. Logs intentionally contain event/outcome/code/count, not lease tokens or response content.

1. For delayed finalization, check canonical state/deadlines, minute cron events, `assessment.recovery.dispatch` counts, consumer retry codes, queue backlog and DLQ growth. Inspect overdue-row count and oldest due time without exporting candidate IDs, answers or ticket capabilities.
2. If publication or the bridge is unavailable, restore the correct isolated binding/secret/provider connection. Do not reset the schedule or bypass attempt authority. Unpublished and expired dispatch leases become claimable automatically after three minutes; the next healthy cron issues fresh scoped tickets.
3. For queue retries or DLQ entries, inspect the sanitized failure category and deployment compatibility. A stale ticket is harmless; replaying it is not a substitute for fresh canonical claims. Restore processing and confirm canonical schedules drain. Approved DLQ retention, access auditing and replay tooling still need hosted verification.
4. Confirm one canonical finalization and one grading outbox event per expired attempt, no duplicate journal sequence and no acknowledged response loss. An exhausted dispatcher batch/time budget or growing oldest-due age requires capacity/incident escalation, not marking the sitting complete manually.

Hosted alerts for overdue age, dispatch failures, retry rate, DLQ age/size and missing cron runs, plus restore drills and sustained backlog certification, remain required. Polling recovery supplements precise native alarms; it is not a claim that minute cron is a real-time exam clock.

## Gateway contract

`GET /attempts/<UUID>/state?tenant_id=<UUID>` uses the candidate bearer token and returns `{data:{snapshot}}`.

`POST /attempts/<UUID>/commands?tenant_id=<UUID>` uses the bearer token, an `Idempotency-Key` of 8–200 characters and `{action,data}`:

| Action | Data |
| --- | --- |
| lease.acquire | device_id, token (64 lowercase hexadecimal characters) |
| lease.renew / lease.release | lease {device_id,token,epoch} |
| response.append | sequence,item_version_id,response,lease |
| section.advance / attempt.submit | lease |

Tenant, attempt and actor are never taken from command data. Body hashing, current-section membership, response sequence and deadlines are revalidated canonically. The public gateway cannot submit internal alarm or schedule actions.

## Required acceptance work

Browser protocol tests and intercepted UI journeys cover lost lease replies, stale receipts/epochs, finalization replay, paused renewal, competing devices, duplicate tabs, encrypted reload recovery and manual/automatic section transitions. The connected backend stack additionally covers canonical commits/restart replay and cron/queue recovery without a browser connection. Complete the real browser/provider-authenticated journey, safe takeover/late-response recovery, Proctor live notifications, bounded receipt/schedule retention, hosted failure alerts and recovery tooling. Then test isolated staging, provider outage/restart behavior, three-language accessible journeys, secure clients, Center Node and measured concurrent capacity before production.
