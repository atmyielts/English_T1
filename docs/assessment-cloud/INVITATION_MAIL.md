# Invitation email and reminders

Status: implemented and verified locally through actual institution UI, production Edge handlers/repositories, PostgreSQL and a real loopback SMTP sink. **Hosted authenticated/TLS relay delivery, inbox placement, automated DSN/bounce processing, provider feedback/suppression, bulk operations and production operations remain required.** No real email was sent and no provider/deployment resource changed. All mail switches remain off by default. This is not full-service readiness.

## Institution workflow

In **Staff & permissions → Invitation history → Email & reminders**, current managers may inspect delivery history. Only the original sender may queue mail for a still-pending invitation while retaining authority to delegate its exact pinned role and duration. Recipient, role, link and message body come from the canonical invitation; the browser cannot substitute an address, sender, HTML, attachments or SMTP credentials.

The sender chooses invitation/reminder, Uzbek/Russian/English, queue-now or a device-local scheduled time, and a reason, then reviews the recipient, pinned invitation, language and time. Deadlines are converted to absolute timestamps. Email displays explicit UTC times, exact role permissions and the Assessment-only product boundary. Creating an invitation or copying its link does not itself send mail.

Up to three active deliveries and ten created deliveries per invitation in 24 hours are currently allowed. Planned times must be at least one minute apart and precede the invitation deadline. Actual handoffs are spaced by at least one minute and do not overlap for the same invitation. Provider-wide quotas, abuse controls and bulk scheduling remain required; these local limits are not a capacity guarantee.

Reminders are explicitly scheduled, not silently created. A due reminder is cancelled before SMTP handoff if the invitation was accepted/revoked/expired or the sender lost authority. It can remain visible as queued until its due-time eligibility check. A manager can cancel queued/leased mail with the current revision, a reason and explicit review, but cannot recall a handoff that already started. Revoke the invitation to prevent acceptance of an already sent link.

Failed deliveries can be explicitly replaced after reviewing the cause. Unknown handoffs require selecting the original delivery/revision and acknowledging that a replacement may duplicate a message already sent. A replacement is a new history row linked to its source; the original uncertainty is never erased. One source can have one explicit replacement. Queueing, cancelling and replacement requests retain encrypted actor/institution/purpose-scoped command identity through reload/lost replies, independently from permission and invitation commands.

## Canonical states and recovery

| State | Meaning / next action |
| --- | --- |
| `queued` | Waiting for the requested time or bounded retry |
| `leased` | One mail worker owns preparation for at most two minutes; no SMTP handoff authorized yet |
| `sending` | One begin call authorized handoff and returned the private envelope; replay returns no message |
| `accepted` | SMTP server accepted the message, not confirmed inbox delivery |
| `failed` | A definitive failure or automatic-attempt exhaustion; explicit reviewed replacement required |
| `uncertain` | The message may have been sent; never automatically resend |
| `cancelled` | Manager cancellation before handoff, or invitation/sender no longer eligible |

PostgreSQL is durable truth. Migration `20261020190000_assessment_invitation_mail.sql` adds private outbox, command/report receipts, immutable source/history guards, bounded `SKIP LOCKED` claims, current-authority begin and report APIs. Begin shares the institution staff fence with invitation/permission changes, but no transaction or staff lock spans SMTP I/O. Candidate delivery is not serialized behind mail work. Concurrent begin calls expose one envelope, not four send authorizations.

Each lease can have one immutable outcome report. If an accepted report commits but its reply is lost, the host retries that report with the same delivery/lease, never the SMTP transaction. Confirmed pre-DATA failures and SMTP 4xx rejections can retry with 30/60/120/240-second backoff, at most five claimed attempts total. Authentication/permanent 5xx failures require review. A disconnect labelled merely `CONN` is not proof that DATA was unsent; the adapter treats it as uncertain unless a definite pre-send failure is established. Expired unstarted leases requeue; expired `sending` leases become uncertain. A late definitive receipt can clarify a swept uncertain lease without resending. Claim/sweep work is bounded and repeated by polling hosts.

Node 24 `services/assessment-mailer` is an independent, locked SMTP process with bounded concurrency (default three, maximum five), request/body limits and graceful shutdown. It drains in-flight bounded sends/reports before stopping, and persists no recipient/link/body cache on the host. Horizontal instances compete through PostgreSQL leases. It uses a dedicated internal key and the public Supabase API key, **not** the service-role database key. The existing scanner/parser host pattern is reused; no new cloud provider or SMTP account is provisioned.

Nodemailer 10.1.7 is isolated in its own package/lock (production audit currently zero findings). Production submission permits port 465 implicit TLS or port 587 mandatory STARTTLS, verified server certificates, TLS 1.2+, bounded connection/greeting/socket/send timeouts, no automatic pool requeue and no file/URL content access. The sender is server configuration, SMTP debug logging is off, arbitrary attachments/Bcc/headers are never forwarded, and the deterministic Message-ID is a correlation aid **not** an exactly-once SMTP guarantee. SMTP password, bearer invitation URL and message body must never enter logs, generic audits or browser history records beyond the existing protected recipient-link flow.

The private begin API renders HTML-escaped, plain-text/HTML alternative messages from the pinned invitation and current institution name. All three languages disclose the exact role and the absence of Academy/Proctor membership. The token remains in a URL fragment; the mail process holds it only in memory for sending. Server key rotation retains the original invitation key ID. Missing render/key configuration records a safe failure before SMTP. No tracking pixels or open tracking are added.

## API and configuration

All manager routes are under `/assessment-cloud/invitations/mail/`, use current authenticated manager identity, exact allowed origins and `no-store` responses:

