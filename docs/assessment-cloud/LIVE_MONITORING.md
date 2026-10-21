# Live monitoring

Status: connected local implementation, disabled by default; not production-ready. Migration 31 connects canonical live preparation, combined recording/live readiness, academic launch, continuous-loss enforcement and explicit human resume. Actual Exam and Proctor apps now pass the production HTTP handlers/repositories, PostgreSQL, coordinator, encrypted recording Worker/R2 and live connection Worker together. Identity/PostgREST, generated devices, SFU and TURN remain explicit local adapters. Real hosted identity/provider packets, operations and the remaining full-service requirements are not proved.

Migration 32 adds the default paged institution monitoring board, staff workload directory, reviewed atomic assignment/removal and bounded multi-candidate panels. Its connected native live acceptance now opens one board camera feed, enforces one video-only feed per candidate, closes it and completes the existing individual-session journey; seven connections/relay issuances close/revoke. The broader 57-session connected workload and concurrency evidence, 47 current live/capture/workload checks, commands and remaining scale/shift/admission work are recorded in [PROCTOR_WORKLOAD.md](PROCTOR_WORKLOAD.md). Older 31-migration/39-check/six-connection counts below describe the preceding live-launch wave, not the newest total.

## Implemented ownership and flow

| Component | Responsibility |
| --- | --- |
| Migration 30, `proctor_live_*` RPCs | Canonical tenant/session/actor/source consent, current capture-device binding, observer assignment, exact selected publisher, 20-second renewable lease, immutable commands/provider custody and audit history |
| Migration 31, live launch gates and capture watchdog | Independent default-off capture/start admission, canonical mode/recording/live readiness, all required publications before the academic clock, immutable loss origin, deadline-first enforcement, warning/pause policy and no automatic resume |
| `/proctor/live/sources` and `/commands` | Authenticated catalog and stable-key open/close. Client-supplied roles/provider locators cannot grant authority |
| `/proctor/live/internal` | Dedicated private broker key plus fresh user identity for user context. System checks never renew leases. Provider receipt reports accept only whitelisted fields |
| `workers/proctor-live` | Separate per-connection SQLite Durable Object; serialized complete SDP exchanges, staged intent/effect/receipt recovery, private provider credentials and cleanup alarms |
| `packages/proctor-web/src/live-peer.ts` | Native WebRTC publisher/receiver. Publishers borrow existing tracks without stopping them; receiver video requires decoded frames, not just connection state |
| `packages/assessment-web/src/live-proctor.ts` | Secure-root broker URL, fresh expected-account session on requests, bounded/abortable private transport, canonical close plus broker cleanup |
| `workers/proctor-live/src/turn.ts` | Dedicated private TURN key; 10-minute per-connection credentials, durable caching/unknown-outcome custody, renewal and known-credential revocation |
| `CandidateLive`, capture controller and Exam `CapturePanel` | Source permissions still belong to recording. Live publishing borrows the exact stream, blocks local readiness when disconnected and reconnects only explicitly; live failure never tears down recording |
| `apps/proctor/src/LivePanel.tsx` | Explicit per-session camera/screen/microphone selection, actual stream playback, muted-until-chosen microphone, stop/reconnect controls, current catalog polling and immediate stale-frame hiding |

The mother-service design remains visual-only: Sora/Manrope, cream canvas, dark outlines and pill controls. No live feature enters Academy or the mother platform. This work does not grant membership, alter academic responses/grades, or determine misconduct.

### Authority and media lifetime

Candidates can publish only consented policy sources through their current capture device/lease. Viewers require current observer capability and session access; candidates cannot observe themselves. A viewer request includes the exact catalog `publisher_id`; the server checks its session/source/current eligibility, even before replaying an existing open receipt. Provider session IDs, app IDs, remote locators and raw SDP never enter the public catalog or PostgreSQL audit payloads.

