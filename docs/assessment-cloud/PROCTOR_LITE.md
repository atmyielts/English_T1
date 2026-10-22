# Proctor Lite

Status: implemented 2026-10-22. Proctor was resumed as **Proctor Lite**: monitoring that needs no paid or external infrastructure. It runs entirely on the existing Supabase project and Cloudflare free plan.

Live video, AI identity vendors and native desktop/phone clients are deliberately left out, and can be added later without changing this design.

## What an institution gets

| Capability | How it works | Infrastructure |
| --- | --- | --- |
| Browser integrity signals | Exam reports tab switches, leaving the window, fullscreen exits, copy/paste/cut, context menu, online/offline and now camera loss and restore. Events are spooled offline and delivered in order. | proctor Edge Function, Postgres |
| Webcam snapshots (new) | The policy sets an interval (off, 30 s, 1 min, 2 min, 5 min). Before starting, the candidate turns on the camera and takes an identity photo with their ID card. During the test, Exam takes one 320 px JPEG still per interval and uploads it with retry. No video or sound is recorded. | Private Supabase Storage bucket `proctor-snapshots` |
| Live status board | Active, paused or disconnected state, heartbeats, assignments and warn/pause/resume notices. There is no video. | proctor Edge Function |
| Human review | Assigned reviewers open cases, look at events and snapshots, and record findings (clear / confirmed / insufficient evidence) with a rationale. Agreeing findings at the policy quorum resolve the case. | Postgres |
| Senior decision (new) | When reviewers disagree after the full quorum has reported, a proctor manager who did not review the case decides it with a rationale (`case.adjudicate`). | Postgres |
| Candidate explanation (new) | After a case is resolved, a manager writes a candidate-facing explanation (`case.disclose`, once). The candidate sees it in Exam under **Integrity review**. Internal rationale and reviewer identities are never shown. | Postgres |

Nothing in Proctor changes answers or scores, and AI never decides. Assessment Cloud shows each sitting as **Monitored** or **Not monitored**, with a link into Proctor on the same institution. Policies are created and attached to sittings in Proctor.

**Modes that need what Lite leaves out** (`record_review`, `live`, camera/microphone/screen capture, `secure_desktop`, `center`, second camera) are only offered by the Proctor app when their service URLs are configured. The server's start guard still refuses them when they cannot launch.

## Snapshot storage, privacy and retention

**Upload is checked before anything is stored.** `proctor_snapshot_reserve` checks:
- the uploader is the session's candidate
- the policy asks for snapshots
- the kind and number are valid (number 0 is the identity photo)
- the capture time is plausible
- the size is at most 300 KB
- the upload rate stays within the policy interval, with headroom

Only then are the bytes written. A retry with the same picture reuses its slot; different content for a used slot is refused (`snapshot_conflict`). Exam keeps its numbering per session across reloads.

**Staff access.** Pictures are only served through 120-second signed links. Only proctor managers and staff assigned to the session can list them (`proctor_can_access`). The browser never sees storage paths.

**Retention.**
- Identity photos are kept for the policy's `identity_retention_days`; periodic stills for `recording_retention_days`.
- The hourly GitHub Action `proctor-snapshot-retention.yml` calls `POST /proctor/snapshots/internal/sweep` with the dedicated `PROCTOR_SNAPSHOT_SWEEP_SECRET`. It deletes the stored objects first, then marks the rows deleted.
- Sessions with an unresolved review case are kept until the case is resolved.

**Rows are immutable** except for the stored and deleted markers.

**The consent text shown to candidates is a draft** and needs the institution's legal review before real use. The same goes for retention periods for minors. These are policy decisions, not code.

## Deployment

- **Proctor app:** Pages project `schood-proctor` at `proctor.schood.online`, built by `deploy-pages.yml`, with the domain bound by `configure-assessment-domains.yml`.
- **Edge Function `proctor`:**
  - Needs `PROCTOR_ALLOWED_ORIGINS=https://proctor.schood.online,https://exam.schood.online`.
  - `PROCTOR_SNAPSHOT_SWEEP_SECRET` (at least 32 characters) must be set in both the function and the repository secrets for retention to run.
  - Recording, capture and live flags stay unset.
- **Migrations:** `20261022190000_proctor_snapshots.sql` (table, guarded RPCs, private bucket where Storage exists) and `20261022200000_proctor_adjudication.sql`. Both are additive; the existing `proctor_command` behaviour is delegated unchanged.

## Evidence

```powershell
node scripts/test-assessment-db.mjs
deno test --no-lock supabase/functions/proctor/
npm --workspace apps/exam run build
npm --workspace apps/proctor run build
```

**SQL tests:**
- `proctor-snapshots.integration.sql`: identity and periodic slots, retry and conflict, outsider/flood/future/oversize refusals, staff-only listing, policy without snapshots, retention from policy, hold while a case is open, immutability and no client grants.
- `proctor-adjudication.integration.sql`: no decision before quorum or on agreement, independence of the adjudicator, rationale required, a single decision, no findings after it, disclosure only after resolution and only once, candidate-only visibility without internal rationale, immutability.

**Handler tests:**
- `snapshot-handler.test.ts`: authorization before storage, JPEG/size/origin checks, no rewrite on retry, signed links without paths, the sweep secret, and storage deletion before forgetting rows.
- Proctor handler tests: manager-only decisions with bounded fields, and candidate-only outcomes.
