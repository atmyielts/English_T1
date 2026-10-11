# Academy everyday layout and loading

## Customer behavior

The staff and student workspaces keep Schood's warm brown identity with a compact header, consistent controls, readable tables, and task content ahead of summary statistics. Phones use a Sections button rather than a horizontal navigation strip. Search filters only the sections already permitted for the current account; selecting a section or pressing Escape closes the mobile menu and restores keyboard focus.

Teachers see a compact class selector, selected lesson, curriculum, attendance, and lesson actions before the day's counts. Parents have a smaller child header, labelled child selector, readable tabs, and account tools in the header. Choosing another child returns to Overview. English, Uzbek, and Russian remain supported.

## Loading changes

- The teaching-day screen no longer requests the full `education_os` report before mounting. It uses its existing scoped `teacher_day` endpoint.
- Curriculum and grading no longer fetch the same operations report in both the parent and the section. The section continues to fetch its own report.
- Requested staff and parent screen code downloads alongside access checks; section data still waits for the existing account and academy authorization checks.
- The preparing screen no longer mounts an updates feed that is immediately replaced by the workspace's updates control. Parent updates are inline rather than covering content.

No API, database, permission, payment, or production configuration changes are included.

## Validation and limits

The browser regression reproduced the old teaching-day delay: a mock operations report taking eight seconds prevented Start lesson from appearing within four seconds. With the change, the usable lesson screen appeared in approximately 1.5 seconds in the same local browser setup. It made one teaching-day request, no operations-report request on entry, and one updates-feed request. Opening curriculum and grading still requests the operations report through the section. Its existing reload when the selected classroom changes remains a follow-up performance opportunity.

This is a controlled local response-delay test, not a production latency or Core Web Vitals measurement. Network conditions, actual database load, account size, and device speed still affect customers.

The existing role and workflow browser suite covers permission boundaries, teachers, students, guardians, admissions, finance, service requests, classrooms, reload recovery, and navigation. The responsive matrix checks 13 role lanes at six widths (390–1440 px), keyboard focus contrast, overflow, and accessible controls; localization checks representative staff, teacher, student, and guardian screens in Uzbek and Russian. Build, lint, localization, secret scan, and release scope checks are required before publication.

## Release

Frontend-only Academy release through a feature PR and normal CI. No manual backend follow-up. The preceding production main revision is `9db75ec1af613cd1395a5287e7b160c749889dcc`; Cloudflare Pages can restore its Academy deployment if needed. Hosted publication and signed-in customer timings require separate verification after merge.