The browser renews authority every four seconds and expires locally from request-start time, without adding network round-trip grace. Independent local expiry still runs while maintenance is stuck. Five seconds without received video-frame progress hides/detaches the last frame. Definitive access denial closes the PeerConnection; failed catalog refresh closes selected receivers, requiring a new explicit selection. A replacement publication is not automatically subscribed. These are connectivity signals, not evidence of misconduct.

Native broker alarms check canonical authority every five seconds. Known forwarding is stopped on withdrawn/expired authority or canonical outage, with canonical closure retried separately. Stopping a live connection never stops the supplied recording track. Local PC closure or browser-reported `connected` is not provider cleanup or identity attestation.

Publishers stop their live transport after five seconds without local RTP progress, rather than renewing readiness indefinitely without media. Saved recording remains independent. This is browser-reported transport evidence, not a trusted-device or real-scene attestation.

Canonical readiness now requires both fresh committed recording and an eligible active publication for every required source. No academic attempt/clock is created during preparation. Observer presence is not a readiness gate: feeds are opened on demand by assigned observers. Publication closure pins its actual unavailability time; expiry pins the earlier lease cutoff. Live context/command/provider-report paths enforce continuity before renewing a publication, so a late heartbeat cannot erase an elapsed recovery window. Sitting/academic/section cutoffs take precedence. Server notices distinguish live or recording loss from misconduct. A restored source never resumes a paused attempt; an authorized human must do so. Warning-only policies permit continued answering only for an already-active attempt with explicit canonical `auto_pause=false`; absent policy and pre-clock preparation remain closed.

### Authenticated relay credentials

