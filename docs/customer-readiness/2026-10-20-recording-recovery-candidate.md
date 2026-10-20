# Recording recovery and submission reporting candidate

An unfinished recording can become impossible to commit when its assignment is
archived, its attempts are exhausted, a student resubmits before teacher feedback,
or the teacher no longer has the classroom. Such reservations previously consumed
all three pending-upload slots permanently. The new private counter counts only
currently recoverable reservations and retains every older row, file and retry key.
Current legitimate pending uploads still consume slots; current write authority,
immutable committed history and the attempt limit are unchanged. A partial index
keeps the count scoped to pending rows for this institution and actor.

Browser draft writes now freeze pending file metadata and transcript across tabs.
Only the matching pending revision can release its lock after a definitive refusal.
Deletion compares the draft revision too, so a stale tab or older success cannot
erase a newer edit. Unknown results retain the original pending contents and nonce.
A definitive refusal permits downloading/discarding the local draft; it never
removes committed institutional media. Recording controls remain visible if the
refreshed attempt limit changes during capture, allowing explicit stop or cancel.

The live teacher screenshot also exposed a reporting error: resubmitted work was
labelled missing, while the submitted count advanced only after grading. The fix
counts submitted/resubmitted/late/graded/returned work as turned in. Resubmissions
with no score enter the grading queue and morning brief; returned work keeps its
returned state and does not become a new grading-backlog item. Grades and weighted
averages continue to require a real recorded score.

Fresh full-schema qualification passed 14 stages, including obsolete versus current
slots, a scoped teacher, revoked authority, existing audio attempt contention and
cash handover contention. Fixture transactions and owned containers are cleaned.
Browser regressions cover cross-tab freezing, definitive conflict recovery, a live
capture during refresh, and resubmitted/returned statistics. Protected CI, tracked
Pages, installed source/command checks and owned hosted acceptance remain separate.

No encryption key or other secret is written. No media/history is deleted. Global
branch-dependent workspaces, zero-balance policy, provider/funding evidence and the
remaining all-service acceptance are still separate open work.
