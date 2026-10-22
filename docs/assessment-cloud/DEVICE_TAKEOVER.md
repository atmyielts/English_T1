# Device takeover and late answers

Backlog item `TIME-02`. An exam attempt is written by one device at a time, through a lease with an increasing epoch. This page covers what happens when a candidate moves to another device.

## Rules

- **No silent takeover.** A different device can't take an attempt over without the candidate's confirmation. Expiry doesn't change that: if the other device's lease merely ran out, continuing elsewhere still needs a confirmation.
  - While the other lease is active, the server answers `device_lease_active`.
  - Once that lease has expired, it answers `device_takeover_required`.
  - The Exam app shows **Continue on this device?** for both.
- **A deliberate release is a handover.** If the old device released its lease (`lease.release`), another device continues without a takeover. The release is recorded (`released_at`, set only for the releasing device and epoch). A stale release replay can't mark a newer device's lease as released.
- **Confirmed takeover is immediate.**
  - `lease.acquire` with `takeover: true` moves the epoch forward at once, even while the old lease is still active.
  - It records an immutable `assessment_attempt_takeovers` row: devices, epochs, whether the old lease was active, and the last acknowledged answer sequence.
  - It writes an `attempt.device_takeover` audit event.
  - The new device gets `{from_epoch, previous_lease_active, acknowledged_sequence, saved_responses}`. A lost reply retried with the same key returns the same result.
- **The old device is told, not left guessing.** Its next save or re-acquisition fails with `device_lease_superseded`. The Exam app stops trying to re-acquire and shows **This exam moved to another device**, including how many answers on that device were not sent and were not accepted. Taking the attempt back is another explicit confirmation, recorded as another takeover.
- **Acknowledged answers are never lost; late ones are disclosed, not accepted.**
  - Answers saved before the takeover stay in the journal.
  - A lost reply of a committed answer still returns its original receipt from the new device.
  - Any answer from the old epoch after the takeover is refused.
- `takeover: true` when no takeover is needed is refused (`device_takeover_not_needed`). The client then falls back to a normal acquisition.

Migration `20261022170000_assessment_device_takeover.sql` is additive:
- It wraps `assessment_runtime_command`; the earlier one is kept as `assessment_runtime_command_before_takeover`.
- It adds `assessment_attempt_leases.released_at`, the takeover table and `assessment_attempt_superseded`.

The runtime Edge handler forwards `takeover` only as an explicit boolean. The coordinator passes it through unchanged.

## Verification

```powershell
deno test --no-lock packages/assessment-web/tests/takeover.test.ts packages/assessment-web/tests/runtime.test.ts
deno test --no-lock --allow-env supabase/functions/assessment-runtime/
node scripts/test-assessment-db.mjs
```

- `supabase/tests/assessment-device-takeover.integration.sql` covers:
  - refusal without confirmation, for both active and expired leases
  - a needless takeover
  - immediate confirmed takeover and its replay
  - the old device's late answer and re-acquisition refused as superseded
  - the committed answer's receipt surviving the takeover
  - released handover without a takeover
  - a stale release replay not marking the new lease released
  - explicit take-back
  - the epoch chain, audit events, immutability and no client table access
- The four-process race (`scripts/test-assessment-takeover-race.mjs`) has three devices confirm at once while the original device saves an answer. The epochs form one unbroken chain with one final holder. The racing answer is either saved and counted in the first takeover, or refused as superseded.
- The `--takeover` browser journey (`node scripts/test-assessment-appeals-browser.mjs --takeover`) uses the actual Exam app in two separate browser profiles. The laptop saves an answer. The phone is asked before continuing, then takes over and is told the saved answer is kept. The laptop's next answer is refused, and it shows **This exam moved to another device** with one unsent answer. The phone answers and submits. Only the two real answers count. Screenshots are in `output/playwright/takeover`.
- The media candidate journey's simulated lease loss now confirms **Continue on this device** instead of silently re-acquiring.
- Client tests model two devices sharing one attempt:
  - the second device asks first, and ticking doesn't retry by itself
  - the takeover result is reported
  - the superseded device stops re-acquiring and saving
  - take-back is explicit
  - a lost takeover reply is retried with the same key
  - an unnecessary takeover falls back to a normal acquisition

These checks are local evidence. Real devices on hosted identity are part of `TIME-01`.