- `GET list?tenant_id=…&invitation_id=…&limit=50&after=…`: private history, bounded UUID pagination; transport leases are omitted.
- `POST commands?tenant_id=…`: `{action:'mail.queue'|'mail.cancel',data:{…}}` plus stable `Idempotency-Key`.
- `POST internal`: purpose-key authenticated `mail.claim`, `mail.begin`, `mail.report`; browser identity or claimed email cannot authorize it. Claims contain only delivery/institution/lease IDs; message material appears only after one canonical begin.

Server configuration in `supabase/functions/assessment-cloud/.env.example` adds `ASSESSMENT_INVITATION_MAIL_ENABLED=false` and dedicated `ASSESSMENT_MAIL_WORKER_SECRET`. It also requires enabled base invitations, their dedicated root keyring and trusted HTTPS Assessment app URL. The institution app adds `VITE_ASSESSMENT_INVITATION_MAIL_ENABLED=false` alongside its base invitation flag. The SMTP process has `ASSESSMENT_MAILER_ENABLED=false`, exact internal API URL, anon key, mail-worker secret, approved SMTP host/port/user/password/from and bounded concurrency in its own `.env.example`. No secret is a `VITE_*` value.

```powershell
npm ci --prefix services/assessment-mailer --workspaces=false --ignore-scripts
npm --prefix services/assessment-mailer test --workspaces=false
npm audit --prefix services/assessment-mailer --workspaces=false --omit=dev
deno test --no-lock supabase/functions/assessment-cloud/invitation-mail-handler.test.ts
node scripts/test-assessment-db.mjs
node scripts/test-assessment-appeals-browser.mjs --invitation-mail
```

For an approved environment only, provision secrets through the host's secret manager, promote matching schema/API/app/mailer after exact-SHA CI/staging checks, then enable the relevant flags. `node services/assessment-mailer/worker.mjs --once` runs one bounded processing cycle; without `--once` it polls until SIGINT/SIGTERM. Do not use real recipients for first validation. No launch or sending step was executed in this task.

## Operating gates

Before enablement, verify the approved relay's authenticated TLS handshake/certificate failure behavior and sender-domain authorization/SPF/DKIM/DMARC, use approved test inboxes, measure quota/rate limits and confirm all environment URLs/keyrings are isolated. Gmail is an optional configurable SMTP relay, not an assumed full-scale provider; its account-specific limits must not be treated as platform capacity. Configure aggregate quota/abuse enforcement before broad sending.

Alert on oldest due job age, repeated claim/control failures, `sending` lease expiry, unknown outcomes, failure rates/auth failures and queue depth. Logs emit only event/state categories, never recipients, raw responses, secrets or bodies. Deployable alert dashboards and sustained recovery/load certification are still open gates, not supplied by these log statements. Review unknown outcomes against relay logs before deciding whether to request a replacement. A disabled/failed host leaves durable work queued; rolling back the host must preserve the schema, immutable receipts and signing roots. Disabling queueing does not undo a message already handed to SMTP. Stop/drain hosts before rotating the worker secret; preserve original invitation roots for outstanding links.

Automated provider DSN/bounce ingestion, cryptographically authenticated event custody/deduplication, suppression/unsubscribe policy appropriate to transactional messages, delivery feedback, offboarding notifications, full retention/deletion/holds and cross-border approval remain required. No UI state claims inbox delivery, bounce processing or provider-certified TLS from the local sink test. Follow [RELEASE_GATES.md](RELEASE_GATES.md) and the unchanged full-service ledger.

## Local evidence

Nine Node transport/client/runtime tests and five mail API/template tests pass, including real SMTP envelope/MIME, 4xx/5xx rejection, post-DATA disconnection, bounded uncertain timeout, TLS configuration, unsafe-content stripping, report-only retries and graceful shutdown. The full 29-migration authority/race suite passes: queue receipt replay, bounded claims, one-shot begin, accepted/unknown/late receipts, cancelled invitation/withdrawn sender, unsent versus started lease recovery, exhausted attempts, reviewed replacement, immutable/private state and no membership mutation. Four-process queue/claim/begin/report/cancellation races prove one handoff authorization and one accepted receipt/audit.

Actual browser → production Edge/repository → PostgreSQL → real Node/Nodemailer → loopback SMTP → decoded MIME recipient link → recipient acceptance → Assessment-only workspace/bank creation passes. It includes lost queue reply/reload/retry, lost committed SMTP report with one send, Uzbek mail, future reminder cancellation after acceptance, unknown handoff with no automatic resend, reviewed duplicate-risk replacement/cancellation, five responsive widths and unchanged organization rows/scores. Canonical proof: four deliveries (one accepted, one unknown, two cancelled), one explicit replacement, one acceptance audit and two synthetic SMTP messages; one invitee membership/assignment/bank and zero organization memberships. Auth/PostgREST/minimal historical schema and privileged test-only clock advancement remain explicit fixtures. The SMTP sink is loopback plaintext via constructor-only test options and cannot relay; it does not certify hosted TLS/provider/inbox behavior.

CI source includes a separate Node 24 mail job with locked dependency installation/audit, protocol/API tests, actual-mail browser acceptance and screenshot artifacts. Remote exact-release CI has not been executed. Existing membership/invitation/QTI regressions remain separate gates.

Protocol references: [Nodemailer SMTP transport](https://nodemailer.com/smtp), [structured SMTP error fields](https://nodemailer.com/errors), [SMTP connection acceptance](https://nodemailer.com/extras/smtp-connection), [Google SMTP submission configuration](https://support.google.com/a/answer/176600?hl=en). These describe transport behavior, not evidence of this service's hosted readiness.
