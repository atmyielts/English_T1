# Cash handover and audio refresh candidate

A cashbox can receive an initial opening count once. Each later shift requires
reviewing the immediately preceding closed shift and explicitly accepting custody
of the counted cash. The received amount, prior count, difference, reason, receiving
actor, time and predecessor remain immutable. Non-cash Click/card book entries do
not change the physical drawer count. Closing or receiving differences need a reason.

The cashbox serializes opening, movements, closing and handover before acquiring
resource locks. A stale predecessor or a second receiver cannot open another shift.
Current independent branch capability, business changes, audit and retry receipt
commit together. A failed receipt, blocked grant expiry or revoked access leaves no
new shift or custody audit. Old direct opening cannot bypass a prior shift.

Each permitted cashbox includes its actual latest predecessor independently of the
500-row history list. The new form waits for that metadata, requires acknowledgement
and preserves exact monetary strings plus the original captured payload after reload
or uncertain results. Existing closed shifts remain labelled as legacy history; no
backfill invents an old handover. Finance tabs reuse the existing compact controls.

Fresh captured-schema qualification passed 14 stages with verified container/volume
cleanup. Fixtures prove cash versus non-cash counts, one winning concurrent receiver,
receipts, expiry/revocation, private RPCs and latest-predecessor access beyond the
history limit. Three focused browser checks passed, including the existing exact
pending opening and the new handover reload/acknowledgement flow. The full pre-repair browser suite passed 183 cases with one optional benchmark
skipped; eight focused cases passed on the final audio-refresh repair. Mocked/local
checks are separate from protected CI, installed activation and owned hosted acceptance.

Hosted audio acceptance identified that invalidating assignment data unmounted the
recording panel during its refresh. This release keeps the existing panel and its
playback URL while fetching fresh results, and catches refresh errors through the
existing learner error surface. A delayed-response regression verifies playback
through that refresh. A separate phone test uses the published classroom sections
menu. These are frontend changes; the deployed audio gateway/key stay unchanged.

This release does not implement the remaining zero-balance policy, future vacation
scheduling, full shared-resource audit, provider/payment proof or all-service audit.
