# Atomic unused-voucher closure

Unpublished extension of draft PR215. Do not merge the combined draft or deploy
its recovery frontend before the reviewed backend and hosted canaries qualify.

The installed void action replaces voucher metadata, then separately disables
the linked mock code without checking that write. It can discard captured terms,
fail against immutable purchase protections, or leave a code usable after closure.

Migration 20261009148000 and the Partner Office adapter close unused stock through
one service-only transaction. Current center finance authority is checked under
the same tenant-before-inventory locks as redemption and admission. The original
purchase metadata survives. Mock token identity and unclaimed session/registration
state are checked before disabling the code. Voucher status, token status and an
immutable closure receipt commit together. Same-voucher retries return the first
closure, including its original reason. A claimed, redeemed or uncertain legacy
reference cannot be represented as a successful new closure.

This action does not refund a payment or wallet debit, release retained seat
reservations, revoke delivered access, or manufacture replacement inventory.
Financial settlement and a reviewed stock-release workflow remain required.
Retention rules, old-client UI, published source/gateway checks and owned hosted
closure canaries remain production gates. No production schema or payment
endpoint was changed for this candidate.

The first targeted native run passed 12 cases covering sixteen concurrent retries,
both linked writes, late-error and connection-loss rollback, races with redemption
and exam admission, evidence immutability, scope/current authority, retained stock
and funding, and application-role denial. All exclusively owned containers were
removed. Four new actual adapter cases passed; the complete voucher adapter file
passed 13 cases and the Edge entrypoint typechecked. Three further native cases
were then added for an already completed redemption, an already started exam,
and expired unused legacy stock; final full-suite evidence follows separately.

Read-only production inspection also confirmed that the installed non-Click
Academy settlement body matches the native fixture exactly, after trimming and
normalizing line endings: body SHA256
`a38d83604af206c55c66b480d99aba988920f5fa3e159ffa6f9adaeac88bce8d`.
Its actual owner is postgres and its security-definer flag is true. Complete
normalized function definition SHA256 is
`38139a6458cf21e425f4dff19d4985ce0499e8b3e905aeedbfb1373a04df3321`.
Native tests exercise the preserved body with a more restricted original owner;
fresh installed source/owner drift checks remain mandatory before migration.
