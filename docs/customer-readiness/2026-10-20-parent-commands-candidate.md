# Resumed closeout: parent writes, history and delivery

The user resumed the remaining work and authorized a safe production release
on 2026-10-20. The earlier stopped-goal closeout remains a historical record.
This candidate does not close the original all-service audit.

Parent messages, support requests and notification preferences now use a
service-only database command. Account, child binding, consent expiry and
messaging capability are checked under locks. Business records, request events,
audit and payload-bound retry receipts commit together. Current authorization
is checked again on replay. Request classroom and charge references are bound
to the selected child. New pages pin the account across refresh/retry and keep
the retry identity after a failed response; older pages retain one-deploy
compatibility through the same transaction.

Twelve consent-filtered history sections have stable date/order plus ID keyset
paging. Parent pages offer Load more without mixing children or discarding
already loaded rows. Tests traverse 472 messages, including tied timestamps,
and check current permissions on subsequent pages.

The Academy worker now derives parent delivery destinations from the verified
parent rather than the student's Telegram account. Dispatch claims recheck
current consent, domain permission, recipient verification, preferences and
quiet hours. Claims serialize competing workers; provider completion and
attempt evidence commit together and replay without duplicating evidence.
Uncertain external outcomes are retained as failed with a review marker and
are not automatically resent. Already in-flight delivery cannot be cancelled
by later revocation. Unconfigured SMS is skipped. Email requires a matching
confirmed account address; Telegram requires the verified private chat.
Unbound guardian-targeted automation is skipped rather than sent to a student.

Local evidence: 96 captured-table database checks; 15 adapter/provider tests;
33 actual gateway dispatch and 33 pinned-transport checks. The complete
413-table captured-schema qualification passes eight stages, including real
Auth/business triggers, installed status constraints, consent-revocation
contention and expiry after a blocked parent insert. Owned containers and
volumes were removed. See `2026-10-20-parent-commands-schema.json`.
Build/lint and the 822-check product verification pass. Exact committed-head
CI, tracked deployment, installed source/command identity and owned hosted
acceptance are still required before calling this candidate deployed.

Remaining broader work: seven legacy import transaction/recovery paths,
shared-resource authority and email linking, operational/visual/performance
acceptance, all-service audit, real provider/payment qualification, and
reconciliation of any legacy parent sends already deferred in the central
Telegram queue. Assessment/proctor ownership remains separate. Dummy recipients
cannot prove external delivery or an actual Click settlement.
