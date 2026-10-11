# Academy classroom loading and draft isolation

Classroom selection previously reran Academy-wide reports before requesting the selected classroom's work. The initial empty classroom selection also repeated the report load. Late classroom responses could replace newer work, while grading and attendance retained values from the previous classroom.

The workspace now starts Academy-wide and classroom requests independently. Academy reports reload on entry, explicit refresh, and successful mutations; selecting a classroom reloads its scoped work only. Rubrics become available independently of slow reports. Classroom results carry their Academy/classroom scope and a request generation, so superseded responses cannot become current data or clear the newer loading state.

Classroom changes reset assignment editing, grade, schedule, and attendance drafts. Attendance dates have separate draft scopes. The embedded curriculum workspace remounts for each classroom, and the operations workspace remounts for each Academy/role route. Classroom writes wait for current data; grading validates that the selected assignment and student belong to the current lists. A failed first classroom load leaves Refresh available. Mutation refreshes still reload both report and classroom data.

## Verification

- Browser regressions use controlled API responses, not customer accounts or production writes.
- With an eight-second report response, classroom assignments and the grade action become available within four seconds. The same test fails against the previous source.
- Rapidly switch through three classrooms, hold the middle response, then release it after the last classroom loads. The final classroom retains its assignments and cleared grade draft. The previous source fails this test.
- Fail the first classroom load, retry, change classrooms with a shared student, and save attendance. The request contains the new classroom and a fresh present status; successful save refreshes the reports as well.
- A failed initial rubric load disables grading while attendance stays usable; an explicit refresh restores grading after the rubric service recovers.

These checks establish browser request scheduling and scope correctness. Real customer network and Supabase response times still require separate measurement. No backend schema, grants, records, or provider budgets change in this release.
