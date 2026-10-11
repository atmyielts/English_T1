# Learner course loading and focused quizzes

The learner Course previously started room, assignment, attendance and billing
requests on every section visit. A failed billing read appeared inside Course,
and the overview could claim that work was complete before assignments loaded.
The phone header placed five large statistics above the course. Opening a quiz
appended its questions below the course without moving keyboard focus.

Classroom sections now request only their required datasets. Successful and
pending reads are cached within the authenticated actor, Academy and classroom
boundary. Parent Refresh invalidates the cache, mutations invalidate affected
datasets, failed reads remain retryable, and obsolete section completions cannot
replace the current screen. Course can display independently of its resources
request. Optional layout settings have a two-second fallback deadline.

Course uses a compact header. Overview retains four compact statistics after
its data loads. Quiz questions open in a native modal dialog with a focused
heading, labeled answer fields and an explicit Back to course action. Back and
Escape preserve the attempt draft and restore the quiz button's focus. Storage
failure still permits returning to Course and resuming the same answers from
memory. Existing actor, classroom, attempt and question validation remains.

Browser coverage includes required-read counts, cache reuse and Refresh,
unrelated billing failure, delayed overview and obsolete section errors,
retry, draft recovery, storage failure and keyboard access at 320, 768, 1024
and 1440 pixels. Three regressions were reproduced on the preceding published
frontend with all real backend traffic mocked or blocked.

Release qualification requires exact-head CI, all Pages deployments, published
browser regressions and matching credentialed live smoke. Synthetic browser
checks establish frontend behavior; they do not establish a real enrolled quiz
mutation journey, backend attempt concurrency or representative customer
latency. There are no backend, schema, payment or secret changes in this release.
