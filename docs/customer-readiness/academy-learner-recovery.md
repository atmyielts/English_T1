# Learner classroom and quiz recovery

Changing classroom through browser history retained the previous classroom's
component state. A delayed curriculum request could replace the new course;
a delayed quiz start could open the previous classroom's attempt. Reloading an
open quiz discarded the answers even when the server resumed the same attempt.
All three failures were reproduced with delayed browser responses.

The learner classroom boundary now remounts for each authenticated actor,
Academy and classroom. Classroom and curriculum requests also retain visit and
request ownership. Obsolete completions cannot start follow-up reads, change
the current screen, or navigate to tuition checkout or a live session. Action
locks prevent duplicate quiz starts/submissions and classroom mutations.
Submitted answer, assignment and message fields freeze while pending.

Quiz answers are saved synchronously in sessionStorage for the authenticated
actor, Academy, classroom, quiz and server-issued attempt. Explicitly resuming
the same attempt restores only answers matching the published questions and
their types. Another attempt or classroom cannot recover those answers.
Failed submission keeps the draft; confirmed submission removes it. Sign-out
clears drafts and account changes clear other actors' drafts. Storage failures
leave the open answers available and display a localized warning. Drafts are
limited to 512,000 serialized characters and remain local to this browser tab.
They provide no cross-device or closed-tab recovery.

The client rejects a quiz resume response identifying another classroom.
The backend's existing quiz-attempt lookup and concurrent attempt creation
still need separate backend qualification; this frontend release does not
change their authorization, quota or transaction behavior.

Qualification requires the complete Academy suite, build, lint, localization,
production checks, exact-head CI, all Pages deployments, the published learner
regressions with synthetic accounts and blocked real API calls, and the
matching credentialed live smoke. This release has no migrations, function
deployments or secret changes.