The `ice` broker operation checks current connection authority before issuance/cache replay and again before returning credentials. The current [Cloudflare credential/revocation API](https://developers.cloudflare.com/realtime/turn/generate-credentials/) uses `generate-ice-servers`, an `iceServers` array and username-scoped revocation; older bundled examples are not the implementation contract. Only trusted Cloudflare STUN/TURN endpoints are returned, blocked port 53 is filtered, and a TLS endpoint with one credential pair is required. Long-term keys never enter the browser or PostgreSQL.

Issuance intent is stored before the provider call. Known credentials survive durable restart, are reused until two minutes before their conservative 10-minute expiry, and overlapping credentials remain in private cleanup custody. Unknown issuance is never blindly repeated. It was never returned to a browser and cannot have allocated a browser relay; its pending receipt remains retained without claiming upstream reclamation. The browser renews with `setConfiguration()` and independently closes on credential expiry, even if maintenance stalls. Actual restricted-network renewal/ICE lifecycle still needs provider acceptance.

Known credentials are revoked with at most four concurrent calls and erased from durable private state after confirmed revocation. Revocation runs alongside SFU shutdown: a slow relay provider must not postpone closing known media forwarding. Partial/unknown revocations retain cleanup custody; only confirmed 204 results count. Key rotation cannot reinterpret a credential under a new TURN key: restore the original key to reconcile it. The current 64-issuance per-connection ceiling forces explicit reconnection for unusually long sessions; complete long-session renewal/restart and provider quota/abuse/lifecycle acceptance remain required.

### Provider receipts and recovery

The Cloudflare adapter uses the SFU API with private app credentials. Each allocation is pinned to its original provider application in both canonical custody and durable binding. Never change an active connection's app ID or use its session ID in a replacement app. A changed configuration is rejected and recovery stays scheduled; restore the original application/key for cleanup. Configuration rotation, operator alerting and cleanup reconciliation still need a complete operational workflow.

Provider mutations are not blindly retried after an unknown outcome. Durable stages distinguish request intent, known external effect and canonical receipt. Known effects replay their receipt, not their provider mutation. Per-track errors are inspected even on HTTP success. Cleanup inspects and force-closes known mids and verifies every result. SDP receipts are private durable negotiation state and are removed on completed cleanup/fault handling, not logged or written to Postgres.

An unknown track mutation can complete late: an empty provider inspection cannot prove cancellation. Such connections keep reconciliation scheduled (five-second checks initially, then one minute) rather than falsely claiming reclamation. An unknown empty-session allocation has no returned ID and cannot be used to publish; logical closure retains the unknown outcome without claiming that allocation was reclaimed. Provider lifecycle guarantees, bounded orphan remediation, retention, metrics/alerts and operational ownership remain release requirements.

## Local evidence and reproduction

Use Node 24, the existing root install, Docker for PostgreSQL and Chrome for native browser checks. Install the isolated tooling with `npm ci --prefix services/proctor-live-runtime --workspaces=false --ignore-scripts`; no root runtime dependency was added for the live Worker.

```text
deno test --no-lock workers/proctor-live/src/engine.test.ts workers/proctor-live/src/provider.test.ts workers/proctor-live/src/turn.test.ts supabase/functions/proctor/live-handler.test.ts supabase/functions/proctor/live-launch.test.ts supabase/functions/assessment-cloud/live-launch.test.ts packages/proctor-web/src/candidate-capture.test.ts
node scripts/test-assessment-db.mjs
npx --no-install tsc --project workers/proctor-live/tsconfig.json
npx --no-install tsc --project packages/proctor-web/tsconfig.live.json
npx --no-install tsc --project services/proctor-live-runtime/tsconfig.ui.json
npm --workspace apps/proctor run build
npm --workspace apps/exam run build
node scripts/verify-assessment-boundaries.mjs
npm --prefix services/proctor-live-runtime run build --workspaces=false
npm --prefix services/proctor-live-runtime test --workspaces=false
npm --prefix services/proctor-live-runtime run test:browser --workspaces=false
npm --prefix services/proctor-live-runtime run test:ui --workspaces=false
node scripts/test-assessment-appeals-browser.mjs --live
node scripts/test-assessment-appeals-browser.mjs --capture
npm audit --prefix services/proctor-live-runtime --workspaces=false
```

Evidence is deliberately separated:

- 39 engine/provider/API/capture checks cover serialization, durable receipt recovery, app/key custody, exact selected publisher, source kind, partial/unknown results, withdrawal during credential/media negotiation, relay overlap/revocation, trusted default-off launch admission and explicit warning-only answering.
- The complete 31-migration local PostgreSQL authority/integration suite and process races pass. Migration 30's lower-level fixture inserts its own preparation; migration 31 instead uses actual canonical preparation, recording and publication commands. It proves default-off gates, all-source readiness before time starts, correct-device start, saved-answer recovery, exact loss cutoff, no acknowledgement of rejected answers, source recovery without automatic resume, human resume, immutable closure loss time, final-window expiry and warning-only continuation. Four independent start processes produce one attempt/receipt; competing expired-publication renewals produce one system pause/notice and no responses/scores. Earlier record-and-review SQL suites also run after migration 31.
- Actual workerd/SQLite tests cover concurrent credential requests, cache/restart, media receipts, native withdrawal alarms and relay revocation. Auth/Postgres/SFU/TURN outbound replies are explicit metadata adapters. This test caught and verified the fix for a native fetch invocation failure in revocation that mocked tests missed.
- Native Chrome SDK acceptance passes actual generated 320×180 video RTP/decoding, stale hiding/recovery, denial teardown and continuing MediaRecorder bytes after publisher transport closes. Signaling is an explicit in-browser native relay, not hosted Cloudflare.
- Actual Exam `CapturePanel`/capture controller/native recorder/`CandidateLive` → actual Proctor `LivePanel` browser acceptance passes separate camera/microphone actions, publisher denial/readiness blocking without stopping recording, explicit reconnect, no automatic subscriptions, muted audio choice, stale hiding/recovery, publication replacement choice, stop controls, withdrawal teardown and continuing recorder bytes at widths 1440/1024/768/390/320. Screenshots are in `output/playwright/live-monitoring-*.png`. Identity, capture policy/readiness/store/upload, catalog and signaling are explicit fixture ports; native sources are generated. The test does not exercise the production browser HTTP adapter, encrypted recording transport, real relay packets or a combined browser→Edge→PG→Worker→hosted-SFU path.
- The connected `--live` journey passes actual Exam/Proctor browser HTTP adapters → production handlers/repos → PostgreSQL/coordinator/encrypted recording Worker/R2/live Worker → native browser SFU adapter. It proves canonical pre-clock readiness with three publications, unassigned-observer denial, decoded 320×180 assigned camera/screen feeds, live-only publisher failure with continuing recording, canonical pause, explicit reconnect without resume or device reacquisition, human resume, one submitted attempt/response, three sealed recordings/28 segments and unchanged scores. All six live connections close; all six synthetic relay issuances receive revocation receipts. Screenshots at five widths are in `output/playwright/capture/live-proctor-*.png`. The native peer adapter performs real SDP/RTP, but deliberately substitutes host-only ICE: no real TURN packet or hosted SFU proof is claimed. Identity/PostgREST use local adapters; no personal devices are accessed.
- The connected `--capture` regression passes again with all 31 migrations: one submitted attempt, four sealed recordings, 30 committed segments, unchanged scores, loss pause, explicit human resume, lost receipt recovery and stopped terminal tracks. Identity/device sources remain synthetic.

The service CI has an independent Node 24 live job for contracts, types/build/boundaries, locked tooling audit, both native browser component suites and connected live-launch acceptance with screenshots. It contains no deployment/secrets and has not been run remotely for an exact release commit. Local evidence is not that missing CI receipt.

## Configuration and remaining full-service work

Keep `PROCTOR_LIVE_ENABLED`, `PROCTOR_LIVE_LAUNCH` and `ASSESSMENT_LIVE_LAUNCH` false and `VITE_PROCTOR_LIVE_URL` empty outside isolated acceptance. Live preflight/preparation requires both the existing capture/recording gates and Proctor live admission; academic start independently requires Assessment capture/live admission. Browser payloads cannot enable either gate. Runtime migration/API/client are a coordinated release unit. Disabling new admission must preserve recovery/cleanup of existing sessions, not remove their APIs or original keys. The independent Worker additionally requires exact `ALLOWED_ORIGINS`, a trusted `SUPABASE_URL`, anon key, dedicated `PROCTOR_LIVE_BROKER_SECRET`, server-only SFU app ID/secret and `PROCTOR_TURN_KEY_ID`/`PROCTOR_TURN_KEY_SECRET`. Never expose these secrets as `VITE_*` values. Development/staging/production Worker names are separate and their public workers.dev endpoint is disabled. No provider resource was created or changed.

Required next work remains:

1. Extend the now-connected canonical launch/loss flow with physical-device, closed-tab/browser-crash, longer outage/recovery and full historical-schema acceptance. Local generated devices and the service-role fixture port do not prove production identity/device behavior.
2. Prove authenticated TURN credentials/renewal/revocation with real relay packets, restrictive-network/UDP-blocked/TCP/TLS acceptance, broader browsers/devices and long-session renewal/ICE restart/recovery. The adapter contains no static frontend TURN secret and must not be advertised as restricted-network ready from contract tests alone.
3. Prove the combined authorized candidate→actual services/PG/hosted SFU→assigned observer journey, including revocation, provider failure, closed tabs, lost replies, recording independence and real staging identities. The new connected local journey does not substitute for hosted provider acceptance.
4. Extend the now-connected bounded board and paged/reviewed workload to concurrent multi-candidate media/soak, institutional workload/shift/resource policies, complete sitting/name search and legacy paging, durable allocation intents, server admission, accessible localized controls and second-camera workflows. The local four-candidate client limit is not a cross-device quota or measured media capacity.
5. Complete provider key/app lifecycle, allocation/orphan reconciliation, cleanup telemetry/alerts, admission/quotas/abuse controls, retention/holds/deletion, incident/restore exercises and measured media/control-plane capacity.
6. Satisfy exact-release remote CI, isolated staged/provider acceptance and all full-service security/privacy/legal/operational gates in [RELEASE_GATES.md](RELEASE_GATES.md). No requirement or ledger row is closed by this wave.
