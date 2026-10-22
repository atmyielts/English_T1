# Proctor API

The separate recording namespace, durable native capture/spool/head recovery, private encrypted evidence Worker, candidate-only checkpoints, reviewer discovery/timeline/streamed player and current release limits are documented in [RECORDINGS.md](RECORDINGS.md). The local native capture-to-reviewer journey now passes. Recording ingest is off by default; camera/screen/microphone-required Exam starts remain blocked until candidate permission/pre-clock/policy lifecycle and full device/provider acceptance pass.

Proctor is an independent service at `/functions/v1/proctor`; it does not embed Assessment Cloud handlers. Authentication uses a Supabase user bearer token. Exact allowed frontend origins are configured with `PROCTOR_ALLOWED_ORIGINS`. Responses are not cached. Actor identity is derived from Auth, never the command body. Every route except `/workspaces` requires `tenant_id=<UUID>`.

## Reads

- `GET /workspaces`: authenticated user's active institution memberships.
- `GET /permissions`: effective institution capabilities; not a replacement for per-session authorization.
- `GET /sessions` and `/cases`: supervisors see institution records; other staff see only assigned, currently authorized sessions/cases.
- `GET /sessions/<UUID>`: authorized session, time-ordered browser events, cases, authorized reviewer findings and `{permissions:{observe,review}}`. Review findings are not disclosed to an observer lacking the required review capability/assignment.
- `GET /policies`, `/bindings`, `/windows`, `/registrations`, `/assignments`: supervisor-only institution resources.
- `GET /candidate/preflight?registration_id=<UUID>`: owning candidate only; assigned policy, consent version/status, attended identity verification and runtime readiness, or `{required:false}`. It does not expose identity-check notes.
- `GET /candidate/session?attempt_id=<UUID>`: owning candidate only; monitoring session, authoritative attempt state/deadlines, candidate-facing notices with acknowledgement status and server time. Notices omit staff identifiers and private reviewer findings.

Lists currently stop at 1000 records; cursor pagination remains required. The Exam SDK polls monitored state every five seconds and sends a heartbeat at most once per fifteen seconds. This integration is not the final Durable Object/live subscription architecture and has not been certified at the 20k concurrency target.

Authorized session details now also return `recording_citations` alongside human findings, only to currently authorized reviewers. These immutable snapshots contain reviewed recording/sequence/head/boundary references, source/provenance and media/gap counts, never playback grants or storage/encryption envelopes. `case.finding` accepts optional `evidence_recording_refs: [{recording_id,from_sequence,to_sequence,head_hash}]` (at most 25), normalized and checked against same-session sealed/unexpired committed timelines. Citation snapshots, findings and quorum transitions commit together; invalid evidence rolls all of them back. Existing identical receipt replay still requires current reviewer authority. See [RECORDINGS.md](RECORDINGS.md) for verified local journeys and remaining gates.

## Commands

`POST /commands` receives `{action,data}` and an `Idempotency-Key` of 8–200 characters. The same semantic retry must reuse its key. Conflict with an existing key returns 409. Commands use service-only Postgres transactions and append audit records.

| Action | Data | Authority |
| --- | --- | --- |
| policy.create | title, policy | Proctor supervisor |
| policy.attach | policy_id, window_id | Supervisor; before any candidate attempt starts |
| capability.grant / capability.revoke | user_id, capability | Active institution owner/admin; target must be an active member |
| preparation.accept | registration_id, policy_id, acknowledged:true | Owning candidate, currently bound policy |
| identity.verify | registration_id, method, notes | Supervisor; attended method, no self-verification |
| session.assign | session_id, user_id, assignment_role | Supervisor; matching assignee capability |
| session.warn / session.pause / session.resume | session_id, reason | Supervisor or authorized assigned observer |
| session.heartbeat | session_id | Owning candidate, non-finalized session |
| events.append | session_id, stream_id, events | Owning candidate; ordered browser-only stream |
| notice.acknowledge | session_id, notice_ids (1–100) | Owning candidate; notices must belong to that session |
| case.create | session_id, title | Authorized assigned staff or supervisor |
| case.finding | case_id, disposition, rationale, evidence_event_ids, optional evidence_recording_refs | Authorized reviewer with review capability; one immutable finding per person; recording interval snapshots and quorum commit atomically |

Policy contract is validated by the shared protocol. Reviewer quorum is pinned in the session snapshot, defaults to two, and requires independent agreeing findings. Disagreement leaves a case unresolved; senior adjudication is a remaining implementation requirement. Findings do not mutate academic scores. There is no automatic invalidation or grade-override endpoint.

Events contain `{sequence,kind,occurred_at}`. Supported kinds are focus loss/return, tab hidden/visible, fullscreen enter/exit, copy/paste/cut, context menu, online/offline and client loaded. Server code computes normalized hashes, checks strict stream sequencing, accepts identical retries and rejects conflicting sequence reuse. Browser data cannot supply trusted-model provenance, severity or guilt. Source is always `browser_reported` and event receipt time is server-generated.

Manual pause changes the canonical assessment attempt/session in the same transaction. Resume compensates elapsed pause time but never exceeds the sitting close time. Recording requirements and document/liveness identity cannot be bypassed: launch is blocked until real providers/runtime are connected. Attended checks are not an implementation of automated identity proofing.

Warning/pause/resume commands atomically produce immutable candidate notices as well as audit records. Candidate acknowledgements are separate immutable receipts and are retry-safe. Finalized Proctor sessions cannot reopen or change their policy/candidate/attempt binding; evidence recovery lasts one day after completion, not after initial creation.

The SDK stores event content encrypted with nonextractable AES-GCM keys and scope-bound authenticated envelopes. It uses one random stream per document instance and drains pending older streams after reload. Encryption at rest is not protection against malicious page code/extensions or device compromise; all browser provenance remains untrusted. Clipboard contents, answer text and document/biometric details are not collected by browser signals.

Assessment exposes sitting/attempt `required_services` through its own API. An exam without a Proctor requirement neither performs Proctor preflight nor loads a monitoring session, so Proctor API unavailability does not block independent Assessment use. Required delivery dependencies are frozen once an attempt starts.

Browser/SQL tests cover candidate consent, event-spool recovery, notice acknowledgement and pause/resume independently of real providers. Media capture, trusted-client attestation, automated enforcement, retention deletion and physical provider integration require separate end-to-end acceptance.
