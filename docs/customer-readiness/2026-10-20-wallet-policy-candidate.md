# Prepaid wallet policy candidate

The existing ledger is debt-positive: a zero balance can be a fully paid course.
This release adds an opt-in student/class policy with a chosen currency, an exact
low-credit alert threshold, an explicit shared institution-wallet acknowledgement
and an audited reason. No existing subscription, paid period or vacation changes.
Off and alert-only modes remain available. Freeze mode blocks new curriculum
access, online session entry, quiz starts, assignment uploads and learning progress
at zero credit. Billing, saved work, teacher grading and existing quiz completion
remain available. Current credit restores learning without changing pause dates.
Existing resource links and downloaded content cannot be recalled by a wallet.

The private status view computes current per-currency ledger credit. Account locks
serialize policy changes, ledger inserts and database learning checkpoints. Private
current-Auth student checks guard lesson/session access; database triggers cover
written/audio submissions, progress and quiz starts. Audio reservations check the
policy before allocating storage. Frozen reservations retain their original identity
and media while no longer consuming another class's pending-upload budget.

Configuration uses existing financial command authority, scope locks, immutable
receipts, exact money and post-write authority revalidation. A branch admin cannot
promote a cashier grant in another branch. Private tables/views/RPCs remain closed
to browser roles. Financial reads scope policy rows before bounding lists. Staff
see a maximum of twenty policy cards initially and can load more. The recorded
review does not preselect the acknowledgement. Pending settings and their exact
nonce survive reload. Student billing displays the current low-credit/paused notice.

Fresh complete-schema qualification passed fifteen stages, including injected
receipt failure, mixed branch capabilities, revoked receipt replay, correct-currency
credit restoration and real credit/debit account-lock contention. Owned fixture
containers and volumes were removed. Full local Edge/typecheck and 191 browser
cases passed with one optional benchmark skipped. Final focused wallet checks
cover the bounded list and exact reviewed settings. Required protected CI, tracked
Pages, source readback, installed rollback canaries and owned hosted acceptance are
separate release gates. No external funds or provider delivery are proved here.
