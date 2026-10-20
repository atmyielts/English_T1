# Private assignment audio candidate

Students can record or attach a response, retain an accessible transcript, recover
an uncertain upload after reload and listen to their own teacher feedback. Teachers
record feedback against the exact attempt they reviewed. A later student attempt
cannot inherit that feedback or an earlier grade. Earlier writing/files and grades
are retained in a private immutable snapshot when replaced by a recording.

Recordings use a private Storage bucket and AES-256-GCM encryption bound to the
server-derived object path. An existing generic file signer can expose only
ciphertext. Playback requires current authenticated enrollment or classroom grading
access, verifies the decrypted digest and checks current access again after download.
The browser receives a private binary response, never Storage coordinates or keys.
Private transcripts stay out of the legacy submission content column.

Written/file and audio submissions share one database attempt lock. Submitted audio,
its audit and attempt counter commit together; teacher feedback pins the expected
attempt. Browser drafts preserve actor, assignment, attempt, bytes, text and retry
key. Recording is explicit, cancellable and limited to three minutes; file uploads
are limited to 20 MiB. A transcript or equivalent written response is required.

Fresh full-schema qualification passed 13 stages, including actual concurrent
written/audio final attempts, revocation and blocked-expiry rollback. Eight focused
Deno transport/crypto tests and three browser tests passed. The browser tests use
synthetic media and mocked Edge responses. The corresponding schema evidence
contains no customer rows and verifies owned container/volume cleanup. Full local
Edge checks, build/lint and 2,894 localized phrases pass. The complete browser
run reached 180 passing cases and one optional benchmark skip; CI and hosted
acceptance are recorded separately.

Activation requires the protected exact-head PR checks and tracked Pages release,
then exactly the reviewed additive migration, one retained encryption key and a
source-preserving Academy overlay. Preserve existing optional SMTP/site settings.
The encryption key must never appear in source, logs, artifacts or a plaintext file.
Keep a protected Windows Credential Manager recovery copy when creating this key.
Retain recordings and immutable history on rollback; forward-repair the gateway.

This candidate does not close provider delivery/payment gates, Telegram bot voice
transport, the remaining cash handover/balance policy work, all shared-resource
authority or the full cross-service acceptance audit.
