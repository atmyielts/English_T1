# Academy teacher lesson flow

## Product decision

Academy is presented as one connected learning-center workspace, not a collection of internal systems. The primary staff destinations follow daily jobs:

- Overview / Teaching today
- Classes & students
- Test prep & practice or Curriculum & grading
- Billing & finance

Messages and specialist administration remain available without competing with the primary navigation. Internal database terms such as entitlements, grants, capability keys, and Education OS are not used as customer-facing labels.

## Teacher journey

The teacher's Today view is generated from the existing timetable, assigned classroom, roster, curriculum, resources, and Telegram configuration.

1. The next assigned lesson is selected automatically.
2. The teacher sees the lesson, room, roster, objectives, resources, and proposed homework before class.
3. **Start lesson** creates one replay-safe lesson run and moves the scheduled session to `in_progress`.
4. Attendance is saved as one tenant-scoped batch. Existing attendance records are updated rather than duplicated.
5. The teacher marks curriculum objectives covered and can keep private notes.
6. **Finish lesson** closes the session, saves curriculum evidence, creates at most one homework assignment, and queues one notification per opted-in connected classroom group.

The Academy web workspace and Academy Telegram Mini App call the same shared teacher-flow service. The private `/today` bot command summarizes the teacher's actual next lesson when one Academy workspace is linked.

## Boundaries and safety

- A teacher can only open or mutate sessions where they are the primary teacher or a current staff assignee.
- Every relationship in `academy_teacher_lesson_runs` includes `academy_id`.
- Direct reads expose administrators' Academy records or the signed-in teacher's own runs; writes are service-role RPCs only.
- Start, attendance, finish, homework creation, audit, and Telegram notification use idempotency or deduplication keys.
- Private teacher notes are never included in Telegram delivery.
- Existing teacher Today remains the fallback while `VITE_ACADEMY_TEACHER_FLOW_V2` is false.

## Production activation

There is no staging environment. Activate in this order so the existing teacher experience remains usable throughout:

1. Merge through a reviewed feature branch after `npm run verify:prod` and Academy checks pass. The new teacher Today remains disabled by default.
2. Apply the additive migration with `supabase db push --linked` and confirm it with `supabase migration list --linked`.
3. Deploy `academy` and `academy-telegram` Edge Functions manually from the merged commit.
4. Exercise authenticated staff smoke checks for teacher day, start, attendance, finish, assignment, and Telegram delivery.
5. Set `VITE_ACADEMY_TEACHER_FLOW_V2=true` in the Academy Pages project and redeploy through CI.
6. Verify one real assigned teacher lesson on web and Telegram. If needed, set the flag back to `false`; the schema and Edge changes are additive and can remain deployed.

Do not enable the frontend flag before the migration and both Edge Functions are healthy.
